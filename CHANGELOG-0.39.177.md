# NEXUS 0.39.177 — MCO-C: the baseline hook, and restore for imported repos

## The hook
`idearium/repo/import-baseline.js`. After a repo's first index, one baseline
snapshot with its files is taken: after an archive import, a project import
(not a deferred one; that repo has no index yet), and a chunk run.

- **Once.** Skipped if the repo already has any snapshot. Concurrent calls for
  one repo share one attempt. Chunking again takes no second baseline.
- **Never fatal, never awaited.** A versionium that is down, a file layer that
  refuses, a NOT_INDEXED repo: a returned `failed` status with the reason and a
  warning, never a failed import.
- **Switchable:** idearium config `snapshots.import_baseline` (default on;
  copilot-writable).
- **`pipeline.snapshot_mode` is now read.** It has been in the config since the
  MCO-F design ("full | delta") with no reader. `full` makes `files.record`
  store full copies and no deltas; unknown modes are refused (400).
- The baseline runs right after the pipeline, so the lazy L6-L8 pass has
  usually not finished. Its test state is recorded as **pending**, which is what
  it was.

The phasemap's MCO-C gate said "each materialized file has triggered one
versionium.file.snapshot". Under the per-snapshot grouping decided in MCO-B
that is one snapshot commit holding a full copy of every materialized file,
not a commit per file.

## Proven over real HTTP with a real .zip
Booted versionium + idearium. Import: exactly one baseline appeared on its own,
with the repo's own `.git` visible to it. **Every zip member is byte-for-byte
equal on disk (readable outside idearium) and in versionium's baseline**: text,
a Japanese file name, a binary. Restore of the imported repo after drift made on
disk (edited text, changed binary, removed file) verified byte-exact for every
file; undo returned the drifted state exactly. Switch off: an import takes no
baseline. Dropped repo: no baseline until its chunk run, then exactly one.

## Found and fixed
1. **An imported repo's binaries were missing from its baseline.** An imported
   project's real files (binaries included) are owned by the source layer and
   are not in `repo.files`. Capture used `repo.files`, so the first baseline of
   a zip silently held 5 of 6 files. Capture now unions `repo.files` with the
   source manifest.
2. **Restore could not fix an imported repo.** `RepoLayer.writeFile` only edits
   the chunk, and `materialize` will not write over a source-owned file, so the
   disk kept the drifted bytes. Restore's disk check caught it and reported
   `verified:false`, as designed, but the restore did not work. Restore now
   writes source-owned files as bytes through new
   `source-files.js` `setSourceFile` / `removeSourceFile` (via
   `RepoLayer.isSourceOwned / writeSourceBytes / deleteSourceFile`), keeping a
   text file's chunk in step. **Binaries in an imported repo are now
   restorable.** A changed binary that is not source-owned still blocks the
   restore whole.
3. **Undo left behind a file that did not exist at the snapshot.** A file the
   snapshot recorded as "not on disk" was protected from deletion like a file
   skipped for size. It is now deleted by a restore if it exists (it did not
   exist then). Files skipped for size or unreadability are still never deleted.
4. `setSourceFile` / `removeSourceFile` refuse a path that `_safeRel` would have
   rewritten (`../x` -> `x`) instead of writing somewhere else silently.

## Verification
Run: test-mcoc-import-baseline 25/25, test-mcob-snapshot-restore 30/30,
test-mcob-file-versioning 33/33, test-mco3-versionium-tab, test-mco3-repo-snapshot,
plus the existing repo/spec-engine/versionium suites and precommit-check. Mutation
checks: removing the source-layer union from capture fails the source-layer
baseline test, and ignoring the source layer in restore fails 4 of the new
source-layer restore tests.
Not run: the full `run-all.js`. Not checked: a real browser.

## Not done
Automatic commit on every repo write; blob garbage collection; restoring a
changed binary that is not source-owned; the UI does not yet say which files
go through the source layer (the plan carries `viaSourceLayer`).
