# 0.60.609 — a step stands only if its run ended ok

James, 2026-11-19: "any gate that has passed. Doesn't need to be run again." · "get it working"

## What changed
a step stands for reuse only if the run it passed in ended ok: NM1a's build step "passed" its gate (the build started) in runs whose build never landed, and four later runs reused it and asked no model, the last after COS restarted mid-run and resumed on its own. reuse.eg now refuses a step whose run ended anything but ok, saying how it ended. Also brought COS's running folder to the current engine (pipeline.js was 0.60.600, routes.js 0.60.590, cli.js 0.60.597; it could not fast-forward). reuse.test.eg 3/3; test-pipeline-waits-for-a-system 12/12.

## Files
- cos/automation/pipeline.js: the reuse index by fingerprint, the link across pipelines
- cos/ui/automation/engine.js (0.60.599): the Pipelines tab opens the gates
- tests/modules/test-pipeline-waits-for-a-system.test.js: PW-11
