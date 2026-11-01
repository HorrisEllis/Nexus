spec:

  # ════════════════════════════════════════════════════════════════════════
  # cos/spec/compartment.spec — the compartment, whole (CP0 of docs/2026-11-01-the-compartment-phasemap.spec). It starts with the
  # parts built first (CP1a, CP6a, CP5a, CP7a) and grows a module per phase as each CP phase lands, so the compartment is specced in one
  # place (CP_D0, his "each compartment should be all of it. not split up every where"). Format: emerge's module spec, compiled by
  # lib/emerge/compiler/kg-builder.js at specDepth 1.0, no BLACK node (tests/modules/test-substrate-spec.test.js SS-01, compile only
  # until every CP phase names this spec).
  # ════════════════════════════════════════════════════════════════════════

  meta:
    name:        compartment
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-11-01T00:00:00Z
    status:      specced
    uuid:        nexus-cos-compartment-spec-v1-0000-2026-1101-jamesbrooks-001
    origin: >-
      James, 2026-11-01: "continue moving the rest of the systems into cos. then i want resource management for each cos compartment, and
      snapsjot" · "also can you add the nexus-sync options to the control panel". Before it, the same day: "just dont have redundancy. like
      each compartment should be all of it. not split up every where." (CP_D0) · "each server.js in each system needs to connect to the
      component registry, then cos connects to the server.js. isolated and sandboxed." (DO_D9) · "once each system is in cos, we can have
      resource management per system." (BC_D3). The direction and the calls are his; the module cut, the enforcement split and the reading of
      what a snapshot holds (CP_D7, to confirm) are the coder's.
    purpose: >-
      Every Nexus system runs in its own COS compartment, behind its wall, started and watched by COS's supervisor. Each compartment has
      caps COS sets and reads back from the OS, an account of what it used, snapshots of its state that can be restored, and its part in the
      Nexus repo sync, all on COS's routes, command rows and the compartment's control panel (the cockpit).
    target_runtime: [node]
    language_stack: [javascript, html, css]
    paradigm: [one-supervisor, declared-by-the-system, read-back-from-the-os, archive-never-delete, the-ui-floats]
    axioms: ["§5.9/§5.15 sovereignty: each system declares its own compartment; COS reads it; other systems are asked by route",
      "§0.0 truth: what the OS cannot enforce is said as not enforced", "§0.3 nothing lost: restore archives", "§17.12 recorded in Versionium",
      "§8.6 reuse: the supervisor, boundary.js, SnapshotEngine, proposals and lib/versionium-record.js are what this stands on"]
    deps:
      - { name: js-yaml, version: ">=4.1.0", required: true, purpose: "a system's .cos declaration" }

    constraints:
      - id: CP-001
        description: "A system's wall and caps are declared in the system's own compartment.json (or .cos); COS reads them and never writes into a system's folder."
        type: hard
        enforced_by: [GATE-CP-DECLARED-BY-SYSTEM]
      - id: CP-002
        description: "A wall in audit mode is said as audit on every surface; only enforce is called isolation."
        type: hard
        enforced_by: [GATE-CP-AUDIT-SAID]
      - id: CP-003
        description: "Every cap shows how it was applied, read back from the OS: enforced, watched, not-enforced (with why) or failed (with the error)."
        type: hard
        enforced_by: [GATE-CP-READ-BACK]
      - id: CP-004
        description: "A restore never deletes: what it replaces or removes is moved into the archive, and a snapshot of now is taken first."
        type: hard
        enforced_by: [GATE-CP-ARCHIVE]
      - id: CP-005
        description: "A start, stop, restart, cap change, snapshot or restore names who acted (a person, or a rule by id); an agent proposes."
        type: hard
        enforced_by: [GATE-CP-PERSON]

  schemas:

    - id: CompartmentWall
      name: CompartmentWall
      description: "One process's wall, as its system declares it and as COS's ledger shows it working."
      fields:
        system:      "string — the system that declares it"
        name:        "string — the process (a system may declare more than one)"
        compartment: "string — nexus-self-<system>"
        mode:        "string — enforce | audit | none"
        via:         "string — --require (node) | NODE_OPTIONS (electron) | none"
        allow:       "string[] — the folders the wall lets it load from, absolute"
        crossings:   "object[] — { file, from, at } each crossing the wall said since the process last started"
        enforceReady: "boolean — audit, running past stableMs, and no crossing said"
      behavioral_contracts: ["allow equals the census's boundaryFor(system) when the declaration is written", "crossings come only from the wall's own lines on COS's ledger"]
      error_paths: ["no declaration → mode none, said as bare", "a wall line that does not parse → kept as a line, not a crossing"]

    - id: CompartmentCaps
      name: CompartmentCaps
      description: "What one compartment may use, by layer, and how each part was applied (ResourceAllocation's memory and cpu parts, cos-manager.spec)."
      fields:
        heapMB:      "number — V8 --max-old-space-size at spawn (layer default: the supervisor's maxOldSpaceMB)"
        rssLimitMB:  "number|null — resident memory COS watches; null is no limit"
        onOver:      "string — warn | restart: what COS does when resident memory passes rssLimitMB"
        priority:    "string — high | above-normal | normal | below-normal | low"
        layers:      "object — { <key>: default | declared | his } where each value came from"
        applied:     "object — { heap, priority, rss, cpuShare: { state: enforced|watched|not-enforced|failed|pending, readBack?, why? } }"
      behavioral_contracts: ["his layer wins over declared, declared over default", "applied is what the OS says now, never what was asked"]
      error_paths: ["a value out of range → refused with the range", "the OS refuses a priority → failed, with its error; the compartment runs on"]

    - id: UsageSample
      name: UsageSample
      description: "One reading of one compartment's process from the OS."
      fields:
        at:      "number"
        rssMB:   "number|null"
        cpuSec:  "number|null — CPU seconds since the process started"
        cpuPct:  "number|null — from the change in cpuSec over the change in time, one core = 100"
        reader:  "string — ps | powershell | tasklist | wmic"
      behavioral_contracts: ["a value the reader cannot give is null, said with the reader, never 0"]
      error_paths: ["the reader fails → notRead with its error"]

    - id: CompartmentSnapshot
      name: CompartmentSnapshot
      description: "A compartment's state at one moment: its data folder, every file's bytes, by SnapshotEngine."
      fields:
        id:        "string — SnapshotEngine's snapId"
        system:    "string"
        dataDir:   "string — the folder taken, relative to the root"
        label:     "string|null"
        by:        "string"
        live:      "boolean — taken while the process ran (the files as they were on disk)"
        files:     "number"
        bytes:     "number"
        createdAt: "number"
        version:   "string|null — the Nexus version running when it was taken"
      behavioral_contracts: ["bytes are content-addressed: a file unchanged since the last snapshot is stored once", "a restore takes one of now first, labelled before-restore"]
      error_paths: ["no data folder declared → refused, said", "over the size limit → refused with the size, unless forced"]

    - id: NexusSyncSettings
      name: NexusSyncSettings
      description: "The Nexus repo sync's options, kept by Idearium."
      fields:
        auto:          "boolean — the sync runs by itself"
        everyMin:      "number — minutes between runs (≥ 1)"
        firstAfterSec: "number — seconds after Idearium starts before the first run"
        minFreePct:    "number — the sync waits while free memory is under this (percent)"
        exclude:       "string[] — systems left out of the sync"
        layers:        "object — { <key>: default | env | his }"
      behavioral_contracts: ["each value says its layer", "a change applies on the next tick, the interval re-armed"]
      error_paths: ["an unknown system in exclude → refused naming the systems there are", "a value out of range → refused with the range"]

  interfaces:

    - id: IF-SUPERVISOR
      name: supervisor
      path: cos/manager/supervisor.js
      description: "COS's one supervisor: the declared processes, their state, the ledger, start, stop and restart."
      exports: ["readDeclarations(root)", "createSupervisor({ root, declarations, policy, ledgerFile, spawnFn, freeMemPct }) → { list, get, start, stop, restart, ledger, note, on, policy, setPolicy, declarations }"]
      behavioral_contracts: ["every act a ledger line written before it happens"]
      error_paths: ["the ledger cannot be written → the act does not happen, said"]

    - id: IF-RAID-PORT
      name: raid-port
      path: lib/raid-port.js
      description: "The one door to RAID for every system that is not Cortex. approveTool fails closed: RAID unreachable → not approved, with the reason."
      exports: ["approveTool(source, command, opts) → { approved, reason, ... }   POST /api/raid/approve-tool"]
      behavioral_contracts: ["RAID cannot be asked → { approved: false, reason: 'RAID unreachable: …' }"]
      error_paths: ["no answer → not approved, said"]

    - id: IF-BOUNDARY
      name: boundary
      path: cos/compartment/boundary.js
      description: "The wall: preloaded into a compartment's process, it refuses (enforce) or says (audit) every require outside the allowed folders."
      exports: ["install({ name, allow, mode })", "COS_BOUNDARY env, read at preload"]
      behavioral_contracts: ["one stderr line per file: [cos-boundary] <name> refused|would refuse <file> (from <parent>)"]
      error_paths: ["COS_BOUNDARY not JSON → '[cos-boundary] … the wall is NOT up'"]

    - id: IF-CENSUS
      name: census
      path: loom/templates/cos-compartment.js
      description: "Each system's compartment manifest and wall from the boundary census (compartmentFor, boundaryFor)."
      exports: ["compartmentFor(system, { root })", "boundaryFor(system, { root, mode }) → { name, allow, mode }"]
      behavioral_contracts: ["read by the script that writes the declarations and by the tests, never by COS's running manager"]
      error_paths: ["no such system → { ok: false, error }"]

    - id: IF-SNAPSHOT-ENGINE
      name: snapshot-engine
      path: cos/foundation/snapshot.js
      description: "COS's SnapshotEngine: a compartment's file manifest, gzip, events; with includeContents the bytes too."
      exports: ["new SnapshotEngine(host, compartment, { nexDir })", "take(trigger, { includeContents, meta })", "list()", "load(id)", "restoreFiles(id, { archiveDir })"]
      behavioral_contracts: ["every snapshot carries its schema version"]
      error_paths: ["a snapshot without its bytes → restoreFiles refused, said"]

    - id: IF-VERSIONIUM-RECORD
      name: versionium-record
      path: lib/versionium-record.js
      description: "The one recorder (§17.12): POST /api/versionium/commit through nexus-client's durable post."
      exports: ["record({ kind, system, message, change, by })"]
      behavioral_contracts: ["a record made while Versionium is down waits in the buffer, never dropped"]
      error_paths: ["a test process → skipped, said"]

    - id: IF-PROPOSALS
      name: proposals
      path: cos/manager/proposals.js
      description: "Held acts (MG-006), taken or dropped by a person."
      exports: ["hold({ by, verb, target, why })", "list({ open })"]
      behavioral_contracts: ["a held act runs only when a person takes it"]
      error_paths: ["an unknown system → refused"]

    - id: IF-IDEARIUM-NEXUS-SELF
      name: idearium-nexus-self
      path: idearium/api/index.js
      description: "Idearium's Nexus repo sync, on its routes."
      exports: ["GET /api/nexus-self/settings", "PATCH /api/nexus-self/settings { patch, by }", "POST /api/nexus-self/sync { only?, force? }"]
      behavioral_contracts: ["Idearium is the one writer of its settings"]
      error_paths: ["Idearium down → COS says so, by name"]

  modules:

    - id: MOD-CP-WALLS
      name: walls
      uuid: nexus-cos-compartment-walls-v1-0000-2026-1101-001
      path: cos/manager/walls.js
      phase: CP1a_every_system_walled_by_cos
      description: >-
        report(sup) → CompartmentWall[]: for every declared process, its compartment, its mode (from its declaration) and how the wall is put
        up (node: --require boundary.js; electron: NODE_OPTIONS=--require), and the crossings its wall has said on COS's ledger since its last
        spawn; an audit wall with none, past stableMs, is enforce-ready. The declarations themselves are written by scripts/cos-walls.js from
        the census (boundaryFor; enforce when the system has no way out, audit otherwise), each into the system's own compartment.json.
      deps: [{ name: supervisor }, { name: boundary }, { name: census }]
      schema_refs: [CompartmentWall]
      exports: ["report(sup) → CompartmentWall[]", "crossingsOf(entries) → object[]", "GET /api/cos/walls (server.js)", "row `cos walls`",
        "scripts/cos-walls.js [--write|--check] → each declaration against boundaryFor"]
      gate_pipeline: ["GATE-CP1a-001: every declared process has a wall or is said bare", "GATE-CP1a-002: allow equals boundaryFor", "GATE-CP1a-003: crossings from the ledger only"]
      behavioral_contracts: ["audit is said as audit (CP-002)", "a system whose wall is enforce and that crosses is refused at the require, the ledger says what"]
      error_paths: ["a declaration whose allow differs from the census → --check fails naming it", "Electron without NODE_OPTIONS support → the wall line 'NOT up' is ledgered"]
      acceptance: ["every declared process walled and equal to boundaryFor; an audit fixture crosses, runs on, and the crossing is a ledger line; the real Ollama bridge behind an enforcing wall answers /health"]

    - id: MOD-CP-USAGE
      name: usage
      uuid: nexus-cos-compartment-usage-v1-0000-2026-1101-001
      path: cos/manager/usage.js
      phase: CP6a_caps_priority_accounting
      description: >-
        read(systems, policy) → each process's resident memory and CPU seconds from the OS, and the host's free memory against the floors.
        Linux and macOS: ps. Windows: wmic where it still exists, else PowerShell Get-Process (resident and CPU seconds), else tasklist
        (resident only). The reader that answered is named on every sample.
      deps: [{ name: supervisor }]
      schema_refs: [UsageSample]
      exports: ["read(systems, policy) → { at, host, systems: { name: UsageSample | { notRead } } }", "perPid(pids) → { out, why, reader }"]
      gate_pipeline: ["GATE-CP6a-U-001: one call for all pids", "GATE-CP6a-U-002: reader named", "GATE-CP6a-U-003: unknown is null, never 0"]
      behavioral_contracts: ["a reader is tried only when the one before it is missing or failed"]
      error_paths: ["every reader fails → notRead with each one's error"]
      acceptance: ["on this Windows (no wmic): a real child's resident memory and CPU seconds read, reader powershell"]

    - id: MOD-CP-RESOURCES
      name: resources
      uuid: nexus-cos-compartment-resources-v1-0000-2026-1101-001
      path: cos/manager/resources.js
      phase: CP6a_caps_priority_accounting
      description: >-
        Built for MG4's MOD-MG-RESOURCES (cos-manager.spec; MG4 superseded by CP6). caps(name) → CompartmentCaps with layers and read-back;
        setCaps(name, patch, { by }) keeps his layer in COS's own store (cos/data/manager/caps.json) and applies at once what can be (priority)
        and at the next spawn what must be (heap). A sampler keeps a ring of UsageSamples per compartment (peaks, averages). Resident over its
        limit → a 'over-limit' ledger line and, if onOver is restart, a restart by rule:resources. The host under the halt floor → one held
        proposal to stop the lowest-priority, largest non-critical compartment (by rule:resources), at most one per incident.
      deps: [{ name: supervisor }, { name: usage }, { name: proposals }]
      schema_refs: [CompartmentCaps, UsageSample]
      exports: ["createResources(sup, { root, store, sampleMs, read, setPriority, getPriority }) → { caps, setCaps, all, sample, onSpawn, history, stop }",
        "GET /api/cos/resources", "GET|PATCH /api/cos/systems/:name/caps", "rows `cos resources`, `cos caps <system> [key=value …]`", "the cockpit's Resources tab"]
      gate_pipeline: ["GATE-CP6a-001: person or rule (CP-005)", "GATE-CP6a-002: validated against ranges", "GATE-CP6a-003: applied and read back (CP-003)", "GATE-CP6a-004: ledgered"]
      behavioral_contracts: ["CPU share is said not-enforced, with why", "COS stops nothing on pressure by itself: it proposes"]
      error_paths: ["setPriority throws → failed with the error", "a sample with no reading → the ring keeps a null, said"]
      acceptance: ["a fixture's priority set and read back from the OS; its heap cap on its command line; its resident limit crossed → ledger line and restart; the halt floor → one proposal"]

    - id: MOD-CP-RAID-GATE
      name: raid-gates-the-rules
      uuid: nexus-cos-compartment-raid-gate-v1-0000-2026-1101-001
      path: cos/manager/resources.js
      phase: CP6b_raid_approves_what_cos_does_by_rule
      description: >-
        James, 2026-11-01: "cos backend, and hooking into idearium and raid. cos resource manager per compartment". An act COS takes by rule on a
        compartment (a restart over its resident limit, onOver restart) is asked of RAID first through IF-RAID-PORT (approveTool('cos',
        'cos.restart <name>', { action, intent, causedBy: 'rule:resources' })). Approved → 'raid-approved' on the ledger, then the restart. Refused,
        or RAID unreachable (fails closed) → 'raid-refused' with RAID's reason, nothing restarted. A proposal held for him is not gated: his act.
      deps: [{ name: resources }, { name: raid-port }]
      schema_refs: [CompartmentCaps]
      exports: ["createResources(sup, { …, approve }) — approve(command, opts) → { approved, reason }; default lib/raid-port.js approveTool"]
      gate_pipeline: ["GATE-CP6b-001: the rule's act named as a command", "GATE-CP6b-002: RAID asked; no answer is a refusal", "GATE-CP6b-003: the answer on the ledger before the act"]
      behavioral_contracts: ["no restart by rule without RAID's yes", "his proposals stay his (USER_AUTONOMY)"]
      error_paths: ["RAID refuses or does not answer → not restarted, 'raid-refused' with the reason"]
      acceptance: ["approved → restarted, 'raid-approved' on the ledger; refused or unreachable → not restarted, the reason on the ledger"]

    - id: MOD-CP-SNAPSHOTS
      name: snapshots
      uuid: nexus-cos-compartment-snapshots-v1-0000-2026-1101-001
      path: cos/manager/snapshots.js
      phase: CP5a_snapshots_per_compartment
      description: >-
        take(name, { label, by, force }) → CompartmentSnapshot of the system's declared data folder through SnapshotEngine with includeContents,
        stored in COS's own store (cos/data/manager/snapshots/<system>/). list(name). restore(name, id, { by }): stop the process through the
        supervisor, take one of now (before-restore), restoreFiles into the data folder with every replaced or removed file moved into
        cos/data/manager/snapshots/<system>/archive/<at>/, start it again if it ran. Each take and restore recorded in Versionium.
      deps: [{ name: supervisor }, { name: snapshot-engine }, { name: versionium-record }]
      schema_refs: [CompartmentSnapshot]
      exports: ["createSnapshots(sup, { root, store, maxMB, record }) → { plan, take, list, restore }", "GET|POST /api/cos/systems/:name/snapshots",
        "POST /api/cos/systems/:name/snapshots/:id/restore", "row `cos snapshot <system> [take [label]|restore <id>]`", "the cockpit's Snapshot tab"]
      gate_pipeline: ["GATE-CP5a-001: person (CP-005)", "GATE-CP5a-002: size under the limit or forced", "GATE-CP5a-003: before-restore snapshot", "GATE-CP5a-004: archive, then write (CP-004)", "GATE-CP5a-005: recorded"]
      behavioral_contracts: ["a live snapshot says it is live", "restore leaves the system as it found it: running if it ran"]
      error_paths: ["no data folder → refused", "the process will not stop → restore refused, nothing written", "a blob missing → restore refused before anything is moved"]
      acceptance: ["a fixture compartment snapshotted, changed, restored: every byte back, the replaced and added files in the archive, the before-restore snapshot listed, the process running again"]

    - id: MOD-CP-NEXUS-SYNC
      name: nexus-sync
      uuid: nexus-cos-compartment-nexus-sync-v1-0000-2026-1101-001
      path: cos/manager/nexus-sync.js
      phase: CP7a_the_nexus_sync_options
      description: >-
        COS's door to Idearium's sync: GET|PATCH /api/cos/nexus-sync and POST /api/cos/nexus-sync/run ask Idearium's routes (its origin from
        its declaration's healthUrl), never its files. Idearium's side: idearium/repo/nexus-self-settings.js keeps NexusSyncSettings by layer
        in idearium/data/nexus-self/settings.json (its own), the scheduler in idearium/api/index.js reads them each tick and re-arms on a change,
        and GET|PATCH /api/nexus-self/settings serve them with the last sync's timing. The cockpit's Sync tab shows them, this system's part of
        the last sync, and leaves it in or out.
      deps: [{ name: idearium-nexus-self }, { name: supervisor }]
      schema_refs: [NexusSyncSettings]
      exports: ["mount(sup) → handler for /api/cos/nexus-sync*", "idearium: get({ env }), set(patch, { by }), systemsFor(all)", "rows `cos sync [run]`, `cos sync set <key> <value>`", "the cockpit's Sync tab"]
      gate_pipeline: ["GATE-CP7a-001: through Idearium's route", "GATE-CP7a-002: validated by Idearium", "GATE-CP7a-003: recorded by Idearium"]
      behavioral_contracts: ["COS keeps no copy of the settings", "Idearium down → 503 naming it"]
      error_paths: ["an unknown key or system → 400 from Idearium, shown"]
      acceptance: ["a setting changed through COS's route is read back from Idearium with its layer his; an excluded system is not in the next sync's set; Idearium down → the tab says so"]

  events:
    cos:
      - "cos.ledger { kind: wall | caps | over-limit | snapshot | restore, system, why, by }"

  enforcement:
    gates:
      - { id: GATE-CP-DECLARED-BY-SYSTEM, name: declared-by-system, severity: fatal, check: "no cos/manager module writes into a system's folder", on_failure: "suite red" }
      - { id: GATE-CP-AUDIT-SAID, name: audit-said, severity: error, check: "every surface showing a wall shows its mode", on_failure: "suite red" }
      - { id: GATE-CP-READ-BACK, name: read-back, severity: fatal, check: "every applied state comes from the OS or names why not", on_failure: "suite red" }
      - { id: GATE-CP-ARCHIVE, name: archive, severity: fatal, check: "restore moves, never unlinks, what it replaces", on_failure: "suite red" }
      - { id: GATE-CP-PERSON, name: person-acts, severity: fatal, check: "acts carry by; agents propose", on_failure: "400, or held as a proposal" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node, invariants valid"
    - "tests/modules/test-cos-walls.test.js, test-cos-resources.test.js, test-cos-snapshots.test.js, test-nexus-sync-settings.test.js — each module's acceptance"
