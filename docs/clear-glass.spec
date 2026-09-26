spec:
  meta:
    name:        clear-glass
    version:     3.1.0
    foundation:  nexus-system-foundation@1.1.0
    port:        7702
    uuid:        nexus-clear-glass-v1-0000-2026-0901-jamesbrooks-001
    status:      active
    purpose: >
      Sovereign NEXUS browser — Electron + Chromium + Firefox fingerprint +
      TLS JA4 + ErosmancerOS wire (SISO-native). Real, running system with
      no prior .spec despite being one of the most actively developed
      subsystems in this codebase (67 real components as of this session,
      confirmed in clear-glass/registry-components.js). This spec is
      written FROM that live registry-components.js contract, not from
      scratch — §8.6 reuse-before-build, applied to spec authorship itself.
    written_from: >
      clear-glass/registry-components.js (the real, served-at-GET-/contract
      module, verified by orchestrator's contract-handshake on boot) — same
      shape copilot and eravos already use. This spec restates that real
      contract in the standard system-spec shape; it does not invent new
      surface.

  core:
    ports:
      ipc:  7702   # IPC server — orchestrator polls /contract here
      sse:  7701   # SSE fan-out (also referenced by lib/version.js's
                   # own 'clear-glass' entry as the sovereign browser shell)
      tls:  7703
      wire: 7704

    axioms:
      - AX-001  validate all inputs at boundary
      - AX-002  no silent failures — bus event on error
      - AX-004  self-describing — registry-components.js served at /contract
      - AX-010  sovereign transport — no cross-system require() into this tree

  events:
    emits:
      - 'clear-glass.boot.complete'
      - 'clear-glass.window.opened'
      - 'clear-glass.registered'
      - 'clear-glass.shutdown'
      - 'eros.hostile.detected'
      - 'eros.behavior.plan'
      - 'lifecycle.ready'
      - 'nexus.status'
    handles:
      - 'orchestrator.shutdown'
      - 'cortex.raid.decide'
      - 'guardian.job.dispatch.receive'

  routes:
    - method: GET path: /contract
      returns: "Full clear-glass component registry — 67 real components as of 2026-09-01"

  handshake:
    components_count: 67
    component_families:
      - callto-index
      - download-listeners
      - site-settings
      - history
      - extensions
      - bookmarks-with-state
      - rewind
      - passwords
      - speech-to-text
      - macros
      - background-tabs
    note: >
      Every component is transport IPC, not HTTP — clear-glass is an
      Electron shell, and its real "routes" are ipcMain.handle() channels
      (method: 'IPC', path: <channel name>), not URL paths. This matches
      registry-components.js's own real shape exactly; a spec claiming
      HTTP method/path pairs for these would misrepresent the transport.

  modules:
    - id: registry-components
      path: clear-glass/registry-components.js
      description: >
        The real, live self-description contract. Served at GET /contract.
        Verified by orchestrator's contract-handshake on boot. Source of
        truth for this spec's handshake section — grew from 31 to 67
        components this session (§BL30, see docs/SPEC-REGISTRY.md and
        lib/version.js 0.39.30 for the real diff).

  history:
    - date: 2026-09-01
      summary: >
        First .spec written for clear-glass, closing one of the 11 real
        gaps orchestrator/lib/spec-drift.js's live check reported (§LM1,
        docs/2026-09-01-living-model-and-autonomous-pipeline-phasemap.spec).
        Grounded in the already-real registry-components.js contract, not
        written blind.

  gaps:
    as_of: 2026-09-01
    entries:
      - id: SM1
        type: coverage
        summary: >
          loom/scanners/spec-map.js's SPEC_DIRS allowlist does not include
          clear-glass/spec — this new spec will not be picked up by loom's
          §6.3 coverage scanner until that allowlist is extended (a
          separate, pre-existing gap, recorded in this session's foundation
          addendum, not fixed here).
        opened: 2026-09-01

  version_history:
    - version: 3.1.0
      date: 2026-09-01
      summary: "First real .spec authored, matching live code@3.1.0 exactly (no version bump required)."
      versioniumCommitId: null
