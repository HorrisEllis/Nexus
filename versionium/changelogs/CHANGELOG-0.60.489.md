# 0.60.489 — the run form gets its phases; "what can be built now" no longer freezes Idearium (PC8, SL0 expanded)

James, 2026-11-10: "your supposed to be getting the pipeline working" · 2026-11-12: "it says phase not selected in the piplelube vital. its the next walll"

## Found, on his running system
1. **COS read a cut answer as an empty one.** `GET /api/cos/pipeline/ready` answered `{ ok: true, phases: [] }` while Idearium's
   `GET /api/phases/next` answered a queue. COS kept 4,096 characters of any answer from another system; the queue is about 38,000. The
   cut text did not parse, and the failure was swallowed. The run form had no phases to choose from.
2. **Idearium worked out a whole census on every call**: every phase (2,651) judged against every commit (1,616): 7,474 ms and
   13,575 ms on two runs, in its event loop. The build pipeline's first step allows 10 s; COS's chooser 8 s.

## Fixed
- `cos/manager/server.js`: a caller says how much of an answer it takes (a gate: 4,096; a list: whole); a cut answer is marked.
- `cos/pipeline/index.js`: Idearium's answers are taken whole; one that cannot be read is said, never taken as empty.
- `idearium/api/index.js`: the census is worked out once per state of the maps, git and the releases, in a worker thread, and kept
  5 minutes at most. Callers that arrive meanwhile share the one run.

## Proof
- Live, after restarting Idearium through COS: first call 8,371 ms with `/health` answering 29 times beside it (slowest 959 ms);
  second call 804 ms; the pipeline's first step through COS 876 ms (7,327 ms before).
- Live: the pipeline's five reading steps (ready, covered, map, dag, graph) each answered 200 for IN0_baseline.
- test-cos-pipeline 20/21, with the stand-in Idearium answering at real size (the old code fails it). CP-13 fails here: it expects
  Clear Glass down, and it was running.

## Not done, said
- COS's manager has not been restarted, so on his screen the chooser is still empty until it is. Restarting COS stops every system: his to do.
- The build, evidence and ledger steps were not run: a build writes code.
- The queue itself (`lib/build-queue.js`) still takes about 0.8 s in Idearium's loop on each call.
- test-build-queue printed no result line here; test-self-building-loop 4/5 (LP-05, a Clear Glass case). Neither was looked into.
- Not yet in Versionium: recorded at the next boot sync on his machine (§17.12).
