# 0.40.1 — PF1: the 5-minute cortex stall

James: "whats up with the optimization? it seems almost worst? also liminal space with the velocity, like use that also?"

The idea and the direction are James's; the code is the coder's.

- The run in the log was 0.39.360. The pressure ↔ ok flapping every 10 s was fixed in 0.39.364, so pull first.
- **Cortex going offline for 90–120 s every 5 minutes.**
  - Cause: the decay sweep updates every expired row by id. `guardian/jaa-store.js` `update()` scanned the whole table for each of those rows, and event_log has 333k rows.
  - Fix: an update by id is now one map lookup.
- **Liminal L2/L4 velocity runaway** was logged on every event while it stayed above the threshold. It is now logged once, when it crosses.
- **Mapped** (`docs/2026-10-07-runtime-load-phasemap.spec`):
  - PF2: velocity steers the resource governor.
  - PF3: each shared table has one owner (this ends the out-of-memory crashes).
  - PF4: each file has one writer (this ends the EPERM errors).
  - PF5: tables are bounded.
- test-pf1-stalls 3/3.
