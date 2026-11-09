# 0.60.475 — the pipeline builds Nexus: each phase planned into its own .pipeline, end state first

James, 2026-11-09: "Like we need this pipeline able to build nexus. It's end state first reasoning. My framework at every level" · "Okay just needs to
use the pipeline automation engine we built. Using a .pipeline. They build upon request, dynamically".

## Read first
- **Nexus's self-building loop (SL0–SL11)** exists, built 2026-10-23 and 24, but was never measured (SL6 is open). It ran as Idearium's own loop,
  not on today's engine.
- **Idearium's queue** has 2,637 phases: 1,531 open, 265 buildable now.
- **Neither the queue nor a phase's `.phase` file** carries what a phase does or its proof.

## Built
- **Idearium:** `GET /api/phases/one?key=<map>::<id>` returns one phase whole: what it does, its files, what it waits on, its proof (the end
  state), and its block as written. Command row `phases one`.
- **`cos/pipeline/plan.eg` (Emerge)** plans a phase into its own `.pipeline`, end state first:
  1. The phase's proof is the pipeline's `endState`, which becomes the RAID contract's outcome, booked before any step runs.
  2. context: Idearium's context finder, giving a `.context`.
  3. His framework, when asked.
  4. Its DAG.
  5. The build: one step per planned file when asked (`chunks`), so one chunk at a time.
  6. Closed on evidence.
  7. The ledger.

  Each step is an Idearium route, with a gate after it.
- **COS:**
  - `POST /api/cos/pipeline/plan` plans a phase, and with `run`, runs it.
  - `POST /api/cos/pipeline/build-next` takes the next phase Nexus can build, plans it and runs it. This is the pipeline building Nexus, one
    request at a time.
  - Command rows `cos plan` and `cos build-next`. Running is his; an agent proposes.
- **The engine** keeps a pipeline's `endState`.
- **AE_D8** is recorded as his direction, to confirm: RAID is the hub of what and whether, COS of how and where, and Idearium builds.

## Proof
- `node tests/modules/test-cos-pipeline.test.js`: 16/16. CP-15 covers:
  - a phase planned end state first;
  - one build step per file with `chunks`;
  - `build-next` running the next ready phase to met, with RAID's contract carrying the phase's proof as its outcome;
  - Idearium's real `phases/one` serving a real phase whole.
- The engine, the build queue, the phase ledger, and the pipeline and Clear Glass tests all pass, unchanged.

## Open
- The loop: `build-next` again until nothing is ready, and counting it (SL6).
- The live run on his machine, with the web agents through Guardian.
