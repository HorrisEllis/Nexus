# 0.60.73 — 2026-10-16

James: "Option 1 (my recommendation): wrap each of those agent calls in WARP (its cache, then the axiom gate, then keeping
the result), while the build ladder and RAID still choose which agent runs."

His choice between the two designs put to him for WB1/WB2 of `docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec`.
It answers his ask from 2026-10-15: "make sure all builds use warp." Option 2 (let WARP's cascade pick the agent) was not
taken, so RAID stays the only chooser.

## What changed

- **`lib/warp-rung.js` (new).** `wrap(call, { kind, provider, key, mode, axioms, fresh })` runs WARP's `unifiedDispatch`
  around a call whose agent is already chosen: the exact cache, the axiom gate, then retention (promoted to the cache after
  3 passing results for the same input). One provider, one attempt; the ladder keeps its own retries and fallbacks.
- **The 5 paths that bypassed WARP now go through it:**

  | Path | Where | Mode |
  |---|---|---|
  | phase build | `idearium/api/index.js` `_phaseBuild` | gate |
  | phase planner | `_phaseBuild` (planned bricks) | cache, fresh on a re-plan |
  | proof repair | `_provePhase` | gate |
  | draft review | `_reviewDraft` | gate |
  | officiator synthesis | `cortex/core/raid/officiator.js` | cache, hard axiom `parses-as-contract` |
  | RAID worker brick | `cortex/core/raid/contract-intake.js` | cache, fresh on a retry |
- **`lib/build-paths.js` 1.1.0:** a call inside `WR.wrap(...)` on the same line counts as WARP. CK-255 is green on Nexus.

## Found while building (read in source)

- **A repo-agent build cannot be served from a cache.** Its work is the files its tools write and the injects that land
  inside `RA.dispatch`. Replaying the reply text would write nothing and report success. Those paths run in gate mode:
  WARP retains them (learns the gate class) and never serves them.
- **WARP's axiom gate had been empty on every build path.** No caller (expand, codegen, the spec-chunk build) passes it any
  axioms. The officiator's contract-parse check is the first real one. Which axioms a build should carry is a question for
  James; the repo charter's axioms are the candidate.
- **Two phasemaps did not load as YAML:**
  - `docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec`: an unquoted status containing ": ". It is now quoted.
  - `docs/2026-10-15-gate-held-work-phasemap.spec`: a plain-text addendum. Its lines are now `#` comments, with the text
    unchanged.

  BP-05 now covers both files.

## Proof

- `tests/modules/test-warp-rung.test.js` 7/7. Each case can fail:
  - a promotion that never serves;
  - a different agent sharing a key;
  - a fresh retry served from the cache;
  - gate mode serving a reply;
  - an axiom refusal that still counts;
  - a failure or throw altered on the way out;
  - a rejected crystal served again.
- `tests/modules/test-build-paths.test.js` 6/6. BP-03b shows that a direct call beside a wrapped one is still caught.
- Suites unchanged and green:
  - test-raid-officiator 15/15
  - test-intake 18/18
  - contract-intake dependency graph 6/6, tangible file 3/3
  - test-chunked-phase-build 16/16, test-contract-phase-build 11/11
  - test-draft-review 12/12
  - test-phase-proof 7/7, test-proof-run 7/7
  - test-lifeline-ollama-dispatch 3/3
  - test-check-catalogue 7/7
