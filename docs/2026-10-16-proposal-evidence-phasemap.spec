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
