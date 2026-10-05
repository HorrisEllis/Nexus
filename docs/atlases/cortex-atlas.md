# cortex — The Memory and Brain of NEXUS

> **v3.5.0 (active)** · port 3748 · six organs boot in sequence, connected only by the event bus

**Author:** James Brooks (Erosmancer) · rheon.world

---

## What It Is

Cortex is where everything that needs to be remembered, learned, healed, or routed passes through. Its own spec states the discipline plainly: six organs boot in a fixed sequence, each subscribing to and emitting events — *"no organ calls another directly."* Friction (per-gap severity, 0.0–1.0) is a first-class concept here, distinct from `loom`'s registry-strain friction and the nerve domain's UX-drift friction — three unrelated real meanings of the same word across the codebase, cortex's being the oldest and most load-bearing.

---

## Quick Start

Not confirmed this session.

---

## File Structure

Not enumerated directly — organs and routes below are known from the spec; the underlying file layout was not read.

---

## Architecture

### Spine

Not confirmed — cortex's own event bus connects its six organs; whether that bus is WARP itself or a cortex-local equivalent was not confirmed this session.

### Governing axioms

`AX-001, AX-002, AX-003, AX-005` — per `cortex.spec`'s `core.axioms`; individual statements not read this session.

### Boundaries (documentation clarity)

| Term | Definition | Distinguished from |
|---|---|---|
| Cortex's `friction` (`Gap.friction`, `FailureMode.friction`) | a per-gap severity score, 0.0 (nominal) to 1.0 (failure) | `loom`'s registry-strain friction (orphan hooks + open gaps) and `genesis.spec`'s nerve-domain UX friction — three real, unrelated meanings |

### Sovereignty (cross-system contract)

| Other system | May read | May never write | Enforced by |
|---|---|---|---|
| any | `GET /api/gaps`, `/api/memory/working`, `/api/failure-modes`, `/api/friction`, `/api/chat-log`, `/api/search`, `/api/raid/decide` | direct writes to cortex's memory tiers — must go through `POST /api/memory/write`, `POST /api/event`, `POST /api/table/insert` | not independently verified as process-isolated this session |

### Pulse (liveness)

Real, three-tier, from `core.constants`: `HB_HEALTH_MS: 10000` (health probe, 10s), `HB_PULSE_MS: 30000` (API pulse, 30s), `HB_TELEMETRY_MS: 60000` (telemetry frame, 60s). Matches the `heartbeat` organ (order 6 in the boot sequence) exactly.

### Self-diagnostics (structural strain)

| Metric | Computed from | Formula | Exposed at |
|---|---|---|---|
| `friction` (per-gap) | `Gap.friction` field, 0.0–1.0 | thresholds real: `FRICTION_NOMINAL: 0.0`, `FRICTION_ELEVATED: 0.4`, `FRICTION_HIGH: 0.7`, `FRICTION_FAILURE: 1.0` | `GET /api/friction` |

### Config layers / Phases / Component status

Not confirmed this session.

---

## The Modules

<!-- Cortex's "modules" are its six organs — a different real shape than
     component/hook/wire node files, kept as-is rather than forced into
     that mold. -->

---

### The six organs

**id:** `cortex.organs` (the boot sequence itself, not one module)

**What it does**

Six organs boot in a fixed order, each subscribing to and emitting events only — no direct calls between them.

| Order | Organ | Purpose | Subscribes | Emits |
|---|---|---|---|---|
| 1 | `gap-finder` | watches event stream for stale modules, axiom violations, recurring failures | `*` | `cortex.gap.found` |
| 2 | `healer` | prescribes fixes for open gaps using diagnostic engine results | `cortex.gap.found` | `cortex.heal.requested` |
| 3 | `self-heal` | 5-level escalation ladder with friction ledger | `cortex.heal.requested`, `HEAL_REQUESTED` | `cortex.heal.applied`, `cortex.heal.failed`, `cortex.escalation.*` |
| 4 | `orion` | sensor + policy — classifies requests, routes to context | `*` | `cortex.orion.classified` |
| 5 | `raid` | provider selection — 9 clusters, 5 NCP providers, Ollama primary | `cortex.orion.classified` | `cortex.raid.decided` |
| 6 | `heartbeat` | 3-tier liveness (see Pulse above) | none | `cortex.health`, `heartbeat.tick`, `heartbeat.pulse`, `heartbeat.frame` |

**How it works internally**

The `raid` organ (order 5) is the same RAID routing `guardian.spec`'s `raid_routing` describes from the consumer side — cortex classifies and decides, guardian dispatches. This is a real, confirmed seam between the two systems: cortex emits `cortex.raid.decided`, guardian's own spec lists `handles: cortex.raid.decided → dispatch to chosen provider`.

**Commands / How to use it**

Not read this session.

**HTTP routes** — real, from `cortex.spec`'s own `routes:`:

```
Internal:
  GET  /health
  GET  /contract
  GET  /events (SSE)

External:
  GET  /api/gaps?status=            POST /api/gaps/resolve
  GET  /api/memory/working           POST /api/memory/write
  POST /api/memory/forget             GET  /api/failure-modes
  GET  /api/friction                    GET  /api/chat-log
  GET  /api/search?q=&threshold=          POST /api/search/context
  GET  /api/search/status                   GET  /api/raid/decide?intent=
  POST /api/meta/observe                      GET  /api/meta/gaps
  GET  /api/meta/bda                            POST /api/meta/classify
  GET  /api/engines                               POST /api/event
  POST /api/table/insert                            GET  /api/self-heal/status
```

**What it connects to**

- `guardian` — `cortex.raid.decided` is what guardian's own spec lists as its primary inbound handle
- `versionium` — `_field.entropy` feeds versionium's sigma-gated auto-commit (per `versionium.spec`)

**Bus events emitted**

`cortex.booted`, `cortex.gap.found`, `cortex.gap.resolved`, `cortex.gap.escalated`, `cortex.heal.requested`, `cortex.heal.applied`, `cortex.heal.failed`, `cortex.memory.written`, `cortex.memory.forgotten`, `cortex.intelligence.pattern_crystallised`, `cortex.raid.decided`, `cortex.snapshot.created`, `cortex.escalation.friction_increased`, `cortex.escalation.failure_mode`, `escalation.level_0` through `escalation.level_4`, `component.registered`/`component.updated` (from component-registry) — all real, from `cortex.spec`'s own `events.emits`.

---

## Modules Not Yet Built

Not determined — `cortex.spec`'s `gaps:`/`history:` sections not read this session.

---

## Build & Run Reference

Not confirmed.

---

## Version History

**Source:** NOT CONFIRMED EITHER WAY — whether cortex reports to Versionium wasn't checked this session. Cortex's own `versionium.spec` connection is real (versionium's engine originated as `cortex/versionium/index.js`), which makes this worth checking directly rather than assuming.

---

<!-- generated:registry:start -->

## What the registry knows (generated)

> Generated by `scripts/generate-atlases.js` from loom's registry and events (loom/data/registry.json, loom/data/events.json — data, outside the snapshot, so written plain) and the tree itself, 2026-10-05. Everything between the markers is rewritten on the next run — write narrative above them. The same facts, one component at a time, are what `lib/registry-harness.js` hands a repo agent (loom.card.tool).

**73** files · **40** code files · **23** registry components declared here · **4** events emitted · **4** heard · **23** routes · **18** code files with a covering test

### Routes (23)

- GET /api/chat-log — Co-pilot conversation log · declared in `cortex/registry-components.js`
- GET /api/events — Query event log · declared in `cortex/registry-components.js`
- GET /api/gaps — Open gaps by severity · declared in `cortex/registry-components.js`
- GET /api/memory — Browse any JAA table · declared in `cortex/registry-components.js`
- GET /api/memory/working — Working memory snapshot · declared in `cortex/registry-components.js`
- GET /api/raid/health — RAID agent health + weights · declared in `cortex/registry-components.js`
- GET /api/search — Cross-table search · declared in `cortex/registry-components.js`
- GET /api/snapshots — Snapshot list · declared in `cortex/registry-components.js`
- GET /api/tags — All tags in memory · declared in `cortex/registry-components.js`
- GET /api/versionium/log — MOVED to versionium :3754 GET /api/versionium/history — cortex answers with a moved notice · declared in `cortex/registry-components.js`
- GET /contract — Cortex interaction contract · declared in `cortex/registry-components.js`
- GET /events — SSE — all cortex events · declared in `cortex/registry-components.js`
- GET /health — Cortex health + JAA stats · declared in `cortex/registry-components.js`
- POST /api/event — Write event to JAA event_log · declared in `cortex/registry-components.js`
- POST /api/gaps — Open a new gap · declared in `cortex/registry-components.js`
- POST /api/memory/forget — Archive memory row (never delete) · declared in `cortex/registry-components.js`
- POST /api/memory/insert — Insert row into any JAA table · declared in `cortex/registry-components.js`
- POST /api/memory/search — Semantic search across memory · declared in `cortex/registry-components.js`
- POST /api/raid/decide — Route intent to best agent/component · declared in `cortex/registry-components.js`
- POST /api/search/context — Context assembly for search query · declared in `cortex/registry-components.js`
- POST /api/snapshots/create — Create snapshot · declared in `cortex/registry-components.js`
- POST /api/snapshots/rollback — Rollback to snapshot · declared in `cortex/registry-components.js`
- POST /api/tags — Add tag · declared in `cortex/registry-components.js`

### Events it emits (4) — and who hears them

- **raid.route.request** — from `cortex/core/raid/router.js` → `cortex/core/raid/router.js`, `tests/modules/test-raid-router.js` (core)
- **cortex.orion.classified** — from `cortex/orion/index.js` → `tests/modules/test-orion.js` (core)
- **raid.route.decided** — from `cortex/core/raid/router.js` → `tests/modules/test-raid-router.js` (core)
- **raid.route.no_route** — from `cortex/core/raid/router.js` → `tests/modules/test-raid-router.js` (core)

### Events it hears from elsewhere (3)

**anomaly.detected** (core) · **sigma.event.halt_risk** (orchestrator, core) · **sigma.event.warning** (orchestrator, core)

### Files, directory by directory (13 directories)

#### `cortex/`

7 code · 2 other file(s).

- `cortex/boot.js` (1545 lines)  
  exports server, jaaDB · requires 1 · required by 1 · tested by `tests/modules/cortex-sse-broadcast.test.js`
- `cortex/config.js` (22 lines) — real, distinct config, not inline constants scattered across cortex/boot.js. Matches the pattern established by  
  exports PORT, OR_URL, GD_URL, OL_URL, IN_PORT · requires 0 · required by 2
- `cortex/cortex-v2.js` (1375 lines) — // ── core/cortex-v2.js ───────────────────────────────────────────────────────── // CORTEX v2 — full NEXUS CLI
- `cortex/event-taxonomy.js` (34 lines) — // cortex/event-taxonomy.js — every event cortex emits, in the ET1 shape (lib/event-taxonomy-pattern.js). // component_id: cortex.event-taxonomy
- `cortex/personas.js` (123 lines) — Personality profiles for Copilot §GAP CLOSED 2026-07-07 — forge.spec's "personalities" piece, confirmed  
  exports PersonaStore, DEFAULT_PERSONAS
- `cortex/push-recall.js` (304 lines)  
  exports CortexPushRecall, VALID_TIERS, INTENT_LANES, TIER_PULL_WEIGHT · requires 3 · required by 0
- `cortex/registry-components.js` (63 lines) — cortex/registry-components.js
- other: `cortex/compartment.json`, `cortex/interaction-contract.json`

#### `cortex/contract/`

1 code file(s).

- `cortex/contract/index.js` (152 lines) — Agent Interaction Contracts One source of truth for "what is this source of requests allowed to do."  
  exports CONTRACTS, get · tested by `tests/pipeline.test.js`

#### `cortex/core/raid/`

13 code file(s).

- `cortex/core/raid/context-gate.js` (146 lines)  
  exports gateCandidate, gateCandidates
- `cortex/core/raid/context-synthesis.js` (177 lines)  
  exports synthesizeContext, ALL_SYSTEMS
- `cortex/core/raid/contract-boundary.js` (200 lines)  
  exports resolveBoundary, listBoundaries, REGISTRY
- `cortex/core/raid/contract-intake.js` (1390 lines) — // cortex/core/raid/contract-intake.js — real RAID input queue + compartment- // per-contract dispatch. UUID: nexus-raid-contract-intake-v1-0000-2026-0828-001  
  exports submitContract, submitIdeariumChunk, submitBuildPhaseContract, synthesizeContract, BUILD_CONTRACT_SCHEMA, reportExternalOutcome +13 · requires 3 · required by 5 · tested by `tests/modules/contract-intake-dependency-graph.test.js`, `tests/modules/contract-intake-tangible-file.test.js` +5
- `cortex/core/raid/envelope.js` (87 lines) — the universal request envelope THE PRINCIPLE (James, 2026-07-21): "the request comes from co-pilot or one  
  exports MODULE_ID, VERSION, STATUS, make, stamp, isValid · requires 0 · required by 1 · tested by `tests/modules/test-raid-router.js`
- `cortex/core/raid/event-taxonomy.js` (41 lines) — // cortex/core/raid/event-taxonomy.js — RAID's own real event vocabulary. // Conforms to lib/event-taxonomy-pattern.js's ET1 shape (same convention as  
  requires 0 · required by 1
- `cortex/core/raid/index.js` (876 lines)  
  exports MODULE_ID, VERSION, _decide, _cluster, _health, _weights +18 · requires 1 · required by 6 · tested by `tests/modules/idearium-guardian-dispatch.test.js`, `tests/modules/raid-approve-tool.test.js` +2
- `cortex/core/raid/officiator.js` (327 lines)  
  exports start, stop, tick, officiate, synthesizeFromContext, MODULE_ID +1 · requires 1 · required by 2
- `cortex/core/raid/router.js` (209 lines) — RAID as the universal entry point "The start point doesn't matter, as long as it goes to RAID." (James)  
  exports MODULE_ID, VERSION, init, stop, health, route +5 · requires 2 · required by 0 · emits raid.route.decided, raid.route.no_route, raid.route.request · hears raid.route.request · tested by `tests/modules/test-raid-router.js`
- `cortex/core/raid/routing-ir.js` (127 lines) — Routing IR spec: docs/raid.spec (extends, does not replace)  
  exports buildRoutingIR · requires 1 · required by 0
- `cortex/core/raid/snr-filter.js` (168 lines)  
  exports MODULE_ID, VERSION, filter, checkInvariant, stats · requires 2 · required by 2 · tested by `tests/modules/test-snr-filter.js`
- `cortex/core/raid/tunables.js` (89 lines) — RAID's Cortex-backed tunable parameters Every threshold and neutral-fallback value RAID and its SNR gate use is  
  exports get, set, load, reload, reset, DEFAULTS +1 · requires 1 · required by 2 · tested by `tests/modules/raid-tunables.test.js`
- `cortex/core/raid/worker.js` (87 lines) — real, periodic queue drain §HIGHEST LEVERAGE, CLOSING THE LOOP 2026-08-29 — real, critical gap  
  exports start, stop, tick, MODULE_ID, VERSION, INTERVAL_MS · requires 1 · required by 0

#### `cortex/gap-finder/`

1 code file(s).

- `cortex/gap-finder/index.js` (102 lines) — Gap-Finder Organ Turns real signal into real gaps. Two inputs, both already live in the  
  exports MODULE_ID, VERSION, init, stop, health, _createGap · requires 1 · required by 0 · tested by `tests/modules/test-gap-finder.js`

#### `cortex/input/`

1 other file(s).

- other: `cortex/input/1b508067-bc0c-4a83-953c-7603c87fdec3.contract`

#### `cortex/memory/`

9 code file(s).

- `cortex/memory/bep-lookup.js` (52 lines) — BEP pattern matching (read side) §BUILT 2026-07-12 — push-recall.js's own header names the bep lane as  
  exports lookupBEPMatch · requires 2 · required by 1
- `cortex/memory/causal-lookup.js` (80 lines) — Causal graph connectivity (read side) §BUILT 2026-07-12 — push-recall.js's own header names the causal lane as  
  exports causalScore, _buildRecentGraph · requires 1 · required by 1
- `cortex/memory/decay.js` (191 lines) — Tier-based decay/eviction §BUILT 2026-07-12 — the real MEMORY_TIERS behavior cortex.spec has  
  exports runDecaySweep, startDecayTicker, stopDecayTicker, isExpired, liveRows, expiryReport +1 · requires 2 · required by 0
- `cortex/memory/fix-map.js` (98 lines) — Failure → Fix mapping §BUILT 2026-07-12 — cortex/push-recall.js's own header has said since  
  exports recordFix, lookupFix, _tokenize, _tokenOverlap, MODULE_ID · requires 1 · required by 2
- `cortex/memory/jaa-db.js` (396 lines) — Cortex memory bridge Re-exports a shared JaaStore instance pointed at the cortex data dir.  
  exports jaaDB, uid, JaaDB, TABLE_TIERS, MEMORY_TIERS, ALL_TABLES
- `cortex/memory/relevance.js` (226 lines)  
  exports buildIndex, loadRecurrence, score, pressure, UUID_RE, VERSION
- `cortex/memory/table-compactor.js` (259 lines)  
  exports MODULE_ID, compactTable, capTable, start, stop, startCaps +1 · requires 1 · required by 1 · tested by `tests/modules/test-table-compactor.js`
- `cortex/memory/table-deduplicator.js` (263 lines)  
  exports MODULE_ID, dedupeTable, dedupeAll, insertDeduped, start, stop · requires 0 · required by 2 · tested by `tests/modules/test-table-deduplicator.js`
- `cortex/memory/tiers.js` (123 lines) — Memory tier definitions §BUILT 2026-07-12 — "need what's missing built again, not flat or stubs."  
  exports MEMORY_TIERS, TABLE_TIERS, tierFor, tierConfig · requires 0 · required by 4 · tested by `tests/modules/test-sigma-compaction.js`, `tests/modules/test-table-compactor.js`

#### `cortex/orion/`

1 code file(s).

- `cortex/orion/index.js` (103 lines) — Orion Classification Organ "Sensor + policy. Classifies requests, routes to context" (cortex.spec).  
  exports MODULE_ID, VERSION, init, stop, health, _classify · emits cortex.orion.classified · hears anomaly.detected, sigma.event.halt_risk, sigma.event.warning · tested by `tests/modules/test-orion.js`

#### `cortex/output/`

2 other file(s).

- other: `cortex/output/.gitkeep`, `cortex/output/1b508067-bc0c-4a83-953c-7603c87fdec3.contract`

#### `cortex/schemas/`

1 code · 26 other file(s).

- `cortex/schemas/index.js` (51 lines) — // cortex/schemas/index.js — cortex's own, fully sovereign schema registry. //  
  exports get, list, SCHEMAS, MODULE_ID, VERSION · requires 1 · required by 0
- other: 26 files (.account_identity_index_entry, .bep_pattern, .capability, .chat_log, .component, .component_projection, .constitution_decision, .contract)

#### `cortex/self-heal/`

4 code file(s).

- `cortex/self-heal/escalation.js` (382 lines)  
  exports MODULE_ID, VERSION, init, stop, health, wireAnomalyTrigger +3 · requires 1 · required by 0 · tested by `tests/modules/test-config-governance.js`, `tests/modules/test-diagnostic-heal-path.js` +1
- `cortex/self-heal/failure-mode-forensics.js` (249 lines)  
  exports MODULE_ID, computeSigmaDelta, generateDebugMacro, enrichFailureMode, computeCompound, fetchCompoundViaOrchestrator · requires 3 · required by 0 · tested by `tests/modules/test-c1-compound-failure-mode.test.js`
- `cortex/self-heal/fault-taxonomy.js` (200 lines) — // cortex/self-heal/fault-taxonomy.js — Phase 1: schema + sole write authority for 'fault_taxonomy' // UUID: nexus-cortex-escalation-fault-taxonomy-v1-0000-2026-0720-001  
  exports MODULE_ID, TABLE, FRICTION_THRESHOLDS, FRICTION_DELTA_BY_LEVEL, KNOWN_FAULT_CLASSES, GAP_TYPE_TO_FAULT_CLASS +6 · requires 0 · required by 4 · tested by `tests/modules/test-diagnostic-heal-path.js`, `tests/modules/test-fault-taxonomy.js`
- `cortex/self-heal/index.js` (356 lines)  
  exports MODULE_ID, VERSION, SEMANTIC_GAP_TYPES, init, stop, health +2 · requires 2 · required by 0 · tested by `tests/modules/test-c1-compound-failure-mode.test.js`, `tests/modules/test-diagnostic-heal-path.js` +3

#### `cortex/snapshot/`

1 code file(s).

- `cortex/snapshot/index.js` (51 lines)  
  requires 0 · required by 3 · tested by `tests/modules/snapshot-integrity.test.js`, `tests/modules/test-versionium-snapshot-migration.js` +1

#### `cortex/spec/`

2 other file(s).

- other: `cortex/spec/cortex.node-taxonomy.md`, `cortex/spec/cortex.spec`

#### `cortex/tools/`

2 code file(s).

- `cortex/tools/materialize-cli.js` (46 lines) — CLI for table-materializer.js. Usage: node cortex/tools/materialize-cli.js <table> [--apply]  
  exports TABLE_CONFIGS · requires 3 · required by 0
- `cortex/tools/table-materializer.js` (181 lines)  
  exports materializeTable · requires 3 · required by 1

<!-- generated:registry:end -->

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). Part of the rheon.world / NEXUS ecosystem.
