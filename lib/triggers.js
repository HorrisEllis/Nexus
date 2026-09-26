'use strict';
/**
 * lib/triggers.js — fire an action WHEN a condition holds (agnostic; §CA2)
 * UUID: nexus-triggers-v1-0000-2026-0808-001
 *
 * James: "when X, do Y" — triggers/conditions engine, composing the fan-in
 * (live event stream) + scheduler (CA1, for delivery) + governAction (RAID gate).
 *
 * CA1 (scheduler) is autonomy's PROACTIVE half — "at time T, do Y."
 * CA2 (this) is the REACTIVE half — "when event E happens, do Y." Same target/
 * deliver/governAction/persist shape as scheduler.js on purpose (§8.6 — the two
 * are one primitive with two triggers, not two designs), duplicated rather than
 * imported because scheduler's _deliver is private and the shapes are small
 * enough that a shared require would couple two independently-cancellable
 * subsystems for four lines of code.
 *
 * A trigger subscribes to lib/ledger-fanin with a filter built from its
 * condition. condition.type:
 *   'event'  — match fan-in rows by type (exact or prefix via type ending '.')
 *              and/or a predicate fn over the row. Covers James's named cases
 *              directly: a specific event, or "any sigma.* event" (cortex/orion
 *              already emits sigma.event.halt_risk / sigma.event.warning onto
 *              this exact stream — no separate sigma channel to wire).
 *   'metric' — predicate(row) evaluates a numeric field against a threshold;
 *              same subscribe path, just a threshold-shaped predicate.
 * There is no separate "relational-field" integration here: RFR2/CFR's own
 * output already reaches the fan-in as sigma.* events (see above), so "compose
 * the relational-field" in the phasemap's one-line description is satisfied by
 * subscribing to the same stream, not a second integration point — correcting
 * that assumption out loud rather than building a redundant seam for it (the
 * kernel-surface.js precedent: read the body, not the docblock, before wiring).
 *
 * §RAID — every fire passes governAction; denied fires log, don't run.
 * §1.2 — a throwing action is caught, recorded, never crashes the engine.
 * §user_wellbeing — 'once' is the default; an armed (repeating) trigger still
 * respects maxFires so nothing runs unbounded.
 */

const TABLE = 'triggers';
let _triggers = new Map();     // id → trigger
let _unsubs = new Map();       // id → unsubscribe fn (from fan-in)
let _running = false;

function _cortex() { try { return require('../cortex/memory/jaa-db').jaaDB || require('../cortex/memory/jaa-db'); } catch (_) { return null; } }
function _uid() { try { return require('crypto').randomUUID(); } catch (_) { return 'trig-' + Date.now() + '-' + Math.random().toString(16).slice(2); } }
function _fanin() { try { return require('./ledger-fanin'); } catch (_) { return null; } }

/**
 * registerTrigger(spec) — register a condition→action binding.
 * @param spec {
 *   name, condition: {
 *     type: 'event'|'metric',
 *     matchType?(string, exact or prefix if it ends with '.'),
 *     source?(string, optional fan-in source filter),
 *     predicate?(row)=>bool  // extra check, e.g. metric threshold
 *   },
 *   target:{ kind:'agent'|'system'|'command'|'fn', id, payload }, fn?(row,task),
 *   once?(default true), maxFires?(default: once?1:Infinity), intent?
 * }
 * @returns { id, trigger }
 */
function registerTrigger(spec = {}) {
  if (!spec.condition || !spec.condition.type) return { ok: false, reason: 'trigger needs a condition.type' };
  if (!spec.target && !spec.fn) return { ok: false, reason: 'trigger needs a target or fn' };
  const id = spec.id || _uid();
  const once = spec.once !== false;
  const trigger = {
    id, name: spec.name || id,
    condition: spec.condition,
    target: spec.target || null, hasFn: !!spec.fn,
    once, maxFires: spec.maxFires != null ? spec.maxFires : (once ? 1 : Infinity),
    fires: 0,
    intent: spec.intent || (spec.target && `trigger.${spec.target.kind}`) || 'trigger.fire',
    createdAt: Date.now(), status: 'armed',
  };
  _triggers.set(id, trigger);
  if (spec.fn) _fns.set(id, spec.fn);
  _persist(trigger);
  if (_running) _arm(id);
  return { ok: true, id, trigger };
}

const _fns = new Map();

function _buildFilter(condition) {
  return (row) => {
    if (condition.source && row.source !== condition.source) return false;
    if (condition.matchType) {
      const mt = condition.matchType;
      const isPrefix = mt.endsWith('.');
      if (isPrefix) { if (!row.type || !row.type.startsWith(mt)) return false; }
      else if (row.type !== mt) return false;
    }
    if (condition.predicate) { try { if (!condition.predicate(row)) return false; } catch (_) { return false; } }
    return true;
  };
}

function _arm(id) {
  const trig = _triggers.get(id); if (!trig) return;
  _disarm(id);
  const fanin = _fanin(); if (!fanin || !fanin.subscribe) return;
  const filter = _buildFilter(trig.condition);
  const unsub = fanin.subscribe(`trigger:${id}`, (row) => _fire(id, row), { filter });
  _unsubs.set(id, unsub);
}

function _disarm(id) {
  const u = _unsubs.get(id);
  if (u) { try { u(); } catch (_) {} _unsubs.delete(id); }
}

async function _fire(id, row) {
  const trig = _triggers.get(id); if (!trig) return;
  if (trig.fires >= trig.maxFires) { disarmTrigger(id); return; }
  // Reserve this fire SYNCHRONOUSLY, before any await. lib/ledger-fanin's
  // emit() calls every subscriber inline in a loop — a burst of same-tick
  // events would otherwise all read trig.fires as unchanged before the first
  // one's async delivery finished incrementing it, blowing past maxFires.
  // Reserving on attempt (not just success) is the correct fix, not counting
  // only clean deliveries: a bound on ATTEMPTS is what "never runs unbounded"
  // (§user_wellbeing) actually requires.
  trig.fires++;
  if (trig.fires >= trig.maxFires) trig.status = 'done';

  // §RAID — govern the action before it runs (same gate scheduler uses).
  let allowed = true, reason = null;
  try {
    const sm = require('../copilot/lib/self-model');
    if (sm.governAction) { const g = sm.governAction({ action: trig.intent, target: trig.target }, {}); if (g && g.allowed === false) { allowed = false; reason = g.reason; } }
  } catch (_) { /* no governor available → allow but log */ }

  const fanin = _fanin();
  try { fanin && fanin.emit && fanin.emit({ type: allowed ? 'trigger.fire' : 'trigger.denied', source: 'triggers', trigger: trig.name, matchedType: row && row.type, allowed, reason, ts: Date.now() }); } catch (_) {}

  if (!allowed) { trig.status = 'denied'; _persist(trig); return; }

  try {
    if (trig.hasFn && _fns.get(id)) await _fns.get(id)(row, trig);
    else await _deliver(trig.target, row);
    trig.lastFired = Date.now();
    if (trig.status !== 'done') trig.status = 'armed';
  } catch (e) {
    trig.status = 'error'; trig.lastError = e.message;   // §1.2 — never crash the engine
    try { fanin && fanin.emit && fanin.emit({ type: 'trigger.error', source: 'triggers', trigger: trig.name, error: e.message, ts: Date.now() }); } catch (_) {}
  }
  _persist(trig);
  if (trig.status === 'done') disarmTrigger(id);
}

async function _deliver(target, row) {
  if (!target) return;
  switch (target.kind) {
    case 'agent': { const ap = require('./agent-pull'); return ap.pull(target.id, target.tool || 'query_capability', { ...(target.payload || {}), _causedBy: row && row.type }); }
    case 'command': { const rc = require('./agent-tools/tools/execution/run-command'); return rc.run ? rc.run(target.id, target.payload) : null; }
    case 'system': { return { delivered: target.id, payload: target.payload, causedBy: row && row.type }; }
    default: return { delivered: target.kind };
  }
}

function _persist(trig) { try { const db = _cortex(); if (db && db.insert) db.insert(TABLE, { ...trig, _key: trig.id, condition: trig.condition }); } catch (_) {} }

/** start() — arm all triggers (called at boot; restores from cortex, same as scheduler). */
function start(opts = {}) {
  _running = true;
  if (!opts.skipRestore) {
    try { const db = _cortex(); const rows = db && db.query ? db.query(TABLE, r => r.status === 'armed') : []; for (const r of (rows || [])) if (!_triggers.has(r.id)) _triggers.set(r.id, r); } catch (_) {}
  }
  for (const id of _triggers.keys()) _arm(id);
  return { running: true, armed: _triggers.size };
}

function disarmTrigger(id) { _disarm(id); const t = _triggers.get(id); if (t) { t.status = 'cancelled'; _persist(t); } _triggers.delete(id); _fns.delete(id); return { ok: true }; }
function list(filter) { let out = [..._triggers.values()]; if (filter && filter.status) out = out.filter(t => t.status === filter.status); return out; }
function get(id) { return _triggers.get(id) || null; }
function stop() { _running = false; for (const id of _unsubs.keys()) _disarm(id); }
function _resetForTest() { stop(); _triggers = new Map(); _fns.clear(); }

module.exports = { registerTrigger, disarmTrigger, list, get, start, stop, _resetForTest, TABLE, MODULE_ID: 'triggers', VERSION: '1.0.0' };
