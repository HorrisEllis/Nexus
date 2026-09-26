spec:
  meta:
    name:        2026-09-02-versionium-sovereign-and-cleanup-phasemap
    version:     1.0.0
    foundation:  nexus-system-foundation@1.1.0
    status:      "STALE HEADER, corrected 2026-09-19. VS1 (versionium as its own sovereign system, :3754, autopilot phase 3)
      IS BUILT: cortex answers /api/versionium/* and now /api/memory?table=versionium_* with 410s, the cortex CLI reads
      versionium's own API, and versionium reads the CFR field from the orchestrator. The per-item status lines below
      predate that and were not individually re-audited; treat any that describe VS1's own scope as done. Remaining, by
      decision: cortex/versionium/ is unexecuted archive (D6, 2026-09-15); V7 (two auto-commit triggers) is undecided; cortex/snapshot
      is deferred (D3). See docs/2026-09-19-cortex-to-intelligence-and-versionium-consolidation-phasemap.spec."
    uuid:        nexus-phasemap-v1-0000-2026-0902-jamesbrooks-001
    purpose: >
      James's ask this session was, verbatim, dozens of distinct real
      items — a sovereign Versionium system, a filesystem-wide cleanup,
      clear-glass native-feature promotion, a 3-tier memory
      architecture, a real diagnostic node-graph UI, and several
      smaller fixes and open questions. Per this codebase's own §8.5
      discipline (map first, build in separately-verifiable phases, no
      monoliths), this phasemap sequences all of it rather than
      building any of it blind in one pass. Two pieces of real,
      concrete work landed THIS session outside the phasemap (see
      "done_this_session" below) because they were bounded, verified,
      and didn't need mapping first.

  done_this_session:
    idearium_config_crash: >
      James's pasted boot log showed idearium crash-looping on
      ERR_MODULE_NOT_FOUND for config.js, circuit-breaker tripped
      after 6 crashes. Traced directly: this crash does NOT reproduce
      in the checkout James uploaded as nexus-v0_39_38-m-fixed.zip —
      confirmed live by running `node idearium/api/index.js`, which
      boots 8/8 clean. The crash predates that checkout; nothing
      further needed here.
    versionium_state_merge: >
      A second upload (versionium-snapshotgate-merge.zip) contained
      real, correctly-reasoned continuation work finishing what last
      session's cortex/versionium migration left open: a `state` field
      on commit() (idearium's actual restorable working state, deep-
      cloned, distinct from the kernel's causal replay snapshot),
      getState() to read it back, a new GET /api/versionium/state/:id
      route, and idearium's SnapshotGate/SnapshotRestoreGate fully
      removed from the SISO pipeline in favor of direct async calls
      over sovereign transport. Verified directly (not assumed
      correct): diffed against the current checkout, merged in,
      node --check clean on all 4 touched files, idearium reboots 8/8,
      tests/modules/test-versionium-migration.js 10/10 (3 new),
      precommit-check.js clean. Committed as a9f74fc.

  answered_questions:
    loom_agent_suite: >
      James: "why is there an agent suite in loom, shouldn't be there,
      its a part of the agent mesh." Checked directly against
      consolidated.zip: loom/agent-suite/index.js's own header says
      exactly what it is — "Mirrors idearium/agent-suite/index.js's
      real, shipped pattern... scoped to LOOM instead of Idearium's
      spec wizard. Ported to LOOM's own CommonJS convention." This was
      a deliberate, real port (Phase 141), not an accidental leftover —
      it's required by loom/bootstrap.js, loom/test/agent-suite.test.js,
      and loom/templates/system-scaffold.js, all real, live consumers.
      Whether two near-identical copies (idearium's + loom's) should
      instead be ONE shared module is a legitimate architectural
      question, but it's a real decision (see LM-AGENT-1 below), not a
      bug to silently delete.
    migrate_or_remove_folder: >
      Real, and exactly what its name says — a staging area from prior
      sessions holding things nobody triaged yet: an OLD, pre-migration
      standalone copy of cortex/versionium (superseded by this
      session's canonical one — safe to remove once confirmed nothing
      references it), old clear-glass plugins/renderer, an old cli/,
      cockpit/, hooks/, meta/, and a full parallel data/ tree. See
      CLEANUP-3 below — every subfolder needs an individual
      migrate-or-remove call, not a blanket action.

  phases:

    # ────────────────────────────────────────────────────────────────
    # TRACK A — Versionium: sovereign system
    # ────────────────────────────────────────────────────────────────

    VS1_sovereign_folder_and_foundation:
      status: OPEN
      depends_on: []
      does: >
        Promote Versionium from a library living inside cortex/ to its
        own top-level system, following nexus-system-foundation.spec's
        L0-L5 shape exactly like ollama/loom/clear-glass: own
        versionium/ folder, own port (3754 confirmed free — checked
        against orchestrator/orchestrator.config.json's real ports
        block and every port literal in orchestrator.js/lib/version.js),
        own data/ directory (not reusing cortex's shared jaaDB tables),
        own event-driven interaction contract with handshake-gated
        verification (same pattern ollama.spec/loom.spec already use),
        own component registry (registry-components.js, same real
        pattern clear-glass/ollama already use), own event-taxonomy.js
        (ET-shaped, matching guardian/orchestrator's convention). All
        JS (L0-L4) before any UI (L5) — UI is explicitly out of scope
        for this phase.
      real_migration_target: >
        cortex/versionium/index.js + causality.js's real logic (commit/
        restore/calendar/getState, causal graph) moves here wholesale,
        not reimplemented. Every current caller (cortex/boot.js's
        /api/versionium/* routes, the agent tools, orchestrator's
        auto-commit trigger) gets repointed at the new sovereign
        port — this is real surgery across 4+ files, not additive.

    VS2_ring_buffer_and_causal_field:
      status: OPEN
      depends_on: [VS1_sovereign_folder_and_foundation]
      does: >
        The kernel's ring-buffer (currently intelligence/rfr2/kernel's
        createKernel({ringCap:50_000})) becomes Versionium's own L0
        primitive, and its causal-field tracking (currently cortex's
        own _field.entropy/_field.regime, fed via POST /cfr/field) gets
        a real second live feed INTO the new sovereign Versionium
        process — cross-process, so this needs the same sovereign-
        transport pattern already proven (orchestrator pushes, this
        system's own boot.js maintains local field state, exactly as
        cortex's boot.js does today). Reuse-before-build (§8.6): does
        NOT reimplement rfr2/kernel, wraps it.

    VS3_agent_chat_log_query:
      status: OPEN — real primitive not found this pass
      depends_on: [VS1_sovereign_folder_and_foundation]
      does: >
        "Can also query agent chat log index to track versions based
        on keywords and timestamps." Checked directly: no existing
        "per-agent chat index" module was found this session (grepped
        tree-wide for chat-index/chatIndex/agent_chat_index — zero
        hits). The real substrate that exists is cortex's own
        `chat_log` jaaDB table (confirmed present in every boot log,
        175+ real rows) — this phase is a keyword+timestamp query
        layer over that table, exposed as a Versionium capability
        (e.g. GET /api/versionium/chat-search?q=&since=&until=), not a
        new index structure invented from scratch.
      honesty_note: >
        Whether this needs a REAL search index (inverted index, or
        just a linear scan with date-range narrowing) depends on real
        chat_log volume at steady state — not measured this pass.
        Build the simple version first, add indexing only if a real
        latency problem shows up.

    VS4_active_drift_enforcement:
      status: OPEN
      depends_on: [VS1_sovereign_folder_and_foundation]
      does: >
        orchestrator/lib/spec-drift.js already does real, live version-
        drift DETECTION (53 synced / 3 missing, checked every boot).
        "Enforces versions for each" asks for this to become active
        enforcement, not passive reporting — e.g. blocking a system's
        boot, or raising a real gap via cortex's gaps table, when a
        system's code@version and spec@version.version_history
        disagree. Real design call needed first: what should
        enforcement actually DO on a mismatch (warn vs. block vs.
        gap) — not assumed here.

    LM_AGENT_1_agent_suite_consolidation:
      status: OPEN — real design decision, not a bug
      depends_on: []
      does: >
        Per answered_questions.loom_agent_suite above: decide whether
        idearium/agent-suite and loom/agent-suite (215 vs 280 lines,
        real divergence beyond the header) should become one shared
        module (candidate home: lib/agent-mesh/, matching AX-010's
        "shared infrastructure under lib/ that no system owns" carve-
        out) or stay as two intentional, independently-evolving forks
        (this codebase's more common pattern — e.g. each system having
        its own config.js rather than a shared one). Not decided here.

    # ────────────────────────────────────────────────────────────────
    # TRACK B — clear-glass: process manager, native features, adblock
    # ────────────────────────────────────────────────────────────────

    CG1_process_manager_in_settings:
      status: OPEN
      depends_on: []
      real_starting_point: >
        clear-glass/tools/process-monitor.html (confirmed present in
        James's own screenshot, Image 1) already exists as a real,
        standalone tool. This phase wires it into the real hamburger
        settings menu (clear-glass/src/options/) as a first-class
        panel rather than a separate standalone file — real UI
        surgery in an existing options store, not a new build.

    CG2_native_password_permission_zoom:
      status: OPEN — real architecture decision
      depends_on: []
      does: >
        James: passwords, permissions, and zoom "should all be actual
        browser features not plugins." Checked directly: clear-glass's
        real plugin registry (registry-components.js, confirmed live
        in this session's boot logs — "installed: passwords",
        "installed: zoom", "installed: permissions") currently loads
        these via the plugin system alongside adblocker/captcha-pause/
        guardian-listeners. Promoting them means wiring Electron/
        Chromium's OWN native APIs (session.setPermissionRequestHandler
        for permissions, webContents.setZoomFactor for zoom, a real
        password-manager surface) directly into clear-glass/src/ rather
        than through the plugin layer — real, non-trivial Electron work
        per feature, not a rename.

    CG3_ublock_style_adblocker:
      status: OPEN
      depends_on: []
      does: >
        Real uBlock-Origin-compatible filter-list engine (EasyList/
        EasyPrivacy format parsing, not clear-glass's current bespoke
        adblocker plugin) plus a real element picker, plus a manual
        "block this" action for whatever the filter lists miss. This
        is a genuinely large scope on its own — a real filter-list
        parser/matcher is its own subsystem, not a plugin tweak.

    # ────────────────────────────────────────────────────────────────
    # TRACK C — Cortex: 3-tier memory + associative lattice
    # ────────────────────────────────────────────────────────────────

    MEM1_three_tier_memory_formalized:
      status: OPEN — real architecture decision
      depends_on: []
      does: >
        James's shape: working memory lives IN each system (already
        true — every system's own in-process state); short-term lives
        in each system's own data/ folder (already true — confirmed
        real per-system data/<system>/ dirs in every boot log); long-
        term lives in cortex (already largely true — cortex's jaaDB
        holds the shared, cross-system tables). What's genuinely NOT
        built: the associative lattice that "interconnects the
        systems data, as nodes" — a real graph structure over the
        three tiers, not just three separate stores that happen to
        exist. This is the one real gap, and it's a substantial design
        + build, not a wiring fix.
      real_precedent_to_reuse: >
        orchestrator's own user-model lattice (confirmed live —
        "[user-model] lattice hydrated from 175 real user prompts")
        and intelligence/spatial/lattice.js both already implement a
        real lattice structure for a narrower purpose. Reuse-before-
        build (§8.6): this phase should evaluate extending one of
        these rather than building a third lattice implementation.

    MEM2_ledger_folder_reorg:
      status: OPEN
      depends_on: []
      does: >
        Event ledgers move into a real ledgers/ folder, subdivided by
        date-time (e.g. ledgers/<system>/2026-09-02/). Real migration
        of existing data/ledger/<system>/*.jsonl files, not just a new
        convention for future writes — every existing ledger writer
        (confirmed: cortex, guardian, orchestrator, bridge, diagnostic,
        loom, copilot all write ledgers) needs its write path updated.

    MEM3_timestamps_everywhere:
      status: OPEN
      does: >
        Every js/html file gets a real header timestamp, or is logged
        with one in Versionium (ties directly to VS1 — this is the
        version_history mechanism LM1 already built, extended to cover
        static files that aren't "systems" in the spec-drift sense).

    # ────────────────────────────────────────────────────────────────
    # TRACK D — Filesystem cleanup
    # ────────────────────────────────────────────────────────────────

    CLEANUP1_md_file_migration:
      status: OPEN
      depends_on: []
      does: >
        Every top-level .md file (confirmed real and numerous this
        session: ARCHITECTURE-BRAINSTORM-SYNTHESIS, CHANGELOG,
        CHANGELOG-SESSION, CLAUDE.md, CLEAR-GLASS-CAPABILITY-BREAKDOWN,
        CONFIRM-BUILD, CONSOLIDATION-NOTES, GUARDIAN-ARCHIVE-MINING,
        HANDOFF-2026-07-11, HANDOFF-2026-08-24, MANIFEST.md,
        PATCH-NOTES, README, SESSION-MANIFEST-2026-07-07,
        SESSION-PROTOCOL, START, SYSTEM-MAP, TUTORIAL,
        VERIFICATION-LOG — 18 files just at repo root) gets read,
        its real content parsed into the appropriate docs/specs/
        phasemap, then the .md is deleted. Real per-file editorial
        judgment needed — these are not uniform, some are historical
        session logs (candidates for a single consolidated history
        doc), some are living docs (README) that need a real
        replacement location, not deletion. CLAUDE.md specifically
        governs precommit's own rule-set — deleting it without
        migrating its content first would break real, live tooling.
      includes: >
        Same treatment for any .spec.md files found (e.g.
        codefactory.spec.md, named explicitly) — converted to real
        .spec format, not left as markdown-wrapped specs.

    CLEANUP2_lib_orchestrator_reorg:
      status: OPEN
      depends_on: []
      does: >
        James asked specifically about lib/ and orchestrator/ needing
        organization phases. Real inventory needed first (lib/ alone
        has activity-log, agent-system, agent-tools, chunker,
        diag-engines, gemini-toolbox, ledger-fanin, nerve, seam, uid —
        10+ real subsystems living under one flat folder with no
        internal phase structure) before any file moves — this phase
        is the inventory + real phasemap for the reorg, not the reorg
        itself.

    CLEANUP3_migrate_or_remove_triage:
      status: OPEN
      depends_on: []
      does: >
        Per answered_questions.migrate_or_remove_folder — a real,
        per-subfolder triage. Concrete first finding: "migrate or
        remove/cortex/versionium/" is an OLD, pre-canonical copy,
        safely removable once grepped tree-wide for any remaining
        reference (none found this pass, but not exhaustively
        verified). Every other subfolder (clear-glass/plugins,
        clear-glass/renderer, cli/, cockpit/, hooks/, meta/, the
        parallel data/ tree, service/Diagnostic, skills/) needs the
        same individual real check, not a blanket delete.

    CLEANUP4_guardian_decomposition:
      status: OPEN
      depends_on: []
      does: >
        Decompose guardian/server.js into real components. Not sized
        this pass (guardian/server.js's real line count and internal
        seam boundaries weren't measured) — first sub-step is a real
        read of the file's own structure to find natural component
        boundaries before any split.

    CLEANUP5_clear_glass_registry_dedup:
      status: OPEN — real duplication confirmed
      depends_on: []
      does: >
        James: "wire has a component registry and so does seam."
        Confirmed as a real, worth-investigating duplication —
        clear-glass/wire/ and clear-glass/seam/ both maintaining
        component-registry-shaped state is exactly the §10.3
        competing-truth pattern this session already found (and fixed)
        once in Versionium. Not yet traced to confirm which one is
        canonical or whether they track genuinely different things.

    CLEANUP6_ui_files_to_systems:
      status: OPEN
      depends_on: []
      does: >
        Every file under the top-level ui/ folder moves into its
        owning system's own ui/ directory (ui/copilot/ -> copilot/ui/,
        etc.), matching the "self-contained per system" principle
        applied everywhere else in this codebase. Two named exceptions
        get called out for special handling, not a plain move:
      ui_diagnostics_special_case: >
        James: "nexus/ui/diagnostics/index.html is a good start... I
        really wanted a live map with nodes that represent packets or
        files moving through and from each system, like a brain." This
        moves to diagnostic/ui/ AND becomes the real target for a new
        live node-graph visualization — replacing the current TV-shell
        diagnostic view, not just relocating the existing file
        unchanged. A real, separate build (needs a live event-flow
        data source feeding node/edge positions — likely the same
        event_log/bus traffic cortex's own intelligence pattern-
        crystallizer already reads).
      ui_conversations_special_case: >
        James: "ui/channels/conversations/conversations.html is a
        good start for browsing the agent chat logs." Moves to a real
        owning system's ui/ (candidate: copilot, since it already owns
        chat-adjacent surfaces) and gets built out — ties directly to
        VS3's chat-log query capability once that lands.
      ui_builder_special_case: >
        James: "ui/builder/index.html should be migrated somewhere,
        maybe loom?" Real candidate confirmed independently: loom
        already owns component/hook/wire/seam registry + a real
        system-scaffold.js (loom/templates/system-scaffold.js, "CLI to
        operations-list to CLI+API+contract projector"). A builder UI
        is a natural front-end for exactly that existing capability —
        loom is the right home, not just a guess.

    CLEANUP7_hotswap_ui_living_contracts:
      status: OPEN — real design decision
      depends_on: [VS1_sovereign_folder_and_foundation]
      does: >
        "What about also using the living models for the interaction
        contracts for the hotswappable uis. all contracts should be
        self-contained in each system." Ties AX-013's living-model
        spec schema (history/gaps/version_history) into the real,
        already-existing UI hotswap file watcher (confirmed live —
        "[ui] watching cortex/ui/", "watching idearium/ui/", etc.) so
        each system's own spec IS its interaction contract for its own
        hotswappable UI, rather than a separate contract file. Depends
        on VS1 because Versionium is where a UI-contract's own version
        history would be tracked.

    CLEANUP8_archive_history_backfill:
      status: OPEN
      depends_on: [VS1_sovereign_folder_and_foundation]
      does: >
        "Also have the original archives of nexus if you can add them
        to the living model to update history." _archive/unintegrated/
        (confirmed real, multiple dated batches: 2026-07-branch-a,
        2026-07-branch-b-cortex-v2, 2026-08-14-uploaded-batch,
        2026-09-01-uploaded-batch, rfr2-nexus) becomes real
        version_history: entries once Versionium is sovereign — a
        real backfill pass, not automatic, since each archive batch
        needs a human-legible summary, not a raw file dump into a
        spec's history section.

    CLEANUP9_agent_context_reduction:
      status: OPEN — real measurement needed first
      depends_on: []
      does: >
        "Way too much being injected into the agents." Not sized this
        pass — the real first step is measuring what's actually in a
        live agent context (system prompts, tool manifests, injected
        memory) before deciding what to cut, not guessing at a
        reduction.

  build_order_recommendation: >
    VS1 first (it's the dependency root for VS2/VS3/VS4, LM_AGENT_1,
    CLEANUP7, and CLEANUP8). CLEANUP1 (the .md migration) and
    CLEANUP3 (migrate-or-remove triage) are independently startable
    now with zero dependencies and would make every subsequent phase's
    "check the real current state first" step faster. CG1 (process
    manager in settings) is the smallest, most self-contained win if
    a quick visible result is wanted first.
