'use strict';
/**
 * lib/causal/anomaly.js — Phase 71.3: Anomaly Engine
 * UUID: nexus-causal-anomaly-v1-0000-2026-0625-jamesbrooks-001
 * Version: 1.0.0
 *
 * Consumes mismatch signals from the Expectation Engine (71.2).
 * Names the anomaly type, severity, and causal context formally.
 * Writes to anomaly_log (JAA) and emits on the bus.
 *
 * Anomaly types (§5.2):
 *   missing_event      — expected event never arrived
 *   unexpected_event   — event arrived at wrong position
 *   timeout            — session exceeded expected duration
 *   state_violation    — reducer reached impossible state
 *   causal_gap         — timing anomaly beyond 3× historical avg
 *   path_mismatch      — actual path diverged from expected
 *
 * §1.1 Nothing exists until the Expectation Engine signals it
 * §1.2 Every anomaly written to JAA before any action
 * §5.3 Anomaly engine classifies — never acts. Action belongs to 71.4.
 */

const crypto = require('crypto');
const path   = require('path');

const MODULE_ID = 'causal/anomaly';
const VERSION   = '1.0.0';

// Anomaly type taxonomy
const ANOMALY_TYPES = {
  missing_event:    { severity_base: 'high',   description: 'Expected event never arrived' },
  unexpected_event: { severity_base: 'medium', description: 'Event arrived at wrong position in sequence' },
  timeout:          { severity_base: 'high',   description: 'Session exceeded expected duration' },
  state_violation:  { severity_base: 'high',   description: 'SEAM reducer reached impossible state' },
  causal_gap:       { severity_base: 'medium', description: 'Timing gap beyond 3× historical average' },
  path_mismatch:    { severity_base: 'medium', description: 'Actual causal path diverged from expected' },
};

// Severity escalation rules
function _severity(type, data) {
  const base = ANOMALY_TYPES[type]?.severity_base || 'medium';
  // Escalate if this session has had prior anomalies
  if ((data.priorAnomalyCount || 0) >= 3) return 'high';
  // Escalate timeout if very late
  if (type === 'timeout' && data.age_ms > (data.timeout_ms || 60000) * 2) return 'high';
  return base;
}

let _jaa = null, _bus = null;
let _anomalyIndex = [];  // in-memory ring (max 200)
let _sessionCounts = new Map(); // sessionId → anomaly count

function init({ jaaDB, bus } = {}) {
  _jaa = jaaDB || null;
  _bus = bus   || null;
  console.log(`[${MODULE_ID}] v${VERSION} ready`);
}

/**
 * classify — take a raw mismatch signal from the Expectation Engine
 * and produce a formal, named, severity-graded anomaly.
 *
 * @param {object} signal — from ExpectationEngine._fireAnomaly()
 * @returns {object} anomaly record
 */
function classify(signal) {
  const { kind, sessionId } = signal;

  // Map expectation engine kinds to anomaly types
  const typeMap = {
    path_mismatch:  'path_mismatch',
    missing_steps:  'missing_event',
    timeout:        'timeout',
    state_violation:'state_violation',
    causal_gap:     'causal_gap',
  };
  const anomalyType = typeMap[kind] || 'unexpected_event';
  const priorCount  = _sessionCounts.get(sessionId) || 0;

  const anomaly = {
    uuid:        crypto.randomUUID(),
    type:        anomalyType,
    kind,        // raw kind from expectation engine
    sessionId,
    severity:    _severity(anomalyType, { ...signal, priorAnomalyCount: priorCount }),
    description: ANOMALY_TYPES[anomalyType]?.description || 'Unknown anomaly',
    signal,      // full raw signal for forensics
    priorAnomalyCount: priorCount,
    ts:          Date.now(),
    source:      MODULE_ID,
    status:      'open',  // open | acknowledged | resolved
    actionTaken: null,    // filled by 71.4 self-healing controller
  };

  // §2.1 — write to JAA before emitting
  if (_jaa) {
    try {
      _jaa.insert('anomaly_log', anomaly);
    } catch(e) {
      console.warn(`[${MODULE_ID}] JAA write failed: ${e.message}`);
    }
  }

  // Update session anomaly count
  _sessionCounts.set(sessionId, priorCount + 1);

  // Ring buffer
  _anomalyIndex.push(anomaly);
  if (_anomalyIndex.length > 200) _anomalyIndex.shift();

  // Emit on bus
  if (_bus?.emit) {
    try { _bus.emit('anomaly.detected', { anomalyUuid: anomaly.uuid, type: anomalyType,
      severity: anomaly.severity, sessionId }); } catch(_) {}
  }

  // Write a gap for high-severity anomalies
  if (anomaly.severity === 'high' && _jaa) {
    try {
      _jaa.insert('gaps', {
        uuid:     crypto.randomUUID(),
        type:     'causal_anomaly',
        path:     `seam/${sessionId}`,
        body:     `[${anomalyType}] ${anomaly.description} — session ${sessionId}: ${JSON.stringify(signal).slice(0, 200)}`,
        severity: 'high',
        status:   'open',
        source:   MODULE_ID,
        ts:       Date.now(),
        meta:     { anomalyUuid: anomaly.uuid, kind, sessionId },
      });
    } catch(_) {}
  }

  console.log(`[${MODULE_ID}] ${anomaly.severity} anomaly: ${anomalyType} in session ${sessionId}`);
  return anomaly;
}

/**
 * resolve — mark an anomaly resolved, record what action was taken.
 * Called by 71.4 Self-Healing Controller.
 */
function resolve(anomalyUuid, actionTaken) {
  const anomaly = _anomalyIndex.find(a => a.uuid === anomalyUuid);
  if (anomaly) {
    anomaly.status      = 'resolved';
    anomaly.actionTaken = actionTaken;
    anomaly.resolvedAt  = Date.now();
    if (_jaa) {
      try { _jaa.update('anomaly_log', anomalyUuid, { status:'resolved', actionTaken, resolvedAt: anomaly.resolvedAt }); }
      catch(_) {}
    }
  }
  return anomaly || null;
}

function recentAnomalies(n = 20) { return _anomalyIndex.slice(-n); }
function openAnomalies() { return _anomalyIndex.filter(a => a.status === 'open'); }
function sessionAnomalies(sessionId) { return _anomalyIndex.filter(a => a.sessionId === sessionId); }

function status() {
  return { version: VERSION, total: _anomalyIndex.length,
    open: openAnomalies().length, types: ANOMALY_TYPES };
}

module.exports = { init, classify, resolve, recentAnomalies, openAnomalies,
  sessionAnomalies, status, ANOMALY_TYPES, MODULE_ID, VERSION };
