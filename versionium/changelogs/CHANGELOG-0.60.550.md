# 0.60.550: every system answers its heartbeat while its node registry indexes at boot (RC2 expanded)

James, 2026-11-17: "yes fix the boot stall too" (after "it needs to build in order, bottom up. i am drowning. help me get this working").

The second half of the floor, after 0.60.549.

## Found (his log, 2026-11-17)
- Idearium was silent for 92 s at boot (07:20:45 → 07:22:00), and the watchdog took it OFFLINE.
- The line that ended it: "node registry: 0 indexed, 14309 unchanged".
- The cause: `lib/node-registry.js` `scan()` parsed and compared every node file in one synchronous loop, before its listener started.
- Every system starts its registry this way.

## Fixed
- `lib/node-registry.js`: one scan, two drivers (PF2's pattern):
  - `scan()` runs straight through (tests, and callers that need the result now);
  - `scanAsync()` runs in 25 ms slices, with the event loop's turn between them.
- `startForSystem` runs `startAsync`, which covers all nine systems: idearium, cortex, guardian, orchestrator, versionium, ollama,
  intelligence, clear-glass and loom.
- A system stopped while its registry is still scanning leaves no listener behind.

## Proof
- NR-13: same result as `scan()`, timers running while it indexes 800 nodes, and the sliced and straight scans agree.
- `test-node-registry-system` 13/13, `test-pipeline-root-causes` 19/19, `test-history-nodes` 5/5.

## Not yet (said)
- Not run on his machine. The proof there: no "missed its heartbeat" between boot and the "node registry:" line.
- The scan still takes as long in total. It just no longer holds the system hostage.
- Versionium: recorded on his machine by the boot sync.
