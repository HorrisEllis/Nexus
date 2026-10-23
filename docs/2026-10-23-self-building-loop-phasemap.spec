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
    status: OPEN
    layer: library
    depends_on: [SL0_what_can_be_built_now]
    files: [lib/phase-groom.js, lib/phase-map-auto.js, lib/phase-dag.js]
    spec: docs/self-building-loop.spec
    blocks: [MOD-SL-GROOM]
    does: >-
      The 514 phases with no files and the 535 with no depends_on made buildable: MP1 already infers a phase's files and its
      inferred dependencies from its own words; this writes them into the map as a proposal (a change to the map file, through
      repo-inject, with what each came from), never silently. Same-file pairs with no order (251) get a proposed order from the
      DAG's layers. Cycles and dangling references are listed for a person (they need a choice).
    proof: "proposals for the map edits, each with its evidence; applied, SL0's queue grows by that many and DG2 accepts them"

  SL4_the_loop:
    status: OPEN
    layer: integration
    depends_on: [SL1_a_proven_phase_closes_itself, SL0_what_can_be_built_now, AB1_autobuild_loop_and_resume, FR10_stop_the_ladder]
    files: [idearium/lib/autobuild.js, idearium/api/index.js, idearium/cli/route-commands.js]
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
    status: OPEN-DECISION
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
