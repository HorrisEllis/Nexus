'use strict';
/**
 * loom/maps/compartment-activity-map.js — §0.39.364–0.39.367: the edges the source scanner cannot read in the
 * compartment-control-and-activity work (docs/2026-10-07-compartment-control-and-activity-phasemap.spec). The files
 * themselves (lib/repo-activity.js, lib/resource-monitor.js, ollama/lib/model-inventory.js, lib/repo-inject.js) are
 * reached by literal require()s and scanned; idearium/api reaches them through createRequire's _require, and the Tasks
 * drawer reaches idearium over HTTP. Declared through loom/maps/declare-map.js.
 * comp_id: nexus.loom.maps.compartment-activity
 */
const { idFor } = require('../scanners/source-map');
const { declareMap } = require('./declare-map');
const I = (rel) => idFor(rel);

const FILES = [];   // nothing hand-mapped: every file here is scanned
const CONSUMERS = [
  ['nexus.idearium.api', I('lib/repo-activity.js'),    'idearium/api/index.js _repoActivity() — phase rows, the guardian feed, the Ollama stream, tool calls → tasks; GET /api/repos/:uuid/tasks'],
  ['nexus.idearium.api', I('lib/resource-monitor.js'), 'idearium/api/index.js makeAttempt — fitsModel() before an Ollama rung (0.39.364)'],
  ['nexus.idearium.api', I('lib/activity-log/compartment.js'),    'idearium/api/index.js repo.activity — GET /api/repos/:uuid/activity, onRecord → SSE idearium.repo.activity (0.39.368)'],
  ['nexus.idearium.api', I('lib/repo-inject.js'),      'idearium/api/index.js — every proposal, apply and revert of an agent\'s files (land(), 0.39.367)'],
];

function mapCompartmentActivity(driver) { return declareMap(driver, { key: 'compartment-activity', uuidTag: '2026-1007-367', files: FILES, consumers: CONSUMERS }); }

module.exports = { mapCompartmentActivity, FILES, CONSUMERS };
