'use strict';
/**
 * loom/scanners/source-map.js — derives the component/hook/wire map for the
 * WHOLE tree from source, instead of from a hand-written list.
 * comp_id: nexus.loom.scanners.source-map
 * UUID: nexus-loom-scanner-source-map-v1-0000-2026-0804-001
 *
 * WHY THIS EXISTS (James, 2026-08-04): "update the registry — that's the whole
 * point, so that this doesn't happen."
 *
 * Every map in loom/maps/ is a hand-authored list. That is why the registry
 * held 68 components while 280 were declared in the per-system
 * registry-components.js files and ~880 real source files existed on disk. A
 * hand-written map can only ever describe the part of the system whoever wrote
 * it happened to be looking at, and it goes stale the moment anything moves —
 * which is the exact failure this registry is supposed to catch in everything
 * else. The registry cannot be the system's self-model if it is maintained by
 * hand.
 *
 * So this does not curate. It reads the tree.
 *
 * ── WHAT COUNTS AS AN EDGE ──────────────────────────────────────────────────
 * A static dependency from one file in the tree to another: CommonJS
 * `require('./x')` and ESM `import ... from './x'`. Both are real, both are
 * resolvable statically, and this tree contains both (meta/ is CJS, ui/ and
 * parts of eravos/ are ESM). Node builtins and npm packages are not edges —
 * same rule warp-map and observability-map already use.
 *
 * Comments and template literals are STRIPPED before extraction. This is not a
 * nicety: an unstripped pass over meta/ alone produces four phantom edges from
 * require() calls that appear inside docblocks (meta/cfr/index.js's usage
 * example) and inside generated-code strings (meta/rfr2/compress/index.js emits
 * a module containing require() calls in a template literal). Declaring those
 * would be fabricating wires, which is the defect this whole session has been
 * about. Dynamic requires — require(variable), await import(expr) — are NOT
 * captured, and cannot be by any static reader; that limit is stated here
 * rather than hidden, and the count of them is reported by scanTree().
 *
 * ── WHAT IS DELIBERATELY NOT SCANNED ────────────────────────────────────────
 * node_modules (not ours), unintegrated/ (staged, not installed — nothing in
 * there runs, and declaring it would assert the opposite), data/ (runtime
 * ledgers, not code), .git, and docs/ (contains stray copies of real service
 * files kept as reference — e.g. docs/guardian-server(1).js — which are NOT
 * the live files and must never be mapped as if they were).
 *
 * tests/ IS scanned but declared in its own namespace, because a test is a real
 * consumer and "which tests exercise this module" is a question the registry
 * should be able to answer.
 *
 * ── RELATIONSHIP TO THE HAND MAPS ───────────────────────────────────────────
 * warp-map, observability-map and relational-field-map keep their curated
 * docblocks, intent notes, and tests. Their files are EXCLUDED here by path, so
 * the scanner never redeclares them (loom.unique-id would hard-reject it, and
 * more importantly a second declaration under a different derived id would put
 * the same file in the graph twice). The hand maps run first; the scanner fills
 * in everything else.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'data', 'unintegrated', 'docs', '.claude', '_archive',
  // §FIXED 2026-08-22 — real gap found live: _archive holds the exact same
  // kind of stray, non-live reference copies 'docs' is excluded for (this
  // very file's own comment above names _archive/duplicate-docs/
  // guardian-server(1).js as the canonical example of a non-live copy —
  // it was still being scanned as if live because only 'docs' was listed.
]);
const CODE_EXT = new Set(['.js', '.cjs', '.mjs']);

// §0.39.260 — James: "can we fix some of these dangling hooks." After an
// Upload Project, the imported repo's files live under idearium/repo/repos/
// (lib/project-import.config.js REPO_STORAGE) — inside this tree — so the
// next registry refresh mapped the user's MASTERMIND project as if it were
// Nexus source (nexus.idearium.repo.repos.nexus-id-repo-….mm9.tests.… in the
// boot log) and the diagnostic reported its hooks as Nexus wiring gaps.
// Those are user data, not this system. Excluded by path, not by name (a
// directory called 'repos' elsewhere is legitimate code). Env overrides are
// honored so a relocated repo store is still excluded.
// 0.39.266 (C3) — components/ is the store of what WARP BUILT (lib/component-store.js), not Nexus source (CI3).
const SKIP_PATHS = new Set(['idearium/repo/repos', 'idearium/data', 'components'].concat(
  [process.env.NEXUS_PROJECT_IMPORT_REPO_DIR, process.env.IDEARIUM_DATA_DIR, process.env.NEXUS_COMPONENTS_DIR]
    .filter(Boolean)
    .map(p => path.relative(ROOT, path.resolve(p)).replace(/\\/g, '/'))
    .filter(p => p && !p.startsWith('..') && !path.isAbsolute(p))
));
/** id prefixes of SKIP_PATHS, for pruning records an older scan declared. */
function skippedIdPrefixes() {
  return [...SKIP_PATHS].map(p => 'nexus.' + p.split('/').filter(Boolean).join('.') + '.');
}

/** id for a source path: meta/rfr2/kernel/index.js -> nexus.meta.rfr2.kernel */
function idFor(rel) {
  let p = rel.replace(/\\/g, '/').replace(/\.(js|cjs|mjs)$/, '');
  p = p.replace(/\/index$/, '');
  return 'nexus.' + p.split('/').filter(Boolean).join('.');
}

// §0.39.266 — EVENTS. James: "use the component registry as the wiring harness … that way it makes the
// registry a map and event bus." Until now the registry held only require/import edges (hook types
// direct/api/callto — no event hooks), so "who hears X?" meant reading code. An event name is a string
// literal with a '.' or ':' in it (this tree's convention: idearium.repo.chunk.progress, intake:file) —
// which also keeps Node's own 'data' / 'end' / 'close' out. Emits: emit/broadcast/publish/fire(…) incl.
// emit(new Event('x')). Listens: .on/.once/.subscribe/.addListener/.listen(…) and SISO gate
// `signature: 'x'`. Static, like the require edges: an event name built at runtime is not captured.
const EVENT_NAME = `([a-z][\\w-]*(?:[.:][\\w-]+)+)`;
const RX_EMIT_EVENT = new RegExp(`\\b(?:emit|broadcast|publish|emitEvent|_emit|fire|dispatchEvent)\\(\\s*(?:new\\s+Event\\(\\s*)?['"]${EVENT_NAME}['"]`, 'g');
const RX_LISTEN_EVENT = new RegExp(`\\.(?:on|once|subscribe|addListener|listen|onEvent)\\(\\s*['"]${EVENT_NAME}['"]`, 'g');
const RX_GATE_SIGNATURE = new RegExp(`\\bsignature\\s*[:=]\\s*['"]${EVENT_NAME}['"]`, 'g');

/** eventsOf(strippedSrc) -> { emits:[name], listens:[name] } */
function eventsOf(src) {
  const grab = (rxs) => { const out = new Set(); for (const rx of rxs) { rx.lastIndex = 0; let m; while ((m = rx.exec(src)) !== null) out.add(m[1]); } return [...out].sort(); };
  return { emits: grab([RX_EMIT_EVENT]), listens: grab([RX_LISTEN_EVENT, RX_GATE_SIGNATURE]) };
}

function stripNonCode(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, '``');
}

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (_) { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (SKIP_PATHS.has(path.relative(ROOT, full).replace(/\\/g, '/'))) continue;
      walk(full, out);
    } else if (CODE_EXT.has(path.extname(e.name))) {
      out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
    }
  }
  return out;
}

const RX_REQUIRE = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
const RX_IMPORT  = /(?:^|\s)import\s+(?:[\s\S]*?\sfrom\s+)?['"](\.[^'"]+)['"]/gm;
const RX_DYNAMIC = /require\(\s*[^'"\s)]|import\(\s*[^'"\s)]/g;

/**
 * scanTree(opts) -> { FILES, stats }
 *   FILES — [relPath, id, [depIds]] — the same shape loom/maps/* use, so the
 *           declare passes below are identical to theirs.
 *   stats — what was seen and what was skipped, so the numbers are auditable
 *           rather than asserted.
 */
function scanTree({ excludePaths = [] } = {}) {
  const excluded = new Set(excludePaths);
  const all = walk(ROOT).filter(f => !excluded.has(f));

  // pathToId is assigned AFTER ALIAS is resolved so a component is declared
  // under the same id its incoming edges use. They disagreed before, silently.
  let pathToId = new Map(all.map(f => [f, idFor(f)]));
  // Resolution targets include EXCLUDED files too: a scanned file that requires
  // a hand-mapped one is a real edge and must point at that component's id, not
  // be dropped. Those ids are derived the same way; where a hand map chose a
  // different id for the same file, the alias table below reconciles them.
  // §CORRECTED 2026-08-08. This table reconciled derived ids with ids a HAND
  // MAP had chosen for the same file. Carried into a tree whose hand maps no
  // longer use most of them, it did the opposite: the component was declared
  // under the DERIVED id while every edge pointed at the ALIAS, so 68 wires
  // referenced an endpoint that did not exist. An alias is only correct while
  // something else actually uses it — so it is now DERIVED from the hand maps
  // at runtime rather than hardcoded, and an entry nothing claims is dropped.
  const HAND_IDS = new Set();
  try {
    for (const m of ['../maps/warp-map', '../maps/observability-map']) {
      const mod = require(m);
      for (const [file, id] of mod.FILES || []) HAND_IDS.add(`${file}|${id}`);
      for (const [, , deps] of mod.FILES || []) for (const d of deps || []) HAND_IDS.add(`*|${d}`);
    }
  } catch (_) { /* no hand maps present — then no aliases are needed at all */ }
  const CANDIDATES = {
    'intelligence/cfr/index.js': 'nexus.intelligence.cfr.index',
    'meta/rfr2/index.js': 'nexus.meta.rfr2.index',
    'intelligence/index.js': 'nexus.intelligence.index',
    'cortex/memory/jaa-db.js': 'nexus.cortex.jaa-db',
    'nexus/nexus-bus.js': 'nexus.nexus-bus',
  };
  const ALIAS = {};
  for (const [file, id] of Object.entries(CANDIDATES)) {
    if (HAND_IDS.has(`${file}|${id}`) || HAND_IDS.has(`*|${id}`)) ALIAS[file] = id;
  }
  const resolveTarget = new Map();
  for (const f of walk(ROOT)) resolveTarget.set(f, ALIAS[f] || idFor(f));
  pathToId = new Map(all.map(f => [f, ALIAS[f] || idFor(f)]));

  const FILES = [];
  let dynamicHits = 0, unresolved = 0, unreadable = 0;
  const unresolvedList = [];

  for (const rel of all) {
    let src;
    try { src = stripNonCode(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
    catch (_) { unreadable++; continue; }

    dynamicHits += (src.match(RX_DYNAMIC) || []).length;

    const deps = new Set();
    for (const rx of [RX_REQUIRE, RX_IMPORT]) {
      rx.lastIndex = 0;
      let m;
      while ((m = rx.exec(src)) !== null) {
        const raw = path.normalize(path.join(path.dirname(rel), m[1])).replace(/\\/g, '/');
        let hit = null;
        for (const cand of [raw, raw + '.js', raw + '.cjs', raw + '.mjs',
                            raw + '/index.js', raw + '/index.cjs', raw + '/index.mjs']) {
          if (resolveTarget.has(cand)) { hit = resolveTarget.get(cand); break; }
        }
        if (hit) deps.add(hit);
        else { unresolved++; unresolvedList.push({ from: rel, spec: m[1] }); }
      }
    }

    const id = pathToId.get(rel);
    FILES.push([rel, id, [...deps].filter(d => d !== id).sort(), eventsOf(src)]);   // §0.39.266 4th: events
  }

  return {
    FILES,
    stats: {
      scanned: all.length,
      excluded: excludePaths.length,
      withEdges: FILES.filter(f => f[2].length > 0).length,
      totalEdges: FILES.reduce((n, f) => n + f[2].length, 0),
      withEvents: FILES.filter(f => f[3] && (f[3].emits.length || f[3].listens.length)).length,
      dynamicRequiresNotCaptured: dynamicHits,
      unresolvedSpecifiers: unresolved,
      unreadable,
    },
    unresolvedList,
  };
}

/**
 * mapSource(driver, FILES) — identical three-pass declare to loom/maps/*.
 * Every mapped file gets an .export hook (it exports; whether a consumer
 * happens to be inside this set is irrelevant — see the note in
 * relational-field-map.js on why the requiredBy-only rule under-declares).
 */
function mapSource(driver, FILES) {
  const results = { components: [], hooks: [], wires: [], failures: [] };

  for (const [file, id] of FILES) {
    const r = driver.declare('component', {
      id, namespace: id.split('.').slice(0, 2).join('.'), name: file, version: '1.0.0',
      uuid: `nexus-loom-scan-${id}-v1-0000-2026-0804-001`,
    });
    (r.ok ? results.components : results.failures).push({ id, r });
  }

  const declaredHere = new Set(FILES.map(f => f[1]));

  // §FIXED 2026-08-13 — found tracing a real boot log: hundreds of
  // "dangling-hook" GAPs fired every single boot (test files, CLI scripts,
  // standalone entry points — every leaf file mapSource ever scanned),
  // and cortex's own intelligence system had crystallized it as "likely a
  // systemic bottleneck." Root cause: this function declared an .export
  // hook for EVERY scanned file unconditionally, whether or not anything
  // else in the tree ever requires it. A file nothing imports gets an
  // .export hook with zero wires ever pointing from it — exactly
  // service/nexus-diagnostic.js's isOrphanOut condition. mapObservability/
  // mapWarp/mapCopilotCapability (loom/maps/*.js) already avoid this
  // exact bug with a requiredBy guard; mapSource — the one function that
  // scans the WHOLE tree, hence the whole-tree flood — never had it.
  // Mirrored here verbatim, same pattern, not reinvented.
  const requiredBy = new Set();
  for (const [, , requires] of FILES) for (const dep of requires) requiredBy.add(dep);

  for (const [, id, requires] of FILES) {
    if (requiredBy.has(id)) {
      const e = driver.declare('hook', {
        id: `${id}.export`, component_id: id, name: 'export', type: 'direct', direction: 'out',
        uuid: `nexus-loom-scan-${id}-export-v1-0000-2026-0804-001`,
      });
      (e.ok ? results.hooks : results.failures).push({ id: `${id}.export`, r: e });
    }
    if (requires.length > 0) {
      const i = driver.declare('hook', {
        id: `${id}.import`, component_id: id, name: 'import', type: 'direct', direction: 'in',
        uuid: `nexus-loom-scan-${id}-import-v1-0000-2026-0804-001`,
      });
      (i.ok ? results.hooks : results.failures).push({ id: `${id}.import`, r: i });
    }
  }

  let wireN = 0;
  for (const [, id, requires] of FILES) {
    for (const dep of requires) {
      wireN++;
      const r = driver.declare('wire', {
        id: `source.wire.${wireN}.${dep}--${id}`,
        from_hook_id: `${dep}.export`, to_hook_id: `${id}.import`,
        // §SB1 2026-08-14 — this scanner was found to be the real source of
        // the "intent is null on every sample wire" finding: it never set
        // one, unlike capability-map.js's scanner (which passes intent:
        // e.via) a few files over. The honest intent for a require()-derived
        // edge is exactly what was scanned — "requires this module" — not a
        // richer narrative this scanner has no way to know. type:'direct-call'
        // matches what a require() edge actually is among the real wire
        // types this session catalogued (http/event/ipc/sse/direct-call).
        intent: `${id} requires ${dep}`,
        type: 'direct-call',
        uuid: `nexus-loom-scan-wire-${wireN}-v1-0000-2026-0804-001`,
      });
      (r.ok ? results.wires : results.failures).push({ from: dep, to: id, r, declaredHere: declaredHere.has(dep) });
    }
  }

  // §0.39.266 — event hooks and emit→listen wires. Only an event with BOTH an emitter and a listener in
  // the scanned tree gets hooks: a hook no wire reaches is what the diagnostic reports as dangling, and
  // the whole-tree .export flood (§FIXED 2026-08-13 above) is not repeated with 669 emit-only events.
  // Those still exist — eventMap() gives every file's emits/listens, wired or not.
  const byEvent = new Map();
  for (const [, id, , ev] of FILES) {
    if (!ev) continue;
    for (const name of ev.emits) { if (!byEvent.has(name)) byEvent.set(name, { e: new Set(), l: new Set() }); byEvent.get(name).e.add(id); }
    for (const name of ev.listens) { if (!byEvent.has(name)) byEvent.set(name, { e: new Set(), l: new Set() }); byEvent.get(name).l.add(id); }
  }
  results.eventHooks = []; results.eventWires = [];
  for (const [name, { e, l }] of byEvent) {
    if (!e.size || !l.size) continue;
    const hook = (id, dir) => {
      const hid = `${id}.${dir === 'out' ? 'emit' : 'on'}.${name}`;
      const r = driver.declare('hook', {
        id: hid, component_id: id, name: `${dir === 'out' ? 'emit' : 'on'} ${name}`, type: 'event', direction: dir,
        uuid: `nexus-loom-scan-${id}-${dir === 'out' ? 'emit' : 'on'}-${name}-v1-0000-2026-0927-001`,
      });
      (r.ok ? results.eventHooks : results.failures).push({ id: hid, r });
      return hid;
    };
    // a file hearing its own event is not a wire between components — and a hook with no wire dangles, so
    // hooks are declared only for components that are in at least one cross-component pair
    const pairs = [];
    for (const from of e) for (const to of l) if (from !== to) pairs.push([from, to]);
    if (!pairs.length) continue;
    const hOut = new Map(), hIn = new Map();
    for (const [from, to] of pairs) {
      if (!hOut.has(from)) hOut.set(from, hook(from, 'out'));
      if (!hIn.has(to)) hIn.set(to, hook(to, 'in'));
    }
    for (const [from, to] of pairs) {
      const fh = hOut.get(from), th = hIn.get(to);
      const r = driver.declare('wire', {
        id: `source.event.${name}.${from}--${to}`, from_hook_id: fh, to_hook_id: th,
        intent: `${name}: ${from} emits, ${to} listens`, type: 'event',
        uuid: `nexus-loom-scan-event-${name}-${from}--${to}-v1-0000-2026-0927-001`,
      });
      (r.ok ? results.eventWires : results.failures).push({ event: name, from, to, r });
    }
  }
  return results;
}

/**
 * eventMap(FILES) -> { byFile: { id: {emits, listens} }, byEvent: { name: {emitters:[id], listeners:[id]} } }
 * §0.39.266 — every event, wired or not: what a component's registry card shows, and what
 * registry.find('event name') answers.
 */
function eventMap(FILES) {
  const byFile = {}, byEvent = {};
  for (const [, id, , ev] of FILES) {
    if (!ev || (!ev.emits.length && !ev.listens.length)) continue;
    byFile[id] = ev;
    for (const n of ev.emits) (byEvent[n] = byEvent[n] || { emitters: [], listeners: [] }).emitters.push(id);
    for (const n of ev.listens) (byEvent[n] = byEvent[n] || { emitters: [], listeners: [] }).listeners.push(id);
  }
  return { byFile, byEvent };
}

module.exports = { scanTree, mapSource, eventMap, eventsOf, idFor, stripNonCode, ROOT, SKIP_DIRS, SKIP_PATHS, skippedIdPrefixes };
