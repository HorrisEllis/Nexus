# The substrate: one graph, one traversal, one chunking contract, one gate — agnostic of domain (2026-10-20)

origin: >-
  James, 2026-10-19: "tell me about the idea of it all? i want to map the traversal agnostically, using invarants overtime,
  primitives, and principles, what about using invariants to learn overtime, nexus, i mean."
  · 2026-10-20: "valuable? then the persistent memory, graphs, cross domain verification and borrowing"
  · 2026-10-20: "spec it. the chunking system. can you also spec the graphs, traversal, dynamic chunking, gating,"
  The idea and the direction are his: map traversal agnostically, learn by invariants over time, from primitives and principles.
  This map is the substrate that idea stands on; the learning itself is docs/2026-10-20-belief-loop-phasemap.spec. The coder's part
  is the census below, the readings (marked), and the phase cut.

status: MAPPED 2026-10-20 — nothing built by this map yet.

## Ground truth (read in the tree, 2026-10-20 — §8.6, §1.1)

Chunking — EIGHT implementations, each with its own unit and its own laws:
- lib/chunker/index.js — documents (spec/yaml/markdown/declaration boundaries; chunkDocument, structuralProfile, toLoomDeclarations).
  Consolidated from idearium in 2026-07 (James: "consolidate the chunking into one system also. for loom and idearium").
- lib/code-intel/chunker.js — code, structural (R1 cut at statement starts · R2 doc comments open their chunk · R3 bounded,
  recursive split · R4 small neighbours merge · R5 every line in exactly one chunk, checked · R6 stable keys).
- clear-glass/src/page/page-map.js chunk() — web pages by landmark/section (0.60.174; every block exactly once).
- lib/chunk-glyph.js — the most compressed semantic form of a chunk (defines, calls, pulls in, announces).
- emerge/chunk — a token-payload format for small models.
- idearium chunk dispatch + lib/chunk-build-orchestrator.js — retry and agent switching for chunk BUILDS.
- lib/seam/chunk-lifecycle.js — a chunk's state machine.
- lib/chunk-service.js — "chunking consolidated through the RAID engine" (2026-08): names the four of its day as distinct jobs.
- cortex/core/raid/contract-gates.js / contract-adapters.js — bricks of a .contract: a brick over every routed agent's LEARNED
  budget is decomposed (`decompose: true`), and _splitDeeper splits on capability (failed twice), context overflow, and "too big".
  So dynamic chunking exists REACTIVELY, at dispatch. DC1_dynamic_chunk_at_plan (sizing at plan time to MF1's model) is OPEN.

Graphs — at least TEN, each its own store and reader:
- loom registry + loom/maps/* (components, hooks, wires as require/consumer edges) · lib/require-graph.js (static requires)
- lib/phase-graph.js (DG2: one phase's files, uses, used-by, crossings) · lib/phase-dag.js (DG3: every phase of every map)
- lib/system-boundary.js (crossings between systems, ratchet baseline) · intelligence/cfr/graph.js (causal: causedBy, session, job)
- meta/crystal-lattice.js lattice_edges (weighted, success/failure counted, decaying) · intelligence lattice (nodes/neighbours routes)
- person model nodes/edges (copilot) · each repo's graph.json (lib/repo-context.js) · blueprint-index.json
- clear-glass blocks (0.60.174: the page as a tree with addresses)

Traversal — written again at every site: phase-dag slice() (transitive up/down), loom impact, causal-lookup, the semantic-tree walk,
upload-placement's resolve, context-atlas search, lattice neighbours, phase-map-auto's one-hop requires/consumers.

Gating — at least TWELVE gates, three verdict shapes:
- lib/step-gate.js (step.passed / step.blocked on nexus-bus, rule nodes lib/step-gates/*.step_gate)
- cortex/core/raid/contract-gates.js (.contract v2, gated step by step) · lib/gate-context.js (what a retry is told)
- lib/sigma-gate.js (governed event types) · lib/phase-deps-gate.js (DG1) · lib/phase-graph.js (DG2, 409 NO_GRAPH)
- lib/phase-dag.js (DG3, 409 DAG_INVALID) · lib/system-boundary.js (the ratchet) · lib/test-first.js · lib/verify-first.js
- lib/proposal-evidence.js (regression: before/after test runs in a shadow copy) · WARP's Gate (siso Event→Gate→Stream)
- RAID's constitution (lib/constitutional-ai.js) · GQ1_quality_stream (the SISO quality gate) is OPEN.

## Readings (the coder's; to confirm where marked)

- "map the traversal agnostically" — traversal written ONCE over a domain-neutral graph; each domain enters through an adapter
  (NC0's AD1). The page, the code, the specs and the runs are walked by the same code.
- "dynamic chunking" — chunk size is decided by WHO consumes the chunk (a model's learned budget) and WHAT must be proved about it
  (a gate's failing check names the part to split), not fixed per file. To confirm: whether he also means chunk boundaries learned
  from outcomes (DK2 says yes, by counting).
- "gating" — one gate primitive at every level (chunk, brick, file, phase, map, release), each level composing its children's
  verdicts. This reads his 0.60.167 open item "gating/DAG at every gate·level·step".

## Decisions (decided by his axioms; he can overturn any — §0.3 addendum)

decisions:
  SB_D1_views_not_copies:
    depends_on: []
    chosen: >-
      §10.3 (competing truth layers are a failure), §8.6, §0.3: the ten graphs are not migrated into a new store. The graph primitive
      is a SHAPE; each existing graph is read through an adapter as a view. A store moves only when its view proves it redundant,
      and then it is archived, said.
  SB_D2_one_contract_many_strategies:
    depends_on: []
    chosen: >-
      §8.6, NC0: chunking is one contract with laws (coverage once, order, stable keys, bounded size, a glyph) and a strategy per
      domain. The eight chunkers become strategies or are named as something else (a format, a state machine, a retry policy) —
      none is deleted.
  SB_D3_one_gate_verdict:
    depends_on: []
    chosen: >-
      NC0 evidence rule, §1.2: every gate answers pass | fail | unknown, with its evidence (discovered by which adapter, declared by
      whom, or unknown) and its residue (checks that could not run). Unknown never counts as pass. Existing gates are wrapped, their
      behaviour unchanged.
  SB_D4_size_by_consumer_and_proof:
    depends_on: []
    chosen: >-
      §1.3, docs/CLAUDE.md "local by default": a chunk is sized to the model that will take it (learned budgets, MF1) and split where
      a gate says it failed; reactive splitting stays as the safety net.
  SB_D5_budgeted_deterministic_traversal:
    depends_on: []
    chosen: >-
      §1.2, leverage rule: a walk has a budget, a deterministic order and cycle safety; a cut is said with what was not visited.

## Phases. Delivery per phase: backend → route → command → UI (UI tested in Clear Glass). Archive, never delete.

phases:

  GR0_graph_census:
    layer: foundation
    status: OPEN
    depends_on: []
    files: [lib/graph-census.js, docs/atlases/graph-census.md]
    spec: docs/substrate.spec
    blocks: [MOD-GRAPH-CENSUS]
    does: >-
      Every graph in Nexus, read from the tree, not memory: its nodes, edge kinds, store, writers, readers, size on James's data, and
      what its edges rest on (discovered, declared, unknown). Route + `graph census` command.
    proof: the census lists the ten graphs above with their real counts on his data/; a new graph added to the tree appears in it

  GR1_graph_primitive:
    layer: foundation
    status: OPEN
    depends_on: [GR0_graph_census, NC1_neutral_core_boundary, NM1_one_name_per_file]
    files: [lib/core/graph.js, lib/node-schemas/schema.block, lib/node-schemas/schema.edge, lib/node-schemas/schema.observation]
    spec: docs/substrate.spec
    blocks: [MOD-GRAPH]
    does: >-
      The primitives, with schemas (NC0 schema rule): Block { id (registry id where one exists), kind, address, signature, domain }
      · Edge { from, to, relation, evidence: discovered(adapter) | declared(by) | unknown, ts } · Observation { scope, at, blocks,
      edges, source } kept as an append-only log (the ledger pattern). The universal block primitive (docs/universal-block-primitive.spec)
      is the block's richer form — this is its core, not a second shape.
    proof: schema-checked round trip; an edge without evidence is refused; two observations of one scope diff into new/changed/gone

  GR2_graph_views:
    layer: library
    status: OPEN
    depends_on: [GR1_graph_primitive, AD1_adapter_contract]
    files: [lib/core/views/loom.js, lib/core/views/requires.js, lib/core/views/phases.js, lib/core/views/causal.js,
      lib/core/views/lattice.js, lib/core/views/page.js]
    spec: docs/substrate.spec
    blocks: [MOD-GRAPH-VIEWS]
    does: >-
      Read-only adapters projecting the existing graphs into GR1's shape: loom registry, require-graph, phase-dag, cfr causal graph,
      lattice_edges, Clear Glass page blocks. No store moves (SB_D1). A view says what it cannot see (e.g. a require built from a
      variable: unknown).
    proof: the same component reached through loom's view and the requires view has the same id; counts match each source

  GR3_graph_query_surface:
    layer: interface
    status: OPEN
    depends_on: [GR2_graph_views, TV1_traversal_primitive, TB1_toolbox]
    files: [idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/graph-panel.js]
    spec: docs/substrate.spec
    blocks: [MOD-GRAPH-QUERY]
    does: >-
      One door over every view: neighbours, path between two blocks, impact (who is reached), pattern match (a small motif language).
      Route, `graph …` commands, and a Graph section in the Toolbox.
    proof: "what does changing lib/bus.js reach" answered across loom + requires + phases in one call; the panel in Clear Glass

  TV1_traversal_primitive:
    layer: foundation
    status: OPEN
    depends_on: [GR1_graph_primitive]
    files: [lib/core/traverse.js]
    spec: docs/substrate.spec
    blocks: [MOD-TRAVERSE]
    does: >-
      walk(view, start, { direction, relations, depth, budget, order }) — deterministic order, cycle safe, budgeted; the cut is said
      (what was not visited and why). phase-dag slice(), loom impact and causal-lookup become callers of it, their results unchanged.
    proof: the three existing traversals give the same answers through it (their tests unchanged); a budget cut names the unvisited

  TV2_invariant_guided_traversal:
    layer: library
    status: OPEN
    depends_on: [TV1_traversal_primitive, IV2_invariant_miner, TV3_traversal_as_context]   # TV3 first: both change lib/core/traverse.js
    files: [lib/core/traverse.js]
    spec: docs/substrate.spec
    blocks: [MOD-TRAVERSE-GUIDED]
    does: >-
      Traversal that learns where to look: a scope whose stable invariants all hold is checked by them (cheap) and not descended;
      the walk spends its budget where an invariant broke. "using invariants to learn overtime" applied to looking.
    proof: on an unchanged repo the second walk visits a fraction of the blocks and reports the same findings; a planted break is found

  TV3_traversal_as_context:
    layer: integration
    status: OPEN
    depends_on: [TV1_traversal_primitive, CH1_strategies_behind_the_contract]
    files: [lib/core/traverse.js, lib/chunk-glyph.js, lib/coder-brief.js]
    spec: docs/substrate.spec
    blocks: [MOD-TRAVERSE-CONTEXT]
    does: >-
      An agent's context is a traversal, not a dump: from the task's blocks, walk to what they use and what uses them, project each
      as its glyph, stop at the token budget — the brief says what was cut.
    proof: a coder brief built this way is smaller than today's for the same phase and contains every symbol the file uses

  CH0_chunk_census_and_contract:
    layer: foundation
    status: OPEN
    depends_on: [GR1_graph_primitive]
    files: [lib/core/chunk.js, lib/node-schemas/schema.chunk]
    spec: docs/substrate.spec
    blocks: [MOD-CHUNK]
    does: >-
      The eight chunkers, each named for what it is (strategy, format, retry policy, state machine). One contract:
      chunk(input, { domain, budget, purpose }) → chunks that are blocks: they cover the input exactly once, in order (R5), carry a
      stable key (R6), stay within budget or say forced, and carry a glyph.
    proof: the census in the map's addendum; the contract's schema; a chunk is a GR1 block

  CH1_strategies_behind_the_contract:
    layer: library
    status: OPEN
    depends_on: [CH0_chunk_census_and_contract, AD1_adapter_contract]
    files: [lib/core/chunk.js, lib/code-intel/chunker.js, lib/chunker/index.js, clear-glass/src/page/page-map.js,
      cortex/core/raid/contract-adapters.js]
    spec: docs/substrate.spec
    blocks: [MOD-CHUNK-STRATEGIES]
    does: >-
      code (code-intel), documents (lib/chunker), pages (page-map), contract bricks (contract-adapters) as strategies behind the one
      contract — wrapped, behaviour unchanged. emerge/chunk stays a payload format; chunk-lifecycle stays a state machine.
    proof: each strategy's existing tests pass unchanged; each is reachable through chunk()

  CH2_chunk_laws:
    layer: library
    status: OPEN
    depends_on: [CH1_strategies_behind_the_contract]
    files: [tests/modules/test-chunk-laws.test.js]
    spec: docs/substrate.spec
    blocks: [MOD-CHUNK-LAWS]
    does: >-
      One law suite run over every strategy: coverage exactly once, order, stable keys when content is inserted above, budget
      respected or forced-and-said, glyph present. A strategy that breaks a law is reported by name.
    proof: the suite runs all four strategies; a strategy that drops a line fails it

  CH3_chunk_inspector:
    layer: interface
    status: OPEN
    depends_on: [CH1_strategies_behind_the_contract, TB1_toolbox, GR3_graph_query_surface]   # GR3 first: both add routes and commands
    files: [idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/chunk-inspector.js]
    spec: docs/substrate.spec
    blocks: [MOD-CHUNK-INSPECTOR]
    does: >-
      See how anything is chunked: pick a file, a spec, a page or a contract → its chunks, keys, sizes, glyphs; `chunk <path>`.
    proof: tested in Clear Glass

  DK1_dynamic_chunking:
    layer: library
    status: OPEN
    depends_on: [CH1_strategies_behind_the_contract, DC1_dynamic_chunk_at_plan, MF1_model_fit_routing]
    files: [lib/core/chunk.js, cortex/core/raid/contract-adapters.js, cortex/core/raid/contract-gates.js]
    spec: docs/substrate.spec
    blocks: [MOD-DYNAMIC-CHUNK]
    does: >-
      Chunk size decided by the consumer and the proof (SB_D4): before dispatch, units are sized to the routed model's learned
      budget (boundaries.budget; DC1 is the brick instance of this); after a gate fails, the unit is split along what failed (the
      failing test's covered declarations), not in halves; units that keep passing at a size may be merged next time. The reactive
      _splitDeeper stays as the safety net. Every resize is said on the run.
    proof: a file over a 3B model's budget is planned as ≥2 units; a gate failure on one function splits only that function's unit

  DK2_learned_granularity:
    layer: library
    status: OPEN
    depends_on: [DK1_dynamic_chunking]
    files: [lib/core/chunk.js]
    spec: docs/substrate.spec
    blocks: [MOD-GRANULARITY]
    does: >-
      Count outcomes per (domain, chunk kind, size band, model) → the size that passes first time; read first by DK1. Counts, not a
      model (decision D4 of the upload/page map); written as crystals once the belief loop has them (CY2).
    proof: after a run of outcomes the planned size for that kind and model moves toward the passing band, and says why

  GW0_gate_census:
    layer: foundation
    status: OPEN
    depends_on: []
    files: [lib/gate-census.js, docs/atlases/gate-census.md]
    spec: docs/substrate.spec
    blocks: [MOD-GATE-CENSUS]
    does: >-
      Every gate in Nexus: what it guards, its verdict shape, whether it records evidence and provenance, whether it can say unknown,
      what overrides it ("anyway") and who may. Joined to cos/spec/check-catalogue.spec's checks.
    proof: the twelve gates above listed with their shapes; the ones that cannot say unknown are named

  GW1_gate_primitive:
    layer: foundation
    status: OPEN
    depends_on: [GW0_gate_census, GR1_graph_primitive, docs/2026-10-19-solid-build-foundation-phasemap.spec::GQ1_quality_stream]   # GQ1 is defined in two maps; this names the live one
    files: [lib/core/gate.js, lib/node-schemas/schema.verdict]
    spec: docs/substrate.spec
    blocks: [MOD-GATE]
    does: >-
      gate(subject, checks) → { verdict: pass | fail | unknown, evidence: [{ check, result, evidence kind, provenance }], residue }
      on SISO's Event→Gate→Stream (GQ1 is its quality instance); emits gate.passed / gate.blocked / gate.unknown on nexus-bus
      (step-gate's rule). Existing gates wrapped by adapters, their decisions unchanged.
    proof: step-gate, DG2 and verify-first answer through it with the same decisions; an un-runnable check is residue, never a pass

  GW2_gates_at_every_level:
    layer: library
    status: OPEN
    depends_on: [GW1_gate_primitive, CH1_strategies_behind_the_contract, DK1_dynamic_chunking, CH3_chunk_inspector]   # DK1 and CH3 first: shared contract-gates.js / api
    files: [lib/core/gate.js, cortex/core/raid/contract-gates.js, idearium/api/index.js]
    spec: docs/substrate.spec
    blocks: [MOD-GATE-LEVELS]
    does: >-
      chunk → brick → file → phase → map → release: each level's gate composes its children's verdicts with its own checks; a phase
      passes only when its chunks did and its proof ran; unknown below makes unknown above (never pass). "gating at every
      gate·level·step".
    proof: a phase with one unknown chunk is unknown, not done; a release over a failing phase is refused with the chain

  GW3_gate_panel:
    layer: interface
    status: OPEN
    depends_on: [GW2_gates_at_every_level, TB1_toolbox]
    files: [idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/gate-panel.js]
    spec: docs/substrate.spec
    blocks: [MOD-GATE-PANEL]
    does: >-
      For any run, phase or release: its gate tree, each verdict with its evidence and residue; `gates <run|phase>`.
    proof: tested in Clear Glass

  PS1_phase_specs:
    layer: library
    # roadmap edit 2026-10-24: OPEN -> DONE 2026-10-24. by evidence — test-phase-specs.test.js (its own), test-pipeline-nodes.test.js (linked), test-pipeline-root-causes.test.js (linked) (dry run 2026-10-23; James 2026-10-24: yes do it. )
    status_previous: "OPEN"
    status: "DONE 2026-10-24. by evidence — test-phase-specs.test.js (its own), test-pipeline-nodes.test.js (linked), test-pipeline-root-causes.test.js (linked) (dry run 2026-10-23; James 2026-10-24: yes do it. )"
    depends_on: []
    files: [emerge/compiler/phase-specs.js, lib/pipeline-nodes.js, lib/node-schemas/schema.graph, tests/modules/test-phase-specs.test.js]
    spec: docs/substrate.spec
    blocks: [MOD-PHASE-SPECS]
    does: >-
      His order (2026-10-20): "specs, then phases then specced again with dag and related files for it". For every phase: its
      blocks resolved in its spec's knowledge graph, its files mapped (changes, uses, used-by), its graph with its DAG slice, written
      as <owner>/phases/<map-id>/<phase>.phase + .graph (handoff PN1's layout). graphNode keeps the dag slice (it dropped it).
    proof: every phase of the two 2026-10-20 maps has a .phase and .graph; blocks all resolve; a second run reports no drift

## First milestone (smallest proof of the idea)

GR0 + GW0 (the two censuses — cheap, and they make every later claim checkable) → GR1 → TV1 with phase-dag slice() as its first caller
→ CH0 with code-intel and page-map as its first two strategies. Two domains through one shape before any breadth (NC0's NT1 rule).

## ADDENDUM 2026-10-20 — built from a full spec now; each phase specced again
James, 2026-10-20: "not phasemaps. full specs to build them. everything needs  to be speccced before built,so it can be rebuilt if
lost. … specs, then phases then specced again with dag and related files for it, look at the handoff"
The build contract is docs/substrate.spec (emerge module format; every module at specDepth 1.0). Each phase above now names `spec:` and the
module ids it builds in `blocks:`. Each phase is specced again as <owner>/phases/2026-10-20-substrate-graph-traversal-chunking-gating/<phase>.phase and its
graph/<phase>-<hash>.graph (related files with roles, crossings, the DAG slice), written by emerge/compiler/phase-specs.js.
