# 0.60.457 — the pipeline's tool is ERAVOS's AI Automation Box; no kinds shown; each step in its own words

James, 2026-11-08: "also no need to show kinds in the ui. stop doing that. adding noise to the ui" · "also pricing?" · "Also isn’t ai automation a domain already." · "The ui is meant to dynamically change in relation to the kind. Show me the ui for the workshop" · "I liked the uploaded screenshot. 3d. Is it like that? So why not use that domain? Yes. Follow the spec."

## What changed
- **ERAVOS (PR #140, merged):** the Box now lives in AI Automation, ERAVOS's existing automation domain, as `eravos.agents.box`. The separate Orchestration domain is gone.
  - The step's Workshop reshapes to each step. What the step carries is in play, the most first; what it doesn't carry drops to not in play, with the reason. It is worked out from the step's data, never from a list of kinds.
  - No kind is shown anywhere.
- **Nexus:**
  - `box.eg` writes `eravos.agents.box` into the `.erv`.
  - Every box carries the step's own label, for example "Scope & Pricing: each package" instead of its type, "workflow".
  - COS's Pipelines page shows no kind word.

## Proof
- `eg test cos/automation/test/box.test.eg`: 9/9.
- `test-pipeline-box`: 5/5.
- ERAVOS: Box 4/4; its tests 3/3; P153 2/2; Workshop 7/7; AI Step 4/4; boundary 10/10.

## Said
The 3D studio layout he liked is in the Workshop spec's later phases. The flat Workshop is what is built.
