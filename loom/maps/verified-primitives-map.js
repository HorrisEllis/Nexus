'use strict';
/**
 * loom/maps/verified-primitives-map.js — docs/2026-10-05-verified-primitives-phasemap.spec mapped into LOOM, one
 * component per FILE with every REAL edge as a wire. Mirrors loom/maps/build-surface-map.js. Grows as its phases land.
 * comp_id: nexus.loom.maps.verified-primitives
 * UUID: nexus-loom-map-verified-primitives-v1-0000-2026-1005-001
 *
 * Hand-mapped because these edges are not require()s the source scanner can see (idearium's page scripts share one
 * window; loom/bootstrap.js skips hand-mapped files):
 *   idearium/ui/js/repo-settings.js → idearium/ui/js/app.js            renderRepoAgentSettings, API_BASE, CURRENT_API_REPO
 *   idearium/ui/js/repo-settings.js → idearium/ui/js/agent-blocks.js   renderAgentBlocks (the Prompt category)
 *   idearium/ui/js/repo-settings.js → idearium/ui/js/repo-environment.js   renderRepoEnvironment (the Environment category)
 *   idearium/ui/js/repo-settings.js → idearium/api/index.js            HTTP settings.html?tab=…&single=1 (one console view)
 *   idearium/ui/js/app.js → idearium/ui/js/repo-settings.js            renderRepoSettings (the repo's Settings subtab)
 */
const { idFor } = require('../scanners/source-map');
const I = (rel) => idFor(rel);

// [file, id, requires (ids)] — each edge names why it is real
const FILES = [
  ['idearium/ui/js/repo-settings.js', I('idearium/ui/js/repo-settings.js'), [
    I('idearium/ui/js/app.js'),                 // renderRepoAgentSettings, openSettingsConsole, openRepoDesktop, API_BASE
    I('idearium/ui/js/agent-blocks.js'),        // renderAgentBlocks — the Prompt category
    I('idearium/ui/js/repo-environment.js'),    // renderRepoEnvironment — the Environment category
    I('idearium/api/index.js'),                 // HTTP: settings.html?repo=…&tab=…&embed=1&single=1 (served by idearium)
  ]],
];

// Consumers the scanner sees as files but not these edges: [consumer id, dependency id, where].
const CONSUMERS = [
  [I('idearium/ui/js/app.js'), I('idearium/ui/js/repo-settings.js'), 'renderRepoSubtab → renderRepoSettings(CURRENT_API_REPO)'],
];

// idearium's page scripts are scanned components with no static require edges, so the scanner gives app.js and
// agent-blocks.js no hooks and every wire to or from them was hard-rejected (loom.wire-endpoints-exist) — measured on a
// from-scratch bootstrap of 0.39.310. Their boundary hooks are declared here, once.
const BOUNDARY_EXPORTS = [I('idearium/ui/js/app.js'), I('idearium/ui/js/agent-blocks.js')];
const BOUNDARY_IMPORTS = [I('idearium/ui/js/app.js')];

function mapVerifiedPrimitives(driver) {
  const results = { components: [], hooks: [], wires: [], failures: [] };
  for (const [file, id] of FILES) {
    const r = driver.declare('component', { id, namespace: id.split('.').slice(0, 2).join('.'), name: file, version: '1.0.0', uuid: `nexus-loom-map-${id}-v1-0000-2026-1005-001` });
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
  for (const c of BOUNDARY_EXPORTS) {
    const r = driver.declare('hook', { id: `${c}.export`, component_id: c, name: 'export', type: 'direct', direction: 'out', uuid: `nexus-loom-map-${c}-export-v1-0000-2026-1005-001` });
    (r.ok ? results.hooks : results.failures).push({ id: `${c}.export`, r });
  }
  for (const c of BOUNDARY_IMPORTS) {
    const r = driver.declare('hook', { id: `${c}.import`, component_id: c, name: 'import', type: 'direct', direction: 'in', uuid: `nexus-loom-map-${c}-import-v1-0000-2026-1005-001` });
    (r.ok ? results.hooks : results.failures).push({ id: `${c}.import`, r });
  }
  let n = 0;
  for (const [consumer, dep] of CONSUMERS) {
    n++;
    const r = driver.declare('wire', { id: `verified-primitives.wire.${n}.${dep}--${consumer}`, from_hook_id: `${dep}.export`, to_hook_id: `${consumer}.import`, uuid: `nexus-loom-map-verified-primitives-wire-${n}-v1-0000-2026-1005-001`, external: !own.has(consumer) });
    (r.ok ? results.wires : results.failures).push({ from: dep, to: consumer, r });
  }
  for (const [, id, req] of FILES) {
    for (const dep of req) {
      n++;
      const r = driver.declare('wire', { id: `verified-primitives.wire.${n}.${dep}--${id}`, from_hook_id: `${dep}.export`, to_hook_id: `${id}.import`, uuid: `nexus-loom-map-verified-primitives-wire-${n}-v1-0000-2026-1005-001`, external: !own.has(dep) });
      (r.ok ? results.wires : results.failures).push({ from: dep, to: id, r });
    }
  }
  return results;
}

module.exports = { mapVerifiedPrimitives, FILES, CONSUMERS, BOUNDARY_EXPORTS, BOUNDARY_IMPORTS };
