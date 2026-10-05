spec:
  meta:
    name:     build-from-the-spec
    version:  1.0.0
    date:     2026-10-05
    release:  0.39.304 (base) → 0.39.305
    uuid:     nexus-build-from-the-spec-phasemap-v1-0000-2026-1005-jamesbrooks-001
    owner:    idearium.spec-engine · idearium.repo · idearium.api · idearium.config
    status:   "MAPPED 2026-10-05; SB1–SB3 built with it (0.39.305), SB4–SB7 open"
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
      conditions:
        - { says: "his words are proven by their test", check: { kind: tests, run: "node tests/modules/test-build-from-the-spec.test.js" } }

    SB3_the_section_prompt_is_domain_agnostic:
      layer: library
      status: DONE (0.39.305)
      depends_on: [SB2_his_words_seed_the_spec]
      files: [idearium/spec-engine/index.js]
      does: >-
        The prompt describes the thing being specified, in its author's words, not "a NEXUS component": no internal
        ids (they stay on the chunk), the axioms by meaning, the frame as the shape, and the sections written so far
        as short summaries (lib/spec-digest.js's budgeted condensing, meta left out) with the instruction never to
        copy them. Persistence-before-behaviour and named failure modes stay, said in plain words.
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
      conditions:
        - { says: "a fidelity report names every kernel's differences", check: { kind: tests, run: "node tests/modules/test-template-fidelity.test.js" } }

    SB5_nexus_rebuilds_a_system_from_its_spec:
      layer: service
      status: OPEN
      depends_on: [SB4_template_fidelity]
      files: [lib/nexus-self/branch.js, lib/cos-run.js, idearium/repo/proof-run.js]
      does: >-
        The round trip, from within: one kernel's own spec goes through Idearium's normal pipeline into a COS branch,
        and its end state is that kernel's OWN existing tests passing against the generated code. ollama-bridge first
        (small, isolated, a fairly complete spec). What the spec could not produce is written back as a gap in that
        spec — which is how the specs become complete enough to rebuild from (§17.4). Never applied to the live tree
        by itself; the apply gate stays.
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
      conditions:
        - { says: "a music idea is offered the eravos mods", check: { kind: tests, run: "node tests/modules/test-domain-templates.test.js" } }
