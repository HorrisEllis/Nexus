spec:
  meta:
    name:        context-synthesis-pipeline
    version:     0.1.0-schema
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-context-synthesis-pipeline-v1-0000-2026-0902-jamesbrooks-001
    purpose: >
      James: "data synthesizes into context using the intelligence system,
      tags and keyword based queries into the data from each system and
      cortex. then the context synthesizes with the contract schema
      (based off intent for each system and agent) to create a contract."
      Two real stages, checked separately below — stage 1 (data -> context)
      is a confirmed GAP; stage 2 (context + schema -> contract) already
      has real precedent to extend, not invent.

  # ── Stage 1: DATA -> CONTEXT (the fan-out query) ─────────────────────────
  stage_1_data_to_context:
    status: "gap — no single real mechanism does this today"
    real_data_sources:
      cortex:
        mechanism: "cortex/push-recall.js recall(intent, context, tier)"
        coverage: >
          real lexical + recency + failure + bep + causal ranking — but
          ONLY over rows already pushed into cortex's own store
          (this._store.all()), confirmed by reading recall() directly.
          Never reaches another system's native tables.
      loom:
        mechanism: "loom_scan (capabilities/dangling/specs/source/closed_door/phasemap), nexus_map (systems/graph/component)"
        coverage: "real, but one call = one topic. no keyword fan-out across topics."
      guardian:
        mechanism: "agent_chat_search (chat_log/guardian_chat_log), query_movement"
        coverage: "real literal substring search — not semantic, not cross-system."
      raid:
        mechanism: "meta_query (alk_query/gap_analyze/liminal_analyze/lattice_get_edge), query_movement"
        coverage: "real, per-signal — sigma/friction/drift, one system at a time."
      idearium:
        mechanism: "idearium spec-engine's own chunk/manifest tables (idearium_spec_manifests, idearium_spec_chunks)"
        coverage: "real, queryable via its own db.js — not yet exposed through any of the above."

    the_gap: >
      §CONFIRMED — checked warp/dispatch/index.js's "reuse" (fuzzy structural
      reuse over the dispatch loop's OWN generated candidates, not this) and
      intelligence/server.js (routes only, no fan-out logic). Nothing today
      takes (tags[], keywords[], system_scope[]) and unions cortex.recall()
      with per-system calls above into one candidate stream. This is the
      one new function to build:

    to_build:
      name: synthesizeContext(query, opts)
      args:
        query: "{ tags: string[], keywords: string[] }"
        opts:  "{ systems: string[] — which of the sources above to fan out to, default: all }"
      behavior: >
        1. call cortex/push-recall.js recall() with query as intent context
        2. for each system in opts.systems, call its real existing tool
           (loom_scan / query_movement / meta_query / agent_chat_search /
           nexus_map) filtered by the same tags/keywords
        3. tag every returned item with source_tool (context-candidate.spec's
           real field, already defined for exactly this) — never merge
           results into one anonymous blob
        4. return the raw candidate stream — UNFILTERED. Stage 1 does not
           know about any contract's boundary yet; filtering is stage 3.
      does_not: "rank, dedupe across systems, or filter — that's stage 3's job, not this one's. Keeping them separate means stage 1 stays reusable across every contract, not re-derived per boundary."

  # ── Stage 2: SCHEMA lookup, by (system, intent, agent) ───────────────────
  stage_2_schema_registry:
    status: "extend real precedent — idearium/spec-engine/templates.js"
    real_precedent: >
      getTemplate(templateId) / listTemplates() already exist and already
      resolve a name to a real seedFile + seedSection + type. Keyed by
      template id/architecture name only today (genesis, minimal-kernel,
      api-service, event-system, architecture, axioms — confirmed by
      reading templates.js directly).
    extension_needed: >
      add a second real lookup, alongside the existing one, keyed by
      (system, intent, agent) -> { primitive, invariants[], principles[] }
      — i.e. the synthesis-contract.spec#boundary block, not a new spec
      template. Two different agents asking the same system for the same
      intent should resolve to the SAME primitive+invariants (the boundary
      is a property of system+intent, not of which agent asked) — agent
      only affects forAgent/language on the envelope, never the boundary.

    # §CORRECTED 2026-09-02 — grep-checked every one of the 5 real
    # submitContract() call sites in the codebase (cortex/self-heal/
    # index.js, contract-intake.js's own submitIdeariumChunk +
    # submitBuildPhaseContract, idearium/api/index.js, copilot/server.js).
    # `system` is NEVER passed as an opt in any of them — row.system is
    # opts.system || null, and opts.system is undefined at every real call
    # site. `source` IS populated at all 5. The key below was wrong
    # against reality; corrected to what's actually there. `intention` was
    # ALSO only set at 1 of 5 (submitBuildPhaseContract's hardcoded
    # 'build') before this session — patched the other 4 (self-heal ->
    # 'heal', both idearium call sites -> 'build', copilot's /build
    # handler -> 'build') so real data exists to key off at all.
    registry_shape:
      key: "${source}:${intention}"
      value:
        primitive: "resolvable loom component id / warp class / SPEC_SECTIONS id"
        invariants: "Axiom.id[]"
        principles: "§-tag[]"

    # §RESOLVED 2026-09-02 — checked whether these four could actually be
    # loom-registered to satisfy the old requirement: 2 of 4 (self-heal,
    # agent-mesh) have no HTTP route at all, and lib/component-registry.js's
    # real register() hard-requires route:{method,path}. Fabricating a
    # route for a non-routed internal module would violate §1.1. Fixed at
    # the source instead — synthesis-contract.spec#boundary.primitive now
    # accepts a confirmed-real module/function path (checked by direct
    # source read) as well as a loom-registered id. All 4 rows below are
    # confirmed real by direct read; none needed a fabricated route.
    real_rows:
      "self-heal:heal":
        primitive: "cortex/self-heal (MODULE_ID, confirmed by direct read) — no HTTP route, event-driven; not loom-registerable as-is, and no longer required to be"
        invariants: []
        principles: ["§1.2"]
      "idearium:build":
        primitive: "idearium.spec-engine (MODULE_ID, confirmed by direct read) — routed via idearium/api/index.js; loom-registerable if desired, not yet done"
        invariants: []
        principles: ["§2.2", "§3.1"]
      "agent-mesh:build":
        primitive: "cortex/core/raid/contract-intake.js#submitBuildPhaseContract (confirmed by direct read) — no HTTP route, called in-process; not loom-registerable as-is, and no longer required to be"
        invariants: []
        principles: ["§3.1"]
      "copilot:build":
        primitive: "copilot/server.js /build handler (confirmed by direct read) — routed via /api/prompt's text-prefix match; loom-registerable if desired, not yet done"
        invariants: []
        principles: ["§1.2"]
    invariants_left_empty: >
      none of the 4 real rows have a real Axiom.id assigned yet — would be
      fabricating a match to fill the field. Left empty rather than
      invented; populating these against warp/core/Axiom.js's actual
      registered axioms is real, separate follow-up work.

  # ── Assembly: stage 1 + stage 2 -> contract ──────────────────────────────
  assembly:
    order: >
      1. resolve boundary = stage_2 registry lookup on (source, intention)
      2. run stage_1 synthesizeContext(query, {systems: relevant to boundary.primitive})
      3. gate every stage_1 candidate against boundary — context-candidate.spec's
         in_bounds_check, using boundary from step 1
      4. only in_bounds candidates -> synthesis-contract.spec#envelope.context.matched[]
      5. submitContract() — real, existing, cortex/core/raid/contract-intake.js,
         unchanged by any of this
    honest_scope: >
      steps 1-4 are net-new. step 5 already works today and is not being
      redesigned — this pipeline produces the CONTENT that goes into a
      contract submitContract() already knows how to queue/dispatch/verify.
