spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # flow-cores.spec — the deterministic foundation under Fiverr working in Clear Glass: five pure functions, each one decision a fact demands,
  # same input → same output, no page, no window, no network. Everything that touches a page is built on these, after them.
  # Format: emerge's module spec (emerge/SPEC_COMPILER.spec), compiled by emerge/compiler/kg-builder.js at specDepth 1.0, no BLACK node
  # (tests/modules/test-substrate-spec.test.js). Phases: docs/2026-10-28-first-principles-phasemap.spec.
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        flow-cores
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-28T00:00:00Z
    status:      specced
    uuid:        nexus-cg-flow-cores-spec-v1-0000-2026-1028-jamesbrooks-001
    origin: >-
      James, 2026-10-28, on the gated-flows and tab-compartments maps: "only good iudeas. we need to first principles this. only whats needed for
      a fact. dags use deterministic, and only. then build from that.the determinisitci is the foundation". First principles, facts only and the
      deterministic foundation are his; which facts, which decisions and these five functions are the coder's reading of the census.
    purpose: >-
      Each fact in the census forces one decision. Each decision is a pure function here, tested by its inputs alone: where a page's request to
      open something goes; which dropdown option a wanted text means; whether a gate is open on a page's state; what a key press changed on a
      page; and the blocks that fill Fiverr's pricing page from a gig. The page-touching code (the popup handler, the driver's choose, the macro
      run's wait, the keyboard-mode switch, the Fiverr flow) calls these and adds only the I/O.
    target_runtime: [node, electron]
    language_stack: [javascript]
    paradigm: [pure-functions, deterministic-first, facts-only]
    axioms: ["§0.1 evidence over memory", "§3.3 map before build", "§8.6 reuse before build", "§1.2 nothing fails silently", "TRUTH_OVER_COHERENCE"]
    deps: []

    census: >-
      The facts, each read in the tree or seen on his screen, 2026-10-28.
      F1 Fiverr's Edit Gig opened as a bare window (his screenshot); compartment-window.js:72 allows every site popup as a window; a bare window
      is addressed by no tab, driver, autofill or macro → a request to open must be decided: tab, window, or Idearium compartment page.
      F2 gig.js:244 skips Fiverr's dropdowns; driver select refuses anything not a native <select> → a wanted option must be matched to the
      options a dropdown shows, and the match must be checkable afterwards.
      F3 macro.js runs steps with no check after a step; a step that moves to a new page cannot know it arrived → a gate must be decided on the
      page's state.
      F4 Clear Glass has no code that changes a page on Tab; the change is the site's and is not yet known → what a key press changed must be
      computed from before/after state (the probe), before anything is undone.
      F5 Fiverr's Scope & Pricing page, on his screen: per tier (Basic, Standard, Premium) a "Name your package" box, a "Describe the details of
      your offering" box, a DELIVERY TIME dropdown, SELECT dropdowns per feature row ("Number of APIs integrated", …), checkboxes per row
      ("Data Syncing", "Conditional Logic", …), the "Offer packages" switch on → the pricing page's blocks follow from a parsed gig. The other
      editor pages are not on record yet: their blocks wait on a page read, not a guess.

    constraints:
      - id: FC-001
        description: "Every export is pure: no I/O, no clock, no randomness; the same input gives the same output."
        type: hard
        enforced_by: [GATE-FC-PURE]
      - id: FC-002
        description: "An ambiguous or missing answer is returned as such with the candidates; never a guess."
        type: hard
        enforced_by: [GATE-FC-NO-GUESS]
      - id: FC-003
        description: "No block publishes, sends or pays (his words 0.39.301: 'Not automate talking or posting')."
        type: hard
        enforced_by: [GATE-FC-NO-PUBLISH]

  schemas:

    - id: OpenRequest
      name: OpenRequest
      description: "A page's request to open something (Electron's setWindowOpenHandler details)."
      fields:
        url:          "string"
        disposition:  "string — foreground-tab | background-tab | new-window | other | save-to-disk | default"
        features:     "string — window.open's features"
        compartment:  "string|null — the Idearium page kind when the url is one (isCompartmentPage)"
      behavioral_contracts: ["read as given; nothing fetched"]
      error_paths: ["a missing url → treated as about:blank"]

    - id: OpenDecision
      name: OpenDecision
      description: "Where the request goes, and why."
      fields:
        open:        "string — tab | window | compartment-page"
        background:  "bool — a background tab"
        why:         "string — the rule that decided"
      behavioral_contracts: ["one rule decides; it is named"]
      error_paths: ["none: every request has a decision"]

    - id: OptionMatch
      name: OptionMatch
      description: "Which of a dropdown's options a wanted text means."
      fields:
        ok:          "bool"
        index:       "int|null"
        option:      "string|null — the option's text as shown"
        by:          "string|null — exact | case | normalized | prefix | contains | number"
        candidates:  "string[] — when ambiguous: the options that tied; when missing: all options"
        why:         "string|null"
      behavioral_contracts: ["the strongest rule that yields exactly one option wins; two or more at the strongest rule → ambiguous"]
      error_paths: ["no options → ok:false, why 'no options'"]

    - id: PageState
      name: PageState
      description: "What a gate reads from a page: collected in the page by stateScript(gate), evaluated outside by evalGate."
      fields:
        url:       "string"
        text:      "string — the body's text, or the selector's element text"
        found:     "{ exists: bool, visible: bool, text: string, value: string }|null — the gate's selector"
        goneFound: "bool|null — whether the gate's gone selector still exists"
      behavioral_contracts: ["only what the gate asks for is collected"]
      error_paths: ["page gone → no state; the caller says so"]

    - id: GateCheck
      name: GateCheck
      description: "A gate evaluated on one PageState."
      fields:
        open:  "bool"
        saw:   "{ <condition>: { want, got, ok } }"
        why:   "string|null — the first condition that did not hold"
      behavioral_contracts: ["all given conditions must hold"]
      error_paths: ["an invalid gate → open:false, why from validateGate"]

    - id: StateDiff
      name: StateDiff
      description: "What changed on html/body between two snapshots."
      fields:
        classes: "{ html: string[], body: string[] } — added"
        removed: "{ html: string[], body: string[] } — removed"
        attrs:   "{ html: {name: value}, body: {name: value} } — added or changed (value null when removed)"
        sheets:  "string[] — stylesheet ids/hrefs added"
        empty:   "bool"
      behavioral_contracts: ["diff(a, a) is empty"]
      error_paths: ["a snapshot missing a part → that part treated as empty"]

    - id: FlowBlock
      name: FlowBlock
      description: "One block of a flow: an action, its data, its gate (the gated-flows Block shape)."
      fields:
        action:  "string — type | choose | check | click"
        data:    "object"
        gate:    "object|null"
        label:   "string"
      behavioral_contracts: ["every block a choose or type has a gate that its value shows"]
      error_paths: ["none"]

  interfaces:

    - id: IF-COMPARTMENT-PAGE
      name: compartment-window
      path: clear-glass/src/main/compartment-window.js
      description: "isCompartmentPage(url) → the Idearium page kind or null (loopback http(s) only); the popup handler that will call decideOpen."
      exports: ["isCompartmentPage(url)", "attach(contents)"]
      behavioral_contracts: ["pure for isCompartmentPage"]
      error_paths: ["a bad url → null"]

    - id: IF-GIG
      name: gig-autofill
      path: clear-glass/src/autofill/gig.js
      description: "parseGig(text) → a gig held to Fiverr's limits: packages.basic/standard/premium { name, description, deliveryDays, revisions, price }."
      exports: ["parseGig(text)", "LIMITS"]
      behavioral_contracts: ["never saves, never publishes"]
      error_paths: ["unparseable → { error }"]

  modules:

    - id: MOD-FC-OPEN
      name: open-decision
      uuid: nexus-cg-open-decision-v1-0000-2026-1028-001
      path: clear-glass/src/tabs/open-decision.js
      phase: FP1_where_a_request_opens
      description: >-
        decideOpen(OpenRequest) → OpenDecision. Rules, first that applies: an Idearium page → compartment-page; a url that is not http(s) (about:,
        javascript:, blob:, data:) → window, because the opener writes into it; disposition foreground-tab → tab; background-tab → tab in the
        background; new-window → window (a sized popup: sign-in, payment keeps window.opener); anything else → window, as today.
      deps: [{ name: compartment-window }]
      schema_refs: [OpenRequest, OpenDecision]
      exports: ["decideOpen(req) → OpenDecision", "RULES: string[]"]
      gate_pipeline: ["GATE-FC1-001: compartment page", "GATE-FC1-002: scheme", "GATE-FC1-003: disposition"]
      behavioral_contracts: ["a target=_blank https link → tab", "window.open(url, '', 'width=500,height=600') → window"]
      error_paths: ["unknown disposition → window, why says so"]
      acceptance: ["one case per rule, each naming its rule in why"]

    - id: MOD-FC-OPTION
      name: option-match
      uuid: nexus-cg-option-match-v1-0000-2026-1028-001
      path: clear-glass/src/page/option-match.js
      phase: FP2_which_option_is_meant
      description: >-
        normalize(s): lower case, accents folded, punctuation to spaces, spaces collapsed. matchOption(options, want) → OptionMatch, trying in
        order exact, case-insensitive, normalized, normalized prefix, normalized contains, and for a number the option whose first number equals
        it ("3" → "3 days"); the first rule with exactly one hit wins, two or more at that rule is ambiguous. shows(shown, option) → bool: the
        read-back check after a choice.
      deps: []
      schema_refs: [OptionMatch]
      exports: ["normalize(s)", "matchOption(options, want) → OptionMatch", "shows(shown, option) → bool"]
      gate_pipeline: ["GATE-FC2-001: options present", "GATE-FC2-002: rules in order", "GATE-FC2-003: one hit or ambiguous"]
      behavioral_contracts: ["'programming & tech' finds 'Programming & Tech'", "'3' finds '3 Days' and not '30 Days'", "'Data' among 'Data Entry','Data Science' is ambiguous"]
      error_paths: ["no hit → ok:false with every option as candidates"]
      acceptance: ["each behavioural contract as a test"]

    - id: MOD-FC-GATE
      name: gate-eval
      uuid: nexus-cg-gate-eval-v1-0000-2026-1028-001
      path: lib/agent-tools/tools/clear-glass/gate-eval.js
      phase: FP3_is_the_gate_open
      description: >-
        validateGate(gate) → { ok, why } (known keys, a url as glob or /regex/ that compiles, timeoutMs and settleMs in range). stateScript(gate) →
        the page expression that collects only the PageState the gate needs. evalGate(gate, state) → GateCheck. settled(checks, settleMs) → bool:
        open only when every check in the last settleMs (by their ts) was open. urlMatches(pattern, url).
      deps: []
      schema_refs: [PageState, GateCheck]
      exports: ["validateGate(gate)", "stateScript(gate) → string", "evalGate(gate, state) → GateCheck", "settled(history, settleMs, now) → bool", "urlMatches(pattern, url)"]
      gate_pipeline: ["GATE-FC3-001: validate", "GATE-FC3-002: each condition", "GATE-FC3-003: settle"]
      behavioral_contracts: ["an empty gate is open", "every condition must hold", "the first failing condition is the why"]
      error_paths: ["invalid gate → open:false with validateGate's why"]
      acceptance: ["url glob and regex; selector visible; value equals; gone; settle over a flicker"]

    - id: MOD-FC-DIFF
      name: state-diff
      uuid: nexus-cg-state-diff-v1-0000-2026-1028-001
      path: clear-glass/src/page/state-diff.js
      phase: FP4_what_a_key_changed
      description: >-
        snapshotScript() → the page expression returning html/body classes and attributes and the stylesheet list. diffState(before, after) →
        StateDiff. revertScript(diff) → the page expression that puts back what the diff added or changed (the probe's result applied; used only
        once the probe has shown what the site does).
      deps: []
      schema_refs: [StateDiff]
      exports: ["snapshotScript() → string", "diffState(before, after) → StateDiff", "revertScript(diff) → string"]
      gate_pipeline: ["GATE-FC4-001: both snapshots", "GATE-FC4-002: per part diff"]
      behavioral_contracts: ["diff(a, a) is empty", "a class added to body appears under classes.body"]
      error_paths: ["a missing part → empty for that part"]
      acceptance: ["added, removed and changed classes, attributes and sheets"]

    - id: MOD-FC-PRICING
      name: gig-pricing
      uuid: nexus-cg-gig-pricing-v1-0000-2026-1028-001
      path: clear-glass/src/autofill/gig-pricing.js
      phase: FP5_the_pricing_page_blocks
      description: >-
        pricingBlocks(gig, { rows }) → FlowBlock[] for Fiverr's Scope & Pricing page, from the facts on his screen (F5): per tier present, type
        the package name into that tier's "Name your package" box and the description into its "Describe the details of your offering" box, each
        gated on its value; choose the tier's DELIVERY TIME (deliveryDays, matched as a number) gated on the shown choice; for each row he gives
        (rows: { label, basic, standard, premium } — a SELECT row's option or a checkbox row's true/false) the tier's choose or check. Targets are
        by tier column and row label, never a class name; a gate's selector is '$target' and a choice's gate text '$option', filled by the
        runner with the resolved control and the option actually chosen. Only type, choose and check are emitted: no Save, no Publish (FC-003).
      deps: [{ name: gig-autofill }]
      schema_refs: [FlowBlock]
      exports: ["pricingBlocks(gig, { rows }) → { blocks: FlowBlock[], why }", "TIERS", "COLUMN", "PRICING_LABELS"]
      gate_pipeline: ["GATE-FC5-001: parsed gig", "GATE-FC5-002: blocks per tier", "GATE-FC5-003: no publish"]
      behavioral_contracts: ["three tiers → three name, three description, three delivery blocks", "a row's checkbox false → check false, gated"]
      error_paths: ["a gig without packages → { blocks: [], why }"]
      acceptance: ["a sample gig's blocks: counts, gates, no save or publish"]

  events:
    cores:
      - "none: pure functions emit nothing; their callers do"

  enforcement:
    gates:
      - { id: GATE-FC-PURE, name: pure, severity: fatal, check: "the cores require nothing with I/O (no fs, net, electron, Date.now, Math.random)", on_failure: "suite red" }
      - { id: GATE-FC-NO-GUESS, name: no-guess, severity: fatal, check: "ambiguous and missing are returned with candidates", on_failure: "suite red" }
      - { id: GATE-FC-NO-PUBLISH, name: no-publish, severity: fatal, check: "no block clicks Save, Publish, Send or Pay", on_failure: "suite red" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node"
    - "tests/modules/test-flow-cores.test.js — each module's acceptance, and the purity check"

  # ── ADDENDUM 2026-10-28 (0.60.221) ──────────────────────────────────────────────────────────────────────────────────
  # James, 2026-10-28: "stop. just get fiverr working."
  # Built and used: MOD-FC-OPEN (the popup handler), MOD-FC-OPTION (ClearDriver choose). On disk, not wired: MOD-FC-GATE, MOD-FC-DIFF,
  # MOD-FC-PRICING. test-flow-cores.test.js was not written; FC1 and FC2 are proven in tests/modules/test-fiverr-works.test.js.
