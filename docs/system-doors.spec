spec:

  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # docs/system-doors.spec — every system's server.js: the door its CLI and API come through, mounted on its component registry, with the
  # UI on top. Idearium, Architect and Cortex get one; Cortex's boot.js is routed into its registry and retired; the handshake counts a
  # contract's real routes. Format: emerge's module spec (kg-builder, specDepth 1.0, no BLACK). Phases:
  # docs/2026-10-31-spec-everything-phasemap.spec.
  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        system-doors
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-31T00:00:00Z
    status:      specced
    uuid:        nexus-system-doors-spec-v1-0000-2026-1031-jamesbrooks-001
    origin: >-
      James, 2026-10-31, after the coder listed the systems without a server.js: "Idearium idearium/api/index.js — create a server.js for the
      cli and api, and route to the index.js" (written under Clear Glass, Idearium and Architect) · "Cortex cortex/boot.js (:3748) — make a
      server.js for cortex, and reroute the boot.js to component registry and retire the boot.js" · "all of the systems nodes connect through
      the server.js and uses the database, like guardian?" · earlier the same day: "yes like the server.js floats ontop then the ui ontop of
      that. then each system interacts through the registry?" The design is his; which file mounts what, and the order, are the coder's.
    purpose: >-
      One shape for every system's door (genesis.spec 1.5.0's skeleton, Guardian's and Versionium's real shape): server.js serves the
      contract, the handshake, the API routes and the CLI's calls; it mounts the system's component registry and routes each call to the
      component that owns it; the UI floats on top of the routes. A system's core (Idearium's index.js, Architect's service, Cortex's organs)
      sits under the registry, never reached around it.
    target_runtime: [node]
    language_stack: [javascript]
    paradigm: [reuse-before-build, one-door-per-system, registry-is-the-contract, move-then-archive]
    axioms: ["§5.9–§5.15 sovereignty", "§3.4 raw → lib → API → CLI → UI", "§0.3 nothing lost (archive, never delete)", "§1.2 nothing fails silently", "§8.6 reuse before build", "§10.3 one truth"]
    deps: []

    census: >-
      Read 2026-10-31 on main 0.60.320. Seven systems have a server.js (copilot, diagnostic, guardian, intelligence, loom, ollama,
      versionium). Idearium listens in idearium/api/index.js (11,738 lines; idearium/index.js, 935 lines, is its core, "CLI and API are
      projections"). Architect listens in architect/service.js (:3747, 760 lines). Cortex listens in cortex/boot.js (:3748, 1,677 lines, every
      route inline); lib/nexus/autopilot.js's boot plan and cortex/compartment.json's entry start it, and 20 files name it. Clear Glass serves
      its REST surface on :7702 from inside src/ipc/bridge.js (3,497 lines) in Electron's main process. The orchestrator's handshake
      (orchestrator/lib/contract-handshake.js:182) counts contract.routes || contract.channels, while Clear Glass and others publish their
      routes as components[]: those systems are reported with 0 routes.

    constraints:
      - id: DOOR-001
        description: "A new server.js changes no port, route or reply: every route answers as before (the same paths, the same bodies)."
        type: hard
        enforced_by: [GATE-DOOR-SAME]
      - id: DOOR-002
        description: "A file a door replaces is archived with its history, after every launcher points at the door; never deleted."
        type: hard
        enforced_by: [GATE-DOOR-ARCHIVE]
      - id: DOOR-003
        description: "The contract a door serves is generated from its registry: a route not in the registry is not served, and the handshake reads the same."
        type: hard
        enforced_by: [GATE-DOOR-ONE-TRUTH]

  schemas:

    - id: DoorManifest
      name: DoorManifest
      description: "What a system's server.js mounts, read at boot and served at /contract."
      fields:
        system:    "string"
        port:      "number — the system's own (compartment.json)"
        core:      "string — the module the routes reach (idearium/index.js, architect/service.js, cortex organs)"
        routes:    "[{ method, path, component }] — from registry-components.js"
        cli:       "[{ grammar, route }]"
        contractHash: "string"
      behavioral_contracts: ["generated, never hand-written"]
      error_paths: ["a route whose component is missing → refused at boot, named"]

    - id: HandshakeCount
      name: HandshakeCount
      description: "What the handshake counts for a contract."
      fields:
        routes:    "number — routes || channels || components with a route"
        shape:     "enum — routes | channels | components"
      behavioral_contracts: ["the shape it read is said beside the count"]
      error_paths: ["no recognised shape → 'unknown', never 0"]

  interfaces:

    - id: IF-IDEARIUM-API
      name: idearium-api
      path: idearium/api/index.js
      description: "Idearium's HTTP API and its listen() today."
      exports: ["the route table", "server.listen(PORT)"]
      behavioral_contracts: ["4800 by default"]
      error_paths: ["port taken → exits, said"]

    - id: IF-ARCHITECT-SERVICE
      name: architect-service
      path: architect/service.js
      description: "Architect's HTTP service (:3747): JAA → HookRegistry → Blueprint/SNR/Translate → HTTP → register."
      exports: ["the service", "its routes"]
      behavioral_contracts: ["load order is law (§3.1)"]
      error_paths: ["the orchestrator down → registers later"]

    - id: IF-CORTEX-BOOT
      name: cortex-boot
      path: cortex/boot.js
      description: "Cortex today: organs init, then every route inline, then listen on :3748."
      exports: ["routes: /health, /cfr/*, /api/event(s), /api/friction, …"]
      behavioral_contracts: ["started by autopilot's plan and compartment.json"]
      error_paths: ["an organ fails → said in its boot log"]

    - id: IF-HANDSHAKE
      name: contract-handshake
      path: orchestrator/lib/contract-handshake.js
      description: "The orchestrator's contract handshake: hash, trust, route count."
      exports: ["verify(systemId, contract) → entry"]
      behavioral_contracts: ["trust VERIFIED | MISMATCH"]
      error_paths: ["no contract → UNVERIFIED"]

    - id: IF-GUARDIAN-DOOR
      name: guardian-door
      path: guardian/server.js
      description: "The shape to follow: server.js with cli.js, config, compartment.json, registry-components.js, the interaction contract."
      exports: ["the skeleton's shape, as built"]
      behavioral_contracts: ["the reference door"]
      error_paths: ["the reference shape changes → this spec is addended (§12.5), the doors re-checked"]

    - id: IF-SKELETON-CORE
      name: skeleton-core
      path: cos/archetype/nexus-system/lib/system.js
      description: "The skeleton's boot core: config, schemas, the JAA store, the ledger and bus, the node index (and its first reindex), the listener and the heartbeat; server.js and cli.js both start here."
      exports: ["boot(ctx) → { config, schemas, store, ledger, bus, index, listener, heartbeat }", "shape(ctx) — component → capability → command → events, each a node"]
      behavioral_contracts: ["a shape gap is a problem the heartbeat reports, not a crash"]
      error_paths: ["config missing → the defaults, said"]

  modules:

    - id: MOD-DOOR-HANDSHAKE
      name: handshake-counts-real-routes
      uuid: nexus-system-doors-handshake-v1-0000-2026-1031-001
      path: orchestrator/lib/contract-handshake.js
      phase: DO0_the_handshake_counts_real_routes
      description: "The 0-routes defect: the handshake counts routes, channels, or components that carry a route, and says which shape it read."
      deps: [{ name: contract-handshake }]
      schema_refs: [HandshakeCount]
      exports: ["routeCount and routeShape on each entry"]
      gate_pipeline: ["GATE-DO0-001: Clear Glass's contract counts its components with routes"]
      behavioral_contracts: ["an unknown shape is 'unknown', never 0"]
      error_paths: ["a malformed component → skipped and counted as malformed"]
      acceptance: ["Clear Glass's registry-components.js contract reports its route count (not 0) with shape components"]

    - id: MOD-DOOR-IDEARIUM
      name: idearium-door
      uuid: nexus-system-doors-idearium-v1-0000-2026-1031-001
      path: idearium/server.js
      phase: DO1_idearium_door
      description: "idearium/server.js: the door for Idearium's CLI and API. It starts the API (api/index.js's handler, its listen moved here), serves /contract and the handshake from idearium/registry-components.js, and routes to idearium/index.js's core as api/index.js does today; compartment.json and the boot plan name server.js."
      deps: [{ name: idearium-api }, { name: guardian-door }, { name: handshake-counts-real-routes }]
      schema_refs: [DoorManifest]
      exports: ["node idearium/server.js", "GET /contract, GET /health — unchanged replies"]
      gate_pipeline: ["GATE-DO1-001: every route of the old listen answers the same", "GATE-DO1-002: launchers switched"]
      behavioral_contracts: ["api/index.js keeps its routes; only its listen moves"]
      error_paths: ["the old entry still started by a launcher → both refused to bind, the launcher named"]
      acceptance: ["Idearium's suite green started through server.js; GET /contract hash equals the registry's"]

    - id: MOD-DOOR-CORE
      name: system-core-from-the-skeleton
      uuid: nexus-system-doors-core-v1-0000-2026-1031-001
      path: architect/lib/system.js
      phase: DO2a_architect_boots_from_the_core
      description: >-
        His "it all builds from the origin as a foundation/core like the system.js, which needs the config": a system's lib/system.js laid out
        from the skeleton (cos/archetype/nexus-system/lib/system.js and the files it requires: ledger, bus, node-index, listener, heartbeat,
        boundary), filled from the system's own config, schemas and store; its server.js and cli.js start from it. No system has one today;
        Architect (6 files) is the first, then each system in the queue's order (MOD-SL-LIBRARY), one phase each.
      deps: [{ name: skeleton-core }, { name: architect-service }]
      schema_refs: [DoorManifest]
      exports: ["architect/lib/system.js and its five parts", "architect/config.js read first"]
      gate_pipeline: ["GATE-DO2a-001: the skeleton's tests pass against the system (tests/skeleton.test.js laid out)", "GATE-DO2a-002: the shape check's gaps listed, not hidden"]
      behavioral_contracts: ["laid out from the archetype (lib/file-tree-plan.js fromCosTemplate), never hand-copied"]
      error_paths: ["a part the system already has in another shape (its own ledger) → mapped onto the part, the old one archived after"]
      acceptance: ["architect boots through lib/system.js; the origin trace shows its config → system.js → server.js line"]

    - id: MOD-DOOR-ARCHITECT
      name: architect-door
      uuid: nexus-system-doors-architect-v1-0000-2026-1031-001
      path: architect/server.js
      phase: DO2_architect_door
      description: "architect/server.js: the same door for Architect, mounting service.js's routes behind the registry; with its missing compartment.json, cli.js and event-taxonomy.js (the skeleton's slots), so COS can supervise it."
      deps: [{ name: architect-service }, { name: guardian-door }, { name: system-core-from-the-skeleton }]
      schema_refs: [DoorManifest]
      exports: ["node architect/server.js", "architect/compartment.json", "architect/cli.js", "architect/event-taxonomy.js"]
      gate_pipeline: ["GATE-DO2-001: :3747 answers the same", "GATE-DO2-002: the skeleton's slots present"]
      behavioral_contracts: ["service.js's load order kept"]
      error_paths: ["the orchestrator down at boot → the door serves, its registration retried and said"]
      acceptance: ["the origin trace shows Architect with no missing slot"]

    - id: MOD-DOOR-CORTEX
      name: cortex-door
      uuid: nexus-system-doors-cortex-v1-0000-2026-1031-001
      path: cortex/server.js
      phase: DO3_cortex_door
      description: >-
        cortex/server.js: boot.js's organs init and listen move here; each inline route in boot.js becomes a component in
        cortex/registry-components.js with its handler in its organ's folder (cortex/routes/<group>.js), and server.js mounts them from the
        registry. Every launcher (autopilot's plan, compartment.json, the 20 files that name boot.js) is switched to server.js.
      deps: [{ name: cortex-boot }, { name: guardian-door }, { name: handshake-counts-real-routes }]
      schema_refs: [DoorManifest]
      exports: ["node cortex/server.js", "cortex/routes/*.js", "registry components with route handlers"]
      gate_pipeline: ["GATE-DO3-001: a route table taken from boot.js before the move, replayed after: same status and body shape", "GATE-DO3-002: no launcher names boot.js"]
      behavioral_contracts: ["the organs' load order kept (§3.1)"]
      error_paths: ["a route whose handler reaches another system's files → its crossing named, moved behind that system's route first"]
      acceptance: ["the replayed route table matches; autopilot boots cortex through server.js"]

    - id: MOD-DOOR-CORTEX-RETIRE
      name: cortex-boot-retired
      uuid: nexus-system-doors-cortex-retire-v1-0000-2026-1031-001
      path: _archive/cortex/boot.js
      phase: DO4_boot_js_retired
      description: "boot.js archived with a note pointing at server.js and the registry, once nothing requires or launches it; a stub at cortex/boot.js that starts server.js and says so stays one release for old launchers on his machine."
      deps: [{ name: cortex-door }]
      schema_refs: [DoorManifest]
      exports: ["_archive/cortex/boot.js", "cortex/boot.js stub (one release)"]
      gate_pipeline: ["GATE-DO4-001: zero requirers", "GATE-DO4-002: archived, not deleted"]
      behavioral_contracts: ["§0.3: the file and its history kept"]
      error_paths: ["a requirer found → the retirement waits, the requirer named"]
      acceptance: ["grep finds no launcher of cortex/boot.js but the stub; the archive holds it"]

    - id: MOD-DOOR-CG
      name: clear-glass-door
      uuid: nexus-system-doors-cg-v1-0000-2026-1031-001
      path: clear-glass/server.js
      phase: DO5_clear_glass_door
      description: >-
        TO CONFIRM (his line sits under Clear Glass too): clear-glass/server.js as the door for its CLI and REST surface (:7702), taken out of
        src/ipc/bridge.js into the door, still in Electron's main process (it needs the tabs' webContents), mounting the routes from
        clear-glass/registry-components.js; plus its missing cli.js, config.js and event-taxonomy.js.
      deps: [{ name: guardian-door }, { name: handshake-counts-real-routes }]
      schema_refs: [DoorManifest]
      exports: ["clear-glass/server.js (required by main/index.js)", "clear-glass/cli.js", "clear-glass/config.js", "clear-glass/event-taxonomy.js"]
      gate_pipeline: ["GATE-DO5-001: every /cli/* route answers the same", "GATE-DO5-002: bridge.js keeps only IPC"]
      behavioral_contracts: ["one door: the REST surface in one file, the IPC bridge in another"]
      error_paths: ["a route needing a renderer → served through the main process's IPC, said"]
      acceptance: ["Clear Glass's suite green; GET :7702/contract from the registry"]

  events:
    doors:
      - "system.door.up { system, port, routes, contractHash }"
      - "system.door.refused { system, route, why }"

  enforcement:
    gates:
      - { id: GATE-DOOR-SAME, name: same-replies, severity: fatal, check: "a recorded route table replayed before and after: same status and body shape", on_failure: "the move is rolled back" }
      - { id: GATE-DOOR-ARCHIVE, name: archive-not-delete, severity: fatal, check: "a replaced file is in _archive with a pointer", on_failure: "refused" }
      - { id: GATE-DOOR-ONE-TRUTH, name: contract-from-registry, severity: error, check: "the served /contract hash equals the registry's", on_failure: "the handshake says MISMATCH" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node"
    - "per module: its acceptance lines"
