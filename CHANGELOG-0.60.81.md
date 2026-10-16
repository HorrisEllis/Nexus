# 0.60.81 — 2026-10-16

_Built on the branch claude/exciting-shannon-m4nawj as 0.60.80; renumbered 0.60.81 at the merge with main (main had already used 0.60.79)._

James: "expand the code tab in repo. the file and code tab merge. all of it from the phases3"

The backend for the rest of `docs/2026-10-15-code-tab-run-state-phasemap.spec`, first, as his order of delivery says
(backend → route → command → UI). The UI is 0.60.82. The plan is the map's addendum 2026-10-16 (b), written before any
of this.

## CE7: AI editing by lines or a section

- **`lib/line-edit.js`** gains `verifyText` / `applyText`. They do the same checks as before (`expect` must match the
  lines as they are now; one bad edit refuses the whole set), but on text in hand, so they work on any repo, not only
  the Nexus root. Overlapping edits and ranges past the end of the file are refused. Each result carries the checksums
  before and after.
- **`POST /api/repos/:uuid/code/edit`** turns a checked edit set into one proposal (source `line-edit`, its ranges and
  checksums). It lands on the work surface with Apply / Reject.
  - A stale `expect` or a stale `checksum` is a 409, never a guess.
- **`POST /api/repos/:uuid/code/assist`** hands the picked lines to the repo's agent with an action (change, expand,
  refactor, fix, document, explain), plus six lines either side as context.
  - The agent returns only the replacement, in one fenced block.
  - Nexus builds the edit with `expect` set to the lines it read, so the model never addresses lines itself.
  - A reply with no block proposes nothing and says so. `explain` only answers.

## CV2: a version per diff (his words: "versioning each diff using versionium")

- `lib/repo-versions.js` gains `label()` and `commitNow()`.
  - An applied or reverted proposal, a file restore and a run rewind each commit at once, instead of after the 1.5 s
    settle.
  - Each commit carries labels: kind (edit · manage · agent · person · restore · revert), inject, run, by, path, action
    and checksums.
- A burst of plain writes still settles into one commit.

## CV4: tagged history ("full history tracked and tagged")

- `GET …/history?path=&tag=kind:edit` (repeatable, comma-separated; every tag must match). `by:` also matches who
  stands behind the commit.
- The command is `repo history <repo> <path> --tag k:v`.

## CV3: rewinding a run ("rewind engine for each file")

- A single file already rewinds through `repo restore-file`.
- **New:**
  - `GET …/runs` lists the runs Nexus kept;
  - `POST …/runs/:id/rewind` puts every file the run changed back as it was at the last version before the run
    started. A file the run created is named and left (§0.3). `dryRun` says what it would do.
- Each restore is its own labelled version, so a rewind can itself be undone.

## Commands

- `code edit <repo> <path> <from> <to> --with "…" [--expect "…"]`
- `code assist <repo> <path> <from> <to> <action> ["…"]`
- `repo runs`
- `repo rewind-run <repo> <runId> [--dry]`
- `repo history … --tag`

## Proof

- `tests/modules/test-code-tab-expand.test.js` 8/8, through idearium's real router, with a stand-in copilot and a
  stand-in Versionium.
- Unchanged and still passing:
  - `test-repo-inject` 83/83
  - `test-repo-versions` 6/6
  - `test-repo-history` 20/20
  - `test-work-surface` 27/27
  - `test-file-versions-and-reassign` 5/5
  - the line-edit users: `test-agnostic-lib-tools`, `test-gemini-toolbox`, `test-p1`, `test-p2`
- `test-event-contracts` EC-05 still fails as it does on main, on the four events undeclared before this change. The
  two new events are declared.

## Found on the way

- A file ingested without a final newline keeps none after an edit. That is correct (the edit keeps the file's own
  ending). The coder's first test assumed otherwise.
