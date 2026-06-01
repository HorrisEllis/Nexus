#!/usr/bin/env node
'use strict';
// ── cortex.js ─────────────────────────────────────────────────────────────────
// CORTEX — interactive CLI. Submits agent_calls, inspects system state.
// Reads directly from the singleton jaaDB — requires boot.js to be running first
// OR can be used as a standalone query tool against an existing data dir.
//
// Usage:
//   node cortex.js                    # interactive REPL
//   node cortex.js ask "what is..."   # one-shot query
//   node cortex.js status             # system status
//   node cortex.js gaps               # open gaps
//   node cortex.js tail [table] [n]   # tail any table

const readline  = require('readline');
const http      = require('http');
const { uid }   = require('./memory/jaa-db');

const PORT      = parseInt(process.env.NEXUS_PORT || '3748');
const BASE      = `http://127.0.0.1:${PORT}`;

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function get(path) {
  return new Promise((resolve, reject) => {
    http.get(BASE + path, (res) => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { resolve(raw); }
      });
    }).on('error', reject);
  });
}

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = http.request({
      host:    '127.0.0.1', port: PORT, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

// ── Commands ──────────────────────────────────────────────────────────────────
async function cmdStatus() {
  try {
    const h = await get('/health');
    console.log('\n── NEXUS v5.0 ────────────────────────────────────────');
    console.log(`  status:   ${h.status}`);
    console.log(`  uptime:   ${Math.floor(h.uptime)}s`);

    if (h.jaa?.counts) {
      console.log('\n── JAA table counts ─────────────────────────────────');
      for (const [table, count] of Object.entries(h.jaa.counts)) {
        if (count > 0) console.log(`  ${table.padEnd(28)} ${count}`);
      }
    }

    if (h.cobalt) {
      console.log('\n── Cobalt ───────────────────────────────────────────');
      const r = h.cobalt.registry;
      if (r) console.log(`  nodes connected: ${r.connected} / ${r.total}`);
      const b = h.cobalt.bus;
      if (b) console.log(`  bus tick:        ${b.tick}    subs: ${b.subs}`);
    }

    if (h.lastEvent) {
      console.log('\n── Last event ───────────────────────────────────────');
      console.log(`  ${h.lastEvent.type}  (source: ${h.lastEvent.source})`);
    }
    console.log('');
  } catch (err) {
    console.error(`  ✗ Cannot reach admin server on ${BASE} — is NEXUS running?`);
    console.error(`    ${err.message}`);
  }
}

async function cmdAsk(prompt) {
  if (!prompt) { console.error('  ✗ usage: ask <prompt>'); return; }

  console.log(`\n  → submitting to CORTEX: "${prompt}"`);
  try {
    const ev = await post('/api/event', {
      type:    'agent.call.requested',
      payload: { prompt, preferredAgent: 'ollama', source: 'cortex-cli' },
      source:  'cortex-cli',
    });
    console.log(`  ✓ event logged: ${ev.uuid}`);
    console.log('    Polling for response (up to 35s)...');

    // Poll event_log for agent.response.received
    const deadline = Date.now() + 35000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 1500));
      const events = await get('/api/events?n=20');
      if (!Array.isArray(events)) continue;
      const resp   = events.find(e => e.type === 'agent.response.received' && e._ts > ev._ts);
      if (resp) {
        console.log(`\n  ✓ response received (${resp.payload?.chars || 0} chars)\n`);
        // Fetch latest memory entry
        const mem = await get('/api/memory?table=cortex_memory&n=1');
        if (Array.isArray(mem) && mem[0]) {
          console.log('  ─────────────────────────────────────────────────────');
          console.log(`  ${mem[0].content}`);
          console.log('  ─────────────────────────────────────────────────────\n');
        }
        return;
      }
    }
    console.log('  ⚠ Timed out — check /api/events or Ollama is running\n');
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
  }
}

async function cmdGaps() {
  try {
    const gaps = await get('/api/gaps?status=pending');
    if (!Array.isArray(gaps) || !gaps.length) {
      console.log('\n  ✓ No open gaps\n'); return;
    }
    console.log(`\n── Open gaps (${gaps.length}) ──────────────────────────────`);
    for (const g of gaps) {
      const sev = g.severity === 'high' ? '●' : g.severity === 'medium' ? '○' : '·';
      console.log(`  ${sev} [${g.severity.padEnd(6)}] ${g.type.padEnd(20)} ${g.path}`);
      if (g.body) console.log(`             ${g.body.slice(0, 80)}`);
    }
    console.log('');
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
  }
}

async function cmdFailures() {
  try {
    const fails = await get('/api/failures');
    if (!Array.isArray(fails) || !fails.length) {
      console.log('\n  ✓ No recent failures\n'); return;
    }
    console.log(`\n── Recent failures (${fails.slice(-10).length}) ──────────────────────────`);
    for (const f of fails.slice(-10)) {
      const t = new Date(f.ts || f._ts || 0).toISOString().slice(11, 19);
      console.log(`  [${t}] ${f.source?.padEnd(20)} ${f.error?.slice(0, 70)}`);
    }
    console.log('');
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
  }
}

async function cmdTail(table = 'event_log', n = 10) {
  try {
    const rows = await get(`/api/events?n=${n}`);
    if (!Array.isArray(rows)) { console.log('  No data\n'); return; }
    console.log(`\n── ${table} (last ${rows.length}) ──────────────────────────`);
    for (const r of rows) {
      const t = new Date(r.ts || r._ts || 0).toISOString().slice(11, 19);
      const src = (r.source || '').padEnd(18);
      console.log(`  [${t}] ${src}  ${r.type || r.status || JSON.stringify(r).slice(0, 60)}`);
    }
    console.log('');
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
  }
}

function cmdHelp() {
  console.log(`
  CORTEX — NEXUS v5.0 CLI

  Commands:
    status              System health + JAA table counts
    ask <prompt>        Submit a prompt and wait for response
    gaps                Show open gaps
    failures            Show recent failures
    tail [n]            Tail event_log (default 10 rows)
    help                This message
    exit / quit         Exit REPL

  Environment:
    NEXUS_PORT=${PORT}     Admin server port
`);
}

// ── REPL ──────────────────────────────────────────────────────────────────────
async function repl() {
  console.log('\n  CORTEX — NEXUS v5.0  (type \'help\' for commands)\n');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '  cortex> ' });
  rl.prompt();

  rl.on('line', async (line) => {
    const parts   = line.trim().split(/\s+/);
    const cmd     = parts[0]?.toLowerCase();
    const rest    = parts.slice(1).join(' ');

    switch (cmd) {
      case '':        break;
      case 'status':  await cmdStatus();                      break;
      case 'ask':     await cmdAsk(rest);                     break;
      case 'gaps':    await cmdGaps();                        break;
      case 'fail':
      case 'failures':await cmdFailures();                    break;
      case 'tail':    await cmdTail('event_log', parseInt(parts[1]) || 10); break;
      case 'help':    cmdHelp();                              break;
      case 'exit':
      case 'quit':    console.log(''); rl.close(); process.exit(0);
      default:
        console.log(`  unknown command: '${cmd}' — type 'help'\n`);
    }

    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}

// ── Entry point ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (!args.length) {
  repl();
} else {
  (async () => {
    const cmd  = args[0];
    const rest = args.slice(1).join(' ');
    switch (cmd) {
      case 'status':   await cmdStatus();   break;
      case 'ask':      await cmdAsk(rest);  break;
      case 'gaps':     await cmdGaps();     break;
      case 'failures': await cmdFailures(); break;
      case 'tail':     await cmdTail('event_log', parseInt(args[1]) || 10); break;
      default:         cmdHelp();
    }
    process.exit(0);
  })().catch(err => { console.error(err.message); process.exit(1); });
}
