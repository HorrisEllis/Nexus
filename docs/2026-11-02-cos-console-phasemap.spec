# docs/2026-11-02-cos-console-phasemap.spec
# COS's console: a bell for updates, system status and notices; every system's configuration (memory, CPU and network as a percent or in GB,
# ports, network settings, environment, start, wall), set in COS and applied by its supervisor; adding a system; a command line in COS's window;
# Intelligence as one system. MAPPED 2026-11-02, before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec.
# Stands on (reuse before build, §8.6): cos/manager/supervisor.js (declarations, spawn, its hooks heapMB and spawned, the ledger and its bus),
# cos/manager/resources.js (CP6a caps: heapMB, rssLimitMB, onOver, priority, read back from the OS), cos/manager/usage.js (memory and CPU per
# process), cos/manager/proposals.js (held acts), cos/manager/updates.js (CE2), lib/nexus-update.js notice(), cos/ui/shell (the cockpit), the
# cos.* command rows in idearium/cli/route-commands.js, each system's compartment.json or <name>.cos (its declaration).

origin:
  date: 2026-11-02
  james: '"Okay. Push. Also have a notification bell for update, system status,  notications" · "There shouldn''t be two intelligence. Intelligence consumer and intelligence should not be two separate things. It''ll be using the .spec. Also needs to be an add system in the proposal section, or just in the general homepage. Need the system cli. Need configuration for each system. Hooks into the config for each miniworld, set ram, cpu and network limits. Percent or gbs. Ports and network settings. All the settings like idearium has for the repos. All relevant configuration settings"'
  context: >-
    Said after 0.60.376–0.60.378 were merged (PR #229). COS's cockpit already starts, stops and restarts systems and sets caps (heap MB,
    resident limit MB, on-over, priority: CP6a) but only in MB, with no CPU or network limit, no port, no environment, no start settings. Its
    notices are toasts that vanish; nothing keeps them. Adding a system is a planned page (MG21, waiting on MG20). COS's command line exists
    only in a terminal (cos/cli, and the cos.* rows through Idearium). Intelligence is declared as two processes: intelligence (server.js) and
    intelligence-consumer (consumer.js, its queue's input half), started and restarted separately.

census:
  caps: "cos/manager/resources.js: heapMB (enforced at spawn), rssLimitMB (watched; onOver warn|restart), priority (enforced, read back); cpuShare not-enforced"
  spawn: "supervisor.spawnNow: env = process.env + decl.env + the wall's; hooks.heapMB(decl), hooks.spawned(name, pid)"
  ports: "each system reads its own port from an env var in its config.js (INTELLIGENCE_PORT, LOOM_PORT, VERSIONIUM_PORT, OLLAMA_BRIDGE_PORT, GUARDIAN_HTTP_PORT …); declarations carry healthUrl with the port"
  notices: "cos.ledger and cos.system.state events, toasts in the shell (notices), the update popup (UP9/CE4); nothing kept, nothing unread"
  intelligence: "intelligence/compartment.json runtime.process (server.js, :3753) + runtime.processes[intelligence-consumer] (consumer.js, phase 4, optional); consumer.js exports start/stop"

decisions:

  SC_D0_one_intelligence:
    status: "DECIDED 2026-11-02 by his words; '.spec' read by the coder, TO CONFIRM"
    james: '"There shouldn''t be two intelligence. Intelligence consumer and intelligence should not be two separate things. It''ll be using the .spec."'
    chosen: >-
      One system, one process: intelligence/server.js starts its queue consumer in-process (consumer.start()) when it listens, and stops it
      when it closes. The second declaration is retired from compartment.json (kept under runtime.retiredProcesses, §0.3). Restart, caps and
      the update's restart plan see one system. "It'll be using the .spec" is read as: the one system is described by its one spec
      (intelligence/spec/intelligence.spec), the consumer as a module of it, not as a second system; if he meant the queue's contracts become
      .spec files, that is a further phase, to confirm.
    by: "his words; §5.9 (one system, one owner), §8.6 (consumer.start already exists)"

  SC_D1_units_and_what_the_os_enforces:
    status: DECIDED 2026-11-02 by his axioms
    chosen: >-
      Every limit takes a percent of the host or a size: memory "25%", "2GB", "1536MB"; CPU "50%" of the host or "2 cores"; network "100Mbps",
      "10MB/s" or a percent of the link. Each setting says what it is applied as and how: memory → the heap at spawn (enforced) and the
      resident limit (watched; warn or restart, CP6a); CPU → the OS priority (enforced) plus a watched limit over the usage samples (over →
      warn or restart); network → recorded and NOT ENFORCED (Node cannot cap a process's bandwidth; that needs the Windows service's job
      objects or a firewall rule, CE5), said on every reading, never shown as applied.
    by: "his axioms, applied by the coder: §1.2 (nothing claimed that is not done), §0.1 (read back from the OS), TRUTH_OVER_COHERENCE"

  SC_D2_where_the_configuration_lives:
    status: DECIDED 2026-11-02 by his axioms
    chosen: >-
      Layers, as caps already are: the system's own declaration (its compartment.json / .cos: port, healthUrl, phase, env, wall) → his
      overrides in COS's own store (cos/data/manager/systems.json, COS's data, never committed). COS never writes into a system's folder to
      change its settings (§5.15: placing a thing in a system's folder makes that system its owner). Each change is recorded in Versionium
      (lib/versionium-record.js record(), §17.12) and written to the ledger before it applies (§9.2).
    by: "§5.9, §5.15, §9.2, §17.12, REVERSIBILITY (clearing an override returns the declared value)"

  SC_D3_ports_are_announced_not_guessed:
    status: DECIDED 2026-11-02 by his axioms
    chosen: >-
      A port is set through the env var the system reads it from. COS finds that var in the system's config.js (discovered, by name) or takes
      it from the declaration (portEnv, declared); with neither, the port is not applied and the reason is said. A new port applies at the next
      start; the health URL follows it. Other systems that hard-code the old port are not changed, and the reading says so.
    by: "NC0's evidence rule (discovered, declared or unknown), §1.2"

  SC_D4_adding_a_system_is_a_proposal:
    status: DECIDED 2026-11-02 by his axioms; where it shows is his ("in the proposal section, or just in the general homepage")
    chosen: >-
      Add system is on the homepage (Overview) and in Proposals. It makes a proposal (kind add-system: name, folder, command, port, health
      path), held like an agent's act. Taking it writes the new system's declaration into its own folder as <name>/compartment.json (the
      system's own file, made by its owner's act: his), and the supervisor declares it without a restart. A folder that already declares
      itself is refused, said. From a person the proposal can be taken in the same click (USER_AUTONOMY); from an agent it waits for him.
    by: "§9.1 (RAID and him: the write authority), §5.15, USER_AUTONOMY"

  SC_D5_cos_has_its_own_command_line:
    status: DECIDED 2026-11-02 by his axioms
    chosen: >-
      A command line in COS's window runs COS's own table (cos/manager/cli.js) over the manager's own functions: ps, start, stop, restart,
      logs, caps, config, notices, proposals, add, help. Not Idearium's table through Idearium: with Idearium down, COS's console must still
      work (§5.9: one system going down breaks no other). The same verbs as the cos.* command rows, so a person and an agent say the same thing.
    by: "§5.9, §5.10 (the contract names it), COS-2 (CLI first)"

phases:

  SC1_the_bell:
    layer: backend
    status: "DONE 0.60.380 — test-cos-console CC-04, CC-09"
    depends_on: []
    spec: cos/spec/cos-console.spec
    blocks: [MOD-MG-NOTICES]
    files: [cos/manager/notices.js (new), cos/manager/server.js, cos/manager/contract.json, tests/modules/test-cos-console.test.js (new), tests/modules/run-all.js]
    does: >-
      Kept notices, read and unread: a system that crashed, opened its circuit, was refused or went over a limit; an update on GitHub (from
      the update check's notice, once per version) and what an update did; a proposal waiting. GET /api/cos/notices, POST /api/cos/notices/read,
      the event cos.notice. Kept in COS's data, newest 300.
    proof: "a crash in a stand-in supervisor's ledger becomes one unread error notice; read clears it; the same update version is told once"

  SC2_configuration_per_system:
    layer: backend
    status: "DONE 0.60.380 — test-cos-console CC-01..CC-03, CC-09"
    depends_on: [SC_D1_units_and_what_the_os_enforces, SC_D2_where_the_configuration_lives, SC_D3_ports_are_announced_not_guessed]
    spec: cos/spec/cos-console.spec
    blocks: [MOD-MG-SYSTEM-CONFIG]
    files: [cos/manager/system-config.js (new), cos/manager/supervisor.js, cos/manager/resources.js, cos/manager/server.js, cos/manager/contract.json, tests/modules/test-cos-console.test.js]
    does: >-
      GET /api/cos/systems/:name/config → every setting with its value, where it came from (declared, his, default), when it applies (now,
      next start) and how (enforced, watched, not enforced, with why). PATCH sets his overrides (validated, units parsed), DELETE a key returns
      it to the declared value. Groups: resources (memory heap and limit, on-over; CPU priority, limit), network (port, port env, bind host,
      bandwidth limit, outbound), start (autostart, phase, on demand, restart on crash), environment (extra env vars), wall (audit or enforce).
      The supervisor reads them at spawn through one hook (adjust(decl)); resources.js takes memory and priority from them through its caps.
    proof: "25% of a 16 GB host → 4096 MB; '2 cores' on 8 → 25%; a port set → the env var at the next spawn and the health URL; network said not enforced; a bad unit refused"

  SC3_system_command_line:
    layer: backend
    status: "DONE 0.60.380 — test-cos-console CC-05, CC-09"
    depends_on: [SC_D5_cos_has_its_own_command_line, SC1_the_bell, SC2_configuration_per_system]
    spec: cos/spec/cos-console.spec
    blocks: [MOD-MG-CLI]
    files: [cos/manager/cli.js (new), cos/manager/server.js, cos/manager/contract.json, idearium/cli/route-commands.js, tests/modules/test-cos-console.test.js]
    does: "POST /api/cos/cli { line, by } → { ok, lines[] }: COS's table over its own functions; help lists it. Rows cos.config and cos.notices for agents."
    proof: "ps, config <system> memory.limit=25%, notices, help answer; an unknown verb says the table"

  SC4_add_a_system:
    layer: backend
    status: "DONE 0.60.380 — test-cos-console CC-06, CC-09"
    depends_on: [SC_D4_adding_a_system_is_a_proposal]
    spec: cos/spec/cos-console.spec
    blocks: [MOD-MG-ADD-SYSTEM]
    files: [cos/manager/add-system.js (new), cos/manager/supervisor.js, cos/manager/server.js, cos/manager/contract.json, tests/modules/test-cos-console.test.js]
    does: "POST /api/cos/systems { name, dir, cmd, args, port, health, by } → a proposal (kind add-system); taking it writes <dir>/compartment.json and declares it live (supervisor.declare)"
    proof: "in a fixture root: proposal held; taken → the file written, the system listed and startable; an existing declaration refused"

  SC5_the_console_ui:
    layer: ui
    status: "DONE 0.60.380 — test-cos-console CC-09 (Clear Glass); the borderless window unverified on Windows"
    depends_on: [SC1_the_bell, SC2_configuration_per_system, SC3_system_command_line, SC4_add_a_system]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-UI-SHELL]
    files: [cos/ui/shell/index.html, cos/ui/shell/page.js, cos/ui/shell/page.css, cos/ui/shell/console.js (new), cos/ui/cockpit/sections/config (new), cos/ui/overview/page.js, cos/ui/proposals/page.js, tests/modules/test-cos-console.test.js]
    does: >-
      The bell in the top bar (unread count; a panel: Updates, Systems, Notices; mark read; the update's own tool opens from its notice). A
      system's Configuration in the cockpit (each group a form, units free, what applies when and how said beside each). Add system on
      Overview and in Proposals. A command line (the bell's neighbour, and Ctrl+`), its output kept for the session.
    proof: "driven in Clear Glass against a stand-in manager: the bell counts and clears; a config field saved and read back; Add system makes a proposal; the CLI answers ps"

  SC6_one_intelligence:
    layer: backend
    status: "DONE 0.60.380 — test-cos-console CC-07; test-cos-supervisor SV-08 (13 declared + emerge − intelligence-consumer)"
    depends_on: [SC_D0_one_intelligence]
    spec: intelligence/spec/intelligence.spec
    blocks: [MOD-INTELLIGENCE-CONSUMER]
    files: [intelligence/server.js, intelligence/compartment.json, lib/nexus-update.js, tests/modules/test-cos-console.test.js]
    does: "server.js starts and stops the consumer in-process; the second declaration retired (runtime.retiredProcesses); the update's restart plan names one kernel"
    proof: "the supervisor's declarations hold one intelligence process; server.js starts the consumer; nexus-update's plan for intelligence/ is [intelligence]"

# ── ADDENDUM 2026-11-02 (0.60.380) — built; what building found ──
# All six phases built. Found while building, each fixed in its phase and said: cos/ui/serve.js compared a write's origin with the port it was
# asked for, so a cockpit started on port 0 refused every write (now the port it listens on); the shell's Ctrl+K and the new Ctrl+` never reached
# the shell while a page's frame had focus (pages now pass them up); Clear Glass's driver could not press a key combination ("Control+`" was one
# key) and its Enter did not submit a form (no "\r"): both fixed in clear-glass/src/driver/glass.js; the first Clear Glass shots showed the
# console and the bell's panel still on screen when hidden (display:flex outranked [hidden]) and `ps` printing [object Object] for restarts.
# Two tests counted the real tree's processes as 14; with intelligence-consumer retired it is 13 (SV-08, CW-01 updated, the reason in each).
# Readings TO CONFIRM: "miniworld" as each system's compartment; "It'll be using the .spec" (SC_D0).

# ── ADDENDUM 2026-11-02 — "A gear, with update settings and Build that update section in cos. With a gear" (SC7) ──
phases_addendum_2026_11_02_sc7:
  SC7_the_updates_section:
    layer: ui
    status: "DONE 0.60.381 — test-cos-console CC-10, CC-11 (Clear Glass); found: a page opened while the shell loaded its contract never showed (the stage cleared, its frame kept) — fixed in cos/ui/shell/page.js"
    depends_on: [SC1_the_bell, SC5_the_console_ui]
    spec: cos/spec/cos-console.spec
    blocks: [MOD-MG-UI-UPDATES]
    files: [lib/nexus-update.js, cos/manager/updates.js, cos/manager/update-run.js, cos/manager/server.js, cos/manager/contract.json, cos/ui/updates/index.html (new), cos/ui/updates/page.css (new), cos/ui/updates/page.js (new), cos/ui/shell/index.html, cos/ui/shell/console.js, cos/ui/shell/page.js, cos/ui/core/core.js, idearium/api/index.js, idearium/cli/route-commands.js, tests/modules/test-cos-console.test.js]
    origin: '"A gear, with update settings and Build that update section in cos. With a gear" (James, 2026-11-02)'
    does: >-
      A gear in COS's top bar opens Updates, a section of its own (its own .html, in the rail): this Nexus against GitHub (current, latest,
      behind, last check, Check now), his release lines and each system the update changes (restarts by itself / waits for you), Update now
      and Keep mine and update (confirmed), the history of every update, keep-local and rollback, with Roll back on the last one. The gear's
      panel holds the update settings the kernel already keeps (lib/nexus-update.js policy: auto | notify | off, every N hours) and one new
      one, keep mine automatically (auto, the CE3 behaviour; or ask). GET|PATCH /api/cos/update/settings, GET /api/cos/update/history,
      POST /api/cos/update/rollback (in its own process, then each changed system restarted, as apply). The COS app's own exe update policy
      lives in the app (its tray), not here: said on the page.
    proof: "settings round-trip and refusal; history lists the update; the page in Clear Glass: the gear opens it, a setting saved and read back"

# ── ADDENDUM 2026-11-03 — SC8: the coder's modules at full depth (a fix, phased first) ──────────────────────────────────────────────────
# Found 2026-11-03 while updating genesis and the architecture spec (0.60.386): test-substrate-spec SS-01/SS-02 have failed since 0.60.380.
# The coder added seven modules (MOD-MG-NOTICES, -SYSTEM-CONFIG, -ADD-SYSTEM, -CLI, -UI-UPDATES, MOD-COS-DISK, -VDISK) to cos/spec/cos-manager.spec,
# which is tied to the cos-manager map, while their phases are in this map and the disk map; three depended on names the spec never declares
# (updates, proposals, tar). The check that would have caught it was not run after those releases — drift, the coder's.
phases_addendum_2026_11_03_sc8:
  SC8_the_specs_at_full_depth:
    layer: spec
    status: "DONE 0.60.387 — test-substrate-spec 3/3 with cos-console.spec and cos-disk.spec listed"
    depends_on: [SC7_the_updates_section, DK7_snapshots_inside_the_disk]
    files: [cos/spec/cos-console.spec (new), cos/spec/cos-disk.spec (new), cos/spec/cos-manager.spec, tests/modules/test-substrate-spec.test.js]
    does: >-
      The seven modules move whole (§0.3) into two specs of their own, each declaring what they stand on as interfaces (supervisor, updates,
      resources, proposals, ui-shell; tar, qemu-runtime) so every dependency resolves at full depth. Their phase tie is not checked (map: null,
      as compartment.spec and nexus-update.spec): this map holds another system's phase (SC6, Intelligence's), and tying them waits for the
      phase cleanup he called for.
    proof: "test-substrate-spec SS-01..03 green with both specs listed"

# ── ADDENDUM 2026-11-04 — the zip dropzone updater and his zip history, in the Updates section; the console through RAID is PL_D15 ─────────
# James, 2026-11-04: "okay. cos.exe build. complete build. with the manual zip dropzone updator as a backup/offline update tool. also a drop
# down for my 800 zips for nexus to be tracked and versioned, and diff tracked. there is a tool for this. also cli in cos ui doesn't work. bridge
# not connected. i feed it should route through raid"
# Grounded 2026-11-04 against main 0.60.387 (the coder):
#   - SC7 updates from GitHub only (lib/nexus-update.js). A release zip can be dropped on the old desktop COS (COSA1/COSA6), not on this UI.
#   - "there is a tool for this": lib/cli/import-history.js (N27, BUILT 0.39.282) puts a folder of release zips into git, one snapshot commit
#     per zip on history/snapshots with Zip-Name / Zip-Sha256 / Nexus-Version trailers, resumable; lib/history-import-job.js runs it as a job.
#     Nothing in COS shows it.
#   - "route through raid" is mapped already: PL_D15 (docs/2026-11-03-registry-per-system-phasemap.spec), with his open question there —
#     acts only through RAID, or reads too. Not mapped twice; it waits on his answer.
#   - "bridge not connected": the words are not in cos/, cos/ui or cos/manager/cli.js; where he sees them is asked (§0.1).
phases_addendum_2026_11_04:
  SC11_the_console_tab:
    layer: ui
    status: "BUILT 0.60.398 — test-cos-console-tab"
    origin: >-
      James, 2026-11-05: "next phase. cos needs the console from the autopilot. like a console tab". The retired autopilot
      (lib/nexus/autopilot.retired-0.60.330.js) printed every system's output in one stream, each line timestamped and named
      "[time] [system:file] line", errors in red, and took commands (--cli). COS keeps each system's lines (the supervisor's s.out, LOG_KEEP)
      and has a command line (SC3, the bell's neighbour), but no place shows every system's output together, live.
    depends_on: [SC3_system_command_line, SC5_the_console_ui]
    spec: cos/spec/cos-manager.spec
    files: [cos/manager/supervisor.js, cos/manager/server.js, cos/manager/contract.json, cos/ui/shell/page.js, cos/ui/console/index.html, cos/ui/console/page.js, cos/ui/console/page.css, tests/modules/test-cos-console-tab.test.js, tests/modules/run-all.js]
    does: >-
      Backend: the supervisor says each line a system prints ('line': { system, ts, stream, line }); the manager sends them on its stream as
      cos.console, in batches every 200 ms (a burst past 500 lines says how many it dropped), and GET /api/cos/console?limit=&system= gives the
      last lines of every system merged in time order. UI: a Console tab — every system's output together, newest at the bottom, each line
      with its time and its system (coloured), errors in red; filter by system, errors only, search; follow on/off; and the command line at
      the bottom (POST /api/cos/cli), its answers shown in the stream. Declared in COS's contract (the page, its routes, the event).
    proof: "a system's printed lines reach GET /api/cos/console merged in time order and arrive live as cos.console; in Clear Glass the Console tab shows them with their system, filters to one, and runs a command"
  SC12_start_at_boot_each_system:
    layer: ui
    status: "BUILT 0.60.399 — test-cos-boot-and-deps BD-03, BD-04"
    origin: "James, 2026-11-05: \"also this pc is getting its ass kicked. i need options for what systems start on boot.\""
    depends_on: [SC2_configuration_per_system]
    spec: cos/spec/cos-manager.spec
    files: [cos/ui/automation/index.html, cos/ui/automation/page.js, cos/ui/automation/page.css, cos/manager/contract.json, tests/modules/test-cos-boot-and-deps.test.js]
    does: "Each system's Start at boot (start.autostart, SC2, until now one system's Configuration at a time) in one list on Automation: a switch per system, his, read back; the next boot skips what is off, said."
    proof: "BD-03: switched off through the route, a system is skipped at boot with why; switched on, it starts. BD-04: the list and its routes"
  SC13_dependencies_before_boot:
    layer: backend
    status: "BUILT 0.60.399 — test-cos-boot-and-deps BD-01, BD-02, BD-04"
    origin: "James, 2026-11-05: \"cos also needs to install the dependancies.\""
    depends_on: [SC12_start_at_boot_each_system]
    spec: cos/spec/cos-manager.spec
    files: [cos/manager/deps.js, cos/manager/server.js, tests/modules/test-cos-boot-and-deps.test.js]
    does: >-
      Before --boot starts the systems: no node_modules, or a package-lock.json whose content changed since the last good install (its hash
      kept in node_modules/.cos-deps.json; by time until the first install) → npm install first (npm.cmd quoted, CA6), said on the ledger; a
      failure is said and the boot goes on. --no-deps skips it.
    proof: "BD-01 the cases (a time-only change is not an install); BD-02 the command and no-npm said; BD-04 the boot runs the check first"
  SC14_each_system_opens_in_its_own_window:
    layer: ui
    status: "OPEN — mapped 2026-11-05"
    origin: >-
      James, 2026-11-05: "i want each ui folder for each system to be the envirement. you open. it can be in a popout window for either the
      console for that system or for the ui from the folder."
    depends_on: [SC11_the_console_tab]
    spec: cos/spec/cos-manager.spec
    files: [cos/ui/serve.js, cos/ui/shell/page.js, cos/ui/console/page.js, cos/app/desktop/main.js, cos/manager/contract.json]
    does: >-
      Each system's own ui/ folder is its environment: from its row in the rail, Open (its UI, served from <system>/ui/ through COS's cockpit
      server, only that folder) or Console (the Console tab filtered to it, ?system=), each in its own pop-out window (in the COS app a new
      window; in a browser window.open). A system with no ui/ folder offers Console only, said.
    proof: "a fixture system's ui/index.html opens in a pop-out; its console pop-out shows only its lines; a path outside its ui/ folder is refused"
    expanded_2026_11_06: "his \"i want to be able to access the repos and open the ui from cos also\": beside Open and Console, a Repos entry lists Idearium's repos (asked of Idearium by route, never its files) and opens one in Idearium's own UI in a pop-out"
    files_added: [cos/ui/repos, idearium/api/index.js]
  SC15_nexus_cli_in_the_console:
    layer: backend
    status: "OPEN — mapped 2026-11-05"
    origin: "James, 2026-11-05: \"also look for nexus-cli\""
    found: >-
      (read 2026-11-05) nexus-cli is docs/nexus-cli.spec ("Dynamic CLI runtime. No hardcoded commands. All commands from component registry
      grammar tree."), lib/cli/nexus-cli.js and lib/nexus-cli-interface.js (the retired autopilot's --cli, routing to co-pilot's capabilities,
      awareness, self-model and grammar router). His DO_D10 (2026-11-05): each server.js's CLI is how every UI and co-pilot reach that system.
    depends_on: [SC11_the_console_tab, DO_D10_the_cli_is_the_way_in_for_every_ui_and_copilot]
    spec: cos/spec/cos-manager.spec
    files: [cos/manager/cli.js, cos/ui/console/page.js, docs/nexus-cli.spec]
    does: >-
      The Console's command line, past COS's own table: a line that starts with a system's name goes to that system's door (POST <origin>/cli,
      DO3a's shape; Cortex has it), so the commands come from each system's own registry grammar, as nexus-cli specs. A system with no door yet
      is said, never guessed.
    proof: "`cortex health` in the Console runs through Cortex's door; a system with no /cli says so"
    expanded_2026_11_06: >-
      His "all the systems cli interfaces (command nodes) should be accessable there" and "no more autopilot or orchastrator that should be in the
      console": every system's command nodes in the Console, listed by system (each system's GET /commands or its door's /registry), with
      completion; the orchestrator's commands among them (OC_D5's reading to confirm decides whether they stay the orchestrator's or move to COS).
      Systems still without a door are listed with what is missing (the doors: DO1, DO2, DO5, DO7, DO8).
  SC16_no_console_windows:
    layer: backend
    status: "BUILT 0.60.400 — test-cos-hidden-windows"
    origin: "James, 2026-11-05: \"keeps spamming my screen. any way to have those node.exe windows open in the background?\""
    found: >-
      (read 2026-11-05) COS's supervisor started every system with spawn(cmd, args, { cwd, env, stdio, shell }) and no windowsHide: on Windows,
      a child of a process with no console (COS's window) gets its own console window, one per system, each restart a new one. The COS app's
      own spawns already pass windowsHide (runtime, install, service, shell); the supervisor, its test runner and core-duties did not.
    depends_on: [SC11_the_console_tab]
    spec: cos/spec/cos-manager.spec
    files: [cos/manager/supervisor.js, cos/manager/autopilot-door.js, lib/nexus/core-duties.js, tests/modules/test-cos-hidden-windows.test.js, tests/modules/run-all.js]
    does: "Every process COS starts hides its console window (windowsHide); a windowed system (Electron: Clear Glass) is the one left as it was, so its own window shows. Their output is read in the Console tab (SC11), not in a window."
    proof: "the supervisor passes windowsHide: true for a node system and false for an Electron one; every spawn in the supervisor, the door's test runner and core-duties hides its window"
  SC9_the_zip_dropzone_updater:
    layer: ui
    status: OPEN
    depends_on: [SC7_the_updates_section, COSA1_version_store_and_import]
    spec: cos/spec/cos-console.spec
    files: [cos/manager/updates.js, cos/manager/server.js, cos/ui/updates/page.js, cos/ui/updates/index.html]
    origin: '"with the manual zip dropzone updator as a backup/offline update tool" (James, 2026-11-04)'
    does: >-
      The offline way, in Updates: drop a Nexus release zip (or pick one) → checked like SC7's download (its version, newer or not, its files
      whole, its checksum) → applied through the same apply and rollback as SC7, recorded in Versionium (§17.12). Nothing is downloaded.
    proof: "a fixture zip: refused when broken or not newer, said why; applied, rolled back, in the history"
  SC10_the_zip_history:
    layer: ui
    status: OPEN
    depends_on: [SC7_the_updates_section, N27_history_import_from_700_zips]
    spec: cos/spec/cos-console.spec
    files: [cos/manager/history.js, cos/manager/server.js, cos/ui/updates/page.js]
    origin: '"also a drop down for my 800 zips for nexus to be tracked and versioned, and diff tracked. there is a tool for this" (James, 2026-11-04)'
    does: >-
      In Updates, a dropdown of every imported zip (history/snapshots, read through git): version, zip name, date, sha; picking one shows its
      diff against the one before (files changed, added, removed; a file's lines on a click). "Import a folder of zips" runs import-history as
      a job with its progress; a rerun adds nothing. Each import recorded in Versionium.
    proof: "a fixture folder of three zips: imported once, listed in order, a diff between two shown; in Clear Glass"
build_order_addendum_2026_11_04: "SC9 → SC10; the console through RAID when PL_D15's question is answered"

# ── ADDENDUM 2026-11-05 (0.60.410) — SC16 expanded: the watchdog's PowerShell per system was the window spam ─────────────────────────────
# James, 2026-11-05 (on 0.60.404, which already had SC16): "also getting spammed with command prompt from cos, any way to hide those?"
# Found: cos/watchdog/proc-stats.js read each system's memory and CPU on Windows with one PowerShell per system per tick, without windowsHide
# — 13 systems, 13 console windows a tick, and 13 PowerShell starts of CPU. SC16 hid the systems' own windows, not this. Now one hidden
# PowerShell reads every process, cached 2 s (test-cos-hidden-windows HW-03). Also hidden: cos/services/anonymous/nexus.js's command-line read.
# SC16 files expanded: cos/watchdog/proc-stats.js, cos/services/anonymous/nexus.js.
