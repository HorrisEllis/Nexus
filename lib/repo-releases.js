'use strict';
/**
 * lib/repo-releases.js — RN1: an Idearium repo's releases, kept in Versionium. component_id: nexus.lib.repo-releases
 * Map: docs/2026-10-15-one-contract-raid-releases-phasemap.spec (RN1)
 *
 * James (2026-10-15): "like i want idearium to have releases and a changelog for each version. it was added to the wrong
 * place. like I want versionium to be working fully for versioning and revisioning, with the worksurface, file changes
 * and diff."
 *
 * A repo's every change is already a Versionium commit on branch repo-<uuid> (lib/repo-versions.js, VR1). A release is a
 * name on one of those commits, never a copy:
 *   cut(v, repoUuid, { version?, quote?, notes?, by?, flush? }) → commits what is pending (flush), then tags the branch
 *       head 'v<version>' and records the release: the commits since the previous release (their messages, who, when)
 *       and the notes (given, else written from those commits). version defaults to the previous release's patch + 1,
 *       or 0.1.0 for the first. Refused, said: no versions yet; nothing changed since the last release; a version not
 *       above the last.
 *   list(v, repoUuid) → its releases, newest first
 * v(method, path, body, timeout) is the Versionium transport (Idearium's _vcall), passed in, so a test hands a fake one.
 */
const MODULE_ID = 'nexus.lib.repo-releases';
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const cmp = (a, b) => { const x = SEMVER.exec(a) || [], y = SEMVER.exec(b) || []; for (let i = 1; i <= 3; i++) { const d = Number(x[i] || 0) - Number(y[i] || 0); if (d) return d; } return 0; };
const qs = (o) => new URLSearchParams(o).toString();
const _err = (status, message, extra = {}) => Object.assign(new Error(message), { status }, extra);
const branchOf = (repoUuid) => `repo-${repoUuid}`;

async function list(v, repoUuid) {
  const r = await v('GET', `/api/versionium/releases?${qs({ repository: repoUuid })}`);
  return r.releases || [];
}

function bump(prev) { const m = SEMVER.exec(prev || ''); return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : '0.1.0'; }

function notesFrom(commits) {
  if (!commits.length) return '';
  return commits.slice().reverse().map(c => `- ${String(c.message || '').split('\n')[0]}${c.who ? ` (${c.who})` : ''}`).join('\n');
}

async function cut(v, repoUuid, { version = null, quote = null, notes = null, by = null, flush = null } = {}) {
  if (flush) { try { await flush(repoUuid); } catch (_) { /* a failed flush keeps its changes pending (VR1); the release is of what is committed */ } }
  const branch = branchOf(repoUuid);
  const b = await v('GET', '/api/versionium/branches');
  const head = ((b.branches || []).find(x => x.branch === branch) || {}).headCommitId || null;
  if (!head) throw _err(409, 'this repo has no versions yet — nothing to release', { code: 'NO_VERSIONS' });
  const prior = await list(v, repoUuid);
  const last = prior[0] || null;
  const want = version ? String(version).replace(/^v/, '') : bump(last && last.version);
  if (!SEMVER.test(want)) throw _err(400, `version must be x.y.z, got '${version}'`, { code: 'BAD_VERSION' });
  if (last && last.version === want && last.commitId === head) return { ...last, already: true };
  if (last && last.commitId === head) throw _err(409, `nothing changed since v${last.version} (it is on ${head})`, { code: 'NOTHING_NEW' });
  if (last && cmp(want, last.version) <= 0) throw _err(409, `v${want} is not above the last release v${last.version}`, { code: 'NOT_ABOVE' });
  // the commits since the previous release: the branch's log, newest first, back to the commit that release named
  const h = await v('GET', `/api/versionium/history?${qs({ branch, n: '1000' })}`);
  // walked by parent from the head (not by time: commits in one millisecond tie), newest first
  const byId = new Map((h.commits || []).map(c => [c.commitId, c]));
  const commits = [];
  for (let c = byId.get(head); c && !(last && c.commitId === last.commitId); c = byId.get(c.parentId)) {
    const st = c.state || {};
    commits.push({ id: c.commitId, message: c.message || '', at: c.wall || null, who: (st.provenance && st.provenance.by && st.provenance.by.join(', ')) || null });
  }
  const r = await v('POST', '/api/versionium/releases', {
    repository: repoUuid, version: want, commitId: head, quote: quote || null, notes: notes || notesFrom(commits), commits,
    since: last ? last.version : null, by: by || MODULE_ID,
  });
  return r.release;
}

module.exports = { MODULE_ID, cut, list, bump, notesFrom };
