// GENESIS CANONICAL SPEC v1.3.0
// UUID: genesis-devkit-v1-0000-2026-0710-jamesbrooks-001
// This file IS the schema-engine's definition of a valid sovereign system.
// Edit this file → every new compartment scaffolded from it inherits the change.
// Status: proposed. Foundation domains freeze at v1.0.0 per COS-5 pattern.

version 1.4.0
// 1.4.0 (2026-10-06, NEXUS 0.39.359 — build-from-the-spec SB28): the file catalog is the shape Nexus systems really have —
// Guardian's and Versionium's: server.js, cli.js, config, compartment.json, registry-components.js, the interaction
// contract, event-taxonomy.js, jaa-store.js, schemas/, data/nodes, lib/, spec/, tests/. It is the COS archetype
// nexus-system (cos/archetype/nexus-system.js), file for file, and each file's depends are its real require()s. The
// kernel/spine/compartments/lattice/nerve/tv-shell catalog is archived whole (templates/_archive/genesis-1.3.0.spec);
// what a real system needs from it keeps its place (the heartbeat, the node index, the registry as the door, the
// handshake gate). James: "compartments? no system in nexus looks like this".
// 1.3.0 (2026-10-05, NEXUS 0.39.313): genesis is the architecture of the system template, section by section (Domain 0a
// "shape"); every component carries at least one capability and one command, and its events, each a node (capability_node
// added to Domain 2c); a system owns its own data, schemas, contract, config, heartbeat and pulse. James: "yes add it the
// spec for genesis. like genesis is the exact architecture for a new system template." · "each component has to have at
// least one capability, with at least one command, and events, each a node each." · "each system is responsible for its
// data, schemas, contracts, configurations, heartbeat and pulse".
// 1.2.0 (2026-10-05, NEXUS 0.39.311): Domain 2d nodes — the node-based data structure with JAA tables as the node index
// (Guardian's real model: lib/node-index.js, guardian/lib/node-registry.js), one file (registry/node-index.js), the
// node.change binding, axiom NODE_INDEX_IS_JAA; the pulse carries the index's counts. James: "like with the genasis spec,
// needs to have the component registry event interaction contract, with the heartbeat and pulse system, node based data
// structure using jaa tables as a node index."
// 1.1.0 (2026-10-01, NEXUS 0.39.286 — docs/2026-10-01-routing-registry-genesis-phasemap.spec): Domain 2c registry-as-doorway
// (the spec template's 11th block, nodes in Guardian's layout), Domain 11 routing (fallback policy), two files
// (registry/node-registry.js, spine/route-policy.js). genesis is now the template a new spec starts with.

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
bind node.change          -> Event             // every node add/change/delete is an Event; the JAA index and its ledger table are its subscribers
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
root NodeIndex
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
axiom REGISTRY_IS_THE_DOORWAY   // every crossing between modules is a declared node in the registry; modules are isolated and know only the registry
axiom COMPONENT_SHAPE           // every component has at least one capability, at least one command invoking it, and its events — each a node (James)
axiom SYSTEM_OWNS_ITS_OWN       // a system holds its own data, schemas, contract, config, heartbeat and pulse, in its own folder; no other system keeps them for it (James)
axiom NODE_INDEX_IS_JAA       // the node file is canonical; each node type's JAA table (nodes_<type>) is its index and nodes_<type>_ledger its append-only history, in the system's own data folder
axiom ALL_DATA_ARE_NODES       // the registry, its contract and its config persist as nodes/<type>/<id>.<type> in one envelope — Guardian's layout

// ══════════════════════════════════════════════════════════════════════════════
// Domain 0a — Shape (genesis is the architecture of the system template)
// ══════════════════════════════════════════════════════════════════════════════
// James, 2026-10-05: "yes add it the spec for genesis. like genesis is the exact architecture for a new system
// template." The system template (idearium/spec-engine/templates/architecture-spec.template.yaml, in his structure:
// identity → context → file_structure → modules → components) is what a new system's spec is written in; this domain
// says which part of genesis each section IS, so a spec in that template is a genesis system, nothing left over.
domain "shape"
template          = idearium_spec_engine_templates_architecture_spec_template_yaml
identity          = domain_identity_plus_the_system_node_2c_plus_its_data_folder_2d_plus_its_config_6_plus_its_heartbeat_10
context           = domain_schema_axioms_0_plus_the_spine_plus_sovereignty_3_plus_config_layers_6_plus_pulse_10_plus_phases
file_structure    = the_manifest_2b_every_file_declared_with_its_uuid_layer_and_depends
modules           = compartments_each_with_its_seam_3_its_config_6_and_the_node_types_it_owns_2d
components        = component_nodes_2c_each_with_capability_nodes_command_nodes_and_event_nodes_and_the_node_types_it_reads_and_writes
generated         = the_contract_the_event_taxonomy_the_node_index_the_registry_and_the_atlas_derived_from_the_components_never_hand_written_2b
ownership         = a_system_holds_its_data_schemas_contract_config_heartbeat_and_pulse_in_its_own_folder
// Rules:
//   - a section of the template with no domain here is a gap in genesis; a domain no section names is a gap in the template.
//   - a component without a capability, a command or its events is refused by the registry (2c), said, not passed.
//   - what `generated` names is regenerated from the components when they change; a hand edit to it is lost.

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
// Domain 2c — Registry as the doorway (the spec's 11th block; nodes in Guardian's layout)
// ══════════════════════════════════════════════════════════════════════════════
// James, 2026-10-01: "add the components registry as an 11th chunk … where its all wired in, event driven
// interaction contract, after the file list and tree, then the registry can map the relation to each component and
// chunk, and also is its self the doorway, and the rest is isolated modular, interacting through the interaction
// contract/registry … routes, cli, nodes and dir … the ui can also float on top … the nodes based data structure
// exactly like guardian."
//
// What Domain 2b's P1 MANIFEST produces, made physical. The spec template (idearium/spec-engine/blocks.yaml) carries it
// as its 11th block, `registry`, built after `build_order` (the file list and tree) and waiting on it. Its output is
// not prose: it is the node set below, one file per fact, in lib/node-export.js's envelope
// { envelope, uuid, type, id, context, intent, summary, system, tags, fingerprint, payload } — the same layout
// Guardian keeps its .hat/.agent/.job nodes in (data/nodes/<type>/<id>.<type>), so one reader serves both.
domain "registry"
doorway         = the_registry_itself_the_only_thing_a_module_or_the_ui_reads_to_find_another
node_dir        = nodes_slash_type_slash_id_dot_type_one_file_per_fact
component_node  = one_per_file_id_by_loom_rule_path_to_dotted_id_with_chunk_type_layer_file
hook_node       = one_per_crossing_point_export_import_emit_on_route_cli
wire_node       = one_per_relation_from_hook_to_hook_requires_or_event
event_node      = one_per_event_emitted_by_consumed_by_payload
capability_node = one_per_capability_of_a_component_at_least_one_per_component_what_it_can_do
command_node    = one_per_http_route_and_per_cli_verb_with_the_component_that_serves_it_invoking_one_of_its_capabilities
contract_node   = the_interaction_contract_rules_crossings_breaches_orphans_unhandled_events
system_node     = entry_points_ports_data_dirs_node_types_counts
archive         = a_node_no_longer_produced_moves_to_nodes_slash_archive_never_deleted
// Rules:
//   - a module never imports across a seam; it calls a route, emits an event, or uses a hook the registry declares.
//   - the UI floats on top: it reads the registry and calls routes and events; it imports no module.
//   - an orphan component or an event with no consumer is a gap in the contract node, not a silent leftover.
//   - the registry is regenerated from the code (idearium/repo/architecture.js toNodes, POST /api/repos/:uuid/architecture);
//     an unchanged node is left alone (fingerprint), so its history is real change, not churn.

// ══════════════════════════════════════════════════════════════════════════════
// Domain 2d — Nodes (the data structure: one file per fact, JAA tables as the node index)
// ══════════════════════════════════════════════════════════════════════════════
// James, 2026-10-05: "every system is supposed to be sovereign. the components registry is a an event driven
// interaction contract. nodes for data to persist or move through the system. isolated from each other" · "node based
// data structure using jaa tables as a node index." · "guardian is the closest".
//
// Written from Guardian's real model, not invented: guardian/lib/node-registry.js (a watcher per node type over
// data/nodes/<type>/, a _ledger.jsonl per folder) and lib/node-index.js (one JAA table per type, nodes_<type>, upserted;
// nodes_<type>_ledger appended, never updated; a delete is a new row with _deleted, never a mutation), with each node's
// shape in lib/node-schemas.js and the types named in NODE-TAXONOMY.md. Domain 2c's registry is a set of these nodes;
// so is every piece of data a system keeps or passes on.
domain "nodes"
node_file      = data_slash_nodes_slash_type_slash_id_dot_type_one_file_per_fact_the_canonical_record
envelope       = lib_node_export_envelope_uuid_type_id_context_intent_summary_system_tags_fingerprint_payload
node_schema    = one_schema_per_node_type_checked_before_a_node_is_written_lib_node_schemas
taxonomy       = every_node_type_named_once_with_the_system_that_owns_it_node_taxonomy_md
node_index     = one_jaa_table_per_node_type_nodes_type_upserted_by_id_queryable_survives_restart
node_ledger    = nodes_type_ledger_jaa_table_append_only_every_add_change_delete
soft_delete    = a_removed_node_is_a_new_row_marked_deleted_never_a_mutation_the_file_moves_to_nodes_archive
watcher        = per_type_folder_watcher_file_change_to_index_and_ledger_and_a_node_change_event
sovereign_store = each_system_indexes_its_own_nodes_in_its_own_data_folder_never_another_systems
moves          = data_moves_between_systems_as_nodes_through_the_interaction_contract_never_by_reaching_into_another_store
// Rules:
//   - the file is the truth; the JAA table is an index of it and can be rebuilt from the files alone.
//   - a node that fails its schema is refused with the reason, never written half-valid.
//   - a node type no taxonomy names is a gap in the contract node (Domain 2c), not a silent new kind of data.
//   - the pulse (Domain 10) carries each node type's count, so an index falling behind its files shows as drift.

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
// Domain 11 — Routing (which agent builds a chunk, and where it goes when that fails)
// ══════════════════════════════════════════════════════════════════════════════
// James, 2026-10-01: "can we have full options for fallback logic, routing. what could improve stability with the
// pipeline?" The policy is config (CONFIG_OUTSIDE_CODE), not a literal: NEXUS keeps it as idearium's routing.* keys and
// lib/pipeline-routing.js; a genesis system keeps it in config/genesis.config.json and spine/route-policy.js.
domain "routing"
route           = ordered_providers_one_chunk_will_try_each_with_its_reason
mode            = fixed_or_chain_or_local_first_or_economy
chain           = the_global_fallback_order_after_the_chosen_agent_and_the_blocks_own_fallback
failure_class   = empty_truncated_refused_timeout_provider_down_rate_limit_login_unknown
fallback_on     = the_failure_classes_that_move_to_the_next_provider_login_never
breaker         = per_provider_n_failures_in_a_row_open_it_for_a_cooldown_an_open_provider_is_skipped_and_said
hop             = one_providers_verified_attempts_recorded_on_the_chunk_provider_outcome_class_ms
axiom NO_SILENT_SKIP            // a provider left out of a route (unknown, breaker open) is listed with the reason
axiom ROUTE_IS_PROVENANCE       // every hop a chunk took is kept on the chunk: who failed first, why, who built it

// ══════════════════════════════════════════════════════════════════════════════
// GENESIS FILE TREE — 1.4.0: the shape Nexus systems have. One catalog entry per file; each file is a chunk: minimal
// code to execute its one stated intent. uuid + depends[] are literal:
//   depends = uuids of files this file calls or needs first (directional — generates the registry, the graph and the
//             build order). Here they are the file's real require()s plus the files it reads at run time.
//   related = associated files that are NOT dependencies (generates nothing)
//   source  = where the file comes from in the COS archetype nexus-system: skeleton (cos/archetype/nexus-system/),
//             component:<id> (reusable, cos/archetype/components), template-schemas (templates/system/schemas/)
// <system> is the system's slug. Checked by `idearium manifest check <spec>`; tests/modules/test-system-skeleton
// fails if this list and the archetype's files ever differ.
//
// Where each domain above lives in this tree (the 1.3.0 file names in the domains' prose are in the archive):
//   shape 0a ........ the whole tree; spec/<system>.spec is the template's sections, filled
//   schema 0 ........ schemas/schema.<type>; the shape check in lib/system.js; tests/
//   core 1 .......... lib/system.js (boot), server.js and cli.js (runtime), lib/<component>.js (the engine, slotted in)
//   contract 2 ...... interaction-contract.json + GET /contract (route nodes added); contracts/handshake.js (the gate)
//   manifest 2b ..... registry-components.js and this catalog; the contract and taxonomy are derived, never hand-written
//   registry 2c ..... registry-components.js (the spine); lib/commands.js (the door every command goes through)
//   nodes 2d ........ data/nodes/<type>/<id>.<type>, lib/envelope.js, lib/node-index.js, jaa-store.js (data/node-index/)
//   seam 3 .......... compartment.json — existence and boundary only
//   wire 3b ......... hook and wire nodes; lib/bus.js
//   ledger 4 ........ lib/ledger.js — data/ledger/<session>/events.jsonl
//   identity 5 ...... a uuid on every node and every registry entry
//   config 6 ........ <system>.config.json, config.js (environment over file)
//   lattice 7 ....... capability bundles (lib/listener.js) — references to every related node, never copies
//   nerve 8 ......... lib/listener.js — a node dropped into its folder goes live
//   tv-ui 9 ......... ui/ — not generated; floats on top of the contract, each element gated on its command
//   pulse 10 ........ lib/heartbeat.js — <system>.heartbeat with node counts and refused nodes
//   routing 11 ...... route nodes, served by server.js (which agent builds a chunk stays Nexus's lib/pipeline-routing.js)
// ══════════════════════════════════════════════════════════════════════════════

catalog GENESIS_FILE_TREE {

  // ── identity and configuration
  file "compartment.json" {
    uuid    = gs0002-skele-4000-8000-000000000002
    intent  = declare_the_cos_seam
    summary = "The COS compartment: archetype nexus-system, runtime node, entry server.js, health check /health. Existence and boundary only."
    source  = skeleton
    depends = []
  }
  file "config.js" {
    uuid    = gs0003-skele-4000-8000-000000000003
    intent  = load_the_configuration
    summary = "Reads <system>.config.json, then the environment (<SYSTEM>_PORT, <SYSTEM>_HEARTBEAT_MS) over it."
    source  = skeleton
    depends = [ "gs0027" ]
  }
  file "package.json" {
    uuid    = gs0020-skele-4000-8000-000000000020
    intent  = declare_the_system_package
    summary = "Name, version, scripts: start (server.js), cli (cli.js), test (tests/skeleton.test.js). No dependencies — the system stands alone."
    source  = skeleton
    depends = []
  }
  file "<system>.config.json" {
    uuid    = gs0027-skele-4000-8000-000000000027
    intent  = system_wide_adjustable_values
    summary = "Port, heartbeat interval, listener poll, the Versionium slot. Anything adjustable lives here, not in code."
    source  = skeleton
    depends = []
  }

  // ── registry, contract and taxonomy
  file "event-taxonomy.js" {
    uuid    = gs0014-skele-4000-8000-000000000014
    intent  = the_events_generated_from_event_nodes
    summary = "The system events the skeleton emits, plus every event node — generated, never hand-written; the bus asks it whether an event is declared."
    source  = skeleton
    depends = []
  }
  file "interaction-contract.json" {
    uuid    = gs0016-skele-4000-8000-000000000016
    intent  = the_fixed_part_of_the_interaction_contract
    summary = "id, version, namespace, transport and the fixed resources; GET /contract adds every route node, so the contract grows with the system."
    source  = skeleton
    depends = []
  }
  file "registry-components.js" {
    uuid    = gs0021-skele-4000-8000-000000000021
    intent  = the_component_registry_the_spine
    summary = "Every component: type, id, uuid, file, intent, version, status, capabilities (at least one), hooks, consumers, data. Every component connects only to this."
    source  = skeleton
    depends = []
  }
  file "contracts/handshake.js" {
    uuid    = gs0036-compo-4000-8000-000000000036
    intent  = verify_another_systems_contract
    summary = "Same id, compatible version, the resources needed, the hash last seen — before one system calls another."
    source  = component:handshake
    depends = []
  }

  // ── schemas
  file "schemas/index.js" {
    uuid    = gs0022-skele-4000-8000-000000000022
    intent  = load_the_systems_own_schemas
    summary = "Reads schemas/schema.<type>; the node index refuses a node whose type has no schema."
    source  = skeleton
    depends = []
  }
  file "schemas/schema.bundle" {
    uuid    = gs0038-templ-4000-8000-000000000038
    intent  = schema_for_bundle_nodes
    summary = "The bundle node type's fields, copied from the system template; the system owns this copy."
    source  = template-schemas
    depends = []
  }
  file "schemas/schema.capability" {
    uuid    = gs0039-templ-4000-8000-000000000039
    intent  = schema_for_capability_nodes
    summary = "The capability node type's fields, copied from the system template; the system owns this copy."
    source  = template-schemas
    depends = []
  }
  file "schemas/schema.command" {
    uuid    = gs0040-templ-4000-8000-000000000040
    intent  = schema_for_command_nodes
    summary = "The command node type's fields, copied from the system template; the system owns this copy."
    source  = template-schemas
    depends = []
  }
  file "schemas/schema.component" {
    uuid    = gs0041-templ-4000-8000-000000000041
    intent  = schema_for_component_nodes
    summary = "The component node type's fields, copied from the system template; the system owns this copy."
    source  = template-schemas
    depends = []
  }
  file "schemas/schema.event" {
    uuid    = gs0042-templ-4000-8000-000000000042
    intent  = schema_for_event_nodes
    summary = "The event node type's fields, copied from the system template; the system owns this copy."
    source  = template-schemas
    depends = []
  }
  file "schemas/schema.hook" {
    uuid    = gs0043-templ-4000-8000-000000000043
    intent  = schema_for_hook_nodes
    summary = "The hook node type's fields, copied from the system template; the system owns this copy."
    source  = template-schemas
    depends = []
  }
  file "schemas/schema.route" {
    uuid    = gs0044-templ-4000-8000-000000000044
    intent  = schema_for_route_nodes
    summary = "The route node type's fields, copied from the system template; the system owns this copy."
    source  = template-schemas
    depends = []
  }
  file "schemas/schema.wire" {
    uuid    = gs0045-templ-4000-8000-000000000045
    intent  = schema_for_wire_nodes
    summary = "The wire node type's fields, copied from the system template; the system owns this copy."
    source  = template-schemas
    depends = []
  }

  // ── data: nodes, index, ledger, baseline
  file "data/baseline/.gitkeep" {
    uuid    = gs0004-skele-4000-8000-000000000004
    intent  = keep_data_baseline
    summary = "Keeps data/baseline/ in version control."
    source  = skeleton
    depends = []
  }
  file "data/nodes/capability/<system>.core.observe.capability" {
    uuid    = gs0005-skele-4000-8000-000000000005
    intent  = seed_capability_node
    summary = "A seed capability node of the core component, so the skeleton has the component shape from its first boot."
    source  = skeleton
    depends = [ "gs0039" ]
  }
  file "data/nodes/command/<system>.nodes.command" {
    uuid    = gs0006-skele-4000-8000-000000000006
    intent  = seed_command_node
    summary = "A seed command node of the core component, so the skeleton has the component shape from its first boot."
    source  = skeleton
    depends = [ "gs0040" ]
  }
  file "data/nodes/command/<system>.status.command" {
    uuid    = gs0007-skele-4000-8000-000000000007
    intent  = seed_command_node
    summary = "A seed command node of the core component, so the skeleton has the component shape from its first boot."
    source  = skeleton
    depends = [ "gs0040" ]
  }
  file "data/nodes/component/<system>.core.component" {
    uuid    = gs0008-skele-4000-8000-000000000008
    intent  = seed_component_node
    summary = "A seed component node of the core component, so the skeleton has the component shape from its first boot."
    source  = skeleton
    depends = [ "gs0041" ]
  }
  file "data/nodes/event/<system>.nodes.listed.event" {
    uuid    = gs0009-skele-4000-8000-000000000009
    intent  = seed_event_node
    summary = "A seed event node of the core component, so the skeleton has the component shape from its first boot."
    source  = skeleton
    depends = [ "gs0042" ]
  }
  file "data/nodes/event/<system>.status.reported.event" {
    uuid    = gs0010-skele-4000-8000-000000000010
    intent  = seed_event_node
    summary = "A seed event node of the core component, so the skeleton has the component shape from its first boot."
    source  = skeleton
    depends = [ "gs0042" ]
  }
  file "data/nodes/hook/<system>.core.http.hook" {
    uuid    = gs0011-skele-4000-8000-000000000011
    intent  = seed_hook_node
    summary = "A seed hook node of the core component, so the skeleton has the component shape from its first boot."
    source  = skeleton
    depends = [ "gs0043" ]
  }
  file "data/nodes/route/<system>.nodes.route" {
    uuid    = gs0012-skele-4000-8000-000000000012
    intent  = seed_route_node
    summary = "A seed route node of the core component, so the skeleton has the component shape from its first boot."
    source  = skeleton
    depends = [ "gs0044" ]
  }
  file "data/nodes/route/<system>.status.route" {
    uuid    = gs0013-skele-4000-8000-000000000013
    intent  = seed_route_node
    summary = "A seed route node of the core component, so the skeleton has the component shape from its first boot."
    source  = skeleton
    depends = [ "gs0044" ]
  }
  file "jaa-store.js" {
    uuid    = gs0030-compo-4000-8000-000000000030
    intent  = the_jaa_database
    summary = "A table per name, rows upserted by id, soft deletes, an append-only <table>.jsonl beside each. The node index lives in it."
    source  = component:jaa-store
    depends = [ "gs0028" ]
  }

  // ── lib: the code the nodes point at
  file "lib/core.js" {
    uuid    = gs0017-skele-4000-8000-000000000017
    intent  = the_core_component
    summary = "Component <system>.core, capability <system>.core.observe: status and nodes — the system reporting on itself."
    source  = skeleton
    depends = [ "gs0037" ]
  }
  file "lib/system.js" {
    uuid    = gs0018-skele-4000-8000-000000000018
    intent  = boot
    summary = "Config, schemas, store, ledger, bus, node index, listener, heartbeat, and the component-shape check. server.js and cli.js both start here."
    source  = skeleton
    depends = [ "gs0003", "gs0022", "gs0014", "gs0030", "gs0032", "gs0033", "gs0031", "gs0034", "gs0035", "gs0037", "gs0021" ]
  }
  file "lib/atomic-write.js" {
    uuid    = gs0028-compo-4000-8000-000000000028
    intent  = write_a_file_whole_or_not_at_all
    summary = "Temp file then rename; retries the Windows EPERM/EBUSY rename before it is an error."
    source  = component:atomic-write
    depends = []
  }
  file "lib/envelope.js" {
    uuid    = gs0029-compo-4000-8000-000000000029
    intent  = read_write_and_check_node_files
    summary = "data/nodes/<type>/<id>.<type> in the node envelope (JSON, which is also YAML); fingerprint; validate against a schema."
    source  = component:envelope
    depends = [ "gs0028" ]
  }
  file "lib/node-index.js" {
    uuid    = gs0031-compo-4000-8000-000000000031
    intent  = index_the_nodes_in_jaa_tables
    summary = "Domain 2d: nodes_<type> per type, nodes_<type>_ledger history; refuses a node that fails its schema; rebuildable from the files alone."
    source  = component:node-index
    depends = [ "gs0029" ]
  }
  file "lib/ledger.js" {
    uuid    = gs0032-compo-4000-8000-000000000032
    intent  = the_event_ledger
    summary = "Every event, per session, timestamped: data/ledger/<session>/events.jsonl."
    source  = component:ledger
    depends = []
  }
  file "lib/bus.js" {
    uuid    = gs0033-compo-4000-8000-000000000033
    intent  = the_one_way_an_event_moves
    summary = "Ledger first, then listeners; an event no node declares is still delivered and marked undeclared."
    source  = component:bus
    depends = []
  }
  file "lib/listener.js" {
    uuid    = gs0034-compo-4000-8000-000000000034
    intent  = a_dropped_node_goes_live
    summary = "Watches data/nodes, reindexes, emits <system>.node.changed, rewrites each capability bundle (references, never copies)."
    source  = component:listener
    depends = [ "gs0029" ]
  }
  file "lib/heartbeat.js" {
    uuid    = gs0035-compo-4000-8000-000000000035
    intent  = the_pulse
    summary = "Domain 10: <system>.heartbeat on an interval with uptime, node counts and refused nodes — an index behind its files shows as drift."
    source  = component:heartbeat
    depends = []
  }
  file "lib/commands.js" {
    uuid    = gs0037-compo-4000-8000-000000000037
    intent  = run_command_nodes_through_the_registry
    summary = "A command names its capability; the registry names the component and file; the command's events are emitted after it runs."
    source  = component:commands
    depends = []
  }

  // ── entry points
  file "cli.js" {
    uuid    = gs0001-skele-4000-8000-000000000001
    intent  = run_the_command_nodes
    summary = "node cli.js <command> [--flag value] — the same command nodes the routes run."
    source  = skeleton
    depends = [ "gs0018", "gs0037" ]
  }
  file "server.js" {
    uuid    = gs0023-skele-4000-8000-000000000023
    intent  = serve_the_route_nodes
    summary = "/health, /contract, /nodes/:type[/:id], and every route node — a new route is a node, this file does not change."
    source  = skeleton
    depends = [ "gs0018", "gs0037", "gs0016" ]
  }

  // ── spec, input/output, tests
  file "input/.gitkeep" {
    uuid    = gs0015-skele-4000-8000-000000000015
    intent  = keep_input
    summary = "Keeps input/ in version control."
    source  = skeleton
    depends = []
  }
  file "output/.gitkeep" {
    uuid    = gs0019-skele-4000-8000-000000000019
    intent  = keep_output
    summary = "Keeps output/ in version control."
    source  = skeleton
    depends = []
  }
  file "spec/<system>.node-taxonomy.md" {
    uuid    = gs0024-skele-4000-8000-000000000024
    intent  = the_node_types
    summary = "Each node type, what it is and its required fields."
    source  = skeleton
    depends = []
  }
  file "spec/<system>.spec" {
    uuid    = gs0025-skele-4000-8000-000000000025
    intent  = the_living_spec
    summary = "identity, context, file_structure, modules, components, generated — the architecture template's sections; grows with the system."
    source  = skeleton
    depends = []
  }
  file "tests/skeleton.test.js" {
    uuid    = gs0026-skele-4000-8000-000000000026
    intent  = prove_the_skeleton_is_alive
    summary = "Boots, indexes, checks the shape, serves routes, runs the CLI, and serves a route node dropped in without a restart."
    source  = skeleton
    depends = [ "gs0018", "gs0023", "gs0037", "gs0029" ]
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Build order — GENERATED from the depends[] graph above by `idearium manifest generate templates/genesis.spec`;
// never hand-edited. Boot order is lib/system.js: config → schemas → store → ledger → bus → node index → listener →
// heartbeat. A new system is this tree laid out (COS archetype nexus-system) with the idea slotted in as components:
// lib/<component>.js, its entry in registry-components.js, and its component, capability, command and event nodes.
// ══════════════════════════════════════════════════════════════════════════════
