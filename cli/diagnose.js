#!/usr/bin/env node
'use strict';
/**
 * cli/diagnose.js — NEXUS System Diagnostic Sequencer
 * UUID: nexus-diagnose-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Runs each system's diagnostic sequence one by one.
 * Every check is gated, logged, personalized to the system's role.
 * Finds gaps, suggests fixes, runs tests, writes results.
 *
 * Usage:
 *   node cli/diagnose.js              # all systems
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
// §BUGFIX 2026-08-30 — real, confirmed bug from the uploaded audit
// (#2, "postLedger ReferenceError"): used at lines ~211/460 below but
// never required anywhere in this file. Real, exported function
// already exists in nexus-connect.js (used the same way by guardian/
// copilot/etc.) — was simply never imported here.
const { postLedger, postEvent } = require('../nexus/nexus-connect.js');

// §BUGFIX 2026-08-30 — a SECOND, real, pre-existing bug found while
// fixing the first: _escalateGap is called in 5 real places below
// (F-BRIDGE-DOWN, F-GUARDIAN-BOTTLENECK, F-GUARDIAN-DOWN, and the two
// generic fault-escalation call sites) but was never defined anywhere
// in this file, and no function by this exact name exists anywhere
// else in the codebase (checked directly). This file self-invokes
// runAll() at module scope (see the §MOVED 2026-07-24 comment further
// down) — meaning this ReferenceError fires on every real diagnostic
// run that reaches any of these 5 call sites, not just a hypothetical
// one. Built from the same real postEvent() primitive this whole
// session's own cross-process notifications already use, tagged as a
// real, structured gap so it's genuinely queryable afterward, not just
// a console line.
function _escalateGap(system, faultId, description, severity, meta = {}) {
  return postEvent('diagnostic.gap.escalated', { system, faultId, description, severity, ...meta }, {})
    .catch((err) => console.warn(`[diagnose] _escalateGap could not reach cortex (fault still real, just unrecorded): ${err.message}`));
}

const ROOT = path.join(__dirname, '..');
const FIX  = process.argv.includes('--fix');
const DEEP = process.argv.includes('--deep');   // §see the note further down: this used to be declared after its own use site, which killed the whole tool
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
    ['file: orchestrator/orchestrator.js', () => fileExists('orchestrator/orchestrator.js')],
    ['file: nexus/nexus-connect.js', () => fileExists('nexus/nexus-connect.js')],
    ['file: cli/nexus-repl.js',  () => fileExists('cli/nexus-repl.js')],
    ['file: cli/diagnose.js',    () => fileExists('cli/diagnose.js')],
    ['file: ui/orchestrator/',   () => fileExists('ui/orchestrator/index.html')],
    ['file: data/ledger/ (writable)', () => {
      const dir = path.join(ROOT,'data','ledger');
      try { fs.mkdirSync(dir,{recursive:true}); fs.accessSync(dir, fs.constants.W_OK); return true; }
      catch { return false; }
    }],
    ['syntax: orchestrator/orchestrator.js',  () => {
      const r = spawnSync('node',['--check','orchestrator/orchestrator.js'],{cwd:ROOT,encoding:'utf8',timeout:5000});
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
    console.log(warn(`NOT RUNNING — start with: node orchestrator/orchestrator.js`));
    record('orchestrator','live /health','WARN','not running');
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
    ['file: cortex/agents/index.js',             () => fileExists('cortex/agents/index.js')],
    ['file: cortex/ess-gap-engine.js',           () => fileExists('cortex/ess-gap-engine.js')],
    ['data/cortex dir writable', () => {
      const dir = path.join(ROOT,'data','cortex');
      try { fs.mkdirSync(dir,{recursive:true}); return true; } catch { return false; }
    }],
    // §VS1 2026-09-02 — versionium is its own sovereign system now
    // (versionium/server.js, port 3754), not embedded in cortex's boot
    // sequence. The old "cortex/versionium alias check" tested a require
    // path (boot.js requiring ./versionium) that no longer exists —
    // checking it would report a real, misleading PASS for a wire that's
    // gone, worse than reporting nothing. Real replacement: check the
    // sovereign system's own real entry point exists instead.
    ['file: versionium/server.js', () => fileExists('versionium/server.js')],
    ['file: versionium/lib/engine.js', () => fileExists('versionium/lib/engine.js')],
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
    // Test snapshot system — Phase 8.6
    const snapR = await probe(3748, '/api/snapshots');
    if (snapR.ok) {
      const snaps = snapR.data.snapshots || [];
      console.log(ok(`    snapshots: ${snaps.length} available`));
      record('cortex','snapshots','PASS');
      if (snaps.length > 0) {
        const latest = snaps[0];
        const age = Date.now() - (latest.ts || 0);
        const ageStr = age < 60000 ? `${(age/1000).toFixed(0)}s ago` : age < 3600000 ? `${(age/60000).toFixed(0)}m ago` : `${(age/3600000).toFixed(1)}h ago`;
        console.log(info(`    latest: ${latest.snapId?.slice(0,14)} (${latest.trigger||'?'}) ${ageStr} ${latest.totalRows||'?'} rows`));
        const bootSnap = snaps.find(s => s.trigger === 'boot' || s.type === 'boot');
        if (bootSnap) { console.log(ok('    boot snapshot present')); record('cortex','boot-snapshot','PASS'); }
        else { console.log(warn('    no boot snapshot found')); record('cortex','boot-snapshot','WARN'); }
      }
    } else { console.log(warn('    snapshots endpoint not responding')); record('cortex','snapshots','WARN'); }
    // Test replay engine
    const replayR = await probePost(3748, '/api/replay/inspect', { fromTs: Date.now() - 60000 });
    if (replayR.ok) {
      console.log(ok(`    replay engine: ${replayR.data.eventCount ?? 0} events in last 60s`));
      record('cortex','replay-engine','PASS');
    } else { console.log(warn('    replay engine not responding')); record('cortex','replay-engine','WARN'); }
  } else {
    console.log(warn(`NOT RUNNING — start with: node cortex/boot.js`));
    record('cortex','live /health','WARN','not running');
    if (r.error === 'ECONNREFUSED') console.log(info('    → nothing listening on :3748'));
  }
}

async function diagGuardian() {
  console.log(hdr('guardian', C.magenta));
  console.log(info('AI orchestration layer — dispatches jobs to Claude/ChatGPT via NCP (SSE+fetch)'));
  console.log(info('Port :7820 HTTP+NCP  :7822 Dropzone  :7823 Memory'));
  console.log(info('Transport: NCP (SSE server→browser + fetch POST browser→server). No WebSocket. No TLS.\n'));

  const ledger = (phase, status, detail) =>
    postLedger('guardian', `guardian.diagnose.${phase}`, { status, detail, ts: Date.now() });

  // ── File checks (v3.0 — NCP transport, no ws, no TLS) ────────────────────
  const HARD_FILES = [
    ['guardian/server.js',              'main server — NCP+HTTP'],
    ['guardian/lib/seam-queue.js',      'SEAM state machine'],
    ['guardian/lib/spec-parser.js',     'spec→chunks parser'],
    ['guardian/lib/detector.js',        'SEAM verdict evaluator'],
    ['guardian/lab/lab.js',             'LLM testing lab'],
    ['guardian/interaction-contract.json', 'API contract declaration'],
    ['lib/ncp.js',                      'NCP — _write() must be inside createNCPServer'],
    ['data/guardian/ledger/cfr',        'guardian CFR ledger (moved from guardian/memory_store 2026-07-24)'],
  ];
  const SOFT_FILES = [
    ['guardian/ui/index.html',          'Forge IDE UI'],
    ['guardian/userscript-claude.js',   'Claude Tampermonkey userscript v10'],
    ['guardian/userscript-chatgpt.js',  'ChatGPT Tampermonkey userscript v9'],
  ];

  console.log(C.bold + '  HARD files:' + C.reset);
  let hardFails = 0;
  for (const [i,[file,desc]] of HARD_FILES.entries()) {
    const exists = fileExists(file);
    if (exists) {
      console.log(ok(step(i+1, HARD_FILES.length, `${file} — ${desc}`)));
      await ledger(`file.${path.basename(file)}`, 'PASS');
    } else {
      console.log(fail(step(i+1, HARD_FILES.length, `${file} — MISSING (${desc})`)));
      await ledger(`file.${path.basename(file)}`, 'FAIL', 'missing');
      record('guardian', `file:${file}`, 'FAIL', 'missing');
      hardFails++;
    }
  }

  // ── Syntax check ───────────────────────────────────────────────────────────
  console.log('');
  for (const file of ['guardian/server.js', 'lib/ncp.js']) {
    if (!fileExists(file)) continue;
    const r = spawnSync('node', ['--check', file], { cwd:ROOT, encoding:'utf8', timeout:5000 });
    if (r.status === 0) {
      console.log(ok(`  syntax: ${file}`));
    } else {
      const errLine = r.stderr?.split('\n').find(l=>l.trim()) || 'syntax error';
      console.log(fail(`  syntax: ${file} — ${errLine}`));
      record('guardian', `syntax:${file}`, 'FAIL', errLine);
      detail_error('guardian', 'F-GUARDIAN-SYNTAX', errLine, `Fix: node --check ${file}`, null);
      hardFails++;
    }
  }

  // ── Critical: _write() inside createNCPServer ─────────────────────────────
  console.log('');
  if (fileExists('lib/ncp.js')) {
    const ncpSrc = fs.readFileSync(path.join(ROOT, 'lib', 'ncp.js'), 'utf8');
    const hasWrite = ncpSrc.includes('function _write(res, data)');
    const insideFactory = (() => {
      const factoryStart = ncpSrc.indexOf('function createNCPServer');
      const writePos     = ncpSrc.indexOf('function _write(res, data)');
      return writePos > factoryStart;
    })();
    if (hasWrite && insideFactory) {
      console.log(ok('  lib/ncp.js: _write() defined inside createNCPServer ✓'));
      await ledger('ncp._write', 'PASS');
    } else if (hasWrite && !insideFactory) {
      console.log(fail('  lib/ncp.js: _write() defined but OUTSIDE createNCPServer — dispatch will fail'));
      detail_error('guardian', 'F-NCP-001',
        '_write() must be inside createNCPServer() — if outside, ncp.push() throws ReferenceError',
        'Move function _write(res,data){...} to be the first function inside createNCPServer',
        'This was the root cause of all dispatch failures before 2026-06-11');
      await ledger('ncp._write', 'FAIL', 'outside factory');
      hardFails++;
    } else {
      console.log(fail('  lib/ncp.js: _write() MISSING — F-NCP-001, every dispatch will throw'));
      detail_error('guardian', 'F-NCP-001',
        '_write not defined in lib/ncp.js',
        'Add: function _write(res, data) { try { res.write(`data: ${JSON.stringify(data)}\\n\\n`); } catch(_) {} }',
        'Place immediately after const _clients = new Map() inside createNCPServer');
      record('guardian', 'ncp._write', 'FAIL', 'F-NCP-001');
      hardFails++;
    }
  }

  // ── Job persistence check (Phase 4.5) ─────────────────────────────────────
  if (fileExists('guardian/server.js')) {
    const srvSrc = fs.readFileSync(path.join(ROOT, 'guardian', 'server.js'), 'utf8');
    const hasReplay = srvSrc.includes('jobs.replay') || srvSrc.includes('Replay jobs from JAA') || srvSrc.includes('jaa.query');
    if (hasReplay) {
      console.log(ok("  guardian/server.js: Phase 4.5 job replay present ✓"));
      await ledger('job.replay', 'PASS');
    } else {
      console.log(warn("  guardian/server.js: Phase 4.5 job replay MISSING — jobs lost on restart"));
      detail_error('guardian', 'F-JOBS-001',
        'const jobs = new Map() starts empty on every restart — §2.1 violation',
        'Add Phase 4.5 SOFT in boot sequence: replay jaa.query("jobs") into Map',
        'Without this, /jobs returns empty after restart');
      await ledger('job.replay', 'WARN', 'F-JOBS-001');
    }
  }

  // ── DOM_MAP handler check ──────────────────────────────────────────────────
  if (fileExists('guardian/server.js')) {
    const srvSrc = fs.readFileSync(path.join(ROOT, 'guardian', 'server.js'), 'utf8');
    const hasDomMap = srvSrc.includes("case 'NEXUS_DOM_MAP'");
    if (hasDomMap) {
      console.log(ok("  guardian/server.js: NEXUS_DOM_MAP handler present ✓"));
      await ledger('dom_map.handler', 'PASS');
    } else {
      console.log(warn("  guardian/server.js: NEXUS_DOM_MAP has no handler — F-DOM-001 (log spam)"));
      detail_error('guardian', 'F-DOM-001',
        'NEXUS_DOM_MAP hits default case — hundreds of log lines per minute, nothing to cortex',
        'Add case \'NEXUS_DOM_MAP\' before default in _handleNCPMessage',
        'Write to cortex as guardian.dom_map.received, emit on bus');
      await ledger('dom_map.handler', 'WARN', 'F-DOM-001');
    }
  }

  // ── SEAM onResponse routing check ─────────────────────────────────────────
  if (fileExists('guardian/server.js')) {
    const srvSrc = fs.readFileSync(path.join(ROOT, 'guardian', 'server.js'), 'utf8');
    const hasOnResponse = srvSrc.includes('queue.onResponse') || srvSrc.includes('.onResponse(jobId');
    if (hasOnResponse) {
      console.log(ok("  guardian/server.js: GUARDIAN_COMPLETE routed to queue.onResponse ✓"));
      await ledger('seam.onResponse', 'PASS');
    } else {
      console.log(fail("  guardian/server.js: GUARDIAN_COMPLETE NOT routed to queue.onResponse — F-SEAM-001"));
      detail_error('guardian', 'F-SEAM-001',
        'GUARDIAN_COMPLETE never calls queue.onResponse() — SEAM stalls after chunk 0',
        'In GUARDIAN_COMPLETE handler: iterate _activeQueues, call q.onResponse(jobId, finalText)',
        'Fixed 2026-06-11 — verify it stayed fixed');
      record('guardian', 'seam.onResponse', 'FAIL', 'F-SEAM-001');
      hardFails++;
    }
  }

  // ── Soft files ─────────────────────────────────────────────────────────────
  console.log('');
  console.log(C.bold + '  SOFT files:' + C.reset);
  for (const [i,[file,desc]] of SOFT_FILES.entries()) {
    const exists = fileExists(file);
    exists
      ? console.log(ok(step(i+1, SOFT_FILES.length, `${file} — ${desc}`)))
      : console.log(warn(step(i+1, SOFT_FILES.length, `${file} — missing (${desc})`)));
    record('guardian', `file:${file}`, exists ? 'PASS' : 'WARN');
  }

  // ── Live checks ────────────────────────────────────────────────────────────
  console.log('');
  const hr = await probe(7820, '/health');
  if (hr.ok) {
    const d = hr.data;
    console.log(ok(`LIVE :7820  v${d.version||'?'}  uptime=${d.uptime?.toFixed(0)||'?'}s`));
    await ledger('live.health', 'PASS');
    record('guardian', 'live /health', 'PASS');

    // Jobs
    const jr = await probe(7820, '/jobs');
    if (jr.ok) {
      const jobs = jr.data.jobs || jr.data || [];
      const pending = Array.isArray(jobs) ? jobs.filter(j=>j.status==='queued'||j.status==='pending').length : 0;
      const complete= Array.isArray(jobs) ? jobs.filter(j=>j.status==='complete').length : 0;
      console.log(ok(`    jobs: ${Array.isArray(jobs)?jobs.length:'?'} total  pending=${pending}  complete=${complete}`));
      await ledger('live.jobs', 'PASS');
      // Bottleneck detection: if >10 pending jobs that's a bottleneck
      if (pending > 10) {
        detail_error('guardian', 'F-GUARDIAN-BOTTLENECK',
          `${pending} pending jobs — dispatch bottleneck or provider offline`,
          'Check GET /providers for connected tabs, check NCP /channel is open',
          null);
        _escalateGap('guardian', 'F-GUARDIAN-BOTTLENECK', `${pending} pending jobs`, 'medium', {});
      }
    }

    // Providers
    const pr = await probe(7820, '/providers');
    if (pr.ok) {
      const provs = pr.data?.providers || {};
      const connected = Object.entries(provs).filter(([,v])=>v?.connected||v==='connected').map(([k])=>k);
      connected.length
        ? console.log(ok(`    providers connected: ${connected.join(', ')}`))
        : console.log(warn(`    providers: none connected — open Claude/ChatGPT with Tampermonkey userscripts`));
      await ledger('live.providers', connected.length ? 'PASS' : 'WARN');
    }

    // NCP channel
    const ncpR = await probe(7820, '/channel?provider=diag&tabId=diag-test');
    if (ncpR.status === 200) {
      console.log(ok(`    NCP /channel: SSE endpoint ready`));
      await ledger('live.ncp', 'PASS');
    } else {
      console.log(warn(`    NCP /channel: status=${ncpR.status||'?'} — userscripts may not connect`));
      await ledger('live.ncp', 'WARN');
    }

    // SEAM queues
    const qR = await probe(7820, '/seam/queues');
    if (qR.ok) {
      console.log(ok(`    SEAM queues: ${qR.data?.active||0} active, ${qR.data?.total||0} total`));
      await ledger('live.seam', 'PASS');
    }

    // Lab
    const labR = await probe(7820, '/lab');
    if (labR.ok) {
      console.log(ok(`    Lab: ${labR.data?.sessions?.length||0} active sessions`));
      await ledger('live.lab', 'PASS');
    } else {
      console.log(warn(`    Lab: not available — guardian/lab/lab.js may be missing`));
      await ledger('live.lab', 'WARN');
    }

    // Bus
    const bR = await probe(7820, '/bus?n=5');
    if (bR.ok) {
      console.log(ok(`    SISO bus: ${bR.data.gates||0} gates  ${bR.data.entries||0} recent events`));
      await ledger('live.bus', 'PASS');
    }

    // Baseline/friction
    const blR = await probe(7820, '/baseline');
    if (blR.ok && blR.data) {
      const b = blR.data;
      const col = b.friction > 0.5 ? C.red : b.friction > 0.2 ? C.yellow : C.green;
      console.log(ok(`    baseline: friction=${col}${b.friction||0}${C.reset}  sigma=${b.stats?.sigma||0}  gaps=${b.gaps?.length||0}`));
      if ((b.gaps?.length||0) > 0) {
        for (const g of (b.gaps||[]).slice(0,3)) {
          detail_error('guardian', 'baseline-gap',
            `sigma deviation: ${g.sigma} on ${g.frictions?.map(f=>f.axis).join(',') || '?'}`,
            'Check data/guardian/ledger/ for recent anomalies', null);
        }
      }
      await ledger('live.baseline', b.friction < 0.5 ? 'PASS' : 'WARN');
    }

  } else {
    console.log(fail('NOT RUNNING on :7820'));
    console.log(info('  → Start: node guardian/server.js'));
    await ledger('live.health', 'FAIL', 'not running');
    record('guardian', 'live /health', 'FAIL', 'not running');
    _escalateGap('guardian', 'F-GUARDIAN-DOWN', 'guardian offline', 'high', {
      fix: 'node guardian/server.js'
    });
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
      const corePath = path.join(ROOT, 'idearium', 'core', 'index.js').replace(/\\/g, '/');
      const r = spawnSync('node',['--input-type=module'],{
        input: `import '${corePath}'; console.log('ok');`,
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
  console.log(info('Emerge — spec-compiler (T0+T1 pipeline), Ollama LSP, SNR analysis'));
  console.log(info('Port :4242  depends on emerge/emerge-ide.js + emerge/emerge-kernel.js\n'));

  const checks = [
    ['file: emerge/emerge-ide.js',              () => fileExists('emerge/emerge-ide.js')],
    ['file: emerge/emerge-kernel.js',           () => fileExists('emerge/emerge-kernel.js')],
    ['file: emerge/emerge.spec',                () => fileExists('emerge/emerge.spec')],
    ['file: emerge/compiler/index.js',         () => fileExists('emerge/compiler/index.js')],
    ['file: emerge/compiler/pipeline.js',      () => fileExists('emerge/compiler/pipeline.js')],
    ['file: emerge/siso/index.js',             () => fileExists('emerge/siso/index.js')],
    ['file: emerge/version.js',                () => fileExists('emerge/version.js')],
    ['emerge.spec: valid (parseable)',         () => {
      const specPath = path.join(ROOT,'emerge','emerge.spec');
      if (!fs.existsSync(specPath)) return false;
      const src = fs.readFileSync(specPath,'utf8');
      return src.length > 100 && src.includes('emerge');
    }],
    ['syntax: emerge/emerge-ide.js',          () => {
      const r = spawnSync('node',['--check','emerge/emerge-ide.js'],{cwd:ROOT,encoding:'utf8',timeout:5000});
      return r.status === 0;
    }],
    ['syntax: emerge/emerge-kernel.js',       () => {
      const r = spawnSync('node',['--check','emerge/emerge-kernel.js'],{cwd:ROOT,encoding:'utf8',timeout:5000});
      return r.status === 0;
    }],
    ['syntax: emerge/compiler/index.js',      () => {
      const r = spawnSync('node',['--check','emerge/compiler/index.js'],{cwd:ROOT,encoding:'utf8',timeout:5000});
      return r.status === 0;
    }],
    ['kernel: loads spec without crash',       () => {
      const r = spawnSync('node',['-e',`
        const k=require('./emerge/emerge-kernel.js');
        const spec=['emerge/emerge.spec'].find(p=>require('fs').existsSync(p));
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
    console.log(warn(`NOT RUNNING — start with: node emerge/emerge-ide.js`));
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
       fix_cmd('Start orchestrator', 'node orchestrator/orchestrator.js', 'Orchestrator is the boot authority'),
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

  // 5b. Baseline friction across kernels
  const baselineR = await probe(7820, '/baseline');
  if (baselineR.ok && baselineR.data) {
    const f = baselineR.data.friction || 0;
    const col = f > 0.5 ? C.red : f > 0.2 ? C.yellow : C.green;
    console.log(ok('  Guardian baseline friction: ' + col + f.toFixed(3) + C.reset +
      (f > 0.5 ? ' ⚠ HIGH — check /baseline for details' : '')));
    if (f > 0.5) {
      detail_error('cross', 'baseline-friction',
        'Guardian friction ' + f + ' exceeds threshold 0.5',
        'Run: curl http://127.0.0.1:7820/baseline | jq .gaps',
        null);
    }
    await ledger('cross.baseline', f < 0.5 ? 'PASS' : 'WARN');
    record('cross', 'baseline', f < 0.5 ? 'PASS' : 'WARN');
  }

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

  // 10. Diagnostic service health (:7825)
  console.log('');
  console.log(C.bold + '  Diagnostic service:' + C.reset);
  const diagR = await probe(7825, '/status');
  if (diagR.ok && diagR.data) {
    const d = diagR.data;
    console.log(ok('  Diagnostic service :7825 running (uptime: ' + Math.round(d.uptime||0) + 's, open gaps: ' + (d.openGaps||0) + ')'));
    const summary = d.summary || {};
    for (const [sys, info] of Object.entries(summary)) {
      const col = info.online ? C.green : C.red;
      const frCol = info.friction > 0.5 ? C.red : info.friction > 0.2 ? C.yellow : C.green;
      console.log(info('    ' + col + sys + C.reset + '  online=' + (info.online?'✓':'✗') +
        '  friction=' + frCol + (info.friction||0).toFixed(3) + C.reset +
        '  gaps=' + (info.openGaps||0)));
    }
    await ledger('cross.diagnostic', 'PASS');
    record('cross', 'diagnostic-service', 'PASS');
  } else {
    console.log(warn('  Diagnostic service :7825 not running'));
    fix_cmd('Start diagnostic service', 'node diagnostic/nexus-diagnostic.js',
      'Provides continuous system monitoring, gap detection, friction scoring');
    await ledger('cross.diagnostic', 'WARN');
    record('cross', 'diagnostic-service', 'WARN');
  }
}


const SYSTEM_MAP = {
  orchestrator: diagOrchestrator,
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

  if (DEEP) {
    await runRecursiveScan({ maxLevel: 5, verbose: true });
    return;
  }

  // Generic reachability check for a kernel with no dedicated suite. Reads the
  // port from autopilot's OWN kernel table rather than a second hardcoded map,
  // so it can never drift from what is actually supervised (§10.3).
  async function diagPortsFor(name) {
    let kernels = [];
    try { ({ ALL_KERNELS: kernels } = require(path.join(ROOT, 'nexus', 'autopilot.js'))); } catch (_) {}
    const k = (kernels || []).find(x => x.name === name);
    if (!k) { console.log(`   '${name}' is not a supervised kernel — nothing further to check.`); return; }
    if (!k.healthUrl) { console.log(`   '${name}' declares no healthUrl (no HTTP surface) — liveness cannot be probed.`); return; }
    const u = new URL(k.healthUrl);
    await new Promise((resolve) => {
      const rq = require('http').get({ hostname: u.hostname, port: u.port, path: u.pathname, timeout: 3000 }, (res) => {
        let b = ''; res.on('data', c => b += c);
        res.on('end', () => {
          console.log(`   ${k.healthUrl} → HTTP ${res.statusCode}`);
          if (res.statusCode !== 200) {
            console.log(`   The port is OPEN but the health route did not return 200.`);
            console.log(`   That usually means the route is NOT SERVED — check the kernel actually implements ${u.pathname}.`);
          }
          console.log(`   body: ${b.slice(0, 200)}`);
          resolve();
        });
      });
      rq.on('error', (e) => { console.log(`   ${k.healthUrl} → UNREACHABLE (${e.code || e.message}) — the process is not listening on that port.`); resolve(); });
      rq.on('timeout', () => { rq.destroy(); console.log(`   ${k.healthUrl} → TIMEOUT — listening but not answering.`); resolve(); });
    });
  }

  if (TARGET === 'all') {
    // §AXIOM: orchestrator first
    for (const fn of Object.values(SYSTEM_MAP)) { await fn(); }
    await diagCrossSystem();
    // After standard diag, run L3 integrity scan
    await runRecursiveScan({ systems: Object.keys(SYSTEM_MAP), maxLevel: 3, verbose: false });
  } else if (SYSTEM_MAP[TARGET]) {
    await SYSTEM_MAP[TARGET]();
  } else {
    // §FIX 2026-07-30 — found in James's real boot log. autopilot's
    // stall-diagnostic invokes `cli/diagnose.js <kernel>` for whichever kernel
    // failed its gate, but SYSTEM_MAP only covers 5 of the 13 supervised
    // kernels. So for diagnostic, architect, eravos, ollama-bridge,
    // copilot, loom and clear-glass the diagnostic printed "Unknown system"
    // and exited 1 — meaning the one moment it was designed for produced NO
    // diagnosis at all. It happened exactly as designed and told us nothing.
    //
    // A diagnostic that cannot diagnose the thing that broke must not exit
    // silently useless. It now falls back to the CROSS-SYSTEM checks, which
    // apply to any kernel, and says plainly that no system-specific suite
    // exists — so the operator learns something either way (§1.2).
    console.log(`\n⚠  No system-specific diagnostic suite exists for "${TARGET}".`);
    console.log(`   Suites available: ${Object.keys(SYSTEM_MAP).join(', ')}, all`);
    console.log(`   Running cross-system checks instead — these apply to every kernel.\n`);
    try {
      await diagCrossSystem();
      // Port reachability is the single most useful fact about a kernel that
      // failed a health gate, and it needs no per-system suite to establish.
      await diagPortsFor(TARGET);
    } catch (e) {
      console.log(`   cross-system diagnostic failed: ${e.message}`);
    }
    process.exit(2);   // 2 = "ran, but no specific suite" — distinct from 1
  }

  // §FOUND & FIXED 2026-09-06 — James: "diagnostic tool: idearium:
  // ReferenceError: printGapReport is not defined." Real, live crash on
  // every normal (non-fallback) diagnostic run for any target with a
  // real suite — checked before fixing: this function was called but
  // never defined anywhere in the codebase. The real display logic
  // already existed, just inline inside a different function
  // (diagAllSystems, further down) that also does gap escalation —
  // reused the exact same real formatting here, not reinvented, and
  // deliberately left escalation where it already correctly runs
  // rather than duplicating it into this simpler, top-level call site.
  function printGapReport() {
    const allGaps = [..._cache.gaps.values()];
    if (allGaps.length > 0) {
      console.log('');
      console.log(C.bold + C.red + '  Named gaps (' + allGaps.length + '):' + C.reset);
      for (const g of allGaps) {
        const col = g.severity === 'high' ? C.red : g.severity === 'medium' ? C.yellow : C.dim;
        console.log(`    ${col}[${g.severity.toUpperCase()}]${C.reset} ${g.system} · ${g.faultId}`);
        console.log(`       ${C.dim}${g.description}${C.reset}`);
      }
    } else {
      console.log(ok('  No named gaps — system clean'));
    }
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

// ════════════════════════════════════════════════════════════════════════════
// RECURSIVE DIAGNOSTIC ENGINE — §DIAG-01
// Polls ports, runs integrity checks, escalates gaps, dispatches to agent.
// 
// Strategy levels (increasing intensity):
//   L1: health probe (port alive, HTTP 200)
//   L2: deep probe (routes, queue depth, latency, gap count)
//   L3: file integrity (required files, syntax, known fault patterns)
//   L4: cross-system integrity (dependency chain, RAID routing)
//   L5: agent dispatch (send gap summary to guardian → agent for repair)
//
// §1.2 Nothing silently fails — every gap is named, typed, logged.
// §F-DIAG-001 If diagnostic cannot identify a problem, that IS the gap.
// §F-DIAG-002 If diagnostic cannot fix a problem, that IS a gap to log.
// ════════════════════════════════════════════════════════════════════════════

const ALL_PORTS = [
  { system:'orchestrator', port:9000, health:'/health',  critical:true  },
  // §RETIRED 2026-09-06 — bridge system removed.
  { system:'cortex',       port:3748, health:'/health',  critical:true  },
  { system:'guardian',     port:7820, health:'/health',  critical:false },
  { system:'architect',    port:3747, health:'/health',  critical:false },
  { system:'idearium',     port:4800, health:'/health',  critical:false },
  { system:'emerge',       port:4242, health:'/status',  critical:false },
  { system:'guardian-mem', port:7823, health:'/ping',    critical:false },
  { system:'guardian-drop',port:7822, health:'/health',  critical:false },
];

// Volatile cache — lives only for this process run
const _cache = {
  health:   new Map(),   // port → { ok, latency, data, ts }
  files:    new Map(),   // relPath → { exists, hash, ts }
  gaps:     new Map(),   // faultId → gap entry
  results:  new Map(),   // `${system}.${check}` → result
};
const CACHE_TTL = 30000; // 30s — don't re-probe within TTL

function _cacheGet(map, key) {
  const v = map.get(key);
  if (!v || Date.now() - v.ts > CACHE_TTL) return null;
  return v;
}
function _cacheSet(map, key, val) {
  map.set(key, { ...val, ts: Date.now() });
}

// ── L1: Port sweep ────────────────────────────────────────────────────────────
async function sweepPorts(targets = ALL_PORTS) {
  const results = await Promise.all(targets.map(async t => {
    const cached = _cacheGet(_cache.health, t.port);
    if (cached) return { ...t, ...cached, cached:true };
    const t0  = Date.now();
    const r   = await probe(t.port, t.health);
    const res = { ...t, ok:r.ok, latency:Date.now()-t0, status:r.status, data:r.data };
    _cacheSet(_cache.health, t.port, res);
    return res;
  }));
  return results;
}

// ── L2: Deep probe ────────────────────────────────────────────────────────────
async function deepProbe(port, system) {
  const routes = {
    orchestrator: ['/health','/api/recall?n=5'],
    cortex:       ['/health','/api/events?n=5','/api/gaps?status=open'],
    guardian:     ['/health','/jobs','/providers','/seam/queues','/lab'],
    architect:    ['/health','/api/hooks','/api/snr'],
    idearium:     ['/health','/api/ideas'],
  };
  const checks = routes[system] || ['/health'];
  const results = {};
  for (const path of checks) {
    const r = await probe(port, path);
    results[path] = { ok:r.ok, status:r.status, latency:0 };
    // Detect bottleneck: queue depth, gap count
    if (path.includes('jobs') && r.ok) {
      const jobs = r.data?.jobs || [];
      const pending = Array.isArray(jobs) ? jobs.filter(j=>j.status==='queued'||j.status==='pending').length : 0;
      if (pending > 5) {
        _namedGap(system, 'queue-bottleneck', `${pending} pending jobs — dispatch bottleneck`, 'medium');
      }
    }
    if (path.includes('gaps') && r.ok) {
      const gaps = r.data?.gaps || r.data?.rows || [];
      const fatal = gaps.filter(g=>g.severity==='fatal').length;
      if (fatal > 0) {
        _namedGap(system, 'cortex-fatal-gaps', `${fatal} fatal gaps open in cortex`, 'high');
      }
    }
  }
  return results;
}

// ── L3: File integrity ────────────────────────────────────────────────────────
const INTEGRITY_MANIFEST = [
  // Core
  { file:'orchestrator/orchestrator.js', system:'orchestrator', critical:true,  check: src => !src.includes('require is not defined') },
  { file:'package.json',             system:'orchestrator', critical:true,  check: src => src.includes('"type": "commonjs"') || !src.includes('"type"') },
  { file:'nexus/nexus-connect.js',         system:'orchestrator', critical:true,  check: src => src.includes('postBridge') },
  // Guardian
  { file:'guardian/server.js',       system:'guardian',     critical:true,  check: src => {
    const hasWrite = src.includes('function _write(res, data)');
    const factoryStart = src.indexOf('function createNCPServer');
    const writePos = src.indexOf('function _write(res, data)');
    return hasWrite && writePos > factoryStart;
  }},
  { file:'lib/ncp.js',               system:'guardian',     critical:true,  check: src => src.includes('function _write(res, data)') },
  // Cortex
  { file:'cortex/boot.js',           system:'cortex',       critical:true,  check: src => src.includes('intelligence') || src.includes('Phase 5.3') },
  { file:'cortex/intelligence/index.js', system:'cortex',   critical:false, check: src => src.includes('_scanPatterns') },
  // Hooks
  { file:'hooks/index.js',           system:'architect',    critical:false, check: src => src.includes('seamManifest') },
];

async function integrityCheck(systems = null) {
  const results = [];
  const targets = systems
    ? INTEGRITY_MANIFEST.filter(m => systems.includes(m.system))
    : INTEGRITY_MANIFEST;

  for (const manifest of targets) {
    const fullPath = path.join(ROOT, manifest.file);
    if (!fs.existsSync(fullPath)) {
      const gap = _namedGap(manifest.system, `F-FILE-MISSING:${manifest.file}`,
        `Required file missing: ${manifest.file}`, manifest.critical ? 'high' : 'medium');
      results.push({ file:manifest.file, ok:false, reason:'missing', gap });
      continue;
    }
    // Check content rule
    if (manifest.check) {
      try {
        const src = fs.readFileSync(fullPath, 'utf8');
        const ok = manifest.check(src);
        if (!ok) {
          const gap = _namedGap(manifest.system, `F-INTEGRITY:${manifest.file}`,
            `Integrity check failed for ${manifest.file}`,
            manifest.critical ? 'high' : 'medium');
          results.push({ file:manifest.file, ok:false, reason:'integrity', gap });
        } else {
          results.push({ file:manifest.file, ok:true });
        }
      } catch(e) {
        results.push({ file:manifest.file, ok:false, reason:e.message });
      }
    } else {
      results.push({ file:manifest.file, ok:true });
    }
  }
  return results;
}

// ── Named gap registration ────────────────────────────────────────────────────
function _namedGap(system, faultId, description, severity = 'medium') {
  if (_cache.gaps.has(faultId)) return _cache.gaps.get(faultId);
  const gap = { system, faultId, description, severity, ts: Date.now(), strategies_tried: [], resolved: false };
  _cache.gaps.set(faultId, gap);
  // Write to cortex failure ledger
  _escalateGap(system, faultId, description, severity, {});
  return gap;
}

// ── Recursive escalation ──────────────────────────────────────────────────────
async function recursiveDiagnose(system, opts = {}) {
  const { maxLevel = 5, verbose = false } = opts;
  const port = ALL_PORTS.find(p => p.system === system);
  if (!port) return { ok:false, error:`unknown system: ${system}` };

  const log = (msg, col) => verbose && console.log(`  ${col||C.dim}[diag:${system}]${C.reset} ${msg}`);
  const failures = [];

  // L1: Is it alive?
  log('L1: port sweep', C.cyan);
  const health = await probe(port.port, port.health);
  if (!health.ok) {
    const gap = _namedGap(system, `F-${system.toUpperCase()}-DOWN`,
      `${system} not responding on :${port.port}`, port.critical ? 'high' : 'medium');
    gap.strategies_tried.push('L1:health-probe');
    failures.push({ level:1, gap, fix:`node ${system}/server.js or node ${system}/boot.js` });
    if (maxLevel < 2) return { ok:false, level:1, failures };
  }

  // L2: Deep probe (only if alive)
  if (health.ok && maxLevel >= 2) {
    log('L2: deep probe', C.cyan);
    await deepProbe(port.port, system);
  }

  // L3: File integrity
  if (maxLevel >= 3) {
    log('L3: file integrity', C.cyan);
    const iResults = await integrityCheck([system]);
    for (const r of iResults) {
      if (!r.ok) {
        if (r.gap) r.gap.strategies_tried.push('L3:integrity');
        failures.push({ level:3, file:r.file, reason:r.reason });
      }
    }
  }

  // L4: Cross-system dependency check
  if (maxLevel >= 4) {
    log('L4: cross-system deps', C.cyan);
    // §RETIRED 2026-09-06 — Bridge removed (James: "it has to go"). This
    // check treated Bridge being offline as a real cross-system failure
    // for cortex, but no real functional dependency was ever confirmed
    // (checked directly earlier the same session this was retired) — a
    // false, misleading high-severity gap on every run otherwise.
    // Check guardian → cortex
    if (system === 'guardian') {
      const cortexHealth = await probe(3748, '/health');
      if (!cortexHealth.ok) {
        _namedGap('cortex', 'F-CORTEX-DOWN-FROM-GUARDIAN',
          'Guardian cannot write events — Cortex offline', 'high');
      }
    }
  }

  // L5: Agent dispatch if failures remain and can't self-fix
  if (maxLevel >= 5 && failures.length > 0) {
    log('L5: escalating to agent', C.yellow);
    const gapSummary = failures.map(f =>
      `[${f.gap?.faultId||f.file||'unknown'}] ${f.gap?.description||f.reason||'unknown'}`
    ).join('\n');

    await _dispatchToAgent(system, gapSummary, failures);
  }

  return { ok: failures.length === 0, level: maxLevel, failures, gaps: [..._cache.gaps.values()] };
}

// ── Agent dispatch ─────────────────────────────────────────────────────────────
async function _dispatchToAgent(system, gapSummary, failures) {
  // Write to cortex as a high-priority gap requiring agent intervention
  const faultId = `F-AGENT-DISPATCH:${system}:${Date.now().toString(36)}`;
  _namedGap(system, faultId,
    `Recursive diagnostic exhausted — agent intervention required for ${system}`,
    'high');

  // Try to dispatch via guardian if it's running
  const guardianHealth = await probe(7820, '/health');
  if (!guardianHealth.ok) {
    // Guardian is itself down — can't dispatch, log to failure mode ledger
    _logFailureMode(system, 'F-AGENT-DISPATCH-FAILED',
      'Cannot dispatch agent repair — guardian offline. Gap cannot be escalated.',
      { system, gapSummary, failures: failures.length });
    return;
  }

  // POST to guardian /command with the diagnostic summary
  const prompt = [
    `NEXUS DIAGNOSTIC ESCALATION — System: ${system}`,
    ``,
    `The recursive diagnostic found ${failures.length} unresolved issue(s):`,
    gapSummary,
    ``,
    `Please:`,
    `1. Analyse each gap above`,
    `2. Identify the root cause using the NEXUS fault taxonomy`,
    `3. Propose a concrete fix with exact file paths and code changes`,
    `4. Output: [FAULT_CLASS] [ROOT_CAUSE] [FIX] for each issue`,
  ].join('\n');

  await probePost(7820, '/command', {
    provider: 'claude',
    command:  'diagnose',
    prompt,
    meta: { source:'recursive-diagnose', system, faults:failures.map(f=>f.gap?.faultId||f.file) },
  });

  console.log(warn(`  [escalate] Dispatched ${failures.length} gap(s) to Claude for repair`));
}

// ── Failure mode ledger ────────────────────────────────────────────────────────
// §F-DIAG-002: If diagnostic cannot fix, log explicitly to meta failure ledger
function _logFailureMode(system, faultId, description, meta = {}) {
  const entry = {
    uuid:        require('crypto').randomUUID(),
    faultId,     system, description,
    faultClass:  'diagnostic_failure',
    gapType:     'diagnostic_dead_end',
    meta,
    ts:          Date.now(),
    note:        '§F-DIAG-002: diagnostic could not identify or fix this problem — logged for meta observer',
  };
  // Append to local failure ledger file
  const ledgerPath = path.join(ROOT, 'data', 'diagnostic-failures.jsonl');
  try {
    require('fs').mkdirSync(path.join(ROOT, 'data'), { recursive:true });
    require('fs').appendFileSync(ledgerPath, JSON.stringify(entry) + '\n');
  } catch(_) {}
  // Write to cortex
  _escalateGap(system, faultId, description, 'high', { ...meta, faultClass:'diagnostic_failure' });
  console.log(fail(`  [${system}] §F-DIAG-002 NAMED FAILURE: ${faultId} — ${description}`));
}

// ── Full recursive scan ────────────────────────────────────────────────────────
// Called from diagnose UI or on --deep flag
async function runRecursiveScan(opts = {}) {
  const { systems = ALL_PORTS.map(p=>p.system), maxLevel = 4, verbose = true } = opts;
  console.log('');
  console.log(C.bold + C.cyan + '  ⬡ RECURSIVE DIAGNOSTIC SCAN (' + systems.length + ' systems, L' + maxLevel + ')' + C.reset);
  console.log('');

  // Run port sweep first (parallel, cached)
  const portResults = await sweepPorts(ALL_PORTS);
  const offline = portResults.filter(r => !r.ok);
  const online  = portResults.filter(r =>  r.ok);

  console.log(ok(`  Port sweep: ${online.length}/${portResults.length} online (${offline.map(r=>`:${r.port} ${r.system}`).join(', ')||'all online'})`));
  if (offline.length > 0) {
    for (const p of offline) {
      if (p.critical) {
        _namedGap(p.system, `F-${p.system.toUpperCase()}-DOWN`, `${p.system} offline on :${p.port}`, 'high');
        console.log(fail(`    CRITICAL OFFLINE: ${p.system} :${p.port}`));
      } else {
        console.log(warn(`    offline: ${p.system} :${p.port}`));
      }
    }
  }

  // File integrity scan (parallel)
  console.log('');
  console.log(C.bold + '  File integrity:' + C.reset);
  const integrityResults = await integrityCheck();
  const intFails = integrityResults.filter(r => !r.ok);
  if (intFails.length === 0) {
    console.log(ok(`  All ${integrityResults.length} integrity checks passed`));
  } else {
    for (const r of intFails) {
      console.log(fail(`    ${r.file}: ${r.reason}`));
    }
  }

  // Deep probe online systems
  if (maxLevel >= 2) {
    console.log('');
    console.log(C.bold + '  Deep probes:' + C.reset);
    for (const p of online) {
      const dp = await deepProbe(p.port, p.system);
      const failing = Object.entries(dp).filter(([,v])=>!v.ok).map(([route])=>route);
      if (failing.length === 0) {
        console.log(ok(`    ${p.system}: all routes OK`));
      } else {
        console.log(warn(`    ${p.system}: failing routes: ${failing.join(', ')}`));
      }
    }
  }

  // Report all named gaps
  const allGaps = [..._cache.gaps.values()];
  if (allGaps.length > 0) {
    console.log('');
    console.log(C.bold + C.red + '  Named gaps (' + allGaps.length + '):' + C.reset);
    for (const g of allGaps) {
      const col = g.severity === 'high' ? C.red : g.severity === 'medium' ? C.yellow : C.dim;
      console.log(`    ${col}[${g.severity.toUpperCase()}]${C.reset} ${g.system} · ${g.faultId}`);
      console.log(`       ${C.dim}${g.description}${C.reset}`);
    }

    // L5 escalation for high-severity gaps that persist
    const highGaps = allGaps.filter(g => g.severity === 'high' && !g.resolved);
    if (highGaps.length > 0 && maxLevel >= 5) {
      console.log('');
      console.log(warn(`  Escalating ${highGaps.length} high-severity gap(s) to agent…`));
      for (const g of highGaps) {
        await _dispatchToAgent(g.system, g.description, [{ gap:g }]);
      }
    }
  } else {
    console.log(ok('  No named gaps — system clean'));
  }

  return { online: online.length, offline: offline.length, intFails: intFails.length, gaps: allGaps.length };
}

// ── Wire --deep flag into runAll ────────────────────────────────────────────
// §MOVED 2026-07-24 — DEEP was declared HERE (line ~1479) but read inside
// runAll() at ~1061, and runAll() is invoked at ~1094 — i.e. BEFORE this
// const was ever evaluated. `const` is not hoisted-and-initialised like
// `var`, so every single invocation of this tool died with
// "ReferenceError: Cannot access 'DEEP' before initialization", for every
// target, with no output beyond the banner. The diagnostic sequencer was
// 100% dead and had been silently so — nothing ran it automatically, and by
// hand the banner printed first, so it LOOKED like it had started working.
// Declaration now sits with the other flags at the top of the file (see FIX /
// WATCH / TARGET). Found the moment autopilot's new boot gate tried to run it
// on a stall (James, 2026-07-24: "running the diagnostic tool each time it
// stalls") — the classic case of a thing being broken precisely because
// nothing was watching it.
