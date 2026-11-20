# 0.60.625 — the same failure twice is not retried

James, 2026-11-20: "idearium needs to be fixed. it is killing my pc."

## What changed
Read the same day from Idearium's runs: its watchdog rebuilt NM1, NM1a and BX1 for about 46 hours (capped per day by `repos.auto_retries`), each a whole build in Idearium's process that ended the same way; during the tenth EMB3 build Idearium did not answer HTTP for about an hour.
- `_autoRetry` (idearium/api/index.js) holds a phase whose last two finished runs ended the same way (their state and error, numbers ignored). It says so on the run (`auto-retry-held`) and in the gap field (`phase.retry.same-failure`), and does not build it again: the flight recorder's rule, the phase or its brief is the cause, not the model. Changing the phase, or ▶ by him, builds it.

test-run-watch 10/10.

## Files
- idearium/api/index.js
