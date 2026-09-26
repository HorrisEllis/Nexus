'use strict';
/**
 * lib/meta/alk-perception/index.js — ALK Perception Layer (CJS wrapper)
 * UUID: nexus-alk-perception-v1-0000-4000-0000-000000000001
 *
 * Associative Lattice Kernel — cross-stream behavioral signal integrator.
 * Maps parallel observation streams to composite behavioral states.
 *
 * In NEXUS context, "streams" are:
 *   - AI response patterns (text, structure, timing)
 *   - System health metrics (sigma, friction, tension per system)
 *   - User session signals (dispatch rate, gap rate, heal rate)
 *
 * Composite states emitted:
 *   COGNITIVE_LOAD    — system struggling (high gaps + high friction + low coherence)
 *   GENUINE_FLOW      — system performing well (artifacts ↑, gaps ↓, tension stable)
 *   CONCEALMENT       — AI suppressing output (truncation + low sigma + short responses)
 *   STRESS_ACUTE      — multiple systems degrading simultaneously
 *   SOCIAL_MASK       — guardian online but not producing artifacts (appearing to work)
 *   GENUINE_ENGAGEMENT— dispatcher active, artifacts landing, gaps self-resolving
 *
 * §1.1 All outputs are signals, not diagnoses.
 * §5.5 No external dependencies.
 */

const MODULE_ID = 'alk-perception';
const VERSION   = '1.0.0';

function r4(v) { return Math.round((v??0)*10000)/10000; }

// ── Composite state definitions ───────────────────────────────────────────────
const STATES = {
  COGNITIVE_LOAD: {
    description: 'System struggling — high gaps, high friction, low coherence',
    signals:     ['gap_rate_high', 'friction_high', 'coherence_low'],
    threshold:   2,
    severity:    'elevated',
  },
  GENUINE_FLOW: {
    description: 'System performing — artifacts landing, gaps resolving, tension stable',
    signals:     ['artifact_rate_high', 'gap_rate_low', 'tension_stable'],
    threshold:   2,
    severity:    'positive',
  },
  CONCEALMENT: {
    description: 'AI suppressing output — truncation detected, low diversity, short responses',
    signals:     ['truncation_detected', 'response_short', 'sigma_low'],
    threshold:   2,
    severity:    'high',
  },
  STRESS_ACUTE: {
    description: 'Multiple systems degrading simultaneously',
    signals:     ['systems_offline', 'tension_critical', 'heal_failing'],
    threshold:   2,
    severity:    'critical',
  },
  SOCIAL_MASK: {
    description: 'Guardian online but not producing — appearing to work without output',
    signals:     ['guardian_online', 'artifact_rate_low', 'dispatch_active'],
    threshold:   3,
    severity:    'medium',
  },
  GENUINE_ENGAGEMENT: {
    description: 'Active productive session — dispatcher active, artifacts landing',
    signals:     ['dispatch_active', 'artifact_rate_high', 'gap_rate_stable'],
    threshold:   2,
    severity:    'positive',
  },
};

// ── Signal extraction from NEXUS telemetry ────────────────────────────────────
function extractSignals(telemetry) {
  const {
    gapCount = 0, gapRate = 0,
    artifactCount = 0, artifactRate = 0,
    friction = 0, coherence = 0.5, tension = 0,
    systemsOnline = 8, systemsTotal = 8,
    dispatchCount = 0, healFailed = 0,
    truncationRate = 0, responseLength = 500,
    sigmaScore = 0,
  } = telemetry;

  const active = new Set();

  if (gapRate > 0.3 || gapCount > 5)            active.add('gap_rate_high');
  if (gapRate < 0.1 && gapCount < 2)             active.add('gap_rate_low');
  if (gapRate >= 0.1 && gapRate <= 0.3)          active.add('gap_rate_stable');
  if (friction > 0.6)                            active.add('friction_high');
  if (coherence < 0.3)                           active.add('coherence_low');
  if (artifactRate > 0.5 || artifactCount > 2)   active.add('artifact_rate_high');
  if (artifactRate < 0.1 && artifactCount === 0) active.add('artifact_rate_low');
  if (Math.abs(tension - 0.5) < 0.15)            active.add('tension_stable');
  if (tension > 1.5)                             active.add('tension_critical');
  if (systemsOnline < systemsTotal * 0.7)        active.add('systems_offline');
  if (healFailed > 2)                            active.add('heal_failing');
  if (dispatchCount > 0)                         active.add('dispatch_active');
  if (truncationRate > 0.3)                      active.add('truncation_detected');
  if (responseLength < 100)                      active.add('response_short');
  if (sigmaScore < 0.2)                          active.add('sigma_low');
  if (systemsOnline > 0)                         active.add('guardian_online');

  return active;
}

// ── Composite state scoring ───────────────────────────────────────────────────
function classify(telemetry) {
  const activeSignals = extractSignals(telemetry);
  const results = [];

  for (const [name, def] of Object.entries(STATES)) {
    const matched = def.signals.filter(s => activeSignals.has(s));
    if (matched.length >= def.threshold) {
      const confidence = r4(matched.length / def.signals.length);
      results.push({ state:name, description:def.description, severity:def.severity, confidence, matched });
    }
  }

  results.sort((a,b) => b.confidence - a.confidence);
  return {
    dominant: results[0] || null,
    active:   results,
    signals:  [...activeSignals],
    ts:       Date.now(),
  };
}

// ── History-based pattern detection ──────────────────────────────────────────
class ALKPerceptionKernel {
  constructor({ windowSize = 20 } = {}) {
    this._window = windowSize;
    this._history = [];
    this._stateHistory = [];
  }

  feed(telemetry) {
    const result = classify(telemetry);
    this._history.push(telemetry);
    this._stateHistory.push(result.dominant?.state || 'UNKNOWN');
    if (this._history.length > this._window) { this._history.shift(); this._stateHistory.shift(); }

    // Detect oscillation between states
    const osc = this._detectOscillation();

    return { ...result, oscillation: osc };
  }

  _detectOscillation() {
    if (this._stateHistory.length < 4) return null;
    const recent = this._stateHistory.slice(-6);
    const unique = new Set(recent);
    if (unique.size >= 3 && recent.length >= 4) {
      return { detected: true, states: [...unique], description: 'System oscillating between ' + [...unique].join(' ↔ ') };
    }
    return null;
  }

  history() { return [...this._history]; }
  stateHistory() { return [...this._stateHistory]; }
}

module.exports = { classify, extractSignals, ALKPerceptionKernel, STATES, MODULE_ID, VERSION };
