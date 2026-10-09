spec:
  meta:
    name:        idearium-creative-repo-overhaul
    roadmap: folded into idearium-repository-overhaul — the same repo host, earlier (declutter 2026-10-09, James: "okay")
    version:     0.1.0-phasemap
    status:      "PHASEMAP 2026-09-15. NOT STARTED — planning artifact only, zero
      code written against it yet. Builds ON TOP of
      nexus-repository-system.spec (uploaded same session) rather than
      re-deriving repository ingestion/chunking/atlas/Git — that spec
      already owns §1/§7/§11/§14-15/§30/§33 of this phasemap's surface.
      This file scopes the idearium-specific layer that spec does not
      cover: per-project roadmap, zoom/sub-repo UI, the
      versionium<->idearium bridge, and adjustable config."
    author:      james-brooks
    compiled_by: claude
    created_at:  2026-09-15T00:00:00Z
    schema_family: idearium.repo.*
    uuid:        nexus-idearium-creative-repo-overhaul-v0-0000-2026-0915-001
    depends_on_specs:
      - nexus-repository-system.spec   # owns: ingestion, chunking, atlas, Git persistence, snapshots (repo-wide)
      - versionium.spec                 # owns: commit/history/restore/state (existing, real, unwired to idearium)
      - idearium.spec                   # owns: idea/spec/repo.* lifecycle (existing, real)
      - loom.spec                       # owns: phasemap scanning/mapping (existing, real)
    intent: >
      Turn idearium's existing spec-library UI (project cards, chunk
      ingest, 500-chunk cap — see screenshot 2026-09-15) into a full
      creative-repo host: a README-driven project home page, real files
      materialized from uploaded archives (not chunk-placeholders only),
      per-project roadmaps read from typed .phase nodes, zoomable
      module/sub-repo nesting, CI/CD push/pull with SSH, and per-file
      versioning wired through the existing (but currently disconnected)
      Versionium commit/restore capabilities — all governed by one
      adjustable config block that Copilot can write to as easily as a
      human.
    non_goals:
      - Re-implementing repository ingestion/chunking/atlas — that is
        nexus-repository-system.spec's job; this phasemap consumes it.
      - Reusing cortex's existing schema.sigma_record for file diffs.
        That table is a live, 723-row divergence-score store for a
        different concept (component drift). Colliding names/writes onto
        it would corrupt real data. A new schema.file_delta is used
        instead (MCO-A).
      - Reusing clear-glass's cg.rewind.* for file rewind. That is
        browser-tab/DOM session rewind, a different domain entirely.
        Versionium's existing restore.read is the correct primitive.

  # ── MCO-A: typed schemas ──────────────────────────────────────────────
  MCO-A_schemas:
    depends_on: []
    status: "NOT STARTED"
    does: >
      Register two new schemas in the node-taxonomy, following the same
      shape as the real versionium_commit / sigma_record schemas already
      in the registry — fields, types, required flags, description per
      field.
    adds:
      - schema.phase_node   # typed .phase file — see draft below, not yet registered
      - schema.file_delta   # per-file diff-only record; deliberately NOT schema.sigma_record
    gate: >
      MET when both schemas exist under versionium/schemas/ (file_delta)
      and idearium/schemas/ (phase_node), are indexed in each system's
      schemas/index.js, and a round-trip write+read of one real row of
      each passes — matching the bar the existing sigma_record schema
      cleared before it was marked REAL.

  # ── MCO-B: versionium <-> idearium bridge ───────────────────────────
  MCO-B_versionium_bridge:
    depends_on: [MCO-A]
    status: "NOT STARTED"
    does: >
      One interaction-contract wiring idearium repo writes to
      versionium's existing commit pipeline. No changes to
      versionium.commit.create/history.list/restore.read/state.read/
      calendar.read — they are reused as-is. New capabilities only wrap
      the missing per-file layer.
    adds:
      - versionium.file.snapshot.capability   # full file, first write
      - versionium.file.delta.capability      # diff-only, subsequent writes
      - versionium.idearium.bridge.capability # the contract itself
    chain: >
      idearium repo write -> versionium.file.snapshot (first write) OR
      versionium.file.delta (subsequent writes) -> versionium.commit.create
      (groups deltas into a commit, unchanged) ; idearium rewind action ->
      versionium.restore.read (unchanged) -> idearium.repo.materialize
      (writes restored content back to the repo tree, MCO-C).
    gate: >
      MET when a file written through idearium produces a real
      versionium_commit row, and restore.read against that commit
      reproduces the file byte-for-byte — proven with a CLI round-trip,
      not asserted.

  # ── MCO-C: archive upload materializes real files ───────────────────
  MCO-C_repo_materialize:
    depends_on: [MCO-B]
    status: "NOT STARTED"
    does: >
      Extends idearium's existing repo.ingest so an uploaded archive
      produces real files on disk in a repo tree, not chunk-text only.
      Delegates parsing/chunking/atlas generation to
      nexus-repository-system.spec's existing pipeline (§7 source layer,
      §10 parsing, §11 chunk schema) rather than duplicating it — this
      MCO only adds the "write the bytes to disk" step idearium
      currently skips.
    adds:
      - idearium.repo.materialize.capability
    gate: >
      MET when an uploaded .zip produces a repo tree on disk whose files
      are independently readable outside idearium's UI (i.e. real files,
      not only indexed chunk rows), and each materialized file has
      triggered one versionium.file.snapshot (MCO-B).

  # ── MCO-D: zoom / sub-repo model ─────────────────────────────────────
  MCO-D_zoom_subrepo:
    depends_on: [MCO-C]
    status: "NOT STARTED — highest-risk MCO in this phasemap, net-new model"
    does: >
      Read-only zoom first (module tree at N depth), write-through
      (sub-repo creation) deferred to a follow-up phasemap once the
      read-only shape is proven against a real multi-module project.
    adds:
      - idearium.repo.zoom.capability
      - idearium.repo.subrepo.create.capability   # deferred, named not built
    open_question: >
      Zoom level count/naming (config default is 4 — see MCO-F) is not
      yet decided. Candidate: world -> region -> module -> file. Needs
      confirmation before this MCO starts.
    gate: >
      MET (read-only phase) when a real multi-module idearium project
      can be traversed via repo.zoom at every configured depth without
      any depth returning an empty/broken result.

  # ── MCO-E: roadmap UI from .phase nodes ──────────────────────────────
  MCO-E_roadmap_ui:
    depends_on: [MCO-A]
    status: "NOT STARTED"
    does: >
      Renders a per-project roadmap by reading schema.phase_node rows,
      ordered by `order`, respecting `depends_on` between phases.
      Reuses loom.phasemap.capability for the underlying scan/build —
      this MCO is the idearium-side render only, not a new scanner.
    adds:
      - idearium.roadmap.get.capability
      - idearium.roadmap.phase.update.capability
    gate: >
      MET when a real project's .phase nodes render as an ordered,
      dependency-respecting roadmap in the idearium UI, and editing one
      phase's status updates the same row loom's scanner would read.

  # ── MCO-F: adjustable config, copilot-writable ────────────────────────
  MCO-F_config:
    depends_on: []
    status: "NOT STARTED"
    does: >
      One config block covering every adjustable value named in this
      phasemap (chunk cap, zoom levels, snapshot mode, auto-phasemap,
      CI/CD enable flags). Copilot writes go through the same
      idearium.config.set command a human edit would use — no separate
      privilege tier — logged with actor:"copilot" in the existing
      event-taxonomy pattern.
    config_schema:
      idearium.config:
        chunk_cap:      { value: 500, min: 1, max: 5000, copilot_writable: true }
        zoom_levels:    { value: 4, copilot_writable: true }
        snapshot_mode:  { value: delta, enum: [full, delta], copilot_writable: true }
        auto_phasemap:  { value: true, copilot_writable: true }
        cicd:
          push_enabled:   { value: false, copilot_writable: true }
          pull_enabled:   { value: false, copilot_writable: true }
          ssh_key_path:   { value: null, copilot_writable: false }
    adds:
      - idearium.config.get.capability
      - idearium.config.set.capability
    gate: >
      MET when changing chunk_cap via idearium.config.set changes the
      real 500-cap behavior visible in the Build tab (screenshot
      2026-09-15) without a restart, and a copilot-authored write is
      indistinguishable in effect from a human one, only in the actor
      field of the resulting event.

  # ── MCO-G: CI/CD push/pull + SSH ──────────────────────────────────────
  MCO-G_cicd_ssh:
    depends_on: [MCO-C, MCO-F]
    status: "NOT STARTED — deliberately last. Only MCO in this phasemap
      with real external-network/credential surface; per credentials
      (§31 of nexus-repository-system.spec), gets its own security pass
      rather than riding in with the rest."
    does: >
      Push/pull against real git remotes. Target remotes TBD — repo's
      own .git/config already shows four real remotes (mine, nexus0822,
      other, person-model); whether idearium pushes to one of these or
      a separate idearium-only remote is an open question, not decided
      here.
    constraint: >
      Per §31 credentials rule (nexus-repository-system.spec): the agent
      and Copilot MUST NOT receive SSH private key contents as ordinary
      context. ssh_key_path (MCO-F) is copilot_writable:false for this
      reason — Copilot may trigger a push, never read or set the key
      itself.
    gate: >
      MET when a real idearium project can push a real commit to a real
      remote and a separate clone can pull it back byte-identical, with
      zero key material ever appearing in an event log, chat log, or
      copilot context window.

  # ── Open questions carried from the design doc (2026-09-15) ─────────
  open_questions:
    - "file_delta home: versionium/ (owns history) vs cortex/ (owns
      memory/compaction). Recommendation stands: versionium."
    - "zoom level names — not yet decided (see MCO-D)."
    - "CI/CD push/pull target — one of the four existing real remotes,
      or a new idearium-only remote (see MCO-G)."

  build_order: [MCO-A, MCO-B, MCO-C, MCO-E, MCO-F, MCO-D, MCO-G]
  build_order_note: >
    MCO-D (zoom/sub-repo) moved after MCO-F in execution order despite
    lower dependency number — it's the highest-risk, least-specified
    MCO (open zoom-naming question) and benefits from the config layer
    existing first so its own defaults are adjustable from day one
    rather than hardcoded then migrated.
