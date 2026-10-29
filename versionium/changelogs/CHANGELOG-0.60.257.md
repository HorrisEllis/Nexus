# 0.60.257 — A phase nothing can check waits for James's verdict, inside RAID

James, 2026-10-26, with screenshots of NEXUS/CORE building `IC1_context_by_uuid_injection`: "the gate doesn't wait for me to accept it or
not before it fails. i want to be able to build nexus inside of nexus. need nexus to use those gates. like raid or orchastrator. look at
recent phases."

Map: `docs/2026-10-26-gate-waits-for-verdict-phasemap.spec` (GV1–GV4).

## What the run showed (traced in the code)
The build already runs through RAID. `idearium/api/index.js` hands every planned phase to `cortex/core/raid/contract-intake.js`
runContract, which runs the gates in `contract-gates.js`. The last gate, `phase`, is the proof. The screenshots show these steps:
1. IC1 (`docs/2026-08-30-interaction-contract-context-phasemap.spec`) names no `files:` and no `conditions:`.
2. The planner did not run: there was no Ollama model on the ladder. So no conditions were generated either.
3. Gemini wrote the spec, and the proof had nothing it could check: **no-proof**.
4. The gate treated no-proof as a failure. RAID retried it three times in the same second, although no-proof cannot change between
   tries. It then failed the gate, called the run `contract-incomplete`, and asked self-heal.
5. He was never asked.

## What changed
- **GV1, RAID holds a gate for a person.** When the code that runs a gate answers `{ awaitsPerson }`:
  - The scheduler keeps the gate READY and spends no retry. The gate is never FAILED.
  - It records `<gate>.awaiting`.
  - `runContract` returns `awaiting` (a new status), and asks no self-heal.
- **GV2, the phase gate asks.**
  - When the proof finds nothing it can check, the gate now waits for his verdict.
  - The run is recorded as `awaiting-verdict`. The watchdog never calls it stalled, and the self-building loop moves on to the next phase
    while this one waits.
  - `POST /api/repos/:uuid/phases/verdict { runId, accept, words }` takes his verdict:
    - **Accept:** the run is recorded as proven by him, in his words. Its proposals land, approved by him. The phase closes, and RAID's
      queue row passes.
    - **Reject:** its proposed changes are rejected and its applied ones reverted. The run is recorded as unproven, with his words, and
      RAID's queue row fails.
- **GV3, his buttons.** A waiting phase in the Tasks panel shows **✓ accept** and **✗ reject**, with the reason it waits. Each asks for his
  words. For agents there is a row: `repo verdict <repo> <runId> accept|reject [--words "…"]`.
- **Unchanged:** a phase whose checks ran and failed still fails, retries and asks self-heal. That is evidence, not a question.

## Proof
| Suite | Result | What it checks |
|---|---|---|
| `tests/modules/test-gate-waits-for-verdict.test.js` | 5/5 | A real RAID contract whose phase gate answers awaitsPerson: called once, never FAILED, RAID row `awaiting`, no self-heal. A failed check still fails and asks self-heal. The verdict passes RAID's row. The watchdog and the Tasks feed. The wiring. |
| test-raid-runs-contract | 7/7 | unchanged |
| test-contract-phase-build | 14/14 | unchanged |
| test-chunked-phase-build | 16/16 | unchanged |
| test-gate-tracking | 4/4 | unchanged |
| test-gate-versioning | 6/6 | unchanged |
| test-recursive-split | 5/5 | unchanged |
| test-gate-assess | 5/5 | unchanged |
| test-phase-close | 7/7 | unchanged |
| test-phase-proof | 7/7 | unchanged |
| test-self-building-loop | 5/5 | unchanged |

## Not done, said
- **The verdict route has not been run end to end.** No test runs a real Idearium build of a phase with no files through
  `/phases/verdict`. The RAID side and the wiring are tested; the route's handler is not.
- **IC1 itself still needs `files:` or `conditions:`.** With them, its proof can check the work without him.
- **The plan step needs an Ollama model on the ladder.** The run said: no planner was ready.
