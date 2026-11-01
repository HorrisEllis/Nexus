# docs/2026-11-01-the-compartment-phasemap.spec — the compartment, whole: everything a compartment is and does, in one place, once.
# It supersedes the overlapping phases of six COS maps (each superseded phase kept, its status naming its successor here, §0.3).
# The idea and the call are James's; the grouping, the order and which old phase goes where are the coder's, said.

origin: >-
  James, 2026-11-01: "just dont have redundancy. like each compartment should be all of it. not split up every where." Said after the
  coder listed the COS maps feeding a compartment's control panel: cos-console (CON1–9), compartment-environment (CE1–7), cos-spine (CS1),
  snapshot-compartments (SN0–4) and cos-manager (MG3, MG4, MG6, MG9, MG13, MG14, MG23–27, MG31) — the same compartment described in pieces.
  Before it, the same day: "only compartments have control panels. hooks into the server.js using the interaction contract. they each have
  what idearium has with the desktop envirement. a full popout window with controls. like vmware is kind of." (MG_D19)

status: "MAPPED 2026-11-01. Supersedes 35 open phases; nothing built by this map yet."

decisions:
  CP_D0_a_compartment_is_all_of_it:
    status: DECIDED 2026-11-01 (his)
    chosen: >-
      A compartment is one thing with everything in it: its machine and its door, its window (the control panel, MG_D19), its terminal and
      the system-wide CLI (one grammar, one gate), its files and code, its states (rewind, versions, branches), its resources, its settings and
      the agents deployed into it. Each of these is built once, here, for every compartment (a Nexus system, a project, a VM, a canvas), never
      again per system or per page. What other maps described in pieces is superseded by the one phase here that does it.
    by: "his, 2026-11-01: \"just dont have redundancy. like each compartment should be all of it. not split up every where.\""
    by_the_axioms: "§10.3 (one truth, not competing copies), §8.6 (build once on what exists), §0.3 (each superseded phase kept, its successor named)"

  CP_D1_cos_and_idearium_one_link:
    status: DECIDED 2026-11-01 (his)
    chosen: >-
      COS and Idearium's repos are one link, both ways: a compartment made in COS becomes, by itself, a repo in Idearium, nested under its
      parent compartment's repo; an Idearium project gets its compartment (CS9's half). The link is the compartment's id on the repo; the
      repo's files are the compartment's project folder. Emerge (EAS3) is the first.
    by: "his, 2026-11-01: \"lets make it a compartment. i want compartments in cos to automatically become nested compartments in idearium. like cos needs to be connected with ideariums repos\" (about HorrisEllis/Emerge, just cloned)"
    by_the_axioms: "§5.15 (COS announces, Idearium owns its repos: each through the other's route, never its files), §10.3 (one link, not two lists), §0.3 (a destroyed compartment's repo archived, never deleted)"
stands_on: >-
  Built: COS's supervisor, its door, the handover, its UI and the cockpit (MG15–MG18, MG29); Loom run behind its wall (LM6); a repo's desktop
  (idearium/ui/desktop.html on cos/workspace); checkpoints, activity and Nexus's systems as compartments (compartment-control-and-activity);
  COS's host, its gates and its 24 archetypes. Other sessions' work it reads and does not supersede: the agents' control panel (AC1–AC7),
  orchestrator automation (AE2–AE4).

phases:
  CP0_the_full_spec:
    status: OPEN
    depends_on: [CP_D0_a_compartment_is_all_of_it]
    files: [cos/spec/compartment.spec, docs/SPEC-REGISTRY.spec]
    interface: [route]
    does: "the full spec in emerge's module format: the compartment's schema (its machine, door, window, terminal, files, states, resources, settings, agents) and one module per phase below; compiles at specDepth 1.0"
    proof: "test-substrate-spec compiles it with every module at full depth"
  CP1_the_machine_and_its_door:
    status: OPEN
    depends_on: [CP0_the_full_spec, LM6_cos_runs_loom_in_its_compartment]
    supersedes: [CE1_the_compartment_machine, CE1a_cos_answers_on_a_route, CE2_the_shell_is_declared, CE3_the_handshake, CON8_nexus_server_hook]
    files: [cos/host, cos/compartment, cos/manager/server.js]
    interface: [route]
    does: "every compartment's machine (process or VM), behind its wall, declared shell, reached only through its server.js and its interaction contract, the handshake verifying both; COS answers it on a route (DO6 does this for each Nexus system)"
    proof: "a fixture compartment and a Nexus system each started walled, their handshake from their contract, reached only by their door"
  CP2_the_window:
    status: OPEN
    depends_on: [CP1_the_machine_and_its_door, MG29_the_cockpit, MG_D19_only_compartments_have_a_control_panel]
    supersedes: [MG31_the_compartment_window, MG9_the_console_ui, MG14_live_thumbnails, MG27_state_and_resource_screens]
    files: [cos/ui/window, cos/ui/cockpit, cos/app/main.js]
    interface: [html]
    does: >-
      The compartment's control panel, its one window (pop-out, VMware-like): toolbar (power, pause, restart, snapshot, rewind, versions,
      settings, deploy an agent), its screen (its own UI, or its desktop), its controls generated from its contract, and a tab for each phase
      below as it lands (Terminal, Files, Code, States, Resources, Settings, Agents, with MG29's Logs, Events, API, Data, Tests); its live
      thumbnail is its tile on COS's canvas.
    proof: "in Clear Glass: a window opened from a tile; its contract's routes as controls, one run; toolbar acts on COS's ledger; a new compartment gets its window with no new UI code"
  CP3_one_terminal_one_cli:
    status: OPEN
    depends_on: [CP1_the_machine_and_its_door]
    supersedes: [CON1_one_door_client, CON2_grammar_and_completion, CON3_system_controls, CON4_safety_gate, CON5_pane, CON6_shell_escape, CON7_enterprise_bar, CON9_configure, CE4_the_terminal_bridge, MG13_cli_in_the_exe]
    files: [cos/app/console, idearium/cli/route-commands.js]
    interface: [cli, html]
    does: "one command line: the system-wide CLI in COS (every row of the one command table, the grammar, completion, the person-only gate, the audit trail) and the same CLI as each compartment's Terminal tab, scoped to it, with its shell inside where it has one"
    proof: "a row run from COS's CLI and from a compartment's tab gives the same result; a person-only row refused to an agent; every command on the audit trail"
  CP4_files_and_code:
    status: OPEN
    depends_on: [CP1_the_machine_and_its_door, CP2_the_window]
    supersedes: [CE5_the_guest_file_tree, CE6_the_code_tab]
    files: [cos/compartment, cos/ui/window]
    interface: [html, route]
    does: "the compartment's files (its tree, read and write through its door) and its code open in the one document editor (BC2)"
    proof: "a file read, edited and saved inside a walled compartment, through its door, the change in Versionium"
  CP5_states_rewind_versions:
    status: OPEN
    depends_on: [CP1_the_machine_and_its_door]
    supersedes: [CS1_a_version_is_a_system_state, MG3_the_state_manager, SN0_one_branch, SN1_open_a_snapshot_as_a_compartment, SN2_run_in_parallel, SN3_measured_by_rfr2, SN4_benchmarks_teach, MG26_branch_benchmark_merge]
    files: [cos/manager, cos/workspace, versionium]
    interface: [route, html]
    does: "every compartment's states on one timeline: checkpoint, rewind, pause and resume, versions (Versionium), branch, run a branch beside it, benchmark (RFR2), merge after friction testing"
    proof: "a compartment checkpointed, changed, rewound to the checkpoint; a branch run beside it, benchmarked, merged; each step on the timeline and the ledger"
  CP6_resources:
    status: OPEN
    depends_on: [CP1_the_machine_and_its_door]
    supersedes: [MG4_resources_per_compartment, MG23_allocation_and_balance, MG24_network_manager, MG25_storage_manager]
    files: [cos/manager, cos/services]
    interface: [route, html]
    does: "every compartment's caps (memory, CPU) set and read back, allocation and balance by RAID, its virtual networks and storage locations"
    proof: "a cap set and read back from the OS; a load balanced across two compartments by RAID; a network bridged and a storage location added"
  CP7_settings:
    status: OPEN
    depends_on: [CP1_the_machine_and_its_door]
    supersedes: [MG6_settings_by_template_and_type]
    files: [cos/manager, "*/settings"]
    interface: [route, html]
    does: "every compartment's settings at its root (BC_D6), resolved by layer (default, template, type, his), each value saying its layer, edited from its window and recorded in Versionium"
    proof: "a setting changed from the window, its layer shown, read back by the compartment through its door"
  CP8_agents_in_the_compartment:
    status: OPEN
    depends_on: [CP1_the_machine_and_its_door, CP3_one_terminal_one_cli]
    supersedes: [CE7_agents_and_commands]
    files: [cos/manager, guardian]
    interface: [route, html, cli]
    does: "an agent deployed into any compartment: diagnose, test, diagnose again, as Idearium's pipeline does for a repo; a module found broken fixed and replaced in place while the rest runs; each fix held as a proposal for him (MG-006); built on the agents' control panel and orchestrator automation, not beside them"
    proof: "an agent deployed into a fixture compartment finds a broken module, its fix proposed, taken, the module replaced in place, the compartment never stopped"

  CP9_cos_and_idearium_one_link:
    status: OPEN
    depends_on: [CP1_the_machine_and_its_door, CP_D1_cos_and_idearium_one_link, EAS3_emerge_at_the_top_of_nexus]
    supersedes: [CS9_every_project_a_compartment]
    files: [cos/host/index.js, cos/manager/server.js, idearium/repo/index.js, idearium/api/index.js, idearium/repo/nexus-self.js]
    interface: [route, html]
    does: >-
      Compartment → repo: COS announces each compartment created, nested, renamed or destroyed (its host already emits them; it posts them to
      Idearium's route), and Idearium ingests a repo for it (ingest's parent = the parent compartment's repo, compartmentId set, files from the
      compartment's project folder), renames it, or archives it. Repo → compartment: every import and every new specced project gets its
      compartment under its repo's id (CS9's half). One link, checked both ways: no compartment without its repo, no repo with a compartmentId
      that COS does not hold. Emerge's compartment (EAS3) is the first to appear in Idearium by itself.
    proof: "a compartment made in COS appears in Idearium as a repo under its parent's repo within one event; destroyed, the repo is archived; an Idearium import gets its compartment; the check over both lists finds nothing missing; Emerge appears nested with its files"

build_order: "CP0 → CP1 → (CP9, with EAS3) → CP2 → (CP3, CP5, CP6, CP7) → CP4, CP8. The open canvas (MG_D18) and Add → Build (BC4) sit on CP2."
