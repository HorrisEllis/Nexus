# NEXUS — Session Handoff v2.9.0
**Date:** 2026-06-03  
**Author:** James Brooks (Erosmancer) — rheon.world  
**Session:** Day 3, Session 4  
**Tests:** 142/142 kernel · 68/68 pipeline · ALL PASS

---

## How to resume (new chat)

Say this exactly:

> "Session 4. Read /docs/HANDOFF.md and the transcript journal at /mnt/transcripts/journal.txt before doing anything."

Then wait. Do not propose anything until both files are read.

Then run:
```bash
cd nexus-final/
node tests/kernel.test.js          # must be 142/142
node orchestrator.js               # boots all systems
node cli/diagnose.js all           # full diagnostic
```

---

## What NEXUS is

A **sovereign coding orchestration platform**. It routes work through AI providers (Claude, ChatGPT, Ollama) using a deterministic external state machine. The AI providers are **lossy transform functions**. NEXUS owns all state.

**The invariant:** Guardian is the state machine. The AI outputs structured text. The spec reduces input entropy. The detector + retry loop handles residual variance. Nothing inside the AI is trusted as a control signal.

---

## System map

```
                         ┌─────────────────────────────┐
                         │         ORCHESTRATOR          │
                         │  :9000  boots all systems     │
                         └──────────────┬────────────────┘
                                        │ event bus (SISO)
          ┌─────────────┬───────────────┼───────────────┬─────────────┐
          ▼             ▼               ▼               ▼             ▼
      BRIDGE          CORTEX        GUARDIAN         IDEARIUM      EMERGE
      :9999           :3748           :7820            :4800         IDE
    event bus         memory        NCP server       idea OS      compiler
    fabric            41 tables     Forge UI         specs
                      CLI           userscripts      crystals
                      crystals      SEAM queue
                      gaps          artifact files
```

**Layer order (boot 1→15, build bottom-up):**

| Layer | Name | Key component |
|-------|------|--------------|
| 1 | FOUNDATION | SISO bus, JAA persistence |
| 2-3 | CORE | RAID router, manifest, translation |
| 4-5 | GATE/HEALER | gap-finder, healer |
| 6 | SIGNAL | topo-wire, ime-wire |
| 7 | VERSIONING | versionium, causality-walker |
| 8 | AGENTS | Ollama :11434, callto, claude-api |
| 9 | MEMORY | crystalball, fix-map |
| 10-11 | CAUSAL NEXUS | sigma detector, event ledger |
| 11 | GUARDIAN | siphon, pulse, watchman |
| 12 | ADMIN | cortex admin :3748 |
| 13 | ORCHESTRATION | orchestrator :9000, COS manager |
| 14 | COGNITION | intent-map, bep-engine |
| 15 | NEXUS-SELF | hourly self-portrait |

---

## Constitutional laws

These are invariants enforced at runtime. Never build against them.

| Law | Meaning |
|-----|---------|
| LAW_I LOCAL FIRST | Ollama first → Guardian-Claude → Guardian-ChatGPT → API |
| LAW_II MEMORY AUTHORITY | JAA insert before any state transition. No in-memory-only state. |
| LAW_III LAYER SOVEREIGNTY | Modules communicate only via JAA. No direct cross-module imports. |
| LAW_IV SCHEMA OVER CODE | AJV validates everything. temp=0 always. |
| LAW_V CLI FIRST | Every feature has a CLI command before it has UI. |

**Build axioms (apply every session):**

- §1.1 Nothing pretends to work. Explicit errors always.
- §1.2 Nothing silently fails. Every failure emits. 
- §1.3 No stubs in production.
- §2.1 Persistence is the golden rule. JAA on everything.
- §3.1 Bottom-up only. Foundation before modules.
- §4.3 Enterprise + military grade from line one.
- §5.1 UUID on everything that does anything.
- **No monoliths.** Build in phases, one concern per phase.

---

## Ports

| Port | System | Notes |
|------|--------|-------|
| 9000 | Orchestrator | boots all systems |
| 9999 | Bridge | event bus fabric |
| 7820 | Guardian HTTP + NCP | primary transport |
| 7821 | Guardian WSS | legacy, needs TLS cert |
| 7823 | Guardian Memory | artifact/memory ingest |
| 7822 | Guardian Dropzone | file upload |
| 4800 | Idearium | idea OS |
| 4242 | Forge UI | served from guardian |
| 3748 | Cortex admin | memory + CLI |
| 11434 | Ollama | local LLM (LAW_I step 1) |

---

## Key files (all paths relative to `nexus-final/`)

```
orchestrator.js                    — source of truth, boots everything
nexus-connect.js                   — shared HTTP utils

lib/
  heartbeat.js                     — BPM tracker, UDP :7777 pulse
  node-ledger.js                   — UNKNOWN→CANDIDATE→MEMBER→SUSPENDED→DEAD
  ncp.js                           — SSE+fetch transport (replaced WebSocket)
  event-ledger.js                  — universal event logger
  boot-sequence.js                 — HARD/SOFT gated boot

bridge/nexus-bridge.js             — :9999 event bus fabric

cortex/
  boot.js                          — :3748 admin server
  memory/jaa-db.js                 — 41 JAA tables
  cortex-v2.js                     — full NEXUS CLI

guardian/
  server.js                        — :7820 HTTP + NCP channel
  jaa-store.js                     — SQLite JAA adapter
  userscript-claude.js             — v9.0 NCP, cortex pull, ledger sync
  userscript-chatgpt.js            — v8.3-NCP, ChatGPT DOM
  nexus-chat-v4.html               — Nexus Chat NCP edition
  lib/
    detector.js                    — truncation/sigma/delta evaluator
    gap-hunter.js                  — gap taxonomy v3 (200+ gaps)
    seam-queue.js                  — SEAM delivery state machine
    spec-parser.js                 — .spec → prerequisite + chunks
  ui/index.html                    — Forge IDE

idearium/core/index.js             — :4800 idea OS
emerge-ide.js                      — SEAM compiler

cos/
  kernel.js                        — COS compartment kernel
  manager.js                       — compartment lifecycle

cli/
  diagnose.js                      — full system diagnostic (17 checks per system)
  nexus-repl.js                    — REPL shell

tests/
  kernel.test.js                   — 142 tests
  pipeline.test.js                 — 68 tests

docs/
  HANDOFF.md                       — this file
```

---

## NCP (NEXUS Channel Protocol)

Replaced WebSocket everywhere. Zero external dependencies.

```
Server → Browser:  EventSource GET /channel?provider=X&tabId=Y
Browser → Server:  POST /result  (fetch, keepalive:true)
Heartbeat:         POST /heartbeat → ACK in response body
```

**Why:** WebSocket required TLS for `https://` pages. EventSource to localhost works natively under Private Network Access spec.

**All guardian endpoints:**

```
GET  /channel?provider=X&tabId=Y    SSE stream (persistent)
POST /result                         receive messages from userscript
POST /heartbeat                      heartbeat → ACK
POST /command                        dispatch raw job OR full SEAM queue
GET  /providers                      connected NCP clients + tab state
GET  /seam/queues                    active in-memory queue status
GET  /seam/sessions                  persistent sessions (JAA)
GET  /queue/compartments             per-chunk state
GET  /artifacts                      artifact store
GET  /gaps                           open gaps
GET  /ledger                         event ledger entries
GET  /health                         uptime, job count
GET  /version                        component versions (auto-update)
GET  /events                         SSE stream for Forge
GET  /bus                            SISO bus log
POST /bus/emit                       emit test event
```

---

## SEAM pipeline

The core new capability. Sends a `.spec` file through a provider in structured chunks.

```
POST /command { spec: "...", provider: "chatgpt" }
  ↓
spec-parser.js
  extracts: intent, axioms, constraints, syntax, output_format, seam_contract
  builds:   prerequisiteBlock (INTAKE — do not implement yet)
  builds:   N chunks each with SEAM contract + SEAM END signal
  ↓
SEAMQueue created
  chunk 0 = prerequisite  (context injection, not a "standby state")
  chunk 1..N = spec content with test contracts
  §LAW II: seam_session written to JAA before any dispatch
  ↓
NCP push → userscript → injectText() → submit()
  ↓
response polled → GUARDIAN_COMPLETE → Detector.evaluate()
  truncation axis: is response cut off?
  sigma axis:      behavioral deviation from expected
  delta axis:      content deviation, axiom violations
  ↓
PASS → advance to next chunk
FAIL → retry (up to 9 attempts, 3 per strategy)
  strategy 1 context:  resend chunk + Detector failure report
  strategy 2 shorter:  split chunk in half, send first half
  strategy 3 forensic: full Detector analysis + axiom violations inline
ESCALATED → gap.found written to JAA
  ↓
Artifacts written to:
  data/output/{YYYY-MM-DD}/{jobId}/{filename}.{ext}
```

**The key design truth (from ChatGPT's review of the architecture):**
> "ChatGPT outputs structured artifacts that an external state machine interprets."

Guardian is the state machine. The AI is a lossy transform function. The spec reduces input entropy. Retry handles residual variance.

---

## Userscripts

### Claude (userscript-claude.js v9.0)
- **Transport:** NCP (EventSource + fetch POST)
- **Pill:** full UI — Log, SEAM, Queue, Arts, Gaps, PA, Settings, API tabs
- **Cortex pull:** before each job, fetches `GET /memory/context?q=` — prepends open gaps + recent artifacts as context prefix
- **?CORTEX: commands:** after response completes, scans for `?CORTEX:query` lines, posts results back to server for next chunk injection
- **Ledger sync:** `_log(err/gap/job/ok)` posts to `POST /result` → server event-ledger
- **Version check:** on boot, `GET /version` — toasts if server expects different version
- **Install:** Tampermonkey on `https://claude.ai/*`

### ChatGPT (userscript-chatgpt.js v8.3-NCP)
- Same NCP transport
- ChatGPT DOM: `#prompt-textarea`, `[data-testid="send-button"]`, `article[data-testid^="conversation-turn"]`
- No persistent context — prerequisite block is sent as chunk 0 of every SEAMQueue
- Tab claim/release system — only the claimed tab receives jobs
- **Install:** Tampermonkey on `https://chatgpt.com/*`

---

## Forge IDE (guardian/ui/index.html)

Served at `http://127.0.0.1:7820/cockpit` (also `:4242`).

**Tabs:**
- **SEAM Chunker** — load .spec, parse, view chunks, dispatch individual chunks or full queue
- **Pipeline** — workflow builder
- **Compiler** — SEAM compiler
- **Automation** — scheduled runs
- **Brain** — live system view: SEAM sessions (live + historical), providers, nodes, baselines, bus log
- **Forge** — settings
- **Providers** — NCP provider status
- **Bridge** — Bridge OS connection

**Key new wiring this session:**
- Brain → SEAM panel shows live in-memory queues from `/seam/queues` overlaid on JAA sessions
- "⚡ Queue (SEAM)" button in chunker toolbar → `POST /command { spec }` → full SEAM queue
- Duplicate tabs removed (was: forge+providers appearing twice)

---

## Diagnose tool (cli/diagnose.js)

```bash
node cli/diagnose.js all          # full system diagnostic
node cli/diagnose.js guardian     # just guardian (17 checks)
node cli/diagnose.js cortex       # just cortex
node cli/diagnose.js --fix        # auto-fix where possible
```

**Guardian checks (17 total after this session):**

HARD (boot blockers): npm:ws, server.js, jaa-store.js, interaction-contract.json, syntax, memory_store writable, ui/index.html, **seam-queue.js**, **spec-parser.js**, **detector.js**

SOFT (degraded if missing): TLS cert, selfsigned npm, userscripts, dropzone-persist, spec-namer

Live: health/uptime, contract, SISO bus, bus emit, providers, **NCP /channel**, **version endpoint**, **SEAM queues**, WSS cert

---

## Heartbeat system

From `lib/heartbeat.js` (Bridge OS index.js):

- UDP :7777 — presence announcement (not trust. proximity ≠ credential)
- BPM tracker — rolling inter-beat intervals → consistency score
- HeartbeatManager — polls `/health`, emits `heartbeat:pulse`, `node:degraded`, `node:dead`
- NodeLedger — `UNKNOWN → CANDIDATE (3 pulses) → MEMBER → SUSPENDED → DEAD`

**Trust path:** UDP pulse → NodeLedger.onPulse() → 3 pulses → CANDIDATE → handshake → MEMBER

---

## Session log (complete)

| Session | Version | Built |
|---------|---------|-------|
| Day 1 S1 | 1.0.0 | SISO+JAA canonical, 142/142 kernel tests |
| Day 1 S2 | 1.1.0 | Axiom audit, bridge registration, ledger persistence |
| Day 1 S3 | 1.2.0 | Idearium completion, spec.build, ESS gap engine |
| Day 1 S4 | 1.3.0 | Contracts + integration tests |
| Day 1 S5 | 1.4.0 | Watchdog + indicators |
| Day 2 S1 | 1.5.0 | cli/diagnose.js — full diagnostic sequencer |
| Day 2 S6 | 1.6.0 | lib/boot-sequence.js — HARD/SOFT gated boot |
| Day 2 S7 | 1.7.0 | Guardian HTTP/WSS decoupled, NCP groundwork |
| Day 2 S8 | 2.0.0 | lib/ncp.js, lib/heartbeat.js, lib/node-ledger.js |
| Day 2 S9 | 2.1.0 | lib/event-ledger.js — ledgers as learning system |
| Day 3 S3 | 2.8.0 | seam-queue.js, spec-parser.js, ChatGPT userscript, /command SEAM |
| Day 3 S4 | 2.9.0 | Pill fixed, cortex wired, ledger sync, Forge clean, diagnose updated |

---

## Open gaps (priority order)

### CRITICAL
| ID | Description | Why |
|----|-------------|-----|
| G-SEAM-01 | spec-parser needs real YAML parsing (currently regex) | malformed specs will produce wrong chunks |
| G-CHATGPT-01 | ChatGPT userscript needs live DOM testing | chatgpt.com DOM changes without notice |
| G-FORGE-01 | Forge needs file picker for .spec files | currently paste-only |

### HIGH
| ID | Description |
|----|-------------|
| G-CORTEX-01 | cortex.recall() not fully wired to guardian job dispatch |
| G-ORCH-01 | COS CompartmentManager not replacing _bootSystems() |
| G-AGENT-01 | RAID routing bypassed — guardian dispatches directly |

### MEDIUM
| ID | Description |
|----|-------------|
| G-VERSION-01 | auto-update needs download mechanism (currently toasts only) |
| G-NEXUS-CHAT-01 | nexus-chat-v4 NCP layer needs live testing |
| G-DIAG-01 | diagnose.js /channel probe should verify SSE headers, not just status |

---

## Idea log (not yet built, in priority order)

1. **COS compartment orchestration** — COS kernel + manager replaces `_bootSystems()`. Each NEXUS system (bridge, cortex, guardian, idearium, emerge) becomes a COS compartment: `C = (Axioms, Conditions, Synthesis, Context)`. Born in sandbox, earns bus connections through 7 birth gates. Failure = recycled, not crashed. This is the right architecture — the pieces exist, just needs wiring.

2. **Guardian CLI ↔ userscript shared ledger** — `cortex-v2.js` and the Claude userscript currently talk to different JAA tables. One shared `event_log.jsonl` means CLI `nexus> ledger guardian` shows what the userscript actually did in real time.

3. **Spec file picker in Forge** — drag-drop `.spec` into chunker panel, auto-parse, show prerequisite preview before dispatching.

4. **Artifact synthesis via emerge kernel** — each completed SEAM job runs through emerge's SNR gate. Only artifacts above the signal threshold are written to disk. The rest go to `data/low-signal/` for review.

5. **Nexus Chat as full claude.ai replacement** — nexus-chat-v4.html currently wraps the AI. The goal is a standalone interface that routes all prompts through guardian (LAW_I), shows SEAM progress, crystal memory panel, open gaps — without ever opening claude.ai directly.

6. **spatial-ris heartbeat model** — apply the BPM/consistency model to conversation patterns. Response latency = BPM. Topic consistency = health score. Raven's aliases (fairestofall888, elemental_alchemist) tracked as nodes in the lattice.

7. **Auto-install userscripts** — Forge serves `userscript-claude.js` at a stable URL. Browser extension (Siphon) checks `/version` on boot, auto-updates Tampermonkey scripts if version differs.

8. **Bridge OS + NEXUS via UDP :7777** — NEXUS heartbeat listener hears Bridge OS pulse, auto-registers as CANDIDATE node. Trust path identical to internal nodes.

9. **RAID routing live** — currently guardian dispatches directly to provider. RAID should route: Ollama for drafts, Claude for complex reasoning, ChatGPT for spec execution, based on job command type + current load + trust scores.

---

## How to build next session (FORGE protocol)

Before any build:
1. Ask: what session is this?
2. Ask: what's the last stable state? (run tests)
3. Ask: what are we building?
4. Ask: are SISO and JAA present in scope?
5. Ask: is this bottom-up?

Build phases: 0=Orient, 1=Brainstorm, 2=Hostile Review, 3=Spec, 4=Build, 5=Test, 6=UI, 7=Hostile Verify

Version bumps +0.1 per phase. Full zip output only. No patches.
