# 0.42.0 — PF4: hold only what you read

James: "yes. can we use the rewind engine on ollama? like record ollamas process as a macro?"

The idea and the direction are James's; the code is the coder's.

## Built: `guardian/jaa-store.js`
- **Load on first read.** Since PF3 (append-only writes), a write needs none of the table's existing rows. So no table loads at boot or for a write; a table loads only when the process first reads it.
- **Write-only tables.** A table that a process only writes holds just that process's rows not yet saved to disk, and those leave memory once saved. Every system writes `event_log`, and the writers no longer hold its 333k rows.
- **First read.** The first read loads the table from disk, keeping this process's unsaved writes over the disk's older rows.
- **Still loading.** Readers of `event_log` still load it on first read: copilot grammar-router, autopilot, intelligence and `lib/movement`. PF5 adds the table limit and makes "last N rows" cheap.
- **Escape hatch.** `JAA_LAZY=0` preloads every table as before.
- **Tests.** test-pf3-append-store 6/6.
  - PF-08: a process writing to a 100k-row table holds 0 of its rows; with `JAA_LAZY=0` it holds 100k+.
  - PF-09: the first read keeps this process's unsaved writes.

## Mapped: `docs/2026-10-07-ollama-recorder-phasemap.spec`
- **OR1, one door.** Every call to Ollama goes through `ollama-client`. Today cortex, idearium, loom and guardian still call it directly.
- **OR2, every call a frame.** Each call records the model digest, a seed (always set, so the call can be replayed), the prompt and answer stored once each, and timings.
- **OR3, the cassette.** A recorded run is replayed with the recorded answers instead of Ollama: the same code reruns exactly, with no GPU, and failure macros carry the frames.
- **OR4, live and what-if.** `idearium ollama replay <run> [--live | --model | --num-ctx]` reruns against the model and diffs each answer.
- **OR5, model vitals.** Load time, tokens/s and context use, compared against the expectations.
