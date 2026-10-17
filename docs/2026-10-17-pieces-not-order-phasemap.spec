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
    status: OPEN
  PC0b_first_kinds:
    asked: "which purposes are the first piece kinds?"
    coder_recommends: "spec_section, function, test, wire (registry/loom), doc. The spec workshop already cuts by section. To confirm."
    status: OPEN
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
