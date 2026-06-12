# NEXUS — Full System Document
**Version:** 3.0.0
**Author:** James Brooks (Erosmancer / James de Montaigne)
**UUID:** nexus-system-doc-v3-0-0-2026-jamesbrooks
**Generated:** 2026-06-11
**Status:** Active — Session-locked

> *Every cause is as important as the conditions of its effect.*
> *The codebase is a materialised view of the Upgrade Ledger.*
> *Let's make history.*

---

## What NEXUS Is

NEXUS is a sovereign AI orchestration ecosystem. It is not a wrapper around AI APIs. It is a purpose-built cognitive infrastructure that treats every AI interaction as a first-class event in a causal, append-only, self-healing system.

The system has one operator: James Brooks. One execution layer: Claude. One substrate: SISO + Jaa. One architectural principle: everything is alive, everything is connected, nothing silently fails.

NEXUS does not log interactions. It learns from them. It does not route requests. It tracks, holds, replays, and documents every request with causal provenance. It does not display system state. It simulates the physics of its own behaviour.

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                    NEXUS v3.0.0                              │
│                                                              │
│  Browser                                                     │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │ userscript   │  │ userscript   │                         │
│  │ (claude.ai)  │  │ (chatgpt.com)│                         │
│  └──────┬───────┘  └──────┬───────┘                         │
│         │ NCP/SSE         │ NCP/SSE                         │
│         ▼                 ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  ORCHESTRATOR :9000  (command + control + UI)        │    │
│  │  Proxies all routes. Watchdog. Boot sequencer.       │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         │ HTTP                              │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  BRIDGE :9999  (trust relay — boots FIRST)          │    │
│  │  Identity · Routing · Durable queue · Circuit break  │    │
│  └────┬─────────┬──────────┬──────────────┬────────────┘    │
│       │         │          │              │                  │
│       ▼         ▼          ▼              ▼                  │
│  ┌────────┐ ┌────────┐ ┌────────┐  ┌────────────┐          │
│  │CORTEX  │ │GUARDIAN│ │IDEARIUM│  │EMERGE :4242│          │
│  │:3748   │ │:7820   │ │:4800   │  │compiler/IDE│          │
│  │memory  │ │AI jobs │ │idea OS │  └────────────┘          │
│  │28 JAA  │ │SEAM    │ │specs   │                           │
│  │tables  │ │queue   │ │gaps    │       ┌────────┐          │
│  │CFR     │ │NCP     │ │SNR     │       │OLLAMA  │          │
│  └────────┘ └────────┘ └────────┘       │:11434  │          │
│                                         │local AI│          │
│                                         └────────┘          │
└─────────────────────────────────────────────────────────────┘
```

---

## Systems

### ORCHESTRATOR — :9000
**File:** `orchestrator.js` (root) = `ui/orchestrator.js` (served copy, always synced)
**Role:** Command, control, and UI. Single entry point for the browser. Proxies every system route. Watchdog for all system health. Boots all systems in order via `cli/boot-systems.js`.
**Ledger:** `data/ledger/orchestrator.jsonl`
**Boot order:** 0 (first process started)

Routes exposed:
- `GET /health` — parallel health check of all systems
- `GET /sse` — unified SSE stream
- `POST /api/register` — system registration
- `GET /api/registry` — live heartbeat map
- `GET /api/bridge/*` — Bridge proxy (all 14 routes)
- `GET /api/cortex/*` — Cortex proxy (18 routes + `/cfr/*` + `/api/contracts`)
- `GET /api/guardian/*` — Guardian proxy (24 routes)
- `GET /api/idearium/*` — Idearium proxy (22 routes)

CLI commands: `status`, `watch`, `ui`, `jobs`, `events`, `gaps`, `ideas`, `dispatch`, `push`, `snr`, `requests`, `tag`, `session`

---

### BRIDGE — :9999
**File:** `bridge/index.js`
**Role:** Trust relay. Identity, routing, durable request queue, circuit breaker.
**Ledger:** `data/bridge/ledger/requests.jsonl`
**Boot order:** 1 (first system booted by orchestrator)

This is the backbone. Nothing crosses a system boundary without going through Bridge. It is the single write authority for all cross-system requests (§9.1). Every request is written to the ledger before dispatch (§9.2). Held requests never leave the queue (§9.3).

Files:
- `bridge/types.js` — canonical Request schema. One shape everywhere. 16 request types, 7 statuses.
- `bridge/ledger.js` — SISO pipeline over JSONL. Write → Written → Update → Updated → Query → Queried.
- `bridge/identity.js` — token issuance via system secrets. MAX_TOKENS_PER_SYS=10, expired-first pruning.
- `bridge/registry.js` — wraps `lib/heartbeat.js` HeartbeatManager. Weight + fallback chains per system.
- `bridge/router.js` — ResolveGate → CircuitGate → RouteOpenGate → DispatchGate → ResultGate | HoldGate. MAX_ROUTE_DEPTH=3, routeHistory on every hop.
- `bridge/server.js` — thin HTTP. 14 routes. SSE stream with 15s keepalive.
- `service/bridge-service.js` — PID file manager, delegates to bridge/index.js.

Routes:
```
POST /bridge/handshake   — system boot identity handshake → token
POST /bridge/request     — submit cross-system request → UUID + status
POST /bridge/event       — fire-and-forget event (nc.postBridge)
POST /bridge/broadcast   — broadcast to all SSE subscribers
POST /bridge/tags        — tag any entity by UUID
POST /bridge/revoke      — revoke a session token
GET  /bridge/requests    — query request ledger (?status, ?type, ?source, ?target, ?tag)
GET  /bridge/requests/:uuid — single request
GET  /bridge/registry    — live system health map
GET  /bridge/circuits    — circuit breaker states
GET  /bridge/stats       — ledger statistics
GET  /bridge/contract    — this contract
GET  /bridge/sse         — SSE stream of bridge events
GET  /health             — bridge health
```

Request lifecycle: `pending → dispatched → fulfilled | failed | held | cancelled | quarantined`

Fallback chains:
- guardian offline → ollama
- cortex offline → orchestrator
- idearium offline → held (no fallback)

---

### CORTEX — :3748
**File:** `cortex/boot.js`
**Role:** Append-only memory. Source of truth for all events, artifacts, gaps, and memory.
**Ledger:** `cortex/data/` (28 JAA tables, JSONL per table + CFR ledger)
**Boot order:** 2

28 JAA tables across 3 tiers:

**Working (evicts after 2h, wipes on restart):** active_traces, working_memory

**Short (evicts after 24h, persists across restart):** agent_messages, cortex_memory, gaps, artifacts, agent_calls, orion_sessions, seam_records, sigma_records, delta_records, snr_records, ime_profiles, event_log, toasts, healer_log

**Long (never evicts):** crystals, intent_nodes, bep_patterns, trust_scores, memory_index, conditioning_log, feedback_scores, self_model, agent_signatures, shape_samples, failures, law_violations, boot_records, fix_map, versionium_commits, versionium_branches, versionium_file_index, versionium_calendar, versionium_objects, causality_nodes, memory_queries, cli_history, schedules, workflow_runs, forge_patches, project_registry, poll_log, requests (PROJECTION ONLY — never written directly), backup_records, contract_audit, cfr_ledger

**Key protection:** `requests` table is a Bridge ledger projection. `POST /api/table/insert` rejects direct writes to `requests` with 400.

Modules: RAID, ESS, CFR engine, self-heal, healer, versionium, NAS router, snapshot, agent-tools, resilience module.

CFR endpoints: `/cfr/health`, `/cfr/state`, `/cfr/field`, `/cfr/nodes`, `/cfr/deltas`, `/cfr/stream`, `/cfr/replay`, `/cfr/sigma`, `/cfr/compound`, `/cfr/compound/:uuid`

Contract endpoint: `GET /api/contracts?section=GAPS` — live query of SYSTEM-CONTRACTS.js

---

### GUARDIAN — :7820 / :7821 (WSS) / :7822 (dropzone) / :7823 (memory)
**File:** `guardian/server.js`
**Role:** AI orchestration. Job queue. SEAM delivery pipeline. Provider management.
**Ledger:** `data/guardian/` (input, output, queue, failures, conversations, ledger)
**Boot order:** 3

Providers: ChatGPT (via userscript NCP), Claude (via userscript NCP), Ollama (direct HTTP). RAID routes local-first (§LAW_I).

Physical queue: `lib/queue.js` — atomic file rename, crash replay, priority, tags, compartment OS. Enqueue calls notify Bridge before filesystem write (§BRIDGE-GATE).

SEAM pipeline: spec → chunk → inject → verify → stable | failed | retry. Each chunk written to JAA `seam_records`.

NCP transport: SSE server-to-client + fetch POST client-to-server. Replaces WebSocket entirely.

Key fix history: `uploadDir` scope fix (F001), `getLocalIPs()` definition (F002), Bridge handshake phase added to boot sequence.

---

### IDEARIUM — :4800
**File:** `idearium/api/index.js` (ESM)
**Role:** Idea OS. Seed → spec → gap → build lifecycle management.
**Ledger:** `data/idearium/`
**Boot order:** 4

Tension engine scores ideas 0..1. SNR tracks system signal quality. CLI is source of truth — API is projection. Snapshot pushes create Versionium commits.

---

### EMERGE — :4242
**File:** `emerge-ide.js`
**Role:** SNR gate compiler. .eg/.emerge file processing. Ollama AI assist.
**Boot order:** 5

595 keywords, 7 axioms. Note: .eg files are spec descriptions, not executable programs. New work uses YAML .spec format.

---

### OLLAMA — :11434
**External.** Local LLM inference. No cloud call if Ollama handles it. RAID routes to Ollama first when available (§LAW_I).

---

## The Causal Physics Stack

NEXUS does not just log events — it simulates the physics of its own behaviour. Three layers:

### Layer 1 — Structural Causality (`lib/cfr/graph.js`)
Who caused what. `CausalGraph` with typed edges: causal, session, job, temporal, type-sequence. Ancestry, lineage, dependency tree, job chains. Every event carries `causedBy` UUID.

### Layer 2 — Residual Causality (`lib/cfr/sigma.js` + `lib/event-ledger.js`)
How far events deviate from expected. Sigma scoring (structural + temporal + contextual axes). Baseline learning. Invariant scanning. Failure precursor detection. Anomaly classification.

### Layer 3 — Propagation Dynamics (`lib/causal/compound.js`)
How energy moves through the graph. Three emergent regimes:

**Ripple** — 1 downstream event. Normal flow. Not documented.
**Wave** — 2+ downstream events or high sigma. Spreading. Written to event_log.
**Tidal** — Cross-system propagation with chaotic regime or high sigma + multiple systems. Opens a gap automatically. Written to event_log.

**CausalImpulse** (computed per high-sigma event):
```
magnitude     = sigma × (1 + entropy × 0.5)
branchingFactor = by event type (contract.violation=3.5, collapse=4.0, complete=0.5)
resistance    = coherence × 0.6 − entropy × 0.4
decayRate     = coherence × 0.7 − tension × 0.3  (0.05..0.85)
E(N)          = magnitude × branchingFactor^N × (1 − decayRate)^N × (1 / (1 + resistance))
```

Regime from energy: E(3) < 0.2 → ripple. E(3) ≥ 0.2 → wave. E(6) ≥ 0.4 or chaotic + cross-system → tidal.

**Seven compounding factors:** sigma_amplification, retry_cascade, cross_system_propagation, unresolved_gap_chain, contract_violation_amplifier, tension_escalation, backpressure_release.

Gate rules: sigma ≥ 0.70 to trigger. `compound.*` events never re-trigger. `setImmediate` — write path never blocked. JAA inserts from compound engine never route through `CFR ledger.record()`.

---

## Data Storage Map

| Store | Location | Authority | Type | Notes |
|-------|----------|-----------|------|-------|
| Bridge requests | `data/bridge/ledger/requests.jsonl` | Bridge | append-only | Write before dispatch. Never drop held. |
| Orchestrator ledger | `data/ledger/orchestrator.jsonl` | Orchestrator | append-only | System events, boot records |
| Cortex event_log | `cortex/data/event_log.jsonl` | Cortex | append-only JSONL | All system events. Written before dispatch. |
| Cortex requests | `cortex/data/requests.jsonl` | Bridge (projection) | projection | Populated via Bridge SSE. Never written directly. |
| Cortex FileStore | `cortex/store/` | Cortex | SHA-256 blobs | Content-addressed artifacts |
| Guardian queue | `data/guardian/queue/` | Guardian | filesystem queue | Atomic rename. Crash replay. §LAW II. |
| Idearium | `data/idearium/` | Idearium | JSONL | Ideas, specs, gaps, snapshots |
| CFR ledger | `data/*/ledger/event_log.jsonl` | Per-system | append-only | sigma + delta + cfr per event |
| SESSION.md | `docs/SESSION.md` | cli/session.js | rendered projection | Generated from Bridge ledger + Orchestrator ledger. Never edited manually. |

---

## Named Edges

| Edge | From | To | Protocol | Port | Auth | Failure modes |
|------|------|----|----------|------|------|---------------|
| userscript → guardian | userscript | Guardian | NCP/SSE+fetch | 7820 | none | connection_refused, cors_blocked, ncp_stale_tab |
| userscript → bridge | userscript | Bridge | HTTP | 9999 | BRIDGE_TOKEN | auth_rejected, timeout |
| guardian → bridge | Guardian | Bridge | HTTP | 9999 | BRIDGE_TOKEN | auth_rejected, circuit_open |
| guardian → cortex | Guardian | Cortex | HTTP | 3748 | none | connection_refused, timeout |
| cortex → bridge SSE | Cortex | Bridge | SSE | 9999 | none | sse_dropped, connection_refused |
| orchestrator → bridge | Orchestrator | Bridge | SSE+HTTP | 9999 | BRIDGE_TOKEN | connection_refused, sse_dropped |
| bridge → all | Bridge | All systems | HTTP | per-system | BRIDGE_TOKEN | circuit_open, connection_refused, timeout |
| UDP pulse | All | Bridge | UDP | 7777 | signed_pulse | none (best-effort) |
| guardian → ollama | Guardian | Ollama | HTTP | 11434 | none | connection_refused, timeout |
| idearium → guardian | Idearium | Guardian | HTTP | 7820 | none | connection_refused |

---

## Named Fault Classes (21)

silent_failure, phantom_write, dual_truth, rogue_bypass, replay_double, ghost_call, stub_in_production, scope_escape, missing_provenance, token_expiry, circuit_deadlock, held_starvation, context_loss, hash_drift, monolith_growth, boot_order_violation, version_drift, ledger_orphan, contract_drift, cfr_collapse, invariant_break

## Known Faults (15)

| ID | Description | Fixed |
|----|-------------|-------|
| F001 | uploadDir not aliased from cfg.uploadDir in Guardian | ✓ |
| F002 | getLocalIPs() called but never defined | ✓ |
| F003 | _bootSystems required but never invoked | ✓ |
| F004 | nc.postBridge() called in 3 places but not defined | ✓ |
| F005 | requests table in ALLOWED set for direct write | ✓ |
| F006 | POST /api/tags was a stub, silently dropped data | ✓ |
| F007 | NAS router polling for requests nobody creates | ✓ |
| F008 | cliRequests() and cliTag() called but never defined | ✓ |
| F009 | syncCanvasNodes() wiped all attractors on empty response | ✓ |
| F010 | simpleHash() in userscript — collision risk | ✗ pending |
| F011 | Userscript uses localStorage — lost on tab close | ✗ pending |
| F012 | No pre-prompt context injection — agent starts cold | ✗ pending |
| F013 | ui/orchestrator.js and root orchestrator.js diverged | ✓ |
| F014 | Bridge referenced everywhere but bridge/ dir didn't exist | ✓ |
| F015 | Three _physQueue.enqueue() calls bypassed Bridge | ✓ |

---

## CFR Field Regimes

| Regime | Condition | Signal |
|--------|-----------|--------|
| stable | coherence > 0.6, entropy < 0.3 | Healthy flow |
| resonant | coherence > 0.4, entropy < 0.3 | Cyclic signal |
| turbulent | friction > 0.65 OR resonance > 0.7 | Loop / deadlock |
| chaotic | entropy > 0.7 OR coherence < 0.25 | SW block / error |

---

## Gap Types (19)

unresolved, contradiction, missing_link, boundary_gap, file_friction, spec_incomplete, ci_fail, schema_violation, wiring_missing, baseline_drift, ledger_divergence, phantom_request, hash_collision, replay_orphan, contract_mismatch, silent_failure, trust_violation, rogue_write, held_overflow

---

## Contracts Infrastructure

### SYSTEM-CONTRACTS.js (`contracts/SYSTEM-CONTRACTS.js`)
Machine-readable source of truth for the entire system. Every named entity — events, gaps, faults, edges, deltas, regimes, ledgers, interaction contracts, verification contracts, self-awareness requirements, causal physics model.

Query live: `GET :3748/api/contracts` / `GET :3748/api/contracts?section=GAPS`

### Interaction Contracts
Every system has a `GET /contract` or `GET /bridge/contract` endpoint returning its declared API surface, SISO channels, and version.

### Verification Contracts
76 checks across all systems. Universal checks (V-UNI-01..10) apply to every system. System-specific checks (V-BRG-01..14, V-CTX-01..13, etc.) verify runtime behaviour.

---

## Tests

### `tests/brutal.test.js` (new)
65 tests. 40 crystallised invariants. 9 sections covering bridge/types, bridge/ledger, bridge/identity, bridge/router, lib/causal/compound, contracts/SYSTEM-CONTRACTS, lib/cfr/ledger, cli/session, nexus-connect.

Run: `node tests/brutal.test.js`
Run adversarial only: `node tests/brutal.test.js --adversarial`
Run invariants only: `node tests/brutal.test.js --invariants`
Run one section: `node tests/brutal.test.js --section=bridge`

Gap report written to `tests/brutal-results.json` on every run.

### `tests/full.test.js`
970 lines. Math primitives, ESS kernel, ICO pipe, physical queue, baseline monitor, RAID integration, Guardian NCP→SEAM, end-to-end pipeline, adversarial inputs, boundary conditions, invariants.

### `tests/integration.test.js`
Live integration tests. Requires all systems running. Tests Bridge handshake, request lifecycle, Cortex event write/read, Guardian job creation, SSE streams.

### `tests/kernel.test.js`
142 tests. Emerge kernel spec loading, tokenizer, SNR gate, parser IR, validator axioms, full compile pipeline, adversarial inputs, real .eg files.

---

## CLI / Session Commands

```
node orchestrator.js session          — render SESSION.md from live state
node orchestrator.js requests [status]— Bridge request queue
node orchestrator.js tag <uuid> <tags>— tag a request
node orchestrator.js status           — all system health
node orchestrator.js watch            — live system monitor
node orchestrator.js diagnose         — full system audit (six lenses)
node cli/session.js                   — render SESSION.md
node cli/session.js --watch           — regenerate every 60s
node cli/session.js --print           — stdout only
node tests/brutal.test.js             — brutal recursive test suite
```

---

## Open Gaps (Carried Forward)

| ID | Description | Severity | File |
|----|-------------|----------|------|
| F010 | simpleHash() in userscript not content-addressed | high | guardian/userscript-*.js |
| F011 | Userscript localStorage — state lost on tab close | high | guardian/userscript-*.js |
| F012 | No pre-prompt context injection | high | guardian/userscript-*.js |
| GAP-001 | No unified `nexus` CLI binary | medium | cli/ |
| GAP-002 | Idearium ESM requires special boot | medium | idearium/ |
| GAP-003 | .eg files don't execute — decision needed | medium | emerge/ |
| GAP-004 | Guardian→Cortex realtime bridge not fully validated | medium | guardian/ |
| GAP-005 | Userscript GTCI inject not fully wired | medium | guardian/ |

**Next build session must start with:** `node cli/session.js` then read this document then the five FORGE-SKILL orienting questions.

---

## Axioms Quick Reference (v2.0)

```
§1.1  Nothing exists until proven.
§1.2  Nothing silently fails.
§1.3  No stubs in production.
§2.1  Persistence is the golden rule.
§2.2  Storage device is source of truth.
§2.3  All state must be observable.
§3.1  Bottom-up only.
§3.2  Logical time is the ordering axis.
§4.1  Untestable = untrusted.
§4.2  Fix bugs pre-emptively.
§4.3  Enterprise + military + cybersecurity grade.
§5.1  UUID + hook + bus on everything.
§5.2  Everything implements the bridge.
§5.3  No monkey patches.
§5.4  Versions persist everywhere.
§5.5  What doesn't exist must be built.
§5.6  Structural self-similarity.
§5.7  Low coupling, high cohesion.
§5.8  Composability over configuration.
§6.1  Documentation generated from proof.
§6.2  Always read before building.
§7.0  Event ontology separation.
§7.1  Dual ledger architecture.
§7.2  Ideas cannot affect runtime.
§7.3  Cognition is not history.
§7.4  Track methods and patterns.
§7.5  Classify idea failure.
§7.6  Codebase is a materialised view of the Upgrade Ledger.
§7.7  Bottleneck detection via ledger flow.
§8.1  Begin every session with context.
§8.2  Nothing passes the idea gate without hostile review.
§8.3  SISO and Jaa are load-order prerequisites.
§9.1  Bridge is the only write authority for requests.
§9.2  Ledger write before dispatch. Always.
§9.3  Held requests never leave the queue.
§9.4  Route depth bounded. History written on every hop.
§9.5  One UUID per request. One SHA-256 per artifact.
§9.6  Session UUID chain preserves continuity.
§10.1 Each data type has exactly one write authority.
§10.2 Projections are derived, not written.
§10.3 Competing truth layers are a system failure.
§11.1 Every cause is as important as the conditions of its effect.
§11.2 Compounding effects are documented and named.
§11.3 Compound analysis is async, gated, and selective.
§11.4 The CFR ledger is a causal simulation substrate.
§12.1 Every runtime file has a brutal, recursive test suite.
§12.2 Tests are verification, not coverage.
§12.3 Expectation vs reality is always documented.
§12.4 Invariants crystallise from tests.
§12.5 The living spec documents drift.
§13.1 Log system conditions, context, and intent.
§13.2 Every edge is named.
§13.3 Every fault class is named before it occurs.
§13.4 Consistency, context, and drift are first-class concerns.
§14.1 Every cross-system feature is a SISO pipeline.
§14.2 Gates are pure functions.
§14.3 Signature collision is a hard error.
§14.4 Infinite loop prevention is mandatory.
§14.5 The ledger is the learning system.
```

---

## Build Session Log

```
Session: Bridge + Causal Physics + Contracts + Tests
Date: 2026-06-11

Files created:
  bridge/types.js           canonical Request schema
  bridge/ledger.js          SISO JSONL ledger
  bridge/identity.js        token + trust layer
  bridge/registry.js        HeartbeatManager wrapper
  bridge/router.js          ResolveGate→CircuitGate→DispatchGate→HoldGate
  bridge/server.js          thin HTTP, 14 routes
  bridge/index.js           8-phase BootSequence
  lib/causal/compound.js    CausalImpulse + ripple/wave/tidal engine
  contracts/SYSTEM-CONTRACTS.js  7 systems, 119 events, 19 gaps, 21 faults, 76 checks
  cli/session.js            SESSION.md renderer
  tests/brutal.test.js      65 tests, 40 crystallised invariants
  docs/AXIOMS-v2.0.md       45 axioms including Groups 9-14
  docs/NEXUS-SYSTEM.md      this document

Files modified:
  orchestrator.js / ui/orchestrator.js  bridge proxy, SYS, HEALTH_PATHS, CHANNELS
  cortex/boot.js            bridge.handshake + bridge.subscribe phases
  cortex/foundation/admin-server.js  /api/contracts, /api/tags fix, requests gated
  cortex/nas/router.js      Bridge provenance check, phantom quarantine
  guardian/server.js        bridge.handshake, enqueue gates, uploadDir fix, getLocalIPs
  nexus-connect.js          postBridge(), PORTS map with bridge
  lib/cfr/ledger.js         compound engine wired, /cfr/compound endpoint
  cli/boot-systems.js       bridge first in boot sequence
  cli/diagnose.js           diagBridge() rewritten, contractVerify() added
  cli/nexus-repl.js         bridge port, session command, systems help
  service/bridge-service.js delegate to bridge/index.js
  ui/cfr.html               syncCanvasNodes fix, SYSTEM_ANCHORS
  ui/ports.js               bridge: 9999
  ui/contracts.js           BRIDGE contract block
  tests/integration.test.js bridge route shape updated
  docs/NEXUS-SPEC.md        session rules, causal physics, contracts layer

Rogue write paths closed: 9
  - postBridge ghost (F004) → implemented
  - _physQueue.enqueue × 3 (F015) → Bridge-gated
  - requests in ALLOWED set (F005) → removed
  - POST /api/tags stub (F006) → implemented
  - NAS router phantom (F007) → quarantined
  - cliRequests/cliTag ghost (F008) → implemented
  - dual orchestrator (F013) → synced identical

Crystallised invariants: 40
Verification checks defined: 76
Named axioms: 45 (was 34)
```

---

*If you are starting a new build session:*
1. Run `node cli/session.js` — read the output
2. Read this document
3. Read `docs/AXIOMS-v2.0.md`
4. Ask the five FORGE-SKILL orienting questions
5. Then build
