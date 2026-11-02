# CHANGELOG 0.60.377 — CE6: the COS exe carries 0.60.376 (COS 0.4.0)

James, 2026-11-02: "Look cos 0.3.0"

Said right after 0.60.376 was pushed. The coder read it as a request to check COS 0.3.0, the exe he runs, against the new work (to confirm).

## What the check found
- His exe is COS 0.3.0 (release `cos-v0.3.0`, built from main at e4409e7f by the cos-app workflow, run 11, green).
- 0.60.376 changed two files that exe is built from: `cos/app/desktop/main.js` (close to the tray or quit, minimize to the taskbar or tray,
  the Windows notification while COS is hidden) and `cos/app/settings.js`. It left `cos/app/version.js` at 0.3.0.
- `.github/workflows/cos-app.yml` refuses exactly that ("COS 0.3.0 is already released, but the files its exe is built from changed"). So on merge
  the workflow would have gone red, and those window changes would never have reached him.

## What changed
- `cos/app/version.js` → 0.4.0. Merging to main now builds and publishes `cos-v0.4.0` (portable, setup, SHA256SUMS). His 0.3.0 says a newer
  COS is out (app-update.js).
- The Nexus side of 0.60.376 (the update card in COS's window, the routes, Keep mine and update) needs no new exe. It reaches him through his
  folder's update once main has it.
- Map: docs/2026-11-02-cos-enterprise-phasemap.spec CE6.

## Proof
- `git diff --stat cos-v0.3.0 HEAD -- cos/app` names main.js and settings.js; `cos-v0.4.0` is untagged, so the workflow builds.
- On Windows, unverified until his run.
