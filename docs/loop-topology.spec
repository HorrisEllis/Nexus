spec:
  meta:
    name:        loop-topology
    version:     1.0.0
    foundation:  nexus-system-foundation@1.1.0
    kind:        library-module   # not a service — lives at lib/loop-topology.js
    uuid:        nexus-loop-topology-v1-0000-2026-0901-jamesbrooks-001
    status:      active
    purpose: >
      INSIGHT (module's own header): real systems don't fail independently
      — several open loops often trace back to one shared root cause. This
      module takes a set of open loops (open-loop-taxonomy.js's shape) and
      finds their FOCAL_POINTs: the shared causal ancestors or structural
      dependencies that, if resolved, would collapse the greatest number
      of open loops at once. Output is a ranked list of focal points, each
      with affected_loops, a leverage_score (affected × confidence ×
      recurrence ÷ repair_cost), evidence, and a suggested_action.

  api:
    exports: [analyze, detectFocalPoints, prioritize, evolveLoop, REPAIR_COST, MODULE_ID, VERSION]
    analyze:
      description: "Full pipeline — detect focal points, prioritize, summarize topology_health, return top_action."

  depends_on:
    - lib/open-loop-taxonomy.js   # consumes its loop shape directly

  history:
    - date: unknown
      summary: "Original build — 441-line module, focal-point detection + leverage scoring (per lib/version.js's 'Phase 8.6' comment)."
    - date: 2026-09-01
      summary: >
        First .spec written, closing one of the 11 real gaps
        orchestrator/lib/spec-drift.js's live check reported (§LM1). While
        writing it: checked directly for real callers the way this
        codebase's own §8.4 discipline requires before describing a module
        as "wired" — found ZERO. grep across the whole tree for
        require(...loop-topology) returned no results outside this
        module's own file and lib/version.js's comment. Recorded honestly
        below rather than assumed connected because it exists.

  gaps:
    as_of: 2026-09-01
    entries:
      - id: LT1
        type: coverage
        summary: >
          No confirmed live consumer. open-loop-taxonomy.js (its own
          stated dependency) is consumed by 8 real files; none of them
          call into loop-topology.js. Built, tested (per its own header
          claims), genuinely disconnected — same "built, correct,
          disconnected" pattern this session's own loom.spec found twice
          in loom/server.js's history (cortex-sync, LoomIngest). A real
          candidate for wiring, not touched here (out of LM1 scope).
        opened: 2026-09-01

  version_history:
    - version: 1.0.0
      date: unknown
      summary: "Original build (Phase 8.6)."
      versioniumCommitId: null
