spec:
  meta:
    name:        cortex-schema-registry
    version:     0.1.0-phasemap
    status: >-
      PHASEMAP 2026-07-30. Schemas-per-system as an expectation +
      integrity layer, living IN cortex as editable rows. FLUID, not
      rigid: >-
      describes, observes, records drift — never blocks.
      Governed by AXIOMS-v3.1. §8.6 read first; §3.3 map before build.
    uuid:        nexus-cortex-schema-registry-v0-0000-2026-0730-001

  the_principle_james_named:
    fluid_not_rigid: >
      lib/ is agnostic tooling the whole system uses — a SERVICE systems consult,
      never a GATE that constrains them. The schema registry lives there for the
      same reason: every system uses it, but a schema DESCRIBES expected shape
      and cortex RECORDS deviation as data (like P4's soft signals). A malformed
      write is FLAGGED, never rejected. Integrity by observation, not lockdown.
    why_it_matters: >
      cortex is the persistent data, but jaaDB.insert(table, row) validates
      NOTHING — it appends any shape (_append writes the raw object). That is the
      "flat" problem: data persists but its SHAPE is unenforced. A user-model (or
      any consumer) can't reliably "know you" if nothing guarantees the model's
      integrity. Schema-per-system is the foundation that makes every cortex
      consumer trustworthy — the same insight one level deeper than "does it
      remember me."

  substrate_verified_2026_07_30:
    write_choke:   "cortex/memory/jaa-db → guardian/jaa-store _append(table, obj) — ONE place every insert flows through. A non-blocking observer sits here."
    already_named: "contracts/SYSTEM-CONTRACTS.js FAULTS.SCHEMA_VIOLATION = 'schema_violation' — the system already anticipated schema-checking; never built."
    reuse_pattern: "lib/uid/config-schema.js validateConfig(componentId, userConfig) — a working validate-against-shape pattern to build OUTWARD from (§8.6)."
    contracts_reg:  "contracts/SYSTEM-CONTRACTS.js already names events/gaps/faults/ledgers per system — the schema registry EXTENDS this naming into data-shape."

  design_law:
    - "§8.6/§16.5 — build outward from config-schema's validate pattern + SYSTEM-CONTRACTS naming. No new validation engine."
    - "FLUID — a schema is an EXPECTATION, a mismatch is DRIFT DATA, never a rejected write (§13.4 drift is data)."
    - "§2.2 storage is source of truth — so the schemas themselves are cortex ROWS (a `schemas` table), editable like any data. The registry is not a frozen file."
    - "§1.2 nothing silently fails — an unvalidated write IS a latent silent failure; observing shape makes it loud without blocking."
    - "lib/ agnostic — the registry is a service ANY system consults; it knows nothing about who's writing."

  phases:

    P1_schema_table_in_cortex:   # ← DONE 2026-07-30, derived from real rows, 1090/0
      does: "A `schemas` table in cortex: each row is { table, version, fields:[{name,type,required}], owner, updatedAt }. Schemas are DATA (editable rows), not a frozen file (§2.2)."
      reuse: "§8.6 — seed it FROM the shapes SYSTEM-CONTRACTS + the tables this session already writes (raid_decisions, etc). Read the real rows to derive the schema, don't invent it (§0.1)."
      gate: "a schema for raid_decisions exists as a cortex row, queryable + editable."
      axioms: [§2.2, §8.6, §0.1]

    P2_conformance_check_lib:   # ← DONE 2026-07-30, pure/non-blocking, 1096/0
      does: "lib/schema-registry.js — agnostic. checkShape(table, row) → { conforms, missing[], typeMismatches[], drift } against the cortex schema. PURE, non-throwing (§14.2)."
      reuse: "§8.6 — built outward from lib/uid/config-schema.validateConfig's field-check pattern."
      gate: "a row missing a required field returns conforms:false with the specific field named — but nothing is blocked (§1.2 loud, not fatal)."
      axioms: [§14.2, §8.6, §1.2]

    P3_observe_on_write_no_block:   # ← DONE 2026-07-30, non-blocking observe, 1103/0
      does: "jaaDB.insert consults the registry AFTER appending (§ observe, never gate): a non-conforming write is recorded as a schema_drift row (the already-named SCHEMA_VIOLATION fault), NOT rejected. The write always succeeds — fluid."
      reuse: "§8.6 — the _append choke point already exists; add an observer, don't reroute writes. FAULTS.SCHEMA_VIOLATION already named."
      gate: "a malformed insert still persists AND produces a schema_drift record — integrity by observation (§13.4)."
      axioms: [§13.4, §1.2, §16.5, §5.9]

    P4_editable_surface:
      does: "The schema is editable: updateSchema(table, patch) writes a new schema version (cortex row). Old rows aren't retro-invalidated — drift is measured against the CURRENT schema, history preserved (§0.3). This is the 'fluid, dynamic, editable' surface."
      gate: "editing a schema changes what counts as drift going forward, without touching stored data (§0.3 nothing lost)."
      axioms: [§0.3, §2.2, §12.5]

    P5_expectation_for_consumers:
      does: "Consumers (user-model, RAID, any system) can query the expected shape: expect(table) → schema. The user-model becomes trustworthy because its shape is declared + observed. This is where 'it knows me' gets its integrity foundation."
      reuse: "§8.6 — the user-model already persists to cortex (P2 of omniscience); now its table has a declared schema + drift observation."
      gate: "user-model reads/writes are shape-checked; a drifting user-model row is visible as data, not a silent corruption."
      axioms: [§5.10, §13.4, §17.5]

  ordering_rationale: >
    §3.1 bottom-up: P1 (schemas exist as data) → P2 (a way to check shape) → P3
    (observe on write, non-blocking) → P4 (editable) → P5 (consumers get the
    expectation). Each phase is fluid by construction — nothing blocks a write at
    any phase. The registry is a lib/ service (agnostic), the schemas are cortex
    rows (editable), the checks are observations (drift data). Rigid is
    impossible by design.

  honest_risks:
    - "§0.5 — must not over-engineer into a type system. A schema is {name,type,required}, nothing more, until a real need proves otherwise."
    - "§13.4 — schema_drift rows could flood if a table is genuinely schemaless. The registry only checks tables that HAVE a schema; an unschematized table is simply unobserved, not spammed."
    - "§0.1 — schemas are DERIVED from real rows (read the data), not imagined. A wrong schema would make good data look drifted."
    - "the check is post-append (observe) — a truly corrupt row still persists. That's the fluid tradeoff, stated plainly: we observe integrity, we don't enforce it."

  relation_to_other_phasemaps:
    note: >
      §13.4 — three phasemaps existed disconnected (RAID verification spine,
      this schema-registry, and the un-mapped user-model fixes). Reconciled here
      into ONE dependency chain so they are not competing plans (§10.3):
    chain:
      - "docs/raid-warp-verification-phasemap.spec P1-P4 (DONE) — RAID records+verifies decisions to cortex. These WRITE raid_decisions rows with no schema — a direct motivator for this registry."
      - "THIS (cortex-schema-registry P1-P5) — the integrity foundation: every cortex table (incl raid_decisions AND user_model) gets a declared, editable, observed shape."
      - "THEN user-model phases (below, newly mapped) — sit ON this registry: the user-model becomes trustworthy because its shape is declared+observed, and only then is it worth querying on every path."
    dependency: "user-model-everywhere DEPENDS ON schema-registry P5 (a user-model you query on every response must have integrity first). schema-registry P3 records drift the same way RAID P4 does — one drift model, not two (§10.3)."

  user_model_phases_FOLDED_IN:
    context: >
      James: "does it query the model of the user before responding, so it
      remembers me, adjusts to me, using its model as an editable surface." The
      diagnosis (2026-07-30): P2-of-omniscience wired buildUserContext() ONLY on
      /api/prompt/tools — the main paths (/api/prompt, /stream, /fulfill) do NOT
      query it, what's logged is thin, and it is not editable. These phases were
      discussed but never mapped — folding them in now so they're not lost (§0.3).
    UM1_schema_for_user_model:   # ← DONE 2026-07-30, self-registers at init, 1107/0
      does: "user_model table gets a schema in the registry (this map's P1/P5). Its shape is declared + drift-observed. The integrity foundation."
      depends: "schema-registry P1-P3."
    UM2_query_on_every_path:   # ← DONE 2026-07-30, all 3 paths, 1113/0
      does: "§8.4 map the 3 prompt paths first, then inject buildUserContext() into /api/prompt, /stream, /fulfill — not just the tool-loop. Every response queries the model first."
      gate: "a plain /api/prompt response reflects a known user preference without being told."
    UM3_richer_capture:   # ← DONE 2026-07-30, accreting signals, 1120/0
      does: "capture more than intent strings — phrasing/tone/correction signals as observations, confidence-weighted (the existing observe() already supports this; feed it more)."
    UM4_editable_self_optimizing_surface:   # ← DONE 2026-07-30, pin/reject/correct, 1127/0
      does: "the user-model is editable via cortex (schema-registry P4 makes schemas editable; this makes the MODEL editable): user or co-pilot can correct/pin a hypothesis, and co-pilot adjusts from it. The 'editable surface to optimize itself.'"
      depends: "schema-registry P4 (editable cortex rows)."
      gate: "editing a hypothesis changes how co-pilot responds next; nothing is lost (§0.3)."
