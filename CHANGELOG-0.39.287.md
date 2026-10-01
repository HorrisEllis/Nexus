# 0.39.287 — 2026-10-01

James: "smart fallback for ollama and guardian, learn which models are best for what chunks."

## Learned routing
- New routing mode `learned`, now the default: it learns which agent, and which Ollama model, works best for each kind of chunk.
- **Candidates:** every provider, plus each Ollama model listed in `routing.ollama_models`. Each model (for example `ollama:qwen2.5-coder:7b`) is its own candidate, learned separately. Empty means the hat's model.
- **Learning:** every chunk hop is recorded in the provider economy's ledger under its chunk type: `build:<block>` for spec blocks, `build:file.<ext>` for files. Truncated replies count as failures. WARP cache hits are not counted as a model's work.
- **Ordering:** after `routing.learn_min_records` outcomes (default 4) for a chunk type, the route is ordered by each candidate's success rate for that type. The order is deterministic. An untried candidate sits at 0.5, so it is tried before anything that keeps failing and after anything that works. Below the threshold the chain order stands, and the route says so.
- The hop's model is handed to the agent, overriding the hat's model.
- **Where to see it:** `GET /api/routing/learned`, `idearium routing learned`, and the Ollama models card in Settings → Routing & fallback.
- `tests/modules/test-pipeline-routing.test.js` 19/19 (PR-31…34 new, stable over repeated runs).
