'use strict';
// ── lib/case-library.js ───────────────────────────────────────────────────────
// UUID: nexus-case-library-v1-0000-4600-0000-000000000001
// Version: 1.0.0
// Phase: 46 — Queryable Case Library
// Deps:  Phase 25 (compartment-engine) ✓ · crystal-lattice ✓ (lattice_edges
//        success_rate, crystals negative-match) · jaa ✓
// Unlocks: Phase 13 (Autonomous Loop) — last remaining hard dependency.
//          Phase 10/11/12/25/gap-loop/ollama/snapshot were already satisfied;
//          this was the only real gap (see lib/version.js Phase 13 entry).
//
// NOTE: nexus-phase-map.md marks this phase `complete`. It was not — the
// same false-complete state Phase 25/26 were caught in before this build
// (confirmed: no case_index table, no query surface, nothing reachable
// from compartment-engine.js's workingMemorySeed hook or
// intent-classifier.js's queryBySignature() comment, both of which were
// written anticipating this file and finding nothing here). This is the
// first real implementation. The phase-map markdown has not been
// corrected — out of scope to silently rewrite someone else's spec doc.
//
// ── WHAT IT DOES (phase-map.md, Phase 46, verbatim) ───────────────────────────
// "Every PASS compartment trace indexed by intent signature. Before
// spawning a compartment, RAID queries the case library — matching past
// execution seeds new compartment's working memory. High match (≥0.85) →
// full trace seed · Medium (≥0.60) → skeleton seed · Low (<0.60) → cold
// spawn · Negative crystal hit → path blocked."
//
// ── INDEXING ──────────────────────────────────────────────────────────────────
// indexCompartment(compartment, outcome) is registered into
// compartment-engine.js's extension point (the same named-slot pattern
// adversary-suite and crystal-lattice already use — see
// _registerExtensions there) and fires from _pass() only. Only PASS is
// indexed: a FAIL/DELETE trace is not a case worth reusing as a seed, and
// is already covered on the "don't repeat this" side by crystal-lattice's
// negative crystals, checked first in query() below.
//
// Receives the full in-memory `compartment` object, not the JAA row — the
// persisted compartments row does not carry domain/verb (only intent_uuid),
// so this reads compartment._declaredDomain/_declaredVerb, the same
// denormalized fields compartment-engine.js added specifically so
// crystal-lattice would have something real to key on. Same precedent,
// same fields, no new wiring needed there.
//
// Bounded per signature (default 20 traces, oldest evicted first) — same
// rationale as crystal-lattice's _patternCounts cap and reflection's streak
// tracker: an unbounded index is a worse failure than a capped
// recent-history window. Eviction is soft (_evicted: true, evictedAt) via
// jaa.update(), not a hard delete — JaaDB exposes no delete() method, and
// this matches the exact pattern crystal-lattice's _runDecayTick already
// uses for lattice_edges pruning. Evicted rows are filtered out of every
// read in this file.
//
// ── QUERYING ──────────────────────────────────────────────────────────────────
// query(intent) is deterministic and zero-LLM — Resolution Spectrum L1
// (alias/exact match on domain+verb), no embedding, no LLM call. Confidence
// is read directly from crystal-lattice's lattice_edges.success_rate for
// the matching CompartmentType:domain.verb -> State:Resolution edge — not
// recomputed here, so case-library confidence and lattice confidence can
// never silently diverge into two competing numbers for the same fact.
// _edgeKey() is imported from crystal-lattice.js (exported there
// specifically for this) rather than reconstructed as a duplicate string
// template, for the same reason.
//
// Negative crystal hit is checked FIRST, before confidence tiering — a
// blocked path stays blocked regardless of how high an unrelated success
// rate looks for the same signature.
//
// No lattice edge yet for this signature → 'cold', confidence: null. Honest
// absence, not a fabricated 0 — "never seen this before" and "always
// fails" are different facts and must not collapse into the same number.
//
// §1.1 every index write keyed by a real signature; every query result
//      carries the signature it matched against — nothing silent
// §1.2 every index + query logged to event_log
// §2.1 index entries persisted to JAA before any query can see them
// §5.3 read-only with respect to crystals/lattice_edges/compartments — this
//      module never writes to any table it doesn't own (case_index only)

const crypto = require('crypto');

const MODULE_ID = 'case-library';
const VERSION   = '1.0.0';

const MAX_TRACES_PER_SIGNATURE = parseInt(process.env.CASE_LIBRARY_MAX_PER_SIGNATURE || '20');
const TIER_FULL_THRESHOLD     = 0.85;
const TIER_SKELETON_THRESHOLD = 0.60;

let _jaa, _uid;
function _getJAA() {
  if (_jaa) return _jaa;
  try { ({ jaaDB: _jaa, uid: _uid } = require('../cortex/memory/jaa-db')); } catch (_) {}
  return _jaa;
}
function uid() { return _uid?.() ?? crypto.randomUUID(); }

let _crystalLattice;
function _getCrystalLattice() {
  if (_crystalLattice) return _crystalLattice;
  try { _crystalLattice = require('../meta/crystal-lattice'); } catch (_) {}
  return _crystalLattice;
}

function _signature(domain, verb) {
  return `${domain || 'unknown'}:${verb || 'unknown'}`;
}

function _logEvent(type, payload) {
  const jaa = _getJAA();
  if (jaa) { try { jaa.insert('event_log', { uuid: uid(), type, payload, source: MODULE_ID, ts: Date.now() }); } catch (_) {} }
}

// ── Index — called on every compartment PASS (compartment-engine.js _pass()) ──
async function indexCompartment(compartment, outcome) {
  if (outcome !== 'PASS') return { indexed: false, reason: 'only PASS traces are indexed' };

  const jaa = _getJAA();
  if (!jaa) return { indexed: false, reason: 'jaa-unavailable' };
  if (!compartment?.id) return { indexed: false, reason: 'compartment missing id' };

  const domain = compartment._declaredDomain || 'unknown';
  const verb   = compartment._declaredVerb   || 'unknown';
  const signature = _signature(domain, verb);

  const entry = {
    uuid: uid(),
    signature,
    domain, verb,
    compartment_uuid: compartment.id,
    intent_uuid: compartment.intent_uuid ?? null,
    working_memory: compartment.working_memory ?? null,
    result: compartment.result ?? null,
    // §BUGFIX 2026-08-28 — found while verifying cortex/core/raid/
    // contract-intake.js's first real end-to-end run through this exact
    // path (qaqcLayer + case-library both real, not honest no-ops,
    // apparently for the first time together). This used to store the
    // LIVE compartment.trace_log array by reference. compartment-engine.js's
    // _pass() then traces THIS entry (containing that same live array,
    // right here) back into compartment.trace_log itself via its own
    // _trace() call — a guaranteed self-reference the moment that
    // happens: trace_log[last].data.entry.trace_log === trace_log.
    // Confirmed directly (JAA's own flush threw "Converting circular
    // structure to JSON... property 'trace_log' closes the circle"),
    // not assumed. A real snapshot, taken now while trace_log is still
    // genuinely acyclic, breaks the reference permanently — later
    // mutations to the live array (including the very trace event this
    // call produces) never retroactively appear inside an already-
    // persisted entry, which is the more correct semantics anyway for a
    // case-library record meant to represent a point-in-time outcome.
    trace_log: JSON.parse(JSON.stringify(compartment.trace_log ?? [])),
    constraint_frame_uuid: compartment.constraint_frame?.uuid ?? null,
    _evicted: false,
    indexedAt: Date.now(),
  };

  try { jaa.insert('case_index', entry); } catch (e) {
    return { indexed: false, reason: `jaa insert failed: ${e.message}` };
  }

  const evictResult = _evictOverflow(jaa, signature);

  _logEvent('case_library.indexed', { signature, compartment_uuid: compartment.id, evicted: evictResult.evicted });

  return { indexed: true, signature, entry, evicted: evictResult.evicted };
}

// Soft-eviction: oldest non-evicted rows for this signature beyond
// MAX_TRACES_PER_SIGNATURE are flagged _evicted (JaaDB has no delete()).
function _evictOverflow(jaa, signature) {
  try {
    const live = jaa.query('case_index', r => r.signature === signature && !r._evicted, 100000)
      .sort((a, b) => a.indexedAt - b.indexedAt);
    if (live.length <= MAX_TRACES_PER_SIGNATURE) return { evicted: 0 };

    const overflow = live.slice(0, live.length - MAX_TRACES_PER_SIGNATURE);
    for (const row of overflow) {
      try { jaa.update('case_index', row.uuid, { _evicted: true, evictedAt: Date.now() }); } catch (_) {}
    }
    return { evicted: overflow.length };
  } catch (_) {
    return { evicted: 0 };
  }
}

// ── Query — called before compartment-engine.spawn() ──────────────────────────
// intent: { domain, verb, ... } — Phase 45 INTENT object, or any object
// carrying domain+verb; the full frozen intent is not required at this tier.
function query(intent) {
  const jaa = _getJAA();
  const domain = intent?.domain || 'unknown';
  const verb   = intent?.verb   || 'unknown';
  const signature = _signature(domain, verb);

  const result = {
    signature, domain, verb,
    tier: 'cold',
    confidence: null,
    workingMemorySeed: null,
    blocked: false,
    reason: null,
  };

  if (!jaa) {
    result.reason = 'jaa-unavailable';
    _logEvent('case_library.queried', result);
    return result;
  }

  // Negative crystal check first — see file header.
  try {
    const negativeHit = jaa.query(
      'crystals',
      r => r.kind === 'CREATE_NEGATIVE_CRYSTAL' && r.pattern_signature?.startsWith(`${signature}:`),
      1
    )[0];
    if (negativeHit) {
      result.tier = 'blocked';
      result.blocked = true;
      result.reason = `negative crystal ${negativeHit.uuid} — pattern ${negativeHit.pattern_signature}`;
      _logEvent('case_library.queried', result);
      return result;
    }
  } catch (e) {
    result.reason = `negative-crystal check failed: ${e.message}`;
  }

  // Confidence — read from crystal-lattice's lattice_edges, never
  // recomputed here. _edgeKey imported, not duplicated — see file header.
  let confidence = null;
  const crystalLattice = _getCrystalLattice();
  try {
    if (crystalLattice?._edgeKey) {
      const edgeKey = crystalLattice._edgeKey(`CompartmentType:${domain}.${verb}`, 'State:Resolution');
      const edge = jaa.query('lattice_edges', r => r.edgeKey === edgeKey, 1)[0];
      if (edge) confidence = edge.success_rate;
    } else {
      result.reason = 'crystal-lattice unavailable — cannot read confidence';
    }
  } catch (e) {
    result.reason = `lattice lookup failed: ${e.message}`;
  }

  result.confidence = confidence;

  if (confidence === null) {
    result.tier = 'cold';
    result.reason = result.reason || 'no lattice edge for this signature yet — never seen, not "always fails"';
    _logEvent('case_library.queried', result);
    return result;
  }

  if (confidence >= TIER_FULL_THRESHOLD) {
    const mostRecent = _mostRecentTrace(jaa, signature);
    if (mostRecent) {
      result.tier = 'full';
      result.workingMemorySeed = {
        tier: 'full',
        source_compartment_uuid: mostRecent.compartment_uuid,
        trace_log: mostRecent.trace_log,
        result: mostRecent.result,
        working_memory: mostRecent.working_memory,
      };
    } else {
      // High lattice confidence but no surviving indexed trace (evicted, or
      // crystallized before this module existed) — honest downgrade, never
      // fabricate a trace that isn't there.
      result.tier = 'skeleton';
      result.reason = 'high confidence but no surviving indexed trace — downgraded to skeleton';
      result.workingMemorySeed = { tier: 'skeleton', signature, confidence };
    }
  } else if (confidence >= TIER_SKELETON_THRESHOLD) {
    result.tier = 'skeleton';
    result.workingMemorySeed = { tier: 'skeleton', signature, confidence };
  } else {
    result.tier = 'cold';
    result.workingMemorySeed = null;
  }

  _logEvent('case_library.queried', result);
  return result;
}

function _mostRecentTrace(jaa, signature) {
  try {
    const traces = jaa.query('case_index', r => r.signature === signature && !r._evicted, 100000)
      .sort((a, b) => b.indexedAt - a.indexedAt);
    return traces[0] || null;
  } catch (_) {
    return null;
  }
}

function validateWiring() {
  const checks = { jaa: !!_getJAA(), crystalLattice: !!_getCrystalLattice() };
  const online = Object.values(checks).filter(Boolean).length;
  console.log(`[${MODULE_ID}] wiring: ${online}/${Object.keys(checks).length} systems reachable`);
  return checks;
}

// Test-only. No in-memory state to reset (JAA-backed only, unlike
// crystal-lattice's pattern counter) — kept for test-harness symmetry.
function _resetInMemoryState() {}

module.exports = {
  indexCompartment, query, validateWiring, _resetInMemoryState,
  _evictOverflow, _mostRecentTrace, _signature,
  MAX_TRACES_PER_SIGNATURE, TIER_FULL_THRESHOLD, TIER_SKELETON_THRESHOLD,
  MODULE_ID, VERSION,
};
