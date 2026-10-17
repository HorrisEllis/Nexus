'use strict';
/**
 * lib/drawbridge-registry.js — DB9 + DB10: a system's registry, generated as its dependency graph, with its negative space (0.60.127)
 * comp_id: nexus.lib.drawbridge-registry
 * UUID: nexus-lib-drawbridge-registry-v1-0000-2026-1017-jamesbrooks-001
 * Map: docs/2026-10-17-system-drawbridge-phasemap.spec (addendum a: DB9_every_repo_generates_its_registry,
 *      DB10_shadow_and_negative_space_at_the_drawbridge)
 *
 * James, 2026-10-17: "shadow and negative space reasoning for debugging. maybe every repo has to generate a component
 * registry. the component registry can also be a dependancy graph?" · "cos is the isolated compartment for each system using
 * the regisry as a drawbridge"
 *
 * Named drawbridge-registry, not system-registry: lib/system-registry.js is his 2026-09-06 "need a system registry" (the
 * running kernels: ports, health, versions, merged from autopilot, diagnostic and lib/version.js). This first shipped under that
 * name and overwrote it; it was restored the same day (0.60.127). That module is the runtime half of the same registry (DB5).
 *
 * Nothing new is scanned here; three existing pieces are composed (§8.6):
 *   - the DECLARED half: each system's registry-components.js, read and checked against its source by loom
 *     (loom/scanners/capability-map.js loadAll + verifyRoutes + resolveWires): its routes, which are served, its wires.
 *   - the OBSERVED half: lib/system-boundary.js (DB1): every require() into or out of the system.
 *   - the NEGATIVE SPACE, his idea of 2026-09-29, built as lib/shadow.js: the registry is the shadow (what the system says it
 *     is); what the source holds is what is present. Read as data:
 *       absent — declared but not there: a route the source does not serve, a wire that names nothing
 *       extra  — there but not declared: a file another system reaches into directly (a way past the drawbridge)
 *
 *   registryOf(system, { root })  → { system, declared, observed, negative }   (pure: reads, writes nothing)
 *   graph({ root })                → { systems: [{ id, declared, depends_on, consumed_by }], edges: [{ from, to, kind, count }] }
 *   settle(system, { root })       → registryOf + shadow.settle: each absence becomes a gap and a liminal item (writes gaps)
 *
 * Limits, said: a route is "served" when its static path segments appear in the system's source (loom's evidence, weaker for
 * parameterised paths); a declared capability that no one CALLS cannot be seen from source (that needs the bus, DB4).
 */
const path = require('path');

const MODULE_ID = 'nexus.lib.drawbridge-registry';
const VERSION = '1.0.0';

function _CM() { return require('../loom/scanners/capability-map.js'); }
function _SB() { return require('./system-boundary.js'); }

let _declCache = null;
function _declared() {
  if (_declCache) return _declCache;
  const CM = _CM();
  const decls = CM.loadAll();
  const { served, unserved } = CM.verifyRoutes(decls);
  const { edges, dangling } = CM.resolveWires(decls, served);
  return (_declCache = { decls, served, unserved, edges, dangling });
}

function _declaredFor(system) {
  const D = _declared();
  const mine = D.decls.filter(d => d._dir === system);
  const ids = new Set(mine.map(d => d.id));
  const hookOwner = (hid) => String(hid).replace(/\.(in|out)(\.[^.]*)?$/, '');
  return {
    file: mine.length ? mine[0]._sourceFile : null,
    routes: mine.length,
    served: mine.filter(d => D.served.get(d.id)).length,
    unserved: D.unserved.filter(u => u.dir === system),
    wires: D.edges.filter(e => ids.has(hookOwner(e.from)) || [...ids].some(i => String(e.from).startsWith(i + '.'))),
    dangling: D.dangling.filter(w => [...ids].some(i => String(w.from).startsWith(i + '.'))),
    ids: [...ids],
  };
}

function _group(list, key) {
  const m = new Map();
  for (const c of list) { const k = c[key]; const g = m.get(k) || { system: k, kind: c.kind, edges: 0 }; g.edges++; m.set(k, g); }
  return [...m.values()].sort((a, b) => b.edges - a.edges);
}

/** registryOf(system) — the generated registry: declared (the shadow), observed (the source), negative (the difference) */
function registryOf(system, { root, scan } = {}) {
  root = path.resolve(root || path.join(__dirname, '..'));
  const SB = _SB();
  if (!SB.systems(root).includes(system)) return { ok: false, error: `not a system: ${system} (a system is a top-level folder: ${SB.systems(root).join(', ')})` };
  const s = scan || SB.scan({ root });
  const out = s.crossings.filter(c => c.fromSystem === system);
  const inn = s.crossings.filter(c => c.toSystem === system);
  const offers = new Map();
  for (const c of inn) { const o = offers.get(c.to) || { file: c.to, consumers: [] }; o.consumers.push(c.from); offers.set(c.to, o); }
  const declared = _declaredFor(system);
  const reachedPast = [...offers.values()].filter(o => o.consumers.some(f => !f.startsWith('lib/') || system !== 'lib'))
    .map(o => ({ file: o.file, consumers: o.consumers.length, from: [...new Set(o.consumers.map(f => f.split('/')[0]))] }))
    .sort((a, b) => b.consumers - a.consumers);
  return {
    ok: true,
    system,
    declared: { file: declared.file, routes: declared.routes, served: declared.served, wires: declared.wires.length },
    observed: {
      depends_on: _group(out, 'toSystem'),
      consumed_by: _group(inn, 'fromSystem'),
      offers: reachedPast.length,
    },
    negative: {
      absent: {
        routes: declared.unserved.map(u => ({ id: u.id, route: u.route, why: 'declared in the registry; the source does not serve it' })),
        wires: declared.dangling.map(w => ({ from: w.from, target: w.target, why: w.why })),
      },
      extra: {
        reached_directly: reachedPast.map(o => ({ ...o, why: `another system requires this file directly; the registry declares no capability for it, so the call goes past the drawbridge` })),
        no_registry: declared.file ? null : `${system} has no registry-components.js: everything it offers is undeclared`,
      },
    },
  };
}

/** graph() — every system as a node, every crossing pair as an edge: the dependency graph between systems */
function graph({ root } = {}) {
  root = path.resolve(root || path.join(__dirname, '..'));
  const SB = _SB();
  const s = SB.scan({ root });
  const pairs = new Map();
  for (const c of s.crossings) { const k = `${c.fromSystem}|${c.toSystem}`; const p = pairs.get(k) || { from: c.fromSystem, to: c.toSystem, kind: c.kind, count: 0 }; p.count++; pairs.set(k, p); }
  const edges = [...pairs.values()].sort((a, b) => b.count - a.count);
  const systems = SB.systems(root).map(id => {
    const d = _declaredFor(id);
    return {
      id,
      declared: { routes: d.routes, served: d.served, registry: !!d.file },
      depends_on: edges.filter(e => e.from === id).map(e => e.to),
      consumed_by: edges.filter(e => e.to === id).map(e => e.from),
    };
  });
  return { ok: true, systems, edges };
}

/** settle(system) — the shadow settled: each absence (a declared route not served, a wire that names nothing) becomes a gap */
function settle(system, opts = {}) {
  const r = registryOf(system, opts);
  if (!r.ok) return r;
  const SH = require('./shadow.js');
  const D = _declaredFor(system);
  const sh = SH.declare({ step: `drawbridge.${system}`, expects: { fields: D.ids }, subject: `${system}'s registry, against its source` });
  const servedIds = D.ids.filter(id => _declared().served.get(id));
  const keep = console.warn; console.warn = () => {};   // the absences are returned and recorded as gaps; not printed twice
  let res; try { res = SH.settle(sh, { fields: servedIds, events: [] }); } finally { console.warn = keep; }
  return { ...r, settled: { ok: res.ok, absent: res.absent.fields.length, gaps: res.gaps.filter(g => g.gapId).length, shadowId: res.shadowId } };
}

function _resetForTest() { _declCache = null; }

module.exports = { MODULE_ID, VERSION, registryOf, graph, settle, _resetForTest };
