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
    status: BUILT 0.60.339 (Emerge f023240; test-emerge-in-nexus EN-01..04)
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
    # ── EXPANDED 2026-11-05 (his rule: phases expand, not rewritten) — primitives first; one primitive per gate; compounds per layer ──
    # James, 2026-11-05: "Primitive based coding?" · "Would also set expectations. One primitive per gate. Compounds, each layer."
    # Found that day, before any switch (MOD-EAS-CALLERS: "a caller whose answer changes is stopped and the difference named"): lib/emerge
    # and the emerge/ snapshot have drifted both ways — 37 files differ, 31 exist only in lib/emerge (compiler/t2-gate.js 343 lines there,
    # 291 in the snapshot; kg-builder.js 605 / 615; compiler/phase-specs.js only in lib/emerge). Six run-time callers: copilot/module-builder.js
    # (pipeline), guardian/server.js and lib/build-pipeline.js (t2-gate), idearium/compiler-bridge.js and lib/spec-collect.js (compiler index),
    # lib/warp/adapters/emerge-field.js (core); thirteen files name lib/emerge paths as text.
    # The approach (his, choosing the coder's (b) over reconciling all 37 first): what the callers use is found and each use becomes ONE
    # primitive behind Emerge's door — one primitive per gate, its expectation stated (in, out, failures) — and each layer above is a
    # compound of the primitives below it. Callers are rebuilt on those primitives; lib/emerge is archived as it stands, carrying over only
    # what a primitive needs, into Emerge's own repo first (then a new lock). Nothing is copied again.
    still_his: "whose are compiler/phase-specs.js and kg-builder.js (they turn his maps into phase files and check the specs): the coder reads Idearium (it owns specs and phases), to confirm"
    # ── EXPANDED 2026-11-05 — the primitives found (read from the six callers) ──
    # Four functions, already layered, each a compound of the one below:
    #   L0 evaluate (core)                constraint + state → { ok } | { gap } | { ok:false, constraint, reason }   ← warp's admit, every link
    #   L1 compile  (compiler/index.js)   spec text + dir → the compiled graph, ok | error                          ← idearium/compiler-bridge, lib/spec-collect
    #   L2 build    (compiler/pipeline)   spec file + out dir → { ok, skipped, error }                              ← copilot/module-builder
    #   L3 run      (compiler/t2-gate)    spec file + out dir + provider → the closed loop, with progress events   ← guardian/server, lib/build-pipeline
    # Emerge's door (emerge/emerge/server.js) is the template's: /contract, /handoff, /handoff/receipt, /health; work arrives as a handoff
    # matched to a command node that accepts its kind. The snapshot's command nodes are lang.* (build, check, run, say, synth, test),
    # handoff, modules, nodes, status — none of the four (command nodes emerge.compile, .check, .codegen … exist only in lib/emerge).
    # So each primitive becomes a command node in Emerge (its expectation in the node), built in Emerge's own repo, then a new lock.
    # Found, to raise with him (a cost before it is paid): L0 evaluate runs on every WARP link; a handoff is a file moved through
    # input/ → processing/ → done/, far too slow per link, and Emerge down would stop WARP (§5.15 rule 3). L1–L3 become asynchronous
    # (a handoff and its receipt) where their callers wait inline today.
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

# ── ADDENDUM 2026-11-01 — EAS3 built (0.60.339) ──────────────────────────────────────────────────────────────────────────────────────
# James, 2026-11-01: "the github repo not the one in lib already. i want that done now. then i want to start being able to use it."
# emerge/ from github.com/HorrisEllis/emerge at f02324025d60b9fe8a38e201f65770e2f13f0079, 269 files locked; COS runs it behind its wall
# (the compartment map's CP1 mechanism, LM6); systems.js names it; the ports table and the orchestrator's proxy point at :4900. Drift, said:
# MOD-EAS-NEXUS-PLACE named lib/nexus/autopilot.js for the boot plan; since MG17 the boot plan is each compartment.json, so Emerge's runtime
# is a Nexus overlay on its compartment.json, recorded in the lock. Loom's wires for emerge/ come from its source scanner (no hand map yet).
# lib/emerge stays until EAS4 moves its callers to the door.

# ── ADDENDUM 2026-11-05 — primitive-based, one primitive per gate, compounds per layer (his) ──
decisions_addendum_2026_11_05:
  EAS_D5_one_primitive_per_gate:
    status: DECIDED 2026-11-05 (his)
    james: '"Primitive based coding?" · "Would also set expectations. One primitive per gate. Compounds, each layer."'
    context: "Shown, the same day, that EAS4's two copies have drifted both ways (37 differ, 31 only in lib/emerge), and two ways to finish it: (a) reconcile all 37 first, (b) primitives first. Emerge already keeps its base values in emerge/emerge/core/primitives.eg; Nexus names its shared primitives in lib/system-boundary.js PRIMITIVES."
    chosen: "Each gate is one primitive with its expectation stated — what it takes, what it returns, how it fails — and each layer is a compound of the primitives of the layer below. A caller relies on a primitive's expectation, never on its code. EAS4 is done this way."

