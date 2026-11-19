# 0.60.590 — edit a gate's conditions; a debug setting per gate (Emerge)

James, 2026-11-18: "Just add the ability to edit gates conditions. Not whole runs. Maybe even a debug gate type or setting? Emerge. Please stop using js. Unless it's cheaper"

## What changed
a gate's conditions edited in place, and a debug setting per gate: (1) `pipeline-gate <pipeline> <task> debug | enforce | key=value | -key` in COS's console, PATCH /api/cos/automation/pipelines/:id/tasks/:task/gate { set, unset, gate }; a typed gate's conditions go into its with; saved through the pipeline's own validation. (2) debug: true on a gate: a typed gate is decided in Emerge as always (cos/pipeline/gate.eg), its verdict kept (context, history, streak), and it answers open with would = what it decided and why "debug: would be closed — …"; a keys gate, or a step that fails outright, under a debug gate is recorded the same way and the steps after it run. Any run with such a record ends "debugged", never ok. The decision is Emerge's; the JS added is the edit route and command (HTTP plumbing) and one condition on the engine's failure path, cheaper than a call to Emerge per failure. gate.test.eg 11/11 (the debug test new), stall 2/2, runs 7/7, box 14/14, profile 2/2; test-pipeline-waits-for-a-system 9/9 (PW-09 new); test-cos-pipeline 19/21 (CP-00, CP-01 failed before).

## Files
- cos/pipeline/gate.eg, cos/pipeline/cli.eg, cos/pipeline/test/gate.test.eg (Emerge)
- cos/automation/pipeline.js (setGate; debug on the failure path; debug a gate key), cos/automation/routes.js, cos/manager/cli.js
- tests/modules/test-pipeline-waits-for-a-system.test.js: PW-09

## Not done
COS loads it at its next restart. The whole-run "gates open" (0.60.589) stays; per gate is the usual way.
