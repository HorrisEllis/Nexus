# 0.60.238 — 2026-10-24

James: ".phase/.graph should be one file i feel like?" · "need to keep at the sovereignty of each system"

## PS4: one file per phase, kept with the system that owns it

Each `<owner>/phases/<map-id>/<phase>.phase` now carries its own graph: its hash, its files with their roles, its crossings and its slice
of the whole DAG. The separate `graph/<phase>-<hash>.graph` files are gone. Why that was safe:
- the graph is derived entirely from the phase;
- every edit of a map wrote one more graph beside the last (2,140 for 2,055 phases; EW1 had two with the same 21 nodes);
- a run still keeps its own copy of the graph it was built against;
- git keeps every earlier one.

For sovereignty:
- each phase node names the system that owns it (it said `idearium` for every phase, including `lib/`'s and `cos/`'s);
- a phase whose owner changes moves to that system's folder. After EW1, 12 moved from `lib/` to `emerge/`, `loom/` and `idearium/`.

Dropped as true duplicates, and reported: 2,149 `.graph` files and 12 moved copies. The tree now has 2,056 `.phase` files and no
`.graph`. `emerge/compiler/phase-specs.js` is at 1.3.0 and `lib/pipeline-nodes.js` gains `graphBody`. SF4 now declares emerge, which
its files now touch; this was a failure introduced by EW1, now fixed.

Proof: test-phase-specs 7/7, test-phase-specs-tag 7/7, test-loom-phasemap 8/8, test-phase-deps-gate 3/3, test-self-building-loop 5/5,
test-phase-close 7/7, test-build-queue 6/6, test-substrate-spec 3/3.
