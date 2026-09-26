spec:
  meta:
    name:    2026-08-28-definition-of-complete
    version: 0.1.0-phasemap
    status: >
      PHASEMAP 2026-08-28. James's own stated conditions for NEXUS to be
      considered complete. Each graded honestly against real, checked
      current state — not restated as new work where real work already
      exists, and not marked closer to done than it actually is. Cross-
      references real phase IDs already tracked elsewhere rather than
      duplicating their scope under a new name.
    uuid:    nexus-2026-0828-definition-of-complete-phasemap-v1-0000-001
    intent: >
      A real, evaluable finish line, not a wishlist. Each condition
      below states plainly what's real today, what's the specific
      remaining gap, and which already-tracked phase(s) would close it —
      so "is NEXUS done" has a real answer derivable from this file plus
      loom's own real phase-completion state, not a feeling.

  phases:

    DOD1_fully_autonomous:
      status: "OPEN — real tension named directly, not glossed over: full
        autonomy sits uneasily next to axiom-respecting discipline
        (DOD6). Every real thing built correctly this session depended on
        a verification checkpoint somewhere — a human's question, a real
        test run, a precommit hook. Autonomy without a checkpoint
        SOMEWHERE is the exact failure mode this whole project fights
        (things that look done but aren't). Reframed honestly: the real
        target is 'autonomous WITH real, automated verification gates'
        (precommit hard-blocks, real end-to-end tests, sigma-gated
        commits — all three already real, DOD6/DOD8 cross-ref), not
        autonomy with no gate at all."
      depends_on: []
      does: >
        Names the real definition being aimed at, honestly distinct from
        the word James used, so 'autonomous' doesn't silently come to
        mean 'unchecked' later.

    DOD2_diagnose_and_self_repair:
      status: "OPEN, substantially real. cortex/self-heal's 5-level
        escalation ladder, service/nexus-diagnostic.js's SYSTEMS registry
        + real gap detection + sigma-gated remediation are all real and
        proven this session (memory-pressure emergency GC, Clear Glass
        spawn-failure gaps, both verified end-to-end). Real, concrete
        remaining gap: only a handful of real systems are actually
        registered in SYSTEMS (guardian, cortex, clear-glass among them)
        — most of the ~30+ real systems in this codebase are not yet
        diagnostic-aware. Not a design gap, a coverage gap."
      depends_on: []
      does: >
        The real remaining work is enrollment, not invention — the
        mechanism already works, proven, for every system that's
        actually registered.

    DOD3_build_using_idearium:
      status: "✓ DONE — idearium/api/index.js's real pipeline (spec ->
        chunk -> dispatchChunkWithVerification -> real agent dispatch ->
        completeChunk, plus getRepoLayer().ingest() -> real repo with
        lineage) is substantially complete and proven, confirmed by
        reading it directly this session, not assumed. Genuinely more
        built than initially credited when first investigated."
      depends_on: []
      does: >
        Real, working, closed — the one condition on this list that
        needed no new phase at all, only confirmation.

    DOD4_build_and_expand_from_loom:
      status: "OPEN — the single largest real gap on this whole list.
        Loom today only MAPS: real cartography of components/hooks/
        wires/phasemaps, passive and accurate, but nothing decides what
        to build next from that knowledge and acts on it. Closer to 20%
        than 80% honestly. SBP2_loom_idearium_template_to_cos_blueprint_
        bridge (docs/2026-08-28-self-building-pipeline-phasemap.spec) is
        the real, tracked first step — bridging loom's own maps into
        COS's real blueprint launcher — but SBP2 alone does not make loom
        decide anything; it only gives loom's data a real destination.
        The actual 'loom decides and acts' piece has no phase yet."
      depends_on: []
      does: >
        Named as the real, honest bottleneck rather than the item most
        likely to get quietly skipped because everything else on this
        list looks more finished.

    DOD5_maps_snapshots_backups_living_model:
      status: "OPEN, mostly real. Versionium (docs/versionium.spec, all 4
        build-order steps DONE this session — DAG fix, rfr2 diff
        resolved, per-route hashing, sigma-gated auto-commit) covers
        'maps, dynamically updates, logs, snapshots, records backups of
        each version' completely and verifiably. The remaining real gap
        is narrower than the condition sounds: 'updates its living model
        to stay organized and aware, also for co-pilot' is
        SS3_unified_living_model_system_plus_person (docs/2026-08-27-
        event-taxonomy-and-brainstorm-phasemap.spec) — real user-model
        (lib/user-model.js) and real system-manifest (SS1, still pending)
        exist separately; nothing yet connects them into one place
        co-pilot or anything else can query as 'the current, aware state
        of the whole system.'"
      depends_on: []
      does: >
        Confirms most of this condition is already real and closed;
        isolates the one genuine remaining piece instead of treating the
        whole condition as equally unbuilt.

    DOD6_respects_axioms:
      status: "✓ DONE, and the most real item on this entire list — not
        because it's finished (axiom discipline is never 'finished'), but
        because it is the one condition PROVEN against this session's own
        real mistakes, not just claimed. The scripts/precommit-check.js
        hard-blocks (spec-drift, version-sync) are real, automated axiom
        enforcement, not aspirational. This session's own .nex-vs-COS
        near-miss (assumed duplicate, checked, found wrong, corrected
        before shipping) and the SBP7a-e phase-ID regex bug (caught by
        re-verifying against the real scanner before committing, not
        after) are direct, real evidence the discipline catches real
        errors in real time, not just in principle."
      depends_on: []
      does: >
        The condition this whole project's real reliability actually
        rests on — everything else on this list being real instead of
        illusory traces back to this one being taken seriously.

    DOD7_tested_using_cos:
      status: "OPEN — real gap, no real work exists here yet. COS's real compartment
        lifecycle (spawn/execute/resolve, real SnapshotEngine, proven
        this session's Versionium work) exists, but nothing today uses a
        COS compartment as an actual TEST ENVIRONMENT for validating a
        change to another real system before it ships. cos/foundation/
        snapshot.js's own real restore() could plausibly back a real
        'try this change in a disposable compartment, verify, then
        promote' workflow — the real mechanism to build on is already
        proven, the actual test-harness wiring is not."
      depends_on: []
      does: >
        Names a real, currently-missing piece rather than assuming COS's
        existing maturity already covers it.

    DOD8_contract_conditions_comparison_and_drift_engines:
      status: "OPEN, one of three real sub-items already done. 'Conditions
        for each contract' = cortex/core/raid/contract-intake.js's real
        dependency graph (dependsOn/onFail: retry/fallbackAgent/halt),
        built and verified end-to-end this session — DONE. 'Comparison
        engine for the spec and the chunk' — partially real: lib/seam/
        spec-parser.js's own testContract per chunk is a real, working
        comparison for THAT one source, but nothing general-purpose
        compares any spec against any chunk across sources. 'Behavioral
        drift engine' — real detectors already exist and work (lib/
        file-integrity.js's own _computeSigma, orchestrator/lib/sigma-
        writer.js's composite sigma) but are scattered across separate
        real mechanisms, not unified into one named engine."
      depends_on: []
      does: >
        Confirms the hardest-sounding item is a third done, a third
        partial, a third real-but-scattered — not equally unbuilt across
        all three, which matters for prioritizing what's actually left.

  cross_referenced_already_tracked:
    note: >
      Per axiom discipline: SBP1-12 (docs/2026-08-28-self-building-
      pipeline-phasemap.spec), ET1-6/BR1-9 (docs/2026-08-27-event-
      taxonomy-and-brainstorm-phasemap.spec), TX10/14/16, and Versionium's
      own 4 build-order steps are the real, buildable phases this
      completion criteria depends on — none re-described here, only
      pointed to.
