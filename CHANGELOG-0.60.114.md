# 0.60.114 — 2026-10-16

James: "next"

He said it after the coder named FR1 as its pick for the flight recorder: one record per change an agent makes.
(Docs: `docs/2026-10-16-repo-carve-phasemap.spec`, FR1.)

## What a record says

The change itself is an `.inject`: one write of one file by one agent, with its own lifecycle (proposed, staged, applied,
reverted, rejected) and its own undo. `lib/change-record.js` joins onto it what Nexus already writes, and stores nothing
itself:

| part | where it comes from |
|---|---|
| **what**: lines added and removed | Versionium's own text-diff, from what the file held before |
| **who**: the hat, provider, model, and who approved | the inject and its task |
| **why**: the run's goal, attempt and brick | its task, then the run of that task's session in `lib/run-state.js` |
| **checked**: linked tests run, regressions | the inject's evidence (`lib/proposal-evidence.js`) |
| **landed**: the version it became | the version commits whose labels name this inject |
| **timeline** | its history, its activity rows, its commits, oldest first |
| **undo**: whether it can be undone now, and how | its status (revert an applied one; reject a proposed one) |
| **holes** | each link that should be there and is not, named, never filled |

Changes made before this release did not keep their task. For those, the run is matched by path and time, and the record
says "matched by path and time", never "known".

## Built

- `lib/repo-inject.js` `propose()` now keeps the task it was written in (`lib/repo-activity.js` `current()`), so new
  changes know who asked and why without guessing.
- Routes: `GET /api/repos/:uuid/changes` (one line per change) and `GET /api/repos/:uuid/changes/:id` (the whole record).
- The command: `repo record <repo> [<change id>] [--status …] [--limit n]`.
- The UI: the Code tab's **changes** panel. Each row shows what, who, why, what was checked, the version it landed in
  and the undo, with missing links in red. Clicking a row opens its whole record.

## Found while building

- **A task's `runId` is the phase run, not run-state's.** A session's run-state id is `<repo>__<session>`, so the record
  finds the run through the task's session.
- **The command name was already taken.** `repo.changes` exists (the agent's proposals, `--prove`), and a second row
  with the same key was silently shadowed. This command is `repo record`, and CR-05 now checks that no two command keys
  are the same.
- **`test-proposal-evidence` PE-10 also fails on main.** The export-loss screen (0.60.105) refuses its fixture before
  the evidence check it tests. It is not this release's, and is left as it is.

## Proof

`tests/modules/test-change-record.test.js`: 6/6.
- CR-01: the task is kept, through a real task.
- CR-02: the full join.
- CR-03: the match by path and time is said; no match is a hole.
- CR-04: holes and undo.
- CR-05: the routes through the real router, the command row, and unique command keys.
- CR-06: the panel in Clear Glass.

Neighbouring suites are green: repo-inject 83, code-edit 20, inject-screen 14, code-tab 16/8/8, repo-versions 6,
repo-carve 12.
