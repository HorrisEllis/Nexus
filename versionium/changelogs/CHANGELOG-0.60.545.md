# 0.60.545 (COS 0.10.1) — COS lets the updater reach GitHub again, by itself

James, 2026-11-15, with Settings › Update still saying "an unzipped release folder (no .git yet)" and Update check failed: "you fixed this right?
like do i reinstall? this needs to be automatic."

## Why 10a02b08 did not reach him
The fix (every git call trusts exactly his folder, `-c safe.directory`) is in `lib/nexus-update.js`, inside his Nexus folder. The only thing that
updates that folder is that same file, run by the NexusCOS service as LocalSystem, and git refuses a folder owned by another user. The old code
loops and never fetches the new code. 10a02b08 also carried no version bump, so his page could not show it existed.

## Fixed (COS 0.10.1, `cos/app/git-trust.js`, `cos/app/desktop/main.js`)
- **COS's exe does it.** The exe updates from cos-v releases without the Nexus folder. When COS opens, it tells git, once, to trust exactly his
  linked folder for every user (`git config --system --add safe.directory <folder>`). The service's git reads the system config, so the old check
  reaches GitHub, and the automatic update brings 0.60.545 in.
- **Admin:** COS normally runs elevated and needs nothing. If it does not, Windows asks once (one UAC prompt). A "no" is remembered, and COS never
  asks again for that folder.
- **Only that folder is trusted.** Nothing in the folder changes. A folder with no `.git` yet is left to the update check, which attaches it.

## What he does
Install COS 0.10.1 from Settings › Update › COS itself (or the release page). COS restarts, trusts the folder, and the next check updates Nexus.
No reinstall of Nexus.

## Proof
- `node tests/modules/test-cos-git-trust.test.js` — GT-01 to GT-04, 4/4: adds exactly the folder; writes nothing when already trusted; asks Windows
  once and never twice; skips a folder with no `.git`.
- Also passing: cos-app-build 8/8 (the new file is staged into the exe), cos-app-ui 22/22, cos-app-self-update 10/10, cos-app-link 5/5.
- Not proven here: a run on Windows. The release workflow builds the exe on a Windows runner; the real proof is his Update page after it.
