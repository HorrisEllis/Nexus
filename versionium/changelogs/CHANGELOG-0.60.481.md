# 0.60.481 — PC8 slice a: each pipeline step measured; RAID's decisions shown as steps

James, 2026-11-10: "the pipeline in the automation engine in cos needs to be able to execute, or manage the pipeline. thats what its for.
seeing, changing, managing, diagnosing, exporting, testing, agnostic. ... record each step in raids decision, dynamically building each step,
as it goes. it all needs to be visable." · "each step measured by a delta, which could be used for the timing in between each step
agnostically, to establish a baseline." · "each step can be used as a progress status, with an indicator or bar." · "do it. build it."

The direction and the order are his (PC_D13: the pipeline works first, then COS is optimised). The code is the coder's.

## Built (docs/2026-11-08-pipeline-canvas-phasemap.spec PC8, slice a)
- **Each step's delta.** The engine (`lib/automation/pipeline.js`) keeps when a step started and finished, beside its own time (`ms`). It also
  keeps its `waitMs`: the delta between it and the steps it waits on.
- **A baseline per step, in Emerge.** `cos/pipeline/baseline.eg` reads the saved runs and gives each step:
  - its mean;
  - its sigma, but only from three runs (his "Three = an invariant (not a fact)"; below three, null, never a guess);
  - its latest delta, and how far that is from the baseline (z);
  - the same for its wait.

  It is served at `GET /api/cos/pipeline/baseline?pipeline=<id>` (declared in the manager's contract, so the cockpit forwards it) and by the
  command `cos pipeline-baseline <id>`.
- **RAID's decisions as steps.** When an agent step runs, RAID's choice (what was asked, what it chose, the command, why, when) comes back
  with the answer. The run keeps it on the run (`decisions`) and on its step, and streams `automation.pipeline.decision` as it happens. RAID
  down is said in the decision, never hidden.
- **The Automation tab:**
  - a bar per step against its baseline (a running step grows toward its usual time);
  - the baseline and the wait in words;
  - "slower" or "faster than usual" past 2 sigma;
  - RAID's decisions under the step they were taken in.

  Durations under a second show in milliseconds.
- **SC16:** the two calls COS's pipeline module makes to Emerge are now started hidden on Windows.

## Proof
- `cos/pipeline/test/baseline.test.eg` 4/4.
- `test-orchestrator-automation` 11/11:
  - OA-10: RAID's decision returned, and RAID down said;
  - OA-11: a real run keeps start, finish and wait, and the decision becomes a step, kept and streamed.
- `test-cos-pipeline` 20/20. CP-19 runs end to end through COS's door: no sigma below three runs, a sigma and a z from three, the wait's
  baseline, a 400 without a pipeline, and the command row.
- `test-cos-hub` 7/7. HB-07, in Clear Glass, requires the page to show each step's bar and "over 3 runs".
- Automation suites (engine 16, v2 18, nodes 8, registry 11, settings UI 8), the module's Emerge suites (box 14, framework 8, gate 8, runs 6),
  and the 8 suites that read COS's contract are green.

## Found on the way
- The cockpit forwards only the routes in the manager's contract. The page saw nothing until the route was declared there: the contract doing
  its job.
- Emerge still has no `?:` (noted).

## Next (PC8)
Pause, resume and retry; a dry run; the diagnosis view; export of a run. Then COS optimised (PR6, PR4, CP6).
