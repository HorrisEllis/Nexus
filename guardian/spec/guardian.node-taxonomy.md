# Node type → system map — Guardian

Starting point for the full map. Guardian first because it's the
best-documented system in the tree — it already has its own real,
authoritative answer to this exact question: `guardian/schemas/index.js`.
That file is James's own decision, written 2026-09-11: "every system gets
its own schemas/ folder," each type either (a) a direct reference to a
shared central schema guardian genuinely reuses unmodified, or (b) a fresh
guardian-local schema for guardian-exclusive data. I read it directly rather
than re-deriving guardian's map from scratch, and checked the remaining 32
types against guardian's real code where that file was silent.

## Legend

- **WRITES** — guardian is a real, checked source of this node type
- **READS** — guardian consumes it, doesn't own or write it
- **VIA LOOM** — guardian doesn't write this directly; `loom/scanners/capability-map.js` (guardian is in its real `SYSTEMS` map) derives it from guardian's own capability records
- **PARTICIPATES** — guardian contributes data into another system's real mechanism for this type, without owning the type itself

| Type | Status | Grounding |
|---|---|---|
| `hat` | READS | `guardian/lib/jobs.js` requires `hat-forge.js` directly, calls `hatForge.get(name)` to attach a persona to a job. Doesn't own hats — `lib/hat-forge.js` is the real source of truth. |
| `component` | VIA LOOM | guardian is in capability-map.js's real `SYSTEMS` map (`'guardian': 'guardian'`) — its capabilities get scanned into loom's component graph. |
| `agent` | WRITES | Guardian's own `KNOWN_PROVIDERS` / per-provider dispatch (claude/chatgpt/gemini/deepseek) is the real source this type describes. |
| `model` | READS | Only via a hat's own `model` field (an Ollama tag) — guardian doesn't author standalone `.model` records itself. |
| `schema` | WRITES (its own registry) | `guardian/schemas/index.js` is guardian's real, local instance of the same pattern `lib/node-schemas.js` uses centrally — guardian both consumes shared schemas and authors its own. |
| `ledger` | WRITES — **but three real, unreconciled shapes** | (1) the shared `.ledger` (`component-ledger.js`) guardian writes into as one caller among many; (2) guardian's own bare `ledger` table (`server.js` ~2219/2379, `{uuid, category, msg, meta, ts}`) — flagged in `guardian/schemas/index.js` itself as a real, distinct, **not yet reconciled** third ledger shape; (3) the CFR ledger files (`cfr_state.json`, `event_stats.json`) captured separately via the `.nex` state-provider below. Three real things sharing the word "ledger" — not unified. |
| `command` | WRITES | `guardian/registry-components.js`'s routes (via `capability.route`) and guardian's own `/cli/commands` surface. |
| `gap` | WRITES — **but two real, distinct mechanisms** | Shared `.gap` (`lib/gap-field.js`), guardian one caller among many (per guardian's own schema index). Separately, `guardian/lib/gap-hunter.js` is a **forwarding shim** to `meta/gap/hunter.js` (GapHunter v3 — id/type/reason/domain taxonomy) — a different real gap concept guardian also consumes, not unified with `.gap`. |
| `tool` | WRITES/USES | `guardian/tool-runtime.js` wires the shared `lib/agent-tools` loop into guardian with guardian's own `callModel` backend — same registry copilot uses, per `tool-runtime.js`'s own "nobody owns the loop" header. |
| `node` | VIA LOOM | Same path as `component`/`hook`/`wire` — the generic union, derived from guardian's capabilities. |
| `job` | WRITES (guardian-exclusive) | `guardian/lib/jobs.js`'s `createJob()`, mirrored by `guardian/schemas/schema.guardian_job` — this is guardian's own type, not shared-central. |
| `intent` | WRITES/USES | In `GUARDIAN_NODE_TYPES`; `guardian/lib/jobs.js`'s `intentHatRouter.suggestHat()` classifies a job's intent to attach a hat. |
| `hook` | VIA LOOM | `capability-map.js` declares real `hook` nodes from guardian's own capability `hooks.in`/`hooks.out` entries. |
| `wire` | VIA LOOM | Same scan, guardian's inter-capability edges become `wire` declarations. |
| `system` | IS ONE (subject, not writer) | Guardian is itself a real entry in capability-map.js's `SYSTEMS` map — something *other* code maps, not something guardian authors about itself. |
| `spec` | WRITES | `guardian/spec/guardian.spec` — guardian has its own real `.spec` file, same universal convention as every other system. |
| `nex` | PARTICIPATES | Guardian is a real, registered state-provider in cortex's `.nex` snapshot mechanism (`snap.registerStateProvider('guardian', {capture, restore})`, `server.js`) — it contributes `cfr_state.json`/`event_stats.json` into every snapshot. Doesn't own the format; cortex does. |
| `capability` | WRITES (founding source) | `guardian/registry-components.js`'s `_c()` helper is literally the real construction site `schema.capability` itself is grounded in. |
| `event` | WRITES | In `GUARDIAN_NODE_TYPES`; writes into cortex's shared `event_log` via `bus.emit` — not its own separate table (per guardian's own schema index). |
| `input` | WRITES (half the union) | `guardian/lib/jobs.js`'s `createJob()` destructure is one of the two real shapes `schema.input` unions. |
| `output` | WRITES (half the union) | `guardian/server.js`'s `GET /response/:jobId` is one of the two real shapes `schema.output` unions. |

## Real, flagged-not-fixed fragmentation found while mapping

- **Three ledger shapes**, not one: shared `.ledger`, guardian's own bare `ledger` table, and the CFR ledger files. Guardian's own schema index already names this as unreconciled — carrying that forward, not silently resolving it here.
- **Two gap mechanisms**, not one: `lib/gap-field.js` (`.gap`) and `meta/gap/hunter.js` (GapHunter v3, reached via a forwarding shim). Different shapes, different taxonomies, both real, both guardian-consumed.

