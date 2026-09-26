spec:
  meta:
    name:        hooks-migration
    version:     1.0.0
    status:      Phase 1 IMPLEMENTED 2026-07-20 (same session as this spec).
    uuid:        nexus-hooks-migration-v1-0000-2026-0720-001
    purpose: >
      Move hook-registry ownership from architect (which absorbed it by
      default and was "never intended" to have it — James, 2026-07-20) to
      loom (which has claimed "component/hook/wire/seam registry" in its
      boot banner since v1.1.0 while containing ZERO hook code — verified
      by grep, not assumed). Architect goes back to building architecture.

  evidence_before_cutting:
    - "architect/service.js Phase 2: HookRegistry({jaa}) over shared JAA tables 'hooks'/'hook_bindings' — 269 real hooks replayed at boot"
    - "architect's writers: _seedBuiltinHooks (first boot) + syncFromComponentRegistry (30s loop). Both moveable."
    - "Blueprint receives `hooks: registry` in its constructor and NEVER calls it — zero `this.hooks`/`registry.` references in Blueprint.js (grep -c: 0). Its `bp.hooks` are blueprint-local arrays. The dependency was decorative."
    - "loom/server.js: no hook storage, no hook routes, banner claim only."
    - "External consumers: orchestrator GET proxy (/api/architect/hooks → architect), one UI button (GET only). No external mutation callers found."

  target_ownership: >
    lib/hook-registry.js — the class, neutral shared library (moved from
    architect/src/hooks/Registry.js, history preserved via git mv).
    LOOM — sole write authority (§10.1): hosts full CRUD + wire/unwire at
    /api/hooks*, owns seeding and the component-registry sync loop.
    ARCHITECT — read-only view: keeps GET /api/hooks* (Blueprint's context
    and existing UI/proxy reads unbroken), never writes. Since architect
    never dirties the tables, JaaStore multi-process flush cannot resurrect
    loom's deletes (same safety argument as sigma-compaction).
    Mutation routes on architect return 410 with a pointer to loom :3752 —
    loud redirection, not silent breakage (§1.2).

  phase_1_implemented:
    - "git mv Registry.js → lib/hook-registry.js; architect + loom both require the shared path"
    - "loom: registry init + seed-if-empty + sync loop + full /api/hooks CRUD/wire routes"
    - "architect: GET routes kept (read-only registry instance), mutations → 410 pointer, seeding + sync loop removed, boot line renamed to 'Hook Registry (read view — loom owns writes)'"
    - "orchestrator proxy: /api/architect/hooks GETs unchanged (reads are fine anywhere); new /api/loom/hooks proxy is loom's own contract surface"
  phase_2_not_yet:
    - "hooks/*.hooks.js static maps: already declared drifted/non-canonical by §FIX-ROADMAP-62 — retire or regenerate from loom, separate decision"
    - "loom spec file (loom is one of the 12 unspecced modules — this migration makes writing loom.spec more urgent, not less)"
