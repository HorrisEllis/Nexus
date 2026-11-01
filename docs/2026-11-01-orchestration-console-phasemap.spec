# docs/2026-11-01-orchestration-console-phasemap.spec — BrainOS rebuilt as COS's orchestration console. Spec: docs/orchestration-console.spec.
# The ask and the scope are James's; the reading, the cut and the order are the coder's.

origin: >-
  James, 2026-11-01: "also look at every orchastration platform, service, repos, all of the best and highest quality, and rebuild
  brianos/orchastration ui with enterprise grade code. include anything from idearium, and clearglass, and cos, deploy them to any system, all
  the agent tools which uses the index, scheduler with a calender with persistent data, .task nodes. .pipeline nodes  expand the taxonomy"

readings_to_confirm:
  - "\"rebuild brianos/orchastration ui\": read as one console in COS's UI (his 'basically cos is the orchatrator', 'only compartments have control panels'); BrainOS's page (lib/ui/brainos) archived and linking there. To confirm."
  - "\"scheduler with a calender with persistent data, .task nodes\": the existing scheduler (lib/scheduler.js) moved onto .task and .pipeline node files as the record, with a calendar projected from runs and schedules. To confirm."
  - "\"expand the taxonomy\": new node types (task, schedule, occurrence, deployment, run_history) and the orchestration.* events in the ET1 shape. To confirm."

decisions:
  OC_D0_one_console_in_cos:
    status: "PROPOSED 2026-11-01 (his ask; the reading above to confirm)"
    chosen: "One orchestration console, a page of COS's UI, reading every system through its route; .task/.pipeline files the record; every act with by and through RAID."
    by_the_axioms: "§5.9/§5.15, §9.1, §0.3, §17.12, §8.6 (engine, pipelines, scheduler, cron, tool index, COS proposals reused)"

phases:
  OC1_task_nodes:
    status: OPEN
    depends_on: [OC_D0_one_console_in_cos]
    spec: docs/orchestration-console.spec
    blocks: [MOD-OC-TASK-NODE]
    files: [lib/automation/task-node.js, lib/node-schemas/schema.task, tests/modules/test-task-nodes.test.js]
    interface: [cli]
    does: "the .task node: write, parse, validate against the engine's catalogue, one file per task"
    proof: "MOD-OC-TASK-NODE's acceptance"
  OC7_the_taxonomy_expanded:
    status: OPEN
    depends_on: [OC1_task_nodes]
    spec: docs/orchestration-console.spec
    blocks: [MOD-OC-TAXONOMY]
    files: [cos/event-taxonomy.js, lib/node-schemas/schema.schedule, lib/node-schemas/schema.occurrence, lib/node-schemas/schema.deployment, lib/node-schemas/schema.run_history, tests/modules/test-orchestration-taxonomy.test.js]
    interface: [cli]
    does: "node types schedule, occurrence, deployment, run_history; orchestration.* events declared in the ET1 shape"
    proof: "MOD-OC-TAXONOMY's acceptance"
  OC2_scheduler_on_nodes:
    status: OPEN
    depends_on: [OC1_task_nodes]
    spec: docs/orchestration-console.spec
    blocks: [MOD-OC-SCHEDULER]
    files: [lib/scheduler.js, lib/automation/cron.js, tests/modules/test-scheduler-nodes.test.js]
    interface: [route]
    does: "the scheduler loads .task/.pipeline schedules, arms cron/at/every, catches up missed windows by policy, every fire through RAID with by"
    proof: "MOD-OC-SCHEDULER's acceptance"
  OC3_the_calendar:
    status: OPEN
    depends_on: [OC2_scheduler_on_nodes]
    spec: docs/orchestration-console.spec
    blocks: [MOD-OC-CALENDAR]
    files: [lib/automation/calendar.js, lib/automation/routes.js, tests/modules/test-calendar.test.js]
    interface: [route, cli]
    does: "occurrences in a window from records and schedules; reschedule edits the task file"
    proof: "MOD-OC-CALENDAR's acceptance"
  OC4_deploy_to_any_system:
    status: OPEN
    depends_on: [OC1_task_nodes]
    spec: docs/orchestration-console.spec
    blocks: [MOD-OC-DEPLOY]
    files: [cos/manager/deploy.js, cos/manager/server.js, cos/manager/contract.json, tests/modules/test-cos-deploy.test.js]
    interface: [route, cli]
    does: "an agent, task or pipeline deployed to any system's compartment through a COS proposal"
    proof: "MOD-OC-DEPLOY's acceptance"
  OC5_every_agent_tool:
    status: OPEN
    depends_on: [OC1_task_nodes]
    spec: docs/orchestration-console.spec
    blocks: [MOD-OC-TOOLS]
    files: [lib/automation/tool-step.js, lib/automation/steps.js, tests/modules/test-tool-step.test.js]
    interface: [route, cli]
    does: "every agent tool from the index as a step kind and a console button; each use recorded back"
    proof: "MOD-OC-TOOLS' acceptance"
  OC6_history_and_replay:
    status: OPEN
    depends_on: [OC2_scheduler_on_nodes]
    spec: docs/orchestration-console.spec
    blocks: [MOD-OC-HISTORY]
    files: [lib/automation/history.js, tests/modules/test-run-history.test.js]
    interface: [route]
    does: "a run's durable event history, lineage, replay in a fork, rewind through a proposal"
    proof: "MOD-OC-HISTORY's acceptance"
  OC8_the_console:
    status: OPEN
    depends_on: [OC3_the_calendar, OC4_deploy_to_any_system, OC5_every_agent_tool, OC6_history_and_replay, OC7_the_taxonomy_expanded, MG33_cos_ui_has_a_way_in]
    spec: docs/orchestration-console.spec
    blocks: [MOD-OC-CONSOLE]
    files: [cos/ui/orchestration/index.html, cos/ui/orchestration/page.css, cos/ui/orchestration/page.js, cos/manager/contract.json, lib/ui/brainos/index.html, tests/modules/test-orchestration-console.test.js]
    interface: [html]
    does: "the console in COS's UI: overview, pipelines, tasks, calendar, agents, tools, history, triggers; BrainOS archived and linking here"
    proof: "MOD-OC-CONSOLE's acceptance, in Clear Glass"

build_order: "OC1 → OC7 → OC2 → (OC3, OC6) and (OC4, OC5) from OC1 → OC8."
