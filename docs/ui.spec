spec:
  meta:
    name:        ui
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-ui-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Browser interfaces for NEXUS. Currently 33,814 lines across 31 files —
      fragmented, partially broken, some pages hardcoded.
      Being replaced by nexus-shell.html (Phase 4).
      This spec documents what exists and what will replace it.

  current_state:
    status: "fragmented — being replaced"
    total_lines: 33814
    total_files: 31
    files:
      - path: "ui/index.html"
        lines: 8671
        status: "replace"
        description: "Main landing — RESUME/BUILD/PROJECTS. Hardcoded routes."

      - path: "ui/home/index.html"
        lines: 5724
        status: "replace"
        description: "Home dashboard. Some panels broken."

      - path: "ui/cockpit.html"
        lines: 2217
        status: "replace"
        description: "Forge/build cockpit. Partially functional."

      - path: "ui/nexus-chat.html"
        lines: 1734
        status: "replace — functionality moves to userscripts"
        description: "Chat interface. Superseded by NEXUS tab in userscripts."

      - path: "guardian/ui/index.html"
        lines: 3677
        status: "replace"
        description: "Guardian UI. NCP status, job queue."

      - path: "guardian/nexus-chat-v4.html"
        lines: 2792
        status: "replace"
        description: "Earlier chat UI version."

  replacement:
    name: "nexus-shell.html"
    status: "PENDING — Phase 4"
    path: "ui/nexus-shell.html"
    description: >
      One file. Contract-driven. Bootstraps entirely from the
      component registry and interaction contract.
      No hardcoded routes. No hardcoded commands.
      Three panels:
        LEFT:   System map (services, health, trust state, versions)
        CENTER: Dynamic CLI (grammar from component registry, tab completion)
        RIGHT:  Context panel (memory, liminal spaces, live events)
      Any new system that registers its components appears automatically.
      Hotswap test: delete and replace with any other HTML — system continues.

  hotswap_model:
    principle: "The UI is the most disposable layer (AX-006)"
    test:
      - "Delete all UI files. System operates via CLI."
      - "Replace nexus-shell.html. All commands still work."
      - "Open replacement without restarting services. Bootstraps correctly."
    bootstrap_sequence:
      1: "GET /api/contract — full system map"
      2: "GET /api/components — component index"
      3: "GET /api/components/grammar — grammar tree"
      4: "POST /api/ui/register — get sessionId"
      5: "GET /events (SSE) — live event stream"

  panels_to_build:
    description: >
      Each panel reads from the component registry and event stream.
      No panel hardcodes a system's routes.
    panels:
      - id: system-map
        reads: ["/api/status", "/api/contract", "/events"]
        shows: "Service health, trust state, version, uptime per service"

      - id: dynamic-cli
        reads: ["/api/components/grammar", "/events (component.registered)"]
        shows: "Tab-completing command line. Grammar updates live."

      - id: memory
        reads: ["/api/cortex/memory/working", "/api/search"]
        shows: "Working memory read/write. Semantic search."

      - id: gaps
        reads: ["/api/cortex/gaps", "/api/cortex/friction", "/api/cortex/failure-modes"]
        shows: "Open gaps, friction table, failure modes, heal buttons"

      - id: raid
        reads: ["/api/cortex/raid/decide", "/api/guardian/providers"]
        shows: "Provider health, routing decisions, NCP tab status"

      - id: liminal
        reads: ["/api/liminal/spaces"]
        shows: "Five interstitial spaces, velocity field, crystallisations"
        status: "PENDING — Phase 5 (liminal organ not yet built)"

      - id: events
        reads: ["/events (SSE)"]
        shows: "Live event stream, filterable by type and source"

      - id: components
        reads: ["/api/components"]
        shows: "Component registry browser, grammar aliases, hook map"
