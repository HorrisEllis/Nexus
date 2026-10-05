'use strict';
/**
 * loom/maps/build-surface-map.js — 0.39.280: docs/2026-09-29-build-surface-phasemap.spec mapped into LOOM, one
 * component per FILE with every REAL edge as a wire. Mirrors loom/maps/chat-ledger-map.js.
 * comp_id: nexus.loom.maps.build-surface
 * UUID: nexus-loom-map-build-surface-v1-0000-2026-0929-001
 *
 * Hand-mapped because several edges are not require()s the source scanner can see:
 *   idearium/ui/js/{file-manage,repo-environment,plan-panel,living-spec}.js → idearium/api/index.js   HTTP /api/repos/:uuid/…
 *   idearium/ui/js/window-chrome.js → clear-glass/src/preload/compartment-window.js   window.nexusWindow (contextBridge)
 *   clear-glass/src/main/compartment-window.js → clear-glass/src/preload/compartment-window.js   loaded by path as preload
 *   guardian/userscript-chat-stream.js → guardian/server.js   HTTP POST :7820/api/provider/login
 *   idearium/api/build-surface.js → idearium/api/index.js   the deps it is handed (repo layer, versionium, JAA, phase build)
 * The require()/import edges of these files are listed too (the scanner skips hand-mapped files, loom/bootstrap.js).
 */
const { idFor } = require('../scanners/source-map');
const I = (rel) => idFor(rel);

// [file, id, requires (ids)] — each edge names why it is real
const FILES = [
  ['clear-glass/src/main/compartment-window.js', I('clear-glass/src/main/compartment-window.js'), [
    I('clear-glass/src/preload/compartment-window.js'),        // PRELOAD path — the compartment window's only preload
  ]],
  ['clear-glass/src/preload/compartment-window.js', I('clear-glass/src/preload/compartment-window.js'), []],
  ['clear-glass/src/copilot/verbs.js', I('clear-glass/src/copilot/verbs.js'), []],
  ['guardian/lib/provider-login.js', I('guardian/lib/provider-login.js'), []],
  ['cos/testenv/environment.js', I('cos/testenv/environment.js'), [
    I('cos/testenv/detect.js'),                                 // require('./detect.js') — plan(), describe()
  ]],
  ['idearium/repo/file-state.js', I('idearium/repo/file-state.js'), []],
  ['idearium/repo/deviation.js', I('idearium/repo/deviation.js'), []],
  ['idearium/repo/spec-plan.js', I('idearium/repo/spec-plan.js'), [
    I('loom/scanners/phasemap-map.js'),                         // parsePhasemapText — the one phasemap parser
  ]],
  ['idearium/repo/build-plan.js', I('idearium/repo/build-plan.js'), []],
  ['idearium/api/build-surface.js', I('idearium/api/build-surface.js'), [
    I('idearium/repo/file-state.js'), I('idearium/repo/deviation.js'), I('idearium/repo/spec-plan.js'), I('idearium/repo/build-plan.js'),
    I('idearium/repo/snapshot-files.js'), I('idearium/repo/snapshot.js'), I('idearium/repo/phases.js'),   // import()
    I('cos/testenv/environment.js'), I('cos/testenv/index.js'), I('cos/testenv/setup-job.js'), I('lib/repo-agent.js'),   // deps.require
  ]],
  ['idearium/ui/js/file-manage.js', I('idearium/ui/js/file-manage.js'), [I('idearium/api/index.js')]],        // HTTP files/state, manage, code/search
  ['idearium/ui/js/repo-environment.js', I('idearium/ui/js/repo-environment.js'), [I('idearium/api/index.js')]], // HTTP environment[/setup]
  ['idearium/ui/js/plan-panel.js', I('idearium/ui/js/plan-panel.js'), [I('idearium/api/index.js'), I('idearium/ui/js/work-surface.js')]],   // + §CT5 wsLoad/wsPaint, wsOpenInCode          // HTTP plan, phases/runs, spec/plan
  ['idearium/ui/js/window-chrome.js', I('idearium/ui/js/window-chrome.js'), [I('clear-glass/src/preload/compartment-window.js')]],   // window.nexusWindow
  // §0.39.349 CT3 — the Code tab as the work surface: HTTP code/*, worksurface, files/state, agent/route, agent/prompt;
  // file-manage.js's file states (loadFileStates, fileStateMark, pendingOnlyFiles); work-surface.js's cards (_wsCard, WSURF)
  // §0.39.350 CT4 — Settings → Models: HTTP ollama/check, ollama/check/ask; idearium/api runs lib/ollama-check.js
  ['lib/ollama-check.js', I('lib/ollama-check.js'), []],
  ['idearium/ui/js/ollama-check.js', I('idearium/ui/js/ollama-check.js'), [I('idearium/api/index.js')]],
  ['idearium/ui/js/code-surface.js', I('idearium/ui/js/code-surface.js'), [I('idearium/api/index.js'), I('idearium/ui/js/file-manage.js'), I('idearium/ui/js/work-surface.js'), I('idearium/ui/js/plan-panel.js')]],   // §CT5 openPlanPanel, _gateBar
];

// Consumers the scanner sees as files but not these edges: [consumer id, dependency id, where].
const CONSUMERS = [
  [I('clear-glass/src/main/index.js'), I('clear-glass/src/main/compartment-window.js'), 'web-contents-created → attach(); registerIpc(ipcMain, BrowserWindow)'],
  [I('clear-glass/src/copilot/bridge.js'), I('clear-glass/src/copilot/verbs.js'), '_parseCommands, send() browseIntent'],
  [I('guardian/server.js'), I('guardian/lib/provider-login.js'), 'POST/GET /api/provider/login'],
  [I('guardian/lib/dispatcher.js'), I('guardian/lib/provider-login.js'), 'queue reason for a provider behind a login wall'],
  [I('guardian/userscript-chat-stream.js'), I('guardian/server.js'), 'watchLogin → HTTP POST :7820/api/provider/login'],
  [I('idearium/api/index.js'), I('idearium/api/build-surface.js'), '11 build-surface routes, _deviationAfter'],
  [I('idearium/ui/js/living-spec.js'), I('idearium/api/index.js'), 'HTTP spec/plan, spec/build, deviation'],
  [I('idearium/api/index.js'), I('lib/ollama-check.js'), '§CT4 ollama.check, ollama.check.ask (_require)'],
  [I('idearium/ui/js/app.js'), I('idearium/ui/js/code-surface.js'), '§CT5 the SSE handler → codeSurfaceOnEvent; renderRepoCode for the Code subtab'],
];

function mapBuildSurface(driver) {
  const results = { components: [], hooks: [], wires: [], failures: [] };
  for (const [file, id] of FILES) {
    const r = driver.declare('component', { id, namespace: id.split('.').slice(0, 2).join('.'), name: file, version: '1.0.0', uuid: `nexus-loom-map-${id}-v1-0000-2026-0929-002` });
    (r.ok ? results.components : results.failures).push({ id, r });
  }
  const own = new Set(FILES.map(f => f[1]));
  for (const [, id, req] of FILES) {
    const e = driver.declare('hook', { id: `${id}.export`, component_id: id, name: 'export', type: 'direct', direction: 'out', uuid: `nexus-loom-map-${id}-export-v1-0000-2026-0929-002` });
    (e.ok ? results.hooks : results.failures).push({ id: `${id}.export`, r: e });
    if (req.length) {
      const r = driver.declare('hook', { id: `${id}.import`, component_id: id, name: 'import', type: 'direct', direction: 'in', uuid: `nexus-loom-map-${id}-import-v1-0000-2026-0929-002` });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.import`, r });
    }
  }
  // §0.39.281 — a consumer whose edge is not a require() (the dispatcher's deps, a UI script over HTTP) has no import
  // hook from the scan, so its wire had no end (4 of this map's wires failed on 0.39.280, reported there as 25 wires).
  // Declare it; one that already exists is refused as a duplicate — that is fine.
  for (const consumer of new Set(CONSUMERS.map(c => c[0]))) {
    if (own.has(consumer)) continue;
    const r = driver.declare('hook', { id: `${consumer}.import`, component_id: consumer, name: 'import', type: 'direct', direction: 'in', uuid: `nexus-loom-map-${consumer}-import-v1-0000-2026-0929-002` });
    if (r.ok) results.hooks.push({ id: `${consumer}.import`, r });
    else if (!(r.failures || []).every(f => f.axiomId === 'loom.unique-id')) results.failures.push({ id: `${consumer}.import`, r });
  }
  let n = 0;
  for (const [consumer, dep] of CONSUMERS) {
    n++;
    const r = driver.declare('wire', { id: `build-surface.wire.${n}.${dep}--${consumer}`, from_hook_id: `${dep}.export`, to_hook_id: `${consumer}.import`, uuid: `nexus-loom-map-build-surface-wire-${n}-v1-0000-2026-0929-001`, external: true });
    (r.ok ? results.wires : results.failures).push({ from: dep, to: consumer, r });
  }
  // §0.39.349 CT3 — a UI script another UI script uses (work-surface.js under code-surface.js) has no export hook from
  // the scan; declare it, as the consumers' import hooks are above. One that already exists is refused as a duplicate.
  for (const dep of new Set(FILES.flatMap(f => f[2]))) {
    if (own.has(dep)) continue;
    const r = driver.declare('hook', { id: `${dep}.export`, component_id: dep, name: 'export', type: 'direct', direction: 'out', uuid: `nexus-loom-map-${dep}-export-v1-0000-2026-1005-349` });
    if (r.ok) results.hooks.push({ id: `${dep}.export`, r });
    else if (!(r.failures || []).every(f => f.axiomId === 'loom.unique-id')) results.failures.push({ id: `${dep}.export`, r });
  }
  for (const [, id, req] of FILES) {
    for (const dep of req) {
      n++;
      const r = driver.declare('wire', { id: `build-surface.wire.${n}.${dep}--${id}`, from_hook_id: `${dep}.export`, to_hook_id: `${id}.import`, uuid: `nexus-loom-map-build-surface-wire-${n}-v1-0000-2026-0929-001`, external: !own.has(dep) });
      (r.ok ? results.wires : results.failures).push({ from: dep, to: id, r });
    }
  }
  return results;
}

module.exports = { mapBuildSurface, FILES, CONSUMERS };
