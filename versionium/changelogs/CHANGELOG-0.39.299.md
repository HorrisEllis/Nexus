# 0.39.299 — 2026-10-02

James: "no. look at architect in idearium. rebuild it, fully. enterprise grade, beautiful style and consistent, open ui."
James: "one is for the idearium pipeline and the other is for the repos. should be more context, look in ideariums maps, or in the docs"
James (with MASTERMIND v0.1.49): "look at this canvas. its huge. you can strip it. its a copy"

## The no, recorded
0.39.298 built a new page beside idearium's Architect instead of rebuilding the Architect idearium already has. There are two:
- **The pipeline's:** Build › "Architect — block canvas". It was an iframe of `architect/src/ui/arch-builder.html`: no data, a broken demo seed, and a path that wasn't served when idearium runs on its own.
- **Each repo's Architect tab:** the registry drawn as one column of boxes per layer, with every wire crossing; then a 60-row table, six boxes of raw lists, and the blueprint underneath.

Both are rebuilt, on one canvas. This closes the canvas decision left open in 2026-09-19 (D1): one canvas, one truth.

## One canvas, stripped from MASTERMIND
`idearium/ui/js/arch-canvas.js` and `idearium/ui/css/arch-canvas.css`. From MASTERMIND's `nexus-canvas.js` (2,263 lines, beside a 16,001-line engine), only what a map needs was kept:
- the world transform: zoom toward the cursor, drag to pan, pinch on touch;
- the glass card, with a coloured edge and a clipped corner;
- bezier wires with a travelling particle, frustum-culled;
- the dot grid, the minimap (click it to go there), box select and drag;
- the adaptive render loop: 60fps while you work, 30 idle, nothing while hidden;
- cards that fold to large titles when zoomed far out.

**Left out:** the vault, JAA, auth, tags, fractal, themes, lattice, Electron.

**Added:**
- layer bands that stack bottom-up across the whole canvas;
- a pure layered layout: every dependency is drawn lower, and two sweeps reorder each band to cut crossings;
- focus: select a component, and what it needs lights yellow and what needs it magenta, while the rest dims.

**Look:** the Void's palette and type, scoped, so it sits inside idearium's chrome without leaking into other tabs; in capitals.

## The pipeline's Architect (Build › Architect, `ui/architect.html`)
- **The canvas full-bleed under a slim bar:**
  - the components in bands (data → engine → service → interface);
  - REUSE / NEW on each card, gaps marked and drawn;
  - breaches and cycles in red.
- **Drag a card to place it.** The place is kept, including in the file as `at:`. ARRANGE lays the map out again.
- **Drag a card's yellow handle onto another** to make the dependency. A gap that this creates is said straight away.
- **Drawers slide over the map:** THE SPEC (its sections, the gaps, removed components, history) and the INSPECTOR / AGENT. Fit makes room for whichever is open.
- **A floating toolbar:** spec, add, arrange, fit, zoom, agent, inspect, save.
- **The Build tab loads it from idearium itself**, so it works without the orchestrator. `arch-builder.html` stays the architect system's own page; idearium just no longer uses it.

## The repo's Architect tab
- **The registry on the same canvas:**
  - one band per layer, bottom-up, a card per file (lines, how many use it, what it needs, doorways, events);
  - wires flowing, events dashed magenta, bottom-up breaches red, orphans dashed.
- **The filter narrows the map**, and above 600 cards the map says how many it is showing.
- **A drawer with three views:**
  - INSPECTOR: id, exports, what it needs and what needs it (each a jump), doorways, events, open the file;
  - LISTS: orphans, breaches, packages, routes and CLI, events, data dirs and node types;
  - BLUEPRINT: the spec, chunk by chunk.
- **Toolbar:** INDEX and WRITE THE REGISTRY, as before.

## Engine
`idearium/lib/architect.js` 1.1.0: a component may carry its place (x, y).
- A move is only a move: who wrote the component doesn't change, and the move isn't added to history.
- null unpins it.
- The file keeps the place, and it's read back on reopening.

## Found while building
- **The MASTERMIND copy won't show its canvas in a browser.** Its "desktop app required" vault gate covers it, so the canvas was read from the code, not run.
- **`arch-canvas.js` is a plain script, but idearium is an ES-module package.** It sets `window.ArchCanvas`, and the tests read the same global in node.
- **A fit that ignores the page's overlays frames the map under the toolbar and drawers.** The canvas now asks the page what its overlays cover.
- **The repo panel kept idearium's 18px padding**, because the generic rule wins at equal specificity, and needed a more specific selector.
- **The sandboxed test servers leaked into real data files again** (the background writers from 0.39.298); reverted, nothing committed.
- **Already failing before this change:** coding-flow probe case W4 expects the label "Create" and gets "∞Create". It fails the same way on the base branch.

## Proof
- `tests/modules/test-architect.test.js` 8/8. The new AR-08 covers:
  - bands bottom-up, every dependency drawn lower;
  - the sweep cuts crossings (2 → 0 on a graph that crosses when ordered by name);
  - a placed card keeps its place, and a wide band wraps;
  - places kept (a move is only a move, null unpins, the file keeps it);
  - both Architects mount the same canvas, and the Build tab is idearium's own page;
  - the stylesheet is scoped, with no lowercase tooltips.
- `test-repo-architecture` 12/12, `test-nexus-atlas-and-glass` 9/9 (updated to the Build tab's new source), `test-spec-workshop` 8/8, `test-spatial-void` 7/7, atlas refs 51/51.
- The coding-flow probe: W7 now checks the canvas (a card per file, the wire graph.js ← state.js, select → inspector) and passes. 15/16; the one failure is W4, above.
- **Chromium:**
  - pipeline: lay out with the agent → accept all → 4 bands → drag a handle (the dependency is made) → drag a card (the place is kept) → drawers; wide and narrow, one drawer at a time when narrow;
  - a 60-file repo: three bands, a breach lit on select, LISTS, BLUEPRINT, filter;
  - Build › Architect inside idearium;
  - no console errors from the Architect, no browser dialogs.
