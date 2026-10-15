# 0.60.39 — 2026-10-15

James: "rewind engine and snapshots for each gate, comparing using the contract, for the gating what ever is needed, so much of this exists, just need this working"

## GS1: a snapshot per gate, rewind, compare

- **A snapshot at every pass.** Each brick that passes records the Versionium commit it passed at. You can see it on its checkpoint, in its evidence, in the audit and on the Plan.
- **Rewind before a retry.** When a brick fails after writing something, it's put back to its last good state before it's tried again. Its file is restored from the commit its gate last passed at, or from the build's own snapshot if it never passed. So a retry starts from known-good code, not from the failed attempt's half-written file.
  - In review mode nothing was written to disk, so the brick's pending proposals are set aside instead.
  - A transient failure, where nothing came back, isn't rewound.
- **Compare.** You can compare a gate now against what passed:
  - the contract's own reasons (STALE when an input changed);
  - the commit it passed at;
  - the Versionium diff of its files since then.

  Use `GET …/phases/contract?gate=<id>` or `idearium repo contract <repo> <phase> --gate <id>`.
- **Replay log.** Each brick's outcome is recorded on the replay engine's decision log, under its RAID run. That lets a rerun's divergence be named, and lets the reflection engine score it (FR1).

All of this is built on pieces that already existed: Versionium commits, restore-file, the work surface's proposals and the replay engine.

## Proof

- test-gate-versioning 6/6. A planted half-written file is gone when the retry starts, and the rewind is recorded with what it went back to.
- Unchanged:
  - contract-adapters 19/19
  - contract-gates 20/20
  - raid-runs-contract 7/7
  - contract-phase-build 11/11
  - chunked 15/15
  - hardening 9/9
  - repo-versions 6/6
  - repo-history 20/20
- CT0 re-checked after the evaluator changed: all 5 gates pass.

## Next

BR2: splitting recursively, up to a depth limit.
