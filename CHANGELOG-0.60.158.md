# 0.60.158 — 2026-10-18

James: "Need to get the gates solid."

Bottom up: the gate machinery itself first, then every test that holds a gate.

## The gate machinery: six holes, each proven on the code, then closed

`cortex/core/raid/contract-gates.js` is the executable `.contract` of CT0. Each hole was demonstrated against the real code
before it was fixed.

### False completes (a contract read done when it was not)

| | The hole | Now |
|---|---|---|
| H1 | An outcome condition that was not `{ gate }` was never looked at. A contract whose `done_when` named a missing file read complete. | Every outcome condition is checked. |
| H2 | A gate whose required file was deleted after it passed stayed PASSED. Only a changed hash made it STALE. | A ref gone since the pass makes the gate STALE. |
| H6 | An invariant stayed "verified" once its gate had passed, even after that gate went stale. | An invariant is only as verified as its check is now. |

### Conditions that could never pass

| | The hole | Now |
|---|---|---|
| H3 | An invariant checked by a file or by evidence. Only a gate check ever set "verified". | Files and evidence are read directly. |
| H4 | `{ check: CK-006 }` or `{ check: CK-008 }`. This file kept its own list of the import checks, three of the five. | The list is the catalogue's. |

### A throw

| | The hole | Now |
|---|---|---|
| H5 | A `match` that is not a regex threw out of `check()`. | It is unverifiable, and says why. |

### The mechanism

- **`holds(cond)`** answers whether a condition holds now, without running anything:
  - a gate, by its current status;
  - a file or a piece of evidence, read directly;
  - a test or a catalogue check, as **`verifyOutcome()`** last ran it. Those are work, so completion does not run them itself.
- **`completion()`** asks `holds()` of every invariant and every outcome condition.

**Proof:**
- `tests/modules/test-gates-solid.test.js` 7/7: one case per hole, plus a failing outcome test keeping a contract incomplete.
- `test-contract-gates` 20/20, unchanged.

## Every gate-related test, run alone

51 files touch the gates: contract-gates, gate-context, the contract ledger, run-state, the dependency and phase graphs, the
catalogue, contract intake and trace, WARP, and the build. Run one at a time, not under load, seven were red. Each is fixed at its
cause:

| Test | Cause | Fix |
|---|---|---|
| QA-01 | The coder's 0.60.157 added four runners and did not update the pin | The pin lists all eleven |
| GA-05 | The dispatch signature grew a `feedback` parameter (0.60.105); the pin matched the old text exactly | It matches on the gate and its assessment |
| RS-55 | Since 0.60.146 a build with no brick names its gate | The pin follows; the brick is passed as before |
| PS-04 | Clear Glass's engine keeps a `file://` page's localStorage across runs, and Idearium restores the drawer's view and the bottom panel from it at load, before the test's clear | The test resets what the page had already restored, so it really is a fresh page |
| RE-07 | The node registry keeps its ledger (`_ledger.jsonl`) in the provider folder, and the test read it as a node | The test reads `.provider` files, as `guardian/lib/agent-facts.js` already did |
| GL (gig ledger) | Red only under load | Passes alone; nothing to fix |
| NS-003 / NS-012 | Known gaps, already listed in `tests/known-gaps.yaml` | None |

## Two more fixes the re-run found

- **CT0 re-proved itself.** CT0's own contract (`docs/contracts/ct0-executable-contracts.contract`) records the hash of
  `contract-gates.js`, so changing the evaluator made its gates STALE. That is invalidation working. It was re-run through its
  own pipeline: each of its five gates was checked by the evaluator against the files as they are now, and saved. All five
  passed, and its invariants and outcome conditions hold under the stricter rules. `test-contract-ct0-self` 2/2.
- **Clear Glass's host now gives each launch its own profile.** `glass-host/main.js` never set Electron's userData, so every
  launch shared one default profile, localStorage included. One test's page state reached the next. That is why PS-04 and
  `test-code-tab-merge` passed or failed depending on which test ran before them.
  - Each launch now gets a fresh temp folder (`GLASS_PROFILE`), removed when the host exits, the same as the Chromium path
    already did.
  - Proof: both tests pass across three alternating runs, with no profile left behind.
  - The PS-04 reset is kept as a guard.

## Open

- **Clear Glass UI tests red on main too, before and after this release:**
  - `test-cg-settings-ui-files` (3 failing)
  - `test-template-picker` (1)
  - `clear-glass-library-ui` (1)
  - `test-cg-accounts-portal-settings` (2)
  - `test-accounts-picker-cos` (4)
  - `test-repo-settings-ui` (4)

  These are layer 0's next batch.

- **The full suite:** the 61 unknown failures measured in 0.60.157 that are outside the gate tests (the census's layer 0).
- **Loom:** the 619 wires with undeclared endpoints, and the 470 records that change on every rebuild.
