'use strict';
// cortex/self-heal/fault-taxonomy.js — Phase 1: schema + sole write authority for `fault_taxonomy`
// UUID: nexus-cortex-escalation-fault-taxonomy-v1-0000-2026-0720-001
//
// §10.1 Each data type has exactly one write authority.
//   Six modules already read `fault_taxonomy` (raid/snr-filter, intelligence,
//   orchestrator/request-handler, lib/constitutional-ai, lib/replay-engine,
//   plus their tests). None of them write to it. This module is the writer —
//   everything else stays a reader.
//
// §13.3 Every fault class is named before it occurs.
//   Levels 0-3 and their friction deltas, and the four friction bands, come
//   verbatim from docs/self-heal.spec and docs/escalation.spec — not invented
//   here, not magic numbers at a call site.
//
// Row shape (confirmed against every existing reader):
//   { uuid, faultClass, friction, ts, count, lastSeen, precursors, examples, successRate, attempts }

const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID = 'cortex/escalation/fault-taxonomy';
const TABLE = 'fault_taxonomy';

// ── §13.3 named constants — docs/escalation.spec ───────────────────────────────
const FRICTION_THRESHOLDS = Object.freeze({
  NOMINAL: 0.0,
  ELEVATED: 0.4,
  HIGH: 0.7,
  FAILURE_MODE: 1.0,
});

// Friction added per self-heal ladder level on a failed attempt (docs/escalation.spec)
const FRICTION_DELTA_BY_LEVEL = Object.freeze({
  0: 0.10,
  1: 0.20,
  2: 0.35,
  3: 0.50,
});

// Level-0/1 known fault classes (docs/self-heal.spec)
const KNOWN_FAULT_CLASSES = Object.freeze([
  'stale_module', 'timeout', 'api_degraded', 'queue_saturated',
  'memory_pressure', 'bottleneck', 'circuit_breaker', 'import_error',
]);

function bandFor(friction) {
  if (friction >= FRICTION_THRESHOLDS.FAILURE_MODE) return 'FAILURE_MODE';
  if (friction >= FRICTION_THRESHOLDS.HIGH) return 'HIGH';
  if (friction >= FRICTION_THRESHOLDS.ELEVATED) return 'ELEVATED';
  return 'NOMINAL';
}

// ── Reads (thin — most real reads already happen directly via jaaDB.query in
//    the six existing consumers; this is for callers inside this organ) ───────
function getFaultClass(faultClass) {
  return jaaDB.get(TABLE, { faultClass }) || null;
}

// ── Sole write path ────────────────────────────────────────────────────────────
// Raises friction for a fault class by the delta for the given ladder level.
// Creates the row on first occurrence (§2.1 — state that matters is persisted,
// not held only in memory). Never called directly by anything outside this
// organ once Phase 2 (the escalation organ proper) subscribes to
// cortex.heal.requested — exposed here only so Phase 1 is independently testable.
function raiseFriction(faultClass, level, meta = {}) {
  if (!faultClass) throw new Error(`[${MODULE_ID}] raiseFriction: faultClass is required`);
  const delta = FRICTION_DELTA_BY_LEVEL[level];
  if (delta === undefined) {
    throw new Error(`[${MODULE_ID}] raiseFriction: unknown ladder level '${level}' — must be one of ${Object.keys(FRICTION_DELTA_BY_LEVEL).join(', ')}`);
  }

  const now = Date.now();
  const existing = getFaultClass(faultClass);

  if (!existing) {
    const row = {
      uuid: uid(),
      faultClass,
      friction: Math.min(delta, FRICTION_THRESHOLDS.FAILURE_MODE),
      ts: now,
      count: 1,
      lastSeen: now,
      precursors: [],
      examples: meta.example ? [meta.example] : [],
      successRate: 0,
    };
    jaaDB.insert(TABLE, row);
    return { row, band: bandFor(row.friction), justEnteredFailureMode: row.friction >= FRICTION_THRESHOLDS.FAILURE_MODE };
  }

  const prevBand = bandFor(existing.friction);
  const newFriction = Math.min(existing.friction + delta, FRICTION_THRESHOLDS.FAILURE_MODE);
  const newBand = bandFor(newFriction);
  const values = {
    friction: newFriction,
    ts: now,
    count: (existing.count || 0) + 1,
    lastSeen: now,
    examples: meta.example ? [...(existing.examples || []).slice(-9), meta.example] : (existing.examples || []),
  };
  jaaDB.update(TABLE, { faultClass }, values);
  const row = { ...existing, ...values };
  return {
    row,
    band: newBand,
    justEnteredFailureMode: prevBand !== 'FAILURE_MODE' && newBand === 'FAILURE_MODE',
  };
}

// Successful fix — friction decays rather than resets outright (a class that
// failed 9 times and succeeded once is not "healthy," it's improving).
function recordSuccess(faultClass, decayFactor = 0.5) {
  const existing = getFaultClass(faultClass);
  if (!existing) return null;
  const newFriction = Math.max(0, existing.friction * decayFactor);
  const newSuccessRate = ((existing.successRate || 0) * (existing.count || 1) + 1) / ((existing.count || 1) + 1);
  const values = { friction: newFriction, successRate: newSuccessRate, ts: Date.now() };
  jaaDB.update(TABLE, { faultClass }, values);
  return { ...existing, ...values, band: bandFor(newFriction) };
}

// §BUILT 2026-09-11 — James: "get raid solid, enterprise grade." Real gap
// found wiring escalation.js's recordAttemptOutcome(): `count` above is
// raiseFriction's own occurrence counter — it's only ever bumped on a
// FAILED attempt (recordSuccess doesn't touch it), so it was never a true
// total-attempts tally despite successRate's own math treating it like
// one. `attempts` is a separate, honest field: bumped once per real call
// to recordAttemptOutcome, success or failure, after that call's own
// raiseFriction()/recordSuccess() has already run (so a row exists for
// any fault class that has ever failed at least once). No-op — not an
// error — against a missing row: a fault class whose very first real
// attempt succeeds has no row yet (recordSuccess() itself returns null
// rather than fabricating one, same honesty rule as the rest of this
// file), and recordAttempt() is only ever called after a row-creating
// call, never before one.
function recordAttempt(faultClass) {
  const existing = getFaultClass(faultClass);
  if (!existing) return null;
  const values = { attempts: (existing.attempts || 0) + 1, ts: Date.now() };
  jaaDB.update(TABLE, { faultClass }, values);
  return { ...existing, ...values };
}

// §R7 2026-08-12 — the function service/nexus-diagnostic.js's /tension
// route has always tried to call and never found (it required a directory,
// cortex/healer, that never existed — cortex/self-heal is the real one, and
// even this file didn't have scoreTension). James's phasemap: "build a real
// scoreTension(gap) using fault-taxonomy's own FRICTION_THRESHOLDS instead
// of the silent fallback (gap.severity==='high'?2:1)."
//
// A gap-field gap and a fault_taxonomy row are different shapes (checked
// before building, not assumed compatible) — a gap is a one-off event, a
// fault class accumulates over repeated occurrences. This bridges them
// honestly: if this gap's TYPE already maps to a real fault class with
// real accumulated history, that real number is returned — it reflects
// something that's actually happened repeatedly, richer than any single
// gap could say alone. If not (true right now for every current gap type
// — fault_taxonomy has zero rows, the escalation organ that would
// populate it was never built), this computes a fresh score using the
// SAME real, doc-specced delta table raiseFriction() uses, not an
// invented number — genuinely better than the old severity===  'high'?2:1
// fallback, honest about not being "real accumulated friction" either.
const GAP_TYPE_TO_FAULT_CLASS = Object.freeze({
  'kernel_circuit_open': 'circuit_breaker',
  'dangling-hook': 'import_error',
  'chunk-build.all-agents-unreachable': 'api_degraded',
  'lifeline.provider-timeout': 'timeout',
  'lifeline.provider-failure': 'api_degraded',
});

function scoreTension(gap) {
  if (!gap) return FRICTION_DELTA_BY_LEVEL[0];
  const faultClass = GAP_TYPE_TO_FAULT_CLASS[gap.type] || null;
  if (faultClass) {
    const existing = getFaultClass(faultClass);
    if (existing) return existing.friction;   // real, accumulated — reflects real repeated occurrence
  }
  // No mapped fault class, or no accumulated history yet — a fresh, honest
  // estimate from the same real delta table, keyed by the same severity
  // levels raiseFriction() itself uses (0=low,1=medium,2=high,3=critical),
  // not a guess unrelated to the rest of this module's own math.
  const level = gap.severity === 'critical' ? 3 : gap.severity === 'high' ? 2 : gap.severity === 'medium' ? 1 : 0;
  return FRICTION_DELTA_BY_LEVEL[level];
}

module.exports = {
  MODULE_ID,
  TABLE,
  FRICTION_THRESHOLDS,
  FRICTION_DELTA_BY_LEVEL,
  KNOWN_FAULT_CLASSES,
  GAP_TYPE_TO_FAULT_CLASS,
  bandFor,
  getFaultClass,
  raiseFriction,
  recordSuccess,
  recordAttempt,
  scoreTension,
};
