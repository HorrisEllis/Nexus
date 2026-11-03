spec:

  # cos-console.spec — moved out of cos/spec/cos-manager.spec on 2026-11-03 (SC8, docs/2026-11-02-cos-console-phasemap.spec): the coder's modules of
  # 0.60.379–0.60.382, at full depth, each dependency an interface below. Format: emerge's module spec, compiled by kg-builder at specDepth 1.0.

  meta:
    name:        cos-console
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-11-03T00:00:00Z
    status:      built
    uuid:        nexus-cos-console-spec-v1-0000-2026-1103-jamesbrooks-001
    origin: >-
      James, 2026-11-02: "Also have a notification bell for update, system status,  notications" · "Need the system cli. Need configuration for each system. ... Percent or gbs. Ports and network settings." · "an add system in the proposal section, or just in the general homepage" · "A gear, with update settings and Build that update section in cos. With a gear". Map: docs/2026-11-02-cos-console-phasemap.spec.
    purpose: >-
      COS's console: the bell, each system's configuration, adding a system, COS's own command line, the Updates section.

  schemas:

    - id: SupervisedSystem
      name: SupervisedSystem
      description: "One system as the supervisor sees it: one row of /status and of the Overview page."
      fields:
        name:         "string — the system's name, from its compartment.json"
        compartment:  "string — cos.compartmentId"
        state:        "'declared'|'starting'|'up'|'degraded'|'down'|'circuit-open'|'idle'|'stopped'|'undeclared'"
        pid:          "number|null"
        port:         "number|null — runtime.port"
        healthUrl:    "string|null — runtime.healthUrl"
        health:       "{ ok: bool, ms: number, at: number, error?: string }|null — the last check"
        critical:     "bool — runtime.critical"
        bootPhase:    "number|null — runtime.bootPhase (autopilot's `phase`); null = on demand"
        onDemand:     "bool — runtime.onDemand; started by a request (spawn, touch), stopped after idleMs"
        restarts:     "{ count: number, last: number|null, backoffMs: number }"
        circuit:      "{ open: bool, openedAt: number|null, why: string|null }"
        usage:        "{ memoryMB: number|null, cpuPercent: number|null, at: number } — read by cos/watchdog/proc-stats.js"
        caps:         "object|null — CompartmentCaps (cos-spine.spec) when set"
        startedAt:    "number|null"
        by:           "string — who started it: person | rule:<id> | boot"
      behavioral_contracts: ["the /status shape autopilot serves is a projection of this (MG-003)", "usage is read back from the OS, never estimated"]
      error_paths: ["proc-stats cannot read a process → usage fields null with why, never 0"]

  interfaces:

    - id: IF-SUPERVISOR
      name: supervisor
      path: cos/manager/supervisor.js
      description: "COS's one supervisor (cos-manager.spec MOD-MG-SUPERVISOR): declarations, spawn, its ledger, its hooks."
      exports: ["createSupervisor(opts) → { list, get, start, stop, restart, boot, note, ledger, declarations, setHooks, declare, effective, root }"]
      behavioral_contracts: ["every act a ledger line before it happens"]
      error_paths: ["no such system → throws, named"]

    - id: IF-UPDATES
      name: updates
      path: cos/manager/updates.js
      description: "Nexus's update, per system, as COS's (CE2): check, apply, rollback, settings, history."
      exports: ["createUpdates(sup, { root, emit }) → { check, apply, rollback, settings, setSettings, history, busy, perSystem }"]
      behavioral_contracts: ["one update at a time; each changed system restarted through the supervisor"]
      error_paths: ["an update running → refused, said"]

    - id: IF-RESOURCES
      name: resources
      path: cos/manager/resources.js
      description: "Each compartment's caps by layer, read back from the OS (CP6a)."
      exports: ["createResources(sup, opts) → { caps, setCaps, all, sample, history }"]
      behavioral_contracts: ["what the OS cannot enforce is said"]
      error_paths: ["a cap the OS refuses → failed with its error"]

    - id: IF-PROPOSALS
      name: proposals
      path: cos/manager/proposals.js
      description: "Held acts (MG18): an agent's, taken or dropped by a person; kinds registered (add-system)."
      exports: ["createProposals(sup) → { hold, list, take, drop, register }"]
      behavioral_contracts: ["every hold, take and drop on the ledger"]
      error_paths: ["no such proposal → 404; already closed → 409"]

    - id: IF-UI-SHELL
      name: ui-shell
      path: cos/ui/shell/page.js
      description: "COS's shell (cos-manager.spec MOD-MG-UI-SHELL): the frame, the event stream, confirm, the gear, the bell."
      exports: ["the shell page and its frames; postMessage cos.confirm, cos.emit, cos.key"]
      behavioral_contracts: ["pages act only through routes their contract declares"]
      error_paths: ["an undeclared route or event → refused, said"]

  modules:

    - id: MOD-MG-NOTICES
      name: notices
      uuid: nexus-cos-manager-notices-v1-0000-2026-1102-001
      path: cos/manager/notices.js
      phase: SC1_the_bell
      description: "COS's bell: kept notices (update, system, notice; info, warn, error), read and unread, newest 300 in COS's data; a keyed notice told once."
      deps: [{ name: supervisor }, { name: updates }]
      schema_refs: [SupervisedSystem]
      exports: ["createNotices({ file, keep, emit }) → { add, list({ unread, kind, limit }), read({ ids | all }), counts(), fromLedger(entry), fromUpdate(ev), fromNotice(n) }", "routes GET /api/cos/notices, POST /api/cos/notices/read; event cos.notice; row `cos notices`"]
      gate_pipeline: ["GATE-SC1-001: a keyed notice is told once", "GATE-SC1-002: his own proposal is not news to him"]
      behavioral_contracts: ["crash, circuit-open, refused, over-limit, no-restart, health, raid-refused, restart-failed → system; proposal-held (an agent's), declared → notice; the update check's notice and the update tool's steps → update"]
      error_paths: ["the store unwritable → kept in memory, said nowhere silent: the bell still counts"]
      acceptance: ["a crash is one unread error; read all clears; one update version told once (test-cos-console CC-04)"]

    - id: MOD-MG-SYSTEM-CONFIG
      name: system-config
      uuid: nexus-cos-manager-system-config-v1-0000-2026-1102-001
      path: cos/manager/system-config.js
      phase: SC2_configuration_per_system
      description: "Every system's configuration by layer (declared → his, in COS's data), with each setting's source and how it applies; units free (percent, GB, MB, cores, Mbps); applied through the supervisor's adjust hook and resources.js's caps."
      deps: [{ name: supervisor }, { name: resources }]
      schema_refs: [SupervisedSystem]
      exports: ["createSystemConfig(sup, { resources, file, totalMB, cores }) → { get(name), set(name, patch, { by }), clear(name, keys, { by }), adjust(decl), watchCpu(), portEnvOf(decl) }", "parse.size | cpu | bandwidth", "routes GET|PATCH /api/cos/systems/:name/config, POST …/config/clear; row `cos config`"]
      gate_pipeline: ["GATE-SC2-001: a person or a rule sets; an agent is refused (403)", "GATE-SC2-002: the ledger line before it applies; Versionium records it", "GATE-SC2-003: nothing shown as applied that the OS does not do"]
      behavioral_contracts: ["memory and priority are the caps (CP6a), not a copy", "a port goes through the env var the system reads (declared, else discovered in its config.js/server.js, else not applied, said)", "network limit and outbound: recorded, not-enforced", "clear returns the declared value"]
      error_paths: ["a unit not understood → 400 naming the form it wants", "an unknown setting → 400 with the list", "COS_BOUNDARY or NODE_OPTIONS → refused (COS's own)"]
      acceptance: ["test-cos-console CC-01..CC-03: units; layers; a real process on his port with his env var; autostart off skipped; restart never left down"]

    - id: MOD-MG-ADD-SYSTEM
      name: add-system
      uuid: nexus-cos-manager-add-system-v1-0000-2026-1102-001
      path: cos/manager/add-system.js
      phase: SC4_add_a_system
      description: "Adding a system: a proposal (add-system); taking it writes <folder>/compartment.json (the system's own declaration, by his act) and declares it live."
      deps: [{ name: supervisor }, { name: proposals }]
      schema_refs: [SupervisedSystem]
      exports: ["createAddSystem(sup, proposals, { root }) → { propose({ name, dir, cmd, args, port, health, by, why }), check }", "route POST /api/cos/systems; `add` in COS's command line"]
      gate_pipeline: ["GATE-SC4-001: his add taken at once; an agent's held", "GATE-SC4-002: never overwrites a declaration"]
      behavioral_contracts: ["nothing starts until he starts it", "found again at COS's next start (readDeclarations)"]
      error_paths: ["name taken or folder already declaring → 409", "folder or entry missing → 404", "a port another system has → 409"]
      acceptance: ["test-cos-console CC-06 and CC-09 (from Overview in Clear Glass)"]

    - id: MOD-MG-CLI
      name: cli
      uuid: nexus-cos-manager-cli-v1-0000-2026-1102-001
      path: cos/manager/cli.js
      phase: SC3_system_command_line
      description: "COS's own command line, run in its manager over its own functions, so it works with every other system down (SC_D5)."
      deps: [{ name: supervisor }, { name: system-config }, { name: notices }, { name: proposals }, { name: add-system }]
      schema_refs: [SupervisedSystem]
      exports: ["createCli({ sup, resources, config, notices, proposals, addSystem, usage }) → { run(line, { by }) → { ok, lines[] }, TABLE }", "routes GET|POST /api/cos/cli; row `cos cli`; the shell's console (Ctrl+`)"]
      gate_pipeline: ["GATE-SC3-001: an agent's act refused (it proposes); reading is anyone's"]
      behavioral_contracts: ["the verbs are the cos.* rows' verbs"]
      error_paths: ["an unknown verb → the table"]
      acceptance: ["test-cos-console CC-05, CC-09"]

    - id: MOD-MG-UI-UPDATES
      name: ui-updates
      uuid: nexus-cos-manager-ui-updates-v1-0000-2026-1102-001
      path: cos/ui/updates/page.js
      phase: SC7_the_updates_section
      description: "Updates, COS's section for Nexus from GitHub, with its settings behind a gear (the shell's top bar opens it at #/updates/settings): the state against GitHub, the systems it changes, his release lines, Update now / Keep mine and update, the history and Roll back."
      deps: [{ name: updates }, { name: ui-shell }]
      schema_refs: [SupervisedSystem]
      exports: ["page updates (#/updates, #/updates/settings)", "routes GET|PATCH /api/cos/update/settings, GET /api/cos/update/history, POST /api/cos/update/rollback (cos/manager/updates.js settings, setSettings, history, rollback)"]
      gate_pipeline: ["GATE-SC7-001: every act confirmed in the shell, by = person", "GATE-SC7-002: settings are the kernel's (lib/nexus-update.js policy), never a copy"]
      behavioral_contracts: ["policy auto | notify | off; everyHours 1–168; keepLocal auto | ask (ask: the automatic tick never keeps local commits by itself)", "the COS exe's own update policy stays in the app, said on the page"]
      error_paths: ["a bad value → 400 naming the range; an agent → 403", "nothing to roll back → 409 with the kernel's reason"]
      acceptance: ["test-cos-console CC-10, CC-11"]

