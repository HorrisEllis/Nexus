# NEXUS 0.39.259: turns 2 and 3 of a conversation now complete, and each agent keeps its chat

**Date:** 2026-09-26 · userscripts chatgpt/claude 10.9.0 → 10.10.0, gemini/perplexity/deepseek 10.8.0 → 10.8.1 · chat-transcripts 1.1.0 → 1.2.0

James, live on 0.39.258:

> *"not great at jobs that persist. only works once. like conversations need back and forth, also persistent chaturl"*

Three turns went into one repo agent's ChatGPT chat:

| Turn | What the log showed | Result |
|---|---|---|
| 1 `hello` | completed from the transcript (192 chars) | worked |
| 2 `give me some code to test.` | `job complete: 58ae1d03 · unknown · 0ch · 0s`, 1.5 s after submit | empty reply |
| 3 `okay just write some.` | `job created` and then nothing: never `dispatched`; copilot timed out at 90 s | stuck |

These were three separate breaks. Each is described below.

## Fixed: turn 3 was never sent (the tab's slot was never released)

- **Cause:**
  - The pool allows one job at a time per browser provider (`dispatch-pool.js`, cap 1).
  - A slot is freed by `dispatch-pool-bridge.js` when `guardian.job.complete` names a `provider`.
  - A userscript's `GUARDIAN_COMPLETE` body has no `provider` field, because `ncpPost` adds only `chatUrl` and `account`.
  - `ncp-handler.js` passed the missing value on, so the completion event carried `provider: undefined`. That is the `unknown` in the log.
  - The bridge dropped the event as malformed and the slot stayed held. Every later job waited behind it.
- **Why turn 1 worked:** turn 1 was completed by the transcript path. That path passes `job.provider` explicitly.
- **Fix:**
  - `ncp-handler.js` resolves `provider` as `msg.provider`, or the job's own provider when the message has none.
  - As a second guard, the bridge releases by job id when no provider is named. The new `pool.providerOf(jobId)` records which provider's slot a job holds.

## Fixed: turn 2 completed empty

- **Cause:**
  - In an existing chat, ChatGPT renders the new assistant turn empty for a moment.
  - The reply watch compared `'' === ''` three times, and `_isGenerating()` did not see ChatGPT's current streaming state. The watch called the empty turn stable and completed the job with 0 characters.
  - The real reply reached the transcript 10 s later (`v2 · 4 messages`). By then the job was already `complete`, so the transcript path skipped it.
  - The Agent tab showed `job completed but carried no response text`.
- **Fix, page side (all five userscripts):**
  - An empty turn is never a stable reply.
  - ChatGPT and Claude also count the composer's stop button as "still answering".
- **Fix, guardian side (`ncp-handler.js`):**
  - An empty `GUARDIAN_COMPLETE` from a tab is withheld. The job goes to `awaiting_transcript`, and the next settled transcript completes it with the real text.
  - The wait is bounded by `GUARDIAN_EMPTY_REPLY_GRACE_MS` (default 120 s). If no transcript carries a reply in that time, the job fails loudly with `gate: empty_reply` and the slot is freed.

## Fixed: the first job of a new chat lost its reply watch

- ChatGPT moves a new chat from `/` to `/c/WEB:<tmp>` and then to `/c/<id>`. Claude moves from `/new` to `/chat/<id>`.
- The navigation poll stopped the watch on every path change. So the first job of every new chat depended on the transcript alone.
- A chat that is still getting its URL is now treated as the same conversation. The watch is stopped only when the tab leaves a real chat for another one.

## Built: persistent chat URL, one conversation per agent

- **Remembering the chat:** `chat-transcripts.js` records the chat each agent (`agentId`) was last talking in, per provider (`chatFor(job)`). It learns this from:
  - the job's own progress reports;
  - its transcripts;
  - after a restart, the newest transcript filed under that agent in the Clear Glass downloads index, which is on disk.
- **Which chats are resumable:** only a real, permanent chat can be resumed:
  - ChatGPT `/c/<id>`, but never `/c/WEB:<tmp>`;
  - Claude `/chat/<id>`.
  - Other providers are not resumed, because their URL shapes are not verified. They behave as before.
- **Sending the chat with the job:** `dispatcher.js` sends `resumeChatUrl` with the job, and the log line names it: `dispatched … · chat https://chatgpt.com/c/…`.
- **In the tab (chatgpt and claude userscripts):** when the tab is anywhere else, it:
  1. puts the job in `sessionStorage`;
  2. tells guardian (`resuming-chat`);
  3. opens the chat;
  4. after the load, waits for the chat's earlier turns to render;
  5. runs the job there (`resumed-chat`).
- **Limits:** the carried job is used once and expires after 2 minutes. If the chat no longer exists, the job runs in whatever chat the page opened (`resume-chat-missing`). The agent's memory then moves to that new chat.
- **No double send:** the reload disconnects the tab on purpose. For `GUARDIAN_RESUME_GRACE_MS` (default 60 s), the dispatcher does not treat that disconnect as a dead tab, so the prompt is not requeued and sent twice.
- **Switch:** `GUARDIAN_RESUME_CHAT=0` turns this off, and jobs run wherever the tab is, as before.

## Tests

- **New:** `tests/modules/test-back-and-forth.test.js`, 18 tests, all passing.
  - It replays the live sequence through the real handler, the real pool, the real release bridge and the real transcript path.
  - It runs the userscripts' own resume code against a fake page.
  - 11 of the 18 fail on 0.39.258. BF-002 is the "turn 3 never dispatched" stall itself.
- **Still passing:** `test-chat-transcripts`, `test-live-stream-and-gates`, `test-one-tab-e2e`, `test-ncp-handler-sr3`, `test-composed-prompt` and `test-guardian-dispatch-ladder`. The pinned userscript versions were updated.

## Not verified here

- There was no live ChatGPT or Claude session, and Playwright is not installed, as TX-20 and GS-20 already note. The stop-button selectors are:
  - ChatGPT: `button[data-testid="stop-button"]`, `aria-label="Stop streaming"`;
  - Claude: `aria-label="Stop response"`.
- These are the current public markup, not read from a live page. The guardian-side empty-reply guard covers a missed selector either way.
- The post-boot vitals failure ("copilot's /api/prompt never passed the caller's chosen provider through to lifeline.route()") is a separate, pre-existing regression and is not touched here.
