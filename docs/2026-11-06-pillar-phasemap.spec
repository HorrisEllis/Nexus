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
    status: "DECIDED 2026-11-06 (his): (b) a library"
    james: '"library"'
    decided_context: >-
      Asked with the readings side by side and the coder's recommendation, (b): a constraint is checked on every WARP link (on 2026-11-05 a
      check sent through a door was "far too slow per link"); a library cannot go down under the systems that use it (his rule: one system
      down breaks no other); and his 2026-11-05 call already used Emerge's evaluate "directly", as a shared primitive. His answer: "library".
      Pillar is code each Emerge system loads, with its CLI for him and the agents (its tests, its contracts); no server.js, no door. A door
      can still be added on top later without rework if another language needs to ask it.
    status_before: "OPEN — his to settle (do not guess)"
    question: >-
      His rule (2026-11-03): "the server.js is the process for each system. It’s what cos manages." Pillar, as he heard it described
      (2026-11-06), is "a small library with its own tests, version and contract", the floor others stand on, not a room you walk into.
      Two readings: (a) Pillar has a server.js like every system, COS runs it, and others ask it by route; (b) Pillar is a library with a CLI
      that others depend on as code, the one kind of system that is not a process (as lib/warp is today).
    until_settled: "PIL1 lays it out as an Emerge module with a CLI; a door is added only if he chooses (a)"
    # 2026-11-06, his follow-up: "Yeah but what if we want to use it for another system?" — answered: an Emerge system uses the module; a
    # system in another language implements the contracts and passes the cases (the meaning travels, not the code); a door can be added
    # later on top without rework. Still his to settle.
  PIL_D3_written_in_emerge:
    status: "DECIDED 2026-11-06 (his)"
    james: '"Pillar isn’t meant to be JavaScript. Emerge is complete invented using cie-eg"'
    context: >-
      The coder had written Pillar's spec with JavaScript paths and a node CLI, without asking: a guess, against CIE-EG section 0 ("emerge.exe
      replaces node.exe"; the Node runtime is scaffolding; what is added to it is worth adding only if it can be written again in .eg).
    chosen: >-
      Pillar is Emerge source (.eg): its contracts (with the contract block and schema, CIE-EG D7 and D8), its cases, its checks and its CLI,
      run by eg and, when native, by emerge.exe. Implementations in another language (Emerge's JS core, WARP, SISO) are checked from outside:
      Pillar exports the cases as data, their own harness answers, Pillar judges. pillar.spec 0.2.0, PIL-005, GATE-PIL-EG.

phases:

  PIL1_pillar_stands:
    status: BUILT
    depends_on: [PIL_D0_the_name_is_pillar, PIL_D1_the_shape_he_brought, PIL_D2_a_process_or_a_library, PIL_D3_written_in_emerge]
    spec: pillar/spec/pillar.spec
    blocks: [MOD-PIL-SYSTEM]
    files: [pillar/pillar.eg, pillar/cli.eg, pillar/registry.eg, pillar/test/pillar.test.eg, lib/nexus-self/systems.js, tests/modules/test-pillar.test.js, tests/modules/run-all.js]
    requires: [node]
    prerequisites: ["the spec compiles at specDepth 1.0 (test-substrate-spec)"]
    does: "Pillar's folder as its own system, in Emerge: its version, its own registry, its CLI (eg run pillar/cli.eg); declared in nexus-self's systems; uses nothing outside pillar/ but the Emerge language"
    proof: "eg run pillar/cli.eg contracts answers; eg check and eg test pass on every pillar/*.eg; no .js in pillar/; test-pillar PI-01 runs them for the Nexus suite"

  PIL2_contracts:
    status: OPEN
    depends_on: [PIL1_pillar_stands]
    spec: pillar/spec/pillar.spec
    blocks: [MOD-PIL-CONTRACTS]
    files: [pillar/contracts/contracts.eg, pillar/contracts/*.eg, pillar/test/contracts.test.eg]
    requires: [node]
    prerequisites: ["the census of the three sets (pillar.spec meta.census)", "Emerge's contract block (CIE-EG MOD-CONTRACT, unblocked by D7 on 2026-11-06) and schema (MOD-STORE, D8) built in the language first: bottom-up (§3.1), the constructs before what is written in them"]
    does: >-
      One contract per primitive, each concept once, each naming where it came from: Constraint, Transition, Observation, Gap, Lens, Seed,
      History, Level, Budget, Field (Emerge); Relation, Identity (ERAVOS); Expectation, Link, Event, Gate (Nexus)
    proof: "validate passes on every contract; a second contract for one meaning is refused (test-pillar)"

  PIL3_conformance:
    status: OPEN
    depends_on: [PIL2_contracts]
    spec: pillar/spec/pillar.spec
    blocks: [MOD-PIL-CONFORMANCE]
    files: [pillar/conformance/conform.eg, pillar/conformance/*.eg, pillar/test/conform.test.eg, tests/modules/test-pillar-conform.test.js]
    requires: [node]
    prerequisites: ["Emerge's core, WARP and SISO readable as they are (no change to them in this phase)"]
    does: "the cases per contract as Emerge data (ordinary, boundary, adversarial, regression, each with provenance) and the judge in .eg; foreign implementations (Emerge's JS core, WARP, SISO) answer the exported cases with their own harness (test-pillar-conform), Pillar judges"
    proof: "Emerge's evaluate conforms to pillar:constraint; History and WARP's Ledger both run against pillar:history, the differences named"

  PIL4_three_identities:
    status: OPEN
    depends_on: [PIL2_contracts]
    spec: pillar/spec/pillar.spec
    blocks: [MOD-PIL-IDENTITY]
    files: [pillar/identity.eg, pillar/test/identity.test.eg]
    requires: [node]
    prerequisites: []
    does: "a primitive in use as three identities: its contract (meaning), its code's hash (implementation, CIE-EG D9), its contract version"
    proof: "two copies with one meaning and different code are told apart; a version bump with the code unchanged is seen"

  PIL5_the_duplicates_census:
    status: OPEN
    depends_on: [PIL3_conformance, PIL4_three_identities]
    spec: pillar/spec/pillar.spec
    blocks: [MOD-PIL-MIGRATION]
    files: [pillar/migration.eg, pillar/test/migration.test.eg]
    requires: [node]
    prerequisites: ["no removal in this phase (§0.3): it reports"]
    does: "siso/ and warp/core's Event, Gate and Stream: every consumer, each copy against the cases, the canonical one named; removal is a later phase"
    proof: "the census names every consumer and each copy's case results"

  PIL6_the_small_model_bench:
    status: OPEN
    depends_on: [PIL3_conformance]
    spec: pillar/spec/pillar.spec
    blocks: [MOD-PIL-BENCH]
    files: [pillar/bench/bench.eg, pillar/bench/tasks/*, pillar/test/bench.test.eg]
    requires: [node, "a local model (Ollama, 3B–7B) on his machine for the real run"]
    prerequisites: ["the contracts and their cases (PIL2, PIL3)"]
    does: "his EAS_D8 bench: the same tasks with and without Pillar's contracts; tests passed, tokens, attempts; the losing cases reported"
    proof: "the runner's own test with a stand-in model; the real numbers from one run on his machine"

order: "PIL1 → PIL2 → (PIL3, PIL4) → PIL5; PIL6 after PIL3. PIL_D2 settled before a server.js is added."
# ── ADDENDUM 2026-11-06 — the field generates code (his) ──
# James, 2026-11-06: "im saying to generate code. using primitives or invariants to define the shape of the field, which would define the possibility
# space, using the dag as the map of primitives, creating the constraint field..." · "Yes, that's why, like, look at the axioms in the docs folder, the 3.1."
# Pillar's contracts are written field-first (Field, Constraint, Transition, History, Observation at the core; Event, Gate, Stream as compounds of them).
# After PIL2 and PIL3: CB1_cfr_build_logic (docs/2026-10-02-emerge-field-memory-build-phasemap.spec, expanded the same day): the field generates the
# code. After Pillar: EM2 (WARP as the field), CF1 (CFR with RFR2), RF1 (the relational field), and SISO's retirement after PIL5's census.

# ADDENDUM 2026-11-06 (0.60.422) — PIL1_pillar_stands BUILT
# James, 2026-11-06: "Emerge first then fiverr maybe? I'm struggling. Emerge is the highest leverage." · "okay lets get this done. no more distractions"
# Built in Emerge: pillar/pillar.eg (version, contracts(), contract(id); check and identity_of answer with the phase that builds them, PIL3, PIL4),
# pillar/registry.eg (Pillar's own registry, §5.16), pillar/cli.eg (version|contracts|contract|check|conform|registry), pillar/test/pillar.test.eg
# (3 tests); declared in lib/nexus-self/systems.js (entry null, per PIL_D2); tests/modules/test-pillar.test.js PI-01..05, 5/5.
# Found and said: an Emerge module is not a map (has/keys refuse it), so GATE-PIL1-002's two-way check runs in PI-02 with Emerge's own parser;
# a public top-level name with no registry entry fails PI-02 (checked by planting one). Names starting with _ are internal.
# Drift, said: the phase graphs (pillar/phases/2026-11-06-pillar/) were written after PIL1's code, not before. PIL2 onward have theirs first.
