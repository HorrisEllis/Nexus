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
  // 0.60.29 PM — every phase mapped to its files and dependencies
  ['lib/phase-files.js', I('lib/phase-files.js'), [
    I('loom/scanners/phasemap-map.js'),                         // require — parsePhasemapText, the one phase parser
  ]],
  ['idearium/repo/phase-mapping.js', I('idearium/repo/phase-mapping.js'), [
    I('lib/phase-files.js'),                                    // createRequire — candidates, brief, parseAnswer, score, depsFor, applyTo
  ]],
  // 0.60.65 MP1/MP2 — every phase mapped by Nexus with no model: files with evidence, requires, consumers, specs, waits-on
  ['lib/phase-map-auto.js', I('lib/phase-map-auto.js'), [
    I('lib/phase-files.js'),                                    // require — phasesOf, candidates, hubsOf, depsFor
    I('lib/nexus-self/systems.js'),                             // require (specsOfNexus) — ownerOf, get: the specs that own a file
    I('lib/code-intel/chunker.js'),                             // require (exportsOfTree, 0.60.66 MP3) — exportedNames for a build's context
  ]],
  // 0.60.66 SF3 — a .spec in the compiler's format is checked at the code.write gate and collected when it lands
  ['lib/spec-collect.js', I('lib/spec-collect.js'), [
    I('nexus/nexus-bus.js'),                                    // require — emit idearium.spec.collected
  ]],
  // 0.60.94 FN0 — James: "Every thing the agents do. Needs to determine dependancies, spec, phase, then chunk." No model.
  ['lib/work-funnel.js', I('lib/work-funnel.js'), [
    I('lib/phase-map-auto.js'),                                 // require — mapPhase / mapPhases / envFromTree (deps, owning specs, phases)
    I('lib/phase-files.js'),                                    // require — phasesOf (the repo's phases, with status)
    I('lib/phase-plan.js'),                                     // require — derivePlan (the chunks, no model)
    I('lib/context-prereqs.js'),                                // require — intentOf (who enters the funnel)
  ]],
  // 0.60.74 COSA10 — James: "i figure cos could be helpfui for managing my projects so im not so overwhelmed." Pure: its readers
  // (notes counts, roadmap, last activity) are passed in by idearium/api projects.overview
  ['idearium/lib/projects.cjs', I('idearium/lib/projects.cjs'), []],
  // 0.60.73 WB1/WB2 — James chose option 1: WARP around the agent the ladder and RAID already chose (cache, axiom gate, retain)
  ['lib/warp-rung.js', I('lib/warp-rung.js'), [
    I('lib/seam/adapters/warp-cascade.js'),                     // require — createWarpDispatch (unifiedDispatch, one provider, one attempt)
    I('warp/plugins/crystallizer-flatfile.js'),                 // require — the exact cache (data/warp/rung-crystals.json)
    I('warp/dispatch/population.js'),                           // require — retention and promotion after 3 passing results
  ]],
  // 0.60.28 PF1 — ready before run: Guardian's facts per agent, and the build's pure check over its ladder
  ['guardian/lib/provider-ready.js', I('guardian/lib/provider-ready.js'), []],
  ['lib/run-ready.js', I('lib/run-ready.js'), []],
  // 0.60.27 AG1a — agent calls and tokens per phase, counted over the run rows
  ['lib/phase-cost.js', I('lib/phase-cost.js'), [
    I('lib/run-watch.js'),                                      // require('./run-watch.js') — runsOf groups the rows by run
  ]],
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
  ['idearium/ui/js/projects.js', I('idearium/ui/js/projects.js'), [I('idearium/api/index.js'), I('idearium/ui/js/app.js')]],   // §0.60.74 COSA10 HTTP my-projects; enterRepoDetail/selectApiRepo, escapeHtml, api
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
  // §0.59.5 a watched chat page talks to Nexus: main/index.js attaches it to every web-contents; it runs through lib/listener-commands.js
  ['clear-glass/src/page/nexus-chat.js', I('clear-glass/src/page/nexus-chat.js'), [I('lib/listener-commands.js'), I('idearium/cli/route-commands.js')]],
  ['lib/listener-commands.js', I('lib/listener-commands.js'), [I('lib/agent-tools/tools/nexus/command.js')]],
  // §0.59.11 TN4 talk to Nexus in plain words: the pane (bridge) and /api/prompt (server) → nexus-ask → the rows' ASK words → the command tool
  // §0.59.12 the agent's own nexus> tools: log, file, grep read here (route-commands.js `local` rows); glass open → Clear Glass /cli/open → openOrFocus
  ['lib/nexus-read.js', I('lib/nexus-read.js'), []],
  ['copilot/lib/nexus-ask.js', I('copilot/lib/nexus-ask.js'), [I('idearium/cli/route-commands.js'), I('lib/agent-tools/tools/nexus/command.js')]],
  ['clear-glass/renderer/gig-panel.js', I('clear-glass/renderer/gig-panel.js'), [I('clear-glass/src/preload/index.js')]],
  ['idearium/ui/js/access-guard.js', I('idearium/ui/js/access-guard.js'), [I('idearium/api/index.js')]],   // a 401 naming /login.html
  ['idearium/ui/login.html', I('idearium/ui/login.html'), [I('idearium/api/index.js')]],                   // HTTP access/me, access/login
  ['clear-glass/src/accounts/idearium-login.js', I('clear-glass/src/accounts/idearium-login.js'), [I('clear-glass/src/passwords/vault.js'), I('idearium/api/index.js')]],   // vault.get(origin); HTTP POST access/login
  ['idearium/ui/js/code-surface.js', I('idearium/ui/js/code-surface.js'), [I('idearium/api/index.js'), I('idearium/ui/js/file-manage.js'), I('idearium/ui/js/work-surface.js'), I('idearium/ui/js/plan-panel.js')]],   // §CT5 openPlanPanel, _gateBar
  ['idearium/ui/js/code-tab-panels.js', I('idearium/ui/js/code-tab-panels.js'), [I('idearium/api/index.js'), I('idearium/ui/js/code-surface.js'), I('idearium/ui/js/file-manage.js'), I('idearium/ui/js/repo-tasks.js'), I('idearium/ui/js/repo-drawer-views.js')]],   // §0.60.82 CE6 · CE7 · CE9: …/file, …/code/assist, …/runs, …/agent/history; openManagePanel; rtView mounted in the Code tab
];

// Consumers the scanner sees as files but not these edges: [consumer id, dependency id, where].
const CONSUMERS = [
  [I('idearium/api/index.js'), I('lib/work-funnel.js'), '§FN0 0.60.94 repo.funnel: POST /api/repos/:uuid/funnel — the four answers for a request'],
  [I('idearium/cli/route-commands.js'), I('idearium/api/index.js'), '§FN0 0.60.94 the repo.funnel row → POST /api/repos/:uuid/funnel'],
  [I('cortex/core/raid/officiator.js'), I('cortex/core/raid/index.js'), '§RT1 0.60.78 decideForContract candidates walked; recordOutcome on an answer (never on a silence)'],
  [I('cortex/boot.js'), I('cortex/core/raid/officiator.js'), '§RT1 0.60.78 GET /api/raid/officiator (parked) · POST /api/raid/officiator/unpark'],
  [I('idearium/api/index.js'), I('cortex/boot.js'), '§RT1 0.60.78 HTTP raid.held / raid.held.unpark → cortex /api/raid/officiator'],
  [I('idearium/ui/js/projects.js'), I('idearium/api/index.js'), '§RT1 0.60.78 HTTP GET /api/raid/held, POST /api/raid/held/unpark — the RAID intake line in My projects'],
  [I('idearium/api/index.js'), I('lib/phase-plan.js'), '§GW24 0.60.76 PP.contextNote — the dependencies\' code ranked and cut to the budget'],
  [I('idearium/api/index.js'), I('cortex/core/raid/contract-gates.js'), '§GW24 0.60.76 Boundaries.budget — the first agent\'s learned size sets the brick\'s context budget'],
  [I('idearium/api/index.js'), I('cortex/core/raid/contract-trace.js'), '§GW3 0.60.75 repo.phases.contract ?trace=1 — trace(), lines()'],
  [I('idearium/api/index.js'), I('cortex/core/raid/contract-intake.js'), '§GW3 0.60.75 ?trace=1 — listQueue(): RAID\'s row for the run'],
  [I('idearium/ui/js/plan-panel.js'), I('idearium/api/index.js'), '§GW3 0.60.75 ppTrace — HTTP GET /phases/contract?trace=1'],
  [I('idearium/api/index.js'), I('idearium/lib/projects.cjs'), '§COSA10 0.60.74 projects.overview: GET /api/my-projects'],
  [I('idearium/api/index.js'), I('lib/repo-notes.js'), '§COSA10 0.60.74 projects.overview notesOf → counts()'],
  [I('idearium/api/index.js'), I('lib/activity-log/compartment.js'), '§COSA10 0.60.74 projects.overview activityOf → list(u, {limit:1})'],
  [I('idearium/api/index.js'), I('idearium/repo/roadmap.js'), '§COSA10 0.60.74 projects.overview phasesOf → buildRoadmap'],
  [I('idearium/ui/js/projects.js'), I('idearium/api/index.js'), '§COSA10 0.60.74 HTTP GET /api/my-projects — the My projects button'],
  [I('idearium/cli/route-commands.js'), I('idearium/api/index.js'), '§COSA10 0.60.74 the projects row → GET /api/my-projects'],
  [I('idearium/api/index.js'), I('lib/warp-rung.js'), '§WB1 0.60.73 WR.wrap: phase build (gate), planner (cache), proof repair (gate), draft review (gate)'],
  [I('cortex/core/raid/officiator.js'), I('lib/warp-rung.js'), '§WB2 0.60.73 _synthesizeCore: cache mode, a reply that does not parse as a contract fails the hard axiom'],
  [I('cortex/core/raid/contract-intake.js'), I('lib/warp-rung.js'), '§WB2 0.60.73 _realAgentExecutor: cache mode, a retry is fresh'],
  [I('lib/build-paths.js'), I('lib/warp-rung.js'), '§WB1 0.60.73 the census counts a call inside WR.wrap as WARP (read as text, not required)'],
  [I('clear-glass/src/copilot/bridge.js'), I('lib/claude-code-backend.js'), '§0.59.14 _callClaudeCode → ask(): Claude Code as a co-pilot backend'],
  [I('idearium/cli/route-commands.js'), I('lib/nexus-read.js'), '§0.59.12 the log / file / grep rows (local)'],
  [I('clear-glass/src/ipc/bridge.js'), I('clear-glass/src/main/index.js'), '§0.59.12 /cli/open → openOrFocus()'],
  [I('scripts/generate-atlases.js'), I('lib/atlas-generate.js'), '§0.59.12 syncReadme(): README.md ← docs/atlases/nexus-atlas.md'],
  [I('clear-glass/src/copilot/bridge.js'), I('copilot/lib/nexus-ask.js'), '§0.59.11 TN3 send(): plain words that mean a Nexus command, before the model'],
  [I('copilot/server.js'), I('copilot/lib/nexus-ask.js'), '§0.59.11 TN3 /api/prompt: after nexus-awareness, for every other channel'],
  [I('lib/agent-tools/tools/nexus/command.js'), I('idearium/cli/route-commands.js'), '§0.59.11 TN1 renderText — the row\'s printer as plain text'],
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
  [I('idearium/ui/js/code-surface.js'), I('idearium/ui/js/code-tab-panels.js'), '§0.60.81 CE6 tree filter/add/delete, edit mode, Manage; CE7 _cxLinesHtml; CE9 cxPanelsHtml / cxAfterPaint'],
  [I('idearium/ui/js/app.js'), I('idearium/ui/js/code-surface.js'), '§0.60.81 CE6 setRepoSubtab(files) → code; openApiRepoFile → csOpen (the Files tab merged)'],
  [I('idearium/ui/js/file-manage.js'), I('idearium/ui/js/code-surface.js'), '§0.60.81 CE6/CV1 Manage reads the Code tab\'s file and lines (CS); its rail is the file timeline (…/history, …/file/versions, …/versions/diff, …/versions/restore-file)'],
  [I('idearium/ui/js/repo-drawer-views.js'), I('idearium/ui/js/repo-tasks.js'), '§0.60.81 CE9 _rtEl: the views draw into the Code tab mount when it is on screen'],
  [I('idearium/api/index.js'), I('idearium/repo/run-reconcile.js'), '§HP2 _reconcileRuns at boot (interruptedRows)'],
  // 0.60.26 — what lean mode holds is stopped on purpose: the callers read it before retrying or loading a model
  [I('orchestrator/orchestrator.js'), I('lib/lean-mode.js'), '0.60.26 gap-relay isHeld: no reconnect to a held diagnostic'],
  [I('cortex/boot.js'), I('lib/lean-mode.js'), '0.60.26 _intelligenceHeld: no relay to a held intelligence'],
  [I('copilot/adversarial.js'), I('lib/lean-mode.js'), '0.60.26 run(): the probe is held while lean is on'],
  [I('guardian/lib/dispatcher.js'), I('ollama/lib/model-inventory.js'), '0.60.26 deepseek → Ollama only with an installed model'],
  [I('guardian/lib/dispatcher.js'), I('guardian/lib/provider-routing.js'), '0.60.26 deepseekLocal(names, want)'],
  [I('idearium/api/index.js'), I('lib/phase-cost.js'), '0.60.27 AG1a GET /phases/cost (_require)'],
  [I('idearium/repo/build-plan.js'), I('lib/phase-cost.js'), '0.60.27 AG1a each Plan step carries its cost (createRequire)'],
  [I('idearium/api/index.js'), I('lib/economy/tokens.js'), '0.60.27 AG1a _tokEst: tokens estimated on each call row'],
  [I('guardian/server.js'), I('guardian/lib/provider-ready.js'), '0.60.28 PF1 GET /api/providers/ready (readiness)'],
  [I('idearium/api/index.js'), I('lib/run-ready.js'), '0.60.28 PF1 _phaseBuild: apply(rungs, ready, { planner })'],
  [I('lib/agent-providers.js'), I('guardian/server.js'), '0.60.28 PF1 guardianReady(): HTTP GET :7820/api/providers/ready'],
  [I('idearium/api/index.js'), I('lib/phase-plan.js'), '0.60.28 PF2 derivePlan when no planner is ready or it failed'],
  [I('idearium/api/index.js'), I('idearium/repo/phase-mapping.js'), '0.60.29 PM POST/GET /phases/map (await import) — runMapping'],
  [I('idearium/ui/js/phases.js'), I('idearium/api/index.js'), '0.60.29 PM HTTP POST/GET /api/repos/:uuid/phases/map — the Phases tab button'],
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
