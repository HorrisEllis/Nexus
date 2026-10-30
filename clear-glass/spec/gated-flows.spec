spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # gated-flows.spec — macros whose steps are blocks with a gate each, run with the curved pointer (native or ErosmancerOS virtual input),
  # dropdowns chosen one by one, a flow that continues across pages; Fiverr's gig editor as the first flow; and a per-site / global switch for
  # the keyboard (Tab) mode a site turns on.
  # Format: emerge's module spec (emerge/SPEC_COMPILER.spec), compiled by emerge/compiler/kg-builder.js at specDepth 1.0, no BLACK node
  # (tests/modules/test-substrate-spec.test.js). Phases: docs/2026-10-28-gated-flows-phasemap.spec (`blocks:` name these modules).
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        gated-flows
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-28T00:00:00Z
    status:      specced
    uuid:        nexus-cg-gated-flows-spec-v1-0000-2026-1028-jamesbrooks-001
    origin: >-
      James, 2026-10-28: "with clearglass how do i turn this off, the accessabilit, i hit tab too many times. add a section in the settings
      /site settings. then i need automation and macros, more specifically, fiverr working with gates for each step, each gate can be like
      blocks. like : Get fiverr working. it needs to do the drop down menus. one by one, macros if needed, using erosmancer and mouse curve and
      the virtual input to simulat mouse movement. gating for each step, that way it can continue to a new page. the drop down doesn't work,
      also the" (his message ends there). The features, the gates-as-blocks idea and the tools named are his; the census and the contracts are
      the coder's.
    purpose: >-
      A macro is a list of blocks. Each block is one action (navigate, click, type, choose from a dropdown, pointer move) and a gate: what must be
      true on the page before the next block runs (a URL, an element, a text, a field's value, an element gone). The run waits for each gate,
      so it can cross to a new page and carry on; a gate that does not open stops the run at that block, with the page's evidence, and the run
      can be resumed from that block. Clicks and choices go through the curved pointer: Clear Glass's own sendInputEvent path, or
      ErosmancerOS's virtual input over the DevTools protocol. Dropdowns, native <select> and a site's own widgets alike, are opened, their
      option found and clicked, and the choice read back. Fiverr's gig editor is the first flow built from a written gig, page by page; Publish
      stays his. And a site's keyboard mode, which some sites switch on at a Tab press (heavy outlines, highlighted links, wide letter
      spacing), can be turned off for that site or everywhere.
    target_runtime: [electron, node]
    language_stack: [javascript]
    paradigm: [reuse-before-build, gate-per-step, evidence-per-gate]
    axioms: ["§8.6 reuse before build", "§1.2 nothing fails silently", "§0.1 evidence over memory", "§0.3 nothing lost", "USER_AUTONOMY",
      "REVERSIBILITY", "TRUTH_OVER_COHERENCE"]
    deps:
      - { name: electron, version: ">=30", required: true, purpose: "webContents.sendInputEvent, executeJavaScript" }

    census: >-
      Read in the tree 2026-10-28. Macros: lib/agent-tools/tools/clear-glass/macro.js — named steps (browser_action, or engine:"erosmancer" with
      a targetUuid), a rewind snapshot before the first step, the run stops at the first failed step; no step checks the page after it acts
      (no gate), no resume from a step. A person's run: clear-glass/src/ipc/bridge.js runMacroAsPerson, its runStep calls the driver through
      browser_action's driverCall. browser_action (lib/agent-tools/tools/browser/browser-action.js) has click/type/hover/wait_for/eval but no
      pointer, select or choose. ClearDriver (clear-glass/src/driver/index.js): select (native <select> only, "not a <select>" otherwise),
      pointer (a curved path by sendInputEvent, via:"eros" through ErosmancerOS's /api/input), waitFor (a selector). Fiverr: src/autofill/gig.js
      fills inputs and textareas only and skips Fiverr's dropdowns by design ("Fiverr's dropdowns are its own widgets — copied, not filled",
      :244) — that is why "the drop down doesn't work". The Tab mode: Clear Glass has no code that changes a page on Tab (grep of src/ and
      renderer/ for focus-visible, keyboard-nav, a11y, high-contrast, Tab handlers: none), so the mode is the site's own; its exact trigger on
      Fiverr is not readable from here (fiverr.com answers this sandbox 403) and is found by FG1's probe on his machine.

    constraints:
      - id: FG-001
        description: "A gate is a field of a macro step, run by the macro tool's own run loop; no second automation engine."
        type: hard
        enforced_by: [GATE-FG-ONE-RUN]
      - id: FG-002
        description: "Every gate that does not open stops the run at its step and says what the page showed (url, the element or its absence, the value); nothing is skipped silently."
        type: hard
        enforced_by: [GATE-FG-EVIDENCE]
      - id: FG-003
        description: "A dropdown choice is verified: the trigger shows the chosen option, or the native select's value is it; else the choice failed."
        type: hard
        enforced_by: [GATE-FG-CHOICE]
      - id: FG-004
        description: "No flow publishes, sends or pays: the Fiverr flow stops before Publish (his words 0.39.301: 'Not automate talking or posting')."
        type: hard
        enforced_by: [GATE-FG-NO-PUBLISH]
      - id: FG-005
        description: "Turning the keyboard mode off undoes what the site changed; Tab itself still moves focus."
        type: hard
        enforced_by: [GATE-FG-TAB]

  schemas:

    - id: Gate
      name: Gate
      description: "What must hold on the page before the next block runs. Any of the conditions; all given must hold."
      fields:
        url:        "string|null — a glob or /regex/ the page's URL must match (a new page reached)"
        selector:   "string|null — an element that must exist and be visible"
        text:       "string|null — text the page (or the selector's element) must contain"
        value:      "string|null — the selector's field value (or a select's chosen text) must equal it"
        gone:       "string|null — an element that must no longer exist (a spinner, a dialog)"
        timeoutMs:  "int — how long to wait (default: the site's driver.waitTimeoutMs)"
        settleMs:   "int — the gate must hold this long (default 300), so a page mid-render is not read as done"
      behavioral_contracts: ["an empty gate is the step's own success", "the gate is polled in the page, every 200 ms, until it holds or times out"]
      error_paths: ["a bad regex → the step is refused at create, with why"]

    - id: Block
      name: Block
      description: "One step of a macro, shown as a block: its action, its data, how the pointer moves, and its gate."
      fields:
        action:     "string — a browser_action (navigate, click, type, eval, wait_for, …) or pointer | select | choose"
        data:       "object — the action's data ({selector, text}, {url}, {selector, option})"
        engine:     "string — browser_action (default) | erosmancer"
        via:        "string — native | eros: how pointer and choose move the mouse"
        gate:       "Gate|null"
        label:      "string|null — the block's name on screen"
        optional:   "bool — a failed gate is noted and the run goes on (default false)"
      behavioral_contracts: ["a block with no gate behaves as a step does today"]
      error_paths: ["unknown action → refused at create, naming the known ones"]

    - id: GateResult
      name: GateResult
      description: "What a gate saw, per block, in the run's results."
      fields:
        open:       "bool"
        waitedMs:   "int"
        url:        "string — the page's URL when the gate was read"
        saw:        "object — per condition: { want, got, ok }"
        why:        "string|null — the first condition that did not hold"
      behavioral_contracts: ["a run's results list one GateResult per gated block"]
      error_paths: ["the page gone mid-wait → open:false, why 'page closed'"]

    - id: ChoiceResult
      name: ChoiceResult
      description: "One dropdown choice: what was opened, which option, what the trigger shows after."
      fields:
        kind:       "string — native | widget"
        trigger:    "string — the selector or label of what was opened"
        option:     "string — the option's text as found"
        shown:      "string — what the trigger shows after (or the select's chosen text)"
        options:    "string[] — the options seen, when the wanted one was not found"
        via:        "string — native | eros"
      behavioral_contracts: ["shown contains option, or the choice is a failure"]
      error_paths: ["no option matches → failure listing the options seen"]

    - id: KeyboardModeDiff
      name: KeyboardModeDiff
      description: "What a site changed on html/body after a Tab press: the classes, attributes and stylesheets added — what 'off' undoes."
      fields:
        classes:    "string[] — added to html or body"
        attrs:      "{ name: value } — added or changed on html or body"
        sheets:     "string[] — <style>/<link> added (their id or href)"
        hosts:      "string[] — scripts from a known accessibility-overlay host the page loaded"
      behavioral_contracts: ["recorded by the probe; 'off' removes exactly these, and keeps removing them while the page re-adds them"]
      error_paths: ["nothing changed on Tab → the diff is empty, said: the mode is not class-based on this site"]

  interfaces:

    - id: IF-MACRO
      name: macro-tool
      path: lib/agent-tools/tools/clear-glass/macro.js
      description: "Named step lists keyed to a URL pattern; run takes a rewind snapshot, then runs each step, stopping at the first failure."
      exports: ["execute({ action: create|list|get|delete|run|export|import|bookmark|openBookmark, … })", "run's runStep option (a person's run, from the bridge)"]
      behavioral_contracts: ["a step is a browser_action call, or an ErosmancerOS execute when engine is erosmancer"]
      error_paths: ["a failed step → { ok:false, failedAtStep, error, results }"]

    - id: IF-BROWSER-ACTION
      name: browser-action
      path: lib/agent-tools/tools/browser/browser-action.js
      description: "The agent tool for one browser action; driverCall(action, data) maps an action to a ClearDriver exec."
      exports: ["execute({ action, data })", "driverCall(action, data) → { action, …data } | null", "REAL_ACTIONS"]
      behavioral_contracts: ["an action the driver has, through driver.exec"]
      error_paths: ["unknown action → error naming the known ones"]

    - id: IF-DRIVER
      name: clear-driver
      path: clear-glass/src/driver/index.js
      description: "ClearDriver: exec({ agentId, action, …args, by }); select, pointer, waitFor, eval and the rest."
      exports: ["exec(args)", "_select(agentId, { selector, value, text })", "_pointer(agentId, { selector|x,y|n, do, text, via })", "_eval(agentId, { code })"]
      behavioral_contracts: ["pointer moves along a curved path (page/field.js pointerPath), or through ErosmancerOS when via is eros"]
      error_paths: ["an agent's driving on a site where it is not allowed → refused (SP2)"]

    - id: IF-SITE
      name: site-profile
      path: clear-glass/src/site-settings/profile.js
      description: "Per-site settings: KEYS (keys.js), siteProfile(url), the readers (readers.js); the Site Settings groups draw from KEYS."
      exports: ["siteProfile(url)", "KEYS, validate, byFeature", "readers: driverPolicy(url), …"]
      behavioral_contracts: ["a new key appears in Site Settings from the table alone"]
      error_paths: ["unknown key → refused"]

    - id: IF-GIG
      name: gig-autofill
      path: clear-glass/src/autofill/gig.js
      description: "Writes a Fiverr gig (parseGig) and fills its plain fields (fillGig); the gig panel (renderer/gig-panel.js)."
      exports: ["parseGig(text)", "gigParts(gig)", "matchGigFields(domFields, gig)", "detectGig / fillGig"]
      behavioral_contracts: ["never saves, never publishes"]
      error_paths: ["no gig → refused"]

  modules:

    - id: MOD-FG-TAB
      name: keyboard-mode
      uuid: nexus-cg-keyboard-mode-v1-0000-2026-1028-001
      path: clear-glass/src/page/keyboard-mode.js
      phase: FG1_keyboard_mode_switch
      description: >-
        probeScript() records a KeyboardModeDiff: html/body classes and attributes and the stylesheets before and after a synthetic Tab, and the
        scripts from known accessibility-overlay hosts. offScript() runs at a page's load where the site's page.keyboardMode is off: it watches
        html/body (MutationObserver) for changes made within 1 s of a Tab key and puts them back, and removes stylesheets added then; Tab still
        moves focus. Key page.keyboardMode ('site' | 'off') in the site key table with a global default (options page.keyboardMode), so the
        Site Settings popup and Settings › Sites show it from the table; the global row is in Settings › Sites.
      deps: [{ name: site-profile }, { name: clear-driver }]
      schema_refs: [KeyboardModeDiff]
      exports: ["probeScript() → string", "offScript() → string", "OVERLAY_HOSTS: string[]"]
      gate_pipeline: ["GATE-FG1-001: siteProfile(url).page.keyboardMode", "GATE-FG1-002: offScript injected at load", "GATE-FG1-003: Tab's changes reverted"]
      behavioral_contracts: ["'site' (the default) changes nothing", "'off' reverts only what changed after a Tab, never the site's own styles from before"]
      error_paths: ["a site whose mode is not on html/body → the probe's diff is empty and says so"]
      acceptance: ["a page that adds class kbd-mode on Tab: with 'off' the class is gone after Tab and focus still moved", "Site Settings shows the key in a Page group"]

    - id: MOD-FG-CHOOSE
      name: dropdown-choose
      uuid: nexus-cg-dropdown-choose-v1-0000-2026-1028-001
      path: clear-glass/src/page/dropdown.js
      phase: FG2_dropdown_choose
      description: >-
        ClearDriver's choose({ selector | label, option, via }): a native <select> goes through _select; a site's own widget is opened with the
        pointer (curved, native or eros), its open options found (role option / listbox / menu items, or the newest popup's items), the one
        whose text matches scrolled into view and clicked with the pointer, then the trigger read back (ChoiceResult). Typed search boxes
        inside a dropdown are typed into first when the option is not visible. One dropdown per call; a flow chooses them one by one.
      deps: [{ name: clear-driver }]
      schema_refs: [ChoiceResult]
      exports: ["findTriggerScript({ selector, label })", "openOptionsScript({ trigger })", "shownScript({ trigger })", "driver action 'choose'"]
      gate_pipeline: ["GATE-FG2-001: trigger found", "GATE-FG2-002: native → _select", "GATE-FG2-003: pointer opens it", "GATE-FG2-004: option found and clicked", "GATE-FG2-005: read back"]
      behavioral_contracts: ["a choice not shown afterwards is a failure (FG-003)", "the options seen are returned on a miss"]
      error_paths: ["the widget does not open → failure 'did not open', with what is under the pointer"]
      acceptance: ["a page with a custom listbox: choose by label picks the option and the trigger shows it", "a native select still works through choose"]

    - id: MOD-FG-GATES
      name: macro-gates
      uuid: nexus-cg-macro-gates-v1-0000-2026-1028-001
      path: lib/agent-tools/tools/clear-glass/gates.js
      phase: FG3_gate_per_step
      description: >-
        gateScript(gate) → a page expression returning the per-condition GateResult.saw; waitGate(runStep, gate, opts) polls it through the
        run's own step function (action eval) until it holds for settleMs or times out. macro.js: a step may carry gate, label, optional, via;
        validated at create; run waits for each step's gate after the step, records GateResult per step, stops at a closed gate (unless
        optional) with failedAtStep and the evidence, and run({ fromStep }) resumes from a step without a new snapshot.
      deps: [{ name: macro-tool }, { name: browser-action }]
      schema_refs: [Gate, GateResult, Block]
      exports: ["gateScript(gate)", "waitGate(runStep, gate, { timeoutMs, settleMs }) → GateResult", "validateGate(gate) → { ok, why }"]
      gate_pipeline: ["GATE-FG3-001: validate at create", "GATE-FG3-002: step runs", "GATE-FG3-003: gate polled", "GATE-FG3-004: open → next, closed → stop with evidence"]
      behavioral_contracts: ["a macro with no gates runs exactly as before", "fromStep skips the steps before it and says so"]
      error_paths: ["eval unavailable → the gate cannot be read: closed, why said"]
      acceptance: ["a two-page flow: step 1 clicks Next, its url gate opens on page 2, step 2 types there", "a gate that never holds stops the run with saw and why"]

    - id: MOD-FG-POINTER-STEPS
      name: pointer-steps
      uuid: nexus-cg-pointer-steps-v1-0000-2026-1028-001
      path: lib/agent-tools/tools/browser/browser-action.js
      phase: FG4_pointer_and_choose_steps
      description: >-
        browser_action gains pointer, select and choose (driver.exec), so a macro step and an agent can move the mouse along the curve and choose
        from a dropdown; a block's via ('native' | 'eros') is passed to the driver. ErosmancerOS's input (via eros) is used where Clear Glass
        has it wired; else the step says so and the native curve is used only if the block allows it.
      deps: [{ name: browser-action }, { name: clear-driver }]
      schema_refs: [Block]
      exports: ["REAL_ACTIONS.pointer, .select, .choose", "driverCall for them"]
      gate_pipeline: ["GATE-FG4-001: action known", "GATE-FG4-002: driver.exec with via"]
      behavioral_contracts: ["a person's run and an agent's run take the same path (driverCall)"]
      error_paths: ["via eros not wired → error naming it"]
      acceptance: ["a macro block { action: 'choose', data: { label: 'Category', option: 'Programming & Tech' } } runs through the driver"]

    - id: MOD-FG-FIVERR
      name: fiverr-gig-flow
      uuid: nexus-cg-fiverr-gig-flow-v1-0000-2026-1028-001
      path: clear-glass/src/autofill/gig-flow.js
      phase: FG5_fiverr_gig_flow
      description: >-
        gigFlow(gig, { via }) → a gated macro for Fiverr's gig editor, built from a parsed gig: Overview (title, category, subcategory, service
        type — each dropdown one by one, each with a gate that its choice shows — then the tags, then Save & Continue, gated on the Pricing page's
        URL), Pricing (package names, descriptions, prices, delivery dropdowns), Description & FAQ, Requirements, and the run stops before
        Gallery's Publish. Targets are by label (the page reader's labels), so a renamed class on Fiverr's side does not break it; the gig panel
        gets "Fill step by step", which saves the flow as the macro "fiverr gig" and runs it as a person.
      deps: [{ name: gig-autofill }, { name: macro-tool }, { name: dropdown-choose }, { name: macro-gates }]
      schema_refs: [Block, Gate]
      exports: ["gigFlow(gig, { via, pages }) → { name, urlPattern, steps: Block[] }", "IPC gig:flow"]
      gate_pipeline: ["GATE-FG5-001: parsed gig", "GATE-FG5-002: blocks per page", "GATE-FG5-003: no Publish block (FG-004)"]
      behavioral_contracts: ["each dropdown is its own block, chosen one by one", "the last block is Save & Continue on Requirements; Publish is his"]
      error_paths: ["a page whose labels are not found → that block's gate stops the run, naming the label"]
      acceptance: ["gigFlow on a sample gig has a choose block for category, subcategory and service type, url gates between pages, and no publish block"]

    - id: MOD-FG-BLOCKS-UI
      name: blocks-ui
      uuid: nexus-cg-blocks-ui-v1-0000-2026-1028-001
      path: clear-glass/renderer/settings/sections/macros.js
      phase: FG6_blocks_ui
      description: >-
        Settings › Macros shows a macro's steps as blocks: the action and its target, the pointer (native / eros), and its gate as a strip
        under it; a run lights each block (ran, gate open, stopped here with why) and "Resume from here" on the stopped block.
      deps: [{ name: macro-tool }, { name: macro-gates }]
      schema_refs: [Block, GateResult]
      exports: ["the blocks view and its run state"]
      gate_pipeline: ["GATE-FG6-001: macros:get", "GATE-FG6-002: blocks drawn", "GATE-FG6-003: run results onto blocks"]
      behavioral_contracts: ["the stopped block shows the gate's why and saw"]
      error_paths: ["IPC down → read only, said"]
      acceptance: ["tested in Clear Glass: a gated macro shows its blocks; a stopped run marks its block and offers resume"]

    - id: MOD-KB1
      name: choose-waits-and-keys
      uuid: nexus-gated-flows-choose-waits-and-keys-v1-0000-2026-1029-001
      path: clear-glass/src/driver/index.js
      phase: KB1_choose_waits_and_keys
      description: "choose waits until the page answers quickly, reads the options until they hold still, opens again once if none appeared; a pick that does not show is tried by arrows and Enter, then by the option's number and Enter, then by a direct click, each read back; the result says what was tried and which took. Since 0.60.283 a dropdown can be found by the text it shows alone."
      deps: [{ name: dropdown-choose }]
      exports: ["_choose(agentId, { selector | column + row|shows | shows, option, pick, keys, keysFor, optionsWaitMs }) → { option, clickedBy, tried }", "_waitResponsive(wc)"]
      gate_pipeline: ["GATE-KB1-001: wait responsive → open → options stable", "GATE-KB1-002: pick by the ways in order; read back after each", "GATE-KB1-003: none took → throw with what each way did"]
      behavioral_contracts: ["a pick is never reported done without its read-back"]
      error_paths: ["no dropdown → error names the column, row or text"]
      acceptance: ["test-dropdown-keys DK-01/02; test-fiverr-overview-and-a11y FO-02 (shows alone)"]

    - id: MOD-KB2
      name: site-keys
      uuid: nexus-gated-flows-site-keys-v1-0000-2026-1029-001
      path: clear-glass/src/shortcuts/site-keys.js
      phase: KB2_site_keys
      description: "Keys bound to elements per site: on that site a key clicks an element, chooses an option in its dropdown, presses a key in the page, or runs a macro; it wins over a global shortcut there only."
      deps: [{ name: dropdown-choose }]
      exports: ["list(origin)", "bind(origin, accel, binding)", "unbind(origin, accel)", "steps(binding) → driver steps"]
      gate_pipeline: ["GATE-KB2-001: accel normalized and safe", "GATE-KB2-002: on that site, the binding's steps run as him"]
      behavioral_contracts: ["a binding is the site's only"]
      error_paths: ["an unsafe accel → refused, said"]
      acceptance: ["test-site-keys SK-01..05"]

    - id: MOD-KB3
      name: site-keys-ui
      uuid: nexus-gated-flows-site-keys-ui-v1-0000-2026-1029-001
      path: clear-glass/renderer/site-keys/bind-bar.js
      phase: KB3_site_keys_ui
      description: "After an element pick, a Bind a key bar offers to bind it; Settings › Keyboard shortcuts › Keys on sites lists, adds and removes them; agents use glass keys."
      deps: [{ name: dropdown-choose }]
      exports: ["mount({ cg })", "offer(pick)"]
      gate_pipeline: ["GATE-KB3-001: a pick → the bar; save → siteKeys:set"]
      behavioral_contracts: ["nothing is bound without his press"]
      error_paths: ["the IPC refused → the bar says why"]
      acceptance: ["test-site-keys SK-04/05 in Clear Glass"]

    - id: MOD-KB4
      name: gates-on-macro-steps
      uuid: nexus-gated-flows-gates-on-macro-steps-v1-0000-2026-1029-001
      path: lib/agent-tools/tools/clear-glass/macro.js
      phase: KB4_gates_on_macro_steps
      description: "A macro step may carry a gate checked after it runs (url, selector, text, value, gone, and choice: the dropdown there shows this value, read by the driver's readChoice); a closed gate is polled, then the step runs again up to retries, then the run stops saying what it saw; gates are validated when the macro is made."
      deps: [{ name: dropdown-choose }]
      exports: ["execute({ action: 'run', … }) with step.gate", "gate-eval validateGate(gate)"]
      gate_pipeline: ["GATE-KB4-001: step → gate → poll → retry → stop with what it saw"]
      behavioral_contracts: ["a failed step with a gate is retried like a closed gate"]
      error_paths: ["an invalid gate → the macro is refused when made"]
      acceptance: ["test-gated-dropdowns GD-01/02"]

    - id: MOD-KB5
      name: keys-in-macros-and-automation
      uuid: nexus-gated-flows-keys-in-macros-and-automation-v1-0000-2026-1029-001
      path: lib/automation/engine.js
      phase: KB5_keys_in_macros_and_automation
      description: "A choose step takes pick, keys and keysFor; press_key and a workflow's Press a key take times."
      deps: [{ name: dropdown-choose }]
      exports: ["browser step press { key, times }", "choose { pick, keys, keysFor }"]
      gate_pipeline: ["GATE-KB5-001: times clamped 1..200"]
      behavioral_contracts: ["each press is a real or in-page key as the step says"]
      error_paths: ["pick not one of auto, pointer, keys, number → refused"]
      acceptance: ["test-gated-dropdowns GD-03/06"]

    - id: MOD-KB6
      name: bundled-nodes-upgrade
      uuid: nexus-gated-flows-bundled-nodes-upgrade-v1-0000-2026-1029-001
      path: lib/automation-nodes.js
      phase: KB6_bundled_nodes_upgrade
      description: "A bundled node lists the fingerprints it supersedes; an unedited copy (library file and macro store) is upgraded and said, an edited one stays his with <file>.new beside it, a deleted one stays deleted."
      deps: [{ name: dropdown-choose }]
      exports: ["seedBundled(lib, bundled) → { upgraded, offered, seeded }", "upgradeMacro(node, io)", "bundledNode(dir, name)"]
      gate_pipeline: ["GATE-KB6-001: fingerprint in supersedes → upgrade; else keep and offer"]
      behavioral_contracts: ["his edit is never overwritten"]
      error_paths: ["an unreadable node → skipped, said"]
      acceptance: ["test-gated-dropdowns GD-04; test-about-and-nodes AN-02"]

    - id: MOD-KB7
      name: pin-the-floating-cli
      uuid: nexus-gated-flows-pin-the-floating-cli-v1-0000-2026-1029-001
      path: clear-glass/src/main/float-cli.js
      phase: KB7_pin_the_floating_cli
      description: "An option floatCli.pinned (📌 in the panel and Settings › General) shows the floating CLI button on every browser window at start and keeps it; ✕ collapses it instead of hiding."
      deps: [{ name: dropdown-choose }]
      exports: ["register({ ipcMain, BrowserWindow, isPinned, setPinned })", "IPC floatcli:pin / floatcli:pinned"]
      gate_pipeline: ["GATE-KB7-001: pin → saved → every window told"]
      behavioral_contracts: ["the option is his, kept in Clear Glass's options"]
      error_paths: ["options not ready → the pin says so"]
      acceptance: ["test-gated-dropdowns GD-05 in Clear Glass"]

    # 0.60.286 GM1–GM3 — James, 2026-10-29, after the Press & Hold page stopped the fill: "okay the autofill still isn't working, do everything
    # you can, invent, expand, anything to get fiverr operational as a source of income. need to do better than a button, make a full menu with
    # check boxes, adn drop downs if applicable."
    - id: MOD-GM1
      name: gig-fill-menu-model
      uuid: nexus-gated-flows-gig-fill-menu-model-v1-0000-2026-1029-001
      path: clear-glass/src/autofill/gig-menu.js
      phase: GM1_the_fill_menu_model
      description: "menu(gig, page) lists every part of a gig as a row a person can tick: its group (Overview, Pricing, Description, FAQ, Buyer questions), the Fiverr page it goes on, its kind (text, long text, choice with its options, yes/no, tags), its value, and whether it is ticked by default (it has a value and belongs on the open page). apply(gig, edits) returns the gig with the menu's edits; only(rows) the part keys ticked."
      deps: [{ name: dropdown-choose }]
      exports: ["menu(gig, page) → { page, rows: [{ key, label, group, page, kind, value, options?, checked }] }", "apply(gig, edits) → gig", "DELIVERY, REVISIONS, CATEGORIES"]
      gate_pipeline: ["GATE-GM1-001: gig → rows, one per part, each with its kind and options"]
      behavioral_contracts: ["a choice row offers the options Fiverr shows; the gig's own value is always one of them"]
      error_paths: ["no gig → no rows, said"]
      acceptance: ["test-gig-fill-menu GM-01: a gig with three packages gives rows for every part, price and revisions included"]

    - id: MOD-GM2
      name: gig-fill-selected
      uuid: nexus-gated-flows-gig-fill-selected-v1-0000-2026-1029-001
      path: clear-glass/src/ipc/bridge.js
      phase: GM2_fill_only_what_is_ticked
      description: "_gigFill takes only (the ticked part keys) and options (replay his recorded choices, the confidence floor): only those parts are typed, chosen or ticked; each row answers its own result. Price and revisions are filled too: price typed at the tier's column and the Price row (driver typeAt, read back), revisions chosen in the Revisions row. IPC autofill:gig:menu answers the menu for the page in the tab."
      deps: [{ name: gig-fill-menu-model }, { name: dropdown-choose }]
      exports: ["_gigFill({ gig, agentId, minConfidence, only, replay })", "IPC autofill:gig:menu", "driver action typeAt { column, row, text }"]
      gate_pipeline: ["GATE-GM2-001: the human check first (HC3)", "GATE-GM2-002: each ticked part → its way in → read back → its row's result"]
      behavioral_contracts: ["an unticked part is never touched; Save and Publish stay his"]
      error_paths: ["a part not found → its row says why, and Point at it"]
      acceptance: ["test-gig-fill-menu GM-02: only the ticked parts are filled; price typed at its column and read back"]

    - id: MOD-GM3
      name: gig-fill-menu-screen
      uuid: nexus-gated-flows-gig-fill-menu-screen-v1-0000-2026-1029-001
      path: clear-glass/renderer/gig-menu.js
      phase: GM3_the_menu_in_the_gig_panel
      description: "The gig panel's Fill menu: grouped rows with a checkbox each, the value editable in place (a dropdown for a choice, a box for text, a tick for yes/no), All / None / This page, the options (replay my choices, confidence, point when not found), and Fill selected; each row then shows its result (typed, chosen, not found with Point at it)."
      deps: [{ name: gig-fill-selected }]
      exports: ["CgGigMenu.open(gig)", "CgGigMenu.fill()"]
      gate_pipeline: ["GATE-GM3-001: open → the menu for the page → his ticks and edits → Fill selected → each row's result"]
      behavioral_contracts: ["an edit in the menu changes the gig he fills, and is kept as his last gig"]
      error_paths: ["the bridge answers no → said in the menu"]
      acceptance: ["test-gig-fill-menu GM-03 in Clear Glass: the menu lists the rows, a dropdown changes a value, Fill selected sends only the ticked keys"]

    # 2026-10-30 GF — James: "the fiverr automation. isn't working. like the autofill needs to do all the work it can. like can you fix the
    # autofill to work with all fields, and if you run into friction use the per site keybindings that I proposed."
    - id: MOD-GF1
      name: gig-fields
      uuid: nexus-gated-flows-gig-fields-v1-0000-2026-1030-001
      path: clear-glass/src/autofill/gig-fields.js
      phase: GF1_every_field_found_by_its_section
      description: "Pure page scripts for the gig parts that are not dropdowns: a field found by the words of its section (Gig title, Description), marked data-cg-part, read back; a list item (an FAQ, a buyer question) added by its own Add button, its boxes found empty, filled, confirmed with Add, and read back on the page. Never a Save, Publish or Continue button."
      deps: [{ name: gig-fill-menu-model }]
      exports: ["fieldScript(key, sectionRe, { exclude, prefer })", "readScript(key)", "clickButtonScript(re)", "listBoxesScript(kind)", "shownScript(text)", "HIS_BUTTONS"]
      gate_pipeline: ["GATE-GF1-001: a field is the nearest visible one under its section's words; an excluded section never matches"]
      behavioral_contracts: ["a button named Save, Publish, Continue, Submit, Send or Pay is never clicked by these scripts"]
      error_paths: ["no field under the section → { found:false, why } with the section's words"]
      acceptance: ["test-gig-all-fields GF-01: each script marks the right field on a page laid out like the editor"]

    - id: MOD-GF2
      name: gig-fill-every-page
      uuid: nexus-gated-flows-gig-fill-every-page-v1-0000-2026-1030-001
      path: clear-glass/src/autofill/gig-pages.js
      phase: GF2_every_editor_page_known
      description: "gigPage knows the editor's Description & FAQ, Requirements and Gallery pages (their words and the tab= in the address), and PARTS lists every part each page takes: the title on Overview, the description and FAQs, the buyer questions. The Gallery's files are his to add, and said."
      deps: [{ name: gig-fields }]
      exports: ["gigPage(read)", "PARTS", "valueOf(gig, part)"]
      gate_pipeline: ["GATE-GF2-001: a page is placed by two of its signs, or the address and one"]
      behavioral_contracts: ["a page it cannot place is said as unknown, never guessed"]
      error_paths: ["an unknown page → page null with why"]
      acceptance: ["test-gig-all-fields GF-02: every page is placed; each lists its parts"]

    - id: MOD-GF3
      name: gig-text-and-lists
      uuid: nexus-gated-flows-gig-text-and-lists-v1-0000-2026-1030-001
      path: clear-glass/src/ipc/bridge.js
      phase: GF3_text_and_lists_filled_and_read_back
      description: "_gigFill fills the title, the description (a rich editor is typed into as text input, not set), each FAQ and each buyer question, each read back off the page; one already on the page is not added twice. The driver gains insertText { selector, text }: focus, select what is there, insert as typed text, read back."
      deps: [{ name: gig-fields }, { name: gig-fill-every-page }, { name: gig-fill-selected }]
      exports: ["_gigText(agentId, part, value, section)", "_gigList(agentId, kind, items, want)", "driver action insertText { selector, text }"]
      gate_pipeline: ["GATE-GF3-001: each part → found → filled → read back; a read-back that differs is a failure with what the page shows"]
      behavioral_contracts: ["Save, Publish and Continue stay his; an FAQ or question already shown is skipped, said"]
      error_paths: ["not found or not read back → the part goes to the site key fallback, else notFound with why"]
      acceptance: ["test-gig-all-fields GF-03 in Clear Glass: title, a rich description, two FAQs and two buyer questions filled and read back"]

    - id: MOD-GF4
      name: gig-site-key-fallback
      uuid: nexus-gated-flows-gig-site-key-fallback-v1-0000-2026-1030-001
      path: clear-glass/src/shortcuts/site-keys.js
      phase: GF4_friction_goes_to_his_site_keys
      description: "A site key may name the gig part it serves (binding.part). When the fill meets friction on a part (not found, not read back, a dropdown that will not take), it looks for his keys on that site for that part and uses them: an element he bound gets the part's value typed or chosen there; a key, click or macro binding is run, then the part is read back. Each use is said (r.siteKeys)."
      deps: [{ name: gig-text-and-lists }]
      exports: ["validate(binding) keeps part", "forPart(map, url, part) → [{ accel, binding }]"]
      gate_pipeline: ["GATE-GF4-001: friction → his keys for the part → used → read back again"]
      behavioral_contracts: ["a site key is used only on its own site, only for the part it names; none bound → said, with how to bind one"]
      error_paths: ["the key ran and the part still does not read back → notFound names the key it tried"]
      acceptance: ["test-gig-all-fields GF-04 in Clear Glass: a field the fill cannot find is filled through the key he bound to it"]

    # 2026-10-30 GG1 — James: "each field/drop down/ or anything should be gated."
    - id: MOD-GG1
      name: every-part-gated
      uuid: nexus-gated-flows-every-part-gated-v1-0000-2026-1030-001
      path: clear-glass/src/ipc/bridge.js
      phase: GG1_every_part_gated
      description: "Every part the gig fill does ends at a gate (gigGate): what the page shows for it is read until it is right, then read again after the page settles, so a page that puts its own value back fails it. The checks (gigChecks) only read: a box's value, a dropdown's shown choice, a checkbox's state (checkAt read), text shown on the page. A closed gate runs the part again; still closed, his site keys for the part, gated on the element he bound; else the part says what its gate saw. The label-matching pass's boxes, the package rows and his recorded page macros (a typed step on its value, a choice on what it shows) are gated the same way. Every gate is listed in r.gates."
      deps: [{ name: gig-text-and-lists }, { name: gig-site-key-fallback }]
      exports: ["gigGate(check, { timeoutMs, settleMs }) → { open, saw, held }", "gigChecks(driver, agentId) → { text, choice, shown, allShown, checked }", "driver checkAt { read:true }", "typeAt returns selector", "pageMacroSteps adds gates"]
      gate_pipeline: ["GATE-GG1-001: part → its gate (read until right, read again settled) → retry → his keys → said"]
      behavioral_contracts: ["a part whose gate stayed closed is never counted as filled", "a gate never changes the page", "no driver → said (gatesWhy), never a pass"]
      error_paths: ["closed gate → notFound with what it saw and the keys it tried"]
      acceptance: ["test-gig-all-fields GF-05 in Clear Glass: every part has an open gate; a page that reverts the title after 250 ms is caught, tried twice, said"]

  events:
    flows:
      - "macro.gate { macro, step, open, why, by }"
      - "driver.choose { agentId, kind, option, ok }"

  enforcement:
    gates:
      - { id: GATE-FG-ONE-RUN, name: one-run-loop, severity: fatal, check: "gates are run by macro.js run; no second engine", on_failure: "suite red" }
      - { id: GATE-FG-EVIDENCE, name: gate-evidence, severity: fatal, check: "a closed gate stops with saw and why", on_failure: "suite red" }
      - { id: GATE-FG-CHOICE, name: choice-read-back, severity: fatal, check: "choose fails when the trigger does not show the option", on_failure: "suite red" }
      - { id: GATE-FG-NO-PUBLISH, name: no-publish, severity: fatal, check: "the Fiverr flow has no Publish block", on_failure: "suite red" }
      - { id: GATE-FG-TAB, name: tab-still-moves, severity: fatal, check: "keyboard mode off leaves Tab's focus move", on_failure: "suite red" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node"
    - "per module: its acceptance lines, the UI ones in Clear Glass"
