spec:
  meta:
    name:        nexus-shell-ui
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-shell-ui-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      The layered NEXUS UI. TV channel model.
      Layer 0 is the meta shell — always visible, never reloads.
      Layer 1 is the active channel — changes on click.
      Each system has its own sovereign, animated, alive page.
      Consistent design language. Each system has its own character.

  layers:
    layer_0:
      name: "Meta Shell"
      description: >
        Always visible. Never reloads. Floats above everything.
        Contains: floating menu button, system grid, status pulse,
        version badge, connection indicator.
      components:
        floating_menu:
          trigger: "⬡ button — bottom right, always visible"
          opens:   "system grid overlay"
        system_grid:
          layout:  "grid of system cards"
          systems: [orchestrator, cortex, guardian, idearium,
                    architect, emerge, diagnostic, bridge]
          click:   "changes Layer 1 to that system's channel"
          shows:   "system name, health dot, version, one-line purpose"
        status_bar:
          position: "top of meta shell"
          shows:    "active system name, health, open gaps count, session time"
        connection_indicator:
          shows:    "SSE connection state — live pulse when connected"

    layer_1:
      name: "System Channel"
      description: >
        The active system view. Changes like a TV channel.
        No page reload. CSS transition between channels.
        Each system is sovereign — its own design, animation, character.
        All share the same underlying data contract.
      bootstrap: >
        GET /api/contract → GET /api/components →
        POST /api/ui/register → GET /events (SSE)
      channel_transition: "CSS opacity fade + slide, 200ms"

  system_channels:

    orchestrator:
      character: "Control room. Sharp. Authoritative. Grid-based."
      color:     "#00d4ff"
      panels:
        - "Service map — all 8 services, health, trust state, uptime"
        - "Component registry browser — searchable, filterable"
        - "Live event stream — SSE feed with type filters"
        - "Version registry — all modules, all versions"

    cortex:
      character: "Living brain. Organic. Pulsing. Warm."
      color:     "#818cf8"
      panels:
        - "Gap board — open gaps, severity, friction bars"
        - "Memory — working memory read/write/forget"
        - "Intelligence — crystallised patterns, regime state"
        - "Liminal spaces — 5 focal points, velocity field"
        - "Escalation — 5-level ladder, friction per fault class"
        - "Engines — 12 diagnostic engines on demand"

    guardian:
      character: "Control tower. Precise. Alert. High contrast."
      color:     "#ff6b35"
      panels:
        - "Provider health — 5 NCP tabs, Ollama, connection state"
        - "Job queue — live jobs, provider used, duration, outcome"
        - "SEAM pipeline — chunk status, gate scores, retry history"
        - "RAID routing — last decisions, cluster weights"

    idearium:
      character: "Garden. Growing. Interconnected. Green."
      color:     "#00ff88"
      panels:
        - "Project board — phase columns (seed→complete)"
        - "Spec drop zone — drag in a .spec, watch it land"
        - "Idea lattice — resonance graph visualisation"
        - "Active builds — what's compiling right now"

    architect:
      character: "Blueprint room. Technical. Clean. Blue."
      color:     "#00d4ff"
      panels:
        - "Spec wizard — 11-dimension builder, step by step"
        - "Canvas — visual architecture drag-and-drop"
        - "Hook registry — registered hooks with contracts"
        - "Spec library — all specs, searchable"

    diagnostic:
      character: "Lab. Clinical. Data-dense. Monochrome."
      color:     "#b8cfe0"
      panels:
        - "12 engines — run all, see results"
        - "Friction table — fault classes, scores, trends"
        - "Failure modes — active human action items"
        - "System tension — per-service tension scores"
        - "Health timeline — service health over time"

    bridge:
      character: "Relay station. Minimal. Signal-focused."
      color:     "#ff2d55"
      panels:
        - "Trust registry — system trust states"
        - "Circuit breakers — OPEN/HALF_OPEN/CLOSED per system"
        - "Held requests — queued for replay"
        - "Identity tiers — UNKNOWN/CANDIDATE/MEMBER"

    liminal:
      character: "Atmospheric. Slow. Uncertain. Fog."
      color:     "#334466"
      panels:
        - "L0/L2 constitutional threshold"
        - "L1/L3 pattern-causality membrane"
        - "L2/L4 velocity field — runaway indicator"
        - "L3/L0 root terminus — hanging causal chains"
        - "L1/L2 coherence surface — open contradictions"
        - "Crystallisation events — live feed"

  assistant:
    description: >
      Inline assistant in every channel.
      Type a problem in plain language.
      Goes through the request handler.
      Intent extracted, gap logged to Cortex.
      Response synthesised from memory.
      Never assumes — asks for clarification if unclear.
    position: "bottom of every channel, collapsible"
    states:    [idle, thinking, clarifying, resolved, unresolved]

  editor_mode:
    description: >
      Any channel can switch to editor mode.
      Top layer becomes a full-screen code/spec editor.
      Monaco-style. Syntax highlighting for .spec format.
      Save → sends to Idearium automatically.
      Run → dispatches to spec-compiler.
    trigger: "⌨ button in top-right of any channel"

  tutorial_flow:
    description: >
      Step by step guided tour baked into the UI.
      Activated from meta shell → ? button.
      Walks through: boot → wizard → spec → Idearium → CLI.
      Each step highlights the relevant UI element.
      Progress tracked. Can resume where you left off.
    steps:
      1: "Boot check — are all 6/6 services online?"
      2: "Open Architect channel → click wizard"
      3: "Fill 11 dimensions → BUILD NOW"
      4: "Watch spec compile → UI navigates to Idearium"
      5: "Project lands as pending — see it in the board"
      6: "Switch to CLI → tab complete your new commands"
      7: "Run your commands → watch memory fill"
      8: "Check gaps → see if patterns started crystallising"

  design_system:
    font:        "monospace throughout — JetBrains Mono or system mono"
    background:  "#05080f — deep space dark"
    surface:     "rgba(6,6,12,0.98)"
    border:      "rgba(255,255,255,0.07)"
    accent:      "per-system color (see system_channels)"
    animation:   "subtle — nothing gratuitous, everything meaningful"
    grid:        "CSS grid, responsive, 12-column base"
    transitions: "200ms ease-out — channel switch, panel expand"
    badges:      "monospace, small, colored by severity/status"
    philosophy: >
      Every animation communicates state.
      Every color carries meaning.
      Nothing moves without reason.
      Alive but not chaotic.

  hotswap_test:
    - "Delete nexus-shell.html — system continues via CLI"
    - "Replace with different UI — bootstraps from registry"
    - "Open on different machine — same contract, same grammar"

  phases:
    current: "PENDING — Phase 16 (last)"
    depends_on: [Phase 9, Phase 10, Phase 11, Phase 12, Phase 13, Phase 14, Phase 15]
