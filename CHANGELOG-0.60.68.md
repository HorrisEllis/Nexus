# 0.60.68 - 2026-10-16

James: "cos app for windows"

## What changed (COSA6: the window)
- **`cos/app/controller.js`:** the one thing the window calls: import, inbox, switch, rollback, start, stop, remove, logs. One operation per project at a time; a second gets "busy", not a race.
- **`cos/app/desktop/`:** Electron shell. Single instance, tray, closing the window hides it, Quit stops what COS started. The inbox folder is watched: a zip dropped there is installed and offered ("Switch to it now"). Sandboxed, context-isolated. The screen lists projects and versions, takes a dropped zip, and has Switch / Roll back / Start / Stop / Log. Errors are shown in full, with the rollback result.
- **`scripts/build-cos-app.js`** stages a self-contained folder (the app's files, `lib/zip.js`, one runtime dependency `js-yaml`, electron versions from the root package.json, asar off).
- **`.github/workflows/cos-app.yml`** builds the portable exe and installer on a Windows runner and publishes `cos-v<version>` once, with `SHA256SUMS`. COS has its own version (`cos/app/version.js`, 0.1.0), so Nexus releases do not rebuild it.

## Proof and honest limits
UI-01..11 (jsdom), CT-01..05 (controller on real zips and processes), BD-01..06 (staging, requires resolve inside the stage). NOT verified: the Windows build itself (cannot run here), tray, file dialog, drag-drop paths, junctions, `taskkill`. The exe is unsigned: SmartScreen says "unrecognized app" once. Clear Glass (Electron) is not started by COS yet, only the Node services.
