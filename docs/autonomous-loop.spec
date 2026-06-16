spec:
  meta:
    name:        autonomous-loop
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-autonomous-loop-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Ollama as the orchestrator brain. Not a tool called by orchestrator —
      the reasoning engine that drives decisions. Orchestrator provides
      structure. Ollama provides thought.
      Fallback agent receives full context. Continuity maintained.
      Nothing lost between attempts. Loop until resolved or human required.

  loop:
    1: "Orchestrator has task"
    2: "Ollama reasons — RAID routes — lattice logs decision"
    3: "Outcome evaluated"
    4: "Works → reinforce → continue"
    5: "Fails → rewind → inject context → next approach"
    6: "Stalls → diagnostic engines → self-heal isolated"
    7: "Exhausted → escalate to next agent with full context"
    8: "Agent tries — logs — rewinds — or escalates further"
    9: "Solution found or human required"

  loop_contract:
    required_for_every_loop:
      goal:           "what are we trying to achieve?"
      budget:         "time limit, compute limit, token limit"
      boundary:       "what may NOT be written or changed"
      exit_condition: "what does done look like? what does stable look like?"
    note: >
      Without Goal + Budget + Boundary + Exit, autonomous systems drift.
      No exceptions. No implicit loops. No open-ended autonomy.
    example:
      goal:           "monitor module health"
      budget:         "5 minutes"
      boundary:       "no writes"
      exit_condition: "health score stable for 3 consecutive checks"

  continuity:
    principle: "Nothing lost between attempts"
    mechanism: "lattice logs every decision and outcome"
    context_injection: "fallback agent receives everything — no cold starts"

  consistency:
    principle: "Same invariants apply to every agent in chain"
    enforced:  "RAID laws, axioms, boundary constraints"

  models:
    primary:  "qwen2.5-coder:1.5b — SEAM and local reasoning"
    general:  "mistral:7b-instruct-q4_K_M — complex reasoning"
    fallback: "NCP providers via guardian — claude last"

  phase: 13
