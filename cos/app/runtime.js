'use strict';
/**
 * cos/app/runtime.js — run a project's installed version, supervised by COS (COSA2 + COSA3, 0.60.88)
 * comp_id: cos.app.runtime
 * UUID: cos-app-runtime-v1-0000-2026-1016-jamesbrooks-001
 * Map: docs/2026-10-15-cos-app-phasemap.spec (COSA2_runtime_and_dependencies, COSA3_run_and_supervise)
 *
 * James, 2026-10-16: "cos app for windows"  (the app that "runs nexus on my pc", so the zip can just be replaced)
 *
 * COS does not become a second supervisor: it starts the project's OWN supervisor (nexus/autopilot.js, status on :7799) and waits for it to say it is up.
 * No Node install is needed: when COS is the Electron app it runs the project with its own runtime (ELECTRON_RUN_AS_NODE). The release zip has no node_modules, and
 * Nexus's whole runtime dependency list is one package (js-yaml): COS bundles it and hands it over through NODE_PATH. A version that needs anything COS does not bundle
 * is refused BEFORE it starts, naming the module (preflight), not left to crash.
 * Data: the version's data/ is the link COSA1 made to the one persistent folder; NEXUS_DATA_ROOT points at it too, for the 23 modules that honour it.
 * The project is only ever started from a version folder COSA1 installed; this module never downloads and never writes inside a version except its own logs, which go to <project>/logs.
 */
const fs = require('fs'), path = require('path'), net = require('net'), http = require('http'), { spawn, execFileSync } = require('child_process');

const MODULE_ID = 'cos.app.runtime';
// 0.60.241 RF2 — a release's supervisor lives at lib/nexus/autopilot.js from 0.60.241 on, at nexus/autopilot.js before: COS runs any
// installed release, so it uses the one the release has (an explicit entry still wins)
const ENTRIES = ['lib/nexus/autopilot.js', 'nexus/autopilot.js'];
function entryOf(versionDir, entry) { if (entry) return entry; return ENTRIES.find(e => fs.existsSync(path.join(versionDir, e))) || ENTRIES[0]; }
const DEFAULTS = { entry: null, statusPort: 7799, ports: [7799, 7820, 4800, 9000], healthTimeoutMs: 60000, graceMs: 8000, keepLogs: 10 };
const paths = (root, project) => { const p = path.join(root, 'projects', project); return { project: p, logs: path.join(p, 'logs'), run: path.join(p, 'run.json') }; };
const rmf = (f) => { try { fs.unlinkSync(f); } catch (_) {} };

/** defaultModulesDir() → the node_modules folder that holds js-yaml (COS's own, bundled), or null */
function defaultModulesDir() { try { return path.dirname(path.dirname(require.resolve('js-yaml/package.json'))); } catch (_) { return null; } }

/** preflight(versionDir, { entry, modulesDir }) → { ok, problems[], needs[] }. Nothing is started. */
function preflight(versionDir, { entry = DEFAULTS.entry, modulesDir = defaultModulesDir() } = {}) {
  const problems = [], needs = [];
  if (!fs.existsSync(versionDir)) return { ok: false, problems: [`the version folder is missing: ${versionDir}`], needs };
  entry = entryOf(versionDir, entry);
  if (!fs.existsSync(path.join(versionDir, entry))) problems.push(`this release has no ${entry}`);
  let pkg = null; try { pkg = JSON.parse(fs.readFileSync(path.join(versionDir, 'package.json'), 'utf8')); } catch (_) { problems.push('package.json is missing or unreadable'); }
  for (const dep of Object.keys((pkg && pkg.dependencies) || {})) {
    const has = modulesDir && fs.existsSync(path.join(modulesDir, dep, 'package.json'));
    if (!has) { needs.push(dep); problems.push(`it needs the module "${dep}", which COS does not bundle yet: refused before starting (a start would crash on the first require)`); }
  }
  return { ok: !problems.length, problems, needs };
}

const portFree = (port) => new Promise((ok) => { const s = net.createServer(); s.once('error', () => ok(false)); s.listen(port, '127.0.0.1', () => s.close(() => ok(true))); });
/** portsBusy(ports) → the ones already in use (so the message can say which port, not "it did not start") */
async function portsBusy(ports) { const busy = []; for (const p of ports) if (p && !(await portFree(p))) busy.push(p); return busy; }

const probe = (port, timeoutMs = 1500) => new Promise((ok) => { const req = http.get({ host: '127.0.0.1', port, path: '/status', timeout: timeoutMs }, (res) => { res.resume(); ok(res.statusCode >= 200 && res.statusCode < 300); }); req.on('error', () => ok(false)); req.on('timeout', () => { req.destroy(); ok(false); }); });
const alive = (pid) => {
  try { process.kill(pid, 0); } catch (e) { return e.code === 'EPERM'; }
  try { if (process.platform === 'linux' && /^\d+ \(.*\) Z/.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8'))) return false; } catch (_) {}   // a zombie has ended; it is only waiting to be reaped
  return true;
};
const tail = (f, n = 20) => { try { return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).slice(-n).join('\n'); } catch (_) { return ''; } };
function pruneLogs(dir, keep) { try { const fs2 = fs.readdirSync(dir).filter(n => /\.log$/.test(n)).sort(); for (const n of fs2.slice(0, Math.max(0, fs2.length - keep))) rmf(path.join(dir, n)); } catch (_) {} }

function readRun(root, project) { try { return JSON.parse(fs.readFileSync(paths(root, project).run, 'utf8')); } catch (_) { return null; } }

/**
 * start(root, project, version, opts) → { ok, pid, version, healthyAfterMs, log } | { ok:false, error, reason, logTail? }
 * reason: 'already-running' | 'preflight' | 'port-busy' | 'exited' | 'not-healthy' | 'spawn'
 */
async function start(root, project, version, opts = {}) {
  const o = { ...DEFAULTS, ...opts }; const P = paths(root, project); const dir = path.join(root, 'projects', project, 'versions', version);
  const cur = readRun(root, project); if (cur && alive(cur.pid)) return { ok: false, reason: 'already-running', error: `${project} ${cur.version} is already running (pid ${cur.pid}): stop it first` };
  rmf(P.run);
  o.entry = entryOf(dir, o.entry);
  const pre = preflight(dir, { entry: o.entry, modulesDir: o.modulesDir === undefined ? defaultModulesDir() : o.modulesDir }); if (!pre.ok) return { ok: false, reason: 'preflight', error: pre.problems.join('; '), needs: pre.needs };
  const busy = await portsBusy(o.ports); if (busy.length) return { ok: false, reason: 'port-busy', error: `port${busy.length > 1 ? 's' : ''} ${busy.join(', ')} already in use by another program: ${project} cannot start until ${busy.length > 1 ? 'they are' : 'it is'} free (only one version runs at a time; is another copy still running?)`, busy };
  fs.mkdirSync(P.logs, { recursive: true }); pruneLogs(P.logs, o.keepLogs);
  const log = path.join(P.logs, `${version}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`); const fd = fs.openSync(log, 'a');
  const env = { ...process.env, ...(o.env || {}), NEXUS_SUPERVISED: undefined, NEXUS_DATA_ROOT: path.join(root, 'projects', project, 'data'), AUTOPILOT_STATUS_PORT: String(o.statusPort),
    ...(o.modulesDir === null ? {} : { NODE_PATH: [o.modulesDir === undefined ? defaultModulesDir() : o.modulesDir, process.env.NODE_PATH].filter(Boolean).join(path.delimiter) }),
    ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) };
  Object.keys(env).forEach(k => env[k] === undefined && delete env[k]);
  let child; try { child = spawn(o.node || process.execPath, [o.entry, `--status-port=${o.statusPort}`], { cwd: dir, env, detached: true, stdio: ['ignore', fd, fd], windowsHide: true }); }
  catch (e) { fs.closeSync(fd); return { ok: false, reason: 'spawn', error: `could not start: ${e.message}` }; }
  fs.closeSync(fd); const t0 = Date.now(); let exited = null; child.once('exit', (code, sig) => { exited = { code, sig }; }); child.once('error', (e) => { exited = { code: null, sig: null, error: e.message }; }); child.unref();
  fs.writeFileSync(P.run, JSON.stringify({ pid: child.pid, project, version, statusPort: o.statusPort, startedAt: new Date().toISOString(), log }));
  while (Date.now() - t0 < o.healthTimeoutMs) {
    if (exited) { rmf(P.run); return { ok: false, reason: 'exited', error: `${project} ${version} exited during start (${exited.error || `code ${exited.code}${exited.sig ? ', ' + exited.sig : ''}`}). Last log lines:\n${tail(log)}`, logTail: tail(log), log }; }
    if (await probe(o.statusPort)) return { ok: true, pid: child.pid, version, healthyAfterMs: Date.now() - t0, log };
    await new Promise(r => setTimeout(r, o.pollMs || 300));
  }
  await stop(root, project, { graceMs: o.graceMs });
  return { ok: false, reason: 'not-healthy', error: `${project} ${version} did not answer on :${o.statusPort} within ${Math.round(o.healthTimeoutMs / 1000)} s and was stopped. Last log lines:\n${tail(log)}`, logTail: tail(log), log };
}

function _killTree(pid, force) {
  if (process.platform === 'win32') { try { execFileSync('taskkill', ['/pid', String(pid), '/T', ...(force ? ['/F'] : [])], { stdio: 'ignore', windowsHide: true }); } catch (_) {} return; }
  try { process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM'); } catch (_) { try { process.kill(pid, force ? 'SIGKILL' : 'SIGTERM'); } catch (__) {} }
}
/** stop(root, project, { graceMs }) → { ok, stopped, pid } — asks the whole process tree to end, force-kills what is left after the grace period */
async function stop(root, project, { graceMs = DEFAULTS.graceMs } = {}) {
  const run = readRun(root, project); const P = paths(root, project);
  if (!run) return { ok: true, stopped: false, note: 'not running' };
  if (!alive(run.pid)) { rmf(P.run); return { ok: true, stopped: false, note: 'it had already exited' }; }
  _killTree(run.pid, false); const t0 = Date.now(); while (alive(run.pid) && Date.now() - t0 < graceMs) await new Promise(r => setTimeout(r, 100));
  if (alive(run.pid)) { _killTree(run.pid, true); const t1 = Date.now(); while (alive(run.pid) && Date.now() - t1 < 3000) await new Promise(r => setTimeout(r, 100)); }
  if (alive(run.pid)) return { ok: false, error: `pid ${run.pid} would not end`, pid: run.pid };
  rmf(P.run); return { ok: true, stopped: true, pid: run.pid, version: run.version };
}

/** status(root, project) → { running, pid, version, healthy, startedAt } — healthy is asked of the project right now, not remembered */
async function status(root, project) {
  const run = readRun(root, project); if (!run) return { running: false };
  if (!alive(run.pid)) { rmf(paths(root, project).run); return { running: false, note: `${run.version} was running (pid ${run.pid}) and has exited` }; }
  return { running: true, pid: run.pid, version: run.version, startedAt: run.startedAt, statusPort: run.statusPort, healthy: await probe(run.statusPort), log: run.log };
}
function logs(root, project, { lines = 50 } = {}) { const r = readRun(root, project); let f = r && r.log; if (!f) { try { const d = paths(root, project).logs; const n = fs.readdirSync(d).filter(x => /\.log$/.test(x)).sort().pop(); f = n && path.join(d, n); } catch (_) {} } return f ? { file: f, text: tail(f, lines) } : { file: null, text: '' }; }

module.exports = { MODULE_ID, DEFAULTS, defaultModulesDir, preflight, portsBusy, start, stop, status, logs, readRun, killTree: _killTree };
