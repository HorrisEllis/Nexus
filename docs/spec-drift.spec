spec:
  meta:
    name:        spec-drift
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-spec-drift-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Spec drift detector. Compares version declared in each system's
      .spec file against version declared in lib/version.js.
      On mismatch: opens a gap in Cortex (spec.version.drift).
      On missing spec: opens a gap (spec.missing).
      On sync: resolves any open drift gap.
      Run on every orchestrator boot as a SOFT phase.
      §1.2: drift is never silent — it is a standing gap.

  behavior:
    on_boot: >
      Runs as SOFT phase after component and UI registry init.
      Never blocks boot. Opens gaps, logs results, continues.
    on_drift: >
      gap.type = spec.version.drift
      gap.severity = medium
      gap.resolution = specific instruction to update the spec file
      Friction accumulates if gap stays open across sessions.
    on_missing: >
      gap.type = spec.missing
      gap.severity = low
      gap.resolution = create docs/{system}.spec from foundation template
    on_sync: >
      Any previously open drift gap for this system is resolved.
      console.log ✓ system synced at vX.X.X

  cli: "node lib/spec-drift.js — runs check, prints report, exits 1 if any drift"

  handshake:
    components:
      - id: "orchestrator.spec.drift"
        grammar: ["spec drift", "drift"]
        route: { method: GET, path: "/api/spec/drift" }
        description: "Check spec versions vs code versions, show any drift"
