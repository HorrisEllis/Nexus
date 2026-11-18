# 0.60.562: a job's reply is its chat's settled .response; Claude is the last resort; Ollama builds

James, 2026-11-15: "use clearglasses download manager for .response nodes. the ledger also have it wait until the dom mutation stops."
Asked whether always or only when the page fails: "Always (Recommended)".
James, 2026-11-17: "needs to not be using claude unless absolutely necassary, then fallback to alternative accounts." · "no. pipeline
working. nothing less. ollama building it."

## Found (his machine, COS's Idearium build pipeline, read from Guardian's jobs, COS's log and the pages over Clear Glass's DevTools port)
- A job ended when its tab read the same text three times (~1 s); the settled `.response` (the chat after 5 s with no DOM change) almost
  never decided it. The live ledger called a turn "settled" the moment the stop button went.
- After the hold was built, his log: Gemini's 4 jobs ended from their `.response`, Claude's 4 each waited the full 90 s. Claude's page now
  marks turns `[data-testid="user-message"]` / `"assistant-message"`; the chat reader's four selectors matched none, so Claude's chat
  read empty, no transcript was pushed, no `.response` filed (and the ledger held nothing for Claude either).
- The build's ladder put Claude where the learned order chose; the planner and test writer took the first agent that was not Ollama.
  Claude's two accounts had no fallback order in Guardian (the chain was empty).
- Gemini failed twice "the tab still shows the previous answer after 180s": a promo callout's Angular backdrop covered the prompt box.
- The `landed` step gave up after its 6th ask with Idearium answering "still building … ask again" — the build alive.

## Changed
- `guardian/userscript-chat-stream.js`: settled = no DOM mutation for 5 s and not generating; a quiet timer sends the settled line.
- `guardian/lib/ncp-handler.js`, `server.js`, `options.js`: a tab saying done holds the job (`awaiting_response`, the page text kept);
  the settled transcript (source `response`) ends it; after `jobs.response_wait_ms` (90 s, 0 = off) the page text is taken and the job
  says so. `job.responseSource` on every completion. The stream says `stream`; answer-first's settled records count as `.response`.
  `chat-transcripts.js` ledger reads skip an unsettled chat; `job-retry.js`, `ask.js`, `dispatcher.js` count `awaiting_response` in flight.
- `guardian/userscript-claude.js`: the new turn selectors (old kept), nested matches read once, the "Claude responded:" label dropped.
- `guardian/userscript-gemini.js`: a backdrop over the prompt box is closed (a click on it, Angular's own dismissal) before typing.
- `lib/pipeline-routing.js` `routing.last_resort` (default `claude`) and `lastResort()`; `idearium/api/index.js` applies it before the
  planner is chosen, after the learned order, in chunk and brick orders, and the test writer tries Ollama before Claude.
- `idearium/pipelines/idearium-build.pipeline`: `landed` holds the run (onFail: hold) instead of failing a live build (COS caps retries at 5).
- `clear-glass/src/providers/account-switch.js`: a saved copy is never restored over the account's own live session (ChatGPT's login loop);
  a provider window on its sign-in page counts as signed out; a removed saved copy is snapshotted first.
- `cos/ui/cockpit/sections/config/section.js`: a `…_MODEL` setting is a picker of the system's own models, applied at once.
- `emerge/emerge/lang/his-grammar.yaml`: Emerge's 69 words listed for him to rename (parked by him: a schema for any grammar).
- Set on his machine (not in git): Claude's account chain in Guardian — "Claude — Account 2", then "Default — claude".

## Proof
- Tests: test-chat-ledger-stream CS-08, test-chat-transcripts TX-32, test-pipeline-routing PR-30 (each fails on the old code);
  provider-account-sync 11/11 (check 10 fails on the old code with the loop: "restored … from A"); neighbours unchanged
  (stream-fallback 4/4, sr3 10/10, back-and-forth 18/18; failures before and after: TX-19, TX-29, TX-20, CS-07, job-correlation 3).
- Live: Claude's transcript filed on reload (claude:746b7b33 v1 · 3 messages); a 12,004-character Claude reply ended from its `.response`.
- Live: run 74f98418 (N1) — route `ollama:…3b > gemini > claude`, Gemini planned, **Ollama's brick passed**, "landed clean" in 2 agent calls,
  12 min; held at evidence for his verdict. The landed code equals the file already on disk (N1 was built 2026-11-04): the run proves the
  route, not a new build. Its new test `tests/n1.test.js` passes 30/30 (run from a scratch copy); two proposals that would shrink
  `tests/modules/test-guardian-retry-novelty-installs.js` (307 → 246/244 lines, dropping its header with his words) are for him to reject.

## Not done (said)
- The test writer's new order and `landed`'s hold reach COS/Idearium at the next Idearium restart and COS pipeline sync.
- Clear Glass's account fix loads at its next restart; ChatGPT and DeepSeek are signed out (his sign-ins).
- Mapped, not built: one cookie jar like a normal browser (AC2); live outputs on the canvas (PC8); the pinned development tree (Emerge).
