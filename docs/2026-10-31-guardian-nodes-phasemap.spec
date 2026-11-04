# docs/2026-10-31-guardian-nodes-phasemap.spec — every Guardian record a node file, its table the index, through guardian/server.js
# His check; the census and the cut are the coder's. Spec: guardian/spec/guardian-nodes.spec.

origin: >-
  James, 2026-10-31: "all of the systems nodes connect through the server.js and uses the database, like guardian? check guardian, for me, make
  sure all the nodes, are actual files, in the data folder, the database per server.js"

status: "MAPPED 2026-10-31. Checked in the code (his data/ is not in git): 6 node folders committed, 10 types indexed, 2 written but not indexed, 12 JAA tables with no node files, 2 writes outside guardian/. Nothing built."

decisions:
  GND_D0_files_are_the_truth:
    chosen: "a record is its node file first; the JAA table is the index, rebuildable from the files; only guardian/server.js writes guardian/data"
    by: "his rules already in genesis 1.5.0 (ALL_DATA_ARE_NODES, NODE_INDEX_IS_JAA, ONE_WRITER_PER_STORE) and the drawbridge map's addendum c, applied by §0.1 and §5.15"

phases:
  GND1_the_audit_on_his_machine:
    status: OPEN
    depends_on: [GND_D0_files_are_the_truth]
    files: [guardian/lib/node-audit.js, guardian/server.js, guardian/cli.js, idearium/cli/route-commands.js, tests/modules/test-guardian-node-audit.test.js]
    spec: guardian/spec/guardian-nodes.spec
    blocks: [MOD-GN-AUDIT]
    does: "his check as a command: files against the index per type, tables as files, writes outside"
    proof: "on a copy of the seed: the six folders, the two unindexed types, the twelve tables"
  GND2_every_type_indexed:
    status: OPEN
    depends_on: [GND1_the_audit_on_his_machine]
    files: [guardian/lib/node-registry.js, lib/node-schemas]
    spec: guardian/spec/guardian-nodes.spec
    blocks: [MOD-GN-INDEX]
    does: "component and agent_model indexed"
    proof: "no type only on disk"
  GND3_tables_become_node_files:
    status: OPEN
    depends_on: [GND2_every_type_indexed]
    files: [guardian/lib/node-tables.js, guardian/server.js, tests/modules/test-guardian-node-tables.test.js]
    spec: guardian/spec/guardian-nodes.spec
    blocks: [MOD-GN-TABLES]
    does: "the twelve tables, one at a time, become node types; counts matched, index rebuilt and compared before switching"
    proof: "each table fully as files on a fixture database"
  GND4_writes_stay_home:
    status: OPEN
    depends_on: [GND1_the_audit_on_his_machine]
    files: [guardian/lib/code-artifact.js, guardian/server.js]
    spec: guardian/spec/guardian-nodes.spec
    blocks: [MOD-GN-HOME]
    does: "Cortex memory through Cortex's route; artifacts under guardian/data"
    proof: "the audit's outside list empty; no new boundary crossing"

order: "GND1 first (his numbers, from his machine), then GND2 and GND4, then GND3 table by table. The same audit then runs for every system (the queue)."
