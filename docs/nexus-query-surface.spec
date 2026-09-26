spec:
  meta:
    name:        nexus-query-surface
    version:     0.1.0
    status:      proposed
    uuid:        nexus-query-surface-v1-0000-2026-0701-jamesbrooks-001
    axioms:      [§5.7, §2.3, §6.2, §12.6]
    depends_on:  [cortex, gap-predicate, blueprint, sigma-writer, event-ledger, versionium]
    purpose: >
      A single HTTP route that answers "what's happening with X?" by joining
      every queryable data source in NEXUS — gaps, events, sigma trajectory,
      blueprint divergences, Versionium commits, lab sessions, CFR field shape —
      and returning a coherent, ranked picture. Not a new database. Not new
      storage. A read layer over existing JAA tables that nothing currently
      reads together.

      Without this: co-pilot gets 8 chat_log entries. The living changelog,
      bug tracker, roadmap, and diagnostic menu are all separate, manually
      consulted systems. Nothing reads them together.

      With this: every co-pilot response starts with a real picture of what
      the system knows about what's being discussed.

  route:
    path:    GET /api/cortex/query
    params:
      about:   string — keyword or system name (e.g. 'guardian', 'chatgpt', 'sigma')
      window:  ms     — how far back to look (default 3600000 = 1 hour)
      depth:   number — how many causal hops to follow (default 2)
    response: QueryResult

  QueryResult:
    shape:
      about:       the resolved subject (system name, component, or keyword)
      gaps:        open Gap[] matching the subject — from gap-predicate's JAA table
      sigma:       SigmaTrajectory — last N sigma_records for this subject (rising/falling/stable)
      field:       CFRFieldShape — coherence/friction/resonance/entropy for relationships
                   involving this subject, from lib/cfr/field.js snapshot
      events:      recent Event[] from event_log, ranked by causal relevance to subject
      blueprint:   BlueprintDivergence[] — what the system says it does vs what it does
      commits:     VersioniumCommit[] — recent commits touching this subject
      labs:        LabSession[] — experiments run against this subject and what they found
      narrative:   string — synthesized by intelligence engine (mastermind) from the above
      ts:          timestamp of this query result

  keyword_resolution:
    problem: >
      "guardian" is a system name. "chatgpt" might be a provider name, a gap tag,
      or an event source. "sigma" might mean the metric or a specific gap type.
      The query surface needs to resolve keywords to the correct table columns
      without requiring the caller to know the schema.
    approach: >
      Two-pass resolution:
      1. Exact match — check system registry, component registry, gap types,
         event source fields. Return all matches.
      2. Fuzzy match via intelligence engine's intuition() — classify the
         keyword as one of: system | component | gap_type | event_type | person |
         concept. Route to the correct JAA column for each match type.
      The keyword-to-tag mapping is the intelligence engine doing what it already
      does (§M4 in NEXUS-SELF.spec), applied to schema navigation instead of
      provider routing. No new model needed — same Qwen path, different prompt.

  narrative_synthesis:
    source:  intelligence engine → mastermind()
    input:   the QueryResult struct above (all fields populated before narrative)
    output:  3-5 sentence human-readable summary of what's happening and why
    example: >
      "guardian's sigma has been rising for 3 hours (0.2 → 0.6). The NCP
      channel for chatgpt has disconnected 14 times in that window — the
      event_log shows §FLAPPING entries starting at 18:34. Two gaps are open:
      ncp_connection_flapping (HIGH, 6h) and guardian_job_timeout (MEDIUM, 2h).
      The last Versionium commit touching guardian/server.js was 4 days ago.
      No lab sessions have been run against this system."
    constraint: >
      Narrative is explicitly labelled as synthesized, not authoritative.
      §1.3 applies — it must not claim certainty about things it inferred.

  integration_points:
    co_pilot: >
      Called automatically before every co-pilot response when the conversation
      mentions a system name, component, gap type, or keyword matching the
      registry. Co-pilot prepends the QueryResult to its context window. The
      8-entry chat_log fetch doesn't go away — both run. QueryResult adds
      system state; chat_log adds conversation continuity.
    living_changelog: >
      GET /api/cortex/query?about=changelog&window=86400000 returns the last
      24h of gap.closed + versionium.commit events as a structured changelog.
      No separate changelog system needed — it's a filtered view of this.
    bug_tracker: >
      GET /api/cortex/query?about=X returns open gaps for X as the bug list.
      A gap IS a bug with a predicate, an owner, a sigma contribution, and
      a closure verifier. The bug tracker is this query filtered to gap.status=open.
    diagnostic_menu: >
      GET /api/cortex/query?about=system returns the full health picture for
      that system. The diagnostic menu is this query for each of the 10 sovereign
      systems, displayed together.

  build_order:
    - "1. Implement the route in cortex/boot.js — reads from JAA directly"
    - "2. Keyword resolution — extend intelligence engine's intuition() with a
         schema-routing prompt variant"
    - "3. Narrative synthesis — call mastermind() with the populated QueryResult"
    - "4. Wire into co-pilot context assembly — query runs before every response"
    - "5. Expose as living changelog / bug tracker / diagnostic menu views in
         the UI — different CSS filters on the same JSON"
