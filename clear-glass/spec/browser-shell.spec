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
