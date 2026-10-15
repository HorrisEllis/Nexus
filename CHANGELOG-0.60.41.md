# 0.60.41 — 2026-10-15

James: "need more coordination for releases. like i want idearium to have releases and a changelog for each version. it was added to the wrong place." · "use versioning in versionium for versions using the api. should be hooked into the atlas. just need more coordination for versions."

## RN1: releases live in Versionium

Until now a release existed only as Nexus's own `lib/version.js` line and a GitHub tag. Versionium holds every commit, but it knew nothing about releases. An Idearium repo had no releases at all.

**Versionium has tags and releases** (`versionium/lib/releases.js`):

- **A tag** is a name on a commit, and it never moves. The same name on the same commit is fine; on another commit it is refused (409).
- **A release** records:
  - the version and its tag;
  - the commit it points at: a Versionium commit, a git commit, or both;
  - James's words;
  - the notes and the proof;
  - the commits since the last release;
  - the changelog.
- **Recording twice is safe.** A release recorded again keeps what it had and only fills in what it lacked.
- **The API:**
  - `GET` and `POST /api/versionium/tags`
  - `GET` and `POST /api/versionium/releases` (one release, or a batch)
  - `GET /api/versionium/releases/:version`

**Every Nexus release is in it** (`lib/nexus-releases.js`). Each one is read from the three places it was already written down:

- its line in `lib/version.js`;
- its `CHANGELOG`;
- the git commit that set it.

Idearium records them through the API every time it starts, and `releases --sync` does it on demand.

- 250 releases in total.
- 210 carry James's words verbatim. The other 40 have no quote rather than a made-up one.
- This clone is shallow, so 160 have a git commit; each of the rest says why it has none.

**Every Idearium repo can cut its own release** (`lib/repo-releases.js`, `repo releases <repo> --cut`):

1. Any pending changes are committed first.
2. The head of the repo's Versionium branch is tagged.
3. The release lists the commits since the last one, following each commit's parent rather than its time, because two commits can land in the same millisecond.
4. Notes are written from those commits unless you give them.

The version is the last one with the patch number raised by one, or 0.1.0 for the first. A cut is refused, with the reason, when:

- the repo has no versions yet;
- nothing changed since the last release;
- the version is not above the last one.

**Commands:** `repo releases <repo> [--cut] [--version] [--quote] [--notes]` and `releases [--sync] [--version]`.

**Loom:** `loom/maps/releases-map.js` adds 3 components with 9 wires: Versionium's routes, Idearium's API, `release-version` and `repo-versions`.

## Proof

- test-releases 5/5:
  - a tag that would move is refused;
  - a release recorded again keeps James's words;
  - the API answers single releases and batches;
  - the Nexus backfill holds every release, and a second sync records nothing new;
  - a repo released twice lists exactly its own commits each time;
  - every refusal gives its reason.
- Unchanged:
  - versionium-sovereign 11/11
  - versionium-repo-history 7/7
  - mco3-versionium-tab 32/32
  - vsb1 5/5
  - versionium-migration 10/10
  - release-version 5/5
- Pre-existing failure: cli-route-commands CL-07 fails the same way on main, because Guardian isn't running in the test environment.

## Not done

These are the coder's choices and need James to confirm them:

- **Restoring a release** uses the existing snapshot restore on its commit, rather than a second restore path. RN3's button will call it. No test proves it here.
- **The GitHub workflow is unchanged.** It runs on GitHub and can't reach a local Versionium. "Mirror" therefore means both read `lib/version.js`: one source, two records.
- **There is no screen yet.** The Releases view is RN3, the next phase.
