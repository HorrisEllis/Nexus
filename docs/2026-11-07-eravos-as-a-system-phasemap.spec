# docs/2026-11-07-eravos-as-a-system-phasemap.spec — ERAVOS joins Nexus as a system, with COS as the hub of the whole ecosystem.
# ERAVOS stays its own repository (HorrisEllis/Eravos-Canvas); Nexus reaches it through its door, by way of COS. The idea and the direction
# are James's; the cut into phases, the order and every reading marked "to confirm" are the coder's.
# MAPPED 2026-11-07, before building (docs/CLAUDE.md rule 1). Nothing here is built before CIE11, EM2 and RF1 except what ERV_D3 names.

origin: >-
  James, 2026-11-07, after the coder found ERAVOS's Workshop spec (eravos-canvas/specs/eravos.workshop.spec, his "Agnostic", approved 2026-11-06
  15:55: "Nice. That's exactly it."): "im saying should we import it as a new system? make schemas and templates for packs and tools?" · "once
  emerge, warp v2 and the contraint relational field are done. i was thinking eravos could have the visual coding and debug envirement. look in
  other branches in nexus, context misssin" · then, shown what Nexus already holds and asked whether to map it: "Yes. Like cos becomes the hub for
  the nexus ego system". The same thread, a turn before: "i was thinking of importing eravos in as a system. and using that for a ui surface.
  especially since im adding a agnostic workshop and i feel it fits perfectly with that."

already_there_2026_11_07:
  # measured 2026-11-07, not from memory
  - "HorrisEllis/Eravos-Canvas (main b959893): 2,033 files; its own CLAUDE.md, axioms (11, his, 2026-11-06), specs/, competence ledger; schemas/
     tool, pack, suite, domain, mode, category; templates/ tool, tool-sound, pack, mode, category, domain (no suite template); serve.js."
  - "Nexus cos/archetype/eravos-canvas (58 files, last changed 2026-11-05): the same layout, a copy. Its schemas lack suite.schema.json and its
     tool.schema.json differs from ERAVOS's: two contracts (docs/CLAUDE.md rule 4), surfaced here, not collapsed."
  - "docs/2026-11-01-eravos-orchestration-tools-phasemap.spec (EO0–EO5, OPEN): Nexus's orchestration as ERAVOS tools, one door (COS's). Was not in
     docs/SPEC-REGISTRY.spec; registered with this map."
  - "docs/2026-11-01-the-compartment-phasemap.spec CP_D4 / CP11 (OPEN): CFR and RFR2 as a live diagnostic map on the ERAVOS canvas; since
     2026-11-07 CP11 waits on RF1, CF1 and EM2."
  - "docs/2026-11-03-registry-per-system-phasemap.spec PL_D9 (his): 'COS's system registry knows every door; calls and the CLI go through COS to a
     door.' Open there, his: where the system registry lives and whose it is."
  - "ERAVOS was deleted from the Nexus tree 2026-10-16 (0.60.83, his 'Delete it outright', docs/2026-10-16-eravos-removal-phasemap.spec). What was
     deleted was the in-tree copy; ERAVOS lived on in its own repository (130 merged pull requests)."

decisions:
  ERV_D0_cos_is_the_hub:
    status: "DECIDED 2026-11-07 (his); two readings to confirm"
    james: '"Yes. Like cos becomes the hub for the nexus ego system"'
    context: >-
      Asked three things: (1) what "import as a system" means — (a) registered and reached by routes, ERAVOS stays its own repository, or (b) its
      code copied into the tree; (2) which copy of the schemas and templates is the source — (a) the ERAVOS repository, or (b) COS's archetype;
      (3) whether to map it now. The coder's recommendation was (a), (a), and yes.
    chosen: "COS is the hub of the Nexus ecosystem: every system, ERAVOS among them, is known to COS and reached through it."
    readings_to_confirm:
      - "'ego system' read as 'ecosystem'. To confirm."
      - "'Yes' read as yes to mapping now (question 3). Whether it also answers (1) and (2) is not assumed: ERV_D1 and ERV_D2 stay open for him."
      - "'the hub' read as the answer to PL_D9's open question: the system registry is COS's. To confirm before ERV1 is built."
    by_the_axioms: "§5.9, §5.15 (one door), §5.16 (each system's registry is its own; the system registry connects them)"

  ERV_D1_registered_not_copied:
    status: "PROPOSED 2026-11-07 (the coder's, by the axioms) — his to confirm (question 1)"
    chosen: >-
      ERAVOS is a system of Nexus by registration: COS knows its door (process, port, health, its component registry) and reaches it there.
      Its code stays in its own repository and is never copied into the Nexus tree, so it can be swapped and run alone (its v1 ships on its own).
    by_the_axioms: "§5.9 (one system down breaks no other), §5.15 (reached by its routes, never its files), §17.13 (ERAVOS v1 is a project in its own language, JS until its v2)"

  ERV_D2_the_schemas_have_one_source:
    status: "OPEN — his (question 2); the coder recommends (a)"
    options: "(a) the ERAVOS repository is the source; COS's archetype is refreshed from it and checked against it · (b) COS's archetype is the source"
    why_a: "ERAVOS owns tools, packs and suites (§5.15); its copy is the newer one (suite.schema, the current tool.schema)"

  ERV_D3_order:
    status: "DECIDED 2026-11-07 (his)"
    james: '"once emerge, warp v2 and the contraint relational field are done. i was thinking eravos could have the visual coding and debug envirement."'
    chosen: >-
      Registration, the one schema source and the kind contract (ERV0–ERV4) are mapping and small; they can go before, if he asks, since the focus
      (Emerge first) holds. The visual coding and debug environment (ERV5) waits on CIE11, EM2, RF1 and CF1, as CP11 already does (his CIE_D5).

  ERV_D4_the_name:
    status: "OPEN — his"
    options: "'Workshop' (ERAVOS's spec) · 'Field' (his 2026-11-07 idea; 'field' already names the relational constraint field, RF1) · the workshop as the field's surface (his 2026-10-05: 'deterministic primitives, and then anything on top is probabilistic. like a constraint field, or emergence.')"

phases:
  ERV0_the_full_spec:
    status: OPEN
    depends_on: [ERV_D0_cos_is_the_hub, ERV_D1_registered_not_copied, ERV_D2_the_schemas_have_one_source]
    files: [cos/spec/eravos-in-the-hub.spec, docs/SPEC-REGISTRY.spec]
    requires: [node]
    prerequisites: ["his answers to ERV_D1 and ERV_D2"]
    does: >-
      The full spec in Emerge's module format (his 2026-10-20 rule): ERAVOS's door as COS sees it (its process, port, health, its registry
      entries: tools, packs, suites, the workshop's kinds), the schema source and its check, the kind contract. ERAVOS's own side of it is
      written in its repository (specs/), by its own rules (map, spec first, with a DAG — its axiom 8).
    proof: "test-substrate-spec compiles it with every module at specDepth 1.0, no BLACK"

  ERV1_eravos_in_the_system_registry:
    status: OPEN
    depends_on: [ERV0_the_full_spec, MG17b_registry_reads_the_declarations, RG_D0_the_registry_is_per_system]
    # and PL_D9 (his one door), docs/2026-11-03-registry-per-system-phasemap.spec decisions_in_planning: not a DAG node there, so named here
    files: [cos/manager/server.js, lib/system-registry.js, cos/spec/eravos-in-the-hub.spec]
    requires: [node, "an ERAVOS checkout on his machine (it is not in the Nexus tree)"]
    prerequisites: ["ERV_D0's third reading confirmed: where the system registry lives"]
    does: "COS knows ERAVOS: a declaration of its process (node serve.js), its port and its health, read like every system's compartment.json; GET /api/cos/systems lists it; COS starts, stops and checks it"
    proof: "GET /api/cos/systems names eravos with its state; stopping ERAVOS breaks no other system (§5.9)"

  ERV2_eravos_own_registry:
    status: OPEN
    depends_on: [ERV1_eravos_in_the_system_registry, RG_D0_the_registry_is_per_system]
    files: [cos/spec/eravos-in-the-hub.spec]
    requires: ["push access to HorrisEllis/Eravos-Canvas (built there, not in Nexus)"]
    prerequisites: []
    does: "ERAVOS's own component registry, in its own repository and served at its door: each tool, pack, suite and workshop kind an entry (route, command, events, contract), so COS reaches each through ERAVOS"
    proof: "COS reads ERAVOS's registry through its door; no ERAVOS file is read by Nexus"

  ERV3_one_schema_source:
    status: OPEN
    depends_on: [ERV_D2_the_schemas_have_one_source]
    files: [cos/archetype/eravos-canvas/schemas/tool.schema.json, cos/archetype/eravos-canvas/schemas/suite.schema.json, cos/archetype/eravos-canvas/templates, tests/modules/test-eravos-schema-source.test.js, tests/modules/run-all.js]
    requires: [node]
    prerequisites: []
    does: >-
      His "make schemas and templates for packs and tools": the tool and pack schemas and templates exist (in both copies); the copies are
      made one by ERV_D2's answer, and a check fails when they drift. What neither copy has is added: a suite template (a tool with each
      component wired in — ERAVOS's axiom 3).
    proof: "the check fails on a planted difference and passes on the real tree; a suite made from the template validates against suite.schema"

  ERV4_the_kind_contract_schema:
    status: OPEN
    depends_on: [ERV0_the_full_spec, ERV3_one_schema_source]
    files: [cos/archetype/eravos-canvas/schemas/workshop-kind.schema.json]
    requires: [node]
    prerequisites: []
    does: >-
      The Workshop's contract (eravos.workshop.spec: Workshop.addKind — id, label, layers, preview, thumb, up, down, apply, tools) as a schema,
      so a kind from any domain is checked before the workshop sees it: music's note, image's photo, and Nexus's documents (spec, .eg, node
      file, schema) given by their owners through their routes.
    proof: "music's NOTE kind and a Nexus spec kind both validate; a kind missing apply is refused and named"

  ERV5_the_visual_coding_and_debug_environment:
    status: OPEN
    depends_on: [ERV_D3_order, ERV2_eravos_own_registry, ERV4_the_kind_contract_schema, CIE11_retire_the_interpreter, EM2_warp_his_own, RF1_relational_field, CF1_cfr_improved_with_rfr2, CP11_the_diagnostic_map]
    files: [cos/spec/eravos-in-the-hub.spec]
    requires: ["Emerge with no JavaScript (CIE11)", "WARP 2 (EM2)", "the relational constraint field (RF1, CF1)"]
    prerequisites: ["ERV_D4, the name"]
    does: >-
      His "eravos could have the visual coding and debug envirement": code as nodes moving through the field (his CIE_D5), edited on the
      workshop at code scale (zoom path: field, system, module, file, function — the coder's reading, to confirm), debugged on CP11's map of
      the same field. Built in ERAVOS; Nexus reaches it through COS. Its own phases are written when it is reached, by expanding this one.
    proof: "to be written with its spec; at least: a .eg module opened as a workshop kind, edited, saved through its gate, and its run seen on the map"
