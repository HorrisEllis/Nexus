spec:
  meta:
    name:        idearium.repo-graph
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    owner:       idearium
    uuid:        nexus-idearium-repo-graph-v1-0000-2026-0919-001
    author:      james-brooks
    compiled_by: claude
    created:     2026-09-19
    status:      Specified
    implements:  'nexus-repository-system.spec §24 relationship_graph, §25 graph_traversal, §26 dependency_cone'
    closes:      'docs/nexus-repository-system-build-phasemap.spec MCO1_graph_layer'
    purpose: >
      Chunks and symbols exist; the edges between them do not. This is
      the graph layer. James: "use component registery logic, component
      type, everything that makes chunks understood. Coding syntax." A
      chunk an LLM can understand is one that knows what it contains,
      what it belongs to, what it imports, and what depends on it.

  build_order:
    law: '§8.5 — spec before build; §3.4 — raw code before interfaces.'
    written_before_code: true
    sequence:
      - 'this spec'
      - 'idearium/repo/graph.js — the library, callable from raw node with no server'
      - 'tests/modules/test-repo-graph.js — proof against a real materialized repo on disk'
      - 'import-pipeline.js run() — a real GRAPHING step, graph.json on disk'
      - 'idearium/api/index.js — repo.graph.* routes (the API layer, only after the library is proven)'

  nearest_gap:
    law: '§16.1 — the next bottleneck determines the next task.'
    why_this_one: >
      MCO0 is DONE and MCO1 is the only phase in
      nexus-repository-system-build-phasemap whose depends_on is
      satisfied. MCO2 (verification L4-L8) depends_on MCO1 explicitly —
      L5 "dependency consistency" and L6's lazy "affected cone" both
      name this graph as their basis. Building anything downstream first
      would skip a dependency layer.

  prior_art_read:
    law: '§8.6 — reuse before build, as a written finding, not a memory of having looked.'
    reused:
      - "loom/scanners/source-map.js — its RX_REQUIRE / RX_IMPORT regexes and stripNonCode() are the tree's proven, already-corrected dependency extraction (its own header records a real bug fixed there: require() calls inside docblocks and template literals were being counted as live edges). The JS/TS extraction here uses the same two patterns and the same strip-first discipline."
    NOT_reused_and_why:
      - "loom/scanners/source-map.js is not imported directly. Three real reasons, each checked: it is CJS and idearium declares type:module; its walk() is hardcoded to the nexus ROOT with a nexus-specific SKIP_DIRS, while this runs against an arbitrary imported repoDir; and its idFor() mints 'nexus.*' component ids, which would be a lie for someone else's uploaded project. Borrowing the two regexes is reuse; importing a nexus-tree walker to scan a stranger's repo would be a category error."
      - "import-pipeline.js's own SYMBOL_PATTERNS are declaration-detection (what a file defines), not reference-detection (what it uses). They are read by this module, never re-derived, but they cannot answer the imports question on their own."
    already_present_and_relied_on:
      - 'indexes/files.json, indexes/symbols.json, indexes/chunks.json, chunks/index.json, atlas.json — all real on-disk output of import-pipeline.js. The graph is derived from them and from one extra pass for import statements. No second storage system (§10.3).'

  core:
    schemas:
      - Node:  "{ id, kind: file|chunk|symbol, file, chunkId?, symbol?, language?, range? }"
      - Edge:  "{ from, to, target, relation, resolution: resolved|unresolved, reason?, via?, line? }"
      - Graph: "{ repository, generatedFrom: { atlasHash }, nodes[], edges[], unresolvedCount, relationCounts, generatedAt }"

  honesty_rule:
    law: 'nexus-repository-system.spec §24 constraint + REPO-009.'
    rule: >
      Unknown relationships MUST remain explicitly unknown. The system
      MUST NOT invent edges merely to make the graph complete.
    how_this_is_enforced_structurally:
      - "Every edge carries `resolution`. An import specifier that does not resolve to a file inside this repository is STILL AN EDGE — to:null, target:<the literal specifier>, resolution:'unresolved', reason:'external-or-unresolved'. It is never dropped, because dropping it would silently claim the file has no such dependency."
      - "`calls` / `called_by` are NOT emitted at all in v1.0.0. Call-site detection needs reference resolution this module does not do; emitting a regex guess would be an invented edge. Their absence is declared in the graph itself (`declaredUnsupported: ['calls','called_by',...]`) so a consumer can tell 'this graph has no call edges' apart from 'this code makes no calls'."
      - "A file whose parse status is 'failed' produces its file node and a single edge with resolution:'unresolved', reason:'parse-failed'. §10's on_failure rule — a file that cannot be parsed stays observable, it never disappears from the model."

  relations_shipped:
    v1_0_0:
      - { relation: contains,           from: file,  to: chunk,  basis: "chunks/index.json — already real containment, not re-derived" }
      - { relation: belongs_to,         from: chunk, to: file,   basis: 'inverse of contains' }
      - { relation: contains,           from: chunk, to: symbol, basis: "a chunk's own symbols[] plus symbols.json line-within-range" }
      - { relation: belongs_to,         from: symbol, to: chunk, basis: 'inverse' }
      - { relation: imports,            from: file,  to: file,   basis: 'one extra regex pass per language family, strip-first' }
      - { relation: exports,            from: file,  to: symbol, basis: "parsed.symbols — a top-level symbol is what the file exposes; honest limit below" }
      - { relation: depends_on,         from: file,  to: file,   basis: 'imports, one hop, resolved only' }
      - { relation: depended_on_by,     from: file,  to: file,   basis: 'inverse of depends_on' }
    declared_unsupported_in_v1:
      - 'calls / called_by — needs call-site + reference resolution, not declaration regexes'
      - 'implements / implemented_by / extends / instantiates — needs type resolution'
      - 'produces / consumes / emits / handles — event-bus semantics, not derivable from syntax'
      - 'tested_by / tests / verified_by — needs a test-mapping pass (MCO2 L6 territory)'
      - 'exposes / wired_to / activates — repository-domain hook/wire node types, MCO4'
      - 'affects / generated_from / derived_from — affects is COMPUTED by dependencyCone(), not stored as an edge'
    honest_limit_on_exports: >
      `exports` here means "top-level symbol this file declares", taken
      from import-pipeline.js's existing SYMBOL_PATTERNS. It is not real
      export-statement analysis — a private top-level helper is included
      and a re-export (`export { x } from './y'`) is not followed. Stated
      rather than silently over-claimed; tightening it is a real,
      separate piece of work.

  language_coverage:
    method: >
      Per-language-family reference regexes, applied to source with
      comments and template literals stripped first (loom's own proven
      discipline). Deterministic, no LLM — §10's constraint that
      ordinary syntax is never sent to a model.
    families:
      javascript_family: "require('./x'), import ... from './x', export ... from './x' — .js .jsx .mjs .cjs .ts .tsx"
      python:            'import x, from .x import y'
      go:                'import blocks and single imports'
      rust:              'use crate::/self::/super:: paths, mod x'
      ruby:              "require / require_relative"
      java_csharp:       'import x.y.Z / using X.Y'
      c_family:          '#include "x.h" (quoted form only — <angle> is a system header, explicitly unresolved)'
    unlisted_language: >
      A language with no pattern entry yields zero import edges and is
      recorded in the graph's own `languagesWithoutExtractors` list —
      the difference between "no imports" and "not looked for" is itself
      information (§1.2).

  resolution:
    rule: >
      A relative specifier is resolved against the importing file's
      directory, then tried against the repository's real file list with
      the language family's extension candidates and index-file
      conventions. Resolution is against files that ACTUALLY EXIST in
      indexes/files.json — never a constructed path assumed to be real.
    unresolved_reasons:
      external-or-unresolved: 'a bare package specifier, or a relative path with no matching file in this repo'
      system-header:          'a C/C++ <angle-bracket> include'
      parse-failed:           'the importing file could not be read or parsed'
      dynamic:                'require(variable) / import(expr) — detected, never guessed at'

  findings_from_building_it:
    law: '§0.1 — evidence over expectation; §12.4 — invariants crystallise from tests, not from intent.'
    note: >
      Both of these were produced by measurement during the build. Neither
      was visible from reading the code, and the second was found only
      because two of this spec's own tests failed and the failure was
      taken seriously instead of adjusted away.

    upstream_language_detection_gap:
      found_by: "two C test cases failing in tests/modules/test-repo-graph.js"
      fact: >
        import-pipeline.js's LANGUAGES table covers .js/.mjs/.cjs/.jsx/
        .ts/.tsx/.py plus data formats, and has NO entry for Go, Rust,
        Ruby, Java, C#, C or C++. Those files arrive with language:null,
        so seven of this module's extractors can never fire.
      not_fixed_here_because: >
        Language detection has exactly one owner (§17.1, §10.1) and it is
        import-pipeline.js. A second extension->language table in graph.js
        would be two write authorities for one fact (§10.3), and adding
        the languages upstream also changes CHUNKING behaviour for every
        newly-detected language — different work, needs its own spec.
      what_was_done_instead: >
        The graph reports `languagesUndetectedUpstream` (extension, count,
        what it would have parsed as) and emits an unresolved edge with
        reason `upstream-language-undetected:<ext>`, so "no imports" and
        "never looked" are distinguishable (§1.2). The tests now pin that
        reporting, so fixing it upstream has to update them deliberately.
      next: 'extend import-pipeline.js LANGUAGES — small, additive, own spec.'

    brace_balance_false_positive:
      found_by: >
        guardian/server.js coming back parse-failed while building the
        benchmark, then measured across 407 real .js files in guardian/,
        lib/, idearium/ and cortex/.
      fact: >
        The brace-balance check counted every { and } in a file, including
        inside strings, comments, template literals and regex character
        classes. 6 of 407 files were marked status:'failed'; `node --check`
        passes on ALL SIX. A 100% false-positive rate. A failed file is
        chunkable:false per §10, so each was excluded from chunking AND
        from this graph — including guardian/server.js, the largest and
        most connected file in the system.
      prior_art: >
        The same bug class is already recorded in lib/version.js's 0.39.125
        entry as having been found and fixed in cli/decompose.js's
        walkBraceBlock(). That function is an unexported block finder in a
        CJS CLI, so the state-machine discipline was applied rather than
        imported, and the earlier fix is credited rather than
        rediscovered as new.
      fix: 'idearium/repo/import-pipeline.js braceDepth() — token-aware counter.'
      my_own_error_caught_by_re_measuring: >
        The first version of the fix incremented depth on `${` and never
        returned to string mode, so everything after the first
        interpolation in any template literal was scanned as code. That
        cratered the real chunk count from 4731 to 195 and ADDED false
        positives. Re-running the same 407-file measurement caught it
        immediately; the logic reading correctly would not have. Fixed
        with a real templateStack. Pinned by SYN-007.
      measured_after: '407 files, 0 parse-failed, 0 false positives, 4101 chunks, 22,159 edges, 594 ms. guardian/server.js: 135 chunks and its real dependency edges, where before it had neither.'
      tests: 'tests/modules/test-import-pipeline-syntax.js — 12/12, SYN-010 anchored on this repo''s own guardian/server.js.'

  persistence:
    law: '§10.2 — a projection is derived, not written. §16.5 — delete before you add.'
    measured_problem:
      subject: '335 real files from guardian/ and lib/'
      total: '4082 KB graph.json'
      breakdown:
        containment_and_exports_edges: '2631 KB (64%)'
        chunk_and_symbol_nodes:        '1012 KB (25%)'
        reference_edges:               '361 KB'
        file_nodes:                    '~77 KB'
      the_problem: >
        The first two are a verbatim re-encoding of indexes/chunks.json
        (822 KB) and indexes/symbols.json (244 KB) — already on disk,
        already canonical, already the write authority for that fact. 89%
        of the artifact was a second copy of data this module does not
        own. At that rate a 10,000-file repository writes roughly 160 MB
        of mostly duplication, which defeats the point of mapping a whole
        codebase.
    decision: >
      The IN-MEMORY graph is unchanged and complete — every consumer and
      every existing test sees the same shape. Only the PERSISTED form is
      lean: file nodes and reference edges, the half this module genuinely
      derives. readGraph() rebuilds containment from the indexes that own
      it, through buildContainment(), the single shared implementation
      buildGraph() also uses (§10.3 — two copies would become two answers
      the first time one was edited).
    measured_after: '588 KB on disk, down from 4082 KB — 86% smaller.'
    cost_named_not_hidden: >
      readGraph() now does real work instead of one JSON.parse: 60 ms for
      335 files / 6152 nodes / 16388 edges. That is the trade, stated with
      its benchmark (§17.11).
    backward_compatible: >
      A graph written before this change carries no `persisted:'lean'`
      marker and is returned as-is, never rebuilt on top of itself.
      Asserted by PERSIST-005, not assumed.
    proof_that_nothing_is_lost: >
      PERSIST-002 compares every rebuilt node and every rebuilt edge
      against buildGraph's output for equality. A count comparison would
      not have proven the claim this decision rests on.

  api:
    library:
      - 'buildGraph({ repoDir }) -> Graph. Reads the pipeline output already on disk.'
      - 'traverse(graph, { start, relation, direction, depth, filters, includeUnresolved }) -> { start, visited[], edges[], truncated }  (§25)'
      - 'dependencyCone(graph, { start, depth }) -> { changed, direct[], callers[], files[], chunks[], symbols[], unresolved[] }  (§26)'
      - 'affected(graph, files[]) -> the union cone for a changeset — feeds MCO2 verification scope'
    routes_after_library_is_proven:
      - 'GET /api/repos/:uuid/graph                       -> repo.graph'
      - 'GET /api/repos/:uuid/graph/traverse?start=&relation=&depth=&direction= -> repo.graph.traverse'
      - 'GET /api/repos/:uuid/graph/cone?start=           -> repo.graph.cone'

  gate:
    from_phasemap: >
      MET when graph.traverse(start=<real chunk>, relation=depends_on,
      depth=N) returns a real edge set for an actual materialized repo,
      and any relationship the extractor can't determine is marked
      "unresolved" rather than omitted (§24 constraint, REPO-009).
    how_it_will_be_proven: >
      tests/modules/test-repo-graph.js builds a real multi-file, multi-
      language repo on disk in a temp dir, runs the REAL import pipeline
      over it (not a fixture graph), then asserts traverse and cone
      against it — including one case that asserts an external import
      survives as an unresolved edge rather than disappearing, and one
      that asserts a parse-failed file still has a node.

  determinism:
    rule: >
      Same repo, same graph. Nodes and edges are emitted in a stable
      order (file path, then line) and the graph carries the atlas hash
      it was generated from, so a stale graph is detectable rather than
      silently trusted (§17.5 provenance, §13.4 drift is data).

  non_goals:
    - 'No LLM anywhere in this module.'
    - 'No second copy of source. The graph stores ids and line numbers, never content (§14 atlas constraint, applied one layer down).'
    - 'Not the work surface (§27-28). Assembling the minimum sufficient context an agent receives is the next piece and depends on this one.'

# ── ADDENDUM 2026-09-27 (0.39.273) ───────────────────────────────────────────────────────────────────────
# Chunk cards (lib/code-intel/cards.js, indexes/cards.json) list what each chunk USES and what uses it, found by name
# and labelled with their basis (import | same-file | name). They are NOT graph edges and do not change this graph's
# vocabulary: `calls` / `called_by` stay declared unsupported here, because a by-name reference is not a resolved
# call. The graph's chunk nodes gain nothing; chunk ids are now derived from the chunk's key (stable across edits).
