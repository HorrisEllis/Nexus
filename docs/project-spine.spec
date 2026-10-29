spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # project-spine.spec — finish this or any other project in Idearium: import it whole, convert its documents and its
  # hard-coded plans, keep its component registry as the spine (every component, every wire, with evidence), refactor
  # through that registry, and break a file holding several components into one file per component, wired into the spine.
  # Format: emerge's module spec, compiled by lib/emerge/compiler/kg-builder.js at specDepth 1.0
  # (tests/modules/test-substrate-spec.test.js). Phases: docs/2026-10-29-finish-any-project-phasemap.spec.
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        project-spine
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-29T00:00:00Z
    status:      specced
    uuid:        nexus-project-spine-spec-v1-0000-2026-1029-jamesbrooks-001
    origin: >-
      James, 2026-10-29, uploading Emerge.zip: "take this, and import it into idearium, then create all the capability to finish this
      or any other project in the repo." · "convert mds, hardcoded phasemaps, refactor tool for the architecture to use the component
      registry as the spine, decomposition tool for breaking up each component into it's own file and wire it into the spine."
    purpose: >-
      A project brought into Idearium can be carried to done by the same tools whatever it is: nothing it tracks is dropped on import;
      its markdown becomes specs and its plans become DAG-checked phasemaps; its architecture lives in one registry file (the spine)
      that names every component and every wire with where the wire came from; a refactor is asked of the registry (move, rename)
      and the files follow; a file that holds several components is split into one file per component, its old path kept as the
      door so nothing that requires it breaks, and every new file wired into the spine.
    target_runtime: [node]
    language_stack: [javascript]
    paradigm: [registry-as-spine, adapters, lose-nothing, proposal-then-apply]
    axioms: ["§0.3 nothing lost (an md is kept beside its spec; a split keeps the old path as the door)",
      "§0.1 evidence over memory (every wire says discovered, declared or unknown)", "§1.2 nothing fails silently",
      "§8.6 reuse (zip-ingest, code-intel, spec-from-markdown, roadmap-import, the repo layer's versioned writes)",
      "NC0 the neutral core: tools ask an adapter, never a JS scanner directly", "§3.3 map before build",
      "§5.15 sovereignty: Idearium owns repos; lib holds the agnostic tools"]
    deps:
      - { name: js-yaml, version: ">=4.1.0", required: true, purpose: "spec and phasemap text" }

    constraints:
      - id: FA-001
        description: "An import keeps every file the project's own .gitignore does not ignore; only node_modules, .git and .svn are always skipped. A generated folder (build, dist) the project tracks is kept."
        type: hard
        enforced_by: [GATE-FA-KEEP-TRACKED]
      - id: FA-002
        description: "Every wire in a spine says where it came from: discovered (which adapter), declared (by whom) or unknown. An unresolved require is unknown, never dropped and never counted as proof."
        type: hard
        enforced_by: [GATE-FA-EVIDENCE]
      - id: FA-003
        description: "A refactor or a split is a proposal first: the files it would write, each before and after. Applying goes through the repo's versioned writer, so every change can be undone."
        type: hard
        enforced_by: [GATE-FA-PROPOSAL-FIRST]
      - id: FA-004
        description: "A split keeps behaviour: the old file stays at its path and exports the same names; a split whose exports differ after, or whose files do not load, is refused and nothing is written."
        type: hard
        enforced_by: [GATE-FA-SAME-EXPORTS]
      - id: FA-005
        description: "Conversion never removes a source: an md stays beside the spec made from it; a spec's build plan stays in the spec beside the phasemap made from it."
        type: hard
        enforced_by: [GATE-FA-KEEP-SOURCE]

  schemas:

    - id: SpineComponent
      name: SpineComponent
      description: "One component of a project: a file the adapter recognises."
      fields:
        id:        "string — <project>.<path with / as . and no extension>"
        path:      "string — the file, repo-relative"
        name:      "string"
        language:  "string — the adapter's language"
        adapter:   "string — javascript | documents | unknown"
        exports:   "string[] — what the adapter reads as its exports ([] when it cannot tell)"
        units:     "number — top-level units (functions, classes, sections) it holds"
        declared:  "object[] — edges the code cannot show, kept across rescans (HTTP, spawn), each { to, kind, by }"
      behavioral_contracts: ["the id is stable while the path is"]
      error_paths: ["a file no adapter reads → adapter unknown, exports []"]

    - id: SpineWire
      name: SpineWire
      description: "One edge between two components."
      fields:
        from:      "string — component id"
        to:        "string — component id, or the require text when it resolves to nothing"
        kind:      "string — require | reference | declared"
        evidence:  "string — discovered:<adapter> | declared:<by> | unknown"
        spec:      "string — the text written in the source (the require path, the link)"
      behavioral_contracts: ["an npm package is not a wire (it is listed under npm)"]
      error_paths: ["a relative require to no file → to = the text, evidence unknown"]

    - id: Spine
      name: Spine
      description: "A project's component registry: written to nexus.spine.json at the repo's root."
      fields:
        project:     "string"
        version:     "number — the spine format, 1"
        components:  "SpineComponent[]"
        wires:       "SpineWire[]"
        npm:         "string[] — packages required"
        unknown:     "number — wires whose target could not be found"
        scannedAt:   "string — ISO time"
      behavioral_contracts: ["rescanning an unchanged tree gives the same components and wires"]
      error_paths: ["an unreadable file → said in problems, the rest scanned"]

    - id: SplitPlan
      name: SplitPlan
      description: "A proposal to break one file into one file per component."
      fields:
        file:      "string"
        by:        "string — section | declaration"
        pieces:    "object[] — { path, names, lines, uses } each new file"
        door:      "string — the old path's new text: requires the pieces, exports the same names"
        refused:   "string | null — why it cannot be split, when it cannot"
        merged:    "object[] — units kept together and why (shared mutable state, a cycle, __filename)"
      behavioral_contracts: ["no piece requires a piece that requires it (cycles are merged first)"]
      error_paths: ["ES modules or TypeScript → refused with the reason (the JS adapter splits CommonJS)"]

  interfaces:

    - id: IF-ZIP-INGEST
      name: zip-ingest
      path: lib/zip-ingest.js
      description: "extractZipToFiles: a zip's entries, every bound from the import config, the wrapper folder stripped."
      exports: ["extractZipToFiles({ buf, stripWrapper, skipDirs, textExt, … }) → { ok, included, realFiles, omitted, stats }"]
      behavioral_contracts: ["every exclusion is listed in omitted with its reason"]
      error_paths: ["an unreadable zip → { ok: false, error }"]

    - id: IF-CODE-INTEL
      name: code-intel
      path: lib/code-intel/structure.js
      description: "scanBraces: each line's depth and whether it starts a statement (strings, comments, regex and templates skipped); decls.matchDecl names what a line declares."
      exports: ["scanBraces(text, family) → { lines: [{ depth, start }] }", "matchDecl(language, text) → { kind, name, primary } | null"]
      behavioral_contracts: ["a scanner, not a parser: an unbalanced file falls back and says so"]
      error_paths: ["never throws"]

    - id: IF-SPEC-FROM-MD
      name: spec-from-markdown
      path: lib/spec-from-markdown.js
      description: "parseMarkdownToSpec: an md's title, version, intent and heading chunks."
      exports: ["parseMarkdownToSpec(text, opts) → { meta, chunks, specText }"]
      behavioral_contracts: ["a canonical spec: is returned unchanged"]
      error_paths: ["empty text → throws"]

    - id: IF-ROADMAP-IMPORT
      name: roadmap-import
      path: idearium/repo/roadmap-import.js
      description: "A project's own roadmap (phases.json, PHASEMAP.md, SPEC.md, ISSUES.md) as a Nexus phasemap."
      exports: ["findRoadmaps(paths)", "importRoadmap({ json, md, name }) → { text, phases, next, said }"]
      behavioral_contracts: ["the map is parsed back by the phasemap parser before it is returned"]
      error_paths: ["no phase found → RoadmapImportError"]

    - id: IF-REPO-LAYER
      name: repo-layer
      path: idearium/repo/index.js
      description: "Idearium's repo layer (RepoLayer): readTextFile, writeTextFile (each write a repo version), moveFile, refresh."
      exports: ["readTextFile(uuid, path)", "writeTextFile(uuid, path, text)", "moveFile(uuid, from, to)"]
      behavioral_contracts: ["every write is a version that can be restored"]
      error_paths: ["a write error → { error }"]

  modules:

    - id: MOD-IMPORT-KEEPS-TRACKED
      name: import-keeps-tracked
      uuid: nexus-project-spine-import-v1-0000-2026-1029-001
      path: lib/zip-ingest.js
      phase: FA0_import_keeps_what_the_project_tracks
      description: "extractZipToFiles reads the project's own root .gitignore: a file it ignores is omitted (said: the project's .gitignore); a folder in the generated set (build, dist, .next, __pycache__) is kept when the project has a .gitignore that does not ignore it. node_modules, .git and .svn are always skipped. .eg, .mjs, .cjs and .toml are chunked as text."
      deps: [{ name: zip-ingest }]
      exports: ["extractZipToFiles(...) — same signature; omitted carries 'the project's .gitignore' for what it ignores", "gitignoreMatcher(text) → (path) → boolean"]
      gate_pipeline:
        - "GATE-FA0-001: the entries → the root .gitignore (after the wrapper is stripped) → a matcher (globs, anchors, dir-only, negation)"
        - "GATE-FA0-002: each entry → always-skip set → ignored by the project? → generated folder with no .gitignore? → kept"
      behavioral_contracts:
        - "a project with no .gitignore is imported as before (build and dist skipped)"
        - "Emerge's lang/build/current is kept; its gitignored lang/build/previous and emerge/output/* are not"
      error_paths:
        - "an unreadable .gitignore → the old skip set, said in stats.gitignore"
      acceptance:
        - "the Emerge zip imports lang/build/current/{BUILD.json,prelude.js,primitives.json} and omits lang/build/previous with the reason"

    - id: MOD-ADAPTERS
      name: adapters
      uuid: nexus-project-spine-adapters-v1-0000-2026-1029-001
      path: lib/adapters/contract.js
      phase: FA1_adapters_javascript_and_documents
      description: "AD1's minimum, as two real adapters need it: forFile(path) picks an adapter; each adapter answers parse(text), units(text), symbols(text), dependencies(text, path). lib/adapters/javascript.js wraps code-intel (statement starts, declarations) and the require/import scan, and node --check for parse; lib/adapters/documents.js reads markdown sections and the paths and links a document names. Any answer may be unknown."
      deps: [{ name: code-intel }]
      exports:
        - "forFile(path) → adapter | null"
        - "adapter.parse(text, path) → { ok, error?, verdict: pass|fail|unknown }"
        - "adapter.units(text) → [{ kind, name, start, end, exported, section }]"
        - "adapter.symbols(text) → string[]"
        - "adapter.dependencies(text, path) → [{ spec, kind, line }]"
        - "conformance(adapter) → { ok, failures }"
      gate_pipeline:
        - "GATE-FA1-001: a file's extension → its adapter (javascript: .js .cjs .mjs .jsx .ts .tsx; documents: .md .spec)"
        - "GATE-FA1-002: every method answers or says unknown; none throws"
      behavioral_contracts:
        - "tools above the adapters never require code-intel or the require scanner themselves"
      error_paths:
        - "a file no adapter reads → forFile returns null; the caller marks it unknown"
      acceptance:
        - "both adapters pass the conformance check; the JS adapter reads Emerge's emerge-kernel.js units and requires"

    - id: MOD-SPINE
      name: spine
      uuid: nexus-project-spine-spine-v1-0000-2026-1029-001
      path: lib/project-spine.js
      phase: FA2_the_registry_is_the_spine
      description: "scan({ files, project }) builds the Spine from a project's files through the adapters: every file an adapter reads is a component; every relative require resolved like Node (the path, .js/.cjs/.mjs/.json, /index.js) is a wire discovered by that adapter; a document's file references are wires of kind reference; what resolves to nothing is unknown. merge(old, next) keeps declared edges across rescans. check(spine, files) says the drift: wires the code has that the spine lacks, wires the spine has that the code lost, components added or gone. text(spine) is nexus.spine.json."
      deps: [{ name: adapters }]
      schema_refs: [Spine, SpineComponent, SpineWire]
      exports:
        - "scan({ files: [{ path, content }], project }) → Spine"
        - "merge(old, next) → Spine"
        - "check(spine, files) → { ok, added, gone, wiresAdded, wiresGone }"
        - "componentId(project, path) → string"
        - "resolve(fromPath, spec, paths) → path | null"
        - "SPINE_FILE = 'nexus.spine.json'"
      gate_pipeline:
        - "GATE-FA2-001: files → adapters → components"
        - "GATE-FA2-002: each dependency → resolve → wire with evidence, or unknown"
        - "GATE-FA2-003: the old spine's declared edges carried over"
      behavioral_contracts:
        - "the same tree scanned twice gives the same spine (sorted, no timestamps in the comparison)"
      error_paths:
        - "a file that fails to read → in problems, the rest scanned"
      acceptance:
        - "Emerge's spine names every .js file, its requires as wires, and counts the requires that resolve to nothing"

    - id: MOD-REFACTOR
      name: refactor
      uuid: nexus-project-spine-refactor-v1-0000-2026-1029-001
      path: lib/project-refactor.js
      phase: FA3_refactor_through_the_registry
      description: "A refactor is asked of the registry, by component id: move(spine, files, { id, to }) moves a component's file and rewrites every require that reaches it (found through the spine's wires, not a grep) and the moved file's own relative requires; rename(spine, { id, name }) renames a component in the registry. Each returns a plan: the writes (path, before, after), the moves, and the spine after. verify(plan, files) re-scans the tree as it would be and refuses a plan that leaves a wire unresolved that resolved before."
      deps: [{ name: spine }]
      schema_refs: [Spine]
      exports:
        - "move(spine, files, { id, to }) → { ok, writes, moves, spine, refused }"
        - "rename(spine, { id, name }) → { ok, spine }"
        - "verify(plan, files) → { ok, lost }"
      gate_pipeline:
        - "GATE-FA3-001: the component id → its file and the wires into it"
        - "GATE-FA3-002: each consumer's require text → the new relative path, same quote style, extension kept as written"
        - "GATE-FA3-003: the tree after → rescan → no resolved wire lost"
      behavioral_contracts:
        - "nothing is written by move or rename; the caller applies a verified plan"
      error_paths:
        - "the target path taken → refused"
        - "an unknown component id → refused"
      acceptance:
        - "moving a component in a small tree rewrites both consumers and its own require; the rescan loses no wire"

    - id: MOD-SPLIT
      name: split
      uuid: nexus-project-spine-split-v1-0000-2026-1029-001
      path: lib/project-split.js
      phase: FA4_one_component_one_file
      description: "plan(file, text, { by }) breaks a CommonJS file into one file per component under <dir>/<base>/: a component is a banner section (// ── name ──) when the file has two or more, else each top-level declaration. Requires are copied to the pieces that use them (paths rewritten); a top-level let/var that is reassigned keeps every unit that touches it in one piece; units in a cycle are merged; anything using __filename, require.main or module beyond its exports stays in the door. The door (the old path) requires the pieces and keeps its side-effect statements and its module.exports as written. verify(plan, root) loads the old and new file in a child process and compares every export's name and type; candidates(spine, files) lists files holding several components."
      deps: [{ name: adapters }, { name: spine }]
      schema_refs: [SplitPlan]
      exports:
        - "plan(path, text, { by, minUnits }) → SplitPlan"
        - "verify(plan, { root }) → { ok, before, after, diff }"
        - "candidates(files, { minUnits }) → [{ path, units, sections }]"
      gate_pipeline:
        - "GATE-FA4-001: units from the JS adapter → groups (sections or declarations)"
        - "GATE-FA4-002: identifier uses between groups → shared mutable state merged → cycles merged"
        - "GATE-FA4-003: pieces written with only the requires they use; __dirname in a piece becomes the old directory"
        - "GATE-FA4-004: old and new loaded apart → same export names and types, else refused"
      behavioral_contracts:
        - "what required the old path keeps working: the door exports the same names"
      error_paths:
        - "ES module or TypeScript → refused (said)"
        - "fewer than two groups → refused: nothing to split"
      acceptance:
        - "a file of three sections becomes three pieces and a door; the verify finds the same exports; the spine after names the pieces wired to the door"

    - id: MOD-CONVERT
      name: convert
      uuid: nexus-project-spine-convert-v1-0000-2026-1029-001
      path: lib/project-convert.js
      phase: FA5_convert_documents_and_plans
      description: "mdToSpec(path, text, { files }) makes an emerge-format spec from a markdown file: meta from spec-from-markdown, sections (each heading's text kept whole), a module for every repo file the document names (its exports from the adapter), and open: what a reader must still add for full depth. specPlan(text, specPath) reads a spec's hard-coded build plan (modules[].build: state, file, blocked_by, next; decisions with status OPEN) into a Nexus phasemap: one phase per module (built → DONE, partial or not_built → OPEN with its next), depends_on from blocked_by (module ids and decision ids resolved to their phases and decisions), files, spec and blocks named; parsed back by the phasemap parser. plan(files) lists what would be converted."
      deps: [{ name: spec-from-markdown }, { name: roadmap-import }, { name: adapters }]
      exports:
        - "mdToSpec(path, text, { files, project }) → { target, text, modules, sections, open }"
        - "specPlan(text, { specPath, name }) → { target, text, phases, decisions, next }"
        - "plan(files) → { mds: [{ path, target, exists }], specPlans: [{ path, target, modules }] }"
      gate_pipeline:
        - "GATE-FA5-001: an md → sections and file references → spec text (js-yaml dump) → parsed back"
        - "GATE-FA5-002: a spec with modules[].build → phases and decisions → phasemap text → parsed back with every depends_on resolved"
      behavioral_contracts:
        - "the md and the spec's build block stay; the converted files are written beside them"
      error_paths:
        - "a spec with no build plan → not a plan (left out, said)"
        - "a blocked_by naming nothing known → kept as a note, not a dangling edge"
      acceptance:
        - "Emerge's spec/cie-eg.spec becomes a phasemap with one phase per module and its open decisions; BUILDING.md becomes a spec naming build-spec.js with its exports"

    - id: MOD-DOOR
      name: door
      uuid: nexus-project-spine-door-v1-0000-2026-1029-001
      path: idearium/api/index.js
      phase: FA6_routes_and_commands
      description: "Idearium's routes over a repo: GET /api/repos/:uuid/spine (scan, the drift against nexus.spine.json), POST …/spine (write it), POST …/refactor (move | rename; apply:true writes through the repo layer), GET …/split-candidates, POST …/split (path; apply:true), GET …/convert (the plan), POST …/convert (apply), GET …/finish (one checklist: import omissions, spine drift, unknown wires, split candidates, docs and plans not converted, phases ready). Commands repo spine, repo refactor, repo split, repo convert, repo finish."
      deps: [{ name: spine }, { name: refactor }, { name: split }, { name: convert }, { name: repo-layer }]
      exports: ["routes repo.spine, repo.spine.write, repo.refactor, repo.split-candidates, repo.split, repo.convert, repo.convert.apply, repo.finish", "commands repo.spine, repo.refactor, repo.split, repo.convert, repo.finish"]
      gate_pipeline: ["GATE-FA6-001: read the repo's files through the repo layer", "GATE-FA6-002: an apply writes through writeTextFile (a repo version each), then rewrites nexus.spine.json"]
      behavioral_contracts: ["GET never writes; a POST without apply:true returns the plan only"]
      error_paths: ["no such repo → 404", "a refused plan → 409 with the reason"]
      acceptance: ["repo finish <repo> on Emerge lists its unconverted docs, its build plan, its split candidates and its unknown wires"]

    - id: MOD-SCREEN
      name: screen
      uuid: nexus-project-spine-screen-v1-0000-2026-1029-001
      path: idearium/ui/js/repo-spine.js
      phase: FA7_the_screen
      description: "The repo's Spine tab in Idearium: the finish checklist; components with their wires and evidence; split candidates with Preview and Split; Convert with the files it would write; Write spine. Every button shows the plan first and applies on a second press."
      deps: [{ name: door }]
      exports: ["renderSpine(container, repo)"]
      gate_pipeline: ["GATE-FA7-001: GET finish → the checklist", "GATE-FA7-002: Preview → the plan → Apply"]
      behavioral_contracts: ["no button writes without a shown plan"]
      error_paths: ["a route error → said in the tab"]
      acceptance: ["driven in Clear Glass: the tab lists the checklist, a split preview shows its pieces"]

    # 0.60.286 FA8–FA10 — James, 2026-10-29: "yes, and can you do what you can to get idearium to work dynamically? like type in the cli,
    # determine context needed, build dag. search the project for context, ask user about any gaps, then contract, etc"
    - id: MOD-INTENT-FLOW
      name: intent-flow
      uuid: nexus-project-spine-intent-flow-v1-0000-2026-1029-001
      path: lib/intent-flow.js
      phase: FA8_intent_to_contract
      description: "run({ text, files, project, answers }) takes what he typed and goes, in his order: the intent (verb, terms, paths named); the context needed (the components the terms and paths point at, scored, through the spine); the DAG (those components, what they use first, who uses them after, ordered so a dependency is built before what needs it); the context found (each component's matching lines); the gaps (a term found nowhere, a path that does not exist, two components tied for one term, no test near the change, no done-when) each as a question with options; then the contract — RAID's v2 contract (context gate with the refs, one build gate per DAG node in order, a verify gate with the tests) — once every blocking gap has an answer. Deterministic: no model is asked."
      deps: [{ name: spine }, { name: adapters }]
      exports:
        - "run({ text, files, project, answers }) → { stages: [{ id, say }], intent, needed, dag, found, gaps, contract | null, blockedBy }"
        - "STAGES = ['intent', 'context-needed', 'dag', 'context-found', 'gaps', 'contract']"
      gate_pipeline:
        - "GATE-FA8-001: text → verb, terms, named paths"
        - "GATE-FA8-002: terms + paths → scored components (path 3, exports 2, content 1) → the top ones"
        - "GATE-FA8-003: components + spine wires → DAG (uses before, used-by after) → topological order"
        - "GATE-FA8-004: each component → its lines that hold the terms"
        - "GATE-FA8-005: gaps → questions with options; a blocking gap unanswered → no contract, said"
        - "GATE-FA8-006: answers → the v2 contract (cortex/core/raid/contract-gates.js scaffold shape), validated"
      behavioral_contracts:
        - "the user is asked last, and only about what the project could not answer"
        - "the contract names every file it will touch and the order"
      error_paths:
        - "an empty intent → refused"
        - "no component matches → a gap asking which part of the project it is about"
      acceptance:
        - "an intent naming the gig menu finds clear-glass/src/autofill/gig-menu.js, orders its dependency first, asks for done-when, and with the answer writes a contract whose build gates follow the DAG"

    - id: MOD-INTENT-DOOR
      name: intent-door
      uuid: nexus-project-spine-intent-door-v1-0000-2026-1029-001
      path: idearium/cli/route-commands.js
      phase: FA9_the_cli_and_route
      description: "POST /api/repos/:uuid/intent { text, answers, write } runs the flow over the repo's files; write:true saves the contract at contracts/<id>.contract through the repo layer. The command repo do <repo> \"<what you want>\" prints each stage as it lands, asks each gap at the terminal (its options numbered; Enter keeps the first), then runs again with the answers; --write saves the contract, then contract gates / contract run take it from there."
      deps: [{ name: intent-flow }, { name: repo-layer }]
      exports: ["route repo.intent", "command repo.do"]
      gate_pipeline: ["GATE-FA9-001: the flow → the stages printed → each gap asked → the flow again with the answers → the contract"]
      behavioral_contracts: ["nothing is written without --write (or write:true)"]
      error_paths: ["no such repo → 404", "not a terminal → the gaps are printed with --answer id=value to give them"]
      acceptance: ["test-intent-flow IF-03: the command row builds the request; the route answers the stages and writes the contract"]

    - id: MOD-INTENT-SCREEN
      name: intent-screen
      uuid: nexus-project-spine-intent-screen-v1-0000-2026-1029-001
      path: idearium/ui/js/repo-intent.js
      phase: FA10_the_do_box
      description: "On the Finish tab, a Do box: type what you want; the stages appear (intent, context needed, the DAG in order, the lines found); each gap is a question with a dropdown of its options or a free answer; Contract writes it when every blocking gap is answered."
      deps: [{ name: intent-door }]
      exports: ["renderIntent(el, repo)"]
      gate_pipeline: ["GATE-FA10-001: text → POST intent → stages → answers → POST intent with answers and write"]
      behavioral_contracts: ["a gap is asked once; an answer stays while the text does"]
      error_paths: ["a route error → said in the box"]
      acceptance: ["test-intent-flow IF-04 in Clear Glass: typed, the DAG and a gap's dropdown show; answered, the contract is written"]

  events:
    idearium:
      - "idearium.repo.spine.written { repoUuid, components, wires, unknown }"
      - "idearium.repo.refactored { repoUuid, op, id, writes }"
      - "idearium.repo.split { repoUuid, path, pieces }"
      - "idearium.repo.converted { repoUuid, specs, phasemaps }"

  enforcement:
    gates:
      - { id: GATE-FA-KEEP-TRACKED, name: keep-tracked, severity: fatal, check: "a tracked build folder survives the import; a gitignored one is omitted with its reason", on_failure: "suite red" }
      - { id: GATE-FA-EVIDENCE, name: evidence, severity: fatal, check: "every wire carries evidence; unresolved is unknown", on_failure: "suite red" }
      - { id: GATE-FA-PROPOSAL-FIRST, name: proposal-first, severity: fatal, check: "refactor, split and convert return plans; only apply writes", on_failure: "suite red" }
      - { id: GATE-FA-SAME-EXPORTS, name: same-exports, severity: fatal, check: "a split's door exports the same names and types", on_failure: "suite red" }
      - { id: GATE-FA-KEEP-SOURCE, name: keep-source, severity: fatal, check: "conversion leaves its sources in place", on_failure: "suite red" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0"
    - "tests/modules/test-project-spine.test.js — each module's acceptance"
