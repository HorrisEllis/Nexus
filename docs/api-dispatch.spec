spec:
  meta:
    name:        api-dispatch
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-api-dispatch-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Direct REST API dispatch for guardian. Complements NCP browser tabs.
      When API keys are set, uses direct REST. When not, falls back to NCP.
      Every dispatch logs to chat-logger, runs liminal gap detection,
      updates RAID weights, feeds BDA signals.

  providers:
    chatgpt:
      key:       "OPENAI_API_KEY"
      model:     "OPENAI_MODEL (default: gpt-4o-mini)"
      strengths: [token_efficiency, grounded, hostile_testing, structured_output]

    gemini:
      key:       "GOOGLE_AI_API_KEY"
      model:     "GEMINI_MODEL (default: gemini-1.5-flash)"
      strengths: [vision, ui_analysis, image_generation, multimodal]

    perplexity:
      key:       "PERPLEXITY_API_KEY"
      model:     "PERPLEXITY_MODEL (default: llama-3.1-sonar-small-128k-online)"
      strengths: [research, citations, grounded_facts, web_search]
      note:      "extracts citations from response for structured return"

    claude:
      key:       "ANTHROPIC_API_KEY"
      model:     "ANTHROPIC_MODEL (default: claude-opus-4-6)"
      strengths: [complex_reasoning, code_quality, nuance, long_context]
      note:      "reserve — last in chain, highest quality"

  modes:
    ncp:  "browser tab via Tampermonkey — no API key needed"
    api:  "direct REST — requires API key in environment"
    note: "RAID routes to whichever mode is available. Both can coexist."

  hooks:
    chat_logger:  "logs prompt and response on every dispatch"
    liminal:      "gap detection on every AI response (gapScore)"
    raid:         "recordOutcome() on success and failure"
    bda:          "signal extraction via chat-logger embedding"
