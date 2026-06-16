'use strict';
/**
 * cortex/core/raid/intelligence-bridge.js
 * UUID: nexus-intelligence-bridge-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * Connects the intelligence layer to RAID routing decisions.
 * Called before every RAID decision to enrich the routing context.
 * Called after every outcome to feed the pattern engine.
 *
 * BEFORE routing:
 *   query crystallised patterns for this cluster
 *   check failure precursors active for this fault class
 *   read user model hypotheses for this intent type
 *   check liminal items relevant to this request
 *   return weighted evidence to RAID
 *
 * AFTER routing:
 *   log outcome to pattern engine
 *   update user satisfaction signal
 *   if unsatisfied: increase friction, log reason, keep gap open
 *   if satisfied: reduce friction, reinforce pattern
 *
 * Gaps are open loops.
 * Tension accumulates while open.
 * Every output is a training signal.
 *
 * §1.2  Every decision logged — nothing silent
 * §2.1  JAA write before index update
 */

const { jaaDB, uid } = require('../../memory/jaa-db');

const MODULE_ID = 'intelligence-bridge';
const VERSION   = '1.0.0';

// ── Query intelligence before routing ─────────────────────────────────────────
function queryBefore(call) {
  const { cluster, faultClass, intent } = call;
  const evidence = {
    patterns:         [],
    precursors:       [],
    userHypotheses:   [],
    liminalItems:     [],
    weight:           0,    // 0-1, how much intelligence has to say
    recommendation:   null, // provider recommendation from patterns
  };

  try {
    // Crystallised patterns for this cluster
    const patterns = jaaDB.query('bep_patterns',
      r => r.crystallised &&
           (r.cluster === cluster || !r.cluster) &&
           r.confidence > 0.65,
      10
    );
    evidence.patterns = patterns;

    // Failure precursors active
    if (faultClass) {
      const precursors = jaaDB.query('bep_patterns',
        r => r.crystallised &&
             r.patternType === 'failure_precursor' &&
             (r.failureTypes||[]).includes(faultClass),
        5
      );
      evidence.precursors = precursors;
      if (precursors.length) {
        evidence.weight += 0.3;
      }
    }

    // User model hypotheses for this cluster
    const userModel = jaaDB.query('user_model',
      r => r.preferredClusters?.[cluster],
      1
    )[0];

    if (userModel?.preferredClusters?.[cluster]) {
      const clusterPrefs = userModel.preferredClusters[cluster];
      // Find provider with highest confidence for this user + cluster
      let bestProvider = null;
      let bestScore = 0;
      for (const [provider, data] of Object.entries(clusterPrefs)) {
        const score = (data.successRate || 0) * (data.confidence || 0.5);
        if (score > bestScore && (data.evidence || 0) >= 3) {
          bestScore = score;
          bestProvider = provider;
        }
      }
      if (bestProvider) {
        evidence.userHypotheses.push({
          provider: bestProvider,
          score:    bestScore,
          evidence: clusterPrefs[bestProvider]?.evidence || 0,
        });
        evidence.recommendation = bestProvider;
        evidence.weight += 0.4;
      }
    }

    // Liminal items relevant to this intent
    const liminal = jaaDB.query('interstitial_spaces',
      r => !r.resolved && !r.dissolved && !r.crystallised &&
           (r.type?.includes(cluster) || (intent && r.text?.toLowerCase().includes(intent.slice(0,20).toLowerCase()))),
      5
    );
    evidence.liminalItems = liminal;
    if (liminal.length) {
      evidence.weight += 0.2 * Math.min(liminal.length, 3) / 3;
    }

    // Pattern-based provider recommendation
    if (!evidence.recommendation && patterns.length) {
      const providerPattern = patterns.find(p =>
        p.typeA?.startsWith('provider.') || p.typeB?.startsWith('provider.')
      );
      if (providerPattern) {
        const provider = (providerPattern.typeA?.startsWith('provider.')
          ? providerPattern.typeA : providerPattern.typeB)?.replace('provider.', '');
        if (provider) {
          evidence.recommendation = provider;
          evidence.weight += 0.1;
        }
      }
    }

    evidence.weight = Math.min(1, evidence.weight);

  } catch(e) {
    console.warn(`[${MODULE_ID}] query failed: ${e.message}`);
  }

  return evidence;
}

// ── Feed outcome back after routing ───────────────────────────────────────────
function feedOutcome(call, decision, outcome) {
  const { cluster, faultClass, intent, jobId } = call;
  const { ok, provider, durationMs, gapScore } = outcome;
  const now = Date.now();

  try {
    // Log to event_log for pattern engine
    jaaDB.insert('event_log', {
      uuid:    uid(),
      type:    ok ? 'raid.outcome.success' : 'raid.outcome.failure',
      payload: {
        cluster,
        faultClass,
        provider:   decision.agent,
        durationMs,
        gapScore,
        reason:     decision.reason,
        ok,
      },
      source:   MODULE_ID,
      causedBy: jobId || null,
      ts:       now,
    });

    // Update user model hypothesis for this cluster + provider
    _updateUserModel(cluster, decision.agent, ok, durationMs);

    // If failure: increase friction, keep gap open, log reason
    if (!ok && faultClass) {
      _onFailure(cluster, faultClass, decision.agent, outcome);
    }

    // If success: check if any open gap for this cluster can be partially resolved
    if (ok) {
      _onSuccess(cluster, faultClass, decision.agent);
    }

  } catch(e) {
    console.warn(`[${MODULE_ID}] feedOutcome failed: ${e.message}`);
  }
}

// ── User satisfaction signal ──────────────────────────────────────────────────
// Called when user explicitly signals satisfaction or dissatisfaction
function recordSatisfaction(requestId, satisfied, reason) {
  const now = Date.now();

  try {
    jaaDB.insert('event_log', {
      uuid:    uid(),
      type:    satisfied ? 'user.satisfied' : 'user.unsatisfied',
      payload: { requestId, satisfied, reason: reason || null },
      source:  MODULE_ID,
      causedBy: requestId,
      ts:      now,
    });

    // Unsatisfied: open a gap, log the reason, tension will build
    if (!satisfied && reason) {
      jaaDB.insert('gaps', {
        uuid:        uid(),
        type:        'user.dissatisfaction',
        severity:    'medium',
        status:      'open',
        source:      MODULE_ID,
        body:        reason,
        description: `User unsatisfied: ${reason}`,
        requestId,
        ts:          now,
      });
      console.log(`[${MODULE_ID}] gap opened: user dissatisfaction — ${reason}`);
    }

    // Satisfied: emit training signal for pattern engine
    if (satisfied) {
      jaaDB.insert('event_log', {
        uuid:    uid(),
        type:    'pattern.training.positive',
        payload: { requestId, reason },
        source:  MODULE_ID,
        causedBy: requestId,
        ts:      now,
      });
    }

  } catch(e) {
    console.warn(`[${MODULE_ID}] satisfaction signal failed: ${e.message}`);
  }
}

// ── Update user model ─────────────────────────────────────────────────────────
function _updateUserModel(cluster, provider, success, durationMs) {
  try {
    const existing = jaaDB.query('user_model', () => true, 1)[0];
    if (!existing) return;

    const prefs = existing.preferredClusters || {};
    if (!prefs[cluster]) prefs[cluster] = {};
    if (!prefs[cluster][provider]) {
      prefs[cluster][provider] = { successRate: 0, confidence: 0.1, evidence: 0 };
    }

    const p = prefs[cluster][provider];
    p.evidence++;
    // Rolling success rate
    p.successRate = ((p.successRate * (p.evidence - 1)) + (success ? 1 : 0)) / p.evidence;
    // Confidence grows with evidence, caps at 0.95
    p.confidence  = Math.min(0.95, 0.1 + (p.evidence * 0.05));
    p.lastUpdated = Date.now();

    jaaDB.update('user_model', existing.uuid, {
      ...existing,
      preferredClusters: prefs,
      lastUpdated: Date.now(),
    });
  } catch(e) {
    console.warn(`[${MODULE_ID}] user model update failed: ${e.message}`);
  }
}

function _onFailure(cluster, faultClass, provider, outcome) {
  try {
    // Check if gap already open for this fault class
    const existing = jaaDB.query('gaps',
      r => r.type === 'raid.routing.failure' &&
           r.source === faultClass &&
           r.status === 'open',
      1
    )[0];

    if (existing) {
      // Gap already open — tension builds, update body
      jaaDB.update('gaps', existing.uuid, {
        body:      `${existing.body}\nFailed again via ${provider}`,
        updatedAt: Date.now(),
      });
    } else {
      // New failure gap
      jaaDB.insert('gaps', {
        uuid:        uid(),
        type:        'raid.routing.failure',
        severity:    'medium',
        status:      'open',
        source:      faultClass,
        body:        `Routing failure in cluster: ${cluster} via provider: ${provider}`,
        description: `Open loop: ${faultClass} has not resolved. Tension building.`,
        ts:          Date.now(),
      });
    }
  } catch(e) {
    console.warn(`[${MODULE_ID}] failure gap failed: ${e.message}`);
  }
}

function _onSuccess(cluster, faultClass, provider) {
  if (!faultClass) return;
  try {
    // Resolve any open routing failure gap for this fault class
    const existing = jaaDB.query('gaps',
      r => r.type === 'raid.routing.failure' &&
           r.source === faultClass &&
           r.status === 'open',
      1
    )[0];

    if (existing) {
      jaaDB.update('gaps', existing.uuid, {
        status:     'resolved',
        resolution: `Resolved via ${provider} in cluster ${cluster}`,
        resolvedAt: Date.now(),
      });
      console.log(`[${MODULE_ID}] gap resolved: ${faultClass} via ${provider}`);
    }
  } catch(e) {
    console.warn(`[${MODULE_ID}] success resolution failed: ${e.message}`);
  }
}

module.exports = {
  queryBefore, feedOutcome, recordSatisfaction,
  MODULE_ID, VERSION,
};
