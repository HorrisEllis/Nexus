'use strict';
/**
 * lib/build-queue.js — SL0: what can be built now, in order, and why every other open phase cannot. Deterministic: no clock, no
 * model; the same maps and records give the same answer.
 * comp_id: nexus.lib.build-queue
 * Spec: docs/self-building-loop.spec MOD-SL-QUEUE (and MOD-SL-STATS, SL6). Map: docs/2026-10-23-self-building-loop-phasemap.spec SL0.
 *
 * James, 2026-10-23: "whats the most important? can you help me build, invent, innovate, ways for idearium to build phases, all of
 * them, we need this to work so it can start building itself." · "contiue getting idearium building phases"
 * Found: no command listed which phases can be built now; "pending" was often stale (GA1 shipped 0.60.161 and still said pending),
 * and the build refuses a phase with no files (DG2) or an open dependency (DG1) only after it is asked.
 *
 * Stands on (§8.6): lib/phase-dag.js (DG3: the whole DAG, its cycles, dangling refs, same-file conflicts, layers, slices) and
 * lib/phase-census.js (CNS1: each phase judged against its evidence). Flights (FR6) are passed in by the caller.
 *
 * Each open phase is put in exactly one place, by the first rule that applies, in this order:
 *   decision        it is one of his open decisions, or depends on one          → he decides (named)
 *   deps-open       a phase it depends on is open                               → that phase first (named)
 *   cycle           it is in a dependency cycle                                 → a person breaks the cycle
 *   dangling        a depends_on names nothing                                  → fix the name in its map
 *   no-files        it names no files (the build refuses it: DG2 NO_GRAPH)       → name its files (SL3 proposes them)
 *   done-by-evidence the census judges it built though its map says open        → close it (SL2 runs its tests)
 *   held            its last three flights all failed                           → read the flights; change the brief
 *   conflict        it and another buildable phase change the same file, no order → after the other (named)
 *   queue           everything else: ordered by DAG layer, then how many open phases wait on it, then key
 *
 *   queue({ maps, root, census, flights }) → { queue: QueueEntry[], blocked: Blocked[], counts }
 *   lines(result, { limit }) → string[]
 */
const VERSION = '1.0.0';
const GROUPS = ['decision', 'deps-open', 'cycle', 'dangling', 'no-files', 'done-by-evidence', 'held', 'conflict'];

function _short(key) { return String(key).split('::').pop(); }

/**
 * maps     [{ path, text }]  every phasemap of the repo (Nexus: docs/*-phasemap.spec)
 * census   { phases: [{ id, map, verdict }] } | null   lib/phase-census.js census() — null: the done-by-evidence rule is skipped, said
 * flights  [{ key, verdict, landed }]   oldest first; a phase whose last three did not land is held
 */
function queue({ maps = [], census = null, flights = [] } = {}) {
  const DAG = require('./phase-dag.js');
  const dag = DAG.build(maps, {});
  const nodes = dag.nodes;
  const open = Object.values(nodes).filter(n => !n.done && !n.decision).sort((a, b) => a.key.localeCompare(b.key));
  const inCycle = new Set(); for (const c of dag.cycles || []) for (const k of c) inCycle.add(k);
  const dangling = new Map(); for (const d of dag.dangling || []) { const k = d.phase; if (!dangling.has(k)) dangling.set(k, []); dangling.get(k).push(d.ref); }
  const verdict = new Map(); for (const p of (census && census.phases) || []) verdict.set(`${p.map}::${p.id}`, p.verdict);
  const recent = new Map(); for (const f of flights) { if (!f || !f.key) continue; if (!recent.has(f.key)) recent.set(f.key, []); recent.get(f.key).push(f); }
  const downstreamOpen = (key) => { let n = 0; try { const s = DAG.slice(dag, key); for (const k of s.downstream || []) if (nodes[k] && !nodes[k].done) n++; } catch (_) {} return n; };

  const blocked = [], candidates = [];
  for (const n of open) {
    const deps = (n.deps || []).map(k => nodes[k]).filter(Boolean);
    const openDecision = deps.filter(d => d.decision && !d.done);
    const openDeps = deps.filter(d => !d.decision && !d.done);
    const isDecision = /decision/i.test(String(n.status || ''));
    let b = null;
    if (isDecision) b = { group: 'decision', why: 'this phase is his open decision', unblock: 'his decision (with his words)' };
    else if (openDecision.length) b = { group: 'decision', why: `waits on his decision: ${openDecision.map(d => _short(d.key)).join(', ')}`, unblock: `decide ${openDecision.map(d => d.id).join(', ')}` };
    else if (openDeps.length) b = { group: 'deps-open', why: `depends on open: ${openDeps.map(d => d.id).join(', ')}`, unblock: `finish ${openDeps.map(d => d.id).join(', ')} first` };
    else if (inCycle.has(n.key)) b = { group: 'cycle', why: 'it is in a dependency cycle', unblock: 'a person breaks the cycle (drop one depends_on)' };
    else if (dangling.has(n.key)) b = { group: 'dangling', why: `depends_on names nothing: ${dangling.get(n.key).join(', ')}`, unblock: 'fix the name in its map' };
    else if (!(n.files || []).length) b = { group: 'no-files', why: 'it names no files, so the build refuses it (DG2 NO_GRAPH)', unblock: 'name its files (SL3 proposes them from its words)' };
    else if (verdict.get(n.key) === 'done') b = { group: 'done-by-evidence', why: 'the census judges it built (its files and a record that names it), though its map says open', unblock: 'close it: its tests run first (SL2)' };
    else {
      const f = (recent.get(n.key) || []).slice(-3);
      if (f.length === 3 && f.every(x => !x.landed)) b = { group: 'held', why: `its last three runs did not land (${f.map(x => x.verdict || 'failed').join(', ')})`, unblock: 'read the flights; change the brief or the agent before building again' };
    }
    if (b) blocked.push({ key: n.key, map: n.map, id: n.id, ...b });
    else candidates.push(n);
  }

  // same-file pairs with no order: the first of each pair (by layer, then key) is built, the other waits for it
  const cand = new Set(candidates.map(n => n.key));
  const later = new Map();
  for (const c of dag.conflicts || []) {
    if (!cand.has(c.a) || !cand.has(c.b)) continue;
    const [x, y] = [nodes[c.a], nodes[c.b]].sort((p, q) => (p.layer - q.layer) || p.key.localeCompare(q.key));
    if (!later.has(y.key)) later.set(y.key, { other: x, files: c.files || [] });
  }
  const queued = [];
  for (const n of candidates) {
    const l = later.get(n.key);
    if (l && !later.has(l.other.key)) { blocked.push({ key: n.key, map: n.map, id: n.id, group: 'conflict', why: `${l.other.id} changes the same file${l.files.length > 1 ? 's' : ''} (${l.files.slice(0, 3).join(', ')}) with no order between them`, unblock: `after ${l.other.id} (or order them in the maps)` }); continue; }
    queued.push({ key: n.key, map: n.map, id: n.id, layer: n.layer ?? 0, unlocks: downstreamOpen(n.key), files: n.files || [],
      why: 'ready: its dependencies are closed, it names files, no open decision, not already done by evidence, no unordered same-file phase' });
  }
  queued.sort((a, b) => (a.layer - b.layer) || (b.unlocks - a.unlocks) || a.key.localeCompare(b.key));

  const byGroup = Object.fromEntries(GROUPS.map(g => [g, blocked.filter(x => x.group === g).length]));
  return {
    version: VERSION,
    queue: queued,
    blocked: blocked.sort((a, b) => (GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group)) || a.key.localeCompare(b.key)),
    counts: { maps: maps.length, phases: Object.values(nodes).filter(n => !n.decision).length, open: open.length, queue: queued.length, byGroup },
    ...(census ? {} : { said: ['no census given: the done-by-evidence rule was not applied'] }),
  };
}

function lines(r, { limit = 15 } = {}) {
  const L = [`${r.counts.open} open phases across ${r.counts.maps} maps — ${r.counts.queue} can be built now`];
  for (const [i, q] of r.queue.slice(0, limit).entries()) L.push(`  ${String(i + 1).padStart(2)}. ${q.id}  (${q.map.split('/').pop().replace(/-phasemap\.spec$/, '')}; unlocks ${q.unlocks})`);
  if (r.queue.length > limit) L.push(`  … ${r.queue.length - limit} more`);
  L.push('blocked:');
  for (const g of GROUPS) if (r.counts.byGroup[g]) L.push(`  ${g.padEnd(17)} ${String(r.counts.byGroup[g]).padStart(4)}  e.g. ${r.blocked.find(b => b.group === g).id}: ${r.blocked.find(b => b.group === g).why}`);
  for (const s of r.said || []) L.push(`said: ${s}`);
  return L;
}

module.exports = { VERSION, GROUPS, queue, lines };
