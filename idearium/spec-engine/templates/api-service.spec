# §SEED PROVENANCE — extracted verbatim from causal-nexus.spec, BLOCK 8 —
# INTERFACES (lines 3012-3173 of the source file), authored by james-brooks.
# Real external/internal interface contracts from a shipped system — chosen
# as the reference shape for an "API Service" archetype (auth, SLA, failure
# contract, consumers, mock_available fields all present and real).
  # BLOCK 8 — INTERFACES
  # ════════════════════════════════════════════════════════════════
  interfaces:
    external:
      - id: IFACE-001
        name: anthropic-api
        type: http_api
        direction: outbound
        protocol: HTTPS REST
        version: "claude-sonnet-4-20250514"
        auth:
          method: api_key
          location: header
          required: true
        schema_ref: https://docs.anthropic.com/api/messages
        sla:
          availability_pct: 99.5
          max_latency_ms: 30000
          rate_limit: "varies by plan"
        breaking_change_policy: >
          Model version pinned in forge module. On deprecation, forge returns
          { ok: false, error: 'model_deprecated' }. Operator updates model string.
        failure_contract: >
          Non-200: "forge returns { ok: false, error }. Timeout: { ok: false, error: 'timeout' }."
        consumers: [forge]
        mock_available: true

      - id: IFACE-002
        name: guardian-bridge
        type: websocket
        direction: inbound
        protocol: WebExtension message passing
        version: "5.0.0"
        auth:
          method: none
          location: none
          required: false
        schema_ref: Guardian/handshake.js
        sla:
          availability_pct: 95.0
          max_latency_ms: 100
          rate_limit: "browser-rate-limited"
        breaking_change_policy: >
          Adapter handles unknown bridge event types gracefully (logged, not crashed).
        failure_contract: >
          On Guardian disconnect: calltoMap retains pending entries until TTL expiry.
          Adapter continues. Kernel ring continues normally.
        consumers: [adapter]
        mock_available: true

    internal:
      - id: INT-001
        name: kernel → causality (edge ops)
        from_module: kernel
        to_module: causality
        type: function_call
        mechanism: createEdge(), pruneEdgesFor(), createCalltoMap() APIs
        contract: Synchronous in ingest pipeline steps 4 and H-1. Returns immutable edge records.
        failure_contract: causality throws on diamond. kernel catches and emits system:diamond:rejected.
        latency_budget_ms: 2
        mock_available: true

      - id: INT-002
        name: kernel → enforcement (BoundaryIndex)
        from_module: kernel
        to_module: enforcement
        type: event
        mechanism: kernel.subscribe() — BoundaryIndex attaches on createKernel()
        contract: BoundaryIndex receives every event synchronously before subscriber callbacks. 29 checks per event.
        failure_contract: InvariantViolationError thrown on hard invariant. Hard stop — never caught.
        latency_budget_ms: 1
        mock_available: false

      - id: INT-003
        name: persist → compress (dynamic import)
        from_module: persist
        to_module: compress
        type: function_call
        mechanism: dynamic import() at flush/recover time (TRDE-003)
        contract: Never imported at load time. compress provides snapshot(), restore() for flush/recover.
        failure_contract: "Dynamic import failure: { ok: false, error: 'compress_unavailable' }."
        latency_budget_ms: 10
        mock_available: true

      - id: INT-004
        name: version-gate → context (hydration)
        from_module: version-gate
        to_module: context
        type: function_call
        mechanism: kernel.createReplayContext(migratedArtifact)
        contract: validate() → migrate() → createReplayContext(). Always in this order. CI-1..CI-6 isolated.
        failure_contract: GateValidationError stops hydration. createReplayContext never called on invalid.
        latency_budget_ms: 5
        mock_available: true

      - id: INT-005
        name: ledger → observer (events)
        from_module: ledger
        to_module: observer
        type: event
        mechanism: ledger.on() / ledger.emit() — typed event subscription
        contract: Emits idea:recorded, idea:promoted, upgrade:committed, bottleneck. Zero bus coupling.
        failure_contract: If no observer wired — events silently dropped. Ledger continues normally.
        latency_budget_ms: 1
        mock_available: true

    observability:
      metrics:
        enabled: true
        format: custom
        endpoints: ["user-configured"]
        key_metrics:
          - name: ring_eviction_rate
            type: counter
            description: system:ring:evicted events per second. High rate = ring too small.
          - name: gate_execution_latency_ms
            type: histogram
            description: Time to run all gates per ingest. High = gate optimization needed.
          - name: invariant_violation_count
            type: counter
            description: InvariantViolationError throws per hour. Any > 0 = system failure.
          - name: forge_success_rate
            type: gauge
            description: Fraction of forge calls returning ok:true. < 0.8 = model/prompt issue.
          - name: wal_flush_latency_ms
            type: histogram
            description: WAL flush duration. > 100ms = backend I/O issue.
          - name: ledger_pending_ideas
            type: gauge
            description: Unresolved idea count. > 5 = bottleneck alert.
      tracing:
        enabled: false
        system: none
        sampling_rate: 0.0
      logging:
        format: json
        levels: [debug, info, warn, error]
        sink: [stdout]
        structured_fields:
          - ts
          - module
          - level
          - message
          - invariantId
          - eventId
      health:
        endpoint: ""
        response_schema:
          - field: ringSize
            type: number
            description: Current number of events in ring.
          - field: evictionRate
            type: number
            description: Evictions per second over last 60s.
          - field: invariantsPassing
            type: number
            description: Count of invariants passing (of 29).
          - field: ledgerPendingIdeas
            type: number
            description: Unresolved idea count.

  # ════════════════════════════════════════════════════════════════
