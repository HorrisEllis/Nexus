# Clear Glass: every tab its own compartment, links open tabs, pop out and dock back (2026-10-28)

origin: >-
  James, 2026-10-28, after Fiverr's Edit Gig opened in a bare pop-out window: "why did fiverr open in a popout window? like none of the
  autofill works. Why does it do that. i have some ideas to bypass it." · then: "lets have it run in a simulated envirement using cos. and a way
  to reintegrate it back into the main window. I want it just to open in a new tab. thats how i wANTED NEW TABS, COMPLETELY isolated tabs, that
  can be seperate accounts, snowflake instances,etc". Isolated tabs, COS, links opening as tabs and reintegration are his; the census, the
  per-tab webview design and the phase cut are the coder's.

status: MAPPED 2026-10-28. Spec clear-glass/spec/tab-compartments.spec.

## Ground truth (census 2026-10-28, in the spec's `census:`)
- Why it popped out: src/main/compartment-window.js:72 allows every site popup as a bare framed window. Fiverr's Edit Gig is a target=_blank
  link, so it became a window no tab, driver, autofill or macro addresses.
- Why tabs are not isolated: all tabs of a window share ONE <webview> (renderer/browser.html:136); switching a tab navigates it. Accounts got
  whole windows instead (main/index.js:2207, 0.39.265: "Tabs inside one window share its webview"). So the isolation he wanted for tabs exists
  only per window today: persist:agent-<id> with a fingerprint, persist:agent-acct-<id> signed in from the vault, cg-snow-<id> routed.
- COS lists compartments but has no route to record one at runtime; Clear Glass is itself COS compartment cos.nexus.clear-glass.

## Readings (the coder's; to confirm where marked)
- "a simulated envirement using cos" — read as: each tab runs as its own compartment (session, account, route, fingerprint), recorded as a COS
  compartment of kind browser-tab that COS can see and close. The other reading — the page running inside a COS machine (the Debian
  compartment, compartment-environment CE1–CE7) — is heavy for one tab on his PC and slower to drive; not taken. To confirm.
- A tab opened from a link shares its opener's compartment (else Edit Gig would open signed out); a new tab he opens picks its compartment.
  To confirm.
- "reintegrate it back into the main window" — Dock: a pop-out (or a sized popup) becomes a tab of the main window, same compartment and place.

decisions:
  TC_D1_tab_is_a_compartment:
    chosen: "one webview per tab, each on its compartment's partition; the session preparation windows use today becomes one prepareSession both use"
    by_the_axioms: "§8.6 reuse (partitions, ctxMgr, the vault, net/compartment.js exist per window); his words: 'COMPLETELY isolated tabs'"
  TC_D2_links_open_tabs:
    chosen: "disposition foreground-tab / background-tab → a tab in the opener's window and compartment; new-window (sized) → a window, driven and dockable"
    by_the_axioms: "his words: 'I want it just to open in a new tab'; REVERSIBILITY (a sign-in popup keeps window.opener, so sign-in still works)"
  TC_D3_cos_reads_through_a_route:
    chosen: "tab compartments are nexus.compartment/1 records served at GET /cli/tabs; COS reads them; Clear Glass imports no COS code"
    by_the_axioms: "§5.2 no side door; the boundary rule (a route, never a new crossing)"

phases:

  TC1_a_compartment_per_tab:
    layer: foundation
    status: DEFERRED 2026-10-28 — no fact needs it yet (first principles, docs/2026-10-28-first-principles-phasemap.spec); kept as his direction
    depends_on: [TC_D1_tab_is_a_compartment, TC_D3_cos_reads_through_a_route]
    files: [clear-glass/src/tabs/compartments.js, clear-glass/src/main/index.js, clear-glass/src/net/compartment.js, clear-glass/src/ipc/bridge.js]
    spec: clear-glass/spec/tab-compartments.spec
    blocks: [MOD-TC-STORE]
    does: >-
      prepareSession(partition, opts) moved out of openAgentWindow (fingerprint, account sign-in, route hardening, content-filter and permission
      plugins); create/hold/release/list tab compartments; in-memory ones cleared with their last holder; records at GET /cli/tabs.
    proof: two private compartments share no cookie; an account compartment is signed in; a route one fails closed; openAgentWindow unchanged in behaviour

  TC2_one_webview_per_tab:
    layer: ui
    status: DEFERRED 2026-10-28 — no fact needs it yet (first principles, docs/2026-10-28-first-principles-phasemap.spec); kept as his direction
    depends_on: [TC1_a_compartment_per_tab]
    files: [clear-glass/renderer/tabs/webviews.js, clear-glass/renderer/browser.js, clear-glass/renderer/browser.html, clear-glass/src/driver/index.js, clear-glass/src/driver/page-resolver.js]
    spec: clear-glass/spec/tab-compartments.spec
    blocks: [MOD-TC-WEBVIEWS]
    does: >-
      Each tab its own webview on its compartment's partition; switching shows and hides (no reload); browser.js's 101 uses of #wv go through
      activeWebview(); the driver resolves a window's agentId to its active tab and tab-<window>-<id> to one tab; the strip shows the compartment.
    proof: in Clear Glass, two tabs on one site as two accounts; switching keeps both; the driver types into the active tab; the existing browser suites pass

  TC3_links_open_tabs:
    layer: integration
    status: MAPPED
    # depends_on before 2026-10-28 first principles: [TC2_one_webview_per_tab, TC_D2_links_open_tabs]
    depends_on: [TC_D2_links_open_tabs, FP1_where_a_request_opens]
    files: [clear-glass/src/main/compartment-window.js, clear-glass/src/main/index.js, clear-glass/renderer/browser.js, clear-glass/src/driver/index.js]
    spec: clear-glass/spec/tab-compartments.spec
    blocks: [MOD-TC-LINKS]
    does: target=_blank and Ctrl+click open a tab in the opener's window and compartment; sized popups stay windows, registered as pop-<wcId>
    proof: decide() for each disposition; in Clear Glass, a target=_blank link opens a tab signed in as its opener

  TC4_pop_out_and_dock:
    layer: integration
    status: DEFERRED 2026-10-28 — no fact needs it yet (first principles, docs/2026-10-28-first-principles-phasemap.spec); kept as his direction
    depends_on: [TC3_links_open_tabs]
    files: [clear-glass/src/tabs/move.js, clear-glass/src/main/compartment-window.js, clear-glass/src/rewind/resume.js, clear-glass/renderer/browser.js, clear-glass/src/ipc/bridge.js]
    spec: clear-glass/spec/tab-compartments.spec
    blocks: [MOD-TC-MOVE]
    does: a tab pops out into a frameless compartment window and docks back as a tab; a sized popup docks too; the compartment and place travel
    proof: a signed-in tab popped out and docked back is still signed in, at the same scroll

  TC5_new_tab_chooser:
    layer: ui
    status: DEFERRED 2026-10-28 — no fact needs it yet (first principles, docs/2026-10-28-first-principles-phasemap.spec); kept as his direction
    depends_on: [TC2_one_webview_per_tab]
    files: [clear-glass/renderer/tabs/chooser.js, clear-glass/renderer/browser.js, clear-glass/renderer/shell/shell.css]
    spec: clear-glass/spec/tab-compartments.spec
    blocks: [MOD-TC-CHOOSER]
    does: New tab / private / as an account / through a route; "Open link in…"; the compartment on the tab strip and in Processes
    proof: in Clear Glass, a private tab and an account tab side by side, each its own sign-in

## ADDENDUM 2026-10-28 — first principles: TC3 alone is needed by a fact
James, 2026-10-28: "only good iudeas. we need to first principles this. only whats needed for a fact. dags use deterministic, and only. then
build from that.the determinisitci is the foundation".
Map: docs/2026-10-28-first-principles-phasemap.spec. The fact (F1) is that Edit Gig opened as a window nothing addresses. TC3 answers it on
FP1 (decideOpen) and does not need TC2: with today's one page per window, a link-tab opens in the same session, so Fiverr stays signed in.
TC1, TC2, TC4 and TC5 are deferred, not dropped: they are his direction ("COMPLETELY isolated tabs, that can be seperate accounts, snowflake
instances") and are built when he calls for them. The earlier TC3 depends_on is kept as a comment (§0.3).

## ADDENDUM 2026-10-28 (0.60.221) — TC3 built
James, 2026-10-28: "stop. just get fiverr working." A link meant as a tab (foreground-tab / background-tab) is denied as a window and sent to the window it is in (cg:open-tab), where
renderer/browser.js opens it with _tabs.newTab, in the window's session. A sized popup stays a window. Popups are not yet driver-registered
(pop-<wcId>) or dockable: that part waits on TC4. Proof: test-fiverr-works FW-01, FW-02.

## ADDENDUM 2026-10-28 (0.60.223) — a bare window's link-tab opens in the main window
James, 2026-10-28: "continue get it working". A page in a bare window (an earlier pop-out, a provider window) has no tab strip, so TC3's
"a tab of the window it is in" had nowhere to go. attach(contents, { openTab }) sends it to the main window ('default') as a tab. Sized
popups are unchanged. This is TC4's first part, without the Dock button. Proof: test-fiverr-works FW-02.

## ADDENDUM 2026-10-28 (0.60.265) — this map's releases renumbered
James, 2026-10-28: "no patch file. unless idearium can run it. like i can drag it into the versionium tab and import". Merging main in (to make
a change pack he can drop on his Nexus), main already had its own 0.60.221–0.60.224 and went up to 0.60.260. The releases named above as
0.60.221, 0.60.222, 0.60.223 and 0.60.224 are 0.60.261, 0.60.262, 0.60.263 and 0.60.264; their changelogs say so. The text above is kept as
written (§0.3).
