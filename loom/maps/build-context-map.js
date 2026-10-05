'use strict';
/**
 * loom/maps/build-context-map.js — 0.39.308–309: what a build agent is sent about the file it writes (lib/build-context.js)
 * and the editable build blocks that send it, mapped into LOOM one component per FILE with every REAL edge as a wire:
 * require() edges, verified against the source by tests/modules/test-build-context.test.js.
 * Mirrors loom/maps/agent-memory-map.js.
 * comp_id: nexus.loom.maps.build-context
 * UUID: nexus-loom-map-build-context-v1-0000-2026-1005-001
 *
 * James, 2026-10-05: "They need context. All of it. From the hat/repo" — and docs/CLAUDE.md rule 3: "Every new
 * component MUST be mapped into loom with its real require()/consumer edges as wires".
 *
 * Ids come from source-map.js idFor(), so the scanner (which excludes hand-mapped paths, loom/bootstrap.js) never
 * declares lib/build-context.js twice. Its dependencies are scanned files: their .export hooks are the scanner's.
 * Its consumers idearium/api and idearium/spec-engine are HAND-MAPPED (the scanner skips them), so their edges into
 * it — and the build path's other new edges out of idearium/api — are declared here.
 */
const { idFor } = require('../scanners/source-map');

const I = (rel) => idFor(rel);

// [file, id, requires (ids)] — each edge names why it is real
const FILES = [
  ['lib/build-context.js', I('lib/build-context.js'), [
    I('lib/chunk-glyph.js'),                                  // _glyph → glyph(): what a dependency / primitive is, compressed
    I('lib/registry-harness.js'),                             // _exports/_purposeOf, RELATIONS → indexFor() + card()
    I('lib/component-store.js'),                              // PROVEN PRIMITIVES → loadIndex/manifest/get/idFor
  ]],
];

// Consumers that are HAND-MAPPED elsewhere (the source scanner skips them and never sees these requires). Each is a
// real require() in that file, added in 0.39.308–309: [consumer id, dependency id, where].
const CONSUMERS = [
  ['nexus.idearium.api',         I('lib/build-context.js'),       'idearium/api/index.js speceng.build → pack() (the build-context block)'],
  ['nexus.idearium.api',         I('lib/repo-prompt-blocks.js'),  'idearium/api/index.js speceng.build → getBlocks/enabledBuild/renderBuild; _personaAsEdited'],
  ['nexus.idearium.api',         I('lib/context-atlas.js'),       'idearium/api/index.js speceng.build → block() (the build-atlas block)'],
  ['nexus.idearium.api',         I('lib/repo-context.js'),        'idearium/api/index.js speceng.build → retrieve() (the build-code block)'],
  ['nexus.idearium.spec-engine', I('lib/build-context.js'),       'idearium/spec-engine/index.js _buildFilePrompt → rankFiles/interfaceOf'],
];

// idearium/spec-engine is hand-mapped by copilot-capability-map.js with no requires, so it has no .import hook and every
// wire INTO it was hard-rejected (loom.wire-endpoints-exist) — measured on a from-scratch bootstrap of 0.39.309: this
// map's spec-engine edge and agent-memory-map's (setChunkAgent → agent-providers). Declared here, once.
const BOUNDARY_IMPORTS = ['nexus.idearium.spec-engine'];

function mapBuildContext(driver) {
  const results = { components: [], hooks: [], wires: [], failures: [] };
  for (const [file, id] of FILES) {
    const r = driver.declare('component', { id, namespace: id.split('.').slice(0, 2).join('.'), name: file, version: '1.1.0', uuid: `nexus-loom-map-${id}-v1-0000-2026-1005-001` });
    (r.ok ? results.components : results.failures).push({ id, r });
  }
  const own = new Set(FILES.map(f => f[1]));
  const requiredBy = new Set(CONSUMERS.map(c => c[1]));
  for (const [, id, req] of FILES) {
    if (requiredBy.has(id)) {
      const r = driver.declare('hook', { id: `${id}.export`, component_id: id, name: 'export', type: 'direct', direction: 'out', uuid: `nexus-loom-map-${id}-export-v1-0000-2026-1005-001` });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.export`, r });
    }
    if (req.length) {
      const r = driver.declare('hook', { id: `${id}.import`, component_id: id, name: 'import', type: 'direct', direction: 'in', uuid: `nexus-loom-map-${id}-import-v1-0000-2026-1005-001` });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.import`, r });
    }
  }
  for (const c of BOUNDARY_IMPORTS) {
    const r = driver.declare('hook', { id: `${c}.import`, component_id: c, name: 'import', type: 'direct', direction: 'in', uuid: `nexus-loom-map-${c}-import-v1-0000-2026-1005-001` });
    (r.ok ? results.hooks : results.failures).push({ id: `${c}.import`, r });
  }
  let n = 0;
  for (const [consumer, dep] of CONSUMERS) {
    n++;
    const r = driver.declare('wire', { id: `build-context.wire.${n}.${dep}--${consumer}`, from_hook_id: `${dep}.export`, to_hook_id: `${consumer}.import`, uuid: `nexus-loom-map-build-context-wire-${n}-v1-0000-2026-1005-001`, external: !own.has(dep) });
    (r.ok ? results.wires : results.failures).push({ from: dep, to: consumer, r });
  }
  for (const [, id, req] of FILES) {
    for (const dep of req) {
      n++;
      const r = driver.declare('wire', { id: `build-context.wire.${n}.${dep}--${id}`, from_hook_id: `${dep}.export`, to_hook_id: `${id}.import`, uuid: `nexus-loom-map-build-context-wire-${n}-v1-0000-2026-1005-001`, external: !own.has(dep) });
      (r.ok ? results.wires : results.failures).push({ from: dep, to: id, r });
    }
  }
  return results;
}

module.exports = { mapBuildContext, FILES, CONSUMERS, BOUNDARY_IMPORTS };
