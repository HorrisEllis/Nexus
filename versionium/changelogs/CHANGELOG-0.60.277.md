# 0.60.277 — Versionium owns the changelogs and the release logic that reads them

James, 2026-10-29, given two ways to keep §5.15 for the changelogs ("(a) the release logic moves into Versionium … (b) the files go back to
a place Nexus's root owns … The coder recommends (b)"): "a"

His call, over the coder's recommendation. Mapped first: `docs/2026-10-07-versionium-releases-phasemap.spec`, decisions VS_D1–VS_D4 and
phases VS1–VS4, each decided by his axioms.

## VS1 — the move, and the split
- **Moved with `git mv` (history kept).** `lib/changelogs.js`, `lib/nexus-releases.js` and `lib/release-notes.js` are now in
  `versionium/lib/`.
- **What reads lib's own files stays in lib** (§5.15 rule 2). `lib/release-version.js` keeps:
  - `current`, `fromFiles`, `distance`, `describe` and `cmp`;
  - `agreement`, over lib's own places: `lib/version.js`, `package.json`, `VERSION` and the git tag;
  - the version-line parsers `quoteOf`, `lineOf` and `lines`, moved here from nexus-releases because they parse `lib/version.js`.

  Idearium's repo import, the COS app, `nexus-update` and CK-253 use these without Versionium.
- **Versionium adds what only it can say.** `released()` includes the changelogs, and `agreement()` adds the changelog line. It reads the
  version lines through lib's `lines()`, never by opening lib's file.

## VS2 — Versionium's routes, declared in its contract
| Route | What it does |
|---|---|
| `GET /api/versionium/nexus/releases` | every release |
| `POST /api/versionium/nexus/releases/sync` | records them as Versionium releases, through its own `POST /api/versionium/releases`, so its events fire |
| `GET /api/versionium/nexus/changelog?version=` | one release's changelog |
| `GET /api/versionium/nexus/changes?since=&write=1` | every change since a release, from git |
| `GET /api/versionium/nexus/agreement` | whether every place that states the release agrees, the changelog included |

Each route is in `registry-components.js`, and the `interaction-contract.json` mirror is regenerated from it: 13 routes before, 18 now,
none dropped.

## VS3 — the others ask
- **Idearium asks Versionium's routes and requires none of the moved code.** That covers `releases.changelog`, `releases.changes`,
  `releases.sync`, the boot sync and `system.version`.
- **When Versionium is down** (rule 3):
  - the release routes answer 502 "Versionium is down or refused";
  - the version route falls back to lib's own places, with "the changelog: not checked: Versionium is down".
  - Idearium keeps running, and CK-253 checks lib's places with Versionium not running at all.
- **The scanners find changelogs by walking the tree.** `phase-census`, `spec-census` and `context-atlas` read them as source text through
  `lib/changelog-files.js`, and they require no system's code. This is decision VS_D4, the coder's reading of §5.15 for scanners, to
  confirm.
- **Scripts.** `scripts/release-zip.js` (a script, so not a system) requires Versionium's module. `npm run changes` runs
  `versionium/lib/release-notes.js`.

## VS4 — records and proof
- `tests/modules/test-versionium-owns-releases.test.js` 4/4:
  - VO-01: Versionium serves the releases, a changelog (404 when there is none), the changes and the agreement with its changelog line.
  - VO-02: each route is declared in the contract and in the mirror, and the server serves it.
  - VO-03: no system requires the moved code, and the drawbridge ratchet adds nothing (ok; 540 baseline, 400 now, 0 added).
  - VO-04: an outage is said, not spread.
- Tests updated to the move: test-release-version 5/5 (lib's agreement no longer reads changelogs, Versionium's does; CK-253 names lib's
  two bad places), test-release-notes 6/6, test-changelogs-home 4/4.
- Base results kept. These fail exactly as on the base, checked by running both: test-releases (RL-03, a connection reset here),
  test-readme-generate, changelog.test, test-cg-agent-doors, test-event-contracts, test-nexstore-census.
- Loom: `releases-map`, `economy-map` and `build-surface-map` name the new paths and the HTTP consumer edge.
- `docs/CLAUDE.md` has a dated addendum superseding 0.60.274's "read them through lib/changelogs.js". The earlier one is kept (§0.3).
- `docs/PROOF-OF-COMPETENCY.md` has an entry: his call, over the coder's, and what it shows.
