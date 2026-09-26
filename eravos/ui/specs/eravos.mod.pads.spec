# ============================================================
# ERAVOS MOD SPEC — DRUM MACHINE
# spec_id:      eravos.mod.pads
# version:      1.0.0
# author:       James Brooks
# status:       canonical
# conforms_to:  ERAVOS.kernel.spec v1.0.0
# ============================================================

header:
  spec_id:         eravos.mod.pads
  spec_version:    1.0.0
  spec_type:       mod
  kernel_target:   1.0.0
  author:          James Brooks
  created_at:      2026-06-22
  updated_at:      2026-06-22
  schema:          mod.schema.v1
  status:          canonical

identity:
  id:              eravos.pads
  version:         1.0.0
  label:           Drum Machine
  icon:            🥁
  description: >
    16-pad velocity-sensitive drum machine with 3 banks,
    19 synthesis voices, per-pad sound and color assignment,
    keyboard mapping, and MIDI input routing.
  author:          James Brooks
  comp_type:       engine
  comp_intent: >
    Trigger and layer percussive and tonal synthesis voices
    from velocity-sensitive pad banks via pad press, keyboard,
    or MIDI input.
  comp_lineage:    []
  node_id:         engine.audio.drum-machine
  tags:            [audio, percussion, synthesis, pads, midi]
  domains:         [music, performance, sound-design]
  traits:          [stateful, realtime, interactive]

permissions:
  - audio_out
  - midi_in
  - bus_publish
  - bus_subscribe
  - filesystem_read

provides:
  - capability.pad_trigger
  - capability.audio_out
  - capability.bank_select

requires:
  - capability.audio_context

dependencies: []

constraints:
  - constraint_id:  pads.C-1
    predicate:      audio_context must be initialized before first pad trigger
    failure_mode:   MOUNT_002
    blocking:       true

  - constraint_id:  pads.C-2
    predicate:      each bank must have exactly 16 pads
    failure_mode:   MOUNT_005
    blocking:       true

  - constraint_id:  pads.C-3
    predicate:      no two hooks share the same event_type in the same direction
    failure_mode:   MOUNT_006
    blocking:       true

hooks:

  - hook_id:         pads.hook.pad_trigger_out
    hook_type:       emitter
    direction:       out
    intent: >
      Emits a pad trigger event whenever a pad is activated
      by press, keyboard, or MIDI input.
    event_type:      pad:trigger
    wire_type:       event_bus
    schema:
      type:          object
      required:      [index, sound, velocity, bank, timestamp]
      properties:
        index:       { type: integer, minimum: 0, maximum: 15 }
        sound:       { type: string }
        velocity:    { type: number, minimum: 0, maximum: 1 }
        bank:        { type: integer, minimum: 0, maximum: 2 }
        timestamp:   { type: number }
    contract_version: 1.0.0
    auth_required:   false
    failure_mode:    RUNTIME_002

  - hook_id:         pads.hook.seq_fire_in
    hook_type:       receiver
    direction:       in
    intent: >
      Receives a sequencer fire event and lights the corresponding
      pad without triggering audio (audio is handled by sequencer).
    event_type:      seq:fire
    wire_type:       event_bus
    schema:
      type:          object
      required:      [track, step]
      properties:
        track:       { type: integer }
        step:        { type: integer }
        sound:       { type: string }
        timestamp:   { type: number }
    contract_version: 1.0.0
    auth_required:   false
    failure_mode:    RUNTIME_003

  - hook_id:         pads.hook.midi_in
    hook_type:       receiver
    direction:       in
    intent: >
      Receives MIDI note-on events and maps them to pad indices
      for triggering. Note 36 = pad 0, note 51 = pad 15.
    event_type:      midi:note
    wire_type:       event_bus
    schema:
      type:          object
      required:      [note, velocity, channel]
      properties:
        note:        { type: integer, minimum: 0, maximum: 127 }
        velocity:    { type: number, minimum: 0, maximum: 1 }
        channel:     { type: integer, minimum: 1, maximum: 16 }
    contract_version: 1.0.0
    auth_required:   false
    failure_mode:    RUNTIME_003

  - hook_id:         pads.hook.bank_change_out
    hook_type:       emitter
    direction:       out
    intent: >
      Emits the full pad configuration of the selected bank
      whenever the active bank changes.
    event_type:      pad:bank-change
    wire_type:       event_bus
    schema:
      type:          object
      required:      [bank, pads]
      properties:
        bank:        { type: integer }
        pads:
          type:      array
          items:
            type:    object
            required: [sound, color, note]
            properties:
              sound: { type: string }
              color: { type: string }
              note:  { type: integer }
    contract_version: 1.0.0
    auth_required:   false
    failure_mode:    RUNTIME_002

  - hook_id:         pads.hook.audio_out
    hook_type:       emitter
    direction:       out
    intent: >
      Routes synthesized audio output to the master bus
      or a connected channel strip.
    event_type:      audio:signal
    wire_type:       event_bus
    schema:
      type:          object
      required:      [source_id, gain]
      properties:
        source_id:   { type: string }
        gain:        { type: number }
    contract_version: 1.0.0
    auth_required:   false
    failure_mode:    RUNTIME_004

relations:

  - to:              eravos.sequencer
    wire:
      from:          pads.hook.seq_fire_in
      to:            sequencer.hook.fire_out
    wire_type:       event_bus
    auto:            true
    priority:        high
    label:           Sequencer fires pads

  - to:              eravos.channel
    wire:
      from:          pads.hook.audio_out
      to:            channel.hook.audio_in
    wire_type:       event_bus
    auto:            false
    priority:        normal
    label:           Route audio to channel strip

  - to:              eravos.timeline
    wire:
      from:          pads.hook.pad_trigger_out
      to:            timeline.hook.record_in
    wire_type:       event_bus
    auto:            false
    priority:        low
    label:           Record pad triggers to timeline

mutations: []

projections:

  - space_id:        canvas
    component:       ui/pads.html
    default:         true
    min_width:       240
    min_height:      360
    resizable:       true
    collapsible:     true
    accent:          "#00ff88"

  - space_id:        compact
    component:       ui/pads-mini.html
    default:         false
    min_width:       120
    min_height:      120
    resizable:       false
    collapsible:     false
    accent:          "#00ff88"

  - space_id:        graph
    component:       null
    default:         false
    node_type:       audio_source

config:

  - key:             bank
    type:            enum
    default:         A
    options:         [A, B, C]
    label:           Active Bank
    group:           playback

  - key:             volume
    type:            number
    default:         0.88
    min:             0
    max:             1
    step:            0.01
    label:           Master Volume
    group:           playback

  - key:             pitch
    type:            number
    default:         0
    min:             -12
    max:             12
    step:            1
    unit:            st
    label:           Global Pitch
    group:           playback

  - key:             decay
    type:            number
    default:         0.3
    min:             0.01
    max:             2
    step:            0.01
    unit:            s
    label:           Global Decay
    group:           playback

  - key:             voices_pack
    type:            string
    default:         voices/drum-machine-voices.js
    label:           Voices File
    group:           engine

modes:

  - mode_id:         performance
    label:           Performance
    description:     Low-latency, no scope rendering, audio priority
    mutations:
      disable:       [ui.scope, ui.waveform]
      set:
        audio.buffer_size:  128
        ui.refresh_rate:    10

  - mode_id:         edit
    label:           Edit
    description:     Full UI, non-realtime safe
    mutations:
      enable:        [ui.scope, ui.waveform]
      set:
        audio.buffer_size:  512
        ui.refresh_rate:    60

imports:

  - mime:            audio/wav
    role:            pad_sample
    auto_mount:      false

  - mime:            audio/mpeg
    role:            pad_sample
    auto_mount:      false

exports:

  - format:          json
    from:            banks
    label:           Save bank configuration

  - format:          wav
    from:            audio_out
    label:           Bounce to WAV

ui_hooks:

  - hook_id:         ui.pad_press
    direction:       ui_to_mod
    event_type:      ui:pad_press
    schema:
      type:          object
      required:      [index, velocity]
      properties:
        index:       { type: integer }
        velocity:    { type: number }
    description:     User pressed a pad in the UI

  - hook_id:         ui.bank_select
    direction:       ui_to_mod
    event_type:      ui:bank_select
    schema:
      type:          object
      required:      [bank]
      properties:
        bank:        { type: integer }
    description:     User selected a bank

  - hook_id:         ui.pad_assign
    direction:       ui_to_mod
    event_type:      ui:pad_assign
    schema:
      type:          object
      required:      [index, sound]
      properties:
        index:       { type: integer }
        sound:       { type: string }
        color:       { type: string }
    description:     User reassigned a pad sound or color

  - hook_id:         ui.config_change
    direction:       ui_to_mod
    event_type:      ui:config_change
    schema:
      type:          object
      required:      [key, value]
      properties:
        key:         { type: string }
        value:       {}
    description:     User changed a config parameter

  - hook_id:         ui.pad_lit
    direction:       mod_to_ui
    event_type:      org:pad_lit
    schema:
      type:          object
      required:      [index, color]
      properties:
        index:       { type: integer }
        color:       { type: string }
        duration_ms: { type: integer }
    description:     Mod tells UI to light a pad

  - hook_id:         ui.state_sync
    direction:       mod_to_ui
    event_type:      org:state_sync
    schema:
      type:          object
      required:      [bank, pads, config]
      properties:
        bank:        { type: integer }
        pads:        { type: array }
        config:      { type: object }
    description:     Full state sync to UI on mount or bank change

files:
  ui:              ui/pads.html
  voices:          voices/drum-machine-voices.js
  schema:          schema/pads.schema.json
  data:            data/banks.json
  styles:          ui/pads.css

zip_structure:
  manifest.json:              this spec as JSON
  ui/pads.html:               canvas projection
  ui/pads-mini.html:          compact projection
  ui/pads.css:                scoped styles
  voices/drum-machine-voices.js: synthesis engine
  data/banks.json:            default bank configurations
  schema/pads.schema.json:    JSON Schema for validation
  tests/pads.test.js:         hook and fault mode tests

# ============================================================
# FAULT MODES THIS MOD CAN RAISE
# ============================================================

raises_faults:
  - MOUNT_002   # capability.audio_context not found
  - MOUNT_005   # invalid bank data — not 16 pads
  - RUNTIME_002 # payload schema invalid on emit
  - RUNTIME_003 # handler error on seq:fire or midi:note
  - RUNTIME_004 # audio output timeout
  - ASSET_001   # pad sample import failed

# ============================================================
# NEXUS BUILD INSTRUCTIONS
# ============================================================

nexus:
  build_order:
    1: voices/drum-machine-voices.js   # synthesis — no deps
    2: data/banks.json                 # static data — no deps
    3: schema/pads.schema.json         # schema — no deps
    4: mod logic                  # hooks, bus, audio routing
    5: ui/pads.css                     # styles — after schema known
    6: ui/pads.html                    # UI last — after logic proven
    7: ui/pads-mini.html               # compact — after full UI done
    8: tests/pads.test.js              # tests — every hook exercised
    9: manifest.json                   # pack manifest — after all files exist

  test_coverage_required:
    - Every hook emits with valid schema
    - Every hook receives invalid schema → RUNTIME_002 raised
    - MIDI note 36 → pad 0 trigger
    - MIDI note 51 → pad 15 trigger
    - Bank change emits full pad config
    - Audio context missing → MOUNT_002 raised
    - Pad press with no voice → silent fail logged, not thrown
    - Performance mode disables scope
    - Edit mode enables scope
