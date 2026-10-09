spec:
  meta:
    name:     spec-workshop-rebuild
    version:  1.2.0   # 1.2.0+: RS3 and RS9 built (0.49.0) · 1.1.0: RS5 built on James's yes (0.39.357) — the workshop's start page is the template picker · 1.2.0: RS9–RS11 (the phases, interconnected), recovered from branch claude/charming-lamport-mdzuau (d0e906f), never merged
    date:     2026-10-05
    release:  0.39.345 (base)
    uuid:     nexus-spec-workshop-rebuild-phasemap-v1-0000-2026-1005-jamesbrooks-001
    owner:    idearium (the workshop, the template picker, the architect, the blueprint) · warp (WARP 2) · intelligence (rfr2 clip)
    status:   "MAPPED 2026-10-05, before building; RS9–RS11 (the phases, interconnected) and the build order added; RS5 done (0.39.357); RS3 and RS9 done (0.49.0); RS10 done (0.50.0); RS11 done (0.51.0); RS6 re-mapped onto WS7"
    voice: >
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim. `does:` is the coder's
      reading, his to correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    axioms:   docs/AXIOMS-v3.1.md — §3.1 bottom-up, §3.3 map before build, §8.6 reuse before build, §0.3 nothing lost,
              §1.1 nothing pretends, §4.1 UI tested in Clear Glass.
    origin: >
      James, 2026-10-05: "i just want it to use the default architecture. Genesis. I'm thinking like document editor but
      for the emerge and .spec files. each block has a block id, which can be completely custom, can be anything." ·
      "just warp 2, is garbage it seems. its a framework ro uild code. i wanted it to use deterministic primitives, and
      then anything on top is probabilistic. like a constraint field, or emergence." · "like you start with an idea, then
      promote it, goes to the spec workshop, opens a pick template screen like photoshop does when you first open it.
      with a custom or manual option with a plus sign. then you pick a template from the list, including all the quick
      spec options, then after thats all worked out, then the architecture or architect editor, which uses the component
      registry, that is why the component registry is manditory, at least when using the systems or genesis template.
      then the blueprint, which is the entire blueprint, maybe for building the entire project, and maybe as it goes on
      reconstructing it like look at the macros and blueprints in rfr2, or the rewind engine. clips" · "yes. im saying
      rebuild the spec workshop. im saying we could record the generation process from the agents and create a macro or
      replayable file to rebuild or reconstruct data using events, snapshots etc." · "okay now the phases with the
      spec workshop. needs to be rebuilt, enterprise grade. interconnected"
    supersedes: >-
      docs/2026-10-05-idea-to-spec-workshop-phasemap.spec WK1–WK3 (blocks, templates, drafts) — folded in here; its WK4
      (the void feeds the workshop) and WK5 (lanes → gaps, phases) stand and build on RS6. Closes WS5, WS6 and UI0 when
      RS6 is built.

  found:
    - >-
      WARP 2 (0.39.323) is the causal layer only — links, expectations, the ledger. It is not wired to anything that
      builds: the shape he wants (deterministic first, a model only when needed, its output gated, what converges made
      deterministic) is WARP 1.x's dispatch (exact cache → pre-generation filter → population → cascade → axiom gate →
      score-retain → crystallize after 3). The coder judged WARP 2 as an event bus (a benchmark, a POS) instead of as the
      framework that builds code.
    - >-
      The pipeline he describes is already the workshop's station bar: 01 IDEA → 02 SPEC → 03 ARCHITECT → 04 BLUEPRINT →
      05 REPO → 06 COS. The quick spec's dialog lists the templates as checkboxes, genesis ticked by default.
    - >-
      Recording and replay exist in pieces: rfr2's clip (intelligence/rfr2/clip — a bounded causal slice, replayed with
      restoreClip, checked with a stability profile), the cfr-kernel rewind engine (emergence/vendor/rfr2/cfr-kernel/
      rewind.js — snapshots in a ring, seek, step, scrub), Versionium snapshots, WARP 2's causal ledger. Nothing records
      what the agents generated.

  pushback:
    - >-
      A replay is deterministic only if the recording holds what the model RETURNED. Re-asking the model on replay gives
      a different spec every time. So a macro stores each output with its prompt, model and context; replay applies the
      recorded outputs (no model); asking again is a separate, deliberate act — a branch from that step.
    - >-
      Custom block ids, as he said — with two rules: unique in the file, and a rename carries every reference (the
      registry, the blueprint, the macro, a phase's depends_on). The id is the block's address.
    - >-
      The registry is mandatory for the systems and genesis templates, optional for a blank or custom one — as he said.
    - >-
      Genesis as the default; its file list does not yet match the real systems (SB28). Fixed with RS3, or every new
      spec starts wrong.

  # ── 1.1.0 (2026-10-05) — the phases, interconnected ────────────────────────────────────────────────────────────────
  found_1_1:
    - >-
      The thread exists in the data and nothing reads it: a derived phasemap names its spec (meta.spec, spec_sha256) and
      each phase its sections (sections: [keys]) — idearium/repo/spec-plan.js derivePlan. A phase planned by the agent
      names no section. The Phases tab (idearium/ui/js/phases.js — Board · Layers · Table · Maps) shows phases with no
      spec text beside them; the workshop shows blocks with no phases beside them; the Plan and the Code tab know runs
      and files but not which block of which spec they serve.
    - >-
      For NEXUS itself the Phases tab is 913 phases across 62 maps on one board (his screenshot): no spec, no current
      work first.
  pushback_1_1:
    - >-
      One source of truth (§10.3): phases stay in the phasemap files, blocks in the .spec. The thread is read from both,
      never copied into a third store. Rebuilt means the surface, not the data — the board's build, status and add are
      kept, and the Table view stays.
    - >-
      Interconnection needs an address on both ends, so the order starts at the bottom: block ids (RS3), then the thread
      (RS9), then the surfaces. Building the new screens first would mean linking by guessed titles.
    - >-
      A map planned before this has no block ids on its phases: it says "no link to its spec", it is not guessed. The
      agent's plan prompt requires blocks: from RS9 on.
  build_order_1_1: "RS3 → RS9 → RS10 → RS1 → RS2 → RS4 → RS5 → RS6 → RS11 → RS7 → RS8"

  phases:
    RS1_the_generation_recorder:
      layer: library
      status: OPEN
      james: '"record the generation process from the agents and create a macro or replayable file"'
      depends_on: []
      files: [lib/generation-recorder.js, warp/core/Engine.js, intelligence/rfr2/clip/index.js]
      does: >-
        Every generation an agent makes for a spec or a build is a WARP 2 link: what caused it (the block id, the
        request), the prompt (hashed, and kept), the context it was given, the model, the output, and what happened to
        it (accepted, edited, dismissed). Document snapshots at points along the way. A recording exports as one macro
        file (rfr2's NEX-CLIP shape, extended with the outputs) — his to name.
      proof: "drafting three blocks records three links, each with its block id, model, output and verdict; the macro file round-trips (export → import → identical)"

    RS2_replay_rewind_branch:
      layer: library
      status: OPEN
      james: '"to rebuild or reconstruct data using events, snapshots etc."'
      depends_on: [RS1_the_generation_recorder]
      files: [lib/generation-recorder.js, emergence/vendor/rfr2/cfr-kernel/rewind.js]
      does: >-
        Replay a macro: the document rebuilt from the recorded outputs, byte-identical, no model asked. Rewind to any
        step (the rewind engine's seek over the snapshots). Branch from a step: ask again from there, the old path kept.
      proof: "a recorded spec replays byte-identical with zero model calls; rewinding to step 2 gives the document as it was; a branch keeps both paths"

    RS3_the_spec_document:
      layer: library
      status: "DONE (0.49.0) — lib/spec-document.js: detect (emerge · yaml · markdown · the workshop's sections list), parse into blocks that partition the file (emerge: domain \"…\" and // ── banners, with the comments directly above; yaml: top keys or, under one root, its keys; markdown: headings; the workshop form: each sections: item, its id its id: field), ids natural or given (a marker line // @block, # @block, <!-- @block -->; in the workshop form the id: field itself), serialize byte-identical, replaceBlock (every other block byte for byte, the check run on the result, an id it would duplicate refused), setId (any id but empty or a line break; a taken id refused), renameRefs (that spec's maps' blocks: / sections:), check (yaml by js-yaml; emerge structural — the Emerge kernel's parser reads another dialect, compartment · invariant · signal, not genesis's domains — said), isBookkeeping (meta, history … and the idea's framing, one rule with main's SP1). genesis.spec, a YAML phasemap, a markdown spec and a workshop spec round-trip byte-identical. test-spec-document. SB28 (genesis's file list) stays its own phase; the routes for editing blocks come with RS6."
      james: '"I''m thinking like document editor but for the emerge and .spec files. each block has a block id, which can be completely custom, can be anything."'
      depends_on: []
      files: [lib/spec-document.js, emerge/emerge-kernel.js, idearium/spec-engine/templates/genesis.spec]
      does: >-
        A .spec or .eg file as blocks over its real text — Emerge (domain "…", key = value) or YAML, detected. Each block
        is a range of the file with its own id: edited as text, comments and order kept, checked live by its own parser
        (the Emerge kernel's, the YAML one). Ids unique; a rename carries its references. Genesis's file list brought in
        line with the real systems (SB28).
      proof: "genesis.spec opens as its blocks and saves byte-identical untouched; an edited block keeps every comment; a duplicate id is refused; a renamed id is renamed where it is referenced"

    RS4_the_pipeline_on_warp2:
      layer: api
      status: OPEN
      james: '"i wanted it to use deterministic primitives, and then anything on top is probabilistic. like a constraint field, or emergence."'
      depends_on: [RS1_the_generation_recorder, RS3_the_spec_document]
      files: [idearium/lib/workshop.js, idearium/api/index.js, warp/adapters/emerge-field.js]
      does: >-
        idea → promote → template → spec → architect → blueprint → repo → cos, each station a WARP 2 link that expects its
        output. Deterministic first (the template, the registry, what was built before); the model only where a block or
        a part is missing, and its output passes the constraints (Emerge's, and the station's: the registry is required
        for the systems and genesis templates) before it is real. Every generation recorded (RS1).
      proof: "a spec on the genesis template with no registry block cannot reach the architect, and the gap names the block; a model draft that breaks a constraint is rejected with its id"

    RS5_the_template_picker:
      layer: ui
      status: "DONE (0.39.357) — on James's yes; see the addendum below"
      james_2026_10_05: >-
        asked "Should the workshop's start page become the RS5 "photoshop style" template picker?" — "yes with a custom or manual."
      addendum_0_39_357: >-
        Built as the WS7 workshop's start page (idearium/ui/js/template-picker.js, css in workshop.css), not a separate
        screen: what WS7 started from (a title, the Void, the library, a repo) is kept and becomes the picker's START FROM.
        The grid: + CUSTOM / MANUAL first (a blank document in manual mode — you write, the agent only points at what is
        missing), then every template the quick spec offers — the spec-document templates (genesis first, marked the
        default), the COS archetypes and COS blueprints — and his saved ones, in tabs with counts. The details panel
        previews the 11 parts, each lit where the template fills it (with its first lines), a COS template's starting
        files by layer; the title, START FROM, the mode, CREATE. A picked template seeds the workshop
        (GET /api/workshop/templates, POST /api/workshop {template, mode}): its seeded parts as sections, the MINIMUM
        parts it does not fill as empty sections; a COS template's files become the Build Order part. ?from=idea:<uuid>
        (a promoted idea) opens the picker with the idea as START FROM, no longer straight into a blank document.
        Templates: SAVE AS TEMPLATE in the writer saves the workshop's sections as a template — saving again from a
        workshop opened from that template is its next version, the old kept; REMOVE archives a saved one (kept, hidden).
        The built-in templates are files in the codebase: not removable from the page, said; editing one is opening it,
        changing it and saving it as a template.
      addendum_0_39_358: >-
        James, "where are the quick spec templates and the photoshop template start screen" — he opened the workshop from
        nexus/core (no .spec) and got a blank Purpose: 0.39.357 sent only a promoted idea through the picker. Now a repo
        with no .spec opens the picker with the repo as START FROM, and + NEW SPEC in the bar opens it from the writer.
      drift: >-
        depends_on RS4 (the pipeline on WARP 2) is not needed by the picker and was not waited on. RS5's blocks preview is
        the spec engine's 11 blocks (blocks.yaml) — RS3's id-keyed spec document is not built, so a block id cannot yet be
        custom. A COS template seeds its starting files into the spec; the code the pipeline builds does not yet start
        from those files (the New Spec modal's file-tree path does) — said on the card.
      james: '"opens a pick template screen like photoshop does when you first open it. with a custom or manual option with a plus sign. then you pick a template from the list, including all the quick spec options"'
      depends_on: [RS4_the_pipeline_on_warp2]
      files: [idearium/ui/workshop.html, idearium/ui/js/template-picker.js]
      does: >-
        Opening the workshop on a promoted idea shows the template picker first: every template (the quick spec's list,
        genesis first), each with its blocks previewed, and "+ custom / manual". Templates can be edited, saved (a new
        version, the old kept) and removed (archived).
      proof: "driven in Clear Glass: promote → the picker; genesis previewed with its blocks; + custom starts blank; a removed template is in _archive"

    RS6_the_workshop_as_the_editor:
      layer: ui
      status: "MOSTLY BUILT AS WS7 (0.39.354, docs/2026-10-02-workshop-codex-rewind-phasemap.spec) — the full writer: one document, the outline, the parts in tiers, the agent in three modes whose proposals need his yes, SEND TO THE PIPELINE; RS5's picker is its start. Not rebuilt here (two workshops would drift). What is left of RS6 is the macro's timeline along the bottom — scrub to rewind, replay, branch — which needs RS1 (the recorder) and RS2 (replay) first."
      james: '"rebuild the spec workshop."'
      depends_on: [RS5_the_template_picker, RS2_replay_rewind_branch]
      closes: [WS5, WS6, UI0]
      files: [idearium/ui/workshop.html, idearium/ui/js/spec-editor.js]
      does: >-
        The workshop rebuilt as the editor: the blocks down the left by id with each one's state, the block being written
        in the middle, the agent's proposal and the context on the right; "draft every block" (proposals, accept one or
        all); the macro's timeline along the bottom — scrub to rewind, replay, branch. No reach dial. Enterprise grade,
        driven in Clear Glass.
      proof: "driven in Clear Glass: a genesis spec drafted, accepted, rewound to step 2 and replayed to the end byte-identical"

    RS7_architect_and_blueprint_stations:
      layer: ui
      status: OPEN
      james: '"then the architecture or architect editor, which uses the component registry … then the blueprint, which is the entire blueprint, maybe for building the entire project, and maybe as it goes on reconstructing it"'
      depends_on: [RS6_the_workshop_as_the_editor]
      files: [idearium/lib/architect.js, lib/blueprint.js, idearium/ui/architect.html]
      does: >-
        The architect edits the registry block (components, hooks, wires) on the canvas; the blueprint is the whole
        project's build plan from it — every file, in dependency order, each a WARP 2 step expecting its file and its
        test. As it builds, each step is recorded (RS1), so the project can be rebuilt from its macro (RS2).
      proof: "a fixture spec's registry becomes a blueprint; the build runs step by step; deleting the built repo and replaying its macro rebuilds it identical, with no model call"

    RS8_what_converges_becomes_deterministic:
      layer: automation
      status: OPEN
      james: '"i wanted it to use deterministic primitives, and then anything on top is probabilistic."'
      depends_on: [RS4_the_pipeline_on_warp2]
      reuses: [docs/2026-10-02-emerge-field-memory-build-phasemap.spec — the crystallize phase (promote-after-N)]
      files: [warp/dispatch/population.js, lib/component-store.js]
      does: >-
        A generation that converges N times independently (N stated, tunable) is promoted into the deterministic core — a
        template part, a component — so the same thing is never asked of a model twice. The boundary moves up.
      proof: "a block drafted the same way N times becomes a template part offered with no model call; a contradicting outcome re-opens it"

    RS9_the_thread:
      layer: library
      status: "DONE (0.49.0) — idearium/repo/thread.js (a projection) + GET /api/repos/:uuid/thread (?spec= the thread; none = the specs its maps came from). spec-plan derivePlan, merged with main's SP1 (the workshop form by its sections, blanks not planned): every other spec cut by the document's blocks (genesis, which planned nothing before, plans 21 phases); every section carries its block's hash; it writes blocks: (exact ids) and meta.block_hashes; its prompt lists the block ids and requires blocks: on every phase; the one phasemap parser reads blocks: (else sections:). Staleness per block; an older map says the spec moved; no blocks: = 'no link', a missing id = 'broken'. test-thread (TH-04 through the real router: plan, edit one block, only its phases stale)."
      james: '"interconnected"'
      depends_on: [RS3_the_spec_document]
      files: [idearium/repo/thread.js, idearium/repo/spec-plan.js, idearium/repo/phases.js, idearium/api/index.js]
      does: >-
        One read over what exists: a spec's blocks (RS3, by id) ⇄ the phases planned from them (a phase's blocks:, the
        derived map's sections:) ⇄ each phase's runs (idearium_phase_runs: rung, model, state) ⇄ the files they wrote and
        the changes waiting (work surface). Each block carries its hash: a block edited after its phases were planned
        marks them stale, naming the block. GET /api/repos/:uuid/thread?spec= — a projection, it stores nothing. The
        plan prompt (spec-plan) requires blocks: on every phase; derivePlan writes them.
      proof: "a fixture spec of three blocks planned into phases: each block lists its phases, each phase its blocks, runs and files; editing one block marks only its phases stale; a map with no blocks: says 'no link to its spec'"
      note_0_47_0: "part of the ground is laid: derivePlan reads a workshop spec's sections and writes each phase's sections: and name: (docs/2026-10-07-idearium-one-surface-phasemap.spec SP1); the commits say which files they touched (OS1). The thread read itself is not built."

    RS10_the_phases_tab_rebuilt:
      layer: ui
      status: "DONE (0.50.0) — idearium/ui/js/phases.js rebuilt on the thread (GET …/thread, GET …/plan): the rail (every phasemap · each spec with its maps, its blocks planned / unplanned / moved · specs not planned yet with ⚡ plan · maps not from a spec); lanes by dependency layer, active and ready first, complete folded (✓ N complete — show, remembered); cards with their blocks (↻ stale), the Plan's gate bar, the last run's state, model and rung; the detail with the block's own text from the spec (moved since planned, or not in the spec any more), files and changes waiting (open in Code), the Plan's ledger, status, build (the ladder by default), open in the Plan, its spec in the Spec tab. Table and Maps kept; Board and Layers became Lanes; every action kept (status, build, ▶, add, expand, plan from a spec, live events). roadmap.js passes each phase's blocks. test-phases-tab 4/4 in Clear Glass."
      james: '"the phases with the spec workshop. needs to be rebuilt, enterprise grade."'
      depends_on: [RS9_the_thread]
      files: [idearium/ui/js/phases.js, idearium/ui/css/phases.css]
      does: >-
        The Phases tab opens on current work (complete folded, as the Plan) and per spec: left, the specs and their maps;
        middle, the phases in build order, lanes by layer, each card with its status, its gates (the Plan's gate bar), its
        blocks as chips, its last run's model and rung, a stale mark when its block moved; right, the phase: its block's
        text from the spec, its runs (the Plan's ledger), its files (open in Code), its changes (work-surface cards), and
        Build · status · open in the workshop · open in the Plan. Table view kept; the board becomes lanes.
      proof: "driven in Clear Glass: a spec's phases in lanes; a phase shows its block's text, its runs and files; a stale phase is marked; Build starts it and the card follows live"

    RS11_workshop_and_phases_one_surface:
      layer: ui
      status: "DONE on WS7's workshop (0.51.0) — idearium/ui/js/workshop.js: the saved spec's thread (GET …/thread, now naming the workshop that saved it) read on open, after save / plan / build and on focus (no polling); each section a strip of its phases (key, state — planned, active, the run's state, done, failed) that opens Idearium's Phases on that spec with that phase open; dots in the outline; ↻ CHANGED SINCE IT WAS PLANNED with REPLAN (the pipeline's replan); SAVING THIS CHANGES N PLANNED PHASES while a planned section is edited and not saved; ?block= opens at a section. The Phases tab: open in the workshop at the phase's block; a spec and phase handed from the workshop survive the switch to another repo. Not built: planning only the picked sections (the pipeline plans the whole spec; replanning keeps nothing of the old map's statuses — said, not hidden). test-workshop-thread 4/4, test-phases-tab PT-05."
      james: '"interconnected"'
      depends_on: [RS6_the_workshop_as_the_editor, RS10_the_phases_tab_rebuilt]
      files: [idearium/ui/workshop.html, idearium/ui/js/spec-editor.js, idearium/ui/js/phases.js]
      does: >-
        In the workshop each block shows its phases and their state (a dot per phase, live); "plan these blocks" plans the
        picked blocks into phases (derived, or the agent); editing a planned block says which phases it makes stale and
        offers to replan only those. Every link goes both ways: a phase opens its block in the workshop
        (?id=…&block=…), a block opens its phases in the Phases tab, either opens the Plan on its run.
      proof: "driven in Clear Glass: plan two blocks → their phases appear on them and in the Phases tab; edit one → its phases go stale in both; a phase's link opens the workshop on its block"

# ADDENDUM 2026-10-09 (0.52.0, HP1 + HP5 of docs/2026-10-09-hardening-pass-phasemap.spec) — James: "Do the hardening pass".
# RS9's thread: stale now spreads along depends_on. A phase built on a stale phase is stale through it (staleVia, the
# nearest stale dependency, within the map, by full id or short key; breadth-first, so a cycle cannot loop);
# summary.stalePhases counts it, staleDownstream says how many came through a dependency; RS10's Phases tab says
# "↻ via SH1". tests: test-thread TH-05.
# RS3's spec document: a byte-order mark hid every block (the first head line never matched) — heads are read without
# it, the bytes kept. CRLF, BOM, tabs, trailing spaces, no final newline and mixed endings round-trip byte-identical; an
# edit to one block leaves every other block's bytes and hash unchanged. tests: test-spec-document SD-08.
