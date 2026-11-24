# docs/2026-10-17-pieces-not-order-phasemap.spec
# The point first, then pieces in any order, like a torrent. A piece is a stateless node with one purpose, its own subcontract
# and its own check; order lives in the graph, context lives in Nexus, the whole is checked when it is assembled.
# MAPPED 2026-10-17, nothing built (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec.
# Extends: docs/2026-10-15-gate-held-work-phasemap.spec (GW0 a brick is a chunk, GW2 the run follows the brick, GW24 the
# budgeted slice, GW26 everything declares what it needs); docs/2026-10-16-durable-work-timeline-phasemap.spec (TL2 resume);
# docs/2026-10-16-code-tab-rebuild-phasemap.spec addendum_c (procedures, 0.60.118).

origin:
  date: 2026-10-17
  james:
    - >-
      "What do you think about seperating chunks by purpose? Chunks become subcontracts, at every increment. That way we can
      have different procedures for different things. Like I want control over my projects when I choose to. Reducing
      intelligence needed for the agents by offloading as much context as possible, tools and reusable procedures and
      macros, like the spec workshop. Do you get what i mean? Like each chunk is a node that's stateless. They don't need to
      understand context or the order. Does that make sense?"
    - >-
      "The point is first. That's the point. It's not linear. Like a torrent downloads."
  context: >-
    The coder had answered the first message: chunks typed by purpose, each a pure node (inputs as pointers, an output shape,
    a check, a procedure), order in the graph and context in Nexus; and named where it breaks (cross-cutting changes need a
    parent with an integration check; a stateless piece with wrong inputs is confidently wrong; the intelligence moves to
    the cut). His second message answered with the model.
  his_decisions:
    - "Chunks are separated by purpose; each is a subcontract, at every increment."
    - "A chunk is a stateless node: it does not need to know the context or the order."
    - "The point comes first (the end state is defined before any piece), and the work is not linear: pieces fill in any order, like a torrent."
    - "Different procedures for different kinds of piece; control over his projects when he chooses."
  reading: >-
    The coder's reading, to confirm. A torrent works because the .torrent file comes first: it names every piece and how to
    check it before a byte is fetched; then any peer supplies any piece in any order, each is verified alone against its
    hash, a restart re-checks what is on disk and fetches only what is missing, and the file is whole when every piece
    checks. Here: the POINT is that manifest (the end state and its pieces, each with its purpose, the interface it
    provides, the interfaces it uses, its inputs and its check); the peers are the agents and the procedures; a piece's
    check is known up front even though its content is not (unlike a torrent hash), and the content hash is recorded when it
    passes. What makes any order possible is that a piece depends on the INTERFACES the manifest declares (names and
    signatures), not on another piece's code.

found:
  # §8.6, read 2026-10-17 from source: most of the machinery exists
  - "the point, partly: lib/phase-plan.js parsePlan — a plan names files, each with exports { name, signature, does }, imports, steps; conditions (the phase's proof). It is per file, not per purpose."
  - "pieces as gates: cortex/core/raid/contract-adapters.js fromPhasePlan — a brick per planned file, the plan's imports as depends_on, a parent 'phase' gate that passes only on its integration."
  - "any order already, partly: independent bricks run at once (routing.contract_concurrency) through the contract scheduler."
  - "verified alone + kept: contract-gates checkpoints { gate, at, hashes, agent, commit } per passed brick; openCheckpoint resumes passed bricks and re-runs STALE ones (inputs changed). Since 0.60.79 the plan persists on the contract, so a restart no longer re-cuts the pieces."
  - "the slice: lib/phase-plan.js contextNote (GW24) ranks a brick's context — definitions it needs first, then signatures — and cuts it to the agent's budget."
  - "procedures: lib/repo-procedures.js (0.60.118) — tool calls kept and replayed; not yet chosen by a piece's kind."
  - "the gap: a brick waits on the bricks whose FILES it imports (depends_on by file), so the order is still a chain; and a brick has no kind beyond its file extension (build:file.js)."

decisions:
  PC0a_what_a_piece_depends_on:
    asked: "may a piece be built before the pieces it uses exist?"
    coder_recommends: >-
      yes, against their declared interface (the manifest's signatures): its brief carries those signatures, never their code.
      A piece waits only when it needs a real value another piece produces (data, a generated file), and that edge is named
      in the manifest. To confirm.
    status: "DECIDED 2026-10-17 by his axioms (applied by the coder) — D8: yes, against declared interfaces (§5.10, §5.14, §3.1) — his answer was \"[No preference]\"; see docs/2026-10-17-decisions-by-the-axioms.spec"
  PC0b_first_kinds:
    asked: "which purposes are the first piece kinds?"
    coder_recommends: "spec_section, function, test, wire (registry/loom), doc. The spec workshop already cuts by section. To confirm."
    status: "DECIDED 2026-10-17 by his axioms (applied by the coder) — D9: spec_section, function, test, wire, doc (§16.4, §0.5) — his answer was \"[No preference]\"; see docs/2026-10-17-decisions-by-the-axioms.spec"
  PC0c_who_cuts:
    asked: "who writes the point (the manifest)?"
    coder_recommends: "Nexus without a model where the phase maps (phase-map-auto, derivePlan), a reasoning agent only where it cannot, and James when he chooses (his control). To confirm."
    status: OPEN

phases:
  PC1_the_point_first:
    status: OPEN
    systems: [core, cortex]
    files: [lib/phase-plan.js, cortex/core/raid/contract-adapters.js, lib/node-schemas/schema.contract]
    depends_on: [PC0b_first_kinds, PC0c_who_cuts]
    does: >-
      The manifest: a contract's end state and every piece, each { id, kind (purpose), provides (interface: names +
      signatures), uses (interfaces it calls, by name), inputs (pointers + hashes), check (by kind), procedure }. Written
      before any piece runs, kept on the .contract (it persists, 0.60.79). parsePlan's per-file plan becomes pieces by
      purpose: a file's functions, its tests and its wiring are separate pieces.
    proof: "a phase's manifest lists pieces of at least three kinds, each with a check, before any agent call"
  PC2_any_order:
    status: OPEN
    systems: [cortex, core]
    files: [cortex/core/raid/contract-adapters.js, cortex/core/raid/contract-gates.js, lib/phase-plan.js]
    depends_on: [PC1_the_point_first, PC0a_what_a_piece_depends_on]
    does: >-
      depends_on by interface, not by file: a piece is ready as soon as the interfaces it uses are DECLARED; its brief carries
      their signatures (GW24's contextNote, signatures only). Only a named data edge makes a piece wait. The scheduler picks
      ready pieces by value: the most-used interfaces first (the torrent's rarest-first, inverted: the pieces most others
      lean on), in parallel up to routing.contract_concurrency.
    proof: "a test piece and the function it tests are built in the reverse order and both pass; a chain of four imports runs as four parallel pieces"
  PC3_verified_alone_resumed_by_recheck:
    status: OPEN
    systems: [cortex, core]
    files: [cortex/core/raid/contract-gates.js, cortex/core/raid/contract-adapters.js]
    depends_on: [PC1_the_point_first]
    does: >-
      Each piece passes its own check (by kind: parses + exports its declared interface; a test runs; a wire resolves in
      loom; a spec section reads in the compiler) and its content hash is recorded on its checkpoint. At a restart or a
      Clear Glass close, Nexus re-checks the pieces on disk against their hashes (the torrent's recheck) and queues only what
      is missing or changed. This is TL2 for builds.
    proof: "kill a build after 3 of 7 pieces; on restart the 3 are re-checked, not rebuilt, and the 4 others run"
  PC4_a_procedure_per_kind:
    status: OPEN
    systems: [core, idearium]
    files: [lib/repo-procedures.js, lib/pipeline-routing.js, lib/step-gates/]
    depends_on: [PC1_the_point_first]
    does: >-
      A piece kind names its procedure: the deterministic steps first (template, compiler, wire from the registry), a model
      tier only for what is left (a local model for a function body against its signature), and its check. Kinds with no
      model step make no model call. Procedures are .procedure files he can edit.
    proof: "a 'wire' piece and a 'doc' piece complete with zero model calls; a 'function' piece goes to a local model with a brief under its budget"
  PC5_control_when_he_chooses:
    status: OPEN
    systems: [idearium]
    files: [lib/repo-inject.js, idearium/api/index.js, idearium/ui/js/code-dock.js]
    depends_on: [PC1_the_point_first]
    does: >-
      Per project and per piece kind: auto (lands when its check passes), review (a proposal for him), manual (he writes it;
      the check still runs). The manifest is editable before it runs. Shown in the dock's Tools panel and the Plan.
    proof: "with 'function: review' and 'doc: auto', a build lands the docs and leaves the functions as proposals"
  EMB1_emerge_writes_the_brick:
    status: "BUILT 0.60.421 — test-emerge-rung 6/6 (the retry tests fail when the failure is not carried); with a real model on his machine, unmeasured"
    origin: >-
      James, 2026-11-06: "emerge, we need to get it coding remember. thats why emerge is important, also the test env, using the test file
      for expectation, the primitive also, then emerge can also verify itself with the compiler." · told most of the loop already exists in
      Idearium (test first TF2, the expectation test TF1, the shadow test env, the failure carried into the retry, verify-first), and asked
      whether Emerge is every brick's language or a rung tried first that falls back to JavaScript (the coder's recommendation): "yes
      basically nexus holds as much complexity as possible, agent tools, context per gate, component registry as the spine so components can
      be dumb. also the retry engine for emerge." Read as the rung first (his "yes" to the recommendation), to confirm.
    depends_on: [VF1_verify_first, EAS2_the_language_through_the_door, CS0_projects_decomposed_into_components]
    files: [idearium/lib/emerge-rung.cjs, idearium/api/index.js, lib/pipeline-routing.js, idearium/ui/settings.html, idearium/cli/route-commands.js, tests/modules/test-emerge-rung.test.js, tests/modules/run-all.js]
    file_roles: "route: idearium/api/index.js; config: lib/pipeline-routing.js (routing.emerge_first); ui: settings.html; command: route-commands.js (system routing emerge_first)"
    does: >-
      Before the agent ladder writes a planned JS file in JavaScript, the Emerge rung tries it in Emerge: the brick's brief (its planned
      exports, its expectation test, the gate's context — Nexus holds the complexity) asks the first rung's agent for Emerge; Emerge's own
      compiler checks it through Emerge's door (node emerge/emerge/cli.js lang-check: line, column and why); a compile error goes into the next
      try word for word (the retry engine for Emerge, bounded); a clean one is built to JavaScript (lang-build --standalone) and the planned
      file becomes a three-line adapter over it (Emerge's runtime, plain exports); the brick's own expectation test (TF1) judges it in the
      shadow, and its failure goes into the next try too. Passing: the .eg source, the built module, the runtime and the adapter land as
      proposals, and the brick is stored as a verified primitive (component-store markTested). Not passing after its tries: said on the run,
      and the JavaScript ladder builds it as before (nothing that works today breaks). routing.emerge_first: prefer (default) | off.
    proof: "test-emerge-rung: a compile error carried into the next try and fixed; a test failure carried; a passing brick's adapter required by its expectation test; off and fallback leave the ladder unchanged; Emerge reached only through its command line"

  EMB2_ollama_writes_emerge_for_the_pipeline:
    status: OPEN
    depends_on: [EMB1_emerge_writes_the_brick]
    james: '"like the pipeline can build all of this if we get ollama working with emerge and the pipeline" (2026-11-13) · "we have ollama now. lets leverage that. test, benchmark"'
    files: [idearium/lib/emerge-rung.cjs, idearium/api/index.js, emerge/emerge/lang/cie/self.eg, emerge/bench/bench.js, emerge/bench/chunks.js, tests/modules/test-emerge-rung.test.js]
    does: >-
      So the pipeline, on his Ollama, builds the phases that are now written in Emerge. Found 2026-11-13: (1) the Emerge rung (EMB1) fires only
      for a NEW planned .js file; the phases plan .eg files directly now (cos/census/graph.eg, cos/pipeline/contract.eg), and a planned .eg file
      goes to the plain ladder: written by an agent as text, never checked by Emerge's compiler or run by its own .test.eg. (2) The card that
      teaches a model Emerge (CARD in emerge-rung.cjs) predates use, on/wire, and the file, folder and process primitives, and says "No
      imports": a model cannot write today's .eg from it. (3) Emerge's benchmark asks Ollama already (bench.js llm, chunks.js llm) and no real
      model has run it. Slices:
        a. measure first: Emerge's two benchmarks on his installed Ollama models, reported per model (which can write Emerge, at what chunk
           size); his run (the sandbox cannot reach Ollama). The numbers decide the rung's first model and chunking.
        b. the card generated from Emerge's own map of itself (self.eg observe: every primitive, its arity), so it cannot fall behind the
           language again; the syntax lines kept, "No imports" replaced by `use`.
        c. the rung for a planned .eg file: written in Emerge, checked by its compiler (lang-check), retried with what failed, its planned
           .test.eg run (eg test); only the .eg lands (no JS adapter).
        d. the remaining CS11 groups (B-F) and PC12 slices (b-d) filed as pipeline requests, one per slice, built by the pipeline.
    proof: "a: a table per model from the real runs; b: the card names every primitive self.eg finds; c: a fixture phase planning one .eg with a .test.eg is built by a stand-in model through the rung (a wrong try's compiler error goes into the next try) and lands only the .eg; d: a slice built by the pipeline"
    axioms: "§17.13 (a missing capability is built into Emerge: the card from Emerge's own map), §8.6 (the rung, the benchmark and self.eg exist), his order (the pipeline builds the rest)"
  EMB3_the_autocorrect:
    status: OPEN
    depends_on: [EMB1_emerge_writes_the_brick]   # the rung it is built through (BUILT); corrected 2026-11-20 from EMB2, which is open and which the module does not need
    james: '"like autocorrect" (2026-11-20) · "do it. prove it" (2026-11-20, the first real phase built by the local-model ladder through the ▶ build)'
    files: [idearium/lib/autocorrect.js, idearium/lib/test/autocorrect.test.js]
    does: >-
      A pure module: autocorrect(body: string) -> { body: string, fixes: list } rewrites, in a body a small model wrote, the JavaScript habits Emerge's
      compiler refuses and that have exactly one known fix: "!x" becomes "not x" (but "!=" stays), "&&" becomes "and", "||" becomes "or", "===" becomes
      "==", "!==" becomes "!=", and a semicolon at the end of a line is removed. Text inside double quotes is left as it is. fixes names each rewrite
      made, once per kind, in the order met. A body with none of them comes back unchanged with fixes empty. Built by the pipeline: the ▶ build,
      the planner on Ollama, the Emerge rung's ladder (3b, DeepSeek 16b, 30b), nothing outside his PC.
    proof: "its test, planned first: each rewrite, a string left alone, != left alone, an unchanged body with no fixes; built by the ▶ build with every file written by an Ollama model"
    # 0.60.624 — the exact behaviour, so the test is written from it with no model (his "deterministic first"; the 2026-11-20 runs: each model
    # invented its own fixes format and DeepSeek's test contradicted itself). fixes are the kinds, each once, in the order met: "!", "&&", "||",
    # "===", "!==", ";".
    examples:
      - 'autocorrect("let x = 1") == { body: "let x = 1", fixes: [] }'
      - 'autocorrect("if !x { y }") == { body: "if not x { y }", fixes: ["!"] }'
      - 'autocorrect("a != b") == { body: "a != b", fixes: [] }'
      - 'autocorrect("a && b") == { body: "a and b", fixes: ["&&"] }'
      - 'autocorrect("a || b") == { body: "a or b", fixes: ["||"] }'
      - 'autocorrect("a === b") == { body: "a == b", fixes: ["==="] }'
      - 'autocorrect("a !== b") == { body: "a != b", fixes: ["!=="] }'
      - 'autocorrect("let x = 1;") == { body: "let x = 1", fixes: [";"] }'
      - 'autocorrect("a && !b;") == { body: "a and not b", fixes: ["&&", "!", ";"] }'
      - 'autocorrect("say \"a && b\"") == { body: "say \"a && b\"", fixes: [] }'
    axioms: "§17.13 (in Emerge, through the rung), deterministic first (his 2026-10-13 order: a parser before any model), §8.6 (the HINTS table in gaps.eg names these refusals)"
  PC6_assembled_and_checked_whole:
    status: OPEN
    systems: [cortex]
    files: [cortex/core/raid/contract-gates.js]
    depends_on: [PC2_any_order, PC3_verified_alone_resumed_by_recheck]
    does: >-
      The parent passes only on its integration check (it already does: the phase gate). A failure there names the pieces
      whose interfaces disagree, and only those re-run: the cross-cutting cases the pieces cannot see alone.
    proof: "a piece that changes a declared signature fails integration and names the pieces that use it"

build_order: [PC1, PC3, PC2, PC4, PC6, PC5]
first_slice: "PC1 + PC3: the manifest first, and pieces verified alone and re-checked at a restart (the persistence he asked for, for builds)."

failure_modes:
  - "Interfaces declared wrong up front: every piece passes alone and the whole fails. PC6 names the disagreeing pieces; the manifest is revised, not the pieces patched one by one."
  - "Too fine a cut: many pieces, each cheap, the total costlier than one request. The manifest says its piece count and estimated calls before it runs; he can merge pieces."
  - "A piece kind with a weak check (a doc) passes anything. Checks by kind are listed in the catalogue (cos/spec/check-catalogue.spec) and a kind without one is review by default."

related:
  looking_glass: >-
    docs/looking-glass/ (his spec, uploaded 2026-10-17, v0.3, kept verbatim): the same principles on the UI side — UI as typed
    data, layers as a runtime operation, isolation through an event bus with per-layer contracts, element + target + action.
    His layered editor ask (2026-10-17: editor > foreground > background UI > plumbing) is Looking Glass's convention stack
    (meta > interaction > app content > runtime > renderer > plumbing). Not mapped into Nexus here; see the coder's note in
    the chat of 2026-10-17 and docs/2026-10-10-design-surface-phasemap.spec DS1/DS2/DS8.

# ## ADDENDUM 2026-10-17 (a) — tests first, structure first, nothing wasted (TF1-TF4)
# James: "This is meant to be nonlinear. Using synthesis. Learning, compressing, creating higher leverage especially from gaps.
# Need to get the chunking working. Intent mapping. It's working significantly better but the code it's outputting is terrible,
# and it needs to learn. Nothing is wasted from failure or fault. Tests need to be first. Maybe prioritize nodes or chunks that
# improve the expectations each file. Like focus on structure and architecture, bottom up."
# His decisions, recorded as his: tests come first; every failure is kept and learned from; the pieces that improve a file's
# expectations come first, structure and architecture bottom up; chunking and intent mapping are the work now.
# Found (read 2026-10-17): a brick's only check is lib/phase-plan.js checkChunk, a regex for the planned export NAMES. A file
# that does not load, requires what does not exist, or exports a non-function under a function's name passes it. Tests-first
# is mapped as docs/2026-10-16-proposal-evidence-phasemap.spec PE6, not built. lib/proposal-evidence.js already runs a test in a
# shadow copy of a tree with any files overlaid (shadow(root, overlays)), so a brick can be tested before anything is written.
# Lessons are per phase only (docs/2026-10-16-reject-learn-retry-phasemap.spec open item).
#   TF1_the_expectation_first (BUILT 0.60.119; held on the branch while he questioned the direction, released with RA1): from the held plan, before any code, Nexus writes each JS file's expectation test
#     without a model: the module loads, every planned export exists, a planned function is a function and takes no more
#     arguments than its signature. The brick passes only when that test passes in a shadow of the repo with the phase's files
#     so far overlaid; its failing lines go back with the retry. An existing file's expectation is run before the build (seen
#     failing first, or said to pass already). The text lives on the contract's evidence; nothing is written to the repo.
#   TF2_behaviour_tests_by_another_hat (OPEN, = PE6): a different hat than the builder writes behaviour tests from each export's
#     signature and does:, seen failing first; the builder gets them with its brief.
#   TF3_lessons_across_phases (OPEN): every expectation failure is a fault keyed by layer and kind (not only by phase), so the
#     next brick of that kind in any phase starts with what failed before (lib/phase-faults.js precedent widened).
#   TF4_structure_first (OPEN, with PC2): pieces that fix expectations come first (schemas, signatures, the registry wiring, the
#     expectation and behaviour tests), then the implementations, bottom up by layer.
# ## ADDENDUM 2026-10-17 (b) — his pushback, recorded
# James: "Don't just agree. I have no competence in coding. I'm just following my intuition"
# The coder's answer, kept here so the next session sees it: his instincts match known practice (tests first = TDD; pieces checked
# alone and resumed = Bazel/Nix-style builds; pure steps = SISO), but (1) a stateless piece still needs context, moved into the
# brief, not removed; (2) any order moves the hard part to designing interfaces up front; (3) expectation tests catch shallow
# faults only, not bad code; (4) the cause of "terrible code" is not known: no bad output has been read. Next step agreed as the
# coder's proposal, his to confirm: read 3-5 real bad outputs from his machine, classify why each is bad, pick one fix, measure
# retry success; no new maps until something works end to end. TF1 stays on the branch, unreleased, until then.
# ## ADDENDUM 2026-10-17 (c) — his decision after his mentor's review: stateless dropped; Nexus holds the complexity
# James: "I talked to my mentor. He told me the good, bad and ugly. Too personal, too big. But very impressive that it runs at
# 400000 lines. And the ideas are solid. Stateless was an idea but I don't understand it, lignore it. Need nexus to hold as
# much of the complexity as possible, and let the right agent for the job, be in charge."
# His decisions, recorded as his: (1) "stateless" is dropped as a goal (this map's stateless framing is superseded; the pieces,
# their checks and the restart re-check stay as mapped, they do not depend on it); (2) Nexus holds as much of the complexity
# as possible (the gate keeps the context, the plan, the checks, the history: GW1/GW2/GW24, the run state, the contract);
# (3) the right agent for the job is in charge of the job (routing: RAID chooses, docs/2026-10-09-one-model-engine-phasemap.spec
# ME5, one chooser). His mentor's review, as he reported it: too personal, too big; impressive that it runs at ~400,000 lines
# (the Code tab's index counted 400,954 lines in his screenshot of 2026-10-16); the ideas are solid.
# ## ADDENDUM 2026-10-17 (d) — the next phase: RA1, the right agent for each kind of brick (his rule from (c), first slice)
# James: "Using the crystallization memory? Let's just continue where we were, integrate anything new into the work we were
# doing and start the next phase"
# Where we were: TF1 (a brick passes only when its expectation test passes; the retry carries the failing lines), on the branch.
# What is new: his rule "let the right agent for the job, be in charge" (c). The coder's answer on crystallization memory, said
# plainly: Nexus has two. WARP's crystallizer keeps verified outputs by digest; builds run it in gate mode (kept, never served
# back, since a build's work is the files it writes, 0.60.73), so it cannot pick an agent. Intelligence's pattern
# crystallisation finds patterns in events; nothing reads it for routing. The record that can pick an agent is the run log
# itself (idearium_phase_runs: who built which file and how it ended), already read by lib/agent-record.js. One record, no
# second store (§7.6). To confirm whether he meant one of the two crystal stores specifically.
# Found: the ladder is ordered once per phase by request SIZE (lib/agent-record.js orderLadder: small/medium/large); every
# brick of a contract then climbs the same order, whatever the file. A test file and an engine file get the same agent first.
# The contract's own persisted feedback (contract-gates: `<brick>.feedback`, written when a brick fails) never reached
# Idearium's dispatch, so TF1's retry carry was in memory only.
#   RA1_the_right_agent_per_kind (BUILT 0.60.119): each attempt row carries its brick's kind (code.js, test.js, code.mjs ...); the
#     agent record scores every agent per kind (landed, proven, undone, and now a failed expectation test count against it);
#     each brick's ladder is ordered by that kind's record when there is enough of it (else by size, else as configured),
#     and the order and its reason go on the brick's evidence. A person's pick is never reordered. The contract's persisted
#     feedback seeds the retry carry, so the failing lines survive a restart.
#   Next after RA1, unchanged from the coder's list: his bad outputs read and classified; ME5 (one chooser) for the rest of
#     Nexus's routing.
#
# ADDENDUM 2026-10-17 (b) — his answers on PC0a–PC0c, and the deps gate (DG1, 0.60.125)
# The context: PC1_the_point_first had been built anyway, by ▶ build on his PC (0.60.122). The run reached attempt 12
# across five agents and ended contract-incomplete. Gemini left lib/phase-manifest.js, which requires a module that is
# not there (./schema.contract), and a spec/phase-manifest.spec. He pasted that proposal. The coder recommended rejecting
# both. The coder named the cause: PC1 depends on PC0a, PC0b and PC0c, which are still OPEN, and ▶ build did not check
# depends_on. Four questions were asked; his answers, verbatim:
# - PC0a (may a piece be built before the pieces it uses exist?): "[No preference]". It stays OPEN.
# - PC0b (which purposes are the first piece kinds?): "[No preference]". It stays OPEN.
# - PC0c (who writes the point, the manifest?): "thats what the agent proposed. do not impliment. thats on me".
#   - Coder's reading, to confirm: the manifest, and the PC1 proposal Gemini made, are his to write and to decide. The
#     coder does not implement PC1 or the manifest, and does not apply or reject that proposal for him.
#   - PC0c stays OPEN until he says otherwise.
# - Should a phase build be refused while its depends_on are still open (an open decision or an unfinished phase)?
#   - His answer: "Refuse, say why (Recommended)". The recommendation was the coder's; the choice is his.
#   - Built as DG1:
#     - lib/phase-deps-gate.js is the gate;
#     - idearium _phaseBuild refuses with 409 DEPS_OPEN, naming each open decision by its question;
#     - anyway: true is the override, and it is recorded on the run as depsOverride;
#     - `repo phase <repo> <phase> build --anyway` gives agents the same override;
#     - plan-panel.js phaseBuildPost is the one door every ▶ build uses; it shows what waits and asks before building
#       anyway.
#   - With this, PC1 is refused until PC0b and PC0c are decided.
#
# ## ADDENDUM 2026-10-17 (e) — every chunk a contract, shown; nothing fulfilled until approved (PC7, PC8)
# James: "with the progress screen, i want each chunk shown as a empty dependancy, then red for rejected and green for approved,
# red needs to be rerun, route to another model, or agent, until it can get approved. each chunk is also a contract, nothing is
# fullfilled until its approved."
# His decisions, recorded as his: each chunk is a contract; the progress screen shows every chunk from the start (empty, a
# dependency not built yet), red when rejected, green when approved; a red chunk is rerun on another model or agent until it is
# approved; nothing is fulfilled until it is approved.
# Found (read 2026-10-17): a phase's contract already has a brick per chunk with its dependencies, and GT1 already skips an agent
# that failed a brick (`<brick>.exclude`). Three gaps: (1) in review mode a contract went 'contract-complete' while its proposals
# still waited for him (his screenshot of 2026-10-16: a placeholder marked contract-complete); (2) a rejection retried the phase,
# but since 0.60.79 keeps the saved plan the rejected brick's PASSED checkpoint was kept, so it would NOT have been rebuilt (the
# coder's own regression, found here, not seen live); (3) the progress card shows phases, not chunks.
#   PC7_rejected_is_rerun_elsewhere (OPEN — mapped, not built yet): a rejection re-opens exactly the rejected file's brick on the contract
#     (READY, a fresh budget, the old attempts kept in its history), with his reason and the failure modes as its feedback, and
#     the agent that built it excluded, so the retry builds that brick again on another agent. Passed bricks stay passed.
#   PC8_every_chunk_shown_fulfilled_only_when_approved (OPEN — mapped, not built yet): GET .../phases/contract returns each brick's approval:
#     empty (not built yet, waiting on its dependencies), building, built (waiting for him), approved, rejected, failed; the
#     contract is fulfilled only when every brick is approved (review mode: its proposal applied; auto mode: its checks passed
#     and it landed). The Plan's Progress card draws the current phase's chunks as cells in that colour.
# Note 2026-10-17, read after merging main: 0.60.123 PP1–PP4 (another session) already draws the Plan's bar as its pieces, one per
# chunk and dependency. PC8 is therefore an extension of PP1 (the approval colours, and "fulfilled only when approved"), not a second
# card. Before PC8 is built, read PP1's code and extend it (rule 2, reuse before build). The version is open; 0.60.123 is taken.
#
# ADDENDUM 2026-10-17 (c2) — TF2: the test is written first, and it shapes the expectations and the conditions
# James (2026-10-17), after PC1's twelve-attempt run and the depends_on gate: "needs to build a test first then use that to
# shape expectation and conditions."
# His direction, as his: a phase build writes its test before any code, and that test becomes what the code is held to: the
# expectations (what each file must provide) and the conditions (what proves the phase). It confirms TF2 (OPEN since addendum
# a) and docs/2026-10-16-proposal-evidence-phasemap.spec PE6 (MAPPED), and narrows them to one slice built now.
# Stands on, by the axioms (§8.6 reuse):
#   - lib/expectation-tests.js (TF1): the structural checks, and the way it runs a test in a shadow of the repo;
#   - lib/proposal-evidence.js shadow + runOne: run a test with any files overlaid, nothing written to the repo;
#   - the plan's conditions (kind tests): the proof run already proves against the proposed code with the proposals overlaid;
#   - repo-inject propose: the test lands as a proposal like any agent's file, so he sees it, and the proof uses it.
# Phases (decided by his axioms where his words leave the how open; what comes to him is a problem):
#   TF2a_test_first (lib/test-first.js, pure + run):
#     brief: the test writer gets the phase (does, proof), the plan's files with their exports and signatures, and the rules:
#       one runnable node file, node:assert only, require each planned module by its path, call the planned exports
#       as their signatures say, assert the phase's proof, no network, no services.
#     validate: the test is run in a shadow with NO implementation (only the test overlaid). It must fail for the missing
#       behaviour (the planned module not found, a planned export missing or not a function, an assertion), never for
#       itself (a syntax error, a name it never defined, a module neither planned nor present). A test that already passes
#       proves nothing for new behaviour: refused. Invalid → the writer is asked once more with what was wrong.
#     shape: what the test requires and calls becomes the expectation. A name it calls on a planned module that the plan
#       does not export is added to that file's exports (the test is the authority). The test's run becomes the FIRST
#       condition ("<test> passes"). Each code brick's brief carries the test text.
#   TF2b_wired: idearium _phaseBuild, after the plan holds and before the contract: test written by the planner (the agent
#     that plans, never the coder that implements: independence, PE6), validated, proposed (repo-inject), plan shaped,
#     then the contract runs on the shaped plan. No planner ready → skipped, said, and TF1's expectations still hold.
#     Every step is a run row (state test-first: written, invalid, refused, shaped), so the Plan's run log shows it.
#   Limits, said: the test is as good as its writer (PE6 rule: the writer never declares its own test sufficient; the person
#   sees it as a proposal); one test file per phase in this slice; the phase passes only when that test passes in the proof.
#
# ## ADDENDUM 2026-10-18 (f) — a dependency graph before every phase (DG2, 0.60.147)
# James, 2026-10-18: "each phase, has to have a dependany graph before executing."
# His rule, recorded as his. Context: the night before, IM1 had run ten attempts on four agents without one. The coder had also
# shipped FR6 without one, and the boundary ratchet caught the crossing it added. DG1 (0.60.125) checked only that a phase's
# depends_on were closed. Nothing required the phase to have a graph: idearium's build used the mapping as context when there
# was one, and "the request is sent as before" when there was none.
# Built as DG2:
#   - lib/phase-graph.js graphFor() assembles the graph from what exists:
#       - MP1's mapping: changes, uses, used-by and specs, plus phases inferred through shared files;
#       - DG1's depends_on;
#       - the boundary census: the system of each file by its own rule (boundarySystemOf); crossings marked as already in the
#         baseline, or new.
#   - idearium _phaseBuild refuses a phase with no graph: 409 NO_GRAPH, with the remedy.
#       - `anyway` does not pass it. That is the coder's reading of "has to have". To confirm.
#   - The graph is written before the build, to <idearium data>/phase-graphs/<repo>/<phase>-<hash>.json. Its hash and file go
#     on every row of the run.
#   - GET /api/repos/:uuid/phases/graph; `repo phase-graph <repo> <phase>`.
#   - The Phases tab's detail pane shows the graph (idearium/ui/js/phase-graph-view.js, css/phase-graph-view.css).
#   - plan-panel phaseBuildPost holds NO_GRAPH with its remedy and never offers "anyway" for it.
# The coder's own rule: docs/CLAUDE.md "A dependency graph before every phase".
# Proof: test-phase-graph 5/5 (PG-03 through the real router; PG-05 in Clear Glass). DG1's own suite stays 3/3. Every suite that
# builds a phase shows the same result as on 0.60.142.

# ── ADDENDUM 2026-11-19 (0.60.607) — EMB1 expanded: skeleton first, one body per gap (built) ──
# James, 2026-11-19: "yes we could have the skeleton gaps, it needs to fill. using the dependancy graph." · "everything, should be as deterministic
# as possible, and the llm only when strictly necessary. primitive per primitive, word by word, component by component, all increment." · "focus
# on emerge and the pipleline ... look at cie-eg, and the gates per primitive" · "get it working, built, expanded, dont forget pillar".
# Built: when every export has a signature, Nexus writes the module's skeleton (each fn, its parameters, a body to fill); the agent fills one
# body at a time in the order the plan's own words give (idearium/lib/gaps.eg: needs, order), each gated by Emerge's compiler through its
# command line (lang-check) with the refusal fed back; each gap is a pillar:gap (gaps.eg as_gap: missingVariable, affectedConstraint). The
# filled module is built and judged by its expectation as before; a gap that will not fill, or a failed expectation, falls back to the
# whole-module loop with what failed. gaps.eg is built standalone by Emerge (eg-build/gaps/, its own runtime: ER-05's rule, never emerge/emerge).
# Files: idearium/lib/emerge-rung.cjs, idearium/lib/gaps.eg, idearium/lib/test/gaps.test.eg, idearium/lib/eg-build/gaps/, tests/modules/test-emerge-rung.test.js (ER-07).
# Measured with DeepSeek 16b the same hour (scratchpad, two gaps): idOf filled first try on both runs; rename refused 3 times on each (throw, a
# loop variable changed, then a parameter changed). The card now says no throw and that loop variables are read-only (the first two refusals).
# Not yet: a body too big for the model split into smaller gaps from the plan's steps (his "primitive per primitive"); the agent ladder per gap.

# ── ADDENDUM 2026-11-19 (0.60.611) — EMB2 expanded: each gap its own file in its task's folder; each try a fresh chat told the lesson (built) ──
# James, 2026-11-19: "Each gap it's own file right? like each primitive should be its own file, chunked and referenced. like the way idearium
# chunks?" · "gates need to inject the lesson, and failure mode from the previous attempt, and try again, like it needs to understand the problem
# before trying again, like it needs to start a new chat and inject the context, and lesson fix again" · "all the relenavnt files per task need to
# be bundled in athe same folder. not fragmented. stored in a folder, maybe with the contract id or task id? so it needs to be indexed in the node
# index database for the server.js". Asked which id names the folder (contract, phase + file, run), he chose the contract id.
# Built: each skeleton gap is a .gap node file (lib/node-export.js, the known type gap) in idearium/data/tasks/<contract>/ (<repo>/<map>.<phase>),
# every attempt written as it happens; each indexed into Idearium's own node database (lib/node-registry.js storeFor('idearium')), read by the
# existing `system nodes idearium gap` route and command; every try a fresh chat told gaps.eg lesson(). lib/node-registry.js's boot scan keeps a
# node whose file is in a task folder. Decided by his axioms: §2.1 and his 2026-11-14 rule (no work only in memory), §5.15 (the rung is
# Idearium's, so its gaps are in Idearium's data), §10.3 (no second gap store: the node index is the one way to find them), §8.6 (node-export,
# node-index, node-registry and the system.nodes route reused; nothing new beside them).
# Files: idearium/lib/emerge-rung.cjs, idearium/lib/gaps.eg, idearium/lib/eg-build/gaps/main.js, idearium/lib/test/gaps.test.eg,
# lib/node-registry.js, tests/modules/test-emerge-rung.test.js (ER-08).
# Measured (docs/BENCHMARKS.md, thread T14): DeepSeek 16b with the earlier runs' lessons on disk got rename past its first refusal; from a fresh
# folder it repeated it 3 of 3. rename is still held (it changes the registry passed in).
# Open, his to settle: his 2026-11-19 "or raid? since it should be the contract hub? but maybe both, as a recipe, maybe raid is working memory,
# idearium is the long term" against his P12 (2026-09-11, "working memory is meant for immediate data for the contract which we should create a
# compartment for") and his 2026-09-02 "long-term lives in cortex". Not yet: a held gap split into smaller gaps.

# ── ADDENDUM 2026-11-20 (0.60.612) — EMB2 expanded: the gap chain (built) ──
# James, 2026-11-20: "if it can't fill a gap, it needs to understand why it's struggling, and add it to the learning memory, like anything that
# gets in the way towards filling the gap, becomes a gap in between the current step and the gap it couldn't fill" · "so each problem with filling
# the gap becomes the next gap, in the link." · "as each gap passes, gets logged or tagged in the gate as passed and compiled." This answers the
# split question put to him on 2026-11-19 (the model names helpers, or a line-by-line printer): his design, a third reading, is what was built.
# Built: gaps.eg struggle/link/guard; emerge-rung.cjs blockerFor (its own try's missing call first, then the learning memory from the node index,
# then one question to the model); the gate tag; a held gap stays an open loop (IF20). Decided by his axioms: §14.4 (the chain is bounded), §1.2
# (held is said, never forced), §2.1 (every link on disk), §8.6 (the node index is the learning memory; nothing new beside it).
# Measured: DeepSeek 16b named findEntryById for the held rename; both passed the compiler; the module's test then failed (a change through an
# alias of a parameter, which Emerge's checker lets through). Next, his ideas the same day: a failed test becomes a gap ("test per gap"); Emerge's
# checker refuses the alias change (CIE14); a 3b fills the smallest gaps, bigger models only for held ones; his framework per step or pipeline
# ("framework per step. or pipeline. like i want it to use my framework."); rewind and the intelligence system per gate (TL4, PC2/PD4, GW6).

## ADDENDUM 0.60.631 (2026-11-21) — a pinned Ollama model builds through the Emerge rung
# James, 2026-11-21: "okay. get it to code from end to end. we need that proof that its working."
# a build pinned to ollama:<model> made no rung, so its bricks skipped the Emerge rung and its gaps and went to the agent climb, which refused the pin as an unknown provider (run phrun-mwqlfi0m-j17s); the pin is now one rung, and paramsOf reads ollama:<model> like the planner does

## ADDENDUM 0.60.632 (2026-11-21) — the Emerge rung reads the three faults of run 15
# James, 2026-11-21: "yes. do it, end to end."
# gaps.eg (Emerge): a name inside a string's braces gets the brace fix (Emerge reads { } in a string as code); only a CALLED name becomes a missing piece; a body that compares its input with the examples' literal texts is refused before it is compiled; the brief says both
# ADDENDUM 2026-11-23 — EMB3, measured on the 3b alone. James: "nexus is meant to make coding with small llms possible." So a pass that needs the 30b proves the wrong thing, and climbing the ladder is not the goal.
# Before: one function for the phase, prompts up to 8,207 characters, 146 recorded tries, 39 different bodies, no pass. 59 refusals were one "!", 61 of 72 tries at the main function used regex and methods.
# Measured (nexus-build-data/small-proof.js, not Nexus code): the same phase split into 11 pieces, each a fresh prompt under 1,500 characters. Best run: 9 of 11 pieces in 53 s and 18 calls on the 3b, 4 mechanical repairs, 1 line taken from the plan with no model. Held at fixes_in; the phase has NOT passed. Runs varied (2 to 9 pieces).
# What moved it, in order: (1) mechanical errors repaired by Nexus, not asked again; (2) only the shape a piece needs (walk a text, change its parts); (3) a line the plan already states is written with no model; (4) smaller pieces; (5) an edge case as an example.
# Bias, named: the coder wrote these 11 pieces and their wording while watching the failures, on this one phase. It shows the 3b can write the pieces. It does not show Nexus can split a phase by itself, which is the next thing to build and to test on a phase not tuned by hand.
# The uncommitted repeat guard in emerge-rung.cjs hands a repeated body to a bigger model. It is held back: the small-model path should shrink the gap instead.
# ADDENDUM 2026-11-23 — his idea, measured: "can't we just use a continuous data stream to inject what we need into the model upstream?"
# Test (nexus-build-data/stream-gate.js, not Nexus code): the 3b on 4 pieces, 6 seeds each. A live gate read the token stream, cut a line that turned into something Emerge refuses, wrote one correcting comment into the answer and let it continue. Result: 8 of 24 with the gate, 8 of 24 without, 13 injections, 2.8 s against 1.9 s each. The same pieces passed and failed.
# Read from the errors: the model writes Go and Python shapes too (:=, for i, line := range, x[:n]). A hand list of bad patterns misses them, and a comment does not change what it writes next. This tests one crude form of his idea, after the token is chosen. It does not test the stronger form: a grammar of Emerge applied while each token is chosen, so a token Emerge cannot accept can never be produced. Ollama 0.40.17 exposes this only as a JSON schema; llama.cpp takes a full grammar and runs the same GGUF files. Not tried.
