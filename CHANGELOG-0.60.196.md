# 0.60.196 — an upload that outran its wait closes and indexes; a build indexes a repo instead of refusing it

James, 2026-10-21: "now its not working, i clicked the phases to build it and got: ... the import project ui needs to close when it's
complete. "10:57 AMrefused no snapshot: repo has not been through the import pipeline (no atlas.json) — run POST /api/repos/:uuid/chunk
first" what does it need an atlas for?"

## What happened
- The upload dialog waited 30 s for the import. The server finished after the browser stopped waiting: looking-glass-bundle-v0_4 landed
  with its 55 files, but the dialog reset to "— ready" and the indexing it starts after an import never ran.
- Every build takes a Versionium snapshot first, and the snapshot records which atlas, chunk index and graph the build reads. With no
  index there was nothing to record, so SP5 was refused.

## What changed
- `idearium/api/index.js` (phase build): a NOT_INDEXED snapshot runs the import pipeline (the same runImportPipeline as POST
  /api/repos/:uuid/chunk, with its progress events), writes an `indexed` row on the run, and snapshots again.
- `idearium/ui/js/app.js` (upload dialog): waits 120 s; if the wait runs out, finds the repo by the upload's compartment, then closes,
  opens and indexes it; a real failure shows its reason, never "ready".

## Proof
- test-pipeline-root-causes 17/17: RC-16 runs the real pipeline on an unindexed repo and the snapshot record then builds; RC-17 checks
  the dialog's source (not driven in Clear Glass).
- Unchanged: test-contract-phase-build 14/14, test-phases-tab 5/5, test-approval-chain 6/6.

## On his machine
Nothing to redo: building SP5 again indexes the repo first, then builds.
