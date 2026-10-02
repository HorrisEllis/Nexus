spec:
  meta:
    name:    2026-08-27-event-taxonomy-and-brainstorm
    version: 0.1.0-phasemap
    status: >-
      PHASEMAP 2026-08-27. Two things captured here: (1) a real,
      scoped plan for a per-system event taxonomy, sequenced from
      the ACTUAL current fragmentation (guardian: 6 bus events, all
      under one ncp.* prefix, confirmed by grep; clear-glass: 36
      files independently calling emit/broadcast/SSE with no shared
      registry, confirmed by grep; no cross-system vocabulary
      anywhere) — not a hypothetical gap. (2) the rest of James's
      2026-08-27 architecture brainstorm, phasemapped rather than
      left to evaporate in a chat. Where an idea in the brainstorm
      already has a real phase ID elsewhere in loom (checked via
      loom/scanners/phasemap-map.js's real loadAll(), not assumed),
      it is CROSS-REFERENCED below, never duplicated as a new phase.
    uuid:    nexus-2026-0827-event-taxonomy-brainstorm-phasemap-v1-0000-001
    intent: >
      James: "yes but it needs to be in each respectable system. I want
      you to save the brainstorm to phases." The event taxonomy is
      DISTRIBUTED — each system owns and writes its own event vocabulary
      (same shape as the ollama/config.js + intelligence/config.js
      precedent: one shared PATTERN, not one shared FILE), because a
      single central taxonomy module would make cortex or loom the write
      authority for another system's events, which breaks the same
      decoupling principle guardian's registerStateProvider already
      respects for state. Cortex/loom stay on the READ side only, the way
      loom/scanners/phasemap-map.js already aggregates every system's own
      docs/*.spec without owning any of them — this phasemap reuses that
      exact aggregation pattern for events instead of phases.

  phases:

    # ── Event taxonomy: per-system, one shared pattern ──────────────────
    # System: guardian, clear-glass, orchestrator, loom

    ET1_event_taxonomy_pattern:
      status: "OPEN — defines the SHAPE every system's own event-taxonomy.js
        follows, not a shared implementation. Same precedent as
        ollama/config.js / intelligence/config.js: named constants,
        env-overridable where relevant, one sole write authority per
        table — same shape cortex/self-heal/fault-taxonomy.js already
        proves out for fault classes. Each system's file exports a frozen
        map of {eventClass: {description, payloadShape, severity}} and
        nothing else — no cross-system imports, so guardian's taxonomy
        file has zero dependency on clear-glass's or vice versa."
      depends_on: []
      does: >
        The convention every phase below builds against. Without this
        landing first, ET2/ET3/ET4 would each invent their own shape and
        ET5's aggregation would have three formats to reconcile instead
        of one.

    ET2_guardian_event_taxonomy:
      status: "OPEN — guardian/event-taxonomy.js. Real current vocabulary
        confirmed by grep: ncp.client.connected, ncp.client.disconnected,
        ncp.client.stale, ncp.message.received, ncp.stream.chunk (5 of the
        6 found; guardian's own writer, not renamed). Missing classes to
        add, named directly from real gaps found this session and last:
        job.created, job.dispatched, job.acked, job.completed, job.failed
        (guardian/server.js already logs all of these as free-text
        console lines — see 'guardian] job created', 'dispatched',
        'job.dispatched ack' in the real boot log — this phase just gives
        them governed names), and gate.checked / gate.failed for the
        sigma work in ET6."
      depends_on: [ET1_event_taxonomy_pattern]
      does: >
        Guardian's job lifecycle and NCP connection state become a real,
        queryable vocabulary instead of console-line prose — directly
        useful for diagnosing the listAgents()-class bug just fixed,
        since 'chatgpt NCP connected' and 'chatgpt job dispatched' would
        both be governed events instead of two different ad-hoc strings.

    ET3_clearglass_event_taxonomy:
      status: "OPEN — clear-glass/src/event-taxonomy.js. 36 files under
        clear-glass/src currently call emit/broadcast/SSE-send
        independently (confirmed by grep across clear-glass/src, not
        estimated). Scope this phase to the highest-traffic real
        subsystems first, not all 36 at once: providers/host.js (provider
        boot / userscript injection — already the majority of clear-glass
        log volume in the real boot log), diagnostic/error-capture.js
        (main-process + renderer error capture, already real and running),
        and plugins/* (userscript errors — the exact 'I need to know if
        there is any errors' ask). Remaining files migrate incrementally,
        not blocked on this phase."
      depends_on: [ET1_event_taxonomy_pattern]
      does: >
        The userscript-error visibility James asked for directly ('Maybe
        clearglass has toasts for userscript errors... I need to know if
        there is any errors') becomes buildable once these three
        subsystems emit governed event classes instead of free-text
        console/SSE lines.

    ET4_orchestrator_autopilot_event_taxonomy:
      status: "OPEN — orchestrator/event-taxonomy.js. Boot/supervision
        events are already effectively named ad hoc in autopilot.js and
        orchestrator.js's own log lines (confirmed real: 'phase gate
        passed', 'stable for 60s — backoff reset', 'watchdog: X → OFFLINE'
        /'→ ONLINE', contract.verified / contract.unreachable, spec-drift
        gaps) — this phase formalizes the ones already flowing through
        real code paths (gap.found and resource.pressure already exist as
        real bus events, confirmed by grep) rather than inventing new
        ones."
      depends_on: [ET1_event_taxonomy_pattern]
      does: >
        Boot-phase health and drift already have real signal (spec-drift
        found 19 open gaps in the last real boot); this phase makes that
        signal queryable by class instead of only readable as scrollback.

    ET5_loom_event_taxonomy_map:
      status: "OPEN — loom/scanners/event-taxonomy-map.js. Mirrors
        loom/scanners/phasemap-map.js's REAL, existing pattern exactly:
        that scanner already aggregates every system's own
        docs/*.spec without owning any of them (loadAll() reads, tags by
        system, never writes). This phase does the identical thing for
        each system's event-taxonomy.js instead of phasemap specs — one
        read-only, queryable index of every governed event class across
        every system, with zero write authority over any of them."
      depends_on: [ET2_guardian_event_taxonomy, ET3_clearglass_event_taxonomy, ET4_orchestrator_autopilot_event_taxonomy]
      does: >
        Answers 'what event types exist system-wide' from one place —
        the exact 'granularity and visibility' James asked for — without
        making loom or cortex the write authority for any other system's
        events, which would violate the same decoupling principle
        guardian's registerStateProvider already respects for state.

    ET6_sigma_gates_on_taxonomy:
      status: "OPEN — the 'Sigma system' from the brainstorm: gated
        interactions checked against expected event types, learned
        runtime, toast per gate failure, retry logic. Explicitly
        sequenced AFTER ET5 rather than attempted first, because a gate
        that checks 'is this the expected event type' needs a real,
        governed vocabulary to check against — building this before ET5
        would mean hardcoding the exact ad-hoc strings ET1-5 exist to
        replace."
      depends_on: [ET5_loom_event_taxonomy_map]
      does: >
        The toast-per-gate / retry-logic / 'everything fails loudly' ask
        becomes real once there's a real vocabulary of expected vs.
        unexpected event types to gate against, instead of guessing at
        shape from free-text log lines.

    # ── Already tracked elsewhere in loom — NOT duplicated here ─────────
    # Checked directly against loom/scanners/phasemap-map.js's real
    # loadAll() output before writing this section, not assumed. This
    # block is deliberately NOT phase-shaped (no ID matching loom's
    # PHASE_RE) — it must never be counted as a phase of its own, only
    # read as prose cross-referencing real phase IDs that live elsewhere.
    #
    # guardian/userscript link fix -> GA3_guardian_userscript_capability_wiring (IN-PROGRESS)
    # Guardian/ClearGlass merge question -> GA1_guardian_nexus_reconciliation (PENDING)
    # Userscript expansion -> GA7_clear_glass_guardian_userscript_expansion (PENDING)
    # "Add every agent tool to the listener" -> TX16_persistent_listener_registry_and_callable_elements (PENDING)
    # Provider connection verification (relevant to the listAgents() bug just fixed) -> BL23_ncp_providers_start_verification (PENDING)
    # Living per-system model -> SS1_system_manifest (PENDING)
    # Per-system config, UUID-mapped -> SS2_config_per_system (PENDING)
    # Component catalog + stub/wip/release status -> TX10_component_registry_discipline (PENDING)
    # Element picker / DOM archaeology hook -> BL4_port_element_picker_ux (PENDING)
    # Component registry already exists in cortex -> BL13_cortex_component_registry_move (DONE)

    # ── Genuinely new, not tracked anywhere else ─────────────────────────

    BR1_callto_component_hotswap_catalog:
      status: "OPEN — 'hey nexus, enable ssh for guardian' triggering a
        component catalog swap/build. Genuinely new, not covered by
        TX10's registry-discipline work, but explicitly the most
        expensive item in the whole brainstorm and dependent on TX10
        actually landing first (a hotswap catalog needs real dependency
        data per component, which TX10 is the phase that produces).
        Recommendation discussed directly with James: shelve, don't drop —
        sequence after TX10, not before."
      depends_on: [TX10_component_registry_discipline]
      does: >
        The token-savings case James made for this is real, but the
        dependency ordering means attempting it now would mean building
        on registry data that doesn't exist yet.

    BR2_ollama_output_folder_listener:
      status: "OPEN — small, independent. ollama gets an output folder for
        generated code; a listener captures each file as it's written and
        renames it per a pre-generated file-tree/checklist, rather than
        leaving Ollama's raw output names as-is."
      depends_on: []
      does: >
        Small, real, does not block or get blocked by anything above —
        safe to pick up independently whenever convenient.

    # ── 2026-08-27 (cont.) — account IDs + erosmancer-as-plugin ──────────
    # Not investigated deeply — budget-limited session, mapped not built.

    BR3_account_registry_userscript_hook:
      status: "OPEN — lib/account-registry.js EXISTS but is a confirmed
        dangling-hook (zero live callers anywhere in the tree, found
        during this session's gap review). James wants each agent account
        to carry a real ID that userscripts hook into, enabling dynamic
        rotation for retry logic, token-limit handling, intent routing,
        and erosmancer dispatch. account-registry.js is the real
        foundation to wire this onto — not new infrastructure, a missing
        connection to something that already exists."
      depends_on: []
      does: >
        Turns account identity from a dead file into the real rotation
        key every provider userscript needs for retry/token-limit/intent
        decisions.

    BR4_erosmancer_as_clearglass_plugin:
      status: "OPEN — confirmed real, current state before proposing
        anything: erosmancer-os is its OWN separate system today (real
        API contract at erosmancer-os/src/api/server.ts's /api/execute),
        wired to ClearGlass as a sibling service over a dedicated port
        (EROS_PORT/7432, clear-glass/src/main/index.js), registered with
        the orchestrator under its own systemId — not a ClearGlass plugin
        the way adblocker/zoom/guardian-listeners are (clear-glass/src/
        plugins/). Converting it into a real plugin is a genuine
        restructure of how it's loaded and wired, not a rename."
      depends_on: [TX14_plugin_system_v1_build]
      does: >
        Sequenced under TX14 (already IN-PROGRESS, covers ClearGlass's
        plugin architecture directly) rather than as separate new work —
        erosmancer becoming a plugin is exactly the kind of thing that
        phase exists to standardize.

    BR9_theme_consolidation_to_nexus_dark:
      status: "OPEN — real finding from reviewing James's earlier NEXUS
        lineage (v0.53/0.54) for salvageable design work. ui/themes/
        nexus-dark.css is a real, MORE principled unified theme than that
        older lineage's own (animated HSL accent, explicit single-source-
        of-truth philosophy, stated directly in its own header: 'Import
        this in any UI... No hardcoded colors anywhere else') — but only
        3 of 12+ real UI surfaces (grepped directly: ui/bridge, ui/cortex,
        ui/diagnostics, ui/emerge, ui/eravos, ui/forge-shell, ui/guardian,
        ui/ledger-viewer, ui/orchestrator, clear-glass/renderer/
        settings.html, and more) actually import it. Each of the rest
        defines its own separate, competing :root block with different
        variable names for the same concepts (--void/--surface/--panel
        vs --bg/--bg2/--bg3 vs this file's own --void/--ink/--plate) —
        the same 'real correct thing exists, nothing uses it' pattern
        found repeatedly elsewhere this session, just in CSS instead of
        code. One salvage already applied directly (not blocked on this
        phase): --font-display: 'Bebas Neue' added to nexus-dark.css,
        the one genuinely distinct typographic identity piece worth
        keeping from that older lineage."
      depends_on: []
      does: >
        The actual highest-leverage move from mining the old NEXUS for
        design material — not porting its CSS, but noticing the CURRENT
        system already solved this better and isn't using its own
        solution. Migrating the 9+ un-adopted UI files to reference
        nexus-dark.css's real variables (rather than each maintaining
        its own drifted copy) is real, mechanical, and genuinely too
        large to do blind in the same pass as finding it.

    BR5_build_contract_per_agent_per_intent:
      status: "OPEN — James: 'build contract per agent, per intent.' Real
        precedent confirmed, not starting from nothing: lib/seam/
        build-contract.js already builds/chunks contracts (createSeamStream
        factory); lib/agent-router.js's AGENT_CONSTRAINTS already carries
        real per-agent limits (token sizing etc.) consulted at routing
        time. Neither currently produces a contract SHAPED by which agent
        will execute it and what the intent actually needs — chunking and
        agent-selection are two separate, unconnected mechanisms today.
        This phase is the real gap: a contract schema keyed on
        (agent, intent) that pulls the right AGENT_CONSTRAINTS profile
        into the seam chunker's own build path, instead of chunking
        generically and hoping it fits whichever agent RAID picks
        afterward."
      depends_on: []
      does: >
        The actual missing link between 'map it, chunk it, contract it,
        send through RAID' (James's own stated build pipeline from this
        session's brainstorm) and the two real mechanisms that already
        exist to do the chunking and the per-agent limits separately.

    # ── 2026-08-28 — co-pilot as agent chat, guardian sweep, full CG parity ──

    BR6_copilot_as_agent_chat_model:
      status: "OPEN — James: 'can we get co-pilot working with guardian,
        like how ui/agents/chatgpt/index.html is. It uses the agent chat
        as the co-pilot, logging the chat, and building the model.'
        Confirmed real, not assumed: ui/agents/chatgpt/index.html's
        pattern uses a live provider-tab conversation AS the interaction
        surface, with every turn logged and feeding back into a model.
        Co-pilot today is a separate, stateless-per-request dispatch path
        (copilot/server.js -> lifeline.js -> bridge/router.js), not a
        logged, ongoing agent conversation. Making co-pilot work this way
        is a real architectural shift, not a bugfix — it needs its own
        session with headroom, not a rushed pass at the tail of this one.
        Directly connected to lib/user-model.js (already real, already
        running) as the natural place the logged chat would feed."
      depends_on: [ET5_loom_event_taxonomy_map]
      does: >
        Sequenced after ET5 because a logged, model-building agent chat
        needs a real, governed event vocabulary to log AGAINST — logging
        raw ad-hoc strings the way co-pilot's dispatch layer does today
        would just move the fragmentation problem into the chat log
        instead of solving it.

    BR7_guardian_dispatch_connectivity_sweep:
      status: "OPEN — James: 'make sure the agent tools that connect to
        guardian are actually connected and updated.' Real pattern found
        THREE independent times in this one session, not once:
        lib/agent-chat.js's listAgents(), and TWO separate checks inside
        copilot/lifeline.js's _tryGuardian — all three independently
        misread guardian's real GET /providers shape (a flat map of
        provider name -> STRING status, not {name:{connected:bool}}
        objects) and all three silently, unconditionally failed as a
        result. Given the same exact bug was written independently three
        times, a systematic grep-and-check sweep of every remaining
        agent-tool/lib file that calls guardian's /providers or dispatch
        endpoints is very likely to find more, not a hypothetical
        precaution."
      depends_on: []
      does: >
        Directly answers 'is the whole thing actually wired correctly'
        instead of waiting for each broken call site to surface one
        screenshot at a time, the way all three this session did.

    BR8_clearglass_full_agent_tool_parity:
      status: "OPEN — James: 'clear-glass needs commands for all the new
        features, tools for co-pilot and agents.' Real, current gap:
        bookmarks/save-state (this session's own commit), accounts
        (options/store.js, fully wired backend, zero UI or agent-tool
        consumers per the other transcript's TX1 finding), and rewind
        snapshots all have real backends today but no complete, matching
        set of agent-tools/CLI commands the way macro.js/userscripts.js
        already provide for macros and userscripts specifically."
      depends_on: [TX16_persistent_listener_registry_and_callable_elements]
      does: >
        The concrete form of 'ClearGlass completely available to co-pilot
        and agents' — sequenced under TX16 because a registry of callable
        elements is the real mechanism this needs, not a one-off tool
        file per feature that TX16 would otherwise duplicate.

    SS3_unified_living_model_system_plus_person:
      status: "OPEN — James: 'what about the dynamic, living models that
        update with the system?' Two real, separately-running pieces
        confirmed, not proposed: lib/user-model.js (real, running —
        models the PERSON, confidence-scored hypotheses with decay) and
        SS1_system_manifest (PENDING — would model each SYSTEM: file
        structure, live commands, components, changelog, pending/agenda).
        Nothing today connects them into one place a living model of
        'the system as James actually uses it' could live — each was
        built to solve a different, narrower problem."
      depends_on: [SS1_system_manifest]
      does: >
        Real answer to the standing question, not new infrastructure:
        once SS1 exists, this is the phase that decides whether
        system-manifests and user-model hypotheses should share a
        query surface, or stay separate on purpose because they answer
        genuinely different questions (what a system IS vs. what James
        wants from it).
