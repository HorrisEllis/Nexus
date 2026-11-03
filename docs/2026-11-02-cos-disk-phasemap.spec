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
