spec:
  meta:
    name:     build-from-the-spec
    version:  1.9.0
    date:     2026-10-05
    release:  0.39.304 (base) → 0.39.305
    uuid:     nexus-build-from-the-spec-phasemap-v1-0000-2026-1005-jamesbrooks-001
    owner:    idearium.spec-engine · idearium.repo · idearium.api · idearium.config
    status:   "MAPPED 2026-10-05; built: SB1–SB3 (0.39.305), fixes (0.39.306–0.39.307), the hat with the repo (0.39.308), SB12 (0.39.309), generated atlases (0.39.310); SB16 built before it was mapped (0.39.311, recorded). 1.3.0: the system template — SB16–SB19, SB4 widened. 1.4.0: ownership and deterministic expansion — SB20, SB21. 1.5.0: every phase opens with his words (james:), the coder's own phases said so; SB22. 1.6.0: the shape is the default and a new system slots in — SB22 widened, SB23. 1.7.0: the system template in his structure — SB17 rewritten. 1.8.0: genesis is the template's architecture, loom builds a new system you click into, the atlas template in his structure — SB24, SB25. 1.9.0: an imported project shows its progress; expanding a repo keeps its spec and phases current — SB26, SB27"
    voice: >
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim — spelling and all.
      `does:` is the coder's reading of it, his to correct. A phase whose `james:` says none came from the coder, and says
      so. `found:` blocks are what the coder read in the code, as evidence for his calls, not decisions.
    axioms:   docs/AXIOMS-v3.1.md — §17.4 every build is reproducible (from an empty machine, the repo + its specs
              recreate the system), §3.3 map before build, §8.6 reuse before build, §0.3 nothing lost, §1.2 nothing
              silently fails, §5.6 structural self-similarity, §16.4 simple things stay simple.
    origin: >
      James, 2026-10-05: "this is a non-linear project." · "domain agnostic. data agnostic." · "look at cos. problem
      solving. research. strategy. what ever the mind can think of." · "can we focus on everything thats not wired in
      with nexus. its like way too much" · (with i_want_to_make_a_daw_for_my_girl.zip) "here is an example of an idea
      i was trying to get built. like it needs to use the templates as default." · "like nexus needs to be able to
      build itself from the spec." · "nexus needs to be able to build itself from within also. i havce hundreds of
      specs i want built. that why i had the resuable architecture"
      The ideas, the direction and the calls are James's. This map lays them out bottom-up against what exists.

    origin_1_1_0: >
      James, 2026-10-05: "I just need to get this all mapped. Like idearium is for my ideas. Promote into a spec with
      full options for each block and a custom setting to write in. Like it needs to reuse as much as possible by
      default. To save tokens. Like nexus gets more effectient. Like it needs to build .spec files. Each block is then
      chunked, then each component is chunked. Using the register as a dependancy and file check list."
      Earlier the same day: "look at the graphs, and memory. its meant to learn and understand code … adding capability
      to small llms. building autonomously. agnostically … i want to be able to tell it what i want, create a contract,
      send it to raid then figure it out. if it cant, use clearglass to learn, other agents, and idearium or guardian to
      build the capacity" — that loop is RD1/LB1/DA1 in docs/2026-10-02-emerge-field-memory-build-phasemap.spec; this
      map is the build side it calls.

  # ── The pipeline as James describes it, against what exists (1.1.0) ──────────────────────────────────────────────
  #   IDEA (his — the Void, ideas)  →  PROMOTE (full options per block, a custom write-in)  →  SPEC (a .spec file, in
  #   blocks)  →  each BLOCK chunked  →  the REGISTRY block = the component list, the dependency graph, the file
  #   checklist  →  each COMPONENT chunked  →  files, proven  →  stored, so the next spec reuses it.
  #   Reuse first at every step, by default: the cheapest token is the one never spent.
  found_1_1_0:
    - >-
      Promotion has options, but not per block and not his: speceng.create takes templates, sectionAgents,
      buildEngine, warpPrimitives, a compartment template, fileTree; setChunkAgent changes one block's agent; routing
      has a per-block fallback (blocks.yaml). There is no per-block choice of WHO writes it (him / an agent / a template
      / reuse / skip) and no per-block write-in — the workshop is the only place his text goes, and only as a file
      until SB2.
    - >-
      A finished spec becomes a .spec only in the data folder (completeSpec writes <uuid>.spec as markdown sections;
      repo.export rebuilds one with reconstructSpecText). The repo's own spec/<name>.spec in the block format — what
      the workshop and the spec library write and read (specText, specFileText, sectionsFromSpecText, importSpec) — is
      written only by those two. The manifest, not the .spec, is the source of truth today.
    - >-
      REUSE IS KEYED ON THE WRONG THING for document sections: the build's second step, findPriorSection, matches
      (sectionId, sectionDesc) only — every spec's schema/api/events has the same description, so a new spec's
      section is completed, at 0 tokens, with ANOTHER PROJECT'S section. 0.39.306 stops his author sections being
      handed out that way; the general fix is SB10. The component store (C2, by file contract) and WARP's exact cache
      (by whole prompt) are keyed correctly.
    - >-
      Chunking exists at two levels and neither is per block or per component: a spec is 11 sections (one chunk each);
      codegen (speceng.codegen) plans a file tree from the spec digest and builds one chunk per FILE, bottom-up by
      LAYER (every engine file waits on every kernel file). lib/code-intel cuts code into ≤150-line chunks for
      READING, not building. docs/2026-10-02-fractal-graph-any-size-agent-phasemap.spec maps FG2 token-budget
      chunking, FG4 context for any size agent and FG5 recursive build — mapped, not built; reused here, not
      duplicated.
    - >-
      THE REGISTRY BLOCK IS WRITTEN AND NEVER READ by the build: block 11 (registry) describes every component, hook,
      wire, event and command, but lib/spec-digest.js's order leaves it out, lib/file-tree-plan.js plans files without
      it, and dependsOn comes from layers, not wires. idearium/repo/architecture.js reads a repo's REAL code back into
      registry nodes afterwards — the other direction. PH1's proof checks each phase's files exist and parse, which is
      the checklist half, with no registry behind it.

  # ── What the DAW spec and the code say (read, not recalled — §8.6) ─────────────────────────────────────────────
  found:
    - >-
      The DAW spec (workshop ws-muujn6ic-cfe1u, repo spec 2cd0dcf2) was made BARE. workshop.save with no repo calls
      RL.ingest({ bare: true }) (idearium/api/index.js workshop.save) → createSpec({ type: 'component', description:
      'bare repo: <name>' }) with no template (idearium/repo/index.js). GN1's "genesis is the default" lives only in
      the speceng.create route and only for type 'system'. So the standing templates — axioms, architecture, schemas,
      checklists, compartments, each written "so every spec's <section> chunk seeds from the same fixed template
      instead of a freehand guess" — reached no spec made from the workshop, a bare repo, or a quick create.
    - >-
      His words never reached the agents. The workshop's sections ("i want to make a edm song for my girl") were
      written to spec/<slug>.spec as a file; the repo's spec manifest — the chunks the agents build — saw only the
      title and "bare repo: i want to make a daw for my girl".
    - >-
      The section prompt (_buildChunkPromptBase, idearium/spec-engine/index.js) told the model it was writing "a NEXUS
      component spec", listed comp_id / seam_id / contract_id, asked it to "Reference AXIOMS-v1.0", "§1.2 declare
      all failure modes", "§2.1 declare all JAA writes", and pasted every earlier section IN FULL. A small model
      echoed it: every section of the DAW spec opens with the meta chunk's "1.2 Failure Modes / 2.1 JAA Writes /
      comp_id: idearium.spec-engine" block, nested one level deeper per section, until the registry section is
      64 KB of repeats; failure_modes and integration came back empty; the DAW is described as idearium.spec-engine.
    - >-
      The standing templates are SHAPES, not finished text: axioms.spec says "for each axiom: state it, then state
      the evidence in THIS spec" and leaves _Evidence:_ blank; compartments.spec says "for each compartment this idea
      needs, declare:". Seeded verbatim and marked complete (what an explicitly named template does today), hundreds
      of specs would carry the same unfilled text. As the default they are the FRAME each section's agent fills for
      this one project.
    - >-
      What exists for "build itself" (reuse, not rebuild): genesis.spec ("this file IS the schema-engine's definition
      of a valid sovereign system"), architecture-spec (genesis + loom's schema + guardian's node registry, distilled),
      lib/nexus-self/ (Nexus as Idearium repos, COS branches, the apply gate), the spec library (hundreds of documents
      → ideas → specs → repos, 0.39.290/292), the component store (reuse before any token, 0.39.266), the build
      queue poller, phase runs that end in proof (PH1), lib/spec-digest.js (a finished spec condensed to a budget).
      Nothing yet proves the round trip: a Nexus system's spec, through the pipeline, into code its own tests pass.

  origin_1_3_0: >
    James, 2026-10-05: "every system is supposed to be sovereign. the components registry is a an event driven
    interaction contract. nodes for data to persist or move through the system. isolated from each other but using the
    interactoin contract as a component registry, would map it entirely. like the atlas' are supposed to list the
    commands and routes in relation to the component or module, like its all supposed to be very specific and etailed.
    nodes schemas, taxonomy. guardian is the closest the system." · "like with the genasis spec, needs to have the
    component registry event interaction contract, with the heartbeat and pulse system, node based data structure using
    jaa tables as a node index." · "like can you make sure this is all added to the system template. like look at the
    architecture spec. this needs to be mapped first"

  origin_1_4_0: >
    James, 2026-10-05: "like each system is responsible for its data, schemas, contracts, configurations, heartbeat and
    pulse, each node has a schema, every deterministic replicatable espect of each system can be expanded with the system."

  origin_1_5_0: >
    James, 2026-10-05: "like does it reflect the systems in nexus? like each component has to have at least one
    capability, with at least one command, and events, each a node each. like i want this in my words. i don't want
    anyone to think your doing all the thinking for me"

  origin_1_6_0: >
    James, 2026-10-05: "okay but i want that to be the default. then each new system can slot into nexus automatically.
    right?"

  origin_1_7_0: >
    James, 2026-10-05, shown the template: "why not identity context file_structure modules -> components summary, with
    routes and commands, anything else relevant. then everything relevant to the modules, is listed each module and
    component. not in seperate sections"

  origin_1_8_0: >
    James, 2026-10-05: "yes add it the spec for genesis. like genesis is the exact architecture for a new system
    template. like look at the directory. loom, like it needs to build a new system. and click into it. like look at the
    atlas template"

  origin_1_9_0: >
    James, 2026-10-05: "like i was thinking that expanding and repo needs to either update or build and specs, then add
    phases to the phasemap. map any existing phases from the code into the phases tab. same with the specs. need to know
    the progress of projects i import."

  found_1_9_0:
    - >-
      An imported project shows no progress: the Phases tab reads only the repo's own *phasemap*.spec files
      (idearium/repo/phases.js → roadmap.collectPhasemaps) and the Spec tab only its own .spec files
      (idearium/repo/living-spec.js) — an import has neither, so both are empty. Yet the import already understands the
      code: atlas, chunks, graph, a card per chunk (lib/code-intel), and the registry derived from the real code
      (idearium/repo/architecture.js: one component per file, layers, consumers, orphans). That understanding never
      becomes a spec or a phase. spec-plan.js derivePlan makes phases from a SPEC's sections, never from code.
    - >-
      Nothing keeps a repo's spec and phases current as it grows: a file the agent writes, an applied inject, a codegen
      build — none touch the spec or the phasemap. roadmap.addPhase and setPhaseStatus exist to do it; the proof run
      (idearium/repo/proof-run.js, PH1) can re-check a phase's conditions.

  found_1_8_0:
    - >-
      loom/templates/system-scaffold.js (Phase 145) already builds a new system from one operations list — CLI, API,
      registry-components.js, interaction-contract.json and more — but nothing calls it except its own test: no route,
      no CLI, no button. Its output is not genesis-shaped (no node types, schemas, JAA index, heartbeat, capabilities),
      and it puts the system's data in a sibling outDir/data/<name>, not the system's own data folder.
    - >-
      idearium/spec-engine/templates/atlas-template.md is already close to his structure: per module, its commands
      (each with the node and directory it acts on), routes, connections and events. But it keeps the old separate
      sections (spine, axioms, boundaries, seams, sovereignty, pulse … each its own heading), has no capabilities or node
      types per component, and names nodes .architecture/nodes/<kind>/<id>.json, not data/nodes/<type>/<id>.<type>. Its
      filler, architecture-spec/registry/create-atlas.js, is in the unwired list.

  found_1_6_0:
    - >-
      Not yet automatic: Nexus keeps four hand-written lists of its systems — lib/nexus-self/systems.js (15 systems),
      nexus/autopilot.js (the kernels it starts), orchestrator/orchestrator.config.json (ports) and
      loom/scanners/spec-map.js SPEC_DIRS (6 folders — it already misses most systems' specs). A new system is invisible
      until someone edits all four. lib/system-nodes.js writes a .system node per system, but into data/, which is state
      and never ships, so nothing can discover a system from it.

  found_1_5_0:
    - >-
      Measured against his rule, 517 components in 13 systems' registry-components: every one has a route (a command) ✓;
      a capability node per component is written by lib/system-nodes.js, but it restates the component, and idearium's
      119 have none written; only 22 of 517 declare any events, and there are NO event nodes in any system. orchestrator,
      diagnostic and cos have no component registry at all.

  found_1_4_0:
    - >-
      Each node has a schema — almost: lib/node-schemas.js holds 63; of the 14 node types in use in data folders, 2 have
      none (capability-seam and command-seam, both in clear-glass). But all 63 live in ONE shared file in lib/, while
      most systems also keep their own schemas/ folder — two owners for one fact, against "each system is responsible
      for its … schemas".
    - >-
      Deterministic expansion has a start: loom/templates/system-scaffold.js generates a new system's skeleton (its
      event-taxonomy.js among it), and lib/atlas-generate.js the atlases. Nothing yet regenerates a system's own
      derived parts (contract, taxonomy, CLI grammar, node index, atlas) from its nodes when the system grows.

  found_1_3_0:
    - >-
      Three descriptions of a sovereign system, none complete: genesis.spec (the default template of a system spec,
      GN1) has the interaction contract (Domain 2), the registry as doorway (2c) and pulse/heartbeat (10), but never named
      JAA or a node index until 1.2.0. docs/architecture-spec/architecture-spec.spec has the JAA-per-type index, watcher
      and ledger (registry-watcher), but not pulse or the event taxonomy. idearium/spec-engine/templates/
      architecture-spec.template.yaml — "SYSTEM SPEC TEMPLATE", the shape every system spec is meant to be written into —
      has no interaction contract, no event taxonomy, no CLI, no JAA, one line each for heartbeat and pulse, and is read
      by NO code. templates.js's 'system' id seeds nothing.
    - >-
      Measured against Guardian (registry components, interaction-contract.json, event taxonomy, schemas, data/nodes,
      a CLI, routes in the atlas): no system has all seven. orchestrator and diagnostic have no registry-components;
      architect, diagnostic, eravos, ollama, loom and clear-glass have no event taxonomy; eravos and cos no interaction
      contract; most have no CLI. Before 0.39.310 the atlases named almost none of their routes (Idearium 10 of 255).
    - >-
      Order broken, said: Domain 2d was written into genesis.spec (uncommitted) before this map. James: "this needs to be
      mapped first." It is recorded as SB16, built-before-mapped, and committed with this map.

  found_1_2_0:
    - >-
      While wiring SB12 (0.39.309): materialize() writes every UNBUILT chunk to disk as an EMPTY file, an empty .js
      parses, and an empty test file "passes" — so build-verify can read a repo with no code in it as proven. The
      registry checklist now counts an empty promised file as missing. Repos without a registry still have the hole:
      SB15.

  phases:
    SB0_map:
      james: '"I just need to get this all mapped."'
      layer: foundation
      status: DONE
      depends_on: []
      files: [docs/2026-10-05-build-from-the-spec-phasemap.spec, docs/SPEC-REGISTRY.spec]
      does: "This map, registered."
      proof: "the map exists"
      conditions:
        - { says: "the map exists", check: { kind: file, path: docs/2026-10-05-build-from-the-spec-phasemap.spec } }

    SB1_templates_are_the_default_frame:
      james: '"like it needs to use the templates as default."'
      layer: library
      status: DONE (0.39.305)
      depends_on: [SB0_map]
      files: [idearium/spec-engine/index.js, idearium/lib/config-core.cjs]
      does: >-
        Every new document spec — workshop, bare repo, quick create, the spec library, the speceng route — starts from
        the standing templates as FRAMES: config specs.default_templates (default axioms, architecture, schemas,
        checklists; Settings and POST /api/config can change it). Each pending section carries its frame (the
        template's text for that section, and which template it came from); the agent is given it as the shape to fill
        for this project, and the section stays the agent's to write. A template named explicitly still seeds
        verbatim as before (§0.3 — no existing path changes meaning); templateIds: [] still means none. An unknown name
        in the config is skipped and said on the manifest (templateFramesMissing), never silently.
      proof: "the frames are proven by their test"
      conditions:
        - { says: "the frames are proven by their test", check: { kind: tests, run: "node tests/modules/test-build-from-the-spec.test.js" } }

    SB2_his_words_seed_the_spec:
      james: '"Like idearium is for my ideas." · "here is an example of an idea i was trying to get built."'
      layer: api
      status: DONE (0.39.305)
      depends_on: [SB1_templates_are_the_default_frame]
      files: [idearium/spec-engine/index.js, idearium/repo/index.js, idearium/api/index.js]
      does: >-
        The author's own sections become the spec's: setAuthorWords(specUuid, sections) keeps them on the manifest
        (authorWords) and completes the matching pending sections with his text, verbatim, by 'author' — purpose from
        his idea + purpose, any section whose id is a spec section (schema, api, …) from his. A section an agent has
        already written is never overwritten; one he wrote is updated when he saves again. The workshop's save calls it
        on every save, a new bare repo is described by its name rather than "bare repo: …", and every section's agent
        is given his words.
      proof: "his words are proven by their test"
      conditions:
        - { says: "his words are proven by their test", check: { kind: tests, run: "node tests/modules/test-build-from-the-spec.test.js" } }

    SB3_the_section_prompt_is_domain_agnostic:
      james: '"domain agnostic. data agnostic."'
      layer: library
      status: DONE (0.39.305)
      depends_on: [SB1_templates_are_the_default_frame]
      files: [idearium/spec-engine/index.js]
      does: >-
        The prompt describes the thing being specified, in its author's words, not "a NEXUS component": no internal
        ids (they stay on the chunk), the axioms by meaning, the frame as the shape, and the sections written so far
        as short summaries (lib/spec-digest.js's budgeted condensing, meta left out) with the instruction never to
        copy them. Persistence-before-behaviour and named failure modes stay, said in plain words.
      proof: "the DAW case reads clean"
      conditions:
        - { says: "the DAW case reads clean", check: { kind: tests, run: "node tests/modules/test-build-from-the-spec.test.js" } }

    SB4_template_fidelity:
      james: '"like nexus needs to be able to build itself from the spec." · "guardian is the closest the system."'
      layer: library
      status: OPEN
      depends_on: [SB17_the_system_template_is_complete]
      files: [idearium/spec-engine/templates/genesis.spec, idearium/spec-engine/templates/architecture-spec.template.yaml, architecture-spec/registry/, lib/nexus-self/systems.js]
      does: >-
        The reusable architecture checked against what Nexus really is, element by element, with Guardian as the
        reference: for each system — registry-components (the event interaction contract: every component with its
        routes, CLI commands, events emitted and heard), interaction-contract.json, an event taxonomy matching what is
        really emitted, node types with schemas and a JAA node index in its own data folder, heartbeat/pulse, a CLI, a
        spec, tests, and the generated atlas. Each difference is named as template-wrong or system-drifted, never averaged
        into a score. architecture-spec/registry/ (unwired today — 10 files) is the natural home. Widened in 1.3.0 from
        "server, CLI, API, …" to this list (SB17 makes it the template).
      proof: "a fidelity report names every kernel's differences"
      conditions:
        - { says: "a fidelity report names every kernel's differences", check: { kind: tests, run: "node tests/modules/test-template-fidelity.test.js" } }

    SB5_nexus_rebuilds_a_system_from_its_spec:
      james: '"nexus needs to be able to build itself from within also."'
      layer: automation
      status: OPEN
      depends_on: [SB4_template_fidelity]
      files: [lib/nexus-self/branch.js, lib/cos-run.js, idearium/repo/proof-run.js]
      does: >-
        The round trip, from within: one kernel's own spec goes through Idearium's normal pipeline into a COS branch,
        and its end state is that kernel's OWN existing tests passing against the generated code. ollama-bridge first
        (small, isolated, a fairly complete spec). What the spec could not produce is written back as a gap in that
        spec — which is how the specs become complete enough to rebuild from (§17.4). Never applied to the live tree
        by itself; the apply gate stays.
      proof: "a fixture system's spec rebuilds into code its own tests pass"
      conditions:
        - { says: "a fixture system's spec rebuilds into code its own tests pass", check: { kind: tests, run: "node tests/modules/test-self-rebuild.test.js" } }

    SB6_hundreds_of_specs:
      james: '"i havce hundreds of specs i want built. that why i had the resuable architecture"'
      layer: automation
      status: OPEN
      depends_on: [SB3_the_section_prompt_is_domain_agnostic, SB5_nexus_rebuilds_a_system_from_its_spec]
      files: [lib/spec-library.js, idearium/lib/spec-library-import.js, lib/component-store.js, lib/economy/]
      does: >-
        His library built at scale: a queue of specs (from the spec library, a folder, or Nexus's own), each through
        the same pipeline, resumable, under the economy's budgets, reuse-first through the component store so the
        hundredth spec costs less than the first; progress in the background panel; every spec ends in proof or says
        what is missing.
      proof: "a queue of fixture specs builds, resumes after a stop, and reuses a stored component"
      conditions:
        - { says: "a queue of fixture specs builds, resumes after a stop, and reuses a stored component", check: { kind: tests, run: "node tests/modules/test-spec-queue.test.js" } }

    SB7_domain_file_tree_templates:
      james: 'none — this phase is the coder''s suggestion (Eravos mods offered for a music idea), not James''s. His to keep or cut.'
      layer: library
      status: OPEN
      depends_on: [SB1_templates_are_the_default_frame]
      files: [lib/file-tree-plan.js, eravos/ui/mods/, cos/archetype/registry.js]
      does: >-
        The file-tree templates that already exist offered by what the idea is about: a music idea (the DAW) is shown
        Eravos's own mods (sequencer, pads, synths, sample player) as starting files; a service, COS's archetypes. He
        picks; nothing is chosen for him.
      proof: "a music idea is offered the eravos mods"
      conditions:
        - { says: "a music idea is offered the eravos mods", check: { kind: tests, run: "node tests/modules/test-domain-templates.test.js" } }

    SB8_promote_with_full_block_options:
      james: '"Promote into a spec with full options for each block and a custom setting to write in."'
      layer: api
      status: OPEN
      overlaps: "TP1_promote_to_spec_templates (docs/2026-10-01-idearium-agent-ready-master-phasemap.spec) — one piece of work; build it once, close both"
      depends_on: [SB2_his_words_seed_the_spec, SB9_the_spec_is_a_spec_file, SB10_reuse_first_keyed_on_the_contract, SB11_each_block_chunked]
      files: [idearium/api/index.js, idearium/spec-engine/index.js, idearium/spec-engine/blocks.yaml, idearium/cli/index.js, idearium/ui/workshop.html]
      does: >-
        "Promote into a spec with full options for each block and a custom setting to write in." Promoting an idea
        lists the spec's blocks, each with its options, all defaulting to reuse-first: WHO writes it (him · reuse ·
        template seed · agent · skip), which agent and fallback (blocks.yaml + routing), its frame (SB1), how deep it is
        chunked (SB11), and a CUSTOM box — his own text for the block (setAuthorWords) or his instruction to the agent
        writing it (kept on the chunk, shown in the prompt as his). The choices are one object on the manifest
        (blockOptions), saved as a reusable preset; API and CLI first, then the workshop's page.
      proof: "each block's options are set at promotion and honoured by the build"
      conditions:
        - { says: "each block's options are set at promotion and honoured by the build", check: { kind: tests, run: "node tests/modules/test-block-options.test.js" } }

    SB9_the_spec_is_a_spec_file:
      james: '"Like it needs to build .spec files."'
      layer: library
      status: OPEN
      overlaps: "none found"
      depends_on: [SB1_templates_are_the_default_frame]
      files: [idearium/spec-engine/index.js, idearium/lib/spec-library-import.js, idearium/lib/workshop.js, idearium/repo/index.js]
      does: >-
        "it needs to build .spec files." The repo's spec/<name>.spec, in the block format the workshop and the library
        already read and write, is the artifact: written at promotion, rewritten as each block completes (who wrote it,
        from what, its reuse source — §17.5), and read back by importSpec into the same blocks. One writer for all three
        (spec-engine, workshop, library) instead of three. The manifest stays its index; .md section files are not
        produced for a document spec (§NO-MD, as files already are).
      proof: "a built spec round-trips: .spec → importSpec → the same blocks"
      conditions:
        - { says: "a built spec round-trips: .spec → importSpec → the same blocks", check: { kind: tests, run: "node tests/modules/test-spec-file.test.js" } }

    SB10_reuse_first_keyed_on_the_contract:
      james: '"Like it needs to reuse as much as possible by default. To save tokens. Like nexus gets more effectient."'
      layer: library
      status: OPEN
      overlaps: "none found — but the findPriorSection fix touches every map that builds specs"
      depends_on: [SB9_the_spec_is_a_spec_file]
      files: [idearium/spec-engine/index.js, idearium/api/index.js, lib/component-store.js, lib/economy/]
      does: >-
        "it needs to reuse as much as possible by default. To save tokens. Like nexus gets more effectient." One reuse
        order for every chunk, on by default: the component store (by contract) → the same block CONTRACT already built
        (block id + frame + a hash of what it is about: his words and the blocks it depends on — never the section name
        alone) → WARP's exact cache → an agent. A block marked spec-independent (e.g. a standing checklist he edited
        once) reuses by its frame. Every reuse is recorded with its source and the tokens it saved, per build and in
        total (§17.9, §17.11 — measured, never claimed), so efficiency over time is a number.
      proof: "another project's section is never reused; the same contract is, with tokens-saved recorded"
      conditions:
        - { says: "another project's section is never reused; the same contract is, with tokens-saved recorded", check: { kind: tests, run: "node tests/modules/test-reuse-contract.test.js" } }

    SB11_each_block_chunked:
      james: '"Each block is then chunked,"'
      layer: library
      status: OPEN
      overlaps: "FG2_token_budget_chunking (docs/2026-10-02-fractal-graph-any-size-agent-phasemap.spec) — FG2 is the mechanism, SB11 its use on spec blocks"
      depends_on: [SB10_reuse_first_keyed_on_the_contract]
      files: [idearium/spec-engine/index.js, lib/chunker/index.js]
      does: >-
        "Each block is then chunked." A block bigger than its agent's budget is cut into sub-chunks (FG2's token-budget
        chunking, built once there and used here), each addressable, reusable (SB10) and built bottom-up, then joined
        into the block. A small model writes a big block a piece at a time; a cut-off piece is continued
        (lib/reply-continuation.js), never dropped.
      proof: "a block over budget is built as sub-chunks and joined"
      conditions:
        - { says: "a block over budget is built as sub-chunks and joined", check: { kind: tests, run: "node tests/modules/test-block-chunking.test.js" } }

    SB12_the_registry_is_the_component_list:
      james: '"Using the register as a dependancy and file check list."'
      layer: library
      status: "DONE (0.39.309) — the registry section asks for a yaml components list (lib/registry-plan.js REGISTRY_FORMAT); speceng.codegen plans the files FROM it (one per component, each waiting on the files its wires name) and keeps it on the code spec; verify checks the built repo against it (a missing, empty or unparsable promised file fails and goes back to be built); no usable registry → the agent plans, and the reason is in the answer. Not done here: the node-for-node drift against the code projection (DT4)."
      overlaps: "DT4_registry_block_to_nodes (agent-ready master) — SB12 parses the block and checks the files; DT4's node envelopes and node-for-node drift remain DT4's"
      depends_on: [SB11_each_block_chunked]
      files: [idearium/spec-engine/index.js, lib/file-tree-plan.js, idearium/repo/architecture.js, lib/node-export.js, idearium/repo/proof-run.js]
      does: >-
        "Using the register as a dependancy and file check list." The registry block (11) is parsed into its nodes
        (.component, .hook, .wire, .event, .command — node-export's envelope) and becomes three things: THE COMPONENT
        LIST (codegen's file tree is derived from it, one component → its file, instead of planned freehand), THE
        DEPENDENCY GRAPH (each component's dependsOn from its wires, bottom-up by real edges, not by layer alone; a
        cycle or a missing end is a gap), and THE FILE CHECKLIST (every component's file must exist, parse and pass
        its checks — PH1's proof with the registry behind it; missing, extra and orphan files named). After the build,
        architecture.js reads the real code back into nodes and the two registries are compared: what was promised
        against what was built.
      proof: "a registry yields the file tree, the dependency order and a checklist that fails on a missing file"
      conditions:
        - { says: "a registry yields the file tree, the dependency order and a checklist that fails on a missing file", check: { kind: tests, run: "node tests/modules/test-registry-drives-build.test.js" } }

    SB13_each_component_chunked:
      james: '"then each component is chunked."'
      layer: api
      status: OPEN
      overlaps: "FG4_context_for_any_agent + FG5_recursive_build (fractal-graph map) — the mechanism; SB13 is their use per component"
      depends_on: [SB12_the_registry_is_the_component_list]
      files: [idearium/api/index.js, idearium/spec-engine/index.js, lib/code-intel/]
      does: >-
        "then each component is chunked." Each component is built as its own chunk with only what it needs: its
        registry contract, the exported interfaces of the components it depends on (not their code), its block
        excerpts — FG4's context for any size agent. A component too large is built in pieces at code-intel's own cut
        points (a declaration, a method, ≤150 lines — FG5 recursive build) and joined. Each piece is reusable (SB10).
      proof: "a component is built from its contract and its dependencies' interfaces only, in pieces when large"
      conditions:
        - { says: "a component is built from its contract and its dependencies' interfaces only, in pieces when large", check: { kind: tests, run: "node tests/modules/test-component-chunking.test.js" } }

    SB14_reuse_compounds:
      james: '"it needs to reuse as much as possible by default … Like nexus gets more effectient."'
      layer: automation
      status: OPEN
      overlaps: "CX0_codex_component_store (docs/2026-10-02-workshop-codex-rewind-phasemap.spec, carried into the emerge map) — CX0 grows the store, SB14 feeds it"
      depends_on: [SB13_each_component_chunked, SB6_hundreds_of_specs]
      files: [lib/component-store.js, idearium/lib/architect.js, idearium/repo/proof-run.js]
      does: >-
        Every PROVEN component enters the component store with its registry contract (CX0 in the emerge map grows the
        store; this feeds it). The next spec's registry is matched against the store before anything is built
        (Architect's REUSE), so the hundredth spec builds mostly from proven parts. Unproven components never enter
        (§17.10 — a cheap path never skips verification). The tokens-saved total (SB10) is the measure that Nexus is
        getting more efficient.
      proof: "a second spec with a matching component builds it from the store at 0 tokens"
      conditions:
        - { says: "a second spec with a matching component builds it from the store at 0 tokens", check: { kind: tests, run: "node tests/modules/test-reuse-compounds.test.js" } }

    SB15_empty_is_not_built:
      james: 'none — a bug the coder found while wiring SB12; recorded so it is not lost.'
      layer: library
      status: OPEN
      overlaps: "none — found 2026-10-05 while wiring SB12"
      depends_on: [SB12_the_registry_is_the_component_list]
      files: [lib/build-verify.js, idearium/repo/index.js]
      does: >-
        An unbuilt chunk is written to disk as an empty file, and verify counts an empty .js as parsing and an empty test
        as passing, so a repo with no code can read proven. Verify counts an empty (whitespace-only) source or test
        file as not built — a failure that goes back to its agent — for every repo, not only those with a registry; and
        "proven" needs at least one test that ran an assertion.
      proof: "a repo whose files are all empty reads failed, naming each file as not built"
      conditions:
        - { says: "a repo whose files are all empty reads failed, naming each file as not built", check: { kind: tests, run: "node tests/modules/test-empty-is-not-built.test.js" } }

    SB16_genesis_nodes_domain:
      james: '"like with the genasis spec, needs to have the component registry event interaction contract, with the heartbeat and pulse system, node based data structure using jaa tables as a node index."'
      layer: foundation
      status: "BUILT-BEFORE-MAPPED (0.39.311) — written before this map; recorded here, committed with it"
      overlaps: "the architecture spec's registry-watcher module (same model, now in genesis too)"
      depends_on: [SB0_map]
      files: [idearium/spec-engine/templates/genesis.spec]
      does: >-
        genesis 1.2.0, Domain 2d "nodes", written from Guardian's real model: one file per fact (data/nodes/<type>/
        <id>.<type>, the node-export envelope) is the canonical record; one JAA table per node type (nodes_<type>) is its
        index and nodes_<type>_ledger its append-only history, in the system's own data folder; a schema per type
        (lib/node-schemas.js), the types named in NODE-TAXONOMY.md; a watcher per type folder; data moves between systems
        as nodes through the interaction contract. Plus: file registry/node-index.js, bind node.change → Event, axiom
        NODE_INDEX_IS_JAA, root NodeIndex, and the pulse snapshot carries each type's count.
      proof: "genesis 1.2.0 has domain nodes, the node-index file and the axiom; the manifest wiring check stays clean"
      conditions:
        - { says: "genesis 1.2.0 has domain nodes, the node-index file and the axiom; the manifest wiring check stays clean", check: { kind: tests, run: "node tests/modules/test-genesis-and-architecture-spec.test.js" } }

    SB17_the_system_template_is_complete:
      james: '"like can you make sure this is all added to the system template. like look at the architecture spec. this needs to be mapped first" · "why not identity context file_structure modules -> components summary, with routes and commands, anything else relevant. then everything relevant to the modules, is listed each module and component. not in seperate sections"'
      layer: foundation
      status: "DONE (0.39.313) — the template in his structure (0.39.312); genesis 1.3.0 is its architecture (Domain 0a), with capability nodes and his axioms; architecture-spec.spec 0.9.0 agrees"
      overlaps: "architecture-spec.spec's own gaps; TP1 (promote with templates)"
      depends_on: [SB16_genesis_nodes_domain]
      files: [idearium/spec-engine/templates/architecture-spec.template.yaml, docs/architecture-spec/architecture-spec.spec, idearium/spec-engine/templates/genesis.spec]
      does: >-
        His structure: identity → context → file_structure → modules → components. Everything about a module or a
        component is listed ON it, not in separate sections: per component its summary, capability, commands, routes,
        events emitted and heard, the nodes it reads and writes, its schema, config, gates, status and tests; per module
        its node types (each with its schema, JAA index table and ledger table), its config, its seams. Only what belongs
        to the whole system stays above the modules: identity (incl. what it owns, its data folder, its heartbeat) and
        context (purpose, axioms, spine, sovereignty, config layers, pulse, the build phases). The cross-cutting lists —
        every event, every node type, the taxonomy, the contract — are generated from the components (SB21), never written
        a second time. The coder's one addition, his to keep or cut: a `generated:` block naming those derived lists, so
        nobody hand-edits them. The old template is archived whole. Then architecture-spec.spec and genesis are made to
        agree with it.
      proof: "the system spec template has registry, taxonomy, nodes and pulse sections and parses; architecture-spec.spec names genesis 1.2.0, pulse and the taxonomy"
      conditions:
        - { says: "the system spec template has registry, taxonomy, nodes and pulse sections and parses", check: { kind: tests, run: "node tests/modules/test-system-template.test.js" } }

    SB18_the_system_template_is_used:
      james: '"like it needs to use the templates as default." · "like can you make sure this is all added to the system template."'
      layer: library
      status: OPEN
      overlaps: "SB1 (the frames mechanism, reused); GN1 (genesis the default of a system spec)"
      depends_on: [SB17_the_system_template_is_complete, SB1_templates_are_the_default_frame]
      files: [idearium/spec-engine/templates.js, idearium/spec-engine/index.js, idearium/spec-engine/blocks.yaml]
      does: >-
        A system spec is built against the template instead of the template sitting unread: the 'system' template id
        frames each block from architecture-spec.template.yaml's matching section (registry → block 11, nodes → schema,
        taxonomy → events, pulse → integration), through SB1's frames — the agent fills the shape for that system. genesis
        stays the default seed of a system spec.
      proof: "a type system spec's registry, schema, events and integration blocks carry the template's sections as frames"
      conditions:
        - { says: "a type system spec's registry, schema, events and integration blocks carry the template's sections as frames", check: { kind: tests, run: "node tests/modules/test-system-template.test.js" } }

    SB19_atlases_per_component:
      james: '"like the atlas'' are supposed to list the commands and routes in relation to the component or module, like its all supposed to be very specific and etailed. nodes schemas, taxonomy."'
      layer: library
      status: OPEN
      overlaps: "lib/atlas-generate.js (0.39.266, first run 0.39.310)"
      depends_on: [SB17_the_system_template_is_complete]
      files: [lib/atlas-generate.js, lib/registry-harness.js]
      does: >-
        "the atlas' are supposed to list the commands and routes in relation to the component or module." The generated
        half of every atlas goes per component: each component with its routes (and the file that serves each), its CLI
        commands (its grammar), the events it emits and hears, the node types it reads and writes, and their schemas;
        then the system's event taxonomy against what is really emitted, and its node types with their JAA index tables.
      proof: "a system's atlas lists each component with its routes, commands, events and node types; an emitted event the taxonomy lacks is named"
      conditions:
        - { says: "a system's atlas lists each component with its routes, commands, events and node types; an emitted event the taxonomy lacks is named", check: { kind: tests, run: "node tests/modules/test-atlas-per-component.test.js" } }

    SB20_each_system_owns_its_own:
      james: '"like each system is responsible for its data, schemas, contracts, configurations, heartbeat and pulse, each node has a schema,"'
      layer: foundation
      status: OPEN
      overlaps: "SB17 (the template states it); DT6_node_store (agent-ready master)"
      depends_on: [SB17_the_system_template_is_complete]
      files: [lib/node-schemas.js, guardian/schemas/, clear-glass/schemas/, lib/node-index.js, lib/nexus-self/systems.js]
      does: >-
        "each system is responsible for its data, schemas, contracts, configurations, heartbeat and pulse, each node has
        a schema." Each system holds, in its own folder, the schema of every node type it owns, its interaction contract,
        its config, its node index (its own JAA tables) and its heartbeat. lib/node-schemas.js stops being the owner and
        becomes the reader: it gathers each system's schemas from that system, and two systems claiming one type is an
        error, said. Every node type in use has a schema (capability-seam and command-seam get theirs); a node type with
        no schema, or a schema no system owns, is a gap in that system's contract node.
      proof: "every node type in use has exactly one schema, owned by one system, in that system's folder"
      conditions:
        - { says: "every node type in use has exactly one schema, owned by one system, in that system's folder", check: { kind: tests, run: "node tests/modules/test-system-ownership.test.js" } }

    SB21_deterministic_parts_grow_with_the_system:
      james: '"every deterministic replicatable espect of each system can be expanded with the system."'
      layer: automation
      status: OPEN
      overlaps: "loom/templates/system-scaffold.js (makes a new system's skeleton once); lib/atlas-generate.js (atlases)"
      depends_on: [SB20_each_system_owns_its_own, SB19_atlases_per_component]
      files: [loom/templates/system-scaffold.js, lib/atlas-generate.js, lib/node-index.js]
      does: >-
        "every deterministic replicatable espect of each system can be expanded with the system." Everything that can be
        derived from a system's own nodes is generated, never hand-kept: its interaction contract from its
        registry-components, its event taxonomy from what it emits, its CLI grammar from its components, its node index
        tables from its node types, its atlas from all of these. Adding a component, a node type or an event regenerates
        them in one command, and a check fails when a derived part is behind its source. Hand-written code is kept to
        what is not deterministic (the architecture spec's HARDLINE_AS_LITTLE_AS_POSSIBLE).
      proof: "adding a component to a fixture system regenerates its contract, taxonomy, grammar, index and atlas; a stale one fails the check"
      conditions:
        - { says: "adding a component to a fixture system regenerates its contract, taxonomy, grammar, index and atlas; a stale one fails the check", check: { kind: tests, run: "node tests/modules/test-deterministic-expansion.test.js" } }

    SB22_every_component_capability_command_events_as_nodes:
      layer: foundation
      status: OPEN
      james: '"like each component has to have at least one capability, with at least one command, and events, each a node each."'
      overlaps: "lib/system-nodes.js (capability + command nodes, 0.39.271); loom/templates/system-scaffold.js (1.6.0: the default); SB20, SB21"
      depends_on: [SB20_each_system_owns_its_own]
      files: [lib/system-nodes.js, lib/node-schemas.js, loom/data/events.json]
      does: >-
        The coder's reading: every component, in every system, declares at least one capability, at least one command
        that exercises it, and the events it emits and hears — and each of those is a node of its own (.capability,
        .command, .event) in its system's data folder, with its schema, indexed in that system's JAA tables. A component
        missing any of the three is named as a gap in its system's contract node, not passed. orchestrator, diagnostic and
        cos get component registries so they can be measured at all. 1.6.0, his "i want that to be the default": the
        system scaffold (loom/templates/system-scaffold.js) and genesis generate every new component in this shape — a
        component cannot be scaffolded without its capability, command and events.
      proof: "every component in every system has ≥1 capability, ≥1 command and its events as nodes; one missing any is named"
      conditions:
        - { says: "every component in every system has ≥1 capability, ≥1 command and its events as nodes; one missing any is named", check: { kind: tests, run: "node tests/modules/test-component-shape.test.js" } }

    SB23_a_new_system_slots_in:
      layer: automation
      status: OPEN
      james: '"okay but i want that to be the default. then each new system can slot into nexus automatically. right?"'
      overlaps: "SB20 (each system owns its own), SB21 (derived parts generated), lib/system-nodes.js (.system nodes)"
      depends_on: [SB22_every_component_capability_command_events_as_nodes, SB21_deterministic_parts_grow_with_the_system]
      files: [lib/nexus-self/systems.js, nexus/autopilot.js, orchestrator/orchestrator.config.json, loom/scanners/spec-map.js, loom/templates/system-scaffold.js]
      does: >-
        The coder's reading: each system declares itself in its own folder — a shipped system declaration (name, entry,
        port, boot phase, spec, components, node types, heartbeat), its .system node made from the source, not from
        data/ — and Nexus discovers systems from those declarations instead of the four hand-kept lists (nexus-self's
        systems, autopilot's kernels, the orchestrator's ports, loom's spec folders), which become readers of the
        declarations. A new system made by the scaffold is started, registered, scanned, owned, given its repo in
        Idearium and its atlas, with no other file edited. A declaration that is incomplete, or two systems claiming a
        port, is refused with the reason.
      proof: "a fixture system made by the scaffold is discovered by every reader (autopilot, orchestrator, loom, nexus-self) with no list edited"
      conditions:
        - { says: "a fixture system made by the scaffold is discovered by every reader (autopilot, orchestrator, loom, nexus-self) with no list edited", check: { kind: tests, run: "node tests/modules/test-system-slots-in.test.js" } }

    SB24_loom_builds_a_new_system:
      layer: ui
      status: OPEN
      james: '"like look at the directory. loom, like it needs to build a new system. and click into it."'
      overlaps: "loom/templates/system-scaffold.js (built, never called); SB23 (a new system slots in); SB21 (generated parts)"
      depends_on: [SB23_a_new_system_slots_in, SB25_atlas_template_in_his_structure]
      files: [loom/templates/system-scaffold.js, loom/server.js, loom/registry-components.js, idearium/ui/js/app.js]
      does: >-
        The coder's reading: Loom builds a whole new system from a filled system template (genesis's architecture): the
        folder in the template's shape — its system declaration, registry-components with each component's capabilities,
        commands and events, the interaction contract, event taxonomy, node types with schemas and their JAA index and
        ledger tables in its own data folder, the heartbeat route, its spec file and its atlas — through system-scaffold.js,
        which already writes the CLI, API and contract. A route and a CLI first (POST /api/systems, `loom system new`),
        then a New system button in Idearium; the new system is discovered (SB23), shows as its own repo, and clicking it
        opens its atlas as Home.
      proof: "a fixture system built through the route has every template part, is discovered, and opens as its own repo"
      conditions:
        - { says: "a fixture system built through the route has every template part, is discovered, and opens as its own repo", check: { kind: tests, run: "node tests/modules/test-loom-builds-a-system.test.js" } }

    SB25_atlas_template_in_his_structure:
      layer: library
      status: OPEN
      james: '"like look at the atlas template"'
      overlaps: "SB19 (atlases per component); lib/atlas-generate.js; architecture-spec/registry/create-atlas.js (unwired)"
      depends_on: [SB17_the_system_template_is_complete]
      files: [idearium/spec-engine/templates/atlas-template.md, architecture-spec/registry/create-atlas.js, lib/atlas-generate.js]
      does: >-
        The coder's reading: the atlas template follows the system template's structure — identity, context, file
        structure, then each module and, under it, each component with its capabilities, commands (the node and
        directory each acts on), routes, events emitted and heard, and the node types it reads and writes, with their
        schemas — instead of separate sections. Node paths are data/nodes/<type>/<id>.<type>. The generated half
        (atlas-generate's markers) fills what can be derived; create-atlas.js is wired to fill the rest from a spec.
      proof: "an atlas made from the template for a fixture spec lists each component with its capabilities, commands, routes, events and nodes"
      conditions:
        - { says: "an atlas made from the template for a fixture spec lists each component with its capabilities, commands, routes, events and nodes", check: { kind: tests, run: "node tests/modules/test-atlas-template.test.js" } }

    SB26_an_imported_project_shows_its_progress:
      layer: api
      status: OPEN
      james: '"map any existing phases from the code into the phases tab. same with the specs. need to know the progress of projects i import."'
      overlaps: "DT4b_registry_chunk_in_repo_chunking (agent-ready master: every imported repo carries its registry); idearium/repo/architecture.js; spec-plan.js derivePlan; PH1 proof runs"
      depends_on: [SB17_the_system_template_is_complete, SB12_the_registry_is_the_component_list]
      files: [idearium/repo/import-pipeline.js, idearium/repo/architecture.js, idearium/repo/spec-plan.js, idearium/repo/proof-run.js, idearium/repo/phases.js, idearium/repo/living-spec.js]
      does: >-
        The coder's reading: after an import (and on demand for any repo), what the code already shows becomes the repo's
        spec and phases. The SPEC: written in the system template's shape from the registry architecture.js derives
        (modules, components, their routes, commands and events found in the code, the node types it keeps), saved as
        spec/<name>.spec and marked derived-from-code, so the Spec tab shows it and he edits it like any other. The PHASES:
        a phasemap of what exists, one phase per module bottom-up by layer, each with conditions (its files exist, parse,
        and its tests pass) — run once through the proof run, so each reads proven, unproven (what fails, said) or open
        (orphans, untested files, TODO markers, a component missing its capability, command or events). The Phases tab
        shows the project's progress as proven of total, per phase and overall. Nothing is invented: what the code does
        not show is listed as open, never filled in.
      proof: "a fixture project imported with no spec or phasemap gets a derived spec and a phasemap whose phases read proven / unproven / open from its real files and tests"
      conditions:
        - { says: "a fixture project imported with no spec or phasemap gets a derived spec and a phasemap whose phases read proven / unproven / open from its real files and tests", check: { kind: tests, run: "node tests/modules/test-import-progress.test.js" } }

    SB27_expanding_a_repo_keeps_its_spec_and_phases_current:
      layer: automation
      status: OPEN
      james: '"like i was thinking that expanding and repo needs to either update or build and specs, then add phases to the phasemap."'
      overlaps: "roadmap.addPhase / setPhaseStatus (exist); BK2_phase_build_writes_code; the living spec's addenda"
      depends_on: [SB26_an_imported_project_shows_its_progress]
      files: [idearium/repo/roadmap.js, idearium/repo/living-spec.js, lib/repo-inject.js, idearium/api/index.js]
      does: >-
        The coder's reading: when a repo grows — a file the agent writes, an applied inject, a codegen build, a new
        component — its spec is updated (the new component added to its module, a dated addendum saying what changed and
        why) or, with no spec yet, built (SB26); then the phasemap gains a phase for the new work (roadmap.addPhase) with its
        conditions, and the phases it touched are re-proven. He sees each update before it is written when the repo is in
        review mode, as with code injects.
      proof: "adding a component to a fixture repo adds it to the spec with an addendum and appends a phase with conditions; review mode waits for his yes"
      conditions:
        - { says: "adding a component to a fixture repo adds it to the spec with an addendum and appends a phase with conditions; review mode waits for his yes", check: { kind: tests, run: "node tests/modules/test-expand-updates-spec.test.js" } }
