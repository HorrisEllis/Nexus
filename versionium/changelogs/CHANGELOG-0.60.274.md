# 0.60.274 — the changelogs moved to Versionium, read in Idearium

James, 2026-10-28: "can we move the changelogs to versionium and idearium"

## What changed
- **Moved, not copied.** The 472 `CHANGELOG-*.md` files went from the repository root to `versionium/changelogs/` with `git mv`, so each
  keeps its history. Nothing was deleted (§0.3).
- **One place says where they are.** `lib/changelogs.js` has `DIR`, `list`, `find`, `forVersion`, `read` and `pathFor`.
  - Every reader asks it: `lib/release-version.js`, `lib/nexus-releases.js`, `lib/phase-census.js`, `lib/spec-census.js`,
    `lib/context-atlas.js`, `lib/readme-generate.js` and `scripts/release-zip.js`.
  - It still reads the root after the new home, so a tree from before the move (his older copy) works.
  - It sits in lib rather than versionium/lib so no new require edge crosses between systems; it names the folder, it does not load
    Versionium code.
- **Idearium can read them.**
  - Backend: `lib/changelogs.js read`.
  - Route: `GET /api/releases/changelog?version=x.y.z` (no version means the running release).
  - Command: `system changelog [x.y.z]`.
  - Screen: in the Versionium tab's Releases, a release shows its changelog's path, and "the changelog" opens to its text, read the
    first time it is opened.
- A Nexus release in Versionium now carries `changelogPath` beside `changelog`.
- The release agreement (CK-253) names the changelog by its new path.

## Decided by his axioms
- Where the files go is his word: Versionium.
- Where the resolver lives was decided by §8.6 (reuse: one resolver like lib/data-home), the boundary rule (no new crossing) and §0.3
  (the root is still read, so nothing older breaks).

## Proof
- `tests/modules/test-changelogs-home.test.js` 4/4:
  - none left at the root, and every changelog is found in its new home;
  - an older tree's root copy is still read;
  - the release agrees with its changelog;
  - the route and the command exist;
  - Idearium's view opens a release to its text and reads it once.
- test-release-version 5/5 and test-release-notes 6/6, with assertions updated to the new path.
- test-releases keeps its base result. RL-03 fails on the base too: a connection reset in this sandbox.
- test-readme-generate has the same 2 failures as the base.
