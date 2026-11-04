# GUARDIAN
**UUID:** nexus-sys-guardian-0000-2026-0531-003
**Layer:** 8 — agent
**Ports:** :7820 (HTTP) :7821 (WSS) :7822 (dropzone) :7823 (memory)
**Status:** active
**Source:** NEXUS-SPEC-v9.spec, MASTEVOS-v9.spec

---

## What it is

The complete agent control system. Not just a browser extension.

Guardian is three things unified:
1. **Guardian Server** — job queue, provider routing, WSS provider channel (:7820/:7821)
2. **Guardian Browser Extension** — eyes and hands in the browser (Claude.ai, ChatGPT, Gemini)
3. **Guardian UI** — the control panel for the entire Guardian system (renamed from Forge in v9.0)

The Control Panel (RAID) routes agent calls TO Guardian first under LAW_I step 2.
Guardian then routes between browser providers. RAID decides which agent. Guardian executes.

**Forge rename (v9.0):** All `forge-*` files renamed to `guardian-ui-*`. The Forge IDE concept is absorbed into Guardian UI. Guardian UI IS the IDE, control panel, and pipeline canvas for the Guardian system.

---

## Axioms

| Axiom | Rule |
|-------|------|
| LAW_I | Guardian-Claude before API-Claude, always, when Guardian is connected |
| LAW_II | No state without JAA row — every job, session, artifact persisted |
| LAW_V | CLI first — every feature has a CLI command |
| LAW_VI | Every failure emits toast |
| LAW_VII | Guardian UI is completely isolated from Guardian Server internals |
| §M1 | Every conversation captured. Everything stored. |
| §M4 | Agents know themselves. Every agent carries a live self-model. |

---

## What it does

### Guardian Server — guardian/server.js (:7820/:7821)

**HTTP API — key routes:**
```
POST /command           — create and dispatch job { provider, command, prompt, content }
GET  /status/:jobId
GET  /response/:jobId
GET  /stream/:jobId     — SSE token stream
GET  /jobs
GET  /providers
GET  /health            — { ok, uptime, jobs, providers, queued }
GET  /artifacts
GET  /gaps
GET  /ledger
GET  /sessions
GET  /memory/query
GET  /memory/context
GET  /settings
PUT  /settings/:key
GET  /cockpit           — Guardian UI HTML
GET  /events            — SSE dashboard
GET  /contract          — interaction contract JSON
GET  /bus               — SISO bus log
POST /bus/emit          — inject event to bus
```

**WSS contract (:7821) — server → provider:**
```
GUARDIAN_READY          — after successful GUARDIAN_REGISTER
GUARDIAN_JOB            — { jobId, command, provider, prompt, content }
GUARDIAN_ARTIFACT_SAVED — after artifact upload completes
GUARDIAN_HEARTBEAT_ACK  — response to GUARDIAN_HEARTBEAT
```

**WSS contract — provider → server:**
```
GUARDIAN_REGISTER   — { provider, host } — first message, mandatory
GUARDIAN_DELIVERED  — { jobId } — confirmed processing
GUARDIAN_CHUNK      — { jobId, text } — streaming partial
GUARDIAN_COMPLETE   — { jobId, text? } — final result
GUARDIAN_ARTIFACT   — { jobId, filename, content }
GUARDIAN_ERROR      — { jobId, error }
GUARDIAN_HEARTBEAT  — keepalive (every 8s)
```

### SISO Bus

Every `bus.emit()` → `_kernelEmit()` → orchestrator ledger + cortex `event_log` + bridge broadcast.
Observable via `GET /bus`. Injectable via `POST /bus/emit`.

**SISO channels emitted:**
```
guardian.job.complete     → cortex + bridge
guardian.artifact         → cortex + bridge
guardian.gaps             → cortex
guardian.job.queued       → bridge
guardian.job.dispatched   → bridge
guardian.ledger           → jaa
guardian.session.named    → jaa
```

### Guardian Browser Extension — guardian/chrome-extension/

Chrome extension. MutationObserver captures responses from `claude.ai` / `chatgpt.com` / `gemini.com`. Dispatches prompts to AI tabs. Routes responses back to server via WSS :7821. Heartbeat every 8s to :3748.

**Files:** `manifest.json`, `background.js`, `content.js`, `ir-layer.js`, `app.js`, `handshake.js`, `cfr.js`, `modules/base-module.js`, `modules/chatgpt.js`, `modules/claude.js`

### Guardian Userscripts (v8.2) — Tampermonkey

Install on `claude.ai` and `chatgpt.com`. Same contract as extension for browser providers.

**Key systems in userscripts:**
- `SISO_BroadcastChannel: guardian-siso-v8`
- `SEAM_BroadcastChannel: guardian-seam-v1`
- Tab claim — only claimed tabs receive and execute jobs (prevents multi-tab chaos)
- GapHunter v3 — full gap taxonomy: logical, evidential, temporal, contextual, causal, structural, assumption, contradiction
- Prompt Archaeology — chunk timing, entropy, burst/pause detection, hypotheses
- SEAM delivery — chunk-gated spec delivery with auto-verdict detection
- Auto-error detection: truncation, refusal, context limit, SEAM FAIL
- Auto-retry with forensic context (2 attempts)
- Usage tracking: tokens/job/session + per-job history
- §5.2 bus wiring: every significant event → orchestrator + bridge + cortex

### Siphon — guardian/siphon.js

Chat ingestion normalizer. Watches `event_log` for `guardian.*` events. Normalizes to `chat_sessions`, `chat_messages`, `chat_completions`.

### Pulse — guardian/pulse.js

Reads heartbeat events from `event_log`. Builds live mesh topology in `guardian_nodes`. Stale node (no heartbeat > 25s) → `gap.found`.

### Watchman — guardian/watchman.js

Monitors Guardian health. Writes `guardian_health` every 5s. `healthScore < 0.3` OR `connected=false` → severity:high gap + `toast.error` RED.

### Guardian UI — guardian/ui/index.html (:4242, renamed from Forge)

The universal entry point for all spec work and AI pipeline management.

**Served at:** `http://localhost:7820/cockpit` and `http://localhost:9000/ui/guardian`

**Tabs:**
- **SEAM Chunker** — parse spec, chunk, deliver to AI via guardian queue
- **Pipeline** — linear spec→build workflow with per-step status
- **Compiler** — emerge .eg compiler interface
- **Automation** — scheduled/triggered jobs
- **Brain** — CFR particle canvas + SISO bus log + memory search
- **Forge** — file management + artifact viewer
- **Providers** — provider connection status
- **Bridge** — bridge request queue

**Status dots (topbar, live via orchestrator SSE):** Orch :9000 | Bridge :9999 | Cortex :3748 | Guardian :7820 | Idearium :4800

**Hotswap:** Edit `guardian/ui/index.html` → orchestrator detects change → browser reloads.

**Isolation:** Guardian UI connects ONLY through the Guardian HTTP API (:7820) and WSS (:7821). Cannot read JAA directly. Cannot call server functions directly (LAW_VII).

---

## JAA Tables

```
chat_sessions      — captured browser sessions
chat_messages      — individual messages per session
chat_completions   — complete AI responses
guardian_nodes     — live provider mesh topology
guardian_health    — health records (every 5s)
artifacts          — generated code/content artifacts
gaps               — guardian-detected gaps
ledger             — guardian ledger entries
```

---

## What it does NOT do

- Does not route agent calls — RAID does the routing, Guardian executes
- Does not hold the system source of truth — Cobalt Core / JAA does
- Does not build specs — Idearium does
- Does not track file versions — Versionium does
- Does not compute sigma/delta — shape-sampler and causal nexus do
- Does not allow UI to bypass the interaction contract (LAW_VII)
- Does not communicate with NEXUS synchronously — all writes are fire-and-forget
- Does not wait on NEXUS — Guardian never blocks on NEXUS responses
- Does not capture conversations without user installing extension/userscript
- Does not bind port 3747 — reserved for Bridge OS only

---

## TLS (WSS :7821)

Self-signed cert. Visit `https://127.0.0.1:7821/` once in browser to accept.
`guardian-cert.pem` + `guardian-key.pem` must be present before boot.

---

## Open gaps

| ID | Description | Severity |
|----|-------------|----------|
| G-GUARDIAN-01 | Port conflict: project.nexus.json expects :3748, Guardian HTTP at :7820 | HIGH |
| G-GUARDIAN-02 | Userscript download-all button (bulk one-time) not yet implemented | MEDIUM |
| G-GUARDIAN-04 | Cockpit connects to :3748, Guardian at :7820 — unification needed | CRITICAL |
