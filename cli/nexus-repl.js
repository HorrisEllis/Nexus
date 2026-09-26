#!/usr/bin/env node
'use strict';
/**
 * cli/nexus-repl.js — NEXUS Interactive CLI REPL
 * UUID: nexus-repl-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Opened automatically by orchestrator in a new terminal window.
 * Also runnable manually: node cli/nexus-repl.js --repl
 *
 * §1.2  Every failure loud, specific, traceable
 * §2.3  All state observable — every command result is gated + logged
 * §5.1  Every command execution gets a UUID
 * §5.2  Talks to all systems via nexus-connect
 */

const readline  = require('readline');
const http      = require('http');
const path      = require('path');
const { randomUUID } = require('crypto');
// §PHASE-15-CLOSE: grammar-engine was referenced (loadGrammar(), _grammar) in
// `describe`, `caps`, and the boot sequence below but never required or
// defined — those commands threw ReferenceError. This mirrors the working
// pattern already proven in cli/nexus-cli.js: fetch the tree from
// orchestrator's /api/components/grammar once, cache it, resolve/complete
// from the cached trie everywhere else.
const ge = require('../lib/grammar-engine');

// ── Ports ─────────────────────────────────────────────────────────────────────
const PORTS = {
  orchestrator: parseInt(process.env.ORCHESTRATOR_PORT || '9000'),
  bridge:       parseInt(process.env.BRIDGE_PORT       || '9999'),
  cortex: 3748, guardian: 7820,
  idearium:     4800, emerge: 4242, ollama: 11434,
  intelligence: 3753,
};

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[90m',
  red:'\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m',
  blue:'\x1b[34m', magenta:'\x1b[35m', cyan:'\x1b[36m',
  signal:'#3ecf8e',
};
const $ = (col, s) => `${col}${s}${C.reset}`;
const ok  = s => `${C.green}✓${C.reset} ${s}`;
const err = s => `${C.red}✗${C.reset} ${s}`;
const SYS_COLORS = { guardian:C.magenta, cortex:C.cyan,
                    idearium:C.blue, emerge:C.green, orchestrator:C.green };

// ── HTTP helper ───────────────────────────────────────────────────────────────
function req(port, method, p, body, timeout = 6000) {
  return new Promise(resolve => {
    const uuid = randomUUID();
    const pl   = body ? JSON.stringify(body) : null;
    const r = http.request({
      hostname: '127.0.0.1', port, path: p, method,
      headers: {
        'Content-Type': 'application/json',
        'X-Nexus-Call-UUID': uuid,
        'X-Nexus-Source': 'nexus-repl',
        ...(pl ? { 'Content-Length': Buffer.byteLength(pl) } : {}),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, data: JSON.parse(d), uuid }); }
        catch { resolve({ ok: res.statusCode < 400, data: d, uuid }); }
      });
    });
    r.setTimeout(timeout, () => { r.destroy(); resolve({ ok:false, error:'timeout', uuid }); });
    r.on('error', e => resolve({ ok:false, error: e.message, uuid }));
    if (pl) r.write(pl);
    r.end();
  });
}

const GET  = (port, p) => req(port, 'GET', p);
const POST = (port, p, b) => req(port, 'POST', p, b);

// ── Gate wrapper — logs every step ────────────────────────────────────────────
async function gate(name, fn) {
  const uuid = randomUUID();
  const t0 = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    // Post to orchestrator ledger (fire-and-forget)
    POST(PORTS.orchestrator, '/api/ledger', {
      system: 'repl', type: `repl.${name}`,
      payload: { uuid, ms, success: true },
    }).catch(() => {});
    return result;
  } catch (e) {
    const ms = Date.now() - t0;
    POST(PORTS.orchestrator, '/api/ledger', {
      system: 'repl', type: `repl.${name}.failed`,
      payload: { uuid, ms, success: false, error: e.message },
    }).catch(() => {});
    throw e;
  }
}

// ── Command handlers ──────────────────────────────────────────────────────────

async function cmdStatus() {
  return gate('status', async () => {
    const d = await GET(PORTS.orchestrator, '/api/status');
    if (!d.ok) { console.log(err('Orchestrator offline')); return; }
    const systems = d.data.systems || {};
    // Also get registry for heartbeat data
    const reg = await GET(PORTS.orchestrator, '/api/registry').catch(()=>null);
    const registry = reg?.data?.registry || {};
    console.log(`\n${$(C.bold+C.cyan, 'NEXUS STATUS')}\n`);
    for (const [name, sys] of Object.entries(systems)) {
      const live = sys.status === 'online';
      console.log(`  ${live ? $(C.green,'●') : $(C.red,'○')} ${name.padEnd(12)} ${$(C.dim, sys.port?':'+sys.port:'')}`);
    }
    console.log('');
  });
}

async function cmdWake() {
  // §BUILT 2026-08-22 — James: "anything that has 'hey nexus' at the
  // beginning gets injected into co-pilot's cli.js, with the agent and
  // chatUrl, and account, so it can open a pipeline to talk." Real,
  // complete pipeline: subscribes to cortex's real /sse (built this same
  // session — confirmed dead before this, both this file and
  // cortex/cortex-v2.js were connecting to an endpoint that never
  // existed), filters specifically for nexus.wake.detected (cortex's
  // /api/meta/observe now checks every real message for the wake phrase —
  // every message already reaches that endpoint via the userscript's
  // already-working GM_xmlhttpRequest call), and on a real hit, relays the
  // request to co-pilot automatically and prints the real answer.
  console.log(`${$(C.bold+C.cyan, 'HEY NEXUS')}  ${$(C.dim, 'listening for the wake phrase from any connected agent tab — Ctrl+C to stop')}\n`);
  const r = http.request({ hostname: '127.0.0.1', port: 3748, path: '/sse', method: 'GET', headers: { Accept: 'text/event-stream' } }, res => {
    let buf = '';
    res.on('data', c => {
      buf += c.toString();
      const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) {
        if (!l.startsWith('data:')) continue;
        let d; try { d = JSON.parse(l.slice(5).trim()); } catch (_) { continue; }
        if (d.type !== 'nexus.wake.detected') continue;
        console.log(`${$(C.dim, new Date(d.ts).toTimeString().slice(0,8))}  ${$(C.green,'●')} wake from ${$(C.cyan, d.agent || 'unknown agent')}${d.account ? ' ('+d.account+')' : ''}`);
        console.log(`  ${$(C.dim, d.chatUrl || '')}`);
        console.log(`  ${$(C.bold, '›')} ${d.request}\n`);
        fetch(`http://127.0.0.1:${PORTS.guardian}/copilot/prompt`, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ prompt: d.request, contextOpts: { intent: d.request } }),
          signal: AbortSignal.timeout(20000),
        }).then(r => r.json()).then(resp => {
          const text = resp.text || resp.response || (resp.toolResult ? JSON.stringify(resp.toolResult.result || resp.toolResult, null, 2) : null);
          console.log(`  ${$(C.cyan,'co-pilot:')} ${text || $(C.dim,'(no answer field in response)')}\n`);
        }).catch(e => console.log(`  ${err('co-pilot relay failed: ' + e.message)}\n`));
      }
    });
    res.on('end', () => { console.log('stream ended'); process.exit(0); });
  });
  r.on('error', e => { console.log(err(`cortex offline: ${e.message}`)); process.exit(1); });
  r.end();
  process.on('SIGINT', () => { r.destroy(); console.log('\n'); process.exit(0); });
}

async function cmdStream() {
  // Watch cortex SSE
  const r = http.request({ hostname:'127.0.0.1', port:3748, path:'/sse', method:'GET', headers:{Accept:'text/event-stream'} }, res => {
    let buf='';
    res.on('data', c => { buf+=c.toString(); const lines=buf.split('\n'); buf=lines.pop(); for(const l of lines){ if(!l.startsWith('data:')) continue; try{const d=JSON.parse(l.slice(5).trim()); console.log(d.type, JSON.stringify(d).slice(0,80));}catch(_){} }});
    res.on('end', () => { console.log('stream ended'); process.exit(0); });
  });
  r.on('error', e => { console.log(`cortex offline: ${e.message}`); process.exit(1); });
  r.end();
  // Ctrl+C to exit
  process.on('SIGINT', () => { r.destroy(); console.log('\n'); process.exit(0); });
}

async function cmdBus(args) {
  return gate('bus', async () => {
    const sys = args[0] || '';
    const n   = parseInt(args[1] || '50');
    const d   = await GET(PORTS.orchestrator, `/api/bus${sys?'?system='+sys+'&n='+n:'?n='+n}`);
    if (!d.ok) { console.log(err('Orchestrator offline')); return; }
    const entries = d.data.entries || [];
    const gates   = d.data.gates   || [];
    console.log(`
${$(C.bold, 'SISO BUS LOG')} ${$(C.dim, '('+entries.length+' events · '+gates.length+' gates)')}
`);
    if (gates.length) console.log(`  ${$(C.dim,'Gates:')} ${$(C.cyan, gates.slice(0,8).join(', ')+(gates.length>8?' …':'' ))}`);
    console.log('');
    for (const e of entries.slice(0,30)) {
      const ts  = new Date(e.ts||0).toTimeString().slice(0,8);
      const col = sys_color[e.system||'orchestrator'] || C.dim;
      const clm = e.claimed ? $(C.green,'✓') : $(C.dim,'○');
      console.log(`  ${$(C.dim,ts)}  ${clm}  ${$(col,(e.system||'?').padEnd(12))}  ${$(C.reset,(e.type||'—').padEnd(40))}  ${$(C.dim,e.seq||'')}`);
    }
    console.log('');
  });
}

async function cmdWatchdog() {
  // Subscribe to orchestrator SSE and print live system state
  console.log(`${$(C.bold+C.cyan, 'WATCHDOG')}  ${$(C.dim, 'live system monitor — Ctrl+C to stop')}\n`);
  let lastTick = null;
  const r = require('http').request({
    hostname:'127.0.0.1', port:PORTS.orchestrator,
    path:'/sse', method:'GET',
    headers:{ Accept:'text/event-stream' },
  }, res => {
    let buf = '';
    res.on('data', c => {
      buf += c.toString();
      const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) {
        if (!l.startsWith('data:')) continue;
        try {
          const d = JSON.parse(l.slice(5).trim());
          if (d.type === 'orchestrator.watchdog.tick' && d.systems) {
            // Clear and reprint
            process.stdout.write('\x1b[2J\x1b[H'); // clear screen
            console.log(`${$(C.bold+C.cyan, '⬡  NEXUS WATCHDOG')}  ${$(C.dim, new Date().toTimeString().slice(0,8))}\n`);
            for (const [name, info] of Object.entries(d.systems)) {
              const dot = info.online ? $(C.green,'●') : $(C.red,'○');
              const col = sys_color[name] || C.dim;
              const ms  = info.ms ? $(C.dim, info.ms+'ms') : '';
              console.log(`  ${dot}  ${$(C.bold+col, name.padEnd(14))}  ${info.online?$(C.dim,'online'):$(C.red,'OFFLINE')}  ${ms}`);
            }
            const offline = Object.values(d.systems).filter(s=>!s?.online).length;
            console.log('');
            if (offline > 0) console.log($(C.red, `  ⚠ ${offline} system(s) offline`));
            else console.log($(C.green, '  ✓ all required systems online'));
            console.log($(C.dim, '\n  Ctrl+C to exit'));
          }
          if (d.type === 'orchestrator.system.online' || d.type === 'orchestrator.system.offline') {
            const on = d.type.endsWith('.online');
            console.log(`  ${on?$(C.green,'▲'):$(C.red,'▼')}  ${d.systemId} → ${on?$(C.green,'ONLINE'):$(C.red,'OFFLINE')}`);
          }
        } catch(_) {}
      }
    });
    res.on('end', () => process.exit(0));
  });
  r.on('error', e => { console.log(err('Orchestrator offline: '+e.message)); process.exit(1); });
  r.end();
  process.on('SIGINT', () => { r.destroy(); console.log('\n'); process.exit(0); });
}

function cmdHelp() {
  console.log(`
${$(C.bold+C.green, '⬡  NEXUS REPL')}  v1.0  — NEXUS CLI console

${$(C.bold, 'Commands')}
  status              All systems health
  jobs [n]            Guardian job list (default 20)
  events [n]          Cortex event log
  gaps                All open gaps (idearium + cortex)
  ideas               Idearium ideas
  idea <text>         Create idea
  dispatch [prov] <p> Dispatch job to provider (default: chatgpt)
  requests [status]   Bridge request queue (default: pending)
  session             Render SESSION.md from live system state
  ledger [sys] [n]    System event ledger
  snr                 Idearium SNR
  diagnose [sys]       Run full system diagnostic (all or one system)
  watchdog / wd        Live system monitor (Ctrl+C to stop)
  bus [sys] [n]        SISO bus log (all systems)
  watch               Live event stream (Ctrl+C to stop)
  ui                  Open orchestrator UI in browser
  help                This message
  chat <prompt>       Talk to qwen2.5-coder:1.5b directly (streaming, no browser tab)
  ask <prompt>        Alias for chat
  forge <prompt>      Dispatch a forge job via guardian RAID (picks best provider)
  heal [gap-uuid]     Trigger HEAL_REQUESTED for a gap (no arg = list open gaps)
  snapshot [msg]      Take a Cortex snapshot
  describe <comp>     Show component descriptor from registry
  caps [filter]       List all grammar commands (tab-completable)
  phases [filter]     Show NEXUS phase map (v0.7.5)
  context             Show current system context (what Ollama knows about NEXUS)
  intents             Show the intent map — every action with CLI/API/purpose
  artifacts [query]   Search built artifacts before generating new ones
  chatlog [n]         Browse logged AI conversations
  push <file>         Push a file to NEXUS (auto-routed by extension)
  push <file> --peer <id>  Push to local + remote peer
  exit / quit / q     Exit

${$(C.bold, 'Systems')}
  ${$(C.yellow, 'bridge   :9999')}   trust relay, request queue, identity
  ${$(C.cyan,'cortex   :3748')}   source of truth, 28 JAA tables
  ${$(C.magenta,'guardian :7820')}   AI orchestration, job queue
  ${$(C.blue,'idearium :4800')}   idea OS
  ${$(C.green,'emerge   :4242')}   emerge IDE
  ${$(C.green,'orch     :9000')}   orchestrator (this)
`);
}

async function cmdUI() {
  const { exec } = require('child_process');
  const url = `http://localhost:${PORTS.orchestrator}`;
  const cmds = [
    `start ${url}`,           // Windows
    `open ${url}`,            // macOS
    `xdg-open ${url}`,        // Linux
    `sensible-browser ${url}`,// Debian/Ubuntu
  ];
  for (const cmd of cmds) {
    try { exec(cmd); console.log(ok(`Opening ${url}`)); return; } catch(_) {}
  }
  console.log(`${$(C.dim, 'Open manually:')} ${url}`);
}

// ── REPL loop ─────────────────────────────────────────────────────────────────
const HISTORY = [];
let histIdx = -1;

// ── Grammar engine cache (§PHASE-15-CLOSE) ──────────────────────────────────
// Lazily fetched once, reused by describe/caps/tab-completion/boot. Failure
// is non-fatal everywhere it's called — every call site already treats a
// null return as "grammar unavailable" rather than throwing.
let _grammar = null;
let _descriptorsRegistered = false;
async function loadGrammar() {
  if (_grammar && ge.status().ready) return _grammar;
  try {
    await ge.fetch(`http://127.0.0.1:${PORTS.orchestrator}`);
    _grammar = ge;
    // Phase 36: register nexus-repl's own commands into component-registry
    // so other grammar-engine consumers (nexus-cli.js, future Phase 40.5
    // CLI projection) can discover/resolve them too. Fire-once, fire-and-
    // forget — registration failing must never block the REPL itself from
    // working exactly as it did before this existed.
    if (!_descriptorsRegistered) {
      _descriptorsRegistered = true;
      require('./nexus-repl-descriptors')
        .registerAll(`http://127.0.0.1:${PORTS.orchestrator}`)
        .catch(() => {});
    }
    return _grammar;
  } catch (e) {
    _grammar = null;
    return null;
  }
}

async function dispatch(line) {
  const parts = line.trim().split(/\s+/);
  const cmd   = parts[0].toLowerCase();
  const args  = parts.slice(1);

  // Local-only commands that don't go through /cli/exec
  switch (cmd) {
    case 'diagnose': case 'diag': {
      const sys = args[0] || '';
      const { spawnSync } = require('child_process');
      spawnSync('node', ['cli/diagnose.js', ...(sys?[sys]:[])],
        { cwd: require('path').join(__dirname,'..'), stdio:'inherit', encoding:'utf8' });
      return;
    }
    case 'watch': await cmdWatch(); return;
    case 'watchdog': case 'wd': await cmdWatchdog(); return;
    case 'wake': await cmdWake(); return;
    case 'ui': await cmdUI(); return;
    case 'help': case '?': cmdHelp(); return;
    case 'status': await cmdStatus(); return;  // multi-system, local
    case 'push': {
      // nexus push <filepath>  — push a file to NEXUS, auto-routed by extension
      // nexus push <filepath> --peer <peerId>  — push to remote peer too
      const filepath = args[0];
      if (!filepath) { log('Usage: push <filepath> [--peer <peerId>]'); return; }
      const peerIdx = args.indexOf('--peer');
      const peerId  = peerIdx !== -1 ? args[peerIdx + 1] : null;
      const { readFileSync, existsSync } = require('fs');
      if (!existsSync(filepath)) { log('File not found: ' + filepath); return; }
      const content  = readFileSync(filepath, 'utf8');
      const filename = require('path').basename(filepath);
      log('Pushing ' + filename + '…');
      try {
        const route = peerId ? '/api/push/peer/' + peerId : '/api/push/file';
        const r = await POST(9000, route, { filename, content, source: 'cli-push' });
        if (r.ok) {
          log('✓ ' + filename + ' → ' + (r.label || r.destination || 'ok'));
          if (r.remote) log('  peer: ' + (r.remote.ok ? '✓' : '✗ ' + r.remote.error));
        } else {
          log('✗ ' + (r.error || 'push failed'));
        }
      } catch(e) { log('✗ ' + e.message); }
      return;
    }

    case 'chat': case 'ask': case 'q': {
      // Direct Qwen/Ollama streaming chat — no NCP, no browser tab required
      // Default: qwen2.5-coder:1.5b (the NEXUS reasoning layer)
      const chatPrompt = args.join(' ').trim();
      if (!chatPrompt) { log('Usage: chat <prompt>  — talks to qwen2.5-coder:1.5b directly'); return; }
      try {
        const healthR = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
        if (!healthR.ok) throw new Error('not ok');
        const health = await healthR.json();
        const models = (health.models || []).map(m => m.name || m.model || '').filter(Boolean);
        if (!models.length) {
          log('✗ Ollama running but no models. Run: ollama pull qwen2.5-coder:1.5b');
          return;
        }
        // Prefer the shared, real default model (matches co-pilot's own
        // real dispatch — huihui_ai/qwen2.5-coder-abliterate:3b as of
        // 2026-08-23), then any qwen2.5-coder variant, then any qwen,
        // then mistral, then first available. §CONFIG 2026-08-23 —
        // NEXUS_OLLAMA_MODEL is kept as a real, MORE specific override:
        // this REPL's "reasoning layer" is a genuinely separate dispatch
        // path from co-pilot's, and an operator who wants a different
        // model just for this REPL still can, without touching the
        // shared default everything else uses.
        const preferred = process.env.NEXUS_OLLAMA_MODEL || require('../ollama/config.js').DEFAULT_MODEL;
        const useModel  = models.find(m => m === preferred)
          // §FIXED 2026-08-23 — was startsWith('qwen2.5-coder'), which
          // never matches huihui_ai/qwen2.5-coder-abliterate:3b (it
          // starts with 'huihui_ai/', not 'qwen2.5-coder'). A real,
          // installed match for the exact model family would have
          // silently fallen through to 'any qwen' or worse — checked by
          // testing the real string, not assumed from the old tag's
          // shape still applying.
          || models.find(m => m.includes('qwen2.5-coder'))
          || models.find(m => m.startsWith('qwen'))
          || models.find(m => m.startsWith('mistral'))
          || models[0];
        if (useModel !== preferred) log($(C.dim, `ℹ using '${useModel}' (set NEXUS_OLLAMA_MODEL to override)`));
        process.stdout.write(`${$(C.dim,'→')} ${$(C.cyan, useModel)}${$(C.dim,' ▸')} `);

        // Streaming — tokens appear as they generate
        const r = await fetch('http://127.0.0.1:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: useModel,
            prompt: chatPrompt,
            system: 'You are NEXUS — a sovereign AI coding assistant. Be concise, technical, and precise. You operate inside NEXUS v0.7.5.',
            stream: true,
          }),
          signal: AbortSignal.timeout(180000),
        });
        if (!r.ok) throw new Error('Ollama generate failed: ' + r.status);
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let totalTokens = 0;
        console.log(''); // newline after the model name
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value);
          for (const line of chunk.split('\n').filter(Boolean)) {
            try {
              const d = JSON.parse(line);
              if (d.response) process.stdout.write(d.response);
              if (d.eval_count) totalTokens = d.eval_count;
              if (d.done) {
                console.log(`\n${$(C.dim, `[${totalTokens} tokens · ${useModel}]`)}`);
                // Log to cortex
                fetch('http://127.0.0.1:3748/api/event', {
                  method: 'POST', headers: {'Content-Type':'application/json'},
                  body: JSON.stringify({ type:'cli.chat', source:'nexus-repl',
                    payload:{ model:useModel, tokens:totalTokens, promptLen:chatPrompt.length } })
                }).catch(()=>{});
              }
            } catch(_) {}
          }
        }
      } catch(e) {
        if (e.message?.includes('ECONNREFUSED') || e.message?.includes('fetch failed')) {
          log(err('Ollama not running. Start: ollama serve'));
          log($(C.dim, 'Then pull: ollama pull qwen2.5-coder:1.5b'));
        } else {
          log(err('Ollama: ' + e.message));
        }
      }
      return;
    }

    case 'describe': case 'desc': {
      // describe <component-id> — show component descriptor from grammar/registry
      const compId = args.join(' ').trim();
      if (!compId) { log('Usage: describe <component-id>\n  e.g. describe cortex.healer'); return; }
      try {
        const r = await fetch(`http://127.0.0.1:${PORTS.orchestrator}/api/components/${encodeURIComponent(compId)}`,
          { signal: AbortSignal.timeout(3000) });
        if (!r.ok) throw new Error('not found');
        const d = await r.json();
        const comp = d.component || d;
        console.log(`\n${$(C.bold+C.cyan, comp.componentId || compId)}`);
        console.log(`  ${$(C.dim,'type')}      ${comp.type || '—'}`);
        console.log(`  ${$(C.dim,'tier')}      ${comp.tier ?? '—'}`);
        console.log(`  ${$(C.dim,'maxLevel')}  L${comp.resolution?.max_level ?? comp.maxLevel ?? '—'}`);
        console.log(`  ${$(C.dim,'axioms')}    ${(comp.axioms||[]).join(', ') || '—'}`);
        console.log(`  ${$(C.dim,'deps')}      ${(comp.deps||[]).join(', ') || '—'}`);
        if (comp.capabilities?.length) {
          console.log(`\n  ${$(C.bold,'capabilities:')}`);
          for (const cap of comp.capabilities) {
            console.log(`    ${$(C.green, cap.verb)} ${$(C.cyan, cap.noun)}  ${$(C.dim, cap.description || '')}`);
          }
        }
        console.log('');
      } catch(e) {
        // Try grammar engine lookup
        const g = await loadGrammar();
        if (g) {
          const resolved = g.resolve(compId);
          if (resolved) {
            log(`Grammar: ${resolved.componentId} (matched: "${resolved.matched}")`);
          } else {
            log(err(`Component not found: ${compId}`));
          }
        } else {
          log(err(`Component not found: ${compId} (grammar unavailable)`));
        }
      }
      return;
    }

    case 'caps': case 'capabilities': {
      // caps [component] — list capabilities from grammar engine
      const g = await loadGrammar();
      if (!g) { log(err('Grammar engine unavailable — is orchestrator running?')); return; }
      const filter = args.join(' ').toLowerCase();
      const st = g.status();
      console.log(`\n${$(C.bold+C.cyan,'Grammar tree')}  ${$(C.dim, st.componentCount + ' commands · ' + st.aliasCount + ' aliases')}\n`);
      // Get full grammar tree from orchestrator
      try {
        const r = await fetch(`http://127.0.0.1:${PORTS.orchestrator}/api/components/grammar`,
          { signal: AbortSignal.timeout(3000) });
        if (r.ok) {
          const d = await r.json();
          const tree = d.tree || {};
          let count = 0;
          function walkTree(node, prefix) {
            if (!node) return;
            if (node.componentId) {
              if (!filter || node.componentId.includes(filter) || prefix.includes(filter)) {
                const params = (node.params||[]).map(p => `<${p.name}${p.required?'':' ?'}>`).join(' ');
                console.log(`  ${$(C.cyan, prefix.padEnd(30))} ${$(C.dim, '→')} ${$(C.yellow, node.componentId)} ${$(C.dim, params)}`);
                count++;
              }
            }
            for (const [key, child] of Object.entries(node.children || {})) {
              walkTree(child, prefix ? prefix + ' ' + key : key);
            }
          }
          walkTree(tree, '');
          if (!count) log($(C.dim, `No commands matching '${filter}'`));
        }
      } catch(e) { log(err(e.message)); }
      console.log('');
      return;
    }

    case 'phases': {
      // phases [filter] — show phase map from blueprint builder data
      const filter = args.join(' ').toLowerCase();
      const PHASE_DATA = [
        {n:'0–9,22–26,45,46', name:'Foundation + RAID + Intent + Case Library', status:'complete'},
        {n:'10', name:'Constitutional AI',            status:'next'},
        {n:'14', name:'Hot Module Loader',            status:'pending'},
        {n:'15', name:'Grammar Engine Wiring',        status:'pending'},
        {n:'17', name:'Userscript Heartbeat ♥',       status:'pending'},
        {n:'27', name:'System State VM',              status:'pending'},
        {n:'31', name:'Grammar ↔ Intent',             status:'pending'},
        {n:'32', name:'Per-File Sigma Versioning',    status:'pending'},
        {n:'33', name:'PID Isolation + State Cache',  status:'pending'},
        {n:'35', name:'Quick Notes Sync',             status:'pending'},
        {n:'36', name:'Dynamic CLI Commands',         status:'pending'},
        {n:'40', name:'Component Descriptor',         status:'pending'},
        {n:'11', name:'Reflection Engine',            status:'pending'},
        {n:'34', name:'API_SURFACE_FAILURE',          status:'pending'},
        {n:'37', name:'Userscript Rebuild',           status:'pending'},
        {n:'40.5',name:'Descriptor-Driven CLI',       status:'pending'},
        {n:'41', name:'Compiler Knowledge Layer',     status:'pending'},
        {n:'12', name:'User Model: Hypotheses',       status:'pending'},
        {n:'16', name:'Idearium↔Repo prereq',         status:'superseded'},
        {n:'42', name:'Blueprint: Loop Closes',       status:'pending'},
        {n:'13', name:'Autonomous Loop',              status:'pending'},
        {n:'28', name:'Build From Inside',            status:'pending'},
        {n:'38', name:'Unified Pipeline',             status:'pending'},
        {n:'44', name:'Resolution Spectrum',          status:'pending'},
        {n:'39', name:'Realtime Sync',                status:'pending'},
        {n:'43', name:'Architect as UI Builder',      status:'pending'},
        {n:'29', name:'Topology View',                status:'pending'},
        {n:'30', name:'Time-Travel Debugging',        status:'pending'},
      ];
      const filtered = filter ? PHASE_DATA.filter(p =>
        p.name.toLowerCase().includes(filter) || p.n.toString().includes(filter) || p.status.includes(filter)
      ) : PHASE_DATA;
      console.log(`\n${$(C.bold+C.cyan,'NEXUS PHASE MAP')}  v0.7.5  ${$(C.dim, filtered.length + '/' + PHASE_DATA.length + ' shown')}\n`);
      const complete = PHASE_DATA.filter(p=>p.status==='complete').length;
      const next     = PHASE_DATA.filter(p=>p.status==='next').length;
      const pending  = PHASE_DATA.filter(p=>p.status==='pending').length;
      console.log(`  ${$(C.green,'■')} ${complete} complete  ${$(C.cyan,'▶')} ${next} next  ${$(C.dim,'□')} ${pending} pending\n`);
      for (const p of filtered) {
        const icon = p.status==='complete' ? $(C.green,'✓') :
                     p.status==='next'     ? $(C.cyan,'▶') :
                     p.status==='superseded'? $(C.yellow,'~') : $(C.dim,'·');
        console.log(`  ${icon} ${String(p.n).padEnd(8)} ${p.name}`);
      }
      console.log('');
      return;
    }

    case 'intel': case 'intelligence': {
      // §WIRED 2026-08-22 — James: "fully extensive commands for all of
      // it, dynamic list." Real, specific subcommands, each mapped to a
      // real, already-tested endpoint on intelligence/server.js — not a
      // generic exec route (cortex's own /api/cli/exec is an intentional,
      // honest 501 for that exact reason, confirmed by reading it).
      const sub = args[0];
      const base = `http://127.0.0.1:${PORTS.intelligence}`;
      try {
        if (!sub || sub === 'commands') {
          const r = await fetch(`${base}/api/commands`); const d = await r.json();
          console.log($(C.bold, 'real, dynamic command list:'));
          (d.commands || []).forEach(c => console.log(`  ${$(C.cyan, c.route.method.padEnd(4))} ${c.route.path.padEnd(30)} ${$(C.dim, c.description)}`));
          return;
        }
        if (sub === 'patterns') {
          const r = await fetch(`${base}/api/intelligence/patterns`); const d = await r.json();
          console.log(`${d.total} real crystallised pattern(s)`);
          (d.patterns || []).slice(0, 20).forEach(p => console.log(`  ${$(C.dim, p.patternType)} ${p.description}`));
          return;
        }
        if (sub === 'cfr') {
          const r = await fetch(`${base}/cfr/field`); const d = await r.json();
          console.log($(C.bold, 'real CFR field state:'));
          console.log(`  coherence=${d.coherence}  friction=${d.friction}  resonance=${d.resonance}  entropy=${d.entropy}`);
          return;
        }
        if (sub === 'status') {
          const r = await fetch(`${base}/api/intelligence/status`); const d = await r.json();
          console.log(JSON.stringify(d, null, 2));
          return;
        }
        if (sub === 'framework') {
          const name = args.slice(1).join(' ');
          if (!name) { console.log('Usage: intel framework <name>'); return; }
          const r = await fetch(`${base}/api/framework/create`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ name, agent: 'cli' }),
          });
          const d = await r.json();
          console.log(d.ok ? ok(`real framework written → ${d.outPath}`) : err(d.error));
          return;
        }
        // §BUILT — CLI surface for the previously-unwired submodule routes.
        if (sub === 'liminal') {
          const text = args.slice(1).join(' ');
          if (!text) { console.log('Usage: intel liminal <text>'); return; }
          const r = await fetch(`${base}/api/intelligence/liminal/analyze`, {
            method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ input: text }),
          });
          const d = await r.json();
          console.log(`${d.count || 0} gap signal(s):`);
          (d.signals || []).slice(0, 20).forEach(s => console.log(`  ${$(C.dim, s.type)} ${s.label || s.description || ''} ${$(C.dim, '('+ (s.criticality||0).toFixed(2) +')')}`));
          return;
        }
        if (sub === 'gap') {
          const gsub = args[1];
          if (gsub === 'hunt') {
            const text = args.slice(2).join(' ');
            if (!text) { console.log('Usage: intel gap hunt <text>'); return; }
            const r = await fetch(`${base}/api/intelligence/gap/hunt`, {
              method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ text }),
            });
            const d = await r.json();
            console.log(`${d.count || 0} gap(s) found:`);
            (d.gaps || []).forEach(g => console.log(`  ${$(C.cyan, g.type)}/${g.domain} — ${g.reason}`));
            return;
          }
          const r = await fetch(`${base}/api/intelligence/gap/status`); const d = await r.json();
          console.log($(C.bold, 'gap ledger:'), JSON.stringify(d.ledger));
          console.log(`predicate types: ${(d.predicateTypes||[]).join(', ')}`);
          console.log('Usage: intel gap [status|hunt <text>]');
          return;
        }
        if (sub === 'bda') {
          const bsub = args[1];
          if (bsub === 'observe') {
            const role = args[2];
            const text = args.slice(3).join(' ');
            if (!['user','assistant'].includes(role) || !text) { console.log('Usage: intel bda observe <user|assistant> <text>'); return; }
            const r = await fetch(`${base}/api/intelligence/bda/observe`, {
              method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ role, text }),
            });
            const d = await r.json();
            console.log(d.ok ? `regime=${d.pendulum?.regime} sigma=${d.pendulum?.sigma?.toFixed?.(2)} gaps=${d.gaps?.length||0}` : err(d.error));
            return;
          }
          const r = await fetch(`${base}/api/intelligence/bda/status`); const d = await r.json();
          console.log($(C.bold, 'BDA state:'));
          console.log(`  user:      regime=${d.user?.pendulum?.regime || 'n/a'} n=${d.user?.n||0}`);
          console.log(`  assistant: regime=${d.assistant?.pendulum?.regime || 'n/a'} n=${d.assistant?.n||0}`);
          return;
        }
        if (sub === 'causal') {
          const csub = args[1];
          if (csub === 'compound') {
            const entryUuid = args[2];
            if (!entryUuid) { console.log('Usage: intel causal compound <entryUuid>'); return; }
            const r = await fetch(`${base}/api/intelligence/causal/compound`, {
              method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ entryUuid }),
            });
            const d = await r.json();
            console.log(d.record ? `class=${d.record.class} spread=${d.record.spread} depth=${d.record.depth}` : (d.error || 'ripple — no compounding effect'));
            return;
          }
          const r = await fetch(`${base}/api/intelligence/causal/anomalies?scope=${args[1]==='open'?'open':'recent'}`); const d = await r.json();
          console.log(`${d.total||0} total, ${d.open||0} open`);
          (d.anomalies || []).slice(0, 15).forEach(a => console.log(`  ${$(C.cyan, a.type)} ${$(C.dim, a.severity)} ${a.sessionId||''}`));
          console.log('Usage: intel causal [open|compound <entryUuid>]');
          return;
        }
        if (sub === 'alk') {
          const asub = args[1];
          if (asub === 'record') {
            const [actor, intent, ...rest] = args.slice(2);
            if (!actor || !intent) { console.log('Usage: intel alk record <actor> <intent> [payload text]'); return; }
            const r = await fetch(`${base}/api/intelligence/alk/record`, {
              method: 'POST', headers: {'Content-Type':'application/json'},
              body: JSON.stringify({ actor, intent, payload: { note: rest.join(' ') || undefined } }),
            });
            const d = await r.json();
            console.log(d.ok ? ok(`recorded ${d.decision.uuid.slice(0,8)}`) : err(d.error));
            return;
          }
          if (asub === 'rewind') {
            const uuid = args[2];
            if (!uuid) { console.log('Usage: intel alk rewind <uuid>'); return; }
            const r = await fetch(`${base}/api/intelligence/alk/rewind`, {
              method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ uuid }),
            });
            const d = await r.json();
            console.log(d.ok ? ok(`rewound via ${d.rewind.uuid.slice(0,8)}`) : err(d.error));
            return;
          }
          if (asub === 'ancestors' || asub === 'descendants') {
            const uuid = args[2];
            if (!uuid) { console.log(`Usage: intel alk ${asub} <uuid>`); return; }
            const r = await fetch(`${base}/api/intelligence/alk/${asub}?uuid=${encodeURIComponent(uuid)}`); const d = await r.json();
            console.log((d[asub] || []).map(x => typeof x === 'string' ? x.slice(0,8) : x.uuid?.slice(0,8)).join(' → ') || 'none');
            return;
          }
          const r = await fetch(`${base}/api/intelligence/alk/stats`); const d = await r.json();
          console.log($(C.bold, 'ALK:'), `${d.total} decisions, ${d.reversed} reversed`);
          console.log('  by actor:', JSON.stringify(d.byActor));
          console.log('Usage: intel alk [stats|record <actor> <intent>|rewind <uuid>|ancestors|descendants <uuid>]');
          return;
        }
        if (sub === 'perception') {
          const r = await fetch(`${base}/api/intelligence/perception`); const d = await r.json();
          console.log(d.dominant ? `${$(C.bold, d.dominant.state)} (${(d.dominant.confidence*100).toFixed(0)}%) — ${d.dominant.description}` : 'no dominant composite state');
          if (d.oscillation?.detected) console.log($(C.yellow, `⚠ oscillating: ${d.oscillation.description}`));
          return;
        }
        if (sub === 'telemetry-frame') {
          const r = await fetch(`${base}/api/intelligence/telemetry/frame`); const d = await r.json();
          const fr = d.frame || {};
          console.log(`health=${fr.health} slope=${fr.slope?.direction} stability=${fr.stability?.classification} osc=${fr.oscillation?.isOscillating}`);
          return;
        }
        if (sub === 'rfr2') {
          const rsub = args[1];
          if (rsub === 'query') {
            const cql = args.slice(2).join(' ');
            if (!cql) { console.log("Usage: intel rfr2 query FIND events WHERE type = 'x' LIMIT 10"); return; }
            const r = await fetch(`${base}/api/intelligence/rfr2/query?cql=${encodeURIComponent(cql)}`); const d = await r.json();
            if (!d.ok) { console.log(err(d.error)); return; }
            console.log(`${d.results?.length || 0} result(s) (${d.strategy || ''}, ${d.durationMs}ms):`);
            (d.results || []).slice(0, 20).forEach(ev => console.log(`  ${$(C.dim, ev.id?.slice(0,8))} ${$(C.cyan, ev.type)} ${ev.source||''}`));
            return;
          }
          if (rsub === 'trace' || rsub === 'descendants' || rsub === 'children') {
            const id = args[2];
            if (!id) { console.log(`Usage: intel rfr2 ${rsub} <id>`); return; }
            const r = await fetch(`${base}/api/intelligence/rfr2/${rsub}?id=${encodeURIComponent(id)}`); const d = await r.json();
            if (rsub === 'trace') console.log(`depth=${d.depth} truncated=${d.truncated}  ${d.path?.map(p=>p.slice(0,8)).join(' → ')}`);
            else console.log((d[rsub] || []).map(x => x.slice ? x.slice(0,8) : x).join(', ') || 'none');
            return;
          }
          const r = await fetch(`${base}/api/intelligence/rfr2/stats`); const d = await r.json();
          console.log($(C.bold, 'RFR2 live kernel:'), d.live ? `listening since ${new Date(d.since).toLocaleTimeString()}` : 'not yet live');
          console.log(`  events=${d.length} edges=${d.edgeCount} macros=${d.macroCount} dropped=${d.droppedCount}`);
          console.log('Usage: intel rfr2 [stats|query <CQL>|trace <id>|descendants <id>|children <id>]');
          return;
        }
        console.log('Usage: intel [commands|patterns|cfr|status|framework <name>|liminal <text>|gap [status|hunt]|bda [status|observe]|causal [open|compound]|alk [stats|record|rewind|ancestors|descendants]|perception|telemetry-frame|rfr2 [stats|query|trace|descendants|children]]');
      } catch (e) {
        console.log(err(`intelligence system unreachable: ${e.message}`));
      }
      return;
    }

    case 'copilot': case 'cp': {
      // copilot <prompt> — talk to the co-pilot. Use --cmd "<command>" to
      // make it a RAID-gated tool call instead of a plain chat exchange.
      // §WIRED 2026-08-22 — James: "a userscript that routes into the cli
      // for co-pilot to bridge my browser and nexus." The real, honest
      // constraint that doesn't change no matter what's built here: this
      // conversation has no live connection to this machine. What DOES
      // help: --relay prints one clean, paste-ready JSON block of the real
      // exchange instead of formatted terminal output, so a real answer can
      // be handed back in one copy-paste instead of manual retyping.
      const relayFlagIdx = args.indexOf('--relay');
      const cmdFlagIdx = args.indexOf('--cmd');
      let prompt, command = null, relay = false;
      if (relayFlagIdx !== -1) { relay = true; args.splice(relayFlagIdx, 1); }
      if (cmdFlagIdx !== -1) {
        prompt = args.slice(0, cmdFlagIdx).join(' ').trim();
        command = args.slice(cmdFlagIdx + 1).join(' ').trim();
      } else {
        prompt = args.join(' ').trim();
      }
      if (!prompt) { log('Usage: copilot <prompt>\n       copilot <prompt> --cmd "<command to run, RAID-gated>"\n       copilot <prompt> --relay   (clean JSON, ready to paste to Claude)'); return; }
      try {
        const r = await fetch(`http://127.0.0.1:${PORTS.guardian}/copilot/prompt`, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ prompt, command: command || undefined, contextOpts: { intent: prompt } }),
          signal: AbortSignal.timeout(20000),
        });
        const d = await r.json();
        if (relay) {
          console.log(JSON.stringify({
            prompt, ts: Date.now(),
            ok: !!d.ok, denied: !!d.denied, reason: d.reason || null,
            toolResult: d.toolResult ? (d.toolResult.result || d.toolResult) : null,
            context: d.context || null,
            text: d.text || d.response || null,
            error: d.error || null,
          }, null, 2));
          return;
        }
        if (d.denied) {
          log(err(`RAID denied this tool call: ${d.reason}`));
        } else if (d.ok) {
          if (d.toolResult) log(`✓ tool executed:\n` + JSON.stringify(d.toolResult.result || d.toolResult, null, 2));
          if (d.context) log($(C.dim, `(context: ${d.context.sections} section(s), ~${d.context.tokensUsed} tokens)`));
          if (!d.toolResult) log($(C.dim, 'No tool call made — chat-only response (full narration not yet built, see docs/copilot.spec).'));
        } else {
          log(err(d.error || 'co-pilot request failed'));
        }
      } catch(e) { log(err('Guardian/co-pilot offline: ' + e.message)); }
      return;
    }

    case 'forge': {
      // forge <prompt> — dispatch a forge job to guardian (uses RAID to pick provider)
      const prompt = args.join(' ').trim();
      if (!prompt) { log('Usage: forge <prompt>\n  Dispatches a forge job via guardian RAID'); return; }
      try {
        const r = await fetch(`http://127.0.0.1:${PORTS.guardian}/command`, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ command:'forge', prompt, meta:{ source:'nexus-repl', ts:Date.now() } }),
          signal: AbortSignal.timeout(10000),
        });
        const d = await r.json();
        if (d.jobId || d.ok) {
          log(`✓ job dispatched → ${$(C.cyan, d.jobId?.slice(0,16) || '?')} via ${d.provider || 'RAID'}`);
        } else {
          log(err(d.error || 'dispatch failed'));
        }
      } catch(e) {
        log(err('Guardian offline: ' + e.message));
      }
      return;
    }

    case 'heal': {
      // heal <gap-uuid> — trigger HEAL_REQUESTED for a specific gap
      const gapId = args[0];
      if (!gapId) {
        // Show open gaps first
        const g = await GET(PORTS.cortex, '/api/gaps?status=open&n=10');
        const gaps = Array.isArray(g.data) ? g.data : (g.data?.gaps || g.data?.rows || []);
        if (!gaps.length) { log('No open gaps'); return; }
        console.log(`\n${$(C.bold,'Open gaps:')}`);
        for (const gap of gaps.slice(0,10)) {
          const sev = gap.severity === 'high' ? $(C.red, gap.severity) :
                      gap.severity === 'medium' ? $(C.yellow, gap.severity) : $(C.dim, gap.severity||'?');
          console.log(`  ${sev.padEnd(16)} ${$(C.dim, gap.uuid?.slice(0,12))}  ${gap.type||''}: ${(gap.body||'').slice(0,60)}`);
        }
        console.log(`\n${$(C.dim,'Usage: heal <gap-uuid-prefix>')}`);
        return;
      }
      try {
        const r = await fetch(`http://127.0.0.1:7825/gaps/${gapId}/fix`, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: '{}', signal: AbortSignal.timeout(5000),
        });
        const d = await r.json();
        log(d.ok ? `✓ HEAL_REQUESTED → gap ${gapId.slice(0,12)}` : err(d.error || 'heal failed'));
      } catch(e) {
        log(err('Diagnostic service offline: ' + e.message));
      }
      return;
    }

    case 'snapshot': {
      // snapshot [message] — take a cortex snapshot
      // §FIX 2026-06-21: was POSTing to /api/snapshot (singular) — cortex
      // only serves /api/snapshots/create (plural). Confirmed directly in
      // cortex/foundation/admin-server.js before fixing — this 404'd
      // every time, silently, since the catch block below only checks
      // d.snapId and never surfaces the raw HTTP status.
      const msg = args.join(' ') || 'cli-snapshot';
      try {
        const r = await fetch(`http://127.0.0.1:${PORTS.cortex}/api/snapshots/create`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ trigger:'manual', message: msg, source:'nexus-repl' }),
          signal: AbortSignal.timeout(10000),
        });
        const d = await r.json();
        log(d.snapId ? `✓ snapshot: ${$(C.cyan, d.snapId)} (${d.totalRows||'?'} rows)` : err(d.error || 'snapshot failed'));
      } catch(e) { log(err('Cortex offline: ' + e.message)); }
      return;
    }

    case 'context': {
      // Show system context that gets injected into Ollama calls
      try {
        const ctxBuilder = require('../lib/context-builder');
        const ctx = await ctxBuilder.buildContext();
        log(ctx.systemPrompt);
        log('\n--- ' + ctx.tokensUsed + '/' + ctx.tokensBudget + ' tokens used ---');
      } catch(e) { log('context-builder unavailable: ' + e.message); }
      return;
    }

    case 'intents': {
      // Show intent map
      const INTENTS = [
        { category:'memory',   cli:'nexus memory artifacts',    intent:'Query what has already been built' },
        { category:'memory',   cli:'nexus memory chat_log',     intent:'Browse logged AI conversations' },
        { category:'dispatch', cli:'nexus dispatch "prompt"',   intent:'Send a job to an AI provider' },
        { category:'dispatch', cli:'nexus chat "prompt"',       intent:'Talk to Ollama directly' },
        { category:'build',    cli:'nexus idea "your idea"',    intent:'Log an idea' },
        { category:'build',    cli:'nexus spec new',            intent:'Start a new spec' },
        { category:'observe',  cli:'nexus gaps',                intent:'See open system gaps' },
        { category:'observe',  cli:'nexus tension',             intent:'See system tension scores' },
        { category:'control',  cli:'nexus selfheal',            intent:'Check self-heal status' },
        { category:'control',  cli:'nexus snapshot',            intent:'Take a system snapshot' },
      ];
      for (const i of INTENTS) {
        log('[' + i.category.padEnd(10) + '] ' + i.cli.padEnd(35) + i.intent);
      }
      return;
    }

    case 'artifacts': {
      const q = args.join(' ').trim();
      try {
        const url = q
          ? 'http://127.0.0.1:7820/memory/query?q=' + encodeURIComponent(q) + '&limit=10'
          : 'http://127.0.0.1:7820/artifacts?limit=20';
        const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
        const d = await r.json();
        const items = d.artifacts || d.results || d || [];
        if (!items.length) { log('No artifacts found' + (q ? ' for: ' + q : '')); return; }
        for (const a of items) {
          log('[' + (a.lang||'?').padEnd(6) + '] ' + (a.name||a.hash||'').slice(0,40).padEnd(42) + (a.description||'').slice(0,50));
        }
        log('--- ' + items.length + ' artifacts ---');
      } catch(e) { log('guardian offline: ' + e.message); }
      return;
    }

    case 'chatlog': {
      const n = parseInt(args[0]) || 20;
      try {
        const r = await fetch('http://127.0.0.1:3748/api/memory?table=chat_log&n=' + n,
          { signal: AbortSignal.timeout(3000) });
        const d = await r.json();
        const rows = d.rows || [];
        if (!rows.length) { log('No chat log entries yet.'); return; }
        for (const row of rows) {
          log('[' + (row.provider||'?').padEnd(10) + '] ' + new Date(row.ts||0).toLocaleTimeString() + ' — ' + (row.prompt||'').slice(0,60));
        }
      } catch(e) { log('cortex offline: ' + e.message); }
      return;
    }

    case 'tension': {
      try {
        const r = await fetch('http://127.0.0.1:7825/tension', { signal: AbortSignal.timeout(3000) });
        const d = await r.json();
        const systems = d.systems || d;
        for (const [sys, t] of Object.entries(systems)) {
          const regime = t.regime || 'stable';
          const bar = '█'.repeat(Math.min(10, Math.ceil((t.tension||0)*2)));
          log('[' + sys.padEnd(12) + '] ' + regime.padEnd(10) + ' tension:' + (t.tension||0).toFixed(2) + ' ' + bar);
        }
      } catch(e) { log('diagnostic offline: ' + e.message); }
      return;
    }

    case 'selfheal': {
      try {
        const r = await fetch('http://127.0.0.1:7825/self-heal', { signal: AbortSignal.timeout(3000) });
        const d = await r.json();
        log('Open loops: ' + (d.openLoops||0) + '  Total tension: ' + (d.totalTension||0).toFixed(2));
        log('Pending: ' + (d.pending||0) + '  Forge ready: ' + (d.forgeReady||0) + '  Human required: ' + (d.humanRequired||0));
        if (d.humanRequiredGaps?.length) {
          log('\nNeeds you:');
          for (const g of d.humanRequiredGaps) log('  [' + g.type + '] ' + (g.body||'').slice(0,60));
        }
      } catch(e) { log('diagnostic offline: ' + e.message); }
      return;
    }

    case 'exit': case 'quit': case 'q':
      console.log($(C.dim, 'goodbye')); process.exit(0);
    case '': return;
  }

  // All other commands go through /cli/exec on guardian (:7820)
  // This is the same endpoint the UI cockpit calls — same ledger, same output
  try {
    const r = await POST(7820, '/cli/exec', { command: line.trim(), source: 'repl' });
    if (!r || r.error === undefined && r.ok === undefined) {
      // Guardian not running — fall back to local handler
      console.log($(C.yellow, '⚠') + ' Guardian offline — running locally');
      await dispatchLocal(cmd, args);
      return;
    }
    if (r.error) {
      console.log($(C.red, '✗') + ' ' + r.error);
      return;
    }
    if (r.result) {
      // Pretty-print the result
      const result = r.result;
      if (Array.isArray(result.jobs))      { printTable('jobs',      result.jobs,      ['id','provider','command','status','ts']); }
      else if (Array.isArray(result.artifacts)) { printTable('artifacts', result.artifacts, ['id','name','lang','ts']); }
      else if (Array.isArray(result.gaps)) { printTable('gaps',      result.gaps,      ['type','domain','description','score']); }
      else if (Array.isArray(result.sessions)) { printTable('sessions', result.sessions, ['name','provider','ts']); }
      else if (Array.isArray(result.ledger))   { printTable('ledger',   result.ledger,   ['category','msg','ts']); }
      else console.log(JSON.stringify(result, null, 2));
    }
  } catch(e) {
    console.log($(C.red, '§1.2 ERROR') + ' ' + e.message);
    // Fall back to local on network error
    await dispatchLocal(cmd, args).catch(() => {});
  }
}

// Print a table of objects with given columns
function printTable(label, rows, cols) {
  if (!rows || !rows.length) { console.log($(C.dim, '  (no ' + label + ')')); return; }
  console.log('\n' + $(C.cyan + C.bold, '  ' + label.toUpperCase()) + $(C.dim, ' (' + rows.length + ')'));
  for (const row of rows.slice(0, 30)) {
    const parts = cols.map(c => {
      const v = row[c];
      if (v === undefined || v === null) return '';
      if (c === 'ts') return $(C.dim, new Date(v).toLocaleTimeString());
      if (c === 'id') return $(C.muted, String(v).slice(0,8));
      if (c === 'score') return $(C.yellow, (parseFloat(v)*100||0).toFixed(0) + '%');
      if (c === 'status') return v === 'complete' ? $(C.green, v) : v === 'pending' ? $(C.yellow, v) : $(C.red, v);
      return String(v).slice(0, 50);
    });
    console.log('  ' + parts.filter(Boolean).join('  '));
  }
}

// Route to a specific system's /cli/exec endpoint
async function routeToSystem(system, command) {
  const SYSTEM_PORTS = {
    guardian: { port:7820, path:'/cli/exec' },
    cortex:   { port:3748, path:'/api/cli/exec' },
    idearium: { port:4800, path:'/api/cli/exec' },
    emerge:   { port:4242, path:'/api/cli/exec' },
  };
  const s = SYSTEM_PORTS[system];
  if (!s) return { ok:false, error:'unknown system: '+system };
  try {
    return await POST(s.port, s.path, { command, source:'repl' });
  } catch(e) {
    return { ok:false, error:system+' unreachable: '+e.message };
  }
}

// Fallback: run command locally if guardian not reachable
async function dispatchLocal(cmd, args) {
  switch (cmd) {
    case 'jobs':     return cmdJobs(args);
    case 'gaps':     return cmdGaps();
    case 'ledger': case 'log': return cmdLedger(args);
    case 'events': case 'ev':  return cmdEvents(args);
    case 'ideas':              return cmdIdeas(args);
    case 'dispatch': case 'dis': return cmdDispatch(args);
    case 'snr':                return cmdSNR();
    case 'bus':                return cmdBus(args);
    default:
      console.log($(C.red, '?') + ' unknown: ' + cmd + ' — type help');
  }
}

// Subscribe to guardian SSE stream in background
// Prints guardian.job.*, guardian.cli.exec, guardian.seam.* events to terminal
// This is what makes the terminal mirror the UI in real-time
function startGuardianStream() {
  const http = require('http');
  const req  = http.get({
    hostname: '127.0.0.1', port: 7820,
    path: '/events', headers: { Accept: 'text/event-stream' }
  }, res => {
    if (res.statusCode !== 200) return;
    let buf = '';
    res.on('data', chunk => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          const msg = JSON.parse(line.slice(5).trim());
          // Print relevant events to terminal without interfering with prompt
          if (msg.type === 'CLI_RESULT' && msg.source !== 'repl') {
            // Another client ran a command — show it
            process.stdout.write('\r' + $(C.dim, '[ui] ') + $(C.cyan, msg.command) + '\n');
            if (msg.result) process.stdout.write($(C.dim, JSON.stringify(msg.result).slice(0,120)) + '\n');
          } else if (msg.type && msg.type.startsWith('guardian.job.')) {
            const label = msg.type.replace('guardian.job.','');
            process.stdout.write('\r' + $(C.dim, '[job] ') + $(C.yellow, label) + ' ' +
              $(C.dim, (msg.jobId||'').slice(0,8) + ' ' + (msg.provider||'')) + '\n');
            // §FIXED 2026-09-25 — James: "it needs to give the agents
            // response in the cli." Real gap, not assumed: this line has
            // always printed the guardian.job.* EVENT LABEL only
            // ('complete', the jobId prefix, the provider) — never the
            // agent's actual reply. A job dispatched from anywhere (repo-
            // agent chat, forge, ask) that completes async has no surface
            // in this terminal showing what the agent said; the only
            // place it ever appeared was the browser tab guardian dispatched
            // into. Not an idearium concern (idearium is for coding
            // artifacts, not chat transcripts — corrected after first
            // proposing that route) — this is a CLI-surface gap, fixed at
            // the CLI. Real fix: on guardian.job.complete specifically,
            // one real lookup against guardian's own GET /response/:jobId
            // (registry-components.js's job.response route — same durable
            // .job-file-backed record idearium/lib/guardian-stream.cjs
            // already reads for its own resolution, reused here rather
            // than a second job-store reader) and print the actual text.
            // Fire-and-forget async IIFE: the outer SSE data handler is
            // synchronous per chunk and must not block on this fetch.
            if (label === 'complete' && msg.jobId) {
              (async () => {
                try {
                  const r = await fetch(`http://127.0.0.1:${PORTS.guardian}/response/${msg.jobId}`, { signal: AbortSignal.timeout(5000) });
                  if (!r.ok) return; // no recorded response — real, ordinary state (e.g. a job this jobId doesn't belong to), not an error to surface
                  const d = await r.json();
                  const text = (d && d.response || '').trim();
                  if (!text) return;
                  const shown = text.length > 800 ? text.slice(0, 800) + $(C.dim, `… (+${text.length - 800} chars, GET /response/${msg.jobId} for full)`) : text;
                  process.stdout.write($(C.dim, '  └─ ') + shown.split('\n').join('\n' + $(C.dim, '     ')) + '\n');
                } catch (_) {} // guardian unreachable or the fetch raced a restart — never break the SSE mirror over this
              })();
            }
          } else if (msg.type && msg.type.startsWith('guardian.seam.')) {
            const label = msg.type.replace('guardian.seam.','');
            process.stdout.write('\r' + $(C.dim, '[seam] ') + $(C.purple||C.blue, label) + '\n');
          }
        } catch(_) {}
      }
    });
    res.on('error', () => {});
  });
  req.on('error', () => {});  // silent — guardian may not be running
  req.setTimeout(0);  // no timeout for SSE stream
}

function startRepl() {
  const rl = readline.createInterface({
    input: process.stdin, output: process.stdout,
    prompt: `${C.green}nexus${C.reset}${C.dim}>${C.reset} `,
    history: HISTORY,
    historySize: 200,
    terminal: true,
    completer: (line) => {
      // Static completions always available
      const STATIC = ['status','jobs','events','gaps','ideas','idea','dispatch',
        'chat','ask','context','intents','artifacts','chatlog','push','diagnose',
        'watchdog','watch','bus','ui','help','exit','quit','ledger','snr',
        'describe','caps','build','phases','forge','heal','snapshot','rewind'];
      // Grammar completions if loaded
      if (_grammar) {
        const grammarSuggs = _grammar.complete(line);
        if (grammarSuggs.length) {
          const combined = [...new Set([...grammarSuggs, ...STATIC.filter(s => s.startsWith(line))])];
          return [combined, line];
        }
      }
      const hits = STATIC.filter(s => s.startsWith(line));
      return [hits.length ? hits : STATIC, line];
    },
  });

  console.clear();
  console.log(`${$(C.bold+C.green, '⬡  NEXUS CLI REPL')}  ${$(C.dim, 'type help for commands')}\n`);
  console.log(`${$(C.dim, 'orchestrator: http://localhost:'+PORTS.orchestrator)}\n`);

  // Auto-status on start, then load grammar for tab completion
  cmdStatus()
    .then(() => loadGrammar())
    .then(g => { if (g) log($(C.dim, `grammar ready (${g.status().componentCount} commands)`)); })
    .catch(() => {})
    .finally(() => rl.prompt());

  rl.on('line', async line => {
    if (line.trim()) HISTORY.unshift(line.trim());
    await dispatch(line.trim());
    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
  rl.on('SIGINT', () => { console.log(''); rl.prompt(); });
}

// ── Entry ─────────────────────────────────────────────────────────────────────
if (process.argv.includes('--repl') || process.stdin.isTTY) {
  startGuardianStream();  // background SSE — mirrors guardian events to terminal
  startRepl();
} else {
  // Single command mode: node nexus-repl.js status
  const cmd = process.argv.slice(2).filter(a => !a.startsWith('--')).join(' ');
  if (cmd) {
    dispatch(cmd).then(() => process.exit(0)).catch(e => {
      console.error(e.message); process.exit(1);
    });
  } else {
    startRepl();
  }
}
