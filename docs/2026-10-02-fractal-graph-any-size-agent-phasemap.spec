spec:
  meta:
    name:     fractal-graph-any-size-agent
    version:  1.0.0
    date:     2026-10-02
    release:  0.39.300 (mapped; nothing built)
    uuid:     nexus-fractal-graph-any-size-agent-phasemap-v1-0000-2026-1002-jamesbrooks-001
    owner:    idearium · intelligence · lib/code-intel
    status:   "MAPPED 2026-10-02, before building"
    axioms:   >-
      docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §10.2 projections derived, §0.3 nothing lost,
      §1.2 nothing silently fails; the node store's I9 (no hardcodes: a budget is resolved at run time, never a constant).
    origin: >-
      James, 2026-10-02: "look at the graphs. tellme all about them. any fields or more graphs to add? i want to make it
      work with any size agent. like anything we can do. even chunking chunks recursively, or fractal decomposition
      recursively,?"

  found:   # read, not assumed
    graphs:
      - "CODE — idearium/repo/graph.js: nodes file · chunk · symbol; relations contains, belongs_to, imports, exports, depends_on, depended_on_by; affects is computed (dependencyCone), never stored."
      - "SPEC — idearium/repo/spec-graph.js: what the catalog .spec files declare; disagreements with CODE are findings (ledger_divergence)."
      - "EXECUTION — idearium/repo/runtime-proof.js: what actually ran. CODE, SPEC and EXECUTION share file ids: the three graphs."
      - "MANIFEST — idearium/spec-engine/manifest/graph.js: depends → dependents, layers, build order (Kahn), cycles as data."
      - "CAUSAL — intelligence/cfr/graph.js: ledger events linked by causedBy, sessionId, jobId and time; replay and root cause."
      - "LATTICES — intelligence/lattice/associative-lattice.js (relationship_lattice; steps 8–13 stated NOT BUILT; fractal field always detected:false), intelligence/spatial/lattice.js (resonance-weighted), copilot person-model lattice, meta/crystal-lattice.js."
      - "OTHERS — clear-glass route-graph (agent → agent chaining), lib/require-graph.js, loom's wires, the Architect canvas (two levels: system → component, 0.39.300 AZ1)."
    unbuilt_relations: "idearium/repo/graph.js RELATIONS_DECLARED_UNSUPPORTED: calls/called_by, implements/extends/instantiates, produces/consumes/emits/handles, tested_by/tests/verified_by, exposes/wired_to/activates, generated_from/derived_from."
    chunking: >-
      lib/code-intel/chunker.js already splits an oversized unit at its own members, recursively (rule R3) — but it
      measures LINES against env constants (CODE_INTEL_CHUNK_TARGET 60, _MAX 150), not the agent's context. Nothing
      above a file decomposes: a system or a component is never split for an agent, and no level carries a summary.
    decomposition: "architecture-spec/registry/decompose.js — seams → nodes → wires, agnostic of content; the reusable step."
    fractals: "intelligence/mastermind.js calls delta.detectFractals over events; the lattice's fractal field is never fed by it."

  invariants:
    F1: "One node shape at every level (system, component, file, chunk, symbol): id, level, parent, children, tokens, summary, summaryTokens, hash, owner. A level is a view of one tree, not a second graph (§10.2)."
    F2: "The budget comes from the agent: tokens, resolved at run time from the agent's context window (its node), never a constant (I9)."
    F3: "A summary is derived from its children and carries their hash; a child that changes marks every ancestor's summary stale — stale is said, never served as fresh."
    F4: "Nothing is lost by cutting (chunker R5, for every level): every line belongs to exactly one leaf; the fold back up is checked against the parent's contract."

  phases:
    FG1_containment_tree:
      layer: foundation
      status: OPEN
      files: [idearium/repo/graph.js, idearium/repo/tree.js]
      does: >-
        The containment tree as one projection over the CODE graph: system → component → file → chunk → symbol, each
        node in the F1 shape, with tokens counted (a tokenizer estimate, its method named). The Architect canvas reads it,
        so zoom has as many levels as the tree has (not two).
      proof: "a fixture repo: every file under exactly one component, every chunk under one file; tokens sum up the tree; the canvas shows N levels"

    FG2_token_budget_chunking:
      layer: library
      status: OPEN
      depends_on: [FG1_containment_tree]
      files: [lib/code-intel/chunker.js, lib/chunk-service.js]
      does: >-
        The chunker's limits become a budget in tokens, passed in (F2); R3's recursion is unchanged — it now stops when a
        unit fits the budget, so the same file chunks finer for a small agent and coarser for a large one.
      proof: "one file planned at budgets 2k, 8k, 32k: every chunk ≤ its budget, every line in exactly one chunk at each (R5)"

    FG3_summaries_up_the_tree:
      layer: library
      status: OPEN
      depends_on: [FG1_containment_tree]
      files: [idearium/repo/summaries.js]
      does: >-
        Each node's summary from its children's (leaves from their text), with the children's hash (F3); recomputed only
        where a hash changed. Summaries are node records in the repo's store, typed (nexstore).
      proof: "change one function: its chunk, file, component and system summaries go stale and refresh; nothing else recomputes"

    FG4_context_for_any_agent:
      layer: service
      status: OPEN
      depends_on: [FG2_token_budget_chunking, FG3_summaries_up_the_tree]
      files: [idearium/repo/context.js, lib/repo-agent.js]
      does: >-
        contextFor(node, budget) → the node in full, its ancestors' summaries, its siblings' and dependencies' summaries,
        packed to the budget, the cut said. A small model works deep on a thin slice; a large one takes whole systems —
        the same tree.
      proof: "for budgets 4k and 64k the packed context is ≤ budget, always includes the node and its parent chain, and lists what was left out"

    FG5_recursive_build:
      layer: engine
      status: OPEN
      depends_on: [FG4_context_for_any_agent]
      files: [idearium/spec-engine/chunk-dispatch.js, architecture-spec/registry/decompose.js]
      does: >-
        Plan at a level; decompose until each leaf fits the agent (decompose.js's seam → node → wire step, reused);
        build the leaves; fold back up, each parent checked against its contract (F4). A leaf that fails is retried
        smaller, not bigger.
      proof: "a spec built with a small-budget stub agent and a large one: both complete; the small one has more, smaller leaves; every parent check passes"

    FG6_relations_and_fractals:
      layer: library
      status: OPEN
      depends_on: [FG1_containment_tree]
      files: [idearium/repo/graph.js, intelligence/lattice/associative-lattice.js]
      does: >-
        The declared-unsupported relations that matter most for coding first — calls/called_by, emits/handles,
        tested_by — each moved to RELATIONS_SUPPORTED only once produced. The lattice's fractal field fed by
        delta.detectFractals (mastermind), not left at detected:false.
      proof: "a fixture with a call, an emit/handle pair and a test: each edge present; the lattice reports a recurring pattern it was given"

    WS5_the_whole_workshop:
      layer: interface
      status: OPEN
      depends_on: [FG4_context_for_any_agent]
      files: [idearium/ui/workshop.html, idearium/lib/workshop.js]
      does: >-
        James, 2026-10-02: "the spec builder, is supposed to be a huge workshop for building specs. huge, not a little
        fragment. like it needs to build everything i need for my systems. but as simple as possible, without losing its
        power or my control." The workshop becomes the full spec surface: every block of the spec template (the 11,
        registry included), the spec's own graph and its gaps (the synthesis, per spec), decomposition to any depth (FG5),
        each section versioned — one screen, his words first, the agent proposing and never writing without his yes.
      proof: "a whole system specced in the workshop alone: every template block filled, the registry block parsed to nodes, the gaps listed, saved to the repo"

    UV1_versioned_ui_compartments:
      layer: interface
      status: OPEN
      files: [idearium/ui/js/app.js, cos/host/gates/compartment.js]
      does: >-
        James, 2026-10-02: "what if we use compartments for versioned uis? like when we click on a html file in idearium it
        opens a popout window?" An .html file in a repo opens in its own popout window, served from that repo's
        compartment at a chosen version (versionium commit), so two versions of one UI can run side by side.
      proof: "click an .html in a repo: a popout serves it from the compartment; pick an older commit: a second popout shows that version"

  build_order: [FG1, FG2, FG3, FG4, FG5, FG6, WS5, UV1]
