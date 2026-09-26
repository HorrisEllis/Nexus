'use strict';
/**
 * nexus-cfr-influence.js — CFR Field → System Behavior Influence
 * UUID: nexus-cfr-influence-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * THE FIELD AS GOVERNOR.
 *
 * CFR (Constraint Field Resonance) currently captures system state.
 * This module makes it ACT on system behavior.
 *
 * Rules:
 *   if field.tension > 0.7     → raise routing sigma requirements (SNR floor ↑)
 *   if field.coherence < 0.4   → trigger diagnostic scan
 *   if field.friction > 0.8    → throttle Guardian dispatch rate
 *   if field.entropy > 0.85    → emit nexus.cfr.chaos_threshold to bus
 *   if field.resonance > 0.9   → accelerate Versionium commit interval
 *
 * §CF  No engine consumes raw meaning — field state is the input, not text
 * §1.2 Every influence decision is logged to event_log
 */

const http = require('http');

let _bus      = null; // nexus-bus reference (optional)
let _field    = null; // current CFR field state
let _interval = null;
let _cfg      = {};

// ── Thresholds ────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  tension_high:     0.70,  // raise sigma floor
  tension_critical: 0.85,  // halt non-critical dispatches
  coherence_low:    0.40,  // trigger diagnostic
  friction_high:    0.80,  // throttle guardian
  entropy_chaos:    0.85,  // broadcast chaos alert
  resonance_peak:   0.90,  // accelerate versionium
};

// ── Current influence state ───────────────────────────────────────────────────

const state = {
  sigmaFloor:         0,
  guardianThrottled:  false,
  diagnosticScheduled:false,
  chaosBroadcast:     false,
  versioniumAccel:    false,
  lastField:          null,
  lastInfluenceAt:    0,
};

// ── Emit to nexus event bus ───────────────────────────────────────────────────

function _emit(type, payload) {
  if (_bus) {
    _bus.emit(type, payload, { source: 'cfr-influence' });
    return;
  }
  // Direct relay if bus not available
  const body = JSON.stringify({ type, payload, source: 'cfr-influence', ts: Date.now() });
  const req = http.request({
    hostname: '127.0.0.1', port: 3748, path: '/api/event',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, () => {});
  req.on('error', () => {});
  req.write(body); req.end();
}

// ── Core influence engine ─────────────────────────────────────────────────────

function influence(field) {
  if (!field) return;
  _field = field;
  state.lastField    = field;
  state.lastInfluenceAt = Date.now();

  const { tension, coherence, friction, entropy, resonance } = field;
  const changes = [];

  // ── Tension → SNR floor ────────────────────────────────────────────────────
  if (typeof tension === 'number') {
    if (tension > THRESHOLDS.tension_critical) {
      const newFloor = 0.70; // require higher SNR when critically tense
      if (state.sigmaFloor !== newFloor) {
        state.sigmaFloor = newFloor;
        changes.push({ axis: 'tension', action: 'snr_floor', value: newFloor, reason: `tension=${tension.toFixed(2)} > ${THRESHOLDS.tension_critical}` });
        _emit('cfr.influence.snr_floor_raised', { floor: newFloor, tension });
        if (_bus) _bus.setSigmaFloor(newFloor);
      }
    } else if (tension > THRESHOLDS.tension_high) {
      const newFloor = 0.50;
      if (state.sigmaFloor !== newFloor) {
        state.sigmaFloor = newFloor;
        changes.push({ axis: 'tension', action: 'snr_floor_moderate', value: newFloor });
        _emit('cfr.influence.snr_floor_raised', { floor: newFloor, tension });
        if (_bus) _bus.setSigmaFloor(newFloor);
      }
    } else if (state.sigmaFloor > 0) {
      state.sigmaFloor = 0;
      if (_bus) _bus.setSigmaFloor(0);
      _emit('cfr.influence.snr_floor_cleared', { tension });
    }
  }

  // ── Coherence → diagnostic ─────────────────────────────────────────────────
  if (coherence < THRESHOLDS.coherence_low && !state.diagnosticScheduled) {
    state.diagnosticScheduled = true;
    changes.push({ axis: 'coherence', action: 'trigger_diagnostic', value: coherence });
    _emit('cfr.influence.diagnostic_requested', {
      reason: `coherence=${coherence.toFixed(2)} < ${THRESHOLDS.coherence_low}`,
      coherence,
    });
    // Schedule reset
    setTimeout(() => { state.diagnosticScheduled = false; }, 30000);
  } else if (coherence >= THRESHOLDS.coherence_low) {
    state.diagnosticScheduled = false;
  }

  // ── Friction → guardian throttle ───────────────────────────────────────────
  if (friction > THRESHOLDS.friction_high && !state.guardianThrottled) {
    state.guardianThrottled = true;
    changes.push({ axis: 'friction', action: 'throttle_guardian', value: friction });
    _emit('cfr.influence.guardian_throttled', {
      reason: `friction=${friction.toFixed(2)} > ${THRESHOLDS.friction_high}`,
    });
  } else if (friction <= THRESHOLDS.friction_high && state.guardianThrottled) {
    state.guardianThrottled = false;
    _emit('cfr.influence.guardian_unthrottled', { friction });
  }

  // ── Entropy → chaos threshold ──────────────────────────────────────────────
  if (entropy > THRESHOLDS.entropy_chaos && !state.chaosBroadcast) {
    state.chaosBroadcast = true;
    changes.push({ axis: 'entropy', action: 'chaos_alert', value: entropy });
    _emit('nexus.cfr.chaos_threshold', {
      entropy,
      field,
      message: `System entropy ${entropy.toFixed(2)} exceeds chaos threshold — diagnostic required`,
    });
  } else if (entropy <= THRESHOLDS.entropy_chaos) {
    state.chaosBroadcast = false;
  }

  // ── Resonance → versionium acceleration ────────────────────────────────────
  if (resonance > THRESHOLDS.resonance_peak && !state.versioniumAccel) {
    state.versioniumAccel = true;
    changes.push({ axis: 'resonance', action: 'accelerate_versionium', value: resonance });
    _emit('cfr.influence.versionium_accelerated', {
      reason: `resonance=${resonance.toFixed(2)} > ${THRESHOLDS.resonance_peak}`,
    });
  } else if (resonance <= THRESHOLDS.resonance_peak) {
    state.versioniumAccel = false;
  }

  if (changes.length > 0) {
    _emit('cfr.influence.applied', { changes, field: { tension, coherence, friction, entropy, resonance } });
  }

  return { state: { ...state }, changes };
}

// ── Init — poll bridge CFR SSE ────────────────────────────────────────────────

function init({ bus, pollMs = 5000 } = {}) {
  _bus = bus;
  _cfg = { pollMs };

  // Poll bridge CFR endpoint
  _interval = setInterval(() => _pollCFR(), pollMs);
  _interval.unref();

  console.log('[cfr-influence] watching field state');
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

let _lastErrLogged = null;
function _logOnce(key, msg) {
  if (_lastErrLogged === key) return; // already told you, don't repeat every poll
  _lastErrLogged = key;
  console.error(msg);
}
function _clearErrLog() { _lastErrLogged = null; }

function _pollCFR() {
  // §FIXED 2026-07-13 — "missing/non-numeric field(s): tension" in every
  // boot log, every session, never chased until checked directly. This
  // was polling 127.0.0.1:9999 (Bridge's port) — confirmed Bridge has no
  // /cfr/field route at all, checked directly, not assumed. Cortex (3748)
  // is where /cfr/field actually lives, with a real numeric tension field
  // in its default state (_field.tension = 0.1, cortex/boot.js). Not a
  // field-naming bug, not a cortex bug — a wrong port, the whole time.
  const req = http.request({
    hostname: '127.0.0.1', port: parseInt(process.env.ORCHESTRATOR_PORT || '9000', 10), path: '/cfr/field',
    method: 'GET', headers: { 'Accept': 'application/json' },
  }, res => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      let field;
      try {
        const d = JSON.parse(body);
        field = d.field || d.state || d;
      } catch (e) {
        _logOnce('parse', `[cfr-influence] failed to parse /cfr/field response: ${e.message}`);
        return;
      }
      // §1.2 nothing silent — validate the whole shape influence() actually reads,
      // not just `tension`. A field missing coherence/friction/entropy/resonance
      // used to throw deep inside influence() and get swallowed by an empty catch.
      // 2026-09-19: `tension` is NOT required. No CFR field dimension is called tension (the ledger's
      // field is coherence/friction/resonance/entropy); the value cortex used to relay was its own
      // hardcoded default 0.1, so the tension branches below never fired. Absent = branches skipped.
      const required = ['coherence', 'friction', 'entropy', 'resonance'];
      const missing = required.filter(k => typeof field?.[k] !== 'number');
      if (missing.length) {
        _logOnce('shape', `[cfr-influence] /cfr/field response missing/non-numeric field(s): ${missing.join(', ')} — skipping this poll`);
        return;
      }
      try {
        influence(field);
        _clearErrLog(); // healthy poll — reset suppression so a future failure logs again
      } catch (e) {
        // Previously: catch(_) {} — silently swallowed. This is exactly the
        // axiom §1.2 violation it warns against: a failing influence() pass
        // means sigma floor / guardian throttle / chaos alerts can silently
        // stop updating with zero visibility.
        _logOnce('influence', `[cfr-influence] influence() threw: ${e.message}`);
      }
    });
  });
  req.setTimeout(2000, () => req.destroy());
  req.on('error', (e) => { _logOnce('conn', `[cfr-influence] /cfr/field request failed: ${e.message} (will keep retrying every poll, logged once until it recovers)`); });
  req.end();
}

// ── Expose state ──────────────────────────────────────────────────────────────

function getState()     { return { ...state, field: _field }; }
function getSigmaFloor(){ return state.sigmaFloor; }
function isThrottled()  { return state.guardianThrottled; }

module.exports = { init, stop, influence, getState, getSigmaFloor, isThrottled, THRESHOLDS };
