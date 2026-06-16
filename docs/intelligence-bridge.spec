spec:
  meta:
    name:        intelligence-bridge
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-intelligence-bridge-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Connects the intelligence layer to RAID routing decisions.
      RAID queries intelligence before every decision.
      Outcome fed back after every execution.
      Gaps are open loops — tension builds while open.
      User satisfaction is a training signal.
      Every output teaches the pattern engine.

  before_routing:
    queries:
      - "crystallised patterns for this cluster"
      - "failure precursors active for this fault class"
      - "user model hypotheses for this cluster + provider"
      - "liminal items relevant to this intent"
    returns: "{ patterns, precursors, userHypotheses, liminalItems, weight, recommendation }"
    note:    "advisory only — never overrides RAID, only nudges"

  after_routing:
    logs:    "outcome to event_log for pattern engine"
    updates: "user model hypothesis (successRate, confidence, evidence)"
    failure: "opens raid.routing.failure gap — tension builds while open"
    success: "resolves open failure gap for this fault class"

  satisfaction_signal:
    positive: "logs pattern.training.positive — reinforces path"
    negative: "opens user.dissatisfaction gap with reason — friction builds"
    note:     "unsatisfied users create open loops the system must resolve"

  gaps_as_open_loops:
    principle: "gap opens → tension accumulates → friction builds if unresolved"
    training:  "every output is a signal — satisfied closes loop, unsatisfied keeps it open"

  tests:
    count:  10
    status: "10/10 PASSING"
