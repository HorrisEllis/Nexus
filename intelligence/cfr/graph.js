'use strict';
/**
 * lib/cfr/graph.js — Causal graph builder
 * UUID: nexus-cfr-graph-v1-0000-4000-0000-000000000001
 *
 * Every ledger entry is also a node in the causal graph.
 * Edges come from:
 *   causedBy    — explicit parent link in the event
 *   sessionId   — all events in a session cluster together
 *   jobId       — all events in a job chain
 *   temporal    — events within 2s of each other on same system
 *
 * The graph enables:
 *   - Replay: traverse forward from any node
 *   - Root cause: traverse backward from failure to origin
 *   - Sigma clustering: find high-sigma chains
 */

'use strict';

class CausalGraph {
  constructor() {
    this.nodes = new Map();   // id → LedgerEntry
    this.edges = [];          // { from, to, type, weight }
    this._bySession  = new Map();  // sessionId → id[]
    this._byJob      = new Map();  // jobId      → id[]
    this._bySystem   = new Map();  // system     → id[] (last 100)
    this._byType     = new Map();  // type       → id[] (last 50)
    this._byComponent = new Map(); // componentId → id[] (last 100)
    this._adj        = new Map();  // undirected adjacency, id → Set(id) — built lazily by componentDistance()
    this._adjEdgeCount = 0;        // detects staleness against this.edges without a full rebuild every call
  }

  /**
   * ingest — add a ledger entry to the graph.
   * Resolves all applicable edges automatically.
   */
  ingest(entry) {
    const id = entry.uuid || entry.id;
    if (!id) return;

    this.nodes.set(id, entry);

    // ── Explicit causality ─────────────────────────────────────────────────
    if (entry.causedBy) {
      this.edges.push({ from: entry.causedBy, to: id, type: 'causal', weight: 1.0 });
    }

    // ── Session cluster ────────────────────────────────────────────────────
    const sid = entry.sessionId || entry.trace?.sessionId;
    if (sid) {
      if (!this._bySession.has(sid)) this._bySession.set(sid, []);
      const prev = this._bySession.get(sid);
      if (prev.length > 0) {
        this.edges.push({
          from:   prev[prev.length - 1],
          to:     id,
          type:   'session',
          weight: 0.7,
        });
      }
      prev.push(id);
    }

    // ── Job chain ──────────────────────────────────────────────────────────
    const jobId = entry.payload?.jobId || entry.trace?.jobId;
    if (jobId) {
      if (!this._byJob.has(jobId)) this._byJob.set(jobId, []);
      const chain = this._byJob.get(jobId);
      if (chain.length > 0) {
        this.edges.push({
          from:   chain[chain.length - 1],
          to:     id,
          type:   'job',
          weight: 0.9,
        });
      }
      chain.push(id);
    }

    // ── Temporal adjacency (same system, within 2s) ────────────────────────
    const sys = entry.system || entry._system || entry.source;
    if (sys) {
      if (!this._bySystem.has(sys)) this._bySystem.set(sys, []);
      const ring = this._bySystem.get(sys);
      if (ring.length > 0) {
        const prevEntry = this.nodes.get(ring[ring.length - 1]);
        if (prevEntry && Math.abs((entry.ts || 0) - (prevEntry.ts || 0)) < 2000) {
          this.edges.push({
            from:   ring[ring.length - 1],
            to:     id,
            type:   'temporal',
            weight: 0.3,
          });
        }
      }
      ring.push(id);
      if (ring.length > 100) ring.shift();
    }

    // ── Component adjacency (same declared component, ring-bounded) ────────
    // Distinct from _bySystem: componentId is the caller-declared identity
    // (comp_id / componentId on the entry), not the transport-level system
    // name — two different systems can share no edge here while two calls
    // from the same component on different systems do. This is the edge
    // topologicalProximity() needs and that raid/index.js's stub named as
    // its unbuilt dependency.
    const compId = entry.componentId || entry.comp_id || entry.payload?.componentId;
    if (compId) {
      if (!this._byComponent.has(compId)) this._byComponent.set(compId, []);
      const ring = this._byComponent.get(compId);
      if (ring.length > 0) {
        this.edges.push({
          from:   ring[ring.length - 1],
          to:     id,
          type:   'component',
          weight: 0.6,
        });
      }
      ring.push(id);
      if (ring.length > 100) ring.shift();
    }

    // ── Type sequence (same type, successive) ─────────────────────────────
    const type = entry.type;
    if (type) {
      if (!this._byType.has(type)) this._byType.set(type, []);
      const tring = this._byType.get(type);
      if (tring.length > 0) {
        this.edges.push({
          from:   tring[tring.length - 1],
          to:     id,
          type:   'type-sequence',
          weight: 0.4,
        });
      }
      tring.push(id);
      if (tring.length > 50) tring.shift();
    }
  }

  /**
   * ancestors — walk backward from a node ID, following causal edges.
   * Returns array of entries from root to node.
   */
  ancestors(id, maxDepth = 20) {
    const result = [];
    const visited = new Set();
    let current = id;
    let depth   = 0;

    while (current && depth < maxDepth && !visited.has(current)) {
      visited.add(current);
      const entry = this.nodes.get(current);
      if (entry) result.unshift(entry);
      const parentEdge = this.edges.find(e => e.to === current && e.type === 'causal');
      current = parentEdge?.from;
      depth++;
    }

    return result;
  }

  /**
   * descendants — walk forward from a node.
   */
  descendants(id, maxDepth = 20) {
    const result = [];
    const queue  = [id];
    const visited = new Set();
    let depth = 0;

    while (queue.length && depth < maxDepth) {
      const curr = queue.shift();
      if (visited.has(curr)) continue;
      visited.add(curr);
      const entry = this.nodes.get(curr);
      if (entry && curr !== id) result.push(entry);
      const children = this.edges
        .filter(e => e.from === curr && (e.type === 'causal' || e.type === 'job'))
        .map(e => e.to);
      queue.push(...children);
      depth++;
    }

    return result;
  }

  /**
   * jobChain — all entries for a given jobId, in order.
   */
  jobChain(jobId) {
    const ids = this._byJob.get(jobId) || [];
    return ids.map(id => this.nodes.get(id)).filter(Boolean);
  }

  /**
   * highSigmaNodes — entries where sigma > threshold, for debugger.
   */
  highSigmaNodes(threshold = 0.6) {
    const result = [];
    for (const entry of this.nodes.values()) {
      if ((entry.sigma?.score ?? entry.sigma ?? 0) >= threshold) {
        result.push(entry);
      }
    }
    return result.sort((a, b) =>
      ((b.sigma?.score ?? b.sigma ?? 0) - (a.sigma?.score ?? a.sigma ?? 0)));
  }

  /**
   * _rebuildComponentAdjacency — lazy, only when this.edges has grown since
   * last build (guards against rebuilding on every single call in a hot loop).
   * Builds an undirected component-level graph: any edge whose two endpoints
   * belong to different declared components becomes an adjacency between
   * those component IDs. Nodes lacking a componentId contribute nothing —
   * they're real ledger entries, just not ones this proximity metric can see.
   */
  _rebuildComponentAdjacency() {
    if (this._adjEdgeCount === this.edges.length) return; // no new edges since last build
    this._adj = new Map();
    const compOf = (id) => {
      const n = this.nodes.get(id);
      return n ? (n.componentId || n.comp_id || n.payload?.componentId || null) : null;
    };
    for (const e of this.edges) {
      const ca = compOf(e.from), cb = compOf(e.to);
      if (!ca || !cb || ca === cb) continue;
      if (!this._adj.has(ca)) this._adj.set(ca, new Set());
      if (!this._adj.has(cb)) this._adj.set(cb, new Set());
      this._adj.get(ca).add(cb);
      this._adj.get(cb).add(ca);
    }
    this._adjEdgeCount = this.edges.length;
  }

  /**
   * componentDistance — hop count between two declared componentIds over
   * the real causal graph. Returns null (not Infinity, not 0) when either
   * component has never appeared in the graph or no path connects them —
   * "never observed" and "observed but maximally distant" must not collapse
   * into the same number, same discipline as case-library's confidence:null.
   *
   * maxDepth is a caller-supplied parameter, not a CFR constant — CFR is
   * domain-agnostic (this file's own header: "it does not know what NEXUS
   * is") and must not own a NEXUS-specific tunable. RAID supplies its own
   * Cortex-backed value; a default is kept here only so this method is
   * still usable standalone (tests, other future callers) without forcing
   * every caller to know about RAID's config.
   */
  componentDistance(componentA, componentB, maxDepth = 12) {
    if (!componentA || !componentB) return null;
    if (componentA === componentB) return 0;
    this._rebuildComponentAdjacency();
    if (!this._adj.has(componentA) || !this._adj.has(componentB)) return null;

    const visited = new Set([componentA]);
    let frontier = [componentA];
    let depth = 0;
    while (frontier.length && depth < maxDepth) {
      depth++;
      const next = [];
      for (const node of frontier) {
        for (const neighbor of (this._adj.get(node) || [])) {
          if (neighbor === componentB) return depth;
          if (!visited.has(neighbor)) { visited.add(neighbor); next.push(neighbor); }
        }
      }
      frontier = next;
    }
    return null; // no path found within maxDepth
  }

  stats() {
    return {
      nodes:    this.nodes.size,
      edges:    this.edges.length,
      sessions: this._bySession.size,
      jobs:     this._byJob.size,
    };
  }
}

module.exports = { CausalGraph };
