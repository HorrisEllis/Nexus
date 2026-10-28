# NEXUS 0.39.176 — MCO-B: per-file versioning under repo snapshots, and restore

Spec first: `versionium/spec/versionium.file-versioning.spec`.

## What a snapshot now keeps
The repo's files as raw bytes, attached to the MCO3 snapshot commit: a full
copy the first time, then diffs. Full copies are content-addressed blobs in
the versionium data dir; deltas are `file_delta` rows.

- **A delta is proven before it is stored.** `files.record` applies the diff
  to the previous bytes and compares sha256 with the new bytes. If it does
  not reproduce, or is not smaller, or 20 deltas have stacked, a full copy is
  stored. `text-diff.js` is fuzzed (30,000 random pairs incl. CRLF, unicode,
  empty files, EOL toggling) and the round trip holds, but nothing relies on
  that: the proof is per write.
- **Every read re-verifies every step.** A corrupt blob, a tampered delta or
  a lost base row is an error naming the file (BLOB_CORRUPT, DELTA_FAILED,
  CHAIN_BROKEN), never a plausible wrong file.
- Files over 2 MiB, unreadable files, symlinks, unsafe paths and files not on
  disk are **listed as not kept, with a reason**, and are not part of the tree
  hash. A snapshot never claims to restore what it did not keep.
- Everything that can fail fails **before** the commit (limits, plan, size
  cap). If only the file record fails after the commit, the API says so
  (FILES_RECORD_FAILED, with the commit id) and that snapshot refuses to
  restore.

## Restore
`POST /api/repos/:uuid/snapshots/:commitId/restore`. **Dry run by default**;
it changes anything only with `{"dryRun":false}`.
1. The snapshot's tree hash must match what the file layer holds, else refuse.
2. Plan against the repo now: write / delete / unchanged. A file the snapshot
   did not keep is never deleted as "extra".
3. Any file to be written that is binary or non-UTF-8 **blocks the restore
   whole**, naming it (the repo layer stores text).
4. A pre-restore snapshot is taken first (with its own file layer). If that
   fails, the restore does not start. So a restore can be undone.
5. Writes and deletes go through `RepoLayer`, batched (`opts.defer`) and
   refreshed once.
6. The disk is re-read and every target file's sha256 checked. The result
   reports that, with the mismatching files and the pre-restore id. It never
   reports success it did not verify.
Not atomic: a failure part-way leaves a partly restored repo, and says so.

The Versionium tab: preview restore, then a confirm, then the verified result
and an undo button that previews restoring the pre-restore snapshot.

## Proven over real HTTP (booted versionium + idearium, real RepoLayer)
Ingest, chunk, snapshot, edit/add/delete through the repo API, snapshot
again (edited file stored as a delta: 2403 bytes raw, 514 stored), dry run
(right plan, nothing changed), restore (verified), every file byte-for-byte
equal to its snapshot-time bytes on disk, then **undo** (drifted bytes back
exactly). Also: versionium's own tree hash equals idearium's; a traversal
path is 400 BAD_PATH; an unknown snapshot is 404.

## Bugs found on the way
1. **`spec-engine` `addChunk` counted soft-deleted chunks as existing
   sections.** `removeChunk` is a soft delete and `_resolveChunk` ignores
   removed chunks, so `writeFile` on a deleted path tried `addChunk` and was
   told the section "already exists": a file could never be re-created at a
   path it had been deleted from (through the repo API or the editor). The
   first end-to-end undo failed on exactly this. Fixed (removed chunks no
   longer block a new one; `writeFile` picks the live chunk).
2. The first e2e run also assumed snapshot bytes equal the strings ingested;
   they do not always (see below). Snapshots record what is on disk.

## Also
- `schema.file_delta` extended (optional `repository`, `base_sha256`,
  `result_sha256`, `result_bytes`); status OPEN -> REAL now a real writer and
  reader exist. New `schema.file_snapshot`. `test-mco-a-file-delta-schema`
  accepts REAL.
- `RepoLayer.writeFile/deleteFile` take `opts.defer`; new `refresh()`.
  Default behaviour unchanged.
- Registered in `run-all.js`: `test-mcob-file-versioning`,
  `test-mcob-snapshot-restore`.

## Verification
Run: test-mcob-file-versioning 33/33, test-mcob-snapshot-restore 24/24,
test-mco3-versionium-tab 32/32, test-mco3-repo-snapshot, test-mco-a-file-delta-schema,
versionium sovereign/split-brain suites, precommit-check. Two mutation checks
confirmed the restore tests fail when the disk verification or the
"never delete what the snapshot skipped" rule is removed (the second first
exposed a missing test case, now added).
Not run: the full `run-all.js`. Not checked: a real browser render.

## Not done
Automatic commit on every repo write; restoring binary or non-UTF-8 files
(refused whole, named); blob garbage collection; MCO-C's hook (one snapshot
per materialized file); incremental multi-request record (a snapshot whose
changed content exceeds 32 MiB is refused before it commits).

## Observed, not investigated
An imported file's bytes on disk did not equal the string ingested through
`POST /api/repos` in the e2e run (CRLF present, something else differed).
Snapshots record the disk, so this does not affect them, but the repo layer's
byte fidelity on ingest may be worth a look.
