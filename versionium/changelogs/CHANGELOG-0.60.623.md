# 0.60.623 — a model that did not generate is said as that

James, 2026-11-20: "do what helps us the most, first"

## What changed
The ninth build (EMB3, run phrun-mwpbncjv-h101) climbed the ladder for the first time: the 3b's test (nine plain asserts, one syntax slip and one contradiction) was unusable twice, so DeepSeek 16b and then the 30b were asked. Each job failed as `axiom rejection: []`: no candidate had generated, and that was reported as an axiom rejection with no failures.
- `unifiedDispatch` (lib/warp/dispatch/index.js) returns `{ source: 'generation-failed', error }` when every candidate failed to generate, with the model's own error.
- The Ollama system's job (ollama/lib/dispatch.js) says `the model did not generate: <why>` (§1.2: nothing fails silently).

Checked directly: a failed generation reports its error; a good one still passes. lib/warp/test/dispatch.test.js does not start, before or after (a missing lib/siso_ref file).

## Files
- lib/warp/dispatch/index.js, ollama/lib/dispatch.js
