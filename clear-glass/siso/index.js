'use strict';
/**
 * siso/index.js — Clear Glass SISO Core (CJS)
 * UUID: cg-siso-core-v1-0000-0000-000000000001
 *
 * Jonathan Bailey's SISO primitives ported to CJS for Electron/Node.
 * Extended per NEXUS axioms:
 *   §1.2 nothing silently fails — hard errors on bad input
 *   §5.1 UUID on everything
 *   §2.3 all state observable
 *
 * The model: →E→E→
 * Every computation is a stream of events flowing through gates.
 * Gate recognizes one event type. O(1) lookup. Depth-first synchronous.
 * Signature collision = hard error, not silent precedence bug.
 */

const crypto = require('crypto');
const uid = () => crypto.randomUUID ? crypto.randomUUID() : require('crypto').randomUUID();

// ── Event ──────────────────────────────────────────────────────────────────
class Event {
  constructor(type, data = {}) {
    if (!type || typeof type !== 'string')
      throw new Error('[SISO/Event §1.2] type must be a non-empty string');
    this.uuid = uid();
    this.type = type;
    this.data = Object.freeze({ ...data }); // immutable
    this.ts   = Date.now();
  }
  toJSON() {
    return { uuid: this.uuid, type: this.type, data: this.data, ts: this.ts };
  }
}

// ── Gate ───────────────────────────────────────────────────────────────────
class Gate {
  constructor(signature) {
    if (!signature || typeof signature !== 'string')
      throw new Error('[SISO/Gate §1.2] signature must be a non-empty string');
    this.signature = signature;
  }
  // Override in subclass. May call stream.emit() zero or more times.
  transform(event, stream) {}
}

// ── StreamLog ──────────────────────────────────────────────────────────────
const LOG_LEVELS = { OFF: 0, EVENTS: 1, DEEP: 2, DATA: 3 };
let _streamIdCounter = 0;

class StreamLog {
  constructor(level = 'EVENTS') {
    this.level = level;
    this._data = [];
    this.seq   = 0;
  }
  nextStreamId() { return ++_streamIdCounter; }
  record({ streamId, parentStreamId, eventType, gateClaimed, eventData }) {
    const lvl = LOG_LEVELS[this.level] || 0;
    if (lvl === 0) return;
    const entry = { seq: this.seq++, time: Date.now(), type: eventType, claimed: gateClaimed };
    if (lvl >= 2) { entry.streamId = streamId; if (parentStreamId != null) entry.parentStreamId = parentStreamId; }
    if (lvl >= 3) entry.data = eventData;
    this._data.push(entry);
    if (this._data.length > 5000) this._data.shift(); // §2.1 bounded memory
  }
  sample()         { return { level: this.level, count: this._data.length, entries: [...this._data] }; }
  entries(n = 100) { return this._data.slice(-n); }
  clear()          { this._data = []; this.seq = 0; }
}

// ── Stream ─────────────────────────────────────────────────────────────────
class Stream {
  constructor({ log = null, parentStreamId = null } = {}) {
    this.gates         = new Map();
    this.pending       = [];
    this.eventCount    = 0;
    this.log           = log;
    this.streamId      = log ? log.nextStreamId() : null;
    this.parentStreamId = parentStreamId;
    this._subs         = new Map(); // pub/sub for bus usage
  }

  register(gate) {
    if (!(gate instanceof Gate))
      throw new Error(`[SISO/Stream §1.2] register() requires a Gate instance`);
    if (this.gates.has(gate.signature))
      throw new Error(`[SISO/Stream] Signature collision: '${gate.signature}'`);
    this.gates.set(gate.signature, gate);
    return this; // chainable
  }

  emit(event) {
    if (!(event instanceof Event))
      throw new Error(`[SISO/Stream §1.2] emit() requires an Event instance`);

    this.eventCount++;
    const gate = this.gates.get(event.type);

    if (this.log) {
      this.log.record({
        streamId:       this.streamId,
        parentStreamId: this.parentStreamId,
        eventType:      event.type,
        gateClaimed:    gate ? gate.signature : null,
        eventData:      event.data,
      });
    }

    if (gate) {
      gate.transform(event, this);
    } else {
      this.pending.push(event);
    }

    // pub/sub notifications
    const subs = this._subs.get(event.type);
    if (subs) subs.forEach(fn => { try { fn(event); } catch {} });
    const all  = this._subs.get('*');
    if (all)  all.forEach(fn => { try { fn(event); } catch {} });

    return this;
  }

  // Not getResult. The flow is ongoing. We choose to look now.
  sampleHere() {
    return {
      pending:    [...this.pending],
      eventCount: this.eventCount,
      gateCount:  this.gates.size,
    };
  }

  // pub/sub interface for bus usage
  on(type, fn)  {
    if (!this._subs.has(type)) this._subs.set(type, new Set());
    this._subs.get(type).add(fn);
    return () => this._subs.get(type)?.delete(fn); // returns unsubscribe fn
  }
  off(type, fn) { this._subs.get(type)?.delete(fn); }
}

module.exports = { Event, Gate, Stream, StreamLog };
