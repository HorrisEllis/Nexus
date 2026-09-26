# ============================================================
# ERAVOS ORGANISM SPEC — TIMELINE
# spec_id:      eravos.organism.timeline
# version:      1.0.0
# author:       James Brooks
# status:       canonical
# conforms_to:  ERAVOS.kernel.spec v1.0.0
# ============================================================

header:
  spec_id:         eravos.organism.timeline
  spec_version:    1.0.0
  spec_type:       organism
  kernel_target:   1.0.0
  author:          James Brooks
  created_at:      2026-06-22
  schema:          organism.schema.v1
  status:          canonical

identity:
  id:              eravos.timeline
  label:           Timeline
  icon:            📼
  description: >
    Multi-lane temporal arrangement surface. Clips placed by
    clicking lanes or dropping audio. Playhead driven by
    AudioContext clock. Zoom, scroll, seek, record, waveform
    rendering per clip.
  comp_type:       engine
  comp_intent: >
    Provide a temporal space for arranging audio clips across
    named lanes, with a sample-accurate playhead driven by
    the master audio clock.
  node_id:         engine.temporal.timeline
  tags:            [audio, timeline, arrangement, clips, temporal]
  domains:         [music, video, podcasting]
  traits:          [temporal, stateful, realtime]

permissions:
  - audio_out
  - audio_in
  - bus_publish
  - bus_subscribe
  - filesystem_read

provides:
  - capability.timeline
  - capability.clip_store
  - capability.seek

requires:
  - capability.audio_context

dependencies: []

hooks:

  - hook_id:         tl.hook.transport_in
    hook_type:       receiver
    direction:       in
    intent:          Receives play/stop from external transport or sequencer
    event_type:      seq:play
    wire_type:       event_bus
    schema:
      type:          object
      required:      [BPM]
      properties:
        BPM:         { type: number }
    contract_version: 1.0.0
    failure_mode:    RUNTIME_003

  - hook_id:         tl.hook.stop_in
    hook_type:       receiver
    direction:       in
    intent:          Receives stop signal
    event_type:      seq:stop
    wire_type:       event_bus
    schema:
      type:          object
      properties: {}
    contract_version: 1.0.0
    failure_mode:    RUNTIME_003

  - hook_id:         tl.hook.seek_out
    hook_type:       emitter
    direction:       out
    intent:          Broadcasts current playhead position
    event_type:      timeline:seek
    wire_type:       event_bus
    schema:
      type:          object
      required:      [position_sec, bar, beat]
      properties:
        position_sec: { type: number }
        bar:          { type: integer }
        beat:         { type: integer }
    contract_version: 1.0.0
    failure_mode:    RUNTIME_002

  - hook_id:         tl.hook.record_in
    hook_type:       receiver
    direction:       in
    intent:          Records incoming pad trigger events as clips when recording
    event_type:      pad:trigger
    wire_type:       event_bus
    schema:
      type:          object
      required:      [index, sound, velocity, timestamp]
      properties:
        index:       { type: integer }
        sound:       { type: string }
        velocity:    { type: number }
        timestamp:   { type: number }
    contract_version: 1.0.0
    failure_mode:    RUNTIME_003

  - hook_id:         tl.hook.clip_play_out
    hook_type:       emitter
    direction:       out
    intent:          Fires when the playhead crosses a clip boundary
    event_type:      timeline:clip_play
    wire_type:       event_bus
    schema:
      type:          object
      required:      [clip_id, lane_id, asset_id, position_sec]
      properties:
        clip_id:     { type: string }
        lane_id:     { type: string }
        asset_id:    { type: string }
        position_sec: { type: number }
    contract_version: 1.0.0
    failure_mode:    RUNTIME_002

relations:

  - to:              eravos.sequencer
    wire:
      from:          tl.hook.transport_in
      to:            seq.hook.play_out
    auto:            true
    priority:        high
    label:           Sync to sequencer transport

  - to:              eravos.channel
    wire:
      from:          tl.hook.clip_play_out
      to:            channel.hook.audio_in
    auto:            false
    label:           Route clip output to channel

projections:

  - space_id:        canvas
    component:       ui/timeline.html
    default:         true
    min_width:       480
    min_height:      200
    resizable:       true
    collapsible:     true
    accent:          "#00d4ff"

  - space_id:        timeline
    component:       ui/timeline-full.html
    default:         false

config:

  - key:             px_per_sec
    type:            number
    default:         80
    min:             20
    max:             400
    step:            1
    label:           Zoom
    group:           view

  - key:             snap
    type:            enum
    default:         beat
    options:         [none, beat, bar, 1/8, 1/16]
    label:           Snap
    group:           edit

  - key:             loop
    type:            boolean
    default:         false
    label:           Loop
    group:           playback

imports:

  - mime:            audio/wav
    role:            clip_source
    auto_mount:      false

  - mime:            audio/mpeg
    role:            clip_source
    auto_mount:      false

  - mime:            audio/ogg
    role:            clip_source
    auto_mount:      false

exports:

  - format:          wav
    from:            mix_out
    label:           Bounce timeline to WAV

  - format:          json
    from:            arrangement
    label:           Export arrangement

ui_hooks:

  - hook_id:         ui.ruler_click
    direction:       ui_to_organism
    event_type:      ui:ruler_click
    schema:
      type:          object
      required:      [position_sec]
      properties:
        position_sec: { type: number }
    description:     User clicked ruler to seek

  - hook_id:         ui.clip_place
    direction:       ui_to_organism
    event_type:      ui:clip_place
    schema:
      type:          object
      required:      [lane_id, position_sec, asset_id]
      properties:
        lane_id:     { type: string }
        position_sec: { type: number }
        asset_id:    { type: string }
    description:     User placed a clip on a lane

  - hook_id:         ui.clip_move
    direction:       ui_to_organism
    event_type:      ui:clip_move
    schema:
      type:          object
      required:      [clip_id, position_sec]
      properties:
        clip_id:     { type: string }
        position_sec: { type: number }
    description:     User dragged a clip

  - hook_id:         ui.clip_remove
    direction:       ui_to_organism
    event_type:      ui:clip_remove
    schema:
      type:          object
      required:      [clip_id]
      properties:
        clip_id:     { type: string }
    description:     User removed a clip

  - hook_id:         ui.lane_add
    direction:       ui_to_organism
    event_type:      ui:lane_add
    schema:
      type:          object
      required:      [name, icon, color]
      properties:
        name:        { type: string }
        icon:        { type: string }
        color:       { type: string }
    description:     User added a lane

  - hook_id:         ui.lane_remove
    direction:       ui_to_organism
    event_type:      ui:lane_remove
    schema:
      type:          object
      required:      [lane_id]
      properties:
        lane_id:     { type: string }
    description:     User removed a lane

  - hook_id:         ui.playhead_update
    direction:       organism_to_ui
    event_type:      org:playhead_update
    schema:
      type:          object
      required:      [position_sec, bar, beat]
      properties:
        position_sec: { type: number }
        bar:          { type: integer }
        beat:         { type: integer }
    description:     Organism updates playhead position

  - hook_id:         ui.clip_sync
    direction:       organism_to_ui
    event_type:      org:clip_sync
    schema:
      type:          object
      required:      [lanes, clips]
      properties:
        lanes:       { type: array }
        clips:       { type: array }
    description:     Full clip state sync

files:
  ui:              ui/timeline.html
  schema:          schema/timeline.schema.json

raises_faults:
  - MOUNT_002
  - RUNTIME_002
  - RUNTIME_003
  - ASSET_002
