spec:
  meta:
    name:     system-expectations
    version:  1.0.0
    date:     2026-10-07
    release:  "each phase its own minor"
    uuid:     nexus-system-expectations-phasemap-v1-0000-2026-1007-jamesbrooks-001
    owner:    "diagnostic + intelligence + nexus/autopilot.js — every system's interaction-contract.json"
    status:   "MAPPED. Nothing built."
    origin: >
      James, 2026-10-07: "yes, lets improve the intelligence system. maybe make the schemas for the diagnostic system for
      the expectionn for each system. ehat do you thing look at the phases."
    with: "docs/2026-10-07-runtime-load-phasemap.spec (PF), docs/2026-10-07-heal-nodes-phasemap.spec (HL)"

  grounded:
    contracts: "<system>/interaction-contract.json for all 17 systems — id, ports, role, health, routes. What a system ANSWERS; nothing on how it should BEHAVE (memory, loop, ticks, event rates, tables, restarts)."
    schemas:   "lib/node-schemas/schema.* — 63 node schemas (health, failure_mode, debug_macro, contract, sigma_record …); no expectation"
    baseline:  "intelligence/baseline.js BaselineMonitor — learns a kernel's normal from its first N events (latency, error rate), scores deviation in sigma, opens ONE gap per deviation, slope(). Two axes only, and fed by nothing about memory, the loop, ticks or tables."
    check:     "lib/system-check.js — boot check of each system's layers (presence, not behaviour)"
    supervisor: "nexus/autopilot.js spawns every system's process — one place every process passes through"
    gap: >-
      Nothing says what each system is EXPECTED to be like when well, so nothing can say it is not. The 0.39.360 run:
      copilot at 1 GB heap, cortex's loop blocked 94 s, event_log at 333k rows and climbing — every one a fact no
      system was told was wrong. The diagnostic finds broken wires; it cannot find a system that is slowly getting sick.

  decided:
    one_place: "the expectation lives IN each system's interaction-contract.json as an `expects` block — the contract says what a system answers AND how it behaves; no second file per system. Its shape is schema.expectation (lib/node-schemas)."
    declared_and_learned: >-
      Each axis has two values: DECLARED (the contract — the spec's word) and LEARNED (intelligence's measured normal,
      baseline.js generalised). A reading outside the declared bound is a violation (diagnostic). A reading outside
      the learned band but inside the declared is drift (intelligence: an early sign). Learned and declared far apart
      for long is tension — either the spec is wrong or the system is; intelligence proposes, the person decides.
    silence_is_a_reading: "an event a system is expected to emit, not seen within its window, is a violation like any other — a system that stopped talking is the one most likely to be sick."
    no_new_loop: "one sampler preloaded into every process by autopilot (node --require), not edits to 17 systems; the diagnostic and baseline already run — they get new axes, not new organs."

  schema_expectation: |
    expects:
      memory:   { heap_mb: 400, rss_mb: 600 }                 # declared bounds
      loop:     { p99_delay_ms: 200 }                         # event-loop delay (perf_hooks)
      ticks:    { decay.sweep: { every_ms: 300000, budget_ms: 2000 } }   # PF6 names them
      health:   { p95_ms: 250 }
      events:   { emits: { cortex.heartbeat: { at_least_per: 60000 } }, silence_ms: 300000 }
      tables:   { owns: { event_log: { cap_rows: 100000 } } }  # PF5 caps
      restarts: { max_per_hour: 2 }
      depends:  [ guardian ]                                  # who must be up first (system-check order)
    learned (written by intelligence, never by hand):
      <axis>: { mean, sigma, slope, n, since }

  phases:
    EX1_the_expectation_schema:
      does: "lib/node-schemas/schema.expectation; an `expects` block in all 17 interaction-contract.json, first values seeded from the readings of a healthy run (said as seeded, not as decided); lib/route-contract-check reads it so a malformed block fails the existing contract check."
      proof: "every contract has an expects block that validates; a bad one fails the check naming the axis"
    EX2_vitals_from_every_process:
      does: "lib/vitals.js preloaded by autopilot into every child (--require): heap, rss, loop p99 (monitorEventLoopDelay), PF6 tick timings, event counts — one row per process per minute to the parent over IPC (no store writes, no new tables); autopilot keeps a ring per system. `idearium vitals` (a CM1 row: copilot has it)."
      proof: "a supervised throwaway process's vitals arrive each minute; a busy-looped one shows its loop p99"
    EX3_the_diagnostic_reads_expectations:
      does: "vitals vs declared → violation findings (axis, expected, observed, since) on the existing diagnostic path; silence detected; each violation that holds becomes a .failure_mode (heal-nodes HL0) with the vitals ring attached as its evidence."
      proof: "a process over its heap bound → one violation, then a failure_mode; recovered → closed; a silent emitter → violation"
    EX4_intelligence_learns_the_normal:
      does: "baseline.js BaselineMonitor generalised from latency/error to every vitals axis per system (same sigma, same one-gap-per-deviation rule); drift findings; learned vs declared tension written to cfr_tension_history (existing); a long tension → a proposal to change the expectation (the person accepts)."
      proof: "a fixture system's learned band forms from its vitals; a slow climb inside the bound is drift before it is a violation"
    EX5_time_to_breach:
      does: "slope() on each axis → 'heap reaches its bound in ~40 min', 'event_log reaches its cap in ~3 h' — the forecast feeds PF2 (the governor slows background work early) and HL3 (the heal pre-staged)."
      proof: "a linear climb fixture → a breach forecast within 10% of when it happens"

  ordering: >-
    PF3 (built 0.41.0) → PF4 → PF6 → EX1 → EX2 → EX3 → HL0 → EX4 → PF2 → HL1 → HL2 → EX5 + HL3 → PF5 → HL4.
    Why: the store first (nothing else is measurable while it thrashes); then the senses (PF6 ticks, EX1–EX2 vitals);
    then judgement (EX3 declared, HL0 into the ladder, EX4 learned); then steering (PF2) and repair (HL1–HL2); then
    foresight (EX5, HL3).
