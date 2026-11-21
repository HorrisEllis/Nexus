# docs/2026-11-21-one-surface-phasemap.spec — everything Nexus runs, on one pipeline surface, driven from the console and from Copilot, through RAID
# author: james-brooks (the direction and the calls are his; the map is the coder's, to his words)
origin: >-
  James, 2026-11-21, after the pipeline screen's preview (cos/ui/run-console-preview, PC8 slice d, PC_D15): "then each pipeline from all of nexus
  needs to be in here. queue from raid, and tasks, background tasks, jobs, everything running throught the pipeline. my framework. like being able
  to set the method, agent tool, or command, like needs to be as powerful as the automation engine, conditions, schedule, triggers, etc. like raid
  is what creates the center node. i want to be able to expirament with it. build each step, program it, like this can be i cant even discribe how
  valuable this can be. like i need to be able to use nexus from the console. all of it. like run through raid. like i need as much power and
  control, without making it overwhelming as possible. like running the trials, or testing my frameworks, like i want copilot to be able to make
  macros or frameworks from me talking to it." · "like it needs to be able to orchastrate all of nexus from the cli for me." · "like i talk to it
  and it understands nexus enough to find what im asking and fix something if its broken, or if i have a request, or if i need something
  changed. like the way i am talking to you, i need from copilot." · "query nexus data, components, files, nodes, ledgers, etc." · "also using
  copilot, updating models per file, website, system, everything, as nodes per, and each interconnected to each other?"
census_2026_11_21: >-
  What exists (the coder's census; reuse before build, §8.6): RAID is in Cortex, reached by every other system through lib/raid-port.js
  (approveTool, decide, outcome, listQueue). The request lifecycle is mapped (docs/2026-11-17-raid-request-lifecycle-phasemap.spec L0–L14: the
  input a node, the DAG, the contract, Nexus first, a missing capability built, RAID decides and delivers; several PARTLY). COS's command line
  (POST /api/cos/cli) has 26 commands, all about systems. The automation engine's catalogue has 25 step kinds and triggers (manual, every,
  daily, cron, event, webhook) for workflows, not pipelines (cos/automation/steps.js TRIGGER). cos/automation/method.eg resolves his framework
  per step. Copilot: docs/2026-10-10-copilot-talk-to-nexus-phasemap.spec and docs/2026-10-24-copilot-any-agent-phasemap.spec (CL1–CL4 OPEN).
  The pipeline screen's preview already reads Ollama's jobs, COS's runs, 961 phases from the maps and 595 components from the systems' own
  registries, and runs COS's CLI in its Terminal panel.
covers: >-
  Expands, does not rewrite: PC8 (operate a pipeline) and PC_D15 (the three types), PC2 (procedures and frameworks as steps), L0–L9 (the RAID
  request lifecycle), CL1–CL4 (Copilot as any agent), DB5 (the build moves to COS). Blocked in practice by Idearium going down under a build
  (runs 13 and 14, 2026-11-21): OS1's tasks and OS2's centre node need DB5 or that fault found first.

decisions:
  OS_D1_what_a_model_per_file_is:
    status: "OPEN — his to say (asked 2026-11-21)"
    james: '"also using copilot, updating models per file, website, system, everything, as nodes per, and each interconnected to each other?"'
    readings: >-
      (a) a model as an understanding: each file, website and system has a node that says what it is, what it does and what it relates to,
      kept current by Copilot and linked to the others (a graph of Nexus: Loom's, or Cortex's index); (b) a model as the AI that works on it:
      which Ollama model handles each file, site or system, set per node; (c) a model as a data shape: each one's schema, as a node.

phases:
  OS1_every_run_on_one_surface:
    status: OPEN
    depends_on: []
    files: [cos/ui/run-console-preview/server.js, cos/manager/automation-door.js, lib/raid-port.js]
    does: >-
      The pipeline screen's Activity reads every kind of running work, each by its owner's route: RAID's queue (listQueue), COS's pipeline and
      workflow runs, Idearium's repo tasks and background tasks, Ollama's jobs. Each shown as a run with its steps, and each openable on the
      canvas. Nothing is copied: a view over the owners' routes (§5.9).
    proof: "a RAID request, a COS pipeline run, an Idearium task and an Ollama job, all listed at once with their state, each opened on the canvas"
  OS2_raid_makes_the_centre_node:
    status: OPEN
    depends_on: [OS1_every_run_on_one_surface]
    files: [cortex/raid, cos/automation/pipeline.js, cos/ui/run-console-preview/index.html]
    does: >-
      A request to RAID (L0: the input becomes a node) is the origin of a radial pipeline (PC_D15): its DAG (L2) the rings outward, its
      contract (L3) the end state. Shown and edited on the canvas like any pipeline; run by RAID.
    proof: "a request typed in the console appears as a centre node with its DAG around it, and runs"
  OS3_each_step_its_method_agent_tool_or_command:
    status: OPEN
    depends_on: []
    files: [cos/automation/method.eg, cos/automation/steps.js, cos/ui/run-console-preview/index.html]
    does: >-
      Every step can be given a method (a section of his framework, resolved by method.eg), the agent that answers (RAID's decide, or picked),
      a tool, or a command, from menus on the step. Expands PC2.
    proof: "one step set to a framework section and an agent from menus; its run uses both, shown on the step"
  OS4_pipelines_get_triggers_schedules_conditions:
    status: OPEN
    depends_on: []
    files: [cos/automation/pipeline.js, cos/automation/cron.js, cos/automation/steps.js]
    does: >-
      The automation engine's triggers (manual, every, daily, cron, event, webhook) and conditions, for pipelines too, set from the screen.
    proof: "a pipeline on a schedule and one on an event each run by themselves; both shown in Activity"
  OS5_all_of_nexus_from_the_console:
    status: OPEN
    depends_on: [OS1_every_run_on_one_surface]
    files: [cos/manager/cli.js, idearium/cli/route-commands.js, lib/raid-port.js]
    does: >-
      One command line for all of Nexus: every system's routes as commands (DB6: a capability is a route), each one approved by RAID
      (approveTool), with completion so nothing has to be remembered. The Terminal panel is its window.
    proof: "a command for each system run from the Terminal panel, each approved by RAID and logged"
  OS6_query_everything:
    status: OPEN
    depends_on: [OS5_all_of_nexus_from_the_console]
    files: [loom, cortex, orchestrator/lib/mcp-server.js]
    does: >-
      Query Nexus's data from the console and from Copilot: nodes, components, files, ledgers, runs, phases. Each through its owner (Cortex the
      bookkeeper, §L13; Loom's graph; the ledger), one query shape.
    proof: "five questions (a node, a component, a file, a ledger row, a phase) answered from the console with where each came from"
  OS7_copilot_runs_nexus_from_talk:
    status: OPEN
    depends_on: [OS5_all_of_nexus_from_the_console, OS6_query_everything]
    files: [copilot/assist-loop.js, copilot/intents.js, docs/2026-11-17-raid-request-lifecycle-phasemap.spec]
    does: >-
      He talks; Copilot finds what he means in Nexus (OS6), and either answers, fixes what is broken, files the request, or changes what he asks,
      each through RAID's lifecycle (L4 Nexus first, L5 no "I don't know", L6 a missing capability built). It can make a macro, a pipeline or a
      framework from what he said, shown to him before it is kept. Expands CL3 and the talk-to-Nexus map.
    proof: "three things said in plain words (a fault, a request, a change) each carried out through RAID, and one framework made from talk"
  OS8_experiments_and_trials:
    status: OPEN
    depends_on: [OS3_each_step_its_method_agent_tool_or_command]
    files: [cos/automation/pipeline.js, docs/framework-trial]
    does: >-
      Trials and tests of his frameworks as pipelines (the Framework trial pipeline exists): the same steps with arms (method A against method B,
      one model against another), runs compared side by side, predictions registered before results (FRAMEWORK-THREADS rules).
    proof: "one trial run with two arms; the comparison shown; its prediction registered before it ran"
  OS9_a_model_per_node_interconnected:
    status: OPEN
    depends_on: [OS6_query_everything, OS7_copilot_runs_nexus_from_talk]
    files: []
    does: "Waits on OS_D1 (what a model per file, website and system is)."
    proof: "set when OS_D1 is answered"
build_order: [OS1, OS3, OS4, OS5, OS6, OS2, OS7, OS8, OS9]
first_slice: "OS1: Activity reads RAID's queue, COS's runs, Idearium's tasks and Ollama's jobs, one list on the pipeline screen."
