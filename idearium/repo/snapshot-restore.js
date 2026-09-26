/**
 * idearium/repo/snapshot-restore.js — restore a repo to a snapshot's files (MCO-B).
 * UUID: nexus-idearium-repo-snapshot-restore-v1-0000-2026-0920-jamesbrooks-001
 * Spec: versionium/spec/versionium.file-versioning.spec (decisions.restore).
 *
 * What restore does, in order, and where it stops:
 *   1. the snapshot must carry a file layer, and versionium's tree for it must
 *      hash to the treeHash the snapshot recorded (else: refuse, nothing touched)
 *   2. build a plan against the repo as it is now: write / delete / unchanged
 *   3. every file to be written is fetched (each verified by versionium) and
 *      must be text the repo layer can store exactly; a binary or non-UTF-8 file
 *      that would have to change BLOCKS the restore whole, naming it
 *   4. dryRun stops here and changes nothing
 *   5. a PRE-RESTORE snapshot is taken first; if that fails the restore does
 *      not start, so a restore is always undoable
 *   6. writes and deletes go through RepoLayer (the manifest stays the source
 *      of truth; disk is its projection), materialized and reindexed ONCE
 *   7. the repo is re-read from disk and every target file's sha256 is checked.
 *      The result reports that check. A restore that did not reproduce the
 *      snapshot says so, with the files that differ.
 *
 * Not atomic: if step 6 fails part-way the repo is partly restored. The result
 * says which files failed and names the pre-restore snapshot to go back to.
 *
 * Deletion is conservative. A file present now and absent from the snapshot is
 * deleted only if the snapshot did not skip it (a file skipped for size or
 * unreadability might have existed then; deleting it could lose data no
 * snapshot holds). A file the snapshot recorded as 'not on disk' did not exist
 * then, so it is not protected. Files too large to track now are left alone and reported.
 */

import { collectFiles, treeHashOf } from './snapshot-files.js';

const isText = (buf) => !buf.includes(0) && Buffer.from(buf.toString('utf8'), 'utf8').equals(buf);

export async function restoreRepoSnapshot({ repo, repoDir, commitId, record, layer, repoLayer, takeSnapshot, dryRun = true } = {}) {
  if (!repo || !repoDir || !commitId || !layer || !repoLayer) return { ok: false, code: 'BAD_INPUT', error: 'repo, repoDir, commitId, layer and repoLayer are required' };
  if (!record || !record.files || !record.files.treeHash) {
    return { ok: false, code: 'NO_FILE_LAYER', error: `snapshot ${commitId} has no file layer (it was taken without one), so it cannot restore files` };
  }

  let target;
  try { target = await layer.tree(commitId); }
  catch (e) { return { ok: false, code: 'FILE_LAYER_UNAVAILABLE', error: `could not read the file layer for ${commitId}: ${e.message}` }; }
  if (target.treeHash !== record.files.treeHash) {
    return { ok: false, code: 'FILE_LAYER_MISMATCH', error: `the file layer for ${commitId} does not match what the snapshot recorded (${String(target.treeHash).slice(0, 12)}… vs ${String(record.files.treeHash).slice(0, 12)}…). Its files were not recorded, or were damaged; nothing was changed.` };
  }

  let limits;
  try { limits = await layer.limits(); } catch (e) { return { ok: false, code: 'FILE_LAYER_UNAVAILABLE', error: e.message }; }
  const now = collectFiles(repo, repoDir, limits.maxFileBytes);
  const cur = new Map(now.entries.map(e => [e.path, e]));
  const tgt = new Map(target.files.map(e => [e.path, e]));
  // Protected from deletion: files the snapshot could not keep for a reason that
  // says nothing about whether they existed (too large, unreadable, a symlink).
  // A file recorded as 'not on disk' is different: the snapshot knows it did not
  // exist, so one that exists now is extra and a restore removes it. (Found by
  // the end-to-end undo: a source-listed file removed before the pre-restore
  // snapshot was kept forever by the undo.)
  const skippedThen = new Set((record.files.skipped || []).filter(x => !/^not on disk/.test(x.reason)).map(x => x.path));

  const write = target.files.filter(e => !cur.has(e.path) || cur.get(e.path).sha256 !== e.sha256).map(e => e.path);
  const del = now.entries.filter(e => !tgt.has(e.path) && !skippedThen.has(e.path)).map(e => e.path);
  const protectedExtra = now.entries.filter(e => !tgt.has(e.path) && skippedThen.has(e.path)).map(e => e.path);
  const unchanged = target.files.length - write.length;

  const owned = (p) => typeof repoLayer.isSourceOwned === 'function' && repoLayer.isSourceOwned(repo.uuid, p);
  const deleteOwned = del.filter(owned);

  // fetch (and pre-check) everything that will be written
  const bytes = new Map(); const raw = new Map(); const viaSource = new Set(); const blocked = [];
  for (const p of write) {
    let c;
    try { c = await layer.content(commitId, p); }
    catch (e) { return { ok: false, code: 'FILE_LAYER_UNAVAILABLE', error: `could not read ${p} from the file layer: ${e.message}` }; }
    if (c.sha256 !== tgt.get(p).sha256) return { ok: false, code: 'FILE_LAYER_MISMATCH', error: `${p}: the file layer returned bytes that do not match the snapshot's hash; nothing was changed` };
    raw.set(p, c.bytes);
    // A file the repo's SOURCE layer owns (an imported project's real files) is
    // restored as bytes, so binaries are restorable there. Anything else goes
    // through the chunk store, which holds text only.
    if (owned(p)) viaSource.add(p);
    else if (!isText(c.bytes)) blocked.push({ path: p, reason: 'binary or non-UTF-8 and not source-owned — the chunk store holds text only, so this file cannot be restored through the repo layer' });
    else bytes.set(p, c.bytes.toString('utf8'));
  }

  const plan = {
    write, delete: del, unchanged, blocked, viaSourceLayer: [...viaSource, ...deleteOwned],
    leftAlone: { tooLargeNow: now.skipped.filter(x => /per-file limit/.test(x.reason)).map(x => x.path), notInSnapshotButProtected: protectedExtra },
  };
  if (dryRun) return { ok: true, dryRun: true, restorable: blocked.length === 0, plan, snapshot: { commitId, treeHash: target.treeHash, fileCount: target.files.length } };
  if (blocked.length) return { ok: false, code: 'BLOCKED', error: `${blocked.length} file(s) would have to change but cannot be restored through the repo layer (${blocked.slice(0, 3).map(b => b.path).join(', ')}); nothing was changed`, plan };
  if (!write.length && !del.length) return { ok: true, dryRun: false, changed: false, verified: true, written: 0, deleted: 0, failures: [], mismatches: [], plan, note: 'the repo already matches this snapshot' };

  // the restore must itself be undoable
  let pre;
  try { pre = await takeSnapshot(); }
  catch (e) { pre = { ok: false, error: e.message }; }
  if (!pre || pre.ok === false) return { ok: false, code: 'PRE_SNAPSHOT_FAILED', error: `the pre-restore snapshot failed, so the restore did not start: ${pre?.error || 'unknown'}`, plan };
  const preRestoreCommitId = pre.commit?.commitId || pre.commitId || null;

  const failures = [];
  for (const p of write) {
    if (viaSource.has(p)) {
      // Text: keep the chunk in step (writeFile only edits the chunk here, since
      // the source file wins at materialize). Then the real bytes, which are the
      // truth on disk. A chunk problem on a text file is not a restore failure by
      // itself; the disk check below is what decides that.
      if (isText(raw.get(p))) repoLayer.writeFile(repo.uuid, p, raw.get(p).toString('utf8'), { defer: true });
      const r = repoLayer.writeSourceBytes(repo.uuid, p, raw.get(p));
      if (r && r.error) failures.push({ path: p, op: 'write', error: r.error });
      continue;
    }
    const r = repoLayer.writeFile(repo.uuid, p, bytes.get(p), { defer: true });
    if (r && r.error) failures.push({ path: p, op: 'write', error: r.error });
  }
  for (const p of del) {
    if (deleteOwned.includes(p)) {
      const r = repoLayer.deleteSourceFile(repo.uuid, p);
      if (r && r.error) failures.push({ path: p, op: 'delete', error: r.error });
      repoLayer.deleteFile(repo.uuid, p, { defer: true }); // its chunk, if it has one; a binary has none, so no error is a failure here
      continue;
    }
    const r = repoLayer.deleteFile(repo.uuid, p, { defer: true });
    if (r && r.error) failures.push({ path: p, op: 'delete', error: r.error });
  }
  repoLayer.refresh(repo.uuid);

  // verify against the disk, not against our own bookkeeping
  const fresh = repoLayer.get(repo.uuid) || repo;
  const after = collectFiles(fresh, repoDir, limits.maxFileBytes);
  const now2 = new Map(after.entries.map(e => [e.path, e]));
  const mismatches = [];
  for (const [p, e] of tgt) {
    const got = now2.get(p);
    if (!got) mismatches.push({ path: p, expected: e.sha256, got: null, why: 'missing after restore' });
    else if (got.sha256 !== e.sha256) mismatches.push({ path: p, expected: e.sha256, got: got.sha256, why: 'differs after restore' });
  }
  for (const p of del) if (now2.has(p)) mismatches.push({ path: p, expected: null, got: now2.get(p).sha256, why: 'still present after delete' });
  const extra = after.entries.filter(e => !tgt.has(e.path)).map(e => e.path);
  const verified = mismatches.length === 0;
  return {
    ok: failures.length === 0 && verified,
    dryRun: false, changed: true, verified,
    written: write.length - failures.filter(f => f.op === 'write').length,
    deleted: del.length - failures.filter(f => f.op === 'delete').length,
    failures, mismatches, extra, preRestoreCommitId, plan,
    treeMatches: verified && treeHashOf(after.entries.filter(e => tgt.has(e.path))) === target.treeHash,
    ...(verified ? {} : { note: `the repo does not match the snapshot after the restore (${mismatches.length} file(s)); go back with ${preRestoreCommitId || 'the pre-restore snapshot'}` }),
  };
}
