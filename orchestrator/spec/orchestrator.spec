spec:
  meta:
    name:        orchestrator
    version:     2.2.1
    foundation:  nexus-system-foundation@1.0.0
    port:        9000
    uuid:        nexus-orchestrator-v2-0000-2026-0615-jamesbrooks-001
    purpose: >
      The root coordinator. Single focal point for every UI, CLI,
      and external consumer. Every system registers here.
      The orchestrator never does business logic — it routes,
      verifies, and coordinates. The component registry and UI
      handshake live here because they are system-wide concerns.

  core:
    schemas:
      - SystemRegistration: "{ systemId, port, version, meta, components, contract }"
      - ContractVerification: "{ systemId, trust, hash, checkedAt, routeCount }"
      - UISession: "{ id, name, type, capabilities, sessionId, online, lastSeen }"
      - Component: "imported from component-registry"
    axioms: [AX-001, AX-002, AX-003, AX-007]
    constants:
      PORT:            9000
      BIND_HOST:       "127.0.0.1"
      CONTRACT_TRUST:  "{ VERIFIED, DEGRADED, MISMATCH, UNREACHABLE }"
      HB_TIMEOUT_MS:   70000

  events:
    emits:
      - "orchestrator.booted"
      - "system.registered"
      - "system.contract.verified"
      - "system.contract.unreachable"
      - "component.registered"
      - "component.updated"
      - "component.unavailable"
      - "ui.registered"
      - "ui.disconnected"
      - "registry.grammar.rebuilt"
    handles:
      - "All events from all systems via bridge relay"

  command_index:
    status: specced   # §1.1 -- not built yet. See docs/command-index-per-system.spec, build_order phase 4.
    spec: "docs/command-index-per-system.spec"
    note: "bridge shares guardian's dispatch shape (raw inline method checks) -- same source-extraction mechanism, phase 4."

  routes:
    external:
      - "GET  /                         NEXUS shell UI"
      - "GET  /health                   All systems health"
      - "GET  /events (SSE)             All system events broadcast"
      - "GET  /api/contract             Full system map"
      - "GET  /api/status               System registry state"
      - "GET  /api/version              Version registry"
      - "POST /api/register             System registration"
      - "GET  /api/components           Component index"
      - "GET  /api/components/grammar   Grammar tree for CLI"
      - "GET  /api/components/schema    Component schema"
      - "GET  /api/components/:id       Single component"
      - "POST /api/components/register  Register components"
      - "PUT  /api/components/:id       Update component"
      - "DELETE /api/components/:id     Deprecate component"
      - "POST /api/ui/register          UI handshake"
      - "POST /api/ui/heartbeat         UI keepalive"
      - "GET  /api/ui/connected         Connected UIs"
      - "DELETE /api/ui/:sessionId      UI disconnect"
      - "GET  /api/search/*             Proxied to cortex"
      - "GET  /api/engines              Proxied to diagnostic"
      - "GET  /api/guardian/*           Proxied to guardian"
      - "GET  /api/cortex/*             Proxied to cortex"
      - "GET  /api/bridge/*             Proxied to bridge"

  handshake:
    note: >
      The orchestrator is the handshake authority.
      It does not register with itself — it IS the registry.
      But it does declare its own components so they appear in the CLI.
    components:
      - id: "orchestrator.status"
        grammar: ["orchestrator status", "status", "st"]
        route: { method: GET, path: "/api/status" }
        description: "Full system status — all registered services"

      - id: "orchestrator.systems"
        grammar: ["orchestrator systems", "systems", "sys"]
        route: { method: GET, path: "/api/status" }
        description: "List all registered systems and their trust state"

      - id: "orchestrator.version"
        grammar: ["orchestrator version", "version", "ver"]
        route: { method: GET, path: "/api/version" }
        description: "NEXUS version registry — all module versions"

      - id: "orchestrator.contract"
        grammar: ["orchestrator contract", "contract"]
        route: { method: GET, path: "/api/contract" }
        description: "Full system contract — services, routes, schemas"

      - id: "orchestrator.components"
        grammar: ["components list", "components", "comp"]
        route: { method: GET, path: "/api/components" }
        description: "Component registry — all available commands"
        params: [{ name: namespace, type: string, cli: "--namespace" },
                 { name: tag, type: string, cli: "--tag" },
                 { name: q, type: string, cli: "--q" }]

      - id: "orchestrator.ui.connected"
        grammar: ["ui connected", "ui list", "uis"]
        route: { method: GET, path: "/api/ui/connected" }
        description: "Connected UI sessions"

  modules:
    - id: component-registry
      version: "1.0.0"
      description: "Self-describing kernel. Persists to JAA components table."

    - id: ui-registry
      version: "1.0.0"
      description: "UI session tracking. Heartbeat. SSE event routing."

    - id: contract-handshake
      version: "1.0.0"
      description: "RSA-verified contract verification for registered systems."

    - id: boot-sequence
      version: "1.0.0"
      description: "Phase-gated HARD/SOFT boot with §1.2 loud failure."

    - id: peer-relay
      version: "1.0.0"
      description: "Two NEXUS instances discover each other and proxy through each other."

  ui:
    type: "nexus-shell.html (Phase 4)"
    hotswap: true
    panels:
      - "SYSTEM MAP — live service health, trust state, version"
      - "CLI — dynamic grammar from component registry"
      - "EVENTS — live SSE event stream"
      - "COMPONENTS — full component registry browser"
      - "UI SESSIONS — connected UIs, types, heartbeat status"
