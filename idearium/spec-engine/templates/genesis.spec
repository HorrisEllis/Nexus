// GENESIS CANONICAL SPEC v1.0.0
// UUID: genesis-devkit-v1-0000-2026-0710-jamesbrooks-001
// This file IS the schema-engine's definition of a valid sovereign system.
// Edit this file → every new compartment scaffolded from it inherits the change.
// Status: proposed. Foundation domains freeze at v1.0.0 per COS-5 pattern.

version 1.0.0

// ── Spine declaration ─────────────────────────────────────────────────────────
// WARP (warp-devkit-v1-0000-2026-0701-jamesbrooks-001) is not a dependency
// genesis happens to use — it is THE spine. Nothing in genesis has its own
// dispatch loop, its own cache, its own scorer, its own retry ladder, or its
// own audit log. Every domain below is a thin binding onto one of warp's five
// primitives. This is what makes the system fluid: one mechanism moves every
// signal, so any component, gate, or compartment can be added, removed, or
// hot-swapped without teaching a second dispatch system about it. genesis
// imports warp/core and warp/dispatch; warp imports nothing from genesis —
// the same asymmetric seam NEXUS already enforces (NEXUS imports WARP; WARP
// is zero-dependency and never imports NEXUS) — genesis inherits it as law.
spine WARP
spine.primitives  = Event, Gate, Stream, StreamLog, Axiom
spine.rule        = consumer_imports_spine_never_reverse
spine.binding     = universal                // not just cross-compartment — ALL state change is spine traffic
spine.manageability = one_dispatch_path_means_one_place_to_observe_throttle_or_halt_anything

// ── Spine binding table — every domain primitive resolves to a warp primitive.
// If a new domain can't be expressed as a row in this table, it does not
// belong in genesis; it belongs in a compartment's own component code instead.
bind kernel.boot          -> Stream            // the kernel IS a warp Stream instance
bind runtime.mount        -> Stream.hook       // mounting = registering a hook on the kernel stream
bind gate.*               -> Gate              // every gate is a warp Gate: matches()/transform(), no side effects
bind hook.*               -> Stream.hook       // wire registry entries are Stream.hook(kind, plugin) registrations
bind ledger.entry         -> StreamLog         // ledger IS warp's StreamLog, configured per runtime
bind schema.baseline      -> Axiom             // every baseline expectation is a hard Axiom, not a comment
bind pulse.heartbeat      -> Event             // every pulse is an Event; scored by a Stream.hook('scorer', ...)
bind nerve.listener       -> Event             // every micro-listener hit emits an Event, never a direct call
bind lattice.associate    -> Event             // edge creation/strengthening is itself a logged Event
bind tv_ui.spotlight      -> Stream (read-only subscriber) // never emits, only observes the stream

// ── Root types ────────────────────────────────────────────────────────────────
root Kernel
root Engine
root Runtime
root Compartment
root Component
root Contract
root Hook
root Wire
root Seam
root Gate
root Ledger
root Node
root Config

// ── Axioms ────────────────────────────────────────────────────────────────────
axiom SOVEREIGN                // the system answers to no external authority
axiom AGNOSTIC                 // core does not care what data or system touches it
axiom NOTHING_INLINE           // no cross-system call is ever hand-wired; wire or gate only
axiom SPINE_IS_WARP            // ALL state change, not just cross-compartment, routes through warp
axiom SCHEMA_IS_BASELINE       // nothing mounts, registers, or fires until it passes its warp Axiom check
axiom FOUNDATION_IMMUTABLE     // kernel/engine/runtime freeze after v1.0.0
axiom UUID_PER_FILE            // every file declares its own uuid; every reference is direct
axiom SMALLEST_UNIT            // one component = one file = one intent, nothing bundled
axiom HOT_SWAPPABLE            // any isolate module may be replaced at runtime without reboot
axiom CONFIG_OUTSIDE_CODE      // anything adjustable lives in config, never hardcoded
axiom LEDGER_IS_TRUTH          // every runtime writes its event stream to an append-only ledger
axiom GATE_BEFORE_CROSS        // no compartment reaches another without passing its gate

// ══════════════════════════════════════════════════════════════════════════════
// Domain 0 — Schema Baseline (the expectation every other domain is graded against)
// ══════════════════════════════════════════════════════════════════════════════
domain "schema"
schema      = declared_shape_and_minimum_expectation_for_one_domain
baseline    = the_schema_registered_as_a_hard_warp_Axiom_at_boot
expectation = the_specific_field_or_behavior_a_baseline_checks_for
drift       = observed_gap_between_baseline_and_actual_shape
// Baseline is not documentation — it is compiled into a warp Axiom with
// severity:hard and run through unified_dispatch step 4 (axiom_gate) on
// every event that domain produces. A component that violates its own
// domain's baseline is rejected at the gate, logged with which field
// failed, never silently accepted. This is what "manageable" means here:
// one registry of baselines (below), one enforcement point (warp's
// axiom_gate), no domain grading itself on its own curve.

catalog SCHEMA_BASELINE {

  schema "contract.baseline" {
    axiom_id = GEN-S1
    checks   = [ "id", "version", "namespace", "uuid", "role", "health.path", "routes[]", "axioms[]" ]
    fails    = "component has no interaction-contract.json or is missing a required field"
  }

  schema "hook.baseline" {
    axiom_id = GEN-S2
    checks   = [ "id:uuid", "name:kebab", "version:semver", "compartmentId:uuid|host",
                 "contract.inputs[]", "contract.outputs[]", "contract.sideEffects[]",
                 "bindings.event:layer:noun:verb" ]
    fails    = "hook cannot register on the wire — same shape cos/foundation/hook-schema.js already enforces"
  }

  schema "ledger.entry.baseline" {
    axiom_id = GEN-S3
    checks   = [ "uuid", "ts", "type", "prevHash", "hash" ]
    fails    = "entry is rejected by StreamLog before it is ever written — no partial ledger writes"
  }

  schema "node.baseline" {
    axiom_id = GEN-S4
    checks   = [ "uuid", "level:data|network|software|application", "ref", "meta" ]
    fails    = "lattice refuses to index the node; associate() no-ops with a logged Event instead"
  }

  schema "pulse.baseline" {
    axiom_id = GEN-S5
    checks   = [ "uuid", "ts", "health_score:0..1", "fidelity_score:0..1" ]
    fails    = "heartbeat is dropped, not retried — a malformed pulse is worse than a missed one"
  }

  schema "config.baseline" {
    axiom_id = GEN-S6
    checks   = [ "every_adjustable_value_has_a_default", "no_literal_in_component_code_matching_a_config_key" ]
    fails    = "compartment fails to mount; CONFIG_OUTSIDE_CODE is enforced at boot, not at review time"
  }
}
// Registration: kernel/boot.js loads SCHEMA_BASELINE and calls
// Axiom.register(schema) for each entry before any compartment mounts.
// Adding a new domain later means adding one schema here — the enforcement
// point never changes.

// ══════════════════════════════════════════════════════════════════════════════
// Domain 1 — Kernel / Engine / Runtime (the immutable core)
// ══════════════════════════════════════════════════════════════════════════════
domain "core"
kernel      = boot_sequence_and_axiom_enforcer_and_the_root_warp_Stream
engine      = stateless_process_that_executes_one_domain
runtime     = live_instance_of_an_engine_bound_to_a_ledger
boot        = kernel_cold_start_signal
mount       = runtime_attaches_to_kernel
unmount     = runtime_detaches_from_kernel
freeze      = domain_becomes_immutable_at_v1
core_uuid   = single_uuid_identifying_the_whole_system_instance
// The codebase cannot exist without: kernel, one engine, one runtime, an api,
// a cli, an sse channel, and a ledger. Everything else is optional and builds
// on top of this six-part core. The kernel does not sit beside the spine —
// per the binding table above, kernel.boot IS a warp Stream instance; engines
// and runtimes mount onto it as Stream.hook registrations, not as separate
// processes the kernel merely tracks.

// ══════════════════════════════════════════════════════════════════════════════
// Domain 2 — Interaction Contract (I-contract: api + cli per component)
// ══════════════════════════════════════════════════════════════════════════════
domain "contract"
contract    = declared_surface_between_component_and_everything_else
i_contract  = interaction_contract_binding_api_and_cli_to_one_map
api         = http_or_rpc_surface_of_a_component
cli         = command_surface_of_a_component
sse         = server_sent_event_channel_for_live_state
map         = declared_graph_of_every_route_hook_and_gate_a_component_owns
gate        = execution_control_point_that_authorizes_a_cross_call
// Rule: a component without an i_contract does not exist (COS-1 style).
// Rule: api and cli for a component MUST describe the same underlying map —
// two doors into one room, never two different rooms.

// ══════════════════════════════════════════════════════════════════════════════
// Domain 2b — Manifest (manifest-first: the wiring is generated, never hand-declared)
// ══════════════════════════════════════════════════════════════════════════════
// Source: spec-engine-manifest-first-phasemap v0.1.0 (James: "components made
// separately so the llm needs as little context as possible... the file
// structure and list of files, components, and dependencies needs to be
// generated first, creates the registry and manifest first, for the wiring.
// then chunked into each js file/component... using the component registry
// as an event bus and interaction contract with hooks, wires and data
// directories. also works as a map for the project.")
//
// Why this domain exists: 0.39.244's three bugs were all seams between
// individually-correct components (guardian /events carried no payload; the
// Agent tab's api() dropped the refusal body; copilot refused before guardian
// could open the right tab) — a unit test stubbing the boundary passed while
// the system failed. A manifest generated BEFORE any component is chunked,
// with payload schemas (not just names), is what lets a static check catch
// that class of bug before a single line of component code is written.
domain "manifest"
manifest        = the_one_source_of_truth_for_every_components_wiring
manifest_entry  = typed_declaration_of_one_component_before_it_is_chunked
wire_check      = static_no_llm_pass_that_gates_chunking_on_the_manifest_alone
neighbour       = a_component_named_in_this_entrys_own_depends_list_nothing_further
residue         = an_emitted_event_with_no_declared_consumer_recorded_as_such_not_silently_dropped
// The manifest is not documentation of the wiring — code never re-declares
// wiring by hand (I1). registry/component-registry.js and
// compartments/<name>/interaction-contract.json (Domain 2, above) are BOTH
// derived from the manifest at generation time; a hand-edited registry entry
// with no matching manifest entry is itself a wire-check violation.
axiom MANIFEST_BEFORE_CHUNK    // I1 — the manifest generates the wiring; no component is chunked before its manifest entry exists and passes wire-check
axiom ONE_PRODUCER_PER_SIGNAL  // I3 (SISO law 1) — every signature has exactly one producer; a second producer is a hard error at wire-check, not a merge conflict discovered later
axiom NO_UNDECLARED_RESIDUE    // I4 — every emitted event has a consumer or is declared residue; an event with neither fails wire-check
axiom CONTEXT_IS_NEIGHBOURS_ONLY // I5 — a chunk's build context is its own manifest entry plus its neighbours' schemas (consumes/emits shape only) — never another component's full source, never the whole prior build
axiom KERNEL_NEVER_CHUNKED     // I6 — kernel/spine/registry/gates (phase 0) are hand-built and tested before any component chunk dispatches, same freeze FOUNDATION_IMMUTABLE already states for kernel/engine/runtime

// manifest_entry — one per component, the unit chunk-dispatch is scoped to:
//   id       : string            — stable component_id, matches registry/component-registry.js's own key
//   intent   : string             — one sentence (SMALLEST_UNIT's "one intent," made literal here)
//   file     : string              — path in compartments/<name>/component/
//   consumes : [ { signature, schema } ]  — events/commands this component handles, full payload shape
//   emits    : [ { event, schema, residue } ]  — events/commands this component produces, full payload shape
//   data     : { reads: [dir], writes: [dir] }  — the only directories this component may touch
//   cli      : "verb noun [flags]" | null        — routed through registry/component-router.js, never a direct import
//   depends  : [component_id]                     — by id only, resolved through the registry; no import statements
//   tests    : [ { given, expect } ]                — contract tests, generated FROM consumes/emits schemas, not hand-written after the fact
//
// Pipeline (gated states, ledgered per transition — mirrors CHUNK_STATES):
//   P0 SPEC       spec text in
//   P1 MANIFEST   one whole-spec-context job generates every manifest_entry + the file tree + the registry — this is the ONLY step that sees the whole spec at once
//   P2 WIRE-CHECK static: ONE_PRODUCER_PER_SIGNAL, NO_UNDECLARED_RESIDUE, producer<->consumer schema compatibility, depends acyclic — FAIL returns the violation list to P1, not to a human
//   P3 KERNEL     phase 0 built and tested first (KERNEL_NEVER_CHUNKED)
//   P4 CHUNKS     one chunk per manifest_entry, parallel — each chunk's context is CONTEXT_IS_NEIGHBOURS_ONLY: its own entry + the consumes/emits schemas of the ids in its own depends[], nothing else
//   P5 ASSEMBLE   registry/component-registry.js loads components by id; registry/component-router.js wires cli+signatures; no imports anywhere in this step
//   P6 INTEGRATE  real events driven across the real assembled registry, from every manifest emits/consumes pair — no stubbed seams
// states: QUEUED -> MANIFESTED -> WIRED -> KERNEL_OK -> CHUNKED -> ASSEMBLED -> INTEGRATED | FAILED -> RETRYING

// ══════════════════════════════════════════════════════════════════════════════
// Domain 3 — Seam (structural boundary only — deliberately dumb)
// ══════════════════════════════════════════════════════════════════════════════
// Hierarchy, corrected: a seam does not carry ports, direction, or method.
// It answers exactly one question — "where does this thing end and another
// begin?" — nothing more.
//
//   Genesis        → defines existence
//     └─ Seam      → defines boundaries               (this domain)
//         └─ Contract → defines permitted communication (Domain 2, above)
//             └─ API / Event Bus → provides the interaction mechanism
//                 └─ WARP        → governs movement and history
//
// §NAMING COLLISION — carried forward as a migration note, not silently
// fixed: NEXUS today uses the word "seam" for three unrelated things —
//   (a) seams/seam-contracts.js: { name, between:[], port } — that is a
//       Contract (Domain 2) wearing a structural name.
//   (b) hooks/*.hooks.js: seam:{ componentId, intentId } — reuse/provenance
//       tracking on a hook, unrelated to boundary at all.
//   (c) emerge-ide.js: "// SEAM: COMPILER_CONTRACT" — a plain section label.
// Genesis does not retrofit NEXUS's existing files. Going forward, genesis's
// own scaffolds use "seam" ONLY in sense below; (a) belongs in Domain 2's
// seam_contract type is renamed there to avoid re-colliding; (b) is renamed
// "lineage" in genesis's hook shape (Domain "wire", below) so provenance
// tracking never shares a name with a structural boundary.
domain "seam"
seam        = structural_declaration_that_two_units_are_isolated_from_each_other
boundary    = the_specific_line_a_seam_draws
isolation   = default_state_either_side_of_a_seam_no_shared_memory_no_shared_state
// A seam file carries NO port, NO method, NO direction, NO event name.
// If a field like that shows up on a seam declaration, it isn't a seam —
// it's a contract, and belongs one layer down.
axiom SEAM_IS_DUMB             // a seam has no ports, no direction, no methods — boundary only

// ══════════════════════════════════════════════════════════════════════════════
// Domain 3b — Wire / Hook / Lineage (the mechanism that crosses a seam, once a contract allows it)
// ══════════════════════════════════════════════════════════════════════════════
domain "wire"
wire        = the_registered_path_a_signal_takes_once_a_contract_permits_it
hook        = uuid_versioned_binding_of_one_event_type_to_one_handler
lineage     = provenance_tag_on_a_hook_tracking_reuse_across_sessions // was "seam" in NEXUS hooks — renamed to avoid collision with Domain "seam" above
wire_registry = living_index_of_every_hook_across_every_compartment
component_registry = living_index_of_every_component_and_its_uuid
// Every hook: { id: uuid, name: kebab, version: semver, compartmentId: uuid|host,
//               contract: { inputs[], outputs[], sideEffects[], axioms[] },
//               bindings: { event: "layer:noun:verb" },
//               lineage: { componentId, intentId } | null }
// The wire registry auto-discovers: drop a hooks file, register it, done —
// no central file is hand-edited to add a system.

// ══════════════════════════════════════════════════════════════════════════════
// Domain 4 — Ledger (event ledger per runtime)
// ══════════════════════════════════════════════════════════════════════════════
domain "ledger"
ledger      = append_only_log_of_every_event_a_runtime_emits
entry       = single_immutable_ledger_record
hash_chain  = each_entry_references_the_hash_of_the_one_before
replay      = reconstruct_runtime_state_from_ledger_alone
audit       = read_path_over_the_ledger_for_verification
// Binding to spine: ledger.entry is a warp StreamLog record. genesis does not
// reimplement append-only logging — it configures warp's StreamLog per runtime
// and treats the resulting log as the runtime's ledger.

// ══════════════════════════════════════════════════════════════════════════════
// Domain 5 — Identity (uuid per file, direct references)
// ══════════════════════════════════════════════════════════════════════════════
domain "identity"
uuid        = unique_identity_assigned_to_every_file_at_creation
systemid    = first_2_chars_of_uuid
componentid = next_6_chars_of_uuid
shortid     = systemid_plus_componentid
depends     = direct_uuid_reference_from_one_file_to_another_it_calls_or_needs_first
related     = uuid_reference_to_an_associated_file_that_is_not_a_dependency
// Rule: any hook binding or cross-file call must resolve to a depends
// entry in that file's own catalog block — no untracked coupling.
// (was `ref`, which meant both; split 2026-09-25 — a list that generates
// wiring needs one direction only)

// ══════════════════════════════════════════════════════════════════════════════
// Domain 6 — Config / Style (anything adjustable lives outside code)
// ══════════════════════════════════════════════════════════════════════════════
domain "config"
config      = external_file_holding_anything_adjustable_changeable_editable
stylesheet  = external_file_holding_all_ui_visual_tokens
isolate     = module_that_can_be_edited_and_hot_swapped_without_touching_neighbors
hotswap     = runtime_replacement_of_an_isolate_without_reboot
// Rule: no color, port, threshold, timeout, or copy string is a literal in
// component code. It is a config key with a default and a source file.

// ══════════════════════════════════════════════════════════════════════════════
// Domain 7 — Associative Lattice (memory as a connectable node graph)
// ══════════════════════════════════════════════════════════════════════════════
domain "lattice"
node        = addressable_unit_of_memory_data_or_system_reference
edge        = weighted_association_between_two_nodes
lattice     = the_full_graph_of_nodes_and_edges
level.data        = node_representing_a_stored_fact_or_record
level.network     = node_representing_a_reachable_peer_or_host
level.software    = node_representing_a_runtime_or_engine_instance
level.application = node_representing_a_user_facing_system
associate   = create_or_strengthen_an_edge_between_two_nodes
traverse    = walk_the_lattice_from_one_node_outward_by_edge_weight
// The lattice is level-agnostic: a data node can associate directly to an
// application node with no data/network/software nodes in between if that's
// the true relation — the lattice does not enforce a hierarchy, only edges.

// ══════════════════════════════════════════════════════════════════════════════
// Domain 8 — Nerve (micro-event grid, shadow space, attention)
// ══════════════════════════════════════════════════════════════════════════════
domain "nerve"
nerve       = grid_of_micro_event_listeners_covering_every_interactive_surface
listener    = single_low_cost_observer_bound_to_one_ui_or_signal_surface
shadow_space = inferred_region_where_no_listener_reports_but_behavior_implies_activity
attention_map = live_reconstruction_of_where_focus_and_friction_currently_sit
friction_point = location_where_expected_action_and_observed_action_diverge
// shadow_space is filled the same way emerge's gap_field domain fills gaps:
// omission and inference, never guessed data. Nerve emits warp Events; it
// does not maintain its own parallel event system.

// ══════════════════════════════════════════════════════════════════════════════
// Domain 9 — TV-UI (floating remote-style nav, spotlight)
// ══════════════════════════════════════════════════════════════════════════════
domain "tv-ui"
tv_shell    = floating_navigation_layer_independent_of_page_content
remote_nav  = directional_menu_modeled_on_a_tv_remote
spotlight   = focused_overlay_surfacing_interactable_ui_for_ai_or_collaboration
dock        = collapsed_resting_state_of_the_tv_shell
// tv_shell is disposable per COS-6 — it is a client of the wire registry and
// the nerve attention map, never a source of truth for either.

// ══════════════════════════════════════════════════════════════════════════════
// Domain 10 — Pulse (heartbeat, peer2peer/webrtc, fidelity)
// ══════════════════════════════════════════════════════════════════════════════
domain "pulse"
heartbeat   = periodic_liveness_signal_emitted_by_a_runtime
pulse       = single_heartbeat_event_carrying_a_health_snapshot
remote_toggle = user_controlled_switch_enabling_or_disabling_peer_connectivity
peer2peer   = direct_node_to_node_connection_without_a_central_relay
webrtc      = data_and_auth_transport_used_for_peer2peer_when_enabled
self_identify = node_announces_its_identity_and_capabilities_to_peers_on_connect
health_score  = 0_to_1_liveness_and_responsiveness_rating
fidelity_score = 0_to_1_behavioral_match_to_the_nodes_own_declared_contract
// Binding to spine: every pulse is a warp Event; health_score/fidelity_score
// are computed by a warp Scorer hook, not a bespoke pulse-only formula —
// same four-axis pattern warp already uses for gate fitness.

// ══════════════════════════════════════════════════════════════════════════════
// GENESIS FILE TREE — one catalog entry per file. Each file is a chunk:
// minimal code to execute its one stated intent. uuid + depends[] are literal:
//   depends = uuids of files this file calls or needs first (directional —
//             generates the registry, the graph and the build order)
//   related = associated files that are NOT dependencies (generates nothing)
// Generated and checked by `idearium manifest check|generate <spec>`
// (spec-engine/manifest/) — the list is the source, the wiring is derived.
// ══════════════════════════════════════════════════════════════════════════════

catalog GENESIS_FILE_TREE {

  file "genesis.spec" {
    uuid      = ge0000-spec-4000-8000-000000000000
    intent    = this_document
    summary   = "Immutable grammar + file catalog. Compiler and scaffolder both read this before anything is generated."
    depends   = []
  }

  file "MANIFEST.json" {
    uuid      = ge0001-mnfst-4000-8000-000000000001
    intent    = declare_system_identity_and_spine_dependency
    summary   = "core_uuid, version, spine: 'warp' + pinned version, decoupling_rule copied from warp's own MANIFEST."
    depends   = []
    related   = [ "ge0000" ]
  }

  domain "kernel/" {

    file "kernel/boot.js" {
      uuid    = ge1000-boot0-4000-8000-000000000010
      intent  = cold_start_sequence
      summary = "Loads MANIFEST, instantiates the root warp Stream as the kernel itself, registers every SCHEMA_BASELINE entry as an Axiom, enforces FOUNDATION_IMMUTABLE, then mounts one runtime per configured engine as a Stream.hook."
      depends = [ "ge0001", "ge1001", "ge1002", "ge2000", "ge2002", "geB000" ]
    }

    file "kernel/axioms.js" {
      uuid    = ge1001-axiom-4000-8000-000000000011
      intent  = enforce_genesis_axioms_listed_above
      summary = "Same shape as cos/foundation/axioms.js: id, description, enforce(ctx). Throws GenesisAxiomError on violation."
      depends = []
    }

    file "kernel/runtime-enum.js" {
      uuid    = ge1002-rtenm-4000-8000-000000000012
      intent  = enumerate_valid_runtime_states
      summary = "booting, mounted, degraded, unmounting, halted — nothing else is a legal runtime state."
      depends = []
    }
  }

  domain "spine/" {

    file "spine/warp-bridge.js" {
      uuid    = ge2000-wrpbr-4000-8000-000000000020
      intent  = single_seam_between_genesis_and_warp
      summary = "require('warp/core') + require('warp/dispatch'); re-exports Event/Gate/Stream/StreamLog/Axiom under genesis's naming. Only file in genesis allowed to import warp directly."
      depends = []
      related = [ "ge1000" ]
    }

    file "spine/scorer-fidelity.js" {
      uuid    = ge2001-scfid-4000-8000-000000000021
      intent  = warp_scorer_plugin_for_pulse_fidelity
      summary = "Registered via Stream.hook('scorer', ...); computes health_score and fidelity_score using warp's four-axis pattern."
      depends = [ "ge2000" ]
    }

    file "spine/axiom-baseline.js" {
      uuid    = ge2002-axbl0-4000-8000-000000000022
      intent  = register_every_SCHEMA_BASELINE_entry_as_a_hard_warp_axiom
      summary = "Reads the SCHEMA_BASELINE catalog from this spec, calls Axiom.register() per entry at kernel boot — the only file that turns spec text into an enforced rule."
      depends = [ "ge2000", "ge0000" ]
    }
  }

  domain "ledger/" {

    file "ledger/event-ledger.js" {
      uuid    = ge3000-ldgr0-4000-8000-000000000030
      intent  = per_runtime_append_only_ledger
      summary = "Thin wrapper configuring a warp StreamLog instance per mounted runtime; exposes append(), replay(), audit()."
      depends = [ "ge2000" ]
    }
  }

  domain "contracts/" {

    file "contracts/interaction-contract.schema.json" {
      uuid    = ge4000-icsch-4000-8000-000000000040
      intent  = json_schema_every_component_i_contract_must_pass
      summary = "Mirrors nexus's interaction-contract.json shape: id, version, namespace, ports, uuid, role, health, routes[], axioms[]."
      depends = []
    }

    file "contracts/hook-schema.js" {
      uuid    = ge4001-hksch-4000-8000-000000000041
      intent  = validate_hook_objects_before_registration
      summary = "Direct port of cos/foundation/hook-schema.js validators (isUUID, isSemver, isEventType, isKebab); the actual gate is GEN-S2 from spine/axiom-baseline.js — this file only supplies the predicate functions the axiom calls."
      depends = [ "ge1001" ]
      related = [ "ge2002" ]
    }
  }

  domain "registry/" {

    file "registry/wire-registry.js" {
      uuid    = ge5000-wreg0-4000-8000-000000000050
      intent  = living_index_of_every_hook_across_every_compartment
      summary = "allHooks(), bySystem(), byId(), withSEAM(), summary() — same query surface as hooks/index.js, auto-discovers new compartments' hooks files."
      depends = [ "ge4001" ]
    }

    file "registry/component-registry.js" {
      uuid    = ge5001-creg0-4000-8000-000000000051
      intent  = living_index_of_every_component_and_its_uuid
      summary = "One entry per component file; used by the lattice to seed level.software nodes automatically. Generated from registry/manifest-registry.js at P5 ASSEMBLE — never hand-edited (MANIFEST_BEFORE_CHUNK)."
      depends = [ "ge5002" ]
      related = [ "ge5000" ]
    }

    file "registry/manifest-registry.js" {
      uuid    = ge5002-mreg0-4000-8000-000000000052
      intent  = one_source_of_truth_manifest_entry_per_component_written_before_any_chunk_dispatches
      summary = "P1 MANIFEST's real output: { id, intent, file, consumes[], emits[], data:{reads,writes}, cli, depends[], tests[] } per component, generated in a single whole-spec-context job — the only step in the pipeline allowed that much context. component-registry.js and interaction-contract.json are both derived from this at P5, never hand-declared (I1)."
      depends = [ "ge0000" ]
    }

    file "registry/wire-check.js" {
      uuid    = ge5003-wchk0-4000-8000-000000000053
      intent  = static_no_llm_gate_that_a_manifest_must_clear_before_any_component_is_chunked
      summary = "P2 WIRE-CHECK: ONE_PRODUCER_PER_SIGNAL (a signature with 2+ producers is a hard error, not a merge conflict found later), NO_UNDECLARED_RESIDUE (every emit has a consumer or is marked residue:true), producer<->consumer schema compatibility, depends[] acyclic. FAIL returns the violation list to registry/manifest-registry.js's own generation job for retry — never surfaces as a runtime bug the way 0.39.244's three seam bugs did."
      depends = [ "ge5002" ]
    }

    file "registry/component-router.js" {
      uuid    = ge5004-crtr0-4000-8000-000000000054
      intent  = route_every_cli_verb_and_every_cross_component_signal_by_id_never_by_import
      summary = "Reads manifest-registry.js's cli field per entry; a CLI call is `verb noun [flags]` resolved to a component_id and dispatched through here, non-linearly — no compartment or component ever imports another to reach it. Doubles as the event bus registry/wire-registry.js's hooks route through, so 'CLI door' and 'event door' are the same underlying map (Domain 2's i_contract rule), not two mechanisms."
      depends = [ "ge5002", "ge5000" ]
    }
  }

  domain "gates/" {

    file "gates/gate-cross-compartment.js" {
      uuid    = ge6000-gcc00-4000-8000-000000000060
      intent  = sole_authorized_path_between_two_compartments
      summary = "Every cross-compartment call passes through here; enforces GATE_BEFORE_CROSS and NOTHING_INLINE, emits a warp Event either way (pass or reject)."
      depends = [ "ge2000", "ge5000" ]
    }
  }

  domain "compartments/<name>/" {
    // Scaffolded once per new compartment; <name> is replaced at generation time.

    file "compartments/<name>/seam.json" {
      uuid    = ge6500-seam0-4000-8000-000000000065
      intent  = declare_this_compartments_isolation_boundary_only
      summary = "{ uuid, isolated: true }. No ports, no methods, no event names — SEAM_IS_DUMB. Existence and boundary only; interaction-contract.json (below) is the only file allowed to describe communication."
      depends = []
    }

    file "compartments/<name>/manifest.json" {
      uuid    = ge6900-mnfNN-4000-8000-000000000069
      intent  = this_compartments_slice_of_registry_manifest_registry_js_one_entry_per_component_it_owns
      summary = "Written at P1 MANIFEST, before component/<file>.js below exists. interaction-contract.json and component-registry.js entries for this compartment are both generated FROM this file at P5 ASSEMBLE (MANIFEST_BEFORE_CHUNK) — editing either by hand without updating this file first is a wire-check violation, not a style issue."
      depends = [ "ge5002" ]
    }

    file "compartments/<name>/interaction-contract.json" {
      uuid    = ge7000-icNNN-4000-8000-000000000070
      intent  = declare_this_compartments_full_surface
      summary = "Must validate against contracts/interaction-contract.schema.json. This is the map referenced by both api.js and cli.js below. Generated from manifest.json's consumes/emits/cli fields, not authored independently."
      depends = [ "ge4000", "ge6900" ]
    }

    file "compartments/<name>/api.js" {
      uuid    = ge7001-apiNN-4000-8000-000000000071
      intent  = http_or_rpc_door_into_the_compartment
      summary = "Routes declared in interaction-contract.json only; no route exists here that isn't declared there first."
      depends = [ "ge7000", "ge6000" ]
    }

    file "compartments/<name>/cli.js" {
      uuid    = ge7002-cliNN-4000-8000-000000000072
      intent  = command_door_into_the_same_map_as_api
      summary = "Per COS-2 (CLI first) — every capability api.js exposes must also exist here."
      depends = [ "ge7000", "ge6000" ]
    }

    file "compartments/<name>/sse.js" {
      uuid    = ge7003-sseNN-4000-8000-000000000073
      intent  = live_state_channel_for_this_compartment
      summary = "Streams warp Events scoped to this compartment's uuid out over SSE; read-only, no mutation path."
      depends = [ "ge7000", "ge2000" ]
    }

    file "compartments/<name>/hooks.js" {
      uuid    = ge7004-hkNNN-4000-8000-000000000074
      intent  = this_compartments_hook_declarations
      summary = "Loaded by wire-registry.js on discovery; every export validated against hook-schema.js at load time."
      depends = [ "ge4001", "ge5000" ]
    }

    file "compartments/<name>/config.json" {
      uuid    = ge7005-cfgNN-4000-8000-000000000075
      intent  = everything_adjustable_for_this_compartment
      summary = "Ports, timeouts, feature toggles, copy strings — nothing in the other files here is hardcoded if it's in this file's schema."
      depends = []
    }

    file "compartments/<name>/component/<file>.js" {
      uuid    = ge7100-cmpNN-4000-8000-000000000080
      intent  = smallest_measurable_unit_of_behavior
      summary = "One component, one file, one intent — the file this compartment's manifest.json already declared at P1, not a new decision made while chunking. Registered in component-registry.js on load. Hot-swappable independently of its siblings. Built at P4 CHUNKS with CONTEXT_IS_NEIGHBOURS_ONLY: the agent sees this component's own manifest_entry plus the consumes/emits SCHEMAS (not source) of the ids in its own depends[] — never another component's file, never the rest of the compartment."
      depends = [ "ge5001", "ge6900" ]
    }
  }

  domain "nerve/" {

    file "nerve/listener-grid.js" {
      uuid    = ge8000-lgrid-4000-8000-000000000090
      intent  = mount_micro_listeners_across_every_registered_ui_surface
      summary = "Reads component-registry.js to find surfaces automatically; each listener emits a warp Event on interaction, no polling."
      depends = [ "ge5001", "ge2000" ]
    }

    file "nerve/shadow-space.js" {
      uuid    = ge8001-shdw0-4000-8000-000000000091
      intent  = infer_unobserved_attention_from_observed_gaps
      summary = "Consumes the ledger's replay stream; flags regions with activity-adjacent signal but no direct listener hit."
      depends = [ "ge3000", "ge8000" ]
    }

    file "nerve/attention-map.js" {
      uuid    = ge8002-attnm-4000-8000-000000000092
      intent  = live_composite_of_listener_grid_plus_shadow_space
      summary = "Consumed by tv-ui/spotlight.js to decide what to surface next; never mutates state, read-only projection."
      depends = [ "ge8000", "ge8001" ]
    }
  }

  domain "ui/tv-shell/" {

    file "ui/tv-shell/floating-nav.js" {
      uuid    = ge9000-fnav0-4000-8000-000000000100
      intent  = remote_style_directional_menu
      summary = "Reads wire-registry.js for available destinations; renders nothing it can't resolve to a live route."
      depends = [ "ge5000" ]
    }

    file "ui/tv-shell/spotlight.js" {
      uuid    = ge9001-splgt-4000-8000-000000000101
      intent  = surface_interactable_ui_for_ai_or_collaboration
      summary = "Driven by nerve/attention-map.js; opens the highest-friction or highest-focus surface first."
      depends = [ "ge8002", "ge9000" ]
    }

    file "ui/tv-shell/stylesheet/theme.css" {
      uuid    = ge9002-thm00-4000-8000-000000000102
      intent  = all_visual_tokens_for_tv_shell
      summary = "Colors, radii, motion durations, accent tokens — the only place tv-shell visuals are declared."
      depends = []
    }
  }

  domain "lattice/" {

    file "lattice/node.js" {
      uuid    = ge9500-node0-4000-8000-000000000110
      intent  = define_the_node_shape_for_all_four_levels
      summary = "{ uuid, level: data|network|software|application, ref, meta }. Same UUID_PER_FILE rule applies to lattice nodes."
      depends = []
    }

    file "lattice/edge.js" {
      uuid    = ge9501-edge0-4000-8000-000000000111
      intent  = define_weighted_association_between_two_nodes
      summary = "{ from, to, weight, kind }. No implicit hierarchy between levels — an edge can cross any two levels directly."
      depends = [ "ge9500" ]
    }

    file "lattice/associative-index.js" {
      uuid    = ge9502-aidx0-4000-8000-000000000112
      intent  = maintain_and_query_the_full_graph
      summary = "associate(), traverse(); seeded automatically from component-registry.js and pulse/self-identify events."
      depends = [ "ge9500", "ge9501", "ge5001" ]
    }
  }

  domain "pulse/" {

    file "pulse/heartbeat.js" {
      uuid    = geA000-hbeat-4000-8000-000000000120
      intent  = emit_periodic_liveness_pulse_per_runtime
      summary = "Every pulse is a warp Event scored by spine/scorer-fidelity.js; interval is a config.json key, never hardcoded."
      depends = [ "ge2000", "ge2001", "geB000" ]
    }

    file "pulse/peer-webrtc.js" {
      uuid    = geA001-pwrtc-4000-8000-000000000121
      intent  = togglable_direct_node_connection
      summary = "Off by default per COS-11 (network isolation default-on). remote_toggle flips connectivity; self_identify runs on every new peer link."
      depends = [ "geA000", "ge9502" ]
    }

    file "pulse/fidelity-score.js" {
      uuid    = geA002-fidsc-4000-8000-000000000122
      intent  = expose_health_and_fidelity_as_queryable_values
      summary = "Reads scorer output from spine/scorer-fidelity.js; surfaced on interaction-contract's /health route for every compartment."
      depends = [ "ge2001" ]
    }
  }

  domain "config/" {

    file "config/genesis.config.json" {
      uuid    = geB000-gcfg0-4000-8000-000000000130
      intent  = system_wide_adjustable_values
      summary = "Single source of truth for ports, ledger retention, pulse interval defaults, nerve sampling rate. Compartment config.json files override per-compartment only."
      depends = []
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Boot order — GENERATED from the depends[] graph above by
// `idearium manifest generate templates/genesis.spec`; never hand-edited.
// (The hand-written list that stood here had config/ last, after pulse/,
// though kernel/boot.js and pulse/heartbeat.js both read config. Generating
// it removed that class of error.) Layers — every file in a layer depends
// only on earlier layers, so each layer's chunks can build in parallel:
//   L0 genesis.spec, MANIFEST.json, kernel/axioms, kernel/runtime-enum,
//      spine/warp-bridge, contracts/interaction-contract.schema,
//      compartments/<n>/seam, compartments/<n>/config, tv-shell theme,
//      lattice/node, config/genesis.config
//   L1 spine/scorer-fidelity, spine/axiom-baseline, ledger/event-ledger,
//      contracts/hook-schema, registry/manifest-registry, lattice/edge
//   L2 kernel/boot, registry/wire-registry, registry/component-registry,
//      registry/wire-check, compartments/<n>/manifest, pulse/heartbeat,
//      pulse/fidelity-score
//   L3 registry/component-router, gates/gate-cross-compartment,
//      compartments/<n>/interaction-contract, compartments/<n>/hooks,
//      compartments/<n>/component/<file>, nerve/listener-grid,
//      tv-shell/floating-nav, lattice/associative-index
//   L4 compartments/<n>/api, cli, sse, nerve/shadow-space, pulse/peer-webrtc
//   L5 nerve/attention-map
//   L6 tv-shell/spotlight
//
// Nothing after "spine/axiom-baseline" can mount without clearing whichever
// GEN-S* axiom applies to it — the baseline is live before the first
// compartment exists, not bolted on after the system is already running.
//
// BUILD order for a new project scaffolded from this spec is a distinct
// sequence from the above (Domain "manifest"'s P0-P6): registry/
// manifest-registry.js and every compartment's manifest.json exist and
// clear registry/wire-check.js BEFORE kernel/engine/runtime are even
// generated, let alone before any compartments/<name>/component/<file>.js
// chunk is dispatched. Boot order is what a FINISHED system does at
// startup; build order is how genesis gets a system to that finished state
// with I5-minimal context per chunk. Conflating the two is exactly the
// silent-orphan failure class registry/wire-check.js exists to catch loudly
// instead of leaving a chunk PENDING forever with nothing surfaced.
// ══════════════════════════════════════════════════════════════════════════════
