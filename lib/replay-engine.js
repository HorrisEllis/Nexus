'use strict';
/**
 * lib/replay-engine.js — NEXUS Replay Engine
 * UUID: nexus-replay-engine-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * Snapshot before every decision. Control-Z for the entire system.
 * Every input, output, choice, alternative, cost, outcome logged.
 * Replay from any point. Sandbox. Compare. Merge or discard.
 * Every replay is training data for the pattern engine.
 *
 * Snapshot triggers (universal):
 *   - RAID routing decision
 *   - forge patch application
 *   - healer prescription execution
 *   - autonomous loop iteration
 *   - hot module integration
 *   - constitutional AI decision
 *   - any write to deterministic zone
 *
 * §1.2  Every decision logged — nothing silent
 * §2.1  Snapshot written to JAA before decision executes
 * §5.1  Every snapshot and decision carries UUID
 */

const crypto = require('crypto');
const { jaaDB, uid } = require('../cortex/memory/jaa-db');

const MODULE_ID  = 'replay-engine';
const VERSION    = '1.0.0';
const MAX_SNAPSHOTS = 200; // keep last 200 snapshots in JAA

// ── Snapshot ──────────────────────────────────────────────────────────────────
function snapshot(context = {}) {
  const id  = uid();
  const now = Date.now();

  // Capture system state
  const state = _captureState(context);

  const record = {
    uuid:      id,
    trigger:   context.trigger || 'manual',
    requestId: context.requestId || null,
    actor:     context.actor    || 'system',
    state,
    ts:        now,
  };

  // §2.1 — disk before anything
  try {
    jaaDB.insert('snapshots', record);
    _pruneSnapshots();
  } catch(e) {
    console.warn(`[${MODULE_ID}] snapshot write failed: ${e.message}`);
    return null;
  }

  return { snapshotId: id, ts: now };
}

function _captureState(context) {
  const state = {
    ts: Date.now(),
    context: context.trigger || 'manual',
  };

  try {
    // Open gaps count and friction summary
    const gaps     = jaaDB.query('gaps', r => r.status === 'open', 100);
    state.openGaps = gaps.length;
    state.highFriction = gaps.filter(g => g.friction >= 0.7).length;

    // Liminal space velocity
    const liminal = jaaDB.query('interstitial_spaces',
      r => !r.resolved && !r.dissolved && !r.crystallised, 50);
    state.liminalActive = liminal.length;

    // Pattern count
    const patterns = jaaDB.query('bep_patterns', r => r.crystallised, 50);
    state.crystallisedPatterns = patterns.length;

    // Recent event count (last 5 min)
    const fiveMinAgo = Date.now() - 300_000;
    const events     = jaaDB.query('event_log', r => r.ts > fiveMinAgo, 200);
    state.recentEvents = events.length;

    // Active fault classes
    const faults = jaaDB.query('fault_taxonomy', r => r.friction > 0, 20);
    state.activeFaultClasses = faults.map(f => ({
      class: f.faultClass, friction: f.friction
    }));

  } catch(e) {
    state.captureError = e.message;
  }

  return state;
}

function _pruneSnapshots() {
  try {
    const all = jaaDB.query('snapshots', () => true, MAX_SNAPSHOTS + 50);
    if (all.length > MAX_SNAPSHOTS) {
      const sorted  = all.sort((a,b) => b.ts - a.ts);
      const toDelete = sorted.slice(MAX_SNAPSHOTS);
      for (const s of toDelete) {
        jaaDB.update('snapshots', s.uuid, { ...s, _pruned: true });
      }
    }
  } catch(_) {}
}

// ── Decision log ──────────────────────────────────────────────────────────────
// Called alongside snapshot to log the full decision context
function logDecision(decision) {
  const {
    requestId, actor, snapshotId,
    input, output, chosen, alternatives,
    cost, outcome, satisfaction,
    // §PHASE-31: previously dropped silently — destructuring only the
    // fields below this comment used to exist meant request-handler.js
    // could add a field to `decision` and have it vanish here before ever
    // reaching decision_log, with no error and no log line. Found while
    // wiring grammar-misfire tracking into reflection.js's existing
    // streak mechanism — fixed at the actual point of loss, not papered
    // over by re-deriving the data somewhere downstream.
    grammarComponentId, grammarConfidence,
  } = decision;

  const record = {
    uuid:         uid(),
    requestId:    requestId || null,
    actor:        actor     || 'system',
    snapshotId:   snapshotId || null,
    input:        _truncate(input,   500),
    output:       _truncate(output,  500),
    chosen:       chosen,
    alternatives: alternatives || [],
    cost: {
      tokens:     cost?.tokens     || 0,
      timeMs:     cost?.timeMs     || 0,
      compute:    cost?.compute    || null,
      complexity: cost?.complexity || null,
    },
    outcome:      outcome     || null,
    satisfaction: satisfaction || null,
    grammarComponentId: grammarComponentId || null,
    grammarConfidence:  grammarConfidence  ?? null,
    ts:           Date.now(),
  };

  try {
    jaaDB.insert('decision_log', record);
  } catch(e) {
    console.warn(`[${MODULE_ID}] decision log failed: ${e.message}`);
  }

  return record.uuid;
}

// ── Replay ────────────────────────────────────────────────────────────────────
function replay(snapshotId, opts = {}) {
  const { sandbox = true, newDecision = null } = opts;

  // Load the snapshot
  const snapshots = jaaDB.query('snapshots', r => r.uuid === snapshotId, 1);
  if (!snapshots.length) {
    return { ok: false, error: `snapshot not found: ${snapshotId}` };
  }
  const snap = snapshots[0];

  // Load all decisions made after this snapshot (for comparison)
  const decisions = jaaDB.query('decision_log',
    r => r.snapshotId === snapshotId || r.ts >= snap.ts,
    50
  ).sort((a,b) => a.ts - b.ts);

  if (sandbox) {
    // Sandbox replay — describe what would happen, don't actually do it
    const result = {
      ok:          true,
      mode:        'sandbox',
      snapshotId,
      snapshotTs:  snap.ts,
      state:       snap.state,
      decisions:   decisions.length,
      originalPath: decisions.map(d => ({
        actor:   d.actor,
        chosen:  d.chosen,
        outcome: d.outcome,
        ts:      d.ts,
      })),
      alternativePath: newDecision ? {
        wouldChoose: newDecision,
        note: 'sandbox — no live system changes',
      } : null,
    };

    // Log replay attempt as training data
    _logReplayAsTraining(snapshotId, decisions, newDecision);

    return result;
  }

  return {
    ok:    false,
    error: 'live replay requires explicit confirmation — use sandbox:true first',
  };
}

// ── Divergence detection ──────────────────────────────────────────────────────
// Compare two replay paths and find where they diverged
function detectDivergence(snapshotId) {
  try {
    const decisions = jaaDB.query('decision_log',
      r => r.snapshotId === snapshotId, 50
    ).sort((a,b) => a.ts - b.ts);

    if (decisions.length < 2) {
      return { ok: true, diverged: false, reason: 'insufficient decisions to compare' };
    }

    const divergences = [];
    for (const d of decisions) {
      if (d.alternatives?.length && d.outcome === 'failure') {
        divergences.push({
          decisionId:   d.uuid,
          actor:        d.actor,
          chosen:       d.chosen,
          alternatives: d.alternatives,
          outcome:      d.outcome,
          note:         'failed decision with alternatives available',
        });
      }
    }

    return {
      ok:          true,
      diverged:    divergences.length > 0,
      divergences,
      suggestion:  divergences.length
        ? `${divergences.length} decision(s) could have taken different paths`
        : null,
    };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── Training signal from replay ───────────────────────────────────────────────
function _logReplayAsTraining(snapshotId, decisions, newDecision) {
  try {
    jaaDB.insert('event_log', {
      uuid:    uid(),
      type:    'replay.training.signal',
      payload: {
        snapshotId,
        decisionCount: decisions.length,
        hasAlternative: !!newDecision,
        outcomes: decisions.map(d => d.outcome).filter(Boolean),
      },
      source:   MODULE_ID,
      causedBy: snapshotId,
      ts:       Date.now(),
    });
  } catch(_) {}
}

// ── List snapshots ────────────────────────────────────────────────────────────
function listSnapshots(limit = 20) {
  try {
    return jaaDB.query('snapshots', r => !r._pruned, limit)
      .sort((a,b) => b.ts - a.ts)
      .slice(0, limit)
      .map(s => ({
        snapshotId: s.uuid,
        trigger:    s.trigger,
        actor:      s.actor,
        ts:         s.ts,
        openGaps:   s.state?.openGaps || 0,
        liminalActive: s.state?.liminalActive || 0,
      }));
  } catch(e) {
    return [];
  }
}

function listDecisions(snapshotId, limit = 20) {
  try {
    return jaaDB.query('decision_log',
      r => !snapshotId || r.snapshotId === snapshotId, limit
    ).sort((a,b) => b.ts - a.ts).slice(0, limit);
  } catch(e) {
    return [];
  }
}

function _truncate(val, max) {
  if (!val) return null;
  const s = typeof val === 'string' ? val : JSON.stringify(val);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// ── Add snapshots and decision_log tables to JAA if missing ───────────────────
function ensureTables() {
  // Tables are declared in jaa-db.js TABLE_TIERS
  // This is a soft check — if they exist, good. If not, warn.
  try {
    jaaDB.query('snapshots', () => false, 1);
    jaaDB.query('decision_log', () => false, 1);
  } catch(e) {
    console.warn(`[${MODULE_ID}] tables not ready — add snapshots and decision_log to JAA: ${e.message}`);
  }
}

module.exports = {
  snapshot, logDecision, replay,
  detectDivergence, listSnapshots, listDecisions,
  ensureTables, MODULE_ID, VERSION,
};
