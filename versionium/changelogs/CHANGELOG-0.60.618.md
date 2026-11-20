# 0.60.618 — deterministic first: the plan

James, 2026-11-20: "do what helps us the most, first" · "Everything chunked, decomposed"

## What changed
The third build through the ladder (EMB3, run phrun-mwp9yd3m-o9m0) stalled 11 min on one ~6,100-token planner prompt to DeepSeek 16b, although the phase writes its one signature: `derivePlan` was only the fallback after the model planner. Now, when the phase's own words give every new file it names its signatures, that is the plan, and no model is asked (his 2026-10-13 order: "a parser, a test, a grep or a check runs before any model"). The model planner runs only when the words are not enough.

test-emerge-rung 11/11.

## Files
- idearium/api/index.js: the build's planning step
