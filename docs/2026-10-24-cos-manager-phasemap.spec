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

phases:
  MG0b_the_full_spec:
    status: OPEN
    depends_on: [MG_D0_order]
    files: [cos/spec/cos-manager.spec, tests/modules/test-substrate-spec.test.js]
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
    does: >-
      Loom first, end to end: its registry is read as its spine (DB21's schema), it is the bridge to its compartment (CS3), it carries
      Loom's bus (event-taxonomy) and contract (interaction-contract), and Loom's UI shakes hands with it before any call (DB12). The UI
      floats on top: it reads only what the registry declares. Loom moves in when his seal question (loom-into-cos addendum b) is answered.
    proof: "Loom's registry validates as level 'system'; its UI's undeclared call is refused and shown; every route the registry names is served"

  MG2_genesis_compartments_through_the_registry:
    status: OPEN
    depends_on: [MG1_loom_on_its_registry_spine, DB20_sealed_archetype, DB13_the_tunnel]
    files: [cos/archetype/nexus-system.js, cos/archetype/genesis-catalog.js, lib/cos-bridge.js]
    does: >-
      A compartment made from the genesis archetype reaches its own store and its server.js only through its registry's declared routes
      (the tunnel), and COS reads its data the same way, never its files.
    proof: "a genesis compartment's data is read through its routes; a direct file read from outside it is not used anywhere (the census)"

  MG3_the_state_manager:
    status: OPEN
    depends_on: [MG0b_the_full_spec, CS1_a_version_is_a_system_state, SN0_one_branch, SN2_run_in_parallel, VM1_control_like_vmware]
    files: [cos/manager/state.js, cos/manager/routes.js, idearium/cli/route-commands.js]
    does: >-
      One manager over every compartment's state: its versions (a Versionium commit and its QEMU snapshot under one id, CS1), its branches,
      runs in parallel, what is running, and every change on the event ledger. Backend, then route, then a command row.
    proof: "a compartment versioned, branched, rewound and run beside its branch, each act on the ledger, through the route and the command"

  MG4_resources_per_compartment:
    status: OPEN
    depends_on: [MG3_the_state_manager, CS5_caps_per_compartment, CS7_spawn_despawn_and_balance]
    files: [cos/manager/resources.js]
    does: "edit a compartment's resources (memory, CPU, its throttle), spawn, despawn, balance, rewind: by route and command, read back from the OS or hypervisor (CS_D4)"
    proof: "a cap set, read back, and enforced on a fixture compartment; what cannot be enforced is said"

  MG5_browsers_and_editors:
    status: OPEN
    depends_on: [MG0b_the_full_spec]
    files: [cos/manager/catalog.js, cos/archetype/registry.js, cos/blueprint/registry.js, loom/templates]
    does: >-
      A browser and editor, backend first, for each kind: archetypes, schemas, blueprints and templates. List, read, diff, validate against
      its schema, write (versioned, undoable), make a new one from an existing one.
    proof: "each kind listed, edited, validated, versioned and reverted through its routes and commands"

  MG6_settings_by_template_and_type:
    status: OPEN
    depends_on: [MG0b_the_full_spec, AS1_one_resolver_global_then_repo]
    files: [cos/manager/settings.js]
    does: "settings for COS and for each compartment, layered schema default → COS's → the template's or type's → the compartment's own, one resolver (AS1's shape), each value saying where it came from"
    proof: "a template's setting shows on every compartment made from it; a compartment's own value wins and says so; reset falls back"

  MG7_automation_macros_and_hats:
    status: OPEN
    depends_on: [MG3_the_state_manager, CS10_hats_bound_to_the_compartment, CON8_nexus_server_hook]
    files: [cos/manager/macros.js, lib/hat-seed.js]
    does: >-
      Macros: a recorded or written sequence of COS commands, run against a compartment or many, on demand or by rule. Hats bound to the
      compartment (CS10). The main orchestrator can call every COS verb through the same routes (CON8). An agent's act is a proposal unless
      a rule he set allows it (cos-spine).
    proof: "a macro (snapshot → change → test → rewind) runs against a fixture compartment, each step on the ledger"

  MG8_the_factory:
    status: OPEN
    depends_on: [MG5_browsers_and_editors, SV2_into_a_compartment, CE1_the_compartment_machine, EL1_electron_compiler]
    files: [cos/manager/factory.js]
    does: "new compartment templates, and compartments that are compilers, web servers (his engines, SV), test environments (CE1), or anything a template describes, made from the editors (MG5)"
    proof: "a web-server compartment and a test-env compartment made from templates, each answering its health route"

  MG9_the_console_ui:
    status: OPEN
    depends_on: [MG3_the_state_manager, MG4_resources_per_compartment, MG5_browsers_and_editors, MG6_settings_by_template_and_type, MG7_automation_macros_and_hats, MG8_the_factory, MG_D1_ui_isolated_per_component, DB26_the_ui_floats_on_the_registry, COSA12_vmware_window]
    files: [cos/ui]
    does: >-
      The VMware-like console, last, on the routes and commands above only: a tree of compartments, each one's state, versions and
      branches, resources, settings, macros and editors. Each page is its own component (MG_D1): its own .html, .css and .js, declared in
      the registry, shaking hands before it calls. Driven in Clear Glass, never Playwright.
    proof: "driven in Clear Glass: a compartment made, versioned, throttled, branched, rewound and destroyed from the pages; an undeclared call refused and shown"

build_order: "MG0b → MG1 → MG2 → MG3 → MG4 → MG5 → MG6 → MG7 → MG8 → MG9. Backend → route → command → UI in each, and MG9 (the UI) last, as he said. Sovereignty of Nexus's own systems (SV1–SV7) goes on alongside; COS opening a Nexus system waits on it (CS_D7)."
