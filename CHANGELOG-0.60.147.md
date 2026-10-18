# 0.60.147 — 2026-10-18

James: "each phase, has to have a dependany graph before executing."

## What was there

- **DG1 (0.60.125)** refuses a build while a phase's `depends_on` are still open.
- **MP1** maps every phase to its files, requires and consumers, with no model.

Nothing required a phase to *have* a graph. When a phase mapped to nothing, the build went on: "no mapping: the request is
sent as before". Two consequences, both on 2026-10-17:

- IM1 ran ten attempts on four agents that way.
- The coder shipped FR6 without one, and the boundary ratchet caught the crossing an hour later.

## DG2 — a dependency graph before every phase

**The graph.** `lib/phase-graph.js` assembles a phase's graph from what exists:

- the phase's mapping: the files it changes, what they use, who uses them (what a change can break), and its specs;
- DG1's `depends_on`, plus the phases inferred through shared files;
- the boundary census: each file's system by the census's own rule (`boundarySystemOf`: lib is the kernel; tests and docs
  are no system), and every edge crossing between systems. A crossing is marked **known** when it is already in the
  ratchet's baseline, and **NEW** when it is not.

**The gate.** Idearium's `_phaseBuild` checks for a graph after DG1:

- **No graph:** 409 `NO_GRAPH`, with how to give the phase one (name its files in the map, or `repo map-phases`), and no run
  started. `anyway` does not pass it. That is the coder's reading of "has to have", to confirm.
- **A graph:** it is written to `<idearium data>/phase-graphs/<repo>/<phase>-<hash>.json` before anything runs, and
  `graphHash` and `graphFile` go on every row of the run.

**Where to read it:**

- `GET /api/repos/:uuid/phases/graph?phase&map`;
- the command `repo phase-graph <repo> <phase> [--map]`;
- the Phases tab's detail pane, which shows the graph under the mapped files (`idearium/ui/js/phase-graph-view.js`,
  `css/phase-graph-view.css`).

The build door (`plan-panel.js phaseBuildPost`) holds `NO_GRAPH` with its remedy and never offers "build anyway" for it.

## It binds the coder too

`docs/CLAUDE.md` gains "A dependency graph before every phase": before writing code for a phase, run its graph. A phase with
no graph gets one first, and a NEW crossing is designed out before any code is written.

Applied at once to the failure-mode map (`docs/2026-10-17-failure-mode-report-phasemap.spec`, addendum b):

- **FMR5 had no graph.** It is given files, each in the system it serves (guardian, then versionium). The placement is the
  coder's, to confirm.
- **FMR6 planned `lib/failure-replay.js`.** That kernel file would require `cos/testenv`: a new crossing. It moves to
  `cos/testenv/replay.js`, and FMR6's graph is now entirely in cos.
- **FMR1, FMR4, FMR10:** ready, with no new crossings.
- **FMR11's graph is noisy.** It is mapped from the words the phase mentions; its files are to be declared before it is
  built.

## Records

- `docs/2026-10-17-pieces-not-order-phasemap.spec` addendum (f), beside DG1.
- `idearium/spec/idearium.spec` addendum.
- Loom: `lib/phase-graph.js` and `phase-graph-view.js`, with their edges.

## Proof

- `test-phase-graph` 5/5, new:
  - PG-01: the graph, the remedy, crossings known and new, a stable hash;
  - PG-02: IM1's real graph is ready and shows its module's known crossing;
  - PG-03: through Idearium's real router, NO_GRAPH with no run and no "anyway", a phase with a graph passing, and the route;
  - PG-04: the command and the build door;
  - PG-05: the Phases tab in Clear Glass.
- DG1's own suite: 3/3. Its DG-03 failed while the build door's code was longer; that code now calls a one-line helper.
- Every suite that builds a phase, run alone here and on the untouched 0.60.142, gives the same result:
  - green: chunked-phase-build 16/16, contract-phase-build 14/14, draft-review 12/12, escalation-ladder 9/9,
    hardening-pass 9/9, one-idearium-phases-nodes 21/21, phases-tab 5/5, plan-code-run-attention 40/40, plan-sidebar 4/4,
    qa2-real-run 5/5, shadow 16/16, test-first 5/5, reject-learn-retry 7/7;
  - the same failures as on 0.60.142: build-paths 5/6, phase-actually-builds 5/6, agent-record 33/35.
- `test-system-boundary` 10/10: DG2 adds no crossing.
