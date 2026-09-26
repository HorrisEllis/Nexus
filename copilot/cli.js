'use strict';
/**
 * copilot/cli.js — NEXUS Unified Co-Pilot Console
 * (renamed from cli/nexus-cli.js — Phase 68, "cli.js Renamed and Expanded";
 *  moved from cli/co-pilot.js into copilot/ — consolidation pass — every
 *  other subsystem's CLI lives in its own folder and is wired into the
 *  unified dispatcher, see guardian/cli.js, cockpit/cli.js, cli/nexus.js's
 *  MODULE_CLI table. This file was the one exception.)
 * UUID: nexus-cli-runtime-v1-0000-4000-0000-000000000001
 * Version: 1.1.0
 *
 * Grammar-driven command runtime (unchanged from nexus-cli.js — every command
 * still comes from the live component registry, nothing hardcoded), now also
 * the canonical place to just talk to NEXUS: any input that isn't a known
 * command or `copilot`/`cp` call falls through to guardian/agents/co-pilot
 * (see _talkToCopilot) instead of dead-ending at "unknown command". Same
 * backend home-ui's floating console (#bot-bar) and cli/nexus-repl.js's
 * `copilot` command already talk to — this file can't share a literal
 * process with browser-side JS, but it shares the one real agent all three
 * surfaces are clients of.
 *
 * Boot sequence:
 *   1. fetch /api/components/grammar → build trie     ─┐ run together
 *   2. POST /api/ui/register → get sessionId          ─┘ (§FIX 2026-06-21:
 *      neither depends on the other; was sequential, up to ~16s of nothing
 *      before the prompt appeared if the orchestrator was slow/unreachable)
 *   3. GET /events (SSE) → live grammar rebuild on component.registered
 *   4. Open REPL with tab completion from trie — talking to co-pilot never
 *      waited on any of the above and still doesn't
 *
 * §CR-006: grammar owned by registry. CLI reads. Never writes.
 * §AX-004: CLI before UI. This is L2. Shell (L5) comes after.
 */

const http     = require('http');
const readline = require('readline');
const crypto   = require('crypto');

const ge  = require('../lib/grammar-engine');
const clr = require('../lib/cli-reasoning');

const MODULE_ID   = 'co-pilot';
const VERSION     = '1.1.0';
const ORCH_URL    = process.env.NEXUS_ORCH_URL || 'http://127.0.0.1:9000';
const PROMPT      = '\x1b[36m⬡\x1b[0m  ';

// ── Colors ────────────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  dim:    '\x1b[2m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  cyan:   '\x1b[36m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  blue:   '\x1b[34m',
  gray:   '\x1b[90m',
};

const c = {
  g:    s => C.green  + s + C.reset,
  c:    s => C.cyan   + s + C.reset,
  y:    s => C.yellow + s + C.reset,
  r:    s => C.red    + s + C.reset,
  dim:  s => C.dim    + s + C.reset,
  bold: s => C.bold   + s + C.reset,
  gray: s => C.gray   + s + C.reset,
};

// ── State ─────────────────────────────────────────────────────────────────────
let _rl        = null;
let _sessionId = null;
let _cliProvider = 'ollama'; // §BUILT 2026-09-08 — James: "default is ollama" — real, explicit CLI-session state, see the real /switch command below
let _sseReq    = null;
let _history   = [];

// ── HTTP helpers ───────────────────────────────────────────────────────────────
function _request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(ORCH_URL + path, {
      method,
      headers: {
        'Content-Type':  'application/json',
        'Content-Length': payload ? payload.length : 0,
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch(e) { resolve({ ok: false, error: 'parse error' }); }
      });
    });
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Register as UI session ─────────────────────────────────────────────────────
async function _register() {
  try {
    const r = await _request('POST', '/api/ui/register', {
      name:         'co-pilot',
      type:         'terminal',
      capabilities: ['commands', 'tab-completion', 'render'],
    });
    if (r.ok) {
      _sessionId = r.sessionId;
      console.log(c.dim(`  session: ${_sessionId.slice(0,8)}`));
    }
  } catch(e) {
    console.warn(c.dim('  (ui registry unavailable — continuing without session)'));
  }
}

// ── SSE connection for live grammar updates ───────────────────────────────────
function _connectSSE() {
  try {
    _sseReq = http.request(ORCH_URL + '/events', {
      method: 'GET',
      headers: { 'Accept': 'text/event-stream' },
    }, res => {
      let buf = '';
      res.on('data', chunk => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const event = JSON.parse(line.slice(5).trim());
            if (event.type === 'component.registered' || event.type === 'component.updated') {
              // Rebuild grammar live
              ge.rebuild(ORCH_URL).then(() => {
                _rl?.setPrompt(PROMPT);
              }).catch(() => {});
            }
          } catch(_) {}
        }
      });
      res.on('end', () => setTimeout(_connectSSE, 3000));
    });
    _sseReq.on('error', () => setTimeout(_connectSSE, 5000));
    _sseReq.end();
  } catch(_) {}
}

// ── Render result ─────────────────────────────────────────────────────────────
function _render(data, renderHint) {
  if (!data) return;

  if (renderHint === 'table' && Array.isArray(data)) {
    if (!data.length) { console.log(c.dim('  (empty)')); return; }
    const keys = Object.keys(data[0]).filter(k => !k.startsWith('_')).slice(0, 6);
    const widths = keys.map(k => Math.max(k.length,
      ...data.map(r => String(r[k] ?? '').slice(0, 40).length)));
    console.log('  ' + c.dim(keys.map((k,i) => k.padEnd(widths[i])).join('  ')));
    console.log('  ' + c.dim('─'.repeat(widths.reduce((s,w) => s+w+2, 0))));
    for (const row of data.slice(0, 20)) {
      const line = keys.map((k,i) => {
        const v = String(row[k] ?? '').slice(0, 40);
        const col = k === 'status' ? (v === 'open' ? c.y(v) : v === 'resolved' ? c.g(v) : v)
                  : k === 'severity' ? (v === 'critical' ? c.r(v) : v === 'high' ? c.y(v) : v)
                  : k === 'ok' ? (v === 'true' ? c.g(v) : c.r(v))
                  : v;
        return col.padEnd(widths[i] + (col.length - v.length));
      }).join('  ');
      console.log('  ' + line);
    }
    if (data.length > 20) console.log(c.dim(`  ... and ${data.length - 20} more`));
    return;
  }

  if (renderHint === 'panel' || typeof data === 'object') {
    const lines = JSON.stringify(data, null, 2).split('\n');
    for (const line of lines.slice(0, 40)) {
      console.log('  ' + c.dim(line));
    }
    if (lines.length > 40) console.log(c.dim(`  ... (${lines.length - 40} more lines)`));
    return;
  }

  console.log('  ' + String(data));
}

// ── Execute a command ─────────────────────────────────────────────────────────
// ── Talk to co-pilot ─────────────────────────────────────────────────────────
// Shared by the explicit `copilot`/`cp` command and exec()'s default fallback
// for plain conversational input that doesn't match a known command. Routed
// through the orchestrator like everything else in this file (see §UNIFY
// comment at the copilot command below) — this does NOT need grammar or
// UI-registration to have succeeded; it's an independent request.
async function _talkToCopilot(prompt, command) {
  try {
    const t0 = Date.now();
    // §MIG-01 fix 2026-06-28: was calling /api/guardian/copilot/prompt through
    // orchestrator — that proxy route was removed. Co-pilot is now its own
    // sovereign system at :3750. Call it directly.
    const CP_URL = process.env.COPILOT_URL || 'http://127.0.0.1:3750';
    const resp = await new Promise((resolve, reject) => {
      const body = JSON.stringify({
        prompt,
        channel:   'cli',
        sessionId: _sessionId || 'cli-session',
        provider:  _cliProvider, // §BUILT 2026-09-08 — the real /switch state, same field copilot/server.js already resolves via DEFAULT_PROVIDER
      });
      const u   = new URL(`${CP_URL}/api/prompt`);
      const req = require('http').request({
        hostname: u.hostname, port: u.port || 3750,
        path: u.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 30000,
      }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ text: d }); } });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('copilot timeout')); });
      req.write(body); req.end();
    });
    const d = resp;
    const ms = Date.now() - t0;
    if (d.denied) {
      console.log(c.r(`  ✗ RAID denied this: ${d.reason}`));
    } else if (d.ok === false) {
      console.log(c.r(`  ✗ ${d.error || 'co-pilot request failed'}`));
    } else {
      if (d.toolResult) {
        console.log(c.g('  ✓ tool executed:'));
        console.log('    ' + JSON.stringify(d.toolResult.result || d.toolResult, null, 2).split('\n').join('\n    '));
      } else if (d.response) {
        console.log('  ' + d.response);
      } else {
        console.log(c.dim('  No tool call made — chat-only response.'));
      }
      if (d.context) console.log(c.dim(`  (context: ${d.context.sections} section(s), ~${d.context.tokensUsed} tokens)`));
      console.log(c.dim(`  ${ms}ms`));
    }
  } catch(e) {
    console.log(c.r(`  error: Guardian/co-pilot offline: ${e.message}`));
  }
}

async function exec(input) {
  const trimmed = input.trim();
  if (!trimmed) return;
  if (trimmed === 'help' || trimmed === '?') { _showHelp(); return; }
  if (trimmed === 'exit' || trimmed === 'quit') { _exit(); return; }
  if (trimmed === 'status') {
    const s = ge.status();
    console.log(c.g('  ⬡ NEXUS grammar engine'));
    console.log(`    components: ${s.componentCount}  aliases: ${s.aliasCount}  ready: ${s.ready}`);
    return;
  }

  // copilot <prompt>  /  cp <prompt> [--cmd "<command, RAID-gated>"]
  // §UNIFY 2026-06-21: home-ui (ui/home/index.html) and cli/nexus-repl.js
  // both already talk to guardian/agents/co-pilot — this was the one of
  // the three "places to talk to NEXUS" that didn't yet. Routed through
  // the orchestrator (/api/guardian/copilot/prompt via _request), same as
  // every other command in this file goes through ORCH_URL — not a direct
  // guardian-port fetch like nexus-repl.js's version, so this stays
  // consistent with this file's own single request path rather than
  // adding a second one.
  if (trimmed === 'copilot' || trimmed === 'cp' ||
      trimmed.startsWith('copilot ') || trimmed.startsWith('cp ')) {
    const rest        = trimmed.replace(/^(copilot|cp)\s*/, '');
    const cmdFlagIdx  = rest.indexOf('--cmd');
    let prompt, command = null;
    if (cmdFlagIdx !== -1) {
      prompt  = rest.slice(0, cmdFlagIdx).trim();
      command = rest.slice(cmdFlagIdx + 5).trim().replace(/^["']|["']$/g, '');
    } else {
      prompt = rest.trim();
    }
    if (!prompt) {
      console.log(c.dim('  Usage: copilot <prompt>'));
      console.log(c.dim('         copilot <prompt> --cmd "<command to run, RAID-gated>"'));
      return;
    }
    await _talkToCopilot(prompt, command);
    return;
  }

  // §CONSOLIDATION 2026-07-30 (James: "the only cli should have co-pilot
  // available to talk to, and also every system and cli command that updates
  // dynamically"). Folded IN from the retired cli/nexus.js dispatcher: a
  // /system prefix passes through to that system's own CLI, so this one CLI
  // reaches EVERY system — alongside co-pilot talk (above) and the live
  // registry grammar (below). §10.3 one CLI, not competing entries.
  // §BUILT 2026-09-08 — James: "how about using copilot as the bridge
  // for ollama and guardian... like a railroad switch to switch tracks.
  // like default is ollama, then routing to chatgpt would switch to
  // guardian like a toggle switch." Real, explicit state — replaces
  // relying purely on lifeline's own confidence-based auto-escalation
  // (which is still the real fallback when this is left at 'auto') with
  // something a person can actually flip. Reuses the exact same real
  // provider mechanism already built for the TV-shell toggle earlier
  // this session (copilot/config.js's DEFAULT_PROVIDER resolution,
  // copilot/server.js's real payload.provider handling) — same field,
  // same backend, a second real front door onto it.
  if (trimmed === 'switch' || trimmed.startsWith('switch ')) {
    const target = trimmed.replace(/^switch\s*/, '').trim().toLowerCase();
    if (!target) {
      console.log(c.dim(`  current: ${_cliProvider}`));
      console.log(c.dim('  Usage: switch ollama | switch guardian | switch <agent: claude|chatgpt|gemini|perplexity> | switch auto'));
      return;
    }
    const GUARDIAN_AGENTS = ['claude', 'chatgpt', 'gemini', 'perplexity', 'deepseek'];
    if (target === 'ollama' || target === 'auto' || GUARDIAN_AGENTS.includes(target)) {
      _cliProvider = target;
    } else if (target === 'guardian') {
      _cliProvider = 'auto'; // real, already-established meaning: let guardian's own connected agents compete, same as the TV-shell toggle's guardian side defaulting to the first real agent
    } else {
      console.log(c.r(`  unknown target: ${target}`));
      console.log(c.dim('  Usage: switch ollama | switch guardian | switch <agent: claude|chatgpt|gemini|perplexity> | switch auto'));
      return;
    }
    console.log(c.g(`  ✓ switched — co-pilot now routes to: ${_cliProvider}`));
    return;
  }

  if (trimmed.startsWith('/')) {
    const [sysTok, ...rest] = trimmed.split(/\s+/);

    // §2026-07-30 (James: "tv-ui, the cli needs to also use it") — /tv drives the
    // tv-ui from the one CLI, via the same /api/ui surface co-pilot's UI tools
    // use. /tv spotlight <target> | /tv nerve on|off | /tv clear.
    if (sysTok === '/tv') {
      const [sub, arg] = rest;
      const uiPost = (p, body) => new Promise((resolve) => {
        const http = require('http');
        const data = Buffer.from(JSON.stringify(body || {}));
        const req = http.request({ hostname: process.env.NEXUS_UI_HOST || '127.0.0.1',
          port: process.env.NEXUS_UI_PORT || 3000, path: p, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }, timeout: 5000 },
          res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ ok: res.statusCode < 400, status: res.statusCode })); });
        req.on('error', e => resolve({ error: `tv-ui unreachable: ${e.message}` }));
        req.on('timeout', () => { req.destroy(); resolve({ error: 'tv-ui timeout' }); });
        req.write(data); req.end();
      });
      let r;
      if (sub === 'spotlight' && arg) r = await uiPost('/api/ui/spotlight/on', { target: arg, ttl: 8000 });
      else if (sub === 'nerve') r = await uiPost(`/api/ui/nerve/${arg === 'off' ? 'off' : 'on'}`, {});
      else if (sub === 'clear') r = await uiPost('/api/ui/spotlight/off', {});
      else { console.log(c.dim('  /tv spotlight <target> | /tv nerve on|off | /tv clear')); return; }
      console.log(r.error ? c.dim(`  ${r.error}`) : c.g(`  ✓ tv-ui: ${sub} ${arg || ''}`));
      return;
    }

    const MODULE_CLI = {
      '/guardian': 'guardian/cli.js',
      '/cockpit':  'cockpit/cli.js',
      '/forge':    'cockpit/cli.js',
      '/cortex':   'cortex/cortex.js',
      '/idearium': 'idearium/cli/index.js',
      '/nexus':    'cli/nexus.js',       // utility commands: status, jobs, watch, gaps, snr, tag, ...
      '/copilot':  'copilot/cli.js',
      '/cp':       'copilot/cli.js',
    };
    const rel = MODULE_CLI[sysTok];
    if (!rel) {
      console.log(c.dim(`  unknown system "${sysTok}" — known: ${Object.keys(MODULE_CLI).join(', ')}`));
      return;
    }
    const { spawnSync } = require('child_process');
    const p = require('path');
    const cliPath = p.join(__dirname, '..', rel);
    if (!require('fs').existsSync(cliPath)) { console.log(c.dim(`  CLI not found: ${rel}`)); return; }
    spawnSync(process.execPath, [cliPath, ...rest], { stdio: 'inherit', env: { ...process.env } });
    return;
  }
  if (!resolved) {
    // Grammar engine couldn't resolve — try Qwen 0.5b reasoning layer
    const qwenAvail = await clr.isAvailable();
    if (qwenAvail) {
      process.stdout.write(c.dim('  ⟳ thinking…'));
      try {
        // §CLI-FIX: was `ge._tree || {}` (always undefined, never exported)
        // and `comps = []` (hardcoded — no bulk-list route existed to fetch
        // from). Both fixed at the source (lib/grammar-engine.js's new
        // getAliases(), lib/component-registry.js's new bulk-list route) —
        // this just calls them instead of silently degrading every time.
        const tree    = { aliases: ge.getAliases() };
        const compsR  = await _request('GET', '/api/components');
        const comps   = compsR.components || [];
        const reasoning = await clr.resolve(trimmed, tree, comps, ORCH_URL);
        process.stdout.write('\r                    \r');

        if (reasoning.type === 'rephrase' && reasoning.command) {
          console.log(c.dim(`  → ${reasoning.command}`));
          await exec(reasoning.command);
          return;
        }

        if (reasoning.type === 'gap' && reasoning.proposal) {
          const p = reasoning.proposal;
          console.log(c.y(`  gap identified: ${p.id}`));
          console.log(c.dim(`  ${p.description}`));
          if (reasoning.agentCheck?.ok) {
            console.log(c.dim(`  confidence: ${p.confidence} — register this component? (y/n)`));
            // Prompt for confirmation
            const confirm = await new Promise(r => {
              _rl.question('  > ', answer => r(answer.trim().toLowerCase()));
            });
            if (confirm === 'y' || confirm === 'yes') {
              const reg = await _request('POST', '/api/components/register', p);
              if (reg.ok) {
                console.log(c.g(`  ✓ component registered: ${p.id}`));
                await ge.rebuild(ORCH_URL);
                console.log(c.dim('  grammar updated — try the command again'));
              } else {
                console.log(c.r(`  ✗ registration failed: ${reg.error || 'unknown'}`));
              }
            } else {
              console.log(c.dim('  skipped'));
            }
          } else {
            console.log(c.y(`  issues: ${reasoning.agentCheck?.issues?.join(', ')}`));
            console.log(c.dim('  human review required before registering'));
          }
          return;
        }
      } catch(e) {
        process.stdout.write('\r                    \r');
        console.warn(c.dim(`  (qwen: ${e.message})`));
      }
    }

    // §TALK 2026-06-21: was "unknown: <input>" + trie suggestions, full stop —
    // dead end for anything conversational. Grammar/Qwen already had their
    // shot above (rephrase into a known command, or surface a gap). If
    // neither matched, this almost certainly wasn't meant to be a system
    // command at all — it's just talking. Route it to the same co-pilot the
    // explicit `copilot`/`cp` command above uses, instead of making the
    // person learn a command word to have a conversation.
    await _talkToCopilot(trimmed, null);
    return;
  }

  // Parse params
  const { ok, parsed, errors } = ge.parseParams(resolved.remainder, resolved.params || []);
  if (!ok) {
    console.log(c.r('  param error:'));
    for (const e of errors) console.log(c.r(`    ${e}`));
    if (resolved.params?.length) {
      console.log(c.dim('  usage: ' + resolved.matched + ' ' +
        resolved.params.map(p => p.required ? `<${p.name}>` : `[--${p.name}]`).join(' ')));
    }
    return;
  }

  // Build route URL
  const component = await _fetchComponent(resolved.componentId);
  if (!component) {
    console.log(c.r(`  component not found: ${resolved.componentId}`));
    return;
  }

  const route  = component.route;
  let   path   = route.path;
  const method = route.method || 'GET';

  // Append query params for GET
  if (method === 'GET' && Object.keys(parsed).length) {
    const qs = new URLSearchParams(parsed).toString();
    path = path + (path.includes('?') ? '&' : '?') + qs;
  }

  // Dispatch
  try {
    const t0   = Date.now();
    const data = await _request(method, path, method !== 'GET' ? parsed : null);
    const ms   = Date.now() - t0;

    if (data.ok === false) {
      console.log(c.r(`  ✗ ${data.error || 'request failed'}`));
      return;
    }

    // Extract the most relevant data to render
    const renderHint = resolved.returns?.render || component.returns?.render || 'json';
    const payload    = data.components || data.rows || data.gaps ||
                       data.sessions   || data.results || data.faultClasses ||
                       data.failureModes || data;

    _render(payload, renderHint);
    console.log(c.dim(`  ${ms}ms`));

    // Track history
    _history.push({ input: trimmed, componentId: resolved.componentId, ts: Date.now() });
    if (_history.length > 50) _history.shift();

  } catch(e) {
    console.log(c.r(`  error: ${e.message}`));
  }
}

async function _fetchComponent(id) {
  try {
    const r = await _request('GET', '/api/components/' + encodeURIComponent(id));
    return r.component || null;
  } catch(_) { return null; }
}

// ── Help ──────────────────────────────────────────────────────────────────────
function _showHelp() {
  const s = ge.status();
  console.log('');
  console.log(c.bold('  ⬡ NEXUS CLI') + c.dim(' — ' + s.componentCount + ' commands available'));
  console.log('');
  console.log(c.dim('  Tab        complete command'));
  console.log(c.dim('  ↑↓         command history'));
  console.log(c.dim('  help / ?   this message'));
  console.log(c.dim('  status     grammar engine status'));
  console.log(c.dim('  exit       quit'));
  console.log('');
  console.log(c.dim('  examples:'));
  console.log(c.dim('    gaps                     list open gaps'));
  console.log(c.dim('    gaps list --status all   all gaps'));
  console.log(c.dim('    search --q "rate limit"  semantic memory search'));
  console.log(c.dim('    components               browse component registry'));
  console.log(c.dim('    status                   system status'));
  console.log(c.dim('    version                  version registry'));
  console.log('');
}

// ── REPL ──────────────────────────────────────────────────────────────────────
function _startRepl() {
  _rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
    prompt: PROMPT,
    completer: (line) => {
      const completions = ge.complete(line);
      return [completions, line];
    },
    historySize: 100,
  });

  _rl.setPrompt(PROMPT);
  _rl.prompt();

  _rl.on('line', async line => {
    const input = line.trim();
    if (input) {
      await exec(input);
    }
    _rl.prompt();
  });

  _rl.on('close', _exit);
}

function _exit() {
  // Heartbeat stop
  if (_sessionId) {
    _request('DELETE', '/api/ui/' + _sessionId).catch(() => {});
  }
  if (_sseReq) { try { _sseReq.destroy(); } catch(_) {} }
  console.log(c.dim('\n  ⬡ nexus cli closed\n'));
  process.exit(0);
}

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  console.log('');
  console.log(c.bold(c.c('  ⬡  NEXUS CO-PILOT  ')) + c.dim('v' + VERSION));
  console.log(c.dim('  connecting to ' + ORCH_URL));
  console.log('');

  // §FIX 2026-06-21: was two sequential awaits (grammar fetch, then UI
  // register), each with its own 8s timeout in _request — up to ~16s of
  // nothing before the prompt appeared if the orchestrator was slow or
  // unreachable. Neither depends on the other's result, so run them
  // together. This does NOT touch the copilot/cp command's own request —
  // that one talks straight to /api/guardian/copilot/prompt and was never
  // gated on grammar or registration succeeding in the first place.
  const [grammarResult] = await Promise.allSettled([
    (async () => {
      const r = await ge.fetch(ORCH_URL);
      const s = ge.status();
      console.log(c.g('  ✓') + c.dim(' grammar loaded — ' + s.componentCount + ' commands, ' + s.aliasCount + ' aliases'));
      return r;
    })(),
    _register(),
  ]);
  if (grammarResult.status === 'rejected') {
    console.log(c.y('  ⚠ grammar unavailable — ' + grammarResult.reason?.message));
    console.log(c.dim('  starting with empty command set — copilot chat still works without it'));
  }

  // Connect SSE for live updates
  _connectSSE();

  console.log(c.dim('  type help for commands, or just talk — plain input goes to co-pilot'));
  console.log('');

  _startRepl();
}

// ── Non-interactive exec (for scripts) ───────────────────────────────────────
async function run(commandString) {
  await ge.fetch(ORCH_URL).catch(() => {});
  await exec(commandString);
}

module.exports = { start, run, exec, MODULE_ID, VERSION };

// CLI entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length) {
    // Non-interactive: co-pilot gaps list
    run(args.join(' ')).then(() => process.exit(0)).catch(e => {
      console.error(e.message); process.exit(1);
    });
  } else {
    start();
  }
}
