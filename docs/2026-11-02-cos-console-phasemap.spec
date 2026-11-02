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
    status: "DONE 0.60.379 — test-cos-console CC-04, CC-09"
    depends_on: []
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-NOTICES]
    files: [cos/manager/notices.js (new), cos/manager/server.js, cos/manager/contract.json, tests/modules/test-cos-console.test.js (new), tests/modules/run-all.js]
    does: >-
      Kept notices, read and unread: a system that crashed, opened its circuit, was refused or went over a limit; an update on GitHub (from
      the update check's notice, once per version) and what an update did; a proposal waiting. GET /api/cos/notices, POST /api/cos/notices/read,
      the event cos.notice. Kept in COS's data, newest 300.
    proof: "a crash in a stand-in supervisor's ledger becomes one unread error notice; read clears it; the same update version is told once"

  SC2_configuration_per_system:
    layer: backend
    status: "DONE 0.60.379 — test-cos-console CC-01..CC-03, CC-09"
    depends_on: [SC_D1_units_and_what_the_os_enforces, SC_D2_where_the_configuration_lives, SC_D3_ports_are_announced_not_guessed]
    spec: cos/spec/cos-manager.spec
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
    status: "DONE 0.60.379 — test-cos-console CC-05, CC-09"
    depends_on: [SC_D5_cos_has_its_own_command_line, SC1_the_bell, SC2_configuration_per_system]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-CLI]
    files: [cos/manager/cli.js (new), cos/manager/server.js, cos/manager/contract.json, idearium/cli/route-commands.js, tests/modules/test-cos-console.test.js]
    does: "POST /api/cos/cli { line, by } → { ok, lines[] }: COS's table over its own functions; help lists it. Rows cos.config and cos.notices for agents."
    proof: "ps, config <system> memory.limit=25%, notices, help answer; an unknown verb says the table"

  SC4_add_a_system:
    layer: backend
    status: "DONE 0.60.379 — test-cos-console CC-06, CC-09"
    depends_on: [SC_D4_adding_a_system_is_a_proposal]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-ADD-SYSTEM]
    files: [cos/manager/add-system.js (new), cos/manager/supervisor.js, cos/manager/server.js, cos/manager/contract.json, tests/modules/test-cos-console.test.js]
    does: "POST /api/cos/systems { name, dir, cmd, args, port, health, by } → a proposal (kind add-system); taking it writes <dir>/compartment.json and declares it live (supervisor.declare)"
    proof: "in a fixture root: proposal held; taken → the file written, the system listed and startable; an existing declaration refused"

  SC5_the_console_ui:
    layer: ui
    status: "DONE 0.60.379 — test-cos-console CC-09 (Clear Glass); the borderless window unverified on Windows"
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
    status: "DONE 0.60.379 — test-cos-console CC-07; test-cos-supervisor SV-08 (13 declared + emerge − intelligence-consumer)"
    depends_on: [SC_D0_one_intelligence]
    spec: intelligence/spec/intelligence.spec
    blocks: [MOD-INTELLIGENCE-CONSUMER]
    files: [intelligence/server.js, intelligence/compartment.json, lib/nexus-update.js, tests/modules/test-cos-console.test.js]
    does: "server.js starts and stops the consumer in-process; the second declaration retired (runtime.retiredProcesses); the update's restart plan names one kernel"
    proof: "the supervisor's declarations hold one intelligence process; server.js starts the consumer; nexus-update's plan for intelligence/ is [intelligence]"

# ── ADDENDUM 2026-11-02 (0.60.379) — built; what building found ──
# All six phases built. Found while building, each fixed in its phase and said: cos/ui/serve.js compared a write's origin with the port it was
# asked for, so a cockpit started on port 0 refused every write (now the port it listens on); the shell's Ctrl+K and the new Ctrl+` never reached
# the shell while a page's frame had focus (pages now pass them up); Clear Glass's driver could not press a key combination ("Control+`" was one
# key) and its Enter did not submit a form (no "\r"): both fixed in clear-glass/src/driver/glass.js; the first Clear Glass shots showed the
# console and the bell's panel still on screen when hidden (display:flex outranked [hidden]) and `ps` printing [object Object] for restarts.
# Two tests counted the real tree's processes as 14; with intelligence-consumer retired it is 13 (SV-08, CW-01 updated, the reason in each).
# Readings TO CONFIRM: "miniworld" as each system's compartment; "It'll be using the .spec" (SC_D0).
