# ============================================================
# ERAVOS KERNEL SPEC
# spec_id:      eravos.kernel
# version:      1.0.0
# author:       James Brooks
# status:       canonical · source of truth · immutable core
# ============================================================
#
# This file is the contract that governs the entire ERAVOS
# universe. Everything the kernel builds is derived from this
# spec and specs that conform to it.
#
# NEXUS reads this spec and can build any conforming organism,
# workspace, behavior, genome, or ecosystem from it.
#
# If it is not in a spec, it does not exist.
# If it is in the spec, it must be implemented exactly.
# Nothing aspirational lives here.

# ============================================================
# LAYER 0 — KERNEL AXIOMS
# Immutable. Never overridden by any organism or spec.
# ============================================================

axioms:

  K-1:  Nothing exists until registered in the organism registry
  K-2:  Nothing silently fails — every fault is loud, named, traceable
  K-3:  No organism touches another organism directly
  K-4:  Every connection between organisms is a wire
  K-5:  Every wire is owned by the wire registry, not the organisms
  K-6:  Every mutation is recorded in the causal ledger before it applies
  K-7:  Hook contracts must match on both ends before a wire goes live
  K-8:  Permissions are enforced by the kernel — never self-reported as trusted
  K-9:  Everything that exists can be removed — no organism is permanent
  K-10: The spec is the source of truth — not the runtime state
  K-11: The canvas is one space — the universe owns the organisms
  K-12: A wire owns the relationship — removing an organism removes its wires
  K-13: Build order is bottom-up — dependencies mount before dependents
  K-14: No stubs in production — unresolved dependencies block mount
  K-15: Session context before build — NEXUS reads full spec before any output

# ============================================================
# LAYER 1 — PRIMITIVE TYPES
# The smallest things the kernel understands.
# Everything else is composed from these.
# ============================================================

primitives:

  Organism:
    description: >
      A thing that exists in the universe. Has identity, hooks,
      permissions, and projections. Never touches other organisms
      directly. Communicates only through wires and the bus.
    required_fields:
      - uuid
      - spec_id
      - schema_version
      - hooks
      - permissions

  Space:
    description: >
      A topology that organisms can inhabit. Defines how organisms
      are arranged, navigated, and related within it. The canvas
      is one space. The timeline is another.
    topologies:
      euclidean:    2D pan/zoom — the canvas
      temporal:     1D seek/scroll — the timeline
      hierarchical: fold/jump — the editor/tree
      directed:     traverse — the node graph
      sequential:   scroll — the notebook
      matrix:       row/col — the dataframe
      terminal:     stream — the console

  Hook:
    description: >
      A named, typed, versioned connection point on an organism.
      The only surface another organism can connect to.
      Has a declared schema. Has a declared failure mode.
      Has a contract version that must match before wire goes live.
    required_fields:
      - hook_id
      - hook_type
      - direction
      - event_type
      - wire_type
      - schema
      - contract_version
      - failure_mode

  Wire:
    description: >
      A connection between exactly two hooks.
      Owned by the wire registry — never by either organism.
      Validates contract versions on both ends before going live.
      Removed automatically when either organism unmounts.
    required_fields:
      - wire_id
      - source_hook
      - target_hook
      - wire_type
      - validated_at

  Projection:
    description: >
      How an organism appears in a specific space.
      An organism can have multiple projections.
      Projections are views — they do not own data.
      The organism owns data. The projection renders it.
    required_fields:
      - space_id
      - component
      - default

  Constraint:
    description: >
      An invariant that must hold for the universe to be valid.
      Constraints are checked before and after every mutation.
      A failing constraint blocks the mutation and names the fault.
    required_fields:
      - constraint_id
      - predicate
      - failure_mode
      - blocking

  Mutation:
    description: >
      A declared, reversible change to an existing organism's
      surface or config. Written to the causal ledger before
      it applies. Rolled back if the mutating organism unmounts.
    required_fields:
      - mutation_id
      - target_organism
      - operation
      - reason
      - reversible

  Event:
    description: >
      Something that happened on the bus.
      Has a topic, payload schema, and timestamp.
      Routed by the bus to all subscribers of that topic.
      Never delivered directly organism-to-organism.
    required_fields:
      - topic
      - payload_schema
      - emitter_hook

  Asset:
    description: >
      An imported file or data object.
      Has identity, hash, mime type, and lineage.
      Can have multiple representations (waveform, hex, table).
      Lineage tracks every transformation applied to it.
    required_fields:
      - uuid
      - hash
      - source
      - mime
      - asset_type
      - representations

  Permission:
    description: >
      A declared capability grant.
      Requested in the manifest. Granted by the kernel.
      Enforced at runtime — not self-reported.
      Violations kill the organism, log the fault.

# ============================================================
# LAYER 2 — SPEC FILE FORMAT
# Every .spec file must conform to this structure.
# ============================================================

spec_file:

  # --- Required header on every spec file ---

  header:
    spec_id:          string    # unique — reverse domain notation
    spec_version:     semver    # organism version
    spec_type:        enum      # see spec_types below
    kernel_target:    semver    # minimum kernel version required
    author:           string
    created_at:       iso8601
    updated_at:       iso8601
    schema:           string    # which schema validates this spec
    status:           enum      # draft | review | canonical | deprecated

  spec_types:
    organism:         A single mountable component
    workspace:        A saved universe snapshot
    behavior:         An environment modifier (no UI)
    genome:           A species definition (preferred archetypes + behaviors)
    recipe:           A composition — how to assemble multiple organisms
    ecosystem:        A culture — genome + behaviors + constraints + theme
    theme:            Visual token overrides
    agent:            An AI or automated worker
    asset:            An imported file with lineage
    pack:             A zip containing multiple specs + assets

  # --- Shared blocks present on every spec_type ---

  shared:

    identity:
      id:             string    # organism identifier
      version:        semver
      label:          string    # human display name
      icon:           string    # emoji or path to svg
      description:    string
      author:         string
      comp_type:      enum      # engine | module | plugin | service |
                                # gateway | adapter | interface | behavior
      comp_intent:    string    # one sentence — what this exists to do
      comp_lineage:   string[]  # ancestry chain, root first
      node_id:        string    # type.domain.name — unique in registry
      tags:           string[]
      domains:        string[]  # music | coding | video | research | etc
      traits:         string[]  # temporal | stateful | realtime | visual | etc

    permissions:
      # Requested permissions — kernel grants or denies
      # Anything not listed here is denied at runtime
      values:
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
      # Capability identifiers this organism emits into the universe
      # Other organisms can list these in their requires[]
      type: string[]
      example:
        - capability.audio_out
        - capability.pad_trigger
        - capability.clock
        - capability.seek

    requires:
      # Capabilities that must exist before this organism mounts
      # If not satisfied — mount blocks with named fault
      type: string[]

    dependencies:
      # Organism IDs that must be mounted before this one
      # Order is resolved by the kernel — not the author
      type: string[]

    constraints:
      # Invariants that must hold for this organism to function
      # Checked before mount and after every mutation
      fields:
        constraint_id:    string
        predicate:        string    # declarative expression
        failure_mode:     string    # named fault class
        blocking:         boolean   # true = hard block | false = warning

# ============================================================
# LAYER 3 — ORGANISM SPEC
# Full contract for a single mountable organism.
# ============================================================

organism_spec:

  # Inherits all shared blocks from Layer 2

  hooks:
    # Every addressable surface this organism exposes
    # Wires connect to hooks — nothing else
    fields:
      hook_id:          string    # uuid — permanent
      hook_type:        enum      # endpoint | emitter | receiver | bidirectional
      direction:        enum      # in | out | inout
      intent:           string    # one sentence
      event_type:       string    # signal signature — unique per direction
      wire_type:        enum      # event_bus | callto | api
      schema:           object    # JSON Schema for payload — required
      contract_version: semver    # must match counterparty
      auth_required:    boolean
      failure_mode:     string    # named fault — declared before build
      rate_limit:       object    # optional — max events/sec
      middleware:       string[]  # optional transform chain

  relations:
    # Preferred connections to other organisms
    # The wire registry reads these — auto-wires when both present
    fields:
      to:               string    # organism id or capability
      wire:
        from:           string    # self.hook_id
        to:             string    # target.hook_id
      wire_type:        enum
      auto:             boolean   # true = wire on mount | false = offer only
      priority:         enum      # high | normal | low
      label:            string    # shown in wire registry UI

  mutations:
    # Declared changes this organism makes to others on mount
    # Rolled back on unmount — recorded in causal ledger
    fields:
      mutation_id:      string
      target:           string    # organism id
      operation:        enum      # add_hook | remove_hook | set_config |
                                  # add_projection | add_constraint
      payload:          object    # operation-specific
      reason:           string
      reversible:       boolean   # always true in canonical spec

  projections:
    # How this organism appears in different spaces
    fields:
      space_id:         string    # canvas | timeline | graph | notebook | etc
      component:        string    # path to UI component inside zip
      default:          boolean   # true = mount this projection on spawn
      min_width:        integer
      min_height:       integer
      resizable:        boolean
      collapsible:      boolean
      accent:           string    # css color or token

  config:
    # Default parameters — user adjustable
    # Every key must have a type, default, and range if numeric
    fields:
      key:              string
      type:             enum      # number | string | boolean | enum | object
      default:          any
      min:              number    # if type: number
      max:              number    # if type: number
      step:             number    # if type: number
      unit:             string    # Hz | ms | dB | st | etc
      options:          string[]  # if type: enum
      label:            string
      group:            string    # for UI grouping

  modes:
    # Alternate behavioral states
    # Broadcast by kernel — organism switches if mode is declared
    fields:
      mode_id:          string
      label:            string
      description:      string
      mutations:
        disable:        string[]  # feature ids to disable
        enable:         string[]
        set:            object    # config overrides

  imports:
    # File/asset types this organism ingests on drop
    fields:
      mime:             string    # mime type or glob
      role:             string    # how the asset is used
      auto_mount:       boolean   # true = spawn organism on file drop

  exports:
    # What this organism can serialize out
    fields:
      format:           string    # wav | mid | json | zip | png | etc
      from:             string    # hook or state key
      label:            string    # shown in export UI

  files:
    # All files in the zip this organism needs
    # Paths relative to zip root
    fields:
      ui:               string    # canvas projection component
      voices:           string    # audio engine
      schema:           string    # JSON Schema file
      data:             string    # default data (banks, patterns, etc)
      styles:           string    # scoped CSS
      worker:           string    # AudioWorklet or Web Worker

  ui_hooks:
    # The interaction contract between UI and organism logic
    # UI publishes to these — organism subscribes
    # Organism publishes to these — UI subscribes
    # Nothing in the UI touches organism internals directly
    fields:
      hook_id:          string
      direction:        enum      # ui_to_organism | organism_to_ui
      event_type:       string
      schema:           object
      description:      string

# ============================================================
# LAYER 4 — WORKSPACE SPEC
# A saved universe snapshot. Drop to restore exactly.
# ============================================================

workspace_spec:

  # Inherits header from Layer 2

  genome:           string    # genome id this workspace expresses

  organisms:
    fields:
      organism_id:    string
      instance_id:    string    # uuid — this specific instance
      position:
        space:        string
        x:            number
        y:            number
        width:        number
        height:       number
      config:         object    # instance-level config overrides
      mode:           string    # active mode id

  wires:
    fields:
      wire_id:        string
      from:
        instance_id:  string
        hook_id:      string
      to:
        instance_id:  string
        hook_id:      string
      wire_type:      string
      validated:      boolean

  assets:
    fields:
      asset_id:       string
      path:           string    # relative to workspace zip
      loaded_into:    string    # instance_id

  behaviors:        string[]  # behavior ids active in this workspace
  theme:            string    # theme id
  mode:             string    # workspace-wide mode
  history:          string    # path to causal ledger snapshot

# ============================================================
# LAYER 5 — BEHAVIOR SPEC
# Modifies environment — no UI — no window
# ============================================================

behavior_spec:

  # Inherits header + shared from Layer 2

  triggers:
    # What causes this behavior to activate
    fields:
      event_type:     string
      condition:      string    # predicate expression

  effects:
    # What the behavior does when triggered
    fields:
      effect_id:      string
      operation:      string
      target:         string
      payload:        object

  config:           object    # user-adjustable behavior params

# ============================================================
# LAYER 6 — GENOME SPEC
# A species definition — preferred archetypes + behaviors
# ============================================================

genome_spec:

  archetypes:       string[]  # preferred organism types
  behaviors:        string[]  # auto-mounted behaviors
  spaces:           string[]  # available spaces
  default_space:    string
  constraints:      string[]  # genome-level constraint ids
  recipes:          string[]  # available recipes

  layout_rules:
    # If X exists, prefer Y position
    fields:
      if_present:     string
      prefer_position: object
      prefer_space:   string

# ============================================================
# LAYER 7 — RECIPE SPEC
# A composition — how to assemble multiple organisms
# ============================================================

recipe_spec:

  steps:
    fields:
      step_id:        string
      operation:      enum      # mount | wire | configure | mutate | wait
      target:         string
      payload:        object
      depends_on:     string[]  # step_ids that must complete first

  result:
    # What this recipe produces
    provides:         string[]
    workspace:        string    # optional — saves result as workspace

# ============================================================
# LAYER 8 — ECOSYSTEM SPEC
# A culture — genome + behaviors + constraints + theme
# ============================================================

ecosystem_spec:

  genome:           string
  behaviors:        string[]
  recipes:          string[]
  theme:            string
  constraints:      string[]

  defaults:
    mode:           string
    bpm:            number
    space:          string

# ============================================================
# LAYER 9 — AGENT SPEC
# An AI or automated worker — first-class organism
# ============================================================

agent_spec:

  # Inherits organism spec

  worker_type:      enum      # transcriber | composer | librarian |
                              # refactorer | colorist | assistant | custom

  model:            string    # model identifier
  endpoint:         string    # local | remote url

  capabilities:
    reads:          string[]  # asset types it can read
    writes:         string[]  # asset types it can produce
    listens:        string[]  # event types it monitors
    emits:          string[]  # event types it produces

  ui:
    # Agent IS a canvas object — drag, resize, pause, connect
    shows_thinking: boolean
    shows_progress: boolean
    pauseable:      boolean

# ============================================================
# LAYER 10 — PACK SPEC
# A zip containing multiple specs + assets
# ============================================================

pack_spec:

  contents:
    organisms:      string[]  # organism spec paths inside zip
    behaviors:      string[]
    assets:         string[]
    workspace:      string    # optional starter workspace
    theme:          string

  install_order:    string[]  # explicit mount sequence if needed

  provides:
    capabilities:   string[]
    genomes:        string[]

  conflicts:        string[]  # organism ids this pack replaces

# ============================================================
# LAYER 11 — ASSET SPEC
# Every imported file becomes an AssetSeam
# ============================================================

asset_spec:

  uuid:             string
  hash:             string    # FNV-32 of first 4KB
  source:           string    # original filename
  mime:             string
  size_bytes:       integer
  imported_at:      iso8601

  asset_type:       enum      # audio | midi | image | video |
                              # code | data | model | document

  metadata:
    # Type-specific metadata
    audio:
      duration:     number
      sample_rate:  number
      channels:     number
      bpm:          number     # if detected
      key:          string     # if detected
    midi:
      tracks:       integer
      duration:     number
      tempo:        number
    image:
      width:        integer
      height:       integer
      color_space:  string

  lineage:
    # Every transformation — git for media
    fields:
      step_id:      string
      operation:    string    # granulate | reverb | pitchshift | etc
      source:       string    # asset uuid
      result:       string    # asset uuid
      params:       object
      timestamp:    iso8601

  representations:
    # Different ways to view this asset
    values:
      - waveform
      - spectrogram
      - hex
      - table
      - piano_roll   # midi
      - node         # in graph space
      - card         # compact

# ============================================================
# LAYER 12 — WIRE REGISTRY SPEC
# The kernel's wire registry contract
# ============================================================

wire_registry:

  operations:

    register_wire:
      inputs:
        source:
          instance_id:  string
          hook_id:      string
        target:
          instance_id:  string
          hook_id:      string
        wire_type:      string
      validation:
        - Source hook must exist and be registered
        - Target hook must exist and be registered
        - Contract versions must match
        - Direction must be compatible (out → in)
        - No duplicate wire between same hook pair
      on_fail:          WIRE_001 — contract_mismatch
                        WIRE_002 — hook_not_found
                        WIRE_003 — direction_incompatible
                        WIRE_004 — duplicate_wire

    remove_wire:
      inputs:
        wire_id:        string
      effects:
        - Wire removed from registry
        - Organisms notified via bus
        - Ledger entry written

    get_edges:
      inputs:
        node_id:        string
      returns:
        upstream:       string[]
        downstream:     string[]

# ============================================================
# LAYER 13 — CAUSAL LEDGER SPEC
# Every mutation, mount, unmount, wire, fault — recorded
# ============================================================

causal_ledger:

  entry_types:
    organism_mounted:
      fields: [instance_id, organism_id, timestamp, position]
    organism_unmounted:
      fields: [instance_id, organism_id, timestamp, reason]
    wire_registered:
      fields: [wire_id, source, target, timestamp]
    wire_removed:
      fields: [wire_id, reason, timestamp]
    mutation_applied:
      fields: [mutation_id, target, operation, payload, timestamp]
    mutation_rolled_back:
      fields: [mutation_id, reason, timestamp]
    fault_raised:
      fields: [fault_class, organism_id, hook_id, message, timestamp]
    permission_denied:
      fields: [organism_id, permission, timestamp]
    mode_changed:
      fields: [mode_id, scope, timestamp]
    asset_imported:
      fields: [asset_id, source, mime, timestamp]
    asset_transformed:
      fields: [asset_id, operation, result_id, timestamp]

  guarantees:
    - Entries are append-only
    - Entries are written before the operation applies
    - Every fault has a ledger entry
    - Ledger can reconstruct full universe state at any timestamp

# ============================================================
# LAYER 14 — FAULT TAXONOMY
# Every failure has a name before the system is built
# ============================================================

faults:

  MOUNT:
    MOUNT_001: dependency_not_found
    MOUNT_002: capability_not_satisfied
    MOUNT_003: permission_denied
    MOUNT_004: schema_version_mismatch
    MOUNT_005: manifest_invalid
    MOUNT_006: duplicate_organism_id
    MOUNT_007: constraint_violated_on_mount

  WIRE:
    WIRE_001: contract_mismatch
    WIRE_002: hook_not_found
    WIRE_003: direction_incompatible
    WIRE_004: duplicate_wire
    WIRE_005: wire_type_unsupported

  RUNTIME:
    RUNTIME_001: permission_violation
    RUNTIME_002: payload_schema_invalid
    RUNTIME_003: handler_error
    RUNTIME_004: timeout
    RUNTIME_005: rate_limit_exceeded

  MUTATION:
    MUTATION_001: target_not_found
    MUTATION_002: operation_not_supported
    MUTATION_003: constraint_violated
    MUTATION_004: rollback_failed

  ASSET:
    ASSET_001: import_failed
    ASSET_002: decode_failed
    ASSET_003: hash_mismatch
    ASSET_004: mime_unsupported

  CONSTRAINT:
    CONSTRAINT_001: predicate_failed
    CONSTRAINT_002: blocking_constraint_violated

# ============================================================
# LAYER 15 — NEXUS BUILD CONTRACT
# What NEXUS does with a spec file
# ============================================================

nexus_build:

  phases:
    0: Orient       — read full spec, validate schema, check kernel_target
    1: Hostile      — find every ambiguity, gap, assumption — surface before build
    2: Spec         — confirm spec is complete, all faults named, all hooks typed
    3: Build        — bottom-up only — kernel primitives first, UI last
    4: Test         — every hook has a test, every fault mode is exercised
    5: UI           — projections rendered only after logic is proven
    6: Verify       — hostile review of output against spec — no drift allowed

  rules:
    - Read full spec before writing any code (K-15)
    - Ask 5 FORGE questions before Phase 3: phase / last state / bugs / intent / SISO+Jaa
    - No stubs in production output (K-14)
    - Every file produced is listed in a manifest
    - Output is a zip conforming to pack_spec
    - Version bumps +0.1 per phase
    - If spec is ambiguous — stop and surface — never assume

  output:
    structure:
      manifest.json:    pack_spec conforming
      organisms/:       one directory per organism
      behaviors/:       behavior components
      assets/:          included assets
      schemas/:         JSON Schema files
      workspace/:       optional starter workspace
      tests/:           one test file per organism
      CHANGELOG.md:     phase-by-phase build log

# ============================================================
# LAYER 16 — INTERACTION CONTRACT
# How UI and organism logic are isolated
# ============================================================

interaction_contract:

  principle: >
    The UI never touches organism internals directly.
    The organism never touches UI internals directly.
    All communication is through declared ui_hooks.
    The wire validates the schema on every message.

  ui_to_organism:
    # UI publishes — organism subscribes
    examples:
      - event: ui:knob_change    payload: { hook_id, value }
      - event: ui:button_press   payload: { hook_id }
      - event: ui:pad_trigger    payload: { index, velocity }
      - event: ui:select_change  payload: { hook_id, value }

  organism_to_ui:
    # Organism publishes — UI subscribes
    examples:
      - event: org:state_update  payload: { key, value }
      - event: org:meter_update  payload: { level }
      - event: org:error         payload: { fault_class, message }
      - event: org:mode_change   payload: { mode_id }

  enforcement:
    - Any UI event not declared in ui_hooks is dropped with RUNTIME_002
    - Any organism event not declared in ui_hooks is dropped with RUNTIME_002
    - Schema validation on every message — invalid payload = RUNTIME_002
    - UI components are sandboxed — no access to organism scope

# ============================================================
# END KERNEL SPEC
# ============================================================
#
# Everything in ERAVOS is derived from this document.
# Kernel, organisms, workspaces, behaviors, genomes,
# agents, assets, wires, mutations, constraints — all of it.
#
# The kernel never learns what music is.
# It only knows what is written here.
#
# Same kernel.
# Different organism.
# ============================================================
