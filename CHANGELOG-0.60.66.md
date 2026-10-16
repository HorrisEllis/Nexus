# 0.60.66 - 2026-10-16

James: "cos exe for my pc to run nexus on, so i can just replace the zip each time." · "lets do the cos applicatoin"

## What changed (COSA1: the version store and zip import)
`node cos/app/cli.js import <zip>` (or drop the zip in the inbox, then `inbox`) installs a release beside the others:
- **Checked before anything is extracted:** zip size, entry count, unpacked size, path traversal (`../`, absolute paths), one top folder named `<project>-<version>`, and the folder name must equal the `VERSION` file inside.
- **Checksum:** verified when you give `--sha256`, or when `SHA256SUMS` / `<zip>.sha256` sits beside the zip. A wrong one refuses before extracting. No checksum is allowed for a zip you dragged in, and says "NOT verified"; `--require-checksum` refuses instead (that is what the auto-download will use).
- **Never overwritten:** the same zip again is a no-op; different content under the same version is refused.
- **Your data survives:** every version's `data/` is a junction to ONE persistent data folder (Nexus's modules compute their data path from where they sit, so replacing the folder would have wiped jobs, hats and registries). A `data/` folder inside a zip is merged in without overwriting anything.
- A failed import is cleaned up: no half-installed folder, nothing recorded. `remove` moves a version to `trash/`; it never deletes and refuses the current one.
- Store: `%LOCALAPPDATA%\COS` on Windows, `~/.local/share/cos` elsewhere (`COS_APP_ROOT` or `--root`).

## Proof and honest limits
`test-cos-app-store` CA-01..13 (real zips from lib/zip.js, real folders). Windows junctions are not proven: this ran on Linux symlinks. Not built: running the project (COSA3), switching/rollback (COSA4), the exe (COSA6), Clear Glass delivering updates (COSA7). Nothing runs from this store yet.
