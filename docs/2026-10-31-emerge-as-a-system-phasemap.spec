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

  # ── ADDENDUM 2026-11-05 — primitive-based, one primitive per gate, compounds per layer (his) — moved here from after order: on 2026-11-05, where a phase reader took it as EAS5's body ──
  EAS_D5_one_primitive_per_gate:
    status: DECIDED 2026-11-05 (his)
    james: '"Primitive based coding?" · "Would also set expectations. One primitive per gate. Compounds, each layer."'
    context: "Shown, the same day, that EAS4's two copies have drifted both ways (37 differ, 31 only in lib/emerge), and two ways to finish it: (a) reconcile all 37 first, (b) primitives first. Emerge already keeps its base values in emerge/emerge/core/primitives.eg; Nexus names its shared primitives in lib/system-boundary.js PRIMITIVES."
    chosen: "Each gate is one primitive with its expectation stated — what it takes, what it returns, how it fails — and each layer is a compound of the primitives of the layer below. A caller relies on a primitive's expectation, never on its code. EAS4 is done this way."

  EAS_D6_emerge_is_a_system_in_nexus:
    status: "DECIDED 2026-11-05 (his); supersedes EAS3's lock rule in part (kept, §0.3)"
    james: '"It should be a system in nexus. You can request. Emerge was to help me learn to code. A, or migrate"'
    context: >-
      Asked whether the coder could add the Emerge repository (to build EAS4's primitives there, under EAS3's rule that "the Emerge repo is
      the one source; this snapshot changes only by a new lock"), and which way for evaluate. Read the same day (public, read-only): the Emerge
      repository's main is f023240, exactly the commit Nexus locked — nothing newer; its other branch claude/emerge-learn (9a7181c, 2026-10-30)
      adds only docs/learn (the course, levels 0–6), and Nexus's emerge/docs/learn already holds a newer version of it (2s-say-it, the garden
      examples). Nothing is lost by Nexus becoming the source.
    chosen: >-
      Emerge is a system in Nexus: emerge/ is its source, developed in Nexus; the separate repository was a learning project (his). EAS4's
      primitives are built in emerge/ directly. evaluate (L0) is a shared primitive (his "A"; "or migrate" left open as the alternative), pure
      and used directly — not through a handoff — beside the bus, nexus-connect, the WARP core, SISO and the hooks (lib/system-boundary.js
      PRIMITIVES).
    still_his: "whose are phase-specs.js and kg-builder.js (the coder reads Idearium)"
  EAS_D7_the_spec_compiler_is_emerges:
    status: "DECIDED 2026-11-05 (his)"
    james: '"I don’t know idearium?" · then, shown both records side by side: "A."'
    context: >-
      Two records disagreed: PS1 (2026-10-20, phase-specs.js's own header) placed it in Emerge, "the spec compiler's system", on purpose; his
      later words ("okay warp and emerge. spec compiler, ide, and idearium"; a voice note: "spec compiler's moving to Idearium") pointed to
      Idearium, which is where the coder's first reading came from. Options: (a) Emerge's — the compiler stays Emerge's heart, Idearium a user
      through Emerge's door (the coder's lean); (b) Idearium's.
    chosen: "(a) kg-builder.js (the spec compiler) and phase-specs.js are Emerge's; Idearium (its Phases screen, API, CLI) and the release script reach them through Emerge's door, never its files"

  # ── ADDENDUM 2026-11-05 — the primitives as a small model's structure; one kernel from three sets (his) ──
  EAS_D8_one_kernel_and_the_small_model_bench:
    status: "DECIDED 2026-11-05 (his) — after EAS4; no phase written yet"
    james: '"Yes. This could be huge." (on the primitives letting a 3B-7B local model do what needs a big one) · his own words a month before,
      scripts/bench-file-prompt.js, 2026-10-05: "combining primitives or invariants to build higher leverage code for less tokens." · asked
      when: "After EAS4" · asked which primitives: "One kernel, merged"'
    context: >-
      Shown, the same day, three primitive sets that are all his: Emerge's core (Rheon: Field, Constraint, Transition, Observation, Lens, Gap,
      History, Level, Budget, Seed; read from emerge/emerge/core, a kernel of six leaves plus compounds), the ERAVOS kernel (ERAVOS.kernel.spec
      1.0.0: Organism, Space, Hook, Wire, Projection, Constraint, Mutation, Event, Asset, Permission, + Port in amendment 3.1) with its proposed
      object model (one store, stable ids, typed associations), and Nexus's shared primitives (lib/system-boundary.js PRIMITIVES: the bus,
      nexus-connect, the hooks registry, SISO, WARP's Link/Expectation/Axiom/Ledger). They overlap (Constraint in all three; three hash-chained
      logs; Event and Gate twice in lib) and each covers what the others lack (Emerge: law and evidence; ERAVOS: Relation, Identity,
      Permission; WARP: causation and expectations). Choices put to him: merge into one kernel · Emerge's core as the kernel with Relation and
      Identity added · three sets with a mapping · not yet. The idea of a benchmark (a small model, the same tasks with and without the
      primitive contracts; tests passed, tokens, attempts; the unfavourable case reported, §17.11) was the coder's shaping of his idea.
    chosen: >-
      One kernel, merged from the three sets: each concept once. Taken up after EAS4. The small-model benchmark is built on that kernel's
      contracts.
    still_his: >-
      Where the merged kernel lives and whose it is (a system of its own, Emerge, or the kernel; §5.15) · what Seed means (Emerge built
      replayable randomness; ERAVOS's "seed-registry" and "generator id + seed" read the same; an outside analysis read "initial condition") ·
      whether merging retires siso/ and warp/core's duplicates.
    # ── ADDENDUM 2026-11-05 — an idea, his, recorded (not a decision, no phase): a world simulation as a domain for the benchmark ──
    # James, 2026-11-05, on an outside analysis of the primitives as the base of a large persistent game world ("This feels huge."), asked
    # whether to log it: "Yes then finish eas4"
    # Read against the code the same day (the coder's): simulation level-of-detail is the shape of Level (a node's summary stands for the
    # detail under it, hashed over its children; the expand/collapse rule is not built); a consequence chain (bridge → route → supply →
    # settlement → faction) is Transition's causedBy and WARP's Link and Expectation; a frame budget is Budget, and ERAVOS's audio thread
    # (~2.7 ms per 128-sample block at 48 kHz, "timing and stability first") is already a tighter real-time deadline than a 60 FPS frame.
    # Rendering, physics, animation and content are not what the primitives give.
    # The coder's suggestion, his to place: one domain of the merged-kernel benchmark — a few thousand agents and settlements built only
    # from the kernel, Level choosing detail by distance; measured: time per tick against a fixed budget, agents at full detail vs summarised,
    # and that a collapsed settlement expanded again matches a run never collapsed.

  EAS_D9_emerge_calls_back_by_route:
    status: "DECIDED 2026-11-05 (his)"
    james: 'asked how Nexus\'s pieces take part when it asks Emerge through its door: "Emerge calls back by route"'
    context: >-
      Found the same day, reading EAS4's last three callers (copilot/module-builder.js L2 build; guardian/server.js and lib/build-pipeline.js
      L3 run; idearium/compiler-bridge.js): lib/emerge's pipeline runs Cortex's preflight and writeback and Idearium's sync in-process, and
      its t2-gate sends T2 to Guardian (:7820 /command, the SEAM queue). emerge/ removed that coupling on purpose (his, 2026-10-28: "don't
      couple to nexus"): it calls a host (compiler/host.js) and a model (compiler/model.js), and says Nexus keeps its own "in its repo"; none
      exists. Through the door nothing can be handed over in-process. So the coder's earlier plan to "port t2-gate's 52 lib-only lines" was
      wrong: those lines are the coupling his rule removed. The conflict put to him: Emerge depends on nothing above it (2026-10-28) vs model
      work routes through RAID and Guardian (§5.2, §9.1). Choices: Emerge calls back by route · callers wrap the door (T2 on Emerge's own
      Ollama, bypassing Guardian) · one Nexus build host placed in a system he names · plan it first.
    chosen: >-
      A request through Emerge's door may name a host and a model as routes. Emerge calls them over HTTP: still no Nexus file in Emerge, and
      any system can be swapped in for any of them. Guardian stays the model for Nexus's builds, so routing and the economy hold.
    changes: >-
      emerge/: model.js gains api "route" (POST a URL: { prompt, meta } → { ok, text, … }); host.js accepts route settings (ping, preflight,
      writeback, sync each a URL; summarize stays local). Nexus: the system that owns each part serves it (Cortex: preflight, writeback;
      Idearium: sync; Guardian: the model). Then L2 build and L3 run go behind the door and the four callers switch.

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
    status: "OPEN — expanded 2026-11-05 into EAS4a–EAS4g (one per primitive, then the callback routes, the callers, the archive); done when they are"
    depends_on: [EAS2_the_language_through_the_door, EAS3_emerge_at_the_top_of_nexus]
    files: [guardian/server.js, idearium/compiler-bridge.js, copilot/module-builder.js, cortex/core/raid/contract-intake.js, lib/hooks/emerge.hooks.js, tests/modules/test-substrate-spec.test.js, lib/emerge, _archive/lib/emerge, emerge/emerge/core/admit.js, emerge/emerge/core/index.js, lib/warp/adapters/_archive/emerge-field.js, lib/warp/core/Engine.js, lib/warp/spec/warp.spec, tests/modules/test-warp2.test.js, emerge/emerge/lib/compiler.js, emerge/emerge/registry-components.js, emerge/emerge/data/nodes/command/emerge.compiler.compile.command, emerge/emerge/tests/compiler-door.test.js, emerge/emerge/compiler/host.js, emerge/emerge/compiler/model.js, emerge/emerge.cos, lib/spec-collect.js, tests/modules/test-spec-pipeline.test.js, idearium/api/index.js, idearium/cli/route-commands.js]
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
    # ── EXPANDED 2026-11-05 (0.60.405, renumbered from 0.60.388 on merge) — L0 done: evaluate's one caller moved, with no new crossing ──
    # Tried first, as told to him: name emerge/emerge/core/constraint.js in lib/system-boundary.js PRIMITIVES and have
    # lib/warp/adapters/emerge-field.js require it. The ratchet refused it: PRIMITIVES only names a blocker, and the require was a NEW
    # upward edge (lib -> emerge, the kernel depending on a system, §5.9). Reverted, not pushed.
    # Done instead, by §5.15 (a thing belongs to the system it serves): the adapter turns Emerge's constraints into admit(link), and WARP's
    # Engine already takes admit handed in, so the adapter is Emerge's. It is emerge/emerge/core/admit.js (an L0 compound on ./constraint,
    # its expectation in its header); the lib file is in lib/warp/adapters/_archive/ with its reason. Its one caller, test-warp2, uses
    # Emerge's core now. PRIMITIVES is unchanged.
    # Proof: test-warp2 7/7, test-emerge-core 6/6, test-emergence-and-warp-suites 198/198 (same before and after); census 1120 crossings
    # before and after, and check() adds none of this change's (its two added edges, cos/manager/autopilot-door.js, were there before:
    # test-system-boundary 8/2 before and after). Left for L1-L3: compile, build and run as command nodes behind Emerge's door.
    # ── EXPANDED 2026-11-05 (0.60.406, renumbered from 0.60.389 on merge) — L1 compile behind Emerge's door; one of its two callers moved; the other stopped, its difference named ──
    # Before the switch (MOD-EAS-CALLERS): lib/emerge's compile and emerge/'s, on SPEC_COMPILER.spec, substrate.spec and belief-loop.spec
    # (50, 78, 70 files, skipCortex, T1), differ in one line only: the compiler's version stamp in src/index.ts and src/types/index.ts
    # (v1.1.0 from lib/emerge, v1.13.0 from emerge/). Named here; it is the stamp of the compiler that ran.
    # Built: component emerge.compiler (emerge/emerge/lib/compiler.js), capability emerge.compiler.spec, command emerge.compiler.compile with
    # its expectation in the node (expects: in, out, fails), route POST /compiler/compile, event emerge.compiler.compiled, its registry entry.
    # The spec comes in as text and the emitted files go back as text (a caller in another system shares no folder with Emerge). It runs on
    # the local host: no Cortex, Emerge depends on nothing above it (his, 2026-10-28).
    # Moved: lib/spec-collect.js's compiler template now posts to Emerge's door (lib/nexus-client.js, :4900); Emerge down is said, nothing
    # proposed (SP-08d). Stopped, not moved: idearium/compiler-bridge.js. Its default (skipCortex false) runs Cortex's preflight and writeback
    # inside lib/emerge's compile; Emerge's compile has no Cortex. Moving it changes its answer. By §5.15 and his 2026-10-28 rule, the coder's
    # reading is that Idearium calls Cortex itself around the door; to do as its own step, with its difference shown first.
    # Proof: emerge tests/compiler-door.test.js 4/4 (CD-02: through the door, byte for byte the files compile() writes); lang-door 8/8,
    # nesting 5/5, skeleton green; test-spec-pipeline 13/13; census 1120 before and after; emerge/ locked again (352 files). The CLI and agents:
    # POST /api/emerge-system/compile and the row emerge.compile (EN-04 green); no screen yet, the UI deferred and said.
    # ── EXPANDED 2026-11-05 (0.60.407, renumbered from 0.60.390 on merge) — L2 build and L3 run behind the door, Emerge's side (his EAS_D9: "Emerge calls back by route") ──
    # Corrected: "port t2-gate's 52 lib-only lines" (above) was wrong; they are the Guardian/Cortex coupling his 2026-10-28 rule removed.
    # Built: compiler/model.js api route; compiler/host.js routeHost; POST /compiler/build and /compiler/run (commands with expects:); a
    # host or model as a path is refused at the door. Run's progress comes back as a list, not live (named). Proof: compiler-door 8/8.
    # Next: Cortex (preflight, writeback), Idearium (sync), Guardian (the model) each serve their route; then the four callers switch.
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
  # ── EXPANDED 2026-11-05 — EAS4, one phase per primitive, each with its DAG, requirements and prerequisites (his) ──
  # James, 2026-11-05: "the most expensive one is done right? pre-requisits, and dag per primitive?" Found when he asked: EAS4's four
  # primitives were comments inside one phase, so no primitive had a depends_on, requires or prerequisites the DAG could check. EAS4 is
  # expanded (his rule: phases expand) into its parts below; EAS4 itself is done when all of them are.
  EAS4a_L0_evaluate:
    status: "BUILT 0.60.405 — test-warp2 7/7, test-emerge-core 6/6, emergence and WARP suites 198/198"
    depends_on: [EAS_D5_one_primitive_per_gate, EAS_D6_emerge_is_a_system_in_nexus]
    spec: docs/emerge-system.spec
    blocks: [MOD-EAS-CALLERS]
    files: [emerge/emerge/core/admit.js, emerge/emerge/core/constraint.js, lib/warp/adapters/_archive, tests/modules/test-warp2.test.js]
    requires: [node]
    prerequisites: ["Emerge's core constraint primitive present (EAS1)"]
    expects: "in: a constraint and a state · out: { ok } | { gap } | { ok:false, constraint, reason } · fails: never throws; a bad constraint is a refusal"
    does: "evaluate, the L0 primitive, used directly (a shared primitive, EAS_D6), as WARP's admit"
  EAS4b_L1_compile:
    status: "BUILT 0.60.406 — compiler-door CD-01..04, test-spec-pipeline 13/13; one of two callers moved (lib/spec-collect), idearium/compiler-bridge stopped with its difference named"
    depends_on: [EAS4a_L0_evaluate, EAS_D7_the_spec_compiler_is_emerges]
    spec: docs/emerge-system.spec
    blocks: [MOD-EAS-CALLERS]
    files: [emerge/emerge/lib/compiler.js, emerge/emerge/server.js, emerge/emerge/registry-components.js, lib/spec-collect.js, emerge/emerge/tests/compiler-door.test.js]
    requires: [node, "Emerge's door up (:4900)"]
    prerequisites: ["emerge/ locked (EAS3)"]
    expects: "in: spec text · out: the compiled graph and the emitted files as text | error · fails: Emerge down → said, nothing proposed"
    does: "compile through Emerge's door: POST /compiler/compile, command emerge.compiler.compile"
  EAS4c_L2_build:
    status: "BUILT (Emerge's side) 0.60.407 — compiler-door CD-05..08; its caller (copilot/module-builder.js) not switched"
    depends_on: [EAS4b_L1_compile, EAS_D9_emerge_calls_back_by_route]
    spec: docs/emerge-system.spec
    blocks: [MOD-EAS-CALLERS]
    files: [emerge/emerge/compiler/pipeline.js, emerge/emerge/compiler/host.js, emerge/emerge/server.js, copilot/module-builder.js]
    requires: [node, "Emerge's door up", "a host by route (EAS4e) for a build that reports to Nexus; the local host otherwise"]
    prerequisites: ["EAS4b's compile"]
    expects: "in: spec file text, out dir, host routes · out: { ok, skipped, error } · fails: a host or model given as a path is refused at the door"
    does: "build through the door: POST /compiler/build"
  EAS4d_L3_run:
    status: "BUILT (Emerge's side) 0.60.407 — compiler-door CD-07 (11 T2 nodes through a model route, 11 complete); its callers (guardian/server.js, lib/build-pipeline.js) not switched"
    depends_on: [EAS4c_L2_build]
    spec: docs/emerge-system.spec
    blocks: [MOD-EAS-CALLERS]
    files: [emerge/emerge/compiler/t2-gate.js, emerge/emerge/compiler/model.js, emerge/emerge/server.js, guardian/server.js, lib/build-pipeline.js]
    requires: [node, "Emerge's door up", "a model by route (Guardian's, EAS4e)", "a host by route (Cortex and Idearium, EAS4e)"]
    prerequisites: ["EAS4c's build"]
    expects: "in: spec file, out dir, model route, host routes · out: the closed loop's result with its progress as a list (not live, named) · fails: the model route down → said at the first node"
    does: "run, the most expensive primitive (the closed loop with a model), through the door: POST /compiler/run"
  EAS4e_the_callback_routes:
    status: "BUILT 0.60.412 — Cortex's host routes; Guardian's model is its existing ask route; Idearium's sync found dead (below)"
    depends_on: [EAS4d_L3_run, DO3_cortex_door]
    spec: docs/emerge-system.spec
    blocks: [MOD-EAS-CALLERS]
    files: [cortex/server.js, cortex/boot.js, cortex/registry-components.js, cortex/emerge-host/preflight.js, cortex/emerge-host/writeback.js, lib/emerge/cortex-query/index.js, lib/emerge/cortex-query/writeback.js, lib/emerge/idearium/client.js, idearium/api/index.js, guardian/server.js, lib/nexus-client.js, emerge/emerge/compiler/model.js]
    # ── EXPANDED 2026-11-05 (0.60.412) — built, and what reading the old code found (prerequisite: what it does today, read first) ──
    # - Cortex: POST /api/emerge-host/ping|preflight|writeback (cortex/boot.js, through its door; three entries in Cortex's own registry).
    #   The handlers are lib/emerge/cortex-query's two files copied unchanged into cortex/emerge-host/, so a build's answer does not change.
    #   Read on 2026-11-05, of what they ask Cortex: preflight's /api/gaps and /api/memory?table= answer; /api/projects, /api/files and
    #   /api/memory/search are served by no system, so existingFiles is always empty and skipGeneration never true. Writeback's /api/event
    #   and /api/table/insert answer; /api/files/upload and /api/versionium/commit do not. Kept as they are (a fix is its own phase).
    # - Idearium's sync (lib/emerge/idearium/client.js): its five routes (/api/idea/create, /api/vortex/log, …) are served by no system and
    #   it posts to :7820, Guardian's port. It has always failed silently. Not rebuilt: dropping it changes no answer anyone gets.
    # - Guardian's model: no new route. Its POST /api/copilot/prompt already answers Emerge's model contract ({ prompt } → { ok, text }),
    #   with RAID resolving the provider. Emerge's route model gained `extra` (fields the route's contract takes, e.g. provider, timeoutMs).
    # - lib/nexus-client.js urlOf(system, path): a route as a URL from the ports table (transport only; the host and model settings each
    #   caller names itself, since lib is not for what a system uses, his 2026-11-03 rule).
    # Proof: compiler-door 8/8; test-cortex-door 4/4; census 1122 → 1121.
    requires: ["Cortex's door (DO3a, built)", "Idearium reachable by its API", "Guardian's model route"]
    prerequisites: ["what lib/emerge's cortex-query (preflight 273 lines, writeback 410) and idearium/client do today, read and recorded as each route's expectation before it moves"]
    expects: "each route answers exactly what host.js's method returns today (preflight, writeback, sync, the model), so a build's answer does not change"
    does: >-
      The other side of EAS_D9: Cortex serves preflight and writeback on its door, Idearium serves sync, Guardian serves the model, each as a
      route Emerge's routeHost and model route call. The logic in lib/emerge/cortex-query moves to the system it queries (Cortex), lib's
      copy archived once nothing requires it.
    proof: "a build through Emerge with the Nexus host by route gives the same answer as lib/emerge's compile with Cortex (the compare MOD-EAS-CALLERS asks for)"
  EAS4f_the_callers_switch:
    status: "BUILT 0.60.414 — all four callers through Emerge's door; nothing requires lib/emerge at run time"
    # ── EXPANDED 2026-11-05 (0.60.414) — the last three callers (James, the same day: "Let's fix the emerge issue") ──
    # Compared first (its prerequisite), Cortex down in both: lib/emerge's pipeline vs Emerge's build on SPEC_COMPILER.spec — the same 50 files,
    # one line apart (the compiler's version stamp, named in EAS4b); idearium/compiler-bridge before vs after on one Idearium spec — t0 9,
    # t1 0, 3 entries on disk both ways, Cortex unreachable said both ways (the wording differs).
    # - idearium/compiler-bridge.js → POST /compiler/compile (its own engine, compiler/index.js), Cortex's host routes unless skipCortex; the
    #   door's compile takes host and skipWriteback (CD-09).
    # - copilot/module-builder.js → POST /compiler/build with Cortex's host routes; files written into its build folder (EM-003 rewritten for
    #   the door, the old wording kept in the test).
    # - lib/build-pipeline.js → POST /compiler/run with Cortex's host and Guardian's ask route; a dry run through it: 11 T2 nodes, 0 failed,
    #   every frame emitted (build.started, stage, node, complete). Named: node progress arrives after the run, from Emerge's list.
    # Proof: compiler-door 9/9; test-emerge-direct-compile 8/9 (EM-005 fails on main too: a September archive file missing); census 1121, none added.
    # ── EXPANDED 2026-11-05 (0.60.412) — guardian/server.js POST /build runs in Emerge (POST /compiler/run), the host by Cortex's routes, the
    # model by Guardian's own ask route, provider as asked. Named differences: an unconnected provider fails fast with its reason where the
    # SEAM queue (/command, 'seam') waited for it; progress (guardian.build.progress) is emitted after the run from its list, not live.
    depends_on: [EAS4e_the_callback_routes]
    spec: docs/emerge-system.spec
    blocks: [MOD-EAS-CALLERS]
    files: [idearium/compiler-bridge.js, copilot/module-builder.js, guardian/server.js, lib/build-pipeline.js, emerge/emerge/lib/compiler.js, emerge/emerge/tests/compiler-door.test.js, tests/modules/test-emerge-direct-compile.js]
    requires: ["Emerge's door up", "the callback routes (EAS4e)"]
    prerequisites: ["each caller's answer before and after compared on one real spec, the difference named or none"]
    does: "the four remaining callers call Emerge's door: idearium/compiler-bridge (compile, with Cortex around it by route), copilot/module-builder (build), guardian/server and lib/build-pipeline (run)"
    proof: "each caller's suite unchanged; the before/after compare clean"
  EAS4g_lib_emerge_archived:
    status: OPEN
    depends_on: [EAS4f_the_callers_switch]
    spec: docs/emerge-system.spec
    blocks: [MOD-EAS-CALLERS]
    files: [lib/emerge, _archive/lib/emerge, tests/modules/test-substrate-spec.test.js]
    requires: ["nothing requires lib/emerge (grep and the census)"]
    prerequisites: ["phase-specs.js and kg-builder.js run from emerge/ (EAS_D7)"]
    does: "lib/emerge moved to _archive/lib/emerge with its reason (§0.3); every reference points at emerge/"
    proof: "nothing requires lib/emerge; the module suite unchanged"
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
