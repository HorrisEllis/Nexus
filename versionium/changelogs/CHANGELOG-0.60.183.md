# 0.60.183 — 2026-10-21 — A full ad blocker, plugin pages, zoom in the core, a right-click menu at the mouse

James, 2026-10-21, with three screenshots (the 🧩 panel, the ⬇ panel, a right-click menu drawn well left of the pointer): "can you make a
full adblocker and make it so i can click on them t ochange their settings. migrate page zoom to the core of clearglass. moright click menu
needs to be redone in the same themeand in relation to the mouse is way of f onthe right clicskk"

The asks are his. The coder's part: what was found, the reading of "full" (marked to confirm), the engine and the code.

## Found
- **The ad blocker was 16 hard-coded domains.** It had no lists, no exceptions, no options, no element hiding, no count and no settings.
  The wiring around it was real and is kept: each window's session runs the plugin's content filter, and Settings → Site settings can turn
  filtering off for a site.
- **Zoom lived twice.**
  - The window's own zoom: +0.1 steps, saved per site from the renderer.
  - The Page Zoom plugin: its own +0.1 steps and 0.25–5 bounds. It never saved, and the address bar never showed it.
- **Why the menu was off.** A page right-click reports its point in the page's own coordinates. The window added the webview's offset,
  which only gives window coordinates when the page is at 100% and the display is unscaled. The 0.39.265 clamp could not fix that.

## Built
- **A full content blocker (AB1–AB4).** Spec `clear-glass/spec/adblock.spec`, map `docs/2026-10-21-adblock-phasemap.spec`.
  - **The engine** (`src/adblock/engine.js`) reads the Adblock Plus / uBlock syntax the standard lists use:
    - `||host^`, anchors, `*` and `^`, `/regex/`, and hosts files;
    - `@@` exceptions and `$important`;
    - third-party / first-party, resource types and their negations, `domain=` with `~`;
    - `$document` (the only way a page you asked for is blocked);
    - `$elemhide` / `$generichide`, and `##` / `#@#` element hiding by domain.
  - **What it does not do is said.** uBlock scriptlets (`##+js`), `$redirect`, `$csp`, `$removeparam` and procedural cosmetics
    (`:has-text`…) are skipped and counted by name, never half-applied.
  - **Fast.** Rules are indexed by host suffix and by their longest literal token. On EasyList + EasyPrivacy + uBlock filters (114,000
    blocking rules) a request takes about 40 µs.
  - **The lists** (`src/adblock/lists.js`):
    - EasyList, EasyPrivacy and Peter Lowe's are on by default; uBlock filters, Fanboy's Annoyances and EasyList Cookie can be turned on.
    - A built-in list (the old 16 entries plus common trackers) blocks from the first page with no network.
    - Lists update every four days through Electron's `net.fetch`. A failed download keeps the last copy and records why.
  - **Allowed sites** are site settings' `contentFilter = off`, the same list Settings → Site settings edits.
  - **Element hiding:** the ad boxes left on a page are hidden on each page load, in `:is()` groups, so one selector the engine cannot
    read does not lose the rest.
  - **A count per tab** shows as a badge on the pinned shield.
  - **Agents have it:** `/cli/adblock/*`, the `adblock` command row, and the `clear_glass_adblock` tool. Your own filters are yours to
    write; the row and the tool refuse them for an agent.
- **Click a plugin to change its settings (BS13).** Every row in the 🧩 panel, and every pinned plugin icon, opens that plugin's page in
  the same panel:
  - the switch, version, what it does, its author and permissions, and its commands;
  - its own settings;
  - "Open … in Settings" where part of it lives in a Settings section.

  A plugin gives its settings through a new contribution type, `settings`. It is event-only like the others: the bridge emits the
  plugin's signature and waits for its one reply. The Ad Blocker's page has:
  - blocked on this page;
  - the main switch, and "Block on this site";
  - rules in use;
  - each list with its switch, count, last update and any error;
  - Update lists now;
  - My filters;
  - the allowed sites, each with ×.
- **Zoom is core (BS14).**
  - `src/core/zoom.js` uses Firefox's ladder (30–300%), saves each site's zoom, and restores it when you go back to that site. A site at
    100% leaves no setting.
  - The window, Ctrl +/−/0, Ctrl+wheel and agents (the driver's zoom action) all go through it. When an agent zooms, the address bar's
    readout follows.
  - The Page Zoom plugin is archived in `plugins/_archive/zoom-0.60.182` (kept, not deleted). Its three commands were already the ☰
    menu's zoom row and the shortcuts.
- **The right-click menu, redone (BS15).**
  - **The look:** Firefox's shape in the window's theme, with drawn icons and the shortcuts on the right.
    - On a plain page: Back / Forward / Reload / Bookmark on top, then Select all, Find, Print and View page source.
    - On a link: open in a new tab or agent window, copy link, ask Co-pilot, and plugin rows such as Snowflake.
    - On an image: open it, copy its link, save it.
    - On a selection: copy, search the web for it, ask Co-pilot.
    - In a text field: undo, cut, copy, paste, select all. A row the field cannot do is dimmed.
    - The Clear Glass rows follow. Every row it had before is kept.
    - A toolbar right-click shows only the toolbar rows.
  - **The place:** it opens where the mouse is. The main process reports the pointer, so neither the page zoom, the display scale nor the
    webview's position can move the menu. It flips left or up at the window's edges, as a native menu does.
  - Arrow keys and Enter work; Esc or a click back into the page closes it.
- **Clear Glass's driver** (`src/driver/glass.js`) can now right-click: `click(sel, { button: 'right', position })`. The menu's test
  needed it.

## Measured
- `test-adblock` 11/11: rules, exceptions, options, `$document`, element hiding, skips counted, lists (offline, update, failure keeps the
  copy, restart loads the cache), allowed sites, counts, the plugin, the adapter, the bus round trip, the command row and the tool.
- `test-browser-shell` 17/17:
  - BST-13: the Ad Blocker's page in Clear Glass, opened from its row, with a list switch asking the plugin. The badge reads 37.
  - BST-14: the zoom ladder and per-site restore.
  - BST-15a: the menu's place and flips.
  - BST-15 in Clear Glass: the menu's corner at the pointer reported (641, 301 for a pointer at 640, 300), link and plugin rows on a link,
    only toolbar rows on the toolbar.
- The specs compile at full depth (`test-substrate-spec` 3/3), the DAG is clean for AB0–AB4 and BS13–BS15, and loom has the new parts with
  their wires, plus 0.60.182's context-need, which was missing.
- Neighbouring suites are unchanged: net-routes 24/24, snowflake 9/9, compartment-downloads 6/6, cg-network-ui 4/4, phase-dag 8/8,
  loom-map 19/19.
  - Ten other suites that touch the changed files fail exactly as they do on the tree without this change (Guardian or Nexus services not
    running here).
  - One was this change: the `adblock` row used `description` where rows use `about`. It is fixed.

## Not done, said
- Not run in a real Electron window here; there is no display in this sandbox. To confirm in your window:
  - the cursor IPC's point;
  - `insertCSS` element hiding;
  - `view-source:` opening in a tab;
  - the first list download through `net.fetch`.
- The ⬇ panel in your screenshot lists UUID-named "completed · 0.0 MB" rows. That was not part of this ask and is not touched here.
- Third-party is judged on the last two labels of a host, or three under a known suffix such as co.uk. That is an approximation of the
  public suffix list.
