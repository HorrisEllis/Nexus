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
  EMB4_torrent_pieces:
    status: OPEN
    depends_on: [EMB3_the_autocorrect, EMB6_the_end_state_first]
    james: '"I''m not selling a model. It was supposed to be this way. Like torrents in a magnet link. The pieces always save. the torrent style way of generating. Like litterally can''t be broken own enough, is how each word in relation to its next rate you know the compiler works. It''s fine component in relation to its next. The traversal. Every step can be broken down using end state first and a dag. Like nothing too small as long as it''s persistent. Using my framework. Dynamically expanding and contracting." (2026-11-23)'
    files: [idearium/lib/emerge-rung.cjs, idearium/lib/gaps.eg, idearium/lib/eg-build/gaps, idearium/lib/test/gaps.test.eg, idearium/lib/autocorrect.eg, cos/build/emerge-build.js, tests/modules/test-emerge-rung.test.js]
    does: >-
      A build is a torrent of pieces. Each piece is a gap file on disk; a passed piece is never asked again: the next run takes it and makes only what is missing.
      Every answer is first repaired by autocorrect (EMB3, written by the 3b), so a habit with one known fix never costs a try. A piece that will not fill splits into smaller pieces (expanding); pieces that pass compose back into the one that asked for them (contracting). A repeated refusal splits, it does not climb to a bigger model.
      Slice a (now): reuse, repair, split on repeat. Slice b: a phase split from its end state into a DAG of pieces by Nexus, each with its own examples, his framework per gate, so no hand split is needed.
    proof: "a second run of a passed phase asks no model; a refused !x is repaired before the compiler; a repeated body links a smaller piece; slice b: a phase not split by hand builds on the 3b"
    axioms: "§0.3 nothing lost, persistence (his 2026-11-14), §8.6 reuse, §14.4 bounded"
  EMB5_trials_start_at_raid:
    status: OPEN
    depends_on: [EMB4_torrent_pieces, AC13_intent_routes_to_ids]
    expands: [T13]
    james: '"where the trials run. like raid creates the beginning of the pipeline. like all inputs go to raid. the hub. the routes to each system dynamically, non linear." (2026-11-23) · "nexus is a way to test what i can. its a lab, like my mind is." (2026-11-23)'
    files: [cos/ui/lab, cos/manager/server.js, cos/manager/contract.json, cos/build/emerge-build.js, cortex/boot.js, cortex/core/raid, idearium/cli/route-commands.js]
    does: >-
      The Lab is where trials run, not only where they are seen. A trial (a phase to build, a prediction to test) is one input, and every input goes to RAID first: RAID opens the request, which is the root of its pipeline (T13), and routes each step to the system that does it (the COS builder, Idearium, the Ollama system), chosen per step, not in a fixed line. A step that fails or splits sends its new pieces back through RAID.
      Each step, its system, its model calls and its result are the trial's record, shown in the Lab as it happens, and every trial is graded in the proof (A to Failed). Nothing reaches a system except through its route.
    proof: "a trial started from the Lab appears as a RAID request, its steps land on at least two systems through their routes, and its result and grade show in the Lab without a command line"
    axioms: "§5.9-§5.16 sovereignty, routes only; §10.3 one hub; persistence (his 2026-11-14)"
  EMB6_the_end_state_first:
    status: OPEN
    depends_on: [EMB3_the_autocorrect]
    expanded_2026_11_23_frames: 'his: "Using schemas, templates, and schematics or specs. For reusable structure. That''s one thing nexus was supposed to be doing. Like anything deterministic, reusable, maintains the architecture and structure." A parameter with a schema (named beside it in its file, or a node type of its name) gets lib/node-schemas.js frame(type): the structure from the schema, holes for the 3b. Measured: 0 of 25 without, 2 of 2 first try with.'
    expanded_2026_11_23_record: 'his: "Yes, record from code". Where the file exists the 3b writes only the calls; the code answers; a refusal and the stuck function''s code (and the private helpers it calls) are the next try''s lesson.'
    expanded_2026_11_23_split: >-
      His words: "yes dynamic chunking. using the agent tools like decomposition. like idearium. just do everything you can to get the 3b capable
      of coding emerge, injecting things up stream, nexus has the tools". RAID's own splitter (cortex/core/raid/contract-gates.js shouldSplit:
      split after two failures, never into the same pieces, bounded depth) has no route COS may call, so its rule is applied in the COS builder:
      a function whose calls fail twice splits into its required parameters, one piece each, each a saved piece checked by running the code
      (a piece passes when the code answers something it has not answered before). The pieces compose back into one call, checked as any other.
      Upstream: a piece's prompt opens with the shape the code itself named in its refusal (for example "chain must be { id, steps:[...] }").
    james: '"Every step can be broken down using end state first and a dag." (2026-11-23) · asked who writes each phase''s end state (the 3b with his approval, or the coder), he chose: "The 3b, I approve" (2026-11-23)'
    found: "2026-11-23, measured before any splitter run: lib/build-queue.js gives 289 buildable phases and none has examples, so the COS builder (plan, then test from examples, then the rung) can take none of them. The missing rung is the first: the end state."
    files: [cos/build/emerge-build.js, lib/node-schemas.js, cos/manager/server.js, cos/manager/contract.json, cos/ui/lab, idearium/cli/route-commands.js]
    does: >-
      Before any code, a phase gets its end state: examples, each 'call(args) == expected', the form lib/test-first.js already turns into a test with no model.
      The 3b writes them from the phase's own words (does, proof) and the signatures its plan gives; nothing else is in its prompt. Every answer is saved first (a piece on disk), then checked by what Nexus already has: test-first's examplesFrom keeps only well-formed lines, each call must be a planned export, fromExamples must give a test that parses, and contradictions() refuses a call expected two ways.
      The checked examples wait for him in the Lab. He accepts or rejects each; only accepted examples are written into the phase's map, and only then can the builder take the phase. A model never grades its own end state: his yes does.
    proof: "on the first three phases of the build queue whose words give signatures (rule fixed before the run: GW1_the_baton, GWK1_the_walker_and_chain_schema, OS1_every_run_on_one_surface), the 3b alone, no hand edit, gives at least 3 checked examples for at least 2 of the 3; each answer and check is on disk; prediction registered 2026-11-23 before the run"
    axioms: "end state first (his framework); persistence (his 2026-11-14); §8.6 reuse; Claude last (his, Nexus is for small models)"
  EMB7_code_frames:
    status: OPEN
    depends_on: [EMB6_the_end_state_first]
    james: '"Using schemas, templates, and schematics or specs. For reusable structure. That''s one thing nexus was supposed to be doing. Like anything deterministic, reusable, maintains the architecture and structure." (2026-11-23) · "Make sure you follow the claude.md. Pipeline first. Once it can begin to build nexus, from the inside out." (2026-11-23)'
    found: "2026-11-23 (EMB6): the 3b fills structure well and invents it badly: 0 of 25 without a frame, 2 of 2 first try with one. The rung already gives the module's frame (its skeleton, 0.60.607); a body is still written free. CIE's synth.eg has rung 2, templates whose every hole is one expression, with one template (fail_fast_scan) and holes filled by hand. Emerge's lang-synth runs it, no model."
    files: [emerge/emerge/lang/cie/synth.eg, emerge/emerge/cli.js, idearium/lib/emerge-rung.cjs, tests/modules/test-emerge-rung.test.js]
    does: >-
      Before a gap's body is asked for free, the 3b is given CIE's templates: the common shapes of a body, written once in Emerge (map a list,
      keep some items, fold, find the first, change one item, refuse then compute, walk a text). It picks one and writes each hole as one
      expression. Emerge renders it (lang-synth, the same holes give the same bytes) and its compiler checks it, as any body. A template that
      does not fit, or does not compile, falls back to the free body, so nothing that worked before is lost. The chosen template and its holes are
      kept in the gap's file, a piece like any other. The CLI takes structured arguments as one --json flag, so a command's array argument
      (lang-synth's units) can be given from the command line.
    proof: "prediction registered 2026-11-23 before the run: EMB3 (autocorrect, 13 functions) rebuilt from nothing on the 3b alone, once with templates and once without, the same ladder (3b only) and tries; with templates it takes fewer model calls to pass every gap than without. Measured from each run's gap files."
    axioms: "§8.6 reuse (CIE's own rung 2, Emerge's own door); deterministic first; persistence (his 2026-11-14); Claude last"
  EMB8_the_contract_at_every_level:
    status: OPEN
    depends_on: [EMB6_the_end_state_first]
    expanded_2026_11_24_small_gates: >-
      His words: "why so long? aren't the gates for each function supposed to reduce that? like gates only hold what is absolutely needed, and
      then can use the agent and repo tools to reference the map, contract, raid compartment worksurface, context, etc." · "Also the test file
      needs to be made first, conditions, and dependencies, prerequisites, need to shape expectations I feel like. Bidirectional causal chaining."
      (2026-11-24). Measured: replace_all's brief was 4,519 to 6,390 characters; what it needs (its signature and its contract) is 169. Each gate's
      brief now holds only: the piece's own function and contract, the signatures (never the bodies) of the functions already in the module, the
      lines of the Emerge card its examples call for (chosen by what the examples hold: text, lists, maps), and the last refusal's reason. The map,
      the module, the RAID contract and the work surface stay where they are, by reference. Reading, the coder's, to confirm: bidirectional causal
      chaining is the test file first, its conditions flowing down to each piece (a caller's expectation says what each function it calls must
      return) and each piece's prerequisites flowing up (what it may call, what it needs first); the next slice derives a helper's examples from
      the module test, not only from existing code.
    james: '"component. like look at the component registry. like its all here. look at the architecture spec and genasis" · asked whether to apply THE_CONTRACT_JOINS_THEM (genesis 1.6.0, proposed 2026-11-14, mapped, never applied): "yes like constraints, need to be acknowledged also. my framework does all of this. at every level across any domain" · "the primitives are the boundaries for the structure. Anything that can''t be changed without changing the shape of the structure. The dag should create the expectations. Create the check list. Pre-req is for prerequisites for understanding requests before starting. Using my framework." · "Pipeline. Pipeline. Pipeline. As simple as possible." (2026-11-23)'
    found: "2026-11-23: the 3b fills a piece well when the piece carries its own end state and copies when it does not (EMB6, EMB7: add_kind, given only its name, copied the Emerge card in every try). The component is already the agnostic block, the same at every level (genesis: 'nexus is recursive ... the same architecture on every level'; BEHAVIOR_IS_THE_COMPONENT: same input, same output). Its schema says what it is for, its capabilities, hooks and consumers, but not what it returns: THE_CONTRACT_JOINS_THEM was the missing field."
    reading: "the coder's, to confirm: one contract block, the same on a system, a module, a component and a hook (one function, a direct in-hook): signature (the values it accepts), examples (input → output), constraints (each acknowledged: an invariant, the shape that cannot change; a boundary, a range; a rule; a resource), and its depends_on, read from the wires. A level whose contract is missing is the next thing to map; a leaf with a contract is what the 3b fills."
    files: [idearium/spec-engine/templates/system/schemas/schema.component, idearium/spec-engine/templates/system/schemas/schema.hook, idearium/spec-engine/templates/genesis.spec, cos/build/emerge-build.js, idearium/lib/emerge-rung.cjs, tests/modules/test-emerge-rung.test.js]
    does: >-
      THE_CONTRACT_JOINS_THEM applied. The component and hook schemas gain one field, contract: { signature, examples, constraints }. The same
      block at every level, so the pipeline reads any system, module, component or function one way. The pipeline walks down until every piece
      has its contract, then the 3b fills the pieces, each brief carrying that piece's own examples and constraints, and passed pieces compose
      back up. Where code exists, a piece's examples are recorded by running it (EMB6); otherwise they are written when that level is mapped,
      and he approves them. First slice: the schema field; the builder records each function's examples against the built module (its Emerge
      twin when the planned file is only an adapter); the rung gives each gap its own examples and constraints.
    proof: "prediction registered 2026-11-23 before the run: add_kind (EMB3), the one piece the 3b could not fill from its name alone (14 refused tries, the Emerge card copied in every one), passes on the 3b once its brief carries its own recorded examples, with no hand-written description."
    axioms: "THE_CONTRACT_JOINS_THEM, BEHAVIOR_IS_THE_COMPONENT (genesis 1.6.0, his); §8.6 reuse; deterministic first; persistence (his 2026-11-14)"
  EMB9_break_down_before_climbing:
    status: OPEN
    depends_on: [EMB8_the_contract_at_every_level]
    files: [idearium/lib/emerge-rung.cjs, idearium/lib/gaps.eg, lib/gap-field.js]
    origin: >-
      His words (2026-11-24): "yeah always break it down. i told you that. as retry logic before escalating." · "don't try a new model until its
      been broken down as much as possible. this is going to be agnostic, so think of how huge that is." · "maybe multidimential field, that has
      to be met. like the gap field. like before it loses its meaning. or one function per gate."
    does: >-
      A gap that fails is broken down on the same model before any other model is tried, as far as it can go. Slice a (built 2026-11-24): the
      bound counts the helpers a module has linked in, not its own functions (a 13-function module was held at 8 and climbed the ladder without
      breaking anything down), and a gap may go 4 deep, not 2. Slice b (open): the stop is a field, not a number: a piece is broken down while
      every dimension of the field still holds for each part (it keeps its meaning: its contract, its examples, its place in the DAG), and stops at
      one function per gate or where a further split would lose the meaning. The field is the gap field's (lib/gap-field.js), made agnostic: the
      same test for any model, any provider, any kind of piece.
    expanded_2026_11_24_the_3b_alone: >-
      His words: "3b needs to do it's pices use nexus' systems and agent tools to outsource the reasoning, memory, and intelligence. if the 3b
      fails, need to fix it. no escalation until we know its possible or not." · "i dont see any reason why breaking it down would hit a limit.
      there isn't really an end to increments. or layers of fractals." Built: no count stops a breakdown (it stops where no new smaller piece can
      be named, or it loops); the 3b is asked again, told the names already taken, before a piece is given up; the build runs as COS pipeline
      "Build a phase (self-repairing)" (script build-phase.js in COS's scripts folder) on the 3b alone, each round resuming from the gap files
      until the module passes or a round makes no progress. Open: the 3b's reasoning, memory and intelligence outsourced to Nexus (RAID's
      context by id, the node index of gaps unstuck before, Pillar's components, the intelligence system's lessons), each a tool its gate can
      ask; a 3b failure is a fault of the system to fix, not a reason to climb.
    proof: "a function that failed on the 3b and climbed to the 16b in run cbuild-mwv6i9p5 (fix_equal) is broken down on the 3b first, each break shown in its .gap record, before any other model is asked"
    axioms: "§14.4 bounded (the bound kept, counted on what is added); deterministic and cheapest first (RL_D3, his economy); persistence (each break a node on disk)"
  EMB3_the_autocorrect:
    # roadmap edit 2026-11-20: OPEN -> IN PROGRESS 2026-11-20.
    # 2026-11-23: IN PROGRESS -> BUILT 0.60.642 (the 3b in small pieces; its 10 examples pass; see the addenda below)
    status_previous: "IN PROGRESS 2026-11-20."
    status: "BUILT 0.60.642"
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
  EMB10_the_engine_decisions_in_emerge:
    status: OPEN
    depends_on: [EMB3_the_autocorrect]   # built through the same rung, the same way
    james: '"i want everything written in emerge." · "no js" · "use the pipeline to replace it" (2026-11-24, of the JavaScript the coder added in 0.60.648-650)'
    files: [inference/lib/engine-plan.js, inference/lib/test/engine-plan.test.js]
    does: >-
      A pure module, the decisions the bridge's JavaScript made about the model server's engines (0.60.648-650), so they live in Emerge and
      the JavaScript that made them can be removed: served_by(models: string, file: string) -> bool is true when the engine's model list
      (its /v1/models text, read as text: never parsed) contains the file's name anywhere in it, or is empty; next_act(s: map) -> string takes { healthy, serves, asked }
      and says "use" (healthy and serving this model), "refuse" (healthy but another model), "start" (not healthy, COS not yet asked) or
      "wait" (not healthy, asked); new_names(known: list, fresh: list) -> list is the names in fresh that known lacks, in fresh's order;
      sse_text(line: string) -> map reads one line of an engine's stream: "data: [DONE]" is { text: "", done: true }; "data: {json}" gives the
      content of choices[0].delta (empty when none) and done false; any other line is { text: "", done: false }.
      Built by the pipeline (COS › Automation, "Build a phase (self-repairing)"), on the local models. The network calls that use these are
      the next phase: Emerge has no HTTP yet (a capability to build into Emerge, said 2026-11-24).
    proof: "its test, from these examples, planned first with no model; built by the pipeline with every Emerge line written by a local model"
    examples:
      - 'served_by("{\"data\":[{\"id\":\"C:/m/blobs/sha256-938ca13d\"}]}", "sha256-938ca13d") == true'
      - 'served_by("{\"data\":[{\"id\":\"C:/m/blobs/sha256-938ca13d\"}]}", "sha256-84d55217") == false'
      - 'served_by("", "sha256-84d55217") == true'
      - 'next_act({ healthy: true, serves: true, asked: false }) == "use"'
      - 'next_act({ healthy: true, serves: false, asked: false }) == "refuse"'
      - 'next_act({ healthy: false, serves: false, asked: false }) == "start"'
      - 'next_act({ healthy: false, serves: false, asked: true }) == "wait"'
      - 'new_names(["a", "b"], ["b", "c", "d"]) == ["c", "d"]'
      - 'new_names([], ["x"]) == ["x"]'
      - 'new_names(["x"], ["x"]) == []'
      - 'sse_text("data: [DONE]") == { text: "", done: true }'
      - 'sse_text("data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}") == { text: "hi", done: false }'
      - 'sse_text("data: {\"choices\":[{\"delta\":{}}]}") == { text: "", done: false }'
      - 'sse_text(": ping") == { text: "", done: false }'
    axioms: "§17.13 (in Emerge, through the rung; his 2026-11-24 'no js'), deterministic first (the examples are the test, no model), §8.6 (EMB3's rung and pipeline reused)"
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
# ADDENDUM 2026-11-23 (0.60.642) — EMB3 BUILT, by the 3b alone. James, 2026-11-23: "nexus is meant to make coding with small llms possible." · "We need to get this coding for what it is. Nexus has everything, either right now or planned." · "each step builds upon the last"
# idearium/lib/autocorrect.eg: 13 functions. 11 bodies written by huihui_ai/qwen2.5-coder-abliterate:3b through the Ollama system's job route; 2 lines (fix_code, autocorrect) taken from the plan with no model. Passed pieces were kept on disk and each run started from them. Then the COS builder (--pieces) ran them through the rung's own compile, build and expectation, and the phase's 10-example test, and landed them (--land).
# Named, so it is not read as more than it is: the coder split the phase into these pieces and wrote their wording, the walking and list shapes, and the loop frame of fixes_in, while watching the failures. A harness repaired mechanical errors before compiling (parameters reassigned, &&, ;). It shows the 3b can write Emerge when the gaps are this small. Nexus splitting a phase by itself, on a phase not tuned by hand, is still to show.
# The 3b's model is under the Qwen research license; this is evaluation, not a model to sell. The built runtime lands at the repo's _emerge/, where the rung's adapter points.
# ADDENDUM 2026-11-23 (0.60.643) — EMB4 slice a built. James, 2026-11-23: "Like torrents in a magnet link. The pieces always save." · "Every step can be broken down using end state first and a dag. Like nothing too small as long as it's persistent."
# The torrent: every piece passed on disk in a phase's folder is taken as it is, helpers included, with its own shape (params, signature), so an export planned by name only still gets its skeleton. Proof: EMB3 rebuilt with Ollama unreachable on purpose: 13 pieces taken from disk, 0 model calls, its 10 examples passed.
# The repair: an answer the compiler refuses goes to autocorrect (EMB3, written by the 3b); the repair is kept only if it compiles, or if only a parameter is left to copy, which Nexus then copies. Proof: "if !x { return 0 } / return x + 1;" passed with no second model call. Found while building: autocorrect breaks text holding an escaped quote ("\""), which its examples never covered, so it repairs only after a refusal.
# A repeat splits: a body refused again is not asked again; the piece goes to the split (a smaller gap linked in), and only when nothing smaller can be named does it climb. Slice b, the phase split from its end state by Nexus, is still to build.
# The coder's own fault, kept: an inline comment swallowed the rest of the pass line (the gate) until the rung's tests caught it.
# ADDENDUM 2026-11-23 (0.60.644) — EMB4, the Lab in COS. James, 2026-11-23: "I have no way to look at any of this" · "i need to see pipeline. yes." · "just need this building. not losing the meaning. i have bpd and forget sometimes."
# After his yes on the live preview: COS page "Lab" (cos/ui/lab) over one route, GET /api/cos/lab: RAID's requests, each build with its model calls and its pieces (the COS builder now keeps each piece's outcome in its own build rows, so COS never reads Idearium's files), the issues graded in the proof, and the systems. Command row cos.lab.
# Checked: the route on a throwaway COS server; the page in the browser on every tab, and at 375 px wide with no sideways scroll. Not checked: the page inside the live COS app.
# Said, not fixed: a piece rebuilt from disk shows "the passed pieces" as its model, not the 3b that wrote it.
# ADDENDUM 2026-11-23 (0.60.645) — EMB6, the end state first. James, 2026-11-23: "Every step can be broken down using end state first and a dag." · "The 3b, I approve" · "Yes, record from code" · "yes dynamic chunking ... injecting things up stream, nexus has the tools" · "Using schemas, templates, and schematics or specs. For reusable structure. That's one thing nexus was supposed to be doing."
# Found: none of the 289 buildable phases had examples, so the COS builder could take none. Built: --end-state in cos/build/emerge-build.js. The 3b writes a phase's calls; where the file exists the code answers them (recorded, run twice); every answer and piece is saved before it is checked; a call that fails twice splits into its parameters (RAID's rule); a parameter with a schema gets lib/node-schemas.js frame(type), and the 3b fills only its holes. Kept lines wait for his yes; nothing enters a map yet.
# Measured (docs/FRAMEWORK-THREADS.md, T15/EMB6): guessed answers 0 of 25 agree with the code; recorded, 1 of 3 phases; with frames, 2 of 3 (GW1 11, GWK1 3, OS1 none: no functions). GWK1: 0 of 25 without a frame, 2 of 2 first try with.
# Not done: the Lab screen to approve lines; frames before the first try; frames for Emerge code. Two schema-store tests failed before this change and still fail (a count of 31 types; one failure record's fields).

# ── ADDENDUM 0.60.657 (2026-11-25) — EMB10: a piece passes only on its own examples (his "Passed but useful?") ──
# James, 2026-11-25: "Okay you need to be checking. And then it needs to be checking its own work. Compiler is supposed to debug its own code."
# The 3b-alone run (6ee7d3c8): 5 of 5 pieces "passed" on the compiler alone; served_by rewritten 16 times, wrong each time; the module failed its
# examples. EMB8's contract gate existed but had no examples for EMB10 (it read only the end-state record). Now emerge-build gives each piece its
# phase's own example lines, and the gate writes Emerge literals (braces escaped, maps and lists Emerge's). Proof: the gate replayed, 14/14 on a
# correct module, served_by refused with its two wrong cases; test-emerge-rung 14/14, test-contract-gates 20/20.

# ── ADDENDUM 2026-11-25 — EMB10: served_by's sentence made exact (the coder's spec was vague) ──
# James, 2026-11-25: "Useless examples build useful files. Capability proves competency, not tests passing." Found on run 4668559a: with its
# sentence in its brief, the 3b still parsed the JSON and compared each id to the file with ==; but the id is a path (C:/m/blobs/sha256-...) and
# the file a name (sha256-...), so even a perfect parser fails the examples. "names the model's file" was the coder's vague wording; it now says
# what the examples hold: the text, never parsed, contains the file's name anywhere, or is empty. The behaviour, not the code (no expression given).
