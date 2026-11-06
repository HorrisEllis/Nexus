spec:

  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # pillar/spec/pillar.spec — Pillar: one kernel of primitives, merged from Emerge's core, the ERAVOS kernel and Nexus's
  # shared primitives, each concept once, each with its contract and its conformance tests. Format: emerge's module spec
  # (kg-builder, specDepth 1.0, no BLACK). Phases: docs/2026-11-06-pillar-phasemap.spec.
  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        pillar
    version:     0.1.0
    author:      james-brooks
    created_at:  2026-11-06T00:00:00Z
    status:      specced
    uuid:        nexus-pillar-spec-v1-0000-2026-1106-jamesbrooks-001
    origin: >-
      James, 2026-11-05: "Yes. This could be huge." (the primitives letting a small local model do what needs a big one) · asked which
      primitives: "One kernel, merged" · "After EAS4" (EAS_D8). His words a month before, scripts/bench-file-prompt.js, 2026-10-05: "combining
      primitives or invariants to build higher leverage code for less tokens." The name, 2026-11-06, after Bearing, Structural, Critical and
      Distribute were weighed: "Yes." to Pillar, from his own words of 2026-08-17: "Bottom up, architectural first. Pillars of the
      Foundation... core foundation of each system first." Its shape (a standalone system; Seed a versioned deterministic replay input; the
      duplicates retired after a verified migration; three identities kept apart; contracts first, then conformance, then consolidation) is
      an outside analysis he brought and took: "I guess" (PIL_D1, tentative, recorded as said).
    purpose: >-
      Today the same concepts exist several times: a constraint in all three sets, a hash-chained log three times (Emerge's History, WARP's
      Ledger, ERAVOS's causal ledger), Event and Gate twice inside Nexus's lib (siso/ and warp/core/). Copies drift, and most of the merge
      trouble of 2026-11-06 came from copies drifting. Pillar defines each concept once, as a contract (what goes in, what comes out, how it
      fails), and proves every implementation against it with conformance cases, so Emerge, ERAVOS and Nexus stand on one floor. It is the
      structure a small model composes from: the model picks primitives and fills their settings; Pillar's cases catch its mistakes.
    target_runtime: [node]
    language_stack: [javascript, emerge]
    paradigm: [contracts-first, conformance-before-consolidation, one-concept-once, three-identities, deterministic-replay, move-then-archive]
    axioms: ["§10.3 one truth, no competing layers", "§5.9–§5.16 sovereignty", "§0.3 nothing lost", "§1.2 nothing fails silently", "§8.6 reuse before build", "§3.1 bottom-up"]
    deps: []

    census: >-
      Read 2026-11-05/06. Emerge's core (emerge/emerge/core): leaves Constraint, Transition, Observation, Gap, Lens, Seed (+ Identity, Clock);
      compounds Budget (a counter + a Constraint), History (Identity + Clock), Level (Identity), Admit (Constraint, EAS4a); Field composes them.
      The ERAVOS kernel (ERAVOS.kernel.spec 1.0.0, outside this repo): Organism, Space, Hook, Wire, Projection, Constraint, Mutation, Event,
      Asset, Permission, + Port (amendment 3.1); its object model (proposed): one store, stable ids, typed associations. Nexus
      (lib/system-boundary.js PRIMITIVES): the bus, nexus-connect, the hooks registry, SISO (Event, Gate, Stream), WARP (Link, Expectation,
      Axiom, Ledger, Engine). Missing from Emerge, present elsewhere: Relation, Identity through change (ERAVOS), Expectation (WARP).

    constraints:
      - id: PIL-001
        description: "Each concept exists once in Pillar: one contract per primitive; a second contract for the same meaning is refused."
        type: hard
        enforced_by: [GATE-PIL-ONCE]
      - id: PIL-002
        description: "No implementation is consolidated, moved or retired before its conformance cases pass against the contract (contracts, then conformance, then consolidation)."
        type: hard
        enforced_by: [GATE-PIL-CONFORMS]
      - id: PIL-003
        description: "Semantic identity (what it means), implementation identity (which code, by hash) and version identity (which revision of its behaviour) are three fields, never one."
        type: hard
        enforced_by: [GATE-PIL-IDENTITY]
      - id: PIL-004
        description: "Pillar depends on nothing above it: no require of Emerge, ERAVOS or Nexus code; they consume Pillar, never the reverse."
        type: hard
        enforced_by: [GATE-PIL-FLOOR]

  schemas:

    - id: PrimitiveContract
      name: PrimitiveContract
      description: "One primitive, defined once: its meaning, what it takes, what it gives, how it fails."
      complete: true
      fields:
        id:        { type: string, rule: "pillar:<name>, unique across Pillar" }
        meaning:   { type: string, rule: "one sentence, the semantic identity" }
        takes:     { type: object, rule: "named inputs with their types" }
        gives:     { type: object, rule: "named outputs with their types" }
        fails:     { type: array,  rule: "each failure named; a failure is a value or a gap, never a silent pass" }
        from:      { type: array,  rule: "the sets it was merged from: emerge | eravos | nexus, with the name it had there" }
        version:   { type: string, rule: "semver of its behaviour" }
      behavioral_contracts: ["a contract changes only by a new version; the old version stays (§0.3)"]
      error_paths: ["a field missing → the contract is refused with the field named"]

    - id: ConformanceCase
      name: ConformanceCase
      description: "A known answer one implementation must give for one contract."
      complete: true
      fields:
        contract:   { type: string, rule: "a PrimitiveContract id" }
        input:      { type: object, rule: "what is given" }
        expect:     { type: object, rule: "what must come back, or the failure that must be named" }
        kind:       { type: string, rule: "ordinary | boundary | adversarial | regression" }
        provenance: { type: object, rule: "source, version, derivation, signed_off_by (not the author of the implementation)" }
      behavioral_contracts: ["every contract has at least one boundary and one adversarial case before an implementation is called conforming"]
      error_paths: ["a case without provenance → refused; independent authorship is recorded, not taken as proof of correctness"]

    - id: PrimitiveIdentity
      name: PrimitiveIdentity
      description: "The three identities of a primitive in use, kept apart."
      complete: true
      fields:
        semantic:       { type: string, rule: "the PrimitiveContract id (what it means)" }
        implementation: { type: string, rule: "the content hash of the code that implements it" }
        version:        { type: string, rule: "the contract version whose behaviour it gives" }
      behavioral_contracts: ["a code hash may change with the version fixed (a reimplementation); a version may change with the meaning fixed; neither hides the other"]
      error_paths: ["any one of the three missing → the identity is incomplete, said"]

    - id: SeedSpec
      name: SeedSpec
      description: "A seed: an explicit input to a versioned deterministic pseudorandom process, for replay."
      complete: true
      fields:
        value:     { type: integer, rule: "the seed itself" }
        algorithm: { type: string,  rule: "the generator's name and version" }
        scope:     { type: string,  rule: "the run, field or component it seeds" }
        replay:    { type: string,  rule: "what must match for the same sequence: algorithm version and inputs" }
      behavioral_contracts: ["same value + same algorithm version + same inputs → the same sequence", "never entropy, never an identity, never a secret"]
      error_paths: ["a non-integer value, or no algorithm → refused: a run without a recorded seed cannot be replayed"]

  interfaces:

    - id: IF-EMERGE-CORE
      name: emerge-core
      path: emerge/emerge/core/index.js
      description: "Emerge's core primitives as code (Field, Constraint, Transition, Observation, Lens, Gap, History, Level, Budget, Seed, admitFrom)."
      exports: ["createField", "defineConstraint", "evaluate", "createTransition", "createObservation", "createLens", "createGap", "createHistory", "createLevels", "createBudget", "createSeed", "admitFrom"]
      behavioral_contracts: ["pure; depends on nothing above Emerge"]
      error_paths: ["a bad argument throws a TypeError naming the field"]

    - id: IF-WARP-CORE
      name: warp-core
      path: lib/warp/core/index.js
      description: "WARP 2: Link, Expectation, Ledger, Engine; and WARP 1's Event, Gate, Axiom, Stream."
      exports: ["createLink", "createExpectation", "Ledger", "Engine", "Event", "Gate", "Axiom", "Stream"]
      behavioral_contracts: ["warp/core imports nothing outside warp/"]
      error_paths: ["a link with no cause and no root mark is refused"]

    - id: IF-SISO
      name: siso
      path: lib/siso/index.js
      description: "SISO: Event, Gate, Stream (the shape WARP 1 forked from)."
      exports: ["Event", "Gate", "Stream", "StreamLog"]
      behavioral_contracts: ["a gate is a pure transform of one event type"]
      error_paths: ["two gates on one signature are refused"]

    - id: IF-ERAVOS-KERNEL
      name: eravos-kernel
      path: ERAVOS:specs/ERAVOS.kernel.spec
      description: "The ERAVOS kernel's primitive types (Organism, Space, Hook, Wire, Projection, Constraint, Mutation, Event, Asset, Permission, Port), outside this repo."
      exports: ["the primitive types as a spec (no code in Nexus)"]
      behavioral_contracts: ["read as a source of concepts, not a dependency: Pillar requires none of its code"]
      error_paths: ["the spec not at hand → its concepts are merged from the 2026-11-05 reading, said"]

  modules:

    - id: MOD-PIL-SYSTEM
      name: pillar-system
      uuid: nexus-pillar-system-v1-0000-2026-1106-001
      path: pillar/index.js
      phase: PIL1_pillar_stands
      description: >-
        Pillar laid out as its own system: its folder, its package and version, its own component registry (§5.16), its CLI
        (node pillar/cli.js contracts | check <contract> <impl> | conform), declared in lib/nexus-self/systems.js. Whether it also runs as a
        process with a server.js is his to settle (PIL_D2): until he does, it is a library with a CLI, the floor others stand on.
      deps: [{ name: pillar-contracts }]
      schema_refs: [PrimitiveContract]
      exports: ["require('pillar') → { contracts(), contract(id), check(id, impl), identityOf(id, file) }", "node pillar/cli.js contracts|check|conform"]
      gate_pipeline: ["GATE-PIL-FLOOR: pillar/ requires nothing outside pillar/ (the boundary census)", "GATE-PIL1-002: its registry lists each export"]
      behavioral_contracts: ["one system going down breaks no other: Emerge and Nexus keep their own code until conformance passes (PIL-002)"]
      error_paths: ["a require out of pillar/ → the census names it and the phase is not built"]
      acceptance: ["node pillar/cli.js contracts lists every contract; the census shows no edge out of pillar/"]

    - id: MOD-PIL-CONTRACTS
      name: pillar-contracts
      uuid: nexus-pillar-contracts-v1-0000-2026-1106-001
      path: pillar/contracts/index.js
      phase: PIL2_contracts
      description: >-
        One PrimitiveContract per primitive, as data (pillar/contracts/<name>.contract), merged from the three sets: Constraint, Transition,
        Observation, Gap, Lens, Seed, History, Level, Budget, Field (Emerge); Relation, Identity (ERAVOS); Expectation, Link, Event, Gate
        (Nexus), each concept once, each naming where it came from and under which name.
      deps: []
      schema_refs: [PrimitiveContract, SeedSpec]
      exports: ["load(dir) → PrimitiveContract[]", "get(id) → PrimitiveContract | null", "validate(contract) → { ok, errors }"]
      gate_pipeline: ["GATE-PIL-ONCE: no two contracts with one meaning", "GATE-PIL2-002: every field of PrimitiveContract present"]
      behavioral_contracts: ["a contract changes only by a new version, the old one kept"]
      error_paths: ["a missing field → refused, named", "two contracts for one meaning → refused, both named"]
      acceptance: ["every primitive of the census has one contract; validate passes on all; a duplicate meaning is refused in a test"]

    - id: MOD-PIL-CONFORMANCE
      name: pillar-conformance
      uuid: nexus-pillar-conformance-v1-0000-2026-1106-001
      path: pillar/conformance/run.js
      phase: PIL3_conformance
      description: >-
        Conformance cases per contract (pillar/conformance/<name>/*.case: ordinary, boundary, adversarial, regression, each with provenance),
        and a runner that takes an implementation (Emerge's core, WARP, SISO) through an adapter and reports each case pass, fail or gap.
      deps: [{ name: pillar-contracts }, { name: emerge-core }, { name: warp-core }, { name: siso }]
      schema_refs: [ConformanceCase, PrimitiveContract]
      exports: ["run(contractId, adapter) → { contract, cases: [{ id, kind, ok, got, why }], conforming }", "node pillar/cli.js conform [contract]"]
      gate_pipeline: ["GATE-PIL-CONFORMS: an implementation is conforming only when every case passes", "GATE-PIL3-002: each case carries provenance"]
      behavioral_contracts: ["an implementation is never edited to pass: a failing case is a finding, recorded", "a case is independent of the implementation it tests"]
      error_paths: ["an adapter that throws → that case fails with the error, the run goes on", "a case with no provenance → refused"]
      acceptance: ["Emerge's evaluate conforms to pillar:constraint; WARP's Ledger and Emerge's History both run against pillar:history and the differences are named"]

    - id: MOD-PIL-IDENTITY
      name: pillar-identity
      uuid: nexus-pillar-identity-v1-0000-2026-1106-001
      path: pillar/identity.js
      phase: PIL4_three_identities
      description: "PrimitiveIdentity for a primitive in use: its contract id, the content hash of its code (CIE-EG D9: code by hash), its contract version."
      deps: [{ name: pillar-contracts }]
      schema_refs: [PrimitiveIdentity]
      exports: ["identityOf(contractId, file) → PrimitiveIdentity", "compare(a, b) → { meaning, code, version } (each same | changed)"]
      gate_pipeline: ["GATE-PIL-IDENTITY: all three fields present and kept apart"]
      behavioral_contracts: ["a reimplementation changes the code hash only; a behaviour change bumps the version; a meaning change is a new contract"]
      error_paths: ["a file that cannot be read → the identity says so, never a made-up hash"]
      acceptance: ["two copies of one primitive with the same meaning and different code are told apart by compare"]

    - id: MOD-PIL-MIGRATION
      name: pillar-migration
      uuid: nexus-pillar-migration-v1-0000-2026-1106-001
      path: pillar/migration.js
      phase: PIL5_the_duplicates_census
      description: >-
        The verified path to retiring duplicates: for lib/siso/ and lib/warp/core/ (Event, Gate, Stream twice), every consumer found, the
        two behaviours run against Pillar's cases and compared, the canonical one named. Removal itself is a later phase and only after this
        census and compatibility tests (no blind deletion, §0.3).
      deps: [{ name: pillar-conformance }, { name: siso }, { name: warp-core }]
      schema_refs: [ConformanceCase]
      exports: ["census() → { duplicates: [{ concept, copies: [{ path, consumers, conforming }] }], canonical }", "node pillar/cli.js duplicates"]
      gate_pipeline: ["GATE-PIL5-001: every consumer of each copy named", "GATE-PIL-CONFORMS: each copy run against the cases"]
      behavioral_contracts: ["nothing is deleted by this module; it reports"]
      error_paths: ["a copy with behaviour no case covers → a gap, named, before any retirement"]
      acceptance: ["the census lists siso/ and warp/core's Event, Gate and Stream with their consumers and their case results"]

    - id: MOD-PIL-BENCH
      name: pillar-small-model-bench
      uuid: nexus-pillar-bench-v1-0000-2026-1106-001
      path: pillar/bench/run.js
      phase: PIL6_the_small_model_bench
      description: >-
        His idea (EAS_D8): a small local model (3B–7B) given the same tasks with and without Pillar's contracts; measured: tests passed, tokens,
        attempts; the unfavourable case reported beside the favourable (§17.11). A world-simulation domain is a candidate (EAS_D8 addendum).
      deps: [{ name: pillar-contracts }, { name: pillar-conformance }]
      schema_refs: [PrimitiveContract, ConformanceCase]
      exports: ["run({ model, tasks, withContracts }) → { passed, tokens, attempts, perTask }", "node pillar/cli.js bench"]
      gate_pipeline: ["GATE-PIL6-001: both arms on the same tasks and the same model", "GATE-PIL6-002: the losing cases reported"]
      behavioral_contracts: ["no claim without the numbers; a run that cannot reach a model says so"]
      error_paths: ["no model reachable → the bench refuses and names the model it looked for"]
      acceptance: ["one run on his machine: both arms, the numbers, the losing cases"]

  events:
    - { name: pillar.contract.refused,   payload: "{ id, errors }" }
    - { name: pillar.conformance.ran,    payload: "{ contract, implementation, conforming, failed }" }

  enforcement:
    gates: [GATE-PIL-ONCE, GATE-PIL-CONFORMS, GATE-PIL-IDENTITY, GATE-PIL-FLOOR]

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node, invariants valid"
    - "pillar/test/*.test.js — each module's acceptance, written with its phase"
