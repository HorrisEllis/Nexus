spec:

  # ════════════════════════════════════════════════════════════════════════════
  # runtime.spec
  # The spec-compiler runtime — described in its own language.
  #
  # BOOTSTRAP PROOF:
  #   When spec-compiler can parse this file and produce a valid KnowledgeGraph,
  #   the spec language is expressive enough to describe the system that reads it.
  #   The gap field output from this spec is the build agenda for what remains.
  #
  # STATUS: active development — modules marked by specDepth signal
  # ════════════════════════════════════════════════════════════════════════════

  meta:
    name:        spec-compiler-runtime
    version:     1.0.0
    author:      james-brooks
    uuid:        runtime-spec-v1-0000-2026-0610-jamesbrooks-001
    status:      active
    description: >
      Constraint-driven, propagation-based execution runtime with semantic
      completeness tracking and deterministic scheduling semantics.
      Tokens are a measurable function of unresolved state.
      tokenCost = f(totalGapWeight, oscillationIndex, unresolvedNodes)
    axioms:
      - Nothing silently fails — violations are typed events, not exceptions
      - Gaps are derived, never directly authored
      - No gate interprets — gates obey the tier contract
      - The ring buffer is causal memory, not a log
      - Tokens are proportional to unresolved meaning, not system size

  # ── EVENT MODEL ─────────────────────────────────────────────────────────────
  # The seams between every module. Events are the only communication channel.
  # The loop-closing event (runtime.mutation) is declared here — it is the ↺.

  events:
    kg:
      - kg.build.requested        { specPath, options }
      - kg.nodes.built            { nodeCount, blackCount }
      - kg.edges.built            { edgeCount }
      - kg.scored                 { greenCount, amberCount, redCount }
      - kg.blast.computed         { maxBlastRadius }
      - kg.complete               { graph, meta }
      - kg.error                  { step, error }

    invariants:
      - invariants.check.requested  { graph, triggerEvent }
      - invariants.violation.found  { invariantId, nodeId, severity, message }
      - invariants.check.complete   { violationCount, criticalCount, report }

    gaps:
      - gap.field.computed        { totalGapWeight, gapCount, estimatedTokenCost }
      - gap.found                 { gapId, type, nodeId, severity, blockers }
      - gap.resolved              { gapId, resolvedBy }

    tier:
      - tier.decided              { nodeId, tier, action, reason }
      - tier.map.complete         { t2Count, t1Count, t0Count, skipCount }

    reply:
      - reply.plan.requested      { tierMap, gapSeverityMap }
      - reply.plan.ready          { run, defer, skip, block }
      - reply.node.scheduled      { nodeId, tier, estimatedTokens }
      - reply.node.deferred       { nodeId, reason }
      - reply.node.blocked        { nodeId, reason }

    execution:
      - execution.t0.started      { nodeId, outputDir }
      - execution.t0.complete     { nodeId, filesEmitted }
      - execution.t1.started      { nodeId, outputDir }
      - execution.t1.complete     { nodeId, filesEmitted }
      - execution.t2.started      { nodeId, chunkTokens }
      - execution.t2.complete     { nodeId, artifact, seamPassed }
      - execution.t2.failed       { nodeId, reason, retryable }
      - execution.skipped         { nodeId, reason }
      - execution.blocked         { nodeId, reason }

    runtime:
      # THE LOOP-CLOSING EVENT — the ↺
      # Emitted by the ring buffer when a node's state changes.
      # Triggers re-propagation and re-invariant-check for the affected subgraph.
      # This event is what makes the system reactive, not just analytical.
      - runtime.mutation          { mutationId, nodeId, field, fromValue, toValue, causedBy, ts }
      - runtime.recompute.needed  { affectedNodeIds, triggerMutationId }
      - runtime.cycle.stable      { cycleNodeIds, convergenceValue }
      - runtime.build.complete    { moduleName, totalTokensUsed, gapWeightRemaining }

    ring_buffer:
      - buffer.event.recorded     { eventType, nodeId, seq }
      - buffer.capacity.reached   { evictedCount, retainedCount }
      - buffer.snapshot.taken     { snapshotId, eventCount }
      - buffer.replay.started     { fromSeq, toSeq }
      - buffer.replay.complete    { replayedCount }

    writeback:
      - cortex.preflight.done     { moduleName, skipGeneration, openGapCount }
      - cortex.file.uploaded      { filePath, hash }
      - cortex.commit.done        { commitId }
      - cortex.seam.verified      { seamName, version }
      - cortex.unreachable        { error, fallback }

  # ── MODULES ─────────────────────────────────────────────────────────────────

  modules:

    # ── FOUNDATION LAYER ──────────────────────────────────────────────────────

    - id:    MOD-SISO
      name:  siso-core
      uuid:  siso-core-f0und4t10n-layer-0000-000000000001
      description: >
        Pure functional event-driven primitives. Event, Gate, Stream, StreamLog.
        The atom the entire runtime is built from. Zero dependencies.
        O(1) gate lookup. Depth-first transform. Pending as residue, not error.
      exports:
        - "Event(type: string, data: object) → Event"
        - "Gate(signature: string) → Gate"
        - "Stream(options?: StreamOptions) → Stream"
        - "StreamLog(level?: LogLevel) → StreamLog"
        - "Stream.replay(log: StreamLog, target?: Stream) → ReplayResult"
      gate_pipeline:
        - "GATE-SISO-001: event arrives → gate lookup O(1) → transform or pending"
        - "GATE-SISO-002: depth-first emit → sub-events processed before parent returns"
        - "GATE-SISO-003: StreamLog.record → captures type, claimed, streamId, optional data"
      behavioral_contracts:
        - Signature collision is a hard error, not silent precedence.
        - Transforms run depth-first, synchronously unless driveAsync is used.
        - Pending is residue — not an error state. Read via sampleHere().
        - The log observes — it does not consume or block.
        - Stream.replay requires DATA-level log. Returns ok:false otherwise.
      error_paths:
        - duplicate signature → throw Signature collision immediately
        - replay without DATA log → return {ok:false, error: ...} not throw
        - emit to non-existent gate → event lands in pending, not error

    - id:    MOD-KG-BUILDER
      name:  kg-builder
      uuid:  mod-kgbuilder-e5b7d9a1c3e5b7d9a1c3e5b7d9a1c3e5b7
      description: >
        ParsedSpec → KnowledgeGraph. Five SISO gates: BuildNodes, BuildEdges,
        Score, BlastRadius, Assemble. Synchronous — pure computation, no I/O.
        Produces specDepth, effectiveSpecDepth, generationReadiness, confidence,
        blastRadius, gaps per node. BLACK nodes for referenced-but-undeclared.
      exports:
        - "build(parsedSpec: ParsedSpec, options?: KGOptions) → KGResult"
        - "buildNode(id: string, raw: object, kind: NodeKind) → KGNode"
        - "computeGaps(node: KGNode, blastSize: number) → Gap[]"
        - "assignConfidence(genReadiness: number, isBlack: boolean) → Confidence"
      gate_pipeline:
        - "GATE-KG-001: ParsedSpec → BuildNodesGate → kg.nodes.built"
        - "GATE-KG-002: kg.nodes.built → BuildEdgesGate → kg.edges.built"
        - "GATE-KG-003: kg.edges.built → ScoreGate → kg.scored"
        - "GATE-KG-004: kg.scored → BlastRadiusGate → kg.blast.done"
        - "GATE-KG-005: kg.blast.done → AssembleGate → kg.complete"
      behavioral_contracts:
        - KnowledgeGraph is immutable after build(). Mutations require new build().
        - specDepth computed from field presence only. Never manually overridden.
        - generationReadiness propagates via topological relaxation, max 10 passes.
        - Cycles converge to 0.0 — semantic blocked state, not error.
        - BLACK nodes are first-class — appear in blast radius and gap reports.
        - Alias resolution happens before BLACK node creation (nameIndex).
        - effectiveSpecDepth reduced only by explicit schema_refs, not inferred types.
      error_paths:
        - circular dependency → all cycle nodes converge to genReadiness 0.0
        - referenced dep not found → BLACK node created, not error
        - parsedSpec.modules as object → normalizeModules() called first

    - id:    MOD-TIER-CONTRACT
      name:  tier-contract
      uuid:  mod-tiercontract-v1-0000-0001
      description: >
        The execution semantics of the compiler. Single source of truth for all
        tier decisions. No gate hardcodes a threshold. decideTier() is the only
        evaluator. Gates stop interpreting — they obey.
        tokenCost ∝ unresolved meaning, not system size.
      exports:
        - "decideTier(node: KGNode) → TierDecision"
        - "decideTierForSpec(specDepth: number) → TierDecision"
        - "shouldEmitT0(node: KGNode) → boolean"
        - "shouldEmitT1(node: KGNode) → boolean"
        - "shouldDispatchT2(node: KGNode) → boolean"
        - "shouldWriteGap(node: KGNode) → boolean"
        - "decideAll(graph: KnowledgeGraph) → TierMap"
        - "summarize(tierMap: TierMap) → string"
      gate_pipeline:
        - "GATE-TC-001: node.confidence === BLACK → MISSING decision"
        - "GATE-TC-002: node.genReadiness === 0.0 → BLOCKED decision"
        - "GATE-TC-003: genReadiness >= 0.8 → T2 IMPLEMENT"
        - "GATE-TC-004: genReadiness >= 0.5 → T1 SCAFFOLD"
        - "GATE-TC-005: genReadiness >= 0.3 → T0 STRUCTURE"
        - "GATE-TC-006: genReadiness < 0.3 → SKIP"
      behavioral_contracts:
        - Priority order is BLACK > BLOCKED > T2 > T1 > T0 > SKIP. Never violated.
        - Every decision includes tier, action, label, reason, readiness, nodeId.
        - BOUNDARIES constants are the only source of threshold values.
        - decideAll() classifies every node exactly once, no node falls through.
      error_paths:
        - missing confidence field → defaults to RED (conservative)
        - missing generationReadiness → defaults to 0.0 (BLOCKED, not T2)

    # ── PIPELINE LAYER ────────────────────────────────────────────────────────

    - id:    MOD-PIPELINE
      name:  compiler-pipeline
      uuid:  spec-compiler-pipeline-v2-0000-0001
      description: >
        The SISO stream compiler. Five gates: SpecLoad, CortexQuery, T0, T1,
        Writeback. driveAsync() bridges sync SISO stream to async gates.
        driveAsync contract: sequential drain only. No retry, timeout, parallelism.
        One pipeline per compile run — never reused.
      exports:
        - "compile(specPath: string, outputDir: string, options?: CompileOptions) → CompileResult"
        - "createPipeline(logLevel?: LogLevel) → {stream: Stream, log: StreamLog}"
        - "driveAsync(stream: Stream, seedEvent: Event) → Promise<void>"
      gate_pipeline:
        - "GATE-PIPE-001: spec.load → SpecLoadGate → spec.parsed | compiler.error"
        - "GATE-PIPE-002: spec.parsed → CortexQueryGate → cortex.ready | compiler.skipped"
        - "GATE-PIPE-003: cortex.ready → T0Gate → compiler.t0.done"
        - "GATE-PIPE-004: compiler.t0.done → T1Gate → compiler.t1.done"
        - "GATE-PIPE-005: compiler.t1.done → WritebackGate → compiler.complete"
      behavioral_contracts:
        - driveAsync is forbidden from growing retry/timeout/parallelism logic.
        - Driving the same stream twice throws immediately.
        - Gate errors become compiler.error events — driveAsync never throws.
        - Every compile result includes graph and tierMap alongside t0 and t1.
        - KG is built after T0 emission — T1 uses real genReadiness scores.
      error_paths:
        - spec parse failure → compiler.error event in pending, not throw
        - Cortex unreachable → assume_empty, continue compilation, log gap
        - T0/T1 file write failure → logged to failures[], not fatal
      deps:
        - name: siso-core
        - name: kg-builder
        - name: tier-contract
        - name: cortex-query

    - id:    MOD-CORTEX-QUERY
      name:  cortex-query
      uuid:  spec-compiler-cortex-query-v1-0000-0001
      description: >
        CORTEX_QUERY_SEAM implementation. Queries Cortex at :3748 before any
        generation. Read-only. Non-fatal on unreachability — fallback assume_empty.
        preflight() runs all queries in parallel. Returns skipGeneration signal.
      exports:
        - "preflight(opts: PreflightOpts) → PreflightResult"
        - "queryProject(name: string) → ProjectResult"
        - "queryFiles(project: string) → FilesResult"
        - "queryGaps(path: string, severity?: string) → GapsResult"
        - "querySeams(name: string) → SeamsResult"
        - "queryMemory(q: string) → MemoryResult"
        - "ping() → CortexHealth"
      gate_pipeline:
        - "GATE-CQ-001: moduleName → GET /api/projects → ProjectResult"
        - "GATE-CQ-002: moduleName → GET /api/files → FilesResult"
        - "GATE-CQ-003: moduleName → GET /api/gaps → GapsResult"
        - "GATE-CQ-004: moduleName → GET /api/memory?table=seam_records → SeamsResult"
        - "GATE-CQ-005: moduleName → POST /api/memory/search → MemoryResult"
        - "GATE-CQ-006: all above in parallel → preflight decision → PreflightResult"
      behavioral_contracts:
        - All preflight queries run in parallel. No serial waterfall.
        - Never writes to Cortex. Read-only through this seam.
        - skipGeneration true only if existingFiles present AND no high-severity gaps.
        - Cortex unreachability is non-fatal — returns assume_empty + logs gap.
      error_paths:
        - timeout → {ok:false, code:CORTEX_UNREACHABLE} → fallback assume_empty
        - ECONNREFUSED → same as timeout
        - invalid JSON from Cortex → {ok:false, code:PARSE_ERROR} → fallback

    # ── CONTROL LAYER (TO BE BUILT) ───────────────────────────────────────────

    - id:    MOD-INVARIANTS
      name:  invariants-engine
      uuid:  mod-invariants-v1-0000-0001
      description: >
        STATE VALIDITY KERNEL. Hard guarantees about graph correctness after
        every build and every mutation. Violations are typed events — not
        exceptions. Feeds gap engine, reply engine, and ring buffer.
        Blocks tier contract if critical violations exist.
      exports:
        - "check(graph: KnowledgeGraph) → ViolationReport"
        - "checkNode(node: KGNode, graph: KnowledgeGraph) → Violation[]"
        - "checkEdges(edges: Edge[], nodes: Map) → Violation[]"
        - "checkPropagation(graph: KnowledgeGraph) → Violation[]"
      gate_pipeline:
        - "GATE-INV-001: graph.nodes → check every key === node.id (INV-001)"
        - "GATE-INV-002: graph.edges → check every from/to exists in nodes (INV-002/003)"
        - "GATE-INV-003: all nodes → check 0 <= genReadiness <= 1 (INV-004)"
        - "GATE-INV-004: BLACK nodes → check genReadiness === 0.0 (INV-005)"
        - "GATE-INV-005: cycle groups → check all members equal genReadiness (INV-006)"
        - "GATE-INV-006: getBuildOrder() → verify topological validity (INV-007)"
        - "GATE-INV-007: all nodes → check node not in own blastRadius (INV-008)"
        - "GATE-INV-008: assemble ViolationReport → emit invariants.check.complete"
      behavioral_contracts:
        - Every invariant has a unique ID (INV-001 through INV-008+).
        - Violations are severity-tagged: info / warn / critical.
        - Critical violations block tier contract execution.
        - check() is synchronous and pure — no side effects.
        - Invariant set is versioned. Adding an invariant is a minor version bump.
        - check() always returns a report, never throws.
      error_paths:
        - graph is null or malformed → return {violations: [{severity:critical, message:...}]}
        - node missing from blastRadius data → INV-008 skipped with info violation
      deps:
        - name: siso-core
        - name: kg-builder

    - id:    MOD-GAP-FIELD
      name:  gap-field-engine
      uuid:  mod-gapfield-v1-0000-0001
      description: >
        SEMANTIC DELTA LAYER. Converts invariant violations + missing structure
        into structured semantic gaps with estimated token cost.
        Gaps are derived, never directly authored.
        totalGapWeight is the token budget forecast for this build.
      exports:
        - "computeGapField(graph: KnowledgeGraph, violations: ViolationReport) → GapField"
        - "estimateTokenCost(gapField: GapField) → TokenBudgetForecast"
        - "getGapsByType(gapField: GapField, type: GapType) → Gap[]"
        - "getBlockingGaps(gapField: GapField) → Gap[]"
      gate_pipeline:
        - "GATE-GF-001: ViolationReport.critical → structural gaps (type:execution)"
        - "GATE-GF-002: KGNode.isBlack → structural gaps (type:structural)"
        - "GATE-GF-003: node.specDepth < tier threshold → semantic gaps (type:semantic)"
        - "GATE-GF-004: cycle nodes → behavioral gaps (type:behavioral)"
        - "GATE-GF-005: SKIP nodes → execution gaps (type:execution)"
        - "GATE-GF-006: compute severity, blockers, scope per gap"
        - "GATE-GF-007: estimate token cost per gap (base cost * severity * blast)"
        - "GATE-GF-008: assemble GapField → emit gap.field.computed"
      behavioral_contracts:
        - Gaps are derived only from KG state and violation reports. Never authored.
        - estimatedTokenCost per gap = baseCost * severity * (1 + blastRadius.length * 0.1).
        - totalGapWeight = sum of all gap severities weighted by blast radius.
        - GapField is immutable after computeGapField(). Recompute on mutation.
        - Gaps propagate through edges: a blocked dep creates execution gaps downstream.
      error_paths:
        - empty graph → return {gaps:[], totalGapWeight:0, estimatedTokenCost:0}
        - violation with no nodeId → create graph-level gap with scope:global
      deps:
        - name: kg-builder
        - name: invariants-engine

    - id:    MOD-REPLY-ENGINE
      name:  reply-engine
      uuid:  mod-replyengine-v1-0000-0001
      description: >
        EXECUTION SCHEDULER. Decides what runs next. No interpretation —
        only scheduling. Input: tier decisions + readiness distribution + gap
        severity. Output: ExecutionPlan with run/defer/skip/block buckets.
        Deterministic given same inputs.
      exports:
        - "plan(tierMap: TierMap, gapField: GapField, graph: KnowledgeGraph) → ExecutionPlan"
        - "selectReadyNodes(graph: KnowledgeGraph, tierMap: TierMap) → KGNode[]"
        - "prioritize(nodes: KGNode[], gapField: GapField) → KGNode[]"
      gate_pipeline:
        - "GATE-RE-001: BLOCKED + MISSING nodes → block bucket"
        - "GATE-RE-002: SKIP nodes → skip bucket"
        - "GATE-RE-003: T0/T1/T2 nodes with open blocking gaps → defer bucket"
        - "GATE-RE-004: T0/T1/T2 nodes ready to run → run bucket (sorted by buildOrder)"
        - "GATE-RE-005: prioritize run bucket by readiness desc then blast radius desc"
        - "GATE-RE-006: assemble ExecutionPlan → emit reply.plan.ready"
      behavioral_contracts:
        - plan() is pure and deterministic. Same inputs → same plan.
        - run bucket is sorted: highest readiness first, then highest blast radius.
        - A node with any blocking gap is deferred, not blocked.
        - BLOCKED nodes go to block bucket only if genReadiness === 0.0 or invariant critical.
        - ExecutionPlan is the only input to execution gates. Gates do not query KG directly.
      error_paths:
        - empty tierMap → return {run:[],defer:[],skip:[],block:[]}
        - node in run bucket has no tier decision → defer with reason:no_tier_decision
      deps:
        - name: tier-contract
        - name: gap-field-engine
        - name: kg-builder

    - id:    MOD-RING-BUFFER
      name:  ring-buffer
      uuid:  mod-ringbuffer-v1-0000-0001
      description: >
        CAUSAL MEMORY LAYER. Bounded circular buffer of state transition events.
        Stores every mutation: node, field, fromValue, toValue, causedBy.
        Enables delta debugging, replay slicing, causal tracing, rollback simulation.
        Fixed capacity — oldest events evicted when full.
        Emits runtime.mutation to trigger re-propagation (the ↺).
      exports:
        - "record(event: MutationEvent) → void"
        - "replay(fromSeq?: number, toSeq?: number) → MutationEvent[]"
        - "diff(snapshotA: Snapshot, snapshotB: Snapshot) → StateDelta"
        - "snapshot() → Snapshot"
        - "causalChain(nodeId: string) → MutationEvent[]"
        - "rollbackSimulate(nodeId: string, toValue: any) → SimulatedState"
      gate_pipeline:
        - "GATE-RB-001: mutation event arrives → append to circular buffer"
        - "GATE-RB-002: buffer at capacity → evict oldest, emit buffer.capacity.reached"
        - "GATE-RB-003: record complete → emit buffer.event.recorded"
        - "GATE-RB-004: replay requested → emit events in seq order → buffer.replay.complete"
        - "GATE-RB-005: snapshot requested → copy current buffer state → buffer.snapshot.taken"
        - "GATE-RB-006: causalChain(nodeId) → filter by nodeId + causedBy chain → return slice"
      behavioral_contracts:
        - Capacity is fixed at construction. Default 1000 events.
        - Eviction is FIFO — oldest events removed first.
        - replay() returns events in seq order, never out of order.
        - record() is synchronous. Never blocks.
        - causalChain() follows causedBy links transitively up to buffer window.
        - snapshot() is a deep copy — mutations after snapshot do not affect it.
        - ring-buffer never writes to Cortex directly — writeback module handles that.
      error_paths:
        - fromSeq > toSeq in replay → return empty array, not error
        - causalChain with unknown nodeId → return empty array
        - record with malformed event → log warning, skip record (never throw)
      deps:
        - name: siso-core

  # ── SCHEMAS ─────────────────────────────────────────────────────────────────

  schemas:

    - id:    KGNode
      fields:
        id:                   string
        name:                 string
        kind:                 NodeKind
        uuid:                 string
        description:          string
        specDepth:            float
        effectiveSpecDepth:   float
        generationReadiness:  float
        confidence:           Confidence
        isBlack:              boolean
        blastRadius:          NodeRef[]
        gaps:                 Gap[]
        deps:                 DepRef[]
        exports:              string[]
        gatePipeline:         string[]
        behavioralContracts:  string[]
        errorPaths:           string[]

    - id:    TierDecision
      fields:
        tier:         string
        action:       string
        label:        string
        reason:       string
        readiness:    float
        nodeId:       string
        requiresLLM:  boolean
        emits:        string[]

    - id:    ViolationReport
      fields:
        violations:     Violation[]
        criticalCount:  number
        warnCount:      number
        infoCount:      number
        checkedAt:      number

    - id:    Violation
      fields:
        invariantId:  string
        nodeId:       string
        edgeId:       string
        severity:     string
        message:      string

    - id:    GapField
      fields:
        gaps:               Gap[]
        totalGapWeight:     float
        estimatedTokenCost: number
        gapsByType:         object
        computedAt:         number

    - id:    Gap
      fields:
        gapId:              string
        type:               string
        nodeId:             string
        severity:           float
        blockers:           string[]
        scope:              string
        estimatedTokenCost: number

    - id:    ExecutionPlan
      fields:
        run:    NodeRef[]
        defer:  NodeRef[]
        skip:   NodeRef[]
        block:  NodeRef[]

    - id:    MutationEvent
      fields:
        mutationId:   string
        seq:          number
        nodeId:       string
        field:        string
        fromValue:    any
        toValue:      any
        causedBy:     string
        ts:           number

    - id:    TokenBudgetForecast
      fields:
        estimatedTokens:  number
        confidence:       float
        riskFactors:      string[]
        breakdown:        object
