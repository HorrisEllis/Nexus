'use strict';
/**
 * lib/meta/spatial/lattice.js — Associative Lattice (CJS)
 * UUID: nexus-spatial-lattice-v1-0000-4000-0000-000000000001
 * Ported from @spatial/lattice v1.0.0
 *
 * Resonance-weighted associative memory graph.
 * In NEXUS: connects ideas, specs, artifacts, gaps by semantic weight.
 * High-weight edges = strong association (frequency × recency × outcome).
 */

const LATTICE_VERSION   = '1.0.0';
const DEFAULT_THRESHOLD = 0.35;

function r4(v) { return Math.round((v??0)*10000)/10000; }

class LatticeGraph {
  constructor() {
    this._nodes = new Map();   // id → node
    this._edges = new Map();   // `${a}:${b}` → edge (canonical a<b)
    this._adj   = new Map();   // id → Set<id>
  }

  addNode({ id, label, tags=[], meta={} }) {
    if (!id) throw new Error('[LatticeGraph] id required');
    this._nodes.set(id, Object.freeze({ id, label:label||id, tags:[...tags], meta:{...meta}, ts:Date.now() }));
    if (!this._adj.has(id)) this._adj.set(id, new Set());
    return this;
  }

  addEdge({ a, b, weight=0.5, type='resonance' }) {
    if (!a||!b) throw new Error('[LatticeGraph] a and b required');
    const key = a<b ? `${a}:${b}` : `${b}:${a}`;
    const existing = this._edges.get(key);
    // Reinforce: weight converges toward 1 on repeated association
    const w = existing ? r4(Math.min(1, existing.weight + (1-existing.weight)*0.15)) : r4(Math.max(0,Math.min(1,weight)));
    this._edges.set(key, Object.freeze({ a, b, weight:w, type, ts:Date.now() }));
    this._adj.get(a)?.add(b); this._adj.get(b)?.add(a);
    return this;
  }

  neighbors(id, { minWeight=DEFAULT_THRESHOLD }={}) {
    const adj = this._adj.get(id) || new Set();
    return [...adj]
      .map(nid => ({ node:this._nodes.get(nid), weight:this._edgeWeight(id,nid) }))
      .filter(e => e.node && e.weight >= minWeight)
      .sort((a,b) => b.weight - a.weight);
  }

  _edgeWeight(a, b) {
    const key = a<b ? `${a}:${b}` : `${b}:${a}`;
    return this._edges.get(key)?.weight || 0;
  }

  cluster({ minWeight=DEFAULT_THRESHOLD }={}) {
    // Connected components above weight threshold
    const visited = new Set();
    const clusters = [];
    for (const id of this._nodes.keys()) {
      if (visited.has(id)) continue;
      const cluster = [];
      const queue = [id];
      while (queue.length) {
        const cur = queue.shift();
        if (visited.has(cur)) continue;
        visited.add(cur); cluster.push(cur);
        for (const nb of (this._adj.get(cur)||[])) {
          if (!visited.has(nb) && this._edgeWeight(cur,nb) >= minWeight) queue.push(nb);
        }
      }
      if (cluster.length) clusters.push(cluster);
    }
    return clusters;
  }

  query({ tag, type, minWeight=0 }={}) {
    const nodes = tag
      ? [...this._nodes.values()].filter(n => n.tags.includes(tag))
      : [...this._nodes.values()];
    return nodes.map(n => ({
      node: n,
      edges: [...(this._adj.get(n.id)||[])].map(nid=>({
        to: nid, weight: this._edgeWeight(n.id, nid)
      })).filter(e => e.weight >= minWeight),
    }));
  }

  size() { return { nodes: this._nodes.size, edges: this._edges.size }; }
  getNode(id) { return this._nodes.get(id) || null; }
  getEdge(a,b) { const k=a<b?`${a}:${b}`:`${b}:${a}`; return this._edges.get(k)||null; }
  allNodes() { return [...this._nodes.values()]; }
  allEdges() { return [...this._edges.values()]; }
}

class LatticeEngine {
  constructor({ threshold=DEFAULT_THRESHOLD }={}) {
    this._g = new LatticeGraph();
    this._threshold = threshold;
  }
  add(node)         { this._g.addNode(node); return this; }
  connect(a,b,w,t)  { this._g.addEdge({a,b,weight:w,type:t}); return this; }
  neighbors(id)     { return this._g.neighbors(id,{minWeight:this._threshold}); }
  clusters()        { return this._g.cluster({minWeight:this._threshold}); }
  query(opts)       { return this._g.query(opts); }
  size()            { return this._g.size(); }
  graph()           { return this._g; }
}

module.exports = { LatticeGraph, LatticeEngine, LATTICE_VERSION, DEFAULT_THRESHOLD, MODULE_ID:'spatial-lattice' };
