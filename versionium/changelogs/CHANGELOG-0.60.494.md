# 0.60.494 — the tab's "no reply element" reads the DOM mutator's stream; his approval applied (PC8 expanded)

James, 2026-11-11, asked to approve scripts/tree-census.js and told ChatGPT's reply was not found on its page:
"Yeah. Why is it not hooked to the dom mutator"

## Why it was not
The DOM mutator's stream (Clear Glass's live chat ledger) was a fallback on two roads only (0.60.191/0.60.192,
`guardian/lib/dispatcher.js`): Guardian's own wait running out, and before a re-send. ChatGPT's failure took a third road: the tab itself
reported "no reply element found after 180s" (`GUARDIAN_ERROR`, gate watch). That road went to the retry and then failed without asking
the ledger.

## Fixed
`guardian/lib/ncp-handler.js` (with `guardian/server.js` passing it in): the tab's "no reply element" reads the chat ledger first. The
job's turn there, with the page no longer generating, completes the job. Nothing there: the error goes on as before.

## Also
- His approval applied: inject `35cf0043`, approvedBy him. `scripts/tree-census.js` is in the live tree.
- The pipeline's build step waits up to 240 s (it gave up at 30 s once, while Idearium was still starting the build).

## Proof
- test-ncp-handler-sr3 7/7. test-chat-ledger-stream 15/16 (CS-07, a real-page case; not looked into).
- Run `aaa327d9`: ready, covered, map, dag, graph, build, landed met in 36 s.

## Not done, said
- The ledger hook is **not proved on a live ChatGPT job**.
- Evidence refused: "no test can check it". IN0_baseline names no test and the test-first step was skipped (no planner ready). A phase
  nothing can check is his to accept or reject (GV_D2).
- `scripts/tree-census.js` loads and exports `measureTree` and `generateReportMarkdown`; its output was not checked.
- COS holds three copies of the build pipeline (two are the coder's imports). To tidy with him.
- Not yet in Versionium (§17.12).
