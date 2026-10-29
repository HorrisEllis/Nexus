# NEXUS 0.39.244 — repo jobs reach their own tab; the Agent tab shows the provider tab live

**Date:** 2026-09-25 · guardian 3.9.4 → 3.9.5 (userscripts: chatgpt, gemini, perplexity, deepseek 10.4.0 · claude 10.5.0) · copilot 3.5.0 → 3.5.1 · idearium 4.3.0 → 4.3.1

James, with a screenshot of the Agent tab showing "you: hello" and then, at once, "agent — failed · guardian unavailable or returned no real response":
- *"it immedietly failed, the cli in the agents tab in idearium."*
- *"the cli in the agents tab needs to have a live feed of the dom mutation/node anchor"*

## 1. Why "hello" failed instantly
The request path is: Agent tab → idearium `repo-agent` (`agentId repo-<uuid>`) → copilot `backend:'guardian'` → guardian → **that repo's own provider tab**. Guardian's dispatcher opens that tab itself: `lib/dispatcher.js` `_awaitAgentTab` waits up to 60 s, then falls back to the shared tab.

Two checks upstream of the dispatcher refused the job first, because the *shared* chatgpt tab wasn't connected:
- **copilot/lifeline.js `_tryGuardian`** asked guardian's `/providers`. If `chatgpt` wasn't listed as connected, it returned a bare `null`. The job was never created, and no reason was passed on.
- **guardian/ask.js** failed fast on the same condition.

copilot then turned the `null` into its generic "guardian unavailable or returned no real response".

**Fixed:**
- **Pre-check skipped for repo jobs.** Neither check runs for a job that carries `agentId`. Guardian decides with real evidence (the tab opening, or the fallback).
- **The reason reaches the tab.** `_tryGuardian` returns `{ ok:false, error, jobId }`: guardian's own reason, the pre-check's evidence, or the exception text. Every caller already treated `!result || !result.ok` as failure.
- **copilot's 502 carries `jobId`.** idearium now knows whether guardian created a job.
- **`awaitLate` needs a real job.** `repo-agent` sets it only when a job exists (or when idearium's own wait timed out), and carries the `jobId`. `findLate` then matches exactly by job.

**Also fixed (my 0.39.241 bug):**
- The Agent tab's `api()` throws on `ok:false`, and it was throwing the response body away, `awaitLate` included. So on a real failure the late-reply watch never started. My test had stubbed `api()` and missed it.
- The error now keeps the body (`e.data`), and `agentSend` uses it.

## 2. The live feed
The pieces already existed: the userscript's MutationObserver, its `GUARDIAN_CHUNK` stream, guardian's `/events`, idearium's `guardian-stream.cjs`, and the tab's SSE connection. The gaps were:
- **guardian's `/events` sent no payload.** Every frame was `{seq,type,ts,claimed}`. So idearium's "live `guardian.job.complete/.error` subscription" read `ev.data.jobId`, got `undefined`, and never did anything; only its boot sweep ever resolved chunks.
  - **Fixed:** `_feedFrame` gives each `guardian.job.*` frame a compact payload and adds the job's `agentId`, looked up once at this choke point instead of at 30 emit sites.
  - A chunk frame carries the delta plus the running length (`fullLen`), never the whole reply again.
- **No node anchor.** The page never said which node it was reading.
  - **Fixed:** each of the five provider userscripts (chatgpt, claude, gemini, perplexity, deepseek) now has `_nexusAnchor(el)`: a short CSS path plus `data-message-id`, `data-message-author-role`, `data-testid` and `data-is-streaming`, with child count and text length.
  - It rides on every `GUARDIAN_CHUNK` and on `reply-started`, together with the mutation count.
  - A `dom` progress pulse goes out at most once a second while the page is mutating, with `generating`.
  - The counters reset per job. `ncp-handler.js` passes these fields through.
- **idearium relays them.** `guardian-stream` `onFeed` takes `guardian.job.*` frames whose `agentId` is `repo-…` and passes them to `os.broadcast('idearium.repo.agent.feed', …)`. That's a new SSE-only broadcast: not ledgered, not on the SISO stream, because these are several-per-second observations, not state.
- **The Agent tab shows them.** A "live · provider tab" panel sits above the CLI. It shows:
  - generating or idle, the job, the provider, the mutation count and the reply length
  - the anchor path and attributes
  - a stage log: queued (awaiting agent tab), dispatched, submitted, reply-started, fallback, complete, error
  - the reply text streaming in
  - It is painted in place on each frame, never by re-rendering the tab.
  - `dom` pulses update the header without adding log rows.
  - Feed frames skip the global event log.

## Proof
- **`test-agent-feed` 19/19** (new):
  - **The instant failure**, against a stub guardian whose `/providers` says chatgpt is down:
    - an `agentId` job is dispatched and answered
    - without `agentId` it's refused, with the reason
    - guardian's own reason and `jobId` travel up
    - copilot's 502 carries `jobId`
    - guardian `askSync` creates the `agentId` job despite the shared tab
  - **The feed:**
    - `_feedFrame` (verbatim from `server.js`) adds `agentId`, keeps chunks compact, and leaves non-job events alone
    - `ncp-handler` passes the anchor through
    - `guardian-stream` against a stub `/events` relays only repo-agent job frames
    - idearium wires it SSE-only
    - the tab's feed code (verbatim from `app.js`) keeps the anchor and mutations from pulses without log rows, streams the text, and resets on a new job
    - each of the five userscripts: `_nexusAnchor` run in jsdom produces `main#m > div.thread.x > article.turn:nth-of-type(2) > div.markdown.prose` with the message attributes; the chunk, `reply-started`, the throttled pulse and the reset are wired
- **Mutation checks:** each of the following was put back in turn:
  - the lifeline shared-tab pre-check: AF-01 to AF-03 fail
  - guardian's fail-fast: AF-05 fails
- **`test-repo-agent-late` 17/17**, including two new cases:
  - LR-01b: a refusal with no job doesn't wait, and its reason reaches the tab
  - LR-07b: with a `jobId` the match is exact
  - The watcher is proven to query by `jobId`, and the tab keeps the refusal body.
- **Updated to new contracts:**
  - `test-guardian-job-correlation` 120: its sandbox stubs the anchor helper
  - `test-lifeline-guardian-timeout` 5: a timeout is now `{ ok:false, error }`, not `null`
- **Full `run-all`, per suite, against 0.39.241:** nothing new fails. `copilot-provider-toggle` (19/20) and `lifeline-fluid-routing` (4/6) fail identically on 0.39.240.

## What you'll see
- **"hello" with the shared chatgpt tab down:**
  - the feed shows `queued awaiting_agent_tab`, then `dispatched`, `progress:submitted`, the anchor and the mutation count climbing, and the text streaming in
  - if the repo's tab can't open, `agent_tab_fallback` with guardian's reason
- **If it still fails,** the transcript line now says why, in guardian's words.
- **If copilot stops waiting but guardian's job lives,** the line becomes "copilot stopped waiting — watching the Responses index", and the reply is adopted when it lands.

## Needs a reload
Clear Glass loads guardian's userscripts into provider tabs. Tabs already open keep the old script until they reload; a restart of `start:all` covers it.
