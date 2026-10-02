spec:
  meta:
    name:     workshop-codex-rewind
    version:  1.2.0
    date:     2026-10-02
    release:  0.39.294 (DP1 + RW1) → each later phase its own patch
    uuid:     nexus-workshop-codex-rewind-phasemap-v1-0000-2026-1002-jamesbrooks-001
    owner:    idearium · cos · guardian · architect · lib · docs
    status:   "MAPPED 2026-10-02; SW1 built (0.39.294) — James chose the order: \"the workshop and maybe it hooks into the spec field\""
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

    AR2_architect_in_the_workshop:
      layer: service
      status: OPEN
      depends_on: [SW1_spec_workshop, CX0_codex_component_store]
      files: [idearium/lib/architect.js, architect/service.js]
      does: >-
        "with architect for archiecture using the component registry". The workshop's Architect step lays the spec out
        as components (tier, layer, purpose, dependencies, seams), each matched against the component registry (loom)
        and CODEX — what already exists is shown and reused; what is new is marked new. Layers bottom-up; a dependency
        on something that does not exist is a gap, said.
      proof: "a spec naming an existing component reuses it; a dependency on nothing is a gap; layers come out bottom-up"

    PL1_one_entry_point:
      layer: service
      status: OPEN
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
      status: OPEN
      depends_on: [SW1_spec_workshop, AR2_architect_in_the_workshop, BP1_destroy_and_rebuild_blueprint, PL1_one_entry_point]
      files: [idearium/ui/workshop.html, idearium/ui/js/app.js, idearium/ui/index.html]
      does: >-
        "everything enterprise grade and consistent with the style". The workshop is one page in idearium's own look
        (the tokens and window chrome every idearium page uses): the pipeline's six stations across the top, the
        spec's sections on the left, the agent's feeds on the right, the ambition dial; Architect's components as a
        layered map; the Blueprint diff. Welcome's first button and Create's first item are "Start" → the workshop.
        The two spec builders are retired from every surface and archived (§0.3).
      proof: "Welcome → Start opens the workshop at Idea; no surface links either old spec builder; both files are in archive/"

    NX1_nexus_in_a_vm:
      layer: later
      status: OPEN — after RW1, DP1, GD1
      does: >-
        "im thinking we can get all of nexus in these at some point." A COS image that runs NEXUS itself (its own
        checkout pulled in by versionium), so a whole NEXUS can be snapshotted, rewound and branched like a repo
        desktop. Mapped, not built: it needs RW1's rewind and GD1's supervision first.

  build_order: [SW1, AR2, CX0, BP1, PL1, UI12, RW1, DP1, GD1, NX1]   # James, 2026-10-02: "the workshop" first

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
