# 0.60.506 — the job ledger (JL1, JL2): every Guardian job joined to its .response node

James, 2026-10-30: "each job ... saved in the queue ... have it be the job ledger, each job has to have it's corrasponding .response node to
be fullfilled from clearglass' end." Restated 2026-11-13: "need a ledger for agents using the jobs and .response in the back end and logging
the status maybe. guardian is the source of truth. lets get it built and integrated into the backend."

## Built
- `guardian/lib/job-ledger.js`: joins Guardian's own job store (the source of truth, his words today) to each job's `.response` node
  (`guardian/lib/response-sink.js`). Queue state: queued | claimed | fulfilled | error, read from the job's real status. `fulfilled` is
  decided by the `.response` node actually existing, not by status alone — a job the store calls `complete` with no node is named
  unfulfilled, with the reason ("a restart gap"), never silently shown as queued.
- `GET /jobs/ledger` on Guardian (optional `?provider=` / `?queueState=` / `?limit=`).
- Order of delivery: `GET /api/jobs/ledger` on Idearium forwards to Guardian by route (never reads Guardian's files); command row
  `jobs ledger [--provider p] [--state …] [--limit n]` through the one command table, so agents get it the same way a person does.
- The 2026-10-30 map's caution (a parallel session, `claude/laughing-fermi-4f7sj5`, building in the same area) is resolved: that branch
  merged into `main` on 2026-11-06, so JL1/JL2 built clear of it.

## Proof
`tests/modules/test-guardian-job-ledger.test.js` JL-01..08, 8/8 (new, registered in `run-all.js`). Neighbouring tests unaffected:
`test-ncp-handler-sr3` 10/10, `test-reply-not-found-attention` 3/3.

## Not done, said
- **The human view (CM1, Clear Glass) is not in this slice.** His order of delivery's fourth step; CM1 (folding macros and automation into
  the Pipelines section) is still OPEN and untouched here.
- **Not live** until Guardian and Idearium restart (both load this code at boot).
- In Versionium (§17.12): vtm-a7660643.
