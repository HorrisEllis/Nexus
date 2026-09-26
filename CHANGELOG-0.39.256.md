# NEXUS 0.39.256: replies stream live; every failure names its gate

**Date:** 2026-09-26 · guardian 3.13.0 → 3.14.0 · idearium 4.6.0 → 4.6.1 · userscripts chatgpt/claude 10.8.0, gemini/perplexity/deepseek 10.7.0 · Versionium `vtm-d2b95239` (parent `vtm-5d53363c`, 0.39.255) · git `b6df2be`

James: *"supposed to stream it live as it happens. do you think a delay between gates wouold help? like even just 500 ms?"* / *"can we make the error specific to the gate? not just a generic error?"* The rest of that request (full tool scope, which he chose as "everything, at least for now"; /help; debugging via the intelligence system; COS/RAID for Run; context and the graph; learning) comes in 0.39.257–258.

## Answered first: a delay between gates
It would not help. The dispatch gates are sequential checks, and none races another, so a sleep between them only adds latency to every job. Nothing streamed for a different reason: the reply watch sends chunks only once it finds the reply node, and on ChatGPT it was watching the composer (the Agent tab showed `anchor div#thread > div.composer-parent.flex … 0ch`). The relay behind it was already in place, end to end. **The 500 ms went where it helps:** it is the rate at which the reply is read and sent.

## Changed
- **Streaming (all five userscripts).** While a tab holds a job, the transcript reader (`_nexusGetFullChat`) finds that job's reply every **500 ms** and sends `GUARDIAN_CHUNK { text: delta, full, reset, source: 'transcript', generating }`.
  - The reply is the assistant turn right after the job's own user turn, found by the prompt's head. An earlier answer, or a turn James typed himself, is never streamed as the job's.
  - A re-render that is not a continuation is sent whole with `reset`.
  - If the watch streams the job itself, the streamer stays quiet.
- **`guardian/lib/gate-trail.js`** records one trail per job through eight gates: create, tab, ping, deliver, accept, submit, reply, complete.
  - **How it is built:** from the bus. A later gate passing implies the earlier ones, and the latest news says where the job is, so a requeue puts it back.
  - **What it says:** one sentence with the gate, the detail and what to do, for example *stopped at gate 7/8 "reply appears" (chatgpt): no completion after 900s — no reply was read — pick the reply with ◎, or wait: the chat transcript completes the job when the chat settles*.
  - **Where it appears:** `GET /status/:jobId` carries `gate`, `gates` and `error`. `guardian.job.gate` frames feed the Agent tab.
- **`guardian/ask.js`:**
  - Failures and timeouts carry the gate and say it. Timeouts still begin "timed out", which repo-agent's late watch keys on.
  - A job the dispatcher marks `failed` (retries exhausted) returns at once. It was never recognised before, so callers waited out their whole timeout.
- **`ncp-handler` / feed:**
  - `guardian.job.chunk` carries `reset`, `source` and `generating`.
  - A reset chunk keeps its live end (the last 8000 chars).
  - The feed carries gate fields.
- **Idearium Agent tab:**
  - The reply streams into the live box, and a reset replaces it.
  - Gate rows appear, in red when failed, and the header shows the current gate.

## Tests
- **`test-live-stream-and-gates` 13/13 (new):**
  - The reducer on the live `cccaafb0` case, every gate name, a requeue, and `attach` on a SISOStream-shaped bus.
  - `ask.js` through injected deps, the real `ncp-handler` chunk fields, and the Agent tab feed run from `app.js`.
  - GS-20, `tests/probe/live-stream-chromium.py`: 8/8 in real Chromium. 16 changes produce 4 chunks whose deltas add up to the reply; reset; it yields to the watch; it stops with the job; the next job streams its own reply.
- **Mutation checks:** 13 mutations, each caught by its own test.
- **Regression:** chat-transcripts 31, agent-feed 19 (AF-09 updated for the added chunk fields), ask-tools-shape 3, mco04 1, ncp-handler-sr3 7, job-correlation 120, job-persistence 15, guardian-wake 16, userscript parity 12, mixed-content 21, repo-agent-late 17, repo-agent-provider 60, selector-map 15, version-sync 30, record-discipline 9.
- **Pre-existing, identical at HEAD:** lifeline-fluid-routing T-004/T-005, nexus-wake NW-020/033/034, test-sandbox (test-one-tab-e2e).
- **`data/`:**
  - The new suite writes nothing.
  - `lifeline-fluid-routing` writes `copilot/data/nodes/injection/*` and `data/copilot/chat_log.buffer.jsonl`, and sr3 and the response suites write their known set. All of it was restored.
  - A restore script of mine also removed 24 empty directories that the upload ships (`data/guardian/input/` and others). They were recreated, and the tree was checked against the upload's directory list. Nothing that was already delivered was affected, because the overlays carry files only.

## Not done / known
- **Not proven live.** Expect the Agent tab's live box to fill while ChatGPT writes, with a gate row at each step.
- **Still to come:** 0.39.257 — every tool, enforced and listed (`/help`, `/tools`), debugging through the intelligence system, and the graph in context. 0.39.258 — learning, and COS/RAID for Run.
