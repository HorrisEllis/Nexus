'use strict';
// ── lib/crystal-lattice.js ────────────────────────────────────────────────────
// UUID: nexus-crystal-lattice-v1-0000-4000-0000-000000000001
// Version: 1.0.0
// Phase: 25/26 — Crystallization + Lattice (sub-step 5 of Phase 25's build;
//         also closes part of Phase 26's "negative crystal promotion")
// Deps:  compartment-engine ✓ (registers into) · jaa ✓
//
// Two related mechanisms:
//   1. Crystallization — a (domain, verb, outcome) pattern seen
//      pattern_frequency >= threshold times becomes a CRYSTAL (outcome=PASS)
//      or NEGATIVE_CRYSTAL (outcome=FAIL/DELETE). Crystals are written to
//      the EXISTING `crystals` JAA table — cortex/liminal-space/index.js
//      already writes to this table with its own, different schema
//      (focalPoint-based resonance crystals). Both producers coexist in the
//      same table as a superset schema; this module never reads or
//      reinterprets liminal-space's records, only adds its own alongside.
//   2. Lattice — edge weights between nodes (Concept | State |
//      CompartmentType). Updated after every compartment resolution:
//      success increases weight, failure decreases it, a repeated
//      transition strengthens it further. New JAA table: lattice_edges.
//
// ── PATTERN SIGNATURE ────────────────────────────────────────────────────────
// (domain, verb, outcome) keyed off compartment._declaredDomain/_declaredVerb
// (added in compartment-engine.js spawn() specifically so this module has
// something real to key on) and compartment.status. In-memory frequency
// counting, same bounded-eviction approach as reflection.js's streak
// tracker — a restart resets counts rather than risk unbounded growth or
// double-counting against stale state.
//
// §1.1  Every crystal/lattice-edge write has a UUID
// §1.2  Nothing silent — every crystallization event logged

const crypto = require('crypto');

const MODULE_ID = 'crystal-lattice';
const VERSION   = '1.0.0';

const PATTERN_FREQUENCY_THRESHOLD = parseInt(process.env.CRYSTAL_FREQUENCY_THRESHOLD || '3');
const LATTICE_DECAY_RATE = parseFloat(process.env.LATTICE_DECAY_RATE || '0.02');
const LATTICE_FLOOR = 0.05;
const LATTICE_DECAY_INTERVAL_MS = parseInt(process.env.LATTICE_DECAY_INTERVAL_MS || (6 * 60 * 60 * 1000));

let _jaa, _uid;
function _getJAA() {
  if (_jaa) return _jaa;
  try { ({ jaaDB: _jaa, uid: _uid } = require('../cortex/memory/jaa-db')); } catch (_) {}
  return _jaa;
}
function uid() { return _uid?.() ?? crypto.randomUUID(); }

// ── Pattern frequency tracking (in-memory, bounded) ───────────────────────────
const _patternCounts = new Map();
const _MAX_PATTERNS = 2000;
function _bumpPattern(key) {
  const count = (_patternCounts.get(key) || 0) + 1;
  _patternCounts.set(key, count);
  if (_patternCounts.size > _MAX_PATTERNS) {
    const oldest = _patternCounts.keys().next().value;
    _patternCounts.delete(oldest);
  }
  return count;
}

function _patternKey(compartment, outcomeKind) {
  const domain = compartment._declaredDomain || 'unknown';
  const verb   = compartment._declaredVerb   || 'unknown';
  return `${domain}:${verb}:${outcomeKind}`;
}

// ── Crystallization ────────────────────────────────────────────────────────────
// outcomeKind: 'PASS' | 'FAIL' | 'DELETE' (compartment.status post-resolution)
function _maybeCrystallize(compartment, outcomeKind) {
  const jaa = _getJAA();
  if (!jaa) return { crystallized: false, reason: 'jaa-unavailable' };

  const isPositive = outcomeKind === 'PASS';
  const key = _patternKey(compartment, outcomeKind);
  const frequency = _bumpPattern(key);

  if (frequency < PATTERN_FREQUENCY_THRESHOLD) {
    return { crystallized: false, frequency, threshold: PATTERN_FREQUENCY_THRESHOLD };
  }

  const crystal = {
    uuid: uid(),
    kind: isPositive ? 'CREATE_CRYSTAL' : 'CREATE_NEGATIVE_CRYSTAL',
    pattern_signature: key,
    entry_conditions: { domain: compartment._declaredDomain, verb: compartment._declaredVerb, risk_ceiling: compartment.constraint_frame?.risk_ceiling || null },
    exit_conditions: { outcome: outcomeKind },
    success_probability: isPositive ? 1.0 : 0.0,
    failure_boundaries: isPositive ? [] : [outcomeKind],
    support_paths: [compartment.id],
    usage_count: 1,
    pattern_frequency_at_creation: frequency,
    source: MODULE_ID,
    ts: Date.now(),
  };

  try { jaa.insert('crystals', crystal); } catch (_) {}
  try {
    jaa.insert('event_log', {
      uuid: uid(), type: isPositive ? 'crystal.created' : 'crystal.negative_created',
      payload: { pattern_signature: key, frequency, crystalUuid: crystal.uuid },
      source: MODULE_ID, ts: Date.now(),
    });
  } catch (_) {}

  // Once crystallized, reset the counter for this pattern — repeated
  // crystallization attempts on the exact same signature would otherwise
  // fire on every single subsequent match past the threshold.
  _patternCounts.delete(key);

  return { crystallized: true, crystal };
}

// ── Lattice — edge weights between nodes ────────────────────────────────────────
// Exported (Phase 46 — case-library.js) so the case library can read the
// exact same edge identity this module writes, rather than reconstructing
// the string format itself and silently drifting if it ever changes here.
function _edgeKey(from, to) {
  return `${from}->${to}`;
}

function _getOrCreateEdge(jaa, from, to) {
  const key = _edgeKey(from, to);
  const existing = jaa.query('lattice_edges', r => r.edgeKey === key, 1)[0];
  if (existing) return existing;

  const fresh = {
    uuid: uid(), edgeKey: key, from, to,
    weight: 0.5, success_rate: 0, failure_rate: 0,
    successCount: 0, failureCount: 0, totalCount: 0,
    decay_rate: LATTICE_DECAY_RATE,
    lastTransitionAt: null, lastTransitionOutcome: null,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  try { jaa.insert('lattice_edges', fresh); } catch (_) {}
  return fresh;
}

// Updates the edge representing this compartment-type's resolution history.
// from/to node identity is domain/verb only (Concept/CompartmentType-ish) —
// NOT outcome-specific. An earlier version of this function made `to`
// outcome-specific (State:PASS vs State:FAIL), which meant every edge's
// success_rate was trivially 1.0 or 0.0 by construction — meaningless.
// One edge per (domain,verb) pair, aggregating every resolution regardless
// of outcome, is what makes success_rate/failure_rate actually informative:
// "of all times this compartment-type resolved, what fraction passed."
function _updateLattice(compartment, outcomeKind) {
  const jaa = _getJAA();
  if (!jaa) return { updated: false, reason: 'jaa-unavailable' };

  const from = `CompartmentType:${compartment._declaredDomain || 'unknown'}.${compartment._declaredVerb || 'unknown'}`;
  const to   = 'State:Resolution';

  const edge = _getOrCreateEdge(jaa, from, to);
  const isSuccess = outcomeKind === 'PASS';
  const isRepeatedTransition = edge.lastTransitionOutcome === outcomeKind;

  let weightDelta = isSuccess ? 0.1 : -0.1;
  if (isRepeatedTransition) weightDelta *= 1.5; // "repeated transition → strengthen"

  const newWeight = Math.max(0, Math.min(1, edge.weight + weightDelta));
  const successCount = edge.successCount + (isSuccess ? 1 : 0);
  const failureCount = edge.failureCount + (isSuccess ? 0 : 1);
  const totalCount = edge.totalCount + 1;

  const patch = {
    weight: newWeight,
    successCount, failureCount, totalCount,
    success_rate: totalCount ? successCount / totalCount : 0,
    failure_rate: totalCount ? failureCount / totalCount : 0,
    lastTransitionAt: Date.now(),
    lastTransitionOutcome: outcomeKind,
    updatedAt: Date.now(),
  };

  try { jaa.update('lattice_edges', edge.uuid, patch); } catch (_) {}

  return { updated: true, edge: { ...edge, ...patch } };
}

// ── Decay — scheduled, not per-execution ────────────────────────────────────────
// Per spec: "lattice.edge.weight -= decay_rate * Δt; edges below floor
// pruned." Runs on its own interval (separate from per-execution updates
// above) since decay is a function of elapsed time, not of any single
// compartment's outcome.
let _decayInterval = null;
function _runDecayTick() {
  const jaa = _getJAA();
  if (!jaa) return { decayed: 0, pruned: 0 };

  const now = Date.now();
  let edges = [];
  try { edges = jaa.query('lattice_edges', () => true, 100000); } catch (_) { edges = []; }

  let decayed = 0, pruned = 0;
  for (const edge of edges) {
    const deltaHours = (now - (edge.updatedAt || now)) / (60 * 60 * 1000);
    if (deltaHours <= 0) continue;
    const decayedWeight = edge.weight - (edge.decay_rate || LATTICE_DECAY_RATE) * deltaHours;

    if (decayedWeight < LATTICE_FLOOR) {
      try { jaa.update('lattice_edges', edge.uuid, { weight: LATTICE_FLOOR, _pruned: true, prunedAt: now }); } catch (_) {}
      pruned++;
    } else {
      try { jaa.update('lattice_edges', edge.uuid, { weight: decayedWeight, updatedAt: now }); } catch (_) {}
      decayed++;
    }
  }

  if (decayed || pruned) {
    try { jaa.insert('event_log', { uuid: uid(), type: 'lattice.decay_tick', payload: { decayed, pruned }, source: MODULE_ID, ts: now }); } catch (_) {}
  }

  return { decayed, pruned };
}

function init(cfg = {}) {
  _decayInterval = setInterval(_runDecayTick, cfg.decayIntervalMs ?? LATTICE_DECAY_INTERVAL_MS);
  _decayInterval.unref?.();
  console.log(`[${MODULE_ID}] v${VERSION} — decay interval: ${cfg.decayIntervalMs ?? LATTICE_DECAY_INTERVAL_MS}ms, pattern threshold: ${PATTERN_FREQUENCY_THRESHOLD}`);
}
function stop() {
  if (_decayInterval) { clearInterval(_decayInterval); _decayInterval = null; }
}

// ── Entry point — registered into compartment-engine's extension point ─────────
// compartment-engine calls this as crystalLatticeUpdate(compartment, outcome)
// where outcome is 'PASS' | 'FAIL' | 'DELETE' (matches compartment.status
// after resolution in every call site within compartment-engine.js).
async function updateOnExecution(compartment, outcome) {
  const latticeResult = _updateLattice(compartment, outcome);
  const crystalResult = _maybeCrystallize(compartment, outcome);
  return { ran: true, lattice: latticeResult, crystal: crystalResult };
}

function validateWiring() {
  const checks = { jaa: !!_getJAA() };
  const online = Object.values(checks).filter(Boolean).length;
  console.log(`[${MODULE_ID}] wiring: ${online}/${Object.keys(checks).length} systems reachable`);
  return checks;
}

// Test-only: clears the in-memory pattern-frequency counter without
// restarting the process. Never called from production code paths — same
// rationale as reflection.js's _resetInMemoryState: pattern counts are
// process-lifetime state, and tests that reuse domain/verb/outcome
// combinations across cases need a real way to isolate them rather than
// manufacturing ever-more-unique fake keys to dodge the shared state.
function _resetInMemoryState() {
  _patternCounts.clear();
}

module.exports = {
  init, stop, updateOnExecution, validateWiring,
  _maybeCrystallize, _updateLattice, _runDecayTick, _patternKey, _edgeKey,
  _resetInMemoryState,
  PATTERN_FREQUENCY_THRESHOLD, LATTICE_DECAY_RATE, LATTICE_FLOOR,
  MODULE_ID, VERSION,
};
