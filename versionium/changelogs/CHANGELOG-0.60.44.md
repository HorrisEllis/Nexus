# 0.60.44 — 2026-10-15

James: "Yes like gates can asses if dependacies are being met or if context is needed." · "yes that way the system always knows what its doing, and can replicate or reproduce it if lost from the maps, or snapshots"

## GA1: the gate checks before it spends

This is the first stage of the gate lifecycle (GL1), which James decided on: a skeleton up front, with each gate filled in just in time.

Before a brick calls an agent, its gate now runs two checks. Neither uses a model.

**1. Are its dependencies actually met?**
- "Met" used to mean the upstream brick's status said PASSED.
- Now the gate also checks that the exports the upstream brick was *seen* to have when it passed are still in its file. In review mode it reads the file as the build sees it, through the proposals.
- **If an export is gone:**
  - The upstream brick is reopened and runs again.
  - This brick waits. Its status is WAITING, and no agent call is spent.
- **No loops:** a dependency is reopened at most `retry_limit` times. After that, the waiting brick runs anyway and its own check decides.

**2. Does it need context?**
- If the brick's planned imports use names that none of its dependencies provide, its status is NEEDS_CONTEXT.
- The brick still runs, with its dependencies' actual code added to the brief, so the agent sees what it can really import.

Every verdict is recorded on the gate as `<id>.assessed`. Each one is also a tracked gate move (GT2), so it gets logged and appears on the Plan.

**Found before shipping:** an older test (EA-04) showed the first version reopening a brick three times on a guess.
- **Cause:** when nothing had been recorded about a dependency, the check fell back to the exports the *plan* promised.
- **Fix:** the gate now checks only what was recorded when the dependency passed, and otherwise says "not checked". A promise isn't evidence.

## Proof

- **test-gate-assess:** 5/5. Three of the five fail when assessment is switched off, so they prove the behaviour rather than just pass.
  - an export removed after its brick passed: the dependent brick waits, the dependency runs again, then the dependent runs once;
  - the reopening limit holds;
  - context needed: the brick is handed the missing names.
- **Suites unchanged (all passing):**

  | Suite | Result |
  |---|---|
  | contract-gates | 20/20 |
  | contract-adapters | 19/19 |
  | raid-runs-contract | 7/7 |
  | gate-versioning | 6/6 |
  | gate-tracking | 4/4 |
  | recursive-split | 5/5 |
  | contract-phase-build | 11/11 |
  | chunked-phase-build | 15/15 |
  | qa2-real-run | 5/5 (still 4 agent calls) |
  | hardening | 9/9 |
  | phases-tab | 5/5 |
  | contract-queue-hardening | 17/17 |

- **CT0** re-checked.

## Not done

There is no measured drop in agent calls yet. QA2's stub writes correct code, so nothing changes there. The saving will show when a real model leaves an export out, which needs a run on James's machine.
