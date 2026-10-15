'use strict';
/**
 * versionium/lib/releases.js — RN1: tags and releases, in Versionium. component_id: versionium.lib.releases
 * Map: docs/2026-10-15-one-contract-raid-releases-phasemap.spec (RN1)
 *
 * James (2026-10-15): "need more coordination for releases. like i want idearium to have releases and a changelog for
 * each version. it was added to the wrong place. like I want versionium to be working fully for versioning and
 * revisioning" · "use versioning in versionium for versions using the api. should be hooked into the atlas."
 *
 * Before this, a release lived only in Nexus's own lib/version.js and as a GitHub tag the workflow made; Versionium —
 * the system that holds every commit — knew nothing of it, and an Idearium repo had no releases at all. Now:
 *   tag({ repository, name, commitId?, gitCommit?, by })   → an immovable name on a commit. The same name on the same
 *                         commit is idempotent; on a different commit it is refused (a release never moves).
 *   tags({ repository })                                   → its tags, oldest first
 *   release({ repository, version, commitId?, gitCommit?, title, quote, notes, proof, commits, since, systems, changelog, by, at }) → the tag
 *                         'v<version>' plus one release row; idempotent on the same version and commit
 *   releases({ repository })                               → newest first, by semver
 *   get({ repository, version })                           → one, or null
 * A release points at a Versionium commit (an Idearium repo's snapshot), a git commit (Nexus itself, whose history is
 * git), or both. Neither is invented: a release with no commit says so (commitId and gitCommit null, `unpinned: true`).
 */
const { jaaDB } = require('./store.js');

const MODULE_ID = 'versionium.lib.releases';
const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;
const cmp = (a, b) => { const x = SEMVER.exec(a) || [], y = SEMVER.exec(b) || []; for (let i = 1; i <= 3; i++) { const d = Number(x[i] || 0) - Number(y[i] || 0); if (d) return d; } return 0; };
const _err = (code, message) => Object.assign(new Error(message), { code });

function _key(repository, name) { return `${repository}::${name}`; }

function tag({ repository, name, commitId = null, gitCommit = null, by = null, at = null } = {}) {
  if (!repository || !name) throw _err('BAD_REQUEST', 'repository and name are required');
  const key = _key(repository, name);
  const had = jaaDB.get('versionium_tags', { key });
  if (had) {
    const same = (had.commitId || null) === (commitId || null) && (had.gitCommit || null) === (gitCommit || null);
    if (same) return { ...had, already: true };
    // a tag never moves; filling in a ref it lacked (a git sha found later for a release backfilled without one) is not a move
    const fills = (!had.commitId || had.commitId === commitId) && (!had.gitCommit || had.gitCommit === gitCommit);
    if (!fills) throw _err('TAG_EXISTS', `tag ${name} is already on ${had.commitId || had.gitCommit} in ${repository}; a tag never moves`);
    jaaDB.update('versionium_tags', { id: had.id }, { commitId: commitId || had.commitId, gitCommit: gitCommit || had.gitCommit });
    return { ...jaaDB.get('versionium_tags', { key }), filled: true };
  }
  return jaaDB.insert('versionium_tags', { uuid: jaaDB.uid(), key, repository, name, commitId, gitCommit, by, at: at || Date.now(), source: MODULE_ID });
}

function tags({ repository } = {}) {
  return jaaDB.query('versionium_tags', repository ? { repository } : {}, 1e6).sort((a, b) => (a.at || 0) - (b.at || 0));
}

function release({ repository, version, commitId = null, gitCommit = null, quote = null, notes = null, commits = null, systems = null, files = null, by = null, at = null, changelog = null, since = null, title = null, proof = null } = {}) {
  if (!repository) throw _err('BAD_REQUEST', 'repository is required');
  const v = String(version || '').replace(/^v/, '');
  if (!SEMVER.test(v)) throw _err('BAD_REQUEST', `version must be x.y.z, got '${version}'`);
  const t = tag({ repository, name: `v${v}`, commitId, gitCommit, by, at });
  const key = _key(repository, v);
  const row = {
    key, repository, version: v, tag: `v${v}`, commitId: t.commitId || null, gitCommit: t.gitCommit || null,
    unpinned: !t.commitId && !t.gitCommit, title, quote, notes, proof, commits, since, systems, files, changelog, by, at: at || null, recordedAt: Date.now(), source: MODULE_ID,
  };
  const had = jaaDB.get('versionium_releases', { key });
  if (had) {
    // idempotent: what was recorded stays; only what it lacked is filled (nothing rewritten, §0.3)
    const fill = {};
    for (const [k, val] of Object.entries(row)) if (val != null && (had[k] == null || (k === 'unpinned' && had.unpinned))) fill[k] = val;
    if (Object.keys(fill).length) jaaDB.update('versionium_releases', { id: had.id }, fill);
    return { ...jaaDB.get('versionium_releases', { key }), already: true, filled: Object.keys(fill) };
  }
  return jaaDB.insert('versionium_releases', { uuid: jaaDB.uid(), ...row });
}

function releases({ repository, limit = 1000 } = {}) {
  return jaaDB.query('versionium_releases', repository ? { repository } : {}, 1e6).sort((a, b) => cmp(b.version, a.version)).slice(0, limit);
}

function get({ repository, version } = {}) {
  return jaaDB.get('versionium_releases', { key: _key(repository, String(version || '').replace(/^v/, '')) });
}

module.exports = { MODULE_ID, tag, tags, release, releases, get, cmp };
