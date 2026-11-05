# 0.60.398 — COS's Console tab (SC11)

James, 2026-11-05: "next phase. cos needs the console from the autopilot. like a console tab"

## Built
The retired autopilot printed every system's output in one stream: each line timestamped and named, errors in red, and it took commands. COS
now has that as a **Console** tab, in the rail under Ledger.

- **Backend.** The supervisor announces each line a system prints. The manager sends the lines on its stream as `cos.console`, in batches
  every 200 ms. A burst of more than 500 lines in one batch says how many it dropped. `GET /api/cos/console?limit=&system=` gives the last
  lines of every system, merged in time order.
- **The tab.**
  - Every system's lines together, newest at the bottom, each with its time and its system's name in its own colour. Errors are red.
  - Filters: by system (chips with counts), errors only, and search.
  - Following / Paused, and Clear view (nothing is deleted).
  - COS's command line pinned at the bottom (`ps`, `help`, …), with its answers shown in the stream. Up and down arrows recall earlier
    commands.
- **Contract.** COS's contract declares the page, its routes and the event, and the shell builds the tab from it.

## Proof
- `test-cos-console-tab` 4/4. CT1-04 drives the tab in Clear Glass: both systems' lines with their names, one system filtered out, `ps`
  run.
- The COS suites that read the contract are unchanged: console 11/11, ui 6/6, ui-starts 3/3, updates 7/7, supervisor 8/8, autopilot-door
  5/5.
