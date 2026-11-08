# 0.60.451 — PC2 slice a: a procedure is a step; AE6 closed

James, 2026-11-08: "A .framework shouldn't just be a document describing what to do. It should be an executable, composable procedure with defined
inputs, outputs, contracts and execution behavior." · "No clearglass keeps its" · "Continue to get the automation done."

- **A procedure is a step.** Any workflow or pipeline can now run one of Idearium's procedures with the new step ☰ "Run a procedure".
  - COS's engine calls Idearium by its route, and the procedure's run comes back as the step's output.
  - A confirm step in the procedure waits for his yes: the run stops there and names what it is waiting on.
  - Pipelines and procedures share one chain, so a procedure can't run itself, and the depth limit (5) counts every kind together.
  - If Idearium is down, the step says so.
- **AE6 closed.** COS runs the platform's engine, and Clear Glass keeps its own, as he chose. The engine's code stays the shared kernel, because
  two systems run it.
- **Proof:** OA-08 (new) passes, and test-orchestrator-automation is 8/8. Every engine suite is green: 16, 18, 6, 7, 5, 5, and cos-hub 5.
- **Next (PC2 slice b):**
  - Idearium carries the chain on when a procedure runs a pipeline.
  - A .framework is read as a procedure.
  - Each kind exports and imports as a node.
