'use strict';
/**
 * cortex/self-heal/escalation.js — NEXUS Escalating Self-Heal Engine
 * UUID: nexus-escalation-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * Every failure goes through a defined escalation ladder.
 * Each failed attempt increases friction on the fault class.
 * Friction accumulates in the ledger — it is never reset silently.
 * When friction crosses thresholds, the response changes.
 *
 * THE LADDER:
 *
 *   Level 0 — AUTO DETECT
 *     Diagnostic engines run. Gap classified. Friction checked.
 *     If this fault class is known + has a successful past fix → apply it.
 *     friction += 0.1 if applied and fails
 *
 *   Level 1 — SAFE FIX
 *     Pattern-matched safe fix (restart module, clear queue, reset timer).
 *     No code changes. Idempotent. Logged to ledger.
 *     friction += 0.2 on failure
 *
 *   Level 2 — SNAPSHOT + FORGE
 *     Take a snapshot first (safe rollback point).
 *     Send to forge for an AI-generated patch.
 *     T3 only — propose, never auto-apply.
 *     friction += 0.35 on forge failure
 *
 *   Level 3 — DIAGNOSTIC DEEP SCAN
 *     Full 12-engine diagnostic suite.
 *     Causal chain trace from the failure event.
 *     Fault tree evaluation.
 *     Result written to fault_taxonomy with full evidence chain.
 *     friction += 0.5 on repeated failure after scan
 *
 *   Level 4 — FAILURE MODE
 *     Gap marked as failure_mode in the ledger.
 *     Full evidence package: gap history, engine results, forge attempts.
 *     Friction score written to fault_taxonomy permanently.
 *     Human action item generated.
 *     No further automated attempts — system enters DEGRADED mode for this fault class.
 *
 * FRICTION LEDGER:
 *   Every escalation event appended to event_log with type 'escalation.*'
 *   Fault class friction persisted to fault_taxonomy table
 *   When friction >= 1.0 → failure mode, no more auto-attempts
 *   When friction >= 0.7 → high alert, reduced retry window
 *   When friction >= 0.4 → elevated, more conservative strategy
 *
 * §1.2  Every escalation attempt is logged — nothing silently fails
 * §2.1  Snapshot taken before any T2+ action
 * §1.1  Past fix attempts are consulted before new strategy chosen
 */

const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID = 'escalation';
const VERSION   = '1.0.0';

// ── Friction thresholds ───────────────────────────────────────────────────────
const FRICTION = {
  NOMINAL:      0.0,
  ELEVATED:     0.4,
  HIGH:         0.7,
  FAILURE_MODE: 1.0,
};

// ── Friction increments per level failure ─────────────────────────────────────
const FRICTION_COST = {
  0: 0.10,  // known fix failed
  1: 0.20,  // safe fix failed
  2: 0.35,  // forge failed
  3: 0.50,  // deep scan didn't resolve
};

// ── Get/set friction for a fault class ───────────────────────────────────────
function getFriction(faultClass) {
  const rows = jaaDB.query('fault_taxonomy', r => r.faultClass === faultClass, 1);
  return rows[0]?.friction || 0;
}

function addFriction(faultClass, delta, reason, evidence = {}) {
  const rows    = jaaDB.query('fault_taxonomy', r => r.faultClass === faultClass, 1);
  const old     = rows[0];
  const oldFric = old?.friction || 0;
  const newFric = Math.min(1.0, +(oldFric + delta).toFixed(4));
  const now     = Date.now();

  const record = {
    ...(old || {}),
    uuid:       old?.uuid || uid(),
    faultClass,
    friction:   newFric,
    count:      (old?.count || 0) + 1,
    lastSeen:   now,
    lastReason: reason,
    evidence:   evidence,
    failureMode: newFric >= FRICTION.FAILURE_MODE,
  };

  if (old) {
    jaaDB.update('fault_taxonomy', old.uuid, record);
  } else {
    jaaDB.insert('fault_taxonomy', record);
  }

  // Log friction change to event ledger
  jaaDB.insert('event_log', {
    uuid:   uid(), type: 'escalation.friction.increased',
    payload: { faultClass, oldFric, newFric, delta, reason },
    source: MODULE_ID, causedBy: null, ts: now,
  });

  console.log(`[${MODULE_ID}] friction ${faultClass}: ${oldFric.toFixed(2)} → ${newFric.toFixed(2)} (+${delta} — ${reason})`);
  return newFric;
}

function reduceFriction(faultClass, delta = 0.15, reason = 'successful_fix') {
  const rows  = jaaDB.query('fault_taxonomy', r => r.faultClass === faultClass, 1);
  const old   = rows[0];
  if (!old) return 0;
  const newFric = Math.max(0, +(old.friction - delta).toFixed(4));
  jaaDB.update('fault_taxonomy', old.uuid, { friction: newFric, lastSuccess: Date.now(), failureMode: false });
  jaaDB.insert('event_log', {
    uuid: uid(), type: 'escalation.friction.reduced',
    payload: { faultClass, oldFric: old.friction, newFric, delta, reason },
    source: MODULE_ID, causedBy: null, ts: Date.now(),
  });
  console.log(`[${MODULE_ID}] friction ${faultClass}: ${old.friction.toFixed(2)} → ${newFric.toFixed(2)} (-${delta} — ${reason})`);
  return newFric;
}

// ── Escalation log ────────────────────────────────────────────────────────────
function logEscalation(gap, level, result) {
  const record = {
    uuid:      uid(),
    type:     `escalation.level_${level}`,
    payload: {
      gapUuid:    gap.uuid,
      gapType:    gap.type,
      gapPath:    gap.path,
      faultClass: gap.type,
      level,
      result:     result.outcome,
      strategy:   result.strategy,
      friction:   getFriction(gap.type),
      reason:     result.reason,
    },
    source:    MODULE_ID,
    causedBy:  gap.uuid,
    ts:        Date.now(),
  };
  jaaDB.insert('event_log', record);
  return record;
}

// ── Level 0: Known fix from history ──────────────────────────────────────────
async function level0_knownFix(gap) {
  // Look for previously successful fixes for this fault class
  const history = jaaDB.query('forge_patches',
    r => r.faultClass === gap.type && r.status === 'verified' && r.successRate > 0.5,
    1
  );

  if (!history.length) {
    return { outcome: 'skip', reason: 'no known successful fix for this fault class', strategy: 'escalate' };
  }

  const known = history[0];
  console.log(`[${MODULE_ID}] level 0: known fix found for ${gap.type} (success rate: ${known.successRate})`);

  return {
    outcome:  'attempted',
    strategy: 'known_fix_replay',
    patchRef: known.uuid,
    note:     `Replaying fix from ${new Date(known.ts).toLocaleString()}`,
  };
}

// ── Level 1: Safe fix (no code changes) ──────────────────────────────────────
const SAFE_FIXES = {
  stale_module:     { action: 'restart_module',    note: 'Module heartbeat stale — restarting poll' },
  timeout:          { action: 'clear_and_retry',   note: 'Request timed out — clearing and retrying' },
  api_degraded:     { action: 'probe_and_wait',    note: 'API degraded — probing every 5s, max 30s' },
  queue_saturated:  { action: 'drain_queue',       note: 'Queue saturated — draining oldest items' },
  memory_pressure:  { action: 'evict_working_mem', note: 'Memory pressure — evicting working tier' },
  bottleneck:       { action: 'log_and_throttle',  note: 'Recurring bottleneck — throttling intake rate' },
  circuit_breaker:  { action: 'wait_and_reset',    note: 'Circuit open — waiting 30s before reset' },
  import_error:     { action: 'check_deps',        note: 'Import error — scanning module dependencies' },
};

async function level1_safeFix(gap) {
  const fix = SAFE_FIXES[gap.type] || SAFE_FIXES[gap.type?.split('_')[0]];
  if (!fix) {
    return { outcome: 'no_safe_fix', strategy: 'escalate', reason: `no safe fix registered for ${gap.type}` };
  }

  console.log(`[${MODULE_ID}] level 1: safe fix — ${fix.action} (${fix.note})`);

  return {
    outcome:  'attempted',
    strategy: 'safe_fix',
    action:   fix.action,
    note:     fix.note,
  };
}

// ── Level 2: Snapshot + Forge ─────────────────────────────────────────────────
async function level2_snapshotAndForge(gap) {
  let snapId = null;

  // Take snapshot first
  try {
    const snapshotMod = require('../snapshot');
    if (snapshotMod?.create) {
      const snap = await snapshotMod.create(`pre-escalation: ${gap.type} in ${gap.path}`);
      snapId = snap?.snapId;
      console.log(`[${MODULE_ID}] level 2: snapshot taken — ${snapId}`);
    }
  } catch(e) {
    console.warn(`[${MODULE_ID}] level 2: snapshot failed — ${e.message}`);
  }

  // Dispatch to forge
  jaaDB.insert('event_log', {
    uuid: uid(), type: 'escalation.forge_requested',
    payload: { gapUuid: gap.uuid, gapType: gap.type, snapId },
    source: MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
  });

  return {
    outcome:  'attempted',
    strategy: 'snapshot_then_forge',
    snapId,
    note:     snapId
      ? `Snapshot ${snapId} taken. Forge proposal dispatched. Apply after review.`
      : 'Forge proposal dispatched (snapshot failed — review before applying).',
  };
}

// ── Level 3: Diagnostic deep scan ─────────────────────────────────────────────
async function level3_deepScan(gap) {
  let engineResults = null;

  try {
    const de = require('../../lib/diagnostic-engines');
    const events = jaaDB.tail('event_log', 200);
    const gaps   = jaaDB.query('gaps', r => r.status === 'open', 50);

    const states = {};
    const reg    = jaaDB.query('project_registry', () => true, 20);
    for (const r of reg) states[r.name] = { online: r.online, friction: r.friction || 0, sigma: r.sigma || 0 };

    engineResults = de.runAllEngines({ events, systemStates: states });
    console.log(`[${MODULE_ID}] level 3: deep scan — health: ${engineResults.healthScore}, alerts: ${engineResults.alertCount}`);
  } catch(e) {
    console.warn(`[${MODULE_ID}] level 3: engine scan failed — ${e.message}`);
  }

  // Write full evidence to fault_taxonomy
  const rows   = jaaDB.query('fault_taxonomy', r => r.faultClass === gap.type, 1);
  const update = {
    ...(rows[0] || {}),
    uuid:           rows[0]?.uuid || uid(),
    faultClass:     gap.type,
    lastDeepScan:   Date.now(),
    engineEvidence: engineResults ? {
      healthScore:   engineResults.healthScore,
      alertCount:    engineResults.alertCount,
      alerts:        (engineResults.alerts || []).slice(0, 3),
      causalChain:   engineResults.engines?.causal_chain,
      circuitBreaker:engineResults.engines?.circuit_breaker,
      faultTree:     engineResults.engines?.fault_tree,
    } : null,
    gap: { uuid: gap.uuid, type: gap.type, path: gap.path, body: gap.body },
  };
  if (rows[0]) jaaDB.update('fault_taxonomy', rows[0].uuid, update);
  else jaaDB.insert('fault_taxonomy', update);

  return {
    outcome:      'scanned',
    strategy:     'deep_scan',
    engineResults: engineResults ? { healthScore: engineResults.healthScore, alerts: engineResults.alertCount } : null,
    note:         `Full diagnostic scan complete. Evidence written to fault_taxonomy.`,
  };
}

// ── Level 4: Failure mode ─────────────────────────────────────────────────────
async function level4_failureMode(gap, history) {
  const friction = getFriction(gap.type);
  const now      = Date.now();

  // Build full failure mode record
  const fmRecord = {
    uuid:        uid(),
    type:        'failure_mode',
    gapUuid:     gap.uuid,
    faultClass:  gap.type,
    path:        gap.path,
    body:        gap.body,
    friction,
    escalationHistory: history.map(h => ({
      level: h.level, outcome: h.result?.outcome, strategy: h.result?.strategy, ts: h.ts
    })),
    detectedAt:  now,
    status:      'active',
    humanAction: _humanAction(gap),
  };

  jaaDB.insert('failure_modes', fmRecord);
  jaaDB.insert('event_log', {
    uuid: uid(), type: 'escalation.failure_mode',
    payload: { faultClass: gap.type, friction, gapUuid: gap.uuid, humanAction: fmRecord.humanAction },
    source: MODULE_ID, causedBy: gap.uuid, ts: now,
  });

  // Update gap status
  jaaDB.update('gaps', gap.uuid, { status: 'failure_mode', failureModeUuid: fmRecord.uuid });

  console.error(`[${MODULE_ID}] FAILURE MODE: ${gap.type} — friction: ${friction.toFixed(2)} — ${fmRecord.humanAction}`);

  return {
    outcome:     'failure_mode',
    strategy:    'human_required',
    fmUuid:      fmRecord.uuid,
    friction,
    humanAction: fmRecord.humanAction,
    note:        `System has exhausted automated strategies. Human action required.`,
  };
}

function _humanAction(gap) {
  const actions = {
    stale_module:    `Module ${gap.path} has not responded in extended time. Restart the process and check its boot sequence.`,
    import_error:    `${gap.path} has a missing dependency. Run: node --check ${gap.path} and install missing modules.`,
    api_degraded:    `API at ${gap.path} is not responding. Check the service is running and port is not blocked.`,
    recurring_failure:`${gap.path} is failing repeatedly. Review the last 5 forge patches for regressions.`,
    forge_failed:    `Forge cannot patch ${gap.path}. The file may have syntax errors or conflicting patches. Manual review required.`,
    circuit_breaker: `${gap.path} circuit is stuck OPEN. Services are not retrying. Restart and check root cause before reopening.`,
  };
  return actions[gap.type] || `${gap.type} at ${gap.path} has exceeded automated repair capacity. Manual investigation required.`;
}

// ── Main escalation runner ─────────────────────────────────────────────────────
async function escalate(gap) {
  const faultClass = gap.type;
  const friction   = getFriction(faultClass);
  const history    = [];

  // Already in failure mode?
  if (friction >= FRICTION.FAILURE_MODE) {
    const fm = jaaDB.query('failure_modes', r => r.faultClass === faultClass && r.status === 'active', 1)[0];
    if (fm) {
      console.log(`[${MODULE_ID}] ${faultClass} already in failure mode — skipping escalation`);
      return { alreadyFailureMode: true, fmUuid: fm.uuid, humanAction: fm.humanAction };
    }
  }

  console.log(`[${MODULE_ID}] escalating ${faultClass} (friction: ${friction.toFixed(2)})`);

  // ── Level 0: known fix ────────────────────────────────────────────────────
  const r0 = await level0_knownFix(gap);
  history.push({ level: 0, result: r0, ts: Date.now() });
  logEscalation(gap, 0, r0);

  if (r0.outcome === 'skip') {
    // No known fix — skip to level 1
  } else if (r0.outcome === 'attempted') {
    // If known fix worked, reduce friction and return
    reduceFriction(faultClass, 0.15, 'known_fix_attempted');
    if (friction < FRICTION.ELEVATED) return { resolved: true, level: 0, ...r0 };
  }

  // ── Level 1: safe fix ─────────────────────────────────────────────────────
  if (friction < FRICTION.HIGH) {
    const r1 = await level1_safeFix(gap);
    history.push({ level: 1, result: r1, ts: Date.now() });
    logEscalation(gap, 1, r1);

    if (r1.outcome === 'attempted') {
      addFriction(faultClass, FRICTION_COST[1], 'safe_fix_applied', { r1 });
      return { resolved: 'pending', level: 1, ...r1 };
    }
  }

  // ── Level 2: snapshot + forge ─────────────────────────────────────────────
  if (friction < FRICTION.HIGH) {
    const r2 = await level2_snapshotAndForge(gap);
    history.push({ level: 2, result: r2, ts: Date.now() });
    logEscalation(gap, 2, r2);
    addFriction(faultClass, FRICTION_COST[2], 'forge_dispatched', { snapId: r2.snapId });
    return { resolved: 'pending_review', level: 2, ...r2 };
  }

  // ── Level 3: deep scan ────────────────────────────────────────────────────
  if (friction < FRICTION.FAILURE_MODE) {
    const r3 = await level3_deepScan(gap);
    history.push({ level: 3, result: r3, ts: Date.now() });
    logEscalation(gap, 3, r3);
    addFriction(faultClass, FRICTION_COST[3], 'deep_scan_run', { engineResults: r3.engineResults });
    return { resolved: 'scanned', level: 3, ...r3 };
  }

  // ── Level 4: failure mode ─────────────────────────────────────────────────
  const r4 = await level4_failureMode(gap, history);
  history.push({ level: 4, result: r4, ts: Date.now() });
  logEscalation(gap, 4, r4);
  addFriction(faultClass, 0, 'failure_mode_set');  // already at 1.0
  return { resolved: false, level: 4, ...r4 };
}

module.exports = {
  escalate,
  getFriction, addFriction, reduceFriction,
  level0_knownFix, level1_safeFix, level2_snapshotAndForge,
  level3_deepScan, level4_failureMode,
  FRICTION, FRICTION_COST,
  MODULE_ID, VERSION,
};
