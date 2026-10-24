**Why TF-04 fails.** TF-03 wrote and proved the phase's code in the same repository, so the phase's files are on disk when TF-04 runs. `alreadyDone = planFiles.every(existsSync)` is therefore `true`. The stub's `assert.ok(true)` gets `passes-already`, `decide` returns `accept-already`, `got` is set, and the loop ends after the first ask. Nothing is retried and the build does not stop. The added rule did what it was written to do. The test has a hidden dependency on the order the tests run in, and the rule itself has a weak spot.

**End-state.** Minimal: TF-04 tests what it claims to test (reject, re-ask with feedback, stop). Optimal: every test starts from its own state, and "already done" comes from evidence rather than from files existing. Exceptional: a passing test is never kept unless it actually exercises the phase's files. `assert.ok(true)` is never accepted, in any state.

**Constraints.** Wall: a phase whose code exists cannot get a failing test (this is why `accept-already` was added). Wall: the code is not yet written when the test is first run. Obstacle: TF-03 and TF-04 sharing a repository. Obstacle: using file existence as the signal for "done". Obstacle: a passing test is accepted without checking what it covers.

**Invariants.** Under the current rule, `decide` is a pure function of (verdict, alreadyDone). The loop only re-asks on `reject`. So the outcome of TF-04 depends entirely on the state of the disk, which TF-03 changed.

**Gaps (working back from the end-state).** TF-04 needs alreadyDone to be false, and it is true. For keeping a regression test to mean something, the test must touch the plan files, and nothing checks that. Neither the run nor the test records why the writer was asked only once. `accept-already` happened without a word: the build's record should show "kept as regression test because the files exist", so the cause would have been visible.

**Options.**
A. Isolate the tests. TF-04 gets a fresh copy of the repository, or one reset to before TF-03 ran (or alreadyDone is passed in as false explicitly). This is cheap and fixes the test, but it leaves the hole in production.
B. Fix the rule as well:
- Take alreadyDone from the phase's proof record (phase built and proven), not from `existsSync`. Files often exist before a phase that edits them, so existing files do not mean the phase is done.
- Accept `passes-already` only if the test requires or imports at least one plan file. Otherwise reject it with the reason "trivial: exercises no plan file".
- Add TF-04b: on a phase that is already done, the trivial stub is still rejected twice and the build stops.
- Record `accept-already` with its reason on the run row.

**Choice:** A and B together. A makes TF-04 honest. B closes the real defect that TF-04 exposed: on any phase whose files already exist, `assert.ok(true)` is accepted today.

**Attack.** Weakest assumption: that "requires a plan file" is a good enough measure of coverage. A test could require the file and assert nothing. Repair: also require at least one assertion that touches an export of the plan file, and treat the check as a cheap filter, not as proof. Failure mode: a proof record that is missing or stale makes alreadyDone false on a phase that is really done. The writer then cannot produce a failing test and the build stops. That stop is loud, and its reason can be traced, which is better than a silent accept.

**What each claim rests on, and what would prove it wrong.** The diagnosis rests on the code as quoted: `existsSync` across planFiles, and the loop ending on `accept-already`. It is wrong if TF-03 cleans up its files, or if TF-04 runs in a different directory. Check by logging `alreadyDone` and `d` in TF-04. If they show `false` and `reject` but the writer was still asked only once, the cause lies elsewhere, for example `got` being set by a leftover value or an error thrown inside `validate`.
