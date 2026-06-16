spec:
  meta:
    name:        raid-snr-filter
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-raid-snr-filter-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      SNR filter on RAID dispatch. Invariants first. Patterns second. AI last.
      Tokens ∝ unresolved meaning. Only genuine unknowns reach AI.
      Runs before every RAID dispatch as a pre-gate.

  resolution_order:
    1: "Known invariant (forge_patches, successRate>0.7) → deterministic fix, tokens:0"
    2: "Crystallised pattern with pre-staged fix → pattern fix, tokens:0"
    3: "Open loop (elevated friction or liminal items) → dispatch with context flag"
    4: "Genuine unknown → dispatch to AI provider"

  snr_values:
    invariant:  1.0
    pattern:    "pattern.confidence"
    open_loop:  0.5
    unknown:    0.0

  wired_into: "cortex/core/raid/index.js _dispatch() — first gate before any provider call"

  tests:
    count:  10
    status: "10/10 PASSING"
