spec:
  meta:
    name:        architecture-spec
    version:     0.7.0
    extends:     genesis-devkit-v1-0000-2026-0701-jamesbrooks-001  # status: proposed in that file — this spec is the argument for promoting it to active, not a replacement for it
    foundation:  TBD — no runtime exists yet, unassigned until first real implementation
    port:        TBD — no runtime process exists yet
    uuid:        TBD — assign on first real implementation, convention nexus-architecture-spec-v1-0000-<date>-jamesbrooks-001
    status:      draft
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
      - AX-004  self-describing — served at /contract equivalent (GET /<system>/lattice)
      - AX-010  sovereign transport — no cross-system require() into another system's data/ or ledger/
      - SMALLEST_UNIT  one component = one file = one intent, nothing bundled into a single file (genesis.spec, restated here as load-bearing, not just inherited)
      - SPEC_IS_LIVING_MODEL  a .spec is edited as the real system changes, in place, with version_history as the audit trail — not a one-time snapshot (already the real behavior of clear-glass.spec, warp.spec, etc.; stated explicitly here so it's a rule, not an inferred convention)
      - "HARDLINE_AS_LITTLE_AS_POSSIBLE  code contains the smallest possible set of deterministic, unchanging lines — anything that can plausibly change (a value, a route, a rule, a threshold) is a node, not a literal in a file. This is CONFIG_OUTSIDE_CODE (genesis.spec) generalized past config: not just adjustable settings, ANY dynamic or changeable fact belongs in a node so it can be declared, watched, indexed, and ledgered like every other node — never buried in source where changing it means editing and redeploying code instead of dropping or editing a node file."
      - "proposed, no AX code assigned yet:"
      - "orphan-free — no node may reach status: verified while any hook's wire target fails to resolve"
      - "no stub in production — zero nodes at status: stub in a production build"
      - "lattice regeneration-stability — recompiled lattice must exactly match lattice.json on disk, or the build fails"
    constants:
      NODE_STATUSES:       "[stub, wired, verified]"
      HOOK_DIRECTIONS:     "[in, out, bidirectional]"
      KNOWN_HOOK_TYPES:    "[api, event_bus, callto, direct, webserver, cli, ...] — open seed list, register don't edit, not limited to this set"
      LATTICE_LEVELS:      "[data, network, software, application] — genesis.spec's four levels; a hook/wire may cross any two directly, no enforced hierarchy"
      NODE_KINDS:          "[component, hook, wire, bundle, config] — the real set watcher.js/api.js watch and index; config added this pass"

  events:
    emits:
      - "architecture-spec.node.declared"
      - "architecture-spec.node.wired"
      - "architecture-spec.node.verified"
      - "architecture-spec.bundle.updated"
      - "architecture-spec.lattice.compiled"
      - "architecture-spec.orphan.detected"
      - "architecture-spec.build.blocked"
      - "architecture-spec.ledger.entry.appended"
      - "architecture-spec.route.compiled"
      - "architecture-spec.sovereignty.violation.detected"
      - "architecture-spec.config.changed"
    handles: []
    # No upstream event dependencies at draft stage — this system produces
    # the pattern other systems consume, it does not yet consume anything.

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
    # Target surface, not yet built:
    #   GET /<system>/lattice       — compiled lattice, read-only
    #   GET /<system>/api-routes    — compiled http-hook subset
    #   GET /<system>/bundles       — compiled NodeBundle index
    #   GET /<system>/friction      — FrictionScore, computed live
    #   GET /<system>/tension       — TensionScore, computed live
    #   GET /<system>/gaps         — this .spec file's own gaps.entries, as data

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
      path: architecture-spec/schema/{component,hook,wire,bundle,config}.js  # config.js added this pass
      description: >
        The declared unit — Component / Hook / Wire / NodeBundle /
        Config files. Restates loom/schema/*.js unchanged for the first
        three; bundle and config are this spec's own additions,
        reference-only and deliberately-untyped respectively.
    - id: lattice-compiler
      path: architecture-spec/compiler/lattice.js  # proposed, not yet built
      description: >
        Reads every Component/Hook/Wire file, resolves every wire's two
        hook ends against real node ids across any lattice level,
        produces CompiledLattice. Direct generalization of
        loom/schema/registry.js's graph() method.
    - id: registry-watcher
      path: architecture-spec/registry/watcher.js  # proposed, not yet built
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
    as_of: 2026-09-22
    entries:
      - id: AS1
        type: implementation
        summary: >
          No compiler or watcher code exists yet under this spec's own
          path — capability-node-schema, lattice-compiler, and
          registry-watcher are all specced, none built. registry-watcher
          in particular describes generalizing REAL, already-running
          code (guardian/lib/node-registry.js), not inventing new
          behavior — the implementation risk is extraction, not design.
        opened: 2026-09-22
      - id: AS2
        type: coverage
        summary: >
          Not yet added to loom/scanners/spec-map.js SPEC_DIRS allowlist
          — same gap shape as clear-glass's SM1, not fixed here.
        opened: 2026-09-22
      - id: AS3
        type: integration
        summary: >
          genesis.spec is status: proposed, not active, and does not
          appear reachable from idearium's promote-to-spec template
          menu (listCosTemplates() covers COS archetypes/blueprints
          only) — this spec does not resolve that promotion decision,
          it only depends on the outcome.
        opened: 2026-09-22
      - id: AS4
        type: open_question
        summary: >
          "BPM for health scoring like the intelligence system" —
          checked intelligence/*.js for a BPM-based formula, found
          none. genesis.spec's pulse/fidelity-score.js uses a generic
          four-axis scorer, not BPM specifically. Left unresolved
          rather than invented — needs the real source named before
          this spec's pulse/health-score constants are written.
        opened: 2026-09-22

  version_history:
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
