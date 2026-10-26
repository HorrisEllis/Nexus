'use strict';
/**
 * lib/phase-graph.js — DG2: a phase has a dependency graph before it executes.
 * comp_id: nexus.lib.phase-graph
 * Map: docs/2026-10-17-pieces-not-order-phasemap.spec (addendum f, DG2) · docs/CLAUDE.md "A dependency graph before every phase"
 *
 * James, 2026-10-18: "each phase, has to have a dependany graph before executing."
 *
 * WHY. DG1 (lib/phase-deps-gate.js, 0.60.125) refuses a build while what a phase depends_on is still open. Nothing required
 * the phase to have a graph at all: idearium's build used the phase's mapping as context when there was one, and when there
 * was none it went on ("no mapping: the request is sent as before"). IM1 (2026-10-17) ran ten attempts on four agents that way
 * and one of them wrote a new scanner beside the module the phase said to compose.
 *
 * Reuse, not a second mapper (§8.6): the graph is assembled from what Nexus already computes —
 *   the phase's mapping (lib/phase-map-auto.js mapPhase, MP1: files with their evidence, one hop of requires and consumers,
 *   the owning specs, phases inferred through shared files) · DG1's view of its depends_on (decisions and phases, open or not)
 *   · each file's system (lib/nexus-self/systems.js ownerOf for Nexus) and the boundary rule of lib/system-boundary.js
 *   (system → lib is the kernel; lib → a system, or a system → another, is a crossing that has to go through a route) —
 *   boundarySystemOf(root) names each file's system by the census's own rule, so the graph and the ratchet never disagree.
 *
 *   graphFor({ phase, map, mapped, mapText, depsGate, systemOf, kernel }) → {
 *     phase, map, source, ready, missing: [why], remedy,
 *     nodes: [{ path, role: changes | uses | used-by, exists, why, system }],
 *     edges: [{ from, to, kind: 'requires' }],
 *     systems: [system],                        the systems the phase changes
 *     crossings: [{ from, to, fromSystem, toSystem, kind: upward | system }],   edges that cross a boundary (said, not refused:
 *                                               the ratchet refuses a new one at test time; here the agent is told first)
 *     waitsOn: { phases: [{ key, status, open, inferred }], decisions: [{ key, status, open }] },
 *     specs: [path], hash }
 *   ready = the phase changes at least one file the graph can place. A phase that names nothing and maps to nothing has no
 *   graph; it is refused with how to give it one (name its files in the map, or `repo map-phases`). Pure.
 *   lines(graph) → what a person and an agent read.
 */
const crypto = require('crypto');

const VERSION = '1.0.0';
const KERNEL = 'lib';

const _stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x));

function _declaredDeps(mapText, phase) {
  try {
    const doc = require('js-yaml').load(mapText || '');
    const own = doc && doc.phases && doc.phases[phase];
    const v = own && own.depends_on;
    const list = Array.isArray(v) ? v : v == null ? [] : require('./phase-dag.js').items(String(v));
    const decisions = (doc && doc.decisions) || {};
    const PD = require('./phase-dag.js');   // §0.60.227 SL3 — the one depends_on item reader (an item's note is not its key)
    return list.filter(Boolean).map(x => PD.refKey(x, (t) => !!(decisions[t] || (doc.phases && doc.phases[t])))).filter(Boolean).map(key => ({ key, kind: decisions[key] ? 'decision' : 'phase' }));
  } catch (_) { return []; }
}

// §0.60.250 — a relocation phase declares the files it MOVES, so the graph can foresee the crossings the move CREATES
// (before the build, not "an hour later" when the boundary ratchet catches them at test time). Forms: a list [{from, to}]
// or a map { from: to }. `to` is the destination PATH; its system is read by the same systemOf the rest of the graph uses.
function _declaredMoves(mapText, phase) {
  try {
    const doc = require('js-yaml').load(mapText || '');
    const own = doc && doc.phases && doc.phases[phase];
    const v = own && own.moves;
    if (!v) return [];
    if (Array.isArray(v)) return v.filter(x => x && x.from && x.to).map(x => ({ from: x.from, to: x.to }));
    if (typeof v === 'object') return Object.entries(v).map(([from, to]) => ({ from, to }));
    return [];
  } catch (_) { return []; }
}

function _kind(a, b, kernel) {
  if (!a || !b || a === b) return null;
  if (b === kernel) return null;          // a system using the kernel: allowed
  if (a === kernel) return 'upward';      // the kernel reaching up into a system
  return 'system';                        // one system into another's files
}

function graphFor({ phase, map = null, mapped = null, mapText = '', depsGate = null, systemOf = null, kernel = KERNEL, baselineEdges = null, moves = null } = {}) {
  const sys = (p) => { if (typeof systemOf !== 'function') return null; try { return systemOf(p) || null; } catch (_) { return null; } };
  // §0.60.250 — relocation-aware: the system each file will be in AFTER this phase's moves. For a non-move phase this is just sys().
  const moveList = Array.isArray(moves) ? moves : _declaredMoves(mapText, phase);
  const moveTo = new Map(moveList.filter(mv => mv && mv.from && mv.to).map(mv => [mv.from, mv.to]));
  const sysAfter = (p) => (moveTo.has(p) ? sys(moveTo.get(p)) : sys(p));
  const m = mapped || {};
  const files = Array.isArray(m.files) ? m.files : [];
  const nodes = new Map();
  const put = (p, role, extra = {}) => { if (!p) return; const k = `${role}:${p}`; if (!nodes.has(k)) nodes.set(k, { path: p, role, system: sys(p), ...(moveTo.has(p) ? { movesTo: sys(moveTo.get(p)), movesToPath: moveTo.get(p) } : {}), ...extra }); };
  for (const f of files) put(f.path, 'changes', { exists: f.exists !== false, why: f.why || null });
  const edges = [];
  for (const r of m.requires || []) { put(r.path, 'uses', { exists: true }); if (r.by) edges.push({ from: r.by, to: r.path, kind: 'requires' }); }
  for (const c of m.consumers || []) { put(c.path, 'used-by', { exists: true }); if (c.of) edges.push({ from: c.path, to: c.of, kind: 'requires' }); }

  const crossings = [];
  if (typeof systemOf === 'function') for (const e of edges) {
    // §0.60.250 — evaluate each edge BOTH before and after the phase's moves. A crossing that exists only AFTER the move is
    // one the move CREATES — DG2 warns of it now, instead of the ratchet failing the build after the files are already moved.
    const aB = sys(e.from), bB = sys(e.to), kB = _kind(aB, bB, kernel);
    const aA = sysAfter(e.from), bA = sysAfter(e.to), kA = _kind(aA, bA, kernel);
    const k = kA || kB;
    if (!k) continue;
    crossings.push({ from: e.from, to: e.to,
      fromSystem: kA ? aA : aB, toSystem: kA ? bA : bB, kind: k,
      ...(kA && !kB ? { created: true } : {}),   // the move makes this crossing (it did not cross before)
      ...(!kA && kB ? { removed: true } : {}),    // the move removes this crossing (it crossed before, not after)
      known: baselineEdges ? baselineEdges.has(`${e.from} -> ${e.to}`) : null });   // in the ratchet's baseline already (IM4/DB6 move it), or not
  }

  const openKeys = new Map(((depsGate && depsGate.open) || []).map(o => [o.key, o]));
  const unknown = new Set((depsGate && depsGate.unknown) || []);
  const declared = _declaredDeps(mapText, phase);
  const waitsOn = { phases: [], decisions: [] };
  for (const d of declared) {
    const o = openKeys.get(d.key);
    const row = { key: d.key, status: o ? o.status : unknown.has(d.key) ? 'not found in the map' : 'closed', open: !!o };
    (d.kind === 'decision' || (o && o.kind === 'decision') ? waitsOn.decisions : waitsOn.phases).push(row);
  }
  for (const inf of m.dependsOnInferred || []) {
    const key = typeof inf === 'string' ? inf : inf.on || inf.key;
    if (key && !waitsOn.phases.some(p => p.key === key)) waitsOn.phases.push({ key, status: 'inferred: an earlier phase changes a file this one changes', open: null, inferred: true, file: inf.file || null });
  }

  const changes = [...nodes.values()].filter(n => n.role === 'changes');
  const missing = [];
  if (!mapped) missing.push('the phase was never mapped (lib/phase-map-auto.js gave nothing for it)');
  else if (!changes.length) missing.push(`it names no file it changes, and none could be found from its words (mapping source: ${m.source || 'none'})`);
  const ready = missing.length === 0;
  const systems = [...new Set(changes.flatMap(n => [n.system, n.movesTo]).filter(Boolean))];   // §0.60.250 — a move touches both the source and the destination system
  const body = { phase, map, nodes: [...nodes.values()].sort((a, b) => (a.role + a.path).localeCompare(b.role + b.path)), edges, crossings, waitsOn, specs: m.specs || [] };
  return {
    phase, map, source: m.source || 'none', ready, missing,
    remedy: ready ? null : `give ${phase} a graph: name its files under the phase in its map (files: [...]), or map it (\`repo map-phases <repo>\`), then build`,
    ...body, systems, version: VERSION,
    hash: crypto.createHash('sha1').update(_stable(body)).digest('hex').slice(0, 16),
  };
}

/** baselineEdges(root) — the crossings the ratchet already counts (contracts/drawbridge-baseline.json), as a Set of "a -> b" */
function baselineEdges(root) {
  try { return new Set((require('./system-boundary.js').readBaseline(root).edges || []).map(String)); } catch (_) { return null; }
}

/** boundarySystemOf(root) — a file's system by the boundary census's own rule (lib/system-boundary.js): its top folder when
 *  that folder is a system; lib/ is the kernel; tests, docs, scripts and test files belong to no system (never a crossing) */
function boundarySystemOf(root) {
  const SB = require('./system-boundary.js');
  const set = new Set(SB.systems(root));
  return (p) => {
    const rel = String(p || '').replace(/\\/g, '/');
    if (/\.test\.(c|m)?js$/.test(rel)) return null;
    const top = rel.split('/')[0];
    return set.has(top) ? top : null;
  };
}

function lines(g) {
  if (!g) return ['no graph'];
  const out = [`${g.phase}${g.map ? ` (${g.map})` : ''} — ${g.ready ? `dependency graph ${g.hash}` : 'NO DEPENDENCY GRAPH'} · mapping: ${g.source}`];
  if (!g.ready) { for (const m of g.missing) out.push(`  missing: ${m}`); if (g.remedy) out.push(`  ${g.remedy}`); return out; }
  const by = (role) => g.nodes.filter(n => n.role === role);
  out.push(`changes (${by('changes').length}): ${by('changes').map(n => `${n.path}${n.exists ? '' : ' (new)'}${n.movesTo ? ` [${n.system} → ${n.movesTo}]` : n.system ? ` [${n.system}]` : ''}`).join(', ')}`);
  if (by('uses').length) out.push(`uses (${by('uses').length}): ${by('uses').map(n => n.path).join(', ')}`);
  if (by('used-by').length) out.push(`used by (${by('used-by').length}) — what a change can break: ${by('used-by').map(n => n.path).join(', ')}`);
  if (g.systems.length) out.push(`systems: ${g.systems.join(', ')}`);
  if (g.crossings.length) for (const c of g.crossings) out.push(`${c.created ? 'MOVE CREATES A CROSSING' : c.removed ? 'move removes a crossing' : c.known === false ? 'NEW CROSSING' : 'crosses'} ${c.fromSystem} → ${c.toSystem}: ${c.from} → ${c.to} (${c.kind === 'upward' ? 'the kernel reaching up' : 'one system into another'}${c.created ? '; this phase moves the target across the boundary — design it out (a route/port) BEFORE the move, not after the ratchet fails' : c.known ? '; already in the ratchet\'s baseline' : c.known === false ? '; not in the baseline: go through a route, never a require' : ''})`);
  for (const d of g.waitsOn.decisions) out.push(`waits on decision ${d.key}: ${d.status}`);
  for (const p of g.waitsOn.phases) out.push(`waits on phase ${p.key}: ${p.status}${p.file ? ` (${p.file})` : ''}`);
  if (g.specs.length) out.push(`specs: ${g.specs.join(', ')}`);
  return out;
}

module.exports = { VERSION, KERNEL, graphFor, boundarySystemOf, baselineEdges, lines };
