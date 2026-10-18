'use strict';
/**
 * intelligence/lattice/node-lattice.js — GM4 (0.60.157): every data node of every system, one lattice, its edges typed.
 * comp_id: nexus.intelligence.node-lattice
 *
 * James, 2026-10-18: "associative lattice, every data node, is a node in the associative lattice, interconnected by the timestamp
 * and cuasal graph." Map: docs/2026-10-18-gate-memory-phasemap.spec GM4; layer 1 of docs/2026-10-18-gating-census-phasemap.spec.
 *
 * A projection, never a store: each system's nodes are read through Idearium's GET /api/system/nodes/:system?edges=1
 * (lib/node-edges.js reads the files there), never the files from here; the registries stay the truth. Edges, from what the
 * nodes already say:
 *   causal     a node's causedBy names another node                                       strongest
 *   wire       a .wire node joins two systems (lib/system-nodes.js)
 *   reference  a node's text names another node's id
 *   temporal   two nodes that HAPPENED within a window of each other (their payload's own time, not when their file was
 *              written) — context, NEVER a cause; the kind travels with every answer
 *   (his reading of "the timestamp and cuasal graph": both, kept apart by kind — the GM4 pushback)
 *
 *   build({ read, systems }) → Promise<lattice>      read(system) → Promise<{ nodes }>  (default: Idearium's route)
 *   lattice.neighbours({ node, refs, text, kinds, window, limit }) → { seeds, neighbours: [{ id, key, system, type, kind, score, at, text }] }
 *   lattice.stats() → { nodes, edges: { causal, wire, reference, temporal: 'computed per ask' }, systems: { read, failed }, dangling }
 *   get(opts) → the lattice, rebuilt when older than ttlMs (60 s)
 */

const MODULE_ID = 'nexus.intelligence.node-lattice';
const VERSION = '1.0.0';
const SCORE = { causal: 1, wire: 0.8, reference: 0.7, temporal: 0.3 };
const MIN_ID = 6;   // shorter ids ('GET', 'system') would join everything to everything

// the systems that keep nodes, from Idearium's route (GET /api/system/nodes): a folder with data/nodes, whatever its name
async function _systems() { return (await require('../../lib/nexus-client.js').get('idearium', '/api/system/nodes', { timeout: 10000 })).systems || []; }
const _viaRoute = (system) => require('../../lib/nexus-client.js').get('idearium', `/api/system/nodes/${encodeURIComponent(system)}?edges=1`, { timeout: 20000 });
const _toks = (s) => String(s || '').toLowerCase().split(/[^a-z0-9_.-]+/).filter(t => t.length > 2);

async function build({ read = _viaRoute, systems = null } = {}) {
  if (!systems) systems = await _systems();
  const nodes = new Map(), byId = new Map(), out = new Map(), sysRead = [], sysFailed = [];
  const add = (k, edge) => { if (!out.has(k)) out.set(k, []); out.get(k).push(edge); };
  const results = await Promise.allSettled(systems.map(s => Promise.resolve().then(() => read(s)).then(r => ({ s, r }))));
  results.forEach((x, i) => {
    if (x.status === 'fulfilled' && x.value.r && x.value.r.missing) { sysFailed.push({ system: systems[i], why: 'no data/nodes folder' }); return; }
    if (x.status !== 'fulfilled' || !x.value.r || !Array.isArray(x.value.r.nodes)) { sysFailed.push({ system: systems[i], why: x.status === 'rejected' ? String(x.reason && x.reason.message || x.reason).slice(0, 160) : 'no nodes in the answer' }); return; }
    sysRead.push(systems[i]);
    for (const n of x.value.r.nodes) {
      const key = `${n.system || systems[i]}/${n.type}:${n.id}`;
      nodes.set(key, { ...n, system: n.system || systems[i], key });
      if (!byId.has(n.id)) byId.set(n.id, []);
      byId.get(n.id).push(key);
      byId.set(`${n.type}:${n.id}`, [...(byId.get(`${n.type}:${n.id}`) || []), key]);   // typed references (D10's <kind>:<id>)
    }
  });
  const counts = { causal: 0, wire: 0, reference: 0 };
  let dangling = 0;
  const sysNodes = new Map([...nodes.values()].filter(n => n.type === 'system').map(n => [n.id, n]));
  const sysKey = (name) => sysNodes.get(name) || null;
  for (const n of nodes.values()) {
    for (const c of n.causedBy || []) {
      const to = byId.get(c);
      if (!to) { dangling++; continue; }
      for (const k of to) if (k !== n.key) { add(n.key, { to: k, kind: 'causal' }); add(k, { to: n.key, kind: 'causal' }); counts.causal++; }
    }
    if (n.type === 'wire' && n.wire) {
      for (const s of [n.wire.from, n.wire.to]) {
        const sk = sysKey(s);
        if (sk && sk.key !== n.key) { add(n.key, { to: sk.key, kind: 'wire' }); add(sk.key, { to: n.key, kind: 'wire' }); counts.wire++; }
      }
    }
    // an id named inside a sentence ("see gap-1") is a reference too: each string, and each of its whitespace-separated words
    const named = new Set();
    for (const s of n.strings || []) { named.add(s); for (const w of s.split(/[\s,;'"()\[\]<>]+/)) named.add(w.replace(/[.:]+$/, '')); }
    for (const s of named) {
      if (s.length < MIN_ID) continue;
      const to = byId.get(s);
      if (!to || to.length > 8) continue;   // an id shared by many nodes is a name, not a reference
      for (const k of to) if (k !== n.key) { add(n.key, { to: k, kind: 'reference' }); add(k, { to: n.key, kind: 'reference' }); counts.reference++; }
    }
  }
  // temporal joins only between nodes whose time is when they happened (atFrom 'payload'); an export time says when a file was
  // written, and a batch export would join hundreds of nodes that have nothing to do with each other
  const timed = [...nodes.values()].filter(n => n.at && n.atFrom === 'payload').sort((a, b) => a.at - b.at);

  function _seeds({ node, refs, text }) {
    const want = [].concat(node || [], refs || []).map(String).filter(Boolean);
    const seeds = new Set();
    for (const w of want) { if (nodes.has(w)) seeds.add(w); for (const k of byId.get(w) || []) seeds.add(k); }
    if (!seeds.size && text) {
      const t = _toks(text);
      const scored = [...nodes.values()].map(n => { const hay = `${n.id} ${n.summary || ''}`.toLowerCase(); return [n.key, t.filter(w => hay.includes(w)).length]; })
        .filter(([, s]) => s >= Math.max(1, Math.ceil(t.length / 2))).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);
      for (const [k] of scored) seeds.add(k);
    }
    return [...seeds];
  }

  function neighbours({ node = null, refs = [], text = '', kinds = null, window = 60000, limit = 20 } = {}) {
    const seeds = _seeds({ node, refs, text });
    const want = new Set(kinds || ['causal', 'wire', 'reference', 'temporal']);
    const best = new Map();
    const put = (k, kind, score) => { if (seeds.includes(k)) return; const p = best.get(k); if (!p || p.score < score) best.set(k, { kind, score }); };
    for (const s of seeds) {
      for (const e of out.get(s) || []) if (want.has(e.kind)) put(e.to, e.kind, SCORE[e.kind]);
      const n = nodes.get(s);
      if (want.has('temporal') && n && n.at && n.atFrom === 'payload') {
        for (const m of timed) { const dt = Math.abs(m.at - n.at); if (dt <= window && m.key !== s) put(m.key, 'temporal', +(SCORE.temporal * (1 - dt / window)).toFixed(3)); }
      }
    }
    const list = [...best.entries()].map(([k, v]) => { const n = nodes.get(k); return { id: n.id, key: k, system: n.system, type: n.type, kind: v.kind, score: v.score, at: n.at || null, text: n.summary || n.id }; })
      .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)).slice(0, limit);
    return { seeds, neighbours: list };
  }

  const stats = () => ({ nodes: nodes.size, edges: { ...counts, temporal: 'computed per ask (window)' }, systems: { read: sysRead.sort(), failed: sysFailed }, dangling, timed: timed.length });
  return { neighbours, stats, builtAt: Date.now() };
}

let _cache = null;
async function get({ ttlMs = 60000, ...opts } = {}) {
  if (_cache && Date.now() - _cache.builtAt < ttlMs) return _cache;
  _cache = await build(opts);
  return _cache;
}
function reset() { _cache = null; }

module.exports = { MODULE_ID, VERSION, SCORE, build, get, reset };
