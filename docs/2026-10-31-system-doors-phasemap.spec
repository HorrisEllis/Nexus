# docs/2026-10-31-system-doors-phasemap.spec — every system's server.js on its registry, from the skeleton's core; Cortex's boot.js retired
# The design is James's (quoted); the order and the cut are the coder's. Spec: docs/system-doors.spec.

origin: >-
  James, 2026-10-31: "yes like the server.js floats ontop then the ui ontop of that. then each system interacts through the registry?" ·
  "Idearium idearium/api/index.js — create a server.js for the cli and api, and route to the index.js" · "Cortex cortex/boot.js (:3748) —
  make a server.js for cortex, and reroute the boot.js to component registry and retire the boot.js" · "like it all builds from the origin as
  a foundation/core like the system.js, which needs the config."

status: "MAPPED 2026-10-31. Nothing built by this map."

decisions:
  DO_D0_server_floats_on_the_registry:
    chosen: "server.js is the connector: it mounts the system's registry and serves its contract, handshake, API and CLI; the UI floats on the routes; systems interact only through each other's registry contracts"
    by: "his, 2026-10-31 (origin), after the coder's pushback that server.js should not itself be the internal bus (the harness is); the harness spec is its own map — to confirm that this reading is his"
  DO_D1_clear_glass_door:
    chosen: "TO CONFIRM: Clear Glass gets the same door (his line \"create a server.js for the cli and api\" sits under Clear Glass, Idearium and Architect); built only after his yes"
    by: "the coder's reading of where his line applies"

phases:
  DO0_the_handshake_counts_real_routes:
    status: OPEN
    depends_on: []
    files: [orchestrator/lib/contract-handshake.js, tests/modules/test-contract-handshake-routes.test.js]
    spec: docs/system-doors.spec
    blocks: [MOD-DOOR-HANDSHAKE]
    does: "the 0-routes defect: count routes, channels or components with a route, and say which"
    proof: "Clear Glass's contract reports its routes with shape components"
  DO1_idearium_door:
    status: OPEN
    depends_on: [DO_D0_server_floats_on_the_registry, DO0_the_handshake_counts_real_routes]
    files: [idearium/server.js, idearium/api/index.js, idearium/compartment.json, lib/nexus/autopilot.js]
    spec: docs/system-doors.spec
    blocks: [MOD-DOOR-IDEARIUM]
    does: "idearium/server.js: the API's listen moves here; contract from the registry; launchers switched"
    proof: "Idearium's suite green through server.js; /contract hash = registry's"
  DO2a_architect_boots_from_the_core:
    status: OPEN
    depends_on: [SE_D2_the_origin_is_the_skeleton]
    files: [architect/lib/system.js, architect/lib/bus.js, architect/lib/ledger.js, architect/lib/node-index.js, architect/lib/heartbeat.js, architect/lib/listener.js, architect/config.js]
    spec: docs/system-doors.spec
    blocks: [MOD-DOOR-CORE]
    does: "the skeleton's core laid out for Architect, filled from its config; the first system that boots from the origin"
    proof: "architect boots through lib/system.js; the trace shows config → system.js → server.js"
  DO2_architect_door:
    status: OPEN
    depends_on: [DO2a_architect_boots_from_the_core, DO_D0_server_floats_on_the_registry]
    files: [architect/server.js, architect/compartment.json, architect/cli.js, architect/event-taxonomy.js, architect/service.js]
    spec: docs/system-doors.spec
    blocks: [MOD-DOOR-ARCHITECT]
    does: "architect/server.js on the core and the registry, with its missing slots"
    proof: "the origin trace shows Architect with no missing slot"
  DO3_cortex_door:
    status: OPEN
    depends_on: [DO_D0_server_floats_on_the_registry, DO0_the_handshake_counts_real_routes]
    files: [cortex/server.js, cortex/routes, cortex/registry-components.js, cortex/compartment.json, lib/nexus/autopilot.js, cortex/boot.js]
    spec: docs/system-doors.spec
    blocks: [MOD-DOOR-CORTEX]
    does: "boot.js's routes become registry components with handlers in cortex/routes; server.js mounts them; launchers switched"
    proof: "a route table recorded before, replayed after: the same"
  DO4_boot_js_retired:
    status: OPEN
    depends_on: [DO3_cortex_door]
    files: [_archive/cortex/boot.js, cortex/boot.js]
    spec: docs/system-doors.spec
    blocks: [MOD-DOOR-CORTEX-RETIRE]
    does: "boot.js archived; a one-release stub that starts server.js"
    proof: "no launcher names boot.js but the stub"
  DO5_clear_glass_door:
    status: OPEN
    depends_on: [DO_D1_clear_glass_door, DO0_the_handshake_counts_real_routes]
    files: [clear-glass/server.js, clear-glass/src/ipc/bridge.js, clear-glass/src/main/index.js, clear-glass/cli.js, clear-glass/config.js, clear-glass/event-taxonomy.js]
    spec: docs/system-doors.spec
    blocks: [MOD-DOOR-CG]
    does: "TO CONFIRM: the :7702 REST surface out of bridge.js into clear-glass/server.js"
    proof: "every /cli/* route answers the same; contract from the registry"

order: "DO0 first (it is a defect, and every door's handshake needs it); then DO2a → DO2 (the smallest system proves the core), DO1, DO3 → DO4; DO5 after his yes."
