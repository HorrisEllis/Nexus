# NEXUS 0.39.193 — runtime proof per chunk

James: prioritise runtime proof. "Covered by a test" only means a test imports the file. This records
which chunks actually RAN under a passing test.

- `idearium/repo/runtime-proof.js`: runs each runnable JS test file (L6's own selection, `isTestPath`,
  same 15s limit; **it executes repo code, as L6 does**) under `NODE_V8_COVERAGE`, maps the executed
  ranges onto the chunks' line ranges, writes `proof.json`.
- Per chunk: `passed` (a test that exited 0 executed it), `failed` (only failing tests did), `none`,
  `no_tests`, `unsupported` (not JS: no runner, not a failure), `test`. Each lists which tests
  executed it and how many of its lines ran.
- **Tied to the chunk hash.** `readRuntimeProof` marks a chunk `stale` when its content hash (or the
  chunk itself) has changed since it was proven; a proof can't vouch for code it never ran.
- **Function-level where it exists.** A chunk with a function is judged by V8's entry count for that
  function. Judging by lines let a trailing `module.exports = ...` in the same chunk vouch for an
  uncalled function; the first test run caught that.
- Routes `POST /api/repos/:uuid/proof` (run; returns summary + tests) and
  `GET /api/repos/:uuid/proof` (`?state=`, `?file=`, `?chunk=`; each chunk has `stale`); registry
  components; `idearium.repo_chunks.tool` gains `action:"proof"`. `proof.json` is in the materialize
  PRESERVE set (the same class of bug as graph.json before it).

## Verification
`test-runtime-proof` 18/18: real repos, the real pipeline, real spawned node processes. Mutation
checks: a failing test counted as proof, and line-only judging, each fail tests. `test-repo-chunks-tool`
11/11, `test-repo-agent-node` 44/44.
**Not run:** the new routes over real HTTP against a booted idearium; the full `run-all.js`.

## Limits, stated
- It proves the code RAN under a passing test. It does not prove the test asserts anything about it.
- JS only; other languages are `unsupported`. The single-file test runner is L6's: tests that need a
  harness (mocha, jest) are not run.
- Top-level-only chunks are judged by lines, a heuristic (first line ignored in multi-line chunks).
- Not yet in the chunk graph: `chunk.tests` is still `[]`; proof is beside the chunks, not on them.

## Next
Put proof on the chunk (and in the `context` pack), populate `tests` from the executed-by edges, then
call edges.
