spec:
  meta:
    name:    clearglass-agent-suite-and-cfr-loom
    roadmap: 'later — later (declutter 2026-10-09, James: "okay")'
    version: 0.1.0-phasemap
    status:  PHASEMAP 2026-08-17. Mapped, not all built. Compiled from a
             parallel live session's real transcript (working directly
             against the running system, tool errors and all — honestly
             reported where that session couldn't finish a check) plus two
             new asks from this message. Every phase checked against real
             code in this checkout before being marked done/partial/open,
             same discipline as copilot-guardian-cos-expansion-phasemap.
    uuid:    nexus-cga-cfr-phasemap-v1-0000-2026-0817-001
    intent: >
      Two real, distinct threads: (1) making clear-glass's provider tabs a
      genuine multi-agent surface — named accounts, hats, intent routing,
      and eventually a full tool loop so a person can work FROM inside a
      claude.ai/chatgpt.com tab instead of switching context to a separate
      chat; (2) giving loom real diagnostic depth and a real visual face,
      both built on CFR (Constraint Field Runtime) — reusing an existing,
      working precedent (eravos's canvas-cfr.js) rather than starting from
      nothing, matching the reference images' own framing (raw graph state
      -> fields -> SNR gates -> constraints -> solver -> render).

  major_finding: >
    The parallel session's own transcript is unusually rigorous about NOT
    fabricating status when its tools failed ("My sandbox tools are erroring
    out right now — not going to fake a read on snapshot.js") — that
    discipline is preserved here rather than silently filled in. Where that
    session couldn't check something live, this phasemap either checks it
    now (this session's tools were responsive) or states plainly that it's
    still unchecked. Two real precedents found in THIS pass that change the
    shape of what's actually needed: clear-glass/renderer/browser.js already
    has a real switchTo(id) tab-switch function (the launcher isn't new
    mechanism), and eravos/ui/runtime/canvas-cfr.js is a real, working
    192-line WebGL canvas already rendering CFR state visually (the loom-3D
    ask is an adaptation, not a from-scratch build).

  phases:

    TX1_clearglass_agent_suite_composition:
      priority: "HIGH — real, load-bearing gap: three real modules, zero wiring between them and clear-glass."
      status: "PARTIAL, the endpoint duplication FIXED, TX1's own
        original two open items still open. clear-glass's GET
        /agent-suite now composes copilot's real GET /api/agent/current
        via a real, dedicated HTTP call (fails soft to current:null if
        copilot's unreachable, never throws) — the one piece it was
        genuinely missing, without deleting copilot's own endpoint
        (which has its own real callers this session didn't trace, and
        doesn't need clear-glass's listener/account data). hf.list()
        stays a local, in-process call on both sides — correctly
        shared, no network hop added for data that's already free.
        Verified end-to-end both ways: real composition when copilot
        answers, real fail-soft (current:null, rest of the endpoint
        still 200s) when it doesn't. TX1's own original two open items
        (account-registry/agent-router still genuinely unwired into
        clear-glass; the ollama/mistral account-slot schema mismatch)
        remain exactly as unresolved as before — this fix only closed
        the duplication it caused, not TX1's full original scope."
      depends_on: []
      does: >
        Compose account-registry + agent-router + hat-forge into a real
        clear-glass-side agent-suite surface, reusing the bridge.js
        cross-directory-require precedent rather than inventing a new
        wiring mechanism.
      open_items:
        - REAL SCHEMA MISMATCH, found by the parallel session, not yet
          resolved — hat-forge's VALID_BASE_AGENTS allows ollama and mistral
          as base agents; account-registry has no account slot for either.
          A hat could name a base agent with no possible account to log
          into. Needs a decision, not an assumption — extend
          account-registry's PROVIDERS to include both, or have hat-forge
          silently narrow to the four that have real accounts.
        - Entry point undecided — does "add an agent" trigger from a
          clear-glass renderer/settings action, or from a Guardian/NEXUS-
          side CLI call that clear-glass only reflects? Decides whether
          this lives in clear-glass/src/main or nexus/lib.

    TX2_sequential_event_queue:
      priority: MEDIUM
      status: "OPEN, confirmed absent by the parallel session's own grep
        (SSE/error-log/friction/interaction-contract sequential processing
        across clear-glass — zero hits) and not re-contradicted here."
      depends_on: []
      does: >
        A real queue so every SSE event, error-log entry, friction signal,
        and interaction-contract crossing gets processed one at a time,
        in order, rather than concurrently — the person's own explicit
        worry was "i dont want to break it."
      open_items:
        - Queue implementation itself — genuinely new, no existing
          primitive to extend.

    TX3_talk_to_agent_launcher:
      priority: MEDIUM — smaller than it looked, real precedent found.
      status: "PARTIAL, real precedent confirmed this pass (the parallel
        session flagged this unconfirmed due to tool errors — resolved
        here). clear-glass/renderer/browser.js has a real switchTo(id)
        function — host.js already pre-warms all four provider tabs at
        boot, each with its real userscript loaded. \"I want to talk to
        claude/chatgpt/gemini/perplexity\" is very likely a thin chat-side
        trigger calling this EXISTING switch mechanism, not a new
        open-conversation mechanism."
      depends_on: []
      does: >
        A real chat trigger (same class as the recent switch-agent/
        create-compartment triggers) that calls the existing switchTo(id)
        via its IPC path, scoped to the four real provider tabs.
      open_items:
        - The actual IPC call path from a chat trigger into
          renderer-side switchTo() — not yet traced end to end.

    TX4_provider_tab_tool_loop:
      priority: HIGH — this is the real substance behind "give you a tool to check loom/cortex/file tree/system."
      status: "SUBSTANTIALLY ANSWERED, not a new build — confirmed by
        reading the real code end to end, not assumed. copilot/tool-
        runtime.js's runViaAgent() (the real NCP loop TX4 describes)
        calls agentTools.runToolLoop() with allowedTools only set when
        a hat's toolScope narrows it — with no hat active, allowedTools
        is undefined, and runToolLoop's real getToolSchemas() offers
        every real, registered tool (only an explicit tool-config
        disable would exclude one). Checked directly whether the 4
        named categories already exist: loom_scan/loom_register
        (loom), query_recall (cortex), read_file/file_tree/
        search_files (file-tree), nexus_status (system-map) — all 4
        real, already registered, already offered by default through
        this exact path. What's genuinely still open is narrower than
        originally scoped: not 'add tools to the loop', but whether
        the real DOM round-trip (a provider tab's reply containing
        embedded tool-call JSON, parsed back out by _parseToolBlocks())
        actually works live — which is TX3's own already-flagged open
        item (the IPC path from chat trigger to renderer, not yet
        traced end to end), not a separate TX4 gap."
      depends_on: [TX3]
      does: >
        Extends the real, existing NCP tool loop (not a new one) with
        real read-only tools: loom query, cortex query, file-tree walk,
        system-map read — the same shape as the real, already-built
        file-tree/parseAny tools confirmed working elsewhere in this
        session's own test suite (T1-T009 data/** refusal, T1-T010 path
        escape refusal — those exact protections should extend here, not
        be rebuilt).
      open_items:
        - The NCP tool loop's CURRENT real tool set — not yet enumerated
          in this pass, needed before knowing exactly what to add.

    TX5_backup_snapshot_for_talk_to_agent:
      priority: LOW — already substantially answered by prior work this session.
      status: "✓ DONE — CONFIRMED REAL, no new work needed for the core ask. The
        parallel session flagged cos/foundation/snapshot.js as unopened/
        unconfirmed due to tool errors — already fully investigated
        earlier THIS session (see cos.spec, snapshot-engine module):
        SnapshotEngine.take() is real, captures compartment config + a
        file manifest (hash/path/size) + process state + event tail,
        gzipped to .nex.gz. Honest limit already documented there too:
        restore() only rewrites the compartment CONFIG, never file bytes
        — the same real limit applies here if \"backup\" is meant to
        include actual file contents, not just a state fingerprint."
      depends_on: []
      does: >
        Nothing new — the real backup mechanism the person is asking
        about already exists and was already mapped (cos.spec's
        snapshot-engine module, and the rewind-timeline / .cos-archive
        gaps already recorded there for the parts that genuinely aren't
        built yet).
      open_items: []

    TX6_stop_using_this_chat_migration:
      priority: MEDIUM — a real design decision, not a build item, correctly flagged by the parallel session as unresolvable by reading code alone.
      status: "OPEN — a real, unanswered design question, not a gap in
        the code. Does \"talk in this chat\" for Claude specifically mean:
        (a) this claude.ai conversation's context gets carried over into
        the clear-glass Claude tab as a one-time migration, or (b) the
        clear-glass Claude tab becomes a fresh, tool-equipped conversation
        going forward and this chat just stops? These are different
        builds — (a) needs a real context-transfer step, (b) doesn't."
      depends_on: [TX4]
      does: >
        Nothing to build until this is answered — recorded here so the
        question doesn't get lost, matching the parallel session's own
        instinct not to guess at it.
      open_items:
        - The person's own answer to (a) vs (b) above.

    TX7_cfr_diagnostic_for_loom:
      priority: HIGH — new ask, this message.
      status: "OPEN, genuinely new. \"Loom needs to use cfr for a
        diagnostic system.\" Checked: loom's real diagnostic capability
        today (loom/scanners/*, component-registry, phasemap-map.js) does
        NOT read from CFR at all — confirmed by grep, zero cross-reference.
        CFR itself is real and substantial (meta/cfr/, cli/cfr-debug.js,
        guardian/memory_store/cfr_state.json) — this is a real, missing
        cross-wire between two real, separately-working systems, the same
        shape as several other gaps found this session (declared-but-
        unwired, not phantom)."
      depends_on: []
      does: >
        Would have loom's diagnostic layer read CFR's real regime/
        coherence/friction/entropy state (the same real fields cos.spec's
        rewind-timeline phase and the earlier diagnostic-report.js work
        already compose from) and surface it per-component, not just
        system-wide — giving loom's own component graph a CFR-informed
        health signal it doesn't have today.
      open_items:
        - Real design work — per-component CFR scoring doesn't obviously
          exist yet even outside loom — needs checking whether CFR is
          computed at a system granularity only, or can be meaningfully
          attributed to individual components.

    TX8_3d_cfr_visual_for_loom:
      priority: MEDIUM — new ask, this message, real precedent found.
      status: "OPEN, but substantially de-risked. \"We need that 3d visual
        map for loom using cfr.\" Checked and confirmed real: eravos/ui/
        runtime/canvas-cfr.js is a genuine, working 192-line WebGL canvas
        (confirmed: real WebGL2 context creation, graceful fallback to a
        dot-grid if WebGL2 is unavailable) already rendering CFR state
        visually — for eravos, not loom. The reference images describe a
        6-layer rendering pipeline (raw graph state -> force-vector fields
        -> SNR gates -> geometric constraints -> Verlet-integration solver
        -> final render) — whether canvas-cfr.js already implements this
        full pipeline or a simpler subset was NOT checked in this pass."
      depends_on: [TX7]
      does: >
        Would adapt canvas-cfr.js's real, working WebGL approach to
        render loom's own component/wire graph instead of eravos's,
        with node state driven by CFR (via TX7's per-component signal,
        if that's how far TX7 goes) — an adaptation of real, existing
        code, not a new rendering engine.
      open_items:
        - canvas-cfr.js's real internal pipeline — not yet read past
          its WebGL setup; whether it already matches the reference
          images' 6-layer model or would need real extension is unknown.
        - Depends on TX7 for what data actually drives the visualization.

    TX9_build_contract_file_dir:
      priority: MEDIUM — new ask, this message, precisely scoped.
      status: "OPEN — precisely re-scoped, real answer found. James's
        earlier original question ('does the real path survive from
        generation to the contract, or get discarded?') is answered:
        it survives. copilot/module-builder.js's map() already sets
        plan.existingDir = existingTarget.dir (line 162, §SELF-BUILD-
        EXT), and build()'s real cq.create() call embeds the entire
        plan object into the contract's payload (payload.plan = plan)
        — confirmed by reading the actual code, not assumed. The real
        gap is one hop later, precisely located: emerge/consumer.js,
        the real contract receiver, ALWAYS computes buildDir = path.
        join(OUTPUT_ROOT, uuid) — a fresh, generic staging directory —
        and never reads contract.payload.plan.existingDir at all
        (confirmed via a direct grep, zero hits). The real completion
        signal (cq.complete('emerge', uuid, {outputDir: buildDir, ...}))
        only carries the staging location forward too, so whatever
        real 'verify then replace' consumer exists downstream (RAID,
        presumably, not yet traced) has no way to know the real final
        target unless it separately re-reads the original contract."
      depends_on: []
      does: >
        Two real, precise, connected fixes: (1) emerge/consumer.js
        reads contract.payload.plan.existingDir when present and
        threads it through — into either the staging metadata or a
        real, direct build-in-place decision, a real design choice not
        assumed here; (2) the cq.complete() signal carries existingDir
        forward too, so a downstream verify/replace step never has to
        re-derive it from the original contract.
      open_items:
        - Whether RAID's own real verify-then-replace consumer (not
          yet traced in this pass) already reads the original contract
          directly, in which case fix (2) may be unnecessary — or
          only sees the completion signal, in which case it's required.

    TX10_component_registry_discipline:
      priority: FOUNDATION — standing instruction, not a one-time build.
      status: "OPEN, real and current. The person's own explicit standing
        instruction: \"make sure you always update the components
        registry, with all the capabilities.\" Checked honestly against
        recent real work in THIS session's own history: verifyAgentReachable,
        navigateAgentToUrl, spec_wizard, and the cos.spec module content
        itself are NOT registered as loom components (grepped loom/maps/*.js
        and loom/bootstrap.js directly — zero hits for any of these names).
        This is a real, current gap in this session's own discipline, named
        honestly rather than left implicit."
      depends_on: []
      does: >
        Register the real, already-built recent work into loom's real
        component registry, matching the established pattern (loom/maps/
        session-2026-08-14-map.js from earlier this session is the exact
        precedent to reuse, not a new registration mechanism) — and treat
        this as an ongoing per-session step going forward, not a one-time
        catch-up.
      open_items:
        - The actual registration commit for this session's real work —
          not yet done as of this phasemap being written; a real, small,
          immediately-actionable follow-up.

  # §NEXT — deliberately left open, not filled with invented detail:
  #   - TX1's account-registry/hat-forge mismatch needs the person's own
  #     decision before any wiring code gets written.
  #   - TX4's NCP tool loop's current real tool set needs enumerating
  #     before knowing exactly what loom/cortex/file-tree/system tools
  #     to add.
  #   - TX6 needs the person's own answer on context-transfer vs
  #     fresh-start before any migration code gets written.
  #   - TX8 needs canvas-cfr.js read in full to know how much of the
  #     reference images' 6-layer pipeline already exists.

    TX11_plugin_architecture_decision:
      priority: "HIGH — the document's own real fork in the road."
      status: "✓ DONE — decided: option 3, a genuine first-class
        plugin system. James: \"build a first-class plugin system.\" Real
        design doc written before any code: docs/CLEAR-GLASS-PLUGIN-
        SYSTEM-DESIGN-2026-08-23.md — every architectural choice traced
        to a real, already-proven pattern in this codebase (manifest/
        lifecycle modeled on UserscriptManager's real, working shape;
        permission checks reuse lib/tool-config.js's exact, already-
        proven {allow,reason,needsConfirm} check every real tool call
        already goes through; the plugin API surface reuses the real,
        proven cross-process HTTP-bridge pattern dom-archaeology.js/
        userscripts.js/tab-visibility.js/provider-deploy.js already
        established, not a new mechanism). One real, honest, stated
        limit: plugins run in-process (matching TX1's own real
        copilot/bridge.js precedent), so the permission check is a real,
        enforced convention, not a hard process boundary — named
        plainly, not glossed over."
      depends_on: []
      does: >
        Determines whether TX13's whole backlog gets built once, as
        real, updatable plugins, or piece by piece as permanent core
        code — the single highest-leverage decision in this document.

    TX14_plugin_system_v1_build:
      priority: HIGH — the real, next step now that TX11 is decided.
      status: "IN PROGRESS — commit 6827c0b. The real UI/UX half is
        genuinely done: clear-glass/renderer/guardian-picker.js, a
        complete, faithful port of the confirmed v3.4.0 archive's
        pick-element + popup + zoom/nearby-chips + listener-config-
        modal workflow, CSS/HTML extracted byte-for-byte (verified via
        a zero-diff element-ID check against the source), wired into
        both real entry points that can start a picker. Real, live
        event routing works (guardian.* events get their own real SSE
        names, not collapsed into generic dom.mutations). §HONEST LIMIT
        — this is the workflow James asked to rebuild, not yet the
        plugin system itself: the actual plugin loader (manifest
        validation, install/enable/disable/uninstall/reload, the real
        permission check wired to tool-config's pattern — TX14's
        original v1 scope) hasn't been started. Also still open: on-
        disk callto persistence (matching UserscriptManager's own real
        convention) and the listener modal's external-routing options
        (post to a bridge/URL, trigger another callto) — named
        honestly as not-yet-built, not silently assumed working."
      depends_on: [TX11_plugin_architecture_decision]
      does: >
        A real, working plugin loader plus the real, complete pick-
        element-and-configure-a-listener workflow, ported faithfully
        from the confirmed, converged v3.4.0 archive — not reinvented,
        not stripped down.

    TX12_bookmark_reconciliation:
      priority: MEDIUM — real capability exists twice, disconnected.
      status: "OPEN, a real design decision, not new build. Two
        genuinely separate, real, both-working mechanisms confirmed:
        cg.bookmarks (native — url/title/agentId only, zero state
        capture) and macro.js's bookmark/openBookmark (this session,
        commit cbfc057 — real cookie/storage/scroll capture via the
        rewind engine, 10 real tests passing) — but the second one is a
        macro-tool primitive, never surfaced in the browser's own
        bookmarks UI. Needs a real decision: merge into one bookmark
        concept (every bookmark captures state by default, or a real
        'with state' checkbox), or keep them deliberately separate with
        distinct UI. Not guessed at here — this is exactly the kind of
        choice this phasemap defers to the person, not a default."
      depends_on: []
      does: >
        Closes the gap between 'bookmarks' and 'bookmarks that actually
        remember you were logged in' — the real capability already
        exists, it just isn't one coherent feature yet.

    TX13_browser_chrome_backlog:
      priority: "LOW individually, but the real, complete list of
        every genuinely-empty browser-chrome feature this document
        found — kept as one entry rather than 8 near-duplicate phases,
        since none has real infrastructure to reference yet and each
        would restate the same 'zero real code, confirmed by direct
        search' finding."
      status: "OPEN. §CORRECTED 2026-08-23 — James, on the first draft
        of this phase: 'per-site settings, the app menu, passwords,
        zoom, webcam, are normal browser features.' Right, and a real
        correction to how this phase was first scoped — these are
        baseline capabilities every browser has natively, not optional,
        swappable, disable-able features a person would want as a
        plugin. Removed the TX11 dependency below — none of these need
        the plugin system, they should be built as real, native Clear
        Glass core, same as bookmarks or rewind already are. Real,
        checked-empty items, each confirmed by a direct search of the
        real tree, not assumed absent: (1) per-site/per-origin
        settings — zero storage or UI. (2) full app menu — 8 of Image
        3's 10 items (history, passwords, extensions, print, save-
        page-as, find-in-page, zoom, report-broken-site/help) have no
        real code; only Settings (#options-panel) and downloads
        (backend only, no UI) exist. 'Extensions' here specifically
        means real web-extension LOADING (a genuinely separate, much
        bigger question from the plugin system — see TX11's own §10
        option 2) — not itself a candidate for this phase's native
        scope. (3) downloads manager UI + a real download-directory
        setting — the real routing backend (download-capture.js,
        hooks Electron's will-download, announces to Guardian's
        /api/intake) already exists; the visual list and the directory
        setting do not, confirmed against NexusOptions and main/
        index.js directly. (4) passwords manager — zero, would need
        real autofill/DOM form detection this codebase has never
        built, distinct from the real but different-purpose cookie
        vault (clear-glass/seam/). (5) zoom — zero, but genuinely
        small: Electron's own webContents.setZoomFactor() is a real,
        built-in API this could wire to directly, no design question
        needed. (6) webcam/audio permission handling — zero;
        session.setPermissionRequestHandler doesn't exist in this tree
        at all (a getUserMedia request would hit Electron's
        unconfigured default) — this is real, native browser
        permission-prompt UX, not a plugin either."
      depends_on: []
      does: >
        The real, complete native browser-chrome gap list — baseline
        capability every browser needs, built as real Clear Glass core,
        not deferred behind the plugin system.

    TX15_whisper_as_a_real_optional_capability:
      priority: LOW — genuinely different from TX13's other items, split out on purpose.
      status: "OPEN. The one item from the original chrome-map document
        that ISN'T a normal browser feature — no browser ships speech-
        to-text as baseline chrome. Whisper has zero references
        anywhere in the entire codebase, not just clear-glass, and
        would need a real, new integration decision (local model vs
        API-based) before any build. Unlike TX13's items, this is a
        genuine candidate for TX14's real plugin system — an optional
        capability someone could enable, not something every browser
        needs."
      depends_on: [TX14_plugin_system_v1_build]
      does: >
        Real, optional speech-to-text — the kind of capability the
        plugin system exists for, correctly kept separate from TX13's
        native-browser-feature backlog.

    TX16_persistent_listener_registry_and_callable_elements:
      priority: "HIGH — James's own real framing: 'think how high
        leverage that would be.' The connecting piece across TX1, TX14,
        and Agent Mesh (BL21/BL27), not a standalone feature."
      status: "OPEN. James: 'could have a listener for any element on
        any page, give a option to open url on startup. then we can
        have event types. listener uuid, logs to cortex listeners
        index? so then we can use elements as callable ids, listen for
        any urls elements... this could be a tool for setting up a new
        agent to the agent mesh.' Real, current state, checked before
        scoping: TX14's real port (commit 21d4e05) gives a single,
        in-page listener a real UUID and real routing, but it's
        genuinely PAGE-SCOPED — the listener dies when the page
        navigates away or Clear Glass restarts, confirmed directly
        (activeListeners is an in-memory Map, no persistence layer
        anywhere in guardian-picker.js). James's real ask is a
        structurally different, bigger thing: (1) a real, PERSISTENT
        listener registry — configured once, survives navigation and
        restart, auto-reattaches whenever its real URL pattern loads
        again (connects directly to BL28's own real, already-open
        'open URL on startup' gap — the same real mechanism that
        opens a background tab on boot could re-attach that tab's own
        saved listeners). (2) A real, dedicated cortex 'listeners
        index' — a genuinely separate real table/store from the raw
        event log this session already wired (TX14's ledger routing),
        since a registry of 'what listeners exist and their real
        config' is a fundamentally different real query shape than 'a
        stream of things that happened.' (3) Callable elements — a
        fingerprinted element (already real, via the ported
        fingerprint()/callto system) becomes a real, stable, reusable
        ID a person or an agent can reference later without re-
        picking, matching this session's own real callto concept
        already ported, extended from 'one-shot capture' to 'a
        durable handle.' (4) The real, named end goal: 'setting up a
        new agent to the agent mesh' — concretely, 'attach a real,
        persistent listener to claude.ai's chat output, with the
        NEXUS wake-word/question criteria already built in TX14' IS a
        real, literal definition of 'onboard claude as an agent',
        connecting this phase directly to BL21/BL27's own real agent-
        mesh work. Genuinely too large to build blind in one pass —
        this status is honest about being a real scoping phase, same
        as TX1's own earlier honest gap, not yet build-ready."
      depends_on: [TX14_plugin_system_v1_build, BL21_agent_mesh_real_connection, BL28_background_tabs_setting]
      does: >
        The real, structural upgrade from 'a listener on this page,
        right now' to 'a durable, callable capability the whole system
        can reference' — the connecting piece James named directly.
