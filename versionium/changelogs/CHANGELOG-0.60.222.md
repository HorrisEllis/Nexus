# 0.60.222 — 2026-10-23

James: "whats the most important? can you help me build, invent, innovate, ways for idearium to build phases, all of them, we need this to work so it can start building itself." · then: "contiue getting idearium building phases"

## Why this first

The self-building loop (docs/2026-10-23-self-building-loop-phasemap.spec) is open at five places. The first is that nobody, person or
agent, could ask "what can be built now". The build refused a phase with an open dependency (DG1) or no files (DG2) only after it was
asked to build it, and "pending" was often stale. SL0 is that answer. The loop (SL4) needs it before it can pick the next phase.

## Spec first (his 2026-10-20 rule)

- `docs/self-building-loop.spec` is the full spec for SL0–SL6: 7 modules, 5 schemas, 8 interfaces with their real exports, and
  constraints SL-001..006. It compiles in emerge's kg-builder at depth 1.0, with no black node and the invariants valid
  (test-substrate-spec SS 3/3).
- Each SL phase names `spec:` and `blocks:`, and is specced again by `emerge/compiler/phase-specs.js` into its `.phase` and `.graph`
  beside the system that owns it. SL0 has two crossings, both already in the ratchet's baseline. No new crossing.

## Built (SL0)

- **`lib/build-queue.js` 1.0.0.** No model, no clock. It stands on lib/phase-dag.js (DG3) and lib/phase-census.js (CNS1); the flights
  (FR6) are passed in. Every open phase goes in exactly one place, by the first rule that applies:
  1. his open decision (named);
  2. an open dependency (named);
  3. a cycle;
  4. a dangling name;
  5. no files (DG2 would refuse it);
  6. done by the census's evidence;
  7. held (its last three runs did not land);
  8. a same-file phase with no order between them (the lower layer goes first);
  9. otherwise the queue, ordered by DAG layer, then how many open phases wait on it.
- **Routes:** `GET /api/phases/next` (Nexus's maps) and `GET /api/repos/:uuid/phases/next` (one repo's maps; a Nexus system is judged
  in Nexus's tree). `?limit=`, `?group=`. Read-only.
- **Commands:** `phases next [--limit n] [--group …]` and `repo next <repo>`, rows in idearium/cli/route-commands.js, so every agent
  has them through nexus.command.
- **UI:** the Phases tab's rail shows "can be built now · N of M open". Each phase has a ▶ build button that uses the phase's own build
  route, and a "waiting:" line gives the count in each group.
- **Loom:** lib/build-queue.js → lib/phase-dag.js, with consumers api/index.js, route-commands.js and phases.js
  (loom/maps/run-state-map.js).

## Found and fixed on the way

`loom/maps/run-state-map.js` had not parsed since 0.60.216. Eight wire descriptions added in 0.60.216–0.60.219 held an unescaped `'`
(`the site's`, `toolbar's`, `'agent'`), so `loom/bootstrap.js` would throw on require. Each one is escaped; every loom map now passes
`node --check`. The bootstrap was not run here, because it writes the registry under data/.

## The run, over Nexus's own maps

```
1183 open phases across 166 maps — 170 can be built now
   1. IN0_baseline  (2026-10-19-infrastructure-spine; unlocks 58)
   2. NM1_one_name_per_file  (2026-10-19-idearium-control; unlocks 32)
   3. GR0_graph_census  (2026-10-20-substrate-graph-traversal-chunking-gating; unlocks 28)
blocked: decision 18 · deps-open 579 · dangling 2 · no-files 391 · done-by-evidence 1 · conflict 22 · held 0
```

The counts add up: queue plus every group is 1183.

## Proof

- `tests/modules/test-build-queue.test.js` 6/6:
  - BQ-01 one fixture phase per group, each with its reason, and nothing lost;
  - BQ-02 the census and held rules;
  - BQ-03 Nexus's real maps;
  - BQ-04 every door;
  - BQ-05 the rail in Clear Glass, where the button posts the build;
  - BQ-06 the real API route with the census.
- Also green: test-substrate-spec 3/3, test-roadmap-import 8/8, test-phase-dag 8/8, test-loom-phasemap 8/8.

## Next

SL1: a proven, landed phase closes itself (lib/phase-close.js through the one status writer). Then SL2: done by evidence, dry run first.
SL5 (when a proven change may land without him) is his decision: A, B or C. The coder recommends B.
