# docs/2026-10-24-agent-orchestration-phasemap.spec
# Guardian agent orchestration: deploy agents to systems, compartments, websites, automation and macros — BrainOS, brought
# in and made to deploy. The confidence gate (his rule) comes first: before an agent does anything, if confidence < 75% it
# obtains context — worksurface, dependencies, find the context — and asks the user LAST.
# MAPPED 2026-10-24 (docs/CLAUDE.md rule 1), before code. Reuses, never rebuilds (rule 2): the BrainOS fold is already a full
# spec (docs/brainos-in-idearium.spec, 11 modules MOD-BX-*); this map adds the confidence gate (CG) and the automation union
# (AU) in front of it and points the deploy/UI work at that spec. Order of delivery (his): backend → route → command → UI.

origin:
  date: 2026-10-24
  james: >-
    "we need a full agent orchastration system for guardian to deploy to different systems, compartments, websites, automation,
    macros, like brainos. all the agent features in ideairum?" · "we should be able to deploy agents by now. have that test done
    automatically. enterprise grade code, pro-plugin quality ui." · "before an agent does anything. if confidence is lower than
    75%, context must be obtained. build worksurface, compile list of dependancies, find the context, ask user last." · "copilot
    system, ollama, lib folder, clearglass, idearium, and brainos have automation." · (of the framework-trial) "that was done by
    hand in clearglass." · "merge first."
  context: >-
    His 2026-09-11, kept in docs/brainos-in-idearium.spec: "brainos needs to be the entire ui for agent orchestration — clear-glass,
    agent mesh, ncp, jobs, userscripts, agent router, RAID. deploying nodes on the canvas spawn agents." The substrate exists and is
    cited by that spec: guardian's dispatcher/jobs/dispatch-pool/agent-registry/NCP (the browser agents the framework-trial used by
    hand), clear-glass's agent-mesh/route-graph/automation at :7704, lib/repo-agent.js (a repo's own agent, per-compartment), RAID's
    router and SNR pre-gate, lib/phase-dag.js, lib/run-state.js. The framework-trial (uploaded; docs/framework-trial/) is the first
    automatic job: the same prompt × 2 arms × 3 models, deployed and collected, instead of pasted tab by tab.
  trace_2026_10_24: >-
    Reuse census (rule 2, from source): the confidence gate is mostly assembly of existing pieces — lib/repo-agent.js contextFor()
    gathers code-intel search + repo-context retrieval ("find the context"); _withMemory adds lib/context-atlas.js (memory + every
    store's graphs); cortex/core/raid/snr-filter.js already resolves confidence by tier (known invariant / crystallised pattern /
    open loop / unknown); lib/phase-graph.js + loom_impact + lib/code-intel compile dependencies; idearium/ui/js/work-surface.js is
    the worksurface. The NEW piece is the GATE: the <75% ladder, the ask-user-LAST escalation, and the record of what it did.
  cobalt_reuse_2026_10_24: >-
    James (uploaded Nexus-Cobalt.zip): "any of this help?" — yes, for the two hardest phases. Cobalt is a parallel Nexus build; not
    drop-in (its own foundation/kernel bus, admin port 3748, Guardian ext 7771), so it is pattern + portable-logic reuse adapted to this
    tree's nexus-bus/RAID/guardian-dispatcher/NCP. Liftable: (1) automation/engine.js (1619 lines, zero external deps, JaaDB-backed) — a
    6-trigger engine (cron, interval, event, condition, chain, manual) whose step-executor has an `agent_call` step that is exactly
    ContextPacket → RAID → agent.complete() with retries: the deploy-a-prompt-and-collect primitive AU needs. (2) agents/base.js BaseAgent
    (complete/stream/ping) + per-provider adapters (ollama direct; chatgpt/gemini/claude via the Guardian bridge, with selectors + limits):
    the uniform deploy contract. (3) canvas/ (renderer, node-inspector, cfr-rewind): the Flow view. gate/runner.js is a TEST gate (schema-
    derived tests + GapHunter), a different concern from the confidence gate, not reused here.
  merged_first: >-
    Done before this map (his "merge first"): origin/main (0.60.236, the RF2 systems-sovereignty refactor: auth→orchestrator,
    mesh→guardian, erosmancer→clear-glass, security/remote-desktop/tablet→cos) merged into this branch; the crystallizer renumbered
    0.60.231→0.60.237 to clear the parallel-branch collision. So this build starts current, not 43 commits stale.

decisions:
  CG_D1_gate_home:
    status: DECIDED 2026-10-24 by his axioms (§8.6 reuse, §5.2 routing goes through RAID)
    chosen: >-
      lib/agent-confidence-gate.js — a standalone, dependency-injected gate (the lib/repo-agent.js pattern), so every dispatch
      surface can call it: repo-agent.dispatch (idearium's per-repo agent), guardian's dispatcher, and the orchestrator's deploy.
      It composes RAID's SNR filter for the confidence read rather than inventing a second confidence model (no side door, §9.1).
  CG_D2_threshold:
    status: DECIDED 2026-10-24 by James — "if confidence is lower than 75%"
    chosen: "CONFIDENCE_THRESHOLD = 0.75. Below it the context ladder runs; at or above it the agent proceeds."
  CG_D3_order:
    status: DECIDED 2026-10-24 by James — "build worksurface, compile list of dependancies, find the context, ask user last"
    chosen: >-
      The ladder runs in his exact order, re-reading confidence after each rung and stopping as soon as it reaches 0.75:
      1) build worksurface, 2) compile dependencies, 3) find the context, 4) ask the user — LAST, only if still below after 1–3.
  AU_D1_automation_union:
    status: DECIDED 2026-10-25 by James — "Copilot programmable and automation and the Lib folder automation. Clearglass automation, and macros, continue."
    asked: "copilot, ollama, lib, clear-glass, idearium and brainos each have automation — one registry over all six, or adapters per source?"
    chosen: >-
      One neutral automation registry (lib/automation-registry.js) with an adapter per source — his reading, confirmed when he named
      the sources and said "continue". What the coder FOUND building it (TRUTH OVER COHERENCE §0.0, evidence §0.1), to confirm the
      framing with him but not blocking: the six do NOT each keep their own engine. There is exactly one real workflow+macro engine —
      clear-glass/src/mesh/automation-engine.js (:7704) — and the rest are views/drivers of it: brainos is that engine's own store
      (data/brainos/workflows); copilot and idearium are drivers that run on it (copilot via its agent-tools, idearium via the BrainOS
      fold BX7); lib does not run automations, it DEFINES the node types every source builds from (lib/node-schemas: schema.macro,
      schema.workflow, schema.debug_macro); ollama has no automation surface at all. So the registry has an adapter per source, but each
      adapter tells the truth about that source (engine / engine-store / driver / in-process / absent) rather than pretending six
      engines exist. An absent source is named, never faked (§1.2). Guardian still deploys through the one door.

phases:
  CG1_the_confidence_gate_backend:
    status: OPEN
    layer: library
    depends_on: [CG_D1_gate_home, CG_D2_threshold, CG_D3_order]
    files: [lib/agent-confidence-gate.js, tests/modules/test-agent-confidence-gate.test.js, tests/modules/run-all.js]
    spec: docs/brainos-in-idearium.spec
    does: >-
      lib/agent-confidence-gate.js: gate({ confidence, repo, repoDir, message, snr, deps }) runs the §CG_D3 ladder. Dependency-injected
      (buildWorksurface, compileDeps, findContext, askUser, estimate) so it is testable without a live backend; the defaults compose the
      real pieces (repo-agent.contextFor + context-atlas = findContext; phase-graph/loom/code-intel = compileDeps; work-surface = worksurface;
      snr-filter = the confidence read). Returns { proceed, confidence, context, asked, steps[], reason }. Nothing silently skipped (§1.2):
      every rung and why it stopped is in steps[].
    proof: "a call at confidence 0.8 proceeds with no context obtained; at 0.5 the ladder runs in order and each rung that raises confidence to 0.75 stops it; ask-user fires only after the first three; a rung that errors is recorded, not thrown"

  CG2_the_gate_on_every_dispatch:
    status: DONE 0.60.239
    layer: integration
    depends_on: [CG1_the_confidence_gate_backend]
    files: [lib/repo-agent.js, tests/modules/test-agent-confidence-gate.test.js]
    spec: docs/brainos-in-idearium.spec
    does: >-
      repo-agent._dispatch runs the gate after it has gathered context (contextFor + _withMemory + the atlas) and before it composes
      and sends the prompt. _preDispatchConfidence reads how much context was found (worksurface = chunks, deps = the graph, find =
      memory hits) into a pre-send confidence; below 75% the gate's ladder runs over the SAME context (no second gather) and the
      ask-user-LAST rung records the question for James through the existing prereqs path (context-prereqs — "what is not found, the
      agent asks James instead of guessing"), not a synchronous prompt. The gate's decision rides on the record (ctxInfo.gate). The
      dispatch is never blocked and the gate never throws (§1.2): his mandate is that context be obtained, which it has been.
    found_2026_10_24: >-
      Guardian's dispatcher (guardian/lib/dispatcher.js) is a TRANSPORT — it sends an already-composed prompt to a browser tab and
      gathers no context — so by the axioms the gate belongs at the context-gathering point (repo-agent.dispatch), which already
      covers prompts that then flow to a guardian provider. Gating the transport would be a second gate with nothing to gather.
    proof: "tests/modules/test-agent-confidence-gate.test.js 12/12 — G1 rich context reads ≥75% (proceeds), G2 thin context reads <75% and the ladder runs with James asked last, G3 a caller/SNR confidence overrides the estimate; all 161 repo-agent tests still green"

  CG3_route_and_command:
    status: DONE 0.60.240
    layer: integration
    depends_on: [CG2_the_gate_on_every_dispatch]
    files: [lib/repo-agent.js, idearium/api/index.js, idearium/cli/route-commands.js]
    spec: docs/brainos-in-idearium.spec
    does: >-
      repo-agent.gateFor({ repo, repoDir, message }) gathers the same context dispatch would (contextFor + _withMemory) and runs the gate
      as a DRY read (prereqs with record:false — nothing is written), returning proceed/confident/confidence/threshold/steps/context/prereqs.
      POST /api/repos/:uuid/agent/gate (repo.agent.gate, READ_IDEAS) calls it; command row `repo gate <repo> "<message>"` prints the ladder
      (the pre-send confidence, each rung, and what it would ask James). The shared _runConfidenceGate is used by both the live dispatch (CG2)
      and this dry read, so they never drift. Naming: `repo gate` (the CLI's repo-verb convention) rather than the map's first `agent gate`.
    proof: "tests/modules/test-agent-confidence-gate.test.js 13/13 (H1 the gateFor guard rails); the route + command parse and compose the decision"

  CG4_the_gate_in_the_ui:
    status: OPEN
    layer: ui
    depends_on: [CG3_route_and_command]
    files: [idearium/ui/js/code-surface.js]
    spec: docs/brainos-in-idearium.spec
    does: "the Code tab's docked agent shows, before it answers, the confidence and (when below 75%) the context it gathered — worksurface, deps, found context — and only then asks the user. Idearium tokens only (pro-plugin quality)."
    proof: "Clear Glass: a low-confidence ask shows the gathered context before the reply; a high-confidence ask answers straight"

  BX_orchestration:
    status: OPEN
    layer: integration
    depends_on: [CG2_the_gate_on_every_dispatch]
    files: [idearium/lib/flow-sources.js]
    spec: docs/brainos-in-idearium.spec
    does: >-
      Build the BrainOS fold as already specced (docs/brainos-in-idearium.spec MOD-BX-SOURCES … MOD-BX-DOCK): deploy agents on the
      canvas, the mesh, the route/pipeline editor, automation — every deployed agent passing the confidence gate (CG2). This phase is
      the entry; the brainos spec's modules are its sub-phases (docs/2026-10-21-brainos-into-idearium-phasemap.spec BX2–BX8).
    proof: "flowFor(repo) returns the graph; a node deployed from the canvas spawns an agent through guardian, gated by CG"

  AU1_automation_union:
    status: DONE 0.60.249 — backend + route + command (his delivery order); UI is a BrainOS canvas panel, deferred to BX
    layer: library
    depends_on: [BX_orchestration, AU_D1_automation_union]
    files: [lib/automation-registry.js]
    spec: docs/brainos-in-idearium.spec
    does: >-
      one neutral registry over the six automation sources (copilot, ollama, lib, clear-glass, idearium, brainos) via an adapter per
      source: sources() (each source's presence, named), list({source}) (workflows + macros across all present sources, each failure
      named in sources[]), run(source, id) (runs through the source and records under it), describe() (the honest self-model). Reuse
      before build (§8.6): NOT a new engine — the one real engine is clear-glass/src/mesh/automation-engine.js (:7704), already complete
      (triggers, steps, cron, webhooks, runs); the registry reaches it over the wire door lib/agent-tools and ui/brainos already use, and
      the other sources are its drivers/views (see AU_D1's finding). Cobalt's automation/engine.js was NOT ported — this tree already has
      the richer engine, so porting a second would duplicate it (§8.6). The transport is dependency-injected (pure, testable neutral core,
      no static cross-system require; the edge to :7704 is a runtime port). Delivery order (his): backend (lib/automation-registry.js) →
      route (GET /api/automation, POST /api/automation/run) → command (`automation list [--source]`, `automation run <source> <id>`) → UI
      (a panel on the BrainOS Flow canvas, deferred to BX, said).
    proof: "tests/modules/test-automation-registry.test.js 11/11 (in run-all): lists workflows AND macros from clear-glass; brainos surfaces the same store via clear-glass; a run records under its source with via; lib refuses honestly saying where it runs; ollama is named absent; the engine down is named in sources[], never thrown (§1.2)"

  AU2_trial_automatic:
    status: DONE (harness) 0.60.247 — the deploy step built and proven; the live multi-provider run is his (needs Clear Glass agents up)
    layer: integration
    depends_on: []   # the deploy step stands on trial.js + lib/agent-providers directly; AU1's registry is not required for it
    files: [docs/framework-trial/trial.js, tests/modules/test-framework-trial-deploy.test.js]
    does: >-
      The framework-trial (his "that was done by hand in clearglass" → "have that test done automatically") collects itself: a new
      `deploy` step sends each (problem × arm) prompt to each model via an injectable transport (ollama direct; the browser agents
      ChatGPT/Gemini/Claude through Guardian's deploy door) and writes answers/<P>/<model>-<arm>-<run>.md — exactly what `blind` reads.
      JUDGING STAYS BLIND/HUMAN (the trial's integrity): deploy only COLLECTS; then blind → sheet → a judge fills scores → score → results.md.
      The transport is injectable (setSend) so the whole pipeline is proven offline with a deterministic, NON-faking mock; §1.2, a provider
      whose service is not up (or an empty reply) is reported per cell, never a silent blank answer. Run: `node docs/framework-trial/trial.js
      deploy [--model m|all] [--arm A|B|both] [--run n] [--mock]`.
    proof: >-
      tests/modules/test-framework-trial-deploy.test.js 4/4 (deploy sends every problem×arm to the transport and saves in the blind layout;
      a throwing provider is reported not thrown; an empty reply is a failure, not a blank answer). A --mock run wrote 24 answers (6×2×2),
      0 failed, in the right layout. OPEN: the live run across the three real providers (his, with Clear Glass agents up); AU1 the automation
      registry to schedule it.

order: >-
  CG1 (gate backend) first, then CG2 (on every dispatch), CG3 (route+command), CG4 (UI) — his delivery order. BX_orchestration builds the
  BrainOS fold on top (its own 11-module spec), every deployed agent gated by CG2. AU1 unifies the six automations; AU2 runs the
  framework-trial automatically as the proof. Nothing is built before its spec module and its .phase/.graph (his 2026-10-20 rule).
