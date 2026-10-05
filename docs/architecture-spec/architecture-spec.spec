spec:
  meta:
    name:        architecture-spec
    version:     0.10.0
    extends:     genesis-devkit-v1-0000-2026-0710-jamesbrooks-001  # idearium/spec-engine/templates/genesis.spec v1.3.0 — the default template of a system spec since 0.39.286; since 1.3.0 the architecture of the system template, section by section (Domain 0a)
    foundation:  TBD — no runtime exists yet, unassigned until first real implementation
    port:        TBD — no runtime process exists yet
    uuid:        TBD — assign on first real implementation, convention nexus-architecture-spec-v1-0000-<date>-jamesbrooks-001
    status:      draft
    james: >
      "each component only needs to connect to the registry. that cuts down immensly on context. i am trying to make
      this need as little tokens as possible. scales as it builds, and as simple as possible." · "Like I want this to be
      a skeleton, only using the minimal code. Then expands from there. Using the .spec as a living model. Then an atlas
      in the atlas template but not a list, each detailed, and referenced. All expanded."
    template:    idearium/spec-engine/templates/architecture-spec.template.yaml   # the tree, the registry and the rules — one home; this spec points at it, never copies it
    schemas:     idearium/spec-engine/templates/system/schemas/                    # schema.<type> for component, capability, command, event, route, hook, wire, bundle — a new system copies and owns them
    purpose: >
      The formalized architecture of NEXUS itself, stated once so every
      new sovereign system can be scaffolded from the same real thing
      instead of each system re-deriving it. Not a new invention —
      a consolidation of three already-real pieces that currently live
      apart: genesis.spec (the sovereign-system grammar: kernel/engine/
      runtime, lattice, pulse), loom/schema/*.js (the real component/
      hook/wire schema), and guardian/lib/node-registry.js (the real
      JAA-backed per-type index + folder watcher + ledger). This spec
      is the seam between them, not a fourth competing description.
      Since 0.10.0 (James's template): a system starts as a skeleton — the tree, the registry, the schemas and only the
      minimal code that makes them live — and expands by adding nodes; every component connects only to the registry;
      its .spec is the living model; its atlas is written in the atlas template, each part detailed and referenced.
    written_from: >
      idearium/spec-engine/templates/genesis.spec, loom/schema/
      {component,hook,wire}.js, guardian/lib/node-registry.js,
      NODE-TAXONOMY.md — restates and unifies real, proven contracts.
      §8.6 reuse-before-build, applied to spec authorship itself.

  core:
    # ── Node vs Chunk — a boundary, not a detail ────────────────────────
    # A node is a declared FACT: this component/hook/wire exists, here is
    # its shape. A chunk is a unit of DISPATCH: send this prompt to an
    # agent, verify what comes back (idearium's real CHUNK_STATES machine,
    # chunk-dispatch.js's retry ladder). A chunk may PRODUCE a node's file
    # or the code behind it — the node itself is never generated content.
    # Collapsing the two is how a "chunk" ends up too large for an agent to
    # hold in context at once, which defeats §SMALLEST_UNIT below.
    #
    # ── Why small surface area — the actual reason this spec exists ────
    # Every schema below stays minimal on purpose: an agent working on one
    # node should never need more than that node's own file plus its
    # directly-wired neighbors in context. This is genesis.spec's own
    # axiom SMALLEST_UNIT ("one component = one file = one intent, nothing
    # bundled"), restated as the reason, not just a rule.
    schemas:
      - Component: "{id, namespace, name, version} required — loom/schema/component.js COMPONENT_SCHEMA, unchanged"
      - Hook: >-
          {id, component_id, name, type, direction} required —
          loom/schema/hook.js HOOK_SCHEMA, unchanged. type is fully
          open, not a closed enum, and not limited to software/API
          endpoints: any point of interaction, interface, or wire
          connection — network, data structure, architecture level,
          anything (loom/schema/hook.js's own words: "api, event bus,
          callto, direct and any invention you can think of, like
          webserver"). This is the same agnosticism genesis.spec's
          lattice already has across its four levels (data, network,
          software, application) — a hook is not a software-only
          concept, it's whatever crosses any two of those levels.
      - Wire: "{id, from_hook_id, to_hook_id} required, +intent optional — loom/schema/wire.js WIRE_SCHEMA, unchanged"
      - NodeBundle: >-
          {bundle_id, members: [node_id...]} — new. A reference-only
          grouping of related node ids (a component with its intent,
          command, config, and event nodes) so they can be addressed,
          moved, and tracked as one set. Never a merge into one file —
          the members stay independent files; the bundle is an index
          entry, not a container. Preserves SMALLEST_UNIT while still
          answering "what travels together."
      - CompiledLattice: "{generated, nodes, edges, orphans} — the compiled projection of Component/Hook/Wire files, level-agnostic per genesis.spec's lattice domain"
      - LedgerEntry: "{event_id, timestamp, node_id, hook_id, kind, payload_ref, status, corrects?} — per-type ledger entry, same shape guardian/lib/node-registry.js already writes"
      - FrictionScore: >-
          {friction, orphanCount, openGapCount, breakdown} — new, this
          spec's own contribution. Direct generalization of loom's real
          GET /api/friction (loom/registry-components.js), computed from
          THIS system's own lattice.orphans + this .spec file's own
          gaps.entries instead of proxied from a shared diagnostic kernel.
      - TensionScore: >-
          {tension, friction, windowDays, opened, closed, accumulation}
          — new. Generalization of loom's real GET /api/tension
          ("friction + gap accumulation"). accumulation = gaps opened
          minus gaps closed within windowDays, read from this .spec
          file's own gaps.entries[].opened/closed timestamps.
      - ConfigNode: >-
          {id, value} required, value intentionally untyped — new, this
          spec's own contribution. The node kind that makes
          HARDLINE_AS_LITTLE_AS_POSSIBLE real rather than aspirational:
          a changeable setting is a file in .architecture/nodes/config/,
          not a literal in source. Writing one goes through the exact
          same watch/validate/index/ledger path every other node kind
          does — no separate hot-reload mechanism, no second code path.
    axioms:
      - AX-001  validate all inputs at boundary (shared, applies unchanged)
      - AX-002  no silent failures — bus event on error (shared, applies unchanged)
      - AX-004  self-describing — a repo's registry is served at GET /api/repos/:uuid/architecture and written as nodes/
      - AX-010  sovereign transport — no cross-system require() into another system's data/ or ledger/
      - 'SKELETON_FIRST  a system is built as a skeleton — the template''s tree, registry and schemas, and only the minimal code that makes them live — then expands by adding nodes, not by rewiring code (James: "a skeleton, only using the minimal code. Then expands from there.")'
      - 'REGISTRY_IS_THE_SPINE  every component connects only to the registry, never to another component; the registry is asked for the entries a component needs, never handed over whole (James: "each component only needs to connect to the registry.")'
      - 'COMPONENT_SHAPE  each component has at least one capability, each capability at least one command, each command its events — each a node; each capability''s bundle references its related nodes, never copies them (genesis axiom COMPONENT_SHAPE)'
      - 'ATLAS_IS_DETAILED  a system''s atlas is written in the atlas template, each component, capability, command, route, event and node type detailed and referenced — never a bare list (James: "not a list, each detailed, and referenced. All expanded.")'
      - SMALLEST_UNIT  one component = one file = one intent, nothing bundled into a single file (genesis.spec, restated here as load-bearing, not just inherited)
      - SPEC_IS_LIVING_MODEL  a .spec is edited as the real system changes, in place, with version_history as the audit trail — not a one-time snapshot (already the real behavior of clear-glass.spec, warp.spec, etc.; stated explicitly here so it's a rule, not an inferred convention)
      - "HARDLINE_AS_LITTLE_AS_POSSIBLE  code contains the smallest possible set of deterministic, unchanging lines — anything that can plausibly change (a value, a route, a rule, a threshold) is a node, not a literal in a file. This is CONFIG_OUTSIDE_CODE (genesis.spec) generalized past config: not just adjustable settings, ANY dynamic or changeable fact belongs in a node so it can be declared, watched, indexed, and ledgered like every other node — never buried in source where changing it means editing and redeploying code instead of dropping or editing a node file."
    constants:
      NODE_STATUSES:       "[open, stub, unproven, built] — the template's component status (0.10.0); was [stub, wired, verified], read by no code"
      HOOK_DIRECTIONS:     "[in, out, bidirectional]"
      KNOWN_HOOK_TYPES:    "[api, event_bus, callto, direct, webserver, cli, ...] — open seed list, register don't edit, not limited to this set"
      LATTICE_LEVELS:      "[data, network, software, application] — genesis.spec's four levels; a hook/wire may cross any two directly, no enforced hierarchy"
      NODE_KINDS:          "[component, capability, command, event, route, hook, wire, bundle, toast, contract, config] — the template's node types, each its own folder, schema and JAA index (0.10.0); watcher.js/api.js watch component, hook, wire, bundle, config today"

  events:
    # 0.8.0 — the eleven architecture-spec.* events 0.7.0 listed are emitted by nothing in NEXUS (checked: no code under
    # architecture-spec/ or elsewhere emits them). Moved to docs/architecture-spec/_archive/architecture-spec-0.7.0.spec.
    # The events that DO exist for this pattern are idearium's: idearium.repo.architecture.written (POST
    # /api/repos/:uuid/architecture), and the registry's own event nodes (nodes/event/*.event) for a repo's events.
    emits:
      - "idearium.repo.architecture.written"   # idearium/api/index.js — after ARCHITECTURE.json and nodes/ are written
    handles: []

  routes:
    # Real and tested — the registry-api module, run this pass with an
    # actual HTTP server, real requests, and a real teardown:
    - method: GET
      path: /nodes/:type
      returns: "every node of that type, or filtered by any field via query params — real, tested with ?name=ingest"
    - method: GET
      path: /nodes/:type/:id/history
      returns: "that node's real ledger entries — real, tested"
    - method: GET
      path: /config
      returns: "every config node's current value — real, tested"
    - method: POST
      path: /config/:id
      body:    "{id, value} — a ConfigNode"
      returns: "{ok, id} — a real, watched file write; picked up by the same watch path every other node kind uses, no separate hot-reload code. Real, tested: written by a simulated agent-style POST, read back correctly."
    # 0.8.0 — the six "target surface, not yet built" routes (/<system>/lattice, api-routes, bundles, friction, tension,
    # gaps) were never built; moved to the archive. The routes that serve this pattern in NEXUS today:
    - method: GET
      path: /api/repos/:uuid/architecture        # idearium — a repo's registry: components, hooks, wires, routes, CLI, events, orphans, breaches, data dirs
      returns: "idearium/repo/architecture.js architecture() over the repo's code index"
    - method: POST
      path: /api/repos/:uuid/architecture        # idearium — writes ARCHITECTURE.json and the registry as nodes (nodes/<type>/<id>.<type>)
      returns: "{ stats, nodes: { written, unchanged, archived, failed, total } }"
    - method: GET
      path: /api/nodes/:type                     # orchestrator — every system's nodes of one type (lib/system-nodes.js)
      returns: "one node type across every system, ?system=&q=&limit=&full=1"

  handshake:
    components_count: 0
    note: >
      No registry-components.js-equivalent exists for this system itself
      — architecture-spec IS the definition of that pattern, for other
      systems to implement. It is the map, not (yet) a mapped system.
      registry-api.js is, as of this pass, the first module in this spec
      other systems (copilot, agents, anything) can actually reach —
      over HTTP, never require() — matching the sovereignty rule this
      spec already states in its own axioms.

  modules:
    - id: capability-node-schema
      path: architecture-spec/registry/{component,hook,wire,bundle,config}.js   # 0.8.0: the real paths (0.7.0 said schema/)
      description: >
        The declared unit — Component / Hook / Wire / NodeBundle /
        Config files. Restates loom/schema/*.js unchanged for the first
        three; bundle and config are this spec's own additions,
        reference-only and deliberately-untyped respectively.
    - id: lattice-compiler
      path: architecture-spec/registry/lattice.js   # built — compileLattice() (0.7.0 said compiler/lattice.js, not built)
      description: >
        Reads every Component/Hook/Wire file, resolves every wire's two
        hook ends against real node ids across any lattice level,
        produces CompiledLattice. Direct generalization of
        loom/schema/registry.js's graph() method.
    - id: registry-watcher
      path: architecture-spec/registry/watcher.js   # built — createWatcher(), NODE_TYPES [component, hook, wire, bundle, config]
      description: >
        Generalization of guardian/lib/node-registry.js out of guardian
        and into this spec's own registry/ domain (matching genesis.spec's
        registry/ naming) — a live folder watcher per node type, JAA-backed
        expanding index table per type, append-only per-type ledger, exactly
        the mechanism guardian already runs, scoped for reuse by any system
        instead of owned by guardian alone.
    - id: friction-tension
      path: architecture-spec/registry/friction.js  # built and tested against this very .spec file's own gaps.entries during authoring — see version_history 0.3.0
      description: >
        Computes FrictionScore and TensionScore live from this system's
        own compiled lattice orphans plus this .spec file's own
        gaps.entries — direct generalization of loom's real GET
        /api/friction and GET /api/tension (loom/registry-components.js),
        scoped per-system instead of proxied from a shared diagnostic
        kernel. Self-verified: run against architecture-spec.spec's own
        4 open gaps (AS1-AS4) plus one deliberately orphaned test wire,
        it returned friction: 5, tension: 9 — real numbers computed from
        this file's own real gaps section, not illustrative ones.
    - id: decompose
      path: architecture-spec/registry/decompose.js  # built and tested against real loom phasemap data
      description: >
        Agnostic decomposition tool — walks any seam-bounded structure
        (a phasemap, a component, a spec block) and produces node-sized
        pieces: phase records grouped by system, plus the Hook/Wire node
        pairs that make their dependencies real edges in the lattice,
        not just prose. Seam detection is pluggable
        (findSeamsByTopLevelKeys is the one built so far); a different
        content shape needs a new strategy function, not a rewrite.
        Self-verified against real data: decomposed the actual LP1→LP2→
        LP3 phase chain from docs/loom-phasemap-section-phasemap.spec,
        migrated it into per-system phase files, wired it into a test
        registry, and compiled the lattice — orphans: [] on the first
        run only after a real bug was found and fixed (the tool
        initially wrote wires referencing hook endpoints it never
        created, confirmed by running the real lattice compiler against
        its own output before the fix).
    - id: registry-api
      path: architecture-spec/registry/api.js
      description: >
        The real, cross-system-safe surface onto this registry — what
        makes it possible for copilot, agents, or any other system to
        organize, understand, index, and change this system's nodes
        without a direct require() across the process boundary. Query
        (not just list-all) via GET /nodes/:type filtered by any field;
        per-node history via the real ledger; and a ConfigNode kind
        that makes runtime-changeable settings real files a system can
        write to live (POST /config/:id) rather than literals baked
        into source — the concrete mechanism behind
        HARDLINE_AS_LITTLE_AS_POSSIBLE and dynamic_over_hardline.
        Self-verified end to end this pass: started a real server,
        seeded two real components, queried one back by field filter,
        had a simulated agent POST a config value and read it back
        correctly, and pulled a real node's ledger history — all
        against actual HTTP requests, not mocked. One known, unfixed
        caveat carried over from watcher.js: fs.watch still double-
        fires per write (added→changed for one real change) — the same
        debounce gap noted against watcher.js itself, not yet ported.
    - id: create-atlas
      path: architecture-spec/registry/create-atlas.js
      description: >
        Scaffolds and synthesizes a system atlas from multiple real
        sources at once — a system's own .spec (governance/meta), its
        real registry (what nodes actually exist), its taxonomy (which
        node kinds are REAL/OPEN/DEFERRED), and its live node index
        (what's actually running right now) — instead of reading only
        the .spec. synthesize() compares registry counts against live
        counts per kind; toCortexMemory() converts a version_history or
        gaps entry into cortex's real CortexMemory shape
        ({uuid, key, value, tags, source, tier: 'long', ts}) so history
        stays queryable data, not prose trapped in a markdown file.
        Self-verified this pass: a deliberately mismatched test fixture
        (registry claimed 3 hooks, live index had 1) was correctly
        surfaced as a visible discrepancy rather than silently averaged
        away. toCortexMemory() is shape-tested only — no live cortex
        was reachable this session to confirm the POST /api/memory/write
        leg actually lands.

    # 0.8.0 — real files under architecture-spec/registry/ that 0.7.0 did not list:
    - id: phases
      path: architecture-spec/registry/phases.js
      description: "PHASE_SCHEMA, PHASE_STATUSES, checkPhase, summarize, oneLine — a phase as a node (decompose.js's output)."
    - id: edit-atlas
      path: architecture-spec/registry/edit-atlas.js
      description: "findSection, editSection — edits one section of an atlas in place."
    - id: nexus-atlas-aggregate
      path: architecture-spec/registry/nexus-atlas-aggregate.js
      description: "aggregate — the per-system atlases into one NEXUS view."

  # ── 0.8.0 — the registry as the doorway (docs/2026-10-01-routing-registry-genesis-phasemap.spec RC1/RC2) ─────────────
  # James: "add the components registry as an 11th chunk … after the file list and tree … is its self the doorway, and the
  # rest is isolated modular, interacting through the interaction contract/registry … routes, cli, nodes and dir …
  # the nodes based data structure exactly like guardian."
  registry_block:
    template:  idearium/spec-engine/blocks.yaml — block 11, `registry`, dependsOn [build_order], fallback [ollama, gemini]
    produces:  nodes/<type>/<id>.<type> — lib/node-export.js envelope (Guardian's layout)
    node_types: [component, hook, wire, event, command, contract, system]   # all in lib/node-export.js KNOWN_TYPES
    generator: idearium/repo/architecture.js — architecture(intel, { readFile }) + toNodes(); POST /api/repos/:uuid/architecture
    archive:   a node no longer produced moves to nodes/_archive/<type>/; an unchanged node is not rewritten (fingerprint)
    rules:
      - a module reaches another only through a declared hook — an import wire, an event, a route or a CLI command
      - lower layers never require higher ones (breaches are listed on the contract node)
      - the UI reads the registry and calls routes and events; it imports no module
      - an orphan, or an event with no consumer, is a gap on the contract node
    test:      tests/modules/test-repo-architecture.test.js AR-08…AR-11

  # ── 0.8.0 — routing (docs/2026-10-01-routing-registry-genesis-phasemap.spec RG1–RG4) ──────────────────────────────────
  routing:
    module:    lib/pipeline-routing.js — policyFrom, plan, classify, shouldFallback, breaker
    config:    idearium routing.* — mode (learned | fixed | chain | local-first | economy; learned the default since
               0.39.287 — the route ordered per chunk type by what has worked, Ollama per model), chain, ollama_models,
               learn_min_records, fallback_on, max_hops, attempts_per_hop, breaker_threshold, breaker_cooldown_ms, skip_open
    surfaces:  GET /api/routing · GET /api/routing/plan?block=&agent= · POST /api/routing/breaker/reset · `idearium routing`
               · the settings console's Routing & fallback page
    provenance: "every hop kept on the chunk (chunk.route — provider, outcome, class, ms) — spec-engine recordChunkRoute"
    test:      tests/modules/test-pipeline-routing.test.js

  history:
    - date: 2026-09-22
      summary: >
        First draft .spec authored, generalizing loom's real component/
        hook/wire schema into a reusable scaffold pattern.
    - date: 2026-09-22
      summary: >
        Revised after discovering genesis.spec (2026-07-10, status:
        proposed) already defines the sovereign-system grammar this spec
        was independently re-deriving, and guardian/lib/node-registry.js
        (2026-09-12) already implements the JAA-per-type-index +
        watcher + ledger pattern. Rewritten as the seam unifying both,
        not a fourth competing description. Added NodeBundle (reference-
        only grouping, preserves SMALLEST_UNIT), generalized Hook.type
        to be level-agnostic per genesis.spec's lattice domain, and made
        SPEC_IS_LIVING_MODEL an explicit axiom instead of an inferred
        convention.

  gaps:
    as_of: 2026-10-01
    entries:
      - id: AS1
        type: implementation
        summary: >-
          CLOSED 2026-10-01 — the code exists: architecture-spec/registry/ holds the schemas, lattice.js, watcher.js,
          friction.js, decompose.js, api.js, create-atlas.js, phases.js, edit-atlas.js, nexus-atlas-aggregate.js. What
          stays open is the 0.39.271 note: only Guardian's own watcher runs; no system boots this watcher.
        opened: 2026-09-22
        closed: 2026-10-01
      - id: AS2
        type: coverage
        summary: >
          Not yet added to loom/scanners/spec-map.js SPEC_DIRS allowlist
          — same gap shape as clear-glass's SM1, not fixed here.
        opened: 2026-09-22
      - id: AS3
        type: integration
        summary: >-
          CLOSED 2026-10-01 — genesis is in idearium's template menu (templates.js id 'genesis') and is now the default:
          checked in the New spec form, and the template a `type: system` spec starts from when none is named.
        opened: 2026-09-22
        closed: 2026-10-01
      # AS4 ("BPM for health scoring") moved to the archive: no BPM-based scorer exists anywhere in NEXUS.
      - id: AS5
        type: planned
        summary: >-
          PLANNED, NOT BUILT — registry-driven moves (docs/2026-10-01-idearium-agent-ready-master-phasemap.spec RM1).
          James, 2026-10-01: "make the component registry have the ability to move the components around and have the
          agent move it in the code." Moving a component in the registry plans the file move and rewrites every import
          from the registry's own wires — deterministic, no model; a dry run first, then one staged change, the
          architecture re-projected and the repo's tests run. The agent is asked only for references the wires cannot
          see (dynamic requires, string paths), each named in the plan. Code stays the truth; the registry is the lever
          that moves it. Moves here from gaps to a real section when it is built.
        opened: 2026-10-01

  version_history:
    - version: 0.10.0
      date: 2026-10-05
      summary: >-
        James's system template (0.39.314–0.39.316): the spec points at the template (tree, registry, rules) and its
        schemas instead of restating them; axioms SKELETON_FIRST, REGISTRY_IS_THE_SPINE, COMPONENT_SHAPE and
        ATLAS_IS_DETAILED; NODE_STATUSES are the template's (open, stub, unproven, built); NODE_KINDS gain capability,
        command, event, route, toast and contract. His words in meta.james.
    - version: 0.9.0
      date: 2026-10-05
      summary: >-
        extends genesis 1.3.0; defers pulse, the taxonomy, the component shape and ownership to it (0.39.313).
    - version: 0.8.1
      date: 2026-10-01
      summary: >-
        routing names the learned mode (0.39.287); AS5 — registry-driven moves, planned (master phasemap RM1).
    - version: 0.8.0
      date: 2026-10-01
      summary: >-
        Cut to what exists in NEXUS (James: "remove anything from the architecture spec thats absent from nexus").
        Module paths corrected (registry/, not schema/ or compiler/); lattice.js and watcher.js marked built; three
        unlisted real modules added. Moved to docs/architecture-spec/_archive/architecture-spec-0.7.0.spec, kept whole:
        the eleven architecture-spec.* events (nothing emits them), the six unbuilt target routes, the three proposed
        axioms with no enforcement, gap AS4 (BPM — no such scorer). Added: the registry block (the spec template's 11th,
        nodes in Guardian's layout) and routing. AS1 and AS3 closed. extends now names genesis's real uuid.
      versioniumCommitId: null
    - version: 0.1.0
      date: 2026-09-22
      summary: >-
        First draft spec — first-principles module set only.
      versioniumCommitId: null
    - version: 0.2.0
      date: 2026-09-22
      summary: >-
        Reframed as the formalized architecture of NEXUS itself (seam
        over genesis.spec + loom schemas + guardian's node-registry,
        not a new pattern). Added NodeBundle, SMALLEST_UNIT and
        SPEC_IS_LIVING_MODEL as explicit axioms, generalized Hook.type
        to be level-agnostic. AS3/AS4 opened as real unresolved
        questions rather than guessed answers.
      versioniumCommitId: null
    - version: 0.3.0
      date: 2026-09-22
      summary: >-
        Added HARDLINE_AS_LITTLE_AS_POSSIBLE axiom (CONFIG_OUTSIDE_CODE
        generalized past config to any dynamic/changeable fact — it
        belongs in a node, not a literal in source). Added FrictionScore/
        TensionScore schemas and the friction-tension module, generalizing
        loom's real GET /api/friction and GET /api/tension per-system.
        friction-tension is the one module in this spec that's actually
        been run: against this file's own gaps.entries (AS1-AS4) plus one
        deliberately orphaned test wire, it returned friction: 5,
        tension: 9 — the spec scoring itself, not a hypothetical.
      versioniumCommitId: null
    - version: 0.4.0
      date: 2026-09-22
      summary: >-
        Added the decompose module (agnostic seam-based decomposition,
        real-tested against loom's own LP1→LP2→LP3 phase chain). Also
        fixed a real drift bug in this file itself: meta.version had
        been stuck at 0.2.0 since the 0.3.0 changelog entry was written
        — the changelog moved, the meta field didn't. Corrected here as
        its own visible line rather than silently patched, since a spec
        whose own version field drifts from its own version_history is
        exactly the kind of thing SPEC_IS_LIVING_MODEL exists to catch.
      versioniumCommitId: null
    - version: 0.5.0
      date: 2026-09-22
      summary: >-
        Added ConfigNode (deliberately untyped, the real mechanism
        behind HARDLINE_AS_LITTLE_AS_POSSIBLE — a changeable setting is
        a watched file, not a literal in source) and the registry-api
        module — the first module in this spec other systems can
        actually reach over HTTP: GET /nodes/:type with field filtering,
        GET /nodes/:type/:id/history from the real ledger, and
        GET/POST /config for runtime-changeable settings. All four
        routes real and tested this pass against an actual running
        server, not mocked. config added to NODE_KINDS and watcher.js's
        watched types. One caveat carried over unfixed: fs.watch's
        double-fire-per-write quirk, same as noted against watcher.js.
      versioniumCommitId: null
    - version: 0.6.0
      date: 2026-09-22
      summary: >-
        Added create-atlas module (multi-source synthesis: .spec +
        registry + taxonomy + live node index, plus a real cortex
        CortexMemory shape converter for history). Fixed a real,
        self-inflicted YAML bug found by that tool's own test run: the
        HARDLINE_AS_LITTLE_AS_POSSIBLE axiom line had an unescaped colon
        mid-sentence, which YAML silently parsed as a mapping key,
        turning that whole axiom into a {key: value} object instead of
        a string — every axioms-consuming tool (including this one)
        would have silently dropped it. Fixed by quoting the line;
        confirmed with a direct isinstance(str) check across every
        entry in core.axioms before and after.
      versioniumCommitId: null
    - version: 0.7.0
      date: 2026-09-22
      summary: >-
        T1 (clear-glass tab-per-repo) traced and patched end to end:
        6 real files (lib/repo-agent.js, copilot/server.js,
        copilot/lifeline.js, guardian/server.js, guardian/ask.js,
        guardian/lib/dispatcher.js), full chain logic-simulated, both
        the happy path (ncp.pushTab) and fallback (pushActive) verified.
        One real gap left, located not guessed: guardian's userscripts
        generate tabId client-side with no repo-awareness — clear-glass's
        own bgTab-open code needs to inject it, not read this session.
        Read AXIOMS-v3.1.md in full (613 lines) — the AX-### codes cited
        throughout this session's atlases are a separate convention from
        this document's own §-numbered laws; both real, not the same
        system. 3 phases added to the rich-dispatch phasemap (AG1 agent
        nodes sorted by provider, RS1 repo settings sections, GC1 global
        component reuse store, the last grounded directly in §17.10).
      versioniumCommitId: null

# ── ADDENDUM 2026-09-27 (0.39.271) — docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec ──
# "all data are nodes" — per-system command/capability/system nodes are now generated from the tree by
# lib/system-nodes.js (docs/system-nodes.spec), marked declared vs served, archived (never deleted) when their
# source goes, and readable at the orchestrator's GET /api/nodes/:type (the route this spec plans at /nodes/:type).
# Guardian hosts .hat and .agent and boots its per-type registry (watcher + ledger + JAA index). AS1 (a registry
# watcher for every system) stays open: only Guardian's watcher runs.

# ── ADDENDUM 2026-10-05 (0.39.313) — docs/2026-10-05-build-from-the-spec-phasemap.spec SB17 ──
# James: "like can you make sure this is all added to the system template. like look at the architecture spec." · "why not
#   identity context file_structure modules -> components summary, with routes and commands, anything else relevant. then
#   everything relevant to the modules, is listed each module and component. not in seperate sections" · "yes add it the
#   spec for genesis. like genesis is the exact architecture for a new system template."
# 0.9.0: this spec, the system template (idearium/spec-engine/templates/architecture-spec.template.yaml, rewritten in his
#   structure in 0.39.312) and genesis.spec 1.3.0 now say the same thing. genesis is the architecture (Domain 0a maps each
#   template section to its domains); the template is the shape a system's spec is written in; this spec is the seam
#   between genesis, loom's schema and guardian's node registry, as before. What this spec lacked and now defers to them:
#   pulse and the heartbeat (genesis Domain 10; the template's identity.heartbeat, whose snapshot carries each node type's
#   count), the event taxonomy (derived from the components — the template's generated.event_taxonomy), each component's
#   capabilities, commands and events as nodes (genesis axiom COMPONENT_SHAPE, capability_node in Domain 2c), and a system
#   owning its own data, schemas, contract, config, heartbeat and pulse (axiom SYSTEM_OWNS_ITS_OWN). The JAA node index it
#   already described (registry-watcher) is genesis Domain 2d.

