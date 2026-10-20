# Archived plugins (§0.3: superseded and kept, not deleted)

- `zoom-0.60.182/` — the Page Zoom plugin (2026-08-24 to 0.60.182). James, 2026-10-21: "migrate page zoom to the core of clearglass."
  Page zoom is core from 0.60.183 (`src/core/zoom.js`, phase BS14 of docs/2026-10-21-browser-shell-phasemap.spec): one ladder, saved per
  site, for the window, the shortcuts and agents (driver.exec zoom). The plugin's three commands are the ☰ menu's zoom row and Ctrl +/−/0.
  Nothing loads from this folder (main/index.js BUILTIN_PLUGINS no longer names it).
