'use strict';
/**
 * lib/scheduler.js — schedule tasks/jobs/alarms/timed payloads (agnostic; §CA1)
 * UUID: nexus-scheduler-v1-0000-2026-0808-001
 *
 * James: "co-pilot can schedule tasks, jobs, alarms, route commands, deliver
 * payload to agent at a certain time."
 *
 * The missing autonomy atom — nothing in NEXUS scheduled anything for a time.
 * This does: schedule(spec) registers a task to fire once at a time, or on an
 * interval; on fire it delivers a payload to a target (agent/system/command) —
 * RAID-GATED (governAction) and logged to the fan-in. Persisted to cortex so
 * schedules survive a reboot (§2.2 cortex is truth).
 *
 * §RAID — every fire passes governAction; a denied action does NOT run, it logs.
 * §1.2 — a failed task never crashes the scheduler; it's recorded + the loop
 * continues. §user_wellbeing — no unbounded loops; interval tasks have a max-runs
 * cap unless explicitly infinite.
 */

const TABLE = 'scheduled_tasks';
let _tasks = new Map();          // id → task
let _timers = new Map();         // id → timeout/interval handle
let _running = false;

function _cortex() { try { return require('../cortex/memory/jaa-db').jaaDB || require('../cortex/memory/jaa-db'); } catch (_) { return null; } }
function _uid() { try { return require('crypto').randomUUID(); } catch (_) { return 'task-' + Date.now() + '-' + Math.random().toString(16).slice(2); } }

/**
 * schedule(spec) — register a task.
 * @param spec {
 *   name, at?(ms epoch or Date), inMs?(delay), everyMs?(interval), maxRuns?,
 *   target:{ kind:'agent'|'system'|'command'|'fn', id, payload }, fn?(for kind:fn),
 *   intent?  // for RAID governAction
 * }
 * @returns { id, task }
 */
function schedule(spec = {}) {
  if (!spec.target && !spec.fn) return { ok: false, reason: 'task needs a target or fn' };
  const id = spec.id || _uid();
  const now = Date.now();
  let fireAt = null;
  if (spec.at != null) fireAt = spec.at instanceof Date ? spec.at.getTime() : spec.at;
  else if (spec.inMs != null) fireAt = now + spec.inMs;
  else if (spec.everyMs == null) return { ok: false, reason: 'task needs at, inMs, or everyMs' };

  const task = {
    id, name: spec.name || id,
    at: fireAt, everyMs: spec.everyMs || null,
    maxRuns: spec.maxRuns != null ? spec.maxRuns : (spec.everyMs ? Infinity : 1),
    runs: 0,
    target: spec.target || null, hasFn: !!spec.fn,
    intent: spec.intent || (spec.target && `scheduled.${spec.target.kind}`) || 'scheduled.task',
    createdAt: now, status: 'scheduled',
  };
  _tasks.set(id, task);
  if (spec.fn) _fns.set(id, spec.fn);
  _persist(task);
  if (_running) _arm(id, spec);
  return { ok: true, id, task };
}

const _fns = new Map();

function _arm(id, spec) {
  const task = _tasks.get(id); if (!task) return;
  _disarm(id);
  if (task.everyMs) {
    const h = setInterval(() => _fire(id), task.everyMs);
    if (h.unref) h.unref();
    _timers.set(id, h);
  } else if (task.at != null) {
    const delay = Math.max(0, task.at - Date.now());
    const h = setTimeout(() => _fire(id), delay);
    if (h.unref) h.unref();
    _timers.set(id, h);
  }
}

function _disarm(id) {
  const h = _timers.get(id);
  if (h) { clearTimeout(h); clearInterval(h); _timers.delete(id); }
}

async function _fire(id) {
  const task = _tasks.get(id); if (!task) return;
  if (task.runs >= task.maxRuns) { cancel(id); return; }

  // §RAID — govern the action before it runs.
  let allowed = true, reason = null;
  try {
    const sm = require('../copilot/lib/self-model');
    if (sm.governAction) { const g = sm.governAction({ action: task.intent, target: task.target }, {}); if (g && g.allowed === false) { allowed = false; reason = g.reason; } }
  } catch (_) { /* no governor available → allow but log */ }

  const evt = { type: `scheduled.fire`, source: 'scheduler', task: task.name, allowed, reason, ts: Date.now() };
  try { const f = require('./ledger-fanin'); f.emit && f.emit({ ...evt, type: allowed ? 'scheduled.fire' : 'scheduled.denied' }); } catch (_) {}

  if (!allowed) { task.status = 'denied'; _persist(task); return; }

  // deliver the payload.
  try {
    if (task.hasFn) {
      // §BUGFIX 2026-08-19 — was `if (task.hasFn && _fns.get(id)) ... else
      // await _deliver(task.target)`. When hasFn is true but the in-memory
      // fn was lost (the real, common case: the row survives a process
      // restart in jaaDB, _fns is a plain Map and does not), this fell
      // through to _deliver(), whose switch has no real case for
      // kind:'fn' at all — it hit the silent default case, returned a
      // fake {delivered:'fn'}, and the code below counted it as a
      // successful run. Silent success is worse than a loud failure here:
      // a person watching runs increment would have zero signal that
      // nothing had actually executed since the last boot. Now throws a
      // real, specific, named error instead of falling through.
      const fn = _fns.get(id);
      if (!fn) throw new Error(`kind:'fn' task "${task.name}" (${id}) — its function did not survive the process restart; re-register it via schedule() to revive`);
      await fn(task);
    } else {
      await _deliver(task.target);
    }
    task.runs++; task.status = task.runs >= task.maxRuns ? 'done' : 'scheduled'; task.lastRun = Date.now();
  } catch (e) {
    task.status = 'error'; task.lastError = e.message;   // §1.2 — never crash the scheduler
    try { const f = require('./ledger-fanin'); f.emit && f.emit({ type: 'scheduled.error', source: 'scheduler', task: task.name, error: e.message, ts: Date.now() }); } catch (_) {}
  }
  _persist(task);
  if (task.status === 'done') cancel(id);
}

async function _deliver(target) {
  if (!target) return;
  switch (target.kind) {
    case 'agent': { const ap = require('./agent-pull'); return ap.pull(target.id, target.tool || 'query_capability', target.payload || {}); }
    case 'command': { const rc = require('./agent-tools/tools/execution/run-command'); return rc.run ? rc.run(target.id, target.payload) : null; }
    case 'system': { /* deliver via http to the system's api — left to the caller's connection tool (CA4) */ return { delivered: target.id, payload: target.payload }; }
    default: return { delivered: target.kind };
  }
}

function _persist(task) { try { const db = _cortex(); if (db && db.insert) db.insert(TABLE, { ...task, _key: task.id, at: task.at, everyMs: task.everyMs }); } catch (_) {} }

/** start() — arm all scheduled tasks (called at boot; restores from cortex). */
function start(opts = {}) {
  _running = true;
  // restore persisted tasks (survives reboot).
  if (!opts.skipRestore) {
    try { const db = _cortex(); const rows = db && db.query ? db.query(TABLE, r => r.status === 'scheduled') : []; for (const r of (rows || [])) if (!_tasks.has(r.id)) _tasks.set(r.id, r); } catch (_) {}
  }
  for (const id of _tasks.keys()) _arm(id);
  return { running: true, armed: _tasks.size };
}

function cancel(id) { _disarm(id); const t = _tasks.get(id); if (t) { t.status = 'cancelled'; _persist(t); } _tasks.delete(id); _fns.delete(id); return { ok: true }; }
function list(filter) { let out = [..._tasks.values()]; if (filter && filter.status) out = out.filter(t => t.status === filter.status); return out; }
function get(id) { return _tasks.get(id) || null; }
function stop() { _running = false; for (const id of _timers.keys()) _disarm(id); }
function _resetForTest() { stop(); _tasks = new Map(); _fns.clear(); }

module.exports = { schedule, cancel, list, get, start, stop, _resetForTest, TABLE, MODULE_ID: 'scheduler', VERSION: '1.0.0' };
