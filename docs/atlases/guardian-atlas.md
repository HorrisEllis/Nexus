# guardian — The AI Engine of NEXUS

> **v3.6.2 (active)** · port 7820 · the only system that touches AI providers — everything else requests work through it

**Author:** James Brooks (Erosmancer) · rheon.world

---

## What It Is

Guardian is NEXUS's sole point of contact with AI providers. No other system holds API keys or makes external inference calls — everything routes through Guardian's NCP (browser-tab) connections or its local Ollama bridge. Its own spec states the boundary plainly: *"No API keys. No external inference calls. Browser tabs only."* SEAM compresses intent before sending, so a request never reaches a provider un-shaped.

---

## Quick Start

Not confirmed this session — `guardian/server.js` not read directly.

---

## File Structure

```
guardian/
  spec/
    guardian.spec              real, read in full this session
  lib/
    node-registry.js             real, read in full — the source watcher.js (architecture-spec) generalizes from
    jobs.js                        real per-file existence (referenced in NODE-TAXONOMY.md); internals not read
    response-sink.js                 real per-file existence; internals not read
  data/
    nodes/
      tool/ agent/ command/ event/ intent/ response/
                                        GUARDIAN_NODE_TYPES — real, watched folders per node-registry.js
```

| Path | Node kind it holds | Contains |
|---|---|---|
| `data/nodes/<type>/` | tool, agent, command, event, intent, response | one JSON file per node, live-watched, JAA-indexed, per-type ledgered |

---

## Architecture

### Spine

Not confirmed — no WARP binding evidence read this session for guardian specifically.

### Governing axioms

| Name | Statement | Rationale |
|---|---|---|
| `AX-001`, `AX-002`, `AX-007` | per guardian.spec's `core.axioms` | not individually stated in the excerpt read this session |

### Boundaries (documentation clarity)

| Term | Definition | Distinguished from |
|---|---|---|
| Guardian | dispatch — routes intent to a provider and returns the result | `copilot` — intelligence: assembles context, classifies intent, can answer from Cortex memory alone if Guardian is down. Guardian's own spec: *"Guardian is dispatch. Co-pilot is intelligence. They are separate."* |

### Seams (cut points)

Not confirmed — no seam declarations read this session for guardian specifically. `GUARDIAN_NODE_TYPES` folder boundaries (`tool/agent/command/event/intent/response`) are plausible seam candidates but not declared as such in source.

### Sovereignty (cross-system contract)

| Other system | May read | May never write | Enforced by |
|---|---|---|---|
| any | Guardian's own dispatch/job results | `data/nodes/` directly — must go through Guardian's own registry write path | folder-watcher + validation, per `node-registry.js`; not independently verified as process-isolated |

### Pulse (liveness)

`NCP_HB_MS: 8000` — NCP (browser-tab provider) heartbeat interval. `NCP_RECONNECT_MS: 3000` — reconnect attempt interval. Real constants from `guardian.spec`'s own `core.constants`.

### Self-diagnostics (structural strain)

Not confirmed — no friction/tension equivalent found for guardian specifically this session (distinct from `cortex`'s own per-gap friction score — see `cortex` below).

### Config layers

Not confirmed.

### Phases

Not confirmed — no phasemap read for guardian specifically this session.

### Component status

Not confirmed.

---

## The Modules

---

### node-registry

**id:** `guardian.node-registry`
**path:** `guardian/lib/node-registry.js`

**What it does**

Watches `data/nodes/<type>/` for six real node types (`tool`, `agent`, `command`, `event`, `intent`, `response`), validates on drop, indexes in memory, and writes to both a flat per-type ledger (`_ledger.jsonl`) and a live jaaDB table (`nodes_<type>`) plus a per-type ledger table. This is the real, original source `architecture-spec`'s own `watcher.js` and `api.js` generalize — built 2026-09-12, quoting James directly in its own comments: *"using a Jaa database for each node type and using tables for an index of each node... a ledger for tracking history and movement."*

**How it works internally**

See `architecture-spec-atlas.md`'s `registry-watcher` entry — the generalized version documents the same real mechanism this file implements natively for guardian.

**Commands / How to use it**

Not re-documented here — identical mechanism to `architecture-spec`'s `registry-watcher`, this is the original.

**What it connects to**

- Six node-type folders it exclusively owns

**Bus events emitted**

- `guardian.node.removed` — confirmed real, fired on file deletion

---

### seam-dispatch (SEAM / NCP / RAID routing)

**id:** `guardian.seam-dispatch`

**What it does**

Compresses intent into token-budgeted chunks (`SeamChunk`) and routes them to whichever of five real NCP providers (Claude, ChatGPT, Gemini, Perplexity, Ollama) fits the RAID cluster the request was classified into.

**How it works internally**

Real constants from `guardian.spec`: `SEAM_MAX_CHUNK_TOKENS: 800`, `SEAM_MAX_T3_TOKENS: 2000`. Nine real RAID clusters, each with a declared provider fallback chain — Ollama always tried first, Claude always last (reserve, highest quality):

| Cluster | Chain |
|---|---|
| code | ollama → chatgpt → claude |
| spec | ollama → claude |
| data | ollama → chatgpt → claude |
| diagnostic | ollama → chatgpt → claude |
| analysis | ollama → chatgpt → claude |
| vision | gemini → claude |
| research | perplexity → chatgpt → claude |
| hostile | chatgpt → claude |
| forge | not read this session |

Five real providers, each with declared strengths (from `guardian.spec`):

| Provider | Access | Strengths |
|---|---|---|
| claude | browser tab, userscript v10.1.0 | complex reasoning, code quality, nuance, long context |
| chatgpt | browser tab, userscript v9.1.0 | token efficiency, grounded, hostile testing, structured output |
| gemini | browser tab, v1.0.0 | vision, UI analysis, multimodal, speed |
| perplexity | browser tab, v1.0.0 | real-world facts, citations, web search, research |
| ollama | local, no tab needed | local, private, free, code, spec — models: `qwen2.5-coder:1.5b` (seam), `mistral:7b-instruct-q4_K_M` (general) |

**Commands / How to use it**

Not read this session.

**HTTP routes**

Not read this session — `guardian.spec`'s `routes:`/`modules:`/`handshake:` sections were not pulled beyond `core`/`events`/`ncp_providers`/`raid_routing`.

**What it connects to**

- `cortex` — handles `cortex.raid.decided` to know which provider to dispatch to
- `cortex` — `HEAL_REQUESTED` → `forge.patch if applicable`

**Bus events emitted**

`guardian.booted`, `guardian.job.queued`, `guardian.job.dispatched`, `guardian.job.complete`, `guardian.job.failed`, `guardian.ncp.connected`, `guardian.ncp.disconnected`, `guardian.tab.needed`, `guardian.seam.chunk_sent`, `guardian.seam.chunk_passed`, `guardian.seam.chunk_failed`, `guardian.artifact.captured`, `guardian.artifact.refused`, `guardian.response.captured`, `guardian.blocks.captured` — all real, from `guardian.spec`'s own `events.emits`.

---

## Accounts come from Clear Glass (2026-09-23)

`lib/agent-registry.js` stays the source of truth for **agents** (selectors, repairs, health). **Accounts** are resolved by Clear Glass: the registry is built with `accountAuthority` (`lib/cg-account-authority.js` → `GET :7702/accounts/resolve`) and the dispatch ladder awaits `resolveAccountAsync`. Unknown explicit account → job fails (`unknown_account`); Clear Glass unreachable → NCP fallback with reason `account_authority_unreachable`.

## Jobs are files (2026-09-23)

A job's `.job` envelope in `data/guardian/jobs/` (override: `GUARDIAN_JOBS_DIR`) is written **before** the job is accepted — if it cannot be written the job is refused, because a job that cannot survive a restart is not a job guardian can promise. Later status writes stay non-fatal: the job already exists and may be mid-flight, and killing live work over a status write loses more than it protects.

Recovery and redelivery already existed and were **not** rebuilt: `lib/jobs.js loadPersistedJobs()` hydrates the in-memory Map at `createJobStore`, and `server.js _redispatchRecoveredJobs` (2026-09-11) requeues `dispatched` → `pending` — the tab that held it is provably gone in a fresh process — then dispatches each pending job once, leaving `complete`/`error` as history. Gate proven by `tests/modules/test-guardian-job-persistence.js` (15/15) with a real second store over the same directory.

**Not built:** Clear Glass watching this directory and adding each `.job` to its intake. The mesh queue is already idempotent by jobId and NCP already delivers these jobs; a second delivery route without deciding which one *owns* delivery would create the duplicate dispatch it is meant to prevent.

---

## A quiet job says where it stopped (2026-09-23)

`submit()` in each of the five userscripts returns `{ ok, how: 'button'|'enter-key' }` or `{ ok:false, error }`. A prompt typed but never sent fails immediately with that reason and the response watch never starts. The watch emits `GUARDIAN_PROGRESS` `reply-started` (with a character count) the first time it sees text that is not the stale baseline — placed before the baseline guard, so *"the guard skipped it"* and *"the page produced nothing"* are different observations. `lib/ncp-handler.js` routes it to `guardian.job.progress`; `server.js` logs one line per stage with the chat url.

Separates four silences that used to look identical: never sent · sent but nothing rendered · rendered but never settled · returned.

---

## Modules Not Yet Built

Not determined — `guardian.spec`'s own `modules:`/`gaps:` sections not read this session.

---

## Build & Run Reference

Not confirmed.

---

## Version History

**Source:** NOT CONFIRMED EITHER WAY — whether guardian reports to Versionium wasn't checked this session (distinct from confirmed absent). Flagged as a real open question, not assumed hand-maintained by default.

---

<!-- generated:registry:start -->

## What the registry knows (generated)

> Generated by `scripts/generate-atlases.js` from loom's registry and events (loom/data/registry.json, loom/data/events.json — data, outside the snapshot, so written plain) and the tree itself, 2026-10-05. Everything between the markers is rewritten on the next run — write narrative above them. The same facts, one component at a time, are what `lib/registry-harness.js` hands a repo agent (loom.card.tool).

**195** files · **62** code files · **36** registry components declared here · **14** events emitted · **3** heard · **36** routes · **18** code files with a covering test

### Routes (36)

- GET /api/chats — Every logged chat at its newest version (?agentId ?provider ?q=text recall ?limit) · declared in `guardian/registry-components.js`
- GET /api/chats/item/:id — One chat version: the full transcript from its .response file · declared in `guardian/registry-components.js`
- GET /api/chats/versions — Every version of one chat (?key=provider:chatId), newest first · declared in `guardian/registry-components.js`
- GET /artifacts — SHA-256 deduplicated code artifacts · declared in `guardian/registry-components.js`
- GET /baseline — Friction + sigma baseline · declared in `guardian/registry-components.js`
- GET /bus — Recent SISO bus log · declared in `guardian/registry-components.js`
- GET /channel — NCP SSE channel — browser tabs connect here · declared in `guardian/registry-components.js`
- GET /contract — Guardian interaction contract · declared in `guardian/registry-components.js`
- GET /events — SSE — all guardian bus events · declared in `guardian/registry-components.js`
- GET /gaps — Open gaps detected by guardian · declared in `guardian/registry-components.js`
- GET /gaps/summary — Gap summary by type + severity · declared in `guardian/registry-components.js`
- GET /health — Guardian health, job counts, provider status · declared in `guardian/registry-components.js`
- GET /jobs — Active + recent jobs · declared in `guardian/registry-components.js`
- GET /providers — Connected NCP browser tab providers · declared in `guardian/registry-components.js`
- GET /queue — Physical queue status · declared in `guardian/registry-components.js`
- GET /queue/compartments — Job compartment list · declared in `guardian/registry-components.js`
- GET /response/:jobId — Full response for a job · declared in `guardian/registry-components.js`
- GET /seam/queues — Active SEAM queues · declared in `guardian/registry-components.js`
- GET /seam/queues/:id — Single SEAM queue detail · declared in `guardian/registry-components.js`
- GET /seam/sessions — SEAM session history · declared in `guardian/registry-components.js`
- GET /seam/watchdog/status — SEAM watchdog + stall detection · declared in `guardian/registry-components.js`
- GET /sessions — NCP session history · declared in `guardian/registry-components.js`
- GET /settings — Guardian settings · declared in `guardian/registry-components.js`
- GET /status/:jobId — Single job status · declared in `guardian/registry-components.js`
- GET /version — Guardian + userscript versions · declared in `guardian/registry-components.js`
- POST /api/copilot/memory — Co-pilot memory operations · declared in `guardian/registry-components.js`
- POST /api/copilot/prompt — Route to co-pilot :3750/api/prompt · declared in `guardian/registry-components.js`
- POST /build — Full T0→T1→T2 build pipeline from spec · declared in `guardian/registry-components.js`
- POST /bus/emit — Emit event onto bus · declared in `guardian/registry-components.js`
- POST /command — Dispatch job to provider (raw or SEAM) · declared in `guardian/registry-components.js`
- POST /queue/compartments — Create job compartment · declared in `guardian/registry-components.js`
- POST /queue/enqueue — Enqueue item to physical queue · declared in `guardian/registry-components.js`
- POST /result — NCP result from browser tab · declared in `guardian/registry-components.js`
- POST /seam/retry — Retry a failed SEAM chunk · declared in `guardian/registry-components.js`
- POST /seam/sessions — Create SEAM session · declared in `guardian/registry-components.js`
- POST /settings/reset — Reset settings to defaults · declared in `guardian/registry-components.js`

### Events it emits (14) — and who hears them

- **guardian.job.complete** — from `guardian/lib/response-sink.js` → `tests/modules/test-back-and-forth.test.js` (core), `tests/modules/test-chat-transcripts.test.js` (core), `tests/modules/test-registry-harness.test.js` (core)
- **guardian.job.error** — from `guardian/lib/response-sink.js` → `tests/modules/test-back-and-forth.test.js` (core), `tests/modules/test-chat-transcripts.test.js` (core), `tests/modules/test-economy-guardian.test.js` (core)
- **guardian.job.progress** — from `guardian/lib/job-retry.js` → `guardian/lib/chat-transcripts.js`, `tests/modules/test-back-and-forth.test.js` (core)
- **guardian.chat.transcript.recorded** — from `guardian/lib/chat-transcripts.js` → `tests/modules/test-chat-transcripts.test.js` (core)
- **guardian.blocks.captured** — from `guardian/lib/code-artifact.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **guardian.job.chunk** — from `guardian/lib/response-sink.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **guardian.job.completed_from_transcript** — from `guardian/lib/chat-transcripts.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **guardian.job.gate** — from `guardian/lib/gate-trail.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **guardian.node.removed** — from `guardian/lib/node-registry.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **guardian.response.captured** — from `guardian/lib/code-artifact.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **guardian.wake.detected** — from `guardian/lib/wake-loop.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **guardian.wake.failed** — from `guardian/lib/wake-loop.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **guardian.wake.refused** — from `guardian/lib/wake-loop.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **guardian.wake.replied** — from `guardian/lib/wake-loop.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)

### Events it hears from elsewhere (2)

**guardian.ncp.sync_result** (core) · **guardian.ncp.transcript**

### Files, directory by directory (10 directories)

#### `guardian/`

24 code · 9 other file(s).

- `guardian/api-dispatch.js` (286 lines) — Direct API dispatch for non-NCP providers Guardian is the AI engine for the whole system.  
  exports dispatch, capabilities, isAvailable, PROVIDERS, MODULE_ID, VERSION · requires 1 · required by 0
- `guardian/artifact-upload.js` (58 lines) — Auto-upload for generated code blocks §BUG FIXED 2026-07-05: this replaces the 'autoUpload' path that used to  
  exports createAutoUploader, sanitizeFilename
- `guardian/ask.js` (342 lines)  
  exports askSync, DEFAULT_TIMEOUT_MS, converseWithOllama, bridgeConversation
- `guardian/clear-glass-bridge.js` (230 lines)  
  exports dispatchBrowserCommand, spawnProviderTab, _responseTypeFor · requires 0 · required by 7 · tested by `tests/spawn-provider-tab.test.js`
- `guardian/cli.js` (533 lines) — guardian/cli.js (or: add 'guardian' to your PATH) Guardian CLI — sends commands to the bridge server  
  requires 2 · required by 0
- `guardian/config.js` (60 lines) — real, distinct config, not inline constants scattered across guardian/server.js. Matches the pattern established  
  exports ORCH_PORT, DROPZONE_PORT, NEXUS_URL, James · requires 0 · required by 1
- `guardian/dropzone-persist.js` (48 lines) — Persistent dropzone registry Persistent dropzone registry with JAA backing.  
  exports DropzoneRegistry
- `guardian/dropzone.js` (452 lines) — DROP ZONE CLI — dropzone Commands:  
  requires 1 · required by 0
- `guardian/event-taxonomy.js` (111 lines) — // guardian/event-taxonomy.js — ET2_guardian_event_taxonomy. // Conforms to lib/event-taxonomy-pattern.js's real ET1 shape.
- `guardian/guardian-api.js` (466 lines) — Canonical Guardian v8 API Connector Single source of truth for all HTTP communication with guardian/server.js.  
  exports GuardianAPI, getGuardian
- `guardian/jaa-store.js` (780 lines) — Guardian v8 Pure-JS Relational Store Zero native dependencies. Works on any platform, any Node version.  
  exports JaaStore · requires 0 · required by 5 · tested by `tests/modules/test-adversarial-sim.js`, `tests/modules/test-bus-subscriptions.js` +5
- `guardian/nexus-hey-claude.user.js` (2745 lines) — // ==UserScript== // @name Guardian — Claude v10.0
- `guardian/registry-components.js` (88 lines) — guardian/registry-components.js Declares every Guardian capability to the orchestrator on boot.
- `guardian/server.js` (4648 lines) — // §CONFIG 2026-08-23 — real, centralized config, not scattered inline // constants. See guardian/config.js's own header for the full real  
  exports server, wss, ncp, jobs, PROVIDERS, dropzone +1 · requires 9 · required by 6
- `guardian/spec-namer.js` (22 lines) — // spec-namer.js — stub // Infers filenames from spec content + lang context  
  exports inferFilename, inferSpecFilename
- `guardian/tool-runtime.js` (115 lines) — P4 of the omniscience phasemap §PHASEMAP P4 (docs/copilot-omniscience-phasemap.spec). Proof of B/non-linear:  
  exports run, makeGuardianCallModel, _extractToolCalls, toolCount
- `guardian/userscript-chat-stream.js` (275 lines) — // guardian/userscript-chat-stream.js — every provider chat, streamed live to Clear Glass's download manager. // comp_id: nexus.guardian.userscript-chat-stream  
  requires 2 · required by 1
- `guardian/userscript-chatgpt.js` (3164 lines) — // ==UserScript== // @name Guardian — ChatGPT v10.0
- `guardian/userscript-claude.js` (3305 lines) — // ==UserScript== // @name Guardian — Claude v10.0
- `guardian/userscript-deepseek.js` (1288 lines) — // ==UserScript== // @name Guardian — DeepSeek v1.0
- `guardian/userscript-gemini.js` (1256 lines) — // ==UserScript== // @name Guardian — Gemini v10.0
- `guardian/userscript-memory.js` (300 lines) — // ==UserScript== // @name NEXUS — Cortex Memory Observer v1.0
- `guardian/userscript-nexus-wake.js` (488 lines) — // ───────────────────────────────────────────────────────────────────────────── // guardian/userscript-nexus-wake.js — "Hey nexus" in any agent tab
- `guardian/userscript-perplexity.js` (1246 lines) — // ==UserScript== // @name Guardian — Perplexity v10.0
- other: `guardian/compartment.json`, `guardian/guardian-cert.pem`, `guardian/guardian-key.pem`, `guardian/guardian.config.json`, `guardian/interaction-contract.json`, `guardian/interaction-contract.v2.json`, `guardian/userscript-ollama.js.deprecated`, `guardian/userscript-orchestrator.js.deprecated`, `guardian/userscripts.yaml`

#### `guardian/agents/`

1 code file(s).

- `guardian/agents/index.js` (515 lines) — // ── agents/callto/index.js ──────────────────────────────────────────────────── // UUID: agents-callto  
  exports init, stop, status, dispatch · requires 2 · required by 0 · tested by `tests/modules/test-artifact-namer.js`

#### `guardian/commands/`

49 other file(s).

- other: 49 files (.command)

#### `guardian/input/`

28 other file(s).

- other: 28 files (.contract)

#### `guardian/lib/`

33 code · 1 other file(s).

- `guardian/lib/agent-facts.js` (51 lines) — GA1: Guardian states the browser agents Clear Glass runs (map invariant E13). component_id: guardian.lib.agent-facts  
  exports MODULE_ID, VERSION, FIELDS, dir, canonical, list +2 · requires 2 · required by 0
- `guardian/lib/agent-model-nodes.js` (110 lines) — agentModelNodeId(agentId) -> "<slug>" — exportToFile() turns it into "<id>.agent_model".  
  exports agentModelNodeId, toNodePayload, writeAgentModelNode · requires 2 · required by 0
- `guardian/lib/agent-registry.js` (107 lines) — guardian is the SOURCE OF TRUTH for agents. 2026-09-19 (docs/2026-09-19-guardian-mesh-first-dispatch-phasemap.spec).  
  exports createAgentRegistry, MODULE_ID · requires 1 · required by 1 · tested by `tests/modules/test-guardian-dispatch-ladder.js`, `tests/modules/test-guardian-mesh-client.js` +1
- `guardian/lib/artifact-namer.js` (82 lines) — // ───────────────────────────────────────────────────────────────────────────── // guardian/lib/artifact-namer.js — real artifact-record builder  
  exports buildArtifactRecord · requires 0 · required by 1 · tested by `tests/modules/test-artifact-namer.js`
- `guardian/lib/cg-account-authority.js` (45 lines) — Clear Glass is the account authority §BUILT 2026-09-23 — James: "yes clearglass" (decides D3 of  
  exports createClearGlassAccountAuthority · requires 1 · required by 1
- `guardian/lib/chat-sync.js` (96 lines) — DOM-based chat synchronization. §BUILT 2026-09-17 — James: "why indexdb? why can't we manipulate the  
  exports createChatSync · hears guardian.ncp.sync_result
- `guardian/lib/chat-transcripts.js` (328 lines)  
  exports createChatTranscripts, chatPathOf, matchJobs, resumableChatUrl, newChatUrl, isNewChatUrl +2 · requires 1 · required by 0 · emits guardian.chat.transcript.recorded, guardian.job.completed_from_transcript · hears guardian.job.progress, guardian.ncp.sync_result, guardian.ncp.transcript · tested by `tests/modules/test-chat-per-agent.test.js`
- `guardian/lib/code-artifact.js` (612 lines)  
  exports MODULE_ID, fenceDeclaredPath, captureAll, onJobComplete, recordAgentResponse, capture +9 · requires 5 · required by 1 · emits guardian.blocks.captured, guardian.response.captured · tested by `tests/modules/test-code-artifact.js`, `tests/modules/test-extract-code.js` +1
- `guardian/lib/command-index-extract.js` (110 lines)  
  exports extractCommandIndex
- `guardian/lib/command-registry.js` (144 lines) — // guardian/lib/command-registry.js — §NEW 2026-09-17 //  
  exports loadCommands, recordFire, checkStale, createCommand, MODULE_ID · requires 1 · required by 0
- `guardian/lib/dispatch-ladder.js` (149 lines)  
  exports createLadder, SELECTOR_STAGES, USER_STAGES, CONTENT_STAGES, MODULE_ID · requires 2 · required by 0 · tested by `tests/modules/test-guardian-dispatch-ladder.js`, `tests/modules/test-guardian-mesh-client.js` +1
- `guardian/lib/dispatch-pool-bridge.js` (73 lines)  
  requires 0 · required by 1
- `guardian/lib/dispatch-pool.js` (180 lines) — lib/dispatch-pool.js — Per-provider Dispatch Pool Status: pre-release  
  exports DispatchPool, pool
- `guardian/lib/dispatcher.js` (580 lines)  
  exports createDispatcher · requires 2 · required by 1 · tested by `tests/dispatcher-ping-gate.test.js`, `tests/dispatcher-stale-socket.test.js` +2
- `guardian/lib/economy-guard.js` (65 lines) — the provider economy at guardian's dispatch. §0.39.281 EC6. Map: docs/2026-09-29-provider-economy-phasemap.spec (EC6).  
  exports createEconomyGuard, jobTypeOf · requires 4 · required by 2
- `guardian/lib/eros-typist.js` (88 lines) — guardian's line to ErosmancerOS, the fallback typist. §0.39.265 — James: "Maybe hook that in to ErosmancerOS" (asked: fallback typist — the userscript stays primary).  
  exports createErosTypist, HOSTS, DEFAULT_SELECTORS
- `guardian/lib/gap-hunter.js` (22 lines) — FORWARDING SHIM §CONSOLIDATED 2026-07-06 — this used to be a byte-identical copy of  
  requires 1 · required by 0
- `guardian/lib/gate-trail.js` (189 lines)  
  exports MODULE_ID, VERSION, GATES, FIX, ERROR_GATE, apply +3 · emits guardian.job.gate
- `guardian/lib/grammar-fallback.js` (67 lines) — lib/grammar-fallback.js — NEXUS Grammar-Driven Command Resolution §PHASE-15: guardian's /cli/exec previously had zero grammar-engine  
  exports resolveCommand, MODULE_ID, VERSION · requires 2 · required by 0 · tested by `tests/modules/test-grammar-fallback.js`
- `guardian/lib/index.js` (77 lines)  
  exports wireGuardianCore
- `guardian/lib/job-retry.js` (188 lines)  
  exports createJobRetry, classify, fingerprint, MODULE_ID, VERSION, IN_FLIGHT · requires 0 · required by 1 · emits guardian.job.progress
- `guardian/lib/jobs.js` (303 lines) — the job lifecycle, decompiled out of guardian/server.js.  
  exports createJobStore, JOBS_DIR · requires 2 · required by 2 · tested by `tests/modules/guardian-job-persistence.test.js`, `tests/modules/test-agent-memory.test.js`
- `guardian/lib/mesh-client.js` (90 lines) — guardian's client for the Clear Glass agent mesh (port 7702, CLEARGL_IPC_PORT). 2026-09-19. Built for whole-code-base jobs, so it is a JOB protocol, not one long HTTP call:  
  exports createMeshClient · requires 1 · required by 1 · tested by `tests/modules/test-guardian-mesh-client.js`
- `guardian/lib/ncp-handler.js` (921 lines)  
  exports createNCPMessageHandler · requires 2 · required by 0
- `guardian/lib/ncp.js` (565 lines)  
  exports createNCPServer · tested by `tests/modules/ncp-hostile-payload.test.js`, `tests/ncp-dual-live-flap.test.js` +2
- `guardian/lib/node-registry.js` (171 lines) — // §0.39.271 X2 — 'hat' added: Guardian hosts the agent types (NODE-TAXONOMY.md rows 1 and 5); // lib/system-nodes.js writes guardian/data/nodes/{hat,agent} from every forged hat. capability  
  exports start, stop, list, get, GUARDIAN_NODE_TYPES, DEFAULT_NODES_DIR +3 · requires 3 · required by 1 · emits guardian.node.removed
- `guardian/lib/provider-login.js` (15 lines) — why a job for this provider cannot run now, or null  
  exports set, get, all, blockedReason · requires 0 · required by 2
- `guardian/lib/provider-routing.js` (293 lines)  
  exports createProviderRouter · requires 0 · required by 1
- `guardian/lib/raid-feedback.js` (43 lines) — what guardian tells RAID about EVERY finished job (2026-09-19). Found: guardian sent {provider, ok, ms, cluster} but cortex's /api/raid/feedback read {agent, outcome}, so  
  exports buildFeedback, postFeedback · tested by `tests/modules/test-guardian-raid-feedback.js`
- `guardian/lib/response-sink.js` (542 lines)  
  exports deliver, synthesize, writeNode, readNode, writeLedger, postToDownloads +6 · requires 3 · required by 1 · emits guardian.job.chunk, guardian.job.complete, guardian.job.error · tested by `tests/modules/test-response-downloads.test.js`, `tests/modules/test-response-sink-passthrough.test.js`
- `guardian/lib/selector-map.js` (81 lines) — v0.39.249 James: "i want to have the element picker, aware of the cleardriver and  
  exports MODULE_ID, VERSION, KEYS, VERIFIED_SOURCES, mapFor, message +2
- `guardian/lib/wake-hint.js` (54 lines)  
  exports HINT, DEFAULT_MODES, hintMode, createHintInjector · tested by `tests/modules/test-guardian-wake.js`
- `guardian/lib/wake-loop.js` (175 lines)  
  exports createWakeLoop, createCopilotAsk, extractWake, frameReply · requires 1 · required by 0 · emits guardian.wake.detected, guardian.wake.failed, guardian.wake.refused, guardian.wake.replied · tested by `tests/modules/test-guardian-wake.js`
- other: `guardian/lib/agent-registry.seed.json`

#### `guardian/memory_store/`

11 other file(s).

- other: `guardian/memory_store/artifacts.json`, `guardian/memory_store/cfr_state.json`, `guardian/memory_store/chat_log.json`, `guardian/memory_store/event_log.json`, `guardian/memory_store/event_stats.json`, `guardian/memory_store/gaps.json`, `guardian/memory_store/jobs.json`, `guardian/memory_store/ledger.json`, `guardian/memory_store/queue_compartments.json`, `guardian/memory_store/seam_sessions.json`, `guardian/memory_store/settings.json`

#### `guardian/output/`

1 other file(s).

- other: `guardian/output/.gitkeep`

#### `guardian/routes/`

3 code file(s).

- `guardian/routes/autonomous-loop.js` (317 lines) — // guardian/routes/autonomous-loop.js — the first real caller of // lib/autonomous-loop.js's run(). Phase 13 (Autonomous Loop) was built,  
  exports handle, _buildPrompt, _makeExecutor · requires 1 · required by 0 · tested by `tests/modules/mco04-executor-cos-migration.test.js`
- `guardian/routes/mesh.js` (89 lines) — // guardian/routes/mesh.js — routes for the mesh subsystem (mesh/install.js). // UUID: nexus-guardian-route-mesh-v1-0000-4700-0000-000000000003  
  exports handle
- `guardian/routes/settings.js` (83 lines) — // guardian/routes/settings.js — the real /settings cluster (3 routes), // extracted verbatim from guardian/server.js.  
  exports handle

#### `guardian/schemas/`

1 code · 31 other file(s).

- `guardian/schemas/index.js` (51 lines) — // guardian/schemas/index.js — guardian's own, fully sovereign schema registry. //  
  exports get, list, SCHEMAS, MODULE_ID, VERSION · requires 1 · required by 0
- other: 31 files (.agent, .artifact, .capability, .command, .component, .event, .fault, .gap)

#### `guardian/spec/`

3 other file(s).

- other: `guardian/spec/guardian.code-artifact.spec`, `guardian/spec/guardian.node-taxonomy.md`, `guardian/spec/guardian.spec`

<!-- generated:registry:end -->

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). Part of the rheon.world / NEXUS ecosystem.

## Jobs are claimed before Clear Glass takes them (3.8.0, v0.39.227)

The dispatch ladder takes a `claim` dependency and calls it before any mesh send. `server.js` wires it to a **required** `.job` write: `transport: mesh`, `claimedBy: clear-glass`, `status: dispatched`. A failed claim sends nothing and falls back to NCP (`mesh_claim_failed`). When the ladder falls back to NCP, the dispatcher clears `claimedBy` — a `.job` never names two owners. Clear Glass's intake refuses any job it can't find claimed through `GET /jobs?id=`. `updateJob(id, patch, { required })` — the opt-in is used only for the claim; status updates stay non-fatal.


## A repo job goes to its own tab, or waits for it (3.9.0, v0.39.237)

A job carrying an `agentId` (idearium's repo agent) is delivered only to the tab that registered under `tabId=agentId`. If that tab isn't connected, the job is queued with the reason "waiting for `<agentId>`'s own `<provider>` tab", Clear Glass is asked to open it hidden, and the ordinary `flushQueuedJobs()` on connect delivers it. From a cold start the repo tab is what gets opened, not the shared window.

Before this, a repo job with no tab yet went to the **shared** tab while the repo tab was opened "for next time" — the job ran in one window, the other sat idle, and James saw two ChatGPT instances from one job (2026-09-25 log).

The shared tab still serves a repo job when there's evidence the repo tab isn't coming: Clear Glass says it can't open it or can't be reached, or it hasn't connected within `GUARDIAN_AGENT_TAB_WAIT_MS` (60 s). That fallback is logged, emitted as `guardian.job.agent_tab_fallback`, and written to the `.job` as `transportFallbackReason`.

`GUARDIAN_REPLAY` no longer completes a job. It used to mark the named job complete with no response; the userscripts no longer send it.

**Open:** the ping gate still pings the provider's active client, not the repo tab the job is aimed at.

## A reply watcher is never silent (3.9.1, v0.39.238)

When a userscript's `findResponseEl()` finds no reply element, the watch now reports a `no-reply-element` progress stage after 15 s and fails the job loudly at the no-reply deadline, naming selector drift. It used to poll forever with nothing in the log — the "submitted, then silence" of the 2026-09-25 run. ChatGPT's `findResponseEl()` returns the streaming element, else the last assistant message; it used to return the first `:last-child` match or nothing.

## One selector map per provider (3.11.0, v0.39.249)

Where a provider's input box, send button and reply live is one map, held by `lib/agent-registry.js` and served by `lib/selector-map.js`. Every NCP connect pushes `GUARDIAN_SELECTORS` to that tab; every change (`POST /api/agents/:id/selectors`) is pushed to all of that provider's open tabs, so the next job uses it. A key counts as **verified** only when its last change came from a live-checked source (the Clear Glass element picker, archaeology) with evidence; copilot may propose, never verify. `userscript-chatgpt.js` 10.5.0 uses a verified value first, then its own built-in lookup, then the unverified seed. Versionium: 0.39.248 `vtm-eebbc621`, 0.39.249 `vtm-a91834dc`.

## An agent's "hey nexus" is answered once, as a job (3.11.1, v0.39.252)

James: *"is supposed to be injected into the chat like a job. it is for the agents to talk to nexus. not me."* / *"its not voice assistance. its for the agents to talk to nexus through clearglass."*

A wake is the **agent** asking NEXUS something: the agent hint (`lib/wake-hint.js`) tells the model it may start a line with `hey nexus,`. The answer has to reach the agent as its next turn.

**Before.** Three places answered one wake, and none completed the job.
- **The page.** `userscript-nexus-wake.js` `checkMessage()`, called on every mutation of a streaming reply, matched the first fragment (`hey nexus, w`). It asked co-pilot "w", drew an overlay for the person, and typed the answer into the composer without sending it.
- **Clear Glass's relay.** Cortex's `/api/meta/observe` (posted when the reply first appears) matched the same fragment. `clear-glass/src/copilot/wake-relay.js` answered it again as a `/wake-reply` job, which queued behind the unfinished reply and was never typed.
- **`lib/wake-loop.js`.** The right design, but it ran for mesh jobs only.

**Now.** `lib/wake-loop.js` is the one answerer, for every transport.

| step | what happens |
|---|---|
| trigger | `guardian.job.complete` — the **completed** reply (`job.responseText`), never a streaming fragment |
| match | a line that starts with the wake phrase (fences and `>` quotes ignored), its paragraph parsed by `lib/agent-chat.parseWake` |
| guard | once per job; depth cap `GUARDIAN_WAKE_MAX_DEPTH` (3); a copilot failure resends nothing |
| answer | co-pilot `POST :3750/api/prompt/tools` (the tool loop — live data) |
| reply | a `wake-reply` job for the same agent/account: pinned to the userscript tab (`transport: 'ncp'`) unless the asking job was mesh-delivered; typed **and sent** like any job; prompt `[NEXUS] answer to your "hey nexus, <ask>"` + the answer |

`checkMessage()` only reports whether a message addresses NEXUS (nexus-wake 1.1.0). The relay returns on `role: 'assistant'`. Cortex still records every wake (`nexus_wake_events`, the REPL).

**Depends on reply detection.** A wake is answered when its job completes; on ChatGPT that needs the reply detected (the open break — 0.39.251's element picker is how it is fixed). A wake in a chat that was not a guardian job has no completion and is not answered here.

Tests: `test-guardian-wake` 16/16 (WK-012, WK-017, WK-018 new/rewritten), `test-nexus-wake` NW-027 / NW-030 rewritten; each fix mutation-checked.

## Every provider chat, logged as one versioned transcript (3.12.0, v0.39.254)

James: *"we were working on getting the download manager logging agent chats"*, then *"… and the userscripts for my browser. i want nexus to help remember. persistent memory for ai agents."*

**Before.** A chat was recorded only when a job **completed** (ncp-handler → response-sink / code-artifact). ChatGPT jobs do not complete while its reply goes undetected, and a chat James opens by hand is never a job. The page's full-chat reader (`_nexusGetFullChat`, used by `GUARDIAN_SYNC_REQUEST`) never depended on reply detection, but its answer went only to the `/sync` caller. `userscript-chatgpt`'s `chatId()` also stopped at the colon of `/c/WEB:<uuid>`, so every ChatGPT chat read as `WEB`.

**Now.** `lib/chat-transcripts.js` is the one writer.

| step | what happens |
|---|---|
| page | each provider userscript watches `<main>` (not `<body>`: its own panel lives there). When the chat has been quiet 5 s (or after 60 s at most) and the transcript changed, it sends `GUARDIAN_TRANSCRIPT` to `/result`. It is marked sent only once guardian answers, so a closed guardian means "sent later", not lost. |
| also | every `GUARDIAN_SYNC_RESULT` (any `/sync` pull) is recorded; sync results now carry `agentId`. |
| handler | ncp-handler only puts them on the bus: `guardian.ncp.transcript` / `guardian.ncp.sync_result`. |
| whose | the tab's agent stamp → else the job that ran in that chat (`guardian.job.progress` carries its `chatUrl`; the job carries `agentId`) → else what the chat was already filed under → none = James's own chat. |
| write | Clear Glass `artifact-chat-index.recordChat()`: one versioned record per chat; unchanged / contained-in-latest refused by name (Clear Glass atlas 3.15.0). Emits `guardian.chat.transcript.recorded`. |
| recall | `GET /api/chats` (`?agentId ?provider ?q=` text recall `?limit`), `/api/chats/versions?key=provider:chatId`, `/api/chats/item/:id`. What an agent, co-pilot or idearium reads to remember. |

Userscripts: chatgpt / claude 10.6.0, gemini / perplexity / deepseek 10.5.0 (`userscripts.yaml` synced; it had drifted to 10.1–10.2 and 1.0.0).

**Limits, as they stand.** gemini / perplexity / deepseek's readers return the last reply only (`partial: true`), so each of their versions is one reply. userscript-claude's reader uses `human-turn-content` / `assistant-turn-content` / `.font-claude-message`, which has not been checked against today's claude.ai.

Tests: `test-chat-transcripts` 20/20 (the real ncp-handler → bus → writer → index, the routes, the server wiring, every userscript, chatgpt `chatId`). TX-20 runs `tests/probe/transcript-push-chromium.py` 9/9 in real Chromium. 11 mutations, each caught by its own test.


## A job completes from its chat transcript; repo jobs wear their repo hat (3.13.0, v0.39.255)

James, after 0.39.254 worked live: *"the hat should be repo specific not builder. the agent tab, in idearium is looking for the hash"*

**What the live run showed.**
- **The reply was captured but the job never completed.** The ERAVOS agent's reply was in its chat transcript 12 s after dispatch, but job `cccaafb0` never completed (ChatGPT reply detection is still the open break). The Agent tab waits for a `.response` with that `job_id`, which is written only on completion, so it sat at "thinking…".
- **The next job never went out.** `test` (`0c005d0b`) waited behind the stuck job in the one-job-per-tab pool.
- **The chat was filed "(your chat)".** The job reported chat `/c/WEB:c5f7a5cc…`, but the transcript came from `/c/6ab7275b…`. `WEB:` is ChatGPT's temporary id, so matching by URL cannot work.
- **The job wore `[hat: the_builder]`,** guessed from the prompt's words. It was typed above the repo hat that idearium had already put in the prompt.

**Now.**

| step | what happens |
|---|---|
| match | `chat-transcripts.matchJobs`: a user turn belongs to a job when it contains the job's whole prompt, whitespace-normalized; for prompts over 450 characters, its first 300 and last 150. The prompt is typed verbatim between the tools preamble / hat line and the agent hint. Prompts under 8 characters are ignored. Only same-provider jobs from the last 6 h count. |
| file | the chat goes under the matched job's `agentId`, after the tab's own stamp |
| gate | only a **settled** push (a real quiet period, not the 60 s max-wait) from a page that says it is **not generating**. Otherwise the completion is logged as withheld, with the reason. |
| release | `GUARDIAN_JOB_DONE` goes to the tab first; it stops that job's watch, so the pool's next job is not refused |
| complete | `_handleNCPMessage({ type: 'GUARDIAN_COMPLETE', source: 'transcript' })`: the one completion path. It writes the `.response` with `job_id` + `agentId` (which the Agent tab's `findLate` adopts), fires `guardian.job.complete` (idearium, pool, wake loop), then emits `guardian.job.completed_from_transcript`. |
| guard | a late `GUARDIAN_ERROR` for a completed job is ignored, not turned into an error |
| hat | `jobs.js _repoJobHat`: agentId `repo-<uuid>` gets the repo hat (`repo_<slug>`, from `lib/repo-hat.js`), with an **empty** persona because the persona is already in the prompt. No `[the_builder]` line. Other jobs keep the suggested hat. |

Userscripts: chatgpt / claude 10.7.0, gemini / perplexity / deepseek 10.6.0. Each push carries `settled` and `generating`, and `GUARDIAN_JOB_DONE` stops only its own job.

**Depends on** each userscript's `_isGenerating()`. ChatGPT's includes `[class*="loading"]`. If that reads true on an idle page, completion is withheld (logged `generating`), which is the old behaviour rather than a wrong reply.

Tests: `test-chat-transcripts` 31/31, including an end-to-end run through the real handler to `lib/repo-agent findLate` and the Chromium probe 10/10. 12 mutations, each caught by its own test.

## Errors name their gate; replies stream live (3.14.0, v0.39.256)

James: *"supposed to stream it live as it happens. do you think a delay between gates would help? like even just 500 ms?"* / *"can we make the error specific to the gate? not just a generic error?"*

**A delay between gates would not help.** The gates are sequential checks, and none of them races another. Nothing streamed because the reply watch only sends chunks once it finds the reply node, and on ChatGPT it was watching the composer (`… composer-parent.flex … 0ch`). The relay behind it (`guardian.job.chunk` → `/events` → idearium → Agent tab) already worked.

**Streaming.** Every provider userscript now reads the reply from the chat transcript every **500 ms** while it holds a job, and sends `GUARDIAN_CHUNK { text: delta, full, reset, source: 'transcript' }`.
- It is the assistant turn right after the job's own user turn, found by the prompt's head, so an earlier answer is never streamed as this job's.
- A re-render that is not a continuation is sent whole with `reset`.
- If the reply watch streams the job itself, the streamer stays quiet: one stream per job.

**Gates** (`lib/gate-trail.js`):

| # | gate | fails when | what the error says to do |
|---|---|---|---|
| 1 | create | the `.job` file cannot be written | check `guardian/data/jobs` |
| 2 | tab | no provider tab is free (`queued`) | open the provider in Clear Glass or your browser |
| 3 | ping | the tab does not answer (`ping_gate_failed`) | reload the tab |
| 4 | deliver | the socket is stale (`stale_socket`) | reload the tab |
| 5 | accept | the tab is mid-reply (`tab_busy`) | wait, or reload |
| 6 | submit | no composer or send button (`submit`) | pick them with ◎ |
| 7 | reply | no reply text read (`watch`, timeout) | pick the reply with ◎, or wait for the transcript |
| 8 | complete | — | — |

Each job carries `gates` (the trail) and `gate` (`describe()`: "stopped at gate 7/8 "reply appears" (chatgpt): … — …"). `GET /status/:jobId` serves both. `ask.js` failures and timeouts say the gate. A job the dispatcher marks `failed` now returns at once instead of after the caller's whole timeout. `guardian.job.gate` feeds the Agent tab.

Tests: `test-live-stream-and-gates` 13/13, plus Chromium 8/8. 13 mutations, each caught.

## Chats stream live, by mutation, not by polling (3.16.0, v0.39.278)

James: *"guardian is polling, but it shouldn't be, live streams the dom mutation live to the download manager, that way we don't lose progress. including you expanding elements for your thoughts."*

**What polled.** Each provider script re-checked every 5s whether the main element had been replaced, and while a job held the tab it read the whole chat every 500ms to stream GUARDIAN_CHUNKs. The transcript itself went out only after 5s without a change (or every 60s at most), so a reply in progress, a thinking block or a tab closed mid-answer was not kept.

**Now.** `guardian/userscript-chat-stream.js`, a shared prelude loaded like `guardian/userscript-nexus-wake.js`, attaches window.NexusChatStream. Each provider script calls start({ provider, read, generating }). Its MutationObserver on the chat coalesces a burst (150ms from the first mutation, so a long reply is sent as it grows), reads the chat with the provider's own reader, and sends only what changed since Clear Glass last **acknowledged** to POST :7702/cli/downloads/ledger (Clear Glass atlas 3.19.0). A failed send is not marked sent: it retries with backoff and the next change carries everything since the last ack; pagehide sends what is pending. Collapsed "Thought process" / "Thought for …" toggles are opened once each, and the Claude and ChatGPT readers keep that text in thinking, apart from the reply. The prelude uses no interval.

In the five provider scripts, the re-attach is a MutationObserver on the page body, and the job stream reads on the transcript's own mutations (_txStreamKick, 150ms coalescing). The settled transcript (GUARDIAN_TRANSCRIPT, 3.12.0) and job completion from it (3.13.0) are unchanged. Heartbeats and the status and navigation checks are connection keepalive, not chat reads, and stay as they were.

**Limits.** Gemini, Perplexity and DeepSeek have no verified human-turn selector, so their ledger holds the newest reply as turn 0 (each version is still a line in the file). The thinking toggles are found by their label, which is not checked against the live claude.ai or chatgpt.com DOM here. Tampermonkey installs have no prelude, so they keep the settled transcript only.

## Gemini and DeepSeek read the whole conversation; "hey nexus" is answered from any chat (3.17.0, v0.39.279)

James: *"can you fix gemini and deepseek"* and *"i want the agents to be able to use hey nexus, its detected but the response from nexus isnt injected as a job."*

**Gemini and DeepSeek.** Until now both readers returned only the newest reply, as turn 0. `guardian/userscript-gemini.js` now reads the page's user-query and model-response turns (AI Studio: ms-chat-turn), in page order, with the thinking in model-thoughts kept apart from the reply. `guardian/userscript-deepseek.js` reads every .ds-message: a reply is the one carrying .ds-markdown outside the thinking block, and the thinking is .ds-think-content. A page with no turns falls back to the newest reply, marked partial, exactly as before. DeepSeek's chat id is now the session id from the /a/chat/s/ path rather than the whole path. These selectors are built to the pages' known shapes and proven on pages of those shapes (`tests/probe/gemini-deepseek-reader-chromium.js` 11/11); they have not been checked against the live sites from here.

**"hey nexus" from any chat.** The wake loop answered a wake only when it was in the reply to a guardian job that completed. An agent talking in a chat no job owns (a conversation James opened, or a reply the job path never completed) had its wake detected by the page and answered by nothing. `guardian/lib/wake-loop.js` now also reads each settled transcript. When the newest turn is the agent's and starts a line with a wake, it is answered as a wake-reply job typed into that same chat (the job carries chatUrl, and `guardian/lib/dispatcher.js` resumes that chat). This happens once per turn and never while the reply is still streaming. The depth cap counts the run of NEXUS answers the agent was just sent. When both paths see the same wake, each path defers once to the other, so it is answered once. Repo agents now get a one-line wake hint in their prompt blocks. Tests: `tests/modules/test-guardian-wake.js` 21/21.

## The provider login wall (v0.39.280)

James: *"chatgpt had a login prompt, hoping we can automate if that happens."* The shared chat-stream prelude (`guardian/userscript-chat-stream.js`, 1.1.0) watches each provider tab's sign-in state. A dismissible nag (ChatGPT's "Stay logged out") is closed automatically. A real login wall (sign-in buttons or a login form and no composer) is reported to guardian (POST /api/provider/login); guardian keeps it (`guardian/lib/provider-login.js`), says it on the bus and to every connected client, and a job waiting for that provider says it needs a sign-in instead of timing out as an empty reply. NEXUS never types a password. Test: `tests/probe/login-wall-chromium.js`.

## The provider economy at dispatch (v0.39.281)

James: *"What if we have economy tags for each provider … extensive configurable options … I got soft signed out of ChatGPT."* The map is `docs/2026-09-29-provider-economy-phasemap.spec` (EC0–EC11).

**What it is.** Every provider has a tier: local, free, subscription or metered. Each has limits (jobs per hour, jobs per day, tokens per day, concurrent jobs, the least gap between two jobs), quiet hours, and what to do at a limit: wait, stop, or go to a fallback provider you name. Each job type (build, chat, plan, manage, heal, wake, automation) says which tiers may take it. The rules live in `lib/economy/` (`policy.js`, `gate.js`, `store.js`, which saves `policy.json` and keeps `policy.prev.json`).

**At dispatch** (`guardian/lib/economy-guard.js`, called by `guardian/lib/dispatcher.js` before a job joins the pool):
- **Allow.** The job is dispatched.
- **Wait.** The job stays queued, its queue reason says why ("economy: …"), and it is sent when the wait ends. Event: `guardian.economy.wait`.
- **Stop.** The job fails with the reason.
- **Fallback.** The job moves to the provider you configured, the job record says so (`economyFallback`), and it is checked again. Event: `guardian.economy.fallback`.

A provider someone chose is never swapped silently.

**What is recorded.** Every outcome (ok, truncated, failed, timeout, sign-in wall) is one line in `<data>/economy/usage-YYYY-MM-DD.jsonl`, with provider, job type, job id, estimated tokens in and out, time taken and model. `lib/economy/ledger.js` is the only writer. From that record:
- **Token limits** (`lib/economy/tokens.js`) are learned per provider: the largest input that came back whole, the smallest that did not, and a safe limit below it. Each is an estimate (`estimate-v1`) and says how many records it rests on.
- **The router** (`lib/economy/router.js`) scores providers by how often they succeed, their cost and their speed.

**Routes:** GET and POST `/api/economy` (the policy), GET `/api/economy/usage`, `/api/economy/limits` and `/api/economy/routing`.

**Not built, on purpose:** anything that makes automated provider chats look like a person typing (forced human timing, a mandatory randomizer, decoy questions). The limits and quiet hours are the answer to sign-outs: automated load on a browser account stays bounded and visible.

Tests: `tests/modules/test-economy-guardian.test.js` (the real dispatcher), `tests/modules/test-economy.test.js`.

## 0.39.282 — guardian 3.19.1

Crash-restart fixed: the provider sign-in route (`guardian/server.js`), which every provider tab calls, and the economy routes called json(), which was never defined. json() is now defined beside bodyJ, and the dispatcher treats only an explicit false from the extended routes as "no route". Before, async routes answered 404 first and then crashed. A job's reply is recorded: the job.complete event from `guardian/lib/response-sink.js` now carries the text and the chat url, where before the log said "0ch · chat=(none reported)". The ledger, boot and CFR directories follow the data root. The queue of downloads that Clear Glass could not take sits beside the response nodes (in production that is `guardian/data`; in a test, inside that test's own sandbox). `tests/modules/test-guardian-json-routes.test.js` boots the real server and calls every one of these routes.
