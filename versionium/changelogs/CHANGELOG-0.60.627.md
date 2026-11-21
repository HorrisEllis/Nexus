# 0.60.627 — a running task cannot hang silently

James, 2026-11-20: "Make sure when a task is running. It can't get stuck like that."

## What changed
Run 12 (EMB3, phrun-mwplppmb-1d8s) passed the test step for the first time (written by Nexus from the phase's examples), then sat 40 min inside the Emerge rung with no row and no model call, until the watchdog closed it.
- Each rung call writes a progress row first (`emerge-gap`: the gap, the model): the run is never silent.
- The rung has a hard limit (`repos.emerge_minutes`, 45): no result in time, and the brick is held with that reason, never hung.

test-emerge-rung 12/12.

## Files
- idearium/api/index.js
