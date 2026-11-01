# 0.60.354 — TV4: the overview is Idearium and COS

James, 2026-11-01, on the overview after updating to 0.60.353: "cos is not there still. also need to remove bridge, diagnostic, orchastrator. actually clear it all if possible and add ideearium and cos."

## What changed
- The TV's overview shows two tiles: **Idearium** and **COS**.
- The COS tile is new.
  - Its status (online, no cockpit, offline), its system count and its cockpit state come from the orchestrator's `/api/cos-ui/status`.
  - A click opens the COS channel. That channel shows the cockpit when it runs, and Start COS when it does not.
- The other eleven tiles are hidden, not removed:
  - Orchestrator, Guardian, Cortex, Bridge, Diagnose, Architect, Loom, Emerge IDE, Forge Shell, Agents and Blueprint Builder.
  - **all systems**, beside VIEW, shows them again, and each screen remembers that choice.
  - Their ids are unchanged, so the code that fills them is untouched.

## Proof
tests/modules/test-cos-channel.test.js CH-06 loads the real TV page in Clear Glass:
- only `tile-idr` and `tile-cos` are shown;
- **all systems** shows all 13;
- the COS tile reads its status.

The suite passes 6/6.
