# 0.39.375 — 2026-10-07

James: "That was fantastic."

## The full sweep after 0.39.364–0.39.374
**Method.** All 548 suites were run, then compared suite by suite with the sweep from before these changes. Three suites that passed before now fail. Each was run alone, then bisected across today's commits.

## Two regressions of this session, fixed
**1. A repo agent was handed its own activity row as memory.**
- **What it saw:** "task.chat running — *explain flushBuffer* — started", for the very question it was being asked.
- **Why:** the context atlas (`lib/context-atlas.js`) searches the stores for anything that matches the question. It searched the new `activity_log` table like any other.
- **The effect:** the agent's prompt switched from the plain code block to the memory-assembled context, with its own echo inside it.
- **The fix:** `activity_log` is telemetry, like `event_log`, so it joins the telemetry set. It's still searchable when a caller names it.
- **Found by:** `test-repo-context`, whose prompt had lost its "## Code from this project" block. The bisect pointed at 0.39.367/368, where the log was added.

**2. The desktop checkpoint index was an undeclared writer.** `cos/workspace/vm-control.js` writes `checkpoints.json`, and that write is now declared in `docs/nexstore-writers.yaml` (found by `test-nexstore-writers` WR-01).

## Now passing again
- `test-repo-context` 16/16.
- `test-nexstore-writers` 3/3.
- Unchanged: `test-agent-context-always` 5/5 and `test-build-context` 15/15.

## Under measurement
- **`test-template-picker` TP-03** fails intermittently. A 30-second wait in Clear Glass times out at a different step each run.
- **The bisect was inconsistent:** one of today's commits fails while a later commit that contains it passes.
- **What happens next:** it is being run three times on this code and three times on the code from before this session, and the result is recorded in the next commit.

## Measured: `test-template-picker` TP-03 is an intermittent failure in the page and its driver, not one of today's regressions
**This session's code:** it failed 6 of 7 runs. That ratio needs reading against the evidence below.

**The code from before this session (c237e05)** fails the same way: 1 of 2 runs here. It passed in the earlier sweep, and it passed in the bisect.

**Ruled out:**
- **The files the workshop page loads.** None changed today: `workshop.html`, `workshop.css`, `void-theme.css`, `window-chrome.js`, `void-sky.js`, `template-picker.js`, `workshop.js`.
- **The server.** Every API request in a failing run, timed, answers in 0–30 ms, and creating a workshop takes the same time on both versions.

**Where it fails:** on the flow's last pass, the double-click on a template card never sends its request, and the 30-second wait times out.

**What is left:** the page and Clear Glass under load. The machine was running sweeps and bisects in parallel during these runs. Recorded here; not changed.
