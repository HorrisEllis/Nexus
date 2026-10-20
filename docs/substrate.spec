spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # substrate.spec — one graph, one traversal, one chunking contract, one gate: the agnostic substrate of Nexus.
  # Format: emerge's module spec (emerge/SPEC_COMPILER.spec) — read by emerge/compiler/kg-builder.js into a knowledge graph,
  # checked by emerge/compiler/invariants-engine.js, tiered by emerge/compiler/tier-contract.js. A module is fully specced
  # (specDepth 1.0) when it has a description, exports, a gate pipeline, behavioral contracts and error paths, and every
  # schema it references resolves. This file is the build contract: if the code is lost, it is rebuilt from here.
  # Phases: docs/2026-10-20-substrate-graph-traversal-chunking-gating-phasemap.spec (each phase names the modules it builds
  # in `blocks:`); per-phase specs: <owner>/phases/<map-id>/<phase>.phase + its .graph (written by MOD-PHASE-SPECS).
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        substrate
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-20T00:00:00Z
    status:      specced
    uuid:        nexus-substrate-spec-v1-0000-2026-1020-jamesbrooks-001
    origin: >-
      James, 2026-10-19: "i want to map the traversal agnostically, using invarants overtime, primitives, and principles"
      · 2026-10-20: "spec it. the chunking system. can you also spec the graphs, traversal, dynamic chunking, gating,"
      · 2026-10-20: "not phasemaps. full specs to build them. everything needs  to be speccced before built,so it can be rebuilt
      if lost. can you do that? what about specs, then phases then specced again with dag and related files for it, look at the
      handoff"
      The direction is his; the coder wrote the contracts below from the census of what exists (§8.6).
    purpose: >-
      Every domain Nexus works in (code, specs, phases, web pages, runs) is read into ONE graph shape through adapters, walked by ONE
      budgeted traversal, cut by ONE chunking contract, and judged by ONE gate verdict. Existing graphs, chunkers and gates are
      wrapped, never rebuilt beside (§8.6, §10.3).
    target_runtime: [node]
    language_stack: [javascript]
    paradigm: [SISO, deterministic, evidence-first, append-only]
    axioms: ["§0.1 evidence over memory", "§1.2 nothing fails silently", "§3.3 map before build", "§8.6 reuse before build",
      "§10.3 competing truth layers are a failure", "§0.3 nothing lost", "NC0 neutral core, evidence on every edge"]
    deps:
      - { name: js-yaml, version: ">=4.1.0", required: true, purpose: "schemas and nodes are YAML" }

    constraints:
      - id: SB-001
        description: "An edge without evidence (discovered by an adapter, declared by someone, or unknown) is refused."
        type: hard
        enforced_by: [GATE-SB-EVIDENCE]
      - id: SB-002
        description: "Existing graphs, chunkers and gates are read through adapters; no store is moved or copied by this spec."
        type: hard
        enforced_by: [GATE-SB-NO-COPY]
      - id: SB-003
        description: "A gate answers pass, fail or unknown; unknown is never counted as pass at any level."
        type: hard
        enforced_by: [GATE-SB-UNKNOWN]
      - id: SB-004
        description: "Every chunking strategy keeps the chunk laws (coverage once, order, stable keys, budget or forced-and-said)."
        type: hard
        enforced_by: [GATE-SB-CHUNK-LAWS]
      - id: SB-005
        description: "Every traversal is budgeted and deterministic; a cut names what was not visited."
        type: hard
        enforced_by: [GATE-SB-BUDGET]
      - id: SB-006
        description: "Nothing here calls a model. Deterministic first (docs/CLAUDE.md)."
        type: hard
        enforced_by: [GATE-SB-NO-MODEL]

  # ── Schemas — the primitives. Each has fields (the shape) and contracts/error paths (what makes a record invalid). ──────────
  schemas:

    - id: Block
      name: Block
      description: "One addressable thing in any domain — a file, a function, a phase, a DOM element, a chunk, a run."
      fields:
        id:        "string — the registry id where one exists (NM1), else domain:address hashed; stable across observations"
        kind:      "string — domain-neutral kind: module, function, phase, decision, element, chunk, run, spec, file"
        domain:    "string — the adapter that produced it: js, docs, page, phases, runs, loom"
        address:   "string — human-readable path inside its domain (lib/bus.js#emit · main › form › button \"Send\")"
        signature: "string — content hash or text signature; changes when the thing changes"
        name:      "string — its name or label"
        attrs:     "object — domain attributes (layer, status, box, z …), never required by the core"
        observedAt: "number — epoch ms of the observation that produced it"
      behavioral_contracts:
        - "id is unique within an observation; the same thing observed twice keeps its id"
        - "a block carries no behaviour; it is data"
      error_paths:
        - "missing id or domain → refused (SB-001's sibling rule: no anonymous blocks)"

    - id: Edge
      name: Edge
      description: "A typed relation between two blocks, with where it came from."
      fields:
        from:      "string — Block.id"
        to:        "string — Block.id"
        relation:  "string — contains, requires, calls, before, covers, crosses, causes, implements, proves"
        evidence:  "string — discovered | declared | unknown"
        by:        "string — the adapter (discovered) or the author (declared); null only for unknown"
        domain:    "string — the domain the edge was found in"
        weight:    "number — optional, a view's own weight (lattice), never invented"
        observedAt: "number — epoch ms"
      behavioral_contracts:
        - "evidence is required; unknown edges are kept and never counted as proof of completeness (NC0)"
      error_paths:
        - "missing evidence → refused by GATE-SB-EVIDENCE"
        - "from or to not a block of the same observation or a known view → kept as dangling, said"

    - id: Observation
      name: Observation
      description: "One read of one scope at one time; the append-only log entry everything learns from."
      fields:
        id:        "string — hash of scope + at + source"
        scope:     "string — what was read: a repo, a site key, a map, a run"
        at:        "number — epoch ms"
        source:    "string — the adapter and its version"
        blocks:    "Block[]"
        edges:     "Edge[]"
        cut:       "object — what the adapter could not read and why (budget, unreadable, unsupported)"
        prev:      "string — the id of the previous observation of this scope, or null"
      behavioral_contracts:
        - "appended, never edited; a later observation supersedes, the earlier stays (§0.3)"
        - "diff(prev, this) gives new, changed (signature moved), gone, same — by Block.id"
      error_paths:
        - "an observation larger than the store's limit → written in parts with one id, said"

    - id: Chunk
      name: Chunk
      description: "A block made by cutting an input for a consumer (a model, a reader, a gate)."
      fields:
        key:       "string — kind + qualified name (+ ordinal among same names); survives content inserted above (R6)"
        input:     "string — the Block.id of what was cut"
        span:      "object — { start, end } in the input's own units (lines, blocks, bytes)"
        strategy:  "string — code, docs, page, contract, payload"
        size:      "number — in the consumer's unit (tokens estimated, lines)"
        budget:    "number — the budget it was cut for"
        forced:    "boolean — true when one indivisible unit exceeds the budget"
        glyph:     "object — lib/chunk-glyph.js form: defines, calls, pulls in, announces"
      behavioral_contracts:
        - "the chunks of one input cover it exactly once, in order (R5)"
      error_paths:
        - "a plan that breaks coverage is replaced by plain windows and says so (code-intel R5 rule)"

    - id: Verdict
      name: Verdict
      description: "What one gate concluded about one subject."
      fields:
        gate:      "string — the gate's id"
        subject:   "string — Block.id judged"
        level:     "string — chunk, brick, file, phase, map, release"
        verdict:   "string — pass | fail | unknown"
        evidence:  "object[] — { check, result, kind: executed|static|declared|agent-claim, provenance }"
        residue:   "object[] — checks that could not run, each with why"
        children:  "string[] — the verdicts this one composes"
        at:        "number — epoch ms"
      behavioral_contracts:
        - "unknown when any required check is residue; pass needs every required check run and passed"
      error_paths:
        - "a verdict with pass and residue on a required check → refused by GATE-SB-UNKNOWN"

    - id: WalkResult
      name: WalkResult
      description: "What a traversal visited, in order, and what it did not."
      fields:
        start:     "string[] — Block.ids"
        visited:   "string[] — in visit order"
        edges:     "Edge[] — the edges followed"
        depthOf:   "object — Block.id → depth"
        cut:       "object — { budget, unvisited: n, frontier: Block.id[], why }"
        cycles:    "string[][] — cycles met (never followed twice)"
        order:     "string — bfs | dfs | topo"
        hash:      "string — of start + options + view versions; same inputs, same hash"
      behavioral_contracts:
        - "visited order is a pure function of the view and the options"
      error_paths:
        - "start not in the view → { visited: [], cut.why: 'start not found' }, never a throw"

  # ── Interfaces — what this spec stands on, as it is in the tree today (contracts read from source, 2026-10-20) ─────────────
  interfaces:

    - id: IF-PHASE-DAG
      name: phase-dag
      path: lib/phase-dag.js
      description: "DG3 — every phase and decision of every phasemap in one DAG (0.60.172)."
      exports: ["build(maps, { mapped, crossMapConflicts }) → Dag", "slice(dag, key) → Slice", "lines(slice) → string[]", "problems(dag, key) → string[]"]
      behavioral_contracts: ["refs resolve by map::key, same-map key, unique id across maps, or same-map prefix", "cycles by Tarjan, layers by Kahn"]
      error_paths: ["an ambiguous bare ref (two maps define it) is dangling — name it map::key"]

    - id: IF-PHASE-GRAPH
      name: phase-graph
      path: lib/phase-graph.js
      description: "DG2 — one phase's files (changes, uses, used-by) and boundary crossings (0.60.147)."
      exports: ["graphFor({ phase, map, mapped, mapText, depsGate, systemOf, baselineEdges }) → PhaseGraph", "boundarySystemOf(root) → fn", "baselineEdges(root) → Edge[]"]
      behavioral_contracts: ["no mapping → ready:false with the remedy; never an empty graph called ready"]
      error_paths: ["a mapping with no files → missing names it"]

    - id: IF-PHASE-MAP-AUTO
      name: phase-map-auto
      path: lib/phase-map-auto.js
      description: "MP1 — a phase mapped to its files, requires and consumers with no model."
      exports: ["mapPhase(phase, env) → Mapped", "envFromTree(root, { specsOf, maxFiles }) → Env", "forMaps(root, maps, opts) → { byKey }"]
      behavioral_contracts: ["source none is the only case a model may be asked (MP4)"]
      error_paths: ["an unreadable file is skipped and counted"]

    - id: IF-PIPELINE-NODES
      name: pipeline-nodes
      path: lib/pipeline-nodes.js
      description: "The .phase, .graph and .gate node builders (0.60.162)."
      exports: ["phaseNode({ id, map, repo, layer, status, files, depends_on, blocks, spec, graph }) → Envelope", "graphNode(graph, { repo, kind }) → Envelope", "writeNode(envelope, destDir) → path"]
      behavioral_contracts: ["a .graph is keyed by its hash and immutable; a .phase is overwritten with its latest state"]
      error_paths: ["graphNode drops graph.dag (found 2026-10-20) — MOD-PHASE-SPECS requires it kept"]

    - id: IF-SYSTEM-BOUNDARY
      name: system-boundary
      path: lib/system-boundary.js
      description: "DB1 — every require that crosses between systems, with a ratchet."
      exports: ["scan({ root }) → { files, crossings }", "census({ root })", "check({ root, baseline }) → { ok, added, closed }"]
      behavioral_contracts: ["a require built from a variable is not seen (said)"]
      error_paths: ["an unreadable baseline → check refuses, said"]

    - id: IF-LOOM
      name: loom-registry
      path: loom/
      description: "Loom's registry and maps — components, hooks, wires as require/consumer edges."
      exports: ["maps FILES [[path, id, requires]] and CONSUMERS [[from, to, why]] per map", "registry query and impact (nexus_loom_query, nexus_loom_impact)"]
      behavioral_contracts: ["a wire is a real require or a named HTTP door; scanners check declared against served"]
      error_paths: ["a declared wire with no source edge is reported by loom/scanners"]

    - id: IF-REQUIRE-GRAPH
      name: require-graph
      path: lib/require-graph.js
      description: "Static require/import resolution (from cli/find-orphans.js)."
      exports: ["resolveRequireTarget(fromFile, spec, root) → path | null"]
      behavioral_contracts: ["static references only, said"]
      error_paths: ["unresolvable → null"]

    - id: IF-CFR-GRAPH
      name: cfr-causal-graph
      path: intelligence/cfr/graph.js
      description: "The causal graph — every ledger entry a node; edges from causedBy, sessionId, jobId."
      exports: ["CausalGraph — nodes and causal edges over the ledger"]
      behavioral_contracts: ["edges come only from fields the events carry"]
      error_paths: ["an event with no causal fields is an isolated node"]

    - id: IF-LATTICE
      name: crystal-lattice-edges
      path: meta/crystal-lattice.js
      description: "lattice_edges — weighted edges between nodes, success up, failure down, decaying."
      exports: ["_edgeKey(from, to)", "lattice update after a compartment resolution"]
      behavioral_contracts: ["weight floor 0.05; decay every 6 h by LATTICE_DECAY_RATE"]
      error_paths: ["JAA unavailable → no write, said in the return"]

    - id: IF-PAGE-BLOCKS
      name: page-blocks
      path: clear-glass/src/page/blocks.js
      description: "The page as blocks with semantic addresses, box and z (0.60.174)."
      exports: ["pageScript(opts) → string", "normalize(raw, opts) → Page", "siteKey(url) → string"]
      behavioral_contracts: ["ids stable across visits and insertions above"]
      error_paths: ["over budget → cut said in note"]

    - id: IF-CHUNKERS
      name: existing-chunkers
      path: lib/code-intel/chunker.js
      description: "The chunkers that become strategies — code-intel (code), lib/chunker (docs), page-map chunk (pages), contract-adapters (bricks)."
      exports: ["planChunks(content, language) → { chunks, symbols, family, fallback }", "chunkDocument(text, opts) → chunks", "page-map chunk(page, { maxChars }) → chunks", "contract-adapters decompose on learned budget"]
      behavioral_contracts: ["code-intel R1–R6 as written in its header"]
      error_paths: ["a plan that breaks coverage → plain windows, said"]

    - id: IF-CHUNK-GLYPH
      name: chunk-glyph
      path: lib/chunk-glyph.js
      description: "The most compressed semantic form of a chunk."
      exports: ["glyph(chunkText, opts) → Glyph"]
      behavioral_contracts: ["keeps defines, calls, pulls-in, announces; drops spelling"]
      error_paths: ["unparseable → a text glyph, said"]

    - id: IF-GATES
      name: existing-gates
      path: lib/step-gate.js
      description: "The gates that become adapters — step-gate, contract-gates, sigma-gate, phase-deps-gate (DG1), phase-graph (DG2), phase-dag (DG3), the boundary ratchet, test-first, verify-first, proposal-evidence."
      exports: ["step-gate gate(step, subject, { causedBy }) → emits step.passed | step.blocked", "verify-first check() → verified | failed | shallow", "proposal-evidence → REGRESSION | fixed | unchanged"]
      behavioral_contracts: ["each keeps its own decision; the adapter only reshapes the verdict"]
      error_paths: ["a gate that cannot say unknown is named by GW0"]

    - id: IF-QUALITY-STREAM
      name: quality-stream
      path: lib/quality-stream.js
      description: "GQ1 (OPEN, docs/2026-10-19-solid-build-foundation-phasemap.spec) — the SISO quality gate."
      exports: ["check.requested → one gate per applicable check → check.result"]
      behavioral_contracts: ["an un-runnable check is residue, never a pass"]
      error_paths: ["not built yet — MOD-GATE waits on it (declared, not assumed)"]

    - id: IF-BOUNDARIES
      name: learned-budgets
      path: cortex/core/raid/contract-gates.js
      description: "Learned per-provider token budgets: the Boundaries object in cortex/core/raid/contract-gates.js (budget = 75th percentile of passes, capped below the first failure size; corrected 2026-10-20, it was declared as lib/boundaries.js, which does not exist)."
      exports: ["budget(provider, kind) → number | null"]
      behavioral_contracts: ["a budget is a prediction learned from outcomes"]
      error_paths: ["no budget yet → null (the brick goes to the largest learned budget first, said)"]

    - id: IF-INVARIANT
      name: invariant
      path: lib/core/invariant.js
      description: "Specced in docs/belief-loop.spec (MOD-INVARIANT) — the invariant kinds checked against an observation."
      exports: ["check(invariant, observation) → holds | broken | not-applicable", "stable(scope) → Invariant[]"]
      behavioral_contracts: ["a cross-spec dependency, declared here so this graph has no BLACK node; its contract lives in belief-loop.spec"]
      error_paths: ["not built yet — MOD-TRAVERSE-GUIDED falls back to walk(), said"]

  # ── Modules ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  modules:

    - id: MOD-GRAPH-CENSUS
      name: graph-census
      uuid: nexus-substrate-graph-census-v1-0000-2026-1020-001
      path: lib/graph-census.js
      phase: GR0_graph_census
      description: >-
        Lists every graph in the tree from evidence: its node kinds, edge kinds, store, writers (files that insert into it), readers,
        row counts on the live data, and what its edges rest on. Feeds docs/atlases/graph-census.md.
      deps: [{ name: system-boundary }, { name: loom-registry }]
      exports:
        - "census({ root, dataDir }) → { graphs: [{ id, store, nodeKinds, edgeKinds, writers, readers, rows, evidence }], unknown: [] }"
        - "toMarkdown(census) → string"
      gate_pipeline:
        - "GATE-GC-001: root → find stores by name (graph.json, lattice_edges, causal, registry, *_edges, *_nodes) and by writer"
        - "GATE-GC-002: each store → writers (insert/write call sites) and readers (query/read call sites) from the tree"
        - "GATE-GC-003: each store → row counts from dataDir (absent data → rows: null, said)"
        - "GATE-GC-004: assemble census; a store found by name with no writer → unknown[]"
      behavioral_contracts:
        - "read-only; writes nothing but its markdown output when asked"
        - "every count comes from a read, never a constant"
      error_paths:
        - "dataDir missing → counts null with why; the census still lists the graphs"
      acceptance: ["lists the ten graphs of the 2026-10-20 census with real counts on James's data/", "a new *_edges table added appears"]

    - id: MOD-GRAPH
      name: graph
      uuid: nexus-substrate-graph-v1-0000-2026-1020-001
      path: lib/core/graph.js
      phase: GR1_graph_primitive
      description: >-
        The primitives Block, Edge, Observation (schemas above) with validation and the append-only observation log: observe() writes,
        diff() compares two observations of a scope, latest() reads. The log is JSONL per scope under the system's data dir; nothing
        is ever edited in place.
      deps: [{ name: graph-census }]
      schema_refs: [Block, Edge, Observation]
      exports:
        - "block({ id, kind, domain, address, signature, name, attrs }) → Block"
        - "edge({ from, to, relation, evidence, by, domain }) → Edge"
        - "observe({ scope, source, blocks, edges, cut }, { dir }) → Observation"
        - "latest(scope, { dir }) → Observation | null"
        - "diff(prev, next) → { new: id[], changed: id[], gone: id[], same: number }"
        - "validate(record, kind) → { ok, errors }"
      gate_pipeline:
        - "GATE-GR-001: input → validate against the schema (Block/Edge/Observation)"
        - "GATE-GR-002: edges → GATE-SB-EVIDENCE (evidence and by present)"
        - "GATE-GR-003: observation → id = hash(scope + at + source); prev = latest(scope).id"
        - "GATE-GR-004: append one JSONL line (atomic append; a torn line on read is skipped and counted)"
        - "GATE-GR-005: emit graph.observed { scope, id, blocks, edges, new, changed, gone }"
      behavioral_contracts:
        - "diff is by Block.id; changed means the signature moved"
        - "an observation with no blocks is legal (an empty scope) and says so"
        - "never deletes an observation; compaction (later) archives under .archive with its index (§0.3)"
      error_paths:
        - "invalid record → { ok:false, errors } and nothing written"
        - "write failure → emits graph.observe.failed with the error; caller decides"
        - "torn trailing line on read → skipped, counted in latest().torn"
      acceptance: ["schema round trip", "an edge without evidence is refused", "two observations diff into new/changed/gone"]

    - id: MOD-GRAPH-VIEWS
      name: graph-views
      uuid: nexus-substrate-graph-views-v1-0000-2026-1020-001
      path: lib/core/views/index.js
      phase: GR2_graph_views
      description: >-
        Read-only adapters that project existing graphs into Block/Edge without moving their stores: loom (loom/maps FILES +
        CONSUMERS), requires (require-graph over the tree), phases (phase-dag), causal (cfr graph), lattice (lattice_edges),
        page (Clear Glass blocks). Each view declares its evidence: loom wires 'declared' by loom; requires 'discovered' by
        js-require-scan; phase depends_on 'declared' by the map author, inferred edges 'discovered' by phase-map-auto; causal
        'discovered' from event fields; lattice 'discovered' with its weight; page 'discovered' by semantic-tree.
      deps: [{ name: graph }, { name: loom-registry }, { name: require-graph }, { name: phase-dag }, { name: cfr-causal-graph }, { name: crystal-lattice-edges }, { name: page-blocks }]
      schema_refs: [Block, Edge]
      exports:
        - "views() → [{ id, domain, version, describe }]"
        - "read(viewId, { root, scope, limit }) → { blocks, edges, cut }"
        - "idOf(viewId, nativeId) → Block.id (registry id when one exists, else domain:address)"
      gate_pipeline:
        - "GATE-GV-001: viewId → the adapter (unknown view → error listing the views)"
        - "GATE-GV-002: adapter → native read through the interface's own export, never its store directly"
        - "GATE-GV-003: native → Block/Edge with evidence set per the description above"
        - "GATE-GV-004: what the adapter cannot see → cut (e.g. variable requires: unknown)"
      behavioral_contracts:
        - "views never write"
        - "the same component reached through two views has one Block.id (registry id join, NM1)"
      error_paths:
        - "the source is unavailable (JAA down, no data) → { blocks: [], edges: [], cut: { why } }"
      acceptance: ["loom and requires views agree on ids for lib/bus.js", "each view's counts match its source's own counts"]

    - id: MOD-TRAVERSE
      name: traverse
      uuid: nexus-substrate-traverse-v1-0000-2026-1020-001
      path: lib/core/traverse.js
      phase: TV1_traversal_primitive
      description: >-
        The one walk. Given a view (or a union of views), start blocks and options, visits blocks in a deterministic order
        (bfs by default; ties broken by Block.id), follows only the named relations in the named direction, stops at depth or
        budget, never visits a block twice, records cycles met. phase-dag slice(), loom impact and causal-lookup become callers.
      deps: [{ name: graph }, { name: graph-views }]
      schema_refs: [WalkResult, Block, Edge]
      exports:
        - "walk({ view, start, direction: 'out'|'in'|'both', relations, depth, budget, order: 'bfs'|'dfs'|'topo' }) → WalkResult"
        - "path(view, from, to, { relations, budget }) → Edge[] | null"
        - "reach(view, start, opts) → Set<Block.id>"
      gate_pipeline:
        - "GATE-TV-001: options → defaults (direction out, depth 3, budget 2000 blocks, order bfs)"
        - "GATE-TV-002: start ids → present in view? missing ones listed in cut"
        - "GATE-TV-003: walk with a sorted frontier; visited set; cycle record"
        - "GATE-TV-004: budget reached → stop, cut = { budget, unvisited, frontier, why: 'budget' }"
        - "GATE-TV-005: WalkResult.hash = sha1(start + options + view versions)"
      behavioral_contracts:
        - "same view version + same options → same visited order (deterministic)"
        - "the budget counts blocks visited; edges are not charged"
        - "topo order refuses a cyclic subgraph and returns the cycle"
      error_paths:
        - "unknown relation → error naming the view's relations"
        - "start not found → empty visited, cut.why 'start not found'"
      acceptance: ["phase-dag slice, loom impact and causal-lookup answers unchanged through it", "a budget cut names the frontier"]

    - id: MOD-TRAVERSE-CONTEXT
      name: traverse-context
      uuid: nexus-substrate-traverse-context-v1-0000-2026-1020-001
      path: lib/core/traverse.js
      phase: TV3_traversal_as_context
      description: >-
        An agent's context as a traversal: from the task's blocks walk to what they use (out, requires/calls, depth 2) and what
        uses them (in, depth 1), project each visited block as its glyph, add in walk order until the token budget, and say what
        was cut. Used by lib/coder-brief.js's context part.
      deps: [{ name: traverse }, { name: chunk-glyph }]
      exports:
        - "contextFor({ view, task, budgetTokens }) → { blocks: [{ id, glyph }], tokens, cut }"
      gate_pipeline:
        - "GATE-TC-001: task → start blocks (the files/functions the phase changes)"
        - "GATE-TC-002: walk out depth 2 and in depth 1"
        - "GATE-TC-003: each block → glyph; accumulate until budgetTokens"
        - "GATE-TC-004: cut lists the blocks not included and their total tokens"
      behavioral_contracts:
        - "every symbol the task's files call is included before anything that only uses them"
      error_paths:
        - "no start blocks → empty context with why (the phase names no files)"
      acceptance: ["a brief built this way is smaller than today's for the same phase and names every called symbol"]

    - id: MOD-TRAVERSE-GUIDED
      name: traverse-guided
      uuid: nexus-substrate-traverse-guided-v1-0000-2026-1020-001
      path: lib/core/traverse.js
      phase: TV2_invariant_guided_traversal
      description: >-
        A walk that skips what is known: at each block, the stable invariants of its scope (belief-loop MOD-INVARIANT) are checked
        against the current observation; if all hold, the block is marked 'held' and not descended; if any broke, it is descended
        and the broken invariants are reported. The saving is reported (blocks not visited).
      deps: [{ name: traverse }, { name: invariant }]
      exports:
        - "guidedWalk({ view, start, invariants, observation, budget }) → WalkResult & { held: id[], broken: [{ id, invariant }] }"
      gate_pipeline:
        - "GATE-TG-001: block → its scope's stable invariants (none → descend)"
        - "GATE-TG-002: check each against the observation (holds | broken | not-applicable)"
        - "GATE-TG-003: all hold → held; any broken → descend, report"
      behavioral_contracts:
        - "a block with no stable invariants is always descended (nothing known yet)"
        - "findings equal a full walk's findings on the same data (no silent misses)"
      error_paths:
        - "invariant store unavailable → falls back to walk(), said"
      acceptance: ["second walk of an unchanged repo visits a fraction and reports the same", "a planted break is found"]

    - id: MOD-GRAPH-QUERY
      name: graph-query
      uuid: nexus-substrate-graph-query-v1-0000-2026-1020-001
      path: idearium/api/index.js
      phase: GR3_graph_query_surface
      description: >-
        One door over every view: GET /api/graph/views · GET /api/graph/neighbours?view&id · GET /api/graph/path?from&to ·
        GET /api/graph/impact?id&views · POST /api/graph/match { pattern }; commands `graph views|neighbours|path|impact|match`;
        a Graph section in the Toolbox (idearium/ui/js/graph-panel.js). Pattern language: `(a:kind)-[relation]->(b:kind)` with
        optional `where a.name ~ "x"`.
      deps: [{ name: traverse }, { name: graph-views }]
      exports:
        - "routes: repo-less GET/POST under /api/graph/*"
        - "commands: graph.views, graph.neighbours, graph.path, graph.impact, graph.match (idearium/cli/route-commands.js)"
        - "ui: renderGraphPanel(state) in idearium/ui/js/graph-panel.js"
      gate_pipeline:
        - "GATE-GQ-001: request → view ids valid"
        - "GATE-GQ-002: traverse with the request's budget (default 500, max 5000)"
        - "GATE-GQ-003: response with the WalkResult's cut always present"
      behavioral_contracts:
        - "read-only (CAPS.READ_IDEAS)"
        - "impact across views unions their reach and says which view each block came from"
      error_paths:
        - "pattern does not parse → 400 with the parse position"
      acceptance: ["what changing lib/bus.js reaches, across loom + requires + phases, in one call", "the panel tested in Clear Glass"]

    - id: MOD-CHUNK
      name: chunk
      uuid: nexus-substrate-chunk-v1-0000-2026-1020-001
      path: lib/core/chunk.js
      phase: CH0_chunk_census_and_contract
      description: >-
        The one chunking contract: chunk(input, { domain, budget, purpose }) picks the domain's strategy, runs it, checks the laws,
        and returns Chunks (blocks). The census of the eight existing chunkers is part of this module's header: four become
        strategies (code, docs, page, contract), emerge/chunk stays a payload format, chunk-build-orchestrator a retry policy,
        seam chunk-lifecycle a state machine, chunk-service the RAID entry that calls this.
      deps: [{ name: graph }, { name: existing-chunkers }, { name: chunk-glyph }]
      schema_refs: [Chunk]
      exports:
        - "chunk(input, { domain, budget, purpose }) → { chunks: Chunk[], laws: { coverage, order, keys, budget }, strategy }"
        - "strategies() → [{ domain, strategy, unit }]"
        - "register(domain, strategyFn) → void"
      gate_pipeline:
        - "GATE-CH-001: domain → strategy (unknown domain → error listing strategies)"
        - "GATE-CH-002: strategy(input, budget) → raw chunks"
        - "GATE-CH-003: laws: coverage once, order, unique stable keys, size ≤ budget or forced"
        - "GATE-CH-004: a law broken → fall back to plain windows, laws report says which law and why"
        - "GATE-CH-005: glyph per chunk"
      behavioral_contracts:
        - "joining the chunks' spans gives the input back exactly"
        - "the same input + budget → the same chunks and keys"
      error_paths:
        - "empty input → zero chunks, coverage trivially true"
        - "a strategy throws → plain windows, said"
      acceptance: ["the contract's schema", "a chunk is a Block"]

    - id: MOD-CHUNK-STRATEGIES
      name: chunk-strategies
      uuid: nexus-substrate-chunk-strategies-v1-0000-2026-1020-001
      path: lib/core/chunk-strategies.js
      phase: CH1_strategies_behind_the_contract
      description: >-
        The four strategies wrapped behind MOD-CHUNK, their own behaviour unchanged: code → code-intel planChunks; docs →
        lib/chunker chunkDocument; page → page-map chunk; contract → the brick split contract-adapters already does.
      deps: [{ name: chunk }, { name: existing-chunkers }]
      exports:
        - "code(input, budget) → raw chunks"
        - "docs(input, budget) → raw chunks"
        - "page(input, budget) → raw chunks"
        - "contract(input, budget) → raw chunks"
      gate_pipeline:
        - "GATE-CS-001: each strategy → its existing function with the input's text/blocks"
        - "GATE-CS-002: output → Chunk shape (key, span, size) without changing its cuts"
      behavioral_contracts:
        - "each wrapped chunker's existing tests pass unchanged"
      error_paths:
        - "a strategy whose output cannot be mapped to spans → said, plain windows"
      acceptance: ["each strategy reachable through chunk()", "existing chunker tests unchanged"]

    - id: MOD-CHUNK-LAWS
      name: chunk-laws
      uuid: nexus-substrate-chunk-laws-v1-0000-2026-1020-001
      path: tests/modules/test-chunk-laws.test.js
      phase: CH2_chunk_laws
      description: "One law suite run over every registered strategy with fixtures per domain; reports the strategy and law by name."
      deps: [{ name: chunk-strategies }]
      exports: ["the test file, registered in tests/modules/run-all.js"]
      gate_pipeline:
        - "GATE-CL-001: for each strategy × fixture → chunk()"
        - "GATE-CL-002: assert coverage, order, stable keys after inserting content above, budget or forced"
      behavioral_contracts: ["a new strategy is tested by registering, no new test code"]
      error_paths: ["a strategy that breaks a law fails with strategy + law + fixture named"]
      acceptance: ["all four strategies run", "a strategy that drops a line fails it"]

    - id: MOD-CHUNK-INSPECTOR
      name: chunk-inspector
      uuid: nexus-substrate-chunk-inspector-v1-0000-2026-1020-001
      path: idearium/ui/js/chunk-inspector.js
      phase: CH3_chunk_inspector
      description: "GET /api/chunk?path&domain&budget · `chunk <path> [--domain] [--budget]` · a Toolbox section showing keys, spans, sizes, glyphs."
      deps: [{ name: chunk }]
      exports: ["route repo.chunk (read)", "command chunk", "ui renderChunkInspector"]
      gate_pipeline: ["GATE-CI-001: path → read through the repo layer", "GATE-CI-002: chunk() → response with the laws report"]
      behavioral_contracts: ["read-only"]
      error_paths: ["path outside the repo → 400"]
      acceptance: ["tested in Clear Glass"]

    - id: MOD-DYNAMIC-CHUNK
      name: dynamic-chunk
      uuid: nexus-substrate-dynamic-chunk-v1-0000-2026-1020-001
      path: lib/core/chunk.js
      phase: DK1_dynamic_chunking
      description: >-
        Size by the consumer and the proof. Before dispatch: budget = boundaries.budget(routed provider, kind) (MF1's model) and a
        unit over it is cut by its domain strategy at that budget (DC1 is the contract-brick case). After a gate fails: the failed
        unit is split along what failed — the declarations the failing check covers (lib/test-map.js direct links) form one unit,
        the rest another — not in halves. A unit kind that passed first time at a size N times in a row may be merged with its
        neighbour next plan. _splitDeeper stays the safety net. Every resize is a run row.
      deps: [{ name: chunk }, { name: learned-budgets }, { name: existing-gates }]
      exports:
        - "planUnits(input, { provider, kind }) → Chunk[]"
        - "splitOnFailure(unit, verdict) → Chunk[]"
        - "mergeCandidates(units, history) → [[key, key]]"
      gate_pipeline:
        - "GATE-DK-001: provider + kind → budget (null → strategy default, said)"
        - "GATE-DK-002: input → chunk(input, { budget }) → units"
        - "GATE-DK-003: on gate fail → covered declarations of the failing checks → split"
        - "GATE-DK-004: emit chunk.resized { unit, from, to, why }"
      behavioral_contracts:
        - "a split never loses coverage (the chunk laws hold for the result)"
        - "a merge is only proposed, applied on the next plan"
      error_paths:
        - "no coverage map for the failing test → fall back to _splitDeeper, said"
      acceptance: ["a file over a 3B model's budget plans as ≥2 units", "a failure in one function splits only its unit"]

    - id: MOD-GRANULARITY
      name: granularity
      uuid: nexus-substrate-granularity-v1-0000-2026-1020-001
      path: lib/core/chunk.js
      phase: DK2_learned_granularity
      description: >-
        Counts outcomes per (domain, chunk kind, size band, model): first-pass, retried, split. preferredSize() returns the band with
        the best first-pass rate given at least 5 samples; DK1 reads it before the strategy default. Written as crystals once the
        belief loop has them (belief-loop MOD-CRYSTAL), until then a JSON count file under the system data dir.
      deps: [{ name: dynamic-chunk }]
      exports:
        - "record({ domain, kind, size, model, outcome }) → void"
        - "preferredSize({ domain, kind, model }) → { size, samples, why } | null"
      gate_pipeline: ["GATE-GN-001: outcome → band = 2^floor(log2(size))", "GATE-GN-002: increment counts", "GATE-GN-003: preferredSize with min samples 5"]
      behavioral_contracts: ["fewer than 5 samples → null (no guess)", "counts decay by half every 30 days"]
      error_paths: ["count file unreadable → set aside as .bad, start fresh, said"]
      acceptance: ["after outcomes the planned size moves toward the passing band and says why"]

    - id: MOD-GATE-CENSUS
      name: gate-census
      uuid: nexus-substrate-gate-census-v1-0000-2026-1020-001
      path: lib/gate-census.js
      phase: GW0_gate_census
      description: "Every gate: what it guards, verdict shape, evidence kept, provenance kept, can-say-unknown, override and who may."
      deps: [{ name: existing-gates }]
      exports: ["census({ root }) → { gates: [{ id, path, guards, verdicts, evidence, provenance, unknown, override }] }", "toMarkdown(census)"]
      gate_pipeline: ["GATE-GW0-001: known gate files + grep for emits of *.passed/*.blocked and 409 codes", "GATE-GW0-002: join cos/spec/check-catalogue.spec ids"]
      behavioral_contracts: ["read-only; every field from source"]
      error_paths: ["a gate found by its event with no file → unknown[]"]
      acceptance: ["the twelve gates listed with shapes; those that cannot say unknown named"]

    - id: MOD-GATE
      name: gate
      uuid: nexus-substrate-gate-v1-0000-2026-1020-001
      path: lib/core/gate.js
      phase: GW1_gate_primitive
      description: >-
        gate(subject, checks, { level }) runs each check (a function returning { result: pass|fail, evidence } or throwing →
        residue), composes the Verdict (schema above), emits gate.passed / gate.blocked / gate.unknown on nexus-bus with the
        causedBy of the step before (step-gate's rule), and returns it. adapters.<name>(...) reshape existing gates' answers into
        Verdicts without changing their decisions. Rides SISO Event→Gate→Stream; GQ1 is its quality instance.
      deps: [{ name: graph }, { name: gate-census }, { name: quality-stream }]
      schema_refs: [Verdict]
      exports:
        - "gate(subject, checks, { level, required }) → Verdict"
        - "adapters: { stepGate, dg1, dg2, dg3, ratchet, testFirst, verifyFirst, proposalEvidence } → (theirAnswer) → Verdict"
      gate_pipeline:
        - "GATE-GT-001: each check → run with timeout; throw/timeout → residue { check, why }"
        - "GATE-GT-002: required check in residue → unknown; any required fail → fail; else pass"
        - "GATE-GT-003: emit gate.<verdict> with causedBy"
      behavioral_contracts:
        - "an adapter's verdict equals the wrapped gate's decision on the same input"
        - "unknown is never coerced to pass"
      error_paths:
        - "no checks → unknown with residue 'no checks'"
      acceptance: ["step-gate, DG2 and verify-first give the same decisions through it", "an un-runnable check is residue"]

    - id: MOD-GATE-LEVELS
      name: gate-levels
      uuid: nexus-substrate-gate-levels-v1-0000-2026-1020-001
      path: lib/core/gate.js
      phase: GW2_gates_at_every_level
      description: >-
        compose(level, childVerdicts, ownChecks): chunk → brick → file → phase → map → release. fail if any child fails or an own
        check fails; unknown if any child is unknown or an own required check is residue; else pass. The phase build records the
        tree on its run rows; a release over a non-pass phase is refused with the chain.
      deps: [{ name: gate }, { name: chunk-strategies }]
      exports: ["compose(level, children, ownChecks) → Verdict", "tree(rootVerdict) → nested Verdicts"]
      gate_pipeline: ["GATE-GL-001: children → worst of (fail > unknown > pass)", "GATE-GL-002: own checks → gate()", "GATE-GL-003: combine"]
      behavioral_contracts: ["unknown below makes unknown above, never pass"]
      error_paths: ["a child verdict missing → unknown with residue naming it"]
      acceptance: ["a phase with one unknown chunk is unknown", "a release over a failing phase is refused with the chain"]

    - id: MOD-GATE-PANEL
      name: gate-panel
      uuid: nexus-substrate-gate-panel-v1-0000-2026-1020-001
      path: idearium/ui/js/gate-panel.js
      phase: GW3_gate_panel
      description: "GET /api/gates/:runId · `gates <run|phase>` · a Toolbox section drawing the gate tree with evidence and residue."
      deps: [{ name: gate-levels }]
      exports: ["route gates.tree (read)", "command gates", "ui renderGatePanel"]
      gate_pipeline: ["GATE-GP-001: runId → stored verdict tree", "GATE-GP-002: render"]
      behavioral_contracts: ["read-only"]
      error_paths: ["run without verdicts → says the run predates the gate tree"]
      acceptance: ["tested in Clear Glass"]

    - id: MOD-PHASE-SPECS
      name: phase-specs
      uuid: nexus-substrate-phase-specs-v1-0000-2026-1020-001
      path: emerge/compiler/phase-specs.js
      phase: PS1_phase_specs
      description: >-
        The step after a spec and its phases (his order: specs, then phases, then specced again with the dag and related files).
        For every phase of a phasemap: resolve its `blocks:` against its `spec:` (each must be a module/schema/interface id of that
        spec's knowledge graph, emerge kg-builder), map its files (phase-map-auto: changes, uses, used-by), build its graph
        (phase-graph graphFor) with its DAG slice (phase-dag slice over ALL maps), and write two nodes beside its owner system
        (handoff 2026-10-19 PN1): <owner>/phases/<map-id>/<phase>.phase (authored: id, map, layer, status, files, depends_on,
        blocks, spec, graph hash) and <owner>/phases/<map-id>/graph/<phase>-<hash>.graph (derived: nodes with roles, edges, crossings, dag).
        Owner = lib/phase-plan.js targetSystem over the phase's files; core's home is lib/. check() re-derives and reports drift.
        It lives in emerge (the spec compiler's system): from lib/ its require of emerge's kg-builder would be a new upward
        crossing (lib/system-boundary.js ratchet); from emerge, its uses of lib/ are the allowed system-uses-kernel kind.
      deps: [{ name: phase-dag }, { name: phase-graph }, { name: phase-map-auto }, { name: pipeline-nodes }]
      exports:
        - "write({ root, map, mapsDir, out }) → [{ phase, owner, phaseFile, graphFile, ready, graphHash, blocks: { resolved, missing } }]"
        - "check({ root, map, mapsDir, out }) → [{ phase, drift: [] }]"
        - "cli: node emerge/compiler/phase-specs.js <map.spec> [--check]"
      gate_pipeline:
        - "GATE-PS-001: map → phases (lib/phase-files) and its spec path from each phase's spec:"
        - "GATE-PS-002: spec → kg-builder build() → node ids; every block resolves or is listed missing"
        - "GATE-PS-003: all maps → phase-dag build(); phase → slice() + lines()"
        - "GATE-PS-004: phase → mapPhase (files, requires, consumers) → graphFor(...) + dag"
        - "GATE-PS-005: owner → dir; writeNode(.graph) then writeNode(.phase with graph hash)"
      behavioral_contracts:
        - "deterministic: the same tree and maps give the same payloads (the envelope's exported_at is the only field that moves)"
        - "a phase whose blocks do not resolve is written with blocks.missing and reported, never silently"
        - "the .graph keeps the dag slice (pipeline-nodes graphNode keeps graph.dag)"
      error_paths:
        - "spec missing or unparseable → every phase of the map reports spec_unreadable; nothing written for it"
        - "phase with no files → graph ready:false with graphFor's remedy, written as such"
      acceptance: ["every phase of the two 2026-10-20 maps has a .phase and .graph; blocks all resolve; check() reports no drift on a second run"]

  # ── Events ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  events:
    graph:
      - "graph.observed { scope, id, blocks, edges, new, changed, gone }"
      - "graph.observe.failed { scope, error }"
    traverse:
      - "traverse.cut { hash, budget, unvisited, why }"
    chunk:
      - "chunk.planned { input, strategy, chunks, laws }"
      - "chunk.law.broken { input, strategy, law, why }"
      - "chunk.resized { unit, from, to, why }"
    gate:
      - "gate.passed { gate, subject, level, causedBy }"
      - "gate.blocked { gate, subject, level, causedBy, evidence }"
      - "gate.unknown { gate, subject, level, causedBy, residue }"
    phase_specs:
      - "phase.spec.written { map, phase, owner, graphHash, missingBlocks }"

  # ── Enforcement ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  enforcement:
    gates:
      - { id: GATE-SB-EVIDENCE, name: edge-evidence, severity: fatal, check: "every Edge has evidence and by (unless unknown)", on_failure: "record refused" }
      - { id: GATE-SB-NO-COPY, name: views-not-copies, severity: fatal, check: "graph-views modules import interfaces, never write their stores", on_failure: "review refuses" }
      - { id: GATE-SB-UNKNOWN, name: unknown-not-pass, severity: fatal, check: "no Verdict is pass with required residue; compose never lifts unknown", on_failure: "verdict refused" }
      - { id: GATE-SB-CHUNK-LAWS, name: chunk-laws, severity: fatal, check: "tests/modules/test-chunk-laws.test.js passes for every strategy", on_failure: "suite red" }
      - { id: GATE-SB-BUDGET, name: budgeted-walks, severity: fatal, check: "walk() without a budget uses the default; a cut always names the frontier", on_failure: "suite red" }
      - { id: GATE-SB-NO-MODEL, name: no-model, severity: fatal, check: "no module of this spec requires a model client (repo-agent, model-door, ollama)", on_failure: "build failure" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles in emerge's kg-builder: every module and schema at specDepth 1.0, no BLACK node, invariants valid"
    - "per module: its acceptance lines above, each a named test in the phase that builds it"
