# Each system's node database, served by the system, reachable by every agent, grown from the schemas (2026-10-22)

origin: >-
  James, 2026-10-22: "Need each database for each system, for all the dyamic node index, then the server.js uses that for managing
  data, history, and also copilot can access all of them expand the cli and capability from the schemas also."
  Carried, his: 2026-09-12 "in each data folder we use a jaa database for each node type." · P33a (0.60.130) "each system has a
  database for each index of nodes with all the history." · P35 Copilot reads, edits and creates nodes. The idea and the direction
  are his; the census, the phase cut and the readings (marked) are the coder's.

status: MAPPED 2026-10-22 — nothing built by this map yet. Spec: docs/system-node-db.spec (compiles at full depth).

builds-open-phases-of: >-
  docs/2026-09-11-sovereign-node-architecture-phasemap.spec P35_copilot_reads_edits_creates_nodes (ND5) and the serving half of
  P33_every_system_runs_its_node_registry (ND1, ND3). Those phases stay in their map, with an addendum pointing here (§0.3).

## Ground truth (read in the tree, 2026-10-22)
- 14 systems hold data/nodes. 12 start their own listener through lib/node-registry.js startForSystem (line 196), each into its own
  store at <sys>/data/node-index. Emerge is indexed only by the boot sync (lib/system-nodes.js); sentinel by nothing.
- No system serves its own nodes. Idearium's GET /api/system/nodes/:system opens any system's store from disk, read only (stats,
  list, one node with its history, edges).
- Nothing creates, changes or archives a node through a route. Copilot reads through nexus.command → `system nodes`.
- lib/node-schemas/ holds 68 type schemas. Nothing generates commands or capabilities from them.
- lib/node-index-watcher.js has no runtime caller (said; not touched by this map).
- Three copies of the JaaStore adapter (lib/node-registry.js, intelligence/lib/domain-nodes.js, copilot/lib/inject-config.js) —
  docs/2026-10-17-infrastructure-migration-phasemap.spec owns that; not this map.

## Readings (the coder's; to confirm where marked)
- "each database for each system" — every system with nodes has its own store, sentinel and emerge included (they have no process
  of their own, so the orchestrator's boot sync indexes them into their own folder).
- "the server.js uses that for managing data, history" — each system's own server answers for its nodes: list, read, history, and
  writes (create, change, archive). Idearium forwards instead of reading other systems' stores.
- "copilot can access all of them" — reads already work; writes are added through the one command table, with who and why in each
  node's history.
- "expand the cli and capability from the schemas" — one set of `nodes …` commands whose arguments and help come from each type's
  schema, and one capability node per system and type, generated, so a new schema needs no new code. To confirm: whether he also
  wants one named command per type (e.g. `failure-mode add`). The coder's recommendation is no: one table and fewer tokens, his
  2026-10-07 leverage rule.

decisions:
  ND_D1_the_file_is_the_node:
    chosen: "a write is a file through lib/node-export.js; the database follows (ND-001)"
    by_the_axioms: "§10.3 one truth layer; his 2026-09-12 'each node is the entire unit per node'; REVERSIBILITY (a file can be archived)"
  ND_D2_the_owner_writes:
    chosen: "only the owning system's route writes its nodes; Idearium forwards, and refuses a write when the owner is down (ND-004)"
    by_the_axioms: "§5.2/§9.1 no side door; P33 each system sovereign over its data"
  ND_D3_generated_types_are_not_agents_to_write:
    chosen: "capability/command/system/hat/agent and schema-protected types refused to agents; a person's write is allowed and ledgered (ND-005)"
    by_the_axioms: "USER_AUTONOMY (what an agent is and may do is his); §1.1 generated from the tree, so a hand edit is overwritten anyway"
  ND_D4_schema_driven_commands:
    chosen: "generic `nodes` rows driven by the schema surface, not one row per type (ND-006)"
    by_the_axioms: "his leverage rule 2026-10-07 (one door, one table); §8.6 reuse"

phases:

  ND1_every_system_has_its_database:
    layer: foundation
    status: OPEN
    depends_on: [P33b_each_system_runs_its_listener]
    files: [lib/node-registry.js, lib/system-nodes.js, orchestrator/orchestrator.js]
    spec: docs/system-node-db.spec
    blocks: [MOD-ND-CENSUS]
    does: >-
      census() says, for every system with nodes, its types with file, indexed and history counts, whether its store exists, who owns
      it and what is missing. Sentinel and emerge get their own stores from the orchestrator's boot sync.
    proof: census lists all 14 systems; after one boot sync sentinel and emerge have stores; files ≠ indexed is reported

  ND2_one_node_route_for_every_system:
    layer: backend
    status: OPEN
    depends_on: [ND1_every_system_has_its_database, ND_D1_the_file_is_the_node, ND_D3_generated_types_are_not_agents_to_write]
    files: [lib/node-routes.js, lib/node-registry.js]
    spec: docs/system-node-db.spec
    blocks: [MOD-ND-ROUTES]
    does: >-
      lib/node-routes.js: one handler for /api/nodes — list, read, history, create, set, patch, archive — writing the file first,
      checked against the schema, indexed at once, ledgered with who and why; a stale write is refused, a protected type is refused
      to agents.
    proof: create → file, row, ledger by; stale patch → 409; agent on a capability → 403; archive → moved and in the history

  ND3_each_server_serves_its_nodes:
    layer: integration
    status: OPEN
    depends_on: [ND2_one_node_route_for_every_system, ND_D2_the_owner_writes]
    files: [lib/node-registry.js, guardian/server.js, copilot/server.js, ollama/server.js, loom/server.js, versionium/server.js, intelligence/server.js, architect/service.js, cortex/boot.js, orchestrator/orchestrator.js, diagnostic/nexus-diagnostic.js, clear-glass/src/main/index.js, idearium/api/index.js]
    spec: docs/system-node-db.spec
    blocks: [MOD-ND-MOUNT, MOD-ND-PROXY]
    does: >-
      Every server mounts the route beside its listener, on the same store. Idearium's system.nodes forwards to the owner (via
      system), falls back to disk for reads when the owner is down (via disk, with why), refuses writes then; the census route is
      added.
    proof: each running system answers GET /api/nodes; a read with the owner down says via disk; a write then is 503 OWNER_DOWN

  ND4_commands_and_capabilities_from_the_schemas:
    layer: backend
    status: OPEN
    depends_on: [ND3_each_server_serves_its_nodes, ND_D4_schema_driven_commands]
    files: [lib/node-surface.js, lib/system-nodes.js, lib/node-schemas.js]
    spec: docs/system-node-db.spec
    blocks: [MOD-ND-SURFACE]
    does: >-
      lib/node-surface.js turns each schema into the type's surface: fields, ops, usage lines, and a capability node per system and
      type written by the boot sync. A new schema file gives commands and a capability at the next sync, with no code.
    proof: surface('cortex') lists failure_mode with its required fields; a new schema file adds its capability node on sync

  ND5_every_agent_reaches_every_system:
    layer: integration
    status: OPEN
    depends_on: [ND4_commands_and_capabilities_from_the_schemas, P35_copilot_reads_edits_creates_nodes]
    files: [idearium/cli/route-commands.js, copilot/server.js, lib/agent-tools/tools/nexus/command.js]
    spec: docs/system-node-db.spec
    blocks: [MOD-ND-CLI, MOD-ND-COPILOT]
    does: >-
      `nodes`, `nodes schema`, `nodes history`, `nodes create|set|patch|archive` in the one table, arguments checked against the
      surface; through nexus.command Copilot and every agent have them. Copilot's tool description names each system's node types
      and counts in one line each.
    proof: nodes create cortex failure_mode … writes through cortex and prints the ledger row; Copilot's write is a row by agent:copilot

  ND6_the_nodes_screen:
    layer: ui
    status: OPEN
    depends_on: [ND5_every_agent_reaches_every_system]
    files: [idearium/ui/js/system-nodes.js, idearium/ui/index.html]
    spec: docs/system-node-db.spec
    blocks: [MOD-ND-UI]
    does: >-
      A Nodes screen in Idearium: systems → a type → a node with its file and its history; new, edit (a form from the schema) and
      archive through the write routes; generated types read only, said.
    proof: in Clear Glass, a node opens with its history; an edit adds a ledger row; a generated type shows no edit
