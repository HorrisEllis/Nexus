spec:
  meta:
    name:        nexus-tablet
    version:     0.4.0-spec
    status:      SPEC ONLY — no code. Revised 2026-07-24 (v0.1.0 → v0.2.0).
                 Per §8.5 (spec before build) and §3.3 (map before build).
    uuid:        nexus-tablet-v0-0000-2026-0724-001
    author:      James Brooks (architecture) / execution layer (mapping)
    supersedes: >
      v0.1.0 (preserved at docs/nexus-tablet-v0.1.0-superseded.spec, §0.3).
      v0.1.0 organised the tablet as parallel SURFACES — brain view, ledger
      explorer, containers, copilot. That was a dashboard layout. James
      corrected it: the CONTAINER is the organising primitive. This is a
      restructure, not an append.

  # ══════════════════════════════════════════════════════════════════════════
  # READ THIS BEFORE THE VISION. §1.1 — nothing is real until it runs.
  # ══════════════════════════════════════════════════════════════════════════
  what_is_actually_buildable_today:
    note: >
      An external reviewer read v0.2.0 cold (2026-07-24) and came away most
      excited about the BRAIN VIEW and the COGNITIVE LAYER — the two most
      blocked things in this document. It engaged with the vision and skipped
      every blocker, including the five listed explicitly below. That is a
      defect in THIS SPEC's structure, not in their reading, so the blockers
      now come first.
    buildable_now:
      - "T1 ledger explorer — data exists on disk today"
      - "T2 container shell — read-only; needs autopilot.spec + loom.spec first (GAP_1)"
      - "T3 change governance — PROVISIONAL: sigma-over-config and CFR-on-ledger are UNVERIFIED"
    blocked:
      - "T4 brain view — B1 (consumer graph is single-process; most edges do not exist yet) + B2 (ESM/CJS)"
      - "T6 cognitive layer / copilot — cognitive tools are NOT registered as RAID capabilities (mind-map Tier 3, unbuilt)"
      - "T7 rewind — B5 (replay-engine orphaned, API unread)"
      - "T8 autonomy sandbox — B4 (COS unwired)"
    frequently_assumed_but_absent:
      - "CPU/RAM per system — casually assumed by reviewers; NOT collected anywhere today."
      - "cross-process subscriber counts — the connectome's edges. Single-process only."
      - "executable CLI grammar — component `grammar` may be descriptive text, not commands. Unverified."

  thesis: >
    "All movement needs to be seen." (James, 2026-07-24)

    Every interaction space — href, button, panel, tab, request, handshake,
    packet — carries live sigma scoring and visibly changes state. Nothing
    happens invisibly.

    This is the structural inverse of every bug found in the 2026-07-20/24
    sessions: subsystems built and never wired; events emitted with no
    consumer; two registries silently disagreeing (269 vs 230); a drift report
    reading a stale mirror for months; an idle despawn misread as a crash.
    Every one shared a single property — THE SYSTEM COULD NOT SEE ITSELF DOING
    IT. The tablet makes invisible state structurally impossible.

  container_model:
    principle: >
      One container per system. Each container holds EVERYTHING about that
      system. Guardian's container is a complete workspace for Guardian.
    why_this_over_surfaces: >
      Matches how NEXUS is actually structured (§5.6 structural
      self-similarity) and scales without redesign — a new system means a new
      container, not N new panels across M surfaces. "Everything is
      observable" stops being a slogan and becomes a LOCATION.
    each_container_holds:
      cli:         "EMERGENT — resolved from the capability registry's live components + grammar, never hand-maintained (§16.5)"
      api_map:     "this system's real routes, from its /contract endpoint"
      databases:   "its JAA tables — row counts, browse, query"
      files:       "its data tree — data/<system>/{input,queue,output,ledger,failures}"
      tests:       "INVOKES the real tests/modules/run-all.js filtered to this system — never a parallel copy, or two truths drift"
      events:      "live stream + ledger tree data/ledger/<system>/<hook>/<date>.jsonl"
      config:      "ports, thresholds, toggles — see change_governance"
      user_model:  "hypotheses + lattice for this system (copilot/lib/user-model.js, live since 2026-07-20)"
      snapshot:    "thumbnail of current state; play/pause/rewind via the replay engine"
      controls:    "spawn/despawn/restart through autopilot's existing on-demand lifecycle"

  connection:
    principle: "The tablet talks to ONE endpoint. Autopilot resolves the rest."
    why: >
      Autopilot already supervises every kernel, runs a status server, and owns
      spawn/despawn. It is the only process that legitimately knows all
      systems. Brokering through it removes the tablet's hardcoded map of nine
      ports — the same hard-pointer problem RAID eliminated for requests
      (§5.14: depend on the contract, not the address).
    remote: "Autopilot as proxy makes the tablet remote-capable."
    decoupling_law: >
      The tablet is a CONSUMER of contracts and owns NO authoritative state
      (§5.12). Killing it must have ZERO effect on a running NEXUS. If it ever
      becomes load-bearing, that is a §10.3 violation and a bug.

  boundary:
    observation:
      scope: "UNRESTRICTED — every map, database, file, ledger, event."
      critical_requirement: >
        Observation MUST be disk-backed where possible, not only live-API-backed.
        If cortex is wedged the tablet must still show WHY. A console that goes
        dark exactly when the system is unhealthy is worse than no console — it
        is most needed at the moment it would fail (§1.2).
    mutation:
      scope: "Goes through the OWNING system's API. The tablet never writes files or databases directly."
      why: >
        A file editor and DB tool inside the console would make the tablet a
        second write path to everything — §10.3 at the worst possible scale.
        Writes route to their owner: loom for registries, cortex for memory,
        autopilot for lifecycle.

  change_governance:
    premise: "NEXUS is intended to become autonomous. The tablet is therefore the place a human can SEE and STOP it."
    who_changes_what:
      user_initiated:
        applies: LIVE
        rationale: "A human with intent gets direct effect."
      system_initiated:
        applies: "IN COS FIRST — compartment, shadow layer, isolated. Observed before touching live state."
        rationale: >
          Autonomy does not reconfigure live topology on its own authority; it
          PROPOSES AND PROVES in a sandbox. Same discipline as self-heal L2
          (propose-only) and reflection's constitutional gaps (propose, human
          decides). Consistent with the axioms, not a new rule.
    three_records_three_jobs:
      ledger:
        job: "WHAT HAPPENED. Append-only, never mutated. who, what, when, from → to."
        location: "data/ledger/<system>/<hook>/<date>.jsonl (exists today, 14 systems)"
        guarantee: "No changes lost (§0.3). The substrate replay rewinds through."
      registry:
        job: "WHAT IS. Current state, one authoritative value per setting."
        relationship: "THE REGISTRY IS A PROJECTION OF THE LEDGER — the same pattern already proven where hooks project from components. They must never disagree."
      cortex:
        job: "THE AUTHORITY owning both (§10.1)."
      why_all_three: >
        They fail differently. A registry without a ledger loses history — no
        rewind, no audit, no 'when did this change and why'. A ledger without a
        registry means every read replays all history to learn the current value.
    config_writes_through_to_registry: >
      Ports and thresholds write through to the HOOK AND WIRE REGISTRY so
      topology updates dynamically. A port changes, the registry updates, RAID
      reroutes, nothing else needs to know. The tablet is where a human watches
      and steers that, not where it is hardcoded.

  detection:
    sigma:
      question: "IS THIS UNUSUAL?"
      how: "sigma-writer already scores events (WARN 0.50 / HALT 0.70). Point it at CONFIG CHANGES."
      catches: "a port change at 3am from an autonomous process; a threshold far outside normal range; rapid config churn."
      status: "LIVE — needs pointing at the change stream, not building."
    cfr:
      question: "UNDER WHAT CONDITIONS?"
      how: "stamp every ledger entry with the CFR field at that moment (coherence/friction/resonance/entropy + regime)."
      why_it_matters: >
        A change made in a turbulent regime at friction 0.7 is a categorically
        different event from the identical change at stable, friction 0.05.
        Same action, different meaning. The context sigma alone cannot give.
      status: "LIVE (meta/cfr/field.js) — attachable to ledger entries TODAY."
    rfr2:
      question: "WHAT CAUSED THIS?"
      how: "causal query (FIND ... CAUSED_BY ...) + ancestor walk over condition-carrying ledger entries."
      why_it_matters: >
        Turns 'friction is high' into 'friction started rising three changes ago
        after that port reconfiguration, here is the chain, fourth occurrence
        this week.' Bottlenecks become ATTRIBUTED.
      status: "BLOCKED on B2 (ESM/CJS). ~10% wired."
    escalation_valve:
      rule: >
        A config change scoring halt-risk feeds the SAME escalation path as
        everything else — raising friction on its fault class and eventually
        tripping FAILURE_MODE, stopping the system from reconfiguring itself
        further. The autonomy safety valve, built entirely from parts that
        already work (cortex/self-heal/escalation.js).

  rewind:
    engine: "lib/replay-engine.js"
    status: "EXISTS, ORPHANED — unimported (2026-07-21 orphan inventory)."
    substrate: "the append-only ledger tree + RAID envelope trails (every hop stamped {system,status,ts})."
    note: "Rewind is not a new capability — it is wiring an existing engine to an existing time series."

  blockers:
    B1:
      what: "Consumer graph is single-process"
      blocks: "brain view (T4)"
      why: "Subscriber counts reflect cortex's bus only. Rendering now shows a brain missing most synapses — AUTHORITATIVE-LOOKING AND WRONG, worse than not rendering (§1.2)."
      fix: "each process reports its own subscriptions to a shared surface."
    B2:
      what: "ESM/CJS fault line"
      blocks: "RFR2 causal attribution"
      why: "meta/ (45 ESM files incl. all of RFR2) cannot be imported by the CJS core."
      note: "CFR is CJS and unaffected — the conditions layer is buildable now; only causality waits."
    B3:
      what: "UI unverifiable from the build environment"
      why: "no renderer in the sandbox; the live stack is on James's machine."
      mitigation: "build in increments James can see. Never claim a view 'works' — claim it 'is built, unverified'."
    B4:
      what: "COS is largely unwired"
      blocks: "system-initiated config changes (the autonomy half)"
      why: "cos/manager.js is among the 69 orphans; sovereign per-compartment memory only became real 2026-07-20 and nothing calls it at boot."
    B5:
      what: "replay-engine is orphaned"
      blocks: "rewind (T7)"
      why: "exists, unimported. Architecturally right, not running."

  phases:
    T1_ledger_explorer:
      blockers: none
      why_first: "Data exists TODAY. Smallest real surface, immediately useful, proves the decoupled disk-backed read path before anything animated depends on it."
      gate: "browse system → hook → day → events from the live tree with ZERO writes to NEXUS."
      status_2026_07_24: >
        BUILT AND GATE-VERIFIED. Two pieces: (1) read-only /ledger routes on
        autopilot's status server (GET /ledger[/:system[/:hook[/:day]]] —
        disk-backed per the observation law, strict per-segment allowlist +
        resolved-path containment per §4.3, corrupt jsonl lines counted and
        reported per §1.2, ?limit bounds responses); (2) tablet/index.html —
        single file, single endpoint (autopilot :7799, ?port= the only knob),
        zero hardcoded system ports, zero persistent state, zero write verbs.
        Gate walked live against the real 462-file tree (13/13 including
        hostile traversal/null-byte/over-deep inputs) and pinned permanently
        in tests/modules/test-tablet-ledger-api.js (12 tests, registered:
        planted-tree browse walk, corrupt-line reporting, limit semantics,
        hostile inputs, byte-identical-after-read zero-write proof, and UI
        law conformance checks). Honest limitation: the page's rendering is
        verified by contract (every field it dereferences proven present in
        real responses) — no browser exists in the build sandbox, so pixels
        were not seen. The next real browser session that opens it is the
        final visual check.
    T2_container_shell:
      status_2026_07_24: >
        BUILT AND GATE-VERIFIED. Four routes on autopilot's status server,
        same laws as T1: GET /contract-map/:system (proxy to the system's
        own /contract — port taken from the kernel's OWN healthUrl, so no
        second topology map exists to drift, §5.14), GET /tables[/:name]
        (JAA store read straight off disk per the observation law; corrupt
        tables report rows:-1 rather than vanishing, §1.2; ?limit bounds),
        GET /files/:system[/...] (data subtree listing; same segment
        allowlist + containment as T1), POST /run-tests/:system (spawns THE
        REAL tests/modules/run-all.js with a new --filter flag — never a
        per-container copy, which the spec's own failure-mode list names as
        guaranteed two-truths drift). tablet/index.html gained a Containers
        view: per-system panels for API map, JAA tables, file tree, and a
        real test-run button. Still one file, one endpoint, no persistent
        state; exactly one write verb in the whole page (the test
        invocation, which reads and proves rather than mutating state — T1's
        blunt "no POST" assertion was reconciled to this precisely, not
        weakened). Pinned: test-tablet-container-api.js (14 tests,
        registered). Suite 855/0.
      real_flaw_found_and_fixed_at_the_class: >
        The test-invocation route made recursion possible: a suite that
        POSTs /run-tests with a filter matching ITSELF causes the spawned
        runner to re-run that suite, which spawns another runner, forever.
        Hit it directly — T2-009 filtered on 'tablet', which matched its own
        file once registered. It passed standalone (not yet registered) and
        failed the moment the full suite ran: a false green caught within
        minutes. Fixed BOTH levels: the test now filters on a term that
        cannot match itself, AND the route refuses to spawn when
        NEXUS_TEST_RUN_DEPTH is set (stamped on every run it spawns), which
        kills the whole class rather than this one instance. _testRunActive
        alone could never catch it — each nested run is a fresh process with
        its own state, so the guard had to ride in the environment.
      honest_limitation: >
        Same as T1: no browser in the build sandbox. The container view is
        verified by contract (every field it dereferences proven present in
        real responses) plus an actual parse check of the inline script —
        that parse check earned its place immediately, catching two real
        syntax breaks from the edit that added the view.

      blockers: none
      gate: "one container per system: API map, DB tables, file tree, live events, real test invocation. Read-only."
    T3_change_governance:
      blockers: none
      gate: "a config change is written to the ledger with CFR conditions stamped, projected to the registry, scored by sigma, and an anomalous one raises friction."
      status_2026_07_24: >
        BUILT AND GATE-VERIFIED, all five steps, against REAL modules —
        lib/config-governance.js (recordConfigChange). Deliberately THIN:
        every capability the gate names already existed and was already
        load-bearing, so this module contributes the ORDERING and the
        DECISION, not reimplementations (§16.4/§16.5). meta/cfr/ledger.js's
        record() supplies steps 2+4 in one pass — it already scores sigma
        against the type's baseline using the PRE-update field, then updates
        the field, so the stamped snapshot is the condition the system was
        in WHEN the change landed; that ordering is the CFR ledger's and was
        not re-derived. lib/component-ledger.js's write() supplies steps 1+3
        (physical day file + JAA mirror = the registry projection, since the
        registry is a projection over the ledger and never an independent
        truth + event_log breadcrumb for the pattern engine).
        cortex/self-heal/escalation.js supplies step 5: this module EMITS
        'anomaly.detected' and never computes friction itself, because
        duplicating escalation's thresholds would create exactly the second
        truth about system health §10.3 forbids.
      verification: >
        tests/modules/test-config-governance.js (10 tests, registered).
        Nothing in the pipeline is mocked (§1.3): the friction test wires
        the ACTUAL escalation module to a real bus and asserts a real
        escalation.friction.increased payload — {faultClass, newFric, band,
        count, cause, anomalyUuid}, a shape read off a live emit rather than
        guessed. Anomalousness is forced by lowering the per-call threshold,
        NEVER by injecting a fake sigma score: a fabricated score would
        exercise the branch while proving nothing about whether real sigma
        output can reach it. Also pinned: §1.1 refusals (no system / no key
        / no value all throw rather than writing anonymous change), deletes,
        actor provenance (the spec's user-live vs system-initiated
        distinction recorded at write time, not inferred later), structural
        value comparison (so a re-read is not logged as a change and floods
        nothing), and honest degradation — with no CFR ledger the change is
        still governed and reports sigma:null rather than fabricating 0,
        which would read as "verified nominal".
      not_yet_wired: >
        No system CALLS recordConfigChange() yet — the pipeline is built,
        proven, and available, but every existing config write path still
        bypasses it. Wiring the real callers (guardian settings, cortex
        thresholds, raid_tunables) is separate work touching live write
        paths in 3+ systems and was NOT smuggled in behind a "T3 done"
        claim. The gate as written is met; universal enforcement is not the
        same statement.
    T4_brain_view:
      blockers: [B1, B2]
      gate: "real RAID envelope trails animate along real consumer-graph edges, coloured by real CFR/sigma."
      status_2026_07_24: >
        PARTIAL — and the partiality is recorded, not hidden. B1 and B2 are
        both closed (B2 by the rfr2 CJS completion; B1 by
        lib/bus-subscriptions.js with cortex + orchestrator publishing), so
        two of the gate's three clauses are met with REAL data: real
        consumer-graph edges (cross-process, which did not exist before B1)
        and real CFR colouring (read from cfr_state.json on disk, per the
        observation law). Built: GET /graph on autopilot (nodes = union of
        subscription publishers and event_log sources, so an emit-only system
        is never silently missing; producer edges weighted by real event
        counts; consumer edges joined from B1's map; ?events bounded, ceiling
        2000) plus a Brain view in tablet/index.html.
      third_clause_CLOSED_same_session: >
        Trails are now PERSISTED. cortex/core/raid/router.js gained
        _persistTrail(), writing to a raid_trails table on EVERY stamp —
        no_route, routed, fulfilled, failed — keyed by envelopeId with
        insert() so hops advance ONE row in place rather than appending a row
        per hop (envelopeLib.stamp() returns a new envelope carrying the
        CUMULATIVE trail, so the newest write always holds every prior hop).
        Persisting at the NON-TERMINAL routed state is the deliberate part: an
        envelope routed and never fulfilled is a STUCK REQUEST, and a store
        that only recorded completions would be blind to exactly the failure
        worth seeing. Real elapsedMs is captured because it is unrecoverable
        after the fact. Never throws into the routing path. /graph now serves
        real trails and the brain view animates them — each pulse walks the
        ACTUAL recorded hop sequence, skipping any hop whose system is not a
        node on the graph rather than inventing a path, coloured by the real
        CFR regime. Two tests were SUPERSEDED rather than deleted (T4-005,
        T4-008 previously asserted the UI must disclose that trails did not
        exist): the assertions moved with the code, and say so in comments.
      superseded_note_original_finding: >
        Per-request RAID envelope TRAILS cannot be animated because they are
        not persisted anywhere. cortex/core/raid/router.js's own header states
        the design — "the envelope's trail + the event log together are the
        ledger" — i.e. the trail lives on the in-flight envelope object and
        only the routing EVENTS reach disk. There is no trail store to read.
        Synthesising trails would be precisely the "authoritative-looking and
        mostly wrong" failure this spec's own failure_modes list warns about,
        so the endpoint reports routing as real event_log activity, declares
        the limitation in its own payload (notes.raidTrails), and the UI
        states it to the user. Persisting envelope trails is REAL SEPARATE
        WORK (a new store + a writer in router.js) and was not smuggled in
        behind a "T4 done" claim.
      hardest_correctness_property: >
        The unknown-vs-zero distinction. With no process having published
        subscriptions, every producer edge would naively read
        unconsumed:true — "everything is emitted into the void" — when the
        truth is "not observed yet." Conflating those is the same class of
        error B1 itself fixed. So unconsumed and liveConsumerCount are null
        (not false, not 0) whenever no publisher has reported, the payload
        says so in notes.consumers, and the UI shows a warning band instead
        of a confident empty graph. Asserted directly by T4-004.
      two_own_bugs_caught_by_reading_real_output: >
        (1) The first draft asserted unconsumed:true for every edge in
        exactly the no-publisher case described above — caught by looking at
        real output rather than trusting the code. (2) It also assumed
        cfr_state.json contained a `regime` field; the real file persists
        only the four axes, so regime came back undefined. Now derived via
        meta/cfr/field.computeRegime rather than reimplementing thresholds
        (which would be a second truth, §10.3).
      pinned_by: "tests/modules/test-tablet-graph-api.js (9 tests, registered)"
    T5_interaction_instrumentation:
      gate: "the tablet's own hrefs/buttons carry sigma scores and visibly change state — the thesis applied to itself."
    T6_copilot_surface:
      requires: "cognitive tools registered as RAID capabilities (mind-map Tier 3, not yet built)"
    T7_rewind:
      blockers: [B5]
      gate: "scrub to a past state and see the topology as it was."
    T8_autonomy_sandbox:
      blockers: [B4]
      gate: "a system-initiated config change runs in COS, is observable there, and does not touch live state until applied."

  failure_modes:
    - "Building the brain view before cross-process consumers — authoritative-looking and mostly wrong."
    - "The tablet acquiring its own state and becoming load-bearing (§10.3)."
    - "Observation that depends on system health — the console goes dark exactly when most needed."
    - "Per-container tests defined separately from run-all.js — two truths about whether a system works."
    - "A CLI hand-maintained per container instead of resolved from the capability registry — guaranteed drift."
    - "Animating declared relationships instead of observed ones (§13.4)."
    - "Claiming a view works without James seeing it render (B3)."

  # ── ADDENDUM 2026-07-24 — MAPPING VERIFICATION (§8.4, checked not asserted) ──
  mapping_verification:
    data_sources_all_confirmed_present:
      note: "Every file this spec depends on was verified to exist, not assumed."
      verified: >
        lib/consumer-registry.js, lib/capability-registry.js,
        lib/component-registry.js, lib/hook-registry.js, lib/replay-engine.js,
        meta/cfr/field.js, orchestrator/lib/sigma-writer.js,
        cortex/core/raid/envelope.js, cortex/self-heal/escalation.js,
        cos/manager.js, copilot/lib/user-model.js — 11/11 present.

    GAP_1_systems_without_specs:
      finding: >
        14 systems are supervised by autopilot. FOUR have no spec anywhere:
        autopilot, clear-glass, loom, ollama-bridge.
        (diagnostic has only a docs/ spec, no system-local one.)
      why_it_matters_here: >
        The container model gives EVERY system a container holding its config,
        tests, API map and ledger. A container for a system with no spec has
        nothing authoritative behind it — the config panel would have no
        declared schema, and §12.5 (spec as living document) has nothing to
        track drift against.
      sharpest_point: >
        The two systems this design depends on MOST are two of the four with no
        spec: AUTOPILOT is the connection broker (the entire tablet routes
        through it) and LOOM is the registry authority (config writes through
        to it). Building the tablet on two unspecced systems inverts §8.5.
      required_before_T2: "autopilot.spec and loom.spec must exist. clear-glass and ollama-bridge can follow."

    GAP_2_ledger_namespace_mismatch:
      finding: >
        data/ledger/ contains directories that are NOT supervised systems —
        cg, eros, forge, liminal, reflection, test — while four supervised
        systems have NO ledger directory: diagnostic, emerge, loom, clear-glass.
      why_it_matters_here: >
        The container is keyed by system. If the ledger tree is keyed by
        something else (hook owner? emitting component? historical name?), then
        "this container's events" is ambiguous for both sets. A container for
        `loom` would show an empty ledger while `forge` events exist with no
        container to live in.
      unresolved: >
        Which namespace is authoritative — the supervised-kernel list or the
        ledger tree — is NOT decided by this spec. It must be resolved before
        T1 (ledger explorer), because T1's whole job is browsing that tree by
        system.
      note: "Recorded, not guessed. §1.2 — a named ambiguity beats an invented answer."

    still_unmapped_implementation_surfaces:
      note: >
        The ARCHITECTURE is mapped. The following five implementation surfaces
        are named in this spec but their APIs have NOT been read (§8.4 forbids
        building on them until they are):
      items:
        - "lib/replay-engine.js — exists and is orphaned; its API, ledger-format compatibility, and rewind cost are unknown."
        - "CFR→ledger attachment — how the field is stamped onto entries is undesigned."
        - "autopilot as broker — it has _startStatusServer and requestSpawn, but whether it can proxy arbitrary system calls is UNVERIFIED."
        - "cross-process consumer reporting (B1) — 'each process reports its subscriptions' is a sentence, not a design."
        - "emergent CLI — whether component `grammar` is EXECUTABLE or merely descriptive text has not been checked."
      consequence: >
        T3 (change governance) is listed with `blockers: none`. That claim
        depends on sigma-over-config and CFR-on-ledger being straightforward,
        and NEITHER has been verified. The claim may be wrong. Verify before
        scheduling T3.

  # ══════════════════════════════════════════════════════════════════════════
  # ADDENDUM 2026-07-24b — two adopted from external review (rete.md)
  # ══════════════════════════════════════════════════════════════════════════

  intent_layer:
    status: "ADOPTED — a real gap in v0.2.0, credited to the external review."
    the_gap: >
      v0.2.0 specced the GOVERNANCE of autonomous change (user-live vs
      system-in-COS, ledger, sigma, escalation) but not its OBSERVABILITY.
      You could see what an autonomous system DID. You could not see what it
      WANTED to do — including the things it was denied.
    the_model: "Every autonomous action exists in three visible stages: INTENT → REASONING → EXECUTION."
    example:
      intent:    "'I believe Guardian should restart.'"
      reasoning: "the evidence it used — sigma score, CFR conditions, RFR2 chain, memory recall"
      execution: "approved + completed | denied + human override | proposed, awaiting decision"
    why_it_matters: >
      Watching what happened is forensics. Watching what the system WANTED is
      supervision. You need to see a bad decision FORMING, not discover it in
      an audit afterwards. This becomes the primary surface as autonomy grows.
    already_has_real_substrate:
      - "cortex/self-heal/index.js L2 — writes forge_patches status:'proposed', NEVER 'verified'. Proposals it never applies."
      - "lib/reflection.js — proposes constitutional changes, never auto-applies; human decides."
      - "cortex/core/raid/envelope.js — the trail already records status transitions per hop."
      note: >
        These proposals ALREADY EXIST as JAA rows that nothing surfaces. The
        Intent layer is not new machinery — it is the missing VIEW onto
        decisions the system is already making and already declining to act on.
    unblocked: "Partially. The proposal rows exist today; the reasoning-evidence join needs RFR2 (B2) for the causal half."

  composed_investigation:
    status: "ADOPTED — a presentation correction, no architectural change."
    the_problem_with_v0_2_0: >
      The detection layer described sigma, CFR and RFR2 as three mechanisms.
      Architecturally accurate; a BAD user surface. It forces the operator to
      know which engine answers which question.
    the_correction: >
      Expose the INVESTIGATION, not the engines. One composed answer,
      progressively expandable:
        "Unusual? YES, 84% confident"        (sigma)
          → "Conditions: stable → turbulent"  (CFR)
            → "Relationship: guardian ⇄ cortex, friction rising since 14:02"  (lattice)
              → "Root cause: port change → restart → cache invalidation → retry storm"  (RFR2)
                → "Recommendation: rollback, est. recovery 95%"  (cognitive tools)
    constraint: >
      Each expansion level must degrade honestly. If RFR2 is unavailable (B2),
      the root-cause level says "causal attribution unavailable — RFR2 not
      wired", NOT a guess and NOT silence (§1.2). A composed answer must never
      imply an engine contributed when it did not.
    unchanged: "The engines, their ownership, and their write authorities stay exactly as specced. This is the presentation layer only."

  external_review_note:
    source: "rete.md, 2026-07-24 — reviewer given the spec with no other context."
    what_it_got_right: "the Intent layer (a real gap), composed investigation (a real correction), and the framing that relationships rather than nodes are what should feel alive — which matches the associative lattice's actual design (CFR per relationship, agnostic pairs)."
    what_it_could_not_know: >
      It engaged with the vision and skipped every blocker. It described
      "watching reasoning flow" as though the cognitive layer were buildable
      (it is not — the tools are not registered as RAID capabilities), called
      the connectome undersold (most edges do not exist yet, B1), and listed
      CPU/RAM per system as a given (not collected anywhere). This is the
      expected limit of reviewing a DESIGN without knowing whether the SYSTEM
      supports it — and it is why the blocker banner now precedes the thesis.

  # ══════════════════════════════════════════════════════════════════════════
  # ADDENDUM 2026-07-24c — readiness, blocker taxonomy, constitutional review
  # Second external review round. Adopted with one correction to its own table.
  # ══════════════════════════════════════════════════════════════════════════

  blocker_taxonomy:
    status: "ADOPTED, with a THIRD category the review's table was missing."
    why: >
      'Blocked' has been carrying two different meanings, and planning suffers
      for it. Implementation blockers can be scheduled immediately.
      Architectural blockers require a prerequisite project first.
    categories:
      ARCHITECTURAL:
        meaning: "cannot be built until another subsystem exists or a structural constraint is resolved"
        examples:
          - "RFR2 causal attribution — blocked by the ESM/CJS fault line (B2). meta/ (45 ESM files) cannot be imported by the CJS core."
          - "Brain view — blocked by B1: the consumer graph is single-process, so most edges do not exist to draw."
          - "Cognitive layer — cognitive tools are not registered as RAID capabilities (mind-map Tier 3, unbuilt)."
      IMPLEMENTATION:
        meaning: "the architecture is correct and the pieces exist; the wiring does not"
        examples:
          - "CFR stamping onto ledger entries — CFR is live, CJS, and unaffected by B2."
          - "COS autonomy sandbox — cos/manager.js exists (orphaned); sovereign per-compartment memory became real 2026-07-20."
      UNKNOWN_UNTIL_READ:
        meaning: >
          NOT YET CLASSIFIABLE. The file exists but its API has not been read,
          so whether it is architecturally or implementation blocked is
          genuinely undetermined.
        why_this_category_exists: >
          The external review's table listed 'Replay: engine exists, wiring
          missing' as implementation work. That is an ASSUMPTION —
          lib/replay-engine.js has not been read, and whether it can replay
          THIS ledger format is unknown. It may be architecturally blocked.
          Calling an unread surface 'implementation work' is exactly the
          optimism the blocker banner exists to prevent (§1.1).
        members:
          - "lib/replay-engine.js — API and ledger-format compatibility unread"
          - "sigma over config changes — whether config changes reach the bus in a form _scoreEvent can score is unverified"
          - "emergent CLI — whether component `grammar` is EXECUTABLE or merely descriptive is unchecked"
          - "autopilot as broker — whether it can proxy arbitrary system calls is unverified"
    rule: "No item may be scheduled out of UNKNOWN_UNTIL_READ. It must first be read and reclassified (§8.4)."

  readiness_overlay:
    status: "ADOPTED — and it is the strongest idea in either review round."
    the_idea: "Each container and each planned surface visibly communicates its own maturity and what it is waiting on."
    why_it_fits_the_thesis: >
      'All movement needs to be seen.' Progress is movement. A blocker is
      movement that has STOPPED. Both deserve to be observable, exactly like
      packets through RAID or CFR values over time.
    the_stronger_argument_the_review_did_not_make: >
      A roadmap written into a spec DRIFTS the moment code lands — this entire
      session was spent finding drift of exactly that kind (a spec-drift
      checker reading a stale mirror for months; two registries disagreeing;
      269 vs 230). A readiness overlay COMPUTED FROM LIVE STATE cannot drift.
      'Brain view: BLOCKED, waiting on cross-process reporting' must be DERIVED
      from whether cross-process reporting exists — never typed by a human.
    therefore: >
      Readiness is a PROJECTION, the same pattern already proven twice in this
      system: hooks project from components, the config registry projects from
      the ledger. The roadmap becomes a projection of reality.
    example_surface: |
      Brain View
      Status: BLOCKED
      Waiting for:
        ✓ consumer graph          (exists)
        ✗ cross-process reporting (B1, architectural)
        ✗ RFR2 interop            (B2, architectural)
    consequence: "The tablet observes not only RUNTIME state but ARCHITECTURAL state. The implementation roadmap becomes part of the system's self-description."

  presentation_order:
    status: "ADOPTED — v0.3.0 hoisted the blockers above the thesis; this makes it the governing structure."
    old: "Vision → Architecture → Blockers  (readers get excited by the first two and mentally discount the third — demonstrated, not theorised: the first reviewer did exactly this)"
    new: "Current Reality (buildable ✓ / blocked ⚠ with reasons) → Future Vision"
    rule: "It must be impossible to plan work on a blocked phase without immediately seeing why it cannot be completed."

  constitutional_review_surface:
    status: "ADOPTED with a HARD SEPARATION. James asked for 'a place to adjust the constitution and axioms for RAID'."
    the_separation: >
      Two things that look similar and carry completely different risk. They
      must not share a write path.
    tier_1_tunables:
      what: "RAID's weights, thresholds, SNR gate, provider preferences"
      verified_real: "data/cortex/memory/raid_tunables.json — 5 live rows, e.g. invariantThreshold: 0.7, keyed and editable"
      treatment: >
        ORDINARY CONFIG. Editable from the tablet under the same governance as
        ports: written to the ledger, projected to the registry, sigma-scored,
        CFR conditions stamped, anomalies raise friction. User-initiated
        applies live; system-initiated runs in COS first.
    tier_2_axioms:
      what: "AXIOMS-v3.1 — the constitution itself"
      treatment: "READ AND APPROVE ONLY. The tablet NEVER writes the axioms file."
      why: >
        The axioms are the thing that JUDGES every change, including changes to
        themselves. Making them mutable through the same console they govern
        would let the constitution be edited by the mechanism it constrains —
        precisely what §7.2 (Ideas Cannot Affect Runtime) exists to prevent.
      the_system_already_agrees: >
        VERIFIED, not asserted — lib/reflection.js:32-35 states it outright:
        "the actual write is intentionally NOT implemented — there is no
        proposeKernelUpdate that touches constitutional-ai.js. When enough
        evidence accumulates, this module opens a CONSTITUTIONAL gap describing
        the proposed change and stops. A human decides. Never automatic."
        The separation is the system's OWN existing design. This spec surfaces
        it rather than inventing it.
      the_flow: |
        reflection accumulates evidence
          → opens a CONSTITUTIONAL gap (proposal + reasoning), and STOPS
            → TABLET SHOWS the proposal, its evidence, and its Intent record
              → a human decides
                → the change lands in AXIOMS-v3.1 via git, NOT through a UI write path
      what_the_tablet_adds: >
        Today those constitutional gaps are JAA rows nothing surfaces — the
        system can propose amendments to its own constitution and no one sees
        them. The tablet is the review bench. It closes the loop WITHOUT
        creating a write path.

# ════════════════════════════════════════════════════════════════════════════
# ADDENDUM 2026-07-30 — observability arc (OB1-OB11) + CA7 gear reconciliation
# Reconciles the observability/tablet phasemap work with THIS spec's container
# model, so the two tablet designs are one (§10.3), not competing.
#
# ALIGNMENT — the OB5 homepage IS the container model:
#   The observability phasemap's OB5 built a box-per-system homepage → click →
#   that system's diagnostics menu. That is exactly this spec's container_model
#   ("one container per system, holds EVERYTHING about that system"). No conflict;
#   OB5 is a first, partial cut of the container. Its panels map onto
#   each_container_holds as:
#     OB5 "summary/diagnostics"  → (new) live health/gaps/regime (OB1/OB2)
#     OB5 "event stream"         → each_container_holds.events
#     OB5 "snapshots"            → each_container_holds.snapshot (replay engine)
#     OB5 "cli" (per-system)     → each_container_holds.cli (emergent grammar)
#     OB5 "edge cases"           → (new, OB11) — ADD to each_container_holds
#     OB5 loom "versions/repo/roadmap" → (new) — loom-specific container panels
#   GREW 2026-07-30: OB5 now has api_map (→/contract-map), databases (→/tables),
#   files (→/files), tests (→/run-tests, the REAL run-all.js). COMPLETED
#   2026-07-30: config (port/resolution/governed-edits), user_model (→copilot
#   getHypotheses), controls (spawn/touch →autopilot). The CA7 account gear lives
#   in the COPILOT container's controls panel — registers a provider slot via
#   copilot; credentials stored as a REFERENCE, never raw in the UI (decoupling
#   law). each_container_holds is now fully surfaced. The tablet IS the container.
#
# NEW additions the container model should absorb (from the observability arc):
#   - OB1/OB2 live diagnostics + fault detection → a container "diagnostics" panel.
#   - OB3/OB4 movement + bottlenecks → a cross-container "flow" view (T4 brain view
#     extended: the brain view's honest-render law IS §1.1, already shared).
#   - OB6 continuous ollama injection → the cognitive layer (T6) already feeds
#     copilot; OB6 is that feed carrying diagnostics.
#   - OB8 leverage / OB10 sigma-roles / OB11 edge-cases → the T3 change-governance
#     + T6 cognitive tier (sigma-over-config was PROVISIONAL/unverified in T3;
#     OB10 gives it the role-interpretation it needed).
#   - OB9 the 3D map → an EXTENSION of T4 brain view into 3D, same no-fake law.
#
# CA7 GEAR (multi-account login) — where it fits:
#   The CA7 account-registry backend (lib/account-registry.js) is built; the tv-ui
#   GEAR is unbuilt. Per this spec it belongs in each_container_holds.config
#   (ports/thresholds/toggles) OR a dedicated "accounts" panel on the copilot
#   container. It must obey change_governance (edits are governed, not raw) and the
#   decoupling_law (the gear owns no authoritative state — the registry does).
#
# DRIFT FLAGGED (§10.3, honest) — OB5 hardcodes 7 system ports; THIS spec's
#   connection.principle is "the tablet talks to ONE endpoint, autopilot resolves
#   the rest" (the hard-pointer problem RAID eliminated). OB5's port map is the
#   exact anti-pattern this spec names. RESOLUTION (not yet done): OB5 should route
#   through autopilot's status server, not hardcode ports. Recorded as the next
#   tablet correction. Until then OB5 works but violates the decoupling ideal.
# ════════════════════════════════════════════════════════════════════════════
