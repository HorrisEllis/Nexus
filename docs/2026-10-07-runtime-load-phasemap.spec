spec:
  meta:
    name:     runtime-load
    version:  1.0.0
    date:     2026-10-07
    release:  "PF1 0.40.1 (a fix: patch). PF2–PF5 each a phase."
    uuid:     nexus-runtime-load-phasemap-v1-0000-2026-1007-jamesbrooks-001
    owner:    "guardian/jaa-store.js + cortex/memory + intelligence/liminal-space + lib/resource-monitor.js + nexus/autopilot.js"
    status:   "PF1 BUILT (0.40.1). PF2–PF5 MAPPED."
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
    PF3_one_owner_per_table:
      idea: "a shared table (event_log, component_ledger, cfr_tension_history) is held in ONE process (cortex); the others append through it or read a bounded tail. Ends the 12× heap copies — the OOM."
    PF4_one_writer_per_file:
      idea: "follows PF3: the owner is the only flusher of its JSON, so no EPERM rename races on Windows."
    PF5_bounded_tables:
      idea: "event_log and ledgers rolled into the node store / archives past a cap (nothing lost: archived, not deleted); compaction sized to inflow, not a fixed 2000."

  ordering: "PF1 → PF2 → PF3 → PF4 → PF5 (PF3 is the big one: confirm with James before it)"
