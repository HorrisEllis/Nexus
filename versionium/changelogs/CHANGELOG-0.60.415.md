# CHANGELOG 0.60.415 — EAS4 done: lib/emerge archived; phase-specs is Idearium's, through Emerge's door

James, 2026-11-05: "Let’s fix the emerge issue"

Asked where `phase-specs.js` lives once lib/emerge goes. It requires eight Nexus lib modules, and moving it into Emerge would break his
2026-10-28 rule ("don't couple to nexus"). His answer: "Idearium, via the door" (EAS_D10, superseding EAS_D7 in part).

## What moved
- **`phase-specs`** → `idearium/spec-engine/phase-specs.cjs`. Its spec check is Emerge's kg-builder, asked through Emerge's command line
  (`node emerge/emerge/cli.js check-spec --file <spec>`, the same command as `POST /compiler/check`). It still runs with no server up,
  and it never requires Emerge's files.
- **`lib/emerge`** → `_archive/lib/emerge`: 90 files, moved with git, nothing deleted. `ARCHIVED.md` says where each part went.
- **kg-builder:** Emerge's copy, the newer one with the 2026-10-28 fixes. Spec module paths point at it.

## What was repointed
Live code, tests and instructions; history stays as it was.
- The IDE's registry is `emerge/emerge/ide-registry.js` and its contract `ide-contract.json` (his EAS_D2, "two contracts two names"). The
  registry is identical to the old lib copy.
- Diagnose, file integrity, blueprint index, the boot list, the hooks, the system check, the route-contract check, the precommit check,
  the release script, `CLAUDE.md` and `docs/CLAUDE.md`.
- `MOVED.emerge` is now `emerge/emerge` (`lib/nexus-self/systems.js`).

## Found on the way
- `lib/cli/diagnose`'s kernel check required `./emerge/emerge-kernel.js` from the repository root, a folder that did not exist. Fixed.
- RC-02 now checks Emerge's own guarded watcher (2026-10-28, his "don't couple to nexus") instead of `lib/safe-watch.js`.

## Proof
- **phase-specs, old vs new, across every map on the same tree:** 2560 phases, 629 with drift, the same lines both ways. The drift was
  there before.
- **Against a clean worktree of the commit before:** no new failure. The ones left are the base's own: RS-01, the atlas refs, README size,
  RD-04, NR-10, SCE-004, EM-005, the kernel test's `emerge/io` check, and PN-04.
- **Passing:** compiler-door 9/9; test-substrate-spec 3/3; test-phase-specs 4/4; test-phase-specs-tag 7/7; test-route-contracts 4/4;
  test-pipeline-root-causes 19/19; test-registration-shape 8/8; test-emerge-core 6/6; emergence and WARP 198/198; test-warp2 7/7;
  test-spec-pipeline 13/13; test-emerge-in-nexus 5/5.
- **Census:** no edge added. The count moved 1121 → 1129, all of kind `kernel`: phase-specs' eight lib requires now run from Idearium
  (system → lib, allowed while DB0a is open), where they were lib → lib.
