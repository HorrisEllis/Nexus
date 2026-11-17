# 0.60.549: Idearium stays up through a full re-ingest (PF2 expanded)

James, 2026-11-17: "it needs to build in order, bottom up. i am drowning. help me get this working"

Bottom up: every step of the build pipeline calls Idearium, so Idearium staying up is the floor.

## Found (his log, 2026-11-17)
- 07:57:14: the nexus-self sync re-ingested `nexus/core`, all 5,396 files. The file set had changed, so PF5's in-place update stood aside.
- The ingest yielded while it read the files. Then `_ingestFinish` wrote all 5,396 `.chunk` nodes in one synchronous loop
  (07:57:17 → 07:57:31).
- Idearium missed its heartbeats ("silent 16s"), and at 07:57:39 the watchdog took it OFFLINE.
- Ruled out: the 17 s phase census already runs in a worker thread (0.60.489).

## Fixed
- `idearium/lib/chunk-nodes.js` `writeChunkNodesAsync`: the same node writes, yielding to the event loop every 50.
- `idearium/spec-engine/index.js`: the async ingest paths (`ingestFilesAsSpecAsync`, `updateIngestedSpecAsync`, which the nexus-self sync
  uses) leave the node pass to it. The sync paths are unchanged.

## Proof
- NI-007: 600 files ingested async. Every node is written by the yielding writer, with timers running between batches.
- NI-007 fails on the old code (there was no yielding writer).
- `test-nexus-self-incremental` 7/7.

## Not yet (said)
- Not run on his machine. The proof there: the next sync's log shows the node pass with no "missed its heartbeat" and no watchdog OFFLINE.
- Idearium's 92 s silence at boot (07:20:45 → 07:22:00, with its node registry checking 14,309 files) is a second stall, not fixed
  here. It is the next floor.
- Versionium: recorded on his machine by the boot sync.
