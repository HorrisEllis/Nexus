// GENESIS-SANDBOXED — a fork of genesis
// UUID: genesis-sandboxed-v1-0000-2026-1021-jamesbrooks-001
// fork_of genesis.spec 1.5.0 — this file holds ONLY what the fork adds. Everything genesis says (its spine, axioms, domains 0a–11
// and its 71-file catalog) holds here unchanged; read genesis.spec first. A whole copy would be two contracts drifting apart, so
// the fork is the delta, and tests/modules/test-genesis-sandboxed.test.js fails the day genesis moves past the version named above.

version 1.0.0
fork_of genesis 1.5.0
// 1.0.0 (2026-10-21, parked — not released; a delta, while he decides full copy or delta): James, after asking how genesis works and whether it is valuable: "can you add to a fork of
// genesis spec, its contained in a isolated sandbox using the component registry as a drawbridge, and tunnel into the compartment,
// the bridge, and interaction contract."
//
// What he decided: a variant of the system template whose system runs sealed in an isolated sandbox. The component registry is
// the drawbridge (the one way across the wall), and exactly three tunnels pass through it: into the system's compartment, into
// the bridge, and into its interaction contract. Nothing else crosses.
//
// What it stands on (read from the code, §8.6; nothing below is invented):
//   - the drawbridge: genesis 1.5.0's REGISTRY_IS_THE_DRAWBRIDGE and SOVEREIGN_FOLDER (his words of 2026-10-17: "cos is the
//     isolated compartment for each system using the regisry as a drawbridge"); lib/drawbridge-registry.js reads a system's
//     declared registry against its source, and what is reached without being declared is its negative space ("extra").
//   - the tunnel: lib/system-registry.js tunnel(name) and heartbeat(name) (DB13/DB14, 0.60.128, his "integrate the
//     system-registry.js as the tunnel or drawbridge? then through that access the command line interface, and routes"). That is
//     the outside end: what a system offers and how it is reached. This fork writes the inside end into the template.
//   - the compartment: COS (cos/), entered only through lib/cos-bridge.js ("the single real entry point from any NEXUS subsystem
//     into COMPARTMENT OS"); a compartment has its own fs.root and manifest; cos/compartment/qemu-runtime.js has the ephemeral
//     'windows-sandbox' archetype.
//   - the bridge: genesis's lib/handoff.js (work handed to another system as a verified file: registry + handshake + schema first,
//     a refusal is a receipt with why) and the Bridge system's request lifecycle (docs/INTERACTION_CONTRACTS.md, BRIDGE :9999:
//     handshake, requests created → accepted → complete | rejected | expired).
//   - the interaction contract: genesis's interaction-contract.json + GET /contract, contracts/handshake.js, lib/commands.js.
//
// The coder's reading, to confirm with him: "the bridge" is read as the system-to-system bridge (handoffs and the Bridge's
// requests). Another reading exists: lib/cos-bridge.js, the bridge into COS. Under this reading cos-bridge is the compartment
// tunnel's far end, so both are covered; if he meant something else, the bridge tunnel is the one to change.

// ── Axioms the fork adds (genesis's 22 all hold) ──────────────────────────────
axiom SEALED_SANDBOX            // the system runs in its own isolated COS compartment: its own fs.root, no network and no file outside it except through a tunnel (James, 2026-10-21)
axiom DRAWBRIDGE_IS_THE_ONLY_CROSSING // the component registry is the drawbridge: a crossing in or out that the registry does not declare is refused, and the refusal is a receipt with why (James)
axiom THREE_TUNNELS             // exactly three tunnels pass the drawbridge: compartment, bridge, contract; a fourth is a change to this spec, never to the code alone (James)
axiom TUNNEL_IS_DECLARED        // each tunnel is a registry entry with its own hooks, checked against the source by the drawbridge (lib/drawbridge-registry.js); an undeclared way in is its negative space
axiom HANDSHAKE_AT_THE_GATE     // every tunnel crossing passes contracts/handshake.js first; a tunnel never opens without one
axiom SANDBOX_IS_DISPOSABLE     // the sandbox can be destroyed and rebuilt from its compartment manifest and its nodes; nothing the system needs lives only in the sandbox's runtime

// ══════════════════════════════════════════════════════════════════════════════
// Domain S1 — Sandbox (the wall)
// ══════════════════════════════════════════════════════════════════════════════
// genesis's seam (Domain 3) is compartment.json, "existence and boundary only", and SOVEREIGN_FOLDER asks the heartbeat to report
// a require that leaves the folder. The fork makes the wall hard: the compartment is a sandbox, and its boundary is enforced at
// runtime, not only reported.
domain "sandbox"
sandbox        = isolated_cos_compartment_with_its_own_fs_root_and_manifest_entered_only_through_lib_cos_bridge
isolation      = no_network_no_shared_files_no_process_reach_except_through_a_tunnel
archetype      = nexus_system_sealed_ephemeral_runtime_when_asked_windows_sandbox_or_qemu_else_node_process
rebuild        = destroy_and_recreate_from_compartment_manifest_plus_nodes_without_loss
boundary_check = lib_boundary_js_at_build_plus_the_sandbox_refusing_at_run
// Rule: the sandbox's manifest (sandbox.json) names its three tunnels and nothing else; a tunnel missing from it does not exist.
// Rule: a breach (a file, socket or process reached outside a tunnel) is a refused crossing: a receipt, an event, a heartbeat problem.

// ══════════════════════════════════════════════════════════════════════════════
// Domain S2 — Drawbridge (the one way across)
// ══════════════════════════════════════════════════════════════════════════════
// genesis Domain 2c makes the registry the doorway; the fork makes it the drawbridge in his sense: the registry is raised (nothing
// crosses) until a crossing is declared in it and the handshake passes; then it is lowered for that crossing only.
domain "drawbridge"
drawbridge     = the_component_registry_registry_components_js_the_only_crossing_point_of_the_sandbox_wall
raised         = default_state_nothing_crosses
lowered        = for_one_declared_crossing_after_the_handshake_passes_then_raised_again
crossing       = a_route_a_cli_command_an_event_or_a_handoff_named_in_the_registry_with_its_tunnel
receipt        = every_crossing_allowed_or_refused_written_to_the_ledger_with_who_what_tunnel_and_why
negative_space = what_the_source_reaches_that_the_registry_does_not_declare_read_by_lib_drawbridge_registry_js_as_extra
// Rule: the registry declares each crossing with the tunnel it uses; a crossing that names no tunnel is refused.
// Rule: the drawbridge is the same file the planner, the Architect tab and the snapshot read (registryVersion: components, spine,
// event bus, contract — his decision of the same day). Rewiring the system is editing the registry, never the wall.

// ══════════════════════════════════════════════════════════════════════════════
// Domain S3 — Tunnels (the three ways through)
// ══════════════════════════════════════════════════════════════════════════════
// The outside end of each tunnel is lib/system-registry.js tunnel(name): what the system offers and how it is reached. The inside
// end is lib/tunnel.js in the system's own folder: three declared channels, each through the drawbridge and the handshake.
domain "tunnel"
tunnel.compartment = into_the_systems_own_cos_compartment_lifecycle_fs_root_manifest_health_through_lib_cos_bridge_only
tunnel.bridge      = into_the_bridge_work_handed_to_or_from_another_system_as_a_verified_file_lib_handoff_js_and_bridge_requests_handshake_created_accepted_complete_rejected_expired
tunnel.contract    = into_the_interaction_contract_get_contract_its_routes_cli_commands_events_and_toasts_lib_commands_js
tunnel.handshake   = contracts_handshake_js_before_every_crossing
tunnel.heartbeat   = each_tunnel_reports_open_closed_or_refusing_in_the_systems_pulse
// Rule: compartment, bridge and contract are three tunnels, not one: each has its own registry entry, hooks, events and receipts.
// Rule: the UI floats on top and enters only through tunnel.contract.
// Rule: tunnel.bridge carries other systems' requests in and this system's handoffs out; it never carries files outside the
// handoff folders (input/ processing/ done/ failed/, output/ for receipts).

// ── Spine bindings the fork adds (genesis's table holds) ──────────────────────
bind drawbridge.crossing  -> Gate               // lowering the drawbridge is a warp Gate: matches(declared && handshake) or refuses
bind tunnel.*             -> Stream.hook        // each tunnel is a hook on the kernel stream
bind sandbox.breach       -> Event              // a breach is an Event, received by the ledger and the heartbeat

// ══════════════════════════════════════════════════════════════════════════════
// The files the fork adds to genesis's GENESIS_FILE_TREE (genesis's 71 files are all kept). Their depends name only each other;
// what each stands on in genesis is in its summary, by file name, since a catalog's depends resolve inside one file.
// ══════════════════════════════════════════════════════════════════════════════

catalog GENESIS_SANDBOXED_ADDS {

  file "sandbox.json" {
    uuid    = gsb001-sandb-4000-8000-000000000001
    intent  = declare_the_sealed_sandbox_and_its_three_tunnels
    summary = "Extends compartment.json: isolation (no network, own fs.root), the runtime (node process; an ephemeral VM when asked), and the three tunnels by name — compartment, bridge, contract. Nothing else crosses."
    source  = sandbox
    depends = []
  }
  file "lib/drawbridge.js" {
    uuid    = gsb002-sandb-4000-8000-000000000002
    intent  = the_registry_as_the_drawbridge
    summary = "Raised by default. A crossing is lowered only when registry-components.js declares it with its tunnel and contracts/handshake.js passes; every crossing, allowed or refused, is a receipt in lib/ledger.js and an event on lib/bus.js."
    source  = sandbox
    depends = [ "gsb001" ]
  }
  file "lib/tunnel.js" {
    uuid    = gsb003-sandb-4000-8000-000000000003
    intent  = the_three_tunnels_inside_end
    summary = "tunnel.compartment (lifecycle and fs.root through lib/cos-bridge.js), tunnel.bridge (lib/handoff.js and Bridge requests), tunnel.contract (GET /contract, lib/commands.js). Each crossing goes through lib/drawbridge.js; lib/heartbeat.js reports each tunnel open, closed or refusing."
    source  = sandbox
    depends = [ "gsb002" ]
  }
  file "data/nodes/component/<system>.drawbridge.component" {
    uuid    = gsb004-sandb-4000-8000-000000000004
    intent  = the_drawbridge_as_a_registry_node
    summary = "Component <system>.drawbridge, capability <system>.drawbridge.cross, command <system>.crossings, events <system>.crossing.allowed and <system>.crossing.refused — each a node, per COMPONENT_SHAPE."
    source  = sandbox
    depends = [ "gsb002" ]
  }
  file "data/nodes/component/<system>.tunnel.component" {
    uuid    = gsb005-sandb-4000-8000-000000000005
    intent  = the_tunnels_as_registry_nodes
    summary = "Component <system>.tunnel with three hooks (compartment, bridge, contract), capability <system>.tunnel.status, command <system>.tunnels, event <system>.tunnel.changed."
    source  = sandbox
    depends = [ "gsb003" ]
  }
  file "tests/sandbox.test.js" {
    uuid    = gsb006-sandb-4000-8000-000000000006
    intent  = prove_the_wall_and_the_three_tunnels
    summary = "An undeclared route, command, event or handoff is refused with a receipt; each tunnel crosses after the handshake; a require outside the folder fails lib/boundary.js; the sandbox is destroyed and rebuilt from its manifest and nodes with nothing lost."
    source  = sandbox
    depends = [ "gsb002", "gsb003", "gsb004", "gsb005" ]
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Built and not built (said, not hidden):
//   - This is the template. The catalog's six files are not yet in the COS archetype (cos/archetype/nexus-system.js), so a system
//     scaffolded from this fork today gets genesis's skeleton plus this spec, not the six files. Adding them to a sealed archetype
//     is DB19 (OPEN) in docs/2026-10-17-system-drawbridge-phasemap.spec.
//   - Runtime sealing (no network) depends on the runtime: a node process is sealed by the drawbridge and boundary checks; a hard
//     wall needs the VM runtime (qemu-runtime.js). Which one a system uses is declared in sandbox.json.
// ══════════════════════════════════════════════════════════════════════════════
