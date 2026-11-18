# 0.60.565: the gate asks Nexus before a model is asked

James, 2026-11-18: "Yes, gates first" (after "what ever gets us coding faster. smarter gates probably, that should help reduce load to the llm.")

IF3 slice a (docs/2026-11-15-the-factory-phasemap.spec, IF3_one_gate expanded_2026_11_18), mapped before code.

## Why (his runs of 2026-11-17/18, read, not guessed)
- His C: drive reached 0 GB: commands failed, COS restarted under it, and nothing in COS said so.
- deepseek-coder-v2:16b loaded left 3-5% RAM; COS then refused to start ollama-bridge, after the build had begun.
- Each of these spent agent calls, or a whole build, before failing.

## Built
- **In Emerge, `cos/pipeline/gate.eg`:** a `number` check. A value is read by its path (`a.b.c`) from an ask's answer or the step's own
  output and held to `atLeast` / `atMost`. A value that is not there is said ("no number at …"), or skipped when the check is `optional`.
  A type naming a number check without a path or a bound is refused, named.
- **`cos/pipeline/types/ready.gatetype`** (shipped): asks COS `GET /api/cos/usage`; free disk (`usage.host.disk.lowestFreeMB` ≥ minDiskMB,
  optional until his COS reports it) and free memory (`usage.host.freeMemPct` ≥ minFreeMemPct). Short of either, the run holds with the
  reason; Continue asks again; the same reason twice is a gap.
- **`cos/manager/usage.js`:** the host reading reports the disk: the drive of the temp folder and the drive Nexus runs from (`fs.statfsSync`,
  one call, no process); a drive it cannot read is said, never 0. Loaded at COS's manager's next start.
- **`idearium/pipelines/idearium-build.pipeline`:** a `room` step between graph and build, gated by `ready` (minDiskMB 2048, minFreeMemPct 8),
  holding on failure.

## Proof
eg test cos/pipeline/test/gate.test.eg: 10/10 (two new: number; ready). Live reading on his machine while this was written: C: 0 MB free,
D: 3,146,157 MB; COS's usage said free memory 4.1% — a build started then would have held at room, with that reason, before any agent call.

## Not proved
A build run through the pipeline holding at room on his machine (C: was full; nothing could run).
