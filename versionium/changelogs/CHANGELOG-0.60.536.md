# 0.60.536 — the pipeline canvas in COS: Edit pipeline

James, 2026-11-14, with a screenshot of COS's Automation tab: "i have none of that". He was right. Since preview 7, the canvas existed only
as previews. Earlier that day: "okay. thats more like it. and this lives in the cos ui when you click edit pipeline." · "the pipeline runs in
the canvas. the workshop only edits one gate or step at a time" · "better but the tabs slide out from the side like ideariums ui." · "Vital.
The pipeline. Focus on that."

## Built (PC4 slice 1, docs/2026-11-08-pipeline-canvas-phasemap.spec)
- **✎ Edit pipeline** on any pipeline in COS › Automation opens the canvas: the look of preview 11, drawn from the real pipeline.
  - Each step is a box showing its label, its kind and where it goes.
  - Each wire is a `depends_on` link, in the engine's order.
  - Each gate is a diamond after its step, showing whether it held.
  - The latest run lights each step: done, running, failed, or waiting for him.
- **The run window** offers ▶ Run, ❚❚ Pause, ▶ Continue, ■ Stop, and ↻ Retry. Retry restarts from the selected step. These are the same
  engine functions as the page.
- **The right tabs slide out:**
  - OUTPUTS shows what a step gave, its gate's outcome, and RAID's decisions.
  - EDIT edits one step or one gate at a time: id, label, what it runs after, kind, address, method, body, other settings, and the gate's
    condition. A step or its gate can also be added or removed there.
  - RUNS lists the pipeline's runs.
- **＋ Add** makes a step after the selected one.
- **Save** writes the pipeline through COS's route. It is the same `.pipeline` file that Clear Glass's settings and the CLI edit
  (cos/spec/pipeline.spec addendum e). The engine validates it first, and a refusal is shown.
- **Esc** slides a tab back, or closes the canvas.

## Found and fixed on the way
- **Saves were lost.** COS's server read request bodies for POST and PATCH only, so a PUT reached the engine empty. The engine "saved" the
  pipeline unchanged and said ok. It now reads PUT bodies (`cos/manager/server.js`).
- **The two routes the canvas uses were not declared.** GET and PUT `/api/cos/automation/pipelines/:id` are now in COS's contract
  (`cos/manager/contract.json`).
- **The editor changed a step's kind.** Its list of kinds lacked the step's own kind (`set`), so Apply turned the step into an API call. The
  step's kind is now always offered.

## Command rows
- `cos pipeline-show <id>`: the steps, gates, wires and order the canvas draws.
- `cos pipeline-save <id> --json '{…}'`: the save, for agents and the CLI.

## Proof (in Clear Glass, never Playwright)
- `node tests/modules/test-cos-hub.test.js`. HB-11 checks:
  - Edit pipeline opens the canvas with 3 steps, 2 wires and 1 gate.
  - A double-click slides EDIT out on one step, and the label is edited.
  - Save writes the change, and the file holds the edit.
  - Run from the canvas ends with every step done and the gate showing its outcome.
  - OUTPUTS shows the step's output.
- Screenshots from that run: `cos/ui/pipeline-editor/built-canvas-edit.png`, `built-canvas-run.png`.
- Also passing: cos-console 12, cos-console-tab 4, cos-boot-and-deps 4, cos-pipeline 21, cos-automation-home 3.

## Said
- **HB-07 fails at times.** A step that takes under a millisecond gets a 0.0 ms baseline, and the page draws no bar for a zero baseline. It
  failed 2 of 5 runs here, and is not caused by this release.
- **CL-07 fails without these changes too.** It needs Guardian running.
- **The full Workshop is a later slice:** layers, a condition builder, and dry-run samples (preview 9). This slice edits a step or gate
  through plain fields.
- **The canvas is JavaScript,** as COS's pages are today (§17.13, said).
