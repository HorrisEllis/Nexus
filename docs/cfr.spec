spec:
  meta:
    name:        cfr
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-cfr-v1-0000-2026-0620-jamesbrooks-001
    status:      missing_until_now
    purpose: >
      Causal field/graph. Derives relationship edges passively from
      whatever fields exist on an ingested ledger entry — no separate
      tracking system, edges fall out of events that are already being
      written. Previously unspecced (spec-drift's own "no spec" list) —
      this is the first .spec for it, not a v2 of something that existed.

  graph_edges:
    existing: [_bySession, _byJob, _bySystem, _byType]
    ring_buffer: true
    planned: "_byComponent — once componentId flows through every ledger event (Phase 40.6). Zero new CFR API surface, same ring-buffer pattern, fifth edge type, automatic."
    rejected_proposal: >
      An external proposal to invent new phaseId/traceId fields was
      rejected — CFR's existing causedBy/sessionId/jobId already solve
      that. Don't build the same pipeline twice in two places.

  ring_buffer_sizing:
    bug_found: >
      lib/cfr/graph.js hardcodes _bySystem to the last 100 entries and
      _byType to the last 50 — identical cap for every system regardless
      of actual causal depth needed. A high-traffic causal hub (e.g.
      guardian's NCP churn) needs more retained history for tier-4
      context-walks (docs/raid-snr-filter.spec) to find anything useful
      than a quiet system does. One flat number either wastes memory or
      truncates context too early — not the same cost in both directions.
    fix_per_system_config: |
      cfr:
        ringDefaults: { bySystem: 100, byType: 50 }
        ringOverrides:
          guardian:  { bySystem: 250 }
          raid:      { bySystem: 150 }
          idearium:  { bySystem: 60  }
    fix_self_tuning: >
      New ledger event cfr.context_truncated fires when a tier-4
      context-walk (docs/raid-snr-filter.spec v1.1 fix) hits an
      already-evicted node. Truncation-rate per system per window becomes
      the resize trigger — same structural pattern as RAID's existing
      _updateW weight-learning (tunable numeric state learning from
      observed outcomes, not an identity mutation, so AX-2 in
      seam-component-registry.spec doesn't block automatic adjustment).
    truncation_log_cost: >
      If truncation-event writes exceed ~5-10% of a system's normal
      event_log volume in a window (number TBD against real data), that's
      the system telling you its ring is undersized — the fix is
      resizing the ring, not suppressing the truncation log that's
      diagnosing the problem.

  consumers:
    raid_fitness: "docs/raid.spec — topological_proximity term in the dispatch fitness formula. Hard dependency, not yet built."
    snr_filter: "docs/raid-snr-filter.spec — tier-4 context-walk reads causedBy/sessionId/jobId chains from here."

  still_open:
    - id: cfr-volume-thresholds
      description: "Exact truncation-log-cost ratio (5-10% placeholder) and per-system ring overrides for systems other than guardian/raid/idearium need tuning against real event volume once this runs."

---
## ADDENDUM 2026-07-30 — RAID verification spine P4 (docs/raid-warp-verification-phasemap.spec)
meta/cfr/sigma now has a NEW CONSUMER: RAID's verifyInIsolation (P4) calls computeSigma(event, baseline, cfrState) to score each isolated consequential run's divergence. A score ≥ 0.7 flags the run as drifted — a SOFT signal (§17.10 weight 0.3), non-blocking on its own. The score persists to cortex's raid_decisions.meta for audit (§17.6).
