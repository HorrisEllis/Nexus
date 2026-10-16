# docs/2026-10-16-proposal-evidence-phasemap.spec — a proposal is tested before it reaches a person, and a rejection leaves context behind
# PE1-PE4 BUILT 0.60.75 (backend). PE5-PE9 MAPPED, not built. Owner: what happens to an agent's proposed change between "the agent wrote it" and "James presses Apply".
meta:
  name: 2026-10-16-proposal-evidence-phasemap
  version: 1.0.0
  origin: >-
    James, 2026-10-16, after an agent's proposal for lib/hat-seed.js (-281 +20, did not parse) reached the Apply button and he rejected it:
    "it's stopped. needs to retry, also probably should gather context on why it was rejected. even injecting it into complex reasoning
    agents. to compare, but also the comparison engine? like can you find all tests, qa, qc, debugging, strategy, relationships. okay, yeah
    like it needs to be tested before it gets there, and any tests needs to be informative for the agents."
    Earlier in the same exchange: "what about generating the tests first, wouldn't that be easier and then it would help shape the expectation
    of the output?" (the coder's answer: yes, with two conditions: seen failing first, and written by a different agent than the builder.)
grounded:
  found_by_reading:
    - "The code.write step gate (parses, not empty) blocks that very file. It ran only inside repo-inject land(); lib/code-edit.js and two idearium API routes call RI.propose()/RI.edit() directly and skipped it. Fixed in 0.60.74: the screen is in propose() and edit()."
    - "The retry stopped because repos.auto_retries = 2 per phase per day counted every automatic retry together. The two before it were infrastructure failures (copilot 'signal is aborted without reason', chatgpt tab_busy), so the rejection retry was held: 'already had 2 automatic retries today'."
    - "A rejection reached the agent as one sentence plus James's reason, which he usually does not give. The agent's reply ('I would review the failing tests') was generic: no test had run."
    - "The repo graph (idearium/repo/graph.js) has tested_by / tests / verified_by relations marked 'needs a test-mapping pass (MCO2 L6)': no file-to-tests map existed."
    - "cos/spec/qa-catalog.spec (James, 2026-10-10: 'find all useful tests, debugging, hostile attacking, red teaming, and qa, qc') and cos/spec/check-catalogue.spec already catalogue the methods. Nexus has about 800 test files, none of the property/fuzz/mutation kinds."
    - "lib/safe-apply.js already verifies a change inside a COS branch; .contract v2 already has executable conditions ({test: file}, {check: ...}). Neither is on the Code tab's proposal path yet."
phases:
  PE1_test_map: {status: BUILT-0.60.75, what: "lib/test-map.js: the tests that exercise a file, by how (requires / path / name), direct links only. 796 test files indexed. Feeds the graph's empty tested_by slot later (PE7)."}
  PE2_evidence: {status: BUILT-0.60.75, what: "lib/proposal-evidence.js: compare (lines, declarations and EXPORTS lost/added, parse) and the linked tests run in a shadow copy of the tree twice, with the file as it is and as proposed. Verdicts: REGRESSION / fixed / passes / already-failing. Output lines that say what failed, not stack frames. data/ in the shadow is empty."}
  PE3_wired_and_gated: {status: BUILT-0.60.75, what: "repo-inject: evidence attached in the background after an agent's propose() and cleared on edit(); apply() refuses an agent proposal with a regression unless forced. Off in sandboxed test runs (NEXUS_INJECT_DIR set) unless NEXUS_EVIDENCE=on."}
  PE4_rejection_context: {status: BUILT-0.60.75, untested_live: true, what: "idearium/api: a rejection tells the agent James's reason AND what the evidence found, and asks which of it was the cause; the same text goes into the retry note. repos.auto_retries now counts per kind, so a reject retry is not held by earlier stall retries. Needs a live run to confirm; no automated test reaches the API route."}
  PE5_show_it: {status: MAPPED, what: "The Code tab's Changes view shows the evidence on each proposal (REGRESSION lines, lost exports, 'ran 5 of 6') beside the diff, and Apply is visibly disabled with the reason. Folds into TB (code-tab rebuild). Today it is in the proposal's JSON only."}
  PE6_tests_first: {status: MAPPED, what: "From the contract's conditions, a DIFFERENT hat than the builder (the officiator) writes the tests before the build. Each is run against the current tree and kept only if it FAILS where the behaviour is new (a test that already passes proves nothing); for an existing file, characterization tests of what it does today are written first. The builder is given the tests with the task. Run in a COS compartment through safe_apply so a failing proposal is rewound. Rule: written by a different agent, seen failing first."}
  PE7_comparison_engine: {status: MAPPED, what: "One comparison surface over what is built piecemeal: the proposal vs the file (PE2), two agents' answers to the same task, a run against its previous attempt. Written to the graph as tested_by / verified_by edges from PE1. A stronger reasoning agent is handed a rejection's context plus the sibling files when the same phase has been rejected twice (not before: deterministic first)."}
  PE8_learn: {status: MAPPED, what: "Every screened, regressed and rejected proposal is a record the intelligence system can pattern over (which hat, which kind of file, which failure) and the debug/diagnostic gap field can raise. The rejection reason and evidence are written where agents query first (nexus memory), so the same mistake is not re-made."}
  PE9_infrastructure_failures: {status: OPEN, what: "'copilot gave no route: signal is aborted without reason' and chatgpt 'tab_busy' still fail a plan step before any test could help. The abort source is not found; tab_busy refuses rather than queues."}
decisions_open:
  - "Is 'debug' the diagnostic system (:7825) or the Debug tab in Idearium? PE8 needs to know which one learns."
  - "PE6: should the test writer be the officiator hat (the coder's recommendation, it already owns the contract) or a new hat?"
limits:
  - "Only tests directly linked to the file run (a break only visible through a consumer's consumer is not found); at most 6 tests, 60 s each."
  - "A test that needs data/ or a running service fails both times and is 'already-failing': it neither clears nor blames the proposal."
  - "Passing tests show the change did not break what those tests check; they do not prove the change is right."

## ADDENDUM 2026-10-16 (b): the two open decisions, answered by ChatGPT's advice, pasted by James
# James pasted ChatGPT's answer to decisions_open with no words of his own. It is recorded as the direction taken, TO CONFIRM:
# he did not say yes or no. The coder's earlier recommendation for PE6 (the officiator writes the tests) is SUPERSEDED by it below; the earlier text stays (§0.3).
decisions:
  debug_two_layers:
    asked: "Is 'debug' the diagnostic system (:7825) or the Debug tab in Idearium?"
    chosen_to_confirm: "Both, as different layers, mapped independently and then joined through their real interfaces. The diagnostic system (:7825) holds signals, logs, error records and debugging operations. The Debug tab is how a person inspects and drives them, and consumes the diagnostic system's outputs rather than re-implementing debugging logic. The join shows whether the tab is a true control surface over :7825 or has functions of its own. PE8 learns from the diagnostic system's records; the tab only shows them."
    adds: "PE9 inventory lists 'signal is aborted without reason' as an UNRESOLVED failure with evidence and reproduction status (reproduced / not reproduced). The message is not assumed to name the root cause."
  pe6_test_writer:
    asked: "PE6: the officiator hat (coder's recommendation) or a new hat?"
    chosen_to_confirm: "A dedicated test-writer hat, separate from the officiator, for independence: the agent that designs the implementation must not write the tests from the same assumptions. The test writer never declares its own tests sufficient."
    split:
      contract_and_acceptance: "the contract / specification process"
      write_tests_from_contract: "test-writer hat"
      run_on_unmodified_baseline: "evidence runner (lib/proposal-evidence.js)"
      confirm_tests_detect_the_missing_behaviour: "officiator or an independent validation stage"
      run_on_proposed_implementation: "evidence runner"
      judge_evidence_against_acceptance: "officiator"
      apply_or_reject: "the existing approval workflow"
    rules:
      - "Tests are written BEFORE the implementation, run against the baseline, and must fail for the intended missing behaviour."
      - "A baseline failure is not proof of a good test. The officiator tells an expected ASSERTION failure from an invalid environment (broken infrastructure, missing dependency); only the first counts."
      - "PE6 extends the PE2/PE3 evidence model and feeds the same comparison engine and records PE7 uses for tested_by edges. No second QA pipeline that answers 'is it correct' on its own."
sequence: "map existing test / QA / QC / debug / comparison capability (PE1, PE7 inventory) -> test-writer contract and independence rules -> contract-derived tests before implementation -> validate they detect the missing behaviour -> feed the common evidence and comparison model."
