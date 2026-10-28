# 0.60.167 — 2026-10-19 — a phase that is already done no longer loops forever on test-first

James, 2026-10-19: "been stuck on that phase for hours." (SP5_title, looking-glass-bundle-v0.4.)

## The cause
SP5_title is a trivial "title" phase, and `lib/title.js` **already existed and worked**. But `routing.test_first = require`
demands a test that **fails first** — and a phase whose code already exists can never produce one. Every attempt came back
`passes-already` ("it passes before any code is written, so it proves nothing"), or the writer made tool calls instead of
writing a test ("the reply had no code block"), and the build **refused each time** — for hours. The log's own hint:
"routing.test_first is require; prefer builds without it."

## The fix
- **`lib/test-first.js decide(verdict, { alreadyDone })`** → `accept` | `accept-already` | `reject`:
  - `fails-as-expected` / `not-run` → **accept** (unchanged);
  - `passes-already` **and the phase's files already exist** → **accept-already** — the passing test is a valid regression
    test and the phase is already satisfied;
  - otherwise → **reject** (fail-first is still enforced for genuinely new code).
- **`idearium/api/index.js`** computes `alreadyDone` (every planned file exists on disk) and no longer **refuses** an
  already-satisfied phase under `require` — it builds without a new test, which completes because the files already pass
  (TF1 and the files' own checks still hold). A phase with no existing files is unchanged: fail-first still required.

## Proof
`tests/modules/test-tf-already-done.test.js` — TD 4/4: accept paths unchanged; `passes-already` + files-exist → accept-already
(the unblock); `passes-already` with no files → reject (fail-first still enforced); invalid → reject.

## Files
- `lib/test-first.js` — `decide`, exported.
- `idearium/api/index.js` — `alreadyDone`; `decide` in the verdict check; don't refuse an already-satisfied phase.
- `tests/modules/test-tf-already-done.test.js`, `run-all.js`; `lib/version.js`, `package.json` — 0.60.167.

## Open (mapped next, from the same log)
Per-**chunk** retry (not just per-phase), and gating/DAG at every **gate · level · step** — James: "should be able to retry
per chunk, not just phase. we should do the gating for the pipeline, dag on every gates, level, step?"
