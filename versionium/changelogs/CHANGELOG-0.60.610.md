# 0.60.610 — the Emerge rung learns from each refusal

James, 2026-11-19: "it is supposed to learn, and observe in the memory, it should be learning from each attempt" · "everything, should be as deterministic as possible, and the llm only when strictly necessary"

## What changed
the Emerge rung learns from each refusal, deterministically: gaps.eg hint() maps each compiler refusal Nexus has met (a JavaScript loop, !, semicolons, a loop variable or a parameter changed, throw, a let changed, a name not defined) to its fix, fed back with the compiler's words; a new kind of refusal is one more row. The card now shows the list loop (for e in xs) and the pattern for changing one item of a list. With DeepSeek 16b on a two-gap skeleton: idOf filled in correct Emerge first try on two runs (it wrote JavaScript loops before); rename still refused 3 of 3 (it changes the registry passed in). gaps.test.eg 6/6, test-emerge-rung 7/7.

## Files
- cos/automation/pipeline.js: the reuse index by fingerprint, the link across pipelines
- cos/ui/automation/engine.js (0.60.599): the Pipelines tab opens the gates
- tests/modules/test-pipeline-waits-for-a-system.test.js: PW-11
