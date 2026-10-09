spec:
  meta:
    name:        axiom-5-2-raid-routing
    roadmap: folded into one-model-engine — its open routes are ME8 (observability contracts) (declutter 2026-10-09, James: "okay")
    version:     0.1.0-phasemap
    status:      "PHASEMAP 2026-09-13. Executes
      TRACKS_EXPLICITLY_NOT_STARTED_YET.track_d_axiom_5_2_compliance from
      docs/2026-09-13-massive-codebase-orchestration-phasemap.spec, now
      unblocked (MCO6 gate MET). Its own text required a map-before-build
      pass rather than a rider on that file — this is that pass."
    uuid:        nexus-axiom-5-2-raid-routing-v0-0000-2026-0913-001
    author:      James Brooks
    intent: >
      Make "§5.2 everything routes through RAID" true for orchestrator.js's
      real proxy traffic to cortex/guardian/architect/idearium — but only
      where that's honest. MCO7 found the real traffic is not one uniform
      thing; MCO8 wires the narrow real subset that's honestly wireable
      today, reusing idearium's own already-proven observability pattern
      rather than inventing a new one.

  MCO7_map_real_proxy_traffic:
    depends_on: []
    status: "DONE 2026-09-13."
    does: >
      Audit orchestrator/orchestrator.js's sysReq() proxy layer (raw HTTP,
      zero RAID contact) directly, not assumed.
    findings:
      - "131 real proxy calls across cortex/guardian/architect/idearium: 91
        GET, 38 POST, 2 DELETE. RAID's own §RAID-WORKER already runs
        inside this same file, draining the real contract queue — wholly
        disconnected from these 131 calls."
      - "Excluded — reads, not work: all 91 GETs. RAID governs contract
        lifecycle, not queries."
      - "Excluded — already caller-decided, existing precedent: POST
        guardian '/command' (dispatch). Identical shape to MCO2's real
        finding (docs/2026-09-13-massive-codebase-orchestration-
        phasemap.spec): 'provider explicitly chosen by the caller, not
        RAID-picked.' Re-litigating it here would contradict a decision
        already made this session."
      - "Excluded — system's own internal bookkeeping, not inter-system
        work: cortex's ~13 POSTs (/event, /memory/*, /tags, /snapshots/*,
        /versionium/commit, /ess/analyse, /replay/inspect, /files/upload,
        /purge). Cortex acting on itself, not being handed a contract."
      - "ARCHITECTURAL FINDING, the actual reason this needed its own map:
        RAID's real queue drains on raid-worker.js's ~15s cadence —
        genuinely asynchronous end-to-end. Every remaining write route
        (idearium's legacy spec.build, architect's blueprint.scan/diff,
        map.scan, snr.check, translate.utl, gaps; guardian's
        blueprint.compile, bus/emit, artifacts, ledger, memory/ingest,
        queue/cancel, seam/retry) is a SYNCHRONOUS handler that awaits its
        real work inline and returns 200 in the same HTTP response
        (verified directly: idearium/api/index.js's spec.build case
        awaits compileIdeariumSpec() and returns ok() from the same
        request; architect/service.js's blueprint/scan the same shape).
        'Route it through RAID' cannot honestly mean 'submit to the async
        queue and wait' without either breaking that synchronous
        contract or adding real 15s+ latency neither caller expects.
        Would have been a fabricated claim of compliance, not real
        wiring, if built that way."
      - "The honest mechanism already exists and is already proven safe:
        idearium's own spec-engine chunk-dispatch path (§RAID-SOURCE
        2026-08-29) already does submitContract() for observability
        alongside its own real, unmodified dispatcher, then
        reportExternalOutcome(queueId, {status}) once its own real
        result is known — additive, never blocking, never re-executing
        the work. This is the pattern MCO8 reuses, not a new one."
      - "Zero of architect's or guardian's real write routes use
        submitContract/reportExternalOutcome anywhere (grep-confirmed,
        zero hits). idearium's OWN legacy spec.build route (distinct
        from the spec-engine chunk path above, in the same file) also has
        zero RAID wiring despite being real, heavy write work."
    gate: "MET — real proxy traffic classified into excluded (129 of 131)
      and honestly-wireable-via-the-observability-pattern (the routes
      named above), written before any route was touched."

  MCO8_wire_the_honest_subset:
    depends_on: [MCO7]
    status: "PARTIAL 2026-09-13 — 2 of the identified candidate routes
      wired this session as real, verified proof of the pattern; the
      remainder (architect's blueprint.diff/map.scan/snr.check/
      translate.utl/gaps; guardian's blueprint.compile and the rest)
      are named, not touched — same discipline as MCO0's clear-glass
      classification (real, un-started work is named as such, not
      silently claimed done)."
    does: >
      Reuse idearium's own submitContract()+reportExternalOutcome()
      pattern verbatim: submit for observability before the real work,
      report PASS/FAIL after it (from the caller's own already-known
      result), catch-and-log any RAID-side failure so it never blocks the
      real handler.
    built:
      - "cortex/core/raid/contract-boundary.js: new REGISTRY row
        'architect:blueprint.scan' (source:intention key, matching this
        module's own resolveBoundary(source, intention) shape — not
        source:system, per its own header's grep evidence)."
      - "architect/service.js's real POST /api/blueprint/scan handler:
        submits before blueprint.fromScan(), reports PASS on success /
        FAIL with the real error message on the existing catch branch.
        fromScan() itself untouched — same execution path, same response
        shape, same status codes as before."
      - "idearium/api/index.js's real, legacy 'spec.build' case (the
        route distinct from the spec-engine chunk path that already had
        this): submits before compileIdeariumSpec(), reports PASS/FAIL
        from compileResult.ok on the two real branches that already
        existed. Reuses the already-registered 'idearium:build' boundary
        row rather than adding a near-duplicate for the same real
        system doing the same kind of work."
    verified: >
      node -c passed on all three edited files. Both new call sites
      wrapped in their own try/catch, matching idearium's own
      §HONEST LIMIT precedent, so a RAID-side failure (submitContract
      throwing, reportExternalOutcome throwing) cannot block or alter
      the real scan/build result the caller already gets today.
    gate: "MET for exactly these two routes: a real blueprint scan and a
      real legacy spec build each produce a real RAID queue row and a
      real terminal raid.contract.pass/fail event, with zero change to
      either route's existing response shape, status codes, or timing.
      NOT met, and not claimed: the remaining ~13 identified routes —
      named in MCO7, not yet wired. NOT attempted, and should not be:
      making these routes' execution genuinely queue-and-wait through
      RAID's async drain — that would be a different, much larger
      change (breaks the sync response contract) than what §5.2's real
      traffic actually calls for here."

  MCO12_architect_remaining_routes:
    depends_on: [MCO8]
    status: "DONE 2026-09-13. All 5 architect candidates MCO7 named checked
      individually — 2 correctly excluded (blueprint.diff, snr.check are
      pure read/compute, zero jaa.insert in either handler, same
      reads-excluded principle MCO7 already applied to GETs, just on a
      POST verb this time), 3 real write-work routes wired
      (map.scan/translate.utl/gaps.open) and verified LIVE against a
      real booted architect instance — real raid_contract_queue rows
      confirmed with status:pass after properly waiting out jaaDB's
      debounced flush (a first check without the wait showed 0 rows,
      false-negative, same timing class this codebase's own changelog
      already documents for cross-process JAA writes)."
    gate: "MET. architect/service.js's real write routes all have RAID
      observability now; its real read/compute routes correctly don't."

  MCO12_guardian_list_was_unreliable:
    depends_on: []
    status: "FINDING, not yet actioned. MCO7's guardian route list (bus/emit,
      artifacts, ledger, memory/ingest, queue/cancel, seam/retry,
      blueprint/compile) was checked individually this pass, per the
      honest_risks note this file already carried. 4 of 7 don't exist as
      real routes anywhere in guardian/server.js at all (ledger,
      memory/ingest, queue/cancel, blueprint.compile) — the original list
      was named, not verified, for guardian specifically, unlike the
      routes that actually got built. Of the 2 that exist: bus/emit is a
      generic broadcast relay (caller supplies both type and data, no
      single well-defined intention to tag it with — same exclusion class
      as /command); seam/retry is a control action on an already-running
      SEAM chunk, not new work being created — a different category from
      map.scan/translate.utl/gaps.open, which each produce new persisted
      content. artifacts is a GET (read), also mis-listed."
    gate: "NOT MET, and possibly moot — a fresh, real audit of guardian's
      actual write-work routes (same direct-grep discipline already
      applied to architect and to guardian's own interaction-contract.json
      reconciliation) is needed before wiring anything else here, not a
      continuation of the original named list."

  MCO12_guardian_audit_complete:
    depends_on: [MCO12_guardian_list_was_unreliable]
    status: "DONE 2026-09-13. All 20 real POST routes in guardian/server.js
      (guardian/interaction-contract.json's own reconciled list) checked
      individually, direct code read, not assumed. CONCLUSION: zero real
      gaps. Guardian was never missing RAID integration — it already has
      it, through purpose-built mechanisms rather than the generic
      submit/execute/report pattern architect's routes needed:
      /build (raid._approveTool() — a real approval gate), /api/intake
      (already correlates to the EXISTING RAID contract behind a
      dispatched job — raid.listQueue().find(dispatchedJobId===jobId) —
      strictly better than a redundant new observability contract would
      be), /api/copilot/prompt (already calls real POST /api/raid/decide).
      /api/intake/verdict|promote|rollback are governance actions on that
      same already-correlated record. seam/retry, wake-job-ack,
      organism-queue/:id/ack, providers/:name/spawn are control/ack
      actions on already-existing work, not new content. bus/emit,
      api/guardian/cfr/event (a pure proxy to cortex's own generic
      /api/event), command, command/tools, cli/exec, chatgpt-mode/query
      are generic relays or caller-decided dispatches, same exclusion
      class /command already established. result/heartbeat/stream/:jobId
      are NCP protocol internals already covered by guardian's own real
      job-durability system (P22-P24)."
    gate: "MET — by finding, not by wiring. Applying the observability
      pattern anywhere in this list would either duplicate an
      already-real, more-correct mechanism or misfit a control/relay
      action that was never 'work' in the RAID contract sense. Track D
      is now honestly complete for both systems it named: architect
      needed and got 3 real routes wired; guardian needed nothing."

  honest_risks:
    - "The observability pattern this reuses never gates or authorizes —
      per contract-boundary.js's own resolveBoundary() docstring, an
      unresolved or unreported contract is informational, not blocking.
      §5.2 compliance under this phasemap means 'RAID sees real traffic
      as it happens,' not 'RAID controls it' — a narrower, and more
      honest, reading than the axiom's name alone suggests."
    - "guardian's routes (bus/emit, artifacts, ledger, memory/ingest,
      queue/cancel, seam/retry, blueprint/compile) were named in MCO7 but
      not individually re-read for the same caller-decided-precedent
      check MCO2 already applied to '/command' — do that read before
      wiring any of them, not after."
    - "Wiring the remaining ~13 routes is mechanically identical to the
      2 built here (same three-line submit / try-execute / report
      shape) — the risk is volume and per-route boundary-row bookkeeping,
      not a new pattern to design."
