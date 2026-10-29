# 0.60.123 — 2026-10-17

James: "check main. we aare way ahead. then look at the plan panel, can you integrate it with the rest of the new panels?
like this should be the plan panel (second image) each chunk/dependancy a piece of the progress indication. progress
shows for each task with a full run history, and log to make it explicit. like the panels should remain interconnected.
so strip the context from the plan panel since we have a dedicated one now."

James (2026-10-13): "can we fix the memory issue. all of the resource optimization as possible. also failure modes are to
prevent problems not solutionsn"

Two parts:
- PP1–PP4 of `docs/2026-10-16-code-tab-rebuild-phasemap.spec` (addenda e and f);
- MP of `docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec` (addendum 2026-10-17).

## The Plan: pieces, runs, and the dock (PP1–PP4)

- **PP1, pieces as progress.**
  - Each phase's bar is its pieces: one segment per planned file, coloured by state (pending, running, written, failed,
    proven, done), with "k/n" proven beside it.
  - Hover a segment for its attempts, its agent, what it uses (the plan's imports) and why it failed.
  - The pieces are the latest plan's files, else the phase's `files:`. A phase with neither shows one "whole phase"
    segment.
  - Backend: `idearium/repo/build-plan.js` `piecesOf`, pure, over the raw rows the plan already reads. It reuses
    `lib/run-watch.js` (is the run open) and `lib/phase-plan.js` `depsOf` (what a piece uses).
- **PP2, run history and log.**
  - Expanding a phase lists its pieces, then every run, newest first: when it ran, how it ended, which agents, how long,
    how many rows.
  - Each run opens to its full log: every row in time order, with the piece, the agent, the rung and the note.
  - The review and proof runs are grouped with their build run.
  - Backend: `historyOf`, at most 12 runs and 80 rows each. Anything cut is said.
- **PP3, interconnected.**
  - Click a piece and the dock's Changes and Outputs panels open on that file. Each panel says "from the Plan: <file>",
    with "show all" to clear it.
  - A run's "context" button opens the dock's Context panel on that run. That panel has "in the Plan" to go back.
  - All of this goes through one shared focus (`code-dock.js` `dockFocus`).
  - **Found by the test and fixed:** the Plan panel was drawn on top of the dock column, so a piece clicked in the Plan
    opened Changes underneath it. With the dock open, the Plan panel now sits to its left. A panel you dragged keeps its
    place.
- **PP4.** The Context card has left the Plan panel. The dock's Context panel is the one place, using the same function,
  `_ppContext`.
- **Agents:** `repo plan <repo> [phase]` (`repo.plan`, through `nexus.command`) prints each phase's pieces as a glyph
  strip. Given a phase, it prints each piece and every run's log.

## Memory: a failure mode that happened becomes a prevention (MP)

- **`lib/prevention.js`.** A memory crisis is written down: by `lib/resource-monitor.js` when memory goes critical, and by
  self-heal when it enters FAILURE_MODE. For 24 hours after a crisis, heavy work needs 30% free memory, not just "not
  critical".
- **What now asks first:**
  - the nexus-self sync;
  - the officiator tick;
  - the loom registry refresh, which is now skipped when the registry is under 12 hours old, starts a minute after boot,
    and then waits for headroom;
  - Eros and the hidden pre-warmed provider window in Clear Glass, which are held under lean mode or prevention (Eros can
    still be started on demand).
- **Ollama** unloads an idle model while memory is pressed (`ollama/lib/idle-unload.js`, `keep_alive: 0`).
- **Settings → lean card** shows what is being prevented and why, with a button to clear it. Agents get the same through
  `system prevention`.
- This was first tagged 0.60.30 on the branch. Main used that number for GT1, so it is released here.

## Proof

- `tests/modules/test-plan-pieces.test.js`: 4/4. PP-02 and PP-03 are driven in Clear Glass on a real `buildPlan`.
- `tests/modules/test-prevention.test.js`: 8/8.
- Neighbouring suites:

  | suite | result |
  |---|---|
  | test-plan-sidebar | 4/4 |
  | test-code-dock | 10/10 |
  | test-code-tab | 16/16 |
  | test-build-surface | 13/13 |
  | test-plan-code-run-attention | 40/40 |
  | test-phases-tab | 5/5 |
  | test-step-gate | 18/18 |
  | test-hardening-pass | 9/9 |

- Two regressions were caught before release and fixed:
  - CT-23: a step with no raw rows had lost its ledger's file links. It falls back to the merged ledger.
  - PP-03: the panel overlap described under PP3.

## Open

- The memory numbers from his 0.60.23 log (15.4% → 0.1% free in four minutes) still need a run on his PC to show the
  prevention holding.
- Next, per his "Prove one build, then scale": the scale phasemap. It covers plan + contract when the only coder is
  remote (claude-code), the refactor tool (RF0–RF2), and RAID, Clear Glass and Guardian throughput.
