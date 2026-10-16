# 0.60.72 — 2026-10-16

James: "tell me all the recent changes. i want a changelog for each change or diff. i want it all syncd with git,
versionium, the zip. like lets tet idearium working"

This release builds RN2 and RN3 of `docs/2026-10-15-one-contract-raid-releases-phasemap.spec`, which were already mapped:
a changelog written from the commits, and releases in Idearium.

## What the record was missing (read, not remembered)

- **23 commits had no record.** 47 commits landed between 0.60.47 (his last zip) and 0.60.71. 23 of them were maps,
  addenda and docs that belonged to no release, so they had no changelog at all.
- **0.60.62 was pinned to the wrong commit.** Two sessions both wrote 0.60.62. The sync took the oldest commit with
  that number, which was the other session's (now 0.60.69).
- **0.60.63, 0.60.64 and 0.60.69 were pinned to nothing.** A merge renumbered each one, and the sync did not read
  merges. It gave the reason "this clone is shallow", which was not the cause.
- **Notes were lost.** The `// prev system:` lines the sessions write were not read at all.

## What changed

- **Pinning** (`lib/nexus-releases.js`):
  - every shape of release line is read;
  - merges are read;
  - a release is found by its line's own words before its number.

  All 24 recent releases are now pinned by their own line.
- **What landed** (`lib/release-notes.js`, new): every commit is listed once, under the first release that contains it,
  with its message, its files and +/−. A map commit appears under the release that shipped it; a commit after the last
  release appears as "not yet in a release". `npm run changes -- --since 0.60.47` writes `CHANGES.md`.
- **Versionium:** each release now carries its commits and its files by system. The boot sync covers the newest 30
  releases; `idearium system releases --sync --all` (or the screen's sync button) covers every one. A release recorded
  before only gains what it lacked; nothing is rewritten.
- **API and command:**
  - `GET /api/releases/changes?since=0.60.47` (`&write=1` saves `CHANGES.md`);
  - `idearium system changes --since 0.60.47 [--write]`;
  - `system releases --version x` lists that release's commits.
- **Idearium:** the Versionium tab has a Releases section.
  - Nexus's parent repo shows every release; a system's repo shows the releases that touched it.
  - A row opens to his words, its changelog file and every commit with its files.
  - "changes since…" shows the whole record; "save CHANGES.md" writes it.
- **Loom:** `release-notes.js` and the screen are wired (`loom/maps/releases-map.js`).

## Proof

- `tests/modules/test-release-notes.test.js` 6/6, on a git repo built by the test with today's cases (two branches
  writing the same version, a renumbering merge, a map commit). Every commit is listed once and none is lost; each
  release is pinned to its own commit; Versionium is filled; the screen draws correctly.
- **Live, in the coder's container:** Versionium and Idearium were booted on a scratch data folder. `POST
  /api/releases/sync {all:true}` recorded 280 releases, 208 with their commits, in 8 s. `system changes` and `system
  releases --version 0.60.69` printed them; `CHANGES.md` was written through the route.
- **Green:** releases 5/5, interaction-contract 39/39, genesis-and-architecture 7/7, nexus-command-tool 8/8.
- **Failures already on main** (unchanged): cli-route-commands CL-07 needs a live Guardian; version-sync has 3
  contract/registry count checks.

## Known, said

- **One merge, three releases.** 0.60.62, 0.60.63 and 0.60.64 were renumbered in one merge, so they share one commit.
  Their branch's work is listed under 0.60.62, and 0.60.63 and 0.60.64 show none of their own.
- **72 of 280 releases have no commit.** They are older than this git history.
- **The screen is not proven in Clear Glass.** It is tested in jsdom; Clear Glass cannot run in the coder's container.
