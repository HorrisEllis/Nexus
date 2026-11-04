# 0.60.363 — UP13: a backup before every update; the toggle in the page's theme

James, 2026-11-01, on Idearium's Updates page (0.60.361, 3 commits behind): "can you fix the drop down? make it look better? make sure it hooks into idearium versionium, to backup the system"

## No backup, no update
- **Backup first.** Before any update, Idearium snapshots the whole Nexus tree into its Nexus repo store (`lib/nexus-self/store.js`; content-addressed, so an unchanged tree reuses the last snapshot).
- **Recorded in Versionium** as kind `nexus.backup`.
- **The update names its backup.** The update's history row, and its own Versionium record, name the snapshot.
- **Without a backup the update is refused**, and the refusal says why.
- **Run it by hand** with `POST /api/nexus-self/backup`, or `update backup` from the command table.

## Who takes the backup
The store lives in Idearium's data, so it is Idearium's (§5.15).
- Idearium's own Updates route backs up in its own process.
- The automatic update and copilot's update tool ask Idearium's route (`applyBacked`).
- If Idearium does not answer, the update is refused and says so.

## The dropdown
The browser's native list opened white. It is now three buttons in the page's theme:
- auto · when idle
- notify · tell me only
- off

The chosen one is lit, with a line saying what it does. The history shows each update's backup.

## Also
- **A dropped fetch is retried once.** His page showed "read ECONNRESET". A fetch dropped mid-way is now tried once more after 3 s.
- **Specced first.** The update tool had no module spec; `docs/nexus-update.spec` now exists and compiles.

## Proof
tests/modules/test-nexus-update.test.js: 12/12.
- **UP-13** checks four cases:
  - refused without a backup, with nothing moved;
  - Idearium not answering is said;
  - the backup is asked for with who and why, and lands on the history row;
  - no backup is taken when Nexus is already up to date.
- **UP-08** drives the real page in Clear Glass:
  - three buttons and no native dropdown;
  - choosing notify sets the real policy;
  - the update says "backed up first";
  - the history line names the backup.
