spec:
  meta:
    name:        gemini-multiagent-coding
    roadmap: 'later — later (declutter 2026-10-09, James: "okay")'
    version:     0.1.0-phasemap
    status:      PHASEMAP 2026-08-07. Mapped before build (§3.3), per James.
    uuid:        nexus-gemini-multiagent-v0-0000-2026-0807-001
    author:      James Brooks
    intent: >
      Optimize Gemini for autonomous multi-agent coding in NEXUS via structured
      prompt-injection: a distinct contract (identity + axioms + scoped toolbox +
      injected framework context) PER AGENT, to prevent context drift and
      hallucination. Plus a tree/parse tool (file structure + cortex recall +
      parse-any-file → plain text, injected into Gemini) and a line/block/seam
      sync tool so agents and NEXUS agree on exactly where code is replaced.
      Structured JSON for agent-to-agent. Must run autonomously.

  gemini_facts:   # James, 2026-08-07 — correct the stale constraints
    context_window_input: "1,000,000–2,000,000 tokens (whole codebases fit)."
    max_output_tokens:    "~65,536 per response (large-file gen / big refactors)."
    note: "lib/agent-router AGENT_CONSTRAINTS has gemini:30000 — STALE. Fix in P1."
    context_caching: "cache static files/system-instructions/framework rules to cut latency + input overhead across multi-turn agent calls."
    structured_outputs: "enforce strict JSON / tool-use schemas for agent-to-agent comms → predictable downstream parsing."

  substrate_already_built:   # §8.6 — extend these; do not rebuild
    - "lib/gemini-toolbox — CONTRACT (framework/role/axioms/edit_format) + synchronized line addressing (numberFile/parseForGemini/verifyEdit/applyEdits, global chunk offsets, all-or-nothing, data/** refusal). THIS IS THE SINGLE-AGENT VERSION of James's blueprint."
    - "lib/gemini-toolbox/routes.js — /gemini-tool HTTP surface (parse/range/verify/contract/apply)."
    - "ui/agents/gemini/code-suite.html — CODE / FIX&VERIFY / CONSTRAINTS&TOKENS tabs."
    - "lib/agent-router AGENT_CONSTRAINTS — per-agent token/chunk/inject scoping (the seed for per-agent contracts)."
    - "lib/chunker — canonical 'cognitive seam' chunker (natural boundaries: yaml/markdown/declarations). Chunk = a document piece."
    - "lib/seam/ — the behavioral-contract system (seam_id, hard/soft axioms, gates, lifecycle). Seam = a contract between components. DIFFERENT layer from chunk."
    - "lib/agent-tools/tools/ — scoped tools already: read-file, query-recall (cortex recall), call-system, diagnose, query-intelligence. The per-agent toolbox draws from these."

  clarifications:   # answers to James's direct questions, recorded
    chunk_vs_seam: "CHUNK = a piece of a file (lib/chunker), for token/context fitting + line addressing. SEAM = a behavioral contract between components (lib/seam, seam_id + axioms + gates). For Gemini code edits use CHUNK-level line addressing, not seam ids. A future P3 can let an edit target a SEAM (a named contract region) as well as a line range."
    emerge_or_cockpit: "Neither owns chunking — lib/chunker is canonical and shared; emerge (SEAM compiler/codegen) and cockpit (command surface) both consume it. Gemini toolbox already uses lib/chunker."

  governing_axioms:
    - "§3.3 map first (this file). §8.6 reuse — extend gemini-toolbox + agent-router + agent-tools, don't rebuild."
    - "§1.1 an edit/agent-output is a CLAIM verified before apply. §1.2 nothing silently fails."
    - "§RAID governs every apply (writes go through RAID, never direct disk). §always: registry + spec addenda + nothing lost."

  # ── DEPENDENCY ORDER ────────────────────────────────────────────────────────
  phases:

    P1_per_agent_contracts:   # ← DONE 2026-08-07. lib/gemini-toolbox/agent-contracts.js — 4 scoped agents, enforcement verified. + chunking consolidated through RAID (lib/chunk-service.js). Suite green.
      priority: FOUNDATION.
      does: >
        Extend gemini-toolbox's single CONTRACT into a REGISTRY of per-agent
        contracts, each = James's blueprint: [AGENT_IDENTITY] name+role,
        [AXIOMS_CONTRACT] rigid rules, [TOOLBOX_COMMANDS] a SCOPED subset of tools
        (not all), [FRAMEWORK_INJECTED_CONTEXT] tech stack + standards. e.g.
        CodeArchitect (schema/API, write_patch+run_tests), Refactorer (read+patch,
        no schema writes), TestWriter (read+run_tests only). getContract(agentId)
        returns the assembled system-prompt block. Fix the stale gemini:30000 →
        real 65536 output / caching flags in AGENT_CONSTRAINTS.
      reuse: "gemini-toolbox CONTRACT + agent-router AGENT_CONSTRAINTS + agent-tools/tools (scope from these)."
      gate:  "getContract('code-architect') returns identity+axioms+scoped-toolbox+context; a tool NOT in an agent's scope is rejected for that agent."
      drift: "scoping granularity — per-agent tool allow-lists are the tuning surface."
      axioms: [§8.6, §1.1]

    P2_tree_parse_recall_injection:   # ← DONE 2026-08-07. lib/gemini-toolbox/injection.js — tree/parseAny/recall + buildInjectionPayload. 9 tests.
      depends_on: P1
      does: >
        The parsing/injection tool James needs: (a) tree(path) — file-structure
        as a text tree (like `tree`), scoped + data/**-safe; (b) parseAny(path) —
        parse any file/data → plain text (extends parseForGemini beyond code);
        (c) cortex recall injection — pull relevant memory via the existing
        query-recall tool and inject it into the agent's context block. One
        assembled 'injection payload' per agent: contract + tree + parsed target
        + recalled context, respecting the agent's token budget (context caching
        for the static parts).
      reuse: "parseForGemini + lib/chunker + agent-tools/tools/query-recall + read-file."
      gate:  "an agent gets a single injection payload = its contract + a file tree + the parsed target + cortex recall, within its token budget; static parts cached."
      drift: "token budgeting per agent (Gemini 1-2M in / 65k out) — what to cache vs re-send."
      axioms: [§8.6, §16.4]

    P3_line_block_seam_sync:
      depends_on: P1
      does: >
        Extend the line-sync (already in gemini-toolbox) so an edit can target not
        just a line range but a named BLOCK or SEAM region — so agents and NEXUS
        can 'replace this block/seam' unambiguously, not just line N-M. Resolve a
        block/seam id → its current line span (via lib/chunker boundaries or
        lib/seam records), then verify+apply through the existing anchored-edit
        path. All-or-nothing, RAID-governed.
      reuse: "gemini-toolbox verifyEdit/applyEdits + lib/chunker boundaries + lib/seam records."
      gate:  "'replace block X' resolves to a real line span, verifies against current source, applies atomically; a moved/changed block is rejected, not mis-applied."
      drift: "block identity — how a block/seam is named and re-found if the file shifted."
      axioms: [§1.1, §2.1, §RAID]

    P4_structured_agent_to_agent:
      depends_on: [P1, P2]
      does: >
        Strict JSON schemas for agent-to-agent messages + cross-agent event
        triggers (James's axiom 1: no edits outside module boundary without an
        explicit cross-agent trigger). An agent emits a structured result; the
        next agent consumes it predictably. Rides the P1 fan-in / event stream.
      reuse: "lib/ledger-fanin (events) + gemini-toolbox structured outputs + intent-classifier."
      gate:  "agent A's JSON output parses deterministically as agent B's input; a boundary-crossing edit requires an explicit trigger event."
      drift: "schema evolution — versioned message schemas."
      axioms: [§1.1, §17.6]

    P5_autonomous_multiagent_loop:
      depends_on: [P1, P2, P3, P4]
      does: >
        The autonomous driver: given a task, assign agents by contract, inject
        payloads (P2), let them propose block/seam edits (P3), exchange structured
        results (P4), and apply through RAID — looping until done or halted. Uses
        the EXISTING lib/autonomous-loop as the spine.
      reuse: "lib/autonomous-loop + governAction (P6 gate from nexus-live-mind) + RAID."
      gate:  "a real task runs end-to-end across ≥2 agents, edits applied through RAID, halts on ambiguity (James's axiom 3: halt + request clarification)."
      drift: "autonomy scope — RAID gates every apply; halt-on-ambiguity is mandatory."
      axioms: [§RAID, §1.2, user_wellbeing]

  ordering_rationale: >
    P1 first — contracts are the frame everything injects into. P2 (tree/parse/
    recall) and P3 (block/seam sync) both need the per-agent contract to scope
    into, and are independent of each other. P4 (agent-to-agent) needs contracts
    + payloads. P5 (autonomous loop) composes all of it + the existing autonomous
    -loop + the governAction gate already wired in nexus-live-mind P6.

  honest_risks:
    - "5 phases — an ARC, not a turn. Each ships whole + tested + committed."
    - "P5 autonomy applies real code changes — RAID gates every write; halt-on-ambiguity mandatory; scope conservatively."
    - "Gemini's real limits (65k output) cap single-response refactor size — chunk large refactors (lib/chunker already does)."
    - "Live Gemini calls prove on James's boot; sandbox verifies contracts/tree/sync/schemas."

  first_build: "P1 — per-agent contracts (extend gemini-toolbox CONTRACT → registry). Recommended start next session."

---
## P1 COMPLETE + chunking consolidation 2026-08-07
lib/gemini-toolbox/agent-contracts.js — extends the single CONTRACT into a registry
of 4 distinct per-agent contracts (code-architect, refactorer, test-writer,
diagnostician), each = identity + axioms + SCOPED toolbox + injected context.
getContract(agentId) assembles the injection block; agentCan(agentId, tool) enforces
scope — a test-writer CANNOT write_patch prod code, a diagnostician is read-only
(§1.1, the anti-hallucination boundary is structural). Real Gemini limits (65536
output) replace the stale agent-router gemini:30000.
CHUNKING CONSOLIDATED THROUGH RAID (James): lib/chunk-service.js makes lib/chunker
the ONE boundary-detection core, exposed as a single chunk.document capability;
chunkGoverned() routes through RAID's router so chunking is a tracked/governed
decision (§10.3 one source of truth). The distinct concerns stay (emerge/chunk =
format, idearium/chunk-dispatch = dispatch, seam/chunk-lifecycle = state) but
delegate boundary detection here. §8.6 wraps lib/chunker — no new chunking logic.
Loom graph updated with real wires; consumer-registry derives the RAID edge live.
7 tests. REMAINING: P2 tree/parse/recall, P3 block/seam sync, P4 agent-to-agent, P5 loop.

---
## P2 COMPLETE 2026-08-07 — tree/parse/recall injection tool
lib/gemini-toolbox/injection.js — the parsing tool for autonomy: tree(path)
(file-structure text tree, the missing piece — data/**-safe, depth/entry capped),
parseAny(path) (parse any file/data → plain text: code → line-numbered via
parseForGemini, JSON → pretty, binary → honest refusal, large → chunk-first),
recall(query) (cortex /api/recall injection). buildInjectionPayload(agentId, target)
assembles ONE payload per agent = its P1 contract (static → cacheable) + tree +
parsed target + recall, within the agent's token budget (Gemini 1-2M in / 65k out).
§8.6 composes parseForGemini + query-recall + the read-file safe-resolve pattern.
§0.1 caught a real data/ guard hole (bare 'data' slipped the regex) — fixed. 9
tests. In loom's graph. REMAINING: P3 block/seam sync, P4 agent-to-agent, P5 loop.

---
## AGNOSTIC TOOL PROMOTION 2026-08-07 (James: "make any of those lib tools if they can be used across systems")
The generic capabilities inside the Gemini-specific modules were promoted to agnostic lib/ tools any system can use:
- lib/fs-tree.js — file-structure tree (was inline in injection.js). Any system (diagnostics, loom, cockpit, tablet) can use it.
- lib/line-edit.js — synchronized line addressing + verify-before-apply edits (was in gemini-toolbox). Any code-editing path (emerge, cockpit, diagnostic repair) can use it.
The Gemini-SPECIFIC parts stay under the gemini namespace: CONTRACT, agent-contracts, buildInjectionPayload, parseForGemini. gemini-toolbox now RE-EXPORTS lib/line-edit (§10.3 one source of truth — verifyEdit IS the same function); injection.tree delegates to lib/fs-tree. §8.6 no duplication. 6 tests.