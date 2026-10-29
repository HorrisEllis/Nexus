# 0.60.102 - 2026-10-16

James: "just needs to recover and retry after rejection. like log the fault or failure mode and retry."

## What was wrong
Bookkeeping rows written by the retry loop itself (auto-retry notes) were read as stalled runs, so after a rejection the loop counted its own notes, hit the cap and stopped.

## What changed
- lib/run-watch.js: `NOTES` (auto-retry, auto-retry-held) are final bookkeeping, not runs; `limitFor(kind, cfg)` gives a separate cap for reject (3) and stall (2) retries.
- idearium/api/index.js `_autoRetry`: uses `limitFor`, reports a held retry through gap-field `phase.retry.held`, tells the agent "retry N of M" and, from the second reject retry, not to repeat earlier faults. The rejection context is logged first.
- Tests: RW-06..10 in test-run-watch.test.js.

Branch work 0.60.97-0.60.101 was built as 0.60.73-0.60.77 and renumbered at the merge with main (0.60.96).
