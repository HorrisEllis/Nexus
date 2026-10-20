# The browser shell rebuilt like Firefox, a real Firefox import, extensions with icons, a floating CLI no page or recording can see (2026-10-21)

origin: >-
  James, 2026-10-21: "can you build a import for firefox profiles and cookies for clearglass.? rebuild the front end renderer.html
  completely enterprise grade, same theme as the setting, make it dynamic like firefox. liek a whole toolbar menu. addons or plugins
  built with little icons like firefox. make a beautiful cli like the floating menu button 3-way cli. isolated from the dom, i dont want
  any screen recording to be able to see anything but the dom,"

Build contract: clear-glass/spec/browser-shell.spec (emerge module format, specDepth 1.0).

## Ground truth (2026-10-21)

- The Firefox import that exists is a stub. The Options panel's "Import" sends the co-pilot a chat message (browser.js:672), and
  fingerprint/engine.js importFirefox takes an already-parsed object. No profile, cookie or bookmark is ever read.
- renderer/browser.html is 577 lines with about 200 ids, and renderer/browser.js (3,524 lines) wires every one by getElementById. The
  ☰ menu is built in browser.js (bookmark-mgr-btn). The toolbar pins come from src/toolbar/commands.js (applyToolbarPins).
- Settings uses its own tokens (renderer/settings/settings.css); the window uses browser.css plus cos-theme.css.
- Plugins have no icon of their own, only per-contribution glyphs. The host has disable() but no enable(), and a disabled plugin
  comes back on the next start.
- "The floating menu cli in the tv ui" is ui/tv-shell/menu.js: a round button that opens a CLI with the backend toggle ollama |
  copilot | guardian. renderer/copilot-cli.js already mirrors it for the co-pilot pane.
- Node 22.13+ and Electron 42 ship node:sqlite, so Firefox's databases need no native module.

## Readings (to confirm)

Carried in the spec's `readings:`:
- "renderer.html" means browser.html.
- "Completely" means the markup and look are rebuilt, with every id kept.
- "A whole toolbar menu" means the menu bar plus the ☰ menu.
- "Isolated from the dom ... screen recording" means the CLI lives in its own window, which no page can read and which OS capture
  excludes (Windows/macOS; Linux cannot, said).

## Decisions

decisions:
  BS0_cookie_target:
    status: DECIDED
    question: Which session do imported Firefox cookies go into?
    chosen: >-
      Decided by his axioms (USER_AUTONOMY: his choice per import). The default is the everyday browsing session (Electron's default
      session, where an ordinary window's page loads, found 0.60.178). A provider tab's session (persist:ncp-<provider>) can be chosen
      instead. Snowflake windows never receive imported cookies: they are in-memory compartments, and identifying cookies would defeat
      them.

phases:

  BS1_firefox_import:
    layer: library
    status: DONE 0.60.179
    depends_on: [BS0_cookie_target]
    files: [clear-glass/src/import/firefox.js]
    spec: clear-glass/spec/browser-shell.spec
    blocks: [MOD-BSH-FIREFOX]
    does: "profiles.ini everywhere Firefox keeps it; cookies, bookmarks and persona read from copies with node:sqlite; mapped, set, counted."
    proof: test-browser-shell BST-01, BST-02 (real sqlite files built in the test)

  BS2_shell_rebuild:
    layer: surface
    status: DONE 0.60.179
    depends_on: []
    files: [clear-glass/renderer/browser.html, clear-glass/renderer/shell/shell.css]
    spec: clear-glass/spec/browser-shell.spec
    blocks: [MOD-BSH-SHELL]
    does: "The window rebuilt like Firefox in the Settings tokens; every 0.60.178 id kept; the old file archived."
    proof: test-browser-shell BST-03 (ids), BST-07 (the window in Clear Glass's engine)

  BS3_menus:
    layer: surface
    status: DONE 0.60.179
    depends_on: [BS2_shell_rebuild]
    files: [clear-glass/renderer/shell/menus.js, clear-glass/renderer/browser.js]
    spec: clear-glass/spec/browser-shell.spec
    blocks: [MOD-BSH-MENUS]
    does: "The menu bar (Alt) and the ☰ app menu in Firefox's order, from one model whose items click existing elements."
    proof: test-browser-shell BST-04, BST-07

  BS4_extensions:
    layer: integration
    status: DONE 0.60.179
    depends_on: [BS2_shell_rebuild]
    files: [clear-glass/src/plugins/host.js, clear-glass/renderer/shell/extensions.js, clear-glass/src/ipc/bridge.js, clear-glass/src/preload/index.js]
    spec: clear-glass/spec/browser-shell.spec
    blocks: [MOD-BSH-EXTENSIONS]
    does: "Plugin icons, host.enable, disabled ids kept across restarts, the 🧩 panel with switch and pin, pinned icons on the bar."
    proof: test-browser-shell BST-05, BST-07

  BS5_downloads_panel:
    layer: surface
    status: DONE 0.60.179
    depends_on: [BS2_shell_rebuild, CD5_surface]
    files: [clear-glass/renderer/shell/downloads.js]
    spec: clear-glass/spec/browser-shell.spec
    blocks: [MOD-BSH-DOWNLOADS]
    does: "The ⬇ panel: ordinary downloads and the Snowflake quarantine with Release / Send to qBittorrent / Discard."
    proof: test-browser-shell BST-07

  BS6_float_cli:
    layer: integration
    status: DONE 0.60.179
    depends_on: [BS2_shell_rebuild, BS4_extensions]
    files: [clear-glass/src/main/float-cli.js, clear-glass/renderer/float-cli.html, clear-glass/renderer/float-cli.js, clear-glass/src/main/index.js]
    spec: clear-glass/spec/browser-shell.spec
    blocks: [MOD-BSH-FLOAT-CLI]
    does: "A content-protected child window per browser window: the round button, the three-way toggle, the CLI; navigation sent to the parent."
    proof: test-browser-shell BST-06 (the page in Clear Glass; the main source's protection order)

  BS7_surface:
    layer: surface
    status: DONE 0.60.179
    depends_on: [BS1_firefox_import, BS3_menus, BS6_float_cli]
    files: [clear-glass/renderer/settings/sections/import.js, idearium/cli/route-commands.js, lib/agent-tools/tools/clear-glass/firefox.js]
    spec: clear-glass/spec/browser-shell.spec
    blocks: [MOD-BSH-SURFACE]
    does: "Routes, the `firefox` command (import person-only), the agent's profile list, Settings → Import, the old Options row made real."
    proof: test-browser-shell BST-08 (Settings → Import in Clear Glass)

## Addendum 2026-10-21 (0.60.180): his verdict on 0.60.179, and the design pass it asks for

James, 2026-10-21, after the screenshots: "show me the ui. lets design it" · "need to have it nice and clear. access to all guardian agent
stuff. need to have the bridge setup automatically." · "omg this looks bad. enterprise grade, production quality. outliar level ui"
What was wrong, by the coder's own read of the shots: emoji for icons (they differ per OS and read as a prototype), a narrow address bar,
a black void for a new tab, an empty bookmarks strip, a co-pilot pane in the older mono style with a grey bar for the mic, and Guardian's
agents reachable only through a menu row whose panel showed every agent as Start (it read p.hosted; the host sends running).

  BS8_design_system:
    layer: surface
    status: DONE 0.60.180
    depends_on: [BS2_shell_rebuild]
    files: [clear-glass/renderer/shell/icons.js, clear-glass/renderer/shell/shell.css, clear-glass/renderer/browser.html]
    spec: clear-glass/spec/browser-shell.spec
    blocks: [MOD-BSH-DESIGN]
    does: "One drawn icon set on every toolbar button; type, spacing and elevation scales; the address bar takes the row; empty bookmarks bar hidden."
    proof: test-browser-shell BST-09

  BS9_agents_hub:
    layer: surface
    status: DONE 0.60.180
    depends_on: [BS8_design_system]
    files: [clear-glass/renderer/shell/agents.js, clear-glass/renderer/browser.js]
    spec: clear-glass/spec/browser-shell.spec
    blocks: [MOD-BSH-AGENTS]
    does: "The Guardian hub: every NCP agent with its real state and Start/Show/Stop, plus mesh, queue, userscripts, picker, accounts; the old panel's running bug fixed."
    proof: test-browser-shell BST-10

  BS10_new_tab:
    layer: surface
    status: DONE 0.60.180
    depends_on: [BS9_agents_hub]
    files: [clear-glass/renderer/shell/newtab.js]
    spec: clear-glass/spec/browser-shell.spec
    blocks: [MOD-BSH-NEWTAB]
    does: "A start page over a blank tab: search, agent cards, bookmark tiles, Snowflake."
    proof: test-browser-shell BST-11

  BS11_copilot_pane:
    layer: surface
    status: DONE 0.60.180
    depends_on: [BS8_design_system]
    files: [clear-glass/renderer/shell/copilot.css]
    spec: clear-glass/spec/browser-shell.spec
    blocks: [MOD-BSH-COPILOT-SKIN]
    does: "The co-pilot pane on the same system: segmented route, readable messages, one composer with the mic inside."
    proof: test-browser-shell BST-09 (shots in Clear Glass)

## Addendum 2026-10-21 (0.60.181): "maybe just copilot"

James, of the 0.60.180 pane's four-way switch: "i still hate it. maybe just copilot". BS11's pane becomes Co-pilot only (copilot-cli.js
fixedBackend 'copilot': no switch, Settings' default does not move it, no route line; /backend still typed). The floating CLI (BS6) keeps the
three-way switch, which was its own ask. Reading, to confirm: "just copilot" = the pane only, not the floating CLI. 0.60.180's segmented
switch in the pane is superseded and kept in the history (CHANGELOG-0.60.180.md).

## Addendum 2026-10-21 (0.60.182): the context chips move into Co-pilot

James, 2026-10-21: "can you have the dom, cookies, and picks buttons migrated into copilot so he does it automatically when he needs it."
Found first: the Cookies chip did nothing (ctxCookies toggled, never read). Co-pilot already has page tools (readPage, pageMap, dom.query)
and cookies.health, so the decision can live in the bridge: deterministic first, no model asked.

  BS12_context_automatic:
    layer: integration
    status: DONE 0.60.182
    depends_on: [BS11_copilot_pane]
    files: [clear-glass/src/copilot/context-need.js, clear-glass/src/copilot/bridge.js, clear-glass/renderer/browser.js]
    spec: clear-glass/spec/browser-shell.spec
    blocks: [MOD-BSH-AUTO-CONTEXT]
    does: "need() per message picks page / picks / cookie summary; the bridge attaches them; the chips go; /ctx still forces; each reply says what was attached."
    proof: test-browser-shell BST-12


## Addendum 2026-10-21 (0.60.183): plugin pages, zoom in the core, the right-click menu

James, 2026-10-21, with three screenshots (the 🧩 panel, the ⬇ panel, a right-click menu drawn far from the pointer): "can you make a full
adblocker and make it so i can click on them t ochange their settings. migrate page zoom to the core of clearglass. moright click menu needs
to be redone in the same themeand in relation to the mouse is way of f onthe right clicskk"
The adblocker is its own map (docs/2026-10-21-adblock-phasemap.spec, spec clear-glass/spec/adblock.spec). Found first: zoom lived twice
(browser.js applyZoom and the Page Zoom plugin's driver.exec path, with different bounds, the plugin's never saved). The menu's point was
params.x/y plus the webview's offset, which is in the page's coordinates, not the window's, whenever the page is zoomed or the display is
scaled; the 0.39.265 clamp could not fix that. Reading, to confirm: "click on them" = every plugin row in the 🧩 panel.

  BS13_plugin_settings:
    layer: integration
    status: DONE 0.60.183
    depends_on: [BS4_extensions]
    files: [clear-glass/src/plugins/contribution-types.js, clear-glass/src/plugins/host.js, clear-glass/src/ipc/bridge.js, clear-glass/src/preload/index.js, clear-glass/renderer/shell/extensions.js, clear-glass/renderer/shell/shell.css]
    spec: clear-glass/spec/browser-shell.spec
    blocks: [MOD-BSH-PLUGIN-SETTINGS]
    does: "The `settings` contribution type and plugins:settings; each plugin row opens its page (about, permissions, commands, its fields, Open in Settings)."
    proof: test-browser-shell BST-13

  BS14_zoom_core:
    layer: integration
    status: DONE 0.60.183
    depends_on: [BS2_shell_rebuild]
    files: [clear-glass/src/core/zoom.js, clear-glass/src/driver/index.js, clear-glass/src/ipc/bridge.js, clear-glass/src/preload/index.js, clear-glass/renderer/browser.js, clear-glass/src/main/index.js]
    spec: clear-glass/spec/browser-shell.spec
    blocks: [MOD-BSH-ZOOM-CORE]
    does: "One zoom in the core on Firefox's ladder, saved and restored per site, for the window, the shortcuts and agents; the plugin archived."
    proof: test-browser-shell BST-14

  BS15_context_menu:
    layer: surface
    status: DONE 0.60.183
    depends_on: [BS8_design_system]
    files: [clear-glass/renderer/shell/ctxmenu.js, clear-glass/renderer/browser.html, clear-glass/renderer/browser.js, clear-glass/renderer/shell/shell.css, clear-glass/src/ipc/bridge.js, clear-glass/src/preload/index.js]
    spec: clear-glass/spec/browser-shell.spec
    blocks: [MOD-BSH-CTXMENU]
    does: "Firefox's menu in the window's theme, sections by what was clicked, placed at the real pointer and flipped at the edges."
    proof: test-browser-shell BST-15


## Addendum 2026-10-21 (0.60.184): files into a plugin's page

  BS16_import_fields:
    layer: integration
    status: DONE 0.60.184
    depends_on: [BS13_plugin_settings]
    files: [clear-glass/renderer/shell/extensions.js, clear-glass/renderer/shell/shell.css, clear-glass/src/ipc/bridge.js, clear-glass/src/preload/index.js]
    spec: clear-glass/spec/browser-shell.spec
    blocks: [MOD-BSH-PLUGIN-FIELDS]
    does: "Field kinds import (system picker in main via plugins:pick, paths to the plugin) and add (text + button)."
    proof: test-browser-shell BST-16
