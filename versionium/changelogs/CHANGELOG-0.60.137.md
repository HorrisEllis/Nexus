# 0.60.137 — 2026-10-17

James: "and the diagnostic needs to be a real system matching genasis. also can you fix cos for me? the zip doesn't have
nested folders anymore. these are all my projects i have so far. way more. in some folders. i was hoping to use idearium and
cos to manage them"

This release is the COS part. Diagnostic and the projects come next.

## What his screenshot showed

COS said: "expected one top folder (nexus-<version>/), found 406: .claude, .github, .gitignore". That is the error text of
**COS 0.1.0**. Since COS 0.1.1 (Nexus 0.60.111, release `cos-v0.1.1`, published 2026-10-16), the store reads a zip whose files
sit at its root. Its message also says "(or the project's files at the zip's root)", which his does not.

So the zip was right, and COS on his machine was a version behind. Nothing told him, because COS updates the projects it
runs, never itself.

**What he does now:** install COS from release `cos-v0.1.1` (or `cos-v0.1.2` once this release has built it). His installed
projects and versions are kept: they live in `%LOCALAPPDATA%\COS`, not in the app.

## COS 0.1.2: it says when a newer COS is out

- **`cos/app/app-update.js` `checkApp()`** reads GitHub's release list and picks the newest `cos-v<x.y.z>` that is not a
  draft or a prerelease. It compares that with this COS. It downloads nothing and replaces nothing.
- **The window**, on start, shows "COS 0.1.x is out — this is COS 0.1.y", with a button that opens the release page.
  - The main process opens only a `cos-v` release page of this repo.
  - The controller checks at most once an hour.
- **The exe build stages `app-update.js`.** The build test BD-04 caught it missing before anything shipped.
- **`cos/app/version.js` is 0.1.2**, so the `cos-app` workflow builds and publishes `cos-v0.1.2` on Windows.

## Found and fixed: Clear Glass picked the wrong release

Clear Glass's delivery (`clear-glass/src/releases/deliver.js`) asked GitHub for `/releases/latest`, and COS's releases share
the repo. On 2026-10-16, `cos-v0.1.1` was published 3 minutes after `v0.60.111`, so for that window "latest" was not a Nexus
version and delivery refused it. It now reads the list and takes the highest `v<x.y.z>`. A tag that is not a version is
named in the error.

## Proof

- `tests/modules/test-cos-app-self-update.test.js` CU-01..05 pass:
  - CU-01: the newest `cos-v` is found among Nexus's `v` releases, and a draft does not count;
  - CU-02: the same version or an older one is not newer;
  - CU-03: GitHub refusing, or no network, is said;
  - CU-04: the once-an-hour check;
  - CU-05: the window, the release-page guard, and staging into the exe.
- `test-release-deliver` RD-00..12 pass. RD-00 is the 2026-10-16 case: a `cos-v` release newer than the Nexus one.
- The COS app tests pass: build 8, update 14, ui 21, store 15, shell 12.
