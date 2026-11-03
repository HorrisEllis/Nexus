# CHANGELOG 0.60.387 — SC8: the coder's drift found and fixed (the specs at full depth again)

James, 2026-11-03: "This is why RAID has a comparison engine for the chunks and the fucking spec. Make sure it's not drifting. The behavioral
drift engine. The map of the systems. Because of your drift issue. Also the gates."

James, 2026-11-03: "Okay. I’m overwhelmed. This is a shit show. That’s why boundaries need to exist."

## The drift, the coder's
- `test-substrate-spec` (every full spec compiles at full depth, and every module ties to a phase) has failed since 0.60.380.
- The coder added seven modules to `cos/spec/cos-manager.spec` in 0.60.380–0.60.383: notices, system-config, add-system, cli, ui-updates,
  disk, vdisk. That spec is tied to the cos-manager map, but those modules' phases are in the console and disk maps. Three of them depended on
  names the spec never declares (updates, proposals, tar).
- The check that catches it was not run after those releases. Found while updating genesis and the architecture spec (0.60.386).

## The fix (phase SC8, written before the change)
- The seven modules moved, whole, into `cos/spec/cos-console.spec` and `cos/spec/cos-disk.spec`. Each spec declares what its modules stand on as
  interfaces (supervisor, updates, resources, proposals, ui-shell; tar, qemu-runtime), so every dependency resolves at full depth.
- `cos-manager.spec` keeps a dated addendum saying where they went (§0.3).
- The console and disk maps' phases point at the new specs. SC5 and DK3 stay on `cos-manager.spec`, because they build into COS's shell.
- Their tie to a map is not checked (map: null, as compartment.spec and nexus-update.spec). The console map holds another system's phase
  (SC6, Intelligence's), and tying them waits for the phase cleanup he called for.
- Every phase file of the four maps touched today regenerated: no `.phase` differs from its map (the pinned SC7 drift and CE2's included).

## Proof
- test-substrate-spec 3/3 (it was 1/3).
- `phase-specs --check` on the console, disk, enterprise and registry-per-system maps: 0 drifted.
