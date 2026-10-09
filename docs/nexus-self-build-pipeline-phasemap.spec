spec:
  meta:
    name:    nexus-self-build-pipeline
    version: 0.1.0-phasemap
    status:  PHASEMAP 2026-08-13. Mapped, not built. §3.3 — map before build.
    uuid:    nexus-self-build-pipeline-v0-0000-2026-0813-001
    intent: >
      The full loop: co-pilot guides a person through modifying/building/
      repairing/expanding NEXUS from inside NEXUS itself — plan, spec,
      contract, RAID, compartment, agent dispatch, SSE artifact detection,
      quality-check comparison against the open contract, close — every step
      tagged, logged, and durable, nothing lost. And loom's schemas (hook/
      component/wire) extensible enough to keep describing NEXUS accurately
      as it grows, with real directory/context/history on every component.

  major_finding: >
    Re-checked before writing a single new module (§3.3) — almost every named
    piece of this already exists, real, in fragments:
      - copilot/lifeline.js — REAL confidence-threshold escalation router
        (Ollama primary -> Guardian NCP fallback -> honest error, never
        silent). This IS "if co-pilot doesn't understand, ask/escalate,"
        already built for the model-routing case. AM5 (agent-model-and-
        user-continuity-phasemap.spec)'s ambiguity-pull should EXTEND this,
        not build a parallel escalation path next to it.
      - switch-agent — CONFIRMED wired: copilot/server.js's directed-intent
        handler calls self-model.js's real switchAgent(). Direct answer to
        "is the command to switch the agent working in co-pilot" — yes.
      - cortex/versionium/ — REAL causal version control. Auto-commits on
        sigma deviation, writes versionium_commits/branches, uses
        meta/cfr/graph.js's real CausalGraph for the "why" (causedBy) and a
        separate parentId for "what came before" (deliberately two different
        questions, per its own header). This IS "previous versions with
        history, snapshots of previous files."
      - meta/lattice/associative-lattice.js — REAL persistent graph (not a
        query result, per its own header), updateEdge/getEdge. This IS the
        "associative lattice / decision graph / node-based lattice."
      - lib/reflection.js — REAL Phase 11 Reflection Engine. Scores
        decisions, writes back via decisionLogUuid (never guessed via
        timestamp matching), tracks consecutive low-satisfaction streaks,
        opens a KNOWLEDGE or CAPABILITY loop past threshold. This IS "queue
        for reflection" and most of "each decision logged and tracked."
      - loom's wire schema ALREADY HAS an `intent` field in code
        (loom/schema/registry.js) — but checked the real data: every sample
        wire in loom/data/registry.json has it null. Declared, not real yet.
        No `type` field exists at all.
      - loom's component schema (checked the real data): {uuid, id,
        namespace, name, version, registeredAt} — no `dir` field. Confirmed
        absent, not assumed.
    The pattern holds from every prior phasemap this session: the request is
    realistic because the substrate is already fragmented-but-real, not
    because it's small. The work is wiring + closing specific named gaps,
    not inventing a system.

  substrate_already_built:
    - "copilot/lifeline.js + copilot/lib/lifeline-contracts.js — confidence-threshold escalation, real."
    - "cortex/versionium/ (index.js + causality.js) — causal version control, real, uses meta/cfr/graph.js's CausalGraph."
    - "meta/lattice/associative-lattice.js — persistent decision/associative graph, real."
    - "lib/reflection.js — decision scoring + satisfaction streaks + KNOWLEDGE/CAPABILITY loop opening, real."
    - "self-model.js's switchAgent(), wired into copilot/server.js's directed-intent handler — real, confirmed live."
    - "lib/agent-system/contracts.js + submit.js (built this session) — the per-agent contract + output/RAID pipeline this whole self-build loop dispatches through."
    - "lib/emergence.js (built this session) — axioms+endState verify loop, the real 'build/repair/expand and verify it actually worked' mechanism this phasemap's SB3 reuses."
    - "loom/contracts/index.js (LoomContracts) — real compartment lifecycle, wired into loom/server.js's /api/contracts. The 'open compartment per contract' piece."
    - "cortex/core/raid/index.js's verifyInIsolation() — the real isolate->verify->compare->drift-score->snapshot-on-fail pipeline every contract in this loop routes through."
    - "lib/component-ledger.js + lib/gap-field.js — the real per-system/per-component ledger and repair-contract schema this loop's 'tagged, logged, tracked' requirement extends."

  governing_axioms:
    - "§3.3 map first — this file, and the major_finding above specifically, before touching loom's schema or building a new escalation path next to lifeline.js."
    - "§8.6 reuse — every phase below extends a real module found this pass, none forks one."
    - "§10.3 one source of truth — one wire schema, one component schema, one decision-log/reflection path, not a second copy anywhere."
    - "§0.3 nothing lost — every contract's full lifecycle (file, ledger row, RAID verdict, compartment state) stays queryable after close, not archived-into-silence."
    - "§RAID governs every contract this loop opens — same governance already used everywhere else today."

  phases:

    SB1_schema_extension:
      priority: FOUNDATION
      status: "✓ DONE 2026-08-14. Built bottom-up per §3.1/§8.5, tested per §12.1 (35/35 in loom/test/schema.test.js including 14 new hostile-input tests, 0 regressions across adjacent contracts.test.js/history-routes.test.js — 16/16). Real fixes shipped: optional dir(component)/type(wire) fields, checked locally in loom's own gates (warp/core/Gate.js's shared validateOutput() only checks required-key types, confirmed by reading it directly — modifying it would have changed every gate system-wide, so this stayed local per §5.9/§16.6). schemaVersion default (§5.4). getComponentHistory() in lib/loom-map.js — a real historyRef query composing component-ledger + gap-field, not duplicated storage (§10.3). AND: found and fixed the actual root cause of 'wire intent is always null' — loom/scanners/source-map.js (the scanner generating the bulk of real wires via require() analysis) and loom/bootstrap.js's own seed example both never set intent at all, while capability-map.js's scanner already did — inconsistent, not universally broken. Both fixed with honest, real intent strings, not fabricated narrative."
      depends_on: []
      does: >
        Additive, backward-compatible fields on loom's real schemas (same
        pattern as today's gap-field `component` addition): (a) `dir` on
        components — the real filesystem directory a component lives in,
        populated at registration time from the caller's own path, cross-
        checked against loom-map.js's existing resolveComponent() rather
        than a second lookup; (b) `type` on wires (e.g. 'http'|'event'|'ipc'|
        'sse'|'direct-call' — drawn from what wires already ARE in this
        codebase, not invented categories); (c) actually POPULATE `intent`
        on wire registration (the field exists, is read by dependents/
        directDependents already, and is simply never written) — a real,
        small, high-leverage fix, same class as the once:true trigger bug
        found earlier today. Schema versioning itself (so hook/component/
        wire schemas can keep growing later without another manual pass)
        gets a real `schemaVersion` field, checked on read, not enforced
        strictly on write (additive fields shouldn't break old readers).
        (d) NEW, verified this pass: components still have NO history
        pointer — checked loom/data/registry.json directly, real fields
        are exactly {uuid, id, namespace, name, version, registeredAt}.
        A `historyRef` field (not embedded history — that would duplicate
        component-ledger.js's real errorsByComponent() and violate §10.3)
        pointing callers at the real query (component-ledger.js's
        errorsByComponent({component: id}) plus gap-field's real
        openGaps({source: id})) is the additive fix — one line on read,
        zero duplication of the actual history data.
        (e) NEW, verified this pass: nothing found (grepped loom/schema/
        registry.js and loom/server.js directly for registerComponent/
        mustRegister/unregistered — zero hits) enforces that an integrated
        change actually gets registered. Registration today is opt-in, not
        gated. SB3's real pipeline (plan->...->close) needs its close step
        to CALL loom's registration as part of closing the compartment —
        a contract that closes without a corresponding loom registration
        is left open/flagged, not silently marked done. This is the literal
        "it can't go unmapped in the registry" requirement — a gate on
        SB3's close step, not a new enforcement subsystem.
      reuse: "lib/loom-map.js's resolveComponent() for dir cross-checking, not a second path lookup. Existing wire `intent` field/consumers (dependents/directDependents in loom/schema/registry.js) — populate, don't rename. lib/component-ledger.js's real errorsByComponent() + lib/gap-field.js's real openGaps() for (d) — referenced, not duplicated."
      gate: "a freshly registered component has a real dir field pointing at an actual, existing directory; a freshly registered wire has both type and a non-null intent; an old component/wire row (pre-migration) still reads fine with those fields absent, not erroring. (d) historyRef on a real component resolves to real, non-empty results when that component has real ledger/gap history. (e) a real SB3 close attempted WITHOUT a loom registration call is caught and flagged, not silently accepted as done."
      axioms: ["§8.6", "§10.3", "§0.3"]

    SB2_universal_file_parse:
      status: 'LATER — off the path — parse-any-file, the decision lattice, contract schemas, compartments as sessions, Clear Glass control (declutter 2026-10-09)'
      depends_on: []
      does: >
        Co-pilot 'read and parse any file in NEXUS' — extends the real
        read_file tool + tool-index.js's living inventory with structured
        parsing per file type (JS: AST via require('acorn') or similar,
        real component/hook/wire declarations extracted, not just text;
        JSON: real schema-aware parse; .spec files: the real YAML phasemap
        shape this session's own specs already use) rather than one generic
        text-only reader. Feeds SB1's dir/schema data directly — parsing a
        file IS how a `dir`/component/hook/wire gets discovered in the
        first place, not a separate concern.
      reuse: "lib/agent-tools/tools/read-file.js as the base; lib/loom-map.js as the target these parsed declarations get cross-checked against."
      gate: "parsing a real .js file with a component_id + hooks + wires produces structured data matching what loom's registry would independently say about that same file, not a second, divergent source of truth."
      axioms: ["§10.3", "§8.6"]

    SB3_guided_build_loop:
      path: 'step 2 — the same loop, for NEXUS itself: plan → spec change → phases → build (declutter 2026-10-09)'
      priority: THE ACTUAL PIPELINE — plan -> spec -> contract -> RAID -> compartment -> agent -> artifact -> quality-check -> close
      depends_on: [SB1, SB2]
      does: >
        The literal pipeline described: co-pilot helps plan -> spec change
        drafted (a phasemap-shaped addition, same convention as every spec
        this session wrote) -> a real contract opened via lib/agent-system/
        submit.js -> RAID verifies (real verifyInIsolation, already built)
        -> a real compartment opens per contract (loom/contracts/index.js's
        LoomContracts, already wired) with axioms+endState set from the
        spec (lib/emergence.js's real shape, already built) -> dispatched to
        the agent named in the contract -> the agent's artifact is detected
        via SSE (clear-glass's real :7701 SSE server + guardian NCP channel,
        both already live) by filename+language, not polled -> the agent's
        own contract is what it's held to (comparison against WHAT WAS
        ASKED, not a generic check) -> RAID re-verifies the artifact against
        the still-open contract -> on pass, compartment closes
        (recordHandoff/closeContract, real) and the file moves through
        data/agents/<id>/outputs/ (real, built this session) into wherever
        it's actually integrated -> on fail, emergence.js's real method-
        pivot path runs before declaring the contract failed outright.
        EVERY step writes to component-ledger (real) and gap-field (real)
        with the contract's uuid as the join key, so the full lifecycle —
        plan through close — is one queryable chain, not scattered logs.
      reuse: "Literally everything in substrate_already_built above — this phase is the composition, not new mechanism, of: agent-system (this session), RAID verifyInIsolation, LoomContracts, emergence.js (this session), clear-glass SSE, component-ledger, gap-field."
      gate: "a real, small, low-risk change (e.g. one of SB1's own schema additions) goes through this full pipeline end-to-end — plan through close — with every step's row queryable afterward by the contract's uuid, and a deliberately-broken candidate demonstrates the fail->pivot->fail-again->honest-decline path, not a silent pass."
      drift: "this is the highest-ceremony phase in either phasemap this session — a real end-to-end dry run on something trivial and reversible before anything build/repair-shaped and consequential goes through it."
      axioms: ["§RAID", "§0.3", "§8.6", "§1.1"]

    SB4_decision_lattice_wiring:
      status: 'LATER — off the path — parse-any-file, the decision lattice, contract schemas, compartments as sessions, Clear Glass control (declutter 2026-10-09)'
      depends_on: [SB3]
      does: >
        Every co-pilot decision in SB3's loop gets a real node in
        meta/lattice/associative-lattice.js's persistent graph (not a new
        lattice), edges to the contract, the RAID verdict, the compartment,
        and (via versionium's real CausalGraph reuse) the causal ancestor —
        why this decision happened, not just that it did. lib/reflection.js's
        real queue picks these up the same way it already does for
        request-handler's decision_log — SB3 write-through, not a second
        decision-scoring path.
      reuse: "meta/lattice/associative-lattice.js's real updateEdge/getEdge. cortex/versionium/causality.js's real CausalGraph reuse pattern (its own header explicitly models this: causedBy vs parentId as two different real questions). lib/reflection.js's real queue/scoring, unmodified."
      gate: "a real SB3 contract's full decision chain (plan -> spec -> RAID verdict -> compartment close) is walkable as a real graph query through the lattice, and shows up in reflection.js's queue the same way any other decision_log row already does."
      axioms: ["§10.3", "§8.6"]

    SB5_self_modification_from_inside:
      path: 'step 3 — NEXUS changed from inside NEXUS, through the loop (declutter 2026-10-09)'
      priority: HIGHEST CEREMONY, HIGHEST VALUE
      depends_on: [SB3, SB4]
      does: >
        The thing named directly: NEXUS building itself from INSIDE NEXUS
        (loom UI, co-pilot, or the agent chat UIs) the way this session
        built it from outside. Requires finding and replacing whatever stub/
        mock code currently sits where a real dispatch should be in
        whichever of those three UIs is chosen first (not assumed to be all
        three — audited per-UI, same as today's /ui/agents filler audit that
        turned out to be mostly real already). The real capability
        (SB3's whole pipeline) already exists headless; this phase is
        surfacing it as an actual UI-driven trigger, not new backend.
      reuse: "SB3's entire pipeline, unmodified — this is a UI/trigger-surface phase, not a new capability."
      gate: "a real, small, reversible change is initiated from inside one of the three UIs (not via an external session like this one) and completes through SB3's full loop, visibly, the same as SB3's own gate case but human-triggered from in-product rather than scripted."
      drift: "the exact same stub-vs-real distinction that made R3 (autonomous-repair) dormant for a day needs auditing HERE too, per-UI, before claiming this phase done — check don't assume, same discipline."
      axioms: ["§1.1", "§RAID", "§8.6"]

    SB6_contract_type_schemas_and_toolbox_directory:
      status: 'LATER — off the path — parse-any-file, the decision lattice, contract schemas, compartments as sessions, Clear Glass control (declutter 2026-10-09)'
      priority: MOSTLY ALREADY REAL — verified, not assumed, this pass.
      depends_on: [SB1]
      does: >
        Two asks, both closer to done than expected: (a) "schemas for each
        contract type" — build/module/expansion/repair. Repair already has
        a real schema (gap-field.js's R1 fields, extended today with
        `component`). Build/module/expansion don't have their own named
        schemas yet — this phase gives each the SAME repair_contract_schema
        SHAPE (requested/received/systemsInvolved/location/resourceState/
        why/component) with a `contractType` discriminator field rather
        than three new, divergent shapes — one schema, one discriminator,
        not four schemas to keep in sync (§10.3).
        (b) "toolbox needs a dynamic directory, logs edge cases" — ALREADY
        REAL, verified directly: lib/tool-index.js's register()/record()
        (lines 31-64) already track exactly {id, file, dir, provides,
        intents, consumers, edgeCases[]} per tool, edgeCases populated
        automatically whenever a real call has obs.ok===false or
        obs.edgeCase, bounded at 50 entries (oldest dropped). Nothing to
        build here except confirming every real tool call-site actually
        reports through record() — an audit phase, not a build phase.
      reuse: "gap-field.js's real repair_contract_schema shape, extended with one discriminator field — not three new schemas. lib/tool-index.js's real register()/record() — confirmed already doing exactly what was asked; this phase is verification that every real tool call site reports here, not new code."
      gate: "a build/module/expansion contract round-trips through the same validation gap-field.js already has for repair, distinguished only by contractType. Every real tool in lib/agent-tools/tools/ has a non-empty tool-index.js entry after being called at least once in a real session — audited, not assumed."
      axioms: ["§10.3", "§8.6"]

    SB7_compartments_as_sessions:
      status: 'LATER — off the path — parse-any-file, the decision lattice, contract schemas, compartments as sessions, Clear Glass control (declutter 2026-10-09)'
      priority: NEW — the most structurally novel idea this pass; genuinely extends real COS infrastructure rather than wrapping it.
      depends_on: [SB1]
      does: >
        Elevates COS (cos/host/index.js, real, CLI-first) from a build-
        verification/stress-testing backend into a conversational primitive:
        "make a new compartment" -> co-pilot asks for axioms + end-state
        (the exact shape lib/emergence.js's spec.axioms/spec.endState
        already uses, real, built this session — reused, not reinvented) ->
        cos-compartment.js's real createCompartment() opens it -> the
        compartment is a real mini-world: a replayable slice of time, a
        sandbox pre-seeded with real components reused from the codebase
        (via lib/loom-map.js's real resolveComponent(), built this session)
        or scaffolded from a schema+catalog template. Default 24h decay
        (a real, scheduled removal via lib/scheduler.js — one of the six
        real queue-shaped modules SB6 already catalogued, not a new timer
        system). Created-via-copilot compartments write to a real ledger
        row (lib/component-ledger.js's write(), real) AND an index entry
        in cortex (jaaDB, a `compartments` table, new but tiny — just
        {uuid, name, createdAt, decayAt, axioms, endState, status}) so
        "what compartments exist right now" is one real query, not a
        filesystem listing. Deletion removes both the real COS compartment
        (destroyCompartment(), real) and its ledger/index rows together —
        never one without the other (§0.3 — a compartment that's gone from
        disk but still listed as existing is worse than either failure
        alone).
      reuse: "cos/host/index.js + cos-compartment.js's real createCompartment/startCompartment/stopCompartment/destroyCompartment/listCompartments (lib/agent-tools/tools/cos-compartment.js already wraps these as a real tool, confirmed this session). lib/emergence.js's real axioms/endState shape — the SAME prompt shape, not a new one. lib/loom-map.js's real resolveComponent() for pre-seeding from the real codebase. lib/scheduler.js for the real 24h decay, not a new timer."
      gate: "a real 'make a compartment' request produces a real COS compartment (verifiable via cos-compartment's real list action) AND a real cortex index row, both referencing the same uuid. A real deletion removes both. An un-deleted compartment past 24h is actually gone, verified by checking BOTH the real COS state and the cortex index agree it's gone, not just one of them."
      drift: "the two-sided delete (COS + cortex index) is the real risk here — a partial failure (COS destroyed, index row orphaned, or vice versa) needs to be a visible, logged inconsistency, not silently tolerated."
      axioms: ["§8.6", "§0.3", "§RAID"]

    SB8_tool_agnosticism_and_new_tool_flow:
      status: 'LATER — off the path — parse-any-file, the decision lattice, contract schemas, compartments as sessions, Clear Glass control (declutter 2026-10-09)'
      depends_on: [SB6]
      does: >
        (a) AGENT/MODEL AGNOSTICISM — when an agent is scoped OUT of a tool
        (lib/agent-system/contracts.js's real personality.allowedTools,
        checked via the real agentCan(), built this session) or genuinely
        fails to use one it IS scoped for, that gets logged as a real
        capability-matrix entry (agentId x toolId x capable:boolean),
        distinct from tool-index.js's existing edgeCases[] (which logs
        WHAT went wrong on a call, not WHETHER an agent can use a tool at
        all) — an additive field on tool-index.js's real per-tool row, not
        a second registry.
        (b) "LET'S MAKE A NEW TOOL FOR YOU" — ALREADY REAL, verified
        directly: copilot/module-builder.js's own header — "Co-pilot builds
        its own modules from user descriptions. Always: map -> spec -> QC
        -> contract -> build -> verify -> merge" — is precisely this, built
        on lib/contract-queue.js (one of SB6's six real queue-shaped
        modules) and copilot/axiom-manager. This is the SAME shape SB3's
        guided build loop already maps — module-builder.js is a real,
        existing, narrower-scoped implementation of SB3's general pipeline,
        specifically for tools/modules. SB3 should reuse module-builder.js
        for the tool/module case rather than re-deriving it.
        (c) TASKER-LEVEL AUTOMATION — needs an honest comparison, not an
        assumption either way, against the real CA1-CA7 substrate
        (scheduler/triggers/chains/connections/system-control/command-
        builder/constant-autonomy, ALL DONE 2026-08-08 per copilot-
        autonomous-phasemap.spec) before claiming this is missing or
        already sufficient — deferred to its own small audit phase, not
        assumed either way here.
        (d) CALENDAR TOOL — lib/agent-tools/tools/schedule-task.js exists
        but is task-scheduling (a real cron/interval concept), not a
        calendar (events, times, reminders, a queryable day/week view).
        Real, honest gap — schedule-task.js is the closest existing
        substrate, not the same thing.
      reuse: "lib/tool-index.js's real register()/record() row shape, extended not forked (a). copilot/module-builder.js, entirely reused, not rebuilt (b). lib/contract-queue.js, already real (b)."
      gate: "(a) a real scoped-out tool call attempt produces a real, queryable capability-matrix entry, distinct from an edgeCase note. (b) a real 'make me a tool that does X' request goes through module-builder.js's real existing pipeline end to end, producing a real merged module — this phase's gate is confirming that pipeline still works today, not building a new one."
      axioms: ["§8.6", "§10.3", "§1.1"]

    SB9_full_clearglass_control:
      status: 'LATER — off the path — parse-any-file, the decision lattice, contract schemas, compartments as sessions, Clear Glass control (declutter 2026-10-09)'
      priority: THE FINDING THAT MATTERS MOST HERE — the element picker isn't a gap, it's an ORPHAN.
      depends_on: []
      does: >
        (a) ELEMENT PICKER — ALREADY FULLY REAL AND STREAMING, verified
        directly across four files: clear-glass/src/dom/archaeology.js
        emits real sse.emit('dom.picked', pick) and sse.emit(
        'dom.pick.registered', pick) (lines 213, 265); clear-glass/src/
        gates/index.js has a real domPickGate (line 67); clear-glass/src/
        ipc/bridge.js wires ipcMain.handle('dom:pick', ...) (line 148);
        lib/agent-tools/tools/browser-action.js already exposes dom_pick
        as a real action (line 50). What's missing, confirmed by grepping
        copilot/server.js directly for 'dom.picked' — ZERO hits: co-pilot
        never subscribes to the stream that already exists. This phase is
        one SSE listener, not a picker, a gate, an IPC bridge, or a tool —
        all four already exist and work.
        (b) DOM Q&A TOOL — reads questions FROM the page DOM and injects
        into copilot. New, but composes real primitives: browser-action's
        real dom_query action to read the DOM, plus (a)'s now-consumed
        dom.picked stream to know WHICH element the question is anchored
        to, submitted through lib/agent-system/submit.js's real pipeline
        (built this session) as a real contract action.
        (c) DEEP RECURSIVE DOM PARSING — extends SB2's universal file-parse
        phase's structured-parsing pattern to DOM trees specifically, via
        browser-action's real dom_query, not a new parsing engine.
        (d) "ANYTHING A BROWSER CAN DO" — honest scope note, not a
        blank check: browser-action.js's REAL_ACTIONS today are navigate,
        dom_query, dom_mutate, dom_pick, driver_exec, cookies_save/restore,
        url_listen/unlisten (confirmed this session). Real, growing, but
        finite — this phase widens it incrementally (starting with (a)-(c))
        rather than promising unbounded browser capability up front.
      reuse: "clear-glass's real dom.picked/dom.pick.registered SSE events (a) — subscribe, don't rebuild. browser-action.js's real dom_query (b, c) — the same tool, new composition. lib/agent-system/submit.js's real pipeline (b) — the same contract flow every other agent output already goes through."
      gate: "a real element pick in ClearGlass produces a real, logged event on co-pilot's side within the same session — verified by picking a real element and checking co-pilot's own log/state for it, not just confirming the SSE event fires on ClearGlass's side (which it already does, proven, not this phase's job to reprove)."
      axioms: ["§8.6", "§0.3"]



  ordering_rationale: >
    SB1 (schema) and SB2 (parsing) are independent, cheap, foundation for
    everything downstream — build first, in either order. SB3 is the real
    pipeline and the highest-value phase, but depends on both. SB4 (lattice
    wiring) rides on SB3 existing to have real decisions to wire. SB5
    (in-product self-modification) is last — it's a UI surface over SB3's
    already-working pipeline, not new capability, and should only go in once
    SB3 has a real track record via its own gate case.

  honest_risks:
    - "5 phases, and SB3/SB5 are both genuinely high-ceremony — this composes nine-plus real subsystems into one pipeline. A staged rollout (SB3's gate case first, on something trivial) matters more here than almost anywhere else in either phasemap this session."
    - "SB5 risks repeating R3's exact failure mode (built, wired nowhere) if the per-UI stub audit is skipped — explicitly gated on checking, not assuming, same as this session caught twice already today."
    - "SB1's wire `intent` population is small but touches every future wire registration — worth confirming it doesn't silently change existing dependents()/directDependents() behavior for any consumer relying on intent currently being null."
    - "SB7's compartment decay (24h default) needs a real reaper, not just a documented intent — an undecayed compartment silently living forever is the same class of gap as R3's dormant wiring."
    - "SB9(a)'s dom.picked consumption is genuinely small, but it's the kind of 'just add the listener' fix that's easy to under-scope — confirm copilot actually does something useful with a picked element (log it, inject it as context) before calling this phase done, not just that it receives the event."

  first_build: "SB1 — smallest, safest, immediately useful to every other phase (SB2 onward all read dir/type/intent), and the exact 'declared field, never populated' bug class this session already knows to check for. SB9(a) is the other strong candidate — a single missing SSE listener between two already-fully-real systems."
