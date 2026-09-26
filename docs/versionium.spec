spec:
  meta:
    name:        versionium
    version:     3.1.0
    status:      active
    canonical_implementation: versionium/lib/engine.js
    canonical_http_surface:
      commit:   "POST http://127.0.0.1:3754/api/versionium/commit  { message, branch?, causedBy?, system?, state? }"
      history:  "GET  http://127.0.0.1:3754/api/versionium/history?system=<name>"
      restore:  "GET  http://127.0.0.1:3754/api/versionium/restore/:commitId"
      state:    "GET  http://127.0.0.1:3754/api/versionium/state/:commitId"
      calendar: "GET  http://127.0.0.1:3754/api/versionium/calendar/:date"
    reached_via: "lib/nexus-client.js (sovereign transport, systemId 'versionium') — never a direct require() across a process boundary"
    uuid:        nexus-versionium-v3-0000-2026-0902-jamesbrooks-001
    status_change_2026_09_02: >
      James: "versionium is its own folder. it's system with a server.js.
      cli. api. event driven interaction contract. with handshake gated
      verification... needs the component registery. spec as living
      model. event taxonomy. data folder. ring buffer. causal field to
      track changes and trajectory... migrate cortex and idearium's
      versionium to the new folder and system and map it in looms system
      map." §VS1 (docs/2026-09-02-versionium-sovereign-and-cleanup-
      phasemap.spec) — promoted from a library embedded inside cortex's
      own process to a real sovereign system: own folder (versionium/),
      own port (3754), own data directory (data/versionium/, genuinely
      separate from cortex's shared jaaDB — see versionium/lib/store.js's
      own header for the one deliberate exception, event_log), own
      component registry (registry-components.js), own event taxonomy
      (event-taxonomy.js), own L0-L4 structure matching ollama/loom's
      real precedent exactly. Every real caller (the versionium_commit/
      versionium_history/versionium_restore agent tools, orchestrator's
      sigma-gated auto-commit trigger) repointed from systemId 'cortex'
      to 'versionium'. cortex/boot.js's own former /api/versionium/*
      routes now return a real 410 with a redirect notice, not a silent
      404, so any caller that missed this migration fails loud.
      cortex/versionium/index.js and causality.js themselves are kept,
      unexecuted, as real historical reference (§0.3 never delete,
      archive) — nothing requires them anymore; the real logic moved
      wholesale into versionium/lib/engine.js and causality.js, comments
      and all, not rewritten from scratch.
    status_change_2026_09_01: >
      James: "migrate to versionium completely." Real investigation before
      changing status: this spec's own build_order (below, kept for
      history) had been executed as FOUR SEPARATE PIECES scattered across
      THREE subsystems that never knew about each other —
      idearium's SnapshotGate (steps 1+4), cortex/versionium/index.js
      (step 2 — kernel-based temporal replay, 2026-08-30), and
      lib/file-integrity.js (step 3 — per-route hashing, 2026-08-28). Two
      of those (idearium's SnapshotGate, cortex/versionium) were both
      real, independently-built, NEVER-RECONCILED commit-graph
      implementations under the same "Versionium" name — a genuine §10.3
      competing-truth finding, not a naming quibble. A third, deeper bug
      found in the same pass: cortex/versionium's own internal sigma-gated
      auto-commit had been polling `shape_samples`, a table NOTHING in
      this codebase has ever written to — dead since it was built, the
      same "listening to a bus nothing emits on" failure class this
      codebase's own AX-011 finding already named once. Fixed this pass,
      all three: (1) cortex/versionium/index.js is now canonical — it
      already had the more complete real capability set (kernel replay,
      calendar, correctly branch-scoped commits from the start, no
      parentId bug to inherit); (2) its dead shape_samples poll replaced
      with a real, live read of cortex's own _field.entropy (fed
      cross-process from orchestrator via the already-real POST
      /cfr/field); (3) the one real agent-facing capability
      (lib/agent-tools/tools/governance/versionium-commit.js) no longer
      reaches cortex/versionium/index.js via a cross-process require()
      (a live AX-010 violation that silently gave every agent-issued
      commit its OWN separate, near-empty kernel instead of cortex's real
      one) — it now calls cortex's real HTTP routes via lib/nexus-client.js,
      same sovereign-transport pattern as every other cross-process
      capability in this codebase.
    purpose: >
      "Versionium" is referenced throughout this session's design
      conversations (Phase 32, the idearium-as-GitHub discussion) as
      causal version control — temporal replay, calendar playback,
      sigma-gated auto-commit. Checked directly, session 9: no
      implementation exists anywhere under that name. lib/version.js is a
      flat version-string registry — real, useful, not that. This spec is
      what Versionium would actually need to be, built from primitives
      already proven elsewhere this session rather than from nothing.

  current_state:
    lib_version_js: "single version string per system, no history, no replay, no per-file granularity"
    gap_vs_billing: "no temporal axis at all — it's a value, not a timeline"

  what_already_exists_to_build_on:
    - source: "idearium's SnapshotGate/SnapshotRestoreGate"
      gives: "commitId (vtm-<sha>), parentId, branch label, message, author, full-state snapshot, diffSnapshots(), restore-with-auto-stash"
      gap: "parentId always points at the most recent snapshot regardless of declared branch — linear chain with a label, not a real DAG (found session 9, still open)"
    - source: "lib/file-integrity.js"
      gives: "FNV-1a content hash per system's registry-components.js, boot-time check"
      gap: "one file per system, not per-component, not continuous (boot-time only, no watchdog)"
    - source: "unintegrated/rfr2-nexus/{compress,clip,context}"
      gives: "snapshot()/restore() full state, snapshotRange()/restoreClip() bounded fork, createLiveContext/createReplayContext suspend↔resume"
      gap: "staged, not integrated — and compress/clip/context still owe the diff against lib/replay-engine.js this spec keeps NOT skipping just because it's convenient"
    - source: "unintegrated/rfr2-nexus/version-gate"
      gives: ".nex artifact validation + migration — no existing NEXUS equivalent"
      gap: "same — staged, not integrated, not yet diffed against anything (nothing to diff against, this one's genuinely new)"

  proposed_shape:
    per_file_versioning: >
      Extend file-integrity's hash check from "one file per system" to
      "every file a component.file field points at" (Phase 116's mapping
      makes this addressable for the first time — Versionium has no
      per-file granularity today because nothing else did either).
    commit_graph: >
      Fix idearium's parentId-ignores-branch bug first — Versionium
      shouldn't inherit a known-broken DAG. Real branching needs a fork
      point recorded at branch-creation, not inferred from snapshot order.
    temporal_replay: >
      This is rfr2-nexus's context module, once diffed against
      replay-engine.js and actually integrated — not new work, the
      missing piece is the diff, already named as undone in
      unintegrated/README.md.
    sigma_gated_commit: >
      A real, small addition: CFR sigma crossing a threshold triggers an
      automatic snapshot via the mechanism above, tagged with the sigma
      event that caused it (causedBy, same pattern as this session's other
      causal chaining work) — proposed, not built, no existing analog found.

  build_order:
    - "1. Fix idearium's branch/parentId bug — Versionium inherits whatever idearium's commit graph does today"
    - "2. Diff rfr2-nexus's compress/clip/context against lib/replay-engine.js — still undone, blocking everything else here"
    - "3. Per-file hashing, once Phase 116 gives components a file to hash"
    - "4. Sigma-gated auto-commit last — depends on 1-3 actually working first"

  history:
    - date: 2026-06-29
      summary: "Original spec written — Versionium proposed, no implementation existed anywhere under that name."
    - date: 2026-08-28
      summary: "Step 1 (branch/parentId fix) built into idearium's SnapshotGate; step 4 (sigma-gated auto-commit) built as orchestrator/lib/versionium-auto-commit.js, targeting idearium."
    - date: 2026-08-30
      summary: "Step 2 (kernel-based temporal replay) built into cortex/versionium/index.js — restore()/calendar() real for the first time."
    - date: 2026-09-01
      summary: >
        Reconciliation (§VERSIONIUM MIGRATION). cortex/versionium made
        canonical; idearium's SnapshotGate un-conflated from the
        Versionium name and kept as idearium's own separate feature;
        orchestrator/lib/versionium-auto-commit.js repointed at cortex;
        dead shape_samples poll replaced with a real live-field trigger;
        the one real agent-facing tool migrated off a cross-process
        require() onto sovereign transport; real GET /api/versionium/history
        added so a system's commit history — and, going forward, LM1's
        version_history: spec section — has a live source instead of a
        hand-maintained one. A real bug found by this migration's own
        smoke test (tests/modules/test-versionium-migration.js, V-006):
        manual commit() never wrote to versionium_calendar — only
        _autoCommit() did, so "calendar playback" (one of the three
        capabilities this spec's own purpose section names) was silently
        blind to every manually-triggered commit, which via the agent
        tool is most of them. Fixed alongside — both paths now share one
        _writeCalendarEntry() helper. 7/7 real assertions pass against an
        isolated JAA_DATA_DIR, not production data.
    - date: 2026-09-02
      summary: >
        §SNAPSHOTGATE MERGE — this spec's own 2026-09-01 entry above is
        now WRONG on one point, corrected here rather than silently left
        stale (the exact class of problem this migration exists to fix).
        It said idearium's SnapshotGate was "kept as idearium's own
        separate feature." That decision was reversed: idearium now has
        NO local snapshot copy at all. cortex/versionium/index.js's
        commit() gained an optional `state` param (idearium's actual
        restorable working state — ideas/specs/gaps/links, deep-cloned —
        distinct from the kernel's causal-replay snapshot, which is
        unrelated and untouched); a new getState(commitId) reads it back
        directly. cortex/boot.js gained GET /api/versionium/state/:id.
        idearium/index.js's SnapshotGate/SnapshotRestoreGate and their
        SISO registrations are gone — checked directly first (siso/core/
        index.js's Stream.emit() calls gate.transform() with no await, so
        an async gate's promise would've been silently dropped, and
        nothing else in this codebase listens for idearium.snapshot.
        committed/.restored on the bus) — replaced with direct async
        methods (commitSnapshot/snapshots/snapshot/diffSnapshots/
        restoreSnapshot) that idearium/cli/index.js and idearium/api/
        index.js now await directly, reaching cortex over HTTP via
        lib/nexus-client.js. Verified: 10/10 tests (3 new — state stored
        and retrieved deep-cloned, getState() errors correctly on a
        state-less or nonexistent commit), node --check clean on all 6
        touched files, idearium reboots 8/8. Real, undecided tradeoff
        surfaced by this change and not resolved here: idearium's commit/
        restore now require cortex to be up and reachable over HTTP —
        before, they worked fully offline/in-process. Whether that needs
        a local fallback queue (lib/nexus-client.js already has a
        postDurable/buffer-drain pattern for exactly this; this change
        calls nx.post/nx.get directly, bypassing it) is an open call.
    - date: 2026-09-15
      summary: >
        §GAP V5 CLOSED — file_delta's home decided (versionium/, per
        idearium-repository-overhaul-phasemap.spec's own recommendation,
        confirmed by James) ahead of MCO-A, and gap V5 closed the same
        way V6 already was: a new, one-time idempotent backfill,
        versionium/lib/migrate-idearium-snapshots.js, modeled directly on
        migrate-legacy-data.js, copying pre-merge idearium_snapshots rows
        into versionium_commits (tagged system:'idearium', state
        preserved deep-cloned, original legacy row kept verbatim under
        _migratedFrom for anyone checking the field-mapping guess against
        real data later — see that file's own header for the honest
        limitation: no idearium_snapshots row shipped with this checkout
        to confirm field names against, so the mapping is defensive, not
        assumed). Wired into server.js's boot sequence alongside
        migrateLegacyData(), same idempotent-every-boot convention.
        Verified: 3 new real tests (VSOV-009/010/011 in
        tests/modules/test-versionium-sovereign.js), 11/11 total in that
        file passing, against isolated temp dirs. §17.10 (verify before
        promote) applied directly: the migration was run against a real
        seeded legacy store and its output round-tripped through
        getState() before being called done, not declared done on code
        inspection alone.

        Real, unplanned finding surfaced by this pass, fixed alongside
        (§4.2 — fix bugs pre-emptively, don't just note and move on):
        cortex/ had been sitting unextracted at the repo root as
        Cortex.zip (the same working-tree/index mismatch the prior
        session's handoff already flagged as broader-than-cortex).
        Extracting it so migrate-idearium-snapshots.js's require of
        cortex/memory/jaa-db.js could resolve at all exposed a real,
        pre-existing test-isolation gap: test-versionium-sovereign.js's
        VSOV-007 (migrateLegacyData) had only ever run against cortex's
        require() failing (the try/catch skip path) — once it could
        succeed, that test wrote real files into this repo's actual
        data/cortex/memory/ default path, because JAA_DATA_DIR was never
        set before requiring cortex/memory/jaa-db.js. Fixed by moving the
        isolation env var to the top of the file, before any test runs
        (§3.3 — the map found this, not an assumption that
        migrateLegacyData was already safely isolated because it looked
        idempotent).
    - date: 2026-09-15
      summary: >
        cortex/versionium/index.js and cortex/versionium/causality.js
        checked directly, not assumed — confirmed still real, unexecuted
        archive per this spec's own 2026-09-02 entry (§0.3, kept not
        deleted). No production code requires them; versionium/lib/
        engine.js and causality.js remain the sole live implementation.
        No change made to either file — recorded here as a checked, not
        skipped, decision, per §3.3 (map before build extends to "map
        before deciding not to build," not just to changes made).

  gaps:
    as_of: 2026-09-01
    entries:
      - id: V1
        type: coverage
        summary: >
          version_history: sections in individual system specs (per LM1)
          are still hand-written, not auto-populated from GET
          /api/versionium/history. Building that writer (watch commits,
          append to the right system's .spec) is real, additional scope —
          closer to LM2's watchdog territory — and is not done here.
        opened: 2026-09-01
      - id: V2
        type: design
        summary: >
          Real fork-point recording at branch-creation (named in this
          spec's original commit_graph section) is still not built in
          cortex/versionium — branches are correctly scoped by name, but
          there's no record of which branch/commit a new branch actually
          forked FROM. Pre-existing, not newly introduced.
        opened: unknown
      - id: V3
        type: availability
        summary: >
          idearium's commit/restore now require cortex to be up and
          reachable over HTTP (§SNAPSHOTGATE MERGE, 2026-09-02) — before
          that reversal, idearium's own SnapshotGate worked fully
          offline/in-process. lib/nexus-client.js already has a
          postDurable/buffer-drain pattern for exactly this failure mode;
          idearium's new commitSnapshot()/restoreSnapshot() call nx.post/
          nx.get directly instead, so a cortex outage means a hard
          failure rather than a durable, replayed-later write. Whether
          that tradeoff is acceptable or needs the durable path is a
          real, undecided call.
        opened: 2026-09-02
      - id: V4
        type: coverage
        summary: >
          snrDelta (branch-relative, vs. the prior same-branch commit) is
          not reconstructed in idearium's new async snapshots() — the old
          SnapshotGate computed it from a local array scan that no longer
          exists. Left at 0. Real follow-up: derive it from two adjacent
          same-branch commits' state.snr via the history list.
        opened: 2026-09-02
      - id: V5
        type: coverage
        summary: >
          Pre-merge idearium_snapshots rows are orphaned — not deleted,
          not auto-migrated into versionium_commits. Real, separate
          decision: write a one-time backfill script, or accept the
          history gap.
        opened: 2026-09-02
      - id: V6
        type: coverage
        summary: >
          Production versionium_commits/branches/calendar rows that
          existed in cortex's shared jaaDB (data/cortex/memory/) before
          this VS1 migration do NOT automatically appear in the new
          sovereign store (data/versionium/) — a fresh boot of
          versionium/server.js starts with real, empty tables, not the
          old history. Real, separate decision, same as V5: write a
          one-time copy script, or accept that pre-2026-09-02 commit
          history stays queryable only via the old, now-unrequired
          cortex/versionium/index.js code kept as archive reference.
        opened: 2026-09-02
      - id: V7
        type: design
        summary: >
          Two independent, real sigma-gated auto-commit triggers now
          exist for the same commit endpoint: versionium/lib/engine.js's
          own internal trigger (cortex's live field entropy) and
          orchestrator/lib/versionium-auto-commit.js's trigger
          (orchestrator's composite sigma). Documented as a deliberate,
          understood coexistence in both files' own headers — not
          consolidated further in this pass. A future call on whether
          one should be retired, or whether they should share one
          cooldown clock instead of two independent ones, is real,
          undecided work.
        opened: 2026-09-02

  version_history:
    - version: 1.0.0
      date: 2026-06-29
      summary: "Original spec — proposed, nothing built."
      versioniumCommitId: null
    - version: 2.0.0
      date: 2026-09-01
      summary: "Reconciliation — cortex/versionium made canonical, dead trigger fixed, sovereign transport applied. Status changed proposed -> active."
      versioniumCommitId: null
    - version: 2.1.0
      date: 2026-09-02
      summary: "SnapshotGate merge reversal — idearium's local snapshot copy fully retired; commit() gained a state param + getState(); idearium/index.js, cli, and api all repointed to sovereign transport."
      versioniumCommitId: null
    - version: 3.0.0
      date: 2026-09-02
      summary: "VS1 — promoted from a library embedded in cortex's process to its own sovereign system (versionium/server.js, port 3754, own data folder, own component registry, own event taxonomy). Every real caller repointed."
      versioniumCommitId: null
