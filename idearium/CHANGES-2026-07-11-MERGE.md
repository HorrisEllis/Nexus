# Idearium — branch merge, 2026-07-11 (round 3)

Two independent sessions forked from the same baseline (`nexus-full-5` +
`idearium-fix-patch`) and diverged completely — neither contained the
other's work. Reconciled here rather than picking a winner.

## What came from each side

**This session's prior rounds** (multi-template composition, buildEngine
selector, idea↔spec phase linkage, repo file materialization, tv-ui
channel decomposition, Clear Glass renderer decomposition):
- `templateIds[]` — compose several templates into one spec, seeded
  sections merge across all of them, first-pick-wins on overlap.
- `buildEngine: 'auto'|'warp'|'direct'` on `createSpec`.
- `ideaUuid` on the manifest + phase auto-advance (seed→specced on spec
  creation, →building/complete on promote) — the actual fix for
  "can't change the phase."
- 5 templates: architecture, schemas, checklists, axioms, compartments.

**The parallel branch** (`nexus-full-wired`):
- Boundary engine generalized to 3 dialects (YAML/Markdown/line-statement
  DSL) — real upload parsing for arbitrary spec formats.
- `computeRootHash`/`findByRootHash` — content-addressable identity.
- `RepoLayer` v2 — no content store of its own; a repo is an index over
  a spec-engine manifest (`{uuid, name, specUuid, rootHash, ...}`). Free
  dedup (same content → same rootHash → reuse), free forking (fork =
  same specUuid until something diverges).
- `ingestFilesAsSpec` — dropped files become chunks the same way an
  imported `.spec`'s blocks do; one mechanism for both.
- `copilot-adapter/index.js` — a stable gate (`suggest()`) in front of
  whatever copilot backend is registered. Ships pre-wired to
  `nexus/copilot/server.js`'s real `/api/prompt/fulfill` endpoint.
- 5 templates: minimal-kernel, api-service, event-system, plugin-runtime,
  ai-agent-system.
- Spec Library drag-and-drop + "import .spec…" button.

## What the merge actually required (not just concatenation)

- `_seedSectionsFromTemplate` unified two independent seeding
  conventions: `## SECTION: <id>` markers (multi-section per template)
  and `seedSection` (whole file → one section). Both now work through
  one function — verified live with a spec composing 3 templates across
  both conventions in one call (`compartments`+`axioms` markers,
  `api-service` seedSection).
- File CRUD (read/write/delete) rebuilt against v2's model — since v2
  has no content store, these resolve through spec-engine chunks
  directly via two new spec-engine primitives, `addChunk`/`removeChunk`
  (didn't exist on either branch — chunk lists were fixed at spec
  creation time on both).
- **Bug found and fixed**: `addChunk` returned `completeChunk`'s return
  value (a single chunk object) instead of the fresh manifest — every
  "add file with content" call crashed (`fresh.chunks.find` on an
  object with no `.chunks`). Caught by live testing, not code review.
- **Bug found and fixed**: `computeRootHash` hashed ALL chunks including
  soft-deleted ones — a removed file never changed the repo's declared
  content identity. Excluded `status:'removed'` chunks from the hash.
- **Bug found and fixed**: `RepoLayer._enrich()` returned the repo
  record's rootHash snapshot from ingest time, not a live recomputation
  — every view after any edit showed a stale hash. Now recomputed from
  the freshly-loaded manifest on every read.
- **Bug found and fixed**: same repo's file listing still showed
  soft-deleted chunks — `_enrich()` didn't filter `status:'removed'`.
- The same `originIdeaUuid`-vs-synthetic-tracking-idea distinction from
  round 2 applies to v2's simplified `_promoteSpecToRepo` too — carried
  forward, not re-introduced as a bug.

## Verified live, full round-trip
Idea created → 3-template spec (2 conventions, 2 branches) → phase
auto-advanced to `specced` → 8/10 chunks built (2 failed — no live LLM
agent in this sandbox, expected) → manual-mode promote → phase advanced
to `building` → file read → file edit (rootHash changed) → file add
(rootHash changed again, previously crashed — now fixed) → file delete
(rootHash reverted to EXACTLY its pre-add value, confirming content
addressing is correct) → deleted content confirmed still on disk
(soft-delete, `.trash` semantics via chunk `status:'removed'`, not
`fs.unlink`).

## Also merged, unchanged from their source
- `unintegrated/2026-07-branch-a-additions/` — compartment-engine,
  autonomous-loop, RFR2 wiring-priority map, 5 UI pieces, session docs.
- `unintegrated/2026-07-branch-b-cortex-v2/` — cortex-v2, BEP/crystal
  writes, versionium causality, topo-kernel/spatial.
Both staged as-is (this branch's own earlier analysis), not re-verified
this round.

## Known open items (carried forward, not resolved this round)
- Copilot backend registered by construction, not verified live — no
  running Guardian/Ollama/copilot process in this sandbox (confirmed:
  `connected:true, reason:'backend error: fetch failed'` — the adapter
  reports this honestly rather than masking it).
- `dedup` check in `RepoLayer.ingest()` compares against stored
  `rootHash` snapshots on OTHER repo records, which can themselves go
  stale after edits — same class of bug as `_enrich()`'s, fixed there,
  not yet audited here. Lower risk (only affects new-ingest collision
  detection, not display), not yet fixed.
- tv-ui channels / Clear Glass decomposition (this session's rounds 1-2)
  carried into this tree unchanged — not re-touched by this merge.
