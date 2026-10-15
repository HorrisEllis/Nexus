# 0.60.51 — 2026-10-15

James: "can you make sure those are added to the phases in idearium. make sure all of the files and dependancies are mapped. and i want the specs to tagged per phase"

## What was there

Idearium's Phases tab reads every `docs/*phasemap*.spec` through loom (`loom/scanners/phasemap-map.js` →
`idearium/repo/roadmap.js`), so the WARP / spec-framework map was already listed. But:
- each phase's system was guessed from its prose (WB0 came out as cortex, WB1 as guardian);
- no phase named its files;
- a phase had nowhere to say which specs own it.

## What changed

- **The map** (`docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec`): every phase now declares
  - `systems` (no longer guessed),
  - `files` — real paths, with "(new)" on the phase that creates a file,
  - `depends_on`,
  - `specs` — the specs that own the behaviour it changes.
- **`file_dependencies`**: each file's requires and consumers, measured by grep on 2026-10-15. Each becomes a loom
  wire when its phase lands.
- **Specs tagged per phase**: loom's phasemap reader reads `specs:` (key and list forms); Idearium's roadmap keeps it;
  the phase detail shows a "specs" row; the phase search matches spec names. Any phasemap can use it now.
- **PT1** added to the map as a done phase for this work.

## Proof

- `tests/modules/test-phase-specs-tag.test.js` 4/4; all 4 fail on the old reader:
  - PT-01 specs read on key- and list-form phases;
  - PT-02 every phase of the map declares systems, files and specs; every dependency resolves;
  - PT-03 every spec and existing file named exists (new files are marked);
  - PT-04 Idearium's roadmap keeps the specs on its nodes.
- Unchanged: test-loom-phasemap 7/7, test-loom-phasemap-status 14/14, test-phasemap-diagnosis-facts 10/10,
  test-phases-tab 5/5. (test-moce-roadmap needs `js-yaml`, not installed in this container; it fails the same way
  without this change.)

## To confirm

"Tagged per phase" was read as: each phase names the specs that own it, and (SF3) a spec an agent writes is tagged
with the phase that asked for it.
