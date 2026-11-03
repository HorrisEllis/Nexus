# CHANGELOG 0.60.382 — DK6–DK8: each system's virtual disk (qcow2), with its data and its snapshots inside

James, 2026-11-03: "It needs to be a virtual disk. For the virtual envirements for qumu also. Like it holds all the data, snapshots, system state."

Said after 0.60.381 made the disk a compressed archive (.disk). He wants the disk QEMU runs.

## What a virtual disk is
- **The file:** `<system>.qcow2`, QEMU's own disk format, the one `cos/compartment/qemu-runtime.js` boots. Clusters are compressed, and
  only what is written takes room.
- **Inside:** one ext4 filesystem, named for the system:
  - `/.cos/disk.json` and `/.cos/spec/…`: the metadata (its spec and declaration, every file by hash, the kernel it runs on);
  - `/code/<system>/…`: its files;
  - `/state/<system>/…`: all its data. On by default, because the disk is the whole machine.
- **Snapshots** are qcow2 snapshots inside the same file:
  - **refresh** writes the system's current files and data into the disk and keeps every snapshot;
  - a snapshot can be read, verified, reverted to, or dropped.
  - Proved before building: a snapshot survives new content written into the disk, and still reads back its old file.
- **No root needed:** the filesystem is written with `mke2fs -d` (a folder into ext4) and read with `debugfs` from a raw copy `qemu-img`
  makes.
- **A missing tool is said, not faked:** a host without `qemu-img`, `mke2fs` or `debugfs` gets a 501 naming them. The compressed `.disk`
  still works there.

## In COS
- `cos/disk/vdisk.js`: tools, make, refresh, info, verify, extract, snapshot, snapshots, revert, dropSnapshot.
- **Routes:** GET /api/cos/systems/:name/vdisk (and /verify), POST …/vdisk/make|refresh|snapshot|revert|drop-snapshot.
- **Rules:** each act is a person's or a rule's, never an agent's. It is written on COS's ledger first and recorded in Versionium.
- **COS's command line:** `vdisk <system> [make|refresh|verify]`, `vdisk <system> snapshot|revert|drop <tag>`.
- **The Disk tab** now leads with **Virtual disk**:
  - format, size on disk against virtual size, what it holds (code and data);
  - Refresh from the system, Verify, Take snapshot;
  - each snapshot with Revert and Drop.
- The compressed `.disk` of 0.60.381 stays, as **Exports**. `disk.js` was split into `collect()` + `pack()` so both kinds share one
  metadata.

## Found while building
- `mke2fs` reads a bare size as blocks, not bytes. The first refresh made a filesystem larger than its disk; `qemu-img` refused it. Fixed:
  the size is given in KB.

## Proof
- test-cos-vdisk 6/6, with real qemu-img 8.2.2 and e2fsprogs 1.47:
  - VD-01: a qcow2 with ext4 inside named for the system; metadata, files and data read from inside; verified; a host without the tools
    said.
  - VD-02: snapshot, change the system, refresh (snapshot kept), the snapshot still holds the old file, revert brings it back, drop.
  - VD-03: a file removed inside the disk is named by verify.
  - VD-04: through the manager and the CLI; an agent refused; on the ledger.
  - VD-05, in Clear Glass: a snapshot taken from the Disk tab and verified.
  - VD-06: the real Loom with all its data (393 files, 85 of them data): one qcow2, 1.3 MB on disk, verified from inside.
- Also green: test-cos-disk 5/5, test-cos-console 11/11, test-cos-supervisor 8/8, test-cos-ui 6/6.

## Not yet
- **A snapshot that keeps a running VM's memory and CPU** (QMP savevm): the "system state" of a running machine.
- **Booting a compartment with its disk attached** (DK4, DK8).
- **Filling the disk on Windows** (his call, DK_D3): QEMU for Windows has `qemu-img` but not e2fsprogs. The options are WSL's, the QEMU
  environment filling the disk itself (the coder's recommendation), or a pinned e2fsprogs build.
