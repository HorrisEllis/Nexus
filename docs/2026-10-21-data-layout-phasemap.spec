# Data layout: every file in its system, no root data/, one repo folder, memory in cortex, a safe clear-up tool (2026-10-21)

origin: >-
  James, 2026-10-21: "need all data in the data folder migrated to each relative system" · "we need to do some serious data structure
  work. migrate relevant data to relavant systems. make one repo folder in idearium, no data folder in the root." ·
  "idearium/data/repos/<Repo Name from project file or set in the name when importing>/ .cos .node examples: /data/<memory system>
  /data/event_ledgers/<date_time.ledger /data/nodes/<node type>/" · "remove snapshots folder from cortex" · "make a file clearup
  tool, for safely moving and mapping tools." · "cortex v2 into server.js" · "each memory system is in cortex."

Build contract: docs/data-layout.spec (emerge module format, specDepth 1.0). Each phase names `spec:` and the module it builds.

## Ground truth (2026-10-21)

- Root data/ in the repo: 122 files, all tracked in git (against "never commit data/**"); 18 top folders. His live data (data.zip): 755
  files — ledger 23 MB / 499 files, raid 168, ollama 60, intake 16, chat-logs, erosmancer, run-state, vector-index, warp.
- About 100 code files join a root data/ path by hand; the census lists, per prefix, the files that still name it (87 of the repo's
  122 files wait on them).
- lib/system-store.js (a system's own store at <system>/data/jaa) exists, used by one module; SS1–SS4 (pipeline-root-causes map) are
  its adoption — DL3 rewires paths, SS1–SS2 move tables; they meet, neither replaces the other.
- cortex/snapshot/index.js is a deprecation shim (the real module is versionium/lib/snapshot.js since 2026-09-19), required by 9 files.
- Cortex's server is cortex/boot.js; cortex-v2.js is its command-line client. No cortex/server.js.
- Memory outside cortex: lib/vector-memory.js, lib/local-vector-index.js, lib/agent-memory.js, lib/repo-hat-memory.js,
  meta/crystal-lattice.js, intelligence/liminal-space, data/knowledge, data/lattice, data/vector-index, chat logs.
- Idearium repos live at <IDEARIUM_DATA_DIR>/projects/<uuid> (materializeDir).

## Readings (to confirm)

- "cortex v2 into server.js" — cortex gets one entry, cortex/server.js (boot.js's server), serving cortex-v2's commands as routes.
- "each memory system is in cortex" — code under cortex/memory/, state under cortex/data/memory/<name>/; the person model stays
  copilot's unless he says otherwise.
- data/ledger/reflection → cortex (lib/reflection.js is cortex's reflection engine).

phases:

  DL0_data_census:
    layer: foundation
    status: DONE 0.60.177
    depends_on: []
    files: [lib/data-clearup.js, docs/atlases/data-census.md]
    spec: docs/data-layout.spec
    blocks: [MOD-DATA-CENSUS]
    does: >-
      Every file of the root data/ placed by the spec's ownership table, with the code that still names its path.
    proof: test-data-clearup DC-01, DC-05; docs/atlases/data-census.md

  DL1_clearup_tool:
    layer: library
    status: DONE 0.60.177
    depends_on: [DL0_data_census]
    files: [lib/data-clearup.js, tests/modules/test-data-clearup.test.js]
    spec: docs/data-layout.spec
    blocks: [MOD-CLEARUP]
    does: >-
      plan / apply (manifest first, hash before remove, duplicates archived, conflicts untouched) / rollback / verify; dry by default.
    proof: test-data-clearup 5/5; his real data (755 files) applied and rolled back byte for byte in a scratch tree

  DL2_one_resolver:
    layer: library
    status: "DONE 0.60.207 — test-data-home DH-01..06 (DH-06 in Clear Glass)"
    depends_on: [DL1_clearup_tool]
    files: [lib/data-home.js, lib/test-sandbox.js]
    spec: docs/data-layout.spec
    blocks: [MOD-DATA-HOME]
    does: >-
      lib/data-home.js: home / ledger / nodes / memory paths under each system, sandbox-aware. Route + command (`data census`,
      `data plan`, `data apply`, `data rollback`) and a Toolbox section for the clear-up tool.
    proof: every kind resolves under its system; a sandboxed process resolves under the sandbox
    built: >-
      0.60.207, James 2026-10-22: "start the data migration. look at the phases, any migrating data to the respective systems, and make each system responsible for it's own data." lib/data-home.js resolves home/ledger/nodes/memory
      under each system (the sandbox in a test). Each system's entry calls atBoot(system) first: bringHome moves the root data/ files
      the ownership table gives it through the clear-up tool (manifest first, sha256, rollback); a file whose old path code still names
      waits and is listed; his calls are never moved; the record is <system>/data/.home.json; a boot with the same release and the same
      waiting paths reads nothing. Route GET/POST /api/data/home[/:system], POST /api/data/rollback; `data home`, `data rollback`; the
      Data view in the settings console. The Toolbox the spec named does not exist; the settings console is where it went (said).

  DL3_rewire_writers:
    layer: integration
    status: "IN PROGRESS — guardian rewired 0.60.208 (lib/data-home.js REWIRED); next versionium, ollama, architect, loom, clear-glass …; the shared data/ledger/ (15 refs) is its own step"
    depends_on: [DL2_one_resolver, SS1_system_store_adoption]
    files: [lib/data-home.js, diagnostic/nexus-diagnostic.js, guardian/, lib/ledger-writer.js, lib/ledger-store.js, lib/vector-memory.js]
    spec: docs/data-layout.spec
    blocks: [MOD-REWIRE]
    does: >-
      One owner at a time: its writers use data-home, its census refs reach 0, its suites stay green, then its moves are applied.
      The root data/ is empty after the last owner.
    proof: census refs 0; data/ gone; suites green

  DL4_one_repo_folder:
    layer: integration
    status: OPEN
    depends_on: [DL2_one_resolver]
    files: [idearium/repo/repo-home.js, idearium/repo/index.js]
    spec: docs/data-layout.spec
    blocks: [MOD-REPO-HOME]
    does: >-
      idearium/data/repos/<Repo Name>/ with .cos .node src/ data/<memory>/ data/event_ledgers/<date_time>.ledger data/nodes/<type>/;
      existing repos moved from projects/<uuid> with materializeDir updated in the same step.
    proof: a repo imported as "Looking Glass" lives at idearium/data/repos/Looking Glass/

  DL5_memory_in_cortex:
    layer: integration
    status: OPEN
    depends_on: [DL3_rewire_writers]
    files: [cortex/memory/index.js, lib/vector-memory.js, lib/local-vector-index.js, lib/agent-memory.js, lib/repo-hat-memory.js]
    spec: docs/data-layout.spec
    blocks: [MOD-MEMORY-IN-CORTEX]
    does: >-
      Each memory system's code under cortex/memory/ (old paths left as forwarders), its state under cortex/data/memory/<name>/.
    proof: cortex/memory/index.js lists every memory system; nothing outside cortex writes memory state

  DL6_cortex_server:
    layer: integration
    status: OPEN
    depends_on: [DL1_clearup_tool]
    files: [cortex/server.js, cortex/boot.js, cortex/cortex-v2.js, orchestrator/orchestrator.js]
    spec: docs/data-layout.spec
    blocks: [MOD-CORTEX-SERVER]
    does: >-
      cortex/server.js is cortex's one entry; cortex-v2's commands served as routes; boot.js and cortex-v2.js forward until unused.
    proof: every cortex route answers the same before and after

  DL7_cortex_snapshot_out:
    layer: integration
    status: OPEN
    depends_on: [DL6_cortex_server]
    files: [cortex/snapshot/index.js, guardian/server.js, orchestrator/orchestrator.js, orchestrator/lib/autonomous-loop.js,
      orchestrator/lib/request-handler.js, hooks/cortex.hooks.js, cli/nexus-repl-descriptors.js, ui/home/areas/rewind.js]
    spec: docs/data-layout.spec
    blocks: [MOD-SNAPSHOT-SHIM]
    does: >-
      The 9 callers of the cortex/snapshot shim reach versionium through its route; the shim archived.
    proof: no cortex/snapshot require; the boundary ratchet adds nothing

# ── ADDENDUM 2026-10-22 (0.60.207) — DL2 built; the migration's order from here ──
# James, 2026-10-22: "start the data migration. look at the phases, any migrating data to the respective systems, and make each system responsible for it's own data."
# - DL2 done (see the phase). On a pull, each system brings home what nothing names any more, at its own boot; today that is little:
#   the census still finds code naming every owner's root path, diagnostic/nexus-diagnostic.js among them (it names every system's).
# - Order from here, decided by his axioms (§5.9 the owner holds its data, §3.3 one system end to end before breadth): SS1 (Guardian:
#   its tables out of cortex's store into its own, docs/2026-10-19-pipeline-root-causes-phasemap.spec) then DL3 per owner, each owner's
#   tables (SS2) and files (DL3) in one step, ordered by fewest refs: versionium, ollama, architect, loom, clear-glass, …
