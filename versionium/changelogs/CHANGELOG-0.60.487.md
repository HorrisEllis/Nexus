# 0.60.487 — the nexus-self snapshot yields and pauses (PF3 expanded)

James, 2026-11-10: "idearium is choking" · "Yes, fix it"

## What his log showed
`[idearium/nexus-self] sync took 147253ms — snapshot 85632ms · systems 58810ms · … tree 12646 files, 12646 re-hashed`, while the
Orchestrator counted 9 missed pulses from Idearium and its CFR coherence fell to 0.17.

## The cause
- The store at `idearium/data/nexus-self` was new (its HEAD holds one snapshot, made that night), so no hash was reused.
- `snapshot()` in `lib/nexus-self/store.js` read, hashed and copied all 12,646 files (122 MB) in one synchronous loop. Nothing else in
  Idearium ran for 85 s, its heartbeat included.
- The memory guard was asked before the sync and between systems, never inside the snapshot.

## Built
- The loop is steps with two drivers, one code path (the pattern of PF2's ingest):
  - `snapshot()` runs every step; tests, apply and the update backup use it, unchanged.
  - `snapshotAsync(opts, { sliceMs, shouldPause })` gives the event loop a turn every 40 ms and asks the guard at each turn.
- Stopped by the guard: the files hashed so far stay in `index.json`, no snapshot is written, the sync logs
  `snapshot paused after N file(s) — <why>` and ends. The next round reuses what was hashed.
- `idearium/repo/nexus-self.js` `sync()` uses the yielding one.

## Proof
- `tests/modules/test-nexus-self-incremental.test.js` NI-006, 6/6: the same hash as the blocking snapshot; timers run while it hashes;
  a pause writes no snapshot and the second pass reuses exactly what the first hashed; a sync under a standing pause syncs nothing and says why.
- test-nexus-self-visible 4/4, test-versionium-everywhere 7/7, test-nexus-self-and-cos-run 29/30.
- One failed run before the pass: the test expected a 4-file tree to pause inside the snapshot. It finishes inside one slice, and the
  guard between systems stops it. The test was wrong, not the code.

## Not done, said
- Not measured on his real tree. The number that matters (pulses missed during a first sync) is his next boot's to show.
- `walkLive` (the directory walk before the loop) still blocks: 4.2 s measured on his tree under load.
- Found and left: the Orchestrator's pulse monitor counts an on-demand system that is asleep by design (0.60.482) as missing: Versionium,
  112 pulses, CFR to 0.00. DP-004 fails on `lib/vector-memory.js`, which is unchanged from the last commit.
- `lib/nexus-self/store.js` serves Idearium from `lib/` (§5.15); not moved in this release.
- This release is not yet in Versionium: it is recorded at the next boot sync on his machine (§17.12).
