'use strict';
/**
 * cli/nexus-cli.js — NEXUS Dynamic CLI Runtime
 * UUID: nexus-cli-runtime-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * The CLI that knows everything because the registry knows everything.
 * No hardcoded commands. All commands from component registry.
 * Grammar updates live when new systems register.
 *
 * Boot sequence:
 *   1. fetch /api/components/grammar → build trie
 *   2. POST /api/ui/register → get sessionId
 *   3. GET /events (SSE) → live grammar rebuild on component.registered
 *   4. Open REPL with tab completion from trie
 *
 * §CR-006: grammar owned by registry. CLI reads. Never writes.
 * §AX-004: CLI before UI. This is L2. Shell (L5) comes after.
 */

const http     = require('http');
const readline = require('readline');
const crypto   = require('crypto');

const ge  = require('../lib/grammar-engine');
const clr = require('../lib/cli-reasoning');

const MODULE_ID   = 'nexus-cli';
const VERSION     = '1.0.0';
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
      name:         'nexus-cli',
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

  // Resolve command
  const resolved = ge.resolve(trimmed);
  if (!resolved) {
    // Grammar engine couldn't resolve — try Qwen 0.5b reasoning layer
    const qwenAvail = await clr.isAvailable();
    if (qwenAvail) {
      process.stdout.write(c.dim('  ⟳ thinking…'));
      try {
        const grammar = ge.status();
        const tree    = ge._tree || {};
        const comps   = [];
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

    // Fall back to trie suggestions
    console.log(c.y(`  unknown: ${trimmed}`));
    const suggestions = ge.complete(trimmed.split(' ')[0]);
    if (suggestions.length) {
      console.log(c.dim(`  did you mean: ${suggestions.slice(0,4).join(', ')}`));
    }
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
  console.log(c.bold(c.c('  ⬡  NEXUS CLI  ')) + c.dim('v' + VERSION));
  console.log(c.dim('  connecting to ' + ORCH_URL));
  console.log('');

  // Fetch grammar
  try {
    const r = await ge.fetch(ORCH_URL);
    const s = ge.status();
    console.log(c.g('  ✓') + c.dim(' grammar loaded — ' + s.componentCount + ' commands, ' + s.aliasCount + ' aliases'));
  } catch(e) {
    console.log(c.y('  ⚠ grammar unavailable — ' + e.message));
    console.log(c.dim('  starting with empty command set. Is the orchestrator running?'));
  }

  // Register as UI
  await _register();

  // Connect SSE for live updates
  _connectSSE();

  console.log(c.dim('  type help for available commands, tab to complete'));
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
    // Non-interactive: nexus-cli gaps list
    run(args.join(' ')).then(() => process.exit(0)).catch(e => {
      console.error(e.message); process.exit(1);
    });
  } else {
    start();
  }
}
