# ============================================================
# ERAVOS NEXUS BUILD CONTRACT
# spec_id:      eravos.nexus.build-contract
# version:      1.0.0
# author:       James Brooks
# status:       canonical
# conforms_to:  ERAVOS.kernel.spec v1.0.0
# ============================================================
#
# This document defines exactly how NEXUS reads an ERAVOS spec
# and produces a conforming zip output.
#
# Loading this spec into NEXUS gives it everything it needs
# to build any mod, workspace, behavior, genome,
# ecosystem, recipe, or pack from a spec file.
#
# NEXUS axioms still apply:
#   §1.1 nothing exists until proven
#   §1.2 nothing silently fails
#   §1.3 no stubs in production
#   §3.1 bottom-up only
#   §8.1 session context before build
#   §8.2 hostile review before spec
#   §8.3 SISO+Jaa are prerequisites

# ============================================================
# FORGE SKILL PROTOCOL — applied to every spec
# ============================================================

forge_protocol:

  before_phase_3:
    ask:
      1: What phase are we in / what was the last completed phase?
      2: What was the last state of the build?
      3: What bugs or failures are outstanding?
      4: What is the intent of this build session?
      5: Are SISO and Jaa present and confirmed?

  phases:
    0: Orient       — read full spec top to bottom, validate, surface gaps
    1: Brainstorm   — enumerate all components, hooks, wires, files needed
    2: Hostile      — find every assumption, ambiguity, missing fault mode
    3: Spec         — confirm spec is complete before any code written
    4: Build        — bottom-up: schema → engine → hooks → UI last
    5: Test         — every hook tested, every fault mode exercised
    6: UI           — projections built only after logic is proven
    7: Verify       — hostile review of output against spec, zero drift

  version_bump:     +0.1 per completed phase

  output_format:    zip conforming to eravos.pack.format.spec

# ============================================================
# NEXUS BUILD STEPS — for any mod spec
# ============================================================

nexus_build_mod:

  phase_0_orient:
    read:
      - Full spec file top to bottom
      - Kernel spec (ERAVOS.kernel.spec)
      - All referenced dependency specs
    validate:
      - spec_type is known
      - kernel_target is satisfiable
      - All hooks have schemas
      - All hooks have failure_modes
      - All relations reference real hook_ids
      - All config keys have types and defaults
      - All files listed in files{} are accounted for
      - All faults in raises_faults[] are in fault taxonomy
    surface:
      - Any ambiguous intent
      - Any hook without a declared schema
      - Any failure mode that is unnamed
      - Any dependency that has no spec
      - Any UI hook without a corresponding logic hook

  phase_1_brainstorm:
    enumerate:
      - All files to be produced
      - All hooks to implement
      - All bus topics to publish/subscribe
      - All config keys to wire to UI
      - All fault paths to handle
      - All test cases needed

  phase_2_hostile:
    challenge:
      - Can this hook receive an invalid payload? What happens?
      - What if audio_context is not ready when first trigger fires?
      - What if a dependency unmounts mid-session?
      - What if a wire target is removed?
      - What if a config value is out of range?
      - What if the UI sends an undeclared event_type?
      - What if two instances of this mod mount?
      - Does the UI leak any state to mod internals?
      - Does the mod reach into the UI DOM directly?
    resolution:
      - Every challenge must be answered with a named fault or explicit handling
      - No "it won't happen" answers accepted

  phase_3_spec_confirm:
    confirm:
      - Every hook is typed, directed, and has a schema
      - Every config key has a default, type, and range
      - Every fault in the taxonomy is handled
      - UI hooks are isolated — no direct DOM access
      - Build order is declared and bottom-up
      - Test coverage requirements are listed

  phase_4_build:
    order:
      1:  schema/[mod].schema.json
          - JSON Schema file for payload validation
          - Derived directly from hook schemas in spec
          - No hardcoded values

      2:  data/[mod].data.json
          - Static default data (banks, patterns, presets)
          - No logic — pure data

      3:  [mod].engine.js
          - Core mod logic
          - Imports: bus, audio, clock (from kernel)
          - No DOM access
          - No direct mod-to-mod calls
          - Every hook registered with bus
          - Every publish uses declared schema
          - Every subscribe validates payload schema
          - Every fault raises named error to bus

      4:  [mod].hooks.js
          - Hook registration and wire validation
          - Contract version checking
          - Rate limiting if declared

      5:  [mod].ui-bridge.js
          - Translates ui_hook events to mod calls
          - Translates mod state to ui_hook events
          - Schema validation on every message in both directions
          - No business logic — pure translation

      6:  ui/[mod].css
          - Scoped to mod root class
          - Uses only CSS custom properties from token system
          - No hardcoded colors

      7:  ui/[mod].html
          - Canvas projection
          - Only publishes ui_hook event_types
          - Only subscribes to mod_to_ui event_types
          - No access to mod engine scope
          - No global state
          - Every interactive element has a declared ui_hook

      8:  tests/[mod].test.js
          - One describe block per hook
          - Every hook: valid payload passes
          - Every hook: invalid payload raises RUNTIME_002
          - Every fault mode: exercise and confirm named fault
          - Every config key: out-of-range value handled
          - Performance mode: scope disabled confirmed
          - Edit mode: scope enabled confirmed

      9:  manifest.json
          - Generated last — after all files confirmed present
          - Lists every file in contents{}
          - Version matches spec_version

  phase_5_test:
    requirements:
      - All tests pass before UI is built
      - Every hook has at least one passing test
      - Every fault mode in raises_faults[] is exercised
      - No test stubs — real implementations only
      - Test output is deterministic

  phase_6_ui:
    requirements:
      - Built only after phase_5 passes
      - UI communicates only via ui_hooks
      - No direct calls to engine functions
      - No DOM manipulation from engine
      - Every control maps to exactly one ui_hook
      - Every display maps to exactly one mod_to_ui hook
      - Resizable, no content clip-off
      - × button wired to kernel:remove-mod

  phase_7_verify:
    checklist:
      - Every hook in spec exists in implementation
      - Every ui_hook in spec exists in UI
      - No undeclared bus.publish calls
      - No undeclared bus.subscribe calls
      - No DOM access from engine
      - No engine access from UI
      - manifest.json contents{} matches actual zip files
      - Version is bumped correctly
      - No stubs anywhere in output

# ============================================================
# NEXUS BUILD STEPS — for a workspace spec
# ============================================================

nexus_build_workspace:

  phase_0_orient:
    - Read workspace spec
    - Verify all mod_ids exist in registry or are in pack
    - Verify all wire hook_ids exist on declared mods
    - Verify all positions are within canvas bounds

  phase_4_build:
    order:
      1: Resolve mod dependency order
      2: Produce mod mount sequence
      3: Produce wire registration sequence
      4: Produce config application sequence
      5: Produce workspace.json (the loadable snapshot)

  output:
    workspace.json:   loadable snapshot conforming to workspace_spec

# ============================================================
# NEXUS PROMPT TEMPLATES
# How to invoke NEXUS to build any spec
# ============================================================

nexus_invocation:

  build_mod: |
    NEXUS FORGE — BUILD MOD
    Spec: [paste mod spec here]
    Kernel Spec: ERAVOS.kernel.spec v1.0.0
    Session Context: [what phase, what's done, what's outstanding]
    Intent: Build conforming zip output for this mod
    SISO: present
    Jaa: present

    Apply FORGE phases 0-7.
    Output: zip conforming to eravos.pack.format.spec
    Version: [current version]
    No stubs. No assumptions. Surface all gaps before phase 3.

  build_workspace: |
    NEXUS FORGE — BUILD WORKSPACE
    Spec: [paste workspace spec here]
    Active Mods: [list mounted mod ids]
    Intent: Produce loadable workspace snapshot
    Apply FORGE phases 0-7.

  build_pack: |
    NEXUS FORGE — BUILD PACK
    Mods to include: [list spec ids]
    Pack type: [mod | ecosystem | voice_pack | etc]
    Author: James Brooks
    Intent: [what this pack does]
    Apply FORGE phases 0-7.
    Output: zip with manifest.json + all mod zips

  build_from_description: |
    NEXUS FORGE — BUILD FROM DESCRIPTION
    Description: [natural language description of what to build]

    Before phase 3, NEXUS must:
    1. Generate a complete mod spec from the description
    2. Run phase 2 hostile review on that spec
    3. Confirm with James before proceeding to build
    4. Apply FORGE phases 3-7

    Kernel Spec: ERAVOS.kernel.spec v1.0.0
    No stubs. No guessing. Surface every ambiguity.

# ============================================================
# CANONICAL WIRE TYPE REFERENCE
# ============================================================

wire_types:

  event_bus:
    description:  Fire-and-forget via the bus
    latency:      async
    delivery:     best-effort
    use_when:     pad triggers, state updates, UI events, most hooks

  callto:
    description:  Direct invocation, awaited — like a function call
    latency:      sync or promise
    delivery:     guaranteed or throws
    use_when:     capability queries, request-response patterns

  api:
    description:  HTTP or WebSocket boundary crossing
    latency:      network
    delivery:     http semantics
    use_when:     remote mods, distributed plugins, agents on other machines

# ============================================================
# CANONICAL CAPABILITY REFERENCE
# ============================================================

capabilities:

  # Audio
  capability.audio_context:    AudioContext is initialized and running
  capability.audio_out:        Mod produces audio signal
  capability.audio_in:         Mod consumes audio signal
  capability.sample_source:    Mod can supply decoded audio buffers

  # MIDI
  capability.midi_in:          Mod receives MIDI messages
  capability.midi_out:         Mod sends MIDI messages

  # Rhythm / Time
  capability.clock_source:     Mod provides BPM clock
  capability.sequencer:        Mod provides step-sequenced trigger events
  capability.pad_trigger:      Mod provides pad trigger events
  capability.bank_select:      Mod provides bank selection

  # Arrangement
  capability.timeline:         Mod provides temporal clip arrangement
  capability.clip_store:       Mod stores and retrieves clips
  capability.seek:             Mod provides playhead seek capability
  capability.transport:        Mod provides play/stop/seek controls

  # Modulation
  capability.lfo:              Mod provides periodic modulation signal
  capability.envelope:         Mod provides ADSR envelope

  # Mixing
  capability.channel_strip:    Mod provides gain/pan/send routing
  capability.master_bus:       Mod provides master mix output

  # Intelligence
  capability.transcription:    Mod can transcribe speech to text
  capability.generation:       Mod can generate audio or MIDI

  # Meta
  capability.autosave:         Behavior provides automatic workspace save
  capability.clip_snap:        Behavior provides quantized clip positioning
