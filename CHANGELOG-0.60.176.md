# 0.60.176 — 2026-10-20 — full specs first, then phases, then each phase specced again

James, 2026-10-20: "not phasemaps. full specs to build them. everything needs  to be speccced before built,so it can be rebuilt if
lost. can you do that? what about specs, then phases then specced again with dag and related files for it, look at the handoff"
· "look in emerge"

The rule and the order are his. He pointed at emerge, where the format already was: emerge/SPEC_COMPILER.spec and the compiler that
reads it. The coder's part: two specs written in that format, the per-phase writer, and one compiler fix.

## What it stands on (§8.6)
emerge's module spec format and its compiler (kg-builder → invariants engine → tier contract), lib/phase-dag.js, lib/phase-graph.js,
lib/phase-map-auto.js, lib/pipeline-nodes.js (the .phase and .graph node builders), lib/phase-plan.js (owner), and the handoff's
PN1 layout for phases as nodes.

## Built
- **Two full build specs**, compiled by emerge's own kg-builder with every module and schema at specDepth 1.0, no BLACK node, and
  the invariants engine valid:
  - `docs/substrate.spec`: graphs, traversal, chunking, dynamic chunking, gating, and the phase-spec writer.
    6 schemas, 16 interfaces on what exists, 18 modules.
  - `docs/belief-loop.spec`: crystals, invariants, provenance, evidence weighing, confidence, adversarial review, root cause, source
    trust, cross-domain verification, borrowing. 8 schemas, 14 interfaces, 16 modules.

  Each module carries its path, exports with signatures, gate pipeline, behavioral contracts, error paths and acceptance tests.
- **Phases tied to the specs:** all 34 phases of the two 2026-10-20 maps name `spec:` and the module they build (`blocks:`).
- **PS1 `emerge/compiler/phase-specs.js`: each phase specced again.**
  - It writes `<owner>/phases/<map-id>/<phase>.phase`: what's authored (files, depends_on, blocks, spec, graph hash).
  - It writes `graph/<phase>-<hash>.graph`: the related files with roles (changes, uses, used-by), crossings, and the phase's slice of
    the whole DAG (upstream, downstream, blocked by, critical path).
  - Both go beside the owning system, `--check` reports drift, and all 34 are written.
- `lib/pipeline-nodes.js` `graphNode` keeps the DAG slice. The build attached it, but the node dropped it.
- The rule is written into docs/CLAUDE.md.

## Fixed (specced first)
emerge's `getBuildOrder()` sorted nodes by readiness and dependency count instead of ordering them topologically. Any spec with a chain
longer than two, or with a fully specced interface, got false "build order violation" criticals. It's now Kahn's algorithm, with the old
sort kept as the tiebreak. It was specced first as `MOD-KG-BUILDER` in emerge/SPEC_COMPILER.spec, because the spec kg-builder cites,
`spec-parser.spec`, isn't in the tree.

## Found, not fixed
- `test-system-boundary` SB-06 (the boundary ratchet) has been red since 0.60.170–172. `lib/phase-dag.js → loom/scanners/phasemap-map.js`
  and `lib/verify-first.js → cos/testenv/run-target.js` are new upward crossings, and each needs a route or a move. This release's own
  crossing (lib → emerge) was designed out by placing the writer in emerge.
- emerge's own tests have pre-existing failures that load fixtures missing from the tree (`/mnt/user-data/uploads/causal-nexus.spec`,
  `./runtime.spec`) or need Cortex running. The counts are unchanged by this release.

## Proof
`test-substrate-spec` 3/3: SS-01 and SS-03 fail against the old kg-builder and pass with the fix. `test-phase-specs` 4/4.
`pipeline-nodes` 4/4, `phase-dag` 8/8, `phase-graph` 5/5, `pipeline-root-causes` 6/6. emerge's tests have the same pass counts as before.
