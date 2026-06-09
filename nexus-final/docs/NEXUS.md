# NEXUS — Complete System Documentation
**Author:** James Brooks (Erosmancer)  
**Version:** 2.0 — post-build session  
**Status:** Active development

---

## What This Is

A self-hosted agent orchestration platform. You write specs and prompts, the system dispatches them to AI providers (ChatGPT primary, Claude secondary, Ollama local), routes responses back through a memory layer, and keeps a causal record of everything.

Every system has a CLI, an HTTP API, a live SSE stream, and a UI. They're all connected through a shared event bus and bridge layer.

---

## All URLs

| URL | System | Purpose |
|-----|--------|---------|
| `http://localhost:3748` | **Cortex** | Source of truth. All memory. Never deletes. |
| `http://localhost:3748/health` | Cortex | JAA table counts, cobalt bus status |
| `http://localhost:3748/sse` | Cortex | Live event stream (SSE) |
| `http://localhost:7820` | **Guardian** | Agent orchestration API |
| `http://localhost:7820/cockpit` | Guardian | Control panel UI (SEAM, Pipeline, Brain, Forge, Providers, Bridge) |
| `http://localhost:7820/sse` | Guardian | Live event stream |
| `wss://127.0.0.1:7821` | Guardian WSS | Provider connections (ChatGPT, Claude userscripts connect here) |
| `http://localhost:7822` | Guardian Dropzone | File drop (LAN accessible) |
| `http://localhost:7823` | Guardian Memory | Memory ingest/query (LAN accessible) |
| `http://localhost:4800` | **Idearium** | Idea OS. Tension engine. Specs. Gaps. |
| `http://localhost:4242` | **Emerge IDE** | Compiler IDE. SNR gate. IR decompressor. |
| `http://localhost:9999` | **Bridge** | Tag system. Request queue. Push/pull. Handshake. |
| `http://localhost:11434` | **Ollama** | Local inference (qwen2.5-coder:1.5b, mistral:7b) |

---

## Boot Order

```
node bridge/nexus-bridge.js   # 1 — bus fabric, must be first
node cortex/boot.js           # 2 — source of truth
node guardian/server.js       # 3 — agent orchestration
node idearium/api/index.js    # 4 — idea OS  (ESM: node --input-type=module)
node emerge-ide.js            # 5 — compiler IDE
```

Or: `npm run start:core` → bridge + cortex + guardian in one command

**Why this order:** Bridge is the shared fabric. Cortex must exist before Guardian tries to sync events to it. Idearium and Emerge can boot in any order after those three.

---

## File System

```
nexus-final/
│
├── emerge-kernel.js          ← Compiler (SNR gate, tokenizer, IR, validator)
├── emerge-ide.js             ← IDE server (port 4242)
├── emerge.spec               ← 595 keywords, 7 axioms, 8 gap types
├── package.json              ← All boot scripts
│
├── bridge/
│   └── nexus-bridge.js       ← Tag system, request queue, push/pull, handshake (port 9999)
│
├── siso/                     ← SISO event bus primitives
│   ├── Event.js
│   ├── Gate.js
│   ├── Stream.js
│   ├── StreamLog.js
│   └── index.js
│
├── jaa/                      ← Persistence primitives
│   ├── jaa-store.js          ← Node.js JAA (guardian uses this)
│   └── schema.sql
│
├── cortex/                   ← Source of truth (port 3748)
│   ├── boot.js               ← node cortex/boot.js
│   ├── cortex.js             ← REPL CLI
│   ├── foundation/
│   │   ├── cobalt-core.js    ← CobaltBus: bus + ledger + watchdog + registry
│   │   ├── admin-server.js   ← HTTP + SSE server
│   │   ├── poll-registry.js  ← Module poll declarations
│   │   ├── siso/             ← SISO primitives (cortex copy)
│   │   └── store/            ← FileStore (SHA-256 blobs), FileRefs
│   ├── memory/
│   │   ├── jaa-db.js         ← 28 JSONL tables, append-only
│   │   └── agent-memory.js   ← event_log → memory_index distiller
│   ├── core/raid/            ← Local-first agent router
│   ├── agents/               ← Dispatcher, Ollama, Claude
│   ├── gate/gap-finder.js    ← Stale/stuck gap detection
│   ├── healer/               ← Gap → fix_map resolution
│   ├── orion/                ← Sensor → Record → Policy → Verify
│   ├── versionium/           ← Sigma-triggered auto-commit
│   ├── automation/           ← Workflow engine
│   └── nas/                  ← File routing
│
├── guardian/                 ← Agent orchestration (7820/7821/7822/7823)
│   ├── server.js             ← All 4 ports, WSS, HTTP, Dropzone, Memory
│   ├── cli.js                ← Guardian CLI
│   ├── jaa-store.js          ← 15-table JSON store
│   ├── memory.js             ← Memory server (7823)
│   ├── dropzone.js           ← Dropzone (7822)
│   ├── agents/               ← Agent dispatcher
│   ├── userscript-chatgpt.js ← Tampermonkey: chatgpt.com (PRIMARY)
│   └── userscript-claude.js  ← Tampermonkey: claude.ai
│
├── cockpit/                  ← Control panel (served from 7820/cockpit)
│   ├── core.js               ← SISOKernel + JAA + Bayesian trust
│   ├── cli.js                ← forge CLI (pipeline, seam, idea, gap, jaa)
│   ├── pipeline.js           ← 15-node pipeline engine
│   ├── forge.js              ← AI self-modification engine
│   └── cockpit.spec          ← YAML system spec
│
├── idearium/                 ← Idea OS (port 4800)
│   ├── core/index.js         ← IdeaOS + tension engine + SNR
│   ├── cli/index.js          ← CLI: idea, spec, gap, push, status, snr
│   └── api/index.js          ← HTTP API
│
├── emerge/                   ← Compiler + IDE
│   ├── emerge-kernel.js      ← JS compiler seed
│   ├── emerge-ide.js         ← IDE server
│   ├── emerge.spec           ← SNR gate schema
│   ├── siso.js, ollama-runtime.js
│   └── io/                   ← 125 .eg spec files
│
│   ├── alk-kernel.js, alk-gl.js (WebGL2, 80k particles)
│   ├── cfr-mesh-bridge.js    ← 34-attractor skeleton, cue→field
│   └── cfr-physics/render/rewind.js
│
├── seams/
│   └── seam-contracts.js
│
├── ui/                       ← All HTML UIs
│   ├── cockpit.html          ← Guardian control panel
│   ├── cortex.html           ← Cortex memory viewer
│   ├── idearium.html         ← Idearium dashboard
│   └── emerge-ide.html       ← Emerge IDE
│
└── tests/
    └── kernel.test.js        ← 142 tests (142/142 pass)
```

---

## API Reference

### Bridge (port 9999)

```
POST /bridge/handshake          { systemId, appId, secret }
                                → { token, sessionId, expiresAt }

GET  /bridge/tags/:entityId     → { tags: string[] }
POST /bridge/tags               { entityId, entityType, system, tags[], addedBy }
GET  /bridge/tags?tag=x         → { entities: [...] }

GET  /bridge/requests           ?status=pending|accepted|complete|failed&from=x&to=x&type=x
POST /bridge/requests           { type, from, to, payload, opts }  → { request }
GET  /bridge/requests/:uuid
POST /bridge/requests/:uuid/accept    { by }
POST /bridge/requests/:uuid/reject    { by, reason }
POST /bridge/requests/:uuid/complete  { result }
POST /bridge/requests/:uuid/fail      { error }

GET  /bridge/subscribe          ?channel=x   → SSE stream
GET  /bridge/pull               ?channel=x&since=ts  → { events[] }
POST /bridge/broadcast          { type, ...payload }
POST /bridge/forward            { to, path, payload }

GET  /bridge/health
GET  /bridge/stats
```

**Request types:** `job.dispatch`, `idea.create`, `spec.build`, `gap.open`, `gap.resolve`, `artifact.store`, `memory.ingest`, `versionium.commit`, `forge.run`, `seam.deliver`, `bridge.ping`, `bridge.sync`

**Tag taxonomy:** `status:pending|accepted|rejected|complete`, `type:job|idea|spec|gap|artifact|crystal`, `priority:high|low|critical`, `from:systemId`, `to:systemId`

**Handshake secrets:**
- cortex: `nexus-cortex-internal-v1`
- guardian: `nexus-guardian-internal-v1`
- idearium: `nexus-idearium-internal-v1`
- cockpit: `nexus-cockpit-internal-v1`

---

### Cortex (port 3748)

```
GET  /health                    → full system status + JAA counts
GET  /api/events?n=200          → { ok, rows: event[] }
POST /api/event                 { type, payload, causedBy? }  → event record
GET  /api/gaps?status=open      → { ok, rows: gap[] }
GET  /api/failures              → { ok, rows: failure[] }
GET  /api/memory?table=x&n=100  → { ok, rows }
POST /api/memory/search         { q }  → { results[] }
POST /api/memory/forget         { uuid }
GET  /api/files                 → { files[] }
POST /api/files                 multipart/form-data  → { ref, hash }
GET  /api/bridge/health
GET  /api/tags?entityId=x
POST /api/tags                  { entityId, entityType, system, tags[] }
GET  /sse                       → SSE live event stream
```

**JAA tables (28):**  
`event_log`, `bridge_messages`, `agent_calls`, `agent_signatures`, `artifacts`, `gaps`, `failures`, `fix_map`, `memory_index`, `memory_queries`, `conditioning_log`, `feedback_scores`, `crystals`, `bep_patterns`, `active_traces`, `orion_sessions`, `versionium_commits`, `versionium_branches`, `versionium_file_index`, `versionium_calendar`, `versionium_objects`, `schedules`, `workflow_runs`, `project_registry`, `shape_samples`, `poll_log`, `requests`, `cortex_memory`

---

### Guardian (port 7820)

```
POST /command                   { provider, command, prompt, content? }
                                → { jobId, status }
GET  /status/:jobId             → { job }
GET  /response/:jobId           → { complete, status, response }
GET  /stream/:jobId             → SSE chunks
GET  /jobs?status=x&limit=20    → { jobs[] }
GET  /providers                 → { providers: { name: connected|disconnected } }
GET  /artifacts?lang=x&q=x      → { artifacts[] }
POST /artifacts                 { hash, name, type, lang, content, context }
GET  /gaps                      → { gaps[] }
GET  /ledger?category=x         → { entries[] }
POST /ledger                    { level, category, msg, meta }
GET  /sessions                  → { sessions[] }
POST /sessions/:id/name         { name }
GET  /memory/query?q=x
POST /memory/ingest             { type, payload, source }
GET  /settings
PUT  /settings/:key             { value }
GET  /cockpit                   → cockpit HTML UI
GET  /events                    → SSE live stream
GET  /health
```

**Providers:** `chatgpt` (primary), `claude`, `gemini`, `ollama`  
**Commands:** `code`, `chat`, `spec`, `ask`, `paste`

---

### Idearium (port 4800)

```
GET  /api/ideas                 → { ideas[] }
POST /api/ideas                 { text }
GET  /api/ideas/:uuid
PATCH /api/ideas/:uuid          { text?, phase? }
POST /api/ideas/:uuid/tension   → { tension: 0..1 }
POST /api/ideas/:uuid/phase     { phase }
POST /api/ideas/:uuid/spec      → creates spec
GET  /api/specs                 → { specs[] }
POST /api/specs/:uuid/build
GET  /api/gaps                  → { gaps[] }
POST /api/gaps                  { description }
POST /api/gaps/:uuid/resolve    { resolution }
GET  /api/snr                   → { snr: 0..1 }
POST /api/snapshots             { message }
GET  /sse                       → SSE live stream
```

**Idea phases:** `seed → expanding → tensioned → specced → building → complete → archived`

---

## CLI Reference

### Unified CLI (nexus)

All CLIs are currently separate. Should be unified as `nexus <system> <command>`.

**Cortex CLI** (`node cortex/cortex.js`):
```
cortex ask "question"
cortex status
cortex gaps
cortex tail [table] [n]
cortex events [n]
cortex memory search "query"
```

**Guardian CLI** (`node guardian/cli.js`):
```
guardian /code <provider> <prompt>
guardian /chat <provider> <prompt>
guardian /spec <provider> <file>
guardian /ask <provider> <prompt>
guardian status <jobId>
guardian jobs
guardian providers
guardian watch <jobId>
```

**Forge/Cockpit CLI** (`node cockpit/cli.js`):
```
forge pipeline list|create|run|delete
forge seam compile <file>
forge idea list|create
forge gap list|create|resolve
forge snapshot create
forge trust list
forge guardian dispatch <provider> <prompt>
forge jaa stats|query
forge bus emit|history
```

**Idearium CLI** (`node idearium/cli/index.js`):
```
idea add <text>
idea list|show|phase|tension|archive|search
spec new|show|check|build|list
gap list|open|resolve
push [message]
snr
status
```

---

## SISO Event Bus — Channel Map

All inter-system communication flows through SISO channels. Direct module imports are axiom violations.

```
guardian.job.complete     → cortex sync, versionium, ledger
guardian.artifact         → cortex sync, tags
guardian.gaps             → ledger, cortex
guardian.ledger           → jaa.ledger_entries
guardian.session.named    → jaa.sessions
guardian.timeline         → jaa.timeline_events
guardian.download         → jaa.downloads
guardian.pa.session       → jaa.pa_sessions
guardian.setting.update   → jaa.settings

cortex.gap.found          → guardian ledger notify
cortex.gap.resolved       → bridge broadcast

idearium.idea.created     → cortex sync, bridge tag
idearium.snapshot.pushed  → cortex versionium trigger

bridge.request.created    → all subscribers
bridge.request.accepted   → all subscribers
bridge.request.complete   → all subscribers
bridge.handshake          → audit log
bridge.tag.added          → audit log

alk.signal.composite      → cortex event_log
```

---

## Cross-System Sync Map

```
Guardian GUARDIAN_COMPLETE
  → cortex POST /api/event type=guardian.job.complete
  → bridge submit memory.ingest request

Guardian GUARDIAN_ARTIFACT
  → cortex POST /api/event type=guardian.artifact.received
  → bridge tag artifact with type:artifact, lang:x

Cortex gap.found
  → guardian POST /ledger category=GAP

Idearium idea.created
  → cortex POST /api/event type=idearium.idea.created
  → bridge tag idea with type:idea, phase:seed

Idearium snapshot.push
  → cortex POST /api/event type=versionium.commit.trigger
```

---

## Known Bugs Fixed During Build Session

| # | Bug | Root Cause | Fix |
|---|-----|-----------|-----|
| 1 | `Cannot find module ./src/siso` | Wrong require path in emerge-ide.js | Changed to `./emerge/siso` |
| 2 | `/ → not found` on localhost:4242 | `ui/index.html` didn't exist | Copied emerge-ide.html to index.html |
| 3 | `await is only valid in async functions` | `_handle()` not declared async | Added `async` to `_handle` |
| 4 | `ReferenceError: Cannot access 'bus' before initialization` | Bridge mounted before `bus` declared | Moved mount to after bus declaration |
| 5 | `TypeError: bus.on is not a function` | SISOStream uses `register(gate)` not `.on()` | Converted to `bus.register(new SISOGate(...))` |
| 6 | `Cannot find module 'ws'` | ws not installed | `npm install ws` |
| 7 | Cortex API returns `[]` not `{ok,rows}` | Raw array serialization | `sed` replaced all 7 occurrences |
| 8 | `EADDRINUSE 4242` | Emerge IDE already running | Kill existing process or check before boot |

---

## The Emergence Verdict

**What it was used for:**
- Structured config files (`.eg` files describing system components)
- SNR gate for scoring token quality
- Axiom checker (validator)

**Why it's not good enough:**
- `.eg` files don't execute — they're descriptions, not programs
- The compiler outputs IR + JSON, not runnable code
- Every new domain primitive requires spec extension + kernel patch
- Developers write dense Emergence syntax that still needs a JS runtime underneath
- The SNR gate recency penalty was causing valid keywords to fail in long files — required 4 separate patches
- Compound tokens (`call.uuid`, `jaa.files`) can't be registered as keywords due to the regex `^(\w+)\s*=`

**What to replace it with:**
YAML `.spec` files (already used in `cockpit/cockpit.spec`) + JSON schemas. They're readable, executable via `js-yaml`, and every system already uses them. The SNR gate concept is worth keeping as a linting rule over YAML, not as a compiler.

---

## Causality Log

```
SESSION START
  ↓
Existing: emerge-kernel.js, emerge.spec, files-4.zip
  ↓
Phase 1: Read all source zips (SISO, JAA, Nexus-Cortex, Guardian, Version_full, Spec_Editor)
  ↓
Phase 2: Build file system bottom-up (SISO→JAA→Cortex→Guardian→Cockpit→Idearium→Emerge
  ↓ [first run attempt]
  ✗ emerge-ide.js: wrong siso path
  ✗ emerge-ide.js: no ui/index.html
  ✗ SNR: 104/125 files perfect — recency penalty on valid keywords
  ↓
Phase 3: Fix paths, create ui/index.html, extend spec with OP/LABEL token types
  ↓ [second run attempt]
  ✗ cortex: _handle not async → await crash
  ✗ guardian: bus.on() doesn't exist
  ✗ guardian: bridge mounted before bus
  ✗ guardian: ws not installed
  ↓
Phase 4: Fix all four cortex/guardian boot bugs
  ↓ [third run attempt — all servers boot]
  ✗ cortex API: raw array responses, UIs expected {ok,rows}
  ↓
Phase 5: Fix response shapes (7 routes)
  ↓ [integration test: 17/17 pass]
  ✓ bridge: handshake, tags, requests, pull
  ✓ cortex: events write + read
  ✓ guardian: health, job dispatch, jobs list
  ↓
Phase 6: Build bridge panel in cockpit UI
Phase 7: Add UIs to all systems (cortex.html, idearium.html)
Phase 8: Add Forge + Providers panels to cockpit
  ↓
Phase 9: SNR spec parser regex fix (compound tokens)
  → 125/125 files at 100% SNR
  ↓
Current state: 142/142 tests pass, 17/17 integration tests pass
All 5 servers boot and respond correctly

OPEN WORK:
  □ Unified CLI (single nexus binary routing to all systems)
  □ Idearium ESM wrapper (needs CJS bridge or --input-type=module)
  □ Replace Emergence .eg files with YAML .spec (decision: yes)
  □ Guardian → Cortex realtime bridge (partially wired, needs validation)
  □ Userscript explicit inject full wiring (GTCI prepend, DOM mapper)
```

---

## Architecture Laws (Active)

```
§1.1  Nothing exists until proven
§1.2  Nothing silently fails — all errors loud and specific
§1.3  No stubs in production code
§2.1  Persistence before behavior — JAA write before anything else
§3.1  Bottom-up only — SISO → JAA → Cortex → Guardian → UI
§4.3  Enterprise + military grade — no toy implementations
§5.1  UUID + hook + bus on everything
§5.2  Everything implements the bridge
§5.3  No monkey patches
§8.1  Session context before build
§8.3  SISO + JAA are prerequisites

K1  Events are immutable (freeze enforced)
K2  Gates atomic — gates never call emit()
K3  Channel strings dot-namespaced, wildcards with * and **
K4  Logical clock strictly monotone, wall clock advisory
K5  Ring buffer bounded — eviction removes lattice edges
K6  No module calls another directly — all via SISO bus
K7  All errors surface as typed events, never throws
```
