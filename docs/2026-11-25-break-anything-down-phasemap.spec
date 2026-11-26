# docs/2026-11-25-break-anything-down-phasemap.spec — the pipeline breaks anything down to its smallest unit, and builds it back up
# author: james-brooks (the idea, the direction and the framework are his; the coder wrote this origin; each phase below was added through
# Idearium's own route, POST /api/repos/:repo/phases/add, his "look at idearium for the mapping")
origin: >-
  James, 2026-11-25: "im saying the pipeline could break down anything into components, or pieces, or the smallest unit of anything. expand the
  capability of nexus to its max potential. anything. use my framework to find all the things it could do." · "but no, i meant look at idearium
  for the mapping." · Before, the same day: "everytime you need to step in, you need to give capability, not do it yourself." · "everything
  goes to the pipeline. each request." · "Like a tree of branches." His framework, which this map runs as a machine:
    Section 7 Deconstruct: "Zoom in recursively and fractal until you hit bedrock ... Now throw away everything that isn't an invariant."
    Part 3 Synthesis: "the convergence of primitives" · "One gap is an anomaly, Two gaps a coincidence, Three gaps = A invariant, not fact."
    Section 3 Finding the gaps: "Map the invariance, primitives, principles, in the overlap. Now you have the boundary for the constraint field."
    Section 14 Cross-domain: "Any output can be fed into any system, any tool can be an input for a different output" (his meta domains:
      strategy, innovation, economics, relationships, cognitive, physical, temporal, structural, experiential).
    Section 10 Hostile verification · Section 17 Failure mode detection · Section 16 Iterate & integrate · Part 5 Signal to noise.
found: >-
  The coder's census, 2026-11-25, of what Nexus already has for this (his "always use what nexus has"): the pipeline grows a run from its
  steps (PC26 slices 1, 1b), Idearium's His request and build pipelines (words → intent → phase → build; never run), the emerge rung (a
  piece small enough for the 3b: EMB2-EMB12), the gaps and the crystallizer (three = an invariant), Pillar (the reusable component store),
  COS compartments, RAID, Cortex's failure modes (each coder intervention now filed as needed-the-coder). What is missing is the general
  step: decompose anything, not only a code phase.
decided: >-
  The unit, from the build's own evidence (EMB3, EMB10): a piece is small enough when one gate can check it and the smallest model can fill
  it; above that it is broken down again. Every piece is a node with its parent, its contract (end state), its gate and its builder (PC26:
  one tree, nothing implicit).
axioms: "Part IV; §5.9-§5.16 (each system its own pieces, reached by route), §8.6 (reuse: the grow, the rung, the crystallizer, Pillar, Idearium's mapping)"

phases:

  UD1_the_unit_a_piece_with_its_parent_contract_gate_a:
    status: pending
    depends_on: []
    does: >
      A piece of anything is a node: its parent, its contract (the end state it must reach), its gate (what checks it) and its builder (who or what fills it). It is the smallest unit when one gate can check it and the smallest model can fill it; above that it is broken down again. Agnostic: a code phase, a document, a plan, a song, a conversation, a framework.

  UD2_is_it_even_a_framework_problem_the_gate_before_b:
    status: pending
    depends_on: [UD1]
    does: >
      His Section 0: 'Before anything enters the loop, ask: is the loop the right tool here? Some problems need a system. Some need presence, rest, grief, or breadth.' Before an input is broken down, a gate says whether it should be: a person's feelings, a relationship, grief are not decomposed by default; it is said, and his to override.

  UD3_the_decompose_step_one_branch_per_piece_down_to_:
    status: pending
    depends_on: [UD1, UD2]
    does: >
      His Section 7 Deconstruct ('Zoom in recursively and fractal until you hit bedrock'): a pipeline step kind that breaks its input into pieces and grows one branch per piece in its own run (PC26 grow), each piece broken again until it is the unit; each piece's builder chosen by its kind (Emerge, a model, a tool, a pipeline, him).

  UD4_anything_in_every_input_read_into_the_same_tree_:
    status: pending
    depends_on: [UD3]
    does: >
      His Section 14 ('Any output can be fed into any system'): his words, a .spec, a phasemap, a file or a folder, a page, a framework section, a run's record each enter through one reader into the same piece tree, so the decompose step never knows what it was given.

  UD5_invariants_across_pieces_become_components:
    status: pending
    depends_on: [UD3]
    does: >
      His Part 3 ('One gap is an anomaly, Two gaps a coincidence, Three gaps = A invariant') and Section 3 ('Map the invariance, primitives, principles, in the overlap'): pieces with the same contract in different trees are counted by the crystallizer; one seen three times becomes a reusable component in Pillar, so the next tree reuses it instead of building it.

  UD6_build_back_up_synthesis_toward_the_end_state:
    status: pending
    depends_on: [UD3, UD5]
    does: >
      His Part 3 ('Synthesis: the convergence of primitives') and Section 6 Rebuild: passed pieces join back up the tree to their parent's contract, reusing components, until the root's end state holds; a join that fails is a gap, broken down again.

  UD7_cross_domain_the_same_problem_broken_down_throug:
    status: pending
    depends_on: [UD4, UD6]
    does: >
      His Sections 5 and 14 (horizontal contamination; meta domains: strategy, innovation, economics, relationships, cognitive, physical, temporal, structural, experiential): parallel pipelines break one problem down through different domains; pieces identical across them are joined and counted (PC26 the overlap).

  UD8_every_piece_attacked_and_measured:
    status: pending
    depends_on: [UD3]
    does: >
      His Section 10 (hostile verification) and Part 5 (signal to noise): each piece's gate includes the adversary (three readers) and his equations (PC27: Fidelity, Alignment, Expansion, Tension, Slope), so a piece that passes is also scored.

  UD9_every_coder_intervention_broken_down_into_a_capa:
    status: pending
    depends_on: [UD3]
    does: >
      His rule, 2026-11-25: 'everytime you need to step in, you need to give capability, not do it yourself.' Each needed-the-coder failure filed with Cortex is input to the decompose step: broken down into the capability that was missing, mapped, and built by the pipeline; counted per phase toward zero (T18).

  UD10_failure_modes_broken_down_to_their_mechanics:
    status: pending
    depends_on: [UD3]
    does: >
      His Section 17 ('Isolate the mechanics of the failure, not the specifics ... update the detection system'): a failure is broken down to the mechanism that made it; that mechanism becomes a detection rule (a gate or a gaps.eg rule) applied to every later run.

  UD11_nexus_broken_down_into_itself:
    status: pending
    depends_on: [UD5]
    does: >
      Nexus's own systems broken down to their components by the same step (Pillar, genesis, the system registry), so Nexus holds a map of itself that it can rebuild from; his Section 17 'Periodically run Phase 0 on the framework itself'.

  UD12_his_framework_as_step_kinds:
    status: pending
    depends_on: [UD3]
    does: >
      Each section of his Innovation Toolkit a pipeline step kind (Deconstruct, Find the gaps, Map the leverage, Horizontal contamination check, Rebuild, Hostile verification, Iterate and integrate, Failure mode detection), so any pipeline can run his framework on any input; PC2 procedures and frameworks as steps.
