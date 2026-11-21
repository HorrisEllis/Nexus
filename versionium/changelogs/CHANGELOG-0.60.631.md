# 0.60.631 — a pinned Ollama model builds through the Emerge rung

James, 2026-11-21: "okay. get it to code from end to end. we need that proof that its working."

## What changed
- **idearium/api/index.js** `_phaseBuild`: a pin of `ollama:<model>` (no backend, no agent) is one rung `{ provider, base: 'ollama', model }`, shaped as `lib/pipeline-routing.js ladder()` makes them; a pin is never reordered or added to. So a new JavaScript file's brick goes through the Emerge rung (skeleton, one gap per function, the routing.emerge_ladder 3b → 16b → 30b), as an escalated build already did.
- `paramsOf()` with no rung reads `ollama:<model>` as `{ backend: 'ollama', model }` (the planner and the test writer already did), so the agent climb no longer refuses it.

## Measured
Run phrun-mwqlfi0m-j17s (EMB3, 2026-11-21 08:01): planned with no model, test written from the phase's 10 examples with no model, then three brick tries failed in under a second each: `unknown provider "ollama:deepseek-coder-v2:16b"` (lib/repo-agent.js). The rung shape was checked against `PRt.ladder()`'s output. The proof run follows this release.
