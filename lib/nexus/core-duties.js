'use strict';
// ── lib/nexus/core-duties.js — what autopilot did besides supervising, kept in lib after the handover (MG17, 0.60.330) ──────────────
// Spec: cos/spec/cos-manager.spec MOD-MG-CORE-DUTIES · Map: docs/2026-10-24-cos-manager-phasemap.spec MG17_autopilot_hands_over, MG_D15
//
// James, 2026-10-31: "Starting the mg-17". Mapping the handover found that autopilot did more than supervise, and the spec named none
// of it. Handing over the supervision alone would have dropped all of it (§0.3), so it stays lib's and runs in the launcher's process
// (§5.15: lib's duties are lib's; COS is reached by its routes, never its files):
//   wire      the fan-in, the ledger wire, error.log and the intelligence substrate (autopilot's §P1, §LEDGER-WIRE, §error-log, 2026-08-08)
//   vitals    the post-boot vitals check (tests/verify-ncp-agents.js, sandboxed)
//   update    automatic updates (lib/nexus-update.js startAuto): idle by the door's /idle, a restart by COS's route, by rule:auto-update
//   loom      the loom registry refresh, when it is old and memory allows (lib/prevention.js)
//   snapshot  every minute, autopilot.instance_snapshot into the fan-in → cortex's event_log (the type and keys lib/pressure-window.js reads)
//   follow    COS's ledger: a circuit-open line → one kernel_circuit_open gap (lib/gap-field.js); a boot phase's stall → one diagnostic run
// Autopilot's in-process warp stream is not carried: COS's ledger is the record of every spawn, crash and circuit now (said in MG_D15).
// Nothing here starts, stops or restarts a system except through COS's route, saying by = rule:<duty>. In a test run vitals, update and
// loom say they are skipped (they would act on the tree under test).

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const MODULE_ID = 'nexus.lib.nexus.core-duties';
const ROOT = path.join(__dirname, '..', '..');
const SNAPSHOT_MS = 60_000;          // autopilot's INSTANCE_SNAPSHOT_MS: intelligence's own pattern-scan cadence
const FOLLOW_MS = 5_000;
const VITALS_TIMEOUT_MS = 180_000;   // autopilot's, after the 2026-09-25 fix (the whole check runs 9 suites)
const DIAGNOSTIC_TIMEOUT_MS = 25_000;
const LOOM_REFRESH_MAX_AGE_MS = (parseFloat(process.env.LOOM_REFRESH_MAX_AGE_H) || 12) * 3600 * 1000;
const inTestRun = () => !!(process.env.NEXUS_TEST_SANDBOX || process.env.NEXUS_TEST_RUN_DEPTH);

/** cosClient(base) → COS's manager by its routes only */
function cosClient(base) {
  const call = (method, p, body = null, timeoutMs = 5000) => new Promise((ok, no) => {
    const data = body ? JSON.stringify(body) : null; const u = new URL(p, base);
    const req = http.request(u, { method, timeout: timeoutMs, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
      let t = ''; res.on('data', c => t += c); res.on('end', () => { try { ok(JSON.parse(t)); } catch (_) { no(new Error(`${method} ${p}: not JSON (${res.statusCode})`)); } });
    });
    req.on('error', no); req.on('timeout', () => { req.destroy(); no(new Error(`${method} ${p}: no answer in ${timeoutMs / 1000}s`)); });
    if (data) req.write(data); req.end();
  });
  return {
    health: () => call('GET', '/api/cos/health'),
    systems: async () => (await call('GET', '/api/cos/systems')).systems || [],
    ledger: async (limit = 200) => (await call('GET', `/api/cos/ledger?limit=${limit}`)).entries || [],
    restart: (name, by) => call('POST', `/api/cos/systems/${encodeURIComponent(name)}/restart`, { by }),
    idle: () => call('GET', '/idle', null, 15000),
  };
}

/** perPidMemoryMB(pids) → { pid: MB } — one batched OS query (autopilot's, 2026-08-18: "log what system is causing memory pressure") */
function perPidMemoryMB(pids) {
  const out = {}; if (!pids.length) return out;
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('wmic', ['process', 'where', `(${pids.map(p => `ProcessId=${p}`).join(' or ')})`, 'get', 'ProcessId,WorkingSetSize', '/format:csv'], { encoding: 'utf8', timeout: 5000 });
      for (const line of (r.status === 0 && r.stdout ? r.stdout : '').split('\n')) { const p = line.trim().split(','); const pid = parseInt(p[1], 10), ws = parseInt(p[2], 10); if (p.length >= 3 && pid && !isNaN(ws)) out[pid] = Math.round(ws / 1048576); }
    } else {
      const r = spawnSync('ps', ['-o', 'pid=,rss=', '-p', pids.join(',')], { encoding: 'utf8', timeout: 5000 });
      for (const line of (r.status === 0 && r.stdout ? r.stdout.trim() : '').split('\n')) { const [pid, rss] = line.trim().split(/\s+/).map(Number); if (pid && !isNaN(rss)) out[pid] = Math.round(rss / 1024); }
    }
  } catch (e) { console.warn(`[core-duties] per-pid memory query failed: ${e.message}`); }
  return out;
}

/** snapshot(systems, memOf) → the autopilot.instance_snapshot payload, autopilot's keys, read from COS's view of each system */
function snapshot(systems, memOf = perPidMemoryMB) {
  const perSystem = {};
  for (const s of systems) perSystem[s.name] = { status: s.state, pid: s.pid || null, restarts: (s.restarts && s.restarts.count) || 0, crashesInWindow: s.crashesInWindow || 0, port: s.port || null };
  const pids = systems.filter(s => s.pid).map(s => s.pid); const mb = memOf(pids); const perSystemMemMB = {};
  for (const s of systems) if (s.pid && mb[s.pid] != null) perSystemMemMB[s.name] = mb[s.pid];
  const top = Object.entries(perSystemMemMB).sort((a, b) => b[1] - a[1])[0];
  const free = os.freemem() / os.totalmem();
  return { systemsRunning: pids.length, systemsTotal: systems.length, totalRestarts: Object.values(perSystem).reduce((n, s) => n + s.restarts, 0),
    freeMemMB: Math.round(os.freemem() / 1048576), totalMemMB: Math.round(os.totalmem() / 1048576), freeMemPct: Math.round(free * 100),
    perSystemMemMB, topConsumer: top ? { system: top[0], mb: top[1] } : null, perSystem };
}

/** follow(entries, seen, since) → the acts COS's new ledger lines ask of core: [{ act: 'gap'|'diagnose', system, entry }]; each line once */
function follow(entries, seen, since = 0) {
  const acts = [];
  for (const e of entries) {
    if (!e || !e.id || seen.has(e.id) || (e.ts || 0) < since) continue;
    seen.add(e.id);
    if (e.kind === 'circuit-open') acts.push({ act: 'gap', system: e.system, entry: e });
    else if (e.kind === 'health' && /^phase \d+: no health/.test(String(e.why || ''))) acts.push({ act: 'diagnose', system: e.system, entry: e });
  }
  if (seen.size > 5000) { const keep = [...seen].slice(-2000); seen.clear(); keep.forEach(k => seen.add(k)); }
  return acts;
}

// ── the real sinks (each replaceable in a test) ────────────────────────────────────────────────────────────────────────────────────
// autopilot required cortex's jaa-db for this row; here it goes through the fan-in, whose activity-log subscriber posts it to cortex's
// event_log by route — the same type, payload and source, and no new crossing into cortex (§5.15, designed out before the code)
function writeSnapshot(payload) {
  return require('../ledger-fanin').emit({ type: 'autopilot.instance_snapshot', payload, source: 'autopilot', causedBy: null, ts: Date.now() });
}
function reportGap(system, entry) {
  return require('../gap-field.js').report({ type: 'kernel_circuit_open', source: 'autopilot', severity: 'critical', location: system, component: system,
    body: `Kernel "${system}" — COS's supervisor stopped restarting it: ${entry.why}`, meta: { ledgerId: entry.id, code: entry.code, at: entry.ts } });
}
function runDiagnostic(system, log) {
  return new Promise((resolve) => {
    log(`   ↳ running diagnostic for stalled '${system}' — lib/cli/diagnose.js ${system}`);
    let proc; try { proc = spawn(process.execPath, [path.join(ROOT, 'lib', 'cli', 'diagnose.js'), system], { cwd: ROOT }); }
    catch (e) { log(`   ↳ diagnostic could not start: ${e.message} — the stall of '${system}' stands unexplained`); return resolve(); }
    let out = ''; const cap = (c) => { out = (out + c).slice(-40000); }; proc.stdout.on('data', cap); proc.stderr.on('data', cap);
    const t = setTimeout(() => { log(`   ↳ diagnostic for '${system}' exceeded ${DIAGNOSTIC_TIMEOUT_MS / 1000}s — killed`); try { proc.kill('SIGKILL'); } catch (_) {} }, DIAGNOSTIC_TIMEOUT_MS);
    proc.on('error', (e) => { clearTimeout(t); log(`   ↳ diagnostic failed to run for '${system}': ${e.message}`); resolve(); });
    proc.on('exit', (code) => { clearTimeout(t); const tail = out.split('\n').filter(Boolean).slice(-25); log(`   ↳ diagnostic for '${system}' (exit ${code})${tail.length ? ' —' : ': no output'}`); tail.forEach(l => log(`      ${l}`)); resolve(); });
  });
}

function wire(log) {
  try {
    const fw = require('../ledger-fanin/boot').wireFanin({ onAutopilot: () => {} });
    log(`§P1 fan-in wired: ${fw.wired.join(', ')}${fw.skipped.length ? ' (deferred: ' + fw.skipped.map(s => s[0]).join(',') + ')' : ''}`);
  } catch (e) { log(`§P1 fan-in wiring skipped: ${e.message}`); }
  try {
    const w = require('../ledger-sse').attachAll([
      { system: 'copilot', url: 'http://127.0.0.1:3750/ledger/stream' }, { system: 'cortex', url: 'http://127.0.0.1:3748/ledger/stream' },
      { system: 'diagnostic', url: 'http://127.0.0.1:7825/ledger/stream' }, { system: 'guardian', url: 'http://127.0.0.1:7820/ledger/stream' },
      { system: 'loom', url: 'http://127.0.0.1:3752/ledger/stream' }]);
    log(`§ledger-wire consuming: ${w.attached.join(', ')}${w.failed.length ? ` (failed: ${w.failed.map(f => f[0]).join(',')})` : ''}`);
  } catch (e) { log(`§ledger-wire unavailable: ${e.message} — remote system activity will NOT be visible here`); }
  try { const el = require('../error-log'); el.attach(require('../ledger-fanin')); log(`§error-log active — ${el.LOG_PATH}`); } catch (e) { log(`§error-log unavailable: ${e.message}`); }
  try { log(require('../autopilot-intelligence').wireIntelligence({ snapshotAlreadyAttached: true }).report); } catch (e) { log(`intelligence substrate wiring skipped: ${e.message}`); }
}

function vitals(log) {
  const file = path.join(ROOT, 'tests', 'verify-ncp-agents.js');
  if (!fs.existsSync(file)) return log('⚠ vitals check skipped — tests/verify-ncp-agents.js not found (moved or renamed?)');
  log('running post-boot vitals check (tests/verify-ncp-agents.js)...');
  const sb = require('../test-sandbox.js').childEnv();
  const proc = spawn(process.execPath, [file], { cwd: ROOT, env: sb.env }); proc.on('close', sb.cleanup);
  let out = ''; const cap = (c) => { out += c; }; proc.stdout.on('data', cap); proc.stderr.on('data', cap);
  const t = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} }, VITALS_TIMEOUT_MS);
  proc.on('exit', (code) => { clearTimeout(t); const line = out.split('\n').find(l => l.includes('REAL FIXES VERIFIED') || l.includes('have REGRESSED')) || '(no summary line captured)';
    log(code === 0 ? `✓ vitals check passed — ${line}` : `✗ VITALS CHECK FAILED — ${line}\n${out.split('\n').filter(l => l.includes('->')).join('\n')}`); });
  proc.on('error', (e) => { clearTimeout(t); log(`⚠ vitals check could not run: ${e.message}`); });
}

function autoUpdate(cos, names, log) {
  if (process.env.NEXUS_AUTO_UPDATE === '0') return log('[update] automatic updates off (NEXUS_AUTO_UPDATE=0)');
  const U = require('../nexus-update.js');
  const npmAsync = () => new Promise((resolve) => {
    const p = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], { cwd: ROOT, shell: process.platform === 'win32' });
    let err = ''; p.stderr.on('data', (c) => { err = (err + c).slice(-800); });
    p.on('error', (e) => resolve({ ok: false, error: e.message }));
    p.on('close', (code) => resolve(code === 0 ? { ok: true } : { ok: false, error: `exit ${code}: ${err.trim().split('\n').slice(-2).join(' ')}` }));
  });
  const h = U.startAuto({ root: ROOT, idle: () => cos.idle(), restart: (name) => cos.restart(name, 'rule:auto-update'), npmAsync, kernels: names, log });
  log(`[update] automatic updates: ${U.getPolicy({ root: ROOT }).policy} (first check in 2 min; the Updates page changes it)`);
  return h;
}

function loomRefresh(log, tries = 0, timers) {
  let age = Infinity; try { age = Date.now() - fs.statSync(path.join(ROOT, 'loom', 'data', 'registry.json')).mtimeMs; } catch (_) {}
  if (age < LOOM_REFRESH_MAX_AGE_MS) return log(`loom registry is ${Math.round(age / 360000) / 10} h old — not rebuilt at this boot (rebuilt when older than ${LOOM_REFRESH_MAX_AGE_MS / 3600000} h)`);
  let h = { ok: true, why: '' };
  try { const { ResourceMonitor } = require('../resource-monitor'); const m = new ResourceMonitor({ name: 'core-duties', intervalMs: 15000 }); h = require('../prevention.js').heavyAllowed({ sample: m.current(), level: m.level() }); } catch (_) {}
  if (!h.ok) { if (tries === 0) log(`loom registry refresh waits — ${h.why}; re-checked every 5 min`); const t = setTimeout(() => loomRefresh(log, tries + 1, timers), 5 * 60 * 1000); if (t.unref) t.unref(); timers.push(t); return; }
  log('refreshing loom/data/registry.json in the background (about 4 min; nothing waits for it)');
  try { const c = spawn(process.execPath, ['loom/bootstrap.js'], { cwd: ROOT, stdio: 'ignore', detached: true }); c.on('error', (e) => log(`⚠ loom registry refresh failed to start: ${e.message}`)); c.unref(); }
  catch (e) { log(`⚠ loom registry refresh failed to start: ${e.message}`); }
}

/**
 * start({ base, log, sinks }) → { stop, tick } — runs every duty against COS's manager at base. sinks: { writeSnapshot, reportGap, runDiagnostic }
 * replace the real ones (a test). The duties a test run must not do say so.
 */
function start({ base = 'http://127.0.0.1:7799', log = (s) => console.log(`[core] ${s}`), sinks = {}, wireIn = true, snapshotMs = SNAPSHOT_MS, followMs = FOLLOW_MS } = {}) {
  const cos = cosClient(base); const S = { writeSnapshot, reportGap, runDiagnostic: (s) => runDiagnostic(s, log), ...sinks };
  const timers = []; const seen = new Set(); const since = Date.now() - 60_000; let update = null, stopped = false, warned = false;
  if (wireIn) wire(log);
  const once = (fn, what) => Promise.resolve().then(fn).then(() => { warned = false; }).catch((e) => { if (!warned) log(`${what}: COS did not answer (${e.message}) — tried again at the next tick`); warned = true; });
  const snap = () => once(async () => { const p = snapshot(await cos.systems()); S.writeSnapshot(p);
    if (p.freeMemPct < 20 && p.topConsumer) log(`memory pressure — free ${p.freeMemPct}% — top real consumer: ${p.topConsumer.system} (${p.topConsumer.mb}MB)`); }, 'instance snapshot');
  const fol = () => once(async () => { for (const a of follow(await cos.ledger(), seen, since)) {
    if (a.act === 'gap') { try { S.reportGap(a.system, a.entry); log(`circuit open on '${a.system}': gap kernel_circuit_open written`); } catch (e) { log(`circuit open on '${a.system}': the gap could not be written (${e.message})`); } }
    else await S.runDiagnostic(a.system); } }, 'ledger follow');
  const every = (fn, ms) => { const t = setInterval(fn, ms); if (t.unref) t.unref(); timers.push(t); };
  every(fol, followMs); every(snap, snapshotMs); snap(); fol();
  if (inTestRun()) log('vitals check, automatic updates and the loom refresh skipped: this is a test run (they would act on the tree under test)');
  else {
    vitals(log);
    once(async () => { update = autoUpdate(cos, (await cos.systems()).map(s => s.name), log); }, 'automatic updates');
    const t = setTimeout(() => loomRefresh(log, 0, timers), 60_000); if (t.unref) t.unref(); timers.push(t);
  }
  return { stop() { if (stopped) return; stopped = true; timers.forEach(t => { clearInterval(t); clearTimeout(t); }); try { update && update.stop && update.stop(); } catch (_) {} }, tick: () => Promise.all([snap(), fol()]) };
}

module.exports = { MODULE_ID, start, cosClient, snapshot, follow, perPidMemoryMB, SNAPSHOT_MS };
