# 0.60.581 — a failed run resumed (FX1a)

James, 2026-11-18: "i want the automation and pipeline built. commands, first, api routes, then the door/drawbridge to expand the ui."

## What changed
FX1a, a failed run resumed: `pipeline-resume <run> [redo,steps]` in COS's console, then POST /api/cos/automation/pipeline-runs/:id/resume. What the run finished is met from its step nodes, the rest run; named steps run again. Found running NM1: the build was still going in Idearium when the run failed after it, and a fresh run would have started a second DeepSeek build. Also, data not code: the NM1 pipeline gained its missing "landed" step (waits for the build to end) and step limits of 10 min (build 60 min) in place of 30 s. test-pipeline-waits-for-a-system 7/7 (PW-07 new). test-cos-pipeline 19/21: CP-00 and CP-01 fail in cos/pipeline/ (not touched here; last changed in 0.60.575): open, not checked against the release before.

## Files
- cos/automation/pipeline.js: resume(runId, { by, redo })
- cos/automation/routes.js: POST pipeline-runs/:id/resume
- cos/manager/cli.js: pipeline-resume
- tests/modules/test-pipeline-waits-for-a-system.test.js: PW-07

## Not done
COS takes it after `restart cos` (his act). The door (FX6) and the rest of FX1 (step add/set/remove/move) are next.
