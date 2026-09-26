'use strict';
/**
 * loom/scanners/capability-map.js — ingests the CAPABILITY/CONSUMER registry
 * (the 13 registry-components.js files) into loom, and checks each declared
 * route against the source that is supposed to serve it.
 * comp_id: nexus.loom.scanners.capability-map
 * UUID: nexus-loom-scanner-capability-v1-0000-2026-0804-001
 *
 * WHY (James, 2026-08-04): "I want this all mapped to the component and
 * consumer registry."
 *
 * ── THERE ARE TWO DIFFERENT GRAPHS AND THEY ARE NOT THE SAME GRAPH ──────────
 * loom/scanners/source-map.js answers "which FILE requires which file" — 885
 * components, structural, derived from require()/import.
 * This file answers "which CAPABILITY is consumed by which capability" — 280
 * components, semantic, derived from what each system DECLARES about itself:
 * its routes, its in/out hooks, and its `wires_to` consumer edges.
 *
 * A file graph cannot express "cortex.raid.decide dispatches to
 * ollama.jobs.dispatch.receive over HTTP" — there is no require() between them.
 * A capability graph cannot express "meta/rfr2/clip requires meta/rfr2/kernel".
 * Both are real. Merging them into one id-space would produce a graph that is
 * neither, so they are declared side by side in DIFFERENT id namespaces:
 * file components are `nexus.*`, capability components keep their native ids
 * (`cortex.health`, `guardian.job.dispatch`) exactly as the systems declare
 * them. No collisions, and either graph can be read alone.
 *
 * ── THE DECLARATIONS ARE NOT AUTOMATICALLY TRUE ─────────────────────────────
 * §1.1 — a declared route is a claim, not a capability. So every route is
 * checked against the source of the system that owns it before it is treated
 * as real (verifyRoutes below). A capability whose route is served gets an
 * `.in` hook — a real surface something can wire into. One whose route is
 * served by nothing gets the component (it IS declared, and the registry should
 * be able to see that it is declared) but NO hook, because a hook would assert
 * a surface that does not exist. Wires into it then cannot resolve, which is
 * correct and is reported rather than silently dropped.
 *
 * ── `wires_to` IS USED THREE DIFFERENT WAYS ─────────────────────────────────
 * Measured across all 13 files: of 17 distinct wire targets, 3 name a declared
 * in-hook, 9 name a COMPONENT id, 1 names an OUT-hook (backwards), and 4 name
 * nothing that exists. So the resolution ladder below is not a convenience —
 * without it, 14 of 17 consumer edges are unresolvable, which is why this
 * consumer graph has never been in loom.
 *   1. target matches a declared in-hook id  -> wire to it
 *   2. target matches a capability component -> wire to that component's .in
 *   3. otherwise                             -> NOT DECLARED, reported
 * Rule 2 is an interpretation, and it is recorded as one: naming a component
 * where a hook belongs means "whatever that component receives on". Rule 3
 * refuses to guess.
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const { normalizeDeclarations } = require(path.join(ROOT, 'lib/component-registry'));

/** registry-components.js file -> the directory whose source should serve it */
const SYSTEMS = Object.freeze({
  'cortex': 'cortex',
  'idearium': 'idearium',
  'guardian': 'guardian',
  'loom': 'loom',
  'ollama': 'ollama',
  'eravos': 'eravos',
  'clear-glass': 'clear-glass',
  'clear-glass/seam': 'clear-glass',
  'emerge': 'emerge',
  'architect': 'architect',
  'copilot': 'copilot',
  'bridge': 'bridge',
  'nexus-healer': 'nexus-healer',
});

function _cmpVersion(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
  return 0;
}

/**
 * loadAll() -> { decls, duplicates }
 *
 * §DEDUPE 2026-08-04. The 13 files contain 280 declarations but only 255
 * distinct ids. All 25 collisions are between clear-glass/registry-components.js
 * (v3.1.0) and clear-glass/seam/registry-components.js (v3.0.0): the same 25
 * cg.* ids, the same routes, an older version string. The seam file is a stale
 * copy — §5.4, one version string, no drift.
 *
 * Highest version wins and the loser is REPORTED rather than dropped quietly.
 * Dropping quietly is how the stale file survived long enough to be found by a
 * scanner instead of by a person.
 */
function loadAll() {
  const raw = [];
  for (const [file, dir] of Object.entries(SYSTEMS)) {
    let decls;
    try { decls = normalizeDeclarations(require(path.join(ROOT, file, 'registry-components.js'))); }
    catch (e) { continue; }
    for (const d of decls) raw.push({ ...d, _sourceFile: `${file}/registry-components.js`, _dir: dir });
  }

  const byId = new Map();
  const duplicates = [];
  for (const d of raw) {
    const prev = byId.get(d.id);
    if (!prev) { byId.set(d.id, d); continue; }
    const keepNew = _cmpVersion(d.version, prev.version) > 0;
    const [kept, dropped] = keepNew ? [d, prev] : [prev, d];
    byId.set(d.id, kept);
    duplicates.push({
      id: d.id,
      kept: `${kept._sourceFile} v${kept.version}`,
      dropped: `${dropped._sourceFile} v${dropped.version}`,
      sameRoute: kept.route.method === dropped.route.method && kept.route.path === dropped.route.path,
    });
  }
  const decls = [...byId.values()];
  decls.duplicates = duplicates;   // attached so callers that ignore it still work
  return decls;
}

// ── Route verification ──────────────────────────────────────────────────────
function _concatSource(dir) {
  let out = '';
  const stack = [path.join(ROOT, dir)];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { stack.push(full); continue; }
      // The declaration file itself obviously contains the path string. Reading
      // it back would make every route verify itself — the exact circularity
      // this check exists to break.
      if (/registry-components/.test(e.name)) continue;
      if (/\.(js|cjs|mjs)$/.test(e.name)) { try { out += fs.readFileSync(full, 'utf8'); } catch (_) {} }
    }
  }
  return out;
}

let _rootSrcCache = null;
function _rootSource() {
  if (_rootSrcCache) return _rootSrcCache;
  // Several systems are served from ROOT-LEVEL files, not from inside their own
  // directory — emerge from emerge-ide.js, cortex partly from orchestrator.js.
  // An earlier pass of this check omitted these and reported 31 unserved routes;
  // 15 of those were false. Recorded rather than quietly fixed.
  let out = '';
  for (const f of fs.readdirSync(ROOT)) {
    if (!/\.(js|cjs)$/.test(f)) continue;
    try { out += fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (_) {}
  }
  return (_rootSrcCache = out);
}

const _dirCache = new Map();
function verifyRoutes(decls) {
  const served = new Map();
  const unserved = [];
  for (const c of decls) {
    if (!_dirCache.has(c._dir)) _dirCache.set(c._dir, _concatSource(c._dir));
    const src = _dirCache.get(c._dir) + _rootSource();
    const p = c.route && c.route.path;
    let hit;
    if (!p) hit = false;
    else if (p.includes(':')) {
      // A parameterised path is never present as a literal — servers match it
      // by pattern or by splitting. All that can be checked is that every
      // STATIC segment appears. Weaker evidence, and labelled as such.
      hit = p.split('/').filter(s => s && !s.startsWith(':')).every(s => src.includes(s));
    } else {
      hit = src.includes(p);
    }
    served.set(c.id, hit);
    if (!hit) unserved.push({ id: c.id, route: `${c.route.method} ${c.route.path}`, dir: c._dir, declaredIn: c._sourceFile });
  }
  return { served, unserved };
}

// ── Wire resolution ─────────────────────────────────────────────────────────
function resolveWires(decls, served) {
  const componentIds = new Set(decls.map(c => c.id));
  const inHookIds = new Set();
  const outHookIds = new Set();
  for (const c of decls) {
    for (const h of (c.hooks && c.hooks.in) || []) inHookIds.add(h.id);
    for (const h of (c.hooks && c.hooks.out) || []) outHookIds.add(h.id);
  }

  const edges = [];
  const dangling = [];
  for (const c of decls) {
    for (const h of (c.hooks && c.hooks.out) || []) {
      for (const target of h.wires_to || []) {
        if (inHookIds.has(target)) {
          edges.push({ from: h.id, to: target, via: 'declared-in-hook' });
        } else if (componentIds.has(target)) {
          if (served.get(target)) edges.push({ from: h.id, to: `${target}.in`, via: 'component-id' });
          else dangling.push({ from: h.id, target, why: 'target component has no served route, so no .in hook exists' });
        } else if (outHookIds.has(target)) {
          // out -> out. Something declares it sends TO a hook that is itself
          // declared as an emitter. The wire cannot exist in that direction.
          dangling.push({ from: h.id, target, why: 'DIRECTION REVERSED — target is declared as an OUT hook, not a receiver' });
        } else {
          dangling.push({ from: h.id, target, why: 'names neither a declared in-hook nor a capability component' });
        }
      }
    }
  }
  return { edges, dangling };
}

// ── Declare into loom ───────────────────────────────────────────────────────
function mapCapabilities(driver) {
  const decls = loadAll();
  const { served, unserved } = verifyRoutes(decls);
  const { edges, dangling } = resolveWires(decls, served);
  const results = { components: [], hooks: [], wires: [], failures: [], unserved, dangling,
                    total: decls.length, duplicates: decls.duplicates || [] };

  for (const c of decls) {
    const r = driver.declare('component', {
      id: c.id, namespace: c.namespace, name: c.name, version: c.version,
      uuid: `nexus-loom-cap-${c.id}-v1-0000-2026-0804-001`,
      // Extra fields the schema permits and the graph benefits from: the WHY,
      // and whether the claim was verified.
      route: `${c.route.method} ${c.route.path}`,
      description: c.description || '',
      tags: c.tags || [],
      served: served.get(c.id) === true,
      declared_in: c._sourceFile,
    });
    (r.ok ? results.components : results.failures).push({ id: c.id, r });
  }

  for (const c of decls) {
    // Synthesized surface hook — ONLY when the route was found in real source.
    if (served.get(c.id)) {
      const r = driver.declare('hook', {
        id: `${c.id}.in`, component_id: c.id, name: 'route', type: 'api', direction: 'in',
        uuid: `nexus-loom-cap-${c.id}-in-v1-0000-2026-0804-001`,
      });
      (r.ok ? results.hooks : results.failures).push({ id: `${c.id}.in`, r });
    }
    // Hooks the system declares about itself, kept under their own ids.
    for (const [dir, list] of [['in', (c.hooks && c.hooks.in) || []], ['out', (c.hooks && c.hooks.out) || []]]) {
      for (const h of list) {
        const r = driver.declare('hook', {
          id: h.id, component_id: c.id, name: h.id.split('.').pop(),
          type: h.type || 'api', direction: dir === 'in' ? 'in' : 'out',
          uuid: `nexus-loom-cap-hook-${h.id}-v1-0000-2026-0804-001`,
        });
        (r.ok ? results.hooks : results.failures).push({ id: h.id, r });
      }
    }
  }

  let n = 0;
  for (const e of edges) {
    n++;
    const r = driver.declare('wire', {
      id: `capability.wire.${n}.${e.from}--${e.to}`,
      from_hook_id: e.from, to_hook_id: e.to,
      intent: e.via,
      uuid: `nexus-loom-cap-wire-${n}-v1-0000-2026-0804-001`,
    });
    (r.ok ? results.wires : results.failures).push({ from: e.from, to: e.to, r });
  }

  return results;
}

module.exports = { mapCapabilities, loadAll, verifyRoutes, resolveWires, SYSTEMS };
