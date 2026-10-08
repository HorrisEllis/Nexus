# 0.49.0 — 2026-10-08

James: "okay now the phases with the spec workshop. needs to be rebuilt, enterprise grade. interconnected" · "I'm thinking like document editor but for the emerge and .spec files. each block has a block id, which can be completely custom, can be anything."

RS3 and RS9 of `docs/2026-10-05-spec-workshop-rebuild-phasemap.spec` are done. Built on 0.39.353, then merged with main at 0.48.0. That brought in SP1, where the workshop's `sections:` list is read by its sections and blank sections are not planned, which this keeps. The document reader learned that form too, so a workshop spec's blocks are its sections, by their `id:`. These are the bottom of the build order: the screens (RS10, RS11) link by these ids, never by guessed titles.

## RS3: the spec document, `lib/spec-document.js`

- **Blocks.** A `.spec` or `.eg` file is read as blocks over its real text. Every byte belongs to one block, so an untouched file saves back byte-identical. Tested on `genesis.spec`, a YAML phasemap and a markdown spec.
  - Emerge: each `domain "…"` and each `// ──` banner is a block, with the comments directly above it.
  - YAML: each top-level key, or, under a single root like `spec:`, its keys.
  - Markdown: each heading.
- **Ids.** A block's id is its natural name until you give it one. "Can be anything": any text but a line break.
  - A custom id is written as a marker line in the block: `// @block …`, `# @block …` or `<!-- @block … -->`.
  - Ids are unique: a taken id is refused, never suffixed.
  - A rename is carried into the `blocks:` / `sections:` lists of the maps planned from that spec, and nowhere else.
- **Editing a block** keeps every comment and every other block byte for byte. The check runs on the result:
  - YAML by its parser;
  - Emerge structurally (quotes, brackets, `domain "name"`), because the Emerge kernel's own parser reads another dialect.
- **The workshop's own form.** A `sections: [{ id, title, body }]` spec's blocks are its sections, and the id is the `id:` field. A rename changes that field.
- **Bookkeeping blocks** (meta, history, notes …, and in a workshop spec the idea's own framing) are edited like any block but never planned. This is one rule, shared with main's SP1.

## RS9: the thread, `idearium/repo/thread.js` and `GET /api/repos/:uuid/thread`

- **The read.** A spec's blocks ⇄ the phases planned from them ⇄ each phase's latest run (state, model, rung) ⇄ its files ⇄ the changes waiting on them. With no `?spec=`, it lists the specs this repo's maps were planned from.
- **Stale.** A map records each block's hash when it was planned (`meta.block_hashes`). Editing a block marks only its own phases stale.
  - A map planned before this can only say "the spec moved".
  - A phase naming no block says "no link".
  - A phase naming a block that's gone says "broken".
  - Nothing is guessed.
- **The planner** (`spec-plan`):
  - It cuts by the document's blocks, so an Emerge spec plans too. Genesis planned nothing before; now it plans 21 phases.
  - It writes each phase's `blocks:` (exact ids) and the block hashes.
  - The agent's plan prompt lists the block ids and requires `blocks:` on every phase.
- **The parser.** The one phasemap parser (`loom/scanners/phasemap-map.js`) reads `blocks:`, else an older map's `sections:`.

## Tests

- `test-spec-document` 6/6.
- `test-thread` 4/4. TH-04 runs through the real router: plan a spec, edit one block, and only its phases go stale.
- `test-plan-lands` 17/17. PL-05 now counts `blocks:`.
- Unchanged and passing: build-surface 13/13, one-idearium-phases-nodes 21/21, moce-roadmap 43/43, moce-roadmap-ui 17/17, step-gate, draft-review.

## Not here

- SB28 (genesis's file list) stays its own phase.
- The routes for editing blocks come with the workshop editor (RS6).
- Next is RS10: the Phases tab rebuilt on the thread.
