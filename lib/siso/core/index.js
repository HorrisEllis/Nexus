/**
 * siso/core/index.js — Extended SISO for idearium (ESM)
 * UUID: siso-core-extended-v1-0000-4000-a000-000000000001
 * hookId: siso.core.extended:v1:e0001
 *
 * Extends canonical SISO with:
 *   - Event.uuid + Event.ts (§5.1 everything has a UUID)
 *   - Stream.on/off pub-sub interface (used by idearium bus)
 *   - §1.2 hard errors on bad input
 *   - §2.3 StreamLog with observable entries() method
 *
 * Canonical SISO primitives re-implemented here (no re-export from CJS).
 * This file is ESM-only. Canonical siso/ files remain pure canonical.
 */

// ── §5.1 UUID helper ──────────────────────────────────────────────────────────
const _uid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });

// ── Event — §5.1: every event has a UUID ─────────────────────────────────────
export class Event {
  constructor(type, data = {}) {
    if (!type || typeof type !== 'string')
      throw new Error('[siso/Event §1.2] type must be a non-empty string');
    this.uuid = _uid();           // §5.1 — UUID on everything
    this.type = type;
    this.data = data;
    this.ts   = Date.now();       // §3.2 — wall-clock display metadata
    // eventTs (logical time) set by stream on emit if not present
  }
  toJSON() {
    return { uuid: this.uuid, type: this.type, data: this.data, ts: this.ts };
  }
}

// ── Gate — canonical: signature collision = hard error ────────────────────────
export class Gate {
  constructor(signature) {
    if (!signature) throw new Error('[siso/Gate §1.2] signature required');
    this.signature = signature;
  }
  transform(event, stream) { /* override in subclass */ }
}

// ── StreamLog — §2.3 all state observable ─────────────────────────────────────
const LEVELS = { OFF: 0, EVENTS: 1, DEEP: 2, DATA: 3 };
let _streamIdCounter = 0;

export class StreamLog {
  constructor(level = 'EVENTS') {
    this.level   = level;
    this._data   = [];
    this.seq     = 0;
  }
  nextStreamId() { return ++_streamIdCounter; }
  record({ streamId, parentStreamId, eventType, gateClaimed, eventData }) {
    const lvl = LEVELS[this.level] || 0;
    if (lvl === 0) return;
    const entry = { seq: this.seq++, time: Date.now(), type: eventType, claimed: gateClaimed };
    if (lvl >= 2) { entry.streamId = streamId; if (parentStreamId != null) entry.parentStreamId = parentStreamId; }
    if (lvl >= 3) entry.data = eventData;
    this._data.push(entry);
    if (this._data.length > 2000) this._data.shift(); // §2.1 bounded memory
  }
  sample() { return { level: this.level, count: this._data.length, entries: [...this._data] }; }
  entries(n = 100) { return this._data.slice(-n); }
  clear() { this._data = []; this.seq = 0; }
}

// ── Stream — canonical + pub/sub bus interface ────────────────────────────────
export class Stream {
  constructor({ log = null, parentStreamId = null } = {}) {
    this.gates          = new Map();
    this.pending        = [];
    this.eventCount     = 0;
    this.log            = log;
    this.streamId       = log ? log.nextStreamId() : null;
    this.parentStreamId = parentStreamId;
    this._handlers      = new Map(); // pub/sub: type → handler[]
    this._eventSeq      = 0;         // §3.2 logical time counter
  }

  // §1.2 — signature collision = hard error (canonical axiom)
  register(gate) {
    if (this.gates.has(gate.signature))
      throw new Error(`[siso/Stream §1.2] Signature collision: '${gate.signature}'`);
    this.gates.set(gate.signature, gate);
  }

  emit(event) {
    // Accept string shorthand
    if (typeof event === 'string') event = new Event(event, {});
    // §3.2 — stamp logical time if not already set
    if (!event.eventTs) event.eventTs = ++this._eventSeq;

    this.eventCount++;
    const gate = this.gates.get(event.type);

    if (this.log) {
      this.log.record({
        streamId: this.streamId, parentStreamId: this.parentStreamId,
        eventType: event.type, gateClaimed: gate ? gate.signature : null,
        eventData: event.data,
      });
    }

    if (gate) { gate.transform(event, this); }
    else       { this.pending.push(event); }

    // Fire pub/sub handlers (after gate — §5.7 bus-only communication)
    const handlers = this._handlers.get(event.type) || [];
    const wildcard = this._handlers.get('*') || [];
    for (const h of [...handlers, ...wildcard]) {
      try { h(event); } catch (e) {
        console.error(`[siso/Stream §1.2] handler error for '${event.type}':`, e.message);
      }
    }
    return event;
  }

  // Pub/sub — §5.7: all inter-module communication via event bus only
  on(type, handler) {
    if (!this._handlers.has(type)) this._handlers.set(type, []);
    this._handlers.get(type).push(handler);
    return () => this.off(type, handler);
  }
  off(type, handler) {
    const arr = this._handlers.get(type) || [];
    const idx = arr.indexOf(handler);
    if (idx >= 0) arr.splice(idx, 1);
  }

  sampleHere() {
    return { pending: [...this.pending], eventCount: this.eventCount, gateCount: this.gates.size };
  }
}
