# 0.60.570: OL5c, Ollama's own API through the line; sigmas and heartbeat in the line

James, 2026-11-18: "yes but also the resource manager. and sigmas. imagine this in a tiny linxus distto" · "heartbeat not polling" · "also make
sure it doesn't become a performance issue"

- `ollama/routes/ollama-compat.js` (new, OL5c): `/ollama/*` serves Ollama's own API. Chat, generate and embed wait their turn in the one line
  (streaming passed through); the rest passes straight through. Point a client at `http://127.0.0.1:3749/ollama` instead of `:11434`.
- `ollama/lib/model-turns.js` (OL5b expanded): each turn's `sigma` against its model's baseline (Welford; a swap's load time is not counted;
  null under 3 turns), the baseline resumed from the newest metrics file's last 64 KB; each turn broadcast as `ollama.turn` (heartbeat, not
  polling); the metric append asynchronous, the folder made once.

Proof: ollama/test/model-turns.test.js 13/13. Not proved: a client pointed at /ollama on his machine.
Mapped, open: every system's server.js beating its metrics and sigmas to COS (PR6, CP6a), the resource manager reading the line (CP6f), a tiny Linux (OS3).
