# 0.60.212 — Loom, Copilot and Intelligence hold their own files (DL3)

James, 2026-10-22: "then resume data migratino" · "Architect 1 isn't a system i don't believe and can be deleted."

Map: docs/2026-10-21-data-layout-phasemap.spec DL3_rewire_writers, with a dated addendum.

## What moved
- **Loom:** its Cortex-sync buffer, uploads and scaffolds.
  - `nexus-status`'s Loom driver no longer reads the root `data/loom`. That was the stray copy a 2026-08-14 fix had already removed from
    `nexus-map`.
- **Copilot:** its diagnose output.
- **Intelligence:** its data folder (`DATA_DIR`) and synthesis files.
- For all three:
  - no code names their root `data/` paths, so each one's files come home at its next boot;
  - Diagnostic's table of systems points each at `<folder>/data`.
- **Progress:** ten systems are rewired. Left: Idearium, Cortex, and the shared `data/ledger/` folder.

## Architect
Not removed. Checked before acting:
- It is a running system: `architect/service.js` on port 3747, started by Orchestrator.
- It has 14 routes: blueprints, spec wizard, map scan, translate, compile, SNR, gaps.
- Idearium's compiler bridge calls its `/api/map/scan`. Without Architect, that step carries on with less information instead of breaking.

Removing it is James's call, so it's put to him with that cost named. If he says yes, it is archived, not deleted.

## Proof
- `test-data-rewired` 3/3: no code names a rewired system's old path; Diagnostic's table points home; the shared writers resolve each
  rewired system to its own folder.
- The 27 test files that load these modules were each run on 0.60.211 and on this release. They match, except `test-guardian-own-data`:
  its example of a system not yet rewired was Loom, so it now picks one that isn't rewired yet. 5/5.
