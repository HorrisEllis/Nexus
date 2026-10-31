# Node type → system map — Cortex

Cortex is the central memory/JAA host — most other systems' shared types
(`.event`, `.gap`, `.ledger`, `.idea`, `.failure_mode`) ultimately land in
its store, even though the defining code for some of them (`lib/gap-field.js`,
`lib/component-ledger.js`) lives outside `cortex/` in shared `lib/`.

## Legend
WRITES / READS / VIA LOOM / PARTICIPATES / NOT USED — same as Guardian/Versionium.

| Type | Status | Grounding |
|---|---|---|
| `failure_mode` | WRITES — founding source, this pass | `cortex/self-heal/index.js`'s real `_enterFailureMode()`, read via `cortex/boot.js`'s `GET /api/failure-modes`. See the taxonomy-level promotion note. |
| `contract` | WRITES/HOSTS | `cortex/boot.js`'s real `GET /api/raid/queue` — this is RAID's own queue, hosted in cortex. |
| `idea` | HOSTS | `cortex/boot.js`'s real `GET /api/ideas`, `/api/ideas/stats`, `/api/ideas/review` — idearium's own type (`idearium/index.js`'s `IdeaCreateGate`), but read/reviewed through cortex's API. |
| `gap` | WRITES/HOSTS | `cortex/boot.js`'s real `GET /api/gaps` — `lib/gap-field.js`'s records live here. |
| `event` | WRITES/HOSTS | `cortex/boot.js`'s real `POST /api/event` and `GET /api/events` — the actual shared `event_log` every other system's `.event` writes reference. |
| `ledger` | HOSTS (shared) | `lib/component-ledger.js` isn't inside `cortex/`, but writes into cortex's jaaDB store — same shared type guardian/others use. |
| `note` | ADJACENT, not confirmed | `cortex/push-recall.js` (`CortexPushRecall` class, `VALID_TIERS`/`INTENT_LANES`) is the real target of copilot's `note` intent — not confirmed as writing the same `agent_notes` shape `schema.note` documents. Flagged, not assumed. |
| `capability` | WRITES | `cortex/registry-components.js`. |
| `component` | VIA LOOM | Confirmed — `'cortex'` is in `capability-map.js`'s real `SYSTEMS` map. |
| `hook` | VIA LOOM | Same scan. |
| `wire` | VIA LOOM | Same scan. |
| `node` | VIA LOOM | Same scan. |
| `spec` | WRITES | `cortex/spec/cortex.spec`. |
| `system` | IS ONE | `cortex` is a real, named system in `NEXUS_MAP.md` and `capability-map.js`'s `SYSTEMS` map. |
| `tool` | DOES NOT HOST THE LOOP | No `runToolLoop()` reference found in `cortex/*.js` — unlike guardian/copilot/ollama, cortex doesn't run the shared tool-loop itself. |
| `nex` | HOSTS (the format's owner) | `cortex/snapshot/index.js` is the real `.nex` format's home — guardian and others *participate* by registering state providers into it; cortex owns it. |
| Everything else in the 32 | NOT CHECKED EXHAUSTIVELY | Cortex is large — checked the highest-signal routes in `boot.js` and `self-heal/index.js`; didn't sweep every file. |
