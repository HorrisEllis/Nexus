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
