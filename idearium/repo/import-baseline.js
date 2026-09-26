/**
 * idearium/repo/import-baseline.js — the MCO-C hook: a repo's first index
 * takes one baseline snapshot, files included.
 * UUID: nexus-idearium-repo-import-baseline-v1-0000-2026-0920-jamesbrooks-001
 * Spec: versionium/spec/versionium.file-versioning.spec (decisions.baseline).
 *
 * The phasemap's MCO-C gate: "each materialized file has triggered one
 * versionium.file.snapshot". Under the per-snapshot grouping decided in
 * MCO-B, that is one snapshot commit whose file layer holds a full copy of
 * every file that was materialized. Not a commit per file.
 *
 * §NEVER FATAL. An import or a chunk run has already succeeded by the time
 * this runs. A versionium that is down, a file layer that refuses, a repo the
 * pipeline faulted on: each is a returned `failed` status with the reason,
 * never a throw and never something the import waits on.
 *
 * §ONCE. If the repo already has any snapshot, nothing is taken ('exists').
 * Concurrent calls for one repo (an import and its chunk run landing together)
 * share one in-flight attempt, so two baselines cannot be taken.
 *
 * §HONEST ABOUT WHEN. The baseline runs right after the pipeline, so the lazy
 * L6-L8 pass has usually not finished: the baseline's test state is recorded
 * as pending, which is what it was. A later snapshot carries the finished one.
 */

const inflight = new Map(); // repo uuid -> Promise

/**
 * ensureBaselineSnapshot({ repo, repoDir, enabled, listSnapshots, takeSnapshot, reason })
 *   listSnapshots() -> array (this repo's snapshots)
 *   takeSnapshot({ message }) -> result of commitRepoSnapshot()
 * -> { status: 'disabled'|'exists'|'taken'|'failed', reason, commitId?, code?, error? }
 */
export function ensureBaselineSnapshot({ repo, repoDir, enabled = true, listSnapshots, takeSnapshot, reason = 'import' } = {}) {
  if (!repo || !repo.uuid || !repoDir || typeof listSnapshots !== 'function' || typeof takeSnapshot !== 'function') {
    return Promise.resolve({ status: 'failed', reason, code: 'BAD_INPUT', error: 'repo, repoDir, listSnapshots and takeSnapshot are required' });
  }
  if (!enabled) return Promise.resolve({ status: 'disabled', reason });
  if (inflight.has(repo.uuid)) return inflight.get(repo.uuid);

  const p = (async () => {
    let existing;
    try { existing = await listSnapshots(); }
    catch (e) { return { status: 'failed', reason, code: 'LIST_FAILED', error: `could not check for existing snapshots: ${e.message}` }; }
    if (Array.isArray(existing) && existing.length) return { status: 'exists', reason, count: existing.length };

    let r;
    try { r = await takeSnapshot({ message: `baseline: ${reason}` }); }
    catch (e) { return { status: 'failed', reason, code: 'TAKE_THREW', error: e.message }; }
    if (!r || r.ok === false) {
      return { status: 'failed', reason, code: r?.code || 'UNKNOWN', error: r?.error || 'snapshot failed', commitId: r?.commit?.commitId || null };
    }
    return { status: 'taken', reason, commitId: r.commit.commitId, files: r.files ? { counts: r.files.counts, treeHash: r.files.treeHash } : null };
  })().finally(() => inflight.delete(repo.uuid));

  inflight.set(repo.uuid, p);
  return p;
}
