# 0.60.605 — the planner gets only what the phase needs

James, 2026-11-19: "suppposed to give it the smallest amount of context per gate. so only what it needs but the tools to reference the map and query nexus."

## What changed
the planner gets only the components the phase touches: NM1a's planner prompt (Ollama blob 45a161f4) was 44,003 characters; 19,485 were the component registry (160 rows) for a phase writing one new file, and DeepSeek, mostly on the CPU, had read none of it after 300 s (three calls ended 500 at 5m0s, empty replies). registryText now lists the phase's own files and their folders' components, the rest only under LIMITS.registryChars (2,000), and names the tools that read what is left (code_map, code_search, loom.find). Measured on a 300-row registry: 2,118 characters. Still in the prompt, not cut: the project-agent persona (6,885) and the context search (4,972). Tests: context-budget 6/6, expectation-tests 7/7, plan-code-run-attention 48/48, run-ready 10/10.

## Files
- cos/automation/pipeline.js: the reuse index by fingerprint, the link across pipelines
- cos/ui/automation/engine.js (0.60.599): the Pipelines tab opens the gates
- tests/modules/test-pipeline-waits-for-a-system.test.js: PW-11
