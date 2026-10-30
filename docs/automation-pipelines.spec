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

    # 2026-10-30 PL6–PL11 — James: "yes. i want that with the option for per site pipelines. make sure macros, automations, and pipelines are
    # interconnected. i build bottom up, and interconnected, and compound leverage" — after "gates are for the pipelines for macro atuomation".
    - id: MOD-GATE-STEP
      name: gate-step
      uuid: nexus-automation-gate-step-v1-0000-2026-1030-001
      path: lib/automation/engine.js
      phase: PL6_the_gate_step
      description: >-
        One engine step, "Wait at a gate": one of his gates (by id, made with the picker) or any element condition (holds a value, exactly,
        matches a pattern, shows a choice, ticked or clear, contains text, visible, gone, the address, the page's text). It asks Clear
        Glass's driver to read it (the driver's gate action, which only reads) until it opens or timeoutMs passes; closed fails the step
        with what it saw. Because a pipeline task is one engine step, the same step is a workflow block and a pipeline task.
      deps: [{ name: automation-engine }]
      exports: ["step type gate { gateId? | selector | xpath, value | equals | matches | shows | checked | text | visible | gone | url, timeoutMs }"]
      gate_pipeline: ["GATE-PL6-001: read through the driver until open or timeout; closed → the step fails with what it saw"]
      behavioral_contracts: ["the step writes nothing", "no browser → the step fails and says why"]
      error_paths: ["closed → Error('gate closed: …')"]
      acceptance: ["test-pipeline-gates PG-01 in Clear Glass: a workflow's gate step waits for a field to hold a value, and fails with what it saw"]

    - id: MOD-PIPELINE-ELEMENT-GATE
      name: pipeline-element-gate
      uuid: nexus-automation-pipeline-element-gate-v1-0000-2026-1030-001
      path: lib/automation/pipeline.js
      phase: PL7_pipeline_tasks_gated_on_elements
      description: >-
        A task's gate may carry element (any element condition, or gateId: one of his), checked after the task through the gate step; the
        output keys (notEmpty, contains, equals, matches) still hold. A closed element gate is a closed gate: the task runs again (its
        retries), then fails and blocks its dependents.
      deps: [{ name: pipeline }, { name: gate-step }]
      exports: ["task.gate.element { gateId? | selector | xpath, …condition, timeoutMs }"]
      gate_pipeline: ["GATE-PL7-001: task → output gate → element gate → done, or retry, or failed"]
      behavioral_contracts: ["the element gate is validated with the pipeline"]
      error_paths: ["closed → the task fails with what the gate saw"]
      acceptance: ["test-pipeline-gates PG-02 in Clear Glass: a task waits at its element gate; a task whose gate stays closed blocks its dependent"]

    - id: MOD-MACRO-ELEMENT-GATES
      name: macro-element-gates
      uuid: nexus-automation-macro-element-gates-v1-0000-2026-1030-001
      path: lib/agent-tools/tools/clear-glass/macro.js
      phase: PL8_macro_steps_gated_on_elements
      description: >-
        A macro step's gate takes the same element conditions and his gates by id (use: <id>), read through the driver's gate action; FG3's
        keys (url, selector, text, value, gone) and KB4's choice keep their own reads. One gate idea for macros, workflows and pipelines.
      deps: [{ name: gate-step }]
      exports: ["step.gate { use?, shows?, checked?, matches?, equals?, visible?, xpath? } alongside FG3/KB4 keys"]
      gate_pipeline: ["GATE-PL8-001: macro step → its gate (FG3 / KB4 / element) → retries → stop with what it saw"]
      behavioral_contracts: ["a gate key nothing reads is refused when the macro is made"]
      error_paths: ["closed → the run stops at that step with what the gate saw"]
      acceptance: ["test-pipeline-gates PG-03: a macro step gated on his gate by id"]

    - id: MOD-LINKS
      name: macros-workflows-pipelines-linked
      uuid: nexus-automation-links-v1-0000-2026-1030-001
      path: lib/automation/engine.js
      phase: PL9_macros_workflows_pipelines_linked
      description: >-
        Each runs the others: an engine step "Run a pipeline" (so a workflow runs a pipeline, and a pipeline task runs another pipeline); a
        macro step run_workflow and run_pipeline (Clear Glass's macro runner hands them to its engine); a pipeline task already runs a
        macro or a workflow. Nesting is bounded (depth 5) and a pipeline that would run itself is refused.
      deps: [{ name: pipeline }, { name: automation-engine }]
      exports: ["step type pipeline { name | id, vars, wait }", "macro steps run_workflow { name } and run_pipeline { name, vars }"]
      gate_pipeline: ["GATE-PL9-001: one engine, one store: the pipelines a workflow runs are the ones the Pipelines screen shows"]
      behavioral_contracts: ["a pipeline never runs itself, directly or through a chain"]
      error_paths: ["too deep or a loop → refused, named"]
      acceptance: ["test-pipeline-gates PG-04: a macro runs a workflow that runs a pipeline whose task runs a macro; a self-running pipeline is refused"]

    - id: MOD-PIPELINE-SITE
      name: per-site-pipelines
      uuid: nexus-automation-per-site-pipelines-v1-0000-2026-1030-001
      path: lib/automation/pipeline.js
      phase: PL10_per_site_pipelines
      description: >-
        A pipeline may belong to a site (site: an origin or a URL pattern) and run when a page of it opens (onLoad). forSite(url) lists a
        site's pipelines; Clear Glass runs the onLoad ones as a page of the site loads, unless the site's Site settings turn pipelines off
        (pipelines.enabled), the same way it runs a site's macros.
      deps: [{ name: pipeline }]
      exports: ["pipeline.site", "pipeline.onLoad", "Pipelines.forSite(url, { onLoad })", "GET /automation/pipelines?site=<url>", "site setting pipelines.enabled"]
      gate_pipeline: ["GATE-PL10-001: a page loads → its site's onLoad pipelines → run, said in Processes"]
      behavioral_contracts: ["a site pipeline runs only on its own site"]
      error_paths: ["a pattern that is not a site → refused by validate"]
      acceptance: ["test-pipeline-gates PG-05: forSite matches by origin and pattern; validate refuses a bad site"]

    - id: MOD-PIPELINE-SITE-UI
      name: per-site-pipelines-screen
      uuid: nexus-automation-per-site-pipelines-screen-v1-0000-2026-1030-001
      path: clear-glass/renderer/settings/sections/pipelines.js
      phase: PL11_screens_for_gates_and_sites
      description: >-
        The Pipelines editor: a Site field and "run when a page of it opens"; each task's gate: output, or an element gate (one of his gates
        for that site, or a condition on an element); the task kinds gain Run a pipeline and Wait at a gate. The list shows each pipeline's
        site. Workflows get Run a pipeline and Wait at a gate from the catalogue; macros take run_workflow / run_pipeline / gate steps.
      deps: [{ name: per-site-pipelines }, { name: pipeline-element-gate }]
      exports: ["Settings › Pipelines: Site, onLoad, element gates, Run a pipeline, Wait at a gate"]
      gate_pipeline: ["GATE-PL11-001: edit → validate → save → run as a checklist"]
      behavioral_contracts: ["nothing is kept in the screen; everything goes through the engine's door"]
      error_paths: ["validate's problems shown"]
      acceptance: ["test-pipeline-gates PG-06 in Clear Glass: the editor saves a site pipeline whose task waits at an element gate"]

    # 2026-10-30 PN1–PN4 — James: "can you export the .macro and .automation nodes to the .pipeline node and import into the pipeline section of
    # clearglass? ... that way the pipeline feature can choose macros and automation nodes from clearglass and node files. these are meant to be
    # actual persistent files in the backend. all nodes are supposed to be physcial files for each system." · "should we rebuild the fiverr plugin?"
    - id: MOD-PIPELINE-NODE
      name: pipeline-node-file
      uuid: nexus-automation-pipeline-node-v1-0000-2026-1030-001
      path: lib/automation-nodes.js
      phase: PN1_the_pipeline_node
      description: >-
        .pipeline is a NEXUS node type (lib/node-export.js envelope, lib/node-schemas/schema.pipeline). pipelineNode(pipeline, { macros,
        workflows }) bundles the macros and workflows its tasks run (payload.requires), as a .workflow bundles its own; importPipeline(text)
        brings the bundled macros and workflows in through the existing importers (a same macro reused, a name taken by a different one
        renamed and the tasks repointed), then the pipeline itself. listNodes lists .pipeline files beside .macro and .workflow.
      deps: [{ name: pipeline }]
      exports: ["pipelineNode(pipeline, { macros, workflows }) → { text, filename }", "importPipeline(engine, text, { getMacro, createMacro }) → { ok, pipeline, imported }", "listNodes(dir) includes .pipeline"]
      gate_pipeline: ["GATE-PN1-001: export → envelope with requires → import → each require through its importer → the pipeline"]
      behavioral_contracts: ["a pipeline node is self-contained: importing it on another machine gives a pipeline that runs"]
      error_paths: ["a task's macro or workflow missing at export → named in the node's warnings, never dropped silently"]
      acceptance: ["test-pipeline-nodes PN-01: export with requires, import on an empty engine runs"]

    - id: MOD-PIPELINE-FILES
      name: pipelines-are-node-files
      uuid: nexus-automation-pipelines-are-files-v1-0000-2026-1030-001
      path: lib/automation/pipeline.js
      phase: PN2_pipelines_kept_as_node_files
      description: >-
        Each pipeline is kept as its own .pipeline node file (the envelope, readable and editable), not a bare JSON record: create and update
        write <id>.pipeline; a JSON pipeline from before is read, rewritten as .pipeline, and the JSON moved to the folder's _archive (§0.3).
        Runs stay as they were. GET /automation/pipelines/:id/node gives the node with its requires; …/node/save writes it into the node
        library; POST /automation/import takes a .pipeline text too.
      deps: [{ name: pipeline-node-file }]
      exports: ["Pipelines store: <id>.pipeline", "GET /automation/pipelines/:id/node", "POST /automation/pipelines/:id/node/save", "POST /automation/import (.pipeline)", "POST /automation/nodes/<file>.pipeline/import"]
      gate_pipeline: ["GATE-PN2-001: write → envelope → read back the same pipeline"]
      behavioral_contracts: ["nothing is lost on the move: the JSON is archived, not deleted"]
      error_paths: ["a file that does not parse → listed as unreadable with why, never skipped silently"]
      acceptance: ["test-pipeline-nodes PN-02: a pipeline is a .pipeline file on disk; an old JSON pipeline is migrated and archived"]

    - id: MOD-PIPELINE-PICKER
      name: pipeline-picks-macros-workflows-nodes
      uuid: nexus-automation-pipeline-picker-v1-0000-2026-1030-001
      path: clear-glass/renderer/settings/sections/pipelines.js
      phase: PN3_the_editor_picks_from_clear_glass_and_files
      description: >-
        In the Pipelines editor a task's macro or workflow is chosen from a list: Clear Glass's macros, the engine's workflows and pipelines,
        and the node files in the library (.macro, .workflow); a node file chosen is imported first, then used by its name. Each pipeline
        card has Export (save its .pipeline into the library) and the section has Import (a .pipeline file from the library or pasted).
      deps: [{ name: pipelines-are-node-files }]
      exports: ["Settings › Pipelines: task picker (macros, workflows, pipelines, node files), Export node, Import node"]
      gate_pipeline: ["GATE-PN3-001: pick → (import a node file) → the task names it"]
      behavioral_contracts: ["the list says where each item comes from"]
      error_paths: ["an import that fails → said in the editor, the task left as it was"]
      acceptance: ["test-pipeline-nodes PN-03 in Clear Glass: the picker lists macros, workflows and node files; picking a node file imports it"]

    - id: MOD-FIVERR-PIPELINE
      name: fiverr-gig-pipeline-node
      uuid: nexus-automation-fiverr-gig-pipeline-v1-0000-2026-1030-001
      path: clear-glass/automation/nodes/fiverr-gig.pipeline
      phase: PN4_the_fiverr_pipeline
      description: >-
        The Fiverr gig, rebuilt as a bundled .pipeline node for https://www.fiverr.com, from the Fiverr node files Clear Glass already ships
        (Fiverr gig - choose category / choose delivery macros, the Overview and Scope & Pricing workflows): each page a task, each waiting at
        a gate. Seeded into the library once like the other bundled nodes; his edited copy stays his.
      deps: [{ name: pipeline-node-file }]
      exports: ["clear-glass/automation/nodes/fiverr-gig.pipeline"]
      gate_pipeline: ["GATE-PN4-001: the bundled node parses, validates and imports"]
      behavioral_contracts: ["Publish, Save and Continue stay his (FI_D1)"]
      error_paths: ["a required node missing → the import says which"]
      acceptance: ["test-pipeline-nodes PN-04: the bundled Fiverr pipeline parses, validates, and imports with its macros and workflows"]

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
