# 0.53.0 — 2026-10-09

James: "we also need to declutter the roadmap." · "can you map all of them. see what is done already, or do it as you go?" · "most amount of power, and highest leverage, least amount of tokens."

## The roadmap reads finished work as finished

`loom/scanners/phasemap-map.js` has two status readers, one for each phasemap layout. Both now read the first word of a status the same way.

- **Finished work counts as done.** BUILT, CLOSED, MET, SHIPPED, LANDED, FIXED and RESOLVED now count as done. The older reader only knew DONE, so 31 phases that their own maps call finished were counted as open.
- **The clean-up's answers are understood:**
  - SUPERSEDED, RETRACTED, RETIRED, FOLDED and DONE-ELSEWHERE close a phase.
  - LATER puts a phase on the shelf: it is kept and visible, but it is not the roadmap.
- **Two existing rules still hold:**
  - NOT STARTED anywhere in a status still wins.
  - A word inside prose never counts; only the first word of the status does.
- **`summary()` reports three new counts:** the roadmap, the shelf and closed phases.

The roadmap now reads **1,143 phases: 453 done, 37 in progress, 653 on the roadmap**. Before, it read 683 open, and no map was touched to get here.

## The roadmap triage, first pass

`docs/roadmap-triage.md` sorts whole maps (69 decisions) instead of individual phases (721). For each map it proposes the path, the shelf, or folding it into a map already on the path. Nothing moves until James decides.

## Checking what is done

The quick way to check "done" doesn't work. Matching phase names against the changelogs over-reports: changelogs name a phase when it is mapped as often as when it ships, so RS1, BR5 and SB10 all came up as false positives. Done is therefore checked by reading each phase against the code, as each map on the path is triaged. This is recorded in the one-roadmap map as OR2.

## Tests

- `test-loom-phasemap-status`: 13/13, including the new PS-013.
- `test-loom-phasemap`: 7/7.
- `test-phases-tab`: 5/5.
- `test-thread`: 5/5.
