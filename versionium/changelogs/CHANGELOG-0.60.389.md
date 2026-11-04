# 0.60.389 (COS 0.5.0) — Nexus as a Windows service with admin rights; Clear Glass in his session

James, 2026-11-04, uploading NSSM.zip (his NSM v2 and his NSSM notes, written for the old bridge):
> "build that for clearglass then make sure cos.exe is completely borderless. also run on startup with an option to disable. run in service
> with admin privilages for more control and power.  maybe move the system to the cos folder."

> "i spent money i don't have so please get the application done."

## Grounded first

- **Already in COS 0.4.0** (cos-v0.4.0, released 2026-11-02):
  - borderless by default (CE7), with "With Windows' frame" as the way back;
  - start with Windows, default on, with a tray switch;
  - admin rights at startup, one approval, with a tray switch (MG37).
- **His NSM v2 is COS's supervisor already, rule for rule:** backoff from 1 s to 30 s, a circuit after 6 crashes in 5 minutes, phases gated on
  health, a ledger. Its targets (bridge, :3747) are gone. It is kept whole in `_archive/2026-11-04-nsm-upload/` (§0.3), with a README of what was
  carried and what was not.
- **A Windows service runs in session 0, with no desktop (§0.0).** Clear Glass and the COS window cannot run there. CA_D1 had said "no service"
  for this reason. His call now (CA_D1b) takes the service for the part with no window.

## Built (CA4)

- **`cos/app/service.js`: the Windows service NexusCOS, through NSSM** (a Node process cannot answer Windows' service manager by itself).
  - It runs his linked Nexus folder's `lib/nexus/autopilot.js` with the system node, so COS's manager and every headless system start at boot.
  - It runs as LocalSystem, starts automatically, and NSSM restarts it after 2 s if it dies.
  - Its logs go to `data/cos-service/` and rotate at 10 MB.
  - Install and remove are one script with one admin approval. A reinstall starts clean.
  - Its status is read from NSSM.
  - No `nssm.exe` (next to COS in `bin\`, on PATH, or `NSSM_EXE`) → said, with where to get it, and nothing is installed.
- **The tray switch** "Run Nexus as a Windows service (admin, at boot; needs nssm.exe)". It is off until he turns it on; off again removes the
  service.
- **COS's supervisor under the service** (`COS_SERVICE=1`) leaves a windowed process (Electron: Clear Glass) unstarted. Its ledger says it starts in
  his session.
- **The COS window starts the windowed systems in his session** (`cos/app/desktop-systems.js`, through the controller). It finds them from each
  system's `compartment.json`, the same declaration the supervisor reads, and starts the ones not already answering their health.
- **COS 0.5.0.** The exe's file list carries the two new files. The cos-app workflow publishes cos-v0.5.0 when this reaches main.

## Proof

- `test-cos-service` 7/7:
  - SV-01: the install commands, exactly.
  - SV-02: nssm.exe found, or said missing with nothing installed.
  - SV-03: the status, the apply, a declined approval, and removal.
  - SV-04: under the service the supervisor leaves Clear Glass to his session, and starts it otherwise.
  - SV-05: the windowed systems are found and started.
  - SV-06: the setting, and the exe's file list.
  - SV-07: the controller hands the service his folder.
- The COS app suites stay green: test-cos-app-build 8/8, -link 4/4, -runtime 9/9, -self-update 5/5, -shell 12/12, -store 15/15, -switch 10/10,
  -ui 22/22, -update 14/14, -window 9/9, test-cos-supervisor 8/8, test-cos-console 11/11, test-cos-ui-starts 3/3.
- CT-05 (the window only calls the controller) caught the first version, which had the runtime in `main.js`. It was moved into the controller.

## Not verified

- The service on Windows: there is no Windows here. His first run of the switch is the test, and its notification says what happened.
