# 0.60.223 — 2026-10-23

James: "contiue getting idearium building phases"

## Why

The second place the self-building loop was open (docs/2026-10-23-self-building-loop-phasemap.spec, `found:`): nothing marked a
phase done. The only status writes were 'active' when a build starts and his manual Set status. So a proven run left its phase open,
and DG1 refused every phase that depends on it until he marked it by hand. SL1 is that write.

## Built (SL1)

- **`lib/phase-close.js` 1.0.0** (docs/self-building-loop.spec MOD-SL-CLOSE). Pure: the writer and the records are passed in.
  - `landed(run, { injects })` holds when the run is proven (its proof row says 'proven') and every change of the run is applied.
    - A change still proposed or staged → it waits, and names the change: the proof ran against proposals.
    - A rejected or reverted change → not landed: part of the run did not land.
    - No change at all → it closes, said: the phase was already true on disk.
  - `closeIfLanded(...)` writes the phase complete through the one status writer. Closing twice is a no-op.
  - `reopenIfUndone(...)`: a revert of the closing run's change sets the phase back to active and names the change.
- **The writer:** `setPhaseStatus` (idearium/repo/roadmap.js) takes a `note` after its date, for example
  `DONE 2026-10-23. 0.60.223 — proven by run phrun-…, on snapshot …`. It still proves loom reads the same status back.
- **Two triggers** (idearium/api/index.js):
  - the proof row 'proven', for auto mode, where the changes are already on disk;
  - each applied change, for review mode, where the last apply closes it. This is `lib/repo-inject.js` `setOnSettled`, registered by
    Idearium and called on the next tick, so it never holds a write up. A revert reopens.
  - Failures are on the activity log (`phase.close-failed`, `phase.close-refused`), never silent.
- **Records:** `idearium_phase_closes` (append-only; a reopen is a newer row), the activity log, and the orchestrator's ledger
  (`idearium.phase.closed`, `idearium.phase.reopened`). Not a run state, because the watchdog and the flights read a run's state as its
  own.
- **Doors:**
  - routes `POST /api/repos/:uuid/phases/close {runId}` (check one run again) and `GET /api/repos/:uuid/phases/closes`;
  - commands `repo close <repo> <runId>` and `repo closes <repo>`;
  - the phase panel's "closed by run … · version · date", or "reopened: <file> of run … was undone".
- **Loom:** lib/phase-close.js, with its consumers (api, route-commands, phases.js) and repo-inject's callback edge.

## Drift from the spec, decided by the axioms

The full record is in the map's SL1 addendum and the spec's addendum.

- The status format keeps the writer's date, with the version and run after it (§8.6, §0.1).
- The close record lives in its own table rather than as a run state (§1.2, §0.3).

## Proof

- `tests/modules/test-phase-close.test.js` 6/6:
  - **PC-01** the landed gates;
  - **PC-02** through the real writer: the next phase is ready in the DAG, twice is a no-op, a refusal is said;
  - **PC-03** reopen;
  - **PC-04** the real path: a repo, a proven run row, and its change. Proposed → it waits on lib/x.js. Applied → the map says
    `DONE … proven by run …`. Reverted → `IN PROGRESS … reopened: lib/x.js`. The closes route counts 1 closed, then 1 reopened;
  - **PC-05** every door;
  - **PC-06** the phase panel in Clear Glass.
- Also green: test-repo-inject 83/83, test-nexus-inject-approval 9/9, test-approval-chain 6/6, test-flight-recorder-standalone 6/6,
  test-phases-tab 5/5, test-roadmap-import 8/8, test-build-queue 6/6, test-substrate-spec 3/3.
- test-moce-roadmap is still 40/43. The same three failures appear with and without this change (checked by stashing it). They were
  already red on main.

## Next

SL2 closes the stale backlog by evidence: the phases whose files exist, by their own tests, with a dry run first. The loop (SL4) can
then pick from SL0's queue and close through SL1. SL5 (may a proven change land without him: A, B or C; the coder recommends B) is still
his to decide before SL4 runs unattended.
