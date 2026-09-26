spec:
  meta:
    name:        nexus-relationship-shape
    version:     0.2.0  # extends v0.1 — adds the associative lattice
    status:      proposed
    uuid:        nexus-relationship-shape-v1-0000-2026-0701-jamesbrooks-001
    axioms:      [§5.7, §2.3, §12.6]
    depends_on:  [lib/cfr/field.js, lib/cfr/graph.js, lib/cfr/sigma.js,
                  unintegrated/rfr2-nexus/delta, unintegrated/rfr2-nexus/observer,
                  nexus-query-surface]
    purpose: >
      CFR (Coherence-Friction-Resonance-Entropy) and RFR2 together define the
      shape of any interaction — not just NEXUS internal system relationships,
      but any two things that interact: systems, people, ideas, sessions.

      This spec answers: what does it mean for a relationship to have a shape,
      what can you read from that shape, and what the query surface exposes
      when asked about a relationship rather than a single system.

  what_a_shape_is:
    cfr_field: >
      The CFR field is a four-dimensional snapshot of a relationship's
      current state:
        coherence:  how aligned the two sides are right now (0=chaos, 1=perfect alignment)
        friction:   how much resistance exists in the interaction (0=frictionless, 1=blocked)
        resonance:  how much the two sides amplify each other (0=dampening, 1=full resonance)
        entropy:    how much disorder is accumulating in the interaction (0=stable, 1=degrading)
      These four numbers ARE the shape. A relationship with high coherence and
      low friction looks different from one with low coherence and high resonance.
      Both are "working" — they work differently.

    sigma: >
      Sigma is the scalar derived from the CFR field — how stressed the shape is
      overall. It's not a separate concept; it's the field compressed to one
      number for threshold comparison. Sigma > 0.5 = stressed shape.
      Sigma > 0.7 = autonomous loop halts. The shape is the cause; sigma is
      the measurement.

    rfr2_delta: >
      RFR2's delta module measures change in the shape over time. computeEventDelta()
      compares two field snapshots and returns what moved and by how much.
      compressToL1() extracts the dominant change signal. detectFractals() finds
      repeating patterns in the delta history — the same shape change happening
      repeatedly is a structural issue, not a random fluctuation.
      RFR2 doesn't judge the shape (that's sigma's job) — it measures its history.

    causal_graph: >
      lib/cfr/graph.js tracks which events caused which changes in the field.
      ancestors() and descendants() walk the causal chain. A shape change that
      has no clear ancestors in the graph is genuinely novel. A shape change
      that has many ancestors is a known pattern — the same causal chain firing again.

  what_you_can_read_from_a_shape:
    is_this_working: >
      Not "is this running" (that's health checks) but "is this relationship
      producing what it's supposed to?" A guardian→cortex relationship with
      coherence 0.8 and friction 0.1 is working well. The same relationship
      with coherence 0.3 and friction 0.7 is technically running but producing
      a stressed output. Sigma tells you the number; the field tells you why.

    is_this_changing: >
      RFR2's delta over the last N field snapshots shows whether the shape
      is improving (coherence rising), degrading (entropy rising), or stable.
      A shape that's been drifting toward high friction for 3 hours is a
      different situation from a shape that spiked and recovered in 10 minutes.
      The trajectory matters, not just the current reading.

    what_caused_this: >
      The causal graph's ancestors() walk backward from a shape change to the
      event that started it. "Guardian's friction spiked at 18:34" → ancestors()
      returns the NCP disconnect event at 18:33 → whose parent is the chatgpt
      tab reload at 18:32 → whose parent is the Cloudflare interstitial at 18:31.
      That's not a guardian bug. That's a browser event that propagated through
      three systems before expressing as a sigma reading.

    is_this_a_pattern: >
      detectFractals() in RFR2's delta module finds repeated sequences in the
      shape's history. "Guardian's friction spikes every ~45 minutes for ~3 minutes
      then recovers" is a fractal pattern — something on a 45-minute cycle is
      causing it. Without fractal detection, each spike looks novel. With it,
      they're one structural issue with a period.

    what_is_the_relationship_between_two_things: >
      Any two queryable entities can have their shared field shape computed:
      guardian↔cortex, copilot↔ollama, user↔system (via co-pilot's
      conditioning_log), idea↔spec (via idearium + Versionium). The query
      surface returns this as `field: CFRFieldShape` when two subjects are
      compared. The shape is the answer to "how are these two things doing?"

  people_and_ideas_as_subjects:
    motivation: >
      RFR2 is agnostic of domain. The interaction space it measures doesn't
      have to be two software systems. It can be:
        user ↔ system: the conditioning_log is the delta record. Co-pilot's
          response quality over time defines coherence. User frustration events
          (repeated rephrasing, "that's wrong" signals) define friction.
        idea ↔ spec: how well a spec captures the idea's intent. Divergence
          between the idea's `tensioned` state and the spec's scope is friction.
        session ↔ baseline: how different this session's interactions are from
          the established baseline (event-ledger's learned norms). High delta
          = novel session. Low delta = routine.
    constraint: >
      People are never reduced to a sigma score. The conditioning_log tracks
      what co-pilot learned about the *interaction*, not a model of the person.
      §1.3 applies strongly here: the system knows what happened in interactions,
      not what the person is like. These are different things and must be stored
      differently.

  query_surface_integration:
    when_subject_is_a_relationship: >
      GET /api/cortex/query?about=guardian+cortex (two subjects)
      → query surface computes field shape for that pair:
          { from: 'guardian', to: 'cortex',
            field: { coherence: 0.4, friction: 0.6, resonance: 0.3, entropy: 0.5 },
            sigma: 0.58,
            regime: 'stressed',
            trajectory: 'degrading',  # rising friction over last 3h
            causal_root: { event_id: '...', type: 'ncp.disconnect', ts: ... },
            fractal: { detected: true, period_ms: 2700000, occurrences: 4 },
            narrative: "..." }

    when_subject_is_a_single_system: >
      The field shape is computed for every *relationship* that system participates
      in, ranked by sigma. The highest-sigma relationship is the one to look at
      first. The query surface returns all of them, ranked, so the diagnostic view
      shows not just "guardian is stressed" but "guardian's relationship with cortex
      is the source — coherence dropped 0.4 points in the last hour."

  build_order:
    - "1. nexus-query-surface (prerequisite — exposes field shape in QueryResult)"
    - "2. Relationship query support — extend query surface to accept two subjects"
    - "3. Wire RFR2's computeEventDelta() to cfr/field.js snapshots — diff between
         consecutive field states for a given relationship"
    - "4. detectFractals() integration — run over the last N delta records for
         each relationship, surface in the query result"
    - "5. Causal root tracing — ancestors() walk from a field change to the
         originating event, surface in the query result"
    - "6. People/session shape tracking — conditioning_log as RFR2 delta source
         for user↔system relationship shape"

  # ─── v0.2 addition — 2026-07-02 ──────────────────────────────────────────
  # Everything above answers "what is the shape between A and B, when asked."
  # This section answers a different question: what does NEXUS know about
  # its own shape before anyone asks anything. The distinction matters —
  # v0.1 is query-triggered and pairwise. This is standing and system-wide.

  associative_lattice:
    what_it_is: >
      A persistent graph, not a query result. Nodes are systems (and,
      per the people/session tracking above, users and sessions). Edges are
      relationship shapes — the same four CFR numbers v0.1 computes on
      demand, except computed for *every* pair continuously and held as
      state, not recomputed fresh each time someone asks. The lattice is
      the thing that exists whether or not anyone is looking at it.
    why_pairwise_on_demand_isnt_enough: >
      v0.1 can tell you the shape between guardian and cortex if you ask
      about guardian and cortex. It cannot tell you that guardian and
      eravos — a pair nobody has ever queried together — both spiked
      friction at the same three moments this week. That fact only exists
      if something is comparing edges *across* the whole graph, not
      answering one named pair at a time. A lattice with only on-demand
      edges isn't a lattice, it's a lookup table with extra steps.

    storage:
      table: relationship_lattice   # new JAA table
      row: >
        { from, to, field: {coherence, friction, resonance, entropy},
          sigma, regime, updated_at, fractal: {detected, period_ms, occurrences} }
      write_path: >
        Same write-through pattern every other durable system in NEXUS
        uses (lib/cortex-write.js) — not a new persistence mechanism.
      update_trigger: >
        Not polled on a fixed interval by default — that scales badly as
        system count grows (N² pairs). Recomputed when either side of a
        pair emits an event that already touches cfr/field.js (i.e.
        piggybacks on work the system is already doing per v0.1 step 3),
        plus a slow background sweep (default 10 min) to catch pairs that
        interact rarely enough that event-triggered updates alone would
        leave them stale.

    traversal_surface:
      description: >
        What co-pilot (or the query surface, or a human) can actually do
        with a standing lattice that a pairwise query can't offer:
      rank_by_sigma: >
        "Show me the most stressed relationships right now" — a sort over
        the lattice, not a question that requires already knowing which
        pair to ask about.
      find_unexpected_correlations: >
        Two edges whose sigma trajectories move together in time, with no
        shared causal ancestor in cfr/graph.js — a correlation the causal
        chain doesn't explain. This is the "connections form" property:
        surfaced without either system being named in the same query.
      walk_from: >
        "What's connected to guardian that I haven't looked at" — one-hop
        and two-hop traversal from a named node, ranked by edge sigma.
        This is the associative browsing motion — follow the graph, not
        the query history.
      dwell_and_decay: >
        Edges that haven't updated in a long time (no shared events)
        fade in traversal ranking rather than being deleted — an inactive
        relationship is still real history, just less relevant to surface
        first. Mirrors ALK-GL's own shadow-is-render-weight-not-data-
        presence invariant (nexus-nerve.spec P1-04) — same principle,
        applied to the lattice instead of the particle field.

    what_ifs_on_the_lattice: >
      This is where COS's N-way forking and RAID's simulate(dry_run) —
      both already speced elsewhere, neither rebuilt here — compose with
      the lattice instead of a single dispatch decision:
        1. Pick an edge (or a hypothetical new one — a pair that's never
           interacted) as the subject of a what-if.
        2. COS BranchEngine.fork() the relevant compartments N times, one
           per candidate scenario ("route cluster X to chatgpt instead of
           ollama," "what if guardian's NCP reconnect backoff were
           disabled").
        3. Each branch runs through RAID simulation's simulate(dry_run:
           true) — real delta/sigma/enforcement scoring, zero live effect.
        4. The lattice records the simulated edge shape *separately* from
           the live one (same separation Versionium/Vault already use for
           simulation history vs event_log) — so a what-if never pollutes
           the real graph, but its result is still queryable: "what did
           we predict would happen if."
      Nothing new to build for this step — it's the branching-decision-
      loop spec's N-way fork orchestrator and the RAID simulation engine,
      pointed at lattice edges instead of a single RAID decision.

    proactive_surfacing: >
      Co-pilot reading the lattice before responding (already the query
      surface's job per v0.1) extends naturally: instead of only
      answering about the subject asked, it can note — briefly, not as a
      digression — when an unrelated high-sigma edge exists nearby in the
      graph. This is deliberately bounded: surfacing is opt-in per
      conversation context, not a constant stream of unsolicited
      observations. The optimization service's morning briefing
      (nexus-optimization-service.spec) is the right home for the
      "here's everything interesting since last time" digest — the
      lattice just gives that briefing a real graph to draw from instead
      of a flat list of systems.

    build_order_v0_2:
      - "7. relationship_lattice JAA table + write-through via lib/cortex-write.js"
      - "8. Event-triggered recompute — piggyback on v0.1 step 3's field-diff work"
      - "9. Background sweep for low-traffic pairs (default 10 min interval)"
      - "10. Traversal API on the query surface: rank_by_sigma, walk_from(node, hops),
            find_unexpected_correlations(window)"
      - "11. What-if composition — wire COS N-way fork + RAID simulate(dry_run)
            to write simulated edges to relationship_lattice, tagged simulated:true"
      - "12. Dwell/decay ranking — inactive edges fade in traversal, never deleted"
      - "13. Optimization service hook — morning briefing reads top-N lattice
            edges by sigma instead of a flat per-system list"

  changelog:
    v0.2 — 2026-07-02: >
      Added the associative lattice — a standing, continuously-updated
      graph over all system pairs (and eventually people/sessions), not
      just the on-demand pairwise query v0.1 defined. Reuses every
      existing primitive (CFR field, RFR2 delta/fractals, cfr/graph.js
      causal chain, COS N-way forking from the branching-decision-loop
      spec, RAID simulation's dry_run) — nothing here is a new engine,
      it's the first thing that holds their combined output as state
      instead of recomputing it fresh per question.
