# 0.60.408 — PA1–PA4: Automate — your scripts, autofill, element and script conditions, a gate after every step

James, 2026-11-05, asked what "solidify them" meant: "oh i meant the macros, wait conditions with gates, i want it like automate. like i want
the pipeline editor that uses the steps, with gates in between, maybe add conditions for detection of elements, scripts and type scripts,
.macro nodes, workflows, autofill, like i want to be able to record macros, maybe pipelines are application wide, not just site. i want to be
able to see, edit and manage pipeline workflows." Then: "1, then 3? can" (this first, then ErosmancerOS).

## Found first
Most of it was already built, split over three screens:
- **Workflows** (Settings › Automation) already work like Power Automate. They have triggers (manual, schedule, cron, event, webhook) and 25 kinds of step, including macro, if, for each, gate and pipeline.
- **Macros** have blocks with a gate between every two, and record from a tab.
- **Pipelines** run tasks in a dependency graph, with gates.
- **.macro, .workflow and .pipeline** are node files.

Four pieces were missing, and these are the new parts.

## Built
- **PA1 — your own scripts as steps.**
  - Put a `.js` or `.ts` file in the engine's scripts folder (`data/<ns>/automation-scripts`).
  - It gets its values as JSON in `NEXUS_STEP_INPUT` and prints its answer. The last line that is JSON becomes the step's output.
  - TypeScript runs through tsx.
  - A script that fails says its exit code and its error.
  - A name that leaves the folder is refused.
  - `GET /automation/scripts` lists the scripts, each with its first comment line.
- **PA2 — Autofill as a step.** It does the same fill as the Autofill button, through Clear Glass's door (`POST /cli/autofill/fill`).
- **PA3 — "If…" can check more than a value.**
  - An element on the page: on the page, visible, gone, contains text, holds a value, ticked, the page shows text, or the address matches. It is read once through the driver's gate action.
  - Your script's answer: true unless it prints false, no, 0, nothing, or `{ ok: false }`.
- **PA4 — A gate after any step.**
  - A pause (fixed, a range, or like a person), then a gate: one of yours by id, or a condition on an element.
  - When it stays closed: **stop** (no retry), **retry** the step, or **skip** (said in the log).
  - Edit it in each step's "⛩ Gate after this step".
- **The three screens link to each other** (Automation ↔ Pipelines ↔ Macros).
- **Fix:** EAS4a–g (0.60.407's map) had no `spec:` or `blocks:`, so test-substrate-spec was red on the branch. It is green again.

## Not built yet (said)
- **One merged screen.** CM1, in docs/2026-10-30-pipeline-consolidation-and-job-ledger-phasemap.spec, merges the three screens into one.
- **App-wide pipelines.** That reading is to confirm with you:
  - pipelines already apply app-wide when they have no site, and workflow triggers are app-wide;
  - pipelines run by the Orchestrator for every system are PL5, still open.

## Proof
- `test-automate-steps` 5/5. A `.ts` script ran through tsx in the test.
- `automation-engine` 16/16, `automation-v2` 18/18, `automation-settings-ui` 8/8.
- `test-pipelines` 6/6, `test-macro-blocks` 6/6, `test-macro-blocks-ui` 3/3, `test-automation-driver-port` 3/3.
- `test-substrate-spec` 3/3.
- `test-cg-accounts-portal-settings` has 3 failures (UI-05, UI-08, UI-09). They fail the same way on the base without these changes, so they are not from this release.
