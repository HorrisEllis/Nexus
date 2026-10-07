spec:
  meta:
    name:        cortex
    version:     3.6.0   # 0.39.282 MINOR — /api/raid/status restored; /api/event broadcasts to /sse; the RAID officiator asks RAID who synthesizes; contract intake per-system dirs follow RAID_SYSTEMS_ROOT. Previous 3.5.0:
    foundation:  nexus-system-foundation@1.0.0
    port:        3748
    uuid:        nexus-cortex-v3-0000-2026-0615-jamesbrooks-001
    purpose: >
      The memory and brain of NEXUS. Everything that needs to be
      remembered, learned, healed, or routed passes through Cortex.
      Six organs boot in sequence. The event bus connects them all.

  core:
    schemas:
      - Gap:           "{ uuid, type, severity, status, friction, path, body, source, ts }"
      - Artifact:      "{ uuid, jobId, provider, content, gapScore, usage, ts }"
      - CortexMemory:  "{ uuid, key, value, tags, source, tier, ts }"
      - FaultTaxonomy: "{ uuid, faultClass, friction, count, lastSeen, failureMode }"
      - FailureMode:   "{ uuid, faultClass, friction, humanAction, escalationHistory, ts }"
      - ChatLog:       "{ uuid, sessionId, role, provider, content, intent, outcome, gapScore, bdaSignals, ts }"
      - Component:     "imported from component-registry"
      - InterstitialSpace: "{ id, focalPoint, items, velocity, lastCrystallised }"
    axioms: [AX-001, AX-002, AX-003, AX-005]
    constants:
      MEMORY_TIERS:       "{ working: 30min, short: 6hr, long: permanent }"
      FRICTION_NOMINAL:   0.0
      FRICTION_ELEVATED:  0.4
      FRICTION_HIGH:      0.7
      FRICTION_FAILURE:   1.0
      SNR_THRESHOLD:      0.72
      VECTOR_DIM:         768
      HB_HEALTH_MS:       10000
      HB_PULSE_MS:        30000
      HB_TELEMETRY_MS:    60000

  events:
    emits:
      - "cortex.booted"
      - "cortex.gap.found"
      - "cortex.gap.resolved"
      - "cortex.gap.escalated"
      - "cortex.heal.requested"
      - "cortex.heal.applied"
      - "cortex.heal.failed"
      - "cortex.memory.written"
      - "cortex.memory.forgotten"
      - "cortex.intelligence.pattern_crystallised"
      - "cortex.raid.decided"
      - "cortex.snapshot.created"
      - "cortex.escalation.friction_increased"
      - "cortex.escalation.failure_mode"
      - "escalation.level_0 through escalation.level_4"
      - "component.registered / component.updated (from component-registry)"
    handles:
      - "guardian.job.complete    → memory.ingest"
      - "guardian.job.failed      → gap.open"
      - "HEAL_REQUESTED           → self-heal.escalate"
      - "bridge.relay.failed      → gap.open"
      - "system.booted            → heartbeat.reset"

  organs:
    description: >
      Six organs boot in sequence. Each organ subscribes to events
      and emits events. No organ calls another directly.
    sequence:
      - order: 1
        id: gap-finder
        purpose: "Watches event stream for stale modules, axiom violations, recurring failures"
        subscribes: ["*"]
        emits: ["cortex.gap.found"]

      - order: 2
        id: healer
        purpose: "Prescribes fixes for open gaps using diagnostic engine results"
        subscribes: ["cortex.gap.found"]
        emits: ["cortex.heal.requested"]

      - order: 3
        id: self-heal
        purpose: "5-level escalation ladder with friction ledger"
        subscribes: ["cortex.heal.requested", "HEAL_REQUESTED"]
        emits: ["cortex.heal.applied", "cortex.heal.failed", "cortex.escalation.*"]

      - order: 4
        id: orion
        purpose: "Sensor + policy. Classifies requests, routes to context."
        subscribes: ["*"]
        emits: ["cortex.orion.classified"]

      - order: 5
        id: raid
        purpose: "Provider selection. 9 clusters, 5 NCP providers, Ollama primary."
        subscribes: ["cortex.orion.classified"]
        emits: ["cortex.raid.decided"]

      - order: 6
        id: heartbeat
        purpose: "3-tier: health probe (10s), API pulse (30s), telemetry frame (60s)"
        subscribes: []
        emits: ["cortex.health", "heartbeat.tick", "heartbeat.pulse", "heartbeat.frame"]

  routes:
    internal:
      - "GET  /health"
      - "GET  /contract"
      - "GET  /events (SSE)"
    external:
      - "GET  /api/gaps?status="
      - "POST /api/gaps/resolve"
      - "GET  /api/memory/working"
      - "POST /api/memory/write"
      - "POST /api/memory/forget"
      - "GET  /api/failure-modes"
      - "GET  /api/friction"
      - "GET  /api/chat-log"
      - "GET  /api/search?q=&threshold="
      - "POST /api/search/context"
      - "GET  /api/search/status"
      - "GET  /api/raid/decide?intent="
      - "POST /api/meta/observe"
      - "GET  /api/meta/gaps"
      - "GET  /api/meta/bda"
      - "POST /api/meta/classify"
      - "GET  /api/engines"
      - "POST /api/event"
      - "POST /api/table/insert"
      - "GET  /api/self-heal/status"

  handshake:
    components:
      - id: "cortex.gaps.list"
        grammar: ["cortex gaps list", "gaps", "gaps list", "gl"]
        route: { method: GET, path: "/api/cortex/gaps" }
        description: "List open gaps with severity and friction"
        tags: [memory, healing, monitoring]

      - id: "cortex.gaps.resolve"
        grammar: ["cortex gaps resolve", "resolve gap", "gr"]
        route: { method: POST, path: "/api/cortex/gaps/resolve" }
        description: "Resolve an open gap"
        params: [{ name: uuid, type: string, required: true }]

      - id: "cortex.memory.write"
        grammar: ["cortex memory write", "mem write", "mw"]
        route: { method: POST, path: "/api/cortex/memory/write" }
        description: "Write to working memory"
        params: [{ name: key, type: string }, { name: value, type: string }]

      - id: "cortex.memory.list"
        grammar: ["cortex memory list", "mem list", "ml"]
        route: { method: GET, path: "/api/cortex/memory/working" }
        description: "Read working memory"

      - id: "cortex.search"
        grammar: ["cortex search", "search", "s"]
        route: { method: GET, path: "/api/cortex/search" }
        description: "Semantic search across memory"
        params: [{ name: q, type: string, required: true, cli: "--q" },
                 { name: threshold, type: number, default: 0.72 }]

      - id: "cortex.heal.trigger"
        grammar: ["cortex heal", "heal"]
        route: { method: POST, path: "/api/cortex/heal/trigger" }
        description: "Trigger self-heal escalation for a gap"
        params: [{ name: gapUuid, type: string, required: true }]

      - id: "cortex.friction.list"
        grammar: ["cortex friction", "friction", "fr"]
        route: { method: GET, path: "/api/cortex/friction" }
        description: "Fault class friction scores"

      - id: "cortex.failures.list"
        grammar: ["cortex failures", "failures", "fm"]
        route: { method: GET, path: "/api/cortex/failure-modes" }
        description: "Active failure modes requiring human action"

      - id: "cortex.raid.route"
        grammar: ["cortex raid route", "raid route", "rr"]
        route: { method: GET, path: "/api/cortex/raid/decide" }
        description: "Ask RAID which provider it would choose for an intent"
        params: [{ name: intent, type: string, required: true, cli: "--intent" }]

      - id: "cortex.engines.run"
        grammar: ["cortex engines", "engines", "diag"]
        route: { method: GET, path: "/api/cortex/engines" }
        description: "Run all 12 diagnostic engines"

  modules:
    - id: jaa-db
      version: "6.0.0"
      description: "Persistent storage. All tables. Disk-first."

    - id: vector-memory
      version: "1.0.0"
      description: "SNR-gated semantic search. nomic-embed-text via Ollama."

    - id: chat-logger
      version: "1.0.0"
      description: "AI exchange logging + context reinjection."

    - id: component-registry
      version: "1.0.0"
      description: "Self-describing kernel. All components registered here."

    - id: ui-registry
      version: "1.0.0"
      description: "UI session tracking. Heartbeat. SSE routing."

    - id: escalation
      version: "1.0.0"
      description: "5-level friction ladder with failure mode ledger."

    - id: meta/topo-kernel
      version: "1.0.0"
      description: "8-gate SNR pipeline."

    - id: meta/telemetry-codec
      version: "1.0.0"
      description: "Slope, stability, oscillation, drift engines."

    - id: meta/liminal
      version: "1.0.0"
      description: "12 gap detectors."

    - id: meta/alk-perception
      version: "1.0.0"
      description: "Composite behavioral state classifier."

    - id: meta/spatial
      version: "1.0.0"
      description: "Sigma engine + resonance lattice."

    - id: meta/bda
      version: "1.0.0"
      description: "Behavioral Drift Analyzer. 5-signal extraction."

    - id: diagnostic-engines
      version: "1.0.0"
      description: "12 cross-domain diagnostic methods."

  ui:
    type: "panel in nexus-shell"
    hotswap: true
    panels:
      - "GAPS — open gap list with severity, friction, heal button"
      - "MEMORY — working memory read/write/forget"
      - "RAID — routing decisions, provider health"
      - "HEAL — escalation state, friction table, failure modes"
      - "SEARCH — semantic memory search with SNR scores"
      - "ENGINES — 12 diagnostic engine results"

  tests:
    required_before_handshake:
      - "All 6 organs boot without error"
      - "JAA tables load or create cleanly"
      - "Vector memory init (SOFT — pass even if Ollama offline)"
      - "Component registry loads existing components from JAA"
      - "Health endpoint returns ok:true"
      - "Contract endpoint returns valid contract shape"

  # ── ADDENDUM 2026-07-20 (v3.3.0) — organ completion, spec catching up to code ──
  addendum_2026_07_20:
    summary: >
      All six organs now exist as real, bus-wired SISO gates, built bottom-up
      across Phases 0-6 (see docs_out/cortex-phase-map.md for the full audit
      trail including every bug found and fixed along the way).
    organs_built:
      - "self-heal/escalation — friction ledger. Subscribes anomaly.detected, HEAL_REQUESTED, nexus.resource.pressure. Emits escalation.friction.increased (exact name liminal-space listens for, payload field newFric) + escalation.failure_mode."
      - "self-heal — 5-level ladder. Level from fault_taxonomy count. L0 forge_patches/fix_map replay, L1 the 8 safe patterns, L2 propose-only (never auto-applies), L3 12-engine deep scan, L4 failure_modes + human action item. SEMANTIC_GAP_TYPES excluded (§7.2)."
      - "gap-finder — anomaly.detected (high/critical) + sigma.event.halt_risk → deduped cortex.gap.found ({gap: row} shape)."
      - "orion — pure classifier (§14.2): anomaly/sigma → cortex.orion.classified, shaped to RAID _decide()'s real contract."
      - "raid — bus-wired: cortex.orion.classified → same _decide() → cortex.raid.decided. KNOWN GAP (§10.3): boot.js's /api/raid/decide route still calls its own lighter _raidDecide, not this engine — two truth layers, tracked, not fixed."
    event_name_corrections: >
      Spec previously said cortex.escalation.friction_increased; deployed
      listener contract is escalation.friction.increased with payload field
      newFric. Code conformed to the deployed contract; spec now records it.
    foundation_fixes: >
      Three sibling bugs fixed at the source in guardian/jaa-store.js _matches():
      predicate-function where clauses silently matched ALL rows; string where
      clauses silently matched NONE. Plus jaa-db.js bare-number limit fix and
      the JaaDB class (JSONL journal, tier decay, queryWeighted) built against
      its pre-existing 52-test pinned contract. tc.drift.signal renamed +
      payload-remapped in liminal-space. _checkCrystallisation §14.4 loop guard.
      intelligence _patternScanCursor accumulation + monotonic crystallised
      latch (root cause of the infinite re-announce spam).
    pressure_reflex: >
      nexus.resource.pressure (resource-monitor, transitions only) now relayed
      orchestrator→cortex /api/event and consumed by escalation as the
      memory_pressure fault class: pressure→L1 (+0.20), critical→L3 (+0.50),
      ok→recordSuccess decay. Built from the 2026-07-20 live 0xC0000409
      double-crash log, where the event fired with zero consumers.

  # ## ADDENDUM 2026-09-27 (0.39.267) — RAID's intent contract reads the worn hat
  # docs/2026-09-27-agent-hat-memory-download-manager-phasemap.spec (H4).
  # contract-intake rows carry `hat`; acknowledge() calls checkAgentIntentContract(forAgent, intention, { hat }). With a
  # hat, that hat's allowedIntents decide whoever wears it; a hat that is not live is refused. Without one, the old rule
  # (any hat naming the agent) stands. speceng.build sends the hat on its RAID observability contract.

# ── ADDENDUM 2026-09-29 (0.39.282) — cortex 3.6.0 ──
# /api/raid/status (version, health, weights from the real engine) had not moved into cortex/boot.js when the admin
# server was removed, so the orchestrator's raid CLI always said cortex was offline. POST /api/event now reaches /sse
# subscribers. cortex/core/raid/officiator.js picks its synthesizer with RAID decideForContract (or opts.forAgent)
# instead of five literal 'claude' defaults. contract-intake resolves <system>/input|output under RAID_SYSTEMS_ROOT
# (the test sandbox sets it) and its CFR ledger under NEXUS_DATA_ROOT.

# ── ADDENDUM 2026-10-07 (0.43.0) — runtime-load PF5: bounded tables, nothing lost ──
# James: "do it. tell me what that would do"
# cortex/memory/table-compactor.js caps the hot tables at their newest N rows (event_log 50k, component_ledger 50k,
# cfr_tension_history 20k; NEXUS_TABLE_CAP_<TABLE>, 0 = none). Rows leaving by cap or by age are archived first —
# one gzip member per batch appended to <store>/archive/<table>/<day>.jsonl.gz — and deleted only when the archive was
# written. readArchive(jaa, table, day?) reads them back; compaction_log keeps a summary row per batch.
