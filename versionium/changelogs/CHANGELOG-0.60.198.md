# 0.60.198 — a build stands on the registry: spine, event bus, interaction contract, component registry

James, 2026-10-21: "yes, the registry should be the spine, event bus, interaction contract, and component registry."

## Context
SP5 was refused for a missing atlas.json. He asked what a build needs an atlas for, then "shouldn't that be the component registry.
architecture tab". 0.60.197 recorded the registry as well, and the coder asked whether it should replace the atlas as what a build
requires. This is his answer, and his definition of the registry.

## What was found (read from the code)
- idearium/repo/architecture.js (the Architect tab) already extracts all four parts from the code index: components, require wires,
  events with who emits and consumes them, routes and CLI commands. The planner reads it (`PP.registryOf({ architecture, … })`).
- Nothing in the build reads atlas.json. The planner's "atlas" is README text. The gate demanded a file the build never used.

## What changed
- `idearium/repo/snapshot.js`: `registryVersion.parts` records components, spine, eventBus and contract, each with its own sha256; one hash
  covers all four.
- `idearium/api/index.js`: a phase build requires the registry. With none, it indexes once and snapshots again; still none → refused
  `NO_REGISTRY`, with the reason on the run.
- The Versionium list shows "registry <hash>: N components · spine W · bus E events · contract R routes, C cli".
- Mapped first as IN3a on docs/2026-10-19-infrastructure-spine-phasemap.spec (DAG-checked, no problems); addendum on
  idearium/spec/idearium.repo-snapshot.spec.
- Kept: atlas.json is still recorded; snapshots that are not a build keep their old gate.
- Not read from code: ports and health checks (named per system in docs/INTERACTION_CONTRACTS.md). Said, not claimed.

## Fixed on the way
0.60.197 reworded the NOT_INDEXED message and dropped "import pipeline", which test-mco3-versionium-tab reads. Restored. That suite
was not run for 0.60.197.

## Proof
test-pipeline-root-causes 18/18 (RC-16: a real indexed repo's registry has all four parts, its spine holds the app.js → title.js wire;
RC-18: the build gate reads registryVersion). mco3-repo-snapshot 39/39, mcob-snapshot-restore 30/30, mco3-versionium-tab 32/32,
contract-phase-build 14/14, approval-chain 6/6, phases-tab 5/5, plus 22 other snapshot/build suites unchanged. Already failing before
this release and unchanged: test-cg-accounts-portal-settings UI-05, UI-08; test-nexstore-census NC-01.
