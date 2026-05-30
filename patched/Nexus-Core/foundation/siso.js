// ═══════════════════════════════════════════════════
// NEXUS — SISO Foundation (CORE/JAA)
// Stream → Gate → Event → StreamLog
// Constitutional Law II enforced: all state via events
// ═══════════════════════════════════════════════════
'use strict';

let _tick = 0;
let _seq  = 0;

// ── Event ─────────────────────────────────────────
// Constitutional: immutable on construction (Law II)
class SISOEvent {
  constructor(type, payload = {}, opts = {}) {
    this.id             = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}-${_seq}`;
    this.type           = type;
    this.tick           = ++_tick;      // strictly monotone logical clock
    this.wall           = Date.now();   // wall time ms
    this.causedBy       = opts.causedBy       || null;  // lattice edge
    this.relatedTo      = opts.relatedTo      || [];    // semantic edges
    this.payload        = Object.freeze({ ...payload }); // frozen payload
    this.streamId       = opts.streamId       || 1;
    this.parentStreamId = opts.parentStreamId || null;
    _seq++;
    Object.freeze(this);
  }
}

// ── StreamLog ─────────────────────────────────────
// Every event. No exceptions. Causal replay from seq:0.
class StreamLog {
  constructor(maxSize = 10000) {
    this._entries = [];
    this._maxSize = maxSize;
  }

  push(ev) {
    this._entries.push(ev);
    if (this._entries.length > this._maxSize) this._entries.shift();
  }

  get entries() { return this._entries; }

  upTo(tick) {
    return this._entries.filter(e => e.tick <= tick);
  }

  byStream(streamId) {
    return this._entries.filter(e => e.streamId === streamId);
  }

  // Reconstruct causal chain for any event
  causalChain(eventId, maxDepth = 20) {
    const chain = [];
    let current = this._entries.find(e => e.id === eventId);
    let depth = 0;
    while (current && depth < maxDepth) {
      chain.push(current);
      current = current.causedBy
        ? this._entries.find(e => e.id === current.causedBy)
        : null;
      depth++;
    }
    return chain;
  }

  // Replay from seq:0 to reconstruct world state at tick N
  replayTo(tick) {
    return this.upTo(tick);
  }

  // Fork: create new StreamLog from a tick point
  forkAt(tick) {
    const fork = new StreamLog(this._maxSize);
    this.upTo(tick).forEach(e => fork.push(e));
    return fork;
  }
}

// ── Gate ──────────────────────────────────────────
// Pure function. One job. No side effects except emit.
// Re-emitting gates MUST use wasProcessedBy guard.
class Gate {
  constructor(name) {
    this.name = name;
  }

  // Predicate — no side effects
  matches(event) { return false; }

  // Single transformation — emit new events only
  transform(event, stream) {}

  // Infinite loop prevention for re-emitting gates
  wasProcessedBy(event) {
    return event._processedBy?.has(this.name) || false;
  }

  markProcessed(event) {
    if (!event._processedBy) {
      // Can't mutate frozen event — attach via WeakMap
      event = { ...event, _processedBy: new Set([this.name]) };
    } else {
      event._processedBy.add(this.name);
    }
    return event;
  }
}

// ── Stream ────────────────────────────────────────
// Routes events through registered gates.
// Law III: no module calls another module directly.
class Stream {
  constructor(id = 1, log = null) {
    this._id      = id;
    this._gates   = [];
    this._log     = log || new StreamLog();
    this._queue   = [];
    this._running = false;
  }

  register(gate) {
    this._gates.push(gate);
    return this;
  }

  emit(type, payload = {}, opts = {}) {
    const ev = new SISOEvent(type, payload, {
      ...opts,
      streamId: this._id,
    });
    this._log.push(ev);
    this._queue.push(ev);
    if (!this._running) this._drain();
    return ev;
  }

  _drain() {
    this._running = true;
    while (this._queue.length) {
      const ev = this._queue.shift();
      for (const gate of this._gates) {
        if (gate.matches(ev)) {
          try { gate.transform(ev, this); }
          catch (err) {
            console.error(`[Gate:${gate.name}] Error:`, err);
            this.emit('gate.error', { gate: gate.name, error: err.message, eventId: ev.id });
          }
          break;
        }
      }
    }
    this._running = false;
  }

  get log() { return this._log; }
  get id()  { return this._id; }
}

// ── SISOBus (ALK-compatible pub/sub wrapper) ──────
// Wraps Stream into ALK pattern-matching API.
// Constitutional Law III: all comms via kernel.emit()
class SISOBus {
  constructor() {
    this._handlers  = new Map();
    this._log       = new StreamLog(50000);
    this._streams   = new Map();
    this._streamSeq = 0;
  }

  // ALK-style pattern matching
  // 'gate.**' matches gate.passed, gate.failed, gate.runner.test
  // 'gate.*'  matches gate.passed, gate.failed but NOT gate.runner.test
  on(pattern, handler) {
    if (!this._handlers.has(pattern)) this._handlers.set(pattern, []);
    this._handlers.get(pattern).push(handler);
    return () => this._handlers.get(pattern)?.filter(h => h !== handler);
  }

  emit(type, payload = {}, opts = {}) {
    const ev = new SISOEvent(type, payload, {
      ...opts,
      streamId: opts.streamId || 1,
    });
    this._log.push(ev);
    this._route(ev);
    return ev;
  }

  _route(ev) {
    for (const [pattern, handlers] of this._handlers) {
      if (this._matches(pattern, ev.type)) {
        for (const handler of handlers) {
          try { handler(ev); }
          catch (err) { console.error(`[Handler:${pattern}]`, err); }
        }
      }
    }
  }

  _matches(pattern, type) {
    if (pattern === '*.*') return true;
    if (pattern === type) return true;
    if (pattern.endsWith('.**')) return type.startsWith(pattern.slice(0, -3));
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      const rest   = type.slice(prefix.length + 1);
      return type.startsWith(prefix + '.') && !rest.includes('.');
    }
    const reParts = pattern.split('.').map(p => p === '*' ? '[^.]+' : p.replace(/\*\*/g, '.+'));
    return new RegExp('^' + reParts.join('\\.') + '$').test(type);
  }

  // Spawn a sub-stream (Law II: all state via events)
  stream(parentId = null) {
    const id = ++this._streamSeq;
    const s  = new Stream(id, this._log);
    this._streams.set(id, s);
    return s;
  }

  get log() { return this._log; }
}

module.exports = { SISOEvent, StreamLog, Gate, Stream, SISOBus };
