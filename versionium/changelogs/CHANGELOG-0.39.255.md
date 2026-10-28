# NEXUS 0.39.255: the Agent tab gets its reply from the transcript, and repo jobs wear their repo hat

**Date:** 2026-09-26 · guardian 3.12.0 → 3.13.0 · userscripts chatgpt/claude 10.7.0, gemini/perplexity/deepseek 10.6.0 · Versionium `vtm-5d53363c` (parent `vtm-99a6abef`, 0.39.254) · git `868a9d2`

James, after 0.39.254 worked live: *"it worked. though the hat should be repo specific not builder. the agent tab, in idearium is looking for the hash"*

## What the live run showed (log + screenshots)
- **The reply was captured, but the job never completed.** The ERAVOS agent's reply was in its chat transcript at 02:01:11, 12 s after job `cccaafb0` was dispatched. The job never completed because reply detection is the open ChatGPT break. The Agent tab's late watch (`lib/repo-agent findLate`) waits for a `.response` with this `job_id`, which is written only on completion, so it stayed at "thinking…".
- **The next job never went out.** `test` (`0c005d0b`) was created and never dispatched: the one-job-per-tab pool waited for `cccaafb0`, and the tab would have refused it as `tab_busy`.
- **The chat was filed "(your chat)".** The job reported chat `/c/WEB:c5f7a5cc…`, but the transcript came from `/c/6ab7275b…`. `WEB:` is ChatGPT's temporary id, so no URL match can hold.
- **The job wore `[hat: the_builder]`.** `createJob` guessed a generic hat from the prompt's words, and the userscript typed "[the_builder] You build…" above the repo hat idearium had already put in the prompt.

## Changed
- **`guardian/lib/chat-transcripts.js` 1.1.0.**
  - **Matching:** a user turn belongs to a job when it contains the job's prompt (whitespace-normalized; for prompts over 450 characters, the first 300 and last 150). The chat is filed under that job's agent.
  - **Completion:** on a settled push (a real quiet period) from a page that says it is not generating, the matched job is completed from the next turn. The tab gets `GUARDIAN_JOB_DONE` first, then the job goes through the one `GUARDIAN_COMPLETE` path, so the Agent tab's `findLate` finds the reply and the pool moves on.
  - A withheld completion is logged with its reason.
- **`guardian/lib/ncp-handler.js`:** a late `GUARDIAN_ERROR` no longer turns a completed job into an error.
- **`guardian/lib/jobs.js`:** a repo job (`agentId` `repo-<uuid>`) wears its repo hat (`repo_<slug>`), with an empty persona because the persona is already in the prompt. It never gets `the_builder`. Other jobs are unchanged.
- **Userscripts:**
  - Each push carries `settled` and `generating`; both are in the signature, so a reply that stops generating is sent once more.
  - `GUARDIAN_JOB_DONE` stops only that job's watch.
- **`lib/chat-logger.js`:** honours the test sandbox. Every suite that reached guardian's completion path used to leave `data/chat-logs/*.jsonl` in the real tree.

## Tests
- **`test-chat-transcripts` 31/31:**
  - TX-21–TX-31 are new, including TX-22 (the exact live case).
  - TX-30 runs end to end: transcript → the REAL `ncp-handler` completion → `lib/repo-agent findLate` finds the reply.
  - TX-31 runs the real `createJob`, with jobs in a temp dir.
- **Chromium probe 10/10:** `settled: false` on the max-wait push; `generating` reported, then re-sent when it stops.
- **12 mutations,** each caught by its own test.
- **Sandbox rule:** `test-chat-transcripts` and `test-cg-selector-assign` now call `test-sandbox.ensure()` first. `test-test-sandbox` lists only `test-one-tab-e2e`, which is pre-existing and starts a real guardian.
- **Regression:**

  | suite | result |
  |---|---|
  | ncp-handler-sr3 | 7 |
  | guardian-job-correlation | 120 |
  | guardian-job-persistence | 15 |
  | replay-retired | 3 |
  | guardian-wake | 16 |
  | artifact-index-jaa | 9 |
  | downloads-responses | 15 |
  | response-downloads | 9 |
  | response-sink-passthrough | 9 |
  | code-artifact | 46 |
  | repo-agent-late | 17 |
  | library-ui | 41 |
  | userscript parity | 12 |
  | mixed-content | 21 |
  | cg-selector-assign | 10 |
  | chat-sync-routing | 8 |
  | repo-agent-provider | 60 |
  | selector-map | 15 |
  | version-sync | 30 |
  | record-discipline | 9 |
- **Pre-existing, identical at HEAD:** nexus-wake NW-020/033/034; vector-memory VM-002; test-sandbox (test-one-tab-e2e).
- **`data/`:**
  - The new suite writes nothing.
  - `test-ncp-handler-sr3` and the response suites still write `data/intake`, `data/ledger/guardian`, `guardian/data/nodes/response` and `downloads-pending`.
  - **`test-vector-memory-pipeline` deleted `data/vector-index/index.json`.** It was restored from the upload.
  - The tree was checksum-diffed back to its pre-run state. The only data writes are this release's Versionium record and its `event_log` line.

## Not done / known
- **Not proven live.** On the next repo-agent job, expect these guardian lines:
  - `[guardian/chat-transcripts] chatgpt:<id> v1 · 2 messages · repo-nexus-id-repo-af2180cf (push)`
  - then `job cccaafb0 completed from the transcript …`

  The Agent tab should show the reply, and the next job should dispatch.
- **If the log says `not taken yet (generating)` on an idle page,** ChatGPT's `_isGenerating()` selector (`[class*="loading"]`) is matching something else. That's a one-line selector fix, best made from a live DOM.
- **`test-vector-memory-pipeline` deletes the real vector index;** it needs the sandbox.
