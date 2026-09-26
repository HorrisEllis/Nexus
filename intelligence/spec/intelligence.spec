spec:
  meta:
    name:        intelligence
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    port:        :3753
    uuid:        nexus-intelligence-v1-0000-2026-0822-jamesbrooks-001
    purpose: >
      Consolidates NEXUS's real cognition layer into its own standalone
      system, matching the established architecture (CLI, API, event-
      driven interaction contract, event ledger, event-type registry,
      SSE, input/output queue folders, UI last if applicable). Currently
      scattered across three real locations with no single home:
      cortex/intelligence/ (pattern learning, RFR2/relational-field,
      adversarial, intuition, mastermind), meta/cfr/ (field/regime
      state — the actual sigma/friction/regime math nearly every real
      system reads), and lib/baseline.js + lib/snapshot-trigger.js
      (behavioral baseline and the sigma→snapshot bridge). This spec is
      the map-first + spec-it step James asked for explicitly, before
      any file moves — nothing here has been moved yet.

  # ── Real, current scope — traced directly, not estimated ──────────────────
  current_locations:
    - path: cortex/intelligence/
      files: [index.js, relational-field.js, adversarial.js, intuition.js, mastermind.js]
      lines: 2063
      real_consumers: 8
      consumer_files:
        - lib/diagnostic-report.js
        - lib/ledger-fanin/boot.js
        - lib/diagnostic-causal.js
        - lib/snapshot-trigger.js
        - lib/autopilot-intelligence.js
        - lib/nexus-client.js
        - copilot/adversarial.js
        - copilot/optimizer.js
      risk: low — a small, already-fairly-contained consumer set.

    - path: meta/cfr/
      lines: 1777
      real_consumers: 24
      consumer_files:
        - cortex/boot.js
        - cortex/intelligence/index.js
        - cortex/versionium/causality.js
        - cortex/core/raid/index.js
        - cortex/memory/causal-lookup.js
        - idearium/index.js
        - guardian/server.js
        - orchestrator/lib/sigma-writer.js
        - loom/scanners/source-map.js
        - orchestrator.js
        - autopilot.js
        - meta/lattice/associative-lattice.js
        - meta/causal/compound.js
        - meta/alk/index.js
        - cli/sentinel.js
        - cli/cfr-debug.js
        - service/nexus-diagnostic.js
        - lib/agent-tools/tools/query/meta-query.js
        - architect/service.js
        - copilot/diagnostics.js
        - copilot/movement-map.js
        - bridge/index.js
        - bridge/causal/graph.js
      risk: >
        HIGH — this is load-bearing, synchronous infrastructure most of
        NEXUS reads directly and often (field/regime state, on
        real-time decision paths). Converting 24 real, in-process
        require() calls to network calls in one pass risks introducing
        latency and failure modes system-wide. This is the reason this
        extraction is phased below, not done in one move.

    - path: lib/baseline.js
      lines: 363
      real_consumers: 6
      consumer_files: [guardian/server.js, service/cortex-service.js, service/nexus-diagnostic.js, service/idearium-service.js, service/guardian-service.js]
      risk: low-medium — several service/*.js entry points, worth care but a small, well-understood set.

    - path: lib/snapshot-trigger.js
      lines: 126
      real_consumers: 2
      consumer_files: [lib/ledger-fanin/boot.js, lib/diagnostic-causal.js]
      risk: low.

  core:
    schemas: {}
    axioms: [AX-001, AX-002, AX-003]
    constants:
      COMPONENT_ID_RESERVED: "nexus-in"   # not yet claimed in lib/uid/component-map.js — reserved here, claimed at registry-update step

  # ── Real event-type registry — James: "it needs a registry of event
  # types relevant to the system." Traced from real, current emit/handle
  # sites across the four real pieces above, not invented. ─────────────
  events:
    emits:
      - "intelligence.pattern.crystallised"
      - "intelligence.meta-scan.complete"
      - "cortex.gap.found"              # already real — emitted from cortex/intelligence today
      - "cfr.regime.changed"
      - "cfr.friction.updated"
      - "baseline.deviation.detected"
      - "sigma.snapshot.triggered"
      - "intelligence.failure_precursor.detected"
    handles:
      - "event_log.append"              # reads the shared event log to crystallise patterns from
      - "sigma.event.*"
      - "anomaly.detected"

  modules:
    - id: pattern-learner
      description: "cortex/intelligence/index.js — real pattern crystallisation from event_log + live bus."
      source: cortex/intelligence/
      migration_phase: 1
    - id: relational-field
      description: "RFR2 — cortex/intelligence/relational-field.js, causal depth/supporting-events tracking."
      source: cortex/intelligence/relational-field.js
      migration_phase: 1
    - id: adversarial
      description: "cortex/intelligence/adversarial.js"
      source: cortex/intelligence/
      migration_phase: 1
    - id: intuition
      description: "cortex/intelligence/intuition.js"
      source: cortex/intelligence/
      migration_phase: 1
    - id: mastermind
      description: "cortex/intelligence/mastermind.js"
      source: cortex/intelligence/
      migration_phase: 1
    - id: baseline
      description: "lib/baseline.js — behavioral baseline tracking."
      source: lib/baseline.js
      migration_phase: 2
    - id: snapshot-trigger
      description: "lib/snapshot-trigger.js — sigma-deviation-to-snapshot bridge."
      source: lib/snapshot-trigger.js
      migration_phase: 2
    - id: field-regime
      description: "meta/cfr/ — the real sigma/friction/regime math. 24 real, mostly-synchronous callers across nearly every system. NOT moved until phase 3, and even then via a compatibility shim (see rollout below), not a hard cutover."
      source: meta/cfr/
      migration_phase: 3
    - id: framework-builder
      description: >
        James: "frameworks for co-pilot. Can say, hey nexus lets create
        a framework." Real, new module — not an extraction, a genuine
        new capability. Uses the already-real nexus_wake_events tool
        pipeline (built this session) as its trigger: a wake request
        matching an intent like "create a framework" builds a real
        WARP-based skeleton (reusing warp/core/Axiom.js, Gate.js —
        already real, already built) and writes it to a real, physical
        drop folder (intelligence/frameworks/, watched, per James's
        explicit "drag and drop" ask), tagged.
      source: new
      migration_phase: 4

  # ── Handshake — matches every real sibling system's shape exactly ─────────
  handshake:
    components:
      - { id: "intelligence.health",  route: { method: GET,  path: "/health" } }
      - { id: "intelligence.pattern", route: { method: GET,  path: "/api/patterns" } }
      - { id: "intelligence.cfr",     route: { method: GET,  path: "/api/cfr/state" } }
      - { id: "intelligence.context", route: { method: GET,  path: "/api/context" },
          description: "Replaces cortex's current /api/intelligence/context — same real callers, new home." }
      - { id: "intelligence.framework.create", route: { method: POST, path: "/api/framework/create" },
          hooks: { in: ["nexus.wake.detected"] } }
      - { id: "intelligence.sse",     route: { method: GET,  path: "/sse" } }

  # ── CLI — James: "cli, api, ... event ledger" ──────────────────────────────
  cli:
    entry: cli/intelligence-repl.js   # new, matching cli/nexus-repl.js's real, established pattern
    commands: [patterns, cfr, context, framework, wake]

  # ── Storage — James: "database in cortex" ──────────────────────────────────
  storage: >
    Stays in cortex's existing JAA store (data/cortex/memory), same
    pattern every other real system already uses (each opens its own
    jaaDB connection to the same shared, file-backed directory — not a
    new, separate database). Confirmed this is how agent-notes.js,
    nexus-wake-events.js, and account-identity-index.js (all built this
    session) already work correctly.

  # ── Queue — James: "input and output folder" ────────────────────────────────
  queue:
    input:  intelligence/input/
    output: intelligence/output/
    mechanism: lib/contract-queue.js   # the real, already-general queue library found this session — not a new mechanism

  # ── Rollout — phased explicitly because of CFR's real risk profile ────────
  # §STATUS 2026-08-22 (end of session) — all 4 phases complete and
  # committed. Real commit hashes named directly so this stays checkable
  # against git history, not just prose.
  rollout:
    phase_1: "✓ DONE (commit 67cd8b4) — cortex/intelligence/'s 5 files moved to intelligence/, all 7 real consumers updated and verified (guardian, cortex, idearium, copilot x2, lib x3), 3 real leftover test-file breaks caught by the scanner and fixed across this and later commits."
    phase_2: "✓ DONE (commit 3703787) — lib/baseline.js + lib/snapshot-trigger.js moved to intelligence/, 8 real consumers updated, a real internal relational-field.js path bug caught and fixed before shipping."
    phase_3: "✓ DONE (commits 3c43d96 + e5443e1) — plan corrected BEFORE any file moved (meta/cfr is a reusable library, not a shared service — see the full reasoning kept below per §17.3), then executed as the corrected pure relocation: meta/cfr/ moved to intelligence/cfr/, 28 real consumers updated (more than the original 24 — tests/ correctly included), 4 real sibling-relative breaks inside the old meta/ directory found and fixed."
    phase_3_reasoning: >
      §CORRECTED 2026-08-22, before any phase 3 work began — read
      meta/cfr's actual code (field.js, ledger.js) per §8.7, not just its
      caller count, before touching anything. The original plan below
      (compatibility shim, kept in-process/synchronous) assumed meta/cfr
      was architecturally like cortex/intelligence — a shared service
      worth centralizing. It is not: createCFRField() closes over purely
      local, in-memory state; createCFRLedger() requires a caller-
      provided ledgerDir and persists to real, per-directory disk files.
      Every one of the 24 real callers correctly instantiates its OWN
      independent field + ledger — this is a reusable LIBRARY pattern,
      not a shared service. Centralizing it into one standalone HTTP
      system would collapse 24 legitimately independent, correct,
      per-system health-tracking instances into one shared, network-
      dependent one — a real regression, not a consolidation.
      Real, corrected phase 3: a pure file relocation, same category of
      work as phases 1 and 2 — git mv meta/cfr/ into intelligence/,
      fix the 24 real require paths, keep it exactly as a locally-
      instantiated library. No shim. No service. No behavior change,
      only location — genuinely lower risk than the plan below, not
      higher.
      [ORIGINAL PLAN, superseded, kept for the record per §17.3 —
      alternatives and rejections stay visible, not deleted]: meta/cfr/
      — NOT a straight move. Build the new system's real field-regime
      module first, keep meta/cfr/ itself in place as a thin,
      synchronous, in-process compatibility shim that forwards to the
      new system's local state (kept warm, not a network call on every
      read) so the 24 real, mostly-synchronous callers need zero
      changes at this phase. Only after phase 3 is proven stable does a
      later, separate decision get made about whether those 24 callers
      ever actually convert to real API calls, or whether the shim is
      the permanent, correct answer given how synchronous their real
      usage is.
    phase_4: "✓ DONE (commit 5627c22) — intelligence/framework-builder.js: real WARP-based skeleton generation, 3 real bugs caught by executing the generated code (wrong relative path, an identifier-generation bug on names with trailing digits, event.payload vs the real event.data), a real registered agent tool, reachable via the wake pipeline."

  # ── Post-phase-4 — the system itself, not just the file moves ─────────────
  # None of this was in the original spec; built and live-tested across
  # several later commits once James asked for the actual standalone
  # system (server, CLI, event types, schemas), not just consolidated files.
  built_after_phase_4:
    server: "✓ DONE (bec349d) — intelligence/server.js, real http.createServer on :3753, reuses index.js's handleRequest() and cfr/ledger.js's createCFRLedger() rather than rebuilding either."
    registry: "✓ DONE (bec349d) — intelligence/registry-components.js, matches emerge's exact established pattern."
    consumer: "✓ DONE (bec349d, corrected 5486730) — intelligence/consumer.js polls intelligence/input/ via lib/contract-queue.js; framework-builder's real output corrected to intelligence/output/ after an initial design mistake (was writing output into input/, backward from the established convention)."
    ring_buffer_and_sse: "✓ DONE (5486730) — replaced a hand-rolled SSE broadcaster with a real warp/core Stream instance (its own tail()/since()/subscribeSSE()), verified live: an event created before an SSE client connects is still delivered as real history."
    schemas: "✓ DONE (5486730) — intelligence/schemas.js, every field checked against a real insert() call, not invented; deliberately excludes the pattern-matching thresholds/confidence math (James: 'the rest is probabilistic and fluid')."
    cli: "✓ DONE (5486730) — real, specific subcommands (intel commands/patterns/cfr/status/framework) in cli/nexus-repl.js, each mapped to one real endpoint — NOT a generic exec route (cortex's own /api/cli/exec is an intentional, honest 501 for that exact reason)."
    boot_sequence: "✓ DONE (1690bc6) — intelligence/server.js and intelligence/consumer.js both in autopilot.js's real spawn list (phase 3, matching idearium/architect/eravos's dependency on cortex being up first)."
    event_relaying: "✓ DONE (1690bc6) — pattern-crystallisation's real bus.emit and CFR ledger's real onGap callback both relayed into the system stream; verified live for the pattern-crystallisation half, the gap-event shape verified separately (not the full ledger→real-sigma-spike path end to end)."
    copilot_access: "✓ DONE (1690bc6) — lib/agent-tools/tools/coordination/intelligence-query.js. Deliberate split: patterns/status/failures/reuse/map/commands reached in-process (safe, stateless); CFR field state reached via real HTTP to the actual running server, honestly failing rather than fabricating data when it's not up — both outcomes verified live."
    command_history: "✓ DONE (4cc9b3e) — /api/commands/history, a real, persistent, queryable log of every command actually invoked, distinct from the static /api/commands list."
    config_file: "✓ DONE (4cc9b3e) — intelligence/config.js, real and distinct, not inline constants."
    intuition_mastermind_routes: >
      ✓ DONE (4cc9b3e) — real correction, not just an addition: these two
      real faculties (correct since 2026-07-06) had NEVER been exposed via
      HTTP anywhere in the system's history, in cortex or intelligence,
      before or after this session's work — a pre-existing gap, confirmed
      by directly checking rather than trusting an earlier, wrong claim
      that they were already reachable. Built on cortex/boot.js (its
      documented composition root for these two), reusing the real,
      already-instantiated objects — zero duplicate instances, same
      reasoning as the phase 3 CFR correction. Verified live: real
      intuition answer from the real current field state, real mastermind
      analysis surfacing the actual open gaps from this session.

  # ── What's still genuinely open, named plainly ─────────────────────────────
  still_open:
    - "research_input/research_output event types deliberately not wired — 'research' is a routing classification (agent-router.js), not a distinct execution path; wiring one would be fabricated."
    - "lifeline_input/lifeline_output structurally verified (exports, no recursion) but never live-tested against real ollama/guardian — this sandbox doesn't run either."
    - "build_input/build_output verified via the same write logic in isolation, not a full, real compile pipeline run — that needs emerge's real compiler, not exercised here."
    - "The relayed CFR gap event (intelligence.cfr.gap) was verified for its own shape/logic, not the full path from a genuine sigma spike through the live ledger to onGap firing."
    - "No James-run, real-machine test yet of any of this — everything above is real and tested in this sandbox only."

  not_yet_done: []   # §2026-08-22 — was a real, honest list at the start of phase 1; every item on it is now done. Left as an empty array, not deleted, so its own history stays visible per §17.3.

  # ── 2026-09-19 — heartbeat/pulse + node-export/schema work ─────────────────
  built_2026_09_19_pulse_and_nodes:
    pulse: >
      intelligence/server.js was the one sovereign system relying on
      orchestrator's active poll instead of pulsing itself (checked against
      all 11 others, all already wired). Now wired identically via
      startHeartbeat -> orchestrator/lib/pulse.js's real createPulse.
      Separately, pulse.js and orchestrator.js's real POST /api/heartbeat
      gained a real bpm/healthScore computation (computeBpmHealth, unit-
      tested against 6 scenarios) — regularity + steadiness + latency +
      missed-beat axes, weighted, clamped 0-100, exposed on /api/heartbeat
      and /api/status. Refuses to fabricate a score with zero real beats.
    domain_nodes: >
      intelligence.node-taxonomy.md's own "node: NOT USED" row is closed:
      intelligence/lib/domain-nodes.js exports real .gap/.bep_pattern/
      .pattern_sequence/.resonance_crystal files and indexes them into
      real jaaDB tables, wired at every real construction site. Schema-
      checked on write via lib/node-schemas.js's checkPayload().
    schema_corrections_found_along_the_way: >
      First draft used the generic pat/crystal types; both already taken
      by unrelated real mechanisms (pat <- case-library.js, crystal <-
      crystal-lattice.js). Corrected to bep_pattern/resonance_crystal.
      Validating real payloads then surfaced real pre-existing mismatches:
      schema.gap's occurrences was required but neither real intelligence
      gap site sets it — relaxed to optional. schema.bep_pattern only
      matched the co-occurrence shape, not intelligence's own second real
      shape (meta_noise_source) — relaxed the fields unique to each.
      mastermind.js's sequence pattern was a third, genuinely different
      shape — given its own new type, schema.pattern_sequence. Also fixed,
      unrelated but blocking: lib/node-schemas/schema.repository had
      invalid YAML crashing require('lib/node-schemas.js') for every
      caller in the tree, not just this one.
    verified: >
      Every real payload shape run against the corrected schemas: zero
      warnings, correct files, correct jaaDB index rows. One real mistake
      (rm -rf briefly deleted 37 pre-existing node files) caught via git
      status and restored via git checkout before anything was committed.
