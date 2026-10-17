'use strict';
/**
 * loom/maps/run-state-map.js — §0.60.50 CE1–CE5 + CE10: the edges the source scanner cannot read in the run state
 * (docs/2026-10-15-code-tab-run-state-phasemap.spec). lib/run-state.js is reached by lazy require() inside functions
 * (the scanner reads top-level requires), and the copilot loop reaches the agent over HTTP, so these are hand-mapped.
 * comp_id: nexus.loom.maps.run-state
 */
const { idFor } = require('../scanners/source-map');
const { declareMap } = require('./declare-map');
const I = (rel) => idFor(rel);

const FILES = [
  ['lib/run-state.js',   I('lib/run-state.js'),   [I('lib/node-export.js'), I('nexus/nexus-bus.js')]],
  ['lib/reply-kind.js',  I('lib/reply-kind.js'),  [I('lib/step-gate.js')]],
  ['lib/gig-ledger.js',  I('lib/gig-ledger.js'),  []],   // §0.60.53 PF0
  ['lib/checks/ck-248-toolchain.js', I('lib/checks/ck-248-toolchain.js'), []],   // §0.60.77 MB5: 18 languages, each by its own parser; selfTest/coverage/checkText
  ['lib/test-map.js', I('lib/test-map.js'), []],   // §0.60.75 PE1: which tests exercise a file (direct links, by how)
  ['lib/proposal-evidence.js', I('lib/proposal-evidence.js'), [I('lib/test-map.js'), I('lib/step-gate.js'), I('lib/repo-inject.js')]],   // §0.60.75 PE2
  ['lib/chat-crawl-settings.js', I('lib/chat-crawl-settings.js'), []],   // §0.60.55 PI5
  ['lib/chat-crawl-plan.js', I('lib/chat-crawl-plan.js'), [I('lib/chat-crawl-settings.js')]],
  ['clear-glass/src/chats/crawler.js', I('clear-glass/src/chats/crawler.js'), [I('lib/chat-crawl-plan.js'), I('lib/chat-crawl-settings.js')]],   // §0.60.84 PI5
  ['clear-glass/src/chats/ports.js', I('clear-glass/src/chats/ports.js'), [I('clear-glass/src/downloads/chat-ledger.js')]],   // §0.60.85 PI5b
  ['clear-glass/src/chats/service.js', I('clear-glass/src/chats/service.js'), [I('clear-glass/src/chats/crawler.js'), I('clear-glass/src/chats/ports.js'), I('lib/chat-crawl-settings.js')]],
  ['cos/app/store.js', I('cos/app/store.js'), [I('lib/zip.js'), I('lib/release-version.js')]],   // §0.60.87 COSA1; 0.60.111 names a zip from its contents
  ['cos/app/runtime.js', I('cos/app/runtime.js'), []],   // §0.60.88 COSA2/3
  ['cos/app/switch.js', I('cos/app/switch.js'), [I('cos/app/store.js'), I('cos/app/runtime.js')]],   // §0.60.88 COSA4
  ['clear-glass/src/releases/deliver.js', I('clear-glass/src/releases/deliver.js'), []],   // §0.60.93 COSA7
  ['clear-glass/src/releases/service.js', I('clear-glass/src/releases/service.js'), [I('clear-glass/src/releases/deliver.js'), I('cos/app/store.js')]],
  ['cos/app/shell.js', I('cos/app/shell.js'), [I('cos/app/store.js'), I('cos/app/runtime.js'), I('cos/app/cli.js')]],   // §0.60.91 CON-lite
  ['cos/app/settings.js', I('cos/app/settings.js'), []],   // §0.60.90 COSA12/13
  ['cos/app/controller.js', I('cos/app/controller.js'), [I('cos/app/store.js'), I('cos/app/runtime.js'), I('cos/app/switch.js'), I('cos/app/settings.js')]],   // §0.60.89 COSA6
  ['cos/app/desktop/main.js', I('cos/app/desktop/main.js'), [I('cos/app/controller.js'), I('cos/app/store.js'), I('cos/app/settings.js'), I('cos/app/shell.js')]],
  ['cos/app/desktop/preload.js', I('cos/app/desktop/preload.js'), []],
  ['cos/app/desktop/ui/app.js', I('cos/app/desktop/ui/app.js'), []],
  ['scripts/build-cos-app.js', I('scripts/build-cos-app.js'), [I('cos/app/controller.js'), I('lib/zip.js')]],
  ['cos/app/cli.js', I('cos/app/cli.js'), [I('cos/app/store.js'), I('cos/app/runtime.js'), I('cos/app/switch.js')]],
  ['clear-glass/src/macros/recorder-script.js', I('clear-glass/src/macros/recorder-script.js'), []],   // §0.60.57 MR1
  ['clear-glass/src/macros/live-recording.js', I('clear-glass/src/macros/live-recording.js'), [I('clear-glass/src/macros/recorder-script.js'), I('clear-glass/src/macros/recording.js'), I('clear-glass/src/automation/nodes.js')]],
  ['clear-glass/src/net/policy.js', I('clear-glass/src/net/policy.js'), []],   // §0.60.60 NP2
  ['clear-glass/src/net/transport-host.js', I('clear-glass/src/net/transport-host.js'), []],   // §0.60.60 NP1
  ['clear-glass/src/net/service.js', I('clear-glass/src/net/service.js'), [I('clear-glass/src/net/policy.js'), I('clear-glass/src/net/transport-host.js')]],
  ['lib/agent-tools/tools/clear-glass/net.js', I('lib/agent-tools/tools/clear-glass/net.js'), []],   // §0.60.60 NP9: read-only agent view
  ['idearium/lib/surface-state.cjs', I('idearium/lib/surface-state.cjs'), [I('idearium/lib/data-dir.cjs')]],   // §0.60.80 CE8: the Code tab's surface, one for the tab, the CLI and agents
  ['cos/archetype/eravos.js', I('cos/archetype/eravos.js'), []],   // §0.60.104 CN1/CN2: his ERAVOS canvas, tools and domains as COS archetypes (read from cos/archetype/eravos-*/)
  ['lib/canvas-compartments.js', I('lib/canvas-compartments.js'), [I('lib/cos-bridge.js'), I('lib/file-tree-plan.js'), I('cos/archetype/eravos.js')]],   // §0.60.104 CN3: a canvas compartment, each tool nested
  ['clear-glass/src/contexts/google-signin.js', I('clear-glass/src/contexts/google-signin.js'), [I('clear-glass/src/contexts/session-headers.js'), I('clear-glass/src/fingerprint/firefox-version.js'), I('clear-glass/src/preload/google-signin.js')]],
  ['clear-glass/src/fingerprint/firefox-version.js', I('clear-glass/src/fingerprint/firefox-version.js'), []],   // §0.60.108 GS3: the Firefox version from Mozilla's calendar
  ['clear-glass/src/preload/google-signin.js', I('clear-glass/src/preload/google-signin.js'), []],   // §0.60.108 GS4: the sign-in page reads as Firefox, no debugger   // §0.60.106 GS1: Google's sign-in as Firefox, consistently
  ['clear-glass/src/tls/helper.js', I('clear-glass/src/tls/helper.js'), []],   // §0.60.109 TLS2: runs cg-tls-helper (clear-glass/tls-helper, Go + uTLS); its CA trust for personas
  ['lib/gig-ledger-listener.js', I('lib/gig-ledger-listener.js'), [I('lib/gig-ledger.js'), I('lib/run-state.js'), I('nexus/nexus-bus.js')]],
  ['lib/repo-procedures.js', I('lib/repo-procedures.js'), [I('lib/node-export.js'), I('lib/run-state.js'), I('idearium/lib/data-dir.cjs')]],   // §0.60.118 DK1: .procedure files, replayed through an injected tool runner
  ['idearium/ui/js/ui-editor-doc.js', I('idearium/ui/js/ui-editor-doc.js'), []],   // §0.60.122 UE1: the page ↔ editor round trip (pure)
  ['idearium/ui/js/ui-editor.js', I('idearium/ui/js/ui-editor.js'), [I('idearium/ui/js/ui-editor-doc.js')]],   // §0.60.122 UE1: the editor page on vendored GrapesJS (idearium/ui/vendor/grapesjs, BSD-3-Clause)
  ['idearium/ui/js/code-dock.js', I('idearium/ui/js/code-dock.js'), [I('idearium/ui/js/work-surface.js'), I('idearium/ui/js/repo-tasks.js'), I('idearium/ui/js/plan-panel.js')]],   // §0.60.118 DK2: the dock — _wsCard, _rtTree/_rtRow, _ppContext reused (page globals)
];
const CONSUMERS = [
  [I('lib/step-gate.js'),                           I('lib/checks/ck-248-toolchain.js'), 'checkText(): the code.write gate parses every language the table knows with that language\'s own tool; a missing tool is not a pass (0.60.77)'],
  [I('lib/proposal-evidence.js'),                   I('lib/checks/ck-248-toolchain.js'), 'compare(): syntax status per file — checked, or NOT checked and why (0.60.77)'],
  [I('lib/code-edit.js'),                           I('lib/proposal-evidence.js'), '§FR2 0.60.115 promoteTested(): gatherBatch — a staged batch tested together in the repo\'s own tree before promote'],
  [I('idearium/repo/code-api.js'),                  I('lib/code-edit.js'), '§FR2 0.60.115 POST code/promote → promoteTested (409 with the batch on a regression)'],
  [I('idearium/api/index.js'),                      I('lib/repo-inject.js'), '§FR2 0.60.115 setEvidenceRoot(): a change is tested in its own repo\'s folder, not Nexus\'s tree'],
  [I('lib/repo-inject.js'),                         I('lib/proposal-evidence.js'), 'attachEvidence()/evidenceNow(): an agent\'s proposal is compared and its linked tests run on the file as it is and as proposed; apply() refuses a regression (0.60.75 PE3)'],
  [I('lib/repo-inject.js'),                         I('lib/step-gate.js'), '_screen(): the code.write gate and the collapse/shrink guards at propose() and edit(), whoever calls (0.60.74)'],
  [I('idearium/api/index.js'),                      I('lib/proposal-evidence.js'), '_rejectionContext(): a rejected proposal\'s evidence goes to the agent and into the retry note (0.60.75 PE4)'],
  [I('clear-glass/src/ipc/bridge.js'),              I('clear-glass/src/net/service.js'), '/cli/net/*: routes, resolve, bridge, transport start/stop/detect (0.60.60 NP9)'],
  [I('idearium/api/index.js'),                      I('lib/economy/tokens.js'), '_phaseBuild: breakdown() of what the agent is given (request, mapped files, charter, lessons, note) on the building row — the Plan\'s Context card (0.60.107 PS1)'],
  [I('idearium/api/index.js'),                      I('lib/ollama-activity.js'), '_contextOf: MAX, the num_ctx window Nexus gives Ollama — the Context card\'s window (0.60.107 PS1)'],
  [I('clear-glass/src/main/index.js'),              I('clear-glass/src/tls/helper.js'), 'boots TlsHelper on :7703 (in place of the Node proxy), its state → net service setTlsLayer, stopped at shutdown (0.60.109 TLS2)'],
  [I('clear-glass/src/contexts/manager.js'),        I('clear-glass/src/tls/helper.js'), 'setCertificateVerifyProc(verifyProc()): a Firefox persona trusts only the layer CA\'s leaves; registers firefox:true (0.60.109 TLS3)'],
  [I('clear-glass/src/net/service.js'),             I('clear-glass/src/net/policy.js'), 'pacFor(…, { tlsPort }): a persona\'s direct https/wss through the TLS layer, DIRECT after (0.60.109 TLS3)'],
  [I('clear-glass/src/main/index.js'),              I('clear-glass/src/contexts/google-signin.js'), "app 'session-created' → applySession; 'web-contents-created' → attach: every session and page, popups and webviews included (0.60.106 GS1)"],
  [I('clear-glass/src/fingerprint/engine.js'),      I('clear-glass/src/fingerprint/firefox-version.js'), 'ffPool(): current Firefox personas; getOrGenerate refreshes a stale stored UA (0.60.108 GS5)'],
  [I('clear-glass/src/page/semantic-tree.js'),      I('clear-glass/src/contexts/google-signin.js'), 'readAX: isSignin → page tree, no debugger on Google\'s sign-in (0.60.108 GS7)'],
  [I('clear-glass/src/net/policy.js'),              I('clear-glass/src/net/policy.js'), 'pacFor → signinRoute: Google\'s sign-in never via the transport or a collision blackhole (0.60.108 GS6)'],
  [I('clear-glass/src/contexts/manager.js'),        I('clear-glass/src/contexts/session-headers.js'), 'requestHook(fingerprint-profile): composes with the localhost and sign-in hooks instead of replacing them (0.60.106 GS2)'],
  [I('clear-glass/src/contexts/manager.js'),        I('clear-glass/src/net/service.js'), 'register(partition, session) so a rule can route an agent window; a no-op with no rules (0.60.60 NP3)'],
  [I('lib/agent-tools/index.js'),                   I('lib/agent-tools/tools/clear-glass/net.js'), 'clear_glass_net registered (0.60.60 NP9)'],
  [I('clear-glass/src/ipc/bridge.js'),              I('clear-glass/src/macros/live-recording.js'), 'macros:recordStart / recordStatus / recordStop: a recording is a .macro node file from the first second (0.60.57 MR1)'],
  [I('clear-glass/src/ipc/bridge.js'),              I('lib/chat-crawl-settings.js'), 'chats:schema / chats:settings / chats:save: the one table of every capture setting, its limits and its Settings rows (0.60.55 PI5)'],
  [I('lib/repo-agent.js'),                          I('lib/gig-ledger-listener.js'), 'attach() before a run begins: a finished run files a deliverable claim with its changed files as evidence (0.60.53 PF0)'],
  [I('lib/repo-agent.js'),                          I('lib/run-state.js'),  'begin() a run (resume on the same goal; a brick\'s run by its brick key, 0.60.77 GW2) before dispatch, finish() it after; lost-job and door fallbacks carry the brick; header() on a resumed Ollama run (0.60.50 CE1, CE10; 0.60.77 GW2)'],
  [I('idearium/api/index.js'),                      I('lib/run-state.js'),  'runIdFor({ brick }) + load(): each brick\'s run in the contract trace (0.60.77 GW2)'],
  [I('idearium/api/index.js'),                      I('lib/repo-procedures.js'), 'GET/POST /api/repos/:uuid/procedures, /from-run, /:id/replay, DELETE /:id: list/save/fromRun/replay/remove (0.60.118 DK1)'],
  [I('idearium/api/index.js'),                      I('lib/repo-agent.js'), 'POST /api/repos/:uuid/agent/tools/run and every procedure step: runTool() — copilot /api/tools/run with the repo\'s scope (0.60.118 DK1)'],
  [I('idearium/ui/js/code-surface.js'),             I('idearium/ui/js/ui-editor.js'), 'an open .html file → "edit UI" opens /ui-editor.html?repo=&path= (0.60.122 UE1)'],
  [I('idearium/ui/js/plan-panel.js'),               I('idearium/ui/js/code-dock.js'), 'planTabSync() → dockSync(): the Plan\'s tab is the dock rail\'s first (0.60.118 DK2)'],
  [I('idearium/ui/js/plan-panel.js'),               I('idearium/ui/js/code-dock.js'), 'ppFocusPiece/ppFocusRun → dockFocus + dockToggle: a piece narrows Changes/Outputs, a run opens Context (0.60.123 PP3)'],
  [I('idearium/ui/js/code-dock.js'),                I('idearium/ui/js/plan-panel.js'), '_ppContext(steps, { runId }) and openPlanPanel({ focus }): the run picked, and the way back (0.60.123 PP3)'],
  [I('idearium/ui/js/app.js'),                      I('idearium/ui/js/code-dock.js'), 'SSE idearium.repo.task → dockTaskIn (no fetch); refreshOnEvent → dockOnEvent (only open panels reload) (0.60.118 DK2)'],
  [I('idearium/api/index.js'),                      I('idearium/lib/surface-state.cjs'), 'GET / PUT /api/repos/:uuid/surface: get() / set(); a set emits idearium.surface.changed (0.60.79 CE8)'],
  [I('idearium/api/index.js'),                      I('lib/run-state.js'),  'list({ repoUuid })[0]: the repo\'s latest run on the surface (0.60.79 CE8)'],
  [I('idearium/ui/js/code-surface.js'),             I('idearium/lib/surface-state.cjs'), 'csPublish() PUTs the surface as it changes; csFollow() opens what the CLI set (idearium.surface.changed) and where it was left (0.60.79 CE8)'],
  [I('idearium/cli/route-commands.js'),             I('idearium/lib/surface-state.cjs'), 'code surface / code open / code select rows, through the route (0.60.79 CE8; agents reach them through nexus.command)'],
  [I('idearium/api/index.js'),                      I('lib/line-edit.js'),  'POST …/code/edit and …/code/assist: applyText checks every edit against the file now; one proposal (0.60.80 CE7)'],
  [I('idearium/api/index.js'),                      I('lib/repo-agent.js'), 'POST …/code/assist: dispatch the picked range with its action, noContext, no layer (0.60.80 CE7)'],
  [I('idearium/api/index.js'),                      I('lib/repo-history.js'), 'POST …/runs/:id/rewind: restoreFile each file the run changed to the last version before it (0.60.80 CV3)'],
  [I('idearium/api/index.js'),                      I('lib/repo-versions.js'), 'commitNow({ kind: restore }) after a file restore and a run rewind (0.60.80 CV2)'],
  [I('lib/repo-inject.js'),                         I('lib/repo-versions.js'), 'an applied or reverted proposal commits at once, labelled kind / inject / by / run (0.60.80 CV2)'],
  [I('idearium/api/index.js'),                      I('lib/run-state.js'),  'GET …/runs (list), POST …/runs/:id/rewind (load, note rewound) (0.60.80 CV3)'],
  [I('cos/archetype/registry.js'),                  I('cos/archetype/eravos.js'), 'ARCHETYPES_RAW.push(...archetypes()): eravos-canvas, eravos-domain-music, eravos-domain-dataflow, eravos-tool, eravos-sound-tool (0.60.104 CN1/CN2)'],
  [I('lib/file-tree-plan.js'),                      I('cos/archetype/eravos.js'), 'fromCosTemplate vars + the archetype\'s varDefaults (toolVars: his new-tool.mjs rules) (0.60.104 CN2)'],
  [I('idearium/api/index.js'),                      I('lib/phase-faults.js'), '_learnFromRejection(): rejectionModes → tell → diagnosis → learnRejection (fault per mode, with the phase) → the reject retry; GET /api/repos/:uuid/lessons (0.60.105 RL2/RL4)'],
  [I('lib/repo-inject.js'),                         I('lib/proposal-evidence.js'), '_screen(): compare() for an agent\'s proposal — exports lost, or a gutted file (declarations or keys lost) is refused before it reaches James (0.60.105 RL3)'],
  [I('idearium/api/index.js'),                      I('lib/run-watch.js'), 'runForInject(): the run and phase a rejected proposal came from, so its lesson and retry land on that phase (0.60.105 RL2)'],
  [I('idearium/api/index.js'),                      I('lib/canvas-compartments.js'), 'GET/POST /api/canvas, GET /api/canvas/:id, POST /api/canvas/:id/tools; emits idearium.canvas.created / tool.added (0.60.104 CN3)'],
  [I('idearium/cli/route-commands.js'),             I('lib/canvas-compartments.js'), 'canvas list · new · show · add-tool rows, through the routes (0.60.104 CN3; agents through nexus.command)'],
  [I('idearium/api/index.js'),                      I('lib/build-paths.js'), 'repo.code.edit / code.assist classified not-build, beside the Agent tab chat (0.60.83, census CK-255)'],
  [I('copilot/server.js'),                          I('lib/run-state.js'),  'every ok/failed tool call is written to the run by step() (0.60.50 CE1)'],
  [I('copilot/tool-runtime.js'),                    I('lib/run-state.js'),  'header() at the head of follow-up rounds and resumed runs; note(off-task) on a blocked reply (0.60.50 CE2, CE3)'],
  [I('guardian/lib/response-sink.js'),              I('lib/run-state.js'),  'a response node is tagged with its run, step and attempt via forSession() (0.60.50 CE4)'],
  [I('guardian/lib/response-sink.js'),              I('lib/reply-kind.js'), 'kind: tag on every response node (0.60.50 CE4)'],
  [I('clear-glass/src/downloads/artifact-chat-index.js'), I('lib/run-state.js'),  'Library index rows carry run_id / step / attempt (0.60.50 CE4)'],
  [I('clear-glass/src/downloads/artifact-chat-index.js'), I('lib/reply-kind.js'), 'Library index rows carry reply_kind (0.60.50 CE4)'],
];

function mapRunState(driver) { return declareMap(driver, { key: 'run-state', uuidTag: '2026-1015-050', files: FILES, consumers: CONSUMERS }); }

module.exports = { mapRunState, FILES, CONSUMERS };
