'use strict';
/**
 * src/core/bus.js — Clear Glass Central SISO Bus
 * UUID: cg-core-bus-v1-0000-0000-000000000002
 *
 * The single Stream that owns all Clear Glass events.
 * Every system (driver, dom, fingerprint, cookies, copilot, mesh)
 * emits Events here. Gates transform them. SSE picks up residue.
 *
 * Architecture: →E→E→
 * Code → emit(Event) → Gate transforms → SSE broadcasts
 * Nothing bypasses the bus. No direct module-to-module calls except
 * through registered gates.
 */

const { Stream, StreamLog, Event, Gate } = require('../../siso/index');

// ── Singleton bus ──────────────────────────────────────────────────────────
let _bus = null;
let _log = null;

function createBus(logLevel = 'EVENTS') {
  if (_bus) throw new Error('[CG/Bus] Already created — call getBus()');
  _log = new StreamLog(logLevel);
  _bus = new Stream({ log: _log });
  return _bus;
}

function getBus() {
  if (!_bus) throw new Error('[CG/Bus] Not created yet — call createBus() first');
  return _bus;
}

function getLog() { return _log; }

// ── Convenience emitter — wraps Event construction ─────────────────────────
function emit(type, data = {}) {
  getBus().emit(new Event(type, data));
}

// ── Subscribe shorthand ────────────────────────────────────────────────────
function on(type, fn) { return getBus().on(type, fn); }
// §FIX 2026-09-03 — off() exists on the real Stream class (siso/index.js)
// but was never re-exported here, unlike on()/emit(). Confirmed by grep
// before adding this. Needed for downloads/intake-bridge.js's
// install().detach().
function off(type, fn) { return getBus().off(type, fn); }

module.exports = { createBus, getBus, getLog, emit, on, off, Event, Gate, Stream, StreamLog };
