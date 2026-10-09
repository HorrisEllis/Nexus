spec:
  meta:
    name:     runtime-load
    roadmap: 'later — performance — when it hurts (declutter 2026-10-09, James: "okay")'
    version:  1.4.0
    date:     2026-10-07
    release:  "PF1 0.40.1 (a fix: patch). PF2–PF5 each a phase."
    uuid:     nexus-runtime-load-phasemap-v1-0000-2026-1007-jamesbrooks-001
    owner:    "guardian/jaa-store.js + cortex/memory + intelligence/liminal-space + lib/resource-monitor.js + nexus/autopilot.js"
    status:   "PF1 BUILT (0.40.1). PF3 BUILT (0.41.0). PF4 BUILT (0.42.0). PF5 BUILT (0.43.0). The rest MAPPED — ordering with EX/HL in docs/2026-10-07-system-expectations-phasemap.spec."
    origin: >
      James, 2026-10-07, with his Windows run log: "whats up with the optimization? it seems almost worst? also
      liminal space with the velocity, like use that also?"

  # Read from his log (nexus@0.39.360 — older than 0.39.364's pressure hysteresis; pull first):
  grounded:
    stall:      "cortex offline 90–120 s every 5 min = cortex/boot.js startDecayTicker(5 min) → runDecaySweep → jaaDB.update(table,{id}) per expired row → guardian/jaa-store.js update() scanned every row each time: O(expired × rows) on event_log 333k. FIXED PF1."
    oom:        "~12 processes each load the shared JAA tables into their own heap (event_log 313k→333k, cfr_tension_history ~150k, component_ledger 302k→337k); orchestrator and copilot hit the ~1 GB heap, 6 crashes in 5 min, breaker tripped."
    eperm:      "many processes flush data/cortex/memory/event_log.json — Windows rename EPERM / flush-lock contention (multi-writer on one file)."
    growth:     "the compactor removes ~2000 rows / 10 min; the tables grow faster than that."
    relay:      "'relay to intelligence failing timeout' — intelligence starved by the above."
    velocity:   "intelligence/liminal-space L2/L4 velocity: +0.08..+0.15 per patch/drift/friction event, −0.05/min decay → pinned at runaway, warned on every event, consumed by nothing."

  phases:
    PF1_the_stall:
      status: "DONE 0.40.1"
      built:  "jaa-store update() by id = one map get (the row is the key). Liminal runaway said on crossing only."
      proof:  "tests/modules/test-pf1-stalls.test.js 3/3 (5,000 updates by id in a 200k table < 2 s; other wheres unchanged; runaway once)."
    PF2_velocity_steers_the_governor:
      idea: >
        Velocity is the earliest signal the system is processing faster than it can integrate — it rises BEFORE
        memory does. Use it: liminal emits velocity (on crossing and on the minute tick) over the bus; lib/resource-monitor
        takes it as a third input next to free memory and heap. Runaway (≥0.8) holds the level at 'pressure' (background
        work deferred: compaction, decay, sweeps, synthesis jobs; foreground never). Calm (<0.5, held confirmSamples) releases.
        One signal, existing governor, no new loop. Velocity also falls when jobs complete — so throttling lets synthesis
        catch up, which lowers velocity: a closed loop, stable by construction (hysteresis 0.8 up / 0.5 down).
      proof:  "a burst of forge.patch.proposed → governor 'pressure' with reason 'velocity'; job completions → back to ok; no flapping."
    PF3_append_not_rewrite:
      found: >-
        guardian/jaa-store.js _flush(table): to save ONE new row, a process takes the flush lock, reads and JSON.parses
        the whole table from disk (event_log 333k rows), merges it into its own heap, then JSON.stringifies and rewrites
        all of it (tmp + rename). Twelve processes doing that for every event = the CPU, the heap growth (every process
        ends up holding every row — the OOM) and the EPERM rename races. The 0.39.266 multi-process fix made it correct
        and O(table) per write: "the optimization seems worse" is mostly this.
      idea: >-
        Append, never rewrite: each process appends its writes as JSONL lines to its OWN segment
        (<table>.<pid>.jsonl — one writer per file, so no lock and no EPERM, O(row) per write). A reader folds base +
        segments (last write per id wins, causedBy kept). ONE owner (cortex) folds segments into the base on its quiet
        tick. Reuse: cortex/memory/jaa-db.js already has an _append JSONL path — one store shape, not a third.
      status: "DONE 0.41.0"
      built: "guardian/jaa-store.js _append/_tailRead/_rotate/_fold + the <table>.json.fold watermark; JAA_APPEND=0 the old flush (guardian.spec ADDENDUM 2026-10-07)."
      proof: "tests/modules/test-pf3-append-store.test.js 4/4 — six processes × 300 rows with segments folding mid-run (all 1800 once, no EPERM); a later write survives a fold under an older open line (fails without the watermark); another process's insert+delete reach a running store by tail; one row into 100k rows costs the row"
    PF4_hold_only_what_you_read:
      idea: "after PF3 a process loads a table lazily and only its tail (a window by ts) unless it asks for history — the heap stops scaling with the table. Ends the 12× copies."
      status: "DONE 0.42.0 (load on first read; the tail window moves to PF5)"
      built: "guardian/jaa-store.js _writable/_loaded: no load at boot or for a write; a write-only table's buffer empties as it flushes. JAA_LAZY=0 preloads."
      proof: "test-pf3-append-store PF-08 (a writer of a 100k-row table holds 0 of its rows; JAA_LAZY=0 holds 100k+), PF-09 (first read keeps unflushed local writes)"
      still_loading: "readers of event_log: copilot grammar-router (tail 5000), nexus/autopilot (tail), intelligence (5 modules), lib/movement (query 100000), lib/component-ledger (tail 99999) — tail(n) served from the newest segments without the base is PF5's, with the cap that makes the base small."
    PF5_bounded_tables:
      idea: >-
        event_log and ledgers rolled into archives past a cap (nothing lost: archived, not deleted); compaction sized to
        inflow, not a fixed 2000. The decay sweep walks a cursor slice per tick (bounded), and expiry is read-time
        (cortex/memory/decay.js isExpired, already built) — the sweep only reclaims space.
      status: "DONE 0.43.0 (caps + archive; the decay cursor slice is unnecessary once tables are capped)"
      built: "cortex/memory/table-compactor.js CAPS/capFor/capRows/archiveRows/readArchive; compactTable archives before it deletes; start() caps each sweep. Archive: <store>/archive/<table>/<day>.jsonl.gz, one gzip member per batch."
      proof: "tests/modules/test-pf5-bounded-tables.test.js 4/4 — 1200 rows capped to the newest 1000 and the 200 read back; two passes one readable archive; an unwritable archive deletes nothing; caps and the env override"
    PF6_slow_ticks_name_themselves:
      idea: >-
        One wrapper, lib/tick.js every(name, ms, fn): times each run of every background ticker and keeps an event-loop
        delay histogram (perf_hooks.monitorEventLoopDelay) per process. A run over budget is a row 'tick.slow' naming the
        ticker, its ms and the loop delay — the decay stall would have named itself in one cycle instead of a log full of
        "cortex offline". Feeds the heal ladder (heal-nodes map HL0) and PF2 (a slow tick = pressure).

  ordering: "PF1 → PF3 → PF4 → PF6 → PF2 → PF5 (PF3 is the biggest single win: the store itself)"
