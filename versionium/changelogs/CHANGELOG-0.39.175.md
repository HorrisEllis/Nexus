# NEXUS 0.39.175 — Versionium repo subtab (MCO3 UI)

Per-repo subtab **Versionium** in idearium, on top of the MCO3 routes from
0.39.174.

- Snapshot list, newest first, with indexed source hash, a `stale index`
  badge, git commit, verification and test status.
- **Take snapshot** with an optional message. A never-indexed repo shows the
  server's own message (409 NOT_INDEXED) rather than failing silently.
- Per-snapshot detail of all nine §33 fields. A field that could not be
  determined shows its stated reason, never a blank or 0. A stale snapshot
  shows both the on-disk and the indexed hash.
- **Since previous** strip: identity comparisons only (on-disk source hash,
  git commit, atlas/chunk/graph hashes, test and verification status). No
  score, no "significance".
- Says on the page that a snapshot stores no file content and cannot restore
  files. There is no restore control, on purpose (MCO-B).
- Refreshes on `idearium.repo.snapshot.committed` for the open repo. Renders
  are dropped if the repo or subtab changed while the fetch was in flight.
- All values are escaped (a message containing `<img onerror>` is shown
  literally).

## Found by the test
The first version of the strip compared `sourceHash.value`. That is the hash
the indexes were built from; it does not move when a file is edited without a
reindex, so the strip said "same source" for a repo whose files had changed.
It now compares `diskHash`.

## Verification
`tests/modules/test-mco3-versionium-tab.js` 21/21. jsdom, with the fake
server built from the real snapshot library over a real pipeline run (no
hand-written records). Registered in `run-all.js`; prints SKIP and counts
nothing if jsdom is not installed.

Not verified: a real browser render. No screenshot was taken, so layout,
spacing and the actual look are unchecked. `idearium/test/ui-restructure.smoke.cjs`
was not run (it reads `/tmp/scan-fixture.json`).
