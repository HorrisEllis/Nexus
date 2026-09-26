'use strict';
/**
 * loom/scanners/spec-map.js — the SPEC layer, checked against the capability
 * registry and against the source that is supposed to serve it.
 * comp_id: nexus.loom.scanners.spec-map
 * UUID: nexus-loom-scanner-spec-v1-0000-2026-0804-001
 *
 * WHY (James, 2026-08-04): "make sure the specs are also checked in relation to
 * the registry and the consumers."
 *
 * Three layers now exist and each is a different kind of claim:
 *   SPEC        — what the system is supposed to be.        (docs/*.spec)
 *   CAPABILITY  — what each system declares it provides.    (registry-components.js)
 *   SOURCE      — what actually runs.                       (the tree)
 * loom already holds the last two. This adds the first, and joins them where
 * they can be joined honestly.
 *
 * ── WHAT IS CHECKED, AND WHY ONLY THESE ─────────────────────────────────────
 *
 * 1. §6.3 COVERAGE — every authored .spec appears in docs/SPEC-REGISTRY.spec.
 *    Unambiguous: the axiom says tracked, either it is or it is not.
 *
 * 2. SPEC ROUTES SERVED BY NOTHING — every `{ method: X, path: Y }` a spec
 *    declares is checked against the whole tree's source. Layer-agnostic: it
 *    asks only "does anything anywhere serve this", so it cannot be confused by
 *    which layer a route belongs to.
 *
 * 3. SPEC -> CAPABILITY JOIN, only on EXACT route match.
 *
 * ── WHAT IS DELIBERATELY *NOT* CHECKED, AND THIS MATTERS ────────────────────
 * The obvious check — diff each spec's routes against its system's declared
 * routes — produces about a hundred findings that are almost all FALSE. It was
 * prototyped before this file was written:
 *
 *    cortex.spec        declares  GET /api/cortex/gaps
 *    cortex/registry-components.js declares  GET /api/gaps
 *
 * Zero of cortex's 10 spec routes match any of its 39 declared routes, and the
 * same for guardian and idearium. That is not drift. The specs describe the
 * ORCHESTRATOR-level surface (/api/<system>/...) and registry-components.js
 * describes the SYSTEM-level surface (/api/...). Both are real — /api/cortex/gaps
 * is a genuine orchestrator route, consumed by auth/client.js:439 and by
 * cli/nexus-repl-descriptors.js. Meanwhile architect, bridge, emerge and eravos
 * match 100%, because those specs happen to be written at the system level.
 *
 * So the two layers use two conventions and NOTHING DECLARES WHICH APPLIES
 * WHERE. A checker that assumed one would generate ~100 false failures, which is
 * worse than no checker: it trains everyone to ignore the output, which is
 * precisely how 11 hard-rejected wires survived in this registry for weeks.
 *
 * The missing prefix convention is the actual defect, and it is recorded as
 * RF-20 rather than papered over with a heuristic. Until it exists, unmatched
 * routes are reported as UNJOINED — a stated gap in what can be known — never
 * as drift.
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const { loadAll, verifyRoutes } = require('./capability-map');

// Authored specs only. idearium/data/specs/ is user-generated runtime content
// and idearium/spec-engine/templates/ are templates, not claims about NEXUS.
const SPEC_DIRS = ['docs', 'warp/spec', 'cortex/spec', 'idearium/spec', 'copilot/spec', 'bridge/spec'];
const ROUTE_RX = /\{\s*method:\s*([A-Z]+),\s*path:\s*["']?([^,\s}"']+)/g;

function listSpecs() {
  const out = [];
  for (const d of SPEC_DIRS) {
    const full = path.join(ROOT, d);
    let entries;
    try { entries = fs.readdirSync(full); } catch (_) { continue; }
    for (const f of entries) if (f.endsWith('.spec')) out.push(`${d}/${f}`);
  }
  return out;
}

let _srcCache = null;
function _allSource() {
  if (_srcCache) return _srcCache;
  let out = '';
  const skip = new Set(['node_modules', '.git', 'data', 'unintegrated', 'docs']);
  const stack = [ROOT];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      if (skip.has(e.name) || e.name.startsWith('.')) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { stack.push(full); continue; }
      if (/\.(js|cjs|mjs)$/.test(e.name)) { try { out += fs.readFileSync(full, 'utf8'); } catch (_) {} }
    }
  }
  return (_srcCache = out);
}

function parseSpecs() {
  return listSpecs().map(rel => {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const routes = [...text.matchAll(ROUTE_RX)].map(m => ({ method: m[1], path: m[2] }));
    const nameM = text.match(/^\s*name:\s*(\S+)/m);
    const verM = text.match(/^\s*version:\s*(\S+)/m);
    const uuidM = text.match(/^\s*uuid:\s*(\S+)/m);
    return {
      file: rel,
      // §PATH-DERIVED, not basename-derived. Four spec names exist in TWO
      // places each (docs/cortex.spec and cortex/spec/cortex.spec, and the same
      // for idearium, copilot, bridge). A basename id collapses them into one
      // component and loom.unique-id hard-rejects the second — which would have
      // silently dropped one copy of each from the graph, hiding the fact that
      // there ARE two copies. That fact is the finding; see divergentPairs().
      id: 'spec.' + rel.replace(/\.spec$/, '').replace(/[\/]/g, '.'),
      basename: path.basename(rel, '.spec'),
      specName: nameM ? nameM[1] : path.basename(rel, '.spec'),
      version: verM ? verM[1].replace(/[^0-9a-zA-Z.\-]/g, '') || '0.0.0' : '0.0.0',
      uuid: uuidM ? uuidM[1] : null,
      routes,
      _text: text,
    };
  });
}

/**
 * Same spec name in more than one location. §5.4 — one version string, no
 * drift; two copies of a contract is two contracts. Reports whether the copies
 * are byte-identical (pure duplication) or DIVERGED (two different claims about
 * the same system, which is worse and silent).
 */
function divergentPairs(specs) {
  const byName = new Map();
  for (const s of specs) {
    if (!byName.has(s.basename)) byName.set(s.basename, []);
    byName.get(s.basename).push(s);
  }
  const out = [];
  for (const [name, group] of byName) {
    if (group.length < 2) continue;
    for (let i = 1; i < group.length; i++) {
      const a = group[0], b = group[i];
      out.push({
        name,
        a: a.file, b: b.file,
        identical: a._text === b._text,
        lines: [a._text.split('\n').length, b._text.split('\n').length],
      });
    }
  }
  return out;
}

/** §6.3 — every authored .spec tracked in docs/SPEC-REGISTRY.spec */
function checkRegistryCoverage(specs) {
  const reg = fs.readFileSync(path.join(ROOT, 'docs/SPEC-REGISTRY.spec'), 'utf8');
  return specs.filter(s => !reg.includes(path.basename(s.file)) && !reg.includes(s.file))
              .map(s => s.file);
}

/** Layer-agnostic: does ANYTHING in the tree serve this path? */
function checkRoutesServed(specs) {
  const SRC = _allSource();
  const unserved = [];
  let total = 0;
  for (const s of specs) {
    for (const r of s.routes) {
      total++;
      const hit = r.path.includes(':')
        ? r.path.split('/').filter(x => x && !x.startsWith(':')).every(x => SRC.includes(x))
        : SRC.includes(r.path);
      if (!hit) unserved.push({ spec: s.file, route: `${r.method} ${r.path}` });
    }
  }
  return { total, unserved };
}

/** Exact-match join only. Everything else is UNJOINED, never "drift". */
function joinToCapabilities(specs) {
  const decls = loadAll();
  const { served } = verifyRoutes(decls);
  const byRoute = new Map();
  for (const c of decls) byRoute.set(`${c.route.method} ${c.route.path}`, c);

  const joins = [];
  const unjoined = [];
  for (const s of specs) {
    for (const r of s.routes) {
      const key = `${r.method} ${r.path}`;
      const cap = byRoute.get(key);
      if (cap && served.get(cap.id)) joins.push({ spec: s.id, capability: cap.id, route: key });
      else if (cap) unjoined.push({ spec: s.file, route: key, why: 'capability exists but its route is served by nothing' });
      else unjoined.push({ spec: s.file, route: key, why: 'no capability declares this route — may be an orchestrator-level path (see RF-20)' });
    }
  }
  return { joins, unjoined };
}

function mapSpecs(driver) {
  const specs = parseSpecs();
  const untracked = checkRegistryCoverage(specs);
  const { total, unserved } = checkRoutesServed(specs);
  const { joins, unjoined } = joinToCapabilities(specs);
  const duplicates = divergentPairs(specs);
  const results = { components: [], hooks: [], wires: [], failures: [],
                    specs: specs.length, routes: total, untracked, unserved, unjoined, duplicates };

  for (const s of specs) {
    const r = driver.declare('component', {
      id: s.id, namespace: 'spec', name: s.file, version: s.version,
      uuid: `nexus-loom-spec-${s.id}-v1-0000-2026-0804-001`,
      spec_uuid: s.uuid, route_count: s.routes.length,
      tracked_in_spec_registry: !untracked.includes(s.file),
    });
    (r.ok ? results.components : results.failures).push({ id: s.id, r });
  }

  // A spec's out-hook exists only if the spec actually joins to something.
  // A spec that specifies nothing currently implemented gets no hook — the same
  // rule capability-map applies to unserved routes.
  const specsWithJoins = new Set(joins.map(j => j.spec));
  for (const id of specsWithJoins) {
    const r = driver.declare('hook', {
      id: `${id}.specifies`, component_id: id, name: 'specifies', type: 'direct', direction: 'out',
      uuid: `nexus-loom-spec-${id}-specifies-v1-0000-2026-0804-001`,
    });
    (r.ok ? results.hooks : results.failures).push({ id: `${id}.specifies`, r });
  }

  let n = 0;
  const seen = new Set();
  for (const j of joins) {
    const wid = `${j.spec}--${j.capability}`;
    if (seen.has(wid)) continue;      // one spec may declare the same route twice
    seen.add(wid);
    n++;
    const r = driver.declare('wire', {
      id: `spec.wire.${n}.${wid}`,
      from_hook_id: `${j.spec}.specifies`, to_hook_id: `${j.capability}.in`,
      intent: 'specifies', uuid: `nexus-loom-spec-wire-${n}-v1-0000-2026-0804-001`,
    });
    (r.ok ? results.wires : results.failures).push({ from: j.spec, to: j.capability, r });
  }

  return results;
}

module.exports = { mapSpecs, parseSpecs, listSpecs, checkRegistryCoverage, checkRoutesServed, joinToCapabilities, divergentPairs };
