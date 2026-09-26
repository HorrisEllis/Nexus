spec:
  meta:
    name:        cli-reasoning
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-cli-reasoning-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Qwen 0.5b as the CLI reasoning layer.
      Called when grammar engine cannot resolve input.
      Three outcomes: rephrase, gap, correction.
      Agent checks all proposals before anything is registered.
      Cortex first, then outward if necessary.
      Deterministic zone is never touched.
  model:        "qwen2.5:0.5b (~400MB, RAM only, no VRAM)"
  gap_fill_chain:
    1: "cortex — known invariant, crystallised pattern"
    2: "cli-reasoning (Qwen 0.5b) — rephrase or propose"
    3: "agent check — validate before registering"
    4: "guardian NCP — complex reasoning"
    5: "human — failure mode"
  outcomes:
    rephrase:    "maps natural language to existing command, executes"
    gap:         "proposes new component, agent checks, human confirms"
    correction:  "patches existing component, agent checks, human confirms"
  invariants:
    - "Qwen is advisory only — grammar engine resolves, Qwen suggests"
    - "Nothing in deterministic zone touched"
    - "All proposals agent-checked before registration"
    - "Human confirms anything modifying existing components"
    - "If Qwen offline — CLI degrades gracefully, trie still works"
