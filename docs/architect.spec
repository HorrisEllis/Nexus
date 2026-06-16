spec:
  meta:
    name:        architect
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    port:        3747
    uuid:        nexus-architect-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Spec builder and hook registry.
      The wizard fills 11 spec dimensions conversationally through UTL.
      The canvas builder lets you draw architecture visually.
      Output feeds the spec-compiler pipeline.

  core:
    schemas:
      - Spec: "{ uuid, name, version, meta, modules[], events[], tests[], components[] }"
      - Hook: "{ uuid, name, signature, contract, registeredBy, ts }"
      - CanvasNode: "{ id, type, label, position, connections[] }"
    spec_dimensions:
      1:  "meta (name, version, purpose)"
      2:  "intent (what it does)"
      3:  "axioms (which foundation axioms)"
      4:  "constraints (hard rules)"
      5:  "modules (what gets built)"
      6:  "edges (connections between modules)"
      7:  "gaps (known unknowns)"
      8:  "tiers (T0/T1/T2/T3 split)"
      9:  "events (emits and handles)"
      10: "schemas (data shapes)"
      11: "tests (required before shipping)"

  events:
    emits:
      - "architect.booted"
      - "architect.spec.created"
      - "architect.spec.compiled"
      - "architect.hook.registered"
      - "architect.canvas.exported"
    handles:
      - "spec.compile.complete → spec.status_update"

  modules:
    - id: wizard
      description: >
        11-dimension spec builder. One dimension at a time.
        Progress dots. "So far" summary after each step.
        BUILD NOW dispatches to spec-compiler.
        SAVE TO PROJECTS saves to Idearium.

    - id: canvas
      description: >
        Visual architecture builder. Drag-and-drop nodes.
        Five chip types: module, event, schema, constraint, test.
        Edges represent dependencies and event flows.
        Export to .spec format. Import from .spec.

    - id: hook-registry
      description: >
        Registers named hooks with typed contracts.
        Every hook has a name, signature, and behavioral contract.
        Hooks are the seams — places where behavior can be injected
        without modifying the core.

    - id: interaction-contract
      description: >
        Publishes the system's interaction contract.
        The orchestrator fetches and verifies this on registration.
        Hash verified. Trust state set.

  routes:
    external:
      - "GET  /health"
      - "GET  /contract"
      - "POST /api/spec/build"
      - "GET  /api/spec/:id"
      - "POST /api/canvas/export"
      - "POST /api/canvas/import"
      - "POST /api/hooks/register"
      - "GET  /api/hooks"

  handshake:
    components:
      - id: "architect.spec.build"
        grammar: ["architect build", "build spec", "spec build", "sb"]
        route: { method: POST, path: "/api/architect/spec/build" }
        description: "Start the 11-dimension spec wizard"

      - id: "architect.hooks.list"
        grammar: ["architect hooks", "hooks"]
        route: { method: GET, path: "/api/architect/hooks" }
        description: "List all registered hooks with contracts"

      - id: "architect.canvas.export"
        grammar: ["architect canvas export", "canvas export"]
        route: { method: POST, path: "/api/architect/canvas/export" }
        description: "Export canvas diagram to .spec format"

  ui:
    type: "panel in nexus-shell"
    hotswap: true
    panels:
      - "WIZARD — 11-dimension spec builder, step by step"
      - "CANVAS — visual architecture drag-and-drop"
      - "HOOKS — registered hook registry with contracts"
