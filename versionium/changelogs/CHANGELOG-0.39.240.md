# NEXUS 0.39.240 — the Library is in Clear Glass's ☰ menu

**Date:** 2026-09-25 · clear-glass 3.12.0 → 3.12.1

James: *"also needs to be clearglass library. like added to the 3 lines menu"*, then, correcting my first reading (the page menus in `ui/home` and `ui/tv-shell`): *"no. clearglass/renderer/index.html"*.

Clear Glass's window is `clear-glass/renderer/browser.html` + `browser.js` (there is no `renderer/index.html`).
- **Before:** its ☰ menu (`#bookmark-mgr-btn`) had Downloads, Site Settings, History and Background Tabs. The Library window (bookmarks, history, downloads, agent responses, accounts, macros, autofill, passwords) opened only from the tray.
- **Now:** a fixed **📚 Library** row after History.
  - It opens the same window the tray does (agentId `nexus-library`, `http://127.0.0.1:9000/ui/library/`) through `cg.window.open` → `window:open` → `openAgentWindow`.
  - A failure is shown as a toast.
  - No new route.

## Proof
- **Clicked in headless Chromium** on the real `browser.html` and `browser.js`, with `window.ClearGlass` stood in by an object built from the real preload's namespaces:
  - ☰ shows 📚 Library between History and Background Tabs.
  - Clicking it produced exactly one `cg.window.open({ agentId: 'nexus-library', url: 'http://127.0.0.1:9000/ui/library/' })`.
  - The menu closed, and there were no page errors.
  - Probe: `tests/probe/clearglass-menu-library.py`. It derives the stand-in and the command registry from the source at run time.
- **`clear-glass-library-ui`** 24 → 28. It pins the row and checks that its agentId and URL equal the tray entry's, so the two can't drift.
- **`version-sync`** 30/30.
