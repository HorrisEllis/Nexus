spec:
  meta:
    name:        copilot-awareness-and-intent-routing
    version:     0.2.0-phasemap
    status:      PHASEMAP 2026-07-30 (v0.2 — chunked + drift-accounted). CA1 built. Co-pilot becomes self-aware (its tools,
                 their edge cases), status-reporting (polls the system + loom),
                 tool-FIRST (looks for a tool before falling back), capability-
                 EXTENDING ("no is not an answer"), and INTENT-ROUTED (perplexity/
                 claude/chatgpt/gemini by strength, configurable). Governed by
                 AXIOMS-v3.1. §8.6 read first — much of the substrate EXISTS.
    uuid:        nexus-copilot-awareness-routing-v0-0000-2026-0730-001

  substrate_verified_2026_07_30:
    tools_registered: "17 agent-tools incl. nexus_status, call_system, diagnose, browser_action — co-pilot's runToolLoop already gets getToolSchemas()."
    routing_exists:   "cortex/core/raid/routing-ir.js buildRoutingIR() — has LAW_I (ollama-first), LAW_III (claude-last-resort), a chain ['ollama','claude','chatgpt']. NOT YET James's intent map."
    intent_exists:    "lib/intent-classifier.js, copilot/intents.js, orchestrator/lib/intent-map.js — intent classification substrate present."
    loom:             "loom (:3752) — component/hook/wire/seam registry + contracts. A status poll can read loom's live wiring."
    lifeline_ask:     "copilot/lifeline.js now offers instead of auto-escalating (askBeforeEscalate) — the tool-first check (CA3) runs BEFORE this offer."
    gap:              "no capability listing tools' EDGE CASES / how-to-use; no capability-EXTEND path; routing chain is not intent-mapped; no multi-account ClearGlass login; no user-facing routing/token config."

  governing_axioms:
    - "§8.6 reuse before build — status tool, routing-ir, intent-classifier all exist; wire/extend, don't rebuild."
    - "§0.4 more optionality — routing + token limits become CONFIG, not hardcode."
    - "§1.2 nothing silently fails — 'no is not an answer' means a gap becomes an explicit capability-extension request, logged, not a dead end."
    - "§10.3 one routing brain — extend routing-ir, don't add a competing router."
    - "§17.5 provenance — every route decision records which agent + why (intent matched)."
    - "§16.2 reads like a story — a status report + a route reason are legible to the user."

  build_chunks:
    note: "§3.1 bottom-up, built + verified + handed over in CHUNKS (James: 'use chunks'). Each chunk is independently testable and shippable; drift is measured at the chunk boundary before the next begins."
    CHUNK_A_self_aware:   # ← COMPLETE 2026-07-30 (CA1+CA2+CA3), 1198/0 —   "CA1 (status) + CA2 (tool awareness) + CA3 (tool-first) — co-pilot knows the system + its own tools and reaches for them first. Ships as a unit: 'co-pilot is self-aware'."
    CHUNK_B_capable:   # ← COMPLETE 2026-07-30 (CA4), 1204/0 —      "CA4 (capability-extend) — 'no is not an answer'. Depends on CHUNK_A (must know it has no tool before extending). Ships as: 'co-pilot extends itself'."
    CHUNK_C_routed:   # ← COMPLETE 2026-07-30 (CA5+CA6), 1215/0 —       "CA5 (intent routing) + CA6 (editable config) — the agent-strength brain, configurable. Ships as: 'co-pilot routes by intent'."
    CHUNK_D_accounts:   # ← BACKEND COMPLETE 2026-07-30 (CA7 registry); UI/login on James machine —     "CA7 (ClearGlass multi-account) — the credential + UI plumbing routing needs. Heaviest; ships last, alone."

  drift_accounting:
    principle: "§13.4 drift is data; untracked drift is the only failure. Each phase declares what could drift and how it's caught. Measured at each CHUNK boundary."
    CA1: "status phrasing drift — isStatusQuery's pattern set is versioned; a missed/false status trigger is observable (the report either fired or didn't). Endpoint list drift — if a system's port/health path changes, its status reads 'offline'; caught by the report naming which systems are down."
    CA2: "tool-note drift — a tool's real behavior drifting from its usage-note is the classic §12.5 spec drift; the note carries a version + the tool's VERSION so a mismatch is detectable."
    CA3: "tool-selection drift — 'a tool exists for this' is a judgment; log every tool-first HIT and MISS so the hit-rate drift is data, not silent (§13.4)."
    CA4: "extension-request drift — an unmet request becoming a gap is logged; if extension requests spike, that's a real signal about a capability hole, not noise."
    CA5: "routing drift — record every route's {intent, agent, why}; a shift in the intent→agent distribution is watched the same way RAID watches decisions (§10.3 one drift model). §0.1 — the chain changes from ['ollama','claude','chatgpt'] today, so the BEFORE is the baseline."
    CA6: "config drift — the routing config is versioned cortex rows (schema-registry pattern); an edit bumps the version, old preserved (§0.3), so behavior change is traceable to a config change."
    CA7: "credential/account drift — account slots are enumerable; a stale/failing account is observable on a route attempt, surfaced not swallowed (§1.2)."



    CA1_status_report:   # ← DONE 2026-07-30, polls health+gaps+loom, 1191/0
      does: "Co-pilot answers 'how are you' by POLLING the system: nexus_status tool + loom's live wiring + open gaps/health. Returns a real status, not a canned 'I don't have context'."
      reuse: "§8.6 — nexus_status tool + diagnose + loom :3752 already expose this; CA1 composes them into a status answer."
      gate: "'how are you' → a real system status (systems online, gaps, health, loom wiring), not a generic reply."
      axioms: [§8.6, §16.2, §17.6]

    CA2_tool_self_awareness:   # ← DONE 2026-07-30, all 17 tools noted, 1198/0
      does: "Co-pilot's context includes its TOOLS, each tool's edge cases + how-to-use (a per-tool 'usage note' registry). It knows what it can do before it answers."
      reuse: "§8.6 — getToolSchemas() exists; CA2 adds a usage/edge-case note per tool + injects a tool digest into the prompt path."
      gate: "co-pilot can name its tools and their edge cases when asked, and picks the right tool for a task."
      axioms: [§8.6, §16.2, §17.5]

    CA3_tool_first:   # ← DONE 2026-07-30, tool-first in system prompt, 1198/0
      does: "Before falling back (to lifeline/ask/guardian), co-pilot LOOKS FOR A TOOL that fulfills the request. Tool-first, fallback-second."
      reuse: "§8.6 — runToolLoop already can call tools; CA3 makes 'is there a tool for this?' the first step, ahead of the lifeline offer."
      gate: "a request a tool can fulfill is fulfilled by the tool, not escalated."
      axioms: [§8.6, §16.1, §10.3]

    CA4_capability_extend:   # ← DONE 2026-07-30, files capability_extension gap, 1204/0
      does: "'No is not an answer': if no tool/agent fulfills a request, co-pilot files a capability-extension request (a gap → module_builder/forge path) instead of refusing."
      reuse: "§8.6 — module_builder tool + gap engine + forge already exist; CA4 routes an unmet request INTO them as an extension request."
      gate: "an unfulfillable request produces a logged capability-extension gap, never a bare 'I can't'."
      axioms: [§1.2, §0.4, §16.5]

    CA5_intent_routing:   # ← DONE 2026-07-30, agent-strength map, 1215/0
      does: "Extend routing-ir with James's INTENT MAP: perplexity=reliable data, claude=large codebases (+WARP/context injected), chatgpt=optimal but 900-token (→ chunking), gemini=coding+adversarial (secondary), claude=last resort. Directable + auto by intent."
      reuse: "§8.6/§10.3 — EXTEND buildRoutingIR (LAW_I/III already there), don't add a competing router. Chunking for chatgpt's 900-token limit already conceptually exists."
      gate: "a data question routes to perplexity; a large-codebase task to claude with WARP+context; an adversarial test to gemini — and the user can override."
      axioms: [§10.3, §17.5, §0.4]

    CA6_routing_config:   # ← DONE 2026-07-30, editable cortex config, 1215/0
      does: "User-facing CONFIG for intent→agent routing, fallback order, token limits, constraints — editable (cortex rows, like the schema registry). Fluid, not hardcoded."
      reuse: "§8.6 — the schema-registry pattern (editable cortex rows) is the model; routing config lives the same way."
      gate: "editing the routing config changes routing behavior without a code change."
      axioms: [§0.4, §2.2, §12.5]

    CA7_clearglass_multi_account:   # ← BACKEND DONE 2026-07-30 (registry+routing); UI gear + live login Electron-side, James-verified. 1223/0
      status: "✓ DONE, real correction 2026-08-29 — the specific UI this
        entry describes ('a gear in the tv-ui') does not exist anywhere
        checked directly: zero references to accounts/account-registry
        anywhere in ui/tv-shell. Either genuinely regressed at some point
        (same class as this session's own real lifeline.js regression)
        or was a different, now-defunct surface. The REAL, currently
        working equivalent: clear-glass/renderer/settings.html's real
        Accounts panel (built this session, verified end-to-end — '+'
        button creates a real account, real rename, real delete, all
        confirmed against actual storage). Different location (ClearGlass
        settings, not a tv-ui gear), same real gate satisfied: a user can
        add a second account for a provider and route to it."
      does: "A gear in the tv-ui to log into MULTIPLE accounts in ClearGlass (app-password style) — so routing to a specific agent uses the right account."
      reuse: "§8.6 — ClearGlass already manages provider tabs (claude/chatgpt/gemini/perplexity); CA7 adds multi-account credential slots + a UI gear."
      gate: "a user can add a second account for a provider and route to it."
      axioms: [§0.4, §5.9]
      note: "UI + credential handling — the heaviest phase; needs its own care. Mapped, sequenced last."

  ordering_rationale: >
    §3.1 bottom-up: CA1 (status — cheapest, pure compose) → CA2 (tool awareness —
    the knowledge) → CA3 (tool-first — uses the awareness) → CA4 (extend when no
    tool — builds on tool-first) → CA5 (intent routing — the agent brain) → CA6
    (config — makes CA5 fluid) → CA7 (multi-account UI — heaviest, last). Each
    builds on the prior. CA1-CA4 make co-pilot self-aware and capable; CA5-CA6
    make routing intelligent and configurable; CA7 is the account plumbing.

  honest_notes:
    - "§0.1 — routing-ir's chain is ['ollama','claude','chatgpt'] TODAY; CA5 changes real behavior, so it's James-verified on boot."
    - "CA7 (multi-account ClearGlass) touches credentials + Electron UI — the sandbox can't test it live; it's mapped carefully and built last."
    - "§17.11 — no 'chatgpt is optimal' claim ships without the 900-token constraint + chunking it depends on being real."
