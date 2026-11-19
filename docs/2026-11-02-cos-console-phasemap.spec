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

    expanded_2026_11_18_builder: >-
      James, 2026-11-18: "i want to be able to open the ui for each systems defined ui in cos ui. like when adding a system have an option for
      the graphic interface, whether its an exe or html or cli to shape the dependancies for the compartment or system being built or imported.
      i want that system builder ui to add and create compartments in cos ui. then idearium is the backend repo for it. using the spec."
      Readings, the coder's, for him to correct (mapped, not built; a preview first, his rule "Never build without a preview"):
       (1) each system's compartment declares its interface: { kind: html | exe | cli | none, entry } (an html page served by its own
           server.js, an exe it starts, a CLI of commands); COS opens it from the system's card: html in a COS pane, exe started in his session
           (as Clear Glass is), cli in COS's console. The UI stays the system's own and disposable (his "the ui is meant to be disposable").
       (2) the system builder in COS: adding or importing a system asks its interface kind, and the kind shapes the compartment: html needs a
           server.js route and a port, exe a window and his session (never the service's session 0), cli its command rows; the result is the
           compartment.json SC4 already writes, through the same proposal.
       (3) Idearium is its backend: the builder makes the system's spec and its repo in Idearium (the project manager); COS (the system
           manager) declares and runs it. Each new system starts with its own registry-components.js, its drawbridge (SW6), from the spec.
      Order (his): commands, routes, then the UI; the builder's UI only after a preview he approves.
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
    expanded_2026_11_08_settings: >-
      James, 2026-11-08: "also in cos ui, network should move to the settings under a network tab. startup and services tab. none of cos ui should be hardcoded when it comes to compartments.  updates should move to a update tab."
      A Settings page in COS's UI with tabs: Network (CA3's page moves here), Startup and services (BT1's Start at boot and the service options,
      CA4/MG37, move here), Update (this phase's updates section and the Updates page move here). Every list in it is read from COS's routes
      (/api/cos/systems, /api/cos/network, /api/cos/update/*) — no compartment named in the UI's code; the example text that names systems
      (network's "e.g. orchestrator, idearium", the shell's command placeholder) becomes generic. Found 2026-11-08: the UI's logic already reads
      its systems from routes (the updates page's restart asks come from pending.systems); only examples and comments name them. Backend first
      (AE_D6): any route or command a tab needs is added before the tab. Shown to him as a preview before it is built (his rule).
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
    expanded_2026_11_08: >-
      James, 2026-11-08: "also can we have cos.exe run the command prompts in the background?" (a screenshot of an empty "C:\Program
      Files\nodejs\node" window). Found: Clear Glass is declared with cmdCandidates node_modules/.bin/electron; on Windows the supervisor and
      the COS app's desktop starter (cos/app/desktop-systems.js, CA4) took .bin/electron.cmd, which runs `node …\electron\cli.js` in a console
      of its own beside Clear Glass's window. Both now start Electron's own program (electron/dist/electron.exe) when it is there: no shell, no
      console; the launcher only when it is missing. 0.60.460, test-cos-hidden-windows HW-04.
    status: "BUILT 0.60.400 — test-cos-hidden-windows"
    origin: "James, 2026-11-05: \"keeps spamming my screen. any way to have those node.exe windows open in the background?\""
    found: >-
      (read 2026-11-05) COS's supervisor started every system with spawn(cmd, args, { cwd, env, stdio, shell }) and no windowsHide: on Windows,
      a child of a process with no console (COS's window) gets its own console window, one per system, each restart a new one. The COS app's
      own spawns already pass windowsHide (runtime, install, service, shell); the supervisor, its test runner and core-duties did not.
    depends_on: [SC11_the_console_tab]
    spec: cos/spec/cos-manager.spec
    files: [cos/manager/supervisor.js, cos/manager/autopilot-door.js, lib/nexus/core-duties.js, cos/app/desktop-systems.js, tests/modules/test-cos-hidden-windows.test.js, tests/modules/run-all.js]
    does: "Every process COS starts hides its console window (windowsHide); a windowed system (Electron: Clear Glass) is the one left as it was, so its own window shows. Their output is read in the Console tab (SC11), not in a window."
    proof: "the supervisor passes windowsHide: true for a node system and false for an Electron one; every spawn in the supervisor, the door's test runner and core-duties hides its window"
    # ── EXPANDED 2026-11-10 — James, 2026-11-10: "also command prompt spamming my screen over and over is annoying." (with a screenshot of his taskbar)
    # Found the same day: 232 files under cos, idearium, lib, guardian, copilot, cortex, orchestrator and clear-glass/src start processes and
    # never mention windowsHide. Adds: every spawn and exec on Windows hidden (one helper, used everywhere), and a check that refuses a new one
    # without it.
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

# ── ADDENDUM 2026-11-09 (0.60.464) — SC7's Settings built (his "I like the settings") ────────────────────────────────────────────────────────
# James, 2026-11-08, to the Settings preview (cos/ui/settings-preview/): "I like the settings."
phases_addendum_2026_11_09_sc7:
  SC7_the_updates_section:
    status_2026_11_09: "BUILT 0.60.464 (the Settings expansion) — test-cos-settings 3/3 (Clear Glass), test-cos-console 11/11 (CC-11: the gear opens Settings › Update), test-cos-app-window 9/9 (CW-05: the door's seven calls)"
    files_2026_11_09: [cos/ui/settings/index.html (new), cos/ui/settings/page.js (new), cos/ui/settings/page.css (new), cos/ui/startup/index.html (new), cos/ui/startup/page.js (new), cos/ui/startup/page.css (new), cos/ui/core/core.js, cos/ui/updates/page.js, cos/ui/shell/index.html, cos/ui/shell/page.js, cos/manager/contract.json (config), cos/app/window.js, cos/app/desktop/main.js, cos/app/desktop/starting-preload.js, cos/spec/cos-console.spec, tests/modules/test-cos-settings.test.js (new), tests/modules/test-cos-console.test.js, tests/modules/test-cos-app-window.test.js, tests/modules/run-all.js]
    built: >-
      Backend first: the exe names its own startup options (cos/app/window.js STARTUP, its tray menu's words) and its window's door gains startup /
      setStartup, which changes only an option the exe names and re-applies the logon task or the service as the tray does. The contract marks
      Network, Startup and services, Update as nav settings with a tab order; Settings frames them, whole, each keeping its own route. Startup and
      services reads every system from GET /api/cos/systems with its Start at boot. No tab, option or system is named in the pages' code (ST-01).
      core.js now speaks to window.top, so a page inside a Settings tab is answered by the shell itself.
    not_built: "the preview's Boot set row: no such setting exists (what starts at boot is each system's Start at boot); said, not invented. Asked of him if he wants one."

# ── ADDENDUM 2026-11-13 (0.60.514, COS 0.8.0) — SC7 and SC16 reach his exe ──
# James, 2026-11-13: "Can you push and release CLS like as an update? So I could, let's make it a service." (CLS read as COS, the coder's
# reading.) Found: 0.60.460 (SC16, Clear Glass through electron.exe, no console) and 0.60.464 (SC7, Settings › Startup and services, with
# "Run Nexus as a Windows service") changed cos/app/** and left cos/app/version.js at 0.7.1, so the cos-app workflow refused both runs
# ("bump cos/app/version.js") and his exe never got either. COS 0.8.0 is the bump: merged to main, the workflow publishes cos-v0.8.0
# (portable, setup, SHA256SUMS), and 0.7.1's own update check announces it. The service itself is CA4's (COS 0.5.0, NexusCOS through
# nssm.exe); 0.8.0 puts its switch in the cockpit beside the tray's. Also: test-cos-install IN-06 pinned COS to exactly 0.7.0 and failed
# from 0.7.1 on; it now asks for 0.7.0 or later (install.js arrived in 0.7.0). On Windows, unverified until his run.

# ── ADDENDUM 2026-11-13 (0.60.515) — SC16 expanded: the manager's own console, when COS.exe starts Nexus ──
# James, 2026-11-13: "also that node instance needs to run in the taskbar using the service or something. spamming my screen." (two screenshots: an empty "C:\Program Files\nodejs\node.exe" window over the cockpit.)
# Found on his machine, from the running processes: the window was COS's manager, started by lib/nexus/autopilot.js, itself started by COS.exe with
# no console. Autopilot's attached start (stdio inherit) had no windowsHide, so Windows gave the manager a visible console. Also on the restart after
# exit 75 (CE2b) and --legacy-supervisor. All three hidden; HW-02 reads lib/nexus/autopilot.js. His machine had also been running 0.60.391 (COS's
# folder on D: never updated), so no SC16 fix had reached it; updated by hand the same day.
# SC16 files expanded: lib/nexus/autopilot.js. By the axioms: §17.7 (never fix the symptom twice: the test now reads the file), §1.2.
# On his machine: unverified until Nexus restarts on 0.60.515 (said).

# ── ADDENDUM 2026-11-13 (map only, merged 2026-11-14) — SC10 expanded: the floating menu's commands, per system, in the Console ───────────────
# James, 2026-11-13: "also can commands for the console tab. like all of the floating menu commands for each system. like in the tv ui floating
# menu button." Expands SC10 (his 2026-11-06: "all the systems cli interfaces (command nodes) should be accessable there"): the Console lists,
# per system, the same commands the TV UI's floating menu button offers for that system (lib/ui/tv-shell/menu.js), read from each system's own
# registry or door (§5.16), not copied into COS, so both show one list.

# ── ADDENDUM 2026-11-14 (map only) — SC10 expanded: the Console hooks into each system, and each agent ─────────────────────────────────────
# James, 2026-11-14: "thats a problem also the console is supposed to hook into each system, and agent"
# SC10 already owns "every system's commands in the Console, through each system's own door". New here: agents. Which agents, and through what,
# is his to say (SC10_R1): (a) Guardian's agents (its providers and tabs), by Guardian's routes; (b) the co-pilot, by copilot's /api/prompt;
# (c) Ollama's models, by ollama-bridge; (d) all three, each named as a target the Console can address (`@guardian:chatgpt ...`, `@copilot ...`).
# State read 2026-11-14: of the systems, Cortex has a door (DO3a); DO1, DO2, DO5, DO7, DO8 are open, so the Console reaches COS and Cortex today.

# ── ADDENDUM 2026-11-14 (0.60.532) — the Console reaches RAID and the agents; his request goes through RAID; the phase readers read CRLF ──
# James, 2026-11-14: "that pipeline needs to be from the cli into raid or copilot. like integrate this better" (a screenshot of Automation › "His request" held at its first step: "say what you want — the flow starts from your words")
# James, 2026-11-14: "thats a problem also the console in cos, is supposed to hook into each system, and agent. floating menu 3 way cli, nexus-cli, etc."
# "floating menu 3 way cli" read from lib/ui/tv-shell/menu.js: its command line reaches Ollama, the co-pilot or a Guardian agent by copilot's
# /api/prompt. That answers which agents (SC10's question of the same day): those three, by that route.
phases_addendum_2026_11_14_ch:
  CH1_the_console_reaches_raid_and_the_agents:
    status: "BUILT 0.60.532 — test-cos-console 10/10 (CC-12). Against his live copilot and Cortex, and the Automation page's box on his screen: not yet seen by the coder"
    origin: 'James, 2026-11-14: "that pipeline needs to be from the cli into raid or copilot. like integrate this better" · "the console in cos, is supposed to hook into each system, and agent. floating menu 3 way cli, nexus-cli, etc."'
    depends_on: [SC3_system_command_line]
    spec: cos/spec/cos-manager.spec
    files: [cos/manager/cli.js, cos/ui/automation/engine.js, tests/modules/test-cos-console.test.js]
    requires: ["Cortex answering POST /api/raid/input (RD9 slices a, b)", "copilot's /api/prompt; copilot woken by the supervisor's touch"]
    does: >-
      COS's Console: ask [@ollama|@copilot|@guardian[:agent]] <words> (or a line starting with @) asks an agent by the floating menu's own route;
      raid <words> hands his words to RAID (a .input node, a contract, its gaps listed); a line the table does not know goes to RAID as an
      input and is said as such (RD9 slice c, for COS's Console); request <words> reaches RAID first and the run carries the input and
      contract ids, and still runs, said, when RAID does not answer (§5.15). COS reaches Cortex and copilot by their routes, on the ports its
      supervisor holds. The Automation page asks for a value a pipeline declares and leaves empty (its words) before Run starts.
    expanded_2026_11_14: >-
      James, 2026-11-14, after RAID was settled as its own compartment, the hub: "Cos ui needs complete ai assistance though. The only at in to
      nexus". The coder's reading ("at in" as "way in", to confirm): COS's UI is the one way into Nexus, and AI assistance is complete there:
      on every COS page an assistant (copilot, the reasoning agent RAID calls, RD9 decided_2026_11_14_wiring) that sees what is on screen,
      answers, and does anything a person can do in COS, each ask an input to RAID like any other (RD9 slice c). Other surfaces (the Nexus
      CLI, Clear Glass, Idearium) reach Nexus through COS, not beside it. Readings to confirm: (1) "only way in" means every other surface
      routes through COS, not that the others close; (2) "complete" means the assistant can act (run, edit, approve what he allows), not only answer.
    by_the_axioms: "§5.2/§9.1 (routing goes through RAID), §8.6 (the floating menu's route and RAID's input route reused), §5.15 (routes, never files; RAID down breaks no request), §1.2 (what went to RAID, and what did not, is said)"
    not_built: "each system's own commands in the Console (SC10: the doors DO1, DO2, DO5, DO7, DO8); the Nexus CLI's unknown lines to RAID; RAID acting on what it routes (RD9)"
  LE1_phase_readers_accept_crlf:
    status: "BUILT 0.60.532 — on his PC the phase ledger reads 2692 phases in 245 maps (116 in 11 before); test-cos-pipeline CP-15 passes; test-phase-dag 8/8"
    origin: 'Found on his PC, 2026-11-13 and 2026-11-14 (no words of his: a fault found while doing what he asked; §4.2)'
    depends_on: []
    spec: cos/spec/cos-manager.spec
    files: [lib/phase-dag.js, lib/phase-files.js, lib/phasemap-parse.js]
    does: >-
      The three readers of a phase map split lines on \n only; his Windows checkout has \r\n, so every phase line ended in \r and matched
      nothing. They split on \r?\n. Idearium's build pipeline, the DAG and the ledger read his maps whole.
    by_the_axioms: "§4.2 (fix bugs pre-emptively), §17.4 (reproducible from his machine, not only the sandbox's), §17.7"
    not_built: "a .gitattributes that checks text out with LF everywhere (it would also make graph hashes the same on every machine): to phase; two Windows-only test failures (CP-13, PL-06) named in the changelog"
# CH1 confirmed by him, 2026-11-14, from COS's Console on his PC: "console reaches copilot, ollama and gaurdian". The Guardian way was the one the
# coder had not tried (it sends a message to his agent); his run is its proof.

# ── ADDENDUM 2026-11-15 (0.60.546) — SC18: a system's Files tab is its whole folder; its Data tab is its data folders ──
# James, 2026-11-15: "data per system needs to be the data folders, or setup when creating a new system. also the files tab needs to be each
# systems entire compartment backend." Built: GET /api/cos/systems/:name/tree (in=backend|data, read-only, secrets withheld, a path that
# leaves refused); the Files and Data tabs as one browser with a reading pane; the old Data tab archived. Proof: Clear Glass's driver on a real
# COS. Open, his same message: updates automatic or a prompt, with reinstall, verify and location settings; a data folder made when a new
# system is set up.

# ── ADDENDUM 2026-11-15 — SC5 expanded: a model setting is picked from what the system reports, and applied now ──
# James, 2026-11-15: "can you add ollama settings in cos ui? in the system settings? copilot agent." · "why the bridge? update the model. have
# it fallback to guardian." · offered "keep the 3b and save it" or "pull a bigger model": "Keep the 3b, save it" · "pull it if you need one;"
# Read first: the 3b is already saved, by him: COS's config for ollama-bridge holds env OLLAMA_DEFAULT_MODEL =
# huihui_ai/qwen2.5-coder-abliterate:3b (from: his), given to the bridge at every start; Copilot (copilot/lifeline.js) asks the bridge with
# no model, so it uses that one, and falls back to Guardian when Ollama fails, times out or is under 0.75 confidence (already built).
# The bridge's PUT /api/model changes the model in memory only (a restart forgets it): a second truth. No pull is needed (one model,
# the saved one); none was made.
# Built (cos/ui/cockpit/sections/config/section.js, in place): on the Environment tab, a setting named …_MODEL is a picker of the models the
# system itself reports (its own GET /api/models, asked only when it answers one: not tied to Ollama by name); saving keeps it where it was
# (COS's config: the one truth, used at every start), then applies it at once through the system's own PUT /api/model, and says which.
# By the axioms: §8.6 (the saved env, the bridge's routes and the Config tab existed; nothing beside them), §5.10 (the bridge is reached
# only through its routes), §1.2 (a model the system does not have is shown as not installed; a failed apply is said).
# Proof, in his running Clear Glass (CDP :9333; his normal tab, put back on http://127.0.0.1:9000/ after): COS › ollama-bridge ›
# Configuration › Environment shows env.OLLAMA_DEFAULT_MODEL as a SELECT, one option "huihui_ai/qwen2.5-coder-abliterate:3b · running",
# selected; the bridge's PUT /api/model with it answered ok. No change was saved (the one model is already his). Not proved: a save that
# changes the model (only one is installed). Found: the Clear Glass driver (clear-glass/src/driver/glass.js) launches its host, which then
# exits 0 the moment it opens a page, on his machine (also PL-06's "Clear Glass host exited"); not looked into.

# ── ADDENDUM 2026-11-18 — storage: the drives in COS, every location a setting, controlled access to both drives (mapped before code) ──
# James, 2026-11-18, after his C: drive reached 0 GB and was found (by reading, not by COS) to hold Epic Games 78 GB, COS's compartments 17.5 GB,
# Ollama's models 10 GB, the test VM's images 6.8 GB and an Android SDK 4.1 GB: "I deleted some. I really want nexus to be able to do that. cos ui.
# have access to both drives, give controlled access to the system and files." · "cos is supposed to be able to let me change it in the settings
# of cos ui but its absent." (the test VM's folder) · "D is a nas drive." · "D:\COS is the application location"
# Done by hand the same day (said, so the page can do it next time): the SDK moved, not deleted, to D:\Backups\android-sdk\Sdk; C: 0 → 85.5 GB.
# Read first (§8.6): COS's usage reports each drive's free space (0.60.565 usage.host.disk); the test VM's folder is already a setting in code
# (cos/testenv/host.js: COS_TESTENV_HOME, else %LOCALAPPDATA%\nexus\cos-testenv), with no screen; Ollama keeps its own (OLLAMA_MODELS).
  SC19_storage_the_drives_and_what_fills_them:
    status: OPEN
    depends_on: [SC7_the_updates_section]
    files: [cos/manager/usage.js, cos/manager/storage.js, cos/manager/server.js, cos/ui/cockpit/sections/storage, idearium/cli/route-commands.js]
    does: >-
      A Storage page in COS: each drive (free, total, NAS or local), and what fills it by owner: each system's data folder, the compartments,
      the test VM's images, Ollama's models, the caches; measured by COS, said when a folder cannot be read. From there he can move a folder to
      another drive (move, never delete; the old path kept until the move is verified) or clear a cache, each act asked of him and recorded
      (Versionium, §17.12). The same as a route and a command row, so an agent can propose a move that he approves (PC15: an agent's act is a
      proposal). D: is a NAS: a move there is said to be slower to read; images a VM boots from stay on a local drive unless he says.
    proof: "on his machine: the page lists C: and D: with what fills them; a folder moved by the page is found at the new place and gone from the old"
  SC20_every_location_a_setting:
    status: OPEN
    depends_on: [SC19_storage_the_drives_and_what_fills_them]
    files: [cos/ui/cockpit/sections/config, cos/manager/server.js, cos/testenv/host.js, cos/runtime]
    does: >-
      The places Nexus keeps big things are settings in COS's Configuration, each with its owner and what moving it means: the test VM's folder
      (COS_TESTENV_HOME, set by COS for the systems it starts), the compartments' folder, and Ollama's models folder (Ollama's own OLLAMA_MODELS:
      COS says where it is and offers the move, Ollama restarted by him). A setting changed moves nothing silently: it offers the move (SC11).
    proof: "the test VM's folder set in COS, the testenv run from the new place"
  SC21_controlled_access_to_both_drives:
    status: OPEN
    depends_on: [SC19_storage_the_drives_and_what_fills_them]
    files: [cos/manager/server.js, cos/security, cos/manager/contract.json]
    does: >-
      Nexus reaches his files on both drives only through COS: roots he grants (a folder, read or read-write), each grant a setting he can take
      back, every read and write by a system or an agent recorded; outside a grant, refused with the reason (§5.9, sovereignty; the agent's
      reach is his to give). Readings to confirm with him: which roots by default (none, or his Nexus and projects folders), and whether an
      agent's write needs his yes each time or once per grant.
    proof: "a grant made in COS; a read inside it answers, a read outside it is refused with the reason; the record shows both"
# Order (his, standing): the pipeline, Emerge and Ollama building, smarter gates first. These three wait behind IF3 unless he says otherwise.

# ── ADDENDUM 2026-11-18 (0.60.588) — Clear Glass starts from COS again; the Open button mapped (SC4) ──
# James, 2026-11-18: "I need to be able to open idearium. I can't without opening Firefox and I don't want to waste the ram." · "It should be consistent with clearglass or ideariums compartments when they popup."
# Clear Glass starts again from COS: its node_modules\.bin launcher was missing, so neither declared candidate existed and COS (the window and the manager) spawned a bare "electron": "spawn electron ENOENT". Now a candidate's electron.exe (node_modules\electron\dist, present) is used even when its .bin launcher is missing (cos/app/desktop-systems.js, cos/manager/supervisor.js). On his machine the launchers were also written back (node_modules\.bin\electron and electron.cmd, not committed), so the installed COS window starts Clear Glass before its next update. test-cos-service 11/11, test-cos-outlive 11/11, test-cos-hidden-windows 4/4; a fixture with no .bin resolves to electron.exe. Mapped, not built: an Open button on each system in COS that opens its UI in its own Clear Glass compartment (context.create + navigate), consistent with the compartments Idearium and Clear Glass already pop up; a preview first.
