spec:
  meta:
    name:        grammar-fallback
    version:     1.0.1
    foundation:  nexus-system-foundation@1.1.0
    kind:        library-module   # not a service — no port, no process of its own
    uuid:        nexus-grammar-fallback-v1-0000-2026-0901-jamesbrooks-001
    status:      active
    purpose: >
      NEXUS Grammar-Driven Command Resolution. guardian's /cli/exec had
      zero grammar-engine involvement before this (§PHASE-15) — any
      command outside its hand-coded switch returned a flat "Unknown
      command" with no path to anything registered dynamically via
      component-registry. This is the single, shared resolution step
      that closes that gap; guardian/server.js calls it rather than
      duplicating grammar-engine.resolve() + component-registry.get()
      inline (§5.7 low coupling, high cohesion).

  scope: >
    Resolves a command STRING to a component and reports its declared
    route. It does NOT invoke that route — nothing in this codebase
    dereferences component.route into a real HTTP call yet (that is
    Phase 40 / Component Descriptor territory, per this module's own
    §5.5 honesty note). Building real invocation here would be scope
    creep dressed up as a fix.

  api:
    resolveCommand:
      signature: "resolveCommand(raw: string, opts?: { orchestratorUrl?: string }) -> Promise<{ resolved, componentId?, matched?, remainder?, route?, note? }>"
      description: "Resolve a raw CLI command line against the live grammar tree."

  consumers:
    - guardian/server.js   # /cli/exec's real fallback path

  dependencies:
    - lib/grammar-engine.js
    - lib/component-registry.js

  history:
    - date: unknown
      summary: >
        §PHASE-15 build — closed guardian's real gap: /cli/exec had zero
        grammar-engine involvement.
    - date: unknown
      summary: >
        §0.9.10 fix — require path to grammar-engine/component-registry
        was stale after those files moved into shared lib/, crash-looping
        guardian on boot (per lib/version.js's own 0.9.10 changelog
        entry). Version bumped 1.0.0 -> 1.0.1.
    - date: 2026-09-01
      summary: >
        First .spec written, closing one of the 11 real gaps
        orchestrator/lib/spec-drift.js's live check reported (§LM1).

  gaps:
    as_of: 2026-09-01
    entries: []   # none found this pass — module is small (66 lines), single-purpose, has a real test (tests/modules/test-grammar-fallback.js)

  version_history:
    - version: 1.0.0
      date: unknown
      summary: "§PHASE-15 original build."
      versioniumCommitId: null
    - version: 1.0.1
      date: unknown
      summary: "Stale require-path fix (per lib/version.js 0.9.10 changelog)."
      versioniumCommitId: null
