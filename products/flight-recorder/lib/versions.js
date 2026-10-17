'use strict';
/**
 * products/flight-recorder/lib/versions.js — FR4a: a project's versions, through Versionium in-process (no server).
 * Product: flight-recorder   (part of products/flight-recorder; the branch tool carries every file tagged so)
 *
 * James, 2026-10-17: "Okay. Keep going." The same two calls Idearium's repo snapshots make over HTTP, made directly:
 * versionium/lib/engine.js commit() (system 'idearium.repo', state.repository = the project) then
 * versionium/lib/files.js record() with the tree and only the files versionium lacks (stored as deltas). The store is
 * VERSIONIUM_DATA_DIR, which lib/project.js points into <project>/.flight-recorder/versions before anything loads.
 *
 * commit({ dir, repo, message, causedBy, provenance }) → { ok, commitId, changed }     list(repo) → commits, newest first
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function commit({ dir, repo, message = 'change', causedBy = null, provenance = null } = {}) {
  const E = require('../../../versionium/lib/engine.js'), F = require('../../../versionium/lib/files.js');
  const P = require('./project.js');
  const tree = [], bytes = new Map();
  for (const f of P.files(dir)) { const b = fs.readFileSync(path.join(dir, f)); tree.push({ path: f, sha256: sha(b), bytes: b.length }); bytes.set(f, b); }
  const plan = F.plan({ repository: repo.uuid, tree });
  const kept = tree.filter(e => !plan.tooLarge.includes(e.path));
  const c = E.commit({ message, branch: `repo-${repo.uuid}`, causedBy, system: F.REPO_SYSTEM,
    state: { kind: 'repo-snapshot', repository: repo.uuid, name: repo.name, provenance: provenance || null, files: kept.length } });
  const r = F.record({ repository: repo.uuid, commitId: c.commitId, tree: kept, contents: plan.need.map(p => ({ path: p, content_b64: bytes.get(p).toString('base64') })) });
  return { ok: true, commitId: c.commitId, changed: { files: plan.need.length, deleted: plan.deleted.length, unchanged: plan.unchanged, tooLarge: plan.tooLarge }, recorded: r };
}

function list(repo, { limit = 50 } = {}) {
  const { jaaDB } = require('../../../versionium/lib/store.js');
  return (jaaDB.query('versionium_commits', (r) => r.branch === `repo-${repo.uuid}`, 100000) || [])
    .sort((a, b) => (b.wall || 0) - (a.wall || 0)).slice(0, limit)
    .map(r => ({ commitId: r.commitId, at: r.wall, message: r.message, files: r.state && r.state.files, by: r.state && r.state.provenance ? (r.state.provenance.by || []) : [] }));
}

module.exports = { commit, list };
