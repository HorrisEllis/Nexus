# 0.60.463 — one engine in COS; Idearium's pipeline on the canvas, a gate between every step

James, 2026-11-09: "BrainOS looks horrible. It was supposed to be the canvas remember? With only the automation tools for steps." · "Each system needs to have what it needs to function. So no, don’t move it." · "Into cos backend. One agnostic automation engine. Like stripping the features from BrainOS, its ui is bad. Also hooking in idearium. The pipeline in idearium is meant to be shown on the canvas. Gates are inbetween steps. So compartment, gate, compartment, gate."

## Decided (AE_D7, his)
- **One agnostic automation engine, in COS's backend.**
- **ERAVOS's canvas is where its steps show.**
- **BrainOS's UI goes.**

The coder's reading, to confirm: Clear Glass keeps its own engine for its browser work, so `lib/automation` is not moved out from under it.

## Found
- **BrainOS never had a backend of its own.** Its own header says it is a thin client over Clear Glass's engine.
- **Every step it offered is already in COS's engine.** BrainOS had 7 step types; the engine has 24.
- **Its other half, the agent mesh, is Clear Glass's own system,** reached by its routes.

So there is nothing to strip into the engine. BrainOS's UI is archived once its last reader moves.

## Built (backend first)
- **Idearium's build pipeline is a real `.pipeline` file in Idearium's own folder** (`idearium/pipelines/idearium-build.pipeline`). It has eight steps:
  1. what can be built now;
  2. whether a phase already covers it;
  3. the phase map;
  4. its DAG is whole;
  5. its graph;
  6. build;
  7. closed on evidence;
  8. logged in the ledger.

  Each step calls Idearium by its own route (`nexus://idearium/…`), routed by COS, with a gate after each.
- **Idearium serves it:** `GET /api/pipelines` and `GET /api/pipelines/:id`; the row `idearium-pipelines`.
- **COS's engine imports it by route:** `cos automation systems-pipelines idearium` and `cos automation import-from idearium idearium-build`. Importing is a person's act; an agent proposes it.
- **Gates stand between steps on the canvas.** A step's gate becomes its own box after the step (Emerge's `box.eg`, `with_gates`). Idearium's pipeline opens on ERAVOS's real canvas as 16 tools (8 steps, 8 gates) and 15 wires, with no faults.

## Proof
- `eg test cos/automation/test/box.test.eg`: 9/9.
- `test-pipeline-box`: 6/6. PB-06 is new: Idearium's real route, COS's import-from command, and the `.erv` in compartment, gate, compartment, gate order.
- `test-cos-hub`: 7/7.
- The canvas screenshot: `cos/ui/automation/preview/idearium-on-canvas.png`.
