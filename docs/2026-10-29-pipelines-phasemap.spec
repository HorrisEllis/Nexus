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
