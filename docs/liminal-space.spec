spec:
  meta:
    name:        liminal-space
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-liminal-space-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      The five interstitial spaces. The boundary between memory levels.
      Not where unresolved things live — what the boundary IS.
      The intersection defines both sides.
      Everything is defined by what it isn't. The boundary between
      what is and what isn't is itself what isn't.

  focal_points:
    L0/L2:
      name:      "Constitutional Threshold"
      invariant: "INV-001"
      description: "Where synthesis meets axiom. Filter gate."
    L1/L3:
      name:      "Pattern-Causality Membrane"
      invariant: "INV-002"
      description: "Where recognition becomes understanding."
    L2/L4:
      name:      "Velocity Field"
      invariant: "INV-003"
      description: "Processing rate vs synthesis rate. Runaway state detector."
    L3/L0:
      name:      "Root Terminus"
      invariant: "INV-004"
      description: "Causal chains anchored or hanging as L0_UNKNOWN."
    L1/L2:
      name:      "Coherence Surface"
      invariant: "INV-005"
      description: "Productive contradiction held open. Not forced to resolve."

  crystallisation_gate:
    path_1: "Evidence threshold: N>=5 confirmed instances, confidence>=0.75"
    path_2: "Focal point confirmation: pattern survives intersection of two levels"
    note:   "The intersection IS the verification. Not repetition — confirmation."

  forward_inference:
    description: >
      Same architecture as spec-drift, time direction reversed.
      Pattern fires now → pre-stage fix → gap hasn't opened yet.
      The gap shape is both diagnostic signal and fix target.
    mechanism: "query bep_patterns for precursors → pre-stage known fix via bus"

  velocity_field:
    runaway_threshold: 0.8
    decay_per_tick:    0.05
    tick_interval:     "60s"
    runaway_event:     "liminal.velocity.runaway"

  organ_contract:
    one_line_change:  "{ name: 'liminal-space', path: './liminal-space/index' }"
    reads_from_bus:
      - "cortex.gap.found"
      - "cortex.intelligence.pattern_crystallised"
      - "escalation.friction.increased"
      - "behavioral.drift.signal"
      - "guardian.job.complete"
      - "forge.patch.proposed"
      - "cortex.gap.resolved"
    emits_to_bus:
      - "liminal.item.held"
      - "liminal.item.resolved"
      - "liminal.item.dissolved"
      - "liminal.crystallised"
      - "liminal.forward_inference"
      - "liminal.velocity.runaway"
    calls_directly: []
    note: "Zero direct calls to any other organ. Pure event bus isolation."

  tests:
    count:  16
    status: "16/16 PASSING"
