# 0.60.614 — a method per step and per gate; the pipeline and gates stay agnostic

James, 2026-11-20: "Like you can set the method or framework per gate or step. Remember the pipeline and gates are agnostic." · "framework per step. or pipeline. like i want it to use my framework." · "My whole framework"

## What changed
PC2 expanded (docs/2026-11-08-pipeline-canvas-phasemap.spec).
- **Any task of any `.pipeline` names its method:** a framework by id (every step), a framework's named steps, a text, or one per gate of the step (the step's own gate names). It is data in the pipeline, editable there or on the canvas.
- **COS resolves it in Emerge** (`cos/automation/method.eg`, built to `eg-build/method.js`, loaded like ladder.eg and reuse.eg) from the `.framework` files in COS's frameworks folder (`docs/`, or `COS_FRAMEWORKS_DIR`). The step reads `{{vars.method}}` (JSON); a typed gate gets `with.method`. A method naming a framework or step that does not exist fails the task and says so; the step never runs without it.
- **The Emerge rung chooses no method.** It takes the text per gate it is given (`fill`, `diagnose`, `test`). The defaults 0.60.613 had in the rung are gone.
- **Idearium's build pipeline names his framework on its build step** (diagnose: his Sections 3 and 4; test: Section 10, the coder's reading, to confirm with him), and the build route hands it to the rung.

Measured (docs/BENCHMARKS.md): the 3b then DeepSeek ladder on the file-identity fixture passed 2 of 6 runs (1 of 2 with the test in the brief, 1 of 4 blind); the others held, said.

method.test.eg 4/4, test-pipeline-method 2/2 (new), test-emerge-rung 10/10, gaps.test.eg 10/10. test-pipelines 6/8 and test-cos-pipeline 19/21 before and after (their failures were there before this change).

## Files
- cos/automation/method.eg, cos/automation/eg-build/method.js, cos/automation/test/method.test.eg
- cos/automation/pipeline.js: a task's method kept, resolved, given to its step and its gate
- idearium/lib/emerge-rung.cjs: method per gate, given
- idearium/api/index.js: the build route takes the method
- idearium/pipelines/idearium-build.pipeline: the build step's method
- tests/modules/test-pipeline-method.test.js (new), tests/modules/run-all.js, tests/modules/test-emerge-rung.test.js
