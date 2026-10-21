# 0.60.189 — 2026-10-21 — Every run says who started it

James, 2026-10-21: "It built 5 phases in a row. I think I see what you mean but there are way more idearium phases than that."

He was right, and the code shows how. The coder's part: the trace, and the record that settles it next time.

## The trace
- **No code path builds a different phase on its own.**
  - Every ▶ build in the UI is one click: the Plan, the Phases tab, the spec's "Build next", the workshop, the retry button.
  - The run watchdog only rebuilds the same phase.
- **A listener can do it.** `lib/listener-commands.js` is his 0.59.4 idea: "Use the listener to have you use a command".
  - It runs up to **5** command lines from each reply it hears, through the same command tool every agent uses.
  - `repo phase <phase> build` is not one of the person-only rows.
  - So one AI reply holding five `nexus> repo phase … build` lines builds five phases in a row. RC-11 drives exactly that.
  - An agent calling the command tool (copilot, a repo agent) can do the same.
- **The record could not say which happened.** A run row named its repo, map, phase and graph, and never who started it.

## Built: RC7
- **Every run row now carries `startedBy { who, whence }`.** `whence` is one of:
  - `access`: the keyed caller the gate let through;
  - `declared`: the door that started it — `person:ui`, `person:ui:retry`, `person:ui:workshop`, `person:cli` or `agent:<name>`.
    The agent command tool overrides whatever the row sent, so a listener's build reads `agent:listener`;
  - `system`: `watchdog:stall`, `watchdog:reject` and so on;
  - `unknown`: never guessed to be you.
- **On screen:** each run in the Plan panel reads "by …". A run from before this release reads "by ?". `repo phase <repo> <phase>`
  shows it too.

## Measured
- `test-pipeline-root-causes` 11/11, one of them new:
  - **RC-11:** every door, including the real agent tool and the real listener with only the HTTP call stubbed. One reply with five
    build lines makes five builds, each recorded as `agent:listener`.
- `test-plan-pieces` PP-02, in Clear Glass: the "by" label on each run.
- `test-cm3-commands` CM3-01 and `test-phases-tab` PT-04 compare the exact build request, so they were updated for the field it
  now carries.
- **Red before this release, unchanged by it:** `test-build-surface` (1) and `test-test-first` (1). Checked on the stashed tree.
- **The 0.60.188 suite, checked against 0.60.187 file by file:** no failure is new. Each one has the same count on the tree before.

## Yours to decide
- **Should a listener be able to start a build?** Today it can, by your 0.59.4 design. The record now says when one did. Once a run
  you didn't start shows "by agent:listener", you'll know.
