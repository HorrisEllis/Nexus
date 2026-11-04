# 0.60.330 — autopilot hands over to COS (MG17)

James, 2026-10-31:
> "Starting the mg-17"

This follows his "lets do the orchastration. that needs to be done completely." and his 2026-10-30 "This will be the new
orchastrator/autopilot."

## Built

- **`lib/nexus/autopilot.js` is the launcher; it supervises nothing.** `npm run start:all` and `npm run autopilot` still run it.
  - It finds COS's manager on the port, or starts it, and checks the pid answering is the one it started (GATE-MG17-001/002).
  - It asks the manager to boot. `--only` is the boot set.
  - It refuses to start beside an old autopilot holding the port, and says so. COS never starts a second supervisor.
  - It stays in the foreground, as `start:all` always did: the logs are in the terminal, and Ctrl+C stops every system.
  - `--detach` starts the manager, says where it is, and exits (`npm run start:all:detach`).
  - `--legacy-supervisor` runs the archived supervisor and says so loudly (`npm run autopilot:legacy`). This undoes the handover without a
    new release.
- **The old body is archived beside it:** `lib/nexus/autopilot.retired-0.60.330.js` (§0.3). The tests that read or required it now
  point at the archive, and its six baseline edges are renamed with it.
- **`lib/nexus/core-duties.js` keeps what autopilot did besides supervising (MG_D15, decided by his axioms).** Mapping found eight duties
  the spec did not name. Handing over only the supervision would have dropped all of them:
  - the fan-in, the ledger wire, error.log and the intelligence wiring;
  - the post-boot vitals check;
  - automatic updates (idle is read from the door's `/idle`; a restart goes through COS's route, `by: rule:auto-update`);
  - the loom registry refresh;
  - the instance snapshot every minute;
  - the `kernel_circuit_open` gap;
  - the diagnostic when a boot phase stalls.
- **How the duties reach COS:** only by its routes. The gap and the diagnostic follow COS's ledger lines, and each line is acted on once.
- **No new crossing into cortex:** the snapshot keeps its type and keys, and goes through the fan-in. autopilot used to write it with
  cortex's jaa-db directly.
- **COS's manager:** `--handover=<version>` writes a `handover` ledger line, `--only` sets the boot set, and `--root` reads a fixture. Its
  health now carries its pid.
- **COS's runtime:** `supervisorOf()` tells a release that hands over (0.60.330 on) from an older one that supervises itself. `run.json`
  and `status()` carry it. `ENTRIES` is unchanged.
- **Map changes:** MG17 no longer depends on CS12 (no file moves). The MG18-before-MG17 order is superseded by MG16's door.

## Found by the run

- `lib/system-registry.js` read the kernel list out of autopilot.js's source, and nine modules use it. `test-compartment-declarations`
  went red (0 kernels).
  - The fix points it at the archive, so the boot list is frozen at the handover.
  - **MG17b** (mapped, open) moves it onto each system's compartment.json.
- `lib/cli/diagnose.js` required autopilot's kernel table. It now uses `system-registry.kernels()`. `lib/cli/find-orphans.js` reads the
  archive and the launcher.

## Proof

- `tests/modules/test-autopilot-handover.test.js` **6/6**, on real processes:
  - a fixture tree boots through the launcher, and the manager is the only supervisor;
  - a second launcher starts nothing;
  - SIGTERM stops the manager and the system;
  - an old autopilot holding the port is refused;
  - the snapshot has autopilot's keys (read from the archive);
  - each circuit-open line gives one gap, and each stall gives one diagnostic, however many ticks;
  - the runtime tells the two kinds of release apart.
- Passing after the change:
  - `test-cos-supervisor` 8/8, `test-cos-autopilot-door` 4/4;
  - `test-compartment-declarations` 4/4, `test-system-registry` 9/9;
  - `test-nexus-update` 11/11, `test-cos-app-runtime` 9/9;
  - `test-substrate-spec` 3/3;
  - the 22 repointed tests pass as they did before.

## Not green, and not from this release

These fail the same way at 0.60.329, checked in a clean worktree of HEAD:

- `test-system-boundary`: MG16's two door edges into cortex and intelligence (the legacy `/tables` and `/files` reads). MG17 adds no
  crossing.
- `test-alk-lattice-live`, `test-tablet-graph-api`, `test-tablet-container-api`: an empty live store in this container.
- `test-tablet-ledger-api` T1-012, `test-emerge-direct-compile` EM-005, `test-test-sandbox` (two other tests unsandboxed),
  `test-cos-testenv-any-repo` (`cos/testenv/index.js` → `run-target.js` has no wire).

## Versionium

This sandbox cannot reach his Versionium. On his machine, the boot sync records this release and its commit.

## Next

- The UI is MG18, the supervisor screen. Until it lands, the door keeps every screen that reads :7799.
- MG17b moves the registry onto the declarations.
