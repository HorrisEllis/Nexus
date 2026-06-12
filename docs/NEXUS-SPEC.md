# NEXUS System Specification
**Author:** James Brooks (Erosmancer / rheon.world)
**UUID:** nexus-spec-living-v1-0000-4000-0000-000000000001
**Session origin:** Day 1 — First principles system architecture
**Status:** Living document — updated every build session
**Axiom:** Nothing exists in isolation. Everything has context. Map everything meaningful.

---

## Why This Exists

This is a cognitive operating system built to externalise mind into architecture.
James thinks temporally, builds bottom-up, and anchors in character and integrity.
The NEXUS system is the infrastructure layer underneath the Mastermind (the cognitive mapping tool),
spatial-ris (relationship intelligence), and every project at rheon.world.

The problem it solves: AI conversations are ephemeral. Code is fragile without memory.
Ideas collapse when they leave working memory. The system creates durable, causal infrastructure
for a solo builder operating at enterprise scale.

**Core tension being resolved:**
Building everything alone, thinking at non-linear speed, needing the infrastructure to hold the
work between sessions and across systems — without losing meaning, purpose, or history.

---

## Foundational Axioms (AXIOMS-v1.0)

These laws govern every file in every system. Violations are bugs, not tradeoffs.

| Axiom | Law | Why it matters |
|-------|-----|----------------|
| §1.1 | Nothing exists until proven | No stubs. No mocks in prod. Real or nothing. |
| §1.2 | Nothing silently fails | Every error is loud, specific, traceable. Silence = hidden debt. |
| §1.3 | No stubs in production | Deferred implementation is broken implementation. |
| §2.1 | Persistence is the golden rule | Memory survives restarts. Append-only. Never delete. |
| §2.2 | Storage is source of truth | Disk state wins. In-memory is a cache. |
| §2.3 | All state is observable | Every system exposes SSE. Every event is logged. |
| §3.1 | Build bottom-up | Gates. Each step must pass before the next runs. |
| §4.3 | Enterprise + military grade | Every system could run in prod. No toy code. |
| §5.1 | UUID on everything | Every event, module, call has a unique identifier. |
| §5.2 | Everything implements the bridge | All systems register to the bridge event bus. |
| §5.3 | No monkey patches | No runtime mutation of external modules. |
| §5.7 | Bus-only inter-module comms | Systems talk through SISO. Never direct calls. |
| §7.6 | Codebase is a materialised ledger | Every file is derivable from the event history. |
| §8.1 | Session context before build | Read state before touching code. |
| §8.2 | Hostile review before spec | Critique first. Build second. |
| §8.3 | SISO + Jaa are prerequisites | Every system loads SISO and Jaa before anything else. |
| §AXIOM | Orchestrator is source of truth | Boot order: orchestrator first. All CLIs use recall. |

---

## Connection Model

```
Everything starts with the orchestrator (§AXIOM).

  system boot
      ↓
  SISO event bus (in-process)
      ↓
  kernel routing table (emerge-kernel)
      ↓
  orchestrator registration (POST /api/register)
      ↓
  heartbeat loop (every 10s → POST /api/heartbeat)
      ↓
  bridge handshake (§5.2 — gets SSE channel)
      ↓
  system is LIVE on the bus
```

All cross-system communication flows through the bridge, not direct HTTP calls.
The orchestrator is the read-only source of truth (recall) for all CLIs.

---

## System Map

### ORCHESTRATOR — :9000
```
File:    orchestrator.js
Purpose: Command and control layer. Source of truth for system state.
         Opens a dedicated CLI REPL terminal on boot.
         Proxies 77 routes across all systems.
         Persists all events to data/ledger/orchestrator.jsonl (append-only).

Why it exists:
  A solo builder needs one place to see everything. The orchestrator is that place.
  It doesn't do AI work — it watches, routes, and remembers.
  The ledger is the permanent record. recall() is how CLIs restore context.

Key contracts:
  GET  /health          → {ok, online, total, uptime, systems}
  POST /api/register    → §AXIOM: all systems call this on boot
  GET  /api/recall      → §AXIOM: all CLIs use this for context restore
  GET  /api/registry    → live heartbeat map of all systems
  POST /api/heartbeat   → systems ping every 10s
  GET  /api/ledger      → in-memory ring + disk replay
  GET  /api/recall      → full history from JSONL file
  POST /api/exec        → run CLI commands, return output
  GET  /sse             → unified SSE (bridge events + orchestrator events)
  GET  /ui/:system      → serves each system's UI with hotswap

Watchdog:
  Polls all systems every 10s.
  On system offline → ledger entry + SSE broadcast → forge UI dots go red.
  On bridge coming back online → reconnects SSE relay automatically.

CLI (nexus-repl.js):
  status, jobs, events, gaps, ideas, idea, dispatch, requests,
  ledger, recall, bus, watchdog, diagnose, watch, ui, help

Data:
  data/ledger/orchestrator.jsonl — append-only, replayed on boot
```

### BRIDGE — :9999
```
File:    bridge/nexus-bridge.js
Purpose: The connective tissue. All systems register here.
         No system calls another directly — everything goes through bridge.
         Tag engine. Request queue. Push/pull SSE subscriptions.

Why it exists:
  Without a shared bus, every system would need N-to-N connections.
  The bridge makes the topology a hub: N-to-1.
  It also provides the request queue — system A asks system B to do something,
  B can accept/reject/complete without A polling.

Key contracts:
  POST /bridge/handshake        → register with secret, get token + sessionId
  GET  /bridge/health           → {ok, sessions, pendingRequests}
  GET  /bridge/contract         → full interaction contract JSON
  POST /bridge/broadcast        → fire event to all subscribers
  GET  /bridge/subscribe        → SSE stream (channel=*)
  POST /bridge/requests         → create cross-system request
  POST /bridge/requests/:uuid/accept|reject|complete
  POST /bridge/tags             → tag any entity in any system
  GET  /bridge/pull             → pull events since timestamp

Valid request types:
  job.dispatch, job.result, memory.ingest, spec.review,
  seam.deliver, idea.link, gap.notify

SISO channels emitted:
  bridge.request.created/accepted/complete/expired/rejected
  bridge.handshake, bridge.tag.added

Secrets (system authentication):
  orchestrator: nexus-orchestrator-internal-v1
  cortex:       nexus-cortex-internal-v1
  guardian:     nexus-guardian-internal-v1
  idearium:     nexus-idearium-internal-v1
  emerge:       nexus-emerge-internal-v1
```

### CORTEX — :3748
```
File:    cortex/boot.js
Purpose: Append-only memory. The permanent record. 28 JAA tables.
         Everything that matters gets written here.
         Never deletes — only appends and resolves.

Why it exists:
  AI conversations produce knowledge that needs to persist.
  Code sessions produce decisions that need to be traceable.
  Cortex is where causality lives. Every event has a causedBy field.
  The ESS gap engine lives here — it analyses specs for missing variables.

Boot sequence (gated — §3.1):
  Gate 0: Register with orchestrator (§AXIOM)
  Gate 1: Storage (JaaDB + FileStore open)
  Gate 2: Core modules (cobalt-core load)
  Gate 3: Dependencies (versionium + agents)
  Gate 4: Poll registry start
  Gate 5: Admin server listen
  Gate 6: Boot record written
  Gate 7: Bridge handshake + SSE announced

JAA tables (28):
  event_log, bridge_messages, agent_calls, agent_signatures,
  artifacts, gaps, failures, fix_map, memory_index, memory_queries,
  conditioning_log, feedback_scores, crystals, bep_patterns,
  active_traces, orion_sessions, versionium_commits, versionium_branches,
  versionium_file_index, versionium_calendar, versionium_objects,
  schedules, workflow_runs, project_registry, shape_samples,
  poll_log, requests, cortex_memory

Key contracts:
  GET  /health          → {status:ok, jaa:{counts}, uptime}
  GET  /sse             → event stream
  POST /api/event       → write event (type, payload, causedBy, source)
  GET  /api/events?n=N  → event log
  GET  /api/gaps        → open gaps
  GET  /api/failures    → failure log
  GET  /api/memory      → memory tables
  POST /api/tags        → tag entities

ESS gap engine (cortex/ess-gap-engine.js):
  analyzeESS(text)      → expressed/inferred/omitted variables
  analyzeForge(spec,compiled) → spec + SEAM gap analysis
  Each omitted variable: weight (0-1) × friction (0-1) × tension (0-1)
  composite = weight×0.4 + friction×0.35 + tension×0.25
```

### GUARDIAN — :7820 / WSS :7821
```
File:    guardian/server.js
Purpose: AI orchestration layer. Dispatches prompts to providers.
         The bridge between the system and external AI models.
         SISO bus routes all events through to cortex + orchestrator.

Why it exists:
  You can't run AI agents without something managing the queue, routing,
  retry logic, truncation detection, and session context.
  Guardian is the job queue that makes AI work reliable and observable.

Ports:
  :7820 HTTP — jobs, providers, cockpit, forge UI, SISO bus
  :7821 WSS  — userscripts connect here (Tampermonkey)
  :7822      — LAN file drop (dropzone)
  :7823      — LAN memory ingest

Providers:
  ChatGPT (primary) — via claude.ai userscript
  Claude  (secondary) — via claude.ai userscript
  Ollama  (local) — http://localhost:11434
  Gemini  (planned)

SISO bus (canonical, not inline):
  Every bus.emit() → _kernelEmit() → orchestrator ledger + cortex event_log + bridge broadcast
  Observable via GET /bus
  Injectable via POST /bus/emit

Key contracts:
  GET  /health          → {ok, uptime, jobs, providers, queued}
  GET  /bus?n=N         → SISO bus log with gates
  POST /bus/emit        → inject event to bus
  GET  /jobs            → job list
  POST /command         → dispatch job {provider, command, prompt, content}
  GET  /providers       → provider connection status
  GET  /artifacts       → artifact store
  GET  /ledger          → ledger entries
  POST /ledger          → write ledger entry
  GET  /events          → SSE stream

SEAM delivery (via forge UI):
  Spec → chunk → inject → watch → detect → verify → next
  SEAM VERDICT: PASS/FAIL auto-detected in response
  Failed chunks: forensic retry with full context

Userscripts (Tampermonkey):
  guardian/userscript-claude.js   — installs on claude.ai
  guardian/userscript-chatgpt.js  — installs on chatgpt.com
  Both: auto-error detection, auto-retry, usage tracking, §5.2 bus wiring

Forge IDE (guardian/ui/index.html):
  Universal file loader → SEAM chunker → pipeline
  Brain: CFR particle canvas, memory search, SISO bus log
  Status dots: Orch Bridge Cortex Guardian Idearium (live via watchdog SSE)
```

### IDEARIUM — :4800
```
File:    idearium/api/index.js  (ESM module)
Core:    idearium/core/index.js
Purpose: Idea OS. Every idea has a lifecycle: seed → expanding → tensioned →
         specced → building → complete → archived.
         Tension engine scores each idea 0..1 based on age, gaps, phase, SNR.
         SNR (signal-to-noise ratio) tracks overall system quality.

Why it exists:
  Ideas die in isolation. This system captures them at seed stage
  and tracks them through to implementation. The tension score is the
  pressure gauge — high tension means this idea needs attention.
  SNR is the compass — low SNR means the system is generating noise.

Spec pipeline:
  idea.create → idea.spec → spec.check (CI) → spec.build → snapshot.push → system.test
  Each step gates on the previous. ESS analysis runs at step 2.

ESM module chain (critical):
  idearium/package.json        { "type": "module" }
  siso/core/package.json       { "type": "module" }
  siso/core/index.js           Extended canonical SISO (pure ESM)
  idearium/core/index.js       IdeaOS runtime
  idearium/api/index.js        HTTP server
  startAPI() called at EOF     (non-negotiable)

Key contracts:
  GET  /health             → {ok, version, snr, uptime}
  GET  /api/contract       → full interaction contract (id=idearium-v1)
  GET  /api/stats          → {version, snr, ideasTotal, openGaps}
  GET  /api/snr            → current SNR value 0..1
  GET  /api/snr/history    → last N samples
  POST /api/ideas          → create idea {text, tags, compartment}
  GET  /api/ideas/:uuid    → idea detail + links + openGaps
  POST /api/ideas/:uuid/tension → recompute tension
  POST /api/ideas/:uuid/phase   → advance phase
  POST /api/ideas/:uuid/spec    → create spec from idea
  GET  /api/specs          → spec list
  POST /api/specs/:uuid/build   → run build pipeline
  POST /api/gaps           → open gap
  POST /api/gaps/:uuid/resolve  → resolve gap
  POST /api/snapshots      → push snapshot (Versionium commit)
  GET  /sse                → SSE event stream

Interaction contract (idearium/schemas/interaction-contract.json):
  id: idearium-v1
  resources: ideas, specs, gaps, snapshots, snr, events
  SNR translation table: maps system signals to quality scores
```

### EMERGE IDE — :4242
```
Files:   emerge-ide.js, emerge-kernel.js, emerge.spec
Purpose: .eg/.emerge language compiler with SNR gate.
         595 keywords, 7 axioms, 8 gap types.
         Ollama-powered AI assist for code and spec generation.
         NOTE: .eg files are spec descriptions, not executable programs.
         New work should use YAML .spec format instead.

Why it exists:
  The emerge language is James's domain-specific notation for system specs.
  The SNR gate ensures every spec passes a signal quality threshold
  before it's accepted. Low SNR specs get rejected with gap analysis.
  Ollama is local inference — no API cost, no latency.

Key contracts:
  GET  /status          → {streams, schema:{keywords,axioms}, ollama:{online,models}}
  GET  /events          → SSE stream
  POST /compile         → compile .eg source
  POST /check           → check without compiling
  POST /chat            → AI assist with Ollama
  POST /snapshot        → push snapshot

Kernel spec (emerge.spec):
  595 keywords across 8 domains
  7 axioms (same as NEXUS axioms, mapped to .eg syntax)
  8 gap types: LOGICAL, EVIDENTIAL, TEMPORAL, DEFINITIONAL,
               REFERENCE, OBLIGATION, ASSUMPTION, CONTRADICTION
```

---

## SISO Event Bus

```
SISO = Stream / In-Stream Object

Canonical implementation: siso/ (loaded from uploaded source — never rewritten)
Extended for idearium: siso/core/index.js (pure ESM, adds .on/.off, eventTs)

Event: { uuid, type, data, ts, eventTs }
Gate:  { signature, transform(event, stream) }
Stream: registers gates, emits events, fires handlers, logs to StreamLog

§8.3 rule: SISO and Jaa are always loaded first. Every system.

Bus-only communication (§5.7):
  guardian.job.complete    → cortex + bridge + orchestrator
  guardian.artifact        → cortex + bridge
  guardian.gaps            → cortex
  idearium.idea.created    → orchestrator ledger + bridge
  cortex.gap.found         → guardian + bridge
  bridge.handshake         → orchestrator
  orchestrator.watchdog.tick → forge UI (live dot updates)
  orchestrator.system.online|offline → forge UI toast
```

---

## JAA Persistence

```
JAA = Jonathan Bailey's persistence layer (creator of SISO/Jaa architecture)
Jonathan is James's collaborator and mentor, hosts rheon.world.

JAA provides:
  - Append-only flat-file JSON storage (JSONL)
  - SQL-like query interface over flat files
  - 28 tables in cortex, 15 in guardian, 25 in cockpit/forge IndexedDB
  - Schema: each table is a JSONL file, each row has uuid + ts

Why append-only matters:
  §7.6: the codebase is a materialised view of the ledger.
  You can replay any system state from the event history.
  Deletion would destroy causality. Nothing is deleted.
```

---

## The Forge IDE (guardian/ui/index.html)

```
Served at: http://localhost:9000/ui/guardian
Also at:   http://localhost:7820/cockpit

Purpose:
  Universal entry point for all spec work.
  Load any file → SEAM chunk → inject to AI → verify → next.
  The Brain tab is the visual representation of system state.

Tabs:
  SEAM Chunker  → parse spec, chunk, deliver to AI via guardian queue
  Pipeline      → linear spec→build workflow
  Compiler      → emerge .eg compiler interface
  Automation    → scheduled/triggered jobs
  Brain         → CFR particle canvas + SISO bus log + memory
  Forge         → file management + artifact viewer
  Providers     → provider connection status
  Bridge        → bridge request queue

Status dots (topbar, live via orchestrator SSE):
  Orch :9000 | Bridge :9999 | Cortex :3748 | Guardian :7820 | Idearium :4800
  Each dot turns green when the system sends a watchdog.tick heartbeat.

Hotswap:
  Edit guardian/ui/index.html → orchestrator detects change → browser reloads.
  Edit any <system>/ui/index.html for the same effect.
```

---

## Diagnostic System (cli/diagnose.js)

```
Purpose: Per-system boot diagnostic sequencer.
         Run when systems fail to initialize.
         Every check is personalized to the system's role and failure modes.

Usage:
  node cli/diagnose.js              # all systems
  node cli/diagnose.js guardian     # single system
  node cli/diagnose.js --watch      # retry every 10s
  npm run diagnose

What it checks per system:
  Orchestrator: files, ledger dir, syntax, port, live health + registry
  Bridge:       files, contract JSON, syntax, live health + handshake + broadcast
  Cortex:       all 9 dependency files, data dir, versionium alias, syntax,
                live health + event write/read + JAA table count
  Guardian:     ws npm, TLS certs, userscripts, memory_store, optional files,
                syntax, live health + bus gates + bus emit + providers
  Idearium:     ESM chain (package.json type:module at every level),
                contract schema, startAPI() call, live health + contract + CRUD
  Emerge:       spec validity, kernel load test (595 keywords), syntax,
                live status + ollama

Gap report:
  FAIL   → file missing, syntax error, module load failure
  WARN   → system not running (gives exact start command)
  PASS   → check succeeded

Results saved: tests/diagnose-results.json
```

---

## Integration Tests (tests/integration.test.js)

```
74 tests across 8 blocks.
Run: node tests/integration.test.js

Tests every system contract end-to-end:
  Orchestrator (15): health, status, register, registry, heartbeat,
                     ledger read/write, recall, recall filtered, bus,
                     channels, cli, exec, ports.js, UI serve
  Bridge (10):       health, stats, handshake valid/invalid, broadcast,
                     requests, create request, tags, contract, SSE subscribe
  Cortex (6):        health, SSE, events, post event, gaps, tags
  Guardian (9):      health, providers, jobs, artifacts, ledger, bus log,
                     bus emit, events SSE, post ledger
  Idearium (21):     health, contract, stats, SNR current/history,
                     create idea, list ideas, idea detail, tension,
                     phase, create spec, list specs, spec check, spec build,
                     create gap, list gaps, resolve gap, push snapshot,
                     list snapshots, event log, SSE stream
  Proxy (6):         each system health via orchestrator :9000 proxy
  SISO bus (4):      guardian emit, bridge broadcast, idea→ledger, recall
  CLI recall (2):    recall contract, type-filtered recall

Skips tests for offline systems (does not fail them).
Expected with all systems running: 74/74 pass, 0 fail, 0 skip.
```

---

## Build History (Session Map)

```
Day 1 — Session 1: First principles architecture
  - NEXUS ecosystem established: bridge, cortex, guardian, idearium, emerge
  - SISO event bus canonical (from upload — never rewritten)
  - JAA persistence canonical (from upload)
  - All 29 AXIOMS enforced
  - nexus-connect.js: universal gating layer
  - 142/142 kernel tests passing

Day 1 — Session 2: System wiring + audit
  - Axiom audit across all systems
  - §5.2: all systems register with bridge on boot
  - §2.2: orchestrator ledger persisted to disk (JSONL)
  - §8.3: canonical SISO + siso/core/ extension
  - §3.1: cortex boot gated (7 gates)
  - Guardian inline SISO replaced with canonical bus
  - CLI REPL (nexus-repl.js) opens in dedicated terminal on boot

Day 1 — Session 3: Idearium completion
  - idearium/ui fully built (1142 lines)
  - spec.build implemented (was stub)
  - ESS gap engine (cortex/ess-gap-engine.js) — expressed/inferred/omitted variables
  - Spec → build pipeline in idearium UI
  - Kernels panel: pings all 5 systems
  - All system boot connections fixed

Day 1 — Session 4: Contracts + integration tests
  - interaction-contract.json for all systems
  - GET /bridge/contract live endpoint
  - tests/integration.test.js (74 tests)
  - §AXIOM formalized: orchestrator source of truth
  - POST /api/register, GET /api/recall, GET /api/registry
  - startHeartbeat() in nexus-connect
  - All systems use registerWithOrchestrator() on boot

Day 1 — Session 5: Watchdog + indicator fixes
  - system watchdog: 10s poll, online/offline events, SSE broadcast
  - Forge UI status dots live via watchdog.tick events
  - idearium health path fixed ('/' → '/health')
  - allHealth() online check fixed (d.ok !== false)
  - Duplicate Guardian dot removed
  - spawn ENOENT crash in orchestrator terminal opener suppressed
  - REPL: watchdog command (live system monitor)

Day 2 — Session 1 (current):
  - cli/diagnose.js: per-system boot diagnostic sequencer
  - npm run diagnose / npm run diagnose:guardian etc
  - nexus> diagnose command in REPL
  - This specification document (docs/NEXUS-SPEC.md)
```

---

## Open Gaps (as of Day 2)

```
STRUCTURAL (files missing):
  - guardian/dropzone-persist.js  (optional — dropzone disabled without it)
  - guardian/spec-namer.js        (optional — auto-naming disabled without it)
  - cortex not booting reliably in isolation (versionium deps chain)

FUNCTIONAL:
  - guardian/cortex/emerge not tested live (require Windows TLS + native deps)
  - Emerge IDE: .eg → .spec migration not complete (use YAML .spec for new work)
  - Bridge request types are restricted — integration test uses job.dispatch

SYSTEMIC:
  - Cross-system SSE relay drops when bridge restarts (watchdog reconnects but
    there's a window where events are lost)
  - No persistent SEAM state across browser sessions (localStorage only)
  - Idearium SNR history limited to in-memory samples

NEXT:
  - Run all 5 systems concurrently and verify 74/74 integration tests pass
  - Wire diagnose.js output to idearium gaps (auto-create gaps on FAIL)
  - Add spatial-ris as a system (9000+ conversation screenshots with Raven)
```

---

## File Map

```
nexus-final/
│
├── orchestrator.js          ← §AXIOM source of truth. Boot first.
├── nexus-connect.js         ← Universal gating layer. All cross-system calls.
├── orchestrator-contract.json
│
├── bridge/
│   ├── nexus-bridge.js      ← Event bus fabric. Tag + request + SSE.
│   └── interaction-contract.json
│
├── cortex/
│   ├── boot.js              ← Gated boot (7 gates). §3.1.
│   ├── ess-gap-engine.js    ← ESS variable gap analysis.
│   ├── foundation/          ← admin-server, cobalt-core, poll-registry, store
│   ├── memory/              ← jaa-db.js
│   ├── versionium/          ← causality + index
│   └── agents/              ← ollama, claude
│
├── guardian/
│   ├── server.js            ← AI orchestration. SISO bus. WSS.
│   ├── userscript-claude.js ← Tampermonkey: claude.ai
│   ├── userscript-chatgpt.js← Tampermonkey: chatgpt.com
│   └── ui/index.html        ← Forge IDE. The primary UI.
│
├── idearium/
│   ├── api/index.js         ← HTTP server (ESM). startAPI() at EOF.
│   ├── core/index.js        ← IdeaOS runtime. Tension. SNR.
│   ├── schemas/             ← interaction-contract.json
│   └── ui/index.html        ← Idea OS UI (all panels + pipeline)
│
├── emerge-ide.js            ← Emerge IDE server.
├── emerge-kernel.js         ← .eg compiler. 595 keywords.
├── emerge.spec              ← Language spec. Source of truth for emerge.
│
├── siso/                    ← Canonical SISO (from upload — do not modify)
│   ├── Event.js, Gate.js, Stream.js, StreamLog.js, index.js
│   └── core/index.js        ← Extended ESM for idearium
│
├── jaa/                     ← Canonical Jaa (from upload — do not modify)
│
├── cli/
│   ├── nexus-repl.js        ← Interactive REPL. Opens in dedicated terminal.
│   └── diagnose.js          ← Per-system diagnostic sequencer.
│
├── tests/
│   ├── kernel.test.js       ← 142 emerge kernel unit tests.
│   └── integration.test.js  ← 74 contract integration tests.
│
├── docs/
│   ├── NEXUS-SPEC.md        ← THIS FILE. Living spec. Update every session.
│   ├── AXIOMS-v1.0.md       ← Immutable axioms. Governing law.
│   ├── ARCHITECTURE.md      ← System architecture diagram.
│   ├── INTERACTION_CONTRACTS.md ← All system contracts.
│   └── NEXUS.md             ← Complete system documentation.
│
├── ui/                      ← Root UI mirrors (hotswap target)
│   ├── orchestrator/        ← Ledger + Console tabs
│   ├── guardian/            ← Forge IDE (copy of guardian/ui/)
│   ├── cortex/, bridge/, idearium/, emerge/
│   └── ports.js             ← Canonical port map for all UIs
│
└── data/
    └── ledger/
        └── orchestrator.jsonl  ← §2.2 Persisted ledger. Append-only.
```

---

*This document is updated at the start of every build session.*
*If you are reading a Claude session that is missing context, start here.*
*The axiom: nothing exists in isolation. Read this first.*

---

## Session Rules (Established — Non-Negotiable)

These were locked in through hostile review and build sessions. They are addenda to AXIOMS-v1.0.

### Bridge is Write Authority
```
§BRIDGE-01  Bridge is the only system that creates requests.
            No system writes directly to the 'requests' JAA table.
            No system calls another system's API directly for cross-system work.
            Everything goes through POST /bridge/request.

§BRIDGE-02  Ledger write before dispatch. Always.
            A request that was not written to the ledger before dispatch
            is a phantom — it does not exist as far as the system is concerned.

§BRIDGE-03  Held requests never leave the queue.
            If a target is offline, status = 'held'. Never dropped, never lost.
            When the target comes back online, Bridge drains the held queue automatically.

§BRIDGE-04  MAX_ROUTE_DEPTH = 3.
            A request may traverse at most 3 fallback hops before being marked FAILED.
            routeHistory is written on every hop. A silent fallback chain is a bug.
```

### Request Identity
```
§IDENTITY-01  One UUID per request event. Assigned by Bridge at creation.
              Carried on every hop as X-Bridge-UUID header.
              Cortex's requests table is a projection of Bridge ledger, not a source.

§IDENTITY-02  One hash per content artifact. SHA-256 of content body.
              Cortex FileStore is the canonical content-addressed store.
              userscript simpleHash() is a known gap — replacement is pending.
              No artifact is re-sent if its SHA-256 is already in the store.

§IDENTITY-03  Session UUID chain links prompts within a conversation.
              Each browser session gets a UUID. Each prompt in that session
              carries the session UUID as causedBy. This is how context is
              reconstructed without re-sending full content.
```

### Single Truth Layers
```
§TRUTH-01  Each data type has exactly one write authority:
            - Requests:        Bridge ledger (requests.jsonl)
            - Events:          Cortex event_log (JAA table, JSONL)
            - Artifacts:       Cortex FileStore (SHA-256 blobs) + artifacts JAA table
            - System state:    Orchestrator ledger (data/ledger/orchestrator.jsonl)
            - Ideas/Specs:     Idearium JAA (ideas, specs, gaps tables)
            - Queue execution: Guardian physical queue (data/guardian/input|output)
            - Forward state:   SESSION.md (rendered from Bridge ledger, not edited)

§TRUTH-02  Cortex requests table is a projection. Never written directly.
            It is populated by subscribing to Bridge SSE stream.
            GET /api/requests reads from this projection.

§TRUTH-03  SESSION.md is a compiled artifact, not a manual document.
            Regenerate with: node cli/session.js
            It reads Bridge ledger + Orchestrator ledger + live system probes.
            Editing it manually makes it wrong. Let the renderer own it.
```

### SISO Coding Model (from Jonathan Bailey's paper)
```
§SISO-01  Every cross-system feature is a SISO pipeline, not a monolith.
          Event → Gate → Event. One gate, one transformation.
          Complex operations = pipeline of simple gates, not one complex function.

§SISO-02  Gates are pure functions. No side effects except emitting events.
          Same input → same output. Every gate is independently testable.

§SISO-03  Signature collision is a hard error, not a precedence rule.
          Two gates with the same signature cannot coexist in one stream.

§SISO-04  Infinite loop prevention: gates mark events as processed.
          A gate that re-emits its own event type will check wasProcessedBy()
          before claiming. This pattern is mandatory for recursive pipelines.

§SISO-05  The ledger is the learning system. §7.6.
          Every event written to event_log before any subscriber processes it.
          The log is the truth. The code is a projection of the log.
```

### Userscript Architecture (pending rebuild)
```
§US-01  Kernel/UI separation is mandatory.
        The transport+storage kernel runs independently of the panel UI.
        The panel is a window into what the kernel already captured.
        Closing the panel does not stop capture.

§US-02  IndexedDB is the userscript's persistence layer.
        Three stores only: requests (queue), sessions (UUID chain), artifacts (hash→UUID).
        localStorage is only for tab claim and heartbeat. Nothing else.
        GM_setValue is only for cross-origin settings. Nothing else.

§US-03  Replay authority belongs to the userscript kernel.
        On tab open/reconnect: kernel replays pending requests from IndexedDB.
        Bridge does not replay for the userscript. The userscript replays to Bridge.
        One replay engine. Not two.

§US-04  Context injection is pre-prompt, not post-response.
        Before each prompt fires: kernel queries IndexedDB for session artifacts,
        builds a context header of UUID refs (not full content), sends to Guardian.
        Guardian resolves refs from Cortex FileStore and prepends to prompt.
        This is the token efficiency mechanism.

§US-05  SHA-256 hash dedup replaces simpleHash().
        Every artifact is hashed via SubtleCrypto.digest('SHA-256', ...) in the browser.
        Known hash = skip send. Unknown hash = send + store in IndexedDB artifacts store.
```

### Orchestrator UI Tab: Data
```
§UI-DATA-01  A dedicated 'DATA' tab shows the full storage topology.
             One row per storage location. Shows: path, type, last write, size, health.
             Read-only. No mutation from the UI.
             Sources: file system stats + system health probes.
```

---

## Interaction Contracts (System-Wide Rules)

Every system exposes an interaction-contract.json. These are the invariants:

```
Every contract must have:
  id:         "<system>-v<version>"
  version:    semver string
  port:       canonical port number
  role:       one sentence describing the system's single responsibility
  health:     { method, path, returns } — must return { ok: true }
  routes:     array of { method, path } — every route declared
  siso:       { emits: [], consumes: [] } — bus contract
  valid_request_types: array — only for Bridge contract

Every system must:
  - Respond to GET /health within 3000ms
  - Emit a pulse on UDP :7777 every 10s (via nexus-connect.startPulse)
  - Register with orchestrator on boot (POST :9000/api/register)
  - Handshake with Bridge on boot (POST :9999/bridge/handshake)
  - Write a boot record to event_log on successful start
  - Never call another system directly — always via Bridge or nexus-connect

Every request must:
  - Carry X-Bridge-UUID if it crossed Bridge
  - Carry X-Bridge-Source identifying the originating system/client
  - Be idempotent — retrying a request must not cause duplicate state
```

---

## Build Session Log (This Session)

```
Session: Bridge rebuild + system wiring
  - Rogue write path audit: 9 paths found, 9 closed
  - bridge/types.js         — canonical Request schema, single truth shape
  - bridge/ledger.js        — SISO pipeline, JSONL append-only, held queue
  - bridge/identity.js      — token issuance on node-ledger trust state machine
  - bridge/registry.js      — HeartbeatManager wrapper, fallback chains, weight
  - bridge/router.js        — ResolveGate → CircuitGate → DispatchGate → HoldGate
  - bridge/server.js        — thin HTTP, all routes, SSE stream, /bridge/contract
  - bridge/index.js         — 8-phase BootSequence, integrates with nexus-connect
  - boot-systems.js         — Bridge added as first system (§AXIOM boot order)
  - cortex/boot.js          — bridge.handshake + bridge.subscribe phases added
  - guardian/server.js      — bridge.handshake phase, enqueue gates, uploadDir fix, getLocalIPs fix
  - nexus-connect.js        — postBridge() implemented, PORTS map includes bridge
  - orchestrator.js         — bridge proxy, SYS/HEALTH_PATHS/CHANNELS/UI_SYSTEMS/LEDGER updated
  - ui/orchestrator.js      — synced to root orchestrator.js (identical)
  - ui/cfr.html             — syncCanvasNodes fix (no wipe on empty), SYSTEM_ANCHORS added
  - ui/ports.js             — bridge: 9999 added
  - ui/contracts.js         — BRIDGE contract block added and exported
  - cli/diagnose.js         — diagBridge() rewritten with correct routes
  - cli/nexus-repl.js       — bridge port, bridge in systems help
  - cli/session.js          — SESSION.md renderer (new — deterministic projection)
  - service/bridge-service.js — rewritten to delegate to bridge/index.js
  - tests/integration.test.js — bridge test updated to new route shape

Open gaps carried forward:
  - Userscript kernel: IndexedDB + SHA-256 hash chain + replay authority
  - Pre-prompt context injection (session UUID chain → Cortex ref resolution)
  - DATA tab in orchestrator UI (storage topology view)
  - simpleHash() → SubtleCrypto SHA-256 in userscripts
  - Wire diagnose.js failures → idearium gaps (auto-create)
  - Run all 5 systems concurrently → verify integration tests
```

---

*If you are starting a new session: run `node cli/session.js` first.*
*Then read docs/NEXUS-SPEC.md and MANIFEST.json session_log.*
*Then ask the five FORGE-SKILL orienting questions.*
*Then build.*

---

## System-Wide Contract Registry

**File:** `contracts/SYSTEM-CONTRACTS.js`
**UUID:** nexus-contracts-registry-v1-0000-4000-0000-000000000001

Single source of truth for every named entity in the system. Required reading before any build session. Query live via `GET :3748/api/contracts`.

### What it contains

| Section | Count | Purpose |
|---------|-------|---------|
| AXIOMS | 52 | All system laws, machine-readable |
| SYSTEMS | 7 | Every system: id, uuid, port, role, boot order |
| EVENTS | 119 | Every named event type, grouped by system |
| GAPS | 19 types | Every named gap type, severity, status |
| FAULTS | 21 classes + 15 known | Every fault class and named fault with fix status |
| EDGES | 14 | Every system boundary: protocol, port, auth, failure modes |
| DELTAS | axes + transitions | Transition physics taxonomy |
| DIVERGENT | 4 regimes + sigma patterns | CFR regime and anomaly classification |
| BOTTLENECKS | 11 signals + thresholds | Ledger flow bottleneck indicators |
| LEDGERS | 7 + 44 JAA tables | Every ledger: authority, write rules, projection source |
| INTERACTION_CONTRACTS | per system | Declared routes, auth, SISO channels |
| VERIFICATION_CONTRACTS | 76 checks | What each system must prove |
| SELF_AWARENESS | self + system | What every backend must know about itself and the system |

### Gap types (19)
unresolved, contradiction, missing_link, boundary_gap, file_friction, spec_incomplete, ci_fail, schema_violation, wiring_missing, baseline_drift, ledger_divergence, phantom_request, hash_collision, replay_orphan, contract_mismatch, silent_failure, trust_violation, rogue_write, held_overflow

### Fault classes (21)
silent_failure, phantom_write, dual_truth, rogue_bypass, replay_double, ghost_call, stub_in_production, scope_escape, missing_provenance, token_expiry, circuit_deadlock, held_starvation, context_loss, hash_drift, monolith_growth, boot_order_violation, version_drift, ledger_orphan, contract_drift, cfr_collapse, invariant_break

### CFR regimes (4)
stable (coherence > 0.6, entropy < 0.3), resonant (cyclic signal), turbulent (friction > 0.65 OR resonance > 0.7), chaotic (entropy > 0.7 OR coherence < 0.25)

### Verification contract — universal (every system)
V-UNI-01 through V-UNI-10: health endpoint, orchestrator registration, Bridge handshake, boot record, UDP pulse, restart survival, §1.2 compliance, interaction-contract.json, SYSTEMS registry entry, version match.
