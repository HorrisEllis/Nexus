spec:
  meta:
    name:        gap-lifecycle
    version:     1.0.0
    uuid:        nexus-gap-lifecycle-v1-0000-2026-0622-jamesbrooks-001
    phase:       23.7
    status:      draft
    author:      James Brooks (Erosmancer)
    foundation:  nexus-system-foundation@1.0.0
    depends_on:
      - open-loop-taxonomy@1.0.0      # loop types and closure mechanisms
      - jaa-db@current                # persistence layer
      - reflection.js@1.0.0          # scoring and contract queue
      - raid/index.js@current        # routing
      - cortex/intelligence/index.js # pattern engine
    supersedes:  phase-23.6          # dedup + auto-resolve (good start, insufficient)
    unlocks:
      - phase-11  # reflection engine — needs real closure to score against
      - phase-13  # autonomous loop — needs trustworthy gap state to act on
      - phase-29  # topology view — needs structural gap state to render
      - phase-34  # API surface failure diagnosis

  purpose: >
    A gap is an open loop. It stays open until the system produces a tangible
    artifact that provably makes the gap predicate false. Not a signal that
    work happened. Not a job completion. Not a timeout. An artifact.

    This spec defines:
      1. What a gap must declare at creation time
      2. What counts as a valid artifact for each gap type
      3. How closure is verified (not assumed)
      4. What happens when closure fails
      5. How the system prevents gap rehydration (same problem, new UUID)

  core_principle: >
    A gap closes when and only when:
      the predicate that made the gap true becomes false
      AND a concrete artifact exists as the evidence.

    "A job finished" is not closure.
    "A model responded" is not closure.
    "A timeout fired" is not closure.
    An artifact is closure.

  # ─────────────────────────────────────────────────────────────────────────────
  # SECTION 1 — Gap schema (extends existing open-loop-taxonomy fields)
  # ─────────────────────────────────────────────────────────────────────────────

  schema:
    extends: open-loop-taxonomy.createLoop()
    new_required_fields:

      predicate:
        type:        object
        description: >
          The condition that makes this gap true, expressed as a checkable
          query against JAA state. Must be evaluable without human input.
          The closure verifier calls predicate.check() — if it returns false,
          the gap is resolved. If it returns true, the gap is still open.
        shape:
          table:     string        # JAA table to query
          field:     string        # field to check
          op:        enum          # exists | not_exists | equals | not_equals | gt | lt | contains
          value:     any           # expected value (null for exists/not_exists)
          scope:     string|null   # UUID or key to scope the query (e.g. queue UUID for seam gaps)
        examples:
          seam_orphan_resume: >
            { table: 'seam_records', field: 'queue_uuid', op: 'exists', value: null, scope: '83036522' }
            # gap is open while this queue UUID has no seam_record
            # gap closes when the seam_record exists
          obligation: >
            { table: 'agent_calls', field: 'status', op: 'not_equals', value: 'pending', scope: <call_uuid> }
            # gap is open while the agent call is pending
            # gap closes when the call is dispatched, complete, or failed
          cluster_misfire: >
            { table: 'bep_patterns', field: 'cluster', op: 'exists', value: null, scope: <pattern_hash> }
            # gap is open while no learned pattern exists for this cluster/input pair
            # gap closes when raid-clusters.json contains a verified pattern

      artifact_requirement:
        type:        object
        description: >
          What concrete artifact must exist for this gap to be considered
          closed. Verified by the closure verifier, not assumed from job
          completion. The artifact must be independently queryable — its
          existence is the proof, not the process that created it.
        shape:
          type:      enum          # see ARTIFACT_TYPES below
          location:  string        # where to find it (table name, file path, or URL)
          key:       string|null   # how to identify the specific artifact
          validator: string|null   # optional: JAA query or field check to verify artifact is valid
        examples:
          cluster_pattern: >
            { type: 'jaa_row', location: 'bep_patterns', key: pattern_hash,
              validator: 'weight > 0.5' }
          idearium_idea: >
            { type: 'jaa_row', location: 'gaps', key: idea_uuid,
              validator: 'status != open' }
          seam_session: >
            { type: 'jaa_row', location: 'seam_records', key: queue_uuid,
              validator: 'status = verified' }
          wiring_fix: >
            { type: 'event_log_entry', location: 'event_log',
              key: null, validator: 'type = guardian.job.complete AND meta.contractUuid = <uuid>' }

      dedup_key:
        type:        string
        description: >
          A stable hash of (predicate.table + predicate.field + predicate.op +
          predicate.scope). Two gaps with the same dedup_key are the same gap.
          The gap store checks this before insert — if an open gap with this
          dedup_key already exists, the new gap is NOT created. Instead, the
          existing gap gets an evidence item appended and its recurrence count
          incremented. This kills the cycle where 30 gaps spawn 300 jobs.
        derived:     true          # computed at creation time, not supplied by caller

      truth_floor:
        type:        object
        description: >
          The minimum viable truth artifact that Qwen writes synchronously
          before any async work begins. Always succeeds. Cannot be skipped.
          Prevents the system from having zero state when async paths fail.
        shape:
          diagnosis:   string      # Qwen's synchronous classification of the problem
          confidence:  number      # 0.0-1.0
          written_at:  timestamp
          model:       string      # 'qwen2.5:0.5b' or 'fallback:heuristic'
        note: >
          If Qwen is offline, truth_floor uses a deterministic heuristic:
          gap_type → known_diagnosis_map. Never null. Never skipped.

      ttl_ms:
        type:        number
        description: >
          Time-to-live in milliseconds. When elapsed without closure, the gap
          transitions to EXPIRED — not silently dropped, not retried automatically.
          EXPIRED is a visible, queryable state. The system reports expired gaps
          explicitly. A human or the autonomous loop decides what to do.
        default:     1800000       # 30 minutes for most gaps
        overrides:
          CONSTITUTIONAL: null     # no TTL — constitutional gaps never expire
          CAPABILITY:     3600000  # 1 hour — capability gaps need time to build
          KNOWLEDGE:      900000   # 15 minutes — knowledge gaps resolve fast or not at all

      closure_attempts:
        type:        array
        description: >
          Every attempt to close this gap. Each attempt records what was tried,
          what artifact was expected, whether the artifact was found, and why
          closure succeeded or failed. Max 10 attempts — after 10 the gap
          transitions to BLOCKED and requires human review.
        shape:
          - attempt_uuid:    string
            ts:              timestamp
            strategy:        string    # what was tried
            artifact_sought: object    # copy of artifact_requirement at attempt time
            artifact_found:  boolean
            predicate_false: boolean   # was the predicate actually false after?
            error:           string|null

  # ─────────────────────────────────────────────────────────────────────────────
  # SECTION 2 — Artifact types
  # ─────────────────────────────────────────────────────────────────────────────

  artifact_types:

    jaa_row:
      description: A row exists in a JAA table matching the key and validator
      verified_by:  jaaDB.query(location, r => r[key_field] === key && validator_passes(r))
      examples:
        - seam_records row for a queue UUID
        - bep_patterns row for a cluster pattern
        - reflection_contracts row with status=resolved

    file_written:
      description: A file exists at a path and contains expected content
      verified_by:  fs.existsSync(path) && JSON.parse(content)[validator_field] passes
      examples:
        - raid-clusters.json contains new pattern entry
        - data/cortex/ledger/raid-weights.json updated with new cluster weight

    component_registered:
      description: A component is registered in the component registry and responds to health
      verified_by:  GET /api/components/:id returns 200 AND /health probe passes
      examples:
        - new CLI command registered for a capability gap
        - new agent module registered for a routing gap

    event_log_entry:
      description: A specific event type exists in the event_log after gap creation
      verified_by:  jaaDB.query('event_log', r => r.type === type && r.ts > gap.createdAt)
      examples:
        - guardian.job.complete after a repair job
        - reflection.contract.resolved after Mistral analysis

    decision_log_scored:
      description: A decision_log row has satisfaction != null for the decision class
      verified_by:  jaaDB.query('decision_log', r => r.actor === class && r.satisfaction != null)
      examples:
        - reflection scored the decision that opened this gap

    idearium_idea:
      description: An idea exists in Idearium with a concrete proposal linked to this gap
      verified_by:  GET /api/idearium/ideas?gapUuid=<uuid> returns at least one idea
                    AND idea.phase != 'raw' (must have been reviewed, not just created)
      examples:
        - new wiring proposal for a CAPABILITY gap
        - architectural change proposal for a CONSTITUTIONAL gap

  # ─────────────────────────────────────────────────────────────────────────────
  # SECTION 3 — Closure lifecycle
  # ─────────────────────────────────────────────────────────────────────────────

  lifecycle:

    states:
      OPEN:          detected, predicate true, no closure attempt yet
      INVESTIGATING: closure attempt in progress (contract dispatched, artifact pending)
      EXPIRED:       TTL elapsed, no closure achieved — visible, not silent
      BLOCKED:       10 closure attempts failed — requires human or constitutional review
      RESOLVED:      predicate false AND artifact exists AND verified
      ARCHIVED:      resolved + history preserved — never deleted

    transitions:
      OPEN → INVESTIGATING:  when a closure attempt starts (contract queued)
      OPEN → EXPIRED:        when TTL elapses with no resolution
      INVESTIGATING → OPEN:  when artifact not found (attempt failed, retry possible)
      INVESTIGATING → RESOLVED: when predicate false AND artifact verified
      INVESTIGATING → EXPIRED:  when TTL elapses during investigation
      OPEN → BLOCKED:        when closure_attempts.length >= 10
      INVESTIGATING → BLOCKED: when closure_attempts.length >= 10
      RESOLVED → ARCHIVED:   explicit archival (human or autonomous loop)
      EXPIRED → OPEN:        human or autonomous loop explicitly re-opens with new strategy

    resolution_protocol:
      step_1_truth_floor: >
        Synchronous. Qwen classifies the gap immediately at creation.
        Writes truth_floor field. Cannot fail — uses heuristic if Qwen offline.
        This is the minimum viable truth artifact. Always happens.

      step_2_dedup_check: >
        Before inserting, compute dedup_key. Query gaps table for open gaps
        with matching dedup_key. If found: append evidence to existing gap,
        increment recurrence count, do NOT insert new gap. Return existing gap UUID.
        This is what kills the cycle.

      step_3_contract_queue: >
        Reflection engine queues a reflection_contract with:
          - gap_uuid
          - predicate (copy)
          - artifact_requirement (copy)
          - strategy selected by Qwen classification
          - priority derived from loop_type
        Contract status: queued. Written to JAA before any dispatch.

      step_4_dispatch: >
        Guardian picks up queued contracts. Routes via RAID (Qwen for triage,
        Mistral for reasoning). Mistral's job: produce an artifact or explain
        why it cannot. Not just reasoning — the artifact itself or a concrete
        proposal for what to build.

      step_5_verify: >
        After Mistral responds, the closure verifier runs:
          1. Evaluate predicate.check() against current JAA state
          2. Query artifact_requirement location for the expected artifact
          3. Run artifact validator if present
        If BOTH predicate is false AND artifact exists: gap → RESOLVED
        If either fails: attempt recorded, gap stays INVESTIGATING or → OPEN

      step_6_failure: >
        If artifact not found after Mistral response:
          - Record attempt in closure_attempts
          - Log to event_log: gap.closure.attempt_failed
          - If attempts < 10: gap → OPEN (retry on next reflection pass)
          - If attempts >= 10: gap → BLOCKED (human escalation)
          - NEVER silently drop the failure
          - NEVER re-dispatch the same strategy that just failed

    gap_rehydration_prevention: >
      The diagnostic engine checks dedup_key before creating any gap.
      The same problem cannot have two open gaps simultaneously.
      Recurrence is tracked on the existing gap (recurrence_count field).
      After resolution, if the same predicate becomes true again, a NEW gap
      is created with recurrence_count = previous_gap.recurrence_count + 1.
      This makes recurring problems visible as structural issues, not noise.

  # ─────────────────────────────────────────────────────────────────────────────
  # SECTION 4 — Gap predicate library (known gap types → predicates)
  # ─────────────────────────────────────────────────────────────────────────────

  predicate_library:
    # This grows over time as Qwen learns new gap types.
    # Seeded with the gaps currently flooding the system.

    seam_orphan_resume:
      predicate:
        table:  seam_records
        field:  queue_uuid
        op:     not_exists
        scope:  <queue_uuid from gap body>
      artifact_requirement:
        type:     jaa_row
        location: seam_records
        key:      queue_uuid
        validator: status != null
      truth_floor_hint: "SEAM queue resumed from previous session with no in-memory state"
      ttl_ms:   600000   # 10 minutes
      strategy: RETRIEVE # find the queue record or rebuild it

    obligation:
      predicate:
        table:  agent_calls
        field:  status
        op:     equals
        value:  pending
        scope:  <call_uuid from gap body>
      artifact_requirement:
        type:     jaa_row
        location: agent_calls
        key:      <call_uuid>
        validator: status != pending
      truth_floor_hint: "Agent call is stuck in pending — not claimed or dispatched"
      ttl_ms:   300000   # 5 minutes
      strategy: DISPATCH # dispatch the call or close it as failed

    cluster_misfire:
      predicate:
        table:  bep_patterns
        field:  cluster
        op:     not_exists
        scope:  <pattern_hash>
      artifact_requirement:
        type:     file_written
        location: data/cortex/ledger/raid-clusters.json
        key:      pattern_hash
        validator: weight > 0.5
      truth_floor_hint: "RAID classified intent incorrectly — no learned pattern covers this case"
      ttl_ms:   1800000  # 30 minutes
      strategy: EXTEND   # Qwen/Mistral generate a new cluster pattern

    capability_missing:
      predicate:
        table:  components
        field:  id
        op:     not_exists
        scope:  <component_id from gap body>
      artifact_requirement:
        type:     component_registered
        location: /api/components/<component_id>
        validator: health_check passes
      truth_floor_hint: "A requested capability has no registered component"
      ttl_ms:   3600000  # 1 hour — needs build time
      strategy: EXTEND   # register component or open Idearium idea

    spec_drift:
      predicate:
        table:  components
        field:  version
        op:     not_equals
        value:  <spec_version>
        scope:  <component_id>
      artifact_requirement:
        type:     jaa_row
        location: components
        key:      <component_id>
        validator: version == spec_version
      truth_floor_hint: "Component version does not match its spec — code and spec have diverged"
      ttl_ms:   900000   # 15 minutes
      strategy: RETRIEVE # update spec or update code, then verify match

    reflection_contract_unresolved:
      predicate:
        table:  reflection_contracts
        field:  status
        op:     equals
        value:  queued
        scope:  <contract_uuid>
      artifact_requirement:
        type:     jaa_row
        location: reflection_contracts
        key:      <contract_uuid>
        validator: status = resolved
      truth_floor_hint: "A reflection contract has been queued but not dispatched or resolved"
      ttl_ms:   600000   # 10 minutes
      strategy: DISPATCH # dispatch to Mistral via guardian

  # ─────────────────────────────────────────────────────────────────────────────
  # SECTION 5 — Integration points (what changes in existing files)
  # ─────────────────────────────────────────────────────────────────────────────

  integration:

    cortex/memory/jaa-db.js:
      changes:
        - Add reflection_contracts to TABLE_TIERS as 'long'
        - Add closure_attempts to TABLE_TIERS as 'long'
      note: Already done in jaa-db.patched.js

    lib/open-loop-taxonomy.js:
      changes:
        - createLoop() must accept and validate new required fields:
            predicate, artifact_requirement, dedup_key, truth_floor, ttl_ms
        - dedup_key computed from predicate if not supplied
        - truth_floor written synchronously before createLoop() returns
        - Add predicate_library export so callers can look up known gap types

    service/nexus-diagnostic.js:
      changes:
        - Before inserting any gap: compute dedup_key, check for existing open gap
        - If exists: append evidence, increment recurrence_count, return existing UUID
        - If new: include predicate from predicate_library (or construct from gap body)
        - Remove the per-sweep re-dispatch of already-open gaps
          (the single biggest source of the job flood)

    lib/reflection.js:
      changes:
        - _queueReflectionContract() must include predicate and artifact_requirement
        - Add closure_verifier: after Mistral responds, verify predicate AND artifact
        - Add TTL expiry check on every runReflectionPass()
        - Add BLOCKED state handling when closure_attempts >= 10

    cortex/core/raid/index.js:
      changes:
        - _qwenClassify() feeds cluster corrections into _clusterSamples
        - _clusterReviewTick() runs when correction rate > 40%
        - Successful cluster pattern generation closes a cluster_misfire gap
          (writes artifact, verifier picks it up)
      note: Already done in raid.learning.patched.js

    guardian/server.js:
      changes:
        - Poll reflection_contracts table for queued contracts
        - Dispatch queued contracts to Mistral via native Ollama path
        - On Mistral response: parse proposal, attempt to write artifact
        - Call closure verifier after artifact write attempt
        - Update contract status: queued → dispatched → resolved | failed
      new_route: POST /api/reflection/contracts/resolve
        accepts: { contractUuid, proposal, artifactWritten }
        action:  runs closure verifier, updates gap and contract state

  # ─────────────────────────────────────────────────────────────────────────────
  # SECTION 6 — What this does NOT do
  # ─────────────────────────────────────────────────────────────────────────────

  non_goals:
    - Does not auto-close gaps based on job completion signals
    - Does not close gaps based on timeouts (TTL → EXPIRED, not RESOLVED)
    - Does not trust model responses as artifacts (only structural state changes)
    - Does not delete gaps — ARCHIVED is the terminal state
    - Does not modify constitutional-ai.js (constitutional gaps → BLOCKED, human review)
    - Does not close the same gap twice (dedup_key prevents phantom resolution)

  # ─────────────────────────────────────────────────────────────────────────────
  # SECTION 7 — Relationship to the roadmap
  # ─────────────────────────────────────────────────────────────────────────────

  roadmap_alignment:

    phase_11_reflection:
      status_before: pending
      what_was_missing: >
        Reflection scored decisions and opened gaps but had no way to verify
        closure. Every reflection contract dispatched to guardian could complete
        without actually resolving anything. Reflection was producing outputs
        with no ontological commitment.
      what_this_spec_adds: >
        Reflection contracts now carry predicate + artifact_requirement.
        Closure verifier runs after Mistral responds. Reflection only marks
        a gap resolved when it can prove the predicate is false.

    phase_13_autonomous_loop:
      status_before: blocked (needs phase 11)
      dependency: >
        Autonomous loop uses gap state as its spine. If gap state is unreliable
        (same gaps cycling, fake closures), the autonomous loop acts on lies.
        This spec makes gap state trustworthy — the autonomous loop can now
        use it as a real signal.

    phase_29_topology:
      status_before: pending
      dependency: >
        Topology view needs to show real system state. With fake gap closures,
        the topology would show a healthy system that is actually broken.
        Structural closure conditions mean topology can show the truth.

    phase_34_api_surface:
      status_before: pending
      dependency: >
        API surface diagnosis needs to know when a diagnosis actually resolved
        the problem. Without artifact verification, "diagnosed" looks the same
        as "resolved." This spec distinguishes them.

    autonomous_improvement:
      description: >
        Every time a gap closes via a learned cluster pattern, the Qwen
        classification system gets better. Every time a gap closes via an
        Idearium idea, the idea gets linked to the gap as evidence of a
        structural improvement. The system builds a record of what actually
        worked — not what was attempted. That record feeds the case library
        (Phase 46), which feeds the autonomous loop (Phase 13), which feeds
        reflection (Phase 11). The loop is now grounded in truth.

  # ─────────────────────────────────────────────────────────────────────────────
  # SECTION 8 — Build order (bottom-up per §3.1)
  # ─────────────────────────────────────────────────────────────────────────────

  build_order:
    1: jaa-db.js — add reflection_contracts and closure_attempts tables
    2: open-loop-taxonomy.js — add predicate, artifact_requirement, dedup_key, truth_floor, ttl_ms
    3: service/nexus-diagnostic.js — dedup check before gap insert, remove re-dispatch flood
    4: lib/reflection.js — closure verifier, TTL expiry, BLOCKED state
    5: guardian/server.js — poll reflection_contracts, dispatch to Mistral, write artifacts
    6: cortex/core/raid/index.js — cluster pattern generation closes cluster_misfire gaps
    7: cortex/intelligence/index.js — feed closure events back into pattern engine
    UI last — gap lifecycle dashboard shows open loops, artifacts, closure state

  axioms_enforced:
    §1.1: every gap has predicate + artifact_requirement — nothing exists until proven
    §1.2: every closure attempt logged — nothing silent
    §2.1: truth_floor written synchronously before any async work — disk before behavior
    §2.3: gap state is always observable — EXPIRED and BLOCKED are visible states
    §3.1: build order above — data schema before logic before dispatch before UI
    §5.1: every gap has UUID, dedup_key, and event bus registration
