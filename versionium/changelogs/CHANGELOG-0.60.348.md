# 0.60.348 — OC1: the .task node; the orchestration console specced

James, 2026-11-01: "also look at every orchastration platform, service, repos, all of the best and highest quality, and rebuild brianos/orchastration
ui with enterprise grade code. include anything from idearium, and clearglass, and cos, deploy them to any system, all the agent tools which uses
the index, scheduler with a calender with persistent data, .task nodes. .pipeline nodes  expand the taxonomy"

## Specced: docs/orchestration-console.spec, docs/2026-11-01-orchestration-console-phasemap.spec (OC1–OC8)
The patterns the best platforms are known for, each mapped to the Nexus part it lands on:

| Pattern | From | Lands on |
|---|---|---|
| durable execution and replay | Temporal | run rows, COS snapshots, Versionium |
| a topology view and a grid of runs | Airflow, Kestra | pipeline.js layers and checklists |
| lineage | Dagster | Loom and Versionium |
| schedules with catch-up | Kestra, Airflow | the scheduler and cron, as .task nodes |
| event triggers | Kestra, n8n | the engine's hooks |
| declarative definitions | Kestra | .task and .pipeline files |
| a visual builder | n8n, CrewAI | the ERAVOS canvas |
| agent observability | Maxim | the flight recorder |

The console itself will live in COS's UI. The spec compiles at full depth, and its DAG has no problems.

## Built: OC1, the .task node
- lib/automation/task-node.js and lib/node-schemas/schema.task.
- **One file per task, the record.** A task is one unit of work, run now or on a schedule, against any system.
- **What a task can do:** macro, workflow, pipeline, agent, command (the engine's own steps), plus tool, system-op and build-phase.
- **Validated against the engine's catalogue.** A refusal lists every problem, not only the first.
- **His time zone by default.** Missed windows are caught up "once" by default.
- **Every save is a Versionium record** (§17.12). An archived task is moved under _archive/, never deleted.
- **Wired in Loom** (build-surface map): task-node → cron, task-node → versionium-record.

## Proof
tests/modules/test-task-nodes.test.js 5/5.
