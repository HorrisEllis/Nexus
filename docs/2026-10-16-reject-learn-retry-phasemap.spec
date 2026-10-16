# docs/2026-10-16-reject-learn-retry-phasemap.spec
# A rejected proposal teaches the agent its failure mode, and the retry starts from that lesson.
# MAPPED 2026-10-16, before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec.

origin:
  date: 2026-10-16
  james: "okay, it \"completed\" a contract. when i reject a propasal, the agent needs to understand the failure mode ad try again, after learning"
  then: "why so much regression?"
  looking_at: >-
    His Code tab on 0.60.93: three rejected agent proposals for phase IH1_intent_nodes_point_at_hats (run c4f-w8sk).
    lib/intent-hat-router.js +24 -114, lib/hat-seed.js +20 -281, lib/node-schemas/schema.intent +31 -54. Below them in
    Tasks, four rows "auto-retry-held … the previous run stalled after 'auto-retry-held'".
  reading: >-
    The coder's reading. "Regression" means the proposals delete code: the agent sends the whole file back, and anything
    it leaves out is deleted. "After learning" means the retry must carry what went wrong, and the lesson must outlive
    that one retry. To confirm.

evidence:
  # measured 2026-10-16 on main 0.60.103, not from memory
  - "Main already has, since his 0.60.93: the shrink screen (an agent cutting a 100+ line file below a quarter is refused, 0.60.98), proposal evidence (lines, exports, declarations lost, linked tests run before and after, 0.60.99), and the reject retry with James's reason and the evidence (0.60.99, per-kind caps 0.60.102). 0.60.102 also fixed the auto-retry-held loop in his Tasks list."
  - "What still gets through: intent-hat-router.js 124 → 34 lines is above a quarter, so the shrink screen passes it. schema.intent is under 100 lines, so the screen never looks."
  - "Reject runs _tellAgentRejected and _autoRetry in parallel. The tell asks the agent which cause it was and what it will do differently, but the answer only reaches the activity log. The retry never sees it."
  - "On reject, repo-inject logs fault mode 'undone' without the phase. lib/phase-faults.js precedent(phase) filters by phase, so a rejection never reaches the next attempt's 'WHAT WENT WRONG ON THIS PHASE BEFORE' or the Plan's precedent line."

phases:
  RL1_classify_the_rejection:
    status: BUILT 0.60.105
    systems: [idearium, core]
    files: [lib/phase-faults.js]
    does: >-
      rejectionModes(evidence, reason) names the failure modes deterministically, before any model is asked:
      no-parse, regressed (a linked test passed before and fails on the proposal), exports-lost, gutted (a 40+ line file
      cut by more than 40% while losing declarations), decls-lost; 'rejected' when no evidence explains it (his reason
      alone). learnRejection logs one fault per mode WITH the phase and map, so precedent(phase) carries it to the next
      attempt and the Plan shows it. The agent's own diagnosis is kept on the fault.
    proof: tests/modules/test-reject-learn-retry.test.js RL-01..03

  RL2_learn_then_retry:
    status: BUILT 0.60.105
    systems: [idearium]
    files: [idearium/api/index.js]
    does: >-
      Reject now runs in order: classify → tell the agent (the modes named) → its answer, its diagnosis → log the lesson
      → retry. The retry note carries the modes, the evidence, and the agent's own diagnosis. If the agent does not
      answer, the retry still runs with the classified modes. The retry caps are unchanged (repos.reject_retries).
    proof: RL-04 (the order, with a stub agent)

  RL3_stop_the_regression_before_it_reaches_him:
    status: BUILT 0.60.105
    systems: [idearium]
    files: [lib/repo-inject.js]
    does: >-
      The propose screen for an agent also refuses a proposal that removes exports, and a gutted one (a 40+ line file
      cut by more than 40% while losing declarations). Both name what was lost. A person can still make such a change
      (the screen is for agents only, like the shrink rule). The refusal text goes back to the agent, as it already did.
    proof: RL-05, RL-06 (his intent-hat-router shape: 124 → 34 lines; schema-sized 54 → 31)

  RL4_the_lessons_on_the_door:
    status: BUILT 0.60.105
    systems: [idearium]
    files: [idearium/cli/route-commands.js, idearium/api/index.js]
    does: >-
      GET /api/repos/:uuid/lessons?phase= returns the precedent text and fault rows; command `repo lessons <repo>
      [--phase P]`. UI: the Plan's precedent line already renders precedent(phase) (plan-panel.js _ppPrecedent), so the
      new modes show there with their own words.
    proof: RL-07

open:
  - "Lessons are per phase. A lesson per agent across phases (lib/agent-notes.js) is not wired: say so if wanted."
  - "No live run on his machine yet."
