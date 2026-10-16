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
  ['lib/chat-crawl-settings.js', I('lib/chat-crawl-settings.js'), []],   // §0.60.55 PI5
  ['lib/chat-crawl-plan.js', I('lib/chat-crawl-plan.js'), [I('lib/chat-crawl-settings.js')]],
  ['clear-glass/src/macros/recorder-script.js', I('clear-glass/src/macros/recorder-script.js'), []],   // §0.60.57 MR1
  ['clear-glass/src/macros/live-recording.js', I('clear-glass/src/macros/live-recording.js'), [I('clear-glass/src/macros/recorder-script.js'), I('clear-glass/src/macros/recording.js'), I('clear-glass/src/automation/nodes.js')]],
  ['clear-glass/src/net/policy.js', I('clear-glass/src/net/policy.js'), []],   // §0.60.60 NP2
  ['clear-glass/src/net/transport-host.js', I('clear-glass/src/net/transport-host.js'), []],   // §0.60.60 NP1
  ['clear-glass/src/net/service.js', I('clear-glass/src/net/service.js'), [I('clear-glass/src/net/policy.js'), I('clear-glass/src/net/transport-host.js')]],
  ['lib/agent-tools/tools/clear-glass/net.js', I('lib/agent-tools/tools/clear-glass/net.js'), []],   // §0.60.60 NP9: read-only agent view
  ['idearium/lib/surface-state.cjs', I('idearium/lib/surface-state.cjs'), [I('idearium/lib/data-dir.cjs')]],   // §0.60.79 CE8: the Code tab's surface, one for the tab, the CLI and agents
  ['lib/gig-ledger-listener.js', I('lib/gig-ledger-listener.js'), [I('lib/gig-ledger.js'), I('lib/run-state.js'), I('nexus/nexus-bus.js')]],
];
const CONSUMERS = [
  [I('clear-glass/src/ipc/bridge.js'),              I('clear-glass/src/net/service.js'), '/cli/net/*: routes, resolve, bridge, transport start/stop/detect (0.60.60 NP9)'],
  [I('clear-glass/src/contexts/manager.js'),        I('clear-glass/src/net/service.js'), 'register(partition, session) so a rule can route an agent window; a no-op with no rules (0.60.60 NP3)'],
  [I('lib/agent-tools/index.js'),                   I('lib/agent-tools/tools/clear-glass/net.js'), 'clear_glass_net registered (0.60.60 NP9)'],
  [I('clear-glass/src/ipc/bridge.js'),              I('clear-glass/src/macros/live-recording.js'), 'macros:recordStart / recordStatus / recordStop: a recording is a .macro node file from the first second (0.60.57 MR1)'],
  [I('clear-glass/src/ipc/bridge.js'),              I('lib/chat-crawl-settings.js'), 'chats:schema / chats:settings / chats:save: the one table of every capture setting, its limits and its Settings rows (0.60.55 PI5)'],
  [I('lib/repo-agent.js'),                          I('lib/gig-ledger-listener.js'), 'attach() before a run begins: a finished run files a deliverable claim with its changed files as evidence (0.60.53 PF0)'],
  [I('lib/repo-agent.js'),                          I('lib/run-state.js'),  'begin() a run (resume on the same goal; a brick\'s run by its brick key, 0.60.77 GW2) before dispatch, finish() it after; lost-job and door fallbacks carry the brick; header() on a resumed Ollama run (0.60.50 CE1, CE10; 0.60.77 GW2)'],
  [I('idearium/api/index.js'),                      I('lib/run-state.js'),  'runIdFor({ brick }) + load(): each brick\'s run in the contract trace (0.60.77 GW2)'],
  [I('idearium/api/index.js'),                      I('idearium/lib/surface-state.cjs'), 'GET / PUT /api/repos/:uuid/surface: get() / set(); a set emits idearium.surface.changed (0.60.79 CE8)'],
  [I('idearium/api/index.js'),                      I('lib/run-state.js'),  'list({ repoUuid })[0]: the repo\'s latest run on the surface (0.60.79 CE8)'],
  [I('idearium/ui/js/code-surface.js'),             I('idearium/lib/surface-state.cjs'), 'csPublish() PUTs the surface as it changes; csFollow() opens what the CLI set (idearium.surface.changed) and where it was left (0.60.79 CE8)'],
  [I('idearium/cli/route-commands.js'),             I('idearium/lib/surface-state.cjs'), 'code surface / code open / code select rows, through the route (0.60.79 CE8; agents reach them through nexus.command)'],
  [I('copilot/server.js'),                          I('lib/run-state.js'),  'every ok/failed tool call is written to the run by step() (0.60.50 CE1)'],
  [I('copilot/tool-runtime.js'),                    I('lib/run-state.js'),  'header() at the head of follow-up rounds and resumed runs; note(off-task) on a blocked reply (0.60.50 CE2, CE3)'],
  [I('guardian/lib/response-sink.js'),              I('lib/run-state.js'),  'a response node is tagged with its run, step and attempt via forSession() (0.60.50 CE4)'],
  [I('guardian/lib/response-sink.js'),              I('lib/reply-kind.js'), 'kind: tag on every response node (0.60.50 CE4)'],
  [I('clear-glass/src/downloads/artifact-chat-index.js'), I('lib/run-state.js'),  'Library index rows carry run_id / step / attempt (0.60.50 CE4)'],
  [I('clear-glass/src/downloads/artifact-chat-index.js'), I('lib/reply-kind.js'), 'Library index rows carry reply_kind (0.60.50 CE4)'],
];

function mapRunState(driver) { return declareMap(driver, { key: 'run-state', uuidTag: '2026-1015-050', files: FILES, consumers: CONSUMERS }); }

module.exports = { mapRunState, FILES, CONSUMERS };
