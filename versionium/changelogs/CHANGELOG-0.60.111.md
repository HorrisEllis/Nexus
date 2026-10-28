# 0.60.111 — 2026-10-16

James: "please fix this. the naming in github doesn't even match that..."

He sent a screenshot of the COS window refusing four zips:
- 'the top folder "Nexus v0.60.110" is not <project>-<version> (like nexus-0.60.65)', three times;
- 'the top folder "Nexus-main" is not <project>-<version> (like nexus-0.60.65)'.

He was right: GitHub never names a folder that way. "Download ZIP" on a branch gives `Nexus-main/`. A tag's source zip
gives `Nexus-<tag>/`. Only the release asset from `scripts/release-zip.js` is `nexus-<version>/`.

## Why it was still broken after 0.60.103

Main's 0.60.103 had already taught the store to read the version from inside the zip. His COS never got that change:
- `cos/app/version.js` stayed at 0.1.0;
- `cos-v0.1.0` was built at 0.60.96 (run 38891061643);
- `.github/workflows/cos-app.yml` only ran when `version.js` changed, and leaves a tagged version alone.

So the exe he runs still has the old, strict store.

## What changed

1. **The name and version come from inside the zip** (`cos/app/store.js`).
   - The version is read by `lib/release-version.js` `fromFiles`, the same reader Idearium's zip import uses (§8.6). It
     tries `VERSION`, then the `lib/version.js` system line, then `package.json`.
   - Every place inside that states a version must agree. So must the folder's name, when it carries one
     (`Nexus v0.60.120` holding 0.60.113 is refused, and the refusal says which place said what).
   - The project is `package.json`'s name. Otherwise it is the folder's name with its version or branch taken off
     (`Nexus-main` → `nexus`, `@james/gig-writer` → `gig-writer`).
   - A zip whose files sit at its root, with no top folder, also works.
   - The installed folder gets a `VERSION` file when the zip had none.
2. **COS 0.1.1**, so the Windows workflow publishes a new exe.
   - The exe now bundles `lib/release-version.js` and `lib/version.js`.
   - BD-04 caught the missing require before CI could. Its check now skips whole-line comments, because a comment loads
     nothing.
3. **This cannot recur silently.** `cos-app.yml` now runs on every file the exe is built from (`cos/app/**`,
   `lib/zip.js`, `lib/release-version.js`, `scripts/build-cos-app.js`). If those files changed since the released tag
   without a version bump, the run fails and names them.

4. **From his boot log:** `[idearium] releases not synced to versionium yet: Cannot read properties of undefined
   (reading 'get')`.
   - His copy was a GitHub zip, so it had no `.git` (the log also said `fatal: not a git repository`).
   - With no git, `lib/nexus-releases.js` `_gitCommits` returned without its `byBody` map, and `read()` called `.get` on
     it.
   - Fixed: with no git, the releases now sync unpinned. RL-06 reproduces his exact error without the fix.

## Proof


- `tests/modules/test-cos-app-store.test.js`: 15/15.
  - CA-15 covers his four shapes: `Nexus-main`, `Nexus v0.60.111`, a flat zip, and another project's branch zip.
  - CA-15 also covers a folder that disagrees with its contents.
  - CA-14 (main's 0.60.103 test) is kept.
- `tests/modules/test-releases.test.js`: 6/6 (RL-06).
- `tests/modules/test-release-version.test.js`: 5/5. RV-04 was red on main because it predated the `SHA256SUMS` asset (0.60.93); it now checks the real command.
- `tests/modules/test-cos-app-build.test.js`: 8/8. BD-06 checks the widened trigger and the no-bump guard.
- The store as staged for the exe imported a real `git archive` of this repo, packed as `Nexus-main/` (6,371 entries),
  as `nexus 0.60.96`.

## Not verified here

The Windows exe itself. The `cos-v0.1.1` run on `windows-latest` is the first build that can confirm it.
