spec:
  meta:
    name:        diagnostic
    version:     1.1.0
    foundation:  nexus-system-foundation@1.0.0
    port:        :7825
    uuid:        nexus-diagnostic-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Standalone diagnostic service. Watches all system ledgers via
      fs.watch. Computes friction, sigma, slope, tension per system.
      Exposes the 12-engine suite and CFR field state on demand.

  # 🔴 BIGGEST FINDING IN THIS SPEC: service/nexus-diagnostic.js has no
  # registry-components.js and no registerWithOrchestrator() call anywhere
  # in the file. Every other sovereign system (bridge, cortex, guardian,
  # idearium, architect, emerge, eravos, copilot) self-registers components
  # on boot per L4. Diagnostic doesn't. The handshake.components block below
  # describes what SHOULD exist per the foundation, not what does — this is
  # a code gap, not just a spec gap. Needs diagnostic/registry-components.js
  # written and wired before this spec's L4 section is actually true.

  core:
    schemas: {}
    axioms: [AX-001, AX-002, AX-003]
    constants: {}

  events:
    emits: []   # 🔴 none found — no busEmit/jaa.insert event_log calls
                # located in service/nexus-diagnostic.js. Watches via
                # fs.watch and serves on request; doesn't appear to emit.
    handles: []

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

  # 🔴 Previous version listed 5 routes under /api/diagnostic/*. Actual
  # service/nexus-diagnostic.js has at least 20, none under that prefix.
  # Listing every one found by grepping pathname checks directly — not
  # all descriptions verified against full handler bodies, flagged where so.
  routes:
    external:
      - { method: GET, path: /events,            description: "SSE stream" }
      - { method: GET, path: /status,             description: "Per-system status summary" }
      - { method: GET, path: /cfr/health,         description: "CFR regime — Guardian primary, local diagnostic field as fallback" }
      - { method: GET, path: /cfr/state,          description: "Full per-system CFR state summary" }
      - { method: GET, path: /cfr/field,          description: "Raw field dimensions — local diagnostic field only" }
      - { method: GET, path: /audit/contracts,    description: "Contract verification audit report" }
      - { method: GET, path: /audit/health,       description: "Per-system event-log freshness audit" }
      - { method: GET, path: /gaps,               description: "Open gaps, filterable by status/system" }
      - { method: DELETE, path: "/gaps/:id",       description: "Dismiss a gap" }
      - { method: POST, path: "/gaps/:id/fix",     description: "needs verification — found but not read in full" }
      - { method: GET, path: /friction,           description: "Per-system friction + sigma from monitors" }
      - { method: GET, path: "/baseline/:x",       description: "needs verification" }
      - { method: GET, path: "/ledger/:x",         description: "needs verification" }
      - { method: GET, path: "/trace/:x",          description: "needs verification" }
      - { method: GET, path: "/summary/:x",        description: "needs verification" }
      - { method: GET, path: /decay,              description: "Cortex memory pressure — eviction rate, pressure per tier" }
      - { method: GET, path: /engines,            description: "Run all 12 diagnostic engines, full report" }
      - { method: GET, path: /tension,            description: "Per-system tension scores" }
      - { method: GET, path: /tension/edges,      description: "needs verification" }
      - { method: GET, path: /self-heal,          description: "Open loops, pending patches, human-required gaps" }

  # Proposed — matches the real route list above, not the previous spec's
  # invented /api/diagnostic/* prefix. Won't be true until the code gap
  # noted at the top of this file is closed.
  handshake:
    components:
      - { id: "diagnostic.status",      route: { method: GET, path: "/status" } }
      - { id: "diagnostic.engines",     route: { method: GET, path: "/engines" } }
      - { id: "diagnostic.tension",     route: { method: GET, path: "/tension" } }
      - { id: "diagnostic.friction",    route: { method: GET, path: "/friction" } }
      - { id: "diagnostic.gaps",        route: { method: GET, path: "/gaps" } }
      - { id: "diagnostic.self-heal",   route: { method: GET, path: "/self-heal" } }
      - { id: "diagnostic.cfr.health",  route: { method: GET, path: "/cfr/health" } }

  # ── AX-008 (foundation addendum v1.1.0) ────────────────────────────────────
  # 🔴 OPEN, and can't be closed until the registry-components.js gap above
  # is closed — there's no hooks.out anywhere because there's no component
  # declaration anywhere. diagnostic.gaps and diagnostic.self-heal are the
  # two most copilot-relevant outputs here and should wire first.

  ui:
    type: panel in nexus-shell
    hotswap: true

  tests:
    - "friction computation matches failed_events / total_events over the configured window"
    - "/cfr/health falls back to local diagnostic field when Guardian unreachable, never errors"
    - "registry-components.js (once written) registers all components listed above at boot"
