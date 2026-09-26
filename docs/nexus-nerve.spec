spec:
  meta:
    name:        nexus-nerve
    version:     0.2.0
    status:      proposed
    foundation:  nexus-system-foundation@1.0.0
    layer:       meta
    uuid:        nexus-nerve-v0-2000-2026-0630-jamesbrooks-001
    supersedes: >
      nexus-nerve-spec-v0.1.md — lost, never persisted to disk (§2.1
      violation). This is a from-scratch rebuild, not a recovery. v0.1
      reached 16 sections; this starts at 0 and only claims what's
      grounded against real code, read in this session, in
      nexus-consolidated__28_.
    purpose: >
      Nerve is the Attention layer of NEXUS's cognition stack. It does not
      decide. It does not act. It collapses everything CFR and the bus
      know into what's locally knowable right now, in a window of focus
      centered on where James's attention actually is. The four layers,
      restated precisely instead of poetically:

        CFR (lib/cfr/field.js)        — Truth.      What happened, frozen.
        nexus-bus.js                  — Motion.      What's happening, in transit.
        Nerve (this spec)             — Attention.   What's locally knowable now.
        ui/eravos/runtime/alk-gl.js   — Expression.  How it feels when it moves.

      §3.3 (Map Before Build) applies literally here: every claim below
      was checked against the live zip this session, not recalled. Where
      something is genuinely new (shadow space, mouse-radius gating) it
      is marked `proposed`, not `confirmed`.

  # ── §A — What already exists and what Nerve plugs into ─────────────────────
  # Per §6.2 (always read before building) and §3.3 (map before build) —
  # this is the actual substrate, checked this session, not assumed.
  grounding:
    bus:
      file:   nexus-bus.js
      status: confirmed — real, 203 lines, EventEmitter-based, in-memory
              pub/sub with a 1000-event ring history, SSE fanout, and a
              per-source stats map (_sources: emitCount, lastSeen).
      relevance: >
        Nerve's Motion layer is this file directly. Nerve does not
        re-implement a bus — it subscribes to nexus-bus's '*' wildcard
        and reads _sources for per-system presence, the same map
        guardian/cortex/etc already populate just by emitting normally.
    cfr_field:
      file:   lib/cfr/field.js
      status: confirmed — real, 234 lines. Four dimensions (coherence,
              friction, resonance, entropy), event→nudge table
              (EVENT_NUDGES), damping toward NEUTRAL=0.5 every tick,
              computeRegime() → stable/resonant/turbulent/chaotic,
              stress repulsors array {strength, life} already built
              specifically "for visual layer."
      relevance: >
        Nerve's Truth layer is this file directly, no wrapper needed.
        field.snapshot().stressCount and the stresses array are already
        shaped for exactly what Nerve needs to render — this was built
        for a consumer like Nerve and never got one. That's the gap
        Nerve closes, not new ground.
    hooks_registry:
      file:   hooks/index.js
      status: confirmed — real, unified query interface over
              hooks/*.hooks.js (10 systems: guardian, cortex,
              orchestrator, idearium, architect, bridge, emerge,
              copilot, eravos, ollama). allHooks(), bySystem(),
              byType(), withSEAM(), seamByComponent() all live.
      relevance: >
        Nerve's per-component node list comes from allHooks(), not a
        hand-maintained list. A node in the field IS a hook entry —
        one registry, not two things to keep in sync (§5.4 — versions/
        registries drift when duplicated, this avoids the duplication
        entirely).
    pulse_audit_phase_0:
      status: CONFIRMED STILL OPEN this session — re-checked directly,
              not assumed from old memory.
      finding: >
        grep for "pulse|heartbeat" across hooks/copilot.hooks.js and
        hooks/ollama.hooks.js returns zero matches in either file.
        hooks/guardian.hooks.js has two references — a 15s SSE keepalive
        comment and a 'guardian-ncp-heartbeat' related-hook reference —
        neither is a registered emitted pulse event Nerve could subscribe
        to today.
      consequence: >
        Presence-tracking (the original §9 idea: per-source heartbeat in
        the field) cannot produce real data for these three systems yet.
        Phase 0 of any Nerve build is still: add a real pulse emission to
        copilot, ollama, and guardian's hook files, or accept that those
        three nodes render permanently "unknown" instead of "stale" —
        which is itself a more honest state per §1.2 than faking a pulse.
    act_layer_spotlight:
      file:   ui/tv-shell/spotlight/spotlight.js
      status: confirmed — real, 452 lines. `Spotlight.execute(ui)` at
              line 449 dispatches to `CP.executeUI(ui)`. An `EL` element
              registry exists at line 41. This is the only confirmed
              UI-mutation channel in the codebase under this name.
      relevance: >
        Nerve never calls into Spotlight directly (see invariants below).
        If a future co-pilot wants to act on something Nerve renders,
        the path is co-pilot reads Nerve's exposed state → co-pilot
        decides → co-pilot calls Spotlight.execute(ui). Two hops. Nerve
        itself has zero lines that touch Spotlight, EL, or executeUI.
    expression_layer_particle_field:
      file:   ui/eravos/runtime/alk-gl.js
      status: confirmed — real, WebGL2, ping-pong RGBA32F textures,
              GLSL curl-noise + attractor gravity compute pass.
      key_api: >
        upsertAttractor(id, x, y, z=0, mass=1) — line 773. Already
        exists, already general-purpose (built for ERAVOS organisms as
        attractors, audio drives the field). This is the literal
        primitive shadow-space and mouse-radius gating below are built
        on — not a new renderer, a new *use* of an existing one.
      honest_gap: >
        alk-gl.js today is wired for ERAVOS organisms (audio, MediaPipe
        blendshapes). Nothing in this codebase currently calls
        upsertAttractor() with mouse coordinates or with Nerve/hook node
        data. That wiring is new work, proposed below, not found.
    fieldmonitor_living_glass:
      status: CONFIRMED ABSENT — re-checked this session via
              grep -ril "FieldMonitor|LivingGlass|Living Glass" across
              the full extracted tree. Zero matches, same as last
              session's finding.
      consequence: >
        The duplicate-build risk flagged previously is still open and
        still unresolved by absence of evidence either way. If you have
        a Living Glass zip anywhere outside what's been uploaded, hand
        it over before Phase 1 starts — this is still the first thing
        to check.
    shadow_space:
      status: proposed — NOT FOUND anywhere in the codebase under this
              name or any synonym. This is a new concept introduced this
              conversation, not a recovered one. Defined fresh below,
              deliberately grounded in existing law rather than invented
              loose.

  # ── §B — Core design: Shadow Space + mouse-radius attention ────────────────
  core:
    concept_shadow_space:
      definition: >
        The CFR field and the bus track every system's state continuously
        (§2.3 — all state must be observable). But a human only has one
        focus of attention at a time. Shadow Space is the rendering
        discipline that reconciles these two facts honestly: every node
        that exists is always present and always queryable — nothing is
        ever hidden from the data — but only nodes inside the current
        attention radius render at full fidelity. Everything else renders
        in shadow: dimmed, low-detail, but never erased, never silently
        dropped from the field.
      why_this_satisfies_axioms: >
        §1.2 (nothing silently fails) and §2.3 (all state must be
        observable) together rule out the naive version of this feature
        — a UI that only shows what's near the cursor and drops the rest.
        That would be a silent omission with a friendly name. Shadow
        Space is explicitly NOT that: a shadowed node is still in the DOM
        / still in the texture buffer / still queryable via the same
        allHooks() + CFR snapshot Nerve already reads. "Shadow" describes
        render weight, never data presence. A node that's stale or
        offline doesn't go dimmer because it's shadowed — it goes dimmer
        AND gets its own distinct stale/offline visual state, so the two
        causes (out of attention vs. actually unhealthy) are never
        visually confused. Conflating them would itself be a §1.2
        violation — a real failure hiding behind normal peripheral dimming.
      mechanics: >
        Each node (one per hook from allHooks()) carries two independent
        values every render tick: `distance` (from current attention
        center, in field-space units) and `health` (from CFR regime +
        per-source emitCount/lastSeen via nexus-bus's _sources map).
        Render weight = f(distance) only. Color/pulse state = f(health)
        only. The two never multiply into a single blended value — that
        was the exact failure mode flagged before ("you start trusting
        the field instead of the ledger") and keeping the channels
        orthogonal is the fix: dimness always means "not where you're
        looking," never "something's wrong."

    concept_mouse_radius_attention:
      definition: >
        The attention center is not fixed — it follows the mouse. A
        pointer-move listener on the Nerve canvas updates a single
        attractor, mass and position tied to cursor coordinates, via the
        existing alk-gl.js upsertAttractor() API (id: 'cursor'). Nodes
        within radius R of that attractor are "awake" — full fidelity,
        eligible for hover/click interaction. Nodes outside R are in
        shadow per above.
      grounding: >
        This is not a new rendering mechanism — upsertAttractor(id, x,
        y, z, mass) already exists and already does exactly this kind
        of gravity-well gating for ERAVOS organisms. Nerve's mouse
        attractor is one more call to a function that's already proven,
        not new GLSL, not a new compute pass.
      event_listeners: >
        Two listeners only, both passive, neither one mutates anything
        outside the render layer (§14.2 — gates are pure functions,
        applied here even though this isn't formally a SISO gate):
          - pointermove → upsertAttractor('cursor', x, y, 0, CURSOR_MASS)
          - pointerleave → removeAttractor('cursor') — attention center
            falls back to a default (e.g. field centroid, or last-known
            position with decay) rather than nodes freezing mid-state.
        Neither listener emits to nexus-bus. Attention movement is not
        a system event — it's a local rendering input. This keeps Nerve
        itself inert with respect to the bus, consistent with the
        Attention Non-Truth invariant below.
      radius_as_setting: >
        Per the Flexible Principles section of AXIOMS v3.0 ("settings
        are first-class — every fluid value has a settings surface"), R
        is not a hardcoded constant. It's a Nerve-local setting,
        adjustable, defaulting to a value tuned during Phase 1 build
        against real node density — not guessed upfront.

  # ── §C — Invariants ──────────────────────────────────────────────────────
  # Restated as engineering-review checks per the AXIOMS v3.0 §3.3-driven
  # style ("things you'd check in a code review," not named laws with
  # roman numerals) — same substance as the old §12 8-rule list, rebuilt
  # honestly since the original 8 weren't recoverable verbatim, except
  # rule 4 which survived in a direct quote and is restated here exactly.
  invariants:
    - id: attention-non-truth
      statement: >
        Nerve determines what is shown, not what is true. No system
        decision logic may be derived directly from Nerve output. Nerve
        is strictly a projection filter.
      source: >
        Quoted directly from the prior session (verified via conversation
        search this session) — the one fragment of the old §12 that
        survived verbatim. Kept word-for-word rather than paraphrased,
        since this is the rule the rest of the architecture exists to
        protect.
      enforcement_today: >
        Checked against Spotlight (ui/tv-shell/spotlight/spotlight.js)
        this session — confirmed zero references to Nerve, CFR, or
        nexus-bus inside spotlight.js. Nothing currently violates this.
        The constraint going forward: any future Nerve code must never
        import or call Spotlight.execute, EL, or CP.executeUI directly.

    - id: sense-decide-act-separation
      statement: >
        Three jobs, three modules, no shortcuts. Sense (Nerve) reads
        bus + CFR and renders. Decide (co-pilot) may read Nerve's
        exposed state as one input among others. Act (Spotlight) is the
        only channel that touches the UI. If a future feature wants
        "co-pilot acts on what Nerve sees," the path is two hops —
        co-pilot reads Nerve's state, then issues a command through
        Spotlight — never Nerve directly triggering anything.
      consequence_for_this_build: >
        Nerve's public surface this spec defines is read-only: a
        snapshot getter and a subscribe-to-changes callback. No setter,
        no command method, no event emission back onto nexus-bus. A
        module that can only be read from cannot become a control
        channel by accident later.

    - id: shadow-is-render-weight-not-data-presence
      statement: >
        A node's distance from the attention center may change its
        render weight. It may never change whether the node exists in
        the queried data, whether it's included in allHooks() iteration,
        or whether its CFR/health state updates. Shadow space dims
        pixels, not data.
      check: >
        Code review check, per §4.1 (a system that cannot be tested
        cannot be trusted): the render loop's node-iteration step and
        its node-data-update step must be two separable functions, the
        second never gated by distance. A future test should assert
        that a node 1000 units from the cursor still has a current
        `lastSeen` timestamp identical to a node 1 unit away, when both
        received the same upstream bus event.

    - id: dimness-and-health-are-orthogonal-channels
      statement: >
        Render weight (distance-driven) and color/pulse state
        (health-driven) are computed independently and never multiplied
        or blended into one value. A node can be simultaneously
        "shadowed" (far from attention) and "critical" (chaotic CFR
        regime) — both signals must be visible at once, not collapsed.
      why: >
        Direct mitigation for the previously-flagged failure mode: "you
        start trusting the field instead of the ledger." If distance and
        health blended, a critical-but-unattended node could visually
        read as merely dim/unremarkable — exactly the kind of illusion-
        of-understanding gap that turns a sense-making UI into a false
        sense of safety.

  # ── §D — Public surface (what Nerve exposes, nothing more) ─────────────────
  interface:
    NerveSnapshot:
      nodes: >
        array, one entry per hooks/index.js allHooks() result — { id,
        name, system, position {x,y}, distanceFromAttention, health
        { regime, coherence, friction, resonance, entropy } sourced
        from lib/cfr/field.js snapshot(), presence { lastSeen, emitCount,
        status: 'live'|'stale'|'unknown' } sourced from nexus-bus's
        _sources map }
      attention:
        center:  "{x, y} — current attractor position, mouse-driven"
        radius:  "R — current setting value"
      stresses: >
        passthrough of CFR field's existing stresses array
        ({ strength, life }) — already shaped for this, per grounding
        section above, no transform needed.
    methods:
      getSnapshot():  "returns NerveSnapshot — pull-based read"
      onChange(fn):   "subscribe to snapshot updates — push-based read"
      setRadius(r):   "the one mutation Nerve exposes, and it mutates
                       only Nerve's own local rendering setting, nothing
                       upstream"
    explicitly_absent: >
      No emit(), no command(), no execute(), no write path to CFR, bus,
      or hooks registry. Per the sense-decide-act-separation invariant,
      absence of these methods is the enforcement mechanism, not a
      policy comment that could be ignored.

  # ── §E — Build order ────────────────────────────────────────────────────
  # §3.1 bottom-up only. Each phase has a stated gate per §3.1's own
  # rule ("a phase does not begin until the phase below it has passing
  # tests") — gates are honest placeholders here (none built yet) per
  # §1.1, not claimed done.
  phases:
    - phase: 0
      name:  Pulse audit + fix
      work: >
        Add real pulse/heartbeat emission to copilot.hooks.js and
        ollama.hooks.js (currently zero). Confirm guardian's existing
        keepalive/heartbeat references actually correspond to an
        emitted bus event Nerve could subscribe to, or add one if not.
      gate: "node tests/[new]: each of the 10 systems in SYSTEMS map
             emits at least one event within a 30s window under normal
             operation, observable via nexus-bus._sources"
      status: not started

    - phase: 1
      name:  Nerve read layer (no rendering yet)
      work: >
        Build the NerveSnapshot interface above as a plain module —
        getSnapshot()/onChange()/setRadius() — reading allHooks(),
        cfr field snapshot(), and nexus-bus._sources. No canvas, no
        WebGL, no mouse listeners yet. Prove the data shape is correct
        before any visual work.
      gate: "getSnapshot() returns one entry per allHooks() result with
             non-null health and presence on a live system, verified
             against real running NEXUS, not mocked data (§1.3)"
      status: not started

    - phase: 2
      name:  Mouse-radius attention + shadow rendering
      work: >
        Wire pointermove/pointerleave listeners, call upsertAttractor
        on alk-gl.js's existing engine with id 'cursor', implement the
        distance-driven render-weight function as a separate code path
        from the health-driven color function per the orthogonality
        invariant.
      gate: "visual + automated check that a node's lastSeen timestamp
             is identical regardless of its current render weight
             (the shadow-is-render-weight-not-data-presence invariant,
             made testable)"
      status: not started
      depends_on: [0, 1]

    - phase: 3
      name:  FieldMonitor/Living Glass dedup check
      work: >
        Before any further build, explicitly check for a Living Glass
        zip or FieldMonitor code. If found: diff against Phase 1-2 work
        before continuing, per §4.2 (fix bugs pre-emptively / don't
        compound a duplicate-build risk that's already been flagged
        twice). If genuinely absent: note that explicitly in this spec's
        registry entry and proceed.
      status: blocked — pending James confirming whether this code
              exists anywhere outside what's been uploaded this session

  # ── §F — Registry entry (per §6.3) ──────────────────────────────────────
  registry_entry: >
    docs/SPEC-REGISTRY.md should gain a row: `nexus-nerve.spec | 0.2.0 |
    2026-06-30 | not yet checked against live code this pass — newly
    written, Phase 0 not started`. Not added automatically here since
    this spec only exists in this conversation right now — add it the
    same commit this file lands in docs/.