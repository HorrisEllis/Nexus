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
