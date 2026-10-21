# 0.60.199 — an imported project continues from its own roadmap

James, 2026-10-21, uploading MASTERMIND-v0_1_50: "so i can import a project and have it continue? Like the one uploaded" · then "yes."

## Context
He had just said what Idearium is for: "i just want idearium to be able to code any project, not just js. web applications, apks,
etc". Then he uploaded MASTERMIND, his Electron app (1,376 files: 922 JS, 106 TS, HTML, CSS, 56 test files), and asked whether it could
be imported and continued.

It would have imported, but not continued. Idearium read a repo's plan only from `*-phasemap.spec`. MASTERMIND keeps its plan in
`phasemap/phases.json` (P0–P14 with state, percent and what blocks what) and `phasemap/PHASEMAP.md` (each phase's exit criterion and a
critical-path tree). The Phases tab would have said "no phases".

## What was built (SD17, docs/2026-10-10-idearium-solid-phasemap.spec)
- `idearium/repo/roadmap-import.js`: finds a project's roadmap and writes `<folder>/roadmap-phasemap.spec` beside it:
  - the project's ids kept (P3-UI becomes P3u for loom's parser; `source_id` keeps P3-UI);
  - its states, with the percent kept;
  - depends_on from the JSON's `blocks` and from the markdown's critical-path chains. Each edge names its file, and a tree line marked
    "unblocked" gets no edge;
  - each exit criterion as the phase's proof;
  - files left unknown, for "map files & dependencies" to fill.

  Anything that cannot be an edge is listed in the map's meta, never dropped silently. The map is parsed back by loom's parser before
  it is written, through the same writer as an added phase, so each import is a repo version. An earlier import is never replaced
  without `replace`.
- Routes: `GET /api/repos/:uuid/roadmaps` and `POST /api/repos/:uuid/roadmaps/import`.
- Commands: `repo roadmaps`, `repo roadmap-import`.
- The Phases tab: an empty repo says "this project brought its own roadmap" with an import button; the rail lists "roadmap not imported
  yet".
- Wired in loom (loom/maps/one-idearium-map.js).

## MASTERMIND's real roadmap, run through the importer
16 phases (P0–P14 and P3-UI): 4 done, 8 in progress, 4 pending.
- The edges come from both files. P8 → P10 → P13 and P11 → P12 → P14 come only from PHASEMAP.md's critical path.
- The DAG check finds no problems.
- Next: P0 "Ground — durability and truth" (99%, one clean hardware cycle), with 9 phases waiting on it. His PHASEMAP.md names P1's
  event log as the next action. The JSON still marks P0 open, so the import shows what the files say: close P0, then P1.

## Proof
- tests/modules/test-roadmap-import.test.js 5/5:
  - RI-01, RI-02: the import itself;
  - RI-03: through the real API;
  - RI-04: the command rows;
  - RI-05: the Phases tab, driven in Clear Glass.
- Unchanged: test-phases-tab 5/5, test-contract-phase-build 14/14, test-one-idearium-phases-nodes 21/21, test-loom-map 19/19,
  test-pipeline-root-causes 18/18.
- Already failing before this release: test-cli-route-commands CL-07 (needs Guardian running).

## Not in this release
- The genesis fork (`idearium/spec-engine/templates/genesis-sandboxed.spec`) is in the tree, parked. He said "i asked for a fork", then
  turned to Idearium building any project; full copy or delta is his to confirm.
- Building non-JavaScript projects (Python, Gradle/APK, TypeScript web) is the next step: the language profiles. MASTERMIND itself is
  JavaScript/TypeScript, and 4 of its tests need Electron, which this environment does not have.
