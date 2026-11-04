# CHANGELOG 0.60.382 — DK1–DK3: a compartment's disk (the spec as metadata, the files compressed)

James, 2026-11-02: "Cos is the wmware. The compartments are the virtual machines/disks. Like can we use the .spec as the virtual machine disk?"

James, 2026-11-02: "That's what it was supposed to be. Use the spec as metadata then have the actual file be a compressed or virtual disk or envirement."

The coder answered that a spec alone cannot be the disk yet: each system's spec names 4–38% of its code (`scripts/systems-report.js`). The
coder proposed a layered disk; his answer set the shape. The same design was recorded on 2026-10-23 and left open as his (c)
(docs/2026-10-23-cos-spine-phasemap.spec, "a miniworld is the .cos archive"). This release closes it.

## What a disk is
- **The file:** `<system>-<version>-<hash>.disk`, one compressed file (gzip of a tar archive). Standard `tar` opens it.
- **First entry, `disk.json`, the metadata:**
  - the system's declaration (compartment.json or its .cos node);
  - its spec files, by hash;
  - how much of its code its spec names (the share the metadata alone could rebuild);
  - the base it runs on: the Nexus kernel at a version and commit, named, not copied, like a linked clone on a shared base image;
  - every file, by layer, path, hash, size and mode.
- **`code/`:** the system's folder without its data, or `.git`, `node_modules` or caches.
- **`state/`:** its data folders, only when asked.
- **Where disks live:** COS's own data (`cos/data/disks/`), never a system's folder, never committed.
- **Records:** each disk made is a line on COS's ledger and is recorded in Versionium.
- **Same content, same disk:** the name carries the content hash, so making the same disk twice keeps one.

## What COS does with it
- **The module, `cos/disk/disk.js`:**
  - make (pack);
  - read the metadata without unpacking (inspect);
  - verify: every file re-hashed, each changed, missing or extra one named;
  - unpack: byte-identical, never writing outside its folder;
  - list.
- `cos/testenv/tar.js` gains a reader beside its writer.
- **Routes:** GET /api/cos/disks, GET /api/cos/disks/:file and …/verify, GET and POST /api/cos/systems/:name/disk.
- **COS's command line:** `disk <system> [make] [state]`, `disk verify <file>`, `disks`. The row `cos disk`.
- **A Disk tab on every system:**
  - its metadata, and how much of its code its spec covers (a bar);
  - its disks, with Make a disk (its data only when ticked) and Verify.

## Found while building, fixed
- A disk made wrote no line on COS's ledger. The route and the CLI now write one.
- The shell's Proposals badge showed "0" when nothing waited (since MG18): `display: grid` outranked `[hidden]`.

## Proof
- test-cos-disk 5/5:
  - DK-01: metadata first; data only when asked; unpacked byte-identical; GNU tar lists it.
  - DK-02: a changed file named by verify; an entry escaping its folder refused; not-a-disk said.
  - DK-03: through COS's manager and its CLI; an agent refused; on the ledger.
  - DK-04: the real Loom, 308 files in a 296 KB disk, verified.
  - DK-05, in Clear Glass: the Disk tab makes and verifies a disk; no empty badge.
- Also green: test-cos-console 11/11, test-cos-ui 6/6, test-cos-supervisor 8/8.
- Failing as before this change: test-cos-testenv-any-repo's missing wire for `cos/testenv/index.js` → `run-target.js` (not touched here).

## Next, mapped
- DK4: open a disk as a compartment (where an unpacked compartment lives beside the real tree; how its base is matched). It needs its own
  map first.
- DK5: machine disks (qcow2) through qemu-runtime.
- The name `.disk` is the coder's, to confirm.
