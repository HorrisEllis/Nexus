spec:
  meta:
    name:        behavioral-boundary
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-behavioral-boundary-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Behavioral Boundary Organ. Enforces the line between the
      deterministic zone and the fluid zone. The deterministic zone
      is never touched by AI. The fluid zone is adaptive and free.
      This organ watches the boundary — not the fluid zone itself.

  zones:
    deterministic:
      description: "Never touched by AI. Same input → same output. Always."
      includes:
        - "auth/ — crypto, policy, client keys"
        - "cortex/self-heal/escalation.js — friction thresholds and rules"
        - "lib/boot-sequence.js — HARD phase definitions"
        - "lib/spec-drift.js — constraint enforcement"
        - "lib/version.js — source of truth for versions"
        - "cortex/core/raid/index.js — LAW_I and LAW_III"
        - "cortex/memory/jaa-db.js — persistence schema"
        - "lib/component-registry.js — component schema"
        - "contracts/ — system contracts"
        - "*.spec — constraint documents"
        - "cortex/behavioral-boundary/index.js — this file"

    fluid:
      description: "AI-assisted. Adaptive. Free within bounds."
      includes:
        - "Forge patches to application logic"
        - "Healer prescriptions"
        - "SEAM T2/T3 chunk outputs"
        - "Gap body text and descriptions"
        - "Intelligence pattern crystallisation"
        - "Context injection content"

  invariants:
    INV-A:
      name: "Boundary Integrity"
      check: "No AI output targets a deterministic zone file"
      on_violation: "Reject output. Open behavioral.drift.boundary_crossed gap. Severity: high."

    INV-B:
      name: "Friction Monotonicity"
      check: "Friction in fault_taxonomy only modified by escalation engine"
      on_violation: "Open behavioral.drift.friction_modified gap. Severity: high."

    INV-C:
      name: "Self-Modification Detection"
      check: "No AI output targets a file that defines the system's own constraints"
      on_violation: "HALT. Open behavioral.drift.self_modification gap. Severity: critical. No escalation ladder — human action required immediately."

  bda_tracking:
    description: >
      Runs BDA signal extraction on every AI output (forge patches,
      healer prescriptions, SEAM chunks, job completions).
      Tracks 5-signal trend over last 10 outputs per provider.
      Emits behavioral.drift.signal when trend crosses threshold.
    signals: [valence, certainty, selfref, tension]
    drift_window: 10
    drift_threshold: 0.25
    concerns:
      selfref_rising:    "AI outputs increasingly self-referential (threshold 5%)"
      tension_rising:    "AI outputs showing conflict signals (threshold 8%)"
      valence_declining: "AI outputs trending more negative (Δ > 25%)"
      certainty_dropping:"AI outputs becoming more hedging (Δ > 25%)"

  organ_contract:
    reads_from_bus:
      - "forge.patch.proposed"
      - "healer.prescription.ready"
      - "seam.chunk.complete"
      - "guardian.job.complete"
      - "escalation.friction.increased"
    emits_to_bus:
      - "behavioral.boundary.violation"
      - "behavioral.boundary.rejected"
      - "behavioral.drift.signal"
    writes_to_jaa:
      - "gaps (violations)"
      - "event_log (drift signals)"
    calls_directly: []
    note: "Zero direct calls to any other organ. Pure event bus isolation."

  boot:
    added_to_organs_array: true
    one_line_change: "{ name: 'behavioral-boundary', path: './behavioral-boundary/index' }"
    no_other_file_changed: true
