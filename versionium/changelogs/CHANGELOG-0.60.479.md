# 0.60.479 — the build pipeline unstuck

James, 2026-11-10 (his screenshot): "it is stuck. The phase is mapped … GET http://127.0.0.1:4800/api/repos//phases/map → HTTP 404" · "need to get
the pipeline building nexus."

## Why it stuck
Idearium's build pipeline uses `{{vars.repo}}` in its addresses; Run gave no repo, so the address read `/api/repos//phases/map`, and Idearium took
"phases" for the repo. Nexus's own repo in Idearium has a uuid no pipeline can know.

## Fixed
- Idearium reads **`nexus`** (or `self`) as Nexus's own repo (the Nexus-self parent) in every `/api/repos/:uuid/...` route.
- `idearium/pipelines/idearium-build.pipeline`: `repo: nexus`. A planned phase (`cos plan`, `cos build-next`) defaults to it too.
- The engine refuses to start while a value a step's address needs is empty, and names it (`needs`); the Automation tab's Run asks for each
  and runs. Never a broken address three steps in.

## Recorded (his direction, not built)
RAID writes the beginning step (its agents think the request into the contract and the first step; RAID routes as the contract hub). COS listens
for each system's heartbeat (genesis Domain 10) instead of polling, and adds a system that starts beating. docs/2026-11-08-pipeline-canvas-phasemap.spec.

## Proof
`node tests/modules/test-cos-pipeline.test.js` 19/19 (CP-18). automation-engine 16/16, test-pipelines 6/6, test-run-pipeline 11/11, test-pipeline-box 6/6.
