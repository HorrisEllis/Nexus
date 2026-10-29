spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # automation-pipelines.spec — pipelines: tasks in a dependency graph, each one automation step (a macro, a workflow, an agent, a
  # Nexus command, a browser action …), each gated on what it gave, run as a checklist.
  # Format: emerge's module spec (lib/emerge/SPEC_COMPILER.spec), compiled by lib/emerge/compiler/kg-builder.js at specDepth 1.0
  # (tests/modules/test-substrate-spec.test.js). Phases: docs/2026-10-29-pipelines-phasemap.spec (`blocks:` name these modules).
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        automation-pipelines
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-29T00:00:00Z
    status:      specced
    uuid:        nexus-automation-pipelines-spec-v1-0000-2026-1029-jamesbrooks-001
    origin: >-
      James, 2026-10-29: "making a pipeline and workflow feature and include the macros and automation". Earlier the same day: "For
      automation of macros, Tasks in a dependency graph as a checklist?" and "also the automation orchastroation from orchastrator?
      different agents? etc." The idea is his; the coder's reading (to confirm) is that a pipeline is tasks with dependencies, each one
      of the automations he already has, each agent its own, shown as a checklist while it runs.
    purpose: >-
      One place to chain what Nexus can already do: a macro, a workflow, a question to any agent, a Nexus command, a browser action. Each
      task waits for the tasks it depends on, runs as one step of the existing engine (nothing re-implemented), is checked by its gate,
      retried, and its result is passed on. A run is a checklist: what is done, running, waiting, failed, and what was blocked by it.
    target_runtime: [node]
    language_stack: [javascript]
    paradigm: [SISO, dependency-graph, gated, reuse-first]
    axioms: ["§3.3 map before build", "§8.6 reuse before build", "§1.2 nothing fails silently", "§5.15 sovereignty: the engine's",
      "§0.3 archived, never deleted", "USER_AUTONOMY: his reading to confirm"]
    deps:
      - { name: js-yaml, version: ">=4.1.0", required: false, purpose: "the .pipeline node file (a later phase)" }

    constraints:
      - id: PL-001
        description: "A task is one engine step (lib/automation/steps.js type) run by AutomationEngine.runStep; no step kind is implemented twice."
        type: hard
        enforced_by: [GATE-PL-ONE-ENGINE]
      - id: PL-002
        description: "A pipeline with a cycle, a dependency on a task that does not exist, a duplicate id, or an unknown step type is refused before it runs, with every problem named."
        type: hard
        enforced_by: [GATE-PL-VALID]
      - id: PL-003
        description: "A task whose dependency failed is blocked, never run; the run says which dependency blocked it."
        type: hard
        enforced_by: [GATE-PL-BLOCKED]
      - id: PL-004
        description: "Every run is kept (its tasks, statuses, attempts, outputs in preview, errors); a deleted pipeline is archived."
        type: hard
        enforced_by: [GATE-PL-KEPT]

  schemas:

    - id: Pipeline
      name: Pipeline
      description: "A named set of tasks with dependencies, run by an automation engine instance."
      fields:
        id:          "string — uuid"
        name:        "string — 1..80 characters"
        description: "string — optional"
        vars:        "object — starting variables, read by tasks as {{vars.x}}"
        settings:    "object — { parallel: 1..4 (tasks at once, default 1), timeoutMs }"
        tasks:       "Task[] — at least one"
        archived:    "boolean — true once deleted (kept, out of the list)"
        createdAt:   "number — epoch ms"
        updatedAt:   "number — epoch ms"
      behavioral_contracts: ["valid only when validate() returns no problems", "names are not unique keys; ids are"]
      error_paths: ["no tasks → refused", "name missing → refused"]

    - id: Task
      name: Task
      description: "One step of the engine, its dependencies, its gate and its retries."
      fields:
        id:         "string — unique in the pipeline, letters digits _ - (used in {{tasks.<id>.output}})"
        label:      "string — what the checklist shows"
        depends_on: "string[] — task ids that must be done first"
        step:       "object — an engine step: { type, config } (macro, workflow, agent, command, browser, http, …)"
        gate:       "TaskGate — optional; default: the step returned ok"
        retries:    "number — 0..5, default 0"
        onFail:     "string — stop (default: the run fails, dependents blocked) | continue (dependents still blocked, the rest go on)"
      behavioral_contracts: ["a task sees {{tasks.<dep>.output}} for each task it depends on"]
      error_paths: ["unknown step type → refused at validate", "depends_on names a missing task → refused"]

    - id: TaskGate
      name: TaskGate
      description: "What a task's output must show for the task to count as done."
      fields:
        notEmpty: "boolean — the output is not empty"
        contains: "string — the output (as text) contains this"
        equals:   "string — the output (as text) equals this"
        matches:  "string — a regular expression the output (as text) matches"
      behavioral_contracts: ["every key given must hold", "a closed gate is retried like a failed step"]
      error_paths: ["an invalid regular expression → refused at validate"]

    - id: PipelineRun
      name: PipelineRun
      description: "One run of a pipeline: the checklist."
      fields:
        id:         "string — uuid"
        pipelineId: "string"
        status:     "string — running | ok | failed | cancelled"
        tasks:      "object — id → { status: waiting|running|done|failed|blocked, attempts, ms, output (preview), error, blockedBy }"
        order:      "string[][] — the layers: tasks in one layer depend only on earlier layers"
        startedAt:  "number"
        finishedAt: "number | null"
      behavioral_contracts: ["saved as it changes, so a checklist can be read while it runs"]
      error_paths: ["the engine down mid-run → the running task fails with the reason"]

  interfaces:

    - id: IF-ENGINE
      name: automation-engine
      path: lib/automation/engine.js
      description: "The neutral automation engine (AE1); each system runs its own instance with its own hooks (Clear Glass: browser, macros, agents)."
      exports: ["AutomationEngine#runStep(step, { vars }) → { ok, output, error }", "AutomationEngine#_busEmit(type, data)", "RUNS_DIR, WORKFLOWS_DIR"]
      behavioral_contracts: ["runStep runs any catalogue step with the instance's hooks"]
      error_paths: ["a step whose hook is missing fails with the reason (browser steps need Clear Glass running)"]

    - id: IF-STEPS
      name: automation-steps
      path: lib/automation/steps.js
      description: "The step catalogue and its validation."
      exports: ["byType: Map", "validateStep(step) → problems[]"]
      behavioral_contracts: ["the catalogue is the one list of step kinds"]
      error_paths: ["unknown type → a problem named"]

    - id: IF-ROUTES
      name: automation-routes
      path: lib/automation/routes.js
      description: "The /automation/* door, served by every engine instance (Clear Glass :7704, the orchestrator :9000)."
      exports: ["handle(A, req, deps) → { status, body } | null"]
      behavioral_contracts: ["local pages only, except webhooks"]
      error_paths: ["engine not ready → 503"]

  modules:

    - id: MOD-PIPELINE
      name: pipeline
      uuid: nexus-automation-pipeline-v1-0000-2026-1029-001
      path: lib/automation/pipeline.js
      phase: PL1_pipeline_core
      description: >-
        validate(pipeline) checks ids, dependencies, cycles, step types and gates; layers(pipeline) orders tasks into layers. Pipelines
        (one per engine) keeps pipelines and runs as JSON beside the engine's workflows and runs (its own namespace), and run(id) runs
        each ready task through engine.runStep with the pipeline's vars and the outputs of its dependencies, up to settings.parallel at
        once, gates each, retries, blocks dependents of a failure, and saves the checklist as it changes.
      deps: [{ name: automation-engine }, { name: automation-steps }]
      schema_refs: [Pipeline, Task, TaskGate, PipelineRun]
      exports:
        - "validate(pipeline, { stepTypes }) → { ok, problems[] }"
        - "layers(pipeline) → string[][]"
        - "gateOpen(gate, output) → { open, why }"
        - "class Pipelines(engine, { dir }) — list(), get(id), create(p), update(id, patch), archive(id), run(id, { vars }), cancel(runId), runs(pipelineId), getRun(runId)"
      gate_pipeline:
        - "GATE-PL1-001: pipeline → validate; problems → refused (PL-002)"
        - "GATE-PL1-002: layers → the ready set: waiting tasks whose dependencies are all done"
        - "GATE-PL1-003: task → engine.runStep(step, { vars: { ...vars, tasks } }) → gateOpen → done | retry | failed"
        - "GATE-PL1-004: failed → its dependents blocked (blockedBy), onFail stop ends the run after the running tasks"
        - "GATE-PL1-005: every change → the run saved and automation.pipeline.task emitted"
      behavioral_contracts:
        - "two tasks with no order between them may run together only when parallel > 1"
        - "an output passed on is the step's own output, unchanged"
      error_paths:
        - "the store cannot be written → the run still returns, with saveError said"
      acceptance:
        - "a → (b, c) → d runs a, then b and c, then d; d sees b's and c's outputs"
        - "a closed gate retries up to retries, then fails; its dependents are blocked and named"
        - "a cycle and a missing dependency are refused with each named"

    - id: MOD-PIPELINE-ROUTES
      name: pipeline-routes
      uuid: nexus-automation-pipeline-routes-v1-0000-2026-1029-001
      path: lib/automation/routes.js
      phase: PL2_pipeline_door
      description: "The pipelines on the engine's door: GET|POST /automation/pipelines, GET|PUT /automation/pipelines/:id, POST /automation/pipelines/:id/archive, POST /automation/pipelines/:id/run, POST /automation/pipelines/validate, GET /automation/pipeline-runs?pipelineId=, GET /automation/pipeline-runs/:runId, POST /automation/pipeline-runs/:runId/cancel."
      deps: [{ name: pipeline }, { name: automation-routes }]
      exports: ["the routes above, on every engine instance"]
      gate_pipeline: ["GATE-PL2-001: A.pipelines made once per engine (lazy)", "GATE-PL2-002: run returns at once with the run id unless wait=1"]
      behavioral_contracts: ["the same local-pages-only rule as every automation route"]
      error_paths: ["no such pipeline → 404", "invalid → 400 with problems"]
      acceptance: ["create, validate, run (wait=1), read the run, archive — through handle()"]

    - id: MOD-PIPELINE-COMMANDS
      name: pipeline-commands
      uuid: nexus-automation-pipeline-commands-v1-0000-2026-1029-001
      path: idearium/cli/route-commands.js
      phase: PL3_pipeline_commands
      description: "Rows pipeline list | show <id> | run <id> [--wait] | runs <id> | run-status <runId>, through Clear Glass's automation door (system clear-glass), so every agent has them through nexus.command."
      deps: [{ name: pipeline-routes }]
      exports: ["rows pipeline.list, pipeline.show, pipeline.run, pipeline.runs, pipeline.run-status"]
      gate_pipeline: ["GATE-PL3-001: a row → { system: 'clear-glass', path: '/automation/…' }"]
      behavioral_contracts: ["the printout is the checklist: ✓ done, ▸ running, · waiting, ✗ failed, ⊘ blocked"]
      error_paths: ["Clear Glass not running → the client's own error, said"]
      acceptance: ["each row's request names the right path"]

    - id: MOD-PIPELINE-UI
      name: pipeline-ui
      uuid: nexus-automation-pipeline-ui-v1-0000-2026-1029-001
      path: clear-glass/renderer/settings/sections/pipelines.js
      phase: PL4_pipelines_screen
      description: "Settings › Pipelines in Clear Glass: the pipelines; an editor (tasks: label, what it runs — a macro, a workflow, an agent with its prompt, a Nexus command —, depends on, gate, retries); Run; the checklist of the last runs, read again while one runs."
      deps: [{ name: pipeline-routes }]
      exports: ["section pipelines (window.CGS.section)"]
      gate_pipeline: ["GATE-PL4-001: every read and write through wire('/automation/pipelines…')", "GATE-PL4-002: invalid → the problems shown, nothing saved"]
      behavioral_contracts: ["a macro task lists his macros; a workflow task lists his workflows; an agent task names the agent"]
      error_paths: ["the engine not ready → the section says so"]
      acceptance: ["driven in Clear Glass: a pipeline made, run, and its checklist shown"]

    - id: MOD-PIPELINE-ORCHESTRATOR
      name: pipeline-orchestrator
      uuid: nexus-automation-pipeline-orchestrator-v1-0000-2026-1029-001
      path: orchestrator/automation/index.js
      phase: PL5_orchestrator_runs_pipelines
      description: "The orchestrator's engine runs pipelines with every kind of task: macros and browser steps through Clear Glass's driver port (AE2), agent tasks through RAID (AE3). Until then its pipelines run every other task and name the ones that need those ports."
      deps: [{ name: pipeline-routes }]
      exports: ["the same /automation/pipelines* door on :9000"]
      gate_pipeline: ["GATE-PL5-001: a macro or browser task → the AE2 port; an agent task → RAID (AE3)"]
      behavioral_contracts: ["Clear Glass down → only its tasks fail, said; the rest run"]
      error_paths: ["the port not built → the task fails with 'browser steps need Clear Glass running'"]
      acceptance: ["a pipeline on :9000 runs a macro task through Clear Glass and an agent task through RAID"]

  events:
    automation:
      - "automation.pipeline.start { pipelineId, runId }"
      - "automation.pipeline.task { pipelineId, runId, task, status, attempts }"
      - "automation.pipeline.done { pipelineId, runId, status }"

  enforcement:
    gates:
      - { id: GATE-PL-ONE-ENGINE, name: one-engine, severity: fatal, check: "pipeline.js runs tasks only through engine.runStep", on_failure: "build failure" }
      - { id: GATE-PL-VALID, name: valid-before-run, severity: fatal, check: "run() calls validate() and refuses on problems", on_failure: "suite red" }
      - { id: GATE-PL-BLOCKED, name: blocked-not-run, severity: fatal, check: "a task with a failed dependency is never passed to runStep", on_failure: "suite red" }
      - { id: GATE-PL-KEPT, name: kept, severity: fatal, check: "archive() sets archived; runs are files never removed by the module", on_failure: "suite red" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node, invariants valid"
    - "tests/modules/test-pipelines.test.js — each module's acceptance lines"
