# Node type → system map — Ollama

## Legend
WRITES / READS / VIA LOOM / PARTICIPATES / NOT USED — same as Guardian/Versionium.

| Type | Status | Grounding |
|---|---|---|
| `agent` | WRITES / IS ONE | In guardian's own `KNOWN_PROVIDERS` (`'ollama'`) — ollama is both a dispatch target for guardian and its own standalone server. |
| `model` | WRITES | `ollama/routes/models.js` — real `GET /api/models` (live list) and `PUT /api/model` (validated against what's actually pulled before accepting). |
| `job` | WRITES — third real, separate shape | `ollama/routes/jobs.js` — real `{prompt, model, uploadId, maxIterations}` job shape, own `lib/state.js` store, not jaaDB. A third real "job" shape found this session (guardian's, RAID's, now ollama's), none unified. |
| `tool` | USES — shares the loop | `ollama/lib/ollama-client.js` requires `lib/agent-tools/index.js`'s `runToolLoop()` directly — a third confirmed real user of the shared tool-loop, alongside guardian and copilot. |
| `capability` | WRITES | `ollama/registry-components.js`, same real `_c()` convention every system's capability registry uses. |
| `command` | WRITES | `ollama/lib/command-index.js` + registry routes. |
| `component` | VIA LOOM | Confirmed — `'ollama'` is in `capability-map.js`'s real `SYSTEMS` map. |
| `hook` | VIA LOOM | Same scan. |
| `wire` | VIA LOOM | Same scan. |
| `node` | VIA LOOM | Same scan (generic union). |
| `spec` | WRITES | `ollama/spec/ollama.spec`. |
| `system` | IS ONE | `ollama` is a real, named system in `NEXUS_MAP.md`'s top-level list and `capability-map.js`'s `SYSTEMS` map. |
