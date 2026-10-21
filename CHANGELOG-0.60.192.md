# 0.60.192 — 2026-10-21 — Your download manager already kept the stream; now the fallback reads it

James, 2026-10-21: "look in clearglass download manager"

You were right. Your 0.39.278 idea already kept exactly what 0.60.191 rebuilt. Your words then: "use the download manager in clearglass for
the chat ledgers … live streams the dom mutation live to the download manager, that way we don't lose progress." The page's own DOM
mutator writes every chat, turn by turn, into an append-only ledger in Clear Glass's download manager, with "still generating" marked on
every line.

## What I got wrong in 0.60.191
I wrote a second copy of the stream into Guardian's `.response` nodes instead of reading your ledger. That's the drift your
reuse-before-build rule exists to stop. The copy is removed. It was a true duplicate, so removing it is allowed, and the removal is said
here. Both files I had changed are now byte-for-byte what they were before 0.60.191.

## What's built in its place
- **Guardian reads your ledger.** When a reply wasn't captured, Guardian replays the job's chat from your download manager, finds the
  job's prompt and takes the reply after it. It only takes it once the page has stopped generating, so a reply still being typed is never
  counted as an answer.
- **It reads through Clear Glass's own route** (`GET /cli/downloads/ledgers/:chatKey`), not by reaching into its code. One small client,
  `lib/chat-ledger-client.js`.
- **The dispatcher asks it in two places**, after the job's own answer, the `.response` node and the settled transcript have come up
  empty:
  - before re-sending a job, so a reply that's already in your ledger is used instead of typing your prompt again;
  - before failing a job whose tab died mid-reply, so it completes from what the page streamed instead of "pick the reply with ◎".

## Found on the way
- **The contract ledger couldn't read your chat ledger.** `lib/work-journal.js` (0.60.146) read it at port 7701, which is Clear Glass's
  live-events port. The ledger routes are on 7702.
- **Every read outside the tests failed.** Contract ledgers have been showing "chat-ledger (not read)" instead of the reply text.
- **Why the tests missed it.** They set the address themselves.
- **Fixed.** Both readers now use the one client, on the right port.

## Measured
- `test-stream-fallback` 4/4. It runs against Clear Glass's real `chat-ledger.js`, served on the same route paths the bridge uses:
  - the client and the port;
  - finding the job's reply in the ledger, and not taking a reply still being generated;
  - a dead tab's job completing from the ledger, and a re-send finding its answer, never typed twice;
  - the 0.60.191 copy being gone.
- **The neighbouring Guardian and work-journal tests are unchanged.** The four files that fail did so before this release:
  - `test-accounts-picker-cos` (4);
  - `test-guardian-job-correlation` (2);
  - `test-options` (1);
  - `test-system-record-discipline` (1).
- **The boundary check finds no new crossing between systems.**

## Not done, said
- **Not run on your machine.** To check there: reload a Claude tab while it is answering. The job should complete from `chat-ledger`, and
  your contract ledgers should now show the reply text where they said "chat-ledger (not read)".
