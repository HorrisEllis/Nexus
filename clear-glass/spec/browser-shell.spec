spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # clear-glass/spec/browser-shell.spec — the browser window rebuilt like Firefox, a real Firefox import, extensions with icons, and a
  # floating three-way CLI that no page and no screen recording can see. Format: emerge's module spec, compiled by
  # emerge/compiler/kg-builder.js at specDepth 1.0, no BLACK, invariants valid. Phases: docs/2026-10-21-browser-shell-phasemap.spec.
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        browser-shell
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-21T00:00:00Z
    status:      specced
    uuid:        nexus-cg-browser-shell-spec-v1-0000-2026-1021-jamesbrooks-001
    origin: >-
      James, 2026-10-21: "can you build a import for firefox profiles and cookies for clearglass.? rebuild the front end renderer.html
      completely enterprise grade, same theme as the setting, make it dynamic like firefox. liek a whole toolbar menu. addons or
      plugins built with little icons like firefox. make a beautiful cli like the floating menu button 3-way cli. isolated from the
      dom, i dont want any screen recording to be able to see anything but the dom,"
      Earlier, his and kept: 2026-08-28 "in firefox the search bar looks like this with the bookmark button at the end" · 2026-08-30
      "need a toolbar editor" · 2026-09-26 "make a clearglass hat for the copilot cli, match the idearium agent cli or the floating
      menu cli in the tv ui."
      The asks and the look are his. The coder's part: the readings (marked), the design, the code.
    readings: >-
      To confirm. "renderer.html" is renderer/browser.html (the browser window; there is no renderer.html). "completely" — the window's
      markup and its look are rebuilt (new structure, the Settings tokens, a new stylesheet over the old one); every element id the
      3,500-line browser.js wires is kept, so no feature is lost (§0.3); the old file is archived. "a whole toolbar menu" — Firefox's
      menu bar (File Edit View History Bookmarks Tools Help, shown with Alt or kept on) plus its ☰ app menu. "the floating menu button
      3-way cli" — the TV UI's floating menu (ui/tv-shell/menu.js): a round button that opens a CLI with the three-way backend toggle
      ollama | copilot | guardian (Claude Code as a fourth where present). "isolated from the dom, i dont want any screen recording to be
      able to see anything but the dom" — the CLI lives in its own window: no page script can read it (separate process, not in the
      page's DOM, so a site's session-replay recorder never sees it), and that window is excluded from OS screen capture
      (setContentProtection: Windows 10 2004+ and macOS; Linux has no such API, said in Settings). A recording then shows the page
      and nothing of the CLI.
    purpose: >-
      An everyday browser window that looks and moves like Firefox in the Settings theme; the Firefox profile he already has brought in
      for real (cookies, bookmarks, persona); plugins visible as icons he can pin, turn off and on; a CLI that floats over the page
      without being part of it or of any recording.
    target_runtime: [electron, node]
    language_stack: [javascript, html, css]
    paradigm: [ids-are-the-contract, injected-impurity, privacy-by-separation]
    axioms: ["§0.3 nothing lost (ids kept, old shell archived)", "§8.6 reuse (browser.js wiring, toolbar/commands.js, copilot-cli.js, plugin host, node:sqlite)",
      "USER_AUTONOMY (imports, pins and capture protection are his)", "§1.2 nothing silent (each skipped cookie counted with why; capture protection unsupported said)",
      "AXIOMS §4.1 UI tested in Clear Glass, never Playwright"]
    deps:
      - { name: node-sqlite, version: "node:sqlite (Node 22.13+ / Electron 42)", required: true, purpose: "reads Firefox's cookies.sqlite and places.sqlite without a native module" }
      - { name: electron, version: "42.x", required: true, purpose: "cookies.set, BrowserWindow.setContentProtection, child windows" }

    constraints:
      - id: BSH-001
        description: "Every element id browser.html had at 0.60.178 exists in the rebuilt browser.html (a test lists them)."
        type: hard
        enforced_by: [GATE-BSH-IDS]
      - id: BSH-002
        description: "Firefox's databases are read from a copy (with its -wal), never opened in place, so a running Firefox is not disturbed."
        type: hard
        enforced_by: [GATE-BSH-COPY]
      - id: BSH-003
        description: "A cookie that is expired, belongs to a container, private window or partition, or that Electron refuses is skipped and counted with why."
        type: hard
        enforced_by: [GATE-BSH-COUNT]
      - id: BSH-004
        description: "Importing cookies is a person's act (not an agent's); agents may list profile names only."
        type: hard
        enforced_by: [GATE-BSH-PERSON]
      - id: BSH-005
        description: "The floating CLI is a separate window with content protection on, never content injected into a page."
        type: hard
        enforced_by: [GATE-BSH-ISOLATED]
      - id: BSH-006
        description: "A plugin turned off stays off after a restart (options.disabledPlugins); turning it on registers its contributions again."
        type: hard
        enforced_by: [GATE-BSH-PLUGINS]

  schemas:

    - id: FirefoxProfile
      name: FirefoxProfile
      description: "One profile from profiles.ini."
      fields:
        name:     "string"
        path:     "string — absolute"
        isDefault: "boolean — the install's default (Install* Default=) or Default=1"
        root:     "string — the Firefox folder it was read from"
        has:      "{ cookies, places, prefs } booleans"
      behavioral_contracts: ["relative paths resolved against the profiles.ini folder"]
      error_paths: ["no profiles.ini anywhere → [] with the places looked"]

    - id: ImportReport
      name: ImportReport
      description: "What one import did."
      fields:
        profile:  "string"
        into:     "string — default | persist:ncp-<provider>"
        cookies:  "{ read, imported, skipped: { expired, container, private, partitioned, refused } }"
        bookmarks: "{ read, added, existing }"
        persona:  "{ userAgent, languages } | null"
        errors:   "string[]"
      behavioral_contracts: ["no cookie value is ever in the report or a log"]
      error_paths: ["a database that cannot be read → that part 0 with the error; the others still run"]

    - id: MenuModel
      name: MenuModel
      description: "The menu bar and ☰ menu as data: menus of items { label, kbd, run: { click: elementId } | { action }, sep }."
      fields:
        menus:  "{ id, label, items[] }[] — File Edit View History Bookmarks Tools Help"
        app:    "items[] — the ☰ menu, Firefox's order"
      behavioral_contracts: ["an item points at an element id that exists or an action shell.js knows; a test checks both"]
      error_paths: ["an item whose target is missing is not drawn, and is logged"]

  interfaces:

    - id: IF-BROWSER-JS
      name: browser-js
      path: clear-glass/renderer/browser.js
      description: "The window's behaviour: ~200 getElementById wirings (tabs, nav, url bar, panels, co-pilot, toolbar pins, ☰ menu)."
      exports: ["getElementById(id) wiring", "applyToolbarPins", "_openToolbarEditor", "_openLibrary"]
      behavioral_contracts: ["finds elements by id, wherever they sit"]
      error_paths: ["a missing id throws at boot"]

    - id: IF-PLUGIN-HOST
      name: plugin-host
      path: clear-glass/src/plugins/host.js
      description: "Installs plugins from manifests, registers contributions, disable(id), list()."
      exports: ["PluginHost.install(manifest, module)", "disable(id)", "list()"]
      behavioral_contracts: ["a disabled plugin's signatures are deregistered"]
      error_paths: ["unknown id → PluginHostError"]

    - id: IF-COPILOT-CLI
      name: copilot-cli
      path: clear-glass/renderer/copilot-cli.js
      description: "The co-pilot CLI wearing the Clear Glass hat: route bar (backend toggle, agent select, hat chip), slash commands, history."
      exports: ["CGCopilotCLI.create({ cg, agentId, wv, print, getCtx, setCtx, clearMessages, normalizeUrl, navigate }) → { handle, onKey, route, propose }"]
      behavioral_contracts: ["fills #copilot-route", "wv needs getURL/goBack/goForward/reload/canGoBack/canGoForward"]
      error_paths: ["no #copilot-route → no bar"]

    - id: IF-BOOKMARKS-STORE
      name: bookmarks-store
      path: clear-glass/src/bookmarks/store.js
      description: "Bookmarks per agent (JAA rows)."
      exports: ["add({ url, title, agentId, tags })", "isBookmarked({ url, agentId })"]
      behavioral_contracts: ["one row per url per agent"]
      error_paths: ["no url → refused"]

    - id: IF-FINGERPRINT
      name: fingerprint-engine
      path: clear-glass/src/fingerprint/engine.js
      description: "Personas per agent; importFirefox(agentId, { userAgent, intlLocale }) merges a Firefox persona."
      exports: ["importFirefox(agentId, ffProfile)"]
      behavioral_contracts: ["only the fields Firefox gives override"]
      error_paths: ["save failure logged"]

    - id: IF-SITE-SETTINGS
      name: site-settings
      path: clear-glass/src/site-settings/store.js
      description: "Per-origin settings (zoomFactor, contentFilter, permissions); the store page zoom keeps its factor in (BS14)."
      exports: ["get(url, key)", "set(url, key, value)", "deleteKey(url, key)", "listOrigins()"]
      behavioral_contracts: ["keys are origins"]
      error_paths: ["bad url → undefined / false"]

  modules:

    - id: MOD-BSH-FIREFOX
      name: firefox-import
      uuid: nexus-cg-bsh-firefox-v1-0000-2026-1021-001
      path: clear-glass/src/import/firefox.js
      phase: BS1_firefox_import
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        profiles({ platform, home, env, fs }) reads profiles.ini from every place Firefox keeps it (Windows %APPDATA%, macOS Application
        Support, Linux ~/.mozilla, ~/.config/mozilla, snap and flatpak). readCookies(dir) copies cookies.sqlite (+wal) to a temp folder
        and reads moz_cookies with node:sqlite; toElectron(row) maps host/path/secure/httpOnly/sameSite/expiry (seconds or ms) to
        Electron's cookies.set shape. importCookies({ dir, session }) sets each, counting skips. readBookmarks(dir) reads places.sqlite
        (type 1, not place: URLs, with the folder name); importBookmarks({ dir, store, agentId }). readPersona(dir) reads prefs.js's
        general.useragent.override and intl.accept_languages. run({ profile, cookies, bookmarks, persona, into }) → ImportReport.
      deps: [{ name: bookmarks-store }, { name: fingerprint-engine }]
      schema_refs: [FirefoxProfile, ImportReport]
      exports: ["profiles(o) → { profiles: FirefoxProfile[], looked: string[] }", "readCookies(dir) → row[]", "toElectron(row, now) → { cookie } | { skip }", "importCookies({ dir, session }) → counts", "readBookmarks(dir) → { url, title, folder }[]", "importBookmarks({ dir, store, agentId }) → counts", "readPersona(dir) → persona|null", "run(o) → ImportReport"]
      gate_pipeline: ["GATE-FX-001: find profiles", "GATE-FX-002: copy db", "GATE-FX-003: read rows", "GATE-FX-004: map + skip with why", "GATE-FX-005: set", "GATE-FX-006: report"]
      behavioral_contracts: ["the temp copy is removed after reading", "no cookie value logged or returned"]
      error_paths: ["node:sqlite missing → error naming the Electron/Node version needed"]
      acceptance: ["a real sqlite file built in the test: host-only and domain cookies, a container, an expired, ms and s expiry, sameSite → mapped and counted"]

    - id: MOD-BSH-SHELL
      name: shell
      uuid: nexus-cg-bsh-shell-v1-0000-2026-1021-001
      path: clear-glass/renderer/browser.html
      phase: BS2_shell_rebuild
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        The window rebuilt like Firefox in the Settings theme: tab strip (favicon, title, close, +, window controls), navigation toolbar
        (back, forward, reload, home · the address bar with site identity, a ❄ badge in routed windows, zoom and the bookmark star ·
        pinned tools · pinned plugin icons · 🧩 extensions · ⬇ downloads · ✦ co-pilot · ›_ CLI · ☰), the bookmarks toolbar, the menu
        bar row (hidden until Alt or kept on), panels as one popover style. The palette is Settings' own: settings.css's token names
        retuned by cos-theme.css (his 0.60.5 Compartment-OS look), which Settings and the Library load — so the window loads
        browser.css, cos-theme.css, then renderer/shell/shell.css, which adds only layout and surfaces (no colour of its own). The
        0.60.178 browser.html is archived under _archive/clear-glass/renderer/.
      deps: [{ name: browser-js }]
      schema_refs: [MenuModel]
      exports: ["renderer/browser.html", "renderer/shell/shell.css", "every 0.60.178 id"]
      gate_pipeline: ["GATE-SH-001: ids kept", "GATE-SH-002: tokens", "GATE-SH-003: archive"]
      behavioral_contracts: ["no inline script (CSP script-src 'self')", "keyboard focus visible on every control"]
      error_paths: ["a missing id → the id test fails before release"]
      acceptance: ["Clear Glass's engine loads the window: every old id present, no page error at boot, the toolbar laid out in one row at 1280px"]

    - id: MOD-BSH-MENUS
      name: menus
      uuid: nexus-cg-bsh-menus-v1-0000-2026-1021-001
      path: clear-glass/renderer/shell/menus.js
      phase: BS3_menus
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        The MenuModel and its two views: the menu bar (File Edit View History Bookmarks Tools Help; Alt shows it, View → Menu Bar keeps
        it; keyboard: arrows, Enter, Esc) and the ☰ app menu in Firefox's order (New tab · New Snowflake window · Bookmarks · History ·
        Downloads · Passwords · Add-ons and plugins · Import from Firefox · Print · Find · Zoom − 100% + · Settings · More tools ·
        Customize toolbar · Help). Items run by clicking the existing element (so browser.js's handler is the one behaviour) or a shell
        action. browser.js's ☰ handler builds from this model's app items.
      deps: [{ name: shell }, { name: browser-js }]
      schema_refs: [MenuModel]
      exports: ["window.CGMenus.model()", "mountMenuBar(el)", "appMenuHTML()", "run(item)"]
      gate_pipeline: ["GATE-MN-001: model", "GATE-MN-002: targets exist", "GATE-MN-003: draw", "GATE-MN-004: keys"]
      behavioral_contracts: ["one behaviour per action: a menu item never re-implements a button"]
      error_paths: ["a missing target is skipped and logged"]
      acceptance: ["Alt shows the bar; File → New tab clicks #btn-new-tab; every item's target exists"]

    - id: MOD-BSH-EXTENSIONS
      name: extensions-panel
      uuid: nexus-cg-bsh-extensions-v1-0000-2026-1021-001
      path: clear-glass/renderer/shell/extensions.js
      phase: BS4_extensions
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        Firefox's unified extensions panel. Every plugin manifest gains an `icon` (one glyph) and list() returns it; host.enable(id)
        re-registers a disabled plugin's contributions; disabled ids persist in options.disabledPlugins and are applied at boot. The 🧩
        button opens a panel: icon, name, description, on/off switch, pin. Pinned plugins (options.pinnedPlugins) show as icons on the
        toolbar; clicking one opens its first toolbar command or its panel row. WebExtensions (webext:list) are listed below with their
        own switch.
      deps: [{ name: plugin-host }, { name: shell }]
      exports: ["PluginHost.enable(id)", "plugins:enable IPC", "window.CGExtensions.mount()"]
      gate_pipeline: ["GATE-EX-001: list with icons", "GATE-EX-002: switch", "GATE-EX-003: pin", "GATE-EX-004: persist"]
      behavioral_contracts: ["a disabled plugin is never shown as working"]
      error_paths: ["enable of a plugin that fails → it stays disabled with the error shown"]
      acceptance: ["host: disable then enable registers the same signatures again; panel in Clear Glass: icons, a switch, a pin that appears on the bar"]

    - id: MOD-BSH-DOWNLOADS
      name: downloads-panel
      uuid: nexus-cg-bsh-downloads-v1-0000-2026-1021-001
      path: clear-glass/renderer/shell/downloads.js
      phase: BS5_downloads_panel
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        Firefox's downloads button and panel: ordinary downloads (cg.downloads.list) with open-folder and clear, and a "Snowflake
        quarantine" group from /cli/net/quarantine with Release, Send to qBittorrent and Discard (the compartment-downloads surface).
        The button shows a ring while anything is in progress.
      deps: [{ name: shell }]
      exports: ["window.CGDownloads.mount()"]
      gate_pipeline: ["GATE-DP-001: list", "GATE-DP-002: quarantine group", "GATE-DP-003: actions"]
      behavioral_contracts: ["quarantine actions go through the same routes Settings uses"]
      error_paths: [":7702 unreachable → the quarantine group says so"]
      acceptance: ["Clear Glass: the panel lists a download and a quarantined file with Release"]

    - id: MOD-BSH-FLOAT-CLI
      name: float-cli
      uuid: nexus-cg-bsh-float-cli-v1-0000-2026-1021-001
      path: clear-glass/src/main/float-cli.js
      phase: BS6_float_cli
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        The floating CLI. main: one child window per browser window (frameless, transparent, no taskbar entry), setContentProtection
        (true), kept at the parent's lower right as it moves and resizes, collapsed to the round button or open to the panel
        (floatcli:toggle, floatcli:size). renderer/float-cli.html: the round button (the TV menu's), a panel with the three-way toggle
        (ollama | copilot | guardian, plus claude-code), the agent select and the hat chip (copilot-cli.js's own route bar, reused), the
        messages and the input with history; messages go through cg.copilot.send with the route. Navigation commands (/go /back
        /forward /reload) are sent to the parent window (floatcli:nav), which runs them on its webview; the parent tells it its URL.
      deps: [{ name: copilot-cli }, { name: shell }]
      exports: ["attach(parentWin, { agentId }) → { toggle, destroy }", "renderer/float-cli.html", "floatcli:toggle|size|nav|url IPC"]
      gate_pipeline: ["GATE-FC-001: child window", "GATE-FC-002: content protection", "GATE-FC-003: follow parent", "GATE-FC-004: route"]
      behavioral_contracts: ["never injected into a page", "content protection is set before the window is shown"]
      error_paths: ["setContentProtection unsupported (Linux) → the window still works; Settings and the panel say it is visible to capture there"]
      acceptance: ["the page loads in Clear Glass: the toggle has the backends, typing /help prints the list; main source sets setContentProtection(true) before show"]

    - id: MOD-BSH-SURFACE
      name: shell-surface
      uuid: nexus-cg-bsh-surface-v1-0000-2026-1021-001
      path: clear-glass/renderer/settings/sections/import.js
      phase: BS7_surface
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        Routes /cli/firefox/profiles and /cli/firefox/import (ipc/bridge.js); the `firefox` command (profiles; import <name|path>
        [--cookies] [--bookmarks] [--persona] [--into …], person-only); the agent tool clear_glass_firefox (profiles only). Settings →
        Import: each profile with its default chip, what it holds, the three parts to bring, where cookies go, Import, and the report.
        The old Options panel's Firefox row calls the real import instead of sending a chat message.
      deps: [{ name: firefox-import }, { name: browser-js }]
      exports: ["/cli/firefox/profiles", "/cli/firefox/import", "firefox profiles|import", "Settings → Import"]
      gate_pipeline: ["GATE-SU-001: route", "GATE-SU-002: command", "GATE-SU-003: agent scope", "GATE-SU-004: Settings"]
      behavioral_contracts: ["the report never shows a cookie value"]
      error_paths: ["no profile found → the places looked are listed"]
      acceptance: ["Settings → Import in Clear Glass lists a stub profile and posts the import with the chosen parts"]

    - id: MOD-BSH-DESIGN
      name: design-system
      uuid: nexus-cg-bsh-design-v1-0000-2026-1021-002
      path: clear-glass/renderer/shell/icons.js
      phase: BS8_design_system
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        James, 2026-10-21 (after seeing 0.60.179): "omg this looks bad. enterprise grade, production quality. outliar level ui" ·
        "need to have it nice and clear." One icon set drawn for Clear Glass (24-unit grid, 1.75 stroke, round caps — the Lucide/Firefox
        Proton manner), set on every toolbar button by data-icon so the glyph never depends on the OS's emoji font; a type scale, spacing
        scale and elevation scale in shell.css on Settings' palette; the address bar given the row (Firefox: it takes the free width) with
        the host emphasised; the bookmarks toolbar hidden while it is empty.
      deps: [{ name: shell }]
      exports: ["window.CGIcons.svg(name) → string", "window.CGIcons.apply(root)", "ICONS"]
      gate_pipeline: ["GATE-DS-001: every data-icon has a drawing", "GATE-DS-002: applied once, idempotent", "GATE-DS-003: aria-label kept"]
      behavioral_contracts: ["an icon is decoration: each button keeps its aria-label and title", "no network, no font file"]
      error_paths: ["an unknown icon name → the button keeps its text, logged"]
      acceptance: ["Clear Glass: no emoji glyph left on the navigation toolbar; every toolbar button draws an svg"]

    - id: MOD-BSH-AGENTS
      name: agents-hub
      uuid: nexus-cg-bsh-agents-v1-0000-2026-1021-002
      path: clear-glass/renderer/shell/agents.js
      phase: BS9_agents_hub
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        James, 2026-10-21: "access to all guardian agent stuff." One toolbar button (with the running count) opens the Guardian hub: each
        NCP agent (registry name and colour) with its real state from providers.list (running, status, health, account), Start / Show /
        Stop, and the window's Guardian tools in one place — agent mesh and its queue, Guardian userscripts, the element picker that
        assigns provider selectors, accounts and profile tabs (Settings → Providers). Also fixes the NCP Providers panel, which read
        p.hosted while the host sends running, so every agent showed Start.
      deps: [{ name: shell }, { name: browser-js }]
      exports: ["window.CGAgents.open()", "window.CGAgents.count()"]
      gate_pipeline: ["GATE-AG-001: providers.list", "GATE-AG-002: per agent state + actions", "GATE-AG-003: tools rows click existing elements"]
      behavioral_contracts: ["Start/Show/Stop call cg.providers.*, the same calls the old panel made", "a running agent is never shown as Start"]
      error_paths: ["providers.list fails → the hub says Guardian's provider host is not reachable"]
      acceptance: ["Clear Glass: a running agent shows Show and Stop with its status; a stopped one Start; the count badge equals running agents"]

    - id: MOD-BSH-NEWTAB
      name: new-tab-page
      uuid: nexus-cg-bsh-newtab-v1-0000-2026-1021-002
      path: clear-glass/renderer/shell/newtab.js
      phase: BS10_new_tab
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        The black about:blank becomes a start page, drawn by the shell over the page area while the tab is blank (never injected into a
        site): a search box that navigates like the address bar, the Guardian agents as cards (start or open in one click), bookmarks as
        tiles, and the Snowflake state with "Open with Snowflake". It hides the moment the tab navigates.
      deps: [{ name: shell }, { name: agents-hub }]
      exports: ["window.CGNewTab.show()", "window.CGNewTab.hide()"]
      gate_pipeline: ["GATE-NT-001: blank → show", "GATE-NT-002: navigate → hide", "GATE-NT-003: content from cg and :7702 only"]
      behavioral_contracts: ["lives in the shell's DOM, not the page's", "Enter in its search box is the address bar's navigate"]
      error_paths: [":7702 unreachable → the Snowflake card says so"]
      acceptance: ["Clear Glass: a blank tab shows the search box, agent cards and bookmark tiles; typing a URL navigates"]

    - id: MOD-BSH-COPILOT-SKIN
      name: copilot-skin
      uuid: nexus-cg-bsh-copilot-skin-v1-0000-2026-1021-002
      path: clear-glass/renderer/shell/copilot.css
      phase: BS11_copilot_pane
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        The co-pilot pane redrawn on the same system: a header with the model, the route as one segmented control, messages as readable
        sans text with the user's on the right, the context chips and the mic inside one composer with Send. CSS only over the existing
        ids and classes; no behaviour changes.
      deps: [{ name: shell }]
      exports: ["renderer/shell/copilot.css"]
      gate_pipeline: ["GATE-CP-001: ids unchanged", "GATE-CP-002: composer layout"]
      behavioral_contracts: ["no rule changes what an element does"]
      error_paths: ["none: CSS only"]
      acceptance: ["Clear Glass: the mic sits inside the composer; the route toggles are one segmented row"]

    - id: MOD-BSH-AUTO-CONTEXT
      name: auto-context
      uuid: nexus-cg-bsh-auto-context-v1-0000-2026-1021-003
      path: clear-glass/src/copilot/context-need.js
      phase: BS12_context_automatic
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        James, 2026-10-21: "can you have the dom, cookies, and picks buttons migrated into copilot so he does it automatically when he needs
        it." need(message, { picks, pickedAt, now }) decides per message, deterministically (no model asked): the page (DOM) when the
        message is about the page — this page/site/form, here, read, summarise, click, fill, find, a field or button, prices, plans;
        the picks when there are some and the message points at them (this, that, it, picked, selected, element) or they were picked in
        the last two minutes; a cookie summary when it is about signing in (logged in/out, session, account, cookie, expired) — names, domain,
        expiry and whether it looks like a sign-in cookie, never a value. The bridge applies it in send(); the pane's three chips go
        (the Cookies chip never did anything: ctxCookies was toggled and never read). /ctx dom|picks|cookies on still forces one.
        Each reply says what was attached, so the choice is visible.
      deps: [{ name: copilot-cli }]
      exports: ["need(message, { picks, pickedAt, now }) → { dom, picks, cookies, why[] }", "cookieSummary(cookies, url) → { count, signIn[], soonest }"]
      gate_pipeline: ["GATE-AC-001: forced by /ctx", "GATE-AC-002: page words", "GATE-AC-003: picks pointed at or fresh", "GATE-AC-004: sign-in words"]
      behavioral_contracts: ["pure and deterministic", "a cookie value is never read into the summary"]
      error_paths: ["no session or no URL → no cookie summary, said in why"]
      acceptance: ["'summarise this page' → dom; 'what is 2+2' → nothing; 'fill this in' with a pick → dom+picks; 'am I logged in' → cookies"]

    - id: MOD-BSH-PLUGIN-SETTINGS
      name: plugin-settings
      uuid: nexus-cg-bsh-plugin-settings-v1-0000-2026-1021-004
      path: clear-glass/renderer/shell/extensions.js
      phase: BS13_plugin_settings
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        James, 2026-10-21: "make it so i can click on them t ochange their settings." Every plugin row in the 🧩 panel (and a pinned
        plugin's icon) opens that plugin's page in the same panel: back, icon, name, version, the switch; what it does; its author and
        permissions; its commands; its own settings when it has them; and "Open in Settings" for plugins whose settings live in a Settings
        section (manifest settingsSection). A plugin gives settings through a new contribution type, `settings`: the host emits its
        signature with { op: get|set|action, key, value, page, requestId } and the plugin returns one plugin:settings event carrying a
        view — fields of kind toggle, select, text, textarea, list (items with on/remove), action, info, and an optional summary (a big
        number and its label). The bridge's plugins:settings waits for that one event (3 s), so the protocol stays event-only (COS-4).
      deps: [{ name: plugin-host }, { name: shell }]
      exports: ["contribution type 'settings'", "PluginHost.list() → + author, permissions, settings (signature|null), settingsSection", "plugins:settings IPC { id, op, key, value, page } → { ok, view }", "CGExtensions.openPlugin(id)"]
      gate_pipeline: ["GATE-PS-001: row click → page", "GATE-PS-002: settings contribution → view", "GATE-PS-003: set/action → new view", "GATE-PS-004: no contribution → about, permissions, commands"]
      behavioral_contracts: ["the switch and pin keep working from the row", "a field's label and values are text, never HTML"]
      error_paths: ["no answer in 3 s → the page says the plugin did not answer", "a plugin that is off → its page says so and offers the switch"]
      acceptance: ["Clear Glass: clicking the Ad Blocker row shows its lists and the switch; clicking a list's switch calls plugins:settings set"]

    - id: MOD-BSH-ZOOM-CORE
      name: zoom-core
      uuid: nexus-cg-bsh-zoom-core-v1-0000-2026-1021-004
      path: clear-glass/src/core/zoom.js
      phase: BS14_zoom_core
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        James, 2026-10-21: "migrate page zoom to the core of clearglass." Page zoom was in two places: the window (browser.js applyZoom,
        +0.1 steps, saved per site from the renderer) and the Page Zoom plugin (driver.exec zoom, its own +0.1 and 0.25–5 bounds, never
        saved, never shown in the address bar). One core module now: Firefox's steps (30 50 67 80 90 100 110 120 133 150 170 200 240 300
        %), step(f, dir), clamp, and createZoom({ siteSettings }) that sets a page's factor, saves it per site and restores it when the
        page navigates. The window (zoom:set / zoom:step / zoom:restore IPC), the driver's zoom action (agents) and the shortcuts all go
        through it. The plugin is archived (plugins/_archive/zoom-0.60.182), not deleted (§0.3); its three commands are the ☰ menu's zoom
        row and Ctrl +/−/0, which were always core.
      deps: [{ name: site-settings }]
      exports: ["STEPS", "step(factor, dir) → factor", "clamp(f)", "createZoom({ siteSettings }) → { set(wc, f, { persist }), step(wc, dir), reset(wc), restore(wc) }", "zoom:set|step|restore IPC → { factor }"]
      gate_pipeline: ["GATE-ZM-001: step on Firefox's ladder", "GATE-ZM-002: clamp 0.3–3", "GATE-ZM-003: persist per site", "GATE-ZM-004: restore on navigate"]
      behavioral_contracts: ["one ladder for the window, the shortcuts and agents", "100% is stored as no setting (deleteKey), not as 1"]
      error_paths: ["no webContents → { ok:false } said", "bad url → not saved, still applied"]
      acceptance: ["step(1,'in') = 1.1, step(1.1,'out') = 1, step(3,'in') = 3, step(0.95,'in') = 1", "set then restore on the same site gives the saved factor"]

    - id: MOD-BSH-CTXMENU
      name: context-menu
      uuid: nexus-cg-bsh-ctxmenu-v1-0000-2026-1021-004
      path: clear-glass/renderer/shell/ctxmenu.js
      phase: BS15_context_menu
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        James, 2026-10-21: "moright click menu needs to be redone in the same themeand in relation to the mouse is way of f onthe right
        clicskk". Redrawn like Firefox's in the window's theme: a row of Back / Forward / Reload / Bookmark icons on top, then what the
        click was on — a link (open in new tab, copy link, the plugins' link rows such as Snowflake), an image (open, copy address, save),
        a selection (copy, search the web for it, ask Co-pilot), a field (undo, cut, copy, paste, select all) — then the page and Clear
        Glass rows that were there (every 0.60.182 data-action kept), each with a drawn icon and its shortcut. The toolbar's own
        right-click shows only the toolbar rows. Position: the point comes from the main process (screen.getCursorScreenPoint() less the
        window's content bounds, in the window's CSS pixels), which is where the mouse is whatever the page zoom, the display scale or
        the webview's place; params.x/y are the fallback. The menu opens down-right of the pointer and flips left or up at the edges, as
        a native menu does.
      deps: [{ name: shell }]
      exports: ["window.CGCtxMenu.open({ x, y, params, chrome })", "window:cursor IPC → { x, y, scale }", "place(x, y, w, h, vw, vh) → { left, top }"]
      gate_pipeline: ["GATE-CM-001: point from the cursor", "GATE-CM-002: sections by what was clicked", "GATE-CM-003: flip at edges", "GATE-CM-004: old actions kept"]
      behavioral_contracts: ["every data-action browser.js handles is still reachable", "labels are text, never HTML (a link or selection is data)"]
      error_paths: ["the cursor IPC fails → params.x/y plus the webview's offset, as before"]
      acceptance: ["place() flips at the right and bottom edges", "Clear Glass: a link right-click shows the link rows; the toolbar's shows only the toolbar rows; the menu's corner sits at the point given"]

    - id: MOD-BSH-PLUGIN-FIELDS
      name: plugin-import-fields
      uuid: nexus-cg-bsh-plugin-fields-v1-0000-2026-1021-005
      path: clear-glass/renderer/shell/extensions.js
      phase: BS16_import_fields
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        Two field kinds for a plugin's page, so a plugin can take files without touching a dialog itself: `import` (buttons "Import file…" /
        "Import folder…"; the shell opens the system picker through plugins:pick in the main process and sends the chosen paths as
        set(key, { paths })) and `add` (a text box and a button: set(key, text)). plugins:pick { kind: file|folder, title, multi } → { paths }
        | { canceled }. The plugin never sees the dialog, only the paths a person chose.
      deps: [{ name: plugin-host }, { name: shell }]
      exports: ["field { type: 'import', accept: ['file','folder'] }", "field { type: 'add', placeholder, button }", "plugins:pick IPC", "ClearGlass.plugins.pick(kind, opts)"]
      gate_pipeline: ["GATE-PF-001: picker in main", "GATE-PF-002: paths to the plugin"]
      behavioral_contracts: ["canceled sends nothing", "a path is shown as text"]
      error_paths: ["no window → { ok:false } said"]
      acceptance: ["Clear Glass: Import folder… on the Ad Blocker page sends set('import', { paths })"]

    - id: MOD-BSH-APPMENU
      name: app-menu
      uuid: nexus-cg-bsh-appmenu-v1-0000-2026-1021-006
      path: clear-glass/renderer/shell/menus.js
      phase: BS17_menu_consolidated
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        James, 2026-10-21: "bookmarks are meant to be able to link to the accoubt being used for the relative site not the providers. and remove the
        bookmarks from the menuconsolidate the menu, use playwright to test each ui feature in the menu. use the library for the bookmarks, context
        menu for the clearglass ui like the last 2 images, but matching the them eand dynamic to the click  v. the right clikc on dom is still not
        accuraate. still missing snowflake from tghe ocntext menu"
        The ☰ menu becomes one model (APP in menus.js), drawn icons, Firefox's groups: new tab / window / Snowflake; the account; Bookmarks
        (opens the Library on bookmarks — the list is no longer in the menu), History, Downloads, Library; Plugins and Add-ons, Site Settings,
        Background Tabs, Import from Firefox; Print, Find, Zoom; the unpinned tools under More tools; Customize Toolbar, Settings. Duplicates
        between the old hand-written rows and the model are gone; every row's target is checked by a test that clicks each one in Clear Glass.
        Reading, to confirm: "use playwright" — Clear Glass's own driver (its Playwright-shaped API) runs the tests, because his rule of
        2026-10-05 says UI is tested in Clear Glass, never Playwright (AXIOMS §4.1, CG-001b).
      deps: [{ name: shell }]
      exports: ["CGMenus.app() → rows", "CGMenus.appMenuHTML()", "CGMenus.wire(panel, close)"]
      gate_pipeline: ["GATE-AM-001: one model", "GATE-AM-002: no bookmark list", "GATE-AM-003: every row runs"]
      behavioral_contracts: ["every 0.60.184 data-action reachable (downloads, site-settings, history, library, bgtabs, customize-toolbar)", "icons drawn, not emoji"]
      error_paths: ["a row whose target is missing is not drawn and is logged"]
      acceptance: ["Clear Glass: each ☰ row clicked does what it says (a call recorded or a panel open); no Bookmarks list in the menu"]

    - id: MOD-BSH-CHROME-CTX
      name: chrome-context-menus
      uuid: nexus-cg-bsh-chrome-ctx-v1-0000-2026-1021-006
      path: clear-glass/renderer/shell/ctxmenu.js
      phase: BS18_chrome_context_menus
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        Firefox's menus for Clear Glass's own UI, in the window's theme, chosen by where the click landed (zoneOf(target)): a tab (New Tab,
        Reload Tab, Duplicate Tab, Bookmark Tab…, Move to Background, Close Tab, Close Other Tabs, Reopen Closed Tab), the tab strip (New Tab,
        Reopen Closed Tab), a bookmark (Open, Open in New Tab, Open in New Agent Window, Edit Bookmark…, Copy Link, Delete), the bookmarks bar
        (Open All Bookmarks, Add Bookmark…, Manage Bookmarks), the address bar (Undo, Cut, Copy, Paste, Paste and Go, Select All), the toolbar
        (Unpin, Customize Toolbar…); all but the address bar end with Menu Bar ✓, Bookmarks Toolbar ▸ (Always / Only on New Tab / Never) and
        Customize Toolbar…. A submenu opens beside its row and flips at the edge. Firefox's Add Folder / Add Separator / Select All Tabs /
        vertical tabs are not offered: the bookmark store has no folders and the tabs share one page, said here.
      deps: [{ name: shell }, { name: bookmarks-store }]
      exports: ["zoneOf(target) → 'tab'|'tabstrip'|'bookmark'|'bookmarks'|'urlbar'|'toolbar'", "CGCtxMenu.openChrome({ zone, x, y, target })", "bookmarksBar(mode) 'always'|'newtab'|'never'"]
      gate_pipeline: ["GATE-CC-001: zone from the click", "GATE-CC-002: rows for the zone", "GATE-CC-003: submenu placed and flipped"]
      behavioral_contracts: ["the page's own menu (MOD-BSH-CTXMENU) is unchanged", "the toolbar visibility choice is kept across restarts"]
      error_paths: ["a row whose action is missing is not drawn"]
      acceptance: ["Clear Glass: a tab right-click shows the tab rows; the bookmarks bar shows its rows; a bookmark's Delete removes it; Bookmarks Toolbar ▸ Never hides the bar"]

    - id: MOD-BSH-CTX-POINT
      name: context-point
      uuid: nexus-cg-bsh-ctx-point-v1-0000-2026-1021-006
      path: clear-glass/src/preload/webview-bridge.js
      phase: BS19_ctx_point_from_page
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        "the right clikc on dom is still not accuraate". 0.60.183 asked the main process for the cursor (screen DIPs less the content bounds),
        which goes wrong where Windows' per-monitor scaling and the window's frame disagree. Now the page itself says where: the webview's
        preload listens for contextmenu (capture) and sends its clientX/clientY to the host (sendToHost 'cg:ctx-point'); the window adds the
        webview's place and multiplies by the page zoom — CSS pixels on both sides, so no OS scaling enters. The main-process pointer is the
        fallback (a click in a cross-origin frame the preload does not run in), params.x/y the last. The menu records which it used
        (data-source) and both points, for the next screenshot. "still missing snowflake from tghe ocntext menu": the Snowflake plugin adds
        "Open this page with Snowflake" for a page right-click (its link row was there only on links).
      deps: [{ name: shell }]
      exports: ["sendToHost('cg:ctx-point', { x, y, t })", "pagePoint(rect, point, zoom) → { x, y }", "snowflake context-menu-item when:'page'"]
      gate_pipeline: ["GATE-CP2-001: page point fresh (< 1 s)", "GATE-CP2-002: pointer", "GATE-CP2-003: params"]
      behavioral_contracts: ["the page cannot send any other channel through this", "a stale point is never used"]
      error_paths: ["no page point → the pointer, said in data-source"]
      acceptance: ["pagePoint at zoom 1.5 gives rect + 1.5 × client", "Clear Glass: a page point sent before the menu event places the menu there; a page right-click lists Snowflake"]

    - id: MOD-BSH-BOOKMARK-ACCOUNTS
      name: bookmark-site-accounts
      uuid: nexus-cg-bsh-bookmark-accounts-v1-0000-2026-1021-006
      path: clear-glass/src/accounts/for-site.js
      phase: BS20_bookmark_site_accounts
      map: docs/2026-10-21-browser-shell-phasemap.spec
      description: >-
        "bookmarks are meant to be able to link to the accoubt being used for the relative site not the providers". Reading, to confirm: the
        bookmark dialog offers the accounts that are signed in to THIS site — each Clear Glass account has its own session
        (persist:agent-acct-<id>); forSite(url) reads that session's cookies for the site's domain (names only, never values) and calls an
        account "signed in" when it holds a sign-in-looking cookie (the same test as context-need's cookieSummary), "has visited" when it
        holds others. A provider's account counts for its provider's own site only (claude.ai → the claude-linked accounts). The window's own
        sign-in is always offered ("This window (as now)"). The rest are under "Other accounts", not first.
      deps: [{ name: shell }]
      exports: ["forSite({ url, accounts, cookiesFor, providers, current }) → { site, accounts: [{ id, label, state: 'signed-in'|'visited'|'provider'|'none', cookies, who }] }", "accounts:forSite IPC"]
      gate_pipeline: ["GATE-BA-001: read each account's cookies for the domain", "GATE-BA-002: classify", "GATE-BA-003: this site's first"]
      behavioral_contracts: ["no cookie value is read into the result", "an account's session is only read, never changed"]
      error_paths: ["a session that cannot be read → state 'none' with the reason"]
      acceptance: ["an account with a session cookie for news.com is 'signed-in' for news.com and 'none' for other.org; a claude account is 'provider' for claude.ai only; the dialog lists this site's accounts first"]

  events:
    shell:
      - "import.firefox.done { profile, cookies, bookmarks }"
      - "plugins.enabled { id } / plugins.disabled { id }"

  enforcement:
    gates:
      - { id: GATE-BSH-IDS, name: ids-kept, severity: fatal, check: "every 0.60.178 id present", on_failure: "build failure" }
      - { id: GATE-BSH-COPY, name: read-a-copy, severity: fatal, check: "sqlite opened on a temp copy", on_failure: "build failure" }
      - { id: GATE-BSH-COUNT, name: skips-counted, severity: high, check: "read = imported + skipped + refused", on_failure: "build failure" }
      - { id: GATE-BSH-PERSON, name: person-imports, severity: fatal, check: "import personOnly; agent tool lists only", on_failure: "build failure" }
      - { id: GATE-BSH-ISOLATED, name: cli-isolated, severity: fatal, check: "separate window, setContentProtection(true) before show", on_failure: "build failure" }
      - { id: GATE-BSH-PLUGINS, name: plugin-state-kept, severity: high, check: "disabledPlugins applied at boot", on_failure: "build failure" }

  # ## ADDENDUM 2026-10-22 (0.60.206) — MOD-BSH-COPILOT-SKIN: a closed Co-pilot takes no width
  # James, 2026-10-22, with screenshots of Idearium in Clear Glass: "aloso the ui for clearglass is cut off."
  # - Cause: renderer/shell/copilot.css (0.60.180) gave `body.cg-shell #copilot-pane` its width. That selector outranks browser.css's
  #   `#copilot-pane.hidden { width: 0 }`, so a closed pane went transparent and kept 340 px: a black strip down the right of every page
  #   (his page ended at about 1580 of 1920 px).
  # - Fix: `body.cg-shell #copilot-pane.hidden { width: 0; opacity: 0; border-left: none; }`. Nothing else changes.
  # - Proof: tests/modules/test-browser-shell.test.js BST-09b, run in Clear Glass at 1920 px. It measured 340 px before the fix and 0 after,
  #   and checks the page reaches the right edge.
  # ## ADDENDUM 2026-10-22 (0.60.210) — MOD-BSH-DESIGN: the ☰ menu's Tools and Customize toolbar, rebuilt
  # James, 2026-10-22, with a screenshot of the ☰ menu: "customize toolbar and those toolbar links, and customize toolbar need to be rebuilt for  the new ui, they are cheap and crappy, and look bad."
  # - The tool rows drew each command's text glyph (✦ ⛏ ◎ ⬡ ⏮ ⟳ ⚙) beside rows with drawn icons, and the pinned tool buttons on the toolbar did
  #   too. Each command now carries glyph (a drawn icon, renderer/shell/icons.js; a briefcase added for Fiverr gigs) and desc (one line) in
  #   src/toolbar/commands.js, the one place commands are defined; every tool button draws it; a plugin's command draws its plugin's icon.
  # - ☰ menu → Tools: the menu's own rows, a pin button on each (it pins at once), "Edit" opens Customize toolbar; Settings, which the menu has
  #   its own row for, is not listed twice; a command with no toolbar button of its own (a plugin's zoom commands) runs from the row, unpinned.
  # - Customize toolbar (renderer/shell/toolbar.css): a live preview of the toolbar, "On the toolbar" and "In the ☰ menu" lists with each
  #   tool's icon and what it does, Pin / Unpin on every row (dragging still works), counts, run-once actions as buttons, Restore defaults and
  #   Done. Every 0.60.178 id is kept; the superseded rules left browser.css (git history, §0.3). The movable tools now follow the pinned order.
  # - Proof: tests/modules/test-browser-shell.test.js BST-21 in Clear Glass (drawn icons in the bar, the menu and the editor; the menu's pin;
  #   Pin / Unpin, counts, preview; Done saves the list in order). 26/26.
  # ## ADDENDUM 2026-10-22 (0.60.211) — zoom controls on the toolbar; the start page's agents read again
  # James, 2026-10-22: "can you integrate that into clearglass, its a basic funcaiton of any browser." · "why remove the agents from new tab?"
  # - Zoom has been core since BS14 (src/core/zoom.js; the plugin archived in plugins/_archive/zoom-0.60.182, not in BUILTIN_PLUGINS). The zoom
  #   commands 0.60.210's notes named came from the test fixture's archived plugin, not his install — said here. What zoom lacked as a browser
  #   function was a place on the toolbar: 'zoom-controls' (− level +, the level resets) is a pinnable built-in tool on the same core zoom as the
  #   shortcuts, the address bar's level and the ☰ menu's Zoom row; the menu does not list it under Tools a second time.
  # - Nothing removed the start page's agents (newtab.js unchanged since 0.60.180). It read the list once; a read that failed early, or came
  #   back empty, said "Guardian's provider host is not answering" — wrong too, the list is Clear Glass's own — until another new tab. It now
  #   says what failed and reads the agents again every 3 s while open, that section only (the search box and open panels are left alone).
  # - Proof: test-browser-shell BST-22 and BST-23 in Clear Glass; 28/28.
  # ## ADDENDUM 2026-10-23 (0.60.214) — the agents hub's tools are not repeated in the ☰ menu
  # James, 2026-10-22, with a screenshot of the ☰ menu: "also still here? why? supposed to be migrated"
  # - Agent Mesh, Element Picker and NCP Providers (and Guardian scripts, Mesh HUD) live in the agents hub since BS9 (0.60.180). 0.60.210's
  #   Tools rows listed every unpinned tool and brought three back. browser.js HUB_TOOLS: the ☰ menu leaves them to the hub; Customize toolbar
  #   can still pin them and names where they live. BST-21 checks both.
  # ## ADDENDUM 2026-10-28 (0.60.269) — Settings › About
  # James, 2026-10-28: "also need a about page in the settings, where it says the version, can check for updates to electron and clearglass."
  # - src/about (info, check, newer, fetchText), bridge about:info / about:check, GET /cli/about(/check), command `glass about [--check]`,
  #   renderer/settings/sections/about.js (+ .css). Read-only: Electron from the npm registry, Clear Glass and Nexus from the repository's main
  #   branch; a newer one says how to get it, an unreachable one says so. Proof: test-about-and-nodes AN-01, AN-04.
