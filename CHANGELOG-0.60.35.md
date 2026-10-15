# 0.60.35 — 2026-10-15

James: "we added gating and chunking recursively, dynamically, like bricks. look at the contracts also and raid. i feel something happened" · "yes, read it all, map it first, in the phases"

## What happened

He was right. Reading the code found four things:

1. **Two contract systems that never meet.**
   - RAID's contract queue (2026-08-28, his words: "all contracts … go to raid's input folder, and queue, then through raid").
   - The `.contract` bricks (0.60.15–0.60.18).

   Phase builds use the bricks and skip RAID. Spec-chunk builds and compile reach RAID only "for observability" (the code's own words), and get no bricks.
2. **Bricks only on the happy path.** With no Ollama model or no planner, a phase falls back to the old path, with no bricks, no gates and no checkpoints. That's exactly when things are going wrong.
3. **Splitting is one level deep.** A brick splits into its steps once, and a step never splits again. That was deliberate, to stop endless splitting.
4. **A regression of the coder's own (GT1, 0.60.30).** When a whole climb up the agent ladder failed, the brick's retry was refunded, so it climbed every agent again. Measured: 4 climbs where 2 were allowed.

## Fixed

**GT1a.** A brick that has climbed its whole agent ladder now uses up its retry, so a failing brick stops after `retry_limit` climbs. The new test GT-08 fails on the old code and passes now.

## Mapped (not built yet)

`docs/2026-10-15-one-contract-raid-releases-phasemap.spec` holds the plan, in build order. RD0 comes first because the later phases build on it.

| phase | what it does |
|---|---|
| RD0 | RAID runs the `.contract` (its gates before, its verdict and self-heal after) |
| RD1 | every build goes through RAID |
| BR1 | bricks on every path |
| GS1 | a Versionium snapshot per gate, rewind a failed brick to its last good state, compare a gate now against what passed |
| BR2 | splitting recursively, up to a depth limit |
| RN1–RN3 | releases and tags in Versionium, changelogs written from the commits, a Releases view in Idearium |
| AT1 | atlases and system specs generated from releases (they're 15 releases behind) |
| FR1 | failure reports through failure-mode forensics and the reflection engine |
| ST1 | stability checks |

## Proof

- test-contract-adapters 19/19, including the new GT-08.
