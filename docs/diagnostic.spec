spec:
  meta:
    name:        diagnostic
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    port:        :7825
    uuid:        nexus-diagnostic-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Standalone diagnostic service. Watches all system ledgers via fs.watch. Computes friction, sigma, slope, tension per system. Exposes the 12-engine suite on demand.

  modules:
    - id: ledger-watcher
      description: "fs.watch on all system data/ directories. Recomputes on change."
    - id: friction-scorer
      description: "Per-system friction = failed_events / total_events over window."
    - id: sigma-computer
      description: "Telemetry-codec SlopeEngine on per-system event rate."
    - id: tension-scorer
      description: "tension = friction × open_loops × slope. Composite health score."
    - id: engine-runner
      description: "Runs all 12 diagnostic-engines on demand. Returns full report."
  routes:
    external:
      - "GET /health"
      - "GET /contract"
      - "GET /engines — run all 12 diagnostic engines"
      - "GET /tension — per-system tension scores"
      - "GET /friction — per-system friction scores"
  handshake:
    components:
      - id: "diagnostic.engines"
        grammar: ["diagnostic engines", "engines", "eng"]
        route: { method: GET, path: "/api/diagnostic/engines" }
        description: "Run all 12 diagnostic engines, get full report"
      - id: "diagnostic.tension"
        grammar: ["diagnostic tension", "tension", "ten"]
        route: { method: GET, path: "/api/diagnostic/tension" }
        description: "Per-system tension scores (friction × loops × slope)"
