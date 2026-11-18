# 0.60.567: a local model plans

James, 2026-11-18: "30b for mapping and complex reasoning, using agent tools and intelligence system before anything." · "guardian only when ollama cant"

- `lib/pipeline-routing.js` planMode: `routing.planner` may name an Ollama model (`ollama:<model>`). A bare `ollama` names no model and still cannot plan.
- `idearium/api/index.js`: the planner's calls (the plan, and the test written first) go to that Ollama model.
- RAID's routing is then set (data, not code): planner `ollama:huihui_ai/qwen3-coder-abliterated:30b`; escalation DeepSeek 16b, the 30B, then Gemini and Claude (Guardian only when Ollama cannot).

Proof: test-plan-code-run-attention 42/42 (PC-16b a named Ollama model plans; PC-16c the build calls it on its model). Not proved: a build planned by the 30B (it was still downloading).
