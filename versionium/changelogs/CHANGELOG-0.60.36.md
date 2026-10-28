# 0.60.36 — 2026-10-15

James, 2026-08-28: "we have all contracts, whether its from loom, idearium, co-pilot, self-heal go to raid's input folder, and queue, then through raid" · 2026-10-15: "look at the contracts also and raid. i feel something happened"

## RD0: RAID runs the `.contract`

The `.contract` bricks used to run beside RAID's contract queue, never through it. Now RAID runs them (`cortex/core/raid/contract-intake.js` `runContract`). A run goes like this:

1. **A row in RAID's queue.** Every contract run is listed in RAID's queue, marked as a `.contract` row with its file and how many bricks it has.
2. **RAID's gates go first.**
   - The agent's intent contract is checked.
   - Then RAID's own approval: the constitution, then the submitting source's RAID contract, which must allow `build`.

   A refusal blocks the contract, and nothing runs. Idearium, copilot and the CLI may build. Guardian and the orchestrator may not.
3. **The bricks run** through the contract scheduler, using the submitting system's own agents. Splits, checkpoints and failure classes all apply as before.
4. **The verdict comes from the contract.** It passes only when the contract's own completion check passes.
5. **On failure, self-heal is asked to help**, with each failed brick and why it failed (its failure class, e.g. "capability").

Also new:

- **`submitV2`** puts a `.contract` in RAID's queue. `processNext` runs it with the agents its source has registered (`registerExecutors`). If none are registered, the contract is set aside and the reason is recorded.
- **`legacyToV2`** turns an old-style contract into a one-brick `.contract`, so nothing is lost.

## Found by the test

A queued contract didn't remember which folder its file paths are relative to, so RAID would have run it against Nexus's own tree. The queue row now carries that folder.

## Proof

- test-raid-runs-contract 5/5: a contract passes through RAID; a source that isn't allowed to build is blocked and nothing runs; a failure names its bricks and their failure classes and asks self-heal; the queue sets a contract aside until its agents are registered, then runs it; a legacy contract runs.
- RAID's existing suites still pass:
  - intake graph 6/6
  - tangible file 3/3
  - repo provision 5/5
  - retry-escalation 9/9
  - AM1 gate 4/4
  - officiator 15/15
  - router 10/10

## Next

RD1: every build goes through RAID. Phase builds and spec-chunk builds call `runContract` instead of running the scheduler themselves.
