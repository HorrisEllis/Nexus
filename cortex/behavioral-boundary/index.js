'use strict';
/**
 * cortex/behavioral-boundary/index.js
 * UUID: nexus-behavioral-boundary-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * Behavioral Boundary Organ.
 *
 * Enforces the line between the deterministic zone and the fluid zone.
 *
 * DETERMINISTIC ZONE — never touched by AI:
 *   - Axiom files (escalation thresholds, RAID laws, boot HARD phases)
 *   - JAA write paths (§2.1 — disk before behavior)
 *   - Auth layer (crypto, policy, client keys)
 *   - Contract definitions
 *   - Spec files
 *   - This file and lib/spec-drift.js
 *
 * FLUID ZONE — AI-assisted, adaptive:
 *   - Forge patches to application logic
 *   - Healer prescriptions
 *   - Gap body text
 *   - SEAM T2/T3 chunk outputs
 *   - Intelligence pattern descriptions
 *
 * Three invariants checked on every AI output before it enters the system:
 *
 *   INV-A  BOUNDARY INTEGRITY
 *     No AI-generated content touches a deterministic zone file.
 *     If a forge patch targets auth/, lib/spec-drift.js, escalation
 *     thresholds, or HARD boot phases — reject. Open gap. Halt.
 *
 *   INV-B  FRICTION MONOTONICITY
 *     Friction in fault_taxonomy only moves via the defined escalation
 *     rules. No AI output may directly modify friction scores.
 *     If detected — reject and open behavioral.drift.friction gap.
 *
 *   INV-C  SELF-MODIFICATION DETECTION
 *     If any AI output targets a file that defines the system's own
 *     constraints (spec files, axiom constants, drift detector, this file)
 *     — hard stop. Human action required. No escalation ladder.
 *
 * Additionally runs BDA signal extraction on AI outputs to detect
 * behavioral drift trends — the system watching its own AI layer.
 *
 * This organ is fully isolated:
 *   - Reads from event bus (forge.patch.proposed, healer.prescription.ready)
 *   - Writes to JAA (gaps, event_log)
 *   - Emits on event bus (behavioral.boundary.violation, behavioral.drift.signal)
 *   - Calls nothing directly on any other organ
 *
 * §1.2  Every violation is an event — nothing silently rejected
 * §2.1  Gap written to JAA before violation event emitted
 * §5.1  Every violation record carries UUID
 */

const crypto = require('crypto');
const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID = 'behavioral-boundary';
const VERSION   = '1.0.0';

// ── Deterministic zone — files AI must never touch ────────────────────────────
// Paths are relative to NEXUS root. Partial matches count.
const DETERMINISTIC_PATHS = [
  // Auth
  'auth/index.js', 'auth/server.js', 'auth/policy.json', 'auth/clients/',
  // Escalation thresholds and friction ledger logic
  'cortex/self-heal/escalation.js',
  // Boot HARD phases
  'lib/boot-sequence.js',
  // Spec drift engine (watches itself)
  'lib/spec-drift.js',
  // This file
  'cortex/behavioral-boundary/index.js',
  // Spec files (define constraints)
  '.spec',
  // Contract definitions
  'contracts/',
  // Version registry (source of truth)
  'lib/version.js',
  // RAID laws (provider routing invariants)
  // CLUSTER_CHAINS and LAW_I/LAW_III are in:
  'cortex/core/raid/index.js',
  // JAA schema (table tiers define what persists)
  'cortex/memory/jaa-db.js',
  // Component registry schema
  'lib/component-registry.js',
];

// ── Self-modification targets — immediate halt, no ladder ─────────────────────
const SELF_MOD_PATHS = [
  'lib/spec-drift.js',
  'cortex/behavioral-boundary/index.js',
  'cortex/self-heal/escalation.js',
  'lib/boot-sequence.js',
  'auth/',
  '.spec',
  'lib/version.js',
];

// ── BDA signal history — track AI output trends ───────────────────────────────
const _signalHistory = [];   // last 50 AI output signal readings
const MAX_HISTORY    = 50;
const DRIFT_WINDOW   = 10;   // check trend over last N readings
const DRIFT_THRESHOLD = 0.25; // rate of change that signals drift

// ── State ─────────────────────────────────────────────────────────────────────
let _bus = null;
let _cfg = {};
let _violations = 0;
let _checks     = 0;

// ── Init (organ interface) ────────────────────────────────────────────────────
function init(cfg = {}) {
  _cfg = cfg;
  _bus = cfg.bus || null;

  // Subscribe to events from the fluid zone
  if (_bus) {
    // Forge proposing a patch — check before application
    _bus.on('forge.patch.proposed',       _onForgePatch);
    _bus.on('healer.prescription.ready',  _onHeelerPrescription);
    _bus.on('seam.chunk.complete',        _onSeamChunk);
    _bus.on('guardian.job.complete',      _onAIOutput);
    // Also watch for any direct friction modification attempts
    _bus.on('escalation.friction.increased', _onFrictionChange);
  }

  console.log(`[${MODULE_ID}] v${VERSION} active — boundary enforcement on`);
  return { ok: true };
}

function stop() {
  if (_bus) {
    _bus.off('forge.patch.proposed',       _onForgePatch);
    _bus.off('healer.prescription.ready',  _onHeelerPrescription);
    _bus.off('seam.chunk.complete',        _onSeamChunk);
    _bus.off('guardian.job.complete',      _onAIOutput);
    _bus.off('escalation.friction.increased', _onFrictionChange);
  }
}

// ── INV-A + INV-C: Boundary and self-modification check ───────────────────────
function checkBoundary(targetPath, content, source) {
  _checks++;
  const result = { ok: true, violations: [] };

  if (!targetPath) return result;

  // INV-C: Self-modification — immediate halt
  const isSelfMod = SELF_MOD_PATHS.some(p => targetPath.includes(p));
  if (isSelfMod) {
    const v = _recordViolation('INV-C', 'self_modification', {
      targetPath, source,
      severity: 'critical',
      humanAction: `AI output targeted a self-defining file: ${targetPath}. No automated action. Human review required immediately.`,
    });
    result.ok = false;
    result.violations.push(v);
    result.halt = true;  // no escalation ladder — straight to human
    return result;
  }

  // INV-A: Boundary integrity — deterministic zone
  const isDeterministic = DETERMINISTIC_PATHS.some(p => targetPath.includes(p));
  if (isDeterministic) {
    const v = _recordViolation('INV-A', 'boundary_crossed', {
      targetPath, source,
      severity: 'high',
      humanAction: `AI output targeted deterministic zone file: ${targetPath}. Rejected. Review forge patch intent.`,
    });
    result.ok = false;
    result.violations.push(v);
    return result;
  }

  return result;
}

// ── INV-B: Friction monotonicity check ───────────────────────────────────────
function _onFrictionChange(event) {
  const { faultClass, oldFric, newFric, reason, source: evtSource } = event.payload || {};

  // Legitimate friction changes come from the escalation engine
  // Any other source is a violation
  const legitimateSources = [
    'escalation', 'cortex/self-heal/escalation', MODULE_ID
  ];
  const isLegitimate = legitimateSources.some(s =>
    (evtSource || '').includes(s) || (reason || '').includes('escalation')
  );

  if (!isLegitimate && newFric !== undefined && oldFric !== undefined) {
    _recordViolation('INV-B', 'friction_modified_outside_escalation', {
      faultClass, oldFric, newFric, evtSource,
      severity: 'high',
      humanAction: `Friction for ${faultClass} was modified by ${evtSource} outside the escalation ladder. Possible behavioral drift in friction management.`,
    });
  }
}

// ── BDA trend analysis on AI outputs ─────────────────────────────────────────
function _extractSignals(text) {
  if (!text || typeof text !== 'string') return null;

  const words = text.toLowerCase().split(/\s+/);
  const len   = Math.max(words.length, 1);

  // Valence — positive vs negative framing
  const positive = words.filter(w => /\b(build|add|create|fix|improve|complete|success|done|working|correct|good)\b/.test(w)).length;
  const negative = words.filter(w => /\b(delete|remove|fail|error|broken|wrong|reject|deny|refuse|cannot|unable)\b/.length).length;
  const valence  = (positive - negative) / len;

  // Certainty — decisive vs hedging
  const hedges    = words.filter(w => /\b(maybe|might|possibly|perhaps|could|uncertain|unclear|unknown|not sure)\b/.test(w)).length;
  const certain   = words.filter(w => /\b(will|must|always|never|definitely|certainly|required|guaranteed)\b/.test(w)).length;
  const certainty = (certain - hedges) / len;

  // Selfref — references to itself / the system
  const selfwords = words.filter(w => /\b(myself|itself|system|nexus|i am|this file|this module|my own)\b/.test(w)).length;
  const selfref   = selfwords / len;

  // Tension — conflicting or contradictory language
  const conflicts = words.filter(w => /\b(but|however|although|despite|conflict|contradict|violate|override)\b/.test(w)).length;
  const tension   = conflicts / len;

  return { valence, certainty, selfref, tension, ts: Date.now(), wordCount: len };
}

function _trackSignal(signals, provider, outputType) {
  if (!signals) return;

  _signalHistory.push({ ...signals, provider, outputType });
  if (_signalHistory.length > MAX_HISTORY) _signalHistory.shift();

  // Check for drift trends in recent window
  if (_signalHistory.length >= DRIFT_WINDOW) {
    const window = _signalHistory.slice(-DRIFT_WINDOW);
    _checkDriftTrend(window, provider);
  }
}

function _checkDriftTrend(window, provider) {
  // For each signal axis, check if trend is moving sharply in one direction
  const axes = ['valence', 'certainty', 'selfref', 'tension'];

  for (const axis of axes) {
    const values = window.map(s => s[axis] || 0);
    const early  = values.slice(0, 5).reduce((a,b) => a+b, 0) / 5;
    const recent = values.slice(-5).reduce((a,b) => a+b, 0) / 5;
    const delta  = recent - early;

    let concern = null;

    if (axis === 'selfref' && recent > 0.05) {
      // Selfref trending up is the most dangerous — system talking about itself
      concern = `selfref rising (${(recent*100).toFixed(1)}%) — AI outputs increasingly self-referential`;
    } else if (axis === 'tension' && recent > 0.08) {
      concern = `tension rising (${(recent*100).toFixed(1)}%) — AI outputs showing increasing conflict signals`;
    } else if (axis === 'valence' && delta < -DRIFT_THRESHOLD) {
      concern = `valence declining (Δ${(delta*100).toFixed(1)}%) — AI outputs trending more negative`;
    } else if (axis === 'certainty' && delta < -DRIFT_THRESHOLD) {
      concern = `certainty declining (Δ${(delta*100).toFixed(1)}%) — AI outputs becoming more hedging`;
    }

    if (concern) {
      _recordDriftSignal(axis, concern, { window: window.length, delta, recent, provider });
    }
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────
function _onForgePatch(event) {
  const { targetPath, patch, source, jobId } = event.payload || {};
  const result = checkBoundary(targetPath, patch, source || 'forge');

  if (!result.ok) {
    // Emit rejection — forge should listen for this and abort
    if (_bus) _bus.emit('behavioral.boundary.rejected', {
      jobId, targetPath, violations: result.violations, halt: !!result.halt,
    });
  }

  // Track signals regardless
  const signals = _extractSignals(typeof patch === 'string' ? patch : JSON.stringify(patch || ''));
  _trackSignal(signals, source || 'forge', 'patch');
}

function _onHeelerPrescription(event) {
  const { prescription, targetModule, source } = event.payload || {};
  const result = checkBoundary(targetModule, prescription, source || 'healer');

  if (!result.ok && _bus) {
    _bus.emit('behavioral.boundary.rejected', {
      targetModule, violations: result.violations, halt: !!result.halt,
    });
  }

  const signals = _extractSignals(prescription || '');
  _trackSignal(signals, source || 'healer', 'prescription');
}

function _onSeamChunk(event) {
  const { result: text, provider, chunkId } = event.payload || {};
  const signals = _extractSignals(text || '');
  _trackSignal(signals, provider || 'seam', 'chunk');
}

function _onAIOutput(event) {
  const { result: text, provider } = event.payload || {};
  const signals = _extractSignals(text || '');
  _trackSignal(signals, provider || 'unknown', 'job');
}

// ── Record violation to JAA ────────────────────────────────────────────────────
function _recordViolation(invariant, type, detail) {
  _violations++;
  const id = uid();
  const now = Date.now();

  const gapRecord = {
    uuid:        id,
    type:        'behavioral.drift.' + type,
    severity:    detail.severity || 'high',
    status:      detail.halt ? 'failure_mode' : 'open',
    source:      MODULE_ID,
    path:        detail.targetPath || detail.targetModule || '?',
    body:        `${invariant} violation: ${type}`,
    description: detail.humanAction || `Behavioral boundary violation detected`,
    evidence:    detail,
    ts:          now,
  };

  // §2.1 — JAA first
  try { jaaDB.insert('gaps', gapRecord); } catch(e) {
    console.error(`[${MODULE_ID}] CRITICAL: JAA write failed for violation: ${e.message}`);
  }

  // Then event bus
  if (_bus) {
    _bus.emit('behavioral.boundary.violation', {
      invariant, type, gapUuid: id, detail,
      halt: !!detail.halt, ts: now,
    });
  }

  console.error(`[${MODULE_ID}] ⛔ ${invariant} VIOLATION: ${type} — ${detail.humanAction || ''}`);
  return gapRecord;
}

function _recordDriftSignal(axis, concern, data) {
  const id  = uid();
  const now = Date.now();

  try {
    jaaDB.insert('event_log', {
      uuid: id, type: 'behavioral.drift.signal',
      payload: { axis, concern, ...data },
      source: MODULE_ID, causedBy: null, ts: now,
    });
  } catch(e) {
    console.warn(`[${MODULE_ID}] drift signal log failed: ${e.message}`);
  }

  if (_bus) {
    _bus.emit('behavioral.drift.signal', { axis, concern, data, ts: now });
  }

  console.warn(`[${MODULE_ID}] ⚠ drift signal — ${concern}`);
}

// ── Status ────────────────────────────────────────────────────────────────────
function status() {
  const recent = _signalHistory.slice(-DRIFT_WINDOW);
  const avgSignals = recent.length ? {
    valence:   recent.reduce((s,r) => s + (r.valence||0), 0) / recent.length,
    certainty: recent.reduce((s,r) => s + (r.certainty||0), 0) / recent.length,
    selfref:   recent.reduce((s,r) => s + (r.selfref||0), 0) / recent.length,
    tension:   recent.reduce((s,r) => s + (r.tension||0), 0) / recent.length,
  } : null;

  return {
    ok:              true,
    violations:      _violations,
    checks:          _checks,
    signalHistory:   _signalHistory.length,
    avgSignals,
    deterministicPaths: DETERMINISTIC_PATHS.length,
    selfModPaths:    SELF_MOD_PATHS.length,
  };
}

module.exports = { init, stop, checkBoundary, status, MODULE_ID, VERSION };
