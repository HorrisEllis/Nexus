spec:
  meta:
    name:        erosmancer-os
    version:     1.0.0
    uuid:        nexus-erosmancer-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      ErosmancerOS — TypeScript CDP browser automation platform.
      Autonomous browser control via Chrome DevTools Protocol.
      Complements NEXUS by providing programmatic browser control
      that doesn't require user-facing tab interfaces.
      Built to handle tasks where NCP userscripts aren't sufficient.

  status: "built, staged — needs npm run build to compile TypeScript"

  core_concepts:
    cdp:
      description: >
        Chrome DevTools Protocol. Direct connection to Chrome/Chromium
        browser instances. Full control: navigation, DOM manipulation,
        network interception, screenshot, PDF generation.

    automation:
      description: >
        Task automation without user presence.
        Scraping, form filling, PDF generation, visual regression.
        Runs headless or headful.

    nexus_integration:
      description: >
        Can be registered as a Guardian NCP provider for tasks
        where DOM injection via userscript isn't reliable.
        Specifically: multi-step flows, captcha handling,
        authenticated sessions that need persistent state.

  modules:
    - id: cdp-client
      description: "WebSocket connection to Chrome DevTools Protocol"

    - id: page-controller
      description: "High-level page control: navigate, click, type, wait, screenshot"

    - id: session-manager
      description: "Multiple browser contexts. Isolated sessions."

    - id: task-runner
      description: "Queued automation tasks with retry and timeout"

  build:
    command: "npm run build (from erosmancer/ directory)"
    output: "erosmancer/dist/"
    language: "TypeScript → compiled to JavaScript"

  notes:
    - "Not yet integrated into NEXUS boot sequence"
    - "Planned: register as guardian NCP provider type 'cdp'"
    - "Planned: CLI command via component registry: erosmancer.run <task>"

  # ## ADDENDUM 2026-09-26 (0.39.264) — runs with Clear Glass
  # James: "hook it in to run with clearglass" / "just need erosmanceros to start with clearglass".
  # Before: Clear Glass registered erosmancer-os with the orchestrator and POSTed /api/connect,
  # but nothing started the server — every boot logged ECONNREFUSED 127.0.0.1:7432.
  # Now: clear-glass/src/eros/supervisor.js starts erosmancer-os/src/api/server.ts through tsx
  # (a root devDependency via the erosmancer-os workspace; no build step), waits for /api/health,
  # connects it to Clear Glass's own DevTools port (CG_CDP_PORT, default 9333), restarts it with
  # backoff (gives up after 5 crashes in 2 minutes, saying why), and stops it on Clear Glass quit
  # (taskkill /T on Windows, since tsx runs the server in a child). An ErosmancerOS already on
  # the port is used as is. EROS_AUTOSTART=0 opts out. Data: <Nexus>/data/erosmancer.
  # Fixed on the way: DEFAULT_CONFIG lacked behavior/routing/observer (declared in OSConfig,
  # "merged during build" per a comment, never merged) — every /api/connect crashed with
  # "Cannot read properties of undefined (reading 'defaultLevel')". EROS_LOG_LEVEL limits what
  # telemetry prints (Clear Glass uses info). Proven: tests/modules/test-cg-eros-supervisor.js,
  # a real tsx start connected to a real Chromium DevTools port, then stopped.
