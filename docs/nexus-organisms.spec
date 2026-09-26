spec:
  meta:
    name:        nexus-organisms
    version:     1.0.0
    uuid:        nexus-organisms-v1-0000-2026-0625-jamesbrooks-001
    foundation:  nexus-system-foundation@1.0.0
    status:      draft — phase 24.0
    author:      James Brooks
    purpose: >
      NEXUS Organism Layer — the natural extension of the ERAVOS organism model
      into the NEXUS orchestration domain.

      ERAVOS has: organisms · behaviors · genomes · ecosystems · recipes
      NEXUS has:  the same, but for AI orchestration, automation, and cognitive work.

      An organism is a sovereign unit with a defined purpose, a bus interface,
      hooks for wiring, and a capability declaration. It does not reach into
      other organisms directly. All connections are wires. All mutations are
      recorded. All faults are named.

      This spec defines what NEXUS organisms are, how they map to existing
      architecture, and what new classes become possible.

  axioms:
    - §1.1 Nothing exists until registered in the organism registry
    - §1.2 Nothing silently fails — every fault is loud, named, traceable
    - §K-3  No organism touches another organism directly
    - §K-4  Every connection is a wire (via bus, NCP, or HTTP seam)
    - §K-6  Every mutation recorded before it applies
    - §K-10 The spec is source of truth — not runtime state
    - §3.1  Build order: data → schema → engine → hooks → UI


  # ── Existing NEXUS services as organisms ──────────────────────────────────
  #
  # Every NEXUS service already IS an organism — it just hasn't been
  # declared as one. Retroactive organism declarations give them the
  # full identity: comp_id, hooks, capabilities, bus topics, fault modes.
  #
  existing_organisms:

    - id:          nexus.guardian
      label:       Guardian
      port:        7820
      comp_type:   orchestrator
      provides:
        - capability.job_dispatch
        - capability.ncp_routing
        - capability.seam_queue
        - capability.raid_gate
        - capability.gap_registry
      hooks:
        in:  [guardian.job.submit, guardian.ncp.message, guardian.cli.exec]
        out: [guardian.job.complete, guardian.job.error, guardian.gap.opened, guardian.artifact.saved]

    - id:          nexus.cortex
      label:       Cortex
      port:        3748
      comp_type:   memory
      provides:
        - capability.jaa_persistence
        - capability.cfr_field
        - capability.intelligence_patterns
        - capability.reflection_contracts
      hooks:
        in:  [cortex.insert, cortex.query, cortex.cfr.record]
        out: [cortex.pattern.crystallised, cortex.escalation, cortex.jaa.decayed]

    - id:          nexus.orchestrator
      label:       Orchestrator
      port:        9000
      comp_type:   router
      provides:
        - capability.service_registry
        - capability.sse_broadcast
        - capability.api_proxy
      hooks:
        in:  [orchestrator.register, orchestrator.route]
        out: [orchestrator.registered, orchestrator.broadcast]

    - id:          nexus.idearium
      label:       Idearium
      port:        4800
      comp_type:   knowledge
      provides:
        - capability.idea_capture
        - capability.spec_storage
        - capability.gap_proposals
      hooks:
        in:  [idearium.idea.create, idearium.spec.save]
        out: [idearium.idea.created, idearium.tension.computed]

    - id:          nexus.architect
      label:       Architect
      port:        3747
      comp_type:   design
      provides:
        - capability.spec_build
        - capability.blueprint_view
        - capability.hook_registry
        - capability.template_library
        - capability.architecture_map
      hooks:
        in:  [architect.spec.build, architect.canvas.export, architect.template.apply]
        out: [architect.spec.created, architect.blueprint.built, architect.tension.found]


  # ── New organism classes ──────────────────────────────────────────────────
  #
  # These don't exist yet. They emerge naturally from the phasemap.
  # Each is a sovereign autonomous unit. Each runs on the bus.
  # Each has a spec before any code.
  #
  new_organism_classes:

    automation:
      description: >
        Organisms that watch the bus and trigger actions automatically.
        No UI required. Triggered by events, timers, or gap conditions.
        The equivalent of ERAVOS behaviors — but for NEXUS system events.
      examples:
        - nexus.organism.gap-healer       # watches for high-severity gaps, dispatches repair jobs
        - nexus.organism.seam-watchdog    # detects stalled SEAM queues, re-dispatches
        - nexus.organism.artifact-linker  # links new artifacts to open ideas in Idearium
        - nexus.organism.session-logger   # compresses session events to chat_log nightly
        - nexus.organism.tension-alerter  # emits alert when CFR sigma crosses threshold

    orchestration:
      description: >
        Organisms that coordinate multi-step workflows across providers.
        Think: conductor. It sends to Claude, waits, sends result to Mistral,
        waits, synthesizes, returns. All via NCP dispatch + job poll.
        No hardcoded logic — driven by a spec/recipe.
      examples:
        - nexus.organism.pipeline         # multi-provider sequential chain
        - nexus.organism.consensus        # same prompt → N providers → vote/merge
        - nexus.organism.critique-loop    # generate → critique → revise (N rounds)
        - nexus.organism.seam-forge       # idea → spec → build → test (FORGE phases)

    cognitive:
      description: >
        Organisms that process information and produce structured output.
        Gap analysis, pattern synthesis, proposal generation.
        Uses Ollama (Mistral/Qwen) — local, sovereign.
      examples:
        - nexus.organism.gap-analyst      # classifies gaps by pattern + proposes fixes
        - nexus.organism.pattern-miner    # reads event log, crystallizes recurring sequences
        - nexus.organism.spec-generator   # idea text → full spec (FORGE format)
        - nexus.organism.context-narrator # assembles 7-layer context → plain English summary

    sensory:
      description: >
        Organisms that watch external state and translate it into NEXUS events.
        The boundary between the outside world and the NEXUS bus.
      examples:
        - nexus.organism.file-watcher     # drop file → organism mounts (ERAVOS install_behavior)
        - nexus.organism.clock            # precision timer, BPM/interval emitter
        - nexus.organism.web-probe        # HTTP health probe → gap if down
        - nexus.organism.git-sentinel     # watches git log, emits on commit/branch

    interface:
      description: >
        Organisms that provide user-facing interaction surfaces.
        UI shells, consoles, dashboards, REPL prompts.
      examples:
        - nexus.organism.co-pilot         # (already exists — guardian/agents/co-pilot)
        - nexus.organism.forge-console    # spec → build console (FORGE phases)
        - nexus.organism.map-viewer       # live architecture map from component registry
        - nexus.organism.timeline-replay  # replay causal ledger events visually


  # ── Behavior layer ────────────────────────────────────────────────────────
  #
  # Behaviors are cross-cutting modifiers. Applied to any organism.
  # They do not modify the organism — they intercept bus events.
  # Identical concept to ERAVOS behaviors.
  #
  behaviors:

    - id:   nexus.behavior.autolog
      description: Every organism event logged to JAA automatically
      triggers:    [bus.*]
      effects:     [jaa.insert event_log]

    - id:   nexus.behavior.rate-limit
      description: Throttle any organism's output hook (tokens/sec or calls/min)
      config:      [max_calls, window_ms, on_exceed: drop|queue|error]

    - id:   nexus.behavior.circuit-breaker
      description: Open circuit after N failures, reset after timeout
      config:      [threshold, reset_ms, fallback_text]

    - id:   nexus.behavior.retry
      description: Retry on error with exponential backoff
      config:      [max_retries, base_delay_ms, on_exhaust: gap|error]

    - id:   nexus.behavior.snr-gate
      description: Drop events below signal threshold before dispatch
      config:      [threshold, on_noise: drop|log|gap]


  # ── Genome layer ──────────────────────────────────────────────────────────
  #
  # A genome is a species definition for a class of work.
  # It declares preferred organisms, behaviors, and layout rules.
  # Instantiate a genome to get a ready-to-work environment.
  #
  genomes:

    - id:          nexus.genome.forge-session
      label:       Forge Session
      description: Environment for building a new NEXUS component from spec
      archetypes:
        - nexus.organism.co-pilot
        - nexus.organism.seam-forge
        - nexus.organism.gap-analyst
        - nexus.organism.spec-generator
      behaviors:
        - nexus.behavior.autolog
        - nexus.behavior.circuit-breaker
      layout:
        primary:   forge-console
        secondary: map-viewer

    - id:          nexus.genome.diagnostic
      label:       Diagnostic Session
      description: Environment for understanding what's broken and why
      archetypes:
        - nexus.organism.co-pilot
        - nexus.organism.gap-healer
        - nexus.organism.gap-analyst
        - nexus.organism.tension-alerter
      behaviors:
        - nexus.behavior.autolog
        - nexus.behavior.rate-limit
      layout:
        primary:   gap-dashboard
        secondary: cfr-field-view

    - id:          nexus.genome.research
      label:       Research Session
      description: Multi-provider research and synthesis environment
      archetypes:
        - nexus.organism.pipeline
        - nexus.organism.consensus
        - nexus.organism.critique-loop
        - nexus.organism.context-narrator
      behaviors:
        - nexus.behavior.autolog
        - nexus.behavior.snr-gate


  # ── Ecosystem layer ───────────────────────────────────────────────────────
  #
  # An ecosystem is a complete, installable configuration.
  # Drop it in — genome + behaviors + theme + starter recipe.
  # Same concept as ERAVOS ecosystems.
  #
  ecosystems:

    - id:          nexus.ecosystem.builder
      label:       Builder
      genome:      nexus.genome.forge-session
      behaviors:   [nexus.behavior.autolog, nexus.behavior.retry]
      recipe:      nexus.recipe.new-organism
      description: Complete environment for building new NEXUS organisms from spec

    - id:          nexus.ecosystem.healer
      label:       Healer
      genome:      nexus.genome.diagnostic
      behaviors:   [nexus.behavior.autolog, nexus.behavior.circuit-breaker]
      recipe:      nexus.recipe.gap-sweep
      description: Complete environment for gap analysis and repair dispatch


  # ── Recipe layer ──────────────────────────────────────────────────────────
  #
  # A recipe is a deterministic multi-step procedure.
  # Each step is a named operation with declared dependencies.
  # Identical concept to ERAVOS recipes.
  #
  recipes:

    - id:   nexus.recipe.new-organism
      label: New Organism
      steps:
        - step_id:  no.1
          op:       spec-generator
          input:    user_description
          output:   organism.spec
        - step_id:  no.2
          op:       hostile-review
          input:    organism.spec
          depends:  [no.1]
        - step_id:  no.3
          op:       seam-forge
          input:    organism.spec (reviewed)
          depends:  [no.2]
          phases:   [4,5,6,7]

    - id:   nexus.recipe.gap-sweep
      label: Gap Sweep
      steps:
        - step_id:  gs.1
          op:       gap-analyst
          input:    current open gaps
          output:   gap analysis + repair proposals
        - step_id:  gs.2
          op:       co-pilot
          input:    repair proposals
          depends:  [gs.1]
          dispatch: ollama (Mistral)


  # ── Mapping to ERAVOS concepts ────────────────────────────────────────────
  eravos_mapping:

    ERAVOS organism     → NEXUS organism (service unit, bus interface, hooks)
    ERAVOS behavior     → NEXUS behavior (cross-cutting modifier, event interceptor)
    ERAVOS genome       → NEXUS genome   (archetype set for a class of work)
    ERAVOS ecosystem    → NEXUS ecosystem (complete installable configuration)
    ERAVOS recipe       → NEXUS recipe   (deterministic multi-step procedure)
    ERAVOS wire         → NEXUS wire     (bus event subscription + NCP dispatch)
    ERAVOS space        → NEXUS space    (UI topology: canvas, timeline, node-graph, terminal)
    ERAVOS hook         → NEXUS hook     (named, typed, versioned connection point)
    ERAVOS capability   → NEXUS capability (declared provided/required interfaces)


  # ── Build order ───────────────────────────────────────────────────────────
  build_order:
    1: Component registry — organism identity schema
    2: Hook registry — declare hooks for existing services
    3: Bus topology — map existing bus events to hook declarations
    4: Wire registry — manage organism-to-organism connections
    5: Organism runtime — mount/unmount/status for each organism class
    6: Behavior runtime — behavior application and event interception
    7: Genome instantiator — apply genome to spin up matched organisms
    8: Recipe executor — deterministic step-by-step procedure runner
    9: Ecosystem installer — drop-in zip that boots a complete environment
    10: UI — organism map, wire viewer, genome picker, recipe console

  next_to_build:
    - nexus.organism.gap-healer (automation, high value, low complexity)
    - nexus.organism.seam-watchdog (automation, closes active log bug)
    - nexus.organism.spec-generator (cognitive, unlocks forge-from-description)
    - nexus.recipe.new-organism (recipe, closes the loop on idea→spec→build)
