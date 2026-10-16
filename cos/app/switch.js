'use strict';
/**
 * cos/app/switch.js — switch a project to another installed version, and roll back when it does not come up (COSA4, 0.60.67)
 * comp_id: cos.app.switch
 * UUID: cos-app-switch-v1-0000-2026-1016-jamesbrooks-001
 * Map: docs/2026-10-15-cos-app-phasemap.spec (COSA4_switch_and_rollback)
 *
 * James, 2026-10-16: "cos app for windows"  ("so i can just replace the zip each time")
 *
 * The order is the safety:
 *   1. the target must exist and pass preflight BEFORE anything running is touched (a bad candidate never takes the working version down);
 *   2. stop the running version; snapshot the persistent data (a newer version may write data an older one cannot read, so the code alone is not the thing to roll back);
 *   3. point `current` at the target, start it, and require it HEALTHY within the timeout;
 *   4. if it is not: stop it, restore the data from the snapshot, point `current` back, start the version that was working, and say why. The failed version stays installed for inspection.
 * A deliberate rollback later (after the new version has run and written real data) does NOT restore the snapshot unless asked: that would throw away what it wrote.
 */
const fs = require('fs'), path = require('path');
const Store = require('./store.js'); const RT = require('./runtime.js');

const MODULE_ID = 'cos.app.switch';
const P = (root, project) => { const p = path.join(root, 'projects', project); return { project: p, data: path.join(p, 'data'), snapshots: path.join(p, 'snapshots'), state: path.join(p, 'state.json') }; };
const readState = (root, project) => { try { return JSON.parse(fs.readFileSync(P(root, project).state, 'utf8')); } catch (_) { return { project, versions: {}, current: null, previous: null }; } };
function writeState(root, project, st) { const f = P(root, project).state; const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(st, null, 2)); fs.renameSync(t, f); }
const children = (d) => { try { return fs.readdirSync(d); } catch (_) { return []; } };
const clearDir = (d) => { for (const n of children(d)) fs.rmSync(path.join(d, n), { recursive: true, force: true }); };   // the folder itself stays: every version's data/ link points at it

/** snapshotData(root, project, label) → { dir, files } — a copy of the persistent data folder */
function snapshotData(root, project, label) {
  const p = P(root, project); const dir = path.join(p.snapshots, `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}`); fs.mkdirSync(dir, { recursive: true });
  let files = 0; for (const n of children(p.data)) { fs.cpSync(path.join(p.data, n), path.join(dir, n), { recursive: true }); files++; }
  return { dir, files };
}
/** restoreData(root, project, snapDir) — the data folder becomes exactly what the snapshot held */
function restoreData(root, project, snapDir) { const p = P(root, project); fs.mkdirSync(p.data, { recursive: true }); clearDir(p.data); for (const n of children(snapDir)) fs.cpSync(path.join(snapDir, n), path.join(p.data, n), { recursive: true }); }
/** pruneSnapshots(root, project, keep) → the names removed (moved out of the way, reported: nothing is dropped silently) */
function pruneSnapshots(root, project, keep = 3) {
  const p = P(root, project); const all = children(p.snapshots).filter(n => !n.startsWith('.')).sort(); const drop = all.slice(0, Math.max(0, all.length - keep));
  for (const n of drop) fs.rmSync(path.join(p.snapshots, n), { recursive: true, force: true }); return drop;
}

/**
 * switchTo(root, project, version, opts) → { ok, from, to, snapshot, healthyAfterMs } | { ok:false, reason, error, rolledBack, restoredData, backOn?, ... }
 * opts: everything runtime.start takes, plus keepSnapshots (3).
 */
async function switchTo(root, project, version, opts = {}) {
  const st = readState(root, project); const p = P(root, project);
  if (!st.versions[version] || !fs.existsSync(path.join(p.project, 'versions', version))) return { ok: false, reason: 'not-installed', error: `${project} ${version} is not installed (import its zip first)`, rolledBack: false };
  const cur = await RT.status(root, project);
  if (cur.running && cur.version === version && st.current === version) return { ok: true, already: true, to: version, note: `${version} is already the running version` };
  const dir = path.join(p.project, 'versions', version);
  const pre = RT.preflight(dir, { entry: opts.entry, modulesDir: opts.modulesDir === undefined ? RT.defaultModulesDir() : opts.modulesDir });
  if (!pre.ok) return { ok: false, reason: 'preflight', error: `${version} cannot start: ${pre.problems.join('; ')}. Nothing was stopped; ${cur.running ? cur.version + ' is still running' : 'nothing was running'}.`, needs: pre.needs, rolledBack: false };
  const from = st.current || (cur.running ? cur.version : null);
  if (cur.running) { const s = await RT.stop(root, project, { graceMs: opts.graceMs }); if (!s.ok) return { ok: false, reason: 'stop-failed', error: `could not stop ${cur.version}: ${s.error}`, rolledBack: false }; }
  const snap = snapshotData(root, project, `${from || 'none'}-to-${version}`);
  st.previous = from; st.current = version; writeState(root, project, st);
  const r = await RT.start(root, project, version, opts);
  if (r.ok) { const pruned = pruneSnapshots(root, project, opts.keepSnapshots === undefined ? 3 : opts.keepSnapshots); return { ok: true, from, to: version, snapshot: snap.dir, snapshotFiles: snap.files, prunedSnapshots: pruned, healthyAfterMs: r.healthyAfterMs, pid: r.pid, log: r.log }; }
  // it did not come up: put everything back
  await RT.stop(root, project, { graceMs: opts.graceMs });
  restoreData(root, project, snap.dir); const st2 = readState(root, project); st2.current = from; st2.previous = null; writeState(root, project, st2);
  let backOn = null, backErr = null;
  if (from) { const b = await RT.start(root, project, from, opts); if (b.ok) backOn = from; else backErr = b.error; }
  return { ok: false, reason: r.reason, error: `${version} did not come up: ${r.error}`, rolledBack: true, restoredData: true, snapshot: snap.dir, backOn, ...(backErr ? { backError: `${from} did not restart either: ${backErr}` } : {}), failedVersionKept: version, log: r.log };
}

/** rollback(root, project, { restoreData:false }) — go back to the previous version. Data is left as it is unless asked: the newer version may have written real work. */
async function rollback(root, project, opts = {}) {
  const st = readState(root, project); if (!st.previous) return { ok: false, reason: 'no-previous', error: `${project} has no previous version to go back to` };
  const target = st.previous; let snapDir = null;
  if (opts.restoreData) { const p = P(root, project); const snaps = children(p.snapshots).filter(n => n.endsWith(`-to-${st.current}`)).sort(); snapDir = snaps.length ? path.join(p.snapshots, snaps[snaps.length - 1]) : null; if (!snapDir) return { ok: false, reason: 'no-snapshot', error: `no data snapshot was taken when switching to ${st.current}` }; }
  const r = await switchTo(root, project, target, { ...opts });
  if (r.ok && snapDir) { await RT.stop(root, project, { graceMs: opts.graceMs }); restoreData(root, project, snapDir); const s2 = await RT.start(root, project, target, opts); if (!s2.ok) return { ok: false, reason: s2.reason, error: `data restored but ${target} did not restart: ${s2.error}` }; return { ...r, restoredData: snapDir }; }
  return r;
}

module.exports = { MODULE_ID, snapshotData, restoreData, pruneSnapshots, switchTo, rollback };
