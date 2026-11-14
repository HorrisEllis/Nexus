# 0.60.515 — SC16: COS's manager no longer opens a console window when COS starts Nexus

James, 2026-11-13, with two screenshots of an empty `C:\Program Files\nodejs\node.exe` window over the COS cockpit: "also that node instance needs
to run in the taskbar using the service or something. spamming my screen."

## Found (on his machine, read from the running processes)
- The window belonged to COS's manager (`cos/manager/server.js`), a child of `lib/nexus/autopilot.js`, itself a child of `COS.exe`.
- COS.exe starts autopilot with no console. Autopilot's attached start of the manager (`spawn(..., { stdio: 'inherit' })`) had no
  `windowsHide`, so Windows gave the manager a visible console of its own. The detached start already hid it; the attached one, the one COS.exe
  uses, did not. SC16 (0.60.400, 0.60.410, 0.60.460) hid the systems, the watchdog's PowerShell and Clear Glass's launcher, never this one.
- The same omission was on the restart after exit 75 (CE2b) and on `--legacy-supervisor`.
- His machine was also still running 0.60.391 (COS's folder on D: had not updated), so the earlier SC16 fixes had not reached it either. It was
  updated to 0.60.514 by hand on 2026-11-13 (backup branch `backup/2026-11-13`, his data kept in place).

## Built
- `lib/nexus/autopilot.js`: `windowsHide: true` on all three starts. From a terminal nothing changes: the manager still writes to that
  terminal, because `windowsHide` only hides a console Windows would newly create.
- `tests/modules/test-cos-hidden-windows.test.js` HW-02 now reads `lib/nexus/autopilot.js` too: every spawn there must hide its window.

## Proof
- `node tests/modules/test-cos-hidden-windows.test.js`: 4 passed, 0 failed. HW-02 fails on 0.60.514's autopilot.js (three spawns without it).
- On his machine: stated in the map's addendum once Nexus has been restarted on this version.

## Not in this release (his asks of the same day, mapped next)
- "run in the taskbar using the service": the service (NexusCOS, CA4) needs `nssm.exe`, which is not on his machine and is not in his NSSM.zip
  (that is his NSM v2). Shipping `nssm.exe` inside COS, and the first-run wizard that asks where Nexus installs, are phases to write.

Coder's part: the diagnosis and the fix. The call that the windows must go is his, four times now (2026-11-05 twice, 2026-11-08, 2026-11-13).

## Correction, the same day (the first wording is kept below, §0.3)
- The cause named below (CRLF) is wrong. Later the same day the same tool, on the same machine, logged CA8, RC2 and CA9 without trouble. Why
  it does not find `SC16_no_console_windows` is not established. The gap stands (a phase with ledger notes that the tool cannot log to); its
  cause is to find.

## Gap found
- On Windows `node idearium/spec-engine/phase-ledger.cjs log SC16_no_console_windows ...` answers "no phase ... in any map": the maps are checked out with CRLF (core.autocrlf=true) and the ledger's reader counts 116 phases in 11 maps. The ledger line for this release was written by hand in the tool's shape, and says so. To phase: the reader accepts CRLF.
