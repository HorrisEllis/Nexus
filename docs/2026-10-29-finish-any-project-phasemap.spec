# Finish this or any other project: import whole, convert, the registry as the spine, refactor, one component one file (2026-10-29)

origin: >-
  James, 2026-10-29, uploading Emerge.zip: "remember the browser.html is the ui. take this, and import it into idearium, then create
  all the capability to finish this or any other project in the repo. convert mds, hardcoded phasemaps, refactor tool for the
  architecture to use the component registry as the spine, decomposition tool for breaking up each component into it's own file and
  wire it into the spine."

spec: docs/project-spine.spec
status: "FA0–FA7 built 0.60.286"

## Grounded (read from the code and the zip, 2026-10-29)
- The zip is Emerge/ (247 entries: 101 .js, 40 .eg, 7 .spec, 10 .md). Idearium's import (repo.import-archive → lib/zip-ingest.js) strips
  the Emerge/ wrapper, but skips every folder named build: Emerge's lang/build/current (BUILD.json, prelude.js, primitives.json) is
  tracked source that eg.js loads, so an imported Emerge could not run its own language. Its .gitignore ignores only
  lang/build/previous/ and emerge/output/*. The 40 .eg files were kept as files but never chunked (.eg not in text_ext).
- There is no browser.html in the zip. Emerge's IDE (emerge/emerge-ide.js) serves emerge/ui/index.html, also not in the zip.
- Substrate that exists: lib/project-decompose.js (a project into the component STORE, one file one component — copies, not the
  project's own architecture); lib/code-intel (statement starts, declarations, per language); lib/spec-from-markdown.js (md → a
  chunked spec: envelope); idearium/repo/roadmap-import.js (phases.json, PHASEMAP.md, SPEC.md, ISSUES.md → a phasemap); the repo
  layer's writeTextFile / moveFile (each a version); repo-carve's Node-style require resolution.
- Not built, and planned since 2026-10-19 in docs/2026-10-19-infrastructure-spine-phasemap.spec: IN3 (the registry is the spine, for
  Nexus and built projects alike) and AD1/AD2/AD4 (the adapter contract, the JS and documents adapters).
- Emerge's "hard-coded phasemap": spec/cie-eg.spec carries its plan inside the spec — modules[].build { state, file, blocked_by,
  existing, next } and decisions D1–D9 (status OPEN). Nexus reads plans only from *-phasemap.spec, so none of it showed.

decisions:
  FA_D1_browser_html_reading:
    status: "READING 2026-10-29 — to confirm (his words, USER_AUTONOMY)"
    chosen: >-
      "remember the browser.html is the ui": the zip has no browser.html, and Emerge's IDE serves a ui/index.html that is not in it
      either. The coder's reading: Clear Glass's renderer/browser.html is the UI he works in, and Idearium's pages are opened inside it,
      so the new screen is Idearium's (it owns repos, §5.15) and shows in Clear Glass. If Emerge has a browser.html of its own as its
      UI, it was not in this zip: send it, and Emerge's IDE gets pointed at it.
    by_the_axioms: "§5.15 sovereignty (the repo screens are Idearium's); §0.1 evidence (the file is not in the zip)"
  FA_D2_registry_is_the_spine_reading:
    status: "DECIDED 2026-10-29 by his axioms — the reading is to confirm"
    chosen: >-
      "refactor tool for the architecture to use the component registry as the spine": the coder's reading is IN3, his plan of
      2026-10-19, carried to every project: one registry file per project (nexus.spine.json) names every component and every wire
      with its evidence; a refactor is asked of the registry by component id and the files follow; after any change the registry is
      checked against the code (drift is said). The code keeps its plain requires (rewriting every require into a registry lookup
      would make every project depend on Nexus at run time, which breaks one-system-down-breaks-none).
    by_the_axioms: "IN3; §5.15 / §5.9 (a project runs without Nexus); §0.1 (wires discovered from code, declared only where code cannot show)"
  FA_D3_split_keeps_the_door:
    status: DECIDED 2026-10-29 by his axioms
    chosen: >-
      A split leaves the old file at its path as the door: it requires the pieces and exports exactly what it exported, so nothing that
      required it changes. A component is a banner section when the file has them (Emerge's files use // ── name ── banners), else a
      top-level declaration. Proposal first; applied through the repo layer's versioned write; refused when the exports differ.
    by_the_axioms: "§0.3 nothing lost; REVERSIBILITY; §1.1 proven (old and new loaded and compared)"
  FA_D4_adapters_first:
    status: DECIDED 2026-10-29 by his axioms
    chosen: >-
      The new tools ask adapters (NC0's migration rule) — so the minimum of AD1 is built now with the two adapters that need it
      (javascript, documents). AD1 stays OPEN in the infrastructure map for its conformance suite across the old JS paths and NC1.
    by_the_axioms: "NC0; 'adapters grow only when a second real adapter needs a method'"

phases:
  FA0_import_keeps_what_the_project_tracks:
    status: DONE 0.60.286
    depends_on: []
    files: [lib/zip-ingest.js, idearium/idearium.config.json, idearium/lib/config-core.cjs]
    spec: docs/project-spine.spec
    blocks: [MOD-IMPORT-KEEPS-TRACKED]
    does: "the project's .gitignore decides what a generated folder is; .eg/.mjs/.cjs/.toml chunked"
  FA1_adapters_javascript_and_documents:
    status: DONE 0.60.286
    depends_on: [FA_D4_adapters_first]
    files: [lib/adapters/contract.js, lib/adapters/javascript.js, lib/adapters/documents.js]
    spec: docs/project-spine.spec
    blocks: [MOD-ADAPTERS]
    does: "forFile; parse, units, symbols, dependencies; conformance"
  FA2_the_registry_is_the_spine:
    status: DONE 0.60.286
    depends_on: [FA1_adapters_javascript_and_documents, FA_D2_registry_is_the_spine_reading]
    files: [lib/project-spine.js]
    spec: docs/project-spine.spec
    blocks: [MOD-SPINE]
    does: "scan, merge, check, nexus.spine.json"
  FA3_refactor_through_the_registry:
    status: DONE 0.60.286
    depends_on: [FA2_the_registry_is_the_spine]
    files: [lib/project-refactor.js]
    spec: docs/project-spine.spec
    blocks: [MOD-REFACTOR]
    does: "move and rename by component id; verify by rescan"
  FA4_one_component_one_file:
    status: DONE 0.60.286
    depends_on: [FA2_the_registry_is_the_spine, FA_D3_split_keeps_the_door]
    files: [lib/project-split.js]
    spec: docs/project-spine.spec
    blocks: [MOD-SPLIT]
    does: "sections or declarations → pieces + the door; verified in a child process"
  FA5_convert_documents_and_plans:
    status: DONE 0.60.286
    depends_on: [FA1_adapters_javascript_and_documents]
    files: [lib/project-convert.js]
    spec: docs/project-spine.spec
    blocks: [MOD-CONVERT]
    does: "md → emerge-format spec; a spec's build plan → a phasemap"
  FA6_routes_and_commands:
    status: DONE 0.60.286
    depends_on: [FA3_refactor_through_the_registry, FA4_one_component_one_file, FA5_convert_documents_and_plans, FA0_import_keeps_what_the_project_tracks]
    files: [idearium/api/index.js, idearium/cli/route-commands.js]
    spec: docs/project-spine.spec
    blocks: [MOD-DOOR]
    does: "spine, refactor, split, convert, finish — routes and commands"
  FA7_the_screen:
    status: DONE 0.60.286
    depends_on: [FA6_routes_and_commands, FA_D1_browser_html_reading]
    files: [idearium/ui/js/repo-spine.js, idearium/ui/index.html]
    spec: docs/project-spine.spec
    blocks: [MOD-SCREEN]
    does: "the Spine tab: checklist, components, split, convert"

  # ADDENDUM 2026-10-29 (0.60.286) — James, the same day: "yes, and can you do what you can to get idearium to work dynamically? like type in the
  # cli, determine context needed, build dag. search the project for context, ask user about any gaps, then contract, etc"
  # The order is his, verbatim, and the flow keeps it. Reuse: the spine (FA2) is the graph; RAID's v2 contract (cortex/core/raid/contract-gates.js)
  # is the contract, so contract gates / contract run take it from there; lib/agent-confidence-gate.js keeps its place inside a dispatch (this
  # is the same ladder, made visible, before any agent is asked).
  FA8_intent_to_contract:
    status: DONE 0.60.286
    depends_on: [FA2_the_registry_is_the_spine]
    files: [lib/intent-flow.js]
    spec: docs/project-spine.spec
    blocks: [MOD-INTENT-FLOW]
    does: "intent → context needed → DAG → context found → gaps (asked) → contract"
  FA9_the_cli_and_route:
    status: DONE 0.60.286
    depends_on: [FA8_intent_to_contract, FA6_routes_and_commands]
    files: [idearium/api/index.js, idearium/cli/route-commands.js]
    spec: docs/project-spine.spec
    blocks: [MOD-INTENT-DOOR]
    does: "POST /api/repos/:uuid/intent; repo do <repo> \"…\" asks each gap at the terminal"
  FA10_the_do_box:
    status: DONE 0.60.286
    depends_on: [FA9_the_cli_and_route, FA7_the_screen]
    files: [idearium/ui/js/repo-intent.js, idearium/ui/js/repo-spine.js]
    spec: docs/project-spine.spec
    blocks: [MOD-INTENT-SCREEN]
    does: "the Do box on the Finish tab: stages, DAG, gaps as dropdowns, Contract"

  # ADDENDUM 2026-10-29 (0.60.287) — James: "Each problem needs to build a dag using reverse end state reasoning." · "Yes the same way I reason.
  # Bidirectional causal changing." The decision is HL_D3_reverse_end_state in docs/2026-10-29-his-loop-phasemap.spec (its HL2 is this phase).
  FA11_bidirectional_causal_chain:
    status: DONE 0.60.287
    depends_on: [FA8_intent_to_contract]
    files: [lib/intent-flow.js]
    spec: docs/project-spine.spec
    blocks: [MOD-CAUSAL-CHAIN]
    does: "backward from the end state, forward from the change; the meeting set is the DAG; one-sided sets are gaps and side effects"
