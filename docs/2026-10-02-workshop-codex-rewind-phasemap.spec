spec:
  meta:
    name:     workshop-codex-rewind
    version:  1.7.0
    date:     2026-10-02
    release:  0.39.294 (DP1 + RW1) → each later phase its own patch
    uuid:     nexus-workshop-codex-rewind-phasemap-v1-0000-2026-1002-jamesbrooks-001
    owner:    idearium · cos · guardian · architect · lib · docs
    status:   "MAPPED 2026-10-02; SW1 built (0.39.294), SW2 (0.39.297), AR2 (0.39.298) — James chose the order: \"the workshop and maybe it hooks into the spec field\"; WS7 the full workshop (0.39.354)"
    axioms:   docs/AXIOMS-v3.1.md — §3.1 bottom-up, §3.3 map before build, §8.6 reuse before build, §0.3 nothing lost,
              §1.2 nothing silently fails, §10.3 one source of truth, §10.1 one write authority per data type.
    origin: >
      James, 2026-10-02 (with two screenshots of a repo's Settings tab: the environment READY, the extras go · ruby ·
      php · rust · desktop, all unticked): "need the spec workshop, completely destroy the spec builder, and build the
      spec workshop, with architect for archiecture using the component registry, components store with dependancies,
      you know, like maybe its time to start codex. need a better entery point, and  i figure we can start with, idea
      -> spec workshop -> architect -> destroy and rebuild blueprint -> Idearium repo -> Cos?
      everything enterprise grade and consistent with the style
      need more options in the popout window. like the rewind engine for the entire state of the os, like vmware. im
      thinking we can get all of nexus in these at some point. The setup desktop button needs to open the settings. can
      you invent what ever for idearium and cos, and guardian to get this solid."
      Earlier the same day (SW1, master phasemap): "Maybe we have a spec workshop, for building and editing, specs.
      using the spec builder. ai assited or manual, The spacial void. adjustable, levels of ambitoiun …"

  grounding:   # read, not assumed (§8.6) — what each phase builds on
    - "Two spec builders exist: idearium's in-repo Spec tab builder (#spec-builder, idearium/ui/js/app.js) and
       architect's standalone architect/src/ui/spec-builder.html (served by the orchestrator, tested by
       tests/modules/architect-spec-builder-theme.test.js). 'Destroy' is honoured as retire + archive (§0.3): both
       leave every surface, the files move to archive/, the workshop takes their place."
    - "CODEX is CodeFactory (docs/component-registry.spec ADDENDUM 2026-07-30): tiers component/mod, seams, the
       similarity sigma kept apart from drift sigma, promotion states observed → candidate → pattern → component →
       module, and its Blueprint layer is a PRODUCER into loom, never a second registry. The component store
       (lib/component-store.js: put/get/find/closure/markFailed, content-addressed, with dependencies) is CODEX's
       store; loom (loom/data/registry.json + maps) is the registry; architect/src/spec/Blueprint.js the blueprint."
    - "COS desktops: cos/workspace startDesktop boots a qcow2 overlay headless with a QMP socket already in its
       arguments (qemu-runtime.js buildQemuArgs) and nothing talking to it; qemu-img snapshot helpers exist for an
       offline disk. The repo share is read-only, so QMP savevm/loadvm snapshots RAM + disk, like VMware."
    - "Guardian runs jobs and providers; no job watches a COS VM today."

  phases:
    # ── layer 0 — data and engines ─────────────────────────────────────────────────────────────────────────────
    RW1_rewind_engine_vm_snapshots:
      layer: engine
      status: OPEN
      files: [cos/compartment/qmp.js, cos/workspace/index.js, cos/workspace/rewind.js, lib/cos-bridge.js]
      does: >-
        "the rewind engine for the entire state of the os, like vmware." A snapshot of a running repo VM is the whole
        machine: RAM, CPU and disk (QMP savevm on the qcow2 overlay), taken in seconds and restored in seconds
        (loadvm); a stopped VM's disk is snapshotted offline (qemu-img). Every snapshot is a node in the JAA table
        cos_vm_snapshots {id, compartmentId, tag, label, parent, live, at, by, vmClock, sizes} — a tree, like VMware:
        each restore records where it came from. Nothing is lost (§0.3): restoring first takes an automatic
        'before-restore' snapshot of the present, and deleting a snapshot archives its record (the qcow2 tag is only
        removed on an explicit purge). Pause / resume / reset / power-off through the same QMP client.
      proof: "a fake QMP server: savevm / loadvm / stop / cont / system_reset are sent in order; a restore takes the before-restore snapshot first; the tree's parents are right; an offline snapshot calls qemu-img"

    CX0_codex_component_store:
      layer: engine
      status: OPEN
      depends_on: []
      files: [lib/component-store.js, lib/codex/index.js]
      does: >-
        "components store with dependancies … maybe its time to start codex." CODEX begins as the component store
        grown into CodeFactory's model, not beside it (§10.3): each component a tier (component | mod — a mod must name
        ≥1 component-tier dependency, enforced at put), a promotion state with its evidence (occurrences, seam checks,
        verification — lib/build-verify.js verdicts count), its dependency closure, its seams (seam-block shape), and
        the similarity sigma (six dimensions, kept apart from drift sigma; high structure + low semantic never
        merges). Published into loom as components with wires (Blueprint is a producer, loom stays the truth). API
        GET/POST /api/codex/*, CLI `idearium codex`, node types + JAA.
      proof: "a mod without a component dependency is refused; a component promoted by evidence, refused without it; closure lists every dependency; two shape-alike, intent-different files are not merged"

    # ── layer 1 — services ─────────────────────────────────────────────────────────────────────────────────────
    BP1_destroy_and_rebuild_blueprint:
      layer: service
      status: OPEN
      depends_on: [CX0_codex_component_store]
      files: [architect/src/spec/Blueprint.js, idearium/lib/blueprint.js]
      does: >-
        "architect -> destroy and rebuild blueprint". From the workshop's spec and the architecture: the blueprint is
        rebuilt from nothing every time (no drift carried over), each component resolved against CODEX first (reuse
        before build — a component that exists is referenced, not regenerated), the previous blueprint kept as a
        version (§0.3) and the difference shown: added, removed, re-tiered, re-wired.
      proof: "rebuild twice with one component changed → one version per rebuild, the diff names exactly that component; an existing CODEX component is referenced, not re-made"

    SW1_spec_workshop:
      layer: service
      status: DONE (0.39.294) — the old builders retire with UI12, once the workshop has carried real specs
      depends_on: []
      files: [idearium/lib/workshop.js, idearium/ui/workshop.html, idearium/api/index.js, idearium/cli/index.js]
      does: >-
        The spec workshop replaces both spec builders. A workshop session (JAA idearium_workshops) holds one spec being
        made: its sections, each written by hand or with the agent; the AMBITION dial 1 grounded … 5 outside the box;
        the feeds James asked for — open loops, outside-the-box questions, what-ifs, the d20 cross-domain roll, the
        reverse causal chain, inspiration from his own library (IL1/IL2) and his repos. James stays the idea
        generator: the agent only proposes, every proposal is accepted or dismissed by him. Starts from an idea, a
        library document, a repo's spec, or blank. Ends by handing the spec to Architect.
      proof: "a session from an idea → sections; a d20 roll names a domain and maps one mechanism; ambition 1 vs 5 changes the prompt; a proposal is never written without accept"
      built: >-
        0.39.294 — idearium/lib/workshop.js (sessions, the dial, the six feeds + a section draft, the d20's twenty
        fields, propose-then-accept: append / replace keeping the old / new section, removed sections kept), the routes
        /api/workshop/*, `idearium workshop …`, ui/workshop.html in idearium's look. The hook into the spec field
        (James: "the workshop and maybe it hooks into the spec field"): a workshop reads a repo's spec/*.spec and saves
        back there; with no repo it makes one (a library document's own repo, else a new repo for its idea). The agent:
        copilot's /api/prompt with the repos' default provider (the idea workbench's copilot-adapter has no backend
        registered anywhere — found, not used). tests/modules/test-spec-workshop.test.js 7/7; driven in Chromium against
        the real server (blank → dial → d20 + questions → accept → save), no console errors.

    SW2_workshop_page_in_the_voids_style:
      layer: interface
      status: DONE (0.39.297)
      depends_on: [SW1_spec_workshop]
      files: [idearium/ui/workshop.html, idearium/ui/css/void-theme.css, idearium/ui/js/void-sky.js, idearium/ui/void.html, idearium/lib/workshop.js, idearium/api/index.js]
      does: >-
        James: "I hate that ui you made. The spacial void is its own page. all of it needs to be isolated, in its own
        pages." · "alright but no lowercase. and make sure its enterprise grade". The spec workshop's page, rebuilt as
        its own page in the Void's style: THE SPEC WORKSHOP over the star field, the pipeline's stations across the top
        (IDEA → SPEC → ARCHITECT → BLUEPRINT → REPO → COS), the sections (his words, cyan), the agent's proposals
        (magenta, accept or dismiss — never written without his yes), save into the repo's spec. Capitals everywhere.
        One look, shared: the Void's tokens, fonts, buttons and star field move into ui/css/void-theme.css and
        ui/js/void-sky.js, used by both pages. The dial speaks his words — normal, creative, outside the box, novel,
        outlier — instead of the labels the first workshop invented. The idea-generation feeds (d20, reverse chain,
        what-ifs, inspiration) belong to the Void; the workshop keeps the spec-shaping ones: draft the section, open
        loops, questions. The enterprise bar the Void set: limits, deadlines and timers, states, contrast, keyboard.
      proof: "the page driven in Chromium against the real server: start from a Void idea, edit, draft with the agent, accept, save — capitals, no console errors; both pages load the shared theme"

    AR2_architect_in_the_workshop:
      layer: service
      status: BUILT 0.39.298 (on loom + the component store; CX0 grows the store later)
      depends_on: [SW1_spec_workshop, CX0_codex_component_store]
      files: [idearium/lib/architect.js, idearium/ui/architect.html, idearium/api/index.js, idearium/cli/index.js, idearium/ui/workshop.html, loom/maps/one-idearium-map.js, loom/data/registry.json]
      does: >-
        "with architect for archiecture using the component registry". The workshop's Architect step lays the spec out
        as components (tier, layer, purpose, dependencies, seams), each matched against the component registry (loom)
        and CODEX — what already exists is shown and reused; what is new is marked new. Layers bottom-up; a dependency
        on something that does not exist is a gap, said.
      proof: "a spec naming an existing component reuses it; a dependency on nothing is a gap; layers come out bottom-up"
      design_2026_10_02: >-
        Built on what exists today, before CX0: the registry is loom (loom/data/registry.json — 2,275 components with
        dotted ids, 1,840 hooks, 8,751 wires), the store is lib/component-store.js (list/manifest/find; empty in this
        checkout, so loom carries the reuse until CODEX fills it). CX0 grows the store later; the station does not change.
        Engine idearium/lib/architect.js (pure, like void.js and workshop.js; the API owns the store and the repo write):
          index    makeIndex({ registry, stored }) — one search over both; loom ids as loom:<id>, store ids as
                   store:<id>@<version>; tests are not components (nexus.tests.* left out)
          match    exact id or name → reuse; else token overlap ≥ 0.67 of the component's own words → reuse suggested;
                   James overrides per component: decision auto | reuse (a named ref) | new
          analyse  dependencies resolve to a component of this architecture, else an existing one in the index, else a
                   GAP said with both names; a cycle is a gap (collision is a hard error); levels bottom-up (level 0
                   needs nothing local); a lower declared layer (data < engine < service < interface) depending on a
                   higher one is a gap (§3.1)
          agent    the agent PROPOSES components (YAML); nothing enters the architecture without accept — the workshop's rule
        Session in the JAA table idearium_architectures, one per spec (a second open of the same spec returns it).
        Saved as spec/<name>.architecture.yaml beside spec/<name>.spec; reopening reads it back.
        Surfaces: /api/architect/* (list, create, registry search, show, update, draft, proposal, save), CLI
        `idearium architect`, its own page ui/architect.html in the Void's look; the workshop's ARCHITECT station opens it.

    AR3_one_architect_canvas:
      layer: interface
      status: BUILT 0.39.299
      depends_on: [AR2_architect_in_the_workshop]
      files: [idearium/ui/js/arch-canvas.js, idearium/ui/css/arch-canvas.css]
      does: >-
        James, 2026-10-02: "no. look at architect in idearium. rebuild it, fully. enterprise grade, beautiful style and
        consistent, open ui." · "one is for the idearium pipeline and the other is for the repos." · (with
        MASTERMIND-v0_1_49) "look at this canvas. its huge. you can strip it. its a copy". ONE canvas for both Architects
        (§16.5 one canvas, one truth — the 2026-09-19 D1 fork closed): stripped from MASTERMIND's nexus-canvas.js (2,263
        lines, of a 16,001-line engine) to what a map needs — the world transform (zoom toward the cursor, drag empty
        space to pan, pinch), glass cards with a coloured edge and a clipped corner, bezier wires with travelling
        particles and frustum culling, the dot grid, the minimap (click to go), box select, drag, a link handle, the
        floating toolbar, the adaptive render loop, dot mode at low zoom. Stripped: the vault, JAA, auth, tags, fractal,
        themes, lattice, Electron. Added: layer bands bottom-up and a pure layered layout (testable in node), focus
        (the selected component's needs and consumers lit, the rest dimmed). Its own scoped Void tokens, so it can live
        inside idearium's chrome without leaking.
      proof: "the layout puts every dependency in a lower band and orders a band to cut crossings; the page and the repo tab both mount it"

    AR4_pipeline_architect_on_the_canvas:
      layer: interface
      status: BUILT 0.39.299
      depends_on: [AR3_one_architect_canvas]
      files: [idearium/ui/architect.html, idearium/lib/architect.js, idearium/ui/index.html]
      does: >-
        The pipeline's Architect (Build › Architect) becomes the canvas, full-bleed and open: the spec's components as
        blocks in bands, REUSE / NEW / GAP on each, drag a block to place it (kept), drag its handle onto another to make
        a dependency, gaps drawn on the map. Drawers slide over the canvas (the spec and its gaps; the inspector and the
        agent); a floating toolbar (add, link, lay out, fit, ask the agent, save). The Build tab loads it from idearium
        itself (the old iframe pointed at ../architect/arch-builder.html, unserved when idearium runs alone);
        architect/src/ui/arch-builder.html stays the architect system's own (§5.9), no longer idearium's surface.
      proof: "Chromium: lay out → accept → drag a handle to link → the gap closes → save; Build › Architect shows it"

    AR5_repo_architect_on_the_canvas:
      layer: interface
      status: BUILT 0.39.299
      depends_on: [AR3_one_architect_canvas]
      files: [idearium/ui/js/app.js, idearium/ui/index.html]
      does: >-
        The repo's Architect subtab: the registry (GET /api/repos/:uuid/architecture, unchanged) drawn on the same
        canvas — one band per layer, bottom-up; a component per file (type, lines, consumers); wires as flowing edges,
        bottom-up breaches red, orphans marked. Select one → its consumers and requires lit, the inspector lists its
        exports, routes, CLI and events, each a jump. Views beside the map: LISTS (orphans, breaches, packages, routes
        and CLI, events, data dirs and node types) and BLUEPRINT (the spec's chunks). Replaces the column SVG, the table
        dump and the text boxes.
      proof: "Chromium on an indexed repo: a node per file, wires drawn, select → inspector, LISTS and BLUEPRINT"

    PL1_one_entry_point:
      layer: service
      status: "OPEN — 0.39.354 WS7 walks Workshop → Repo from the page (SEND TO THE PIPELINE on the repo's own routes); the run node, its gates and the CLI are still this phase's"
      depends_on: [SW1_spec_workshop, AR2_architect_in_the_workshop, BP1_destroy_and_rebuild_blueprint]
      files: [idearium/lib/pipeline.js, idearium/api/index.js, idearium/cli/index.js]
      does: >-
        "need a better entery point … idea -> spec workshop -> architect -> destroy and rebuild blueprint -> Idearium
        repo -> Cos". One pipeline with six stations, each a gate (GL1: verify, and back if it fails): Idea → Workshop
        → Architect → Blueprint → Repo (the files the blueprint names, built by the agents, PV proof) → COS (the repo's
        environment and desktop). A run is a node with its station, its history and what blocks it. API
        /api/pipeline/*, CLI `idearium pipeline`.
      proof: "an idea walks every station; a failed gate sends it back one station with the reason; the run's history is complete"

    GD1_guardian_supervises_cos:
      layer: service
      status: OPEN
      depends_on: [RW1_rewind_engine_vm_snapshots]
      files: [guardian/lib/cos-supervisor.js, cos/workspace/index.js]
      does: >-
        "invent what ever for idearium and cos, and guardian to get this solid." Guardian watches every running repo
        VM: alive (QMP query-status), the guest agent answering, disk and memory; a VM that dies is reported with
        QEMU's words and offered back at its last snapshot; before anything risky in a VM (an agent's write, an
        environment setup, a restore) a snapshot is taken automatically, so every risky step can be rewound.
      proof: "a VM whose QMP stops answering is reported dead with the reason; a setup run takes a snapshot first"

    # ── layer 2 — interface ────────────────────────────────────────────────────────────────────────────────────
    DP1_desktop_popout_options:
      layer: interface
      status: OPEN
      depends_on: [RW1_rewind_engine_vm_snapshots]
      files: [idearium/ui/desktop.html, idearium/api/index.js, idearium/ui/js/app.js]
      does: >-
        "need more options in the popout window. like the rewind engine … The setup desktop button needs to open the
        settings." The desktop window gains: Snapshots (take with a name, the tree, restore, archive), Pause / Resume,
        Reset, Power off, Screenshot (saved to the repo's files), the login, and Settings — which opens the repo's
        Settings tab in idearium at the environment with 'desktop' ticked, ready to set up. An image without the
        desktop (0.39.293's refusal) shows the same Settings button instead of a dead end.
      proof: "the popout lists snapshots and restores one through the API; Settings posts to the idearium window, which opens the repo's environment with desktop ticked"

    UI12_workshop_surface:
      layer: interface
      status: "OPEN — 0.39.354 WS7 built the workshop page itself (the stations true to state, sections, the agent; WS6 took the ambition dial out); left here: Welcome → Start, the Architect map and Blueprint diff, retiring the old builders"
      depends_on: [SW1_spec_workshop, AR2_architect_in_the_workshop, BP1_destroy_and_rebuild_blueprint, PL1_one_entry_point]
      files: [idearium/ui/workshop.html, idearium/ui/js/app.js, idearium/ui/index.html]
      does: >-
        "everything enterprise grade and consistent with the style". The workshop is one page in idearium's own look
        (the tokens and window chrome every idearium page uses): the pipeline's six stations across the top, the
        spec's sections on the left, the agent's feeds on the right, the ambition dial; Architect's components as a
        layered map; the Blueprint diff. Welcome's first button and Create's first item are "Start" → the workshop.
        The two spec builders are retired from every surface and archived (§0.3).
      proof: "Welcome → Start opens the workshop at Idea; no surface links either old spec builder; both files are in archive/"

    WS7_the_full_workshop:
      layer: interface
      systems: [idearium]
      status: DONE (0.39.354) — mapped 2026-10-05 before code
      depends_on: [SW1_spec_workshop, SW2_workshop_page_in_the_voids_style]
      files: [idearium/ui/workshop.html, idearium/ui/css/workshop.css, idearium/ui/js/workshop.js, idearium/lib/workshop.js, idearium/api/index.js, idearium/ui/_archive/]
      james: '"okay spec workshop looks like shit. needs to be enterprise grade. feed the pipeline" · (his screenshot of the start page beside the Void) "look at the first screenshot. you see now?" · "needs to be a full workshop. like a full document writter. emerge. like we talked about. animated, alive, like void, like not a small little ui,fully featured,"'
      found: >-
        Read, not assumed, from his screenshot and the page: two boxes on an empty black screen; every label, button,
        empty state and input the same small dark capitals, nothing primary; "FROM THE VOID (0)" selected with nothing
        in it; the REACH dial the largest control (WS6: "reach sectoin needs to be removed"); the six stations greyed and
        inert; SAVE writes spec/<name>.spec and the trail stops — the routes after it exist and nothing calls them
        (POST /api/repos/:uuid/spec/plan runs in the background, GET …/spec/plan reads the phasemap and the next ready
        phase, POST …/spec/build builds it). The Void's sky (js/void-sky.js) is hidden on the workshop.
      does: >-
        The workshop as a full document writer, in the Void's world — its sky alive behind it, its palette, capitals in
        every piece of chrome; his own writing shown exactly as he types it. START: centred like the Void — a title line
        (start blank by typing what it is), then the three places to start from as cards with their counts and lists,
        and his workshops as a grid of cards; no dead ends (an empty source says what fills it and links there). THE
        WRITER: one continuous document — every section a heading and a growing text block in reading width, the outline
        on the left (jump, fill state, move up/down, add, remove, restore), focus mode, words and reading time,
        autosave with its state. PARTS (WS6): the spec template's 11 blocks as parts in three tiers — MINIMUM (meta,
        purpose, schema, api, build_order), MODS (axioms, events, integration, failure_modes, tests), COMPONENTS
        (registry) — each present or missing, a missing part one click to add (and, assisted, drafted). MODES (WS6):
        MANUAL (the agent only checks what is missing to reach MINIMUM), ASSISTED (proposals per part), STRETCHED (the
        idea carried through every missing part as proposals) — in every mode nothing enters without his yes. REACH
        leaves the workshop (WS6). THE AGENT: every feed (draft, open loops, questions, what-ifs, d20, reverse chain,
        inspiration) and its proposals (into the section, replace, as a new section, dismiss, reopen). THE PIPELINE:
        the six stations animated and true to state; SEND TO THE PIPELINE = save → plan (the phasemap, in the
        background) → the phases in build order → build the next ready phase, each step shown live in an overlay like
        the desktop setup, the repo's plan opened in Idearium at the end.
      not_in_this_phase: >-
        The spec's own graph and gaps (WS5, needs the synthesis per spec), decomposition to any depth (FG5), per-section
        version history beyond removed/restore, the Blueprint station (BP1 — shown as not built yet), PL1's pipeline run
        node and CLI.
      proof: "in Clear Glass: the start page's three sources and cards, a workshop opened as one document with its outline, a missing MINIMUM part added from the parts panel, a section moved, the mode switched, a proposal accepted, and SEND TO THE PIPELINE walking save → plan → phases → build against the real API in a sandbox"
      conditions:
        - { says: "the full workshop", check: { kind: tests, run: "node tests/modules/test-workshop-full.test.js" } }
      built: >-
        0.39.354. ui/workshop.html + css/workshop.css + js/workshop.js (the WS4 page kept at ui/_archive/workshop-0.39.300-ws4.html).
        The start emerges in the Void's sky: WHAT ARE YOU SPECCING (Enter begins a blank spec with that title), three
        source cards with counts opening a picker sheet (an empty source links to the Void or the library), his
        workshops as cards. The writer: one document (title, source, every section a heading + growing text), kept per
        section 0.8 s after typing (an edit that fails to send is kept and sent again), the outline (jump, move up/down,
        remove → REMOVED → restore), PARTS by tier with the MINIMUM gauge (from the spec engine's blocks.yaml — the API's
        show/update/feed/decide answer parts; a section added for a part carries `part`), MODES (POST {mode}; each
        mode is said in the agent's prompt, lib MODE_GUIDE), STRETCHED's CARRY IT THROUGH EVERY PART (stoppable, one
        part at a time, each a proposal), proposals into their own part's section, CAPS / AS TYPED (per viewer),
        FOCUS, CTRL+S, CTRL+ENTER. SEND TO THE PIPELINE: save → GET spec/plan → POST spec/plan, the run watched on
        GET /plan?map= to its end (failed → PLAN FROM THE SPEC NOW, derive) → the phases in build order → BUILD NEXT
        (POST spec/build) → OPEN IN IDEARIUM on the repo's Phases (app.js takes subtab 'phases').
        Drift from `does`, said: (1) the feeds stay draft · open loops · questions — what-ifs, d20, reverse chain and
        inspiration were taken out in WS4 ("remove the noise") and test-spec-workshop holds them to the Void; adding them
        back is his call, not this phase's. (2) The proof runs the real page and the real lib/workshop.js against a
        server in the test that answers like idearium — not idearium's own server; the API's parts/modes wiring is
        checked in its source (WF-02). test-workshop-full 10/10 in Clear Glass.

    NX1_nexus_in_a_vm:
      layer: later
      status: OPEN — after RW1, DP1, GD1
      does: >-
        "im thinking we can get all of nexus in these at some point." A COS image that runs NEXUS itself (its own
        checkout pulled in by versionium), so a whole NEXUS can be snapshotted, rewound and branched like a repo
        desktop. Mapped, not built: it needs RW1's rewind and GD1's supervision first.

  build_order: [SW1, SW2, AR2, CX0, BP1, PL1, UI12, RW1, DP1, GD1, NX1]   # James, 2026-10-02: "the workshop" first

## ADDENDUM 2026-10-02 — 1.0.0
# Mapped from James's message and two screenshots. "completely destroy the spec builder" is carried out as retire +
# archive (§0.3 nothing lost): the old builders leave every surface; their files are kept under archive/.

## ADDENDUM 2026-10-02 — 1.1.0, SW1 built (0.39.294)
# James: "the workshop and maybe it hooks into the spec field". The order is his: the workshop first, then what it hands
# to (Architect, CODEX, the blueprint, the one entry point); the rewind and the popout after. SW1 is the workshop with the
# Spec tab as its home: it reads and writes the repo's spec/<name>.spec. The old builders stay until UI12 retires them.

## ADDENDUM 2026-10-02 — 1.2.0, after James saw the workshop
# James: "I hate that ui you made. The spacial void is its own page. all of it needs to be isolated, in its own pages. i
# was describing the pipeline when i told you that, from idearium." Recorded: each station of the pipeline is its own
# page. The idea station is the Spatial Void (docs/2026-10-02-spatial-void-phasemap.spec, 0.39.295), which replaces
# Ideas and Brainstorm; the idea-generation feeds belong to it (d20, reverse chain, open questions — as echoes of HIS
# idea: "the ideas come from me though not agents"). The workshop's engine stays (sections, accept-or-dismiss, save into
# the repo's spec); its page is to be rebuilt as its own page in the Void's style, about shaping an idea into a spec's
# sections — SW2, next after the Void.

## ADDENDUM 2026-10-02 — 1.4.0, SW2 built (0.39.297)
# The workshop is its own page in the Void's look; the look is one shared file pair (css/void-theme.css,
# js/void-sky.js), so the stations cannot drift apart. Found while building: the first extraction of the shared CSS
# filtered lines by content and also removed every "  }" from the Void's script — caught by checking the extracted
# file with node --check before anything ran; the page was restored from git and the extraction redone by position.
# Proof: tests/modules/test-spec-workshop.test.js 8/8 (WS-07 the page, WS-08 the dial in his words + limits);
# Chromium against the real server: from a Void idea → write → draft with the agent → replace (the in-page dialog)
# → a new section → save into a new repo; no console errors, no native dialog; wide and narrow.

## ADDENDUM 2026-10-02 — 1.5.0, AR2 built (0.39.298)
# Sequencing, said: AR2 depends on CX0 and CX0 is not built. Architect is built on what exists — loom's registry and the
# component store — with CX0 left to grow that store; the station's interface does not change when it does. The design
# is under AR2.design_2026_10_02. The station is its own page (1.2.0), opened from the workshop's ARCHITECT station.

## ADDENDUM 2026-10-02 — 1.6.0, the Architect rebuilt on one canvas (0.39.299)
# James: "no. look at architect in idearium. rebuild it, fully. enterprise grade, beautiful style and consistent, open
# ui." The no is recorded: 0.39.298 built a new page beside idearium's Architect instead of rebuilding the Architect
# idearium has — two of them, the pipeline's block canvas (Build › Architect, an iframe of arch-builder.html with no
# data) and the repo's tab (the registry as a column SVG, a table and text boxes). Both are rebuilt on one canvas,
# stripped from the MASTERMIND copy he gave. The questions put to him (look, canvas, "open", the repo map) were
# dismissed in favour of the canvas; the defaults taken: the Void look for both (scoped), the canvas data-backed,
# "open" read as a full-bleed canvas with drawers over it, the repo map as an interactive graph.
# Kept from the parallel 0.39.298 build (merged 0.39.303; its Architect superseded by 0.39.299's):
# Found while building: loom/data/registry.json had not been regenerated since 0.39.262 — each release restored the
# old file and nothing rebuilds it at boot, so the component store itself was missing from loom's registry and
# "reuse before build" could not find it. Regenerated from an empty registry: 2740 components, 2793 hooks, 3022 wires
# (the old file's 8751 wires were 1838 distinct edges; the 127 of those not in the fresh one are stale — 91 with
# endpoints that no longer exist, 36 no longer in the code). The design's "2275 components" is that stale count.
# Rejections at the baseline: 10 unique-id, 109 wire-endpoints-exist, none from the maps touched here.
# Found in the browser: the wires' svg kept its wide size after a resize and held the page wide — it is collapsed
# before measuring now.
#
# ADDENDUM 2026-10-08 (0.51.0, RS11 of docs/2026-10-05-spec-workshop-rebuild-phasemap.spec) — James: "okay now the phases with the spec workshop. needs to be rebuilt, enterprise grade. interconnected"
# WS7's writer shows each section's phases from the saved spec's thread (GET /api/repos/:uuid/thread): a strip per
# section, dots in the outline, ↻ when a section moved since it was planned (REPLAN), a warning while a planned section
# is edited and not saved; a phase opens Idearium's Phases on it; ?block= opens the writer at a section. A strip is
# rewritten only when it changed (a repaint had swapped its buttons under the pointer).
