spec:
  meta:
    name:        nexus-sentinel
    version:     0.4.0-spec
    status:      SPEC ONLY — no code written against this yet. Per §8.5
                 (spec before build) and §3.3 (map before build).
    revision_0_2_0: >
      v0.3.0 (2026-07-24) — TWO CORRECTIONS FROM JAMES, both of which the
      execution layer had got wrong:
      (a) DECOUPLING. "Everything in nexus is supposed to be decoupled. Using
          the event bus and api, and cli. Sse. Nothing is supposed to be
          hardwired to another." v0.2.0 did not state this as a constraint on
          the sentinel's own consumption. It does now — see decoupling_law
          and SEN-9. Note the violator is CORTEX, not the sentinel:
          cortex/boot.js:113-119 `require`s the intelligence faculties
          in-process, while copilot correctly fetches them over HTTP.
      (b) COPILOT IS THE MIND, NOT CORTEX. v0.2.0's prose described "asking
          cortex" for intuition. Wrong, and an inversion of the architecture:
          copilot/server.js is the Sovereign Co-pilot System (port 3750) with
          its own intuition/adversarial/analysis/recursive-diagnose, and its
          P110 dual-cognition wire QUERIES cortex over HTTP before Ollama
          dispatch. Copilot thinks; cortex remembers. The sentinel must not
          become a third thinker — it reports faults to the mind, it does not
          replace it.
      v0.4.0 (2026-07-24) — James closed the loop: "The interaction happens
      in the contracts gated and verified with the handshake, logged as a
      fault if it fails, any fault or failure mode gets logged, tracked in
      the system. Intelligence system which needs to use the ledgers and the
      causal graph also to track when and why faults and failure modes
      happen. The conditions and when they started." Adds the_loop, the
      universal ledger schema (with pushback applied), and names two REAL
      unclosed wires found while specifying it: intelligence reads no causal
      graph, and onset ("when they started") is recorded nowhere.
      v0.2.0 — James asked "does it use the intelligence system, and lib/meta". The
      honest answer was NO, and that was a real hole: v0.1.0 specced the
      sentinel detecting faults and running a repair ladder with NO memory of
      which faults had been seen before or which repairs had worked — while
      cortex/intelligence already maintains exactly that. Worse, it would
      have been a SECOND pattern-recognition path beside intelligence's,
      which is the §10.3 competing-truth failure this spec's own SEN-1
      forbids. v0.2.0 adds the intelligence section, names the meta/
      subsystems explicitly, and adds SEN-8.
    uuid:        nexus-sentinel-v0-0000-2026-0724-001
    author:      James Brooks (architecture) / execution layer (mapping)
    one_line: >
      The sovereign diagnostic-and-repair system: detects faults event-driven
      rather than by polling, governs every repair through a gated
      interaction contract, ledgers everything to cortex, and notifies
      surfaces without owning their state.

  # ══════════════════════════════════════════════════════════════════════════
  # READ FIRST. §1.1 — nothing is real until it runs. This is a CONSOLIDATION
  # of four things that already exist, not a greenfield build. Building it as
  # greenfield would create a FIFTH diagnostic surface, which §16.5 forbids
  # and §10.3 makes actively harmful (competing truths about system health).
  # ══════════════════════════════════════════════════════════════════════════
  what_already_exists:
    service_nexus_diagnostic:
      path: service/nexus-diagnostic.js
      size: ~2100 lines
      status: SUPERVISED AND LIVE — autopilot phase 2, port 7825
      owns: >
        ICO kernel with its own ledger. Reads all system ledgers, computes
        sigma/friction/drift per system, detects gaps (baseline deviation,
        missing heartbeats, stuck queues), surfaces via SSE + REST.
      verdict: >
        This is ~80% of the sovereign system already. It is the BASE. The
        sentinel is this service promoted and completed — NOT a new process
        beside it.
      the_real_gap: >
        It is POLL-based, not event-driven. Four timers: 60s wire-integrity,
        15s poll-all, 30s remediation, 5s verifier. It EMITS to the bus and
        serves SSE outward but NEVER SUBSCRIBES INWARD. So a fault is found
        up to 15-60s after it happens, and only if it left a trace some
        poller thought to look for. That is a monitor, not a nervous system.
        This gap is the single largest reason this spec exists.

    cli_diagnose:
      path: cli/diagnose.js
      size: ~1490 lines
      status: LIVE — but was 100% DEAD until 2026-07-24
      note: >
        `const DEEP` was declared ~400 lines AFTER the runAll() call that
        read it, so every invocation for every target died with
        "ReferenceError: Cannot access 'DEEP' before initialization". The
        banner printed first, so by hand it looked like it had started
        working. Nothing ran it automatically, so nobody found out. Fixed the
        moment autopilot's new boot gate tried to run it on a stall.
      verdict: >
        Becomes a CLIENT of the sentinel — but KEEPS its local file-level
        checks. Local checks work with the service DOWN, which is exactly
        when a human is most likely to be running it. Prefer the service when
        reachable, fall back to local, and SAY WHICH (§1.2).

    cortex_self_heal:
      path: cortex/self-heal/{index,escalation,fault-taxonomy}.js
      size: 581 lines
      status: LIVE — registered in cortex/boot.js's organs[] with init({bus})
      owns: >
        index.js = the 5-level escalation ladder (subscribes HEAL_REQUESTED).
        escalation.js = the friction ledger (subscribes anomaly.detected,
        emits escalation.friction.increased). fault-taxonomy.js = thresholds.
      decision: >
        JAMES 2026-07-24: this MOVES into the sentinel. See
        move_hazards_found_by_scan below — it is not a folder move, and the
        scan found exactly why.

    nexus_healer:
      path: nexus-healer/
      size: 186 lines
      status: ORPHANED SCAFFOLD — generated by loom/templates/system-scaffold.js
      consumers: >
        ZERO real ones. Verified: the only references anywhere are a scanner
        exclusion list, two generator comments, and a spec note. It is not
        supervised by autopilot. Nothing requires it.
      decision: >
        ABSORB or DELETE (§16.5 — delete before add). Its only real content
        is the scaffold's dispatch() pattern, which the sentinel's CLI/API
        should follow anyway. Keeping it alongside the sentinel guarantees a
        second truth. NOT YET DECIDED which — flagged, not assumed.

  # ══════════════════════════════════════════════════════════════════════════
  # The scan James required before any move. It stopped a change that would
  # have broken something silently, which is the whole reason §8.4 exists.
  # ══════════════════════════════════════════════════════════════════════════
  move_hazards_found_by_scan:
    hazard_1_liminal_space_in_process_coupling:
      severity: BLOCKING — this is why self-heal cannot simply be moved
      finding: >
        cortex/liminal-space/index.js:134 subscribes to
        'escalation.friction.increased' on the IN-PROCESS nexus-bus.
        cortex/self-heal/escalation.js emits that event from three places
        (lines 114, 154, 178). Today both are cortex organs in ONE process,
        so it is a plain EventEmitter call. cortex/boot.js's own organ
        comment states escalation exists partly TO CLOSE that listener.
      consequence_if_ignored: >
        Move escalation to a sovereign process and the link goes dead with NO
        ERROR, NO LOG — just a listener that never fires again. That is
        precisely the silent-failure class this whole system is being built
        to eliminate. It would be introduced BY the system meant to prevent
        it.
      required_before_move: >
        The friction event must cross the process boundary with a REAL
        contract, and liminal-space's subscription must be re-established and
        PROVEN BY A TEST THAT FAILS IF THE EVENT STOPS ARRIVING. A test that
        only checks the emitter still emits is not sufficient — the whole
        failure mode is that the emit succeeds and nobody hears it.
      candidate_mechanism: >
        cortex's POST /api/event already ledgers an event AND re-emits it on
        cortex's own bus (cortex/boot.js, §GAP CLOSED 2026-07-19). That is
        the same proven path the heal dispatches now use. Not yet decided
        whether friction should ride it or get a dedicated channel —
        friction is high-frequency and /api/event is a general ingress.

    hazard_2_phantom_canonical_scorer:
      severity: REAL, currently degrading numbers, out of scope to fix here
      finding: >
        cortex/healer/index.js DOES NOT EXIST (verified MODULE_NOT_FOUND).
        service/nexus-diagnostic.js required it for scoreTension and
        meta/gap/predicate.js:435 requires it for what its own comment calls
        "the canonical number". Both swallowed the failure. Every gap
        tension value has been a crude severity==='high'?2:1 fallback while
        presenting as real scoring.
      status_2026_07_24: >
        The diagnostic service now WARNS ONCE per sweep that its numbers are
        degraded. predicate.js still fails silently — recorded in
        tests/modules/test-diagnostic-heal-path.js (DHP-009) so it cannot be
        forgotten. The sentinel must either implement the canonical scorer or
        formally retire the concept; it must not inherit a phantom.

    hazard_3_heal_path_never_worked:
      severity: FIXED 2026-07-24 (commit precedes this spec)
      finding: >
        All THREE of the diagnostic service's heal dispatch sites were
        broken. One called a nonexistent escalate() on the wrong module. Two
        emitted HEAL_REQUESTED on their OWN process's bus for a ladder living
        in cortex's process, reaching nobody while reporting success. The
        UI's "fix this gap" button healed nothing, every time.
      why_it_matters_to_this_spec: >
        It is the proof of the thesis. The repair path was declared,
        plausible, tested-looking, and completely dead — because nothing
        exercised it end to end. The sentinel's own gates exist so that a
        repair which does not actually happen CANNOT report success.

  # ══════════════════════════════════════════════════════════════════════════
  laws:
    - id: SEN-1
      name: One truth about system health
      rule: >
        §10.3. There is exactly ONE authority on whether a system is healthy.
        cli/diagnose.js, the tablet, and any future surface are CLIENTS.
        Nothing may reimplement detection. If a second surface needs a
        different view, it queries a different projection — never a second
        detector.
    - id: SEN-2
      name: Event-driven first, polling as backstop
      rule: >
        Faults are detected by SUBSCRIBING, not by sweeping. Polling remains
        only where no event exists (e.g. a process that died without emitting
        anything), and every poll-discovered fault must record that it was
        found by poll, so the missing event is visible as a gap in coverage
        rather than invisible.
    - id: SEN-3
      name: Ledger before action (§LAW II)
      rule: >
        No repair acts before it is written down. Every fault, every gate
        decision, every repair attempt and outcome goes to the event ledger
        via lib/component-ledger.js's write() — the canonical writer — before
        it has any effect. A repair nothing recorded did not happen.
    - id: SEN-4
      name: Every interaction gated
      rule: >
        James, 2026-07-24: "I want all interactions gated." Every command,
        API call, and UI action passes a gate that verifies the caller, the
        contract version, and the preconditions BEFORE execution. A gate
        refusal is a first-class ledgered outcome, not an error path.
    - id: SEN-5
      name: The UI owns nothing
      rule: >
        Surfaces are disposable consumers. Notifications, acknowledgements
        and repair state live in the LEDGER, not in a tab. Kill every UI and
        no fault, no acknowledgement, and no repair history is lost. This is
        the tablet spec's decoupling law applied to notifications
        specifically — see notifications below, where it is the load-bearing
        decision.
    - id: SEN-6
      name: Cortex is the data root
      rule: >
        James, 2026-07-24 ("stored in cortex"). All sentinel state — faults,
        gates, repair attempts, acknowledgements — lives in cortex's store
        via jaaDB. The sentinel keeps its own operational ledger under
        data/diagnostic/ledger as it does today, but SHARED TRUTH is cortex's.
    - id: SEN-9
      name: Decoupled or it does not ship
      rule: >
        James, 2026-07-24: "Everything in nexus is supposed to be decoupled.
        Using the event bus and api, and cli. Sse. Nothing is supposed to be
        hardwired to another." The sentinel reaches every other system by
        BUS, HTTP API, CLI, or SSE — never by require(). Specifically it must
        NOT require cortex/intelligence, cortex/self-heal, or any other
        system's internals, even where that would be easier and even where
        cortex itself currently does exactly that. Copilot is the model to
        copy here: it fetches ${CX_URL}/api/intelligence/* over HTTP. Cortex
        is the counter-example: cortex/boot.js:113-119 requires the
        intelligence faculties in-process. Two access patterns for the same
        faculties, one correct.
      already_enforced_once: >
        The 2026-07-24 heal-path fix deleted the diagnostic service's
        require('../cortex/self-heal/...') and replaced it with an HTTP POST
        to cortex /api/event. That was this law applied before it was
        written down.
    - id: SEN-8
      name: Never derive what you can consult
      rule: >
        cortex/intelligence already maintains the pattern and failure-mode
        memory (bep_patterns, failures taxonomy, reuse index) assembled from
        event-ledger invariants, CFR sigma/delta, compound effects, gaps, and
        the orion classifier. The sentinel CONSULTS it and FEEDS IT BACK. It
        may not build a second pattern engine, a second failure taxonomy, or
        a second confidence score. A repair system that re-derives what the
        intelligence layer already knows is not smarter — it is a competing
        truth (§10.3) that will drift.
    - id: SEN-7
      name: A repair that did not happen cannot report success
      rule: >
        Directly from hazard_3. Every repair dispatch must be verified to
        have REACHED its executor, not merely to have been sent. "Emitted"
        is not "delivered"; "delivered" is not "done".

  # ══════════════════════════════════════════════════════════════════════════
  # THE LOOP — James, 2026-07-24. This is the system knowing what is
  # happening to it. Every clause below is a real component, not an aspiration.
  # ══════════════════════════════════════════════════════════════════════════
  the_loop:
    statement: >
      Interaction happens through CONTRACTS. Contracts are GATED and VERIFIED
      by HANDSHAKE. A failed handshake is itself a FAULT and is logged as one.
      Every fault and failure mode is logged and tracked. The INTELLIGENCE
      system reads the LEDGERS and the CAUSAL GRAPH to establish WHEN and WHY
      a fault happens — the CONDITIONS it occurred under, and WHEN IT STARTED.
    steps:
      1_contract: >
        Every interaction names a contract (contractUuid). Seven
        interaction-contract.json files already exist; bridge already serves
        POST /bridge/handshake. This is adoption, not invention.
      2_gate_and_handshake: >
        lib/seam/gates.js provides the gating primitive. The handshake proves
        the caller speaks a compatible contract version BEFORE it acts, so a
        stale surface cannot command a changed system.
      3_failed_handshake_IS_a_fault: >
        A refused gate is not an error path swallowed at the boundary — it is
        a first-class fault, written to the ledger with the same schema as any
        other. This is the clause that makes the contract layer observable:
        without it, the most security-relevant event in the system leaves no
        trace.
      4_every_fault_logged_and_tracked: >
        Fault → ledger (authoritative, §LAW II) → fault_taxonomy (class,
        count, precursors, success rate). No fault is only in a log line.
      5_intelligence_reads_ledgers_AND_causal_graph: >
        Ledgers give sequence. The causal graph gives STRUCTURE — meta/cfr/
        graph.js's CausalGraph already provides ancestors(), descendants(),
        jobChain(), highSigmaNodes(), componentDistance(). "Why" is an
        ancestors() walk from the fault node, not a guess from adjacency in
        time.
      6_conditions_and_onset: >
        WHEN: the CFR field snapshot stamped at the moment of the fault —
        coherence/friction/resonance/entropy/regime. That is the "conditions"
        clause, and CFR already stamps it on every governed write (T3).
        WHEN IT STARTED: first occurrence of this fault CLASS, which is the
        gap below.

    unclosed_wire_1_intelligence_has_no_causal_graph:
      finding: >
        VERIFIED by grep: cortex/intelligence/index.js contains no reference
        to CausalGraph or meta/cfr/graph.js at all. It reads event_log and
        JAA tables — sequence, not structure. So "why" is currently inferred
        from temporal adjacency, which is precisely the reasoning error a
        causal graph exists to prevent (two things co-occurring is not one
        causing the other).
      note: >
        cortex/boot.js and cortex/memory/causal-lookup.js BOTH have
        _getCausalGraphClass() and mastermind receives it — so the graph is
        reachable and already used elsewhere in cortex. The intelligence core
        simply never wired to it. Cheap to close, and it is the difference
        between correlation and causation in every answer the core gives.

    unclosed_wire_2_onset_is_not_recorded_anywhere:
      finding: >
        cortex/self-heal/fault-taxonomy.js records
        { uuid, faultClass, friction, ts, count, lastSeen, precursors,
        examples, successRate }. There is NO firstSeen. So the system can say
        a fault has occurred 47 times and when it LAST occurred, but not when
        it STARTED.
      why_it_matters: >
        "When did this start" is the single most useful question for a
        regression, because it is the only one that lets you correlate a
        fault class against what CHANGED — a deploy, a config change (now
        governed and ledgered by T3), a version bump. Without onset, every
        recurring fault looks equally old and nothing can be correlated to a
        cause outside itself.
      fix_shape: >
        firstSeen + the CFR snapshot AT first occurrence, set once and never
        updated. Cheap (one field, write-once), and it converts the taxonomy
        from a counter into a timeline.

  # ══════════════════════════════════════════════════════════════════════════
  ledger_schema:
    principle: >
      James: "They all need event ledgers, with consistent schema." Correct —
      but the schema mostly EXISTS. lib/component-ledger.js's write() is the
      canonical writer and already produces 9 of the 13 fields requested. So
      this is EXTEND-AND-ENFORCE, not design-from-scratch. A second schema
      would be the competing truth that produced six ledger destinations in
      the first place.
    already_written_today:
      - uuid          # §5.1
      - system
      - component     # "component"
      - action        # "event types"
      - status
      - tags
      - detail        # payload
      - causedBy      # "previous event"
      - contractUuid  # "contract uuid"
      - session
      - ts            # "timestamps"
    add:
      hook: >
        WHICH HOOK FIRED IT. The strongest item on James's list and recorded
        nowhere today. Makes a row locatable in the ARCHITECTURE, not just in
        time. Maps to the real hooks/<system>.hooks.js files.
      wire: >
        WHICH WIRE CARRIED IT (the begin/end point). Pairs with hook; together
        they answer "where in the system did this travel", which no current
        field can.
      intent: >
        WHY. Accepted, but CONSTRAINED to a controlled vocabulary. As free
        prose it rots into text nobody queries.
      faultId: >
        REFERENCE to the fault record, never an embedded fault object.
      sourceRef: >
        The emitting source location (file:line or module id) — NOT the
        ledger's own path. See rejected below.
    rejected_with_reasons:
      next_event: >
        REFUSED. An append-only ledger cannot know the future at write time.
        Implementing it requires MUTATING an already-written row, which breaks
        immutability (the property that makes a ledger trustworthy), doubles
        every write, and races when two events share a cause. Fully
        DERIVABLE: next = the row whose causedBy equals this uuid. Build a
        read-side index. James flagged it with a "?" himself.
      ledger_file_and_directory_as_fields: >
        REFUSED as fields. The row's LOCATION already is
        data/ledger/<system>/<component>/<day>.jsonl, computed by
        _partitionPath(). Storing that path inside the row is
        self-referential, drifts the instant a file rotates or moves, and
        costs bytes on every line. The useful version of this request is
        sourceRef (WHERE IT WAS EMITTED FROM), which is accepted above.
      context_as_embedded_blob: >
        REFUSED as an embedded snapshot; accepted as REFERENCES. Rows are
        ~303 bytes today and data/ledger is 9.6MB. A 500-byte context blob per
        row roughly TRIPLES the ledger and duplicates state that already
        lives in cortex. Context = session + contractUuid + faultId +
        cfrSnapshot-by-reference. `detail` already carries real payload.
      relation_unconstrained: >
        REFUSED as a free field. causedBy already encodes causal relation. If
        a non-causal relation is needed it must be an ENUM — retry-of,
        supersedes, part-of, sibling-of — or it becomes an unqueryable junk
        drawer. NOT YET DECIDED which types are actually needed; naming them
        is prerequisite to adding the field.
    enforcement:
      principle: >
        THE THING NOT ON THE LIST THAT MATTERS MOST. A schema everyone agrees
        to and nothing validates WILL drift — that is exactly how six ledger
        destinations appeared. write() already refuses on missing
        system/component/action (§1.1). Extend that refusal to the new
        required fields and the schema enforces itself at the only place that
        can enforce it: the single writer.
      consequence: >
        Every system routing through component-ledger.write() gets the schema
        for free and CANNOT drift from it. Any system that writes its own
        ledger format is by definition outside the contract — which makes
        drift detectable rather than silent.

  # ══════════════════════════════════════════════════════════════════════════
  architecture:
    build_order:
      note: >
        James, 2026-07-24: "Cli first. API. Components, seams, hooks, wires
        and consumers." Bottom-up per §3.1. Each layer must be real before
        the next is started.
      order:
        - S1_cli_and_contract
        - S2_components_and_registry
        - S3_hooks_seams_wires
        - S4_gated_api
        - S5_fault_hook_and_ledger
        - S6_notifications_projection
        - S7_absorb_self_heal   # blocked on hazard_1

    cli:
      principle: >
        CLI FIRST — it is the surface that proves the system works without a
        UI, and the one a human reaches for when everything else is down.
      pattern_to_follow: >
        cockpit/cli.js's INTERACTION_CONTRACT: { version, name, uuid,
        description, commands[] } where each command declares
        { cmd, args[], opts[], description, output, busEvent }. The busEvent
        field is what makes the contract event-driven rather than a help
        text — every command names the event it raises.
      required_commands_v1:
        - sentinel status              # health of the sentinel itself (§12.6)
        - sentinel faults list         # open faults, from the ledger
        - sentinel faults show <uuid>
        - sentinel faults ack <uuid>   # gated write
        - sentinel repair <uuid>       # gated, dispatches + VERIFIES delivery
        - sentinel scan [system]       # explicit sweep, the diagnose.js path
        - sentinel contract            # emit the contract itself, machine-readable

    interaction_contract:
      rule: >
        The contract is the single declaration of what the sentinel can do.
        CLI, API, and UI all derive from it — they do not each define their
        own surface. A command that is not in the contract does not exist.
      gated_handshake:
        purpose: >
          James: "gated handshake verification for a decoupled ui." A surface
          must prove it speaks a compatible contract BEFORE it can act, so a
          stale UI cannot issue commands against a changed system.
        shape: >
          Surface sends { contractUuid, contractVersion, surfaceId }. The
          sentinel verifies the uuid matches and the version is compatible,
          then issues a session token bound to that contract version. Every
          subsequent gated call carries the token. A version mismatch is
          REFUSED with the expected version named (§1.2 — a refusal must say
          what would have worked).
        precedent: >
          lib/seam/gates.js already provides the gating primitive
          (registry/classify/axiom transforms, registerPersistGates). Use it.
          Do NOT invent a second gate mechanism.
        open_question: >
          Whether the token is stateful (stored in cortex) or a signed
          stateless claim. Stateless is simpler and survives a sentinel
          restart; stateful allows revocation. NOT DECIDED.

    components_registry:
      rule: >
        Every sentinel component registers via lib/component-registry.js's
        registerComponent, exactly as every other system does. The sentinel
        must be visible in the same registry it monitors — a monitor absent
        from the map it draws is the first thing it should have caught.
      minimum: >
        Every component carries a UUID and a hook (§5.1, and James's standing
        axiom: UUID and hook on every module).

    hooks:
      pattern: hooks/<system>.hooks.js, following the eight that exist today.
      required:
        - sentinel.fault.detected     # THE fault hook James asked for
        - sentinel.fault.acknowledged
        - sentinel.repair.dispatched
        - sentinel.repair.verified    # SEN-7: delivery proven, not assumed
        - sentinel.repair.failed
        - sentinel.gate.refused       # a refusal is a real event
      fault_hook_contract: >
        James: "a hook to trigger event log the fault, and trigger a
        notification to the tablet". ONE hook, TWO consumers, in this order:
        (1) write to the event ledger — authoritative, §LAW II;
        (2) the notification is a PROJECTION of that write, never a separate
        message. If the ledger write fails, there is no notification, because
        there is no fault on record to notify about. This ordering is the
        whole reason notifications survive a closed tab.

    seams:
      pattern: lib/seam/ — gates.js, stream.js, detector.js, queue.js exist.
      use: >
        The sentinel's detection stream should be a real seam stream with
        registered gates, not a bespoke pipeline. §16.4 — extend what exists.

    wires_and_consumers:
      rule: >
        Consumers come from lib/consumer-registry.js, which since §B1
        (2026-07-24) aggregates CROSS-PROCESS subscriber counts via
        lib/bus-subscriptions.js. The sentinel MUST publish its own
        subscriptions like cortex and orchestrator do, or it will be a blank
        node on the very connectome it is meant to explain.
      unknown_vs_zero: >
        Inherited hard requirement: an unobserved consumer count is null,
        never 0. A monitor that reports "nothing consumes this" when it means
        "I cannot see" is worse than one that reports nothing at all.

    intelligence:
      CORRECTION_v0_3_0: >
        v0.2.0 stated intelligence "already maintains the pattern and
        failure-mode memory (bep_patterns, failures taxonomy, reuse index)".
        THAT WAS FALSE. It is DESIGNED to and has never done it. Verified:
        nothing outside its own directory requires index.js, init() is never
        called, and neither bep_patterns.json nor failures.json has ever been
        created — _scanPatterns() has never once run. I confirmed the HTTP
        routes existed and inferred the core behind them was running: exactly
        the "declared, plausible, never executed" pattern this whole session
        keeps finding, reproduced inside this spec. Recorded rather than
        quietly edited (§0.3).
      what_it_is: >
        cortex/intelligence/ — four modules, SPLIT DOWN THE MIDDLE:
          intuition.js    LIVE — cortex createIntuition(...), serves /intuition
          mastermind.js   LIVE — createMastermind(...), serves /mastermind
          adversarial.js  LIVE — required directly, serves /adversarial
          index.js        933 lines, NEVER RUN — the Intelligence Core
        So the reasoning FACULTIES work. The MEMORY the sentinel wanted to
        lean on does not exist yet.
      surface: >
        exports init, stop, getContext, handleRequest, getPatterns,
        getFailures, getReuseIndex, _scanPatterns.
      NO_CROSS_PROCESS_HAZARD: >
        Unlike self-heal (hazard_1), intelligence ALREADY has a real HTTP
        surface on cortex, so the sentinel can consult it across the process
        boundary with no new coupling and no silent-listener risk:
          GET  /api/intelligence/context
          GET  /api/intelligence/intuition        (POST too)
          POST /api/intelligence/mastermind
          POST /api/intelligence/mastermind/patterns   (RFR2 delta engine)
          POST /api/intelligence/adversarial      (scores intuition vs mastermind)
        This is a decided advantage: consulting intelligence needs no
        architectural work, only wiring.
      what_is_consultable_TODAY: >
        intuition, mastermind, adversarial — all three real, all three over
        HTTP. NOT consultable: getPatterns/getFailures/getReuseIndex, because
        the core has never run. SEN-8 still holds, but its subject shrinks to
        what actually exists until the core is switched on.
      turning_the_core_on:
        cost: >
          Essentially one line. init() was dry-run 2026-07-24 and ran cleanly:
          four staggered unref'd scan intervals (patterns, failures, reuse
          index, cross-ledger) plus a 10s-delayed initial build that hydrates
          _failureIndex from the persisted fault_taxonomy table, so there is
          no cold-start amnesia. Nothing missing, nothing throws. It was
          simply never added to cortex/boot.js's organs[] array.
        the_real_question_is_NOT_cost_but_overlap: >
          Three pattern producers would then exist:
            meta/crystal-lattice   → crystals (domain/verb/outcome, threshold 3)  LIVE
            cortex/liminal-space   → crystals (focalPoint resonance)              LIVE
            intelligence/index.js  → bep_patterns (precursor/outcome/confidence)  NEVER RUN
          crystal-lattice's own comment says the first two coexist
          deliberately. bep_patterns is a genuinely DIFFERENT shape, not a
          duplicate.
        the_finding_that_settles_it: >
          copilot/intuition.js reads p.precursor, p.outcome, p.confidence —
          which is bep_patterns' shape, NOT crystals'. But
          cortex/boot.js's _buildPatterns() serves /api/intelligence/patterns
          from the crystals table. So THE MIND HAS ALWAYS BEEN ASKING FOR THE
          CORE'S OUTPUT AND BEING SERVED A DIFFERENT ENGINE'S TABLE. The
          endpoint's own comment records this once rendering as
          "undefined → undefined (NaN%)". Turning the core on therefore does
          not ADD a competing truth — it supplies what copilot was written to
          consume.
        what_must_be_resolved_with_it: >
          _buildPatterns() must then decide: serve bep_patterns, serve both,
          or keep crystals and accept that the mind never receives precursor
          data. NOT DECIDED — it is a cortex decision, not a sentinel one,
          and it is James's call.
      how_the_sentinel_uses_it:
        before_repair: >
          Consult getFailures()/getPatterns() (or the HTTP equivalents) for
          this fault's type BEFORE choosing a repair. A fault with a known
          failure mode and a known-good prior repair should not walk the
          5-level ladder from level 0 as if it were novel.
        for_root_cause: >
          POST /api/intelligence/mastermind for causal analysis, and
          /mastermind/patterns for recurring causal shapes (RFR2 delta
          engine) when the same fault keeps returning.
        for_contested_calls: >
          POST /api/intelligence/adversarial when intuition and mastermind
          disagree about a repair — the inner critic already exists for
          exactly this, and a repair system guessing between two of its own
          signals is the thing adversarial.js was built to stop.
        after_repair: >
          Feed the OUTCOME back so the taxonomy learns. A repair whose result
          is never returned to intelligence makes the system permanently as
          naive as it was on day one — the specific failure SEN-8 exists to
          prevent.
      current_state_2026_07_24: >
        service/nexus-diagnostic.js does NOT reference intelligence at all —
        verified by grep, not assumed. So this is an unclosed WIRE in live
        code, not merely a spec omission. The detection engine and the
        memory of what detections meant have never been connected.

    meta_subsystems:
      note: >
        James: "and lib/meta". v0.1.0 named lib/ properly but mentioned meta/
        only implicitly via sigma. The service ALREADY uses parts of meta/ —
        so the correct framing is "use it deliberately", not "adopt it".
      already_used_by_the_service_today:
        - "meta/cfr/field — createCFRField, computeRegime (the regime colouring everything else reads)"
        - "meta/cfr/contract-verifier — createContractVerifier, loadContracts"
        - "meta/gap/predicate — gap classification, at two call sites"
        - "meta/telemetry-codec — optional, soft-required"
      should_be_named_and_used_deliberately:
        meta_gap: >
          A whole detection engine (hunter, predicate, ledger), not just the
          predicate the service currently reaches for. The sentinel is a
          detection system; it should stand ON meta/gap rather than beside it.
        meta_rfr2: >
          16 modules, all real CJS since the 2026-07-24 conversion. The causal
          layer — kernel/causality/sigma/adapter/clip/compress/context/forge.
          Relevant to root-causing a fault and to replaying the sequence that
          produced it.
        meta_confidence: >
          weakestLink, bottleneck, effective, hasEvidence, rawScore,
          EVIDENCE_LESS_DISCOUNT. A detection's confidence should come from
          here, not from a number the sentinel invents. Note
          EVIDENCE_LESS_DISCOUNT specifically — a claim without evidence must
          score lower, which is the same §0.1 discipline in numeric form.
      not_yet_assessed: >
        alk, alk-perception, bda, causal, crystal-lattice, lattice, liminal,
        spatial, topo-kernel, adversary-suite. Listed so their absence is a
        RECORDED gap rather than an implied judgement that they are
        irrelevant. Each needs a real look before the sentinel claims to be
        built on meta/.

    data:
      root: cortex (SEN-6), via cortex/memory/jaa-db.js's jaaDB facade.
      tables_v1:
        sentinel_faults:      "id, system, type, severity, sigma, detectedBy (event|poll), status, ts"
        sentinel_gates:       "id, surfaceId, contractVersion, decision, reason, ts"
        sentinel_repairs:     "id, faultId, dispatchedTo, delivered, outcome, attempts, ts"
        sentinel_acks:        "id, faultId, actor, ts"
      note: >
        jaaDB's read-many is query(), NOT all() — the JaaStore class has
        all(). Two live facades, and code that supports only one silently
        reports "nothing found" against the other. This bit lib/
        bus-subscriptions.js on 2026-07-24 and was caught before shipping.

  # ══════════════════════════════════════════════════════════════════════════
  notifications:
    james_question: >
      "trigger a notification to the tablet? Maybe add notifications to nexus
      tablet? What do you think?"
    decision: >
      YES to notifications appearing in the tablet. NO to the tablet OWNING
      them. Cosmetically identical; architecturally opposite.
    reasoning: >
      The tablet spec's own law is that it is a disposable consumer owning no
      authoritative state. If notifications are PUSHED to it and STORED in
      it: a fault is only ever seen if a tab happened to be open, closing the
      tablet loses it, and two tablets disagree about what is outstanding.
      That makes the notification LESS RELIABLE THAN THE FAULT IT REPORTS —
      the exact inversion this system exists to prevent.
    shape: >
      The fault lands in the event ledger (authoritative). "Notification" is
      a READ of a real ledger projection: unacknowledged faults, newest
      first. The tablet polls or streams that projection through the same
      gated handshake as every other read. Acknowledgement is a GOVERNED
      WRITE (sentinel_acks + ledger), not UI state.
    consequences_that_make_this_worth_it:
      - a fault survives the tablet being closed, refreshed, or never opened
      - any future surface gets notifications for free, with no new plumbing
      - acknowledgement is auditable — who cleared it, when, why
      - two surfaces can never disagree about what is outstanding
      - the tablet stays disposable, so the tablet spec's laws hold unchanged
    open_question: >
      Poll vs SSE for the tablet's notification feed. The service already
      serves SSE (GET /events). SSE is better UX; polling is more robust to a
      wedged sentinel. Probably SSE with a poll fallback that SAYS which it
      is using. NOT DECIDED.

  # ══════════════════════════════════════════════════════════════════════════
  phases:
    S1_cli_and_contract:
      blockers: none
      status_2026_07_27: >
        BUILT AND GATE-VERIFIED. sentinel/interaction-contract.json (the single
        declaration) + cli/sentinel.js (derived from it). Gate met: `sentinel
        contract` emits real machine-readable JSON, and `sentinel status` and
        `sentinel faults list` return REAL data from cortex WITH NOTHING
        RUNNING — 7 real faults, live schema and intake coverage. The CLI reads
        the store directly, which is the one place SEN-9's no-require rule is
        deliberately not applied to the DATA path: routing through HTTP would
        make the tool as dead as everything else exactly when it is needed.
        It never calls another system's LOGIC, and every mutation still goes
        through the governed writer.
      contract_drift_is_fatal: >
        The CLI verifies at startup that its handlers match the contract in
        BOTH directions and exits 3 on mismatch. Proven by removing a handler
        and confirming refusal. This is the rule that stops a fifth diagnostic
        surface appearing the way the first four did: a command not in the
        contract does not exist, and a declared command with no handler is a
        lie the contract is telling.
      declared_vs_live: >
        Routes carry status LIVE or DECLARED. S4's routes are declared and not
        yet served, and say so — a contract implying unbuilt routes work is the
        same class of lie as the hardcoded lattice diagram.
      two_real_findings_from_the_tests: >
        (1) --json output was polluted by cortex's "[jaa] Loaded N rows"
        chatter landing inside the payload, making it unparseable for any
        caller. A machine-readable flag emitting unparseable output is worse
        than none. Store chatter now goes to stderr so stdout carries only the
        payload, and remains visible to a human. Caught by the test suite, not
        by reading the code. (2) One of my own assertions matched a
        single-line comment that is wrapped across two lines in the source —
        fixed the test, not the code.
      gate: >
        `sentinel contract` emits a real machine-readable contract, and
        `sentinel status` + `sentinel faults list` return REAL data read from
        cortex — with the sentinel service DOWN, proving the CLI's local path.
    S2_components_and_registry:
      blockers: none
      gate: "the sentinel appears as a real node with real components in the registry it monitors."
    S3_hooks_seams_wires:
      blockers: none
      gate: >
        sentinel.fault.detected fires on a REAL fault, reaches the ledger,
        and the sentinel publishes its own bus subscriptions so it is a
        visible node on the §B1 connectome.
    S4_gated_api:
      blockers: [S1]
      gate: >
        an ungated call is REFUSED and the refusal is ledgered; a stale
        contract version is refused with the expected version named.
    S5_fault_hook_and_ledger:
      blockers: [S3]
      gate: >
        a real fault produces a ledger row BEFORE any notification exists,
        and a failed ledger write produces NO notification.
    S6_notifications_projection:
      blockers: [S5]
      gate: >
        a fault raised while the tablet is CLOSED is visible when it opens;
        acknowledging it from one surface clears it on another.
    S5b_universal_ledger_schema:
      blockers: [S5]
      gate: >
        every sentinel write carries hook + wire + intent + contractUuid, and
        write() REFUSES a row missing them — proven by a test asserting the
        refusal, not merely that good rows succeed.
    S6c_onset_and_causal_wiring:
      blockers: [S6b]
      gate: >
        a fault class records firstSeen ONCE with the CFR conditions at first
        occurrence, and "why" for a fault is answered by an ancestors() walk
        on the causal graph rather than by temporal adjacency.
    S6b_intelligence_wiring:
      blockers: [S5]
      gate: >
        a repair dispatch CONSULTS intelligence for the fault's known failure
        modes before choosing a level, and the OUTCOME is fed back — proven
        by a test showing a fault with a known-good prior repair does NOT
        restart the ladder at level 0. No cross-process work needed: cortex's
        /api/intelligence/* routes already exist.
    S7_absorb_self_heal:
      blockers: [hazard_1, S4]
      gate: >
        the 5-level ladder runs inside the sentinel AND
        liminal-space still receives escalation.friction.increased —
        proven by a test that FAILS if the event stops arriving.

  # ══════════════════════════════════════════════════════════════════════════
  explicitly_not_decided:
    - absorb vs delete nexus-healer (§16.5 says one or the other, not both)
    - stateful vs stateless gate tokens
    - SSE vs poll for the notification feed
    - whether friction crosses processes via /api/event or a dedicated channel
    - whether the canonical tension scorer is implemented or formally retired
    - the sentinel's own name — SETTLED 2026-07-24: James confirmed
      "Sentinel is fine". Note the near-collision: nexus-organisms.spec
      already defines nexus.organism.git-sentinel, and causal-nexus ledger
      code uses sentinel VALUES in the generic CS sense. Neither blocks the
      name; both are recorded so a future reader is not confused.
    - which of meta/{alk, alk-perception, bda, causal, crystal-lattice,
      lattice, liminal, spatial, topo-kernel, adversary-suite} the sentinel
      should stand on. Unassessed, deliberately recorded rather than silently
      omitted.
    - SETTLED by SEN-9: the sentinel consults intelligence over HTTP, always.
      Co-location is not a later optimisation to consider; it is the hazard_1
      class and the decoupling law forbids it.
    - SETTLED 2026-07-24: the core is SWITCHED ON (James: "Yes to the core").
      Registered as a cortex organ. What remains undecided is only whether
      _buildPatterns() then serves bep_patterns, both, or stays on crystals —
      that is a cortex decision. Original framing kept below for the record.
    - [SUPERSEDED] whether cortex/intelligence/index.js is SWITCHED ON or formally
      RETIRED. It is 933 lines that have never executed. Switching it on
      costs one line and supplies the precursor/outcome/confidence shape
      copilot has always been asking for. Retiring it means accepting the
      mind never gets precursor data. A third option — switch on, and resolve
      _buildPatterns() to serve bep_patterns — is probably right but is
      cortex's call, not the sentinel's.
    - which non-causal relation TYPES are actually needed (retry-of,
      supersedes, part-of, sibling-of?) — the field is refused until they are
      named, because an unconstrained relation becomes unqueryable.
    - the controlled vocabulary for `intent`.
    - whether cortex's own in-process requires of the intelligence faculties
      get migrated to its own HTTP surface for consistency with SEN-9. Out of
      the sentinel's scope, but it is the same violation the sentinel is
      forbidden from committing.

  failure_modes_to_refuse:
    - >
      Building a fifth diagnostic surface. If this ships beside
      nexus-diagnostic rather than becoming it, the spec has failed.
    - >
      A repair that reports success without verified delivery (SEN-7). This
      already happened three times in one file and shipped undetected.
    - >
      Notifications that live in a tab. See notifications above.
    - >
      Polling dressed as event-driven. If the sentinel subscribes to nothing,
      renaming the timers changes nothing.
    - >
      Becoming a third thinker. Copilot is the mind. The sentinel detects,
      governs, repairs and REPORTS — it does not reason about intent. If it
      starts growing its own faculties rather than consulting copilot's and
      cortex's, it has stopped being a sentinel.
    - >
      require()-ing another system's internals because it is easier than an
      HTTP call (SEN-9). Cortex currently does this; that is a reason to fix
      cortex, not a licence to copy it.
    - >
      Building a second pattern engine or failure taxonomy beside
      cortex/intelligence (SEN-8). The sentinel would look smarter and be
      a competing truth about what failures mean.
    - >
      Repairing without consulting known failure modes, or repairing and
      never feeding the outcome back. Either one leaves the system as naive
      on its thousandth fault as on its first.
    - >
      Moving self-heal without re-establishing liminal-space's subscription.
      The scan found this; shipping it anyway would be worse than never
      having scanned.
