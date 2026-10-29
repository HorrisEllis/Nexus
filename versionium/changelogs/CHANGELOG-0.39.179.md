# NEXUS 0.39.179 — MCO-E: the roadmap UI

Spec: `idearium/spec/idearium.repo-roadmap.spec`. (The library was written first
as a probe against the real overhaul phasemap; the spec came before the routes,
UI and tests and says so.)

## What it is
A **Roadmap** tab on every repo: the phases in the phasemap files inside the
repo, ordered so every dependency comes before what depends on it, with a status
control per phase.

- **Reads with loom's parser.** `loom/scanners/phasemap-map.js` had its per-phase
  loop inside `loadAll()`. It is extracted unchanged as `parsePhasemapText()`,
  and `loadAll()` calls it. idearium uses the same function on a repo's files,
  so there is no second parser to drift.
- **phase_node rows are derived, never stored.** They are produced on every read
  from the phasemap file, so they cannot disagree with it. "Edits update the same
  rows loom's scanner reads" is met by editing the file loom reads.
- **Ordering.** `depends_on: [MCO0]` names a phase by its key (the id up to the
  first underscore). Layered, then numbered so every resolved dependency has a
  lower `order`. Cycles, ambiguous keys, and dependencies that are not a phase
  in the map (a spec file name, prose) are reported, not dropped. A phase is
  `ready` when every resolved dependency is complete; `blocked_by` names the
  ones that are not.
- **Editing is proven.** `setPhaseStatus` rewrites the `status:` value, then
  re-parses with loom: the target must read back as requested, no other phase's
  id/status/dependency may change, and a file that was valid YAML must stay so.
  Otherwise nothing is written (422). After writing, the route reads the file
  back from disk and parses it again; the response is that state.
- The previous status text is kept, above the `status:` line (loom reads that
  line and the three after it, so below it the old "NOT STARTED" would be read
  as the phase's status; found on the first try): a `status_previous:` key and a
  `# roadmap edit` comment.
- Completing a phase whose dependency is not complete is refused (409
  `DEPS_INCOMPLETE`, naming it) unless `force`; the UI asks. `blocked` is not a
  storable status (loom has none): it is derived and shown.
- Works for a chunk-backed repo and for an imported repo, whose phasemap is a
  source-layer file (`RepoLayer.writeTextFile` writes bytes through that layer
  and keeps the chunk in step).

## Found and fixed in loom
Its phase-header regex required digits after the letters, so `MCO-A_schemas`
never matched: **the overhaul phasemaps' own phases MCO-A..MCO-G were invisible
to loom's roadmap.** Measured across all phasemaps in `docs/` before changing:
529 phases before, 543 after; the 14 added are exactly those. Positionally, 525
phases read identically; 4 (MCO0, MCO2, MCO3, MCO6 of the overhaul phasemap)
differ only in their `systems` tags, which lose words that used to bleed in from
the next MCO-x phase's text (statuses and dependencies identical).

## Proof
Over real HTTP (booted versionium + idearium), 21 checks: the real overhaul
phasemap as a repo's project renders as a dependency-respecting roadmap; an edit
rewrites the file and **loom's own scanner, in its own process, reads the changed
status with every other phase identical**; refusals (blocked 400, unknown phase
or file 404, incomplete dependency 409 with the file unchanged, force works); an
imported repo's source-layer phasemap is found, ordered, edited through the
source layer with its manifest entry matching the new bytes; and **restoring that
repo's baseline snapshot puts the roadmap back exactly.**

Tests: `test-moce-roadmap` 39/39 (incl. 500 random dependency graphs in random
file order), `test-moce-roadmap-ui` 17/17. Mutation checks: dropping the
read-back proof, putting `status_previous` under `status:`, and ordering by file
position each fail tests. The last was not caught by the real-phasemap test
alone (its file order happens to satisfy every dependency), which is why the
out-of-order and random-graph tests exist.

## Also
- `schema.phase_node` extended (optional `map`, `phase_key`, `line`, `layer`,
  `blocked_by`, `ready`, `unresolved_deps`) and moved OPEN -> REAL.
- `api()` in the idearium UI keeps `detail` and `status` on the errors it throws
  (the UI needs the `DEPS_INCOMPLETE` code).
- A prose dependency (`"the auth spec"`) is one unresolved token, not one per word.

## Not done
Creating a phasemap or a phase, or editing `depends_on`, from the UI; `module_path`
(needs MCO-D); who made an edit (a date is recorded). Duplicate-id header-shaped
lines lower in a file (dictionary entries) are reported and not edited.

## Verification
Run: the two new suites, `test-loom-phasemap-status` and `test-loom-phasemap`
(unchanged, pass), `idearium/test/test-mco-a-phase-node-schema` (accepts REAL),
the MCO suites, precommit-check. Not run: the full `run-all.js`. Not checked: a
real browser render.
