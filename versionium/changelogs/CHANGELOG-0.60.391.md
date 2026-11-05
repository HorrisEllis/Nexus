# 0.60.391 — COS 0.7.0 (CA6): npm in Program Files, and install asks where

James, 2026-11-05, with COS 0.6.0 open on "installing Nexus's dependencies (npm install, a few minutes the first time) failed (exit 1):
'C:\\Program' is not recognized as an internal or external command, operable program or batch file.":
"needs to ask for install location also. i was also thinking each compartment can have a different location inside of cos."

## What was wrong
npm on Windows is `npm.cmd` under `C:\Program Files\nodejs`. A `.cmd` runs through cmd.exe, and `spawn(cmd, args, { shell: true })` joined the
path unquoted, so cmd split it at the space and tried to run `C:\Program`. The clone had worked (git is an .exe); npm install never ran.

## Built
- `cos/app/install.js` `spawnSpec`: a `.cmd`/`.bat` runs as `cmd.exe /d /s /c ""<path>" <args>"` with verbatim arguments, each part with a space
  quoted. Everything else is spawned directly, unchanged.
- Every install asks where (`main.js` `askInstallDir`): a folder dialog, the last place chosen (else COS's root) preselected, a new folder can
  be made. Nexus goes into `<chosen>/nexus` unless the chosen folder is already named nexus or is empty (`install.js` `targetDir`). Cancel
  installs nothing and the window says "no install location chosen". The place is kept in the setting `installDir`.
- COS 0.7.0, so the workflow publishes `cos-v0.7.0`.

## Mapped, open for him (do not guess)
CA7 — "each compartment can have a different location inside of cos": readings (a) any folder on disk per compartment, (b) its own folder
inside COS's root, movable, (c) both. In `docs/2026-11-02-cos-the-application-phasemap.spec`.

## Proof
test-cos-install 9/9: IN-07 the quoting (his exact path), IN-08 the folder rule, IN-09 the setting and the ask. On Windows unverified until his run.
