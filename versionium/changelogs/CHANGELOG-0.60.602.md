# 0.60.602 — every step tries another agent

James, 2026-11-19: "each step or gate needs to be able to try another agent, and i need to be able to change that also. but we have to get this working with ollama before anything." · "okay. lets do it."

## What changed
every step tries another agent (IF22): a step carries an ordered agent ladder (agents: [..], Ollama first); each attempt takes its rung, decided in Emerge (cos/automation/ladder.eg pick and tries), given to the step as {{vars.agent}} and to a typed gate as with.agent; the step gets at least one attempt per rung; each attempt's agent is recorded on the step's events. He changes it: PATCH /api/cos/automation/pipelines/:id/tasks/:task/agents, CLI cos automation pipeline-agents <pipeline> <task> a,b|-. No UI (preview first). ladder.test.eg 2/2; test-pipeline-waits-for-a-system 12/12 (PW-12 new).

## Files
- cos/automation/ladder.eg, test/ladder.test.eg, eg-build/ladder.js: the ladder (Emerge)
- cos/automation/pipeline.js: attempts take their rung; setAgents; needs() knows a ladder fills vars.agent
- cos/automation/routes.js: PATCH .../tasks/:task/agents
- cos/manager/cli.js: pipeline-agents
- tests/modules/test-pipeline-waits-for-a-system.test.js: PW-12
