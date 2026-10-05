spec:
  meta:
    name:     build-from-the-spec
    version:  1.1.0
    date:     2026-10-05
    release:  0.39.304 (base) → 0.39.305
    uuid:     nexus-build-from-the-spec-phasemap-v1-0000-2026-1005-jamesbrooks-001
    owner:    idearium.spec-engine · idearium.repo · idearium.api · idearium.config
    status:   "MAPPED 2026-10-05; SB1–SB3 built (0.39.305), the author-reuse fix (0.39.306); SB4–SB14 open. 1.1.0: the whole pipeline, idea → .spec → blocks → registry → components, reuse first"
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

  phases:
    SB0_map:
      layer: foundation
      status: DONE
      depends_on: []
      files: [docs/2026-10-05-build-from-the-spec-phasemap.spec, docs/SPEC-REGISTRY.spec]
      does: "This map, registered."
      proof: "the map exists"
      conditions:
        - { says: "the map exists", check: { kind: file, path: docs/2026-10-05-build-from-the-spec-phasemap.spec } }

    SB1_templates_are_the_default_frame:
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
      layer: library
      status: OPEN
      depends_on: [SB1_templates_are_the_default_frame]
      files: [idearium/spec-engine/templates/genesis.spec, architecture-spec/registry/, lib/nexus-self/systems.js]
      does: >-
        The reusable architecture checked against what Nexus really is: for each kernel, what genesis and the frames
        say a sovereign system has (server, CLI, API, event taxonomy, registry components, interaction contract, spec,
        tests, data root) against what the kernel's folder holds. Each difference is named as template-wrong or
        system-drifted, never averaged into a score. architecture-spec/registry/ (unwired today — 10 files, see the
        2026-10-05 wiring inventory) is the natural home.
      proof: "a fidelity report names every kernel's differences"
      conditions:
        - { says: "a fidelity report names every kernel's differences", check: { kind: tests, run: "node tests/modules/test-template-fidelity.test.js" } }

    SB5_nexus_rebuilds_a_system_from_its_spec:
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
      layer: api
      status: OPEN
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
      layer: library
      status: OPEN
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
      layer: library
      status: OPEN
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
      layer: library
      status: OPEN
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
      layer: library
      status: "PARTIAL — lib/registry-plan.js (parse, check, plan, checklist) and per-file dependsOn in createFileTreeSpec built; not yet wired into codegen or verify; overlaps DT4/DT4b in the agent-ready master map"
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
      layer: api
      status: OPEN
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
      layer: automation
      status: OPEN
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
