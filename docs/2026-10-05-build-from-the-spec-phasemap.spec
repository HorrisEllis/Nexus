spec:
  meta:
    name:     build-from-the-spec
    version:  1.22.0   # 1.22.0: SB46–SB49 mapped — every step by hand, built and run in COS, proof closes the phase, an idea runs through by itself · 1.21.0: 1.21.0: SB42–SB45 a repo expands from its spec, phased, chunked, coded; uncoded files grey (0.39.360) · 1.20.0: 1.20.0: SB28 genesis in the shape Nexus systems have, SB30 the skeleton (a COS template with reusable components), SB31 every new repo is the skeleton, the idea slotted in — DONE (0.39.359) · 1.19.0: 1.19.0: SB39 one agnostic context tool; the checklist builds the working set (0.39.339) · 1.18.0: SB38 prerequisites, the questions first (0.39.338) · 1.17.0: SB37 the working set (0.39.337) · 1.16.0: SB36 every agent can use the tools (0.39.336) · 1.15.0: SB35 the index is there when the agent asks (0.39.335) · BC1–BC4 merged in from the branch
    date:     2026-10-05
    release:  0.39.304 (base) → 0.39.305
    uuid:     nexus-build-from-the-spec-phasemap-v1-0000-2026-1005-jamesbrooks-001
    owner:    idearium.spec-engine · idearium.repo · idearium.api · idearium.config
    status:   "MAPPED 2026-10-05; built: SB1–SB3 (0.39.305), fixes (0.39.306–0.39.307), the hat with the repo (0.39.308), SB12 (0.39.309), generated atlases (0.39.310); SB16 built before it was mapped (0.39.311, recorded). 1.3.0: the system template — SB16–SB19, SB4 widened. 1.4.0: ownership and deterministic expansion — SB20, SB21. 1.5.0: every phase opens with his words (james:), the coder's own phases said so; SB22. 1.6.0: the shape is the default and a new system slots in — SB22 widened, SB23. 1.7.0: the system template in his structure — SB17 rewritten. 1.8.0: genesis is the template's architecture, loom builds a new system you click into, the atlas template in his structure — SB24, SB25. 1.9.0: an imported project shows its progress; expanding a repo keeps its spec and phases current — SB26, SB27. 1.10.0: genesis in the shape Nexus systems really have; the build flow in his order, in a compartment until committed — SB28, SB29. 1.11.0: the template is a skeleton, the spec a living model, the atlas detailed — SB30; SB25 widened. 1.12.0: every new repo is the skeleton, the idea slots in — SB31 · from branch claude/nexus-idearium-overview-yoguem: MAPPED 2026-10-05; SB1–SB3 built (0.39.305), the author-reuse fix (0.39.306); SB4–SB14 open. 1.1.0: the whole pipeline, idea → .spec → blocks → registry → components, reuse first. 1.2.0: BC1 (0.39.328, built BEFORE it was mapped — drift, recorded below) and BC2 (0.39.329) — the build agent gets all of the hat/repo context, through the editable prompt blocks. 1.3.0: BC3 (.node record), BC4 (relational-context wired or archived); systems: and value: on BC phases"
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

  origin_1_10_0: >
    James, 2026-10-05, shown the files genesis would build: "compartments? no system in nexus looks like this" · "like
    needs to map, phase, check for snapshot if none exist, create one, then populate the plan section and begin, then
    add precommited changes to the files tab, greyed out. dont create an entirely new repo, just compartment until the
    changes are commited. what do you think"

  origin_1_11_0: >
    James, 2026-10-05: "Like I want this to be a skeleton, only using the minimal code. Then expands from there. Using
    the .spec as a living model. Then an atlas in the atlas template but not a list, each detailed, and referenced. All
    expanded. Okay now update the architecture spec."

  origin_1_12_0: >
    James, 2026-10-05: "This should be what each new repo builds and slots the idea into like a slot. Agnostic."

  found_1_12_0:
    - >-
      Today a new repo starts as a bare spec (workshop, Create repo) or a file tree the agent plans freehand (codegen),
      or one from a COS archetype or an Eravos mod — never the system template.

  found_1_10_0:
    - >-
      Genesis's 42 files (compartments/<name>/{api,cli,sse,hooks,seam,…}, kernel/, lattice/, nerve/, spine/, ui/tv-shell/)
      are a design never built: no Nexus system looks like it. The real systems share one shape — versionium the cleanest:
      server.js, config.js, compartment.json, registry-components.js, interaction-contract.json, event-taxonomy.js, lib/,
      routes/ (or commands/, cli.js), schemas/, spec/, data/ (guardian, loom, ollama the same, with more in lib/). Genesis
      also builds no tests, no spec folder, no atlas, no registry-components.js, no event taxonomy and no data/ or
      schemas/ — against its own axioms.
    - >-
      Most of his flow exists in pieces: a phase run already refuses to start without a Versionium snapshot (the
      one-idearium map's I2); the Plan panel; the Files tab already shows a proposal-only file greyed (file-state P); a
      staging branch in Versionium holds work before it is applied (S1). What breaks his rule: "Generate code"
      (speceng.codegen) makes a SECOND repo for the code — a branch repo or a copy — instead of working in the repo's own
      compartment; and codegen and phase output does not show greyed in Files the way injects do.
    - >-
      The coder's one difference, his to decide: a snapshot before EVERY run, not only when none exists — otherwise this
      run has no point to roll back to.

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
      systems: [idearium]   # 0.39.312 — declared; it read on no system's Phasemap tab
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

    # ── 1.2.0 (2026-10-05) ────────────────────────────────────────────────────────────────────────────────────────
    # James: "Should be more than that. Like using the traversal of chunks, primitives, like the relationship between
    # words when generating code. The boundaries. Learning to code from that" · "And the agents use it for context
    # right?" · "Yes. We need the agents to use it. Also what about the .node types. Also combining primitives or
    # invariants to build higher leverage code for less tokens." · "Parse rhe axioms in the docs folder. Do not
    # deviate They are law" · "They need context. All of it. From the hat/repo"
    BC1_build_context:
      layer: library
      systems: [idearium, core, loom]
      value: { score: 4, cost: M, for: [compounding, quality], why: "a build agent sees what its file relates to; fewer tokens, every lower file seen" }
      status: DONE (0.39.328) — built before it was mapped; the drift is recorded below
      depends_on: []
      files: [lib/build-context.js, idearium/spec-engine/index.js, idearium/api/index.js, tests/modules/test-build-context.test.js]
      does: >-
        Each file chunk's build agent is told its relations, deterministically and in one budget: BUILDS ON (its
        dependencies' interfaces and glyphs, through every layer), USED BY, RELATIONS (its registry card when the file
        exists), PROVEN PRIMITIVES (other projects' stored components by interface), INVARIANTS (the spec's
        MUST/NEVER sentences naming its subject). The file prompt sends the 3 lower files it is most about in full and
        every other one by interface.
      drift: >-
        Audited against docs/AXIOMS-v3.1.md and docs/CLAUDE.md on James's word ("They are law"). 0.39.328 broke:
        §3.3/rule 1 (built before this map); rule 3/§5.1 (not in loom, no UUID); §8.5 (no spec); rule 4/§12.5 (no
        addendum); E14 (the chunk.complete event gained buildContext undeclared); the Leverage Principles and §16.6
        (C-D6 changed without his yes); §17.11 (the size claim's benchmark was a scratch script, the unfavourable case
        unreported); the test sandbox and §12.1 (no hostile inputs); §1.2 (a failed pack was recorded but not said);
        and a benchmark run wrote a throwaway spec into data/cortex (removed). Each is closed in BC2. Its block was
        also injected outside the editable prompt blocks — James's 0.39.258 rule ("not to inject anything into it that
        i cant edit in the agent settings") — closed in BC2.
      proof: "the build context is packed and the file prompt splits full / by interface"
      conditions:
        - { says: "the build context is packed and the file prompt splits full / by interface", check: { kind: tests, run: "node tests/modules/test-build-context.test.js" } }

    BC2_the_build_agent_gets_all_of_the_hat_and_repo_context:
      layer: api
      systems: [idearium, core, loom]
      value: { score: 5, cost: M, for: [quality, ownership], why: "all of the hat/repo context reaches the builder, and only through blocks he can edit" }
      status: DONE (0.39.329)
      depends_on: [BC1_build_context]
      files: [lib/repo-prompt-blocks.js, idearium/api/index.js, lib/build-context.js, idearium/event-taxonomy.cjs,
              loom/maps/build-context-map.js, loom/bootstrap.js, docs/build-context.spec, scripts/bench-file-prompt.js]
      does: >-
        "They need context. All of it. From the hat/repo." A file chunk's build agent wears the repo's hat (its
        persona: the atlas facts and what it has learned, his corrections first — as before) and gets every context
        source the Agent tab has, through the repo's prompt blocks: four BUILD blocks (when: build), ON by default
        because a build agent has no tool loop to fetch them with — build-memory (its own past work and this
        project's same-layer files: agent-memory recall), build-context (lib/build-context.js), build-atlas (everything
        else NEXUS remembers that matches the file: context-atlas), build-code (this repo's own code that matches the
        file: repo-context, with glyphs); the file's registry card is build-context's RELATIONS. Each is editable
        and switchable in Settings → Agents like every other block; nothing reaches the prompt that he cannot edit.
        C-D6 for build prompts: settled by James ("All of it") — proven primitives by interface, never bytes, never a
        failed version.
      proof: "a file build's prompt carries the hat and every enabled build block, and a disabled block sends nothing"
      conditions:
        - { says: "a file build's prompt carries every enabled build block, a disabled one sends nothing", check: { kind: tests, run: "node tests/modules/test-build-context.test.js" } }
        - { says: "the real server's model receives it", check: { kind: tests, run: "node tests/modules/test-prove-loop.test.js" } }
        - { says: "build-context is in loom with its real wires", check: { kind: tests, run: "node tests/modules/test-build-context.test.js" } }

    BC3_what_a_build_was_sent_as_a_node:
      layer: library
      systems: [idearium, core, copilot]
      value: { score: 3, cost: S, for: [ownership, safety], why: "every dispatch can be replayed and explained from a node, not only from a response field" }
      status: OPEN — James's call (which node type)
      depends_on: [BC2_the_build_agent_gets_all_of_the_hat_and_repo_context]
      files: [lib/node-schemas/schema.injection, lib/node-export.js, idearium/api/index.js]
      does: >-
        "Also what about the .node types." What a build agent was sent (persona as edited, the build blocks used, their
        chars, the sources and what failed) is today only in the build response and the chunk.complete event. It becomes
        a node. NODE-TAXONOMY.md's `.injection` exists for exactly this ("every time something gets prepended to a
        dispatch, there'd be a real node recording what and why") but its schema is copilot's call-model shape
        (provider, primed, injectedToolGuide…). Either the schema widens to any dispatch (source: copilot | build) or a
        new type is added — his call. The chunk's `.chunk` node then links to it.
      proof: "a file build writes one node naming the blocks it sent, their sizes and its chunk; a failed source is on it"

    BC4_relational_context_wired_or_archived:
      layer: library
      systems: [core, loom]
      value: { score: 2, cost: S, for: [quality], why: "a module with no caller is debt; one upstream walk, not two" }
      status: OPEN
      depends_on: [BC1_build_context]
      files: [lib/relational-context.js, lib/build-context.js, lib/registry-harness.js]
      does: >-
        Found: lib/relational-context.js (R10, "everything exists in relation to something") is required only by its
        own test. BC1 walks the same upstream wires through lib/registry-harness.js's index (no second LoomDriver). Two
        implementations of one walk is §16.5 debt. Either build-context calls relational-context's upstreamDependencies
        (and its token comparison becomes the build context's measured saving), or relational-context is archived with
        a pointer to build-context — not deleted (§0.3). Proposed: wire its token-count gate into BC1's measurement and
        archive the rest.
      proof: "exactly one upstream walk is called in the build path; the other is archived with a pointer, or wired and tested"
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
      status: "DONE (0.39.314) — rewritten from his description only: his words, the tree, the rules (0.39.312 and earlier archived). Genesis's file list and Domain 0a still name the old sections — SB28"
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
      james: '"like look at the atlas template" · "Then an atlas in the atlas template but not a list, each detailed, and referenced. All expanded."'
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

    SB28_genesis_in_the_shape_nexus_systems_have:
      layer: foundation
      status: "DONE (1.20.0, 0.39.359) — genesis 1.4.0's GENESIS_FILE_TREE is the COS archetype nexus-system, file for file (45 files, 6 layers, wiring clean), generated by cos/archetype/genesis-catalog.js with each file's depends its real require()s; a domain → file map heads the catalog; 1.3.0 archived whole (templates/_archive/genesis-1.3.0.spec). The shape is the architecture template's tree (architecture-spec.template.yaml), which is Guardian's and versionium's. test-genesis-and-architecture-spec 7/7, test-manifest-phase1 18/18 (its tooling tests use the archived 1.3.0 as their fixture), test-system-skeleton SK-01."
      james: '"compartments? no system in nexus looks like this"'
      overlaps: "SB17 (genesis is the template's architecture — this makes its FILE LIST match), SB23 (the system declaration)"
      depends_on: [SB17_the_system_template_is_complete]
      files: [idearium/spec-engine/templates/genesis.spec, idearium/spec-engine/templates/architecture-spec.template.yaml]
      does: >-
        The coder's reading: genesis's manifest declares the files a real Nexus system has, versionium's shape:
        server.js, config.js, compartment.json, registry-components.js, interaction-contract.json, event-taxonomy.js, lib/
        (its modules and components), routes/ and a CLI, schemas/ (a schema per node type it owns), spec/ (its living
        spec), data/ (its nodes and JAA tables, created at run time), tests, and its atlas — each with uuid, layer and
        depends, so the wiring check still runs. The compartments/kernel/lattice/nerve/tv-shell design is archived whole,
        not deleted; anything in it a real system needs (the heartbeat, the node index, the gate) keeps its place.
      proof: "genesis's manifest lists versionium's shape, the wiring check stays clean, and the old design is in the archive"
      conditions:
        - { says: "genesis's manifest lists versionium's shape, the wiring check stays clean, and the old design is in the archive", check: { kind: tests, run: "node tests/modules/test-genesis-and-architecture-spec.test.js" } }

    SB29_the_build_flow_in_his_order:
      layer: api
      status: OPEN
      james: '"like needs to map, phase, check for snapshot if none exist, create one, then populate the plan section and begin, then add precommited changes to the files tab, greyed out. dont create an entirely new repo, just compartment until the changes are commited."'
      overlaps: "the one-idearium map's I2 (snapshot before a phase run); the coding-flow map's W2/W3 (plan lands, work surface); staging S1; file-state P (greyed proposals); speceng.codegen (makes a second repo — to change)"
      depends_on: [SB26_an_imported_project_shows_its_progress, SB12_the_registry_is_the_component_list]
      files: [idearium/api/index.js, idearium/api/build-surface.js, idearium/repo/file-state.js, idearium/repo/build-plan.js, lib/cos-bridge.js]
      does: >-
        His order, one flow: map → phases → a Versionium snapshot (the coder's suggestion: before every run, his call) →
        the Plan panel filled → building begins. Everything built lands in the repo's OWN compartment (a COS branch of it),
        never a new repo — codegen included, replacing the second "code repo" — and shows in the Files tab greyed, as
        pre-committed, with its diff. Commit (all, or file by file) promotes it into the repo; discard drops it; the
        snapshot stays the way back.
      proof: "a phase run on a fixture repo snapshots, fills the plan, writes into its compartment only, shows each file greyed until commit, and makes no second repo"
      conditions:
        - { says: "a phase run on a fixture repo snapshots, fills the plan, writes into its compartment only, shows each file greyed until commit, and makes no second repo", check: { kind: tests, run: "node tests/modules/test-build-flow-order.test.js" } }

    SB30_the_template_is_a_skeleton:
      layer: foundation
      status: "DONE (1.20.0, 0.39.359) — James, after the map: \"then we can have it a cos template with reusable components.\" The skeleton is the COS archetype nexus-system (cos/archetype/nexus-system.js), assembled every time it is read from cos/archetype/nexus-system/ (server.js serving route nodes, cli.js running command nodes, lib/system.js boot, the core component and its seed nodes, the registry, the contract, the taxonomy from event nodes, the spec, its own test), the reusable components in cos/archetype/components/ (atomic-write, envelope, jaa-store, ledger, bus, node-index, listener, heartbeat, handshake, commands — each also offered alone as cos-component:<id>, bringing what it requires) and the template's schemas as JSON. No require outside its own tree. A capability is added by nodes alone (the component nodes lie over the registry). test-system-skeleton SK-02, SK-03, SK-07."
      james: '"Like I want this to be a skeleton, only using the minimal code. Then expands from there. Using the .spec as a living model."'
      overlaps: "the architecture spec's HARDLINE_AS_LITTLE_AS_POSSIBLE and SPEC_IS_LIVING_MODEL; SB21 (derived parts grow with the system); SB24 (loom builds a new system)"
      depends_on: [SB17_the_system_template_is_complete]
      files: [idearium/spec-engine/templates/architecture-spec.template.yaml, idearium/spec-engine/templates/system/schemas/, docs/architecture-spec/architecture-spec.spec]
      does: >-
        The coder's reading: what the template builds first is a skeleton — the tree, the registry, the schemas, and only
        the minimal code that makes them live (server.js serving the route nodes, cli.js running the command nodes, the
        listener, the JAA index, the heartbeat) — and the system expands from there by adding nodes, not by rewiring code.
        Its .spec is the living model, edited in place as it grows, with its version history; its atlas is written in the
        atlas template, each part detailed and referenced, never a bare list (SB25).
      proof: "a skeleton built from the template boots, serves its route nodes, runs its command nodes, and gains a capability by adding nodes alone"
      conditions:
        - { says: "a skeleton built from the template boots, serves its route nodes, runs its command nodes, and gains a capability by adding nodes alone", check: { kind: tests, run: "node tests/modules/test-system-skeleton.test.js" } }

    SB31_every_new_repo_is_the_skeleton_the_idea_slots_in:
      layer: api
      status: "DONE (1.20.0, 0.39.359) — lib/file-tree-plan.js: with the skeleton, the agent plans only the slot (lib/, tests/, ui/: components with a capability and commands); slotIn writes each one's registry entry and its component, capability, command, event, route and hook nodes with no dispatch, leaving only its code to build. speceng.codegen: the skeleton with the spec's registry slotted in (no agent) or the agent's components; slotting nothing in is a 422. speceng.create: genesis (the default for a system) means the skeleton; an empty slot is said (plan.slot, plan.warning), the spec still made. body.skeleton === false / fileTree === false keep the old plans. Drift: the proof's test is test-system-skeleton.test.js (SK-04, SK-05, SK-06, SK-08), not test-repo-is-the-skeleton.test.js; the workshop's bare repo (a document) is unchanged — its code repo comes from codegen."
      james: '"This should be what each new repo builds and slots the idea into like a slot. Agnostic."'
      overlaps: "SB18 (the template used), SB30 (the skeleton), SB24 (loom builds a system), SB29 (the build flow), SB12 (the registry drives the build)"
      depends_on: [SB30_the_template_is_a_skeleton]
      files: [idearium/repo/index.js, idearium/api/index.js, lib/file-tree-plan.js, lib/registry-plan.js, idearium/spec-engine/templates/architecture-spec.template.yaml]
      does: >-
        Every new repo builds the skeleton (the template), and the idea slots into it.
      proof: "two unrelated fixture ideas each get the skeleton, with their own idea slotted in"
      conditions:
        - { says: "two unrelated fixture ideas each get the skeleton, with their own idea slotted in", check: { kind: tests, run: "node tests/modules/test-system-skeleton.test.js" } }


    SB32_context_is_never_optional:
      layer: api
      status: "DONE (1.13.0, 0.39.325) — lib/repo-agent.js: _grounded() re-grounds the persona on the live index every send; contextFor: named file → its card; else a search of the question's words (a system's atlas first, its opening carried) → cards; else the project's map. test-agent-context-always 4/4."
      james: '"agents always need context, not optional." · "like context isnt optional its vital"'
      found: "his screenshot 2026-10-05: the agent tab says 2133 files · 17332 chunks indexed, the agent answers 'has not been indexed yet' — its persona is the copy written when the hat was forged and was never re-grounded; and a question naming no file got 'context: none'"
      depends_on: [SB3_the_section_prompt_is_domain_agnostic]
      files: [lib/repo-agent.js, lib/repo-hat.js]
      does: >-
        Every send carries context. The persona's index facts are re-grounded on the live index each send. A question
        that names no file gets the cards of the files a search of its words finds; when nothing matches, the project's
        map (files, chunks, top folders) — never nothing.
      proof: "a hat forged before indexing answers with the live index after it; 'tell me about idearium' carries idearium's cards; a question matching nothing carries the map"
      conditions:
        - { says: "context on every send", check: { kind: tests, run: "node tests/modules/test-agent-context-always.test.js" } }

    SB33_the_agent_runs_the_pipeline:
      layer: api
      status: "DONE (1.13.0, 0.39.325) — idearium.repo_chunks.tool action:\"reindex\" → POST /api/repos/:uuid/reindex; the route refreshes the persona after the pipeline; an unindexed persona tells the agent to run it. test-agent-context-always CA-04, test-repo-chunks-tool 11/11."
      james: '"also running the pipeline the agent should be able to do."'
      depends_on: [SB32_context_is_never_optional]
      files: [lib/agent-tools/tools/idearium/repo-chunks.js, lib/repo-hat.js, idearium/api/index.js]
      does: >-
        The agent runs its project's import pipeline itself (idearium.repo_chunks.tool action:"reindex" → POST
        /api/repos/:uuid/reindex) instead of asking for it; the persona refreshes when the pipeline finishes.
      proof: "the tool's reindex action posts to the route; an unindexed persona tells the agent to run it, not to ask"
      conditions:
        - { says: "the agent can run the pipeline", check: { kind: tests, run: "node tests/modules/test-agent-context-always.test.js" } }

    SB34_context_is_the_code_tab_the_graphs_and_memory:
      layer: api
      status: "DONE (1.14.0, 0.39.326) — lib/repo-agent.js contextFor: named file → registry card; the Code tab's search (lib/code-intel query) → the best chunks with their cards and the top chunk's code; the graph around the top file; nothing → the code-intel overview. _withMemory: context-atlas searched every send (not only with its block on). The 'all'/'project' scopes keep lib/repo-context.js first. Found and fixed: (a) the prompt rendered context only of kind 'card' — code and map went to blocks off by default, so SB32's map never reached the model; now every kind reaches it; (b) lib/registry-harness.js read the graph's inverse edges (depended_on_by) as requires, so every dependency looked required both ways. test-agent-context-always 5/5 on a pipeline-built index."
      james: '"im not saying the atlas. im saying the graphs, chunking, the code tab, all of it, actually look at the context retrival."'
      found: "the default (harness) scope's context was the registry card of a file the question NAMES, nothing else: it never used the chunk index, the Code tab's search (lib/code-intel: BM25 over every chunk's name, doc, path and body), the chunk cards (uses, used by, tests), the graph, or memory (lib/context-atlas — off unless its block is switched on). SB32's fix searched file names; that is replaced here."
      depends_on: [SB33_the_agent_runs_the_pipeline]
      files: [lib/repo-agent.js, lib/code-intel/index.js, lib/context-atlas.js, lib/registry-harness.js]
      does: >-
        One retrieval, every send, every scope: (1) a file the question names → its registry card; (2) the Code tab's
        search over the chunk index → the best chunks, each with its card (what it uses, what uses it, its tests) and the
        lines that matched, the top chunk's code; (3) the graph: what the top file requires and what requires it; (4)
        memory and graphs (context-atlas), always, not only when its block is on; (5) nothing found → the code-intel
        overview (folders, most-used files, entry points). Within a budget a small model can hold.
      proof: "a question naming no file gets the chunk whose code answers it, with its card and code; the memory search runs with its block off; an unmatched question gets the overview"
      conditions:
        - { says: "context from the code tab, the graphs and memory", check: { kind: tests, run: "node tests/modules/test-agent-context-always.test.js" } }

    SB35_the_index_is_there_when_the_agent_asks:
      layer: api
      status: "DONE (0.39.335) — mapped from his boot log before code. guardian/jaa-store.js maxWait (5 s); nexus-self flushTables() per system, name fallback, syncing(uuid); idearium/api _ensureIndexed + _agentDir at all seven agent entry points. test-agent-index-ready 4/4; IA-01 and IA-02 fail on the code before it."
      james: '"why are the agents still not using the context. fix it. actualy fix it. do not hand it back until you. wasting my fucking tokens"'
      found: >-
        SB32–SB34 made the retrieval right, but it reads an index that was not there. His log of 12:23–12:26: (a) idearium
        never flushed on Ctrl+C (every other service printed "[jaa] SIGINT received — flushing"; idearium was inside the
        nexus-self sync). guardian/jaa-store.js debounces a table's flush by 1.5 s and RESTARTS the timer on every
        write; the sync writes idearium_repos about every second for its whole run, so the table is never flushed while a
        sync runs — a stop mid-sync loses every repo row it wrote. (b) Next boot: "Loaded 4 rows — idearium_repos"; every
        system found no repo marked nexusSelf and logged "created" again; core was re-ingested from nothing. (c) His
        question reached the agent at ~12:26:07, while core's 2,235 sources were being written (12:26:08) and before its
        pipeline (READY 12:26:25): contextFor found no indexes/cards.json and sent "context: none — no index to read",
        telling a 3b model to run the pipeline itself. (d) A repo row that lost materializeDir resolves to
        data/projects/<uuid> (the log wrote architect, diagnostic, eravos, intelligence there) while its index may sit in
        nexus-self/repos/<uuid>.
      depends_on: [SB34_context_is_the_code_tab_the_graphs_and_memory]
      files: [guardian/jaa-store.js, idearium/lib/db.js, idearium/repo/nexus-self.js, idearium/api/index.js, lib/repo-agent.js]
      does: >-
        (1) The store flushes a table at most 5 s after it first became dirty, however often it is written (maxWait);
        the debounce still coalesces bursts. (2) nexus-self flushes the repo rows after each system and finds its repo
        by name when the nexusSelf mark was lost, so a stopped sync is never a full re-ingest. (3) One
        _ensureIndexed(repoUuid) before every agent send: waits for the nexus-self sync of that repo when one is running,
        takes the directory that actually holds indexes/cards.json, and when none does but the sources are on disk runs
        the import pipeline there (the same runImportPipeline as POST /reindex) and re-grounds the persona; concurrent
        sends share one run. The agent is never told to index its own repo.
      proof: "a table written every 200 ms is on disk within 5 s; a repo row stripped of its nexusSelf mark is updated, not created; an agent send on a repo with sources and no index gets the code search's chunks in its prompt; a send during the sync waits for it"
      conditions:
        - { says: "the index is there when the agent asks", check: { kind: tests, run: "node tests/modules/test-agent-index-ready.test.js" } }

    SB36_every_agent_can_use_the_tools:
      layer: api
      status: "DONE (0.39.336) — built before it was mapped (drift, recorded here): the cause was traced live from his two screenshots and fixed in the same pass. tool-syntax when 'tools' (guardian and ollama), its words say where the tools run; copilot makeOllamaCallModel reads a written call with _findToolCalls; repo.code reads use _agentDir; PREVIOUS_DEFAULTS upgrade a stored old default. test-agent-tools-every-backend 4/4 (AT-01, AT-02 fail on the code before)."
      james: '"like its not working. the tool. the agents job is to find context. ollama, copilot, guardian agents need to be able to use the agent tools." · "like they need the tools, all of them."'
      found: >-
        His screenshots: the Ollama agent (qwen2.5-coder 3b) answered from nothing and its "reindex" went into @learn and an
        empty code block — it never called a tool; the guardian agent (ChatGPT) said the idearium.* tools "are not actually
        exposed in this session. I checked the available tool registry". In the code: copilot's tool loop for Ollama posts
        to the bridge's /api/jobs without the tool schemas (his log: "tool-loop · generate"), so no native tool call can
        come back; the prompt's call syntax (tool-syntax) was sent to guardian only; makeOllamaCallModel read only native
        tool_calls, never a written one. Native schemas would not have helped a 3b model either: 126 tools, 138,542
        characters of JSON against num_ctx 6144. For a browser agent the loop worked (it reads the rendered ```tool block),
        but the block said "You have real tools available" — a model with its own function tools looks there first.
        The code tools themselves read /api/repos/:uuid/code/*, which resolved its directory the old way (SB35's bug).
      depends_on: [SB35_the_index_is_there_when_the_agent_asks]
      files: [lib/repo-prompt-blocks.js, copilot/tool-runtime.js, idearium/api/index.js]
      does: >-
        One call protocol for every backend that runs the tool loop — ollama, guardian, and the copilot position (it
        resolves to one of them); claude-code keeps its own tools. The tool-syntax block (editable, default) says: find the
        context first; the tools run in Nexus, not in your built-in tool list, never call them unavailable; write a call as
        a ```tool block; Nexus sends back the result. Copilot reads a written call out of an Ollama reply with the same
        parser as a browser reply (the fenced block, or a known tool's bare {"name": …}). The code tools' reads take the
        directory that holds the index, built on demand. A row that stored an earlier default text follows the new
        default; a text James wrote stays. The first message stays under 3,000 characters (RH-006).
      proof: "every tool-loop prompt says where the tools run and how to call one; an Ollama reply that writes a call runs the real code search on the real server and the next round carries its result; a browser reply's rendered call runs the same way; the code tools read an index made on demand"
      conditions:
        - { says: "every agent can use the tools", check: { kind: tests, run: "node tests/modules/test-agent-tools-every-backend.test.js" } }

    SB37_the_working_set_signal_to_noise:
      layer: library
      status: "DONE (0.39.337) — mapped before code. copilot/lib/workset.js; makeOllamaCallModel feeds each read in and sends prompt + synthesis; the 'workset' block (editable); a small read (≤ 1,500 chars) kept whole; COPILOT_WORKSET_DIR sandboxed; copilot/data/worksets/ git-ignored. Five ~20 KB reads: last round 119,260 → 1,601 chars, whole run 358,032 → 5,331. test-copilot-workset 4/4."
      james: '"what if it builds a temporary, index of context, copies the relevant context to it, one by one until it synthesize it into it into only what it needs." · "I know it''s a fucking problem. This is a real problem when I push it. So, so, uh, as I said, uh, in index, but we do JAA or uh, JSON. Probably just a JSON file. So it''s synthesizing. Find the context one by one, put it in an index, and then synthesize it into, into just what it needs. Signal to noise."'
      found: >-
        copilot/tool-runtime.js makeOllamaCallModel (composed) re-sends the whole run every round — the prompt, every
        reply, every tool result in full, nothing capped — into num_ctx 6144, and Ollama truncates from the front: the
        more context an agent finds, the sooner the persona and the question fall out. No working set exists anywhere
        (searched lib/, copilot/: no working set, no result cap). What is there to build on: the chunk cards (already a
        compressed form of a chunk), the tool-result block (editable), lib/test-sandbox.js's per-store variables.
      depends_on: [SB36_every_agent_can_use_the_tools]
      files: [copilot/lib/workset.js, copilot/tool-runtime.js, copilot/server.js, lib/repo-prompt-blocks.js, lib/repo-agent.js, lib/test-sandbox.js]
      does: >-
        One JSON file per tool-loop run, owned by copilot (copilot/data/worksets/<id>.json; COPILOT_WORKSET_DIR, the
        sandbox redirects it): the question, then each tool read, one by one — the raw result kept in the file, and its
        signal: the lines that carry the question's terms, the chunk ids, signatures, what uses what — the rest dropped
        from the prompt (kept on disk). Each round the model is sent its prompt and the working set synthesized to a
        budget (the most relevant first, deduplicated by chunk id), never the raw transcript; a chunk is re-opened by its
        id. The synthesis is framed by a new editable block ('workset'). The answer is written to the file — its
        provenance. Ollama only: a browser tab keeps its own conversation and is sent each result once (unchanged).
      proof: "a run whose tool results add up to far more than the window sends a prompt that never grows past the budget, still carries the question and the persona, and keeps the line that answers it; the JSON file holds every raw result and the answer"
      conditions:
        - { says: "the working set keeps the signal", check: { kind: tests, run: "node tests/modules/test-copilot-workset.test.js" } }

    SB38_prerequisites_the_questions_first:
      layer: library
      status: "DONE (0.39.338) — mapped before code. lib/context-prereqs.js check(); repo-agent prereqsFor() in dispatch (recorded as gaps) and the preview (not recorded); the editable 'prereqs' block before the question. Past conversations: this repo's agent, then copilot — never another project's (found while testing: the first cut searched every agent, and one project's conversation answered another's question). test-context-prereqs 7/7."
      james: '"What if instead of just a tool, it''s a compartment, like the work surface is in COS. Right? It would be like ask a question or or a intent or whatever. And then predetermine what context is needed. So make like prerequisites. Then uh, use those as a checklist for context. And then then use that to build the the uh, the work set index." · "Yeah, the, the prerequisites, the questions, right? That way, then if it can''t, if it can''t find context, then it''ll, it''ll just ask me the rest, or reference the past conversations"'
      decided: >-
        The coder's input, given before this was mapped: not a COS compartment per question (gathering context only reads;
        a compartment is for a task that writes and runs — a build, an order); the checklist is made by Nexus from the
        index, not by the 3B model; every item is checkable against chunk ids. James answered on the prerequisites and
        what happens to the ones not found; the compartment question was not answered — left as the coder proposed.
      found: >-
        lib/shadow.js already declares what a step must produce and reads each absence as a gap (gap-field) — the
        checklist's settle is that. lib/code-intel answers what a chunk uses, what uses it and its tests (cards);
        lib/build-context.js finds the spec's MUST/NEVER lines; lib/agent-memory.js search() reads past conversations
        (every agent's exchanges in the download manager). Nothing turned a question into what it needs before searching.
      depends_on: [SB37_the_working_set_signal_to_noise]
      files: [lib/context-prereqs.js, lib/repo-agent.js, lib/repo-prompt-blocks.js]
      does: >-
        Before each send: (1) the question's intent — explain, change, debug, build — by its words, no model; (2) its
        target, from the Code tab's search; (3) the prerequisites that intent needs of that target — explain: the chunk,
        what it uses, what uses it; change: + its tests and what it must be (the acceptance, from the question); debug:
        + the error as it appeared; build: where it goes and what exists like it. (4) Each is looked for in order: the
        index (Nexus reads it, no model), then past conversations (agent-memory search); (5) what is still missing is
        not guessed: it is asked — the prompt's editable 'prereqs' block lists the checklist and tells the agent to ask
        James those questions; a gap is recorded (lib/shadow.js). His answer is the next exchange, so the next time the
        same question is asked it is found in past conversations. The checklist travels with the run (ctx.prereqs).
      proof: "an explain question gets its chunk, uses and users checked off from the index; a change question that does not say what it should do asks for it; an item found only in an earlier conversation is checked off from there; what is not found is asked, never guessed, and recorded as a gap"
      conditions:
        - { says: "the questions first", check: { kind: tests, run: "node tests/modules/test-context-prereqs.test.js" } }

    SB39_the_checklist_builds_the_working_set:
      layer: library
      status: "DONE (0.39.339) — mapped before code, then cut (his \"no noise\"): the DOM and debug domains were mapped as SB40/SB41 and removed again before any code; registerDomain() takes them when he wants them. test-checklist-workset 6/6."
      james: '"do it. we could use that for more than coding. coudl use it for debugging, dom in clearglass, or any data fed into a pipeline" · "im saying for anything it wants to learn. agnostic tool for context" · "don''t just agree. im not looking to add noise. can i build from inside nexus now?"'
      found: >-
        SB38's checklist and SB37's working set ran side by side: the checklist went into the first message, the working set
        started empty and knew nothing of what the question needed. lib/context-prereqs.js was written for code only.
      depends_on: [SB38_prerequisites_the_questions_first]
      files: [lib/context-prereqs.js, lib/agent-tools/tools/query/learn.js, lib/agent-tools/index.js, lib/agent-tools/tool-guide.js, lib/agent-tools/tool-catalog.js, copilot/lib/workset.js, copilot/tool-runtime.js, copilot/server.js, lib/repo-agent.js, lib/repo-prompt-blocks.js]
      does: >-
        (1) One agnostic engine: a DOMAIN gives the intents, the checklist and where an item is found; the engine does the
        rest the same for all — the domain's source, then past conversations, then ask James — and records the gaps. Domains:
        code (SB38), data (a record fed into a pipeline; its needs are fields with a path and a question), topic (anything
        else — what it is, where it lives, what it connects to, what was said before — from every store Nexus keeps, through
        context-atlas, and the code index when there is a repo). learn() picks the domain from what it is given.
        (2) nexus.learn.tool: any agent's handle on it — the checklist, the context found for each item, the questions.
        The context-tools block names it in one line. (3) The checklist is the Ollama working set's index: found items seed
        it, a code read ticks a missing target, the synthesis opens with the checklist — complete, or what is left to ask;
        the first round's prompt already carries the checklist, so the seeded set is sent only once a real read is in it.
      proof: "the working set opens with the checklist and the found context; a code read ticks the target; a pipeline record's missing field is asked; learn() finds a topic in Nexus's own specs; nexus.learn.tool answers; a new domain runs through the same engine"
      conditions:
        - { says: "the checklist builds the working set; the engine takes any domain", check: { kind: tests, run: "node tests/modules/test-checklist-workset.test.js" } }


    # ── 1.21.0 (2026-10-06): the capability to grow a system — expand from the spec, phased, chunked, coded ──
    # James: "the daw is a test. fuck the daw. were building capacity to build the daw, not the daw" · "yeah we need to
    # fix all o that. expanding using the specs, then phased, then chunked, then coded. look at the nexus repo. skeletons
    # need to be greyed out until they're coded."
    # The nexus repo already grows this way: a phasemap .spec in docs/ whose phases name their files, built by the phases
    # manager (snapshot first, the escalation ladder, the shadow of every file the phase names), the changes landing greyed
    # until committed. A skeleton repo (SB31) had none of it after it was made: slotting happened once, at creation.
    # (SB40/SB41 were the DOM/debug domains, mapped and cut in 0.39.339 — not reused.)

    SB42_a_repo_expands_from_its_spec:
      layer: api
      status: "DONE (1.21.0, 0.39.360) — lib/repo-expand.js (skeletonOf, expandPrompt, expansion) + POST /api/repos/:uuid/expand and the Phases tab's + expand. A snapshot first; the agent is shown the system's components and plans the new ones (file-tree-plan parseSlot, now with uses); slotIn appends to the registry and the spec's components and writes the nodes. Refused, nothing written: not a skeleton 409, nothing new 422, no snapshot 502. test-repo-expand EX-01, EX-03, EX-05."
      james: '"expanding using the specs"'
      depends_on: [SB31_every_new_repo_is_the_skeleton_the_idea_slots_in]
      files: [lib/repo-expand.js, lib/file-tree-plan.js, idearium/api/index.js]
      does: >-
        POST /api/repos/:uuid/expand { ask, feature } on a skeleton repo (its registry-components.js has the slot): a
        Versionium snapshot first; the agent is shown the system's own components and asked only for the new ones (the
        same slot rules as SB31: lib/, tests/, ui/; a capability and commands each; what each uses); slotting them in
        writes into the repo the registry entries, the living spec's components, and every component, capability,
        command, event, route and hook node — the spec grows before any code. A repo that is not a skeleton, or an ask
        that slots nothing in, is refused and said; nothing written.
      proof: "a skeleton repo asked for two features gains their registry entries, spec components and nodes, the old ones untouched; a non-skeleton repo is refused"
      conditions:
        - { says: "a skeleton repo grows from its spec; a non-skeleton repo is refused", check: { kind: tests, run: "node tests/modules/test-repo-expand.test.js" } }

    SB43_the_expansion_is_phased:
      layer: api
      status: "DONE (1.21.0, 0.39.360) — repo-expand phasemap(): docs/<date>-<feature>-phasemap.spec, one phase per component numbered in build order (after the components it uses), files [component, its test], invariants, proof and conditions; keys never reuse the repo's. Read by roadmap.buildRoadmap and the phases manager unchanged. test-repo-expand EX-02, EX-03."
      james: '"then phased" · "look at the nexus repo"'
      depends_on: [SB42_a_repo_expands_from_its_spec]
      files: [lib/repo-expand.js]
      does: >-
        The expansion writes a phasemap into the repo (docs/<date>-<feature>-phasemap.spec), in Nexus's own shape: one
        phase per component, its files (the component and its test), its depends_on (the components it uses), what it
        does (its commands as the functions it exports, ctx only — never another component), its proof. The repo's
        Phases tab reads it with no new code (roadmap.collectPhasemaps, loom's parser); the build plan shows each phase's gates.
      proof: "the phasemap the expansion writes is read by the phases manager: every component a phase, in dependency order"
      conditions:
        - { says: "the expansion's phasemap is read by the phases manager in dependency order", check: { kind: tests, run: "node tests/modules/test-repo-expand.test.js" } }

    SB44_phases_are_chunked_then_coded:
      layer: api
      status: "DONE (1.21.0, 0.39.360) — spec-engine planChunk: each planned code file is a pending chunk with its file (path, layer, purpose) and a fileTree row; the existing phase build codes them (its shadow expects the files the phase names); repo writeFile completes the chunk. test-repo-expand EX-03, EX-04b."
      james: '"then chunked, then coded"'
      depends_on: [SB43_the_expansion_is_phased]
      files: [lib/repo-expand.js, idearium/api/index.js, idearium/spec-engine/index.js]
      does: >-
        Each component's code is a chunk of the repo's spec from the moment it is planned (pending, no content); building
        its phase (the existing phase build: snapshot, ladder, shadow) codes exactly those chunks, and a written file
        completes its chunk (repo writeFile → completeChunk). Nothing is coded outside a phase; nothing new is invented
        for the build.
      proof: "an expansion's code files are pending chunks; writing one completes it; the phase's shadow expects exactly its files"
      conditions:
        - { says: "code files are pending chunks until written; the phase expects exactly them", check: { kind: tests, run: "node tests/modules/test-repo-expand.test.js" } }

    SB45_skeletons_grey_until_coded:
      layer: ui
      status: "DONE (1.21.0, 0.39.360) — file-state.js 'uncoded' (build-surface filesState passes the spec's chunks with no code); the Files tree and the Code tab grey it, tagged U; the summary counts 'not coded'. spec-engine _progressOf/_isComplete: slotOpen (a skeleton with nothing slotted in) is one more unit of progress and never complete; planChunk reopens a finished spec. test-repo-expand EX-04a, EX-04b, EX-06."
      james: '"skeletons need to be greyed out until they''re coded"'
      depends_on: [SB44_phases_are_chunked_then_coded]
      files: [idearium/repo/file-state.js, idearium/api/build-surface.js, idearium/ui/js/file-manage.js, idearium/ui/index.html, idearium/ui/css/code-surface.css, idearium/spec-engine/index.js]
      does: >-
        A file whose chunk is not coded is 'uncoded': greyed in the Files tab and the Code tab like a pending proposal,
        labelled U, until its code is written. A skeleton spec whose slot is empty is never 'complete' and never 100%:
        the slot is one more unit of its progress, open until a component is slotted in.
      proof: "an uncoded file reads 'uncoded' (greyed) and turns 'new' once written; a skeleton with an empty slot is not complete and under 100%"
      conditions:
        - { says: "uncoded files grey; an empty slot keeps the spec open", check: { kind: tests, run: "node tests/modules/test-repo-expand.test.js" } }

    # ── 1.22.0 (2026-10-06, MAPPED): ideas fed into an autonomous system — in COS, and every step by hand ──
    # James: "Using cos also. This is supposed to be ideas fed into an autonomous system. Human friendly, to use by hand
    # without ai."
    # Read before mapping: each repo already has its own COS compartment (_ensureCompartment); COS's Run menu
    # (lib/cos-run.js) already runs a skeleton by hand — run.entry (server.js), boot.probe, test.suite/all/file,
    # check.syntax, check.deps — in a branch of that compartment; SB29 (build in the repo's compartment until committed)
    # is OPEN. What no step has: a path with no agent (the expansion's form sends an ask), a proof that runs in COS and
    # closes the phase, and anything that walks an idea through the steps by itself.
    # The rule for all four: every step is a button and a CLI verb a person can run with no AI, and the autonomous run
    # only presses the same buttons in order — never a second path.

    SB46_every_step_by_hand:
      layer: api
      status: OPEN
      james: '"Human friendly, to use by hand without ai."'
      depends_on: [SB42_a_repo_expands_from_its_spec]
      files: [cos/archetype/nexus-system/cli.js, cos/archetype/nexus-system/lib/scaffold.js, idearium/ui/js/phases.js, cli/idearium.js]
      does: >-
        (1) The system itself grows by hand: its own CLI (node cli.js add component <name> --capability "…" --commands
        a,b --uses x) writes the registry entry, the nodes and a stub file that exports each command — no Nexus, no agent.
        (2) In idearium the + expand form has a manual mode: the components typed in (name, capability, commands, uses),
        sent as components — the same route, no agent. (3) The CLI verb for the expansion. Coding stays the Files/Code
        editor (a written file codes its chunk); closing a phase stays the status edit.
      proof: "a component added by the system's own CLI runs its command; the manual form expands a repo with no agent reachable"

    SB47_built_and_run_in_cos:
      layer: api
      status: OPEN
      james: '"Using cos also."'
      depends_on: [SB29_the_build_flow_in_his_order, SB46_every_step_by_hand]
      files: [lib/cos-run.js, idearium/api/index.js, lib/cos-bridge.js]
      does: >-
        A skeleton repo's phase builds and proofs happen in its own compartment (a COS branch of it), never on the repo
        until committed (SB29's order). The Run menu knows a nexus-system repo: start the system (server.js on a shifted
        port) and its CLI, run each component's test and the skeleton test, show /health. The same options the proof uses.
      proof: "a phase of a skeleton repo is built and its tests run in the repo's compartment branch; the repo changes only on commit"

    SB48_proof_in_cos_closes_the_phase:
      layer: api
      status: OPEN
      james: '"then coded" — and known: the proof does not check the slot'
      depends_on: [SB47_built_and_run_in_cos]
      files: [lib/registry-plan.js, idearium/api/index.js, lib/repo-expand.js]
      does: >-
        Verify checks every registry component of a skeleton repo: its file exists, parses, and exports the handler of
        each of its commands; the system's tests/skeleton.test.js and the phase's own test pass in COS. A phase whose
        files are coded and whose proof passes is closed (the map edited, recorded); one that fails says what, and is
        sent back to be built — by the agent, or shown to the person.
      proof: "a phase whose component exports its handlers and whose test passes in COS closes itself; a missing export keeps it open with the reason"

    SB49_an_idea_runs_through_by_itself:
      layer: api
      status: OPEN
      james: '"This is supposed to be ideas fed into an autonomous system."'
      depends_on: [SB46_every_step_by_hand, SB48_proof_in_cos_closes_the_phase]
      files: [lib/idea-run.js, idearium/api/index.js, idearium/ui/js/app.js]
      does: >-
        An idea fed in walks the steps on its own, each one the same button a person presses: spec (the workshop's
        template) → skeleton repo in its compartment → expand → each ready phase built → proven in COS → closed →
        committed. One run record per idea: the step it is on, each step's gate and its evidence. It stops and asks on
        what it cannot decide (ambiguity, a failure after the ladder, a commit), and a person can take any step over by
        hand and hand it back.
      proof: "a fixture idea walks from spec to a committed repo with stubbed agents; a failure stops it at that step with the question; a hand-done step is picked up"
