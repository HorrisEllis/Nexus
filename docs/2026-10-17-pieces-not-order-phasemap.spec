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
    status: "DECIDED 2026-10-17 by the axioms (the coder) — D8: yes, against declared interfaces (§5.10, §5.14, §3.1) — his answer was \"[No preference]\"; see docs/2026-10-17-decisions-by-the-axioms.spec"
  PC0b_first_kinds:
    asked: "which purposes are the first piece kinds?"
    coder_recommends: "spec_section, function, test, wire (registry/loom), doc. The spec workshop already cuts by section. To confirm."
    status: "DECIDED 2026-10-17 by the axioms (the coder) — D9: spec_section, function, test, wire, doc (§16.4, §0.5) — his answer was \"[No preference]\"; see docs/2026-10-17-decisions-by-the-axioms.spec"
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
