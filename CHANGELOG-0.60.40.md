# 0.60.40 — 2026-10-15

James: "we added gating and chunking recursively, dynamically, like bricks" · "yes" (to splitting deeper than one level)

## BR2: splitting recursively, up to a depth limit

A brick splits when it fails twice, is too big, or runs out of context:

1. **First by its actions,** as before.
2. **Then by the steps inside an action.** If a piece still fails, it splits again by the steps inside it. Those steps are read from the brick's own words (semicolons, sentences, list items, "then"), so nothing is invented.
3. **Up to a depth limit.** It goes one level at a time, up to `routing.contract_depth` (default 3, allowed 1–8).

Two safety rules:

- **It stops cleanly.** At the depth limit, or when a step has nothing left to split, the brick says so once ("indivisible") and isn't looped on.
- **It never re-splits.** A split into the same pieces it came from is refused.

A brick that split passes only when its pieces pass *and* the whole holds together: Idearium re-checks the assembled file.

**CK-247 (bounded decomposition)** is now a check that runs, on one contract or a folder of them. A contract gate can name it (`{ check: CK-247, path }`).

## Proof

- test-recursive-split 5/5:
  - a brick split to depth 2, and the whole passed;
  - at the limit, the brick stops and says so once;
  - re-splitting into the same pieces is refused;
  - CK-247 fails on a planted re-split and on a planted depth past the limit.
- Unchanged:
  - contract-adapters 19/19
  - contract-gates 20/20
  - raid-runs-contract 7/7
  - gate-versioning 6/6
  - contract-phase-build 11/11
  - check-catalogue 7/7
  - pipeline-routing 19/19
- CT0 re-checked: 5/5 gates pass.

## Not done

Splitting by an existing file's code units (lib/chunker). A step says what to do, not where in the file, so this has to wait for a planner that names the units.

## Next

RN1: releases and tags in Versionium.
