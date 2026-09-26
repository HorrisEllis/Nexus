spec:
  meta:
    name:        forge
    version:     2.0.0-spec
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-forge-v2-0000-2026-0707-jamesbrooks-001
    status:      partial — real pipeline exists end to end, three real gaps named below, not hidden
    supersedes:  nexus-forge-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      An LLM-agnostic tool that can code a system of any size, decomposed
      into independently-verifiable units (seams/nodes), listened to and
      driven automatically (userscripts + heal-loop), learning from its
      own history (crystal-lattice), never re-asking what it already
      knows (Cortex), with real fallback when a provider or approach
      fails (RAID + WARP's retry ladder). v1.0.0 claimed this was already
      built — forgePatch()/forgeGate()/forgeScaffold()/seamDispatch(),
      version '1.0.0' in lib/version.js. Checked directly before writing
      a line of this: none of those four functions exist anywhere in the
      codebase. Same false-completion shape found this session for
      self-heal, macro-compiler, and divergence-watcher — all four in
      this same file. This version is built from what's actually real
      and tested, not renamed from what was already claimed.

  # ── What's already real and proven, cited by file, not by claim ──────────
  real_primitives:
    decomposition:
      what: "spec (of any size) -> KnowledgeGraph -> seam records, one per unit of work"
      files: [emerge/compiler/pipeline.js, lib/seam/kg-seam-bridge.js]
      proof: "ran against runtime.spec itself — 61 real nodes, 52 module seam records, real computed generationReadiness/confidence/deps per node, not guessed"

    dispatch_pipeline:
      what: "Registry -> Classify -> Axiom -> Cascade -> Persist, backend-agnostic"
      files: [lib/seam/gates.js, lib/seam/stream.js]
      proof: "core migrated onto WARP's Event/Gate/Stream this session (not a hand-rolled copy) — re-ran the full runtime.spec pipeline afterward: same real distribution (9 dispatched, 43 skipped, 52 persisted) as every prior run"

    agnostic_llm_layer:
      what: "cache + population + cascade + retry, provider-agnostic by construction"
      files: [warp/dispatch/index.js, warp/dispatch/cascade.js, warp/plugins/crystallizer-flatfile.js]
      proof: "ollama/server.js wired as WARP's first production caller this session — 3 identical dispatches build population evidence, 4th+ serve from cache with zero model calls, proven not assumed"
      gap: "WARP itself never picks WHICH provider — that's RAID's job, and RAID isn't wired as ollama's provider-selector yet (see open_gaps)"

    routing_with_fallback:
      what: "health+fitness scoring, LAW_I (cheap-first) / LAW_III (never-fully-fail) cascade"
      files: [cortex/core/raid/index.js, cortex/core/raid/routing-ir.js]
      proof: "RoutingIR wraps real _decide() output honestly — rule_based mode when no real competition happened (confidence: null, not fabricated), competitive mode with real fitness numbers when it did"
      gap: "roleConfidence and snrTierGate are still honest 1.0 stubs; topologicalProximity has a real implementation now (meta/cfr/graph.js's componentProximity(), this session) but nothing calls _fitness() with the graph/componentId options in production yet"

    memory_no_recall_loss:
      what: "push/recall, real lexical+recency scoring, tier-weighted"
      files: [cortex/push-recall.js]
      proof: "pushed 5 real entries, recalled with real queries, ranking verified against the actual tier-pull-weight math by hand, not just eyeballed"
      gap: "2 of 5 MQL lanes real (lexical, recency) — causal/failure-pattern/BEP need structures that don't exist yet, said so directly rather than claim 5/5"

    self_learning:
      what: "(domain, verb, outcome) pattern crystallization, real success-rate tracking"
      files: [meta/crystal-lattice.js]
      proof: "wired to copilot/intuition.js's real consumer this session — inserted a real crystal, got back the exact shape intuition has expected since it was written (precursor/outcome/count/confidence), where it used to silently render undefined/NaN"
      gap: "write side (compartment-engine.execute() -> crystal-lattice) traced to orchestrator's autonomous-loop, which requires a manual API call with hand-supplied params — not confirmed to fire automatically in production"

    causal_root_cause:
      what: "on-demand causal graph from recent events, real ancestor-chain tracing"
      files: [meta/cfr/graph.js, cortex/boot.js's _mastermindAnalysis()]
      proof: "real 3-hop chain traced this session: ollama.offline -> guardian.dispatch.failed -> CAPABILITY. Tested the mixed case (traced + untraced gaps together) and caught my own bug where untraced gaps were being silently dropped — fixed, every gap now contributes something"

    automatic_listening:
      what: "userscripts detect real issues per-response, feed a shape-correct event to the bus, heal-loop picks it up automatically"
      files: [guardian/userscript-chatgpt.js, guardian/userscript-claude.js, nexus-heal-loop.js]
      proof: "this exact chain was totally broken — 928/928 real calls through Architect's intake failed silently before this session, root-caused to a batched event shape the heal-loop's name-only matcher couldn't use. Fixed on both ends, verified the real per-issue shape now reaches Architect with real content instead of two spaces"

    agentic_tool_use:
      what: "sovereign, injectable tool-calling loop for any model that supports it"
      files: [lib/agent-tools/index.js]
      proof: "qwen2.5-coder (the real default model) confirmed to support Ollama's native tool-calling via /api/chat — feasibility checked, not assumed"
      gap: "started this session, not finished — read_file tool designed, not yet wired to a live /api/chat loop or tested against a real model"

  # ── Named gaps, not hidden, each pointing at exactly what's needed ───────
  open_gaps:
    - gap: "RAID's RoutingIR is real and tested but nothing in ollama/server.js's dispatch calls it — the provider is still hardcoded, not agnostic in practice yet"
      needs: "wire providersForSeam()-style selection (already built in lib/seam/adapters/warp-cascade.js for the seam-dispatch path) into ollama/server.js's own job dispatch"
    - gap: "lib/agent-tools/'s loop is unfinished"
      needs: "the actual /api/chat + tools loop, tested against a real qwen2.5-coder response requesting a tool call"
    - gap: "self-heal genuinely does not exist, despite lib/version.js claiming '1.0.0'"
      needs: "real new engineering — diagnostic-engines.js computes real diagnoses (10 real cross-domain methods) and calls nothing downstream; this is the actual missing wire between diagnosis and action"
    - gap: "componentId / id naming duplication (confirmed real, not started)"
      needs: "retire componentId onto id — comp_id is a separate, real, intentionally-distinct concept (instance identity vs. type identity) and must not be touched"

  # ── Build order — Node.js first, CLI+API next, UI last, no exceptions ───
  build_order: >
    Every real piece in this session was built and proven in exactly this
    order, and the next work should follow the same discipline: (1) the
    Node.js logic itself, tested directly via node -e or a real script —
    no server needed yet; (2) a real HTTP/CLI surface once the logic is
    proven, tested with curl or a direct function call, not a UI; (3) a
    UI only once there's real data flowing underneath it to render — Loom's
    console came after its real endpoints, not before; the very first
    Architect UI attempt this session ("architect-minimal.html") was
    explicitly rejected by the user for being built before checking what
    real UI already existed. Skipping straight to UI is the single most
    repeated mistake avoided this session — do not reintroduce it.

  compounding: >
    Every real piece above already reduces cost for the next: WARP's
    cache means a repeated seam dispatch gets cheaper, not just faster.
    Crystal-lattice means a repeated pattern gets recognized, not
    re-derived. Cortex's push/recall means context survives across
    calls instead of being re-explained. RAID's fitness (once wired)
    means routing gets better as real health data accumulates instead of
    staying static. None of this needs a new "compounding engine" — it's
    the natural effect of connecting what's already real, which is the
    actual finding of this entire session: the deficit was never
    capability, it was connection.

  # ── §ADDED 2026-07-07 — the command/keyword/personality/stream layer ──────
  # Checked before speccing any of this as new: cockpit/pipeline.js (real
  # node-based workflow engine — trigger/condition/transform/api_call/
  # agent_call/store/emit/loop, cron+schedule+webhook trigger types) and
  # cockpit/cli.js (real CLI contract — forge pipeline/seam/idea/gap
  # commands, "CLI = UI = same contract") are BOTH already real and
  # already wired to guardian/server.js. "Create and schedule workflow,
  # tasks, contracts" is not a gap — it's cockpit, already built, already
  # connected. What's actually missing is four genuinely new pieces:
  command_and_keyword_layer:
    what: >
      Ollama-side keyword-to-command mapping — a user's plain-text
      request ("run the gap report") resolves to a real cockpit CLI
      command ("forge gap list") without the user typing CLI syntax.
    builds_on: [cockpit/cli.js's real interaction-contract, lib/agent-tools/'s
                tool-calling loop (built this session)]
    shape: >
      A new tool in lib/agent-tools/tools/ — run_cockpit_command — schema
      lists cockpit's real commands (read from cockpit/cli.js's own
      contract, not hand-copied, so it can't drift from the real command
      set the way the hooks registry drifted from copilot's real routes).
      The model picks a command by matching user intent to a real
      command's description; execute() shells out to the real CLI
      exactly as a human would, same contract, same guarantees.
    status: "not built — real, scoped, buildable next step, not started this session"

  continuous_stream:
    what: >
      Listen/poll layer that watches real systems (userscript detection
      already real and fixed this session — guardian's per-issue gap
      events; Guardian job completions; Cortex's event_log) and
      normalizes whatever it sees into plain text pushed into a running
      Ollama context, so Copilot's next answer already has it without
      re-asking.
    builds_on: [guardian/userscript-{chatgpt,claude}.js's real per-issue
                event emission (fixed this session), cortex/push-recall.js
                (real memory), meta/crystal-lattice.js (real pattern
                recognition, wired this session)]
    honest_note: >
      This is NOT a new capability to invent — it's the same "always
      route generation through what's real" discipline applied
      continuously instead of per-request. The pieces (listen, normalize,
      push to Cortex, recall on the next turn) are each independently
      real and tested this session; wiring them into one always-on loop
      is the remaining, real work.
    status: "not built — the individual pieces are proven, the loop
             itself is not"

  personalities:
    what: >
      Different system prompts / behavioral profiles Copilot can adopt
      per conversation or per system it's representing.
    checked: "no existing implementation anywhere in the codebase —
              confirmed by direct search before speccing this as new,
              not assumed absent"
    shape: >
      A profile is data, not code — {name, systemPrompt, allowedTools,
      defaultIntent} — stored the same way cortex/push-recall.js already
      stores tagged content (tier: 'session' or a new 'persona' tier),
      recalled by name rather than invented as a new storage system.
    status: "genuinely new, zero existing infrastructure to build on
             beyond Cortex's own real storage — the smallest real gap
             here, but still a real one"

  copilot_command_intents:
    what: >
      copilot's own hook registry declares navigate/note/tool/action as
      real intents (confirmed exhaustively this session — copilot's ONLY
      real gap, exactly these 4 of 20 declared hooks). This is where
      run_cockpit_command and personalities actually surface to a user —
      not a separate UI, the existing /api/prompt entry point finally
      handling the intents it already claims to.
    status: "the connective tissue for everything above — still the
             smallest, most precisely-bounded gap in copilot, unchanged
             from earlier this session's finding"
