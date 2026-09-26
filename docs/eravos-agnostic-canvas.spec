spec:
  meta:
    name:        eravos-agnostic-canvas
    version:     1.0.0
    status:      proposed
    extends:     eravos@3.0.0
    uuid:        nexus-eravos-agnostic-canvas-v1-0000-2026-0629-jamesbrooks-001
    purpose: >
      Eravos is already a sovereign canvas with the right primitives —
      organism (spawnable unit), wire (typed connection), pack (installable
      content), transport (playback control). Today those primitives are
      scoped to audio/spatial organisms. The leverage: those four
      primitives are domain-agnostic by construction — nothing about
      "spawn a typed node, wire it to another, install more node types,
      play/stop a timeline" is audio-specific. Don't build a second canvas
      for every visualization this session has wanted — CFR field
      rendering, the causal graph, the component/wire/seam map, hot-swap
      drag-and-drop — make Eravos host all of them as organism types.

  # ── Why this is leverage, not scope creep ──────────────────────────────────
  leverage:
    - "CFR field visualization (the Gemini concept images) = an organism type. Fields/SNR-gates/constraints/solver-loop are already exactly Eravos's node+wire shape — fidelity field, attention field, entropy field as three wired organisms, sigma as the signal flowing between them."
    - "Causal graph (Causal-Nexus's traceToRoot/descendants, lib/cfr/graph.js) = an organism type. Each event is an organism, each causal edge is a wire — already the literal data shape, not a metaphor."
    - "Phase 109 EBR (clone→hypothesis→simulate→compare→crystallize) = a transport sequence. Play a hypothesis through a cloned canvas state, stop, compare against the live one."
    - "Phase 116-119 decomposition map (component/seam/wire) = an organism type. Component = organism, hook = wire, seam status = the organism's visual state (confirmed/drifting/violated as color, the same field-tension language already proven in Spotlight)."
    - "Hot-swap (Phase 118's watcher) = drag a pack into the canvas, same /api/pack/install route that already exists, no new mechanism — just a new pack content-type."
    - "One canvas, five things stop needing five separate builds. That's the leverage — not 'Eravos can do more,' but 'four things on the roadmap were already going to need a node-and-wire renderer, and one already exists, tested, sovereign, at :3751.'"

  # ── What generalizes, and what's organism-specific today ──────────────────
  generalization:
    organism:
      today: "audio/spatial node — confirmed via /api/organisms, /api/catalog"
      agnostic_core: "id, type, position, ports[] (typed in/out), render hint"
      proposed: >
        Add a `domain` field (audio | causal | field | component | custom)
        and a `renderHint` (waveform | force-node | tile | graph-node) —
        the spawn/list/remove API stays identical, only what a renderer
        does with the organism's data changes per domain.
    wire:
      today: "connects two organism hooks — audio/spatial signal routing"
      agnostic_core: "from, to, type, already typed (not just audio signal)"
      proposed: >
        Wire `type` already supports being anything — no change needed.
        A causal edge and an audio patch cable are the same primitive
        today; only the renderer's line style should differ (dashed for
        causal/observational per Causal-Nexus's own edge taxonomy, solid
        for explicit/audio).
    pack:
      today: ".zip organism pack — installs new organism *types*"
      proposed: >
        A "field-organisms" pack (fidelity/attention/entropy/SNR-gate as
        spawnable types) and a "causal-organisms" pack (event/edge as
        spawnable types) are both just packs under the existing
        POST /api/pack/install — no new install mechanism.
    transport:
      today: "play/stop — audio/spatial playback"
      proposed: >
        Generalizes to "play a sequence of canvas states" — which is
        exactly what EBR's hypothesis simulation needs (Phase 109) and
        what a causal replay needs (traceToRoot rendered as a timeline,
        not just a static path).

  # ── Honest boundary — what this spec does NOT claim ────────────────────────
  boundary:
    - "Eravos's current renderer is audio/spatial-specific (checked: ui canvas at GET / is built for that domain). Agnostic organism data flowing through the same API does not mean the existing renderer draws it correctly today — a real render-hint dispatch layer is new work, not a relabeling."
    - "This does not replace ui/tv-shell/DECOMP.md's planned causal/ channel (force graph canvas, GET /api/cfr/graph). That channel can become an Eravos organism type instead of its own bespoke canvas.js — fewer things to build, not a competing build."
    - "Not claiming any of this is built. Status: proposed. Real next step is the same as everything else this session — pick one organism type (field, since the Gemini images already spec its visual language), build it as a pack, prove it renders, then generalize."

  build_order:
    - "1. Add domain/renderHint fields to the organism schema — additive, doesn't break existing audio organisms"
    - "2. Build the field-organisms pack (fidelity/attention/entropy/SNR-gate) — the one with reference visuals already in hand"
    - "3. Prove it renders via the existing /api/organisms + /api/wires APIs, no new endpoints"
    - "4. Only then: causal-organisms pack, replacing the planned standalone causal/ channel"
    - "5. Transport generalization (EBR sequence playback) last — depends on Phase 109 itself existing"
