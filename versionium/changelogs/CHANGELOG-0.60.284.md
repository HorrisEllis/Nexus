# 0.60.284 — pipelines: tasks in a dependency graph, each one of his automations, run as a checklist

James, 2026-10-29: "making a pipeline and workflow feature and include the macros and automation"

Earlier the same day:
- "For automation of macros, Tasks in a dependency graph as a checklist?"
- "also the automation orchastroation from orchastrator? different agents? etc."

Specced first: `docs/automation-pipelines.spec`. It compiles in emerge's kg-builder at full depth.
Mapped: `docs/2026-10-29-pipelines-phasemap.spec`, with its DAG checked.

The coder's reading, **to confirm**: a pipeline is tasks with dependencies, each task one of the automations he already has.

## What a pipeline is
- **A task is one step of the existing automation engine.** It can be:
  - a macro;
  - a workflow;
  - a question to any agent (each task its own agent: Claude, ChatGPT, DeepSeek, Ollama …);
  - a Nexus command;
  - a browser action, or a web request.

  It runs through `engine.runStep`, with that engine's own hooks. Nothing is re-implemented.
- **Dependencies.** A task waits for the tasks it depends on and reads their outputs as `{{tasks.<id>.output}}`. Up to 4 tasks run at
  once.
- **Gates.** Each task is checked by its gate (output contains, equals, matches, or is not empty) and retried up to 5 times.
- **Failures.** A failure blocks every task after it, and each blocked task names the one that blocked it. With "If it fails: go on",
  the rest still run.
- **Every run is kept as a checklist:** ✓ done, ▸ running, · waiting, ✗ failed, ⊘ blocked.
- **Refused before it runs:** a cycle, a dependency on a missing task, a duplicate id, an unknown step, or a bad gate. Every problem is
  named.

## Where it is
- `lib/automation/pipeline.js`: `validate`, `layers`, `gateOpen`, `Pipelines`.
- The door `/automation/pipelines*` and `/automation/pipeline-runs*`, on every engine instance.
- Commands: `pipeline list | show | run [--wait] | runs | run-status`. Every agent has them through `nexus.command`.
- Clear Glass **Settings › Pipelines**:
  - the pipelines, each with its tasks and its last checklist;
  - an editor: each task runs a macro, a workflow, an agent with its prompt, or a Nexus command, with *after*, a gate, retries, and
    what to do if it fails;
  - **Run**, with the checklist read again until the run ends;
  - Archive (kept, never deleted).

## Not built
- **PL5:** the orchestrator running pipelines with macros and agents. Its engine needs the Clear Glass port and RAID routing (AE2/AE3,
  open since 2026-10-25). Today pipelines run in Clear Glass's engine, the one with the browser, the macros and the agents wired.

## Also found
- KB1–KB7 (0.60.275–0.60.280) were never specced, so `test-substrate-spec` had been failing since 0.60.275. Their modules are in
  `clear-glass/spec/gated-flows.spec` now, and each phase names them.
- First screenshot of the screen: a failed run's colour was painting a done task's ✓ red. Fixed before release.

## Proof
- `test-pipelines` 6/6. PL-06 drives Settings › Pipelines in Clear Glass: a pipeline made in the editor with a macro task and an agent
  task, run, and its checklist shown.
- `test-substrate-spec` 3/3.
- automation-engine 16/16, automation-v2 18/18, automation-registry 11/11, automation-settings-ui 8/8, macro 22/22, nexus-command-tool
  8/8.
- These fail on the base too, so they are not this release's:
  - `test-cg-settings-ui-files` (mesh.js, accounts.css);
  - `test-cli-route-commands` CL-07 (Guardian is not running).
