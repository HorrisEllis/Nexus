spec:
  meta:
    name:        cortex-to-intelligence-and-versionium-consolidation
    roadmap: 'later — consolidation — later (declutter 2026-10-09, James: "okay")'
    version:     0.1.0-phasemap
    status:      "v0.39.151. P1-P6 BUILT 2026-09-19 (P6: versionium residue, cortex/versionium kept as archive by D6) (intelligence routes, sovereign field, RAID
      registration, liminal-space organ, caller repoint, contracts/hooks/registries,
      port collision) and verified with REAL processes. NOT built: the /cfr/field relay
      snapshot (D3), V7, sigma. B8 (cfr relay) and P6 are DONE. See built_2026_09_19."
    author:      James Brooks
    scope:       "(1) move every intelligence-domain HTTP route still hosted by
      cortex/boot.js (:3748) to the sovereign intelligence system
      (intelligence/server.js, :3753); (2) close out versionium's remaining
      residue inside cortex and elsewhere."
    axioms_in_play: "0.3 nothing lost; 1.2 nothing silently fails; 3.3 map before
      build; 5.9 every system sovereign; 10.3 competing truth layers are
      system failure; 16.1 close nearest gap first; 16.5 delete before add;
      17.7 never fix a symptom twice"

  # -------------------------------------------------------------------------
  # 1. HEADLINE: the two halves of this request are in very different states
  # -------------------------------------------------------------------------
  headline:
    versionium: "MOSTLY DONE ALREADY. The sovereign move (VS1, 2026-09-02) is
      built: versionium/ is a real system (41 files, ~1.1k LOC), launched by
      nexus/autopilot.js phase 3 on :3754, and cortex/boot.js:1310 answers
      /api/versionium/* with a 410 tombstone naming the new port. What is left
      is RESIDUE, not a migration: see section 3. Treating it as a
      from-scratch migration would re-do finished work."
    intelligence: "GENUINELY OPEN, and bigger than it looks. Cortex serves 15
      intelligence-domain routes; 2 are already proxied to :3753, 13 are
      computed inside cortex's own process from state cortex owns. Moving them
      is not a route rename: it moves ownership of a mutable CFR field, a
      jaaDB access pattern, and a per-prompt availability dependency
      (blockers B1-B4)."

  # -------------------------------------------------------------------------
  # 2. ROUTE INVENTORY - intelligence-domain routes hosted by cortex/boot.js
  # -------------------------------------------------------------------------
  route_inventory:
    note: "boot.js line numbers are for the handler. 'state' = what the handler
      depends on inside cortex's process."
    routes:
      - {line: 643,  route: "ANY  /api/intelligence/status",            now: "PROXY to :3753 (already migrated)", target: "keep as forwarder (P3)"}
      - {line: 998,  route: "POST /api/intelligence/event",             now: "PROXY to :3753 (already migrated)", target: "keep as forwarder (P3)"}
      - {line: 682,  route: "ANY  /api/intelligence/context",          now: "in-process _contextSnapshot()",     state: "_field, jaaDB event_log/gaps", note: "intelligence/index.js ALSO implements /context -> two implementations, shapes not yet diffed"}
      - {line: 926,  route: "ANY  /api/intelligence/patterns",         now: "in-process (_buildPatterns over 'crystals')", note: "intelligence/index.js also implements it"}
      - {line: 959,  route: "GET  /api/intelligence/reuse",            now: "in-process require('../intelligence')",       note: "intelligence/index.js also implements it"}
      - {line: 968,  route: "GET  /api/intelligence/failures",         now: "in-process require('../intelligence')",       note: "intelligence/index.js also implements it"}
      - {line: 688,  route: "ANY  /api/intelligence/intuition",        now: "in-process _intuition.answer()",    state: "_field, taxonomy, system-lattice, _buildPatterns", note: "NOT on intelligence server"}
      - {line: 695,  route: "ANY  /api/intelligence/mastermind",       now: "in-process _mastermind.analyze()",  state: "_field, CausalGraph, jaaDB", note: "NOT on intelligence server; reads body.context"}
      - {line: 709,  route: "ANY  /api/intelligence/mastermind/patterns", now: "in-process detectRecurringPatterns()", note: "NOT on intelligence server"}
      - {line: 718,  route: "ANY  /api/intelligence/adversarial",     now: "in-process compareCortexFaculties()", note: "intelligence server has POST /api/adversarial (DIFFERENT path/contract)"}
      - {line: 945,  route: "ANY  /api/intelligence/rca",              now: "in-process _buildRCA over open 'gaps'", note: "NOT on intelligence server"}
      - {line: 750,  route: "ANY  /api/cortex/query",                  now: "in-process narrative query surface", note: "intelligence-domain, cortex-named. Reads gaps/event_log/blueprint + mastermind"}
      - {line: 665,  route: "ANY  /api/cortex/lattice",                now: "in-process intelligence/spatial/system-lattice", note: "intelligence-domain, cortex-named"}
      - {line: 935,  route: "GET  /api/liminal-space/status",          now: "in-process intelligence/liminal-space", note: "intelligence-domain"}
      - {line: 939,  route: "GET  /api/liminal-space/list",            now: "in-process intelligence/liminal-space", note: "intelligence-domain"}
    dead_code:
      - "boot.js:982 GET /api/intelligence/intuition and boot.js:988 POST
        /api/intelligence/mastermind are UNREACHABLE: the handlers at :688/:695
        match any method first and return. They also read a different body
        field (contextSnippet) than the live handler (context). So any caller
        that sends contextSnippet has it silently ignored today. P1 must
        establish which field real callers send BEFORE either is deleted."
    not_intelligence_stays_in_cortex: "/api/jaa/*, /api/memory*, /api/push,
      /api/recall, /api/events, /api/event, /api/gaps, /api/raid/*,
      /api/self-heal/*, /api/snapshot*, /cfr/*, /api/personas, /api/tags,
      /api/ideas*, /api/movement, /api/manifest. Out of scope."

  # -------------------------------------------------------------------------
  # 3. FINDINGS (verified)
  # -------------------------------------------------------------------------
  findings:
    callers_of_moved_routes:
      browser_userscripts: "guardian/userscript-{claude,chatgpt,gemini,deepseek,perplexity}.js
        and nexus-hey-claude.user.js call ${CORTEX_URL}/api/intelligence/context
        (per prompt) and /status. Installed in browsers - cannot be atomically
        redeployed."
      in_repo: "orchestrator/orchestrator.js:2357,2367,2374 (patterns/failures/reuse
        via GET('cortex',...)); orchestrator/lib/mcp-server.js:247,261;
        lib/agent-tools/tools/query/query-intelligence.js:130 (lattice);
        hooks/cortex.hooks.js and hooks/guardian.hooks.js (declared endpoints);
        cortex/interaction-contract.json (11 intelligence paths + query, lattice, 2 liminal);
        cortex/registry-components.js:39-48 (9 intelligence.* components
        registered AS cortex's); intelligence/registry-components.js (5 more,
        same names => duplicate registration surface)."
      already_correct: "lib/agent-tools/tools/coordination/intelligence-query.js
        already targets INTEL_PORT (3753)."
    versionium_residue:
      - "cortex/versionium/{index,causality}.js (477 LOC): archived reference,
        deliberately untouched per decision D6 (2026-09-15). Not executed."
      - "cortex/boot.js:1032 SOVEREIGN_TABLE_OWNERS: /api/memory still routes
        versionium_* tables to the owning module (VSB1 fix). A live cortex->
        versionium coupling."
      - "cortex/cortex-v2.js:1021-1050,1288: CLI 'versionium status|log|chain'
        reads /api/memory?table=versionium_commits through cortex."
      - "cortex/snapshot/index.js (477 LOC, LIVE): JAA-table-state -> .nex
        archive with chain integrity + prune. Required by
        orchestrator/lib/autonomous-loop.js:163, orchestrator/lib/request-
        handler.js:734, lib/compartment-engine.js:66, two test files. Served by
        cortex /api/snapshot(s)/create/rollback (boot.js:1326-1400). Overlaps
        conceptually with versionium.commit(state) - see decision D3."
      - "versionium.spec open gaps as of 2026-09-02: V1 (version_history writer),
        V2 (fork-point recording), V3 (idearium hard-depends on versionium
        availability), V4 (snrDelta), V5/V6 (legacy backfill - migration
        scripts now exist per 2026-09-15 decision log; spec gap list not
        updated), V7 (two independent sigma-gated auto-commit triggers:
        versionium/lib/engine.js and orchestrator/lib/versionium-auto-commit.js)."
      - "DOC DRIFT: docs/2026-09-02-versionium-sovereign-and-cleanup-phasemap.spec
        still marks every item OPEN / 'mapped-not-built' though VS1 is built."
    doc_drift_elsewhere:
      - "docs/NEXUS-INTELLIGENCE-LAYER-INDEX.md Phase 2 says to build
        GET /api/cortex/query 'on cortex/boot.js' - contradicts this target."
      - "lib/agent-tools/tools/query/ambiguity-pull.js says AM1 agent_model is
        'mapped, not built' - stale since the session-final merge added
        lib/agent-model.js."

  blockers:
    B1_field_ownership: "cortex holds a mutable in-memory CFR field (_field,
      boot.js:~185) fed by the orchestrator (POST /cfr/field at :445, and a
      poll of orchestrator :9000/cfr/field at :1578-1586). intuition,
      mastermind and _contextSnapshot all read it via getField(). The
      intelligence server has its OWN CFR ledger (createCFRLedger,
      server.js:50). Moving the faculties without deciding which is the field
      source creates two competing truth layers (10.3). -> DECISION D1."
    B2_jaadb_not_single_writer: "cortex/memory/jaa-db.js documents itself as
      'one file per table, JSON-array format, shared by convention - not
      single-writer'; reloadTable() exists because of this. A faculty running
      in the intelligence process reads its own in-memory copy of crystals/
      gaps/event_log and will serve STALE data unless it reloads before reads.
      Same class of bug as the versionium split-brain fixed in
      tests/modules/test-vsb1-versionium-split-brain-fix.js."
    B3_availability_tier: "cortex is critical/phase 1 in nexus/autopilot.js;
      intelligence is phase 3, not optional, not critical. The userscripts hit
      /context on EVERY prompt. Today it is answered in-process by the most
      available service; after the move it depends on a later-phase process.
      Forwarder must degrade honestly (503, short timeout) and the
      userscripts' degrade path must be verified, not assumed."
    B4_userscript_cutover: "VS1 used a hard 410 tombstone because every caller
      was in-repo and updated in the same migration. That is NOT true here:
      6 userscripts live in browsers. A hard tombstone would break prompt
      injection until each is reinstalled. -> DECISION D2."
    B5_port_3753_collision: "nexus-healer/api/index.js:16 and its
      interaction-contract.json default to :3753 - the same default as
      intelligence/config.js:20. Latent today (nexus-healer is not in
      nexus/autopilot.js), live the moment both run. Also
      orchestrator/orchestrator.config.json 'ports' has no intelligence entry
      although cli/nexus-repl.js, diagnostic/nexus-diagnostic.js and
      lib/uid/component-map.js all know 3753."
    B6_two_intelligence_runtimes: "cortex/boot.js:1775 calls
      require('../intelligence').init({getField, scans:['failures','reuse']})
      IN cortex's process while intelligence/server.js runs init({}) in its
      own. Two runtimes scan the same JAA tables. The comment there calls the
      split deliberate/partial; it is a transitional state, not a target."

  # -------------------------------------------------------------------------
  # 4. DECISIONS (need James; recommendation given, not assumed)
  # -------------------------------------------------------------------------
  decisions:
    D1_field_source:
      question: "Who is the source of truth for the CFR field the faculties read?"
      options:
        a: "Orchestrator remains the only writer. Intelligence subscribes/polls
          the same orchestrator /cfr/field feed cortex already uses. Cortex
          _field becomes a cache and is deleted last."
        b: "Intelligence's own CFR ledger becomes authoritative; orchestrator
          feeds intelligence; cortex reads from intelligence."
      recommend: "a. It changes one consumer at a time and adds no new writer.
        b is the better end-state but is a separate migration."
    D2_cutover_policy:
      question: "Forwarders or tombstone for cortex's old intelligence paths?"
      recommend: "Forwarders with a Deprecation response header and a per-route
        hit counter, then convert each to a 410 tombstone (VS1 precedent) only
        when its counter has been zero across a real usage window. Userscripts
        get INTELLIGENCE_URL with CORTEX_URL fallback in the same pass."
    D3_snapshot_ownership:
      question: "Does cortex/snapshot move into versionium?"
      recommend: "NOT in this pass. It is a live table-archive primitive with
        three in-repo consumers, and moving it forces the git-vs-versionium
        rewind-engine decision the 2026-09-18 handoff (item 3) already flagged
        as undecided. Doing both at once is how a third rewind concept gets
        built by accident. Record it as an explicit deferred decision."
    D4_names:
      question: "Canonical path for the cortex-named routes?"
      recommend: "/api/intelligence/query and /api/intelligence/lattice on
        intelligence; /api/cortex/query and /api/cortex/lattice stay as
        forwarders per D2."

  # -------------------------------------------------------------------------
  # 5. PHASES
  # -------------------------------------------------------------------------
  phases:
    P0_map:
      status: "DONE by this document."
      remaining: "Wire this spec into docs/SPEC-REGISTRY.spec (not yet done;
        registry is 1.5k lines and is edited deliberately, not blind)."
    P1_characterization:
      depends_on: [P0_map]
      goal: "Pin current behavior BEFORE moving anything (17.10 verify before
        promote). Golden-shape tests for all 15 routes against cortex as it is,
        including which body field (context vs contextSnippet) real callers send."
      gate: "tests pass against cortex unchanged; the dead-code question is answered."
    P2_intelligence_gains_routes:
      depends_on: [P1_characterization, "D1", "D4"]
      goal: "Additive only. intelligence/server.js serves intuition, mastermind,
        mastermind/patterns, adversarial, rca, query, lattice, liminal-space
        (+ resolves the /context, /patterns, /failures, /reuse duplicate
        implementations to ONE). Field provider per D1. jaaDB reloadTable
        discipline (B2). Fix B5: give healer a distinct port; add intelligence
        to orchestrator.config.json ports."
      gate: "P1 golden tests pass unchanged when pointed at :3753; a stale-read
        test proves B2 is handled."
    P3_cortex_becomes_forwarder:
      depends_on: [P2_intelligence_gains_routes, "D2"]
      goal: "Delete before add (16.5): remove _intuition/_mastermind
        construction, the in-process handlers, and the dead duplicates at
        :982/:988. Generalize _proxyToIntelligence with Deprecation header,
        hit counter, honest 503 (B3)."
      gate: "P1 golden tests pass against cortex (now forwarding); kill
        intelligence process -> 503 not hang; userscript degrade path verified."
    P4_repoint_callers:
      depends_on: [P3_cortex_becomes_forwarder]
      goal: "orchestrator.js, mcp-server.js, query-intelligence.js, hooks/*,
        interaction-contract.json, registry-components.js (move the 9
        intelligence.* registrations out of cortex's), userscripts
        (INTELLIGENCE_URL w/ CORTEX_URL fallback)."
      gate: "grep finds zero in-repo callers of the cortex-hosted paths."
    P5_retire_second_runtime:
      depends_on: [P4_repoint_callers]
      goal: "Remove cortex/boot.js:1775 intelligence.init(); retire cortex _field
        per D1. One scan owner (B6)."
      gate: "only one process runs intelligence scans; full test:all green."
    P6_versionium_residue:
      depends_on: [P0_map]
      note: "Independent of P1-P5; can run first or in parallel."
      items:
        - "cortex-v2.js versionium CLI -> call :3754 directly."
        - "Retire SOVEREIGN_TABLE_OWNERS once no caller reads versionium_* via
          cortex /api/memory."
        - "Move cortex/versionium/ under versionium/archive/ (0.3: moved, not
          deleted) after loom dangling-report confirms no live edge."
        - "V7: decide one auto-commit trigger or one shared cooldown."
        - "Refresh versionium.spec gap list (V5/V6 status) and the 2026-09-02
          phasemap statuses (drift)."
        - "D3: snapshot explicitly recorded as deferred, with the reason."
      gate: "grep finds no cortex->versionium coupling except the tombstone."
    P7_hostile_verify_and_ship:
      depends_on: [P5_retire_second_runtime, P6_versionium_residue]
      goal: "Six-lens RCA on the whole move; docs (INTELLIGENCE-LAYER-INDEX,
        ambiguity-pull note, this spec's status) updated; version bump; full zip."

  honest_gaps:
    - "Not yet diffed: intelligence/index.js /context vs cortex _contextSnapshot
      output shapes. Userscripts read specific fields; a shape mismatch would
      break them silently. First job of P1."
    - "Not yet checked: what each userscript does when /context returns 503 or
      times out (B3)."
    - "Not yet checked: whether anything outside the searched file types
      (*.js, *.json, *.html, *.spec, *.md) calls the cortex intelligence paths."
    - "Not run: no live boot of cortex + intelligence together was possible in
      this environment (no node_modules in either archive). All findings are
      from static inspection; P1 is where live parity gets proven."

  # -------------------------------------------------------------------------
  # 6. WHAT WAS BUILT (2026-09-19) and the evidence for it
  # -------------------------------------------------------------------------
  built_2026_09_19:
    decisions_resolved:
      D1: "Orchestrator stays the only writer of the CFR field; intelligence polls its /cfr/field
        directly (intelligence/field-provider.js). Cortex is not in the path. One regime vocabulary:
        intelligence's own computeRegime (fixes adversarial.js matching turbulent|resonant, which
        cortex's chaotic/ordered/stable could never emit)."
      D2: "Hard cut (James): old cortex paths are 410 tombstones (VS1 precedent). No forwarders."
      D4: "/api/intelligence/query and /lattice canonical. /api/cortex/query|lattice tombstoned."
      D5_new: "/api/intelligence/crystals added. /patterns had TWO consumer families wanting two
        shapes (copilot reads crystals-derived precursor/outcome/count; MCP nexus_patterns + CLI read
        the bep_patterns shape). One path cannot honestly serve both, so each got its own."
    blockers_resolved:
      B1: "field provider (above)."
      B2: "every faculty read goes through a throttled jaaDB.reloadTable() (routes.js freshReader);
        mutation-tested: disabling it makes IFM-020 fail."
      B5: "nexus-healer moved 3753 -> 3755 (6 edits); intelligence added to orchestrator.config.json
        ports AND orchestrator's SYS map."
      B6: "cortex no longer inits ANY intelligence runtime (both the organ-list init and the
        scans-only init are gone); intelligence/server.js is the one runtime."
      B7: "liminal-space moved with its organ. It runs inside intelligence/server.js on intelligence's
        own bus. Cortex relays the 5 events it originates (POST /api/intelligence/bus, allowlisted to
        the organ's own SUBSCRIBED_EVENTS). cortex.intelligence.pattern_crystallised and tc.drift.signal
        originate inside intelligence and are deliberately NOT relayed (would double-deliver). Nothing
        in the repo subscribes to liminal.* events, so no reverse relay is needed."
      RAID: "RAID's router and capability registry live inside cortex. Intelligence is now a CLIENT of
        RAID: server.js announces intelligence.CAPABILITIES (16) over HTTP via registerSelfRemote,
        with retry while cortex is not up and periodic re-announce. Registration is idempotent (CR-002)
        and persisted (component_projections). intelligence/index.js's in-process registerSelf is now
        opt-in (cfg.registerInProcess) and nothing in-tree sets it."
    silent_bugs_fixed_by_the_move:
      - "Userscript pre-prompt context header was EMPTY on every prompt: cortex's /context shadowed
        intelligence's and returned {field,gaps,events,rca}; the six userscripts read failureModes/
        reuse/patterns/systemState."
      - "MCP nexus_rca always reported nothing: it read d.findings{severity,name,rootCause,fix}, a shape
        no route returns. Fixed at the caller to the real {rca:[{gapId,type,cause,since,sigma}]}."
      - "faculty-tools sent contextSnippet to mastermind; cortex's live handler read body.context and
        dropped it. Both are accepted now."
      - "cortex registered intelligence.predict and intelligence.confidence as capabilities; neither
        route ever existed. Dropped, not moved."
    verified_with_real_processes:
      - "Real cortex + real intelligence as separate OS processes: POST cortex /api/event
        cortex.gap.found -> item appears in intelligence's liminal-space L0/L2 list."
      - "Same run: intelligence registered 16 capabilities with cortex's real RAID endpoint."
      - "SOVEREIGNTY ACCEPTANCE: killed cortex; all 11 intelligence routes still answered 200 and
        liminal-space still served its persisted item."
      - "tests/modules/test-intelligence-faculties-move.js: 20/20 (real HTTP server, fake orchestrator,
        RAID-down-at-boot retry, allowlist, staleness)."
      - "tests/modules/test-intelligence-organs-move.js: 11/11 on the migrated tree, 0/11 on the
        pre-migration baseline (the guard genuinely fails when un-migrated)."
    files_touched_summary: "intelligence/{routes,field-provider,server,index,config,registry-components,
      liminal-space/index}.js + interaction-contract.json; cortex/boot.js (-~440 lines, relay +
      tombstones); cortex/{registry-components.js,interaction-contract.json}; hooks/{intelligence.hooks.js
      (new),cortex.hooks.js,index.js,guardian.hooks.js}; contracts/nexus-interaction-contract.js;
      orchestrator/{orchestrator.js,orchestrator.config.json,lib/mcp-server.js}; 6 guardian userscripts
      (versions bumped: browsers must reinstall); copilot/{server,intuition,recursive-diagnose,analysis,
      lib/copilot-context}.js; lib/agent-tools/tools/{query/query-intelligence,faculty/faculty-tools,
      query/nexus-status,diagnostic/nexus-heal}.js; nexus-healer/{api/index.js,interaction-contract.json}."
    b8_cfr_relay_resolved: |
      RESOLVED (James: "why not move it to the intelligence system's cfr/field?"). Answer: not
      intelligence's, and here is the evidence. (1) Every system mounts intelligence/cfr/ledger's
      handleCFRRoute() on its OWN port, so /cfr/field on intelligence is INTELLIGENCE's own field (fed only
      by events it records), a different thing from the system field; two fields on one path is a
      10.3 failure. (2) The system field's authority is the orchestrator's ledger, which cortex merely
      mirrored (polling it, plus a POST that nothing ever sent). Routing consumers through intelligence
      would add a hop, 5s of staleness, and a dependency on a phase-3 non-critical process for guardian.
      All 8 consumers now read the orchestrator directly; cortex's /cfr/health and /cfr/field are 410
      tombstones (cortex keeps a PRIVATE cache for its own RAID decisions only).
      Switching to an intelligence-served field later is a URL constant per consumer, not a redesign.
    cfr_findings:
      - "`tension` is not a CFR dimension (the ledger field is coherence/friction/resonance/entropy). It was
        cortex's hardcoded default 0.1 and nothing ever wrote it, so nexus-cfr-influence's tension branches
        (raise SNR floor >0.7, halt dispatches >0.85) NEVER fired. It is now optional: absent => skipped
        (identical behaviour), present => acted on (CFA-003)."
      - "autonomous-loop, hot-loader and MCP nexus_cfr read `sigma` from /cfr/health; no route exposes a
        current sigma (it is a per-event score on ledger entries), so it was always 0: the hot-loader's
        'sigma > 0.70 => roll back' safety and nexus_cfr's 'CRITICAL' could never fire. NOT fixed (needs a
        decision on what 'current sigma' means; suggest max sigma over the last N ledger entries). nexus_cfr
        now says 'sigma n/a' instead of asserting 'stable'."
      - "copilot's four /cfr/health readers and its /cfr/deltas reader were written for the LEDGER's shape
        (d.cfr.regime, delta rows), which only the orchestrator serves; cortex's flat relay never matched, so
        they always printed '?'. Repointing fixes them."
      - "lib/diagnostic-report read r.field from a flat response (always undefined). Fixed."
      - "The ledger's /cfr/field now includes `regime` (one definition, from its own snapshot); before, it was
        only on /cfr/health and consumers would each have invented one."
      - "tests/modules/guardian-cfr-proxy.test.js is VACUOUS: it exercises a re-implementation of guardian's
        handler defined inside the test file, not guardian/server.js. IOM-013 is the real coverage."
    honest_remaining:
      P6_versionium_residue: "unchanged from section 3: cortex-v2.js CLI, SOVEREIGN_TABLE_OWNERS,
        cortex/versionium/ archive, V7 double auto-commit trigger, stale phasemap statuses."
      D3_snapshot: "still deferred (see decisions.D3_snapshot)."
      event_log_multi_writer: "intelligence/server.js's command logger inserts into event_log from its
        own process while cortex writes the same table; jaa-store documents that two processes holding
        a table can destroy each other's writes. Pre-existing, flagged, not widened."
      relational_field_capability: "intelligence/index.js registers a 'relational-field' capability at
        /api/intelligence/relational-field; no handler for that path was found. Pre-existing; carried
        over unchanged, worth verifying."
      registry_wiring: "This spec is not yet wired into docs/SPEC-REGISTRY.spec (1.5k lines, edited deliberately)."
      userscript_reinstall: "The hard cut means installed userscripts get 410s until reinstalled."
      preexisting_test_failures: "test-intelligence-core-wired ICW-006 and test-diagnostic-heal-path
        DHP-001/DHP-008 fail on the pre-migration baseline too; not caused by this work."

