# 0.39.298 — 2026-10-02

James: "build the spec workshop, with architect for archiecture using the component registry, components store with dependancies, you know, like maybe its time to start codex. need a better entery point, and i figure we can start with, idea -> spec workshop -> architect -> destroy and rebuild blueprint -> Idearium repo -> Cos?"

## ARCHITECT, the third station
The spec, laid out as components. Each component has:
- a tier (CODEX's component or mod);
- a layer (data → engine → service → interface);
- a purpose;
- its dependencies;
- its seams.

Components sit in levels, built from the bottom up: level 0 needs nothing from this architecture.

- **Reuse before build.** Every component is matched against loom's registry and the component store, searched as one index:
  - green REUSE when something already exists, cyan NEW when nothing does;
  - you can override any match: AUTO, NEW, or USE a specific match (from the candidates, or from FIND WHAT EXISTS).
- **Gaps are said, in words:**
  - a dependency on something that exists nowhere, with both names;
  - a cycle, with its path;
  - a lower layer leaning on a higher one.
- **The agent only proposes.** LAY OUT THE SPEC asks the agent for components as YAML, offering the existing components that fit the spec's words. Nothing joins the architecture until you accept it, one at a time or all at once.
- **One architecture per spec.** Opening the same spec again returns its architecture, with the spec reread.
- **Saved beside the spec** as `spec/<name>.architecture.yaml`. Gaps are written into the file too. Opening a repo's spec later reads its saved architecture back, decisions included.
- **Its own page**, `idearium/ui/architect.html`, in the Void's look and in capitals. The workshop's ARCHITECT station opens it on the current spec; SPEC leads back.

## Sequencing, said
AR2 depends on CX0 (CODEX), which isn't built yet. Architect is built on what exists today: loom's registry and `lib/component-store.js`. CX0 grows that store later without changing the station.

## Surfaces
- Engine: `idearium/lib/architect.js` (pure, like the Void and the workshop; the API owns the store and the repo write).
- Routes:
  - `GET|POST /api/architect`;
  - `GET /api/architect/registry?q=`;
  - `GET|POST /api/architect/:id`;
  - `POST …/draft`;
  - `POST …/proposal/:pid` (`all` for every open proposal);
  - `POST …/save`.
- CLI: `idearium architect [list | new | show | add | find | draft | accept | dismiss | save]`.

## Found while building
- **Loom's registry is behind the code.** `lib/component-store.js` (0.39.266) isn't in `loom/data/registry.json`, so Architect calls a "component store" component new. Architect reads the registry correctly; the registry itself needs a fresh scan.
- **Loom also tracks spec documents** (179 entries in namespace `spec`). They aren't built code, so they're left out of the reuse index, along with tests.
- **The component store in this checkout is empty**, so for now reuse comes from loom alone.
- **A Chromium drive server leaked into the real data files.** It ran the real `startAPI()` under a `*.test.mjs` entry, and the event log, the ollama activity log, the economy usage log and the warp crystals wrote outside the test sandbox. The test suites don't start those writers and stay clean. The leaked files were reverted. This sandbox gap was already there before this release.

## Proof
- `tests/modules/test-architect.test.js`: 7/7:
  - matching against loom's real registry (the store wins a tie);
  - the four gap kinds;
  - levels and layers bottom-up;
  - your decisions;
  - the agent only proposing;
  - the file round trip;
  - the real router, from a workshop through save and readback;
  - the surfaces.
- `test-spec-workshop` 8/8, `test-spatial-void` 7/7.
- **Chromium against the real server, with a stand-in agent:**
  - workshop → ARCHITECT station → lay out the spec → accept all → 4 levels, 1 gap said;
  - force NEW, then reuse through FIND;
  - adding the missing component closes the gap;
  - save refused until the spec is in a repo, then saved beside it;
  - keyboard selection;
  - no console errors, no native dialogs, no lowercase tooltips;
  - wide and narrow (no horizontal overflow).
