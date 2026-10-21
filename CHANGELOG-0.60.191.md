# 0.60.191 — 2026-10-21 — What you watched being written is kept: the stream as a fallback route

James, 2026-10-21: "each system will use its own component registry." · "im saying to use those as fallback routes. node anchor, dom
mutator. I love the way idearium tabs are and way it shows me whats being said from the agents in real time."

The idea and both calls are yours. The coder's part: finding where the stream was lost, and keeping it.

## The stream as a fallback route
- **What was there.** Your 0.39.244 feed ("a live feed of the dom mutation/node anchor") streams each reply from the userscript. Every
  chunk carries the reply's full text so far and its node anchor, which is where in the page the reply was read. That's what Idearium's
  tabs show you live.
- **What was lost.** Guardian broadcast each chunk and kept only a timestamp, plus batches cut to 2,000 characters for cortex. If a job's
  "complete" never arrived (a reload, a missed capture), the reply you had watched being written was gone. The recovery chain checked the
  job, the `.response` node and the chat transcript, never the stream.
- **What's built:**
  - **Kept.** Each chunk now keeps the reply so far, with its node anchor, in the job's own `.response` node, marked `partial`. It writes
    at most every 1.5 s or 400 new characters, and never over a complete answer.
  - **Ended.** The DOM mutator's once-a-second pulse reports when the page stops generating. When it does, and the stream has been quiet
    for 3 s, the node is marked ended.
  - **Read before a re-send.** Before Guardian retypes your prompt, it now checks, in order: the job's own answer, the complete
    `.response` node, the chat transcript, then the ended stream. A job then finishes from what its node anchor showed, instead of being
    sent twice.
  - **Still re-sent when it should be.** A stream that is still open never blocks a re-send.
  - **Reported.** `synthesize()` returns the stream as `partial`, with the anchor it was read from.
- **No new phase.** This is Guardian's retry phase R1, invariant I1: "a retry never re-sends a job whose answer is already on disk",
  extended to the stream.

## Each system uses its own component registry
- **Recorded as your decision** on the spine map. It sharpens IN3, which I had read as one registry. The shape stays shared; each
  system owns its own.
- **It agrees with what's partly built.** DB9 already generates a registry per system (`registryOf(system)`).
- **Order unchanged.** It's built when the spine is, after Idearium is solid.

## Your Idearium tabs
Recorded as the style the BrainOS rebuild follows: the Flow view draws in the same tabs, with the same live feed.

## Measured
- `test-stream-fallback` 4/4, including the real NCP handler receiving a chunk, then the "stopped generating" pulse.
- It caught one bug of mine before release: the first chunk was throttled away.
- **Neighbouring Guardian tests, red before this release and unchanged by it:**
  - `test-guardian-job-correlation` (2);
  - `test-options` (1);
  - `test-system-record-discipline` (1).

## Also: a tab that dies mid-reply
- **The gap.** A typed job that gets neither "complete" nor an error used to wait for the chat transcript, then fail with "pick the reply
  with ◎".
- **Now.** Before it fails, the dispatcher checks the same places answerFirst does (complete node, transcript, ended stream). If the reply
  you watched is there, the job completes from it. Your prompt is still never sent twice.
- **Wired in production.** `guardian/server.js:724-726` already passed answerFirst and completeWith to the dispatcher.
- **Proved.** `test-guardian-stack-sim` GS-04b; the file passes 13/13.

## Not done, said
- **Not run on your machine.** To check there: reload a Claude tab while it is answering. The job should complete from `stream`, and the
  activity log should say so. It should not re-send, and it should not fail with "pick the reply".
