spec:

  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # diagnostic/spec/diagnostic-schemas.spec — a schema for everything Diagnostic records: findings, heartbeats and pulse, causality,
  # repair specs, heal attempts, the wire report. Each a schema file in diagnostic/schemas (its own, sovereign), each producer checked
  # against it. Format: emerge's module spec (kg-builder, specDepth 1.0, no BLACK). Phases: docs/2026-10-31-spec-everything-phasemap.spec.
  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        diagnostic-schemas
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-31T00:00:00Z
    status:      specced
    uuid:        nexus-diagnostic-schemas-spec-v1-0000-2026-1031-jamesbrooks-001
    origin: >-
      James, 2026-10-31: "then all the schemas for the diagnostic system". His NC0 schema rule (2026-10-19): "reusable or deterministic code
      that is architectural, stores memory or data, or keeps consistency has a schema, template, reusable node type or spec file — built from
      it, checked against it." The census and the cut are the coder's.
    purpose: >-
      Every record Diagnostic makes has a schema it owns (diagnostic/schemas/schema.<name>, lib/node-export.js's envelope, as
      schema.healer_proposal already is), so a finding, a beat or a heal attempt can be checked, stored as a node, read by Intelligence and
      shown by the cockpit without guessing its shape.
    target_runtime: [node]
    language_stack: [javascript, yaml]
    paradigm: [schema-for-everything, sovereign-schemas, producers-checked]
    axioms: ["NC0 schema rule", "§5.15 sovereignty (the system owns its schemas)", "§1.2 nothing fails silently", "§12.6 every system has a diagnostic engine", "§0.1 evidence over memory"]
    deps: []

    census: >-
      Read 2026-10-31 on main 0.60.320. diagnostic/schemas holds eight: capability, command, component, healer_proposal, hook, node, system,
      wire (the generic node types and the healer's proposal). Nothing Diagnostic produces about the system has one. diagnostic/nexus-
      diagnostic.js pushes issues and alerts of 16 types (system_offline, high_friction, high_friction_failure, syntax_error,
      missing_required_file, missing_registry, broken_wire, orphaned_hook, orphaned_pending, stuck_queue_item, ledger_stale, ledger_missing,
      baseline_not_established, size_limit_regression, path_traversal_regression, failure_chain_regression) as plain objects of differing
      shape ({ type, system, port, severity, fix } here, { severity, type, message, wire } there). lib/pulse-watch.js emits heartbeat effects;
      diagnostic/lib/causality.js measures ledger linkage; diagnostic/lib/heal-loop.js builds a repair spec and dispatches it;
      diagnostic/lib/wire-integrity.js scores wiring. diagnostic/spec/requirements.spec already defines Requirement, RequirementCheck and
      RemedyPolicy (DR1–DR5). A defect found on the way: system_offline's fix text is hard-coded "node <name>/boot.js or
      service/<name>-service.js", wrong for most systems (their entry is in their compartment.json).

    constraints:
      - id: DS-001
        description: "Every record Diagnostic writes or emits names its schema and validates against it; an invalid one is kept, marked invalid, and counted, never dropped."
        type: hard
        enforced_by: [GATE-DS-VALID]
      - id: DS-002
        description: "Diagnostic's schemas are its own files (sovereign copies, as its index.js already says); a shared shape is copied and its source named."
        type: hard
        enforced_by: [GATE-DS-OWN]

  schemas:

    - id: Finding
      name: Finding
      description: "One thing Diagnostic found wrong: the issues and the alerts in one shape."
      fields:
        id:        "string — <system>.<kind>.<hash of the subject>"
        kind:      "enum — the 16 kinds of the census, open: a new kind is added to the schema first"
        system:    "string"
        severity:  "enum — low | medium | high | critical"
        subject:   "object — what it is about: { port } | { wire: { from, to } } | { hook } | { file } | { ledger } …"
        message:   "string — what was seen, in words"
        fix:       "string | null — the step that fixes it, from the system's own declaration (compartment.json entry, requires[])"
        evidence:  "object — the reading that showed it"
        firstSeen: "number"
        lastSeen:  "number"
        count:     "number"
        causedBy:  "string | null — a finding or event id"
      behavioral_contracts: ["one finding per subject: repeats raise count and lastSeen, never a second record"]
      error_paths: ["an unknown kind → kept as kind 'unknown' with the raw type, and the schema gap reported"]

    - id: Heartbeat
      name: Heartbeat
      description: "A system's beat as pulse-watch reads it."
      fields:
        system:    "string"
        at:        "number"
        intervalMs: "number — the interval it announced"
        causedBy:  "string | null — the previous beat's link"
        root:      "boolean — a chain carried over from an older ledger"
      behavioral_contracts: ["a beat expects the next within its window"]
      error_paths: ["no interval announced → the default, said"]

    - id: Pulse
      name: Pulse
      description: "The negative space: each system's expected beats against the ones seen."
      fields:
        system:    "string"
        lastBeat:  "number | null"
        expected:  "number"
        missed:    "number"
        gap:       "boolean — a missed window is open"
        reason:    "string | null — why the beats stopped, when causality can say"
      behavioral_contracts: ["computed from beats; never polled"]
      error_paths: ["a system never seen → expected 0, said as unannounced"]

    - id: CausalityMeasure
      name: CausalityMeasure
      description: "How many ledger rows name their cause, and how many causes resolve (causality.js measure)."
      fields:
        measuredAt: "number"
        files:     "number"
        unreadable: "number"
        total:     "{ rows, linked, resolved, dangling, share }"
        systems:   "[{ system, rows, linked, resolved, dangling, share, files }]"
      behavioral_contracts: ["a system's share only rises (the ratchet); a fall is a Finding"]
      error_paths: ["an unreadable ledger → counted in unreadable"]

    - id: RepairSpec
      name: RepairSpec
      description: "What heal-loop asks a builder to do about a gap."
      fields:
        name:      "string"
        intent:    "string"
        constraints: "string[]"
        gaps:      "[{ id, description, severity }]"
        suggested_actions: "string[]"
      behavioral_contracts: ["built from the gap and its classification only"]
      error_paths: ["a gap with no path → its description named as the subject"]

    - id: HealAttempt
      name: HealAttempt
      description: "One attempt to heal a gap, end to end."
      fields:
        id:        "string"
        gap:       "string — the gap or finding id"
        classification: "object"
        repairSpec: "RepairSpec"
        dryRun:    "boolean"
        dispatchedTo: "string | null — guardian provider"
        result:    "enum — proposed | applied | refused | failed | dry-run"
        why:       "string"
        at:        "number"
      behavioral_contracts: ["every attempt recorded, including dry runs (§1.2)"]
      error_paths: ["Guardian down → result failed, why named"]

    - id: WireReport
      name: WireReport
      description: "wire-integrity's score and what it found."
      fields:
        score:     "number 0..100 — wireScore × 0.6 + regScore × 0.4"
        wireScore: "number"
        regScore:  "number"
        brokenWires: "[{ from, to, issue }]"
        missingRegistries: "[{ ns, error }]"
        orphanedInHooks: "[{ hook }]"
        alerts:    "Finding[]"
      behavioral_contracts: ["each alert is a Finding"]
      error_paths: ["Loom's registry unreadable → score null, said"]

  interfaces:

    - id: IF-DIAG-ENGINE
      name: nexus-diagnostic
      path: diagnostic/nexus-diagnostic.js
      description: "The engine that pushes issues and alerts today."
      exports: ["the scan", "issues[] and alerts[]"]
      behavioral_contracts: ["runs at boot and on its cadence"]
      error_paths: ["a probe throws → its issue says so"]

    - id: IF-PULSE-WATCH
      name: pulse-watch
      path: lib/pulse-watch.js
      description: "Beats and the missed-beat negative space."
      exports: ["the engine's heartbeat effects"]
      behavioral_contracts: ["fed, never polling"]
      error_paths: ["an unknown system's beat → registered as unannounced"]

    - id: IF-CAUSALITY
      name: causality
      path: diagnostic/lib/causality.js
      description: "Ledger linkage measure and its ratchet."
      exports: ["measure", "compare", "lines"]
      behavioral_contracts: ["read only"]
      error_paths: ["unreadable files counted"]

    - id: IF-HEAL-LOOP
      name: heal-loop
      path: diagnostic/lib/heal-loop.js
      description: "Classify a gap, build its repair spec, dispatch it."
      exports: ["healGap", "attachToBus", "healLoopHandler", "DRY_RUN"]
      behavioral_contracts: ["dry run by default where configured"]
      error_paths: ["dispatch fails → said"]

    - id: IF-WIRE-INTEGRITY
      name: wire-integrity
      path: diagnostic/lib/wire-integrity.js
      description: "Scores the wiring from Loom's registry."
      exports: ["the map: brokenWires, missingRegistries, orphanedInHooks"]
      behavioral_contracts: ["read only"]
      error_paths: ["registry missing → said"]

    - id: IF-DIAG-SCHEMAS
      name: diagnostic-schema-index
      path: diagnostic/schemas/index.js
      description: "Diagnostic's own schema registry (loadAll)."
      exports: ["loadAll() → { [type]: schema }"]
      behavioral_contracts: ["sovereign copies, no runtime dependency on lib/node-schemas.js"]
      error_paths: ["a schema file that does not parse → named"]

  modules:

    - id: MOD-DS-FILES
      name: diagnostic-schema-files
      uuid: nexus-diagnostic-schemas-files-v1-0000-2026-1031-001
      path: diagnostic/schemas/schema.finding
      phase: DSC1_the_schema_files
      description: "The seven schemas above written as Diagnostic's own schema files (schema.finding, schema.heartbeat, schema.pulse, schema.causality_measure, schema.repair_spec, schema.heal_attempt, schema.wire_report), in lib/node-export.js's envelope like schema.healer_proposal; index.js loads them; requirements.spec's three schemas written the same way when DR1 builds."
      deps: [{ name: diagnostic-schema-index }]
      schema_refs: [Finding, Heartbeat, Pulse, CausalityMeasure, RepairSpec, HealAttempt, WireReport]
      exports: ["seven schema files", "loadAll() includes them"]
      gate_pipeline: ["GATE-DSC1-001: each file parses as an envelope", "GATE-DSC1-002: loadAll lists 15"]
      behavioral_contracts: ["status REAL with its source named in each file"]
      error_paths: ["a name taken by lib/node-schemas → the copy names its source"]
      acceptance: ["loadAll() returns the eight existing and the seven new"]

    - id: MOD-DS-FINDINGS
      name: findings-in-one-shape
      uuid: nexus-diagnostic-schemas-findings-v1-0000-2026-1031-001
      path: diagnostic/lib/finding.js
      phase: DSC2_findings_in_one_shape
      description: "One maker for a Finding (finding(kind, system, subject, { severity, message, fix, evidence })) used by every issues.push and alerts.push in nexus-diagnostic.js and wire-integrity; a repeat raises count and lastSeen; each validated against schema.finding."
      deps: [{ name: diagnostic-schema-files }, { name: nexus-diagnostic }, { name: wire-integrity }]
      schema_refs: [Finding, WireReport]
      exports: ["finding(...) → Finding", "validate(record, type) → { ok, why }"]
      gate_pipeline: ["GATE-DSC2-001: no issues.push or alerts.push of a bare object left", "GATE-DSC2-002: every finding valid"]
      behavioral_contracts: ["the replies' shape for existing callers kept (type stays, as an alias of kind)"]
      error_paths: ["invalid → kept, marked, counted"]
      acceptance: ["a scan on a fixture with a down system and a broken wire: two Findings, both valid, the old fields still present"]

    - id: MOD-DS-FIXHINT
      name: fix-from-the-declaration
      uuid: nexus-diagnostic-schemas-fixhint-v1-0000-2026-1031-001
      path: diagnostic/nexus-diagnostic.js
      phase: DSC3_the_fix_from_the_declaration
      description: "system_offline's fix read from the system's compartment.json entry (and COS's start route once MG15 is built), never the hard-coded 'node <name>/boot.js or service/<name>-service.js'."
      deps: [{ name: findings-in-one-shape }]
      schema_refs: [Finding]
      exports: ["fix text from compartment.json entry"]
      gate_pipeline: ["GATE-DSC3-001: no hard-coded boot.js hint"]
      behavioral_contracts: ["a system without a declaration says so in the fix"]
      error_paths: ["compartment.json unreadable → the fix says which file to add"]
      acceptance: ["for copilot the fix names copilot/server.js; for cortex, its entry"]

    - id: MOD-DS-RECORDS
      name: beats-heals-and-measures-checked
      uuid: nexus-diagnostic-schemas-records-v1-0000-2026-1031-001
      path: diagnostic/lib/heal-loop.js
      phase: DSC4_beats_heals_and_measures_checked
      description: "heal-loop writes a HealAttempt (with its RepairSpec) for every attempt, dry runs included; causality's measure and pulse-watch's beats and pulse are validated against their schemas where Diagnostic records them."
      deps: [{ name: diagnostic-schema-files }, { name: heal-loop }, { name: causality }, { name: pulse-watch }]
      schema_refs: [HealAttempt, RepairSpec, CausalityMeasure, Heartbeat, Pulse]
      exports: ["heal_attempt records", "validated measures and beats"]
      gate_pipeline: ["GATE-DSC4-001: every attempt has a record"]
      behavioral_contracts: ["pulse-watch stays in lib (it is shared); Diagnostic checks what it records from it"]
      error_paths: ["a record invalid → kept, marked, counted"]
      acceptance: ["a dry-run heal on a fixture gap writes one valid HealAttempt with result dry-run"]

  events:
    diagnostic_schemas:
      - "diagnostic.finding { id, kind, system, severity }"
      - "diagnostic.record.invalid { type, why }"

  enforcement:
    gates:
      - { id: GATE-DS-VALID, name: records-valid, severity: error, check: "every record validates against its schema", on_failure: "marked invalid, counted, reported" }
      - { id: GATE-DS-OWN, name: own-schemas, severity: error, check: "diagnostic/schemas resolves every type it uses with no runtime require of lib/node-schemas", on_failure: "the ratchet reports it" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node"
    - "per module: its acceptance lines"
