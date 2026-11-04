# docs/2026-10-31-diagnostic-schemas-phasemap.spec — a schema for everything Diagnostic records, and its producers checked against them
# His ask; the census and the cut are the coder's. Spec: diagnostic/spec/diagnostic-schemas.spec.

origin: >-
  James, 2026-10-31: "then all the schemas for the diagnostic system"

status: "MAPPED 2026-10-31. Diagnostic has 8 schemas (generic node types and healer_proposal); its findings (16 kinds), beats, pulse, causality, repair specs, heal attempts and wire report have none. Nothing built."

decisions:
  DSC_D0_a_schema_for_everything:
    chosen: "every record Diagnostic makes has its own schema file and is checked against it; an invalid record is kept and counted"
    by: "his NC0 schema rule (2026-10-19) and his ask (origin), applied by §5.15 (Diagnostic's own copies) and §1.2"

phases:
  DSC1_the_schema_files:
    status: OPEN
    depends_on: [DSC_D0_a_schema_for_everything]
    files: [diagnostic/schemas/schema.finding, diagnostic/schemas/schema.heartbeat, diagnostic/schemas/schema.pulse, diagnostic/schemas/schema.causality_measure, diagnostic/schemas/schema.repair_spec, diagnostic/schemas/schema.heal_attempt, diagnostic/schemas/schema.wire_report, diagnostic/schemas/index.js]
    spec: diagnostic/spec/diagnostic-schemas.spec
    blocks: [MOD-DS-FILES]
    does: "seven schema files in Diagnostic's own folder"
    proof: "loadAll() returns fifteen"
  DSC2_findings_in_one_shape:
    status: OPEN
    depends_on: [DSC1_the_schema_files]
    files: [diagnostic/lib/finding.js, diagnostic/nexus-diagnostic.js, diagnostic/lib/wire-integrity.js, tests/modules/test-diagnostic-findings.test.js]
    spec: diagnostic/spec/diagnostic-schemas.spec
    blocks: [MOD-DS-FINDINGS]
    does: "one maker for every finding; repeats counted; each validated"
    proof: "a fixture scan: two valid Findings with the old fields kept"
  DSC3_the_fix_from_the_declaration:
    status: OPEN
    depends_on: [DSC2_findings_in_one_shape]
    files: [diagnostic/nexus-diagnostic.js]
    spec: diagnostic/spec/diagnostic-schemas.spec
    blocks: [MOD-DS-FIXHINT]
    does: "system_offline's fix from the system's compartment.json, not a hard-coded boot.js guess"
    proof: "copilot's fix names copilot/server.js"
  DSC4_beats_heals_and_measures_checked:
    status: OPEN
    depends_on: [DSC1_the_schema_files]
    files: [diagnostic/lib/heal-loop.js, diagnostic/lib/causality.js, diagnostic/nexus-diagnostic.js]
    spec: diagnostic/spec/diagnostic-schemas.spec
    blocks: [MOD-DS-RECORDS]
    does: "every heal attempt recorded (dry runs too); measures and beats validated"
    proof: "a dry-run heal writes one valid HealAttempt"

order: "DSC1 → (DSC2 → DSC3, DSC4). DR1–DR5 (requirements) use the same schema files."
