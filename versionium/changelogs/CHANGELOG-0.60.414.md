# CHANGELOG 0.60.414 — EAS4f: the last three callers of lib/emerge go through Emerge's door

James, 2026-11-05: "Let’s fix the emerge issue"

His rule for how, the same day (EAS_D9): "Emerge calls back by route"

## Compared first (EAS4f's prerequisite), with Cortex down in both
- lib/emerge's pipeline vs Emerge's build, on SPEC_COMPILER.spec: the same 50 files, apart by one line (the compiler's version stamp,
  named in EAS4b).
- `idearium/compiler-bridge.js` before vs after, on one Idearium spec: t0 9, t1 0 and 3 entries on disk both ways. "Cortex unreachable"
  is said both ways; only its wording differs.

## Switched
- **`idearium/compiler-bridge.js`:** asks `POST /compiler/compile`, its own engine. Cortex's host routes are named unless `skipCortex`.
  The door's compile now takes `host` and `skipWriteback` (CD-09).
- **`copilot/module-builder.js`:** asks `POST /compiler/build`, with Cortex's host routes. The files are written into its build folder, as
  before.
- **`lib/build-pipeline.js`:** asks `POST /compiler/run`, with Cortex's host routes and Guardian's ask route as the model. Per-node progress
  now arrives after the run, from Emerge's list; it was live before.

Nothing in Nexus requires lib/emerge at run time now.

## Proof
- `compiler-door` 9/9.
- A dry run through `build-pipeline`: 11 T2 nodes, 0 failed, every frame emitted.
- `test-emerge-direct-compile` 8/9: EM-003 rewritten for the door; EM-005 fails on main too (a September archive file is missing).
- Census 1121, none added.

## Left: EAS4g
Archive lib/emerge. First `phase-specs.js` and `kg-builder.js` move into Emerge (EAS_D7), and the text references (diagnose, file
integrity, release, tests) point at `emerge/emerge/`.
