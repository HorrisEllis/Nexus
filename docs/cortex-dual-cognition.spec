spec:
  meta:
    name:     cortex-dual-cognition
    version:  1.0.0
    uuid:     nexus-cortex-dual-cognition-v1-0000-2026-0627-jamesbrooks-001
    status:   active
    purpose: >
      Cortex is the brain. Intelligence is the nervous system.
      Two cognitive modes wired from what already exists in Cortex.
      Co-pilot accesses both via tools — it does not contain the cognition.

      INTUITION  — fast, associative, pattern-first.
                   BEP patterns + crystal lattice + SNR filter + liminal space.
                   No model. Answers from what the system already knows.
                   Source: what's crystallised.

      MASTERMIND — strategic, predictive, causal.
                   Compound effects + bidirectional causal chains +
                   counterfactual (what-if) + confidence scoring +
                   predictive gap engine + semantic layer.
                   Source: what the system can derive from evidence.

      ADVERSARIAL probes both. Contradiction between the two = gap.

      SNR is the compression engine.
      Tokens ∝ unresolved meaning. Only what can't be resolved locally reaches AI.

  audit:
    # What exists vs what needs building
    ALREADY_EXISTS:
      - cortex/intelligence/index.js       # BEP pattern engine, failure taxonomy, reuse index
      - lib/cfr/graph.js                   # causal graph, ancestors/descendants, bidirectional
      - lib/causal/compound.js             # ripple/wave/tidal compound effect classification
      - lib/cfr/sigma.js                   # sigma computation per event
      - lib/sigma-writer.js                # sigma producer, writes sigma_records
      - cortex/core/raid/snr-filter.js     # invariant-first, SNR, compression, confidence
      - lib/meta/topo-kernel/              # SNR engine + SISO bus
      - cortex/versionium/                 # causal version control, artifact integrity
      - cortex/liminal-space/              # five boundary membranes, focal points
      - lib/causal/anomaly.js              # anomaly classification, 6 types, severity
      - lib/cfr/delta.js                   # tension/friction/slope transition physics

    NEEDS_WIRING:
      - cortex/intelligence/intuition.js   # NEW: INTUITION faculty — wires existing tools
      - cortex/intelligence/mastermind.js  # NEW: MASTERMIND faculty — wires existing tools
      - cortex/intelligence/prediction.js  # NEW: Predictive gap engine from precursors
      - cortex/intelligence/dedup.js       # NEW: Dedup table — repeated events ref original
      - lib/cfr/integrity.js               # NEW: File integrity check at boot + on change

    NEEDS_BUILDING:
      - cortex/intelligence/counterfactual.js  # What-if / if-then prediction
      - Relational field query surface          # Unified: CFR graph + JAA + patterns queryable

  INTUITION:
    what: >
      Fast faculty. Reads crystallised knowledge. No model.
      Returns answer or null within 50ms.
    reads:
      - JAA: bep_patterns (crystallised = true)
      - JAA: user_model_hypotheses (confidence > 0.7)
      - JAA: sigma_records (last 60s rolling)
      - SNR filter: invariant coverage check
      - Liminal space: focal points (boundary conditions)
      - Crystal lattice: resonance-weighted pattern graph
    answers:
      - Known fault classes: return invariant fix deterministically
      - Pattern precursors: "this event sequence has preceded failure N times"
      - High-confidence hypotheses: user behavior predictions
      - Low sigma (<0.3): "system nominal, no anomaly"
    confidence:
      below_80_pct: return null → MASTERMIND takes over
      below_80_pct_user_response: ask clarifying question before answering
    file: cortex/intelligence/intuition.js

  MASTERMIND:
    what: >
      Strategic faculty. Derives from evidence. Slower but deeper.
      Pattern recognition + strategy + prediction engine.
      Uses resonance, confidence scoring, causal chaining.
    reads:
      - CFR graph: bidirectional causal chains (ancestors + descendants)
      - Compound effects: ripple/wave/tidal classification
      - Pattern precursors: what follows this event type historically
      - Counterfactual engine: what-if / if-then scenarios
      - Semantic layer: what the event MEANS in system context
      - Confidence scoring: aggregate confidence across all sources
    produces:
      - Predicted next gap (from precursor patterns)
      - Causal chain narrative (A caused B which caused C)
      - Counterfactual: "if X had not happened, Y would not have occurred"
      - Strategic recommendation: "to prevent next occurrence: Z"
      - Confidence score: 0-1 across all evidence
    confidence_gate:
      below_80: flag response with confidence score, note what's missing
      below_80_user: "I'm N% confident — I need more context on X before answering"
    file: cortex/intelligence/mastermind.js

  PREDICTION:
    what: >
      Reads crystallised precursor patterns.
      Predicts what gap will open next based on current event sequence.
      Opens predictive gaps before the failure happens.
    algorithm:
      1. Read last 20 events from event_log
      2. For each crystallised precursor pattern: does current sequence match?
      3. If match confidence > 0.7: open predictive_gap with "predicted" status
      4. Log to bep_predictions table with confidence + causal chain
    file: cortex/intelligence/prediction.js

  DEDUP:
    what: >
      Repeated patterns, gaps, events, faults, errors — logged as reference
      to the original. Original is fully detailed with cause, effect, reason.
      Duplicates carry: original_uuid, similarity_score, ts, context_delta.
      This compresses the ledger and makes patterns visible as patterns not noise.
    original_record:
      uuid:         permanent id
      cause:        what triggered this
      effect:       what it produced
      reason:       why it happened (from pattern engine + causal graph)
      causal_chain: full bidirectional chain
      conditions:   system state when it occurred
    duplicate_record:
      original_uuid: reference to first occurrence
      similarity:    0-1 score
      ts:            when this recurrence happened
      delta:         what was different this time
    file: cortex/intelligence/dedup.js

  INTEGRITY:
    what: >
      File integrity check. Sigma detection for codebase drift.
      Versionium already tracks artifacts. This adds:
      - Boot-time hash check of all .js files vs known-good baseline
      - Delta type: FILE_MODIFIED | FILE_ADDED | FILE_DELETED | HASH_MISMATCH
      - Sigma detection: abnormal rate of file changes = high sigma event
      - Baseline deviation from established runtime behavior
    metrics:
      - files checked per boot
      - hash mismatches
      - change rate (files/hour)
      - sigma per change type
    file: lib/cfr/integrity.js

  COUNTERFACTUAL:
    what: >
      What-if / if-then engine.
      Given current system state, asks:
      - "If guardian had not restarted, would this gap have opened?"
      - "If ollama had been online, what would RAID have routed to?"
      - "What would have happened if this pattern had been caught 5 events earlier?"
      Used by MASTERMIND to find gaps preemptively.
    approach:
      - Bidirectional causal chain walk from any event
      - Remove one node and re-simulate downstream effects
      - Compare actual chain vs counterfactual chain
      - Delta = the gap the counterfactual would have prevented
    file: cortex/intelligence/counterfactual.js

  RELATIONAL_FIELD:
    what: >
      Every component, hook, wire, gap, pattern, event — as a queryable graph.
      Not a new database. A query layer over what already exists:
      - CFR graph (causal edges)
      - JAA tables (all facts)
      - Component registry (declared topology)
      - Pattern engine (crystallised connections)
      New connections between systems form a new pathway entry in the field.
      Every new pathway is logged to: interaction_contracts, CFR graph, ledger.
    query_surface:
      GET /api/field/nodes          → all registered components
      GET /api/field/edges          → all wires + causal edges + patterns
      GET /api/field/path?from=X&to=Y → shortest/strongest causal path
      GET /api/field/new-pathways    → connections formed in last N hours
    file: cortex/intelligence/relational-field.js (thin query layer)

  HTTP_ROUTES:
    # Added to cortex admin-server
    - GET /api/intelligence/intuition?q=<text>   → INTUITION answer or null
    - GET /api/intelligence/mastermind?q=<text>  → MASTERMIND analysis
    - GET /api/intelligence/predict               → next predicted gaps
    - GET /api/intelligence/counterfactual?event=<uuid>
    - GET /api/intelligence/confidence?q=<text>  → aggregate confidence score
    - GET /api/field/nodes
    - GET /api/field/edges
    - GET /api/field/new-pathways

  CO_PILOT_ACCESS:
    # Co-pilot uses these as tools, does not contain the logic
    tools:
      - GET /api/intelligence/intuition   → fast answer
      - GET /api/intelligence/mastermind  → strategic analysis
      - GET /api/intelligence/predict     → upcoming gaps
      - GET /api/intelligence/confidence  → confidence score for response
    confidence_gate:
      before_any_user_response: check confidence
      if_below_80: append to response "I'm N% confident — {what's missing}"
      if_below_50: ask clarifying question instead of answering

  SNR_COMPRESSION:
    what: >
      SNR filter already does invariant-first resolution.
      Enhancement: use Cortex memory first before calling any model.
      Compression engine: only what can't be resolved from memory reaches AI.
      Tokens ∝ unresolved meaning.
    sequence:
      1. Check invariants (SNR filter — zero tokens)
      2. Check crystallised patterns (BEP engine — zero tokens)
      3. Check Cortex memory: bep_patterns, cortex_memory, reuse_index
      4. Check confidence: if > 0.8, answer from memory
      5. Check liminal space: is this a boundary condition?
      6. Only then: call MASTERMIND (may use Ollama)
      7. Log resolution path + tokens used
    goal: 80% of requests resolved without any model call

  DELTA_TYPES:
    PERFORMANCE:
      LATENCY_SPIKE:    response time > 2σ from baseline
      THROUGHPUT_DROP:  events/s < 50% of baseline
      MEMORY_PRESSURE:  JAA table growth rate > 2× normal
    BEHAVIORAL:
      PATTERN_BROKEN:   established pattern no longer holds
      INVARIANT_DRIFT:  previously true invariant now uncertain
      SIGMA_SPIKE:      sigma > 0.5 for > 60s
    FILE:
      FILE_MODIFIED:    hash mismatch from baseline
      FILE_ADDED:       new file not in baseline
      FILE_DELETED:     file removed from baseline
    CAUSAL:
      NEW_PATHWAY:      two systems interacted for first time
      PATHWAY_LOST:     previously active wire went silent
      PRECURSOR_MATCH:  current sequence matches failure precursor

  PHASES:
    - id: 1
      name: cortex/intelligence/intuition.js
      status: next
      what: Wire BEP patterns + SNR filter + liminal + crystal lattice as INTUITION faculty
      deps: [cortex/intelligence/index.js, snr-filter, liminal-space]

    - id: 2
      name: cortex/intelligence/mastermind.js
      status: pending
      what: Wire CFR graph + compound effects + prediction as MASTERMIND faculty
      deps: [lib/cfr/graph.js, lib/causal/compound.js, phase-1]

    - id: 3
      name: cortex/intelligence/prediction.js
      status: pending
      what: Predictive gap engine from crystallised precursors
      deps: [bep_patterns, phase-2]

    - id: 4
      name: cortex/intelligence/dedup.js
      status: pending
      what: Dedup table — repeated events reference original with delta
      deps: [JAA, CFR graph]

    - id: 5
      name: lib/cfr/integrity.js
      status: pending
      what: File integrity check + delta types
      deps: [sigma-writer, versionium]

    - id: 6
      name: cortex/intelligence/counterfactual.js
      status: pending
      what: What-if / if-then prediction engine
      deps: [CFR graph, compound.js, phase-3]

    - id: 7
      name: Confidence gate in co-pilot
      status: pending
      what: Below 80% confidence → ask user. Expose confidence on all responses.
      deps: [phase-1, phase-2]

    - id: 8
      name: HTTP routes + relational field query surface
      status: pending
      deps: [all above]
