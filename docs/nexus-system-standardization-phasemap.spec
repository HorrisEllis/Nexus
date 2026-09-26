spec:
  meta:
    name:        nexus-system-standardization
    version:     0.1.0-phasemap
    status:      PHASEMAP 2026-08-08. Mapped before build (§3.3). The target architecture.
    uuid:        nexus-system-standardization-v0-0000-2026-0808-001
    author:      James Brooks
    intent: >
      Every system, standardized to the same decoupled architecture: its own
      folder, a config for flexible components, event-driven interaction contracts
      with handshake verification gating every interaction, full logging (error.log
      + event ledger + SSE to cortex), diagnostics that read the stream and run a
      fix, dynamic commands, persistent data in cortex, hashed integrity, git. All
      systems talk ONLY through interaction contracts + APIs (fully decoupled).
      Clear the clutter.

    james_verbatim: >
      "everything, every system needs to be mapped. specs updated with each system,
      addendums added each meaningful change, configs for flexible components, a
      git, hashed, event ledger. replace the contracts with event-driven contract
      with handshake verification for each interaction space, handshake gated,
      fully logged, error.log, event ledger, sse to cortex, diagnostics reads it
      and runs a diagnostic to fix the issue, dynamic commands, persistent data in
      cortex. all decoupled and uses the interaction contracts and apis to interact
      with each other. each system in their own folder. need to clear some clutter."

  MAJOR_8.6_FINDING:   # the pattern exists in FRAGMENTS — standardize, don't invent
    - "contracts/SYSTEM-CONTRACTS.js — SYSTEM_HANDSHAKE + /bridge/handshake + per-system interaction contracts ALREADY EXIST."
    - "guardian/ — has guardian.config.json + interaction-contract.json (the target pattern, in ONE system)."
    - "bridge/ — has its own ledger. cortex/idearium/architect — have interaction-contract."
    - "lib/ledger-fanin + activity-log (this session) — the event ledger + error.log + per-system logging, LIVE."
    - "lib/integrity-revert + file-integrity (this session) — hashing + sigma + revert, LIVE."
    - "service/nexus-diagnostic + lib/diagnostic-causal (P3) — diagnostics that read the stream, LIVE."
    - "CENSUS (2026-08-08): config/contract/ledger are INCONSISTENT — guardian has cfg+contract, cortex contract-only, orchestrator/loom/copilot have none. THE GAP IS STANDARDIZATION, not creation."
    So this is ~60% standardizing an existing pattern across all systems + wiring this
    session's substrate (fan-in, logging, integrity, diagnostics) into every system.

  substrate_live_this_session:
    - "lib/ledger-fanin(+boot), lib/activity-log — event ledger + error.log + SSE fan-in per system."
    - "lib/integrity-revert, lib/file-integrity — hashed integrity + guarded revert."
    - "lib/diagnostic-causal, service/nexus-diagnostic — diagnostics read stream + find fixes."
    - "cortex JAA dynamic tables — persistent data + dynamic commands + fluid configs."
    - "lib/tool-index, lib/agent-pull — living registries."

  governing_axioms:
    - "§3.3 map first. §8.6 the pattern exists in fragments — standardize + wire, don't rebuild."
    - "§10.3 ONE source of truth per concern (one contract format, one config schema, one ledger)."
    - "§decoupling — systems talk ONLY via interaction contracts + APIs, never direct internals (James's law)."
    - "§0.3 nothing lost when clearing clutter — archive, don't delete. §always: loom maps + registries + spec addenda per system."

  # ── DEPENDENCY-ORDERED PHASES ───────────────────────────────────────────────
  phases:

    SS0_clear_clutter:   # ← STARTED 2026-08-08: unintegrated/ archived to _archive/ (0 refs, §0.3 kept). Suite 1388/0. Root loose-file tidy pending.
      priority: FIRST — a clean base makes the rest legible. LOW RISK (moves, not deletes).
      does: >
        Archive the clutter (§0.3 nothing lost): unintegrated/ (branch dumps),
        stale root files. Confirm each of the 38 folders is a real system vs a
        leftover. Move loose root .js that belong to a system into that system's
        folder (keeping autopilot.js/orchestrator.js as legit entrypoints).
      gate:  "unintegrated/ archived; root has only real entrypoints; every folder is a live system or archived. Suite still green."
      build_vs_wire: "cleanup — moves + archive, verified by the suite staying green."

    SS1_system_manifest:
      depends_on: SS0
      does: >
        A canonical per-system manifest schema: {config, interaction-contract,
        ledger, diagnostics, commands, data-tables}. Audit every system against it
        (the census, formalized) — who has what, what's missing. One schema, in loom.
      reuse: "guardian's config+contract as the template; loom to hold the manifest."
      gate:  "loom lists every system + which standard parts it has vs lacks."

    SS2_config_per_system:
      depends_on: SS1
      does: "every system gets a config for its flexible components (like guardian.config.json), stored as fluid cortex rows, changeable via API + CLI, hooked to loom."
      reuse: "guardian.config.json pattern + cortex dynamic tables + account-registry pattern."
      gate:  "each system reads its config from cortex; changing it changes behavior with no code edit."

    SS3_event_driven_handshake_contracts:
      depends_on: SS1
      does: >
        Replace static interaction contracts with EVENT-DRIVEN contracts + handshake
        verification for each interaction space. Every interaction: handshake first
        (acknowledge identity + contract + constraints), gated (refuse if handshake
        fails), then the interaction as events. Extends the existing bridge handshake
        to ALL system-to-system spaces.
      reuse: "contracts/SYSTEM-CONTRACTS SYSTEM_HANDSHAKE + bridge/handshake + ledger-fanin (events)."
      gate:  "a system-to-system interaction is handshake-gated; a failed handshake is refused + logged; the interaction flows as events."

    SS4_full_logging_per_system:
      depends_on: [SS1, SS3]
      does: >
        Every system fully logged: error.log + event ledger + SSE to cortex — via
        the LIVE lib/activity-log + ledger-fanin. Every handshake, interaction,
        error persisted to cortex. (Mostly wiring — the logging substrate is live.)
      reuse: "lib/activity-log + ledger-fanin (this session) — wire each system in."
      gate:  "every system's activity + errors are in cortex event_log/error_log; a handshake failure appears there."

    SS5_diagnostics_reads_and_fixes:
      depends_on: SS4
      does: >
        Diagnostics reads the SSE/ledger and, on an issue, runs a diagnostic to FIX
        it (or recommend + RAID-gate the fix). Composes diagnostic-causal (conditions)
        + integrity-revert (revert broken) + dynamic commands (apply fix).
      reuse: "lib/diagnostic-causal (P3) + integrity-revert (this turn) + snapshot timeline (P2)."
      gate:  "an injected fault appears in the stream, diagnostics traces it + proposes/applies a governed fix."

    SS6_dynamic_commands_and_cortex_data:
      depends_on: [SS2, SS4]
      does: >
        Each system exposes DYNAMIC commands (not hardcoded) + persistent data in
        cortex. Commands are cortex rows hooked to loom; data is JAA tables. This is
        the 'fluid, self-adjusting' layer (converges with cortex-fitness / AP4).
      reuse: "cortex dynamic tables + loom command hooks + the raid-routing-fidelity RR6 fitness."
      gate:  "a system's commands are listed from cortex/loom (not code); its data persists in cortex."

    SS7_decoupling_audit:
      depends_on: [SS3, SS4, SS5, SS6]
      does: >
        Verify FULL decoupling: no system reaches another's internals — only via
        interaction contracts + APIs. loom's closed-door scanner audits it; a direct
        cross-system internal call is a flagged violation.
      reuse: "loom/scanners/closed-door.js (exists) + the contracts."
      gate:  "the closed-door scan shows zero direct cross-system internal calls; all traffic is contract/API."

  ordering_rationale: >
    SS0 clears clutter first (clean base). SS1 defines the standard + audits the gap.
    SS2 (config) and SS3 (handshake contracts) are the two pillars, both on SS1.
    SS4 (logging) wires the live substrate into every system. SS5 (diagnostics-fixes)
    needs the logging. SS6 (dynamic/fluid) needs config + logging. SS7 (decoupling
    audit) verifies the whole thing at the end.

  convergence_note: >
    This arc UNIFIES the session's threads: SS4/SS5 use the live fan-in/logging/
    diagnostics; SS6 IS the cortex-fitness of raid-routing-fidelity RR6 + the
    agent-intelligence-loop AP4 (one optimizer, system-wide); SS3 handshake extends
    raid-routing-fidelity RR4. This is the phasemap the loom-phasemap-section (ask
    from last turn) would split across systems. It is the SPINE all other maps hang on.

  honest_risks:
    - "8 phases (SS0-SS7) — the LARGEST arc. Each ships whole + tested + committed."
    - "SS0 clutter-clearing touches the tree broadly — moves not deletes (§0.3), suite-verified each step."
    - "SS3 (replacing contracts) is high-risk — every interaction depends on it; extend the working handshake incrementally, never big-bang."
    - "Most is standardizing an EXISTING pattern + wiring LIVE substrate — lighter than it reads, but broad."
    - "Proves on James's boot per system; sandbox verifies schema/wiring/logic."

  first_build: "SS0 — clear the clutter (archive unintegrated/, tidy root). Low-risk, makes everything after legible."
