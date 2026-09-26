spec:
  meta:
    name:        open-loop-taxonomy
    version:     1.0.0
    foundation:  nexus-system-foundation@1.1.0
    kind:        library-module   # not a service — lives at lib/open-loop-taxonomy.js
    uuid:        nexus-open-loop-taxonomy-v1-0000-2026-0901-jamesbrooks-001
    status:      active
    purpose: >
      THE INSIGHT (module's own header): a gap is an open loop. Open loops
      are not errors — they are uncertainty that has been acknowledged and
      preserved with context. "The system's awareness is measured by the
      quality of its open loops, not the quantity of facts it stores."
      Closed loops become knowledge; open loops are active intelligence
      work; loop ecology is the health signal for the system as a whole.

  taxonomy:
    loop_types:
      - UNDERSTANDING    # input not parsed or referenced correctly
      - KNOWLEDGE        # input understood, information missing
      - CAPABILITY       # known request, system cannot perform it
      - CAUSAL           # something happened, reason unknown
      - CONFLICT         # two truths cannot simultaneously exist
      - DECISION         # multiple valid actions, no winner
      - INTEGRITY        # trustworthiness uncertain
      - RELATIONAL       # system lacks model alignment with human
      - TEMPORAL         # correct answer exists, wrong time
      - CONSTITUTIONAL   # cannot determine if action is permissible
    loop_states:
      - OPEN            # detected, not yet addressed
      - HELD            # intentionally preserved — known to exist, not closing yet
      - INVESTIGATING   # active diagnosis underway
      - ESCALATED       # passed to higher-level system or human
      - BLOCKED         # cannot progress — missing dependency

  api:
    exports: [LOOP_TYPES, LOOP_STATES, LEGACY_TYPE_MAP, classify, createLoop, canTransition, assertTransition, summarize, ecology]
    ecology:
      description: >
        Returns ecology_health ('nominal' | 'degraded' | 'watch') from
        critical-count and temporal-accumulation signals — the module's
        own real health-summary function, not a separate mechanism.

  consumers:
    - cortex/boot.js
    - orchestrator/lib/request-handler.js
    - lib/compartment-engine.js
    - lib/open-loop-taxonomy.patch.js
    - lib/loop-topology.js       # loop-topology consumes this module's loop shape directly
    - lib/reflection.js
    - lib/constitutional-ai.js
    - copilot/lib/user-model.js

  history:
    - date: unknown
      summary: "Original build — 514-line module, 10-type taxonomy, 5-state lifecycle."
    - date: 2026-09-01
      summary: >
        First .spec written, closing one of the 11 real gaps
        orchestrator/lib/spec-drift.js's live check reported (§LM1).

  gaps:
    as_of: 2026-09-01
    entries: []   # widely consumed (8 real callers confirmed), no open gap found this pass

  version_history:
    - version: 1.0.0
      date: unknown
      summary: "Original build."
      versioniumCommitId: null
