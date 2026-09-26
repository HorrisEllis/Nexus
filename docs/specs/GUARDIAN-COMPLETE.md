# GUARDIAN — Complete System Specification
**Version:** 3.5.0
**File:** `guardian/server.js`
**Port:** 7820 (HTTP + NCP)
**UUID:** guardian-server-v3-5
**Status:** WORKING as of 2026-06-11

> This document contains everything needed to rebuild Guardian from scratch.
> No prior knowledge required. Read this first, then read the source.

---

## What Guardian Is

Guardian is the AI orchestration layer. It is the only system in NEXUS that directly touches the AI provider UIs (Claude, ChatGPT, Ollama). It does not call provider APIs — it controls browser tabs via Tampermonkey userscripts over the NCP (NEXUS Channel Protocol) transport.

**Single responsibility:** Take a job (prompt + command + provider), route it to the correct browser tab, wait for the response, capture artifacts, detect gaps, and report completion back to the system.

---

## Architecture

```
NEXUS Orchestrator (:9000)
         │
         ▼
  Guardian (:7820) ─── NCP/SSE ──── Browser Tab (Claude/ChatGPT)
         │                          │
         │                          └── Tampermonkey Userscript
         │                               (userscript-claude.js / userscript-chatgpt.js)
         │
         ├── Physical Queue (data/guardian/input|output|queue|failures)
         ├── JAA Memory Store (guardian/memory_store/)
         ├── Dropzone (:7822) — file upload UI
         └── Memory Server (:7823) — context/memory queries
```

---

## Transport: NCP (NEXUS Channel Protocol)

**Replaces WebSocket entirely. No npm packages. No TLS required.**

- Server → Browser: `GET /channel?provider=claude&tabId=XYZ` — SSE (EventSource)
- Browser → Server: `POST /result` — plain fetch POST
- Heartbeat: `POST /heartbeat` — provider keepalive

Why this works from https:// pages: Browsers allow fetch() to localhost from any origin under the Private Network Access spec. SSE is a plain HTTP GET. No TLS upgrade needed.

**Key routes:**
```
GET  /channel?provider=<p>&tabId=<id>   — opens SSE channel
POST /result                             — receives messages from browser
POST /heartbeat                         — provider heartbeat
GET  /health                             — { ok, uptime, jobs, providers }
POST /command                           — dispatch a job or SEAM spec
GET  /jobs                              — list jobs
GET  /status/:jobId                     — job status
GET  /response/:jobId                   — job response
GET  /providers                         — connected providers
GET  /bus                               — SISO bus log
POST /bus/emit                          — inject event to bus
GET  /artifacts                         — captured artifacts
GET  /gaps                              — detected gaps
GET  /memory/context                    — cortex memory context
```

---

## Boot Sequence (12 Phases)

All phases use `lib/boot-sequence.js` BootSequence class.

```
Phase 1  HARD   Zero external dependencies (NCP/SSE — no npm packages)
Phase 2  HARD   HTTP :7820 bound and /health responds
Phase 3  HARD   interaction-contract.json present and valid
Phase 4  HARD   JAA memory store open + writable (§LAW II)
Phase 4.5 SOFT  Replay jobs from JAA (§2.1 persistence) ← ADDED THIS SESSION
Phase 5  HARD   Physical queue dirs writable (data/guardian/)
Phase 6  HARD   Core modules load (seam-queue, spec-parser, detector)
Phase 7  SOFT   NCP channel :7820/channel (no TLS needed)
Phase 8  SOFT   Artifact output path writable
Phase 9  SOFT   Userscript versions present
Phase 10 SOFT   Register with orchestrator (§AXIOM)
Phase 10.5 SOFT Handshake with Bridge (identity + session token)
Phase 11 SOFT   Write boot record to ledger (§LAW II)
```

**Critical — Phase 4.5 (added this session):** Jobs were lost on restart because `const jobs = new Map()` starts empty every time. JAA persists jobs to disk. Phase 4.5 replays `jaa.query('jobs')` into the in-memory Map so all prior jobs survive restart. This is §2.1 compliance.

---

## Job Lifecycle

```
POST /command
  → createJob({ command, provider, prompt, content })
  → jobs.set(job.id, job)                    ← in-memory
  → jaa.insert('jobs', job)                  ← persisted
  → dispatchJob(job)
      → if ncp.isConnected(provider):
          ncp.push(provider, { type:'GUARDIAN_JOB', jobId, prompt, command })
        else:
          pendingQueue.set(provider, [..., job])
          // waits until provider connects

Browser receives GUARDIAN_JOB via SSE
  → injects prompt into AI input
  → submits
  → monitors for completion (MutationObserver)
  → POSTs GUARDIAN_CHUNK on each response fragment
  → POSTs GUARDIAN_COMPLETE when stable
  → POSTs GUARDIAN_ARTIFACT for each code block

Guardian receives GUARDIAN_COMPLETE
  → updates jobs Map + JAA
  → emits guardian.job.complete on bus
  → writes to cortex event_log

GET /status/:jobId   → { status, complete, jobId }
GET /response/:jobId → { response, jobId, status }
```

---

## NCP Message Types (Inbound from Browser)

All handled in `_handleNCPMessage(msg)`:

| Type | Handler | Action |
|------|---------|--------|
| `GUARDIAN_REGISTER` | register | Log provider connected, flush pending jobs |
| `GUARDIAN_HEARTBEAT` | heartbeat | Update lastHeartbeat, return ACK |
| `GUARDIAN_DELIVERED` | delivered | Mark job dispatched |
| `GUARDIAN_CHUNK` | chunk | Stream to cortex, batch flush |
| `GUARDIAN_COMPLETE` | complete | Mark job complete, write response |
| `GUARDIAN_ARTIFACT` | artifact | SHA-256 dedup, write to JAA |
| `GUARDIAN_GAPS` | gaps | Write gaps to JAA, emit bus event |
| `GUARDIAN_ERROR` | error | Mark job failed, log fault |
| `GUARDIAN_LEDGER_WRITE` | ledger | Write to JAA ledger table |
| `GUARDIAN_LEDGER_EVENT` | ledger | Write to JAA event_log |
| `GUARDIAN_SESSION_NAMED` | session | Write session name to JAA |
| `NEXUS_DOM_MAP` | dom_map | **FIXED THIS SESSION** — was silently dropped, now logs to cortex |
| `NEXUS_SPATIAL_MAP` | dom_map | Same handler as DOM_MAP |
| `NEXUS_FIELD_MAP` | dom_map | Same handler as DOM_MAP |
| `NEXUS_SETTING_UPDATE` | settings | Write to bus + cortex |
| `NEXUS_CONTEXT_PULL` | context | Query cortex intelligence, push response back |
| `GUARDIAN_CONTEXT_REQUEST` | context | Same as CONTEXT_PULL |
| `GUARDIAN_CORTEX_RESULT` | cortex | Write cortex query result to JAA |
| `GUARDIAN_CLI_EXEC` | cli | Execute CLI command, return result |
| `GUARDIAN_SEAM_CHUNK` | seam | Write SEAM chunk delivery record |
| `GUARDIAN_SEAM_COMPLETE` | seam | Mark SEAM queue complete |
| `GUARDIAN_CLAIM_ACK` | claim | Acknowledge tab claim |
| Default | rate-limited | Log to cortex as `guardian.unhandled_message` with fault class `wiring_missing` |

---

## SEAM Queue (Spec Execution)

SEAM = Spec Execution and Memory. Splits a `.spec` file into chunks and dispatches them sequentially to a provider.

```
POST /command { specText, provider }
  → parseSpec(specText) → { chunks, meta, axioms }
  → new SEAMQueue({ title, provider, chunks, jaa, busEmit, ncpPush })
  → _physQueue.enqueue({ uuid, content:specText, ext:'spec', tags })
  → queue.start() if provider connected
    else pendingQueue.set(provider, [..., { _seamQueue: queue }])

SEAMQueue dispatches chunks:
  Chunk 0: Prerequisites (§ INTAKE — no implementation yet)
  Chunks 1..N: spec content with SEAM contracts
  
  Each chunk: ncp.push(provider, { type:'GUARDIAN_JOB', jobId, prompt:chunk.builtPrompt })
  Waits for GUARDIAN_COMPLETE
  → Records verdict (VERIFIED / FAILED / ESCALATED)
  → Moves to next chunk
```

SEAM states per chunk: `QUEUED → DISPATCHING → VERIFIED | FAILED | ESCALATED | RETRYING`

Retry strategies: `context` (add context), `shorter` (split chunk), `forensic` (debug mode)

---

## Physical Queue (§LAW II)

Files survive crashes. Atomic rename for claim/release.

```
data/guardian/
  input/       {uuid}.pending.{ext}      — waiting for claim
  queue/       {uuid}.processing.{ext}   — claimed, in progress
  output/      {uuid}.done.{ext}         — completed
  failures/    {uuid}.failed.{ext}       — failed
  conversations/ {sessionId}.json        — conversation logs
  ledger/boot/   events.ndjson           — boot records
```

Operations: `enqueue → claim → complete | fail | replay`

On restart: `_physQueue.replay()` moves `.processing` → `.pending` (interrupted mid-claim).

**§BRIDGE-GATE:** Bridge notified before filesystem write:
```js
nc.postBridge('guardian.queue.enqueue', { uuid, type, provider, tags })
_physQueue.enqueue({ uuid, content, ext, tags })  // then write
```

---

## JAA Memory Store

`guardian/memory_store/` — flat-file JSON, no external DB.

Tables used by guardian:
- `jobs` — all dispatched jobs (persisted, replayed on boot)
- `artifacts` — captured code artifacts (SHA-256 deduped)
- `seam_sessions` — SEAM queue execution records
- `queue_compartments` — SEAM chunk state machines
- `ledger` — UPGRADE/INPUT/GAP event log
- `settings` — provider settings, user preferences
- `event_log` — all bus events (written to cortex too)
- `conversations` — NCP session records

---

## Providers

Three providers: `claude`, `chatgpt`, `ollama`

Ollama is HTTP only — no browser tab needed. Guardian calls `:11434/api/generate` directly.

Claude and ChatGPT require browser tabs with Tampermonkey userscripts installed.

**RAID routing (§LAW_I — local-first):**
- If Ollama connected: prefer Ollama for local models
- If claude/chatgpt: route to connected tab
- Fallback chain: guardian → ollama (via Bridge registry)

**Tab claim:** Only one tab per provider can be ACTIVE (receives jobs). Others are PASSIVE (observe only). Claim stored in `GM_getValue` (persists across page navigations). Auto-claim if no other tab claimed in 15s.

---

## Artifact Capture (SHA-256 Dedup — §US-05)

```
Response received
  → scan DOM for <pre><code>, [class*="CodeBlock"] code
  → SHA-256 hash of content (SubtleCrypto.digest)
  → check IDB: if hash known → skip
  → write to IDB artifacts store
  → write to guardian JAA artifacts table
  → POST to cortex event_log (guardian.artifact)
  → POST to bridge (guardian.artifact)
```

`simpleHash()` replaced by `SubtleCrypto.digest('SHA-256')` in v10/v9 userscripts.

---

## Gap Detection

Automatic on every job completion:

| Pattern | Gap Type | Score |
|---------|----------|-------|
| "cannot assist / unable to help" | refusal | 0.9 |
| "context window / token limit" | context_limit | 0.9 |
| Unclosed code block | unclosed_code_block | 0.8 |
| Very short response (< 80ch) | truncation | 0.7 |
| Short apology | short_apology | 0.6 |

Auto-retry: on gap detection, injects a targeted recovery prompt and starts watch again. Max 2 retries.

Gap hunter (`guardian/lib/gap-hunter.js`): analyzes response text for logical gaps, missing definitions, contradictions, incomplete implementations. Scores 0..1 per domain.

---

## Failure Modes — Complete Catalog

### Known Faults Fixed This Session

**F004 — `nc.postBridge()` ghost call**
- `postBridge` was called in 3 places but never defined in `nexus-connect.js`
- Every Bridge notification from Guardian silently failed
- Fixed: implemented `postBridge()` in nexus-connect.js

**`_write is not defined` (NCP dispatch failure)**
- `lib/ncp.js` called `_write(client.res, data)` inside `push()`, `pushTab()`, `broadcast()`
- `_write` was never defined anywhere in `lib/ncp.js`
- It existed only in `ui/ncp.js` (browser-side) but was never ported to server-side
- Every `ncp.push()` call threw `ReferenceError: _write is not defined`
- Every dispatch to a connected tab failed with this error
- Fixed: added `function _write(res, data) { try { res.write(...) } catch(_) {} }` inside `createNCPServer`
- Fault class: `ghost_call`
- Gap type: `wiring_missing`

**Jobs lost on restart (§2.1 violation)**
- `const jobs = new Map()` starts empty every boot
- JAA persists jobs to disk but nothing reloaded them into the Map
- After restart: `/jobs` returned empty, `/status/:id` returned null for all prior jobs
- Fixed: Phase 4.5 SOFT in boot sequence — replays `jaa.query('jobs')` into Map
- Fault class: `phantom_write` (state written but not recoverable)
- Gap type: `baseline_drift`

**`NEXUS_DOM_MAP` log spam (§1.2 violation)**
- Userscripts sent DOM maps every second
- Guardian's `default` case logged: `[guardian] unhandled message type: NEXUS_DOM_MAP from local`
- Hundreds of lines per minute — signal noise, nothing written to cortex
- Fixed: added `case 'NEXUS_DOM_MAP'` handler that:
  - Writes `guardian.dom_map.received` to cortex event_log
  - Emits on guardian bus
  - Extracts node summaries for CFR analysis
- Default case now rate-limited: first occurrence + every 50th → cortex
- Fault class: `wiring_missing`
- Gap type: `boundary_gap`

**F001 — `uploadDir` scope bug**
- `uploadDir` referenced outside scope in Guardian dropzone server
- Any file upload attempted would crash with `ReferenceError`
- Fixed: aliased from `cfg.uploadDir`

**F002 — `getLocalIPs()` ghost call**
- Called in Guardian server boot but never defined
- Crash on boot when trying to log LAN addresses
- Fixed: implemented `getLocalIPs()` using `os.networkInterfaces()`

**F015 — `_physQueue.enqueue()` bypassed Bridge**
- 3 places called `_physQueue.enqueue()` directly without Bridge notification
- Violated §BRIDGE-GATE
- Fixed: Bridge notification added before each enqueue call

### Known Faults Still Open

| ID | Description | File | Status |
|----|-------------|------|--------|
| F010 | `simpleHash()` in old userscripts — not content-addressed | old userscript-claude.js | Open — new v10 uses SHA-256 |
| F011 | Old userscripts use localStorage — lost on tab close | old userscripts | Open — new v10 uses IndexedDB |
| F012 | No pre-prompt context injection in old userscripts | old userscripts | Open — new v10 has full injection |

### Fault Classes (Named — §13.3)

```
ghost_call          — function referenced but never defined
wiring_missing      — message type/handler exists but not connected
boundary_gap        — message crossed system boundary without receiver
phantom_write       — state written but not recoverable after restart
silent_failure      — error swallowed without logging (§1.2 violation)
scope_escape        — variable referenced outside its lexical scope
rogue_bypass        — direct call that bypassed Bridge
```

---

## Userscripts

### Installation
1. Install Tampermonkey in Chrome
2. Open Tampermonkey dashboard
3. Create new script
4. Paste `guardian/userscript-claude.js` for Claude tabs
5. Paste `guardian/userscript-chatgpt.js` for ChatGPT tabs
6. Save — the `@match` header auto-activates on matching URLs

### Claude userscript v10.0 (`userscript-claude.js`)

**What it does:**
- Opens SSE channel to Guardian on `GET /channel?provider=claude`
- Claims tab (only one ACTIVE tab per provider)
- Receives `GUARDIAN_JOB` via SSE → injects prompt → submits → monitors → reports
- Captures artifacts (SHA-256 dedup, IDB storage)
- Detects gaps and auto-retries
- Pre-prompt intelligence injection from `GET :3748/api/intelligence/context`
- Sends DOM maps on connect and navigation (not every second)
- 8-tab widget: Log, Ledger, Gaps, Arts, SEAM, Intel, Sys, Opts

**DOM selectors (Claude-specific):**
```js
Input:    '[contenteditable="true"][data-placeholder]'
          '.ProseMirror[contenteditable="true"]'
Send btn: 'button[aria-label="Send message"]:not([disabled])'
          'button[type="submit"]:not([disabled])'
Response: '[data-is-streaming="true"]'
          '.font-claude-message:last-child'
Generating: '[data-is-streaming="true"]'
            '.text-streaming'
Code:     'pre code'
          '.code-block__code'
          '[class*="CodeBlock"] code'
```

**Key functions:**
```
init()               — open IDB, build UI, connect NCP
connect()            — EventSource to /channel
handleJob(msg)       — main job executor
startWatch(jobId)    — MutationObserver response monitor
_onJobComplete()     — artifact scan, gap detection, reporting
pullIntelligenceContext() — pre-prompt context from cortex
sendDOMMap()         — spatial node report (rate-controlled)
scanArtifacts(jobId) — SHA-256 dedup + IDB + guardian/cortex
autoRetry()          — gap-triggered recovery prompt
```

**IndexedDB stores:**
```
requests  { uuid, status, command, sessionId, provider, createdAt }
sessions  { sessionId, chatPath, provider, startedAt }
artifacts { hash, lang, content, jobId, provider, sessionId, ts }
```

**Settings (GM_getValue persisted):**
```
enableContextInjection  — pre-prompt intelligence injection (default: true)
enableArtifactCapture   — SHA-256 artifact dedup (default: true)
enableAutoRetry         — gap-triggered retry (default: true)
enableDOMMap            — send DOM map on navigation (default: true)
enableStreamCapture     — stream response to cortex (default: true)
enableSeamAutoInject    — SEAM auto-inject mode (default: false)
verboseLog              — verbose logging (default: false)
```

### ChatGPT userscript v9.0 (`userscript-chatgpt.js`)

Same architecture as Claude v10. ChatGPT-specific DOM selectors:

```js
Input:    '[contenteditable="true"]' (preferred)
          'textarea#prompt-textarea'
Send btn: 'button[data-testid="send-button"]:not([disabled])'
          'button[aria-label="Send prompt"]:not([disabled])'
Response: '[data-message-author-role="assistant"]:last-child'
Generating: '[class*="result-streaming"]'
Code:     'pre code'
          '[class*="CodeBlock"] code'
          '[class*="code-block"] code'
```

Uses green accent (#10b981) instead of purple (#818cf8) for visual distinction.

---

## Intelligence Context Injection (§US-04)

Before every job dispatch, userscripts query:
```
GET :3748/api/intelligence/context?intent=<prompt>&command=<cmd>&provider=<p>
```

Returns: failure modes to account for, reusable artifact hashes, active patterns, system state.

Context prepended to prompt as:
```
[NEXUS CONTEXT]
[KNOWN FAILURE MODES]
  - wiring_missing (×12): Recurring fault — account for this
[REUSABLE ARTIFACTS]
  - js #a3b2c1d4: function parseSpec implementation
[SYSTEM STATE] 2 critical gaps open — types: boundary_gap, context_loss
```

Agents don't start cold. Token efficiency via UUID refs, not full content re-send.

---

## Data Storage

```
data/guardian/
  input/          pending queue files
  output/         completed responses
  queue/          in-progress files
  failures/       failed items
  conversations/  session logs
  ledger/boot/    boot records (events.ndjson)

guardian/memory_store/
  ledger.json     UPGRADE/INPUT/GAP events
  settings.json   provider settings
  event_stats.json event frequency stats
  event_log.jsonl  all bus events (append-only)
```

---

## Ports

```
:7820   HTTP + NCP (main server)
:7821   (removed — was WSS, replaced by NCP)
:7822   Dropzone (file upload UI, Express)
:7823   Memory server (context/memory queries)
```

---

## Files

```
guardian/
  server.js              — main server (entry point)
  interaction-contract.json — declared API contract
  userscript-claude.js   — Claude tab agent (v10.0)
  userscript-chatgpt.js  — ChatGPT tab agent (v9.0)
  lib/
    seam-queue.js        — SEAM spec execution queue
    spec-parser.js       — .spec file parser
    gap-hunter.js        — response gap analyzer
    detector.js          — artifact/pattern detector
  agents/
    index.js             — Ollama agent (direct HTTP)
  memory.js              — memory layer
  jaa-store.js           — JAA storage adapter
  guardian-api.js        — external API interface
  dropzone.js            — file upload server
  cli.js                 — CLI commands
```

---

## Dependencies

**Zero external npm packages for core transport.**

Only stdlib: `http`, `fs`, `path`, `crypto`, `os`, `url`

Optional (dropzone only): `express`, `multer`

NCP replaces: `ws` (WebSocket), TLS certificates, ngrok tunnels

---

## Rebuilding From Scratch

If you need to rebuild Guardian completely:

1. **Core HTTP server** — `http.createServer()`, listen on `:7820`
2. **NCP server** — `lib/ncp.js` `createNCPServer()`. **CRITICAL: `_write` must be defined inside `createNCPServer`** — this was F-NCP-001, the root cause of dispatch failing
3. **Job Map** — `const jobs = new Map()` + Phase 4.5 boot replay from JAA
4. **Physical queue** — `lib/queue.js` — files before dispatch, atomic rename
5. **Boot sequence** — `lib/boot-sequence.js` — 12 phases, SOFT degrades gracefully
6. **`_handleNCPMessage`** — the main message router — every case named, default rate-limited
7. **SEAM queue** — `guardian/lib/seam-queue.js` — spec chunker + state machine
8. **Userscripts** — install in Tampermonkey, ACTIVE tab claims the provider

**The one thing that will break everything if forgotten:** `_write` in `lib/ncp.js`. Every `ncp.push()` call will throw `ReferenceError: _write is not defined` and no jobs will ever reach the browser.

---

## SEAM Current Status

As of 2026-06-11: **Guardian is working. SEAM is not.**

The dispatch pipeline (`POST /command → poll → response`) is confirmed working (ChatGPT responded with "ACK ✓"). SEAM spec execution requires the connected tab to handle `GUARDIAN_JOB` and report back SEAM-aware verdicts. The new userscripts (v10/v9) have SEAM support in the panel widget. The queue state machine in `seam-queue.js` is intact.

**Known SEAM gaps:**
- SEAM chunk delivery needs the tab to be ACTIVE and claimed
- ChatGPT provider was showing "not connected" during test (tab may not have been claimed yet)
- SEAM verdict detection in userscript needs DOM-specific selectors for each provider
