spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # macro-elements.spec — elements logged from the element picker for macros, listed in the macro editor; and a dropdown recorded as one
  # choose step (so a Fiverr dropdown that "opens but doesn't move" replays as open → read options → pick → read back).
  # Format: emerge's module spec (emerge/SPEC_COMPILER.spec), specDepth 1.0, no BLACK node. Sibling of gated-flows.spec (UG5 gate bar, KB3 key bar).
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        macro-elements
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-30T00:00:00Z
    status:      built
    uuid:        nexus-cg-macro-elements-spec-v1-0000-2026-1030-jamesbrooks-001
    origin: >-
      James, 2026-10-30: "look at clearglass macros. fiverr. which isn't working. drop down menu opens, but doesn't move. the element picker is
      supposed to be linked to the macro. like i want to be able to fix it from the element picker. like a button that says log element for
      macro. then have it show up as an option in the macro editor." The button, the editor option and the fix-from-the-picker flow are his.
    purpose: >-
      After an element pick the picker offers Log element for macro: a name and a selector worked out in the page (stable attributes first, checked
      to match that element alone; a dropdown is logged as the dropdown, not the word inside it). It is kept per site by name; logging a name again
      replaces it, which is how a macro step that misses is fixed. The macro editor's selector boxes offer the logged elements (this macro's site
      first); choosing one fills the selector. The recorder says what each click was (a dropdown's control, or an option in its list) and
      the converter turns trigger + option into one choose {selector, option}; a native select's change becomes choose too.
    target_runtime: [electron, node]
    language_stack: [javascript]
    paradigm: [reuse-before-build, evidence-per-step]
    axioms: ["§8.6 reuse before build", "§1.2 nothing fails silently", "§0.3 nothing lost", "REVERSIBILITY"]

  schemas:
    macro_element:
      fields: { name: "string, 1-60, letters digits space . : # > / -", selector: "css | null", xpath: "string | null", label: "string | null", tag: "string | null", text: "string | null", at: "epoch ms" }
      rule: "keyed by origin then name; the same name replaces; at least one of selector, xpath"

  interfaces:
    - "IPC macroElements:list | add | remove  ·  preload ClearGlass.macros.elementList() | elementAdd(url, element) | elementRemove(url, name)"
    - "GET /cli/macro-elements"

  modules:
    - id: MOD-ME1
      name: log-element-for-macro
      uuid: nexus-macro-elements-log-bar-v1-0000-2026-1030-001
      path: clear-glass/renderer/macro-elements/log-bar.js
      phase: ME1_log_from_the_picker
      description: "After a pick on an http(s) page, a bar names the element, reads its selector in the page, and saves it per site through macros.elementAdd. Stored in the options store (macroElements): getMacroElements / addMacroElement / removeMacroElement."
      deps: [{ name: element-picker }, { name: options-store }]
      exports: ["window.CGMacroElementBar.mount({ cg, wv })", "window.CGMacroElementBar.offer({ xpath, url })", "addMacroElement(url, el)", "removeMacroElement(url, name)", "getMacroElements()"]
      gate_pipeline: ["GATE-ME1-001: pick → Log element for macro → selector read in the page → saved by name → listed"]
      behavioral_contracts: ["nothing is changed on the page", "the same name replaces the earlier element", "a selector with no stable attribute is said to be a position path"]
      error_paths: ["element gone from the page → the bar says to pick again", "bad name or no selector/xpath → refused with why"]
      acceptance: ["test/macro-elements.test.js ME-01..04: log, replace by name, refusals, remove"]

    - id: MOD-ME2
      name: dropdown-recorded-as-choose
      uuid: nexus-macro-elements-dropdown-choose-v1-0000-2026-1030-001
      path: clear-glass/src/macros/recording.js
      phase: ME2_dropdown_is_one_step
      description: "The page recorder marks a click as the dropdown's control (role combobox / aria-haspopup) or as an option (role option / menuitem, with its words); a native select change carries its option's text. recordingToSteps joins trigger + option into choose, drops a pause between them, and turns a select change into choose."
      deps: [{ name: macro-recorder }, { name: driver-choose }]
      exports: ["recordingToSteps(recording, opts)", "describeStep(step) — choose"]
      gate_pipeline: ["GATE-ME2-001: recorded open + pick → one choose → replay opens, matches by words, reads the choice back"]
      behavioral_contracts: ["an option click with no trigger before it stays a click, labelled by its words"]
      error_paths: ["driver choose refuses with the options it saw when the words do not match"]
      acceptance: ["test/macro-elements.test.js ME-05: trigger+option → choose; select change → choose; lone option stays a click"]

    - id: MOD-ME3
      name: logged-elements-in-the-editor
      uuid: nexus-macro-elements-editor-v1-0000-2026-1030-001
      path: clear-glass/renderer/settings/sections/macros.js
      phase: ME3_editor_lists_logged_elements
      description: "Settings › Macros: every selector box has a Logged element… box (this macro's site first) that fills the selector; Choose from dropdown and Tick / untick are real actions with their own fields (option = the words shown); a Logged elements pane lists and deletes them."
      deps: [{ name: log-element-for-macro }]
      exports: ["Logged element… box on each selector field", "Logged elements pane", "actions choose, check"]
      gate_pipeline: ["GATE-ME3-001: step misses → log element again → Edit → choose it in the step → save"]
      behavioral_contracts: ["choosing an element only fills the box; the step is saved by the existing create path"]
      error_paths: ["elementList unavailable → the boxes simply do not appear"]
      acceptance: ["test/macros-guide.test.js still passes; the editor shows the box when elements are logged"]

  events:
    - "none new — the bar saves through IPC"

  enforcement:
    - { id: GATE-ME-REPLACE, name: same-name-replaces, severity: fatal, check: "logging a name twice leaves one element, the newer", on_failure: "suite red" }

  tests:
    - "test/macro-elements.test.js (in npm test)"
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node"
