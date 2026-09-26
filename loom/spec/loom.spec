spec:
  meta:
    name:        loom
    version:     1.5.0
    foundation:  nexus-system-foundation@1.1.0
    port:        3752
    uuid:        nexus-loom-v1-0000-2026-0901-jamesbrooks-001
    status:      active
    purpose: >
      Sovereign component/hook/wire/seam registry + contracts + phasemap
      aggregation. Existed since phase 121 as a pure library (LoomDriver,
      LoomContracts, required in-process) before loom/server.js's own
      2026-07-02 §GAP CLOSED comment gave it L3 (API) + L4 (handshake) —
      the same real boot pattern copilot/server.js and eravos/server.js
      already use. This spec had never been written despite loom being
      the registry every phasemap/spec-drift/capability check in this
      codebase already depends on.

  core:
    port: 3752
    env_override: LOOM_PORT
    axioms:
      - AX-001  validate all inputs at boundary
      - AX-004  self-describing — L3+L4 added on top of the pre-existing L0 registry
      - AX-013  living-model sections (this spec — see history/gaps/version_history below)

  events:
    note: >
      loom's server.js maintains an SSE client set (_sseClients) and fans
      out registry mutations to it; the specific emitted event-name
      vocabulary was not enumerated this pass (server.js dispatches by raw
      pathname/method match, not a declared events.emits[] list the way
      ollama or clear-glass do) — recorded honestly as unenumerated rather
      than guessed.

  routes:
    - method: GET  path: /api/hooks
      returns: "hookRegistry contents, optional ?id= lookup"
    - method: GET  path: /api/gaps
      returns: "gap-field entries, optional /api/gaps/:id"
    - method: GET  path: /api/registry/:kind/:id
      returns: "driver.registry.get(kind, id) — component/hook/wire lookup"
    - method: GET  path: /api/graph
      returns: "full component/hook/wire graph"
    - method: GET  path: /api/context-graph
      returns: "context graph view"
    - method: GET  path: /api/contracts
      returns: "LoomContracts live state"
    - method: GET  path: /api/friction
      returns: "friction/tension live state (in-memory, per 2026-08-09 diagnostic wiring)"
    - method: GET  path: /api/tension
      returns: "tension live state"
    - method: GET  path: /api/history
      returns: "history entries, ?/component/:id, ?/session/:id, ?/system/:id variants"
    - method: GET  path: /api/impact/:id
      returns: "impact analysis for a given component/id"
    - method: POST path: /api/ingest
      body:    "LoomIngest.ingestZip payload"
      returns: "sha256 identity + parent-diff lineage (phase 144, wired 2026-07-05)"
    - method: POST path: /api/ingest-upload
      returns: "upload variant of /api/ingest"
    - method: GET  path: /api/phasemap
      returns: "phasemapMap.loadAll() — every real phasemap in the tree (LP1/LP2, wired 2026-08-08)"
    - method: GET  path: /api/phasemap/:system
      returns: "phasemapMap.forSystem(system)"
    - method: GET  path: /api/phasemap/history/:id
      returns: "phasemap history for one entry"
    - method: POST path: /api/scaffold
      body:    "scaffoldSystem() operations-list payload (phase 145, wired 2026-07-05)"
      returns: "generated CLI+API+contract projection"
    - method: GET  path: /api/templates
      returns: "available system-scaffold templates"
    - method: GET  path: /api/revisions
      returns: "ingest.revisions — real revision history from LoomIngest"
    - method: POST path: /api/register
      returns: "component registration — the real write path every other system's declare() call reaches"
    - method: GET  path: /api/component/:id
      returns: "single component lookup"

  handshake:
    note: >
      Read-only surface wraps LoomDriver.registry directly (has/get/all/
      graph — disk-first, re-reads before every read per the phase-157
      staleness fix). Write surface wraps declare() and the three
      LoomContracts lifecycle calls. This file is transport only, per its
      own header comment — no gate/axiom logic reimplemented here.

  modules:
    - id: schema
      path: loom/schema/index.js
      description: "LoomDriver — the real L0 registry (has/get/all/graph)."
    - id: contracts
      path: loom/contracts/index.js
      description: "LoomContracts — lifecycle contract state."
    - id: cortex-sync
      path: loom/schema/cortex-sync.js
      description: "Durable write path into cortex; wired to every registry mutation (2026-07-04 §BUGFIX)."
    - id: ingest
      path: loom/ingest/index.js
      description: "LoomIngest.ingestZip — sha256 identity, unzip listing, parent-diff lineage (phase 144)."
    - id: system-scaffold
      path: loom/templates/system-scaffold.js
      description: "scaffoldSystem() — operations-list to CLI+API+contract projector (phase 145)."
    - id: phasemap-map
      path: loom/scanners/phasemap-map.js
      description: "Real phasemap aggregation scanner (LP1/LP2) — the same loadAll()/forSystem() every session's own phasemap-writing verifies against before commit."
    - id: spec-map
      path: loom/scanners/spec-map.js
      description: >
        The §6.3 spec-coverage scanner. Its own SPEC_DIRS allowlist
        (docs, warp/spec, cortex/spec, idearium/spec, copilot/spec,
        bridge/spec) does not include loom/spec itself — this spec is
        therefore not yet self-covering. Recorded as a real gap below,
        not silently worked around.

  history:
    - date: 2026-07-02
      summary: >
        L3 (API) + L4 (handshake) added on top of the pre-existing L0
        registry — loom/server.js's own §GAP CLOSED comment: "every other
        real system in NEXUS follows nexus-system-foundation.spec's L0-L5
        shape and has a process, a port, and a handshake... LOOM had L0
        and an L2-adjacent CLI, nothing else."
    - date: 2026-07-04
      summary: "cortex-sync.js wired into every registry mutation (was built earlier, never connected)."
    - date: 2026-07-05
      summary: "ingest and system-scaffold endpoints wired (both built in earlier phases, never connected until this pass — same disconnected-but-correct pattern twice)."
    - date: 2026-08-08
      summary: "/api/phasemap[/:system] wired — LP1/LP2's scanner existed as a pure lib module, never had an endpoint."
    - date: 2026-09-01
      summary: "First .spec written for loom, closing one of the 11 real gaps orchestrator/lib/spec-drift.js's live check reported (§LM1)."

  gaps:
    as_of: 2026-09-01
    entries:
      - id: SM2
        type: coverage
        summary: >
          loom/scanners/spec-map.js's own SPEC_DIRS allowlist does not
          include loom/spec — loom's own registry cannot yet see its own
          new spec. Same class of gap as clear-glass's SM1; both recorded
          in this session's foundation addendum rather than silently
          patched (out of LM1 scope).
        opened: 2026-09-01
      - id: LM1-events
        type: honesty
        summary: >
          loom's real emitted-event vocabulary was not enumerated this
          pass — server.js dispatches by pathname/method, not a declared
          events.emits[] list. A future pass should either add one or
          record explicitly that loom deliberately has none.
        opened: 2026-09-01

  version_history:
    - version: 1.5.0
      date: 2026-09-01
      summary: "First real .spec authored, matching live code@1.5.0 exactly (no version bump required)."
      versioniumCommitId: null
