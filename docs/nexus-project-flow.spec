spec:
  meta:
    name:        nexus-project-flow
    version:     0.1.0
    status:      proposed
    uuid:        nexus-project-flow-v1-0000-2026-0701-jamesbrooks-001
    axioms:      [§2.1, §2.3, §3.1, §M3, LAW_II, LAW_V]
    depends_on:  [idearium, versionium, copilot-system-programmer, nexus-query-surface,
                  cortex, blueprint, RAID, project_registry-table]
    purpose: >
      When there are no active projects, NEXUS should not wait silently.
      It should read its own state — idearium's stalled ideas, open gaps,
      blueprint divergences, sigma trajectory — and open a conversation.
      When there IS an active project, every phase from idea → spec →
      repository → chunked distribution should be navigable through
      co-pilot with the intelligence engine doing the synthesis work.
      The what-if engine and synthesis engine are not new systems —
      they are the intelligence engine's analysis() and mastermind()
      modes applied to a project context instead of a system context.

  empty_state_behaviour:
    trigger:    project_registry has zero active entries
    action: >
      Co-pilot reads from idearium (stalled ideas), gap-predicate (open gaps),
      blueprint (divergences), sigma_records (trajectory), and opens a
      structured conversation — not a generic "how can I help?" but a
      specific, state-derived offer:

      "You have 3 ideas that reached `tensioned` phase and stalled (last
       touched 4, 7, 11 days ago). You have 9 blueprint divergences —
       modules that exist in code but have no spec. Guardian has 2 gaps
       open > 48 hours. Your sigma has been rising for 6 hours.
       Do you want to work on any of these, or start something new?"

      The options surface are real, queryable, specific — not suggestions
      invented by the model. Every item comes from a JAA table with a UUID.

  idea_to_spec_pipeline:
    phases:  # Idearium's existing pipeline — not new, just surfaced
      seed:        raw idea, no structure yet
      expanding:   co-pilot asks clarifying questions, builds out context
      tensioned:   enough tension/friction detected that a spec is worth writing
      specced:     spec written, linked to idearium idea UUID
      building:    spec has a corresponding component in the registry
      complete:    blueprint includes this component, sigma contribution is zero

    gap_in_current_state: >
      Idearium has the pipeline and the data model. What's missing:
      co-pilot doesn't currently walk the user through it. When an idea
      is in `seed`, nothing prompts "what problem does this solve?" When
      it reaches `tensioned`, nothing says "ready to spec?" This spec
      defines the conversation flow that connects co-pilot to idearium's
      existing phase machine — not new infrastructure, new wiring.

    co_pilot_as_guide: >
      At each phase transition, co-pilot:
        1. Reads the current idea from idearium (GET /api/ideas/:id)
        2. Queries the query surface for related gaps, specs, components
        3. Asks a phase-appropriate question:
           seed → "What problem does this solve that nothing else does?"
           expanding → "What would break if this didn't exist?"
           tensioned → "Should I write a spec for this now?"
        4. On confirmation, calls the relevant API:
           tensioned → spec-builder creates the spec file
           specced → blueprint registers the component
           building → architect creates the hook entries
        5. Writes a conditioning_log entry so it remembers the project

  synthesis_engine:
    what_it_is: >
      Not a separate module. The intelligence engine's mastermind() mode
      applied to project context. Mastermind already does causal reasoning
      over field state — this extends it to reason over a project's history:
      what was tried, what the spec says should happen, what the gap record
      shows actually happened, and what the CFR field shape of the relevant
      system relationships looks like right now.

    invocation: >
      "Synthesize what we know about the guardian → cortex relationship"
      → mastermind() receives:
          - QueryResult for guardian AND cortex
          - all gap.closed entries where both systems appear
          - sigma trajectory for the guardian→cortex wire
          - conditioning_log entries where this relationship was discussed
          - the CFR field shape (coherence/friction/resonance/entropy)
      → returns: a structured synthesis with sections:
          what_is_true:    facts from JAA (not inferred)
          what_was_tried:  lab sessions + gap closure attempts
          what_the_field_says: CFR shape interpretation
          what_is_uncertain:   things co-pilot inferred vs confirmed
          suggested_next:  specific, actionable, linked to real gaps

    constraint: >
      Synthesis is explicitly structured as true / tried / uncertain / suggested.
      §1.3 applies — certainty must be earned, not asserted. The model's
      inferences go in `what_is_uncertain`, never in `what_is_true`.

  what_if_engine:
    what_it_is: >
      Lab's existing hypothesis + conditions + replay mechanism, composed
      through co-pilot into natural-language queries.

    interface: >
      "What would happen if I disabled the NCP reconnect backoff for chatgpt?"
      → co-pilot composes a lab session:
          hypothesis: "chatgpt stability without NCP backoff"
          data_source: last 7 days of guardian NCP event_log for chatgpt
          simulation: replay-engine replays events with backoff disabled
          conditions: [
            { op: 'length_gt', value: 3, field: 'flapping_events', label: 'more flapping' },
            { op: 'length_lt', value: 3, field: 'flapping_events', label: 'less flapping' }
          ]
          max_iterations: 1  # replay, not iterative
      → lab runs the replay
      → returns: "With backoff disabled, the replay shows 23 flapping events
                  vs 14 with backoff. Backoff appears to be reducing flapping,
                  not causing it. The underlying instability is in the chatgpt
                  tab itself, not the reconnect timing."

    constraint: >
      What-if results are labelled as simulations over historical data, not
      predictions. The replay engine is deterministic — same events, different
      parameters. The model does not predict future behavior from this alone.

  chunked_distribution:
    what_it_is: >
      When a project reaches `building` or `complete` phase, it needs to be
      distributable. The "torrent-like chunking" describes content-addressed
      distribution of project artifacts — same concept as Versionium's
      content-addressed commits but applied to the distributable artifact,
      not the version history.

    mechanism: >
      Each project artifact (spec, component registration, test suite, docs)
      gets a content-addressed hash (same FNV-1a as the file-integrity system).
      A project manifest lists all chunks with their hashes. Distribution is
      chunk-first: any chunk can be verified against the manifest without
      needing the full project. Versionium's versionium_objects table already
      stores this shape — a project distribution is a Versionium tree rooted
      at the project's spec commit.

    auto_population: >
      When a spec is written, the project manifest auto-populates:
        - the spec file (content-addressed)
        - any existing components that the spec references
        - the gap record that motivated the spec (causedBy chain)
        - the conditioning_log entries from the conversations that shaped it
      This isn't new storage — it's a Versionium commit that includes
      non-code artifacts (specs, gaps, conversations) as first-class objects.

  build_order:
    - "1. nexus-query-surface (prerequisite — everything reads from it)"
    - "2. copilot-system-programmer (prerequisite — co-pilot needs the durable context)"
    - "3. Empty-state detection in co-pilot boot — read project_registry, surface the offer"
    - "4. Idearium phase-walk wiring — co-pilot ↔ idearium API ↔ spec-builder ↔ blueprint"
    - "5. Synthesis engine — extend mastermind() with project context assembly"
    - "6. What-if engine — co-pilot → lab session composer → replay-engine"
    - "7. Chunked distribution — Versionium tree rooted at project spec commit"
