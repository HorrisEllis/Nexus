# 0.60.42 — 2026-10-15

James: "then each gate tags and tracks progress through the system." · "like no progress lost, or history, the system knows whats happening"

## GT2: each gate tags and reports its progress

A gate move is settled when a gate passes, fails, splits, rewinds, is marked indivisible, or is blocked. Each settled move now carries its file, the agent, its failure class and the commit it passed at. RAID's runner records every settled move in four places at once:

- **On RAID's queue row:** the run's progress (how many of how many bricks have passed, how many moves, the last one). `progress(queueId)` reads it, and it survives a restart.
- **On the bus:** a `RAID_GATE_MOVED` event. Nothing listens to it yet; KT1 (observations per file) will be the first.
- **In the repo's activity log:** one row per move.
- **On the Plan's ledger:** one line per move, for example `▪ b2.b.js · lib/b.js — passed · 2/2 passed (100%) · at vtm-…`. The run's gate timeline is kept across reloads.

**Each passing gate is tagged in Versionium** on the commit it passed at, as `gate/<contract>~<run>/<gate>@<n>`. The tag never moves; a gate that passes again gets the next `@n`. The tag shows up in the audit and in `repo contract`, which also prints the run's progress.

**Tracking never fails a brick.** If a tag can't be written, the failure is reported once and the run goes on.

## Proof

- test-gate-tracking 4/4:
  - a passing run tags each pass on its commit and records progress, events and activity rows;
  - a failing brick's failure class and rewind are recorded as moves, and the brick is never tagged;
  - with Versionium down, the run still passes and the failure is reported exactly once (the test found it repeating; fixed);
  - the Idearium wiring is in place.
- Unchanged:
  - contract-adapters 19/19
  - contract-gates 20/20
  - raid-runs-contract 7/7
  - gate-versioning 6/6
  - recursive-split 5/5
  - contract-phase-build 11/11
  - chunked-phase-build 15/15
  - releases 5/5
  - check-catalogue 7/7
  - phases-tab 5/5
  - hardening 9/9
  - contract-queue-hardening 17/17
- CT0 re-checked: 2/2.

## Changed from the map (to confirm)

Tags are named per run (`~<run>`). Without that, building the same phase twice, or two maps' P1 in one repo, would collide with a tag that can't move.
