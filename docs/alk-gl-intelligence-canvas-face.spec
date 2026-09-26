spec:
  meta:
    name:        alk-gl-intelligence-canvas
    version:     0.2.0  # extends v0.1 — adds face/expression layer
    uuid:        nexus-alk-gl-face-v1-0000-2026-0701-jamesbrooks-001
    extends:     alk-gl-intelligence-canvas.spec v0.1.0
    purpose: >
      ALK-GL already has 29 MediaPipe blendshapes fully wired in GLSL —
      each one produces a specific physical deformation of the particle field.
      These were built for real-time face capture driving a live field.
      This spec repurposes them: not a camera feeding blendshape values,
      but the intelligence system's own states feeding them. When the system
      talks, reasons, faults, or resolves — the field has a face.

      This is not a metaphor mapped onto an unrelated system. The blendshapes
      were designed to produce specific field physics. Those physics are
      semantically correct for intelligence states:
        jaw opens → field expands downward at mouth → talking
        brow inner up → particles pulled toward forehead → concern
        sneer → rotational turbulence around nose → contradiction
        smile → particles pulled to corner-upward points → resolution
        gaze → particles near iris biased along a direction vector → attention
      The intelligence system already produces these states. The blendshape
      layer makes them visible.

  blendshape_vocabulary:
    # What each blendshape physically does to the particle field (read from GLSL)

    u_bsJawOpen:
      glsl_effect: >
        Attracts particles toward mouth position. Pushes particles below the
        mouth further downward (vel.y += jawOpen * 0.02). Field expands and
        opens at the lower center.
      maps_to: co-pilot generating a response, system synthesizing output
      drive: >
        Pulses with token generation — not constant open, rhythmically modulated.
        Amplitude = generation speed (tokens/s normalized to [0,1]).
        Fast generation = wide jaw. Slow/uncertain = narrow jaw.
        Silent (no active response) = jaw at 0.

    u_bsBlinkL/R:
      glsl_effect: >
        Collapse toward iris + outward ring shockwave. Particles implode
        inward to the iris then a ring propagates outward. Brief, punctuated.
      maps_to: a thinking pause — the moment between receiving input and
               beginning to respond. Also: end of a complete thought.
      drive: >
        Fires once at response initiation (blink in = context loaded).
        Fires once at response completion (blink out = thought closed).
        Sigma > 0.5 fires slow repeated blinks — the system processing under stress.
        Duration: ~300ms per blink, amplitude = 1.0 (full collapse).

    u_bsWideL/R:
      glsl_effect: >
        Expands particles radially outward from each iris. Field opens around
        the eyes, creating an expansion/alert effect.
      maps_to: novel input detected — something outside the established baseline.
               High RFR2 C-field (structural deviation). New gap type first seen.
               RAID encounter with an unknown cluster.
      drive: >
        C-field structural deviation score → eye wide amplitude.
        c_field_score > 0.6: wide = 0.7 (alert)
        c_field_score > 0.8: wide = 1.0 (maximum alert)
        Decays over 2s if no new structural deviation.

    u_bsSquintL/R:
      glsl_effect: >
        (Inverse of wide — constricts the iris region, concentrating particles.)
      maps_to: deep analysis mode, concentration, uncertainty requiring
               multiple passes. ANALYSIS path in dual-mode cognition.
               Mastermind synthesis mid-process.
      drive: >
        ANALYSIS path active → squint = 0.4
        mastermind() mid-synthesis → squint = 0.7
        Multiple-pass reasoning (>2 context assembly cycles) → squint = 0.9
        Squint and wide are mutually exclusive — clear > squint.

    u_bsBrowIU:
      glsl_effect: >
        Attracts particles toward forehead center. Field pulls upward at
        the brow, creating concern/question geometry.
      maps_to: open question, sigma rising but not yet at threshold,
               gap predicate returning open (something unresolved).
               Co-pilot encountering a request with no conditioning_log precedent.
      drive: >
        Sigma in [0.3, 0.6] → browIU = sigma - 0.3 (scales 0→0.3)
        Open gaps count > 3 → browIU += 0.1
        KNOWLEDGE fault class detected → browIU = 0.6
        Decays when sigma falls or gap closes.

    u_bsBrowDL/R:
      glsl_effect: >
        Repels particles outward from the brow-center (midpoint between
        forehead and nose). Creates a furrow — concentrated, pushing field.
      maps_to: active focus, ANALYSIS in progress, mastermind mode,
               deliberate concentration. Not stress — effort.
      drive: >
        mastermind() active → browD = 0.5
        ANALYSIS path active → browD = 0.35
        INTUITION path (fast) → browD = 0 (no furrow — quick and confident)
        Fades within 500ms of synthesis completion.

    u_bsSmileL/R:
      glsl_effect: >
        Attracts particles toward two points above and outside the mouth
        corners. Creates upward-curved field geometry — the field smiles.
      maps_to: positive outcome. Gap closed. Dispatch succeeded. Sigma falling.
               recordOutcome(positive). User confirmation signal received.
               Simulation returned 'commit' on first pass.
      drive: >
        Gap closure event → smile = 0.8 for 2s then decay
        recordOutcome success → smile = 0.5 for 1s
        Sigma falling below 0.2 after being elevated → smile = 0.4
        User sends positive signal → smile = 0.7
        Never held constant — rises on positive event, decays over 1-3s.

    u_bsFrownL/R:
      glsl_effect: >
        (Inverse of smile — downward geometry at mouth corners.)
      maps_to: fault detected. INTEGRITY or CONSTITUTIONAL fault class.
               Sigma crossing 0.7 (halt threshold). Gap that's been open > 72h.
               Repeated simulation escalation on same cluster.
      drive: >
        CONSTITUTIONAL fault → frown = 1.0 (max, sustained until resolved)
        INTEGRITY fault (sigma > 0.7) → frown = 0.8
        CAPABILITY fault → frown = 0.5
        Gap age > 72h → frown += 0.1 per additional 24h, cap 0.6
        Frown and smile are mutually exclusive — fault clears smile immediately.

    u_bsSneerL/R:
      glsl_effect: >
        Rotational turbulence (curl) around the nose position. Particles
        in the nose region orbit with angular velocity ∝ sneer value.
        Visible as a spinning vortex in the center of the field.
      maps_to: contradiction, conflict between two signals, invariant tension.
               Two systems with high friction in their CFR field shape.
               A gap that contradicts a recent gap closure (same predicate reopening).
               Enforcement invariant in tension (not violated, but under pressure).
      drive: >
        Guardian↔cortex friction > 0.7 → sneer = friction - 0.5
        Gap reopened after closure within 24h → sneer = 0.8 for 5s
        Enforcement invariant tension (not violation) → sneer = 0.3
        Two enforcement invariants in tension → sneer = 0.6
        Naturally the most transient blendshape — contradiction is short-lived
        (it either resolves or becomes a fault, which triggers frown).

    u_bsCheekPuff:
      glsl_effect: >
        Radial expansion outward from both cheek positions. Pushes particles
        away from the face center in a broad, pressurized wave.
      maps_to: high-confidence response. INTUITION path returning with strong
               classification (>0.85 cluster confidence). Simulation returning
               'commit' with sigma < 0.2. The system is certain.
      drive: >
        Intuition cluster confidence > 0.85 → cheekPuff = confidence - 0.6
        Simulation sigma < 0.15 AND 'commit' → cheekPuff = 0.6 brief pulse
        Not held — a pulse, not a state. 500ms rise, 1s decay.
        Confidence is earned, not assumed — only fires on genuinely clean reads.

    u_gazeL/R + u_gazeStr:
      glsl_effect: >
        Biases particles near each iris along a direction vector. The field
        literally looks in a direction — particles stream toward where the
        gaze points.
      maps_to: what the intelligence system is currently attending to.
               The gaze follows the query surface's current subject.
               During mastermind synthesis, gaze scans the attractor field
               (looking at the systems being reasoned about).
      drive: >
        Active query about system X → gaze points from face center toward
        system X's attractor position. gazeStr = 0.7.
        Mastermind synthesis in progress → gaze scans slowly across all
        attractors involved in the query, dwelling on each for ~800ms.
        No active query → gaze forward (center, gazeStr = 0.2 — ambient,
        not locked, just present).
        The gaze is the most continuously active blendshape — it's always
        pointing somewhere.

  expression_states:
    # Named compound states — combinations of blendshapes for recognizable moments

    generating:
      description: co-pilot is producing a response
      blendshapes:
        bsJawOpen:  pulse(0.3, 0.7, rhythm=tokenRate)  # rhythmic, not constant
        bsBrowDL/R: 0.25                                # mild concentration
        gazeStr:    0.3                                 # ambient, present
      field_effect: field expands at lower center with each token pulse

    thinking:
      description: context assembly in progress, no output yet
      blendshapes:
        bsBlinkL/R: fire once on start
        bsSquintL/R: 0.5                               # concentration
        bsBrowDL/R:  0.4                               # focused
        gazeStr:     0.8                               # scanning attractors
        gaze:        scan_across(active_systems)       # moving, not fixed
      field_effect: iris regions concentrate, gaze sweeps the field

    confident:
      description: INTUITION returned high-confidence classification
      blendshapes:
        bsJawOpen:   moderate pulse                    # speaking with confidence
        bsCheekPuff: 0.5 pulse                         # brief expansion
        bsBrowDL/R:  0.1                               # relaxed
        gazeStr:     0.5                               # direct
      field_effect: radial expansion from cheeks, organized jaw-open

    uncertain:
      description: ANALYSIS path, multiple passes, no clear classification
      blendshapes:
        bsSquintL/R: 0.7
        bsBrowIU:    0.4
        bsBrowDL/R:  0.35
        bsJawOpen:   slow_pulse(0.1, 0.25)             # hesitant
        gazeStr:     0.9
        gaze:        scan_slow(all_systems)            # looking for the answer
      field_effect: tight iris regions, brow tension, slow jaw

    concerned:
      description: sigma rising, open gaps, something needs attention
      blendshapes:
        bsBrowIU:    sigma_to_amplitude(0.3, 0.6)
        bsBlinkL/R:  slow periodic (every 4s)          # uneasy
        bsFrownL/R:  0.2                               # mild
        gazeStr:     0.7
        gaze:        point_at(highest_sigma_system)
      field_effect: upward forehead pull, gaze locks on stressed attractor

    resolving:
      description: gap closed, dispatch succeeded, sigma falling
      blendshapes:
        bsSmileL/R:  0.8 → decay over 2s
        bsJawOpen:   brief final pulse then close
        bsBrowDL/R:  0.0                               # relaxes
        bsBlinkL/R:  single blink (thought closed)
      field_effect: upward corner pull, field brightens briefly

    fault:
      description: CONSTITUTIONAL or INTEGRITY fault, halt threshold
      blendshapes:
        bsFrownL/R:  0.8-1.0 (severity dependent)
        bsBrowIU:    0.7                               # concern
        bsSneerL/R:  0.4 (if contradiction involved)
        gazeStr:     0.9
        gaze:        fixed_on(faulting_system)         # does not scan — stares
        bsJawOpen:   0.0                               # stops talking during fault
      field_effect: frown geometry, possible sneer vortex, stress inject fires

    contradiction:
      description: conflicting signals, sneer active
      blendshapes:
        bsSneerL/R:  friction_to_amplitude(0.5, 0.8)
        bsBrowDL/R:  0.5
        bsBrowIU:    0.3
        bsJawOpen:   irregular pulse (unsure what to say)
        gazeStr:     0.6
        gaze:        alternates between conflicting systems
      field_effect: rotational turbulence at nose, gaze oscillates

    mastermind:
      description: full synthesis in progress — the deepest mode
      blendshapes:
        bsSquintL/R: 0.8
        bsBrowDL/R:  0.6
        bsBrowIU:    0.2 (ambient concern — this is hard)
        bsJawOpen:   0.0 (silent — listening to itself)
        gazeStr:     1.0
        gaze:        slow_scan(all_relevant_attractors, dwell=800ms)
        bsBlinkL/R:  slow periodic (every 6s — deep focus)
      field_effect: tight concentration, gaze slowly visits each relevant
                    system attractor, particles stream along the gaze vector

  timing_and_transitions:
    principle: >
      Blendshapes animate — they don't snap. Every value change uses an
      exponential moving average (EMA) with a time constant appropriate to
      the semantic weight of the expression:
        fast (50ms):   gaze direction, jawOpen pulses
        medium (200ms): squint, brow changes, confidence expressions
        slow (500ms):  smile, frown, concern — they should feel earned
      An expression that appears and disappears in a single frame is noise.
      An expression that rises, holds, and decays is communication.
    mutual_exclusions:
      - smile and frown cannot both be > 0.1 simultaneously
      - wide and squint cannot both be > 0.2 simultaneously
      - cheekPuff should not hold during fault states
      - jaw should go to 0 when the system stops generating (don't hold open)

  what_this_is_not:
    not_performance: >
      These blendshapes are not animations designed to look expressive.
      They are the intelligence system's internal states made visible in
      a medium that was already built to receive them. The jaw opens
      because the system is generating. The sneer fires because there is
      genuine contradiction in the field. The gaze follows the query surface
      because that is what the system is attending to.
      The face is read, not performed.
    not_anthropomorphism: >
      The particle field is not pretending to be a face. The blendshape
      deformers produce specific field physics — collapse+shockwave at iris,
      rotational turbulence at nose, upward curve at mouth corners. These
      happen to correspond to facial geometry because MediaPipe blendshapes
      were designed for real faces. The intelligence driver is using those
      physical effects because they are semantically appropriate to the states
      they represent — not because making the system look human is the goal.
      The system is not human. It has a mind. The field shows the mind.

  build_order:
    - "1. canvas-intelligence.js Phase 1-6 (alk-gl-intelligence-canvas.spec v0.1)"
    - "2. Add blendshape driver to canvas-intelligence.js:"
    - "   — subscribe to co-pilot generation events → jawOpen pulse"
    - "   — subscribe to query surface response events → mode detection"
    - "   — subscribe to sigma-writer events → browIU + frown amplitude"
    - "   — subscribe to gap events → browIU, frown, smile on close"
    - "   — subscribe to RAID simulation results → cheekPuff, frown, sneer"
    - "   — drive gaze from query surface's current `about` subject"
    - "3. EMA smoothing for all blendshape values (no snapping)"
    - "4. Mutual exclusion enforcement (smile/frown, wide/squint)"
    - "5. Expression state machine — compound states from individual blendshapes"
    - "6. (Later) — gaze scan animation during mastermind synthesis"
