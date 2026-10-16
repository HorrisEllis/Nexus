# 0.60.105 — 2026-10-16

James: "okay, it "completed" a contract. when i reject a propasal, the agent needs to understand the failure mode ad try
again, after learning"

Then, looking at his Code tab (lib/intent-hat-router.js -114 +24, lib/hat-seed.js -281 +20,
lib/node-schemas/schema.intent -54 +31, all rejected): "why so much regression?"

The map is `docs/2026-10-16-reject-learn-retry-phasemap.spec`, written before the code.

## Why so much regression (what the run showed)

- **The cause.** The agent sends the whole file back, and anything it leaves out is deleted. A weak reply deletes code it
  was never asked to touch.
- **What main already had, newer than his 0.60.93:**
  - the shrink rule (0.60.98);
  - proposal evidence (0.60.99);
  - the reject retry with his reason;
  - the fix for the "auto-retry-held" loop in his Tasks list (0.60.102).
- **What still got through:**
  - 124 → 34 lines is above the shrink rule's quarter.
  - A 54-line schema is under its 100-line floor.

## Built

- **RL1, `lib/phase-faults.js`.**
  - `rejectionModes` reads the failure mode off the evidence before any model is asked. The modes are no-parse,
    regressed, exports-lost, gutted and decls-lost. When none of them holds, the mode is 'rejected' with his reason.
  - `learnRejection` logs one fault per mode, with the phase and map. This means `precedent(phase)`, the "WHAT WENT
    WRONG ON THIS PHASE BEFORE" text, now carries rejections into the next attempt and onto the Plan. Before, rejection
    faults had no phase, so they never showed there.
- **RL2, `idearium/api/index.js` `_learnFromRejection`.** A rejection now runs in order:
  1. classify;
  2. tell the agent (the modes named);
  3. take its diagnosis;
  4. log the lesson;
  5. retry. The note carries the modes, the evidence and the agent's own diagnosis.

  Before, the tell and the retry ran side by side, and the agent's answer only reached the activity log. An agent that
  does not answer does not hold the retry. Event: `idearium.repo.inject.learned`.
- **RL3, the agent screen in `lib/repo-inject.js`.** An agent's proposal is refused if it:
  - removes exports, or
  - cuts a 40+ line file by over 40% while losing declarations (JS) or keys (yaml-like data).

  The refusal names what was lost. A person can still make such a change.
- **RL4, the door.** `GET /api/repos/:uuid/lessons?phase=` and `repo lessons <repo> [--phase P]`. The Plan's precedent
  line already renders `precedent(phase)`, so the lessons show there.
- **His boot log.**
  - `lib/vector-memory.js` no longer tries `eravos/registry-components.js`.
  - His ERAVOS template folders under `cos/archetype/` carry `.template-tree`, so the event census skips them (it
    flagged his music domain's `audio:lines`).

## Proof

- `tests/modules/test-reject-learn-retry.test.js` 7/7. It covers the modes, the lesson on the phase, the order (tell →
  diagnosis → lesson → retry), his intent-hat-router shape, his schema.intent shape and the door.
- Unchanged and passing: test-repo-inject 83/83, test-inject-screen 9/9, test-nexus-inject-approval 9/9,
  test-build-paths 6/6, test-loom-map 19/19, test-loom-phasemap 14/14, test-canvas-compartments 7/7.
- test-run-watch is 10/10. RW-05 is a source check: it now also accepts the reject retry inside `_learnFromRejection`.

## Not done (said, not hidden)

- **Failing before this release, not touched:**
  - EC-05: `idearium.phase.mapped`, `idearium.repo.released` and `cos/app/controller` events are undeclared on main;
  - CL-07 needs a running Guardian.
- **Lessons are per phase.** A lesson per agent across phases (`lib/agent-notes.js`) is not wired.
- **`rejectionModes` and data files.** For yaml-like data it uses the evidence's declaration list, which is not
  meaningful there. The screen (RL3) catches those by keys before they reach him.
- **From his log, not fixed here:**
  - the stale guardian organism-queue node command;
  - the RAID contract that failed with "no real repo provisioned".
- **No live run on his machine yet.**
