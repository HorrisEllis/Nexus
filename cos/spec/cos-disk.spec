spec:

  # cos-disk.spec — moved out of cos/spec/cos-manager.spec on 2026-11-03 (SC8, docs/2026-11-02-cos-console-phasemap.spec): the coder's modules of
  # 0.60.379–0.60.382, at full depth, each dependency an interface below. Format: emerge's module spec, compiled by kg-builder at specDepth 1.0.

  meta:
    name:        cos-disk
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-11-03T00:00:00Z
    status:      built
    uuid:        nexus-cos-disk-spec-v1-0000-2026-1103-jamesbrooks-001
    origin: >-
      James, 2026-11-02: "Use the spec as metadata then have the actual file be a compressed or virtual disk or envirement." · 2026-11-03: "It needs to be a virtual disk. For the virtual envirements for qumu also. Like it holds all the data, snapshots, system state." Map: docs/2026-11-02-cos-disk-phasemap.spec. (His later decisions of 2026-11-03 — sandboxed processes, not VMs; versions only changes, Versionium's — put these modules under review; recorded in docs/2026-11-03-registry-per-system-phasemap.spec.)
    purpose: >-
      A compartment's disk: the compressed archive and the qcow2 virtual disk.

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

    - id: IF-TAR
      name: tar
      path: cos/testenv/tar.js
      description: "A folder as a POSIX tar archive, and its reader."
      exports: ["packDir(root, out, opts)", "readTar(buf) → entries", "TarWriter"]
      behavioral_contracts: ["PAX headers for long names and large files"]
      error_paths: ["a bad header → throws with its offset"]

    - id: IF-SUPERVISOR
      name: supervisor
      path: cos/manager/supervisor.js
      description: "COS's one supervisor (cos-manager.spec MOD-MG-SUPERVISOR): declarations, spawn, its ledger, its hooks."
      exports: ["createSupervisor(opts) → { list, get, start, stop, restart, boot, note, ledger, declarations, setHooks, declare, effective, root }"]
      behavioral_contracts: ["every act a ledger line before it happens"]
      error_paths: ["no such system → throws, named"]

    - id: IF-QEMU-RUNTIME
      name: qemu-runtime
      path: cos/compartment/qemu-runtime.js
      description: "QEMU and qemu-img for machine compartments: qcow2 disks, overlays, snapshots."
      exports: ["createBlankDisk", "qemuImgSnapshotSave|Apply|List|Delete", "buildQemuArgs"]
      behavioral_contracts: ["every failure names what qemu-img said"]
      error_paths: ["qemu-img missing → a readable error"]

  modules:

    - id: MOD-COS-DISK
      name: disk
      uuid: nexus-cos-disk-v1-0000-2026-1103-001
      path: cos/disk/disk.js
      phase: DK1_pack_inspect_verify_unpack
      description: "A compartment's disk: its spec and declaration as metadata (disk.json, first), its code, its data only when asked, in one gzip(tar) file in COS's data; the kernel named as its base, not copied."
      deps: [{ name: tar }, { name: supervisor }]
      schema_refs: [SupervisedSystem]
      exports: ["createDisks({ root, dir }) → { pack(system, { withState, by }), inspect(file), verify(file), unpack(file, out, { layers }), list({ system }), coverage(system), describe(system), dir }", "routes GET /api/cos/disks, GET /api/cos/disks/:file[/verify], GET|POST /api/cos/systems/:name/disk; CLI `disk`, `disks`; row cos.disk; the cockpit's Disk tab"]
      gate_pipeline: ["GATE-DK-001: a person or a rule makes a disk; an agent is refused", "GATE-DK-002: verify re-hashes every entry", "GATE-DK-003: unpack never writes outside its folder", "GATE-DK-004: data only when asked"]
      behavioral_contracts: ["the same content makes the same disk (its name carries the content hash)", "a disk made is on COS's ledger and recorded in Versionium"]
      error_paths: ["no such system or folder → 404", "not a disk (no disk.json, another schema) → 422", "an entry leaving its folder → 422, nothing written outside"]
      acceptance: ["test-cos-disk DK-01..DK-05"]

    - id: MOD-COS-VDISK
      name: vdisk
      uuid: nexus-cos-vdisk-v1-0000-2026-1103-001
      path: cos/disk/vdisk.js
      phase: DK6_the_virtual_disk
      description: "A compartment's virtual disk: <system>.qcow2 with one ext4 filesystem (/.cos metadata, /code, /state), its snapshots inside; written with mke2fs -d, read with debugfs from a raw copy, no root."
      deps: [{ name: disk }, { name: qemu-runtime }]
      schema_refs: [SupervisedSystem]
      exports: ["createVDisks({ root, dir, disks, env }) → { tools(), make, refresh, info, verify, extract, snapshot, snapshots, revert, dropSnapshot, list, pathOf }", "routes GET /api/cos/systems/:name/vdisk[/verify], POST /api/cos/systems/:name/vdisk/:op; CLI `vdisk`; the Disk tab's Virtual disk"]
      gate_pipeline: ["GATE-VD-001: a person or a rule acts; an agent is refused", "GATE-VD-002: a missing tool is said (501), nothing faked", "GATE-VD-003: refresh keeps every snapshot"]
      behavioral_contracts: ["all its data by default (the disk is the whole machine)", "every act on the ledger first and recorded in Versionium"]
      error_paths: ["no tools → 501 naming them", "a second make → 409 (refresh instead)", "grown past its disk → 409"]
      acceptance: ["test-cos-vdisk VD-01..VD-06"]

