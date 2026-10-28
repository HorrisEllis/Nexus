# 0.60.201 — for any project: a busy Idearium is said plainly, and any project's tests can run

James, 2026-10-21, with a screenshot of the upload dialog ("could not start: signal is aborted without reason") and his boot log: "okay,
remember this is for any project. not just mmine"

## What his log showed
- The upload dialog's first step creates the import compartment, and the browser waited 6 s for it.
- At that moment Idearium was syncing all of Nexus, as it does at boot. The sync took 118 s and Idearium went OFFLINE once, with free
  memory between 10 and 17 %. The wait ran out, and the browser's own words, "signal is aborted without reason", were all he saw.

## What changed, for every project
- The upload's start waits 60 s.
- Every Idearium call in the UI that runs out of time now says which call, how long it waited, and that Idearium may be busy (a sync,
  an import, or low memory). The error keeps its name, so the finalize fallback of 0.60.196 still finds a late import.
- "Do the tests pass" (proof) reads how a project's tests run from what the project holds, first match wins:
  1. an npm test script;
  2. its own runner (tests/run-all.js and similar);
  3. a Gradle wrapper or build;
  4. Maven;
  5. pytest;
  6. Cargo;
  7. Go;
  8. a Makefile test target.

  When the tool for that way is not installed, it is said ("tool_missing"), never counted as failing tests. 0.60.200's fallback knew
  only Node runners.

## Proof
- tests/modules/test-any-project-tests.test.js 3/3: detection for every way, real Go and make projects passing and failing through
  proof, and a missing tool said.
- test-pipeline-root-causes RC-19: the real api() against a fetch that never answers.
- Unchanged: test-mastermind-ready 4/4 (MR-03's wording updated), proof-run 7/7, phase-proof 7/7, gates-solid 7/7.

## Not yet for any project
The build's other gates still assume JavaScript: test-first, verify-first and the coder brief. Those are the language profiles (AD1–AD2
on docs/2026-10-19-infrastructure-spine-phasemap.spec).

## On his machine
He is on 0.60.198. The fixes of 0.60.199–0.60.201 (roadmap import, the MASTERMIND fixes, this release) need the updated branch.
