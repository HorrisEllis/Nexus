# docs/2026-11-02-cos-disk-phasemap.spec
# The compartment's disk: COS is the VMware, each compartment its virtual machine, the .spec its metadata, and the content a disk file
# (compressed, or a machine disk, or a live environment). MAPPED 2026-11-02, before building (docs/CLAUDE.md rule 1). Registered in
# docs/SPEC-REGISTRY.spec. Stands on (reuse before build, §8.6): cos/testenv/tar.js (POSIX ustar writer with PAX, a folder packed for a VM),
# zlib (gzip), cos/manager/supervisor.js readDeclarations (what a system is and runs), each system's spec (docs/…, <system>/spec/), emerge/
# emerge.cos (the first .cos node: repo at one commit, state folders), cos/compartment/qemu-runtime.js (qcow2 base images and overlays),
# Versionium (every change and version, §17.12).

origin:
  date: 2026-11-02
  james: '"Cos is the wmware. The compartments are the virtual machines/disks. Like can we use the .spec as the virtual machine disk?" · "That''s what it was supposed to be. Use the spec as metadata then have the actual file be a compressed or virtual disk or envirement."'
  context: >-
    After the coupling census (3 systems walled and enforced, 11 in COS but still coupled). The coder answered that a spec alone cannot be
    the disk yet (spec coverage of each system's files 4–38%, scripts/systems-report.js) and proposed a disk of layers. His answer: that is
    what it was meant to be. The same design was recorded on 2026-10-23 (docs/2026-10-23-cos-spine-phasemap.spec, "the virtual disk and
    miniworlds": "Proposed (to confirm): a miniworld is the .cos archive. Its spec declares it; its code/ holds the files; history/*.nex.gz
    holds its versions; for an OS-based miniworld, machine/ holds the qcow2 overlay chain"), left open as his (c); and in docs/cos.spec
    §GAP 2026-08-14 (the ".cos portable archive", mapped, not built). Nothing reads or writes such a disk today; tar.js only writes.

decisions:

  DK_D0_spec_is_metadata_the_disk_holds_the_content:
    status: "DECIDED 2026-11-02 by his words (closes his open (c) of 2026-10-23)"
    james: '"Use the spec as metadata then have the actual file be a compressed or virtual disk or envirement."'
    chosen: >-
      A compartment is its metadata (the system's .spec, and its declaration: how COS runs it) and its content, one of three kinds:
      archive (a compressed disk file, built now), machine (a qcow2 disk with overlays, for an OS-based compartment, through qemu-runtime.js),
      environment (the live folder COS runs today: the disk unpacked and in use). Inside every disk the metadata travels with it, so a disk
      describes itself without anything else.

  DK_D1_the_disk_file:
    status: "DECIDED 2026-11-02 by his axioms; the name .disk is the coder's, TO CONFIRM"
    chosen: >-
      <system>-<version>-<hash>.disk = gzip(tar), its first entry disk.json (schema nexus.cos.disk/1: system, kind, created, by, the
      declaration, the spec files with their hashes, every file with path, sha256, bytes and mode, the layers, the base). Layers: spec/ (the
      metadata, copied in), code/ (the system's folder without its state), state/ (its data folders, only when asked: data is his, never in a
      release). Base: the kernel (lib/) and the Nexus version the disk was made against, by name and version, not copied — a linked clone
      on a shared base image, as VMware's. The .cos extension stays the node (his "no .json files. only nodes. use .cos", 2026-11-01); the
      old proposal named the archive .cos too, and the two are kept apart by this name.
    by: "§0.3 (nothing lost: every file by hash), §0.1 (verify re-hashes every entry), §5.15 (COS's disks are COS's data: cos/data/disks, never committed), §17.12 (each disk made is recorded)"

  DK_D2_where_disks_live:
    status: DECIDED 2026-11-02 by his axioms
    chosen: "COS's own data (cos/data/disks/, COS_DISKS overrides), with an index; never in a system's folder, never committed (data/**)."
    by: "§5.15, the delivery rule (never commit data/**)"

phases:

  DK1_pack_inspect_verify_unpack:
    layer: backend
    status: "DONE 0.60.381 — test-cos-disk DK-01, DK-02, DK-04"
    depends_on: [DK_D0_spec_is_metadata_the_disk_holds_the_content, DK_D1_the_disk_file, DK_D2_where_disks_live]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-COS-DISK]
    files: [cos/disk/disk.js (new), cos/testenv/tar.js, tests/modules/test-cos-disk.test.js (new), tests/modules/run-all.js]
    does: >-
      pack(system, { withState, by }) → the disk file and its manifest; inspect(file) → disk.json without unpacking; verify(file) → every
      entry re-hashed against the manifest, each mismatch named; unpack(file, dir, { layers }) → the files back (refusing any path that
      leaves dir); list() → the disks COS holds. tar.js gains a reader (readTar) beside its writer.
    proof: "a fixture system packed, inspected, verified, unpacked byte-identical; a tampered entry named by verify; a path escape refused; state only when asked"

  DK2_disks_in_cos:
    layer: backend
    status: "DONE 0.60.381 — test-cos-disk DK-03"
    depends_on: [DK1_pack_inspect_verify_unpack]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-COS-DISK]
    files: [cos/manager/server.js, cos/manager/contract.json, cos/manager/cli.js, idearium/cli/route-commands.js, loom/maps/cos-testenv-map.js, tests/modules/test-cos-disk.test.js]
    does: "GET /api/cos/disks, GET /api/cos/systems/:name/disk (its disks and its spec coverage), POST /api/cos/systems/:name/disk { withState, by }, GET /api/cos/disks/:file/verify; COS's CLI `disk`; the row cos.disk"
    proof: "through the manager: a system packed by a person, listed, verified; an agent refused"

  DK3_the_disk_tab:
    layer: ui
    status: "DONE 0.60.381 — test-cos-disk DK-05 (Clear Glass)"
    depends_on: [DK2_disks_in_cos]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-MG-UI-SHELL]
    files: [cos/ui/cockpit/page.js, cos/ui/cockpit/sections/disk (new), cos/manager/contract.json, tests/modules/test-cos-disk.test.js]
    does: "a Disk tab on every system: its metadata (spec, declaration), its disks (layers, files, size, base), Make a disk (with or without its data), Verify"
    proof: "driven in Clear Glass: a disk made from the tab, listed, verified"

  DK4_boot_from_a_disk:
    layer: integration
    status: OPEN
    depends_on: [DK2_disks_in_cos, CS6_rebuild_from_the_spec]
    files: [cos/disk/disk.js, cos/manager/supervisor.js, cos/manager/add-system.js]
    does: "open a disk as a compartment: unpack into a compartment folder (or a copy-on-write overlay), declare it, start it; Add system takes a .disk; snapshot, fork and discard as disk layers"
    proof: "to be mapped in full before it is built: where an unpacked compartment lives beside the real tree, and how its base (lib) is matched"

  DK5_machine_disks:
    layer: integration
    status: OPEN
    depends_on: [DK4_boot_from_a_disk]
    files: [cos/compartment/qemu-runtime.js, cos/disk/disk.js]
    does: "kind machine: the disk names a qcow2 base by hash and carries its overlay chain; boot through qemu-runtime"
    proof: "to be mapped"

# ── ADDENDUM 2026-11-03 (0.60.381) — DK1–DK3 built; what building found ──
# Built as mapped. Loom packs into a 296 KB disk of 308 files and unpacks byte-identical; its data (loom/data) stays out; GNU tar lists the disk.
# Found, said: the same content makes the same disk (the name carries its content hash), so making it twice keeps one; a disk made had no line on
# COS's ledger (§9.2) — the route and the CLI now write one; the shell's Proposals badge showed "0" when nothing waited (display:grid outranked
# [hidden], since MG18) — fixed. The name .disk is the coder's, to confirm. Next: DK4 (open a disk as a compartment) is mapped in outline and
# needs its own map first: where an unpacked compartment lives beside the real tree, and how its base (lib) is matched.

# ── ADDENDUM 2026-11-03 — "It needs to be a virtual disk" (DK_D3, DK6–DK8) ─────────────────────────────────────────────────────────────
# James, 2026-11-03: "It needs to be a virtual disk. For the virtual envirements for qumu also. Like it holds all the data, snapshots, system state."
# Context: 0.60.381 built the disk as a compressed archive (.disk, gzip of tar). He wants the disk QEMU runs: one virtual disk per compartment
# that holds its files, its data, its snapshots and its system state. cos/compartment/qemu-runtime.js already makes qcow2 disks, overlays on a
# read-only base, and qcow2 internal snapshots (qemuImgSnapshotSave/Apply/List); nothing puts a system's files into one.
decisions_addendum_2026_11_03:
  DK_D3_the_disk_is_a_qcow2_virtual_disk:
    status: "DECIDED 2026-11-03 by his words; how it is filled on Windows is TO HIM (a cost, below)"
    james: '"It needs to be a virtual disk. For the virtual envirements for qumu also. Like it holds all the data, snapshots, system state."'
    chosen: >-
      A compartment's disk is <system>.qcow2: a qcow2 image (QEMU's own format, compressed clusters) holding one ext4 filesystem, labelled with
      the system's name: /.cos/disk.json and /.cos/spec/… (the metadata: the spec and declaration, every file by hash, the kernel it runs on),
      /code/<system>/… (its files), /state/<system>/… (all its data). Snapshots are qcow2 internal snapshots, inside the same file: a disk
      snapshot (qemu-img snapshot, the system stopped) now; with the VM running, QMP savevm also keeps its memory and CPU (the system state,
      DK8). A QEMU environment boots with this disk attached and mounts it. COS reads the metadata and files without mounting (debugfs), so no
      root is needed. The .disk archive of 0.60.381 stays as the export and seed format (§0.3): a disk can be made from it.
    problem: >-
      The filesystem is written with e2fsprogs (mke2fs -d: a folder into ext4, no root) and read with debugfs. Linux has them; QEMU for Windows
      ships qemu-img but not e2fsprogs. On his Windows machine one of: (a) WSL's e2fsprogs (no new binary if WSL is installed); (b) the QEMU
      environment itself fills the disk (the guest mounts it and writes, the way the test VM already extracts a tar disk: slower, needs the
      VM image); (c) a small e2fsprogs build for Windows, pinned and hash-checked like WinSW. The coder recommends (b) as the default, since
      it needs nothing but what the QEMU environment already has, with (a) used when present.
    by: "his words; §0.1 (every file by hash, re-read), §1.2 (a missing tool is said, never a silent fallback), §5.15 (disks in COS's data)"

phases_addendum_2026_11_03:
  DK6_the_virtual_disk:
    layer: backend
    status: "DONE 0.60.382 — test-cos-vdisk VD-01, VD-03, VD-06"
    depends_on: [DK_D3_the_disk_is_a_qcow2_virtual_disk, DK1_pack_inspect_verify_unpack]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-COS-VDISK]
    files: [cos/disk/vdisk.js (new), cos/testenv/host.js, cos/compartment/qemu-runtime.js, tests/modules/test-cos-vdisk.test.js (new), tests/modules/run-all.js]
    does: >-
      make(system, { withState, by }) → <system>.qcow2 (ext4 inside: /.cos metadata, /code, /state; compressed); tools() says which of
      qemu-img, mke2fs, debugfs this host has, and why one is missing; info(disk) → qemu-img's view (format, virtual and actual size, snapshots)
      and the metadata read from inside; verify(disk) → every file re-hashed from inside the image; extract(disk, out, { layers }).
    proof: "a fixture system made into a qcow2; qemu-img reads it as qcow2 with ext4 inside; metadata and files read back without mounting; a changed byte inside named by verify; a host without the tools said"
  DK7_snapshots_inside_the_disk:
    layer: backend
    status: "DONE 0.60.382 — test-cos-vdisk VD-02"
    depends_on: [DK6_the_virtual_disk]
    spec: cos/spec/cos-manager.spec
    blocks: [MOD-COS-VDISK]
    files: [cos/disk/vdisk.js, tests/modules/test-cos-vdisk.test.js]
    does: "snapshot(disk, tag, { by }) / snapshots(disk) / revert(disk, tag, { by }) / dropSnapshot: qcow2 internal snapshots in the same file; refreshing a disk from the system (its current files and data) after a snapshot, so a snapshot keeps the earlier state"
    proof: "snapshot, refresh with a changed file, revert: the earlier file is back, read from inside"
  DK8_the_disk_in_cos_and_its_vm:
    layer: integration
    status: "PART 0.60.382 — the routes, CLI and Disk tab (VD-04, VD-05 in Clear Glass); a snapshot keeping a running VM's memory (QMP savevm) and booting with the disk attached remain OPEN"
    depends_on: [DK7_snapshots_inside_the_disk, DK2_disks_in_cos, DK3_the_disk_tab]
    files: [cos/manager/server.js, cos/manager/contract.json, cos/manager/cli.js, cos/ui/cockpit/sections/disk, cos/compartment/qemu-runtime.js]
    does: "the Disk tab and routes make and snapshot the virtual disk; a QEMU environment boots with it attached; with the VM running, a snapshot keeps its memory too (QMP savevm)"
    proof: "routes and tab in Clear Glass; the VM part unverified until a QEMU environment runs"

# ── ADDENDUM 2026-11-03 (0.60.382) — DK6, DK7 built; DK8 in part; what building found ──
# Proved before building: a qcow2's internal snapshot survives new content written into its active layer (qemu-img convert -n), and the
# snapshot reads back its old file. Built: cos/disk/vdisk.js. The real Loom with its 85 data files is one 1.3 MB qcow2 (256 MB virtual).
# Found: mke2fs reads a bare size as blocks, not bytes, so the first refresh made a filesystem larger than its disk (refused by qemu-img,
# fixed: the size in KB). disk.js's pack was split into collect + pack so both kinds of disk lay out the same metadata.
# Still his (DK_D3's problem): how the disk is filled on Windows, where e2fsprogs are not part of QEMU.
