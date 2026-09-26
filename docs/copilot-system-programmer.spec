spec:
  meta:
    name:        copilot-system-programmer
    version:     0.1.0
    status:      proposed
    uuid:        nexus-copilot-sysprog-v1-0000-2026-0701-jamesbrooks-001
    axioms:      [§5.7, §2.1, §2.3, LAW_II, §M3, §M4]
    depends_on:  [copilot, guardian/lab, nexus-query-surface, cortex, RAID, schedules-table]
    purpose: >
      Co-pilot is currently a request-response interface. You ask, it answers,
      the context window closes, nothing persists except 8 chat_log entries.
      This spec extends co-pilot into a durable system programmer: it can
      create monitoring tasks that run independently, define feedback loops
      that persist across sessions, schedule actions, and accumulate real
      knowledge of each sovereign system over time — using the intelligence
      engine, memory system, and RAID as its tools, not its constraints.

  capabilities:

    monitoring:
      description: >
        Co-pilot creates a durable monitor by writing to the `schedules` JAA
        table (already declared in NEXUS.md). The monitor runs on the
        orchestrator's scheduler, calls the nexus-query-surface at the
        specified interval, and opens a gap if the condition is met.
      interface: >
        "Monitor guardian's sigma every 10 minutes and alert me if it crosses 0.5"
        → co-pilot writes:
          { systemId: 'guardian', metric: 'sigma', threshold: 0.5,
            intervalMs: 600000, action: 'gap.open', condition: 'gt' }
        → orchestrator runs this on schedule
        → if sigma > 0.5, gap opens: type='user_monitor', predicate=sigma_check,
          severity=HIGH, owner='user-monitor'
      not: "A separate alert system. The existing gap pipeline IS the alert system."

    feedback_loops:
      description: >
        Guardian's lab already supports hypothesis + conditions + max_iterations.
        What's missing: lab sessions aren't persisted durably and co-pilot
        can't create them. This capability makes lab sessions first-class
        persistent objects that co-pilot can define and the system runs.
      interface: >
        "Create a feedback loop: every time guardian dispatches a job to chatgpt,
         check if the response contains a SEAM VERDICT. If not, log it as a
         fault and retry with the claude provider."
        → co-pilot composes a lab session:
          { hypothesis: 'chatgpt SEAM compliance', triggerEvent: 'guardian.job.dispatched',
            conditions: [{ op: 'not_contains', value: 'SEAM VERDICT' }],
            onFail: { action: 'retry', provider: 'claude', faultClass: 'seam_miss' } }
        → written to JAA lab_sessions with status: 'active'
        → guardian's lab engine picks it up and runs it on every matching event

    task_scheduling:
      description: >
        Co-pilot can schedule one-time or recurring tasks: "run the spec drift
        check every morning at 9am", "rebuild the blueprint index after every
        Versionium commit", "run a full diagnostic on guardian if its sigma
        exceeds 0.7".
      storage:  schedules JAA table (already declared)
      executor: orchestrator's contract-poller (already runs on a 15s tick)
      trigger_types:
        - cron: wall-clock schedule
        - event: bus event fires (e.g. versionium.commit)
        - condition: metric crosses threshold (e.g. sigma > 0.7)
        - manual: user command

    system_learning:
      description: >
        Co-pilot accumulates knowledge of each sovereign system over time.
        Not by being told — by reading the query surface's output before
        every interaction and writing observations to Cortex memory.
      mechanism: >
        After every response involving a system (guardian, cortex, etc.),
        co-pilot writes a conditioning_log entry:
          { system: 'guardian', context: QueryResult, action: what_co-pilot_did,
            outcome: what_happened, tick: logical_time }
        RAID already tracks per-agent fitness. This extends the same pattern
        to per-system capability profiles: what co-pilot has learned about
        what each system can do, what breaks it, what fixes it.
        Over time, the conditioning_log IS co-pilot's knowledge of the system.

    bounce_between_systems:
      description: >
        Co-pilot can currently dispatch to guardian or ollama. It should be
        able to compose multi-system operations: query cortex for context,
        dispatch to guardian for execution, write results to idearium,
        open a gap if the result is unexpected, notify via SSE.
      mechanism: >
        A task graph — each node is a system call, each edge is a condition.
        The existing contract queue already supports sequential dispatch.
        What's missing: co-pilot composing the graph from natural language.
        "Ask cortex what guardian knows about this topic, then ask guardian
         to run a job with that context, then save the result to idearium"
        becomes three contract-queue entries with causedBy chains.
      implementation: >
        Intelligence engine's analysis() decomposes the request into atomic
        system calls. Each call is a contract. Contracts are chained via
        causedBy. The event ledger captures the full causal chain.
        Nothing new architecturally — this is just the contract queue used
        as a task graph, which is exactly what it was designed for.

  memory:
    conversation_persistence: >
      Every conversation is stored in chat_log (already happening).
      Every conditioning_log entry is written to cortex_memory.
      Before every response, co-pilot reads:
        - last 8 chat_log entries (current)
        - most relevant conditioning_log entries for the systems involved
          (via nexus-query-surface keyword resolution)
        - any open gaps related to what's being discussed
      This is the difference between "I remember what we said" and
      "I know what this system has done, what's broken, and what's worked."

    redundant_ledger: >
      Every conversation entry is also written to the event ledger with
      type='copilot.conversation', causedBy set to the previous turn's
      event ID. The ledger is append-only (§2.1), so conversation history
      is never lost even if chat_log is cleared or corrupted.
      This is the redundant ledger — same data, two write paths, one read path.

  agnosticism: >
    Co-pilot doesn't know what NEXUS is at the start of each session.
    It learns by reading its own memory. §M3: the system improves by
    accumulation, not retraining. A co-pilot that's been running for a
    week knows more about guardian's failure modes than one running for
    a day — because it has more conditioning_log entries, not because
    it was retrained. The intelligence engine, RAID, and the query
    surface are its tools. The system is the subject it's learning about.

  build_order:
    - "1. nexus-query-surface (the read layer everything else needs)"
    - "2. Monitoring — schedules table writer + orchestrator executor"
    - "3. Feedback loops — co-pilot → lab session creator"
    - "4. Redundant conversation ledger — event_log write alongside chat_log"
    - "5. System learning — conditioning_log write after every response"
    - "6. Multi-system task graphs — contract queue composition from co-pilot"
    - "7. Task scheduling — cron/event/condition triggers on orchestrator"
