# docs/2026-11-01-outperform-phasemap.spec — the arena: can Nexus build better than one frontier model alone? Spec: docs/outperform.spec.
# The idea, the bar and Guardian are James's; the cut, the order and the measure are the coder's.

origin: >-
  James, 2026-11-01: "can we plan that out. could it outperform you? use guardian also. can you spec this? make a dependancy graph." Before
  it: "look at idearium. all of that is in there" · "cant innovate the problem, innovate the method."

decisions:
  OP_D0_measured_not_asserted:
    status: DECIDED 2026-11-01 (by his axioms: §0.0 truth is supreme, §0.1 evidence over memory, §1.1 nothing real until proven)
    chosen: >-
      "Outperform" is a verdict from a sealed suite of his own repos' phases with hidden tests, read from the flight recorder: hidden pass
      rate, frontier calls, local calls, tokens, time, waste. The system wins only with a pass rate at least as high AND fewer frontier calls,
      over at least 10 tasks. Every loss is named. The rule is fixed before the first run.
    by: "his axioms; his question \"could it outperform you?\""
  OP_D1_guardian_is_the_frontier:
    status: DECIDED 2026-11-01 (his)
    chosen: >-
      Frontier models (Claude, ChatGPT, Gemini) are reached only through Guardian (browser tabs, no API keys, POST /command). They are used
      alone as arm A. In arm B they are used only as planner, repairer after a failed check, or judge. Local models (Ollama) do the bulk.
    by: "his, 2026-11-01: \"use guardian also\"; his 2026-10-13 rule: \"A reasoning agent only plans, and reviews or repairs only after a cheap check has failed\""

phases:
  OP1_innovate_the_method:
    status: OPEN
    depends_on: [OP_D0_measured_not_asserted]
    spec: docs/outperform.spec
    blocks: [MOD-OP-PIVOT]
    files: [lib/pipeline-routing.js, lib/emergence.js, idearium/api/index.js, tests/modules/test-outperform-pivot.test.js]
    interface: [route]
    does: "the method pivot in Idearium's phase build: after pivotAfter same-class failures the ask changes (his rule), a flight row"
    proof: "MOD-OP-PIVOT's acceptance"
  OP2_guardian_as_the_frontier:
    status: OPEN
    depends_on: [OP_D1_guardian_is_the_frontier, OP1_innovate_the_method]
    spec: docs/outperform.spec
    blocks: [MOD-OP-FRONTIER]
    files: [lib/pipeline-routing.js, idearium/api/index.js, tests/modules/test-outperform-frontier.test.js]
    interface: [route]
    does: "frontier roles (plan, repair after a failed check and pivot, judge) through Guardian's route, each with its why"
    proof: "MOD-OP-FRONTIER's acceptance"
  OP3_many_cheap_tries:
    status: OPEN
    depends_on: [OP1_innovate_the_method]
    spec: docs/outperform.spec
    blocks: [MOD-OP-CANDIDATES]
    files: [idearium/repo/candidates.js, idearium/api/index.js, cos/foundation/snapshot.js, tests/modules/test-outperform-candidates.test.js]
    interface: [route]
    does: "N local candidates from one snapshot, tests choose, the rest counted"
    proof: "MOD-OP-CANDIDATES' acceptance"
  OP4_the_suite:
    status: OPEN
    depends_on: [OP_D0_measured_not_asserted, EB1_the_registry_whole]
    spec: docs/outperform.spec
    blocks: [MOD-OP-SUITE]
    files: [idearium/arena/suite.js, tests/modules/test-outperform-suite.test.js]
    interface: [cli]
    does: "a sealed suite from nexus/emerge's phases with spec, graph and tests; hidden tests held back"
    proof: "MOD-OP-SUITE's acceptance"
  OP5_the_arms:
    status: OPEN
    depends_on: [OP2_guardian_as_the_frontier, OP3_many_cheap_tries, OP4_the_suite]
    spec: docs/outperform.spec
    blocks: [MOD-OP-RUN]
    files: [idearium/arena/run.js, tests/modules/test-outperform-run.test.js]
    interface: [route]
    does: "frontier-alone and system on the same task, same start, both read back from records"
    proof: "MOD-OP-RUN's acceptance"
  OP6_the_verdict:
    status: OPEN
    depends_on: [OP5_the_arms]
    spec: docs/outperform.spec
    blocks: [MOD-OP-SCORE]
    files: [idearium/arena/score.js, tests/modules/test-outperform-score.test.js]
    interface: [route]
    does: "hidden tests, per-arm totals, the verdict by the fixed rule, losses named"
    proof: "MOD-OP-SCORE's acceptance"
  OP7_the_screen:
    status: OPEN
    depends_on: [OP6_the_verdict]
    spec: docs/outperform.spec
    blocks: [MOD-OP-DOOR]
    files: [idearium/api/arena.js, idearium/cli/route-commands.js, idearium/ui/js/arena.js, cos/ui/emergence/index.html, tests/modules/test-outperform-screen.test.js]
    interface: [route, cli, html]
    does: "routes, command rows, Idearium's arena screen and a panel on COS's Emergence page"
    proof: "MOD-OP-DOOR's acceptance, in Clear Glass"
  OP8_the_first_real_run:
    status: OPEN
    depends_on: [OP7_the_screen]
    spec: docs/outperform.spec
    blocks: [MOD-OP-SCORE]
    files: [docs/PROOF-OF-COMPETENCY.md]
    interface: [html]
    does: "on his machine (Ollama and Guardian's tabs live): nexus/emerge's suite through both arms; the verdict, whatever it is, recorded with its numbers"
    proof: "the score, its seal, and each loss, in PROOF-OF-COMPETENCY.md if it holds evidence (his 2026-10-29 rule)"

  OP9_it_learns:
    status: OPEN
    depends_on: [OP6_the_verdict]
    spec: docs/outperform.spec
    blocks: [MOD-OP-LEARN]
    files: [idearium/arena/learn.js, lib/economy/router.js, tests/modules/test-outperform-learn.test.js]
    interface: [route]
    does: "what held is written back into the learners Nexus already has (routing records, crystals, reuse, pivot asks)"
    proof: "MOD-OP-LEARN's acceptance"
  OP10_it_improves_itself:
    status: OPEN
    depends_on: [OP9_it_learns]
    spec: docs/outperform.spec
    blocks: [MOD-OP-SELF]
    files: [idearium/arena/self.js, tests/modules/test-outperform-self.test.js]
    interface: [route, html]
    does: "losses and waste → Intelligence's synthesis → a phase of Nexus's own map → built by the same pipeline → RAID → nexus-self apply → re-measured on the frozen suite"
    proof: "MOD-OP-SELF's acceptance"
  OP11_the_curve:
    status: OPEN
    depends_on: [OP9_it_learns, OP7_the_screen]
    spec: docs/outperform.spec
    blocks: [MOD-OP-CURVE]
    files: [idearium/arena/curve.js, idearium/ui/js/arena.js, tests/modules/test-outperform-curve.test.js]
    interface: [html]
    does: "the frozen suite re-run on a schedule; each metric's slope beside the frontier arm's flat line; trades named"
    proof: "MOD-OP-CURVE's acceptance"

build_order: "OP1 → OP2 and OP3 → (with OP4, after EB1) OP5 → OP6 → OP7 → OP8 on his machine; then OP9 → OP10, and OP11 once OP7 and OP9 stand. His addition, 2026-11-01: \"not only that but the system learns better code to optimize itself, which gives better code.\""
