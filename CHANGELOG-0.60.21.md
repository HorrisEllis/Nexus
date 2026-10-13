# 0.60.21 — 2026-10-13

James: "needs to retry when you reject it. what if you have copilot monitor repos every now and again if they stall? or have an agent check in? the diagnostic system when it expierences a stall or gate not fire?"

**Context.** BL30's review ended `incomplete`, but the task panel still read "1 running" twelve minutes later. Nothing noticed, and after he rejected the file, nothing tried again.

## No run left in limbo

- **The watchdog.** Idearium owns the runs, so it watches them: every minute it reads the run record (`lib/run-watch.js` over `idearium_phase_runs`). A run with no new step for `repos.stall_minutes` (default 10) is:
  1. closed as `stalled`, naming the state it stopped after;
  2. reported to the gap field (`phase.run.stalled`), which diagnostic and copilot's repair loop already watch;
  3. built again once, with a note that the last run stalled (`repos.on_stall: retry`; `close` only closes it).

  A paused run is never counted as stalled. Only recent stalls (under 2 hours) are retried; older runs that never closed are closed, not rebuilt.
- **Reject retries.** Rejecting an agent's proposal finds the run that made it and builds that phase again, with his reason in the request (`repos.retry_on_reject`). The agent is also told, as in 0.60.20.
- **Caps.**
  - Both kinds of retry share `repos.auto_retries`, default 2 per phase per day.
  - No retry starts while another run of the same phase is still going.
  - A retry that is held back says why on the run, as `auto-retry-held`.
- **The task panel.** A draft review now ends on its own last step: `reviewed` counts as done; `incomplete` and `skipped` count as failed.

All four settings are in Idearium → Settings (repos.*).

## The coder's reading, his to confirm

He asked for "copilot … or an agent check in … the diagnostic system". Idearium does the watching because it owns the run records. Diagnostic and copilot hear about it through the gap field they already read. The "agent check-in" is the retry, with the reason it stalled or was rejected. He may want a separate agent that reads the stalled run and decides what to do, rather than a straight rebuild. That would be a follow-up phase.

## Proof

- `tests/modules/test-run-watch.test.js` 5/5:
  - finds the stalled run and skips ended, paused and fresh ones;
  - ends a finished review;
  - traces a rejected file back to its phase;
  - counts retries;
  - checks the wiring.
- `test-repo-activity` 24/24, `test-chunked-phase-build` 15/15, `test-lean-mode` 7/7.

Not yet proven: a live stall and retry on his machine.
