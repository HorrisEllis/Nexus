spec:
  meta:
    name:        request-handler
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-request-handler-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      The constitutional choke point. Single entry for every request.
      No bypasses. No exceptions. No special cases.
      Every bypass is future technical debt.
      Phase A: should we act? Phase B: how? Phase C: reflect. Phase D: learn.

  phases:
    A_constitutional:
      steps: [intent extraction, goal graph, constitution check, cost analysis]
      outputs: [ALLOW, DEFER, DENY, CLARIFY, UNRESOLVED]
      note: "Never assume. CLARIFY if intent unclear."

    B_execution:
      steps: [grammar engine, SNR filter, memory synthesis, RAID selection, execute]
      note: "Invariants first. Patterns second. AI last."

    C_reflection:
      steps: [outcome analysis, goal advancement check, friction accounting]
      question: "Was this worth doing?"
      note: "Not logging. Judgment."

    D_learning:
      steps: [memory update, crystallisation, gap registration, pattern reinforcement]

  states:
    RESOLVED:               "completed — constitutionally aligned, stable, high confidence"
    DEFERRED:               "timing wrong or conflicts with higher goal"
    DENIED:                 "violates constitution or invariants — hard stop"
    CLARIFICATION_REQUIRED: "intent unclear — never assume, always ask"
    HELD:                   "enough to know we should not act yet, not enough to know what to do. preserved, not collapsed."
    UNRESOLVED:             "insufficient signal. no guessing. escalate or query."

  resolution_ordering:
    note: "Speed is LAST. Not ignored — last."
    order:
      1: "Constitutional alignment (hard constraint)"
      2: "Goal alignment (intent fidelity)"
      3: "System stability impact"
      4: "Information completeness"
      5: "Cost (time / compute / complexity)"

  invariant:
    ALL_REQUESTS_FLOW_THROUGH_HANDLER: FATAL
    note: >
      No subsystem may invoke provider, agent, memory write,
      or module execution without a request context.
      Everything gets a Request ID.
      Everything becomes traceable.
      Without this, Constitutional AI can be bypassed.

  uncertainty_principle:
    wrong:   "uncertainty → force resolution"
    correct: "uncertainty → preserve → evaluate → resolve correctly or HOLD"
    note:    "HELD prevents systemic hallucinated certainty"

  files:
    - lib/request-handler.js
    - lib/constitutional-ai.js
    - lib/reflection.js

  phase: 9
