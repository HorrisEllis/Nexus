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
      const r = spawnSync('node',['-e','require("./bridge/nexus-bridge.js")'],
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
    console.log(ok(step(1, 13, 'npm: ws — required (WebSocket server)')));
    await ledger('ws', 'PASS');
  } else {
    console.log(fail(step(1, 13, 'npm: ws — MISSING, guardian cannot start')));
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
    ? (console.log(ok(step(2, 13, 'file: guardian/server.js'))), await ledger('server.js', 'PASS'))
    : (console.log(fail(step(2, 13, 'file: guardian/server.js — MISSING'))), await ledger('server.js', 'FAIL'));
  record('guardian', 'file:server.js', serverOk ? 'PASS' : 'FAIL');

  // File: jaa-store.js
  const jaaOk = fileExists('guardian/jaa-store.js');
  jaaOk
    ? (console.log(ok(step(3, 13, 'file: guardian/jaa-store.js'))), await ledger('jaa-store.js', 'PASS'))
    : (console.log(fail(step(3, 13, 'file: guardian/jaa-store.js — MISSING'))), await ledger('jaa-store.js', 'FAIL'));
  record('guardian', 'file:jaa-store.js', jaaOk ? 'PASS' : 'FAIL');

  // File: interaction-contract.json
  const contractOk = fileExists('guardian/interaction-contract.json');
  contractOk
    ? (console.log(ok(step(4, 13, 'file: guardian/interaction-contract.json'))), await ledger('contract', 'PASS'))
    : (console.log(fail(step(4, 13, 'guardian/interaction-contract.json — MISSING'))), await ledger('contract', 'FAIL'));
  record('guardian', 'file:contract', contractOk ? 'PASS' : 'FAIL');

  // Syntax check
  const synR = spawnSync('node', ['--check', 'guardian/server.js'], { cwd:ROOT, encoding:'utf8', timeout:5000 });
  const synOk = synR.status === 0;
  if (synOk) {
    console.log(ok(step(5, 13, 'syntax: guardian/server.js')));
    await ledger('syntax', 'PASS');
  } else {
    const errLine = synR.stderr?.split('\n').find(l => l.trim()) || 'syntax error';
    console.log(fail(step(5, 13, 'syntax: guardian/server.js — ' + errLine)));
    await ledger('syntax', 'FAIL', errLine);
  }
  record('guardian', 'syntax', synOk ? 'PASS' : 'FAIL');

  // memory_store directory writable
  const msDir = path.join(ROOT, 'guardian', 'memory_store');
  let msOk = false;
  try { fs.mkdirSync(msDir, { recursive:true }); msOk = true; } catch(_) {}
  msOk
    ? (console.log(ok(step(6, 13, 'guardian/memory_store/ writable'))), await ledger('memory_store', 'PASS'))
    : (console.log(fail(step(6, 13, 'guardian/memory_store/ not writable'))), await ledger('memory_store', 'FAIL'));
  record('guardian', 'memory_store', msOk ? 'PASS' : 'FAIL');

  // ui/index.html (Forge IDE)
  const uiOk = fileExists('guardian/ui/index.html');
  uiOk
    ? (console.log(ok(step(7, 13, 'file: guardian/ui/index.html (Forge IDE)'))), await ledger('ui', 'PASS'))
    : (console.log(fail(step(7, 13, 'guardian/ui/index.html — MISSING (Forge IDE will not serve)'))), await ledger('ui', 'FAIL'));
  record('guardian', 'file:ui', uiOk ? 'PASS' : 'FAIL');

  // ── SOFT checks — degraded if missing, but guardian still boots ────────────
  console.log('');
  console.log(C.bold + '  SOFT (degrade if missing):' + C.reset);

  // TLS cert (WSS only — HTTP boots without it)
  const certOk = fileExists('guardian/guardian-cert.pem') && fileExists('guardian/guardian-key.pem');
  if (certOk) {
    console.log(ok(step(8, 13, 'TLS cert present (WSS :7821 ready)')));
    await ledger('tls.cert', 'PASS');
  } else {
    console.log(warn(step(8, 13, 'TLS cert missing — WSS :7821 disabled (HTTP :7820 unaffected)')));
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
    console.log(ok(step(9, 13, 'npm: selfsigned (cert generation)')));
    await ledger('selfsigned', 'PASS');
  } else {
    console.log(warn(step(9, 13, 'npm: selfsigned missing — cert auto-generation unavailable')));
    console.log(info('  → If cert already exists, this is fine. If not: npm install selfsigned'));
    await ledger('selfsigned', 'WARN', 'missing');
    record('guardian', 'npm:selfsigned', 'WARN', 'missing');
  }

  // Userscripts
  const ucl = fileExists('guardian/userscript-claude.js');
  const ugt = fileExists('guardian/userscript-chatgpt.js');
  if (ucl && ugt) {
    console.log(ok(step(10, 13, 'userscripts: claude + chatgpt (Tampermonkey install)')));
  } else {
    console.log(warn(step(10, 13, `userscripts: ${ucl?'':'claude MISSING '}${ugt?'':'chatgpt MISSING'}`)));
    console.log(info('  → Install in Tampermonkey on claude.ai and chatgpt.com'));
  }
  record('guardian', 'userscripts', (ucl && ugt) ? 'PASS' : 'WARN');
  await ledger('userscripts', (ucl && ugt) ? 'PASS' : 'WARN');

  // Optional: dropzone-persist.js
  const dpOk = fileExists('guardian/dropzone-persist.js');
  dpOk
    ? console.log(ok(step(11, 13, 'optional: guardian/dropzone-persist.js')))
    : console.log(warn(step(11, 13, 'optional: guardian/dropzone-persist.js (dropzone disabled)')));

  // Optional: spec-namer.js
  const snOk = fileExists('guardian/spec-namer.js');
  snOk
    ? console.log(ok(step(12, 13, 'optional: guardian/spec-namer.js')))
    : console.log(warn(step(12, 13, 'optional: guardian/spec-namer.js (auto-naming disabled)')));

  // ── Live checks ─────────────────────────────────────────────────────────────
  console.log('');
  const hr = await probe(7820, '/health');
  if (hr.ok) {
    console.log(ok(step(13, 13, `LIVE :7820  uptime=${hr.data.uptime?.toFixed(0)||'?'}s`)));
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

    // WSS
    const wssReady = fileExists('guardian/guardian-cert.pem');
    wssReady
      ? console.log(ok(`    WSS :7821 cert ready — visit https://127.0.0.1:7821/ once to accept`))
      : console.log(warn(`    WSS :7821 not ready — TLS cert missing`));

  } else {
    console.log(warn(step(13, 13, 'NOT RUNNING — start with: node guardian/server.js')));
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
        const k=require('./emerge-kernel.js');
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
  console.log(hdr('cross-system connections', C.dim+C.yellow));
  console.log(info('Tests the full §AXIOM connection flow: SISO bus → kernel → orchestrator\n'));

  const online = {};
  for (const [sys, port, path] of [
    ['orchestrator',9000,'/health'],['bridge',9999,'/bridge/health'],
    ['cortex',3748,'/health'],['guardian',7820,'/health'],['idearium',4800,'/health'],
  ]) {
    const r = await probe(port, path, 2000);
    online[sys] = r.ok;
  }

  const onlineCount = Object.values(online).filter(Boolean).length;
  console.log(`  Online: ${onlineCount}/5`);
  for (const [sys, up] of Object.entries(online)) {
    console.log(`  ${up ? C.green+'●' : C.red+'○'}${C.reset}  ${sys}`);
  }
  console.log('');

  // §AXIOM: orchestrator must be source of truth
  if (online.orchestrator) {
    const reg = await probe(9000, '/api/registry');
    const registry = reg.data?.registry || {};
    const registered = Object.keys(registry).filter(k => {
      const r = registry[k];
      return r.lastSeen && (Date.now() - r.lastSeen) < 30000;
    });
    if (registered.length) {
      console.log(ok(`§AXIOM registry: ${registered.join(', ')} have heartbeated`));
      record('cross','orchestrator registry','PASS');
    } else {
      console.log(warn(`§AXIOM registry: no systems have registered yet`));
      record('cross','orchestrator registry','WARN');
    }
  } else {
    console.log(warn(`orchestrator offline — §AXIOM violated: start it first`));
    record('cross','orchestrator §AXIOM','FAIL','not running');
  }

  // Bridge handshake from idearium
  if (online.bridge && online.idearium) {
    const idea = await probePost(4800, '/api/ideas', { text:'cross-system diag test', tags:['diag'] });
    if (idea.ok) {
      // Wait for it to propagate to orchestrator ledger
      await new Promise(r => setTimeout(r, 600));
      const ledger = await probe(9000, '/api/ledger?system=idearium&n=5');
      const found = ledger.data?.entries?.some(e => e.type?.includes('idea'));
      if (found) { console.log(ok(`idea.create → orchestrator ledger: propagated`)); record('cross','idearium→ledger','PASS'); }
      else        { console.log(warn(`idea.create → orchestrator ledger: NOT seen yet`)); record('cross','idearium→ledger','WARN'); }
    }
  }

  // Guardian bus → bridge broadcast
  if (online.guardian && online.bridge) {
    const testType = `diagnose.cross.${Date.now()}`;
    const emit = await probePost(7820, '/bus/emit', { type:testType, data:{ diag:true } });
    if (emit.ok) {
      console.log(ok(`guardian bus → bridge: emit seq=${emit.data.seq}`));
      record('cross','guardian→bridge','PASS');
    }
  }

  // Recall check
  if (online.orchestrator) {
    const recall = await probe(9000, '/api/recall?n=10');
    if (recall.ok && recall.data.entries?.length) {
      const systems = [...new Set(recall.data.entries.map(e=>e._system))];
      console.log(ok(`CLI recall: ${recall.data.entries.length} entries from [${systems.join(',')}]`));
      record('cross','recall','PASS');
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// GAP REPORT
// ═════════════════════════════════════════════════════════════════════════════

function printGapReport() {
  const gaps = allResults.filter(r => r.status === 'FAIL');
  const warns = allResults.filter(r => r.status === 'WARN');

  console.log(`\n${C.bold}${'═'.repeat(60)}${C.reset}`);
  console.log(`${C.bold}DIAGNOSTIC RESULTS${C.reset}`);
  console.log(`  ${C.green}✓ ${totalPass} passed${C.reset}   ${C.red}✗ ${totalFail} failed${C.reset}   ${C.yellow}⚠ ${totalWarn} warnings${C.reset}\n`);

  if (gaps.length) {
    console.log(`${C.bold}${C.red}GAPS TO FIX:${C.reset}`);
    for (const g of gaps) {
      console.log(`  ${C.red}✗${C.reset} [${g.system}] ${g.checkName}`);
      if (g.detail) console.log(`    ${C.dim}${g.detail.slice(0,100)}${C.reset}`);
    }
    console.log('');
  }

  if (warns.length) {
    console.log(`${C.bold}${C.yellow}SYSTEMS NOT RUNNING:${C.reset}`);
    for (const w of warns) {
      if (w.detail === 'not running') {
        const cmds = {
          orchestrator: 'node orchestrator.js',
          bridge:       'node bridge/nexus-bridge.js',
          cortex:       'node cortex/boot.js',
          guardian:     'node guardian/server.js',
          idearium:     'node idearium/api/index.js',
          emerge:       'node emerge-ide.js',
        };
        const cmd = cmds[w.system] || `node ${w.system}`;
        console.log(`  ${C.yellow}○${C.reset} ${w.system.padEnd(14)} → ${C.cyan}${cmd}${C.reset}`);
      }
    }
    console.log('');
    console.log(`  ${C.dim}Start in order (§AXIOM: orchestrator first):${C.reset}`);
    console.log(`  ${C.cyan}node orchestrator.js${C.reset}`);
    console.log(`  ${C.cyan}node bridge/nexus-bridge.js${C.reset}`);
    console.log(`  ${C.cyan}node cortex/boot.js${C.reset}`);
    console.log(`  ${C.cyan}node guardian/server.js${C.reset}`);
    console.log(`  ${C.cyan}node idearium/api/index.js${C.reset}`);
    console.log(`  ${C.cyan}node emerge-ide.js${C.reset}`);
    console.log('');
  }

  if (gaps.length === 0 && warns.every(w=>w.detail==='not running')) {
    console.log(`${C.green}${C.bold}All file/structural checks passed.${C.reset}`);
    console.log(`${C.dim}Start the systems above to bring them online.${C.reset}`);
  }

  // Save results
  const outPath = path.join(ROOT, 'tests', 'diagnose-results.json');
  fs.writeFileSync(outPath, JSON.stringify({ ts:Date.now(), pass:totalPass, fail:totalFail, warn:totalWarn, results:allResults }, null, 2));
  console.log(`\n${C.dim}Results saved: ${outPath}${C.reset}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════

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
