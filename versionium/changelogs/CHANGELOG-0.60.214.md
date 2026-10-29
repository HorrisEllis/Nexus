# 0.60.214 — the agents hub's tools leave the ☰ menu

James, 2026-10-22, with a screenshot of the ☰ menu's Tools: "also still here? why? supposed to be migrated"

Owned by: clear-glass/spec/browser-shell.spec (dated addendum).

## Why they were back
- In 0.60.180, Agent Mesh, Element Picker and NCP Providers moved into Guardian's agents hub, the robot button (`shell/agents.js`):
  - the hub's "Agent mesh" row;
  - its "Pick an element" row;
  - its list of every NCP agent with Start / Show / Stop, the same calls the old panel made.
- 0.60.210's rebuilt Tools section listed every tool not pinned to the toolbar, which brought those three back into the ☰ menu. That was
  the coder's miss.

## Now
- The ☰ menu leaves the hub's tools to the hub: Agent Mesh, Element Picker, NCP Providers, Guardian scripts and Mesh HUD.
- Customize toolbar can still pin any of them. Their rows say "In the agents hub".
- Fiverr gigs, DOM Archaeology, Rewind session and Toggle Co-pilot aren't in the hub, so they stay under Tools.

## Also
- **A test flake, not yet explained.**
  - Three times in a run, a test opened the ☰ menu and it didn't appear: BST-07, BST-17 and BST-23.
  - The shell tests now open the menu through one helper. If the menu doesn't open, it reports the page's errors and the panel's state,
    instead of a bare 30 s timeout.
  - Six full runs since were 28/28, so the cause isn't caught yet. That's said here rather than claimed as fixed.
- **Proof:** `test-browser-shell` 28/28, six times. BST-21 checks the hub's tools aren't in the ☰ menu, and that Customize toolbar says
  where they live.
