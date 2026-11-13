# 0.60.514 — COS 0.8.0: the service switch and no console window reach the exe

James, 2026-11-13: "Can you push and release CLS like as an update? So I could, let's make it a service." (CLS read as COS.)

## Found
Two releases changed the COS app without bumping its version, so `.github/workflows/cos-app.yml` refused to build them
("bump cos/app/version.js") and his COS 0.7.1 exe never got either:
- **SC16 (0.60.460):** Clear Glass started through `electron.exe` itself, not the `.cmd` launcher, so no empty console window beside it.
- **SC7 (0.60.464):** Settings › Startup and services in the cockpit: start with Windows, admin rights, start in the tray, close and minimize,
  and **Run Nexus as a Windows service** (NexusCOS through nssm.exe, LocalSystem, at boot; built in CA4, COS 0.5.0).

## Built
- `cos/app/version.js` 0.7.1 → **0.8.0**. Merged to main, the cos-app workflow publishes `cos-v0.8.0` (portable exe, installer,
  SHA256SUMS); 0.7.1's own update check announces it.
- `tests/modules/test-cos-install.test.js` IN-06 asked for COS exactly 0.7.0 and had failed since 0.7.1; it now asks for 0.7.0 or later.

## Proof
test-cos-app-build 8/8, test-cos-app-window 9/9, test-cos-service 7/7, test-cos-hidden-windows 4/4, test-cos-install 9/9,
test-cos-app-self-update 5/5, test-cos-settings.

## Not verified, said
The exe is built on GitHub's Windows runner; the service and the switch are unverified on Windows until his run: in COS, Settings ›
Startup and services › Run Nexus as a Windows service, then `services.msc` lists NexusCOS, and signing out leaves the systems running.
The exe is unsigned: SmartScreen asks once (More info → Run anyway).
