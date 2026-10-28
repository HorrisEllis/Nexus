**Why TF-04 fails**

TF-04 is not hitting the reject path at all. TF-03 ran first on the same repository and wrote the phase's code to disk. When TF-04 starts, `planFiles.every(existsSync)` is therefore true, so `alreadyDone = true`. The stubbed `assert.ok(true)` test comes back `passes-already`, and `decide` returns `accept-already` on the first ask. `got` is set and the loop ends. The writer is asked once, no feedback is sent, and the build does not stop. The code is doing what the later "already done" rule says it should. The test's assumption, that this phase is not built yet, became false because TF-03 left state behind. This is a test-isolation leak, not a regression in `decide`.

**What holds regardless**
- `decide('passes-already', {alreadyDone:false})` returns `reject`. The retry path is still correct.
- `alreadyDone` is computed from disk, so any test that shares a repo with an earlier build inherits that build's files.
- The `accept-already` rule is legitimate. A phase that is truly built can never get a failing test.

**Options**
1. **Give TF-04 its own fresh repository** (a new temp dir or clean fixture), or a phase whose `planFiles` do not exist. This restores the condition TF-04 is meant to test. It is the minimal and correct fix.
2. **Reset or clean up after TF-03**: delete the written files, or snapshot the repo and restore it. This works, but it makes TF-04 depend on TF-03's cleanup, so the order coupling stays.
3. **Remove or narrow `accept-already`** so TF-04 passes again. This is rejected because it breaks the case the rule was added for: rebuilding an existing phase would always stop after two "useless" tests.

**Chosen: option 1, plus two guards.**
- TF-04 asserts its precondition before running: none of `planFiles` exist, so `alreadyDone === false`. If that ever fails, the error says "precondition broken: phase already on disk", not the misleading "asked only once".
- Add a test for the other branch. With files present and a passing test, the result should be `accept-already` with one ask. That way both branches of the rule are specified, and the behaviour TF-04 accidentally hit becomes something a test checks on purpose.

**Attacking the choice**
- **Weakest assumption:** that this ordering is the only reason for the single ask. Other possible reasons are a stub not wired in, `validate` returning `not-run` (which is also accepted on the first ask), or the code reading a different `repoDir`. The precondition assertion plus logging `v.verdict` and `d` per attempt tells these apart. `not-run` being accepted silently is its own gap: a test that never ran proves nothing either, and that should be reviewed.
- **Gap in the product:** `alreadyDone` treats "files exist" as "phase done". A partly written phase, or files that are stale or come from another phase, would pass a vacuous test and keep it as a "regression test". `assert.ok(true)` should never count as a regression test. Two remedies: require the accepted test to actually reference or import a plan file, or record `accept-already` loudly on the run so it is never silent.

**What each claim rests on, and what would disprove it**
- The diagnosis rests on TF-03 writing `planFiles` into the shared repo, and on `alreadyDone` being read from disk at build time.
- It is wrong if, in TF-04's repo, `planFiles` are absent at build start and the writer is still asked only once. In that case look at `validate`'s verdict (`not-run`?) or at the stub wiring.
- It is confirmed if running TF-04 alone, or first, gives two asks with feedback on the second, followed by a stop.
