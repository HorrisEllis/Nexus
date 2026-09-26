spec:
  meta:
    name:        nexus-observability-and-tablet
    version:     0.2.0-phasemap
    status:      PHASEMAP 2026-07-30. James vision (v0.2 adds OB10 sigma-roles + OB11 edge-cases): per-system tablet modules
                 (info/events/snapshots/diagnostics) with escalation to co-pilot;
                 continuous injection into ollama's stream; live diagnostics ("how
                 is nexus" → real data); component registry mapped onto CFR + ALK-GL
                 for movement; bottleneck detection via sigma/delta; a real 3D map
                 (no mocks); gap detection for diagnostics; intelligence-driven
                 optimization; pattern leverage ratio. Governed by AXIOMS-v3.1.
    uuid:        nexus-observability-tablet-v0-0000-2026-0730-001

  substrate_verified_2026_07_30:
    tablet:         "./tablet/index.html EXISTS + test-tablet-graph-api + test-tablet-container-api — a tablet UI + graph/container APIs already there. EXPAND, don't rebuild (§8.6)."
    cfr_field:      "meta/cfr/field.js computes friction/coherence/resonance/entropy/stress PER EVENT — James's 'friction and tension' + bottlenecks are ALREADY modeled. meta/cfr/delta.js = the deltas."
    sigma:          "meta/cfr/sigma.js computeSigma() — already consumed by RAID P4. The bottleneck/stall signal. JAMES'S INSIGHT: sigma is ONE score serving FIVE roles — deviation, performance, expectations, drift-detection, leverage — interpreted per component's declared intent (OB10)."
    registry:       "lib/capability-registry.js + component registry — the movement-mapping source."
    intelligence:   "cortex/intelligence/{mastermind,intuition,adversarial}.js — the optimization brain."
    gaps:           "guardian/lib/gap-hunter.js + meta/bda/gaps.js + cortex gap engine (POST /api/gaps) — gap detection substrate."
    stream:         "lib/stream-digest.js + copilot continuous stream (omniscience P3) — the ollama injection path already exists."
    status:         "copilot/system-status.js (CA1) — 'how are you' polls health; EXPAND to full live diagnostics."

  governing_axioms:
    - "§8.6 reuse before build — nearly every piece EXISTS; this is wiring + expansion, not greenfield. Read each before touching."
    - "§1.1 nothing real until proven — 'no mocks, no fakes' is James's explicit demand AND §1.1. The 3D map renders REAL registry/CFR data or it doesn't ship."
    - "§13.4 drift is data — bottleneck/stall detection IS drift detection; untracked drift is the only failure."
    - "§17.6 auditable / §17.5 provenance — everything logged, every signal traceable to its event."
    - "§0.4 optionality + fluid — co-pilot improvises; when not confident, asks (composes with lifeline ask-first + CA4 extend)."
    - "§16.4 complexity earns existence — a 3D map + leverage ratios must EARN their build by revealing something text can't."

  build_chunks:
    note: "§3.1 bottom-up, chunked. Each chunk independently testable + shippable; drift measured at each boundary. Heaviest (3D visual) is sequenced AFTER the data it renders is real."
    CHUNK_E_diagnostics:   # ← COMPLETE 2026-07-30 (OB1+OB2), 1238/0 —  "OB1 full live diagnostics + OB2 gap-detection-for-diagnostics — 'how is nexus' gives real data; every issue/fault/gap detected + logged. Foundation: the DATA."
    CHUNK_F_movement:   # ← COMPLETE 2026-07-30 (OB3+OB4), 1245/0 —     "OB3 registry→CFR/ALK-GL movement map + OB4 bottleneck detection (sigma/delta/friction/tension). The MODEL of flow + where it stalls."
    CHUNK_G_tablet:   # ← COMPLETE 2026-07-30 (OB5+OB6), 1255/0 —       "OB5 per-system tablet modules (info/events/snapshots/diagnostics + escalation) + OB6 continuous ollama-stream injection. The per-system SURFACE + the always-on feed."
    CHUNK_H_intelligence:   # ← COMPLETE 2026-07-30 (OB7+OB8+OB10+OB11), 1264/0 — "OB7 intelligence-driven optimization + OB8 pattern leverage ratio + OB10 sigma-role intent-map (sigma serves 5 roles per component) + OB11 edge-case mapping. The system improves itself, knows which patterns matter, knows what each sigma MEANS, and recognizes its failure modes."
    CHUNK_I_visual:   # ← COMPLETE 2026-07-30 (OB9), 1273/0 —       "OB9 the real 3D dynamic map (no mocks). Renders CHUNK_F's real movement data. Heaviest; last; earns existence only over real data."

  phases:

    OB1_live_diagnostics:   # ← DONE 2026-07-30, real health/gaps/decisions/drift/regime, 1238/0
      does: "Expand CA1 status into FULL live diagnostics: per-system health + events + snapshots + open gaps + CFR field state (friction/stress). 'how is nexus' → a real diagnostic report, not a summary."
      reuse: "§8.6 — system-status.js (CA1) + diagnose + cfr/field + snapshots table; compose into a deep report."
      gate: "'how is nexus doing' → live per-system diagnostic data (health, recent events, stress points), not a canned line."
      axioms: [§8.6, §1.1, §17.6]
      drift: "diagnostic coverage — a system with no health endpoint reads 'unknown', named not hidden."

    OB2_gap_detection_diagnostic:   # ← DONE 2026-07-30, detection sweep files findings, 1238/0
      does: "Diagnostic detects ANY issue/bug/fault/failure-mode/gap and logs it. Wire gap-hunter + bda/gaps + cfr stress into one diagnostic sweep that files gaps."
      reuse: "§8.6 — gap-hunter, bda/gaps, cortex gap engine all exist; OB2 runs them as one sweep + logs findings."
      gate: "a real fault (a stressed CFR node, a failing health check, a stalled job) is detected + logged as a gap."
      axioms: [§13.4, §1.2, §17.6]
      drift: "detection sensitivity — false-positive/negative rate on gaps is itself tracked."

    OB3_movement_map:   # ← DONE 2026-07-30, registry→CFR-weighted graph, 1245/0
      does: "Map the component registry onto CFR + ALK-GL to model MOVEMENT through the system (what flows where, how fast)."
      reuse: "§8.6 — capability-registry + cfr/field + alk-gl; OB3 joins them into a movement graph (nodes=components, edges=flow w/ CFR weight)."
      gate: "a request's path through systems is a real traversable graph with per-edge friction/latency."
      axioms: [§8.6, §17.5, §1.1]
      drift: "the graph is derived from REAL registry+CFR data (§0.1); a stale registry edge is drift, tracked."

    OB4_bottleneck_detection:   # ← DONE 2026-07-30, where+why via delta/friction, 1245/0
      does: "Find bottlenecks/stalls using sigma + deltas + friction/tension. If stalled, know WHERE (which node) and WHY (high friction / sigma spike / stress)."
      reuse: "§8.6 — computeSigma + cfr/delta + field.stress; OB4 scores each movement-graph node."
      gate: "a stalled node is identified with its cause (friction value, sigma, stress flag) — where AND why."
      axioms: [§13.4, §16.2, §1.2]
      drift: "THE drift engine itself — a node's flow-rate shift over time is the bottleneck signal."

    OB5_tablet_modules:   # ← DONE 2026-07-30, box grid + per-system menu, 1255/0
      does: "Each system gets its own tablet module: info + events + snapshots + diagnostics, with escalation strategies (checks escalate until passed to co-pilot)."
      design_2026_07_30: >
        James's concrete design: the tablet HOMEPAGE is a grid of BOXES, one per
        system, each with the system's logo. Click a box → enter that system's
        DIAGNOSTICS MENU. Per-system menu contents: event stream, snapshots,
        cortex view, diagnostic tools (OB1/OB2 live), versions + repository +
        roadmap (these live inside LOOM), edge cases (OB11), a summary — all
        EDITABLE and EXPANDABLE so the user keeps track of everything. Whatever
        else fits a given system goes in its box. This composes OB1 (live
        diagnostics) + OB2 (detection) + OB11 (edge cases) into a per-system
        surface; the box grid extends the tablet's existing loadSystems render.
      reuse: "§8.6 — tablet/index.html + graph/container APIs EXIST; OB5 gives each system a module fed by OB1-OB4 data + an escalation ladder."
      gate: "each system's tablet module shows its live info/events/snapshots/diagnostics; an unresolved check escalates to co-pilot."
      axioms: [§8.6, §16.2, §9.6]
      drift: "escalation-ladder drift — a check that should escalate but doesn't is logged."

    OB6_continuous_ollama_injection:   # ← DONE 2026-07-30, bounded diag injection, 1255/0
      does: "ALL this data injected continuously into ollama's stream (co-pilot always sees live system state)."
      reuse: "§8.6 — the continuous stream (omniscience P3) + stream-digest already inject; OB6 adds the diagnostic/movement data to the digest."
      gate: "co-pilot's context continuously carries live diagnostics + movement + bottlenecks."
      axioms: [§8.6, §17.6]
      drift: "digest size vs signal — too much injection drowns signal; the digest is bounded + relevance-ranked (P9 classifyRelevance)."

    OB7_intelligence_optimization:   # ← DONE 2026-07-30, 1264/0
      does: "Use the intelligence system (mastermind/intuition/adversarial) to OPTIMIZE the system from the diagnostic + movement data."
      reuse: "§8.6 — cortex/intelligence exists; OB7 feeds it OB1-OB4 data → optimization proposals (→ gaps/forge)."
      gate: "a detected bottleneck produces a real optimization proposal from the intelligence system."
      axioms: [§8.6, §0.4, §13.4]
      drift: "proposal quality — accepted vs rejected optimization ratio tracked."

    OB8_pattern_leverage_ratio:   # ← DONE 2026-07-30, 1264/0
      does: "Patterns get a LEVERAGE RATIO — how much impact a pattern has — so we know if it's important. High-leverage patterns surface; low-leverage ones don't."
      reuse: "§8.6 — cortex pattern storage + cfr weights; OB8 computes leverage = impact / frequency (or blast-radius-weighted)."
      gate: "a pattern's leverage ratio ranks it; a high-leverage pattern is flagged as important."
      axioms: [§13.4, §16.4, §17.5]
      drift: "leverage formula drift — the ratio's definition is versioned; recomputation on new data is tracked."

    OB10_sigma_role_intent_map:   # ← DONE 2026-07-30, 1264/0
      does: "Sigma is ONE signal serving FIVE roles (James): deviation, performance, expectations, drift-detection, leverage. Map these as an INTENT per loom component — each component declares what its sigma MEANS for it (e.g. pipeline: sigma=performance-deviation; gap-engine: sigma=drift; a contract: sigma=expectation-violation). The same computeSigma score, interpreted by the component's declared intent."
      reuse: "§8.6 — computeSigma (3 axes: structural/temporal/contextual) + loom's component declare already exist; OB10 adds a sigma_intent field per component + an interpreter that maps score→role-meaning."
      gate: "each loom component declares its sigma intent; a sigma spike is reported AS its role (a pipeline's spike reads 'performance deviation', a gap-engine's reads 'drift') — legible per component (§16.2)."
      axioms: [§8.6, §16.2, §17.5, §13.4]
      drift: "role-mapping drift — a component whose real sigma behavior no longer matches its declared intent is itself a drift signal (the map watches its own accuracy)."

    OB11_edge_case_mapping:   # ← DONE 2026-07-30, 1264/0
      does: "Start mapping EDGE CASES per component/tool/system — the known failure modes, boundary conditions, and 'this breaks when X' that diagnostics must recognize. Builds on the CA2 tool-guide edge notes; extends edge-case knowledge across loom components + systems."
      reuse: "§8.6 — CA2's tool-guide already carries per-tool edge cases; OB11 extends the SAME pattern to loom components + systems, feeding OB2 gap-detection (a known edge case hit → a recognized diagnostic, not a mystery)."
      gate: "a component's known edge cases are declared + queryable; hitting one is diagnosed by name, not as an unknown fault."
      axioms: [§8.6, §13.4, §16.2, §12.5]
      drift: "edge-case coverage — a fault that hits an UNMAPPED edge case is logged as a coverage gap (the map of edge cases grows from real failures, §13.4)."

    OB9_3d_visual_map:   # ← DONE 2026-07-30, real three.js map, no-fake law, 1273/0
      does: "A full 3D dynamic visual map of NEXUS — REAL data (no mocks, no fakes). Nodes=systems/components, edges=movement, color/motion=friction/sigma/stress. Stalls visible."

  fluidity_thread: >
    James: "co-pilot as fluid as possible; when not confident, ask me what to do,
    but improvise." This composes with what's built: lifeline ask-first (offers
    when confidence low), CA3 tool-first (tries a tool before asking), CA4 extend
    (files a gap rather than refusing). The NEW fluid behavior: when co-pilot is
    uncertain AND has no tool AND improvisation is risky, it ASKS the user with a
    specific proposed action ("I think X — do that, or tell me otherwise?") rather
    than either refusing OR guessing silently. Improvisation = try the best
    available tool/agent; ask = only when the action is consequential + uncertain.

  ordering_rationale: >
    §3.1 bottom-up: CHUNK E (the diagnostic DATA) → F (the movement MODEL over
    that data) → G (the tablet SURFACE + stream feed) → H (intelligence over the
    data) → I (the 3D VISUAL of the movement, last, heaviest, real-data-only).
    §16.1 nearest gap: 'how is nexus' giving real data (OB1) is the cheapest,
    highest-value first step and the thing James asked for most directly.

  honest_risks:
    - "§0.1/§1.1 — the 3D map (OB9) is the one most prone to faking. It ships ONLY rendering real OB3/OB4 data; no placeholder nodes. Built last so the data is real first."
    - "SCOPE — this is 9 phases across 5 chunks; it is a multi-session arc, not one build. Mapped so it's honest, built in order."
    - "§16.4 — each visual/metric (3D map, leverage ratio) must reveal something text can't, or it doesn't earn its build."
    - "Electron/WebGL phases (OB5 tablet, OB9 3D) prove out on James's machine; sandbox verifies the data feeding them."
