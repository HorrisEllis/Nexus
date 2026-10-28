spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # tab-compartments.spec — every Clear Glass tab its own compartment (its own session: account, network route such as a Snowflake instance,
  # fingerprint), recorded with COS; a link that opens a new tab opens a tab, never a bare window; a tab can pop out into a compartment window
  # and dock back into the main window.
  # Format: emerge's module spec (emerge/SPEC_COMPILER.spec), compiled by emerge/compiler/kg-builder.js at specDepth 1.0, no BLACK node
  # (tests/modules/test-substrate-spec.test.js). Phases: docs/2026-10-28-tab-compartments-phasemap.spec (`blocks:` name these modules).
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        tab-compartments
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-28T00:00:00Z
    status:      specced
    uuid:        nexus-cg-tab-compartments-spec-v1-0000-2026-1028-jamesbrooks-001
    origin: >-
      James, 2026-10-28, after Fiverr's Edit Gig opened in a bare pop-out window where none of the autofill reached: "why did fiverr open in a
      popout window? like none of the autofill works." · "lets have it run in a simulated envirement using cos. and a way to reintegrate it back
      into the main window. I want it just to open in a new tab. thats how i wANTED NEW TABS, COMPLETELY isolated tabs, that can be seperate
      accounts, snowflake instances,etc". Isolated tabs, COS, pop-out and reintegration are his; the census, the per-tab webview design and the
      contracts are the coder's.
    purpose: >-
      A tab is a compartment: its own Electron session (partition), so cookies, storage and sign-ins are its own; its own account (signed in from
      the cookie vault); its own network route (direct, or through its own Snowflake instance); its own fingerprint. Each is recorded as a COS
      compartment of kind browser-tab, so COS sees, snapshots and closes it like any other. A link that asks for a new tab opens a tab in the
      same window, in the opener's compartment (so a signed-in site stays signed in); a real popup (a sign-in window with a size) stays a window
      but is driven and dockable. A tab pops out into a frameless compartment window and docks back, carrying its compartment, URL and place.
      Automation (ClearDriver, autofill, macros, Co-pilot) reaches every tab: the window's agentId is its active tab, and each tab has its own.
    target_runtime: [electron, node]
    language_stack: [javascript]
    paradigm: [reuse-before-build, one-compartment-per-tab, compartment-record-in-cos]
    axioms: ["§8.6 reuse before build", "§1.2 nothing fails silently", "§0.3 nothing lost", "§5.2 no side door", "USER_AUTONOMY", "REVERSIBILITY"]
    deps:
      - { name: electron, version: ">=30", required: true, purpose: "<webview partition>, session.fromPartition, setWindowOpenHandler disposition" }

    census: >-
      Read in the tree 2026-10-28 (clear-glass/). Tabs: renderer/browser.js keeps a list of {id, url, title} and ONE <webview id="wv">
      (renderer/browser.html:136); switching a tab navigates that webview, so every tab in a window shares one page and one session — the reason
      accounts got whole windows (src/main/index.js:2207, §0.39.265: "Tabs inside one window share its webview"). Sessions: a window is
      persist:agent-<id> with a fingerprint context (ctxMgr.create), an account window persist:agent-acct-<id> signed in from the cookie vault,
      a routed window an in-memory cg-snow-<id> compartment (src/net/compartment.js: harden, onContents, dispose). Popups:
      src/main/compartment-window.js:72 allows every non-Idearium window.open as a bare framed BrowserWindow (Frame.popupOptions), which no
      tab, driver, autofill or macro addresses — why Fiverr's Edit Gig (target=_blank) left Clear Glass's reach. The driver finds a window's
      page through _windowPage(agentId) (src/driver/index.js:798), one webview per window. Clear Glass declares itself a COS compartment
      (clear-glass/compartment.json, cos.nexus.clear-glass); COS's compartment record is nexus.compartment/1. COS lists compartments
      (GET /api/cos/compartments, loom GET /api/compartments) but has no route to record one at runtime.

    constraints:
      - id: TC-001
        description: "A tab's session is its compartment's alone unless the tab was opened from another tab, which shares the opener's compartment."
        type: hard
        enforced_by: [GATE-TC-ISOLATION]
      - id: TC-002
        description: "A link that asks for a new tab (disposition foreground-tab / background-tab) opens a Clear Glass tab; only a sized popup (disposition new-window) opens a window."
        type: hard
        enforced_by: [GATE-TC-NEW-TAB]
      - id: TC-003
        description: "Every tab and popup is addressable by ClearDriver: the window's agentId is its active tab, tab-<id> is that tab, pop-<wcId> a popup."
        type: hard
        enforced_by: [GATE-TC-REACH]
      - id: TC-004
        description: "Popping out and docking keep the compartment (session, account, route) and the place in the page; nothing is signed out by a move."
        type: hard
        enforced_by: [GATE-TC-MOVE]
      - id: TC-005
        description: "Every tab compartment is a COS compartment record (kind browser-tab) served by Clear Glass's own route for COS to read, never by importing COS code."
        type: hard
        enforced_by: [GATE-TC-COS]

  schemas:

    - id: TabCompartment
      name: TabCompartment
      description: "One tab's compartment: what isolates it and where it lives now."
      fields:
        id:          "string — tc-<uuid>"
        kind:        "string — window (the window's own) | private (new, in memory) | persistent (new, kept) | account | route"
        partition:   "string — persist:tab-<id> | cg-snow-<id> | persist:agent-acct-<accountId> | the window's partition"
        accountId:   "string|null"
        via:         "string|null — the network route (a netPolicy route id, e.g. a Snowflake instance)"
        fingerprint: "string|null — the context manager's persona id"
        holders:     "string[] — the tabs and windows using it (it is disposed when the last closes, if in memory)"
        createdAt:   "number"
        cosId:       "string|null — its COS compartment record id"
      behavioral_contracts: ["an in-memory compartment is cleared when its last holder closes; a persistent one is kept until removed"]
      error_paths: ["a route not available → the compartment is not opened (fail closed, never direct), said"]

    - id: Tab
      name: Tab
      description: "One tab: its own webview in its window, its compartment, its address for automation."
      fields:
        id:          "number — the window's tab id"
        agentId:     "string — tab-<windowAgentId>-<id>"
        compartment: "string — a TabCompartment id"
        url:         "string"
        title:       "string"
        openerTab:   "number|null"
        wcId:        "number|null — its webview's webContents id once attached"
      behavioral_contracts: ["switching tabs shows its webview and hides the others; nothing reloads"]
      error_paths: ["a webview that crashes → the tab says so and offers reload; other tabs untouched"]

    - id: MoveRecord
      name: MoveRecord
      description: "What a pop-out or a dock carries."
      fields:
        compartment: "string"
        url:         "string"
        title:       "string"
        resume:      "object — scroll and form state (src/rewind/resume.js capture), never a password"
        from:        "string — window agentId or pop-out id"
        to:          "string"
      behavioral_contracts: ["the page opens at url in the same compartment and the resume state is put back"]
      error_paths: ["the target window gone → the move opens a new main window"]

  interfaces:

    - id: IF-TABS-UI
      name: browser-tabs
      path: clear-glass/renderer/browser.js
      description: "The window's tab list and its one webview #wv; newTab, switchTo, closeTab, reopenClosed; CGShell.newTab."
      exports: ["_tabs: newTab(url), switchTo(id), closeTab(id), reopenClosed()", "window.CGShell.newTab(url)"]
      behavioral_contracts: ["one webview per window today; switching navigates it"]
      error_paths: ["none recorded"]

    - id: IF-POPUPS
      name: compartment-window
      path: clear-glass/src/main/compartment-window.js
      description: "setWindowOpenHandler for every webview and window: Idearium pages frameless, every other popup allowed with the dark frame."
      exports: ["attach(contents)", "windowOptions(kind, features, preload)", "isCompartmentPage(url)"]
      behavioral_contracts: ["the frameless compartment window look for Idearium's pages"]
      error_paths: ["none recorded"]

    - id: IF-SESSIONS
      name: window-sessions
      path: clear-glass/src/main/index.js
      description: "openAgentWindow: persist:agent-<id> with ctxMgr.create (fingerprint), an account window signed in from the cookie vault, a routed window a hardened in-memory compartment (net/compartment.js); the content-filter and permission plugins attached per session."
      exports: ["openAgentWindow({ agentId, url, via })", "_restoreAccountWindow(agentId, partition)", "net/compartment: partitionFor, harden, onContents, dispose"]
      behavioral_contracts: ["a routed window fails closed without the context manager"]
      error_paths: ["context create failed → said, the window opens unspoofed"]

    - id: IF-DRIVER
      name: clear-driver
      path: clear-glass/src/driver/index.js
      description: "_getWebContents(agentId): wc:<id>, the page resolver, then _windowPage(agentId) — the window's one webview."
      exports: ["_getWebContents(agentId)", "_windowPage(agentId)"]
      behavioral_contracts: ["agent ids never fall back to the focused window"]
      error_paths: ["no page → null, the caller says so"]

    - id: IF-RESUME
      name: resume
      path: clear-glass/src/rewind/resume.js
      description: "resumeScript(mode): the place in a page (scroll, forms without passwords) kept and put back."
      exports: ["resumeScript(mode)"]
      behavioral_contracts: ["never a password field"]
      error_paths: ["a page that blocks storage → nothing restored, said"]

  modules:

    - id: MOD-TC-STORE
      name: tab-compartments
      uuid: nexus-cg-tab-compartments-v1-0000-2026-1028-001
      path: clear-glass/src/tabs/compartments.js
      phase: TC1_a_compartment_per_tab
      description: >-
        create({ kind, accountId, via, window }) → TabCompartment: its partition prepared the way windows' are today (ctxMgr.create for the
        fingerprint, the account's cookies restored from the vault, a route hardened by net/compartment.js, the content-filter and permission
        plugins attached — the code moved out of openAgentWindow into one prepareSession(partition, opts) both use); hold/release by tab or
        window, dispose an in-memory one when the last holder goes; list(). Each is a nexus.compartment/1-shaped record (kind browser-tab,
        parent cos.nexus.clear-glass) served at GET /cli/tabs, which COS reads as Clear Glass's child compartments (COS has no route to write a
        runtime compartment today — census — so COS pulls; nothing in clear-glass/src imports COS). IPC tab-compartment:create/list/release.
      deps: [{ name: window-sessions }]
      schema_refs: [TabCompartment]
      exports: ["prepareSession(partition, { agentId, url, via, accountId })", "create(opts) → TabCompartment", "hold(id, holder) / release(id, holder)", "list() → TabCompartment[]"]
      gate_pipeline: ["GATE-TC1-001: kind valid", "GATE-TC1-002: session prepared (fail closed on a route)", "GATE-TC1-003: held", "GATE-TC1-004: served as a compartment record"]
      behavioral_contracts: ["openAgentWindow uses prepareSession, so a window and a tab are isolated the same way", "the last release of an in-memory compartment clears it"]
      error_paths: ["COS not running → the compartment works; its record is there when COS reads it"]
      acceptance: ["two private compartments do not share a cookie", "an account compartment is signed in from the vault", "a route compartment fails closed without the context manager"]

    - id: MOD-TC-WEBVIEWS
      name: tab-webviews
      uuid: nexus-cg-tab-webviews-v1-0000-2026-1028-001
      path: clear-glass/renderer/tabs/webviews.js
      phase: TC2_one_webview_per_tab
      description: >-
        Each tab owns its <webview> with its compartment's partition, created on newTab and removed on closeTab; switchTo shows one and hides the
        rest (no reload). Every place browser.js reads the one #wv reads the active tab's webview through activeWebview(); the window's agentId
        resolves, in the driver's _windowPage, to the active tab's webContents, and tab-<window>-<id> to that tab's. The tab strip shows the
        compartment (a coloured edge and its name: account, route, private).
      deps: [{ name: browser-tabs }, { name: clear-driver }, { name: tab-compartments }]
      schema_refs: [Tab, TabCompartment]
      exports: ["activeWebview()", "webviewFor(tabId)", "tabs: newTab(url, { compartment, openerTab }), switchTo, closeTab", "driver: tab-<window>-<id> agent ids"]
      gate_pipeline: ["GATE-TC2-001: webview per tab", "GATE-TC2-002: active tab shown", "GATE-TC2-003: #wv readers use activeWebview", "GATE-TC2-004: driver resolves the active tab"]
      behavioral_contracts: ["switching tabs keeps each page's state", "every existing browser.js feature works on the active tab"]
      error_paths: ["a tab's webview crashes → that tab shows it, others go on"]
      acceptance: ["tested in Clear Glass: two tabs on one site in different compartments are signed in as different accounts; switching keeps both pages; the driver types into the active tab"]

    - id: MOD-TC-LINKS
      name: links-open-tabs
      uuid: nexus-cg-links-open-tabs-v1-0000-2026-1028-001
      path: clear-glass/src/main/compartment-window.js
      phase: TC3_links_open_tabs
      description: >-
        In setWindowOpenHandler: a site's request with disposition foreground-tab or background-tab is denied as a window and sent to the opener's
        window as cg:open-tab { url, openerWcId, background }, which opens a tab in the opener's compartment; disposition new-window (a sized
        popup: sign-in, payment) still opens a window, now registered with the driver as pop-<wcId> and given a Dock button. Idearium's pages keep
        their frameless windows.
      deps: [{ name: compartment-window }, { name: tab-webviews }]
      schema_refs: [Tab]
      exports: ["decide({ url, disposition, features }) → 'tab' | 'popup' | 'compartment-page'", "the cg:open-tab message"]
      gate_pipeline: ["GATE-TC3-001: disposition read", "GATE-TC3-002: tab → opener's window", "GATE-TC3-003: popup → window, driver-registered"]
      behavioral_contracts: ["a target=_blank link opens a tab, signed in as its opener", "a sign-in popup still reaches its opener (window.opener kept)"]
      error_paths: ["the opener's window gone → a new main window with the tab"]
      acceptance: ["decide() unit cases for each disposition", "in Clear Glass: a target=_blank link opens a tab in the same window and compartment"]

    - id: MOD-TC-MOVE
      name: pop-out-and-dock
      uuid: nexus-cg-pop-out-dock-v1-0000-2026-1028-001
      path: clear-glass/src/tabs/move.js
      phase: TC4_pop_out_and_dock
      description: >-
        popOut(tab) → a frameless compartment window (compartment-window.js's look) holding the tab's compartment, opened at its URL with its
        resume state; dock(popout | popup, { window }) → a tab in the main window (or the window named), same compartment, URL and place; the tab
        menu's "Pop out", the pop-out's and popup's "Dock into tab". Moves are MoveRecords in the activity.
      deps: [{ name: tab-compartments }, { name: tab-webviews }, { name: resume }]
      schema_refs: [MoveRecord, TabCompartment]
      exports: ["popOut(tabRef) → { windowId }", "dock(windowRef, { window }) → { tabId }", "IPC tab:pop-out, tab:dock"]
      gate_pipeline: ["GATE-TC4-001: compartment held by the target first", "GATE-TC4-002: page opened with resume", "GATE-TC4-003: source released"]
      behavioral_contracts: ["the compartment is held by the destination before the source lets go, so an in-memory one is never cleared mid-move"]
      error_paths: ["resume refused by the page → the URL alone, said"]
      acceptance: ["a signed-in tab popped out is still signed in; docked back, still signed in, at the same scroll"]

    - id: MOD-TC-CHOOSER
      name: new-tab-chooser
      uuid: nexus-cg-new-tab-chooser-v1-0000-2026-1028-001
      path: clear-glass/renderer/tabs/chooser.js
      phase: TC5_new_tab_chooser
      description: >-
        The new-tab button's menu (and Ctrl+Shift+T's sibling): New tab (the window's compartment), New private tab, New tab as an account (each
        account), New tab through a route (direct, each Snowflake instance); a link's context menu gets the same "Open link in…". A tab's
        compartment shown in its strip and in the Processes screen.
      deps: [{ name: tab-compartments }, { name: tab-webviews }]
      schema_refs: [TabCompartment]
      exports: ["the chooser menu", "context menu rows 'Open link in…'"]
      gate_pipeline: ["GATE-TC5-001: list accounts and routes", "GATE-TC5-002: create the compartment", "GATE-TC5-003: open the tab"]
      behavioral_contracts: ["the plain new-tab click keeps today's behaviour (the window's compartment)"]
      error_paths: ["no accounts / no routes → those rows say how to add one"]
      acceptance: ["tested in Clear Glass: a private tab and an account tab side by side, each its own sign-in"]

  events:
    tabs:
      - "tab.compartment { id, kind, via, accountId, holders }"
      - "tab.moved { compartment, from, to, url }"

  enforcement:
    gates:
      - { id: GATE-TC-ISOLATION, name: tab-isolation, severity: fatal, check: "two compartments share no cookie or storage", on_failure: "suite red" }
      - { id: GATE-TC-NEW-TAB, name: links-open-tabs, severity: fatal, check: "foreground-tab / background-tab never opens a window", on_failure: "suite red" }
      - { id: GATE-TC-REACH, name: driver-reaches-tabs, severity: fatal, check: "the window's agentId is its active tab; tab ids and popups resolve", on_failure: "suite red" }
      - { id: GATE-TC-MOVE, name: moves-keep-compartment, severity: fatal, check: "pop out and dock keep the session", on_failure: "suite red" }
      - { id: GATE-TC-COS, name: recorded-through-route, severity: fatal, check: "COS records go through Clear Glass's route; no COS require in clear-glass/src", on_failure: "suite red" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node"
    - "per module: its acceptance lines, the UI ones in Clear Glass"
