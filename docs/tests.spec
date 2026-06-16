spec:
  meta:
    name:     tests
    version:  1.0.0
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

  architecture_tests:
    description: >
      Tests that verify the seam, not just individual units.
      If the architecture test passes, the system property holds.
    examples:
      - "T-016: Liminal registers 4 components. Grammar updates. Zero shell code touched."
      - "Hotswap test: replace nexus-shell.html, system continues, new UI bootstraps."
      - "Restart test: orchestrator restarts, components reload from JAA, grammar rebuilds."
