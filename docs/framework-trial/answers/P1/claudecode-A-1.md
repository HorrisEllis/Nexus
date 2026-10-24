**Why TF-04 fails**

TF-04 inherits state that TF-03 left on disk. TF-03 runs the whole phase: it writes the phase's code and proves it, so every file in `planFiles` now exists in that repository. TF-04 then runs on the same repository and the same phase, so:

1. `alreadyDone = planFiles.every(existsSync)` evaluates to **true**.
2. The stub returns `assert.ok(true)`, and `validate` reports `passes-already`.
3. `decide('passes-already', { alreadyDone: true })` returns **`accept-already`**, not `reject`.
4. `got` is set on n = 1, and the loop exits without a second ask, without feedback, and without stopping the build.

The retry logic works as written. The `accept-already` exception, which was added later, changed the meaning of the TF-04 setup. TF-04 was written before that exception existed, when "passes before code" always meant reject. Since the exception, its outcome depends on whether the files exist. So the test is coupled to the order of the tests, not to the behaviour it means to check. Run on its own, against a fresh repo, it would probably pass.

**A second problem the failure exposes**

`accept-already` treats a vacuous test as a regression test. `assert.ok(true)` checks nothing, yet it is now kept as the phase's test. The production build has the same leak. Suppose a phase's files exist because of an earlier partial or failed run, a scaffold, or empty placeholders. Then any passing test is accepted, including one that never loads those files. File existence is a weak stand-in for "this phase is done and proven".

**What to do**

1. **Isolate the test (the fix TF-04 needs).** Give TF-04 its own fresh temporary repo, or a phase whose `planFiles` do not exist. Do not tidy up after TF-03 to get there. Assert the precondition explicitly, `alreadyDone === false`, so that the next coupling of this kind fails with a clear message and not a puzzling "asked once".
2. **Cover the new branch on purpose.** Add a test (TF-04b) that runs with the files present and checks that a passing test is accepted as `accept-already`, labelled as such and recorded. Right now that path is only exercised by accident.
3. **Tighten `alreadyDone`.** Take it from the build's own record that the phase was proven: a ledger or run row with a passing proof. Do not take it from `existsSync` alone. Failing that, at least require non-empty files.
4. **Reject vacuous regression tests even when the phase is done.** Under `accept-already`, require that the test actually loads or exercises at least one plan file. You can check this with a cheap static scan for `require`/`import` of a plan path, or with coverage. Otherwise reject it with feedback such as "passes-already: test does not touch the phase's files". That keeps the "two unusable tests, then stop" contract meaningful for done phases too.

**Recommendation**

Fix TF-04 by isolating its repository (fresh temp dir per test) and asserting `alreadyDone === false`. Add a dedicated test for `accept-already`. Then tighten `accept-already` so that it needs recorded proof of the phase and a test that touches the plan files.

Reasons: the failure comes from leaked state, not from broken retry logic. And the same leak lets real builds accept tests that check nothing.

Risks and uncertainties:
- I am inferring that TF-03 and TF-04 share a phase or plan whose files TF-03 created. If TF-04 uses different plan paths, check whether another fixture creates them.
- The "touches plan files" heuristic can be fooled: a test can require a file and assert nothing. Coverage is more reliable but costs more.
- Changing where `alreadyDone` comes from may alter how existing phases that are already built behave on a rebuild.
