# 0.39.144 — merge of 0.39.143 / 0.39.142-fixed / nexus-wired-1

Three uploaded snapshots reconciled into one tree. Said plainly, in order,
rather than left implicit in a diff:

## Base
`Nexus_0_39_143.zip` (identical to `Nexus_0_39_143-1.zip`, confirmed by
MD5) was used as the base — it was already the most complete of the
three: it alone had `remote-desktop/`, `docs/nexus-uri-clearglass-mesh-integration.spec`,
`lib/nexus-uri.js`, `idearium/repo/repo-node.js`, and
`lib/node-schemas/schema.repository`.

## Folded back in from `nexus-wired-1.zip`
The base was missing 1,519 files that only existed in `nexus-wired-1`:
- `idearium/repo/repos/nexus-id-repo-{0672ffb3,3eed3fb0,c2dd91c5}/` — three
  imported projects' materialized chunk data. Copied forward whole.
- `data/cortex/memory/event_log.json.lock` — **not** carried forward,
  deliberately. A stale process lock has no business in a merged
  distributable; including it risks a target machine believing a lock is
  already held.

## Real regressions found and fixed, not just re-added
Two things this session had already fixed once, found silently reverted
in this snapshot — both in `repo.import-archive` (the older, synchronous
"Import Project" screen), neither touched by whoever did the forward
merge that produced 0.39.143:

1. **Compartment wiring** — had gone back to always passing
   `compartmentId: null` to `RepoLayer.ingest()`. Re-fixed using the
   *newer* real mechanism this snapshot's own `project-import.finalize`
   already established (`lib/project-container.js`'s `startContainer` /
   `ingestFilesIntoContainer` / `finalizeContainer`), not the older
   `classify()`+`spawn()` patch from before — so both import screens now
   share one real compartment lifecycle instead of two different ones.
2. **The L2-L5 pipeline never ran on this route at all.** `runImportPipeline()`
   (parse → atlas → chunk → verify → index) was only ever called from
   `project-import.finalize`; the older screen's imports got a repo with
   no atlas, no chunks, no indexes. Now calls it the same way, same
   non-blocking fault handling (a pipeline FAULT is logged and surfaced,
   never blocks the import response).

## What this session's own recent work added that wasn't in ANY of the
## four uploaded zips
None of the last two sessions' deliverables had been folded into a
working copy before these zips were made:
- `security/signaling-envelope.js`, `security/e2e-channel.js` — added.
  Zero overlap with anything in the existing tree; purely additive.
- The standalone `chunk-index.js` prototype (AST-based JS chunking, JAA-
  table storage, component classification, search index, patch/remove
  work-surface ops) was **not** re-added as-is. `idearium/repo/import-pipeline.js`
  already exists in this snapshot and is a more mature, already-integrated
  L2-L5 pipeline (incremental re-chunk on every write, real `.repository`
  node, disk-based atlas/chunks/indexes) that supersedes it. Rather than
  create two competing "chunk" concepts, only the two things
  `chunk-index.js` had that `import-pipeline.js` didn't were ported over:
  - Component-kind classification (kernel/engine/runtime/CLI/API/
    controller/adapter/configuration/registry/storage/dispatcher/parser/
    compiler/provider/service/event-bus/interface/component), added to
    `buildAtlas()`'s per-file entries plus a `byKind` summary and a flat
    `components` list.
  - A read-only query surface (`readAtlas()`, `queryByKind()`,
    `searchRepo()`) over `import-pipeline.js`'s own existing on-disk
    output — no new storage, deterministic token-overlap search, wired to
    two new routes: `GET /api/repos/:uuid/index` and
    `GET /api/repos/:uuid/search?q=`.
  The patch/remove work-surface operations `chunk-index.js` had are
  **not** carried over — `import-pipeline.js` has no equivalent mutation
  routes yet. Real gap, not silently dropped: flagged here as the next
  piece if per-chunk patch/remove is still wanted.

## Version
`package.json` bumped `0.39.126` → `0.39.144` to catch it up to the
zip-naming convention already in use; it had been stale since before this
whole merge.
