spec:
  meta:
    name:        raid-routing-fidelity
    version:     0.1.0-phasemap
    status:      PHASEMAP 2026-08-08. Mapped before build (§3.3). Build nothing yet.
    uuid:        nexus-raid-routing-fidelity-v0-0000-2026-0808-001
    author:      James Brooks
    intent: >
      Make the RAID engine the GOVERNING ROUTING LAYER: the chunk system chunks
      work into contracts, each contract is routed THROUGH RAID, and RAID decides
      — by signal-to-noise + fidelity ("which agent aligns with this request
      best?") — which agent/system receives it. Chunking stops being character-
      based (3000 chars is meaningless for token-limited agents) and becomes
      contract-based, sized to each agent's real token budget. Every cross-system
      handoff is a governed handshake. Per-agent configs (tokens, accounts) live
      in cortex as fluid databases; the system adjusts itself over time (cortex
      fitness); every system exposes what's changeable via API/CLI, hooked to loom.

    the_core_reframe: >
      James: "the chunk size is crap — 3000 characters isn't useful because it's
      tokens, the measurement unit with AI. Each agent needs its own. This is why
      I said move it to the RAID engine — every contract gets sent to the right
      signal-to-noise filter with fidelity scoring: what agent aligns with this
      request the best, highest fidelity? The chunking needs to interconnect with
      the RAID engine's signal-to-noise. RAID is the governing layer; everything
      goes through it to move to another system."

  MAJOR_8.6_FINDING:   # most of this ALREADY EXISTS — verified 2026-08-08
    - "cortex/core/raid/snr-filter.js — the SNR + FIDELITY gate already exists, wired into RAID _decide() as a pre-gate. Spec: docs/raid-snr-filter.spec. 'fidelity is how much context resolves the task.' THE SPINE EXISTS."
    - "lib/agent-router.js — per-agent token configs ALREADY THERE: chatgpt {maxTokens:900,chunk:true}, claude {maxTokens:200000}, gemini {1M/65k}, + intent→agent routing (perplexity=research, chatgpt=general...). The 900-token chunking reason is even documented."
    - "lib/account-registry.js — multi-account slots per provider, app-password-style login ('login to multiple accounts in ClearGlass like an app password' — James's exact ask, BUILT). Stored as editable cortex rows."
    - "guardian/clear-glass-bridge.js + guardian/api-dispatch.js — the guardian↔clear-glass handshake + chunk intake path exist."
    - "lib/chunk-service.js (this session) — chunking already routes through RAID (chunkGoverned)."
    - "enforcement-index.js (uploaded, NOT yet in tree) — 25-invariant runtime enforcement (RuntimeGuard + BoundaryIndex). Candidate to integrate for the handshake/governance guarantees."
    So this arc is ~70% WIRING existing pieces + extending them, NOT building from scratch. Honesty: verify each against source before wiring (§1.1).

  substrate_this_session:   # the live nervous system these route over
    - "lib/ledger-fanin + boot — every event; handoffs emit here."
    - "cortex/intelligence/relational-field (RFR2) + CFR — conditions + regime for fitness."
    - "lib/gemini-toolbox/agent-contracts — per-agent contracts + scoped toolboxes."
    - "lib/agent-pull + lib/tool-index — pull toolbox + living index (AP1)."

  governing_axioms:
    - "§3.3 map first (this file). §8.6 reuse — verified most exists; extend, don't rebuild."
    - "§10.3 one source of truth — one router (RAID), one config store (cortex), one chunker (lib/chunker)."
    - "§RAID governs every handoff. §1.1 declared≠real (verify the existing pieces work as claimed). §1.2 nothing silently fails."
    - "§always: update loom maps + component/consumer registries, spec addenda, nothing lost."

  # ── DEPENDENCY-ORDERED PHASES ───────────────────────────────────────────────
  phases:

    RR1_verify_and_wire_the_snr_fidelity_gate:
      priority: FOUNDATION — the spine already exists; prove it, then route contracts through it.
      status: "OPEN, real finding, corrected 2026-08-29 — checked directly
        before assuming complete: cortex/core/raid/snr-filter.js IS real
        and IS wired into cortex/core/raid/index.js's real _decide(), but
        ONLY when the caller declares a real faultClass (fault-
        remediation calls) — deliberately gated, per that file's own
        comment ('must never become a silent second path'). For general
        contract/prompt routing (no faultClass — the case lib/seam/
        spec-parser.js's real chunking, BR5, actually uses), SNR/fidelity
        scoring is never consulted at all; the real decision goes
        straight to preferredAgent -> LAW_I -> the computed fitness
        chain. RR1's own ask ('route a CONTRACT through it... confirm
        the intent->agent + AGENT_CONSTRAINTS path feeds it') is
        genuinely NOT satisfied for the general case — found while
        checking RR2 (below) against BR5's real, already-shipped work."
      does: >
        Verify cortex/core/raid/snr-filter.js does real SNR + fidelity scoring
        (§1.1 — declared≠real). Then route a CONTRACT (not a raw call) through it:
        RAID scores each candidate agent's fidelity for a contract and picks the
        highest. Confirm the intent→agent + AGENT_CONSTRAINTS path feeds it.
      reuse: "snr-filter + agent-router AGENT_CONSTRAINTS + raid router — all exist."
      gate:  "a contract routed through RAID returns the best-fidelity agent + its token budget; a low-SNR/unknown call is gated, not mis-routed."
      build_vs_wire: "mostly VERIFY + thin wire. The scoring exists."

    RR2_contract_based_chunking:
      depends_on: RR1
      status: "PARTIAL, real correction 2026-08-29 — this is, almost
        word-for-word, what got built this session as BR5_build_
        contract_per_agent_per_intent (docs/2026-08-27-event-taxonomy-
        and-brainstorm-phasemap.spec) without ever cross-checking this
        older, more specific phase first — the same class of tracking
        gap already found once today (BL27/SBP7). What BR5 actually
        built: real, verified token-sized chunking from AGENT_CONSTRAINTS
        (chatgpt 900, gemini 1M, etc. — confirmed live, proportional
        scaling proven). What RR2 additionally asks for, NOT built: 'the
        chunker asks RAID who's the best agent for this? (RR1), THEN
        sizes to that agent' — BR5 sizes to whatever forAgent was ALREADY
        given; it never asks RAID's own fidelity-scored decision first,
        because RR1 (above) isn't done. Real, working, partial — not the
        same as complete."
      does: >
        Replace character-based chunking with CONTRACT-based, TOKEN-sized chunking.
        lib/chunk-service chunks work into contracts; each contract is sized to the
        TARGET agent's real token budget (from AGENT_CONSTRAINTS: chatgpt 900,
        claude 200k, gemini 1M, ollama 4k-128k, perplexity). The chunker asks RAID
        'who's the best agent for this?' (RR1), THEN sizes to that agent. Chunking
        interconnects with RAID's SNR, per James.
      reuse: "lib/chunker (boundary detection) + chunk-service + AGENT_CONSTRAINTS + RR1."
      gate:  "a large input chunks into agent-sized contracts (900-token chunks for chatgpt, larger for claude/gemini), not fixed 3000-char blocks."
      build_vs_wire: "extend chunk-service — token estimator + per-agent sizing. Real build, but small."

    RR3_per_agent_config_in_cortex:
      depends_on: RR1
      status: "PARTIAL, real correction 2026-08-29 — SBP8_agent_mesh_
        consolidation (docs/2026-08-28-self-building-pipeline-phasemap.spec)
        attached AGENT_CONSTRAINTS to every spawned mesh agent's state,
        real and verified live (chatgpt/gemini shown with correct,
        distinct real budgets). RR3's own actual ask is more ambitious
        and NOT satisfied by that: 'one editable source, not constants
        in agent-router... changing a token limit or adding an account
        changes routing with no code change.' AGENT_CONSTRAINTS is still
        a hardcoded JS object — SBP8 exposed it, didn't move it into a
        real, live-editable cortex table. Real progress toward RR3, not
        RR3 itself."
      does: >
        Consolidate per-agent config (token limits, accounts, availability) into a
        fluid cortex database — one editable source, not constants in agent-router.
        Sync to James's real accounts (account-registry, already multi-account).
        chatgpt 900, claude, ollama (4k-128k per RAM), gemini, perplexity. Each
        config changeable via API + CLI, hooked to loom.
      reuse: "account-registry (multi-account, cortex rows) + agent-router constraints + schema-registry."
      gate:  "agent configs read from cortex (editable live); changing a token limit or adding an account changes routing with no code change."
      build_vs_wire: "wire agent-router constants → cortex rows; account-registry already exists."

    RR4_governed_handshake_on_handoff:
      depends_on: [RR1, RR2]
      status: "OPEN, real design detail added 2026-08-30, not built. James:
        'need intention. Dir. conditions for passing the test env. Agent
        and system. Language if applicable. Compartment if needed. Chunk
        id. Request or contract id... Doesn't leave the input folder
        until handoff.' Checked the real guarantee-layer candidate this
        phase itself names, not assumed real: intelligence/rfr2/
        enforcement/index.js's RuntimeGuard IS real and already carries
        its own real @hook UUID tag (this codebase's own established
        convention) — confirmed by reading it directly, not aspirational
        text. Real schema for the handshake contract, additive to
        contract-intake.js's existing shape (content/forAgent/dependsOn/
        onFail, all real and unchanged): intention (what this contract
        is FOR, not just its content — feeds IC6's intention taxonomy
        below once that exists), dir (the real working directory/file
        scope this contract touches), conditions (the real end-state
        check — already exists as the SEAM VERDICT convention, formalize
        as a named field rather than only living in the prompt text),
        agent + system (both, not just agent — RAID already tracks
        forAgent; system is new, which SYSTEM originated this contract),
        language (real, only when applicable — a code contract vs a
        prose contract), compartment (already real via compartment-
        engine, link explicitly), chunk_id (already real, BR5), request/
        contract_id (already real, queueId) logged to a real contract
        ledger + index for RAID (extends the real cortex event_log
        pattern already proven this session for the command-index
        backup, not a new ledger mechanism).
        Real, concrete mechanism for 'doesn't leave the input folder
        until handoff': a submitted contract's real source file/data
        physically stays in a real input/ dir until the receiving
        system's real ACK (not just reaching 'queued' — a genuine
        acknowledgment the receiving system got it and understood its
        constraints) moves it — same real, physical-file-lifecycle
        discipline this codebase already uses elsewhere (COS's real
        compartment directories, Versionium's real snapshot files), not
        a new pattern invented for this specifically."
      does: >
        Every cross-system contract handoff is a governed HANDSHAKE through RAID —
        especially Guardian (accepts chunks) and clear-glass. Handshake = the
        receiving system acknowledges the contract + its constraints before work
        starts. Consider integrating the uploaded enforcement-index.js (25
        invariants, RuntimeGuard) as the handshake's guarantee layer.
      reuse: "guardian/clear-glass-bridge + api-dispatch + RAID router + ledger-fanin (handoff events)."
      gate:  "a contract handed to guardian/clear-glass is acknowledged with its constraints; a handoff that violates an invariant is stopped (enforcement)."
      build_vs_wire: "wire the existing bridge through RAID + optionally integrate enforcement module."

    RR5_clearglass_accounts_and_features:
      depends_on: RR3
      status: "PARTIAL, real correction 2026-08-29 — cross-referenced
        against CA7 (docs/copilot-awareness-routing-phasemap.spec, same
        real ask) at the same time. The 'app-password-style multi-account
        logins' half is done — real Accounts panel in clear-glass/
        renderer/settings.html, verified end-to-end this session,
        though in ClearGlass's own settings, not 'tv-ui top-right' as
        this phase's own wording assumes (that surface has zero real
        account UI, checked directly). The 'break userscripts into
        FEATURES with SSE/API I/O, browser-bridge tool' half is NOT
        done — genuinely separate, unbuilt scope this correction doesn't
        touch."
      does: >
        Hook account-registry to clear-glass: app-password-style multi-account
        logins in the tv-ui top-right. Break the clear-glass userscripts into
        FEATURES, added one by one, each with SSE/API I/O for input/output. A tool
        to set up a browser-bridge (BBB) for a webpage + an API for SSE.
      reuse: "account-registry (built) + clear-glass shell + tv-ui + userscripts."
      gate:  "a user adds an account via tv-ui top-right; a userscript feature works through clear-glass with SSE I/O."
      build_vs_wire: "wire account-registry→clear-glass + tv-ui; decompose userscripts (real work)."

    RR6_cortex_fitness_and_fluid_configs:
      depends_on: [RR3, RR4]
      does: >
        The system adjusts itself over time (cortex fitness): routing/chunking/
        config tuned by observed performance (fan-in + RFR2 + CFR). Everything
        fluid — each system exposes its changeable config + API + CLI as cortex
        rows + loom-hooked commands. This is the agent-intelligence-loop AP4
        (optimizer) generalized to the whole system.
      reuse: "cortex fitness + intelligence + fan-in + loom + the agent-intelligence-loop AP3/AP4."
      gate:  "a persistently low-fidelity route is auto-adjusted (RAID-governed); every system's config is discoverable + changeable via loom."
      build_vs_wire: "the big one — composes AP4 + fitness. Depends on the agent-intelligence-loop arc."

    RR7_per_system_dashboards_in_tablet:
      depends_on: []   # independent — a UI concern
      does: >
        Each system, clicked in nexus-tablet, opens a performance dashboard like
        the checkmk reference James shared: per-system CPU/RAM/throughput/latency/
        errors/requests panels, fed by the fan-in + activity-log + health. A
        cockpit view per system.
      reuse: "tablet homepage (per-system tiles) + activity-log + fan-in + health endpoints."
      gate:  "clicking a system tile opens a live per-system metrics dashboard."
      build_vs_wire: "UI build — reads existing telemetry; can be done independently anytime."

  ordering_rationale: >
    RR1 first — the SNR/fidelity gate is the spine and it already exists; verify +
    wire it. RR2 (contract chunking) and RR3 (config in cortex) both build on RR1's
    routing. RR4 (handshake) needs routing + chunking. RR5 (clear-glass accounts)
    needs the config store. RR6 (fitness) is the capstone — it composes the
    agent-intelligence-loop's AP4 optimizer over the whole system. RR7 (dashboards)
    is independent UI, do anytime.

  honest_risks:
    - "7 phases — a large ARC. Each ships whole + tested + committed, one at a time."
    - "MOST of the spine exists (§8.6) — so RR1/RR3/RR4 are lighter than they look; RR2/RR5/RR6 are real builds."
    - "RR6 (fitness) depends on the agent-intelligence-loop arc (AP2-AP4) being built first — they're the same optimizer."
    - "enforcement-index.js integration (RR4) — read it fully + verify against the tree's invariant model before wiring (§1.1)."
    - "Everything routing-live proves on James's boot; sandbox verifies scoring/chunking/config logic."

  cross_arc_note: >
    This arc and docs/agent-intelligence-loop-phasemap.spec CONVERGE at fitness:
    RR6 IS the agent-intelligence-loop AP4 optimizer applied system-wide. Build the
    loop's AP2-AP4 first, then RR6 is their generalization. One optimizer, not two.

  first_build: "RR1 — verify + wire the existing SNR/fidelity gate to route contracts. Recommended start."
