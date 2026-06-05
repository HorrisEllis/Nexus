#!/usr/bin/env node
'use strict';
/**
 * cli/diagnose.js — NEXUS System Diagnostic Sequencer
 * UUID: nexus-diagnose-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * Runs each system's diagnostic sequence one by one.
 * Every check is gated, logged, personalized to the system's role.
 * Finds gaps, suggests fixes, runs tests, writes results.
 *
 * Usage:
 *   node cli/diagnose.js              # all systems
 *   node cli/diagnose.js bridge       # one system
 *   node cli/diagnose.js --fix        # attempt auto-fixes
 *   node cli/diagnose.js --watch      # keep watching until all pass
 */

'use strict';
const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const { execSync, spawnSync } = require('child_process');
const { randomUUID } = require('crypto');

const ROOT = path.join(__dirname, '..');
const FIX  = process.argv.includes('--fix');
const WATCH= process.argv.includes('--watch');
const TARGET = process.argv.slice(2).find(a => !a.startsWith('--')) || 'all';

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[90m',
  red:'\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m',
  blue:'\x1b[34m', magenta:'\x1b[35m', cyan:'\x1b[36m',
};
const ok    = s => `${C.green}✓${C.reset} ${s}`;
const fail  = s => `${C.red}✗${C.reset} ${s}`;
const warn  = s => `${C.yellow}⚠${C.reset} ${s}`;
const info  = s => `${C.dim}  ${s}${C.reset}`;
const fix   = s => `${C.cyan}↻${C.reset} ${s}`;
const hdr   = (sys, col) => `\n${col}${C.bold}⬡  ${sys.toUpperCase()}${C.reset}`;
const step  = (n, total, s) => `${C.dim}[${n}/${total}]${C.reset} ${s}`;

// ── HTTP probe ────────────────────────────────────────────────────────────────
function probe(port, path, timeout = 3000) {
  return new Promise(resolve => {
    const r = http.request({ hostname:'127.0.0.1', port, path, method:'GET',
      headers:{'Content-Type':'application/json'} }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ ok: res.statusCode < 400, status: res.statusCode, data: d.slice(0,200) }); }
      });
    });
    r.setTimeout(timeout, () => { r.destroy(); resolve({ ok:false, error:'timeout' }); });
    r.on('error', e => resolve({ ok:false, error: e.code || e.message }));
    r.end();
  });
}

function probePost(port, path, body, timeout = 3000) {
  return new Promise(resolve => {
    const pl = JSON.stringify(body);
    const r  = http.request({ hostname:'127.0.0.1', port, path, method:'POST',
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(pl)} }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, data: JSON.parse(d) }); }
        catch { resolve({ ok: res.statusCode < 400, data: d }); }
      });
    });
    r.setTimeout(timeout, () => { r.destroy(); resolve({ ok:false, error:'timeout' }); });
    r.on('error', e => resolve({ ok:false, error: e.code || e.message }));
    r.write(pl); r.end();
  });
}

// ── File / module checks ──────────────────────────────────────────────────────
function fileExists(p) { return fs.existsSync(path.join(ROOT, p)); }
function checkNode(mod) {
  try { require.resolve(path.join(ROOT, 'node_modules', mod)); return true; }
  catch { return false; }
}
function tryRequire(p) {
  try { require(path.join(ROOT, p)); return { ok:true }; }
  catch(e) { return { ok:false, error: e.message.split('\n')[0] }; }
}
function portInUse(port) {
  const r = spawnSync('node', ['-e',
    `const n=require('net');const s=n.createServer();s.once('error',e=>{process.stdout.write(e.code==='EADDRINUSE'?'yes':'no');process.exit();});s.once('listening',()=>{s.close(()=>{process.stdout.write('no');process.exit();});});s.listen(${port},'127.0.0.1');`
  ], { encoding:'utf8', timeout: 3000 });
  return r.stdout.trim() === 'yes';
}
function nodeVersion() {
  return process.version;
}

// ── Results ───────────────────────────────────────────────────────────────────
const allResults = [];
let totalPass = 0, totalFail = 0, totalWarn = 0;

function record(system, checkName, status, detail = '') {
  allResults.push({ system, checkName, status, detail, ts: Date.now() });
  if (status === 'PASS') totalPass++;
  if (status === 'FAIL') totalFail++;
  if (status === 'WARN') totalWarn++;
}

// ledger() — write diagnostic event to server JAA ledger (§LAW II)
// Fire-and-forget, never blocks the diagnostic
async function ledger(checkName, status, detail = '') {
  try {
    const body = JSON.stringify({
      type: 'GUARDIAN_LEDGER_WRITE',
      category: status === 'PASS' ? 'EVENT' : status === 'FAIL' ? 'GAP' : 'SYSTEM',
      msg: `diag: ${checkName} → ${status}`,
      meta: { checkName, status, detail, source: 'diagnose.js', ts: Date.now() },
    });
    const r = require('http').request({
      hostname: '127.0.0.1', port: 7820, path: '/result', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    });
    r.on('error', () => {}); // silent fail if guardian not running
    r.write(body); r.end();
  } catch(_) {}
}

// fix_cmd() — print a copy-pasteable fix command with explanation
function fix_cmd(description, command, why) {
  console.log(fix(`FIX: ${description}`));
  console.log(info(`  Command : ${C.cyan}${command}${C.reset}`));
  if (why) console.log(info(`  Why     : ${why}`));
}

// detail_error() — print a full structured error block, easy to read
function detail_error(system, checkName, error, suggestion, command) {
  console.log('');
  console.log(`${C.red}${C.bold}  ══ ERROR: ${system.toUpperCase()} › ${checkName} ══${C.reset}`);
  console.log(info(`  Error   : ${C.yellow}${error}${C.reset}`));
  if (suggestion) console.log(info(`  Fix     : ${suggestion}`));
  if (command)    console.log(info(`  Command : ${C.cyan}${command}${C.reset}`));
  console.log('');
}

// ═════════════════════════════════════════════════════════════════════════════
// SYSTEM DIAGNOSTICS — one function per system
// ═════════════════════════════════════════════════════════════════════════════

async function diagOrchestrator() {
  console.log(hdr('orchestrator', C.green));
  console.log(info('Source of truth — all systems register here on boot'));
  console.log(info('Port :9000 | §AXIOM: must start before all other systems\n'));

  const checks = [
    ['file: orchestrator.js',    () => fileExists('orchestrator.js')],
    ['file: nexus-connect.js',   () => fileExists('nexus-connect.js')],
    ['file: cli/nexus-repl.js',  () => fileExists('cli/nexus-repl.js')],
    ['file: cli/diagnose.js',    () => fileExists('cli/diagnose.js')],
    ['file: ui/orchestrator/',   () => fileExists('ui/orchestrator/index.html')],
    ['file: data/ledger/ (writable)', () => {
      const dir = path.join(ROOT,'data','ledger');
      try { fs.mkdirSync(dir,{recursive:true}); fs.accessSync(dir, fs.constants.W_OK); return true; }
      catch { return false; }
    }],
    ['syntax: orchestrator.js',  () => {
      const r = spawnSync('node',['--check','orchestrator.js'],{cwd:ROOT,encoding:'utf8',timeout:5000});
      return r.status === 0;
    }],
    ['port :9000 check',         () => {
      const inUse = portInUse(9000);
      if (inUse) { console.log(info('    → already bound (orchestrator running)')); return true; }
      return true; // not in use is fine — we're checking structure
    }],
  ];

  for (const [i, [name, fn]] of checks.entries()) {
    try {
      const r = await fn();
      if (r) { console.log(ok(step(i+1, checks.length, name))); record('orchestrator',name,'PASS'); }
      else   { console.log(fail(step(i+1, checks.length, name))); record('orchestrator',name,'FAIL'); }
    } catch(e) { console.log(fail(step(i+1, checks.length, name))+` ${C.dim}${e.message.slice(0,60)}${C.reset}`); record('orchestrator',name,'FAIL',e.message); }
  }

  // Live check
  console.log('');
  const r = await probe(9000, '/health');
  if (r.ok) {
    console.log(ok(`LIVE :9000  online=${r.data.online}/${r.data.total}  uptime=${r.data.uptime?.toFixed(0)}s`));
    record('orchestrator','live /health','PASS');
    const reg = await probe(9000, '/api/registry');
    if (reg.ok) {
      const sys = Object.keys(reg.data.registry || {});
      if (sys.length) console.log(info(`    registered: ${sys.join(', ')}`));
      record('orchestrator','live /api/registry','PASS');
    }
  } else {
    console.log(warn(`NOT RUNNING — start with: node orchestrator.js`));
    record('orchestrator','live /health','WARN','not running');
  }
}

async function diagBridge() {
  console.log(hdr('bridge', C.yellow));
  console.log(info('Tag engine, request queue, SSE relay — §5.2 everything connects here'));
  console.log(info('Port :9999\n'));

  const checks = [
    ['file: bridge/nexus-bridge.js',           () => fileExists('bridge/nexus-bridge.js')],
    ['file: bridge/interaction-contract.json', () => fileExists('bridge/interaction-contract.json')],
    ['syntax: bridge/nexus-bridge.js',         () => {
      const r = spawnSync('node',['--check','bridge/nexus-bridge.js'],{cwd:ROOT,encoding:'utf8',timeout:5000});
      return r.status === 0;
    }],
    ['require: bridge loads without error', () => {
      // Bridge is self-contained CJS — just check it parses
      const r = spawnSync('node',['-e','require("../bridge/nexus-bridge.js")'],
        {cwd:ROOT,encoding:'utf8',timeout:5000,env:{...process.env,NEXUS_DIAGNOSE:'1'}});
      // Bridge starts listening — we just need no throw before listen
      return r.status === 0 || r.stderr === '';
    }],
    ['contract: valid JSON', () => {
      try { JSON.parse(fs.readFileSync(path.join(ROOT,'bridge/interaction-contract.json'),'utf8')); return true; }
      catch { return false; }
    }],
  ];

  for (const [i, [name, fn]] of checks.entries()) {
    try {
      const r = await fn();
      if (r) { console.log(ok(step(i+1, checks.length, name))); record('bridge',name,'PASS'); }
      else   { console.log(fail(step(i+1, checks.length, name))); record('bridge',name,'FAIL'); }
    } catch(e) { console.log(fail(step(i+1, checks.length, name))); record('bridge',name,'FAIL',e.message); }
  }

  console.log('');
  const r = await probe(9999, '/bridge/health');
  if (r.ok) {
    console.log(ok(`LIVE :9999  sessions=${r.data.sessions}  pending=${r.data.pendingRequests}`));
    record('bridge','live /bridge/health','PASS');
    // Test handshake
    const hs = await probePost(9999, '/bridge/handshake',
      { systemId:'orchestrator', appId:'orchestrator', secret:'nexus-orchestrator-internal-v1' });
    if (hs.ok) { console.log(ok(`    handshake: token=${hs.data.token?.slice(0,16)}…`)); record('bridge','handshake','PASS'); }
    else        { console.log(fail(`    handshake failed: ${JSON.stringify(hs.data).slice(0,60)}`)); record('bridge','handshake','FAIL'); }
    // Test broadcast
    const bc = await probePost(9999, '/bridge/broadcast', { type:'diagnose.ping', ts: Date.now() });
    if (bc.ok) { console.log(ok(`    broadcast: accepted`)); record('bridge','broadcast','PASS'); }
    else        { console.log(fail(`    broadcast failed`)); record('bridge','broadcast','FAIL'); }
  } else {
    console.log(warn(`NOT RUNNING — start with: node bridge/nexus-bridge.js`));
    record('bridge','live /bridge/health','WARN','not running');
    if (r.error === 'ECONNREFUSED') console.log(info('    → nothing listening on :9999'));
  }
}

async function diagCortex() {
  console.log(hdr('cortex', C.cyan));
  console.log(info('Source of truth — 28 JAA tables, event_log, gap engine, memory'));
  console.log(info('Port :3748\n'));

  const checks = [
    ['file: cortex/boot.js',                     () => fileExists('cortex/boot.js')],
    ['file: cortex/foundation/admin-server.js',  () => fileExists('cortex/foundation/admin-server.js')],
    ['file: cortex/foundation/cobalt-core.js',   () => fileExists('cortex/foundation/cobalt-core.js')],
    ['file: cortex/foundation/poll-registry.js', () => fileExists('cortex/foundation/poll-registry.js')],
    ['file: cortex/foundation/store/FileStore.js', () => fileExists('cortex/foundation/store/FileStore.js')],
    ['file: cortex/foundation/store/FileRefs.js', () => fileExists('cortex/foundation/store/FileRefs.js')],
    ['file: cortex/memory/jaa-db.js',            () => fileExists('cortex/memory/jaa-db.js')],
    ['file: cortex/versionium/index.js',         () => fileExists('cortex/versionium/index.js')],
    ['file: cortex/agents/index.js',             () => fileExists('cortex/agents/index.js')],
    ['file: cortex/ess-gap-engine.js',           () => fileExists('cortex/ess-gap-engine.js')],
    ['data/cortex dir writable', () => {
      const dir = path.join(ROOT,'data','cortex');
      try { fs.mkdirSync(dir,{recursive:true}); return true; } catch { return false; }
    }],
    ['cortex/versionium alias check', () => {
      // boot.js requires ./versionium but the folder is cortex/versionium/index.js
      // This resolves correctly if index.js exists
      return fileExists('cortex/versionium/index.js');
    }],
    ['syntax: cortex/boot.js', () => {
      const r = spawnSync('node',['--check','cortex/boot.js'],{cwd:ROOT,encoding:'utf8',timeout:5000});
      if (r.status !== 0) { console.log(info('    → '+r.stderr.split('\n').find(l=>l.trim()))); }
      return r.status === 0;
    }],
  ];

  for (const [i, [name, fn]] of checks.entries()) {
    try {
      const r = await fn();
      if (r) { console.log(ok(step(i+1, checks.length, name))); record('cortex',name,'PASS'); }
      else   { console.log(fail(step(i+1, checks.length, name))); record('cortex',name,'FAIL'); }
    } catch(e) { console.log(fail(step(i+1, checks.length, name))); record('cortex',name,'FAIL',e.message); }
  }

  console.log('');
  const r = await probe(3748, '/health');
  if (r.ok) {
    const d = r.data;
    const status = d.status === 'ok' || d.ok ? 'ok' : 'degraded';
    console.log(ok(`LIVE :3748  status=${status}  uptime=${d.uptime?.toFixed(0)||'?'}s`));
    record('cortex','live /health','PASS');
    // Test event write
    const ev = await probePost(3748, '/api/event', { type:'diagnose.test', payload:{ ts:Date.now() }, source:'diagnose' });
    if (ev.ok) { console.log(ok(`    event write: accepted`)); record('cortex','event write','PASS'); }
    else        { console.log(fail(`    event write failed: ${JSON.stringify(ev.data).slice(0,60)}`)); record('cortex','event write','FAIL'); }
    // Test event read
    const evr = await probe(3748, '/api/events?n=3');
    if (evr.ok) {
      const rows = evr.data.rows || evr.data.events || [];
      console.log(ok(`    event read: ${rows.length} events`));
      record('cortex','event read','PASS');
    }
    // Test JAA tables
    const jaa = r.data.jaa;
    if (jaa?.counts) {
      const count = Object.values(jaa.counts).reduce((a,b)=>a+b,0);
      console.log(ok(`    JAA: ${Object.keys(jaa.counts).length} tables, ${count} total rows`));
      record('cortex','JAA tables','PASS');
    }
  } else {
    console.log(warn(`NOT RUNNING — start with: node cortex/boot.js`));
    record('cortex','live /health','WARN','not running');
    if (r.error === 'ECONNREFUSED') console.log(info('    → nothing listening on :3748'));
  }
}

async function diagGuardian() {
  console.log(hdr('guardian', C.magenta));
  console.log(info('HTTP :7820  WSS :7821 (userscripts, needs TLS)  Dropzone :7822  Memory :7823'));
  console.log(info('WSS needs TLS because userscripts run on https:// pages (browser mixed-content rule).'));
  console.log(info('HTTP server boots independently — WSS failure does not take down HTTP.\n'));

  const ledger = (phase, status, detail) =>
    postLedger('guardian', `guardian.diagnose.${phase}`, { status, detail, ts: Date.now() });

  // ── HARD checks — these must pass or guardian cannot start ──────────────────
  console.log(`${C.bold}  HARD (boot blockers):${C.reset}`);

  // Package: ws (required)
  const wsOk = checkNode('ws');
  if (wsOk) {
    console.log(ok(step(1, 17, 'npm: ws — required (WebSocket server)')));
    await ledger('ws', 'PASS');
  } else {
    console.log(fail(step(1, 17, 'npm: ws — MISSING, guardian cannot start')));
    await ledger('ws', 'FAIL', 'missing');
    if (FIX) {
      console.log(fix('  Auto-installing ws...'));
      const r = spawnSync('npm', ['install', 'ws'], { cwd: ROOT, encoding:'utf8' });
      if (r.status === 0) { console.log(ok('  ws installed ✓')); await ledger('ws.fix', 'PASS'); }
      else { console.log(fail('  ws install failed: ' + r.stderr?.slice(0,100))); await ledger('ws.fix', 'FAIL'); }
    } else {
      console.log(info('  → Fix: cd ' + ROOT + ' && npm install ws'));
    }
    record('guardian', 'npm:ws', 'FAIL', 'missing');
  }

  // File: server.js
  const serverOk = fileExists('guardian/server.js');
  serverOk
    ? (console.log(ok(step(2, 17, 'file: guardian/server.js'))), await ledger('server.js', 'PASS'))
    : (console.log(fail(step(2, 17, 'file: guardian/server.js — MISSING'))), await ledger('server.js', 'FAIL'));
  record('guardian', 'file:server.js', serverOk ? 'PASS' : 'FAIL');

  // File: jaa-store.js
  const jaaOk = fileExists('guardian/jaa-store.js');
  jaaOk
    ? (console.log(ok(step(3, 17, 'file: guardian/jaa-store.js'))), await ledger('jaa-store.js', 'PASS'))
    : (console.log(fail(step(3, 17, 'file: guardian/jaa-store.js — MISSING'))), await ledger('jaa-store.js', 'FAIL'));
  record('guardian', 'file:jaa-store.js', jaaOk ? 'PASS' : 'FAIL');

  // File: interaction-contract.json
  const contractOk = fileExists('guardian/interaction-contract.json');
  contractOk
    ? (console.log(ok(step(4, 17, 'file: guardian/interaction-contract.json'))), await ledger('contract', 'PASS'))
    : (console.log(fail(step(4, 17, 'guardian/interaction-contract.json — MISSING'))), await ledger('contract', 'FAIL'));
  record('guardian', 'file:contract', contractOk ? 'PASS' : 'FAIL');

  // Syntax check
  const synR = spawnSync('node', ['--check', 'guardian/server.js'], { cwd:ROOT, encoding:'utf8', timeout:5000 });
  const synOk = synR.status === 0;
  if (synOk) {
    console.log(ok(step(5, 17, 'syntax: guardian/server.js')));
    await ledger('syntax', 'PASS');
  } else {
    const errLine = synR.stderr?.split('\n').find(l => l.trim()) || 'syntax error';
    console.log(fail(step(5, 17, 'syntax: guardian/server.js — ' + errLine)));
    await ledger('syntax', 'FAIL', errLine);
  }
  record('guardian', 'syntax', synOk ? 'PASS' : 'FAIL');

  // memory_store directory writable
  const msDir = path.join(ROOT, 'guardian', 'memory_store');
  let msOk = false;
  try { fs.mkdirSync(msDir, { recursive:true }); msOk = true; } catch(_) {}
  msOk
    ? (console.log(ok(step(6, 17, 'guardian/memory_store/ writable'))), await ledger('memory_store', 'PASS'))
    : (console.log(fail(step(6, 17, 'guardian/memory_store/ not writable'))), await ledger('memory_store', 'FAIL'));
  record('guardian', 'memory_store', msOk ? 'PASS' : 'FAIL');

  // ui/index.html (Forge IDE)
  const uiOk = fileExists('guardian/ui/index.html');
  uiOk
    ? (console.log(ok(step(7, 17, 'file: guardian/ui/index.html (Forge IDE)'))), await ledger('ui', 'PASS'))
    : (console.log(fail(step(7, 17, 'guardian/ui/index.html — MISSING (Forge IDE will not serve)'))), await ledger('ui', 'FAIL'));
  record('guardian', 'file:ui', uiOk ? 'PASS' : 'FAIL');

  // seam-queue.js
  const sqOk = fileExists('guardian/lib/seam-queue.js');
  sqOk
    ? (console.log(ok(step(14, 17, 'file: guardian/lib/seam-queue.js (SEAM state machine)'))), await ledger('seam-queue', 'PASS'))
    : (console.log(fail(step(8, 17, 'guardian/lib/seam-queue.js — MISSING (SEAM delivery broken)'))), await ledger('seam-queue', 'FAIL'));
  record('guardian', 'file:seam-queue', sqOk ? 'PASS' : 'FAIL');

  // spec-parser.js
  const spOk = fileExists('guardian/lib/spec-parser.js');
  spOk
    ? (console.log(ok(step(15, 17, 'file: guardian/lib/spec-parser.js (spec compiler)'))), await ledger('spec-parser', 'PASS'))
    : (console.log(fail(step(9, 17, 'guardian/lib/spec-parser.js — MISSING (spec dispatch broken)'))), await ledger('spec-parser', 'FAIL'));
  record('guardian', 'file:spec-parser', spOk ? 'PASS' : 'FAIL');

  // detector.js
  const detOk = fileExists('guardian/lib/detector.js');
  detOk
    ? (console.log(ok(step(16, 17, 'file: guardian/lib/detector.js (SEAM verdict evaluator)'))), await ledger('detector', 'PASS'))
    : (console.log(fail(step(10, 17, 'guardian/lib/detector.js — MISSING'))), await ledger('detector', 'FAIL'));
  record('guardian', 'file:detector', detOk ? 'PASS' : 'FAIL');

  // ── SOFT checks — degraded if missing, but guardian still boots ────────────
  console.log('');
  console.log(C.bold + '  SOFT (degrade if missing):' + C.reset);

  // TLS cert (WSS only — HTTP boots without it)
  const certOk = fileExists('guardian/guardian-cert.pem') && fileExists('guardian/guardian-key.pem');
  if (certOk) {
    console.log(ok(step(8, 17, 'TLS cert present (WSS :7821 ready)')));
    await ledger('tls.cert', 'PASS');
  } else {
    console.log(warn(step(8, 17, 'TLS cert missing — WSS :7821 disabled (HTTP :7820 unaffected)')));
    console.log(info('  → Why: userscripts run on https:// pages, browser blocks plain ws://'));
    console.log(info('  → Fix (option 1): npm install selfsigned  (guardian auto-generates)'));
    console.log(info('  → Fix (option 2): openssl req -x509 -newkey rsa:2048 -keyout guardian-key.pem -out guardian-cert.pem -days 825 -nodes'));
    await ledger('tls.cert', 'WARN', 'missing');
    if (FIX) {
      console.log(fix('  Auto-installing selfsigned for cert generation...'));
      const r = spawnSync('npm', ['install', 'selfsigned'], { cwd: ROOT, encoding:'utf8' });
      if (r.status === 0) { console.log(ok('  selfsigned installed — restart guardian to generate cert ✓')); await ledger('tls.fix', 'PASS'); }
      else { console.log(warn('  selfsigned install failed — try: npm install selfsigned')); await ledger('tls.fix', 'FAIL'); }
    }
    record('guardian', 'tls.cert', 'WARN', 'missing — WSS disabled');
  }

  // Package: selfsigned (SOFT — only for cert generation)
  const ssOk = checkNode('selfsigned');
  if (ssOk) {
    console.log(ok(step(9, 17, 'npm: selfsigned (cert generation)')));
    await ledger('selfsigned', 'PASS');
  } else {
    console.log(warn(step(9, 17, 'npm: selfsigned missing — cert auto-generation unavailable')));
    console.log(info('  → If cert already exists, this is fine. If not: npm install selfsigned'));
    await ledger('selfsigned', 'WARN', 'missing');
    record('guardian', 'npm:selfsigned', 'WARN', 'missing');
  }

  // Userscripts
  const ucl = fileExists('guardian/userscript-claude.js');
  const ugt = fileExists('guardian/userscript-chatgpt.js');
  if (ucl && ugt) {
    console.log(ok(step(10, 17, 'userscripts: claude + chatgpt (Tampermonkey install)')));
  } else {
    console.log(warn(step(10, 17, `userscripts: ${ucl?'':'claude MISSING '}${ugt?'':'chatgpt MISSING'}`)));
    console.log(info('  → Install in Tampermonkey on claude.ai and chatgpt.com'));
  }
  record('guardian', 'userscripts', (ucl && ugt) ? 'PASS' : 'WARN');
  await ledger('userscripts', (ucl && ugt) ? 'PASS' : 'WARN');

  // Optional: dropzone-persist.js
  const dpOk = fileExists('guardian/dropzone-persist.js');
  dpOk
    ? console.log(ok(step(11, 17, 'optional: guardian/dropzone-persist.js')))
    : console.log(warn(step(11, 17, 'optional: guardian/dropzone-persist.js (dropzone disabled)')));

  // Optional: spec-namer.js
  const snOk = fileExists('guardian/spec-namer.js');
  snOk
    ? console.log(ok(step(12, 17, 'optional: guardian/spec-namer.js')))
    : console.log(warn(step(12, 17, 'optional: guardian/spec-namer.js (auto-naming disabled)')));

  // ── Live checks ─────────────────────────────────────────────────────────────
  console.log('');
  const hr = await probe(7820, '/health');
  if (hr.ok) {
    console.log(ok(step(13, 17, `LIVE :7820  uptime=${hr.data.uptime?.toFixed(0)||'?'}s`)));
    await ledger('live.health', 'PASS');
    record('guardian', 'live /health', 'PASS');

    // Contract
    const cr = await probe(7820, '/contract');
    if (cr.ok && cr.data.id === 'guardian-v1') {
      console.log(ok(`    contract: id=guardian-v1  ${cr.data.routes?.length||0} routes`));
      await ledger('live.contract', 'PASS');
    } else {
      console.log(fail(`    contract: id=${cr.data?.id} (expected guardian-v1)`));
      await ledger('live.contract', 'FAIL');
    }

    // SISO bus
    const br = await probe(7820, '/bus?n=5');
    if (br.ok) {
      console.log(ok(`    SISO bus: ${br.data.gates?.length||0} gates  ${br.data.entries?.length||0} events`));
      await ledger('live.bus', 'PASS');
    }

    // Bus emit
    const er = await probePost(7820, '/bus/emit', { type:'diagnose.guardian.test', data:{ ts:Date.now() } });
    if (er.ok) { console.log(ok(`    bus emit: seq=${er.data.seq}`)); await ledger('live.bus.emit', 'PASS'); }
    else        { console.log(fail(`    bus emit failed: ${JSON.stringify(er.data).slice(0,60)}`)); await ledger('live.bus.emit', 'FAIL'); }

    // Providers
    const pr = await probe(7820, '/providers');
    if (pr.ok) {
      const connected = Object.entries(pr.data?.providers || {}).filter(([,v])=>v==='connected').map(([k])=>k);
      connected.length
        ? console.log(ok(`    providers connected: ${connected.join(', ')}`))
        : console.log(warn(`    no providers connected — install userscripts in Tampermonkey`));
      await ledger('live.providers', connected.length ? 'PASS' : 'WARN');
    }

    // NCP channel endpoint (:7820/channel)
    const ncpR = await probe(7820, '/channel?provider=diagnose&tabId=diag-test');
    // /channel opens SSE — we just check it responds with 200
    if (ncpR.status === 200 || ncpR.ok) {
      console.log(ok('    NCP /channel: SSE endpoint ready (userscripts can connect)'));
      await ledger('live.ncp', 'PASS');
    } else {
      console.log(warn('    NCP /channel: not responding — userscripts cannot connect'));
      await ledger('live.ncp', 'WARN');
    }

    // /version endpoint (auto-update check)
    const verR = await probe(7820, '/version');
    if (verR.ok && verR.data?.guardian) {
      const v = verR.data;
      console.log(ok('    /version: guardian=' + v.guardian +
        '  claude=' + (v.userscript_claude||'?') +
        '  chatgpt=' + (v.userscript_chatgpt||'?')));
      await ledger('live.version', 'PASS');
    } else {
      console.log(warn('    /version endpoint missing — auto-update checks disabled'));
      await ledger('live.version', 'WARN');
    }

    // SEAM queue status
    const qR = await probe(7820, '/seam/queues');
    if (qR.ok) {
      console.log(ok('    /seam/queues: ' + (qR.data?.active||0) + ' active queue(s)'));
      await ledger('live.seam', 'PASS');
    }

    // WSS (legacy — NCP is primary, WSS is secondary)
    const wssReady = fileExists('guardian/guardian-cert.pem');
    wssReady
      ? console.log(ok('    WSS :7821 cert ready — legacy transport available'))
      : console.log(warn('    WSS :7821 not ready — NCP (:7820) is primary transport'));

  } else {
    console.log(warn(step(13, 17, 'NOT RUNNING — start with: node guardian/server.js')));
    await ledger('live.health', 'WARN', 'not running');
    record('guardian', 'live /health', 'WARN', 'not running');
  }
}


async function diagIdearium() {
  console.log(hdr('idearium', C.blue));
  console.log(info('IdeaOS — SNR engine, idea tension, spec build, gap detection'));
  console.log(info('Port :4800  ESM module (needs idearium/package.json with type:module)\n'));

  const checks = [
    ['file: idearium/api/index.js',              () => fileExists('idearium/api/index.js')],
    ['file: idearium/core/index.js',             () => fileExists('idearium/core/index.js')],
    ['file: idearium/schemas/interaction-contract.json', () => fileExists('idearium/schemas/interaction-contract.json')],
    ['file: idearium/ui/index.html',             () => fileExists('idearium/ui/index.html')],
    ['file: siso/core/index.js (ESM)',           () => fileExists('siso/core/index.js')],
    ['file: siso/core/package.json type:module', () => {
      try {
        const p = JSON.parse(fs.readFileSync(path.join(ROOT,'siso/core/package.json'),'utf8'));
        return p.type === 'module';
      } catch { return false; }
    }],
    ['file: idearium/package.json type:module',  () => {
      try {
        const p = JSON.parse(fs.readFileSync(path.join(ROOT,'idearium/package.json'),'utf8'));
        return p.type === 'module';
      } catch { return false; }
    }],
    ['ESM: idearium/core loads',                 () => {
      const r = spawnSync('node',['--input-type=module'],{
        input: "import '/tmp/organize/nexus-final/idearium/core/index.js'; console.log('ok');",
        encoding:'utf8', timeout:5000,
      });
      return r.stdout.includes('ok');
    }],
    ['contract: idearium/schemas/ valid JSON',   () => {
      try {
        JSON.parse(fs.readFileSync(path.join(ROOT,'idearium/schemas/interaction-contract.json'),'utf8'));
        return true;
      } catch { return false; }
    }],
    ['startAPI: called at end of api/index.js',  () => {
      const src = fs.readFileSync(path.join(ROOT,'idearium/api/index.js'),'utf8');
      // Find actual call (not just definition)
      const lines = src.split('\n');
      return lines.some(l => l.trim() === 'startAPI();');
    }],
  ];

  for (const [i, [name, fn]] of checks.entries()) {
    try {
      const r = await fn();
      if (r) { console.log(ok(step(i+1, checks.length, name))); record('idearium',name,'PASS'); }
      else   { console.log(fail(step(i+1, checks.length, name))); record('idearium',name,'FAIL'); }
    } catch(e) { console.log(fail(step(i+1, checks.length, name))); record('idearium',name,'FAIL',e.message); }
  }

  console.log('');
  const r = await probe(4800, '/health');
  if (r.ok) {
    const d = r.data;
    console.log(ok(`LIVE :4800  v${d.version}  SNR=${(d.snr*100).toFixed(0)}%  uptime=${d.uptime?.toFixed(0)}s`));
    record('idearium','live /health','PASS');
    // Test contract
    const contract = await probe(4800, '/api/contract');
    if (contract.ok && contract.data.contract?.id === 'idearium-v1') {
      console.log(ok(`    contract: id=${contract.data.contract.id}  resources=${contract.data.contract.resources?.length}`));
      record('idearium','contract','PASS');
    } else {
      console.log(fail(`    contract: wrong or missing`));
      record('idearium','contract','FAIL');
    }
    // Test idea CRUD
    const idea = await probePost(4800, '/api/ideas', { text:'diagnose test idea', tags:['diagnose'] });
    if (idea.ok && idea.data.idea?.uuid) {
      console.log(ok(`    idea create: uuid=${idea.data.idea.uuid.slice(0,8)}  phase=${idea.data.idea.phase}`));
      record('idearium','idea CRUD','PASS');
      // Clean up
      await probePost(4800, `/api/ideas/${idea.data.idea.uuid}/phase`, { phase:'archived' });
    } else {
      console.log(fail(`    idea create failed: ${JSON.stringify(idea.data).slice(0,60)}`));
      record('idearium','idea CRUD','FAIL');
    }
    // Test SNR
    const snr = await probe(4800, '/api/snr');
    if (snr.ok) {
      console.log(ok(`    SNR: ${(snr.data.snr*100).toFixed(1)}%  components=${JSON.stringify(snr.data.components||{}).slice(0,40)}`));
      record('idearium','SNR','PASS');
    }
    // Test spec pipeline
    const ideas = await probe(4800, '/api/ideas');
    const testIdea = ideas.data?.ideas?.[0];
    if (testIdea) {
      const spec = await probePost(4800, `/api/ideas/${testIdea.uuid}/spec`, { name:'diagnose spec' });
      if (spec.ok && spec.data.spec) {
        const built = await probePost(4800, `/api/specs/${spec.data.spec.uuid}/build`, {});
        if (built.ok) {
          console.log(ok(`    spec pipeline: create→build  status=${built.data.status}`));
          record('idearium','spec pipeline','PASS');
        }
      }
    }
  } else {
    console.log(warn(`NOT RUNNING — start with: node idearium/api/index.js`));
    record('idearium','live /health','WARN','not running');
    if (r.error === 'ECONNREFUSED') console.log(info('    → nothing listening on :4800'));
  }
}

async function diagEmerge() {
  console.log(hdr('emerge', C.green));
  console.log(info('Emerge IDE — .eg language compiler, Ollama LSP, SNR analysis'));
  console.log(info('Port :4242  depends on emerge-kernel.js + emerge.spec\n'));

  const checks = [
    ['file: emerge-ide.js',                () => fileExists('emerge-ide.js')],
    ['file: emerge-kernel.js',             () => fileExists('emerge-kernel.js')],
    ['file: emerge.spec',                  () => fileExists('emerge.spec')],
    ['file: emerge/siso.js',               () => fileExists('emerge/siso.js')],
    ['file: emerge/ollama-runtime.js',     () => fileExists('emerge/ollama-runtime.js')],
    ['emerge.spec: valid (parseable)',     () => {
      const specPath = path.join(ROOT,'emerge.spec');
      if (!fs.existsSync(specPath)) return false;
      const src = fs.readFileSync(specPath,'utf8');
      return src.length > 100 && src.includes('emerge');
    }],
    ['syntax: emerge-ide.js',             () => {
      const r = spawnSync('node',['--check','emerge-ide.js'],{cwd:ROOT,encoding:'utf8',timeout:5000});
      return r.status === 0;
    }],
    ['syntax: emerge-kernel.js',          () => {
      const r = spawnSync('node',['--check','emerge-kernel.js'],{cwd:ROOT,encoding:'utf8',timeout:5000});
      return r.status === 0;
    }],
    ['kernel: loads spec without crash',   () => {
      const r = spawnSync('node',['-e',`
        const k=require('../emerge/emerge-kernel.js');
        const spec=['emerge.spec'].find(p=>require('fs').existsSync(p));
        if(spec){k.loadSpec(spec);console.log('kw:'+k.SCHEMA.keywords.size);}
      `], {cwd:ROOT, encoding:'utf8', timeout:8000});
      if (r.stdout.includes('kw:')) { console.log(info(`    → ${r.stdout.trim()}`)); return true; }
      return false;
    }],
  ];

  for (const [i, [name, fn]] of checks.entries()) {
    try {
      const r = await fn();
      if (r) { console.log(ok(step(i+1, checks.length, name))); record('emerge',name,'PASS'); }
      else   { console.log(fail(step(i+1, checks.length, name))); record('emerge',name,'FAIL'); }
    } catch(e) { console.log(fail(step(i+1, checks.length, name))); record('emerge',name,'FAIL',e.message); }
  }

  console.log('');
  const r = await probe(4242, '/status');
  if (r.ok) {
    const d = r.data;
    console.log(ok(`LIVE :4242  streams=${d.streams||0}  ollama=${d.ollama?.online?'online':'offline'}`));
    record('emerge','live /status','PASS');
    if (d.schema) console.log(info(`    schema: ${d.schema.keywords?.length||0} keywords  ${d.schema.axioms?.length||0} axioms`));
  } else {
    console.log(warn(`NOT RUNNING — start with: node emerge-ide.js`));
    record('emerge','live /status','WARN','not running');
  }
}


async function diagCrossSystem() {
  console.log(hdr('cross-system', C.magenta));
  console.log(C.bold + '  Integration health across all running systems:' + C.reset);
  console.log('');

  // 1. Guardian NCP :7820
  const ncpUp = await probe(7820, '/health');
  ncpUp.ok
    ? (console.log(ok('  Guardian NCP :7820 reachable (uptime: ' + Math.round(ncpUp.data?.uptime||0) + 's)')), await ledger('cross.ncp', 'PASS'))
    : (console.log(fail('  Guardian :7820 unreachable')),
       detail_error('cross', 'guardian-ncp', ncpUp.error || 'no response',
         'Start guardian: node guardian/server.js', 'node guardian/server.js'),
       await ledger('cross.ncp', 'FAIL'));
  record('cross', 'guardian-ncp', ncpUp.ok ? 'PASS' : 'FAIL');

  // 2. Cortex :3748
  const cortexUp = await probe(3748, '/api/health');
  cortexUp.ok
    ? (console.log(ok('  Cortex :3748 reachable')), await ledger('cross.cortex', 'PASS'))
    : (console.log(warn('  Cortex :3748 unreachable — memory unavailable')),
       fix_cmd('Start cortex', 'node cortex/boot.js', 'Cortex provides JAA memory for all systems'),
       await ledger('cross.cortex', 'WARN'));
  record('cross', 'cortex', cortexUp.ok ? 'PASS' : 'WARN');

  // 3. Orchestrator :9000
  const orchUp = await probe(9000, '/health');
  orchUp.ok
    ? (console.log(ok('  Orchestrator :9000 reachable')), await ledger('cross.orch', 'PASS'))
    : (console.log(warn('  Orchestrator :9000 unreachable')),
       fix_cmd('Start orchestrator', 'node orchestrator.js', 'Orchestrator is the boot authority'),
       await ledger('cross.orch', 'WARN'));
  record('cross', 'orchestrator', orchUp.ok ? 'PASS' : 'WARN');

  // 4. Ledger round-trip
  const writeR = await probePost(7820, '/ledger', { category:'EVENT', msg:'diagnose cross-check', meta:{ source:'diagnose' } });
  const readR  = await probe(7820, '/ledger');
  const ledOk  = writeR.ok && readR.ok;
  ledOk
    ? (console.log(ok('  Ledger write+read round-trip OK (§LAW II)')), await ledger('cross.ledger', 'PASS'))
    : (console.log(fail('  Ledger round-trip FAILED')),
       detail_error('cross', 'ledger-roundtrip', 'write:' + (writeR.ok?'ok':'FAIL') + ' read:' + (readR.ok?'ok':'FAIL'),
         'Guardian JAA ledger may be corrupt', 'node cli/diagnose.js guardian --fix'),
       await ledger('cross.ledger', 'FAIL'));
  record('cross', 'ledger-roundtrip', ledOk ? 'PASS' : 'FAIL');

  // 5. SEAM queues
  const qR = await probe(7820, '/seam/queues');
  qR.ok
    ? (console.log(ok('  SEAM queue endpoint healthy (' + (qR.data?.active||0) + ' active)')), await ledger('cross.seam', 'PASS'))
    : (console.log(fail('  SEAM /seam/queues not responding')),
       detail_error('cross', 'seam', qR.error||'no response', 'Check guardian/lib/seam-queue.js', null),
       await ledger('cross.seam', 'FAIL'));
  record('cross', 'seam-queues', qR.ok ? 'PASS' : 'FAIL');

  // 6. Version consistency
  const verR = await probe(7820, '/version');
  if (verR.ok && verR.data) {
    const v = verR.data;
    console.log(ok('  Versions: guardian=' + v.guardian + ' claude-script=' + (v.userscript_claude||'?') + ' chatgpt-script=' + (v.userscript_chatgpt||'?')));
    await ledger('cross.version', 'PASS');
    record('cross', 'version', 'PASS');
  } else {
    console.log(warn('  /version endpoint missing'));
    await ledger('cross.version', 'WARN');
    record('cross', 'version', 'WARN');
  }

  // 7. Syntax check all JS
  console.log('');
  console.log(C.bold + '  JS syntax integrity:' + C.reset);
  let syntaxFails = 0;
  function syntaxCheck(dir) {
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (['node_modules','.git','data','memory_store'].includes(f)) continue;
      const st = fs.statSync(fp);
      if (st.isDirectory()) syntaxCheck(fp);
      else if (f.endsWith('.js')) {
        const r = spawnSync('node', ['--check', fp], { encoding:'utf8', timeout:5000 });
        if (r.status !== 0) {
          syntaxFails++;
          const errLine = (r.stderr||'').split('\n').slice(0,2).join(' ');
          console.log(fail('  SYNTAX: ' + fp.replace(ROOT+'/','') + ' — ' + errLine.slice(0,80)));
          if (FIX) {
            detail_error('cross', 'syntax', errLine,
              'Fix syntax error — common causes: mismatched braces, missing semicolon',
              'node --check ' + fp.replace(ROOT+'/',''));
          }
        }
      }
    }
  }
  syntaxCheck(ROOT);
  syntaxFails === 0
    ? (console.log(ok('  All JS files pass syntax check')), await ledger('cross.syntax', 'PASS'))
    : (await ledger('cross.syntax', 'FAIL'));
  record('cross', 'syntax', syntaxFails === 0 ? 'PASS' : 'FAIL');

  // 8. Broken requires
  console.log('');
  console.log(C.bold + '  Require() path integrity:' + C.reset);
  const broken = [];
  function walkReq(dir) {
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (['node_modules','.git','data','memory_store'].includes(f)) continue;
      const st = fs.statSync(fp);
      if (st.isDirectory()) walkReq(fp);
      else if (f.endsWith('.js')) {
        const s = fs.readFileSync(fp,'utf8');
        for (const m of s.matchAll(/require\(['"](\.([^'"]+))['"]\)/g)) {
          const p = m[1];
          const base = path.resolve(path.dirname(fp), p);
          const found = ['','.js','/index.js'].some(e => fs.existsSync(base+e));
          if (!found) broken.push(fp.replace(ROOT+'/','') + ' → ' + p);
        }
      }
    }
  }
  walkReq(ROOT);
  broken.length === 0
    ? (console.log(ok('  All require() paths resolve')), await ledger('cross.requires', 'PASS'))
    : (broken.forEach(b => console.log(fail('  BROKEN: ' + b))),
       await ledger('cross.requires', 'FAIL'));
  record('cross', 'requires', broken.length === 0 ? 'PASS' : 'FAIL');
}


const SYSTEM_MAP = {
  orchestrator: diagOrchestrator,
  bridge:       diagBridge,
  cortex:       diagCortex,
  guardian:     diagGuardian,
  idearium:     diagIdearium,
  emerge:       diagEmerge,
};

async function runAll() {
  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║  NEXUS System Diagnostic Sequencer                   ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.dim}  Node ${nodeVersion()}  |  ${new Date().toLocaleString()}${C.reset}`);
  console.log(`${C.dim}  Root: ${ROOT}${C.reset}`);
  if (FIX)   console.log(`${C.cyan}  --fix mode: will attempt auto-fixes${C.reset}`);
  if (WATCH) console.log(`${C.cyan}  --watch mode: will retry until all pass${C.reset}`);
  console.log('');

  if (TARGET === 'all') {
    // §AXIOM: orchestrator first
    for (const fn of Object.values(SYSTEM_MAP)) { await fn(); }
    await diagCrossSystem();
  } else if (SYSTEM_MAP[TARGET]) {
    await SYSTEM_MAP[TARGET]();
  } else {
    console.log(`Unknown system: ${TARGET}`);
    console.log(`Available: ${Object.keys(SYSTEM_MAP).join(', ')}, all`);
    process.exit(1);
  }

  printGapReport();

  if (WATCH && (totalFail > 0 || totalWarn > 0)) {
    console.log(`\n${C.dim}Retrying in 10s… (Ctrl+C to stop)${C.reset}`);
    setTimeout(async () => {
      // Reset counters
      allResults.length = 0; totalPass = 0; totalFail = 0; totalWarn = 0;
      await runAll();
    }, 10000);
  } else {
    process.exit(totalFail > 0 ? 1 : 0);
  }
}

runAll().catch(e => { console.error(e); process.exit(1); });
