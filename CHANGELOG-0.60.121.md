# 0.60.121 — 2026-10-17

James: "like yours but with a control panel." · "ide, then use clearglass with the search engine tool for the ui editor
ui?" · "the zips need to match the release, and no nest folders"

## The Code tab's Control panel (DK3, `idearium/ui/js/code-dock.js`)

A sixth dock panel, opened from the rail like the others:
- **The repo's work:** playing or paused, since when, by whom and why, and its rewind point (the version taken at the
  pause).
  - ▶ play;
  - ⏸ pause: a version is taken first, work in flight finishes its step, nothing new starts;
  - ⏮ rewind: asks first; the rewind is itself a version.
  - All three go through `POST /api/repos/:uuid/run/:op` (`lib/repo-run-state.js`).
- **What is running now.**
- **Who answers:** the agent, its tool scope, and how its code lands (review or auto), through
  `POST /api/repos/:uuid/agent/settings`.
- The rail shows ⏸ while the repo is paused. The panel follows `idearium.repo.run` events.

## The release zip has no folder around it (`scripts/release-zip.js`)

- **Before:** every path sat under `nexus-<version>/`, so extracting the zip gave `nexus-<version>/nexus-<version>/`.
- **Now:** the files and `VERSION` sit at the zip's root. The zip's name and the `VERSION` inside still say the release.
  COS and Idearium's zip import already read a zip laid out this way.
- GitHub's own "Source code (zip)" downloads are made by GitHub and always have a folder. The release asset
  `nexus-<version>.zip` is the one to use.

## His order for the UI editor, recorded

The IDE (this Code tab) comes first. Then the UI editor, with its UI found through Clear Glass's search-engine tool rather
than designed from nothing. Code tab rebuild map, addendum (d).

## Proof

- `test-code-dock` 10/10 (DK-18: the run shown and paused, the agent picked).
- `test-release-version` 5/5 (RV-03: VERSION and the project at the zip's root, no folder, and COS's `inspect` reads it
  as the release).
- COS app suites: 102/102 across 8 files.
