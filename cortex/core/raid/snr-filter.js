'use strict';
/**
 * cortex/core/raid/snr-filter.js — RAID SNR Filter
 * UUID: nexus-raid-snr-filter-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * Runs before every RAID dispatch.
 * Invariants first. Crystallised patterns second. AI last.
 *
 * Resolution order:
 *   1. Known invariant covers this fault class → deterministic fix, zero tokens
 *   2. Crystallised pattern predicts this → pre-staged fix available
 *   3. Open loop in lattice → route through intelligence layer first
 *   4. Genuine unknown → dispatch to AI provider
 *
 * Tokens ∝ unresolved meaning.
 * Only what cannot be resolved locally reaches AI.
 *
 * §1.1  Every decision is logged — nothing silent
 * §2.1  Decision written to JAA before dispatch
 */

const { jaaDB, uid } = require('../../memory/jaa-db');

const MODULE_ID = 'raid-snr-filter';
const VERSION   = '1.0.0';

// ── Check invariants ──────────────────────────────────────────────────────────
// Returns a known fix if the fault class is covered by a verified patch
function checkInvariant(intent, cluster, faultClass) {
  if (!faultClass) return null;

  // Check forge_patches for verified fixes with high success rate
  try {
    const patches = jaaDB.query('forge_patches',
      r => r.faultClass === faultClass &&
           r.status === 'verified' &&
           (r.successRate || 0) > 0.7,
      1
    );
    if (patches.length) {
      return {
        type:       'invariant',
        source:     'forge_patches',
        fix:        patches[0],
        confidence: patches[0].successRate,
        tokens:     0,
        reason:     `known fix for ${faultClass} (success rate: ${(patches[0].successRate*100).toFixed(0)}%)`,
      };
    }
  } catch(e) {
    console.warn(`[${MODULE_ID}] invariant check failed: ${e.message}`);
  }

  return null;
}

// ── Check crystallised patterns ───────────────────────────────────────────────
// Returns pre-staged fix if a crystallised pattern predicts this situation
function checkPatterns(intent, cluster) {
  try {
    const patterns = jaaDB.query('bep_patterns',
      r => r.crystallised &&
           (r.cluster === cluster || !r.cluster) &&
           r.confidence > 0.7,
      5
    );

    for (const pattern of patterns) {
      // Check if a known fix is pre-staged from forward inference
      const preStaged = jaaDB.query('event_log',
        r => r.type === 'liminal.forward_inference' &&
             r.payload?.knownFix &&
             r.payload?.type === pattern.patternType,
        1
      )[0];

      if (preStaged?.payload?.knownFix) {
        return {
          type:       'pattern',
          source:     'crystallised_pattern',
          pattern,
          fix:        preStaged.payload.knownFix,
          confidence: pattern.confidence,
          tokens:     0,
          reason:     `crystallised pattern match: ${pattern.signature}`,
        };
      }
    }
  } catch(e) {
    console.warn(`[${MODULE_ID}] pattern check failed: ${e.message}`);
  }

  return null;
}

// ── Check open loops ──────────────────────────────────────────────────────────
// If this cluster has high friction or open loops, flag for intelligence first
function checkOpenLoops(cluster, faultClass) {
  try {
    // Check friction for this cluster
    const friction = jaaDB.query('fault_taxonomy',
      r => r.faultClass === (faultClass || cluster),
      1
    )[0];

    if (friction && friction.friction >= 0.4) {
      return {
        type:       'open_loop',
        source:     'fault_taxonomy',
        friction:   friction.friction,
        faultClass: friction.faultClass,
        confidence: friction.friction,
        tokens:     0,
        reason:     `elevated friction (${(friction.friction*100).toFixed(0)}%) — route through intelligence first`,
      };
    }

    // Check liminal spaces for unresolved items in this cluster
    const liminalItems = jaaDB.query('interstitial_spaces',
      r => !r.resolved && !r.dissolved && !r.crystallised &&
           (r.type?.includes(cluster) || r.meta?.cluster === cluster),
      3
    );

    if (liminalItems.length >= 2) {
      return {
        type:       'open_loop',
        source:     'liminal_spaces',
        itemCount:  liminalItems.length,
        confidence: 0.6,
        tokens:     0,
        reason:     `${liminalItems.length} unresolved items in liminal space for cluster: ${cluster}`,
      };
    }
  } catch(e) {
    console.warn(`[${MODULE_ID}] open loop check failed: ${e.message}`);
  }

  return null;
}

// ── Main filter ───────────────────────────────────────────────────────────────
// Returns: { dispatch: true|false, result?, reason, tokens, snr }
function filter(call) {
  const { intent, cluster, faultClass, jobId } = call;
  const now = Date.now();
  const checkId = uid();

  // 1. Known invariant
  const invariant = checkInvariant(intent, cluster, faultClass);
  if (invariant) {
    _log(checkId, call, invariant, now);
    return {
      dispatch:   false,
      type:       'invariant',
      result:     invariant,
      tokens:     0,
      snr:        1.0,
      reason:     invariant.reason,
    };
  }

  // 2. Crystallised pattern with pre-staged fix
  const pattern = checkPatterns(intent, cluster);
  if (pattern) {
    _log(checkId, call, pattern, now);
    return {
      dispatch:   false,
      type:       'pattern',
      result:     pattern,
      tokens:     0,
      snr:        pattern.confidence,
      reason:     pattern.reason,
    };
  }

  // 3. Open loop — flag but still dispatch (with context)
  const openLoop = checkOpenLoops(cluster, faultClass);
  if (openLoop) {
    _log(checkId, call, { ...openLoop, dispatch: true }, now);
    return {
      dispatch:   true,
      type:       'open_loop',
      flag:       openLoop,
      tokens:     null,   // will be counted on dispatch
      snr:        0.5,
      reason:     openLoop.reason,
      injectContext: true, // inject open loop context into prompt
    };
  }

  // 4. Genuine unknown — dispatch to AI
  _log(checkId, call, { type: 'unknown', tokens: null }, now);
  return {
    dispatch: true,
    type:     'unknown',
    tokens:   null,
    snr:      0.0,
    reason:   'no invariant, pattern, or loop match — dispatching to AI',
  };
}

function _log(checkId, call, result, ts) {
  try {
    jaaDB.insert('event_log', {
      uuid:    checkId,
      type:    'raid.snr.filter',
      payload: {
        cluster:   call.cluster,
        intent:    (call.intent || '').slice(0, 80),
        filterType: result.type,
        dispatch:  result.dispatch !== false,
        tokens:    result.tokens,
        reason:    result.reason,
      },
      source:  MODULE_ID,
      causedBy: call.jobId || null,
      ts,
    });
  } catch(e) {
    console.warn(`[${MODULE_ID}] log failed: ${e.message}`);
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function stats() {
  try {
    const logs = jaaDB.tail('event_log', 100)
      .filter(r => r.type === 'raid.snr.filter');

    const byType = {};
    let tokensSaved = 0;

    for (const log of logs) {
      const t = log.payload?.filterType || 'unknown';
      byType[t] = (byType[t] || 0) + 1;
      if (log.payload?.tokens === 0) tokensSaved++;
    }

    return {
      total:       logs.length,
      byType,
      tokensSaved, // calls that never reached AI
      aiReach:     byType.unknown || 0,
      efficiency:  logs.length ? ((tokensSaved / logs.length) * 100).toFixed(1) + '%' : '0%',
    };
  } catch(e) {
    return { error: e.message };
  }
}

module.exports = { filter, checkInvariant, checkPatterns, checkOpenLoops, stats, MODULE_ID, VERSION };
