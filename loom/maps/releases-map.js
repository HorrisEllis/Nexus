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
  // 0.60.277 VS1–VS3 — James, 2026-10-29: "a". The release logic is Versionium's (§5.15): moved from lib/ (git mv), served by its own routes
  ['versionium/lib/nexus-releases.js', I('versionium/lib/nexus-releases.js'), [I('lib/release-version.js'), I('versionium/lib/changelogs.js'), 'nexus.versionium.routes.versionium']],   // the last over HTTP (its own port)
  ['versionium/lib/changelogs.js', I('versionium/lib/changelogs.js'), []],
  // 0.60.278 VE1 — James, 2026-10-29: "full changes, and versions have to be pushed to versionium?" (§17.12): the one recorder
  ['lib/versionium-record.js', I('lib/versionium-record.js'), [I('lib/nexus-client.js'), I('lib/version.js'), 'nexus.versionium.routes.versionium']],   // the last over HTTP (POST /api/versionium/commit)
  ['versionium/routes/nexus-releases.js', I('versionium/routes/nexus-releases.js'), [I('versionium/lib/nexus-releases.js'), I('versionium/lib/changelogs.js'), I('versionium/lib/release-notes.js'), I('lib/release-version.js')]],
  ['lib/repo-releases.js',       I('lib/repo-releases.js'),       ['nexus.versionium.routes.versionium', I('lib/repo-versions.js')]],      // HTTP; flush handed in
  // §0.60.72 RN2 — every commit under the release that shipped it, read from git (child_process); nexus-releases.sync
  // attaches them (a lazy require inside sync, so the scanner does not see it)
  ['versionium/lib/release-notes.js', I('versionium/lib/release-notes.js'), [I('versionium/lib/nexus-releases.js')]],
  // §0.60.72 RN3 — the Versionium tab's Releases (a browser script: Idearium's /api/releases, /api/repos/:uuid/releases)
  ['idearium/ui/js/repo-releases.js', I('idearium/ui/js/repo-releases.js'), ['nexus.idearium.api']],
];
const CONSUMERS = [
  ['nexus.versionium.routes.versionium', I('versionium/lib/releases.js'), 'GET/POST /api/versionium/tags, /api/versionium/releases, GET /releases/:version (0.60.41 RN1)'],
  ['nexus.idearium.api', I('lib/repo-releases.js'),  'idearium/api/index.js repo.releases.list / repo.releases.create — GET/POST /api/repos/:uuid/releases (0.60.41 RN1)'],
  // 0.60.277 VS3 — Idearium asks Versionium's routes (HTTP), never its code
  ['nexus.idearium.api', I('versionium/routes/nexus-releases.js'), 'idearium/api/index.js releases.sync, the boot sync, releases.changes, releases.changelog and system.version → /api/versionium/nexus/* over HTTP (0.60.277 VS3)'],
  // 0.60.278 VE2/VE3/VE5 — the places that make a change or a version and now record it (lazy requires the scanner does not see)
  [I('lib/nexus-self/apply.js'), I('lib/versionium-record.js'), 'apply / failed apply / rollback → record() with each path before → after (VE2)'],
  [I('lib/nexus-update.js'), I('lib/versionium-record.js'), '_record(row) → record(): every update, rollback, adoption, with the files git says changed (VE3)'],
  ['nexus.idearium.api', I('lib/versionium-record.js'), 'idearium/api/index.js versionium.pending — GET /api/versionium/pending (VE5)'],
  [I('versionium/lib/nexus-releases.js'), I('versionium/lib/release-notes.js'), 'sync(): attach(releases) — each release\'s commits and files into Versionium (0.60.72 RN2)'],
  [I('idearium/ui/js/repo-releases.js'), 'nexus.idearium.api', 'renderReleases → GET /api/releases, /api/repos/:uuid/releases, /api/releases/changes; POST /api/releases/sync (0.60.72 RN3)'],
  ['nexus.idearium.api', I('lib/release-version.js'), 'idearium/api/index.js system.version and releases.list — the running release (0.60.34 VR1, 0.60.41 RN1)'],
];

function mapReleases(driver) { return declareMap(driver, { key: 'releases', uuidTag: '2026-1015-041', files: FILES, consumers: CONSUMERS }); }

module.exports = { mapReleases, FILES, CONSUMERS };
