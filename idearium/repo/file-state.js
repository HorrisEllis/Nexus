/**
 * idearium/repo/file-state.js — what state each of a repo's files is in. §0.39.280 BS2.
 * UUID: nexus-idearium-repo-file-state-v1-0000-2026-0929-jamesbrooks-001
 * Map: docs/2026-09-29-build-surface-phasemap.spec (BS2).
 *
 * James: "in the files page, we have a greyed out files, for pending files, that are uncommited."
 *
 * fileStates({ disk, version, injects }) — a projection (§10.2), owns nothing:
 *   disk     [{ path, sha256 }]            the files on disk now
 *   version  { commitId, entries:[{path, sha256}] } | null   the repo's last Versionium version (its file layer)
 *   injects  lib/repo-inject.js nodes       (only proposed and staged count)
 * → { states: { [path]: { state, pending?, staged? } }, counts, version: commitId|null }
 *   committed  on disk, byte-identical to the last version
 *   modified   on disk, differs from the last version
 *   new        on disk, in no version (or there is no version yet: then every file is 'new' — said, not hidden)
 *   deleted    in the last version, gone from disk
 *   pending    exists only as a proposal (a proposed inject that creates it) — the greyed file
 * A file ALSO carries pending: [inject ids] when a proposal would change it, and staged: [ids] when a staged batch
 * would. Pure; the caller reads the inputs.
 */

const LIVE = new Set(['proposed', 'staged']);

export function fileStates({ disk = [], version = null, injects = [] } = {}) {
  const states = {};
  const was = new Map(((version && version.entries) || []).map(e => [e.path, e.sha256]));
  for (const f of disk) {
    if (!f || !f.path) continue;
    const before = was.get(f.path);
    const state = !version ? 'new' : before === undefined ? 'new' : before === f.sha256 ? 'committed' : 'modified';
    states[f.path] = { state };
  }
  if (version) for (const [p] of was) if (!states[p]) states[p] = { state: 'deleted' };
  for (const n of injects) {
    if (!n || !LIVE.has(n.status) || !n.path) continue;
    const key = n.status === 'staged' ? 'staged' : 'pending';
    if (!states[n.path]) {
      if (n.op === 'delete') continue;   // proposing to delete a file that is not there changes nothing
      states[n.path] = { state: 'pending' };
    }
    const s = states[n.path];
    (s[key] = s[key] || []).push(n.uuid);
    if (n.op === 'delete') s.deleteProposed = true;
  }
  const counts = {};
  for (const s of Object.values(states)) counts[s.state] = (counts[s.state] || 0) + 1;
  counts.withProposals = Object.values(states).filter(s => s.pending).length;
  counts.withStaged = Object.values(states).filter(s => s.staged).length;
  return { states, counts, version: version ? version.commitId : null };
}
