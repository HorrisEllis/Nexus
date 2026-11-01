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

  OC_D1_templates_and_schemas:
    status: DECIDED 2026-11-01 (his)
    chosen: >-
      Every node type the console adds (task, schedule, occurrence, deployment, run_history) has its schema file in lib/node-schemas, and every
      kind of work has templates to start from: .task templates (a daily check, watch a page, build a phase, run a tool, deploy an agent) beside
      the .pipeline/.workflow templates lib/automation/templates.js already holds, all in Idearium's template picker (the spec workshop) and in
      COS's create. OC9 builds them.
    by: "his, 2026-11-01: \"dont forget all templates and data schemas\""
  OC_D2_the_eravos_canvas_replaces_brainos:
    status: DECIDED 2026-11-01 (his)
    chosen: >-
      Pipelines and workflows are built and watched on the ERAVOS canvas (cos/archetype/eravos-canvas), not BrainOS: each task and step an ERAVOS
      tool, each dependency a wire, run through COS (the EO map's orchestration domain, ctx.cos). BrainOS's page is archived and links there.
      OC8's Pipelines section is the canvas.
    by: "his, 2026-11-01: \"using eravos canvas for the automation pipeline and workflow, to replace the brainos, and build tools for it instead, it already uses cos\""
  OC_D3_canvas_for_cos_ui:
    status: "ASKED 2026-11-01 — his question, the coder's recommendation, to decide"
    question: "\"and then the canvas for the cos ui?\""
    recommendation: >-
      The coder's: the canvas for what is a graph (pipelines, workflows, the systems and their wires, the diagnostic map: CP11), pages for what is
      a list or a record (the ledger, proposals, the calendar, settings); both in one COS window, the canvas as its main view.
  OC_D4_the_cos_app_is_the_application:
    status: DECIDED 2026-11-01 (his)
    chosen: >-
      The COS app (cos/app, Electron, COS 0.1.2, built by .github/workflows/cos-app.yml as a portable exe and an installer) runs on its own,
      without Nexus running, and is how he updates: it shows COS's UI (the cockpit) as its window, runs COS's manager itself, installs and
      switches Nexus releases (its store and switch), and checks for a newer COS (app-update.js). Until Looking Glass replaces Electron.
    by: "his, 2026-11-01: \"build the exe for cos to run independant of nexus that i can use to update, using the ui as the application until looking glass replaces electron\""

phases:
  OC1_task_nodes:
    status: "DONE 0.60.348"
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

  OC9_templates:
    status: OPEN
    depends_on: [OC_D1_templates_and_schemas, OC7_the_taxonomy_expanded]
    spec: docs/orchestration-console.spec
    blocks: [MOD-OC-TAXONOMY]
    files: [lib/automation/templates.js, idearium/spec-engine/templates, cos/archetype]
    interface: [html, cli]
    does: ".task templates and the schemas of every new node type, offered in Idearium's template picker and COS's create"
    proof: "each template makes a valid node (validateTask); each schema parses"
  OC10_pipelines_on_the_canvas:
    status: OPEN
    depends_on: [OC_D2_the_eravos_canvas_replaces_brainos, EO2_cos_tools, OC2_scheduler_on_nodes]
    spec: docs/orchestration-console.spec
    blocks: [MOD-OC-CONSOLE]
    files: [cos/archetype/eravos-canvas/tools/orchestration, cos/ui/orchestration, lib/ui/brainos/index.html]
    interface: [html]
    does: "a .pipeline opened on the ERAVOS canvas as tools and wires, edited there, saved as the node, run through COS; BrainOS archived, linking here"
    proof: "in Clear Glass: a pipeline drawn on the canvas, saved, reopened the same, run, its runs shown on its tools"
  OC11_the_cos_app_runs_alone:
    status: OPEN
    depends_on: [OC_D4_the_cos_app_is_the_application, MG33_cos_ui_has_a_way_in, UP9_a_popup_when_there_is_an_update]
    spec: docs/orchestration-console.spec
    blocks: [MOD-OC-CONSOLE]
    files: [cos/app/desktop/main.js, cos/app/runtime.js, cos/app/store.js, cos/app/switch.js, .github/workflows/cos-app.yml]
    interface: [html]
    does: "the COS app's window is COS's UI; it starts COS's manager itself (no Nexus needed); installs, switches and updates Nexus releases; its own update said; released as cos-v0.2.0 (exe + installer)"
    proof: "the app built by the workflow, started with no Nexus running: the cockpit shows, a release installed and switched to, the update popup on a newer one"

build_order: "OC1 → OC7 → OC2 → (OC3, OC6) and (OC4, OC5) from OC1 → OC8."

# ── ADDENDUM 2026-11-01 — his additions: templates and schemas; the ERAVOS canvas replaces BrainOS; the COS app as the application ─────────
# James, 2026-11-01: "dont forget all templates and data schemas. systems running in cos, what is the advantage. also want to build the exe for cos
# to run independant of nexus that i can use to update, using the ui as the application until looking glass replaces electron. also using eravos
# canvas for the automation pipeline and workflow, to replace the brainos, and build tools for it instead, it already uses cos, and then the
# canvas for the cos ui?"
# (the decisions OC_D1–OC_D4 and the phases OC9–OC11 of this addendum are written into the decisions: and phases: blocks above)
