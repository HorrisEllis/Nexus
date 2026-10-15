# 0.60.50 - 2026-10-15

James: "i feel lime also needs to use the gates to maintain persistence using the memory. so we can use nexus for the workload, instead of relying on the agents to remember." · "i want it to start exactly where it left off if it restarts." · "need the full pipeline working."

## What was wrong

In his own runs, a build step made 7 tool calls and then ChatGPT answered "What would you like me to do with this material?". The goal lived only in the first prompt. The retry replayed that prompt, so its first call was `code_map` again and the reading was gone.

## What changed (CE1-CE5, CE10)

- **CE1 run state.** `lib/run-state.js`: one `.run` node per repo + session. It holds the goal, each tool call, files read and changed, and the attempt, and is written after every call. The same goal sent again resumes it (attempt + 1, steps kept).
- **CE2 task header.** A prompt block `task-header`, editable in Settings -> Agents. Follow-up rounds and resumed runs open with it: goal, step, what is done, last call.
- **CE3 reply gate.** `reply.on_task` (a step-gate node) blocks a reply that gives the task back and carries no tool call or code. The round is re-sent once with the header.
- **CE4 reply tags.** Each response node carries `kind:`, `repo:`, `session:`, `run:`, `step:`, `attempt:`. The Library groups by agent, repo, run or kind.
- **CE5 events.** `run.started/resumed/step/finished/failed/off-task/lost/fallback` and `guardian.reply.classified`, declared in the taxonomies.
- **CE10 lost jobs.** "Did nothing with it" is the failure class `lost`. It always falls back to the next provider in the policy chain, bounded by `maxHops`.

## Proof

- `tests/modules/test-run-state.test.js` 27/27, including the live reply from job c2e60104 (RS-20).
- step-gate 18/18, pipeline-routing 19/19, node-export 10/10, loom map 19/19, phasemap 7/7 and 14/14.

## Not verified / known

- No live run through ChatGPT yet.
- The Ollama loop does not get the task header.
- `test-event-contracts` EC-05 fails on main already: `idearium.repo.released`, `versionium.released`, `versionium.tagged` are emitted but undeclared.
