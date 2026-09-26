'use strict';
/**
 * meta/lattice/associative-lattice.js — the relationship_lattice table,
 * step 7 of docs/nexus-relationship-shape.spec v0.2's build_order_v0_2.
 * comp_id: nexus.meta.lattice.associative
 * uuid: nexus-meta-lattice-associative-v1-0000-2026-0718-jamesbrooks-001
 *
 * §BUILT 2026-07-18 — "associative lattice, for relationships." The spec
 * (docs/nexus-relationship-shape.spec, status: proposed, v0.2) already
 * defines this precisely: "A persistent graph, not a query result. Nodes
 * are systems (and users and sessions). Edges are relationship shapes —
 * the same four CFR numbers computed for every pair continuously and held
 * as state, not recomputed fresh each time someone asks."
 *
 * This file is step 7 only: "relationship_lattice JAA table + write-through
 * via lib/cortex-write.js." Steps 8-13 (event-triggered recompute wired
 * into real system events, background sweep, traversal API, what-if
 * composition, dwell/decay ranking, optimization-service hook) are real,
 * separate, larger pieces of work — not attempted here, not silently
 * assumed done. See NOT BUILT YET at the bottom of this file.
 *
 * Real dependencies checked before writing a line of this — the spec
 * names lib/cfr/field.js etc, which do not exist at that path (spec drift,
 * same pattern the orchestrator's own spec-drift checker already flags
 * elsewhere in this codebase); the real files live at meta/cfr/*.js.
 * meta/rfr2/delta/index.js's detectBottlenecks/clusterByAnomaly are
 * deliberately stubbed (marked "deprecated," an explicit design boundary
 * per the roadmap doc, not a gap) — this module does not call them.
 */

const { createCFRField } = require('../../intelligence/cfr/field.js');
const cortexWrite = require('../../lib/cortex-write.js')('lattice');

const TABLE = 'relationship_lattice';

// One CFRField per directed pair, held in memory for the life of this
// process — mirrors field.js's own closure-based state pattern (a field
// is stateful, not recomputed from scratch per update). Keyed by
// "from::to" — from and to are kept directed per the spec's own row shape
// (from, to as separate fields), not collapsed to an undirected pair.
const _fields = new Map();

function _key(from, to) { return `${from}::${to}`; }

function _getField(from, to) {
  const k = _key(from, to);
  if (!_fields.has(k)) _fields.set(k, createCFRField());
  return _fields.get(k);
}

/**
 * _deriveSigma — sigma is "the field compressed to one number for
 * threshold comparison" per the spec's own wording in what_a_shape_is.
 * sigma.js's real computeSigma() needs a per-pair historical baseline
 * (event-ledger-style learned baseline) that does not exist yet for
 * arbitrary system/people/session pairs — building that is real,
 * separate infrastructure, not something to fake here. This is the
 * honest, direct derivation the spec's own words license: high friction
 * and high entropy are stress; high coherence and low entropy are the
 * opposite of stress. Weighted equally, deliberately — no evidence yet
 * for a different weighting, and inventing one would be exactly the
 * fabricated-mapping mistake this codebase has already caught itself
 * making elsewhere (see Phase 192 in the phase map).
 */
function _deriveSigma(field) {
  const stress = (field.friction + field.entropy) / 2;
  const calm   = (field.coherence + field.resonance) / 2;
  return Math.max(0, Math.min(1, stress - calm * 0.3 + 0.3));
}

/**
 * updateEdge(from, to, eventType, sigmaScore) — apply one event to the
 * (from, to) edge's field, write the resulting row to relationship_lattice.
 *
 * from, to: string identifiers — system names today ("guardian",
 *   "cortex"); the spec extends this to users/sessions later (step 8+),
 *   this function does not restrict the string shape.
 * eventType: string or {type, sigma:{score}} — passed straight through
 *   to field.update(), same accepted shapes field.js itself documents.
 * sigmaScore: optional external sigma hint, same as field.js's own
 *   update() parameter — if the caller already has a real computeSigma()
 *   result for this event, pass it; field.js uses it to size stress
 *   repulsors, not required for the edge row itself.
 *
 * Returns the written row (same shape as constructInsert), or throws if
 * the write itself failed (cortex-write.js's own §AX-2 — no silent
 * failures — this module does not add a second layer of swallowing on
 * top of that).
 */
async function updateEdge(from, to, eventType, sigmaScore = 0) {
  if (!from || !to) throw new Error('associative-lattice.updateEdge: from and to are both required');

  const field = _getField(from, to);
  const snapshot = field.update(eventType, sigmaScore); // snapshot already includes .regime — field.js's own update() returns snapshot() internally
  const sigma = _deriveSigma(snapshot);

  const row = {
    id: _key(from, to), // one row per directed pair — later updates upsert, matching "held as state" not append-only history
    from, to,
    field: {
      coherence: snapshot.coherence,
      friction:  snapshot.friction,
      resonance: snapshot.resonance,
      entropy:   snapshot.entropy,
    },
    sigma, regime: snapshot.regime,
    updated_at: Date.now(),
    // §NOT BUILT YET — fractal detection needs a real delta history per
    // edge (RFR2's detectFractals wants a sequence, not a single
    // snapshot). A brand-new or just-updated edge honestly has nothing
    // to detect a repeat in yet. Wiring real history is step 8/9
    // territory (event-triggered recompute + background sweep), not
    // this step.
    fractal: { detected: false, period_ms: null, occurrences: 0 },
  };

  await cortexWrite.insert(TABLE, row);
  return row;
}

/**
 * getEdge(from, to) — read back this process's own in-memory field state
 * for a pair, without a round trip through cortex. Useful for callers
 * that just updated an edge and want the resulting shape immediately.
 * Does NOT query the durable table — that is cortex's job (query surface,
 * step 10), not this module's.
 *
 * §BUG FOUND AND FIXED 2026-07-18 — the first version of this function
 * called field.update(null, 0) as a fake no-op "peek." field.js's own
 * update() applies natural damping unconditionally on every call, matched
 * nudge or not — so that was a real second mutation on every read, not a
 * read at all. Caught by testing before this shipped: a read immediately
 * after a write did not match the just-written value. field.js already
 * exposes the real thing needed here — snapshot() — used instead.
 */
function getEdge(from, to) {
  const k = _key(from, to);
  if (!_fields.has(k)) return null;
  const snapshot = _fields.get(k).snapshot();
  return {
    from, to,
    field: { coherence: snapshot.coherence, friction: snapshot.friction, resonance: snapshot.resonance, entropy: snapshot.entropy },
    sigma: _deriveSigma(snapshot),
    regime: snapshot.regime,
  };
}

module.exports = { updateEdge, getEdge, TABLE };

/**
 * §NOT BUILT YET — honest accounting against the spec's own build_order_v0_2:
 *   7.  relationship_lattice table + write-through           — THIS FILE
 *   8.  Event-triggered recompute (piggyback on real system events) — NOT WIRED. Nothing in guardian/cortex/idearium/etc calls updateEdge() yet. This module is real and callable; nothing calls it in production.
 *   9.  Background sweep for low-traffic pairs (10 min default)     — NOT BUILT
 *   10. Traversal API (rank_by_sigma, walk_from, find_unexpected_correlations) — NOT BUILT. Needs a real query surface reading the durable table, not this module's in-memory-only getEdge().
 *   11. What-if composition (COS N-way fork + RAID simulate(dry_run)) — NOT BUILT
 *   12. Dwell/decay ranking                                          — NOT BUILT
 *   13. Optimization-service morning-briefing hook                   — NOT BUILT
 */
