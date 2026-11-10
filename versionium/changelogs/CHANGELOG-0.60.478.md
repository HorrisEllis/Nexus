# 0.60.478 — pipelines made on the canvas

James, 2026-11-10: "Also needs to be able to create pipelines. That’s what the canvas is for." · "This is what I mean though, I want to program it
myself using the pipeline instead of needing you."

## Built
- **The way back from the canvas** (`cos/pipeline/box.eg` `from_erv`, Emerge): an ERAVOS project's Step tools and wires become the engine's pipeline.
  - A step that came from a pipeline gives its task back unchanged (a change of kind or what it names on the canvas wins).
  - A step drawn new is made from its **kind** and what it **Names**: macro → that macro, pipeline → that pipeline, procedure, agent (its key),
    system → a command, build → a framework, tool → an engine step type (`api`, `script`, …) or a whole step as JSON.
  - A **gate** tool wired after a step is that step's gate (its Names as JSON, or text the output must contain); a deleted gate tool removes it.
  - **Wires are dependencies.** A tool that is not a step (an instrument on the same canvas) is left out, and named.
- **COS:** `POST /api/cos/pipeline/from-erv`, row `cos pipeline-from-erv <file.erv>`, and the Automation tab's Import takes `.erv`. The `.pipeline`
  node file is written first and imported from it, as every pipeline is; drawn again with the same name, the same pipeline is updated.

## Recorded
- His architecture, in his words (AE_D8, docs/2026-10-25-automation-engine-to-orchestrator-phasemap.spec): COS the front door, glue, orchestrator,
  supervisor and automation; RAID the supervisor, load balancer, compartment router, agent router and contract hub; lib for shared components, each
  system's config for them in its own data folder. Where each was already written, and what is not built (a contract per compartment, RAID as agent
  router, RAID in the COS exe).

## Proof
- `node emerge/emerge/lang/eg.js test cos/pipeline/test/box.test.eg` 14/14 (round trip pipeline → .erv → pipeline equal; drawn new; edited; re-saved
  by ERAVOS).
- `node tests/modules/test-cos-pipeline.test.js` 18/18 (CP-17: drawn → imported → in the engine with its gate and wire; updated; 422; agent 403).
- `test-pipeline-box` PB-05 fails as it did before this change.

## Not yet (PC4, a preview first)
The Step tool's own face for picking its kind and what it names (today: the Names field, kind is data), saving straight from ERAVOS to COS, and each
box lit with its live state while it runs.
