spec:
  meta:
    name:     one-model-engine
    version:  2.3.0
    date:     2026-10-09
    release:  0.52.0 (base)
    uuid:     nexus-one-model-engine-phasemap-v1-0000-2026-1009-jamesbrooks-001
    owner:    lib/pipeline-routing (the engine and its policy) · copilot (the door) · cortex/core/raid (choice, health, record, verify, the drainer) · guardian (transport) · idearium and every other caller
    status:   "MAPPED 2026-10-09, before building — 2.0.0 rewritten from a full scan of the codebase (1.0.0 was mapped from a partial look and missed RAID, the drainers and most ladders); 2.1.0 corrected against RAID's atlas, spec and the axioms: RAID is the brain, not copilot's door; 2.2.0 checked against the nexus, idearium, guardian and copilot specs and atlases — his standing rules, the drift between docs and code, and what already exists; nothing built; goes ahead of RS1"
    voice: >
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim. `does:` is the coder's
      reading, his to correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    axioms:   docs/AXIOMS-v3.1.md — §1.1 nothing pretends, §1.2 nothing silently fails, §8.6 reuse before build, §10.3 one routing brain, §3.3 map before build, §0.3 nothing lost
    origin: >
      James, 2026-10-09: "Wait. I meant idearium needs escalating retry logic, and fallback routing. I wasn't talking the
      phasemap. Your aren't fragmenting everything are you?" — the CT6 ask ("needs escalating retry logic and fallback
      routing. like if the 3b fails, switch to the 7b, then the 16b deepseek, then the agents. have all of this
      configurable.") was for every model call; it was built for phase builds only. On a ChatGPT review ("Unify the
      retry mechanism, not the definition of failure"): "Perfect. Add to map. What about hooking in raid?" — then
      "Doesn't it have a drainer." — then "Okay. Map thoroughly before moving. That was supposed to be the point of the
      map." — then "Look at the raid engine atlas and spec" — then "okay. deeply check, nexus idearium guardian and coipilot
      specs and atals" — then "okay, yes thats the point update the map first." (ME15, the docs made true, goes first.)
    method: >
      How this inventory was made, so it can be re-run and checked: (1) the bottom — every place a prompt leaves a
      process (Ollama generate/chat, guardian browser agents and REST APIs, copilot's prompt routes); (2) every caller
      of each, walked upward; (3) every file with a retry, ladder, cascade or fallback construct (46 files, each
      classified model / not-model); (4) every learner, breaker and chooser; (5) every queue and drainer; (6) every
      setting that moves any of it. Each entry was read in the source, not taken from its comments; what could not be
      settled by reading is under `to_prove`, with how.

  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  governing_law:   # what James already decided, read 2.1.0 — this map serves it, it does not re-decide it
    axioms:
      - "§5.2 Everything routes through RAID — every system connects to RAID for cross-system dispatch; a module that does not is isolated."
      - "§9.1 RAID is the only write authority for requests; a cross-system call that does not cross RAID is a rogue bypass (§FAULTS.CLASS.ROGUE_BYPASS)."
      - "§9.2 ledger write before dispatch · §9.3 held requests never leave the queue (a target offline → held, never dropped) · §9.4 route depth bounded, MAX_ROUTE_DEPTH = 3, routeHistory written on every hop; a silent fallback chain is a bug."
      - "§10.1 RAID owns requests; guardian owns execution state; idearium owns ideas/specs/gaps."
      - "§15.1 iterate to fulfillment within a budget: classify the failure (open-loop-taxonomy), score it (reflection), re-route through RAID away from the agent that failed · §15.2 every iteration a traceable event · §15.3 learning is cumulative, in RAID's weight table."
    james:
      - 'raid.spec universal_router, 2026-07-21: "the request comes from co-pilot or one of the UIs, but goes to RAID — that way the start point doesn''t matter, as long as it goes to RAID."'
      - 'raid-routing-fidelity, 2026-08-08: "RAID is the governing layer; everything goes through it to move to another system." · "the chunk size is crap — 3000 characters isn''t useful because it''s tokens … Each agent needs its own."'
      - 'raid-verification-spine, reconciled: RAID is the decision LEDGER and verification DRIVER, not a blocker by default — it sees everything, blocks only when a real check fails.'
    atlases:
      - "nexus atlas: RAID, the routing authority every request passes through (§5.2, §9.1), writes the ledger entry before anything is dispatched."
      - "copilot atlas: copilot receives intent, assembles context, routes to RAID, and answers — intelligence, kept separate from guardian's dispatch on purpose."
      - "cortex atlas: the raid organ (order 5) hears cortex.orion.classified, emits cortex.raid.decided; guardian handles cortex.raid.decided → dispatch to the chosen provider."
    standing_rules:   # 2.2.0 — his rules recorded in the four systems' specs and atlases; the engine keeps every one
      - 'A chosen agent is the only one tried — economy I1: "A provider someone chose is never swapped silently" (guardian spec, idearium and guardian atlases); BS13: "why claude? set to chatgpt. it hasn''t build one line yet." The ladder climbs only when nobody chose; a chosen agent that fails is reported as its failure.'
      - 'Nothing is guessed: "If copilot cannot say, nothing is sent" (idearium atlas, who answers).'
      - 'A sign-in wall never moves on (idearium atlas, routing) — it waits for the person (§9.3 held, guardian''s login wall).'
      - 'Tokens last: the chunk build spends tokens "only as a last resort" — component store, prior sections, memory, WARP cache, then a model (idearium atlas); RAID''s SNR "Invariants first. Patterns second. AI last." (raid-snr-filter); copilot answers data-only before any model (TOKEN_FIRST_THRESHOLD, copilot spec); SEAM T0/T1 emit structure at zero tokens (guardian spec); Clear Glass verbs act without a model (copilot atlas). The engine''s first rung is no model at all.'
      - 'Guardian is dispatch, copilot is intelligence; they are separate (copilot and guardian specs). Ollama is isolated from guardian so a slow model never blocks it (nexus atlas).'
      - 'Configurable economy, not hidden constants: every provider''s tier, limits, quiet hours and what to do at a limit (wait · stop · fallback to a provider he names); each job type (build, chat, plan, manage, heal, wake, automation) names the tiers it may use (provider-economy, guardian and idearium atlases).'
    first_model_said:   # his words on which model goes first, in order — the input to decide's LAW_I
      - '2026-06 (raid.spec LAW_I/LAW_III): Ollama always first, Claude always last.'
      - '2026-08-18 (RAID code): "I want to use ChatGPT and Gemini since they are free. Use you [claude] as a last resort."'
      - '2026-09-02 (RAID code, §DEFAULT-AGENT-CHANGE): "use Gemini or ChatGPT as the default agent" / "ChatGPT first, Gemini fallback."'
      - '2026-09-29 (repos.default_provider, 0.39.282): "Ollama should be default"'
      - '2026-10-05 (CT6): "if the 3b fails, switch to the 7b, then the 16b deepseek, then the agents."'
      - 'Read together (the coder''s reading, his to confirm): Ollama first, smallest model up; then the free agents (ChatGPT, then Gemini); Claude last. The spec, RAID''s code, nexus.spec (ChatGPT priority 1) and idearium (ollama default) each hold one moment of this; none holds all of it.'
    what_this_means_for_the_map: >-
      The engine this map describes is already law: §15 is adaptive fulfillment through RAID, §9.3 is the drainer's
      retry later, §9.4 is the bounded, written route. It was built partly (adaptive-fulfillment, RAID's weights in
      memory, the verify spine) and then built AGAIN beside RAID: CT1 put model choice behind copilot's door with
      lib/pipeline-routing as its brain, and CT6 (the phase ladder) and HP3/HP4 extended that second brain. That is the
      fragmentation he asked about, and this session added to it. 1.0.0 and 2.0.0 of this map recommended the door as
      the brain — against his axioms. Corrected: RAID decides and learns; copilot is the door callers ask (it routes to
      RAID, as its atlas says); guardian and Ollama dispatch.
    open_raid_maps_this_folds:   # §10.3 — one plan, not competing ones; each phase below names which it closes
      - "raid-routing-fidelity RR1 (SNR/fidelity scoring for general routing — today only when a faultClass is given), RR2 (token-sized chunking per agent, asking RAID first), RR3 (per-agent config in cortex, not AGENT_CONSTRAINTS constants), RR6 (fitness: routing tuned by observed performance)"
      - "agent-intelligence-loop AP2–AP4 (agent events to intelligence, strategy rows, the optimizer — 'RAID governs every change'); RR6 IS AP4 system-wide: one optimizer"
      - "raid-simulation-engine (proposed: simulate a decision in a COS compartment before it commits) — an optional check, not this map's"
      - "axiom-5-2-raid-routing MCO8 (the observability pattern: submit, run elsewhere, report — 'never re-executing the work') — its claim is what to_prove's double dispatch tests"
      - "copilot-awareness-routing CA5/CA6 (agent-router, routing_config) and code-tab-and-one-router CT1/CT2/CT6 (the door, verdicts, the ladder)"

    drift_docs_vs_code:   # 2.2.0 — what the four systems' specs and atlases say that the code does not do (§12.5, §13.4)
      - "copilot.spec: 'receives intent, assembles context, routes to RAID'; hook copilot.prompt.to-raid → cortex.raid.receive; handles cortex.raid.decide.result — none in code: /api/prompt never asks RAID (only /build queues a RAID contract and /fulfill uses RAID's pick); the nexus atlas's own walk-through says copilot chooses the backend (lifeline)"
      - "copilot.spec modules intent-classifier, context-assembler, data-answerer, action-router, session-manager, memory-writer — only lib/intent-classifier.js exists; the rest live inside server.js and copilot-context.js or not at all"
      - "copilot.spec routes and copilot/registry-components.js lack POST /api/route and /api/route/outcome (CT1, 0.39.346 — this session's own undeclared routes); /api/prompt/resolve is declared in the registry, not the spec"
      - "guardian.spec handles 'cortex.raid.decided → dispatch to chosen provider' — the raid organ emits it, nothing in code hears it: a dead path (settles a to_prove)"
      - "guardian.spec raid_routing (nine cluster chains, Ollama first, Claude last) and the guardian atlas table copied from it — retired in RAID v6.1; RAID's code is ChatGPT first"
      - "guardian.spec / guardian atlas: 'the only system that touches AI providers … no API keys, browser tabs only' — the ollama bridge is its own system (nexus atlas: isolated from guardian), idearium's agent-suite calls Ollama directly, guardian/api-dispatch.js calls REST APIs with keys"
      - "nexus.spec providers: chatgpt priority 1, claude 2, ollama 3 ('RAID_local_first'); guardian purpose 'ChatGPT is primary' — a fifth answer on which model goes first; nexus.spec lists neither copilot nor the ollama bridge as systems"
      - "model names: qwen2.5-coder:1.5b and mistral:7b-instruct in nexus.spec, guardian.spec and the guardian atlas — not what is installed or used (the ladder reads the bridge)"
      - "two copies, two contracts: docs/copilot.spec 3.5.0 vs copilot/spec/copilot.spec 3.9.0; docs/idearium.spec 4.1.0 (spec builds 'dispatch via Guardian') vs idearium/spec/idearium.spec 4.35.0 — guardian's pair was already made one (GA1), these two were not"
      - "atlases behind their specs: copilot atlas v3.7.0 (spec 3.9.0), guardian atlas v3.6.2 (spec 3.21.0); the idearium atlas records nothing from 0.39.346 to 0.52.0 (this session's CT1–CT9, RS3–RS11, HP1–HP5); it says a new compartment defaults to chatgpt through guardian in one place and ollama (repos.default_provider) in another"
    exists_already:   # 2.2.0 — found in the docs; the phases build on these instead of beside them
      - "the provider economy's job types × tiers (guardian/lib/economy-guard.js over lib/economy policy) — the caller policy's 'who may answer this kind of job' already exists, configurable, in Settings → Provider economy"
      - "the economy's wait / stop / fallback at a limit — the time axis (wait) and a configured climb (fallback), at dispatch"
      - "lib/economy/tokens.js — token limits learned per provider from what came back whole (estimate-v1) — measured budgets, beside agent-router's hand-written AGENT_CONSTRAINTS (RR2/RR3 need one of them, the measured one)"
      - "idearium's chunk build tiers (component store → prior sections → memory → WARP cache → model) — the no-model first rung, for chunks"
      - "copilot's data-only answer (TOKEN_FIRST_THRESHOLD 0.6) and fromGrammar on every response — 'did this need a model at all', recorded"
      - "the ollama client's own retry: a thinking model that answered nothing is asked once more with thinking off (transport, kept)"
      - "the Clear Glass co-pilot pane's own who-answers switch (ollama · copilot · guardian · clear_glass) — a ninth chooser at a caller, to ask RAID through the door like the rest"

  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  inventory:

    transports:   # where a prompt leaves a process — the bottom of every stack
      - "ollama bridge (ollama/, :3749): POST /api/jobs → its job queue (MAX_CONCURRENT) → ollama/lib/dispatch.js runs each job through WARP unifiedDispatch (crystal cache, axiom gate) with runCascade(providers ['ollama'], maxAttempts 1) → callOllamaRaw; POST /api/jobs/tools → callOllamaChatWithTools; model names resolved to installed tags (model-inventory)"
      - "idearium agent-suite generateWithOllama: straight to Ollama, not the bridge (buildChunkWithAgent when the provider is ollama; the spec wizard)"
      - "guardian browser agents (:7820): /command and /api/copilot/prompt (guardian/ask.js askSync) → createJob → dispatcher: chooseProvider (asks RAID), economy-guard (allow / wait / stop / fallback to the provider the person set onLimit), dispatch-pool (per-provider concurrency caps), dispatch-ladder (mesh tab → repair selectors once → userscript NCP → the person), job-retry (tab-busy, input, submit, no-reply, provider-error: up to 4 attempts with delays; login, captcha, rate limit, usage cap, refusal: to the person)"
      - "guardian/api-dispatch.js: REST providers (OpenAI, Gemini, Perplexity, Claude API, Mistral) — called from orchestrator"
      - "clear-glass providers/host.js (NCP auto-host: 3 attempts) and the agent mesh (asks RAID /api/raid/decide, then copilot/lifeline dispatchToNcpAgent)"

    services:     # the doors other code calls
      - "copilot POST /api/prompt — three paths: (a) body.backend guardian|ollama → lifeline dispatchToNcpAgent / dispatchToOllama directly, with the tool loop (maxToolErrors) — idearium's repo agent uses this; (b) copilot/intents.js (navigate, note, tool, action); (c) otherwise lifeline.route()'s cascade"
      - "copilot POST /api/prompt/fulfill — adaptive-fulfillment: RAID picks an agent, try, reflection scores it, open-loop taxonomy classifies a failure, RAID recordOutcome, next agent (idearium copilot-adapter calls it with maxAttempts 2)"
      - "copilot POST /api/prompt/tools — the Ollama tool loop; POST /api/prompt/stream; GET /api/prompt/resolve (resolveDefaultBackend: config.DEFAULT_PROVIDER → auto/copilot = ollama, a named agent = guardian); POST /api/route + /api/route/outcome (lib/model-door: pipeline-routing plan, breakers, learning) — CT1"
      - "copilot's own Ollama path goes through _llmQueue (one at a time, priorities) then the bridge's /api/jobs"
      - "copilot/lifeline.js route(): an agent named in the prompt goes first; provider:ollama never escalates; otherwise Ollama first and, when its estimated confidence is under LIFELINE_CONF (0.75), escalates to guardian (askBeforeEscalate returns the low answer instead)"

    choosers:     # what decides which model answers — eight, not one
      - "lib/model-door + lib/pipeline-routing plan(): modes learned · fixed · chain · local-first · economy; per-block fallbacks; breakers; the learned order from the economy ledger — the pages, the chunk builds' route, CT1"
      - "lib/pipeline-routing ladder(): the phase-build escalation ladder (escalation, or Ollama smallest first then the chain), present() leaving off what is not installed (HP3), agent-record's learned order (AR1)"
      - "cortex/core/raid _decide / decideForContract: cluster, SNR gate, explicit preference, LAW_I (in code since 2026-09-02: ChatGPT first, Gemini its fallback; raid.spec still says Ollama first), fitness — asked by chunk-dispatch (default provider), WARP providersFor, adaptive-fulfillment, officiator, guardian chooseProvider (HTTP /api/raid/decide), the clear-glass mesh (HTTP), routing-ir (lifeline)"
      - "lib/agent-router.js (CA5): intent → agent by strength, DEFAULT_FALLBACK, AGENT_CONSTRAINTS (token limits, chunkForAgent); lib/routing-config.js (CA6) editable rows — read by RAID, copilot self-model, the mesh, spec-parser, agent-system contracts"
      - "copilot lifeline: the agent named in the prompt text (extractExplicitAgent), else Ollama first"
      - "copilot resolveDefaultBackend (config.DEFAULT_PROVIDER) and lib/agent-providers.js resolve() (asks /api/prompt/resolve) — used by idearium agent-suite and the repo agent"
      - "lib/seam/adapters/warp-cascade.js providersFor(): a chosen provider alone; else RAID's pick then ollama, chatgpt, claude; or the economy's learned order once it has records"
      - "the cortex organ path: orion classifies (cortex.orion.classified) → the raid organ decides (cortex.raid.decided) → guardian's spec says it dispatches on that event — whether any live dispatch still rides this event path is to_prove"
      - "guardian.spec raid_routing: nine clusters each with a provider chain, Ollama first, Claude last (also the guardian atlas) — RAID v6.1 retired CLUSTER_CHAINS for computed fitness; the spec and atlas still describe the old chains (drift)"
      - "idearium's own defaults: speceng.build preferAgent = body.agent || pinned chunk agent || the compartment's provider || chunk.agent || manifest.agent || 'chatgpt'"

    ladders:      # every place that retries or moves to another model — by layer
      phase_build:       "idearium _phaseBuild → climb(): rungs × retries_per_rung, escalate_on, tool-errors stop, memory skip, present() skip; then _provePhase: up to repos.proof_attempts on the SAME agent with the unmet conditions fed back"
      pages:             "idearium _agentAsk (workshop, architect, void, deliver): copilot's route, next hop only on fallback_on classes"
      chunk_build:       "idearium speceng.build → route from copilot's door (max_hops) → chunk-dispatch dispatchChunkWithVerification: QueueCompartment (lib/seam/queue.js) prompt strategies context → shorter → forensic, maxRetriesPerStrategy, watchdogRetry, an outer cap attempts_per_hop → warpFn: WARP cascade runCascade (providersFor, maxAttempts 3, the failure fed back as context) → agent-suite buildChunkWithAgent → Ollama or guardian (job-retry, dispatch-ladder)"
      chunk_repair:      "lib/autonomous-repair.js → lib/chunk-build-orchestrator.js: try every agent (DEFAULT_FALLBACK order, agent-build-learning priors); a rate limit or timeout is a turn that never happened, not a failure"
      copilot:           "lifeline confidence escalation (Ollama → guardian); adaptive-fulfillment (RAID-chosen agents in turn)"
      guardian:          "economy-guard fallback (onLimit provider); dispatch-ladder (transport); job-retry (transport, up to 4)"
      queued:            "RAID contract onFail (retry maxRetries 2 by default · fallbackAgent · halt); orchestrator contract-poller re-dispatch (retryCount < 3); idearium build-queue poller (STALL_RETRY 10 min)"
      repair:            "diagnostic/nexus-heal-loop.js (maxAttempts 3, heal.* config) → Forge (intelligence/rfr2/forge) → guardian; cortex/self-heal (known fix → snapshot+forge propose → RAID contract)"
      not_model:         "auth rate limit, boot-sequence phase retries, orchestrator boot, cortex-v2 display, intelligence/diagnostic analysis of retry counts, hooks and loom maps — classified and left out"

    learners:     # what remembers how a model did — seven stores
      - "the economy ledger (lib/economy/ledger.js, persisted) — pipeline-routing plan and learned(), WARP providersFor _learnedOrder, guardian economy; weighted by class since HP4"
      - "RAID _weights and _health (in memory, lost on restart) — recordOutcome from adaptive-fulfillment and cortex /api/raid/feedback (guardian raid-feedback)"
      - "lib/agent-record.js — a projection of idearium_phase_runs and the injects; orders the phase ladder (AR1)"
      - "lib/agent-build-learning.js — Bayesian per agent (+0.10 / −0.15) for chunk-build-orchestrator"
      - "guardian/lib/agent-registry.js — per agent health, selector repairs (the transport's, not the model's)"
      - "lib/agent-capability-profile.js — measured token limits and outputs (a tool reads it; nothing routes on it)"
      - "WARP population store (per gate class) — a cache of good outputs, not a model ranking"

    breakers:
      - "lib/pipeline-routing breaker (per provider, in process; verdicts and tool-errors never open it)"
      - "guardian dispatch-ladder's infrastructure breaker (a dead mesh costs one attempt per window)"
      - "RAID _agentAvailable (consecutiveFails ≥ 3, callCount ≥ 5 with successRate < 0.2 → excluded)"

    drainers:     # queued work that runs later and survives a restart
      - "RAID: cortex/core/raid/worker.js (started by orchestrator, every 15 s, RAID_WORKER_INTERVAL_MS) → contract-intake processNext: oldest QUEUED contract whose dependsOn passed → acknowledge (intent-contract gate) → executor (_realAgentExecutor: lifeline dispatchToNcpAgent to forAgent) → onFail; reconcileOnBoot resumes after a restart"
      - "idearium: _startBuildQueuePoller (every 15 s) → re-posts spec builds; recoverOrphanedChunks for chunks left BUILDING"
      - "RAID officiator (cortex/core/raid/officiator.js: start/stop/tick) — a periodic loop that synthesizes contracts from context and asks decideForContract, dispatching through lifeline; what it runs and how often is to_prove"
      - "orchestrator: lib/contract-poller.js scans every system's input/ folder, re-dispatches a stuck contract up to 3 times (lib/contract-queue.js)"
      - "queues that are concurrency, not retry: ollama job queue, copilot _llmQueue, guardian dispatch-pool and its pending queue, lib/queue.js file queues — they stay as they are"

    recorders:    # where an attempt is written — none shared
      - "idearium_phase_runs rows (phase builds, proof, review)"
      - "the economy ledger (recordHop; copilot door outcomes; guardian usage)"
      - "RAID raid_decisions (tool decisions, verify) and raid_contract_queue rows; RAID ledger events"
      - "spec-engine chunk route (recordChunkRoute) and dispatch job (recordDispatchJob)"
      - "guardian .job files (attempts[]), chat-logger, agent-memory (download manager)"
      - "lib/phase-faults → fault_log"

    settings:     # everything that moves any of the above
      - "idearium routing.* (config-core): mode, chain, ollama_models, learn_min_records, fallback_on, max_hops, attempts_per_hop, breaker_threshold, breaker_cooldown_ms, skip_open, escalate, escalation, escalate_on, retries_per_rung, max_tool_errors, min_build_b, chunk_phases, ladder_learn, signal_weights; repos.proof_attempts, repos.review_provider"
      - "copilot: config.DEFAULT_PROVIDER, LIFELINE_CONF"
      - "RAID: raid_tunables rows (thresholds), RAID_WORKER_INTERVAL_MS, contract onFail per submission"
      - "agent-router / routing-config: routing_config rows (intent → agent, fallback order, token limits)"
      - "guardian: economy policy (onLimit), dispatch-pool caps, job-retry delays, GUARDIAN_RAID_OFF"
      - "diagnostic heal.maxAttempts; WARP maxAttempts per adapter (code)"

    callers:      # who asks a model, by system (beyond the services above)
      idearium:  "_phaseBuild, _provePhase, _reviewDraft, _agentAsk (workshop, architect, void, deliver), repo.agent.prompt (Code tab chat), ollama.check.ask, speceng.build, the skeleton expand and spec plan (warpFn), guardian-extract, the spec wizard (agent-suite)"
      lib:       "repo-agent dispatch; opportunity/draft; hat-forge, hat-seed; agent-tools ambiguity-pull, ask-james, emergence, roundtable, parallel-dispatch, agent-council, agent-chat (all call lifeline.route or dispatchToNcpAgent directly)"
      copilot:   "module-builder, recursive-diagnose, reword, /bridge/deliver, /api/introspect/retry, autonomous-repair"
      cortex:    "RAID officiator, contract-intake executor, self-heal"
      others:    "architect service (RAID contracts), orchestrator (copilot prompt proxy, api-dispatch, heal-loop), clear-glass (mesh, ipc bridge → lifeline), cli (nexus-cli, nexus-repl, clear-idearium), guardian userscripts and wake-loop (copilot /api/prompt/tools)"

    dormant:
      - "lib/routing-config.js is read only through agent-router's fallback path and account-registry — whether any live route reads its rows is to_prove"
      - "lib/agent-capability-profile.js — measured, not routed on"
      - "RAID's SNR / fidelity gate (cortex/core/raid/snr-filter.js) runs only for calls that declare a faultClass — general routing never consults fidelity (RR1, open)"
      - "AGENT_CONSTRAINTS (per-agent token limits) are constants in agent-router, not cortex rows (RR3, partial)"

  to_prove:       # what reading could not settle; each is proved (a test or a live trace) in ME0 before anything moves
    - "DOUBLE DISPATCH: speceng.build submits each chunk to RAID as a QUEUED contract (content = the chunk prompt, forAgent = its agent) for observability and reports PASS/FAIL later; RAID's drainer takes the oldest QUEUED contract every 15 s and sends its content to forAgent. A chunk build slower than a tick may be sent twice. Same for architect/service.js's four observability contracts (content like 'blueprint.scan:<path>' sent to an agent as a prompt). Unless acknowledge()'s boundary gate stops them — read says it may not. Prove with a test against contract-intake: submit as idearium does, run processNext with a recording executor."
    - "whether lifeline's confidence escalation fires on composed prompts from the agent tools (it says composed callers get the first tier only)"
    - "whether chunk-dispatch's attempts_per_hop cap, QueueCompartment's strategies and WARP's maxAttempts multiply on one chunk, and the worst case in attempts"
    - "whether cortex /api/raid/feedback now reaches RAID's weights (guardian raid-feedback says it never had)"
    - "which choosers disagree today for the same job: run each on the same inputs"
    - "SETTLED by reading (2.2.0): nothing hears cortex.raid.decided — guardian.spec's handler does not exist in code; kept as a test in ME0 so it stays settled"
    - "what the RAID officiator's tick dispatches, how often, and whether it overlaps the worker"

  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  pushback:
    - >-
      Unify the mechanism, not the meaning of failure (ChatGPT's line, agreed). One engine; each caller says what an
      acceptable output is and which failures it may retry or climb on.
    - >-
      One brain, and it is RAID (2.1.0 — corrected; 1.0.0 and 2.0.0 said the door, against §5.2, §9.1 and §15). Copilot
      stays the door every caller asks (CT1: "it should use copilot regardless, have copilot figure it, and learn from
      it" — copilot figures it BY asking RAID, as its atlas says). lib/pipeline-routing's working parts — the ladder,
      present(), climb(), breakers, the caller policy, HP4's weights — are not thrown away (§0.3, §8.6): they become
      RAID's, served from cortex, the way verify() composed engines that already existed. Eight choosers become RAID.
    - >-
      Three layers stay separate, by what they are: TRANSPORT (guardian dispatch-ladder, job-retry, clear-glass host —
      getting a prompt into one agent), CONCURRENCY (job queues, dispatch-pool, _llmQueue — how many at once), CACHE
      (WARP crystals — not asking at all). They report classified outcomes up; the engine decides the model.
    - >-
      Time axis vs model axis: the drainers decide WHEN (retry later — a provider down, rate-limited, logged out), the
      engine decides WHICH model now (invalid output climbs). One budget across both.
    - >-
      Prompt strategies are not model fallbacks. QueueCompartment's context → shorter → forensic and WARP's
      failure-as-context retry change the PROMPT, not the model — worth keeping as the engine's "retry with feedback"
      step, not as a separate ladder.
    - >-
      Silent quality escalation goes. Lifeline's confidence < 0.75 → guardian switches model on a guess about the
      answer; under the caller policy that is opt-in, and a chat reply always names who answered.
    - >-
      RAID's two decisions stay two (raid.spec two_decisions): which AGENT (_decide — this map) and which SYSTEM (router.js
      — untouched). Its contract queue stays its own; synchronous callers are not made to wait on a 15 s drain (MCO7's
      finding) — RAID decides and records inline, the queue is for work that may run later.
    - >-
      §9.4 bounds route depth at 3 with history written; his CT6 ladder ("3b … 7b … 16b deepseek, then the agents") is
      four rungs or more. Not silently resolved: see decide.
    - >-
      Old settings are translated with a stated precedence and an end date; keeping every behaviour forever under one
      name keeps the fragmentation.
    - >-
      RS1's recorder stays in RS1: this map gives it one attempt record to read.
    - >-
      Order of delivery (docs/CLAUDE.md): each phase backend → API → command row → screen; a phase is not done without
      its screen.

  decide:   # his calls, needed before the phases that name them
    - "ME5 — confirm: RAID is the brain (his axioms §5.2, §9.1, §15; the coder's recommendation since 2.1.0), copilot the door that asks it, pipeline-routing's parts moved under RAID."
    - "ME3 — §9.4 MAX_ROUTE_DEPTH = 3 vs the CT6 ladder of four or more rungs: does depth count models (raise it, said in the axioms) or systems crossed (a ladder of models inside one RAID route is depth 1)?"
    - "ME5 — LAW_I, from his own words in order (first_model_said): the coder reads them as Ollama first, smallest up, then ChatGPT, then Gemini, Claude last — confirm, or say otherwise; then raid.spec, RAID's code, nexus.spec and idearium's default all say the same."
    - "ME10 — lifeline's confidence escalation: keep as an opt-in policy, or retire."
    - "ME8 — observability contracts: a status the drainer never runs ('external'), or stop submitting them and record through the one attempt record instead."

  next_map:   # 2.3.0 — his larger ask, named here so it is not lost; mapped on its own, after this one, not folded in
    james: >-
      "idearium is supposed to do that also. like you update the spec, which is then chunked, phased, possibly chunked
      again, and built. like the map is whats expanded, then phases to the phasemap." · "i want idearium to be able to do
      what you do." · "as simple as possible, that anyone can use. but also powerful and advanced enough for entire
      codebases." · "all my ideas i usually throw at you, and we back and fourth, which is what the void was supposed to
      be, back and fourth, but i dont think it is"
    found: >-
      He is right about the void (idearium/lib/void.js): every echo is one fresh call that sees his idea's text and his
      repo and library names — never its own earlier echoes, never what he said back. He answers only by taking a part
      in his own words. It is a set of single replies, not a conversation. The other steps exist in pieces: the
      workshop (WS7), derivePlan (spec → phasemap), the Phases tab and the thread (RS9–RS11), phase builds.
    why_after_this_map: >-
      The loop he describes calls a model at every step (the void's replies, drafting the spec, cutting phases,
      building). Built on today's eight choosers it would inherit the fragmentation this map removes; built after, every
      step asks RAID through the one engine.

  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  phases:
    ME0_the_inventory_proved:
      layer: library
      status: OPEN
      james: '"Okay. Map thoroughly before moving. That was supposed to be the point of the map."'
      depends_on: []
      files: [tests/modules/test-one-model-engine.test.js, docs/2026-10-09-one-model-engine-phasemap.spec]
      does: >-
        Every to_prove item settled by a test or a live trace and its answer written into this map (the double dispatch
        first — a real bug fix if it holds, shipped on its own). A scan test lists every model call site, retry loop,
        chooser, learner and drainer from the code and compares it to `inventory`: a site not in the map fails the test
        until the map names it. This test is the seed of ME13.
      proof: "each to_prove item has an answer and a test; the scan finds nothing the map does not name"
    ME1_one_failure_list:
      layer: library
      status: OPEN
      james: '"Thoughts? ChatGPT." — "Perfect. Add to map."'
      depends_on: [ME0]
      files: [lib/pipeline-routing.js]
      does: >-
        One list of failure classes in four kinds, read by every layer: did not run (provider-down, timeout, login,
        captcha, rate-limit, usage-cap, empty, truncated, tool-errors, refused, no-memory), invalid output (the
        caller's check failed: no file changed, unparseable, a planned file missing, blocked at its gate, axiom
        rejection), weak but valid (opt-in only: lifeline's confidence, reflection's score), verdict (test-failed,
        dismissed, constraint, contract breach from raid.verify). pipeline-routing classify, VERDICTS and escalate_on;
        guardian job-retry classify; open-loop taxonomy; chunk-build-orchestrator's "turn that never happened"; WARP
        axiom failures — each maps onto it.
      proof: "every class any layer emits today maps to exactly one kind; an unknown class is 'unknown', said"
    ME2_caller_policy:
      layer: library
      status: OPEN
      james: '"Perfect. Add to map."'
      depends_on: [ME1]
      files: [lib/pipeline-routing.js]
      does: >-
        Built on the provider economy, not beside it: the economy's job types and tiers are who may answer, its limits and
        wait / stop / fallback stay its own. A caller policy adds: { kind, accept(output) → ok | invalid with why, climbOn, retryOn, retryLater, stopOn,
        feedback: none | context | shorter | forensic (the prompt strategies), quality: off | on, budget }. Defaults
        per caller: page — non-empty text; build — a changed file; chunk — the Detector's verification; chat — any
        answer, climbs only on did-not-run, names who answered; reviewer — a verdict; repair — a proposed patch.
      proof: "the same failing model under the chat policy and the build policy falls back in one and climbs in the other, as each says"
    ME3_one_engine_one_budget:
      layer: library
      status: OPEN
      james: '"needs escalating retry logic and fallback routing … have all of this configurable."'
      depends_on: [ME2]
      files: [cortex/core/raid/index.js, lib/pipeline-routing.js, lib/model-door.js, copilot/server.js]
      does: >-
        §15.1 made real for every caller: climb() becomes RAID's, reached through copilot's door; the rungs from RAID's
        decision (ME5), filtered by present() and
        RAID's health, each attempt optionally retried with feedback (the prompt strategies) before climbing, the
        caller's policy deciding. Rung zero is no model (his rule, tokens last): a cached, stored, data-only or
        deterministic answer is tried first and recorded as such. A chosen agent is the only rung (I1); the ladder runs
        only when nobody chose. One job carries one attempt budget through every nesting (proof, chunks, rungs,
        strategies, drain ticks); a nested climb spends from it and stops when it is gone, saying so.
      proof: "a phase with proof retries, two chunks and a three-rung ladder, and a chunk through every strategy, never exceed their budget; exhaustion is a record naming it"
    ME4_one_attempt_record:
      layer: library
      status: OPEN
      james: '"Perfect. Add to map."'
      depends_on: [ME3]
      files: [lib/pipeline-routing.js, lib/economy/ledger.js]
      does: >-
        One record per attempt, written by the engine: job and caller, the request's hash, the model, the route reason,
        attempt and rung, the strategy, the class and its kind, the check's verdict, ms, the final outcome. Into the
        economy ledger; idearium_phase_runs, chunk routes and RAID decisions carry it rather than each writing their
        own. RS1 reads it.
      proof: "a page call, a chunk build, a phase build and a drained contract leave records of one shape; the four failure kinds and an exhausted budget are told apart from the records alone"
    ME5_one_chooser:
      layer: library
      status: OPEN
      james: '"What about hooking in raid?"'
      depends_on: [ME3]
      files: [cortex/core/raid/index.js, cortex/core/raid/snr-filter.js, lib/pipeline-routing.js, lib/model-door.js, cortex/core/raid/routing-ir.js, lib/agent-router.js, copilot/lifeline.js, copilot/server.js, lib/agent-providers.js, lib/seam/adapters/warp-cascade.js, guardian/lib/provider-routing.js, clear-glass/src/mesh/agent-mesh.js, idearium/spec-engine/chunk-dispatch.js]
      does: >-
        RAID's _decide is the one chooser (§5.2, §9.1). Copilot's door (/api/route) answers by asking it; pipeline-routing's
        modes, ladder, present() and learned order become its inputs, served from cortex; WARP providersFor, lifeline's
        ollama-first, resolveDefaultBackend, agent-providers, speceng.build's default and the Clear Glass pane's switch
        ask it instead of choosing (a person's explicit pick in any of them is passed as the chosen agent, never
        overridden). agent-router's intent strengths become cortex rows it reads, and token budgets come from the
        economy's learned limits (lib/economy/tokens.js) over AGENT_CONSTRAINTS' hand-written ones (RR2, RR3); fidelity scoring (the
        SNR gate) runs for every routing call, not only fault calls (RR1). LAW_I stated once, in raid.spec and the code
        alike. Closes RR1, RR3.
      decide: "see decide: the brain; LAW_I"
      proof: "for the same job every former chooser names the same model; changing the chain in Settings changes all of them"
    ME6_one_learner:
      layer: library
      status: OPEN
      james: '"and learn from it. failure modes, dynamically switch models, if its not equipped for the task" (CT2)'
      depends_on: [ME4, ME5]
      files: [lib/economy/router.js, cortex/core/raid/index.js, lib/agent-build-learning.js, lib/agent-record.js, guardian/lib/raid-feedback.js]
      does: >-
        §15.3: RAID's weight table is the one learner — persisted in cortex (it is in memory today and lost on restart;
        §2.2 storage is truth), weighted by class (HP4's weights move with it). recordOutcome is the one write: the
        economy ledger's hops, agent-record's verdicts (undone by the person), agent-build-learning, guardian's feedback
        all land there; the ledger keeps cost and usage, RAID keeps who is good at what. Tuning the weights over time is
        RR6 / AP4 — one optimizer, RAID-governed — named, not built here. Transport health (agent-registry) stays the
        transport's.
      proof: "an outcome recorded anywhere moves RAID's one order; a restart keeps what was learned"
    ME7_raid_spine_joins:
      layer: library
      status: OPEN
      james: '"What about hooking in raid?"'
      depends_on: [ME3, ME4]
      files: [cortex/core/raid/index.js, lib/pipeline-routing.js]
      does: >-
        RAID's health poll is an availability source for present() (an agent it sees down is left off, said); every
        engine attempt is a RAID decision (raid_decisions); raid.verify is a check a caller policy can name for a
        consequential output (a build applied to files) — its breach a verdict; chat and pages never pay for isolation.
      proof: "a model RAID marks down is skipped and said; every attempt appears in raid_decisions; a build whose isolated verify breaches its contract climbs"
    ME8_the_drainers_run_the_engine:
      layer: library
      status: OPEN
      james: '"Doesn''t it have a drainer."'
      depends_on: [ME0, ME3, ME5]
      files: [cortex/core/raid/contract-intake.js, cortex/core/raid/worker.js, orchestrator/lib/contract-poller.js, idearium/api/index.js, architect/service.js]
      does: >-
        The drainers stay how queued work runs and survives restart: RAID's worker, idearium's build-queue poller, the
        orchestrator's contract poller. Each drained attempt goes through the engine; the engine answers done, climb
        now, or retry later (did-not-run, with the provider's own wait or a backoff); the drainer re-queues only retry
        later. onFail fallbackAgent becomes a climb; onFail maxRetries and the poller's 3 re-dispatches spend from the
        job's budget. Observability contracts are resolved per `decide`. A phase build may be queued (resumable after a
        restart — HP2's interrupted runs pick up) or awaited, one engine either way.
      decide: "see decide: observability contracts"
      proof: "a contract whose provider is down is re-queued and runs on a later tick; an invalid output climbs in the same tick; attempts across ticks stay in budget; no contract is dispatched twice"
    ME9_the_layers_below_report:
      layer: library
      status: OPEN
      james: '"Your aren''t fragmenting everything are you?"'
      depends_on: [ME1, ME3]
      files: [guardian/lib/dispatcher.js, guardian/lib/dispatch-ladder.js, guardian/lib/job-retry.js, guardian/lib/economy-guard.js, ollama/lib/dispatch.js, clear-glass/src/providers/host.js]
      does: >-
        Transport, concurrency and cache keep their own loops (they are not model choice) and report their final
        outcome in ME1's classes. guardian economy-guard's fallback to the onLimit provider becomes a climb request to
        the engine (its wait stays a retry later); chooseProvider stops choosing (ME5).
      proof: "a login wall, a busy tab and a usage cap each reach the engine as their class; a usage cap climbs through the engine, not around it"
    ME10_nested_ladders_folded:
      layer: library
      status: OPEN
      james: '"needs escalating retry logic and fallback routing."'
      depends_on: [ME3, ME5, ME9]
      files: [idearium/spec-engine/chunk-dispatch.js, idearium/spec-engine/warp-build-dispatch.js, lib/seam/adapters/warp-cascade.js, lib/seam/queue.js, lib/chunk-build-orchestrator.js, copilot/lifeline.js, copilot/adaptive-fulfillment.js]
      does: >-
        The ladders inside ladders become the engine's steps: chunk-dispatch's hops and attempts_per_hop cap, WARP's
        runCascade across providers (WARP keeps its cache and axiom gate, one provider per call), QueueCompartment's
        strategies (the engine's feedback step), chunk-build-orchestrator (a policy: try every rung, did-not-run is not
        a turn), adaptive-fulfillment (it IS §15 — the engine, with the reflection score as an opt-in quality check),
        lifeline's confidence escalation (per `decide`). When a climb changes agent, the work is re-sized to that agent's
        token budget (RR2: "Each agent needs its own") — a 3b's chunk is not a claude's.
      decide: "see decide: lifeline"
      proof: "a chunk build makes the attempts its policy says and no more; the same failure walks the same rungs whichever entry point it came through"
    ME11_old_settings_translated:
      layer: library
      status: OPEN
      james: '"have all of this configurable."'
      depends_on: [ME3, ME5]
      files: [lib/pipeline-routing.js, idearium/lib/config-core.cjs, idearium/ui/settings.html, idearium/cli/route-commands.js]
      does: >-
        One settings group (Settings → Routing): the ladder, the budget, the caller policies, the signal weights. Read
        into it with a written precedence: fallback_on, max_hops, attempts_per_hop (idearium), LIFELINE_CONF and
        DEFAULT_PROVIDER (copilot), contract onFail defaults (RAID), routing_config rows (agent-router), onLimit
        (guardian economy) — each by its old meaning. Settings names which old key a value came from; old keys carry an
        end date. Backend, then GET/POST /api/routing, then the command row, then the screen.
      proof: "each existing config gives the same attempts and fallbacks per caller before and after; a new key wins; Settings names the source"
    ME12_callers_moved:
      layer: api
      status: OPEN
      james: '"Wait. I meant idearium needs escalating retry logic, and fallback routing."'
      depends_on: [ME2, ME3, ME4, ME11]
      files: [idearium/api/index.js, lib/repo-agent.js, copilot/server.js, lib/agent-tools/tools/coordination/parallel-dispatch.js]
      does: >-
        Every caller in `inventory.callers`, one at a time, each keeping its tests green: idearium first (pages, chunk
        builds, Code tab chat — hard failure falls back and the reply names who answered — reviewer, proof retries,
        phase builds), then lib (repo-agent, opportunity draft, hat-forge, the agent tools that call lifeline directly),
        copilot (module-builder, recursive-diagnose, reword, the bridge routes), cortex (officiator, self-heal),
        architect, orchestrator, clear-glass, cli.
      proof: "each caller's old tests pass; each climbs per its policy; the Plan, the Code tab and the pages show a climb the same way"
      retires: "every path a moved caller used before goes to _archive in the same change (OR6's rule): the choosers it no longer asks, its own retry loop, its settings once translated"
    ME13_no_bypass:
      layer: library
      status: OPEN
      james: '"Your aren''t fragmenting everything are you?"'
      depends_on: [ME12]
      files: [tests/modules/test-one-model-engine.test.js]
      does: >-
        ME0's scan becomes a gate: code outside the engine that posts to copilot's prompt routes, calls lifeline's
        dispatch, the repo agent's dispatch, RAID's decide, guardian's prompt routes or Ollama's generate fails the test
        — except the engine and the transports, named with why in this map.
      proof: "a direct call added anywhere fails the test, naming the file and line"
    ME15_the_docs_tell_the_truth:
      layer: docs
      status: OPEN
      james: '"okay. deeply check, nexus idearium guardian and coipilot specs and atals"'
      depends_on: [ME0]
      files: [copilot/spec/copilot.spec, docs/copilot.spec, guardian/spec/guardian.spec, docs/nexus.spec, docs/idearium.spec, idearium/spec/idearium.spec, docs/atlases/copilot-atlas.md, docs/atlases/guardian-atlas.md, docs/atlases/idearium-atlas.md, docs/atlases/nexus-atlas.md, copilot/registry-components.js]
      does: >-
        Every drift_docs_vs_code item answered in its own doc, with a dated addendum, before code moves (what the docs
        say now must be true now): copilot's RAID claims marked as not yet true (ME5 makes them true); its missing
        modules marked; /api/route and /api/route/outcome declared in the spec and registry; guardian's dead
        cortex.raid.decided handler and retired cluster chains marked retired (kept, §0.3); guardian's 'only system that
        touches providers' corrected to what is; nexus.spec's provider priorities pointed at the one LAW_I once decided;
        stale model names replaced by a pointer to the bridge's list; the copilot and idearium doc copies surfaced to
        him and made one the GA1 way, with his ok; the copilot, guardian and idearium atlases brought to their specs,
        including this session's CT, RS and HP work. Then each later phase updates the atlases it changes.
      proof: "the atlas reference test and a spec-vs-code check pass for every item listed; no claim in the four specs names a route, module, event or chain the code does not have"
    ME14_across_callers:
      layer: library
      status: OPEN
      james: '"Perfect. Add to map."'
      depends_on: [ME12]
      files: [tests/modules/test-one-model-engine.test.js]
      does: >-
        One suite drives every caller through the same faults: a model not installed, down (RAID health), timeout, empty,
        rate-limited, invalid output, valid output rejected by a verdict, exhausted budget, a restart mid-climb. Each does
        what its policy says and leaves the same record.
      proof: "every fault × every caller, each outcome as its policy says, each recorded"
