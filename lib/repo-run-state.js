'use strict';
/**
 * lib/repo-run-state.js — a repo's run state: playing or paused, like a VM.
 * comp_id: nexus.lib.repo-run-state
 * UUID: nexus-lib-repo-run-state-v1-0000-2026-1012-jamesbrooks-001
 *
 * James (2026-10-12): "the same way the compartment has versions in the repo browser page in the ui, needs play, pause
 * and rewind, using the state of the compartment using the rewind engine. like i want to be able to pause the repo
 * activity like the way vmware pauses the state of the vm."
 *
 * Before: ⏸ / ▶ on a repo card paused its COS desktop only, and only while the desktop ran. The repo's own activity —
 * its agent, a phase climbing the ladder, the spec build queue — went on regardless.
 *
 * Now a repo has one run state, kept in idearium's data dir (one small JSON file, read by mtime so every process that
 * gates on it sees a pause at once):
 *   pause(uuid, { by, reason, snapshot, checkpoint })  → paused: the next step of any work in the repo waits
 *   resume(uuid, { by })                               → playing: everything waiting goes on where it stopped
 *   wait(uuid, { onPause, signal })                    → resolves at once while playing; while paused, when played
 * A pause never kills work mid-step (a reply already being written finishes, as a VM's in-flight I/O does); it freezes
 * the work between steps: no agent call starts (lib/repo-agent.js dispatch), no phase attempt starts, no spec chunk of
 * the repo is queued. The pause records the version (a Versionium snapshot) and desktop checkpoint taken at that moment,
 * so ⏮ rewind has a known-good place to go back to.
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.repo-run-state';
const VERSION = '1.0.0';
const POLL_MS = 1000;

let _file = null;
function _path() {
  if (_file) return _file;
  let dir;
  try { dir = require('../idearium/lib/data-dir.cjs').ideariumDataDir(); } catch (_) { dir = path.join(__dirname, '..', 'idearium', 'data'); }
  return path.join(dir, 'repo-run-state.json');
}
function _setFile(f) { _file = f || null; _cache = null; _cacheMtime = -1; }   // tests

let _cache = null, _cacheMtime = -1;
function _read() {
  const f = _path();
  let m = -1; try { m = fs.statSync(f).mtimeMs; } catch (_) { m = -1; }
  if (_cache && m === _cacheMtime) return _cache;
  let d = {}; try { d = m >= 0 ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}; } catch (_) { d = {}; }
  _cache = d && typeof d === 'object' ? d : {}; _cacheMtime = m;
  return _cache;
}
function _write(d) {
  const f = _path();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, f);
  _cache = d; try { _cacheMtime = fs.statSync(f).mtimeMs; } catch (_) { _cacheMtime = -1; }
}

const _listeners = new Set();
function onChange(fn) { if (typeof fn === 'function') _listeners.add(fn); return () => _listeners.delete(fn); }
function _emit(uuid, st) { for (const fn of _listeners) { try { fn(uuid, st); } catch (_) {} } }

/** get(uuid) -> { state: 'playing' | 'paused', since, by, reason, snapshot, checkpoint, history[] } */
function get(uuid) {
  const r = _read()[uuid];
  return r ? { ...r } : { state: 'playing', since: null, by: null, reason: null, snapshot: null, checkpoint: null, history: [] };
}
function isPaused(uuid) { return get(uuid).state === 'paused'; }
function list() { const d = _read(); return Object.entries(d).filter(([, v]) => v && v.state === 'paused').map(([uuid, v]) => ({ uuid, ...v })); }

function _set(uuid, patch, event) {
  if (!uuid) throw new Error('repo uuid required');
  const d = { ..._read() };
  const prev = d[uuid] || { state: 'playing', history: [] };
  const next = { ...prev, ...patch, history: [...(prev.history || []), event].slice(-50) };
  d[uuid] = next;
  _write(d);
  _emit(uuid, next);
  return { ...next };
}

/** pause(uuid, { by, reason, snapshot, checkpoint }) — idempotent: pausing a paused repo keeps when it was paused */
function pause(uuid, { by = 'person', reason = null, snapshot = null, checkpoint = null } = {}) {
  const cur = get(uuid);
  if (cur.state === 'paused') return { ...cur, already: true };
  const now = Date.now();
  return _set(uuid, { state: 'paused', since: now, by, reason, snapshot, checkpoint }, { ts: now, op: 'pause', by, reason, snapshot, checkpoint });
}
function resume(uuid, { by = 'person' } = {}) {
  const cur = get(uuid);
  if (cur.state !== 'paused') return { ...cur, already: true };
  const now = Date.now();
  return _set(uuid, { state: 'playing', since: now, by, reason: null }, { ts: now, op: 'resume', by, pausedMs: cur.since ? now - cur.since : null });
}
/** note(uuid, op, detail) — a rewind (or anything else done to a paused repo) on its history */
function note(uuid, op, detail = {}) { return _set(uuid, {}, { ts: Date.now(), op, ...detail }); }

/**
 * wait(uuid, { onPause, signal, pollMs }) -> Promise<{ waitedMs }>
 * While the repo plays: resolves now. While paused: onPause(state) is called once, then it resolves when the repo is
 * played (or rejects when signal aborts). Polls the file, so a pause or play from another process is seen.
 */
function wait(uuid, { onPause = null, signal = null, pollMs = POLL_MS } = {}) {
  if (!uuid || !isPaused(uuid)) return Promise.resolve({ waitedMs: 0 });
  const t0 = Date.now();
  try { if (onPause) onPause(get(uuid)); } catch (_) {}
  return new Promise((resolve, reject) => {
    let timer = null;
    const done = () => { clearInterval(timer); off(); resolve({ waitedMs: Date.now() - t0 }); };
    const off = onChange((u, st) => { if (u === uuid && st.state !== 'paused') done(); });
    timer = setInterval(() => {
      if (signal && signal.aborted) { clearInterval(timer); off(); reject(new Error('aborted while the repo was paused')); return; }
      if (!isPaused(uuid)) done();
    }, pollMs);
  });
}

module.exports = { MODULE_ID, VERSION, get, isPaused, list, pause, resume, note, wait, onChange, _setFile };
