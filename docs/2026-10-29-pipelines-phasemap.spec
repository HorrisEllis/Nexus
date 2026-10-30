# Pipelines: tasks in a dependency graph, each one automation (macros, workflows, agents, commands), run as a checklist (2026-10-29)

origin: >-
  James, 2026-10-29: "making a pipeline and workflow feature and include the macros and automation". Earlier that day: "For automation of
  macros, Tasks in a dependency graph as a checklist?" · "also the automation orchastroation from orchastrator? different agents? etc. i
  need" (cut off). The coder's reading, to confirm: a pipeline is tasks with dependencies, each one of the automations he already has
  (a macro, a workflow, a question to any agent, a Nexus command, a browser step), each gated, shown as a checklist while it runs.

spec: docs/automation-pipelines.spec
status: "PL1–PL4 built 0.60.284"

## Grounded (read from the code, 2026-10-29)
- The automation engine is core (lib/automation/engine.js, AE1 0.60.256); each system runs its own instance: Clear Glass's has the
  browser, macro and agent hooks wired (clear-glass/src/main/index.js serves its /automation/* on :7704), the orchestrator's serves the
  same door on :9000 but its browser/macro port (AE2) and agent routing (AE3) are still open
  (docs/2026-10-25-automation-engine-to-orchestrator-phasemap.spec).
- A workflow is a sequence of steps (with if, for each, run another workflow). Steps already include: run a macro, run another workflow,
  ask an agent (agentKey: Claude, ChatGPT, DeepSeek …), call a Nexus system, browser actions. engine.runStep(step, { vars }) runs any one.
- Nothing has tasks with dependencies, a gate on a task's output, or a checklist run.

decisions:
  PL_D1_a_task_is_one_engine_step:
    status: DECIDED 2026-10-29 by his axioms
    chosen: >-
      A task is one engine step (any catalogue type), run by engine.runStep; pipelines add only the dependency graph, the gate on output,
      retries, blocking, and the checklist. Macros, workflows, agents and commands are included because they are already steps.
    by_the_axioms: "§8.6 reuse before build (one engine, one catalogue); §5.15 one owner per capability"
  PL_D2_pipelines_live_in_the_engine_that_runs_them:
    status: DECIDED 2026-10-29 by his axioms
    chosen: >-
      Pipelines are stored and run by an engine instance, beside its workflows and runs (its own namespace, as AE1 set): Clear Glass's
      for pipelines with browser steps and macros (the only instance with those hooks today), the orchestrator's for platform ones once
      AE2/AE3 land. The screen is Clear Glass's Settings › Pipelines (its automation UI); commands reach Clear Glass's door.
    by_the_axioms: "§5.15 (AE1: each system runs its own instance); §1.2 the orchestrator's missing browser port is said, not hidden"
  PL_D3_reading_to_confirm:
    status: "OPEN — his words read by the coder; to confirm"
    chosen: >-
      "pipeline and workflow feature": pipelines over the workflows he has; "different agents": an agent task names its agent; "from
      orchastrator": the orchestrator runs pipelines once AE2/AE3 give it the browser and agents — not built here.

  # 2026-10-30 — his, after "gates are for the pipelines for macro atuomation" (the ADDENDUM at the end of this map)
  PL_D4_a_gate_is_a_pipeline_block:
    status: "DECIDED — his, 2026-10-30 (\"gates are for the pipelines for macro atuomation\"); supersedes the coder's 0.60.292 reading"
    chosen: >-
      A gate is a step condition in a pipeline, a workflow or a macro, which the flow waits on; made on any element with the picker, per site
      or page. 0.60.292's automatic read-back inside every driver and DOM write is archived (_archive/2026-10-30-write-gates/).
  PL_D5_per_site_pipelines:
    status: "DECIDED — his, 2026-10-30 (\"with the option for per site pipelines\")"
    chosen: >-
      A pipeline may name its site (origin or pattern) and run when a page of it opens; a site's Site settings can turn pipelines off. The
      coder's reading of "option": a pipeline without a site works everywhere, as before (to confirm).
phases:
  PL1_pipeline_core:
    status: DONE 0.60.284
    depends_on: [PL_D1_a_task_is_one_engine_step, PL_D2_pipelines_live_in_the_engine_that_runs_them]
    files: [lib/automation/pipeline.js]
    spec: docs/automation-pipelines.spec
    blocks: [MOD-PIPELINE]
    does: "validate, layers, gateOpen, Pipelines (store, run with parallel, gates, retries, blocking, the checklist saved as it changes)"
  PL2_pipeline_door:
    status: DONE 0.60.284
    depends_on: [PL1_pipeline_core]
    files: [lib/automation/routes.js]
    spec: docs/automation-pipelines.spec
    blocks: [MOD-PIPELINE-ROUTES]
    does: "/automation/pipelines* and /automation/pipeline-runs* on every engine instance"
  PL3_pipeline_commands:
    status: DONE 0.60.284
    depends_on: [PL2_pipeline_door]
    files: [idearium/cli/route-commands.js]
    spec: docs/automation-pipelines.spec
    blocks: [MOD-PIPELINE-COMMANDS]
    does: "pipeline list | show | run | runs | run-status, through Clear Glass's door; agents have them through nexus.command"
  PL4_pipelines_screen:
    status: DONE 0.60.284
    depends_on: [PL2_pipeline_door]
    files: [clear-glass/renderer/settings/sections/pipelines.js, clear-glass/renderer/settings/sections/pipelines.css, clear-glass/renderer/settings.html]
    spec: docs/automation-pipelines.spec
    blocks: [MOD-PIPELINE-UI]
    does: "Settings › Pipelines: list, editor, run, checklist"
  PL5_orchestrator_runs_pipelines:
    status: OPEN
    depends_on: [PL2_pipeline_door, AE2_browser_driver_port, AE3_the_engine_door]
    files: [orchestrator/automation/index.js]
    spec: docs/automation-pipelines.spec
    blocks: [MOD-PIPELINE-ORCHESTRATOR]
    does: "the orchestrator's engine runs pipelines with macros and browser steps (through AE2) and agent tasks through RAID (AE3)"


## ADDENDUM 2026-10-30 — PL6–PL11: gates are pipeline blocks; macros, workflows and pipelines linked; per-site pipelines
James, 2026-10-30, after 0.60.292 put an automatic read-back into every driver write: "what? gates are for the pipelines for macro
atuomation" · asked why it was misread: "considering what the context of what i proposed., and the request. why, did you misread me? i also
told to stop thimnking so fucking narrow" · then: "yes. i want that with the option for per site pipelines. make sure macros, automations,
and pipelines are interconnected. i build bottom up, and interconnected, and compound leverage"
What a gate is, in his record: "fiverr working with gates for each step, each gate can be like blocks." · "gating for each step, that way it
can continue to a new page." (2026-10-28, FP3) · KB4 (2026-10-29) step gates in macros and automation · PL (0.60.284) a task's gate.
A gate is a block in a pipeline: a condition the flow waits on before the next step. The coder read "gated" from its own last task (a
read-back) and "universal" as "lower in the stack" instead of "available everywhere"; recorded in docs/2026-10-28-gated-flows-phasemap.spec.
Decided by his axioms: bottom up (§3.3, his words): the gate → the gate step → pipeline/macro gates → the links → per-site; §8.6 one gate step
serves workflows and pipelines (a task is an engine step, PL_D1); one engine and one store (PL_D2); §5.15 the engine (lib) reaches the page
only through Clear Glass's driver action, never its code.
(PL_D4 and PL_D5 are with the map's other decisions, at the top.)
phases_pl6:
  PL6_the_gate_step:
    status: BUILT 0.60.293
    depends_on: [PL_D4_a_gate_is_a_pipeline_block, PL1_pipeline_core, UG1_one_gate_for_every_element]
    files: [lib/automation/engine.js, lib/automation/steps.js, clear-glass/src/driver/index.js]
    spec: docs/automation-pipelines.spec
    blocks: [MOD-GATE-STEP]
  PL7_pipeline_tasks_gated_on_elements:
    status: BUILT 0.60.293
    depends_on: [PL6_the_gate_step]
    files: [lib/automation/pipeline.js]
    spec: docs/automation-pipelines.spec
    blocks: [MOD-PIPELINE-ELEMENT-GATE]
  PL8_macro_steps_gated_on_elements:
    status: BUILT 0.60.293
    depends_on: [PL6_the_gate_step, KB4_gates_on_macro_steps]
    files: [lib/agent-tools/tools/clear-glass/macro.js, lib/agent-tools/tools/clear-glass/gate-eval.js]
    spec: docs/automation-pipelines.spec
    blocks: [MOD-MACRO-ELEMENT-GATES]
  PL9_macros_workflows_pipelines_linked:
    status: BUILT 0.60.293
    depends_on: [PL6_the_gate_step, PL2_pipeline_door]
    files: [lib/automation/engine.js, lib/automation/steps.js, clear-glass/src/ipc/bridge.js, lib/agent-tools/tools/browser/browser-action.js]
    spec: docs/automation-pipelines.spec
    blocks: [MOD-LINKS]
  PL10_per_site_pipelines:
    status: BUILT 0.60.293
    depends_on: [PL_D5_per_site_pipelines, PL1_pipeline_core]
    files: [lib/automation/pipeline.js, lib/automation/routes.js, clear-glass/src/site-settings/keys.js, clear-glass/src/site-settings/readers.js, clear-glass/src/main/index.js]
    spec: docs/automation-pipelines.spec
    blocks: [MOD-PIPELINE-SITE]
  PL11_screens_for_gates_and_sites:
    status: BUILT 0.60.293
    depends_on: [PL7_pipeline_tasks_gated_on_elements, PL9_macros_workflows_pipelines_linked, PL10_per_site_pipelines, PL4_pipelines_screen]
    files: [clear-glass/renderer/settings/sections/pipelines.js]
    spec: docs/automation-pipelines.spec
    blocks: [MOD-PIPELINE-SITE-UI]
