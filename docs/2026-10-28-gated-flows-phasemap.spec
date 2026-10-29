# Clear Glass: gated flows — blocks with a gate each, the curved pointer, dropdowns one by one, Fiverr's gig editor; the Tab mode switch (2026-10-28)

origin: >-
  James, 2026-10-28: "with clearglass how do i turn this off, the accessabilit, i hit tab too many times. add a section in the settings /site
  settings. then i need automation and macros, more specifically, fiverr working with gates for each step, each gate can be like blocks. like :
  Get fiverr working. it needs to do the drop down menus. one by one, macros if needed, using erosmancer and mouse curve and the virtual input to
  simulat mouse movement. gating for each step, that way it can continue to a new page. the drop down doesn't work, also the" (his message ends
  there; the rest is asked). The asks, gates as blocks and the tools named are his; the census, the phase cut and the contracts are the coder's.

status: MAPPED 2026-10-28. Spec clear-glass/spec/gated-flows.spec.

## Ground truth (census 2026-10-28, in the spec's `census:`)
- "the drop down doesn't work": by design until now. src/autofill/gig.js:244 skips Fiverr's dropdowns ("its own widgets — copied, not filled"),
  and ClearDriver's select refuses anything that is not a native <select>.
- Macros (macro.js) run steps and stop at the first failed one; nothing checks the page after a step, so a flow cannot know it reached the
  next page. browser_action has no pointer, select or choose; the driver has pointer (curved, native or ErosmancerOS) and select.
- The Tab mode is not Clear Glass's: nothing in src/ or renderer/ changes a page on Tab. It is the site's; fiverr.com answers this sandbox
  403, so what it changes is found by FG1's probe on his machine.

## Readings (the coder's; to confirm where marked)
- "the accessabilit … i hit tab" — the site's keyboard / accessibility mode that a Tab press turns on. Until FG1 ships: click anywhere with the
  mouse (many sites drop the mode on a mouse click), or reload; if the site shows an accessibility widget, its own reset. To confirm by the probe.
- "continue to a new page" — Save & Continue between the gig editor's pages is part of the flow; Publish is not (his 0.39.301 words, FG_D3).
  To confirm.
- "each gate can be like blocks" — each step is a block on screen with its gate shown under it; a stopped run marks the block. To confirm the look.

decisions:
  FG_D1_gate_is_a_step_field:
    chosen: "a gate is a field of a macro step, run by macro.js's own loop (its snapshot, its stop at failure); no second engine"
    by_the_axioms: "§8.6 reuse before build; §10.3 one truth layer"
  FG_D2_choice_is_read_back:
    chosen: "a dropdown choice is opened and clicked with the pointer, then read back; not shown → failed, with the options seen"
    by_the_axioms: "§1.2 nothing fails silently; §0.1 evidence over memory"
  FG_D3_publish_is_his:
    chosen: "no flow publishes, sends or pays; Fiverr's flow stops before Publish"
    by_the_axioms: "USER_AUTONOMY — his words 0.39.301: 'Not automate talking or posting'"
  FG_D4_tab_mode_reverted_not_blocked:
    chosen: "'off' reverts what the site changed after a Tab; Tab still moves focus; the default 'site' changes nothing"
    by_the_axioms: "REVERSIBILITY; USER_AUTONOMY (nothing changes until he sets it)"

phases:

  FG1_keyboard_mode_switch:
    layer: foundation
    status: MAPPED
    # depends_on before 2026-10-28 first principles: [FG_D4_tab_mode_reverted_not_blocked]
    depends_on: [FG_D4_tab_mode_reverted_not_blocked, FP4_what_a_key_changed]
    files: [clear-glass/src/page/keyboard-mode.js, clear-glass/src/site-settings/keys.js, clear-glass/src/site-settings/readers.js, clear-glass/src/options/store.js, clear-glass/src/main/index.js, clear-glass/renderer/site-profile-groups.js, clear-glass/renderer/settings/sections/sites.js]
    spec: clear-glass/spec/gated-flows.spec
    blocks: [MOD-FG-TAB]
    does: >-
      The probe (what a Tab changed on this site) and the switch: page.keyboardMode 'site' | 'off', per site in Site Settings (a Page group from
      the key table) and globally in Settings › Sites; 'off' reverts the Tab's changes at each load of that site.
    proof: a test page that adds a class on Tab — off reverts it and focus still moves; the key round-trips through siteProfile

  FG2_dropdown_choose:
    layer: foundation
    status: MAPPED
    # depends_on before 2026-10-28 first principles: [FG_D2_choice_is_read_back]
    depends_on: [FG_D2_choice_is_read_back, FP2_which_option_is_meant]
    files: [clear-glass/src/page/dropdown.js, clear-glass/src/driver/index.js]
    spec: clear-glass/spec/gated-flows.spec
    blocks: [MOD-FG-CHOOSE]
    does: >-
      ClearDriver choose: native selects through select; a site's widget opened with the curved pointer (native or eros), its option found and
      clicked, the trigger read back.
    proof: a custom listbox and a native select chosen by label in Clear Glass; a missing option lists the options seen

  FG3_gate_per_step:
    layer: backend
    status: MAPPED
    # depends_on before 2026-10-28 first principles: [FG_D1_gate_is_a_step_field]
    depends_on: [FG_D1_gate_is_a_step_field, FP3_is_the_gate_open]
    files: [lib/agent-tools/tools/clear-glass/gates.js, lib/agent-tools/tools/clear-glass/macro.js]
    spec: clear-glass/spec/gated-flows.spec
    blocks: [MOD-FG-GATES]
    does: >-
      A step's gate (url, selector, text, value, gone, timeout, settle), polled through the run's eval after the step; a closed gate stops the
      run with its evidence; run({ fromStep }) resumes.
    proof: a two-page flow crosses on its url gate; a gate that never holds stops with saw and why; a macro without gates is unchanged

  FG4_pointer_and_choose_steps:
    layer: integration
    status: MAPPED
    depends_on: [FG2_dropdown_choose, FG3_gate_per_step]
    files: [lib/agent-tools/tools/browser/browser-action.js, lib/agent-tools/tools/clear-glass/macro.js, clear-glass/src/ipc/bridge.js]
    spec: clear-glass/spec/gated-flows.spec
    blocks: [MOD-FG-POINTER-STEPS]
    does: browser_action pointer, select and choose; a block's via (native | eros) reaches the driver; person and agent runs share the path
    proof: a macro with a choose block and a pointer block runs through the driver as a person

  FG5_fiverr_gig_flow:
    layer: integration
    status: MAPPED
    # depends_on before 2026-10-28 first principles: [FG4_pointer_and_choose_steps, FG_D3_publish_is_his, TC3_links_open_tabs]
    depends_on: [FG4_pointer_and_choose_steps, FG_D3_publish_is_his, TC3_links_open_tabs, FP5_the_pricing_page_blocks]
    files: [clear-glass/src/autofill/gig-flow.js, clear-glass/src/autofill/gig.js, clear-glass/src/ipc/bridge.js, clear-glass/renderer/gig-panel.js]
    spec: clear-glass/spec/gated-flows.spec
    blocks: [MOD-FG-FIVERR]
    does: >-
      A gated macro from a written gig, page by page through Fiverr's gig editor, each dropdown one by one, url gates between pages, stopping
      before Publish; the gig panel's "Fill step by step".
    proof: the flow's blocks for a sample gig (dropdowns, gates, no Publish); live on Fiverr on his machine, the stopped block named if a label differs

  FG6_blocks_ui:
    layer: ui
    status: DEFERRED 2026-10-28 — no fact needs it yet (first principles, docs/2026-10-28-first-principles-phasemap.spec); kept
    depends_on: [FG3_gate_per_step]
    files: [clear-glass/renderer/settings/sections/macros.js, clear-glass/renderer/settings/sections/macros.css]
    spec: clear-glass/spec/gated-flows.spec
    blocks: [MOD-FG-BLOCKS-UI]
    does: Settings › Macros draws a macro's steps as blocks with their gates; a run marks each block; "Resume from here" on a stopped one
    proof: in Clear Glass, a gated macro's blocks and a stopped run's mark

## ADDENDUM 2026-10-28 — FG5 waits on TC3 (links open as tabs)
James, 2026-10-28: "why did fiverr open in a popout window? like none of the autofill works." · "I want it just to open in a new tab."
Fiverr's Edit Gig is a target=_blank link that Clear Glass opened as a bare window no flow can reach (compartment-window.js:72). The Fiverr
flow therefore depends on TC3_links_open_tabs (docs/2026-10-28-tab-compartments-phasemap.spec): Edit Gig opens as a tab in the same
compartment, where the flow's blocks run.

## ADDENDUM 2026-10-28 — first principles: each phase stands on its deterministic core
James, 2026-10-28: "only good iudeas. we need to first principles this. only whats needed for a fact. dags use deterministic, and only. then
build from that.the determinisitci is the foundation".
Map: docs/2026-10-28-first-principles-phasemap.spec (spec clear-glass/spec/flow-cores.spec). Each page-touching phase here now depends on the
pure function it calls: FG1 on FP4 (what a Tab changed: the probe comes before any undo), FG2 on FP2 (which option is meant), FG3 on FP3
(is the gate open), FG5 on FP5 (the pricing page's blocks, from his screenshot; the editor's other pages wait on a page read). FG6 is deferred:
no fact needs it yet. The earlier depends_on lines are kept as comments above each phase (§0.3).

## ADDENDUM 2026-10-28 (0.60.221) — FG2 built (choose), and the gig fill uses it
James, 2026-10-28: "stop. just get fiverr working." ClearDriver choose: by selector, or by column + row label / shown text by position; native select through select; a widget opened with the
curved pointer (via native or eros), the option matched (FP2), clicked and read back. The gig fill chooses each tier's DELIVERY TIME after
typing. Drift from MOD-FG-CHOOSE: no typed search inside a dropdown yet (no fact needs it). Also fixed, outside the map: gig.js counted
Fiverr's placeholder-only pricing boxes as low, under the fill's floor. Proof: test-fiverr-works 5/5.

## ADDENDUM 2026-10-28 (0.60.222) — the fill detects the page; the picker teaches it the elements
James, 2026-10-28: "like autofill should detect pages, so it can know when to paste, or detect the actual elements. like hook into the element picker, mayne use it for correcting or creating macros/automation"
Said with screenshots of Fiverr's Overview (Suggested categories, Service type, Gig metadata) and Scope & Pricing. Built on what existed:
the page reader (readPage), page-memory (now also keeps targets: a picked element per site, page and part), the element picker's pick
(its xpath), option-match. New: src/autofill/gig-pages.js (pure: gigPage, PARTS, targetKey, suggestedCategory); bridge _gigFill reads the
page first and does that page's parts, a learned target first; _gigAssign turns a pick into a selector unique to that element and keeps it
(IPC autofill:gig:assign, cg.autofill.gigAssign); the gig panel lists what was not found with "Point at it".
Not built yet, said: "correcting or creating macros" — a pick replacing a failed macro step's selector, and a fill saved as a macro. They
need macro steps that can choose (FG4), so they wait on it. Gig metadata's checkbox tabs and the Service type dropdown need his values
(the gig does not hold them). Proof: test-fiverr-works 9/9.

## ADDENDUM 2026-10-28 (0.60.223) — choose finds options that are plain divs
James, 2026-10-28: "continue get it working". When no list item and no option/item-named element appears on opening, the options are what
became visible then (short, one line), still matched and read back. Proof: test-fiverr-works FW-05 (a plain-div dropdown).

## ADDENDUM 2026-10-28 (0.60.224) — the panel was never wired; his recorded choices are a page's macro
James, 2026-10-28: "continue" · "like none of the autofill works" · "use it for correcting or creating macros/automation".
- Root cause found: gig-panel.js and page-map-panel.js read window.cg, never set; both returned on load. browser.js now sets it. FW-10 fails
  without it.
- "creating macros": a recording on an editor page is kept as 'fiverr <page>' (gig-pages.pageMacroSteps: no navigation, a wait_for before
  each click, his buttons left out by their text) and replayed by every fill of that page. A recorded checkbox is a check with a state.
  browser_action names check / select / choose / pointer (the first part of FG4). Correcting a failed step with a pick is still to build.

## ADDENDUM 2026-10-28 (0.60.265) — this map's releases renumbered
James, 2026-10-28: "no patch file. unless idearium can run it. like i can drag it into the versionium tab and import". Merging main in (to make
a change pack he can drop on his Nexus), main already had its own 0.60.221–0.60.224 and went up to 0.60.260. The releases named above as
0.60.221, 0.60.222, 0.60.223 and 0.60.224 are 0.60.261, 0.60.262, 0.60.263 and 0.60.264; their changelogs say so. The text above is kept as
written (§0.3).

## ADDENDUM 2026-10-28 (0.60.269) — the Fiverr automation is node files he edits
James, 2026-10-28: "can you move the fiverr automation and macros to actual node files imported in the settings. like .node files. I want to be able to edit what you added." · "those are supposed to be what you added but in node files. also need a about page in the settings, where it says the version, can check for updates to electron and clearglass."
The four node files he handed over ship in clear-glass/automation/nodes, are seeded once into the Settings › Automation library (lib/automation-
nodes.js seedBundled; his edit and delete stand), and the gig fill's delivery pick runs his "Fiverr gig - choose delivery" macro (imported
from its file the first time). The built-in pick stays as the fallback, said. Proof: test-about-and-nodes AN-02, AN-03.

# ADDENDUM 2026-10-28 (0.60.271) — choose at a person's pace (openWait / pickWait / settleWait) and pointer via 'auto' (Eros, else
# Electron input, said). James: "it needs delays in between the dropdown menu. like drop down and then click."

# ADDENDUM 2026-10-28 (0.60.273) — FG1 built; the choose fix from his picture 3
# James, 2026-10-28: "need the accessability settings, per site. look at picture 2.  image 3, its the drop downs"
# FG1 BUILT. The key is accessibility.tabMode ('site' | 'off'), in its own Accessibility group, which is his word (the map said page.keyboardMode;
#   renamed to his word). It is applied in main _siteOnLoad, via src/page/keyboard-mode.js offScript, on state-diff (FP4). Unlike the map's
#   probe-then-revert-at-load, it reverts after each Tab, because his picture 2 came from a Tab on that page, not from a stored mode.
#   To confirm on his machine: window.__cgTabOff.last shows what was undone.
# FG2: an option is scrolled within its list (pointer scroll:'within'), with one direct click when the pointer's click does not take
#   (clickedBy 'page'), and it is still read back.
# Proof: test-site-a11y-and-dropdowns 3/3; SA-03 fails on 0.60.272.

# ADDENDUM 2026-10-28 (0.60.275) — KB1–KB3: dropdowns that wait and use the keyboard; keys bound to elements, per site
# James, 2026-10-28, with a screenshot of the gig's Scope & Pricing (BASIC "6 DAYS DELIVERY", STANDARD and PREMIUM still "DELIVERY TIME"):
#   "the drop downs. it needs to wait for the system. it keeps freezing. and then, opens the drop down, doesn't click. could always try arrows,
#   or a number. any way you can add all of that to the keybindings. like elements to keys, per site?"
# Decided by his axioms: §8.6 reuse (the shortcut catcher in main, the element picker, ClearDriver choose and pressKey; no second key system),
# §1.2 nothing silent (each try said in the result; a site key that fails is logged with the key and the site), REVERSIBILITY (a site key is
# removed in Settings or `glass keys unbind`).
#
#  KB1_choose_waits_and_keys:
#    status: BUILT 0.60.275
#    depends_on: [FG2_dropdown_choose, FG_D2_choice_is_read_back]
#    files: [clear-glass/src/driver/index.js, tests/modules/test-dropdown-keys.test.js, tests/modules/test-fiverr-pace.test.js]
#    does: >-
#      waits until the page answers fast before each step (_waitResponsive); reads options until they hold still; opens again once if
#      nothing appeared; a pick that does not show tries the arrows + Enter, then the number + Enter, then a direct click — each read back,
#      said in `tried` and `clickedBy`. What is on screen before opening is kept in a page-side WeakSet, not an attribute on every element
#      (the coder's reading of "it keeps freezing", to confirm on his machine: thousands of attribute writes per choose).
#    proof: test-dropdown-keys 2/2 (options that ignore clicks; no attribute written on existing elements; a blocked page waited for)
#
#  KB2_site_keys:
#    status: BUILT 0.60.275
#    depends_on: [KB1_choose_waits_and_keys]
#    files: [clear-glass/src/shortcuts/site-keys.js, clear-glass/src/options/store.js, clear-glass/src/main/index.js, clear-glass/src/ipc/bridge.js, clear-glass/src/preload/index.js, idearium/cli/route-commands.js]
#    does: a key on a site → click | choose | key | macro on an element (CSS or the picker's XPath); it wins over a global shortcut on that site only
#    proof: test-site-keys SK-01..03
#
#  KB3_site_keys_ui:
#    status: BUILT 0.60.275
#    depends_on: [KB2_site_keys]
#    files: [clear-glass/renderer/site-keys/bind-bar.js, clear-glass/renderer/site-keys/bind-bar.css, clear-glass/renderer/browser.js, clear-glass/renderer/browser.html, clear-glass/renderer/settings/sections/shortcuts.js, clear-glass/renderer/settings/sections/shortcuts.css]
#    does: "Bind a key" after an element pick; Settings › Keyboard shortcuts › Keys on sites lists, adds and removes
#    proof: test-site-keys SK-04, SK-05 (both in Clear Glass)

# ── ADDENDUM 2026-10-29 — gated dropdowns in the node, keys in macros and automation, the bundled node upgraded, the CLI button pinned ─────
# James, 2026-10-29: "the drop downs, still aren't working. make the gates for them gated and have them check for the correct value. remember
# this is the nodes in the settings, not hardcoded, so add capabilities to the actual backend. like the gates, add the keyboard shortcuts per
# site to the macros and automation. that way we can bind arrow keys, or numbers to each drop down menu value. / the clearglass floating menu
# button, can you make that an option to pin it?"
# Grounded: macro.js ran each step and moved on (no gate checked after a step). FG3's gate-eval.js was on disk and never wired. The macro's
# urlPattern already makes it per site. Workflows reach the driver only through a macro step, and their own "Press a key" presses once.
# Bundled node files seed once ("his edit or delete stands"), so an improved node never reached him.
# Readings (the coder's, to confirm):
#  - "bind arrow keys, or numbers to each drop down menu value": a choose step can carry keysFor, a map from each option to the keys that
#    pick it ("3": "Down Down Down Enter", "14": "1 4 Enter").
#  - "pin": the floating CLI's button shows on every browser window at start and stays, until unpinned.
# KB1–KB3 (0.60.275) are entered below as real phases so lib/phase-dag.js checks them.
phases_kb:
  KB1_choose_waits_and_keys:
    spec: clear-glass/spec/gated-flows.spec
    blocks: [MOD-KB1]
    status: BUILT 0.60.275
    depends_on: [FG2_dropdown_choose, FG_D2_choice_is_read_back]
    files: [clear-glass/src/driver/index.js, tests/modules/test-dropdown-keys.test.js]
  KB2_site_keys:
    spec: clear-glass/spec/gated-flows.spec
    blocks: [MOD-KB2]
    status: BUILT 0.60.275
    depends_on: [KB1_choose_waits_and_keys]
    files: [clear-glass/src/shortcuts/site-keys.js, clear-glass/src/main/index.js]
  KB3_site_keys_ui:
    spec: clear-glass/spec/gated-flows.spec
    blocks: [MOD-KB3]
    status: BUILT 0.60.275
    depends_on: [KB2_site_keys]
    files: [clear-glass/renderer/site-keys/bind-bar.js, clear-glass/renderer/settings/sections/shortcuts.js]
  KB4_gates_on_macro_steps:
    spec: clear-glass/spec/gated-flows.spec
    blocks: [MOD-KB4]
    status: BUILT 0.60.280
    depends_on: [FP3_is_the_gate_open, FG_D1_gate_is_a_step_field, KB1_choose_waits_and_keys]
    files: [lib/agent-tools/tools/clear-glass/macro.js, lib/agent-tools/tools/clear-glass/gate-eval.js, lib/agent-tools/tools/browser/browser-action.js, clear-glass/src/driver/index.js]
    does: >-
      A macro step may carry a gate, checked after the step: FG3's url, selector, text, value and gone, plus choice ({ column | row |
      selector, is }), meaning "the dropdown there now shows this value", read by the driver's new readChoice. An open gate goes on. A closed
      one is polled up to timeoutMs. If it stays closed the step runs again, up to retries (default 2), and then the run stops with what the
      gate saw. The gate is validated when the macro is made.
  KB5_keys_in_macros_and_automation:
    spec: clear-glass/spec/gated-flows.spec
    blocks: [MOD-KB5]
    status: BUILT 0.60.280
    depends_on: [KB4_gates_on_macro_steps, KB2_site_keys]
    files: [clear-glass/src/driver/index.js, lib/agent-tools/tools/browser/browser-action.js, lib/automation/steps.js, lib/automation/engine.js]
    does: >-
      A choose step takes pick (auto | pointer | keys | number; not `by`, which every run already uses for who acted), keys (an explicit sequence) and keysFor (per option). A macro step press_key
      takes key and times. A workflow's "Press a key" takes times. A macro bound to a site key (KB2) is the per-site keyboard shortcut.
  KB6_bundled_nodes_upgrade:
    spec: clear-glass/spec/gated-flows.spec
    blocks: [MOD-KB6]
    status: BUILT 0.60.280
    depends_on: [KB4_gates_on_macro_steps]
    files: [lib/automation-nodes.js, clear-glass/src/ipc/bridge.js, clear-glass/automation/nodes/fiverr-gig-choose-delivery.macro]
    does: >-
      A bundled node lists the fingerprints it supersedes. His copy (in the library and in the macro store) whose fingerprint is one of them
      was never edited, so it is upgraded, and the upgrade is said. An edited copy stays his, and the new one lands beside it as <name>.new,
      said. The delivery node is now gated: choose, then the gate { choice: { column: tier, is: delivery } } with 2 retries.
  KB7_pin_the_floating_cli:
    spec: clear-glass/spec/gated-flows.spec
    blocks: [MOD-KB7]
    status: BUILT 0.60.280
    depends_on: [BS6_float_cli]
    files: [clear-glass/src/main/float-cli.js, clear-glass/renderer/float-cli.js, clear-glass/renderer/float-cli.html, clear-glass/renderer/browser.js, clear-glass/renderer/settings/sections/general.js]
    does: an option floatCli.pinned (📌 in the panel, and in Settings), which shows the button on every browser window at start and keeps it

  GM1_the_fill_menu_model:
    spec: clear-glass/spec/gated-flows.spec
    blocks: [MOD-GM1]
    status: BUILT 0.60.286
    depends_on: [KB4_gates_on_macro_steps]
    files: [clear-glass/src/autofill/gig-menu.js]
    does: every part of a gig as a row to tick, with its kind, options and value
  GM2_fill_only_what_is_ticked:
    spec: clear-glass/spec/gated-flows.spec
    blocks: [MOD-GM2]
    status: BUILT 0.60.286
    depends_on: [GM1_the_fill_menu_model]
    files: [clear-glass/src/ipc/bridge.js, clear-glass/src/driver/index.js, clear-glass/src/autofill/gig-pages.js, clear-glass/src/preload/index.js]
    does: _gigFill only the ticked parts; price (typeAt) and revisions filled; IPC autofill:gig:menu
  GM3_the_menu_in_the_gig_panel:
    spec: clear-glass/spec/gated-flows.spec
    blocks: [MOD-GM3]
    status: BUILT 0.60.286
    depends_on: [GM2_fill_only_what_is_ticked]
    files: [clear-glass/renderer/gig-menu.js, clear-glass/renderer/browser.html, clear-glass/renderer/gig-panel.js]
    does: the Fill menu — checkboxes, dropdowns, in-place edits, Fill selected, a result per row

## ADDENDUM 2026-10-29 (0.60.283) — FG1 reset, FG5 the new gig's Overview
James, 2026-10-29: "The accessability man. i can't fix it." · "the autofill is still buggy. like i want autofill to do it all if possible.
can you get fiverr to work, now with the keybindings, and gates"
- FG1: a site that remembers its look loads with it on, so the Tab diff saw nothing. Added: sweepScript (classes, attributes, storage,
  cookies named as accessibility), a reset in Site settings (backup first, then removed, the site set to Off, reloaded), and Off sweeping
  at each load and keeping a removed class off. The names matched are a pattern (A11Y_RE), the coder's: a look stored under another name
  is not found, and the reset then says so with every name it looked at.
- FG5: the new gig's Overview is recognised; category and subcategory through the gated node "Fiverr gig - choose category" (built-in
  fallback); tags one by one, each gated. choose takes shows alone.
- Proof: tests/modules/test-fiverr-overview-and-a11y.test.js 5/5.
