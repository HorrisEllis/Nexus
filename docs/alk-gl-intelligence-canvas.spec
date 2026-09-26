spec:
  meta:
    name:        alk-gl-intelligence-canvas
    version:     0.1.0
    status:      proposed
    uuid:        nexus-alk-gl-intelligence-v1-0000-2026-0701-jamesbrooks-001
    axioms:      [§5.7, §5.8, §2.3, §AX-002]
    depends_on:
      - ui/eravos/runtime/alk-gl.js         # the renderer — unchanged
      - ui/eravos/runtime/canvas-cfr.js     # the existing driver pattern to follow
      - ui/eravos/organisms/nexus-shared/nexus-node-core.js  # organism health bus
      - lib/cfr/field.js                    # live CFR field state
      - lib/nerve/index.js                  # Nerve snapshot (nodes + presence)
      - cortex/core/raid/simulation.js      # simulation results (Phase 5)
      - unintegrated/rfr2-nexus/delta       # delta S/C fields
    purpose: >
      ALK-GL is a WebGL2 particle field engine where each particle responds
      to attractor gravity and a global field (entropy/structure/curl/damping).
      canvas-cfr.js already drives ALK-GL from audio — organisms are attractors,
      audio RMS drives structure, frequency bands drive entropy and curl, kernel
      faults inject stress. This is the exact pattern needed. The only missing
      piece is a new driver that reads from the intelligence system instead of
      audio. ALK-GL itself is untouched. The Eravos wire system and the 7
      NEXUS diagnostic organisms (already live in Eravos as attractors) are
      untouched. One new module replaces one data source.

      What it visualizes: the intelligence system's live mind.
        Attractor positions → sovereign systems in space
        Attractor mass      → system health (sigma-derived)
        field.entropy       → CFR entropy (disorder accumulating in the system)
        field.structure     → CFR coherence (how aligned everything is)
        field.curl          → CFR friction (turbulence/resistance in relationships)
        field.damping       → CFR resonance inverse (how fast disturbances decay)
        injectStress()      → sigma spike / fault event / gap opening
        particle color      → f(entropy, structure, speed) — already encodes field state
        RFR2 S-field        → latency anomaly → temporary curl spike
        RFR2 C-field        → structural deviation → attractor mass shift
        simulation result   → pre-commit: attractor dims during simulation,
                              brightens on commit, pulses red on fault

  the_existing_driver_pattern:
    canvas_cfr_audio: >
      canvas-cfr.js drives ALK-GL from audio:
        analyser RMS              → field.structure (EMA-smoothed)
        sub-band energy           → field.entropy
        hi-band energy            → field.curl
        beat detected             → injectStress at attractor position
        kernel:fault event        → entropy spike + stress inject
      This is the exact pattern for the intelligence driver.
      canvas-intelligence.js replaces audio inputs with intelligence data.
      Every other line is the same.

  cfr_to_alk_gl_mapping:
    direct_field_uniforms:
      field.entropy:   cfr.entropy         # disorder → particle chaos
      field.structure: cfr.coherence       # alignment → particle organization
      field.curl:      cfr.friction        # resistance → turbulence/vorticity
      field.damping:   1.0 - cfr.resonance # resonance inverse → decay rate
    notes: >
      These are not metaphors. ALK-GL's GLSL compute shader uses entropy to
      inject random velocity (vel += random * u_ent), structure as attractor
      gravity weight (u_str), curl as curl-noise magnitude (cn * u_curl).
      High CFR entropy → visibly chaotic particle motion. High CFR coherence
      → organized, structured flow toward attractors. High friction → turbulent
      swirling. These are the same physical phenomena at different scales.

  attractor_mapping:
    each_sovereign_system: >
      Each of the 10 sovereign systems maps to one attractor:
        id:   system name (matches nexus-node-core.js's cfg.key)
        x, y: world position — can be fixed (spoke layout matching Nerve) or
              force-directed over time
        mass: computed from system health
    mass_from_health: >
      mass = (1.0 - sigma_for_this_system) * base_mass

      When a system is healthy (sigma low), it's a strong attractor — particles
      flow toward it. When a system is stressed (sigma high), mass drops — the
      attractor weakens, particles scatter from it. The particle field literally
      shows which systems are pulling the cognitive mass and which are losing it.
    real_position_data: >
      nexus-node-core.js already polls each system's /api/status at 4s intervals
      and publishes to the organism sBus as org:state_sync. The intelligence
      driver subscribes to this bus — same sovereign consumer pattern, no direct
      import. The health data for mass computation is already flowing.

  stress_injection_events:
    sigma_spike: >
      When sigma-writer emits sigma.composite.halt_risk or any event pushes
      sigma above 0.5, canvas-intelligence.js calls:
        _engine.injectStress(systemX, systemY, 0, strength, radius)
      where strength = sigma * 800 and radius = 3 + sigma * 4.
      This fires a shockwave in the particle field exactly at the affected
      system's attractor position. The system that's stressed is the epicenter.
    gap_opened: >
      When a gap opens (gap-predicate emits gap.found with severity HIGH),
      injectStress fires at the attractor of the system that owns the gap.
      Gap severity → stress strength: LOW=200, MEDIUM=400, HIGH=700, CRITICAL=1000.
    fault_classification: >
      RAID simulation faults (from simulation.js) fire targeted stresses:
        CONSTITUTIONAL: max stress (1000) at the violating system's attractor
        INTEGRITY: stress proportional to sigma at all systems in the relationship
        KNOWLEDGE: small stress (150) at the requesting system — gentle signal
        CAPABILITY: medium stress (350) at the failing agent's attractor
    dispatch_commit: >
      When RAID commits a dispatch (simulation clean, outcome follows):
        attractor dims slightly (mass * 0.85) during in-flight period
        on success (recordOutcome positive): brief mass spike (mass * 1.1)
        on failure (recordOutcome negative): injectStress at agent attractor
      The particle field shows jobs in flight — not as icons, as field dynamics.
    rfr2_delta: >
      RFR2 S-field (latency anomaly) fires a temporary curl spike:
        field.curl = base_curl + s_field_score * 0.4  (EMA-smoothed, decays in ~2s)
      RFR2 C-field (structural deviation) fires a mass shift on affected attractor:
        mass -= c_field_score * 0.3  (recovers over 10s)
      An event with both high S and C fields fires both + injectStress.

  simulation_pre_commit_visual:
    description: >
      During the 50-200ms a RAID simulation runs (before dispatch commits),
      the proposed agent's attractor pulses:
        mass oscillates: base_mass + sin(t * 8) * 0.3  (rapid shimmer)
        color shifts toward the fault recommendation:
          'commit' recommendation: attractor shifts toward cyan (coherent)
          'fallback' recommendation: attractor shifts toward amber
          'escalate': attractor shifts toward red + stress inject
          'inconclusive': mass slightly reduced, no color shift
      When the simulation resolves, the attractor snaps back to its sigma-derived
      mass. The field shows the system deliberating before committing — not after.

  relationship_shape_visualization:
    description: >
      The CFR field shape of a specific relationship (e.g. guardian→cortex)
      can be visualized as a targeted curl field between two attractors:
        high coherence: particles between them flow smoothly, linearly
        high friction: particles between them spiral or scatter
        high resonance: particles between them oscillate rhythmically
        high entropy: particles between them move chaotically
      This isn't a separate renderer — it's the global field but with the
      attention center set between the two attractors (Nerve's setAttentionCenter),
      which causes the field dynamics to concentrate there.

  the_driver_module:
    file:    ui/eravos/runtime/canvas-intelligence.js
    pattern: follows canvas-cfr.js exactly — same boot(), same _rafLoop(),
             same ALK-GL integration. Different data source.
    exports: window.CanvasIntelligence
    public_surface:
      boot(hostEl):          initializes ALK-GL, starts polling intelligence data
      setAttentionTarget(id): focuses field dynamics on a specific system
      dimSystem(id):          manually reduce a system's attractor mass
      flashSystem(id, color): brief color override (for alert highlighting)
      pause() / resume():     halt/resume field updates (for when UI is backgrounded)

    data_sources:
      primary:  GET /api/guardian/nerve/snapshot  (Nerve — nodes + field + stresses)
                polled every 2s (same as Nerve canvas)
      secondary: org:state_sync bus events from nexus-node-core.js organisms
                (for per-system health to compute attractor mass)
      tertiary:  RAID simulation events (when simulation.js exists, Phase 5)
                emitted on the Eravos kernel bus as raid:simulation.result

    sovereign_consumer: >
      canvas-intelligence.js fetches data over HTTP (§5.7 — no direct imports
      between sibling modules). It reads from /nerve/snapshot (guardian proxy
      to cortex) the same way the nerve canvas does. The Eravos organism bus
      (sBus/gBus) carries health events — same bus every organism already uses.
      ALK-GL is a renderer that lives inside Eravos — no NEXUS module import.

  what_it_looks_like:
    calm_system: >
      10 attractors in a spoke or force-directed layout. Particles flow in
      organized, laminar streams toward the strongest attractors (healthiest
      systems). The field is coherent — cool cyan/blue coloring (low entropy,
      high structure). The guardian and cortex attractors are large (healthy,
      low sigma). Everything is doing what it's supposed to.

    one_system_stressed: >
      Guardian's attractor shrinks (sigma rising). Particles that were flowing
      toward it begin to scatter. A stress shockwave ripples outward from
      guardian's position when the gap opens. The curl increases near guardian
      as friction in its relationships rises. The rest of the field remains
      organized but particles near guardian orbit chaotically.

    sigma_approaching_halt: >
      As sigma approaches 0.7 (autonomous loop halt threshold), field.entropy
      climbs toward 0.8. Particles throughout the field become chaotic. Multiple
      stress shockwaves have propagated and their rings are visible, overlapping.
      Color shifts toward warm amber and red (entropy coloring in the render
      shader). The field looks like a system under stress — because it is.

    dispatch_in_flight: >
      An ollama dispatch: the ollama attractor dims slightly. Particles that were
      orbiting it begin a slow spiral outward. 200ms later: clean outcome, mass
      snaps back. The particle field inhales and exhales with each job.

    raid_simulation_running: >
      The proposed agent's attractor shimmers rapidly (mass oscillation).
      The field around it destabilizes slightly. When the simulation resolves:
      if clean, the attractor stabilizes and the dispatch dims it as above.
      If faulted, the attractor briefly flashes the fault color and injectStress
      fires — the simulation's "no" is visible in the field before the dispatch
      is rerouted.

  what_is_not_built:
    blendshape_layer: >
      canvas-cfr.js supports 29 MediaPipe facial blendshapes driving the field
      (eye blink = collapse+shockwave at iris, jaw open = attractor expansion,
      etc). The intelligence driver doesn't use this. It's a canvas-cfr feature
      for the audio-visual use case — not needed for the mind visualization.
      May be worth exploring later: mapping the user's emotional state (if
      captured) onto the field layer on top of intelligence data.
    force_direction: >
      Attractor positions are fixed (spoke layout, same as Nerve) in Phase 1.
      A force-directed layout that responds to relationship strength (high
      coherence = attractors pull closer, high friction = attractors repel)
      is possible in Phase 2 using RFR2's delta S-field as the force magnitude.

  build_order:
    - "1. canvas-intelligence.js — boot(), ALK-GL init, Nerve snapshot polling"
    - "2. Attractor setup from Nerve nodes — upsertAttractor per system"
    - "3. CFR field mapping — entropy/coherence/friction/resonance → field uniforms"
    - "4. Stress injection from sigma events — subscribe to sigma-writer bus output"
    - "5. Gap-opened stress injection — subscribe to gap-predicate events"
    - "6. Per-system mass from nexus-node-core health events"
    - "7. (Phase 5, after raid-simulation-engine.spec) — simulation pre-commit visual"
    - "8. (Phase 6) — RFR2 delta S/C fields → curl spike + mass shift"
    - "9. Relationship shape focusing — setAttentionCenter() between two attractors"
