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

> Generated by `scripts/generate-atlases.js` from loom's registry and events (loom/data/registry.json, loom/data/events.json — data, outside the snapshot, so written plain) and the tree itself, 2026-10-24. Everything between the markers is rewritten on the next run — write narrative above them. The same facts, one component at a time, are what `lib/registry-harness.js` hands a repo agent (loom.card.tool).

**359** files · **46** code files · **28** registry components declared here · **4** events emitted · **4** heard · **28** routes · **18** code files with a covering test

### Routes (28)

- GET /api/chat-log — Co-pilot conversation log · declared in `cortex/registry-components.js`
- GET /api/events — Query event log · declared in `cortex/registry-components.js`
- GET /api/failure-modes — Every failure mode, newest first (?status=open, ?class=, ?limit=) · declared in `cortex/registry-components.js`
- GET /api/failure-modes/:id — One failure mode, its row as recorded · declared in `cortex/registry-components.js`
- GET /api/failure-modes/:id/report — Its report: what failed, the chain and its holes, compound class, sigma, recurrence, hypotheses, environment — each section from its source · declared in `cortex/registry-components.js`
- GET /api/gaps — Open gaps by severity · declared in `cortex/registry-components.js`
- GET /api/memory — Browse any JAA table · declared in `cortex/registry-components.js`
- GET /api/memory/working — Working memory snapshot · declared in `cortex/registry-components.js`
- GET /api/raid/health — RAID agent health + weights · declared in `cortex/registry-components.js`
- GET /api/search — Cross-table search · declared in `cortex/registry-components.js`
- GET /api/snapshots — Snapshot list · declared in `cortex/registry-components.js`
- GET /api/store — The store by its files: base, append segments, cap, archive (0.45.0 CM3) · declared in `cortex/registry-components.js`
- GET /api/tags — All tags in memory · declared in `cortex/registry-components.js`
- GET /api/versionium/log — MOVED to versionium :3754 GET /api/versionium/history — cortex answers with a moved notice · declared in `cortex/registry-components.js`
- GET /contract — Cortex interaction contract · declared in `cortex/registry-components.js`
- GET /events — SSE — all cortex events · declared in `cortex/registry-components.js`
- GET /health — Cortex health + JAA stats · declared in `cortex/registry-components.js`
- POST /api/event — Write event to JAA event_log · declared in `cortex/registry-components.js`
- POST /api/failure-modes — A failure reaches the .failure_mode record through its one writer: {faultClass, where, source, system, summary, anchor, evidence} — the same failure again counts an occurrence · declared in `cortex/registry-components.js`
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

### Files, directory by directory (131 directories)

#### `cortex/`

8 code · 2 other file(s).

- `cortex/boot.js` (1638 lines) — // 0.60.207 DL2 — James: "make each system responsible for it's own data". Its files in the root data/ come home first (lib/data-home.js).  
  exports server, jaaDB · requires 6 · required by 4 · tested by `tests/modules/cortex-sse-broadcast.test.js`
- `cortex/config.js` (22 lines) — real, distinct config, not inline constants scattered across cortex/boot.js. Matches the pattern established by  
  exports PORT, OR_URL, GD_URL, OL_URL, IN_PORT · requires 0 · required by 2
- `cortex/cortex-service.js` (104 lines) — // service/cortex-service.js — Cortex ICO Kernel Service // UUID: nexus-cortex-service-v1-0000-4000-0000-000000000001  
  requires 4 · required by 0
- `cortex/cortex-v2.js` (1375 lines) — // ── core/cortex-v2.js ───────────────────────────────────────────────────────── // CORTEX v2 — full NEXUS CLI
- `cortex/event-taxonomy.js` (37 lines) — // cortex/event-taxonomy.js — every event cortex emits, in the ET1 shape (lib/event-taxonomy-pattern.js). // component_id: cortex.event-taxonomy
- `cortex/personas.js` (123 lines) — Personality profiles for Copilot §GAP CLOSED 2026-07-07 — forge.spec's "personalities" piece, confirmed  
  exports PersonaStore, DEFAULT_PERSONAS
- `cortex/push-recall.js` (304 lines)  
  exports CortexPushRecall, VALID_TIERS, INTENT_LANES, TIER_PULL_WEIGHT · requires 3 · required by 0
- `cortex/registry-components.js` (69 lines) — cortex/registry-components.js
- other: `cortex/compartment.json`, `cortex/interaction-contract.json`

#### `cortex/contract/`

1 code file(s).

- `cortex/contract/index.js` (152 lines) — Agent Interaction Contracts One source of truth for "what is this source of requests allowed to do."  
  exports CONTRACTS, get · tested by `tests/pipeline.test.js`

#### `cortex/core/raid/`

16 code file(s).

- `cortex/core/raid/context-gate.js` (146 lines)  
  exports gateCandidate, gateCandidates
- `cortex/core/raid/context-synthesis.js` (177 lines)  
  exports synthesizeContext, ALL_SYSTEMS
- `cortex/core/raid/contract-adapters.js` (259 lines)  
  exports VERSION, doorRoute, agentExecutor, planHash, fromPhasePlan, fromWholePhase +3 · requires 3 · required by 3
- `cortex/core/raid/contract-boundary.js` (200 lines)  
  exports resolveBoundary, listBoundaries, REGISTRY
- `cortex/core/raid/contract-gates.js` (788 lines)  
  exports VERSION, STATES, phaseBlock, load, save, validate +20 · requires 3 · required by 4
- `cortex/core/raid/contract-intake.js` (1607 lines) — // cortex/core/raid/contract-intake.js — real RAID input queue + compartment- // per-contract dispatch. UUID: nexus-raid-contract-intake-v1-0000-2026-0828-001  
  exports runContract, progress, gateBefore, registerExecutors, submitV2, legacyToV2 +19 · requires 4 · required by 6 · tested by `tests/modules/contract-intake-dependency-graph.test.js`, `tests/modules/contract-intake-tangible-file.test.js` +5
- `cortex/core/raid/contract-trace.js` (89 lines) — GW3: a contract traced end to end, one ordered story per brick. James, 2026-10-15: "each contract tracked through the system using the event ledger, tagging and each gate, the  
  exports VERSION, trace, lines
- `cortex/core/raid/envelope.js` (87 lines) — the universal request envelope THE PRINCIPLE (James, 2026-07-21): "the request comes from co-pilot or one  
  exports MODULE_ID, VERSION, STATUS, make, stamp, isValid · requires 0 · required by 1 · tested by `tests/modules/test-raid-router.js`
- `cortex/core/raid/event-taxonomy.js` (41 lines) — // cortex/core/raid/event-taxonomy.js — RAID's own real event vocabulary. // Conforms to lib/event-taxonomy-pattern.js's ET1 shape (same convention as  
  requires 0 · required by 1
- `cortex/core/raid/index.js` (900 lines)  
  exports MODULE_ID, VERSION, _decide, _cluster, _health, _weights +20 · requires 1 · required by 7 · tested by `tests/modules/idearium-guardian-dispatch.test.js`, `tests/modules/raid-approve-tool.test.js` +2
- `cortex/core/raid/officiator.js` (504 lines)  
  exports start, stop, tick, officiate, synthesizeFromContext, due +11 · requires 5 · required by 3
- `cortex/core/raid/router.js` (209 lines) — RAID as the universal entry point "The start point doesn't matter, as long as it goes to RAID." (James)  
  exports MODULE_ID, VERSION, init, stop, health, route +5 · requires 2 · required by 0 · emits raid.route.decided, raid.route.no_route, raid.route.request · hears raid.route.request · tested by `tests/modules/test-raid-router.js`
- `cortex/core/raid/routing-ir.js` (127 lines) — Routing IR spec: docs/raid.spec (extends, does not replace)  
  exports buildRoutingIR · requires 1 · required by 0
- `cortex/core/raid/snr-filter.js` (168 lines)  
  exports MODULE_ID, VERSION, filter, checkInvariant, stats · requires 2 · required by 2 · tested by `tests/modules/test-snr-filter.js`
- `cortex/core/raid/tunables.js` (89 lines) — RAID's Cortex-backed tunable parameters Every threshold and neutral-fallback value RAID and its SNR gate use is  
  exports get, set, load, reload, reset, DEFAULTS +1 · requires 1 · required by 2 · tested by `tests/modules/raid-tunables.test.js`
- `cortex/core/raid/worker.js` (95 lines) — real, periodic queue drain §HIGHEST LEVERAGE, CLOSING THE LOOP 2026-08-29 — real, critical gap  
  exports start, stop, tick, MODULE_ID, VERSION, INTERVAL_MS · requires 2 · required by 0

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
  exports recordFix, lookupFix, _tokenize, _tokenOverlap, MODULE_ID · requires 1 · required by 3
- `cortex/memory/jaa-db.js` (396 lines) — Cortex memory bridge Re-exports a shared JaaStore instance pointed at the cortex data dir.  
  exports jaaDB, uid, JaaDB, TABLE_TIERS, MEMORY_TIERS, ALL_TABLES
- `cortex/memory/relevance.js` (226 lines)  
  exports buildIndex, loadRecurrence, score, pressure, UUID_RE, VERSION
- `cortex/memory/table-compactor.js` (341 lines)  
  exports storeReport, CAPS, capFor, capRows, archiveRows, readArchive +7 · requires 1 · required by 1 · tested by `tests/modules/test-table-compactor.js`
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

#### `cortex/phases/`

1 other file(s).

- other: `cortex/phases/INDEX.md`

#### `cortex/phases/2026-08-23-backlog/`

1 other file(s).

- other: `cortex/phases/2026-08-23-backlog/BL13_cortex_component_registry_move.phase`

#### `cortex/phases/2026-08-23-backlog/graph/`

1 other file(s).

- other: `cortex/phases/2026-08-23-backlog/graph/BL13_cortex_component_registry_move-805fd32c1fb017b3.graph`

#### `cortex/phases/2026-08-23-backlog/graph/_superseded/`

2 other file(s).

- other: `cortex/phases/2026-08-23-backlog/graph/_superseded/BL13_cortex_component_registry_move-192cb899df4586a7.graph`, `cortex/phases/2026-08-23-backlog/graph/_superseded/BL13_cortex_component_registry_move-7967e5a04f2c6d03.graph`

#### `cortex/phases/2026-08-28-self-building-pipeline/`

4 other file(s).

- other: `cortex/phases/2026-08-28-self-building-pipeline/SBP3_wire_contract_intake_through_routing_ir.phase`, `cortex/phases/2026-08-28-self-building-pipeline/SBP4_wire_loom_and_selfheal_as_real_contract_sources.phase`, `cortex/phases/2026-08-28-self-building-pipeline/SBP5_cortex_data_organization_scoping.phase`, `cortex/phases/2026-08-28-self-building-pipeline/SBP7_DESIGN_PRINCIPLE_automation_over_code.phase`

#### `cortex/phases/2026-08-28-self-building-pipeline/graph/`

4 other file(s).

- other: `cortex/phases/2026-08-28-self-building-pipeline/graph/SBP3_wire_contract_intake_through_routing_ir-fc98fa52ec2138cc.graph`, `cortex/phases/2026-08-28-self-building-pipeline/graph/SBP4_wire_loom_and_selfheal_as_real_contract_sources-0aba181788b96d2d.graph`, `cortex/phases/2026-08-28-self-building-pipeline/graph/SBP5_cortex_data_organization_scoping-6d939bafad4b1587.graph`, `cortex/phases/2026-08-28-self-building-pipeline/graph/SBP7_DESIGN_PRINCIPLE_automation_over_code-400d5ed02418fda3.graph`

#### `cortex/phases/2026-08-28-self-building-pipeline/graph/_superseded/`

3 other file(s).

- other: `cortex/phases/2026-08-28-self-building-pipeline/graph/_superseded/SBP3_wire_contract_intake_through_routing_ir-cd59baa39d390724.graph`, `cortex/phases/2026-08-28-self-building-pipeline/graph/_superseded/SBP4_wire_loom_and_selfheal_as_real_contract_sources-8d7fc37478dacfed.graph`, `cortex/phases/2026-08-28-self-building-pipeline/graph/_superseded/SBP7_DESIGN_PRINCIPLE_automation_over_code-d3947752becd8cf4.graph`

#### `cortex/phases/2026-08-30-interaction-contract-context/`

1 other file(s).

- other: `cortex/phases/2026-08-30-interaction-contract-context/IC6_multi_source_code_request_intake.phase`

#### `cortex/phases/2026-08-30-interaction-contract-context/graph/`

1 other file(s).

- other: `cortex/phases/2026-08-30-interaction-contract-context/graph/IC6_multi_source_code_request_intake-3b8e45f1669c337d.graph`

#### `cortex/phases/2026-08-30-interaction-contract-context/graph/_superseded/`

1 other file(s).

- other: `cortex/phases/2026-08-30-interaction-contract-context/graph/_superseded/IC6_multi_source_code_request_intake-f808f7b781912a8f.graph`

#### `cortex/phases/2026-09-02-nexus-vision-master/`

4 other file(s).

- other: `cortex/phases/2026-09-02-nexus-vision-master/LM5_data_decay_per_system.phase`, `cortex/phases/2026-09-02-nexus-vision-master/SR4_fitness_driven_contract_adjustment.phase`, `cortex/phases/2026-09-02-nexus-vision-master/T5_raid_full_cli.phase`, `cortex/phases/2026-09-02-nexus-vision-master/V9_precommit_gate_for_raid_contracts.phase`

#### `cortex/phases/2026-09-02-nexus-vision-master/graph/`

4 other file(s).

- other: `cortex/phases/2026-09-02-nexus-vision-master/graph/LM5_data_decay_per_system-efe5ccad809d27f3.graph`, `cortex/phases/2026-09-02-nexus-vision-master/graph/SR4_fitness_driven_contract_adjustment-d411d9559fb15a73.graph`, `cortex/phases/2026-09-02-nexus-vision-master/graph/T5_raid_full_cli-7d28327319592af8.graph`, `cortex/phases/2026-09-02-nexus-vision-master/graph/V9_precommit_gate_for_raid_contracts-678e3c1a73a353dc.graph`

#### `cortex/phases/2026-09-02-nexus-vision-master/graph/_superseded/`

4 other file(s).

- other: `cortex/phases/2026-09-02-nexus-vision-master/graph/_superseded/LM5_data_decay_per_system-1481fffb9897c15e.graph`, `cortex/phases/2026-09-02-nexus-vision-master/graph/_superseded/LM5_data_decay_per_system-968c129f68946726.graph`, `cortex/phases/2026-09-02-nexus-vision-master/graph/_superseded/T5_raid_full_cli-0ea6cdd19666fd57.graph`, `cortex/phases/2026-09-02-nexus-vision-master/graph/_superseded/V9_precommit_gate_for_raid_contracts-088f2ec27fdd977e.graph`

#### `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/`

10 other file(s).

- other: `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/CG3_relay_into_cortex_sse.phase`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/CP1_tool_index_hooked_to_living_model.phase`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/CP2_copilot_versionium_awareness.phase`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/CP3_git_vs_versionium_decision.phase`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/DF2_cortex_and_versionium_off_root_data.phase`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/HIST1_boundary_constraint_history_schema.phase`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/ID1_resolve_versionium_cortex_dependency.phase`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/IDU1_idearium_homepage_and_repo_browser.phase`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/REG1_component_registry_remap.phase`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/VSB1_fix_versionium_split_brain.phase`

#### `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/`

10 other file(s).

- other: `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/CG3_relay_into_cortex_sse-ee570819a8ed9ff7.graph`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/CP1_tool_index_hooked_to_living_model-ce14ab9b2c29744b.graph`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/CP2_copilot_versionium_awareness-dc90fa1d06d6df9e.graph`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/CP3_git_vs_versionium_decision-5596e1b70a39c284.graph`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/DF2_cortex_and_versionium_off_root_data-c96f8a628c4e5351.graph`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/HIST1_boundary_constraint_history_schema-7a9b8b7a2b2c78de.graph`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/ID1_resolve_versionium_cortex_dependency-4782d4c5e56ab572.graph`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/IDU1_idearium_homepage_and_repo_browser-59239d65a2593d97.graph`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/REG1_component_registry_remap-dcf23596eadaa570.graph`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/VSB1_fix_versionium_split_brain-c96466b594b05150.graph`

#### `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/_superseded/`

3 other file(s).

- other: `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/_superseded/CG3_relay_into_cortex_sse-24e51983a5045f80.graph`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/_superseded/CG3_relay_into_cortex_sse-7b826bf2033ae46a.graph`, `cortex/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/_superseded/DF2_cortex_and_versionium_off_root_data-878b01658023f007.graph`

#### `cortex/phases/2026-09-11-compartment-nodetype-and-reorg/`

3 other file(s).

- other: `cortex/phases/2026-09-11-compartment-nodetype-and-reorg/D2_self_heal_migration.phase`, `cortex/phases/2026-09-11-compartment-nodetype-and-reorg/R1_recall_to_lib.phase`, `cortex/phases/2026-09-11-compartment-nodetype-and-reorg/V2_snapshot_ownership_decision.phase`

#### `cortex/phases/2026-09-11-compartment-nodetype-and-reorg/graph/`

3 other file(s).

- other: `cortex/phases/2026-09-11-compartment-nodetype-and-reorg/graph/D2_self_heal_migration-faec61e1a007112e.graph`, `cortex/phases/2026-09-11-compartment-nodetype-and-reorg/graph/R1_recall_to_lib-32458afe2804d0bc.graph`, `cortex/phases/2026-09-11-compartment-nodetype-and-reorg/graph/V2_snapshot_ownership_decision-812e620fe68626d8.graph`

#### `cortex/phases/2026-09-11-compartment-nodetype-and-reorg/graph/_superseded/`

1 other file(s).

- other: `cortex/phases/2026-09-11-compartment-nodetype-and-reorg/graph/_superseded/D2_self_heal_migration-5f98a58f11bf4291.graph`

#### `cortex/phases/2026-09-11-sovereign-node-architecture/`

1 other file(s).

- other: `cortex/phases/2026-09-11-sovereign-node-architecture/P11_unify_failure_tracking.phase`

#### `cortex/phases/2026-09-11-sovereign-node-architecture/graph/`

1 other file(s).

- other: `cortex/phases/2026-09-11-sovereign-node-architecture/graph/P11_unify_failure_tracking-349d9e95cc879e13.graph`

#### `cortex/phases/2026-09-11-sovereign-node-architecture/graph/_superseded/`

1 other file(s).

- other: `cortex/phases/2026-09-11-sovereign-node-architecture/graph/_superseded/P11_unify_failure_tracking-3a5dd3cf9faa33c1.graph`

#### `cortex/phases/2026-09-13-axiom-5-2-raid-routing/`

2 other file(s).

- other: `cortex/phases/2026-09-13-axiom-5-2-raid-routing/MCO12_guardian_audit_complete.phase`, `cortex/phases/2026-09-13-axiom-5-2-raid-routing/MCO8_wire_the_honest_subset.phase`

#### `cortex/phases/2026-09-13-axiom-5-2-raid-routing/graph/`

2 other file(s).

- other: `cortex/phases/2026-09-13-axiom-5-2-raid-routing/graph/MCO12_guardian_audit_complete-47d560ccb245778e.graph`, `cortex/phases/2026-09-13-axiom-5-2-raid-routing/graph/MCO8_wire_the_honest_subset-6c5ec7d7d9b5e180.graph`

#### `cortex/phases/2026-09-13-axiom-5-2-raid-routing/graph/_superseded/`

3 other file(s).

- other: `cortex/phases/2026-09-13-axiom-5-2-raid-routing/graph/_superseded/MCO12_guardian_audit_complete-ff11ef686e0084e9.graph`, `cortex/phases/2026-09-13-axiom-5-2-raid-routing/graph/_superseded/MCO8_wire_the_honest_subset-532466528ec12a38.graph`, `cortex/phases/2026-09-13-axiom-5-2-raid-routing/graph/_superseded/MCO8_wire_the_honest_subset-ea1b8c0c845ac17a.graph`

#### `cortex/phases/2026-09-13-track-b-sovereignty/`

2 other file(s).

- other: `cortex/phases/2026-09-13-track-b-sovereignty/MCO17_contract_boundary_retracted.phase`, `cortex/phases/2026-09-13-track-b-sovereignty/MCO18_interaction_contract_split_scoped.phase`

#### `cortex/phases/2026-09-13-track-b-sovereignty/graph/`

2 other file(s).

- other: `cortex/phases/2026-09-13-track-b-sovereignty/graph/MCO17_contract_boundary_retracted-7e7a95ae7baa92ae.graph`, `cortex/phases/2026-09-13-track-b-sovereignty/graph/MCO18_interaction_contract_split_scoped-cdf5f24602f5099b.graph`

#### `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/`

9 other file(s).

- other: `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/B1_field_ownership.phase`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/B2_jaadb_not_single_writer.phase`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/B3_availability_tier.phase`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/B4_userscript_cutover.phase`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/B6_two_intelligence_runtimes.phase`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/P1_characterization.phase`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/P3_cortex_becomes_forwarder.phase`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/P5_retire_second_runtime.phase`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/P6_versionium_residue.phase`

#### `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/`

9 other file(s).

- other: `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/B1_field_ownership-b57173bf62bbbbb6.graph`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/B2_jaadb_not_single_writer-4582fd7af8add214.graph`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/B3_availability_tier-f68d2fbfc81ad872.graph`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/B4_userscript_cutover-3f2e8e0e67d4f20b.graph`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/B6_two_intelligence_runtimes-6cf78d79220d925a.graph`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/P1_characterization-47dc454012e2d666.graph`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/P3_cortex_becomes_forwarder-76fa1bf1526a963a.graph`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/P5_retire_second_runtime-9b76145ee7b05ca9.graph`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/P6_versionium_residue-16ec7c94e45a4c8c.graph`

#### `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/_superseded/`

5 other file(s).

- other: `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/_superseded/B2_jaadb_not_single_writer-d497d683710ee21c.graph`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/_superseded/B6_two_intelligence_runtimes-0258dad07ec7a2de.graph`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/_superseded/B6_two_intelligence_runtimes-a698c063f3e574d8.graph`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/_superseded/P5_retire_second_runtime-7cbaf0dae879f2ed.graph`, `cortex/phases/2026-09-19-cortex-to-intelligence-and-versionium-consolidation/graph/_superseded/P5_retire_second_runtime-ab577dbf90759953.graph`

#### `cortex/phases/2026-09-28-graph-build-context-settings-memory/`

3 other file(s).

- other: `cortex/phases/2026-09-28-graph-build-context-settings-memory/C2.phase`, `cortex/phases/2026-09-28-graph-build-context-settings-memory/M2.phase`, `cortex/phases/2026-09-28-graph-build-context-settings-memory/M3.phase`

#### `cortex/phases/2026-09-28-graph-build-context-settings-memory/graph/`

3 other file(s).

- other: `cortex/phases/2026-09-28-graph-build-context-settings-memory/graph/C2-842f49b7549b7e11.graph`, `cortex/phases/2026-09-28-graph-build-context-settings-memory/graph/M2-c3d984c459473a1e.graph`, `cortex/phases/2026-09-28-graph-build-context-settings-memory/graph/M3-200567ad6e458beb.graph`

#### `cortex/phases/2026-09-28-graph-build-context-settings-memory/graph/_superseded/`

3 other file(s).

- other: `cortex/phases/2026-09-28-graph-build-context-settings-memory/graph/_superseded/C2-b34cbf403596480b.graph`, `cortex/phases/2026-09-28-graph-build-context-settings-memory/graph/_superseded/M2-3bfe2ca613898a9e.graph`, `cortex/phases/2026-09-28-graph-build-context-settings-memory/graph/_superseded/M3-bad6fa3cd17bd889.graph`

#### `cortex/phases/2026-09-28-staging-self-heal/`

1 other file(s).

- other: `cortex/phases/2026-09-28-staging-self-heal/C1.phase`

#### `cortex/phases/2026-09-28-staging-self-heal/graph/`

1 other file(s).

- other: `cortex/phases/2026-09-28-staging-self-heal/graph/C1-54047179b286c733.graph`

#### `cortex/phases/2026-10-01-idearium-agent-ready-master/`

1 other file(s).

- other: `cortex/phases/2026-10-01-idearium-agent-ready-master/PF9_boot_memory_census.phase`

#### `cortex/phases/2026-10-01-idearium-agent-ready-master/graph/`

1 other file(s).

- other: `cortex/phases/2026-10-01-idearium-agent-ready-master/graph/PF9_boot_memory_census-b07527e89c4880dd.graph`

#### `cortex/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/`

1 other file(s).

- other: `cortex/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/PF9_boot_memory_census-c2a0c372cf2327b6.graph`

#### `cortex/phases/2026-10-02-emerge-field-memory-build/`

2 other file(s).

- other: `cortex/phases/2026-10-02-emerge-field-memory-build/FM1_mining_failure_modes.phase`, `cortex/phases/2026-10-02-emerge-field-memory-build/MR4_field_memory.phase`

#### `cortex/phases/2026-10-02-emerge-field-memory-build/graph/`

2 other file(s).

- other: `cortex/phases/2026-10-02-emerge-field-memory-build/graph/FM1_mining_failure_modes-4584c0639e11da24.graph`, `cortex/phases/2026-10-02-emerge-field-memory-build/graph/MR4_field_memory-7967cf27e195049f.graph`

#### `cortex/phases/2026-10-02-emerge-field-memory-build/graph/_superseded/`

1 other file(s).

- other: `cortex/phases/2026-10-02-emerge-field-memory-build/graph/_superseded/MR4_field_memory-3f0c971304297739.graph`

#### `cortex/phases/2026-10-05-cli-data-code/`

2 other file(s).

- other: `cortex/phases/2026-10-05-cli-data-code/DS1_cortex_the_catalog.phase`, `cortex/phases/2026-10-05-cli-data-code/DS2_one_system_moves_home.phase`

#### `cortex/phases/2026-10-05-cli-data-code/graph/`

2 other file(s).

- other: `cortex/phases/2026-10-05-cli-data-code/graph/DS1_cortex_the_catalog-773dd1e63b67fc7d.graph`, `cortex/phases/2026-10-05-cli-data-code/graph/DS2_one_system_moves_home-b1a9ab8b8b635b99.graph`

#### `cortex/phases/2026-10-05-cli-data-code/graph/_superseded/`

2 other file(s).

- other: `cortex/phases/2026-10-05-cli-data-code/graph/_superseded/DS1_cortex_the_catalog-9b630dee8890208b.graph`, `cortex/phases/2026-10-05-cli-data-code/graph/_superseded/DS2_one_system_moves_home-96e381a353f57785.graph`

#### `cortex/phases/2026-10-07-heal-nodes/`

5 other file(s).

- other: `cortex/phases/2026-10-07-heal-nodes/HL0_runtime_faults_reach_the_ladder.phase`, `cortex/phases/2026-10-07-heal-nodes/HL1_the_heal_node.phase`, `cortex/phases/2026-10-07-heal-nodes/HL2_level_zero_reads_heals.phase`, `cortex/phases/2026-10-07-heal-nodes/HL3_heal_before_it_breaks.phase`, `cortex/phases/2026-10-07-heal-nodes/HL4_the_heal_ledger.phase`

#### `cortex/phases/2026-10-07-heal-nodes/graph/`

5 other file(s).

- other: `cortex/phases/2026-10-07-heal-nodes/graph/HL0_runtime_faults_reach_the_ladder-947d5607680d7d04.graph`, `cortex/phases/2026-10-07-heal-nodes/graph/HL1_the_heal_node-15acb9f6783aa960.graph`, `cortex/phases/2026-10-07-heal-nodes/graph/HL2_level_zero_reads_heals-90ff9b6cb72f2226.graph`, `cortex/phases/2026-10-07-heal-nodes/graph/HL3_heal_before_it_breaks-9e2f2e991abd05e1.graph`, `cortex/phases/2026-10-07-heal-nodes/graph/HL4_the_heal_ledger-4d7fa995a99f7a73.graph`

#### `cortex/phases/2026-10-07-runtime-load/`

1 other file(s).

- other: `cortex/phases/2026-10-07-runtime-load/PF5_bounded_tables.phase`

#### `cortex/phases/2026-10-07-runtime-load/graph/`

1 other file(s).

- other: `cortex/phases/2026-10-07-runtime-load/graph/PF5_bounded_tables-c6a7c7f584168210.graph`

#### `cortex/phases/2026-10-07-runtime-load/graph/_superseded/`

1 other file(s).

- other: `cortex/phases/2026-10-07-runtime-load/graph/_superseded/PF5_bounded_tables-6ba51de2ef5c30a7.graph`

#### `cortex/phases/2026-10-09-one-model-engine/`

2 other file(s).

- other: `cortex/phases/2026-10-09-one-model-engine/ME7_raid_spine_joins.phase`, `cortex/phases/2026-10-09-one-model-engine/ME8_the_drainers_run_the_engine.phase`

#### `cortex/phases/2026-10-09-one-model-engine/graph/`

2 other file(s).

- other: `cortex/phases/2026-10-09-one-model-engine/graph/ME7_raid_spine_joins-e2bc735f29322953.graph`, `cortex/phases/2026-10-09-one-model-engine/graph/ME8_the_drainers_run_the_engine-10c8439e9a5b7e66.graph`

#### `cortex/phases/2026-10-09-one-model-engine/graph/_superseded/`

1 other file(s).

- other: `cortex/phases/2026-10-09-one-model-engine/graph/_superseded/ME8_the_drainers_run_the_engine-a10cd5fa948ace2c.graph`

#### `cortex/phases/2026-10-12-browser-providers-and-work/`

1 other file(s).

- other: `cortex/phases/2026-10-12-browser-providers-and-work/PV6_raid_reads_health_everywhere.phase`

#### `cortex/phases/2026-10-12-browser-providers-and-work/graph/`

1 other file(s).

- other: `cortex/phases/2026-10-12-browser-providers-and-work/graph/PV6_raid_reads_health_everywhere-50948b43a1f650ab.graph`

#### `cortex/phases/2026-10-12-request-spine/`

3 other file(s).

- other: `cortex/phases/2026-10-12-request-spine/RQ21_the_contract_file_is_its_record.phase`, `cortex/phases/2026-10-12-request-spine/RQ7_the_context_obligations.phase`, `cortex/phases/2026-10-12-request-spine/RQ9_the_chunked_contract.phase`

#### `cortex/phases/2026-10-12-request-spine/graph/`

3 other file(s).

- other: `cortex/phases/2026-10-12-request-spine/graph/RQ21_the_contract_file_is_its_record-57f32a0c63fcd423.graph`, `cortex/phases/2026-10-12-request-spine/graph/RQ7_the_context_obligations-31e6486efe8a56e7.graph`, `cortex/phases/2026-10-12-request-spine/graph/RQ9_the_chunked_contract-2790e675b90b7136.graph`

#### `cortex/phases/2026-10-12-request-spine/graph/_superseded/`

2 other file(s).

- other: `cortex/phases/2026-10-12-request-spine/graph/_superseded/RQ21_the_contract_file_is_its_record-edb46c91a98d61cd.graph`, `cortex/phases/2026-10-12-request-spine/graph/_superseded/RQ9_the_chunked_contract-3abf89c90ee33111.graph`

#### `cortex/phases/2026-10-13-gates-that-learn-and-priorities/`

1 other file(s).

- other: `cortex/phases/2026-10-13-gates-that-learn-and-priorities/GT1_gates_route_diagnose_retry.phase`

#### `cortex/phases/2026-10-13-gates-that-learn-and-priorities/graph/`

1 other file(s).

- other: `cortex/phases/2026-10-13-gates-that-learn-and-priorities/graph/GT1_gates_route_diagnose_retry-8014549b43dcfa51.graph`

#### `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/`

5 other file(s).

- other: `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/CT1b_reviewed.phase`, `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/EX0_executors_he_already_built.phase`, `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/MEM0_nexus_holds_everything.phase`, `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/SC0_scheduler.phase`, `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/TD0_today_and_yesterday_working.phase`

#### `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/graph/`

5 other file(s).

- other: `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/graph/CT1b_reviewed-3178ffe24c2f885c.graph`, `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/graph/EX0_executors_he_already_built-d7ad680fcecf9144.graph`, `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/graph/MEM0_nexus_holds_everything-b3af5dee49c651c8.graph`, `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/graph/SC0_scheduler-94d357359b032b20.graph`, `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/graph/TD0_today_and_yesterday_working-91e91c8146a1148c.graph`

#### `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/graph/_superseded/`

1 other file(s).

- other: `cortex/phases/2026-10-13-nexus-memory-gates-and-contract/graph/_superseded/SC0_scheduler-c788fb307eb53e0b.graph`

#### `cortex/phases/2026-10-13-projects-raid-and-gates/`

3 other file(s).

- other: `cortex/phases/2026-10-13-projects-raid-and-gates/RD0_raid_has_its_own_contract.phase`, `cortex/phases/2026-10-13-projects-raid-and-gates/RD1_raid_commands.phase`, `cortex/phases/2026-10-13-projects-raid-and-gates/RD4_the_fulfilled_contract_is_one_file.phase`

#### `cortex/phases/2026-10-13-projects-raid-and-gates/graph/`

3 other file(s).

- other: `cortex/phases/2026-10-13-projects-raid-and-gates/graph/RD0_raid_has_its_own_contract-431ac1f6563ba5b4.graph`, `cortex/phases/2026-10-13-projects-raid-and-gates/graph/RD1_raid_commands-620a12090c54f346.graph`, `cortex/phases/2026-10-13-projects-raid-and-gates/graph/RD4_the_fulfilled_contract_is_one_file-9e594b04525afb1a.graph`

#### `cortex/phases/2026-10-13-projects-raid-and-gates/graph/_superseded/`

4 other file(s).

- other: `cortex/phases/2026-10-13-projects-raid-and-gates/graph/_superseded/RD0_raid_has_its_own_contract-3b0ad3c04c18a6bb.graph`, `cortex/phases/2026-10-13-projects-raid-and-gates/graph/_superseded/RD1_raid_commands-27db254e34bab9f0.graph`, `cortex/phases/2026-10-13-projects-raid-and-gates/graph/_superseded/RD1_raid_commands-eaf659e67016b3ac.graph`, `cortex/phases/2026-10-13-projects-raid-and-gates/graph/_superseded/RD4_the_fulfilled_contract_is_one_file-757df4a3809c380a.graph`

#### `cortex/phases/2026-10-15-automatic-tracking/`

4 other file(s).

- other: `cortex/phases/2026-10-15-automatic-tracking/GA1_the_gate_assesses_before_it_spends.phase`, `cortex/phases/2026-10-15-automatic-tracking/GT2_each_gate_tags_and_reports.phase`, `cortex/phases/2026-10-15-automatic-tracking/QA2_a_real_run.phase`, `cortex/phases/2026-10-15-automatic-tracking/RT2_routed_by_intent_account_and_fallback.phase`

#### `cortex/phases/2026-10-15-automatic-tracking/graph/`

4 other file(s).

- other: `cortex/phases/2026-10-15-automatic-tracking/graph/GA1_the_gate_assesses_before_it_spends-a5a0e879037dde8b.graph`, `cortex/phases/2026-10-15-automatic-tracking/graph/GT2_each_gate_tags_and_reports-0abbd85ac85f19c2.graph`, `cortex/phases/2026-10-15-automatic-tracking/graph/QA2_a_real_run-37774413980dc0ec.graph`, `cortex/phases/2026-10-15-automatic-tracking/graph/RT2_routed_by_intent_account_and_fallback-e032f09d67bd248e.graph`

#### `cortex/phases/2026-10-15-automatic-tracking/graph/_superseded/`

2 other file(s).

- other: `cortex/phases/2026-10-15-automatic-tracking/graph/_superseded/GA1_the_gate_assesses_before_it_spends-8219e00f69d5db25.graph`, `cortex/phases/2026-10-15-automatic-tracking/graph/_superseded/GT2_each_gate_tags_and_reports-3797d6cbb370567f.graph`

#### `cortex/phases/2026-10-15-gate-held-work/`

4 other file(s).

- other: `cortex/phases/2026-10-15-gate-held-work/GW1_the_baton.phase`, `cortex/phases/2026-10-15-gate-held-work/GW24_the_gate_holds_the_agent_gets_a_projection.phase`, `cortex/phases/2026-10-15-gate-held-work/GW25_the_systems_at_the_gate_moments.phase`, `cortex/phases/2026-10-15-gate-held-work/GW26_everything_declares_what_it_needs.phase`

#### `cortex/phases/2026-10-15-gate-held-work/graph/`

4 other file(s).

- other: `cortex/phases/2026-10-15-gate-held-work/graph/GW1_the_baton-2c797c66f130bea6.graph`, `cortex/phases/2026-10-15-gate-held-work/graph/GW24_the_gate_holds_the_agent_gets_a_projection-9314e8e9be6ae30f.graph`, `cortex/phases/2026-10-15-gate-held-work/graph/GW25_the_systems_at_the_gate_moments-1b3c3dae6b35d324.graph`, `cortex/phases/2026-10-15-gate-held-work/graph/GW26_everything_declares_what_it_needs-092ebe54b25611cd.graph`

#### `cortex/phases/2026-10-15-gate-held-work/graph/_superseded/`

4 other file(s).

- other: `cortex/phases/2026-10-15-gate-held-work/graph/_superseded/GW1_the_baton-2558d35dc4282735.graph`, `cortex/phases/2026-10-15-gate-held-work/graph/_superseded/GW24_the_gate_holds_the_agent_gets_a_projection-80b3bd80f12d4cc4.graph`, `cortex/phases/2026-10-15-gate-held-work/graph/_superseded/GW25_the_systems_at_the_gate_moments-0b4eab67c2ed65d7.graph`, `cortex/phases/2026-10-15-gate-held-work/graph/_superseded/GW26_everything_declares_what_it_needs-c970dbd56ce21cc0.graph`

#### `cortex/phases/2026-10-15-one-contract-raid-releases/`

3 other file(s).

- other: `cortex/phases/2026-10-15-one-contract-raid-releases/BR2_recursion_to_a_depth.phase`, `cortex/phases/2026-10-15-one-contract-raid-releases/GT1a_exhausted_climb_spends_its_attempt.phase`, `cortex/phases/2026-10-15-one-contract-raid-releases/RD0_raid_runs_the_contract.phase`

#### `cortex/phases/2026-10-15-one-contract-raid-releases/graph/`

3 other file(s).

- other: `cortex/phases/2026-10-15-one-contract-raid-releases/graph/BR2_recursion_to_a_depth-2e171420309b04aa.graph`, `cortex/phases/2026-10-15-one-contract-raid-releases/graph/GT1a_exhausted_climb_spends_its_attempt-58ea4664b2b176b8.graph`, `cortex/phases/2026-10-15-one-contract-raid-releases/graph/RD0_raid_runs_the_contract-a2f74c69ef9a50cc.graph`

#### `cortex/phases/2026-10-15-one-contract-raid-releases/graph/_superseded/`

2 other file(s).

- other: `cortex/phases/2026-10-15-one-contract-raid-releases/graph/_superseded/GT1a_exhausted_climb_spends_its_attempt-6108f2a7ab7f09d8.graph`, `cortex/phases/2026-10-15-one-contract-raid-releases/graph/_superseded/RD0_raid_runs_the_contract-e1539a5fce346d1b.graph`

#### `cortex/phases/2026-10-15-spec-foundation-model/`

6 other file(s).

- other: `cortex/phases/2026-10-15-spec-foundation-model/SF1_foundation_field.phase`, `cortex/phases/2026-10-15-spec-foundation-model/SF2_state_and_gate.phase`, `cortex/phases/2026-10-15-spec-foundation-model/SF3_evidence_not_claims.phase`, `cortex/phases/2026-10-15-spec-foundation-model/SF5_hat_intent_injection.phase`, `cortex/phases/2026-10-15-spec-foundation-model/SF6_addenda_view.phase`, `cortex/phases/2026-10-15-spec-foundation-model/SF7_get_his_run_current.phase`

#### `cortex/phases/2026-10-15-spec-foundation-model/graph/`

6 other file(s).

- other: `cortex/phases/2026-10-15-spec-foundation-model/graph/SF1_foundation_field-403be3a3de4097fa.graph`, `cortex/phases/2026-10-15-spec-foundation-model/graph/SF2_state_and_gate-adb0d3d7e575647a.graph`, `cortex/phases/2026-10-15-spec-foundation-model/graph/SF3_evidence_not_claims-2b678b0269fe99ed.graph`, `cortex/phases/2026-10-15-spec-foundation-model/graph/SF5_hat_intent_injection-10e5a79bbc7cf1e9.graph`, `cortex/phases/2026-10-15-spec-foundation-model/graph/SF6_addenda_view-d7b4036d0d6df1de.graph`, `cortex/phases/2026-10-15-spec-foundation-model/graph/SF7_get_his_run_current-b512f674cbcad8ad.graph`

#### `cortex/phases/2026-10-17-debugging-product/`

1 other file(s).

- other: `cortex/phases/2026-10-17-debugging-product/DP9_crystallize_the_fix.phase`

#### `cortex/phases/2026-10-17-debugging-product/graph/`

1 other file(s).

- other: `cortex/phases/2026-10-17-debugging-product/graph/DP9_crystallize_the_fix-bb202e146d2c087f.graph`

#### `cortex/phases/2026-10-17-failure-mode-report/`

3 other file(s).

- other: `cortex/phases/2026-10-17-failure-mode-report/FMR3_the_report.phase`, `cortex/phases/2026-10-17-failure-mode-report/FMR4_the_macro_bundle.phase`, `cortex/phases/2026-10-17-failure-mode-report/FMR9_agents_have_it.phase`

#### `cortex/phases/2026-10-17-failure-mode-report/graph/`

3 other file(s).

- other: `cortex/phases/2026-10-17-failure-mode-report/graph/FMR3_the_report-299dbc8fd18c04ed.graph`, `cortex/phases/2026-10-17-failure-mode-report/graph/FMR4_the_macro_bundle-ae03f54c04d34a09.graph`, `cortex/phases/2026-10-17-failure-mode-report/graph/FMR9_agents_have_it-63ef698ad90660e2.graph`

#### `cortex/phases/2026-10-17-infrastructure-migration/`

2 other file(s).

- other: `cortex/phases/2026-10-17-infrastructure-migration/IM4_the_kernel_boundary.phase`, `cortex/phases/2026-10-17-infrastructure-migration/IM6_cortex_unclumped.phase`

#### `cortex/phases/2026-10-17-infrastructure-migration/graph/`

2 other file(s).

- other: `cortex/phases/2026-10-17-infrastructure-migration/graph/IM4_the_kernel_boundary-c147db605bdd2aa9.graph`, `cortex/phases/2026-10-17-infrastructure-migration/graph/IM6_cortex_unclumped-fd9d4833cc2172df.graph`

#### `cortex/phases/2026-10-17-infrastructure-migration/graph/_superseded/`

1 other file(s).

- other: `cortex/phases/2026-10-17-infrastructure-migration/graph/_superseded/IM4_the_kernel_boundary-2fa27fc4450f490d.graph`

#### `cortex/phases/2026-10-17-pieces-not-order/`

3 other file(s).

- other: `cortex/phases/2026-10-17-pieces-not-order/PC2_any_order.phase`, `cortex/phases/2026-10-17-pieces-not-order/PC3_verified_alone_resumed_by_recheck.phase`, `cortex/phases/2026-10-17-pieces-not-order/PC6_assembled_and_checked_whole.phase`

#### `cortex/phases/2026-10-17-pieces-not-order/graph/`

3 other file(s).

- other: `cortex/phases/2026-10-17-pieces-not-order/graph/PC2_any_order-721659410b6920fe.graph`, `cortex/phases/2026-10-17-pieces-not-order/graph/PC3_verified_alone_resumed_by_recheck-c2d9bfbcf28fdd80.graph`, `cortex/phases/2026-10-17-pieces-not-order/graph/PC6_assembled_and_checked_whole-02773cb04a5358ed.graph`

#### `cortex/phases/2026-10-17-pieces-not-order/graph/_superseded/`

1 other file(s).

- other: `cortex/phases/2026-10-17-pieces-not-order/graph/_superseded/PC2_any_order-6bc0af47ff8e008b.graph`

#### `cortex/phases/2026-10-18-gate-memory/`

3 other file(s).

- other: `cortex/phases/2026-10-18-gate-memory/GM1_the_gate_record.phase`, `cortex/phases/2026-10-18-gate-memory/GM2_restarts_resume_from_records.phase`, `cortex/phases/2026-10-18-gate-memory/GM3_the_fulfilled_contract_index.phase`

#### `cortex/phases/2026-10-18-gate-memory/graph/`

3 other file(s).

- other: `cortex/phases/2026-10-18-gate-memory/graph/GM1_the_gate_record-7b2f7b374309d9af.graph`, `cortex/phases/2026-10-18-gate-memory/graph/GM2_restarts_resume_from_records-27a685ab9a7031c5.graph`, `cortex/phases/2026-10-18-gate-memory/graph/GM3_the_fulfilled_contract_index-5f982253e7259033.graph`

#### `cortex/phases/2026-10-18-gate-memory/graph/_superseded/`

1 other file(s).

- other: `cortex/phases/2026-10-18-gate-memory/graph/_superseded/GM2_restarts_resume_from_records-2cab55cf6b2e5f35.graph`

#### `cortex/phases/2026-10-19-pipeline-root-causes/`

1 other file(s).

- other: `cortex/phases/2026-10-19-pipeline-root-causes/SS2_every_system_home.phase`

#### `cortex/phases/2026-10-19-pipeline-root-causes/graph/`

1 other file(s).

- other: `cortex/phases/2026-10-19-pipeline-root-causes/graph/SS2_every_system_home-0b99d93cc27c81e7.graph`

#### `cortex/phases/2026-10-19-pipeline-root-causes/graph/_superseded/`

1 other file(s).

- other: `cortex/phases/2026-10-19-pipeline-root-causes/graph/_superseded/SS2_every_system_home-8abdeb8d18ad7e5d.graph`

#### `cortex/phases/2026-10-19-solid-build-foundation/`

1 other file(s).

- other: `cortex/phases/2026-10-19-solid-build-foundation/DC1_dynamic_chunk_at_plan.phase`

#### `cortex/phases/2026-10-19-solid-build-foundation/graph/`

1 other file(s).

- other: `cortex/phases/2026-10-19-solid-build-foundation/graph/DC1_dynamic_chunk_at_plan-a3e911b7984ff47a.graph`

#### `cortex/phases/2026-10-20-belief-loop/`

1 other file(s).

- other: `cortex/phases/2026-10-20-belief-loop/CY1_lifecycle_and_injection.phase`

#### `cortex/phases/2026-10-20-belief-loop/graph/`

1 other file(s).

- other: `cortex/phases/2026-10-20-belief-loop/graph/CY1_lifecycle_and_injection-d54b025cab193dea.graph`

#### `cortex/phases/2026-10-20-belief-loop/graph/_superseded/`

1 other file(s).

- other: `cortex/phases/2026-10-20-belief-loop/graph/_superseded/CY1_lifecycle_and_injection-f9114a7b5b7207b8.graph`

#### `cortex/phases/2026-10-20-substrate-graph-traversal-chunking-gating/`

1 other file(s).

- other: `cortex/phases/2026-10-20-substrate-graph-traversal-chunking-gating/DK1_dynamic_chunking.phase`

#### `cortex/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/`

1 other file(s).

- other: `cortex/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/DK1_dynamic_chunking-2e1c9985830b2941.graph`

#### `cortex/phases/2026-10-21-data-layout/`

1 other file(s).

- other: `cortex/phases/2026-10-21-data-layout/DL6_cortex_server.phase`

#### `cortex/phases/2026-10-21-data-layout/graph/`

1 other file(s).

- other: `cortex/phases/2026-10-21-data-layout/graph/DL6_cortex_server-17d05347142d4364.graph`

#### `cortex/phases/2026-10-21-data-layout/graph/_superseded/`

3 other file(s).

- other: `cortex/phases/2026-10-21-data-layout/graph/_superseded/DL6_cortex_server-12bcbaa9f6f99ef8.graph`, `cortex/phases/2026-10-21-data-layout/graph/_superseded/DL6_cortex_server-1ac803216ae293ca.graph`, `cortex/phases/2026-10-21-data-layout/graph/_superseded/DL6_cortex_server-a8a702303bb02f47.graph`

#### `cortex/phases/agent-model-and-user-continuity/`

1 other file(s).

- other: `cortex/phases/agent-model-and-user-continuity/AM4_full_user_continuity.phase`

#### `cortex/phases/agent-model-and-user-continuity/graph/`

1 other file(s).

- other: `cortex/phases/agent-model-and-user-continuity/graph/AM4_full_user_continuity-3a71daf44b278748.graph`

#### `cortex/phases/copilot-awareness-routing/`

1 other file(s).

- other: `cortex/phases/copilot-awareness-routing/CA5_intent_routing.phase`

#### `cortex/phases/copilot-awareness-routing/graph/`

1 other file(s).

- other: `cortex/phases/copilot-awareness-routing/graph/CA5_intent_routing-3a5f0d9163ea6078.graph`

#### `cortex/phases/copilot-full-capability/`

2 other file(s).

- other: `cortex/phases/copilot-full-capability/P1_cross_agent_recall.phase`, `cortex/phases/copilot-full-capability/P4_raid_snr_query_tool.phase`

#### `cortex/phases/copilot-full-capability/graph/`

2 other file(s).

- other: `cortex/phases/copilot-full-capability/graph/P1_cross_agent_recall-a040d6583f3e1e8b.graph`, `cortex/phases/copilot-full-capability/graph/P4_raid_snr_query_tool-f934b5bf077cf0cd.graph`

#### `cortex/phases/copilot-omniscience/`

1 other file(s).

- other: `cortex/phases/copilot-omniscience/P2_persistence_threaded.phase`

#### `cortex/phases/copilot-omniscience/graph/`

1 other file(s).

- other: `cortex/phases/copilot-omniscience/graph/P2_persistence_threaded-1712827131ffab10.graph`

#### `cortex/phases/gemini-multiagent-coding/`

1 other file(s).

- other: `cortex/phases/gemini-multiagent-coding/P3_line_block_seam_sync.phase`

#### `cortex/phases/gemini-multiagent-coding/graph/`

1 other file(s).

- other: `cortex/phases/gemini-multiagent-coding/graph/P3_line_block_seam_sync-4c9b125899b7ce0f.graph`

#### `cortex/phases/nexus-architecture-rebuild/`

1 other file(s).

- other: `cortex/phases/nexus-architecture-rebuild/P7_schema_based_persistence_system_wide.phase`

#### `cortex/phases/nexus-architecture-rebuild/graph/`

1 other file(s).

- other: `cortex/phases/nexus-architecture-rebuild/graph/P7_schema_based_persistence_system_wide-553361839aed4212.graph`

#### `cortex/phases/raid-routing-fidelity/`

2 other file(s).

- other: `cortex/phases/raid-routing-fidelity/RR1_verify_and_wire_the_snr_fidelity_gate.phase`, `cortex/phases/raid-routing-fidelity/RR6_cortex_fitness_and_fluid_configs.phase`

#### `cortex/phases/raid-routing-fidelity/graph/`

2 other file(s).

- other: `cortex/phases/raid-routing-fidelity/graph/RR1_verify_and_wire_the_snr_fidelity_gate-811ac85b77bfb21d.graph`, `cortex/phases/raid-routing-fidelity/graph/RR6_cortex_fitness_and_fluid_configs-6e58e5b8e1945e9b.graph`

#### `cortex/phases/snapshot-trigger/`

2 other file(s).

- other: `cortex/phases/snapshot-trigger/SS1_drift_triggered_snapshot.phase`, `cortex/phases/snapshot-trigger/SS2_snapshot_in_diagnostics.phase`

#### `cortex/phases/snapshot-trigger/graph/`

2 other file(s).

- other: `cortex/phases/snapshot-trigger/graph/SS1_drift_triggered_snapshot-a29e09c529c8d673.graph`, `cortex/phases/snapshot-trigger/graph/SS2_snapshot_in_diagnostics-a6929e53be935126.graph`

#### `cortex/schemas/`

1 code · 26 other file(s).

- `cortex/schemas/index.js` (51 lines) — // cortex/schemas/index.js — cortex's own, fully sovereign schema registry. //  
  exports get, list, SCHEMAS, MODULE_ID, VERSION · requires 1 · required by 0
- other: 26 files (.account_identity_index_entry, .bep_pattern, .capability, .chat_log, .component, .component_projection, .constitution_decision, .contract)

#### `cortex/self-heal/`

6 code file(s).

- `cortex/self-heal/escalation.js` (385 lines)  
  exports MODULE_ID, VERSION, init, stop, health, wireAnomalyTrigger +3 · requires 2 · required by 0 · tested by `tests/modules/test-config-governance.js`, `tests/modules/test-diagnostic-heal-path.js` +1
- `cortex/self-heal/failure-intake.js` (94 lines)  
  exports MODULE_ID, VERSION, TABLE, signatureOf, write, record +2 · requires 1 · required by 2
- `cortex/self-heal/failure-mode-forensics.js` (249 lines)  
  exports MODULE_ID, computeSigmaDelta, generateDebugMacro, enrichFailureMode, computeCompound, fetchCompoundViaOrchestrator · requires 3 · required by 1 · tested by `tests/modules/test-c1-compound-failure-mode.test.js`
- `cortex/self-heal/failure-report.js` (119 lines)  
  exports MODULE_ID, VERSION, HYPOTHESES, report, lines · requires 1 · required by 1
- `cortex/self-heal/fault-taxonomy.js` (200 lines) — // cortex/self-heal/fault-taxonomy.js — Phase 1: schema + sole write authority for 'fault_taxonomy' // UUID: nexus-cortex-escalation-fault-taxonomy-v1-0000-2026-0720-001  
  exports MODULE_ID, TABLE, FRICTION_THRESHOLDS, FRICTION_DELTA_BY_LEVEL, KNOWN_FAULT_CLASSES, GAP_TYPE_TO_FAULT_CLASS +6 · requires 0 · required by 4 · tested by `tests/modules/test-diagnostic-heal-path.js`, `tests/modules/test-fault-taxonomy.js`
- `cortex/self-heal/index.js` (357 lines)  
  exports MODULE_ID, VERSION, SEMANTIC_GAP_TYPES, init, stop, health +2 · requires 3 · required by 0 · tested by `tests/modules/test-c1-compound-failure-mode.test.js`, `tests/modules/test-diagnostic-heal-path.js` +3

#### `cortex/snapshot/`

1 code file(s).

- `cortex/snapshot/index.js` (51 lines)  
  requires 0 · required by 3 · tested by `tests/modules/snapshot-integrity.test.js`, `tests/modules/test-versionium-snapshot-migration.js` +1

#### `cortex/spec/`

2 other file(s).

- other: `cortex/spec/cortex.node-taxonomy.spec`, `cortex/spec/cortex.spec`

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
