# 0.60.206 — a wrapped repo lifts to its root (SD22)

James, 2026-10-22, with five screenshots of SP5: "im so sick of this phase, been stuck on 2 days. the file is in  the directory already
for the phase, so what is broken?"

Map: docs/2026-10-10-idearium-solid-phasemap.spec SD22_a_wrapped_repo_lifts_to_its_root (DAG checked, no problems).

## What was broken
- Looking Glass was imported before 0.60.200, which is when Nexus started taking a zip's files out of its single top folder. So the
  whole project sits under `looking-glass-bundle-v0_4/`:
  - `lib/title.js`;
  - `tests/sp5-title.test.js`;
  - its phasemap.
- SP5 names `lib/title.js` at the repo's root. The build, the proof and the agent all work at the root, where that file is not.
- Each attempt wrote a second `lib/title.js` at the root. It was never the file he was looking at, and it never passed.

## The fix
- `idearium/repo/lift-root.js` plans the lift, then applies it.
- **How it finds the project's folder:** the one top folder that:
  - holds most of the files;
  - has a project marker at its own top: a phasemap, README, package.json, phases.json or a build file;
  - sits in a repo with no project marker at its root.
- **Every file moves one level up** through a new `moveFile` in the repo layer. It handles both kinds of file the layer stores:
  - files kept as real bytes on disk;
  - files kept in the chunk store.
- **Root files in the way are archived, never deleted.** When a root file sits at a path the project needs (the agents' copies of
  `lib/title.js` and the test), it goes to `.nexus/archive/lift-root/<time>/` first. The project's original then takes the path.
- **Where to run it:**
  - the routes `GET /api/repos/:uuid/lift-root` (the plan) and `POST /api/repos/:uuid/lift-root` (the lift);
  - the command `repo lift-root <repo> [--apply]`;
  - the "⇡ lift to the root" offer in the Phases tab, above the phases, and in Environment & desktop.
- **It only runs when he presses it.** Nexus system repos are refused, because they mirror the tree.

## Proof
- tests/modules/test-lift-root.test.js 3/3:
  - **LR-01**, his shape: the bundle folder, with two root collisions.
  - **LR-02**: the three refusals.
  - **LR-03**, through the real repo layer and route:
    - the root copy is archived and still readable;
    - the original `title.js` (with "Input must be a string") is at `lib/title.js`;
    - the wrapper is empty;
    - a second lift returns 409.

## The two screen faults from the same screenshots
James: "the agent button does nothing in the code tab.. aloso the ui for clearglass is cut off."

1. **The agent button in the Code tab** (idearium/ui/js/code-surface.js, idearium/ui/css/code-surface.css).
   - The button showed on the **changes** view, but that view never drew the agent panel. His first screenshot has the button lit
     and no panel.
   - On **files**, a picked line or a busy agent held the panel open, so a press changed nothing.
   - Now the agent sits beside the changes, and a press always shows or hides it. Picking a line opens it again.
2. **Clear Glass cut off on the right** (clear-glass/renderer/shell/copilot.css).
   - Since 0.60.180, the shell's rule giving the Co-pilot pane its width outranked the rule that gives a closed pane no width. Closing
     Co-pilot made it invisible, but it kept 340 px.
   - That 340 px is the black strip down the right of every page: his Idearium page ended at about 1580 of 1920 px.
   - A closed pane now has no width.

Proof, both run in Clear Glass:
- test-code-tab **CT-11b**: fails on the old file, passes now. 17/17.
- test-browser-shell **BST-09b** at 1920 px: the closed pane measured 340 px before the fix and 0 after. 25/25.

## For his run
Open Looking Glass, go to Phases, and press "⇡ lift to the root". Then build SP5 again.
