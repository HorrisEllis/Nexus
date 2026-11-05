# lib/emerge — archived 2026-11-05 (EAS4g, docs/2026-10-31-emerge-as-a-system-phasemap.spec)

James, 2026-11-05: "Let’s fix the emerge issue" · "It should be a system in nexus. You can request. Emerge was to help me learn to code. A, or migrate" (EAS_D6)

This was the older copy of Emerge inside Nexus's lib/. Emerge is a system in Nexus now, and its source is `emerge/emerge/` (EAS_D6). Its
callers reach it through its door (`POST /compiler/compile | build | run | check`, or its command line), never its files:

- `idearium/compiler-bridge.js`: compile. `copilot/module-builder.js`: build. `guardian/server.js` and `lib/build-pipeline.js`: run.
- `lib/spec-collect.js`: compile. `lib/warp/`: Emerge's `core/admit.js` (EAS4a).
- `phase-specs.js` moved to `idearium/spec-engine/phase-specs.cjs` (EAS_D10, his "Idearium, via the door"). Its spec check is Emerge's
  `check-spec`.
- `cortex-query/` (preflight, writeback) became Cortex's own routes, `cortex/emerge-host/` (EAS4e). `idearium/client.js` (the sync) was
  served by no system and was not rebuilt.
- `compiler/t2-gate.js`'s Guardian and Cortex lines are the coupling his 2026-10-28 rule removed ("don't couple to nexus"); Emerge's
  copy calls a model and a host by route instead (EAS_D9).

Kept here, unchanged, so nothing is lost (§0.3).
