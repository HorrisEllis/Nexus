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
    status: DONE 0.60.239 — lib/spec-compiler-port.js; the four callers through it; test-spec-compiler-port 4/4; a real boot compiled through the route
    depends_on: [EW_D1_compiler_and_ide_with_idearium, EW1_emerge_and_warp_one_system]
    files: [lib/build-pipeline.js, lib/spec-collect.js, guardian/server.js, copilot/module-builder.js, lib/spec-compiler-port.js (new), idearium/api/index.js, idearium/cli/route-commands.js, tests/modules/test-spec-compiler-port.test.js (new)]
    spec: docs/2026-10-17-system-drawbridge-phasemap.spec
    does: >-
      Four callers of the compiler live outside Idearium (lib/build-pipeline.js and guardian/server.js use t2-gate; lib/spec-collect.js
      compile; copilot/module-builder.js pipeline). Moved as they are, each becomes a NEW CROSSING into Idearium (two of them upward from the
      kernel). Each is designed out first (CLAUDE.md, a graph before every phase): a lib file used only by Idearium moves with it (DB17);
      every other caller goes through an Idearium route.
    proof: "the phase graph of EW3 shows no new crossing"

  EW3_the_spec_compiler_into_idearium:
    layer: backend
    status: DONE 0.60.239 — moved whole to idearium/spec-compiler; no crossing into it; emerge has 0 ways in
    depends_on: [EW2_the_callers_outside_idearium]
    files: [idearium/spec-compiler/compiler/index.js, idearium/spec-compiler/compiler/pipeline.js, idearium/spec-compiler/compiler/kg-builder.js, idearium/spec-compiler/compiler/invariants-engine.js, idearium/spec-compiler/compiler/t2-gate.js, idearium/spec-compiler/compiler/phase-specs.js, idearium/spec-compiler/idearium/client.js, idearium/compiler-bridge.js, tests/modules/test-phase-specs.test.js, tests/modules/test-substrate-spec.test.js]   # 0.60.239: named at their new paths (they were emerge/compiler/…, emerge/idearium/client.js)
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

## ADDENDUM 2026-10-24 — EW2 and EW3 land together; the design, decided by his axioms
Found while grounding EW2: the spec compiler is its own package inside emerge. emerge/package.json is "spec-compiler", with main
compiler/pipeline.js. Its parts are compiler/, chunk/, cortex-query/, idearium/client.js, version.js, SPEC_COMPILER.spec, verify.js and
test/, and nothing outside the compiler uses them (the census, 2026-10-24). It also requires emerge/siso, the CommonJS bus that every module
emerge-codegen-v2 compiles requires.
- **The package moves whole**, by git mv, to idearium/spec-compiler/, keeping its internal layout so its own relative requires do not change.
  Paths into lib/ get one level deeper.
- **emerge/siso joins LANGUAGE.** It is the language's bus primitive: pure, with no state or process (§5.9). The compiler's use of it is the
  language, not a crossing.
- **Callers outside Idearium** go through lib/spec-compiler-port.js (the kernel). The port has no require of Idearium (§5.2: one door; DB6):
  - in the Idearium process, Idearium provides the compiler at boot (provide()), so the port calls it directly;
  - in any other process (cortex's RAID through lib/execution-pipeline, guardian /build, copilot's module builder), the port posts to
    Idearium's routes: POST /api/compiler/compile | /pipeline | /t2. Each route has a command row, so agents have it too.
  - Without either, it says so; it never falls back silently (§1.2).
- They land in one phase because doing EW2 first would add a new crossing: idearium/api requiring emerge/compiler to provide it.

## ADDENDUM 2026-10-24 (0.60.239) — EW2 and EW3 built
- **Moved by git mv** (history kept): emerge/{compiler, chunk, cortex-query, idearium/client.js, version.js, SPEC_COMPILER.spec, verify.js, test,
  seams, package.json} → idearium/spec-compiler/. emerge has a new package.json of its own (commonjs). Inside the package, requires into
  lib/ are one level deeper and '../siso' is '../../../emerge/siso' (the language).
- **The port.** lib/spec-compiler-port.js. Idearium provides the compiler at boot; the routes are POST /api/compiler/{compile,pipeline,t2}
  (WRITE_IDEAS; specPath and outputDir held to the tree or the temp folder); the command row is compiler.run. The callers moved onto it:
  lib/build-pipeline, lib/spec-collect, guardian /build, copilot's module builder.
- **Proof.**
  - Run: the port in a separate process reached a booted Idearium (sandboxed, port 4891) through the route, and Idearium compiled
    SPEC_COMPILER.spec into 26 files (21 T0, 15 T1). /etc/passwd was refused.
  - Census: emerge 4 out / 0 in; copilot 27 → 26, guardian 28 → 27, idearium 33 → 32; no new crossing.
  - Ratchet baseline: 540 → 481 lines. 59 lines no longer in the tree, most closed earlier and never taken out, are recorded in its closed
    list.
- **Not done here.** EW4: the IDE (emerge/emerge-ide.js) still requires emerge's kernel and codegen; moving it makes those two Idearium's
  only remaining uses of emerge besides the language. Its 4 ways out are emerge/core → intelligence/rfr2 (3) and the IDE → ollama (1).
- **Found while grounding** (lib/system-check.js 2026-09-07): James then called emerge "its just a compiler thats it, the rest is trash".
  On 2026-10-24 he read it again, said "Look at emerge. Deeply Custom", and kept the language. The earlier words are kept with the code
  (§0.3); the later decision supersedes them.

# ── ADDENDUM 2026-10-30 — Emerge is the Emerge repo; the compound build (his); the IDE Emerge already built, in Idearium's work area ──
# James, 2026-10-30, after github.com/HorrisEllis/Emerge was read into the session: "and that is emerge." Then, asked whether Nexus uses
# Emerge at a pinned version and archives lib/emerge/: "yes, spec compiler. and chunking can be automatic. each line can be fed back in to the
# previous gate, and the next line can be built by another agent. making it compount, barely any context, what about integrating the
# worksurface/workarea? from idearium, the diffs? like a fully built ide that emerge has built already."
# Read 2026-10-30: the Emerge repo is the newer, whole language (lang/: lexer, parser, checker, interpreter, ledger, native compiler;
# build-spec.js; llm/; observe/). Nexus's lib/emerge/ is an older copy: 21 files differ, 22 exist only in Emerge. Emerge's rule (BUILDING.md):
# "Emerge depends on nothing above it ... A project's integrations live in that project's own repo."
#
# EW_D2 (his): Nexus uses Emerge, the spec compiler included, at a pinned version; lib/emerge/ and the compiler EW3 moved into Idearium are
#   superseded by it and archived when the switch is built (§0.3). READING TO CONFIRM: "yes, spec compiler" answers that question, and the
#   spec compiler Nexus builds with is Emerge's.
# EW_D3 (his): the compound build. Chunking is automatic; each unit, once written, is fed back to the gate before it, and the next unit is
#   written by another agent; each agent holds barely any context, and what is accepted compounds.
#   Stands on: Emerge's chunk format (chunk/index.js: one node, ~400-800 tokens), its T2 gate (compiler/t2-gate.js: a model fills one node,
#   the checker must pass it, a failure kept as .t2-rejected), his gate walker (lib/gate-walker.js: one step per gate, the packet by
#   reference, each gate its own agent), CIE-EG's gate (typed gaps with pressure) and RULE D (growing retry, escalation).
#   The coder's shaping, TO CONFIRM: the unit is one statement Emerge's checker accepts in place (a declaration, a handler, an emit, a
#   constraint), not a raw text line, because half a line cannot be checked; a body too tangled to split stays one unit with line-level
#   repair. An accepted statement is hashed and reused when the same slot comes up again (no model call), which is what makes it compound.
#   Measured before adopted (§17.11): Emerge's bench/ runs whole-node T2 against the statement-gated build on pass rate, tokens and time.
# EW4 re-read (his "a fully built ide that emerge has built already"): Emerge's IDE (lang/ide.js: diagnostics from the real checker,
#   autocomplete from the language, run and test with the interpreter, generators; emerge-ide.js: model-assisted on the SISO bus) is the
#   IDE. Idearium's work area hosts it by route, running in Emerge's own process (its COS compartment), not copied into Idearium; beside it,
#   Idearium's work surface (idearium/repo/work-surface.js: one card per file, + and - lines) shows the compound build live: each statement
#   as its gate accepts it, which agent wrote it, the checker's verdict, the rejected attempts. Supersedes EW4's "the IDE into Idearium"
#   (a move of the old copy); EW4 is kept as written (§0.3).
# Not built; specs next, in Emerge's repo for what is Emerge's (the compound build), in Idearium's for the work area.

# ── ADDENDUM 2026-10-30 (b) — crystal memory in Emerge: scan, pattern, graph, confidence, adversary, test, crystallize (his) ──────────
# James, 2026-10-30: "what about adding as much code as possible. like using the intelligence system to scan each ai response, each output.
# integrating a pattern memory into emerge. a graph for edges, nodes, functions, traversal, gaps, like the relationship between the words.
# then the confidence scoring, and the adversarial agent to verify it, then it crystalizes. thats how the crystal memory is meant to work.
# verify, test, crystalized."
# EW_D4 (his): every model output Emerge receives is scanned, learned from as patterns in a graph, scored, verified by an adversarial agent,
# tested, and only then crystallized; a crystal is reused. The order is his: verify, test, crystallize.
# What each stage stands on (read 2026-10-30, the coder's census):
#   scan each output   Emerge: every model answer is already a T2 result, accepted or kept as .t2-rejected (compiler/t2-gate.js); Emerge's
#                      observe/ reads its ledger (deltas, sigma, CFR field, liminal, gap hunt). Nexus: Intelligence observes agent replies.
#   pattern memory     Nexus: lib/pattern-leverage.js, intelligence/mastermind.js (recurring shapes), schema.bep_pattern, schema.pattern_sequence.
#   the graph          Emerge: compiler/kg-builder.js (nodes, edges, depth, BLACK gaps), observe/gaps.js. Nexus: intelligence/relational-field.js
#                      (RFR2: causes of friction), the lattice. "the relationship between the words": the CIE-EG text model keeps a symbol's
#                      identity and its interpretation apart (§2.5), so a word is a node and its uses are edges.
#   confidence         Nexus: lib/agent-confidence-gate.js (below 75%, get context first), cortex/core/raid/snr-filter.js; schema.crystal's
#                      success_probability.
#   adversarial agent  Nexus: intelligence/adversarial.js (two readings compared; a contradiction is a gap), lib/meta/adversary-suite.js
#                      (six attack classes: syntax, logic, edge case, state, cross-domain, stress).
#   test               Emerge: the checker and the interpreter's tests; the behaviour schemas (architecture-spec RULE A) at the hook (CIE-EG shape).
#   crystallize        Nexus: schema.crystal (pattern_signature, entry and exit conditions, success_probability, failure_boundaries,
#                      support_paths, usage_count), lib/warp's crystallizer (an exact digest served at zero cost). Emerge's axiom
#                      PROOF_REQUIRED_FOR_PROMOTION (lib/emerge/emerge.spec). CIE-EG has no crystal yet: it is new to Emerge.
# The coder's readings, TO CONFIRM:
#   - The crystal is what makes the compound build (EW_D3) compound: WARP reuses only an exact digest; a crystal is reused wherever its
#     pattern_signature and entry conditions match, with its success_probability, so a statement once proven is not asked for again.
#   - "adding as much code as possible": bring in as much of what Nexus already has as possible. CIE-EG §0 sets the terms: anything added to
#     Emerge's Node runtime is temporary and worth adding only if it can be written again in .eg; and Emerge depends on nothing above it. So
#     the Nexus pieces come in as modules of an Emerge spec (their design, their tests, their schemas), built by Emerge in .eg, not copied
#     as JavaScript. The crystal and pattern node shapes come in as Emerge registry records (CIE-EG §5).
# Specs next, in Emerge's repo (asked of him 2026-10-30, not yet answered). Not built.
