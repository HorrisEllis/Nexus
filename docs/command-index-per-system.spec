spec:

  # ════════════════════════════════════════════════════════════════
  # COMMAND-INDEX-PER-SYSTEM — Architecture Specification
  # ════════════════════════════════════════════════════════════════
  #
  # §3.1 BOTTOM_UP_ONLY — this file exists because that axiom was about
  # to be violated: the prior turn was heading straight into writing
  # guardian/ollama/bridge command-index code with no spec proving the
  # mechanism first. Stopped. This is the spec. Nothing below it is
  # built yet — see `status` on every phase.
  #
  # Source truth for every claim below:
  #   clear-glass/src/ipc/bridge.js       — the one real, live version
  #   idearium/api/index.js               — the one real declared route array
  #   ollama/server.js                    — the one real modular route-file list
  #   guardian/server.js                  — the one real unstructured dispatch
  #   bridge/server.js                    — same shape as guardian, smaller
  #   guardian/spec/guardian.spec         — proof the drift problem is real
  #   orchestrator/lib/spec-drift.js      — the one real, existing drift-gate
  #     (checked directly: version-only today, does not check commands)
  # ════════════════════════════════════════════════════════════════

  meta:
    name:         command-index-per-system
    version:      0.1.0
    uuid:         nexus-command-index-v1-0000-2026-0903-001
    author:       james-brooks
    status:       specced          # §1.1 — nothing below is marked done on claim alone
    description: >
      Every real command surface in NEXUS (guardian, ollama, bridge,
      idearium, clear-glass) gets one real, current index of its own
      commands, living as a file inside that system, sourced from that
      system's ACTUAL dispatch code — never hand-maintained, never
      allowed to drift. Each system's index is then referenced from
      that system's own .spec (its "living model"), so the spec can be
      checked against the real command surface the same way
      spec-drift.js already checks version against code.

  # ────────────────────────────────────────────────────────────────
  axioms:
  # ────────────────────────────────────────────────────────────────
  # Each axiom stated, then the evidence in THIS file that satisfies it.
  # An axiom with no evidence line is quoted, not enforced (idearium
  # axioms.spec template's own rule, applied here).

    §1.1_NOTHING_EXISTS_UNTIL_PROVEN: >
      Evidence: guardian.spec's own `routes:` block lists 11 entries and
      `handshake.components[]` lists 9 — checked directly against
      guardian/server.js, which has 73 real `method===...&&pathname===...`
      dispatch checks. The spec's own command list is currently ~85%
      incomplete. This is not a hypothetical the architecture below
      guards against — it is the current, measured state.

    §3.1_BOTTOM_UP_ONLY: >
      Evidence: this spec is written and reviewed before any of the five
      systems' command-index files exist. build_order below is ordered
      by real dependency risk (cheapest/most-structured system first),
      not by importance or request order.

    §5.1_UUID_HOOK_BUS_ON_EVERYTHING: >
      Evidence: meta.uuid above; each system's command-index file (see
      architecture.mechanisms) will carry its own uuid at emission time,
      not reuse this one.

    §5.3_NO_MONKEY_PATCHES: >
      Evidence: architecture.mechanisms below is five DIFFERENT real
      mechanisms, one per system's actual dispatch shape — not one
      generic function forced onto systems it doesn't fit (clear-glass's
      Express-introspection approach was checked against guardian/
      ollama/bridge's actual source before this spec was written, and
      confirmed NOT to apply — none of the three are Express apps).

    §8.2_HOSTILE_REVIEW_BEFORE_SPEC: >
      Evidence: every number in this file (73, 11, 9, 16, 106, 72) was
      produced by grep/node against the real source files in this
      session, not estimated. See meta's "Source truth" comment block
      for exactly which files were read.

  # ────────────────────────────────────────────────────────────────
  architecture:
  # ────────────────────────────────────────────────────────────────
    purpose: >
      One real, current command index per system, each a file living
      inside that system (not a central registry one system can drift
      out from under), each referenced by that system's own .spec so
      the spec can declare "this is what I actually expose" and be
      checked against reality — the same relationship spec-drift.js
      already has with version numbers, extended to command surfaces.

    relationship_to_spec_drift_js: >
      orchestrator/lib/spec-drift.js today compares ONLY the `version:`
      field in each system's .spec against lib/version.js — confirmed
      by reading its full extraction logic, which has no route/command
      awareness at all. This spec does not replace or duplicate that —
      it is the same "drift is never silent, opens a gap" philosophy
      (spec-drift.js's own §1.2/§2.1) applied to a second axis: does
      the spec's declared command surface match the real one. A future
      phase (not this one — see build_order) can extend spec-drift.js
      itself to check both axes in one pass rather than two separate
      checkers.

    mechanisms:
      # Five systems, five real dispatch shapes, five real mechanisms.
      # No mechanism here is copy-pasted onto a system it wasn't
      # verified against.

      - system: clear-glass
        dispatch_shape: "real Express app (this.app, express())"
        mechanism: "live introspection of this.app._router.stack"
        file: "clear-glass/src/ipc/bridge.js — _buildCommandIndex()"
        status: DONE                # not built by this spec — already real, verified 2026-09-03
        served_at: "GET /cli/commands, persisted to data/clear-glass/command-index.json"
        consumer: "lib/agent-tools/tools/clear-glass/command-index.js — discover()/call(), already live"

      - system: idearium
        dispatch_shape: "declared route array — [method, ['api','repos'], 'repo.ingest'] etc, 72 entries, confirmed by grep"
        mechanism: >
          §CORRECTED 2026-09-03 — this was specced as new work; it
          already existed. `case 'contract.live'` (idearium/api/index.js,
          dated \u00a7PHASE 3 2026-07-10) reads its own source file and
          regex-extracts every real [method, segs, action] tuple at
          request time -- source-derived, same discipline as guardian/
          bridge's phase 3/4 mechanism below, not the array-mapping this
          spec originally proposed. Actually run this pass, not assumed:
          returned 72 endpoints, matched an independent fresh grep count
          exactly (72=72).
        file: "idearium/api/index.js — case 'contract.live' (real, pre-existing, not built this session)"
        served_at: "GET /api/contract/live (real path -- corrected; this spec originally invented /api/command-index, which does not exist)"
        status: DONE
        remaining_gap: >
          Does not yet populate lib/tool-index.js (see
          universal-block-primitive.spec's living_index_unification) --
          it's a pure projection endpoint, not persisted into the shared
          registry. Real, small, separate follow-up, not blocking phase-1
          completion.

      - system: ollama
        dispatch_shape: >
          routes/*.js modules, each required into an array and tried in
          order (ollama/server.js, confirmed by reading its own header
          and require list — routes/system.js, uploads.js, stream.js,
          jobs.js, queue.js, models.js).
        mechanism: >
          Each route module self-declares its own command list as a
          named export (module.exports.commands = [...]) alongside its
          existing handle(ctx) export — a small, additive convention,
          not a rewrite of dispatch. Boot-time aggregation across all
          six modules produces the real index.
        file: "ollama/lib/command-index.js (new, aggregator) + each routes/*.js gets a `commands` export (small addition, 6 files)"
        served_at: "GET /commands (new)"
        status: SPECCED

      - system: guardian
        dispatch_shape: >
          73 real inline `if (method===X && url.pathname===Y)` checks in
          guardian/server.js, plus the already-extracted guardian/routes/
          *.js files (settings.js, autonomous-loop.js, mesh.js) which use
          a handle(req,res,ctx)->boolean contract but do not self-declare
          their own paths anywhere introspectable.
        mechanism: >
          Static source-extraction: regex over guardian/server.js's own
          text for the `method===...&&url.pathname===...` pattern,
          producing the index FROM the real dispatch code — not
          hand-maintained, not live-introspected (no router object
          exists to ask), but still incapable of drifting silently,
          because it's derived from the literal file each time it's
          regenerated, not a memory of what the file used to contain.
          Regenerated command-index.json is diffed against guardian.spec's
          existing (stale) `routes:`/`handshake:` blocks as the first
          real proof this mechanism catches real drift.
        file: "guardian/lib/command-index-extract.js (new)"
        served_at: "GET /commands (new)"
        status: SPECCED

      - system: bridge
        dispatch_shape: "16 real inline method checks, same shape as guardian, smaller (bridge/server.js, confirmed by grep)"
        mechanism: "same source-extraction approach as guardian — same mechanism, not a sixth new one, because it is genuinely the same dispatch shape"
        file: "bridge/lib/command-index-extract.js (new — deliberately not shared code with guardian's version until guardian's is proven; see build_order)"
        served_at: "GET /commands (new)"
        status: SPECCED

  # ────────────────────────────────────────────────────────────────
  build_order:
  # ────────────────────────────────────────────────────────────────
    # §3.1 — ordered by real dependency/risk, not by request order.
    # A phase does not begin until the phase below it has passing tests.

    - phase: 1
      system: idearium
      why_first: "cheapest — the route array already exists, this is exposure not extraction"
      exit_criteria: "GET /api/contract/live returns all 72 real routes, verified count matches grep count of the routes array at time of test"
      status: DONE — verified 2026-09-03, 72=72, real endpoint pre-existed under a different name than this spec originally guessed

    - phase: 2
      system: ollama
      why_second: "six small additive changes to existing files, no new extraction mechanism to prove"
      exit_criteria: "GET /commands returns a union of all six modules' declared commands, verified against ollama/server.js's own require list"

    - phase: 3
      system: guardian
      why_third: >
        the real proof case — largest drift (73 real vs 11 declared),
        highest value, but also the first use of the source-extraction
        mechanism, which is unproven until this phase runs.
      exit_criteria: >
        GET /commands count matches a fresh grep count of guardian/
        server.js's method===/pathname=== pattern at test time (not a
        stored number — re-derived every test run, same discipline as
        the mechanism itself). Diffed against guardian.spec's existing
        routes:/handshake: blocks; the diff itself becomes the first
        real gap filed against guardian.spec's drift.

    - phase: 4
      system: bridge
      why_fourth: "same mechanism as phase 3, proven — this phase is replication, not invention"
      exit_criteria: "same as guardian, scaled to bridge's 16 real checks"

    - phase: 5
      system: clear-glass
      why_last: "already done — this phase is wiring copilot's existing command-index.js tool to also discover the other four, not building anything new"
      exit_criteria: "lib/agent-tools/tools/clear-glass/command-index.js's discover()/call() pattern replicated for guardian/ollama/idearium/bridge as sibling tools, or generalized into one multi-system tool — decision deferred to that phase, not made here"

  # ────────────────────────────────────────────────────────────────
  spec_model_hooks:
  # ────────────────────────────────────────────────────────────────
    # "Hooked into the spec/living model" — concretely, what each
    # system's own .spec gains once its phase above is DONE:
    description: >
      Each system's own .spec (guardian/spec/guardian.spec,
      orchestrator/spec/orchestrator.spec, idearium/spec/idearium.spec,
      ollama/spec/ollama.spec) gets a new `command_index:` block added
      at build time (not now — §1.1, nothing marked done on claim),
      pointing at the real file + endpoint from architecture.mechanisms
      above, replacing that system's existing hand-maintained routes:/
      handshake: list rather than living alongside it as a second,
      competing source of truth.
    stub_added_this_pass: >
      A `command_index:` block IS added to all four non-clear-glass
      specs right now, status: specced — a forward pointer to this
      file and to build_order's phase number, not a claim that the
      index exists yet. This is the "update the spec models first"
      step; the phases above are what makes each pointer real.
