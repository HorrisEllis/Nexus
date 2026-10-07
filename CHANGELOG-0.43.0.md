# 0.43.0 — PF5: bounded tables, nothing lost

James: "do it. tell me what that would do"

The idea and the direction are James's; the code is the coder's.

- **Found.** `event_log` keeps 24 hours of events (its "short" tier), and Nexus writes about 4 events per second. Removing rows only by age therefore never took the table below about 333k rows.
- **Built.** `cortex/memory/table-compactor.js` now caps each hot table at its newest rows:

  | Table | Cap |
  |---|---|
  | `event_log` | 50k |
  | `component_ledger` | 50k |
  | `cfr_tension_history` | 20k |

  - `NEXUS_TABLE_CAP_<TABLE>` overrides a cap; 0 means no cap.
  - Rows that leave, by cap or by age, are **archived first** to `<store>/archive/<table>/<day>.jsonl.gz`. They are deleted only once the archive is written.
  - `readArchive()` reads archived rows back.
- **Effect.** The processes that read these tables (copilot, autopilot, intelligence) now load at most the cap.
- **Tests.** test-pf5-bounded-tables 4/4.
