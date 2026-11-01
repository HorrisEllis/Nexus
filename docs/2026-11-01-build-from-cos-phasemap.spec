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
  BC2_the_editor:
    status: OPEN
    depends_on: [BC1_the_document_library]
    files: [idearium/ui/workshop.html, idearium/ui/editor, _archive/imports/2026-11-01-uploads/living-editor-v2.zip]
    does: "the workshop opens any document from the library in one editor: Living Editor v2's engine for syntax and history (its HashChain), a form for schema-shaped documents, the spec's sections for specs; save goes to the owner's route and to Versionium"
    proof: "in Clear Glass: a template, a schema and a spec opened, edited and saved; each change on the owner's disk and in Versionium; a bad schema value refused beside its field"
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

build_order: "BC0 → BC1 → (BC2, BC3) → BC4. BC4 also waits on the open canvas (MG_D18), where Add lives. BC5 waits on MG19/MG20."
