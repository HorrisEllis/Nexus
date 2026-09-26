spec:

  meta:
    name: brainos-external-concept-mapping
    version: 0.1.0
    uuid: nexus-brainos-external-mapping-v1-0000-2026-0911-001
    status: specced
    james: "none of what's in here in regards to any backend connection is correctly mapped. map everything to guardian, ollama, copilot, clearglass, ncp, agent mesh and suite, userscripts, and all the commands and tools, each system can be a node."
    what_this_is: >
      The uploaded files (adapters.js, bridge-canvas-persistence.js, routing-engine.js,
      workflow-engine.js, account-manager.js, agent-factory.js, agent-registry.js,
      bootloader.js, intent-parser.js, intent-router.js, intent-scoring.js, router.js,
      ROADMAP.md, and a "BrainOS v5.0" HTML mockup) are a SEPARATE, EXTERNAL reference
      project — not part of this NEXUS codebase, never wired to it, and using different
      names for things that already exist here under different, real implementations.
      This spec maps every real backend concept in that upload to its actual NEXUS
      equivalent (or names it as a genuine gap) — mapping only, nothing built this pass.

  # ────────────────────────────────────────────────────────────────
  # CRITICAL NAME COLLISION — read this first
  # ────────────────────────────────────────────────────────────────
  critical_collision:
    - name: "\"Guardian\""
      uploaded_meaning: >
        The HTML's bottom script ("GUARDIAN BRIDGE v3.10") is a fictional protocol:
        POST /guardian/handshake, GET /guardian/agent-hooks, POST /guardian/agent-hook,
        GET/POST /userscript/callto, POST /bus/emit, GET /uuid/:uuid. "Guardian" here
        means a generic browser-extension-to-bridge handshake layer with "calltos"
        (captured DOM click targets) and "agent hooks" (callto-to-agent wiring).
      real_meaning: >
        guardian/server.js is NEXUS's real, live job-dispatch system: NCP protocol
        (GET /channel SSE, POST /result), GUARDIAN_REGISTER/GUARDIAN_CHUNK/
        GUARDIAN_COMPLETE message types (guardian/lib/ncp-handler.js), real .job
        files (guardian/lib/jobs.js), GET /providers, GET /jobs. None of the
        uploaded endpoint names, message types, or the callto/agent-hook concept
        exist anywhere in real guardian/server.js.
      action: "Do not merge these. If the callto/agent-hook idea (wire a captured DOM element to an agent) is still wanted, it is NEW work layered on top of guardian's real NCP + userscripts.yaml — not a rename of anything real."

  # ────────────────────────────────────────────────────────────────
  # INTERNAL CONTRADICTIONS IN THE UPLOAD ITSELF
  # ────────────────────────────────────────────────────────────────
  # §10.3 — competing truth layers are a system failure. The upload
  # already has three different, mutually-inconsistent intent→provider
  # tables for the same concept — importing any one of them forward
  # would import this exact flaw into NEXUS.
  internal_contradictions:
    - "HTML's own INTENT_PROVIDER_MAP: code -> [gemini, chatgpt, ollama]"
    - "router.js's INTENT_PROVIDER_MAP: code -> [gemini, chatgpt] (also uses the key 'summarization', HTML/intent-scoring use 'summarize' -- a third naming mismatch)"
    - "intent-scoring.js's ROUTING_TABLE: code -> [deepseek, openai, gemini, ollama, claude]"
    - "real NEXUS lib/agent-router.js's DEFAULT_ROUTES: code -> gemini primary, chatgpt close second, claude last resort (James's actual 2026-08-14 directive, confirmed real)"
    - conclusion: "lib/agent-router.js is the one real, current, James-confirmed source of truth for intent->agent routing. None of the uploaded tables should be imported verbatim; where they suggest a DIFFERENT chain than agent-router.js's real DEFAULT_ROUTES, that's a stale/fictional value, not a correction to make."

  # ────────────────────────────────────────────────────────────────
  # DO NOT RESURRECT
  # ────────────────────────────────────────────────────────────────
  do_not_resurrect:
    - upload_feature: "network-overlay: DNS server, DDNS, firewall rule engine, reverse proxy"
      why: "This exact feature set (DNS/firewall/crypto/host-rotation) was explicitly retired from real BrainOS/clear-glass, James's own words: 'redundant and should be deleted' (§RETIRED 2026-09-06, archived at _archive/2026-09-06-brainos-network-infra-retired/). The upload's ROADMAP.md lists this as 'Phase 2 COMPLETE' for the external project — that completion is real for THAT project, not a reason to rebuild it here."

  # ────────────────────────────────────────────────────────────────
  # FILE-BY-FILE MAPPING
  # ────────────────────────────────────────────────────────────────
  mapping:

    - upload: bootloader.js
      concept: "deterministic boot order: config -> bus -> router -> agents -> bridge -> workflows -> plugin, per-phase health report"
      real_equivalent: "cortex/boot.js (real phase-gated boot) + autopilot.js (real kernel supervision/health, ALL_KERNELS) + lib/system-registry.js (real aggregator)"
      status: ALREADY_REAL
      note: "NEXUS's real boot is per-system (each of ~15 sovereign systems boots its own process), not one monolith bootloader — the upload's single-process phase list doesn't map 1:1, but the DISCIPLINE (loud phase failure, health file, graceful degrade) already exists in autopilot.js."

    - upload: "bus (referenced by every uploaded file, not itself uploaded)"
      concept: "typed event bus, wildcard subscriptions, replay buffer, audit log"
      real_equivalent: "warp/core (Event/Gate/Stream/StreamLog/Axiom — the real WARP primitives) + each system's own real bus.emit()/EventEmitter (guardian, cortex, clear-glass sse)"
      status: ALREADY_REAL
      note: "NEXUS has no single shared bus across all systems by design (§5.9 every system is sovereign) — each system emits its own real, governed events (guardian/event-taxonomy.js etc.), not one central bus the upload assumes."

    - upload: "intent-parser.js + intent-router.js + intent-scoring.js"
      concept: "raw text -> normalized Intent{action,target,signals,priority} -> scored -> ranked provider fallback chain -> ExecutionPlan"
      real_equivalent: "lib/intent-hat-router.js (real intent classification, VALID_VERBS) + lib/agent-router.js (real intent->agent DEFAULT_ROUTES with 'why') + lib/agent-intent-contract.js (real AM1 permission GATE, distinct from routing advice) + cortex/core/raid/router.js (real RAID provider decision, GET /api/raid/decide)"
      status: ALREADY_REAL
      note: "This is the single biggest already-solved overlap. The upload's 3-file pipeline is a real, sensible idea NEXUS already has, split across 4 real, tested modules with a documented, James-confirmed provider chain -- not a gap to fill."

    - upload: "agent-registry.js + agent-factory.js (BaseAgent, AIAgent/AutomationAgent/SystemAgent, canHandle/execute)"
      concept: "central agent registry + single execution gateway"
      real_equivalent: "clear-glass/src/mesh/agent-mesh.js's AGENT_REGISTRY + AgentMesh class (route()/spawn()/send()/enqueue()) IS the real registry+factory combined -- 6 real agents (claude/chatgpt/gemini/perplexity/deepseek/grok/mistral), the real v0.39.85 drainer for retry/escalation, the real v0.39.88 route-graph for pipelines"
      status: ALREADY_REAL
      note: "lib/agent-tools/index.js's TOOLS map (239 real, declarative tool bindings) is the closer real analogue to 'every capability the system can invoke', not agent-factory.js's 3-class hierarchy."

    - upload: "account-manager.js (multi-account per provider, Playwright login flow, cookie capture)"
      concept: "per-provider, per-account credential storage + automated login"
      real_equivalent: "clear-glass/src/cookies/vault.js (real cookie vault) + clear-glass/src/options/store.js (NexusOptions, real per-agentKey account resolution, resolveDefaultAccountForAgent) + clear-glass/src/passwords/vault.js"
      status: PARTIAL
      real_gap: "NEXUS has real account/cookie storage but genuinely no Playwright-driven automated-login flow -- the real design is: a real Electron window opens, a human logs in once (or already has a session), guardian's real userscript takes over from there. account-manager.js's whole connectAccount() flow (launch persistent context, waitForSelector login, capture cookies) is architecturally foreign to how NEXUS authenticates -- adopting it would mean running two different auth strategies side by side, a real §10.3 risk, not a free win."

    - upload: "adapters.js (referenced by router.js as ADAPTERS[provider].send())"
      concept: "one Node-side HTTP adapter per provider, uniform .send() interface"
      real_equivalent: "guardian's 6 real userscripts (guardian/userscript-{claude,chatgpt,gemini,perplexity,deepseek}.js) ARE the real per-provider adapters -- but they run INSIDE the browser tab (DOM automation via NCP), not as Node-side HTTP callers. guardian/lib/provider-routing.js's _dispatchToMistral/_dispatchToDeepseek are the one real Node-side HTTP-adapter pattern that does exist (ollama-bridge local models only)."
      status: ALREADY_REAL, different shape
      note: "Two genuinely different adapter shapes exist for a reason: browser-tab automation (no API key, real login session) vs. direct local-model HTTP (ollama-bridge). The upload assumes only the second shape exists everywhere -- it doesn't, and browser automation is the one guardian actually depends on for claude/chatgpt/gemini/perplexity/deepseek."

    - upload: "router.js (top-level fallback router, sequential + parallel dispatch, cooldown-based failure classification)"
      concept: "classify error type (rate_limit/expired/blocked/timeout) -> per-type cooldown -> sequential or Promise.any parallel fallback across accounts"
      real_equivalent: "guardian/lib/dispatcher.js (real dispatch, real stale-socket detection, real requeue) + clear-glass/src/mesh/agent-mesh.js's v0.39.85 drainer (real 4-tier escalating retry: RETRY/RESPAWN/FALLBACK/DIAGNOSTIC, real backoff, real gap escalation on exhaustion)"
      status: ALREADY_REAL, more advanced
      note: "The real drainer's diagnostic tiers (force a fresh spawn, force a different agent, full mesh snapshot) are a materially more capable version of the upload's flat cooldown-by-error-type -- nothing to backport."

    - upload: "routing-engine.js / workflow-engine.js (if/then/when/fail chains, triggers: timer/cron/heartbeat/CLI/intent/data, per ROADMAP Phase 3)"
      concept: "conditional multi-step automation with triggers and branching"
      real_equivalent: "cortex/core/raid/ (real dependsOn/onFail contract dependency graph) + lib/seam/queue.js (real STRATEGY_ORDER retry/escalate state machine) + clear-glass/src/mesh/route-graph.js (real, just-built node-to-node pipeline edges, v0.39.88)"
      status: "CLOSED (v0.39.89, extended 0.39.91) — §DRIFT-CORRECTED 2026-09-12: was GENUINE_GAP for the trigger/scheduler/branching layer specifically"
      real_gap: "Closed, not a live gap anymore: clear-glass/src/mesh/automation-engine.js (0.39.89) built real persisted workflows (data/brainos/workflows/*.workflow.json) with trigger/agent/delay steps dispatching through the same mesh.enqueue() path route-graph and the drainer already share; 0.39.91 added real condition steps (var/op/value against live mesh.listMeshView() data, no eval) and command steps (call a named real NEXUS system+endpoint), plus per-step CRUD and the floating panel's step editor. Deliberately still not built: branch/http/notification step types, named as real extensions in automation-engine.js's own header, not silently promised — carried forward as the one remaining piece of this original gap."

    - upload: "bridge-canvas-persistence.js (referenced for saving/loading canvas node+tunnel state as JSON)"
      concept: "persist canvas graph state"
      real_equivalent: "clear-glass/src/mesh/route-graph.js's real *.route.json per-edge files (v0.39.88) + lib/system-registry.js/pulse-registry.js's real live node data (no persistence needed -- it's live-queried, not stored)"
      status: PARTIAL
      note: "The upload's node model (bridge/relay/vps/peer/stun/api, manually deployed+probed) doesn't match BrainOS's real node model (agent-mesh agents + pulse-registry heartbeat nodes, auto-discovered). Persisting the REAL node graph would mean persisting agent-mesh state, not adopting the upload's deploy-a-server-node concept."

    - upload: "'Bayesian Identity Engine' (BAYES object in the HTML: posterior/entropy tracking per node, strategy weighting)"
      concept: "confidence scoring for whether a discovered node is trustworthy/stable"
      real_equivalent: "no direct equivalent. Closest real, adjacent systems: cortex's CFR field (entropy/coherence/friction/resonance, real, live) and lib/gap-priority.js's real composite scoring"
      status: GENUINE_GAP, low priority
      note: "This solves a problem NEXUS doesn't really have -- real BrainOS nodes are agent-mesh's own tracked agents/pulse entries, not untrusted third-party bridges needing an identity-confidence model. Not recommended for porting; flagged only because it was asked to be mapped, not because it's needed."

    - upload: "PIPELINE tab (visual step canvas: provider/intent/model/system-prompt per step, sequential execution via /v1/messages)"
      concept: "visual multi-step AI pipeline builder"
      real_equivalent: "clear-glass/src/mesh/route-graph.js (real, v0.39.88) + ui/brainos/brainos-canvas.js's real drag-to-connect (v0.39.88) already deliver the REAL version of this: drag node A onto node B, A's real completion auto-dispatches to B through the real drain/retry machinery"
      status: ALREADY_REAL (Phase 2), simpler than upload by design
      note: "The upload's per-step config (system prompt, max tokens, transform JS eval'd via `new Function`) is real functionality NOT yet in the real route-graph (direct response-chaining only, deliberately, per that spec's own §HONEST SCOPE) -- if per-edge transforms are wanted, that is Phase 2b, a real, scoped extension, not a new engine."

  # ────────────────────────────────────────────────────────────────
  # each system as a node — direct answer to the literal ask
  # ────────────────────────────────────────────────────────────────
  systems_as_nodes:
    already_real: "mesh.listMeshView() already renders both kind:'agent' (agent-mesh spawned contexts) and kind:'node' (pulse-registry heartbeat entries) on the BrainOS canvas (since v0.39.56, extended v0.39.87-88 with context menu + routing edges)."
    gap: "guardian, ollama, and copilot are not currently represented as their own canvas nodes -- only the AGENTS they dispatch to are. Confirmed precisely: agent-mesh.js's listNodes() reads only clear-glass's own network/pulse-registry.js (external nodes that handshake INTO it) -- lib/system-registry.js's separate, already-real aggregation of autopilot's kernel list (which DOES already include guardian/ollama-bridge/copilot by name, autopilot.js lines ~215/238/253) is never consulted by listMeshView() at all. Two real, honest options, not yet decided: (a) have those processes handshake into pulse-registry the same way an external node would, or (b) add a third kind to listMeshView() sourced from system-registry.build() directly -- no new discovery mechanism needed either way, just a second real source wired into the one existing view."
