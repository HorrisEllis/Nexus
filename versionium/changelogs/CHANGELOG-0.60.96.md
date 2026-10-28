# 0.60.96 — 2026-10-16

James: "okay the cos windows app?"

## What was wrong (read in the run's log and in git)

- **The first build failed.** The COS Windows build (`.github/workflows/cos-app.yml`, on `windows-latest`) ran once,
  when PR #94 merged: run 38887590255. It failed in 50 seconds:
  - the version step printed `COS undefined`;
  - then electron-builder stopped with: `Please specify 'version' in the package.json`.
- **Root cause: `cos/app/version.js` was 0 bytes on main.**
  - At 0.60.89 it was written with 398 bytes (`version: '0.1.0'`).
  - At 0.60.90 it was emptied: a pure four-line deletion, a bad write. The same branch had already hit this once on
    `package.json`.
  - No test read the file, so every suite stayed green.
- **No other file is affected.** Scanning every tracked file for "empty now, had content in history" found only this
  one.

## What changed

- `cos/app/version.js` restored exactly as written: COS **0.1.0**. It was never published (no `cos-v` tag exists).
- `scripts/build-cos-app.js` refuses a missing version and names the file.
- The workflow's first step fails with the same message, instead of failing later inside electron-builder.
- `tests/modules/test-cos-app-build.test.js`:
  - BD-07: the version module exports `x.y.z`, and the staged `package.json` carries it;
  - BD-08: staging refuses an empty version file, by name.

## Proof

- test-cos-app-build 8/8.
- The other COS suites are green: store 13/13, switch 10/10, runtime 9/9, update 14/14, shell 12/12, UI 21/21,
  release-deliver 13/13, autopilot-idle 7/7.

## Not proven

- **The exe itself:** the tray, the file dialog and drag-drop. The next run on `windows-latest` is the first that can
  build it. That run starts when this reaches main, because the workflow builds when `cos/app/version.js` changes there.
