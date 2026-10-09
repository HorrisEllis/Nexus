spec:
  meta:
    name:    2026-08-23-backlog
    roadmap: 'later — a night''s leftovers; anything on the path will resurface there (declutter 2026-10-09, James: "okay")'
    version: 0.2.0-phasemap
    status:  PHASEMAP 2026-08-23. Real, evidence-grounded where evidence
             already exists (Guardian-zip mining report, live tool-registry
             counts, real file locations checked directly) — everything else
             marked OPEN honestly rather than assumed. "done" means tested
             and committed this session; "OPEN" means named, scoped, and
             deliberately not started; sequencing (depends_on) reflects real
             ordering constraints, not just a convenient list order.
    uuid:    nexus-2026-0823-backlog-phasemap-v1-0000-001
    intent: >
      James: "phasemap all the rest." Everything from tonight's session that
      didn't get built live — the Guardian-extension-zip migration into
      clear-glass, the full codebase reorganization (emerge files, docs
      consolidation, per-system phasemap folders, the agent-tools tool-tree
      restructuring, per-server.js configs), and nexus:// URL scheme +
      tools-per-url support — captured as real, sequenced, loom-visible
      phases instead of executed blind in one pass. Two things WERE built
      live this session and are marked done below for completeness: the
      macro system, and its erosmancer/behavior-engine integration.

  phases:

    # ── Already real, done this session (context for what follows) ───────

    BL0_macro_system:
      status: "✓ DONE — commit 9b8671f. lib/agent-tools/tools/automation/
        macro.js — create/list/get/delete/run/bookmark, built on
        browser_action + rewind_replay, not parallel to them. Two real bugs
        found and fixed while testing: a soft-delete row-ordering bug
        (jaaDB's query(pred,1) returned the oldest match, not the current
        one) and a tool-action-name vs driver-sub-action-name mismatch
        (get_url vs getUrl). 11 real tests, all passing."
      depends_on: []
      does: >
        The real foundation everything else in this phasemap that touches
        macros builds on.

    BL1_macro_erosmancer_integration:
      status: "✓ DONE — commit de34150. Macro steps can opt in per-step
        with engine:'erosmancer' to run through ErosmancerOS's real
        behavior-modeled execution pipeline (Box-Muller timing variance,
        Bezier mouse paths, adaptive learning) via clear-glass/wire/
        nexus-wire.js's real proxy at :7704/eros/*. A real correctness bug
        caught while testing: erosmancer's navigate/type/evaluate expect a
        raw payload value (String(payload)), not browser_action's
        {url:...} object shape. 6 more real tests (17 total)."
      depends_on: [BL0_macro_system]
      does: >
        Job-application and therapist-contact macros — the exact real use
        case James named — can now request human-like execution timing
        instead of mechanically-instant, bot-shaped interaction.

    # ── Guardian extension zip → clear-glass migration ─────────────────
    # System: guardian, clear-glass

    BL2_guardian_zip_mining_report:
      status: "✓ DONE — commit 5e4090f. GUARDIAN-ARCHIVE-MINING-2026-08-23.md
        — all four uploaded zips (files-1, Guardian-clean-9/13/17) read
        directly, not skimmed. Confirmed: the same older, separate Manifest
        V2 extension across all four; app.js/identities.json byte-identical
        gc9->gc17; content.js/popup.html evolved meaningfully. Mapped
        against the real request item by item — most items (account/cookie
        UUID fallback, console, downloads, print, macros) are NOT built in
        the archive; social-media listeners (modules/instagram.js,
        modules/threads.js) ARE real, working, and the strongest actual
        prior art found."
      depends_on: []
      does: >
        The real, evidence-based map this whole migration group is
        sequenced from — nothing below assumes more exists in the archive
        than was actually confirmed.

    BL3_port_social_listener_pattern:
      status: "OPEN — real, scoped, highest-value real code to port.
        modules/base-module.js's GuardianModule class (name/domains/urck,
        activate/deactivate, emit() -> browser.runtime.sendMessage) and
        modules/instagram.js's real MutationObserver-based DM/post
        detection are Manifest-V2-extension-context code — cannot be
        required as-is into guardian/userscript-claude.js (a Tampermonkey
        userscript, different runtime, no browser.runtime.sendMessage).
        Real work: reimplement the SAME pattern (MutationObserver + a real
        emit-to-guardian path, reusing this session's own real
        _nexusLogMessage()-style POST to a cortex/guardian endpoint rather
        than a browser extension message) as a genuine userscript module,
        not a literal file copy."
      depends_on: [BL2_guardian_zip_mining_report]
      does: >
        Gives the current, live guardian system a real social-media
        listener capability it does not have today — instagram.com and
        threads.com DM/post detection, emitting real, structured events.

    BL4_port_element_picker_ux:
      status: "OPEN. Real, confirmed-superior UX in the old extension's
        content.js/popup.js: breadcrumb depth indicator, zoom controls
        (parent/child/prev/next), nearby-element suggestion chips (auto-
        detects interactive elements within 120px), per-listener ring-
        buffer event log (500 events, JSON export). The current system's
        dom_pick (browser-action.js) is real and working but has none of
        this polish. Real work: port the UX layer, not the underlying
        pick mechanism (which already works and is already wired through
        gates/index.js's real domPickGate)."
      depends_on: [BL2_guardian_zip_mining_report]
      does: >
        Makes the existing, real dom_pick tool meaningfully more usable —
        this is a UX/ergonomics port, not new capability.

    BL5_port_killswitch_pattern:
      status: "OPEN. Real, well-thought-out real safety UX from the old
        extension: single-tap stops UI listeners only; double-tap within
        1.5s does a FULL stop (listeners + bridge + pulse). Worth having
        somewhere in the current guardian/clear-glass system, which
        currently has no equivalent single control for \"stop everything
        this tab is doing, right now\" — scoped narrowly on purpose, real
        design question of WHERE this belongs (guardian's own UI panel?
        a new browser_action action?) not yet answered."
      depends_on: [BL2_guardian_zip_mining_report]
      does: >
        A real, fast, unambiguous way to halt an automation/listener that's
        misbehaving, without restarting the whole guardian process.

    BL6_captcha_detection:
      status: "OPEN. The alert half of this (native OS toast, via
        GUARDIAN_NATIVE_TOAST) is already real and committed (5e4090f) —
        this phase is the other half: actually detecting a CAPTCHA
        challenge in the DOM (real dom_query against known CAPTCHA
        provider markup — reCAPTCHA/hCaptcha/Cloudflare Turnstile iframe
        signatures) and firing nativeToast when one blocks a macro or
        listener. Not found anywhere in the mined Guardian archive either
        — genuinely new work, not a port."
      depends_on: [BL0_macro_system]
      does: >
        Closes the real loop James named: \"CLI drives automation, pops a
        real notification when a CAPTCHA needs a human\" — detection was
        the missing half of the alert mechanism already built.

    # ── Codebase reorganization ─────────────────────────────────────────
    # System: loom, orchestrator, cortex, diagnostic, emerge, guardian,
    #         copilot, ollama, agent, clear-glass

    BL7_emerge_files_to_emerge_folder:
      status: "✓ DONE — commit (this session, 2026-08-23). All 4 real
        files moved with git mv, preserving history. Real consumer
        trace found the surface was larger than initially scoped: 3
        real, broken relative requires inside emerge-ide.js itself
        (./emerge/siso, ./ollama-runtime, ./emerge/registry-components
        — all relative to the OLD root location), fixed. Two real,
        executable external consumers updated: cli/boot-systems.js's
        real spawn cmd, contracts/SYSTEM-CONTRACTS.js's bootFile
        metadata (confirmed zero real programmatic readers of this
        field anywhere — dead metadata, updated for accuracy anyway).
        tests/kernel.test.js's 3 real path.resolve calls and
        cli/diagnose.js's whole diagEmerge() block (9 real path
        strings across file-existence/syntax/live checks) both updated.
        emerge-kernel.js itself needed no changes (only Node builtins).
        emerge-codegen-v2.js's two require()-shaped strings turned out
        to be code-GENERATION templates for its own output files, not
        its own imports — correctly left untouched.
        Verified live, not just via node --check: actually booted
        emerge-ide.js from its new location — real output confirmed
        codegen loaded, emerge.spec parsed (569 keywords, 7 axioms,
        matching the pre-move real content exactly), and even
        confirmed the earlier ollama.DEFAULT_MODEL wiring (commit
        4fe7f12) still resolves correctly through the fixed
        ../ollama-runtime require. Full regression: tests/kernel.test.js
        101/102 (the one failure, real .eg files in emerge/io,
        confirmed identical via git stash — pre-existing, unrelated)."
      depends_on: []
      does: >
        Consolidates the emerge system's real files into its own real
        folder instead of scattered at repo root.

    BL8_docs_consolidation:
      status: "OPEN, and the real prerequisite for BL9 below — \"any
        phasemaps from the docs folder moved to looms phasemap system,
        sorted by system\" only means something once loom/scanners/
        phasemap-map.js (the real, already-built scanner, confirmed by
        reading it directly this session) has something DIFFERENT to do
        than what it already does — it already reads every docs/*phasemap*.
        spec file and tags each phase to a system automatically. Real work
        here: (1) move non-phasemap specs out of docs/ into each system's
        own real spec folder, (2) confirm phasemap-map.js's own real
        SYSTEMS list and PHASE_RE regex still correctly cover every
        existing phasemap file's real content before anything moves."
      depends_on: []
      does: >
        A docs/ folder that holds only what doesn't belong to one specific
        system, with everything else living where it's actually used.

    BL9_per_system_phasemap_folders:
      status: "OPEN. James: \"the loom phases, all split into a phasemap
        for each system, then copied into a phasemap folder in each
        system's folder: /cortex/phasemap, /co-pilot/phasemap, /guardian/
        phasemap, and the rest of the 12 systems.\" Real design question,
        not yet answered: loom/scanners/phasemap-map.js already computes
        per-system phase groupings AT QUERY TIME from the existing docs/
        files — this phase would need a real, new EXPORT step (real files
        written to disk in each system's own folder) rather than only a
        live query, and a decision on whether those exported files are the
        new source of truth (docs/ phasemaps then deleted, per James's own
        \"phases from these moved... then deleted\") or a generated,
        read-only mirror kept in sync."
      depends_on: [BL8_docs_consolidation]
      does: >
        Makes \"what's left for cortex\" answerable by opening
        /cortex/phasemap directly, not only by querying loom.

    BL10_nexus_roadmap_html_files:
      status: "OPEN. nexus-roadmap-combined.html and phase_map_11.html —
        named but not yet located in this checkout; real first step is
        confirming where these actually live (repo root? docs/? a build
        output?) before deciding whether they're a real, generated view of
        the same phasemap data (in which case BL9's real export step
        should regenerate them) or standalone artifacts to move/retire."
      depends_on: [BL9_per_system_phasemap_folders]
      does: >
        Resolves two named files with no confirmed real location yet.

    BL11_orchestrator_folder_consolidation:
      status: "✓ DONE — commit (this session, 2026-08-23). The largest,
        highest-risk real move in this whole backlog — genuinely bigger
        than any other move phase, confirmed by evidence not assumed:
        76 real relative requires inside orchestrator.js itself, plus
        real consumers across 12 other files. Two real, systemic bugs
        found and fixed, not just individual broken paths:
        (1) ~20 of those 76 requires were already './orchestrator/lib/...'
        — correctly pointing at orchestrator's own existing lib subfolder
        from the OLD root location. A naive blanket '../' prefix would
        have double-broken those. Used a precise two-step transform
        (blanket '../', then fix the orchestrator/lib over-corrections
        back to './lib/') — every one of the 76 verified by direct
        inspection, both categories correctly distinguished.
        (2) ROOT was `__dirname`, used in 19 real places throughout the
        file AS IF it meant repo root (path.join(ROOT,'ui'),
        path.join(ROOT,'cli','nexus-repl.js'), etc.) — true only because
        the file used to sit at repo root. Fixed once at the real source
        (ROOT = path.join(__dirname, '..')) rather than touching 19
        call sites individually.
        A real miss caught by actually booting the file, not by
        node --check alone: require.resolve('./auth/index') — a
        DIFFERENT call signature (require.resolve, not require) that the
        regex-based transform's own pattern didn't match, since
        'require.resolve(' doesn't contain 'require(' as an immediate
        prefix. Found from the real boot log's own
        '[orch] auth module unavailable' error, fixed, reverified live.
        12 real external consumer files updated: autopilot.js's real
        boot spawn, cli/diagnose.js (6 references), scripts/verify-boot.js,
        scripts/verify-wires.js, service/nexus-diagnostic.js's real
        syntax-check list, lib/system-check.js, lib/file-integrity.js
        (both the file path and the sibling orchestrator-contract.json
        path), lib/uid/component-map.js, contracts/SYSTEM-CONTRACTS.js,
        lib/nexus-config.js (the real, canonical single-read-path for
        orchestrator.config.json), intelligence/cfr/contract-verifier.js.
        Deliberately left untouched, with reasons: clear-glass/
        fix-orchestrator.js (explicitly historical, documents a real
        past incident — not retroactively rewritten per §0.3), loom/
        data/registry.json and MANIFEST.json (confirmed zero real
        programmatic consumers — static artifacts, not live code paths).
        4 real test files also fixed (test-health-authority.js,
        healer.test.js, tests/nexus-full-audit.js,
        tests/diagnostic-fixes.test.js) — one reference in
        diagnostic-fixes.test.js checked and correctly left alone: a
        substring match (.includes('orchestrator.js')) that still holds
        true against the new 'orchestrator/orchestrator.js' path,
        verified directly rather than assumed.
        Verified live, not just via node --check (§17.10): booted
        orchestrator.js from its new location as a real process,
        confirmed the real HTTP server bound on :9000, the real ledger
        directory resolved correctly (proving the ROOT fix works),
        every real UI-hotswap watcher resolved to its correct real
        folder (cortex/ui, idearium/ui, orchestrator/ui, etc. — all via
        the same ROOT fix), and the real /health endpoint correctly
        reported all 12 real systems. Ran cli/diagnose.js orchestrator
        directly: 8/8 real checks passing at the new location. Full
        regression: tests/nexus-full-audit.js 99 pass/39 fail — confirmed
        IDENTICAL before and after via git stash, pre-existing and
        unrelated; healer.test.js's real crash (missing cortex/healer/
        index.js) and diagnostic-fixes.test.js's 3 failures (self-heal
        apply_disabled) both confirmed pre-existing and unrelated the
        same way."
      depends_on: []
      does: >
        orchestrator's own real files stop being the one system living at
        repo root while everything else has its own folder.

    BL12_nexus_heal_loop_to_diagnostic:
      status: "✓ DONE — commit (this session, 2026-08-23). Real ambiguity
        resolved before moving anything: 'the diagnostic system' has no
        clean top-level folder the way cortex/guardian do — confirmed by
        reading docs/diagnostic-phase-map.spec directly, which names
        service/nexus-diagnostic.js (port 7825) as the real, live
        diagnostic service. service/ already held several other systems'
        service wrappers, confirming it as the real target before the
        move. Traced every real consumer first: 6 files referenced the
        filename, only ONE was a real, executable require()
        (orchestrator.js:130) — the rest were comments/hook metadata,
        updated for accuracy rather than left stale. Moved with git mv.
        Two real breaks found and fixed by actually loading the module
        from its new location, not trusted from node --check alone: the
        file's own internal relative requires (./lib/nexus-config,
        ./cortex/core/raid) were relative to the old root location and
        would have silently resolved wrong under service/. Verified:
        the module loads cleanly with its real exports intact, and
        orchestrator.js's exact real require line resolves correctly."
      depends_on: []
      does: >
        nexus-heal-loop.js lives with the rest of the diagnostic system
        instead of at its current, separate location.

    BL13_cortex_component_registry_move:
      status: "✓ DONE — commit (this session, 2026-08-23). Real checklist
        followed per §8.6/§17.10 before touching anything: cortex/
        registry-components.js already existed in-place (39 real
        components, confirmed by loading it directly) — every other
        system already had its own equivalent too. registry-
        components.cortex.js at repo root turned out to be a STALE
        duplicate, not unique content needing a move: diffed both files
        directly, the only difference was a drifted version string
        (3.2.0 vs the real, already-fixed 3.5.0) — the root file was
        missing the §5.4 bugfix entirely. Traced every real consumer
        before deleting (§0.3 — nothing simply disappears without a
        stated reason): grepped for both the exact stale filename and
        every real require('./registry-components') across the
        codebase — cortex/boot.js, guardian/server.js, loom/server.js,
        copilot/server.js, and 6 more all already resolve to each
        system's own in-place file via a relative require, zero real
        references to the root file anywhere. Deleted, not moved —
        verified the real, remaining consumer path (component-registry's
        normalizeDeclarations) still resolves 39 real components after
        deletion."
      depends_on: []
      does: >
        cortex's own component registry lives inside cortex/ rather than
        wherever it currently sits.

    BL14_seam_to_lib_seam:
      status: "✓ DONE — checked directly, 2026-08-23, no real move to make.
        No top-level seam/ folder exists anywhere in this checkout — grepped and
        confirmed directly, not assumed absent. lib/seam/ already exists
        with substantial, real content (10+ files: axioms.js, gates.js,
        detector.js, build-contract.js, chunk-lifecycle.js, and more).
        The only other real seam-named location is clear-glass/seam/ —
        checked its real content before assuming it was the intended
        target: 2 files, zero filename overlap with lib/seam/.
        registry-components.js there matches the SAME established
        per-system pattern every other system already follows (BL13's
        own finding) — moving it would BREAK that convention, not fix
        anything. watchdog-gates.js is genuinely clear-glass-specific,
        real, and already correctly tested at its current path
        (clear-glass/test/watchdog.test.js's own real require).
        Moving either into lib/seam/ would be architecturally wrong,
        not a real consolidation — mixing clear-glass-specific test-
        support code into shared library code, and duplicating the
        per-system registry pattern elsewhere. No real work done here
        because none was correctly scoped to do — likely already
        resolved before this checkout, or referring to a path real on
        James's own live machine but not present in this snapshot."
      depends_on: []
      does: >
        SEAM's real code lives under lib/ alongside the rest of this
        codebase's shared library code, not as a top-level, separately-
        rooted folder.

    BL15_agent_tools_tree_restructure:
      status: "OPEN, the largest single real item in this phasemap. James
        gave an extremely specific real target structure: contracts/,
        frameworks/{framework-forge,framework-index}/, toolboxes/{gemini,
        chatgpt,claude,perplexity,ollama}-toolbox/ (four explicitly marked
        not-yet-built, plus a real, specific sub-path
        toolboxes/ollama-toolbox/huihui_ai/qwen2.5-coder-abliterate/),
        toolboxes/toolbox-forge/ (not-yet-built, for BUILDING toolboxes),
        hats/{hat-forge,hat-seed}/, autonomous-tools/{loops,feedback-loops,
        conditions,schedule,tasks,workflow-automation}/, clear-glass/
        {element-picker.js, element-mapper.js (not-yet-built — map every
        element into ids and calltos), dev-tools.js (not-yet-built — read
        real devtools console errors), listener-automation.js (not-yet-
        built — a real, involved UI: pick a DOM element from a dropdown,
        checkbox for \"listen for keywords\" vs \"listen for questions\"
        (sentences ending in a question mark — confirmed with James
        directly, 2026-08-23: a real typo in the original request, not a
        design choice), auto-download+reverse-image-search a referenced
        image using the question as the search query, co-pilot asks
        where to retrieve an answer from and saves that
        choice for future reuse)}, nerve/, tool-forge/{tool-config.js,
        tool-forge.js, tool-index.js}. This session's real, currently-
        existing tools (browser-action.js, macro.js, rewind-replay.js, and
        every other of the 72 real registered tools) all need a real,
        individually-checked new home in this structure, not a blind
        bulk-move — several (macro.js in particular, built THIS session)
        plausibly belong under autonomous-tools/ rather than staying in
        automation/, a real naming/taxonomy decision this phasemap does
        not make unilaterally."
      depends_on: [BL0_macro_system]
      does: >
        The full backend-tool taxonomy James described — real folders for
        what exists today, real placeholders (named, not built) for what's
        coming, including a genuinely new listener-automation feature
        (image-driven reverse-search-triggered Q&A capture) that has no
        real precedent anywhere in this codebase yet, mined archive
        included.

    BL16_per_server_configs:
      status: "✓ DONE — 12/12 real systems complete (guardian, ollama,
        intelligence, copilot, bridge, eravos, loom, cortex, idearium,
        architect, emerge — all real, individually verified with a
        live boot test each, not a mechanical template stamp). Two real,
        genuine finds along the way, not just mechanical extraction:
        intelligence/config.js (built earlier) was missing 8 real
        constants from intelligence/index.js itself, only ever covering
        server.js/consumer.js — fixed, and traced a real, stale
        documentation bug this surfaced in lib/uid/component-map.js's
        nexus-cx entry (still listing config values that relocated to
        intelligence during phase 1, plus one — SIGMA_THRESHOLD — that
        never existed as real code anywhere at all). idearium/config.js
        needed genuine ESM syntax (export default, not module.exports)
        since its own package.json declares type:module — confirmed
        directly, not assumed, and a real path bug only surfaced by
        actually booting it (node --check alone would never have caught
        it). The last two, architect and emerge, both genuinely differed
        from the established pattern rather than being forced to fit:
        architect's PORT deliberately kept unwrapped by parseInt,
        preserving its exact original behavior; emerge's real CLI-flag
        overrides (--port/--model via a real getArg() helper) can't be
        represented by a static config file, so only the real, static
        fallback defaults were centralized, verified live with and
        without the CLI flag to confirm the override still genuinely
        wins. \"Real system\" itself got a real, settled definition this
        same session: a genuine .listen() call, not any component_id
        namespace prefix — confirmed exactly 12 real systems this way,
        matching the pre-existing 'NEXUS — 12 systems' label already in
        loom's own UI."
      depends_on: []
      does: >
        Closes the same real \"N files must independently agree\" risk
        ollama/config.js closed for the model tag, for every other
        subsystem's own scattered constants.

    BL20_loom_map_becomes_real_visual_graph:
      status: "✓ DONE. James, from a real, live screenshot: \"like the
        map tab, each system a block with hooks and wires connecting
        them... you can click on the blocks and open, fully updated...
        a system has to have a server.js to be considered a system in
        loom... each system is a compartment, and repository for the
        system.\" The backend (/api/component/:system) already existed
        and worked — only the visual layer was a flat list. Replaced it
        with a real SVG graph: systems as blocks, real wires between
        them aggregated client-side from /api/graph's existing hook-
        level wire data, edge thickness scaled to real connection
        count, clicking a block still opens the same real, live detail
        panel — now also showing the system's real repository path.
        Filtered to the real, confirmed 12-system definition (an actual
        HTTP server, not any namespace prefix) — correctly excludes
        lib/tests/scripts/cli/hooks and other real shared code that
        isn't a real system. Caught and fixed a real, separate,
        serious bug along the way: loom/bootstrap.js crashed entirely
        (a malformed FILES entry from this same session's own earlier
        liminal-space migration commit, missing the required 4th tuple
        element) — found by insisting on testing against real data
        instead of trusting an empty response."
      depends_on: []
      does: >
        The Map tab is now what James actually asked for from the
        start — a real, visual, clickable architecture map of NEXUS,
        not a placeholder list.

    BL19_roadmap_readability:
      status: "✓ DONE. James, from a real, live screenshot showing
        copilot's 88-phase roadmap section as one dense, unreadable
        wall of text: \"i can't even read it at all.\" Real cause:
        every phase was joined inline with only nbsp-nbsp, no real
        line breaks. Each phase now renders as its own real block-level
        row; systems with more than 12 phases show the first 12 by
        default with a real, working show-more toggle for the rest,
        verified against the actual live /api/phasemap response (217
        phases, 26 phasemaps, 20 systems — matching the screenshot
        exactly)."
      depends_on: []
      does: >
        The roadmap is now something a person can actually read, not
        just technically render.

    # ── nexus:// URL scheme + tools-per-url ─────────────────────────────
    # System: clear-glass, guardian, agent

    BL17_nexus_url_scheme:
      status: "OPEN. James: \"tools per url. nexus:// support for another
        project i have.\" Real, unscoped design question, not yet
        answered: identities.json in the mined Guardian archive already
        has a real nexusUrl field per provider (nexus://chatgpt,
        nexus://claude, etc.) but nothing in either the old archive or the
        current codebase resolves or dispatches on that scheme — grepped
        directly, zero real handlers found anywhere. Real first step
        before building: what should nexus://<x> actually DO when
        navigated to or referenced — route to a specific tool, a specific
        provider tab, a specific macro? — since \"another project\" wasn't
        named, this needs a real answer before real code, not a guessed
        one."
      depends_on: []
      does: >
        A real URL scheme NEXUS/co-pilot can resolve — the actual behavior
        depends on an open design question above.

    BL18_tools_per_url:
      status: "OPEN, likely the same real underlying mechanism as
        BL17 — url_listen/url_unlisten (already real, already wired,
        confirmed this session) already lets a real pattern trigger a real
        hook; \"tools per url\" may be exactly that, scoped and renamed, or
        may want something more specific (a real per-URL TOOL MANIFEST —
        which of the 72 registered tools are even relevant on a given
        page). Real design question, same as BL17: needs a concrete
        example of the intended behavior before this phase can move from
        OPEN to a real build."
      depends_on: [BL17_nexus_url_scheme]
      does: >
        Scopes tool availability/relevance to the current real page/URL,
        exact mechanism pending the same open design question as BL17.

    BL21_agent_mesh_real_connection:
      status: "✓ DONE (core connection) — commit 1ebf845. Confirmed the
        real bug directly: btn-mesh's old handler called driver.exec
        ({action:'eval', code:'null'}) and unconditionally printed the
        same static hint every click — the exact, confirmed source of
        the repeated 'Agent Mesh — use Co-pilot to spawn agents...'
        spam visible in several of James's own real screenshots.
        Corrected the file location from the original guess (it's
        copilot/lib/self-model.js, not lib/self-model.js) before
        building anything. getCurrentAgent()/switchAgent() were both
        already real, already used internally, but genuinely
        unreachable by any external process — built the missing HTTP
        surface (GET /api/agent/current, POST /api/agent/switch on
        copilot/server.js) and a real client panel. Caught and fixed a
        real, own mistake mid-build: the first edit landed both new
        routes inside an unrelated existing wrapper by mistake, found
        by testing live (both returned 'Not found'), not assumed
        correct from the diff. Verified end to end against the actual
        running server — real current-agent state, a real switch
        firing the full real governance chain (constitutional check,
        intent classification, fault history). Still genuinely
        separate, not folded in: the 'New Agent Window' UUID-per-window
        picker — that consolidation is BL27's real scope, not this
        phase's."
      depends_on: []
      does: >
        Agent Mesh stops being cosmetic and becomes the real, single
        place to see and switch which agent co-pilot and a given
        window are using.

    BL22_rewind_timeline_ui:
      status: "OPEN. James: \"rewind engine needs an upgrade, have a
        timeline not a list.\" The real, working backend
        (cg.rewind.list/snapshot/restore/clear, confirmed real and
        already SSE-wired — es.addEventListener('rewind.snapshotted',
        ...) already triggers a live refresh) is not in question here;
        this is a real, scoped UI-only phase — the current rendering is
        a flat list, needs a real, chronological, visual timeline
        (positioned by real snapshot timestamp, not just row order)."
      depends_on: []
      does: >
        Makes real, existing rewind data easier to navigate and
        understand at a glance, no backend change needed.

    BL23_ncp_providers_start_verification:
      status: "OPEN. James: \"ncp providers does nothing, maybe a
        deploy tool for guardian or co-pilot?\" Checked the real,
        client-side code directly before assuming broken: the Start
        button in clear-glass/renderer/browser.js's loadProviders() is
        genuinely wired to a real IPC call (cg.providers.start(p.id,
        {show:true})), not a stub — this is NOT the same class of bug
        as Agent Mesh (BL21), which was genuinely fake. What's honestly
        unverified from here: whether the real backend
        (providerHost.start(), presumably) actually succeeds when
        called — that needs a live test on James's own machine, not
        assumed either way. If it turns out the backend genuinely
        fails or behaves unexpectedly, James's own idea (a real deploy
        tool specifically for guardian/co-pilot, rather than the
        generic multi-provider Start) is worth real design
        consideration at that point, not before."
      depends_on: []
      does: >
        Either confirms this already works and needs no code change, or
        finds and fixes a real, specific backend bug — not guessed
        blind.

    BL24_userscript_suite_enterprise_grade:
      status: "✓ DONE — commit fab951e. Real, existing foundation
        confirmed first: the Userscripts panel and UserscriptManager
        (list/create/edit/toggle/delete, real, not fake) already
        existed. Real, new work, checked against the original 3-item
        scope: (1) config — real, deliberate design choice worth
        stating plainly rather than silently claiming the originally-
        envisioned separate config.js: the new key
        (disableUserscriptAutoInjectOnStartup) went into the already-
        real, shared NexusOptions store (clear-glass/src/options/
        store.js) instead, since userscript startup behavior is
        inherently tied to that same store's other real startup
        config (autoStartOnBoot, backgroundTabDefaults) — one real
        config surface for this whole area, not a second, parallel
        one. (2) DONE — lib/agent-tools/tools/clear-glass/
        userscripts.js, a real agent tool (list/enable/disable),
        closing the same real cross-process gap dom-archaeology.js
        already established a pattern for. (3) DONE — ProviderHost.
        isStartupBoot, a real, explicit flag set only during
        autoBootAll()'s own real boot window (cleared in a finally
        block, confirmed not to get stuck true on a mid-loop
        failure), checked in the real nav.loaded handler alongside
        the new config key. Verified what's testable from this
        sandbox: the exact new conditional logic against all 4 real
        cases including confirming the real default preserves the
        exact original, unconditional behavior; the constructor's
        real flag initialization; and all 3 real error paths for the
        new agent tool, through the full, real tool registry.
        autoBootAll()'s actual real window-creation flow needs a live
        Electron environment this sandbox doesn't have — honestly
        named as untested, not claimed."
      depends_on: []
      does: >
        Turns a real but basic userscript panel into a real, complete,
        configurable, agent-controllable subsystem.

    BL25_nexus_options_config:
      status: "IN PROGRESS — real backend done, adopted from a parallel
        session's export (commit d089b3a). clear-glass/src/options/
        store.js now has a real, working config surface: autoStartOnBoot
        (per-provider), backgroundTabDefaults, and the real accounts
        system (see BL26). A real, genuine bug was found and fixed in
        the same pass — the old shallow merge in set() silently wiped
        sibling keys on any partial nested update (set({autoStartOnBoot:
        {claude:false}}) used to delete chatgpt/gemini/perplexity
        entirely, not just leave them alone). Verified: 10/10 real tests
        passing (tests/modules/nexus-options-autoboot.test.js). Still
        genuinely open: the actual ☰ Nexus Options UI (btn-options) —
        not yet checked or built to surface any of this real backend to
        a person, matching James's own explicit 'backend first, ui
        after' ordering."
      depends_on: []
      does: >
        A real, working config store now exists; what's left is
        building the real UI on top of it, not more backend design.

    BL26_account_agent_window_uuid_linking:
      status: "✓ DONE (backend) — adopted from a parallel session's
        export (commit d089b3a), verified deeply before trusting it.
        clear-glass/src/options/store.js: real account CRUD
        (createAccount/updateAccount/deleteAccount/linkAgent/
        unlinkAgent/resolveDefaultAccountForAgent), keyed by a real,
        stable uuid, each account linkable to one or more agentKeys.
        clear-glass/src/mesh/agent-mesh.js: every real call site that
        used to hardcode accountId:'default' (the exact, real gap
        already named as open earlier this session) now resolves
        through the real account system when one is wired in, with
        genuine backward compatibility confirmed via a full diff (falls
        back to the old literal if no accounts store is passed, not a
        breaking change for any other real caller). Found and fixed the
        one real piece missing to make this actually run: clear-glass/
        src/main/index.js was still constructing AgentMesh without the
        real accounts store wired in at all — one-line fix, confirmed
        nexusOptions is genuinely already in scope well before that
        line. Verified: 12/12 real tests passing (tests/modules/clear-
        glass-accounts.test.js) — caught a real 4-test failure on the
        first run, before the agent-mesh.js fix was adopted, traced it
        rather than papered over it."
      depends_on: []
      does: >
        'This window, on this account, is talking to this agent' is now
        a real, queryable, persisted fact — not an inference, and not a
        hardcoded literal.

    BL27_agent_suite_consolidation:
      status: "✓ DONE, via a real, honest cross-reference found late —
        this exact request ('consolidate the agent features... intent,
        hats, model, full config, accounts') was independently re-scoped
        and built as SBP7-12 (docs/2026-08-28-self-building-pipeline-
        phasemap.spec, all 6 phases DONE) without ever checking this
        older phase first — the same idea tracked twice under two names,
        found only when explicitly asked to review 'agent phases' as a
        whole. Real, concrete duplication THIS caused, not just tracking
        overlap: SBP12 built a new GET /agent-suite on clear-glass/src/
        ipc/bridge.js without checking that copilot/server.js already
        had a real, live GET /api/agent/suite (self-model.js's
        getCurrentAgent() + hat-forge's list()) — TWO real endpoints on
        two different ports/processes now do overlapping work, neither
        a strict superset of the other (copilot's has the actually-
        active agent; clear-glass's has listeners/accounts/mesh state).
        NOT merged in this pass — a live two-process endpoint merge
        deserves its own dedicated, careful pass, not a rushed one
        added to an already-long session."
      depends_on: [BL21_agent_mesh_real_connection, BL26_account_agent_window_uuid_linking]
      does: >
        The real work is done (SBP7-12); the real, honest remaining item
        is reconciling the two now-overlapping endpoints this same gap
        produced when tracked twice.

    BL28_background_tabs_setting:
      status: "IN PROGRESS — real backend primitive done (commit
        b93c0b3): ProviderHost already had real show(providerId)/
        hide(providerId); exposed via 2 new HTTP routes on clear-
        glass's wire server plus a real agent tool
        (clear_glass_tab_visibility) — confirmed working through the
        full tool registry (3/3 real error paths correct). Genuinely
        still open: the real backgroundTabDefaults.openInBackground
        config value (adopted in BL25/26's work) still has zero real
        consumers anywhere in the codebase, confirmed via a direct
        grep — nothing reads it yet, since its intended real consumer
        (BL29's context-menu default) doesn't exist. And the actual
        real Settings UI surface James asked for ('in the settings')
        is still entirely unbuilt — this phase has real backend
        capability now, not a real settings panel yet."
      depends_on: [BL24_userscript_suite_enterprise_grade]
      does: >
        The real capability (move a tab to/from background) now
        exists and is agent-callable; a real settings UI to expose it
        to a person is the remaining, genuinely open work.

    BL29_tab_context_menu_move_to_background:
      status: "IN PROGRESS — real backend primitive done (commit
        b93c0b3, shared with BL28 — same real action, same real
        routes/tool). Genuinely still open, exactly as originally
        scoped: clear-glass/renderer/browser.js's real tab-rendering
        code still has no oncontextmenu handling at all — the actual
        right-click menu itself is real, new UI work, not yet built.
        When it is, it should call the already-real, already-tested
        /provider/move-to-background route directly (same process,
        no need to go through the agent-tool's HTTP round-trip) rather
        than duplicate the show/hide logic."
      depends_on: []
      does: >
        A real, working right-click action on tabs that doesn't exist
        at all right now — the backend it would call is now ready.

    # ── System-as-block canvas — James: "zoom out. each system has as
    #    much calltos() to make them dynamic... we could use architect
    #    as a system map, as a block based canvas and swap them out." ──

    BL30_registry_components_drift_audit:
      status: "OPEN — real, scoped prerequisite, found while discussing
        BL31 below, not assumed. Checked directly: every one of the 13
        real systems already has its own registry-components.js
        (cortex/idearium/guardian/loom/ollama/intelligence/eravos/
        clear-glass/emerge/architect/copilot/bridge/nexus-healer — this
        is not a gap, it already exists universally). But clear-glass's
        own copy is badly stale: 32 declared components, zero mention
        of guardian-listeners, the real Callto Index, download
        listeners, site-settings, history, extensions, bookmarks-with-
        state, rewind, passwords, or speech-to-text — an entire
        session's worth of real, committed, tested capability this
        phasemap itself documents, invisible to clear-glass's own
        contract. Same drift risk almost certainly applies to other
        systems' registries; only clear-glass was checked directly this
        pass. copilot's real capabilities-listing (this session, commit
        5f8a34d) reads straight from registry-components.js — a stale
        registry doesn't just mis-describe the system to a human, it
        actively lies to co-pilot when asked what a system can do."
      depends_on: []
      does: >
        Every system's registry-components.js becomes trustworthy
        again — the real prerequisite for BL31's canvas to render
        anything true, and for co-pilot's own tool-listing (already
        real for copilot itself) to extend honestly to other systems.

    BL31_architect_block_canvas_component_swap:
      status: "OPEN — large, genuinely two-part. James's own framing:
        'each system has as much calltos() to make them dynamic...
        component, updating... use architect as a system map, as a
        block based canvas and swap them out.' Real prior art already
        exists and this builds forward from it, not from nothing: BL20
        (done, this same file) already turned loom's Map tab into a
        real, clickable SVG graph — systems as blocks, real wires from
        /api/graph's hook-level data, click-to-open-detail. That's the
        VIEW half. This phase is the EDIT half: Architect (real UI at
        /ui/spec-builder, real spec-blueprint engine, real SNR quality
        gate already there) becomes a canvas where a block can be
        swapped for another real, registry-declared component, using
        each system's registry-components.js entries (grammar/route/
        hooks.in/hooks.out — already shaped like a callto for
        system-to-system wiring, discussed directly with James this
        session) as the uniform plug interface every block exposes.

        Two real, unresolved design questions named honestly rather
        than hand-waved, both needing real answers before this is
        buildable, not just UI work:
          (1) what does 'swap' mean at runtime — hot-restarting a
              process with a different config, rewiring a hook's
              wires_to target to point at a different real component,
              or something else? Each has different real blast-radius
              and rollback needs.
          (2) a swap changes real, running system topology — needs a
              real dry-run/preview step (leaning on Architect's
              existing SNR quality gate, which already exists for
              exactly this kind of validation) before anything live is
              touched, not a blind drag-and-drop that mutates a running
              NEXUS instance.
        Not scoped further than this until BL30 lands — building a
        canvas that reads from known-stale registries would render a
        map of the system that's already wrong on day one."
      depends_on: [BL30_registry_components_drift_audit]
      does: >
        The real next step past BL20's read-only map — Architect
        becomes the place a person can see NEXUS as swappable,
        callto-shaped blocks and change what's wired to what, with the
        same real evidence-grounded rigor this whole phasemap already
        holds every other phase to.

