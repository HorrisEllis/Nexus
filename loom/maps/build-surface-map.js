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
  // §0.49.0 RS3/RS9 — the spec as blocks (lib/spec-document.js) and the thread (idearium/repo/thread.js, a pure
  // projection handed the document reader and the parser by idearium/api)
  ['lib/spec-document.js', I('lib/spec-document.js'), []],
  ['idearium/repo/thread.js', I('idearium/repo/thread.js'), []],
  // §0.52.0 HP2 — runs left in flight by a process that is gone are said interrupted (pure; idearium/api runs it at boot)
  ['idearium/repo/run-reconcile.js', I('idearium/repo/run-reconcile.js'), []],
  // §0.50.0 RS10 — the Phases tab on the thread: HTTP phases, thread, plan; plan-panel.js (_gateBar, _ledgerHtml, openPlanPanel); work-surface.js (wsOpenInCode)
  ['idearium/ui/js/phases.js', I('idearium/ui/js/phases.js'), [I('idearium/api/index.js'), I('idearium/ui/js/plan-panel.js'), I('idearium/ui/js/work-surface.js')]],
  // §0.39.350 CT4 — Settings → Models: HTTP ollama/check, ollama/check/ask; idearium/api runs lib/ollama-check.js
  ['lib/ollama-check.js', I('lib/ollama-check.js'), []],
  ['idearium/ui/js/ollama-check.js', I('idearium/ui/js/ollama-check.js'), [I('idearium/api/index.js')]],
  // §0.56.0 SD1 — versions and rewind on the repo's box: HTTP snapshots, desktop, desktop/checkpoints, desktop/:op;
  // app.js previewRepoRestore (the real restore preview); repo-tasks.js rtRewind
  ['idearium/ui/js/repo-card-time.js', I('idearium/ui/js/repo-card-time.js'), [I('idearium/api/index.js'), I('idearium/ui/js/app.js'), I('idearium/ui/js/repo-tasks.js')]],
  // §0.57.0 OP0–OP3 — one options shape for every system: lib/options.js (pure: fs only), guardian its first system
  // (guardian/options.js, read by dispatcher, ask, ncp-handler, job-retry, dispatch-ladder, wake-loop; served at /api/options)
  ['lib/options.js', I('lib/options.js'), []],
  ['guardian/options.js', I('guardian/options.js'), [I('lib/options.js')]],
  // §0.58.0 IA0–IA4 — who may act on Idearium: idearium/lib/access.cjs (keys, sessions, the gate; fs + crypto + data-dir),
  // the fetch guard every Idearium page loads first, the sign-in page, Clear Glass's sign-in from its password vault
  ['idearium/lib/access.cjs', I('idearium/lib/access.cjs'), [I('idearium/lib/data-dir.cjs')]],
  // §0.59.0 FN1–FN3 — the interaction field as commands, Nexus Nerve seeing it: Clear Glass's per-window attention record
  // (pure; fed from the bus by main/index.js, served at /cli/attention by ipc/agent-routes.js)
  ['clear-glass/src/page/attention.js', I('clear-glass/src/page/attention.js'), []],
  // §0.59.3 the Fiverr panel in the browser: cg.autofill.gig / gigFill / gigToIdearium (preload → ipc/bridge.js → src/autofill/gig.js; Idearium through lib/nexus-client)
  // §0.59.4 a Guardian listener runs the Nexus commands it hears, through the one command tool
  ['lib/listener-commands.js', I('lib/listener-commands.js'), [I('lib/agent-tools/tools/nexus/command.js')]],
  ['clear-glass/renderer/gig-panel.js', I('clear-glass/renderer/gig-panel.js'), [I('clear-glass/src/preload/index.js')]],
  ['idearium/ui/js/access-guard.js', I('idearium/ui/js/access-guard.js'), [I('idearium/api/index.js')]],   // a 401 naming /login.html
  ['idearium/ui/login.html', I('idearium/ui/login.html'), [I('idearium/api/index.js')]],                   // HTTP access/me, access/login
  ['clear-glass/src/accounts/idearium-login.js', I('clear-glass/src/accounts/idearium-login.js'), [I('clear-glass/src/passwords/vault.js'), I('idearium/api/index.js')]],   // vault.get(origin); HTTP POST access/login
  ['idearium/ui/js/code-surface.js', I('idearium/ui/js/code-surface.js'), [I('idearium/api/index.js'), I('idearium/ui/js/file-manage.js'), I('idearium/ui/js/work-surface.js'), I('idearium/ui/js/plan-panel.js')]],   // §CT5 openPlanPanel, _gateBar
];

// Consumers the scanner sees as files but not these edges: [consumer id, dependency id, where].
const CONSUMERS = [
  [I('guardian/lib/dispatcher.js'), I('guardian/options.js'), '§OP1 jobs.pickup_ms, completion_idle_ms, empty_reply_grace_ms, resume_grace_ms'],
  [I('guardian/ask.js'), I('guardian/options.js'), '§OP1 jobs.no_tab_ms, economy_wait_ms, ask.default_timeout_ms'],
  [I('guardian/lib/ncp-handler.js'), I('guardian/options.js'), '§OP1 jobs.empty_reply_grace_ms, max_response_chars'],
  [I('guardian/lib/job-retry.js'), I('guardian/options.js'), '§OP1 retry.max_attempts, first_wait_ms, busy_first_wait_ms'],
  [I('guardian/server.js'), I('guardian/options.js'), '§OP1 GET/POST /api/options'],
  [I('idearium/api/index.js'), I('guardian/server.js'), '§OP2 HTTP /api/systems/:system/options → the system\'s /api/options'],
  [I('clear-glass/src/main/index.js'), I('clear-glass/src/page/attention.js'), '§FN2 bus.on(\'*\') → attention.note(type, data)'],
  [I('clear-glass/src/ipc/agent-routes.js'), I('clear-glass/src/page/attention.js'), '§FN2 GET /cli/attention → shared().windows()'],
  [I('lib/nerve/index.js'), I('clear-glass/src/ipc/agent-routes.js'), '§FN2 HTTP GET :7702/cli/attention → each window\'s focus in the snapshot'],
  [I('idearium/cli/route-commands.js'), I('clear-glass/src/ipc/agent-routes.js'), '§FN1 HTTP POST :7702/cli/driver (field, fieldOff, at, spotlight, pointer) · GET /cli/attention'],
  [I('idearium/cli/route-commands.js'), I('cortex/boot.js'), '§FN2 HTTP GET /nerve/snapshot (`idearium nerve`)'],
  [I('ui/tv-shell/nerve/nerve.js'), I('guardian/server.js'), '§FN3 HTTP /api/guardian/nerve/snapshot windows[].focus → the HUD and the browser node ring'],
  [I('idearium/api/index.js'), I('idearium/lib/access.cjs'), '§IA0 decide() before every route (ROUTE_CAP); §IA1 /api/access/* — login, keys, revoke'],
  [I('clear-glass/src/main/index.js'), I('clear-glass/src/accounts/idearium-login.js'), '§IA4 signIn({vault: passwordVault, cookies: session.defaultSession.cookies}) at start'],
  [I('idearium/ui/settings.html'), I('idearium/api/index.js'), '§IA3 Settings → Access: HTTP access/me, access/keys, config access.*'],
  [I('clear-glass/src/main/index.js'), I('clear-glass/src/main/compartment-window.js'), 'web-contents-created → attach(); registerIpc(ipcMain, BrowserWindow)'],
  [I('clear-glass/src/copilot/bridge.js'), I('clear-glass/src/copilot/verbs.js'), '_parseCommands, send() browseIntent'],
  [I('guardian/server.js'), I('guardian/lib/provider-login.js'), 'POST/GET /api/provider/login'],
  [I('guardian/lib/dispatcher.js'), I('guardian/lib/provider-login.js'), 'queue reason for a provider behind a login wall'],
  [I('guardian/userscript-chat-stream.js'), I('guardian/server.js'), 'watchLogin → HTTP POST :7820/api/provider/login'],
  [I('idearium/api/index.js'), I('idearium/api/build-surface.js'), '11 build-surface routes, _deviationAfter'],
  [I('idearium/ui/js/living-spec.js'), I('idearium/api/index.js'), 'HTTP spec/plan, spec/build, deviation'],
  [I('idearium/api/index.js'), I('lib/ollama-check.js'), '§CT4 ollama.check, ollama.check.ask (_require)'],
  [I('idearium/api/index.js'), I('idearium/repo/thread.js'), '§RS9 repo.thread (await import)'],
  [I('idearium/api/index.js'), I('lib/spec-document.js'), '§RS9 repo.thread — the document reader handed to thread()'],
  [I('idearium/repo/spec-plan.js'), I('lib/spec-document.js'), '§RS9 derivePlan / planPrompt cut by the blocks; BOOKKEEPING'],
  [I('idearium/ui/js/app.js'), I('idearium/ui/js/code-surface.js'), '§CT5 the SSE handler → codeSurfaceOnEvent; renderRepoCode for the Code subtab'],
  [I('idearium/api/index.js'), I('idearium/repo/run-reconcile.js'), '§HP2 _reconcileRuns at boot (interruptedRows)'],
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
