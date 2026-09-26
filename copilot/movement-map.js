'use strict';
/**
 * copilot/movement-map.js — OB3 + OB4 of the observability/tablet phasemap
 * UUID: nexus-copilot-movement-map-v1-0000-2026-0730-001
 *
 * §PHASEMAP OB3 + OB4 (docs/nexus-observability-tablet-phasemap.spec, CHUNK F).
 * OB3 maps the component registry onto a MOVEMENT GRAPH — nodes = components/
 * systems, edges = flow between them, each edge weighted by CFR friction. OB4
 * finds BOTTLENECKS: for each node/edge, score stall using delta (tension/
 * friction/slope) + sigma, so a stalled node is identified WHERE and WHY.
 *
 * §8.6 — composes the EXISTING registry (capability-registry.capabilities()),
 * CFR friction (intelligence/cfr/field EVENT_NUDGES), and the delta engine
 * (intelligence/cfr/delta.computeDelta → {tension, friction, slope}). Builds no new
 * graph or physics. §1.1 — nodes/edges come from real registry + real CFR
 * values, never invented (this is the "no mocks" law the 3D map OB9 will inherit).
 * §13.4 — the delta IS the bottleneck/drift signal. Non-fatal.
 */

function _registryNodes() {
  try {
    const cr = require('../lib/capability-registry');
    const caps = typeof cr.capabilities === 'function' ? cr.capabilities() : [];
    return (Array.isArray(caps) ? caps : []).map(c => ({
      id: c.uuid || c.id || c.name,
      name: c.name || c.id,
      system: c.system || c.category || 'unknown',
      type: c.type || 'component',
    }));
  } catch { return []; }
}

// The CFR friction each event-type carries — the edge-weight source (§8.6).
function _frictionFor(eventType) {
  try {
    const field = require('../intelligence/cfr/field');
    const nudges = field.EVENT_NUDGES || {};
    const n = nudges[eventType];
    if (n) return Math.max(0, n.friction || 0);
    // prefix match
    for (const k of Object.keys(nudges)) if (eventType && eventType.startsWith(k)) return Math.max(0, nudges[k].friction || 0);
  } catch { /* field optional */ }
  return 0;
}

/**
 * buildMovementGraph(events) — OB3. Nodes from the registry; edges from observed
 * flow in the event stream (source→target system transitions), each weighted by
 * the CFR friction of the event type driving it. Returns { nodes, edges }.
 * §0.1 — derived from REAL registry + REAL events; an edge with no backing event
 * is never invented.
 */
function buildMovementGraph(events = []) {
  const nodes = _registryNodes();
  const nodeIds = new Set(nodes.map(n => n.id));
  const systems = new Set(nodes.map(n => n.system));

  // Ensure every system that appears is a node (systems are coarse nodes even if
  // no fine-grained component is registered for them yet).
  const edges = [];
  const edgeKey = (a, b) => `${a}->${b}`;
  const edgeMap = new Map();

  let prev = null;
  for (const e of events) {
    const sys = e.system || (e.type ? e.type.split('.')[0] : null);
    if (sys) systems.add(sys);
    if (prev && prev.sys && sys && prev.sys !== sys) {
      const key = edgeKey(prev.sys, sys);
      const friction = Math.max(_frictionFor(prev.type), _frictionFor(e.type));
      if (!edgeMap.has(key)) edgeMap.set(key, { from: prev.sys, to: sys, count: 0, friction: 0, lastType: e.type });
      const ed = edgeMap.get(key);
      ed.count += 1;
      ed.friction = Math.max(ed.friction, friction);
    }
    prev = { sys, type: e.type, ts: e.ts };
  }
  for (const ed of edgeMap.values()) edges.push(ed);

  // Systems become nodes too (coarse layer), so the graph is complete even
  // before fine-grained components register.
  const sysNodes = [...systems].map(s => ({ id: s, name: s, system: s, type: 'system' }));
  const allNodes = [...nodes, ...sysNodes.filter(s => !nodeIds.has(s.id))];

  return { nodes: allNodes, edges, ts: Date.now() };
}

/**
 * detectBottlenecks(graph, eventsBySystem) — OB4. For each node, score stall via
 * the delta engine over that system's recent events + the edge friction feeding
 * it. Returns bottlenecks sorted worst-first: [{ node, where, why, score }].
 * WHERE = the node; WHY = the dominant cause (friction / tension / stall).
 */
function detectBottlenecks(graph, eventsBySystem = {}) {
  let computeDelta;
  try { computeDelta = require('../intelligence/cfr/delta').computeDelta; } catch { computeDelta = null; }
  const bottlenecks = [];

  for (const node of graph.nodes) {
    const evs = eventsBySystem[node.id] || eventsBySystem[node.system] || [];
    // Delta over the last two events for this node = its current transition physics.
    let tension = 0, friction = 0, slope = 0;
    if (computeDelta && evs.length >= 2) {
      const d = computeDelta(evs[evs.length - 2], evs[evs.length - 1]);
      tension = d.tension || 0; friction = d.friction || 0; slope = d.slope || 0;
    }
    // Incoming edge friction (flow resistance into this node).
    const inEdges = graph.edges.filter(e => e.to === node.id || e.to === node.system);
    const edgeFriction = inEdges.reduce((m, e) => Math.max(m, e.friction || 0), 0);

    // Bottleneck score: friction dominates, tension adds, a stalled slope adds.
    const score = Math.min(1, 0.5 * Math.max(friction, edgeFriction) + 0.3 * tension + 0.2 * (slope < 0 ? Math.abs(slope) : 0));
    if (score >= 0.4) {
      const why = edgeFriction >= friction && edgeFriction > 0
        ? `high flow friction into ${node.name} (${edgeFriction.toFixed(2)})`
        : friction > tension
          ? `latency/stall at ${node.name} (friction ${friction.toFixed(2)})`
          : `rising load at ${node.name} (tension ${tension.toFixed(2)})`;
      bottlenecks.push({ node: node.id, name: node.name, where: node.system, why, score: +score.toFixed(2) });
    }
  }
  return bottlenecks.sort((a, b) => b.score - a.score);
}

module.exports = { buildMovementGraph, detectBottlenecks, _registryNodes, _frictionFor, MODULE_ID: 'copilot-movement-map', VERSION: '1.0.0' };
