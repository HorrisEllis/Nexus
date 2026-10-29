# 0.50.0 — 2026-10-08

James: "okay now the phases with the spec workshop. needs to be rebuilt, enterprise grade. interconnected"

RS10 of `docs/2026-10-05-spec-workshop-rebuild-phasemap.spec` is done: the Phases tab is rebuilt on the thread (RS9). That means:
- `GET /api/repos/:uuid/thread` gives the spec's blocks, the phases planned from them, their runs, files and changes.
- `GET /api/repos/:uuid/plan` gives the Plan's gates and ledger.

## Left: the specs

- **Every phasemap**, or one spec with the maps planned from it.
- **The picked spec** shows its blocks: planned, unplanned and moved.
- **Specs not planned yet** offer ⚡ plan.
- **Maps not from a spec** are listed on their own.

## Middle: the phases in lanes by build order

- **Lanes.** One lane per dependency layer. Active and ready phases come first; complete ones fold into "✓ N complete — show", and the choice is remembered.
- **Each card** shows:
  - its spec blocks, with ↻ when a block moved since the phase was planned;
  - the Plan's gate bar;
  - its last run's state, model and rung, e.g. "escalating · ollama:q:7b (2/3)".
- **Notes above the lanes** name the blocks with no phase yet, and how many blocks moved.

## Right: the phase

- **Its block's own words** from the spec, or "moved since planned", or "not in the spec any more".
- **Its files and the changes waiting**: open in Code.
- **Its runs**, as the Plan's ledger, including a failed rung and the climb.
- **Status**, and **build**. With no agent picked, the build climbs the escalation ladder.
- **Open in the Plan** (on its run), and **its spec** in the Spec tab.

## Kept

- Table and Maps. Board and Layers became Lanes.
- Every action: status, build, ▶, + phase, + expand, plan from a spec, live events.
- `idearium/repo/roadmap.js` now passes each phase's blocks.

## Tests

- `test-phases-tab` 4/4, driven in Clear Glass with the real `phases.js`, `plan-panel.js` and `work-surface.js`.
- Unchanged and passing: thread, repo-expand, one-idearium-phases-nodes, moce-roadmap-ui, code-tab.

Next is the workshop rebuild (RS1 the generation recorder, RS2 replay, RS4 the pipeline on WARP 2, RS6 the editor), then RS11, where the workshop and the phases become one surface.
