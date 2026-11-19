# 0.60.594 — a step whose gate passed is not run again

James, 2026-11-19: "Wait pipeline. Yaml file. Each block a step in the pipeline? Then any gate that has passed. Doesn't need to be run again. Reuses the same step. Like each step is a node in an associative lattice, or linear. Like the node for the step holds all the context, like a block in the yaml file or a compartment. Keep getting the pipeline built."

## What changed
a step whose gate passed is not run again: the pipeline was already a YAML node (.pipeline, each task block a step) and every step run already its own .process_step node with its whole output; now each step's inputs are a fingerprint (its step, its gate, the run's vars, what it takes from the steps before), and a step whose gate passed with the same fingerprint in an earlier run is reused: that node stands, its output read back, the step marked reused (from which run). Only a gated step is reused (a step with no gate, as NM1's build, always runs); new inputs, a failed or debug pass, reuse: false on the step, or redo run it again. The decision is Emerge's (cos/automation/reuse.eg, compiled to eg-build/reuse.js, run in the engine); the index of passed steps sits beside the runs (reuse-index.json). reuse.test.eg 2/2; test-pipeline-waits-for-a-system 10/10 (PW-10 new); test-cos-pipeline 19/21 with CP-16 intermittent (failed once, passed once, as before this change).

## Files
- cos/automation/reuse.eg, cos/automation/test/reuse.test.eg (Emerge); cos/automation/eg-build/reuse.js (eg build)
- cos/automation/pipeline.js: the fingerprint, the reuse, the index, redo carried into a run
- tests/modules/test-pipeline-waits-for-a-system.test.js: PW-10

## Not done
COS loads it at its next restart. The lattice view of step nodes (his "associative lattice, or linear") is mapped.
