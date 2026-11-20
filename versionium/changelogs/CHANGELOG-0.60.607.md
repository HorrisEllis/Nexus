# 0.60.607 — the Emerge rung writes the skeleton first

James, 2026-11-19: "yes we could have the skeleton gaps, it needs to fill. using the dependancy graph." · "get it working, built, expanded, dont forget pillar"

## What changed
the Emerge rung writes the skeleton first (EMB1 expanded): when every export has a signature, Nexus writes the module (each fn, its parameters, a body to fill) and the agent fills one body at a time, in the order the plan's own words give (idearium/lib/gaps.eg needs and order), each gated by Emerge's compiler through its command line with the refusal fed back; each gap is a pillar:gap. The filled module is built and judged by its expectation; a gap that will not fill falls back to the whole-module loop. gaps.eg is built standalone by Emerge (its own runtime, never emerge/emerge: ER-05). The card now says no throw and that a loop variable is read-only. With DeepSeek 16b: idOf filled first try twice; rename refused three times on each run. test-emerge-rung 7/7 (ER-07 new); gaps.test.eg 5/5.

## Files
- cos/automation/pipeline.js: the reuse index by fingerprint, the link across pipelines
- cos/ui/automation/engine.js (0.60.599): the Pipelines tab opens the gates
- tests/modules/test-pipeline-waits-for-a-system.test.js: PW-11
