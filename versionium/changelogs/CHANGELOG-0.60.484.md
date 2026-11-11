# 0.60.484 — a pipeline run managed: pause, continue, retry (PC8 slice b)

James, 2026-11-10: "the pipeline in the automation engine in cos needs to be able to execute, or manage the pipeline. thats what its for.
seeing, changing, managing, diagnosing, exporting, testing, agnostic." · 2026-11-11: "But yes the high leverage. Need that done"

## Built
- **Pause:** the step running finishes; nothing new starts. The run's status is `paused`, and the time paused is kept (`pausedMs`).
- **Continue:** a paused run goes on where it was.
- **Retry:** a failed or stopped run is retried from its request's files.
  - What was met is not run again.
  - With `from`, that step and every step after it (by the DAG) run again.
  - A met run is not retried; it is run again.
  - An agent's retry is refused (403): retrying is a person's.
  - The decision of what runs again is Emerge's (`cos/pipeline/runs.eg` `retry_of`, `after_of`).
- **Each is a route, an event, a command and a button:**
  - `POST /api/cos/automation/pipeline-runs/:id/pause|continue`, `POST /api/cos/pipeline/runs/:id/retry { from? }`, declared in COS's contract;
  - `automation.pipeline.paused`, `automation.pipeline.continued`;
  - `cos automation pause|continue <run>`, `cos pipeline-retry <run> [--from <step>]`;
  - the Automation tab: Pause, Continue, Retry, and "from here" on each step of a failed run.

## Fixed
A waited run that failed answered "Invalid status code: failed": the run's state was used as the HTTP code (`lib/automation/routes.js`).
Found by CP-20.

## Proof
- test-orchestrator-automation 12/12 (OA-12: pause and continue in the engine).
- test-cos-pipeline 21/21 (CP-20: retry through COS; `runs.test.eg` 7/7).
- test-cos-hub 8/8 (HB-08: the buttons in Clear Glass through the real cockpit).
- HB-07 failed once in eight runs of the hub test, before the last UI change; it passed the seven after. Not reproduced, said.

## JavaScript, said
The pause is in `lib/automation/pipeline.js` (the engine, JavaScript until it is ported); no new JavaScript file. The new logic is in Emerge.

## Next in PC8
A dry run; the diagnosis view; export of a run.
