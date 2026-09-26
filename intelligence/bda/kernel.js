'use strict';

/**
 * BDA Kernel
 * Behavioral Drift Analyzer — core runtime.
 *
 * Composes: signal extractor, pendulum engine, gap detector, ledger.
 * Maintains per-role observation history.
 * Emits drift events to registered listeners.
 *
 * Usage:
 *   const kernel = require('./kernel');
 *   kernel.init({ ledgerPath: './bda.ledger' });
 *   const result = kernel.observe({ role: 'user', text: '...', ts: Date.now() });
 *   kernel.on('drift', event => { ... });
 */

const signals  = require('./signals');
const pendulum = require('./pendulum');
const gaps     = require('./gaps');
const ledger   = require('./ledger');

const SIGNAL_KEYS = pendulum.SIGNAL_KEYS;

let _ledger    = null;
let _listeners = {};
let _state     = {
  user:      { observations: [], pendulum: null, lastGaps: [] },
  assistant: { observations: [], pendulum: null, lastGaps: [] },
  composite: { pendulum: null },
  sessionId: null,
  startedAt: null,
};

// ── Init ─────────────────────────────────────────────────────────────────────

function init({ ledgerPath } = {}) {
  _ledger = ledger.create(ledgerPath || null);
  _state.sessionId = _genId();
  _state.startedAt = Date.now();

  // Replay ledger into state
  const entries = _ledger.all();
  for (const entry of entries) {
    if (entry.type === 'OBSERVE' && (entry.role === 'user' || entry.role === 'assistant')) {
      _state[entry.role].observations.push({
        signals: entry.data.signals,
        ts:      entry.ts,
        text:    entry.data.text,
        id:      entry.data.id,
      });
    }
    if (entry.type === 'OBSERVE_SIGNAL') {
      if (!_state[entry.role]) _state[entry.role] = { observations: [], pendulum: null, lastGaps: [] };
      _state[entry.role].observations.push({
        signals: entry.data.signals,
        ts:      entry.ts,
        text:    null,
        meta:    entry.data.meta || null,
        id:      entry.data.id,
      });
    }
  }

  // Recompute pendulum from replayed observations
  if (_state.user.observations.length > 0) {
    _state.user.pendulum = pendulum.compute(_state.user.observations);
  }
  if (_state.assistant.observations.length > 0) {
    _state.assistant.pendulum = pendulum.compute(_state.assistant.observations);
  }
  if (_state.reflection?.observations.length > 0) {
    _state.reflection.pendulum = pendulum.compute(_state.reflection.observations);
  }
  _recomputeComposite();

  _ledger.append('SESSION', 'system', {
    sessionId: _state.sessionId,
    action: 'start',
    replayedEntries: entries.length,
  });

  console.log(`[kernel] initialized. ledger: ${_ledger.summary().entries} entries`);
  return state();
}

// ── Observe ───────────────────────────────────────────────────────────────────

function observe({ role, text, ts }) {
  if (!_ledger) throw new Error('KERNEL: call init() first');
  if (role !== 'user' && role !== 'assistant') throw new Error(`KERNEL: invalid role "${role}"`);
  if (!text || !text.trim()) return null;

  const id       = _genId();
  const now      = ts || Date.now();
  const extracted = signals.extract(text, role);
  const detected  = gaps.detect(text, extracted, role);

  const observation = { signals: extracted, ts: now, text, id };
  _state[role].observations.push(observation);

  // Recompute pendulum for this role
  const prevRegime = _state[role].pendulum?.regime || null;
  _state[role].pendulum = pendulum.compute(_state[role].observations);
  _state[role].lastGaps = detected;

  // Recompute composite
  _recomputeComposite();

  // Detect regime transition
  const newRegime  = _state[role].pendulum.regime;
  const transition = prevRegime && prevRegime !== newRegime
    ? { from: prevRegime, to: newRegime }
    : null;

  // Write to ledger
  const entry = _ledger.append('OBSERVE', role, {
    id,
    text: text.slice(0, 500), // cap stored text
    signals: extracted,
    pendulum: _state[role].pendulum,
    gaps: detected,
    transition,
  });

  if (transition) {
    _ledger.append('REGIME', role, {
      from: transition.from,
      to:   transition.to,
      sigma: _state[role].pendulum.sigma,
      delta: _state[role].pendulum.delta,
    });
  }

  // Build event
  const event = {
    seq:        entry.seq,
    ts:         now,
    id,
    role,
    signals:    extracted,
    pendulum:   _state[role].pendulum,
    gaps:       detected,
    transition,
    composite:  _state.composite.pendulum,
    ledger:     _ledger.summary(),
  };

  _emit('drift', event);
  if (transition) _emit('regime', { role, ...transition, pendulum: _state[role].pendulum });
  if (detected.some(g => g.score >= 0.85)) _emit('alert', { role, gaps: detected.filter(g => g.score >= 0.85) });

  return event;
}

// ── Observe (pre-computed signal) ──────────────────────────────────────────────
// Phase 11 (reflection.js) bridge: satisfaction scores and other numeric
// behavioral signals don't originate as text — there is no sentence to run
// through signals.extract(). Faking a string through that pipeline to back
// into a number would corrupt the role's observation history with synthetic
// text. This entrypoint takes signals directly instead.
//
// 'reflection' is accepted as a third role alongside 'user'/'assistant' —
// it represents the system's own evaluation of its decisions, not a
// conversational turn, and is tracked as its own pendulum series so it never
// pollutes user/assistant regime detection.
//
// signals: partial { valence, certainty, openness, tension, selfref } — any
// omitted key defaults to the same neutral baseline observe() uses for empty
// text (0.5 for valence/certainty/openness, 0 for tension/selfref).
function observeSignal({ role, signals, ts, meta }) {
  if (!_ledger) throw new Error('KERNEL: call init() first');
  if (role !== 'user' && role !== 'assistant' && role !== 'reflection') {
    throw new Error(`KERNEL: invalid role "${role}"`);
  }
  if (!signals || typeof signals !== 'object') {
    throw new Error('KERNEL: observeSignal requires a signals object');
  }

  if (!_state[role]) _state[role] = { observations: [], pendulum: null, lastGaps: [] };

  const id  = _genId();
  const now = ts || Date.now();
  const merged = {
    valence:   signals.valence   ?? 0.5,
    certainty: signals.certainty ?? 0.5,
    openness:  signals.openness  ?? 0.5,
    tension:   signals.tension   ?? 0,
    selfref:   signals.selfref   ?? 0,
  };

  const observation = { signals: merged, ts: now, text: null, meta: meta || null, id };
  _state[role].observations.push(observation);

  const prevRegime = _state[role].pendulum?.regime || null;
  _state[role].pendulum = pendulum.compute(_state[role].observations);

  _recomputeComposite();

  const newRegime  = _state[role].pendulum.regime;
  const transition = prevRegime && prevRegime !== newRegime
    ? { from: prevRegime, to: newRegime }
    : null;

  _ledger.append('OBSERVE_SIGNAL', role, { id, signals: merged, meta: meta || null, pendulum: _state[role].pendulum, transition });
  if (transition) {
    _ledger.append('REGIME', role, { from: transition.from, to: transition.to, sigma: _state[role].pendulum.sigma, delta: _state[role].pendulum.delta });
  }

  const event = {
    seq: null, ts: now, id, role,
    signals: merged, pendulum: _state[role].pendulum, transition,
    composite: _state.composite.pendulum,
    ledger: _ledger.summary(),
  };

  _emit('drift', event);
  if (transition) _emit('regime', { role, ...transition, pendulum: _state[role].pendulum });

  return event;
}

// ── Composite ─────────────────────────────────────────────────────────────────

function _recomputeComposite() {
  const all = [
    ..._state.user.observations,
    ..._state.assistant.observations,
  ].sort((a, b) => a.ts - b.ts);

  if (all.length >= 2) {
    _state.composite.pendulum = pendulum.compute(all);
  }
}

// ── State ─────────────────────────────────────────────────────────────────────

function state() {
  return {
    sessionId:  _state.sessionId,
    startedAt:  _state.startedAt,
    user: {
      n:         _state.user.observations.length,
      pendulum:  _state.user.pendulum,
      lastGaps:  _state.user.lastGaps,
      last5:     _state.user.observations.slice(-5).map(o => ({
        ts: o.ts, signals: o.signals, id: o.id,
        preview: o.text ? o.text.slice(0, 80) : null,
      })),
    },
    assistant: {
      n:         _state.assistant.observations.length,
      pendulum:  _state.assistant.pendulum,
      lastGaps:  _state.assistant.lastGaps,
      last5:     _state.assistant.observations.slice(-5).map(o => ({
        ts: o.ts, signals: o.signals, id: o.id,
        preview: o.text ? o.text.slice(0, 80) : null,
      })),
    },
    reflection: _state.reflection ? {
      n:         _state.reflection.observations.length,
      pendulum:  _state.reflection.pendulum,
      last5:     _state.reflection.observations.slice(-5).map(o => ({
        ts: o.ts, signals: o.signals, id: o.id, meta: o.meta || null,
      })),
    } : { n: 0, pendulum: null, last5: [] },
    composite: {
      pendulum: _state.composite.pendulum,
    },
    ledger: _ledger ? _ledger.summary() : null,
  };
}

// ── Event emitter ─────────────────────────────────────────────────────────────

function on(event, fn) {
  if (!_listeners[event]) _listeners[event] = [];
  _listeners[event].push(fn);
  return () => { _listeners[event] = _listeners[event].filter(f => f !== fn); };
}

function _emit(event, data) {
  const fns = _listeners[event] || [];
  for (const fn of fns) {
    try {
      fn(data);
    } catch (err) {
      // Never crash the kernel on a listener error — but never hide it either.
      // Log the event name + full stack so the broken listener is traceable.
      console.error(`[kernel] listener error on event "${event}": ${err.message}`);
      console.error(err.stack);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const _crypto = require('crypto');

function _genId() {
  // Buffer.toString() takes an encoding — NOT a radix.
  // Passing 36 caused ERR_UNKNOWN_ENCODING. Fixed: hex.
  return _crypto.randomBytes(8).toString('hex');
}

function getLedger() { return _ledger; }
function getState()  { return _state;  }

module.exports = { init, observe, observeSignal, state, on, getLedger, getState };
