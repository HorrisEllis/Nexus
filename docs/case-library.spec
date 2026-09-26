spec:
  meta:
    name:        case-library
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-case-library-v1-0000-2026-0619-jamesbrooks-001
    purpose: >
      Queryable index of every PASS compartment trace, keyed by intent
      signature (domain:verb). Before a compartment spawns, RAID queries
      this library — a matching past execution seeds the new compartment's
      working memory instead of a cold start. This spec did not exist
      before this pass; the phase was marked `complete` in
      nexus-phase-map.md with nothing built behind it (same false-complete
      state Phase 25/26 were caught in).

  phase: 46

  deps:
    - "Phase 25 (compartment-engine) — supplies _declaredDomain/_declaredVerb on every compartment"
    - "crystal-lattice — lattice_edges.success_rate is the confidence source; crystals (CREATE_NEGATIVE_CRYSTAL) is the block source"
    - "jaa"

  unlocks:
    - "Phase 13 (Autonomous Loop) — this was the last unmet hard dependency"

  jaa_table: "case_index (long-tier — permanent)"
  schema:
    uuid:                  string
    signature:             "string — `${domain}:${verb}`"
    domain:                string
    verb:                  string
    compartment_uuid:      string
    intent_uuid:           "string | null"
    working_memory:        "any | null — the seed this compartment itself ran with"
    result:                "any | null — the executor's actual output"
    trace_log:             array
    constraint_frame_uuid: "string | null"
    _evicted:              boolean
    evictedAt:             "number | null"
    indexedAt:             number

  indexing:
    trigger:      "compartment-engine.js _pass() only — FAIL/DELETE traces are never indexed"
    hook:         "compartment-engine.js _registerExtensions({ caseLibraryIndex }) — fourth named slot, same pattern as adversarySuite/qaqcLayer/crystalLatticeUpdate"
    source_data:  "the full in-memory compartment object, not the persisted JAA row — the row has no domain/verb, only intent_uuid"
    bound:        "MAX_TRACES_PER_SIGNATURE (default 20) — oldest beyond the cap soft-evicted (_evicted: true), never hard-deleted (JaaDB has no delete())"

  query:
    called_by:   "RAID, before compartment-engine.spawn() — not yet wired as a live caller; spawn() itself is not called from anywhere in the codebase yet (confirmed). Phase 13 is the orchestrator that ties intent → case query → spawn into one live loop."
    resolution_level: "L1 — alias/exact match on domain+verb. Zero LLM, zero embedding. No L3 semantic layer exists yet to upgrade this."
    confidence_source: "crystal-lattice lattice_edges.success_rate for edge CompartmentType:{domain}.{verb}->State:Resolution — read via the exported _edgeKey(), never recomputed independently"
    tiers:
      blocked:  "negative crystal exists for this signature — checked FIRST, overrides confidence entirely"
      full:     "confidence >= 0.85 AND a surviving indexed trace exists — seed = most recent trace's {trace_log, result, working_memory}"
      skeleton: "confidence >= 0.60 (or full-tier confidence with no surviving trace — honest downgrade) — seed = {signature, confidence} only, no trace replay"
      cold:     "confidence < 0.60, OR no lattice edge exists yet for this signature — seed = null. 'never seen' and 'always fails' are different facts; both currently surface as cold, distinguished by confidence: null vs confidence: <0.60, never collapsed into the same number."

  open_items:
    - "spawn() has no live caller anywhere in the codebase yet — query() and indexCompartment() are both real and tested in isolation, but the actual RAID-query-before-spawn loop this spec describes does not exist until Phase 13 builds it."
    - "L1-only matching means two intents with the same domain+verb but very different objects/constraints get the same tier — no semantic disambiguation exists below L3, which is not built."
