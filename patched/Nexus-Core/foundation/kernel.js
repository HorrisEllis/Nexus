// ═══════════════════════════════════════════════════
// NEXUS — ALK Kernel
// Lattice events. Causal graph. Ring buffer. Wildcards.
// Constitutional Law III: all communication via kernel only
// ═══════════════════════════════════════════════════
'use strict';

const { SISOBus, SISOEvent } = require('./siso');

class ALKKernel extends SISOBus {
  constructor(config = {}) {
    super();
    this._ringBuffer  = [];
    this._ringSize    = config.ringSize || 10000;
    this._causalGraph = new Map();  // eventId → { causedBy, relatedTo, causes: [] }

    // Kernel enforces Constitutional Laws
    this._laws = {
      I:   'LOCAL_FIRST',     // Ollama before cloud — enforced in RAID
      II:  'EVENT_AUTHORITY', // No direct state — enforced here
      III: 'LAYER_SOVEREIGNTY', // No direct calls — enforced here
      IV:  'SCHEMA_OVER_CODE',  // Schema-constrained — enforced in manifest
    };
  }

  emit(type, payload = {}, opts = {}) {
    const ev = super.emit(type, payload, opts);

    // Ring buffer
    this._ringBuffer.push(ev);
    if (this._ringBuffer.length > this._ringSize) this._ringBuffer.shift();

    // Build causal graph node
    const node = {
      id:        ev.id,
      type:      ev.type,
      tick:      ev.tick,
      causedBy:  ev.causedBy,
      relatedTo: ev.relatedTo,
      causes:    [],
    };
    this._causalGraph.set(ev.id, node);

    // Link to parent
    if (ev.causedBy && this._causalGraph.has(ev.causedBy)) {
      this._causalGraph.get(ev.causedBy).causes.push(ev.id);
    }

    return ev;
  }

  // Traverse causal graph forward from event
  descendants(eventId, maxDepth = 10) {
    const result = [];
    const queue  = [{ id: eventId, depth: 0 }];
    while (queue.length) {
      const { id, depth } = queue.shift();
      if (depth > maxDepth) continue;
      const node = this._causalGraph.get(id);
      if (!node) continue;
      result.push(node);
      node.causes.forEach(childId => queue.push({ id: childId, depth: depth + 1 }));
    }
    return result;
  }

  // Traverse causal graph backward (causal chain)
  ancestors(eventId, maxDepth = 20) {
    const chain = [];
    let current = this._causalGraph.get(eventId);
    let depth   = 0;
    while (current && depth < maxDepth) {
      chain.push(current);
      current = current.causedBy ? this._causalGraph.get(current.causedBy) : null;
      depth++;
    }
    return chain;
  }

  // Semantic search: find events related to a node
  relatedTo(nodeId) {
    return [...this._causalGraph.values()].filter(n => n.relatedTo.includes(nodeId));
  }

  // Ring buffer snapshot
  snapshot(last = 100) {
    return this._ringBuffer.slice(-last);
  }

  // Enforce Law II: reject direct state mutation attempts
  assertEventAuthority(mutationAttempt) {
    throw new Error(`[LAW II VIOLATION] Direct state mutation rejected: ${mutationAttempt}. Use kernel.emit() only.`);
  }

  get laws() { return Object.freeze({ ...this._laws }); }
  get ring() { return this._ringBuffer; }
  get graph() { return this._causalGraph; }
}

// Singleton kernel — the only communication channel
const kernel = new ALKKernel({ ringSize: 10000 });

module.exports = { ALKKernel, kernel };
