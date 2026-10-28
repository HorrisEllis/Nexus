# 0.60.34 — 2026-10-15

James: "i also want versions in idearium, github, and each zip, needs to match." · "then the version thing" · "Continue."

He had uploaded `Nexus-main-6.zip`, and neither its name nor its contents said which version it was. The coder found out it was 0.60.23 by comparing its files with commits.

## One version, said the same everywhere

The release number is `lib/version.js`. Every other place now states it, or is checked against it.

| where | what it says now |
|---|---|
| **Idearium** | `v0.60.34` beside the logo, and "Nexus 0.60.34" in Settings. It turns amber, with the reason on hover, if any place disagrees. Also `GET /api/version` and `idearium version`. |
| **GitHub** | On every release change, a workflow checks that the versions agree, then creates tag `v0.60.34` and the release "Nexus 0.60.34". The release notes are this changelog, and the release has the asset `nexus-0.60.34.zip`. A version that's already tagged is left alone. |
| **The release zip** | `nexus-<version>.zip`, with every path under `nexus-<version>/` and a `VERSION` file inside. It contains tracked files only, so never `data/`. |
| **A zip you import** | Idearium reads the version the zip carries and records it on the repo. For a Nexus zip it says how far it is from the running Nexus, e.g. "Nexus 0.60.23 — 11 versions behind the running 0.60.34". |
| **A zip you export** | Named `<repo>-<version>.zip`, with a `VERSION` file inside. |
| **The check catalogue** | New check CK-253 "versions agree" compares `package.json`, the changelog and any git tag on the current commit against the release. |

Two other numbers are module versions, not the release: IdeaOS 4.35.0 and Clear Glass 3.24.0. They are now labelled that way. IdeaOS's startup line used to print its module number as if it were the version.

## Found and fixed

Idearium's zip importer dropped every file without an extension as "unlisted extension": `VERSION`, `LICENSE`, `Makefile`, `Dockerfile` and `.gitignore` never reached a repo. Those well-known names are now read as text.

Counting "how far behind" over changelogs alone would be wrong, because 0.60.23–0.60.25 have no changelog. It counts over every version line in `lib/version.js` instead.

## Proof

test-release-version 5/5:
- A planted mismatch is named place by place: a different `package.json` version, a missing changelog, and a git tag for another version.
- An old Nexus zip is recognised, and its distance from the running version is reported.
- The release zip is read back through Idearium's own importer and gives the same version.
- The workflow's steps and the version surfaces are checked.

The check-catalogue tests pass 7/7 with CK-253 added. The zip and import suites are unchanged:
- history-import 18/18;
- mcoc-baseline 25/25;
- opportunity 28/28;
- repo-git 11/11;
- decompose 15/15;
- repo-history 20/20.

## Not yet proven

The GitHub workflow is proven only by its first run on main, which should publish v0.60.34. A "Download ZIP" of a branch is still named by GitHub (`Nexus-main.zip`). It carries `lib/version.js`, which Idearium reads; the named zip is the release asset.
