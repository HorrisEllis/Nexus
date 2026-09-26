# Node Taxonomy — 36 slots (current)

Reconciled from three disagreeing sources (the zip snapshot, the `node-export.js`
you uploaded directly, and this thread's own running list) — see the
reconciliation note at the bottom. This is the current, updated state after
this session's fixes.

## The 33

| # | Type | Status | Notes |
|---|------|--------|-------|
| 1 | `hat` | REAL | `lib/hat-forge.js` HAT_SCHEMA |
| 2 | `contract` | REAL | cortex/core/raid queue rows |
| 3 | `component` | REAL, broadened | `loom/schema/component.js` COMPONENT_SCHEMA — always language/syntax-agnostic (`id/namespace/name/version`, never JS-specific). Added optional `boundary` field this pass, grounded in `cos/kernel.js`'s real `Compartment.axioms` (1-5 identity-defining invariants) — a component can now optionally declare its own bounding invariants, same concept as a cos compartment, without being merged into `.cos` (a compartment is live/stateful; a component is a static declaration). |
| 4 | `cos` | REAL | `cos/kernel.js` Compartment class |
| 5 | `agent` | REAL — re-grounded and given its writer 2026-09-20 | An agent **model and personality with an intent and commands** (a repo compartment's living agent: its `.hat` is the persona, its `.intent` what it is for, its commands what it may issue). Was RAID's provider-health snapshot, now `.health` (row below). Writer: `lib/repo-agent-node.js` (`materialise()`), proven by a real export/import round trip (`test-repo-agent-node`); the 0.39.189 `.repo_agent` type is LEGACY (still read, never written). Intent is the hat's responsibilities and commands are its toolScope until the repo's own `.intent`/`.command` binding is decided. guardian hosts the type (`guardian/lib/node-registry.js`). |
| 6 | `model` | REAL | a hat's `model` field |
| 7 | `schema` | REAL | this registry's own envelope |
| 8 | `crystal` | REAL | `meta/crystal-lattice.js` |
| 9 | `ledger` | REAL | jaaDB ledger table |
| 10 | `command` | REAL | `clear-glass/src/ipc/bridge.js` `_buildCommandIndex()` — real, live-introspected `{method, path}` routes. User-facing: what a person's CLI verb resolves to. |
| 11 | `gap` | REAL | `lib/gap-field.js` |
| 12 | `pat` | REAL | `lib/case-library.js` pattern_signature |
| 13 | `macro` | REAL — corrected this pass | `lib/agent-tools/tools/clear-glass/macro.js`'s real record: `{uuid, name, urlPattern, steps:[{action,data}], params, profile, createdAt, runCount, lastRunAt}`, built on `browser_action` + `rewind_replay`'s RewindEngine. The earlier "macro-compiler component" note in this row was stale from the first pass — never re-checked against the actual schema file until now. |
| 14 | `tool` | REAL, broadened | `lib/agent-tools/tools/**/*.js`'s `{name, description, parameters, execute}` — the shared, agent-facing tool-loop (`guardian/tool-runtime.js`'s own header: "nobody owns the loop" — copilot and guardian both run the identical registry, different `callModel` backends). `agent.tool` is not a separate type. Broadened to also accept `lib/tool-forge.js`'s declarative shape (`steps:[{call,args,as?}]` instead of `execute`) — the one real case a `.tool` is genuinely exportable end to end. `.command` stays distinct — different caller, different shape. |
| 15 | `node` | REAL | generic loom graph node (component\|hook\|wire union) |
| 16 | `failure_mode` | REAL — promoted this session | `cortex/self-heal/index.js`'s real `_enterFailureMode()` ("Level 4 — failure mode, human action item") writes to a real jaaDB `failure_modes` table, read via `cortex/boot.js`'s `GET /api/failure-modes`. The type that sat `OPEN` longest — found only once cortex itself was directly checked. |
| 17 | `idea` | REAL | `idearium/index.js` IdeaCreateGate |
| 18 | `framework` | REAL | already real, per earlier report |
| 19 | `toolbox` | REAL | — |
| 20 | `job` | OPEN — agnostic | `guardian/lib/jobs.js`'s `createJob()` job object and `guardian/schemas/schema.guardian_job` are nearly identical — strong evidence, not forced. Whether RAID's queue-row compartments share this type too is still unresolved; leaving `job`/`guardian_job` separate until that's answered. |
| 21 | `intent` | REAL — promoted this session | `hooks/copilot.hooks.js`'s real `seam.intentId: "ask\|build\|diagnose\|navigate\|note\|tool\|action"` enum + `copilot/intents.js`'s real dispatch, cross-checked against guardian's `job.dispatch` capability and `intentHatRouter.suggestHat()`. Honest shape note: every real site implements intent as a classification key + dispatch functions, not a per-intent data file — see `lib/node-schemas/schema.intent`. |
| 22 | `hook` | REAL | `loom/scanners/capability-map.js` `driver.declare('hook', ...)` |
| 23 | `wire` | REAL | `loom/scanners/capability-map.js` `driver.declare('wire', ...)` |
| 24 | `system` | OPEN — agnostic | proposed this session, grounded in capability-map.js's SYSTEMS map + autopilot.js kernels |
| 25 | `spec` | REAL, excluded | own established `.spec`/SPEC-REGISTRY.md convention — deliberately not wrapped in this envelope |
| 26 | `nex` | REAL, excluded | cortex's own NEX-SNAP/1.0 format — deliberately not wrapped |
| 27 | `clips` | DEFERRED | table declared, zero real writers — same precedent as loom's empty seam/concern slots |
| 28 | `capability` | REAL, wired + extended | Wired into `KNOWN_TYPES`. `route` (→`.command`) required; `intent` promoted to required this turn (real precedent: `job.dispatch`'s `hooks.in[].intent`). `events` field added but left optional and agnostic — see below. |
| 29 | `event` | REAL, wired | `cortex/data/snapshots/*.nex` event_log rows. Was previously unreachable — `guardian/lib/node-registry.js` already watched an `event/` folder nothing could populate. |
| 30 | `synthesis` | REAL, built | `cortex/core/raid/officiator.js`'s real `synthesizeFromContext()` output |
| 31 | `input` | REAL, built | Union of guardian's `createJob()` destructure and copilot's real `POST /api/prompt` body. Only `provider` common to both. Copilot's meta-CLI router (argv into a spawned system `cli.js`) is a second real injection mode, noted, not separately schema'd. |
| 32 | `output` | REAL, built | Union of guardian's `GET /response/:jobId` and copilot's parsed `/api/prompt` reply. `ok`/`response`/`error` common to both. |
| 33 | `note` | REAL, found on re-check | Doubly grounded: `intelligence/schemas.js`'s real `agent_notes` table and `lib/agent-tools/tools/coordination/agent-notes.js`'s real tool, same field set independently. Missed in the original 32 — surfaced only after being asked directly whether anything was missing. Possibly the real target of copilot's own `note` intent (→ cortex's push-recall), not fully confirmed as the identical shape. |
| 34 | `hypothesis` | REAL | `copilot/lib/user-model.js`'s real `user_model_hypotheses` JAA table — added after the "33 slots" framing above was written; doc lag, not a functional gap (see `lib/node-schemas/schema.hypothesis`). |
| 36 | `injection` | REAL, built 2026-09-13 | The follow-up to v0.39.122's "mountain" fix — James: "every time something gets prepended to a dispatch, there'd be a real node recording what and why." Grounded in exactly one real construction site: `copilot/tool-runtime.js`'s `makeNcpCallModel` inner `callModel` — the same function the mountain fix patched. `makeOllamaCallModel` checked and excluded: ollama-bridge's `/api/chat` takes a native `tools` param, never text-injects a guide. 8 fields, every one a real variable already in scope at that call site (`provider`/`primed`/`injectedSystemPrompt`/`injectedToolGuide`/`toolCount`/`promptLength`/`idleMsThreshold`/`msSinceLastPrimed`). Written live, every call, primed or full-context, to `copilot/data/nodes/injection/` — non-fatal on write failure, same discipline as this file's own `gapField.report()` calls. See `lib/node-schemas/schema.injection`. |
| 35 | `agent_tool` | OPEN | **Genuinely distinct from `.tool`, not a naming variant of it** — `lib/agent-tools/naming.js`'s real `agentToolName(provider, agentName, name)` builds `provider.agentName.name.agent.tool`, and its `parseName()` returns a different `kind` (`'agent_tool'` vs `'tool'`) for it, a different id shape than `.tool`'s `system.name.tool`. `schema.tool`'s own header used to claim the opposite ("is agent.tool a separate type? it isn't") — that claim is superseded, left visible with a correction note rather than deleted. Marked `OPEN`: the naming grammar is real and tested (`tests/modules/test-tool-naming-convention.js` TN-003/TN-009), but zero real `.agent.tool` instances have been built or registered anywhere yet — `lib/agent-tools/index.js` only references the convention in a comment. Promote to `REAL` once one actually exists. |

| 37 | `chunk` | REAL, built 2026-09-15 | Grounded in idearium/spec-engine/index.js's real chunk object. Written on every real transition (complete/fail/remove/ingest) via idearium/lib/chunk-nodes.js. See lib/node-schemas/schema.chunk. |
| 38 | `response` | REAL, built 2026-09-15 | Guardian's durable response record — the primary fallback sink for GET /response/:jobId. Written via guardian/lib/response-sink.js's deliver(). See lib/node-schemas/schema.response. |
| 39 | `health` | REAL | Renamed from `agent` 2026-09-20. `cortex/core/raid/index.js` `_agentAvailable()`'s real per-agent health snapshot (`dispatchName`, `online`, `consecutiveFails`, `callCount`, `successRate`, `role`): runtime reachability of a provider, not an agent's identity. No `.health` node files are written today (declaration only). Sovereign copies: `guardian/schemas`, `ollama/schemas`. |

## Explicitly not in this taxonomy: MCP tools

`nexus_grep`, `nexus_read_range`, and the rest of `orchestrator/lib/mcp-tools-tokensave.js` /
`orchestrator/lib/mcp-server.js`'s `TOOLS` array are **not** `.tool`, `.agent.tool`, or any other
node type here — checked and excluded on purpose. They use flat snake_case names with zero
relation to `lib/agent-tools/naming.js`'s dotted convention, and they're consumed over the MCP
protocol (stdio/SSE) by external clients, not through this codebase's internal agent-tool loop.
Recorded here explicitly so this doesn't quietly get read as "just another `.tool`" later.
Whether protocol-layer tools deserve their own taxonomy is a separate architectural decision, not
resolved by this note.

Also not a tool node: `cli/decompose.js` — developer-run build tooling (extracts code into real
node files), never agent-facing, never registered in any tool loop.

## Left agnostic on purpose (not forced this session)

- **`failure_mode`, `intent`, `system`** — stay `OPEN`. Real proposals, no backing construction site yet.
- **`job` vs `guardian_job`** — strong evidence they're the same shape, not unified. Needs a call on RAID compartment scope first.
- **`capability.events`** — field exists, `required: false`. No real capability in `registry-components.js` declares an event today; forcing this to `required` means inventing what that list even looks like. Needs a real `events:` opt on `_c()` first, mirroring how `hooks.in[].intent` already works.
- **`.jaa`, `.dom`** — checked, neither built. JAA is the storage substrate under other node types, not a node itself. DOM queries (`clear-glass/dom-archaeology.js`) are live and ephemeral, never persisted.

## Still mechanically open regardless

`node-schemas.js`'s `checkPayload()` checks only presence + `typeof`, not
array length. A `required: true` array field (e.g. `capability.intent`) can
still be `[]` and pass. Any "must map to at least one X" rule that needs to
be actually enforced, not just documented, requires changing `checkPayload()`
itself.

## On "none of these needed a new type" — that was wrong, corrected above

Re-checked directly after being asked. `note` was real and missed — found in
under ten minutes once actually looked for, which means the earlier passes
weren't thorough enough on this specific question, not that nothing was
there. Two more candidates surfaced during the re-check, not yet resolved:

- **`clear-glass/wire/nexus-wire.js`** — a real, standalone HTTP bridge
  process (ErosmancerOS↔ClearGlass↔NEXUS). Currently just flagged as a name
  collision with loom's `.wire` (graph edge) on `CLEARGLASS-NODE-MAP.md`.
  Whether standalone bridge processes deserve their own type (`.bridge`?) —
  `capability-map.js`'s own `SYSTEMS` map already has a `'bridge'` entry —
  is a real open question, not resolved this pass.
- **`clear-glass/src/mesh/agent-mesh.js`'s per-tab agent sessions** — real,
  adjacent to `.agent`, not confirmed as the same shape as guardian's
  `KNOWN_PROVIDERS`. Could be a distinct `.provider_session`-type thing, or
  could just be `.agent` with fields not yet checked. Not resolved.

## Reconciliation note

Three sources disagreed: the `nexus-v0_39_112-decomposed.zip` snapshot (30
schema files, 11 never wired into `KNOWN_TYPES`), the `node-export.js`
uploaded directly (24 `KNOWN_TYPES`, newer than the zip), and this thread's
own running list (`spec`, `nex`, `clips`, `synthesis`, `input`, `output`,
`capability`, `event`). The union of the latter two, excluding 9 zip-only
esoteric types belonging to other subsystems (`meta/crystal-lattice.js` /
`intelligence/liminal-space` / `intelligence/lattice` / guardian's own
`SHARED_TYPES`), is exactly 32.
