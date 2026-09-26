spec:

  # ════════════════════════════════════════════════════════════════════════════
  # seam-component-registry.spec
  # NEXUS Seam & Component Registry — the self-describing identity kernel
  #
  # A queryable system for identifying, classifying, and tracing every
  # component across the NEXUS ecosystem. v1.1 — supersedes v1.0 entirely.
  # No addendum, no diff against v1.0 — this file is the whole spec.
  #
  # §1.1  Nothing exists until proven — comp_type is earned, not declared
  # §1.2  Nothing pretends to work, nothing silently fails
  # §2.1  Persistence is the golden rule
  # §3.1  Bottom-up only — gates on Phase 40 (Component Descriptor)
  # §5.4  Version bumped per real change — 1.0 → 1.1, this session
  # ════════════════════════════════════════════════════════════════════════════

  meta:
    name:        seam-component-registry
    version:     1.1.0
    author:      james-brooks
    created_at:  2026-06-20T00:00:00Z
    status:      active
    uuid:        nexus-seam-component-registry-v1-0000-2026-0615-jamesbrooks-001
    foundation:  nexus-system-foundation@1.0.0
    purpose: >
      Every component (kernel, engine, runtime, or file) has a stable
      traceable identity (comp_id), a provable role (comp_type, earned not
      declared), a mappable execution boundary (compartment), and a
      self-describing schema generated on registration. The whole system
      is mappable, queryable, and auditable from the ledger alone.
    blocked_on: >
      Phase 40 (Component Descriptor). Every section of this spec —
      identity, compartments, role validation, RAID consumption, the
      cache that watches it — independently converges on Phase 40 as the
      load-bearing foundation. Confirmed across five unrelated build
      threads in one session, not assumed.

  # ── §1 Identity model — three axes ────────────────────────────────────────

  identity_axes:
    intent:     "why the component exists — fixed at registration"
    comp_type:  "what role it structurally plays — revalidated continuously"
    event_type: "what actually happened — emitted per event"

  axioms:
    - id: AX-1
      title: Constraints and intent define role
      description: >
        comp_type is never self-declared truth. It is a hypothesis,
        proven or disproven by whether observed event behavior satisfies
        the constraints and intent bound to that type.
    - id: AX-2
      title: Role is revalidated, not assumed
      description: >
        Registration produces a provisional comp_type. The ledger
        continuously checks live event output against the role's
        contract. Status decays confirmed → drifting → violated based on
        accumulated evidence, not any single event.
    - id: AX-3
      title: No silent inheritance
      description: >
        A component spanning multiple roles must declare which
        role/intent pair governs each event at emit time. Roles are never
        inferred from file location or prior emit history.
    - id: AX-4
      title: Registry is static truth; ledger is observed truth
      description: >
        The registry never gets written to by runtime behavior. Drift,
        violations, and confidence scores live in a separate, mutable
        layer that references the registry — they never mutate it.
    - id: AX-6
      title: Human mutations are first-class events, not behavioral evidence
      description: >
        Registry records may only be modified through explicit mutation
        channels (CLI, API, migration) — never directly, never silently.
        Human-issued mutations are categorically distinct from runtime
        behavior and must never count as evidence during role
        validation (AX-2). Implemented in full — see §9 mutation_contract.

  # ── §2 Components — multiple roles, independently earned ─────────────────

  multi_role:
    resolved: true
    description: >
      A component can hold multiple roles simultaneously. comp_types is
      plural — matches the live component-registry.js schema
      (comp_types: []), which was already correct, ahead of this spec.
      Each role is earned independently per AX-1; holding one role never
      grants another. Role validation state is keyed (comp_id, comp_type),
      not comp_id alone — one component can be confirmed on role A and
      drifting on role B at once, tracked as separate records. An event
      only counts as drift-evidence against a role if it doesn't fit that
      role's contract. An event off-contract for role A but on-contract
      for role B is not drift for A — it's the component legitimately
      operating in its B capacity. System-wide violation = an event that
      fits the contract of NO currently-confirmed role.

  # ── §3 Registry record ────────────────────────────────────────────────────

  registry_record:
    schema: |
      comp_id: uuid-v4
      comp_name: Orchestrator
      core_kind: kernel | engine | runtime
      shortid: nx-orc-7f3a          # deterministically derived from comp_id
      version: semver
      registered_at: ISO8601
      owner_module: NEXUS | RavenOS | Coreglass | ...
      comp_types:
        - type: ingress
          files: [path/a.js]
          intent: receive_and_normalize_input
      status: active | deprecated | sandboxed

    ancestry_runtime_dependency_graphs:
      description: >
        Four separate graphs sharing comp_id as a common node key — kept
        structurally separate, never conflated (§3.1 trace traversal
        ambiguity otherwise):
      fields:
        comp_spawned_by:    "tree, no cycles — who instantiated this, this run"
        comp_lineage:       "tree, no cycles — origin/relation/generation, what this was built from"
        comp_dependencies:  "graph, cycles possible and sometimes legitimate — functional reliance, NOT ancestry"
      cycle_handling:
        ancestry_spawn:    "registration-time hard stop"
        dependency:        "detected and flagged for review, not auto-rejected"

  role_definitions:
    schema_rule: >
      DENY-ONLY. A role is defined entirely by what it forbids
      (forbidden_event_types) plus its required intent class
      (requires_intent_class). There is no maintained allowed_event_types
      field — the legal event space is the computed residual of
      everything not forbidden. Original v1.0 listed both allow and deny
      lists for the same role; this drifts silently (two sources of truth
      for one boundary) and is corrected here. Same pattern as the
      already-shipped mutation_contract (§9) — FORBIDDEN_TOP is a fixed
      list, comp_properties.* is open by default as the residual. This
      section now follows that pattern consistently instead of mixing
      allow-list and deny-list semantics.
    example: |
      role_definitions:
        ingress:
          requires_intent_class: receive_or_normalize
          forbidden_event_types: []   # nothing yet excludes ingress from anything
        handler:
          requires_intent_class: process_or_route
          forbidden_event_types: [message_received]   # that's ingress's job
    earning_rule: >
      A component only earns a comp_type if its emitted events stay
      outside the forbidden set and its intent matches the required
      intent class.

  # ── §4 Compartment layer (runtime partitioning — renamed from "seam") ─────

  naming_note: >
    This concept was originally called "seam" in v1.0. Renamed to
    "compartment" — docs/seam.spec already and separately owns "seam" for
    the live SEAM chunking/dispatch pipeline (T0/T1/T2 spec-to-code
    compilation). Same word, two unrelated concepts, would have collided
    in every future log line and grep. Resolved by rename, not merge.
    "Invariant" and "crystallized" are similarly unavailable for new
    vocabulary in this spec — both are precisely defined and live
    elsewhere (AXIOMS-v1.0's immutable laws; cortex/intelligence's
    crystal-lattice module, pattern threshold 3). Lifecycle terms below
    stay plain: ephemeral / versioned.

  compartment:
    schema: |
      compartment_id: comp-91a2f
      comp_id: uuid
      comp_type: handler
      intent: process_and_route_signal
      context_id: ctx-7f2a9       # the broader flow/session this compartment belongs to
      parent_context: ctx-root | null
      state:
        yarn: 0.73        # coherence / continuity of execution
        tension: 0.41      # constraint pressure (validation, mismatch)
        friction: 0.22     # execution resistance (errors, retries)
      active: true

    lifecycle:
      resolved: true
      rule: >
        Lifecycle is a property of role_definitions, not a global setting
        and not a per-instance choice. Declared once per comp_type;
        every compartment spawned under that type inherits it.
      example: |
        role_definitions:
          raid_decision:  { lifecycle: ephemeral }
          spec_artifact:  { lifecycle: versioned }
      ephemeral: >
        Transient/runtime roles (RAID routing decisions, request-handler
        dispatch). Exists for one run, snapshots to a single ledger event
        on resolve, live record destroyed.
      versioned: >
        Persistent artifacts (ideas, specs, repo state) — anything Phase
        30 (time-travel debugging) or §7.6 ("codebase is a materialized
        view of the Upgrade Ledger") needs to reconstruct from. seam_id
        increments, immutable chain retained.
      open_subquestion: >
        Cross-lifecycle boundary case — an ephemeral compartment (e.g. a
        RAID decision) that causes a versioned artifact (e.g. a spec
        mutation). The causal link must survive the ephemeral
        compartment's death. Candidate: comp_lineage.origin or
        comp_dependencies doing double duty as a cross-lifecycle pointer
        — needs an explicit decision before build, not a default, per the
        §3.1 warning against conflating the three graphs.

    container_mode: >
      A compartment opens like a container for the duration of an active
      session (Idearium's project-repo opening a project-level .spec the
      way NEX-VM/Phase 27 opens a system snapshot). While open, edits are
      tracked as sigma deltas only — byte-size check first, hash only if
      size changed, sigma derived from diff magnitude — not a full
      compressed diff per edit. The full diff (Phase 32's per-file
      versioning mechanism) is captured once, on close, when the
      container recompresses. See docs/idearium.spec (project-repo
      module) and docs/snapshot.spec for the implementation side of this.

  # ── §5 Ledger event (JSONL, append-only) ──────────────────────────────────

  ledger_event:
    format: jsonl
    rationale: "YAML parse cost is fine for an occasionally-edited registry; wrong for an append-only production-volume stream."
    schema: |
      {
        "comp_id": "uuid", "comp_type": "handler", "shortid": "nx-orc-7f3a",
        "intent": "process_and_route_signal", "event_type": "route_resolved",
        "compartment_id": "comp-91a2f", "context_id": "ctx-7f2a9",
        "timestamp": "ISO8601", "payload_ref": "uuid|null"
      }

  # ── §6 Role validation state (mutable, separate from registry) ───────────

  role_validation:
    keying: "(comp_id, comp_type) — not comp_id alone. See §2 multi_role."
    schema: |
      comp_id: uuid
      comp_type: handler
      role_confidence: 0.94
      status: confirmed | drifting | violated
      drift_score: 0.06
      violations:
        - event_type: message_received
          timestamp: ISO8601
          expected_role: ingress

    thresholds:
      resolved: partial
      precedent: >
        Reuses divergence-watcher's existing values (σ ≥0.65 first alert,
        +0.20 spike exception, 90s cooldown) per §5.6 structural
        self-similarity, rather than inventing new numbers.
      rule: |
        confirmed → drifting:  role_confidence < 0.65
        drifting  → violated:  role_confidence < 0.35  OR  3+ off-contract
                                events in a short window (spike exception)
        violated cooldown:     90s, mirrors divergence-watcher
      open: >
        Window should be event-count-based (last N events), not
        wall-clock — role-drift is per-component, and a clock window
        would unfairly penalize chatty components. Deliberate divergence
        from the divergence-watcher precedent. N and the two threshold
        values need tuning against real event volume once this runs —
        config-driven now, tune later.

    reaction_to_violated:
      status: proposed_not_reconfirmed
      starting_point: "Guardian flags for manual review. Not contested this session — just not yet explicitly re-locked."
      escalation_path:
        - "1. Guardian flags for manual review — start here"
        - "2. Auto-healer attempts reclassification from accumulated event history"
        - "3. Hard fail — component sandboxed until manually corrected"

  # ── §7 Dynamic grammar engine ──────────────────────────────────────────────

  grammar_engine:
    flow: >
      new component declared → grammar engine infers comp_type candidates
      from declared intent → matches intent against role_definitions →
      match found: generates registry entry + role contract automatically
      → no match: hard stop, prompts for new role_definition (AX-3) →
      schema written to registry, sealed.
    v1_scope: >
      Deterministic keyword/class matching against role_definitions only.
      Embedding-based / semantic-similarity matching explicitly out of
      scope until sigma/delta infrastructure exists elsewhere in the
      system — don't build the same pipeline twice in two places.
    human_in_loop: "Generated YAML registry block requires human confirmation before sealing — not autonomous."

  # ── §8 Query surface ───────────────────────────────────────────────────────

  query_surface:
    keys: [comp_id, comp_type, shortid, status]
    guarantee: >
      Any compartment, any role violation, any component's full event
      history is reconstructable from these three keys alone, without
      reading source files.

  # ── §9 Mutation contract (governance layer, already built) ───────────────

  mutation_contract:
    status: shipped
    location: lib/mutation-contract.js
    description: >
      Built, correct, audit-first (ledger event written before the
      property mutation, with explicit handling for audit-succeeds-but-
      apply-fails). Already maps this spec's wire vocabulary
      (comp_id, comp_type, comp_properties) onto the live registry's
      actual field names (id, comp_types[].type, properties) in one
      place, documented in the module's own header, rather than renaming
      the live schema and breaking every existing caller (§5.3 — no
      monkey patches).
    schema: |
      mutation_contract:
        source: cli | api | migration
        requires_audit: true
        emits_event: true
        forbidden_targets: [comp_id, comp_type, comp_lineage, comp_intent]
        allowed_targets: [comp_properties.*]
    remaining_work: "CLI surface only — nexus get/set/lock/history comp_id.comp_properties.* — conceptual in v1.0, not yet wired."

  # ── §10 RAID consumption — fitness, dispatch, generic capability ─────────

  raid_consumption:
    description: >
      How RAID (cortex/core/raid) consumes this registry to make dispatch
      decisions. Full detail lives in docs/raid.spec and
      docs/raid-snr-filter.spec (canonical homes, updated this session) —
      this section only states the dependency.
    fitness_formula: >
      fitness = SNR_tier_gate(task) → role_confidence(component,role)
              × health(component) × topological_proximity(component)
      Requires CFR's _byComponent edge (docs/cfr.spec, new this session)
      for the topological term — hard dependency, not yet built.
    constraint_then_fitness: >
      Dispatch candidates are filtered by deny-only constraints first
      (offline, consecutiveFails over threshold, role status=violated,
      forbidden_event_types violation), then ranked by fitness among
      survivors only. Replaces RAID's previously hardcoded CLUSTER_CHAINS
      preference array — see docs/raid.spec.
    snr_as_capability: >
      The tiered-resolution shape in the SNR filter (known-fact → pattern
      → partial-context → unresolved) generalizes into a capability
      descriptor under Phase 40, with per-consumer pluggable tier checks
      — decision engine, load balancer, priority engine, gating system,
      security system each register against one shared primitive. First
      proof-of-concept: docs/spec-drift.spec's metadata cache, updated
      this session to use the same four-tier shape.

  # ── §12 Provenance — your own words, not my paraphrase ───────────────────

  session_statements:
    - decision: AX-1 / multi_role
      said: "basically each module is like cognitive tools. like cognitive functions. introverted intuition -> sythesizing invariants. extroverted intuition -> what ifs and if thens. not good or bad and versitile. raid chooses the best tool for the job like neuroplasticity"
    - decision: role_definitions deny-only
      said: "it's just that each system isn't defined by what it is, but what isn't. You have to define what isn't and work within that field"
    - decision: raid_consumption constraint_then_fitness
      said: "so basically the raid engine is looking for what not to do, defining into constraints and failure modes"
    - decision: compartment.container_mode
      said: "event driven, from file hashing or byte size changes? so idearium repository system reads the .spec file to open it like a container, and snapshots and versions sigma only, then compresses it back down"
    - decision: snr_as_capability scope
      said: "the signal to noise can be a million things, decision making engine, load balancer, priority engine, gating system, security system, that's another thing I mean about dynamic use cases. that's why i want everything to come from within nexus before it gets built. adaptive depending on the intent/end-state."
    - decision: compartment.lifecycle (ephemeral vs versioned, per comp_type not global)
      said: "i feel like that's too deterministic and ignoring use cases... like permanence is versioned and tracked within the system using the event ledgers... each idea, spec, repo, needs context, causality and components tracked within the system while being built, while tracking the systems aswell, like on a meta lever"
    - decision: this file's own existence — one whole file, not addenda
      said: "i said no addendums. why fragment everything? why pieces, either whole and integrated"

  # ── §11 Still open ─────────────────────────────────────────────────────────

  still_open:
    - id: cycle-review
      description: "Dependency-cycle detection mechanism — what flags it, who reviews it (§3 ancestry_runtime_dependency_graphs)."
    - id: audit-config
      description: "requires_audit/emits_event hardcoded vs configurable per comp_properties domain — shipped hardcoded true; revisit only if a real per-domain need appears."
    - id: first-property-domain
      description: "First comp_properties domain to actually build beyond what mutation-contract.js already supports generically (style, ui, thresholds — pick one)."
    - id: violated-reaction-lock
      description: "§6 reaction_to_violated proposes Guardian manual-review as the start; needs explicit re-confirm, not just absence of objection."
