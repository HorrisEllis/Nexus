# 0.41.0 — PF3: the store appends, never rewrites

James: "yes, lets improve the intelligence system. maybe make the schemas for the diagnostic system for the expectionn for each system. ehat do you thing look at the phases."

James: "whats up with the optimization? it seems almost worst?"

The idea and the direction are James's; the code is the coder's.

## Found
To save one row, every process read the whole table from disk (`event_log`: 333k rows), merged it into its own heap, and then rewrote all of it under a lock. Around 12 processes were doing this on every event. That one behaviour caused the CPU load, the heap growth (every process held every row) and the EPERM rename errors on Windows.

## Built: `guardian/jaa-store.js`
- **Append.** Each process appends its writes to its own segment, `<table>.<pid>.jsonl`. There is one writer per file, so there is no lock and no rename, and a write costs only the rows written.
- **Read.** A reader folds the base and the segments together. A running store reads only the new bytes.
- **Fold.** A segment past 4 MB is closed and folded into the base under the lock. The watermark `<table>.json.fold` keeps a newer write from being overridden by an older line.
- **Explicit flush.** `flushAll()` and `close()` leave the base file whole.
- **Escape hatch.** `JAA_APPEND=0` restores the old flush.
- **Tests.** test-pf3-append-store 4/4. `jaa-store-multiprocess` now reads through a store. `_purge-test-rows` also filters segments.

## Mapped: `docs/2026-10-07-system-expectations-phasemap.spec`
- **EX1.** Each system's `interaction-contract.json` gets an `expects` block for memory, loop, ticks, health, events, tables, restarts and depends.
- **EX2.** Vitals come from every process, preloaded by autopilot.
- **EX3.** The diagnostic compares vitals against the expectations. Silence counts as a reading.
- **EX4.** Intelligence learns each system's normal: declared vs learned, drift and tension.
- **EX5.** Time to breach.
- **Order:** PF4 → PF6 → EX1 → EX2 → EX3 → HL0 → EX4 → PF2 → HL1 → HL2 → EX5 + HL3 → PF5 → HL4.
