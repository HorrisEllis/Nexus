spec:
  meta:
    name:        architect
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    port:        3747
    uuid:        nexus-architect-v1-0000-2026-0627-jamesbrooks-001
    purpose: >
      Spec builder, hook registry, blueprint scanner. The design surface
      for hooks (named, typed, wireable contracts) and blueprints (path
      scan → gap/component map).

  # 🔴 THREE-WAY VERSION DRIFT FOUND, NOT JUST SPEC-VS-CODE:
  #   lib/version.js declares architect@1.0.0 (the canonical source, by
  #     its own header comment).
  #   This spec previously said 2.0.0 (an aspirational v2 design — template
  #     library, architecture viewer, 5-panel UI — that was never built;
  #     none of its routes exist in architect/registry-components.js).
  #   architect/service.js's own boot event hardcodes a THIRD number:
  #     busEmit('architect.booted', { version: '3.0.0', ... }) — line 621.
  #     That hardcoded string is a code bug, not a docs problem — it
  #     should read VERSION.services.architect from lib/version.js
  #     instead of a literal. Flagging here since spec-drift.js's
  #     mechanical check only sees two of these three sources.
  # Synced this spec to 1.0.0 — what's actually running. The v2 content
  # is preserved below as v2_proposed, not deleted, per §A-4 (living docs
  # are append-only).

  core:
    schemas:
      Hook:
        uuid, name, direction, event_type, wire_type, schema,
        contract_version, failure_mode, registeredBy, ts
      Blueprint:
        id, name, version, source, snrScore, hooks[], surfaces[],
        constraints[], gaps[], tensions[], baseline
    axioms: [AX-001, AX-002, AX-007]
    constants: {}

  events:
    emits:
      - "architect.booted"
      - "architect.hook.registered"
      - "architect.snr.routed"
      - "architect.utl.processed"
      - "architect.map.scanned"
      - "architect.gap.opened"
    handles: []

  routes:
    external:
      - { method: GET,    path: /health,                description: "Architect health + hook counts" }
      - { method: GET,    path: /api/contract,           description: "Architect interaction contract" }
      - { method: GET,    path: /api/hooks,               description: "Hook registry — all declared hooks" }
      - { method: GET,    path: /api/hooks/:id,           description: "Single hook detail" }
      - { method: POST,   path: /api/hooks,               description: "Register a new hook" }
      - { method: PATCH,  path: /api/hooks/:id,           description: "Update hook metadata" }
      - { method: DELETE, path: /api/hooks/:id,           description: "Deprecate or remove hook" }
      - { method: POST,   path: /api/hooks/wire,          description: "Wire two hooks together" }
      - { method: GET,    path: /api/hooks/validate,      description: "Validate all hooks against invariants" }
      - { method: GET,    path: /api/hooks/graph,         description: "Hook topology graph (json|mermaid)" }
      - { method: POST,   path: /api/hooks/check,         description: "Check hook against constraints" }
      - { method: GET,    path: /api/blueprint,           description: "Blueprint list" }
      - { method: POST,   path: /api/blueprint/scan,      description: "Scan path → generate blueprint" }
      - { method: POST,   path: /api/blueprint/diff,      description: "Diff two blueprints" }
      - { method: GET,    path: /api/blueprint/history,   description: "Blueprint change history" }
      - { method: POST,   path: /api/blueprint/route,     description: "Route intent via blueprint" }
      - { method: GET,    path: /api/map,                 description: "System topology maps" }

  # This list now matches architect/registry-components.js exactly — 17 components.
  handshake:
    components:
      - { id: "architect.health",          route: { method: GET,    path: "/health" } }
      - { id: "architect.contract",        route: { method: GET,    path: "/api/contract" } }
      - { id: "architect.hooks.list",      route: { method: GET,    path: "/api/hooks" } }
      - { id: "architect.hook.get",        route: { method: GET,    path: "/api/hooks/:id" } }
      - { id: "architect.hook.register",   route: { method: POST,   path: "/api/hooks" } }
      - { id: "architect.hook.update",     route: { method: PATCH,  path: "/api/hooks/:id" } }
      - { id: "architect.hook.deprecate",  route: { method: DELETE, path: "/api/hooks/:id" } }
      - { id: "architect.hook.wire",       route: { method: POST,   path: "/api/hooks/wire" }, hooks: { out: ["cortex.cfr.graph"] } }
      - { id: "architect.hooks.validate",  route: { method: GET,    path: "/api/hooks/validate" } }
      - { id: "architect.hooks.graph",     route: { method: GET,    path: "/api/hooks/graph" } }
      - { id: "architect.hooks.check",     route: { method: POST,   path: "/api/hooks/check" } }
      - { id: "architect.blueprint.list",  route: { method: GET,    path: "/api/blueprint" } }
      - { id: "architect.blueprint.scan",  route: { method: POST,   path: "/api/blueprint/scan" } }
      - { id: "architect.blueprint.diff",  route: { method: POST,   path: "/api/blueprint/diff" } }
      - { id: "architect.blueprint.history",route:{ method: GET,    path: "/api/blueprint/history" } }
      - { id: "architect.blueprint.route", route: { method: POST,   path: "/api/blueprint/route" } }
      - { id: "architect.map",             route: { method: GET,    path: "/api/map" } }

  # ── AX-008 (foundation addendum v1.1.0) ────────────────────────────────────
  # 🔴 OPEN — checked all 17 components in architect/registry-components.js.
  # Only hook.wire has any hooks.out, and it wires to cortex.cfr.graph, not
  # copilot. architect.gap.opened (a real emitted event, see events: above)
  # has no component/hook wiring it anywhere — that's the most useful one
  # to wire to copilot.* first, since a structural gap copilot can't see is
  # the exact failure mode AX-008 exists to catch.

  ui:
    type: panel in nexus-shell
    hotswap: true

  tests:
    - "Hook registration rejects duplicate (name, event_type) pairs"
    - "Wiring two hooks emits architect.hook.wire and a cortex.cfr.graph edge"
    - "Blueprint scan produces same output for same path + same file states (determinism, §CC-002)"
    - "architect.booted payload version matches lib/version.js, not a hardcoded literal"

  # ── v2_proposed (NOT BUILT) ────────────────────────────────────────────────
  # Preserved from the previous version of this spec, unbuilt. None of these
  # routes exist in architect/registry-components.js today. Kept per §A-4 —
  # append-only, this was real design intent, not deleted, just relabeled
  # honestly as proposed rather than current.
  v2_proposed:
    template_library:
      description: >
        Idea → pick template → fill variables → FORGE builds it.
      template_types: [organism, behavior, automation, orchestration, cognitive, genome, ecosystem, service, cli_command]
      api_routes:
        - GET  /api/templates
        - GET  /api/templates/:id
        - POST /api/templates/:id/apply
        - POST /api/templates
        - GET  /api/templates/search?q=
    architecture_viewer:
      description: >
        Live map of the entire NEXUS ecosystem — every registered component,
        every declared hook, every active wire.
      data_sources:
        - lib/component-registry.js
        - architect/src/hooks/Registry.js
        - JAA event_log
      api_routes:
        - GET  /api/arch/map
        - GET  /api/arch/map/:service
        - GET  /api/arch/flow/:event_type
        - GET  /api/arch/gaps
        - POST /api/arch/export
    ui_panels_proposed:
      - WIZARD — 11-dimension spec builder
      - TEMPLATES — template library browser
      - ARCHITECTURE — live system map
      - CANVAS — visual drag-and-drop wire viewer
      - HOOKS — registered hook registry (this one IS built — see handshake.components above)
