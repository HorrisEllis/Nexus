'use strict';
/**
 * loom/maps/warp-map.js — maps Warp's own files into LOOM's component/
 * seam/hook/wire registry, one component per FILE, not one per library.
 * comp_id: nexus.loom.maps.warp
 * UUID: nexus-loom-map-warp-v1-0000-2026-0701-jamesbrooks-001
 *
 * Correction from the earlier bootstrap.js: Warp was registered there as
 * one monolithic 'nexus.warp' component. Wrong surface area — the whole
 * point of component/seam/hook/wire is small, LLM-workable pieces. This
 * replaces that with 17 components, each one Warp source file, wired
 * only by require() edges verified against the actual source (grep'd,
 * not recalled) — no wire below represents a dependency that isn't
 * really in the code.
 *
 * Every component gets at most two hooks:
 *   <id>.export — direction 'out', exists if anything requires this file
 *   <id>.import — direction 'in',  exists if this file requires another
 *                 warp file (node builtins like fs/crypto don't count —
 *                 they're not a NEXUS/LOOM-mapped surface)
 * This keeps hook count proportional to real coupling, not padded.
 */

// [file, namespace.id, requires (internal warp files, real names only)]
const FILES = [
  ['core/Event.js',        'warp.core.event',        []],
  ['core/Gate.js',         'warp.core.gate',          []],
  ['core/Axiom.js',        'warp.core.axiom',         []],
  ['core/Stream.js',       'warp.core.stream',        []],
  ['core/StreamLog.js',    'warp.core.streamlog',     []],
  ['core/GateFusion.js',   'warp.core.gatefusion',    ['warp.core.event', 'warp.core.gate']],
  ['core/index.js',        'warp.core.index',         ['warp.core.event', 'warp.core.gate', 'warp.core.axiom', 'warp.core.stream', 'warp.core.streamlog', 'warp.core.gatefusion']],
  ['dispatch/canonicalize.js', 'warp.dispatch.canonicalize', []],
  ['dispatch/cascade.js',      'warp.dispatch.cascade',      []],
  ['dispatch/digest.js',       'warp.dispatch.digest',       ['warp.dispatch.canonicalize']],
  ['dispatch/deltaCache.js',   'warp.dispatch.deltacache',   ['warp.dispatch.canonicalize']],
  ['dispatch/population.js',   'warp.dispatch.population',   ['warp.dispatch.canonicalize']],
  ['dispatch/pregen.js',       'warp.dispatch.pregen',       ['warp.dispatch.canonicalize']],
  ['dispatch/index.js',        'warp.dispatch.index',        ['warp.dispatch.digest', 'warp.dispatch.population', 'warp.dispatch.pregen']],
  ['plugins/crystallizer-flatfile.js', 'warp.plugin.crystallizer_flatfile', []],
  ['plugins/scorer-default.js',        'warp.plugin.scorer_default',        []],
  ['dispatch/benchmark.js', 'warp.dispatch.benchmark', [
    'warp.core.index', 'warp.core.gatefusion', 'warp.dispatch.index',
    'warp.dispatch.population', 'warp.plugin.crystallizer_flatfile',
    'warp.plugin.scorer_default', 'warp.dispatch.cascade', 'warp.dispatch.digest',
    'warp.dispatch.canonicalize', 'warp.dispatch.pregen', 'warp.dispatch.deltacache',
  ]],
];

function mapWarp(driver) {
  const results = { components: [], hooks: [], wires: [], failures: [] };

  // Pass 1 — components (every file is one, regardless of hook count)
  for (const [file, id] of FILES) {
    const r = driver.declare('component', {
      id, namespace: 'warp', name: file, version: '1.4.0',
      uuid: `nexus-loom-map-${id}-v1-0000-2026-0701-jamesbrooks-001`,
    });
    (r.ok ? results.components : results.failures).push({ id, r });
  }

  // Which components are required by at least one other file -> need .export hook
  const requiredBy = new Set();
  for (const [, , requires] of FILES) for (const dep of requires) requiredBy.add(dep);

  // Pass 2 — hooks (export hook if required elsewhere, import hook if this file requires others)
  for (const [, id, requires] of FILES) {
    if (requiredBy.has(id)) {
      const r = driver.declare('hook', {
        id: `${id}.export`, component_id: id, name: 'export', type: 'direct', direction: 'out',
        uuid: `nexus-loom-map-${id}-export-v1-0000-2026-0701-jamesbrooks-001`,
      });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.export`, r });
    }
    if (requires.length > 0) {
      const r = driver.declare('hook', {
        id: `${id}.import`, component_id: id, name: 'import', type: 'direct', direction: 'in',
        uuid: `nexus-loom-map-${id}-import-v1-0000-2026-0701-jamesbrooks-001`,
      });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.import`, r });
    }
  }

  // Pass 3 — wires: dependency's .export -> dependant's .import (real require edges only)
  let wireN = 0;
  for (const [, id, requires] of FILES) {
    for (const dep of requires) {
      wireN++;
      const r = driver.declare('wire', {
        id: `warp.wire.${wireN}.${dep}--${id}`,
        from_hook_id: `${dep}.export`, to_hook_id: `${id}.import`,
        uuid: `nexus-loom-map-wire-${wireN}-v1-0000-2026-0701-jamesbrooks-001`,
      });
      (r.ok ? results.wires : results.failures).push({ from: dep, to: id, r });
    }
  }

  return results;
}

module.exports = { mapWarp, FILES };
