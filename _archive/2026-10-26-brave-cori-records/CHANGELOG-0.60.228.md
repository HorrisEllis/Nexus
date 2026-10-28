# 0.60.228 — 2026-10-24

James: "need to either update existing or create new ones. then we could have each .spec bundled with each .phase with each .dag. all with a id or uuid that matches them." · "only map if it's a good idea"

## Built: the bundle (no new map: this is PS1's work, recorded in its map)

- **One id per phase.** Every `.phase` carries a stable `uuid`, derived from its map and phase id, so it is the same on every run.
  Its `.graph` (the DAG slice) carries the same id as `phaseUuid`.
- **The spec link.** `specLink` names the spec, and each module by the module's own `uuid`.
  - `declared`: the map names `spec:` and `blocks:`.
  - `discovered:path`: one of its files is declared by exactly one spec module, and at most 5 phases name that file.
- **The `.phase` is the bundle's head.** It points to its graph by hash and to its spec and modules by their uuids, so there is no third
  file per phase.

## "Update existing", measured

- The existing specs declare 334 modules over 167 file paths. 70 of the 241 `.spec` files are not YAML and could not be read for links.
- The first count linked 305 phases, but 171 of those links came through `idearium/api/index.js` alone. That file is declared by 7
  modules and named by 171 phases, so it identifies nothing. With the rule above (decided by the axioms: truth over coherence, and NC0's
  evidence rule), **157 phases have a real spec link**: 133 declared and 24 discovered.
- **1,889 phases have no spec to point at.** Those are the specs still to write.

## Proof

- `tests/modules/test-phase-specs.test.js` 7/7. **PS-07:**
  - the uuid is stable, and differs by map;
  - SL4's `.phase` and its `.graph` carry the same uuid;
  - its declared link names MOD-SL-LOOP with that module's uuid;
  - a hub file links nothing.
- Also green: test-pipeline-nodes 4/4, test-phase-graph 5/5, test-substrate-spec 3/3.
