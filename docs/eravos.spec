spec:
  meta:
    name:        eravos
    version:     3.0.0
    foundation:  nexus-system-foundation@1.0.0
    port:        3751
    uuid:        nexus-eravos-v3-0000-2026-0627-jamesbrooks-001
    purpose: >
      Sovereign canvas system. Organisms, wires, audio, spatial transport.
      Moved from ui/eravos/ to its own sovereign service (Phase 74).

  # 🔴 This spec did not exist before this pass — eravos had no docs/eravos.spec
  # at all, despite being a real sovereign system since Phase 74 (2026-06-27,
  # session 1) with its own port, its own registry-components.js, and its
  # own exported events{} object. Everything below is read directly out of
  # eravos/registry-components.js's module.exports — not inferred.
  #
  # Also flagging: eravos has NO entry in lib/version.js's services{} map at
  # all — neither does copilot. That file's own header calls itself "the
  # single source of truth for all system and module versions," and two
  # real, running sovereign systems aren't in it. Suggested addition:
  #   services: {
  #     ...
  #     eravos:   '3.0.0',   // :3751 — sovereign canvas, organisms/wires/transport
  #     copilot:  '<check copilot/server.js for its real version string>',
  #   }
  # Not applied here — that file is yours to edit, this just documents the gap.

  core:
    schemas: {}
    axioms: [AX-001, AX-002, AX-007]
    constants: {}

  events:
    emits:
      - "eravos.booted"
      - "eravos.organism.spawned"
      - "eravos.organism.removed"
      - "eravos.wire.connected"
      - "eravos.wire.disconnected"
      - "eravos.pack.queued"
      - "eravos.transport.play"
      - "eravos.transport.stop"
    handles:
      - "guardian.organism-queue.push"
      - "raid.dispatch.eravos"
      - "orchestrator.shutdown"

  routes:
    external:
      - { method: GET,    path: /,                    description: "Main ERAVOS canvas — organisms, wires, transport" }
      - { method: GET,    path: /health,               description: "ERAVOS health" }
      - { method: GET,    path: /contract,             description: "ERAVOS interaction contract" }
      - { method: POST,   path: /api/organisms,        description: "Spawn an organism by id onto the canvas" }
      - { method: GET,    path: /api/organisms,        description: "List all mounted organisms" }
      - { method: DELETE, path: "/api/organisms/:uuid", description: "Remove an organism" }
      - { method: POST,   path: /api/wires,            description: "Connect two organism hooks" }
      - { method: GET,    path: /api/wires,             description: "List all wires" }
      - { method: GET,    path: /api/catalog,          description: "Available organisms from registry" }
      - { method: POST,   path: /api/pack/install,      description: "Install a .zip organism pack" }
      - { method: POST,   path: /api/transport/play,    description: "Start playback" }
      - { method: POST,   path: /api/transport/stop,    description: "Stop playback" }

  handshake:
    components:
      - { id: "eravos.canvas",            route: { method: GET,    path: "/" } }
      - { id: "eravos.health",            route: { method: GET,    path: "/health" } }
      - { id: "eravos.contract",          route: { method: GET,    path: "/contract" } }
      - { id: "eravos.organism.spawn",    route: { method: POST,   path: "/api/organisms" },
          hooks: { out: ["cortex.raid.feedback"] } }
      - { id: "eravos.organism.list",     route: { method: GET,    path: "/api/organisms" } }
      - { id: "eravos.organism.remove",   route: { method: DELETE, path: "/api/organisms/:uuid" } }
      - { id: "eravos.wire.connect",      route: { method: POST,   path: "/api/wires" } }
      - { id: "eravos.wire.list",         route: { method: GET,    path: "/api/wires" } }
      - { id: "eravos.catalog.list",      route: { method: GET,    path: "/api/catalog" } }
      - { id: "eravos.pack.install",      route: { method: POST,   path: "/api/pack/install" } }
      - { id: "eravos.transport.play",    route: { method: POST,   path: "/api/transport/play" } }
      - { id: "eravos.transport.stop",    route: { method: POST,   path: "/api/transport/stop" } }

  # ── AX-008 (foundation addendum v1.1.0) ────────────────────────────────────
  # 🔴 OPEN — only organism.spawn has a hooks.out, and it wires to
  # cortex.raid.feedback, not copilot, and not verified to chain onward
  # (same caveat as emerge.spec — needs a live check, not an assumption).
  # eravos.organism.spawned / removed / wire.connected — three of the eight
  # real emitted events — have no component wiring them anywhere.

  ui:
    type: "sovereign — own canvas, not a nexus-shell panel"
    hotswap: true

  tests:
    - "organism.spawn rejects an unknown organism id with explicit error, never silent pass"
    - "wire.connect rejects a wire between two hooks with incompatible schemas"
    - "pack.install validates zip contents against organism schema before mounting"
