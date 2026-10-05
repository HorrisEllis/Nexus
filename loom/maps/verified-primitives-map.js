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
 *   idearium/ui/js/repo-settings.js → idearium/ui/js/ollama-check.js   renderOllamaCheck (the Models category, CT4)
 *   idearium/ui/js/desktop-setup.js → app.js (page globals) · idearium/api (HTTP); repo-environment.js and repo-settings.js open it (DK2)
 *   idearium/ui/js/workshop.js → idearium/api (HTTP: /api/workshop/*, the repo's /spec/plan, /spec/build, /plan) · app.js (postMessage
 *     nexus:repo.open, its message listener opens the repo on its Phases) (WS7, docs/2026-10-02-workshop-codex-rewind-phasemap.spec)
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
  // §0.39.340 DK2 (docs/2026-10-01-idearium-agent-ready-master-phasemap.spec) — the desktop setup popup
  ['idearium/ui/js/desktop-setup.js', I('idearium/ui/js/desktop-setup.js'), [
    I('idearium/ui/js/app.js'),                 // api, escapeHtml, openRepoDesktop (page globals)
    I('idearium/api/index.js'),                 // HTTP: /api/config, /api/repos/:uuid/environment[/setup], /api/cos/testenv
  ]],
  // §0.39.354 WS7 (docs/2026-10-02-workshop-codex-rewind-phasemap.spec) — the full workshop's page script (ui/workshop.html)
  ['idearium/ui/js/workshop.js', I('idearium/ui/js/workshop.js'), [
    I('idearium/api/index.js'),                 // HTTP: /api/workshop[/sources|/:id[/feed|/save|/proposal/:pid]], /api/repos/:uuid/spec/plan, …/spec/build, …/plan
    I('idearium/ui/js/app.js'),                 // window.opener.postMessage nexus:repo.open → app.js's message listener (subtab spec | phases)
  ]],
];

// Consumers the scanner sees as files but not these edges: [consumer id, dependency id, where].
const CONSUMERS = [
  [I('idearium/ui/js/app.js'), I('idearium/ui/js/repo-settings.js'), 'renderRepoSubtab → renderRepoSettings(CURRENT_API_REPO)'],
  [I('idearium/ui/js/repo-environment.js'), I('idearium/ui/js/desktop-setup.js'), 'envSetup → openDesktopSetup(repo) (§0.39.340 DK2)'],
  [I('idearium/ui/js/repo-settings.js'), I('idearium/ui/js/desktop-setup.js'), 'the Desktop category\'s ⚙ set up desktop → openDesktopSetup (§0.39.340 DK2)'],
  [I('idearium/ui/js/repo-settings.js'), I('idearium/ui/js/ollama-check.js'), 'the Models category → renderOllamaCheck (§0.39.350 CT4)'],
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
