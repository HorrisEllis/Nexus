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
