# 0.60.356 — resources per compartment (CP6a)

James, 2026-11-01:
> "then i want resource management for each cos compartment"

Map: `docs/2026-11-01-the-compartment-phasemap.spec` (CP_D6, CP6a). Spec: `cos/spec/compartment.spec` (MOD-CP-RESOURCES, MOD-CP-USAGE).

## Found

`wmic` is gone from his Windows 11 (26200). COS's `usage.js` asked only `wmic`, so on his machine it read no system's memory at all:
every card said "wmic did not answer".

## Built

- **Usage reads on his Windows:** `wmic` if present, else PowerShell `Get-Process` (resident memory and CPU seconds), else `tasklist`.
  The reader is named on each reading, and the read no longer blocks the manager.
- **Caps per compartment** (`cos/manager/resources.js`), each value saying its layer (default, declared, his). Each is applied and read
  back:
  - **heap**: V8's cap on the command line at spawn. Enforced; a change waits for the next start.
  - **priority**: `os.setPriority`, read back with `os.getPriority`. Enforced, or failed with the OS's error.
  - **resident limit**: watched by COS each sample (the OS cannot hard-cap it without a job object). Over the limit: an `over-limit`
    ledger line, and a restart by rule if he set `onOver: restart`.
  - **CPU share**: said not enforced.
- **Under the halt floor, COS stops nothing by itself.** It holds one proposal (`rule:resources`) to stop the lowest-priority, largest
  compartment that is not critical, for him to take or drop.
- **The account:** a ring of samples per compartment, with peak and average.
- `GET /api/cos/resources`, `GET|PATCH /api/cos/systems/:name/caps`; rows `cos resources` and `cos caps`; the cockpit's **Resources** tab.
  Wired in Loom.

## Proof

`tests/modules/test-cos-resources.test.js` **5/5**:
- CR-01: usage reads a real process here through PowerShell.
- CR-02: a below-normal priority is set and read back from the OS; his heap cap is on the command line.
- CR-03: the resident limit is crossed, giving the ledger line and a restart.
- CR-04: the halt floor gives one proposal, and nothing is stopped.
- CR-05: an agent is refused, and an out-of-range value is refused.

Also green: `test-cos-supervisor` 8/8, `test-cos-walls` 5/5, `test-loom-map` 19/19.

## Versionium

His Versionium runs on this machine, but this release is on a branch, not his running tree. The boot sync records it when it lands.
A cap change is recorded through `lib/versionium-record.js`.
