spec:
  meta:
    name:        idearium-creative-repo
    version:     1.0.0
    status:      proposed
    author:      james-brooks
    compiled_by: claude
    created_at:  2026-09-15T00:00:00Z
    schema_family: idearium.repo.*
    primary_identity: idearium_project
    uuid:        nexus-export-schema-idearium-creative-repo
    depends_on_specs:
      - nexus-repository-system.spec   # owns: source/structure/parse/chunk/atlas/index/graph/verification/git-mechanics — NOT re-owned here
      - versionium.spec                 # owns: commit/history/restore/state — reused, not re-owned here
      - idearium.spec                   # owns: idea/project identity, spec-engine manifest — reused, not re-owned here
      - loom.spec                       # owns: phasemap scanning — reused for §2 roadmap render
    purpose: >
      Defines the layer idearium adds ON TOP of a repository once
      nexus-repository-system.spec already makes it addressable: a
      project home page, a roadmap read from typed phase nodes, a
      zoomable module/sub-repo tree, a per-file version bridge into
      Versionium, adjustable runtime config a human or Copilot can
      write identically, and a CI/CD surface with credentials kept out
      of agent context. This spec does not redefine repository
      identity, parsing, chunking, or atlas — it consumes them.

  # ── Required capabilities (§1) ────────────────────────────────────────
  required_capabilities:
    - project home rendering (README or custom file)
    - archive upload materialized as real files
    - per-file version snapshot and delta
    - roadmap rendering from typed phase nodes
    - zoom traversal across module depth
    - sub-repository creation and attachment
    - config read/write, human and Copilot both
    - CI/CD push and pull
    - SSH transport
    - credential isolation from agent/Copilot context
    - Compartment-owned execution boundary

  # ── Core axiom (§2) ──────────────────────────────────────────────────
  core_axiom:
    id: ICR-001
    name: NO_PHANTOM_PROGRESS
    rule: >
      A phase_node MUST NOT be marked complete, and a roadmap MUST NOT
      render a phase as done, unless that status was written through
      idearium.roadmap.phase.update against a real, indexed phase_node
      row — never inferred, defaulted, or copied from a phasemap
      document's own status field. Phasemap documents are planning
      artifacts; phase_node rows are the only real status source.
    lifecycle: [DECLARE, INDEX, RENDER, UPDATE, REINDEX]
    note: >
      This mirrors nexus-repository-system.spec's NEXUS-001
      (ALWAYS_MAP_FIRST) at the roadmap layer — no claimed progress
      without a real, addressable row behind it.

  # ── Identity (§3) ────────────────────────────────────────────────────
  identity:
    rule: >
      This spec does not mint new project identity. idearium_project
      identity is idearium.spec's existing idea/repo uuid + rootHash.
      Zoom nodes and phase nodes are children of that identity, never
      identity-bearing on their own.
    zoom_node_identity: "idearium-zoom:<project_uuid>:<module_path>"
    phase_node_identity: "idearium-phase:<project_uuid>:<phase_uuid>"
    subrepo_identity: >
      A sub-repo is itself a full repository per
      nexus-repository-system.spec §3 — its own uuid, its own rootHash.
      It is NOT a synthetic child identity; creating one MUST go
      through the same real ingestion path any other repository does.

  # ── Project home (§4) ────────────────────────────────────────────────
  project_home:
    sources: [README.md (default), custom file (explicit override)]
    rule: >
      Rendering MUST prefer an explicit custom-file override when one is
      configured; otherwise fall back to README.md; otherwise render an
      empty-state, never a fabricated description.
    fields: [uuid, project_id, source_file, rendered_at, source_hash]
    stale_rule: "source_hash mismatch against the live file MUST re-render before serving, not serve stale content silently."

  # ── Roadmap / phase_node schema (§5) ──────────────────────────────────
  phase_node_schema:
    fields:
      uuid: { type: string, required: true }
      project_id: { type: string, required: true }
      order: { type: number, required: true }
      title: { type: string, required: true }
      status: { type: enum, values: [planned, active, blocked, complete] }
      depends_on: { type: array, items: string }
      module_path: { type: string, required: false }
    render_rule: >
      Roadmap render order follows `order`; a phase whose depends_on
      entries are not all `complete` MUST render as `blocked`
      regardless of its own stored status — status is a hint, the
      dependency graph is authoritative for the *rendered* state.
    source: Written by idearium.roadmap.phase.update; scanned by loom.phasemap.capability (reused, not duplicated).

  # ── Zoom / sub-repo model (§6) ─────────────────────────────────────────
  zoom_model:
    definition: >
      A module is a level of zoom into a project's structure. Each
      zoom level exposes progressively deeper structural detail;
      it does not duplicate the atlas — it is a *view* over
      nexus-repository-system.spec's existing atlas/structure fields,
      scoped by module_path.
    levels: [world, region, module, file]
    level_count: 4   # matches idearium.config.zoom_levels default (§8)
    traversal_rule: repository.graph.traverse (nexus-repository-system.spec §24-26) supplies the edges; this spec only supplies the depth-scoped view over them.
    subrepo_rule: >
      A sub-repo MUST be created through the same real ingestion path
      as a top-level project (idearium.repo.materialize +
      nexus-repository-system.spec's PROJECT_IMPORT flow). A synthetic,
      non-ingested "fake" sub-repo node MUST NOT be created merely to
      satisfy the zoom tree's shape.
    write_through: DEFERRED — read-only zoom ships first; sub-repo creation is a distinct, later capability, not assumed present.

  # ── Versionium bridge (§7) ──────────────────────────────────────────────
  versionium_bridge:
    rule: >
      Every idearium repo write MUST produce exactly one Versionium
      record — a full snapshot on first write to a path, a delta
      thereafter — before the write is considered durable.
    chain: >
      idearium repo write -> versionium.file.snapshot (first write) OR
      versionium.file.delta (subsequent) -> versionium.commit.create
      (groups deltas into a commit, unchanged, reused as-is) ;
      idearium rewind action -> versionium.restore.read (unchanged) ->
      idearium.repo.materialize (writes restored bytes back to the tree).
    file_delta_schema:
      fields:
        uuid: { type: string, required: true }
        file_path: { type: string, required: true }
        commit_ref: { type: string, required: true, description: "references versionium_commit.uuid" }
        diff: { type: string, required: true }
        bytes_saved: { type: number, required: false }
        ts: { type: number, required: true }
    explicit_non_reuse:
      - "MUST NOT write to cortex's schema.sigma_record — that is a live
        component-divergence-score table, a different concept; reusing
        it would corrupt real data."
      - "MUST NOT use clear-glass's cg.rewind.* for file rewind — that
        is browser-tab/DOM session rewind, a different domain."

  # ── Config (§8) ──────────────────────────────────────────────────────
  config:
    rule: >
      Every adjustable value this spec introduces lives in one config
      block. A write from Copilot and a write from a human MUST go
      through the identical idearium.config.set command — no separate
      privilege tier — and MUST be indistinguishable in effect,
      differing only in the resulting event's `actor` field.
    schema:
      idearium.config:
        chunk_cap:     { type: number, default: 500, min: 1, max: 5000, copilot_writable: true }
        zoom_levels:   { type: number, default: 4, copilot_writable: true }
        snapshot_mode: { type: enum, values: [full, delta], default: delta, copilot_writable: true }
        auto_phasemap: { type: boolean, default: true, copilot_writable: true }
        cicd:
          push_enabled: { type: boolean, default: false, copilot_writable: true }
          pull_enabled: { type: boolean, default: false, copilot_writable: true }
          ssh_key_path: { type: string, default: null, copilot_writable: false }
    constraint: ssh_key_path MUST remain copilot_writable:false permanently — it is a credential path, not an ordinary tunable (see §9).

  # ── CI/CD, SSH, credentials (§9) ───────────────────────────────────────
  cicd:
    rule: >
      Reuses nexus-repository-system.spec §30 git_provides
      (clone/fetch/branch/checkout/diff/commit/tag/restore/push/pull)
      and §31's credential constraint verbatim — this spec does not
      define a second credential model.
    provides: [idearium.cicd.push, idearium.cicd.pull, idearium.ssh.keys.register]
    constraint: >
      Copilot and any agent MUST NOT receive SSH private key contents,
      tokens, or passwords as ordinary context at any point in the
      push/pull flow. A push/pull tool reports status only.
    remote_targets: >
      MUST resolve against a real, explicitly configured remote — never
      an inferred or default-guessed one. (Open question, unresolved
      in this version: whether that's one of the project's existing git
      remotes or a dedicated idearium-only remote — left to
      configuration, not hardcoded here.)

  # ── Ownership (§10) ────────────────────────────────────────────────────
  ownership:
    rule: >
      Everything this spec defines (project_home, phase_node rows, zoom
      view state, config) belongs to the same Compartment that owns the
      underlying repository per nexus-repository-system.spec §5. This
      spec MUST NOT create a second parallel ownership abstraction.

  # ── Event types (§11) ───────────────────────────────────────────────────
  event_types:
    canonical_form: "{layer}:{noun}:{verb}"
    examples:
      - idearium:home:render
      - idearium:phase:update
      - idearium:phase:complete
      - idearium:zoom:traverse
      - idearium:subrepo:create
      - versionium:bridge:snapshot
      - versionium:bridge:delta
      - idearium:config:get
      - idearium:config:set
      - idearium:cicd:push:start
      - idearium:cicd:push:complete
      - idearium:cicd:push:failed
      - idearium:cicd:pull:complete

  # ── Failure model (§12) ─────────────────────────────────────────────────
  failure_model:
    rule: Failures MUST be observable. Nothing silently fails.
    canonical_events:
      - idearium:home:render:failed
      - idearium:phase:update:failed
      - idearium:zoom:traverse:failed
      - idearium:subrepo:create:failed
      - versionium:bridge:snapshot:failed
      - versionium:bridge:delta:failed
      - idearium:config:set:failed
      - idearium:cicd:push:failed
      - idearium:cicd:pull:failed
    credential_failure_rule: >
      A CI/CD auth failure MUST report status/error class only — never
      echo the credential, key fingerprint content, or raw remote
      response if it could contain auth material.

  # ── Readiness (§13) ────────────────────────────────────────────────────
  readiness:
    requires_all:
      - underlying repository READY per nexus-repository-system.spec §41
      - project_home resolved (README, custom file, or explicit empty-state)
      - config block present with defaults populated
      - zero phase_node rows in an unindexed state
    constraint: Readiness here MUST NOT require CI/CD or zoom to be configured — those are optional layers, not blocking preconditions.

  # ── Invariants (§14) — ICR-001 through ICR-014 ───────────────────────
  invariants:
    - { id: ICR-001, rule: "No phase renders complete without a real, indexed phase_node row (core axiom)." }
    - { id: ICR-002, rule: "Zoom nodes and phase nodes never carry identity independent of their parent project." }
    - { id: ICR-003, rule: "A sub-repo is created only through the real ingestion path — never a synthetic node." }
    - { id: ICR-004, rule: "Every repo write produces exactly one Versionium record before being considered durable." }
    - { id: ICR-005, rule: "schema.sigma_record is never written to by this spec's bridge." }
    - { id: ICR-006, rule: "cg.rewind.* is never used for file rewind." }
    - { id: ICR-007, rule: "A Copilot config write and a human config write differ only in the event's actor field." }
    - { id: ICR-008, rule: "ssh_key_path is permanently copilot_writable:false." }
    - { id: ICR-009, rule: "No agent or Copilot context ever contains raw credential material." }
    - { id: ICR-010, rule: "CI/CD remote targets are explicit configuration, never inferred." }
    - { id: ICR-011, rule: "All state this spec defines belongs to the repository's existing Compartment — no second ownership abstraction." }
    - { id: ICR-012, rule: "A rendered blocked-by-dependency phase overrides its own stored status." }
    - { id: ICR-013, rule: "Stale project_home content is never served without a source_hash check." }
    - { id: ICR-014, rule: "No failure in this spec's surface is silently swallowed." }

  # ── Fundamental separation (§15) ────────────────────────────────────────
  fundamental_separation:
    - { owner: PROJECT_HOME, owns: "README/custom-file rendering" }
    - { owner: ROADMAP,      owns: "phase_node rendering and ordering" }
    - { owner: ZOOM,         owns: "depth-scoped structural view" }
    - { owner: BRIDGE,       owns: "per-file snapshot/delta into Versionium" }
    - { owner: CONFIG,       owns: "adjustable runtime values, human and Copilot alike" }
    - { owner: CICD,         owns: "push/pull mechanics and credential isolation" }
    - { owner: SOURCE/ATLAS/CHUNK/GRAPH/COMPARTMENT, owns: "unchanged — nexus-repository-system.spec, not redefined here" }
  fundamental_separation_rule: This spec adds a layer; it does not re-own anything nexus-repository-system.spec, versionium.spec, or idearium.spec already owns.

  # ── Final primitive (§16) ────────────────────────────────────────────────
  final_primitive: >
    idearium_project has→repository (nexus-repository-system.spec),
    renders→project_home, tracks→phase_node*, exposes→zoom_view,
    snapshots_via→versionium_bridge, configures→idearium.config,
    persists_via→CI/CD. The repository stays the single source of
    structural truth; this spec is the lens idearium renders it
    through, the ledger that keeps every file versioned, and the door
    that lets it leave the machine — nothing here is a second copy of
    what the repository already knows.
