# 0.60.266 — Clear Glass starts again on his machine; two stale requires from main's AE1 fixed

James, 2026-10-28, with a screenshot: "A JavaScript error occurred in the main process — Uncaught Exception: Error: Cannot find module
'../tabs/open-decision.js' … D:\Backups\Downloads\Nexus-main-36\Nexus-main\clear-glass\…\compartment-window.js"

## Why it failed
His Nexus folder is a download of main from before PR #181. The zip sent in 0.60.265 held only the 36 files main lacked after #181. So
`compartment-window.js` (which requires `src/tabs/open-decision.js`) arrived without `open-decision.js`, which came in with #181. Dropped on the
Versionium tab, a change pack refuses exactly this mismatch. Unzipped by hand, nothing checks.

## Fixed
- **The zip.** `nexus.zip` now holds every file that differs from either main: before #181 (`8295a93f`) or after it (`654b69c7`). 86 files;
  nothing was deleted. Extracted over either, it gives this branch exactly.
- **Checked by doing it:** extracted over a clean copy of pre-#181 main:
  - every file is byte-identical to the branch;
  - `compartment-window.js`, `bridge.js` and `driver/index.js` load;
  - `test-fiverr-works` 11/11 and `test-change-pack` 6/6 pass there.
- **Two stale requires from main's own AE1 (0.60.251),** found by scanning every relative require in the code Clear Glass loads (1003 files).
  AE1 moved the automation engine out of Clear Glass and missed two lazy requires. Neither crashes at start, but:
  - `clear-glass/src/ipc/bridge.js` `_macroRecord` named `../mesh/automation-engine.js`, so macro recording failed on first use, and
    "Record my choices" needs it. It now names `lib/automation-nodes.js`, which AE1 recorded as the one source of `NODES_DIR`;
  - `clear-glass/src/main/index.js` named `../automation/routes.js`, so every `/automation/*` request failed. It now names
    `lib/automation/routes.js`.
- The two other hits in the scan are not requires that run: one is inside a string for a child process with its own working directory,
  and one is in a comment.

## To use it
Extract `nexus.zip` over `D:\Backups\Downloads\Nexus-main-36\Nexus-main`, replacing files, and start Clear Glass.
