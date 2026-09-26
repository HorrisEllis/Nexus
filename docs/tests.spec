spec:
  meta:
    name:     tests
    version:  1.1.0   # 2026-09-25 (0.39.236): test_data_isolation added
    uuid:     nexus-tests-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      The test suite. Three layers:
      brutal.test.js — system-level invariant checks (187 tests)
      modules/run-all.js — module unit tests (278 tests)
      Phase-specific tests — one file per built phase
      All passing before any zip is released.

  test_suites:

    - id: brutal
      path: "tests/brutal.test.js"
      lines: 1365
      count: 187
      status: "187/187 PASSING"
      description: >
        System-level invariant tests. Named "brutal" because they
        test the axioms, not the happy paths. Tests include:
        §1.1 nothing trusted — all inputs validated at boundaries
        §1.2 nothing silent — errors are events, not swallowed
        §2.1 disk before behavior — JAA writes precede state changes
        §5.1 UUID + hook — every entity has UUID and hook contracts
        Circuit breaker states, causal chain integrity,
        escalation friction monotonicity, component registry constraints.
      run: "node tests/brutal.test.js"

    - id: modules
      path: "tests/modules/"
      runner: "tests/modules/run-all.js"
      count: 278
      status: "278/278 PASSING"
      files:
        - "test-boot-sequence.js"
        - "test-jaa-db.js"
        - "test-vector-memory.js"
        - "test-chat-logger.js"
        - "test-escalation.js"
        - "test-component-registry.js  — 16 tests (Phase 1)"
        - "test-ui-registry.js         — 12 tests (Phase 2)"
        - "test-raid.js"
        - "test-diagnostic-engines.js"
        - "test-liminal.js"
        - "test-bda.js"
      run: "node tests/modules/run-all.js"

    - id: integration
      path: "tests/integration/"
      count: 77
      status: "SKIPPING — requires npm run start:all first"
      description: >
        End-to-end tests. Require all 8 services running.
        Run after: npm run start:all
        Then: npm run test:int
        Tests the full system contract-to-contract.

  test_conventions:
    - "Every new module gets tests before code is merged"
    - "Brutal tests are updated when new axioms are added"
    - "Phase tests (test-component-registry.js etc) live alongside their build"
    - "Architecture tests (T-016 style) verify the seam, not just the unit"
    - "Tests never use stubs in production paths (§1.3)"
    - "All test files run in under 5s (no async timers that block exit)"
    - "A test never writes real data. It does not have to do anything for this: lib/test-sandbox.js gives every test process its own root (see test_data_isolation)"

  test_data_isolation:
    added: "2026-09-25, v0.39.236"
    why: >
      James: "the tests need to stop in idearium. they keep generating."
      Isolation used to be opt-in per test and most tests never opted in.
      Leaked specs were adopted as real repos at the next boot, built, and
      sent to ChatGPT as repo-agent jobs. Third cleanup of the same class.
    rule: >
      A process whose entry script is under tests/ or a test/ directory, is
      named *.test.js|.mjs|.cjs, or was marked by a runner (NEXUS_TEST_SANDBOX,
      NEXUS_TEST_RUN_DEPTH) is a test process. The first store it touches calls
      lib/test-sandbox.js ensure(), which makes ONE temp root and points every
      store's own override at it -- only where the test has not chosen a path.
    stores:
      IDEARIUM_DATA_DIR: "idearium/lib/data-dir.cjs -- the only resolver for idearium's data (specs, nodes, projects, drop, warp cache)"
      JAA_DATA_DIR:      "cortex/memory/jaa-db.js -- cortex's shared store (idearium_* tables, repo_* tables, everything else)"
      COS_DATA_ROOT:     "cos/foundation/constants.js -- COMPARTMENT OS root (new override; had none)"
      NEXUS_INJECT_DIR:  "lib/repo-inject.js -- .inject nodes"
      NEXUS_DATA_ROOT:   "lib/ledger-writer.js, intelligence/alk, idearium's event ledger (data/idearium/)"
    runners: >
      tests/modules/run-all.js, autopilot's post-boot vitals check and
      /tests run, and scripts/precommit-check.js's require() probe each give a
      child its own root via childEnv(), so anything the child spawns before
      touching a store is covered too.
    spawning_tests: >
      A test that starts a NEXUS process (idearium/api, guardian/server, ...)
      calls ensure() first so the child inherits the root. Enforced by
      tests/modules/test-test-sandbox.test.js.
    reading_live_data: >
      A test whose point is reading what the live store holds calls
      seedFromReal(key): it reads a copy; the real store is only read.
    not_covered: >
      Stores with their own hardcoded paths and no override: guardian
      data/guardian/ledger and code-artifacts, versionium data/versionium,
      intelligence/data/nodes, copilot person-model ledgers, per-system
      component_ledger files. Same fix shape; not done in 0.39.236.
    cleanup_of_what_already_leaked: "node cli/clear-idearium.js (dry run), then --apply with NEXUS stopped"

  architecture_tests:
    description: >
      Tests that verify the seam, not just individual units.
      If the architecture test passes, the system property holds.
    examples:
      - "T-016: Liminal registers 4 components. Grammar updates. Zero shell code touched."
      - "Hotswap test: replace nexus-shell.html, system continues, new UI bootstraps."
      - "Restart test: orchestrator restarts, components reload from JAA, grammar rebuilds."
