spec:
  meta:
    name:        raid
    version:     6.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-raid-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Provider routing. 9 intent clusters. 5 NCP providers. Ollama always first. Claude always last. Weight table learns from outcomes. _decide() is a pure function — same inputs always produce same decision.

  clusters:
    code:       "ollama → chatgpt → claude"
    spec:       "ollama → claude"
    data:       "ollama → chatgpt → claude"
    diagnostic: "ollama → chatgpt → claude"
    analysis:   "ollama → chatgpt → claude"
    vision:     "gemini → claude"
    research:   "perplexity → chatgpt → claude"
    hostile:    "chatgpt → claude"
    forge:      "ollama → claude"
  invariants:
    LAW_I:   "Ollama always first for non-specialist clusters"
    LAW_III: "Claude always last — reserve, never primary"
