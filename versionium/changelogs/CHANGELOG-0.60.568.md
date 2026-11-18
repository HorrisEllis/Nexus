# 0.60.568: one load per model per request (OL5a)

James, 2026-11-18: "no 30b for all of its steps per pipeline or request. then unload. like chunks for a torrent file. it knows which chunks to build, gaps to fill. each model knows its tasks."

Mapped first: docs/2026-11-18-ollama-local-agent-phasemap.spec OL5a_one_load_per_model_per_request (with OL15, OL16).

- `lib/pipeline-routing.js`: `passes(rungs)`, one pass per rung, with the model to unload after it (not when the next pass uses the same model);
  `routing.batch_by_model` (on by default; off keeps the per-file climb).
- `idearium/api/index.js` (planned build): files go rung by rung. Every pending file is tried on a rung before the next rung loads; an Ollama
  model is unloaded after its pass; an Ollama planner is unloaded before the coders load (unless the first coder is the same model). Each
  unload is a row on the run.
- `ollama/routes/models.js`: `POST /api/models/unload` (Ollama's keep_alive 0, reusing idle-unload's call), with its command row.

Why: measured the same day, the 30B takes 120 s to load and leaves 0.7 GB of RAM free; climbed per file, it would load and unload once per file.

Proof: test-plan-code-run-attention 46/46 (OL5a-1..4). Not proved: a build on his machine loading the 30B once.
