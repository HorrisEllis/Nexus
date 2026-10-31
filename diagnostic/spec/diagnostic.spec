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

## ADDENDUM 2026-10-05 — 0.39.342, the diagnostic listens to the pulse; no polling (announce-pulse-repair PR1–PR3)
# James: "remove the polling then. need the systems to anounce themselves. that way i can add new systems
# automatically. also optimizes performance." · "use negative space reasoning for missed heartbeats."
# Liveness is the pulse, not a probe: the diagnostic listens to orchestrator's /sse (every createPulse beat) and reads
# /api/registry once — at start and after a lost stream. The 15 s /health probe of every system and the per-system
# registry checks are gone. lib/pulse-watch.js: each beat a WARP 2 link expecting the next within interval × 1.5; a
# broken expectation is a gap naming the system and its last beat; an expected system that never announces is a gap
# after 60 s. A system that announces itself is adopted (SYSTEMS gains it; a baseline monitor; no file edited).
# SYSTEMS keeps only what the registry cannot say: a data dir not at data/<id>, pulseAs (clear-glass → nexus-wire,
# forge-shell → orchestrator), optional. GET /pulse shows the watch. Open: PR4 deviation quickens the pulse; PR5 repair.

# ── ADDENDUM 2026-10-17 (0.60.136–0.60.138) — one system with the healer; the genesis shape ───────────────────────
# James, 2026-10-17: "diagnostic and nexus healer should be one system." · "and the diagnostic needs to be a real system
# matching genasis."
# This spec moved here from docs/diagnostic.spec (git mv, history kept): FILES_WITH_THEIR_SYSTEM. Its registry row had said
# "✗ DRIFTED — describes a registry-components.js and handshake that don't exist in code". Both exist now:
#   registry-components.js   the healer's 5 rows + the contract's 30 routes (read from interaction-contract.json)
#   contracts/handshake.js   laid out from the genesis skeleton (cos/archetype/nexus-system/contracts/handshake.js)
# The rest of genesis's shape, 0.60.138:
#   server.js                the entry (starts nexus-diagnostic.js's service; autopilot still starts that file directly)
#   cli.js                   every registry command against its own running service; status/stop/gaps/audit unchanged
#   config.js + diagnostic.config.json   port 7825 and heartbeat from the file, DIAGNOSTIC_PORT / _HEARTBEAT_MS over it
#   compartment.json         its COS compartment, nexus-self-diagnostic (entry server.js, health /health)
#   event-taxonomy.js        its 13 events in ET1 shape, each a real broadcast in nexus-diagnostic.js
#   spec/diagnostic.spec, spec/diagnostic.node-taxonomy.spec, spec/healer.*
#   lib/                     its components: heal-loop.js (was nexus-heal-loop.js), wire-integrity.js, and pulse-watch.js,
#                            diagnostic-contract.js (moved from lib/: used only by diagnostic, DB17)
#   healer/                  the healer (api, cli), served under /healer
#   tests/                   test-pulse-watch.test.js and shape.test.js
# The skeleton's node index, listener, store and heartbeat roles are the kernel's (decision D1, by his axioms):
# lib/node-registry.js, lib/jaa-store.js, lib/system-store.js, lib/system-registry.js heartbeat. `system shape diagnostic`
# (lib/system-shape.js) checks every role.
# Not sovereign yet: 10 crossings out (cortex's database 1, capabilities 9 — RAID, CFR, the gap engine, loom's schema).

# ── ADDENDUM 2026-10-17 (0.60.146) — causality measured (FMR0) ──────────────────────────────────────────────────────
# James, 2026-10-17: "do it. … we need to add this all to nexus, there is boundaries mapping it"
# lib/causality.js: per system, the share of ledger rows that name their cause (causedBy) and how many resolve to a row read —
# what RFR2 can walk for a failure report. Reads the ledger files every system writes (no require into any system), each from
# its last 2 MB. GET /causality[?system=], declared in interaction-contract.json (so in its registry); `system causality`.
# A share only rises: the high-water mark is diagnostic's own data (causality-highwater.json), a fall is named.
# config.js: DIAGNOSTIC_DATA_DIR over the file, like the port. Measured on the tree at 0.60.145: 72 of 1,467 rows (4.9%) name
# a cause, and none of the 72 resolves to a row in any ledger read. Proof: diagnostic/tests/causality.test.js 4/4.
