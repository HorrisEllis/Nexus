# 0.60.480 — CIE8 done: the spec compiler is out of Emerge

James, 2026-11-07: "yeah move it, until we have something to slot in the gap it will leave. then we could even invent something ground up,
thats another point of emerge. build towards a world a bit more me." · "as long as its removed from emerge." · "do it" · 2026-11-10:
"Continue."

The decision is his (CIE_D7). The slices and the code are the coder's.

## Built (docs/2026-11-06-cie-eg-build-phasemap.spec CIE8, slices b–d)
- **b, the copy.** The compiler's family went to `idearium/spec-engine/spec-compiler/`:
  - `compiler/` (with its command-line check of Emerge), `chunk/`, `version.js`, `verify.js`, `build-spec.js`, `events-compiler.js`;
  - its own spec, `SPEC_COMPILER.spec`, and its tests;
  - a copy of `siso/`, counted as a duplicate for PIL5.

  Its own `package.json` makes it CommonJS inside Idearium's ES-module package. Proven equal before anything moved: the knowledge graph on all
  47 registered specs, and cie-eg.spec's T0/T1 compile, 28 of 28 files.
- **c, the callers.** Idearium serves `POST /api/spec-compiler/compile|build|run|check` (read for compile and check, write for build and
  run).
  - In-process inside Idearium: `compiler-bridge.js`, `phase-specs.cjs` and the `emerge.compile` action.
  - Through Idearium's door, with the same response shapes: Guardian (run), Copilot's module-builder (build), `lib/build-pipeline.js` (run)
    and `lib/spec-collect.js` (compile).
- **d, the archive.** Emerge's copy went to `_archive/2026-11-07-emerge-spec-compiler-moved/` with `git mv`, so its history follows it.
  - Emerge's door keeps its `/compiler/*` nodes, and they answer 410 naming the new route.
  - Emerge's npm scripts, event taxonomy and registry entry are updated.
  - In Nexus: `system-check` names Emerge's entry as its `server.js`; `diagnose`, the substrate, direct-compile and system-check tests, and the
    audit point at Idearium.

## Emerge's JavaScript
23,026 → 13,213 lines. It was moved, not removed: Idearium carries the compiler until his ground-up replacement in Emerge.

## Proof
- From Idearium: propagation 16, kg 24, tier-contract 29, invariants 32, gap-field 32, reply-engine 24, target 11, build-spec 18.
- Emerge: npm test, `test:system`, lang 168, differential 19, bootstrap 11, ledger 21, contract 8, native 109, selfhost 16, ide 7, say 16,
  learn 6.
- Nexus: test-emerge-in-nexus 5/5; Emerge's lock retaken.

## Failing before and after this change (the same counts on the commit before), named, not fixed here
- `test-substrate-spec` SS-01: `cos/spec/cos-console.spec` has a markdown `## ADDENDUM` heading (2026-11-08) that breaks its YAML.
- SS-02: phase MG38 names no spec.
- EM-005, a 2026-09 archive file missing.
- SCE-004.
- `test-emerge-rung`, 3.
- The static audit, 54.
- `orchestrator.js` checks for a compiler at `orchestrator/emerge/compiler`, a path that never existed.
