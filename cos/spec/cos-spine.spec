spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # cos-spine.spec — COS is the spine: every Nexus system a compartment; a version is the whole system state (its files and its machine);
  # each version tested in its own compartment; the component registry is each system's spine and the bridge between compartments; a
  # system rebuilt from its spec; compartments capped, spawned, despawned and balanced.
  # Format: emerge's module spec (emerge/SPEC_COMPILER.spec), compiled by emerge/compiler/kg-builder.js at specDepth 1.0, no BLACK node
  # (tests/modules/test-substrate-spec.test.js). Phases: docs/2026-10-23-cos-spine-phasemap.spec (`blocks:` name these modules).
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        cos-spine
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-23T00:00:00Z
    status:      specced
    uuid:        nexus-cos-spine-spec-v1-0000-2026-1023-jamesbrooks-001
    origin: >-
      James, 2026-10-23: "Okay, so COS would be the spine, right? It would be the orchestrator, right? Each system, a compartment, then each
      system could either use, it's already set up to use the HTML as the interface, or a simulated environment using an operating system,
      and use the component registry as an event bus and bridge to the back end of the compartment, whether it's an operating system's SSH
      connection or the server.js of one of the systems. An interaction contract as well ... each compartment as the rewind engine, right?
      The snapshot system. That would make each system monitor the system performance. So it would be a load balancer. Could deploy,
      install, set up, and deploy any system within the templates ... you could spawn and despawn systems when they're needed or not ...
      Each compartment could have individual performance throttling ... compartments can branch to benchmark versions of systems. They
      could run in parallel." · "Because the component registry is the spine for each system, then it would also be the bridge for each
      compartment." · "Qumu has its own snapshot system ... I wanna know how I would merge Virginia [Versionium] ... the original backed up
      the whole files and then each change after that gets backed up." · "Versioning could be actual system states. And then that means
      testing new versions each new version, right? This would make the testing environments fucking immensely easier. And it's got
      branching running in parallel to benchmark ... we can use the spec, the .spec, as a template to rebuild a system. Since that's what
      it's for." The design and the direction are his; the census, the join (one version record over the existing commit and the
      existing machine snapshots) and the phase cut are the coder's.
    purpose: >-
      COS runs every Nexus system as a compartment it can start, stop, watch and cap. Each system's version is a whole state: its files as a
      Versionium commit (the full copy then each change) and, when it runs in a machine, the machine's own QEMU snapshot (the base image then
      each change), under one id with the registry and the spec it was built from. A new version is tested by opening it as its own
      compartment; versions branch and run in parallel for benchmarks (the snapshot-compartments map). Compartments reach each other only
      through what each one's component registry declares (its contract), checked first. A system can be rebuilt from its spec into a new
      compartment and its registry compared with the version it should equal.
    target_runtime: [node]
    language_stack: [javascript]
    paradigm: [registry-is-the-bridge, one-version-record, reuse-before-build, map-first]
    axioms: ["§3.3 map before build", "§8.6 reuse before build", "§5.2 the contract is the bridge", "§10.3 one truth layer", "§0.3 nothing lost",
      "§1.2 nothing fails silently", "§17.11 every performance claim names its benchmark", "REVERSIBILITY", "USER_AUTONOMY"]
    deps:
      - { name: qemu, version: ">=7", required: false, purpose: "machine compartments, their snapshots (savevm, qemu-img snapshot, qcow2 overlays)" }
      - { name: git, version: ">=2.30", required: false, purpose: "the workspace branch of a compartment's files" }

    census: >-
      Read in the tree 2026-10-23. Ten systems already declare themselves as compartments (<system>/compartment.json, schema
      nexus.compartment/1: cos.compartmentId, runtime.entry, port, healthUrl, data dirs, spec dir, dependsOn), written by the system-shape
      work (lib/system-shape.js role 'compartment'). COS: kernel.js / manager.js (compartment lifecycle, birth gates, SISO buses),
      host/event-bus.js (SISO Stream), host/system-map.js, compartment/process-runner.js (spawnProcess, killProcess; Node runtime in use),
      compartment/qemu-runtime.js (buildQemuArgs with -m and -smp, ephemeral overlays, qemuImgSnapshotSave/Apply/List), workspace/vm-control.js
      (pause, resume, live checkpoints savevm/loadvm, rewind; refuses a live snapshot while a host folder is shared in), workspace/index.js
      (branchWorkspace, branchDisk, startDesktop), watchdog/monitor.js + proc-stats.js (per-compartment memory / CPU / stall against its own
      limits — an alert, not a cap), foundation/snapshot.js (config, file manifest, process state, event tail), testenv (Debian VM
      provisioned and proven: T1–T7 done), app/runtime.js (COSA3: start, stop, status, logs). Versionium: lib/files.js (full copy then
      verified text deltas, content-addressed blobs). Idearium: repo/snapshot.js commitRepoSnapshot (a Versionium commit carrying
      registryVersion — components, spine, event bus, contract, each hashed, 0.60.198). Mapped, not built: snapshot-compartments SN0–SN4
      (one branch mechanism, open a snapshot as a compartment, run in parallel, RFR2-measured benchmarks), compartment-environment CE1–CE7
      (the Debian machine, the handshake from the registry, the terminal through it), infrastructure-spine IN0–IN8 (systems onto the
      registry). Not anywhere: one record joining a commit to a machine snapshot; capping a process compartment; replicas behind one name;
      rebuilding a running system from its spec into a compartment and comparing registries.

    constraints:
      - id: CS-001
        description: "One version record: a compartment version joins the existing Versionium commit (files) and the existing QEMU snapshot (machine); neither is copied into the other."
        type: hard
        enforced_by: [GATE-CS-ONE-VERSION]
      - id: CS-002
        description: "The registry is the bridge: a compartment reaches another only through a route, event or command the other's registry declares, after its contract hash is checked; no side door."
        type: hard
        enforced_by: [GATE-CS-BRIDGE]
      - id: CS-003
        description: "Nothing lost: restoring a version first takes a version of the current state; a rebuilt system lands in a new compartment, never over the running one."
        type: hard
        enforced_by: [GATE-CS-REVERSIBLE]
      - id: CS-004
        description: "A cap is enforced by the OS or the hypervisor (Job Object, cgroup, QEMU -m/-smp) and read back; a cap that cannot be applied is said, never assumed."
        type: hard
        enforced_by: [GATE-CS-CAPS]
      - id: CS-005
        description: "Starting, stopping, restoring, capping and despawning are a person's acts or a rule he set; an agent may read and propose."
        type: hard
        enforced_by: [GATE-CS-PERSON]

  schemas:

    - id: CompartmentVersion
      name: CompartmentVersion
      description: "One whole system state under one id: its files, its machine (if it runs in one), the registry and spec it stands on."
      fields:
        id:           "string — cv-<shortid>"
        compartment:  "string — cos.compartmentId (e.g. cos.nexus.versionium)"
        system:       "string — the system's name"
        files:        "{ commitId: string (a Versionium commit, idearium.repo system), treeHash: string }"
        machine:      "{ kind: 'none'|'qemu-live'|'qemu-disk', disk: string|null, tag: string|null, chain: [{ file, sha256 }]|null }"
        registry:     "{ sha256: string, parts: { components, spine, eventBus, contract } } — registryVersion at the time"
        spec:         "{ path: string, sha256: string }|null — the spec the system is built from"
        parent:       "string|null — the version it came from"
        branch:       "string|null — the branch it lives on"
        tests:        "{ ran: bool, passed: number, failed: number, at: number }|null"
        by:           "string — person | rule:<id> | agent:<name>"
        at:           "number — epoch ms"
      behavioral_contracts: ["a version without a machine is still a version (files, registry, spec)", "every hash is checked again on restore"]
      error_paths: ["a part that no longer verifies (a blob, an overlay, a snapshot tag) → the restore refuses and names the part"]

    - id: CompartmentCaps
      name: CompartmentCaps
      description: "The resources one compartment may take, and how each is enforced."
      fields:
        cpuPercent:   "number|null — share of all cores (process: Job Object CPU rate / cgroup cpu.max; machine: -smp)"
        cores:        "number|null — machine vCPUs or process affinity"
        memoryMB:     "number|null — process: Job Object memory limit / cgroup memory.max; machine: -m"
        diskMB:       "number|null — machine: the disk image's size; process: said as not enforced"
        netKbps:      "number|null — said as not enforced until a phase does it"
        applied:      "{ <cap>: 'enforced'|'not-enforced'|'failed', why?: string }"
      behavioral_contracts: ["applied is read back from the OS, not assumed from the request"]
      error_paths: ["the OS refuses a limit → applied says failed with its error; the compartment still runs, said"]

    - id: CompartmentLink
      name: CompartmentLink
      description: "One compartment's verified view of another: what the other's registry declares and its hash."
      fields:
        from:        "string — compartment id"
        to:          "string — compartment id"
        contract:    "string — the sha256 of the other's contract part"
        routes:      "string[] — what may be called"
        events:      "string[] — what may be heard"
        checkedAt:   "number"
      behavioral_contracts: ["a call outside routes is refused before it is sent"]
      error_paths: ["the contract hash changed since checked → the link is re-checked; a mismatch refuses the call with both hashes"]

  interfaces:

    - id: IF-COMPARTMENT-JSON
      name: compartment-json
      path: versionium/compartment.json
      description: "Each system's own declaration (schema nexus.compartment/1), the same shape in clear-glass, copilot, cortex, diagnostic, guardian, idearium, intelligence, loom, ollama and versionium."
      exports: ["{ id, name, dir, cos: { compartmentId }, runtime: { entry, port, healthUrl, critical, optional }, data, spec, dependsOn }"]
      behavioral_contracts: ["written by the system's shape (lib/system-shape.js role compartment)"]
      error_paths: ["a system without one is not a compartment yet — listed, not guessed"]

    - id: IF-PROCESS-RUNNER
      name: process-runner
      path: cos/compartment/process-runner.js
      description: "Spawns and kills a compartment's process; every line and exit on the host bus."
      exports: ["spawnProcess(host, compartment, opts)", "killProcess(compartmentId)", "getProcess(compartmentId)", "writeStdin", "resolveRuntime"]
      behavioral_contracts: ["crash loops counted → watchdog:process:crash-loop"]
      error_paths: ["spawn failure → comp:process:error with the OS code"]

    - id: IF-QEMU
      name: qemu-runtime
      path: cos/compartment/qemu-runtime.js
      description: "QEMU machines: args (-m, -smp), overlays, disk snapshots."
      exports: ["buildQemuArgs", "resolveVmConfig", "ensureEphemeralOverlay", "discardOverlay", "qemuImgSnapshotSave", "qemuImgSnapshotApply", "qemuImgSnapshotList", "qemuImgSnapshotDelete", "QMPClient"]
      behavioral_contracts: ["a base image is never opened for writes"]
      error_paths: ["QemuRuntimeError naming the step"]

    - id: IF-VM-CONTROL
      name: vm-control
      path: cos/workspace/vm-control.js
      description: "A running machine: pause, resume, live checkpoints (savevm), rewind (loadvm), the checkpoint index."
      exports: ["status", "pause", "resume", "checkpoint", "checkpoints", "rewind", "TAG_RE"]
      behavioral_contracts: ["a live snapshot is refused while a host folder is shared in, said"]
      error_paths: ["{ error } naming why"]

    - id: IF-WORKSPACE
      name: workspace
      path: cos/workspace/index.js
      description: "A compartment's files as a git branch, its desktop disk as an overlay, the desktop VM."
      exports: ["branchWorkspace", "branchDisk", "listBranches", "removeBranch", "startDesktop", "desktopStatus", "stopDesktop"]
      behavioral_contracts: ["a branch point is committed before branching"]
      error_paths: ["git missing → said"]

    - id: IF-WATCHDOG
      name: watchdog
      path: cos/watchdog/monitor.js
      description: "Per-compartment memory / CPU / stall against its own limits; real OS stats (proc-stats.js readProcStats)."
      exports: ["WatchdogMonitor", "startMonitoring", "stopMonitoring", "getMonitor", "POLL_INTERVAL_MS", "readProcStats (proc-stats.js)"]
      behavioral_contracts: ["one anomaly per type per process lifetime"]
      error_paths: ["stats unreadable → no reading, said"]

    - id: IF-REPO-SNAPSHOT
      name: repo-snapshot
      path: idearium/repo/snapshot.js
      description: "A repo's state as a Versionium commit with its file layer and registryVersion (the four parts)."
      exports: ["buildSnapshotRecord({ repo, repoDir })", "commitRepoSnapshot({ repo, repoDir, commit, message, causedBy })", "verifyMustRecord(state)", "MUST_RECORD"]
      behavioral_contracts: ["a snapshot missing a MUST_RECORD field is refused"]
      error_paths: ["Versionium down → retried, then said"]

    - id: IF-VERSIONIUM-FILES
      name: versionium-files
      path: versionium/lib/files.js
      description: "The per-file layer: a full copy then verified deltas, content-addressed blobs."
      exports: ["plan", "record", "stage", "tree", "content", "versions", "treeHash", "FilesError"]
      behavioral_contracts: ["every read re-verifies each step's hash"]
      error_paths: ["FilesError naming the file"]

    - id: IF-TESTENV
      name: testenv
      path: cos/testenv/index.js
      description: "Runs a repo's tests in a process or the Debian machine."
      exports: ["run", "runVm", "runProcess", "capabilities", "missingRuntimes", "runTarget (run-target.js)"]
      behavioral_contracts: ["a missing runtime is said as missing, not as failing tests"]
      error_paths: ["the machine unavailable → vmAvailable() false, said"]

    - id: IF-HANDSHAKE
      name: contract-handshake
      path: orchestrator/lib/contract-handshake.js
      description: "The orchestrator's contract verification: fetches a system's /api/contract, checks its id, routes and schema hash against the one on file (first sight recorded as canonical), and keeps a trust map."
      exports: ["verifySystem(system)", "verifyAll()", "getEntry(id)", "getAllEntries()", "getTrustMap()", "TRUST", "CONTRACT_PATHS"]
      behavioral_contracts: ["a system without a valid contract is UNVERIFIED and flagged"]
      error_paths: ["unreachable → its trust state says so"]

    - id: IF-SPEC-COMPILER
      name: spec-compiler
      path: lib/emerge/compiler/kg-builder.js
      description: "Compiles a spec into its knowledge graph at a depth; phase-specs.js writes each phase's .phase and .graph."
      exports: ["build", "createKGPipeline", "computeGaps", "DEPTH", "phase-specs.js: derive, write, check"]
      behavioral_contracts: ["a module below depth 1.0 or a BLACK node is a gap, named"]
      error_paths: ["an unparseable spec → the YAML error"]

  modules:

    - id: MOD-CS-VERSION
      name: compartment-version
      uuid: nexus-cos-spine-version-v1-0000-2026-1023-001
      path: cos/spine/version.js
      phase: CS1_a_version_is_a_system_state
      description: >-
        take(compartmentId, { by, label }) → CompartmentVersion: the files through the existing repo snapshot, asked of Idearium on its route
        POST /api/repos/:uuid/snapshot (a Versionium commit with the
        registry's four parts), the machine through the existing QEMU snapshot (a live checkpoint when the machine allows it, else a disk
        snapshot of the stopped machine, else none for a process compartment, said), the spec's path and hash; stored as one record.
        list(compartmentId), get(id), restore(id, { by }) — takes a version of now first (CS-003), then puts back both parts and checks every
        hash. Route /api/cos/versions, command `cos version`, IPC for the COS window.
      deps: [{ name: repo-snapshot }, { name: versionium-files }, { name: vm-control }, { name: qemu-runtime }, { name: compartment-json }]
      schema_refs: [CompartmentVersion]
      exports: ["take(compartmentId, { by, label }) → CompartmentVersion", "list(compartmentId) → CompartmentVersion[]", "get(id)", "restore(id, { by }) → { ok, before, why }"]
      gate_pipeline: ["GATE-CS1-001: the compartment declared", "GATE-CS1-002: files → repo snapshot", "GATE-CS1-003: machine → checkpoint | disk snapshot | none", "GATE-CS1-004: one record, every hash"]
      behavioral_contracts: ["restore takes a version of the current state first", "a machine that refuses a live snapshot gets a disk snapshot when stopped, or none — said in machine.kind"]
      error_paths: ["Versionium down → no version (the machine part is not taken alone), said", "a hash that does not verify on restore → refused, naming the part"]
      acceptance: ["a process compartment's version has files + registry + spec, machine.kind none", "a Debian machine compartment's version restores files and the machine to the same tag"]

    - id: MOD-CS-TEST
      name: version-tests
      uuid: nexus-cos-spine-test-v1-0000-2026-1023-001
      path: cos/spine/test-version.js
      phase: CS2_test_every_version
      description: >-
        testVersion(versionId): opens the version as its own compartment (the snapshot-compartments SN1 lazy branch: a worktree for its files,
        an overlay for its machine), runs the system's own tests there (cos/testenv), records { passed, failed } on the version, closes the
        branch. The working system is never touched.
      deps: [{ name: compartment-version }, { name: testenv }, { name: workspace }]
      schema_refs: [CompartmentVersion]
      exports: ["testVersion(versionId, { by }) → { ok, passed, failed, log }"]
      gate_pipeline: ["GATE-CS2-001: open the version as a branch", "GATE-CS2-002: run its tests", "GATE-CS2-003: record and close"]
      behavioral_contracts: ["the running compartment is untouched", "closing leaves nothing behind"]
      error_paths: ["no test runner found → said as such, not as a failure"]
      acceptance: ["a version from yesterday is tested in its own branch while today's system keeps running"]

    - id: MOD-CS-BRIDGE
      name: registry-bridge
      uuid: nexus-cos-spine-bridge-v1-0000-2026-1023-001
      path: cos/spine/bridge.js
      phase: CS3_the_registry_is_the_bridge
      description: >-
        link(from, to) → CompartmentLink: reads the target compartment's registry (its contract part: routes, commands, events) and its hash,
        verified through the orchestrator's existing handshake (its route, not a copy of contract-handshake.js);
        call(link, route, body) sends only what the contract declares, after the hash still matches. The same reading as CE's handshake for a
        machine's shell, so a server.js system and a Debian machine are bridged the same way.
      deps: [{ name: compartment-json }, { name: repo-snapshot }, { name: contract-handshake }]
      schema_refs: [CompartmentLink]
      exports: ["link(from, to) → CompartmentLink", "call(link, route, body) → response", "events(link) → string[]"]
      gate_pipeline: ["GATE-CS3-001: read the target's registry", "GATE-CS3-002: hash check", "GATE-CS3-003: route declared", "GATE-CS3-004: send"]
      behavioral_contracts: ["no call outside the contract", "a changed contract is re-checked before the next call"]
      error_paths: ["target unreachable → said with its healthUrl", "undeclared route → refused before sending"]
      acceptance: ["idearium → versionium: a declared route passes, an undeclared one is refused naming the contract"]

    - id: MOD-CS-SUPERVISE
      name: systems-as-compartments
      uuid: nexus-cos-spine-supervise-v1-0000-2026-1023-001
      path: cos/spine/systems.js
      phase: CS4_every_system_a_compartment
      description: >-
        COS starts alone (his decision, 2026-10-23: "you start with just cos. Then open systems as needed"). open(system) reads the system's
        .spec (its declaration; compartment.json is a derived cache), opens its dependsOn first, spawns it through process-runner, watches it
        with the watchdog and waits on its healthUrl; close(system) when idle by his rule. One list of what runs, its process tree, memory
        and CPU. Autopilot stays as a supervisor of an opened set, no longer the boot path.
      deps: [{ name: compartment-json }, { name: process-runner }, { name: watchdog }]
      schema_refs: [CompartmentCaps]
      exports: ["systems() → [{ system, compartmentId, running, pid, health, memoryMB, cpu }]", "open(system, { by, why })", "close(system, { by })"]
      gate_pipeline: ["GATE-CS4-001: read declarations", "GATE-CS4-002: order by dependsOn", "GATE-CS4-003: spawn and watch", "GATE-CS4-004: health"]
      behavioral_contracts: ["a system already running (started outside COS) is adopted by its port, not started twice"]
      error_paths: ["a port held by another program → said, naming it"]
      acceptance: ["COS boots with no system running; open(idearium) opens it and its dependencies only; idle close returns the memory"]

    - id: MOD-CS-CAPS
      name: compartment-caps
      uuid: nexus-cos-spine-caps-v1-0000-2026-1023-001
      path: cos/spine/caps.js
      phase: CS5_caps_per_compartment
      description: >-
        apply(compartmentId, CompartmentCaps): on Windows a Job Object per compartment's process tree (CPU rate, memory limit, affinity); on
        Linux a cgroup v2 slice (cpu.max, memory.max) where writable, else prlimit for memory; a machine through QEMU's -m / -smp at start.
        applied is read back from the OS. Disk and network said as not enforced until a later phase does them.
      deps: [{ name: systems-as-compartments }, { name: qemu-runtime }]
      schema_refs: [CompartmentCaps]
      exports: ["apply(compartmentId, caps, { by }) → CompartmentCaps", "read(compartmentId) → CompartmentCaps"]
      gate_pipeline: ["GATE-CS5-001: validate", "GATE-CS5-002: apply by platform", "GATE-CS5-003: read back"]
      behavioral_contracts: ["a cap the OS will not apply is said as failed, the compartment keeps running"]
      error_paths: ["no permission for cgroups → prlimit, said; neither → failed, said"]
      acceptance: ["a process compartment capped at 256 MB is stopped by the OS past it (or the limit read back), on the platform the test runs on"]

    - id: MOD-CS-REBUILD
      name: rebuild-from-spec
      uuid: nexus-cos-spine-rebuild-v1-0000-2026-1023-001
      path: cos/spine/rebuild.js
      phase: CS6_rebuild_from_the_spec
      description: >-
        rebuild(system, { version }): has Idearium compile the system's spec (emerge) and build it, through Idearium's routes, into a NEW compartment (a
        branch, never over the running system), indexes it, and compares its registry's four hashes with the version's; each part that differs
        is the drift between the spec and the system, listed by component, route and event.
      deps: [{ name: spec-compiler }, { name: compartment-version }, { name: workspace }]
      schema_refs: [CompartmentVersion]
      exports: ["rebuild(system, { version, by }) → { compartmentId, registry, drift: { components, spine, eventBus, contract } }"]
      gate_pipeline: ["GATE-CS6-001: compile the spec at depth 1.0", "GATE-CS6-002: build into a branch", "GATE-CS6-003: index", "GATE-CS6-004: compare registries"]
      behavioral_contracts: ["the running system is never replaced by a rebuild", "drift is reported part by part"]
      error_paths: ["a spec below depth 1.0 → refused with its gaps (it cannot rebuild what it does not say)"]
      acceptance: ["a small system rebuilt from its spec matches its version's registry, or names each difference"]

    - id: MOD-CS-SCALE
      name: spawn-and-balance
      uuid: nexus-cos-spine-scale-v1-0000-2026-1023-001
      path: cos/spine/scale.js
      phase: CS7_spawn_despawn_and_balance
      description: >-
        Replicas of one system behind its name: spawn(system, n) starts n compartments from the same version on their own ports; a request to
        the system's name goes to the least loaded (the watchdog's numbers) healthy one; despawn after an idle time he sets. Rules are his
        (spawn when CPU > x for y s, keep at least one).
      deps: [{ name: systems-as-compartments }, { name: compartment-caps }, { name: registry-bridge }]
      schema_refs: [CompartmentCaps, CompartmentLink]
      exports: ["spawn(system, n, { by })", "despawn(compartmentId, { by })", "route(system) → compartmentId", "rules(system, rule)"]
      gate_pipeline: ["GATE-CS7-001: same version", "GATE-CS7-002: own port and caps", "GATE-CS7-003: least loaded healthy", "GATE-CS7-004: idle despawn"]
      behavioral_contracts: ["a system whose data is not safe to share between replicas is refused replication, said (its data dirs)"]
      error_paths: ["no healthy replica → the request fails with each replica's state"]
      acceptance: ["two replicas of a stateless system share load; one stopped, traffic goes to the other"]

    - id: MOD-CS-UI
      name: cos-spine-screen
      uuid: nexus-cos-spine-ui-v1-0000-2026-1023-001
      path: cos/app/desktop/spine.html
      phase: CS8_the_cos_screen
      description: >-
        The COS screen: every system as a compartment (state, process, memory, CPU, caps), its versions (take, test, restore, branch), its
        links, its replicas; Co-pilot in it, with the same doors (the `cos` commands).
      deps: [{ name: compartment-version }, { name: systems-as-compartments }, { name: compartment-caps }, { name: spawn-and-balance }]
      schema_refs: [CompartmentVersion, CompartmentCaps]
      exports: ["the COS window's Systems, Versions and Links views"]
      gate_pipeline: ["GATE-CS8-001: read through the routes", "GATE-CS8-002: acts confirmed"]
      behavioral_contracts: ["every act on the screen is a command an agent can read, and a person performs"]
      error_paths: ["COS not answering → said"]
      acceptance: ["tested in Clear Glass: a version taken and restored from the screen"]

    - id: MOD-CS-PROJECTS
      name: every-project-a-compartment
      uuid: nexus-cos-spine-projects-v1-0000-2026-1023-001
      path: cos/spine/projects.js
      phase: CS9_every_project_a_compartment
      description: >-
        His decision, 2026-10-23: anything imported, and any new project that has been specced and phased, is a new compartment that gets
        built. On Idearium's repo ingest (an import, a spec promoted to a repo, a new phased project) COS creates the compartment under the
        repo's id, declared by the repo's .spec; its first version is taken when the import or the first build lands. Existing repos without
        one get one on first open.
      deps: [{ name: systems-as-compartments }, { name: compartment-version }]
      schema_refs: [CompartmentVersion]
      exports: ["ensure(repoUuid, { by }) → { compartmentId, created }", "forRepo(repoUuid) → compartmentId|null"]
      gate_pipeline: ["GATE-CS9-001: the repo's spec", "GATE-CS9-002: one compartment per repo id", "GATE-CS9-003: first version"]
      behavioral_contracts: ["one repo, one compartment, one id", "an imported project's first version is its import"]
      error_paths: ["COS unavailable at import → the import lands, the compartment is created on first open, said"]
      acceptance: ["importing a zip makes a repo, its compartment and its first version under one id"]

    - id: MOD-CS-HAT
      name: hats-bound-to-the-compartment
      uuid: nexus-cos-spine-hat-v1-0000-2026-1023-001
      path: cos/spine/hat-bind.js
      phase: CS10_hats_bound_to_the_compartment
      description: >-
        His decision, 2026-10-23: each hat binds its agent to the compartment, not only to the repo. A hat's tools that touch files or run
        commands execute inside the hat's compartment (its directory, its caps, or its machine through the guest agent), so the boundary
        lib/repo-hat.js states it does not have ("a capability boundary, not a filesystem jail") becomes an enforced one.
      deps: [{ name: every-project-a-compartment }, { name: compartment-caps }, { name: registry-bridge }]
      schema_refs: [CompartmentCaps, CompartmentLink]
      exports: ["bind(hat, compartmentId)", "exec(hat, tool, args) → result run inside the compartment", "scopeOf(hat) → { compartmentId, root, caps }"]
      gate_pipeline: ["GATE-CS10-001: the hat's compartment", "GATE-CS10-002: the tool's effect resolved inside it", "GATE-CS10-003: refused outside"]
      behavioral_contracts: ["a hat's run_command cannot touch a path outside its compartment", "a hat reaches another compartment only through the registry bridge"]
      error_paths: ["a tool that cannot be confined → refused for that hat, said, never run unconfined"]
      acceptance: ["a repo hat's run_command writing ../outside.txt is refused or lands inside the compartment, never outside"]

    - id: MOD-CS-BOOT
      name: cos-boots-alone
      uuid: nexus-cos-spine-boot-v1-0000-2026-1023-001
      path: cos/spine/boot.js
      phase: CS4a_cos_boots_alone
      description: >-
        His order, 2026-10-23 (lowest friction first): COS starts alone and opens Cortex — RAID inside it, unchanged — as the one always-open
        core compartment, instead of nexus/autopilot.js spawning every system at boot. Every other system is opened when asked for (by a
        request, a route or him) and only once it is sovereign (CS4's precondition); until then it opens with the core set, said.
      deps: [{ name: process-runner }, { name: watchdog }, { name: compartment-json }]
      schema_refs: [CompartmentCaps]
      exports: ["boot({ core: ['cortex'] }) → { opened, deferred }", "coreSet() → string[]", "opensOnDemand(system) → { ok, why }"]
      gate_pipeline: ["GATE-CS4a-001: COS up", "GATE-CS4a-002: the core compartment open and healthy", "GATE-CS4a-003: each other system: sovereign? deferred : with the core set"]
      behavioral_contracts: ["nothing that worked at boot before stops working: a system not yet sovereign opens with the core set, said"]
      error_paths: ["the core compartment fails health → COS says so and offers the old all-at-once start"]
      acceptance: ["COS boots, Cortex opens, nothing else opens until asked; a request for Idearium opens it"]

    - id: MOD-CS-RAID
      name: raid-in-the-exe
      uuid: nexus-cos-spine-raid-v1-0000-2026-1023-001
      path: cos/raid/index.js
      phase: CS11_raid_in_the_exe
      description: >-
        RAID's always-on half — the queue, the contract files, the gates' enforcement, the revert, and routing — moves from cortex/core/raid
        into the COS app's process with its own store (its raid_* tables and data/raid), serving the same /api/raid/* routes; it stays the
        one write authority (§5.2, §9.1). The reasoning half (decompose, analyse, recall, synthesize: request-spine RQ27) is a module opened
        on demand. RAID then weighs live compartment load (which compartments are open, their memory, CPU, caps, replicas) beside the agent
        ladder and free memory, so its routing is the load balancer. Moved, not copied: cortex/core/raid archived (§0.3).
      deps: [{ name: systems-as-compartments }, { name: compartment-caps }, { name: watchdog }]
      schema_refs: [CompartmentCaps]
      exports: ["the same RAID routes (/api/raid/decide, /feedback, /status, /queue, /officiator)", "decide(request) → { route, why, load }"]
      gate_pipeline: ["GATE-CS11-001: every caller on the route (no require of RAID left)", "GATE-CS11-002: RAID's tables in its own store", "GATE-CS11-003: served from COS", "GATE-CS11-004: load in the decision"]
      behavioral_contracts: ["one RAID, never two running", "a decision names the load it weighed"]
      error_paths: ["a caller still loading RAID in-process → the move refused, naming the file"]
      acceptance: ["with Cortex closed, a routing decision is still made, from COS", "of two agents fit for a job, the less loaded is chosen and the decision says so"]

  events:
    cos:
      - "cos.version.taken { id, compartment, machine.kind, by }"
      - "cos.version.restored { id, before, by }"
      - "cos.version.tested { id, passed, failed }"
      - "cos.system.started { system, pid, by } / cos.system.stopped"
      - "cos.caps.applied { compartment, applied }"
      - "cos.link.refused { from, to, route, why }"
      - "cos.replica.spawned { system, compartment } / cos.replica.despawned"

  enforcement:
    gates:
      - { id: GATE-CS-ONE-VERSION, name: one-version, severity: fatal, check: "a version references the commit and the machine snapshot; it copies neither", on_failure: "suite red" }
      - { id: GATE-CS-BRIDGE, name: registry-bridge, severity: fatal, check: "no compartment-to-compartment call outside the target's declared contract", on_failure: "refused" }
      - { id: GATE-CS-REVERSIBLE, name: reversible, severity: fatal, check: "restore takes a version first; rebuild lands in a new compartment", on_failure: "refused" }
      - { id: GATE-CS-CAPS, name: caps-read-back, severity: error, check: "applied is read from the OS", on_failure: "said as failed" }
      - { id: GATE-CS-PERSON, name: person-acts, severity: fatal, check: "start/stop/restore/cap/despawn by a person or his rule", on_failure: "403" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node"
    - "per module: its acceptance lines; machine ones where QEMU is present, said as skipped where it is not"

## ADDENDUM 2026-10-24 (0.60.242) — the first system runs in its compartment, behind a wall
James, 2026-10-24: "Isn't loom in a compartment already or clearglass?" · "Do it." Loom (docs/2026-10-24-loom-into-cos-phasemap.spec LM4)
runs in nexus-self-loom, started by COS. The compartment's code boundary is enforced: cos/compartment/boundary.js, preloaded by
compartment/process-runner.js when the env carries COS_BOUNDARY; a require outside the allowed paths is refused. The filesystem is not walled
yet. lib/cos-bridge.js gains start, stop and processOf; loom/templates/cos-compartment.js gains boundaryFor and moveIn (the seal moves a
system in, never before). This is the path CS4 and every system after it uses.
