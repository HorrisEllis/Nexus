# 0.60.606 — the planner's registry, the folder budgeted too

James, 2026-11-19: "suppposed to give it the smallest amount of context per gate. so only what it needs but the tools to reference the map and query nexus."

## What changed
the planner's registry: the phase's own files only, every neighbour budgeted: 0.60.605 always listed a phase file's whole folder, and NM1a's file is in lib/ (160 components), so its 16:52 planner prompt was still 44,112 characters (19,549 of registry) and timed out at 5 minutes. Now only the phase's own files are always listed; the folder and the rest share LIMITS.registryChars (2,000). Measured: 300 components in lib/ → 2,049 characters. Seen the same hour: DeepSeek reads about 53 prompt tokens a second here (2,788 tokens in 52 s); a 9,354-character prompt is answered in about 2 minutes. Tests: context-budget 6/6, plan-code-run-attention 48/48, run-ready 10/10, expectation-tests 7/7.

## Files
- cos/automation/pipeline.js: the reuse index by fingerprint, the link across pipelines
- cos/ui/automation/engine.js (0.60.599): the Pipelines tab opens the gates
- tests/modules/test-pipeline-waits-for-a-system.test.js: PW-11
