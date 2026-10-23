# 0.60.220 — the Processes window (SP6)

James, 2026-10-23: "Also need a processes screen for background tabs and activity."

Owned by: clear-glass/spec/site-profile.spec MOD-SP-PROCESSES-UI (dated addendum) · map docs/2026-10-23-site-profile-processes-phasemap.spec SP6.
This finishes the request of 2026-10-23: SP1–SP6, released in 0.60.215 to 0.60.220.

## What stands on what
- 0.60.219's backend: the process list, closing or ending one (his alone), and the activity.
- Settings' window style.
- The shortcut table and the ☰ menu model, which already exist.

## Built
- **The Processes window** (`renderer/processes.html`, `.js`, `.css`).
  - **The process table**: every Clear Glass process with its pages.
    - Columns: name, kind (tab, background tab, agent tab, Clear Glass window, GPU, browser), site, memory, CPU and PID.
    - It refreshes every 2 s and is sortable by any column. The sort and the selected row are kept across refreshes.
    - "Pages only" hides the GPU and the browser.
  - **Close and End**: Close on a background tab, End on a site's tab. Each is confirmed, saying what is lost. A refusal is shown on the
    window.
  - **The activity**, beside the table: what just happened, filtered by kind (pages loaded, background tabs, ClearDriver, macros,
    workflows, downloads, errors, what he ended) and by site.
  - If Clear Glass doesn't answer, the window says so.
- **The way in.**
  - **Shift+Esc**, as in Firefox and Chrome. It is a new default in the shortcut table. The guard that stops shortcuts from stealing typing
    now lets Esc with a modifier through; Shift with a letter is still typing.
  - ☰ → Processes, and Tools → Processes.

## Proof
- `test-processes-ui`: 4/4, driven in Clear Glass. The page's calls reach the real backend over a fake Electron process table.
  - PU-01:
    - rows with memory and kind;
    - a background tab closed from its row and confirmed;
    - the activity shows the close, "by person".
  - PU-02: the sort and the selection survive a refresh; Pages only.
  - PU-03: the banner when Clear Glass doesn't answer.
  - PU-04: Shift+Esc reads and binds as Processes, and Shift with a letter still doesn't; the ☰ and Tools rows; the action opens the
    window.
- `test-browser-shell`: 28/28. BST-17 clicks every ☰ row, Processes included, and checks that it opens the window.
- `test-cg-shortcuts`: 8/8. The window has its own handler for the shortcut too.
