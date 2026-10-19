# 0.60.162 — 2026-10-19

James, 2026-10-19: "look at the most recent phases. gates, dag per contract, phase, spec, chunk. need to get the pipeline
working." · "the red error in the second image." · "look at the node taxonomy at .spec" · "yes it should all be persistent." ·
"you're at 69% if you can do that before running out, do it. need this to work."

## The red error

His Idearium activity log showed a build stalling on:

> `SP0_format not built: no dependency graph — it names no file it changes, and none could be found from its words (mapping
> source: none)`

That is DG2 (`lib/phase-graph.js`), the gate that refuses a build with no dependency graph — his own rule, 2026-10-18: "each
phase, has to have a dependany graph before executing." The gate was right. The plan behind it was not.

## The cause

`derivePlan` (`idearium/repo/spec-plan.js`) is the W2 "a plan always lands" fallback: when the model writes no usable phasemap,
the plan is derived mechanically from the spec's own sections — one phase per section, its layer read from the section. But every
derived phase was written with **`files: []`**. A phase that names no file it changes has nothing for DG2 to place, so DG2 refuses
it. The plan landed and could never build — the stall he saw, surfacing ten minutes later as the red error and an auto-retry loop.

## The fix — each phase names its files (so the graph is real)

- `derivePlan` now gives every phase at least one file (`_filesForPhase`):
  - the file paths the spec's own section text names (`_pathsIn`, a path-shaped match, `node_modules` and `.spec` skipped);
  - else a convention from the phase's layer and section name (`lib/<section>.js`, `api/…`, `ui/…` by `_LAYER_DIR`), the file the
    agent then creates.
- `mapPhase` (`lib/phase-map-auto.js`) reads those declared files (`source: 'declared'`), so `graphFor` has `changes` and
  `ready = true`. DG2 passes. The build runs.

## "yes it should all be persistent" — the node taxonomy

He pointed at the node taxonomy (`lib/node-export.js` `KNOWN_TYPES`, `lib/node-schemas/schema.*`): it had `chunk`, `run`,
`step_gate`, `contract`, `response` — but **not `phase`, `graph` or `gate`**. So a plan's phases, a phase's dependency graph and a
contract's gates lived in memory or in loose JSON (`data/phase-graphs/…`) and did not survive a restart, did not show in the store,
and could not be read as a dag per phase/contract/spec/chunk.

- **Three new node types**: `phase`, `graph`, `gate` — added to `KNOWN_TYPES` with their schemas (`lib/node-schemas/schema.phase`,
  `schema.graph`, `schema.gate`), auto-loaded and validated by `checkPayload`.
- **Their builders** (`lib/pipeline-nodes.js`): `phaseNode` (a phasemap phase, id `map::id`), `graphNode` (a DG2 graph from
  `graphFor()`, id `kind:for:hash`), `gateNode` (a contract-gate record, id the gate key), plus `writeNode` to persist the finished
  envelope (overwrite is correct — a `.graph` is hash-immutable, a `.phase`/`.gate` records a lifecycle whose latest state is on
  disk, as `idearium/lib/chunk-nodes.js`).
- **The build persists them**: at the DG2 point (`idearium/api/index.js`), the graph and the phase it is for are now written as
  `.graph` / `.phase` nodes alongside the loose JSON — §1.2 non-fatal, the build is unaffected if the node write fails.

## Proof

- `tests/modules/test-pipeline-nodes.test.js` — PN 4/4 (registered in `run-all.js`):
  - PN-01 derivePlan names a file for every phase (spec paths, else a convention); `validatePlan` reads them back;
  - PN-02 `phaseNode`/`graphNode`/`gateNode` build envelopes that validate against their schemas;
  - PN-03 `writeNode` persists and the node round-trips through `importFromFile`;
  - PN-04 the taxonomy knows the three types; an unknown type is refused.

## Files

- `idearium/repo/spec-plan.js` — `_LAYER_DIR`, `_FILE_RE`, `_pathsIn`, `_filesForPhase`; `derivePlan` writes `files:` per phase.
- `lib/node-export.js` — `KNOWN_TYPES` += `phase`, `graph`, `gate`.
- `lib/node-schemas/schema.phase`, `schema.graph`, `schema.gate` — new.
- `lib/pipeline-nodes.js` — new; builders + `writeNode`.
- `idearium/api/index.js` — persist the graph and its phase as nodes at the DG2 point.
- `tests/modules/test-pipeline-nodes.test.js`, `tests/modules/run-all.js` — the test, registered.
- `lib/version.js`, `package.json` — 0.60.162.
