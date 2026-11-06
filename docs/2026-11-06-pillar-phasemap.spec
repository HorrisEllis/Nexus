# docs/2026-11-06-pillar-phasemap.spec — Pillar: one kernel of primitives (his EAS_D8, "One kernel, merged"), its own system.
# Spec: pillar/spec/pillar.spec. The direction and the name are James's (quoted); the shape is an outside analysis he took ("I guess",
# tentative); the cut into phases and the order are the coder's. Mapped before any code (§3.3); every phase has its DAG.

origin: >-
  James, 2026-11-05: "Yes. This could be huge." · "One kernel, merged" · "After EAS4" (docs/2026-10-31-emerge-as-a-system-phasemap.spec
  EAS_D8). 2026-11-06, the name: "Yes." to Pillar, his own word of 2026-08-17: "Bottom up, architectural first. Pillars of the Foundation...
  core foundation of each system first." The focus (CLAUDE.md, 2026-11-06): "Emerge first then fiverr maybe? I’m struggling. Emerge is the
  highest leverage."

status: "MAPPED 2026-11-06. Nothing built by this map yet."

decisions:
  PIL_D0_the_name_is_pillar:
    status: "DECIDED 2026-11-06 (his)"
    james: '"Yes." (asked: "Is it Pillar?", after Bearing, Structural, Critical and Distribute were weighed against the code)'
    context: >-
      Asked to name the merged kernel once it was to be its own system. His first answer, "James de Vinci", was asked back (a system's name
      lands in its folder, spec and every changelog). The coder checked each name he then offered against the tree: Critical (COS's
      critical flag, 233 files), Structural (Emerge's structural gap type), Distribute (a verb, the opposite of gathering), Bearing (no
      clash; the coder's recommendation). Pillar had no clash in code and comes from his 2026-08-17 words.
    chosen: "Pillar; its folder pillar/, its spec pillar/spec/pillar.spec"
  PIL_D1_the_shape_he_brought:
    status: "DECIDED 2026-11-06 (his, tentative: recorded as said)"
    james: '"I guess" (asked whether he adopts the outside analysis''s picks)'
    context: >-
      An outside analysis (ChatGPT) he pasted, picking "by leverage" under one principle ("minimize irreversible commitments, preserve
      determinism, and avoid creating unnecessary architectural dependencies"), recorded first as recommendations (PR #256).
    chosen: >-
      Pillar is a standalone system (one canonical source, a stable interface, no circular dependencies, its own conformance tests); Seed is a
      versioned deterministic replay input; siso/ and warp/core's duplicates are retired only after a verified migration; semantic,
      implementation and version identity are kept apart; contracts first, then conformance, then consolidation. CIE-EG CH-Q2 and CH-Q4 as
      recorded in emerge/emerge/spec/cie-eg.spec.
  PIL_D2_a_process_or_a_library:
    status: "OPEN — his to settle (do not guess)"
    question: >-
      His rule (2026-11-03): "the server.js is the process for each system. It’s what cos manages." Pillar, as he heard it described
      (2026-11-06), is "a small library with its own tests, version and contract", the floor others stand on, not a room you walk into.
      Two readings: (a) Pillar has a server.js like every system, COS runs it, and others ask it by route; (b) Pillar is a library with a CLI
      that others depend on as code, the one kind of system that is not a process (as lib/warp is today).
    until_settled: "PIL1 lays it out as a library with a CLI; a server.js is added only if he chooses (a)"

phases:

  PIL1_pillar_stands:
    status: OPEN
    depends_on: [PIL_D0_the_name_is_pillar, PIL_D1_the_shape_he_brought]
    spec: pillar/spec/pillar.spec
    blocks: [MOD-PIL-SYSTEM]
    files: [pillar/index.js, pillar/cli.js, pillar/package.json, pillar/registry-components.js, lib/nexus-self/systems.js, tests/modules/test-pillar.test.js, tests/modules/run-all.js]
    requires: [node]
    prerequisites: ["the spec compiles at specDepth 1.0 (test-substrate-spec)"]
    does: "Pillar's folder as its own system: package and version, its own registry, its CLI; declared in nexus-self's systems; requires nothing outside pillar/"
    proof: "node pillar/cli.js contracts answers; the boundary census shows no edge out of pillar/; test-pillar PI-01"

  PIL2_contracts:
    status: OPEN
    depends_on: [PIL1_pillar_stands]
    spec: pillar/spec/pillar.spec
    blocks: [MOD-PIL-CONTRACTS]
    files: [pillar/contracts/index.js, pillar/contracts/*.contract, tests/modules/test-pillar.test.js]
    requires: [node]
    prerequisites: ["the census of the three sets (pillar.spec meta.census)"]
    does: >-
      One contract per primitive, each concept once, each naming where it came from: Constraint, Transition, Observation, Gap, Lens, Seed,
      History, Level, Budget, Field (Emerge); Relation, Identity (ERAVOS); Expectation, Link, Event, Gate (Nexus)
    proof: "validate passes on every contract; a second contract for one meaning is refused (test-pillar)"

  PIL3_conformance:
    status: OPEN
    depends_on: [PIL2_contracts]
    spec: pillar/spec/pillar.spec
    blocks: [MOD-PIL-CONFORMANCE]
    files: [pillar/conformance/run.js, pillar/conformance/adapters/*.js, pillar/conformance/*/, tests/modules/test-pillar.test.js]
    requires: [node]
    prerequisites: ["Emerge's core, WARP and SISO readable as they are (no change to them in this phase)"]
    does: "the cases per contract (ordinary, boundary, adversarial, regression, each with provenance) and the runner over Emerge's core, WARP and SISO through adapters"
    proof: "Emerge's evaluate conforms to pillar:constraint; History and WARP's Ledger both run against pillar:history, the differences named"

  PIL4_three_identities:
    status: OPEN
    depends_on: [PIL2_contracts]
    spec: pillar/spec/pillar.spec
    blocks: [MOD-PIL-IDENTITY]
    files: [pillar/identity.js, tests/modules/test-pillar.test.js]
    requires: [node]
    prerequisites: []
    does: "a primitive in use as three identities: its contract (meaning), its code's hash (implementation, CIE-EG D9), its contract version"
    proof: "two copies with one meaning and different code are told apart; a version bump with the code unchanged is seen"

  PIL5_the_duplicates_census:
    status: OPEN
    depends_on: [PIL3_conformance, PIL4_three_identities]
    spec: pillar/spec/pillar.spec
    blocks: [MOD-PIL-MIGRATION]
    files: [pillar/migration.js, tests/modules/test-pillar.test.js]
    requires: [node]
    prerequisites: ["no removal in this phase (§0.3): it reports"]
    does: "siso/ and warp/core's Event, Gate and Stream: every consumer, each copy against the cases, the canonical one named; removal is a later phase"
    proof: "the census names every consumer and each copy's case results"

  PIL6_the_small_model_bench:
    status: OPEN
    depends_on: [PIL3_conformance]
    spec: pillar/spec/pillar.spec
    blocks: [MOD-PIL-BENCH]
    files: [pillar/bench/run.js, pillar/bench/tasks/*, tests/modules/test-pillar.test.js]
    requires: [node, "a local model (Ollama, 3B–7B) on his machine for the real run"]
    prerequisites: ["the contracts and their cases (PIL2, PIL3)"]
    does: "his EAS_D8 bench: the same tasks with and without Pillar's contracts; tests passed, tokens, attempts; the losing cases reported"
    proof: "the runner's own test with a stand-in model; the real numbers from one run on his machine"

order: "PIL1 → PIL2 → (PIL3, PIL4) → PIL5; PIL6 after PIL3. PIL_D2 settled before a server.js is added."
