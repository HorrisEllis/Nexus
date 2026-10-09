spec:
  meta:
    name:    2026-09-11-sovereign-node-architecture-phasemap
    roadmap: 'path — brought back 2026-10-10 (James: "im saying all systems are supposed to be like guardian with the nodes"); the phases he did not ask for stay on the shelf, each marked'
    version: 0.1.0
    status: draft
    created: 2026-09-11
    author: james-brooks (via Claude, real map + phasing pass)
    uuid: nexus-phasemap-sovereign-nodes-v1-0000-2026-0911-001

  # ── James's own words, preserved verbatim as the real source of intent ──
  vision: |
    Each system spec file is the living map. Each system works on its
    own — sovereign. Each node identifies: directory, intention, system,
    context, memory system (if applicable). Each command/agent/model/
    tool/toolbox/ledger/failure_mode gets its own node file — not
    generic, each system needs its own full node schema for all its
    data types and memory architectures. This is a dynamic system.

  # ── Real, confirmed findings this pass — what's true right now ──────────
  confirmed_state:
    - finding: "docs/nexus.spec (the declared 'living map' for the whole
        system) is stale in the exact same way contracts/nexus-
        interaction-contract.js was before its own fix this session —
        bridge still listed as boots:first, 'no system calls another
        directly,' both false since bridge's real retirement."
      severity: high
      status: not yet fixed

    - finding: "loom/maps/ has real, topical maps (ui-map, warp-map,
        observability-map, etc.) but no per-system unified map — the
        'each system's own spec is its own living map' principle is not
        yet true structurally."
      severity: medium

    - finding: "lib/node-schemas/ is ONE, centralized, generic schema set
        (19 real types) shared across every system. This directly
        contradicts 'not generic, each system needs its own full node
        schema' — confirmed by inspection, not assumed."
      severity: high

    - finding: "only 4 of 12 real systems have interaction-contract.json
        (guardian, cortex, idearium, architect) — confirmed in a prior
        pass this same session. copilot and clear-glass, the two most
        actively developed systems this session, are among the 8
        missing."
      severity: high

    - finding: "data/nodes/ (moved from lib/nodes/ this same session) is
        the one real, concrete precedent for 'each command/tool/agent/
        etc. gets its own node file' — 86 real .tool files, 4 real
        .toolbox files, proven working with a real, live index watcher."
      severity: n/a — this is the real, working example to generalize FROM

  # ── Real phases, in dependency order — each is real, bounded, testable work ──
  phases:
    P1_fix_the_declared_living_maps:
      status: 'LATER — kept on the shelf when this map came back 2026-10-10 (not part of "every system like guardian")'
      status_before: open
      description: |
        docs/nexus.spec and any other file that CLAIMS to be a real,
        current source of truth must actually be current. Same real fix
        pattern already proven this session on contracts/nexus-
        interaction-contract.js: remove/retire what's gone (bridge),
        add what's missing and real (copilot, clear-glass, and any
        other system this spec doesn't yet list), keep retired entries
        present-but-marked rather than deleted (the axiom this session
        already learned the hard way once).
      blocks: []

    P2_per_system_interaction_contracts:
      status: open
      description: |
        Build the 8 missing interaction-contract.json files (copilot,
        ollama, clear-glass, diagnostic, loom, versionium, eravos,
        intelligence), matching the real, established shape the
        existing 4 already use. This is the real "sovereign, connected
        only through the interaction contract" principle becoming true
        for every system, not just a third of them.
      blocks: []

    P3_per_system_node_schemas:
      status: open
      description: |
        The real, hard architectural decision this phase requires:
        does lib/node-schemas/ stay ONE, shared, generic set (simpler,
        but contradicts "not generic, each system needs its own"), or
        does each system get its own real schema folder (e.g.
        guardian/node-schemas/, idearium/node-schemas/) that can extend
        or override the shared base? Needs a real answer before
        building — this phase is genuinely a decision point, not just
        implementation.
      blocks: [P4_full_node_type_coverage_per_system]

    P4_full_node_type_coverage_per_system:
      status: open
      description: |
        Generalize the one real, proven pattern (data/nodes/'s 86 real
        .tool files + node-index-watcher.js) to every real node type
        James named: command, agent, model, tool, toolbox, ledger,
        failure_mode — one real file per real instance, per system,
        each with the real fields James specified (identity, directory,
        intention, system, context, memory system where applicable).
        Depends on P3's real schema-ownership decision being made first.
      blocks: []

    P5_data_folder_completion:
      status: open
      description: |
        The real, measured finding from earlier this session: data/
        folders are near-empty (3-13 files each) while cortex's JAA
        store holds the real, load-bearing data for almost every system
        (1114 events, 1038 ledger rows, 135 intake drops, etc.). This
        phase is the real migration — each system's real, live data
        moves into its own data/<system>/ folder, cortex becomes the
        real bookkeeper it's meant to be rather than the primary store.
        Explicitly the largest, highest-risk phase — real data, real
        consumers, needs its own careful, dedicated pass per system, not
        attempted in one sweep.
        ADDENDUM 2026-10-05 (0.39.311) — James: "Each system needs to be in charge of its own data. Not the data
        folder in the root or cortex. Cortex is the book keeper, with the associative lattice." Carried forward, not
        duplicated, as DS1 (cortex the catalog: owner, location, count, hash, lineage + the lattice — never a copy) and
        DS2 (one system moves home at a time, behind a warning read shim) in
        docs/2026-10-05-cli-data-code-phasemap.spec. This phase stays the parent; its status moves with theirs.
      blocks: []

    P6_per_system_contract_schemas:
      status: open
      description: |
        James: "each system needs contract schemas if applicable.
        everything has to be a tangible file. that way the system
        can't lie. it persists on restart." Not every system needs a
        real contract schema (some are pure UI, some pure library) —
        "if applicable" means this phase starts with a real audit of
        which systems genuinely dispatch/receive contracts at all
        before building schemas for ones that don't need them.
      blocks: []

    P7_copilot_ticket_queue:
      status: 'LATER — kept on the shelf when this map came back 2026-10-10 (not part of "every system like guardian")'
      status_before: open
      description: |
        James: "what if copilot inputs starts a ledger until the
        request is marked complete... using a contract... input goes
        into a ledger into the queue, then copilot reads and
        responds... i want it to feel like an actual conversation."
        Real, NOT a new mechanism — the exact same real pattern already
        proven this session for wake-word (GUARDIAN_LEDGER_WRITE, a
        real shared jobId tying question->answer->complete together),
        applied to every real copilot input, not only wake-word ones.
        Real, already-existing, load-bearing piece to connect this to,
        not duplicate: copilot/lib/person-model/ (built 2026-08-17,
        already does session ledgers chaining to the previous session,
        provenance-tracked hypotheses, confidence decay) — "an accurate
        model of me" is not a new ask, it already exists and is
        already wired into the live request flow (copilot/routes/
        person-model.js). This phase is the ticket/queue LAYER on top
        of turn-processing itself, plus making sure copilot actually
        reads its own ledger before responding — that's the real
        connection that makes continuity actually felt, not just
        persisted.
      blocks: []

    P8_per_system_component_registry:
      status: open
      description: |
        James, verbatim (real, exact field list, not paraphrased —
        preserve this precisely, nothing lost): "comp, hook and wire,
        type, id, dir, intent, commands, edge case and summary of each
        component. basically a map of the wiring, context, intent,
        directory, why it exists and what to expect. IDs, UUIDs, node
        UUIDs... command id, node uuid, each component can be a node
        type. data type, data directory for the node/data."
        Structure: "core components, the foundational components that
        the rest of the system rely/build on. then each module with
        each component." A real, per-system hierarchy — core layer
        first, then modules, then components within each module — not
        a flat list. Real precedent to build FROM, not duplicate:
        loom's own real maps (loom/maps/*.js) already do component/
        hook/wire mapping with real require()-verified edges — this
        phase is making that real, proven pattern exist PER SYSTEM,
        in that system's own folder (per the sovereign-system
        principle this whole phasemap is built on), not only
        centrally in loom/.
      blocks: [P3_per_system_node_schemas]

    P9_diagnostic_from_expected_behavior:
      status: 'LATER — kept on the shelf when this map came back 2026-10-10 (not part of "every system like guardian")'
      status_before: open
      description: |
        James: "this way we can also use the data as a way to
        understand expected behavior, that way we can diagnose the
        system way more accurately." Real, valuable, concrete
        consequence of P8 once built — if every component's real
        contract states what it touches, what modules/components
        depend on it, and what "expected" looks like, diagnostic
        (service/nexus-diagnostic.js) could compare real, live
        behavior against a real, declared expectation instead of only
        generic health/gap signals. Depends on P8 actually existing
        first — this is a real consumer of that data, not a
        replacement for building it.
      blocks: [P8_per_system_component_registry]

    P10_intelligence_reads_sse_and_data_folders:
      status: 'LATER — kept on the shelf when this map came back 2026-10-10 (not part of "every system like guardian")'
      status_before: open
      description: |
        James: "then the intelligence system can use the sse and data
        folders for each system." Real, closing connection — once P5
        (data-folder-completion) and P8 (per-system registries) are
        real, cortex/intelligence's own real pattern-crystallization
        work (already live — confirmed this session via real boot-log
        lines like "pattern crystallised: cross_system_causal") should
        read from each system's own real data/ folder and SSE stream
        directly, not only cortex's own centralized JAA tables. Depends
        on both P5 and P8 being real first.
      blocks: [P5_data_folder_completion, P8_per_system_component_registry]

    P11_unify_failure_tracking:
      status: 'LATER — kept on the shelf when this map came back 2026-10-10 (not part of "every system like guardian")'
      status_before: open
      description: |
        Real, confirmed audit finding (this session, deliberately kept
        shallow given real token constraints — this phase is the real,
        deep follow-up, not a substitute for it): 3 distinct, real
        failure-tracking mechanisms exist and do not talk to each
        other — cortex/self-heal/fault-taxonomy.js (friction-based
        escalation ladder), cortex/self-heal/index.js's
        _enterFailureMode (writes a JAA failure_modes row), and
        lib/ico.js's logFailure() (real, per-system NDJSON to
        data/<system>/failures/, needs a specific per-system ICO
        instance). None currently create a real .failure_mode node —
        confirmed by a real attempt this session that was reverted
        after catching it used the wrong field shape and had no clean
        way to resolve the right ICO instance generically. Real,
        deliberately incomplete: a genuine fix here needs resolving
        which system's ICO instance owns a given failure, not
        guessed at under token pressure.
      blocks: [P8_per_system_component_registry]

    P12_compartment_per_contract:
      status: 'LATER — kept on the shelf when this map came back 2026-10-10 (not part of "every system like guardian")'
      status_before: open
      description: |
        James: "working memory is meant for immediate data for the
        contract which we should create a compartment for to copy and
        write relevant data. that way we have whatever the contract
        needs, the agent needs, and it's isolated from nexus."
        Confirmed real, not new: lib/compartment-engine.js's whole
        design already assumes a compartment IS a real, isolated
        working space per real intent. What's missing: contracts don't
        automatically get one — it's optional/manual right now. This
        phase makes it automatic and default for every real contract,
        not an opt-in.
      blocks: []

    P13_interaction_contract_plus_handshake_for_every_cross_system_call:
      status: open
      description: |
        James, verbatim, real and precise: "every interaction between
        systems has to use the interaction contract, and verify handoff
        using handshake. if it succeeds, goes into the system's queue,
        if it fails remains where it's at, failure mode report is made,
        fault is logged, diagnostic system runs using the intelligence
        system, reads the contract to understand intention and
        expectation, reads the fault taxonomy to see if it's happened
        before and what resolved the fault." A real, complete,
        already-well-specified protocol — not vague. Depends on P2
        (per-system interaction contracts existing for every system)
        and P11 (unified failure tracking, since this protocol's own
        failure path routes directly into it) both being real first.
      blocks: [P2_per_system_interaction_contracts, P11_unify_failure_tracking]

    P14_per_system_living_gap_index:
      status: 'LATER — kept on the shelf when this map came back 2026-10-10 (not part of "every system like guardian")'
      status_before: open
      description: |
        James: "we can have a living gap index for each system, with
        the relevant information using the intelligence system and
        diagnostic system." Real precedent to build from, not
        duplicate: the real gaps JAA table (56 real rows, confirmed
        this session) and diagnostic's own real GAP-emitting mechanism
        already exist centrally. This phase is making that real,
        working concept exist per-system (matching the sovereign-system
        principle this whole phasemap is built on) rather than only in
        one shared, central table.
      blocks: [P8_per_system_component_registry]

    P15_redundant_file_purge:
      status: 'LATER — kept on the shelf when this map came back 2026-10-10 (not part of "every system like guardian")'
      status_before: open
      description: |
        James: "copilot has files in the folder it doesn't really need
        i feel like. i feel like a purge of redundant files needs to
        happen before the audit." Real, checked this session before
        committing to this as a phase rather than acting on a hunch:
        the one obvious candidate checked (copilot/diagnostics.js vs
        diagnostic-sweep.js) was a real FALSE ALARM — both are genuinely
        used, diagnostic-sweep.js actually calls diagnostics.js as a
        real dependency (confirmed via 4 real call sites a first,
        narrower grep missed). This is the real, honest lesson for this
        whole phase: a purge needs a real, systematic per-file
        require-graph check, not a hunch based on filenames looking
        similar — genuinely redundant files may exist, but finding them
        safely takes real, dedicated verification work, not assumed
        from naming alone.
      blocks: []

    P19_dynamic_nodes_via_causal_graph:
      status: open
      description: |
        James: "make nodes dynamic." Real, NOT new — intelligence/cfr/
        graph.js's CausalGraph already does exactly this for ledger
        rows, its own header states it outright: "Every ledger entry is
        also a node in the causal graph." Edges from causedBy/sessionId/
        jobId/temporal proximity are real and working, with real
        root-cause traversal and sigma clustering. This phase is the
        generalization: any real node-type instance (.gap, .contract,
        .agent — the 26 real types from lib/node-schemas/) becomes a
        CausalGraph node the same way a ledger row already does, not
        just ledger entries specifically. This is the connective phase
        the other three below build on — P20/P21/P22 all assume a node
        can participate in a causal graph, not just describe itself
        statically.
      blocks: []

    P20_intelligence_reflexive_cfr_field:
      status: open
      description: |
        James: "a causal field for the intelligence system." Real,
        confirmed gap — intelligence/cfr/field.js's createCFRField()
        already computes coherence/friction/resonance/entropy for other
        systems' event streams (guardian.job.*, etc. — real event-nudge
        table, grep-confirmed), and meta/lattice/associative-lattice.js
        already gives every SYSTEM PAIR its own field via this exact
        mechanism. Checked directly: zero hits for a field describing
        intelligence's own state, reflexively. This phase gives
        intelligence one field instance on itself — same real
        createCFRField() call, same real nudge-table pattern, no new
        physics model invented.
      blocks: []

    P21_versionium_causal_field:
      status: open
      description: |
        James: "a causal field for... versionium." Real, partial
        already — versionium/lib/causality.js already uses CausalGraph
        to trace a commit's causal ANCESTRY (structure: what led to
        what), including across systems via cortex's shared event_log.
        What it doesn't have is a causal FIELD (physics: coherence/
        friction/resonance/entropy) the way relationship_edge gives
        system pairs one. This phase adds that dimension to versionium's
        commits/branches, directly reusing relationship_edge's own
        pattern (schema built 2026-09-11, same session) rather than
        inventing a new one — a commit or branch gets the same
        createCFRField()-backed field a system pair already gets.
        Depends on P19 (a versionium commit needs to be a real graph
        node first, before it can carry a field the same way).
      blocks: [P19_dynamic_nodes_via_causal_graph]

    P22_ledger_data_integrity_checker:
      status: open
      description: |
        James: "cortex has tools for checking data integrity, comparing
        ledger to data folder to find gaps" — describing a real,
        wanted capability, not an existing one; checked directly,
        nothing in cortex/ or anywhere else compares ledger CONTENT
        against actual data/ folder state. Two real, close precedents
        exist to build FROM, not duplicate: lib/file-integrity.js
        (hashes source files/registries/SEAM wires, drift -> sigma ->
        gap, real and proven) and lib/integrity-revert.js (sigma-gated
        guarded revert via replay-engine, also real). Both are scoped to
        code/config, never to runtime data content — this phase is the
        same real hash-diff-sigma-gap pattern, applied to: does the
        ledger say a node was created/modified, and does data/<system>/
        <type>/ actually contain the matching real file? This is
        directly the validation mechanism the P5 gap-migration-manifest
        (2026-09-11, 175 gaps classified, writes still frozen pending
        the nesting-order + ownership decisions) will need once those
        decisions land and real writes happen — proving the migration
        didn't silently lose or duplicate anything, not just hoping it
        didn't. Depends on P5 (data_folder_completion) having real
        migrated data to check against, and P19 (nodes need to be real
        graph-participating entities for a meaningful causedBy-vs-
        current-state comparison, not just static files).
      blocks: [P5_data_folder_completion, P19_dynamic_nodes_via_causal_graph]

    P23_guardian_job_durability:
      status: 'LATER — kept on the shelf when this map came back 2026-10-10 (not part of "every system like guardian")'
      status_before: open
      description: |
        James/doc4: "needs to stop being implicit, needs to be a
        tangible payload per job." Confirmed real, not hypothetical —
        traced live: guardian/lib/ncp-handler.js's GUARDIAN_COMPLETE
        handler does `job.responseText = finalText` on a `jobs.get(jobId)`
        **in-memory Map**. That Map is the WHOLE record of an in-flight
        job. If guardian's server process dies between dispatch and
        completion, the job is gone — no queue file, no journal, nothing
        on disk until completion itself triggers a write. GET
        /response/:jobId (server.js ~1875) already has real, layered
        fallback (memory -> persisted JAA jobs table -> matching
        artifact) for a COMPLETED job's response, which is what made
        P-none/the dispatch-fallback fix (2026-09-11, this session)
        possible — but nothing persists a job's existence/state BEFORE
        completion. This phase gives a job a real file/record from the
        moment it's created (doc4's CREATED->QUEUED->DISPATCHED->
        PROVIDER_ACK->AWAITING_RESPONSE->...->COMPLETED lifecycle,
        adapted to guardian's real jobs Map + jaa 'jobs' table as the
        two real anchors already in place, not invented fresh).
      blocks: []

    P24_response_queue_and_delivery_ack:
      status: 'LATER — kept on the shelf when this map came back 2026-10-10 (not part of "every system like guardian")'
      status_before: open
      description: |
        James/doc4: "a job can only complete if there is a response per
        job... then the response needs to also queue until delivered to
        the endpoint." Real invariant change: COMPLETE(job) currently =
        sent===true (implicit, confirmed by P23's finding — nothing
        tracks delivery, only dispatch). This phase makes it
        response.exists && response.valid && endpoint.acknowledged
        (doc4's model) — the response itself queues and retries until
        confirmed delivered, not just fired at the console/UI and
        forgotten. Depends on P23 (can't ACK a job that isn't itself a
        durable record yet).
      blocks: [P23_guardian_job_durability]

    P25_universal_per_system_queue:
      status: 'LATER — kept on the shelf when this map came back 2026-10-10 (not part of "every system like guardian")'
      status_before: open
      description: |
        James: "clearglass can have a queue per provider. like every
        system needs a queue, that's persistent, drainer that loops
        back into the queue with escalating retry logic and diagnostic
        strategies." Real precedent to generalize FROM, not invent:
        lib/queue.js already has a real, working queue (input/logs dirs,
        .pending/.processing/.complete file states, replay() for
        crash-recovery — confirmed real, it's what backs
        physQueue.logConversation/conversationTail, already used by
        guardian). This phase is making that pattern (already proven for
        guardian's own queue) the real per-system convention, with
        escalating retry (doc4's FAILED -> retry -> QUEUED loop) and
        diagnostic strategy hooks (reuse cortex/self-heal/fault-
        taxonomy.js's real friction-band escalation, not a new one).
        Depends on P23/P24 landing for guardian first — proving the
        pattern once before generalizing it, same bottom-up discipline
        P5 already committed to for data migration.
      blocks: [P23_guardian_job_durability, P24_response_queue_and_delivery_ack]

    P26_unify_conversation_logging:
      status: 'LATER — kept on the shelf when this map came back 2026-10-10 (not part of "every system like guardian")'
      status_before: open
      description: |
        James: "clearglass has a full listener for each provider and
        logs each conversation fully into a ledger in real time." Found,
        not assumed: this is currently split across TWO real, non-
        unified mechanisms — response side (guardian/lib/ncp-handler.js,
        physQueue.logConversation, explicit per-call sessionId, real
        crash-safe file per session) and prompt side (guardian/lib/
        chat-logger.js's cl.log(), used by guardian/api-dispatch.js).
        Real complication, checked before assuming a simple merge: api-
        dispatch.js is required by orchestrator.js, NOT guardian/
        server.js — a genuinely different process than the browser-tab/
        NCP path ncp-handler.js handles. Also, chat-logger.js's session
        tracking is a SINGLE GLOBAL module-scope variable
        (_currentSession), not per-conversation — a real concurrency bug
        for multiple simultaneous tabs/dispatches, confirmed by direct
        read, not the model to standardize on. Open question before any
        write-side change: are orchestrator's direct-API-key dispatches
        and guardian's browser-tab dispatches even the same
        "conversation" concept, or two genuinely different things that
        happen to both produce prompt/response pairs? Real decision
        needed, not assumed either way.
      blocks: []

    P27_guardian_picker_userscript_manager:
      status: 'LATER — kept on the shelf when this map came back 2026-10-10 (not part of "every system like guardian")'
      status_before: partially_done
      description: |
        James: "hook guardian picker into the userscripts... a button
        to show userscripts for the page, a way to edit the userscript."
        §CORRECTED 2026-09-11 (second pass) — originally opened on a
        wrong finding: "zero renderer calls anywhere" was based on
        grepping for the literal string 'userscripts:list' (the raw IPC
        channel name) instead of cg.userscripts.list (what the real code
        calls through the exposed preload bridge). A pasted external
        analysis made the identical mistake independently. Checked
        properly: #btn-userscripts/#userscript-panel/loadUserscripts()
        with real, working list()/toggle()/inject() already existed
        before this phase was even opened. Built this pass: the real
        editor modal (edit/create/delete), against window.ClearGlass.
        userscripts (the correct trusted bridge — NOT guardian-picker.js's
        own window.__cg.send, which is deliberately allowlisted to 3
        channels for a real security reason: that script runs inside an
        untrusted guest webpage, and a general IPC surface there would
        let any page rewrite guardian's own userscripts). Remaining real
        gap: guardian-picker.js itself (the in-page picker overlay) still
        has no entry point into the userscript panel — the panel lives
        in the trusted main-window chrome, reachable via the toolbar
        button, not literally "hooked into" the picker overlay the way
        James's phrasing suggests. Whether that's the intended final
        shape or a real remaining wire is an open question, not decided
        here.
      blocks: []

    P31_job_reference_command_syntax:
      status: 'LATER — kept on the shelf when this map came back 2026-10-10 (not part of "every system like guardian")'
      status_before: open
      description: |
        James: "/guardian /chatgpt /code efe37d5d-...job (file pasted
        into the agent chat)." Checked the real, current grammar first
        (guardian/lib/provider-routing.js's parseCommand,
        regex-verified: /^\/(\w+)\s+(\w[\w.-]*)\s*([\s\S]*)$/) — most of
        this already works today, just ordered /<command> <provider>
        <prompt> (e.g. /code chatgpt review this), no leading /guardian
        needed since that's implicit in guardian's own CLI. sendFile()
        already does "file pasted into the agent chat" for an arbitrary
        file path. The genuinely new piece is resolving a bare
        <uuid>.job (or .contract) reference INSIDE the command string
        into that job/contract's real content — parseCommand's regex
        would currently just capture the literal string as prompt text,
        not resolve it. Real, scoped addition: detect a trailing
        <uuid>.<type> token in the parsed prompt, resolve it via
        node-export.js's real importFromFile() against the matching
        data/nodes/ (or data/<system>/) location, and substitute its
        content the same way sendFile() substitutes a file's content
        today — reusing that real precedent, not inventing a new
        dispatch path.
      blocks: []

    P32_clearglass_enterprise_ui_scope:
      status: 'LATER — kept on the shelf when this map came back 2026-10-10 (not part of "every system like guardian")'
      status_before: open
      description: |
        James: "build all the ui for clearglass. expand the ui, full
        enterprise grade, full pages." Deliberately NOT attempted as one
        phase — genuinely unbounded as stated. This phase exists to hold
        the scoping conversation, not to be executed directly: real
        candidates already named across this session (job queue UI,
        agent mesh canvas — mesh-picker.js/agent-mesh.js already real
        and partially wired per btn-mesh/mesh-picker-btn, BrainOS canvas
        per P29, the userscript panel per P27) need to be enumerated
        against what's already real (checked this pass: far more of
        ClearGlass's chrome already exists than either this session or
        external analyses have assumed twice now — btn-userscripts,
        btn-providers, btn-dom, tool-picker-group, mesh-picker-btn,
        btn-mesh, btn-diag all already declared and at least partially
        wired) before deciding what "full enterprise grade, full pages"
        actually adds on top, rather than rebuilding chrome that's
        already there a third time.
      blocks: [P27_guardian_picker_userscript_manager, P28_dom_tool_and_command_flow, P29_clearglass_brainos_canvas]

    P28_dom_tool_and_command_flow:
      status: 'LATER — kept on the shelf when this map came back 2026-10-10 (not part of "every system like guardian")'
      status_before: open
      description: |
        James: "click the element picker, select an element, then
        select userscript, then a dropdown for inputs or outputs.
        input is for the command line from guardian. output is for the
        listener sse and chatledger." A real, new capability — a
        programmable DOM tool (element -> command/API mapping),
        building the .command node type's real creation flow: pick
        element via guardian-picker -> bind input (guardian CLI command
        into that element) or output (SSE listener -> P26's ledger) ->
        .command record created from the shared .command schema (one of
        the 30 real node-schema types already built) -> feeds a real
        job into P23's durable job record. Genuinely new UI + new
        binding logic, not a rewire of something existing like P27.
        Depends on P25 (the job needs somewhere durable to land) and
        P27 (the picker's userscript-selection half needs to exist
        first, this phase adds the element/binding half on top of it).
      blocks: [P25_universal_per_system_queue, P27_guardian_picker_userscript_manager]

    P29_clearglass_brainos_canvas:
      status: 'LATER — kept on the shelf when this map came back 2026-10-10 (not part of "every system like guardian")'
      status_before: open
      description: |
        James: "clearglass ui expanded with the userscripts, agent
        features, brainos ui for the entire agent orchestration node
        canvas and control panel." Large, genuinely new UI surface —
        not wiring, not a small extension. Depends on P27 (userscript
        panel) and P28 (DOM tool/command flow) existing as real,
        working pieces first — this phase is the unifying canvas that
        surfaces them together, not a replacement for building them.
      blocks: [P27_guardian_picker_userscript_manager, P28_dom_tool_and_command_flow]

    P30_provider_ping_delta:
      status: 'LATER — kept on the shelf when this map came back 2026-10-10 (not part of "every system like guardian")'
      status_before: open
      description: |
        James: "each time clearglass opens, needs to send ping to each
        provider, with a delta to measure performance." Real, small,
        separable capability — on ClearGlass open, ping every connected
        provider (reuse the real GUARDIAN_HEARTBEAT-adjacent connection
        state already tracked per .guardian_listener) and record a
        latency delta. No hard dependency on the rest of this batch —
        could ship independently, listed last only because it's lowest
        priority against everything else named this pass, not because
        it's blocked.
      blocks: []

  # ── Deliberately not decided here ────────────────────────────────────
  open_questions:
    - "P3's real schema-ownership model — shared base + per-system
       extension, or fully separate per-system schemas from scratch?"
    - "What does 'memory system (if applicable)' mean per node type,
       concretely? JAA table name? Vector-embedded or not? Which nodes
       even need memory-system metadata vs. which are just structural?"
    - "Order of P5's per-system data migration — which system first?"
    - "P16-P18 exist with different content on the sibling
       nexus-v0_39_76.zip branch (docs declutter, per-system phasemap
       folders, per-system repos) — P19-P22 deliberately skip those
       numbers rather than collide. Real branch reconciliation still
       needed before both halves live in one phasemap."
    - "P26: are orchestrator's api-dispatch.js conversations and
       guardian's browser-tab NCP conversations the same real concept
       for logging purposes, or two genuinely different things? Not
       assumed either way — real decision needed before any unifying
       write-side change."
    - ".ledger fragmentation (guardian's bare 'ledger' table, THIRD
       distinct shape from both .ledger and ledger_entries, flagged
       2026-09-11) still unresolved — same class of decision P26 now
       also needs, not yet unified."

  # ── Addendum: 2026-09-10 architecture brainstorm synthesis ────────────
  # Per CLAUDE.md rule 4 (living specs get dated addenda, not silent
  # replacement) — folded in verbatim from the former root-level
  # ARCHITECTURE-BRAINSTORM-SYNTHESIS-2026-09-10.md during the 2026-09-11
  # root .md cleanup (N1). This document explicitly analyzes and corrects
  # course against THIS phasemap ("a phasemap already exists in this exact
  # repo... that names the same gap, in your own words, already broken
  # into 15 real phases") — it belongs here, not as a freestanding root
  # file with no structural connection to the phasemap it's about.
  # Preserved byte-for-byte, not summarized or re-edited.
  addendum_2026_09_10_architecture_brainstorm_synthesis: |
    # Architecture brainstorm — organized against what's real, 2026-09-10 (v2)
    
    **Correction to my own earlier pass, up front:** this conversation (yours,
    ChatGPT's, and mine) spent several rounds converging on "NEXUS needs a
    universal node identity layer" as if it were a new discovery. It isn't. A
    phasemap already exists in this exact repo —
    `docs/2026-09-11-sovereign-node-architecture-phasemap.spec` — that names
    the same gap, in your own words, already broken into 15 real phases. And
    there's a live, working precedent for the node layer itself
    (`lib/node-schemas/` + `data/nodes/`) that none of the three of us checked
    before theorizing. This update replaces speculation with what's already
    there.
    
    ---
    
    ## Part 0 — the node layer already exists. It's just incomplete, not absent.
    
    `lib/node-schemas/` defines 19 real node types: `agent, command,
    component, contract, cos, crystal, failure_mode, framework, gap, hat,
    idea, ledger, macro, model, node, pat, schema, tool, toolbox`. Each is a
    real schema file, not a stub.
    
    `data/nodes/` is the live instance store — real files, not a mockup: 86
    `.tool` nodes and 4 `.toolbox` nodes, watched by a real
    `lib/node-index-watcher.js`. One sample node's actual envelope:
    
    ```yaml
    envelope: 1
    uuid: nexus-export-tool-query_recall.d4a325c2-...
    type: tool
    id: query_recall.d4a325c2-...
    context: null
    intent: null
    summary: null
    system: null
    tags: []
    exported_at: 1788862724954
    source: lib/agent-tools
    payload: { ... the actual tool definition ... }
    ```
    
    That's `identity + type + provenance (source) + temporal (exported_at) +
    payload`, envelope separated from payload — almost field-for-field the
    shape ChatGPT's document proposed from first principles. So Part 1 of my
    last pass ("contracts aren't nodes yet") was too pessimistic: the
    substrate is real. What's actually true, per the phasemap's own audit:
    
    - Only 2 of 19 node types (`tool`, `toolbox`) have any real instances.
      `contract`, `agent`, `command`, `model`, `failure_mode`, `ledger` all
      have schemas defined and **zero real node files** — the schema exists,
      nothing populates it yet.
    - `lib/node-schemas/node.js` — the generic `.node` type itself — is
      narrower than it sounds: it's specifically the loom
      component/hook/wire union, not a general-purpose node shape other
      systems can extend.
    - The phasemap's own P3 flags this as a genuine unresolved decision: one
      shared generic schema set (what exists today) contradicts James's
      stated intent ("not generic, each system needs its own full node
      schema") — not decided yet, correctly left open rather than picked.
    
    So: the next real step isn't "invent node identity." It's "populate
    `contract` and `failure_mode` node instances the same way `tool` already
    works, and resolve P3's shared-vs-per-system schema question first since
    P4 (full coverage) depends on it."
    
    ---
    
    ## Part 1 — "cortex should be the bookkeeper" is already the plan, and today it's the opposite
    
    This phrasing isn't a new proposal — it's a near-verbatim match for
    P5 of the existing phasemap:
    
    > "cortex's JAA store holds the real, load-bearing data for almost every
    > system (1114 events, 1038 ledger rows, 135 intake drops, etc.)...
    > cortex becomes the real bookkeeper it's meant to be rather than the
    > primary store."
    
    Confirmed directly: `data/<system>/` folders today are near-empty (3-13
    files each) precisely because cortex's JAA tables are where the real data
    actually lives. That inverts the sovereignty model this whole
    conversation has been assuming — Cortex isn't currently "indexing
    relationships between sovereign systems' own data" (the clean model
    ChatGPT described); it's currently the primary store for most of them.
    P5 is explicitly the fix, and it's flagged in the phasemap as "the
    largest, highest-risk phase" needing a per-system migration, not one
    sweep. Nothing to add here — just: this is already scoped, already
    sequenced, don't re-derive it.
    
    ---
    
    ## Part 2 — loom's map confirms the "living map" claim is currently false
    
    `docs/nexus.spec` (v2.0.0) declares itself the systems-thinking source of
    truth — and is stale in a checkable way: it still lists `bridge` as
    `boots: first` and states "no system calls another directly," both false
    since bridge's real retirement (confirmed earlier this same session per
    the phasemap, and independently confirmed by me reading the file
    directly — the bridge entry is unmarked, not moved to a retired block the
    way `contracts/nexus-interaction-contract.js` already handles its own
    retired entries).
    
    `loom/spec/loom.spec` is itself honest about a real gap: loom's SSE event
    vocabulary is "not enumerated this pass... recorded honestly as
    unenumerated rather than guessed." Loom has real per-topic maps
    (`loom/maps/*.js` — ui-map, warp-map, observability-map) with genuine
    `require()`-verified edges, but no single per-system unified map yet —
    matching the phasemap's own P1/confirmed_state finding exactly.
    
    Net: "look at loom's map to understand NEXUS" currently gets you accurate
    topical slices (UI wiring, observability wiring) but not one coherent,
    current picture — because the one file that claims to be that picture
    (`nexus.spec`) is out of date, which is exactly P1's job to fix, and P1
    correctly has no dependencies — it can be done today, before anything
    else on this list.
    
    ---
    
    ## Part 3 — where the RAID/DAG discussion actually plugs in
    
    Previously flagged: RAID's real context retrieval
    (`context-synthesis.js` -> `context-gate.js`) is flat keyword union plus
    weak substring matching, self-documented as producing false positives.
    A real causal DAG exists (`intelligence/rfr2/causality/index.js`) but is
    wired to event-lifecycle pairing, not to contract/artifact relationships,
    because nothing currently emits those edges.
    
    That dependency is now explicit in the phasemap too: P9 (diagnostic from
    expected behavior), P10 (intelligence reads per-system data/SSE), and P11
    (unify failure tracking — 3 real, disconnected failure mechanisms found
    that "do not talk to each other") all explicitly `blocks: [P8]`, and P8
    is the per-system component registry. In other words: graph-based
    retrieval over real relationships needs P8's per-system registries to
    exist first, which needs P3's schema-ownership decision made first. The
    DAG idea doesn't get its own phase — it's the natural consumer once
    P3 -> P4 -> P8 land, same conclusion I reached independently, now
    confirmed against the actual planned sequence instead of guessed at.
    
    ---
    
    ## Part 4 — memory-system location (confirmed, scoped fix)
    
    `guardian/jaa-store.js` is the shared JAA engine, but it lives inside one
    sovereign system's own folder. Confirmed real, direct cross-system
    dependency on it (not test-only): `cortex/memory/jaa-db.js`,
    `cortex/push-recall.js`, and `versionium/lib/store.js` all
    `require('.../guardian/jaa-store')` directly, plus ~7 test files. That
    contradicts the sovereignty model every other part of this system follows
    — cortex and versionium reaching into guardian's own folder for their
    persistence layer is the same class of violation already fixed once this
    session for a different pair of systems (§CORTEX_BOOKKEEPER /
    RF2/RF4 in `lib/version.js`'s own changelog, 0.39.60). Scoped fix: move
    `guardian/jaa-store.js` (and the thin `cortex/memory/jaa-db.js` wrapper
    around it) into `lib/`, then repoint the ~10 real call sites. No design
    decision required — this is a "where does the file live" fix, not an
    architecture change.
    
    ## Part 5 — the "drag-and-drop new system" idea already has its wiring; it needs one artifact, not new code
    
    Checked `genesis.spec` and how it's actually used: it's real and
    carefully designed (spine=WARP, root types, per-domain schema-baseline
    axioms) but `idearium/spec-engine/index.js` is explicit that it is
    **only ever used to extract a meta header** — version, UUID, spine
    declaration. Its own comment: "there is no structural mapping from the
    DSL to the other seven sections, and inventing one would fabricate
    content." So genesis is the *ontology* of a valid sovereign system, not
    a generator that produces one.
    
    The actual generator already exists, fully wired, one layer over from
    where we were looking: `idearium/spec-engine/templates.js`'s
    `readCompartmentTemplate()` (built 2026-08-17, GA6 — James's own words,
    "architecture template with maybe a compartment of the template files,"
    preserved verbatim in its header) finds a real COS compartment by name,
    walks its real file tree, and seeds a new spec's `schema` chunk with the
    whole multi-file content — no agent dispatch needed for that chunk.
    `idearium/api/index.js`'s `speceng.create` route already accepts a
    `compartmentTemplateName` parameter that triggers this, end to end. No
    idearium code needs to change. The only real gap: **no compartment has
    ever been created to serve as that seed** — the feature has been sitting
    built and unused since 2026-08-17.
    
    Proposed compartment (`nexus-system-slot`), each file grounded in an
    existing real convention rather than invented:
    
    1. `spec/<system>.spec` — the section shape `loom.spec`/`nexus.spec`
       already use (`meta → core → routes → events`), domain-specific parts
       marked `# FILL`.
    2. `interaction-contract.json` — structurally copied from guardian's
       (the most complete of the 4 real ones), identity/routes blanked to
       `FILL`.
    3. `event-taxonomy.js` — the ET1 shape from
       `lib/event-taxonomy-pattern.js`, one real example kept so
       `validateTaxonomy()` has something to check at boot.
    4. `server.js` — boot skeleton copied from `ollama/server.js` (smallest
       real system doing all four correctly): JAA open (against the
       relocated `lib/jaa-store.js` per Part 4), `pulse.createPulse({systemId,
       port})`, component-registry self-registration, `/health` route.
    5. `README.md` — which pieces are load-bearing (interaction-contract,
       the pulse call, `/health` — miss these and boot phase 3 stalls the
       way `idearium` stalled in the live boot log above) versus which are
       placeholders.
    
    Once built, one `TEMPLATES` entry (matching the existing `compartments`
    entry's shape) makes it wizard-visible; from then on every new system
    starts from `compartmentTemplateName: 'nexus-system-slot'` — reused, not
    rebuilt each time.
    
    ## Part 6 — the live boot log independently confirms Part 0
    
    James's own `npm run start:all` log (2026-09-11) surfaces real
    `dangling-hook` gaps for `nexus.lib.node-schemas`,
    `nexus.lib.node-index-watcher`, and per-type entries
    (`nexus.lib.node-schemas.component`, `.hat`) — diagnostic catching, live
    and unprompted, exactly the incompleteness Part 0 found by reading the
    code: the node-identity layer exists but isn't fully wired into the hook
    graph diagnostic already watches. Also visible live: `intelligence`'s
    real crystallization engine running exactly as described in the earlier
    "deterministic contract expands with probabilistic data" exchange —
    `confidence` climbing with count, `crystallised` latching once a pattern
    clears its threshold — this is not a proposed mechanism, it was firing
    continuously throughout that boot.
    
    ---
    
    ## Part 7 — James's Genesis wizard: mostly assembly, one genuinely new layer
    
    James, live: rename `emerge` to **System Compiler** (it already is one —
    `emerge/compiler/pipeline.js` is the entire real system since
    `emerge/consumer.js` was retired this session; the name is the only thing
    still lying about what it does). Use the real `genesis.spec` (Part 5's
    `'system'` template kind, already described in code as *"a full
    sovereign system — kernel, engine, runtime, own ledger, own
    compartments"* — this is not a new concept, it's an existing template
    entry with no seed yet) to drive a real, step-by-step wizard — one block
    per step, copilot explains each option, "you pick" is a real, standing
    choice, and copilot has to *ask before it assumes* when James wants to
    add something not on the list. Genesis itself is the living spec for
    what a new system must declare. Output: a real spec sent back to the
    idearium compartment, which creates a real repo — the exact
    `compartmentTemplateName` → `speceng.create` → `/projects/<repoUuid>/`
    path Part 5 and the earlier `nexus-v0_39_62` work already built.
    
    **What's actually new here, checked against everything that already
    exists:**
    
    1. **The rename.** `emerge` → `system compiler`, everywhere — kernel
       entry, diagnostic's `SYSTEM_DIRS`/`REAL_ENTRY_FILE` maps (already
       pointed at the real compiler after the 0.39.64 fix — this is a label
       change on top of an already-correct target, not a second fix), any
       UI label. Zero behavior change; pure honesty fix, same class as the
       `bridge`→`RAID` axiom rename already done.
    
    2. **The `nexus-system-slot` compartment itself — Part 5 named this and
       scoped its 5 files; still not built.** This is the concrete blocker.
       Nothing below works until this compartment exists as real content
       idearium can actually seed from.
    
    3. **Genesis's own checklist, made explicit as real schema chunks —
       not new infrastructure, a real content requirement on the compartment
       above.** James's list (kernel/runtime/engine, architecture,
       dependencies, file tree, data structure, memory architecture, schemas
       per data type, command/API/system map, configs, uuids/ids/types,
       needed components from the store with categories) maps directly onto
       `genesis.spec`'s own real, already-declared vocabulary
       (`kernel`/`runtime`/`engine`/`spine`/axioms) plus the per-system
       `interaction-contract.json` (routes = the API map), `event-
       taxonomy.js` (the event half of the command map), and P8's per-system
       component registry (the "needed components, with categories" part —
       P8 is *already scoped* to build this, just not yet built). Genesis
       needs each of these named as a real, distinct spec chunk/section — a
       content decision, not a new mechanism.
    
    4. **The one genuinely new layer: copilot as a real, per-block Q&A
       wizard.** Nothing today walks a person through a spec chunk-by-chunk,
       explains each real option in plain language, takes "you pick" as a
       real instruction (copilot reasons about fit, replies with its pick
       *and* the reasoning, as a question — "I'd suggest X because Y — sound
       right?" — not a silent default), and asks clarifying questions before
       accepting something off-list. `idearium/spec-engine/chunk-
       dispatch.js`'s real per-chunk dispatch (retry ladder, verification)
       is the right real mechanism to extend — it already dispatches one
       chunk at a time to an agent; it doesn't yet have a conversational,
       explain-and-confirm mode. This is real, scoped, buildable work — not
       a redesign — but it doesn't exist yet anywhere in this codebase today,
       confirmed by checking chunk-dispatch.js directly rather than assumed.
    
    **My honest read:** this is a good idea specifically *because* almost
    none of it requires new architecture — it's real content (the
    compartment) plus one real UX layer (the Q&A wizard) sitting on top of
    mechanisms that already work end to end. The risk is building the Q&A
    layer before the compartment exists — there'd be nothing real for it to
    walk someone through yet. Compartment first, wizard second.
    
    ---
    
    ## Part 8 — ClearGlass as a draggable compartment: a real gap, and it's a new layer, not a rename
    
    James, live: run ClearGlass inside a compartment so it can be dragged
    around. Checked against the actual code rather than assumed:
    
    **The premise is confirmed, not just reported.** `clear-glass/src/main/
    index.js` creates three windows, all `frame: false` (lines 1557, 1745,
    1822) — genuinely borderless everywhere in the app, and the file's own
    header comment (191-222) explains why: frameless windows plus
    `<webview>` tags both depend on the GPU process, so `frame: false` is
    load-bearing for the app's own compositing strategy, not an oversight.
    
    **ClearGlass already solved this once, for itself.** `clear-glass/
    renderer/browser.js` gives its own top-level window a synthetic drag
    strip — `#chrome` carries `-webkit-app-region: drag` so Electron's
    native window manager still lets James move the frameless window by
    its empty chrome area. There's even a real, dated bugfix on this exact
    mechanism (§BUGFIX 2026-08-30, browser.js ~2455): the 10px drag handle
    let the pointer drift off the region mid-drag and get stuck, fixed by
    tracking pointer move/up on `document` instead of just the handle —
    `-webkit-app-region: drag` is a real but fragile pattern, already
    proven fragile once in this exact codebase.
    
    **Why that fix doesn't carry over.** `-webkit-app-region: drag` only
    works because that CSS is painted inside ClearGlass's *own* top-level
    `BrowserWindow` — Electron's native window manager reads it directly.
    Running ClearGlass "in a compartment" means it's no longer the
    outermost window; it's hosted inside the wider Nexus/COS desktop. A
    webview or embedded surface has no native window of its own for that
    CSS property to move — the app-region trick has nothing to attach to
    once ClearGlass isn't the top-level window anymore.
    
    **Checked for an existing layer that already does this — none found.**
    `cos/host/` (`event-bus.js`, `state-store.js`, `system-map.js`,
    `gates/compartment.js`) is COS's real compartment-hosting code today,
    and `cockpit/` is effectively empty in this tree. Neither has anything
    resembling a draggable-panel desktop shell. Unlike most of this doc,
    this isn't a rename or an already-built-but-unwired feature — it's a
    genuinely new layer.
    
    **Proposed shape, grounded in what already exists:** a thin COS-level
    compartment host (natural home: alongside `cos/host/`'s existing
    gates) that gives each hosted compartment its own synthetic chrome —
    a title-bar strip carrying the drag region — and reuses the
    document-level pointer-tracking pattern ClearGlass's own 2026-08-30
    fix already proved out, since that's a known-fragile mechanism with a
    known fix already sitting in this codebase. ClearGlass itself keeps
    `frame: false`; the compartment host's chrome absorbs the drag
    surface, and the host — not Electron's native app-region handling —
    is what repositions the compartment on drag.
    
    **Real open question, not resolved here:** whether "compartment" means
    a second real `BrowserWindow` that the COS host moves programmatically
    (`setBounds` under the same pointer tracking) or true in-page embedding
    (`<webview>`) where the host draws the chrome and there is no OS-level
    window to move at all. The two are architecturally different — the
    `BrowserWindow` route keeps ClearGlass's own GPU/compositing story
    (Part 8's opening comment) untouched; the `<webview>` route is closer
    to how ClearGlass already embeds *other* sites inside itself, but
    inherits the same GPU-process coupling the header comment warns about,
    one level up. Worth deciding before building either.
    
    ## Bottom line
    
    Three passes of this conversation (mine, ChatGPT's, this one) each
    independently re-derived pieces of a plan that already exists, dated, in
    this repo, with real audit findings attached. The honest next move isn't
    another synthesis — it's picking up `2026-09-11-sovereign-node-
    architecture-phasemap.spec` at P1 (fix `nexus.spec` — zero dependencies,
    checkable today) and P3 (the schema-ownership decision, which is a real
    open question, not something either of us should pick from outside
    context).

  # ── 2026-10-10 — brought back, and what was missing (additive) ─────────────────────────────────────────────────────
  # James: "im saying all systems are supposed to be like guardian with the nodes. like look at the architecture spec. like
  # the node taxonomy, also cortex data is clumped together instead of being decoupled. like all data is the relative
  # systems job to create, read, manage, integrate into the index for each node as tables for each, then its a jaa database
  # which is also a node, all timestamped and holds the history, connects to the lattice as nodes, that makes them dynamic,
  # copilot can read them, edit and create them. so they can expand contract and grow with the system." · "routes and cli
  # commands, and the component registry for each system, as an interaction contract, and event bus, each component uses
  # the registry sorted by module, and then each system uses for ineraction and handoffs, the ui floats on top. then a
  # event ledger for each registry?"
  # Kept from this map: P2 contracts, P3 node schemas, P4 node coverage, P5 data home (with DS1/DS2 of the cli-data-code
  # map, also brought back), P6 contract schemas, P8 component registry per system, P13 contract + handshake per call,
  # P19–P22 the causal field (their awareness half is docs/2026-10-10-self-awareness-phasemap.spec, which builds on them).
  phases_added_2026_10_10:
    P33_every_system_runs_its_node_registry:
      systems: [core, cortex, guardian, idearium, copilot, intelligence, versionium, cos, loom, orchestrator, architect, diagnostic, eravos, clear-glass, ollama, emerge, warp]
      status: open
      depends_on: [P3_per_system_node_schemas, P5_data_folder_completion]
      description: |
        The architecture spec's AS1, made the rule: guardian/lib/node-registry.js's pattern (a watcher per node type, a
        JAA table per type as the index, a ledger per type with every change timestamped) runs in EVERY system, over that
        system's own data/nodes/ and its own JAA store. Only guardian's watcher runs today. The store itself is a node
        (.store: owner, tables, counts, hash, location), so cortex's catalog (DS1) is a list of store nodes, not a copy.
    P34_nodes_in_the_lattice:
      systems: [intelligence, cortex]
      status: open
      depends_on: [P33_every_system_runs_its_node_registry, P19_dynamic_nodes_via_causal_graph]
      description: |
        Every node (not only system pairs) is a lattice node: its relations to other nodes carry a field, so a node grows
        and shrinks with its use — "that makes them dynamic". Bounded: live nodes in RFR2's ring buffer, the rest in the
        owner's store, re-entered when touched.
    P35_copilot_reads_edits_creates_nodes:
      systems: [copilot, core]
      status: open
      depends_on: [P33_every_system_runs_its_node_registry]
      description: |
        Through each system's contract, never its files: copilot (and any agent, through nexus.command) lists, reads,
        creates, edits and archives a system's nodes; the owning system validates against its schema, writes, indexes and
        ledgers. A new node type is proposed the same way (its schema a node too), so the taxonomy can expand and contract.
    P36_an_event_ledger_per_registry:
      systems: [core, cortex, guardian, idearium, copilot, intelligence, versionium, cos, loom, orchestrator, architect, diagnostic, eravos, clear-glass, ollama, emerge, warp]
      status: open
      depends_on: [P8_per_system_component_registry]
      description: |
        Each system's registry (components sorted by module — P8's "core components, then each module with each
        component") has its own event ledger: every event a component emits or handles, by the event taxonomy, written by
        the owner, timestamped. lib/component-ledger.js already writes per system / per component / per day; it becomes the
        registry's ledger rather than a shared one, and the event taxonomy exists for every system (8 of 16 have one).
    P37_the_ui_floats_on_the_registry:
      systems: [idearium, clear-glass, orchestrator]
      status: open
      depends_on: [P8_per_system_component_registry, P36_an_event_ledger_per_registry]
      description: |
        A system's screens are drawn from its registry and its event ledger — the components, their state, their events —
        not from state the UI keeps. The same stack for every system, top to bottom: UI → interaction contract (routes,
        CLI commands) → component registry by module → event bus → event ledger → node registry → its own store. Systems
        hand off to each other only through the contract (P13).
