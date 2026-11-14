# 0.60.540 — COS updates itself from Settings › Update (COS 0.10.0)

James, 2026-11-14. He was told the COS app only says when a newer COS is out and he has to install it by hand. He asked: "so this cant use the
update tool?" Offered COS updating itself from the same place he updates Nexus: "yes."

## Built (CA10, docs/2026-11-02-cos-the-application-phasemap.spec)
- **Settings › Update shows a "COS itself" panel beside Nexus.** It shows this COS, the newest one, and an **Install COS <version>** button. It
  appears only inside the COS window. The page reaches the app through two new calls on the window's door, `appCheck` and `appInstall`, and nothing
  else.
- **Install, step by step (`cos/app/app-update.js` `installApp`):**
  1. It downloads the newest `cos-v` release's `COS-<v>-setup.exe` and `SHA256SUMS` into COS's own folder, `<root>/cos-updates/<v>/`.
  2. The setup runs only if its SHA-256 matches its line in `SHA256SUMS`. If it does not match, nothing runs, the download is removed, and COS
     says why.
  3. The setup runs silently (`/S --force-run`). COS closes so the installer can replace it, and the installer starts COS again on the same
     Nexus folder.
  4. The installer of the previous version is kept, so COS can be rolled back.
- **A private release.** The download uses the GitHub sign-in that git already keeps (`git credential fill`, which never prompts). One sign-in
  serves both updates. If no sign-in is found, the error says how to give one.
- **Refused, and said why:** not on Windows, not newer, or no `SHA256SUMS` in the release.

## Proof
- `node tests/modules/test-cos-app-self-update.test.js`: 10 passed, 0 failed. The new tests:
  - CU-10: the checksum matches, so the setup runs with `/S --force-run` and is kept.
  - CU-11: a mismatch, so nothing runs and the files are removed.
  - CU-12: not Windows, not newer, or no SHA256SUMS: each refused before any download.
  - CU-13: a private release uses the API asset URLs and the token from `git credential fill`, never a prompt.
  - CU-14: the door and the page are wired.
- `test-cos-app-window` CW-05 names the two new door calls (nine, nothing else): 9 passed.
- Also passing: cos-app-build 8, cos-app-ui 22, cos-app-update 14, cos-service 10, cos-updates 12, cos-settings 3.

## Said
- **COS 0.10.0 is published by CI** when this merges (`.github/workflows/cos-app.yml` builds on Windows and creates `cos-v0.10.0`).
- **His first step is by hand.** His COS predates 0.9.0, so it cannot update itself. He installs 0.9.0 or 0.10.0 by hand once, and later versions
  arrive through Settings › Update.
- **Not yet run on Windows:** the silent install in place, and the panel inside the COS window. The panel needs the COS window's door, so Clear Glass
  in a browser shows it hidden; CU-14 checks the wiring.
