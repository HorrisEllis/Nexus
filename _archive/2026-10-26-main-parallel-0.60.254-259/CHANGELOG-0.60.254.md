# 0.60.254 (renumbered from 0.60.250) — DG2 can see a relocation (a gap found by building AE1 through the pipeline)

James, 2026-10-25: "i wanted you to simulate idearium, the entire process so you can find gaps, and debugg while building."

Building the automation-engine → orchestrator move (phase AE1) through Idearium's real pipeline — not hand-editing — is what
found this. The pipeline's own gate caught it before a line of the move was written.

## The gap
`lib/phase-graph.js` is DG2: "a phase has a dependency graph before it executes." It computed every boundary **crossing**
from each file's **current** system. So for a phase that **moves** files across a system boundary, it reported the crossings
that exist **today** (for AE1: 0–1), and was blind to the crossings the move will **create** — the Clear Glass consumers
(`agent-mesh`, `routes`, `bridge`, `live-recording`) that would point *into* the orchestrator the moment the engine moved
there. The boundary **ratchet** (`test-system-boundary`) would catch those, but only *after* the files were already moved and
the suite ran — the "caught an hour later" failure `docs/CLAUDE.md` names from FR6.

## The fix
A relocation phase now declares what it moves:

```
moves:
  clear-glass/src/mesh/automation-engine.js: orchestrator/automation/engine.js
  …
```

`graphFor()` reads `moves` and evaluates **every edge both before and after** the move:
- a crossing that exists only **after** → `created: true` ("MOVE CREATES A CROSSING … design it out — a route/port —
  BEFORE the move, not after the ratchet fails");
- a crossing that existed before and not after → `removed: true` (the move cleans it up);
- the moved node shows `[source → destination]`, and the phase's `systems` includes both.

Backward-compatible: a phase with no `moves:` produces a byte-identical graph (proven by a regression guard). Every real
caller — the Idearium build path (`idearium/api/index.js`), the `…/phases/dag` route, and `phase-specs` — already passes the
map text, so the fix fires in the real build with **no caller change**.

## Proof
- `tests/modules/test-phase-graph.test.js` **6/6** (in `run-all`). New **PG-06**: a move's created crossing is foreseen and
  flagged `created`; a destination-side consumer's prior crossing is flagged `removed`, never `created`; a no-`moves` phase is
  unchanged.
- AE1's regenerated `.graph` now carries **4 `created: true`** crossings (`clear-glass → orchestrator`). The pipeline itself
  now proves what the earlier dry run argued by hand: AE1 is one atomic move-plus-port cutover — surfaced *before* any code
  moves, which is the whole point of DG2.

## Why it matters beyond AE1
Every sovereignty migration (RF2, the COS compartment moves, every "make system X sovereign") is a relocation. Until now DG2
could not warn that a move would breach the boundary; now it does, at map time.
