# 0.60.179 — 2026-10-21 — Snowflake downloads with kill on disconnect, a real Firefox import, the window rebuilt like Firefox, a floating CLI no recording can see

James, 2026-10-21: "add magnet link handling, download manage for the compartment. kill on disconnect."
· "can you build a import for firefox profiles and cookies for clearglass.? rebuild the front end renderer.html completely enterprise
grade, same theme as the setting, make it dynamic like firefox. liek a whole toolbar menu. addons or plugins built with little icons
like firefox. make a beautiful cli like the floating menu button 3-way cli. isolated from the dom, i dont want any screen recording to
be able to see anything but the dom,"

The asks, the look and the P2P rule are his. The coder's part: the readings (marked "to confirm"), the design, the code.

## Found before building
- **The Firefox import that existed was a stub.** The Options panel's "Import" sent the co-pilot a chat message. No profile, cookie or
  bookmark was ever read.
- **Snowflake windows downloaded into the normal Downloads folder.** NP16's quarantine was mapped on 2026-10-15 but never built. Only
  `block` of the four failure rungs was enforced. Nothing handled `magnet:` links.
- **The main downloads store keeps every URL on disk.** Routing a Snowflake window's downloads through it would have left a history of
  what was fetched over Tor, so the quarantine keeps its own index inside its own folder instead.
- **The tab strip put each page's `<title>` into the browser's own HTML unescaped.** A page could inject markup into the tab strip.
  Fixed: the title is escaped.
- **Settings doesn't render with settings.css's raw colours.** It loads `cos-theme.css` on top, his 0.60.5 Compartment-OS look ("i like
  those. theyre beautiful."). "Same theme as the setting" therefore means that palette, so the window keeps loading `cos-theme.css` and
  the new stylesheet adds no colour of its own.

## Readings (to confirm)
- **"Kill on disconnect":** Snowflake windows default to **kill_tabs**. When the transport drops by itself, the windows close, their
  downloads are cancelled and their handed-off torrents are stopped. In Settings → Network he can choose **kill_compartment** (also
  wipe the transport and the quarantine) or **block**.
- **"Magnet link handling":** under his MR12 rule (peer traffic needs a proxy or VPN and fails closed; Tor is for browsing only). A
  magnet is caught and listed, and nothing is fetched. It goes to qBittorrent only after qBittorrent's own settings, read in the same
  call, show its peer traffic going through a non-Tor SOCKS5/HTTP proxy or bound to a VPN interface.
- **"renderer.html"** means `browser.html`. **"Completely"** means the markup and look are rebuilt, with every element id kept. **"A
  whole toolbar menu"** means Firefox's menu bar (Alt) plus its ☰ menu.
- **"Isolated from the dom ... screen recording":** the CLI is its own window. No page script, and no site's session-replay recorder, can
  read it, and OS screen capture leaves it out (Windows 10 2004+ and macOS). Linux has no such API; the CLI's badge says "visible to
  capture" there.

## Specced (his rule: spec, then phases, then each phase specced again)
- `clear-glass/spec/compartment-downloads.spec`: 5 modules at specDepth 1.0. Map `docs/2026-10-21-compartment-downloads-phasemap.spec`
  (CD0 decisions, CD1–CD5).
- `clear-glass/spec/browser-shell.spec`: 7 modules at specDepth 1.0. Map `docs/2026-10-21-browser-shell-phasemap.spec` (BS0 decision,
  BS1–BS7).
- Both are DAG-clean. The only crossings are two the ratchet already knows (`route-commands.js` → cortex). Each phase's `.phase` and
  `.graph` are under `clear-glass/phases/`.

## Built: compartment downloads
- **CD1, `src/net/magnet.js`.** Parses a magnet link: btih in hex or base32, btmh, name, size, trackers and web seeds. Pure: no lookup,
  no network.
- **CD2, `src/net/quarantine.js`.** Every download from a Snowflake window is saved under `<userData>/net/quarantine/<id>/`:
  - files are written 0600 and hashed when done;
  - Release copies the file out, checks the copy's sha256, and only then removes the quarantined one; a name clash gets " (2)";
  - Discard keeps the bytes in `_discarded/`.

  Magnet navigations are stopped and listed. `protocol.handle('magnet')` is the backstop for window.open, frames and redirects.
- **CD3, `src/net/qbittorrent.js`.** The verified hand-off through qBittorrent's Web API v2. It reads both v4 and v5 preferences, and
  refuses a Tor port, unproxied peers, or settings it cannot read. Stop uses v5's `/stop` or v4's `/pause`.
- **CD4, `src/net/kill-switch.js`.** Arms with the transport. One record per unasked drop; a deliberate stop never kills.
- **CD5.**
  - Routes under `/cli/net/quarantine/*`, plus `/cli/net/magnet/handoff`, `/cli/net/on-disconnect` and `/cli/net/qbit`.
  - New `net` verbs: `quarantine`, `release`, `discard`, `handoff`, `on-disconnect` and `qbit`. Everything but the list is person-only.
  - Agents can read the quarantine.
  - Settings → Network gains a "Snowflake downloads" pane. The qBittorrent password is held in memory only; NP2 refuses stored
    credentials until the encrypted container exists.

## Built: the browser shell
- **BS1, `src/import/firefox.js`.** Reads `profiles.ini` from every place Firefox keeps it: Windows, macOS, Linux (including
  `~/.config/mozilla`), snap and flatpak.
  - **Cookies** are read from a copy of `cookies.sqlite` (with its -wal) using node:sqlite, so nothing native has to be built and
    Firefox can stay open. Each cookie is mapped to Electron's shape (host-only kept host-only, ms expiry converted, SameSite=None
    without Secure dropped) or skipped with why: expired, container, private, partitioned or refused. A cookie value never appears in a
    report or log.
  - **Bookmarks** keep their folder as a tag.
  - **User agent and languages** come from `prefs.js`.
- **BS2, `renderer/browser.html` rebuilt like Firefox.**
  - Tab strip with the site's icon, and the page title escaped.
  - Navigation toolbar: back, forward, reload and home; the address bar with site identity (🔒, ⚠, or ❄ in a Snowflake window), zoom
    and ★; pinned tools; pinned plugin icons; 🧩, ⬇, ✦, ›_ and ☰.
  - Bookmarks toolbar, and one popover style for every panel.
  - Every one of the 206 old ids is kept. The 0.60.178 file is archived at `_archive/clear-glass/renderer/browser-0.60.178.html`.
- **BS3, `renderer/shell/menus.js`.**
  - The menu bar: File, Edit, View, History, Bookmarks, Tools and Help. A lone Alt shows it; View → Menu Bar keeps it on. Arrows, Enter
    and Esc work.
  - The ☰ menu in Firefox's order.
  - Every item clicks an element `browser.js` already wires, or calls one of its own functions (`window.CGShell`), so each action has one
    behaviour.
- **BS4, plugins with icons.**
  - Every manifest gains an `icon`. The host gains `enable()`, and a plugin turned off stays off across restarts.
  - The 🧩 panel has a switch and a pin for each plugin. A pinned plugin's icon on the toolbar opens its commands.
  - WebExtensions are listed below the plugins, each with its own switch.
- **BS5, the ⬇ panel.** Ordinary downloads, plus the Snowflake quarantine with Release, qBittorrent and Discard.
- **BS6, the floating CLI.**
  - `src/main/float-cli.js` gives one child window per browser window: frameless, transparent, with no taskbar entry. Content protection
    is set before it is ever shown. It sits at the window's lower right and follows it.
  - `renderer/float-cli.html` has the TV menu's round button, and a panel with the three-way toggle (ollama | copilot | guardian, plus
    claude-code). The toggle is `copilot-cli.js`'s own route bar.
  - /go, /back, /forward and /reload run on the parent window's page. Messages carry no page context.
- **BS7, the surface.**
  - Routes `/cli/firefox/profiles` and `/cli/firefox/import`.
  - The `firefox` command; import is person-only. The `clear_glass_firefox` agent tool only lists profiles.
  - Settings → Import.
  - The old Options "Import" button now runs the real import.

## Measured
- `test-browser-shell` 9/9 (new). BST-06b, BST-07 and BST-08 drive the real pages in Clear Glass's own engine (`glass.js`, never
  Playwright) against a stub bridge:
  - the window: one toolbar row; ☰ in Firefox's order; one popover at a time; 🧩 icons with a working switch and pin; ⬇ with the
    quarantine; Alt shows the menu bar; no page errors;
  - the floating CLI: the toggle, /help, and a routed reply with no page context;
  - Settings → Import.
- `test-compartment-downloads` 6/6 (new). CDT-06 is Settings → Network in Clear Glass.
- `test-snowflake` 8/8, `test-net-routes` 24/24, `test-substrate-spec` 3/3 (now 8 specs; SS-02 skips decisions, which build no module).
- New test-only helper `clear-glass/src/driver/cg-stub.js`: a `window.ClearGlass` built from the preload's real namespace list, so Clear
  Glass's own pages can be driven without the main process.

## Not done, and said
- Electron's main process, tor, a live qBittorrent and real screen capture are not in this sandbox. Content protection, the kill switch
  firing on a real drop, and the qBittorrent hand-off are built to their documented APIs and tested against fakes. They are unverified
  until they run on his machine.
- Saved Firefox passwords are not imported. They need Firefox's own key (and its primary password if one is set), and that is not
  built; Settings → Import says so. History is not imported either.
- Ordinary windows still load their page in the default session (the 0.60.178 problem, still his call).
