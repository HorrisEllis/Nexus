# Gate quality checks — the test file gates the build, on SISO (2026-10-19)

James, 2026-10-19: "need quality checks per gate, using the test file and anything else we can. each chunk uses a dag?
the core foundation needs to be solid before t can build naything else. gate should use siso or warp logic"

## The problem, from a real run (looking-glass-bundle-v0.4)

Every brick gate in a live build passed with `0/0 linked tests run`. Mapped against the code (2026-10-19, two reads):

- **Per-brick gate** (`cortex/core/raid/contract-adapters.js:122`) passes on `<gid>.verified ^ok`, where `.verified` =
  `lib/phase-plan.js checkChunk` (export names present) + `lib/expectation-tests.js` (TF1: module loads, exports exist,
  arity). Structure, never behaviour. The phase's test file is pasted into the brief (`lib/test-first.js note()`) and
  **never executed** at the brick gate.
- **Per-phase gate** runs the test via proof-run conditions (`idearium/api/index.js:1724 _provePhase` → `idearium/repo/proof-run.js`),
  **but** the generated test-first condition is dropped whenever the map declares its own `conditions:`
  (`idearium/api/index.js:1726-1729` — `conditionsFromPhase` first, `generated` only `if (!conditions.length)`). A real bug.
- `0/0 linked tests run` is a *third* system (`lib/repo-inject.js:258` proposal-evidence), not a gate; 0/0 because a new
  file has no pre-existing test link in `lib/test-map.js`. Not the gate.

## Decisions (by his axioms — §8.6 reuse, the Cobalt Core is SISO, §1.2 nothing silent)

- **The gate runs on SISO, not warp.** warp (`warp/`, `idearium/spec-engine/warp-build-dispatch.js`) is the *generation*
  engine (crystallizer→population→cascade). A quality check is a gate; SISO (`siso/core/index.js`: Event→Gate→Stream) is
  the gate primitive. Decided by his axioms: a gate belongs on the gate atom.
- **Reuse the recorder, don't fork it.** `cortex/core/raid/contract-gates.js` already has a `{test}` condition kind and a
  `runTest` hook (`check`/`checkCondition`). The SISO quality-stream produces the verdict; contract-gates records it as the
  brick's `.verified` evidence. No second gate engine.
- **"Anything else we can" = every signal, each a gate in the stream:** the covering test file, TF1 shape, catalogue
  checks (`CK-nnn`, `lib/check-catalogue.js`), and lint/typecheck where the repo has them. A check that cannot run is
  **named residue** (SISO `pending[]`), never a silent pass.
- **Each chunk uses a DAG — at the gate, not only for ordering.** The per-brick DAG already exists (import edges →
  `depends_on` → `contract-gates _order`). The quality check runs a brick's test against the **upstream-applied overlay**
  built in that DAG order, so a brick is proven with its real dependencies present (the phase test stays holistic, at the
  phase gate). This is the coder's reading of "each chunk uses a dag?" — **to confirm**.

## Dependency graph (DG2) — assembled before building each phase, per his rule. New crossings designed out below.

## Phases (bottom-up; the foundation (GQ1) is solid before anything builds on it)

phases:

  GQ1_quality_stream:
    layer: foundation
    status: OPEN
    depends_on: []
    axioms: [§3.1, §1.1, §1.3, §0.3]
    blocks: ["quality_stream"]
    files: [lib/quality-stream.js]
    does: >-
      The SISO quality-gate primitive. A `check.requested` event for a unit (brick or phase) with its context
      (the files applied as an overlay, the covering test(s), the catalogue checks) fans out one gate per check kind
      (shape | test | catalogue | lint) onto a SISO stream (siso/core Event→Gate→Stream). Each gate emits a
      `check.result` with provenance (which check, pass/fail, the output); a check that cannot run is residue in
      pending[], named. Pure composition over runners that already exist (lib/expectation-tests.js TF1,
      contract-gates.checkCondition's {test}/{check} runners, lib/check-catalogue.js). No new runner, no side effects
      beyond emitting. This is the atom GQ2/GQ4 both use.
    proof: >-
      tests/gq1-quality-stream.test.js — a unit with one passing and one failing covering test yields the right two
      verdicts and names a check that could not run as residue; a signature collision is a hard error (SISO law).

  GQ2_brick_gate_runs_the_test:
    layer: library
    status: OPEN
    depends_on: [GQ1_quality_stream, GQ3_brick_tests]
    axioms: [§3.1, §8.6, §1.3, §12.1]
    blocks: ["brick_gate_quality"]
    files: [idearium/api/index.js, cortex/core/raid/contract-adapters.js]
    does: >-
      The per-brick gate requires behaviour, not only shape. verifyBrick (idearium/api/index.js:1394) runs the
      quality-stream (GQ1) for the brick — TF1 shape AND the test(s) covering this file (GQ3), against the overlay of
      this brick's upstream deps applied (the per-brick DAG order) — and `<gid>.verified` is `ok` only when every
      runnable check passed. The brick pass_when (contract-adapters.js:122) is unchanged in shape (still
      `{evidence:'<gid>.verified', match:'^ok'}`): the evidence simply now carries a real test result. No new system
      boundary: the quality-stream lives in lib/ (kernel), required by both idearium and cortex, so idearium→cortex is
      not newly crossed.
    proof: >-
      tests/gq2-brick-gate.test.js — a brick whose file passes its covering test passes the gate; a brick whose file
      loads and exports correctly but FAILS its covering test is held (the exact case the old shape-only gate let
      through), with the failing test named.

  GQ3_brick_tests:
    layer: library
    status: OPEN
    depends_on: [GQ1_quality_stream]
    axioms: [§3.1, §8.6, §1.1, §12.1]
    blocks: ["brick_tests"]
    files: [lib/brick-tests.js]
    does: >-
      Which test(s) cover a brick. Reuses lib/test-map.js (require/path/name links) plus the plan's own per-file test
      and the phase's test-first file, resolved against a proposal overlay (not only the committed tree, which is why
      test-map returns 0/0 for a fresh file today). Returns, for a brick, the covering tests and the subset of the
      phase test that exercises this file, so GQ2 runs what is real now, not the whole holistic phase test at brick 1.
    proof: >-
      tests/gq3-brick-tests.test.js — a fresh phase file with a test-first file that requires it links to that test
      (where test-map alone returns none); the phase's holistic test is attributed to the last brick, not the first.

  GQ4_phase_gate_keeps_the_test:
    layer: api
    status: OPEN
    depends_on: [GQ1_quality_stream]
    axioms: [§3.4, §1.1, §12.1, §17.5]
    blocks: ["phase_gate_quality"]
    files: [idearium/api/index.js]
    does: >-
      The phase gate always runs the test-first. Fix idearium/api/index.js:1726-1729 to MERGE the generated test-first
      condition with the map's own conditions instead of replacing it when the map has its own — so TF2's
      `node <testPath>` is never silently dropped. The holistic phase test runs through proof-run as today, plus the
      quality-stream verdict for the phase.
    proof: >-
      tests/gq4-phase-condition.test.js — a phasemap that declares its own conditions STILL runs the test-first
      condition (today it is dropped); a map with none is unchanged.

  GQ5_command:
    layer: cli
    status: OPEN
    depends_on: [GQ2_brick_gate_runs_the_test, GQ4_phase_gate_keeps_the_test]
    axioms: [§3.4, §1.1, §12.1]
    blocks: ["quality_command"]
    files: [idearium/cli/route-commands.js]
    does: >-
      A row in idearium/cli/route-commands.js (so copilot and every agent get it through nexus.command): read a gate's
      quality result — which checks ran, which passed, the residue — for a brick or phase.
    proof: >-
      tests/gq5-command.test.js — the command returns the per-check verdicts and residue for a built phase through the
      real route.

  GQ6_ui:
    layer: ui
    status: OPEN
    depends_on: [GQ5_command]
    axioms: [§3.4, §1.3, §12.1]
    blocks: ["quality_ui"]
    files: [idearium/ui/js/plan-panel.js]
    does: >-
      The Phases/Plan panel shows, per gate, the checks that ran and their verdicts (test ✓/✗, shape, catalogue, lint)
      and the residue — so a pass is legible as "behaviour proven", not just "a file arrived". Driven in Clear Glass.
    proof: >-
      a Clear Glass test (clear-glass/src/driver/glass.js, never Playwright) — a built phase's gate shows its test
      verdict and residue in the panel.

## Order of delivery (his rule): backend (GQ1→GQ3) → api gate (GQ2, GQ4) → command (GQ5) → UI (GQ6).
