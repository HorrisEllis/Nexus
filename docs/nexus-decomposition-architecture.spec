spec:
  meta:
    name:        nexus-decomposition-architecture
    version:     1.0.0
    status:      proposed
    author:      james-brooks
    created_at:  2026-06-29T00:00:00Z
    foundation:  nexus-system-foundation@1.1.0
    uuid:        nexus-decomposition-architecture-v1-0000-2026-0629-jamesbrooks-001
    purpose: >
      One coherent design for decomposing NEXUS down to its smallest
      trackable unit, at every layer — backend and UI, code and runtime,
      structure and event. Consolidates everything from this session's
      design arc: component→file mapping, the seam/role-confidence system,
      the hook/wire registry, variable-level call tracing, UI folder
      decomposition, event/causal sensation, dual-sided handoff state, and
      universal hot-swap. Each layer below cites what's already real in
      the tree vs. what's proposed — nothing here claims to exist that
      doesn't, per §1.1.

  # ── The seven layers, smallest to largest ──────────────────────────────────
  # Each layer is a real, separately-trackable unit. Each maps onto the one
  # below it. The whole point of this spec: pick any layer, and you can walk
  # up (what does this belong to) or down (what is this made of) without
  # guessing.

  layers:

    - id: variable
      definition: >
        A single piece of state, traced through every function it passes
        through, regardless of which file or system owns each hop.
      real: >
        Proven by hand this session, not yet a tool: _cfr.sigma traced from
        cortex/boot.js's field state → (dead link, now fixed) →
        spotlight.js's pollCFR() → updateTensionField()'s baseTension →
        --cp-tension CSS variable. Showed exactly where a silent failure
        was hiding (between hop 1 and hop 2) — system-level maps didn't.
      proposed: >
        A general tool (AST walker, not a registry projector) that produces
        this trace for any variable, not just one already loaded in
        context. Separate undertaking from everything else in this spec —
        named here so it isn't lost, not scoped for the next build.

    - id: component
      definition: >
        The atomic unit of the system — one id, one file (or folder),
        one registry entry. Already the foundation's unit (§5.1, AX-007),
        just missing the file pointer.
      real: >
        component-registry.js's REQUIRED_FIELDS (id, namespace, name,
        version, grammar, route, description). descriptor-projector.js
        derives six projections per component automatically on register()
        — .comp .cli .grammar .ui .config .seam — zero-LLM, deterministic.
        185 components registered across 9 sovereign systems (verified
        count, session 3).
      proposed: >
        Add `file` (or `dir`, for multi-file UI components) to the required
        fields — but pointing a field at an existing monolith doesn't
        decompose anything. `guardian/server.js` is ~4000 lines with every
        component's CLI handling, API routes, and dispatch logic
        interleaved; a `file` pointer into that just labels the haystack.
        The actual ask, sharpened 2026-06-29: split each system's monolith
        by *concern* first — `cli.js` (command parsing/dispatch only),
        `api.js` (route handlers only), one file per concern, not per
        component yet — then the registry's `file` field can point at a
        real, small, single-purpose file. Per-component file splitting is
        the generalization of that, once per-concern splitting proves the
        pattern on one system.

    - id: seam
      definition: >
        A component's trust state over time — not just "does this exist"
        but "is this still behaving the way its contract said it would."
      real: >
        docs/seam-component-registry.spec already defines this fully:
        role_confidence (0.0-1.0), status (confirmed|drifting|violated),
        drift_score, violations[]. Read directly this session.
      proposed: >
        Zero code implements this state machine anywhere — checked
        directly, only match in the whole tree was my own docstring in
        cortex/core/raid/index.js describing it as a stub. This is real
        work, not a wiring fix: a tracker that updates role_confidence from
        actual dispatch/test outcomes per component, the same way RAID's
        _health tracks per-agent outcomes today but doesn't yet track
        per-component ones.

    - id: wire
      definition: >
        A declared, typed connection between two components or systems —
        the edge in the graph the component layer's nodes sit in.
      real: >
        hooks/index.js + 10 hooks/<system>.hooks.js files. 80 hooks across
        all 10 sovereign systems (was 6 of 10 before session 5's backfill),
        21+ SEAM-tracked. Declarative — documents the wire, doesn't drive
        runtime dispatch. Most systems still call each other via direct
        hardcoded HTTP, bypassing the registry. Two real exceptions this
        session: idearium→copilot SSE (§AX-008), RAID→guardian dispatch
        (handshake via GET /providers before send).
      proposed: >
        Nothing new structurally — the schema's right. What's missing is
        coverage: more of the hardcoded HTTP calls should register as real
        hooks.out entries the way the two exceptions above do, so the
        declared graph and the actual runtime graph converge.

    - id: ui
      definition: >
        Same component shape, applied to the frontend — one folder, one
        html/css/js set, one registry entry, callable over HTTP without
        touching the shell.
      real: >
        ui/tv-shell/spotlight/ and menu.js already prove this pattern: own
        JS/CSS, zero coupling to ui/home's monolith, HTTP-callable
        (POST /api/ui/spotlight/on etc). ui/themes/{nexus-dark,light}.css
        already is the root-level themes folder this design calls for —
        confirmed existing, Phase 91. ui/tv-shell/DECOMP.md already plans
        8 more channels (causal, log, diagnose, rewind, ...) in this same
        shape — none built yet past Menu and Spotlight.
      proposed: >
        Add the html third: today Spotlight/Menu share the shell's HTML,
        every UI component should have its own .html fragment too. Apply
        the folder shape to every planned channel, not just the two done.
        Each UI component is a `component` (layer above) with the same
        `file` field — just pointing at a folder instead of one file.

    - id: event
      definition: >
        Every interaction, fault, and handoff is a typed, persisted,
        causally-chained record — sensation, not just logging.
      real: >
        cortex's event_log (jaaDB-backed). causedBy added to POST /api/event
        this session — was missing, no way to chain without it. Spotlight's
        click handler now emits real events instead of an in-memory array,
        chained via _lastEventId. Causal-Nexus.zip's traceToRoot()/
        descendants() and CalltoMap (register/resolve/orphan-detect a UI
        interaction) — read directly, real, not yet adopted into NEXUS's
        own lib/cfr/graph.js (which has the same shape — ancestors/
        descendants/jobChain — needs a real diff before choosing one, not
        assumed redundant or assumed needed).
      proposed: >
        Dual-sided handoff events (this session's newest piece, see below)
        — one event row carries both sides' variable state at the moment
        of handoff, not two separately-correlated logs.

    - id: handoff
      definition: >
        The moment state crosses a wire — and the one place a bug is most
        likely to be neither system's fault alone, but the gap between
        what one assumed and the other actually had.
      real: >
        RAID→guardian dispatch (this session): checks GET /providers as a
        real handshake before sending, not a courtesy ping. Currently logs
        only that the handoff happened and whether it succeeded.
      proposed: >
        One event row per handoff carrying `from` (the sending system's
        relevant variables at decision time — e.g. RAID's agent/cluster/
        cfrSigmaFloor/reason) and `to` (the receiving system's variables at
        receipt — e.g. guardian's connected/jobId/queuePosition), causedBy-
        chained to the event before it. traceToRoot() on a downstream
        failure then walks a chain where every link shows both sides, not
        just that A called B.

  # ── Hot-swap: the mechanism that makes every layer above actionable ───────
  hotswap:
    real: >
      lib/hot-loader.js's load({modulePath, src, invariants, monitorMs,
      rollback}) — read directly, not a stub. Generic over any file path.
      drop→QUARANTINE→PROVE(invariants)→INTEGRATE(snapshot first, §2.1,
      backs up existing file)→MONITOR(60s sigma watch)→ROLLBACK on failure.
      Phase 14, marked complete before this session, verified for real here.
    proposed: >
      Nothing calls load() automatically today — checked, no watcher exists.
      Needs: (1) the component→file field above, so a dropped file resolves
      to a component and its declared invariants; (2) a watcher — drop
      folder or drag-and-drop UI target — that does that resolution and
      calls load(); (3) the interaction contract supplies what PROVE checks
      (hooks, grammar, routes already declared, nothing new to schema).
    end_state: >
      Every component anywhere in NEXUS — backend or UI — is one folder
      with its file(s), one registry entry pointing at that folder, one
      hot-load path that can safely swap it. Backend and frontend stop
      being different cases of the same idea. Scope is explicitly all 9
      sovereign systems (cortex, guardian, copilot, idearium, architect,
      bridge, emerge, ollama, eravos) plus every UI channel — guardian's
      server.js and Spotlight are proof cases to prove the pattern works
      and tests still pass, not a smaller final scope. §3.1 (bottom-up,
      prove on one before generalizing) governs the order this gets built
      in, not how far it eventually reaches.

  # ── How the layers hook together ───────────────────────────────────────────
  composition: >
    variable (traced through) → component (the file/folder it lives in) →
    seam (that component's trust state over time) → wire (how it connects
    to others) → event (what happens when it's used) → handoff (the moment
    state crosses a wire, both sides recorded) → hot-swap (the mechanism
    that lets any layer above be replaced safely, in place, while the
    system runs). UI components are components like any other — same file
    field, same registry entry, same hot-swap path — the seven-layer model
    doesn't fork for frontend vs. backend.

  # ── Build order, bottom-up per §3.1 — not all at once ──────────────────────
  build_order:
    - "1. component.file field — small set of real components as proof, not all 185 at once"
    - "2. lib/system-manifest.js surfaces it"
    - "3. seam tracker — role_confidence from real dispatch outcomes, same pattern as RAID's _health"
    - "4. watcher — calls hot-loader.load() against the proof set"
    - "5. UI components join: Spotlight first (already has js/css, needs html split + registry entry)"
    - "6. dual-sided handoff events — wire into RAID→guardian path, already built and tested"
    - "7. generalize past the proof set only once steps 1-6 are verified end-to-end"

  open_questions:
    - "lib/cfr/graph.js vs Causal-Nexus's causality module — real diff needed, not assumed either way"
    - "seam tracker's role_confidence formula — what counts as a 'violation' per component-type, not yet defined"
    - "watcher trigger — literal filesystem drop folder, or a UI drag-and-drop target, or both"
