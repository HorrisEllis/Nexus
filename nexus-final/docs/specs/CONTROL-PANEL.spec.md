# CONTROL PANEL (Orchestration Core)
**UUID:** nexus-sys-control-0000-2026-0531-002
**Layer:** 1–6 — core through signal
**Port:** :3748
**Status:** active
**Source:** NEXUS-CORE.spec, NEXUS-SPEC-v9.spec, NEXUS-MODULES.spec, NEXUS-CAUSAL.spec

---

## What it is

The routing brain of the entire ecosystem. Every incoming signal is received here,
classified, and dispatched to the correct handler.

This is NOT an admin dashboard — that is the Cockpit UI (a skin over this system's CLI contract).
The Control Panel IS the NEXUS admin server at `:3748`. RAID, manifest, gap/healer,
signal processing, and the memory layer all run under this system.

Previously implicit in `server.js`. Named explicitly as the orchestration core in v9.0.

**Constitutional Laws enforced here:** All six. Violation → `law_violations` JAA insert + `toast.error` + `gap.found`.

---

## Axioms

| Axiom | Rule |
|-------|------|
| LAW_I | LOCAL FIRST — Ollama → Guardian-Claude → Guardian-ChatGPT → API Claude → API ChatGPT |
| LAW_II | MEMORY AUTHORITY — JAA insert before behavior. No in-memory-only state. |
| LAW_III | LAYER SOVEREIGNTY — no module imports another. All via JAA. |
| LAW_IV | SCHEMA OVER CODE — `temp:0` always. AJV validates everything. |
| LAW_V | CLI FIRST — UI is a skin. Every feature has a CLI command before it has UI. |
| LAW_VI | TOAST AUTHORITY — every failure emits a toast. Nothing silently fails. |
| §3.1 | Bottom-up boot. Foundation before modules. Architecture before code. |
| §3.2 | Logical time (tick) is the ordering axis. Wall time advisory only. |
| §4.3 | Enterprise and military grade from line one. |

---

## Boot sequence (all phases — HARD = abort on failure, SOFT = degrade)

| Phase | Name | Type | Modules |
|-------|------|------|---------|
| 0 | System checks | HARD | Node ≥18, port 3748 available, JAA dir writable |
| 1 | Crypto self-test | HARD | SHA-256, UUID gen, FNV-1a hash |
| 2 | File integrity | HARD | Hash check: jaa.js, siso.js, boot.js, poll-registry.js |
| 3 | JAA database open | HARD | Replay JSONL, open append streams for ALL_TABLES |
| 4 | SISO/ALK kernel | HARD | ringCap:50,000, pulse:5000ms |
| 5 | Foundation | HARD | bus-log, cobalt-registry, shape-sampler |
| 6 | Core layer | HARD | raid, manifest, translation, usage |
| 7 | Gate/Healer | HARD | gap-finder, healer |
| 8 | Agents | SOFT | ollama, agents-dispatcher, callto |
| 9 | Memory | SOFT | agent-memory, lattice-index, crystal, seam, delta-engine, fix-map |
| 10 | Signal | SOFT | topo-wire, ime-wire, orion-sensor/record/policy/verify |
| 11 | Causal Nexus | SOFT | sigma-detector, event-ledger, backup-engine, causality-walker |
| 12 | Guardian | SOFT | siphon, pulse, watchman |
| 13 | HTTP admin server | HARD | :3748 binding 127.0.0.1 |
| 14 | Versionium | SOFT | versionium |
| 15 | Automation/Idearium | SOFT | automation-engine, idearium, spec-builder |
| 16 | Cognition | SOFT | intent-map, bep-engine, self-model |
| 17 | Playground | SOFT | causal-playground, nsm-watchdog |
| 18 | Guardian UI | SOFT | separate process on :4242 |
| 19 | Boot complete | INFO | toast.boot GREEN, write boot_record, start .nex snapshot |

**Failure at any HARD phase:** write `data/boot-failure.json`, exit 1.

---

## What it does

### RAID — core/raid/index.js

Routes every agent request in LAW_I order. Learns from execution history. Applies behavioral gravity.

**Routing algorithm:**
1. Check Ollama health (`GET :11434/api/tags`, timeout 2s) → PASS: route to Ollama
2. Check Guardian connection (`guardian_nodes`, lastSeen < 12s) → Guardian-Claude → Guardian-ChatGPT
3. Route to API Claude (tokens — LAW_I last resort)
4. Route to API ChatGPT
5. All fail: write gap, escalate to human

**Routes to cloud ONLY when:** Ollama usage > 90% for last 60s, OR Ollama returned error 3 consecutive times, OR task explicitly requires capability Ollama cannot provide (declared in intent).

**Behavioral gravity (§A1):** Tracks `successRate per (intent × agent) pair`, `surpriseScore`, `avgLatencyMs`. Successful paths become attractors. Familiar intents reconstructed from BEG — not generated fresh.

**CLI:**
```
nexus raid status               — agent weights, health, last routing decision
nexus raid route <intent>       — simulate routing (dry-run)
nexus raid weights set <a> <w>  — adjust weight
nexus raid history [n]          — last N routing decisions with outcomes
nexus raid reset                — reset all learned weights
nexus raid blacklist <agent>    — remove from routing until cleared
```

### Gap Finder — gate/gap-finder.js

Continuously scans all JAA tables for behavioral deviations. Emits `gap.found` on bus. Does NOT heal — only finds and classifies.

**Detection strategies:**
- `stale_module` — module not seen in 60s
- `stuck_call` — `agent_call` status=processing for > 35s
- `recurring_failure` — source with ≥3 failures in recent window
- `missing_response` — agent_call completed but no response row
- `schema_violation` — JAA row doesn't match declared schema
- `law_violation` — module wrote to undeclared table (§M2)
- `behavior_gap` — declared expectedFlow not observed within SLA
- `dead_listener` — module registered but emitting no events for 2+ min

**CLI:**
```
nexus gap list [--severity high] [--status open]
nexus gap show <uuid>
nexus gap ignore <uuid> --reason "..."
nexus gap stats
```

### Healer — healer/index.js

Reads `gaps` table (status=open), applies fixes from `fix_map`, retries with failure context injection. Max retries: 3 (configurable). Escalates to human after max.

**Flow:** `gap.found` → `fix_map` lookup → retry with failure context injected → `healer.resolved` (toast.success GREEN) OR `healer.exhausted` (toast.error RED + human escalation).

**CLI:**
```
nexus healer status
nexus healer retry <gap-uuid>
nexus healer escalate <gap-uuid>
nexus healer history [n]
nexus healer fix-map list
nexus healer fix-map add <path> <fix>
```

### Manifest — core/manifest/index.js

Builds, validates, distributes the runtime manifest. `temp:0` is immutable — any manifest with `temp≠0` rejected by AJV (LAW_IV). The manifest is the current system state declaration.

### Signal layer — core/signal/

- **topo-wire.js** — bridge between `event_log` and 8-gate SNR pipeline. Polls every 1500ms. Writes to `snr_records`, `shape_samples`.
- **ime-wire.js** — behavioral profile builder per source UUID. Polls every 2500ms. Anomaly → `gap.found` of type `ime_anomaly`.
- **orion pipeline** — 4-stage quality gate: sensor → record → policy → verify. Only verified seams contribute to crystal promotion.

### HTTP routes (:3748)

```
GET  /health
GET  /api/stream        — SSE event stream
GET  /api/status
GET  /api/events?n=N
GET  /api/crystals
GET  /api/bep
POST /api/emit
GET  /admin
GET  /admin/*
GET  /
```

---

## Ledger scopes (four, not one)

| Scope | Description |
|-------|-------------|
| `event_log` | Everything that happens. Raw causal chain. Append-only. Never filtered. |
| `ledger_upgrade` | Proven state changes. Passing gates, healed gaps, verified outputs. |
| `ledger_idea` | Speculative and open. Open gaps, unverified requests, pending decisions. |
| `ledger_project` | One per `.world`. Everything that happened to project X. |
| `ledger_system` | One per system/compartment. Everything that system did. |

---

## Toast system (mandatory triggers)

| Trigger | Type | Colour |
|---------|------|--------|
| Any `init()` failure | `toast.error` | RED |
| Any `_tick()` uncaught error | `toast.error` | RED |
| Any JAA insert failure | `toast.error` | RED |
| Any gap found | `toast.gap` | RED |
| Any gap healed | `toast.success` | GREEN |
| Any crystal formed | `toast.crystal` | TEAL |
| Any `.nex` snapshot | `toast.snapshot` | GREY |
| Healer exhausted | `toast.error` | RED |
| Service crash | `toast.error` | RED |
| Service started | `toast.boot` | CYAN |
| Law violation | `toast.error` | RED |
| Agent call dispatched/received | `toast.agent` | PURPLE |

**Toast shape:** `{ uuid, type, module, message, causedBy, ts, actions[], autoClose }`

---

## SEAM contract (DISPATCH_CONTRACT)

```
commands:
  dispatch.job    { command, provider, prompt, content? } → { jobId, status }  timeout 120s
  dispatch.query  { endpoint, params? }                   → object             timeout 5s
events:
  dispatch.delivered  { jobId, provider, ts }
  dispatch.complete   { jobId, response, ts }
  dispatch.failed     { jobId, error, ts }
isolation:
  — No UI has direct access to jaa-store.js
  — Providers (WSS) cannot call HTTP routes directly
  — Jobs dispatched point-to-point — providers cannot read other providers' jobs
```

---

## What it does NOT do

- Does not store long-term memory (that is Cortex)
- Does not capture browser conversations (that is Guardian)
- Does not manage idea lifecycle (that is Idearium)
- Does not track file versions (that is Versionium)
- Does not build UIs — it only serves CLI-first contracts that UIs render
- Does not allow `temp≠0` in any manifest
- Does not allow any module to import another module (LAW_III)
- Does not allow a module to skip the JAA write path (LAW_II)
- Does not route cloud before exhausting local options (LAW_I)
- Does not emit toasts as optional (LAW_VI — toasts are the runtime nervous system)

---

## Open gaps

| ID | Description | Severity |
|----|-------------|----------|
| G-GUARDIAN-04 | Cockpit connects to :3748, Guardian HTTP at :7820 — port unification needed | CRITICAL |
| G-CAUSAL-01 | SNR Gate plugin host architecture not yet implemented | HIGH |
| G-CAUSAL-02 | snr-kernel.emerge not yet ported to JS | HIGH |
