# 0.39.353 — 2026-10-05

James: "need a little pull tab on the very right for when i close the plan."

CT9 done (mapped first in `docs/2026-10-05-code-tab-and-one-router-phasemap.spec` 1.3.0).

- **The pull tab.** While a repo is open and the Plan panel is closed, a tab sits on the very right edge of the window, at mid-height. It has PLAN written down it, the done count (15/32), and a blinking dot while a step is building.
  - A click opens the panel, and opening hides the tab.
  - It follows the repo view (`planTabSync`, called on open, close, `setView` and `setRepoSubtab`), so there is no tab on the repos grid or other pages.
- **Found on the way.** The Plan's current gate was meant to pulse (BS11), but its `animation: pulse` named keyframes that were never defined, so it sat still. They are defined now.
- **Tests.** `test-code-tab` 16/16. CT-40, driven in Clear Glass: the tab is flush with the right edge at mid-height, shows its count and dot, opens the panel on a click, hides while the panel is open, and is absent off the repo view. The probes are unchanged: W4 and BS10 fail the same way they did before.
