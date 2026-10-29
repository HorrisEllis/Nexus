# 0.39.363 — 2026-10-07

James: "im saying to add that to cos. the conditions. like the intent of compartment is the end state."

A COS compartment had a **purpose**, in words, never checked. It also had work phases EXPLORING → ACTING → VERIFYING, where VERIFYING was "checking ACTING's real result", against nothing defined. A compartment now has an **intent**, and the intent is its end state. COS owns the definition, in `cos/foundation/intent.js`. Idearium's `charter.spec` is now simply a repo's compartment intent, parsed by COS.

## A compartment's intent
| Part | Meaning | How it's used |
|---|---|---|
| **purpose** | what the compartment is, in words | unchanged |
| **end state** | the intent: what is true when the purpose is achieved, each with a check | VERIFYING checks it; `cos verify` checks it |
| **conditions** | what must always hold on the way | checked alongside the end state; a broken one means "not ok", even when the end state is reached |
| **axioms** | how it chooses between ways that are all within the conditions (at most 5, as for kernel compartments) | given to whatever acts inside it (`brief()`) |

- **Checks** are `file` (exists and is not empty, because an empty placeholder proves nothing), `command` or `tests`. Command and test checks run in the compartment's own root.
- **An intent that says nothing, or can't be checked, is refused whole,** with the reason, and nothing is created.

## Nesting
- **A child holds everything its parent holds.** Its conditions and axioms are the parent's, marked "from <parent>", followed by its own.
- **A child can add, never drop.**
- **Its end state is its own:** a child serves part of the parent's intent.

## Where it lives in COS
- **At birth.** `cos create` asks "End state — what is true when this is done?" and "How is that checked?". It also takes `--intent=<intent.spec>`. `createCompartment(host, { …, intent })` passes it through `CreateCompartmentGate`.
- **Later.** `cos intent <name> [--file=…]` shows or sets it (`SetIntentGate`, `host:compartment:intent-set`).
- **Checked.** `cos verify <name>` (`VerifyCompartmentGate`, `host:compartment:verified`). It exits 0 when every condition holds, 2 when one is broken, and 3 when there's no intent. **Moving to VERIFYING runs the same check.**
- **The last check is kept on the compartment** (`intentStatus`).
- **Display.** `cos status` has an Intent section: end state ✓/✗, conditions (inherited ones marked), axioms. `cos map` shows "2/3 of its end state".

## Idearium
- `lib/charter.js` parses through `cos/foundation/intent.js`, with Idearium's extra `page` check kind. One definition, the same refusals.
- Declared the two charter events from 0.39.362 that were never added to Idearium's event list: `idearium.repo.charter.set` and `idearium.repo.charter.checked`.
- `test-phase-proof` PP-06 follows the build chain's new shape: a chunked run skips the draft review.

## Proof
- **COS's own suite:** 8 new intent tests pass. In total, 164 of 165 pass. The one failure, "Stream: stamped event has seq + timestamp", was failing before this change.
- **Fixed:**
  - `test-event-contracts` 8/8: the charter events are now declared;
  - `test-phase-proof` 7/7.
- **Unchanged and passing:**

| Suite | Result |
|---|---|
| test-chunked-phase-build | 14/14 |
| test-cos-workspace | 17/17 |
| test-genesis-and-architecture-spec | 7/7 |

## The full test sweep
- **Method.** Every suite in `tests/modules` was run (539). Each one that failed was re-run on its own, both on this code and on the code from before this session (362dbdf).
- **Fixed: two regressions this session caused.** Both passed before and failed after:
  - `test-nexstore-writers`: the charter's table `idearium_charter_runs` wasn't declared in `docs/nexstore-writers.yaml`. Now declared.
  - `test-registry-harness` RH-006: listing `work_surface` with its guide note pushed a repo agent's first message to 3,185 characters, over its 3,000 budget for small models. The tool is now named on the "Also:" line ("work_surface (see + prove your changes)"), in place of `code_changes`, which it mostly covers. It's still given to every repo agent, and the message is back under budget.
- **33 suites fail the same way before and after this session.** They are pre-existing, and none is touched by this work. Among them:
  - admin-server-routes, brainos-*, copilot, healer;
  - spec-import, spec-promote;
  - test-tablet-*, test-guardian-cfr-consolidation, test-node-schemas, ui-self-diagnosis.

  A few of these were false alarms from my own filter: suites that pass but have "✗" in a test name.
- **Clean-up.** Some suites write runtime data into the repo (ledger rows, a node index, a resonance crystal) and one deletes `data/vector-index/index.json`. Those were restored and never committed.

## Not yet
- **Idearium repos aren't COS host compartments,** so a repo's charter and a `cos create` compartment are the same shape but stored separately. Linking a repo to its COS compartment is next.
- **The kernel's cognitive compartments** (`cos/kernel.js`, C = (A, K, S, X)) still have axioms and sensed conditions but no end state. Their "conditions" are facts they observe, not rules that must hold. The naming overlap is noted, not resolved.
