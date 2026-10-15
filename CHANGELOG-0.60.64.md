# 0.60.64 — 2026-10-15

_Built on branch claude/brave-cori-eczug1 as 0.60.52; renumbered when merged with main, whose own 0.60.52 is a different release (CHANGELOG-0.60.52.md)._

James: "phases tags by system/nested repo"

## What was there

Each Nexus system is a nested repo inside Idearium's Nexus repo, and its Phases tab already shows the phases tagged
for that system (the "<system>'s only" filter, on by default). But a phase's tags came either from a hand-written
`systems:` line or from a guess at its prose. They could disagree with what the phase actually touches. WB0, for
example, creates `lib/` files and edits a `cos/` spec, yet was tagged idearium / cortex / copilot.

## What changed

- **Tagged by its files**: loom's phasemap reader tags a phase with the system that owns each file it names
  (`lib/nexus-self/systems.js ownerOf`, the one owner of every path), beside its declared systems.
  - Declared plus files → `systemsFrom: 'declared+files'`, with the added ones in `systemsFromFiles`.
  - Files but no systems line → tagged from the files (`'files'`), no longer guessed from prose.
- **Across all 1,390 phases** in every map: 429 move from guessed to file-owned tags; 72 declared phases gain a system.
  Each of those now appears in the nested repo of the system it actually touches.
- **On screen**: each phase card and the detail panel show its systems; the phase search matches them.
- **The WARP / spec-framework map**: its systems lines now cover every file's owner (WB0 → core, idearium, cos), and
  PT2 is added as a done phase.

## Proof

- `tests/modules/test-phase-specs-tag.test.js` 7/7. PT-05 (a phase editing `guardian/` is in guardian's repo) and
  PT-06 (files beat guessing) fail on the old reader.
- `test-loom-phasemap` 7/7. T-007 asserted the Emerge map's phases are exactly `'declared'`; it now accepts
  `'declared+files'`, which is still declared, plus the files' owners.
- Unchanged: phasemap-status 14/14, diagnosis-facts 10/10, phases-tab 5/5. test-nexus-self-and-cos-run is 24/30
  with and without this change; two nexus-self suites need `js-yaml`, not installed in this container.

## To confirm

"Nested repo" was read as the per-system repos inside Idearium's Nexus repo (one per system in
`lib/nexus-self/systems.js`).
