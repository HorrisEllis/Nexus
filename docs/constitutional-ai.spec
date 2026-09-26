spec:
  meta:
    name:        constitutional-ai
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-constitutional-ai-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Phase A of the request handler. Should we act?
      Goal graph, constitution, cost analysis, identity kernel.
      The layer that asks: just because we can, should we?

  goal_graph:
    description: "Every action exists in hierarchy of objectives"
    checks: [stability, memory budget, release state, strategic direction]
    conflict: "surfaces and recommends defer — never silently proceeds"

  constitution:
    USER_AUTONOMY:      "No subsystem removes human authority"
    REVERSIBILITY:      "High-impact actions require rollback path"
    TRUTH_OVER_COHERENCE: "Contradictions trigger investigation not narrative repair"
    EXPLAINABILITY:     "Major actions must be causally reconstructable"

  cost_analysis:
    tracks: [cpu, memory, latency, tokens, human_attention, risk, complexity]
    decision: "benefit/cost not possible/impossible"

  identity_kernel:
    description: "What remains true after 100k patches and 500 module swaps"
    contains: [mission, values, invariants, constitution]
    survives: "every evolution"

  phase: 10
