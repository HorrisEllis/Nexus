spec:
  meta:
    name:        gap-finder
    version:     1.1.0
    foundation:  nexus-system-foundation@1.1.0
    kind:        library-module   # not a service — lives at cortex/gap-finder/index.js
    uuid:        nexus-gap-finder-v1-0000-2026-0901-jamesbrooks-001
    status:      active
    purpose: >
      Cortex's "Gap-Finder Organ" — turns real signal into real gaps.
      Listens for two already-live inputs: anomaly.detected
      (meta/causal/anomaly.js) and sigma.event.halt_risk /
      sigma.event.warning (orchestrator/lib/sigma-writer.js). Emits
      cortex.gap.found with the exact { gap: row } shape cortex/boot.js's
      own emitter already uses. Dedups against the real `gaps` table
      (open, unresolved, same dedup_key) before creating a new one,
      matching service/nexus-diagnostic.js's existing convention rather
      than inventing a second one.

  api:
    exports: [MODULE_ID, VERSION, init, stop, health, _createGap]
    init:
      params: "{ bus }"
      description: "Subscribes to anomaly.detected, sigma.event.halt_risk, sigma.event.warning on the given bus."
    health:
      returns: "{ ok, module, version, busWired }"

  events:
    handles:
      - 'anomaly.detected'
      - 'sigma.event.halt_risk'
      - 'sigma.event.warning'
    emits:
      - 'cortex.gap.found'

  design_notes: >
    §14.2 — pure per event: same anomaly/sigma event in, same gap decision
    out. §14.4 — this organ does not re-emit anomaly.detected or
    sigma.event.*, so there's no cycle for a wasProcessedBy() guard to
    prevent (same reasoning already applied to escalation.js).

  consumers:
    - cortex/boot.js   # wires init({ bus }) at boot

  history:
    - date: 2026-07-20
      summary: "Original build — real gap-emission organ, dedup against the live gaps table."
    - date: 2026-09-01
      summary: >
        First .spec written, closing one of the 11 real gaps
        orchestrator/lib/spec-drift.js's live check reported (§LM1).

  gaps:
    as_of: 2026-09-01
    entries: []   # small (101 lines), single real consumer, clean dedup discipline — no open gap found this pass

  version_history:
    - version: 1.0.0
      date: 2026-07-20
      summary: "Original build."
      versioniumCommitId: null
    - version: 1.1.0
      date: unknown
      summary: "Version bump to 1.1.0 per lib/version.js's own comment ('stale_module: named module, port, staleSec, typed severity') — exact change not traced further this pass."
      versioniumCommitId: null
