spec:
  meta:
    name:        nexus-intelligence-system
    version:     0.1.0
    status:      proposed
    uuid:        nexus-intelligence-system-v1-0000-2026-0701-jamesbrooks-001
    axioms:      [§M3, §M4, §A1, §A2, §2.3, LAW_III, §AX-002]
    purpose: >
      The intelligence system is not one module. It is the composition of
      seven existing layers — each doing one thing, none doing another's job —
      wired in a sequence that turns raw events into actionable understanding.

      This spec names that composition, maps what each layer does and doesn't
      do, defines the wire between them, and identifies the three genuine gaps
      that make the whole thing less than the sum of its parts right now.

  the_seven_layers:

    L1_measurement:
      what:   RFR2 delta — pure measurement of event sequences
      does:   S-field (latency z-score), C-field (causal depth z-score),
              throughput change, fractal detection, branch registry
      does_not: judge, threshold, classify — "judgment belongs in the σ layer"
      module: unintegrated/rfr2-nexus/delta/index.js
      status: real, implemented, not yet wired to live NEXUS event stream

    L2_scoring:
      what:   sigma — divergence scoring against a known baseline
      does:   structural + temporal + contextual scoring for any event.
              Produces one number [0,1] — how far this event deviates from
              expected behavior in the current CFR field context.
      does_not: decide what to do about the deviation
      module: lib/cfr/sigma.js
      status: real, running, receives events from cfr/ledger.js

    L3_field:
      what:   CFR field — the live shape of the system's relational state
      does:   maintains coherence/friction/resonance/entropy as a four-number
              snapshot. Provides the contextual axis for sigma scoring.
              Responds to events — friction goes up when handoffs fail,
              coherence goes down when expected events don't arrive.
      does_not: route, decide, remember history beyond the current snapshot
      module: lib/cfr/field.js
      status: real, running, polled by orchestrator and cortex

    L4_memory:
      what:   event ledger + Cortex memory — what happened and what was learned
      does:   event-ledger maintains append-only baseline (what "normal" looks
              like for each event type, used by sigma as comparison baseline).
              Cortex memory (chat_log, conditioning_log, cortex_memory) stores
              what co-pilot learned from each interaction.
      does_not: reason about what it stores — pure persistence
      modules: lib/event-ledger.js, cortex/boot.js /api/memory
      status: real, running — conditioning_log not yet written post-response
              (copilot-system-programmer.spec Phase 4)

    L5_cognition:
      what:   intelligence engine — dual-mode cognition (intuition + analysis)
      does:   INTUITION path: fast, Qwen-based classification of intent and
              cluster. ANALYSIS path: slower, structured 7-layer context
              assembly → mastermind synthesis.
              Neither path makes a routing decision — that's RAID's job.
              Both paths inform RAID's decision with classified context.
      does_not: route, dispatch, store — pure classification and synthesis
      modules: cortex/boot.js → _intuitionAnswer(), _mastermindAnalysis()
      status: real — both as inline functions in cortex/boot.js.
              See cortex-intelligence.spec for the gap between billing and reality.
              The gap is closeable with wiring (Phase 1-2 of that spec).

    L6_simulation:
      what:   RAID simulation engine — pre-commit outcome prediction
      does:   takes _decide()'s output + live context → runs through COS sandbox
              → delta + sigma scores the prediction → enforcement checks 25
              invariants → classifies any faults → recommends commit / fallback /
              escalate. Completes Layer 2 fitness (role_confidence, topological
              proximity, snrTierGate all become real, computed values).
      does_not: override constitutional law (LAW_I, LAW_III), block on
                inconclusive results, affect live state
      module: cortex/core/raid/simulation.js (not yet built — raid-simulation-engine.spec)
      status: proposed

    L7_enforcement:
      what:   COS enforcement — continuous invariant monitoring
      does:   BoundaryIndex continuously monitors 25 invariants across identity,
              causality, time, architecture, hostile-input, context-isolation,
              and execution-model categories. RuntimeGuard asserts point-in-time.
              Both are observers only — they detect, never mutate.
      does_not: route, decide, fix — purely monitors and reports
      module: unintegrated/rfr2-nexus/enforcement/index.js
      status: real, implemented, not yet wired to live event stream

  the_three_genuine_gaps:

    gap_1_measurement_not_wired:
      what: RFR2 delta (L1) and enforcement (L7) are not receiving live events
      impact: fractal detection, S/C-field scoring, and invariant monitoring
              are running against nothing — the modules exist but no producer
              feeds them the event stream they need to process
      fix: wire the event bus (nexus-bus.js) to emit to computeEventDelta()
           and BoundaryIndex on every event. Same pattern as sigma already uses
           (cfr/ledger.js receives events and calls computeSigma()). This is
           wiring, not building. One module, one producer, one bus subscription.

    gap_2_simulation_not_built:
      what: nothing sits between _decide() and dispatch
      impact: every routing decision commits without any pre-check.
              Layer 2 fitness returns 1.0 for everything because the data
              that would make it real (role_confidence from conditioning_log,
              SNR from sigma) exists but nobody reads it into _fitness()
      fix: cortex/core/raid/simulation.js — raid-simulation-engine.spec

    gap_3_cognition_not_synthesizing:
      what: L5's intuition() and mastermind() don't read from L1/L2/L3/L4
            together before answering. They read from whatever was passed to them.
      impact: co-pilot's analysis is as good as what the caller assembled —
              which is currently 8 chat_log entries. The full picture
              (delta trajectory, sigma history, field shape, open gaps,
              conditioning_log) is available but not assembled.
      fix: nexus-query-surface.spec — the query surface assembles L1-L4
           output into one struct. L5 reads that struct. This is the wire
           between the measurement/memory layers and the cognition layer.

  the_wire_sequence:
    description: >
      When functioning as a unified system, the seven layers compose in order:

      1. Event arrives
      2. L1 (delta) measures the event — S-field, C-field
      3. L2 (sigma) scores it against L4's baseline in L3's context
      4. L3 (field) updates based on the event's outcome
      5. L4 (memory) records the event and the sigma score
      6. L5 (cognition) assembles L1-L4 output (via query surface) for synthesis
      7. L5 produces a routing context for RAID: classified cluster, risk level
      8. RAID _decide() uses L5's context + L3's sigma floor (§P97) to decide
      9. L6 (simulation) pre-checks the decision through COS + delta + sigma
      10. L7 (enforcement) confirms no invariants violated
      11. If clean: commit dispatch
      12. Outcome → L4 (conditioning_log) → L2 (baseline update) → closes the loop

    currently: steps 1, 3 (partial), 4 (partial), 5 (partial), 8, 11 run.
               steps 2, 6, 7, 9, 10, 12 don't — the three gaps above.

  duel_mode_cognition:
    description: >
      L5's dual modes serve different needs in the wire sequence:
    intuition:
      when:  fast path — the event needs classification before delta/sigma
             can be assembled, or the answer is urgent
      uses:  L3 (current field state only) + intent pattern matching (Qwen)
      speed: subsecond — runs before full context assembly
      output: cluster classification, risk flag (is sigma already elevated?),
              preferred agent hint (from conditioning_log quick-read)
    analysis:
      when:  full context needed — co-pilot is forming a substantive response,
             or RAID simulation is composing the prediction context
      uses:  L1 (delta trajectory) + L2 (sigma history) + L3 (field shape) +
             L4 (memory + gaps + events) — assembled by query surface
      speed: slower — assembles full QueryResult before synthesizing
      output: structured understanding: what_is_true / what_was_tried /
              what_the_field_says / what_is_uncertain / suggested_next
    mastermind:
      when:  synthesis across a large context — project flow, relationship shape
             analysis, optimization briefing
      uses:  full QueryResult + conditioning_log + fractal detection results
      speed: slowest — not on the critical path of dispatch
      output: narrative synthesis (always labelled: true / tried / uncertain / suggested)

  fault_modes:
    taxonomy: lib/open-loop-taxonomy.patch.js (4 classes: CONSTITUTIONAL, KNOWLEDGE, CAPABILITY, INTEGRITY)
    sources:
      CONSTITUTIONAL: enforcement invariant violations (L7) or axiom violations in COS
      KNOWLEDGE:      L5 cognition classifies a cluster it has no conditioning_log data for
      CAPABILITY:     L2 sigma > 0.6 for proposed agent on this cluster (historic pattern)
      INTEGRITY:      L2 sigma > 0.7 at field level (the autonomous loop halt threshold)
    visibility: >
      Currently: faults are logged and gaps are opened, but nothing surfaces them
      as a coherent fault history. The query surface (nexus-query-surface.spec)
      changes this — `about=guardian` returns the fault class distribution for
      that system as part of QueryResult, ranked by frequency and recency.

  build_order_for_whole_system:
    note: >
      This is the dependency-ordered build path for all seven layers to reach
      full function. Each phase unblocks the next.
    phases:
      "Phase 0 (done)": Nerve pulse events — copilot + ollama heartbeats
      "Phase 1 (done)": Nerve read layer — lib/nerve/index.js
      "Phase 2": Unified query surface — nexus-query-surface.spec
                  → L1-L4 assembled for L5's first time
      "Phase 3": Gap 1 fix — wire event bus to RFR2 delta + enforcement
                  → L1 and L7 receive live events
      "Phase 4": Cognition completion — cortex-intelligence.spec Phase 1-2
                  → L5 reads from the query surface instead of 8 chat_log lines
      "Phase 5": RAID simulation — raid-simulation-engine.spec
                  → L6 built, L2 fitness completed with real values
      "Phase 6": Relationship shape — nexus-relationship-shape.spec
                  → two-subject queries, fractal history, causal root tracing
      "Phase 7": Co-pilot system programmer — copilot-system-programmer.spec
                  → gap 3 fixed: conditioning_log written, system learning begins
      "Phase 8": Optimization service — nexus-optimization-service.spec
                  → flywheel closes: measurement → scoring → simulation →
                    dispatch → outcome → memory → better simulation
