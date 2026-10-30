# docs/2026-10-30-site-data-and-fiverr-dom-phasemap.spec — reset a site, cookies and logins, history as a page, the widget kept off, the DOM map
# for the Fiverr fill (SD0–SD5). Spec: clear-glass/spec/site-data.spec. His asks; the census, the causes and the cut are the coder's.

origin: >-
  James, 2026-10-30: "the accessability man... need a reset site, and a history manger rebuilt into a full page, and then a cookie manager for the
  logins and a way to clear cookies per site and reset it. continue. fiverr still not working. we need to inject the dom mapping tool i feel like."

status: "MAPPED 2026-10-30. Nothing built."

found: >-
  (1) His machine runs 0.60.297 plus another session's unpushed macro-elements work (kept in _archive/imports/2026-10-30-local-clear-glass);
  main is 0.60.316, with DD1's dropdown fill verified in a real browser and the Fiverr nodes his machine lacks. His Fiverr test ran the old code.
  (2) The yellow-on-black look on Fiverr is UserWay (the panel's own trace says so). (3) The panel's six "site's own settings" were the page's
  links: the control matcher reads class names, and UserWay stamps its classes on every element it restyles (src/page/keyboard-mode.js).

decisions:
  SD_D0_his_asks:
    chosen: "a site reset, a cookie and login manager with per-site clear and reset, history as a full page, and the DOM map before the Fiverr fill"
    by: "his, 2026-10-30 (origin)"
  SD_D1_reset_is_undoable:
    chosen: "every reset keeps a snapshot first (cookies encrypted in the vault), and Undo restores it; values never shown whole"
    by_the_axioms: "§0.3 and REVERSIBILITY (nothing a reset removes is lost without a record); §4.3 (cookie and password values are his secrets)"
  SD_D2_block_the_widget_per_site:
    chosen: "the cause is the widget, so a per-site switch blocks its script through the adblocker; A11Y2's keep-off stays for looks a site sets itself"
    by_the_axioms: "§16.7 (one rule at the cause removes the symptom everywhere it would appear); §8.6 (the adblocker exists); USER_AUTONOMY (his switch, per site)"
  SD_D3_his_machine_first:
    chosen: "before more Fiverr work, his machine-only work is reconciled onto main and his machine updated, so the next test runs the code that was verified"
    by_the_axioms: "§10.3 (two copies of Clear Glass disagree); §0.3 (his uncommitted work is not overwritten by an update); §0.1 (test the code that exists)"

phases:
  SD0_his_machine_work_onto_main:
    status: OPEN
    depends_on: [SD_D3_his_machine_first]
    files: [clear-glass/spec/macro-elements.spec, clear-glass/renderer/macro-elements, clear-glass/test/macro-elements.test.js, clear-glass/src/ipc/bridge.js, clear-glass/renderer/settings/sections/macros.js]
    spec: clear-glass/spec/site-data.spec
    blocks: [MOD-SD-RECONCILE]
    does: "merge macro-elements onto main file by file beside DD1, both suites green; then his machine updates to main"
    proof: "macro-elements.test.js and main's suite pass on one tree"
  SD1_the_accessibility_widget_kept_off:
    status: OPEN
    depends_on: [SD_D2_block_the_widget_per_site]
    files: [clear-glass/src/page/keyboard-mode.js, clear-glass/src/site-settings/keys.js, clear-glass/renderer/a11y-panel.js]
    spec: clear-glass/spec/site-data.spec
    blocks: [MOD-SD-A11Y3]
    does: "a per-site switch blocks UserWay (and the other four widgets) through the adblocker; the control matcher stops reading class names"
    proof: "no ordinary link offered as a control on a UserWay page; the widget blocked with the switch on"
  SD2_reset_a_site:
    status: OPEN
    depends_on: [SD_D1_reset_is_undoable]
    files: [clear-glass/src/site-data/reset.js, clear-glass/src/ipc/bridge.js, idearium/cli/route-commands.js]
    spec: clear-glass/spec/site-data.spec
    blocks: [MOD-SD-RESET]
    does: "snapshot, clear the chosen parts of one site, reload; Undo restores"
    proof: "a fixture site cleared, read back empty, restored"
  SD3_cookies_and_logins:
    status: OPEN
    depends_on: [SD2_reset_a_site]
    files: [clear-glass/renderer/site-data]
    spec: clear-glass/spec/site-data.spec
    blocks: [MOD-SD-COOKIES]
    does: "the cookie and login manager page, per site, values masked"
    proof: "in Clear Glass: Fiverr's login cookies marked, one deleted, the site reset and undone"
  SD4_history_as_a_full_page:
    status: OPEN
    depends_on: [SD3_cookies_and_logins]
    files: [clear-glass/renderer/history, clear-glass/renderer/browser.js]
    spec: clear-glass/spec/site-data.spec
    blocks: [MOD-SD-HISTORY]
    does: "history as a page: search, filter, group, reopen, delete; each site row opens its SD3 page"
    proof: "in Clear Glass: a Fiverr visit found and its history deleted, cookies kept"
  SD5_the_dom_map_before_the_fill:
    status: OPEN
    depends_on: [SD0_his_machine_work_onto_main, GT1_gate_timing_for_dropdowns]
    files: [clear-glass/src/autofill/gig-pages.js, clear-glass/src/dom/archaeology.js, clear-glass/src/ipc/bridge.js]
    spec: clear-glass/spec/site-data.spec
    blocks: [MOD-SD-DOMMAP]
    does: "the DOM mesh read before the fill; dropdowns located with their options; the fill and gates target mapped nodes; the map shown"
    proof: "on his gig editor: both dropdowns in the map, chosen and gated"
