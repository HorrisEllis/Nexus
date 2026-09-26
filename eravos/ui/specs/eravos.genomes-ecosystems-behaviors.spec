# ============================================================
# ERAVOS GENOME SPEC — MUSIC
# spec_id:      eravos.genome.music
# version:      1.0.0
# author:       James Brooks
# status:       canonical
# conforms_to:  ERAVOS.kernel.spec v1.0.0
# ============================================================

header:
  spec_id:         eravos.genome.music
  spec_version:    1.0.0
  spec_type:       genome
  kernel_target:   1.0.0
  author:          James Brooks
  created_at:      2026-06-22
  schema:          genome.schema.v1
  status:          canonical

identity:
  id:              eravos.genome.music
  label:           Music Production
  icon:            🎛
  description: >
    Species definition for music production environments.
    Preferred archetypes, behaviors, spaces, and layout
    rules for composing, arranging, and mixing.

archetypes:
  - eravos.pads
  - eravos.sequencer
  - eravos.timeline
  - eravos.sample-player
  - eravos.lfo
  - eravos.wobble-bass
  - eravos.acid-synth
  - eravos.reese-bass
  - eravos.channel
  - eravos.xy-pad

behaviors:
  - eravos.behavior.autosave
  - eravos.behavior.bpm-tap
  - eravos.behavior.clip-snap

spaces:
  - canvas
  - timeline
  - graph

default_space:    canvas

constraints:
  - constraint_id:  music.C-1
    predicate:      if timeline exists then transport must be wired
    failure_mode:   CONSTRAINT_001
    blocking:       false

  - constraint_id:  music.C-2
    predicate:      BPM must be consistent across all mounted mods
    failure_mode:   CONSTRAINT_001
    blocking:       false

layout_rules:

  - if_present:     eravos.timeline
    prefer_position:
      y_anchor:     bottom
      height:       240
    prefer_space:   canvas

  - if_present:     eravos.sequencer
    prefer_position:
      x_anchor:     right
      width:        580
    prefer_space:   canvas

  - if_present:     eravos.pads
    prefer_position:
      x:            40
      y:            30
    prefer_space:   canvas

recipes:
  - eravos.recipe.quick-beat
  - eravos.recipe.full-session

---

# ============================================================
# ERAVOS GENOME SPEC — PODCASTING
# spec_id:      eravos.genome.podcasting
# ============================================================

header:
  spec_id:         eravos.genome.podcasting
  spec_version:    1.0.0
  spec_type:       genome
  kernel_target:   1.0.0
  author:          James Brooks
  created_at:      2026-06-22
  schema:          genome.schema.v1
  status:          canonical

identity:
  id:              eravos.genome.podcasting
  label:           Podcasting
  icon:            🎙
  description: >
    Species definition for podcast editing and production.
    Voice-focused, timeline-first, minimal synthesis surface.

archetypes:
  - eravos.timeline
  - eravos.sample-player
  - eravos.channel
  - eravos.agent.transcriber
  - eravos.agent.librarian

behaviors:
  - eravos.behavior.autosave
  - eravos.behavior.clip-snap
  - eravos.behavior.magnetic-clips

spaces:
  - canvas
  - timeline

default_space:   timeline

constraints:
  - constraint_id:  podcast.C-1
    predicate:      timeline requires at least one audio lane
    failure_mode:   CONSTRAINT_001
    blocking:       false

layout_rules:

  - if_present:     eravos.timeline
    prefer_position:
      y_anchor:     center
      height:       400
    prefer_space:   canvas

  - if_present:     eravos.channel
    prefer_position:
      x_anchor:     right
      width:        160
    prefer_space:   canvas

---

# ============================================================
# ERAVOS ECOSYSTEM SPEC — PODCASTING
# spec_id:      eravos.ecosystem.podcasting
# ============================================================

header:
  spec_id:         eravos.ecosystem.podcasting
  spec_version:    1.0.0
  spec_type:       ecosystem
  kernel_target:   1.0.0
  author:          James Brooks
  created_at:      2026-06-22
  schema:          ecosystem.schema.v1
  status:          canonical

identity:
  id:              eravos.ecosystem.podcasting
  label:           Podcast Production
  icon:            🎙
  description: >
    A complete podcast editing culture. Drops in as a single
    zip. Installs genome, behaviors, theme, and starter recipe.
    Drop voice files. Timeline opens. Transcription agent mounts.

genome:            eravos.genome.podcasting

behaviors:
  - eravos.behavior.autosave
  - eravos.behavior.magnetic-clips
  - eravos.behavior.clip-snap

recipes:
  - eravos.recipe.voice-cleanup
  - eravos.recipe.interview-setup

theme:             eravos.theme.dark

constraints:
  - constraint_id:  podcast-eco.C-1
    predicate:      timeline.clip_snap must be enabled
    failure_mode:   CONSTRAINT_002
    blocking:       false

defaults:
  mode:            edit
  bpm:             120
  space:           canvas

---

# ============================================================
# ERAVOS RECIPE SPEC — QUICK BEAT
# spec_id:      eravos.recipe.quick-beat
# ============================================================

header:
  spec_id:         eravos.recipe.quick-beat
  spec_version:    1.0.0
  spec_type:       recipe
  kernel_target:   1.0.0
  author:          James Brooks
  created_at:      2026-06-22
  schema:          recipe.schema.v1
  status:          canonical

identity:
  id:              eravos.recipe.quick-beat
  label:           Quick Beat
  icon:            🥁
  description: >
    Mounts drum machine and sequencer, auto-wires them,
    loads default pattern. Ready to play in one drop.

steps:

  - step_id:       qb.1
    operation:     mount
    target:        eravos.pads
    payload:
      position:    { x: 40, y: 30 }
    depends_on:    []

  - step_id:       qb.2
    operation:     mount
    target:        eravos.sequencer
    payload:
      position:    { x: 340, y: 30 }
    depends_on:    [qb.1]

  - step_id:       qb.3
    operation:     wire
    payload:
      from:        { instance: eravos.sequencer, hook: seq.hook.fire_out }
      to:          { instance: eravos.pads,      hook: pads.hook.seq_fire_in }
    depends_on:    [qb.1, qb.2]

  - step_id:       qb.4
    operation:     wire
    payload:
      from:        { instance: eravos.pads,      hook: pads.hook.bank_change_out }
      to:          { instance: eravos.sequencer,  hook: seq.hook.bank_in }
    depends_on:    [qb.1, qb.2]

result:
  provides:
    - capability.pad_trigger
    - capability.sequencer
    - capability.clock_source
  workspace:       null

---

# ============================================================
# ERAVOS BEHAVIOR SPEC — AUTOSAVE
# spec_id:      eravos.behavior.autosave
# ============================================================

header:
  spec_id:         eravos.behavior.autosave
  spec_version:    1.0.0
  spec_type:       behavior
  kernel_target:   1.0.0
  author:          James Brooks
  created_at:      2026-06-22
  schema:          behavior.schema.v1
  status:          canonical

identity:
  id:              eravos.behavior.autosave
  label:           Autosave
  icon:            💾
  description: >
    Saves workspace snapshot to the causal ledger every
    N seconds. No UI. Runs silently in background.
    Triggered by timer or mod mount/unmount events.
  comp_type:       behavior
  comp_intent: >
    Automatically persist workspace state at configurable
    intervals without user intervention.

permissions:
  - bus_subscribe
  - ledger_read
  - filesystem_write

provides:
  - capability.autosave

requires: []

triggers:

  - event_type:    kernel:timer
    condition:     elapsed_seconds >= config.interval

  - event_type:    kernel:mod-mounted
    condition:     true

  - event_type:    kernel:mod-unmounted
    condition:     true

effects:

  - effect_id:     autosave.snapshot
    operation:     serialize_workspace
    target:        kernel.workspace
    payload:
      format:      json
      destination: config.save_path

config:
  - key:           interval
    type:          number
    default:       30
    min:           5
    max:           300
    unit:          s
    label:         Save Interval

  - key:           save_path
    type:          string
    default:       .eravos/autosave
    label:         Save Location

---

# ============================================================
# ERAVOS BEHAVIOR SPEC — CLIP SNAP
# spec_id:      eravos.behavior.clip-snap
# ============================================================

header:
  spec_id:         eravos.behavior.clip-snap
  spec_version:    1.0.0
  spec_type:       behavior
  kernel_target:   1.0.0
  author:          James Brooks
  created_at:      2026-06-22
  schema:          behavior.schema.v1
  status:          canonical

identity:
  id:              eravos.behavior.clip-snap
  label:           Clip Snap
  icon:            🔲
  description: >
    Quantizes clip positions to the nearest grid division
    on drag release. No UI. Intercepts ui:clip_move events
    and corrects position before mod receives them.
  comp_type:       behavior
  comp_intent: >
    Snap timeline clips to the nearest musical grid division
    during drag operations.

permissions:
  - bus_subscribe
  - bus_publish

provides:
  - capability.clip_snap

requires:
  - capability.timeline
  - capability.clock_source

triggers:

  - event_type:    ui:clip_move
    condition:     config.enabled === true

effects:

  - effect_id:     snap.quantize
    operation:     transform_event
    target:        ui:clip_move
    payload:
      transform:   quantize_to_grid
      resolution:  config.resolution

config:
  - key:           enabled
    type:          boolean
    default:       true
    label:         Snap Enabled

  - key:           resolution
    type:          enum
    default:       beat
    options:       [bar, beat, "1/2", "1/4", "1/8", "1/16", none]
    label:         Snap Resolution
