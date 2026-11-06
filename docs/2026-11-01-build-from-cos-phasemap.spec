# docs/2026-11-01-build-from-cos-phasemap.spec — build a new system from COS: Add → Build → the spec workshop, and the workshop as Nexus's
# one document editor (templates, schemas, nodes, specs, code). The ideas and the calls are James's; the reading of them, the cut into
# phases and the order are the coder's, said where they are.

origin: >-
  James, 2026-11-01: "merge and push. show me the ui. / i want to make sure i can build new systems. like i want to make a compiler. so say i
  click add and theres a option to build, which would have open the spec workshop. / i want the spec workshop to also include templates,
  schemas, nodes, ide, for all of nexus. like make a generalized document editor. like how it has templates, maybe have them sorted by type,
  date, or recent, like a dropdown menu. / maybe expand the spec workshop using the zip"
  Sent with: forge-ide.zip, living-editor-v2.zip, rheon-ide-v3.3.0.zip, open-loops-v0.2.zip and OPEN-LOOPS-SPEC.md
  (_archive/imports/2026-11-01-uploads/MANIFEST.md).

status: "MAPPED 2026-11-01. Nothing built by this map yet."

stands_on: >-
  Read 2026-11-01 (reuse before build, §8.6): Idearium's spec workshop (idearium/ui/workshop.html, the workshop.* rows, his agents for it,
  AC5/AC7 0.60.335), the spec library (idearium/ui/spec-library.html; idearium/spec/spec-library.spec SE1–SE6), the templates
  (idearium/spec-engine/templates/: genesis, architecture, axioms, schemas, eravos-canvas …), the node schemas (lib/node-schemas/), COS's 24
  archetypes (cos/archetype: nexus-system, eravos-canvas, compiler, …), COS's host (create, set-runtime, start, stop, destroy through its
  gates), COS's UI and its Add (0.60.337; MG_D18 "no side bar … all compartments … deploying, adding, building"), the emerge spec compiler
  (lib/emerge/compiler), and his uploads: Living Editor v2 (engine.js: SyntaxEngine, BehavioralEngine, HashChain; store.js — no DOM in the
  engine), FORGE (compiler, editor, file manager, live preview, rewind), Rheon IDE v3.3.0 (modules with MANIFESTs, spec-builder among them).

readings_to_confirm:
  - "\"expand the spec workshop using the zip\": read as the editor zips (Living Editor v2 for the editing engine, FORGE for compile/preview/files, Rheon's spec-builder module), not Open Loops, which is a project of its own. To confirm which zip he meant."
  - "\"build\" under Add: read as a new system made from a finished spec — the workshop writes the spec, COS makes the compartment from the nexus-system archetype, Idearium's pipeline builds its phases. To confirm that \"build\" is not only \"open the workshop\"."
  - "\"for all of nexus\": read as one editor over every document kind Nexus keeps (spec, template, schema, node type, phasemap, code), each through its owner's routes — not a copy of them in Idearium."

decisions:
  BC_D0_add_has_build:
    status: DECIDED 2026-11-01 (his)
    chosen: "COS's Add offers Build: it opens the spec workshop on a new spec for the system named, from a template he picks; a compiler is the first one he names."
    by: "his, 2026-11-01: \"so say i click add and theres a option to build, which would have open the spec workshop.\""
  BC_D1_one_document_editor:
    status: DECIDED 2026-11-01 (his)
    chosen: >-
      The spec workshop grows into Nexus's one document editor: specs, templates, schemas, node types, phasemaps and code in one place, a
      library beside it listing every document of every kind, sortable by type, date or recent from one dropdown, with templates to start
      from. Each document is read and written through the system that owns it (§5.15), never copied into the editor.
    by: "his, 2026-11-01: \"i want the spec workshop to also include templates, schemas, nodes, ide, for all of nexus. like make a generalized document editor. like how it has templates, maybe have them sorted by type, date, or recent, like a dropdown menu.\""
    by_the_axioms: "§8.6 (the workshop, the library and the templates exist: extend, do not rebuild), §5.15 (each owner serves its documents), §0.3 (a document edited is versioned in Versionium, §17.12)"
  BC_D2_his_editors_are_the_substrate:
    status: DECIDED 2026-11-01 (his; which zip, to confirm)
    chosen: >-
      The editing engine is his Living Editor v2's (SyntaxEngine, BehavioralEngine, HashChain; pure computation, no DOM), brought in whole
      with its origin named; FORGE's compile-and-preview and file manager and Rheon's spec-builder are read for what Nexus lacks before any is
      written anew.
    by: "his, 2026-11-01: \"maybe expand the spec workshop using the zip\""

  BC_D3_create_opens_templates_prefilled:
    status: DECIDED 2026-11-01 (his)
    chosen: >-
      Create compartment opens the templates; each template is built out as far as it can be (structure, skeleton, spec sections, defaults),
      and his need or idea is slotted into it, so he writes only what is his. Once a system is in COS it gets resource management of its own.
    by: "his, 2026-11-01: \"once each system is in cos, we can have resource management per system. Like i want the create compartment to open the templates. i also want to have the templates built as much as possible, and the need or idea slotted into it.\""
  BC_D4_the_workshop_is_an_idearium_module:
    status: DECIDED 2026-11-01 (his; "maybe" — to confirm)
    chosen: >-
      The spec workshop becomes a full module of Idearium (its own folder, server routes, registry entry and pages). COS hooks into Idearium's
      compartments; RAID balances the load; the copilot works on whatever page he is on, with the same Clear Glass features (page map, element
      picker, fill, macros) it has in the browser.
    by: "his, 2026-11-01: \"the spec workshop, aybe make it a full module of idearium. like cos hooks into the idearium compartments, raid for load balancing, copilot for the whatever page im on, can we specific using the same clearglass features.\""
  BC_D5_organized_by_module_core_at_the_root:
    status: PROPOSED 2026-11-01 (his question, the coder's answer; his to decide)
    chosen: >-
      One folder per system; everything a system owns inside it; at each system's root the core it is built from, the same skeleton for all
      (genesis's nexus-system archetype: server.js, config, compartment.json, registry-components.js, spec/, data/, ui/, settings). lib/ keeps
      only what every system is built from (the kernel and the primitives); a lib file used by one system moves into that system (measured
      2026-11-01: 98 such files, 52 of them Idearium's), and the 146 lib files nothing requires are archived after a check.
    by: "his, 2026-11-01: \"we need nexus to be more organized, by module, then all relevant components in each module folder. like the core for each module, what each system is built from, should be in the root. what do you think?\""
  BC_D6_settings_in_every_system:
    status: DECIDED 2026-11-01 (his)
    chosen: "Every system has its settings at its root and a settings page; COS shows and edits any system's settings, each value with its layer (default, template, system, his)."
    by: "his, 2026-11-01: \"also settings, are always important of managing systems.\""
  BC_D7_the_workshop_is_deterministic_first:
    status: DECIDED 2026-11-06 (his)
    chosen: >-
      The workshop builds deterministically first: a document is made from its template, its schema and Pillar's primitives, checked by
      them, and saved through a gate; an agent (the probabilistic part) only proposes on top, and a proposal is a change like any other,
      checked and gated. The same document from the same template and inputs is byte-identical.
    by: "his, 2026-11-06: \"what about the deterministic workshop\"; and 2026-10-05 (RS4/RS8, docs/2026-10-05-spec-workshop-rebuild-phasemap.spec): \"i wanted it to use deterministic primitives, and then anything on top is probabilistic. like a constraint field, or emergence.\""
    by_the_axioms: "§0.4 (deterministic first), PIL_D0 (Pillar's primitives), BC_D1 (one editor), REWIND_D0 (a gate rewinds a refused save)"

phases:
  BC0_the_full_spec:
    status: OPEN
    depends_on: [BC_D0_add_has_build, BC_D1_one_document_editor, BC_D2_his_editors_are_the_substrate]
    files: [idearium/spec/document-editor.spec, docs/SPEC-REGISTRY.spec]
    does: "the full spec in emerge's module format (his 2026-10-20 rule) for the document library, the editor, the document kinds and their owners' routes, and COS's Build; compiles at specDepth 1.0"
    proof: "test-substrate-spec compiles it with every module at full depth"
  BC1_the_document_library:
    status: OPEN
    depends_on: [BC0_the_full_spec]
    files: [idearium/spec-engine/library.js, idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/spec-library.html]
    does: "every document of every kind (spec, template, schema, node type, phasemap, code) in one list from its owner's routes: kind, owner, path, updated, last opened; sort by type, date or recent from one dropdown; the same list as a command row"
    proof: "the list's counts equal each owner's own count; each sort orders as said; the row prints what the screen shows"
    expanded_2026_11_06: >-
      James, 2026-11-06: "what about the deterministic workshop. like add like a framework builder, ide, like i want it to be like sublime, but then with cos have a universal compilier, for electron, android sdk app builder, pwa builder, node, like cos can be the complete compartment system for everything, like gates, work surface/area, like event gates betwen pipeline steps, templates, architetypes, schemas, like cos needs that already from the ui roadmap." · "like the workshop can create, edit, manage, any of the documents, nodes, templates, shcems, databases in cos, idearium, component registry, interaction contract, etc". And the same day: "The workshop is for nexus. It’s for yaml files. I want it for all of the node files, schemas, templates, and specs,
      eg files. Image files etc." The kinds grow: node files (each against its schema, lib/node-schemas), schemas, templates, archetypes
      (cos/archetype), specs, phasemaps, YAML, Emerge (.eg), Markdown, JSON, images, each system's database tables, each system's component
      registry (registry-components.js) and interaction contract (interaction-contract.json, COS's contract.json). Create, edit and manage, each
      through its owner's routes (§5.15): a table is edited through its system's route, never its file. Absorbs RS6a (written an hour earlier
      in docs/2026-10-05-spec-workshop-rebuild-phasemap.spec, superseded here, kept).
    files_added: [lib/node-schemas, cos/archetype, "*/registry-components.js", "*/interaction-contract.json", cos/manager/contract.json, tests/modules/test-workshop-kinds.test.js]
    proof_added: "every kind counted in the tree is in the library's table (none unknown); a registry entry and a contract page edited and read back from their owner's route"
  BC2_the_editor:
    status: OPEN
    depends_on: [BC1_the_document_library, BC_D7_the_workshop_is_deterministic_first, MR11_rewind_the_mind]
    files: [idearium/ui/workshop.html, idearium/ui/editor, _archive/imports/2026-11-01-uploads/living-editor-v2.zip]
    does: "the workshop opens any document from the library in one editor: Living Editor v2's engine for syntax and history (its HashChain), a form for schema-shaped documents, the spec's sections for specs; save goes to the owner's route and to Versionium"
    proof: "in Clear Glass: a template, a schema and a spec opened, edited and saved; each change on the owner's disk and in Versionium; a bad schema value refused beside its field"
    expanded_2026_11_06: >-
      His "ide, like i want it to be like sublime". The editor is an IDE in Sublime's manner: fast to open, a command palette, go to anything
      (file, symbol, block id), multiple cursors, split panes, tabs, a file tree by system and kind, a minimap, find and replace across files,
      syntax for every kind (RS3's detect, BC1's table), keyboard first. Deterministic first (BC_D7): forms from schemas, documents from
      templates; agents propose on top. Every save goes through a gate (REWIND_D0): checked against its kind, recorded in Versionium (§17.12),
      and a refused save leaves the file as it was. Images in a viewer with crop, resize and annotate (to confirm). Absorbs RS6b, RS6c and RS6d
      (superseded, kept).
    depends_on_added: [BC_D7_the_workshop_is_deterministic_first, MR11_rewind_the_mind]
    proof_added: "in Clear Glass: the palette opens a file by name, two cursors edit two lines, a split shows two files; a save the gate refuses leaves the file byte-identical, said"
  BC3_templates_to_start_from:
    status: OPEN
    depends_on: [BC1_the_document_library]
    files: [idearium/spec-engine/templates, idearium/ui/workshop.html]
    does: "New document: pick a kind, then a template of that kind (the dropdown sorted by type, date or recent); a compiler template among the system templates"
    proof: "a new spec made from the compiler template opens with its sections filled from the template"
  BC4_build_from_cos:
    status: OPEN
    depends_on: [BC2_the_editor, BC3_templates_to_start_from, MG_D18_no_side_bar_every_compartment]
    files: [cos/ui, cos/manager/server.js, cos/manager/contract.json]
    does: "COS's Add has Build: name the system, pick a template, and the workshop opens on its new spec; when the spec is done, COS makes its compartment from the nexus-system archetype and hands its phases to Idearium's pipeline (COS asks Idearium by route)"
    proof: "in Clear Glass: Add → Build → a compiler's spec written from the template → its compartment made, its phases queued; each step on COS's ledger"
  BC5_open_loops_imported:
    status: OPEN
    depends_on: [MG19_the_spec_bundle, MG20_add_deploy_connect]
    files: [_archive/imports/2026-11-01-uploads/open-loops-v0.2.zip, docs/open-loops/OPEN-LOOPS.spec]
    does: "his Open Loops (a sovereign project) added to COS through Add → Import once the intake exists, its spec as its repo's living spec"
    proof: "Open Loops appears as its own compartment with its tests run from its cockpit"

  BC6_the_universal_compiler:
    status: OPEN
    depends_on: [BC4_build_from_cos, MB2_android_compartment, MG22_template_and_archetype_builder]
    files: [cos/manager/compile.js, cos/archetype/registry.js, cos/manager/server.js, cos/manager/contract.json, cos/ui/builder, tests/modules/test-cos-compile.test.js]
    requires: [node, "per target its own toolchain, said when missing: Electron (electron-builder), Android (the Android SDK: cmdline-tools, build-tools, Gradle, a JDK), PWA (none beyond the browser), Node (node)"]
    prerequisites: ["a compartment built from a spec (BC4)", "the android-app template (MB2) for the Android target"]
    does: >-
      James, 2026-11-06: "what about the deterministic workshop. like add like a framework builder, ide, like i want it to be like sublime, but then with cos have a universal compilier, for electron, android sdk app builder, pwa builder, node, like cos can be the complete compartment system for everything, like gates, work surface/area, like event gates betwen pipeline steps, templates, architetypes, schemas, like cos needs that already from the ui roadmap.". COS compiles any compartment for a target: Electron (a desktop app, Windows first), Android (an APK through the Android SDK and
      Gradle, MB2's template), PWA (a web app with its manifest and service worker) and Node (a service COS runs). One command and one screen:
      pick the compartment, pick the target, build; each step a pipeline step with a gate between steps (PA4, MB1: already built), the output and
      its checksum kept, a missing toolchain named rather than guessed. Each target is a template of the archetype builder (MG22), so a new target
      is a template, not new code.
    readings_to_confirm:
      - "\"universal compiler\": (a) the coder's reading: COS packages a compartment for each target with that platform's own toolchain; (b) Emerge as the
         one compiler that emits every target (emerge.exe, CIE-EG). (a) can be built now; (b) is Emerge's road."
      - "\"work surface/area\": read as Idearium's work surface (the Code tab's area: code, diff, versions, run) brought into COS beside the builder. To confirm."
    proof: "a fixture compartment compiled to Node and to a PWA (both checked: the service runs, the PWA's manifest and worker load); Electron and Android each either built or refused naming the missing toolchain"

build_order: "BC0 → BC1 → (BC2, BC3) → BC4 → BC6 (with MB2 and MG22). BC4 also waits on the open canvas (MG_D18), where Add lives. BC5 waits on MG19/MG20."

# ── ADDENDUM 2026-11-01 (b) — measured for his decoupling question, before any move ────────────────────────────────────────────────────
# James: "tell me how close we are to decoupling each system. which systems fully use the node based memory, database, and aligns with the
# architecture docs." Measured with lib/system-boundary.js sovereignty() and homes(), scripts/systems-report.js and each folder, on main
# after #206. Sovereign (no crossing out, none in, a registry): only components. No crossings out: ollama, loom. Furthest: idearium (31 out),
# orchestrator (26), copilot (21), guardian (19), cortex (15 out, 129 in: everyone reaches into it). lib reaches up into systems 250 times.
# Files requiring cortex's shared database (cortex/memory/jaa-db.js) directly: lib 61, copilot 11, intelligence 6, versionium 5,
# orchestrator 4, diagnostic 2, idearium 2, cos 1. A server.js door: guardian, copilot, loom, versionium, intelligence, ollama, diagnostic;
# none yet: cortex, idearium, orchestrator, clear-glass, architect, cos. Phases for BC_D3–BC_D6 follow once he answers BC_D5.
