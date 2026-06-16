spec:
  meta:
    name:        lib
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-lib-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Shared library modules used by all NEXUS systems.
      Not a service. No port. Imported directly.
      The primitives everything else builds on.
      If a module could be needed by two systems, it lives here.

  modules:

    - id: boot-sequence
      version: "1.0.0"
      path: "lib/boot-sequence.js"
      lines: ~250
      description: >
        Phase-gated boot runner. HARD phases block boot on failure.
        SOFT phases log and continue. Every phase has a name, label,
        and fn(). Boot log printed with ✓/✗ per phase.
        §1.2: failures are loud, never silent.
      exports:
        - "new BootSequence(label) → seq"
        - "seq.phase({ name, type, label, fn }) → void"
        - "seq.run() → { ok, phases, pass, fail }"

    - id: version
      version: "1.0.0"
      path: "lib/version.js"
      lines: ~100
      description: >
        Single source of truth for all versions.
        system, services, modules, meta, userscripts.
        Changelog (last 5 entries).
      exports:
        - "VERSION.system         — platform semver"
        - "VERSION.services       — per-service versions"
        - "VERSION.modules        — per-module versions"
        - "VERSION.meta           — meta layer module versions"
        - "VERSION.userscripts    — userscript versions"
        - "VERSION.get(name)      — lookup any version"
        - "VERSION.toString()     — human-readable summary"

    - id: component-registry
      version: "1.0.0"
      path: "lib/component-registry.js"
      lines: 512
      description: >
        The self-describing kernel. Every capability is a Component.
        Registry is the source of truth. CLI and shell are consumers.
        JAA-backed. In-memory index for hot path.
        Phase 1 complete — 16/16 tests passing.
      exports:
        - "init(jaaDB, bus) → { ok, count }"
        - "register(component) → { ok, component, created }"
        - "registerBatch(items[]) → results[]"
        - "get(id) → Component | null"
        - "list(filter?) → Component[]"
        - "update(id, patch) → { ok, component }"
        - "deprecate(id, replacedBy?) → { ok }"
        - "hardDelete(id, token) → { ok }"
        - "markAvailable(systemId, bool) → { count }"
        - "buildGrammarTree() → GrammarTree"
        - "handleRequest(method, sub, rest, body, params) → result"
        - "bootPhase(seq, jaaDB, bus) → void"
        - "onSystemRegister(systemId, components[], bus) → { ok }"
        - "onSystemOffline(systemId) → { count }"
        - "onSystemOnline(systemId) → { count }"

    - id: ui-registry
      version: "1.0.0"
      path: "lib/ui-registry.js"
      lines: 254
      description: >
        UI session tracking. Any UI registers, gets a sessionId.
        Heartbeat checked every 30s. Disconnect detected at 70s.
        Disconnect events broadcast to all SSE clients.
        Phase 2 complete — 12/12 tests passing.
      exports:
        - "init(broadcastFn, jaaDB) → { ok }"
        - "register(body) → { ok, sessionId, session, streams }"
        - "heartbeat(sessionId) → { ok }"
        - "deregister(sessionId) → { ok }"
        - "list() → UISession[]"
        - "listOnline() → UISession[]"
        - "get(sessionId) → UISession | null"
        - "stats() → { total, online, offline, byType }"
        - "emit(type, payload) → void"
        - "handleRequest(method, sub, body, params) → result"

    - id: vector-memory
      version: "1.0.0"
      path: "lib/vector-memory.js"
      lines: 428
      description: >
        SNR-gated semantic search engine.
        WRITE: text → nomic-embed-text (Ollama, 768-dim) → vectra LocalIndex
        READ: query → embed → k-nearest → cosine similarity → SNR gate → results
        Threshold 0.72 default. TF-IDF fallback when Ollama offline.
        Auto-embeds on JAA insert for 8 embeddable tables.
      exports:
        - "init() → bool"
        - "embed({ uuid, text, type, source, table, ts }) → bool"
        - "embedBatch(items[]) → results[]"
        - "search(query, opts?) → { results, noise, signal, snr }"
        - "assembleContext(prompt, opts?) → { context, items, tokenEstimate, snr }"
        - "onJaaInsert(table, row) → void  (fire-and-forget)"
        - "shouldEmbed(table) → bool"
        - "status() → { ready, ollamaOk, indexStats, stats }"
      snr_interpretation:
        ">0.90": "almost identical meaning"
        ">0.80": "strongly related"
        ">0.72": "related (default gate)"
        ">0.65": "loosely related"
        "<0.65": "noise — filtered"

    - id: chat-logger
      version: "1.0.0"
      path: "lib/chat-logger.js"
      lines: 259
      description: >
        Logs every AI exchange to disk (JSONL), JAA (chat_log table),
        and vector index (embedded for semantic search).
        Context reinjection: buildInjectionContext() returns
        semantically relevant past exchanges to prepend to new prompts.
        Session-aware. BDA signal extraction on every message.
        Liminal gap scoring on AI responses.
      exports:
        - "startSession(opts?) → sessionId"
        - "getSession() → sessionId | null"
        - "log(entry) → record"
        - "buildInjectionContext(prompt, opts?) → string"
        - "sessionSummary() → { sessionId, messages, avgGapScore }"
        - "listSessions() → { file, sizeKB }[]"

    - id: context-builder
      version: "1.0.0"
      path: "lib/context-builder.js"
      description: >
        Builds system prompt context for Ollama/forge calls.
        Standard: last N events from JAA.
        Semantic: buildSemanticContext() uses vector-memory to find
        the most relevant past context for the current prompt.
        Signal over recency.
      exports:
        - "buildContext(opts?) → string"
        - "buildSemanticContext(prompt, opts?) → { context, snr, source }"
        - "compressHistory(entries[]) → string"
        - "checkArtifactCache(intent) → artifact | null"
        - "estimateTokens(text) → number"

    - id: diagnostic-engines
      version: "1.0.0"
      path: "lib/diagnostic-engines.js"
      description: >
        12 cross-domain diagnostic methods drawn from:
        epidemiology, control theory, systems biology, information theory,
        signal theory, forensics, reliability engineering, statistics.
        All run on-demand via /api/engines endpoint.
        Results inform the self-heal escalation prescriptions.
      engines:
        1:  "Causal Chain Tracer — R0 cascade propagation"
        2:  "Invariant Scanner — §1.2/§2.1/§5.1 axiom checks"
        3:  "Circuit Breaker Inspector — CLOSED/HALF_OPEN/OPEN per system"
        4:  "Temporal Gap Analyzer — dead periods, clock skew, silence"
        5:  "Cascade Failure Predictor — blast radius from dependency graph"
        6:  "Entropy Rate Monitor — frozen/low/moderate/healthy/chaotic"
        7:  "SNR Noise Floor Detector — signal vs noise in event stream"
        8:  "Memory Pressure Estimator — acceleration and backpressure"
        9:  "Behavioral Fingerprinter — 3-gram cosine similarity, deviation"
        10: "Fault Tree Evaluator — AND/OR gates, minimal cut sets"
        11: "Homeostasis Scorer — recovery speed from errors"
        12: "Cross-System Correlation Matrix — co-failing system pairs"

    - id: event-ledger
      version: "1.0.0"
      path: "lib/event-ledger.js"
      description: >
        Disk-backed append-only ledger. Per-system JSONL files.
        Written before any state change (§2.1).
        The raw input to the diagnostic engines and intelligence layer.

    - id: contract-handshake
      version: "1.0.0"
      path: "lib/contract-handshake.js"
      description: >
        RSA-verified contract verification.
        When a system registers with the orchestrator, the orchestrator
        fetches its /contract endpoint, hashes it, signs with RSA-2048,
        and stores the trust state: VERIFIED / DEGRADED / MISMATCH / UNREACHABLE.
        Trust state is visible in /api/status and /api/contract.

    - id: meta/index
      version: "1.2.0"
      path: "lib/meta/index.js"
      description: >
        Lazy entry point for all six meta modules.
        Nothing loads until first use. No boot penalty.
      modules_exported:
        - topo-kernel
        - telemetry-codec
        - liminal
        - alk-perception
        - spatial
        - bda
