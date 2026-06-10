#!/usr/bin/env node
'use strict';
/**
 * cli/nexus-repl.js — NEXUS Interactive CLI REPL
 * UUID: nexus-repl-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
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

// ── Ports ─────────────────────────────────────────────────────────────────────
const PORTS = {
  orchestrator: parseInt(process.env.ORCHESTRATOR_PORT || '9000'),
 cortex: 3748, guardian: 7820,
  idearium:     4800, emerge: 4242, ollama: 11434,
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
    console.log(`
${$(C.bold+C.cyan, 'LIVE STREAM')}  ${$(C.dim, 'connecting to cortex SSE…')}
`);
  // Watch cortex SSE instead
  const r = http.request({ hostname:'127.0.0.1', port:3748, path:'/sse', method:'GET', headers:{Accept:'text/event-stream'} }, res => {
    let buf='';
    res.on('data', c => { buf+=c.toString(); const lines=buf.split('
'); buf=lines.pop(); for(const l of lines){ if(!l.startsWith('data:')) continue; try{const d=JSON.parse(l.slice(5).trim()); console.log(d.type, JSON.stringify(d).slice(0,80));}catch(_){} }});
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
  ledger [sys] [n]    System event ledger
  snr                 Idearium SNR
  diagnose [sys]       Run full system diagnostic (all or one system)
  watchdog / wd        Live system monitor (Ctrl+C to stop)
  bus [sys] [n]        SISO bus log (all systems)
  watch               Live event stream (Ctrl+C to stop)
  ui                  Open orchestrator UI in browser
  help                This message
  exit / quit / q     Exit

${$(C.bold, 'Systems')}
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
    case 'ui': await cmdUI(); return;
    case 'help': case '?': cmdHelp(); return;
    case 'status': await cmdStatus(); return;  // multi-system, local
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
  });

  console.clear();
  console.log(`${$(C.bold+C.green, '⬡  NEXUS CLI REPL')}  ${$(C.dim, 'type help for commands')}\n`);
  console.log(`${$(C.dim, 'orchestrator: http://localhost:'+PORTS.orchestrator)}\n`);

  // Auto-status on start
  cmdStatus().then(() => rl.prompt()).catch(() => rl.prompt());

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
