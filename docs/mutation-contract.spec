spec:
  meta:
    name:        mutation-contract
    version:     1.0.1
    foundation:  nexus-system-foundation@1.1.0
    kind:        library-module   # not a service — no port, lives at orchestrator/lib/mutation-contract.js
    uuid:        nexus-mutation-contract-v1-0000-2026-0901-jamesbrooks-001
    status:      active
    purpose: >
      NEXUS Mutation Contract — implements seam-component-registry-spec.md
      §9.5, the governance layer for how a human (CLI, eventually API) may
      change live component state. Deliberately NOT the comp_type/role-
      revalidation engine from that spec's §2/§6 — that remains unbuilt
      because 5 of its 7 "unresolved decisions" (§9) block it. This module
      only covers what that spec itself marks as unblocked: the mutation
      contract, named "the foundational piece" (§9.5).

  schema_mapping: >
    seam-component-registry-spec.md's wire vocabulary (comp_id, comp_type,
    comp_lineage, comp_intent, comp_properties) does not match the live
    component-registry.js schema (id, namespace, comp_types[] — an array
    of {type,files,intent}, no lineage field). Renaming the live schema to
    match the spec would break every existing caller (orchestrator,
    grammar-engine, the CLI, request-handler). Instead: the EXTERNAL
    contract (ledger event shape, forbidden/allowed target names) matches
    the spec's literal vocabulary; the mapping to live field names is kept
    explicit in the module's own header comment (orchestrator/lib/
    mutation-contract.js, lines ~14-24) rather than duplicated here and
    risking drift between the two.
    fields:
      comp_id:         { live: id,                    mutable: false, note: identity }
      comp_type:       { live: "comp_types[].type",    mutable: false, note: identity }
      comp_intent:     { live: "comp_types[].intent",  mutable: false, note: identity }
      comp_lineage:    { live: "(does not exist yet)", mutable: false, note: reserved }
      comp_properties: { live: properties,             mutable: true,  note: "the only real mutable door" }

  api:
    init:
      description: "Boot-time init hook."
    checkTarget:
      description: "Validates a mutation target against FORBIDDEN_TOP / ALLOWED_PREFIX before mutateProperty runs."
    mutateProperty:
      description: >
        The one real mutable door (comp_properties only). Emits
        'component.property_mutated' on the bus with { ...event, source,
        ts } on success.
    exports_also: [FORBIDDEN_TOP, ALLOWED_PREFIX, MODULE_ID, VERSION]

  events:
    emits:
      - 'component.property_mutated'

  consumers:
    - orchestrator/orchestrator.js
    - lib/execution-pipeline.js

  history:
    - date: unknown
      summary: >
        Original build implementing seam-component-registry-spec.md §9.5's
        real, unblocked "foundational piece" while the broader comp_type/
        role-revalidation engine stayed explicitly deferred.
    - date: unknown
      summary: >
        §0.9.10 fix — require path to component-registry was stale after
        a restructuring moved it into shared lib/ (same bug class as
        grammar-fallback's own 0.9.10 fix, per lib/version.js's changelog).
        Version bumped 1.0.0 -> 1.0.1.
    - date: 2026-09-01
      summary: >
        First .spec written, closing one of the 11 real gaps
        orchestrator/lib/spec-drift.js's live check reported (§LM1).

  gaps:
    as_of: 2026-09-01
    entries:
      - id: SEAM-9
        type: design
        summary: >
          5 of seam-component-registry-spec.md's own 7 §9 "unresolved
          decisions" (drift thresholds, violation reaction mode,
          multi-role components, etc) still block the broader comp_type/
          role-revalidation engine this module deliberately does not
          implement. Pre-existing, not opened by this spec — recorded
          here because it's the real reason this module's scope stops
          where it does.
        opened: unknown

  version_history:
    - version: 1.0.0
      date: unknown
      summary: "Original build."
      versioniumCommitId: null
    - version: 1.0.1
      date: unknown
      summary: "Stale require-path fix (per lib/version.js 0.9.10 changelog)."
      versioniumCommitId: null
