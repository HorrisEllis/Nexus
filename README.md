# NEXUS — Integrated Build v3.5.2

**Two projects. One build. No fragments.**

---

## What this is

Guardian and Cortex, fully integrated. Every file is in its canonical location.
Drop `guardian/` into your Guardian project root and `cortex/` into your Cortex
project root. Nothing else required.

---

## Projects

### Guardian (`guardian/`)

Browser automation executor. Controls Claude, ChatGPT, Gemini, Ollama via
NCP (Tampermonkey userscripts). Dispatches jobs, harvests responses, runs
gap analysis on every completion.

**Entry point:** `guardian/server.js` — HTTP :7820, WebSocket NCP  
**Userscripts:** `userscript-claude.js`, `userscript-chatgpt.js`  
**CLI:** `guardian/cli.js`

### Cortex (`cortex/`)

Brain. Source of truth. Owns all persistent state via JAA. Runs the
guardian observability layer, working memory, and admin HTTP on :3748.

**Entry point:** `cortex/boot.js`  
**Admin HTTP:** :3748  
**CLI surface:** `cortex/cortex-v2.js`

---

## Integration layer (new in this build)

### Working Memory (`cortex/working-memory/index.js`)
Universal event spine. Opens in Phase 1 before anything else.
Every significant event written here first — causal chain preserved.
Queryable: `GET /api/wm/tail|search|type|source|chain|chain-deep|since|stats`

### Mind-Bridge (`cortex/guardian/mind-bridge.js`)
Single contract surface between Cortex and Guardian.
All `/api/guardian/*` routes. All `/api/wm/*` routes.
Relay queue with JAA persistence and restart rehydration.

### Guardian Layer modules (poll-registered at boot phase 11)
- **Siphon** (`cortex/guardian/siphon.js`) — 2s poll. Ingests `guardian.*`
  events from `event_log` into `chat_sessions`, `chat_messages`,
  `chat_completions`. Watermarked, idempotent on restart.
- **Pulse** (`cortex/guardian/pulse.js`) — 3s poll. Reads `guardian.heartbeat`
  events, maintains `guardian_nodes` with health scoring. Stale (25s) and
  dead (120s) detection with gap lifecycle management.
- **Watchman** (`cortex/guardian/watchman.js`) — 5s poll. Synthesises
  `guardian_health` from `guardian_nodes`. Single source of truth for "is
  Guardian available". Hysteresis on disconnect and low-health gaps.

### Kernel Client (`guardian/kernel-client.js`)
Guardian → Cortex write path. Every job completion, provider connect/disconnect,
and significant bus event mirrors to Cortex working memory before anything else.
500-event write buffer with retry — events survive Cortex being temporarily down.

### GapHunter v3.1.0 (`guardian/lib/gap-hunter.js`)
Replaces the v1 gap detector. Same API (`analyze(text)`, `drift(gaps)`).
Adds: WeakAssumptionHunter, ShadowFieldDetector, ContrastiveGapDetector,
NegativeSpaceDetector, StructuralAssumptionAuditor, ReversalDetector,
CodeGapDetector, plus 200+ taxonomy patterns across 60+ domains.
Every gap row now carries: `subtype`, `confidence`, `load_bearing_question`,
`signal_note`, `reasons[]`, and `physics` (Theta state vector, emotion,
coherence, stability from the relational physics engine).

---

## JAA tables (51 total)

New tables added in this build:
`chat_sessions` `chat_messages` `chat_completions` `guardian_nodes`
`guardian_health` `lattice_nodes` `lattice_edges` `intent_edges`

All tables declared in `cortex/memory/jaa-tables.js` — single source of truth.
`cortex/memory/jaa-db.js` — pre-declares all tables on `open()`.

---

## Boot sequence (Cortex)

```
Phase 0  SOFT  — orchestrator registration
Phase 1  HARD  — working memory open (§WM.1 — before everything)
Phase 2  HARD  — JAA + FileStore open (51 tables)
Phase 3  HARD  — Cobalt core
Phase 4  HARD  — module deps (Versionium, AgentDispatch)
Phase 5  HARD  — poll registry + guardian modules registered
Phase 6  SOFT  — mind-bridge init (relay rehydrated before HTTP)
Phase 7  HARD  — HTTP admin server :3748
Phase 8  SOFT  — boot record
Phase 9  SOFT  — bridge registration
```

---

## Tests

```bash
# GapHunter v3 — 58 tests
node test/gap-hunter-v3.test.js

# Guardian layer — 164 tests (Siphon, Pulse, Watchman, cross-domain, invariants)
node test/guardian-layer.test.js
```

Total: **222/222 passing.**

---

## Axioms active

§1.1 Nothing exists until proven  
§1.2 Nothing silently fails  
§1.3 No stubs  
§2.1 Persistence is golden rule  
§3.1 Bottom-up only  
§WM.1 Write to working memory before any side-effect  
§WM.2 Internal first — all state queryable  
§LAW_III Mind-bridge is the only surface between Cortex and Guardian  
