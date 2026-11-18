# 0.60.569: one line for every Ollama call, its metrics as nodes (OL5b)

James, 2026-11-18: "okay. do it." · "also what about saving performance metrics to a node file to understand how to optimize performance in relation to events in the ledger and the deltas between"

Why, from the same day: with OLLAMA_MAX_LOADED_MODELS 1, two callers on two models evicted each other's model; NM1's 30B dropped out of its build
when he used the 3b, and was loaded again.

Mapped first: docs/2026-11-18-ollama-local-agent-phasemap.spec OL5b (with OL5c, his clients through the line, and OL20, the deltas, both open).

- `ollama/lib/model-turns.js` (new): one turn at a time; the next goes to a caller of the model the last turn used; one that waited past
  OLLAMA_TURN_MAX_WAIT_MS (10 minutes) goes first, so nothing starves. Each turn is one `.metric` node, appended by day to the Ollama system's
  `data/metrics/turns-<date>.jsonl`: model, caller, door, waitMs, runMs, swap, freeMemMBBefore/After, ok, error.
- `ollama/lib/dispatch.js`, `ollama/routes/generate.js`: both doors wait their turn. `ollama/routes/queue.js`: GET /api/queue adds `line`.

Proof: ollama/test/model-turns.test.js 8/8. Not proved: two callers on his machine batched (the metric lines will show it).
Not covered: a client calling Ollama on 11434 directly still bypasses the line (OL5c).
