'use strict';
/**
 * lib/meta/bda/index.js — Behavioral Drift Analyzer (BDA)
 * UUID: nexus-bda-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * Ported from BDA standalone system. Composes:
 *   signals  — 5-signal extractor (valence/certainty/openness/tension/selfref)
 *   pendulum — behavioral drift metrics + regime classification
 *              STABLE→ACTIVATING→OSCILLATING→UNGROUNDED→DYSREGULATED→COLLAPSING
 *   gaps     — 12 named gap patterns (Liminal-compatible)
 *   ledger   — append-only SHA-256 hash-linked observation ledger
 *   kernel   — runtime that composes all four, per-role state machine
 *
 * In NEXUS context: observes AI dispatch sessions, user interactions,
 * and system event streams. Emits drift events when behavioral regime shifts.
 *
 * Usage:
 *   const { BDAKernel } = require('./lib/meta/bda');
 *   const bda = new BDAKernel();
 *   const result = bda.observe({ role: 'user', text: '...' });
 *   bda.on('drift', event => console.log(event.pendulum.regime));
 */

const signals  = require('./signals');
const pendulum = require('./pendulum');
const gaps     = require('./gaps');
const ledger   = require('./ledger');

// ── BDAKernel — composable wrapper for NEXUS integration ─────────────────────
class BDAKernel {
  constructor({ ledgerPath = null } = {}) {
    this._ledger    = ledger.create(ledgerPath);
    this._state     = {
      user:      { observations: [], pendulum: null, lastGaps: [] },
      assistant: { observations: [], pendulum: null, lastGaps: [] },
      composite: { pendulum: null },
      sessionId: _genId(),
      startedAt: Date.now(),
    };
    this._listeners = { drift: [], regime: [], alert: [], gap: [] };
  }

  observe({ role, text, ts = Date.now() }) {
    if (role !== 'user' && role !== 'assistant') return null;
    if (!text || !text.trim()) return null;

    const extracted = signals.extract(text, role);
    const detectedGaps = gaps.detect(text, role);
    const id = _genId();

    this._state[role].observations.push({ signals: extracted, ts, text, id });
    if (this._state[role].observations.length > 200) this._state[role].observations.shift();

    const prev = this._state[role].pendulum;
    this._state[role].pendulum = pendulum.compute(this._state[role].observations);
    this._state[role].lastGaps = detectedGaps;

    const curr = this._state[role].pendulum;

    // Regime change event
    if (prev && curr && prev.regime !== curr.regime) {
      const ev = { type: 'regime', role, prev: prev.regime, curr: curr.regime, pendulum: curr, ts };
      this._emit('regime', ev);
      if (['DYSREGULATED','COLLAPSING'].includes(curr.regime))
        this._emit('alert', { type: 'alert', role, regime: curr.regime, pendulum: curr, ts });
    }

    // Drift event on significant sigma change
    if (prev && curr && Math.abs(curr.sigma - prev.sigma) > 0.08) {
      this._emit('drift', { type: 'drift', role, pendulum: curr, signals: extracted, gapCount: detectedGaps.length, ts });
    }

    // Gap events
    for (const gap of detectedGaps) {
      if (gap.crit >= 0.85) this._emit('gap', { type: 'gap', role, gap, ts });
    }

    this._ledger.append('OBSERVE', role, { id, text: text.slice(0, 200), signals: extracted, gaps: detectedGaps.length });

    return { role, signals: extracted, pendulum: curr, gaps: detectedGaps, id };
  }

  on(event, fn) {
    if (this._listeners[event]) this._listeners[event].push(fn);
    return this;
  }

  _emit(event, payload) {
    (this._listeners[event] || []).forEach(fn => { try { fn(payload); } catch(_) {} });
  }

  state() {
    return {
      user:      { pendulum: this._state.user.pendulum,      gapCount: this._state.user.lastGaps.length,      n: this._state.user.observations.length },
      assistant: { pendulum: this._state.assistant.pendulum, gapCount: this._state.assistant.lastGaps.length, n: this._state.assistant.observations.length },
      sessionId: this._state.sessionId,
      startedAt: this._state.startedAt,
    };
  }

  reset() {
    this._state.user      = { observations: [], pendulum: null, lastGaps: [] };
    this._state.assistant = { observations: [], pendulum: null, lastGaps: [] };
    this._state.sessionId = _genId();
    this._state.startedAt = Date.now();
  }
}

function _genId() { return require('crypto').randomBytes(4).toString('hex'); }

module.exports = {
  BDAKernel,
  // Low-level exports for direct use
  extract:  signals.extract,
  compute:  pendulum.compute,
  detect:   gaps.detect,
  REGIMES:  pendulum.REGIMES,
  REGIME_TRUST: pendulum.REGIME_TRUST,
  MODULE_ID: 'bda',
  VERSION:   '1.0.0',
};
