spec:
  meta:
    name:    2026-08-28-self-building-pipeline
    roadmap: folded into nexus-self-build-pipeline — an earlier map of the same pipeline (declutter 2026-10-09, James: "okay")
    version: 0.1.0-phasemap
    status: >
      PHASEMAP 2026-08-28. James: "we need this system building itself...
      each template in loom and idearium have a relevant compartment with
      all of the reusable components to use as foundation, then saved as
      a repository, spec as metadata, chunked, contracted, sent to raid,
      then routed to the relevant system and/or agent." Mapped bottom-up
      per axiom §3.1 — every phase below checked against real code before
      being written, not assumed. Where a piece of this vision is ALREADY
      real and built, that is stated plainly and cross-referenced, not
      re-described as new work.
    uuid:    nexus-2026-0828-self-building-pipeline-phasemap-v1-0000-001
    intent: >
      Map the full loom/idearium -> compartment -> repository -> spec ->
      chunk -> contract -> RAID -> agent pipeline. Real pieces confirmed
      already built this session or earlier: chunking (lib/seam/spec-
      parser.js, idearium's own chunker), contracting (cortex/core/raid/
      contract-intake.js's submitContract/submitIdeariumChunk), RAID
      queueing with a real dependency graph (dependsOn/onFail, this
      session), Versionium (all 4 build-order steps). Real pieces
      confirmed to ALREADY exist but NOT yet connected into this pipeline:
      COS's blueprint/archetype system (cos/blueprint/index.js's real
      launchBlueprint(host, blueprint, instanceName) — the actual
      "template with reusable components as foundation" mechanism),
      cortex/core/raid/routing-ir.js's buildRoutingIR({preferredAgent})
      (real agent-routing already supports a preferred/specified agent —
      contract-intake.js currently bypasses it, using contract.forAgent
      as a raw string instead of routing through this).

  phases:

    SBP1_reconcile_repo_layer_vs_cos_compartment:
      status: "✓ DONE 2026-08-28 — read idearium/repo/index.js's real
        readFile/writeFile/deleteFile directly: all three are pure pass-
        throughs to idearium's own spec-engine (loadSpec/completeChunk/
        addChunk). RepoLayer owns ZERO real file content of its own — a
        thin lineage/naming/fork METADATA index (uuid, parent, specUuid
        pointer, rootHash identity) sitting on top of spec-engine's real
        chunk storage. It never touches COS's compartment/SnapshotEngine
        at all. Same class of finding as the .nex-vs-COS check earlier
        this session: NOT a duplicate, zero overlap — different data
        entirely, not different scope on the same data. No reconciliation
        needed. Real, small, additive extension point for SBP2 to use:
        a repo record could gain a real compartmentId field alongside its
        existing specUuid, letting one repo point at both its idearium
        spec AND its COS compartment — composition, not a merge."
      depends_on: []
      does: >
        Cleared the way for SBP2 — confirmed there is no wrong foundation
        to accidentally build on here.

    SBP7_agent_suite_lives_in_clearglass:
      status: "✓ DONE 2026-08-28 — James: 'add Agent suite and mesh in
        guardian or clearglass? Agent suite in clearglass?' Real evidence
        checked before answering, not guessed: clear-glass/src/mesh/
        agent-mesh.js already IS the real agent mesh (6 real agents, real
        DOM selectors, real tab spawning) — already living in ClearGlass,
        not Guardian. This session's own real Accounts panel (options/
        store.js) and the real persistent listener registry (TX16) both
        already live in ClearGlass too. Guardian is structurally an NCP
        relay — routes jobs to browser tabs over SSE, owns no per-agent
        identity, no tabs, no DOM, and never has. Placing the Agent Suite
        in ClearGlass isn't a new architectural decision — it's
        recognizing where the real weight already sits. Decision made;
        SBP7a-f below are the real, itemized build sub-phases."
      depends_on: []
      does: >
        Settles the placement question; everything below builds inside
        ClearGlass, not as a competing location.

    SBP7_DESIGN_PRINCIPLE_automation_over_code:
      status: "✓ DONE 2026-08-28 — James: 'Nexus has the power to use
        automation for most things... if we made it powerful enough to
        not need more code. Frameworks for co-pilot, step by step
        directions. Pipeline automation and workflow for everything.'
        Real, not aspirational: this session already built the actual
        mechanism this describes — cortex/core/raid/contract-intake.js's
        dependency graph (dependsOn/onFail) plus lib/compartment-engine.js
        ARE a real workflow engine (nodes, edges, retry/fallback policy,
        checkpointed state via COS's SnapshotEngine). Applying this lens
        to SBP7a-f below: prefer expressing a hat's behavior, a tool's
        pipeline, or a listener's routing as a real RAID contract graph
        (data — a YAML/JSON definition submitted via submitContract) over
        writing new bespoke JS per feature, wherever the existing
        contract/compartment machinery already provides the mechanism.
        Named honestly where it does NOT fit: agent-mesh's real DOM
        selectors and tab-spawning logic are genuinely code, not
        pipeline-expressible — this principle guides SBP7b/7c/7d
        (hats, models, tools — all naturally data-driven), not SBP7a/7e/7f
        (mesh/listeners/userscripts — genuinely need real code)."
      depends_on: []
      does: >
        A real, checked design lens for the sub-phases below, not a
        blanket rule — grounded in infrastructure that already exists
        and works, not a hope that it will.

    SBP8_agent_mesh_consolidation:
      status: "✓ DONE — spawn() now attaches real AGENT_CONSTRAINTS
        (lib/agent-router.js's real per-agent token budgets) to every
        spawned agent's state.constraints, alongside the account-vault
        restore that already existed. Verified end-to-end: chatgpt gets
        its real {maxTokens:900,chunk:true}, gemini gets its own,
        different real {maxTokens:1000000,...}, confirmed as genuinely
        distinct objects, not a shared reference."
      depends_on: []
      does: >
        Makes the mesh genuinely NEXUS-aware instead of just a tab
        spawner — the literal 'full control of agents' ask.

    SBP9_hat_forge_real_hats:
      status: "✓ DONE — real correction to this phase's original assessment
        (stale, written before a parallel session's own real work merged
        in): lib/hat-forge.js is NOT empty. Confirmed directly by calling
        the real hf.list() this session: 4 real, already-forged, well-
        crafted hats exist — the_auditor (adversarial/evidence-checking),
        the_diagnostician (symptom-to-mechanism, no fix before root cause),
        the_builder (bottom-up, read consumers before editing — this
        codebase's own axiom language, verbatim), the_librarian (answers
        from what the system already knows, baseAgent 'ollama'). Checked
        directly, corrected before it became a false claim: the_librarian
        does NOT actually set HAT_SCHEMA's real model field (confirmed via
        hf.byName — model is unset), so SBP10 below remains genuinely
        open, not quietly closed by an assumption. Caught before
        compounding the mistake: this session almost forged 4 REDUNDANT
        hats (erosmancer/hostile_truth/delta_risk/nexus_base) covering
        the same real roles under different names — verified via a real
        forge() call, confirmed the duplication via hf.list(), revoked
        all 4 before they could persist as duplicate roles."
      depends_on: []
      does: >
        Real hats already exist and are usable today — this phase was
        never actually blocked, it was mis-assessed against stale
        information from before a parallel session's own real work
        landed. Same class of risk as the lifeline.js regression found
        this session, in the opposite direction: nearly duplicating real
        work instead of losing it.

    SBP10_per_hat_model_assignment:
      status: "✓ DONE — real HAT_SCHEMA field existed (added
        §PERSONALITY-MODEL 2026-08-23), and lib/hat-seed-ollama-
        personalities.js turned out to be real, mature, complete, unused
        machinery for exactly this — 16 real, distinct, model-backed hats
        generated from ollama/abliterated-catalog.js (one per real local
        model, persona templated by category+tier, not 16 hand-written
        duplicates), idempotent forging via the same bySeedKey() pattern
        lib/hat-seed.js's 4 operational hats already use. Called it for
        real this session: 16 forged, 0 failed, confirmed via hf.list()
        — 20 total real hats now (4 operational + 16 personality), all
        16 personality hats confirmed to have a real, correct .model
        value set (not just the schema field existing unused)."
      depends_on: [SBP9_hat_forge_real_hats, SBP3_wire_contract_intake_through_routing_ir]
      does: >
        The literal 'models' item James named, genuinely closed — 16
        real, dispatchable, model-specific hats now exist where zero did
        an hour earlier this same session.

    SBP11_agent_tools_registry_awareness:
      status: "✓ DONE — corrected finding, same pattern as SBP9/SBP10:
        toolScope already exists in HAT_SCHEMA, already validated at
        forge time (real tool-name checking against lib/agent-tools'
        real registry, hat-forge.js's own _toolExists), AND already
        genuinely enforced at dispatch — confirmed by reading copilot/
        tool-runtime.js directly: runToolLoop's real allowedTools
        parameter actually filters which tools a scoped hat can call,
        not just receives the list unused. A hat CAN already declare
        which real tools it needs and dispatch respects that scoping."
      depends_on: [SBP9_hat_forge_real_hats]
      does: >
        Confirms this was never actually blocked — real enforcement
        already existed, just needed checking rather than assuming from
        this phase's own earlier, stale text.

    SBP12_listener_and_userscript_suite_view:
      status: "✓ DONE — real GET /agent-suite endpoint composes hats
        (hat-forge's real list(), now 20 real hats after SBP10), agents
        (agent-mesh's real listAgents()), listeners (TX16's real
        listListeners()), and accounts (options.listAccounts()) into one
        real, coherent response. §BUGFIX found while building this: a
        genuine route collision existed — this file already had TWO
        separate real 'GET /listeners' routes (the older UrlListener's
        and TX16's own), the older one registered first and silently
        shadowing TX16's the whole time. Renamed the older to
        /url-listeners so both real, distinct features are actually
        reachable."
      depends_on: [SBP9_hat_forge_real_hats]
      does: >
        The 'listeners, userscripts' items James named — completing the
        full real inventory (mesh, hats, models, tools, listeners,
        userscripts, accounts) in one coherent, real view. Verified
        end-to-end against a fully-started real server: real hats,
        a real registered listener, and a real account all present and
        correct in one live HTTP response.

    SBP2_loom_idearium_template_to_cos_blueprint_bridge:
      status: "OPEN, depends on SBP1's answer. Real, confirmed gap: COS's
        launchBlueprint(host, blueprint, instanceName) already IS the
        real 'compartment with reusable components as foundation'
        mechanism James described — cos/blueprint/registry.js's
        getBuiltInBlueprint confirms real, pre-built blueprints already
        exist (matching cos-design-v1.7.0.md's own claim of 11 real
        blueprints). What's missing: a real bridge from loom's own
        component/wire maps and idearium's own specs INTO a real COS
        blueprint definition — today these are three separate, unconnected
        real systems (loom maps components, idearium specs ideas, COS
        launches blueprints), each correct on its own, none producing the
        others' input format."
      depends_on: [SBP1_reconcile_repo_layer_vs_cos_compartment]
      does: >
        The actual 'template -> compartment, reusable components as
        foundation' step James described — using COS's real, already-
        proven blueprint launcher, not a new one.

    SBP3_wire_contract_intake_through_routing_ir:
      status: "OPEN — real, small, precisely-scoped gap, confirmed by
        reading both files directly. cortex/core/raid/routing-ir.js's
        buildRoutingIR({intent, prompt, context, preferredAgent}) is a
        real, mature, already-built agent-routing decision engine
        (confirmed: honest about its own rule-based-vs-competition split,
        confirmed about which fitness terms are still stubbed) that
        ALREADY supports a specified/preferred agent. cortex/core/raid/
        contract-intake.js's processNext() currently never calls it —
        it trusts contract.forAgent as a raw string with no real routing
        decision behind it at all. James: 'Agent would have to be
        specified in the contract. Agent router or IR using raid' — this
        is exactly that, and the real mechanism to route through already
        exists, unused."
      depends_on: []
      does: >
        Makes 'agent specified in the contract' a REAL routing decision
        (with RAID's real fitness scoring, health filtering, and honest
        confidence reporting) instead of a raw string nothing validates
        or reasons about. Independent of SBP1/SBP2 — can be built in
        parallel, touches a different real file.

    SBP4_wire_loom_and_selfheal_as_real_contract_sources:
      status: "OPEN — cortex/core/raid/contract-intake.js's own header
        already names this honestly: 'Loom, idearium, co-pilot, and
        self-heal each producing their own real contracts and calling
        submitContract() is the honestly-named next step, not claimed
        done here.' Two real sources are wired today (lib/seam/spec-
        parser.js, idearium's chunk system) out of the four James
        originally named (loom, idearium, co-pilot, self-heal). Not
        re-scoped here — this phase is simply the tracked commitment to
        close that already-named gap, cross-referenced not duplicated."
      depends_on: []
      does: >
        Completes 'all the contracts for each system' — RAID already
        handles whatever contracts arrive; this is about more real
        sources actually producing them.

    SBP5_cortex_data_organization_scoping:
      status: "OPEN — James: 'Cortex data organized.' Deliberately left
        as a SCOPING phase, not a build phase — 'organized' is too broad
        to act on blind. Real, concrete sub-questions this phase should
        answer before any code changes: (a) cortex/data/'s real JAA
        tables — is there a real, current inventory of what exists and
        what each table's actual schema is, anywhere, or does one need
        building fresh; (b) is the ask about physical directory/file
        organization (cortex/data/snapshots was already found this
        session to be 585MB, real, uncleaned), about JAA table naming
        consistency, or about a real per-system data ownership map (which
        system may write to which table) — these are three different,
        real projects wearing one label, and building the wrong one
        wastes real work."
      depends_on: []
      does: >
        Names the real ambiguity honestly instead of guessing at scope
        and building the wrong thing confidently.

    SBP6_system_schema_inventory:
      status: "OPEN — James: 'All the relevant systems schemas.' Real,
        existing precedent to extend, not invent fresh: ET1_event_
        taxonomy_pattern (docs/2026-08-27-event-taxonomy-and-brainstorm-
        phasemap.spec, already built — lib/event-taxonomy-pattern.js's
        real shape validator) covers EVENT schemas specifically. This
        phase is broader — real DATA/contract schemas per system (what
        shape does guardian's job queue row look like, what shape does a
        RAID contract look like, what shape does a COS compartment look
        like) — genuinely different from event taxonomy, not the same
        work under a new name. ET2_guardian_event_taxonomy /
        ET3_clearglass_event_taxonomy / ET4_orchestrator_autopilot_event_
        taxonomy remain the event-specific work; this phase is the data-
        shape-specific sibling, real and separate."
      depends_on: []
      does: >
        The literal foundation every other phase in this map already
        silently assumes (a 'contract shape', a 'compartment shape') —
        making those assumptions real and documented instead of implicit.

  cross_referenced_already_tracked:
    note: >
      Per axiom discipline (the same idea gets one phase, not a fresh one
      every time it resurfaces): Versionium (all 4 build-order steps,
      docs/versionium.spec) is DONE, not re-opened here. RAID's real
      dependency graph (dependsOn/onFail) is DONE, not re-opened here.
      lib/seam/spec-parser.js's agent-aware chunking (BR5) is DONE.
      TX14_plugin_system_v1_build, TX16_persistent_listener_registry (TX16
      first slice DONE, remainder still open), BR9_theme_consolidation_
      to_nexus_dark all remain open exactly as previously tracked, not
      duplicated by anything in this map.
