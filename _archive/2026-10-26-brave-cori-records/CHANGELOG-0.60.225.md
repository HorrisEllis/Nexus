# 0.60.225 — 2026-10-24

James, to "Say 'B' and 'the 2' (or your own picks) and I'll start SL4.": "yes do it."

## His calls, and how they were read

The coder put three choices to him on 2026-10-23:
- **SL5, what lands without him.** A, every change asks; B, a proven change whose gates all passed lands by itself in his project
  repos, while Nexus's own repos stay review; C, B and Nexus too, except files he keeps. The coder recommended B.
- **The SL2 dry run.** Close the 2 phases whose own test passed, all 107, or his picks. The coder recommended the 2.
- **Whether to start SL4.**

**Read as (to confirm):** SL5 = B, close the 2, build SL4. If he meant only "do SL4", `trust --set A --words "…"` sets the rule back to A,
and nothing else changes.

## Built

- **SL5: `lib/trust-rule.js`.**
  - B is recorded in code (`DECIDED`) with his words and the options he chose from. The store is data and is never committed, so his
    decision lives where the code does. A rule he sets later supersedes it, and the earlier one is kept.
  - `allows()` decides each change:
    - A asks;
    - B lands a proven proposal in a project repo, and asks in a Nexus repo;
    - C asks only for a file he keeps;
    - a change whose evidence shows a regressed test never lands.
  - Doors: `GET/POST /api/trust-rule` (his words required) and `trust`.
- **Landing by his rule:** `_landByRule` runs when a run is proven, before SL1's close. It applies each proposal the rule allows,
  approved by `trust-rule:B`, and says why for each one landed or kept. `apply()` keeps its own guards, and undo is the change's revert.
- **The 2 closes:** G0 and PS1_phase_specs closed by their own tests, through the status writer.
- **SL4: `idearium/lib/autobuild.js`, the loop.**
  - Each step takes the queue's next phase (SL0), builds it (`_phaseBuild`, with DG1/DG2/DG3, the ladder and the proof), waits for its
    run to end, lands it by his rule, closes it (SL1), then takes the next.
  - It stops on the budget (5 phases or 240 minutes by default), on three phases in a row that did not close, or when nothing is left
    to build. When it stops, it names how many phases wait on his decisions.
  - A phase that did not close is skipped for the rest of the loop and listed. There is never more than one loop per repo.
  - The watchdog's existing minute tick steps it.
  - Doors: `GET /api/repos/:uuid/loop`; `POST …/loop/start` (with `{ budget }`), `…/loop/stop` and `…/loop/step`; `repo loop <repo>
    [start|stop|step]`; and the Phases tab's "self-building loop" section. That section shows state, built, closed and skipped, and his
    rule in his words. Start asks first.
- **The watchdog's stall default is now 20 minutes, up from 10.** A claude-code attempt may run 15, so a working one was being called
  stalled.
- `_queueFor` is the "what can be built now" reader, now shared by `…/phases/next` and the loop.

## Not done from here

No loop was started on Nexus or on any of his projects. Starting one spends agent calls, so that is his to start: ⟳ start the loop in
the Phases tab, or `repo loop <repo> start`. On a Nexus repo, B keeps every change for him, so the loop builds and proves, and each
phase closes when he applies it.

## Proof

- `tests/modules/test-self-building-loop.test.js` 5/5:
  - **LP-01** his rule;
  - **LP-02** the real queue and the real writer over a fixture map: three chained phases build and close in order, started once. The
    phase waiting on his decision is never built and is named when the loop stops. A second start on the same repo is refused;
  - **LP-03** the budget in phases and in minutes, and three misses in a row (the fourth phase is never built);
  - **LP-04** the real API: start with nothing to build stops at once, said; the trust route reads B and refuses a rule without words;
    every door;
  - **LP-05** the rail in Clear Glass: the loop and his rule show, and start asks first.
- Also green: test-phase-close 6/6, test-build-queue 6/6, test-evidence-close 5/5, test-phases-tab 5/5, test-repo-inject 83/83,
  test-economy-resume 5/5, test-nexus-inject-approval 9/9, test-approval-chain 6/6, test-substrate-spec 3/3, test-roadmap-import 8/8,
  test-release-version 5/5.
