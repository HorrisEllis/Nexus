spec:
  # ════════════════════════════════════════════════════════════════════════════
  # nexus-system-foundation-addendum-v1.2.0.spec
  #
  # STATUS: proposed, additive, REVERTIBLE.
  # Nothing here removes or rewrites an existing layer. Every axiom slots
  # into L3/L4 as they already stand. To revert: delete this file and
  # remove the three §AX-010/011/012 comment markers from code. The
  # foundation returns to v1.1.0 behaviour with no structural change.
  #
  # WHY THIS EXISTS — James, 2026-07-09: "the meaning is getting lost.
  # I don't want anything inline or hardwired that can use the api, or
  # interaction contract, with handshake verification."
  #
  # He is right, and the foundation already said so. v1.1.0 L1 states:
  # "all state changes are events. Nothing couples directly." And:
  # "Systems talk to each other through events, not direct HTTP calls."
  # The code violated this in twelve places. But the interesting part is
  # WHY, and it is not carelessness. See AX-011.
  # ════════════════════════════════════════════════════════════════════════════

  meta:
    name:        nexus-system-foundation-addendum
    version:     1.2.0
    extends:     nexus-system-foundation@1.1.0
    author:      james-brooks
    status:      proposed
    uuid:        nexus-system-foundation-addendum-v1-2-0000-2026-0709-jamesbrooks-001
    supersedes:  nothing — additive only
    revert: >
      Delete this file. Remove §AX-010/011/012 markers. No layer changes,
      no data migration, no API removal. lib/nexus-client.js may remain
      (it is additive infrastructure) or be deleted with its callers
      reverted to their prior direct requires — the prior state is
      recorded per-callsite in the §SOVEREIGNTY comments.
    purpose: >
      Three axioms found by measuring the running system against this
      foundation. AX-010 states the rule James stated. AX-011 records the
      structural reason the rule was unenforceable, which is the finding
      that matters. AX-012 makes handshake verification a precondition of
      use rather than a boot-time formality.

  # ── AX-010: Sovereign Transport ─────────────────────────────────────────────
  # What's actually true today, measured 2026-07-09, not asserted:
  #   Twelve direct cross-system require() calls existed. One sovereign
  #   system reaching into another's filesystem:
  #     guardian/server.js       -> require('../cortex/core/raid/routing-ir.js')
  #     guardian/api-dispatch.js -> require('../cortex/core/raid')          [x2]
  #     copilot/lifeline.js      -> require('../cortex/core/raid/routing-ir.js')
  #     copilot/server.js        -> require('../cortex/personas.js')
  #     copilot/server.js        -> require('../cortex/memory/jaa-db.js')
  #     copilot/adversarial.js   -> require('../cortex/intelligence/adversarial')
  #     copilot/axiom-manager.js -> require('../cortex/memory/jaa-db')
  #     lib/execution-pipeline.js-> require('../orchestrator/lib/hot-loader')
  #                              -> require('../cos/playground')
  #                              -> require('../emerge/compiler/t2-gate')
  #   Six of these were introduced by an AI assistant in one session while
  #   "building features." That is the failure mode this axiom guards: a
  #   require() is the fastest way to get a capability and the most
  #   expensive way to keep one.
  #
  #   THE SYMMETRY THAT PROVES THE POINT: cortex already exposes
  #   /api/raid/decide, /api/intelligence/adversarial, /api/memory/insert
  #   as real, working HTTP routes. Every one of them appeared in
  #   verify-wires' 64 orphaned-route list. They were orphaned BECAUSE
  #   callers reached around them with require(). The "undeclared routes"
  #   problem and the "hardwiring" problem are one problem seen from two
  #   ends.

  axiom_AX-010:
    statement: >
      No system may reach into another system's filesystem, module tree, or
      database. If a capability is needed across a system boundary, it is
      exposed as an API (L3), declared in the handshake (L4), and called
      through the sovereign transport. A cross-boundary require() is the
      hardest possible wire: it couples file layout, module system, and
      process lifetime simultaneously, and makes the target system
      un-swappable.
    corollary_no_ports: >
      No caller may name a host or a port. A caller that cannot name a
      port cannot hardwire one. Callers name a SYSTEM and a PATH; the
      transport resolves the address from a single source of truth.
    rationale_hotswap: >
      This is what makes "remove any system and swap in another" real
      rather than aspirational. Proven 2026-07-09: a replacement cortex was
      booted on a different port, one config line was edited, and a caller
      asking for system 'cortex' reached the replacement — no restart, no
      code change.
    implementation:
      transport:    lib/nexus-client.js
      surface:      call(systemId, method, path, body) | get | post | health
      resolution:   orchestrator.config.json `ports` block, via lib/nexus-config
      hot_reload:   yes — nexus-config.onChange/watch; resolution is per-call
      unknown_id:   loud error, never a guessed default (§1.2)
    note_on_config: >
      The `ports` block already existed, was hot-reloadable, and NOTHING in
      the codebase read `ports.*`. It was also wrong: it declared
      ollama:11434 (the daemon) while orchestrator's SYS map declared 3749
      (the bridge) — two sources of truth, disagreeing, both unread. It is
      now the single authority. An orphaned source of truth is not a source
      of truth.
    exceptions:
      - Shared infrastructure under lib/ that no system owns (nexus-bus,
        nexus-config, jaa) may be required by any system. It is L0/L1.
      - A system may require its OWN subtree. guardian/server.js requiring
        ../guardian/lib/ncp is a self-reference, not a boundary crossing.

  # ── AX-011: The Bus Does Not Span Processes ─────────────────────────────────
  # THIS IS THE FINDING. Recorded because its absence is what let the
  # meaning get lost.
  #
  # L1 of this foundation says: "all state changes are events. Nothing
  # couples directly. Systems talk to each other through events, not direct
  # HTTP calls."
  #
  # Measured 2026-07-09: nexus-bus.js is `class NexusBus extends
  # EventEmitter`. It is in-process. Eighty files emit onto it. Every one
  # of the twelve NEXUS processes holds its OWN INSTANCE. There is no
  # distributed bus. There never was.
  #
  # Consequences, all observed in the running system:
  #   - nexus-heal-loop.js listens on the orchestrator's bus for gap
  #     events. Gaps are produced by guardian's userscripts and by
  #     nexus-diagnostic (:7825) — different processes. heal-loop has been
  #     listening, correctly, to a bus on which no gap has ever been
  #     emitted. Self-heal has never fired. The code was never wrong.
  #   - Engineers reaching for a capability in another process had exactly
  #     two options: require() its files (couple the filesystem) or
  #     hardcode its port (couple the address). Both were violations of a
  #     spec that offered no third option.
  #
  # The rule "systems talk through events" was not ignored. It was
  # unimplementable across the boundary, and nobody wrote that down.

  axiom_AX-011:
    statement: >
      L1's event bus is a WITHIN-PROCESS spine, not a between-process one.
      Cross-process communication is L3 (API) until a distributed bus
      exists. Any spec text implying otherwise describes an intent, not a
      mechanism, and must say so.
    implication_for_L1: >
      "Couple only to L0 and L1" remains correct WITHIN a system. Across
      systems, the sanctioned coupling is L3 + L4: call the API, verified
      by the handshake. AX-010's transport is therefore not a violation of
      L1 — it is the honest name for what crossing the boundary has always
      required.
    existing_cross_process_transports:
      - nexus-bus SSE fan-out — one-way, bus -> external clients only.
      - lib/gap-relay.js — gap-shaped events only, guardian+diagnostic ->
        orchestrator's bus. Built 2026-07-09 as the missing diagnosis->action
        wire. Loop-guarded (relayed events tagged, never re-relayed) and
        deduped by (type + gap id).
    open_phase: >
      A general distributed bus is not built. Until it is, do not write
      "systems communicate via events" in a spec without qualifying it.
      That sentence is how self-heal came to listen to silence for months.

  # ── AX-012: Handshake Verification Precedes Use ─────────────────────────────
  # L4 already says: "Routes are declared as components in the handshake"
  # and "The API surface is described by the interaction contract." What it
  # does not say is that a CALLER must check.
  #
  # What's actually true today, measured:
  #   verify-wires.js forward scan proves every declared hook has code.
  #   Its reverse scan (added 2026-07-09) proves the converse does NOT
  #   hold: 64 implemented routes carry no declared hook. Guardian 33,
  #   Cortex 29, Copilot 3, Ollama 1. The registry describes roughly half
  #   the real HTTP surface. A caller trusting the registry is trusting a
  #   half-map.

  axiom_AX-012:
    statement: >
      A route that exists but is not declared is not part of the contract,
      and a route that is declared but does not exist is a lie. Both are
      violations. Wiring must be verified in BOTH directions:
      registry -> implementation, and implementation -> registry.
    corollary_one_way_checkers: >
      A one-way consistency checker is blind in exactly the direction its
      author is blind. verify-wires.js proved "every declared hook has
      code" for weeks while sixty-four implemented routes went undeclared,
      six of them added by the very session that wrote the checker.
    handshake_use: >
      Before a caller depends on a capability, it should establish that the
      capability is real — via /contract, /health, or a declared hook —
      rather than assume it from a spec. lib/nexus-client.js's health()
      returns true only on a real ok:true, never optimistically.
    enforcement:
      forward:  scripts/verify-wires.js       (registry -> code)
      reverse:  scripts/verify-wires.js       (code -> registry)
      runtime:  scripts/verify-boot.js        (PARSES < BOOTS < SERVING < HEALTHY < CONTRACT)
    note_on_evidence_tiers: >
      "Working" is not one property. A file that PARSES may be dead. A
      process that BOOTS may never listen. A port that SERVES may return
      500s. Each rung is earned separately, and no tool may assert a rung
      it did not observe. This distinction exists because guardian/server.js
      passed `node --check` for an entire session while being unable to
      boot — its `const server = http.createServer(...)` had been deleted
      cleanly enough to leave valid syntax and no server.

  # ── Compliance status at time of writing ────────────────────────────────────
  compliance:
    ax_010:
      migrated:
        - copilot/server.js    — personas + jaa-db requires -> nx.get('cortex','/api/personas')
        - copilot/server.js    — hardcoded port 3749 -> nx.post('ollama', ...)
        - copilot/lifeline.js  — routing-ir require -> nx.post('cortex','/api/raid/decide')
        - guardian/server.js   — routing-ir require -> nx.post('cortex','/api/raid/decide')
      remaining:
        - guardian/api-dispatch.js  x2  -> cortex/core/raid
        - guardian/server.js /command   -> cortex/core/raid  (pre-existing)
        - copilot/adversarial.js        -> cortex/intelligence/adversarial
        - copilot/axiom-manager.js      -> cortex/memory/jaa-db
        - lib/execution-pipeline.js x3  -> orchestrator/, cos/, emerge/
      each_has_a_real_api: >
        cortex exposes /api/raid/decide and /api/intelligence/adversarial
        today. Both are in the orphaned-route list. Migration is a call
        change, not a build.
    ax_011:
      status: recorded, not resolved. Distributed bus unbuilt.
    ax_012:
      forward_scan: clean for copilot (0 candidates) after 6 hooks registered
      reverse_scan: 64 orphaned routes outstanding
