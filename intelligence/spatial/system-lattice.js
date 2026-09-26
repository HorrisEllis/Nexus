'use strict';
/**
 * meta/spatial/system-lattice.js — Cross-System Associative Lattice
 * UUID: nexus-system-lattice-v1-0000-2026-0706-jamesbrooks-001
 *
 * Extends the associative-lattice mechanism (`lattice.js`'s LatticeGraph/
 * LatticeEngine — real, currently idearium's idea/spec/gap graph, in-memory
 * only) to systems, components, and data points — per
 * docs/nexus-relationship-shape.spec v0.2's "associative lattice" section:
 * a standing, continuously-updated graph over system pairs, reusing CFR's
 * already-computed causal edges rather than inventing new proximity logic.
 * That spec's own framing: "nothing here is a new engine, it's the first
 * thing that holds their combined output as state instead of recomputing
 * it fresh per question." This module is exactly that holding place.
 *
 * Kept as its OWN sovereign instance, never merged into idearium's idea
 * lattice — same discipline docs/seam-component-registry.spec §3.1 already
 * states for comp_id-keyed graphs: distinct relationship types stay
 * structurally separate, never conflated into one traversal.
 *
 * §2.1/§2.2 — idearium's LatticeEngine is pure in-memory (confirmed: no
 * jaaDB call anywhere in its lattice functions — same gap this session
 * already found and left named, not silently fixed, since idearium's is a
 * different graph). This module's whole point is not repeating that:
 * every addNode()/connect() persists to JAA before the in-memory graph is
 * considered authoritative, and load() rehydrates at boot.
 *
 * Table names deliberately distinct from meta/crystal-lattice.js's own
 * `lattice_edges` table — checked first: that table tracks (domain,verb)
 * pattern-transition success rates, a different schema and a different
 * concept. Reusing its name would be a silent collision, not a reuse.
 */

const { jaaDB, uid } = require('../../cortex/memory/jaa-db');
const { LatticeEngine } = require('./lattice.js');

const NODE_TABLE = 'assoc_lattice_nodes'; // intended tier: long
const EDGE_TABLE = 'assoc_lattice_edges'; // intended tier: long

let _engine = null;

function _getEngine() {
  if (!_engine) _engine = new LatticeEngine({ threshold: 0.3 });
  return _engine;
}

/** load — rehydrate the in-memory graph from Cortex. Call once at boot. */
function load() {
  _engine = new LatticeEngine({ threshold: 0.3 });
  const nodes = jaaDB.query(NODE_TABLE, () => true, 100000);
  for (const row of nodes) _engine.add({ id: row.nodeId, label: row.label, tags: row.tags || [] });
  const edges = jaaDB.query(EDGE_TABLE, () => true, 100000);
  for (const row of edges) _engine.connect(row.a, row.b, row.weight, row.type);
  return _engine;
}

/** addNode — idempotent. Persists once; subsequent calls just touch the in-memory graph. */
function addNode({ id, label, tags = [] } = {}) {
  if (!id) throw new Error('[system-lattice] node id required');
  const engine = _getEngine();
  engine.add({ id, label: label || id, tags });
  const existing = jaaDB.query(NODE_TABLE, r => r.nodeId === id, 1);
  if (!existing.length) {
    jaaDB.insert(NODE_TABLE, { uuid: uid(), nodeId: id, label: label || id, tags, ts: Date.now() });
  }
  return engine.graph().getNode(id);
}

/** connect — real reinforcement (same convergence-toward-1 rule as lattice.js), persisted. */
function connect(a, b, weight = 0.5, type = 'interaction') {
  addNode({ id: a });
  addNode({ id: b });
  const engine = _getEngine();
  engine.connect(a, b, weight, type);
  const edge = engine.graph().getEdge(a, b);
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  const existing = jaaDB.query(EDGE_TABLE, r => r.key === key, 1);
  if (existing.length) {
    jaaDB.update(EDGE_TABLE, { key }, { weight: edge.weight, type: edge.type, ts: edge.ts });
  } else {
    jaaDB.insert(EDGE_TABLE, { uuid: uid(), key, a, b, weight: edge.weight, type: edge.type, ts: edge.ts });
  }
  return edge;
}

/**
 * ingestCFRGraph — walks a real CausalGraph's edges (meta/cfr/graph.js),
 * maps each cross-component edge onto this lattice. Reuses CFR's already-
 * computed edges and weights; does not recompute proximity independently.
 * Returns counts of nodes/edges touched (idempotent — not necessarily new).
 */
function ingestCFRGraph(causalGraph) {
  if (!causalGraph) return { nodesTouched: 0, edgesTouched: 0 };
  let nodesTouched = 0, edgesTouched = 0;
  const touched = new Set();
  const compOf = (id) => {
    const n = causalGraph.nodes.get(id);
    return n ? (n.componentId || n.comp_id || n.payload?.componentId || null) : null;
  };
  for (const edge of causalGraph.edges) {
    const ca = compOf(edge.from), cb = compOf(edge.to);
    if (!ca || !cb || ca === cb) continue;
    if (!touched.has(ca)) { addNode({ id: ca, tags: ['system'] }); touched.add(ca); nodesTouched++; }
    if (!touched.has(cb)) { addNode({ id: cb, tags: ['system'] }); touched.add(cb); nodesTouched++; }
    connect(ca, cb, edge.weight || 0.5, edge.type || 'causal');
    edgesTouched++;
  }
  return { nodesTouched, edgesTouched };
}

function neighbors(id) { return _getEngine().neighbors(id); }
function clusters()    { return _getEngine().clusters(); }
function query(opts)   { return _getEngine().query(opts); }
function size()        { return _getEngine().size(); }

/** reset — clears the in-memory graph only. Does not touch Cortex. Tests use this. */
function reset() { _engine = new LatticeEngine({ threshold: 0.3 }); }

module.exports = {
  load, addNode, connect, ingestCFRGraph, neighbors, clusters, query, size, reset,
  NODE_TABLE, EDGE_TABLE,
};
