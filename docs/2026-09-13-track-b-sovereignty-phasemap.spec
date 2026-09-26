spec:
  meta:
    name:        track-b-sovereignty
    version:     0.1.0-phasemap
    status:      "PHASEMAP 2026-09-13. Executes
      TRACKS_EXPLICITLY_NOT_STARTED_YET.track_b_sovereignty from
      docs/2026-09-13-massive-codebase-orchestration-phasemap.spec (not
      present in this export, cited by name only). Two of its three
      original items are RETRACTED this pass, not completed — real
      evidence traced since the original scoping contradicts the premise
      both were written against."
    uuid:        nexus-track-b-sovereignty-v0-0000-2026-0913-001
    author:      James Brooks

  MCO16_component_projections_retracted:
    depends_on: []
    status: "RETRACTED 2026-09-13. Original plan: split
      component_projections.json per real owning system, called 'a live
      §5.9 sovereignty violation' when first found. Traced the real, only
      caller of component-registry.js's init() this pass:
      orchestrator.js, which explicitly requires cortex/memory/jaa-db and
      logs 'components loaded... across N systems' — a deliberate,
      documented, single cross-system identity authority (the same 'One
      Registry' decision already found and respected for contracts/
      SYSTEM-CONTRACTS.js). Splitting this per system would work against
      that real, existing architectural decision, not correct a
      violation. The original call was made before this trace existed;
      retracted now that it does. Also found, incidentally: the file's
      current real content in this tree is 1 row (guardian.health,
      created this session as a side effect of MCO15's registration
      test), not the 294-row/11-system state originally documented — a
      different data snapshot than the one the original finding was made
      against, independent of the architectural retraction above."
    gate: "N/A — no action taken, none warranted."

  MCO17_contract_boundary_retracted:
    depends_on: []
    status: "RETRACTED 2026-09-13. Original plan: split contract-
      boundary.js's REGISTRY by real owner (idearium:build → idearium,
      copilot:build → copilot). Reconsidered: RAID is itself deliberately
      centralized (§5.2 — everything routes through RAID); this REGISTRY
      is RAID's own internal answer to 'do I recognize this (source,
      intention) pair,' the same role a router's own routing table plays
      — correctly owned by the router, not distributed to each client.
      Splitting it would mean resolveBoundary() has to query N different
      systems' own files to answer one question about RAID's own contract
      intake, defeating the point of one fast, authoritative registry."
    gate: "N/A — no action taken, none warranted."

  MCO18_interaction_contract_split_scoped:
    depends_on: []
    status: "DONE 2026-09-13. All 6 remaining real systems reconciled the
      same way guardian was (MCO1b): architect (5→34), cortex (16→52),
      orchestrator (0→14, its first dedicated file), idearium (0→78,
      extracted programmatically from a real [method,pathSegments,action]
      route table — a genuinely different dispatch style than every
      other system's path_===/startsWith style, found and handled rather
      than assumed to match), copilot (0→23, also its first dedicated
      file). diagnostic already complete (Phase 6). bridge correctly
      excluded — retired, not reconciled. contracts/nexus-interaction-
      contract.js marked §DEPRECATED in place (§A-4 — never delete), not
      removed. Found and correctly handled, not silently mislabeled: a
      real, LIVE remnant of the retired Bridge system — copilot's
      /bridge/deliver route, a real receiver Bridge itself used to route
      through. My own first draft of copilot's file called this route
      'unrelated to Bridge' before checking the surrounding comment;
      caught and corrected before shipping." 
    gate: "MET. Every real system (bar the deliberately-excluded retired
      bridge) has its own accurate, code-verified interaction-contract.json.
      One real, honestly-stated gap remains: orchestrator.js's real GET
      /api/contract/:system endpoint still serves from the now-deprecated
      central file — repointing it to read each system's own file is
      real, separate work, not done this pass."
