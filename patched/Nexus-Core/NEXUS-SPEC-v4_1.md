# NEXUS — Unified Specification v4.1
## Code Generation Platform · CrystalBall Module · Memory Crystallization · Automation

```
UUID:   nexus-platform-0000-4000-0000-000000000001
DATE:   2026-05-17
BUILT:  nexus-core (35 files — foundation through healer — DO NOT REWRITE)
PORTS:  3748 (unified — CLI admin server + Guardian handshake + SSE)
        11434 (Ollama)
        3747  (RESERVED — external bridge process only, NEXUS does not bind this)
MODEL:  deepseek-coder-v2:16b-lite-instruct-q4_K_M · localhost · 7 threads · 4096 ctx
```

> **v4.1 changelog (2026-05-17 session):** Port architecture unified. Admin server
> extended with Guardian handshake routes. CLI pulse via SSE. Guardian popup
> overhauled (Home/Settings separation, persistent heartbeat, pickerFab removed).
> All files listed in §13.

---

## 0. CONSTITUTIONAL LAWS

```
LAW I    LOCAL FIRST
         Ollama always evaluated first. RAID routes away only at usage > 90%
         or confirmed failure. Cloud agents are fallback sensors, not peers.

LAW II   EVENT AUTHORITY
         No state changes directly. Only events. Every transition is an
         immutable event on the bus. History replayable from seq:0.

LAW III  LAYER SOVEREIGNTY
         Each layer has one job. No direct module calls. All communication
         via kernel.emit() only.

LAW IV   SCHEMA OVER CODE
         Behavior from schemas, not conditionals. Manifest always temp:0,
         schema-constrained. Plugins declare capabilities; runtime composes.
```

**Axioms (all modules inherit):**
```
§1.1   Nothing pretends to work.
§1.2   Nothing silently fails. Every error is loud and specific.
§1.3   No stubs in production.
§2.1   Persistence is the golden rule. JAA on everything.
§3.1   Bottom-up only. Data → schema → inference → action.
§4.3   Enterprise and military grade from line one.
§5.1   UUID on everything that does anything.
§5.7   Zero direct module calls. All I/O via kernel events.
§M1    Everything that happens gets stored. No exceptions.
§M2    Failures are first-class data. Always structured, tagged, stored.
§M3    The system improves by accumulation, not retraining.
§M4    Agents know themselves. Every agent carries a live self-model.
```

**Port axiom (added v4.1):**
```
§P1    Port 3748 is the unified NEXUS port. CLI admin server, Guardian
       handshake, SSE stream, and API all share this port.
§P2    Port 3747 is RESERVED for the external bridge process only.
       No NEXUS module binds or connects to 3747.
§P3    No two NEXUS services may share a port. Enforced in saveSettings().
```

---

## 1. WHAT IS ALREADY BUILT (nexus-core — DO NOT REWRITE)

All 35 files in nexus-core.zip are complete. They are the platform foundation.

```
foundation/siso.js            SISOEvent (immutable, tick+causedBy+relatedTo),
                              StreamLog (10k ring), SISOBus (wildcard on/emit)
foundation/kernel.js          ALKKernel: ring buffer, causal graph (ancestors +
                              descendants), Law enforcement at boot
foundation/store/FileStore.js SHA256 content-addressed, atomic write, dedup
foundation/store/FileRefs.js  Named pointers to content hashes

foundation/admin-server.js    ✓ EXTENDED v4.1 — see §12.1
                              Zero-dependency HTTP server. SSE stream, static
                              serving, snapshot API. Now also handles Guardian
                              handshake/heartbeat routes on same port (3748).
                              start() returns Promise (awaitable — fixes pulse
                              timing). Routes added: POST /guardian/handshake,
                              POST /guardian/heartbeat, GET /guardian/health,
                              GET /guardian/status.

core/manifest/index.js        Ollama temp:0, AJV schema validation, reject+retry (3x)
core/raid/index.js            Law I enforced structurally. cost×capability×usage×drift.
                              Manual overrides. Decision log.
core/raid/learner.js          AgentSignature EMA (alpha=0.15). Drift detection.
                              Failure profile per agent per task type.
core/raid/fallback.js         Exhaustion detection → escalation chain
core/translation/index.js     IntentIR: concept grounding, ambiguity resolution,
                              clarification queue. CONCEPT_GRAPH seeded.
core/translation/learner.js   IntentLearner: IntentSignature EMA on user vocabulary
core/translation/alignment.js AlignmentScanner: IR→manifest delta, shadow/missing/broken
                              detection, live score update on gate events
core/usage/index.js           Per-service usage state, thresholds, scheduler
core/index/query.js           JAA FileStore query — reuse before generate

agents/base.js                BaseAgent: complete(), stream(), ping(),
                              _emitStart/_emitDone/_emitError lifecycle
agents/ollama/index.js        deepseek-coder-v2 complete+stream+ping+orchestrate()
                              orchestrate() reads delta logs → assigns identities
agents/index.js               ChatGPT/Claude/Gemini via guardianRequest()
                              guardianRequest: POST localhost:3748/guardian/handshake
                              pingAll(), AGENTS registry

gate/gap-finder.js            GapHunter: MISSING/BROKEN/SHADOW/WEAK/INTENT gaps.
                              Emits gap.found per gap. Healer subscribes.
gate/runner.js                Gate execution per manifest node
healer/index.js               gap.found → fix spec → manifest.ready (MAX_DEPTH:5)
                              Exhaustion → escalate to human

cli.js                        Dynamic grammar — plugins register commands at init.
                              Every command emits an event. Never executes directly.
boot.js                       ✓ EXTENDED v4.1 — see §12.2
                              Full wire order. Law enforcement at boot.
                              Awaits adminServer.start() before emitting pulse.
                              Emits nexus.cli.pulse every 5s via kernel (→ SSE).
                              Fires additional pulse on admin.sse.connected.
                              Emits system.booted when all modules ready.
tauri/ws-server.js            Rust/Tauri WS server. Port 7771. Extension↔NEXUS bridge.
admin/index.html              ✓ EXTENDED v4.1 — see §12.3
                              All pages: Dashboard, Pipeline, Agents, RAID, Gate,
                              Manifest, Changelog, Settings, Extension.
                              Extension page: CLI/Guardian status bar (no :3747 fetches).
                              Settings: Bridge Port + Admin Port fields, all inputs IDd.
admin/alignment.html          Live alignment monitor. IR vs build graph divergence.
schemas/                      manifest.schema.json, event.schema.json
plugins/_example/             schema.json + index.js — plugin contract template
```

**What's missing from nexus-core (build next, in order):**
```
agents/chatgpt/selectors.js   DOM selectors for chatgpt.com
agents/chatgpt/limits.js      DOM patterns: rate limit, usage bars
agents/claude/selectors.js    DOM selectors for claude.ai
agents/claude/limits.js
agents/gemini/selectors.js
agents/gemini/limits.js
canvas/spec-a/                React Flow pipeline canvas (Phase 5)
admin pages:                  /guardian + /crystalball + /memory + /automation
                              + full CRUD on all existing pages
config/intent.config.json     Concept graph seed + menu config
config/services.json          Per-agent capabilities, limits, cost tier
schemas/                      callto, intent, plugin, gap, bep, crystal, schedule
logs/failures/                gate-failures.jsonl, agent-failures.jsonl,
                              code-catalog.jsonl, healer-exhausted.jsonl
logs/deltas/                  gate-deltas.jsonl, build-deltas.jsonl, alignment-deltas.jsonl
.nex fork logic               Saves but does not fork on gate boundaries yet
Homepage                      Welcome screen, recent projects, module library
```

---

## 2. DIRECTORY STRUCTURE (COMPLETE)

```
nexus/
├── foundation/
│   ├── siso.js                    ✓ BUILT
│   ├── kernel.js                  ✓ BUILT
│   ├── admin-server.js            ✓ BUILT + EXTENDED (v4.1)
│   ├── nano-ws.js                 ✓ BUILT
│   ├── validator.js               ✓ BUILT
│   └── store/
│       ├── FileStore.js           ✓ BUILT
│       ├── FileRefs.js            ✓ BUILT
│       └── Canonicalize.js        BUILD
│
├── core/
│   ├── manifest/index.js          ✓ BUILT
│   ├── raid/                      ✓ BUILT (index, learner, weights, fallback)
│   ├── translation/               ✓ BUILT (index, learner, alignment)
│   ├── usage/index.js             ✓ BUILT
│   └── index/query.js             ✓ BUILT
│
├── agents/
│   ├── base.js                    ✓ BUILT
│   ├── ollama/index.js            ✓ BUILT
│   ├── index.js                   ✓ BUILT
│   ├── chatgpt/selectors.js       BUILD
│   ├── chatgpt/limits.js          BUILD
│   ├── claude/selectors.js        BUILD
│   ├── claude/limits.js           BUILD
│   ├── gemini/selectors.js        BUILD
│   └── gemini/limits.js           BUILD
│
├── gate/
│   ├── gap-finder.js              ✓ BUILT
│   ├── runner.js                  ✓ BUILT
│   ├── generator.js               BUILD
│   ├── recursive.js               BUILD
│   └── verifier.js                BUILD
│
├── healer/
│   ├── index.js                   ✓ BUILT
│   ├── fix-spec.js                BUILD
│   ├── retry.js                   BUILD
│   └── escalator.js               BUILD
│
├── guardian/                      ✓ BUILT (v4.1) — see §5
│   ├── manifest.json
│   ├── background.js              ✓ EXTENDED v4.1
│   ├── content.js
│   ├── popup.html                 ✓ EXTENDED v4.1
│   ├── popup.js                   ✓ EXTENDED v4.1
│   ├── ir-layer.js
│   ├── app.js
│   ├── handshake.js
│   ├── cfr.js
│   └── modules/
│       ├── base-module.js
│       ├── chatgpt.js
│       ├── claude.js
│       ├── threads.js
│       ├── instagram.js
│       └── urck/urck.js
│
├── crystalball/                   NEW MODULE — §3
│   ├── index.js
│   ├── schema.json
│   ├── lattice-bridge.js
│   ├── bep-engine.js
│   ├── mcl.js
│   ├── mql.js
│   ├── signal-adapter.js
│   └── tests/crystalball.test.js
│
├── memory/                        NEW — §4
│   ├── jaa-db.js
│   ├── ring-adapter.js
│   ├── lattice-index.js
│   ├── agent-memory.js
│   ├── continuous-stream.js
│   ├── fix-map.js
│   └── feedback-weighter.js
│
├── automation/                    NEW — §6
│   ├── engine.js
│   ├── variable-resolver.js
│   ├── step-executor.js
│   └── condition-evaluator.js
│
├── canvas/
│   ├── spec-a/                    BUILD Phase 5 (React Flow)
│   └── spec-b/
│       └── bridge/bus-to-cfr.js  BUILD (NEXUS events → CFR node attributes)
│
├── admin/
│   ├── index.html                 ✓ BUILT + EXTENDED (v4.1)
│   ├── alignment.html             ✓ BUILT
│   └── pages/                     BUILD: guardian, crystalball, memory, automation
│
├── logs/
│   ├── failures/                  BUILD
│   └── deltas/                    BUILD
│
├── schemas/
│   ├── manifest.schema.json       ✓ BUILT
│   ├── event.schema.json          ✓ BUILT
│   ├── plugin.schema.json         BUILD
│   ├── gap.schema.json            BUILD
│   ├── callto.schema.json         BUILD
│   ├── intent.schema.json         BUILD
│   ├── bep-pattern.schema.json    BUILD
│   ├── crystal.schema.json        BUILD
│   └── schedule.schema.json       BUILD
│
├── config/
│   ├── intent.config.json         BUILD
│   ├── services.json              BUILD
│   ├── raid-weights.json          BUILD
│   └── thresholds.json            BUILD
│
├── plugins/
│   ├── _example/                  ✓ BUILT
│   └── _registry.js               BUILD
│
├── tauri/ws-server.js             ✓ BUILT (port 7771)
├── cli.js                         ✓ BUILT
├── boot.js                        ✓ BUILT + EXTENDED (v4.1)
└── package.json                   ✓ BUILT
```

---

## 3. CRYSTALBALL MODULE — ALK AS NEXUS PLUGIN

*(Unchanged from v4.0 — full spec in §3.1–3.7 below)*

CrystalBall (the ALK behavioral runtime) becomes a NEXUS plugin wiring into
the kernel bus and contributing three capabilities: Lattice (structural memory
backbone), BEP (Behavioral Execution Patterns), and CFR Canvas (physics
pipeline renderer).

### 3.1–3.7

*(See v4.0 spec sections 3.1 through 3.7 — unchanged.)*

---

## 4. JAADB — PERSISTENT STORAGE

*(Unchanged from v4.0)*

Dual-backend: IndexedDB in browser contexts, JSONL filesystem in Node.js.
Same API across both.

---

## 5. GUARDIAN — IDENTITY BRIDGE (v4.1)

Guardian v5 is built and active. The following describes its current state
and the changes made in v4.1.

### 5.1 Port architecture

```
Guardian connects to:   http://127.0.0.1:3748  (NEXUS admin server — unified port)
NOT:                    http://127.0.0.1:3747  (reserved for external bridge)

background.js constants:
  BRIDGE_URL_DEFAULT = 'http://127.0.0.1:3748'
  NEXUS_URL_DEFAULT  = 'http://127.0.0.1:3748'

Port guard in loadUrls():
  If stored bridgeUrl contains :3747 → reset to 3748
  If stored nexusUrl  contains :3747 → reset to 3748
```

### 5.2 Handshake flow

```
Guardian (background.js)
  → performHandshake()
  → POST http://127.0.0.1:3748/guardian/handshake
  ← { ok: true, ack: true, token, version, capabilities }
  → handshakeState.status = 'connected'
  → heartbeatTick() every 8s
  → POST http://127.0.0.1:3748/guardian/heartbeat
  ← { ok: true, ts }
  → kernel.emit('guardian.heartbeat', { instanceId, listenerCount, sessionCount })
  → SSE broadcasts guardian.heartbeat to admin panel
  → admin panel Guardian status bar updates
```

**Heartbeat persistence:** If heartbeat fails, status drops to `disconnected`
and the next tick immediately re-handshakes. No manual reconnect required.
Self-healing. No degraded dead-end state.

### 5.3 NEXUS core pulse (CLI → Guardian popup)

```
boot.js (every 5s + on admin.sse.connected)
  → kernel.emit('nexus.cli.pulse', { tick, uptime, version, adminPort })
  → AdminServer SSE broadcasts to browser

background.js (every 8s, in sync with heartbeat)
  → _pollNexusCore()
  → GET http://127.0.0.1:3748/health
  ← { ok, version, uptime, tick, ringSize, sseClients }
  → channel.postMessage({ type: 'NEXUS_CORE_PULSE', tick, uptime, adminPort, version })
  → popup.js NEXUS_CORE_PULSE handler
  → nexus-core-status element updated: '● live · t:N · up Xm Ys'

Stale check: if no /health response in 20s → NEXUS_CORE_OFFLINE → '● offline'
```

### 5.4 Home tab (Guardian popup)

The Home tab now shows a **NEXUS CORE** card (not "BRIDGE CONNECTION").
Handshake UI (status, reconnect button, error display, token, capabilities)
is **Settings tab only**.

```
Home tab — NEXUS CORE card:
  CLI       → nexus-core-status  (from _pollNexusCore → NEXUS_CORE_PULSE)
  Guardian  → handshakeStatus    (minimal: '● connected' / '● disconnected')

Settings tab — BRIDGE CONNECTION card:
  Full handshake UI: status badge, mesh ID, capabilities, token preview,
  connect/disconnect buttons, error display
  Bridge URL input (default: http://localhost:3748)
```

### 5.5 Removed: pickerFab

The floating `⊕` Pick Element FAB button (rendered on every browser page
via popup.html) has been removed. The element picker is still accessible
via the PICK ELEMENT button on the Home tab Actions card, which closes the
popup and activates the content.js picker in the active tab.

### 5.6 Admin panel → Guardian via BroadcastChannel

The admin panel communicates with Guardian via `BroadcastChannel('guardian-bridge')`
rather than HTTP to :3747. Guardian background.js listens on this channel.

```
Admin panel sends:
  CALLTO_TEST     → Guardian executes querySelectorAll in active tab
                  → replies CALLTO_TEST_RESULT
  CALLTO_REGISTER → Guardian adds to callto index
                  → replies CALLTO_ADDED

Admin panel listens (BroadcastChannel('guardian-bridge')):
  HEARTBEAT       → updates Guardian status, sessions, listener count
  NEXUS_CORE_PULSE → updates CLI status (relayed from background)
  NEXUS_CORE_OFFLINE → marks CLI offline
  CONNECTION_DEGRADED / CONNECTION_RESTORED → status bar updates
```

### 5.7 File manifest

```
guardian/
├── manifest.json
├── background.js      Heartbeat + handshake loop (8s). _pollNexusCore (8s).
│                      BroadcastChannel listener for CALLTO_TEST/CALLTO_REGISTER.
│                      NEXUS_CORE_PULSE relay to popup.
├── content.js         Element picker → callto UUIDs. MutationObserver.
├── popup.html         Home (NEXUS CORE card, Actions, IR Layer, Active Modules,
│                      Recent Captures). Capture. Listen. Devices. Settings.
├── popup.js           Handles NEXUS_CORE_PULSE/OFFLINE, split updateHandshakeUI
│                      (Home: minimal / Settings: full).
├── ir-layer.js        IR routing layer. bridgeUrl default: 3748.
├── app.js             BRIDGE_URL_DEFAULT: 3748.
├── handshake.js
├── cfr.js
└── modules/
    ├── base-module.js
    ├── chatgpt.js
    ├── claude.js
    ├── threads.js
    ├── instagram.js
    └── urck/urck.js
```

---

## 6. CONTEXT PACKET — OLLAMA REQUEST FORMAT

*(Unchanged from v4.0)*

---

## 7. AUTOMATION ENGINE

*(Unchanged from v4.0)*

---

## 8. AGENT SELF-MODELS

*(Unchanged from v4.0)*

---

## 9. FULL EVENT FLOW

*(Unchanged from v4.0, with the following addition:)*

```
boot.js (every 5s + on admin.sse.connected):
  → kernel.emit('nexus.cli.pulse', { tick, uptime, version, adminPort: 3748 })
  → AdminServer SSE → browser
  → admin panel _handleLiveEvent('nexus.cli.pulse')
  → CLI status bar updates: 'CLI ● live · t:N · up Xm Ys'

Guardian heartbeat (every 8s):
  → POST :3748/guardian/heartbeat
  → kernel.emit('guardian.heartbeat', { instanceId, listenerCount, sessionCount })
  → AdminServer SSE → browser
  → admin panel _handleLiveEvent('guardian.heartbeat')
  → Guardian status bar: 'Guardian ● N session(s)'
```

---

## 10. BUILD PHASES

```
PHASE 1  Foundation (COMPLETE — nexus-core.zip)
         siso.js, kernel.js, FileStore, FileRefs
         manifest, RAID, usage, translation, alignment
         agents (Ollama + Guardian bridge), gate, healer, cli, boot
         admin/index.html, admin/alignment.html

PHASE 1b Admin + Guardian integration (COMPLETE — v4.1 session)
         foundation/admin-server.js  — Guardian routes, Promise-based start()
         boot.js                     — CLI pulse via kernel/SSE
         admin/index.html            — CLI/Guardian status bar, BroadcastChannel,
                                       port settings, no :3747 fetches
         guardian/                   — v5, unified port, persistent heartbeat,
                                       Home/Settings split, pickerFab removed,
                                       NEXUS core health poll, CALLTO_TEST/REGISTER

PHASE 2  CrystalBall Module (build next)
         memory/jaa-db.js              Dual-backend (G8 — blocks everything)
         crystalball/lattice-bridge.js
         crystalball/bep-engine.js
         crystalball/mcl.js
         crystalball/mql.js
         crystalball/index.js
         crystalball/schema.json
         Boot integration (boot.js additions)
         crystalball/tests/crystalball.test.js

PHASE 3  Completion of missing nexus-core pieces
         agents/*/selectors.js + limits.js  (all 3 cloud agents)
         gate/generator.js, recursive.js, verifier.js
         healer/fix-spec.js, retry.js, escalator.js
         .nex fork logic on gate boundaries
         logs/ directory + failure/delta loggers
         schemas/ remaining (plugin, gap, callto, intent, bep, crystal, schedule)
         config/ (intent.config.json, services.json, raid-weights.json, thresholds.json)
         plugins/_registry.js
         Homepage (welcome screen, project list, module library)

PHASE 4  Memory + Automation
         memory/agent-memory.js
         memory/continuous-stream.js
         memory/lattice-index.js
         memory/fix-map.js
         memory/feedback-weighter.js
         automation/engine.js
         automation/variable-resolver.js
         automation/step-executor.js
         automation/condition-evaluator.js

PHASE 5  Spec A Canvas + Admin Completion
         canvas/spec-a/ (React Flow pipeline, all node types, Zustand)
         NodeInspector + RewindScrubber
         admin/ new pages: Guardian, CrystalBall, Memory, Automation, Feedback
         Full CRUD on all existing admin pages

PHASE 6  Spec B Canvas (CFR — wire only, no CFR code changes)
         canvas/spec-b/bridge/bus-to-cfr.js
         CFR drops in as bus subscriber plugin
         Projects tab: CFR + timeline + diagnostic + test suite
```

---

## 11. OPEN GAPS (§1.2)

```
G1  .nex fork missing  — saves but does not fork on gate boundaries.
    Add in Phase 3.

G2  Cloud agent selectors/limits not built  — blocks reliable fallback routing.
    All cloud fallback currently untested end-to-end. Build first in Phase 3.

G3  Guardian URCK is not defined  — diagnostic shows ERR: URCK is not defined
    on CFR kernel and Callto pipeline diagnostics. URCK module load order issue.
    Fix in Phase 3 (Guardian completion sprint).

G4  Guardian Content script UNREACHABLE  — content.js not injected on active
    tab at diagnostic time. Expected behaviour when no matching tab is open.
    Not a blocker for handshake/heartbeat flow.

G5  AST parser choice  — Acorn (JS, mature, zero deps) recommended for Phase 2.
    tree-sitter as optional Phase 6 extension for Rust/Python/Go.

G6  Safe expression evaluator for automation  — hand-rolled subset evaluator.
    No eval(). Supports: dot-path access, comparison, boolean, ternary.
    Build in Phase 4 before automation engine ships.

G7  BEP Jaccard thresholds (0.25 mutation, 0.75 reuse) are priors.
    Calibrate after first 100 patterns. Not a blocker.

G8  MCL stability thresholds (0.85, 24h, 2 lanes) are priors.
    Validate empirically in Phase 4. Not a blocker.

G9  JaaDB dual-backend  — jaa-browser.js uses IndexedDB (browser only).
    Node.js (CLI, boot.js) needs filesystem backend.
    Use causal-nexus persist layer (filesystem JSONL) as Node.js equivalent.
    Same API surface. Two backends. Implement in memory/jaa-db.js FIRST.
    This blocks Phase 2 start. Build first.
```

---

## 12. v4.1 TECHNICAL CHANGES (detailed)

### 12.1 foundation/admin-server.js

**`start()` now returns a Promise.**
Previously `start()` called `server.listen()` and returned `this` synchronously.
The SSE wildcard `kernel.on('**', broadcast)` was wired inside the listen callback,
meaning it wasn't active when `boot.js` immediately called `_emitCliPulse()`.
The first pulse fired into a kernel with no SSE broadcaster — silently lost.

Fix: `start()` returns `new Promise` that resolves inside the listen callback,
after `kernel.on('**', ...)` is wired. boot.js now `await adminServer.start()`
before the first pulse.

**Guardian routes added (all on port 3748):**
```
POST /guardian/handshake  → { ok, ack, token, version, capabilities[] }
                            emits guardian.handshake on kernel bus
POST /guardian/heartbeat  → { ok, ts }
                            emits guardian.heartbeat on kernel bus
GET  /guardian/health     → { ok, service, ts }
GET  /guardian/status     → { ok, version, sessions[], count, ts }
```

**`/health` response extended:**
```json
{ "ok": true, "service": "nexus-core", "version": "2.0.0",
  "uptime": <ms>, "tick": <N>, "ringSize": <N>, "sseClients": <N>, "ts": <ms> }
```

### 12.2 boot.js

**`await adminServer.start()`** — boot now waits for the HTTP server to be
fully bound and the SSE kernel wildcard wired before emitting any pulse.

**CLI pulse via kernel event:**
```js
kernel.emit('nexus.cli.pulse', {
  ts, tick, ringSize, uptime, adminPort, version: '2.0.0', phase: 2, source: 'cli'
})
```
Emitted immediately on boot (after adminServer.start resolves), then every
5s. Also fires on `admin.sse.connected` (new browser tab connecting gets
status within milliseconds).

Previously this was attempted via `BroadcastChannel('nexus-core')` — which
doesn't exist in Node.js. The kernel event → SSE path is the correct approach.

### 12.3 admin/index.html

**Extension page — no :3747 HTTP fetches.** All bridge/Guardian status
now comes from:
- `BroadcastChannel('guardian-bridge')` — Guardian HEARTBEAT messages
- SSE `nexus.cli.pulse` events — CLI status
- SSE `guardian.heartbeat` / `guardian.handshake` events — Guardian status in observer log

**`_handleLiveEvent` additions:**
```js
'nexus.cli.pulse'     → updates CLI status bar, creates sb-cli-pulse statusbar element
'guardian.heartbeat'  → calls _applyGuardianHeartbeat(), updates _guardianLastSeen
'guardian.handshake'  → calls _applyGuardianHeartbeat(), marks Guardian connected
```

**BroadcastChannel listener** (`_guardianChannel`):
```
HEARTBEAT           → _applyGuardianHeartbeat()
HANDSHAKE_STATE     → _applyGuardianHeartbeat()
CONNECTION_DEGRADED → _setGuardianStatus('degraded')
CONNECTION_RESTORED → _setGuardianStatus('connected')
NEXUS_CORE_PULSE    → updates nexus-core-status (Guardian popup relay, fallback path)
NEXUS_CORE_OFFLINE  → marks CLI offline
CALLTO_TEST_RESULT  → updates selector test UI
CALLTO_ADDED        → confirms registration
```

**Callto operations → BroadcastChannel:**
- `saveCallto()` → `CALLTO_REGISTER` (was `fetch(:3747/callto)`)
- `testCalltoSelector()` → `CALLTO_TEST` (was `fetch(:3747/callto)`)
- `testAgentSelectors()` → `CALLTO_TEST` (was `fetch(:3747/callto)`)

**Settings panel — all inputs now have IDs:**
```
cfg-ollama           Ollama endpoint
cfg-bridge-port      Bridge port (default 3748)
cfg-admin-port       Admin port (default 3748)
cfg-usage-threshold  Usage warning threshold
cfg-healer-depth     Healer max depth
cfg-ring-buffer      Ring buffer size
cfg-ema-weight       RAID learner EMA weight
cfg-filestore        FileStore path
```
`saveSettings()` reads all IDs. Enforces §P3: bridge port ≠ admin port.
`resetSettings()` restores all correct defaults.

**Label rename:** "Bridge" → "CLI" in the Extension page status bar.

### 12.4 guardian/background.js

**Port defaults fixed:**
```js
BRIDGE_URL_DEFAULT = 'http://127.0.0.1:3748'
NEXUS_URL_DEFAULT  = 'http://127.0.0.1:3748'
```

**Port guard in `loadUrls()`:**
- If stored `bridgeUrl` contains `:3747` → reset to `:3748`
- If stored `nexusUrl` contains `:3747` → reset to `:3748`

**BroadcastChannel('nexus-core') removed.** Node.js has no BroadcastChannel.
Replaced with `_pollNexusCore()` — polls `GET NEXUS_URL/health` every 8s
(in sync with heartbeat interval). Relays `NEXUS_CORE_PULSE` to popup via
`guardian-bridge` channel.

**`channel.onmessage` added** — `guardian-bridge` channel was previously
write-only in background. Now listens for:
```
CALLTO_TEST     → browser.scripting.executeScript querySelectorAll in active tab
                  replies CALLTO_TEST_RESULT
CALLTO_REGISTER → adds to Guardian callto index, replies CALLTO_ADDED
```

**Heartbeat persistence:** `heartbeatTick()` always calls `performHandshake()`
when not connected (no more "stop after degraded" dead-end). On heartbeat
failure, status drops to `disconnected` so next tick re-handshakes cleanly.

### 12.5 guardian/popup.html + popup.js

**Home tab — BRIDGE CONNECTION card replaced with NEXUS CORE card:**
```html
<div class="card">
  <div class="card-head">
    <div class="alive-dot g dim" id="handshakeDot"></div>
    <span class="card-title">NEXUS CORE</span>
  </div>
  <div class="card-body">
    <div class="diag-row">
      <span class="diag-lbl">CLI</span>
      <span id="nexus-core-status">● waiting…</span>
    </div>
    <div class="diag-row">
      <span class="diag-lbl">Guardian</span>
      <span id="handshakeStatus">● disconnected</span>
    </div>
  </div>
</div>
```

**Settings tab — Bridge Connection card unchanged** (full handshake UI stays
in Settings only).

**`updateHandshakeUI()` split:**
- Home: updates `handshakeDot` + `handshakeStatus` with minimal colour-coded label
- Settings: updates all detail panels (capsRow, tokenRow, handshakeError, bridgeVersion)
  with null-safe guards (elements don't exist on Home tab)

**pickerFab removed:** The `<button id="pickerFab">` element, its CSS, and
its IIFE JS block have all been removed from popup.html. The floating `⊕`
button no longer appears on every browser page.

**`NEXUS_CORE_PULSE` / `NEXUS_CORE_OFFLINE` handlers added** to the
BroadcastChannel `onmessage` handler, updating `nexus-core-status`.

---

## 13. .NEX FILE (SNAPSHOT FORMAT)

*(Unchanged from v4.0)*

---

## 14. FILE DELIVERY LOG (v4.1 session)

All files produced during the 2026-05-17 session. Replace in-place.

```
foundation/admin-server.js     Guardian routes, Promise start(), /health extended
boot.js                        await start(), kernel pulse, 5s interval, sse.connected hook
admin/index.html               CLI/Guardian status, BroadcastChannel, port settings
guardian/background.js         Port defaults 3748, health poll, channel.onmessage,
                               persistent heartbeat, port guards
guardian/popup.html            NEXUS CORE home card, pickerFab removed,
                               Bridge URL default 3748, nexus-core-status row
guardian/popup.js              NEXUS_CORE_PULSE/OFFLINE handlers,
                               split updateHandshakeUI, BRIDGE_URL default 3748
guardian/ir-layer.js           bridgeUrl + port defaults → 3748 (both copies)
guardian/app.js                BRIDGE_URL_DEFAULT → 3748
```

---

*Spec v4.1 — 2026-05-17. Supersedes v4.0 for §§1, 2, 5, 10, 11, 12.*
*All prior specs (v1–v3) are superseded by this document.*
*CrystalBall is a NEXUS plugin — not a dependency, not a subprocess.*
*The lattice is the memory backbone. BEP is the intelligence. MCL is the selection pressure.*
*Nothing pretends to work. Build JaaDB v2 first. Phase 2 follows immediately.*
