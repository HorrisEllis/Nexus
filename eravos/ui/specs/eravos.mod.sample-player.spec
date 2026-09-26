# ============================================================
# ERAVOS MOD SPEC — SAMPLE PLAYER
# spec_id:      eravos.mod.sample-player
# version:      1.0.0
# author:       James Brooks
# status:       canonical
# conforms_to:  ERAVOS.kernel.spec v1.0.0
# ============================================================

header:
  spec_id:         eravos.mod.sample-player
  spec_version:    1.0.0
  spec_type:       mod
  kernel_target:   1.0.0
  author:          James Brooks
  created_at:      2026-06-22
  schema:          mod.schema.v1
  status:          canonical

identity:
  id:              eravos.sample-player
  label:           Sample Player
  icon:            🎵
  description: >
    Loads a single audio file. Displays decoded waveform.
    Play, stop, loop, reverse. Pitch, gain, start/end point
    control. Triggered by pad events or manual play.
    Spawns automatically when audio file is dropped.
  comp_type:       module
  comp_intent: >
    Play back a loaded audio sample with pitch, gain,
    loop, and start/end point control, triggered by
    pad events or transport.
  node_id:         module.audio.sample-player
  tags:            [audio, sample, playback, waveform]
  domains:         [music, podcasting, sound-design]
  traits:          [stateful, realtime]

permissions:
  - audio_out
  - bus_publish
  - bus_subscribe
  - filesystem_read

provides:
  - capability.audio_out
  - capability.sample_source

requires:
  - capability.audio_context

dependencies: []

constraints:
  - constraint_id:  samp.C-1
    predicate:      loaded file must be decodable by AudioContext
    failure_mode:   ASSET_002
    blocking:       true

hooks:

  - hook_id:         samp.hook.trigger_in
    hook_type:       receiver
    direction:       in
    intent:          Plays the loaded sample when a matching pad trigger arrives
    event_type:      pad:trigger
    wire_type:       event_bus
    schema:
      type:          object
      required:      [sound, velocity]
      properties:
        sound:       { type: string }
        velocity:    { type: number }
    contract_version: 1.0.0
    failure_mode:    RUNTIME_003

  - hook_id:         samp.hook.audio_out
    hook_type:       emitter
    direction:       out
    intent:          Routes decoded audio to the master bus or channel strip
    event_type:      audio:signal
    wire_type:       event_bus
    schema:
      type:          object
      required:      [source_id, gain]
      properties:
        source_id:   { type: string }
        gain:        { type: number }
    contract_version: 1.0.0
    failure_mode:    RUNTIME_004

  - hook_id:         samp.hook.clip_in
    hook_type:       receiver
    direction:       in
    intent:          Receives timeline clip play event — plays at that position
    event_type:      timeline:clip_play
    wire_type:       event_bus
    schema:
      type:          object
      required:      [clip_id, asset_id, position_sec]
      properties:
        clip_id:     { type: string }
        asset_id:    { type: string }
        position_sec: { type: number }
    contract_version: 1.0.0
    failure_mode:    RUNTIME_003

relations:

  - to:              eravos.channel
    wire:
      from:          samp.hook.audio_out
      to:            channel.hook.audio_in
    auto:            false
    label:           Route to channel strip

  - to:              eravos.timeline
    wire:
      from:          samp.hook.clip_in
      to:            tl.hook.clip_play_out
    auto:            false
    label:           Play from timeline

projections:

  - space_id:        canvas
    component:       ui/sample-player.html
    default:         true
    min_width:       220
    min_height:      240
    resizable:       true
    collapsible:     true
    accent:          "#aa44ff"

  - space_id:        compact
    component:       ui/sample-player-mini.html
    default:         false
    min_width:       120
    min_height:      80

config:

  - key:             gain
    type:            number
    default:         1
    min:             0
    max:             2
    step:            0.01
    label:           Gain
    group:           playback

  - key:             pitch
    type:            number
    default:         0
    min:             -24
    max:             24
    step:            0.5
    unit:            st
    label:           Pitch
    group:           playback

  - key:             start
    type:            number
    default:         0
    min:             0
    max:             1
    step:            0.001
    label:           Start Point
    group:           playback

  - key:             end
    type:            number
    default:         1
    min:             0
    max:             1
    step:            0.001
    label:           End Point
    group:           playback

  - key:             loop
    type:            boolean
    default:         false
    label:           Loop
    group:           playback

  - key:             reverse
    type:            boolean
    default:         false
    label:           Reverse
    group:           playback

modes:

  - mode_id:         performance
    label:           Performance
    mutations:
      disable:       [ui.waveform]
      set:
        audio.buffer_size: 128

  - mode_id:         edit
    label:           Edit
    mutations:
      enable:        [ui.waveform]

imports:

  - mime:            audio/wav
    role:            sample_source
    auto_mount:      true

  - mime:            audio/mpeg
    role:            sample_source
    auto_mount:      true

  - mime:            audio/ogg
    role:            sample_source
    auto_mount:      true

  - mime:            audio/flac
    role:            sample_source
    auto_mount:      true

  - mime:            audio/aiff
    role:            sample_source
    auto_mount:      true

exports:

  - format:          wav
    from:            audio_out
    label:           Bounce to WAV

ui_hooks:

  - hook_id:         ui.play_press
    direction:       ui_to_mod
    event_type:      ui:play_press
    schema:
      type:          object
      properties: {}
    description:     User pressed play

  - hook_id:         ui.stop_press
    direction:       ui_to_mod
    event_type:      ui:stop_press
    schema:
      type:          object
      properties: {}
    description:     User pressed stop

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

  - hook_id:         ui.waveform_ready
    direction:       mod_to_ui
    event_type:      org:waveform_ready
    schema:
      type:          object
      required:      [peaks, duration_sec, name]
      properties:
        peaks:       { type: array, items: { type: number } }
        duration_sec: { type: number }
        name:        { type: string }
    description:     Decoded waveform data ready for rendering

  - hook_id:         ui.playhead_update
    direction:       mod_to_ui
    event_type:      org:playhead_update
    schema:
      type:          object
      required:      [position_normalized]
      properties:
        position_normalized: { type: number, minimum: 0, maximum: 1 }
    description:     Playhead position 0-1 for waveform display

files:
  ui:              ui/sample-player.html
  schema:          schema/sample-player.schema.json

raises_faults:
  - MOUNT_002
  - ASSET_001
  - ASSET_002
  - RUNTIME_003
  - RUNTIME_004
