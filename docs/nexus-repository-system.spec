spec:
  meta:
    name:        nexus-repository-system
    version:     1.0.0
    status:      proposed
    author:      james-brooks
    compiled_by: claude               # dictated by james, transcribed/structured here — not claude's own design, per blocks.yaml's own "seeded by claude, not james" convention
    created_at:  2026-09-15T00:00:00Z
    schema_family: repository.*
    primary_identity: repository
    uuid:        nexus-export-schema-repository
    purpose: >
      Makes an entire software repository addressable, traversable,
      verifiable, mutable, executable, and recoverable by NEXUS without
      requiring an agent to load the repository into model context. The
      repository is represented as a structured graph backed by
      deterministic indexes and verified source chunks. The model no
      longer needs to carry the repository — it queries the repository's
      topology, the deterministic system resolves the address, the work
      surface supplies the minimum source, the model reasons, the tool
      executes, the compartment isolates, Guardian verifies, Git
      preserves, the atlas remaps.

  # ── Required system capabilities (§1) ───────────────────────────────────
  required_capabilities:
    - repository discovery
    - repository ingestion
    - repository identity
    - repository mapping
    - file discovery
    - language detection
    - parsing
    - structural decomposition
    - chunking
    - symbol indexing
    - semantic indexing
    - component discovery
    - hook discovery
    - wire discovery
    - dependency traversal
    - impact analysis
    - work-surface resolution
    - deterministic modification
    - verification
    - Git persistence
    - isolated execution
    - snapshots
    - incremental re-indexing
    - failure visibility
    - atlas regeneration

  # ── Core axiom (§2) ──────────────────────────────────────────────────────
  core_axiom:
    id: NEXUS-001
    name: ALWAYS_MAP_FIRST
    rule: >
      No repository modification, synthesis, traversal, refactoring, or
      agent delegation may occur against an unknown repository surface.
    lifecycle: [MAP, UNDERSTAND, PLAN, ACT, VERIFY, REMAP]
    note: Repository state after mutation MUST produce a corresponding map update.

  # ── Identity (§3) ────────────────────────────────────────────────────────
  identity:
    rule: >
      A repository is a first-class node. Repository UUID is logical
      identity. Git commit hashes, filesystem paths, and chunk hashes
      MUST NOT be used as repository identity.
    example:
      schema: { id: repository, uuid: nexus-export-schema-repository, version: 1.0.0 }
      uuid: "repository:nexus"
      name: NEXUS
      version: 1
      status: ready

  # ── Repository schema (§4) — top-level shape ───────────────────────────
  repository_schema_fields:
    - schema
    - identity { uuid, name, version }
    - compartment
    - source { kind, root, remote, branch, commit, source_hash }
    - structure { systems, modules, directories, files }
    - symbols
    - components
    - chunks
    - hooks
    - wires
    - contracts
    - flows
    - tests
    - entrypoints
    - dependencies
    - artifacts
    - atlas
    - indexes { files, symbols, chunks, components, hooks, wires, events, contracts, tests }
    - verification { status, level }

  # ── Ownership (§5) ───────────────────────────────────────────────────────
  ownership:
    rule: A repository MUST belong to exactly one primary Compartment.
    compartment_owns:
      - repository state
      - repository configuration
      - JaaDB state
      - execution state
      - agent permissions
      - repository axioms
      - snapshots
      - test environments
    constraint: >
      A repository MUST NOT create a second parallel "project compartment"
      abstraction. Repository import creates or attaches to an existing
      Compartment.

  # ── Layers (§6) — L0 through L10 ────────────────────────────────────────
  layers:
    - { id: L0,  name: SOURCE }
    - { id: L1,  name: STRUCTURE }
    - { id: L2,  name: PARSE }
    - { id: L3,  name: CHUNKS }
    - { id: L4,  name: ATLAS }
    - { id: L5,  name: INDEX }
    - { id: L6,  name: GRAPH }
    - { id: L7,  name: WORK_SURFACE }
    - { id: L8,  name: EXECUTION }
    - { id: L9,  name: VERIFICATION }
    - { id: L10, name: HISTORY }
  layers_note: >
    Each layer derives from the previous layers where applicable.
    Execution and history attach to this model rather than replacing it.

  # ── Source layer (§7) ────────────────────────────────────────────────────
  source_layer:
    origins: [Git, "ZIP archive", "local directory", "remote repository", "generated project", "another Compartment", snapshot]
    identity_must_include: [source hash, source version, origin, timestamp]
    rule: A source mutation invalidates dependent derived state.

  # ── Directory schema (§8) ────────────────────────────────────────────────
  directory_schema:
    fields: [uuid, path, parent, children, files, hash]
    note: Directories are structural nodes, not semantic components unless explicitly classified as such.

  # ── File schema (§9) ─────────────────────────────────────────────────────
  file_schema:
    fields: [uuid, path, language, size, "hash { content, structure }", symbols, chunks, parent, "parse { status, parser }", status]

  # ── Parsing (§10) ─────────────────────────────────────────────────────────
  parsing:
    rule: Parsing MUST be deterministic whenever a supported parser exists.
    constraint: The system MUST NOT use an LLM to determine ordinary syntactic structure.
    pipeline: [FILE, "LANGUAGE DETECTION", PARSER, AST, "STRUCTURAL MODEL"]
    on_failure: >
      Unsupported or malformed files MUST remain observable — never
      disappear from the repository model. Example: parse.status=failed,
      parse.error set, observable:true, indexable:true, chunkable:false.

  # ── Chunk schema (§11) ────────────────────────────────────────────────────
  chunk:
    definition: The minimum verified addressable source unit.
    fields: [id, repository, file, "range { start_line, end_line, start_offset, end_offset }",
             symbols, parent, tags, relations, dependencies, contracts, tests,
             "runtime { parse, boundary, tests, integrity }", hash, status]
    identity_rule: >
      Chunk UUID represents logical chunk identity. Line numbers are
      coordinates, not identity — a line range moving does not
      necessarily create a new logical chunk. Structural identity and
      content hash determine whether the chunk survives relocation.
    boundary_requirements:
      - syntax complete
      - scope complete
      - AST boundary complete
      - semantic boundary valid
      - addressable
      - verifiable
    boundary_constraint: >
      The chunker MUST NOT arbitrarily cut through function bodies,
      class declarations, scopes, expressions, imports, exports,
      control-flow structures, or language-specific structural
      boundaries, unless the language parser explicitly determines the
      split is valid.

  # ── Atlas (§14-15) ────────────────────────────────────────────────────────
  atlas:
    definition: The compressed structural projection of the repository.
    answers: ["WHAT exists?", "WHERE does it exist?", "WHAT contains it?",
              "WHAT major symbols exist?", "WHAT components exist?",
              "WHAT hooks exist?", "WHAT flows exist?", "WHAT contracts exist?", "WHAT tests exist?"]
    constraint: Atlas MUST NOT contain the entire repository source.
    canonical_traversal: [ATLAS, SYSTEM, MODULE, COMPONENT, FILE, CHUNK, "HOOK / WIRE", WORK_SURFACE]
    identity: "atlas:<repository_uuid>"
    rule: Atlas MUST record the source version from which it was generated.
    schema_fields: [uuid, repository, "source { hash }", systems, modules, directories, files,
                     symbols, components, chunks, hooks, wires, contracts, flows, tests,
                     "integrity { status }"]

  # ── Components (§16) ──────────────────────────────────────────────────────
  components:
    definition: A semantic structural unit above individual chunks.
    kinds: [kernel, engine, runtime, adapter, interface, registry, storage, dispatcher,
            parser, compiler, provider, service, controller, CLI, API, event-bus, test, configuration]
    schema_fields: [uuid, name, kind, module, files, chunks, entrypoints]
    classification: MAY use deterministic structural evidence first and semantic inference second.

  # ── Symbols (§17) ─────────────────────────────────────────────────────────
  symbols:
    definition: Semantic addresses inside files.
    fields: [uuid, name, kind, file, chunk]
    rule: Symbols MUST resolve to source locations.

  # ── Hooks (§18) ───────────────────────────────────────────────────────────
  hooks:
    definition: First-class connection points.
    fields: [uuid, owner, direction, event_types]
    constraint: Hooks MUST NOT be represented solely as arbitrary strings embedded inside unrelated objects.

  # ── Wires (§19) ───────────────────────────────────────────────────────────
  wires:
    definition: First-class relationship nodes.
    fields: [schema, uuid, from_hook_id, to_hook_id, event_type, status]
    constraints:
      - A wire MUST connect valid hooks.
      - A wire MUST use a valid event type.

  # ── Event types (§20) ─────────────────────────────────────────────────────
  event_types:
    canonical_form: "{layer}:{noun}:{verb}"
    constraint: Repository event types MUST conform to the existing event schema; dot notation MUST NOT be introduced where the existing hook validator requires the three-part colon form.
    examples:
      - repository:import:start
      - repository:import:ready
      - ingest:unzip:complete
      - ingest:file:failed
      - parse:file:complete
      - parse:file:failed
      - atlas:build:start
      - atlas:build:complete
      - chunk:decompose:start
      - chunk:decompose:complete
      - chunk:glyphs:complete      # 0.39.261 — each chunk's glyph (its most compressed semantic form) in indexes/glyphs.json
      - chunk:verify:failed
      - index:build:complete
      - compartment:import:ready

  # ── Flows (§21) ────────────────────────────────────────────────────────────
  flows:
    definition: A .flow is an executable event graph. It is NOT a .macro.
    distinction:
      macro: ClearGlass browser automation (existing type, unchanged)
      flow: General event-driven executable topology (new)
    schema_fields: [schema, uuid, name, version, nodes, wires, entry, status]
    execution_model: A completed tool emits an event; matching wires activate downstream hooks.

  # ── Tools (§22) ────────────────────────────────────────────────────────────
  tools:
    definition: Repository operations are .tool nodes.
    examples: [repository:discover, repository:scan, repository:parse, repository:map,
               repository:index, repository:search, repository:traverse, repository:surface,
               repository:patch, repository:verify, repository:diff, repository:snapshot]
    rule: The model selects tools. The tool implementation performs deterministic mechanics.

  # ── Capability surface (§23) ────────────────────────────────────────────
  capability_surface:
    note: Canonical repository.* capabilities, all deterministic.
    groups:
      discover:  [repository.discover, repository.list, repository.scan, repository.metadata]
      map:       [repository.map, repository.map.system, repository.map.module, repository.map.file,
                  repository.map.component, repository.map.contract]
      parse:     [repository.parse, repository.ast, repository.symbols, repository.decompose, repository.rechunk]
      chunk:     [repository.chunk.get, repository.chunk.list, repository.chunk.locate, repository.chunk.validate]
      index:     [repository.index.search, repository.index.byFile, repository.index.bySymbol,
                  repository.index.byChunk, repository.index.byTag, repository.index.byEvent,
                  repository.index.byContract, repository.index.byTest]
      graph:     [repository.graph.traverse, repository.graph.callers, repository.graph.callees,
                  repository.graph.dependencies, repository.graph.dependents, repository.graph.imports,
                  repository.graph.exports, repository.graph.hooks, repository.graph.wires,
                  repository.graph.events, repository.graph.contracts, repository.graph.affected]
      surface:   [repository.surface.open, repository.surface.expand, repository.surface.read, repository.surface.compare]
      modify:    [repository.modify.patch, repository.modify.replace, repository.modify.insert,
                  repository.modify.delete, repository.modify.rename, repository.modify.move, repository.modify.extract]
      verify:    [repository.verify.syntax, repository.verify.boundary, repository.verify.chunk,
                  repository.verify.file, repository.verify.component, repository.verify.contract,
                  repository.verify.affected, repository.verify.integration]
      snapshot:  [repository.diff, repository.snapshot, repository.restore]

  # ── Relationship graph (§24) ────────────────────────────────────────────
  relationship_graph:
    relation_types:
      - contains
      - imports
      - exports
      - calls
      - called_by
      - depends_on
      - depended_on_by
      - implements
      - implemented_by
      - extends
      - instantiates
      - produces
      - consumes
      - emits
      - handles
      - tested_by
      - tests
      - verified_by
      - belongs_to
      - exposes
      - wired_to
      - activates
      - affects
      - generated_from
      - derived_from
    constraint: >
      Unknown relationships MUST remain explicitly unknown. The system
      MUST NOT invent edges merely to make the graph complete.

    # §AMENDED 2026-09-19 — two real additions to this section, not a
    # rewrite of it. Both came out of comparing this already-real §24
    # (relation_types + the unknown-stays-unknown constraint, both
    # already locked before this pass) against two external proposals
    # for a "graph field system." The comparison found the proposals'
    # best ideas were either already true here (the unknown-stays-
    # unknown constraint is word-for-word the same principle) or a real
    # generalization of something real but narrow elsewhere in this
    # codebase (intelligence/relational-field.js's RFR2 already attaches
    # contextual conditions to an event — just not generalized past
    # causal-friction tracing). What follows makes the general version
    # of that a real, buildable part of this spec — MCO1 stays NOT
    # STARTED, this is the target it builds toward, not new work done
    # now.
    edge_provenance_envelope:
      status: "SPEC ONLY — not yet implemented. MCO1's own gate
        condition (this file's phasemap) does not require this yet;
        it requires resolution:unresolved-vs-omitted, which is a
        subset of this envelope. This is the fuller shape MCO1 should
        grow into, not a new gate condition added today."
      rationale: >
        A bare {from, to, type} edge can't distinguish "the parser
        found this" from "another process inferred this," and can't
        answer why an edge exists or when it appeared. Versionium's
        own real commit/version machinery already gives this codebase
        everything needed to answer "did this edge disappear because
        the code changed, or because the extractor changed" — the
        envelope below is what lets an edge actually use it.
      fields:
        resolution:  "resolved | unresolved — MCO1's own real gate condition, unchanged"
        status:      "observed | inferred | derived | conflicting | stale"
        confidence:  "structural | inferred | asserted"
        source:
          file:              "the real file this edge was extracted from"
          range:             "[startLine, endLine] in that file"
          extractor:         "which real extractor produced this edge, e.g. javascript-import"
          extractor_version: "real version string — lets a later run distinguish \"the code changed\" from \"the extractor changed\" for the exact same edge"
        graph_version:     "the real repository-graph schema version this edge was written under"
        first_seen:        "epoch ms — real, not backfilled for edges predating this envelope"
        last_seen:         "epoch ms — updated on every real re-observation, not just creation"
      conflicting_graphs_are_data_not_error: >
        Two graphs may disagree about the same edge (e.g. the code
        graph says an import exists; a runtime/execution-observation
        graph has never seen that path actually exercised). Do not
        force agreement. Recording both, each with its own real
        provenance, is itself a diagnostic — "the spec requires this
        dependency but runtime has never observed it" is a real,
        useful question the graph should be able to represent, not
        collapse.

    field_attachment_extension_point:
      status: "DEFERRED — explicitly an extension point, not a
        commitment to build a general field system now. Named here so
        MCO1's own real schema leaves room for it, per this session's
        own §16.4 (simple stays simple, generalize after real
        repetition) — RFR2 is the one real instance that exists; this
        is not generalized until a second real, different field need
        shows up."
      shape_if_and_when_built: >
        A node or edge could carry a real fields:{} map alongside its
        core identity — e.g. a risk field (blast_radius, unresolved_
        dependency_count) or a temporal field (created, modified,
        observed_at) — each field independently sourced and versioned,
        the way relational-field.js's own causal conditions already
        are for friction events specifically. Not built now; the real
        edge_provenance_envelope above is the one piece of this that
        MCO1 actually needs, and it ships first, alone.

  # ── Graph traversal (§25) ────────────────────────────────────────────────
  graph_traversal:
    accepts: [starting node, relationship type, direction, depth, filters, verification requirement]
    example: "graph.traverse(start=component:chunk-engine, relation=affects, depth=4)"

  # ── Dependency cone (§26) ─────────────────────────────────────────────────
  dependency_cone:
    rule: A modification MUST be capable of producing an affected dependency cone.
    chain: [changed chunk, direct dependencies, callers, consumers, hooks, wires, contracts, tests, components, "system contracts"]
    note: The affected cone determines verification scope.

  # ── Work surface (§27-28) ────────────────────────────────────────────────
  work_surface:
    definition: The exact source context exposed to an agent.
    resolution_chain: [chunk uuid, current file, current location, parent component,
                        neighbor chunks, dependencies, hooks, wires, contracts, tests]
    rule: The agent receives the minimum sufficient connected surface, and MUST be able to request additional context through traversal.
    minimum_sufficient_surface:
      preference: minimum sufficient surface over entire repository
      synthesis_request_shape: [intention, constraints, "relevant atlas nodes", "relevant graph edges",
                                 "minimum source surface", contracts, tests]
      note: This is the primary context-compression mechanism.

  # ── Index (§29) ───────────────────────────────────────────────────────────
  index:
    definition: A deterministic address resolver.
    exposes: ["UUID → object", "file → chunks", "symbol → chunks", "tag → chunks",
              "event → hooks", "hook → wires", "wire → hooks", "component → chunks",
              "contract → components", "test → components"]
    identity_fields: [source_hash, atlas_version, generated_at, status]
    rule: An index with a mismatched source version MUST be considered stale.

  # ── Git integration (§30) ────────────────────────────────────────────────
  git_integration:
    rule: Git is the external source-history and persistence layer. Git MUST NOT replace the repository graph.
    git_provides: [clone, fetch, branch, checkout, diff, commit, tag, restore, push, pull]
    nexus_provides: ["semantic identity", atlas, chunks, relationships, verification, impact, "execution state"]
    chain: ["Git commit", "source snapshot", "atlas version", "chunk versions", "graph state", "verification state"]
    note: A Git commit SHOULD be associated with the exact NEXUS source state from which it was generated.

  # ── Credentials (§31) ────────────────────────────────────────────────────
  credentials:
    rule: Credentials MUST remain outside ordinary repository state.
    agent_must_not_receive: [passwords, "access tokens", "private keys", "credential files"]
    chain: [agent, git.push, "credential capability", "host credential store", remote]
    note: The tool reports operation status, not credential contents.

  # ── Compartment OS integration (§32) ────────────────────────────────────
  compartment_os_integration:
    note: A repository may execute inside a Compartment OS environment.
    compartment_owns: [filesystem, dependencies, runtime, build, tests, snapshot]
    distinction: The repository model describes source. The Compartment describes execution.

  # ── Snapshots (§33) ──────────────────────────────────────────────────────
  snapshots:
    must_record: [source hash, "Git commit", "atlas version", "chunk index version",
                  "graph version", "dependency state", environment, "test state", "verification state"]

  # ── Import flow (§34) — a .flow ─────────────────────────────────────────
  import_flow:
    name: PROJECT_IMPORT
    steps:
      - prompt:name
      - prompt:intent
      - compartment:create
      - dropzone:open
      - ingest:unzip
      - ingest:metadata
      - parse
      - "branch: success -> atlas -> chunks -> verify -> index -> compartment:import:ready"
      - "branch: failure -> ledger/event"

  # ── Incremental re-import (§35) ──────────────────────────────────────────
  incremental_reimport:
    rule: Re-import MUST be incremental whenever source identity allows it.
    chain: ["new source", "source diff", "changed files", "changed chunks",
            "affected relationships", "invalidated indexes", "affected dependency cone",
            "targeted verification", "atlas update"]
    note: Unchanged verified chunks SHOULD remain valid.

  # ── Hash model (§36) ──────────────────────────────────────────────────────
  hash_model:
    minimum: [repository source hash, file content hash, file structure hash,
              chunk content hash, chunk structure hash, atlas source hash, index source hash]
    rule: Derived objects MUST identify their source version (derived_from { file, version }).

  # ── Verification (§37) ───────────────────────────────────────────────────
  verification:
    tiers:
      - { level: L0, name: existence }
      - { level: L1, name: address }
      - { level: L2, name: syntax }
      - { level: L3, name: "structural boundary" }
      - { level: L4, name: "semantic consistency" }
      - { level: L5, name: "dependency consistency" }
      - { level: L6, name: "targeted runtime/test" }
      - { level: L7, name: integration }
      - { level: L8, name: "system contract" }
    import_should_perform: [syntax, boundary, "structural integrity"]
    note: Expensive runtime verification SHOULD be performed lazily or against the affected cone.

  # ── Mutation lifecycle (§38) ─────────────────────────────────────────────
  mutation_lifecycle:
    - INTENTION
    - MAP
    - TRAVERSE
    - "MINIMUM SURFACE"
    - SYNTHESIZE
    - PATCH
    - PARSE
    - "BOUNDARY VERIFY"
    - RECHUNK
    - REHASH
    - "AFFECTED GRAPH"
    - "TARGETED TESTS"
    - "SYSTEM VERIFICATION"
    - "INDEX UPDATE"
    - "ATLAS UPDATE"
    - "GIT SNAPSHOT / COMMIT"
  mutation_lifecycle_rule: No successful mutation is complete until the map has been updated.

  # ── Failure model (§39) ──────────────────────────────────────────────────
  failure_model:
    rule: Failures MUST be observable. Nothing silently fails.
    canonical_events:
      - repository:discover:failed
      - repository:parse:failed
      - repository:chunk:failed
      - repository:atlas:failed
      - repository:index:failed
      - repository:wire:failed
      - repository:verification:failed
      - repository:mutation:failed
      - repository:git:failed
      - repository:snapshot:failed
    unparseable_file: "file remains represented, parse=failed, file remains discoverable, file remains auditable"
    unresolved_relationship: >
      relationship MUST be marked "unresolved" — it MUST NOT silently
      become "absent".

  # ── Stale state (§40) ────────────────────────────────────────────────────
  stale_state:
    rule: Derived state MUST be invalidated when its source changes.
    potentially_stale: [chunks, symbols, tags, relationships, hooks, wires, indexes,
                         atlas, "dependency graph", verification, "synthesis cache"]
    rule2: Each derived artifact MUST have source/version identity.

  # ── Readiness (§41) ───────────────────────────────────────────────────────
  readiness:
    requires_all:
      - source resolved
      - structure discovered
      - parse state recorded
      - atlas generated
      - chunks indexed
      - relationships resolved or explicitly unknown
      - indexes current
      - critical verification passed
    constraint: >
      Readiness MUST NOT mean "every test in the repository has passed" —
      it means the repository is structurally addressable and safe for
      the next operation.

  # ── State machine (§42) ──────────────────────────────────────────────────
  state_machine:
    states: [DISCOVERED, INGESTING, PARSING, MAPPING, CHUNKING, INDEXING, VERIFYING, READY, DIRTY, REINDEXING, FAULT]
    transitions: >
      READY -> DIRTY -> REINDEXING -> VERIFYING -> READY;
      any state -> FAULT.
    rule: Fault states MUST retain diagnostic information.

  # ── Invariants (§43) — REPO-001 through REPO-025 ─────────────────────────
  invariants:
    - { id: REPO-001, rule: "Every repository has a unique logical identity." }
    - { id: REPO-002, rule: "Repository source identity is versioned." }
    - { id: REPO-003, rule: "No repository operation bypasses mapping when mapping is required." }
    - { id: REPO-004, rule: "Every discovered file remains observable even when parsing fails." }
    - { id: REPO-005, rule: "No trusted chunk exists without valid structural boundaries." }
    - { id: REPO-006, rule: "Line ranges are coordinates, not identity." }
    - { id: REPO-007, rule: "Derived indexes identify their source version." }
    - { id: REPO-008, rule: "Source mutation invalidates affected derived state." }
    - { id: REPO-009, rule: "Unknown relationships remain explicitly unknown." }
    - { id: REPO-010, rule: "Hooks are first-class nodes." }
    - { id: REPO-011, rule: "Wires are first-class nodes." }
    - { id: REPO-012, rule: "Wires connect valid hooks." }
    - { id: REPO-013, rule: "Event types conform to the canonical event schema." }
    - { id: REPO-014, rule: ".macro and .flow are separate types." }
    - { id: REPO-015, rule: "Flows reference tools rather than embedding arbitrary executable logic." }
    - { id: REPO-016, rule: "Agents receive minimum sufficient context." }
    - { id: REPO-017, rule: "Agents can request additional context through deterministic traversal." }
    - { id: REPO-018, rule: "Mutation produces an updated repository map." }
    - { id: REPO-019, rule: "Verification scope is determined by the affected dependency cone." }
    - { id: REPO-020, rule: "Git history does not replace semantic repository state." }
    - { id: REPO-021, rule: "Repository credentials are never exposed as ordinary agent context." }
    - { id: REPO-022, rule: "Repository execution occurs through an explicit Compartment boundary." }
    - { id: REPO-023, rule: "Successful snapshots identify source, atlas, graph, environment and verification state." }
    - { id: REPO-024, rule: "No repository failure is silently swallowed." }
    - { id: REPO-025, rule: "NEXUS-001 ALWAYS MAP FIRST applies to repository operations." }

  # ── Fundamental separation (§45) — who owns what ─────────────────────────
  fundamental_separation:
    - { owner: SOURCE,      owns: "actual code" }
    - { owner: ATLAS,       owns: "compressed topology" }
    - { owner: INDEX,       owns: "address resolution" }
    - { owner: GRAPH,       owns: relationships }
    - { owner: CHUNK,       owns: "verified source units" }
    - { owner: HOOK,        owns: "connection points" }
    - { owner: WIRE,        owns: connections }
    - { owner: FLOW,        owns: "executable topology" }
    - { owner: TOOL,        owns: "deterministic capability" }
    - { owner: COMPARTMENT, owns: "isolation and execution" }
    - { owner: GIT,         owns: "external source history" }
    - { owner: GUARDIAN,    owns: "verification/orchestration" }
    - { owner: COPILOT,     owns: "interpretation and synthesis" }
  fundamental_separation_rule: No subsystem should silently absorb another subsystem's responsibility.

  # ── Final primitive (§46) ────────────────────────────────────────────────
  final_primitive: >
    Repository has→source, contains→files, contains→chunks, exposes→symbols,
    contains→components, exposes→hooks, connects→wires, executes→flows,
    invokes→tools, satisfies→contracts, verified_by→tests,
    executes_in→compartment, persisted_by→Git, represented_by→atlas. The
    LLM no longer needs to carry the repository — it queries the
    repository's topology, the deterministic system resolves the address,
    the work surface supplies the minimum source, the model reasons, the
    tool executes, the compartment isolates, Guardian verifies, Git
    preserves, the atlas remaps, and the cycle starts again at MAP.
