# docs/2026-11-13-sovereign-and-wired-phasemap.spec
# Every system sovereign, wired in through its own registry: the drawbridge the only way in. Picks up, by his word, what was shelved on
# 2026-11-07 in docs/2026-10-17-system-drawbridge-phasemap.spec (DB3, DB6, DB9, DB16, DB23, DB24) and docs/2026-10-24-sovereign-systems-
# phasemap.spec (SV1–SV7, CS13). Those maps are kept whole (§0.3); this one is the order to build them in. Mapped only; nothing built.

origin:
  date: 2026-11-13
  james: '"Maybe you can work on wiring everying in. All phases that just need wiring in. Like the drawbridge and the component registry. Migrating the hooks to the registry instead of each other." (2026-11-12) · "Orchastatrator is meant to migrate into cos superviser. We need each system sovereign. Then using the drawbridge as the only way to access files. Basically looms map but per system and it’s in charge of its own map. They all need routes and command nodes, with events per call and command, all the events are to make it explicit and have it logged in the ledger per system. Also need each system to use their own data folder by default. Look at the node phases. Look at genesis and architecture spec" (2026-11-13)'
  read_first: >-
    Read 2026-11-13: genesis (idearium/spec-engine/templates/genesis.spec) Domain 0a (ownership: "a system holds its data, schemas, contract,
    config, heartbeat and pulse in its own folder"), Domain 2 (api and cli are two doors into one room), Domain 2c (the registry as the
    doorway: component, hook, wire, event, capability, command, contract and system nodes; "a module never imports across a seam"; "a
    component without a capability, a command or its events is refused"), Domain 2d (nodes, one file per fact), Domain 4 (a ledger per
    runtime); the architecture template; AXIOMS §5.16 and RG_D0 (the registry is per system; Loom is not it); the node maps
    (2026-09-11 sovereign-node-architecture, 2026-10-22 system-node-db).
  measured_2026_11_13: >-
    lib/system-boundary.js census: 396 crossings between systems (540 at the baseline, 144 closed, 0 added): 150 system to system
    (orchestrator → cortex 14, copilot → cortex 12, guardian → intelligence 10, idearium → cos 9, idearium → cortex 9, intelligence → cortex 7,
    clear-glass → cos 6, copilot → intelligence 6, cortex → intelligence 6) and 246 from lib/ up into a system (cortex 75, cos 51,
    intelligence 43, copilot 27, loom 25). Of 14 systems: 11 have a registry-components file (not cos, orchestrator, emerge); 13 a contract
    (not emerge); 8 an event taxonomy; 3 a commands folder of command nodes (guardian 49, intelligence 22, ollama 19); every system has its
    own data folder and data/<system> at the root also exists for 9 of them; 38 files in lib/ and 12 inside systems name the root data/.

decisions:
  SW_D0_picked_up:
    status: DECIDED 2026-11-13 (his)
    chosen: "The drawbridge and the per-system registry are no longer shelved: each system sovereign, its registry the only way in."
    supersedes_in_part: "the 2026-11-07 shelving ('Those are all top of my head ideas') for the phases this map names; the rest stay shelved"
    by: "his; AXIOMS §5.9, §5.15, §5.16; genesis 2c"
  SW_D1_orchestrator_into_the_supervisor:
    status: DECIDED 2026-11-13 (his)
    chosen: '"Orchastatrator is meant to migrate into cos superviser." What the orchestrator still holds moves into COS''s supervisor; the automation engine already did (AE_D4, 2026-11-06).'
    by: "his"
  SW_D2_each_system_keeps_its_own_map:
    status: DECIDED 2026-11-13 (his)
    chosen: '"Basically looms map but per system and it’s in charge of its own map." Each system generates, stores and serves its own map of what it holds and offers. Loom''s central maps are not it (RG_D0).'
    by: "his; §5.16"
  SW_D3_an_event_for_every_call:
    status: DECIDED 2026-11-13 (his)
    chosen: '"events per call and command, all the events are to make it explicit and have it logged in the ledger per system." Every route call and every command emits an event, written to that system''s own ledger.'
    by: "his; genesis Domain 4"
  SW_D4_own_data_by_default:
    status: DECIDED 2026-11-13 (his)
    chosen: '"each system to use their own data folder by default." <system>/data is the default; the root data/<system> is read only to move what is there.'
    by: "his; genesis 0a ownership"

  SW_D5_lib_is_not_a_system:
    status: DECIDED 2026-11-13 (his)
    chosen: '"lib needs to stop acting like a system." Asked whether the crystal lattice goes into the substrate or into the intelligence system, after "Like isn''t pillar the replacement to lib": into Intelligence ("Yes, map the move").'
    settles: "DB0a in docs/2026-10-17-system-drawbridge-phasemap.spec ('is lib a system: still his to settle'): it is not."
    reading: >-
      The coder's, by the axioms (§5.9, §5.16, PIL_D2): what is left of lib/ splits three ways. Primitives every system uses as code go to
      Pillar, in Emerge (his "isn't pillar the replacement to lib"; SW7_R1 reading (c), to confirm). What one system's work is goes to that
      system: learning (crystals, the lattice) to Intelligence, whose spec's purpose is to consolidate the cognition layer. What reaches into
      a system calls its route. No new substrate system: the graph's primitives are Pillar's, the learning on them is Intelligence's.
    by: "his; AXIOMS §5.9, §5.16; genesis 0a ownership"

phases:
  SW0_the_scorecard:
    layer: backend
    status: "BUILT 0.60.498 (the parts each system holds, in Emerge: cos/sovereign/card.eg; `cos sovereign`). Open: the crossings and an event per call on the same card"
    depends_on: [SW_D0_picked_up]
    files: [lib/system-boundary.js, lib/drawbridge-registry.js, lib/system-sovereign-card.js, idearium/cli/route-commands.js, tests/modules/test-system-sovereign-card.test.js]
    reuse: "lib/system-boundary.js (census, check, sovereignty, homes), lib/drawbridge-registry.js (registryOf: declared, observed, negative space), lib/registry-sovereign-check.js (RG0)."
    does: >-
      One measure, per system, of what this map asks: its own registry (yes/no), routes declared against routes served, command nodes against
      routes and CLI verbs, events declared against calls, its own ledger, its data in its own folder, crossings in and out. A ratchet: each
      number may only improve. The table in measured_2026_11_13 is its first reading. `system sovereign [<system>]`.
    proof: "the card on the real tree equals the reading above; a fixture system missing each part is named for it; a number that worsens fails"
  SW1_each_system_its_own_map:
    layer: backend
    status: "SLICE A BUILT 0.60.503 (pillar/map/map.eg, Pillar's map hook; 14 of 14 fingerprints stable). Open: slice b, each server.js keeps and serves its own map"
    depends_on: [SW0_the_scorecard, SW_D2_each_system_keeps_its_own_map]
    files: [cos/archetype/nexus-system/lib/registry.js, cos/registry-components.js, orchestrator/registry-components.js, emerge/registry-components.js, lib/drawbridge-registry.js, tests/modules/test-system-own-map.test.js, pillar/map/map.eg, pillar/test/map.test.eg, pillar/cli.eg, emerge/emerge/lang/runtime.js]
    reuse: "DB9 and DB16 (lib/drawbridge-registry.js registryOf), idearium/repo/architecture.js toNodes (genesis 2c: the registry regenerated from the code), the system archetype (cos/archetype/nexus-system), loom/scanners/capability-map.js read as a library until its parts are the archetype's."
    does: >-
      Each system generates its own map from its own code (component, hook, wire, event, capability, command and system nodes, genesis 2c),
      keeps it in its own folder, and serves it at its own route (GET /api/<system>/registry). COS, the orchestrator and Emerge get the
      registry they lack. No system writes or serves another's. COS's system registry only connects them (his 2026-11-03).
    proof: "each system's map generated twice is unchanged (fingerprints); a route in the code and not in the map is named; with Cortex and Loom stopped every other system still serves its map"
  SW2_routes_and_command_nodes:
    layer: backend
    status: OPEN
    depends_on: [SW1_each_system_its_own_map]
    files: [cos/archetype/nexus-system/lib/commands.js, idearium/cli/route-commands.js, architect/commands, clear-glass/commands, copilot/commands, cortex/commands, cos/commands, diagnostic/commands, idearium/commands, loom/commands, orchestrator/commands, versionium/commands, tests/modules/test-system-command-nodes.test.js]
    reuse: "the .command nodes Guardian (49), Intelligence (22) and Ollama (19) already keep; idearium/cli/route-commands.js (every row a route); genesis Domain 2 (api and cli are two doors into one room)."
    does: >-
      Every route a system serves and every CLI verb it answers is a command node in that system's own folder, generated from its map,
      naming the capability it invokes. Eleven systems have none today. The central table of rows is then read from the systems' nodes,
      not written by hand.
    proof: "per system: routes served = command nodes (none missing, none extra); a row in the central table with no node is named; a command run by its node reaches the same route"
  SW3_an_event_per_call_in_its_own_ledger:
    layer: backend
    status: OPEN
    depends_on: [SW2_routes_and_command_nodes, SW_D3_an_event_for_every_call]
    files: [cos/archetype/nexus-system/lib/ledger.js, cos/archetype/nexus-system/lib/serve.js, architect/event-taxonomy.js, clear-glass/event-taxonomy.js, idearium/event-taxonomy.js, loom/event-taxonomy.js, ollama/event-taxonomy.js, tests/modules/test-system-call-ledger.test.js]
    reuse: "COS's supervisor ledger (append-only, every act a line), each system's event-taxonomy.js (8 of 14 have one), genesis Domain 4 (a ledger per runtime), the heartbeat in the archetype."
    does: >-
      One place in the archetype wraps every route and command: the call in and its outcome are an event (<system>.<command>.called /
      .done / .failed, with who asked), declared in the system's taxonomy and appended to the system's own ledger in its data folder. The six
      systems with no taxonomy get one, generated from their command nodes.
    proof: "a call to any route of a fixture system is two lines in its ledger with who, what and the outcome; an event not in the taxonomy is refused, named; no system writes another's ledger"
  SW4_own_data_by_default:
    layer: backend
    status: OPEN
    depends_on: [SW0_the_scorecard, SW_D4_own_data_by_default]
    files: [cos/archetype/nexus-system/lib/data-dir.js, lib/system-boundary.js, scripts/move-root-data.js, tests/modules/test-system-own-data.test.js]
    reuse: "SV1 (every table has one owner) and SV2–SV7 of docs/2026-10-24-sovereign-systems-phasemap.spec, lib/system-boundary.js tables and homes, each system's existing <system>/data."
    does: >-
      One resolver gives a system its data folder: <system>/data unless its config says otherwise. The 12 files inside systems and the 38
      in lib/ that name the root data/ go through it. What sits in data/<system> at the root is moved once, by a command he runs, into
      the system's own folder: copied, checked, then the old place left as a note of where it went. Nothing is deleted.
    proof: "on a fixture tree: each system reads and writes only under its own data; the move is the same bytes after as before; a file naming the root data/ is counted by the scorecard and may only fall"
  SW5_orchestrator_into_the_supervisor:
    layer: backend
    status: OPEN
    depends_on: [SW1_each_system_its_own_map, SW_D1_orchestrator_into_the_supervisor]
    files: [orchestrator/orchestrator.js, orchestrator/auth, orchestrator/lib, orchestrator/cos-ui-door.js, cos/manager/supervisor.js, cos/manager/server.js, cos/manager/contract.json, tests/modules/test-orchestrator-into-cos.test.js]
    reuse: "AE_D4 and AE6 (the automation engine already runs in COS), CS13 and DB23 (autopilot to the orchestrator, superseded by this), COS's supervisor and its declarations, MG38 (the pulse watch)."
    does: >-
      First a census of what the orchestrator still does (its routes, its auth, its pulse watch, the central /api/components), each
      assigned: into COS's supervisor, to the system that owns it, or retired. Then moved one part at a time, the old route answering
      with where it went until its callers have moved. Its 14 crossings into Cortex end with it.
    proof: "each orchestrator route answered by COS or by its owner; the old address says where it went; with the orchestrator not started, Nexus boots and the pipeline builds"
  SW5a_autopilots_remains_into_the_supervisor:
    layer: backend
    status: OPEN
    depends_on: [SW5_orchestrator_into_the_supervisor]
    files: [lib/nexus/core-duties.js, cos/manager/duties.js, lib/nexus/autopilot.js, cos/manager/server.js, tests/modules/test-core-duties.test.js]
    reuse: "MG17 (0.60.330: supervision already moved; autopilot.js is the launcher), lib/nexus/core-duties.js whole (moved by git mv, not rewritten), COS's ledger and bus in-process"
    does: >-
      His "orchastrator and autopilot need to migrate to cos superviser" (2026-11-13). What autopilot still runs in its own process beside COS,
      the six duties of core-duties.js (wire, vitals, update, loom, snapshot, follow), runs inside COS's manager. `follow` listens to COS's ledger
      in the process instead of reading it by route every few seconds (PR6, no polling). lib/nexus/autopilot.js stays the entry COS's exe and
      the NexusCOS service start (cos/app/runtime.js ENTRIES), and only starts the manager and stays in the foreground. lib/ holds no duty after
      it (SW_D5).
    proof: "the duties' tests pass from cos/manager/duties.js; with COS's manager started alone (no launcher) a circuit-open line makes one gap and the minute's snapshot is written; ps shows one Nexus supervisor process, not two"
  SW5b_cortexs_workers_go_home:
    layer: backend
    status: OPEN
    depends_on: [SW5_orchestrator_into_the_supervisor]
    files: [orchestrator/orchestrator.js, cortex/server.js, cortex/core/raid/worker.js, cortex/core/raid/officiator.js, cortex/memory/table-compactor.js, cortex/memory/table-deduplicator.js]
    does: >-
      Found by the census: the orchestrator starts Cortex's RAID worker, its officiator, its table compactor (twice: rows and caps) and its
      deduplicator inside the orchestrator's own process, and opens Cortex's jaa-db directly in 12 places. They are Cortex's (§5.15): Cortex's
      server.js starts them; what the orchestrator read from jaa-db it asks Cortex's routes for. Not COS's: the supervisor runs processes, not
      another system's work.
    proof: "with the orchestrator stopped, a contract filed by POST /api/raid/contracts is drained by Cortex's own worker; the census shows orchestrator → cortex at 0 requires"
  SW5c_the_orchestrators_own_background_assigned:
    layer: backend
    status: OPEN
    depends_on: [SW5a_autopilots_remains_into_the_supervisor, SW5b_cortexs_workers_go_home]
    files: [orchestrator/orchestrator.js, orchestrator/lib, cos/manager/server.js, versionium, lib/warp-bus.js, lib/resource-monitor.js, lib/gap-relay.js]
    does: >-
      Each thing the orchestrator starts at boot, assigned before it moves: the WARP spine and the pulse (COS's bus and heartbeat, PR6), the
      resource monitor (COS's proc-stats already measures), the gap relay (COS's supervisor: it holds the restarts), the sigma-writer and
      sigma compaction (their owner read from the code first), Versionium's auto-commit (Versionium's own server), the node registry and system
      nodes sync (each system its own, SW1). One per slice; each named where it went.
    proof: "per item: it runs from its owner with the orchestrator stopped; its old start line in orchestrator.js says where it went"
  SW5d_the_bus_into_cos:
    layer: backend
    status: OPEN
    depends_on: [SW5c_the_orchestrators_own_background_assigned]
    files: [orchestrator/orchestrator.js, cos/manager/server.js, cos/manager/contract.json]
    does: "The bus and its streams (/nexus-bus/sse, /sse, /api/events, /api/event, /api/recall, /api/ledger, /api/state) answered by COS (its /api/cos/events exists); :9000 forwards them until their callers move."
    proof: "an event emitted by a system reaches a listener on COS's stream and on :9000's forwarder alike"
  SW5e_the_forwards_retired:
    layer: integration
    status: OPEN
    depends_on: [SW5d_the_bus_into_cos, SW6_the_drawbridge_the_only_way_in]
    files: [orchestrator/orchestrator.js, lib/nexus-client.js]
    does: >-
      146 routes of the orchestrator only forward to another system (guardian 39, cortex 37, idearium 29, architect 21, intelligence 7,
      diagnostic 4, loom 3, copilot 3, versionium 2, emerge 1). Each caller goes to the owner's route through lib/nexus-client.js, one owner at a
      time, smallest first; the forward then answers with where it went.
    proof: "per owner: a grep finds no caller of the forwarded path on :9000; the callers' tests pass"
  SW5f_others_data_goes_home:
    layer: integration
    status: OPEN
    depends_on: [SW5e_the_forwards_retired, SW4_own_data_by_default]
    files: [orchestrator/orchestrator.js]
    does: "What the orchestrator serves that is another system's (ideas, snapshots, gaps, SNR, memory, notes, components, hooks, specs, tags, CFR) is served by its owner (§5.15, one owner per kind of data); the orchestrator's copy, if any, moved once by a command he runs."
    proof: "each kind answered by its owner; the orchestrator holds none of them"
  SW5g_the_pages_and_auth:
    layer: ui
    status: OPEN
    depends_on: [SW5f_others_data_goes_home]
    files: [orchestrator/orchestrator.js, orchestrator/auth, orchestrator/cos-ui-door.js, cos/ui]
    does: "The shell pages (/, /home, /ui/*) and auth: their home is his to settle (SW5_R1); then moved."
    proof: "each page opens from its new home in Clear Glass"
  SW5h_the_orchestrator_retired:
    layer: integration
    status: OPEN
    depends_on: [SW5g_the_pages_and_auth]
    files: [orchestrator/orchestrator.js, orchestrator/compartment.json, cos/manager/supervisor.js, docs/atlases/orchestrator-atlas.md]
    does: ":9000 becomes a forwarder to COS that names where each route went (SW5_R2 decides how long it lives); the orchestrator's compartment archived with a pointer (§0.3)."
    proof: "SW5's own: with the orchestrator not started, Nexus boots, every :9000 caller gets its answer, and the pipeline builds"
  SW6_the_drawbridge_the_only_way_in:
    layer: integration
    status: OPEN
    depends_on: [SW2_routes_and_command_nodes, SW3_an_event_per_call_in_its_own_ledger, SW5_orchestrator_into_the_supervisor]
    files: [lib/nexus-client.js, lib/system-boundary.js, lib/contracts/system-boundary-baseline.json, copilot, guardian, idearium, intelligence, clear-glass, cortex, tests/modules/test-drawbridge-only.test.js]
    reuse: "DB3 and DB6, lib/nexus-client.js (a call to another system by its route, waking it through COS), the census and its ratchet, the CIE8 move (four callers repointed to Idearium's route) as the pattern."
    does: >-
      The 150 system-to-system crossings moved, one pair at a time, smallest first: each require() into another system's folder becomes a
      call to a route that system's map declares (added to its map and command nodes when missing). After each pair the ratchet's
      baseline falls and is written back. At zero, a new crossing fails the build, not only the count.
    proof: "per pair: the census shows 0 for it and its callers' tests pass; at the end 0 system crossings, and a fixture require() across a seam fails by name"
  SW7a_the_crystal_lattice_into_intelligence:
    layer: integration
    status: OPEN
    james: '"yes but lib needs to stop acting like a system. should we move that into the substrate or into the intelligence system?" · "Yes, map the move" · "this should be a pipeline task" (2026-11-13)'
    depends_on: [SW_D5_lib_is_not_a_system]
    part_of: SW7_lib_goes_home
    files: [lib/meta/crystal-lattice.js, intelligence/lattice/crystal-lattice.js, intelligence/routes.js, intelligence/registry-components.js, lib/compartment-engine.js, lib/case-library.js, lib/meta/index.js, lib/node-export.js, lib/agent-tools/tools/query/query-intelligence.js, idearium/cli/route-commands.js, tests/modules/crystal-lattice.test.js, tests/modules/case-library.test.js, tests/modules/intuition-upgrade.test.js, tests/modules/test-crystal-lattice-in-intelligence.test.js]
    read_2026_11_13: >-
      lib/meta/crystal-lattice.js (262 lines): a (domain, verb, outcome) pattern seen PATTERN_FREQUENCY_THRESHOLD times becomes a crystal
      (PASS) or a negative crystal (FAIL); lattice edges gain weight on success, lose it on failure, and decay on a timer. Its tables,
      crystals and lattice_edges, are in Cortex's JAA store, reached by require('../../cortex/memory/jaa-db') (a crossing). Live callers:
      lib/compartment-engine.js (updateOnExecution on every compartment outcome; the engine runs in Cortex's process, so the decay timer
      does too) and lib/case-library.js (_edgeKey, reading lattice_edges.success_rate). lib/meta/index.js keeps a lazy getter no one
      calls; node-export.js and query-intelligence.js name it in comments. Intelligence already serves GET /api/intelligence/crystals and
      /api/intelligence/lattice, reading the same tables read-only (intelligence/routes.js freshReader). cortex/cortex-v2.js reads
      lattice_edges through Cortex's /api/memory (a route, not a crossing).
    does: >-
      Backend first: git mv lib/meta/crystal-lattice.js → intelligence/lattice/crystal-lattice.js (history kept); it runs in Intelligence's
      process, and its decay timer with it. Route: POST /api/intelligence/lattice/outcome { compartment, outcome } is updateOnExecution;
      GET /api/intelligence/lattice/edge?from&to answers what case-library reads. Then the callers: compartment-engine posts each outcome
      (never blocking the compartment: Intelligence down is said on the ledger and the outcome counted as missed, not retried into a
      storm, his "one system down breaks no other"); case-library asks the edge route; lib/meta/index.js loses its getter. Command row:
      `intel lattice outcome|edge`. The tables stay where they are in this slice (Cortex's store, read by Intelligence already); their
      move into intelligence/data is SW4's for Intelligence (his "own data folder by default"), a migration first (§0.3), nothing deleted.
    proof: "lib/meta/crystal-lattice.js gone and git log --follow finds it at its new path; three PASS outcomes posted give one crystal, a FAIL pattern a negative crystal (the old tests at the new home); case-library's edge read through the route equals the old direct read; with Intelligence stopped a compartment still completes and the missed outcome is on the ledger; the census shows lib's crossing into cortex from crystal-lattice gone and none added"
    note: "its own phase so COS's pipeline can build it as one request: SW7 waits on SW4 and SW6, this slice needs nothing built first, removes crossings and adds none"
  SW7_lib_goes_home:
    layer: integration
    status: OPEN
    depends_on: [SW6_the_drawbridge_the_only_way_in, SW4_own_data_by_default]
    files: [lib, lib/system-boundary.js, cortex, cos, intelligence, copilot, loom, tests/modules/test-lib-goes-home.test.js, lib/meta/crystal-lattice.js, intelligence/lattice/crystal-lattice.js, intelligence/routes.js, lib/compartment-engine.js, lib/case-library.js, tests/modules/test-crystal-lattice-in-intelligence.test.js]
    reuse: "SV2 (core files go home), CS18 (one copy of the primitives), lib/system-boundary.js homes and blockerOf, DB0a (is lib a system: still his to settle)."
    does: >-
      The 246 crossings from lib/ up into a system: a file in lib/ that only one system uses moves into that system; one that reaches
      into a system calls its route instead; what is truly shared stays, reaching into nothing.
    proof: "0 upward crossings; each moved file's history kept (git mv); every test that named the old path passes at the new one"
    readings_to_confirm: ["SW7_R1 (his 2026-11-10, still open): the component store. (a) lib/ a shared library with per-system config, (b) a store copied into each system, or (c) Pillar."]
    expanded_2026_11_13: >-
      James, 2026-11-13: "yes but lib needs to stop acting like a system. should we move that into the substrate or into the intelligence
      system?" · told the coder's reading (into Intelligence; its spec names it the home of the cognition layer): "Yes, map the move".
      SW_D5 decides lib/ is not a system. Mapped ahead of the order (SW7 last) by his yes; slice a removes crossings and adds none.
    slice_a: "built as its own phase, SW7a_the_crystal_lattice_into_intelligence (his 2026-11-13: \"this should be a pipeline task\")"

order: >-
  SW0 first (it measures every other phase). Then SW1 → SW2 → SW3 (the map, the command nodes, the events) and SW4 (data) beside them.
  SW5 before SW6, so the orchestrator's crossings are not moved twice. SW7 last. Each phase is slices of one system at a time, so a slice
  can be built by the pipeline as its own request.

# ── EXPANDED 2026-11-13 (0.60.498) — his additions the same day; SW0 built ───────────────────────────────────────────────────────────────
# James, 2026-11-13: "Was trying to get the pipeline built fully so it can take care of these automatically, step by step. The heartbeat needs
# hooked in and the polling disabled. Like all capabilities should have a command with events. Look at the node taxonomy, it's another way to
# make the system more dynamic and recursive. Follow the axioms 3.1 and Claude.md. Like we can bundle them also. Each system needs their
# database and server.js." · asked "Is this high leverage?", told yes in his order (the pipeline first, so it builds the rest), then: "Yes."
#
# Read: NODE-TAXONOMY.md. It already names what this map builds: capability (its route, a .command, and its intent are required), command,
# event, hook, wire, component, ledger, and system (OPEN there). So:
# - SW1 expands: a system's map is its nodes in the taxonomy's types (component, hook, wire, capability, command, event, and one .system node),
#   in lib/node-export.js's envelope. Every capability names its command and its events, or the registry refuses it (genesis 2c).
# - SW2 expands: "all capabilities should have a command with events": a capability with no .command, or a .command with no events, is
#   counted on the scorecard and may only fall.
# - SW3 expands: the heartbeat is one of the system's events, declared like the rest. Hooking it in and disabling the polling is PR6
#   (docs/2026-10-05-announce-pulse-repair-phasemap.spec PR6_cos_listens_never_polls), which this map depends on for SW3's proof, not a
#   second phase for it.
# - SW4 expands: "Each system needs their database and server.js." Its database is in its own data folder, opened only by that system; its
#   server.js is its one process, what COS manages (his 2026-11-03). Of 14, eight have a server.js at their root today (copilot, cortex,
#   diagnostic, guardian, intelligence, loom, ollama, versionium; Emerge's is emerge/emerge/server.js).
# - Bundles ("Like we can bundle them also"): reading to confirm, SW_R2. (a) A system's nodes exported as one bundle file, so a system can be
#   moved, backed up or imported whole (with `cos import`, SC17 when mapped). (b) Several nodes bundled into one node, as a .pipeline bundles its
#   macros. The coder's reading is (a); not built.
# - The order, his: the pipeline builds these, one system per request. So each slice of SW1–SW7 is written as a request the pipeline can take,
#   and its proof is a number on the scorecard.
#
# SW0 built (0.60.498): cos/sovereign/card.eg (Emerge) reads, for each system, its server.js, registry, contract, event taxonomy, command
# nodes, its own data folder, and whether its data is still at the root; worse() is the ratchet. Through COS: GET /api/cos/sovereign, POST to
# keep a reading (a person's), `cos sovereign [--keep]`. First reading, kept in cos/sovereign/baseline.json: 0 of 14 systems whole, 63 of 98
# parts. Not on the card yet, said: the crossings (Idearium's `system sovereign` has them), an event per call, a database per system.
# ── ADDENDUM 2026-11-13 — his words on the compartment's file, the service and the drawbridge; SW1 slice a (mapped before code) ──
# James, 2026-11-13: "comtinue to the registry. also what about making cos a service. the .spec is the compartments disc file? that way when
# idearium creates a new compartment it can be imported automatically using the .spec. the server.js used to interact with each system. the
# drawbridge also hooks into the cie-eg in emege. like emerge reduces as much friction as possible, cie-eg is emeges version of the drawbridge"
# Earlier the same day: "Then each systems server.js uses its own database for managing nodes with also connect to the lattice. Each
# primitive/capabity should be its own file. The core file being either the foundation or the pillars." · "Like isn't pillar the replacement to lib"
# Read from the code (2026-11-13):
#   - the service: built (CA4, 0.60.389, cos/app/service.js, NSSM, service NexusCOS); not installed on his PC (Get-Service: none).
#   - the compartment's file today: COS's supervisor reads <system>/<system>.cos (his 2026-11-01 "no .json files. only nodes. use .cos"), else
#     compartment.json; only emerge/emerge.cos exists, 12 systems still have compartment.json. A folder carrying either is picked up at COS's
#     next boot. Each system also has <system>/spec/<system>.spec (the archetype's). Whether the .spec becomes the compartment's file (and the
#     .cos goes) is his to settle: asked, not changed.
#   - CIE-EG's own registry: Emerge's components() (components, hooks, wires) is the drawbridge inside Emerge, as he says; an Emerge system's
#     map is read from it; a JavaScript system's map is generated from its code (SW1).
# SW1 slice a, the coder's reading by the axioms (§8.6 reuse; his "each primitive/capabity should be its own file"; PIL_D2 "library"; §5.9):
#   - pillar/map/map.eg: map_of(root, system) reads ONE system's folder (its .js, skipping node_modules, data, phases, _archive, tests) and
#     returns { system, files, routes, events, crossings: [{ to, count }], commands, fingerprint }. Pure: it writes nothing.
#     Read by text (Emerge has no regex capture): a route is a string literal after === that starts with '/'; an event is the first string
#     argument of emit(; a crossing is a require('../…') that leaves the system's folder. Limits, said: a route matched by a regular expression
#     in the code is not seen; a computed require is not seen.
#   - emerge/emerge/lang/runtime.js gains is_dir (a missing capability goes into Emerge, §17.13); emerge-lock rewritten.
#   - pillar/cli.eg: `map <root> <system>` prints it. Proof: pillar/test/map.test.eg; each of the 14 systems mapped twice, same fingerprint.
#   - Slice b (not this slice): each server.js writes its own map into its own folder and serves GET /api/<system>/registry; the routes found
#     against registry-components.js declared (a route in the code and not in the map named).
# ── ADDENDUM 2026-11-13 (0.60.503, renumbered: main took 0.60.502 for CIE13 slice a) — SW1 slice a built ──
# pillar/map/map.eg, Pillar's in hook map, `eg run pillar/cli.eg map <root> <system>`, Emerge's is_dir. Proof: pillar/test/map.test.eg 4/4;
# the 14 systems mapped twice, 14 of 14 the same fingerprint; Versionium's 19 routes equal a grep; Guardian's 49 command nodes and 10 reaches
# into Intelligence equal SW0 and the census. Changed while building: map became one of Pillar's in hooks (Pillar's rule, every command
# through a hook). Open: slice b; routes matched by a regular expression are not seen; 160 reaches between systems against the census's 150.

# ── ADDENDUM 2026-11-13 — SW5 expanded: the census, autopilot's remains, eight slices (mapped before code) ──
# James, 2026-11-13: "orchastrator and autopilot need to migrate to cos superviser"
# Already his, kept: SW_D1 (this map, the same day), MG38 and MG_D5 (2026-11-08, "Cos is meant to be the orchastrator": the process retires,
# :9000 a forwarder). MG38 is SW5 (one phase, two maps); SW5 is where it is built. Autopilot's supervision moved on 2026-10-31 (MG17, 0.60.330).
# The census (read from orchestrator/orchestrator.js, 3,716 lines, 2026-11-13):
#   - about 180 route branches; 146 of them only forward to another system (counts in SW5e);
#   - it requires into other systems 21 times: Cortex 17 (its RAID worker, officiator, table compactor, deduplicator started in this process;
#     jaa-db opened directly 12 times), Intelligence 1 (the CFR ledger), Clear Glass 1 (copilot tools), Copilot 1 (user model), Guardian 1;
#   - at boot it starts the WARP spine, the resource monitor, the gap relay, sigma-writer, Versionium's auto-commit, sigma compaction, the
#     pulse, the node registry and the system nodes sync;
#   - files naming :9000 or the orchestrator by name, outside tests and archives: about 160 (lib 80, clear-glass 17, guardian 9, cos 8,
#     copilot 8, loom 7, intelligence 6, idearium 4); a grep, an upper bound.
# What is left of autopilot: lib/nexus/autopilot.js (159 lines, the launcher) and lib/nexus/core-duties.js (194 lines, six duties) run in a
# process of their own beside COS's manager: two Nexus processes where one supervises. SW5a moves the duties in.
# By the axioms (the coder's, cited): §10.3 one supervisor, §5.15 one owner per kind of data (so Cortex's workers go to Cortex, not COS),
# §5.9 each system its own folder, SW_D5 lib is not a system, §0.3 nothing deleted (git mv; the old route says where it went).
# Order: SW5a and SW5b first (independent, small, each ends a crossing), then c → d → e (after SW6's pattern) → f → g → h.
# readings_to_confirm (his):
#   SW5_R1: the orchestrator's shell pages and auth. (a) Into COS (its UI server cos/ui/serve.js and the manager); (b) each page to the system
#     it shows, auth to Guardian. The coder leans (a) for the shell, (b) for the pages that show one system.
#   SW5_R2: :9000 after the move. (a) A forwarder kept as long as anything calls it; (b) kept one release, then gone. The coder leans (a).
# Built alongside, 0.60.515 (Clear Glass's code, recorded in the changelog; found in his console while mapping): _erosHold out of scope
# (ER2, 0.60.509) and the sign-in page re-injection loop (SI1). His console also shows SW5b's finding live: "orchestrator [raid-worker]".
