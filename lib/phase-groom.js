'use strict';
/**
 * lib/phase-groom.js — SL3 (0.60.227): the backlog groomed. The phases Nexus can place but whose maps do not say so get a proposal;
 * what needs a choice is listed for a person. Deterministic: no model, no clock in the result.
 * comp_id: nexus.lib.phase-groom
 * Spec: docs/self-building-loop.spec MOD-SL-GROOM · Map: docs/2026-10-23-self-building-loop-phasemap.spec SL3
 *
 * James, 2026-10-23: "need to do something about the dependancy graph." Measured on Nexus's 166 maps (0.60.226): 535 phases with no
 * depends_on line, 565 open phases with no files, 3 cycles, 17 dangling references (16 of them words of prose), 251 same-file pairs
 * with no order between them.
 *
 * Reuse (§8.6), nothing new beside it: MP1 (lib/phase-map-auto.js forMaps: files from a phase's own words, dependencies from shared
 * files), DG3 (lib/phase-dag.js: the whole DAG, cycles, dangling, prose, conflicts), MP4's block editor (lib/phase-files.js applyTo:
 * adds only the keys a phase lacks, never replaces one).
 *
 *   groom({ maps, root, mapped }) → {
 *     proposals:  [{ map, phase, key, files?: [{ path, why }], dependsOn?: [{ on, file?, why }], from }]   one per phase at most
 *     forAPerson: [{ key, kind: cycle | dangling | prose | order | unplaced, why }]
 *     stats:      { maps, open, proposals, files, deps, order, forAPerson, unplaced, dagBefore, dagAfter }
 *   }
 *     files:      an open phase that names no files, where MP1 found existing files in its own words (evidence)
 *     dependsOn:  an open phase with no depends_on line, where MP1 found the earlier phase changing the same file; or a same-file
 *                 pair with no order, ordered by the DAG's layers (lower first, then key) — never an edge that closes a cycle
 *     unplaced:   an open phase MP1 cannot place at all: the agent maps it at build time (SL8), listed here
 *   apply({ maps, proposals }) → { changes: [{ path, content, files, deps }], refused: [why] }   the map edits; nothing written here
 *   lines(result) → what a person reads
 */
const MODULE_ID = 'nexus.lib.phase-groom';
const VERSION = '1.0.0';

const _short = (k) => String(k).split('::').pop();

function groom({ maps = [], root = null, mapped = null } = {}) {
  const PD = require('./phase-dag.js'), PF = require('./phase-files.js');
  let byKey = mapped;
  if (!byKey) {
    const PMA = require('./phase-map-auto.js');
    byKey = {}; for (const [k, m] of PMA.forMaps({ root, maps }).byKey) byKey[k] = m;
  }
  const before = PD.build(maps);
  const dag = PD.build(maps, { mapped: byKey });
  const proposals = new Map(), forAPerson = [];
  const prop = (key, map, phase) => { if (!proposals.has(key)) proposals.set(key, { key, map, phase, from: [] }); return proposals.get(key); };
  const phaseOf = new Map();
  for (const m of maps) for (const p of PF.phasesOf(m.text, m.path)) phaseOf.set(`${m.path}::${p.id}`, p);

  for (const n of Object.values(dag.nodes)) {
    if (n.done || n.decision || n.finding) continue;
    const p = phaseOf.get(n.key); if (!p) continue;
    const mp = byKey[n.key] || null;
    // files: named in its own words, existing (MP1 'evidence'); a phase written on one line cannot take a key in place
    if (!p.hasFiles && mp && mp.source === 'evidence') {
      const files = (mp.files || []).filter(f => f.exists).map(f => ({ path: f.path, why: f.why || 'named in the phase' }));
      if (files.length && !p.inline) { const x = prop(n.key, n.map, n.id); x.files = files; x.from.push('MP1: files named in its own words'); }
    }
    if (!(mp && (mp.files || []).length) && !p.hasFiles) forAPerson.push({ key: n.key, kind: 'unplaced', why: 'no file named and none found in its words — the agent maps it when it is built (SL8)' });
    // dependsOn: no depends_on line, and MP1 inferred one through a shared file that is now an edge in the DAG (cycle-checked there)
    if (!p.hasDeps && !p.inline) {
      const inferred = (mp && mp.dependsOnInferred) || [];
      const ok = inferred.filter(d => n.deps.includes(`${n.map}::${d.on}`));
      if (ok.length) { const x = prop(n.key, n.map, n.id); x.dependsOn = ok.map(d => ({ on: d.on, file: d.file, why: `both change ${d.file}` })); x.from.push('MP1: the nearest earlier phase changing the same file'); }
    }
  }
  // same-file pairs with no order: the lower layer first (SL0's rule), proposed on the later one when it has no depends_on line
  let order = 0;
  for (const c of dag.conflicts) {
    const a = dag.nodes[c.a], b = dag.nodes[c.b];
    const [first, then] = (a.layer ?? 0) < (b.layer ?? 0) || ((a.layer ?? 0) === (b.layer ?? 0) && a.key < b.key) ? [a, b] : [b, a];
    const p = phaseOf.get(then.key);
    const already = proposals.get(then.key);
    if (p && !p.hasDeps && !p.inline && first.map === then.map && !PD.reaches(dag, then.key, first.key)) {
      const x = prop(then.key, then.map, then.id);
      x.dependsOn = [...(x.dependsOn || []), ...((x.dependsOn || []).some(d => d.on === first.id) ? [] : [{ on: first.id, file: c.files[0], why: `both change ${c.files.join(', ')} with no order between them; ${first.id} is on the lower layer` }])];
      if (!x.from.includes('DG3: same-file order')) x.from.push('DG3: same-file order');
      order++;
    } else if (!already || !(already.dependsOn || []).some(d => d.on === first.id)) {
      forAPerson.push({ key: then.key, kind: 'order', why: `changes ${c.files.join(', ')} as ${_short(first.key)} does, with no order between them${p && p.hasDeps ? ' — it has a depends_on line already, so the order is his to add' : first.map !== then.map ? ' — across maps' : ''}` });
    }
  }
  for (const c of dag.cycles) forAPerson.push({ key: c[0], kind: 'cycle', why: `a cycle: ${c.map(_short).join(' → ')} — one depends_on must go` });
  for (const d of dag.dangling) forAPerson.push({ key: d.phase, kind: 'dangling', why: `its depends_on names ${d.ref}, which is no phase or decision in any map` });
  for (const x of dag.prose || []) forAPerson.push({ key: x.phase, kind: 'prose', why: `its depends_on says "${x.text}", which names no phase` });

  const list = [...proposals.values()].sort((a, b) => a.key.localeCompare(b.key));
  const stats = {
    maps: maps.length, open: dag.stats.open, proposals: list.length,
    files: list.filter(x => x.files).length, deps: list.filter(x => x.dependsOn).length, order,
    forAPerson: forAPerson.length, unplaced: forAPerson.filter(x => x.kind === 'unplaced').length,
    dagBefore: { edges: before.stats.edges, cycles: before.stats.cycles, dangling: before.stats.dangling, undeclared: before.stats.undeclared, conflicts: before.stats.conflicts },
    dagAfter: { edges: dag.stats.edges, inferred: dag.stats.inferred, inferredSkipped: dag.stats.inferredSkipped, cycles: dag.stats.cycles, dangling: dag.stats.dangling, conflicts: dag.stats.conflicts },
  };
  return { proposals: list, forAPerson: forAPerson.sort((a, b) => a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key)), stats };
}

/** apply({ maps, proposals }) → the map edits (applyTo adds only missing keys); a map whose phase count or YAML would change is refused */
function apply({ maps = [], proposals = [] } = {}) {
  const PF = require('./phase-files.js');
  const changes = [], refused = [];
  for (const m of maps) {
    const mine = proposals.filter(x => x.map === m.path);
    if (!mine.length) continue;
    const phases = PF.phasesOf(m.text, m.path);
    let text = m.text, nf = 0, nd = 0;
    for (const p of [...phases].sort((a, b) => b.line - a.line)) {
      const x = mine.find(y => y.phase === p.id); if (!x) continue;
      const r = PF.applyTo(text, p, { files: x.files ? x.files.map(f => f.path) : null, deps: x.dependsOn || null, note: x.files ? 'groomed (SL3): named in the phase\'s own words' : '' });
      if (r.error) { refused.push(r.error); continue; }
      if (r.text !== text) { text = r.text; if (x.files) nf++; if (x.dependsOn) nd++; }
    }
    if (text === m.text) continue;
    const before = phases.length, after = PF.phasesOf(text, m.path).length;
    let yb = true, ya = true; try { const y = require('js-yaml'); try { y.load(m.text); } catch (_) { yb = false; } try { y.load(text); } catch (_) { ya = false; } } catch (_) {}
    if (before !== after || (yb && !ya)) { refused.push(`${m.path}: the edit would ${before !== after ? `change its phase count (${before} → ${after})` : 'stop it parsing as YAML'} — not written`); continue; }
    changes.push({ path: m.path, content: text, files: nf, deps: nd });
  }
  return { changes, refused };
}

function lines(r) {
  const s = r.stats;
  const L = [`groomed ${s.maps} maps, ${s.open} open phases: ${s.proposals} proposals (${s.files} with files from their own words, ${s.deps} with a depends_on; ${s.order} same-file orders)`,
    `DAG: ${s.dagBefore.edges} → ${s.dagAfter.edges} edges (${s.dagAfter.inferred} inferred, ${s.dagAfter.inferredSkipped} left out because they would close a cycle) · cycles ${s.dagAfter.cycles} · dangling ${s.dagAfter.dangling} · same-file pairs with no order ${s.dagAfter.conflicts}`,
    `for a person: ${s.forAPerson} (${['cycle', 'dangling', 'prose', 'order', 'unplaced'].map(k => `${r.forAPerson.filter(x => x.kind === k).length} ${k}`).join(', ')}) — unplaced ones are mapped by the agent at build time (SL8)`];
  for (const x of r.forAPerson.filter(y => y.kind !== 'unplaced' && y.kind !== 'order').slice(0, 12)) L.push(`  ${x.kind}: ${_short(x.key)} — ${x.why}`);
  return L;
}

module.exports = { MODULE_ID, VERSION, groom, apply, lines };
