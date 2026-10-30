# docs/2026-10-24-cos-manager-phasemap.spec — COS as a full management system, "like vmware, but for cos"
# The ideas, the order and the calls are James's. The census of what exists, the phase cut and the readings are the coder's; each reading
# is marked "to confirm". This map composes the COS phases already mapped (they are depended on, not redone) and adds MG phases only where
# nothing exists. By his 2026-10-20 rule ("everything needs to be speccced before built"), MG0b writes the full spec before any MG code.

origin: >-
  James, 2026-10-24 (while brave-cori's LM4 was being ported): "now loom need to use the component registry as the spine, the bridge for
  the compartment, event bus and interaction contract, and handshake verification. the ui floats on top. / then need to make cos genesis
  compartments use the component registry as the bridge/tunnel to the database and server.js, and read the data. / then well need a full cos
  management system. / integrating qumu state snapshots and versionium, and a full enterprise grade system state manager. a full browser and
  editor for each the archetype, schemas, blueprint and templates. / i am thinking of something like vmware, but for cos. all backend, cli and
  api, first, then ui uses cli and api routes, each page is isolated, seperate, all js, html and css are seperated and isolated per component
  and uses the component registry. / full settings, for cos and each compartment in relation to the template or type. / full automation and
  macro support, hats, hook into the main orchastrator and can edit resources per compartment, throttle, rewind, version, branch, run in
  parrell, test, create new compartment templates, compilers, web servers, test env, anything."
  Before it, his own words this stands on: 2026-10-23 "Okay, so COS would be the spine, right? … a load balancer … spawn and despawn
  systems … individual performance throttling … compartments can branch to benchmark versions of systems" (cos-spine) · "Dont they need to
  be sovereign first?" (CS_D7) · the VMware window he asked for earlier (COSA12_vmware_window, VM1_control_like_vmware).

status: "MAPPED 2026-10-24. Nothing built here yet."

found_2026_10_24:
  already_mapped: >-
    93 COS phases in 8 maps. The ones this map stands on:
    - VMware-like control: COSA12_vmware_window, VM1_control_like_vmware, CON7_enterprise_bar.
    - State: CS1_a_version_is_a_system_state (a version is the Versionium commit plus the QEMU snapshot), CS2_test_every_version,
      SN0_one_branch, SN1_open_a_snapshot_as_a_compartment, SN2_run_in_parallel.
    - Control: CS5_caps_per_compartment (throttle), CS7_spawn_despawn_and_balance, CS10_hats_bound_to_the_compartment.
    - Registry: CS3_the_registry_is_the_bridge, DB12_the_ui_handshake, DB21/DB22 (one registry schema at every level), DB26 (the UI on the
      registry).
    - Genesis: DB19_genesis_sandboxed_fork (parked), DB20_sealed_archetype.
    - Factories: SV0–SV4 (his network engines as COS services), CE1_the_compartment_machine (test envs), EL1_electron_compiler.
  already_built: >-
    - cos/workspace/vm-control.js: pause, resume, checkpoint, rewind on QEMU.
    - cos/archetype and cos/blueprint: registries and schemas.
    - loom/templates: cos-compartment.js, system-scaffold.js.
    - cos/compartment/boundary.js: the wall (0.60.249).
    - lib/cos-bridge.js: create, destroy, intent, start, stop.
    - The COS app shell (COSA0–COSA3).
    - lib/hat-seed.js (hats).
  not_found: >-
    - A browser or editor for archetypes, schemas, blueprints or templates.
    - Per-compartment settings layered by template or type.
    - Macros run against a compartment.
    - One state manager over every compartment.
    - A page shell where each page is its own HTML, CSS and JS, bound to its component's registry.

readings_to_confirm:
  - "\"loom need to use the component registry as the spine, the bridge for the compartment …\": Loom is the first system done end to end: its registry is its spine inside, the bridge to its compartment from outside (CS_D1, his), it carries its bus and its contract, and its UI shakes hands with it (DB12). Loom first because it is the first one walled (LM4)."
  - "\"cos genesis compartments\": compartments made from the genesis archetype (cos/archetype/nexus-system, DB19's fork). \"the bridge/tunnel to the database and server.js, and read the data\": the compartment reaches its system's store and server only through the registry's declared routes (DB13, the tunnel); COS reads the data through them, never the files."
  - "\"a full enterprise grade system state manager\": one manager over every compartment's state: its versions (Versionium + QEMU, CS1), branches, what runs, what it holds, and every change on the event ledger."
  - "\"each page is isolated … per component and uses the component registry\": each UI page is a component with its own .html, .css and .js, declared in the registry, reading only the routes and CLI rows the registry names (DB12's handshake)."

decisions:
  MG_D0_order:
    chosen: "Loom on its registry spine first; then genesis compartments through the registry; then the COS manager, backend → CLI/API → UI, as he wrote it; inside it, sovereignty still comes first for Nexus's own systems (CS_D7, docs/2026-10-24-sovereign-systems-phasemap.spec)"
    by: "his, 2026-10-24 (quoted in origin): \"now loom … then … then well need a full cos management system\" · \"all backend, cli and api, first, then ui\""
  MG_D1_ui_isolated_per_component:
    chosen: "every page is its own component: separate .html, .css and .js files, declared in the registry, using only the CLI rows and API routes it declares; no page shares code with another except through core"
    by: "his, 2026-10-24: \"each page is isolated, seperate, all js, html and css are seperated and isolated per component and uses the component registry\""

  MG_D2_category_is_a_registry_record:
    chosen: "a category is a record in COS's registry (CS_D1, the registry is the spine), validated against its archetype's or template's schema; every change to it is recorded in Versionium (§17.12)"
    by_the_axioms: "§5.15 one owner (COS owns its categories); §17.12; §8.6 (MG5's editors, not a second editor)"
  MG_D3_data_through_the_compartment:
    chosen: "the data browser reads a compartment's data only through the routes its registry declares (MG2's tunnel), never its files"
    by_the_axioms: "§5.15 rule 1"

  MG_D4_cos_is_the_autopilot:
    chosen: >-
      COS's manager is the one supervisor and the system's management screen: autopilot's job (boot, restart with backoff, circuit, memory
      floor, on-demand spawn and idle stop, its ledger, its :7799 door) moves into cos/manager, read from each system's compartment.json, and
      lib/nexus/autopilot.js becomes a launcher that hands over (kept, §0.3). The orchestrator on :9000 stays the API router it is. CS13
      (autopilot to orchestrator/) is superseded by it: there is no supervisor left to move. TO CONFIRM — the coder's reading of his words.
    by: >-
      his, 2026-10-30: "look at all of the phases for each cos and soveriegn phases. then lets spec the ui for the cos to manage the system.
      This will be the new orchastrator/autopilot." Standing on his 2026-10-23 "Okay, so COS would be the spine, right? It would be the
      orchestrator, right?". The reading (supervisor + management screen move into COS; the :9000 router stays) is the coder's; the other
      reading on the table is that COS also replaces the :9000 orchestrator, which is bigger and is not phased here.
    by_the_axioms: >-
      §10.3 two supervisors are competing truth layers (cos/app/runtime.js today starts autopilot as a second one beside COS's own
      process-runner); §8.6 COS already has process-runner, watchdog and proc-stats; §5.15 rule 2 each system declares its own runtime in its
      compartment.json instead of autopilot's hard-coded list; §5.12 the pages float on the manager and the manager runs headless; §0.3 the
      door on :7799 keeps every caller working.

  MG_D5_cos_is_the_orchestrator:
    chosen: >-
      COS is the orchestrator: it manages the overview (the tablet's, on compartments) and runs each system isolated in its compartment.
      Confirms MG_D4's reading of the role. Open, smaller: whether :9000's API router later moves into COS too (not phased).
    by: >-
      his, 2026-10-30, answering MG_D4: "cos is the orchastrator, manages the overview, look at tablet except it uses the compartments as a
      way to manage the compartments for each system and run them isolated." Same message: "no cos renamed to emerge." (read by the coder
      as: COS keeps its name; emerge is "meant to be for new systems. like a tracker" — what emerge tracks is TO CONFIRM.)
  MG_D6_the_spec_is_the_system:
    chosen: >-
      A system or project travels as one .spec file (SpecBundle): the spec is its metadata, a compressed payload is the whole tree, and its
      history (versions, commits, conversations, notes, decisions, phases, changelogs, benchmarks) rides inside, appended, never rewritten. Any
      zip with a .spec in it imports the whole project. COS and Idearium both export and import it; Idearium packs (it owns repos and their
      history), COS asks it by route and adds how it ran the compartment.
    by: >-
      his, 2026-10-30: "i want a full manager for adding, deploying or connecting/importing a system into cos. can also drag and drop zips. any
      zip with a .spec imports the entire project repo. the .spec is the entire compressed system, the spec is the metadata. i want each system
      to export as a compressed .spec file, in cos and indearium. the spec is the history of each project, versions, conversations, all of it,
      logged, tracked, expanded, compared, etc."
    by_the_axioms: >-
      The file's layout is decided by his axioms: §5.13 (the spec is the contract, the payload is not architecture) and §0.3 (nothing lost) give
      a YAML file whose metadata comes first and whose payload is one compressed field last, so every .spec reader in Nexus (55 files in lib
      alone) reads the metadata unchanged and none of them has to learn a container. The alternative, a zip renamed .spec, would break each of
      those readers. §5.15 places the packer with Idearium (the owner of repos and their history) and keeps COS on its route; §5.15 rule 3:
      with Idearium down, COS still reads the metadata and holds the import.

  MG_D7_pages_and_sections_on_the_registry_bus:
    chosen: >-
      Every page and every section of a page is its own component, bundled with its own html, css and js, declared in COS's component
      registry, and isolated: no shared DOM or style (each section in its own shadow root), no calls between them. They talk only by events
      on the registry's bus, and only the events their registry entry declares. Depends on COS's registry being accepted (DB16; today
      cos/registry-components.draft.json, his to accept).
    by: >-
      his, 2026-10-30: "each page is isolated from each other, completely decomposed and bundled with each section in relation to its
      component, css, and js file. these needs to be isolated from each other, using the component registry as the event bus." Extends his
      MG_D1 (2026-10-24) from pages to sections and names the bus.

phases:
  MG0b_the_full_spec:
    status: SPECCED 2026-10-30 — cos/spec/cos-manager.spec
    depends_on: [MG_D0_order]
    files: [cos/spec/cos-manager.spec, tests/modules/test-substrate-spec.test.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-CONTRACT]
    does: >-
      The full spec in emerge's module format before any MG code (his 2026-10-20 rule): schemas (CompartmentState, Version, Branch,
      Settings layer, Macro, Template, PageComponent), the interfaces it stands on (vm-control, cos-bridge, versionium, archetype and
      blueprint registries, the wall, hat-seed), and each module with its exports, gates, contracts, errors and acceptance. It compiles at
      full depth (SS-01..03).
    proof: "cos-manager.spec compiles at specDepth 1.0, no BLACK node; every MG phase below names it and its blocks"

  MG1_loom_on_its_registry_spine:
    status: OPEN
    depends_on: [DB21_one_registry_schema_every_level, DB12_the_ui_handshake, CS3_the_registry_is_the_bridge, MG0b_the_full_spec]
    files: [loom/registry-components.js, loom/interaction-contract.json, loom/event-taxonomy.js, loom/ui]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-LOOM-SPINE]
    does: >-
      Loom first, end to end: its registry is read as its spine (DB21's schema), it is the bridge to its compartment (CS3), it carries
      Loom's bus (event-taxonomy) and contract (interaction-contract), and Loom's UI shakes hands with it before any call (DB12). The UI
      floats on top: it reads only what the registry declares. Loom moves in when his seal question (loom-into-cos addendum b) is answered.
    proof: "Loom's registry validates as level 'system'; its UI's undeclared call is refused and shown; every route the registry names is served"

  MG2_genesis_compartments_through_the_registry:
    status: OPEN
    depends_on: [MG1_loom_on_its_registry_spine, DB20_sealed_archetype, DB13_the_tunnel]
    files: [cos/archetype/nexus-system.js, cos/archetype/genesis-catalog.js, lib/cos-bridge.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-GENESIS]
    does: >-
      A compartment made from the genesis archetype reaches its own store and its server.js only through its registry's declared routes
      (the tunnel), and COS reads its data the same way, never its files.
    proof: "a genesis compartment's data is read through its routes; a direct file read from outside it is not used anywhere (the census)"

  MG3_the_state_manager:
    status: OPEN
    depends_on: [MG0b_the_full_spec, CS1_a_version_is_a_system_state, SN0_one_branch, SN2_run_in_parallel, VM1_control_like_vmware]
    files: [cos/manager/state.js, cos/manager/routes.js, idearium/cli/route-commands.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-STATE]
    does: >-
      One manager over every compartment's state: its versions (a Versionium commit and its QEMU snapshot under one id, CS1), its branches,
      runs in parallel, what is running, and every change on the event ledger. Backend, then route, then a command row.
    proof: "a compartment versioned, branched, rewound and run beside its branch, each act on the ledger, through the route and the command"

  MG4_resources_per_compartment:
    status: OPEN
    depends_on: [MG3_the_state_manager, CS5_caps_per_compartment, CS7_spawn_despawn_and_balance]
    files: [cos/manager/resources.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-RESOURCES]
    does: "edit a compartment's resources (memory, CPU, its throttle), spawn, despawn, balance, rewind: by route and command, read back from the OS or hypervisor (CS_D4)"
    proof: "a cap set, read back, and enforced on a fixture compartment; what cannot be enforced is said"

  MG5_browsers_and_editors:
    status: OPEN
    depends_on: [MG0b_the_full_spec]
    files: [cos/manager/catalog.js, cos/archetype/registry.js, cos/blueprint/registry.js, loom/templates]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-CATALOG]
    does: >-
      A browser and editor, backend first, for each kind: archetypes, schemas, blueprints and templates. List, read, diff, validate against
      its schema, write (versioned, undoable), make a new one from an existing one.
    proof: "each kind listed, edited, validated, versioned and reverted through its routes and commands"

  MG6_settings_by_template_and_type:
    status: OPEN
    depends_on: [MG0b_the_full_spec, AS1_one_resolver_global_then_repo]
    files: [cos/manager/settings.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-SETTINGS]
    does: "settings for COS and for each compartment, layered schema default → COS's → the template's or type's → the compartment's own, one resolver (AS1's shape), each value saying where it came from"
    proof: "a template's setting shows on every compartment made from it; a compartment's own value wins and says so; reset falls back"

  MG7_automation_macros_and_hats:
    status: OPEN
    depends_on: [MG3_the_state_manager, CS10_hats_bound_to_the_compartment, CON8_nexus_server_hook]
    files: [cos/manager/macros.js, lib/hat-seed.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-MACROS]
    does: >-
      Macros: a recorded or written sequence of COS commands, run against a compartment or many, on demand or by rule. Hats bound to the
      compartment (CS10). The main orchestrator can call every COS verb through the same routes (CON8). An agent's act is a proposal unless
      a rule he set allows it (cos-spine).
    proof: "a macro (snapshot → change → test → rewind) runs against a fixture compartment, each step on the ledger"

  MG8_the_factory:
    status: OPEN
    depends_on: [MG5_browsers_and_editors, SV2_into_a_compartment, CE1_the_compartment_machine, EL1_electron_compiler]
    files: [cos/manager/factory.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-FACTORY]
    does: "new compartment templates, and compartments that are compilers, web servers (his engines, SV), test environments (CE1), or anything a template describes, made from the editors (MG5)"
    proof: "a web-server compartment and a test-env compartment made from templates, each answering its health route"

  MG9_the_console_ui:
    status: OPEN
    depends_on: [MG3_the_state_manager, MG4_resources_per_compartment, MG5_browsers_and_editors, MG6_settings_by_template_and_type, MG7_automation_macros_and_hats, MG8_the_factory, MG_D1_ui_isolated_per_component, DB26_the_ui_floats_on_the_registry, COSA12_vmware_window]
    files: [cos/ui]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-UI-COMPARTMENT, MOD-MG-UI-CATALOG, MOD-MG-UI-AUTOMATION]
    does: >-
      The VMware-like console, last, on the routes and commands above only: a tree of compartments, each one's state, versions and
      branches, resources, settings, macros and editors. Each page is its own component (MG_D1): its own .html, .css and .js, declared in
      the registry, shaking hands before it calls. Driven in Clear Glass, never Playwright.
    proof: "driven in Clear Glass: a compartment made, versioned, throttled, branched, rewound and destroyed from the pages; an undeclared call refused and shown"

  MG10_categories:
    status: OPEN
    depends_on: [MG0b_the_full_spec, MG5_browsers_and_editors, MG6_settings_by_template_and_type, CS4_every_system_a_compartment, MG_D2_category_is_a_registry_record]
    files: [cos/manager/categories.js, cos/manager/routes.js, idearium/cli/route-commands.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-CATEGORIES]
    does: >-
      Backend, then route, then command. A category is { id, name, from: archetype | template, source id, schema, settings layer (MG6),
      members }. List, show, new (from an archetype or a template), edit against its schema, rename, remove (archived, §0.3). Every change
      goes to Versionium. The built-in "systems" category lists each Nexus system as its compartment, with its state (CS4). Command rows:
      `cos category list|show|new|edit|rm`.
    proof: "a category made from an archetype and one from a template; an edit refused by its schema says why; systems lists every system compartment; each change in Versionium"
  MG11_category_manager_ui:
    status: OPEN
    depends_on: [MG10_categories, MG_D1_ui_isolated_per_component, DB26_the_ui_floats_on_the_registry]
    files: [cos/ui/categories]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-UI-CATEGORIES]
    does: >-
      The manager and editor screens on MG10's routes only. Categories as a list; a category page with its archetype or template, its
      schema (a form built from the schema, and raw), its settings and its members. Systems is one of them. Each page is its own component
      (MG_D1).
    proof: "driven in Clear Glass: a category made, edited against its schema, and removed; systems shows every system compartment"
  MG12_the_exe_is_the_compartment_manager:
    status: OPEN
    depends_on: [MG3_the_state_manager, MG4_resources_per_compartment, MG9_the_console_ui, MG11_category_manager_ui, MG_D3_data_through_the_compartment, COSA6_the_exe, COSA12_vmware_window, CS8_the_cos_screen, VM1_control_like_vmware]
    files: [cos/app/desktop/main.js, cos/app/desktop/ui, cos/app/controller.js, cos/manager/routes.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-EXE-MANAGER]
    does: >-
      cos.exe becomes the full compartment manager. On the left, a tree of categories and their compartments (MG10/MG11). Each compartment
      has tabs:
      - Rewind: VM1's checkpoint timeline and CS1's versions; restore, branch, pause and resume; Clear Glass's session rewind for a browser
        compartment, to confirm.
      - Diagnostics: health, failure modes, logs, lib/cos-debug-report.js.
      - Versions: its Versionium history and releases; restore a version.
      - Data: a browser of its data through its own routes (MG_D3).
      - Tools: the commands and tools its registry declares, run from here.
      It gathers CS8's screen into it rather than building a second one.
    proof: "driven in Clear Glass on the exe's UI: a fixture compartment rewound to a checkpoint, its diagnostics read, a version restored, its data browsed through its route, a tool run"
  MG13_cli_in_the_exe:
    status: OPEN
    depends_on: [CON1_one_door_client, CON2_grammar_and_completion, CON5_pane, MG12_the_exe_is_the_compartment_manager]
    files: [cos/app/cli.js, cos/app/desktop/main.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-EXE-CLI]
    does: >-
      CLI access. A console pane inside the exe (CON5). From a terminal, `COS.exe <command>` runs any row headless and prints the result:
      through CON1's one door when Idearium is up, and the local COS verbs when it is not.
    proof: "`COS.exe status` and `COS.exe cos category list` print without opening a window; the pane runs the same rows"
  MG14_live_thumbnails:
    status: OPEN
    depends_on: [MG12_the_exe_is_the_compartment_manager, CS3_the_registry_is_the_bridge]
    files: [cos/app/desktop/thumbnails.js, cos/app/desktop/ui]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-THUMBS]
    does: >-
      Each compartment's own UI (the index.html its registry declares) rendered off-screen and shown as a live thumbnail in the manager's
      tree and grid. Refreshed on change or every few seconds, paused when hidden. Clicking it opens that UI. A compartment with no UI shows
      its status card instead, and says so.
    proof: "a fixture compartment's index.html appears as its thumbnail and updates after a change; one with no UI says it has none"

  MG15_the_supervisor_in_cos:
    status: OPEN
    depends_on: [MG0b_the_full_spec, MG_D4_cos_is_the_autopilot, CS4a_cos_boots_alone]
    files: [cos/manager/supervisor.js, cos/manager/server.js, lib/system-shape.js, tests/modules/test-cos-supervisor.test.js, tests/modules/run-all.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-SUPERVISOR, MOD-MG-SERVER]
    does: >-
      autopilot's supervision in COS, on process-runner, watchdog and proc-stats: the boot plan from every compartment.json (each system adds
      bootPhase, onDemand, maxOldSpaceMB to its own), backoff, circuit, memory floors, on-demand and idle, the ledger. Served by
      cos/manager/server.js on :7799 under /api/cos/, headless. Its defaults equal autopilot's constants. Backend, route, command rows
      (cos ps|start|stop|restart|boot|ledger), in that order.
    proof: "fixture systems: boot in phase order, a killed child restarted with backoff, a crash loop opens the circuit, on-demand start and idle stop, each a ledger line; the defaults test reads autopilot's constants and the policy's"
  MG16_the_autopilot_door:
    status: OPEN
    depends_on: [MG15_the_supervisor_in_cos]
    files: [cos/manager/autopilot-door.js, cos/manager/contract.json, tests/modules/test-cos-autopilot-door.test.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-AUTOPILOT-DOOR]
    does: "every route autopilot serves on :7799, answered by the manager in the same shape; /files and /tables kept as legacy with their callers counted"
    proof: "each route's answer matches a recorded autopilot fixture; orchestrator /api/autopilot/status and Clear Glass's spawn of clear-glass work unchanged"
  MG17_autopilot_hands_over:
    status: OPEN
    depends_on: [MG16_the_autopilot_door, CS12_the_mover_is_proven]
    files: [lib/nexus/autopilot.js, cos/app/runtime.js, package.json, lib/nexus-self/systems.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-AUTOPILOT-HANDOVER]
    does: "autopilot becomes the launcher of COS's manager (its old body archived with the version that retired it); runtime.js starts the manager for new releases and keeps ENTRIES for old ones"
    proof: "npm run start:all boots every system through COS; an old release zip still starts in cos.exe; no second supervisor (ports and pids)"
  MG18_the_supervisor_screen:
    status: OPEN
    depends_on: [MG16_the_autopilot_door, MG_D1_ui_isolated_per_component, MG_D7_pages_and_sections_on_the_registry_bus, DB16_a_registry_for_each_system]
    files: [cos/ui/core, cos/ui/shell, cos/ui/overview, cos/ui/ledger, cos/ui/proposals, cos/manager/contract.json]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-UI-CORE, MOD-MG-UI-SHELL, MOD-MG-UI-OVERVIEW, MOD-MG-UI-LEDGER, MOD-MG-UI-PROPOSALS]
    does: >-
      The first pages, as soon as the supervisor and its door stand (the most leverage first: the screen that replaces autopilot's status
      and the home page's tiles): ui/core (handshake, call, run, events, confirm), the shell (top bar, tree, router), Overview, Ledger,
      Proposals. MG9 then adds the compartment tabs, the catalog and automation on the same shell.
    proof: "driven in Clear Glass at /ui/shell/: a fixture system stopped, started and restarted from its card; the act on the Ledger with by = the person; an undeclared call refused and shown"
  MG19_the_spec_bundle:
    status: OPEN
    depends_on: [MG0b_the_full_spec, MG_D6_the_spec_is_the_system]
    files: [idearium/repo/spec-bundle.js, idearium/api/index.js, idearium/cli/route-commands.js, lib/node-schemas/schema.spec_bundle, tests/modules/test-spec-bundle.test.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-SPEC-BUNDLE]
    does: "Idearium packs, unpacks, reads and compares a SpecBundle; GET /api/repos/:uuid/export.spec; POST /api/repos/import takes a .spec and any zip with a .spec; rows repo export|import|compare"
    proof: "a repo exported, imported as a new repo and compared with the first: no difference but the uuid; a corrupted payload refused before anything is written"
  MG20_add_deploy_connect:
    status: OPEN
    depends_on: [MG19_the_spec_bundle, MG15_the_supervisor_in_cos, MG8_the_factory, CS9_every_project_a_compartment]
    files: [cos/manager/intake.js, cos/manager/server.js, cos/manager/contract.json, tests/modules/test-cos-intake.test.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-INTAKE]
    does: "COS's one way in: inspect a dropped file and say what it is; import (release zip, zip with a .spec, .spec bundle), deploy (template), connect (address, handshake); export a compartment as a .spec"
    proof: "each kind added to a fixture COS through the route and the row, each step a gate on the ledger; Idearium stopped, the import is held and said"
  MG21_the_add_screen:
    status: OPEN
    depends_on: [MG20_add_deploy_connect, MG18_the_supervisor_screen]
    files: [cos/ui/add, cos/ui/shell, cos/manager/contract.json]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-UI-ADD]
    does: "the Add page and the window-wide drop: what was found, what will happen, Add, each step shown; Export on every card and compartment"
    proof: "driven in Clear Glass: a zip with a .spec dropped, shown, added and running, then exported from its card"
  MG22_template_and_archetype_builder:
    status: OPEN
    depends_on: [MG5_browsers_and_editors, MG8_the_factory, MG18_the_supervisor_screen]
    files: [cos/manager/builder.js, cos/ui/builder, cos/manager/contract.json, tests/modules/test-cos-builder.test.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-BUILDER, MOD-MG-UI-BUILDER]
    does: "build a template or archetype from parts, declare its runtime, allocation, networks, volumes, settings and UI, validate, try it in a scratch compartment, save; backend, route, row, screen"
    proof: "a web-server template built from parts, tried, saved and deployed; driven in Clear Glass"
  MG23_allocation_and_balance:
    status: OPEN
    depends_on: [MG4_resources_per_compartment, CS7_spawn_despawn_and_balance, CS11_raid_in_the_exe, MG15_the_supervisor_in_cos]
    files: [cos/manager/balancer.js, cos/manager/contract.json, tests/modules/test-cos-balancer.test.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-BALANCER]
    does: "the host as a pool, each compartment allocated and throttled from it; RAID decides balance from .benchmark nodes and usage, COS acts and names the decision; pins"
    proof: "two fixture compartments under load: RAID moves load to the idle one; an over-commit refused with the numbers"
  MG24_network_manager:
    status: OPEN
    depends_on: [MG15_the_supervisor_in_cos, SV2_into_a_compartment]
    files: [cos/manager/network.js, cos/compartment/qemu-runtime.js, cos/manager/contract.json, tests/modules/test-cos-network.test.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-NETWORK]
    does: "virtual networks (isolated, nat, bridged), join, names and rules through his dns and firewall engines, bridges to the host through proxy, tunnel or tap, to run a server or service"
    proof: "a web-server compartment on an isolated network, bridged to the host on one port, answers from the host and from no other compartment"
  MG25_storage_manager:
    status: OPEN
    depends_on: [MG15_the_supervisor_in_cos, MG3_the_state_manager, SV2_into_a_compartment]
    files: [cos/manager/storage.js, cos/manager/contract.json, tests/modules/test-cos-storage.test.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-STORAGE]
    does: "storage locations (folder, drive, his object-storage engine), volumes with quotas, mounted into compartments, use read back, taken with versions"
    proof: "a volume made, mounted into a fixture compartment, written, its use read back, taken with a version"
  MG26_branch_benchmark_merge:
    status: OPEN
    depends_on: [MG3_the_state_manager, SN0_one_branch, SN2_run_in_parallel, SN3_measured_by_rfr2]
    files: [cos/manager/merge.js, cos/manager/state.js, cos/manager/contract.json, tests/modules/test-cos-merge.test.js]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-MERGE]
    does: "a branch runs beside its base under the same load, is benchmarked and friction tested, and merges back only on a MergeReport that says merge (or his ask), through lib/safe-apply.js mergeBack"
    proof: "a slower branch refused with its numbers; a faster one with equal friction merged, the target versioned first"
  MG27_state_and_resource_screens:
    status: OPEN
    depends_on: [MG23_allocation_and_balance, MG24_network_manager, MG25_storage_manager, MG26_branch_benchmark_merge, MG18_the_supervisor_screen]
    files: [cos/ui/timeline, cos/ui/resources, cos/manager/contract.json]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-UI-TIMELINE, MOD-MG-UI-RESOURCES]
    does: "the snapshot browser (per compartment and whole-system timelines, lanes, compare, merge report) and the resources screen (pool, allocations, balancer log, network map, storage), each section its own component on the registry bus"
    proof: "driven in Clear Glass: a system state taken, a branch benchmarked, refused, changed and merged, the system restored; a memory cut read back, a network bridged, a volume mounted"

build_order: "MG0b → MG1 → MG2 → MG3 → MG4 → MG5 → MG6 → MG7 → MG8 → MG9. Backend → route → command → UI in each, and MG9 (the UI) last, as he said. Sovereignty of Nexus's own systems (SV1–SV7) goes on alongside; COS opening a Nexus system waits on it (CS_D7)."

# ── ADDENDUM 2026-10-29 — categories, and cos.exe as the full compartment manager (his) ─────────────────────────────────────────────
# James, 2026-10-29: "catagories using either the architypes or the templates, with a full manager and editor, with the schemas, then
# catagories which can be managed, including systems which would then list each system compartment. / also really need cos.exe to be a fully
# compartment manager with controls for the rewind engine, diagnostic tools, versions, data browser and tools. cli access. index.html/ui for
# the thumbnail. / look at all of the cos phases, and add all of this to them."
# Grounded 2026-10-29 against all 12 COS maps (testenv, machines, app, console, spine, manager, services, guardian-into-cos, loom-into-cos,
# the copilot expansion, cos.spec, cos-debug-report.spec). What exists and is built on, not redone:
#   - MG5 (browsers and editors for archetypes, schemas, blueprints, templates)
#   - MG6 (settings by template and type)
#   - MG9 (the console UI)
#   - COSA6 (the exe, BUILT 0.60.89) and COSA12 (the VMware window, BUILT 0.60.90)
#   - CS4 (every system a compartment) and CS8 (the COS screen: systems, versions, links)
#   - VM1 (pause, resume, checkpoint, rewind on QEMU; cos/workspace/vm-control.js, built 0.39.371)
#   - CON1–CON5 (the one-door console, grammar, the pane)
#   - lib/cos-debug-report.js
#   - cos/archetype and cos/blueprint with their schemas; loom/templates
# Nothing existed for: categories, a "systems" category, one manager window with rewind, diagnostics, versions, data and tools per
# compartment, the exe as a CLI, or live thumbnails.
#
# readings_to_confirm (the coder's):
#   - "catagories using either the architypes or the templates … with the schemas": a category is a named group defined by one archetype
#     or one template, and it carries that one's schema. Compartments made from it are its members. Categories are made, edited, renamed
#     and removed in a manager, and edited against the schema.
#   - "including systems which would then list each system compartment": a built-in category, "systems", whose members are Nexus's own
#     systems, each as its compartment (CS4).
#   - "controls for the rewind engine": a compartment's rewind is its checkpoints and versions (VM1 on QEMU, CS1). For a browser compartment
#     it is also Clear Glass's session rewind (clear-glass/src/rewind/engine.js). To confirm which he meant.
#   - "index.html/ui for the thumbnail": each compartment's own UI (its index.html, the route its registry declares) shown as a live
#     thumbnail in the manager, the way VMware shows each VM's screen. To confirm.
#
# The decisions MG_D2 and MG_D3 and the phases MG10–MG14 are in this map's decisions: and phases: blocks above (real YAML, so
# lib/phase-dag.js checks them).
# build_order addendum: MG10 → MG11 → MG12 → MG13 → MG14, after MG3–MG9. Backend → route → command → UI in each (his order of delivery).

# ── ADDENDUM 2026-10-30 — COS is the new orchestrator/autopilot; the full spec (MG0b) and the UI specced (his) ───────────────────────
# James, 2026-10-30: "look at all of the phases for each cos and soveriegn phases. then lets spec the ui for the cos to manage the system.
# This will be the new orchastrator/autopilot."
# Read first, 13 maps: cos-app (COSA0c–COSA7 built; COSA5, COSA8 open), cos-console (CON1–8 open), cos-spine (CS1–11 open, nothing built),
# this map (MG0b–MG14 open, nothing built), cos-services (SV0 done, SV1–4 open), guardian-into-cos (GD0–1 done, GD2–8 open), loom-into-cos
# (LM0–4 done, LM5 open), sovereign-systems (SV0 done, SV1 partly, SV1_D1 his, SV2–8 and CS12–21 open), and the older track-b, versionium,
# observability, node-architecture and testenv maps (closed or retracted).
# Found: autopilot (lib/nexus/autopilot.js) is a second supervisor beside COS. cos/app/runtime.js says so in its header ("COS does not
# become a second supervisor: it starts the project's OWN supervisor"), and COS's own process-runner, watchdog and proc-stats go unused for it.
# Done in this addendum:
#   - cos/spec/cos-manager.spec written (MG0b): 8 schemas, 8 interfaces, 26 modules, every MG phase tied to it by spec:/blocks:.
#   - Decision MG_D4_cos_is_the_autopilot, the coder's reading, TO CONFIRM.
#   - New phases: MG15 (the supervisor in COS), MG16 (autopilot's :7799 door kept), MG17 (autopilot hands over), MG18 (the first screen:
#     core, shell, Overview, Ledger, Proposals).
# build_order addendum: MG0b → MG15 → MG16 → MG18 → MG17, then MG1–MG14 as before. The supervisor screen comes before the rest of the UI
# because it replaces something running today. The handover comes after the screen, so his stack never runs without a way to see it.

# ── ADDENDUM 2026-10-30 (b) — COS is the orchestrator (his); the system travels as one .spec; add, deploy, connect, import, export ───
# James, 2026-10-30: "no cos renamed to emerge. integrating its meant to be for new systems. like a tracker. / cos is the orchastrator, manages
# the overview, look at tablet except it uses the compartments as a way to manage the compartments for each system and run them isolated. /
# i want a full manager for adding, deploying or connecting/importing a system into cos. can also drag and drop zips. any zip with a .spec
# imports the entire project repo. the .spec is the entire compressed system, the spec is the metadata. i want each system to export as a
# compressed .spec file, in cos and indearium. the spec is the history of each project, versions, conversations, all of it, logged, tracked,
# expanded, compared, etc. / also idearium and emerge and warp integrate into one?"
# Recorded: MG_D5 (COS is the orchestrator; MG_D4's role reading confirmed), MG_D6 (the spec is the system). New: SpecBundle, MG19 (Idearium
# packs), MG20 (COS's intake), MG21 (the Add screen). The Overview page is the tablet on compartments (MOD-MG-UI-OVERVIEW).
# Stands on: POST /api/repos/import (repo.import-archive), idearium/repo/living-spec.js, COSA1's release-zip drop, MG8's factory, CS9.
# His three-way question was asked and decided on 2026-10-24 (docs/2026-10-24-emerge-warp-system-phasemap.spec EW_D0/EW_D1, his "okay warp
# and emerge."): emerge and warp one system, the spec compiler and IDE in Idearium (EW1-EW3 done, EW4-EW5 open). Asked again; the coder's
# answer is in the reply, his call stands until he changes it.
# build_order addendum: ... MG18 → MG19 → MG20 → MG21.

# ── ADDENDUM 2026-10-30 (c) — builder, resources, network, storage, the state manager's timeline and merge; sections on the bus (his) ──
# James, 2026-10-30: "full template, architype builder. a resource manager for each compartment in cos. so each system can be throttled,
# allowcated, balaced using raid as a load balancer, network manager, storage management. like adding storage locations, adding virtual
# networks and bridging it for running a server or service on. / full enterprise grade system state manager and snapshot browser with the
# timeline, ability to branch, benchmark and merge after friction testing. / each page is isolated from each other, completely decomposed and
# bundled with each section in relation to its component, css, and js file. these needs to be isolated from each other, using the component
# registry as the event bus."
# Stands on, read 2026-10-30: his network engines in COS (cos/services/anonymous/engines: proxy, tunnel, firewall, dns, storage, webserver,
# tls; SV0), qemu-runtime's -netdev (user with hostfwd, or none), lib/safe-apply.js (mirror → branch → check → mergeBack, RAID-gated),
# lib/raid-port.js decide, SN0–SN4 (one branch, open a snapshot, run in parallel, measured by RFR2), CS7 (spawn, despawn, balance), CS11
# (RAID in the exe, with load), MG4 (caps), MG5 (editors), MG8 (factory), the architecture spec's FrictionScore and RULE A/B.
# Recorded: MG_D7 (his). New in cos-manager.spec: ResourceAllocation, VirtualNetwork, StorageVolume, SystemState, MergeReport; IF-RAID-PORT,
# IF-SAFE-APPLY, IF-NET-ENGINES, IF-QEMU-RUNTIME, IF-ARCHETYPE-SCHEMA; MOD-MG-BUILDER (+UI), BALANCER, NETWORK, STORAGE, MERGE, UI-TIMELINE,
# UI-RESOURCES; state manager gains whole-system states. Phases MG22–MG27. MG18 now waits on DB16 (COS's registry accepted): the bus is it.
# Said: a tap bridge needs host admin rights; without them COS bridges through his proxy or tunnel engines.
