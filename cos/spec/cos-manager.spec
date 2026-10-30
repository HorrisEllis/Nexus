spec:

  # ════════════════════════════════════════════════════════════════════════
  # cos-manager.spec — COS manages the system: the one supervisor (what autopilot does today), the state manager, and the
  # manager UI, "like vmware, but for cos". This is MG0b of docs/2026-10-24-cos-manager-phasemap.spec: the full spec before any MG
  # code (his 2026-10-20 rule). Every MG phase names this spec and the modules it builds in `blocks:`.
  # Format: emerge's module spec (lib/emerge/SPEC_COMPILER.spec), compiled by lib/emerge/compiler/kg-builder.js at specDepth 1.0,
  # no BLACK node (tests/modules/test-substrate-spec.test.js SS-01..03).
  # ════════════════════════════════════════════════════════════════════════

  meta:
    name:        cos-manager
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-30T00:00:00Z
    status:      specced
    uuid:        nexus-cos-manager-spec-v1-0000-2026-1030-jamesbrooks-001
    origin: >-
      James, 2026-10-30: "look at all of the phases for each cos and soveriegn phases. then lets spec the ui for the cos to manage the
      system. This will be the new orchastrator/autopilot." Before it, his words this stands on: 2026-10-23 "Okay, so COS would be the
      spine, right? It would be the orchestrator, right? ... you could spawn and despawn systems when they're needed or not ... Each
      compartment could have individual performance throttling" (cos-spine) · 2026-10-24 "i am thinking of something like vmware, but for
      cos. all backend, cli and api, first, then ui uses cli and api routes, each page is isolated, seperate, all js, html and css are
      seperated and isolated per component and uses the component registry ... hook into the main orchastrator and can edit resources per
      compartment, throttle, rewind, version, branch, run in parrell, test" (cos-manager origin) · 2026-10-29 "also really need cos.exe to
      be a fully compartment manager with controls for the rewind engine, diagnostic tools, versions, data browser and tools. cli access.
      index.html/ui for the thumbnail." The direction and the calls are his. The census, the reading of "the new orchastrator/autopilot"
      (marked to confirm in the map's MG_D4), the module cut and the page layout are the coder's.
    purpose: >-
      One place runs and manages every Nexus system and every compartment. COS's manager server is the one supervisor: it boots the
      systems each one's own compartment.json declares, restarts a crashed one with backoff, opens a circuit on one that will not stay
      up, starts on-demand systems when asked and stops them when idle, and keeps its own append-only ledger: what autopilot does today,
      moved into COS so that there is one supervisor, not two (autopilot hands over and stays as a launcher). It serves autopilot's door
      on :7799 unchanged, so the orchestrator, Clear Glass, the tablet and Idearium keep working without an edit. Over that, the state
      manager (versions, branches, rewind), resources, settings, catalogs, categories, macros and the factory, each backend → route →
      command. Last, the UI: pages that float on those routes, each its own component (its own .html, .css and .js), declared in COS's
      registry and shaking hands before any call. It opens in cos.exe and, because it is served, in Clear Glass, where it is tested.
    target_runtime: [node, electron]
    language_stack: [javascript, html, css]
    paradigm: [one-supervisor, the-registry-is-the-bridge, the-ui-floats, page-per-component, backend-first, reuse-before-build]
    axioms: ["§5.9 every system is sovereign", "§5.10 contracts only", "§5.11 every boundary performs a handshake", "§5.12 the UI is disposable",
      "§5.13 syntax is not architecture", "§5.15 one owner, placement is ownership, one outage breaks no other", "§3.4 raw execution before interfaces",
      "§8.6 reuse before build", "§10.3 competing truth layers are a failure", "§1.2 nothing fails silently", "§0.3 nothing lost",
      "§17.12 every change and version in Versionium", "§4.1 tested in Clear Glass", "REVERSIBILITY", "USER_AUTONOMY"]
    deps:
      - { name: electron, version: ">=28", required: false, purpose: "cos.exe's window, which hosts the pages; the pages also run in Clear Glass" }
      - { name: qemu, version: ">=7", required: false, purpose: "machine compartments' checkpoints and snapshots (Rewind, Versions)" }

    census: >-
      Read in the tree 2026-10-30, at 0.60.297. Phases: 13 COS and sovereignty maps. cos-app COSA0c–COSA7 BUILT (0.60.87–0.60.93), COSA5
      and COSA8 OPEN; cos-console CON1–CON8 OPEN; cos-spine CS1–CS11 OPEN (mapped 2026-10-23, nothing built); cos-manager MG0b–MG14 OPEN
      (nothing built); cos-services SV0 DONE (0.60.235), SV1–SV4 OPEN; guardian-into-cos GD0–GD1 DONE (0.60.240), GD2–GD8 OPEN;
      loom-into-cos LM0–LM4 DONE (0.60.241–242, Loom runs in its compartment behind the wall), LM5 OPEN; sovereign-systems SV0 DONE
      (0.60.244), SV1 PARTLY (the census), SV1_D1 his to choose, SV2–SV8 and CS12–CS21 OPEN.
      The supervisor today: lib/nexus/autopilot.js (2,022 lines). It holds a hard-coded kernel list (ALL_KERNELS: name, cmd, args, critical,
      phase, healthUrl, onDemand, maxOldSpaceMB). Each kernel is a child process, restarted with exponential backoff behind a circuit breaker.
      Spawning is gated on free memory (lib/resource-monitor, a lower floor for critical kernels). It keeps an append-only ledger and emits
      warp events. Its status server on :7799 serves GET /status, /idle, /ledger, /graph, /contract-map/:name, /tables, /files/:system,
      /warp, and POST /spawn/:name, /control/:name/(restart|stop|start), /touch/:name, /run-tests/:name.
      Callers of :7799: orchestrator/orchestrator.js (GET /api/autopilot/status, POST :7799/spawn/clear-glass), clear-glass/renderer/browser.js
      (port list), cos/tablet/index.html (systems resolved from /status), idearium/ui (update), and cos/app/runtime.js. runtime.js says today
      "COS does not become a second supervisor: it starts the project's OWN supervisor (nexus/autopilot.js)".
      COS has, unused by any supervisor: compartment/process-runner.js (spawnProcess, killProcess, getProcess, writeStdin, resolveRuntime),
      watchdog/monitor.js and proc-stats.js (per-process memory and CPU against limits), workspace/vm-control.js (pause, resume, checkpoint,
      checkpoints, rewind), archetype/registry.js and blueprint/registry.js with their schemas, app/versionium.js (the exe's own recorder:
      record, drain, pending), and each system's compartment.json (schema nexus.compartment/1). The exe's window today
      (cos/app/desktop/ui: index.html, app.js, style.css, 191 lines) lists releases, the update policy, logs and a command line.
      Not found anywhere: one supervisor inside COS; a boot plan read from each system's own declaration; a page shell that loads pages
      by the registry and handshakes; any of the manager's pages.

    constraints:
      - id: MG-001
        description: "One supervisor. COS's manager server is the only thing that spawns, restarts or stops a Nexus system. While it runs, autopilot does not supervise; it launches COS or says COS already runs, and exits."
        type: hard
        enforced_by: [GATE-MG-ONE-SUPERVISOR]
      - id: MG-002
        description: "Each system declares itself. The boot plan is read from each system's compartment.json (its owner's file, §5.15 rule 2), never from a list kept in COS. A system with no declaration is listed as undeclared and not started."
        type: hard
        enforced_by: [GATE-MG-DECLARED]
      - id: MG-003
        description: "The door is kept. Every route autopilot serves on :7799 answers the same shape from COS, so no caller changes when the supervisor moves."
        type: hard
        enforced_by: [GATE-MG-DOOR]
      - id: MG-004
        description: "The UI floats. A page calls only the routes and commands its registry entry declares, after a handshake; removing every page changes nothing that runs (§5.12)."
        type: hard
        enforced_by: [GATE-MG-UI-HANDSHAKE]
      - id: MG-005
        description: "Page per component, section per component. Each page is its own folder with its own index.html, page.css and page.js, and each section of a page (a card, a tab, a form, a list) its own sub-folder with section.html, section.css and section.js, bundled with its component. Pages and sections share code only through cos/ui/core, never with each other, and talk only by events on the component registry's bus that their registry entries declare (MG_D7)."
        type: hard
        enforced_by: [GATE-MG-PAGE-ISOLATED]
      - id: MG-006
        description: "Person acts. Start, stop, restart, restore, cap, despawn and destroy are a person's acts or a rule he set (the restart policy is such a rule). An agent's act is a proposal shown on the Proposals page until he takes it."
        type: hard
        enforced_by: [GATE-MG-PERSON]
      - id: MG-007
        description: "Nothing lost, everything recorded. Every change to a compartment, a setting, a catalog item, a category or a macro is recorded in Versionium through the one recorder COS has (cos/app/versionium.js), buffered when Versionium is down; a destroy archives (§0.3)."
        type: hard
        enforced_by: [GATE-MG-RECORDED]
      - id: MG-008
        description: "Data through the compartment. The manager reads a compartment's data only through routes its registry declares (MG_D3); autopilot's /files and /tables are served by the door for old callers, marked as the crossings they are, and retired when the last caller moves."
        type: hard
        enforced_by: [GATE-MG-DATA-ROUTES]

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

    - id: SupervisorPolicy
      name: SupervisorPolicy
      description: "The rules the supervisor acts by: today's constants in autopilot, made settings (MG6 layers them)."
      fields:
        bootSet:          "'core'|'all'|string[] — what starts at boot (CS4a: 'core' = Cortex with RAID; until sovereign, the core set)"
        restart:          "{ on: 'crash'|'never', backoffMs: [min, max], factor: number }"
        circuit:          "{ maxRestarts: number, windowMs: number } — past it, the circuit opens and the system stays down, said"
        healthEveryMs:    "number"
        idleMs:           "number — an on-demand system idle this long is stopped"
        memoryHaltPct:    "number — free memory below this refuses a spawn (autopilot's 10%)"
        criticalHaltPct:  "number — the lower floor for critical systems (autopilot's 5%)"
        maxOldSpaceMB:    "number — the default heap cap per Node system (autopilot's 1024); a system's own runtime.maxOldSpaceMB wins"
        stopGraceMs:      "number — time between a stop's polite signal and the kill"
      behavioral_contracts: ["each value says the layer it came from (MG6)", "a change is recorded in Versionium (MG-007)"]
      error_paths: ["an out-of-range value → refused by the schema, with the range"]

    - id: SupervisorLedgerEntry
      name: SupervisorLedgerEntry
      description: "One line of the supervisor's append-only ledger (autopilot's ledger, kept in COS's own data)."
      fields:
        id:      "string — shortid"
        ts:      "number — epoch ms"
        kind:    "'boot'|'spawn'|'exit'|'crash'|'restart'|'circuit-open'|'circuit-close'|'stop'|'idle-stop'|'refused'|'health'|'handover'"
        system:  "string|null"
        pid:     "number|null"
        code:    "number|null — exit code"
        why:     "string — the reason, in words"
        by:      "string — person | rule:<id> | boot | agent:<name> (a proposal taken)"
      behavioral_contracts: ["append-only; never rewritten", "written before the act it records (§9.2)"]
      error_paths: ["the ledger file cannot be written → the act is refused and the reason printed to stdout (§1.2)"]

    - id: PageComponent
      name: PageComponent
      description: "One UI page as COS's registry declares it (MG_D1)."
      fields:
        id:        "string — page id, e.g. cos.ui.overview"
        path:      "string — cos/ui/<page>/ (holds index.html, page.css, page.js)"
        title:     "string"
        routes:    "string[] — the routes it may call, e.g. 'GET /api/cos/systems'"
        commands:  "string[] — the command rows it may run, e.g. 'cos restart'"
        emits:     "string[] — the events it may put on the registry bus"
        listens:   "string[] — the events it may hear from the registry bus"
        sections:  "string[] — its sections, each its own component (own folder: section.html, section.css, section.js), declared in the registry"
        params:    "string[] — what it takes from the shell (e.g. compartment)"
        version:   "string — semver; the handshake checks it"
      behavioral_contracts: ["a call outside routes/commands is refused by cos/ui/core before it is sent, and shown on the page"]
      error_paths: ["a page with no registry entry → the shell does not load it and says which"]

    - id: Proposal
      name: Proposal
      description: "An act an agent asked for (MG-006), held until a person takes or drops it."
      fields:
        id:        "string"
        by:        "string — agent:<name>"
        verb:      "string — the command row, e.g. 'cos restart'"
        args:      "object"
        why:       "string — the agent's reason"
        at:        "number"
        state:     "'held'|'taken'|'dropped'|'expired'"
        decidedBy: "string|null"
      behavioral_contracts: ["a held proposal never runs", "taking it runs the same command a person would, with by = the person"]
      error_paths: ["the target changed since it was proposed → taking it says so and asks again"]

    - id: SettingsLayer
      name: SettingsLayer
      description: "One layer of a compartment's settings (MG6): schema default → COS → template or type → the compartment."
      fields:
        scope:     "'schema'|'cos'|'template'|'type'|'compartment'"
        ownerId:   "string|null — the template, type or compartment id"
        values:    "object"
        schema:    "string — the schema the values validate against"
        updatedAt: "number"
        updatedBy: "string"
      behavioral_contracts: ["the resolved value names its layer", "reset removes the compartment's value and the next layer shows"]
      error_paths: ["a value its schema refuses → not written; the reason shown beside the field"]

    - id: Category
      name: Category
      description: "A named group of compartments defined by one archetype or one template (MG10, MG_D2)."
      fields:
        id:        "string"
        name:      "string"
        from:      "'archetype'|'template'|'builtin'"
        sourceId:  "string|null — the archetype or template id; null for builtin 'systems'"
        schema:    "string — the source's schema"
        settings:  "string|null — its settings layer id (MG6)"
        members:   "string[] — compartment ids"
        archived:  "bool"
      behavioral_contracts: ["'systems' is builtin: its members are every Nexus system's compartment (CS4)", "remove archives (§0.3)"]
      error_paths: ["an edit its schema refuses → refused with the field and why"]

    - id: Macro
      name: Macro
      description: "A recorded or written sequence of COS commands run against one compartment or many (MG7)."
      fields:
        id:        "string"
        name:      "string"
        steps:     "{ command: string, args: object }[] — each a command row"
        targets:   "string[] — compartment ids or category ids"
        trigger:   "'manual'|{ rule: string }"
        params:    "string[] — {{name}} parameters"
        lastRun:   "{ at: number, ok: bool, failedStep: number|null }|null"
        by:        "string"
      behavioral_contracts: ["each step is on the ledger", "a step that fails stops the run and names the step"]
      error_paths: ["a step outside the person-acts rule with no rule allowing it → the run becomes a proposal"]

    - id: SpecBundle
      name: SpecBundle
      description: "A whole system or project as one .spec file: the spec is the metadata, the payload is the system, the history is everything that happened to it (his, 2026-10-30)."
      fields:
        format:      "'nexus.spec-bundle/1'"
        spec:        "object — the system's own .spec (meta, schemas, modules, phases summary), readable without unpacking anything"
        system:      "{ name: string, uuid: string, kind: 'nexus-system'|'project', version: string }"
        compartment: "{ compartmentId, archetype|template, settings, caps }|null — how COS ran it"
        history:     "{ versions, commits, conversations, notes, decisions, phases, changelogs, benchmarks } — each { count, sha256 }, the records themselves in the payload's history/ folder; appended, never rewritten"
        payload:     "{ encoding: 'zip+base64', sha256: string, sizeBytes: number, files: number, data: string } — the tree and history/, compressed; written LAST so a reader of the metadata stops before it"
        parent:      "string|null — the sha256 of the bundle this one was exported after (its line of exports)"
        exportedAt:  "number"
        exportedBy:  "string — person | agent:<name>"
        from:        "string — the install it came from"
      behavioral_contracts: ["valid YAML: every .spec reader in Nexus reads its metadata unchanged", "import verifies payload.sha256 before writing anything",
        "an import never overwrites: it makes a new repo, or a new version of the same uuid when he says so"]
      error_paths: ["payload hash mismatch → refused, nothing written", "unknown format → refused naming it", "no payload (a plain .spec) → imported as a spec to build from, said"]

    - id: ResourceAllocation
      name: ResourceAllocation
      description: "What one compartment is given from the host's pool, and how it is balanced (MG23)."
      fields:
        compartment:  "string"
        cpu:          "{ share: number (percent of host), cores: number|null, priority: 'critical'|'normal'|'background' }"
        memoryMB:     "{ reserved: number, limit: number }"
        storage:      "[{ volume: string, quotaMB: number }] — StorageVolume ids"
        network:      "[{ network: string, kbps: number|null }] — VirtualNetwork ids"
        replicas:     "{ min: number, max: number, current: number }"
        balance:      "{ by: 'raid', rule: string, lastDecision: string|null } — the RAID decision that last moved it"
        applied:      "{ <part>: 'enforced'|'not-enforced'|'failed', why?: string } — read back (cos-spine CS-004)"
      behavioral_contracts: ["the sum of reservations never exceeds the host pool; an over-commit is refused with the numbers", "each change names who or which RAID decision made it"]
      error_paths: ["a part the OS or hypervisor cannot enforce → not-enforced, said; the compartment still runs"]

    - id: VirtualNetwork
      name: VirtualNetwork
      description: "A network compartments join (MG24)."
      fields:
        id:        "string"
        name:      "string"
        mode:      "'isolated'|'nat'|'bridged' — isolated: members only; nat: out through the host; bridged: reachable from the host's LAN"
        subnet:    "string — CIDR"
        members:   "[{ compartment, address, ports: [{ inside, outside|null }] }]"
        bridges:   "[{ to: network id|'host', ports, via: 'proxy'|'tunnel'|'tap' }] — how it reaches another network or the host"
        dns:       "{ zone: string, names: { name: address } }|null — his dns engine"
        firewall:  "[{ from, to, port, allow: bool }] — his firewall engine's rules"
      behavioral_contracts: ["a compartment joins no network unless its allocation names it (isolated by default, the archetype's isolated: true)"]
      error_paths: ["a bridge needing host admin rights (tap) where COS has none → refused, saying so and offering proxy or tunnel"]

    - id: StorageVolume
      name: StorageVolume
      description: "A storage location and the volumes cut from it (MG25)."
      fields:
        id:         "string"
        location:   "{ kind: 'folder'|'drive'|'object' (his storage engine, S3 subset), path|url: string }"
        quotaMB:    "number"
        usedMB:     "number|null — read back"
        mountedIn:  "[{ compartment, at: string (path inside), mode: 'ro'|'rw' }]"
        snapshot:   "'with-version'|'never' — taken with the compartment's version (CS1) or not"
        encryption: "'none'|'vault' — cos/vault when chosen"
        createdBy:  "string"
      behavioral_contracts: ["a volume mounted in a machine compartment is said to block live checkpoints (vm-control refuses a live snapshot while a host folder is shared in)"]
      error_paths: ["a location that is gone or full → its volumes marked unavailable, their compartments told, nothing deleted"]

    - id: SystemState
      name: SystemState
      description: "The whole system at one moment: one version of every compartment, under one id (the enterprise state manager, MG3)."
      fields:
        id:          "string — ss-<shortid>"
        label:       "string|null"
        versions:    "{ <compartment>: CompartmentVersion id } (cos-spine.spec)"
        allocations: "{ <compartment>: ResourceAllocation snapshot }"
        networks:    "VirtualNetwork[] snapshot"
        parent:      "string|null"
        branch:      "string"
        pinned:      "bool — kept past retention"
        at:          "number"
        by:          "string"
      behavioral_contracts: ["restoring a system state first takes one of the current state (cos-spine CS-003)", "retention never removes a pinned state; removal archives (§0.3)"]
      error_paths: ["one compartment's version no longer verifies → the restore refuses and names it; the others are untouched"]

    - id: MergeReport
      name: MergeReport
      description: "Why a branch may or may not merge back (MG26)."
      fields:
        branch:      "string"
        into:        "string"
        benchmarks:  "[{ metric, base, branch, sigma, better: bool }] — .benchmark nodes from both, same load"
        friction:    "{ base: number, branch: number, breakdown } — the architecture spec's FrictionScore"
        behaviour:   "{ passed: number, failed: number, schemas: string[] } — the behaviour schemas (architecture-spec RULE A)"
        tests:       "{ passed: number, failed: number }"
        verdict:     "'merge'|'refuse'|'ask'"
        why:         "string — the numbers that decided it"
      behavioral_contracts: ["merge only on verdict merge, or ask taken by a person", "a merge takes a version of the target first"]
      error_paths: ["a measurement missing → verdict ask, never merge"]

    - id: VendorLock
      name: VendorLock
      description: "What cos/dependencies holds, where each file came from, and its hash: a copy that cannot drift unseen (MG_D9)."
      fields:
        format:    "'nexus.vendor-lock/1'"
        entries:   "[{ name: string, source: string (repo URL or archive path), commit: string|null, path: string, sha256: string, bytes: number }]"
        sets:      "[{ name, source, commit, consumer: string (the phase that will use it), why: string }]"
        createdAt: "number"
        createdBy: "string"
        refreshed: "[{ at, by, from: commit, to: commit }] — appended on each refresh, never rewritten"
        excluded:  "[{ path, why }] — what was left out on purpose (node_modules, build output)"
        license:   "[{ set, file }] — the license file of each set, where it has one"
      behavioral_contracts: ["a file in cos/dependencies is never edited in place; a refresh copies again from the source and appends to refreshed"]
      error_paths: ["a file whose sha256 differs from its entry → the check fails, naming the file and both hashes"]

  interfaces:

    - id: IF-COMPARTMENT-JSON
      name: compartment-json
      path: versionium/compartment.json
      description: "Each system's own declaration (schema nexus.compartment/1), owned by that system. This spec asks it for three more runtime fields (bootPhase, onDemand, maxOldSpaceMB); each system writes its own (MG15)."
      exports: ["{ id, name, dir, cos: { compartmentId }, runtime: { entry, port, healthUrl, critical, optional, bootPhase?, onDemand?, maxOldSpaceMB? }, data, spec, dependsOn }"]
      behavioral_contracts: ["written by the system's shape (lib/system-shape.js role compartment)"]
      error_paths: ["a system without one is listed as undeclared, not guessed"]

    - id: IF-PROCESS-RUNNER
      name: process-runner
      path: cos/compartment/process-runner.js
      description: "Spawns and kills a compartment's process; every line and exit on the host bus."
      exports: ["spawnProcess(host, compartment, opts)", "killProcess(compartmentId)", "getProcess(compartmentId)", "writeStdin", "resolveRuntime"]
      behavioral_contracts: ["the wall (cos/compartment/boundary.js) is preloaded when the env carries COS_BOUNDARY"]
      error_paths: ["spawn fails → the error returned, the compartment not marked up"]

    - id: IF-WATCHDOG
      name: watchdog
      path: cos/watchdog/monitor.js
      description: "Per-compartment memory, CPU and stall against its own limits (cos/watchdog/proc-stats.js reads the OS)."
      exports: ["WatchdogMonitor", "startMonitoring", "stopMonitoring", "getMonitor", "readProcStats(pid) (proc-stats.js)"]
      behavioral_contracts: ["an alert, not a cap"]
      error_paths: ["the OS refuses a read → null with why"]

    - id: IF-VM-CONTROL
      name: vm-control
      path: cos/workspace/vm-control.js
      description: "A machine compartment's pause, resume and live checkpoints on QEMU."
      exports: ["status", "pause", "resume", "checkpoint", "checkpoints", "rewind", "TAG_RE"]
      behavioral_contracts: ["refuses a live snapshot while a host folder is shared in"]
      error_paths: ["QEMU absent → said, and the Rewind tab shows files-only versions"]

    - id: IF-ARCHETYPE-REGISTRY
      name: archetype-registry
      path: cos/archetype/registry.js
      description: "COS's archetypes and their schema (cos/archetype/schema.js); blueprints the same in cos/blueprint/registry.js."
      exports: ["the registry's list, read and validate functions (module.exports of registry.js)"]
      behavioral_contracts: ["COS owns them (§5.15)"]
      error_paths: ["an item its schema refuses → the validation errors returned"]

    - id: IF-COS-RECORDER
      name: cos-recorder
      path: cos/app/versionium.js
      description: "COS's one recorder to Versionium (the exception the 0.60.279 addendum allows; no third)."
      exports: ["record(change)", "drain()", "pending()"]
      behavioral_contracts: ["buffered in its outbox when Versionium is down; never dropped; never blocks the change"]
      error_paths: ["in a test process → skipped and said, unless NEXUS_VERSIONIUM_RECORD_IN_TESTS=1"]

    - id: IF-COS-RUNTIME
      name: cos-runtime
      path: cos/app/runtime.js
      description: "The exe's runner of a release (COSA3): start, stop, status, logs; today it starts autopilot and waits on :7799."
      exports: ["preflight", "portsBusy", "start", "stop", "status", "logs", "readRun", "killTree", "DEFAULTS", "ENTRIES"]
      behavioral_contracts: ["old releases (lib/nexus/autopilot.js, nexus/autopilot.js) still start"]
      error_paths: ["health not reached in healthTimeoutMs → said with the log tail"]

    - id: IF-GLASS-DRIVER
      name: glass-driver
      path: clear-glass/src/driver/glass.js
      description: "Clear Glass's driver, which every page's acceptance runs in (AXIOMS §4.1; never Playwright)."
      exports: ["the driver's open, click, type, read and wait verbs"]
      behavioral_contracts: ["the page is loaded from COS's server, as a person loads it"]
      error_paths: ["Clear Glass not running → the UI test skips and says why"]

    - id: IF-IDEARIUM-REPOS
      name: idearium-repos
      path: idearium/api/index.js
      description: "Idearium owns repos and their history (versions through Versionium, threads, notes, phases); COS reaches it only by route (§5.15)."
      exports: ["POST /api/repos/import (repo.import-archive: a zip → a repo, materialized, pipeline, baseline snapshot)", "GET /api/repos/:uuid", "the repo versions and diff commands"]
      behavioral_contracts: ["the repo's living model is the .spec in its spec folder (idearium/repo/living-spec.js)"]
      error_paths: ["Idearium down → COS reads the bundle's metadata itself and holds the import until it answers, said"]

    - id: IF-RAID-PORT
      name: raid-port
      path: lib/raid-port.js
      description: "RAID through its port: the one decider (§5.2, §9.1); CS11 brings it into COS with load in its decision."
      exports: ["provide", "via", "approveTool", "decide(request) → { route, why, load }", "outcome", "listQueue"]
      behavioral_contracts: ["RAID decides, COS acts; a balance act names RAID's decision"]
      error_paths: ["RAID not answering → no balance act; the current placement stays, said"]

    - id: IF-SAFE-APPLY
      name: safe-apply
      path: lib/safe-apply.js
      description: "mirror → branch → check → mergeBack, RAID-gated, refusing an unchecked branch; SN0 makes it the one branch interface."
      exports: ["mirrorCompartment", "proposeChange", "mergeBack"]
      behavioral_contracts: ["an unchecked branch is never merged"]
      error_paths: ["the check fails → mergeBack refuses with the check's result"]

    - id: IF-NET-ENGINES
      name: net-engines
      path: cos/services/anonymous/engines/proxy.js
      description: "His network engines in COS (SV0): proxy, tunnel, firewall, dns, storage (S3 subset), webserver, tls; each its own process on its port."
      exports: ["each engine's own routes and conf (engines/_engine.js: ipc, conf, log, claimPort)"]
      behavioral_contracts: ["the gate grammar runs no IPC string as code (SV0)"]
      error_paths: ["an engine not running → the network or volume that needs it says so"]

    - id: IF-QEMU-RUNTIME
      name: qemu-runtime
      path: cos/compartment/qemu-runtime.js
      description: "Machine compartments' QEMU arguments (-m, -smp, -netdev user with hostfwd, or none), overlays and disk snapshots."
      exports: ["buildQemuArgs", "qemuImgSnapshotSave", "qemuImgSnapshotApply", "qemuImgSnapshotList"]
      behavioral_contracts: ["isolated by default: no -netdev"]
      error_paths: ["QEMU absent → machine features said as unavailable"]

    - id: IF-ARCHETYPE-SCHEMA
      name: archetype-schema
      path: cos/archetype/schema.js
      description: "The archetype schema (blueprints: cos/blueprint/schema.js; templates: loom/templates) the builder validates against."
      exports: ["the schema and its validator"]
      behavioral_contracts: ["COS owns archetypes and blueprints; loom owns its templates and serves them by route"]
      error_paths: ["invalid → the errors per field"]

  modules:

    # ── the contract first (MG0b) ─────────────────────────────────────────

    - id: MOD-MG-CONTRACT
      name: manager-contract
      uuid: nexus-cos-manager-contract-v1-0000-2026-1030-001
      path: cos/manager/contract.json
      phase: MG0b_the_full_spec
      description: >-
        The manager's interaction contract, written with this spec: every route, command row and event the modules below serve, with input,
        output, the person-acts flag and the version. COS's registry declares each page (PageComponent) against it. The UI and every agent
        read this, not the code (§5.10).
      deps: []
      schema_refs: [PageComponent]
      exports: ["{ version, routes: [{ method, path, in, out, personAct }], commands: [{ row, route }], events: [name], pages: [PageComponent] }"]
      gate_pipeline: ["GATE-MG0-001: every module's exports appear as a route or a command", "GATE-MG0-002: every page's routes are in the contract"]
      behavioral_contracts: ["one contract file for the manager; the door's legacy routes are listed under legacy:, each with its replacement"]
      error_paths: ["a route served but not in the contract → CK fails, naming it (declared ≠ served, loom/scanners)"]
      acceptance: ["the contract validates; the scanner finds no served route missing from it and no declared route unserved (once built)"]

    # ── the one supervisor: what autopilot does, in COS (MG15–MG17) ───────

    - id: MOD-MG-SUPERVISOR
      name: supervisor
      uuid: nexus-cos-manager-supervisor-v1-0000-2026-1030-001
      path: cos/manager/supervisor.js
      phase: MG15_the_supervisor_in_cos
      description: >-
        autopilot's job in COS, reusing COS's own parts. The boot plan is read from every system's compartment.json (MG-002): critical systems
        by bootPhase, on-demand ones started when asked. Each system is a child through process-runner, with the wall when it is in its
        compartment. A crash is restarted with exponential backoff; past circuit.maxRestarts in circuit.windowMs the circuit opens and the
        system stays down, said. A spawn is refused below memoryHaltPct free (criticalHaltPct for critical). Health is checked every
        healthEveryMs. An on-demand system idle for idleMs is stopped. Everything goes on the ledger before it happens. The policy is
        SupervisorPolicy, today's autopilot constants as its defaults, so behaviour does not change on the move.
      deps: [{ name: process-runner }, { name: watchdog }, { name: compartment-json }, { name: cos-recorder }]
      schema_refs: [SupervisedSystem, SupervisorPolicy, SupervisorLedgerEntry]
      exports: ["boot({ set }) → { started: string[], skipped: [{ name, why }] }", "list() → SupervisedSystem[]", "get(name) → SupervisedSystem",
        "start(name, { by }) → SupervisedSystem", "stop(name, { by }) → SupervisedSystem", "restart(name, { by }) → SupervisedSystem",
        "touch(name) → SupervisedSystem (spawns an on-demand system, resets its idle clock)", "resetCircuit(name, { by })",
        "ledger({ limit, system }) → SupervisorLedgerEntry[]", "policy() / setPolicy(patch, { by })", "shutdown({ by })"]
      gate_pipeline: ["GATE-MG15-001: declared (compartment.json read and valid)", "GATE-MG15-002: memory floor", "GATE-MG15-003: person or rule (MG-006)",
        "GATE-MG15-004: ledger written", "GATE-MG15-005: spawn through process-runner", "GATE-MG15-006: health reached or said"]
      behavioral_contracts: ["one child per system, never two (a start of a running system is a no-op, said)", "one system crashing leaves the others running",
        "the restart policy is the rule his crash restarts run under (by = rule:restart)", "the defaults equal autopilot's constants, so the move changes no behaviour"]
      error_paths: ["compartment.json missing or invalid → state undeclared, not started, why given", "port already taken by an unknown process → refused, naming the pid",
        "circuit open → start refused until resetCircuit by a person", "free memory below the floor → refused, with the numbers"]
      acceptance: ["with fixture systems: boot starts the core set in bootPhase order; a killed child restarts with backoff; a crash loop opens the circuit;",
        "an on-demand system starts on touch and stops after idleMs; every act is a ledger line", "the defaults table equals autopilot's constants (test reads both)"]

    - id: MOD-MG-SERVER
      name: manager-server
      uuid: nexus-cos-manager-server-v1-0000-2026-1030-001
      path: cos/manager/server.js
      phase: MG15_the_supervisor_in_cos
      description: >-
        COS's manager as its own process: `node cos/manager/server.js`. It holds the supervisor and every manager module, serves the
        manager's routes under /api/cos/ and the pages under /ui/ on :7799 (the port autopilot used, so there is one door and no new port),
        and runs headless; cos.exe starts it if it is not running and shows its pages, and closing the exe leaves it running (§5.12).
      deps: [{ name: supervisor }, { name: manager-contract }]
      schema_refs: [SupervisedSystem]
      exports: ["the HTTP server on :7799 (COS_MANAGER_PORT overrides)", "GET /api/cos/health", "GET /api/cos/contract (contract.json)",
        "GET /api/cos/systems, GET /api/cos/systems/:name, POST /api/cos/systems/:name/(start|stop|restart|touch|reset-circuit), POST /api/cos/boot",
        "GET /api/cos/ledger", "GET|PATCH /api/cos/policy", "GET /api/cos/events (SSE of the cos.* events)", "GET /ui/<page>/* (static, from cos/ui)"]
      gate_pipeline: ["GATE-MGS-001: route in the contract", "GATE-MGS-002: person act carries a person (the exe's or Clear Glass's session) or a rule", "GATE-MGS-003: the supervisor answers"]
      behavioral_contracts: ["one manager process; a second start finds the port held by a manager and exits, saying so", "served only on 127.0.0.1"]
      error_paths: [":7799 held by an old autopilot → the handover (MG17) runs, or the server exits naming the holder"]
      acceptance: ["started headless, the routes answer; the exe closed, the systems keep running"]

    - id: MOD-MG-AUTOPILOT-DOOR
      name: autopilot-door
      uuid: nexus-cos-manager-door-v1-0000-2026-1030-001
      path: cos/manager/autopilot-door.js
      phase: MG16_the_autopilot_door
      description: >-
        Every route autopilot serves today, answered by the manager server in the same shape (MG-003): /status, /idle, /spawn/:name,
        /control/:name/(restart|stop|start), /touch/:name, /ledger, /graph, /contract-map/:name, /tables, /files/:system, /run-tests/:name,
        /warp. Supervision routes map to the supervisor. /files and /tables reach into a system's own files, a crossing §5.15 forbids;
        they are kept answering for their old callers, each marked legacy in the contract with its replacement (the Data tab through the
        compartment's routes, MG_D3), and the census lists who still calls them.
      deps: [{ name: supervisor }, { name: manager-server }, { name: manager-contract }]
      schema_refs: [SupervisedSystem, SupervisorLedgerEntry]
      exports: ["mount(server) — the legacy routes on the manager server", "legacyCallers() → [{ route, caller, lastAt }]"]
      gate_pipeline: ["GATE-MG16-001: the same response shape as autopilot (a recorded fixture of each)", "GATE-MG16-002: each legacy call counted with its caller"]
      behavioral_contracts: ["no caller of :7799 changes in this phase", "a legacy route's answer says legacy: true and names its replacement"]
      error_paths: ["a route autopilot served that the door does not → test fails naming it"]
      acceptance: ["orchestrator's /api/autopilot/status, Clear Glass's spawn of clear-glass, the tablet's /status and Idearium's update read the door unchanged"]

    - id: MOD-MG-AUTOPILOT-HANDOVER
      name: autopilot-handover
      uuid: nexus-cos-manager-handover-v1-0000-2026-1030-001
      path: lib/nexus/autopilot.js
      phase: MG17_autopilot_hands_over
      description: >-
        autopilot stops supervising and hands over (MG-001), kept, not deleted (§0.3). `node lib/nexus/autopilot.js` and `npm run
        autopilot` / `start:all` start COS's manager server (or find it running), pass --only as the boot set, print where the manager is,
        and exit. COS's runtime.js starts the manager for a new release and keeps ENTRIES for old releases, whose own autopilot still
        supervises them. The old supervisor body is archived beside it with the version that retired it. The orchestrator's place for it
        (CS13, orchestrator/autopilot.js) is superseded by this: there is no supervisor left to move (to confirm, MG_D4).
      deps: [{ name: manager-server }, { name: autopilot-door }, { name: cos-runtime }]
      schema_refs: [SupervisorLedgerEntry]
      exports: ["the launcher: start or find the manager, hand it the boot set, exit 0", "a 'handover' ledger line naming the version"]
      gate_pipeline: ["GATE-MG17-001: the manager answers /api/cos/health", "GATE-MG17-002: no second supervisor (ports and pids checked)"]
      behavioral_contracts: ["npm run start:all boots every system the same as before", "an old release in COS still starts with its own autopilot"]
      error_paths: ["the manager cannot start → the launcher says why and exits non-zero; it never falls back to supervising silently"]
      acceptance: ["npm run start:all boots the system; /status lists every system; an old release zip still starts in cos.exe"]

    # ── the backend the pages stand on (MG1–MG8, MG10) ────────────────────

    - id: MOD-MG-LOOM-SPINE
      name: loom-on-its-registry-spine
      uuid: nexus-cos-manager-loom-v1-0000-2026-1030-001
      path: loom/registry-components.js
      phase: MG1_loom_on_its_registry_spine
      description: "Loom first, end to end: its registry is its spine and the bridge to its compartment; its UI shakes hands before any call (DB12). The pattern every page here uses."
      deps: [{ name: manager-contract }]
      schema_refs: [PageComponent]
      exports: ["Loom's registry valid at level system", "its UI's handshake"]
      gate_pipeline: ["GATE-MG1-001: registry valid", "GATE-MG1-002: undeclared call refused"]
      behavioral_contracts: ["the UI reads only what the registry declares"]
      error_paths: ["an undeclared call → refused and shown"]
      acceptance: ["Loom's registry validates as level system; its UI's undeclared call is refused and shown"]

    - id: MOD-MG-GENESIS
      name: genesis-through-the-registry
      uuid: nexus-cos-manager-genesis-v1-0000-2026-1030-001
      path: cos/archetype/nexus-system.js
      phase: MG2_genesis_compartments_through_the_registry
      description: "A compartment from the genesis archetype reaches its store and server.js only through its registry's routes (the tunnel); COS reads its data the same way."
      deps: [{ name: loom-on-its-registry-spine }, { name: archetype-registry }]
      schema_refs: [PageComponent]
      exports: ["the tunnel: a compartment's declared routes, reachable from COS"]
      gate_pipeline: ["GATE-MG2-001: routes declared", "GATE-MG2-002: no file read from outside (census)"]
      behavioral_contracts: ["COS never reads a compartment's files"]
      error_paths: ["a route not declared → refused"]
      acceptance: ["a genesis compartment's data read through its routes; the census finds no outside file read"]

    - id: MOD-MG-STATE
      name: state-manager
      uuid: nexus-cos-manager-state-v1-0000-2026-1030-001
      path: cos/manager/state.js
      phase: MG3_the_state_manager
      description: "One manager over every compartment's state: versions (CS1: Versionium commit + QEMU snapshot under one id), branches, parallel runs, checkpoints, what runs."
      deps: [{ name: supervisor }, { name: vm-control }, { name: cos-recorder }]
      schema_refs: [SupervisedSystem]
      exports: ["versions(id)", "take(id, { by })", "takeSystem({ label, by }) → SystemState", "restoreSystem(stateId, { by })", "states({ branch })", "pin(stateId)", "restore(id, versionId, { by })", "branch(id, versionId, { by })", "checkpoints(id)", "rewind(id, tag, { by })",
        "routes GET /api/cos/compartments/:id/versions, POST …/versions, …/restore, …/branch, …/rewind; rows `cos version list|take|restore|branch`, `cos rewind`"]
      gate_pipeline: ["GATE-MG3-001: restore takes a version first (cos-spine CS-003)", "GATE-MG3-002: person act", "GATE-MG3-003: recorded"]
      behavioral_contracts: ["every act on the ledger and in Versionium"]
      error_paths: ["a part no longer verifies → restore refused naming it", "no QEMU → files-only versions, said"]
      acceptance: ["a compartment versioned, branched, rewound and run beside its branch through route and command"]

    - id: MOD-MG-RESOURCES
      name: resources
      uuid: nexus-cos-manager-resources-v1-0000-2026-1030-001
      path: cos/manager/resources.js
      phase: MG4_resources_per_compartment
      description: "A compartment's caps (memory, CPU, throttle), spawn, despawn and balance, read back from the OS or the hypervisor (cos-spine CS-004)."
      deps: [{ name: supervisor }, { name: watchdog }]
      schema_refs: [SupervisedSystem]
      exports: ["caps(id)", "setCaps(id, caps, { by }) → { applied }", "routes GET|PATCH /api/cos/compartments/:id/caps; row `cos caps`"]
      gate_pipeline: ["GATE-MG4-001: person act", "GATE-MG4-002: read back"]
      behavioral_contracts: ["applied is read from the OS"]
      error_paths: ["a cap the OS refuses → failed with its error; the compartment still runs, said"]
      acceptance: ["a cap set, read back and enforced on a fixture compartment; what cannot be enforced is said"]

    - id: MOD-MG-CATALOG
      name: catalog
      uuid: nexus-cos-manager-catalog-v1-0000-2026-1030-001
      path: cos/manager/catalog.js
      phase: MG5_browsers_and_editors
      description: "Archetypes, schemas, blueprints and templates: list, read, diff, validate, write (versioned, undoable), new from existing."
      deps: [{ name: archetype-registry }, { name: cos-recorder }]
      schema_refs: [Category]
      exports: ["list(kind)", "read(kind, id)", "diff(kind, a, b)", "validate(kind, item)", "write(kind, item, { by })", "fork(kind, id, { by })",
        "routes /api/cos/catalog/:kind[/:id]; rows `cos catalog list|show|edit|fork`"]
      gate_pipeline: ["GATE-MG5-001: schema", "GATE-MG5-002: recorded"]
      behavioral_contracts: ["a write is a new version; the old one stays"]
      error_paths: ["refused by the schema → the errors, per field"]
      acceptance: ["each kind listed, edited, validated, versioned and reverted through routes and commands"]

    - id: MOD-MG-SETTINGS
      name: settings
      uuid: nexus-cos-manager-settings-v1-0000-2026-1030-001
      path: cos/manager/settings.js
      phase: MG6_settings_by_template_and_type
      description: "Settings for COS and each compartment, layered schema default → COS → template or type → compartment, one resolver; SupervisorPolicy is one of them."
      deps: [{ name: catalog }, { name: cos-recorder }]
      schema_refs: [SettingsLayer, SupervisorPolicy]
      exports: ["resolve(id) → { key: { value, layer } }", "set(scope, ownerId, patch, { by })", "reset(scope, ownerId, key, { by })", "routes /api/cos/settings/:scope/:id; row `cos settings`"]
      gate_pipeline: ["GATE-MG6-001: schema", "GATE-MG6-002: recorded (secrets redacted)"]
      behavioral_contracts: ["each value names its layer"]
      error_paths: ["refused by the schema → the reason beside the field"]
      acceptance: ["a template's setting shows on every compartment made from it; a compartment's own wins and says so; reset falls back"]

    - id: MOD-MG-MACROS
      name: macros-and-hats
      uuid: nexus-cos-manager-macros-v1-0000-2026-1030-001
      path: cos/manager/macros.js
      phase: MG7_automation_macros_and_hats
      description: "Macros of COS commands, run on one compartment or many, by hand or by rule; hats bound to the compartment (CS10); agents' acts held as proposals (MG-006); the main orchestrator calls every verb through the same routes (CON8)."
      deps: [{ name: state-manager }, { name: supervisor }]
      schema_refs: [Macro, Proposal]
      exports: ["list()", "save(macro, { by })", "run(id, { targets, params, by })", "proposals()", "take(proposalId, { by })", "drop(proposalId, { by })",
        "routes /api/cos/macros, /api/cos/proposals; rows `cos macro`, `cos proposal`"]
      gate_pipeline: ["GATE-MG7-001: each step a command row", "GATE-MG7-002: person or rule, else a proposal", "GATE-MG7-003: ledger"]
      behavioral_contracts: ["a failed step stops the run and names it"]
      error_paths: ["a step not allowed → the run held as a proposal"]
      acceptance: ["a macro (snapshot → change → test → rewind) runs against a fixture compartment, each step on the ledger"]

    - id: MOD-MG-FACTORY
      name: factory
      uuid: nexus-cos-manager-factory-v1-0000-2026-1030-001
      path: cos/manager/factory.js
      phase: MG8_the_factory
      description: "New compartments and templates: compilers, web servers (his engines, SV), test environments (CE1), anything a template describes."
      deps: [{ name: catalog }, { name: supervisor }]
      schema_refs: [Category]
      exports: ["create(templateId, { name, settings, by }) → compartmentId", "destroy(id, { by }) (archived)", "routes POST /api/cos/compartments, DELETE …/:id; rows `cos new`, `cos destroy`"]
      gate_pipeline: ["GATE-MG8-001: template valid", "GATE-MG8-002: person act", "GATE-MG8-003: health reached"]
      behavioral_contracts: ["destroy archives (§0.3)"]
      error_paths: ["health not reached → the compartment kept stopped, said"]
      acceptance: ["a web-server compartment and a test-env compartment made from templates, each answering its health route"]

    - id: MOD-MG-CATEGORIES
      name: categories
      uuid: nexus-cos-manager-categories-v1-0000-2026-1030-001
      path: cos/manager/categories.js
      phase: MG10_categories
      description: "Categories as registry records (MG_D2), from an archetype or a template; the builtin 'systems' lists every Nexus system's compartment."
      deps: [{ name: catalog }, { name: settings }, { name: supervisor }]
      schema_refs: [Category]
      exports: ["list()", "show(id)", "create({ from, sourceId, name }, { by })", "edit(id, patch, { by })", "rename", "remove(id, { by }) (archived)",
        "routes /api/cos/categories[/:id]; rows `cos category list|show|new|edit|rm`"]
      gate_pipeline: ["GATE-MG10-001: schema", "GATE-MG10-002: recorded"]
      behavioral_contracts: ["systems is builtin and cannot be removed"]
      error_paths: ["an edit refused by its schema → says why"]
      acceptance: ["a category from an archetype and one from a template; a refused edit says why; systems lists every system compartment"]

    # ── the UI: each page its own component (MG18, MG9, MG11–MG14) ────────

    - id: MOD-MG-UI-CORE
      name: ui-core
      uuid: nexus-cos-manager-ui-core-v1-0000-2026-1030-001
      path: cos/ui/core
      phase: MG18_the_supervisor_screen
      description: >-
        What every page shares and nothing else: the handshake (fetch GET /api/cos/contract, check the page's version and its declared routes,
        refuse anything undeclared and show it on the page), call(route, body) and run(row, args) over the contract, the registry bus (MG_D7):
        one bus per window, bridged to COS's registry events (GET /api/cos/events), where a page or section emits and hears only what its
        registry entry declares (an undeclared emit is refused and shown), the section loader (each section mounted in its own shadow root
        with its own css, so no style or DOM crosses), the person-act confirm dialog (it names the act and what it will do), and the theme tokens (light and dark).
        Plain JS, HTML and CSS, no framework, no build step, so a page can be rebuilt from this spec alone.
      deps: [{ name: manager-server }, { name: manager-contract }]
      schema_refs: [PageComponent]
      exports: ["core.js: handshake(pageId) → { ok, refused: string[] }, call(route, body), run(row, args), confirm(act)",
        "bus.js: emit(event, data), on(event, fn) — the registry bus; declared events only", "section.js: mount(sectionId, el) — a section in its own shadow root",
        "core.css: tokens, layout primitives"]
      gate_pipeline: ["GATE-MGUI-001: handshake before the first call", "GATE-MGUI-002: undeclared call refused client side"]
      behavioral_contracts: ["a page never fetches a URL core did not check", "a failed call is shown where it happened, never swallowed (§1.2)"]
      error_paths: ["the manager not answering → every page shows 'COS manager not running', with how to start it"]
      acceptance: ["in Clear Glass: a page that calls an undeclared route is refused and shows the refusal"]

    - id: MOD-MG-UI-SHELL
      name: ui-shell
      uuid: nexus-cos-manager-ui-shell-v1-0000-2026-1030-001
      path: cos/ui/shell
      phase: MG18_the_supervisor_screen
      description: >-
        The frame: a top bar (the manager's state, the boot set, host CPU and free memory against the halt floor, Proposals with a count,
        the command line), a left tree (categories, then their compartments; until MG10 one group, Systems), and the main area, which
        loads the page the tree or the address names (#/overview, #/c/<compartment>/<tab>, #/catalog/<kind>, #/categories, #/automation,
        #/ledger, #/proposals). Pages are loaded from the registry's list, each in its own frame, so one page's failure leaves the others.
      deps: [{ name: ui-core }]
      schema_refs: [PageComponent]
      exports: ["index.html, page.css, page.js: the frame, the tree, the router"]
      gate_pipeline: ["GATE-MGUI-SHELL-001: pages from the registry only", "GATE-MGUI-SHELL-002: an unknown route shows 'no such page'"]
      behavioral_contracts: ["the tree's state dots come from the event stream, not polling, with a 5 s poll only while the stream is down (said)"]
      error_paths: ["a page that fails to load → its frame shows the error; the rest keep working"]
      acceptance: ["in Clear Glass: the shell opens at /ui/shell/, the tree lists every system, each route opens its page"]

    - id: MOD-MG-UI-OVERVIEW
      name: ui-overview
      uuid: nexus-cos-manager-ui-overview-v1-0000-2026-1030-001
      path: cos/ui/overview
      phase: MG18_the_supervisor_screen
      description: >-
        The tablet (cos/tablet/index.html: a grid of system tiles, a system view, panels, Co-pilot) on compartments, his 2026-10-30 "look at
        tablet except it uses the compartments"; what autopilot's /status and the home page's system tiles show, as one page: a card per system (SupervisedSystem): name, state,
        port, uptime, restarts and backoff, circuit, memory and CPU against its caps, last health and its time, critical and on-demand
        marks. Actions on a card: start, stop, restart, open its UI, reset the circuit (each a person act, confirmed). Header actions: boot
        core, boot all, stop all. A filter by state; undeclared systems listed apart, each with what its compartment.json lacks. Sort by
        state then name, so what is down is first.
      deps: [{ name: ui-core }, { name: supervisor }]
      schema_refs: [SupervisedSystem]
      exports: ["index.html, page.css, page.js; routes GET /api/cos/systems, POST /api/cos/systems/:name/*, POST /api/cos/boot; event cos.system.*"]
      gate_pipeline: ["GATE-MGUI-OV-001: handshake", "GATE-MGUI-OV-002: acts confirmed"]
      behavioral_contracts: ["every number on a card is the supervisor's, with its time", "a refused act shows the supervisor's why"]
      error_paths: ["usage null → shown as 'not read' with the why, never 0"]
      acceptance: ["in Clear Glass on fixture systems: a system stopped and started from its card, a crash shown as restarting then up, a circuit opened and reset"]

    - id: MOD-MG-UI-LEDGER
      name: ui-ledger
      uuid: nexus-cos-manager-ui-ledger-v1-0000-2026-1030-001
      path: cos/ui/ledger
      phase: MG18_the_supervisor_screen
      description: "The supervisor's ledger, newest first, filtered by system and kind, live from the event stream; each line its time, kind, system, why and by."
      deps: [{ name: ui-core }, { name: supervisor }]
      schema_refs: [SupervisorLedgerEntry]
      exports: ["index.html, page.css, page.js; route GET /api/cos/ledger; event cos.ledger"]
      gate_pipeline: ["GATE-MGUI-LG-001: handshake"]
      behavioral_contracts: ["read-only"]
      error_paths: ["ledger unreadable → said with the path"]
      acceptance: ["in Clear Glass: a restart done on the Overview appears here with by = the person"]

    - id: MOD-MG-UI-PROPOSALS
      name: ui-proposals
      uuid: nexus-cos-manager-ui-proposals-v1-0000-2026-1030-001
      path: cos/ui/proposals
      phase: MG18_the_supervisor_screen
      description: "Agents' held acts (MG-006): each with the agent, the command, its target, the agent's reason and its age; Take runs it as his act, Drop closes it."
      deps: [{ name: ui-core }, { name: supervisor }]
      schema_refs: [Proposal]
      exports: ["index.html, page.css, page.js; routes GET /api/cos/proposals, POST …/:id/(take|drop)"]
      gate_pipeline: ["GATE-MGUI-PR-001: handshake", "GATE-MGUI-PR-002: take confirmed"]
      behavioral_contracts: ["a target changed since → shown before Take"]
      error_paths: ["the act fails when taken → the failure shown on the proposal and on the ledger"]
      acceptance: ["in Clear Glass: an agent's restart proposal taken and run, with by = the person"]

    - id: MOD-MG-UI-COMPARTMENT
      name: ui-compartment
      uuid: nexus-cos-manager-ui-compartment-v1-0000-2026-1030-001
      path: cos/ui/compartment
      phase: MG9_the_console_ui
      description: >-
        One compartment, with tabs, each its own component under cos/ui/compartment/<tab>/: Overview (its card, its links and contract
        hash), Rewind (checkpoints and versions on one timeline: take, restore, branch, pause, resume), Versions (Versionium history,
        restore), Diagnostics (health, failure modes, logs, the debug report), Data (its data through its own routes, MG_D3), Resources
        (caps set and read back), Settings (resolved values, each with its layer, edit and reset), Macros (run one here), Tools (the
        commands its registry declares), Logs (its output, live).
      deps: [{ name: ui-core }, { name: state-manager }, { name: resources }, { name: settings }, { name: macros-and-hats }]
      schema_refs: [SupervisedSystem, SettingsLayer, Macro]
      exports: ["one folder per tab, each index.html, page.css, page.js, declared in the registry"]
      gate_pipeline: ["GATE-MGUI-CP-001: handshake per tab", "GATE-MGUI-CP-002: acts confirmed"]
      behavioral_contracts: ["a tab whose backend phase is not built says so, with the phase, instead of hiding (§1.2)"]
      error_paths: ["a tab's call refused → shown in that tab only"]
      acceptance: ["in Clear Glass: a compartment made, versioned, throttled, branched, rewound and destroyed from the tabs"]

    - id: MOD-MG-UI-CATALOG
      name: ui-catalog
      uuid: nexus-cos-manager-ui-catalog-v1-0000-2026-1030-001
      path: cos/ui/catalog
      phase: MG9_the_console_ui
      description: "Browser and editor per kind (archetypes, schemas, blueprints, templates): list, read, a form built from the schema and raw, diff two versions, validate, save, fork, revert; and the factory's New compartment."
      deps: [{ name: ui-core }, { name: catalog }, { name: factory }]
      schema_refs: [Category]
      exports: ["index.html, page.css, page.js; routes /api/cos/catalog/*, POST /api/cos/compartments"]
      gate_pipeline: ["GATE-MGUI-CT-001: handshake", "GATE-MGUI-CT-002: validate before save"]
      behavioral_contracts: ["a schema error shows beside its field"]
      error_paths: ["save refused → the item kept in the editor, nothing lost"]
      acceptance: ["in Clear Glass: a template forked, edited, refused once by its schema, saved, and a compartment made from it"]

    - id: MOD-MG-UI-AUTOMATION
      name: ui-automation
      uuid: nexus-cos-manager-ui-automation-v1-0000-2026-1030-001
      path: cos/ui/automation
      phase: MG9_the_console_ui
      description: "Macros (list, edit steps as command rows, parameters, targets, run, last run) and rules, including the supervisor's policy (SupervisorPolicy) as a settings form: boot set, restart, circuit, idle, memory floors."
      deps: [{ name: ui-core }, { name: macros-and-hats }, { name: settings }]
      schema_refs: [Macro, SupervisorPolicy]
      exports: ["index.html, page.css, page.js; routes /api/cos/macros, /api/cos/policy"]
      gate_pipeline: ["GATE-MGUI-AU-001: handshake", "GATE-MGUI-AU-002: policy change confirmed"]
      behavioral_contracts: ["each policy value shows its layer"]
      error_paths: ["a run that stops → the failed step highlighted with its error"]
      acceptance: ["in Clear Glass: the restart backoff changed and read back; a macro run against a fixture compartment"]

    - id: MOD-MG-UI-CATEGORIES
      name: ui-categories
      uuid: nexus-cos-manager-ui-categories-v1-0000-2026-1030-001
      path: cos/ui/categories
      phase: MG11_category_manager_ui
      description: "Categories as a list; a category page with its archetype or template, its schema (form and raw), its settings and members. Systems is one of them."
      deps: [{ name: ui-core }, { name: categories }]
      schema_refs: [Category]
      exports: ["index.html, page.css, page.js; routes /api/cos/categories/*"]
      gate_pipeline: ["GATE-MGUI-CA-001: handshake"]
      behavioral_contracts: ["remove says it archives"]
      error_paths: ["a refused edit → why, beside the field"]
      acceptance: ["in Clear Glass: a category made, edited against its schema and removed; systems shows every system compartment"]

    - id: MOD-MG-EXE-MANAGER
      name: exe-manager
      uuid: nexus-cos-manager-exe-v1-0000-2026-1030-001
      path: cos/app/desktop/main.js
      phase: MG12_the_exe_is_the_compartment_manager
      description: "cos.exe as the manager's window: it starts the manager server if it is not running, and shows /ui/shell/. Its release list, update policy and logs (COSA) become a Releases page in the same shell, not a second window."
      deps: [{ name: manager-server }, { name: ui-shell }, { name: cos-runtime }]
      schema_refs: [PageComponent]
      exports: ["the window on http://127.0.0.1:7799/ui/shell/", "a Releases page (cos/ui/releases) over the exe's existing controller"]
      gate_pipeline: ["GATE-MG12-001: manager reached", "GATE-MG12-002: one window"]
      behavioral_contracts: ["closing the exe leaves the systems running", "the same pages open in Clear Glass at the same address"]
      error_paths: ["the manager cannot start → the window says why and offers its log"]
      acceptance: ["in Clear Glass on the exe's pages: a fixture compartment rewound, its diagnostics read, a version restored, its data browsed, a tool run"]

    - id: MOD-MG-EXE-CLI
      name: exe-cli
      uuid: nexus-cos-manager-exe-cli-v1-0000-2026-1030-001
      path: cos/app/cli.js
      phase: MG13_cli_in_the_exe
      description: "`COS.exe <command>` runs any row headless (`status`, `ps`, `start <system>`, `cos category list` …) against the manager server, through CON1's one door when Idearium is up."
      deps: [{ name: manager-server }, { name: manager-contract }]
      schema_refs: [SupervisedSystem]
      exports: ["COS.exe <row> [args] → prints the result, exit code 0 or 1"]
      gate_pipeline: ["GATE-MG13-001: row in the contract", "GATE-MG13-002: person act from a terminal is the person's"]
      behavioral_contracts: ["the same rows the pages and agents run"]
      error_paths: ["manager not running → says so and how to start it, exit 1"]
      acceptance: ["`COS.exe ps` and `COS.exe cos category list` print without opening a window"]

    - id: MOD-MG-THUMBS
      name: live-thumbnails
      uuid: nexus-cos-manager-thumbs-v1-0000-2026-1030-001
      path: cos/app/desktop/thumbnails.js
      phase: MG14_live_thumbnails
      description: "Each compartment's own UI (the index.html its registry declares) rendered off-screen and shown in the tree and the Overview cards; refreshed on change or every few seconds, paused when hidden; one without a UI says so."
      deps: [{ name: exe-manager }, { name: ui-overview }]
      schema_refs: [SupervisedSystem]
      exports: ["thumbnail(compartmentId) → png data url | { none: why }"]
      gate_pipeline: ["GATE-MG14-001: the UI the registry declares", "GATE-MG14-002: paused when hidden"]
      behavioral_contracts: ["a thumbnail is a picture; clicking opens the real UI"]
      error_paths: ["render fails → the status card, with why"]
      acceptance: ["a fixture compartment's index.html appears as its thumbnail and updates after a change; one with no UI says it has none"]

    # ── add, deploy, connect, import, export: the system as one .spec (MG19–MG21, his 2026-10-30) ──

    - id: MOD-MG-SPEC-BUNDLE
      name: spec-bundle
      uuid: nexus-cos-manager-spec-bundle-v1-0000-2026-1030-001
      path: idearium/repo/spec-bundle.js
      phase: MG19_the_spec_bundle
      description: >-
        Idearium packs and unpacks a SpecBundle (it owns repos and their history). Export: the repo's .spec as the metadata, the tree and every
        history record (Versionium versions and commits by its route, conversations, notes and decisions, phases, changelogs, .benchmark nodes)
        in the payload. Import: a .spec bundle, or any zip with a .spec in it, becomes the whole project repo through repo.import-archive, its
        history restored beside it. Compare: two bundles, or a bundle and a repo, side by side: metadata, files and history.
      deps: [{ name: idearium-repos }]
      schema_refs: [SpecBundle]
      exports: ["pack(repoUuid, { by }) → SpecBundle (written to a file)", "unpack(file) → { spec, files, history }", "read(file) → the metadata only",
        "compare(a, b) → { meta, files: { added, removed, changed }, history }", "routes GET /api/repos/:uuid/export.spec, POST /api/repos/import (gains .spec),",
        "POST /api/repos/compare; rows `repo export`, `repo import`, `repo compare`"]
      gate_pipeline: ["GATE-MG19-001: format and hash", "GATE-MG19-002: never overwrite", "GATE-MG19-003: recorded in Versionium"]
      behavioral_contracts: ["export then import gives the same tree and the same history counts and hashes", "secrets are never packed (the redaction objectChange uses)"]
      error_paths: ["a history part its owner cannot serve (Versionium down) → packed as missing with why, never silently left out"]
      acceptance: ["a repo exported, imported as a new repo, and compared with the first: no difference but the uuid"]

    - id: MOD-MG-INTAKE
      name: intake
      uuid: nexus-cos-manager-intake-v1-0000-2026-1030-001
      path: cos/manager/intake.js
      phase: MG20_add_deploy_connect
      description: >-
        One way a system enters COS, four kinds. Import: a dropped file is read first and said: a COS release zip (COSA1, unchanged), a zip with
        a .spec, or a .spec bundle (both go to Idearium's import, then a compartment is made for the repo, CS9). Deploy: a new compartment from a
        template or archetype (the factory, MG8). Connect: a system already running elsewhere, by its address; COS shakes hands with it (§5.11)
        and watches it without running it. Export: a compartment as a SpecBundle (Idearium's pack, plus how COS ran it).
      deps: [{ name: spec-bundle }, { name: supervisor }, { name: factory }, { name: cos-runtime }]
      schema_refs: [SpecBundle, SupervisedSystem]
      exports: ["inspect(file) → { kind, meta, will }", "add({ file|template|address }, { by }) → { compartmentId, steps }", "exportOf(compartmentId, { by }) → file",
        "routes POST /api/cos/intake/inspect, POST /api/cos/intake, GET /api/cos/compartments/:id/export.spec; rows `cos add`, `cos export`"]
      gate_pipeline: ["GATE-MG20-001: inspected and said before anything is written", "GATE-MG20-002: person act", "GATE-MG20-003: each step a gate (architecture-spec RULE D)", "GATE-MG20-004: recorded"]
      behavioral_contracts: ["each step (unpack, import, compartment, start, health) is a gate with its record; a failure says the step", "a connected system is never started or stopped by COS"]
      error_paths: ["Idearium down → the file is kept in COS's inbox and the import waits for it, said", "handshake refused → not connected, with the reason"]
      acceptance: ["a zip with a .spec dropped on COS becomes a repo in Idearium and a running compartment; a .spec bundle the same, with its history; a template deploys; a running address connects"]

    - id: MOD-MG-UI-ADD
      name: ui-add
      uuid: nexus-cos-manager-ui-add-v1-0000-2026-1030-001
      path: cos/ui/add
      phase: MG21_the_add_screen
      description: >-
        Add a system: drop a file anywhere on the window or on this page, or pick Deploy (a template or archetype from the catalog) or Connect
        (an address). Before anything happens the page shows what it found (the kind, the spec's name, version and history counts) and what it
        will do; Add runs it, each step shown as it passes. Export sits on every compartment's Overview tab and on the Overview cards.
      deps: [{ name: ui-core }, { name: intake }]
      schema_refs: [SpecBundle]
      exports: ["index.html, page.css, page.js; routes /api/cos/intake/*, GET /api/cos/compartments/:id/export.spec"]
      gate_pipeline: ["GATE-MGUI-ADD-001: handshake", "GATE-MGUI-ADD-002: inspected before Add"]
      behavioral_contracts: ["a drop shows what it is before it is used"]
      error_paths: ["a step fails → the step and its error shown; what passed stays"]
      acceptance: ["in Clear Glass: a zip with a .spec dropped, shown, added and running; exported again from its card"]

    # ── builder, resources, network, storage, state and merge (MG22–MG27, his 2026-10-30) ───────────

    - id: MOD-MG-BUILDER
      name: builder
      uuid: nexus-cos-manager-builder-v1-0000-2026-1030-001
      path: cos/manager/builder.js
      phase: MG22_template_and_archetype_builder
      description: >-
        Build a template or an archetype, not only edit one: start blank or from an existing one, add its parts from the component catalog
        (cos/archetype/components) and its blueprint, declare its runtime, its default allocation, networks and volumes, its settings schema
        and its UI; validate against its schema; try it in a scratch compartment (built, started, health checked, its behaviour schemas run,
        then removed) before it is saved as a new version.
      deps: [{ name: catalog }, { name: factory }, { name: archetype-schema }]
      schema_refs: [ResourceAllocation, VirtualNetwork, StorageVolume]
      exports: ["draft({ from? }) → draftId", "set(draftId, patch)", "validate(draftId)", "trial(draftId, { by }) → { ok, health, behaviour, log }", "save(draftId, { by }) → id",
        "routes /api/cos/builder/*; rows `cos build template|archetype`"]
      gate_pipeline: ["GATE-MG22-001: schema", "GATE-MG22-002: trial passed before save (or saved as unproven, said)", "GATE-MG22-003: recorded"]
      behavioral_contracts: ["a trial compartment never outlives the trial", "a draft is kept until saved or discarded"]
      error_paths: ["the trial fails → the step and its log; the draft kept"]
      acceptance: ["a web-server template built from parts, tried, saved, and deployed by the factory"]

    - id: MOD-MG-BALANCER
      name: allocation-and-balance
      uuid: nexus-cos-manager-balancer-v1-0000-2026-1030-001
      path: cos/manager/balancer.js
      phase: MG23_allocation_and_balance
      description: >-
        The host is a pool; each compartment is allocated from it (ResourceAllocation) and throttled to it (MG4's caps). RAID is the load
        balancer: COS hands it the .benchmark nodes and usage, RAID decides (spawn or despawn a replica, move load, throttle a noisy neighbour,
        within each allocation's min and max), and COS acts and names the decision. A person can pin an allocation; RAID never moves a pin.
      deps: [{ name: resources }, { name: supervisor }, { name: raid-port }]
      schema_refs: [ResourceAllocation, SupervisedSystem]
      exports: ["pool() → { cpu, memoryMB, storageMB, reserved }", "allocate(id, alloc, { by })", "pin(id, { by })", "balance() → [{ act, compartment, decision }]",
        "routes /api/cos/pool, /api/cos/compartments/:id/allocation, POST /api/cos/balance; rows `cos alloc`, `cos balance`"]
      gate_pipeline: ["GATE-MG23-001: within the pool", "GATE-MG23-002: RAID decided", "GATE-MG23-003: applied and read back", "GATE-MG23-004: ledger"]
      behavioral_contracts: ["critical systems are allocated first", "every balance act names the RAID decision and the .benchmark it answered"]
      error_paths: ["over-commit → refused with the numbers", "RAID down → no balance act, said"]
      acceptance: ["two fixture compartments under load: RAID moves load to the idle one, the act on the ledger with its decision"]

    - id: MOD-MG-NETWORK
      name: network-manager
      uuid: nexus-cos-manager-network-v1-0000-2026-1030-001
      path: cos/manager/network.js
      phase: MG24_network_manager
      description: >-
        Virtual networks: make one (isolated, nat or bridged), join compartments to it, give them names (his dns engine) and rules (his
        firewall engine), and bridge it to another network or to the host to run a server or service on it: through his proxy or tunnel
        engine, or a tap bridge where the host allows it. Machine compartments join by QEMU netdev; process compartments by port mapping
        through the proxy.
      deps: [{ name: net-engines }, { name: qemu-runtime }, { name: supervisor }]
      schema_refs: [VirtualNetwork]
      exports: ["list()", "create(net, { by })", "join(netId, compartment, { ports }, { by })", "bridge(netId, to, { ports, via }, { by })", "rules(netId, rules, { by })",
        "routes /api/cos/networks[/:id]; rows `cos net`"]
      gate_pipeline: ["GATE-MG24-001: person act", "GATE-MG24-002: the engine it needs is up", "GATE-MG24-003: reachability checked after"]
      behavioral_contracts: ["isolated by default", "a bridge to the host LAN is a person's act, said as exposing it"]
      error_paths: ["tap without admin → refused, proxy or tunnel offered", "a port taken → refused naming the holder"]
      acceptance: ["a web-server compartment on an isolated network, bridged to the host on one port, answers from the host and from no other compartment"]

    - id: MOD-MG-STORAGE
      name: storage-manager
      uuid: nexus-cos-manager-storage-v1-0000-2026-1030-001
      path: cos/manager/storage.js
      phase: MG25_storage_manager
      description: >-
        Storage locations (a folder, a drive, his object-storage engine) and volumes cut from them with a quota, mounted into compartments
        (process: a path the wall allows; machine: a virtio disk), their use read back, taken with the compartment's version when set.
      deps: [{ name: net-engines }, { name: supervisor }, { name: state-manager }]
      schema_refs: [StorageVolume]
      exports: ["locations()", "addLocation(loc, { by })", "createVolume(locId, { quotaMB }, { by })", "mount(volId, compartment, { at, mode }, { by })", "usage(volId)",
        "routes /api/cos/storage/*; rows `cos storage`"]
      gate_pipeline: ["GATE-MG25-001: person act", "GATE-MG25-002: quota within the location", "GATE-MG25-003: mounted and read back"]
      behavioral_contracts: ["removing a volume archives its data (§0.3)"]
      error_paths: ["location gone or full → volumes unavailable, said, nothing deleted"]
      acceptance: ["a volume made on a folder location, mounted into a fixture compartment, written, its use read back, taken with a version"]

    - id: MOD-MG-MERGE
      name: branch-benchmark-merge
      uuid: nexus-cos-manager-merge-v1-0000-2026-1030-001
      path: cos/manager/merge.js
      phase: MG26_branch_benchmark_merge
      description: >-
        A branch of a compartment (or of the whole system state) runs beside its base under the same load (SN2), is benchmarked (.benchmark
        nodes, SN3), friction tested (FrictionScore, the behaviour schemas, the tests), and merged back only when the MergeReport says merge, or
        a person takes an ask. The merge goes through the one branch interface (lib/safe-apply.js mergeBack, RAID-gated).
      deps: [{ name: state-manager }, { name: safe-apply }, { name: raid-port }]
      schema_refs: [MergeReport, SystemState]
      exports: ["benchmark(branch, { load, durationMs }) → .benchmark ids", "friction(branch) → MergeReport", "merge(branch, { by }) → version",
        "routes /api/cos/branches/:id/(benchmark|friction|merge); rows `cos branch bench|friction|merge`"]
      gate_pipeline: ["GATE-MG26-001: same load on both", "GATE-MG26-002: friction and behaviour measured", "GATE-MG26-003: verdict", "GATE-MG26-004: version first, then mergeBack"]
      behavioral_contracts: ["no merge without a MergeReport", "a refused merge keeps the branch"]
      error_paths: ["a measurement missing → ask, never merge"]
      acceptance: ["a slower branch is refused with its numbers; a faster one with equal friction merges, the target versioned first"]

    - id: MOD-MG-UI-TIMELINE
      name: ui-timeline
      uuid: nexus-cos-manager-ui-timeline-v1-0000-2026-1030-001
      path: cos/ui/timeline
      phase: MG27_state_and_resource_screens
      description: >-
        The snapshot browser: a timeline per compartment and one for the whole system (SystemState), branches as lanes, versions and live
        checkpoints as points. Pick one to see its files (diff to now), its machine, its registry and its allocation; restore, branch, open
        as a compartment, compare two, label or pin, benchmark a branch, read its MergeReport and merge. Sections: lanes, detail, compare,
        merge report, each its own component.
      deps: [{ name: ui-core }, { name: state-manager }, { name: branch-benchmark-merge }]
      schema_refs: [SystemState, MergeReport]
      exports: ["index.html, page.css, page.js and sections/ (lanes, detail, compare, merge); routes /api/cos/compartments/:id/versions, /api/cos/states, /api/cos/branches/*"]
      gate_pipeline: ["GATE-MGUI-TL-001: handshake", "GATE-MGUI-TL-002: restore and merge confirmed"]
      behavioral_contracts: ["a section talks to another only by the registry bus"]
      error_paths: ["a version that no longer verifies → shown red with the part that fails"]
      acceptance: ["in Clear Glass: a system state taken, a compartment branched, benchmarked, refused, changed, merged, and the whole system restored to the first state"]

    - id: MOD-MG-UI-RESOURCES
      name: ui-resources
      uuid: nexus-cos-manager-ui-resources-v1-0000-2026-1030-001
      path: cos/ui/resources
      phase: MG27_state_and_resource_screens
      description: >-
        The host pool and every allocation (sliders for share, memory, quota, replicas; pin), RAID's balance decisions as they happen, the
        networks as a map (members, bridges, rules), and the storage locations and volumes. Sections: pool, allocations, balancer log, network
        map, storage, each its own component.
      deps: [{ name: ui-core }, { name: allocation-and-balance }, { name: network-manager }, { name: storage-manager }]
      schema_refs: [ResourceAllocation, VirtualNetwork, StorageVolume]
      exports: ["index.html, page.css, page.js and sections/; routes /api/cos/pool, /api/cos/networks/*, /api/cos/storage/*, /api/cos/balance"]
      gate_pipeline: ["GATE-MGUI-RS-001: handshake", "GATE-MGUI-RS-002: changes confirmed"]
      behavioral_contracts: ["every value shows enforced, not-enforced or failed, as read back"]
      error_paths: ["an over-commit refused → shown on the slider with the numbers"]
      acceptance: ["in Clear Glass: a compartment's memory cut and read back, a network made and bridged, a volume mounted"]

    - id: MOD-MG-UI-BUILDER
      name: ui-builder
      uuid: nexus-cos-manager-ui-builder-v1-0000-2026-1030-001
      path: cos/ui/builder
      phase: MG22_template_and_archetype_builder
      description: "The builder's screen: parts from the catalog, runtime, allocation, networks, volumes, settings schema, UI; validate; Try (the trial's steps and log); Save."
      deps: [{ name: ui-core }, { name: builder }]
      schema_refs: [ResourceAllocation]
      exports: ["index.html, page.css, page.js and sections/ (parts, runtime, resources, settings, trial); routes /api/cos/builder/*"]
      gate_pipeline: ["GATE-MGUI-BD-001: handshake", "GATE-MGUI-BD-002: validate before Try"]
      behavioral_contracts: ["the draft is kept between visits"]
      error_paths: ["a trial fails → the step and its log shown in the trial section"]
      acceptance: ["in Clear Glass: a template built, tried and saved"]

    # ── cos/dependencies and the cockpit on today's door (MG28–MG30, his 2026-10-30) ─────────────────

    - id: MOD-MG-DEPS
      name: cos-dependencies
      uuid: nexus-cos-manager-deps-v1-0000-2026-1030-001
      path: cos/dependencies/check.js
      phase: MG28_cos_dependencies
      description: >-
        cos/dependencies holds the files COS takes from outside Nexus, copied whole with VENDOR.lock.json: Emerge (its emerge/ package,
        CIE-EG, BUILDING.md; github.com/HorrisEllis/Emerge at its commit), the ERAVOS canvas and schemas (github.com/HorrisEllis/Eravos-Canvas
        at its commit), his update system, his SNR Passthrough (the door's template) and the ESS spec text (from his 2026-10-30 uploads in
        _archive). check.js recomputes every hash and fails on any difference. Each set names the phase that will consume it.
      deps: []
      schema_refs: [VendorLock]
      exports: ["node cos/dependencies/check.js → exit 0 when every file matches its lock, 1 naming each mismatch", "verify(lock, root) → { ok, mismatches }"]
      gate_pipeline: ["GATE-MG28-001: every file in the lock", "GATE-MG28-002: every hash matches", "GATE-MG28-003: no file outside the lock"]
      behavioral_contracts: ["copied, never edited in place", "nothing in COS requires a set until its consumer phase does"]
      error_paths: ["a source not reachable at copy time → that set is left out and said, never partly copied"]
      acceptance: ["check passes on the fresh copy; a one-byte edit makes it fail naming the file"]

    - id: MOD-MG-UI-SERVE
      name: cockpit-server
      uuid: nexus-cos-manager-ui-serve-v1-0000-2026-1030-001
      path: cos/ui/serve.js
      phase: MG18_the_supervisor_screen
      description: >-
        COS's cockpit server (MG_D10): serves cos/ui's pages on 127.0.0.1 (COS_UI_PORT, default 7797) and forwards /ap/* to the one endpoint,
        autopilot's door on :7799 (later COS's own manager, the same routes, MG-003), so the pages are same-origin and need no CORS. It forwards
        only the routes it lists; a POST is forwarded only when its Origin is the cockpit's own and its Host is loopback (no other website can
        restart a system through it). Writes nothing.
      deps: [{ name: manager-contract }]
      schema_refs: [SupervisedSystem]
      exports: ["node cos/ui/serve.js [--port 7797] [--door http://127.0.0.1:7799]", "GET /ui/* (static, path-safe)", "GET /ap/(status|ledger…|graph|tables…|files/…|contract-map/:name|warp)",
        "POST /ap/(control/:name/(restart|stop|start)|spawn/:name|run-tests/:name)"]
      gate_pipeline: ["GATE-MGSV-001: route on the allowlist", "GATE-MGSV-002: POST origin and host checked", "GATE-MGSV-003: path stays inside cos/ui"]
      behavioral_contracts: ["the door's answer is passed through unchanged, status code included", "a door that does not answer is a 502 naming the door"]
      error_paths: ["a disallowed route → 404 naming it", "a cross-origin POST → 403 naming the origin"]
      acceptance: ["a page reads /ap/status same-origin; a POST with another Origin is refused 403; ../ in a path is refused"]

    - id: MOD-MG-UI-THEME
      name: cockpit-theme
      uuid: nexus-cos-manager-ui-theme-v1-0000-2026-1030-001
      path: cos/ui/core/theme.css
      phase: MG18_the_supervisor_screen
      description: >-
        Idearium's look, forked for COS (MG_D11): the --nx-* palettes (nexus, midnight, graphite), accents and motion from
        idearium/ui/css/nexus-theme.css, and its self-hosted fonts (Space Grotesk, DM Mono, Bebas Neue, with their licenses) copied into cos/ui;
        open spacing (his "beautiful, not cramped, open"). A test fails when COS's tokens differ from Idearium's, the pattern Idearium already
        keeps with the main UI (test-idearium-theme).
      deps: [{ name: ui-core }]
      schema_refs: [PageComponent]
      exports: ["theme.css: --nx-* tokens and the spacing scale", "fonts/*.woff2 + LICENSE-*.txt"]
      gate_pipeline: ["GATE-MGTH-001: tokens equal Idearium's"]
      behavioral_contracts: ["a palette change in Idearium shows as a failing test in COS until copied"]
      error_paths: ["a token missing or different → the test names it"]
      acceptance: ["tests/modules/test-cos-ui-theme.test.js passes; changing one token makes it fail naming it"]

    - id: MOD-MG-CONTAINER-ROWS
      name: container-rows
      uuid: nexus-cos-manager-container-rows-v1-0000-2026-1030-001
      path: idearium/cli/route-commands.js
      phase: MG29_the_cockpit
      description: >-
        The command rows the cockpit's tabs stand on, added before the screen (§3.4: API → CLI → UI): `cos ledger [system [hook [day]]]`,
        `cos contract <system>`, `cos files <system> [path]`, `cos tables [name]`, `cos test <system>` (a person's act), over the same door
        routes. Status and control already have rows (`repo system`).
      deps: [{ name: manager-contract }]
      schema_refs: [SupervisedSystem]
      exports: ["rows: cos ledger, cos contract, cos files, cos tables, cos test"]
      gate_pipeline: ["GATE-MGCR-001: each row's route is on the door", "GATE-MGCR-002: cos test is personOnly"]
      behavioral_contracts: ["agents get every read a person gets; running tests is a person's act"]
      error_paths: ["the door down → the row says so, with the door's address"]
      acceptance: ["each row prints what the matching tab shows"]

    - id: MOD-MG-UI-COCKPIT
      name: ui-cockpit
      uuid: nexus-cos-manager-ui-cockpit-v1-0000-2026-1030-001
      path: cos/ui/cockpit
      phase: MG29_the_cockpit
      description: >-
        One system's full cockpit, the tablet's container (docs/nexus-tablet.spec container_model): tabs Overview (state, pid, port, health,
        restarts, crashes, down since; start, stop, restart, spawn, each confirmed), API (its contract), Data (the store's tables, read-only),
        Files (its data tree, read-only), Events (its ledger by hook and day), Tests (the real run-all filtered to it, one at a time), and
        Snapshot (said as not built, naming CS1 and MG3). Each tab is its own section folder (section.html, section.css, section.js). Writes go
        only through the door (tablet boundary: mutation through the owner's API).
      deps: [{ name: ui-core }, { name: ui-shell }, { name: cockpit-server }, { name: container-rows }]
      schema_refs: [SupervisedSystem, SupervisorLedgerEntry]
      exports: ["index.html, page.css, page.js and sections/ (overview, api, data, files, events, tests, snapshot)"]
      gate_pipeline: ["GATE-MGCK-001: handshake", "GATE-MGCK-002: acts confirmed", "GATE-MGCK-003: a tab whose source is down says which and why"]
      behavioral_contracts: ["observation is disk-backed where the door is (ledger, tables, files), so a wedged system still shows why", "no tab writes a file or a table"]
      error_paths: ["the door down → every tab shows 'COS's door is not answering' with its address, never an empty page"]
      acceptance: ["driven in Clear Glass (glass.js) against a running door: a system's tabs open, its events and files read, a restart confirmed and seen on its ledger"]

    - id: MOD-MG-UI-REGISTRY-BUS
      name: ui-registry-bus
      uuid: nexus-cos-manager-ui-registry-bus-v1-0000-2026-1030-001
      path: cos/registry-components.js
      phase: MG30_pages_on_the_registry_bus
      description: >-
        MG_D7 completed: once COS's registry is accepted (DB16), every page and section is declared in it with the events it emits and hears,
        and ui/core's bus checks against the registry instead of the page's own declaration (MG_D12's interim).
      deps: [{ name: ui-core }]
      schema_refs: [PageComponent]
      exports: ["cos/registry-components.js: each page and section as a component with its emits and listens"]
      gate_pipeline: ["GATE-MGRB-001: every page declared", "GATE-MGRB-002: an undeclared event refused and shown"]
      behavioral_contracts: ["one declaration per page: the registry"]
      error_paths: ["a page not in the registry → the shell does not load it and says which"]
      acceptance: ["in Clear Glass: a section emitting an undeclared event is refused and shows it"]

  events:
    cos:
      - "cos.system.state { name, state, pid, by }"
      - "cos.system.restarted { name, count, backoffMs }"
      - "cos.circuit.opened { name, why } / cos.circuit.reset { name, by }"
      - "cos.ledger { id, kind, system, why, by }"
      - "cos.proposal.held { id, by, verb } / cos.proposal.taken { id, by }"
      - "cos.policy.changed { keys, by }"
      - "cos.handover { from, version }"
      - "cos.intake.added { kind, compartment, by } / cos.intake.held { file, why }"
      - "cos.export.written { compartment, sha256, by }"
      - "cos.balance.acted { act, compartment, decision }"
      - "cos.network.changed { id, by } / cos.storage.changed { id, by }"
      - "cos.state.taken { id, by } / cos.merge.verdict { branch, verdict }"

  enforcement:
    gates:
      - { id: GATE-MG-ONE-SUPERVISOR, name: one-supervisor, severity: fatal, check: "no second process spawning Nexus systems while the manager runs", on_failure: "the launcher exits; the test fails" }
      - { id: GATE-MG-DECLARED, name: declared, severity: fatal, check: "the boot plan comes from compartment.json files only", on_failure: "suite red" }
      - { id: GATE-MG-DOOR, name: door-kept, severity: fatal, check: "every autopilot route answers the same shape", on_failure: "suite red" }
      - { id: GATE-MG-UI-HANDSHAKE, name: ui-handshake, severity: fatal, check: "pages call only declared routes after the handshake", on_failure: "refused and shown" }
      - { id: GATE-MG-PAGE-ISOLATED, name: page-isolated, severity: error, check: "no page imports another page's files; only cos/ui/core", on_failure: "suite red" }
      - { id: GATE-MG-PERSON, name: person-acts, severity: fatal, check: "acts by a person or his rule; agents propose", on_failure: "403, held as a proposal" }
      - { id: GATE-MG-RECORDED, name: recorded, severity: error, check: "every change through cos/app/versionium.js record()", on_failure: "a gap listed by versionium pending" }
      - { id: GATE-MG-DATA-ROUTES, name: data-routes, severity: error, check: "no new reader of a compartment's files; legacy door routes counted", on_failure: "the boundary ratchet fails" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node; every MG phase names it and its blocks"
    - "per module: its acceptance lines; UI acceptance in Clear Glass (clear-glass/src/driver/glass.js), never Playwright"
