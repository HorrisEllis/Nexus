# 0.60.341 — CC1: the Code tab in three views

James, 2026-11-01: "also the code tab, can we consolidate it more. idearium is the system. it can build those projects. thats the point the
outputs. also the flight recorder" · then: "is it the money? can it be? do it phase 1"

The context: the Code tab had 27 ways in on one screen. There were 5 views (files, changes, plans, runs, COS), 15 panels under runs, and 7 dock
rails. "changes" was in three places. The COS view was a placeholder. The flight recorder was panel 4 of 15. The coder's reading of his words is
in docs/2026-11-01-code-tab-consolidation-phasemap.spec, marked to confirm.

## What changed (idearium/ui/js/code-surface.js, code-tab-panels.js)
- **Three views.**
  - **files**: the code, and the agent's changes (the old changes view, opened from files or by `csView('changes')`, with a way back).
  - **build**: input → plan → run. Its tabs are upload, work, charter, agents, jobs and control. COS's test is one line, as a step of the build.
  - **flight**: the flight recorder first, then activity, runs, responses, changes, tasks, log, versions and machine.
- **Nothing removed (§0.3).** The old ids still open their new home: changes → files, plans → build, runs → flight, cos → build. Every panel
  opens its own view.
- **Not in this release.** The dock's duplicate rails, and outputs open first, are CC2. Flight's filters over one history are CC3.

## Proof (Clear Glass, never Playwright)
- test-code-tab-merge 9/9, with the new MG-17: three views, every old id and every panel in its home, the bars in order.
- test-code-tab 17/17.
- test-plan-sidebar 4/4.
- test-code-dock 10/10.
