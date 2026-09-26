spec:
  meta:
    name:        nexus-optimization-service
    version:     0.1.0
    status:      proposed
    uuid:        nexus-optimization-service-v1-0000-2026-0701-jamesbrooks-001
    axioms:      [§M3, §M4, §A1, §A2, §2.1, §2.3, LAW_II]
    depends_on:  [RAID, cortex, guardian/lab, nexus-query-surface,
                  copilot-system-programmer, nexus-relationship-shape,
                  conditioning_log-table, feedback_scores-table]
    purpose: >
      NEXUS currently improves reactively — a gap opens, a human notices,
      something gets fixed. This spec defines the proactive layer: feedback
      loops that run independently, identify what's improving and what's
      degrading before it becomes a gap, and surface optimization opportunities
      to co-pilot with enough context to act on them.

      §M3: The system improves by accumulation, not retraining. §A1: Successful
      executions create gravitational attractors — patterns that worked get
      reinforced. §A2: Failure is field distortion — recompute the shape,
      don't just patch the symptom.

  feedback_loops:
    what_they_are: >
      A feedback loop is a durable, scheduled observation that:
        1. Reads a metric (sigma, gap count, response quality score, etc.)
        2. Compares it to a baseline (event-ledger learned norms)
        3. Classifies the direction (improving / stable / degrading)
        4. Acts on that classification (log / alert / open gap / suggest)
      Lab sessions already implement this for one-shot experiments. This extends
      it to durable, recurring observations that accumulate over time.

    storage:  schedules + feedback_scores JAA tables (both already declared)
    execution: orchestrator contract-poller (already runs on 15s tick)

    types:
      metric_loop: >
        Watches a scalar metric for a system.
        Example: watch guardian's sigma every 5 minutes. If it's been above 0.4
        for 3 consecutive readings, open a gap. If it's been below 0.2 for
        10 consecutive readings, write a feedback_score entry (positive signal —
        this system is operating well).

      relationship_loop: >
        Watches the CFR field shape between two systems.
        Example: watch guardian↔cortex coherence. If it drops below 0.5 and
        hasn't recovered in 30 minutes, open a gap and run the what-if engine
        against the last known stable configuration.

      quality_loop: >
        Watches co-pilot's response quality signals.
        Quality signals: user says "that's wrong" / "try again" / "not quite"
        (friction signals), or "yes" / "exactly" / "perfect" (resonance signals).
        These aren't sentiment analysis — they're literal response patterns that
        the conditioning_log already captures. The loop scores each session and
        writes to feedback_scores.

      coverage_loop: >
        Watches the blueprint for divergences. Every 24 hours, checks how many
        components exist in code but not in the spec registry. If that number
        is rising, the system is outgrowing its own documentation. Opens a
        gap: type='blueprint_divergence', severity based on rate of growth.

  learning_flywheel:
    description: >
      §A1 says successful executions create gravitational attractors. This is
      the mechanism: every time something works (gap closes, quality signal
      positive, sigma recovers), RAID's fitness model gets a positive update
      for the agent/system involved. Every time something fails, the fitness
      model updates negatively and the CFR field registers friction.
      Over time, the fitness landscape reflects reality — not what was
      configured, but what has actually worked in this specific installation
      of NEXUS with this specific user.

    components:
      raid_fitness: >
        RAID already tracks per-agent health and fitness. Extended here to track
        per-system fitness: what has co-pilot successfully accomplished with each
        sovereign system? What has it failed at? The conditioning_log is the
        source; RAID's fitness model is the target. The update happens after
        every completed task.

      bep_patterns: >
        The BEP (Behavioral Execution Patterns) engine in NEXUS-SELF already
        tracks successful execution patterns as "crystals" (gravitational attractors
        in §A1's language). The optimization service feeds it: every successful
        task completion writes a crystal candidate. The BEP engine decides if it's
        a genuine pattern (repeated, stable) or a one-off.

      field_memory: >
        When a relationship's CFR field recovers from a stressed state, the
        recovery path is recorded: what changed, what sequence of events led to
        recovery, how long it took. The next time that relationship stresses,
        the optimization service surfaces the previous recovery path as a
        suggestion — not a command, a suggestion. The human decides.

  optimization_opportunities:
    surfacing: >
      Every morning (or on user request), co-pilot synthesizes the last 24h
      of feedback_scores, conditioning_log, and sigma trajectories and
      surfaces a ranked list of optimization opportunities:

      1. Guardian's sigma has been persistently elevated (avg 0.45 over 24h,
         normal baseline 0.18). Root cause: NCP flapping, 4 fractal detections.
         Suggested: review chatgpt tab stability, consider increasing reconnect
         backoff floor.

      2. Co-pilot's response quality for cortex-related queries has improved
         (feedback_score +0.3 over the week). No action needed — this is
         working. BEP pattern recorded.

      3. The guardian→cortex coherence has been declining slowly for 3 days
         (0.7 → 0.45). No gap has opened because it hasn't crossed a threshold,
         but the trajectory suggests one will. What-if: would it help to add
         a heartbeat hook on cortex's job completion path?

    not_automated: >
      Optimization opportunities are surfaced, not automatically acted on.
      §A2: failure is field distortion — recompute the shape, don't just patch.
      The optimization service computes the shape and surfaces it. The human
      (via co-pilot) decides what to change. Automatic action happens only
      for monitoring tasks the user explicitly created (copilot-system-programmer.spec).

  self_improvement_boundary:
    what_is_allowed: >
      - Opening gaps when metrics degrade
      - Writing conditioning_log entries from interaction outcomes
      - Updating RAID fitness scores from task results
      - Surfacing optimization opportunities and suggestions
      - Running lab sessions when explicitly requested

    what_is_not_allowed: >
      - Modifying its own source files (no build-from-inside without explicit
        human confirmation per Phase 28 / NEXUS-SELF.spec §M4)
      - Changing constitutional axioms
      - Closing gaps it didn't open (each gap's predicate must be re-verified)
      - Making routing decisions based on conditioning_log alone — RAID's
        constitutional constraints (LAW_I, LAW_III) always take precedence

    rationale: >
      The optimization service makes the system better at *using itself*.
      It doesn't make decisions about what the system *is*. That's Versionium's
      job (what changed), blueprint's job (what it's supposed to be), and the
      human's job (what it should become). The boundary is: observation and
      suggestion are always allowed; modification requires explicit human intent.

  build_order:
    - "1. nexus-query-surface + nexus-relationship-shape (prerequisites)"
    - "2. Metric feedback loop — schedules writer + orchestrator executor"
    - "3. Quality signal capture — conditioning_log writes from co-pilot responses"
    - "4. Feedback score aggregation — daily rollup into feedback_scores table"
    - "5. RAID fitness extension — per-system fitness updated from conditioning_log"
    - "6. BEP crystal integration — successful task patterns feed bep_patterns table"
    - "7. Optimization opportunity synthesis — morning briefing from co-pilot"
    - "8. Field memory — recovery paths recorded and surfaced on next stress event"
