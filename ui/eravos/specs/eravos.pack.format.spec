# ============================================================
# ERAVOS PACK SPEC — ZIP MANIFEST FORMAT
# spec_id:      eravos.pack.format
# version:      1.0.0
# author:       James Brooks
# status:       canonical
# conforms_to:  ERAVOS.kernel.spec v1.0.0
# ============================================================
#
# Every drop-in zip must contain a manifest.json at its root.
# The kernel reads manifest.json first.
# If manifest.json is missing or invalid — MOUNT_005.
# Nothing in the zip executes before the manifest is validated.
#
# A pack can be:
#   single organism    — one organism + its files
#   organism pack      — multiple related organisms
#   workspace          — saved universe snapshot
#   ecosystem          — genome + behaviors + organisms + theme
#   behavior           — environment modifier, no window
#   theme              — visual token overrides only
#   recipe             — composition instructions
#   asset pack         — audio, MIDI, samples with lineage
#   voice pack         — sample player presets + audio files

# ============================================================
# MANIFEST.JSON FORMAT
# This is the exact JSON structure the kernel parses.
# ============================================================

manifest_json_schema:

  required:
    - manifest_version
    - pack_id
    - pack_type
    - kernel_target
    - author
    - permissions
    - contents

  fields:

    manifest_version:
      type:       string
      value:      "1.0.0"
      description: Version of the manifest format itself

    pack_id:
      type:       string
      pattern:    "[a-z][a-z0-9-.]+"
      description: Unique identifier — reverse domain notation
      example:    "eravos.pack.drum-machine"

    pack_version:
      type:       string
      format:     semver

    pack_type:
      type:       string
      enum:
        - organism
        - organism_pack
        - workspace
        - ecosystem
        - behavior
        - theme
        - recipe
        - asset_pack
        - voice_pack

    label:
      type:       string
      description: Human display name

    icon:
      type:       string
      description: Emoji or path to SVG inside zip

    description:
      type:       string

    author:
      type:       string

    kernel_target:
      type:       string
      format:     semver
      description: Minimum kernel version required

    permissions:
      type:       array
      description: All permissions any organism in this pack needs
      items:
        type:     string
        enum:
          - audio_out
          - audio_in
          - midi_in
          - midi_out
          - bus_publish
          - bus_subscribe
          - filesystem_read
          - filesystem_write
          - network
          - canvas_write
          - registry_read
          - registry_write
          - ledger_read
          - worker_spawn
          - peer_connect

    provides:
      type:       array
      items:      string
      description: Capabilities this pack makes available after install

    requires:
      type:       array
      items:      string
      description: Capabilities that must exist before any organism mounts

    dependencies:
      type:       array
      items:      string
      description: Pack IDs or organism IDs that must be installed first

    conflicts:
      type:       array
      items:      string
      description: Pack IDs this pack replaces or is incompatible with

    contents:
      type:       object
      description: All files in the zip, by role
      properties:

        manifest:
          type:   string
          value:  "manifest.json"

        organisms:
          type:   array
          items:  string
          description: Paths to organism spec files inside zip

        behaviors:
          type:   array
          items:  string

        genomes:
          type:   array
          items:  string

        recipes:
          type:   array
          items:  string

        workspaces:
          type:   array
          items:  string

        themes:
          type:   array
          items:  string

        assets:
          type:   array
          items:
            type: object
            properties:
              path:     string
              mime:     string
              role:     string
              hash:     string

        ui:
          type:   object
          description: UI component files by organism id
          additionalProperties:
            type: string

        voices:
          type:   object
          description: Audio engine files by organism id

        schemas:
          type:   object
          description: JSON Schema files

        data:
          type:   object
          description: Static data files (banks, patterns, presets)

        tests:
          type:   object
          description: Test files by organism id

    install_order:
      type:       array
      items:      string
      description: >
        Explicit organism mount sequence if deps require it.
        If omitted, kernel resolves order from dependencies.

    auto_mount:
      type:       array
      items:      string
      description: Organism IDs to mount immediately on install

    starter_workspace:
      type:       string
      description: Path to workspace spec to load after install

# ============================================================
# KERNEL INSTALL SEQUENCE
# What the kernel does step by step when a zip drops
# ============================================================

kernel_install_sequence:

  1:
    name:          detect
    action:        Intake identifies file as zip by magic bytes PK..
    fault:         ASSET_001 if unreadable

  2:
    name:          extract_manifest
    action:        Read manifest.json from zip root
    fault:         MOUNT_005 if missing or unparseable

  3:
    name:          validate_manifest
    action:        Validate manifest against manifest_json_schema
    fault:         MOUNT_005 if schema invalid

  4:
    name:          check_kernel_target
    action:        Compare manifest.kernel_target to running kernel version
    fault:         MOUNT_004 if incompatible

  5:
    name:          check_conflicts
    action:        Check conflicts[] against registry — block if conflict mounted
    fault:         MOUNT_006 if conflict found

  6:
    name:          present_permissions
    action: >
      Show user the permissions[] list.
      User grants or denies.
      If denied — abort install, no files executed.
    fault:         MOUNT_003 if denied

  7:
    name:          check_requires
    action:        Verify all requires[] capabilities exist in registry
    fault:         MOUNT_002 if capability missing

  8:
    name:          check_dependencies
    action:        Verify all dependencies[] are mounted
    fault:         MOUNT_001 if dependency missing

  9:
    name:          resolve_order
    action: >
      If install_order[] provided — use it.
      Otherwise kernel resolves from dependency graph.
      Bottom-up always.

  10:
    name:          register_assets
    action: >
      Register all assets[] in the asset registry with hash,
      mime, and lineage. Write to causal ledger.
    fault:         ASSET_003 if hash mismatch

  11:
    name:          mount_organisms
    action: >
      For each organism in resolved order:
        - Register in organism registry
        - Validate constraints[]
        - Apply auto-wires from relations[]
        - Mount default projection at drop position
        - Write to causal ledger
    fault:         MOUNT_002 through MOUNT_007 per organism

  12:
    name:          apply_mutations
    action: >
      For each organism's mutations[]:
        - Validate target exists
        - Apply operation
        - Write to causal ledger
    fault:         MUTATION_001 through MUTATION_003

  13:
    name:          mount_behaviors
    action:        Mount all behaviors[] — no windows, bus hooks only
    fault:         MOUNT_002 if capability missing

  14:
    name:          load_workspace
    action: >
      If starter_workspace defined:
        - Apply workspace spec — positions, wires, config
    fault:         MOUNT_005 if workspace spec invalid

  15:
    name:          publish_installed
    action: >
      Publish kernel:pack-installed on bus with pack_id.
      Write complete install record to causal ledger.

# ============================================================
# EXAMPLE — RAVEN VOICE PACK
# A voice pack containing Raven's audio samples
# as a drop-in zip that auto-mounts sample players
# ============================================================

example_raven_voice_pack:

  manifest.json: |
    {
      "manifest_version": "1.0.0",
      "pack_id": "eravos.pack.raven-voices",
      "pack_version": "1.0.0",
      "pack_type": "voice_pack",
      "label": "Raven Voice Pack",
      "icon": "🌙",
      "description": "Voice samples — loaded into sample players on drop",
      "author": "James Brooks",
      "kernel_target": "1.0.0",

      "permissions": [
        "audio_out",
        "bus_publish",
        "bus_subscribe",
        "filesystem_read"
      ],

      "provides": [
        "capability.audio_out",
        "capability.sample_source"
      ],

      "requires": [
        "capability.audio_context"
      ],

      "dependencies": [],

      "contents": {
        "manifest": "manifest.json",
        "organisms": [],
        "assets": [
          { "path": "audio/Always_be_here_for_you.mp3",           "mime": "audio/mpeg", "role": "voice_sample" },
          { "path": "audio/Days_when_were_quiet.mp3",             "mime": "audio/mpeg", "role": "voice_sample" },
          { "path": "audio/I_really_need_you_to_believe.mp3",     "mime": "audio/mpeg", "role": "voice_sample" },
          { "path": "audio/just_listen_to_me.mp3",                "mime": "audio/mpeg", "role": "voice_sample" },
          { "path": "audio/Please_just_come_to_me.mp3",           "mime": "audio/mpeg", "role": "voice_sample" },
          { "path": "audio/sometimes.mp3",                        "mime": "audio/mpeg", "role": "voice_sample" },
          { "path": "audio/Todays_going_to_be_a_better_day.mp3",  "mime": "audio/mpeg", "role": "voice_sample" },
          { "path": "audio/we_got_this.mp3",                      "mime": "audio/mpeg", "role": "voice_sample" },
          { "path": "audio/were_fine.mp3",                        "mime": "audio/mpeg", "role": "voice_sample" },
          { "path": "audio/what_ever_negative_stuff.mp3",         "mime": "audio/mpeg", "role": "voice_sample" },
          { "path": "audio/yesterdays_not_even_a_thing.mp3",      "mime": "audio/mpeg", "role": "voice_sample" },
          { "path": "audio/youre_fine.mp3",                       "mime": "audio/mpeg", "role": "voice_sample" },
          { "path": "audio/youre_not_your_thoughts.mp3",          "mime": "audio/mpeg", "role": "voice_sample" },
          { "path": "audio/I_just_want_you_to_know.mp3",          "mime": "audio/mpeg", "role": "voice_sample" },
          { "path": "audio/Give_your_fucking_head_a_shake.mp3",   "mime": "audio/mpeg", "role": "voice_sample" },
          { "path": "audio/Im_not_fucking_going_anywhere.mp3",    "mime": "audio/mpeg", "role": "voice_sample" },
          { "path": "audio/I_love_the_shit_out_of_you.mp3",       "mime": "audio/mpeg", "role": "voice_sample" },
          { "path": "audio/Youre_fucking_stuck_with_me.mp3",      "mime": "audio/mpeg", "role": "voice_sample" }
        ]
      },

      "auto_mount": [],

      "install_behavior": {
        "on_asset_drop": "spawn_sample_player_per_file",
        "layout": "cascade",
        "cascade_offset": { "x": 24, "y": 20 }
      }
    }

  zip_structure: |
    raven-voices.zip
    ├── manifest.json
    └── audio/
        ├── Always_be_here_for_you.mp3
        ├── Days_when_were_quiet.mp3
        ├── I_really_need_you_to_believe.mp3
        ├── just_listen_to_me.mp3
        ├── Please_just_come_to_me.mp3
        ├── sometimes.mp3
        ├── Todays_going_to_be_a_better_day.mp3
        ├── we_got_this.mp3
        ├── were_fine.mp3
        ├── what_ever_negative_stuff.mp3
        ├── yesterdays_not_even_a_thing.mp3
        ├── youre_fine.mp3
        ├── youre_not_your_thoughts.mp3
        ├── I_just_want_you_to_know.mp3
        ├── Give_your_fucking_head_a_shake.mp3
        ├── Im_not_fucking_going_anywhere.mp3
        ├── I_love_the_shit_out_of_you.mp3
        └── Youre_fucking_stuck_with_me.mp3

# ============================================================
# EXAMPLE — DRUM MACHINE ZIP
# The pads organism as a self-contained drop-in zip
# ============================================================

example_drum_machine_zip:

  zip_structure: |
    eravos.pads.zip
    ├── manifest.json                     ← kernel reads this first
    ├── spec/
    │   └── pads.spec                     ← full organism spec
    ├── ui/
    │   ├── pads.html                     ← canvas projection
    │   └── pads-mini.html                ← compact projection
    ├── voices/
    │   └── drum-machine-voices.js        ← synthesis engine
    ├── data/
    │   └── banks.json                    ← default pad banks A/B/C
    ├── schema/
    │   └── pads.schema.json              ← JSON Schema for validation
    └── tests/
        └── pads.test.js                  ← every hook tested

  manifest.json: |
    {
      "manifest_version": "1.0.0",
      "pack_id": "eravos.pack.drum-machine",
      "pack_version": "1.0.0",
      "pack_type": "organism",
      "label": "Drum Machine",
      "icon": "🥁",
      "description": "16-pad drum machine with 19 synthesis voices and 3 banks",
      "author": "James Brooks",
      "kernel_target": "1.0.0",

      "permissions": [
        "audio_out",
        "midi_in",
        "bus_publish",
        "bus_subscribe",
        "filesystem_read"
      ],

      "provides": [
        "capability.pad_trigger",
        "capability.audio_out",
        "capability.bank_select"
      ],

      "requires": [
        "capability.audio_context"
      ],

      "dependencies": [],

      "contents": {
        "manifest": "manifest.json",
        "organisms": ["spec/pads.spec"],
        "ui": {
          "eravos.pads": "ui/pads.html",
          "eravos.pads.compact": "ui/pads-mini.html"
        },
        "voices": {
          "eravos.pads": "voices/drum-machine-voices.js"
        },
        "schemas": {
          "eravos.pads": "schema/pads.schema.json"
        },
        "data": {
          "eravos.pads.banks": "data/banks.json"
        },
        "tests": {
          "eravos.pads": "tests/pads.test.js"
        }
      },

      "auto_mount": ["eravos.pads"],

      "install_behavior": {
        "spawn_at_drop_position": true
      }
    }
