# 0.60.593 — Open UI opens a compartment window, by Clear Glass's own command

James, 2026-11-19: "okay why is the full browser opening with clearlgass? i said a compartment" · "clearglass is meant to be cli first"

## What changed
Open UI opens a compartment window, by Clear Glass's own command: COS had asked Clear Glass for window.open, which is its full agent browser. Now Clear Glass has the command `compartment open` (POST /cli/compartment/open { name, url, title?, width?, height? }, in its registry, listed by /cli/commands), which opens the page as a compartment window (compartment-window.js openPage): an Idearium page that draws its own title bar frameless, any other page in Clear Glass's glass frame, each system in its own partition (persist:compartment-<name>), one window per system (asked again, focused). Also a bus event compartment.open (gate) for the same act. COS's Open UI calls nexus://clear-glass.cmd/cli/compartment/open. test-compartment-window 5/6 (CW-03 failed before this change, checked). Clear Glass loads it at its next start; COS at its next restart.

## Files
- clear-glass/src/main/compartment-window.js (openPage), clear-glass/src/ipc/bridge.js (/cli/compartment/open), clear-glass/src/gates/index.js (compartment.open), clear-glass/src/main/index.js (wired), clear-glass/registry-components.js (compartment.open)
- cos/manager/server.js: Open UI calls it
