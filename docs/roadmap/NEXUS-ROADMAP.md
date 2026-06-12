# NEXUS ROADMAP
## UUID: nexus-roadmap-v1-0000-2026-0611-jamesbrooks-001
## Author: James Brooks (Erosmancer)
## Status: living — append-only, never frozen
## CausedBy: session 2026-06-11, creative UI conversation

---

## FOUNDATION (done — shipping)

Everything below this line exists and runs.

- SISO Core v1.0.0 — event/gate/stream/streamlog foundation
- Jaa v1.0.0 — full SQL engine on SISO, dual JS+PHP
- NEXUS v3.0.0 — orchestrator, bridge, cortex, guardian, idearium, architect
- NCP transport — SSE+fetch, no WebSocket, no TLS dependency
- SEAM pipeline — spec→chunks→verified delivery, chunk gating
- Spec compiler v1.1.0 — .spec format, T0/T1 zero-token, T2/T3 chunked
- SEAM language spec v0.1.0 — first sovereign coding language, causedBy every keyword
- Cortex intelligence — pattern crystallisation, failure taxonomy, reuse index
- Meta observer — health, events, gaps, versions, fault taxonomy
- Architect — hook registry, SNR gate, blueprint engine, topology scanner
- Lab — LLM experiments, feedback loops, head-to-head, stress tests
- Hooks living maps — 6 system files, intent+UI+config+fault per hook
- Recursive diagnostics — L1-L5 escalation to agent

---

## PHASE 1 — SOLIDIFY (next, urgent)
**Goal: system survives everything. nothing is lost.**

### 1.1 State Persistence
- [ ] NEXUS_STATE.json — captures running systems, active queues, open lab sessions
- [ ] Resume on restart — SEAM queues reload, guardian jobs replay, lab sessions continue
- [ ] System state SSE — UI always reflects real state not assumed state
- [ ] Crash recovery — any system can die and rejoin without human intervention


### 1.5 Bridge — Causal Event Spine (BEFORE RAID)
**Spec:** docs/specs/BRIDGE-CAUSAL-SPINE-v1.0.0.md
**Why first:** RAID scores history. History must be coherent before scoring.

- [ ] bridge/causal/schema.js — event shape, canonical serializer, Ed25519 signature
- [ ] bridge/causal/ledger.js — append-only JSONL, causal index by UUID + parent
- [ ] bridge/causal/graph.js — DAG traversal, replay, causal tree query
- [ ] bridge/causal/projections.js — RAID view, health view, economy view, session view
- [ ] bridge/causal/server.js — HTTP endpoints (trace, project, replay, query)
- [ ] Per-service: one bridge.emit() call per meaningful action (6 services)
- [ ] Local buffer — services buffer 100 events on Bridge unreachable, flush on reconnect
- [ ] RAID reads projections not raw service probes

**Axioms (immutable):**
- §B-1 Every event is append-only
- §B-3 causalEdges is never null — empty array if root event
- §B-4 Signature covers canonical JSON with deterministic key ordering
- §B-5 Projections are derived, never primary truth
- §B-8 State is a projection of events — state as a stored concept is deprecated

### 1.2 RAID Overhaul
- [ ] Remove LAW_I — no single primary provider
- [ ] score.js — pure scoring function P(success | provider, intent, load, latency, history)
- [ ] economy.js — token window tracker per provider, persisted to JAA
- [ ] health.js — reachability vs capability distinction, staleness decay
- [ ] dispatch.js — execution only, reads score output, never decides
- [ ] Ollama as utility tier — classification, pre-processing, not peer competitor
- [ ] Causal feedback loop — every decision is test data
- [ ] Provider: chatgpt-free, gemini-free, ollama-local, claude-pro

### 1.3 Gemini
- [ ] userscript-gemini.js — mirrors claude v10, gemini.google.com DOM selectors
- [ ] Health probe in RAID
- [ ] Intent affinity map

### 1.4 Mobile UI
- [ ] Responsive nav — collapses to bottom tab bar on narrow viewports
- [ ] Touch-friendly panels — larger tap targets, swipe between tabs
- [ ] Offline-capable — reads cached state when system is unreachable

### 1.5 Housekeeping
- [ ] Kill 4242 browser auto-open
- [ ] Boot sequence on HOME first screen
- [ ] Forge + Forge IDE + spec-compiler consolidated

---

## PHASE 2 — CREATIVE INTERFACES
**Goal: multiple ways to touch the same system.**

### 2.1 Interaction Contract as Live Schema
- [ ] interaction-contract.json becomes executable — queryable by any UI
- [ ] Schema version negotiation
- [ ] Any UI that speaks GET/POST/:9000 + SSE is valid

### 2.2 DAW Interface
- [ ] Timeline panel — X axis time, tracks per system
- [ ] Event blocks — coloured by type, draggable for replay ordering
- [ ] Play/loop/record — cortex replay engine integration
- [ ] Scrub backward through causal history
- [ ] The cortex event ledger IS the session file

### 2.3 Block Canvas Builder
- [ ] Each block = a hook type from architect registry
- [ ] Wire blocks together = workflow_runs JAA insert
- [ ] Run button = automation engine executes
- [ ] arch-builder canvas is the skeleton
- [ ] No drag-drop abstraction layer — every block maps to a real operation

### 2.4 Game-style Runtime View
- [ ] Each service = a zone
- [ ] Events = particles moving between zones
- [ ] SEAM chunks = projectiles
- [ ] Gaps = red zones, health = resource bars
- [ ] Pure display — reads SSE stream, no interaction needed
- [ ] The ALK lattice 3D is the skeleton for this

---

## PHASE 3 — SEAM LANGUAGE EVOLUTION
**Goal: SEAM becomes a real language you can write programs in.**

### 3.1 Compiler completeness
- [ ] T2 implementation tier wired to guardian dispatch
- [ ] Emerge replacement — spec-compiler takes the :4242 slot
- [ ] spec-compiler integrated as a system service (not just a module)
- [ ] Idearium spec library quick-access from forge

### 3.2 SEAM grammar growth
- [ ] Every new keyword earned in a real session
- [ ] Grammar divergence — your grammar, not imposed
- [ ] LLM co-authorship — propose, accept/reject, rejection is data
- [ ] Compile to constraint field first, JS second

### 3.3 SEAM as sovereign language
- [ ] Personal vocabulary that grows with usage
- [ ] Sessions build the lexicon
- [ ] The negative space (rejected keywords) is tracked
- [ ] INV-4 enforced: grammars are speciated

---

## PHASE 4 — INTELLIGENCE EXPANSION
**Goal: the system learns faster than it forgets.**

### 4.1 Pattern crystallisation
- [ ] BEP patterns promoted to SEAM templates automatically
- [ ] Reuse index drives spec-compiler cortex-query
- [ ] Cross-session pattern detection

### 4.2 Self-healing expansion
- [ ] Guardian is working — self-heal loop can now reach browser layer
- [ ] Automated gap → patch → verify → merge cycle
- [ ] Diagnostic escalation all the way to agent repair and back

### 4.3 Behavioral drift detection
- [ ] BDA (Behavioral Drift Analyzer) integration
- [ ] Pendulum + Liminal + behavioral runtime
- [ ] Real-time drift signal on system health

---

## PHASE 5 — PLATFORM
**Goal: other people can use this.**

### 5.1 rheon.world integration
- [ ] NEXUS as the backbone of rheon.world
- [ ] Public-facing sovereign AI workspace
- [ ] No cloud dependency — runs on your hardware

### 5.2 Freelance capability
- [ ] Fiverr/Upwork pitch generator (already built — needs productising)
- [ ] NEXUS as the delivery system for client work
- [ ] Spec → deliver → verify — all through the system

### 5.3 Documentation
- [ ] Living docs generated from hook maps
- [ ] SEAM language reference auto-built from keyword ledger
- [ ] Architecture diagrams from topology scanner

---

## IDEAS HOLDING (not phased yet)

- Video game style code builder (different skin on block canvas)
- Using a DAW to code — sound → constraint field → SEAM
- Voice input → SEAM grammar → dispatch
- SFT (Spatial Field Tracker) re-integration
- People module / relational field analytics
- ALK (Associative Lattice Kernel) full integration
- Bridge OS adversarial test suite expansion
- Mobile app (Guardian as a native app, not just mobile web)

---

## PRINCIPLES (immutable)

These don't change phase to phase:

- Append-only. Nothing is deleted, only deprecated.
- Every decision is test data.
- No silent failure modes.
- Bottom-up only. You can't test what you haven't built.
- The spec is the contract. The seam is the cut point.
- Creativity and rigour are the same thing at different zoom levels.
- The system grows with the person who builds it.

