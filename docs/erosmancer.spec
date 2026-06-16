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
