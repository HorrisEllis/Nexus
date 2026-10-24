spec:
  meta:
    name:     diagnostic-and-healing-one-system
    version:  1.0.0
    date:     2026-10-24
    release:  "0.60.234 (mapped)"
    uuid:     nexus-diagnostic-healing-one-system-phasemap-v1-0000-2026-1024-jamesbrooks-001
    owner:    "diagnostic (detection and repair, one system) · each system (its own announce and its expected behaviour) · orchestrator (the pulse)"
    voice: "The ideas and the calls are James's. `james:` is his, verbatim. `does:` is the coder's reading, his to correct."
    origin: >-
      James, 2026-10-24: "diagnostic and healing nned to be one system. and a real one. each system is anounced usinfg the heartbeat
      and pulse. also the .spec" · "schemas for expected behavior for the diagnostic tool per system."
      Before: 2026-10-17 "diagnostic and nexus healer should be one system." (0.60.136 moved nexus-healer's code into diagnostic/).
    axioms: "docs/AXIOMS-v3.1.md — §1.2 nothing fails silently, §0.1 evidence over memory, §3.3 map before build, §8.6 reuse before build, §5.2/§9.1 RAID decides a write, §0.3 reversible; docs/CLAUDE.md: backend → route → command → UI"
    reading_of_his_words: >-
      The coder's reading, to confirm: (1) "one system" — detection AND repair run in diagnostic; today the code moved there
      (0.60.136) but the orchestrator still drives the heal loop. (2) "a real one" — a heal counts only when the expectation it broke
      holds again, checked. (3) "each system is announced using the heartbeat and pulse. also the .spec" — every system's announce
      carries its identity: id, port, beat interval AND its .spec (path, version, hash), so diagnostic knows what the system claims
      to be from the announce itself. (4) "schemas for expected behavior … per system" — one schema (diagnostic owns it) for what a
      system is expected to do, and per system an instance that the system owns, in its .spec.

  found_2026_10_24:
    pulse: "orchestrator/lib/pulse.js createPulse — 9 of the 15 start it: cortex, idearium, guardian, orchestrator, intelligence, clear-glass (wire), diagnostic, architect, copilot. Not: versionium (:3754), loom (:3752), ollama-bridge (:3749), which run and do not beat; components, cos and core have no process (lib/nexus-self/systems.js entry null, port null) — cos is the outer shell that starts nexus/autopilot"
    watch: "diagnostic/lib/pulse-watch.js — announce/expect/beat, negative space for a missed beat; fed from orchestrator's /sse (orchestrator.pulse) in diagnostic/nexus-diagnostic.js"
    announce: "carries id, port, intervalMs — no .spec"
    heal: "diagnostic/lib/heal-loop.js (gap → classify → blueprint → architect → forge → versionium snapshot → resolved | escalated) — invoked from orchestrator/orchestrator.js and lib/gap-relay.js, not from diagnostic"
    schemas: "diagnostic/schemas/ holds node-taxonomy schemas (node, system, wire, hook, capability, command, component, healer_proposal) — none for expected behaviour"

  decisions:
    DH0a_expectation_lives_in_the_spec:
      status: "DECIDED by his words (\"also the .spec\") and his axioms (sovereignty: a system owns what it promises): each system's own .spec carries an `expected_behavior:` block; diagnostic owns the schema it must meet (diagnostic/schemas/schema.expected_behavior) and checks every system against its own block"
    DH0b_libraries_are_expected_not_beating:
      status: "DECIDED by his axioms (§0.1 evidence): components, cos and core have no process (systems.js: entry null, port null); they are announced by their .spec through the registry and checked by their tests, never reported as a missed heartbeat"
    DH0c_a_heal_is_proven_by_its_expectation:
      status: "DECIDED by his words (\"a real one\") and §0.1: a heal is closed only when diagnostic re-checks the broken expectation and it holds; otherwise it stays open and says so (§1.2)"

  phases:
    DH1_the_expected_behavior_schema:
      status: OPEN
      depends_on: [DH0a_expectation_lives_in_the_spec]
      files: [diagnostic/schemas/schema.expected_behavior, diagnostic/lib/expectations.js]
      does: >-
        The schema: beat (intervalMs, misses before degraded/dead), port, health (route, method, the shape of a healthy answer, max
        latency), routes that must answer, events it must emit (by the event taxonomy), its spec (path, version) and invariants (a named
        check: a route + an expected shape, or a file that must exist). expectations.js: load a system's block from its .spec, validate it
        against the schema, refuse an invalid one with why.
      proof: "a valid block loads; a block missing beat.intervalMs or naming an unknown event is refused with the field; every field documented in the schema"
    DH2_every_system_states_its_expectations:
      status: OPEN
      depends_on: [DH1_the_expected_behavior_schema, DH0b_libraries_are_expected_not_beating]
      files: [orchestrator/spec/orchestrator.spec, cortex/spec/cortex.spec, guardian/spec/guardian.spec, idearium/spec/idearium.spec, architect/spec/architect.spec, diagnostic/spec/diagnostic.spec, intelligence/spec/intelligence.spec, ollama/spec/ollama.spec, versionium/spec/versionium.spec, copilot/spec/copilot.spec, loom/spec/loom.spec, clear-glass/spec/clear-glass.spec, components/spec/components.spec, cos/spec/cos.spec, lib/spec/core.spec]
      does: >-
        An `expected_behavior:` block in each of the 15 systems' own .spec, written from what the system actually does today (its port,
        its health route's real answer, the events it really emits, read from the code and a live boot) — not from what it should do
        someday. A system whose .spec is missing gets one. The three without a process (components, cos, core) state tests and files, no beat.
      proof: "15 blocks, each valid against the schema; each claim matches the code (route served, event emitted) — the loom 'declared ≠ served' scanners run over them"
    DH3_the_announce_carries_the_spec:
      status: OPEN
      depends_on: [DH2_every_system_states_its_expectations]
      files: [orchestrator/lib/pulse.js, orchestrator/orchestrator.js, diagnostic/lib/pulse-watch.js, versionium/server.js, loom/server.js, ollama/server.js]
      does: >-
        A system's first beat announces { id, port, intervalMs, spec: { path, version, hash } }; the orchestrator relays it on /sse;
        pulse-watch keeps it, and a later beat with a different spec hash is drift, said. The three running systems that do not beat
        (versionium, loom, ollama-bridge) start createPulse. A system that announces no spec is reported, not guessed.
      proof: "a boot of every system announces with its spec; a changed .spec shows as drift on the next beat; a silent system is negative space"
    DH4_diagnose_against_the_expectation:
      status: OPEN
      depends_on: [DH3_the_announce_carries_the_spec]
      files: [diagnostic/lib/expectations.js, diagnostic/lib/pulse-watch.js, diagnostic/nexus-diagnostic.js]
      does: >-
        On announce, on each beat and on a missed beat (event-driven, no polling loop): check the system against its own block — cadence,
        health answer and latency, routes, events seen, invariants. Each deviation is a finding naming the expectation it broke and the
        evidence (the request and the answer), kept in diagnostic's store and emitted (diagnostic.finding).
      proof: "a fake system whose health answer lacks a promised field gives one finding naming that field; a healthy one gives none; a missed beat gives the negative-space finding"
    DH5_diagnostic_heals:
      status: OPEN
      depends_on: [DH4_diagnose_against_the_expectation, DH0c_a_heal_is_proven_by_its_expectation]
      files: [diagnostic/lib/heal-loop.js, diagnostic/nexus-diagnostic.js, orchestrator/orchestrator.js, lib/gap-relay.js]
      does: >-
        A finding goes to heal-loop inside diagnostic (one system): classify → propose the fix → RAID decides (§5.2) → applied as a
        staged, undoable change (Versionium snapshot first) → diagnostic re-checks the broken expectation; closed only when it holds,
        else rolled back and escalated with why. The orchestrator's and gap-relay's heal calls become a route call to diagnostic.
      proof: "a finding on a fake system: proposal, RAID approval, the fix, the re-check passes, closed; a fix that does not restore the expectation is rolled back and escalated"
    DH6_seen_and_used:
      status: OPEN
      depends_on: [DH5_diagnostic_heals]
      files: [diagnostic/server.js, idearium/cli/route-commands.js, idearium/ui/desktop.html, lib/agent-tools/tools/diagnostic]
      does: "Routes and rows `diag systems` (each system: announced, its spec, its expectations, what holds and what does not), `diag findings`, `diag heals`; the agent tool reaches the same; a panel: one row per system, green only when every expectation holds."
      proof: "the panel, driven in Clear Glass, shows a fake system's broken expectation and its heal"

  build_order: "DH1 → DH2 → DH3 → DH4 → DH5 → DH6. Each lands backend → route → command → UI where it has a surface."
