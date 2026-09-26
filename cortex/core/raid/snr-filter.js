'use strict';
/**
 * cortex/core/raid/snr-filter.js — RAID SNR Pre-Gate
 * UUID: nexus-raid-snr-filter-v1-0000-2026-0706-jamesbrooks-001
 * spec: docs/raid-snr-filter.spec (v1.1.0)
 *
 * Built 2026-07-06. This file did not exist anywhere in the tree — only
 * the spec and tests/modules/test-snr-filter.js (10 pinned cases) did.
 * The spec's own footer claimed "10/10 PASSING" against a module that
 * could not have run. Built directly against the pinned test fixtures,
 * not guessed — every branch below is load-bearing for a specific T-00N.
 *
 * Resolution order (docs/raid-snr-filter.spec):
 *   1. Known invariant   — forge_patches, status:verified, successRate>0.7  → tokens:0
 *   2. Crystallised pattern — bep_patterns, crystallised, cluster match +
 *      genuine signature/intent overlap (cluster alone is NOT enough —
 *      see note below) → tokens:0
 *   3. Open loop — fault_taxonomy friction above threshold for this faultClass
 *      → dispatch, context injected
 *   4. Genuine unknown — dispatch, context injected (v1.1 fix: tier 4 used
 *      to dispatch blind; every tier now forwards causedBy/sessionId/jobId)
 *
 * §Note on tier 2 matching: an earlier reading of the spec would let ANY
 * crystallised pattern in the same cluster match ANY call in that cluster,
 * regardless of what the call is actually about. Checked against the pinned
 * fixtures: pat1 is cluster:'code', and T-004/T-005 pin cluster:'code' calls
 * to resolve as tier-3 open_loop, not tier-2 pattern — cluster-only matching
 * would silently misfire in exactly the case the tests are pinning against.
 * Tier 2 requires a real overlap between the pattern's signature and the
 * call's intent text, not just a shared cluster.
 */

const { jaaDB, uid } = require('../../memory/jaa-db');
const tunables = require('./tunables');

const MODULE_ID = 'cortex/core/raid/snr-filter';
const VERSION   = '1.1.0';

const SNR = { invariant: 1.0, open_loop: 0.5, unknown: 0.0 };

// In-memory counters — reset on process restart, same lifecycle as RAID's
// own _health/_weights (this module has no independent persistence beyond
// the per-call event_log write; stats() reflects this process's own view).
const _stats = { total: 0, byType: { invariant: 0, pattern: 0, open_loop: 0, unknown: 0 } };

// ── Tier 1 — known invariant ─────────────────────────────────────────────────
function checkInvariant(intent, cluster, faultClass) {
  if (!faultClass) return null;
  const hits = jaaDB.query(
    'forge_patches',
    row => row.faultClass === faultClass && row.status === 'verified' && row.successRate > tunables.get('invariantThreshold'),
    1
  );
  if (!hits.length) return null;
  const patch = hits[0];
  return {
    type:   'invariant',
    dispatch: false,
    tokens: 0,
    snr:    SNR.invariant,
    reason: `known invariant for faultClass '${faultClass}' (patch ${patch.uuid}, successRate ${patch.successRate})`,
    patch,
  };
}

// ── Tier 2 — crystallised pattern, real signature overlap required ──────────
function _checkPattern(intent, cluster) {
  const candidates = jaaDB.query(
    'bep_patterns',
    row => row.crystallised === true && row.cluster === cluster,
    10
  );
  const text = String(intent || '').toLowerCase();
  for (const pat of candidates) {
    const sigParts = String(pat.signature || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const overlap = sigParts.some(part => part.length > 2 && text.includes(part));
    if (overlap) {
      return {
        type:   'pattern',
        dispatch: false,
        tokens: 0,
        snr:    typeof pat.confidence === 'number' ? pat.confidence : SNR.invariant,
        reason: `crystallised pattern '${pat.signature}' matched (pattern ${pat.uuid}, confidence ${pat.confidence})`,
        pattern: pat,
      };
    }
  }
  return null;
}

// ── Tier 3 — open loop (elevated friction) ───────────────────────────────────
function _checkOpenLoop(faultClass) {
  if (!faultClass) return null;
  const hits = jaaDB.query(
    'fault_taxonomy',
    row => row.faultClass === faultClass && row.friction > tunables.get('frictionThreshold'),
    1
  );
  if (!hits.length) return null;
  const rec = hits[0];
  return {
    type:   'open_loop',
    dispatch: true,
    tokens: null, // real dispatch — token count is the caller's to report, not this gate's
    snr:    SNR.open_loop,
    reason: `elevated friction (${rec.friction}) for faultClass '${faultClass}' (${rec.uuid})`,
    friction: rec,
  };
}

// ── filter — the pre-gate, runs before every RAID dispatch ─────────────────
function filter(call = {}) {
  const { intent, cluster, faultClass, causedBy, sessionId, jobId } = call;
  const ctx = { causedBy, sessionId, jobId };

  let result =
    checkInvariant(intent, cluster, faultClass) ||
    _checkPattern(intent, cluster) ||
    _checkOpenLoop(faultClass);

  if (!result) {
    result = {
      type:   'unknown',
      dispatch: true,
      tokens: null,
      snr:    SNR.unknown,
      reason: 'no known invariant, pattern, or open loop — genuine unknown',
    };
  }

  // v1.1 fix — every tier forwards context now, not just open_loop/unknown
  // (the bug the spec names: tier 4 used to dispatch blind). Tier 1/2
  // resolve locally (dispatch:false) so this doesn't change their behavior,
  // it just means the causal chain is attached honestly on every result
  // instead of only the tiers that happen to dispatch.
  result.injectContext = true;
  result.context = ctx;

  _stats.total += 1;
  _stats.byType[result.type] = (_stats.byType[result.type] || 0) + 1;

  jaaDB.insert('event_log', {
    uuid: uid(),
    type: 'raid.snr.filter',
    payload: { intent, cluster, faultClass, resultType: result.type, snr: result.snr, dispatch: result.dispatch },
    causedBy,
    ts: Date.now(),
  });

  return result;
}

// ── stats — total calls, breakdown by tier, resolved-without-dispatch rate ──
function stats() {
  const resolvedLocally = (_stats.byType.invariant || 0) + (_stats.byType.pattern || 0);
  const pct = _stats.total > 0 ? ((resolvedLocally / _stats.total) * 100).toFixed(1) : '0.0';
  return {
    total: _stats.total,
    byType: { ..._stats.byType },
    efficiency: `${pct}% resolved without dispatch`,
  };
}

module.exports = {
  MODULE_ID, VERSION,
  filter, checkInvariant, stats,
};
