# ============================================================
# ERAVOS MOD SPEC — SEQUENCER
# spec_id:      eravos.mod.sequencer
# version:      1.0.0
# author:       James Brooks
# status:       canonical
# conforms_to:  ERAVOS.kernel.spec v1.0.0
# ============================================================

header:
  spec_id:         eravos.mod.sequencer
  spec_version:    1.0.0
  spec_type:       mod
  kernel_target:   1.0.0
  author:          James Brooks
  created_at:      2026-06-22
  updated_at:      2026-06-22
  schema:          mod.schema.v1
  status:          canonical

identity:
  id:              eravos.sequencer
  version:         1.0.0
  label:           Sequencer
  icon:            ⬛
  description: >
    16/32-step pattern sequencer with up to 16 tracks,
    swing, record mode, random pattern generation,
    BPM control, and phase bar display.
  comp_type:       engine
  comp_intent: >
    Step-sequence pad trigger events across multiple tracks,
    broadcasting fire events on the bus in tempo with the
    master clock.
  node_id:         engine.audio.sequencer
  tags:            [audio, sequencer, pattern, rhythm, midi]
  domains:         [music, performance]
  traits:          [stateful, realtime, temporal]

permissions:
  - audio_out
  - bus_publish
  - bus_subscribe

provides:
  - capability.sequencer
  - capability.clock_source
  - capability.pattern_store

requires:
  - capability.audio_context
  - capability.pad_trigger

dependencies:
  - eravos.pads

constraints:
  - constraint_id:  seq.C-1
    predicate:      step_count must be 16 or 32
    failure_mode:   MOUNT_005
    blocking:       true
  - constraint_id:  seq.C-2
    predicate:      BPM must be between 40 and 240
    failure_mode:   RUNTIME_001
    blocking:       false

hooks:

  - hook_id:         seq.hook.fire_out
    hook_type:       emitter
    direction:       out
    intent:          Emits on every active step for every track
    event_type:      seq:fire
    wire_type:       event_bus
    schema:
      type:          object
      required:      [track, step, sound, timestamp]
      properties:
        track:       { type: integer }
        step:        { type: integer }
        sound:       { type: string }
        timestamp:   { type: number }
    contract_version: 1.0.0
    failure_mode:    RUNTIME_002

  - hook_id:         seq.hook.play_out
    hook_type:       emitter
    direction:       out
    intent:          Signals playback start with current BPM
    event_type:      seq:play
    wire_type:       event_bus
    schema:
      type:          object
      required:      [BPM]
      properties:
        BPM:         { type: number }
    contract_version: 1.0.0
    failure_mode:    RUNTIME_002

  - hook_id:         seq.hook.stop_out
    hook_type:       emitter
    direction:       out
    intent:          Signals playback stop
    event_type:      seq:stop
    wire_type:       event_bus
    schema:
      type:          object
      properties: {}
    contract_version: 1.0.0
    failure_mode:    RUNTIME_002

  - hook_id:         seq.hook.bank_in
    hook_type:       receiver
    direction:       in
    intent:          Receives pad bank change — updates track list to match
    event_type:      pad:bank-change
    wire_type:       event_bus
    schema:
      type:          object
      required:      [bank, pads]
      properties:
        bank:        { type: integer }
        pads:        { type: array }
    contract_version: 1.0.0
    failure_mode:    RUNTIME_003

  - hook_id:         seq.hook.record_in
    hook_type:       receiver
    direction:       in
    intent:          Records pad trigger to active step when in record mode
    event_type:      pad:trigger
    wire_type:       event_bus
    schema:
      type:          object
      required:      [index, velocity]
      properties:
        index:       { type: integer }
        velocity:    { type: number }
    contract_version: 1.0.0
    failure_mode:    RUNTIME_003

relations:

  - to:              eravos.pads
    wire:
      from:          seq.hook.fire_out
      to:            pads.hook.seq_fire_in
    auto:            true
    priority:        high
    label:           Fire events light pads

  - to:              eravos.timeline
    wire:
      from:          seq.hook.play_out
      to:            timeline.hook.transport_in
    auto:            false
    label:           Sync timeline to sequencer play

projections:

  - space_id:        canvas
    component:       ui/sequencer.html
    default:         true
    min_width:       400
    min_height:      280
    resizable:       true
    collapsible:     true
    accent:          "#00d4ff"

  - space_id:        timeline
    component:       ui/sequencer-lane.html
    default:         false

config:

  - key:             bpm
    type:            number
    default:         128
    min:             40
    max:             240
    step:            1
    unit:            bpm
    label:           Tempo
    group:           clock

  - key:             steps
    type:            enum
    default:         16
    options:         [16, 32]
    label:           Step Count
    group:           pattern

  - key:             swing
    type:            boolean
    default:         false
    label:           Swing
    group:           timing

modes:

  - mode_id:         performance
    label:           Performance
    mutations:
      set:
        ui.phase_bars: false

  - mode_id:         edit
    label:           Edit
    mutations:
      set:
        ui.phase_bars: true

imports:

  - mime:            audio/midi
    role:            pattern_source
    auto_mount:      true

  - mime:            application/json
    role:            pattern_import
    auto_mount:      false

exports:

  - format:          json
    from:            pattern
    label:           Export pattern

  - format:          mid
    from:            midi_out
    label:           Export MIDI

ui_hooks:

  - hook_id:         ui.play_press
    direction:       ui_to_mod
    event_type:      ui:play_press
    schema:
      type:          object
      properties: {}
    description:     User pressed play/pause

  - hook_id:         ui.step_toggle
    direction:       ui_to_mod
    event_type:      ui:step_toggle
    schema:
      type:          object
      required:      [track, step, value]
      properties:
        track:       { type: integer }
        step:        { type: integer }
        value:       { type: integer, enum: [0, 1] }
    description:     User toggled a step cell

  - hook_id:         ui.bpm_change
    direction:       ui_to_mod
    event_type:      ui:bpm_change
    schema:
      type:          object
      required:      [bpm]
      properties:
        bpm:         { type: number }
    description:     User dragged BPM

  - hook_id:         ui.step_cursor
    direction:       mod_to_ui
    event_type:      org:step_cursor
    schema:
      type:          object
      required:      [step, bar]
      properties:
        step:        { type: integer }
        bar:         { type: integer }
    description:     Mod tells UI which step is active

  - hook_id:         ui.grid_sync
    direction:       mod_to_ui
    event_type:      org:grid_sync
    schema:
      type:          object
      required:      [tracks, steps]
      properties:
        tracks:      { type: array }
        steps:       { type: integer }
    description:     Full grid state sync on mount or pattern change

files:
  ui:              ui/sequencer.html
  schema:          schema/sequencer.schema.json
  data:            data/default-pattern.json

raises_faults:
  - MOUNT_002
  - MOUNT_005
  - RUNTIME_002
  - RUNTIME_003
