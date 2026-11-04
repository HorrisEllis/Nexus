spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # orchestration-console.spec — BrainOS rebuilt as COS's orchestration console: every pipeline, task, schedule, agent and tool in Nexus, run,
  # scheduled on a calendar, deployed to any system, watched and replayed, from one place. Enterprise grade = the patterns the best platforms
  # are known for, each mapped onto a part Nexus already has (§8.6), each held to his axioms.
  # Format: emerge's module spec (kg-builder, specDepth 1.0; tests/modules/test-substrate-spec.test.js). Phases: docs/2026-11-01-orchestration-console-phasemap.spec.
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        orchestration-console
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-11-01T00:00:00Z
    status:      specced
    uuid:        nexus-orchestration-console-spec-v1-0000-2026-1101-jamesbrooks-001
    origin: >-
      James, 2026-11-01: "also look at every orchastration platform, service, repos, all of the best and highest quality, and rebuild
      brianos/orchastration ui with enterprise grade code. include anything from idearium, and clearglass, and cos, deploy them to any system,
      all the agent tools which uses the index, scheduler with a calender with persistent data, .task nodes. .pipeline nodes  expand the
      taxonomy". Earlier: "i need a main control panel for a system wide cli. show me the orchastration ui" · "only compartments have control
      panels" · "basically cos is the orchatrator" · "look at every other top company, business, service, any orchastration, ide's, and build an
      enterprise grade orchastration ui, with autonomous controls, full agent controls".
    purpose: >-
      One console where every unit of work in Nexus — a macro, a workflow, a pipeline, an agent's task, a build phase, a system operation — is a
      node file, runs through one engine, can be scheduled on a calendar that survives restarts, can be deployed to any system's compartment,
      is watched live, and can be replayed or rewound from its history. Patterns adopted, with their source and their Nexus home:
      durable execution and an event history per run with replay (Temporal) → the run's rows + COS snapshots + Versionium;
      a topology view of a pipeline's tasks and a grid of runs (Airflow, Kestra) → pipeline.js layers + run checklists;
      lineage of what a run produced (Dagster's assets) → outputs and artifacts traced through Loom and Versionium;
      schedules with catch-up of missed windows (Kestra backfill, Airflow catchup) → lib/scheduler.js + lib/automation/cron.js, as .task nodes;
      event triggers (Kestra, n8n) → the automation engine's hooks and Nexus events;
      declarative definitions (Kestra YAML) → .pipeline and .task node files;
      a visual builder (n8n, CrewAI) → the ERAVOS canvas (EO) and BrainOS's canvas;
      agent observability: cost, latency, quality per agent and prompt (Maxim) → the flight recorder and the economy router.
    target_runtime: [node]
    language_stack: [javascript]
    paradigm: [SISO, node-files, durable, explainable]
    axioms: ["§5.9/§5.15 sovereignty: each system's work reached through its route; COS runs, it does not own", "§9.1 RAID is the one write authority for the system's own decisions",
      "§0.3 nothing lost: BrainOS's old UI archived, its links kept", "§1.2 nothing fails silently", "§17.12 every change and version recorded in Versionium",
      "USER_AUTONOMY: a deploy, a schedule that acts, a destructive op is his or a rule's, and says whose (by)"]
    deps:
      - { name: js-yaml, version: ">=4.1.0", required: true, purpose: "node files" }

    constraints:
      - id: OC-001
        description: "Every task, schedule and pipeline is a node file (.task, .pipeline) — the store of record; tables and memory are caches rebuilt from the files."
        type: hard
        enforced_by: [GATE-OC-NODES]
      - id: OC-002
        description: "A scheduled fire, a deploy and a system op carry by (person | rule:<id> | agent:<hat>) and pass RAID's governAction before they act."
        type: hard
        enforced_by: [GATE-OC-BY-RAID]
      - id: OC-003
        description: "The console reads and acts only through routes (COS's door, each system's own); it holds no copy of another system's store."
        type: hard
        enforced_by: [GATE-OC-DOORS]
      - id: OC-004
        description: "A missed occurrence (Nexus was off) is never silently dropped: its catch-up policy decides (skip | once | all), and the decision is in the run history."
        type: hard
        enforced_by: [GATE-OC-CATCHUP]

  schemas:

    - id: TaskNode
      name: TaskNode
      description: "A .task node: one unit of work Nexus can run now or on a schedule, against any system."
      fields:
        id:        "string — <slug>"
        title:     "string"
        do:        "object — { kind: macro|workflow|pipeline|agent|command|tool|system-op|build-phase, ref, args } (the engine's step catalogue)"
        target:    "object — { system, compartment? } where it runs (COS deploys it there)"
        schedule:  "object|null — Schedule"
        by:        "string — whose it is (person | rule:<id> | agent:<hat>)"
        gate:      "object|null — what its output must hold (pipeline.js gateOpen keys, element gates)"
        retries:   "object — { max, backoff: { baseMs, factor, capMs } }"
        timeoutMs: "number"
        concurrency: "string — allow | skip-if-running | queue"
        priority:  "number — 0..9"
        tags:      "string[]"
        createdAt: "number"
      behavioral_contracts: ["one file per task under its owner's nodes/task/; the file is the record"]
      error_paths: ["a do.kind outside the catalogue → refused, naming the catalogue"]

    - id: Schedule
      name: Schedule
      description: "When a task or pipeline runs."
      fields:
        cron:      "string|null — 5 fields (lib/automation/cron.js)"
        at:        "number|null — one time (epoch ms)"
        every:     "number|null — an interval (ms), with maxRuns"
        tz:        "string — IANA zone (his: America/Los_Angeles by default)"
        catchUp:   "string — skip | once | all (missed windows while Nexus was off)"
        window:    "object|null — { from, to } dates it is active"
        paused:    "boolean"
      behavioral_contracts: ["exactly one of cron, at, every"]
      error_paths: ["a cron that does not parse → refused with cron.js's why"]

    - id: Occurrence
      name: Occurrence
      description: "One cell of the calendar: a past run or a planned fire."
      fields:
        task:      "string — TaskNode.id or a .pipeline id"
        at:        "number"
        state:     "string — planned | running | done | failed | skipped | missed | caught-up"
        runId:     "string|null"
        why:       "string|null"
      behavioral_contracts: ["past ones from run records, future ones from schedules: nothing invented"]
      error_paths: ["a run record without its task → shown as orphaned"]

    - id: Deployment
      name: Deployment
      description: "An agent or a task placed in a system's compartment."
      fields:
        id:        "string"
        what:      "object — { kind: agent|task|pipeline, ref }"
        system:    "string"
        compartment: "string"
        state:     "string — proposed | taken | running | stopped | refused"
        proposal:  "string — the COS proposal id it went through"
        by:        "string"
      behavioral_contracts: ["a deploy is a COS proposal: held, then taken by a person or a rule; never applied directly"]
      error_paths: ["an unknown system → refused naming COS's systems"]

    - id: RunHistory
      name: RunHistory
      description: "A run's durable event history, for its timeline and replay."
      fields:
        runId:     "string"
        events:    "object[] — { at, kind: scheduled|started|step|gate|retry|deployed|output|failed|done|rewound, ref, why }"
        snapshot:  "string|null — the COS snapshot taken before it acted"
        versions:  "string[] — Versionium records it wrote"
        lineage:   "object[] — { output, usedBy } what it produced and what consumed it"
      behavioral_contracts: ["projected from records the run already writes (the engine's run files, the ledger, Versionium); never a second store"]
      error_paths: ["a run with no snapshot → rewind unavailable, said"]

  interfaces:

    - id: IF-ENGINE
      name: automation-engine
      path: lib/automation/engine.js
      description: "The automation engine: workflows, steps (the catalogue), runs, hooks, nodes; nextScheduled(cfg, from)."
      exports: ["AutomationEngine", "nextScheduled(cfg, from)", "WORKFLOWS_DIR", "RUNS_DIR", "NODES_DIR"]
      behavioral_contracts: ["one engine per instance (Clear Glass, the orchestrator); a step is run only by runStep"]
      error_paths: ["an unknown step type → refused"]

    - id: IF-PIPELINE
      name: pipeline
      path: lib/automation/pipeline.js
      description: "Pipelines: tasks in a dependency graph, gates, retries, blocking, the run as a checklist; kept as .pipeline files."
      exports: ["validate(pipeline, { stepTypes })", "layers(pipeline)", "gateOpen(gate, output)", "new Pipelines(engine, { dir })"]
      behavioral_contracts: ["a failed task blocks its dependants, said"]
      error_paths: ["a cycle → refused with the cycle"]

    - id: IF-ROUTES
      name: automation-routes
      path: lib/automation/routes.js
      description: "The engine's door: /automation/catalogue, /automation/pipelines, /automation/pipeline-runs, /automation/workflows, /automation/step, /automation/log, /automation/nodes, /automation/active, /automation/templates."
      exports: ["GET /automation/catalogue", "GET|POST /automation/pipelines", "GET /automation/pipeline-runs", "POST /automation/step", "GET /automation/log", "GET /automation/nodes"]
      behavioral_contracts: ["served by each instance that runs an engine"]
      error_paths: ["the instance down → no answer, said by the caller"]

    - id: IF-SCHEDULER
      name: scheduler
      path: lib/scheduler.js
      description: "schedule(spec) at a time or interval; every fire RAID-gated (governAction) and logged; persisted to the cortex table scheduled_tasks."
      exports: ["schedule(spec)", "cancel(id)", "list(filter)", "get(id)", "start(opts)", "stop()", "TABLE"]
      behavioral_contracts: ["a failed fire never crashes the loop"]
      error_paths: ["the cortex store down → schedules in memory only, said"]

    - id: IF-CRON
      name: cron
      path: lib/automation/cron.js
      description: "parse(expr), next(expr, from), describe(expr)."
      exports: ["parse(expr)", "next(expr, from)", "describe(expr)"]
      behavioral_contracts: ["5 fields; next is exact to the minute"]
      error_paths: ["a bad field → throws with the field"]

    - id: IF-NODES
      name: automation-nodes
      path: lib/automation-nodes.js
      description: ".workflow, .macro and .pipeline node files: written, parsed, imported, listed."
      exports: ["pipelineNode(p)", "workflowNode(w)", "macroNode(m)", "parse(text)", "importNode(doc)", "saveNode(doc)", "listNodes(dir)"]
      behavioral_contracts: ["a node carries what it requires"]
      error_paths: ["a node of an unknown type → refused"]

    - id: IF-TOOL-INDEX
      name: tool-index
      path: lib/tool-index.js
      description: "The living tool index: each tool's file, what it provides, and what was observed using it (consumer, intent, edge cases); lib/agent-tools registers and executes them."
      exports: ["register(tool)", "record(obs)", "get(id)", "list()", "summary()"]
      behavioral_contracts: ["grows from real use"]
      error_paths: ["recording never breaks the caller"]

    - id: IF-COS-DOOR
      name: cos-door
      path: cos/manager/server.js
      description: "COS's door: /api/cos/systems (state, start/stop/restart with by), /api/cos/proposals (hold, take, drop), /api/cos/ledger, /api/cos/events (SSE), /contract-map/:name."
      exports: ["GET /api/cos/systems", "POST /api/cos/systems/:name/:op { by }", "POST /api/cos/proposals", "POST /api/cos/proposals/:id/take|drop { by }", "GET /api/cos/events"]
      behavioral_contracts: ["an act says who acts (MG-006)"]
      error_paths: ["no by → 400"]

    - id: IF-TAXONOMY
      name: event-taxonomy
      path: lib/event-taxonomy-pattern.js
      description: "The ET1 shape for a system's events: { EVENT_NAME: { description, payloadShape, severity } }, validateTaxonomy."
      exports: ["validateTaxonomy(taxonomy)", "SEVERITIES"]
      behavioral_contracts: ["every emitted event is declared"]
      error_paths: ["an undeclared event → the census says so"]

  modules:

    - id: MOD-OC-TASK-NODE
      name: task-node
      uuid: nexus-orchestration-task-node-v1-0000-2026-1101-001
      path: lib/automation/task-node.js
      phase: OC1_task_nodes
      description: >-
        The .task node (lib/node-schemas/schema.task): taskNode(task) → node text, parse, validate against the engine's catalogue, save one file
        per task under the owning system's data/nodes/task/, list. Tasks made through the console, the CLI or an agent are files first.
      deps: [{ name: automation-nodes }, { name: automation-engine }]
      schema_refs: [TaskNode, Schedule]
      exports: ["taskNode(task) → text", "parseTask(text) → TaskNode", "validateTask(task, { catalogue }) → { ok, problems }", "saveTask(task, { dir })", "listTasks({ dir })"]
      gate_pipeline: ["GATE-OC1-001: shape (TaskNode, Schedule)", "GATE-OC1-002: do.kind in the catalogue", "GATE-OC1-003: write the file; record in Versionium"]
      behavioral_contracts: ["the file round-trips exactly", "a change to a task is a Versionium record (§17.12)"]
      error_paths: ["invalid → refused with every problem listed"]
      acceptance: ["a task written, read back equal, refused with a bad do.kind, listed"]

    - id: MOD-OC-SCHEDULER
      name: scheduler-on-nodes
      uuid: nexus-orchestration-scheduler-v1-0000-2026-1101-001
      path: lib/scheduler.js
      phase: OC2_scheduler_on_nodes
      description: >-
        The scheduler loads its schedules from .task and .pipeline nodes at start (the cortex table kept as a cache and imported once, §0.3),
        arms cron (cron.js next), at and every; on start it finds windows missed while Nexus was off and applies each task's catchUp; each fire
        passes governAction with the task's by, honours concurrency and priority, and appends to the run history.
      deps: [{ name: scheduler }, { name: cron }, { name: task-node }]
      schema_refs: [Schedule, Occurrence, RunHistory]
      exports: ["start({ dirs })", "missed(task, { since, now }) → Occurrence[]", "fire(task, { by, reason })"]
      gate_pipeline: ["GATE-OC2-001: load nodes; import the old table once", "GATE-OC2-002: missed windows → catchUp", "GATE-OC2-003: governAction(by) before each fire", "GATE-OC2-004: concurrency: skip-if-running | queue"]
      behavioral_contracts: ["a restart loses nothing: the next fire is computed from the file", "a missed window is in the history as skipped, missed or caught-up"]
      error_paths: ["RAID denies → the fire is recorded as refused with RAID's why"]
      acceptance: ["a cron task survives a restart; three windows missed with catchUp once → one caught-up run and two missed in history"]

    - id: MOD-OC-CALENDAR
      name: calendar
      uuid: nexus-orchestration-calendar-v1-0000-2026-1101-001
      path: lib/automation/calendar.js
      phase: OC3_the_calendar
      description: >-
        occurrences({ from, to, filter }) → Occurrence[]: past runs from run records, planned fires from schedules (cron next, at, every), each
        with its state; day, week and month views are projections of it. Moving a planned occurrence edits its task's schedule (a file change).
      deps: [{ name: scheduler-on-nodes }, { name: cron }]
      schema_refs: [Occurrence]
      exports: ["occurrences({ from, to, filter }) → Occurrence[]", "reschedule(taskId, { at | cron }, { by })"]
      gate_pipeline: ["GATE-OC3-001: past from records", "GATE-OC3-002: future from schedules within the window", "GATE-OC3-003: reschedule writes the task file"]
      behavioral_contracts: ["nothing on the calendar that no record or schedule says"]
      error_paths: ["a window over 400 days → refused"]
      acceptance: ["a month with two cron tasks and one past failure: every cell from a record or a schedule"]

    - id: MOD-OC-DEPLOY
      name: deploy-anywhere
      uuid: nexus-orchestration-deploy-v1-0000-2026-1101-001
      path: cos/manager/deploy.js
      phase: OC4_deploy_to_any_system
      description: >-
        deploy({ what, system, by }) → Deployment: an agent (a hat with its tools), a task or a pipeline placed in a system's compartment, through
        a COS proposal (held; taken by a person or a rule). Taken, the task runs with that system as its target; an agent's tool calls go to that
        system's routes. Idearium's repo agents, Clear Glass's pipelines and COS's systems are all targets.
      deps: [{ name: cos-door }, { name: task-node }]
      schema_refs: [Deployment]
      exports: ["deploy({ what, system, by }) → Deployment", "deployments({ system })", "recall(id, { by })"]
      gate_pipeline: ["GATE-OC4-001: system known to COS", "GATE-OC4-002: hold a proposal", "GATE-OC4-003: taken → running; dropped → refused"]
      behavioral_contracts: ["never applied without a take (OC-002)", "every deployment in COS's ledger"]
      error_paths: ["the system down → the proposal says so; nothing runs"]
      acceptance: ["a task deployed to a fixture system: held, taken by a person, run there, in the ledger"]

    - id: MOD-OC-TOOLS
      name: tools-from-the-index
      uuid: nexus-orchestration-tools-v1-0000-2026-1101-001
      path: lib/automation/tool-step.js
      phase: OC5_every_agent_tool
      description: >-
        Every agent tool in lib/agent-tools, listed through the tool index with what it provides and how it has been used, is a step kind
        ('tool') any task or pipeline can run, and a button in the console; each use is recorded back into the index (record).
      deps: [{ name: tool-index }, { name: automation-engine }]
      schema_refs: [TaskNode]
      exports: ["catalogue() → [{ id, provides, uses, edgeCases }]", "runTool({ id, args, by }) → result"]
      gate_pipeline: ["GATE-OC5-001: tool known to the registry", "GATE-OC5-002: run through executeTool with by", "GATE-OC5-003: record the use"]
      behavioral_contracts: ["the console shows the index's own counts", "a person's tool run and an agent's are the same call"]
      error_paths: ["a tool that needs a person (personOnly) → refused for agents, said"]
      acceptance: ["a tool run as a task step; the index's count for it rises by one"]

    - id: MOD-OC-HISTORY
      name: run-history
      uuid: nexus-orchestration-history-v1-0000-2026-1101-001
      path: lib/automation/history.js
      phase: OC6_history_and_replay
      description: >-
        history(runId) → RunHistory: the run's events from the engine's run file and the ledger, its COS snapshot, its Versionium records and its
        lineage (outputs and what used them); replay(runId) runs the same definition with the same inputs in a fork; rewind(runId) restores its
        snapshot (a proposal, taken by a person).
      deps: [{ name: automation-engine }, { name: cos-door }]
      schema_refs: [RunHistory]
      exports: ["history(runId) → RunHistory", "replay(runId, { by })", "rewind(runId, { by })"]
      gate_pipeline: ["GATE-OC6-001: events from records", "GATE-OC6-002: replay in a fork", "GATE-OC6-003: rewind via a proposal"]
      behavioral_contracts: ["a projection, never a second store"]
      error_paths: ["no snapshot → rewind unavailable, said"]
      acceptance: ["a run's timeline lists every step, retry and gate with its time; a replay gives a second run linked to the first"]

    - id: MOD-OC-TAXONOMY
      name: orchestration-taxonomy
      uuid: nexus-orchestration-taxonomy-v1-0000-2026-1101-001
      path: cos/event-taxonomy.js
      phase: OC7_the_taxonomy_expanded
      description: >-
        The taxonomy expanded: node types task, schedule, occurrence, deployment and run-history (schemas in lib/node-schemas), and the
        orchestration events in the ET1 shape: orchestration.task.created|changed|archived, orchestration.schedule.fired|missed|caught-up|refused,
        orchestration.deploy.proposed|taken|dropped|recalled, orchestration.run.started|step|gated|retried|done|failed|replayed|rewound,
        orchestration.tool.used — each with its payload shape and severity, validated by validateTaxonomy.
      deps: [{ name: event-taxonomy }]
      schema_refs: [TaskNode, Schedule, Occurrence, Deployment, RunHistory]
      exports: ["ORCHESTRATION_EVENTS", "node schemas: schema.task, schema.schedule, schema.occurrence, schema.deployment, schema.run_history"]
      gate_pipeline: ["GATE-OC7-001: each event declared in the ET1 shape", "GATE-OC7-002: validateTaxonomy passes", "GATE-OC7-003: each node type has a schema file"]
      behavioral_contracts: ["an emitted orchestration event that is not declared fails the census"]
      error_paths: ["a duplicate name → refused"]
      acceptance: ["validateTaxonomy ok; every schema file parses; the census finds no undeclared orchestration event"]

    - id: MOD-OC-CONSOLE
      name: orchestration-console
      uuid: nexus-orchestration-console-ui-v1-0000-2026-1101-001
      path: cos/ui/orchestration/page.js
      phase: OC8_the_console
      description: >-
        The console, a page of COS's UI (COS is the orchestrator; only compartments have control panels): Overview (what runs now, what failed,
        what is next), Pipelines (topology of tasks, the grid of runs, edit as a .pipeline), Tasks (the .task files, run now, schedule), Calendar
        (day/week/month from MOD-OC-CALENDAR, drag to reschedule), Agents (the fleet by system, deploy, recall), Tools (the index, run one),
        History (a run's timeline, replay, rewind), Triggers (events and hooks). Idearium's builds (flight recorder), Clear Glass's macros and
        pipelines and COS's systems appear as what they are, through their routes. BrainOS's old page is archived and links here (§0.3).
      deps: [{ name: cos-door }, { name: automation-routes }]
      schema_refs: [TaskNode, Occurrence, Deployment, RunHistory]
      exports: ["the page cos/ui/orchestration/ (index.html, page.css, page.js, sections/*)", "its contract entry in cos/manager/contract.json"]
      gate_pipeline: ["GATE-OC8-001: every section reads a route its contract lists", "GATE-OC8-002: every act carries by", "GATE-OC8-003: a section whose system is down says so"]
      behavioral_contracts: ["keyboard first; every list filters and searches; nothing on a timer for show; live through COS's event stream"]
      error_paths: ["COS's door down → the page says so, nothing faked"]
      acceptance: ["driven in Clear Glass: a task made, scheduled on the calendar, deployed to a system, run, its timeline shown, replayed"]

  events:
    orchestration:
      - "orchestration.task.created { id, by }"
      - "orchestration.schedule.fired { task, at, by }"
      - "orchestration.schedule.missed { task, at, catchUp }"
      - "orchestration.deploy.proposed { id, system, by }"
      - "orchestration.run.started { runId, task }"
      - "orchestration.run.failed { runId, why }"
      - "orchestration.tool.used { tool, by }"

  enforcement:
    gates:
      - { id: GATE-OC-NODES, name: nodes-are-the-record, severity: fatal, check: "every task and schedule has its node file; a table row without a file is rebuilt or said", on_failure: "suite red" }
      - { id: GATE-OC-BY-RAID, name: by-and-raid, severity: fatal, check: "every fire, deploy and op carries by and a governAction verdict", on_failure: "act refused" }
      - { id: GATE-OC-DOORS, name: doors, severity: fatal, check: "the console and deploy.js reach systems only through routes", on_failure: "build failure" }
      - { id: GATE-OC-CATCHUP, name: catch-up, severity: fatal, check: "every missed window has a history event", on_failure: "suite red" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node, invariants valid"
    - "per module: its acceptance lines, each a named test in the phase that builds it"
