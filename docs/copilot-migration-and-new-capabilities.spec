spec:
  meta:
    name:        copilot-migration-and-new-capabilities
    version:     1.1.0
    foundation:  nexus-system-foundation@1.0.0
    status:      partially-resolved   # corrected 2026-06-29 — was 'proposed', verified against live code
    uuid:        nexus-copilot-migration-v1-0000-2026-0627-jamesbrooks-001

  # ── Migration findings ──────────────────────────────────────────────────────
  # The naming tell: "co-pilot" (hyphenated) = pre-sovereign-split legacy.
  # "copilot" (no hyphen) = the real system, :3750. Every fix below moves
  # a hyphenated reference onto the no-hyphen target.

  migration_items:
    - id: MIG-01
      file: cli/co-pilot.js
      status: resolved   # verified 2026-06-29
      problem: >
        _talkToCopilot() POSTs to /api/guardian/copilot/prompt. guardian/
        server.js's own comments confirm that route was removed — "sovereign
        copilot service at :3750 handles these." The CLI's main way of
        talking to copilot has been pointed at a dead route since the split.
      fix: 'POST to copilot:3750/api/prompt directly, matching copilot/server.js line 357.'
      verification: >
        Already fixed in live code — §MIG-01 fix dated 2026-06-28, calls
        http://127.0.0.1:3750 directly via COPILOT_URL env var.

    - id: MIG-02
      file: lib/copilot-context.js
      status: resolved-differently   # verified 2026-06-29
      problem: >
        "Co-pilot Complete System Awareness," 7 sensing layers — orphaned.
        grep across the entire codebase: nothing requires it. Pre-split
        leftover, never deleted (§A-4 compliant, just never reconciled).
      fix: >
        Either confirm copilot/ has its own equivalent context-assembly
        (the phase map names copilot/analysis.js for this — not present in
        this code export, needs a live check) and delete this file, or — if
        no equivalent exists yet — this IS copilot's missing context layer
        and should move into copilot/ rather than stay orphaned in lib/.
      verification: >
        Not orphaned — required by copilot/server.js, cortex/boot.js, and
        lib/mcp-server.js. copilot/server.js's own header documents this
        directly: "P73–73.6 — copilot-context.js now wires all 7 sensing
        layers into every prompt (was using bespoke 5-layer assembler in
        analysis.js)." Second option in this item's fix is what happened —
        not literally moved into copilot/, but wired in as the live import,
        superseding analysis.js's old assembler. analysis.js's own docstring
        ("Assembles 7-layer context") is now stale and should say it defers
        to copilot-context.js.

    - id: MIG-03
      file: Nexus-Chat (uploaded, standalone prototype)
      status: unverifiable   # 2026-06-29
      problem: >
        runAI() talks to Ollama directly. Bypasses copilot entirely, despite
        cli/co-pilot.js's own stated design intent — "one real agent all
        [surfaces] are clients of."
      fix: 'Route runAI() through copilot:3750/api/prompt instead of Ollama directly, same change as MIG-01, different file.'
      verification: >
        Nexus-Chat is not present anywhere in the current source tree —
        cannot verify fixed or unfixed. Stays open until that file resurfaces.

    - id: MIG-04
      file: 'guardian/server.js (reference only — already correct)'
      status: confirmed   # 2026-06-29
      note: >
        Already migrated correctly. copilot.agent disabled, /copilot/* routes
        removed with comments pointing at :3750. This is what MIG-01 and
        MIG-03 should end up looking like.

  # ── New capability 1: copilot creates CLI commands ──────────────────────────
  # Mostly already wired — this isn't a new pipeline, it's exposing an
  # existing one as something copilot can trigger conversationally.

  capability_cli_authoring:
    status: 'built 2026-06-29 — code-verified, not yet runtime-verified'
    existing_pipeline: >
      module-builder.js (map→spec→QC→build) already produces a component
      descriptor. descriptor-projector.js already derives a .cli projection
      from any descriptor automatically — six projections per descriptor,
      .cli is one of them, zero-LLM, deterministic (§CC-002), confirmed
      present in code. grammar-engine already picks up new components live
      via component.registered SSE.
    the_actual_gap: >
      Was: none of this exposed as something you ask copilot for directly —
      "add a CLI command that does X" had to go through the general
      module-build flow, framed as building a whole module.
    fix_applied: >
      map()'s classification prompt now asks a 6th question — scope:'cli'
      vs scope:'module'. build() checks plan.scope right after map() resolves
      and, if 'cli', calls the new registerCliCommand() instead of
      generateSpec/runQC/build — registers a minimal component directly via
      componentRegistry.register() (which already auto-projects + emits
      component.registered, both pre-existing). New command's route points
      at copilot's own /api/prompt with the original description as the
      default param — it's a saved shortcut, not new logic, matching what
      "just a CLI command" actually means.
    verification: >
      Code-checked: syntax valid, calls only existing exported functions
      (component-registry.register, descriptor-projector.project) with
      shapes matching their real signatures. NOT runtime-verified — this
      sandbox can't boot NEXUS's multi-service stack, so the actual
      map()→build()→register()→grammar-trie round trip hasn't been run live.
      Flagged, not glossed over, same as GAP-SEAM/GAP-004 elsewhere in this doc.

  # ── New capability 2: copilot changes settings ──────────────────────────────
  # This one's a real gap, not an exposure problem — Phase 114 was always
  # ⬛ PENDING, and a direct grep for "settings"/"/api/settings" across
  # lib/ and orchestrator.js turned up nothing built for it. Still nothing.

  capability_settings_change:
    status: 'genuinely unbuilt — Phase 114 / OL-23. Re-confirmed 2026-06-29.'
    verification: >
      cortex/boot.js's /api/settings exists but is GET-only, reads the
      settings JAA table — a "deprecated path" by its own route comment, not
      a write target. clear-glass/src/api/settings.js is the Electron app's
      own connection config (ports, routing), unrelated to per-system runtime
      config. No sovereign system implements a POST /api/settings that
      accepts runtime config from copilot or the control panel. Phase 114 is
      still accurately ⬛ PENDING.
    spec: >
      Each system implements POST /api/settings, accepting runtime config
      from copilot (or the control panel UI, same endpoint either way —
      §AXIOM CLI=UI=API holds here too). Per system:
        guardian:  ncp_log_rate_ms, seam thresholds
        cortex:    sigma thresholds, gap batch size
        copilot:   lifeline confidence threshold, stream chunk size
        ollama:    max_concurrent, timeout
    constitutional_check: >
      Settings changes should run through constitutional-ai.check() before
      applying — same axiom-check path every other action-with-consequence
      already goes through. A setting change is a REVERSIBILITY-class action
      (axiom AX in constitutional-ai.js), not exempt just because it's config.
    copilot_side: >
      A new intent classification ("change setting") routes to the target
      system's /api/settings instead of module-builder — settings changes
      aren't a build, they shouldn't go through the build pipeline at all.

  # ── Side discovery, 2026-06-29 ──────────────────────────────────────────────
  # Verifying MIG-02 meant reading copilot/server.js's own header in full.
  # It documents three more migrations the phase map had no record of:
  #   P73  → this item (MIG-02)
  #   P103 → Session continuity (phase map said Phase 103 ⬛ PENDING — built)
  #   P110 → Dual cognition full wire (phase map said ⬛ PENDING — partial)
  #   P112 → Streaming /api/prompt/stream (phase map said ⬛ PENDING — built)
  # Full correction logged in NEXUS-PHASE-MAP.md, CHANGELOG (session 4).
  side_discovery_note: >
    copilot/server.js was rewritten (UUID v3, dated 2026-06-28) carrying its
    own migration log in its header comment. Nobody back-filled the phase map
    when that code landed — same failure mode as MIG-01 (cli/co-pilot.js):
    code ships, the doc describing it doesn't get told.
