'use strict';
// ════════════════════════════════════════════════════════════════════════════
// SISO CORE — Signal In Signal Out event bus
// UUID: emerge-siso-core-v1-0-0
// Source of truth for all inter-component communication.
// No component talks to another except through this bus.
// Ported from SISO (Core) to CJS for the Emerge kernel.
// ════════════════════════════════════════════════════════════════════════════

// ── Event ─────────────────────────────────────────────────────────────────────
class Event {
  constructor(type, data = {}) {
    this.type = type;
    this.data = data;
    this.ts   = Date.now();
    this.id   = `ev-${this.ts}-${Math.random().toString(36).slice(2,8)}`;
  }
}

// ── Gate ──────────────────────────────────────────────────────────────────────
// A shape that recognises one event type and transforms it.
// signature must be unique per stream.
class Gate {
  constructor(signature, transformFn) {
    this.signature = signature;
    this._fn = transformFn;
  }
  transform(event, stream) {
    try { this._fn(event, stream); }
    catch(err) {
      stream.emit(new Event('gate.error', {
        gate: this.signature, error: err.message, causedBy: event.id
      }));
    }
  }
}

// ── StreamLog ─────────────────────────────────────────────────────────────────
class StreamLog {
  constructor(maxSize = 5000) {
    this._log     = [];
    this._maxSize = maxSize;
    this._streamN = 0;
  }
  nextStreamId()  { return `stream-${++this._streamN}`; }
  record(entry)   {
    this._log.push({ ...entry, ts: Date.now() });
    if (this._log.length > this._maxSize) this._log.shift();
  }
  tail(n = 50)    { return this._log.slice(-n); }
  all()           { return [...this._log]; }
}

// ── Stream ────────────────────────────────────────────────────────────────────
// The processing loop. →E→E→
// Gates register by signature. Events are dispatched O(1).
// Unclaimed events land in pending — never silently dropped.
class Stream {
  constructor({ log = null, parentStreamId = null, name = null } = {}) {
    this.gates          = new Map();
    this.pending        = [];
    this.eventCount     = 0;
    this.log            = log;
    this.name           = name;
    this.streamId       = log ? log.nextStreamId() : `stream-${Date.now()}`;
    this.parentStreamId = parentStreamId;
    this._listeners     = new Map(); // type → [fn]  (wildcard subscriptions)
  }

  register(gate) {
    if (this.gates.has(gate.signature))
      throw new Error(`SISO: signature collision — '${gate.signature}'`);
    this.gates.set(gate.signature, gate);
    return this;
  }

  // Subscribe without a Gate (lighter weight, for UI/SSE consumers)
  on(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
    return () => { // returns unsubscribe fn
      const arr = this._listeners.get(type) || [];
      this._listeners.set(type, arr.filter(f => f !== fn));
    };
  }

  emit(event) {
    if (!(event instanceof Event)) event = new Event(event.type || event, event.data || event);
    this.eventCount++;

    if (this.log) this.log.record({
      streamId: this.streamId, parentStreamId: this.parentStreamId,
      eventType: event.type, eventId: event.id,
      gateClaimed: this.gates.has(event.type) ? event.type : null,
    });

    // Gate dispatch
    const gate = this.gates.get(event.type);
    if (gate) gate.transform(event, this);
    else      this.pending.push(event);

    // Listener dispatch (UI subscriptions)
    const listeners = this._listeners.get(event.type) || [];
    const wildcards = this._listeners.get('*') || [];
    for (const fn of [...listeners, ...wildcards]) {
      try { fn(event); } catch(e) { /* listener errors never break the stream */ }
    }

    return this;
  }

  sampleHere() {
    return { pending: [...this.pending], eventCount: this.eventCount, gateCount: this.gates.size };
  }

  // Drain pending — consume all and clear
  drain() {
    const p = [...this.pending];
    this.pending = [];
    return p;
  }
}

// ── Bus ───────────────────────────────────────────────────────────────────────
// The shared bus — one instance, many named streams.
// Components get a named stream. They never talk to each other directly.
class Bus {
  constructor() {
    this._log     = new StreamLog();
    this._streams = new Map();
  }

  // Get or create a named stream
  stream(name) {
    if (!this._streams.has(name)) {
      this._streams.set(name, new Stream({ log: this._log, name }));
    }
    return this._streams.get(name);
  }

  // Broadcast to all streams
  broadcast(event) {
    for (const s of this._streams.values()) s.emit(event);
  }

  log()     { return this._log; }
  streams() { return [...this._streams.keys()]; }

  // SSE-friendly: subscribe to all events across all streams
  onAny(fn) {
    for (const s of this._streams.values()) s.on('*', fn);
    // Also wire new streams created after this call
    this._onAnyFn = fn;
  }

  _newStream(name) {
    const s = new Stream({ log: this._log, name });
    if (this._onAnyFn) s.on('*', this._onAnyFn);
    this._streams.set(name, s);
    return s;
  }
}

module.exports = { Event, Gate, Stream, StreamLog, Bus };
