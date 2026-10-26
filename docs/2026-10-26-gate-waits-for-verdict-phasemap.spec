spec:
  meta:
    name:     gate-waits-for-verdict
    version:  1.0.0
    date:     2026-10-26
    release:  "0.60.257"
    uuid:     gate-waits-for-verdict-phasemap-v1-0000-2026-1026-jamesbrooks-001
    owner:    "cortex (RAID's contract scheduler and intake) + idearium (the build's proof gate, the verdict route, the row, the Tasks panel) + core (run-watch, repo-activity)"
    voice: "The ideas and the calls are James's. `james:` is his, verbatim. `does:` is the coder's reading, his to correct."
    origin: >-
      James, 2026-10-26, with screenshots of NEXUS/CORE building IC1_context_by_uuid_injection (docs/2026-08-30-interaction-contract-context-phasemap.spec):
      "the gate doesn't wait for me to accept it or not before it fails. i want to be able to build nexus inside of nexus. need nexus to use
      those gates. like raid or orchastrator. look at recent phases."
    axioms: "docs/AXIOMS-v3.1.md — USER_AUTONOMY (a verdict nothing can check is his), §1.2 nothing silent, §5.2/§9.1 RAID decides (the build already runs as a RAID contract; the verdict goes back to RAID's queue row), REVERSIBILITY (a rejected change is reverted), §3.3 map before build"
    traced_2026_10_26: >-
      Read in the code, not assumed (§0.1). The build already runs through RAID: idearium/api/index.js runPlanned → cortex/core/raid/contract-intake.js
      runContract → contract-gates.js schedule; the last brick is the phase gate (integrate → _provePhase). IC1 declares no files and no
      conditions, and the planner did not run (no Ollama model on the ladder), so no conditions were generated either: _provePhase answered
      no-proof. integrate returned ok:false, the scheduler read that as a FAILED brick and retried it three times in the same second (no-proof
      cannot change between tries), then the gate was FAILED and the run contract-incomplete, and RAID asked self-heal (HEAL_REQUESTED). At no
      step was he asked. Gemini's spec file was already written when this happened.
    reading_of_his_words: >-
      The coder's reading, to confirm: "wait for me to accept it or not" = when nothing in Nexus can check a phase's result, the gate stops and
      waits for his verdict (accept or reject) instead of failing; accept proves and lands it, reject reverts it. "use those gates. like raid"
      = the wait and the verdict are RAID's (its scheduler holds the gate, its queue row carries the verdict), not a side door in Idearium.

  decisions:
    GV_D1_what_waits:
      status: DECIDED 2026-10-26 by his axioms
      chosen: >-
        Decided by his axioms (USER_AUTONOMY, §1.2): only a gate with nothing machine-checkable (no-proof) waits for him. A gate whose
        conditions ran and failed still fails and retries as before: that is evidence, not a question.
    GV_D2_what_his_verdict_does:
      status: DECIDED 2026-10-26 by his axioms
      chosen: >-
        Decided by his axioms (REVERSIBILITY, §9.1): accept = a proven row that says it was proven by him and in his words, the run's
        proposals land (approvedBy his name), the phase closes, RAID's queue row passes. Reject = the run's changes are reverted (proposed
        ones rejected, applied ones reverted), the run is unproven with his words, RAID's queue row fails. Both are on the activity log.

  phases:
    GV1_raid_holds_a_gate_for_a_person:
      status: DONE (0.60.257)
      depends_on: [GV_D1_what_waits]
      files: [cortex/core/raid/contract-gates.js, cortex/core/raid/contract-intake.js]
      does: "schedule(): an executor that answers { awaitsPerson, why } leaves its gate READY (never FAILED, no retry spent), records <gate>.awaiting, and the schedule returns awaiting: [{ id, why, person: true }]. runContract(): a contract that did not complete only because a gate awaits a person is status 'awaiting' (STATUS.AWAITING), never 'fail', and asks no self-heal. reportExternalOutcome takes the verdict later."
    GV2_the_phase_gate_asks:
      status: DONE (0.60.257)
      depends_on: [GV1_raid_holds_a_gate_for_a_person, GV_D2_what_his_verdict_does]
      files: [idearium/api/index.js, lib/run-watch.js, lib/repo-activity.js]
      does: "integrate: no-proof → awaitsPerson with the reason. The run records 'awaiting-verdict' (with RAID's queue id); run-watch never calls it stalled; the Tasks panel shows it as waiting on him. POST /api/repos/:uuid/phases/verdict { runId, accept, words } does GV_D2."
    GV3_his_buttons_and_the_row:
      status: DONE (0.60.257)
      depends_on: [GV2_the_phase_gate_asks]
      files: [idearium/ui/js/repo-tasks.js, idearium/cli/route-commands.js]
      does: "A waiting phase in the Tasks panel shows ✓ accept and ✗ reject (reject asks first; both take his words). Row: `repo verdict <repo> <runId> accept|reject [--words \"…\"]`, so agents reach it through nexus.command."
    GV4_proof:
      status: DONE (0.60.257)
      depends_on: [GV3_his_buttons_and_the_row]
      files: [tests/modules/test-gate-waits-for-verdict.test.js, tests/modules/run-all.js, loom/maps/run-state-map.js]
      does: "A real RAID contract whose integrate answers awaitsPerson: the gate is not FAILED, no retry is spent, the contract is 'awaiting', no HEAL_REQUESTED; a failing check still fails. The route, row, buttons, run-watch and the task status are wired."
