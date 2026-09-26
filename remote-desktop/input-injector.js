'use strict';
/**
 * input-injector.js — phase 4 deliverable: host_input_listener_and_injector
 * ("per-OS backend behind one interface"), plus input_rate_limiter_coalescer
 * and view_only_lock_toggle from the same phase.
 *
 * Deliberately knows nothing about tokens, signatures, or replay — that's
 * input-auth.js's job, called by main.js before a frame ever reaches here.
 * This module's only concern is: given an already-trusted event, should it
 * physically happen, and if so, make it happen. Same single-responsibility
 * split as session-token.js (auth) vs signal.js (transport).
 *
 * Event-driven, same as every other module in this project: state changes
 * are emitted (input:injected / input:rejected / input:rate_limited /
 * input:coalesced), not returned for a poller to notice.
 */

const { EventEmitter } = require('events');
const { validate } = require('./contracts');

const ALLOWED_KINDS = new Set(['mousemove', 'click', 'keydown']);
const DEFAULT_RATE_LIMIT = { maxPerSecond: 120 }; // generous — real cap is mousemove coalescing below

// Real per-OS injection is deliberately optional and lazy-loaded. Without
// it (this sandbox has no display and nothing installed), the injector
// still runs its full validate/rate-limit/coalesce/lock pipeline against a
// logging backend — that's what tests/test-input-injector.js exercises.
// Swap in a real backend by installing '@nut-tree/nut-js' (or robotjs) and
// passing { backend: createNutJsBackend() } to createInputInjector().
function loadNativeBackend() {
  try {
    // eslint-disable-next-line global-require
    const nut = require('@nut-tree/nut-js');
    return {
      name: 'nut-js',
      async mousemove(x, y) { await nut.mouse.setPosition({ x, y }); },
      async click(x, y) { await nut.mouse.setPosition({ x, y }); await nut.mouse.leftClick(); },
      async keydown(key) { await nut.keyboard.pressKey(nut.Key[key] ?? key); },
    };
  } catch {
    return null;
  }
}

function loggingBackend() {
  return {
    name: 'logging (no native backend available)',
    async mousemove(x, y) { console.log(`  [inject:noop] mousemove ${x},${y}`); },
    async click(x, y) { console.log(`  [inject:noop] click ${x},${y}`); },
    async keydown(key) { console.log(`  [inject:noop] keydown ${key}`); },
  };
}

function createInputInjector({ backend, rateLimit = DEFAULT_RATE_LIMIT, coalesceMouseMoveMs = 16 } = {}) {
  const bus = new EventEmitter();
  const activeBackend = backend || loadNativeBackend() || loggingBackend();

  let locked = false; // view_only_lock_toggle
  let windowStart = Date.now();
  let countInWindow = 0;
  let pendingMouseMove = null;
  let mouseMoveTimer = null;

  function emit(type, extra = {}) {
    bus.emit(type, { type, ts: Date.now(), ...extra });
  }

  function withinRateLimit() {
    const now = Date.now();
    if (now - windowStart >= 1000) { windowStart = now; countInWindow = 0; }
    countInWindow += 1;
    return countInWindow <= rateLimit.maxPerSecond;
  }

  function setLocked(value) {
    locked = !!value;
    emit('lock:changed', { locked });
  }

  async function applyToBackend(evt) {
    if (evt.kind === 'mousemove') return activeBackend.mousemove(evt.x, evt.y);
    if (evt.kind === 'click') return activeBackend.click(evt.x, evt.y);
    if (evt.kind === 'keydown') return activeBackend.keydown(evt.key);
  }

  async function inject(evt) {
    // shape guard — closes "malformed/out-of-order input frames were unguarded"
    try {
      validate('input-event', evt);
    } catch (e) {
      emit('input:rejected', { reason: 'malformed', detail: e.message });
      return { ok: false, reason: 'malformed' };
    }
    if (!ALLOWED_KINDS.has(evt.kind)) {
      emit('input:rejected', { reason: 'unknown_kind', kind: evt.kind });
      return { ok: false, reason: 'unknown_kind' };
    }
    if ((evt.kind === 'mousemove' || evt.kind === 'click') && (typeof evt.x !== 'number' || typeof evt.y !== 'number')) {
      emit('input:rejected', { reason: 'malformed_coordinates' });
      return { ok: false, reason: 'malformed_coordinates' };
    }
    if (evt.kind === 'keydown' && typeof evt.key !== 'string') {
      emit('input:rejected', { reason: 'malformed_key' });
      return { ok: false, reason: 'malformed_key' };
    }

    if (locked) {
      emit('input:rejected', { reason: 'view_only_locked', kind: evt.kind });
      return { ok: false, reason: 'view_only_locked' };
    }

    // mousemove coalescing happens BEFORE the rate limiter, not after — the
    // whole point of coalescing is that a burst of mousemoves never reaches
    // the limiter as individual events, so it can't starve out a click or
    // keydown that arrives in the same window. A real drag can produce
    // hundreds of mousemove frames/sec; only the latest position in each
    // short window actually reaches the backend.
    if (evt.kind === 'mousemove') {
      pendingMouseMove = evt;
      if (!mouseMoveTimer) {
        mouseMoveTimer = setTimeout(async () => {
          const toApply = pendingMouseMove;
          pendingMouseMove = null;
          mouseMoveTimer = null;
          if (toApply) {
            await applyToBackend(toApply);
            emit('input:injected', { kind: 'mousemove', x: toApply.x, y: toApply.y, coalesced: true });
          }
        }, coalesceMouseMoveMs);
        mouseMoveTimer.unref?.();
      } else {
        emit('input:coalesced', { kind: 'mousemove' });
      }
      return { ok: true, coalesced: true };
    }

    if (!withinRateLimit()) {
      emit('input:rate_limited', { kind: evt.kind });
      return { ok: false, reason: 'rate_limited' };
    }

    await applyToBackend(evt);
    emit('input:injected', { kind: evt.kind });
    return { ok: true };
  }

  return {
    inject,
    setLocked,
    isLocked: () => locked,
    backendName: () => activeBackend.name,
    on: bus.on.bind(bus),
  };
}

module.exports = { createInputInjector, loggingBackend };
