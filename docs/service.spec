spec:
  meta:
    name:     service
    version:  1.0.0
    uuid:     nexus-service-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Windows service integration and process management for NEXUS.
      Allows NEXUS to run as a Windows service that starts on boot,
      restarts on failure, and integrates with Windows service control.

  files:
    - path: "service/nexus-service.js"
      description: >
        Windows service wrapper using node-windows.
        Registers NEXUS orchestrator as a Windows service.
        Auto-restart on failure. Logs to Windows Event Log.

    - path: "service/nexus-diagnostic.js"
      description: >
        Standalone diagnostic process. Runs independently of
        the main NEXUS boot. Can diagnose a system without
        starting the full stack. Used by boot-systems on failure.

  install:
    command: "node service/nexus-service.js install"
    uninstall: "node service/nexus-service.js uninstall"
    start: "net start nexus"
    stop:  "net stop nexus"

  notes:
    - "Windows 11 target (James's machine)"
    - "GTX 1650 — Ollama must be running for full AI features"
    - "Service starts orchestrator only — other systems boot from orchestrator"
