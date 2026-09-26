spec:
  meta:
    name:        eravos
    version:     3.17.0   # §2026-09-20 bump — app layer (mods/runtime/specs/
                          # kernel/behaviors/workspace/index.html/manifest.json)
                          # replaced wholesale with the v3-17 standalone catalog
                          # export. server.js, config.js, registry-components.js,
                          # data/ (incl. its own per-system ledger), and the
                          # nexus-taxonomy schemas (schema.component/system/node/
                          # hook/capability/command) were NOT touched — the
                          # catalog doesn't know about Nexus and never should
                          # overwrite the integration layer. Same pass renamed
                          # "organism" -> "mod" everywhere in this system, code
                          # and paths, catalog and root (0 residual references).
    foundation:  nexus-system-foundation@1.0.0
    port:        3751
    uuid:        nexus-eravos-v3-0000-2026-0627-jamesbrooks-001
    purpose: >
      Sovereign canvas system. Mods, wires, audio, spatial transport.
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
  #     eravos:   '3.0.0',   // :3751 — sovereign canvas, mods/wires/transport
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
      - "eravos.mod.spawned"
      - "eravos.mod.removed"
      - "eravos.wire.connected"
      - "eravos.wire.disconnected"
      - "eravos.pack.queued"
      - "eravos.transport.play"
      - "eravos.transport.stop"
    handles:
      - "guardian.mod-queue.push"
      - "raid.dispatch.eravos"
      - "orchestrator.shutdown"

  routes:
    external:
      - { method: GET,    path: /,                    description: "Main ERAVOS canvas — mods, wires, transport" }
      - { method: GET,    path: /health,               description: "ERAVOS health" }
      - { method: GET,    path: /contract,             description: "ERAVOS interaction contract" }
      - { method: POST,   path: /api/mods,        description: "Spawn an mod by id onto the canvas" }
      - { method: GET,    path: /api/mods,        description: "List all mounted mods" }
      - { method: DELETE, path: "/api/mods/:uuid", description: "Remove an mod" }
      - { method: POST,   path: /api/wires,            description: "Connect two mod hooks" }
      - { method: GET,    path: /api/wires,             description: "List all wires" }
      - { method: GET,    path: /api/catalog,          description: "Available mods from registry" }
      - { method: POST,   path: /api/pack/install,      description: "Install a .zip mod pack" }
      - { method: POST,   path: /api/transport/play,    description: "Start playback" }
      - { method: POST,   path: /api/transport/stop,    description: "Stop playback" }

  handshake:
    components:
      - { id: "eravos.canvas",            route: { method: GET,    path: "/" } }
      - { id: "eravos.health",            route: { method: GET,    path: "/health" } }
      - { id: "eravos.contract",          route: { method: GET,    path: "/contract" } }
      - { id: "eravos.mod.spawn",    route: { method: POST,   path: "/api/mods" },
          hooks: { out: ["cortex.raid.feedback"] } }
      - { id: "eravos.mod.list",     route: { method: GET,    path: "/api/mods" } }
      - { id: "eravos.mod.remove",   route: { method: DELETE, path: "/api/mods/:uuid" } }
      - { id: "eravos.wire.connect",      route: { method: POST,   path: "/api/wires" } }
      - { id: "eravos.wire.list",         route: { method: GET,    path: "/api/wires" } }
      - { id: "eravos.catalog.list",      route: { method: GET,    path: "/api/catalog" } }
      - { id: "eravos.pack.install",      route: { method: POST,   path: "/api/pack/install" } }
      - { id: "eravos.transport.play",    route: { method: POST,   path: "/api/transport/play" } }
      - { id: "eravos.transport.stop",    route: { method: POST,   path: "/api/transport/stop" } }

  # ── AX-008 (foundation addendum v1.1.0) ────────────────────────────────────
  # 🔴 OPEN — only mod.spawn has a hooks.out, and it wires to
  # cortex.raid.feedback, not copilot, and not verified to chain onward
  # (same caveat as emerge.spec — needs a live check, not an assumption).
  # eravos.mod.spawned / removed / wire.connected — three of the eight
  # real emitted events — have no component wiring them anywhere.

  ui:
    type: "sovereign — own canvas, not a nexus-shell panel"
    hotswap: true

  tests:
    - "mod.spawn rejects an unknown mod id with explicit error, never silent pass"
    - "wire.connect rejects a wire between two hooks with incompatible schemas"
    - "pack.install validates zip contents against mod schema before mounting"
