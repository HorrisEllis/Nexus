spec:
  meta:
    name:        escalation
    version:     1.2.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-escalation-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      The friction ledger and escalation logic. Every failed attempt adds friction to the fault class (0.10/0.20/0.35/0.50 per level). Friction persists in fault_taxonomy across sessions. At 1.0 → failure mode, no more auto-attempts.

  friction_thresholds:
    NOMINAL:      0.0
    ELEVATED:     0.4
    HIGH:         0.7
    FAILURE_MODE: 1.0
  levels:
    0: "Known fix replay — forge_patches history, successRate > 0.5"
    1: "Safe fix — 8 patterns: stale_module, timeout, api_degraded, queue_saturated, memory_pressure, bottleneck, circuit_breaker, import_error"
    2: "Snapshot + Forge — T3 propose-only, never auto-apply"
    3: "Deep scan — all 12 engines, full evidence → fault_taxonomy"
    4: "Failure mode — human action item, no more auto-attempts"

  # ── ADDENDUM 2026-07-20 (v1.2.0) — BUILT, plus pressure input ──
  addendum_2026_07_20:
    status: >
      Built as cortex/self-heal/escalation.js + cortex/self-heal/fault-taxonomy.js
      (schema + sole write authority for fault_taxonomy, §10.1 — six pre-existing
      readers, zero prior writers). wireAnomalyTrigger(bus) satisfied per
      tests/nexus-full-audit.js. 17 tests in tests/modules/test-escalation.js.
    new_input: >
      nexus.resource.pressure → memory_pressure fault class.
      pressure→level 1, critical→level 3, ok→recordSuccess (×0.5 decay, not reset).
      Transitions only (resource-monitor contract) — sustained pressure cannot
      march friction on repetition alone.
    named_future_work: >
      Oscillation damping — a flapping signal (pressure↔ok, NCP connect↔disconnect)
      should widen thresholds via telemetry-codec's OscillationEngine before it
      can walk a fault class into FAILURE_MODE on rhythm alone. Named, not built.
