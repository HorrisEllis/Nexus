spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # system-node-db.spec — each system's node database, served by the system itself, reachable by Copilot, its commands and
  # capabilities grown from the node schemas.
  # Format: emerge's module spec (emerge/SPEC_COMPILER.spec), compiled by emerge/compiler/kg-builder.js; every module and schema at
  # specDepth 1.0, invariants valid, no BLACK node (tests/modules/test-substrate-spec.test.js). This file is the build contract: if
  # the code is lost, it is rebuilt from here. Phases: docs/2026-10-22-system-node-db-phasemap.spec (`blocks:` name these modules).
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        system-node-db
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-22T00:00:00Z
    status:      specced
    uuid:        nexus-system-node-db-spec-v1-0000-2026-1022-jamesbrooks-001
    origin: >-
      James, 2026-10-22: "Need each database for each system, for all the dyamic node index, then the server.js uses that for
      managing data, history, and also copilot can access all of them expand the cli and capability from the schemas also."
      Earlier, his, and carried: 2026-09-12 "in each data folder we use a jaa database for each node type." · 0.60.130 P33a "each
      system has a database for each index of nodes with all the history." · P35 (docs/2026-09-11-sovereign-node-architecture-
      phasemap.spec) Copilot reads, edits and creates nodes. The idea and the direction are his; the coder wrote the census and the
      contracts.
    purpose: >-
      Every system keeps its nodes in its own database (one table per node type, one ledger per type) and serves them itself: list,
      read, history, create, change, archive. Every write goes to the node's file first (the file is the node), is checked against
      its type's schema, and is recorded in the ledger with who made it. Copilot and every agent reach every system's nodes through
      the one command table. The commands, their arguments and each system's node capabilities are generated from the schemas, so a
      new node type is usable without new code.
    target_runtime: [node]
    language_stack: [javascript]
    paradigm: [SISO, file-is-the-node, append-only-ledger, schema-driven]
    axioms: ["§0.1 evidence over memory", "§0.3 nothing lost (archive, never delete)", "§1.2 nothing fails silently",
      "§5.2/§9.1 no side door: a write goes through the owning system", "§8.6 reuse before build", "§10.3 one truth layer",
      "REVERSIBILITY", "EXPLAINABILITY", "USER_AUTONOMY"]
    deps:
      - { name: js-yaml, version: ">=4.1.0", required: true, purpose: "node files and schemas" }

    census: >-
      Read in the tree 2026-10-22 (the coder's census, checked at lib/node-registry.js:196 and the phasemap lines named):
      - 14 systems hold data/nodes. 12 start their own listener (lib/node-registry.js startForSystem) and so own a store at
        <sys>/data/node-index; emerge is indexed only by the boot sync (lib/system-nodes.js), sentinel by nothing.
      - No system serves its own nodes. Idearium's GET /api/system/nodes/:system (idearium/api/index.js system.nodes) opens any
        system's store from disk, read only: stats, list, one node with its history, edges.
      - Nothing creates, changes or archives a node through a route. Copilot reads through nexus.command → `system nodes`.
      - lib/node-schemas/ holds ~68 type schemas (fields with type/required/description). Nothing generates commands or
        capabilities from them.
      - lib/node-index-watcher.js has no runtime caller (the listener is safe-watch inside node-registry.start()).

    constraints:
      - id: ND-001
        description: "The file is the node. A write is a file written through lib/node-export.js; the database follows the file, never the reverse."
        type: hard
        enforced_by: [GATE-ND-FILE-FIRST]
      - id: ND-002
        description: "A write is checked against its type's schema (lib/node-schemas.js checkPayload) before the file is written; a failing write is refused with the missing and wrong fields."
        type: hard
        enforced_by: [GATE-ND-SCHEMA]
      - id: ND-003
        description: "Every write is a ledger row naming who made it (person, agent:<name>, system:<name>) and why; nothing is erased: an archive moves the file to data/nodes/_archive/<type>/."
        type: hard
        enforced_by: [GATE-ND-LEDGER]
      - id: ND-004
        description: "A system's nodes are written only by that system's own route. Idearium forwards; it never writes another system's files."
        type: hard
        enforced_by: [GATE-ND-OWNER]
      - id: ND-005
        description: "Generated types (capability, command, system, hat, agent from lib/system-nodes.js) and types a schema marks protected are refused to agents; a person may still write them, said in the ledger."
        type: hard
        enforced_by: [GATE-ND-PROTECTED]
      - id: ND-006
        description: "Commands, arguments and node capabilities come from the schemas; no per-type command row or handler is hand-written."
        type: hard
        enforced_by: [GATE-ND-FROM-SCHEMA]

  schemas:

    - id: NodeRef
      name: NodeRef
      description: "Where a node lives: its system, its type and its id — the one address every route, command and ledger row uses."
      fields:
        system:   "string — the owning system's folder (guardian, cortex, …)"
        type:     "string — the node type, the file's extension (agent, capability, failure_mode, …)"
        id:       "string — the node id; its file is data/nodes/<type>/<fileIdOf(id)>.<type>"
        file:     "string — the file path relative to the repo root"
        exists:   "boolean — the file is on disk now"
        archived: "boolean — the file is under data/nodes/_archive/<type>/"
        indexed:  "boolean — the row is in the system's store"
        updatedAt: "number — epoch ms of the last write the ledger holds"
      behavioral_contracts: ["one node, one address, whichever door reads it"]
      error_paths: ["unknown system → 404 naming the systems that hold nodes"]

    - id: NodeWrite
      name: NodeWrite
      description: "One requested change to a node: create, set (replace the payload), patch (merge fields) or archive."
      fields:
        op:       "string — create | set | patch | archive"
        ref:      "NodeRef — the node"
        payload:  "object — the payload for create/set, the fields for patch; absent for archive"
        meta:     "object — envelope fields (summary, intent, tags, context)"
        by:       "string — person | person:cli | agent:<name> | system:<name> (the gate's keyed caller, as RC7 records)"
        why:      "string — one line, required for agents"
        at:       "number — epoch ms"
        expect:   "string|null — the fingerprint the writer read (a stale write is refused, not merged)"
      behavioral_contracts: ["a write without by is refused", "an agent's write without why is refused"]
      error_paths: ["op unknown → 400", "create on an existing id → 409 EXISTS", "set/patch/archive on a missing id → 404"]

    - id: LedgerRow
      name: LedgerRow
      description: "One row of nodes_<type>_ledger (and the type's _ledger.jsonl): what happened to a node, by whom, and why."
      fields:
        ts:          "number — epoch ms"
        type:        "string — node type"
        id:          "string — node id"
        action:      "string — added | changed | deleted | archived | invalid | type_mismatch | refused"
        by:          "string — who (absent on rows the file listener writes for an edit made outside a route: 'file')"
        why:         "string|null — the writer's reason"
        fingerprint: "string — sha256 of the payload after the write"
        file:        "string — file name"
      behavioral_contracts: ["append only; never updated", "a refused write is a row too (§1.2)"]
      error_paths: ["ledger unwritable → the write is still refused or done, and the response says the ledger failed"]

    - id: TypeSurface
      name: TypeSurface
      description: "What a node type offers, generated from its schema: its fields, which ops it allows, the command usage and the capability."
      fields:
        type:        "string — the node type"
        system:      "string — a system that holds this type"
        fields:      "array — [{ name, type, required, description }] from lib/node-schemas/schema.<type>"
        ops:         "array — read | history | create | set | patch | archive (writes absent for generated types)"
        agentWrite:  "boolean — false for generated and protected types (ND-005)"
        usage:       "array — the command lines for this type (nodes <sys> <type> …), with its required fields as --flags"
        capability:  "string — the capability id written as a node: <sys>.nodes.<type>"
        schemaStatus: "string — the schema's own status (REAL, PARTIAL, …), passed through"
      behavioral_contracts: ["same schema → same surface (deterministic)", "a type with no schema is read only and says so"]
      error_paths: ["schema unreadable → that type read only, with why"]

  interfaces:

    - id: IF-NODE-REGISTRY
      name: node-registry
      path: lib/node-registry.js
      description: "Each system's registry over its own JaaStore at <sys>/data/node-index (0.60.130 P33a)."
      exports: ["storeFor(system, { root, fresh })", "createNodeRegistry({ system, root, types, bus, quiet, fresh }) → { processFile, scan, start, stop, list, get, history, stats }", "startForSystem(system, { bus, root, delayMs, force, log })", "ownsItsDatabase(system, { root })"]
      behavioral_contracts: ["processFile(type, file) indexes one file and appends a ledger row", "a test process never touches the real tree"]
      error_paths: ["a file that does not parse → invalid row in the ledger, the index unchanged"]

    - id: IF-NODE-EXPORT
      name: node-export
      path: lib/node-export.js
      description: "The one node envelope: wrap, write and read a node file."
      exports: ["fileIdOf(id)", "wrap(type, id, payload, meta)", "exportToFile(type, id, payload, meta, destDir) → file", "importFromFile(file) → envelope", "KNOWN_TYPES"]
      behavioral_contracts: ["an unknown type is refused by wrap"]
      error_paths: ["unwritable folder → throws; the caller says why"]

    - id: IF-NODE-SCHEMAS
      name: node-schemas
      path: lib/node-schemas.js
      description: "The shared node-type schema registry (lib/node-schemas/schema.<type>)."
      exports: ["get(type) → { status, source, fields }", "list() → [{ type, status, source }]", "checkPayload(type, payload) → { ok, missing, wrongType, reason }"]
      behavioral_contracts: ["required fields and top-level typeof are checked; deeper structure is not"]
      error_paths: ["a malformed schema file is a hard error at load"]

    - id: IF-SYSTEM-NODES
      name: system-nodes
      path: lib/system-nodes.js
      description: "Generates each system's capability, command and system nodes (and Guardian's hat and agent nodes) at boot."
      exports: ["GENERATED_TYPES", "GUARDIAN_TYPES", "systems(root)", "sync({ root, only, dryRun, agents })", "index({ root })", "list({ type, system, q, limit, full })", "get(type, id, { system })"]
      behavioral_contracts: ["idempotent: an unchanged payload is not rewritten; a gone source is archived"]
      error_paths: ["one system failing is said, the rest sync"]

    - id: IF-SYSTEM-REGISTRY
      name: system-registry
      path: lib/system-registry.js
      description: "Which systems exist, their folders and ports."
      exports: ["folderOf(system)", "get(system) → { port, … }", "list()"]
      behavioral_contracts: ["one table of systems for every caller"]
      error_paths: ["unknown system → null"]

    - id: IF-COMMAND-TABLE
      name: route-commands
      path: idearium/cli/route-commands.js
      description: "The one command table: every row is a CLI command and, through nexus.command, a tool every agent has."
      exports: ["SPEC rows { key, usage, about, req(a) → { method, path, body }, print(d, a, h) }"]
      behavioral_contracts: ["an agent gets every row a person gets"]
      error_paths: ["a row whose route is missing fails its own test (route-commands coverage)"]

    - id: IF-NEXUS-CLIENT
      name: nexus-client
      path: lib/nexus-client.js
      description: "In-Nexus HTTP between systems by name (the drawbridge)."
      exports: ["get(system, path, opts)", "post(system, path, body, opts)", "call(system, method, path, body, opts) (PUT, PATCH)"]
      behavioral_contracts: ["a system down answers null or throws with the system named"]
      error_paths: ["timeout → error naming the system and the path"]

  modules:

    - id: MOD-ND-CENSUS
      name: node-census
      uuid: nexus-system-node-db-census-v1-0000-2026-1022-001
      path: lib/node-registry.js
      phase: ND1_every_system_has_its_database
      description: >-
        census({ root }) says, for every system that holds data/nodes: its types with file, indexed and ledger counts, whether its
        store exists, which process owns it (ownsItsDatabase, else the boot sync), and what is missing. Sentinel and emerge, which
        no process of their own indexes, are scanned by the orchestrator's boot sync into their own stores (startForSystem with
        their folder, owner 'orchestrator'), so every system has its database.
      deps: [{ name: node-registry }, { name: system-nodes }]
      schema_refs: [NodeRef]
      exports: ["census({ root }) → [{ system, store: bool, owner, types: { <type>: { files, indexed, history } }, missing: [why] }]", "indexFor(system, { root }) → scan result (the boot sync's call for a system with no process)"]
      gate_pipeline: ["GATE-ND1-001: every folder with data/nodes", "GATE-ND1-002: store present? counts : missing 'no database yet'", "GATE-ND1-003: owner = its own process | orchestrator boot sync | none (said)"]
      behavioral_contracts: ["a read creates nothing", "files ≠ indexed is reported per type, never hidden"]
      error_paths: ["a store that will not open → that system's row says why; the rest are counted"]
      acceptance: ["census on the tree lists all 14 systems; sentinel and emerge have stores after one boot sync"]

    - id: MOD-ND-ROUTES
      name: node-routes
      uuid: nexus-system-node-db-routes-v1-0000-2026-1022-001
      path: lib/node-routes.js
      phase: ND2_one_node_route_for_every_system
      description: >-
        One handler every system mounts: forSystem(system, { registry, root }) → handle(req, res, url) → true when it answered. GET
        /api/nodes (stats + census row), GET /api/nodes/:type (list; ?q= matches id, summary and string fields; ?limit), GET
        /api/nodes/:type/:id (the node, its NodeRef, its fingerprint), GET /api/nodes/:type/:id/history (ledger rows), POST
        /api/nodes/:type (create), PUT /api/nodes/:type/:id (set), PATCH /api/nodes/:type/:id (merge fields), POST
        /api/nodes/:type/:id/archive. A write: NodeWrite checked (by, why for agents, expect) → schema check → file written through
        node-export → registry.processFile at once (the answer carries the indexed row; it does not wait for the listener) → ledger
        row with by and why → bus <system>.node.<added|changed|archived>.
      deps: [{ name: node-registry }, { name: node-export }, { name: node-schemas }]
      schema_refs: [NodeRef, NodeWrite, LedgerRow]
      exports: ["forSystem(system, { registry, root, bus }) → handle(req, res, url) → boolean", "write(registry, NodeWrite) → { ok, ref, row, ledger } | { ok:false, status, code, why, missing, wrongType }"]
      gate_pipeline: ["GATE-ND2-001: path under /api/nodes? else not handled", "GATE-ND2-002: write → by present; agent → why present; protected type → refused for agents", "GATE-ND2-003: expect given and ≠ current fingerprint → 409 STALE", "GATE-ND2-004: checkPayload → refused with missing/wrongType", "GATE-ND2-005: exportToFile → processFile → ledger → emit"]
      behavioral_contracts: ["the file is written before the index (ND-001)", "an archive moves the file to _archive/<type>/ and its ledger row says archived", "a refused write is a ledger row with action refused"]
      error_paths: ["unknown type with no schema → writes refused (read still served)", "file write fails → 500 naming the file; the index unchanged"]
      acceptance: ["create → file on disk, row indexed, ledger row with by", "patch with a stale fingerprint → 409", "an agent writing a capability node → 403 PROTECTED", "archive → file moved, history shows it"]

    - id: MOD-ND-MOUNT
      name: node-mount
      uuid: nexus-system-node-db-mount-v1-0000-2026-1022-001
      path: lib/node-routes.js
      phase: ND3_each_server_serves_its_nodes
      description: >-
        Each system's server mounts forSystem with the registry its startForSystem already opened (guardian/server.js,
        copilot/server.js, ollama/server.js, loom/server.js, versionium/server.js, intelligence/server.js, architect/service.js,
        cortex/boot.js, orchestrator/orchestrator.js, diagnostic/nexus-diagnostic.js, idearium/api/index.js, clear-glass/src/main/index.js),
        one line beside the listener's start. startForSystem returns the registry it opened so the route and the listener share one
        store handle. Each system's interaction contract and registry-components gain the /api/nodes routes, so lib/system-nodes.js
        writes them as served command nodes.
      deps: [{ name: node-registry }, { name: system-nodes }]
      schema_refs: [NodeRef]
      exports: ["mount(server-dispatch, system, handle) — the one line each server adds", "startForSystem(...) → handle.registry once started"]
      gate_pipeline: ["GATE-ND3-001: every system that starts a listener mounts the route", "GATE-ND3-002: the route answers from the same store the listener writes"]
      behavioral_contracts: ["no system opens a second store for its routes", "the route is in the system's own contract (declared = served)"]
      error_paths: ["a system whose listener did not start answers 503 with why (a test process: not started, said)"]
      acceptance: ["GET :<port>/api/nodes on each running system answers its own stats", "loom's declared-vs-served scanner finds /api/nodes served by every system"]

    - id: MOD-ND-PROXY
      name: node-proxy
      uuid: nexus-system-node-db-proxy-v1-0000-2026-1022-001
      path: idearium/api/index.js
      phase: ND3_each_server_serves_its_nodes
      description: >-
        Idearium's system.nodes stops reading other systems' stores itself first: it asks the owning system's /api/nodes through
        nexus-client and answers with via: 'system'. When the owner is down, a read falls back to opening the store from disk (the
        0.60.130 behaviour, kept) with via: 'disk' and why; a write is refused with 503 OWNER_DOWN (no side door, ND-004). New:
        GET /api/system/nodes (the census of every system), and the write routes POST/PUT/PATCH /api/system/nodes/:system/:type[/:id]
        and POST …/:id/archive, each forwarded with the caller's identity as by.
      deps: [{ name: nexus-client }, { name: node-registry }, { name: system-registry }]
      schema_refs: [NodeWrite]
      exports: ["system.nodes (GET, via system|disk)", "system.nodes.list (GET census)", "system.nodes.write (POST/PUT/PATCH/archive, forwarded)"]
      gate_pipeline: ["GATE-ND3P-001: owner up? forward : read → disk, write → 503", "GATE-ND3P-002: by = the gate's keyed caller (RC7 startedBy), never taken from the body for agents"]
      behavioral_contracts: ["a read says where it came from (via)", "Idearium never writes another system's node file"]
      error_paths: ["owner times out → read falls back to disk with the timeout named; a write says OWNER_DOWN"]
      acceptance: ["with guardian up, system nodes guardian reads via system; with it down, via disk with why; a write with it down is refused"]

    - id: MOD-ND-SURFACE
      name: node-surface
      uuid: nexus-system-node-db-surface-v1-0000-2026-1022-001
      path: lib/node-surface.js
      phase: ND4_commands_and_capabilities_from_the_schemas
      description: >-
        From lib/node-schemas: surface(system) → TypeSurface[] for every type that system holds; surfaceOf(type) for one. Writes
        allowed unless the type is generated (system-nodes GENERATED_TYPES, GUARDIAN_TYPES) or its schema says protected: true;
        agents never write those. usage lines put the schema's required fields as --flags. lib/system-nodes.js sync() writes one
        capability node per (system, type): <sys>.nodes.<type>, its ops and fields, marked declared and served (the route is mounted).
      deps: [{ name: node-schemas }, { name: system-nodes }, { name: node-registry }]
      schema_refs: [TypeSurface]
      exports: ["surface(system, { root }) → TypeSurface[]", "surfaceOf(type) → TypeSurface | null", "parseFields(args, surface) → { payload, unknown, missing }"]
      gate_pipeline: ["GATE-ND4-001: types = the system's data/nodes folders", "GATE-ND4-002: fields from schema.<type>; no schema → read only, said", "GATE-ND4-003: ops minus writes for generated/protected", "GATE-ND4-004: capability nodes written by system-nodes sync (idempotent)"]
      behavioral_contracts: ["deterministic: same schemas, same surface", "a new schema file gives commands and a capability at the next sync, no code"]
      error_paths: ["a field flag not in the schema → listed as unknown, refused before sending"]
      acceptance: ["surface('cortex') lists failure_mode with its schema's required fields", "adding a schema file adds its capability node on sync"]

    - id: MOD-ND-CLI
      name: node-commands
      uuid: nexus-system-node-db-cli-v1-0000-2026-1022-001
      path: idearium/cli/route-commands.js
      phase: ND5_every_agent_reaches_every_system
      description: >-
        Rows in the one table, driven by the surface (no per-type rows): `nodes` (every system's census), `nodes <sys> [<type>
        [<id>]]` (the existing system.nodes, kept), `nodes schema <type>` (its fields, ops, usage), `nodes history <sys> <type> <id>`,
        `nodes create <sys> <type> <id> --field=value …`, `nodes set|patch <sys> <type> <id> --field=value …`, `nodes archive <sys>
        <type> <id> --why "…"`. Arguments are checked against the type's surface before the request (parseFields). Through
        nexus.command, Copilot and every agent have each one; an agent's write carries why.
      deps: [{ name: route-commands }, { name: node-surface }]
      schema_refs: [NodeWrite, TypeSurface]
      exports: ["rows: nodes, nodes.schema, nodes.history, nodes.create, nodes.set, nodes.patch, nodes.archive"]
      gate_pipeline: ["GATE-ND5-001: parse args → parseFields against the surface", "GATE-ND5-002: request to /api/system/nodes… (forwarded to the owner)", "GATE-ND5-003: print the ref and the ledger row"]
      behavioral_contracts: ["the same rows are the agent's tools (nexus.command)", "help text lists the type's fields from its schema"]
      error_paths: ["missing required field → refused locally, naming it", "owner down → the 503 said as is"]
      acceptance: ["nodes create cortex failure_mode … writes the file through cortex and prints the ledger row", "Copilot, asked to note a failure mode, does it through nexus.command and the row says agent:copilot"]

    - id: MOD-ND-COPILOT
      name: node-copilot
      uuid: nexus-system-node-db-copilot-v1-0000-2026-1022-001
      path: copilot/server.js
      phase: ND5_every_agent_reaches_every_system
      description: >-
        Copilot's context names what it can reach: one compact line per system (types and counts, from the census) in the tool
        description of nexus.command, not the nodes themselves; it reads them on demand. Its writes go through the rows above with
        by agent:copilot and its why. Generated and protected types are refused to it by the owning route (ND-005).
      deps: [{ name: route-commands }, { name: node-surface }]
      schema_refs: [TypeSurface]
      exports: ["nodeReach() → string (one line per system, cached for 5 min)"]
      gate_pipeline: ["GATE-ND5C-001: census → one line per system", "GATE-ND5C-002: appended to nexus.command's description"]
      behavioral_contracts: ["fewest tokens: counts, not contents", "every write it makes is in the ledger with its why"]
      error_paths: ["census unreachable → the line says 'node reach unknown: <why>'"]
      acceptance: ["Copilot's tool description lists every system with nodes; its node write is a ledger row by agent:copilot"]

    - id: MOD-ND-UI
      name: node-ui
      uuid: nexus-system-node-db-ui-v1-0000-2026-1022-001
      path: idearium/ui/js/system-nodes.js
      phase: ND6_the_nodes_screen
      description: >-
        A Nodes screen: systems (census: types, counts, store, owner, what is missing) → a type (its nodes, a search, its schema
        fields) → a node (its payload, its file, its history as a timeline of ledger rows with by and why). New, edit (a form drawn
        from the type's surface) and archive, each through the write routes; generated types read only, said.
      deps: [{ name: node-surface }]
      schema_refs: [TypeSurface, LedgerRow]
      exports: ["renderSystemNodes(el)", "snOpen(system, type, id)"]
      gate_pipeline: ["GATE-ND6-001: GET /api/system/nodes (census)", "GATE-ND6-002: GET type list / node / history", "GATE-ND6-003: form from the surface → write route"]
      behavioral_contracts: ["the form's fields are the schema's; nothing hand-listed", "a refused write shows its missing and wrong fields"]
      error_paths: ["owner down → its rows read via disk and say so; its writes disabled with why"]
      acceptance: ["tested in Clear Glass: a node opens with its history; an edit adds a ledger row; a generated type shows no edit"]

  events:
    nodes:
      - "<system>.node.added { system, type, id, by }"
      - "<system>.node.changed { system, type, id, by, fingerprint }"
      - "<system>.node.archived { system, type, id, by, why }"
      - "<system>.node.refused { system, type, id, by, why }"

  enforcement:
    gates:
      - { id: GATE-ND-FILE-FIRST, name: file-first, severity: fatal, check: "lib/node-routes.js writes only through node-export, then processFile", on_failure: "suite red" }
      - { id: GATE-ND-SCHEMA, name: schema-checked, severity: fatal, check: "every write passes checkPayload or is refused with missing/wrongType", on_failure: "400" }
      - { id: GATE-ND-LEDGER, name: ledgered, severity: fatal, check: "every write and every refusal is a ledger row with by", on_failure: "suite red" }
      - { id: GATE-ND-OWNER, name: owner-writes, severity: fatal, check: "idearium forwards writes; no module but the owner's route writes its node files", on_failure: "suite red" }
      - { id: GATE-ND-PROTECTED, name: protected-types, severity: fatal, check: "agents' writes to generated or protected types → 403", on_failure: "403" }
      - { id: GATE-ND-FROM-SCHEMA, name: from-schema, severity: high, check: "no route-commands row names a node type", on_failure: "suite red" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles in emerge's kg-builder at specDepth 1.0, no BLACK node, invariants valid"
    - "per module: its acceptance lines, each a named test in the phase that builds it (UI in Clear Glass)"
