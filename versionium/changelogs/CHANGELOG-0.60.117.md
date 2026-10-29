# 0.60.117 — 2026-10-17

James: "Next and Merge."

FR3 of the flight recorder: undo any change an agent made, keeping every later edit.

## What was missing

`lib/repo-inject.js` `revert()` refused as soon as the file had changed after the change it undoes. So only the newest
change could ever be undone, unless `force` was used, which throws away every later edit. Nexus also had no three-way merge
anywhere (searched for: three-way, merge3, diff3).

## Built

- **`versionium/lib/merge3.js`:** a line-based three-way merge, aligned by the longest common subsequence under
  Versionium's own size limit. Past that limit it refuses, and says so.
  - A region only one side changed takes that side.
  - A region both sides changed the same way is taken once.
  - A region both sides changed differently is a conflict. It is returned with its lines, never guessed.
  - Line endings are kept byte for byte.
- **`revert({ merge: true })`** undoes a change by merging three versions: what the change wrote, the file now, and what
  was there before. The change's own lines are reversed, and every later edit is kept.
  - It refuses when a later change touched the same lines, and names them (line, what this change wrote, what the file
    has now, what was there before).
  - It refuses a file this change created that was edited since, because undoing would delete those edits.
  - It refuses a file that was deleted since the change.
  - The undo is recorded as its own version, like any revert, and the history says "merged with the later edits".
- **The revert route merges by default.** `merge: false` keeps the old refusal.
- **The command:** `repo undo <repo> <change id> [--no-merge] [--force]`.
- **The UI:** the Code tab's changes panel has **Undo** for an applied change and **Reject** for a waiting one, and says
  what happened.
- **The record** (FR1) says whether an undo kept later edits.
- **The product manifest** lists `merge3.js` as a file the copy must carry. The merge is tagged as part of the product.

## Proof (the phasemap's own)

`tests/modules/test-undo-any-change.test.js`: 6/6.
- UN-01: merge3's cases, including CRLF and a file with no trailing newline.
- UN-02: three changes to one file, the middle one undone. The first and third are kept, all three stay in the history,
  and the old refusal still stands without `merge`.
- UN-03: a later change on the same lines is refused with the lines named, and the file is untouched.
- UN-04: a created file edited since, and a file deleted since, are refused and said.
- UN-05: the real route through the router, and the `repo undo` command.
- UN-06: the Undo button, driven in Clear Glass.

Neighbouring suites stay green: repo-inject 83, change-record 7, tested-before-lands 5, code-tab 16/8/8, repo-carve 14,
mcob-file-versioning 33, nexus-inject-approval 9, loom-map 19.

## Noted

`versionium/spec/versionium.file-versioning.spec` was already not valid YAML: its earlier addenda are plain text. This
addendum follows that file's own convention. Making the file parse again is left for its owner to decide.
