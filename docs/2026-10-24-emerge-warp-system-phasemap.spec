# docs/2026-10-24-emerge-warp-system-phasemap.spec
# Emerge and warp become one system (the language and its runtime); the spec compiler and the Emerge IDE go to Idearium, the system that
# builds from specs. MAPPED 2026-10-24, before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec.
# Owns the change to: lib/nexus-self/systems.js (the list of systems), lib/system-boundary.js (FOLDED, the census), emerge/, warp/,
# idearium/compiler-bridge.js. Context: docs/2026-10-17-system-drawbridge-phasemap.spec (0.60.230–0.60.236 addenda).

origin:
  date: 2026-10-24
  james: '"Look at emerge. Deeply Custom" · "what do you think of my solutions? whats good aboutemerge / Does emerge stay? As its own system, or with the spec compiler moved into Idearium? Either way it comes off the archive list. warp and emerge? or emerge and idearium?" · "emerge, warp, and idearium merge?" · "okay warp and emerge. / spec compiler, ide, and idearium"'
  context: >-
    Earlier the same day he had listed emerge among folders that "can be archived"; after reading it he took it off the list himself
    ("Either way it comes off the archive list"). The coder counted who requires what: warp is required by nine systems (cortex, cos,
    diagnostic, idearium, intelligence, lib, loom, nexus, ollama); emerge by cli, copilot, guardian, idearium, lib and warp's one adapter;
    emerge never requires warp. The coder recommended emerge + warp as one system and the spec compiler into Idearium, and advised against
    the three-way merge (inside Idearium, nine systems would depend on the system at the top). He chose: warp and emerge one system; the
    spec compiler and the IDE with Idearium.

decisions:

  EW_D0_emerge_and_warp_one_system:
    status: DECIDED 2026-10-24 (his)
    james: '"okay warp and emerge."'
    asked: 'The coder: "Go with emerge + warp as a system, and the compiler into idearium?" after he asked "emerge, warp, and idearium merge?" and the coder showed the nine users of warp.'
    chosen: >-
      emerge/ and warp/ are one system, named emerge (the language: grammar, kernel, codegen, core primitives, and warp, its runtime).
      It is the 16th on Idearium's list (lib/nexus-self/systems.js). It supersedes 0.60.236's reading that warp counts with the kernel
      (FOLDED warp: 'lib'), which is kept in the note there (§0.3).
    changes: [lib/nexus-self/systems.js, lib/system-boundary.js]

  EW_D1_compiler_and_ide_with_idearium:
    status: DECIDED 2026-10-24 (his)
    james: '"spec compiler, ide, and idearium"'
    chosen: >-
      emerge/compiler/ (the spec compiler: kg-builder, invariants, T0/T1/T2, pipeline, phase-specs) and emerge/emerge-ide.js (the Emerge
      IDE) move into idearium/. Read by the coder as "the compiler and the IDE go to Idearium; emerge keeps the language" — a reading;
      "ide" is read as emerge/emerge-ide.js, the only IDE in the tree (to confirm).
    changes: [emerge/compiler/*, emerge/emerge-ide.js, idearium/compiler-bridge.js]

  EW_D2_the_runtime_is_not_a_crossing:
    status: DECIDED 2026-10-24 by his axioms (the coder applies them; to him only if he disagrees)
    problem: >-
      With warp inside a system, the nine systems that use warp/core would each gain a crossing into emerge, and the three sovereign systems
      (components, ollama, cos) would stop being sovereign — against his "We need the systems sovereign." The same day.
    chosen: >-
      emerge's runtime surface (warp/core/, warp/index.js, emerge/core/) is counted as the language: a require of it is kind 'language', not
      a crossing. It is not ratcheted and does not block sovereignty, as a system's use of lib/ does not. Every other file of emerge or warp
      is the system's own, and a require of it is a crossing like any other.
    axioms: >-
      §5.9 (a primitive with no state, lifecycle, persistence or execution is not a system's capability: warp/core and emerge/core are pure
      primitives, emerge/core "zero dependencies (E10)"); §0.0 truth (the census must say what the tree is: using a language is not reaching
      into another system's capability); §1.2 (the surface is a named list in lib/system-boundary.js, so nothing is hidden).

phases:

  EW1_emerge_and_warp_one_system:
    layer: foundation
    status: DONE 0.60.237 — census: components, ollama, cos still sovereign; emerge 4 out / 5 in; ratchet adds nothing (its 3 are the pre-existing SB-06)
    depends_on: [EW_D0_emerge_and_warp_one_system, EW_D2_the_runtime_is_not_a_crossing]
    files: [lib/nexus-self/systems.js, lib/system-boundary.js, tests/modules/test-system-boundary.test.js, tests/modules/test-loom-phasemap.js, tests/modules/test-readme-generate.test.js, tests/modules/test-registry-draft.test.js]
    spec: docs/2026-10-17-system-drawbridge-phasemap.spec
    does: >-
      systems.js gains { name: 'emerge', dirs: ['emerge', 'warp'] } and core gives up its 'emerge' tag; FOLDED warp → emerge; LANGUAGE (the
      runtime surface) is counted as kind 'language'. components, ollama and cos stay sovereign; no new crossing enters the ratchet.
    proof: "the census: emerge is listed; the three sovereign systems stay sovereign; test-system-boundary adds no crossing; the 16 named"

  EW2_the_callers_outside_idearium:
    layer: design
    status: OPEN
    depends_on: [EW_D1_compiler_and_ide_with_idearium, EW1_emerge_and_warp_one_system]
    files: [lib/build-pipeline.js, lib/spec-collect.js, guardian/server.js, copilot/module-builder.js]
    spec: docs/2026-10-17-system-drawbridge-phasemap.spec
    does: >-
      Four callers of the compiler live outside Idearium (lib/build-pipeline.js and guardian/server.js use t2-gate; lib/spec-collect.js
      compile; copilot/module-builder.js pipeline). Moved as they are, each becomes a NEW CROSSING into Idearium (two of them upward from the
      kernel). Each is designed out first (CLAUDE.md, a graph before every phase): a lib file used only by Idearium moves with it (DB17);
      every other caller goes through an Idearium route.
    proof: "the phase graph of EW3 shows no new crossing"

  EW3_the_spec_compiler_into_idearium:
    layer: backend
    status: OPEN
    depends_on: [EW2_the_callers_outside_idearium]
    files: [emerge/compiler/index.js, emerge/compiler/pipeline.js, emerge/compiler/kg-builder.js, emerge/compiler/invariants-engine.js, emerge/compiler/t2-gate.js, emerge/compiler/phase-specs.js, emerge/idearium/client.js, idearium/compiler-bridge.js, tests/modules/test-phase-specs.test.js, tests/modules/test-substrate-spec.test.js]
    spec: emerge/SPEC_COMPILER.spec
    does: >-
      git mv emerge/compiler → idearium/compiler (history kept); emerge/SPEC_COMPILER.spec goes with it. The compiler's requires into emerge
      (chunk, cortex-query, siso, version) point down into the language and stay. No shim is left in emerge (a shim would be the language
      requiring Idearium); every reference to `node emerge/compiler/phase-specs.js` in CLAUDE.md, specs and tests is updated, each by an
      addendum where it was a rule.
    proof: "test-phase-specs, test-substrate-spec and emerge/test pass from the new path; the census shows no crossing from emerge into idearium"

  EW4_the_ide_into_idearium:
    layer: backend
    status: OPEN
    depends_on: [EW3_the_spec_compiler_into_idearium]
    files: [emerge/emerge-ide.js, orchestrator/orchestrator.js, loom/scanners/capability-map.js]
    spec: emerge/spec/emerge.spec
    does: "emerge-ide.js → idearium/ide/; it requires the kernel and codegen from emerge (down). The orchestrator's /api/emerge proxy keeps its port."
    proof: "the IDE boots from idearium/ide and answers on :4242; orchestrator's proxy reaches it"

  EW5_the_registry_with_wires:
    layer: integration
    status: OPEN
    depends_on: [EW4_the_ide_into_idearium]
    files: [emerge/registry-components.js, loom/maps/observability-map.js]
    spec: docs/2026-10-17-system-drawbridge-phasemap.spec
    does: "emerge's registry names warp's components too, and loses the compiler's and the IDE's to Idearium's; loom wires follow the moves."
    proof: "loom_impact on warp/core and idearium/compiler show the real consumers"

## ADDENDUM 2026-10-24 (0.60.237) — EW1 built; what the census found
- LANGUAGE grew from the mapped three to warp/core, warp/dispatch, warp/plugins, warp/index.js and emerge/core: ollama, idearium and lib use
  warp/dispatch and warp/plugins too, and warp's own README says "Nothing in `core/`, `dispatch/`, or `plugins/` imports anything outside
  this folder" (no process, lifecycle or store: §5.9). warp/adapters stay the system's own.
- emerge's 4 ways out: emerge/core/history.js and level.js → intelligence/rfr2 (identity, time), and emerge-ide.js → ollama (leaves with EW4).
  So emerge/core is not the zero-dependency core its header claims (E10): an open finding, not fixed here.
- emerge's 5 ways in are the compiler's callers (EW2's list) plus idearium's warp adapter use; all go away or become routes in EW2–EW4.
- The phase graphs were written after EW1's code, not before (CLAUDE.md, a graph before every phase): said here, not hidden.
- README: the 4,195 phase nodes are now listed per map folder (lib/readme-generate.js). Regenerated, the README is still 585 KB against
  GitHub's 512 KiB, from organic growth of "Every release" and "Every phase"; README.md is left at its committed 493 KB and RG-02 stays red
  until he decides how the inventory is split.
