'use strict';
/**
 * loom/maps/releases-map.js — §0.60.41 RN1: the edges the source scanner cannot read in releases-in-Versionium
 * (docs/2026-10-15-one-contract-raid-releases-phasemap.spec RN1). versionium/lib/releases.js is reached by a literal
 * require() from versionium/routes/versionium.js and lib/nexus-releases.js requires lib/release-version.js literally —
 * both scanned. idearium/api reaches lib/repo-releases.js and lib/nexus-releases.js through createRequire's _require, and
 * both reach Versionium's releases over HTTP (/api/versionium/releases, through Idearium's _vcall).
 * comp_id: nexus.loom.maps.releases
 */
const { idFor } = require('../scanners/source-map');
const { declareMap } = require('./declare-map');
const I = (rel) => idFor(rel);

// hand-mapped: nothing requires these literally (idearium/api uses _require; versionium/routes is itself hand-mapped in
// session-2026-08-14-map), so the scanner would leave them without the hooks their wires need
const FILES = [
  ['versionium/lib/releases.js', I('versionium/lib/releases.js'), ['nexus.versionium.lib.store']],
  ['lib/nexus-releases.js',      I('lib/nexus-releases.js'),      [I('lib/release-version.js'), 'nexus.versionium.routes.versionium']],   // the second over HTTP
  ['lib/repo-releases.js',       I('lib/repo-releases.js'),       ['nexus.versionium.routes.versionium', I('lib/repo-versions.js')]],      // HTTP; flush handed in
];
const CONSUMERS = [
  ['nexus.versionium.routes.versionium', I('versionium/lib/releases.js'), 'GET/POST /api/versionium/tags, /api/versionium/releases, GET /releases/:version (0.60.41 RN1)'],
  ['nexus.idearium.api', I('lib/repo-releases.js'),  'idearium/api/index.js repo.releases.list / repo.releases.create — GET/POST /api/repos/:uuid/releases (0.60.41 RN1)'],
  ['nexus.idearium.api', I('lib/nexus-releases.js'), 'idearium/api/index.js releases.sync (POST /api/releases/sync) and the boot sync — Nexus\'s releases into Versionium (0.60.41 RN1)'],
  ['nexus.idearium.api', I('lib/release-version.js'), 'idearium/api/index.js system.version and releases.list — the running release (0.60.34 VR1, 0.60.41 RN1)'],
];

function mapReleases(driver) { return declareMap(driver, { key: 'releases', uuidTag: '2026-1015-041', files: FILES, consumers: CONSUMERS }); }

module.exports = { mapReleases, FILES, CONSUMERS };
