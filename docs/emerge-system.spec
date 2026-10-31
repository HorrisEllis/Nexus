spec:

  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # docs/emerge-system.spec — Emerge as a sovereign Nexus system: the genesis skeleton (config → server.js → the registry →
  # components → UI) laid out in the Emerge repo, its language served through its own door, placed in Nexus at the top level
  # as emerge/, every caller of lib/emerge switched to that door, and nesting (a module is a system) proven at the depth a
  # large project needs. Format: emerge's module spec (kg-builder, specDepth 1.0, no BLACK). Phases:
  # docs/2026-10-31-emerge-as-a-system-phasemap.spec.
  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        emerge-system
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-31T00:00:00Z
    status:      specced
    uuid:        nexus-emerge-system-spec-v1-0000-2026-1031-jamesbrooks-001
    origin: >-
      James, 2026-10-31: "look at genesis. emerge needs either to be a module for idearium, or a system with a server.js, etc. look at the
      genesis and architecture spec in idearium. needs to be one" · on the coder's answer (a system, by §5.15): "okay. do it as long as it
      gets up closer to building large projects, like i want to be buyilding an operating systems". Earlier, on record: "emerge will be
      replacing nexus" (MG_D8, 2026-10-30) · "i just want to speed this up, so i can start coding with it, and use it for neuxs"
      (Emerge HANDOFF.md, 2026-10-31). The direction and the two options are his; the choice between them was made by his axioms (EAS_D0).
    purpose: >-
      Emerge is the language he codes Nexus in and the compiler under Idearium, Guardian, Copilot and Cortex. Today it is two copies
      (the Emerge repo and lib/emerge, 21 files apart on 2026-10-05) and neither has a door: callers require its files. As a system in
      genesis's shape it owns its state, serves its language over one contract, and can lay out modules that are systems themselves, so a
      project the size of an operating system is built as a tree of sovereign systems, each with its own door, tests and spec.
    target_runtime: [node]
    language_stack: [javascript, emerge]
    paradigm: [reuse-before-build, one-door-per-system, registry-is-the-contract, a-module-is-a-system, move-then-archive]
    axioms: ["§5.9–§5.15 sovereignty", "§5.6 structural self-similarity", "§3.1 bottom-up", "§0.3 nothing lost", "§8.6 reuse before build", "§10.3 one truth", "§1.2 nothing fails silently"]
    deps: []

    census: >-
      Read 2026-10-31. The Emerge repo (HorrisEllis/Emerge, 1.12.0) holds emerge/: the language (lang/, eg.js, 1.12.0), the spec compiler
      (compiler/), the older IDE server (emerge-ide.js, :4242, its registry in registry-components.js and its contract in
      interaction-contract.json), the compiler's event list (event-taxonomy.js) and schemas/ (seven YAML envelopes, five of them Loom record
      shapes read by lang/components.js). Of genesis 1.5.0's 71 skeleton files for "emerge" (lib/file-tree-plan.js fromCosTemplate
      'cos-archetype:nexus-system'), 13 share a path with an existing file: config.js, package.json, registry-components.js,
      interaction-contract.json, event-taxonomy.js, schemas/index.js, schemas/schema.{capability,command,component,hook,wire},
      spec/emerge.spec, output/.gitkeep. In Nexus, lib/emerge is required by 25 files outside it (guardian/server.js t2-gate,
      idearium/compiler-bridge.js, copilot/module-builder.js, cortex/core/raid/contract-intake.js, lib/hooks/emerge.hooks.js and others).

    constraints:
      - id: EAS-001
        description: "Laying out the skeleton breaks nothing in Emerge: every existing test suite (npm test, npm run test:lang, docs/learn/verify.js, bench/chunks.js derive) stays green."
        type: hard
        enforced_by: [GATE-EAS-GREEN]
      - id: EAS-002
        description: "A file the skeleton shares a path with is merged or moved with a pointer, never overwritten: two contracts under one name are surfaced and given two names (§10.3)."
        type: hard
        enforced_by: [GATE-EAS-NO-OVERWRITE]
      - id: EAS-003
        description: "Other systems reach Emerge through its door (its routes and contract) or a locked snapshot of its files at a commit; never through a live copy that can drift (§5.15, §10.3)."
        type: hard
        enforced_by: [GATE-EAS-ONE-EMERGE]
      - id: EAS-004
        description: "The skeleton is laid out by lib/file-tree-plan.js fromCosTemplate, never hand-copied, so it stays the genesis shape."
        type: hard
        enforced_by: [GATE-EAS-FROM-ARCHETYPE]

  schemas:

    - id: LangRequest
      name: LangRequest
      description: "What a caller sends to one of Emerge's language routes."
      fields:
        source:   "string — Emerge source text (check, run, test, build)"
        args:     "[string] — program arguments (run)"
        sentence: "string — his words (say)"
        units:    "[{ id, signature, derive }] — derive blocks (synth)"
        timeoutMs: "number — optional, capped by emerge.config.json lang.timeoutMs"
      behavioral_contracts: ["the source is written to a fresh work folder; nothing outside it is read or written"]
      error_paths: ["no source, sentence or units for the route → 400 with the field named"]

    - id: LangResult
      name: LangResult
      description: "What every language route answers."
      fields:
        ok:       "boolean — the eg command exited 0"
        code:     "number — its exit code"
        stdout:   "string"
        stderr:   "string"
        files:    "{ path: content } — what it wrote (build, say, synth)"
        ms:       "number"
        timedOut: "boolean"
      behavioral_contracts: ["the same request gives the same answer, apart from ms (the eg command is deterministic)"]
      error_paths: ["timed out → ok false, timedOut true, the child killed"]

    - id: EmergePlacement
      name: EmergePlacement
      description: "How Nexus holds Emerge: one snapshot at a commit, at the top level."
      fields:
        dir:      "string — emerge/ at Nexus's root"
        repo:     "string — HorrisEllis/Emerge"
        commit:   "string — the full sha the snapshot is taken from"
        hashes:   "{ path: sha256 } — every file, in emerge/EMERGE.lock.json"
      behavioral_contracts: ["a one-byte edit inside the snapshot fails the lock check"]
      error_paths: ["the lock missing or stale → the check names the file"]

  interfaces:

    - id: IF-GENESIS-ARCHETYPE
      name: genesis-archetype
      path: cos/archetype/nexus-system.js
      description: "Genesis 1.5.0's system skeleton, assembled from cos/archetype/nexus-system/, its components and the system template's schemas."
      exports: ["files() — every skeleton file with {{placeholders}}", "laid out by lib/file-tree-plan.js fromCosTemplate('cos-archetype:nexus-system', { name })"]
      behavioral_contracts: ["the same skeleton every system has (guardian, diagnostic); tests/skeleton.test.js proves it alive"]
      error_paths: ["js-yaml missing → the template schemas are skipped; the layout must say so (the coder found this silent, 2026-10-31)"]

    - id: IF-EG-CLI
      name: eg-cli
      path: Emerge:emerge/lang/eg.js
      description: "The Emerge command line: run, test, check, build, say, and the rest; deterministic."
      exports: ["eg check|run|test|build <file.eg>", "eg say \"<sentence>\" [folder]", "eg run lang/cie/synth.eg <units.json> <out-dir>"]
      behavioral_contracts: ["exit 0 on success; errors on stderr with line and column"]
      error_paths: ["a program that never ends → only a caller's timeout stops it"]

    - id: IF-LIB-EMERGE
      name: lib-emerge
      path: lib/emerge
      description: "Nexus's own copy of Emerge, moved into lib/ 2026-10-24 (RF2); drifted from the Emerge repo."
      exports: ["compiler/index.js compile", "compiler/t2-gate", "compiler/kg-builder.js build", "compiler/phase-specs.js"]
      behavioral_contracts: ["required by 25 files outside it today"]
      error_paths: ["archived after the switch (EAS-003); a caller left behind fails loudly at require"]

  modules:

    - id: MOD-EAS-SKELETON
      name: emerge-skeleton
      uuid: nexus-emerge-system-skeleton-v1-0000-2026-1031-001
      path: Emerge:emerge/server.js
      phase: EAS1_the_skeleton_in_emerge
      description: >-
        Genesis's skeleton laid out in the Emerge repo's emerge/ from the archetype (58 new files), with the 13 shared paths merged:
        config.js loads emerge.config.json and keeps the IDE's DEFAULT_PORT and BUS_LOG_MAX; package.json keeps the compiler's scripts and
        adds start, cli and test:system; the IDE's registry and contract move to ide-registry.js and ide-contract.json (emerge-ide.js
        repointed); the compiler's event list moves to events-compiler.js and the skeleton's event-taxonomy.js declares it; the five Loom
        record schemas and schema.node and schema.system move to schemas/records/ (lang/components.js repointed) and the skeleton's node
        schemas take schemas/; spec/emerge.spec 1.1.0 is archived to spec/_archive/ and the skeleton's living spec takes its place.
      deps: [{ name: genesis-archetype }]
      schema_refs: [EmergePlacement]
      exports: ["node emerge/server.js — GET /health, GET /contract, GET /nodes/:type[/:id], POST /handoff", "node emerge/cli.js <command>", "emerge/compartment.json"]
      gate_pipeline: ["GATE-EAS1-001: tests/skeleton.test.js passes in Emerge", "GATE-EAS1-002: every existing Emerge suite green"]
      behavioral_contracts: ["the door's port is emerge.config.json's (4900); the IDE keeps 4242"]
      error_paths: ["a shared path not in the merge list → the layout stops and names it"]
      acceptance: ["skeleton test green in emerge/; npm test, npm run test:lang, docs/learn/verify.js and bench/chunks.js derive unchanged"]

    - id: MOD-EAS-BOUNDARY-TEXT
      name: boundary-reads-code-not-text
      uuid: nexus-emerge-system-boundary-text-v1-0000-2026-1031-001
      path: cos/archetype/nexus-system/lib/boundary.js
      phase: EAS1a_the_boundary_reads_code_not_text
      description: >-
        Genesis's sovereignty check (lib/boundary.js outside()) matched require('../x') inside template strings, so a code generator's
        output text was reported as the system leaving its folder (found laying Emerge out: emerge-codegen-v2.js writes
        "require('../siso')" into the files it generates). The check now blanks template-literal text (not its ${...} expressions)
        and comments before matching. Fixed in the archetype, so every system laid out after it has it; Emerge's copy is laid out from it.
      deps: [{ name: genesis-archetype }]
      schema_refs: [EmergePlacement]
      exports: ["outside(root) → [{ file, requires }] — unchanged shape", "codeOnly(src) — the source with template text and comments blanked, same length"]
      gate_pipeline: ["GATE-EAS1a-001: a require inside a template string is not reported", "GATE-EAS1a-002: a real require that leaves the folder still is, also inside a template's ${...}"]
      behavioral_contracts: ["blanking keeps every offset and newline, so positions stay the real ones"]
      error_paths: ["an unterminated template or comment → that file is scanned raw, so nothing is hidden"]
      acceptance: ["the archetype's tests/skeleton.test.js green; Emerge's skeleton test green with emerge-codegen-v2.js present"]

    - id: MOD-EAS-LANG-DOOR
      name: emerge-lang-door
      uuid: nexus-emerge-system-lang-door-v1-0000-2026-1031-001
      path: Emerge:emerge/lib/lang.js
      phase: EAS2_the_language_through_the_door
      description: >-
        Component emerge.lang (file lib/lang.js), capability emerge.lang.code, with a command, a route and an event node each for check,
        run, test, build, say and synth (POST /lang/check, /lang/run, /lang/test, /lang/build, /lang/say, /lang/synth). Each handler writes
        the request into a fresh work folder and runs the eg command line there in a child process with a timeout (reuse: the exact,
        tested CLI), answering a LangResult.
      deps: [{ name: emerge-skeleton }, { name: eg-cli }]
      schema_refs: [LangRequest, LangResult]
      exports: ["check(args), run(args), test(args), build(args), say(args), synth(args) → LangResult", "the six route nodes in GET /contract"]
      gate_pipeline: ["GATE-EAS2-001: each route answers through the door in a test", "GATE-EAS2-002: synth through the door gives the same code hashes as bench/chunks.js derive"]
      behavioral_contracts: ["no model is called; the same request gives the same files"]
      error_paths: ["the child exceeds its timeout → killed, timedOut true", "a missing field → 400 naming it"]
      acceptance: ["tests/lang-door.test.js green: check finds an error with its line, build returns JS, synth reproduces utf8_decode's six code hashes"]

    - id: MOD-EAS-NEXUS-PLACE
      name: emerge-in-nexus
      uuid: nexus-emerge-system-place-v1-0000-2026-1031-001
      path: emerge/EMERGE.lock.json
      phase: EAS3_emerge_at_the_top_of_nexus
      description: >-
        Nexus holds Emerge as a top-level system, emerge/, a snapshot of the Emerge repo's emerge/ at one commit with every file's hash in
        EMERGE.lock.json, checked by scripts/emerge-lock.js. Supersedes foundation-up F2's cos/vendor placement, which would have made COS
        Emerge's owner (§5.15 rule 2). Registered as a system: lib/nexus-self/systems.js, the boot plan, Loom (with its wires), the
        boundary census.
      deps: [{ name: emerge-skeleton }]
      schema_refs: [EmergePlacement]
      exports: ["emerge/ (snapshot)", "emerge/EMERGE.lock.json", "node scripts/emerge-lock.js [--write]"]
      gate_pipeline: ["GATE-EAS3-001: the lock check passes; a one-byte edit fails it", "GATE-EAS3-002: Emerge's door boots from emerge/ in Nexus"]
      behavioral_contracts: ["the Emerge repo is the one source; the snapshot changes only by a new lock"]
      error_paths: ["lock stale → refused, the files named"]
      acceptance: ["emerge-lock check green; GET :4900/health from Nexus's emerge/"]

    - id: MOD-EAS-CALLERS
      name: lib-emerge-callers-switched
      uuid: nexus-emerge-system-callers-v1-0000-2026-1031-001
      path: lib/emerge
      phase: EAS4_callers_through_the_door
      description: >-
        Every caller of lib/emerge switched: run-time callers (guardian's t2-gate, idearium's compiler-bridge, copilot's module-builder,
        cortex's contract-intake, lib/hooks/emerge.hooks.js) to Emerge's door or its handoff; build-time scripts and tests (kg-builder,
        phase-specs, the spec tests) to the emerge/ snapshot. Then lib/emerge goes to _archive/lib/emerge with a pointer (§0.3).
      deps: [{ name: emerge-in-nexus }, { name: emerge-lang-door }, { name: lib-emerge }]
      schema_refs: [LangRequest, LangResult]
      exports: ["nothing requires lib/emerge", "_archive/lib/emerge with POINTER.md"]
      gate_pipeline: ["GATE-EAS4-001: grep finds no require of lib/emerge", "GATE-EAS4-002: the full module suite green"]
      behavioral_contracts: ["a caller whose answer changes is stopped and the difference named before the switch"]
      error_paths: ["Emerge's door down → the run-time caller says so (§1.2), never falls back to a copy"]
      acceptance: ["tests/modules/run-all.js green with lib/emerge archived"]

    - id: MOD-EAS-NESTING
      name: emerge-nesting-at-depth
      uuid: nexus-emerge-system-nesting-v1-0000-2026-1031-001
      path: Emerge:emerge/tests/nesting.test.js
      phase: EAS5_a_system_of_systems
      description: >-
        What building an operating system needs from Emerge: a project laid out as a tree of systems (lib/modules.js, "a module is a
        system"), three levels deep, each module with its own door, its code written in Emerge and built through the parent's
        /lang/build, and work handed between siblings as verified files (lib/handoff.js). The test is the shape of a large project, small.
      deps: [{ name: emerge-skeleton }, { name: emerge-lang-door }]
      schema_refs: [LangResult]
      exports: ["tests/nesting.test.js", "POST /modules/new (the skeleton's module.new route) used three levels down"]
      gate_pipeline: ["GATE-EAS5-001: three levels laid out, each boots and answers /health", "GATE-EAS5-002: a handoff between two siblings reaches done/ with its receipt"]
      behavioral_contracts: ["each level is the same skeleton (§5.6); no level reaches into another's files"]
      error_paths: ["a level fails to boot → its path and error named; its parent keeps running (§5.15 rule 3)"]
      acceptance: ["nesting.test.js green: 3 levels, an Emerge program built at the deepest, a sibling handoff done"]

  events:
    emerge:
      - "emerge.lang.checked { ok, ms }"
      - "emerge.lang.ran { ok, code, ms }"
      - "emerge.lang.tested { ok, ms }"
      - "emerge.lang.built { ok, files, ms }"
      - "emerge.lang.said { ok, files, ms }"
      - "emerge.lang.synthesized { ok, files, ms }"

  enforcement:
    gates:
      - { id: GATE-EAS-GREEN, name: emerge-suites-green, severity: fatal, check: "npm test, npm run test:lang, docs/learn/verify.js, bench/chunks.js derive and tests/skeleton.test.js all exit 0", on_failure: "the phase is not done" }
      - { id: GATE-EAS-NO-OVERWRITE, name: merge-not-overwrite, severity: fatal, check: "every shared path is in the merge list with where its old content went", on_failure: "the layout stops" }
      - { id: GATE-EAS-ONE-EMERGE, name: one-emerge, severity: error, check: "no require of lib/emerge after EAS4; the snapshot matches its lock", on_failure: "named by file" }
      - { id: GATE-EAS-FROM-ARCHETYPE, name: from-the-archetype, severity: error, check: "the skeleton files equal fromCosTemplate's output, apart from the merged paths", on_failure: "the difference is listed" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node"
    - "per module: its acceptance lines"
