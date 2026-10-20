spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # data-layout.spec — every byte of state in the system that owns it; no data folder at the root; one repo folder in Idearium;
  # every memory system in cortex; a clear-up tool that moves and maps safely.
  # Format: emerge's module spec; compiled by emerge/compiler/kg-builder.js at specDepth 1.0, no BLACK, invariants valid
  # (tests/modules/test-substrate-spec.test.js). Phases: docs/2026-10-21-data-layout-phasemap.spec.
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        data-layout
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-21T00:00:00Z
    status:      specced
    uuid:        nexus-data-layout-spec-v1-0000-2026-1021-jamesbrooks-001
    origin: >-
      James, 2026-10-21: "need all data in the data folder migrated to each relative system" · "we need to do some serious data
      structure work. migrate relevant data to relavant systems. make one repo folder in idearium, no data folder in the root." ·
      "idearium/data/repos/<Repo Name from project file or set in the name when importing>/ .cos .node examples: /data/<memory
      system> /data/event_ledgers/<date_time.ledger /data/nodes/<node type>/" · "remove snapshots folder from cortex" · "make a file
      clearup tool, for safely moving and mapping tools." · "cortex v2 into server.js" · "each memory system is in cortex."
      Earlier, his and kept: 2026-10-10 "cortex data is clumped together instead of being decoupled. like all data is the relative
      systems job to create, read, manage" · 2026-10-17 "need to get the systems soveriegn again".
      The layout and the calls are his. The coder's part: the census, the ownership readings (marked), the tool.
    purpose: >-
      State lives with the system that writes it, under <system>/data/. The root data/ ends. Idearium's repos live in one folder by
      name. Memory systems live in cortex. Every move is planned, verified by hash, recorded in a manifest, reversible, and the code
      that names an old path is listed so it is rewired before the move is applied.
    target_runtime: [node]
    language_stack: [javascript]
    paradigm: [deterministic, reversible, evidence-first]
    axioms: ["§5.9 every system is sovereign", "§0.3 nothing lost — archive, never delete", "REVERSIBILITY", "§1.2 nothing fails silently",
      "§0.1 evidence over memory", "docs/CLAUDE.md never commit data/**"]
    deps:
      - { name: node-crypto, version: "builtin", required: true, purpose: "sha256 of every moved file" }

    constraints:
      - id: DL-001
        description: "No file is removed from its source until its copy at the destination has the same sha256."
        type: hard
        enforced_by: [GATE-DL-HASH]
      - id: DL-002
        description: "Every applied plan writes a manifest first; rollback(manifest) restores every file, verified by hash."
        type: hard
        enforced_by: [GATE-DL-MANIFEST]
      - id: DL-003
        description: "A destination that already holds a different file is a conflict: skipped and reported, never overwritten."
        type: hard
        enforced_by: [GATE-DL-CONFLICT]
      - id: DL-004
        description: "A path whose owner the evidence does not settle is 'ask': planned, never moved until he answers."
        type: hard
        enforced_by: [GATE-DL-ASK]
      - id: DL-005
        description: "A move is applied only after the code that names its old path is rewired (refs empty), unless forced and said."
        type: hard
        enforced_by: [GATE-DL-REFS]
      - id: DL-006
        description: "'Remove' means archive under _archive/clearup/<stamp>/ with its manifest; a true duplicate (same sha at the destination) is archived and reported."
        type: hard
        enforced_by: [GATE-DL-ARCHIVE]

  schemas:

    - id: OwnerRule
      name: OwnerRule
      description: "One row of the ownership table: a root data path and where it belongs."
      fields:
        match:     "string — a path under data/ (prefix, '*' segment wildcard)"
        to:        "string — destination template (<system>/data/<kind>/<rest>)"
        owner:     "string — the owning system"
        kind:      "string — event_ledgers | memory/<name> | nodes/<type> | store | raw"
        status:    "string — move | ask | archive"
        why:       "string — the evidence (who writes and reads it) or the reading, marked 'to confirm'"
        reading:   "boolean — true when the coder read his words to decide it"
        refs:      "string[] — code files that name the old path (filled by the census)"
      behavioral_contracts: ["the first matching rule wins; a path matching none is 'ask'"]
      error_paths: ["a rule whose destination is under the root data/ → refused (the root data folder ends)"]

    - id: Move
      name: Move
      description: "One planned or applied move of one file."
      fields:
        from:      "string — repo-relative source"
        to:        "string — repo-relative destination"
        sha256:    "string — of the source, before"
        bytes:     "number"
        rule:      "string — OwnerRule.match that decided it"
        status:    "string — planned | moved | duplicate | conflict | ask | skipped-refs | failed"
        tracked:   "boolean — the source is tracked in git"
        why:       "string|null"
      behavioral_contracts: ["moved only when the destination copy hashes equal"]
      error_paths: ["copy fails or hash differs → failed; the source is untouched"]

    - id: Manifest
      name: Manifest
      description: "The record of one applied plan; the only input rollback needs."
      fields:
        id:        "string — clearup-<stamp>"
        root:      "string — the tree it ran on"
        at:        "number"
        moves:     "Move[]"
        archived:  "Move[] — duplicates and removals, under _archive/clearup/<stamp>/"
        conflicts: "Move[]"
        asked:     "Move[]"
        by:        "string — who applied it (person or agent)"
      behavioral_contracts: ["written under _archive/clearup/<stamp>/manifest.json BEFORE the first move, updated after each"]
      error_paths: ["manifest cannot be written → nothing is moved"]

    - id: RepoHome
      name: RepoHome
      description: "One Idearium repo's folder: idearium/data/repos/<Repo Name>/."
      fields:
        name:      "string — from the project file (package.json name, .spec meta.name) or the name set at import; filesystem-safe, unique"
        uuid:      "string — the repo's uuid (kept in .node, never the folder name)"
        cos:       "string — <home>/.cos — its compartment description"
        node:      "string — <home>/.node — its repo node (uuid, name, source, created, settings)"
        memory:    "string — <home>/data/<memory system>/"
        ledgers:   "string — <home>/data/event_ledgers/<YYYY-MM-DD_HH-mm-ss>.ledger"
        nodes:     "string — <home>/data/nodes/<node type>/"
        source:    "string — <home>/src/ — the project's real files (what projects/<uuid> holds today)"
      behavioral_contracts: ["two repos with one name get ' (2)'; renaming moves the folder through the clear-up tool"]
      error_paths: ["a name with path characters → cleaned; empty → the uuid"]

  interfaces:

    - id: IF-SYSTEM-STORE
      name: system-store
      path: lib/system-store.js
      description: "IM6/DS2 (0.60.133) — a system's own JAA store at <system>/data/jaa, its tables brought home from cortex once, cortex's rows kept."
      exports: ["openStore(system, { root, tables, migrate })", "storeDir(system, { root })", "migrationsOf(system)"]
      behavioral_contracts: ["one writer per store", "migration recorded as settings row migrated.<table>"]
      error_paths: ["used by one module today (diagnostic/healer) — SS1/SS2 adopt it"]

    - id: IF-TEST-SANDBOX
      name: test-sandbox
      path: lib/test-sandbox.js
      description: "Every data root has an override variable a test process points at a temp folder (STORES: IDEARIUM_DATA_DIR, JAA_DATA_DIR, NEXUS_DATA_ROOT, LEDGER_STORE_ROOT …)."
      exports: ["ensure(env) → sandbox root", "STORES"]
      behavioral_contracts: ["a new data home must get its variable here, or tests write into the real tree"]
      error_paths: ["an unsandboxed writer leaves files in the tree (the 0.39.281 history)"]

    - id: IF-REPO-LAYER
      name: repo-layer
      path: idearium/repo/index.js
      description: "Repos materialize at r.materializeDir || <IDEARIUM_DATA_DIR>/projects/<uuid> today."
      exports: ["_sourceDir(uuid)", "writeSources / writeSourceBytes", "materialize(uuid)"]
      behavioral_contracts: ["the materialize dir is the repo's source of truth on disk"]
      error_paths: ["moving it without updating materializeDir loses the repo's files to materialize()"]

    - id: IF-VERSIONIUM-SNAPSHOT
      name: versionium-snapshot
      path: versionium/lib/snapshot.js
      description: "The real snapshot implementation since 2026-09-19 (D3); cortex/snapshot/index.js is its deprecation shim, required by 9 files (cortex/boot.js, guardian/server.js, orchestrator ×3, loom map, ui/home rewind, hooks, cli descriptors)."
      exports: ["the snapshot API the shim re-exports"]
      behavioral_contracts: ["callers outside versionium reach it through a route, never a require (§5.9, the boundary ratchet)"]
      error_paths: ["repointing requires to versionium/lib directly adds new crossings — refused by SB-06"]

    - id: IF-CORTEX-BOOT
      name: cortex-boot
      path: cortex/boot.js
      description: "Cortex's HTTP server today (http.createServer at boot.js:354, listen at :1380); cortex/cortex-v2.js is a command-line client of its routes."
      exports: ["the cortex HTTP routes", "cortex-v2 commands: status, ask, ask-full, gaps, memory, crystal, seam, intents"]
      behavioral_contracts: ["one process, one port"]
      error_paths: ["a second server in cortex → refused (one entry)"]

  modules:

    - id: MOD-DATA-CENSUS
      name: data-census
      uuid: nexus-data-census-v1-0000-2026-1021-001
      path: lib/data-clearup.js
      phase: DL0_data_census
      map: docs/2026-10-21-data-layout-phasemap.spec
      description: >-
        Every file under the root data/ (or any tree given): its size, sha, git-tracked or not, the OwnerRule that places it, and the
        code files that name its path (the refs to rewire). Output docs/atlases/data-census.md and the plan JSON.
      deps: [{ name: test-sandbox }]
      schema_refs: [OwnerRule, Move]
      exports: ["census({ root, dataDir, rules, tracked }) → { entries: [{ path, bytes, tracked, rule, owner, to, status, refs }], byOwner, ask }", "refsTo(root, prefix) → string[]"]
      gate_pipeline: ["GATE-DC-001: walk dataDir", "GATE-DC-002: rule per path (first match)", "GATE-DC-003: refs per top-level prefix (code files naming data/<prefix>)", "GATE-DC-004: git-tracked from git ls-files when available"]
      behavioral_contracts: ["read-only", "a path no rule matches is 'ask'"]
      error_paths: ["git unavailable → tracked null, said"]
      acceptance: ["on his data/: every file placed or asked, with refs per prefix"]

    - id: MOD-CLEARUP
      name: clearup
      uuid: nexus-data-clearup-v1-0000-2026-1021-001
      path: lib/data-clearup.js
      phase: DL1_clearup_tool
      map: docs/2026-10-21-data-layout-phasemap.spec
      description: >-
        His "file clearup tool, for safely moving and mapping". plan(census) → Moves; apply(plan) → manifest first, then per file: copy
        to the destination (mkdir -p), sha256 compare, remove the source only on equal hash; a destination holding the same bytes →
        the source is archived as a duplicate; a different file → conflict, skipped; 'ask' and refs-not-rewired → skipped and listed.
        rollback(manifest) puts every moved file back (hash checked) and returns duplicates from the archive. verify(manifest) checks
        every destination. An emptied source folder is removed only when empty. CLI: node lib/data-clearup.js census|plan|apply|rollback|verify.
      deps: [{ name: data-census }]
      schema_refs: [Move, Manifest]
      exports: ["plan(census, { onlyOwner, force }) → Move[]", "apply(moves, { root, by, dry }) → Manifest", "rollback(manifestPath, { root }) → { restored, failed }", "verify(manifestPath, { root }) → { ok, missing, changed }"]
      gate_pipeline: ["GATE-CU-001: manifest written", "GATE-CU-002: per file copy → hash → remove source", "GATE-CU-003: duplicate → archive", "GATE-CU-004: conflict/ask/refs → skip, listed", "GATE-CU-005: empty folders pruned"]
      behavioral_contracts: ["dry is the default from the CLI; --apply is said", "a second apply of the same plan is a no-op (sources gone, destinations equal)"]
      error_paths: ["any copy or hash failure → that file failed, source untouched, run continues, said in the manifest"]
      acceptance: ["a temp tree: moved files hash-equal; a conflict untouched; rollback restores every file byte for byte"]

    - id: MOD-DATA-HOME
      name: data-home
      uuid: nexus-data-home-v1-0000-2026-1021-001
      path: lib/data-home.js
      phase: DL2_one_resolver
      map: docs/2026-10-21-data-layout-phasemap.spec
      description: >-
        One resolver every writer uses instead of path.join(ROOT, 'data', …): home(system, kind, ...rest) → <system>/data/<kind>/…;
        ledger(system, at) → <system>/data/event_ledgers/<YYYY-MM-DD_HH-mm-ss>.ledger; nodes(system, type) → <system>/data/nodes/<type>/;
        memory(name) → cortex/data/memory/<name>/. Honours the sandbox variables (each kind gets one) so tests stay out of the tree.
      deps: [{ name: test-sandbox }, { name: system-store }]
      exports: ["home(system, kind, ...rest) → path", "ledger(system, at) → path", "nodes(system, type) → path", "memory(name) → path", "SYSTEMS"]
      gate_pipeline: ["GATE-DH-001: system known", "GATE-DH-002: sandbox override", "GATE-DH-003: path"]
      behavioral_contracts: ["never returns a path under the root data/"]
      error_paths: ["unknown system → error naming the systems"]
      acceptance: ["every kind resolves under its system; a sandboxed process resolves under the sandbox"]

    - id: MOD-REWIRE
      name: rewire
      uuid: nexus-data-rewire-v1-0000-2026-1021-001
      path: lib/data-home.js
      phase: DL3_rewire_writers
      map: docs/2026-10-21-data-layout-phasemap.spec
      description: >-
        The ~100 files that join a root data/ path (2026-10-21 census) changed to data-home, one owner system per step, each step with
        its graph (DG2) and its suites green; then that owner's moves are applied with the clear-up tool (refs now empty).
      deps: [{ name: data-home }, { name: clearup }]
      exports: ["per system: its writers use data-home; census refs for its prefixes = 0"]
      gate_pipeline: ["GATE-RW-001: census refs for the owner", "GATE-RW-002: rewrite to data-home", "GATE-RW-003: suites", "GATE-RW-004: apply that owner's moves"]
      behavioral_contracts: ["no owner's data moves before its refs are zero"]
      error_paths: ["a ref that builds the path from a variable → found by the census's second pass (data-dir helpers), said"]
      acceptance: ["census refs = 0 and the root data/ is empty after the last owner"]

    - id: MOD-REPO-HOME
      name: repo-home
      uuid: nexus-data-repo-home-v1-0000-2026-1021-001
      path: idearium/repo/repo-home.js
      phase: DL4_one_repo_folder
      map: docs/2026-10-21-data-layout-phasemap.spec
      description: >-
        One repo folder in Idearium: idearium/data/repos/<Repo Name>/ with .cos, .node, data/<memory system>/,
        data/event_ledgers/<date_time>.ledger, data/nodes/<node type>/, src/ (the project files). Name from the project file
        (package.json name, a .spec's meta.name) or the name given at import. Existing repos move from projects/<uuid> by the clear-up
        tool, with materializeDir updated in the same step.
      deps: [{ name: repo-layer }, { name: clearup }]
      schema_refs: [RepoHome]
      exports: ["homeOf(repo) → RepoHome", "nameFor({ projectFile, given, uuid, taken }) → string", "migrate(repo) → Manifest"]
      gate_pipeline: ["GATE-RH-001: name", "GATE-RH-002: plan moves", "GATE-RH-003: apply + materializeDir", "GATE-RH-004: verify the repo reads the same files"]
      behavioral_contracts: ["the uuid stays the identity; the folder name is for him"]
      error_paths: ["a repo that fails verify is rolled back from its manifest"]
      acceptance: ["a repo imported as 'Looking Glass' lives at idearium/data/repos/Looking Glass/ with .cos .node src data/"]

    - id: MOD-MEMORY-IN-CORTEX
      name: memory-in-cortex
      uuid: nexus-data-memory-in-cortex-v1-0000-2026-1021-001
      path: cortex/memory/index.js
      phase: DL5_memory_in_cortex
      map: docs/2026-10-21-data-layout-phasemap.spec
      description: >-
        "each memory system is in cortex": a census of memory systems outside cortex (lib/vector-memory.js, lib/local-vector-index.js,
        lib/agent-memory.js, lib/repo-hat-memory.js, meta/crystal-lattice.js, intelligence/liminal-space, data/knowledge, data/lattice,
        data/vector-index, chat logs) — each moved under cortex/memory/ (code) and cortex/data/memory/<name>/ (state), with old paths as
        forwarding shims (archived when unused). Reading to confirm: the person model (copilot) stays copilot's (§12.3, its own
        sovereignty) unless he says it is a memory system too.
      deps: [{ name: data-home }, { name: clearup }]
      exports: ["cortex/memory/index.js — one listing of every memory system with its home and its API"]
      gate_pipeline: ["GATE-MC-001: census", "GATE-MC-002: per system: move code (shim left), move state (clear-up)", "GATE-MC-003: suites"]
      behavioral_contracts: ["every old require path keeps working until archived"]
      error_paths: ["a move that creates a new crossing → designed out (route) first"]
      acceptance: ["cortex/memory/index.js lists every memory system; nothing outside cortex writes memory state"]

    - id: MOD-CORTEX-SERVER
      name: cortex-server
      uuid: nexus-data-cortex-server-v1-0000-2026-1021-001
      path: cortex/server.js
      phase: DL6_cortex_server
      map: docs/2026-10-21-data-layout-phasemap.spec
      description: >-
        "cortex v2 into server.js" — reading to confirm: cortex gets one entry, cortex/server.js (what boot.js is now: its HTTP server
        and organs), with cortex-v2.js's commands served by it (GET/POST routes the CLI and the command table call); boot.js and
        cortex-v2.js stay as thin forwarders until nothing names them, then archive.
      deps: [{ name: cortex-boot }]
      exports: ["cortex/server.js — the process entry", "routes for cortex-v2's commands"]
      gate_pipeline: ["GATE-CS-001: move boot.js body", "GATE-CS-002: forwarders", "GATE-CS-003: orchestrator spawns server.js"]
      behavioral_contracts: ["one process, one port, same routes"]
      error_paths: ["a route lost in the move → the route census (loom scanners) reports it"]
      acceptance: ["every cortex route answers the same before and after; orchestrator starts cortex/server.js"]

    - id: MOD-SNAPSHOT-SHIM
      name: snapshot-shim
      uuid: nexus-data-snapshot-shim-v1-0000-2026-1021-001
      path: cortex/snapshot/index.js
      phase: DL7_cortex_snapshot_out
      map: docs/2026-10-21-data-layout-phasemap.spec
      description: >-
        "remove snapshots folder from cortex": the 9 callers of the cortex/snapshot shim reach versionium through its route (not a
        require — §5.9), then cortex/snapshot/ is archived under _archive/ with a note.
      deps: [{ name: versionium-snapshot }, { name: clearup }]
      exports: ["no cortex/snapshot/ in the tree; callers use versionium's route"]
      gate_pipeline: ["GATE-SS-001: callers listed", "GATE-SS-002: each through the route", "GATE-SS-003: archive the shim"]
      behavioral_contracts: ["no new boundary crossing"]
      error_paths: ["a caller that needs it synchronously → said, kept on the shim until a route fits"]
      acceptance: ["grep finds no cortex/snapshot require; the boundary ratchet adds nothing"]

  events:
    data:
      - "data.clearup.planned { moves, ask, conflicts }"
      - "data.clearup.applied { manifest, moved, duplicates, conflicts, failed }"
      - "data.clearup.rolledback { manifest, restored, failed }"

  enforcement:
    gates:
      - { id: GATE-DL-HASH, name: hash-before-remove, severity: fatal, check: "source removed only after sha equal", on_failure: "file failed, source kept" }
      - { id: GATE-DL-MANIFEST, name: manifest-first, severity: fatal, check: "manifest exists before the first move", on_failure: "nothing moved" }
      - { id: GATE-DL-CONFLICT, name: no-overwrite, severity: fatal, check: "a different destination file is never replaced", on_failure: "conflict listed" }
      - { id: GATE-DL-ASK, name: ask-unsettled, severity: fatal, check: "status ask never moves", on_failure: "listed" }
      - { id: GATE-DL-REFS, name: rewire-first, severity: fatal, check: "refs empty or force", on_failure: "skipped-refs" }
      - { id: GATE-DL-ARCHIVE, name: archive-not-delete, severity: fatal, check: "nothing is unlinked without a copy in place or in the archive", on_failure: "build failure" }

  ownership:
    # The ownership table, decided by §5.9 from the census (who writes and reads each path, 2026-10-21). status ask = his call.
    - { match: "architect/*", to: "architect/data/*", owner: architect, kind: store, status: move, why: "architect writes it" }
    - { match: "clear-glass/*", to: "clear-glass/data/*", owner: clear-glass, kind: store, status: move, why: "clear-glass and lib refs" }
    - { match: "copilot/*", to: "copilot/data/*", owner: copilot, kind: store, status: move, why: "copilot writes it" }
    - { match: "diagnostic/*", to: "diagnostic/data/*", owner: diagnostic, kind: store, status: move, why: "diagnostic writes it" }
    - { match: "guardian/*", to: "guardian/data/*", owner: guardian, kind: store, status: move, why: "guardian writes it" }
    - { match: "idearium/*", to: "idearium/data/*", owner: idearium, kind: store, status: move, why: "idearium writes it" }
    - { match: "intelligence/*", to: "intelligence/data/*", owner: intelligence, kind: store, status: move, why: "intelligence writes it" }
    - { match: "loom/*", to: "loom/data/*", owner: loom, kind: store, status: move, why: "loom writes it" }
    - { match: "ollama/*", to: "ollama/data/*", owner: ollama-bridge, kind: store, status: move, why: "ollama writes it" }
    - { match: "orchestrator/*", to: "orchestrator/data/*", owner: orchestrator, kind: store, status: move, why: "orchestrator writes it" }
    - { match: "versionium/*", to: "versionium/data/*", owner: versionium, kind: store, status: move, why: "versionium writes it" }
    - { match: "erosmancer/*", to: "erosmancer/data/*", owner: erosmancer, kind: store, status: move, why: "erosmancer writes it (his data)" }
    - { match: "warp/*", to: "warp/data/*", owner: warp, kind: store, status: move, why: "lib/warp-rung.js writes rung-crystals.json for warp" }
    - { match: "ledger/orchestrator.jsonl", to: "orchestrator/data/event_ledgers/orchestrator.jsonl", owner: orchestrator, kind: event_ledgers, status: move, why: "the orchestrator's own event ledger" }
    - { match: "ledger/liminal/*", to: "intelligence/data/event_ledgers/liminal/*", owner: intelligence, kind: event_ledgers, status: move, why: "intelligence/liminal-space registers the liminal.spaces.* channels" }
    - { match: "ledger/forge/*", to: "cortex/data/event_ledgers/forge/*", owner: cortex, kind: event_ledgers, status: move, why: "cortex/boot.js registers forge.patch / forge.old (self-heal)" }
    - { match: "ledger/reflection/*", to: "cortex/data/event_ledgers/reflection/*", owner: cortex, kind: event_ledgers, status: move, why: "lib/reflection.js, cortex's Phase 11 reflection engine — reading, to confirm" }
    - { match: "ledger/bridge/*", to: "_archive/clearup/test-residue/ledger/bridge/*", owner: none, kind: raw, status: archive, why: "rows carry sourceRef modules/test-p1-fanin-live.js — test residue" }
    - { match: "ledger/cg/*", to: "clear-glass/data/event_ledgers/*", owner: clear-glass, kind: event_ledgers, status: move, why: "system 'cg' is Clear Glass (cg.context.*, cg.bus.*)" }
    - { match: "ledger/eros/*", to: "erosmancer/data/event_ledgers/*", owner: erosmancer, kind: event_ledgers, status: move, why: "system 'eros' is ErosmancerOS (eros.node.*, eros.behavior.*)" }
    - { match: "ledger/test/*", to: "_archive/clearup/test-residue/ledger/test/*", owner: none, kind: raw, status: archive, why: "test.* channels — test residue" }
    - { match: "ledger/testfaculty/*", to: "_archive/clearup/test-residue/ledger/testfaculty/*", owner: none, kind: raw, status: archive, why: "testfaculty.* channels — test residue" }
    - { match: "ledger/<system>/*", to: "<system>/data/event_ledgers/*", owner: "<system>", kind: event_ledgers, status: move, why: "lib/ledger-writer.js writes data/ledger/<system>/ — each system's event ledger, his /data/event_ledgers/" }
    - { match: "ledger-store/bl7-*", to: "_archive/clearup/test-residue/*", owner: none, kind: raw, status: archive, why: "test residue (bl7 fixtures)" }
    - { match: "ledger-store/test/*", to: "_archive/clearup/test-residue/*", owner: none, kind: raw, status: archive, why: "test residue" }
    - { match: "ledger-store/forge/*", to: "cortex/data/ledger-store/forge/*", owner: cortex, kind: store, status: move, why: "same owner as ledger/forge" }
    - { match: "ledger-store/liminal/*", to: "intelligence/data/ledger-store/liminal/*", owner: intelligence, kind: store, status: move, why: "same owner as ledger/liminal" }
    - { match: "ledger-store/reflection/*", to: "cortex/data/ledger-store/reflection/*", owner: cortex, kind: store, status: move, why: "same owner as ledger/reflection — reading, to confirm" }
    - { match: "ledger-store/<system>/*", to: "<system>/data/ledger-store/*", owner: "<system>", kind: store, status: move, why: "lib/ledger-store.js — every system's JAA mirror of its ledger" }
    - { match: "vector-index/*", to: "cortex/data/memory/vector-index/*", owner: cortex, kind: memory/vector-index, status: move, why: "his 'each memory system is in cortex'" }
    - { match: "lattice/*", to: "cortex/data/memory/lattice/*", owner: cortex, kind: memory/lattice, status: move, why: "relationship lattice — memory" }
    - { match: "knowledge/*", to: "cortex/data/memory/knowledge/*", owner: cortex, kind: memory/knowledge, status: move, why: "facts — memory" }
    - { match: "chat-logs/*", to: "cortex/data/memory/chat-logs/*", owner: cortex, kind: memory/chat-logs, status: move, why: "chat logs are memory (lib/chat-logger.js); reading, to confirm" }
    - { match: "raid/*", to: "cortex/data/raid/*", owner: cortex, kind: store, status: move, why: "RAID lives in cortex/core/raid" }
    - { match: "intake/*", to: "cortex/data/raid/intake/*", owner: cortex, kind: store, status: move, why: "lib/intake.js drops feed RAID's officiator" }
    - { match: "run-state/*", to: "idearium/data/run-state/*", owner: idearium, kind: store, status: ask, why: "lib/run-state.js .run nodes; his live ones are per repo (nexus-id-repo-…__phrun-…), so the coder's suggestion is <repo home>/data/nodes/run/ once DL4 lands — his call" }
    - { match: "nexus-self/*", to: "idearium/data/nexus-self/*", owner: idearium, kind: store, status: ask, why: "Nexus-as-a-repo metrics; one lib ref — his call" }
    - { match: "changelog-snapshot.json", to: "orchestrator/data/changelog-snapshot.json", owner: orchestrator, kind: raw, status: move, why: "orchestrator is its only ref" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at full depth"
    - "tests/modules/test-data-clearup.test.js — census, plan, apply, conflict, duplicate, ask, rollback, verify on a temp tree"
