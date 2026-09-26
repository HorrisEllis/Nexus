spec:
  meta:
    name:        registry-consolidation
    version:     0.1.0-spec
    status:      SPEC ONLY — no code written. Per §8.5 ("do not build anything
                 without creating a spec file first") and §3.3 (map before build).
    uuid:        nexus-registry-consolidation-v1-0000-2026-0721-001
    author:      James Brooks (architecture) / execution layer (mapping)
    governs:     lib/component-registry.js, lib/hook-registry.js, the unbuilt
                 wire/seam registry, and their consumers.
    supersedes:  nothing. Extends docs/hooks-migration.spec (architect→loom, DONE).

  # ── §3.3 THE MAP — current state, scanned not assumed (§8.4) ──
  current_state:
    registries_that_exist:
      component_registry:
        file: lib/component-registry.js
        storage: JAA (`components` table) — already Cortex-backed
        live: yes — 217 components, init'd by orchestrator at boot
        owner_today: orchestrator (calls init), but code lives in lib/
        consumers_scanned:
          - cortex/boot.js
          - cortex/core/raid/router.js        # the RAID spine resolves targets through it
          - cortex/core/raid/index.js
          - orchestrator.js                   # init + /api/components + /api/capabilities
          - loom/server.js
          - guardian/server.js
          - guardian/lib/grammar-fallback.js
          - orchestrator/lib/mutation-contract.js
          - idearium/registry-components.js
          - clear-glass/src/copilot/bridge.js
          - clear-glass/seam/registry-components.js
          - clear-glass/wire/eros-registry-components.js
        blast_radius: HIGH — 12+ consumers across every major system.
      hook_registry:
        file: lib/hook-registry.js (+ lib/hook-sync-from-component-registry.js)
        storage: JAA (`hooks`, `hook_bindings`)
        live: yes — 269 hooks replayed at boot
        owner_today: LOOM (write authority, migrated 2026-07-20 — docs/hooks-migration.spec)
        consumers_scanned:
          - loom/server.js                    # write authority: seed + sync + CRUD/wire
          - architect/service.js              # READ-ONLY view (410s mutations)
          - loom/templates/system-scaffold.js
          - nexus-healer/cli/index.js
          - lib/version.js (reference only)
        blast_radius: MEDIUM — ownership already consolidated to loom.
      wire_seam_registry:
        file: NONE — loom's boot banner claims "component/hook/wire/seam registry"
              but no wire/seam storage or routes exist (verified by grep).
        existing_orphaned_code_that_implements_it:
          - clear-glass/wire/nexus-wire.js        (229L, orphaned)
          - scripts/verify-wires.js               (224L, orphaned)
          - loom/seed/2026-07-11-session-wires.js (167L, orphaned)
          - emerge/seams/CORTEX_QUERY_SEAM.js     (188L, orphaned — a real seam)
        note: §16.5 (delete before you add) + the orphan inventory say WIRE-IN
              these, do not rebuild.

    the_gap_that_makes_this_law_not_preference:
      - "§8.5 mandates: 'using the hook and wire registry with consumers and
         context to map the system completely.' NO registry has a CONSUMER side
         today — they record what provides, never who consumes. The system
         cannot map itself as §8.5 requires."
      - "§5.1: 'an unregistered hook is an orphan. No orphan modules or hooks
         are allowed.' The full audit found 69 true backend orphans + 79 ESM
         files the CJS core cannot import. The registry is how §5.1 becomes
         enforceable instead of aspirational."
      - "§17.1: every artifact has exactly one owner. Three registries with
         three different owners (orchestrator inits components, loom owns hooks,
         nobody owns wire/seam) is the violation this spec closes."

  # ── The target ──
  target:
    one_registry_four_layers:
      seam:      "minimal runnable unit (ring-typed per cockpit.spec)"
      component: "executable code — what runs"
      hook:      "endpoint — where you reach it"
      wire:      "typed pipeline between hooks — how data flows"
    both_sides_mandatory:  # §8.5
      provider: "X provides capability Y at hook Z"   # exists today (partial)
      consumer: "A consumes hook Z / rides wire W"    # MISSING — the §8.5 mandate
    owner: LOOM
      rationale: >
        §17.1 (one owner per artifact). Loom already claims all four layers in
        its banner and already owns hooks as of the 2026-07-20 migration.
        Architect is the architecture BUILDER (specs/repos), not the registry
        authority — confirmed by James 2026-07-20 ("not architect. loom").
    storage: Cortex/JAA, per-system separated
      rationale: §10.1 (one write authority per data type) + James 2026-07-21
        ("data folders need to be cortex, then in each systems folder, all separated").
    reachability: via RAID (the spine, built 2026-07-21) — surfaces do not hold
      hard pointers to the registry; they route.

  # ── What the consumer side buys (why it's worth the blast radius, §0.4/§16.7) ──
  consumer_side_enables:
    - "DORMANT-MODULE QUERY: provider with 0 consumers = the 'isn't wired in'
       list, permanently queryable instead of re-grepped every session.
       Replaces the one-off audit in docs/nexus-orphan-inventory.md."
    - "ORPHANED-CONSUMER DETECTION: consumes a hook that no longer exists —
       caught before it fails (§1.2, §4.2 fix pre-emptively)."
    - "BOTTLENECK/CHOKEPOINT: hook with many consumers, structurally (§7.7)."
    - "BLAST RADIUS = SAFE HOT-SWAP: RAID can reroute a provider only if it
       knows who depends on the old one. Without the consumer side, hot-swap
       is hopeful, not safe (§5.14 — the contract is the dependency)."

  # ── Build order (§3.1 bottom-up, §3.4 raw→lib→API→CLI→UI) ──
  phases:
    P1_consumer_side_on_hook_registry:
      why_first: "Smallest real increment. Loom already owns hooks — no ownership
                  change, no cross-system migration. Proves the consumer model
                  against a live registry before touching the 12-consumer
                  component-registry."
      gate: "`list where consumers=0` returns a real dormant set, verified
             against a manual grep sample (§12.2 — the test must be able to fail)."
    P2_wire_layer:
      action: "WIRE IN the existing orphaned code (nexus-wire.js, verify-wires.js,
               session-wires.js), do not rebuild (§16.5)."
      gate: "a real flow (anomaly.detected → gap-finder → cortex.gap.found)
             registers as a typed wire; an illegal ring jump emits a Gap."
    P3_component_registry_under_loom:
      why_last: "HIGHEST blast radius (12+ consumers). Each consumer scanned
                 before it is touched (§8.4). Not started until P1/P2 prove the model."
      gate: "every scanned consumer resolves; system boots; 217 components intact."
    P4_seam_layer:
      note: "Depends on cockpit.spec's ring grammar. emerge/seams/CORTEX_QUERY_SEAM.js
             is the existing reference implementation."

  # ── §8.2 / §17.3 — recorded objection + alternatives considered ──
  decision_record:
    architect_fork_for_loom:
      request: "James 2026-07-21: fork a copy of architect for loom to visualize
                and edit NEXUS architecture; original architect stays for
                building spec/repo architecture. Marked LOW PRIORITY."
      objection_registered: >
        A fork produces two architect codebases that WILL drift — the same
        pattern already found three times this session (rfr2 vs causal-nexus,
        two lattices, the cortex-v2 scare). §10.3 names divergence a system
        failure; §16.5 prefers deleting over adding; §5.14 says a layer is
        replaceable *provided it satisfies the same contract*.
      alternative_proposed: >
        Loom gets a VIEW (a second consumer of the same architecture contract)
        rather than a forked codebase — identical visualize/edit capability,
        one source of truth, no drift surface. §5.12: the UI is disposable and
        is a consumer of contracts, never their owner.
      status: OPEN — awaiting James's decision. Not built either way (low priority).
      note: "Recorded per §17.3 (every decision records its alternatives and
             rejections) and §8.2 (hostile review before it becomes a spec)."

  # ── Living-document duty (§12.5, §6.3) ──
  maintenance:
    - "This spec is entered in docs/SPEC-REGISTRY.md on creation (§6.3)."
    - "Drift between this spec and the code is tracked here as it's found (§12.5) —
       gaps are data, not failures."
    - "Every phase that lands appends an addendum here with what was built,
       what was scanned, and what was deliberately left (§0.3, §17.3)."

  # ── ADDENDUM 2026-07-21 — §10.3 finding during the §5.4 version scan ──
  spec_layer_duplication_found:
    finding: >
      FOUR specs exist in two places with divergent versions — the same
      competing-truth pattern (§10.3) found this session in rfr2/causal-nexus
      and the two lattices, now at the SPEC layer:
        bridge.spec   docs/=3.0.0  vs  bridge/spec/bridge.spec=3.2.0
        copilot.spec  docs/=2.0.0  vs  copilot/spec/copilot.spec=3.2.0
        cortex.spec   docs/=3.2.0  vs  cortex/spec/cortex.spec=3.3.0
        emerge.spec   docs/=1.0.0  vs  emerge.spec=(no version line)
    root_cause: >
      orchestrator/lib/spec-drift.js reads BOTH — it scans docs/*.spec (line 64)
      but prefers <system>/<system>.spec when present (line 77). So the boot
      drift report can compare a STALE docs/ copy against live code. This is why
      "cortex: spec@3.2.0 ≠ code@3.3.0" persisted in the boot log even after the
      cortex.spec addendum was written — the addendum went to the system-local
      file (correctly), the report read docs/.
    canonical_rule: >
      The SYSTEM-LOCAL spec (<system>/spec/<system>.spec) is canonical —
      spec-drift itself already prefers it, and §17.1 (one owner) says the
      system owns its own spec. docs/ copies of duplicated specs are stale
      mirrors.
    consumer_scan_COMPLETE_2026_07_21: >
      Scanned every reader of docs/*.spec (§8.4). Result: orchestrator/lib/
      spec-drift.js is the ONLY consumer that reads docs/ as a DIRECTORY. All
      other hits are comment references (cortex/*, warp/*) or read specs by
      explicit path (emerge-ide reads its own emerge.spec; idearium/spec-engine
      WRITES generated specs; idearium/repo/watcher watches repo files). Blast
      radius = 1 file, far smaller than feared.
    resolution_APPLIED_2026_07_21: >
      Two real bugs found by reading spec-drift.js and both fixed at root (§5.3):
      (1) PRECEDENCE BACKWARDS — docs/ loaded first with `!specs[name]` meaning a
          system-local spec could never win. Now system-local is canonical (§17.1),
          docs/ is fallback for governance specs with no system copy.
      (2) ROOT PATH WRONG, PRE-EXISTING, SILENT — `path.join(__dirname,'..')` from
          orchestrator/lib/ resolves to orchestrator/, not the repo root, so the
          system-local scan looked for orchestrator/cortex/cortex.spec and matched
          NOTHING, ever, since it was written. docs/ won by default every time.
          Fixed to '..','..'. Also widened the path pattern to include
          <sys>/spec/<sys>.spec (cortex's layout, previously invisible).
      MEASURED RESULT: drift 13 -> 8, synced 31 -> 36. cortex and bridge dropped
      off the drift list entirely — they were FALSE reports from stale mirrors.
      Also closed §5.4 drift created by this session's own spec addendums:
      lib/version.js raid 6.2.0->6.3.0, self-heal 1.0.0->1.1.0, escalation
      1.1.0->1.2.0. Remaining 8 drift entries are genuine and pre-existing.
      Suite 724/0 after.
    stale_docs_copies: >
      docs/{cortex,bridge,copilot,emerge}.spec remain on disk as stale mirrors.
      NOT deleted (§0.3) — now correctly ignored by the only consumer. Deleting
      them is a separate decision; they are no longer authoritative.
    axioms_engaged: [§10.3, §5.4, §17.1, §0.3, §8.4, §5.3]

  # ── ADDENDUM 2026-07-21b — spec layout standard (James correction) ──
  layout_standard:
    rule: "<system>/spec/<system>.spec — this is THE standard, not one option among several."
    verified: >
      13 of 15 systems already conform: architect, bridge, cli, copilot, cortex,
      emerge, eravos, erosmancer, guardian, idearium, ollama, orchestrator, siso.
      Only cockpit and warp remain on the legacy flat <system>/<system>.spec.
    correction_to_previous_addendum: >
      The first fix treated flat and spec/ as equally valid and checked FLAT
      FIRST — backwards from the convention. Corrected: standard path resolves
      first, legacy flat is a deprecated fallback, and any system still on the
      flat path is now REPORTED as layout drift ("legacy layout: 2") rather than
      silently accepted (§13.4 — untracked drift is the failure, tracked drift
      is data).
    remaining_work: "migrate cockpit/cockpit.spec and warp/warp.spec to <sys>/spec/. Not done — moving a spec file requires scanning its readers first (§8.4)."

  # ── ADDENDUM 2026-07-21c — P1 SCAN RESULT: the decision was already made ──
  fix_roadmap_62_already_resolved:
    finding: >
      Scanning hook-registry for P1 (§8.4 before build) found that "One Registry,
      Not Three" was ALREADY DECIDED and partially implemented — documented in
      lib/hook-sync-from-component-registry.js's own header as §FIX-ROADMAP-62
      "One Registry, Not Three — Decision Gate":
        * lib/component-registry.js IS CANONICAL (runtime + CLI already depend on it)
        * HookRegistry keeps its richer schema (friction scoring, schema contracts,
          wire graph) but "stops being an independent source of truth — it becomes
          a thin sync projection of the canonical registry."
      This supersedes the P3 plan in this spec (migrate component-registry under
      loom). The consolidation target is not three registries merged into one
      store; it is ONE canonical registry (components) with hooks as a DERIVED
      PROJECTION. That decision predates this spec and is better than this spec's.
    verified_state:
      - "JAA `hooks` table: EMPTY (0 rows). No data/**/hooks.json exists anywhere."
      - "The 269 hooks in boot logs come from architect's older path, not the canonical registry."
      - "hooks/*.hooks.js (164 static defs) are EXPLICITLY DECLARED DRIFTED and dead — architect/service.js:218 says they are 'no longer read here'. Addendum #2 audit found idearium.hooks.js declared 3 hooks, 1 real componentId, 20+ real undeclared actions."
      - "syncFromComponentRegistry fetches components over HTTP from orchestrator; with no orchestrator running it returns {ok:false, reason:'no components fetched'} — honest failure (§1.2), not a silent no-op."
      - "wire()/unwire()/_bindings ALREADY EXIST in hook-registry — hook→hook bindings with fromId/toId. A wire layer is partially built."
    consumer_side_reconsidered:
      insight: >
        A binding's toId IS a consumer relationship (the 'to' hook consumes what
        'from' produces). The consumer side may be a QUERY over data already
        stored, not a new structure — §16.5 (delete before you add) and §16.7 (an
        abstraction must remove more complexity than it introduces) both argue
        against inventing a parallel consumer table.
      blocked_on: >
        Cannot verify the query against real data: hooks table is empty and the
        sync needs a live orchestrator. Building a consumer layer over an empty
        registry would violate §1.1 (nothing exists until proven against real
        conditions). P1 therefore CANNOT be completed in this sandbox.
    revised_p1: >
      P1 is no longer 'add a consumer side'. It is: (a) make the canonical
      projection actually populate — the hooks table should be non-empty after a
      real boot with orchestrator up; (b) THEN derive consumers from bindings and
      verify against real rows. Step (a) requires a live system, i.e. James's
      machine, not this sandbox.
    axioms_engaged: [§8.4, §1.1, §16.5, §16.7, §10.3, §0.1]

  # ── ADDENDUM 2026-07-24 — §10.3 ROOT CAUSE FOUND AND CLOSED (live boot log) ──
  the_269_vs_230_divergence:
    observed: >
      Live boot: loom reported "hook registry active — 230 hooks (write
      authority)" while architect reported "replayed 269 hooks". Two systems,
      both claiming the hooks, disagreeing — visible on the dashboard.
    root_cause: >
      NOT a code-path subtlety — TWO SEPARATE DATABASES. Loom's HookRegistry was
      built on require('../cortex/memory/jaa-db').jaaDB (the canonical Cortex
      store). Architect's was built on createJAA(DATA_DIR) → architect/data/ —
      its own PRIVATE store, holding 269 stale rows from before the 2026-07-20
      ownership migration, invisible to every other system.
    why_the_migration_missed_it: >
      hooks-migration.spec moved WRITE AUTHORITY to loom and made architect a
      read view — correctly. But it never checked that the read view was reading
      the SAME STORE. Ownership moved; the data source did not follow.
    fix_applied:
      - "architect/service.js: HookRegistry now constructed with the canonical jaa-db. Falls back to the local store with a LOUD warning if unavailable (§1.2), never silently diverges again."
      - "Architect's OWN tables (snr_results, spec_wizard_sessions, topology_maps, its event_log) stay on its local store — this is a read-surface correction, not a storage migration."
      - "UI identity corrected in all 3 shells: architect's description changed from 'Hook registry, SNR gate, blueprint engine, topology scanner' to 'Builds architecture for specs and repositories. SNR gate, blueprint engine.' The Hooks metric moved OFF architect's tile."
      - "LOOM GIVEN ITS OWN TILE — it had none in any shell despite being the registry authority. 'Builds and maps NEXUS. Component, hook, wire, and seam registry + contracts.' Shows Hooks + Components."
      - "loom /health extended to report hooks.total and components.total (§12.6 — the tile needs real fields; a system that owns a registry must be able to report it)."
    verified: "Both registries now resolve to the same store — proven by constructing both against jaa-db and comparing counts. 2 new pinning tests (T-007, T-008). Suite 724/0."
    projection_now_works: >
      Same boot also confirmed FIX-ROADMAP-62's projection finally firing:
      "[architect/hooks-sync] 226 created, 0 updated, 0 unchanged, 0 failed
      (226 canonical components)" — hooks are now genuinely DERIVED from the
      canonical component registry, and persisted (230 rows on disk = 226
      projected + 4 seeded). P1's blocker is gone.
    axioms_engaged: [§10.3, §17.1, §8.4, §1.2, §12.6, §5.3]

  # ── ADDENDUM 2026-07-24 — P1 BUILT (consumer side), derived not declared ──
  p1_implemented:
    scan_findings_that_shaped_it:
      - "hook_bindings: EMPTY. wire()/unwire()/_bindings all exist and work, but wire() is reachable ONLY from loom/server.js:239 (HTTP route). Nothing calls it automatically. Live boot: 230 hooks, 0 bindings."
      - "component.events: the field exists on all 217 components, populated on ZERO. The schema has the slot; nothing fills it."
      - "event_log: 738 real events across 15 distinct sources — REAL producer data."
      - "nexus-bus on(type,fn): subscribers observable at runtime via listenerCount."
    conclusion: >
      Relationships are NOT declared anywhere in this system — but they ARE
      observable. Building a query over hook_bindings would have returned
      '0 consumers' for all 230 hooks: technically correct, practically
      meaningless. So the consumer registry DERIVES the graph from what the
      system actually did (§13.4 — the map must match the territory; a
      hand-maintained wiring list is a second truth layer waiting to diverge).
    built: lib/consumer-registry.js
      producers: "mined from event_log — source → event types emitted, with counts"
      consumers: "read from the live bus — listenerCount per event type"
      unconsumed: "produced types with zero live subscribers — 'emitted into the void'"
      graph: "the bidirectional map §8.5 asks for"
    critical_safety_1_2: >
      consumers() returns NULL, not 0, when the bus is unavailable — 'unknown'
      and 'nobody' are different answers, and conflating them would falsely
      report every hook in the system as dormant. unconsumed() likewise returns
      {observed:false} rather than claiming everything is unconsumed. Two tests
      pin exactly this (T-003, T-004).
    wired: "cortex/boot.js — specifically there, because subscriber counts can only be read from inside a process that holds the bus. Exposed at GET /api/consumers[?view=unconsumed|producers]."
    verified_against_real_data: "15 sources, 27 producer→event edges, 23 distinct event types mined from the live 738-event log."
    honest_limit: >
      Subscriber counts reflect ONE process's bus (cortex). Cross-process
      consumers are not yet visible — a system subscribing in its own process
      is invisible here. Named, not hidden. Closing that needs each process to
      report its subscriptions, which is a further phase.
    axioms_engaged: [§8.5, §8.4, §1.2, §13.4, §16.5, §10.3]
