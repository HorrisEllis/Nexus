spec:
  meta:
    name:        versionium.file-versioning
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    owner:       versionium
    uuid:        nexus-versionium-file-versioning-v1-0000-2026-0920-001
    author:      james-brooks
    compiled_by: claude
    created:     2026-09-20
    status:      Specified
    implements:  'docs/idearium-repository-overhaul-phasemap.spec MCO-B_versionium_bridge'
    purpose: >
      Versionium can commit and restore a repo snapshot's derived state
      (MCO3). This adds the per-file layer under it: the actual bytes of the
      repo's files, kept as a first full copy then diffs, so a snapshot can
      restore the files it was taken from. Versionium's existing
      commit/history/restore.read/state.read/calendar are reused unchanged.

  build_order:
    law: '§8.5 — spec before build; §3.4 — raw code before interfaces.'
    written_before_code: true
    sequence:
      - 'this spec'
      - 'versionium/lib/text-diff.js — unified diff + strict applier, fuzzed'
      - 'versionium/lib/files.js — plan / record / tree / content, callable from raw node'
      - 'tests/modules/test-mcob-file-versioning.js — real engine, real files, byte-for-byte round trip'
      - 'versionium/routes/files.js + registry components + schemas (only after the library is proven)'
      - 'idearium/repo/snapshot.js + snapshot-restore.js + repo.snapshot.restore route'
      - 'idearium UI: restore preview + confirm on the Versionium tab'

  decisions:
    grouping: >
      The unit of grouping is the MCO3 repo snapshot commit. A snapshot
      commit is followed by one files.record call that attaches file rows to
      it (commit_ref = that commit). There is NO commit per file write. The
      phasemap's chain says "repo write -> file.snapshot/delta -> commit";
      an automatic per-write commit was considered and NOT built (noisy,
      and every write already re-triggers the import pipeline). A config
      knob for it can be added later without changing this layer.
    what_is_captured: >
      Every path in the repo record's file list PLUS the paths the repo's source
      layer owns (an imported project's real files, binaries included; they are
      not in the file list), that exists on disk, read as raw bytes. Not the chunk text. Not pipeline artifacts. Files over
      FILE_MAX_BYTES (default 2 MiB) are listed as skipped with a reason and
      are NOT in the tree, so restoring a snapshot never claims to restore a
      file it did not keep.
    storage: >
      Full copies are content-addressed blobs on disk under the versionium
      data directory (file-blobs/<aa>/<sha256>), raw bytes, so binary is
      exact and identical files dedupe. Rows in file_snapshots (kind full |
      deleted) and file_delta (existing MCO-A schema, extended with optional
      fields) hold the chain. Diffs are stored inline in the row.
    delta_rule: >
      A file is stored as a delta only if both versions are diffable text
      (valid UTF-8, no NUL), fewer than FILE_KEYFRAME_INTERVAL deltas sit
      since the last full copy, the diff is smaller than
      FILE_DELTA_MAX_RATIO of the new file, AND applying the diff to the
      previous bytes reproduces the new bytes' sha256. Otherwise a full
      copy is stored. A diff is never trusted; it is proven at write time.
    chain_walk: >
      State at a commit is reconstructed by walking parentId back from that
      commit and replaying only the rows whose commit_ref is in that walk,
      starting from the last full/deleted row per path. Rows from later
      commits are ignored, so restoring an old snapshot is correct.
    integrity: >
      Every row carries the sha256 it should reproduce (sha256 for full,
      base_sha256 and result_sha256 for delta). Reading verifies each step.
      A corrupted blob, a missing row or a delta that does not apply is an
      error naming the file, never a silently wrong file. The snapshot
      carries a treeHash over sorted "path<TAB>sha256" lines; the file layer
      re-derives it and the two must match.
    transport: >
      idearium sends hashes first (files.plan) and full contents only for the
      paths versionium says it needs (files.record), base64 in JSON so bytes
      survive intact and no multi-byte character can be split across a read
      chunk. record() takes the whole changed set in ONE call (it is not
      incremental), so a snapshot whose changed content exceeds
      FILE_MAX_RECORD_BYTES (default 32 MiB) is refused by idearium BEFORE
      any commit is made, with the limit named.
    restore: >
      Restore is idearium's action, not versionium's. It (1) fetches the
      snapshot's tree, (2) compares with the repo as it is now and builds a
      plan (write / delete / unchanged), (3) takes a pre-restore snapshot so
      the restore is itself undoable, and refuses to proceed if that fails,
      (4) applies the plan through RepoLayer.writeFile/deleteFile so the
      spec-engine manifest stays the source of truth (disk is a projection
      of it), (5) re-reads the repo and checks the resulting tree hash equals
      the snapshot's. It reports the result of that check, not a success it
      did not verify. A dry run returns the plan and changes nothing.
    baseline: >
      MCO-C. A repo's FIRST index takes one baseline snapshot, files included
      (idearium/repo/import-baseline.js), after an archive import, a project
      import (not a deferred one) and a chunk run: one snapshot commit holds a
      full copy of every materialized file, so the phasemap's "each materialized
      file has a snapshot" is met without a commit per file. It is taken once
      (skipped if the repo has any snapshot), never awaited by the import, never
      fatal, off when idearium config snapshots.import_baseline is false, and it
      honours pipeline.snapshot_mode ('full' stores full copies, no deltas). It
      runs right after the pipeline, so its test state is usually pending.
    source_layer: >
      Restore writes a source-owned file as bytes through the source layer
      (source-files.js setSourceFile/removeSourceFile), so binaries in an imported
      repo ARE restorable; a text file's chunk is also kept in step. A file that is
      not source-owned goes through the chunk store, which holds text only, so a
      changed binary there still blocks the restore whole. A file the snapshot
      recorded as 'not on disk' did not exist then, so a restore removes it if it
      exists now; a file skipped for size/unreadability is never deleted.
    failure_after_commit: >
      The snapshot commit is created before its file rows. If files.record
      fails after the commit exists, the commit stays, the API says so, and
      that snapshot is marked as having no restorable file layer
      (restore refuses with that reason). Retrying files.record for the same
      commit is idempotent and repairs partial rows.

  not_done:
    - 'automatic commit on every repo write'
    - 'binary-aware or block-level deltas (binary is stored as full copies)'
    - 'garbage collection of unreferenced blobs and of old chains'
    - 'restoring a subset of files (restore is whole-tree)'
    - 'incremental / multi-request record (one call carries the whole changed set)'
    - 'restoring a changed binary or non-UTF-8 file that is NOT source-owned: the chunk store holds text, so that restore is refused whole, naming it'
    - 'a CLI wrapper (the HTTP routes are the interface; proven over real HTTP)'

  ui:
    where: 'idearium Versionium repo subtab (js/app.js §RESTORE)'
    flow: >
      "preview restore" (server dry run, the default) shows would-write /
      would-delete / already-identical / left-alone / BLOCKED. Only a
      restorable preview with changes offers the restore button, which asks
      for confirmation, then shows the server's own verification result
      (verified against disk, or the mismatching files and the pre-restore
      snapshot id) and an undo button that previews restoring that snapshot.

## ADDENDUM 2026-10-10 — 0.56.0 SD0: over the limit is a 413, not a reset (docs/2026-10-10-idearium-solid-phasemap.spec)
James: "versionium unreachable at 127.0.0.1:3754 — read ECONNRESET". `lib/http-utils.js readRawBody` used to destroy the request socket when an upload went over its limit, so the route's 413 was never delivered and the sender saw a connection reset. It now drains and drops the rest of the body, and the route answers 413 on a live connection. On Idearium's side, `idearium/repo/snapshot.js _againWhileDown` retries limits, plan and stage (all content-addressed) while versionium comes back, waiting 2, 4, 8, 16 and 30 s. It never repeats commit or record. `VERSIONIUM_RETRY_MS=0` turns the waiting off.
