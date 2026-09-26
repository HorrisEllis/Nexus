spec:
  meta:
    name:        guardian
    version:     3.6.2
    foundation:  nexus-system-foundation@1.0.0
    port:        7820
    uuid:        nexus-guardian-v3-0000-2026-0615-jamesbrooks-001
    purpose: >
      The AI engine of NEXUS. Guardian is the only system that touches
      AI providers. Everything else requests work through Guardian.
      NCP connects browser tabs. SEAM compresses intent before sending.
      No API keys. No external inference calls. Browser tabs only.

  core:
    schemas:
      - Job:        "{ uuid, command, prompt, provider, status, result, gapScore, ts }"
      - NCPChannel: "{ provider, tabId, connected, lastSeen, busy }"
      - SeamChunk:  "{ id, specId, tier, prompt, context, gateScore, status }"
      - SeamResult: "{ chunkId, text, provider, durationMs, gapScore, truncated }"
    axioms: [AX-001, AX-002, AX-007]
    constants:
      NCP_HB_MS:         8000
      NCP_RECONNECT_MS:  3000
      SEAM_MAX_CHUNK_TOKENS: 800
      SEAM_MAX_T3_TOKENS:    2000
      OLLAMA_SEAM_MODELS:    "[qwen2.5-coder:1.5b, mistral:7b-instruct-q4_K_M]"
      RAID_CLUSTERS:         "[code, spec, data, diagnostic, analysis, vision, research, hostile, forge]"

  events:
    emits:
      - "guardian.booted"
      - "guardian.job.queued"
      - "guardian.job.dispatched"
      - "guardian.job.complete"
      - "guardian.job.failed"
      - "guardian.ncp.connected"
      - "guardian.ncp.disconnected"
      - "guardian.tab.needed"
      - "guardian.seam.chunk_sent"
      - "guardian.seam.chunk_passed"
      - "guardian.seam.chunk_failed"
    handles:
      - "cortex.raid.decided → dispatch to chosen provider"
      - "HEAL_REQUESTED      → forge.patch if applicable"

  ncp_providers:
    description: >
      All AI inference goes through browser tabs via Tampermonkey userscripts.
      No API keys. No direct AI calls from Node.js.
    providers:
      - id: claude
        url: "https://claude.ai"
        userscript: "userscript-claude.js"
        version: "10.1.0"
        strengths: [complex_reasoning, code_quality, nuance, long_context]

      - id: chatgpt
        url: "https://chatgpt.com"
        userscript: "userscript-chatgpt.js"
        version: "9.1.0"
        strengths: [token_efficiency, grounded, hostile_testing, structured_output]

      - id: gemini
        url: "https://gemini.google.com"
        userscript: "userscript-gemini.js"
        version: "1.0.0"
        strengths: [vision, ui_analysis, image_understanding, multimodal, speed]

      - id: perplexity
        url: "https://perplexity.ai"
        userscript: "userscript-perplexity.js"
        version: "1.0.0"
        strengths: [real_world_facts, citations, web_search, research, grounded]

      - id: ollama
        url: "http://127.0.0.1:11434"
        note: "Local. No tab needed. Direct HTTP from Node.js."
        models:
          seam:    "qwen2.5-coder:1.5b   (~1GB VRAM, GTX 1650 primary)"
          general: "mistral:7b-instruct-q4_K_M  (~4GB VRAM, fills card)"
        strengths: [local, private, free, code, spec]

  raid_routing:
    description: >
      RAID decides which provider handles each job.
      Nine clusters. Intent-matched. Ollama always first.
      Claude always last (reserve, highest quality).
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

  seam_pipeline:
    description: >
      Structural Emergence with Autonomous Mechanism.
      Compresses intent before sending to AI.
      T0/T1: deterministic scaffold, zero tokens.
      T2: AI fills genuine logic gaps only.
      T3: complex reasoning, larger context.
    tiers:
      T0: "Structure emission. Directory tree, empty files. Zero tokens."
      T1: "Scaffold emission. Typed stubs, gate stubs. Zero tokens."
      T2: "Logic gaps. Sent to qwen2.5-coder:1.5b. Max 800 tokens."
      T3: "Complex reasoning. Sent to mistral or NCP. Max 2000 tokens."
    gate_detector:
      axes: [truncation, sigma, delta]
      retry_strategies: [resend-with-report, split-chunk, forensic]

  command_index:
    status: DONE   # verified 2026-09-03 — GET /commands live, real source-extraction from guardian/server.js's own literal dispatch code (guardian/lib/command-index-extract.js). 50 real top-level commands + 14 named sub-router prefixes (19 real nested checks honestly disclosed as unresolved, not silently folded into the count). tests/modules/guardian-command-index.test.js, 9/9 passing, self-verifying against a fresh re-extraction every run.
    spec: "docs/command-index-per-system.spec"
    served_at: "GET /commands"
    file: "guardian/lib/command-index-extract.js"
    note: >
      This block's own routes:/handshake: lists below are still
      hand-maintained and confirmed stale (4 routes declared in this
      block's own format vs 50 real matched + 19 unresolved-nested in
      the live-extracted index, measured 2026-09-03 by tests/modules/
      guardian-command-index.test.js's own real diff). GET /commands is
      now the real, non-drifting source; replacing this block's own
      routes:/handshake: lists to point at it (rather than duplicating
      them by hand) is real, separate follow-up, not done in this pass.

  routes:
    internal:
      - "GET  /health"
      - "GET  /contract"
      - "GET  /events (SSE)"
    external:
      - "GET  /channel?provider=&tabId=  (NCP SSE — userscripts connect here)"
      - "POST /result                    (NCP — userscripts post AI responses)"
      - "POST /heartbeat                 (NCP — userscript keepalive)"
      - "POST /command                   (dispatch a job)"
      - "GET  /jobs/:id                  (job status)"
      - "GET  /providers                 (NCP provider health)"
      - "GET  /capabilities              (all providers + strengths)"
      - "GET  /userscripts/:name         (serve userscript files)"

  handshake:
    components:
      - id: "guardian.dispatch"
        grammar: ["guardian dispatch", "dispatch", "d"]
        route: { method: POST, path: "/api/guardian/dispatch" }
        description: "Dispatch a job to the best available AI provider"
        params: [{ name: prompt, type: string, required: true },
                 { name: provider, type: enum, values: [auto, ollama, claude, chatgpt, gemini, perplexity] }]

      - id: "guardian.providers"
        grammar: ["guardian providers", "providers", "prov"]
        route: { method: GET, path: "/api/guardian/providers" }
        description: "NCP provider connection status"

      - id: "guardian.seam"
        grammar: ["guardian seam", "seam"]
        route: { method: POST, path: "/api/guardian/seam" }
        description: "Run SEAM pipeline on a spec chunk"
        params: [{ name: chunk, type: string, required: true }]

      - id: "guardian.ollama.query"
        grammar: ["guardian ollama", "ollama", "ol"]
        route: { method: POST, path: "/api/guardian/ollama" }
        description: "Query Ollama directly (qwen2.5-coder:1.5b)"
        params: [{ name: prompt, type: string, required: true },
                 { name: model, type: string, default: "qwen2.5-coder:1.5b" }]

  ui:
    type: "panel in nexus-shell + NEXUS tab in userscripts"
    hotswap: true
    panels:
      - "PROVIDERS — NCP connection status, tab health, ollama ping"
      - "JOBS — live job queue, status, provider used, duration"
      - "SEAM — chunk pipeline status, gate scores, retry history"
      - "DISPATCH — manual dispatch panel with provider selector"
