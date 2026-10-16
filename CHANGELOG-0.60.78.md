# 0.60.78 — 2026-10-16

James: "Next" (step 5 of his order: routing).

His 0.60.44 boot log: 63 failed syntheses and 45 parked drops, all "no real agent response (forAgent=ollama)". A parked
drop could only be cleared by hand-editing `data/officiator-attempts.json`.

This is RT1, the first slice of step 5 in `docs/2026-10-15-pipeline-focus-phasemap.spec`.

## What was wrong (read in `cortex/core/raid/officiator.js`)

1. **An agent that did not answer was charged to the drop.** Each silence spent one of the drop's tries until the drop
   was parked. It was the agent's failure, not the drop's.
2. **There was no fallback.** RAID picked an agent and was never told it failed, so it picked the same slow local model
   every tick.
3. **Parked meant forever.** Only a hand edit of the attempts file brought a drop back.

## What changed (the GT1 rule: classify before learning)

- **A drop walks RAID's ranked candidates,** up to 3, best first:
  - **a silence** moves to the next agent and teaches RAID nothing;
  - **an answer with no contract** counts against the drop, teaches RAID (`recordOutcome` false), and the next agent is
    tried;
  - **a success** teaches RAID.
- **When no agent answers, no drop is charged.** The agents wait, starting at 2 minutes and doubling up to an hour. The
  wait is persisted, so a restart keeps it.
- **Old records are released.** Records written before this release that charged a silence to a drop are cleared on the
  first tick, and the log says so.
- **A parked drop gets one more try a day.**
- **What is held back can be seen and cleared:**
  - cortex `GET /api/raid/officiator` and `POST /api/raid/officiator/unpark`;
  - the commands `idearium raid parked` and `idearium raid unpark [id]`;
  - a **RAID intake** line in Idearium's My projects, with a "Try all again" button. Idearium reads it through
    `/api/raid/held`; when cortex is down it says so.

## Proof

- `tests/modules/test-raid-officiator.js` 18/18, including OFF-BACKOFF (rewritten for the new rule) and three new tests:
  - **OFF-RT1a:** a silence charges no drop; the agents' wait persists across a restart and doubles; a pre-0.60.78
    record is released; an answer clears the wait.
  - **OFF-RT1b:** the candidates are walked in order (ollama, gemini, chatgpt). RAID learns only `gemini:false` (a
    wrong answer) and `chatgpt:true`, nothing from ollama's silence.
  - **OFF-RT1c:** `parked()` and `unpark()` work by id prefix, and `unpark('all')` clears everything.
- `tests/modules/test-projects-overview.test.js` 7/7. PJ-07 checks that cortex not answering is a 502 that says so.
- Green:
  - build-path census (still 0 bypasses)
  - warp-rung
  - intake
  - contract-intake dependency graph
  - RAID-runs-contract
  - boot-log fixes
  - loom

## Open in step 5

- **ME5:** RAID's chooser as the only chooser, across copilot and the pipeline-routing ladder.
- **A slow model is not yet routed away from.** The build ladder climbs to the next model on a failure, not on
  slowness.
