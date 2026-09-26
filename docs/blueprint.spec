spec:
  meta:
    name:        blueprint
    version:     1.1.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-blueprint-v1-0000-2026-0615-jamesbrooks-001
    status:      pending
    purpose: >
      Declarative compartment/module definitions. Blueprint loader reads
      .blueprint files and instantiates the described structure. Used by
      Architect wizard output and Compartment OS.

      v1.1: this is Phase 40 — Component Descriptor: The Atomic Unit of
      Reality. One single descriptor per capability is the only source of
      truth; CLI command, UI form, docs, and code all generate from it.
      Nothing hand-duplicated again. Every other thread in this build
      cycle — registry identity, RAID's fitness formula, the SNR cascade,
      spec-metadata caching, idearium-as-container — converged here
      independently. This is the load-bearing piece they're all blocked
      on, not one phase among many.

  descriptor_shape:
    schema: |
      uuid: bp_001.comp.{namespace}.{name}     # blueprint-namespaced
      componentId: namespace.name              # matches live component-registry.js id format
      type: kernel | engine | runtime | handler | ...
      capabilities:
        - verb: string
          noun: string
          input: schema_ref
          output: schema_ref
          axioms: [§ref, ...]                  # which AXIOMS-v1.0 laws this capability must satisfy
          params: [{name, type, required}]
      aliases: [string, ...]                   # grammar-engine entry points
      deps: [componentId, ...]
      tier: 0 | 1 | 1.5 | 2                     # which compiler pass produces this
      resolution:
        max_level: deterministic | scaffold | llm_filled

    namespace_roots:
      "bp_001.comp.*":    "the component itself"
      "bp_001.cli.*":     "generated CLI command (Phase 40.5)"
      "bp_001.ui.*":      "generated UI form (Phase 43)"
      "bp_001.grammar.*": "generated grammar-engine aliases (Phase 15, 36)"
      "bp_001.config.*":  "generated config surface (orchestrator.config.json pattern)"
      "bp_001.seam.*":    "SEAM pipeline chunk — distinct from compartment (docs/seam-component-registry.spec §4 naming_note). This IS the correct use of 'seam' — the T0/T1/T2 chunking pipeline, not the execution-boundary concept that was renamed."
      "bp_001.doc.*":     "generated docs"
      "bp_001.axiom.*":   "which AXIOMS-v1.0 laws this descriptor is checked against at compile time"

  compiler_pipeline:
    T0:
      name: "spec → descriptors"
      llm: false
      description: "Deterministic parse of a .spec file's capabilities[] into descriptor records."
    T1:
      name: "scaffold TypeScript"
      llm: false
      description: "Deterministic codegen of types/interfaces from descriptor shape. No implementation logic, just structure."
    T1_5:
      name: "project all views"
      llm: false
      description: "Deterministic projection into CLI map, UI form schema, grammar aliases, docs — one descriptor, many outputs, per the registry's snr_as_capability and §10 raid_consumption sections."
    T2:
      name: "LLM fills implementations"
      llm: true
      description: "Only this tier touches an LLM. Descriptor + blueprint fragment as context. Everything upstream (T0/T1/T1.5) is deterministic and free."

  verified_gap: >
    SEAM chunk schema doesn't currently carry componentId at any of 4
    levels checked. Fix is threading an existing identifier through an
    existing pipe, not new infrastructure.

  first_consumers:
    cli: "Phase 40.5 — capabilities project into commands. Blocked on Phase 36 first (nexus-repl has zero grammar-engine resolution today, confirmed by tracing the live code — see docs/raid.spec history)."
    snr_capability: >
      docs/raid-snr-filter.spec's generic_capability section — the
      tiered-resolution cascade becomes this system's first non-CLI,
      non-RAID consumer. First concrete proof this descriptor model
      generalizes beyond capability→command projection.
    registry_identity: >
      docs/seam-component-registry.spec's multi_role and role_definitions
      sections assume descriptors exist to register comp_types against.
      Without Phase 40, the registry's identity model has no atomic unit
      to attach roles to — descriptors ARE that atomic unit.

  downstream_dependents:
    - "Phase 40.5 — Descriptor-Driven CLI"
    - "Phase 40.6 — CFR Component Edge (needs componentId flowing through every event)"
    - "Phase 41 — Compiler Knowledge Layer"
    - "Phase 42 — Blueprint: The Loop Closes (note: same word, this phase's own name — the loop-closing phase IS this descriptor system reading itself back, not a naming collision, the recursion is deliberate)"
    - "Phase 43 — Architect as UI Builder"
    - "Phase 44 — Resolution Spectrum"
    - "Phase 48 — RAID fitness formula's topological_proximity term, via Phase 40.6"

  build_order: >
    §3.1 bottom-up. T0 (deterministic spec parse) before T1 (scaffold)
    before T1.5 (projections) before T2 (LLM fill). Each tier needs the
    one below it passing real tests before it starts — "it seems to work"
    is not exit criteria.

  open_decisions:
    - id: descriptor-vs-registry-canonical
      description: >
        seam-component-registry.spec's Phase 62 decision (one registry,
        not three) needs to resolve before T0 can know what it's parsing
        a .spec's capabilities[] INTO — lib/component-registry.js's
        existing schema, or Architect's richer HookRegistry schema. Not
        re-litigated here; flagged as a hard prerequisite this phase
        inherits.

