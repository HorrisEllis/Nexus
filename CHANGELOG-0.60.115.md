# 0.60.115 — 2026-10-17

James: "merge. then next phase."

PR #99 (0.60.112–0.60.114) is merged. The next phase is FR2 of the flight recorder: a change is tested before it lands,
in the tree it belongs to.

## What was already there, and what was not

`lib/proposal-evidence.js` already ran a change's linked tests twice in a shadow copy (once on the file as it is, once
with the change in place), and `apply()` refused a change that broke a passing test. Two real gaps:

1. **Every change was tested in Nexus's tree.** `gather()` defaulted its root to Nexus, even for a change to another
   repo. A repo's `src/x.js` found no linked test ("nothing could check it"). A carved repo's `lib/zip.js` ran Nexus's
   own tests against Nexus's own file.
2. **Staged batches were never tested.** Evidence was kept only while a change was "proposed", and `code-edit` stages a
   change immediately after proposing it. So `promote` applied a staged batch untested. Even when tested, each file was
   only ever tested alone.

## Built

- **Tested in its own tree.** `repo-inject` `setEvidenceRoot()` is set by Idearium to the repo's folder on disk.
  - A Nexus change (the approval gate) keeps Nexus's tree.
  - A repo with no folder on disk is not tested, and the record says so, rather than testing it against Nexus.
- **Staged changes keep their evidence.**
- **A batch is tested together.**
  - `shadow()` now takes several overlaid files at once (`null` means the file is gone).
  - `gatherBatch()` takes the union of every file's linked tests and runs them once on the tree as it is, then once with
    the whole batch in place. The verdicts are the same as for one file.
- **Promote checks first.** `code-edit` `promoteTested()` refuses a batch that regresses, and nothing is applied. The
  batch test is written on each of its changes. `force` skips the test, and says it was skipped.
  - `POST …/code/promote` uses it, answering 409 with the batch result when the batch regresses.
- **The record shows it.** The record (FR1) and the Code tab's changes panel say where each change was tested and what
  its batch test found. Evidence a repo's change got from Nexus's tree (from before this release) is marked as a hole.

## Proof

`tests/modules/test-tested-before-lands.test.js`: 5/5, on a fixture repo with real tests.
- TB-01: the multi-file shadow; the real tree is untouched.
- TB-02: `a` adds `g` and `b` calls `g`. `b` alone breaks, because `a` doesn't have `g` yet. The two together pass. A
  batch that really breaks regresses, and the failing test is named with the file it is linked to.
- TB-03: evidence runs in the repo's own tree. With no folder, the change is not tested, and that is said. A staged
  change keeps its evidence.
- TB-04: `promoteTested` refuses a regressing batch with nothing applied, lands a good batch, and with `force` says the
  test was skipped.
- TB-05: the real `code/promote` handler answers 409 with the batch.

`test-change-record` 7/7 (CR-07: where it was tested, and the batch).

Neighbouring suites stay green: repo-inject 83, code-edit 20, inject-screen 14, nexus-inject-approval 9, code-tab 16/8/8,
repo-versions 6, reject-learn-retry 7.

## Not yet

- **The COS testenv's VM path is not used yet.** That path runs a repo's own `npm test` or `pytest` in a throwaway VM;
  the shadow copy used here is a process sandbox.
- **Only tests linked directly to a file run.**
- `test-proposal-evidence` PE-10 is still red, as it is on main.
