# NEXUS SYSTEM MAP
**Version:** 9.0.0
**UUID:** nexus-system-map-0000-4000-0000-000000000001
**Author:** James Brooks (Erosmancer)
**Source:** NEXUS-SPEC-v9.spec, MASTEVOS-v9.spec
**Status:** living

---

## Axiom: Nothing exists in isolation. Everything has context.

This document maps meaning, purpose, and history. Every system is described in relation to every other system. Every connection is declared. Every gap is named.

---

## Layer stack (bottom to top)

```
15  META          nexus-self        — hourly self-portrait. reads everything. writes nothing except self_model.
14  COGNITION     intent-map        — semantic intent graph
                  bep-engine        — behavioral execution patterns
13  ORCHESTRATION orchestrator/COS  — §AXIOM source of truth. all systems register here.
12  ADMIN         HTTP :3748        — admin server, SSE relay
11  CAUSAL NEXUS  sigma-detector    — regime classifier
                  backup-engine     — sigma-gated backups
                  event-ledger      — append-only causal record
11  GUARDIAN      siphon            — chat ingestion
                  pulse             — mesh topology
                  watchman          — health monitor
 9  MEMORY        crystalball       — MCL + MQL + BEP + lattice
                  agent-memory      — agent self-model
                  fix-map           — gap→fix knowledge
 8  AGENTS        ollama            — primary (LAW_I step 1)
                  callto            — guardian browser tabs (LAW_I step 2)
                  claude-api        — cloud fallback (LAW_I step 4)
 7  VERSIONING    versionium        — causal version control
                  causality-walker  — per-file causality graph
 6  SIGNAL        topo-wire         — SNR gate bridge
                  ime-wire          — behavioral profiles
                  orion             — 4-stage quality gate
 5  GATE/HEALER   gap-finder        — structural gap detection
                  healer            — gap→fix loop (max depth 5)
 4  CORE          raid              — agent routing, LAW_I enforcement
                  manifest          — runtime manifest, temp:0
                  translation       — intent IR builder
                  usage             — token tracking
 1  FOUNDATION    siso              — event bus (sealed v3.3.0)
                  jaa               — persistence (sealed v3.3.0)
                  shape-sampler     — sigma/delta/slope/snr
                  cobalt-registry   — module auto-registration
                  bus-log           — event_log → StreamLog bridge
```

---

## Constitutional Laws (runtime enforced)

| Law | Name | Key rule |
|-----|------|----------|
| LAW_I | LOCAL FIRST | Ollama → Guardian-Claude → Guardian-ChatGPT → API Claude → API ChatGPT |
| LAW_II | MEMORY AUTHORITY | JAA insert before behavior. No in-memory-only state. |
| LAW_III | LAYER SOVEREIGNTY | No module imports another. All via JAA. |
| LAW_IV | SCHEMA OVER CODE | `temp:0` always. AJV validates everything. |
| LAW_V | CLI FIRST | Every feature has a CLI command before it has UI. |
| LAW_VI | TOAST AUTHORITY | Every failure emits a toast. Nothing silently fails. |
| LAW_VII | UI ISOLATION | UIs connect ONLY through the interaction contract. |
| LAW_VIII | MAP BEFORE BUILD | No system built without a `.map` file first. |
| LAW_IX | NEX IMMUTABILITY | Original `.nex` never modified by sandbox session. |

**Violation consequence:** `law_violations` JAA insert + `toast.error` RED + `gap.found`

---

## System connections (topology)

```
                    ┌─────────────────────────────────────────────┐
                    │              COBALT CORE                     │
                    │   SISO event bus + JAA database              │
                    │   No ports. No imports. Foundation only.     │
                    └──────────────┬──────────────────────────────┘
                                   │ all systems communicate through here
              ┌────────────────────┼────────────────────────────────┐
              │                    │                                │
     ┌────────▼──────┐   ┌─────────▼────────┐   ┌──────────────────▼──────┐
     │ CONTROL PANEL │   │    CAUSAL NEXUS   │   │      VERSIONIUM         │
     │   :3748       │   │  sigma detection  │   │  causal version control │
     │   RAID+gaps   │   │  SNR gate         │   │  auto-commit on sigma   │
     │   manifest    │   │  backup engine    │   │  why-tracking           │
     └───────┬───────┘   └─────────┬─────────┘   └──────────────────────── ┘
             │                     │ shape.sampled
     ┌───────▼───────┐             │
     │   GUARDIAN    │◄────────────┘
     │  :7820/:7821  │
     │  agent control│
     │  browser ext  │
     │  forge UI     │
     └───────┬───────┘
             │ LAW_I routing
     ┌───────▼───────────────────┐
     │       AGENTS              │
     │  ollama :11434 (primary)  │
     │  callto → guardian tabs   │
     │  claude-api (fallback)    │
     └───────┬───────────────────┘
             │ agent.response.received
     ┌───────▼───────┐
     │    CORTEX     │
     │  memory API   │
     │  MCL+MQL+BEP  │
     │  recall/push  │
     └───────┬───────┘
             │ reads from all
     ┌───────▼───────┐
     │   IDEARIUM    │
     │  :4800        │
     │  idea OS      │
     │  spec builder │
     │  .map/.nex    │
     └───────┬───────┘
             │ reads from all
     ┌───────▼───────┐          ┌──────────────────┐
     │  NEXUS SELF   │          │  ORCHESTRATOR    │
     │  Phase 15     │◄────────►│  COS + :9000     │
     │  self-portrait│          │  §AXIOM source   │
     └───────────────┘          └──────────────────┘
```

---

## Data flows

### Agent call (idea → memory)
```
User/CLI intent
  → Translation (raw → Intent IR)
  → cortex.recall(intent) — MQL 5-lane retrieval → context packet
  → RAID routing (LAW_I: Ollama first)
  → agent.complete(context_packet) → response
  → gate/runner checks → gap.found if fails
  → cortex.push(response) → memory_index, MCL processes
  → Versionium: sigma check → auto-commit if > 0.15
```

### Gap healing (gap → resolved)
```
gate/gap-finder detects structural gap
  → gaps JAA insert (before behavior) → toast.gap RED
  → healer reads gaps (status=open)
  → looks up fix_map → applies fix with failure context
  → healer.resolved → toast.success GREEN
     OR healer.exhausted → toast.error RED + human escalation
```

### Memory crystallization (event → stable belief)
```
Significant event (gate.failed / gap.found / agent.response.received)
  → MCL.process(event): compute signal score
  → score < 0.30 → archived without tracing
  → score ≥ 0.30 → ACTIVE_TRACE in active_traces
  → cluster formed → CANDIDATE crystal
  → stabilityScore > 0.85 AND recurrenceHalfLife > 24h AND crossLaneCount ≥ 2 → STABLE
  → Orion verifies seam (for cross-AI beliefs) → seam_records (verified=true)
  → crystalball.crystal.formed → toast.crystal TEAL
```

### Trust scoring (source → routing weight)
```
Every SNR gate evaluation → snr_records INSERT
  → Beta(α,β) updated → trust_scores UPSERT
  → RAID reads wilsonLower → routing weight
  → Crystal fragility: surpriseScore × (1 - trustScore)
  → Self-model reads trustLandscape: top5/bottom5 by wilsonLower
```

### Spec pipeline (idea → artifact)
```
idea.create
  → idea.spec → spec.check (CI)
  → ESS analysis (expressed/inferred/omitted variables)
  → spec.build → snapshot.push
  → system.test → pipeline.complete
  → all steps logged to orchestrator ledger
  → bridge broadcast on complete
```

---

## Port map

| Port | System | Purpose |
|------|--------|---------|
| 9000 | Orchestrator | §AXIOM source of truth, recall, system registry, proxy |
| 9999 | Bridge | Tag engine, request queue, SSE relay |
| 4800 | Idearium | Idea OS API |
| 4242 | Guardian UI | Guardian UI server (renamed from Forge) |
| 7800 | Rheon IDE | IDE for Seam constraint language |
| 7820 | Guardian HTTP | AI orchestration, SISO bus, job queue |
| 7821 | Guardian WSS | Provider connections (TLS) |
| 7822 | Guardian Dropzone | File drop (LAN accessible) |
| 7823 | Guardian Memory | Memory server (LAN accessible) |
| 3748 | Control Panel | Admin server, SSE stream, Guardian handshake |
| 3747 | RESERVED | Bridge OS only — NEXUS never binds this |
| 11434 | Ollama | Local LLM |
| 8081–8083 | Playground | PHP/Node/Python sandboxes |

---

## File formats

| Format | Role | Build order |
|--------|------|-------------|
| `.map` | Living topology file per system | 1st — map before build |
| `.spec` | Living source of truth | 2nd — from the map |
| `.nex` | Bootable compressed container | 3rd — from the spec |
| `.world` | Living project archive | wraps .spec + .map + .iteration + history |
| `.system` | Per-system config schema | drives settings tab generation |
| `.iteration` | Sigma-aware version history | created when sigma delta > 0.15 |

---

## Interaction contracts (all systems must have one)

| System | File | Contract ID | Live endpoint |
|--------|------|-------------|---------------|
| Bridge | bridge/interaction-contract.json | bridge-v1 | GET /bridge/contract |
| Cortex | cortex/interaction-contract.json | cortex-v1 | GET /contract |
| Guardian | guardian/interaction-contract.json | guardian-v1 | GET /contract |
| Idearium | idearium/schemas/interaction-contract.json | idearium-v1 | GET /api/contract |
| Emerge | emerge/interaction-contract.json | emerge-v1 | GET /contract |
| Orchestrator | orchestrator-contract.json | orchestrator-v1 | GET /api/cli |

---

## All JAA Tables (consolidated)

### Foundation (8 tables)
`event_log`, `agent_signatures`, `shape_samples`, `failures`, `toasts`, `cli_history`, `law_violations`, `boot_records`

### Gate/Healer (4 tables)
`gaps`, `artifacts`, `healer_log`, `fix_map`

### Agents (4 tables)
`agent_calls`, `active_traces`, `bridge_messages`, `usage_log`

### Memory/Cortex (9 tables)
`memory_index`, `memory_queries`, `crystals`, `bep_patterns`, `cortex_memory`, `conditioning_log`, `feedback_scores`, `snr_records`, `trust_scores`

### Signal (7 tables)
`ime_profiles`, `delta_records`, `seam_records`, `orion_sessions`, `lattice_nodes`, `lattice_edges`, `trajectory_sessions`

### Guardian (5 tables)
`chat_sessions`, `chat_messages`, `chat_completions`, `guardian_nodes`, `guardian_health`

### Versionium (6 tables)
`versionium_commits`, `versionium_branches`, `versionium_file_index`, `versionium_calendar`, `versionium_objects`, `causality_nodes`

### Causal Nexus — NEW v9.0 (3 tables)
`sigma_records`, `backup_records`, `file_change_log`

### Automation/Idearium (10 tables)
`schedules`, `workflow_runs`, `ideas`, `specs`, `gaps (idearium)`, `snapshots`, `links`, `tension_records`, `ci_runs`, `snr_samples`

### Cognition (4 tables)
`intent_nodes`, `intent_edges`, `self_model`, `agent_signatures`

### Playground (3 tables)
`playground_runs`, `test_results`, `env_configs`

**Total: ~75 tables**

---

## Open gaps (consolidated, priority ordered)

### CRITICAL (boot will fail)
- G-MOD-01: `jaa-db.js` ALL_TABLES missing 25+ tables
- G-VER-01: Versionium tables missing from ALL_TABLES
- G-GUARDIAN-04: Cockpit connects :3748, Guardian HTTP at :7820 — port unification needed

### HIGH
- G-CORTEX-01/02/03: `cortex.recall()` API, `delete.request()` routing, push/pull model not enforced
- G-CAUSAL-01/02: SNR Gate plugin host not implemented, `snr-kernel.emerge` not ported
- G-SELF-01/02/03/04/07: Self-model + intent schemas missing, modules not wired, BEP contradiction not wired
- G-ORCH-01/02: Control Panel block view not built, `.world` parser not implemented
- G-IDEARIUM-01: Idearium not wired to Cortex for memory pull/push
- G-VER-02/03/05: Versionium not in poll-registry, CausalityMapper not wired, Vortex↔Versionium seam undefined
- G-MOD-02: 13 BUILD REQUIRED schemas not yet created

### MEDIUM
- G-GUARDIAN-02: Userscript download-all button
- G-CAUSAL-04/05: Orion boot wiring, IME-wire anomaly gaps
- G-ORCH-03/04: Drag-drop registration, settings tab auto-generation
- G-VER-04: Canvas spec-b bridge disconnected

### LOW
- G-SELF-06: `nexus intent graph` ASCII renderer
- G-ORCH-05/06: Taskbar service, reboot menu
- G-MOD-04/05: NAS module, tauri/ws-server integration

---

## Session history

| Session | What was built |
|---------|---------------|
| Day 1 S1 | First principles — SISO+JAA canonical, 142/142 kernel tests |
| Day 1 S2 | Axiom audit — §5.2 bridge registration, §2.2 ledger persistence |
| Day 1 S3 | Idearium completion — spec.build, ESS gap engine, pipeline UI |
| Day 1 S4 | Contracts + integration tests — 74 tests, /api/register, /api/recall |
| Day 1 S5 | Watchdog + indicators — live dots, spawn crash fixed, nexus> watchdog |
| Day 2 S1 | Diagnostic sequencer — cli/diagnose.js |
| Day 2 S2 | Consistency audit — interaction contracts for all systems, fragmentation fixed |
| Day 2 S3 | System specs written from canonical uploaded specs |

---

*This document is the system encoded as knowledge. It is updated every session.*
*If you are reading this in a new Claude session: start here, then read the individual specs.*
*The axiom: nothing exists in isolation. Everything has context.*
