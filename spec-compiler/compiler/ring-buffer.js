'use strict';
/**
 * compiler/ring-buffer.js — CAUSAL MEMORY LAYER
 * UUID: mod-ringbuffer-v1-0000-0001
 * Version: 1.0.0
 *
 * Bounded circular buffer of state transition events.
 * Stores every mutation: node, field, fromValue, toValue, causedBy, seq.
 * Enables delta debugging, replay slicing, causal tracing, rollback simulation.
 * Fixed capacity — oldest events evicted when full (FIFO).
 * Emits runtime.mutation to trigger re-propagation (the ↺).
 *
 * §1.2  record() never throws — malformed events are logged and skipped.
 * §1.1  Capacity is fixed at construction.
 * §C-4  Timelines are first-class objects.
 */

const DEFAULT_CAPACITY = 1000;

// ── MutationEvent shape ───────────────────────────────────────────────────────
// { seq, nodeId, field, fromValue, toValue, causedBy, ts, type }

let _globalSeq = 0;

function makeSeq() { return ++_globalSeq; }

// ── RingBuffer ────────────────────────────────────────────────────────────────

class RingBuffer {
  constructor(capacity = DEFAULT_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity < 1) capacity = DEFAULT_CAPACITY;
    this._cap      = capacity;
    this._buf      = new Array(capacity);
    this._head     = 0;   // next write position
    this._size     = 0;   // current fill level
    this._evicted  = 0;   // total evictions
    this._listeners = []; // SISO-style event listeners
  }

  // ── record(event) ────────────────────────────────────────────────────────
  // GATE-RB-001: mutation event arrives → append to circular buffer
  // GATE-RB-002: buffer at capacity → evict oldest, emit buffer.capacity.reached
  record(event) {
    if (!event || typeof event !== 'object') {
      // §1.2: skip malformed, never throw
      this._emit('buffer.record.skipped', { reason: 'malformed event' });
      return;
    }
    const entry = {
      seq:       event.seq ?? makeSeq(),
      nodeId:    event.nodeId    ?? event.id   ?? null,
      field:     event.field     ?? event.type ?? null,
      fromValue: event.fromValue ?? event.from ?? null,
      toValue:   event.toValue   ?? event.to   ?? null,
      causedBy:  event.causedBy  ?? null,
      ts:        event.ts        ?? Date.now(),
      type:      event.type      ?? 'mutation',
      data:      event.data      ?? event.payload ?? null,
    };

    const atCap = this._size === this._cap;
    this._buf[this._head] = entry;
    this._head = (this._head + 1) % this._cap;
    if (atCap) {
      this._evicted++;
      this._emit('buffer.capacity.reached', { capacity: this._cap, evicted: this._evicted });
    } else {
      this._size++;
    }

    // GATE-RB-003: record complete → emit buffer.event.recorded
    this._emit('buffer.event.recorded', { seq: entry.seq, nodeId: entry.nodeId, type: entry.type });
    return entry;
  }

  // ── replay(fromSeq?, toSeq?) ─────────────────────────────────────────────
  // GATE-RB-004: replay requested → emit events in seq order → buffer.replay.complete
  // fromSeq > toSeq → return [] (not error)
  replay(fromSeq, toSeq) {
    const events = this._toArray();
    let result = events;
    if (fromSeq !== undefined && fromSeq !== null) result = result.filter(e => e.seq >= fromSeq);
    if (toSeq   !== undefined && toSeq   !== null) result = result.filter(e => e.seq <= toSeq);
    if (fromSeq !== undefined && toSeq !== undefined && fromSeq > toSeq) result = [];
    // Sort by seq
    result = result.sort((a, b) => a.seq - b.seq);
    this._emit('buffer.replay.complete', { count: result.length, fromSeq, toSeq });
    return result;
  }

  // ── snapshot() ──────────────────────────────────────────────────────────
  // GATE-RB-005: snapshot requested → copy current buffer state
  snapshot() {
    const events = this._toArray();
    const snap = {
      ts:       Date.now(),
      size:     this._size,
      capacity: this._cap,
      evicted:  this._evicted,
      headSeq:  events.length > 0 ? events[events.length - 1].seq : null,
      tailSeq:  events.length > 0 ? events[0].seq : null,
      events:   events.map(e => ({ ...e })), // deep-ish copy
    };
    this._emit('buffer.snapshot.taken', { size: snap.size });
    return snap;
  }

  // ── diff(snapshotA, snapshotB) ───────────────────────────────────────────
  diff(snapA, snapB) {
    if (!snapA?.events || !snapB?.events) return { added: [], removed: [], changed: [] };
    const aSeqs = new Set(snapA.events.map(e => e.seq));
    const bSeqs = new Set(snapB.events.map(e => e.seq));
    return {
      added:   snapB.events.filter(e => !aSeqs.has(e.seq)),
      removed: snapA.events.filter(e => !bSeqs.has(e.seq)),
      changed: [], // seq-addressed — same seq means same event
      deltaMs: (snapB.ts || 0) - (snapA.ts || 0),
    };
  }

  // ── causalChain(nodeId) ──────────────────────────────────────────────────
  // GATE-RB-006: filter by nodeId + causedBy chain
  // Follows causedBy links transitively within buffer window.
  causalChain(nodeId) {
    if (!nodeId) return [];
    const events = this._toArray();
    // Gather events directly involving nodeId
    const direct = events.filter(e => e.nodeId === nodeId || e.causedBy === nodeId);
    if (!direct.length) return [];
    // BFS through causedBy links
    const visited = new Set(direct.map(e => e.seq));
    const chain   = [...direct];
    let frontier  = direct;
    let depth     = 0;
    while (frontier.length && depth < 20) {
      const next = [];
      for (const ev of frontier) {
        const children = events.filter(e => e.causedBy === ev.nodeId && !visited.has(e.seq));
        children.forEach(e => { visited.add(e.seq); chain.push(e); next.push(e); });
      }
      frontier = next;
      depth++;
    }
    return chain.sort((a, b) => a.seq - b.seq);
  }

  // ── rollbackSimulate(nodeId, toValue) ────────────────────────────────────
  rollbackSimulate(nodeId, toValue) {
    if (!nodeId) return { ok: false, error: 'nodeId required' };
    const chain   = this.causalChain(nodeId);
    const before  = chain.filter(e => e.toValue === toValue || e.fromValue === toValue);
    return {
      nodeId,
      toValue,
      causalEventsAffected: chain.length,
      lastMatchingState: before[before.length - 1] || null,
      simulated: true,
      note: 'Simulation only — no state mutation performed',
    };
  }

  // ── SISO-style event bus ──────────────────────────────────────────────────
  on(type, fn) {
    this._listeners.push({ type, fn });
    return this;
  }
  _emit(type, payload) {
    for (const l of this._listeners) {
      if (l.type === type || l.type === '*') {
        try { l.fn({ type, payload }); } catch(_) {}
      }
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────────
  _toArray() {
    if (this._size === 0) return [];
    const arr = [];
    const tail = (this._head - this._size + this._cap) % this._cap;
    for (let i = 0; i < this._size; i++) {
      arr.push(this._buf[(tail + i) % this._cap]);
    }
    return arr;
  }

  get size()     { return this._size; }
  get capacity() { return this._cap; }
  get stats()    { return { size: this._size, capacity: this._cap, evicted: this._evicted, headSeq: this._head }; }
}

// ── Factory ───────────────────────────────────────────────────────────────────

function createRingBuffer(capacity) {
  return new RingBuffer(capacity);
}

module.exports = { RingBuffer, createRingBuffer, DEFAULT_CAPACITY };
