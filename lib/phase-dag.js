'use strict';
/**
 * lib/phase-dag.js — DG3 (0.60.172): every phase of every phasemap sits in one dependency DAG, checked, and each phase carries
 * its slice of it. The standard from now on.
 * comp_id: nexus.lib.phase-dag
 * Map: docs/2026-10-19-pipeline-root-causes-phasemap.spec DG3, DG4
 *
 * James, 2026-10-19: "okay all of the idearium phases. every phasemap phase needs extensive dag, that needs to start being standard."
 *
 * DG1 (lib/phase-deps-gate.js) checks one phase's depends_on are closed; DG2 (lib/phase-graph.js) gives one phase its files, one
 * hop of requires/consumers and its systems. Neither sees the whole: a cycle, a depends_on naming a phase that exists nowhere, a
 * phase nothing can unblock, two phases changing the same file with no order between them. This builds the whole graph across
 * ALL of a repo's phasemaps (Nexus: every docs/*-phasemap.spec) from the phasemap parser loom already uses (§8.6) and the
 * mapping MP1 already computes.
 *
 *   build(maps, { mapped }) → dag
 *     maps:   [{ path, text }]                         every phasemap of the repo
 *     mapped: { '<map>::<key>': { files, requires, consumers, dependsOnInferred } }   optional, from managerView (MP1)
 *     dag = { nodes: { key → node }, edges: [{ from, to, kind: declared | inferred }], cycles: [[key]], dangling: [{ phase, ref }],
 *             undeclared: [key], layers: [[key]], order: [key], ready: [key], critical: [key], conflicts: [{ a, b, files }],
 *             stats, hash }
 *       node = { key, id, map, status, done, files, systems, line, deps: [key], dependents: [key], layer, declared: bool }
 *       an edge runs from the phase depended ON to the phase that depends (from → to = "from must finish first")
 *       declared: depends_on written in the map · inferred: MP1 found it through shared files (never overrides a declared one)
 *       undeclared: a phase whose map has no depends_on line for it at all — the standard says write one ([] when none)
 *       conflicts: two open phases change the same file and neither is upstream of the other — order them, or merge them
 *   slice(dag, key) → the phase's own view: upstream (transitive), downstream (transitive), blockedBy (open deps), unlocks, layer,
 *                     onCritical, inCycle, dangling, conflicts, undeclared — what goes on its graph, its run rows and the agent brief
 *   problems(dag, key) → the reasons a phase may not be built: in a cycle, a depends_on that resolves to nothing (DG3 gate)
 *   lines(slice) → what a person and an agent read
 * Pure: reads the texts it is given; writes nothing.
 */
const crypto = require('crypto');

const MODULE_ID = 'nexus.lib.phase-dag';
const VERSION = '1.0.0';
const DONE = new Set(['done', 'complete', 'completed', 'built']);

const _key = (map, id) => `${map}::${id}`;
const _sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);

function _parse(text, mapPath) {
  const loom = require('../loom/scanners/phasemap-map.js');
  const lines = String(text || '').split('\n');
  return loom.parsePhasemapText(text, mapPath).map(p => {
    const body = lines.slice(Math.max(0, (p.line || 1) - 1), p.bodyEnd || (p.line || 1) + 40).join('\n');
    return { ...p, declared: /^\s*depends_on\s*:/m.test(body) };
  });
}

function _refs(dependsOn) {
  if (!dependsOn) return [];
  return String(dependsOn).split(/[,\s]+/).map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).filter(s => !/^#/.test(s));
}

// a map's decisions (its `decisions:` block): a phase may depend on one — DG1 already treats them so (lib/phase-graph.js _declaredDeps)
function _decisions(text) {
  const out = []; const lines = String(text || '').split('\n');
  let i = lines.findIndex(l => /^decisions:\s*$/.test(l) || /^\s{2}decisions:\s*$/.test(l));
  if (i < 0) return out;
  const base = lines[i].match(/^(\s*)/)[1].length;
  for (i++; i < lines.length; i++) {
    const l = lines[i]; if (!l.trim() || /^\s*#/.test(l)) continue;
    const ind = l.match(/^(\s*)/)[1].length;
    if (ind <= base) break;
    const m = l.match(/^\s*([A-Za-z][\w-]*):\s*(.*)$/);
    if (m && ind === base + 2) { const body = lines.slice(i, i + 12).join('\n'); out.push({ id: m[1], decided: /status:\s*["']?(DECIDED|decided|done|chosen|answered)/.test(body), line: i + 1 }); }
  }
  return out;
}

function build(maps = [], { mapped = {}, crossMapConflicts = false } = {}) {
  const nodes = {}, byId = new Map();
  for (const m of maps) {
    for (const dc of _decisions(m.text)) {
      const key = _key(m.path, dc.id);
      if (nodes[key]) continue;
      nodes[key] = { key, id: dc.id, map: m.path, title: `decision ${dc.id}`, status: dc.decided ? 'decided' : 'open-decision', done: dc.decided, decision: true, line: dc.line,
        files: [], systems: [], declared: true, _refs: [], _inferred: [], deps: [], dependents: [] };
      if (!byId.has(dc.id)) byId.set(dc.id, []);
      byId.get(dc.id).push(key);
    }
  }
  for (const m of maps) {
    const seen = new Set();
    for (const p of _parse(m.text, m.path)) {
      const key = _key(m.path, p.id);
      const again = seen.has(p.id); seen.add(p.id);
      if (p.kind === 'decision' && nodes[key] && nodes[key].decision) continue;   // 0.60.188 — loom now reads BX0a-style ids; a decision stays one
      // 0.60.227 — a later key with the same id in the same map is a note about the phase (`changes:`, `honest_remaining:` …), not the
      // phase: the FIRST definition is the phase (idearium/repo/roadmap.js already reads it so, and warns duplicate_phase_id). Read
      // last-wins, the note replaced the real phase here (NP0_binaries lost its files and status; 11 such in 3 maps).
      if (again) continue;
      const mp = mapped[key] || null;
      const status = String(p.status || 'pending').toLowerCase();
      nodes[key] = { key, id: p.id, map: m.path, title: p.title || p.id, status, done: DONE.has(status), line: p.line || null,
        files: [...new Set([...(p.files || []), ...((mp && mp.files) || []).map(f => (typeof f === 'string' ? f : f.path))].filter(Boolean))],
        systems: p.systems || [], declared: p.declared, _refs: _refs(p.dependsOn), _inferred: (mp && mp.dependsOnInferred) || [], deps: [], dependents: [] };
      if (!byId.has(p.id)) byId.set(p.id, []);
      byId.get(p.id).push(key);
    }
  }
  const edges = [], dangling = [];
  const resolve = (ref, map) => {
    if (ref.includes('::')) return nodes[ref] ? ref : null;
    if (nodes[_key(map, ref)]) return _key(map, ref);
    const cands = byId.get(ref) || [];
    if (cands.length === 1) return cands[0];
    // a short key (SP4) for a long id (SP4_dag) in the same map
    const pre = Object.keys(nodes).filter(k => nodes[k].map === map && (nodes[k].id === ref || nodes[k].id.startsWith(`${ref}_`)));
    return pre.length === 1 ? pre[0] : null;
  };
  const seen = new Set();
  const add = (from, to, kind) => { const k = `${from}>${to}`; if (from === to || seen.has(k)) return; seen.add(k); edges.push({ from, to, kind }); nodes[to].deps.push(from); nodes[from].dependents.push(to); };
  for (const n of Object.values(nodes)) {
    for (const r of n._refs) { const k = resolve(r, n.map); if (k) add(k, n.key, 'declared'); else dangling.push({ phase: n.key, ref: r }); }
  }
  for (const n of Object.values(nodes)) {
    for (const r of n._inferred) { const k = resolve(String(r), n.map); if (k && !seen.has(`${n.key}>${k}`)) add(k, n.key, 'inferred'); }
  }
  for (const n of Object.values(nodes)) { delete n._refs; delete n._inferred; }

  // cycles: Tarjan's strongly connected components (size > 1, or a self-loop)
  const cycles = [];
  { let idx = 0; const st = [], on = new Set(), I = new Map(), L = new Map();
    const strong = (v) => {
      I.set(v, idx); L.set(v, idx); idx++; st.push(v); on.add(v);
      for (const w of nodes[v].dependents) {
        if (!I.has(w)) { strong(w); L.set(v, Math.min(L.get(v), L.get(w))); }
        else if (on.has(w)) L.set(v, Math.min(L.get(v), I.get(w)));
      }
      if (L.get(v) === I.get(v)) { const comp = []; let w; do { w = st.pop(); on.delete(w); comp.push(w); } while (w !== v); if (comp.length > 1) cycles.push(comp.sort()); }
    };
    for (const v of Object.keys(nodes)) if (!I.has(v)) strong(v); }
  const inCycle = new Set(cycles.flat());

  // layers (Kahn), cycle members left out and said
  const indeg = new Map(Object.keys(nodes).map(k => [k, nodes[k].deps.filter(d => !inCycle.has(d)).length]));
  const layers = []; let frontier = Object.keys(nodes).filter(k => !inCycle.has(k) && indeg.get(k) === 0).sort();
  while (frontier.length) {
    layers.push(frontier); const next = [];
    for (const k of frontier) { nodes[k].layer = layers.length - 1; for (const d of nodes[k].dependents) { if (inCycle.has(d)) continue; indeg.set(d, indeg.get(d) - 1); if (indeg.get(d) === 0) next.push(d); } }
    frontier = next.sort();
  }
  const order = layers.flat();

  const ready = order.filter(k => !nodes[k].done && !nodes[k].decision && nodes[k].deps.every(d => nodes[d].done));
  // critical path: the longest chain of OPEN phases (what most delays the end)
  const best = new Map();
  for (const k of order) {
    const n = nodes[k]; const w = n.done ? 0 : 1;
    let b = { len: w, prev: null };
    for (const d of n.deps) { const bd = best.get(d); if (bd && bd.len + w > b.len) b = { len: bd.len + w, prev: d }; }
    best.set(k, b);
  }
  let tail = null; for (const [k, b] of best) if (!tail || b.len > best.get(tail).len) tail = k;
  const critical = []; for (let k = tail; k; k = best.get(k).prev) critical.unshift(k);
  const criticalOpen = critical.filter(k => !nodes[k].done);

  // conflicts: open phases changing the same file with no order between them
  const reach = _reachAll(nodes);
  const conflicts = [];
  const open = Object.values(nodes).filter(n => !n.done && !n.decision && n.files.length);
  for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) {
    const a = open[i], b = open[j];
    const shared = a.files.filter(f => b.files.includes(f));
    if (!crossMapConflicts && a.map !== b.map) continue;   // across maps it is mostly old open phases on hot files: counted, not listed
    if (shared.length && !reach.get(a.key).has(b.key) && !reach.get(b.key).has(a.key)) conflicts.push({ a: a.key, b: b.key, files: shared });
  }
  const undeclared = Object.values(nodes).filter(n => !n.declared && !n.decision).map(n => n.key);
  const stats = { maps: maps.length, phases: Object.values(nodes).filter(n => !n.decision).length, decisions: Object.values(nodes).filter(n => n.decision).length, edges: edges.length, declared: edges.filter(e => e.kind === 'declared').length,
    inferred: edges.filter(e => e.kind === 'inferred').length, cycles: cycles.length, dangling: dangling.length, undeclared: undeclared.length,
    conflicts: conflicts.length, layers: layers.length, ready: ready.length, open: Object.values(nodes).filter(n => !n.done && !n.decision).length, openDecisions: Object.values(nodes).filter(n => n.decision && !n.done).length, criticalOpen: criticalOpen.length };
  const hash = _sha(JSON.stringify([Object.keys(nodes).sort(), edges.map(e => `${e.from}>${e.to}:${e.kind}`).sort()]));
  return { nodes, edges, cycles, dangling, undeclared, layers, order, ready, critical: criticalOpen, conflicts, stats, hash, _reach: reach };
}

function _reachAll(nodes) {
  const memo = new Map();
  const down = (k, stack = new Set()) => {
    if (memo.has(k)) return memo.get(k);
    if (stack.has(k)) return new Set();
    stack.add(k);
    const s = new Set();
    for (const d of nodes[k].dependents) { s.add(d); for (const x of down(d, stack)) s.add(x); }
    stack.delete(k); memo.set(k, s); return s;
  };
  for (const k of Object.keys(nodes)) down(k);
  return memo;
}

function _resolveKey(dag, key) {
  if (dag.nodes[key]) return key;
  const hit = Object.keys(dag.nodes).filter(k => dag.nodes[k].id === key || k.endsWith(`::${key}`));
  return hit.length === 1 ? hit[0] : null;
}

function slice(dag, key) {
  const k = _resolveKey(dag, key);
  if (!k) return null;
  const n = dag.nodes[k];
  const reach = dag._reach || _reachAll(dag.nodes);
  const downstream = [...(reach.get(k) || [])].sort();
  const upstream = Object.keys(dag.nodes).filter(x => (reach.get(x) || new Set()).has(k)).sort();
  const cyc = dag.cycles.find(c => c.includes(k)) || null;
  return {
    key: k, id: n.id, map: n.map, status: n.status, layer: n.layer ?? null, declared: n.declared,
    deps: n.deps, dependents: n.dependents, upstream, downstream,
    blockedBy: n.deps.filter(d => !dag.nodes[d].done),
    unlocks: n.dependents.filter(d => dag.nodes[d].deps.every(x => x === k || dag.nodes[x].done)),
    ready: !n.done && n.deps.every(d => dag.nodes[d].done),
    onCritical: dag.critical.includes(k),
    inCycle: cyc, dangling: dag.dangling.filter(x => x.phase === k).map(x => x.ref),
    conflicts: dag.conflicts.filter(c => c.a === k || c.b === k).map(c => ({ with: c.a === k ? c.b : c.a, files: c.files })),
    files: n.files, dagHash: dag.hash,
  };
}

function problems(dag, key) {
  const s = slice(dag, key);
  if (!s) return [`${key} is not in any phasemap the DAG read`];
  const out = [];
  if (s.inCycle) out.push(`it is in a dependency cycle: ${s.inCycle.join(' → ')} — no order can satisfy it; break one depends_on`);
  if (s.dangling.length) out.push(`its depends_on names ${s.dangling.join(', ')}, which is no phase in any map — fix the name or add the phase`);
  return out;
}

const _short = (k) => String(k).split('::').pop();
function lines(s) {
  if (!s) return ['no DAG slice'];
  const L = [`DAG ${s.dagHash} · layer ${s.layer ?? '—'}${s.onCritical ? ' · ON THE CRITICAL PATH' : ''}${s.ready ? ' · ready' : s.blockedBy.length ? ` · blocked by ${s.blockedBy.map(_short).join(', ')}` : ''}`];
  L.push(`depends on (${s.deps.length}): ${s.deps.map(_short).join(', ') || '—'}${s.upstream.length > s.deps.length ? ` · all upstream ${s.upstream.length}` : ''}`);
  L.push(`needed by (${s.dependents.length}): ${s.dependents.map(_short).join(', ') || '—'}${s.downstream.length > s.dependents.length ? ` · all downstream ${s.downstream.length}` : ''}${s.unlocks.length ? ` · finishing it unlocks ${s.unlocks.map(_short).join(', ')}` : ''}`);
  if (!s.declared) L.push('no depends_on line in its map — the standard is to write one ([] when it depends on nothing)');
  if (s.inCycle) L.push(`CYCLE: ${s.inCycle.map(_short).join(' → ')}`);
  if (s.dangling.length) L.push(`DANGLING depends_on: ${s.dangling.join(', ')}`);
  for (const c of s.conflicts.slice(0, 5)) L.push(`same files as ${_short(c.with)} with no order between them: ${c.files.join(', ')}`);
  if (s.conflicts.length > 5) L.push(`… and ${s.conflicts.length - 5} more phases sharing its files without an order`);
  return L;
}

module.exports = { MODULE_ID, VERSION, build, slice, problems, lines };
