# First principles under Fiverr working in Clear Glass: facts → needs → deterministic cores → the page-touching code (2026-10-28)

origin: >-
  James, 2026-10-28, on the gated-flows (FG) and tab-compartments (TC) maps: "only good iudeas. we need to first principles this. only whats
  needed for a fact. dags use deterministic, and only. then build from that.the determinisitci is the foundation". The method is his; the facts
  listed, the needs drawn from them and the cut into pure cores are the coder's reading of the census.

status: MAPPED 2026-10-28. Spec clear-glass/spec/flow-cores.spec.

## The facts (each read in the tree or seen on his screen; the spec's census holds the line numbers)
- F1 Edit Gig opened as a bare window that nothing in Clear Glass addresses (compartment-window.js:72 allows every site popup).
- F2 Fiverr's dropdowns are skipped by the gig autofill (gig.js:244) and refused by the driver's select (native <select> only).
- F3 A macro step has no check after it; a step that moves to a new page cannot know it arrived (macro.js run).
- F4 The Tab mode is the site's, not Clear Glass's; what it changes is not yet known.
- F5 The Scope & Pricing page's controls, from his screenshot (per tier: name, description, DELIVERY TIME; SELECT rows; checkbox rows).

## The needs (one per fact) and what is NOT needed for a fact
- F1 → decide where a request to open goes: a link meant as a tab opens a tab. Needs FP1, then TC3 alone.
- F2 → match a wanted option to what a dropdown shows, and check it afterwards. Needs FP2, then FG2.
- F3 → decide a gate on a page's state. Needs FP3, then FG3.
- F4 → compute what a key press changed (the probe) before undoing anything. Needs FP4, then FG1.
- F5 → the pricing page's blocks from a gig. Needs FP5, then FG4 and FG5.
- Not needed for any fact today, kept (§0.3) as his wanted direction, built when he calls for it: TC1 (a compartment per tab), TC2 (a webview
  per tab — TC3 does not need it: with today's one page per window a link-tab opens in the same session, so Fiverr stays signed in), TC4
  (pop out and dock), TC5 (the new-tab chooser), the COS records, FG6 (the blocks screen). The Fiverr editor's other pages (Overview,
  Description & FAQ, Requirements, Gallery) have no facts on record yet: their blocks wait on a page read on his machine, not a guess.

## The DAG, deterministic only
Every depends_on below is either a code edge (a module requires another) or a decision; none is a judgment of order. The five cores require
none of each other and nothing with I/O, so each depends on nothing (`[]`): they are the foundation, built and tested first, in any order.
The page-touching phases in the FG and TC maps depend on the core they call (the addenda in those maps). lib/phase-dag.js checks the whole
graph; lib/phase-graph.js derives each phase's files and edges from the code, not from this text.

decisions:
  FP_D1_facts_only:
    chosen: "a phase is built only when a fact needs it; what no fact needs is kept mapped and deferred"
    by_the_axioms: "his words 2026-10-28: 'only whats needed for a fact'; §0.1 evidence over memory; §0.3 nothing lost"
  FP_D2_deterministic_foundation:
    chosen: "every decision a fact forces is a pure function, tested by its inputs, built before the code that touches a page"
    by_the_axioms: "his words 2026-10-28: 'the determinisitci is the foundation'; the routing rule 'deterministic first'"

phases:

  FP1_where_a_request_opens:
    layer: foundation
    status: MAPPED
    depends_on: []
    files: [clear-glass/src/tabs/open-decision.js, tests/modules/test-flow-cores.test.js]
    spec: clear-glass/spec/flow-cores.spec
    blocks: [MOD-FC-OPEN]
    does: decideOpen(request) → tab | window | compartment-page, by one named rule
    proof: one test per rule

  FP2_which_option_is_meant:
    layer: foundation
    status: MAPPED
    depends_on: []
    files: [clear-glass/src/page/option-match.js, tests/modules/test-flow-cores.test.js]
    spec: clear-glass/spec/flow-cores.spec
    blocks: [MOD-FC-OPTION]
    does: matchOption(options, want) by exact → case → normalized → prefix → contains → number; ambiguous and missing returned; shows() read-back
    proof: the contracts as tests ('3' → '3 Days' not '30 Days'; 'Data' ambiguous)

  FP3_is_the_gate_open:
    layer: foundation
    status: MAPPED
    depends_on: []
    files: [lib/agent-tools/tools/clear-glass/gate-eval.js, tests/modules/test-flow-cores.test.js]
    spec: clear-glass/spec/flow-cores.spec
    blocks: [MOD-FC-GATE]
    does: validateGate, stateScript, evalGate, settled, urlMatches
    proof: url glob and regex, selector visible, value, gone, settle over a flicker

  FP4_what_a_key_changed:
    layer: foundation
    status: MAPPED
    depends_on: []
    files: [clear-glass/src/page/state-diff.js, tests/modules/test-flow-cores.test.js]
    spec: clear-glass/spec/flow-cores.spec
    blocks: [MOD-FC-DIFF]
    does: snapshotScript, diffState, revertScript
    proof: added, removed, changed classes, attributes and sheets; diff(a, a) empty

  FP5_the_pricing_page_blocks:
    layer: foundation
    status: MAPPED
    depends_on: []
    files: [clear-glass/src/autofill/gig-pricing.js, tests/modules/test-flow-cores.test.js]
    spec: clear-glass/spec/flow-cores.spec
    blocks: [MOD-FC-PRICING]
    does: pricingBlocks(gig, { rows }) from F5's controls; no Save or Publish block
    proof: a sample gig's blocks, each gate valid by FP3's validateGate, none publishing

## ADDENDUM 2026-10-28 (0.60.221) — what was built, and the cores that were not
James, 2026-10-28: "stop. just get fiverr working." Said while the five cores were being written: the work narrowed to what makes Fiverr work.
- FP1 BUILT: src/tabs/open-decision.js, used by the popup handler (TC3 with it). FP2 BUILT: src/page/option-match.js, used by ClearDriver choose.
- FP3 (gate-eval.js), FP4 (state-diff.js) and FP5 (gig-pricing.js) are on disk, not wired and not tested. FP5 is kept but unused: the
  gig fill matches the pricing boxes by placeholder and chooses delivery time directly. They stay mapped for the gates and the Tab switch.
- Proof: tests/modules/test-fiverr-works.test.js 5/5 (FW-01 FP1, FW-04 FP2, FW-05 in Clear Glass).

## ADDENDUM 2026-10-28 (0.60.265) — this map's releases renumbered
James, 2026-10-28: "no patch file. unless idearium can run it. like i can drag it into the versionium tab and import". Merging main in (to make
a change pack he can drop on his Nexus), main already had its own 0.60.221–0.60.224 and went up to 0.60.260. The releases named above as
0.60.221, 0.60.222, 0.60.223 and 0.60.224 are 0.60.261, 0.60.262, 0.60.263 and 0.60.264; their changelogs say so. The text above is kept as
written (§0.3).
