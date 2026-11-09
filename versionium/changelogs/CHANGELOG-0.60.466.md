# 0.60.466 — the pipeline module, in Emerge: gates that learn, and every request kept as files until met

James, 2026-11-09:
- "This is a major feature of nexus. Like huge. This can make debugging, contracts being built. The process that the system uses, copilot uses for
  its tools, this makes all of nexus programmable. Also visual debugging, emerges coding per gate. Gates can hold context, test, verify, gates
  would do a lot. But not the same everytime."
- "Also log this somewhere. So it doesn't get burried. I feel like most of my big ideas get lost. Spec it." · "Okay. So build this."
- "The gates are temporary unless it didn't finish." · "No. Terrible folder structure. This needs to be a module."
- "Needs to use actual physical files in the backend, the steps. Like the dag and contract, and the relevant nodes. Like each step needs to be
  persistent until the contract and conditions for the request from the dag have been met."
- "follow claude.md i thought we chose to move on and use .eg, emerge for code?"

## His idea, specced whole so it is not lost
- `cos/spec/pipeline-canvas.spec` ADDENDUM 2026-11-09: the visual canvas makes all of Nexus programmable. It covers visual debugging,
  contracts being built, Emerge coding per gate, and gates that hold context, test, verify and are not the same every time.
- `cos/spec/cos.spec` points to it.

## Built: one module, `cos/pipeline/`, in Emerge
- **`box.eg`:** the box shape. It moved here and gained the `dag` hook.
- **`gate.eg`:** a gate decides open, closed or gap from:
  - its checks: `holds`, `answer` (an owner's route), `changed`, or a check marked gap;
  - what it holds;
  - what it was told.

  The same reason closing it again and again becomes a gap. It also covers what each action means for the run, and the gate type files.
- **`runs.eg`:** a request is files before it runs, and stays files until its contract is met:
  - `run.run`: the request and its contract;
  - `dag.dag`: the DAG;
  - `steps/<t>.step`: one per step;
  - `gates/<t>.gate`: one per gate, for this request only.

  When the request is met, its gates are removed and the folder moves to `done/`. When it isn't met, it stays and resumes from its step files,
  and what was met is not run again. A gate's learning reaches the next request through the step files, so gates stay temporary.
- **`cli.eg`:** the module's one command line.
- **`types/*.gatetype`:** check, test, verify, context, emerge, options.
- **`registry.json`:** the module's own registry. It defines `.gatetype`, `.run`, `.dag`, `.step` and `.gate`.
- **`index.js`:** the one door. It starts Emerge, makes a gate's HTTP calls, and takes the engine's events in order. It holds no logic.
- **Moved in:** `cos/automation/` and `cos/manager/boxes.js`.
- **Rewritten in Emerge:** a JavaScript `gates.js` and `runs.js` written earlier the same day.
- **The engine:** a typed gate is the host's to decide (`gateFn`). `run(id, { done, meta })` resumes a request. The task event carries what passed
  and each verdict, for the canvas's wires.
- **COS:**
  - routes: `/api/cos/gate-types` (list, read, make, try) and `/api/cos/pipeline/requests` (ask, list, read, resume);
  - command rows: `cos gate-types`, `cos gate-try`, `cos request`, `cos requests`, `cos request-show`, `cos request-resume`.

  Running and resuming a request are his; an agent proposes.
- **Emerge grew folders:** `list_dir`, `path_exists`, `make_dir`, `move_path`, `remove_path`.
  - `MAP.md` and the native checker's environment were regenerated.
  - `native/bin/emerge` was rebuilt with itself (stage 1 = stage 2).

## Proof
- `node tests/modules/test-cos-pipeline.test.js`: 8/8, against real COS routes with stand-in systems.
- `eg test cos/pipeline/test/{box,gate,runs}.test.eg`: 10/10, 7/7, 4/4.
- `test-pipeline-box`: 6/6.
- Emerge: lang 166/166, differential 19/19, selfhost 16/16, native 109/109.
- Engine and COS tests unchanged (automation-engine, v2, pipeline-gates, cos-hub, cos-ui, cos-deploy, cos-console, cos-settings).

## Open
- **PC5b:** his choice of options resumes a held request; branch; notify.
- **PC4 live:** the canvas reads a request's files and events. It needs his decision on letting ERAVOS's address reach COS.
- **"Rules and macros":** what he meant is asked of him.
