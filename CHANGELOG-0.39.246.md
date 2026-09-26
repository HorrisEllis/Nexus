# NEXUS 0.39.246 — responses reach the downloads manager; all three graphs hooked into repo import

**Date:** 2026-09-25 · idearium 4.4.0 → 4.5.0 · guardian response-sink 1.0.0 → 1.1.0

James: *"we need the responses to save to the downloads manager. also can you make sure the 3 graphs are hooked in?"*

## 1. Responses → Clear Glass downloads manager
The sink already posted to `POST /cli/downloads`. How it filed the entry was the problem:
- **Filed under the wrong owner.** `agentId` was set to the provider (`chatgpt`), so every repo's replies landed together. The entry now carries the job's own `agentId` (`repo-<uuid>`); the provider is its own field. `ncp-handler.js` and `POST /response/:jobId` pass `job.agentId` into `deliver()`.
- **Store dropped the link.** `DownloadsStore.add()` discarded `jobId`. It now keeps `jobId`, `kind: 'response'`, `provider`, `compartmentId`, `source` — only when present, so ordinary browser downloads are unchanged.
- **Pointed at a file not yet written.** The post happened before the `.response` node existed (or ever existed, if the write failed). Order is now: write node → post with the node's real path → rewrite node with the downloads result.
- **Named `.response.txt`.** Now `<jobId>.response`, mime `application/x-nexus-response+yaml`.
- **Lost when Clear Glass was closed.** A failed post is queued to `guardian/data/downloads-pending.jsonl` and reported `queued: true`; the next successful post replays the queue in order.
- **Test wrote into live data.** `test-response-sink-passthrough` left `j1..j7.response` in `guardian/data/nodes/response/` and posted to the real `:7702`. `NODES_DIR` is now overridable (`GUARDIAN_RESPONSE_NODES_DIR`); the suite uses a scratch folder and a closed port.

## 2. The three graphs (2026-09-19 graph-field design: code · execution · spec)
| graph | answers | before | now |
|---|---|---|---|
| code — `repo/graph.js` → `graph.json` | what the source imports | built at import | unchanged |
| execution — `repo/runtime-proof.js` → `proof.json` | which chunks ran under a passing test | only on manual `POST /proof` | queued by every import after L6-L8, own queue (`idearium-runtime-proof`, 10 min), state merged into `verification.lazy.json` as `runtimeProof`; opt out with `runImportPipeline(repo, dir, { runtimeProof: false })` |
| spec — `repo/spec-graph.js` (new) → `spec-graph.json` | what the repo's catalog `.spec` files declare | did not exist | built at import right after the code graph (`spec:graph:complete` / `spec:graph:failed`, catalogued) |

**Spec ↔ code disagreements** are recorded in the design's own finding shape `{ entity, graphs, claims, kind: 'ledger_divergence', divergence }`:
- `declared_not_imported` — the spec says A depends on B; the code has no import. Not automatically a bug: a component that gets B injected through the registry never imports it.
- `imported_not_declared` — the code imports B (a file the spec knows); the spec never declares it.
Declared files not present in the repo are counted as `notInRepo` (not built yet), not as errors. A repo with no catalog `.spec` gets `status: not_applicable` with the reason — never an empty graph dressed as built. The spec graph reuses `spec-engine/manifest` (0.39.245); there is no second parser.

**API:** `GET /api/repos/:uuid/graphs` (all three, each with its real state: built · pending · failed · not_applicable · missing) and `GET /api/repos/:uuid/graph/spec` (`?full=1` for every entry and disagreement).
**UI:** the repo Phasemap panel shows all three graphs; the import progress toast has the spec-graph stage.

## Proof
- **`test-response-downloads` 9/9** (new): real `deliver()` → real HTTP POST → the real `DownloadsStore` behind a scratch server with bridge.js's handler body. Lands as `<jobId>.response`; filed under the repo; `savePath` exists and holds the reply; node records the downloads result; Clear Glass down → queued; back → replayed in order; error → `interrupted`; browser downloads unchanged; both callers pass `agentId`.
- **`test-three-graphs` 11/11** (new): the real import pipeline on a scratch repo — READY; code graph edges; spec graph built after the code graph; declared files resolved, one reported not in repo; both divergence kinds found; agreement silent; execution graph built by the import with no manual POST; L6-L8 tiers preserved; no-spec repo `not_applicable`; routes and UI wired.
- **Regression green:** runtime-proof 18, mco2-verify-deepening 18, repo-graph 53, sr11-import-pipeline 17, import-pipeline-syntax 12, downloads-responses 15, response-sink-passthrough 9, manifest-phase1 16, agent-feed 19, repo-agent-late 17, idearium-reuse 8, materialize-physical 5.
- **One suite adjusted, stated:** `test-runtime-proof` checks that an edited chunk's *old* proof reads as stale. Auto-proof recomputes immediately, closing that window, so the suite now imports with `{ runtimeProof: false }` — it drives proof itself. The staleness logic is unchanged.

## Not built
- Agent replies still need the one-tab decision (one window with a conversation per repo · one shared conversation · tab per repo, fixed).
- Execution ↔ code and execution ↔ spec disagreements (a code edge whose target never ran) — the three graphs now exist side by side; only spec ↔ code is compared.
