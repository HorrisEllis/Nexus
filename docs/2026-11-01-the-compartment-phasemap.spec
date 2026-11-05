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
  CP_D2_the_miniworld_is_the_meta_layer:
    status: DECIDED 2026-11-01 (his; the reading of .cos as the miniworld's node to confirm)
    chosen: >-
      COS runs entire systems as miniworlds: the miniworld is the meta layer above the spec and the repo and the compartments, one per
      system, holding all of it (its spec, its repo at a commit, its compartments, its states). It is how he runs counterfactuals, mental
      simulations: fork a miniworld, change something in the fork, run it beside the original, compare, keep or discard. Each system is a
      model in his head, so each is its own folder, nice and tidy. Read as (the coder's, to confirm): a system's <name>.cos node is its
      miniworld's node — what his IDEARIUM.spec Miniworld Manager names ("each miniworld is a .nex file opened as a COS compartment
      sandbox", list | boot | fork | snapshot | discard) and the COS spine map's open question (c), "the miniworld as the .cos archive",
      answered by his "use .cos … look for the miniworlds" the same day. Emerge's emerge/emerge.cos is the first.
    by: "his, 2026-11-01: \"i want cos to use miniworlds for entire systems. one layer above the spec/repo. miniworld is the meta layer for compartments. its how i run counterfactuals, or mental simulations. each system in my head is a model. thats why each system is its own folder. i like it nic eand tidy.\""
    by_the_axioms: "§0.3 (a fork never touches what it came from; a discard archives), §10.3 (one miniworld per system, not a second record of it), §5.15 (each system's folder its own)"
  CP_D3_the_miniworld_is_the_compartment:
    status: DECIDED 2026-11-01 (his; supersedes the coder's reading in CP_D2, which is kept)
    chosen: >-
      A miniworld and a COS compartment are the same thing; COS is the orchestrator. There is no layer above: the compartment, whole (CP_D0),
      is the miniworld, and a counterfactual is a forked compartment run beside its original (CP10). The coder had read the .cos node as a
      layer above the spec and repo (CP_D2); that reading is superseded here. The .cos node stays the compartment's node.
    by: "his, 2026-11-01: \"the miniworld would be the same as the cos compartments. basically cos is the orchatrator.\""
  CP_D4_the_diagnostic_map_on_the_eravos_canvas:
    status: DECIDED 2026-11-01 (his)
    chosen: >-
      CFR and RFR2 seen as one visual diagnostic map of the whole system on the ERAVOS canvas (cos/archetype/eravos-canvas): each compartment
      a node, each real wire an edge, the tension (CFR's field, sigma) and the friction (RFR2's bottlenecks, the FrictionScore) drawn on them,
      and the real events moving along the edges as they happen — nothing drawn that did not happen. It is the view of the causal-interconnect
      map's CI5 (another session's map, read, not superseded); it supersedes the TV UI's Nerve channel (lib/ui/tv-shell/nerve), whose
      snapshot route 404s (TV audit 2026-11-01), kept and archived when this is built.
    by: "his, 2026-11-01: \"I want cfr and rfr2 as a visual diagnostic map of the system, the tension and friction, showing real data moving through the system. using the eravos canvas.\""
  # ── ADDENDUM 2026-11-01 (CP_D5–CP_D8) — James: "continue moving the rest of the systems into cos. then i want resource management for
  # each cos compartment, and snapsjot" · later the same day, his boot logs pasted: "also can you add the nexus-sync options to the control
  # panel". The census and the evidence are in the phases addendum below (CP1a).
  CP_D5_every_system_into_cos:
    status: DECIDED 2026-11-01 (his)
    chosen: >-
      Every process COS boots runs in its compartment, behind its wall, started by COS's supervisor (LM6's way). A system with ways still
      open out is walled in audit mode, so the wall says on COS's ledger what it would refuse; enforce when the audit is empty (DO_D9). Each
      system declares its own wall in its own compartment.json, equal to the census's boundaryFor; COS reads those files and never writes them.
    by: "his, 2026-11-01: \"continue moving the rest of the systems into cos.\" (DO_D9, his the same day: \"isolated and sandboxed\")"
    by_the_axioms: "§5.9/§5.15 (each declaration is the system's own; COS reads it), §0.0 (audit is said as audit, never called isolation), §1.2 (every crossing a ledger line)"
  CP_D6_resources_per_compartment:
    status: DECIDED 2026-11-01 (his; the enforcement split is decided by his axioms)
    chosen: >-
      Each compartment has caps (heap memory, a resident-memory limit with an act, CPU priority), set in three layers (COS's default, the
      system's declaration, his) and read back from the OS. The OS enforces the heap cap (V8 --max-old-space-size at spawn) and the CPU
      priority (os.setPriority, read back with os.getPriority). Without a native job object it cannot hard-cap resident memory or a CPU
      share, so COS watches resident memory each sample and acts as he set (warn, or restart by rule), and says that CPU share is not
      enforced. Under the halt floor COS stops nothing by itself: it holds a proposal to stop the lowest-priority, largest compartment, for
      him. Accounting is a ring of samples per compartment (resident MB, CPU %), with peaks and averages.
    by: "his, 2026-11-01: \"then i want resource management for each cos compartment\" (BC_D3, his the same day: \"once each system is in cos, we can have resource management per system\")"
    by_the_axioms: "§0.0 and ResourceAllocation's own error path (a part the OS cannot enforce is not-enforced, said), §5.2/§9.1 (acts on a system are a person's or his rule's; COS proposes), §2.3 (all state observable)"
  CP_D7_snapshots_per_compartment:
    status: DECIDED 2026-11-01 (his; what a snapshot holds is the coder's reading, to confirm)
    chosen: >-
      A compartment's snapshot is its state: its data folder (compartment.json data.dataDir), with every file's bytes, taken by COS's own
      SnapshotEngine (cos/foundation/snapshot.js), which now keeps the bytes content-addressed beside its manifest. Its code is already
      versioned by git and Versionium. Restore stops the system, takes a snapshot of now first, archives every file it replaces or removes
      (§0.3), writes the snapshot's files, and starts the system again if it was running. Take and restore are recorded in Versionium.
      The coder's reading, to confirm: COS reading a compartment's state folder to snapshot it is the compartment's manager doing its job
      (CP_D0: a compartment's states are the compartment's), not one system reaching into another's files.
    by: "his, 2026-11-01: \"and snapsjot\""
    by_the_axioms: "§0.3 (restore archives, never deletes), REVERSIBILITY (a snapshot before every restore), §17.12 (recorded), §8.6 (COS's SnapshotEngine extended, not a second engine)"
  CP_D8_the_nexus_sync_in_the_panel:
    status: DECIDED 2026-11-01 (his)
    chosen: >-
      The Nexus repo sync's options (on or off, how often, the first run after boot, the free-memory floor it waits for, the systems left
      out) are Idearium's. Idearium keeps them (idearium/repo/nexus-self-settings.js, each value saying its layer: default, environment, his)
      and serves them on its routes. COS's control panel shows and edits them through COS's manager, which asks Idearium's route and never
      reads its files. The panel also shows what each system's part of the last sync cost.
    by: "his, 2026-11-01: \"also can you add the nexus-sync options to the control panel\""
    by_the_axioms: "§5.15 (Idearium owns its sync; COS asks its route), BC_D6 (each value with its layer), §17.12 (a change of them recorded)"
  CP_D9_the_whole_sandbox_per_system:
    status: "DECIDED 2026-11-01 (his ask; the default tier and the first build his, below)"
    his_choices: >-
      2026-11-01, asked which tier is the default for his systems (process with the machine opt-in, recommended by the coder; a machine for
      every system; a machine for the ones he names): "Process, VM opt-in". Asked what to build first (the menu, pause and snapshots,
      recommended; the network switch and throttle; cores and disk; recording and rewind): "Menu + pause + snapshots". Order: CP5b (pause,
      backend) → CP5a (snapshots) → CP2 (the menu for every system).
    correction: >-
      James, 2026-11-01, the coder having asked both: "axioms 3.1 are law." Both were the axioms' to settle, not problems for him: the order is
      §3.1 (bottom-up, foundation first) and §3.4 (raw → library → API → CLI → UI), so pause and snapshots before the menu; the default tier is
      §0.5 (complexity earns its existence) with §0.1's evidence (0.2% free memory), so the process tier, the machine tier opt-in. His answers
      match what they decide. Asking was the coder's error, recorded (§17.3); the next decision of this kind is taken by the axioms and cited.
    james: >-
      "like im saying setting threads/cores, memory/ram, hard drive space, sandboxed, system state hooked into controls, the entire sandbox is
      rewindable/pausable/recordable/branchable/parraelel and benchmarked, using deltas inbetween events, state recording, orchastration, all of
      cos features that exist in relation to the systems, also network switch and throttling. full snapshot system and menu for every system."
    context: >-
      Said after 0.60.361 (RAID gates COS's restarts) and the coder's report that per-compartment resources were caps, priority and accounting.
      He is naming the whole of it: every system a sandbox with all of COS's controls, and its state a timeline that can be paused, rewound,
      branched, run in parallel and measured.
    chosen: >-
      Every system gets one control surface, its menu, over two tiers of sandbox that share it:
        process tier (what Nexus's systems run in now, light): the OS process with COS's wall;
        machine tier (opt-in per compartment, heavy): the QEMU machine COS already runs for desktops (qemu-runtime.js, vm-control.js).
      Each control says, per tier, enforced / watched / not-enforced, with why (§0.0, CP-003). The timeline is one model for both tiers:
      a snapshot (state at a point, content-addressed, CP_D7) plus the deltas between events (each event's changes, recorded as they happen),
      so rewind = nearest snapshot + deltas replayed to the moment; branch = a new compartment from that moment; parallel = branches running
      at once on their own ports and data; benchmark = each branch's account (CP6a) and timings, compared.
    by_the_axioms: >-
      §0.0 and CP-003 (what the OS cannot enforce is said, never claimed); §8.6 (the QEMU runtime, vm-control, SnapshotEngine, the wall,
      resources.js and the event taxonomy reused, not rebuilt); REVERSIBILITY (rewind and branch never lose the present: a snapshot first);
      §0.3; §17.12 (snapshots and branches recorded in Versionium); §9.1 (acts by rule through RAID, CP6b); resource evidence: his machine at
      0.2% free memory on 2026-11-01 — the reason the process tier is the coder's recommended default and the machine tier opt-in. To confirm.
    capabilities: |
      control              process tier (now)                                   machine tier (QEMU)                    phase
      cores / threads      not set (affinity: Windows ProcessorAffinity,        -smp: BUILT                            CP6c
                           Linux taskset — to build)
      memory / RAM         heap cap at spawn BUILT; resident watched + act       -m: BUILT                              CP6a done
                           BUILT (no hard cap without a job object, said)
      disk space           none (no per-folder quota without admin: watched     qemu-img size: BUILT                   CP6d
                           + act, said)
      sandboxed            the require wall BUILT (CP1a); fs/net not walled      full machine isolation: BUILT          CP6e
      network switch       none (the wall can refuse net/http/dgram inside       QMP set_link: BUILT                    CP6e
                           the process; outside it needs a firewall rule)
      throttling           none (socket wrapper in the wall: bytes/s)           netdev/block_set_io_throttle: to build CP6e
      state → controls     the cockpit reads the supervisor; no per-system menu  vm-control on the desktop page          CP2
      pause / resume       none (Linux SIGSTOP/SIGCONT; Windows suspend via      QMP stop/cont: BUILT                   CP5b
                           NtSuspendProcess — to build)
      snapshot             SnapshotEngine BUILT; per compartment OPEN (CP5a)     savevm / qemu-img: BUILT               CP5a
      record (deltas)      the event log and ledgers exist; per-compartment      the same, plus checkpoints            CP5c
                           delta stream not built
      rewind               none                                                  loadvm: BUILT                          CP5d
      branch               none                                                  qcow2 overlay on a backing file: to build CP5d
      parallel             none                                                  overlays side by side: to build        CP5e
      benchmark            CP6a's account per compartment BUILT; comparison     the same                               CP5f
                           across branches not built
      orchestration        tasks and pipelines (OC1, PL) BUILT; target a        the same                               OC4
                           compartment: OC4 open
      menu for every system none                                                 —                                      CP2
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
    expanded_2026_11_05: >-
      James, 2026-11-05: "i was thinking we could use cos as a project management tool, have each compartment a idearium compartment. make it
      an option when importing a system. i want this to hold my projects." Expanded (his rule: phases expand), no code yet: CP9's one link is
      the base (every compartment its Idearium repo, both ways); his addition is COS as where his projects live and are managed, and, when a
      system is imported, a choice to make its compartment an Idearium compartment too. Settled 2026-11-05, asked with three choices (on by default, ask each time, off by default): "Ask each time" (the import form asks every time, no default). Files to add when
      built: cos/ui (the import form's option), cos/manager/add-system (the option carried), idearium/repo (the ingest under the compartment).

  CP10_miniworlds:
    status: OPEN
    depends_on: [CP_D2_the_miniworld_is_the_meta_layer, CP1_the_machine_and_its_door, CP5_states_rewind_versions, CP9_cos_and_idearium_one_link]
    files: [cos/miniworld, "*/<name>.cos", cos/manager/server.js, cos/manager/contract.json, idearium/cli/route-commands.js]
    interface: [route, cli, html]
    does: >-
      A miniworld per system, its .cos node the meta layer (spec, repo at a commit, compartments, states). COS: miniworld list | boot | fork
      | snapshot | discard, his Miniworld Manager. A counterfactual: fork a miniworld (a copy-on-write copy of its folder, or a new qcow2
      overlay for a machine), change it, run the fork beside the original behind its own wall, compare them (their ledgers, their tests,
      RFR2's measure), then keep (merge) or discard (archived). The fork shows in Idearium as a branch of the system's repo.
    proof: "Emerge's miniworld forked, a change made in the fork, both run side by side, the comparison shown, the fork discarded, the original untouched byte for byte (its lock)"

  CP11_the_diagnostic_map:
    status: OPEN
    depends_on: [CP_D4_the_diagnostic_map_on_the_eravos_canvas, CI1_one_feed, CI3_the_measures_chained, CP1_the_machine_and_its_door]
    files: [cos/ui/map, cos/archetype/eravos-canvas, intelligence/cfr, intelligence/rfr2, cos/manager/server.js]
    interface: [html, route]
    does: >-
      The map, on the ERAVOS canvas, opened from COS: compartments as nodes (their state from COS's supervisor), wires as edges (Loom's
      registry), CFR's sigma as each node's tension, RFR2's bottlenecks and friction as each edge's weight, the event stream (COS's bus,
      the ledger fan-in) as pulses travelling the edges; a node or edge opened shows its numbers, its causal chain (CI2) and its compartment
      window (CP2). Read through each system's door: Intelligence's routes for CFR and RFR2, COS's for the compartments.
    proof: "in Clear Glass, on the running stack: a restart in COS shows as a pulse on its edges and a sigma rise on its node; a forced slow route shows as friction on its edge; every number on the map equals its owner's route at that time"

  # ── ADDENDUM 2026-11-01 (CP1a, CP6a, CP5a, CP7a) — the parts of CP1, CP6, CP5 and CP7 that can be built now, not second copies of them.
  # Census the same day (cos/manager/supervisor.js readDeclarations, 0.60.354): 14 processes declared, 2 behind a wall (loom, emerge), 12
  # bare (architect, clear-glass, copilot, cortex, diagnostic, guardian, idearium, intelligence, intelligence-consumer, ollama-bridge,
  # orchestrator, versionium). Ways out (compartmentFor's sovereignty): loom 0, ollama 0, every other system 3–31. His boot logs the same day:
  # free memory down to 0.2%; cortex's memory_pressure in FAILURE_MODE; Ollama's GPU out of memory; Idearium's nexus-self sync 211 s for
  # 11,455 files (core 58.9 MB); Versionium silent 165 s at boot. Measured here: wmic is not on his Windows 11 (26200), so
  # cos/manager/usage.js read no system's memory on his machine ("wmic did not answer").
  CP1a_every_system_walled_by_cos:
    status: DONE 0.60.355 — test-cos-walls CW-01..05 (the real Ollama bridge behind its enforcing wall; a real Electron main walled through NODE_OPTIONS)
    spec: cos/spec/compartment.spec
    blocks: [MOD-CP-WALLS]
    depends_on: [CP_D5_every_system_into_cos, LM6_cos_runs_loom_in_its_compartment, DO_D9_registry_then_cos_through_the_door]
    files: [scripts/cos-walls.js, cos/manager/walls.js, cos/manager/supervisor.js, cos/manager/server.js, cos/manager/contract.json, loom/templates/cos-compartment.js, architect/compartment.json, clear-glass/compartment.json, copilot/compartment.json, cortex/compartment.json, diagnostic/compartment.json, guardian/compartment.json, idearium/compartment.json, intelligence/compartment.json, ollama/compartment.json, orchestrator/compartment.json, versionium/compartment.json, idearium/cli/route-commands.js, cos/ui/overview/page.js, loom/maps/cos-testenv-map.js, tests/modules/test-cos-walls.test.js, tests/modules/test-cos-supervisor.test.js, tests/modules/run-all.js]
    does: >-
      Each remaining system's compartment.json declares its compartment (nexus-self-<system>) and its wall, equal to boundaryFor: mode
      enforce where the system has no way out (ollama), audit elsewhere. COS's supervisor starts each one behind it; Clear Glass (Electron)
      through NODE_OPTIONS. walls.js reports per system its mode, the crossings its audit has said since its last start, and whether it is
      ready for enforce. Route GET /api/cos/walls; row `cos walls`; the Overview card says walled or audit.
    proof: "every declared process walled, each wall equal to boundaryFor; an audit wall lets a crossing through and ledgers it; the real Ollama bridge starts behind an enforcing wall and answers /health"
  CP6a_caps_priority_accounting:
    status: DONE 0.60.356 — test-cos-resources CR-01..05
    spec: cos/spec/compartment.spec
    blocks: [MOD-CP-USAGE, MOD-CP-RESOURCES]
    depends_on: [CP1a_every_system_walled_by_cos, CP_D6_resources_per_compartment]
    files: [cos/manager/resources.js, cos/manager/usage.js, cos/manager/supervisor.js, cos/manager/server.js, cos/manager/contract.json, cos/ui/cockpit/page.js, cos/ui/cockpit/sections/resources, cos/manager/proposals.js, loom/maps/cos-testenv-map.js, idearium/cli/route-commands.js, tests/modules/test-cos-resources.test.js, tests/modules/run-all.js]
    does: >-
      caps(name) and setCaps(name, patch, { by }), with layers and read-back. The heap cap is applied at spawn; the priority is applied and
      read back at spawn and on change. Usage is read on Windows without wmic (PowerShell Get-Process, then tasklist). A ring of samples per
      compartment. Resident memory over its limit gives a ledger line and the act he set; the host under the halt floor gives a proposal to
      stop the lowest-priority, largest compartment. Routes GET /api/cos/resources and GET|PATCH /api/cos/systems/:name/caps; rows
      `cos resources` and `cos caps`; the cockpit's Resources tab.
    proof: "a fixture compartment's priority set and read back from the OS; its heap cap on its command line; a resident limit crossed gives the ledger line and a restart; the halt floor gives one proposal; usage reads a real pid on this Windows"
    expanded_2026_11_05: >-
      James, 2026-11-05: "need that resource manager". The coder proposed the first step (a Resources page: priority, memory limit, start at
      boot, applied right away; RAID balancing after); his answer: "yes". Found first: CP6a had built the backend (caps by layer, read back)
      and only a key/value form per system in its cockpit, and the Resources page stood in the contract's planned list. Expanded (his rule:
      phases expand): one page for every system — what it uses now, its priority (low, below-normal, normal; applied at once, read back from
      the OS), its memory limit (heapMB, at its next start), a restart above a resident limit (rssLimitMB, onOver restart, RAID-approved by
      CP6b), and Start at boot (BT1's start.autostart). On the main rail; the contract's page moved from planned to built.
    files_added: [cos/ui/resources/index.html, cos/ui/resources/page.js, cos/ui/resources/page.css, cos/ui/shell/page.js, cos/manager/contract.json, tests/modules/test-cos-resources-page.test.js, tests/modules/run-all.js]
  CP6b_raid_approves_what_cos_does_by_rule:
    status: "DONE 0.60.361 — test-cos-resources CR-06, CR-07"
    spec: cos/spec/compartment.spec
    blocks: [MOD-CP-RAID-GATE]
    depends_on: [CP6a_caps_priority_accounting]
    files: [cos/manager/resources.js, cos/spec/compartment.spec, tests/modules/test-cos-resources.test.js]
    does: >-
      James, 2026-11-01: "cos backend, and hooking into idearium and raid. cos resource manager per compartment". CP6's "allocation and balance
      by RAID", its first part: what COS's resource manager does by rule on a compartment (restart over its resident limit) is RAID's to approve
      (§9.1, §5.2), through lib/raid-port.js (fails closed). Approved → on the ledger, then done; refused or unanswered → not done, the reason on
      the ledger. Proposals held for him are not gated (USER_AUTONOMY). Still open of CP6: RAID balancing load across compartments, networks,
      storage. The Idearium half of his ask is CP9 (depends on CP1, open).
    proof: "CR-06 approved → restarted with 'raid-approved'; CR-07 refused/unreachable → not restarted, 'raid-refused' with the reason"

  CP6c_cores:
    status: OPEN
    spec: cos/spec/compartment.spec
    blocks: [MOD-CP-CORES]
    depends_on: [CP6a_caps_priority_accounting, CP_D9_the_whole_sandbox_per_system]
    files: [cos/manager/resources.js, cos/manager/usage.js]
    does: "a compartment's cores: process tier sets its CPU affinity (Windows ProcessorAffinity, Linux taskset) and reads it back; machine tier its -smp. A caps key, by layer, like heap and priority"
    proof: "a fixture pinned to one core and read back from the OS"
  CP6d_disk:
    status: OPEN
    spec: cos/spec/compartment.spec
    blocks: [MOD-CP-DISK]
    depends_on: [CP6a_caps_priority_accounting, CP_D9_the_whole_sandbox_per_system]
    files: [cos/manager/resources.js, cos/manager/usage.js]
    does: "a compartment's disk: the size of its data folder in its account; a limit watched with an act (warn, or a proposal), said watched not enforced on the process tier; the machine tier's disk size"
    proof: "a fixture's folder over its limit gives the ledger line and the proposal"
  CP6e_network_switch_and_throttle:
    status: OPEN
    spec: cos/spec/compartment.spec
    blocks: [MOD-CP-NETWORK]
    depends_on: [CP1a_every_system_walled_by_cos, CP_D9_the_whole_sandbox_per_system]
    files: [cos/compartment/boundary.js, cos/manager/walls.js, cos/compartment/qemu-runtime.js]
    does: "a compartment's network on, off (loopback only) or throttled (bytes/s): process tier in its wall (net, http, https, dgram refused or wrapped), machine tier by QMP set_link and the netdev throttle; switched live from its menu; each change by a person or RAID's rule, recorded"
    proof: "a fixture refused outbound when off; its throughput under the throttle; switched back live"
  CP6f_raid_balances_load:
    status: "OPEN — mapped 2026-11-05; his reading settled the same day: balance the machine (below)"
    spec: cos/spec/compartment.spec
    blocks: [MOD-CP-RESOURCES]
    depends_on: [CP6a_caps_priority_accounting, CP6b_raid_approves_what_cos_does_by_rule]
    files: [cos/manager/resources.js, cos/manager/usage.js, cos/manager/supervisor.js, lib/raid-port.js, cos/manager/contract.json, cos/ui/resources/page.js, tests/modules/test-cos-resources.test.js]
    requires: [node, "COS's manager up (:7799)", "RAID reachable through lib/raid-port.js (fails closed)"]
    prerequisites: ["usage sampled per compartment (CP6a's ring)", "his reading settled: balance the machine (2026-11-05)"]
    # James, 2026-11-05: "map: once commited and released. build the load balancer." Written as CP6's own part (his rule: phases expand):
    # CP6b's record says "Still open of CP6: RAID balancing load across compartments", and CS11 says RAID "is the load balancer".
    # Settled 2026-11-05, asked with both readings side by side: "Balance the machine" — reading (a). (b) stays CS11's, not this phase's.
  # The two readings that were put to him:
    #   (a) balance the machine: under load, RAID shifts what compartments get (priority, memory limit, which waits), proposed or by rule;
    #       CP6's proof: "a load balanced across two compartments by RAID".
    #   (b) balance the work: of two compartments that can do the same job, RAID sends it to the less loaded one; CS11's proof: "of two fit
    #       agents the less loaded is chosen and said".
    does: "RAID balances load across compartments, reading CP6a's usage, every act on the ledger and approved by rule (CP6b); the reading is his"
    proof: "two fixture compartments under a synthetic load: RAID's balance act is the one his reading names, on the ledger, read back"
  CP5b_pause_resume:
    status: "DONE 0.60.362 — test-cos-pause PA-01..04 on Linux (SIGSTOP/SIGCONT, real process trees). The Windows path (NtSuspendProcess through PowerShell) is written and UNPROVEN until it runs on his machine (§1.1); the screen is CP2"
    spec: cos/spec/compartment.spec
    blocks: [MOD-CP-SUSPEND, MOD-CP-PAUSE]
    depends_on: [CP1a_every_system_walled_by_cos, CP6b_raid_approves_what_cos_does_by_rule, CP_D9_the_whole_sandbox_per_system]
    files: [cos/manager/suspend.js, cos/manager/supervisor.js, cos/manager/server.js, cos/manager/contract.json, idearium/cli/route-commands.js, tests/modules/test-cos-pause.test.js]
    does: "pause and resume a compartment: Linux SIGSTOP/SIGCONT, Windows suspend/resume of the process tree, the machine tier QMP stop/cont; its state 'paused' on the ledger and the screen; the watchdog does not count a paused system as dead"
    proof: "a fixture paused stops beating, is not restarted, resumes where it was"
  CP5c_recording_the_deltas:
    status: OPEN
    spec: cos/spec/compartment.spec
    blocks: [MOD-CP-DELTAS]
    depends_on: [CP5a_snapshots_per_compartment]
    files: [cos/manager, cos/foundation/snapshot.js]
    does: "between snapshots, each event's changes to a compartment's state folder kept as a delta (path, before hash, after bytes), tied to the event that made it (the event taxonomy); recording on/off per compartment"
    proof: "three events on a fixture give three deltas that, applied to the first snapshot, give the last state exactly"
  CP5d_rewind_and_branch:
    status: OPEN
    spec: cos/spec/compartment.spec
    blocks: [MOD-CP-REWIND]
    depends_on: [CP5c_recording_the_deltas]
    files: [cos/manager, cos/compartment/qemu-runtime.js, cos/workspace/vm-control.js]
    does: "rewind to any recorded moment (nearest snapshot + deltas; a snapshot of now first, nothing lost); branch: a new compartment from that moment, its own data and ports; the machine tier by qcow2 overlays"
    proof: "a fixture rewound to its second event matches that state byte for byte; a branch runs beside the original"
  CP5e_parallel:
    status: OPEN
    spec: cos/spec/compartment.spec
    blocks: [MOD-CP-PARALLEL]
    depends_on: [CP5d_rewind_and_branch]
    files: [cos/manager]
    does: "several branches of one compartment running at once, each with its own ports, data and caps; under memory pressure RAID decides which wait (CP6b's gate)"
    proof: "two branches of a fixture run at once without sharing a port or a file"
  CP5f_benchmark:
    status: OPEN
    spec: cos/spec/compartment.spec
    blocks: [MOD-CP-BENCHMARK]
    depends_on: [CP5e_parallel]
    files: [cos/manager]
    does: "branches compared: each one's account (memory, CPU, disk, network) and the timing of the same task, side by side, kept as a record"
    proof: "two branches given one task give a comparison with both accounts and timings"
  CP5a_snapshots_per_compartment:
    status: OPEN
    spec: cos/spec/compartment.spec
    blocks: [MOD-CP-SNAPSHOTS]
    depends_on: [CP1a_every_system_walled_by_cos, CP_D7_snapshots_per_compartment]
    files: [cos/foundation/snapshot.js, cos/manager/snapshots.js, cos/manager/supervisor.js, cos/manager/server.js, cos/manager/contract.json, cos/ui/cockpit/sections/snapshot, idearium/cli/route-commands.js, tests/modules/test-cos-snapshots.test.js, tests/modules/run-all.js]
    does: >-
      take(name, { label, by }), list(name) and restore(name, snapId, { by }) over each compartment's data folder, through SnapshotEngine
      (includeContents, restoreFiles, a store folder of its own). Restore stops the system, snapshots now, archives, writes, and restarts.
      Each take and restore is recorded in Versionium (lib/versionium-record.js). Routes GET|POST /api/cos/systems/:name/snapshots and
      POST /api/cos/systems/:name/snapshots/:id/restore; row `cos snapshot`; the cockpit's Snapshot tab, no longer "not built yet".
    proof: "a fixture compartment snapshotted, its data changed, restored: every byte back, the replaced and added files in the archive, the safety snapshot listed, the system running again"
  CP7a_the_nexus_sync_options:
    status: OPEN
    spec: cos/spec/compartment.spec
    blocks: [MOD-CP-NEXUS-SYNC]
    depends_on: [CP_D8_the_nexus_sync_in_the_panel, MG29_the_cockpit]
    files: [idearium/repo/nexus-self-settings.js, idearium/api/index.js, cos/manager/nexus-sync.js, cos/manager/server.js, cos/manager/contract.json, cos/ui/cockpit/page.js, cos/ui/cockpit/sections/sync, idearium/cli/route-commands.js, tests/modules/test-nexus-sync-settings.test.js, tests/modules/run-all.js]
    does: >-
      Idearium keeps the sync's options (auto, everyMin, firstAfterSec, minFreePct, exclude) by layer, and applies them on its next tick:
      the interval is re-armed on a change and excluded systems are left out. It serves GET|PATCH /api/nexus-self/settings with the last
      sync's timing. COS's manager asks it (GET|PATCH /api/cos/nexus-sync, POST /api/cos/nexus-sync/run). The cockpit's Sync tab shows the
      options and this system's part of the last sync, and leaves the system in or out. Rows `cos sync` and `cos sync set`.
    proof: "a setting changed through COS's route lands in Idearium's file with its layer and is read back; an excluded system is left out of the next sync's set; Idearium down → the tab says so"

build_order: "CP0 → CP1 → (CP9, with EAS3) → CP2 → (CP3, CP5, CP6, CP7) → CP4, CP8. The open canvas (MG_D18) and Add → Build (BC4) sit on CP2."
# ADDENDUM 2026-11-01 — build order of the parts: CP1a → (CP6a, CP5a) ; CP7a stands alone (on MG29).

# ── ADDENDUM 2026-11-01 (CP3a) — his agent CLI, a mode per agent, live from every system's command nodes ─────────────────────────────────
# James, 2026-11-01: "what if we create a cli, literally for the agents to use, a mode made for each of them, dynamic, and spectific in relation
# to them. give them as much power as possible. connects to each system using the commands, then each command index for each systems database
# that the server.js uses with the command nodes. that way it updates when any of the systems do." Rule: architecture-spec THE_AGENT_CLI.
phases_addendum_cp3a:
  CP3a_the_agent_cli:
    status: OPEN
    depends_on: [CP3_one_terminal_one_cli, PD1_procedure_nodes_and_commands]
    files: [cos/archetype/nexus-system/server.js, cos/archetype/nexus-system/lib/commands.js, lib/agent-tools/tools/nexus/command.js, idearium/cli/route-commands.js, docs/command-index-per-system.spec]
    does: >-
      Genesis serves GET /commands from its command nodes; every running system's /commands is merged live with the one table; each agent's
      mode is that set filtered by its hat's scope, personOnly rows held for him. Copilot's update already runs as procedure update-nexus (PD1).
    proof: "a command node added to a running system appears in an agent's mode without a restart of that agent; a personOnly row is held"
