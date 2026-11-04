# 0.60.331 — each system's compartment.json is the boot list (MG17b)

James, 2026-10-31:
> "next."

Said after MG17 ("Starting the mg-17"). MG17's run found that `lib/system-registry.js` read the kernel list out of autopilot's source
code. MG17 pointed it at the archive, which froze the list at the handover. This release ends that freeze.

## Built

- **`lib/system-registry.js` `kernels()`** reads each system's `compartment.json` (`runtime.process`, `runtime.processes`), in the shape
  autopilot's kernels had. Its nine consumers keep working unchanged. What COS's supervisor boots and what the registry reports are now
  one list.
- **`frozenKernels()`** is the archive's list as it stood at the handover. It is the fallback, used only when no system declares a
  process, and the fallback says so.
- **`lib/cli/compartments.js`** keeps a declared process as written. It generates one only for a system that has none. This makes his
  spec's line true: "then each file is its system's own".
- **Decided by his axioms:**
  - §5.15 rule 2: each system declares its own runtime;
  - §10.3: one list;
  - §0.3: the archive is kept, as the fallback and as the proof.

## Proof

- `kernels()` equals the archive's list field for field, 13 of 13. The move changed nothing.
- `test-compartment-declarations` **5/5**.
  - New CD-05: a hand change to a fixture's `compartment.json` shows in `kernels()` and in COS's supervisor alike, and the generator
    keeps it.
- `test-system-registry` 9/9, `test-sovereign-systems` 10/10, `test-system-tunnel` 7/7, `test-genesis-sandboxed` 4/4.
- `test-autopilot-handover` 6/6, `test-cos-supervisor` 8/8, `test-substrate-spec` 3/3.

## Versionium

This sandbox cannot reach his Versionium. On his machine, the boot sync records this release.
