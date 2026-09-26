spec:
  # ⚠️ SUPERSEDED 2026-06-29. AX-008 and AX-009 are promoted into
  # docs/nexus-system-foundation.spec v1.1.0 — that's the living copy now.
  # Kept here as historical record of where they originated; don't edit
  # this file going forward, edit the base spec.
  #
  meta:
    name:        nexus-system-foundation-addendum
    version:     1.1.0
    extends:     nexus-system-foundation@1.0.0
    author:      james-brooks
    status:      proposed
    uuid:        nexus-system-foundation-addendum-v1-0000-2026-0627-jamesbrooks-001
    purpose: >
      Two additive requirements found missing while cross-referencing the
      foundation spec against what's actually registered. Neither breaks
      L0-L5 — both slot into the existing layers. Minor version bump only.

  # ── AX-008: Co-pilot Reachability ───────────────────────────────────────────
  # What's actually true today, checked against every registry-components.js:
  # copilot, cortex, guardian, and ollama already wire hooks.out → copilot.*.
  # bridge, idearium, architect, emerge, diagnostic do not. Nothing requires
  # them to. The mechanism exists; it's just not universal.

  axiom_AX-008:
    statement: >
      Every component's hook graph must reach copilot.* within N hops,
      either directly (hooks.out wires_to a copilot.* id) or transitively
      (wires_to a component that itself reaches copilot.*).
    enforced_in: [handshake, enforcement]
    rationale: >
      Co-pilot is supposed to be able to see and reason about everything
      NEXUS does (per Phase 68's "sovereign, stream-of-consciousness").
      A component with no path to copilot.* is invisible to it by
      construction, not by decision — that's a silent gap, not a choice.
    enforcement_mechanism: >
      Add as invariant #26 in rfr2/packages/nexus/src/enforcement's
      BoundaryIndex (25 invariants today — see phase-95-enforcement bundle).
      RuntimeGuard checks this at component-registration time, same path
      OL-1's 82-component check already runs through.
    not_required_for:
      - health/contract/events routes (L3 required_routes — infrastructure,
        not capability, exempt by default)
      - L5 UI components (read-only by L5's own axiom AX-006)

  # ── L4-EXTERNAL: Foreign System Handshake ───────────────────────────────────
  # L4 as written assumes the peer is one of the 9 known internal services
  # (shared secret in bridge/identity.js's SYSTEM_SECRETS map). That's the
  # right model for known, trusted, co-located services. It has no answer
  # for "another sovereign NEXUS-family project wants to talk to this one" —
  # different deployment, not pre-shared, not necessarily fully trusted yet.

  layer_4_external_handshake:
    applies_when: >
      The peer is not in SYSTEM_SECRETS — a separate sovereign project
      (Bridge OS, a future NEXUS-family system, anything not booted as
      part of this orchestrator's known 9).
    distinguishes_from_internal: >
      Internal L4 (bridge/identity.js): shared secret → session token.
      Pre-shared, fully trusted, known set, never grows at runtime.
      External L4: no pre-shared secret. Trust is established and decays
      continuously, not granted once at registration.
    source: kern-v2 (identity.js, handshake.js, gate.js) — re-scoped from
      "untrusted mesh peer" to "known-but-foreign sovereign system."
    mechanism:
      - Ed25519 keypair per system (identity.js) — not a shared secret,
        a provable identity that doesn't require Bridge to have issued it.
      - handshake.js's grammar intersection: peers exchange their L2
        grammar trees during handshake and negotiate the commands they
        actually share — this is the cross-project compatibility layer.
        Two NEXUS-shaped systems with different component sets discover
        what they can ask each other for, automatically, at handshake time.
      - AES-256-GCM session encryption post-handshake, nonce-based replay
        protection (sequence tracking per peer).
      - gate.js's continuous sigma/regime trust decay instead of bridge's
        discrete UNKNOWN→CANDIDATE→MEMBER→SUSPENDED→DEAD state machine —
        appropriate here because an external system's trustworthiness is
        a moving target in a way an internal service's isn't.
    explicitly_not: >
      A replacement for bridge/identity.js. Internal services keep the
      shared-secret model — it's simpler and correct for that case.
      This is a second, parallel L4 path for a different peer category.
