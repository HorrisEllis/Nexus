# 0.60.448 — PC1: one box shape, in Emerge

James, 2026-11-08: "steps as boxes, with wires as the flow into the hooks of gates as compartments. boxes can  be gates, systems, agents, macros, pipelines, tools" · "meta, autonmous, agsnotic, and nonlinear, is the goal, using emerge as the language." · "also show me the preview for the ui before building it but bottom up, first."

## What it does
- **Every step is one box shape.** It has an id, a kind, a ref, in and out hooks, a contract, a gate, and its own settings. The kinds are gate, system, agent, macro, pipeline, procedure, tool and build. Wires join a box's out hook to another box's in hook.
- **The engine's pipeline converts to boxes and back.** Its `depends_on` becomes wires, and the wires become `depends_on` again. A wire drawn on the canvas is therefore a dependency in the `.pipeline`, and there is no second store.
- **His `.procedure` converts the same way.** Its steps become boxes wired in order: a confirm step is a gate for his yes, and a check step is a gate on an earlier step's output.
- **Every fault is named:**
  - an unknown kind;
  - an id used twice;
  - a ref that names nothing known;
  - a wire to a hook that does not exist;
  - a cycle, with the ids around it.

  A kind whose refs cannot be checked here is said, not passed.

## Written in Emerge (his "using emerge as the language")
- **The component:** `cos/automation/box.eg`, a component in Emerge's own registry (CIE-EG §5), reached only through its hooks.
- **The CLI:** `cos/automation/cli.eg`. **The test:** `cos/automation/test/box.test.eg`.
- **One temporary JavaScript harness,** in the Nexus suite. Emerge has no YAML reader yet, so the harness converts the tree's YAML node files to JSON for the round trip. It goes when CIE14's parse_yaml lands.

## Proof
- `eg test cos/automation/test/box.test.eg`: 8/8.
- `tests/modules/test-pipeline-box.test.js`: 4/4. Both real files round-trip unchanged:
  - `fiverr-gig.pipeline`: 3 boxes, 2 wires;
  - `update-nexus.procedure`: 5 boxes, 4 wires.

## Also
- The map now has PC1–PC7 and his decisions PC_D1–PC_D9 (docs/2026-11-08-pipeline-canvas-phasemap.spec), with the spec at cos/spec/pipeline-canvas.spec.
- Gaps found in Emerge are logged on CIE14: no YAML reader and no folder listing.
- The canvas UI is shown to him as a preview before it is built, per his words.
