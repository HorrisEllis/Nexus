spec:

  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # idearium/spec/spec-library.spec — every piece traced to its origin: spec ids and types, one library and one queue of specs, the
  # origin trace (each file → its skeleton slot, its spec module, its phase), drafts from code for what has none, and "phased only".
  # Format: emerge's module spec, compiled by lib/emerge/compiler/kg-builder.js at specDepth 1.0, no BLACK node
  # (tests/modules/test-substrate-spec.test.js). Phases: docs/2026-10-31-spec-everything-phasemap.spec.
  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        spec-library
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-31T00:00:00Z
    status:      specced
    uuid:        nexus-idearium-spec-library-v1-0000-2026-1031-jamesbrooks-001
    origin: >-
      James, 2026-10-31: "Spec it all out. go through the .phases. and spec out everything that is a module, capability, or new component?
      that way we can have every component traced to its origin, and each piece tracked also. like it all builds from the origin as a
      foundation/core like the system.js, which needs the config. map all of whats missing from all of this, to the architecture spec and
      genesis spec." · "how about anything new, spec, any changes, fixes, or additions is phased only." · "like what if we use spec ids and
      types, then have a queue/library for specs." The ideas (ids and types, the library and the queue, phased only, tracing to the origin)
      are his; the census, the module cut and the reuse of what exists are the coder's.
    purpose: >-
      One answer, for any file, capability or change: where it comes from. The origin is the system's server.js, which needs the config
      (his, 2026-10-31: "system.js i meant server.js"): config → server.js → the registry → components → UI, the skeleton's shape (genesis
      1.5.0, cos/archetype/nexus-system); each file is reached from its system's server.js or fills a slot beside it; each component is owned by a spec module with an id and a type; each module is built by a phase.
      Specs live in one library (the spec registry, made a library with ids and types) and work waits in one queue (what is drafted,
      specced, phased, built, verified). Nothing new, no change, fix or addition, is built outside a phase.
    target_runtime: [node]
    language_stack: [javascript, yaml]
    paradigm: [reuse-before-build, map-before-build, deterministic-first, evidence-per-claim]
    axioms: ["§3.3 map before build", "§8.6 reuse before build", "§6.3 every spec registered", "§12.5 addend the owning spec", "§0.3 nothing lost", "§1.2 nothing fails silently", "§10.3 one truth", "§5.15 sovereignty"]
    deps: []

    census: >-
      Measured 2026-10-31 against main 0.60.320 (a one-off trace over git's files, the same filters as scripts/systems-report.js). 1,876
      code files in 14 systems: 233 (12%) are named by a spec module's path; 1,028 (55%) are named in a phase's files; 203 (11%) are both;
      818 (44%) are neither. 2,239 .phase files from 207 phasemaps; 460 .spec files. Per system, of the skeleton's slots: idearium lacks
      server.js, cli.js and event-taxonomy.js; clear-glass lacks server.js, cli.js, config.js and event-taxonomy.js; cortex lacks server.js
      and cli.js; architect lacks server.js, cli.js, compartment.json and event-taxonomy.js; orchestrator and cos lack server.js, cli.js,
      config.js, compartment.json, registry-components.js and schemas/index.js; ollama and loom lack cli.js and event-taxonomy.js; versionium
      and intelligence lack cli.js. Six systems have no server.js, so no origin to trace to (idearium, clear-glass, cortex, architect, orchestrator, cos). docs/SPEC-REGISTRY.spec is the existing list of specs (§6.3); lib/phase-files.js reads phases;
      lib/emerge/compiler/phase-specs.js writes .phase and .graph files; scripts/systems-report.js measures spec ownership; lib/code-intel
      reads a file's declarations.

    constraints:
      - id: SL-001
        description: "Every spec and every module has an id and a type; an id is never reused, a superseded one is kept and points at its successor."
        type: hard
        enforced_by: [GATE-SL-IDS]
      - id: SL-002
        description: "Nothing is built outside a phase: a code file changed by a commit is named in a phase's files, or the change is reported."
        type: hard
        enforced_by: [GATE-SL-PHASED]
      - id: SL-003
        description: "A draft is marked a draft: a module drafted from code is never counted as specced until a person or a check brings it to full depth."
        type: hard
        enforced_by: [GATE-SL-DRAFT]

  schemas:

    - id: SpecId
      name: SpecId
      description: "The id of a spec or a module, and its type; one grammar for every spec in the library."
      fields:
        id:        "string — <type>:<system>:<slug>, e.g. module:clear-glass:dropdown-relocated-after-rerender; legacy ids (MOD-GT4) kept as aliases"
        type:      "enum — system | module | capability | component | schema | interface | phase | decision | fix | change"
        system:    "string — the owning system's folder name (§5.15), or nexus for the whole"
        aliases:   "string[] — the ids it had before (MOD-GT4, GT4_pace_between_dropdowns_and_find_again)"
        supersedes: "string | null — the id this one replaces; the old one stays (§0.3)"
      behavioral_contracts: ["an id is derived from what exists (the module id, the phase id) before a new one is made"]
      error_paths: ["two specs claim one id → both listed, the build refused until one is renamed"]

    - id: LibraryEntry
      name: LibraryEntry
      description: "One spec in the library: where it is, what it owns, how deep it is."
      fields:
        id:        "SpecId"
        path:      "string — the .spec file"
        owns:      "string[] — module ids, each with its path:"
        depth:     "number — the kg-builder's lowest specDepth over its modules (1.0 = can be rebuilt if lost)"
        maps:      "string[] — the phasemaps whose phases name it"
        status:    "enum — draft | specced | phased | building | built | verified | superseded"
        origin:    "string — his words, quoted, that started it"
      behavioral_contracts: ["the library is docs/SPEC-REGISTRY.spec, extended; never a second registry"]
      error_paths: ["a spec on disk not in the library → reported, then entered (§6.3)"]

    - id: QueueItem
      name: QueueItem
      description: "One thing waiting: a file with no module, a module with no phase, a phase not built."
      fields:
        id:        "string"
        kind:      "enum — unspecced-file | unphased-module | open-phase | draft-to-finish | missing-slot"
        target:    "string — the file, module id or phase id"
        system:    "string"
        foundation: "number — the skeleton layer it sits on (0 config, 1 server/registry/contract, 2 components, 3 ui); lower goes first"
        since:     "number"
      behavioral_contracts: ["ordered foundation first, then by how many others depend on it (loom impact)"]
      error_paths: ["a target that no longer exists → closed as gone, said"]

    - id: OriginTrace
      name: OriginTrace
      description: "A file's line back to its origin."
      fields:
        file:      "string"
        system:    "string"
        fromServer: "boolean | null — reached from its system's server.js (null: the system has no server.js, no origin yet)"
        slot:      "string | null — the skeleton slot it fills (server.js, config, registry …), or null for a component"
        module:    "SpecId | null"
        phases:    "string[] — the phases that name it"
        loom:      "{ registered: bool, wired: bool }"
        gaps:      "string[] — what is missing on the line"
      behavioral_contracts: ["read only; computed from files, never stored as a second truth"]
      error_paths: ["a file git does not know → skipped, counted"]

  interfaces:

    - id: IF-PHASE-FILES
      name: phase-files
      path: lib/phase-files.js
      description: "Reads a phasemap's phases and their files."
      exports: ["phasesOf(text, mapPath) → [{ id, body }]", "filesOfBody(body) → string[]"]
      behavioral_contracts: ["read only"]
      error_paths: ["a phase with no files → [] and the phase reported"]

    - id: IF-PHASE-SPECS
      name: phase-specs
      path: lib/emerge/compiler/phase-specs.js
      description: "Writes each phase's .phase and .graph files and checks them for drift."
      exports: ["derive", "write", "check", "writeAll", "checkAll"]
      behavioral_contracts: ["a superseded graph is moved to _superseded/, never deleted"]
      error_paths: ["a map that does not parse → named"]

    - id: IF-KG-BUILDER
      name: kg-builder
      path: lib/emerge/compiler/kg-builder.js
      description: "Compiles a spec into its graph with each node's specDepth."
      exports: ["build(spec) → { ok, graph }"]
      behavioral_contracts: ["deterministic"]
      error_paths: ["a module missing fields → lower specDepth, never a throw"]

    - id: IF-SYSTEMS-REPORT
      name: systems-report
      path: scripts/systems-report.js
      description: "Per system: wired, in Loom with wires, owned by a spec module, a screen and a command, tested."
      exports: ["node scripts/systems-report.js [out.json]"]
      behavioral_contracts: ["a measurement, not a verdict"]
      error_paths: ["Loom's registry not on disk → its columns said as unknown"]

    - id: IF-CODE-INTEL
      name: code-intel
      path: lib/code-intel/index.js
      description: "A file's declarations, exports and requires, without reading it whole."
      exports: ["cards (buildCards)", "chunker (definesOf, exportedNames)", "text (inlineRequires)"]
      behavioral_contracts: ["read only"]
      error_paths: ["a file it cannot parse → its card says so"]

    - id: IF-ARCHETYPE
      name: system-archetype
      path: cos/archetype/nexus-system.js
      description: "The system skeleton, file for file (genesis.spec 1.5.0's catalog)."
      exports: ["the skeleton's files and the reusable components that own them"]
      behavioral_contracts: ["assembled from its own tree every time it is read"]
      error_paths: ["a component file missing from the tree → named"]

    - id: IF-SPEC-REGISTRY
      name: spec-registry
      path: docs/SPEC-REGISTRY.spec
      description: "The list of every real .spec file (§6.3)."
      exports: ["registry: [{ file, … }]"]
      behavioral_contracts: ["living document; a spec is entered when made"]
      error_paths: ["a row whose file is gone → kept, marked missing"]

  modules:

    - id: MOD-SL-IDS
      name: spec-ids-and-types
      uuid: nexus-idearium-spec-library-ids-v1-0000-2026-1031-001
      path: idearium/spec-engine/spec-id.js
      phase: SE1_spec_ids_and_types
      description: "His spec ids and types: parse, make and check an id; derive one for every existing spec, module and phase from what it is already called, keeping the old name as an alias."
      deps: [{ name: kg-builder }, { name: phase-files }]
      schema_refs: [SpecId]
      exports: ["parse(id) → SpecId", "make({ type, system, slug }) → string", "deriveAll(root) → [{ id, aliases, path }]", "TYPES"]
      gate_pipeline: ["GATE-SE1-001: every existing module and phase gets an id", "GATE-SE1-002: no id twice"]
      behavioral_contracts: ["the legacy names keep working as aliases"]
      error_paths: ["a duplicate → both named, refused"]
      acceptance: ["over the tree: every module id in every compiled spec and every phase id in every map has exactly one SpecId"]

    - id: MOD-SL-TRACE
      name: origin-trace
      uuid: nexus-idearium-spec-library-trace-v1-0000-2026-1031-001
      path: scripts/origin-trace.js
      phase: SE2_the_origin_trace
      description: >-
        Each code file's line to its origin: whether its system's server.js reaches it (the require graph walked from the door, and the
        registry components the door mounts), the skeleton slot it fills, the spec module whose path names it, the phases whose files name
        it, its Loom component and wires; per system, whether it has a server.js at all and the skeleton slots it lacks. Built on systems-report's readers (it
        becomes their one implementation, not a second one), written as the per-system document and as JSON for the queue.
      deps: [{ name: systems-report }, { name: system-archetype }, { name: phase-files }, { name: spec-ids-and-types }]
      schema_refs: [OriginTrace]
      exports: ["node scripts/origin-trace.js [--system s] [--json out]", "trace(root) → { files: OriginTrace[], systems: { [s]: { slotsMissing, counts } } }"]
      gate_pipeline: ["GATE-SE2-001: the counts reproduce the 2026-10-31 census (1,876 / 233 / 1,028 / 203 / 818) on that commit"]
      behavioral_contracts: ["read only; the same filters as systems-report"]
      error_paths: ["the archetype unreadable → slots said as unknown"]
      acceptance: ["run on main 0.60.320: the five totals as measured; idearium's missing slots are server.js, cli.js, event-taxonomy.js"]

    - id: MOD-SL-LIBRARY
      name: spec-library-and-queue
      uuid: nexus-idearium-spec-library-queue-v1-0000-2026-1031-001
      path: idearium/spec-engine/library.js
      phase: SE3_the_library_and_the_queue
      description: >-
        The spec registry as a library: each entry with its SpecId, what it owns, its depth (compiled) and its maps; and one queue built from
        the trace: unspecced files, unphased modules, open phases, drafts to finish, missing skeleton slots, ordered foundation first (config,
        then server/registry/contract, then components, then UI) and then by how much depends on each (Loom impact).
      deps: [{ name: spec-registry }, { name: origin-trace }, { name: kg-builder }]
      schema_refs: [LibraryEntry, QueueItem]
      exports: ["library(root) → LibraryEntry[]", "queue(root, { system }) → QueueItem[]", "sync() — enters every spec on disk into docs/SPEC-REGISTRY.spec"]
      gate_pipeline: ["GATE-SE3-001: every .spec on disk is in the library", "GATE-SE3-002: the queue's first item sits on the lowest layer"]
      behavioral_contracts: ["one registry: SPEC-REGISTRY.spec gains fields, no new list"]
      error_paths: ["a spec that will not compile → in the library with depth 0 and why"]
      acceptance: ["the library lists 460 specs; the queue for cortex starts with its missing server.js slot"]

    - id: MOD-SL-DRAFT
      name: drafts-from-code
      uuid: nexus-idearium-spec-library-draft-v1-0000-2026-1031-001
      path: idearium/spec-engine/draft-from-code.js
      phase: SE4_drafts_from_code
      description: >-
        For a file with no module: a draft module written into its system's spec from what the code says (path, exports with signatures from
        code-intel, requires as deps, the phases that name it), status draft. What code cannot say (behavioural contracts, error paths,
        acceptance) is left as open questions, so the draft compiles below full depth and stays in the queue until finished.
      deps: [{ name: code-intel }, { name: spec-library-and-queue }]
      schema_refs: [LibraryEntry, QueueItem]
      exports: ["draft(file) → module", "draftSystem(system, { write }) → { drafted, skipped }"]
      gate_pipeline: ["GATE-SE4-001: a draft never reaches depth 1.0 on its own", "GATE-SE4-002: an existing module is never overwritten"]
      behavioral_contracts: ["deterministic: no model writes a draft; a model may later propose the open parts, through a phase"]
      error_paths: ["a file code-intel cannot read → queued as unspecced, said"]
      acceptance: ["for diagnostic (15 files, 1 with a module): 14 drafts, each compiling, each below 1.0, each in the queue"]

    - id: MOD-SL-PHASED
      name: phased-only
      uuid: nexus-idearium-spec-library-phased-v1-0000-2026-1031-001
      path: scripts/phased-only.js
      phase: SE5_phased_only
      description: >-
        His rule as a check: for a range of commits, every code file they change is named in a phase's files (a phase that exists in a map,
        with its spec and blocks); a change outside any phase is reported with the file and the commit. Run by the suite on HEAD's own
        change and offered to the build (Idearium refuses a phase run that writes outside its files, as DG2 refuses a phase with no graph).
      deps: [{ name: phase-files }, { name: spec-ids-and-types }]
      schema_refs: [QueueItem]
      exports: ["node scripts/phased-only.js [<base>..<head>]", "check(range) → { ok, outside: [{ file, commit }] }"]
      gate_pipeline: ["GATE-SE5-001: the files changed are read from git", "GATE-SE5-002: each matched against every phase's files"]
      behavioral_contracts: ["tests and docs are not code; a version bump (lib/version.js, package.json, VERSION) is the release's own"]
      error_paths: ["git unavailable → said, never a pass"]
      acceptance: ["0.60.318's commit passes (its files are in GT1 and GT4); a commit touching a file no phase names is reported"]

    - id: MOD-SL-SURFACE
      name: library-surface
      uuid: nexus-idearium-spec-library-surface-v1-0000-2026-1031-001
      path: idearium/cli/route-commands.js
      phase: SE6_the_library_on_screen
      description: "Backend, route, command, screen, in that order (his order of delivery): GET /api/specs/library, /api/specs/queue, /api/origin/:file; rows `spec library`, `spec queue [system]`, `origin <file>`; the Spec tab gains Library and Queue views."
      deps: [{ name: spec-library-and-queue }, { name: origin-trace }]
      schema_refs: [LibraryEntry, QueueItem, OriginTrace]
      exports: ["the three routes", "the three command rows", "Spec › Library, Spec › Queue"]
      gate_pipeline: ["GATE-SE6-001: route before row before screen"]
      behavioral_contracts: ["agents get what a person gets, through the one command tool"]
      error_paths: ["the trace slow on a large tree → cached per commit, said"]
      acceptance: ["in Idearium: the queue for diagnostic lists its drafts; `origin clear-glass/src/driver/index.js` names MOD-GT4 and its phases"]

  events:
    spec_library:
      - "spec.library.synced { added, missing }"
      - "spec.queue.changed { system, size, first }"
      - "spec.phased.outside { file, commit }"

  enforcement:
    gates:
      - { id: GATE-SL-IDS, name: one-id-each, severity: fatal, check: "no SpecId twice; every superseded id points forward", on_failure: "refused" }
      - { id: GATE-SL-PHASED, name: phased-only, severity: error, check: "every changed code file is in a phase", on_failure: "reported with file and commit" }
      - { id: GATE-SL-DRAFT, name: drafts-are-drafts, severity: fatal, check: "status draft below depth 1.0", on_failure: "suite red" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node"
    - "per module: its acceptance lines"
