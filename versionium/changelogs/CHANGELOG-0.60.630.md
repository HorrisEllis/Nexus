# 0.60.630 — a pipeline opens at once

James, 2026-11-21: "Slow to open. A pipeline's details wait about 10 seconds on the step-timing data before anything draws. Optional data is holding up the main screen, which is a bug."

## What changed
- **cos/ui/automation/engine.js** `open()`: the steps and buttons draw as soon as the pipeline and its last run are read. The step baseline (GET /api/cos/pipeline/baseline, ~10 s on the server for the Idearium build pipeline's 47 runs) is fetched after and redraws the bars if that pipeline is still open; the last baseline read is kept per pipeline, so reopening shows bars at once.

## Measured
Served from the worktree (COS UI on 7798, his live COS on 7797 unchanged): clicking "Idearium build pipeline" drew its steps in 124 ms (before: ~10 s, the baseline route timed at 10.4 s); the 7 bars ("baseline 3.7 s ± 7.6 s over 47 runs") arrived after.

## Not changed
The baseline route itself is still ~10 s (cos/pipeline/index.js baseline(): 200 runs through Emerge's baseline.eg). Making it fast is PC8's next step, said, not done here.
