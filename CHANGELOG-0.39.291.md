# 0.39.291 — 2026-10-01

James: "Conrinue it first. Make sure it's enterprise grade. Let's finish what idearium needs, then I'll record it"
James: "gate, verify, check, if failed, send back and fix it, then back through."

An outside audit asked whether Idearium's generated code actually works. Until now nothing answered that question. This release does: Idearium builds a project's files, runs its tests in isolation, and sends each failure back to the agent with the exact error, round after round, until the tests pass or the round limit is reached.

## Verify (`lib/build-verify.js`)
Verification runs in three steps, all through what COS already has:
1. **Every file parses.** JavaScript through COS's syntax check; JSON and YAML parsed; Python compiled when `python3` is installed, and said when it isn't.
2. **Every import resolves.** A relative import of a missing file fails the file that imports it. A package that is neither built in nor declared fails the file that uses it. A declared package that isn't installed is reported, not counted as a code failure.
3. **The project's own tests run** in an isolated COS branch: its test script, else every test file. They only run once steps 1 and 2 are clean, so a broken file can't bury the real error.

**The verdict is never inflated:**
- **failed**: something broke.
- **parses**: everything is clean but no tests ran, so it is *not proven*, and the reason is given.
- **proven**: the tests ran and passed.

**Each failure lands on one file, with the exact error.** A failing test is traced to the code it loads, not the test file, and carries:
- the actual and expected values;
- the test's own source;
- the line and a code excerpt.

Runtime noise is cut out (Node's internal stack lines, sandbox paths).

## Repair
- **Failures go back to the agent.** `markForRepair` returns each failing file to pending. Its prompt then says: *this file failed verification, fix what the failures name and keep what works*, followed by the failures and the file as it is now. Previously a retry kept the failure as `priorFailure` and never showed it to the agent, which rewrote the file blind.
- **Reuse is skipped during a repair.** A file under repair skips every reuse shortcut (the component store, a prior section), and the cache can't match because the prompt has changed.
- **A failed version is never reused.** `component-store.markFailed` keeps it on disk with the reason, and drops every reuse key that pointed at it.
- **Repairs are recorded.** When the fix completes, the repair moves into the chunk's `repairHistory`: what failed, in which round, and what replaced it.

## Prove: the loop
- **The loop:** build every pending file one at a time, in layer order, so each prompt includes the files already built beneath it. Then verify, send failures back, and go again, up to N rounds (default 3).
- **When it stops:** at *proven*; at the round limit, with the remaining failures named; or when a build stalls, with the stalled files named.
- **The record:** every round is a row in `idearium_proof_runs`.
- **No double builds:** the build queue never builds a spec while a proof run is building it.

Where to find it:
- API: `POST /api/repos/:uuid/verify`, `POST|GET /api/repos/:uuid/prove`, `POST …/prove/cancel`.
- CLI: `idearium verify <repo>`, `idearium prove <repo> [--rounds N] [--cancel]`.
- UI: the Plan panel's **does it work** section, with **✓ verify** and **▶ build & prove**, showing each round live.

## Proven end to end
`tests/modules/test-prove-loop.test.js` runs the real Idearium server against a real code spec, repo and COS compartment. The model is a fake Ollama that writes `lib/sum.js` wrong (`a - b`):
1. Round 1 builds 3 files. The test fails in COS, and the failure is traced to `lib/sum.js`.
2. The file goes back with *actual -1, expected 5* and what the test asks for.
3. Round 2 rebuilds that one file and the verdict is **proven**.

Stable over 3 runs.

## Three bugs that broke real builds, found by that test and fixed
1. **Every short file was rejected.** The seam detector judged a file's length against its *prompt*: at least 40% of the prompt and at least 200 characters. A correct 3-line module failed every agent until the build stalled. A file chunk is now judged as a file: it fails only if it's empty or cut off. Parsing is the write gate's job; working is verification's.
2. **Files were saved with their Markdown fences.** A direct Ollama build saved `package.json` starting with ```` ```json ````, so it wasn't valid JSON. A file chunk is now the code inside the fence, on both completion paths (direct and queued). A reply with an unclosed fence is never written. README-style files keep their own fences.
3. **Idearium's own Ollama path was never hardened.** `agent-suite`'s `generateWithOllama` still had the 120 s total timeout, the 2048-token cap and the empty thinking-model reply. It now uses the client hardened in 0.39.289: streamed, idle timeout, `think: false` on retry, cut-off continuation.

## Also
- `jaaDB.flush()`: debounced writes can be flushed before handing off to another process.

Tests: `test-build-verify` 11/11 · `test-prove-loop` 6/6. Across 127 affected suites, 0 new failures. The seven that fail also fail on the code before this change: four are known gaps, three aren't run by the suite.
