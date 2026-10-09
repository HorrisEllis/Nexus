spec:
  meta:
    name:    2026-08-22-session-full
    roadmap: 'later — one leftover phase from a past day (declutter 2026-10-09, James: "okay")'
    version: 0.1.0-phasemap
    status:  PHASEMAP 2026-08-22. Every phase below checked against the real,
             committed state of this checkout — commit hashes named directly,
             not inferred from the conversation's own claims. "done" means
             tested and committed; "in-progress" means real and working but
             not yet closing a stated open thread; "pending" means named,
             scoped, and deliberately not started.
    uuid:    nexus-2026-0822-session-phasemap-v1-0000-001
    intent: >
      One real day's work, spanning memory-leak diagnosis, a shutdown crash
      fix, a silently-broken UI panel, copilot's own tool self-awareness, a
      real self-maintenance bridge between two disconnected detectors and
      the existing gap-repair pipeline, a new standing axiom, dead-code
      removal, and a new editable per-agent memory. Captured per James's own
      "don't forget anything from today."

  phases:

    SF1_sse_reconnect_leak:
      status: "✓ DONE — commit af5c690. Two real memory leaks in ui/tv-shell/
        index.html: _uiLog had no cap (fixed to match its own sibling's
        existing 200-entry cap), and the SSE reconnect logic never closed
        the old EventSource before opening a new one under real backend
        pressure. Verified with an isolated test of the exact reconnect
        logic before shipping. Person confirmed live improvement afterward —
        Firefox's total footprint dropped roughly 10x across two Task
        Manager screenshots, staying flat as more tabs came online."
      depends_on: []
      does: >
        Stops the tv-shell dashboard tab from accumulating unbounded memory
        over a long session.

    SF2_providerhost_stopall_missing:
      status: "✓ DONE — commit a071e59. main/index.js's shutdown path called
        providerHost?.stopAll(), which never existed on the class — confirmed
        live in the person's own crash log, firing at the exact moment memory
        pressure forced a shutdown. Built by reusing stop()'s existing
        per-provider logic via Promise.allSettled, isolating one provider's
        failure from blocking the rest. Verified with a direct test: 4
        simulated providers, one made to fail, confirmed the other 3 still
        stopped."
      depends_on: []
      does: >
        Lets ClearGlass actually finish closing every provider tab on
        shutdown, instead of throwing immediately and leaving teardown
        incomplete under the exact condition (memory pressure) where clean
        teardown matters most.

    SF3_chat_history_panel_wrong_url:
      status: "✓ DONE — commit dee6b9c. A full Conversation Log panel already
        existed in tv-shell (filter, refresh, per-exchange cards) but fetched
        /api/memory instead of /api/cortex/memory — orchestrator's proxy is
        gated on the URL's cortex segment specifically, confirmed by reading
        the real routing; a bare /api/memory has no handler at all. Every
        load had silently 404'd since the panel was written."
      depends_on: []
      does: >
        The "⌂ Log" panel in tv-shell now actually shows real chat history
        instead of always reading empty.

    SF4_copilot_missing_own_tools:
      status: "✓ DONE — commit 6d6c1f1. agent_chat and tool_config were both
        fully built and registered but absent from copilot's own
        DEFAULT_CHAT_TOOLS — copilot had no way to reach for either during
        ordinary conversation. Verified the real manifest-building logic
        resolves all 8 tools with no silent drops before shipping."
      depends_on: []
      does: >
        Copilot can now actually use its own multi-agent conversation and
        governance-ratchet capabilities in normal chat, not just when
        explicitly told the tool name exists.

    SF5_wiring_gap_bridge:
      status: "✓ DONE — commit 795413b. Two real, correct, disconnected
        detectors (dangling-report.js for broken require() paths;
        component-ledger.js's _hookWarned for writes with no hook/wire, never
        exported before this) never reached anywhere actionable — both only
        ever printed to console. loom/scanners/wiring-gaps.js bridges both
        into lib/gap-field.js's report() — the same pipeline copilot's own
        autonomous-repair already watches. Found and fixed a real bug in the
        bridge itself before it shipped: gapField's dedup_key is
        domain::type::source only, so a constant source collapsed 78 distinct
        findings into 1 until each was given its own per-file source."
      depends_on: []
      does: >
        A real broken wire now becomes a real, actionable gap the same way
        any other detected problem does, instead of a console line nobody
        is necessarily watching.

    SF6_wiring_gaps_applied:
      status: "✓ DONE — commit e522ea3. Applied under axiom §8.7's own
        discipline: checked git history and real references before touching
        each file. Found and fixed a real bug in source-map.js itself
        (_archive/ was scanning as if live, though its own docblock names
        this exact file as the reason \"docs\" is excluded); moved
        cos/test.js to its documented, correct location (its own docblock
        said test/test.js) without touching any of the 44 requires that were
        already correct for that path; fixed 7 genuine wrong-prefix path
        bugs, including one real hardcoded sandbox-specific absolute path.
        Caught and reverted a real near-miss mid-fix on test-hook-ownership.js
        before it broke a file that was already correct — found the true
        cause was a separate, genuine false-positive class in the scanner's
        own regex (matches require() inside test-assertion strings, not just
        real code), named clearly rather than rushed."
      depends_on: [SF5_wiring_gap_bridge]
      does: >
        78 real wrong-path findings reduced to 6, and all 6 remaining are
        the confirmed false-positive class, not real bugs.

    SF7_axiom_8_7:
      status: "✓ DONE — commit e522ea3 (same commit as SF6, applied under its
        own new rule). Added §8.7 to docs/AXIOMS-v3.1.md, sharpening the
        existing §8.4/§8.6 into a named, concrete pre-change checklist using
        this project's own real tools — loom's component/spec/phasemap maps,
        phasemap-map's historyFor, tool_index, git log — rather than a vague
        restatement. Checked against the foundational axioms (Group 0/1,
        §16.4, §16.7, §17.3, §17.6) for conflict before adding; found none."
      depends_on: []
      does: >
        Names, for the first time, exactly what "don't go in blind" means in
        this codebase — and gives a real reason beyond ceremony: so a harmful
        change can be reverted from a real record, not just diagnosed after.

    SF8_meta_shim_cleanup:
      status: "✓ DONE — commit 25dbccb. James asked to consolidate meta/ and
        lib/meta/; checked first rather than assuming — seam/ has no root
        duplicate at all, and meta/ vs lib/meta/ was already a deliberate,
        self-documenting forwarding shim, not real duplication. Two apparent
        callers were checked directly and were comment mentions, not real
        require() calls. Confirmed zero real callers anywhere before
        removing the now-genuinely-dead shim."
      depends_on: []
      does: >
        One less piece of dead indirection; nothing real depended on it.

    SF9_account_identity_capture:
      status: "✓ DONE — commit 4ecca72. guardian/lib/ncp.js and guardian/
        server.js already destructured and persisted account/chatUrl on
        every real chat_log and artifacts insert — confirmed by reading both
        files directly — but no client had ever actually sent those fields,
        so they always landed undefined. Built the missing client half in
        guardian/userscript-nexus-wake.js (best-effort, provider-specific DOM
        selectors, honestly labeled as best-effort; sends once per session,
        not per message, matching the person's own stated \"only log what
        you don't have yet\" discipline) and the receiving endpoint (POST
        /api/account-identity). Caught two real bugs in the first draft
        before shipping — a scope error calling a closure-only helper from
        outside install(), and an export reference to a function that had
        become correctly private — verified the fix with an actual runtime
        test using a fake DOM before committing."
      depends_on: []
      does: >
        NEXUS can now know which real account is logged into a given
        provider tab, closing a real, previously-silent gap in an existing,
        already-built schema.

    SF10_agent_notes:
      status: "✓ DONE — commit 4ecca72 (tool + module), 7d66cc1 (loom wiring).
        Checked first: lib/agent-capability-profile.js already measures
        per-agent stats, but only ever passively from other tables — it
        can't hold a genuinely learned workaround discovered mid-task, which
        had nowhere real to persist and evaporated at session end. Built
        lib/agent-notes.js + its agent_notes tool wrapper as the missing,
        editable complement. Registered through the real tool registry,
        confirmed live (68 total tools, tool_index auto-populated). Seeded
        with one real, honest entry — the actual gapField dedup gotcha from
        SF5, not a placeholder. Caught a real syntax error (nested unescaped
        quote) before it shipped, and closed a real gate warning (both new
        files unwired in loom) within the same session rather than leaving
        it open."
      depends_on: []
      does: >
        Agents now have a real, live place to write down a constraint or
        workaround they actually discover, instead of it only ever existing
        in a chat transcript that ends when the session does.

    SF11_phasemap_backfill:
      status: "✓ DONE — this file, running through loom's own real
        persistHistory() the moment it's written, git-hash-stamping every
        phase the same way every other real phasemap in this corpus already
        is."
      depends_on: []
      does: >
        Closes the loop on the person's own explicit ask: everything from
        today, mapped, not just described.

    SF12_end_state_vision_and_full_phase_map_docs:
      status: "✓ DONE — commits dd3f1f1 and earlier. docs/roadmap/
        2026-08-22-copilot-end-state-vision.md (the full, threaded end-state
        vision, organized and honestly mapped to what's real vs. new) and
        docs/roadmap/2026-08-22-full-phase-map.md (the live output of
        actually running loom's own phasemap-map.js scanner for the first
        time — 179 phases, 24 files, 20 systems, real git hashes, not a
        hand-compiled report)."
      depends_on: []
      does: >
        Both documents live in the real checkout, committed, not handed as
        separate exports — per the person's own explicit correction earlier
        in the session.

    SF13_orchestrator_agent_pipeline:
      status: "OPEN. The single largest real gap named across today's whole
        session and the end-state vision both: nothing yet sequences a real
        task into a build contract, routes it to the right agent based on
        real, measured constraints (agent_capability_profile.js +
        agent_notes.js, both real as of today), chunks it for that agent's
        real limits (WARP + lib/seam/stream.js, both real and already
        working), and closes the loop by writing what was learned back to
        agent_notes. Every individual piece this needs already exists and
        already works; nothing currently sequences them into one arc. This
        is the same gap named in docs/idearium-agent-pipeline.spec (P0-P5,
        pre-dating today, still spec-only) — that spec's own P0 (a gate
        before autonomous self-improvement + file-write access) is a
        precondition for this phase, not an optional first step."
      depends_on: [SF9_account_identity_capture, SF10_agent_notes]
      does: >
        Would be the real, concrete answer to "it has all the tools, let's
        make it happen" — an orchestrator, not a new capability.

    SF14_wake_pipeline_real_architecture:
      status: "✓ DONE — commits 476b190, a8a80f7. Real correction of an
        assumption: the wake pipeline doesn't need a separate browser-
        to-copilot HTTP call at all — every message already reaches
        cortex's real /api/meta/observe via the userscript's existing,
        working GM_xmlhttpRequest call. Found a real, second, previously-
        hidden gap while fixing this: cortex never had an actual /sse
        server — cli/nexus-repl.js and cortex-v2.js were both connecting
        to nothing. Built the real thing, matching guardian's own proven
        cockpitClients pattern. Added server-side wake-phrase detection
        on /api/meta/observe, persisted every detection to a real table
        (nexus_wake_events) so a live SSE listener isn't required to
        catch one, and built the real agent tool + CLI command + a
        ClearGlass-side relay (wake-relay.js) that injects the real
        co-pilot answer back into the exact right tab via a new
        ProviderHost.injectAnswer() — deliberately NOT resubmitted to the
        underlying model as a new prompt, since that would burn real
        tokens and contradict the file's own stated design."
      depends_on: []
      does: >
        The actual, complete "hey nexus" loop — detect, relay, answer,
        inject back — not just detection.

    SF15_wake_pipeline_real_bugs_fixed:
      status: "✓ DONE — commits 4d34c93, d5e5eee. Two real, separate bugs
        found by testing against the actual live system, not assumed
        fixed after building: (1) askNexus() used plain fetch(), blocked
        as mixed content exactly like the earlier-diagnosed EventSource
        problem — fixed by switching to GM_xmlhttpRequest, the same
        privileged pattern already proven elsewhere in the same file;
        verified by deliberately leaving global fetch undefined and
        confirming the flow still completed. (2) A streaming assistant
        message only ever got checked for the wake phrase once, at the
        moment its bubble first appeared — usually empty. Fixed by
        moving the check outside the message-count gate so it runs on
        every mutation with the freshest text, with a real dedup guard
        so a match doesn't re-fire on every subsequent mutation."
      depends_on: [SF14_wake_pipeline_real_architecture]
      does: >
        The wake phrase now actually gets detected and answered reliably,
        for both a human typing it and an assistant's streamed reply.

    SF16_event_types_real_registry:
      status: "✓ DONE — commits d353d3c, 268a967, 40965d6. Built
        lib/event-types.js as the real, canonical, system-wide event-type
        registry — none existed before. James proposed a per-agent x
        per-intent naming scheme (chatgpt_research_input, etc.); pushed
        back with concrete reasoning (combinatorial growth, duplicates
        already present in the first draft, an unworkable per-chunk-id
        type name) and restructured to a small, closed intent taxonomy
        with agent/chunkId as real fields instead — same real filtering
        power, zero per-agent growth. Wired 8 real event types
        (chat_input/response/wake live-tested against a real booted
        server; tool/chunk/spec live-tested; lifeline/build verified but
        not fully live; research deliberately left unwired, no real
        distinct execution path exists for it)."
      depends_on: []
      does: >
        A real, extensible way to see what's actually happening across
        every real system, not just intelligence's own.

    SF17_intelligence_system_all_4_phases:
      status: "✓ DONE — commits 67cd8b4, 3703787, 3c43d96, e5443e1, 5627c22.
        Full extraction of cortex/intelligence + lib/baseline.js +
        lib/snapshot-trigger.js + meta/cfr into intelligence/, across 4
        real, sequenced phases. A real, mid-work plan correction (phase 3)
        when reading meta/cfr's actual code showed the original
        compatibility-shim plan was wrong — see
        intelligence/spec/intelligence.spec's own phase_3_reasoning for
        the full record. Every phase's own final automated scan caught
        something the manual consumer index missed; between them, 7
        hidden references inside cortex/boot.js and 4 more leftover
        breaks from phase 1 were found and fixed, none of them by the
        original manual pass alone."
      depends_on: []
      does: >
        NEXUS's cognition + system-health layer now lives in one real
        place instead of scattered across cortex/lib/meta.

    SF18_intelligence_becomes_a_real_system:
      status: "✓ DONE — commits bec349d, 1690bc6, 4cc9b3e. Beyond the file
        moves: a real, standalone intelligence/server.js (http on :3753,
        reusing index.js's handleRequest and cfr/ledger.js's real ledger
        rather than rebuilding either), intelligence/consumer.js (real
        queue polling, matching emerge/consumer.js's pattern), a real
        ring buffer (WARP's own Stream, not hand-rolled), real schemas,
        real CLI subcommands, wired into autopilot.js's actual boot
        sequence, real event relaying from the two genuine internal
        extension points that existed (pattern-crystallisation's
        bus.emit, CFR's onGap), and real copilot access via
        intelligence_query — deliberately split between safe in-process
        calls and honest, non-fabricating HTTP calls for the state that
        only exists in a live server. Also closed a real, honest
        correction: intuition/mastermind were never reachable via HTTP
        anywhere in the system's history, not just missing a shorter
        alias as first claimed — built on cortex/boot.js, their real,
        documented composition root."
      depends_on: [SF17_intelligence_system_all_4_phases]
      does: >
        The intelligence extraction is no longer just a file
        reorganisation — it is a real, running, addressable system.

    SF19_loom_registry_never_auto_synced:
      status: "✓ DONE — commit 8d797cc. James uploaded real, live boot
        logs from his own machine showing intelligence booting
        successfully but 'loom map synced: 0 systems, 0 components, 0
        hooks' recurring every ~2 minutes across two separate real runs.
        Traced directly: lib/loom-map.js's real source of truth is
        loom/data/registry.json, a completely separate, disk-backed
        store from loom/maps/*.js — the files this whole session
        registered components into. loom/bootstrap.js is the one real
        process that syncs one into the other, and nothing in the
        automatic boot path ever called it (confirmed by grepping
        loom/server.js directly). Ran it live: 1538 real components,
        1305 hooks, 1264 wires, 63 intelligence-specific — confirming
        the fix. Wired into autopilot.js's start(), but corrected the
        design after actually measuring the real runtime (221s) — a
        synchronous call would have added nearly 4 minutes to every
        boot, a real regression caught by measuring rather than
        assuming a guessed timeout was safe. Runs in the background
        instead, non-blocking, since intelligence's own sync already
        re-reads the registry every ~2 minutes on its own. Also fixed
        the real spec.version.drift gap the system's own pattern-
        crystallisation had already correctly flagged as recurring."
      depends_on: [SF18_intelligence_becomes_a_real_system]
      does: >
        Every real component registered in loom/maps/*.js all session
        — including everything for the intelligence system itself — is
        now genuinely visible to a live boot, not silently invisible to
        the one process that was supposed to reflect it.
