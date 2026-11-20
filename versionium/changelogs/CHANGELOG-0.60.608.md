# 0.60.608 — a skeleton gap goes to the model bare

James, 2026-11-19: "suppposed to give it the smallest amount of context per gate." · "get it working, built, expanded, dont forget pillar"

## What changed
a skeleton gap goes to the model bare: in NM1a's first run with 0.60.607 the rung fired (a skeleton of 3, idOf → pathOf → rename) but each gap went through the project agent, about 9,960 characters of persona and JavaScript context, and DeepSeek answered in JavaScript three times (for (let … of …), ===, semicolons). Now a gap on an Ollama rung goes to the Ollama system's job route (nexus://ollama/api/jobs), the gap brief alone, owned by the Emerge rung, polled to its result. test-emerge-rung 7/7.

## Files
- cos/automation/pipeline.js: the reuse index by fingerprint, the link across pipelines
- cos/ui/automation/engine.js (0.60.599): the Pipelines tab opens the gates
- tests/modules/test-pipeline-waits-for-a-system.test.js: PW-11
