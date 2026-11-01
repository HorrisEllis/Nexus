# docs/2026-10-31-emerge-as-a-system-phasemap.spec — Emerge as a sovereign system: genesis's skeleton, its language through its own door,
# one Emerge at the top of Nexus, lib/emerge's callers switched, and a system of systems three levels deep.
# The direction is James's (quoted); the choice between his two options was made by his axioms (EAS_D0); the order and the cut are the coder's.
# Spec: docs/emerge-system.spec.

origin: >-
  James, 2026-10-31: "look at genesis. emerge needs either to be a module for idearium, or a system with a server.js, etc. look at the
  genesis and architecture spec in idearium. needs to be one" · on the coder's answer: "okay. do it as long as it gets up closer to building
  large projects, like i want to be buyilding an operating systems"

status: "EAS1, EAS1a, EAS2, EAS5 BUILT 0.60.336; EAS3, EAS4 OPEN."

decisions:
  EAS_D0_a_system_not_an_idearium_module:
    chosen: >-
      Emerge is a sovereign system with its own server.js (genesis's skeleton), not a module inside Idearium. Idearium uses it as a module
      through its door: "A sovereign system may be embedded as a component inside a larger one, but it never stops being sovereign —
      embedding is not annexation" (§5.9).
    by: >-
      his axioms, applied by the coder: §5.15 rule 3 (Guardian, Copilot and Cortex use Emerge; inside Idearium, Idearium going down would
      break them), §5.15 rule 2 (placement is ownership: Emerge has its own repo, spec and version line), §3.1 (he said "emerge will be
      replacing nexus", MG_D8: it sits under Idearium, not in it). No cost either way: genesis's lib/modules.js is "a module is a system".
      He took it: "okay. do it as long as it gets up closer to building large projects".
  EAS_D1_top_level_not_cos_vendor:
    chosen: >-
      TO CONFIRM (his words on record point at cos/): Nexus holds Emerge, the system, at the top level as emerge/, a locked snapshot of the
      Emerge repo, and the callers of lib/emerge switch to it (F2's switch, kept). COS's own locked copies of what it needs stay as he said
      on 2026-10-30, "copy every file you need to a cos/dependancies folder" (MG28, MG_D9): a copy COS depends on is COS's, the system it
      is copied from is not. Only F2's "callers switch to the snapshot under cos/vendor" is superseded (kept, §0.3; addended there).
    by: >-
      his axioms, applied by the coder: §5.15 rule 2 (if the one snapshot every system uses sat under cos/, COS would own Emerge, and COS
      going down would take Emerge's callers with it, rule 3). F_D2's lock was the coder's, TO CONFIRM; his MG28 words are about COS's own
      dependencies. If he meant Emerge itself to live under cos/, this decision is overturned and EAS3 changes its folder only.
  EAS_D2_two_contracts_two_names:
    chosen: >-
      Where the skeleton and Emerge share a path for different things, both are kept under two names: the IDE's registry and contract
      (ide-registry.js, ide-contract.json), the compiler's event list (events-compiler.js, declared by the skeleton's taxonomy), Loom's record
      schemas (schemas/records/). The skeleton keeps genesis's names so every system reads the same.
    by: "his axioms, applied by the coder: §10.3 (competing truth layers are a failure), §0.3, docs/CLAUDE.md rule 4 (divergent copies are two contracts — surface them)"
  EAS_D3_handlers_run_the_cli:
    chosen: "the door's language handlers run the eg command line in a child process with a timeout, rather than requiring the interpreter in the server"
    by: "his axioms, applied by the coder: §8.6 (the CLI is the tested surface), §5.15 rule 3 (a runaway program kills its child, not the door), §1.2 (a timeout is said)"

phases:
  EAS1_the_skeleton_in_emerge:
    status: BUILT 0.60.336 (Emerge 19200ff)
    depends_on: [EAS_D0_a_system_not_an_idearium_module, EAS_D2_two_contracts_two_names, EAS1a_the_boundary_reads_code_not_text]
    files: [Emerge:emerge/server.js, Emerge:emerge/cli.js, Emerge:emerge/lib/system.js, Emerge:emerge/config.js, Emerge:emerge/emerge.config.json, Emerge:emerge/package.json, Emerge:emerge/registry-components.js, Emerge:emerge/ide-registry.js, Emerge:emerge/interaction-contract.json, Emerge:emerge/ide-contract.json, Emerge:emerge/event-taxonomy.js, Emerge:emerge/events-compiler.js, Emerge:emerge/schemas, Emerge:emerge/schemas/records, Emerge:emerge/lang/components.js, Emerge:emerge/emerge-ide.js, Emerge:emerge/spec/emerge.spec, Emerge:emerge/tests/skeleton.test.js]
    spec: docs/emerge-system.spec
    blocks: [MOD-EAS-SKELETON]
    does: "genesis's skeleton laid out from the archetype in the Emerge repo's emerge/, the 13 shared paths merged by EAS_D2"
    proof: "skeleton test green in emerge/; every existing Emerge suite unchanged"
  EAS1a_the_boundary_reads_code_not_text:
    status: BUILT 0.60.336
    depends_on: []
    files: [cos/archetype/nexus-system/lib/boundary.js, Emerge:emerge/lib/boundary.js]
    spec: docs/emerge-system.spec
    blocks: [MOD-EAS-BOUNDARY-TEXT]
    does: "found in EAS1: genesis's boundary check read template-string text as requires; it now reads code only"
    proof: "the archetype's skeleton test and Emerge's, green"
  EAS2_the_language_through_the_door:
    status: BUILT 0.60.336 (Emerge 1.13.0, 8ca9aa3)
    depends_on: [EAS1_the_skeleton_in_emerge, EAS_D3_handlers_run_the_cli]
    files: [Emerge:emerge/lib/lang.js, Emerge:emerge/registry-components.js, Emerge:emerge/data/nodes, Emerge:emerge/tests/lang-door.test.js]
    spec: docs/emerge-system.spec
    blocks: [MOD-EAS-LANG-DOOR]
    does: "emerge.lang: check, run, test, build, say and synth as nodes, served at POST /lang/*"
    proof: "lang-door.test.js: build returns JS; synth through the door reproduces utf8_decode's six code hashes"
  EAS3_emerge_at_the_top_of_nexus:
    status: OPEN
    depends_on: [EAS1_the_skeleton_in_emerge, EAS_D1_top_level_not_cos_vendor]
    files: [emerge, emerge/EMERGE.lock.json, scripts/emerge-lock.js, lib/nexus-self/systems.js, lib/nexus/autopilot.js, loom/maps/observability-map.js]
    spec: docs/emerge-system.spec
    blocks: [MOD-EAS-NEXUS-PLACE]
    does: "emerge/ at Nexus's root, a locked snapshot at one commit; registered as a system with its wires"
    proof: "the lock check passes and fails on a one-byte edit; Emerge's door boots from Nexus"
  EAS4_callers_through_the_door:
    status: OPEN
    depends_on: [EAS2_the_language_through_the_door, EAS3_emerge_at_the_top_of_nexus]
    files: [guardian/server.js, idearium/compiler-bridge.js, copilot/module-builder.js, cortex/core/raid/contract-intake.js, lib/hooks/emerge.hooks.js, tests/modules/test-substrate-spec.test.js, lib/emerge, _archive/lib/emerge]
    spec: docs/emerge-system.spec
    blocks: [MOD-EAS-CALLERS]
    does: "run-time callers to Emerge's door, build-time ones to the snapshot; lib/emerge archived"
    proof: "nothing requires lib/emerge; the module suite green"
  EAS5_a_system_of_systems:
    status: BUILT 0.60.336 (Emerge 58a12d8)
    depends_on: [EAS2_the_language_through_the_door]
    files: [Emerge:emerge/tests/nesting.test.js, Emerge:emerge/lib/modules.js, Emerge:emerge/lib/handoff.js]
    spec: docs/emerge-system.spec
    blocks: [MOD-EAS-NESTING]
    does: "the shape of a large project, small: three levels of systems, an Emerge program built at the deepest, a handoff between siblings"
    proof: "nesting.test.js green"

order: |
  EAS1 → EAS2 → EAS5 in the Emerge repo (Emerge becomes a system, speaks through its door, and nests);
  EAS3 → EAS4 in Nexus (one Emerge, and every caller through it). EAS5 is what his "building an operating system" asks of Emerge first.
