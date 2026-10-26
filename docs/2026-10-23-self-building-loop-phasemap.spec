# docs/2026-10-23-self-building-loop-phasemap.spec
# Idearium builds its phases on its own: pick the next buildable phase, build it, prove it, land it, close it, pick the next.
# Phase ids SL0–SL6 (SB0–SB39 are the build-from-the-spec map's, 2026-10-05).
# MAPPED 2026-10-23, before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec. The full spec (his 2026-10-20
# rule: spec, then phases, then each phase specced again) is docs/self-building-loop.spec (written 2026-10-23, compiles at full depth).
# Touches: docs/2026-10-19-solid-build-foundation-phasemap.spec (AB1 economy-resume, SET1/SET2), docs/2026-10-21-brainos-into-
# idearium-phasemap.spec (CNS1 census, BX7 automation), docs/2026-10-16-repo-carve-phasemap.spec (FR6 flight data, FR10 stop the
# ladder), docs/2026-10-19-pipeline-root-causes-phasemap.spec (DG3 the whole DAG, DG4, VF1 verify-first), lib/phase-dag.js.

origin:
  date: 2026-10-23
  james: '"whats the most important? can you help me build, invent, innovate, ways for idearium to build phases, all of them, we need this to work so it can start building itself."'
  context: >-
    Asked right after main reached 0.60.220. The coder traced the build path end to end (idearium/api/index.js _phaseBuild and
    runContract, lib/repo-inject.js land, the watchdog) and measured the backlog over every docs/*-phasemap.spec with
    lib/phase-dag.js. The coder's reading (to confirm): "building itself" means the loop runs without him between phases, and he
    is asked only what is his (USER_AUTONOMY): his decisions, and whatever the trust rule (SL5) keeps for him.
  his_earlier_decision: >-
    2026-10-21 (docs/2026-10-10-idearium-solid-phasemap.spec addendum): "need to stop adding more phases and get idearium solid,
    actually thats priority, once we do that, we have have the system build itself". This map adds seven phases. The coder's
    reading (to confirm): his 2026-10-23 words ask for the "then" of that order, and these phases close the loop the SD phases
    built rather than adding scope beside them; SL0-SL2 are what makes "solid" checkable (what is done, by evidence). If he meant
    no new phases at all, SL0-SL2 fold into SD as addenda instead.

found:
  # measured 2026-10-23 on main 0.60.220 (lib/phase-dag.js build over 165 maps)
  backlog: "2077 phases: 832 done, 1245 open (1164 pending, 12 in progress, 69 open decisions). 585 open phases have no open dependency. 3 cycles, 17 dangling references, 535 phases with no depends_on line, 251 pairs of open phases changing the same file with no order between them."
  backlog_quality: "306 open phases already have every file they list on disk (done, or nearly); 514 open phases list no files at all, so DG2 refuses them (NO_GRAPH, no override). Release titles rarely name a phase id, so the census (CNS1) cannot see most of what shipped: its own 0.60.188 finding was 206 phases marked open that no record names as built."
  the_loop_is_open_at_five_places:
    - "1 nothing marks a phase done: the only status writes are 'active' when a build starts (idearium/api/index.js ~978) and the manual POST …/phases/status. A proven, contract-complete run leaves its phase open, so DG1 refuses every phase that depends on it until he marks it."
    - "2 nothing starts the next phase: the watchdog (_watchRuns, every 60 s) only re-runs the SAME phase after a stall or an economy hold; specBuild's nextReady exists but only behind a button. AB1 built the resume slice only; BX7 (automation) is planned."
    - "3 nothing lands without him: the write mode defaults to review and every Nexus repo is always review (lib/repo-inject.js), so a proven run is proposals on top of the files; the proof runs against those overlays, so 'proven' can be true with nothing on disk."
    - "4 the backlog cannot be read as buildable: no command lists which phases can be built now (not found); 'pending' is often stale (GA1 shipped 0.60.161, still pending)."
    - "5 runs that cannot land keep spending: his IM1 run, 10 attempts, 62 min, three agents timing out the same way (0.60.148); FR10 (stop the ladder) is mapped, not wired."
  also_found:
    - "the stall watchdog fires at 10 min (config-core.cjs) while a claude-code attempt may run 15 min (lib/repo-agent.js): a long Claude attempt can be called stalled and retried while it is still working (in the code; not yet seen in a log)"
    - "lib/version.js has no version lines for 0.60.187–0.60.219 (it jumps from 0.60.186 to 0.60.220): the releases happened (their CHANGELOGs exist) but the version record lost them in a merge. Not this map's to fix; reported."

phases:
  SL0_what_can_be_built_now:
    status: DONE 0.60.222 — test-build-queue 6/6 (BQ-05 in Clear Glass); over Nexus 1183 open, 170 can be built now
    layer: library
    depends_on: []
    files: [lib/build-queue.js, idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/phases.js, tests/modules/test-build-queue.test.js]
    spec: docs/self-building-loop.spec
    blocks: [MOD-SL-QUEUE]
    does: >-
      One deterministic answer to "what can be built now", in order, with the reason for every phase that cannot. A phase is
      buildable when: the DAG has it ready (lib/phase-dag.js: no open depends_on, not in a cycle, no dangling reference); it names
      files (DG2 will accept it); no decision it depends on is open; it is not evidently done (SL2's check); no open phase
      upstream of it changes the same file. The rest are grouped by what would unblock them: his decision, files to name, a cycle
      to break, already done. Reuses phase-dag build/slice, phase-census, flight-data summary (a phase that failed the same way
      three times is held, not queued). `phases next [--repo] [--why]`, GET /api/phases/next, the Plan panel's "next" list.
    proof: "over Nexus's 165 maps: the queue, and every open phase in exactly one group with its reason; the counts match phase-dag's"

  SL1_a_proven_phase_closes_itself:
    status: DONE 0.60.223 — test-phase-close 6/6 (PC-04 the real path, PC-06 in Clear Glass)
    layer: integration
    depends_on: [SL0_what_can_be_built_now]
    files: [lib/phase-close.js, idearium/api/index.js, lib/repo-inject.js, idearium/repo/roadmap.js, idearium/cli/route-commands.js, idearium/ui/js/phases.js, tests/modules/test-phase-close.test.js]
    spec: docs/self-building-loop.spec
    blocks: [MOD-SL-CLOSE]
    does: >-
      The loop's missing write. When a run's phase gate is proven AND its changes are on disk (in auto mode at once; in review mode
      when the last change of that run is applied), the phase's status in its map becomes "DONE <version> — proven by run <id>,
      version <commit>" through the one writer that already exists (_phaseSetStatus), recorded on the run and in the activity
      log. Reversible: undoing any change of the run (FR3) reopens the phase, said. A proof met only by overlays never closes it.
    proof: "a fixture phase built, proven, applied: its map says DONE with the run and version; downstream DG1 lets the next phase build; undoing the change reopens it"

  SL2_done_by_evidence:
    status: DONE 0.60.224 — test-evidence-close 5/5 (EC-04 the real API, EC-05 in Clear Glass); the Nexus dry run in CHANGELOG-0.60.224.md
    layer: library
    depends_on: [SL0_what_can_be_built_now]
    files: [lib/phase-close.js, lib/test-map.js, idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/phases.js, tests/modules/test-evidence-close.test.js]
    spec: docs/self-building-loop.spec
    blocks: [MOD-SL-EVIDENCE-CLOSE]
    does: >-
      The stale backlog cleared by evidence, not by guessing. For an open phase whose files all exist: run its own test (TF2's
      test file when there is one, else the tests linked to its files, lib/test-map.js) and verify-first's already-done check. All
      green → it closes as "DONE by evidence <date> — <tests>", the same reversible write as SL1; anything less → it stays open
      with what is missing. A dry run first lists every phase it would close; nothing is closed without a passing test.
    proof: "the dry run over Nexus's 306 open phases whose files exist: how many close, how many stay, each with its test; one closed phase reopens when its test is made to fail"

  SL3_the_backlog_groomed:
    status: DONE 0.60.227 — test-phase-groom 6/6; over Nexus 0 cycles, 2 dangling (both real), DG1 checks 1156 of 1156 open phases
    layer: library
    depends_on: [SL0_what_can_be_built_now]
    files: [lib/phase-groom.js, lib/phase-map-auto.js, lib/phase-dag.js, lib/phase-deps-gate.js, lib/phase-graph.js, loom/scanners/phasemap-map.js, idearium/repo/phase-mapping.js, idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/phases.js, tests/modules/test-phase-groom.test.js]
    spec: docs/self-building-loop.spec
    blocks: [MOD-SL-GROOM]
    does: >-
      The 514 phases with no files and the 535 with no depends_on made buildable: MP1 already infers a phase's files and its
      inferred dependencies from its own words; this writes them into the map as a proposal (a change to the map file, through
      repo-inject, with what each came from), never silently. Same-file pairs with no order (251) get a proposed order from the
      DAG's layers. Cycles and dangling references are listed for a person (they need a choice).
    proof: "proposals for the map edits, each with its evidence; applied, SL0's queue grows by that many and DG2 accepts them"

  SL4_the_loop:
    status: DONE 0.60.225 — test-self-building-loop 5/5 (LP-02 three chained phases in order; LP-05 in Clear Glass)
    layer: integration
    depends_on: [SL1_a_proven_phase_closes_itself, SL0_what_can_be_built_now, AB1_autobuild_loop_and_resume, FR10_stop_the_ladder, SL5_when_a_proven_change_lands_alone]
    files: [idearium/lib/autobuild.js, idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/phases.js, tests/modules/test-self-building-loop.test.js]
    spec: docs/self-building-loop.spec
    blocks: [MOD-SL-LOOP]
    does: >-
      Build the next phase when the last one closed, from SL0's queue, until a limit: a budget (calls, minutes, per day: AB1's
      economy and SET1/SET2's settings), a stop rule (FR10: the same failure from different agents stops the climb and opens a
      case), and his queue (a phase needing his decision, or a change the trust rule keeps for him, is skipped and listed, the loop
      moves on). One loop per repo, started and stopped by a person or an automation (BX7); every step is a flight (FR6). Also
      fixes the watchdog that calls a 15-minute Claude attempt stalled at 10.
    proof: "a fixture repo with three chained phases: started once, all three build, prove, land and close in order; a fourth that needs a decision is skipped and listed; a stuck one stops at the rule"

  SL5_when_a_proven_change_lands_alone:
    status: DONE 0.60.225 — DECIDED B (James, 2026-10-24, "yes do it."; read as B, to confirm); lib/trust-rule.js
    depends_on: [SL1_a_proven_phase_closes_itself]
    files: [lib/repo-inject.js, lib/trust-rule.js]
    spec: docs/self-building-loop.spec
    blocks: [MOD-SL-TRUST]
    does: >-
      HIS decision (USER_AUTONOMY: what Nexus may change without him). Today every change waits for him, so the loop stops at every
      phase. The coder's options: (A) always review (today; the loop builds and proves, he applies, SL1 closes on apply); (B) a
      proven change lands by itself in his project repos when every deterministic gate passed (test first seen failing then
      passing, the batch test FR2, the regression and export screens), with undo (FR3) one click away, while Nexus's own repos stay
      review; (C) as B, and Nexus too, except a list of core files he keeps. The coder recommends B now, and C only after SL6 shows
      the land rate on his runs. To confirm with him before SL4 runs unattended.
    proof: "his choice recorded with his words; the rule is one setting per repo, said on every change it lands"

  SL6_the_loop_counts_itself:
    status: OPEN
    layer: library
    depends_on: [SL0_what_can_be_built_now]
    files: [lib/flight-data.js, lib/build-queue.js]
    spec: docs/self-building-loop.spec
    blocks: [MOD-SL-STATS]
    does: >-
      The numbers that say whether it is working: phases closed per day without him, the land rate per phase kind and per agent,
      minutes and calls per closed phase, what stopped the loop and how often. From the flights and the closes, nothing new
      recorded beside them. Shown in the Plan panel and `phases loop stats`.
    proof: "after the SL4 fixture: phases closed 3, stopped 1 (decision), calls and minutes per phase, matching the flights"

order: >-
  SL0 → SL1 → SL2 (closes the stale backlog) → SL4 (needs SL5 to run unattended; with A it builds and proves, and he applies) ;
  SL3 and SL6 alongside. SL0, SL2 and SL3 are deterministic (no model); SL1 is one writer; SL4 composes what exists (AB1, FR10,
  BX7, the watchdog).

## ADDENDUM 2026-10-23 (0.60.222) — SL0 built
James, 2026-10-23: "contiue getting idearium building phases"
- lib/build-queue.js 1.0.0, GET /api/phases/next and /api/repos/:uuid/phases/next, `phases next` and `repo next`, the Phases tab's rail
  "can be built now" (each with a ▶ build through the phase's own build route). The UI went in idearium/ui/js/phases.js, not plan-panel.js
  as first mapped: the Phases tab is where a phase is built, and its rail already lists what each map holds (files: corrected above).
- A same-file pair with no order: the phase on the lower DAG layer goes first (then key), as the spec says. Read by the axioms (§0.1, the
  spec decides): so on the real maps a phase many wait on can wait behind a lower-layer one; SL3 proposes an order for those pairs.
- The run over Nexus's 166 maps: 1183 open, 170 queued (IN0_baseline first, 58 wait on it); decision 18, deps-open 579, dangling 2, no-files
  391, done-by-evidence 1, conflict 22, held 0. open = queue + every group (1183).

## ADDENDUM 2026-10-23 (0.60.223) — SL1 built
James, 2026-10-23: "contiue getting idearium building phases"
- lib/phase-close.js 1.0.0: landed / closeIfLanded / reopenIfUndone, as the spec's MOD-SL-CLOSE. Two triggers in idearium/api: the proof
  row 'proven' (auto mode: the changes are already on disk) and each applied change (lib/repo-inject.js setOnSettled, review mode: the last
  apply closes it). A revert of a closing run's change reopens the phase. Catch-up by hand: POST /api/repos/:uuid/phases/close {runId},
  `repo close <repo> <runId>`; the list: GET …/phases/closes, `repo closes <repo>`; the phase panel's "closed by" / "reopened" row.
- Drift from the spec, decided by the axioms:
  - The status value is "DONE <date>. <version> — proven by run <id>, on snapshot <s>", not "DONE <version> — …". The one writer
    (roadmap.js setPhaseStatus) already writes "DONE <date>." and proves loom reads it back; a `note` after the date keeps that proof
    (§8.6 reuse; §0.1 the round trip is the evidence). The version is the release version; the commit is the run's snapshot.
  - The close is kept in its own append-only table (idearium_phase_closes; a reopen is a newer row), not as a run state. A run row's
    state is read as the run's own by the watchdog, the flights and the queue's held rule; a 'closed' state there would change what they
    see (§1.2 no hidden side effects; §0.3 nothing rewritten). It is on the activity log and the orchestrator's ledger (phase.closed /
    phase.reopened).
  - A proven run that changed nothing closes too, said: "the run changed nothing (its phase was already true on disk)". The proof ran on
    the disk itself, so there is no overlay to doubt (§0.1).
  - A rejected change in the run blocks the close, as a revert does: part of the run did not land.

## ADDENDUM 2026-10-23 (0.60.224) — SL2 built; the first dry run; nothing closed yet
James, 2026-10-23: "next"
- lib/phase-close.js 1.1.0 evidenceTests / byEvidence; POST /api/repos/:uuid/phases/evidence (dry run unless apply: true), `repo evidence`,
  the Phases rail's "done by evidence?" with "close N" (asks first). Each close is a CloseRecord of kind 'evidence' beside SL1's.
- Decided by the axioms (TRUTH_OVER_COHERENCE, §0.1): what may judge a phase is narrower than the spec's "the tests linked to its files".
  The first count with every linked test gave 158 checkable; tests that merely require a store most code uses (guardian/jaa-store.js)
  would have closed phases on dozens of unrelated passes. Evidence is a test the phase names ('own'), or one specific to one of its
  files ('linked': named for it, or one of at most 3 reaching it) on a file at most 3 open phases share.
- The dry run over Nexus (docs/2026-10-23-evidence-dry-run.md, every phase listed with its tests): 137 checkable, 202 tests in 13 minutes,
  180 passed, 1 timed out; 107 would close, 30 stay open on a failing test. Only 2 of the 107 close on their own test. A linked pass says the
  file works, not that the phase's whole intent was built, so nothing was applied to Nexus's maps: closing 107 phases at once is a cost he
  would want to see first (his rule, 2026-10-17: "come to me for problems"). To confirm with him: apply the 2 'own' ones, all 107, or a
  reviewed subset.
- Found: the first dry run spawned tests without a sandbox and they wrote ledgers into data/ and cortex/data/; fixed (each test in its own
  sandbox and process group). Even sandboxed, some test still writes failure_mode nodes into cortex/data/nodes/failure_mode (that folder
  is not one of the sandbox's stores). The files were moved out of the tree, kept; the writer is not traced yet (reported, not fixed here).

## ADDENDUM 2026-10-23 (0.60.226 →) — every phase a node with its graph; the DAG made whole; the agent maps what Nexus cannot; the pipeline simulated
# James, 2026-10-23, after 0.60.225 (RF2 was a finding sent to Gemini as a phase):
#   "can you decompose the phases into .phase with the dependancy graph per phase node. then move them into the repsective systems, or
#   sort them at least. need to do something about the dependancy graph. in the idearium pipeline, building phases, extending, building
#   from scratch. run deep and recursive simulations, of every possible failure mode, loop until we get a solid pipeline. using all
#   phases, specs, everything you can to get idearium coding any project, any phase. agent needs to map dependancies if nexus cant map one."
# Measured before mapping (lib/phase-dag.js over Nexus's 166 maps, 0.60.225): 1971 phases, 1172 open; 535 with no depends_on line; 565
# open with no files (DG2 refuses them, NO_GRAPH); of the open ones, MP1 (lib/phase-map-auto.js) places 596 by their declared files, 343
# by evidence in their words, and 244 not at all. 3 cycles; 17 dangling references, nearly all prose read as phase names ("each",
# "phase's", "(snapshot-compartments)"). 251 same-file pairs with no order. 175 .phase nodes written (PS1), for a handful of maps.
# The pipeline's own suites were red on main before this: test-contract-phase-build 9 of 14, test-chunked-phase-build 5 of 16. Traced:
# SL1 closes a proven phase, and every later build of it (resume, replan, retry, a second scenario) is refused ALREADY_COMPLETE.
# Reuse (§8.6): SL3 (open) already owns the grooming, and PS1 (emerge/compiler/phase-specs.js) already writes a .phase and its .graph
# beside the owning system. MP4 (idearium/repo/phase-mapping.js, 0.60.29) already asks an agent to map phases, as a batch job only.
# These phases finish those; nothing is built beside them.
# The coder's reading (to confirm where it matters): "move them into the respective systems" = each .phase lives under the system that
# owns its files (PS1's rule), and a phase that names no files goes to the system its map is tagged with, else to lib/ (core). The
# phasemaps stay the authored source (his 2026-10-20 order: spec, then phases, then each phase specced again); the .phase is derived and
# checked for drift. Nothing is moved out of docs/.

phases_added_2026_10_23:
  SL7_build_again_is_asked_for:
    status: DONE 0.60.226 — test-contract-phase-build 14/14 (was 5/14), test-chunked-phase-build 16/16 (was 11/16)
    layer: integration
    depends_on: [SL1_a_proven_phase_closes_itself]
    files: [idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/plan-panel.js, idearium/ui/js/repo-tasks.js, cortex/core/raid/contract-gates.js, cortex/core/raid/contract-adapters.js, tests/modules/test-contract-phase-build.test.js, tests/modules/test-chunked-phase-build.test.js]
    spec: docs/self-building-loop.spec
    blocks: [MOD-SL-REBUILD]
    does: >-
      A complete phase is built again only when asked for (`rebuild: true`, `--rebuild`), and the ask is said on the run and in the
      status note. Without it the refusal stays (ALREADY_COMPLETE), and now names how to ask. The pipeline suites build the same phase
      several times on purpose (resume, replan, retry), so they ask for it.
    proof: "test-contract-phase-build and test-chunked-phase-build green again; a plain build of a complete phase still 409s and names --rebuild"

  SL8_the_agent_maps_what_nexus_cannot:
    status: DONE 0.60.228 — test-agent-maps-phase 4/4 (AM-03 the real router with a scripted agent)
    layer: integration
    depends_on: [SL3_the_backlog_groomed, SL7_build_again_is_asked_for]
    files: [idearium/repo/phase-mapping.js, lib/phase-files.js, idearium/api/index.js, idearium/repo/build-plan.js, idearium/ui/js/plan-panel.js, tests/modules/test-agent-maps-phase.test.js]
    spec: docs/self-building-loop.spec
    blocks: [MOD-SL-AGENTMAP]
    does: >-
      When a build reaches a phase Nexus cannot place (DG2 would refuse NO_GRAPH: no declared files, nothing in its words), the build
      asks the repo's agent to map that one phase, through MP4's own brief and answer checker (lib/phase-files.js brief/parseAnswer):
      its files (existing, or new under a folder that exists) and its depends_on (each must resolve in the DAG and add no cycle). The
      answer is checked by code, kept as a mapping (source agent:<by>, NC0's evidence rule), and the graph is built from it; the map
      edit is proposed, not written. A mapping that fails the checks is refused and said (NO_GRAPH, with what the agent answered), so a
      bad guess never builds. A second build reuses the kept mapping and asks nothing.
    proof: "a fixture phase with no files and no evidence: the build asks once, the graph's source is agent, the run starts; a nonsense answer is refused; the second build asks nothing"

  SL9_every_phase_a_node:
    status: DONE 0.60.229 — test-phase-nodes-all 5/5; 1939 phases written beside 14 owner systems, a second pass writes nothing
    layer: library
    depends_on: [SL3_the_backlog_groomed, PS1_phase_specs]
    files: [lib/emerge/compiler/phase-specs.js, lib/phase-dag.js, lib/phase-deps-gate.js, idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/phases.js, tests/modules/test-phase-nodes-all.test.js]
    spec: docs/self-building-loop.spec
    blocks: [MOD-SL-NODES]
    does: >-
      Every phase of every phasemap written as a .phase with its .graph, beside its owning system, in one pass: the whole DAG built
      once (not once per map), MP1's mapping and SL3's inferred edges in it, SL8's kept agent mappings used where MP1 found nothing.
      A phase with no files goes to the system its map is tagged with, else lib/. Findings and decisions are not written as phases.
      Each system's phases/ gets an INDEX.md: its phases by map, layer and status, what is ready, what waits and on what. `--check`
      reports drift for all of them; an old .graph of a changed hash is archived, not deleted (§0.3).
    proof: "node emerge/compiler/phase-specs.js --all writes one .phase per phase (counts match the DAG's), --check clean right after"

  SL10_the_pipeline_simulated:
    status: DONE 0.60.230 — test-pipeline-sim 25/25, eight runs in a row green after the last fix (one earlier run had a failure not captured, not reproduced)
    layer: integration
    depends_on: [SL7_build_again_is_asked_for, SL8_the_agent_maps_what_nexus_cannot]
    files: [tests/modules/test-pipeline-sim.test.js, tests/modules/run-all.js, cortex/core/raid/contract-adapters.js, idearium/api/index.js, idearium/ui/js/plan-panel.js, idearium/cli/index.js]
    spec: docs/self-building-loop.spec
    blocks: [MOD-SL-SIM]
    does: >-
      The build pipeline run through every failure mode it can meet, on the real route, the real repo layer and the real inject path,
      with a scripted agent: for a phase built from scratch (a new project), a phase that extends existing code, and a phase in a repo
      with nothing on disk. Modes: no reply, a timeout, prose with no code, a spec instead of code, the wrong path, a path outside the
      repo, a partial file, a syntax error, a file that breaks an existing test, the right file twice, a finding or a decision sent to
      build, a cycle, a dangling depends_on, no graph with an agent that maps it, no graph with an agent that cannot, a complete phase
      built again with and without asking, an agent that answers a different phase. Each mode names what the pipeline must do (refuse,
      retry, stop, land) and the test checks it did. Recursive: a mode found failing is fixed at its root and the whole matrix runs
      again, until it is green. Every mode that needed a fix is listed in the CHANGELOG with its root cause.
    proof: "the matrix green; every mode's expected outcome asserted on the run rows, the files on disk and the run's final state"

## ADDENDUM 2026-10-23 (0.60.226) — SL7 built; a second root cause found under it
- As mapped: rebuild: true (route, `--rebuild`, the UI asks first; the Tasks panel's retry now goes through the same door as ▶ build,
  so it answers NOT_A_PHASE, NO_GRAPH, DEPS_OPEN and a complete phase the same way).
- Found once the builds ran again (§0.1): a resumed build re-sent every file. The contract's input was the whole phasemap, so the pipeline's
  own status writes (DONE, active, status_previous, the `# roadmap edit` comment), and any edit to another phase of the same map, STALEd
  every brick. Decided by the axioms (§0.1 what changed is what the phase says; §10.3 one cause, one fix): cortex/core/raid/contract-gates.js
  phaseBlock — an input { path, phase } hashes the phase's own block without its status lines. A change to what the phase says still
  STALEs it. Files added above (the UI door and the two cortex files).

## ADDENDUM 2026-10-23 (0.60.227) — SL3 built; six root causes under "the dependency graph"
James, 2026-10-23: "need to do something about the dependancy graph."
- Measured before each fix (lib/phase-dag.js, lib/phase-deps-gate.js over Nexus's 166 maps), each traced to its root:
  1. DG1 read a phase only under a top-level `phases:` key of strict YAML: 1073 of 1176 open phases were never gated (797 under spec:,
     phases_added_… or other sections; 276 in maps loom reads and js-yaml does not). Now the YAML read where it finds the phase, loom's
     reader everywhere else: 1156 of 1156 checked.
  2. A depends_on item with a note after its id, or prose, was split into words: 16 of 17 dangling refs. One reader (phase-dag refKey),
     used by the DAG, DG1 and DG2; prose is said as prose, never an edge, never dangling.
  3. MP1's inferred dependencies are { on, file }; the DAG String()ed them to '[object Object]', so none ever joined a build's DAG. Read
     now: 201 inferred edges on Nexus. An inferred edge never closes a cycle: left out and listed (inferredSkipped).
  4. Cycles 3 → 0. Two were written into the maps by MP4 (0.60.29) from shared files, against the other phase's authored depends_on; by the
     axioms (§0.1 an inferred edge never overrides an authored one) those two lines became `depends_on: []` with the old edge kept in a
     dated comment (§0.3), and MP4 now checks for a cycle before it writes. GA6↔GA9 were both authored: GA6's own words use GA9's work, so
     GA9's `[GA6]` was the one left out, kept as a comment. Maps edited: 2026-10-12-browser-providers-and-work (PV1),
     2026-10-13-projects-raid-and-gates (PL6), copilot-guardian-cos-expansion (GA9).
  5. 28 decisions in sections named decisions_needed:, decisions_recorded:, open_decision: … were open phases to the DAG and the queue.
     Any section whose name says decision holds decisions (loom), and the DAG keeps loom's kind.
  6. loom read a status from its key line and the 3 lines after it: MCO4's sibling `status_before: "NOT STARTED"` made the build's 'active'
     read back pending, and the one writer refused it (test-moce-roadmap, red on main). The status value is read alone now.
- lib/phase-groom.js as MOD-SL-GROOM; POST /api/repos/:uuid/phases/groom, `repo groom`, the rail's "groom the graph" (a dry run; writing asks).
- Not applied to Nexus's maps: the dry run proposes files for 295 phases and a depends_on for 31, in 57 maps. Writing 57 of his maps at once
  is the kind of cost he wants to see first (2026-10-17: "come to me for problems"); the build already uses the same mapping in memory
  (MP1 through managerView), so nothing waits on the write. To confirm with him: write them (one click on the rail, or `repo groom --apply`).
- 233 open phases cannot be placed by anything deterministic: SL8 (the agent maps them at build time) is next.

## ADDENDUM 2026-10-23 (0.60.228) — SL8 built
James, 2026-10-23: "agent needs to map dependancies if nexus cant map one."
- idearium/repo/phase-mapping.js mapOne / mapped / fileStore; lib/phase-files.js brief({ deps }) and parseAnswer's depends_on; _phaseBuild calls
  it when MP1 placed nothing, before DG2. lib/phase-graph.js was not changed (files: corrected above): an agent mapping is the same shape as
  MP1's, so DG2 reads it as it is.
- Decided by the axioms (TRUTH_OVER_COHERENCE; NC0's evidence rule): the agent's depends_on are claims, on the graph and the run as
  agent:<by>, never a refusal. A refusal on an unchecked guess could hold real work; DG1 still gates every depends_on the map declares.
- The UI: the Plan panel's run says "mapped by agent:<x>: <files> · depends on …" (and "kept from an earlier answer" when nothing was asked).
- Found while testing (said, not changed): ingesting a second project with byte-identical files returns the first repo; the test now uses
  different content. If that is not intended it belongs to the repo layer's own map.
- Found while checking the plan suites (red on main too, not this phase's): test-plan-lands PL-31, `idearium repo plan --dry --file <spec>`
  prints its usage instead of the derived phases. Listed for SL10.

## ADDENDUM 2026-10-23 (0.60.229) — SL9 built; every phase is a node beside its system
James, 2026-10-23: "can you decompose the phases into .phase with the dependancy graph per phase node. then move them into the repsective
systems, or sort them at least."
- `node emerge/compiler/phase-specs.js --all` (writeAll/checkAll): one DAG over every map, MP1's mapping and SL8's kept agent mappings in it.
  1939 phases → core (lib/) 785 · idearium 378 · clear-glass 280 · cortex 106 · guardian 94 · cos 83 · loom 71 · copilot 62 · intelligence 30
  · orchestrator 19 · diagnostic 12 · ollama-bridge 8 · versionium 7 · architect 4. Each owner has phases/INDEX.md (by map, in DAG order:
  status, layer, how its graph was placed, what it waits on). Findings and decisions are not written. A second pass writes nothing.
- The .phase keeps what the map authors (its declared depends_on); the .graph is derived: files with roles, crossings, and its slice of the
  DAG with each edge's kind (declared, inferred from a shared file, agent:<by>).
- Decided by the axioms, each from what the run showed (§0.1):
  - The whole DAG's hash is not stored per phase: with it every .graph changed on any map edit anywhere (measured: 1940 of 1940). Without
    it, adding a phase changes that phase and the phases whose slice it enters. The hash is in each INDEX.md.
  - A phase id repeated lower in a map (a key under changes_here:, changes:, built_…:) overwrote the real phase in the DAG (10 on Nexus,
    e.g. NP1, CON1); the first is the phase now, as the roadmap already read it. 8 authored edges came back with it.
  - A .phase from the older per-map pass at another place (owner changed) moves to _archive/phases-moved/ with its graphs; 11 that are now
    decisions (AB0, BX0a–e, PW0 …) were archived the same way, said. Nothing deleted (§0.3).
  - "Move them into the respective systems": the maps stay in docs/ as the authored source (his 2026-10-20 order: spec, then phases, then
    each phase specced again); the nodes are what moves. 785 land in lib/ because neither their files nor their map name a system: the
    honest owner is unknown, not guessed. To confirm with him: whether a phase with no system should go to its map's dominant system instead.
- Two crossings designed out (DG2's rule, which SL3 broke): lib/phase-deps-gate.js and emerge/compiler/phase-specs.js read loom's parser
  through lib/phase-dag.js parsePhasemap. The boundary ratchet (test-system-boundary SB-06) now shows only the 3 crossings it showed on
  main (roadmap-import → loom, phase-dag → loom, verify-first → cos), which predate this map and are not fixed here.
- The route reads what is written, through lib (idearium → emerge would be a new crossing): GET /api/repos/:uuid/phases/nodes, `repo nodes`,
  the rail's "phase nodes". Writing stays the compile step, committed with the code.

## ADDENDUM 2026-10-24 (0.60.230) — SL10 built; what the simulations found, each fixed at its root
James, 2026-10-23: "run deep and recursive simulations, of every possible failure mode, loop until we get a solid pipeline."
- tests/modules/test-pipeline-sim.test.js: 25 scenarios on the real route, repo layer, inject path, contract scheduler and proof run; only the
  model is scripted. From scratch (A01–A13: good, no reply, timeout, prose, refusal, a spec instead of code, wrong path, outside the repo,
  syntax error, partial file, unclosed fence, the other file's code, flaky once), extending (E01 keeps a consumer's export, E02 drops it),
  the gates (G01–G09: finding, decision, open dep, cycle with and without anyway, dangling, no graph with and without the agent, complete
  with and without rebuild, unknown phase), and the UI (U01).
- The loop, in order (each a root cause, each re-run across the whole matrix):
  1. The first matrix design was wrong, said: after A01 every scenario resumed its checkpoints and passed without the agent. Correct
     pipeline behaviour (CP-03 pins it); each scenario now builds a fresh phase.
  2. DG3's "anyway overrides DAG_INVALID, said on the run" was not said: a build past a cycle recorded nothing. Every row now carries
     dagOverride (the problems overridden).
  3. Every failed brick in the contract audit said only FAILED: a syntax error, a refusal and no reply ended identical in the record (§1.2).
     audit() now gives each non-passing brick its failure: the executor's own error first, the check's feedback after.
  4. Under it: a file repo-inject refused (an unsafe path, code that does not parse, an unclosed fence) was reported as "the reply did not
     bring back <file>" — the refusal was dropped. It is carried now (_refusedWhy): "… — refused: does not parse as js: SyntaxError …".
  5. A reply with the right code under a wrong path left that file proposed in the review queue once per attempt (3 identical proposals
     from one failed brick), or in auto mode written to disk. Decided by the axioms (REVERSIBILITY, §0.3): a stray the brick never asked
     for, from a reply that failed it, is rejected (or reverted when applied) with its reason, kept in the record, never deleted.
  6. test-plan-lands PL-31 (red on main): the route table shadowed the hand-written `repo plan --dry --file <spec>`; that form goes to its
     handler again. The other collision, `log`, is left: its row replaced the Vortex snapshot log with Nexus's logs, which reads as
     deliberate (said, not changed).
- What the matrix confirmed already held, with no change: a refusal is blocked at the reply gate; an export removed from a file a consumer
  requires is refused by repo-inject ("it removes export") and the brick fails; a flaky agent recovers on retry; the transient class does
  not burn retries; every failing run ends (no hang) within its attempts.
- Said, not hidden: one traced run before the last fix showed a single failure whose name was not captured; it did not reproduce in the
  eight runs after.

# ── From brave-cori, merged 2026-10-26 (0.60.255): the addenda below were written there, at its numbering, unchanged (§0.3).

## ADDENDUM 2026-10-24 (0.60.225) — his decision on SL5, and SL4 built
James, 2026-10-24: "yes do it."
- **Context.** The coder's last message ended: "Say 'B' and 'the 2' (or your own picks) and I'll start SL4." The options on the table were
  SL5 A (every change asks), B (a proven change whose gates all passed lands by itself in his project repos; Nexus's own repos stay
  review), C (B and Nexus too, except files he keeps), with the coder's recommendation B; and, from the SL2 dry run, closing the 2 phases
  whose own test passed, all 107, or his picks, with the coder's recommendation the 2.
- **The coder's reading (to confirm):** his "yes do it." accepts the recommendations: SL5 = B, close the 2, start SL4. Another reading
  ("do SL4", rule unchanged) exists; if he meant that, his rule is set back to A with `trust --set A --words "…"` and nothing else changes.
- **What it changed.**
  - SL5: lib/trust-rule.js. B is the recorded default with his words and this context (DECIDED; a rule he sets later through
    POST /api/trust-rule supersedes it, never rewriting it). A proven run's proposals in a project repo are applied when the rule allows
    each one (_landByRule, before SL1's close); a Nexus repo stays review; a change whose evidence shows a regressed test is not landed.
  - The 2: G0 (2026-09-28-graph-build-context-settings-memory) and PS1_phase_specs (2026-10-20-substrate-graph-traversal-chunking-gating)
    closed through setPhaseStatus, "DONE 2026-10-24. by evidence — <its own test> (dry run 2026-10-23; James 2026-10-24: yes do it. )".
  - SL4: idearium/lib/autobuild.js — start / stop / status / step over the queue (SL0), the phase build, his rule (SL5) and the close
    (SL1), stepped by the watchdog's minute tick. Budget (default 5 phases, 240 minutes), three phases in a row that did not close stop
    it, a phase that did not close is skipped for the rest of the loop and listed, decisions are never built and are named when it
    stops, one loop per repo. GET/POST /api/repos/:uuid/loop(/start|/stop|/step), `repo loop`, `trust`, the Phases rail's loop section.
  - The watchdog's stall default is 20 minutes (was 10): a claude-code attempt may run 15 (found 2026-10-23).
- **Drift from the spec, decided by the axioms:** the stop rule is "three phases in a row did not close" rather than FR10's "the same
  failure from different agents" (FR10 is mapped, not wired; the loop's rule is the part it can see, §1.2); the loop lives in Idearium's
  tables (idearium_loops, append-only), the rule's default in code because the store is data (§0.3, his decision must not be lost).
- **Not run yet on Nexus:** a Nexus repo stays review under B, so on Nexus the loop builds and proves, and each phase waits for his apply.
  No loop was started from this session: starting one spends agent calls, and that is his to start (the rail's ⟳ start, or `repo loop
  <repo> start`).

## ADDENDUM 2026-10-24 (0.60.226) — his looking-glass run, read against the loop
James, 2026-10-24, uploading looking-glass-bundle-v0_4.zip and its error report (docs/2026-10-22-looking-glass-v0_4-error-report.md): "This is a
few days old. But does this help. A project that had auto built 5 phases"
- **Checked against the zip (§0.1), not taken from the report:** seven proof runs in .nexus/proof-runs, all READY. SP0–SP4's included a
  `tests` condition that ran; SP5's (09:30 and latest.json) had one condition, "A test that proves title as the spec states it, against the
  real code (no mock)", with check kind `file` (lib/title.js exists). SP1's own test asserts only a non-empty array of strings, and
  lib/core_ideas.js returns twelve generic words, none of the spec's.
- **What it changed (0.60.226):** idearium/repo/proof-run.js proofStrength — what a proof ran; "READY ON FILES ONLY" and an honest footer
  when nothing ran; "Promised a test, checked only a file" names the conditions like SP5's. lib/phase-close.js landed and lib/trust-rule.js
  allows refuse a files-only proof. Replayed on his seven runs: SP0–SP4 close, SP5 does not.
- **Already fixed before his upload was read:** the "Gemini said …" files and the names cut short at a dot (E5) — lib/path-guard.js (RC4,
  0.60.170) strips the label and refuses a cut name; checked on his four file names.
- **Not fixed, proposed to him (not added as phases: his 2026-10-21 "stop adding more phases"):**
  - a test that cannot fail proves nothing (E1): run the phase's own test once against its module with every export gutted (returning
    nothing); a test that still passes is reported as unable to fail, and its pass is not a proof. Deterministic, no model.
  - a phase spec copied from another (E3: SP5's text is SP1's with the name swapped): the map check flags two phases whose `does:` match
    after the name is removed.
  - a scene that fails its own schema (E6) and the README link (E5) are that project's to fix, not Nexus's.
