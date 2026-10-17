# 0.60.141 — 2026-10-17

James: "needs to build a test first then use that to shape expectation and conditions."

He said it after the deps gate (0.60.125) and after reading the proposal Gemini left for PC1, which was a file that did not
load. It is TF2, recorded in `docs/2026-10-17-pieces-not-order-phasemap.spec` addendum (c2). It is also PE6 of
`docs/2026-10-16-proposal-evidence-phasemap.spec`, which had been mapped and never built.

## Before

Before this release, a phase's code was held to two things:
- TF1's structural checks: the file loads and its planned exports exist.
- The planner's conditions, written in words.

Nothing said what the code must *do* before the code was written.

## Now: the test is written first, and it shapes the build

1. **Written first, by the planner.** The test writer is the planner, never the coder that implements it, so the test does
   not come from the same assumptions as the code. It gets the phase (what it does, its proof) and the planned files with
   their signatures. It writes one plain `node` test with `node:assert`, concrete inputs and the exact outputs expected.
2. **Seen failing first.** The test is run with no implementation, in a shadow copy of the repo; nothing is written to the
   repo. It must fail because the behaviour is missing: the planned module is not there, an export is missing, or an
   assertion fails. It must never fail because of itself.
   - These are refused: a test that does not parse, uses a name it never defined, or requires something that is neither
     planned nor present.
   - A test that already passes is also refused, because it proves nothing.
   - The writer is asked once more, with the reason.
3. **It shapes the plan.**
   - If the test calls a name the plan lacks, that name joins that file's exports. The test is the authority.
   - Running the test is the phase's first condition, so the phase is proven by it.
   - The coder is never asked to write the test.
   - Every code brief carries the test's text.
4. **It is seen.**
   - It lands as a proposal like any agent's file.
   - The Plan shows it as the phase's first piece.
   - Every step is in the run log (test-first: writing, invalid, shaped, refused).

`routing.test_first` sets what happens when no usable test comes:

| Setting | Effect |
|---|---|
| `require` (default) | The phase is not built, and the run says why. |
| `prefer` | The phase is built anyway, and the run says so. |
| `off` | Test-first is skipped. |

The setting is in Settings → Routing. Agents set it with `system routing test_first …`. The routing switches had no
command row before; now they all do. When no planner is ready, the step is skipped, said, and TF1's expectations still
hold.

## Found and fixed on the way

- **Fake `js` export:** `usesOf` read `notes.js` inside `require('../lib/notes.js')` as a call to `notes.js()` and added a
  `js` export. String literals are now blanked before the scan.
- **Arity check:** an export the test adds gets the signature `(...args)`. TF1 checks an upper bound on the argument count,
  so a made-up count would have refused a correct two-argument function.
- **Unknown config key:** `routing.test_first` was refused as an unknown config key until it was declared in
  `idearium/lib/config-core.cjs`.

## Proof

`tests/modules/test-test-first.test.js` passes 5/5. It ran stably three times in a row.
- TF-01: the pure functions.
- TF-02: validation for real, in a shadow copy.
- TF-03: end to end on the real route, the real repo, the real proposals and the real proof run, with only the model
  stubbed.
  - The planner wrote the test first, and it was seen failing.
  - The test called `list()`, which the plan lacked, so `list()` was added.
  - The coder never wrote the test, and every code brief carried it.
  - The phase was proven by the test, and the Plan shows it as the first piece.
- TF-04: two unusable tests stop the build.
- TF-05: the setting works for a person and for an agent.

Neighbouring suites:

| Suite | Result |
|---|---|
| test-contract-phase-build | 14/14 |
| test-qa2-real-run | 5/5 |
| test-plan-pieces | 4/4 |
| test-pipeline-routing | 19/19 |
| test-code-tab | 16/16 |
| test-mcof-config-gate | 14/14 |
| test-phase-deps-gate | 3/3 |
| test-agent-record | 33/35 |

- test-contract-phase-build and test-qa2-real-run test the build without TF2, so they set `routing.test_first: off`.
- test-phase-deps-gate's check on the real map was updated: PC1 now waits only on PC0c, because PC0b was decided by his
  axioms in 0.60.135.
- test-agent-record's AR-41 and AR-42 fail on main too.

## Limits

- The test is only as good as its writer. Per PE6, the writer never declares its own test sufficient, and James sees it as
  a proposal.
- This slice writes one test file per phase.
