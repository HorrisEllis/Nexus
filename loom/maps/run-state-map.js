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
  ['lib/gig-ledger-listener.js', I('lib/gig-ledger-listener.js'), [I('lib/gig-ledger.js'), I('lib/run-state.js'), I('nexus/nexus-bus.js')]],
];
const CONSUMERS = [
  [I('lib/repo-agent.js'),                          I('lib/gig-ledger-listener.js'), 'attach() before a run begins: a finished run files a deliverable claim with its changed files as evidence (0.60.53 PF0)'],
  [I('lib/repo-agent.js'),                          I('lib/run-state.js'),  'begin() a run (resume on the same goal) before dispatch, finish() it after; lost-job fallback notes it (0.60.50 CE1, CE10)'],
  [I('copilot/server.js'),                          I('lib/run-state.js'),  'every ok/failed tool call is written to the run by step() (0.60.50 CE1)'],
  [I('copilot/tool-runtime.js'),                    I('lib/run-state.js'),  'header() at the head of follow-up rounds and resumed runs; note(off-task) on a blocked reply (0.60.50 CE2, CE3)'],
  [I('guardian/lib/response-sink.js'),              I('lib/run-state.js'),  'a response node is tagged with its run, step and attempt via forSession() (0.60.50 CE4)'],
  [I('guardian/lib/response-sink.js'),              I('lib/reply-kind.js'), 'kind: tag on every response node (0.60.50 CE4)'],
  [I('clear-glass/src/downloads/artifact-chat-index.js'), I('lib/run-state.js'),  'Library index rows carry run_id / step / attempt (0.60.50 CE4)'],
  [I('clear-glass/src/downloads/artifact-chat-index.js'), I('lib/reply-kind.js'), 'Library index rows carry reply_kind (0.60.50 CE4)'],
];

function mapRunState(driver) { return declareMap(driver, { key: 'run-state', uuidTag: '2026-1015-050', files: FILES, consumers: CONSUMERS }); }

module.exports = { mapRunState, FILES, CONSUMERS };
