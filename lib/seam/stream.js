'use strict';
/**
 * lib/seam/stream.js — SISO primitives for seam chunking
 * UUID: nexus-seam-stream-v1-0000-2026-0705-jamesbrooks-002
 * Version: 1.0.0
 *
 * §REDESIGN 2026-07-05: dispatchSeam.js (warp/dispatch/) was a straight-line
 * async function — registry → classify → axioms → providers → cascade →
 * persist, one fixed order, WARP and Cortex imported directly inside it.
 * That's baked-in and linear, the opposite of what a build-contract chunker
 * is supposed to be here. This file is the backbone of the replacement:
 * the same Event/Gate/Stream shape MOD-SISO already defines and every
 * other subsystem (bridge/router.js, emerge/siso, warp/core) already
 * copies inline rather than sharing a hard dependency on one canonical
 * package — that precedent is followed here on purpose, not reinvented.
 *
 * A Stream has no opinion about what gates get registered. A caller
 * (idearium, guardian, ollama, a UI) builds their own Stream from
 * lib/seam/gates.js's pieces, in whatever combination and order they
 * want — including none of the LLM-dispatch gates at all, if all they
 * want is a live feed of tier classifications for a dashboard.
 *
 * §5.7 — all inter-gate communication is event emission, never a direct
 *        function call between gates.
 * §1.2 — an event with no matching gate lands in `pending`, not an error.
 */

class Event {
  constructor(type, data = {}) {
    this.uuid = require('crypto').randomUUID();
    this.type = type;
    this.data = data;
    this.ts   = Date.now();
  }
}

class Gate {
  constructor(signature) {
    if (!signature) throw new Error('[seam/stream] Gate requires a signature');
    this.signature = signature;
  }
  // eslint-disable-next-line no-unused-vars
  transform(event, stream) {
    throw new Error(`[seam/stream] Gate '${this.signature}' did not implement transform()`);
  }
}

class StreamLog {
  constructor(level = 'EVENTS') {
    this.level   = level;
    this.entries = [];
  }
  record(entry) {
    this.entries.push({ ...entry, ts: Date.now() });
  }
}

class Stream {
  constructor({ log = null } = {}) {
    this.gates    = new Map();
    this.pending  = [];
    this.log      = log;
    this._handlers = new Map(); // type -> [fn] — optional pub/sub for observers
                                 // that want to watch without owning a gate
                                 // (e.g. a UI progress bar).
  }

  register(gate) {
    if (this.gates.has(gate.signature)) {
      throw new Error(`[seam/stream] collision: '${gate.signature}' already registered`);
    }
    this.gates.set(gate.signature, gate);
    return () => this.gates.delete(gate.signature); // unregister handle
  }

  on(type, handler) {
    if (!this._handlers.has(type)) this._handlers.set(type, []);
    this._handlers.get(type).push(handler);
    return () => {
      const arr = this._handlers.get(type) || [];
      const i = arr.indexOf(handler);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  emit(event) {
    this.log?.record({ step: 'emit', type: event.type, uuid: event.uuid });
    for (const handler of this._handlers.get(event.type) || []) {
      try { handler(event); } catch (_) { /* observers never break the stream */ }
    }
    const gate = this.gates.get(event.type);
    if (gate) {
      gate.transform(event, this);
    } else {
      this.pending.push(event); // no gate for this event — not an error,
                                 // just means nothing has claimed it yet.
    }
    return event;
  }

  sampleHere() {
    return { pending: [...this.pending], gateCount: this.gates.size };
  }
}

module.exports = { Event, Gate, Stream, StreamLog };
