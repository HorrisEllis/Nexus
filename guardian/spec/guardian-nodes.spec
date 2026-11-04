spec:

  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # guardian/spec/guardian-nodes.spec — every Guardian record is a node file in guardian/data/nodes, its JAA table the index, reached through
  # guardian/server.js; the shape every system's nodes follow. Format: emerge's module spec (kg-builder, specDepth 1.0, no BLACK).
  # Phases: docs/2026-10-31-spec-everything-phasemap.spec.
  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        guardian-nodes
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-31T00:00:00Z
    status:      specced
    uuid:        nexus-guardian-nodes-spec-v1-0000-2026-1031-jamesbrooks-001
    origin: >-
      James, 2026-10-31: "all of the systems nodes connect through the server.js and uses the database, like guardian? check guardian, for me,
      make sure all the nodes, are actual files, in the data folder, the database per server.js". Genesis 1.5.0 already holds his rule as
      axioms ALL_DATA_ARE_NODES ("the registry, its contract and its config persist as nodes/<type>/<id>.<type> in one envelope — Guardian's
      layout") and NODE_INDEX_IS_JAA, and docs/2026-10-17-system-drawbridge-phasemap.spec addendum c: "each system, reads, writes, and manages
      its nodes. each system has a database for each index of nodes with all the history." The check and the cut are the coder's.
    purpose: >-
      Guardian as the reference for every system: each record it keeps is a node file in guardian/data/nodes/<type>/<id>.<type> (lib/node-
      export.js's envelope), with a ledger per type; its JAA tables are the index over those files (rebuildable from them), never the only
      copy; only guardian/server.js reads and writes them, and other systems reach them through its routes.
    target_runtime: [node]
    language_stack: [javascript]
    paradigm: [files-are-truth, index-is-rebuildable, one-writer-per-store, reuse-before-build]
    axioms: ["genesis ALL_DATA_ARE_NODES", "genesis NODE_INDEX_IS_JAA", "genesis ONE_WRITER_PER_STORE", "§5.15 sovereignty", "§0.3 nothing lost", "§1.2 nothing fails silently", "§17.12 Versionium records changes"]
    deps: []

    census: >-
      Checked 2026-10-31 in the code on main 0.60.320 (his data/ is not in git; the files on his machine are checked by MOD-GN-AUDIT, run
      there). guardian/lib/node-registry.js indexes ten node types (tool, agent, hat, command, capability, system, event, intent, response,
      provider) from guardian/data/nodes with a _ledger.jsonl per type. The committed seed holds capability 36, command 63, component 32,
      provider 5, response 12, system 1. Two types are written as files but not indexed: component (lib/system-nodes.js) and agent_model
      (guardian/lib/agent-model-nodes.js). Twelve JAA tables hold rows that are not node files at all: artifacts, ledger, ledger_entries, jobs,
      gaps, queue_compartments, sessions, chat_log, timeline_events, seam_sessions, pa_sessions, downloads. Two writers reach outside
      guardian/: guardian/server.js writes data/cortex/memory (Cortex's), and guardian/lib/code-artifact.js writes under the root data/.

    constraints:
      - id: GN-001
        description: "A record exists first as its node file; the JAA row is written from it and can be rebuilt from the files alone."
        type: hard
        enforced_by: [GATE-GN-FILES]
      - id: GN-002
        description: "Only guardian/server.js (and the libs it loads) writes guardian/data; other systems use its routes."
        type: hard
        enforced_by: [GATE-GN-ONE-WRITER]
      - id: GN-003
        description: "Moving a table's rows into node files loses none: counts before and after match, and the table is kept until the index is rebuilt from the files and compared."
        type: hard
        enforced_by: [GATE-GN-LOSSLESS]

  schemas:

    - id: NodeFile
      name: NodeFile
      description: "One node on disk (lib/node-export.js's envelope)."
      fields:
        path:      "guardian/data/nodes/<type>/<id>.<type>"
        envelope:  "{ envelope: 1, uuid, type, id, context, summary, system, tags, payload, … }"
        ledger:    "guardian/data/nodes/<type>/_ledger.jsonl — one line per create, change, remove"
      behavioral_contracts: ["a change is a new file version and a ledger line, recorded in Versionium"]
      error_paths: ["a file that does not parse → quarantined, named, never dropped"]

    - id: NodeAudit
      name: NodeAudit
      description: "What the audit finds on a machine."
      fields:
        types:     "{ [type]: { files: number, indexed: number, onlyInIndex: string[], onlyOnDisk: string[] } }"
        tables:    "{ [table]: { rows: number, asFiles: number } }"
        outside:   "[{ writer, path }] — writes outside guardian/"
      behavioral_contracts: ["read only"]
      error_paths: ["the index database locked → read from a copy, said"]

  interfaces:

    - id: IF-NODE-REGISTRY
      name: node-registry
      path: guardian/lib/node-registry.js
      description: "Guardian's node index over its files, with the per-type ledger."
      exports: ["start, stop, list, get, GUARDIAN_NODE_TYPES, DEFAULT_NODES_DIR"]
      behavioral_contracts: ["watches the folders; a file change updates the index"]
      error_paths: ["a ledger write fails → said, the change kept"]

    - id: IF-NODE-EXPORT
      name: node-export
      path: lib/node-export.js
      description: "The one envelope every node file is written in."
      exports: ["exportToFile", "the envelope"]
      behavioral_contracts: ["one writer of the envelope"]
      error_paths: ["an unknown type → refused, named"]

    - id: IF-JAA-STORE
      name: jaa-store
      path: lib/jaa-store.js
      description: "The JAA store Guardian's tables live in."
      exports: ["insert(table, row)", "upsert(table, row, key)", "query"]
      behavioral_contracts: ["the index, per genesis NODE_INDEX_IS_JAA"]
      error_paths: ["a write fails → said"]

    - id: IF-GUARDIAN-SERVER
      name: guardian-server
      path: guardian/server.js
      description: "Guardian's door: its routes, its CLI, its stores."
      exports: ["the routes over Guardian's nodes and tables"]
      behavioral_contracts: ["the only writer of guardian/data"]
      error_paths: ["a route for a table that moved to files answers from the files, the same shape"]

  modules:

    - id: MOD-GN-AUDIT
      name: node-audit
      uuid: nexus-guardian-nodes-audit-v1-0000-2026-1031-001
      path: guardian/lib/node-audit.js
      phase: GND1_the_audit_on_his_machine
      description: "His check, made a command: per type, files on disk against rows in the index (only-in-index, only-on-disk); per table, rows and how many are files; every write outside guardian/. Route GET /api/guardian/nodes/audit, row `guardian nodes audit`."
      deps: [{ name: node-registry }, { name: jaa-store }, { name: guardian-server }]
      schema_refs: [NodeAudit, NodeFile]
      exports: ["audit(root) → NodeAudit", "the route and the command row"]
      gate_pipeline: ["GATE-GND1-001: read only", "GATE-GND1-002: every type and table listed, none skipped"]
      behavioral_contracts: ["the numbers are his machine's, never the seed's"]
      error_paths: ["a folder missing → reported as missing, not as zero"]
      acceptance: ["on a copy of the committed seed: the six folders counted; component and agent_model reported as not indexed; the twelve tables reported with 0 as files"]

    - id: MOD-GN-INDEX
      name: every-type-indexed
      uuid: nexus-guardian-nodes-index-v1-0000-2026-1031-001
      path: guardian/lib/node-registry.js
      phase: GND2_every_type_indexed
      description: "component and agent_model join GUARDIAN_NODE_TYPES with their schemas (lib/node-schemas), so every node Guardian writes is in its index."
      deps: [{ name: node-registry }, { name: node-audit }]
      schema_refs: [NodeFile]
      exports: ["GUARDIAN_NODE_TYPES with component and agent_model"]
      gate_pipeline: ["GATE-GND2-001: the audit shows no type only on disk"]
      behavioral_contracts: ["the index can be rebuilt from the folders"]
      error_paths: ["a type with no schema → its schema written first (NC0 schema rule)"]
      acceptance: ["the audit's onlyOnDisk is empty for every type"]

    - id: MOD-GN-TABLES
      name: tables-become-nodes
      uuid: nexus-guardian-nodes-tables-v1-0000-2026-1031-001
      path: guardian/lib/node-tables.js
      phase: GND3_tables_become_node_files
      description: >-
        The twelve JAA-only tables, one at a time, become node types (job, artifact, gap, session, chat, ledger_entry, timeline_event, download,
        queue_compartment, seam_session, pa_session): each write goes to the node file first, then the row; existing rows are exported to files
        (counts matched), the index rebuilt from the files and compared, and only then the table is read from the files. Ordered by what
        others read most (jobs, artifacts, gaps first).
      deps: [{ name: every-type-indexed }, { name: node-export }, { name: jaa-store }]
      schema_refs: [NodeFile, NodeAudit]
      exports: ["exportTable(table) → { rows, files }", "writeThrough(type, row)", "rebuildIndex(type)"]
      gate_pipeline: ["GATE-GND3-001: rows = files", "GATE-GND3-002: the rebuilt index equals the table"]
      behavioral_contracts: ["no row is lost; the table is kept until the comparison passes (§0.3)"]
      error_paths: ["a row that cannot be written as a node → kept in the table, listed"]
      acceptance: ["on a fixture database of each table: exported, rebuilt, compared equal; the audit shows each table fully as files"]

    - id: MOD-GN-HOME
      name: writes-stay-home
      uuid: nexus-guardian-nodes-home-v1-0000-2026-1031-001
      path: guardian/lib/code-artifact.js
      phase: GND4_writes_stay_home
      description: "Guardian's two writes outside its folder brought home: Cortex memory written through Cortex's route (POST /api/memory on :3748), never data/cortex/memory; code artifacts under guardian/data/artifacts."
      deps: [{ name: node-audit }]
      schema_refs: [NodeAudit]
      exports: ["code-artifact.js writes guardian/data/artifacts", "server.js calls Cortex's route"]
      gate_pipeline: ["GATE-GND4-001: the audit's outside list is empty", "GATE-GND4-002: the boundary ratchet shows no new crossing"]
      behavioral_contracts: ["Cortex down → the memory write waits in the durable outbox (lib/nexus-client.js postDurable)"]
      error_paths: ["an old artifact in the root data/ → moved home with its history (lib/data-home.js)"]
      acceptance: ["grep finds no guardian writer of data/cortex or the root data/; the audit's outside list is empty"]

  events:
    guardian_nodes:
      - "guardian.nodes.audited { types, tables, outside }"
      - "guardian.table.exported { table, rows, files }"

  enforcement:
    gates:
      - { id: GATE-GN-FILES, name: files-first, severity: fatal, check: "a record's node file exists before its row", on_failure: "write refused" }
      - { id: GATE-GN-ONE-WRITER, name: one-writer, severity: error, check: "no writer of guardian/data outside guardian/", on_failure: "the ratchet reports it" }
      - { id: GATE-GN-LOSSLESS, name: lossless, severity: fatal, check: "rows = files before a table is switched", on_failure: "the switch waits" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node"
    - "per module: its acceptance lines"
