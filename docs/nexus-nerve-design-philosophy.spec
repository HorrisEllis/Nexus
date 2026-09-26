spec:

  # ════════════════════════════════════════════════════════════════
  # NEXUS NERVE — Design Philosophy
  # ════════════════════════════════════════════════════════════════
  #
  # James: "extract the style and make a design philosophy for BrainOS,
  # nexus nerve, that way co-pilot can interact with it."
  #
  # This is not a new theme. Every value below is read directly out of
  # ui/themes/nexus-dark.css — the real, already-established sovereign
  # theme — and out of nexus/ui/brainos/*, the first real UI built
  # against it this session. Nothing here is invented; this document
  # exists so an agent (co-pilot, or any other) generating new UI can
  # match real, existing convention without re-reading nexus-dark.css's
  # raw CSS every time.
  # ════════════════════════════════════════════════════════════════

  meta:
    name: nexus-nerve-design-philosophy
    version: 0.1.0
    uuid: nexus-nerve-design-philosophy-v1-0000-2026-0903-001
    status: specced
    canonical_theme_file: "ui/themes/nexus-dark.css"

  # ────────────────────────────────────────────────────────────────
  §1_ONE_REAL_THEME_FILE:
  # ────────────────────────────────────────────────────────────────
    rule: >
      Every color, radius, font, and spacing value a real UI uses comes
      from a var(--...) declared in ui/themes/nexus-dark.css. No UI
      file declares its own :root color variables. "Swap this file to
      reskin everything" (nexus-dark.css's own stated §L5 principle) is
      only true if nothing else defines a competing palette.

    §HONEST_KNOWN_VIOLATION: >
      ui/guardian/index.html (the page currently served at guardian's
      real /cockpit route) declares its OWN separate :root block
      (--void:#06050a, --amber:#ffaa00, --cyan:#00e5ff, --green:#00ff88,
      --red:#ff3355, --text:#e0d8ff, etc.) — different variable NAMES
      and different actual hex values from nexus-dark.css's real
      tokens. Confirmed by reading both files directly this session,
      not assumed. This is the one real, named exception to §1's rule
      today — flagged here rather than silently matched by a new UI
      that copies the wrong one. New UI should use nexus-dark.css, the
      canonical file this spec is built from. Reconciling cockpit's own
      page to nexus-dark.css is real, separate, not-yet-scoped work.

  # ────────────────────────────────────────────────────────────────
  §2_REAL_TOKEN_TABLE — every var below exists in ui/themes/nexus-dark.css today:
  # ────────────────────────────────────────────────────────────────
    surfaces:
      --void:   "#00000f — deepest background, canvas/full-screen areas"
      --ink:    "#080814 — page background"
      --plate:  "#0d0d1f — card/panel background (BrainOS's own panel uses this)"
      --panel:  "#111128 — nested panel background (BrainOS's titlebar uses this)"
      --edge:   "#1e1e3a — subtle divider"
      --rim:    "#2a2a4a — border, faint structure (BrainOS's own panel border)"

    text:
      --muted:  "#4a4a7a — disabled text, timestamps"
      --dim:    "#7070a0 — secondary text"
      --text:   "#d0d4f0 — primary text"
      --bright: "#eeeeff — headings, emphasis"

    accent: >
      --ac is an ANIMATED hue (192→240→192, cyan to blue-violet, 8s
      cycle) — the one real piece of ambient motion this codebase's own
      theme intentionally allows, distinct from and not a violation of
      BrainOS's own §NO_DECORATIVE_MOTION axiom (that axiom governs
      DATA visualization, not the theme's own identity chrome — the
      accent hue cycling is not standing in for a real event). --ac-dim,
      --ac-ghost, --ac-border, --ac-border-hi are pre-computed alpha
      variants — never write rgba(0,212,255,X) by hand, use these.

    status_colors_never_animated:
      --ok:    "#00ff88"
      --err:   "#ff3355"
      --warn:  "#ffaa00"
      rule: "status colors are stable — a status dot's color choice signals real state, animating it would compete with §NO_DECORATIVE_MOTION's own signal."

    per_system_identity_colors: >
      --sys-orch (orchestrator, indigo), --sys-gd (guardian, amber),
      --sys-cx (cortex, emerald), --sys-br (bridge, cyan), --sys-idr
      (idearium, blue), --sys-arch (architect, orange), --sys-em
      (emerge, violet), --sys-dg (diagnostic, sky), --sys-er (eravos,
      violet), --sys-ol (ollama, green), --sys-cp (copilot, magenta).
      A new system-specific UI element should use its OWN --sys-* color,
      not --ac or an invented one.

    typography:
      --font-mono:    "Space Mono / Fira Code — data, timestamps, ids, event types"
      --font-body:    "Space Grotesk / Inter — everything else"
      --font-display: "Bebas Neue — headers/wordmarks/panel titles only (BrainOS's own .brainos-title uses this)"

    geometry:
      --r:    "6px — base radius (buttons, small elements)"
      --r-lg: "14px — card/panel radius (BrainOS's own panel uses this)"
      --gap:  "16px — standard spacing unit"

  # ────────────────────────────────────────────────────────────────
  §3_REAL_COMPONENT_PATTERNS — extracted from nexus/ui/brainos/brainos.css, the first real UI built to this philosophy:
  # ────────────────────────────────────────────────────────────────
    floating_panel: >
      position:fixed, background:var(--plate), border:1px solid
      var(--rim), border-radius:var(--r-lg), a titlebar strip
      (background:var(--panel), border-bottom:1px solid var(--edge))
      that is the real drag handle — cursor:grab / cursor:grabbing on
      :active. This is the real, reusable "floating panel" pattern; any
      future overlay UI (not just BrainOS) should match this shape
      rather than inventing a new one.

    status_dot: >
      A 7-8px circle, background:var(--muted) at rest, switching to a
      real status color (var(--ok) or var(--err)) with a matching
      box-shadow glow ONLY on a real state change — never a default-on
      color that has to be explained away as "usually means fine."

    section_label: >
      font-family:var(--font-mono), font-size:10px, font-weight:700,
      letter-spacing:.12em, text-transform:uppercase, color:var(--dim).
      Used for any "SYSTEMS" / "LIVE EVENTS" style section header —
      matches the pre-existing .field-lbl / .slbl pattern already found
      in ui/guardian/index.html's own (non-canonical, per §1) local
      styles, kept here because the PATTERN is right even where that
      file's color values are not.

    live_event_row: >
      font-family:var(--font-mono), font-size:10px, a timestamp in
      var(--muted) and an event type in var(--ac), one row per real
      event, newest first, no more than a bounded real count retained
      (BrainOS caps at maxEventRows*3 — a real, named cap, not unbounded
      growth) — never a synthesized or replayed-on-idle row.

    badge: >
      font-family:var(--font-mono), font-size:9px, pill-shaped
      (border-radius:20px), border:1px solid var(--ac-border),
      color:var(--ac), background:var(--ac-ghost). Used for small,
      real, static metadata (a version number, a count) — not a status
      indicator (that's the status_dot pattern above).

  # ────────────────────────────────────────────────────────────────
  §4_MOTION_RULE — carried forward from docs/brainos-live-control-panel.spec's own §NO_DECORATIVE_MOTION axiom, generalized for any future UI built to this philosophy:
  # ────────────────────────────────────────────────────────────────
    rule: >
      A visual change is only real if a real event caused it. Before
      adding any animation, transition, or state change to a new UI
      component, name the real event (an SSE message, a real fetch
      response, a real user action like mousedown) that causes it. If
      the honest answer is "nothing, it just runs on a timer" — that is
      decorative motion and does not belong in UI built to this
      philosophy. (Exception: --ac's own hue-cycle animation, §2 above —
      theme identity chrome, not a data signal.)

  # ────────────────────────────────────────────────────────────────
  §5_FOR_COPILOT — the real, intended reader of this document:
  # ────────────────────────────────────────────────────────────────
    rule: >
      When generating or modifying UI in this codebase, read this file
      before ui/themes/nexus-dark.css's raw CSS — this file names which
      tokens exist and what they real-world mean (§2), and which shapes
      are already proven components (§3), so new UI matches existing
      convention on the first attempt rather than needing a second pass
      to fix an invented color or a re-derived component shape. To
      actually DRIVE a mounted UI component (not just style a new one),
      use that component's own interaction-contract.json (e.g.
      nexus/ui/brainos/brainos-interaction-contract.json) — this file is
      the STYLE reference, that file is the ACTION reference. They are
      deliberately separate documents for two separate real questions
      ("how should this look" vs "what can I actually call").
