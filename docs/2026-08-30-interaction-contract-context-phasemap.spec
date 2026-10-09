spec:
  meta:
    name:    2026-08-30-interaction-contract-context-phasemap
    roadmap: 'later — contracts and context — after the loop (declutter 2026-10-09, James: "okay")'
    version: 0.1.0-phasemap
    status: >
      PHASEMAP 2026-08-30. James: "Schemas. Frameworks... hooking UUIDs
      of relevant context and the tools agents can use to receive
      context, like inject it into the chat like the wake word.
      Introspect for iteration maybe hooked into the raids test env for
      the contract?... Map it all first. Always."
      Mapped bottom-up, per axiom §3.1 — every real dependency checked
      before being written, not assumed. Deliberately does NOT duplicate
      RR4_governed_handshake_on_handoff (docs/raid-routing-fidelity-
      phasemap.spec, expanded in the same commit as this file with the
      real schema/input-folder-lifecycle detail from this exact
      conversation) or the audit's #23 (copilot/adaptive-fulfillment.js
      — confirmed real, tested, already IS the introspect/iterate loop
      James described, just under-wired to 1 provider, not a new build).
      Only the genuinely distinct pieces get new phases here.
    uuid:    nexus-2026-0830-interaction-contract-context-phasemap-v1-0000-001

  phases:

    IC1_context_by_uuid_injection:
      status: "OPEN — real foundation confirmed to exist, real gap
        confirmed to exist too, checked directly, not assumed either
        way. intelligence/lattice/associative-lattice.js's real
        getEdge()/updateEdge() already tracks real relationship SHAPES
        (coherence/friction/resonance/entropy) between real nodes
        (systems/users/sessions) — exactly the real 'relevant context'
        source this phase needs, already built, already tested (per
        the uploaded audit's own #21 finding). The real gap: zero real
        callers ANYWHERE inject this into an agent's actual chat —
        confirmed via grep. The real, proven MECHANISM for injection
        already exists too: guardian's own userscripts' real
        injectText() function, already proven this session for the
        wake-word feature (a real string typed into a real agent's
        real input box). This phase is the real, missing bridge between
        two things that both already work: query the real lattice for
        context relevant to a contract's real intention/dir (once
        RR4's schema exists), format it, call injectText() — not a new
        injection mechanism, not a new context-storage mechanism,
        just the wire between the two that doesn't exist yet."
      depends_on: [RR4_governed_handshake_on_handoff]
      does: >
        Gives an agent working a real contract the ability to receive
        real, relevant context (prior related work, known relationship
        shapes) injected directly into its chat — the actual mechanism
        for 'the tools agents can use to receive context.'

    IC2_raid_test_env_hook:
      status: "OPEN — direct cross-reference, not new scope:
        DOD7_tested_using_cos (docs/2026-08-28-definition-of-complete-
        phasemap.spec) already names this EXACT real gap — 'nothing
        today uses a COS compartment as an actual TEST ENVIRONMENT for
        validating a change... before it ships' — confirmed still open,
        not re-scoped here. James's 'introspect for iteration maybe
        hooked into the raid's test env for the contract' is the same
        real ask: a contract's real end-state check (already real, the
        SEAM VERDICT convention) should be verifiable inside a real,
        disposable COS compartment BEFORE the contract is marked PASS,
        not just checked against whatever the live agent happened to
        output. COS's own real SnapshotEngine.restore() (proven this
        session's Versionium work) is the plausible real mechanism a
        'try it, verify it, then promote or roll back' flow would build
        on — named as the likely foundation, not yet built on."
      depends_on: [RR4_governed_handshake_on_handoff]
      does: >
        The real, missing piece DOD7 already named: a genuine test
        environment for verifying a contract's real end-state, not just
        trusting the SEAM VERDICT string an agent reports about itself.

    IC3_intention_taxonomy_per_system:
      status: "OPEN, deliberately sequenced LAST, not first. James: 'Maybe
        each system needs an intention taxonomy.' Real, valid idea —
        but genuinely depends on RR4's own 'intention' field actually
        existing and being populated by real contracts first (IC1/IC2
        too, since both real gaps above would generate real usage data
        an intention taxonomy should be derived FROM, not designed
        blind ahead of any real data existing). Building a taxonomy
        before the field it taxonomizes has any real, observed values
        risks organizing categories nobody's contracts actually use —
        the same category-first-then-guess-at-population risk this
        session's own Component Catalog design (from the uploaded
        audit) already named explicitly for a different field."
      depends_on: [RR4_governed_handshake_on_handoff]
      does: >
        A real, per-system vocabulary for what a contract's real
        intention field means in that system's own domain — built from
        real, observed intention values once RR4 ships, not designed
        speculatively first.

    IC4_idearium_system_template_update:
      status: "OPEN, deliberately sequenced LAST of all. James: 'update
        the system template in idearium with the new architecture
        improvements.' Real, right instinct, wrong order if done now:
        idearium's template should capture a PROVEN shape (RR4's real
        schema, actually built and tested on at least one real system —
        idearium's own existing contract source, which already reports
        outcomes back via reportExternalOutcome, is the natural first
        real proof point) — not describe an aspiration. Building this
        first would stamp every future system with a template
        describing something that doesn't work yet."
      depends_on: [RR4_governed_handshake_on_handoff, IC1_context_by_uuid_injection, IC2_raid_test_env_hook]
      does: >
        Idearium's own docs/idearium-templates.spec-style system
        template updated from the real, proven handshake/context/
        test-env shape — the actual, reusable pattern every future
        system instantiates from, per the uploaded audit's own
        'Template spec' recommendation.

    IC5_full_input_queue_output_qc_lifecycle:
      status: "OPEN — James's own real, complete, sequential
        specification, given verbatim: contract handshake verifies (RR4)
        -> event gate moves the real, relevant files into the RECEIVING
        system's real input/ folder -> submitted to that system's real
        queue -> waits for a real event from the ledger confirming
        receipt/completion. Real, concrete NEW gap confirmed for
        ClearGlass specifically: it has real CLI routes now (this
        session's own recent work) but no real input-folder/queue
        pattern the way idearium/guardian/ollama already do — checked
        directly, ClearGlass genuinely has no directory serving this
        role today. On completion: a NEW real event ('contract.complete'
        or equivalent, not yet named anywhere in the codebase — checked
        via grep, zero real hits) the agent mesh listens for so it
        genuinely KNOWS a contract finished (today it can dispatch via
        RAID but has no real signal for 'done'), which then moves the
        real, relevant files from that system's real OUTPUT folder back
        to RAID, alongside the original contract, for real QC — closing
        the loop RR4 only opens.

        §CRITICAL GAP FOUND 2026-08-30, before this phase is even
        buildable — James's own direct question: 'what tracks the
        contract file through the system, the dag?' Checked directly:
        contract-intake.js's real STATUS enum is exactly {QUEUED,
        RUNNING, PASS, FAIL, BLOCKED} — a real DEPENDENCY graph (can
        contract B start because A passed), NOT a physical LOCATION/
        LIFECYCLE-STAGE tracker. Nothing today can answer 'which real
        folder is this contract's file sitting in right now' — that
        question and 'did this contract pass' are two different things
        current STATUS conflates by omission. Real, additive fix
        needed as part of THIS phase, not a new one: a new `stage`
        field, separate from `status`, tagged by each real event gate
        as the file physically moves — queued -> handshake_verified ->
        input_folder -> system_queue -> processing -> output_folder ->
        qc_pending -> (final status). This is the actual mechanism that
        makes 'stuck, and where' answerable — the real precondition for
        IC5's diagnostic-on-stall behavior (below) to have anything
        concrete to act on."
      depends_on: [RR4_governed_handshake_on_handoff]
      does: >
        The actual, complete, end-to-end real lifecycle every other
        phase in this file is a piece of — not itself new machinery so
        much as the real sequencing/wiring of RR4's handshake, RAID's
        queue (already real), and a genuinely new completion signal.
        Includes the new real `stage` field tracking physical file
        location/lifecycle position, distinct from and additive to the
        existing dependency-graph `status`.

    IC9_diagnostic_stall_detection_and_autofix:
      status: "OPEN — James: 'need the diagnostic system to diagnose and
        fix the issue... We need to get this working autonomously.'
        Real, direct dependency on IC5's new stage field above — 'stuck'
        can only be detected once something tracks WHERE a contract is
        and HOW LONG it's been there. Once real: diagnostic (see IC10
        below for its own real structural problem) polls for contracts
        whose stage hasn't advanced past a real, reasonable threshold,
        raises a real gap (same real mechanism already proven this
        session for Clear Glass spawn failures — checkClearGlassSpawnFailures's
        exact pattern, generalized), and routes it to self-heal (already
        a real RAID contract source, this session's own earlier work) —
        an agent investigates the real stall using the same contract
        machinery, not a special-cased stall-fixing protocol."
      depends_on: [IC5_full_input_queue_output_qc_lifecycle]
      does: >
        The actual autonomy mechanism — a contract stuck at any real
        stage gets a real, automatic diagnosis and a real, automatic
        remediation attempt via self-heal's existing, proven contract
        pathway, not a human noticing and manually intervening.

    IC10_diagnostic_own_real_system_structure:
      status: "OPEN — James, directly: 'I feel like the diagnostic
        system need to be a really system in its own folder. I thought
        that's what it was. And it's a monolith.' Confirmed both parts
        directly, not assumed: service/nexus-diagnostic.js is 2,593
        real lines — genuinely comparable in scale to guardian/server.js's
        own already-identified Phase 116 problem (4,263 lines) — and it
        is NOT structured as its own real system folder the way
        idearium/, guardian/, ollama/ each are; it's one file under
        service/, alongside other systems' entry points, not matching
        their own shape. This was flagged once already this session
        (an earlier turn deferred moving it — 26+ real file references
        to its current path found, needing a careful, individually-
        verified rename, not a rushed one) — not forgotten, genuinely
        real, unaddressed work. Given IC9 above makes diagnostic MORE
        central to real, autonomous operation (not less), this
        restructuring matters more now than when first deferred, not
        less."
      depends_on: []
      does: >
        Gives diagnostic a real diagnostic/ folder (matching every other
        real system's own shape), decomposed using the exact same proven
        technique already used twice this session on copilot/server.js
        and ollama/server.js (route/lib extraction, handle(req,res,ctx)
        -> boolean) — not a new decomposition strategy, the third real
        application of one proven pattern.

    IC11_agent_truth_fragmentation:
      status: "OPEN, finding EXPANDED 2026-08-30 to something more
        severe than first mapped — traced agent-mesh.js's real spawn()
        through send() through driver._navigate() line by line, not
        stopped at the first disconnection found. spawn() (confirmed by
        reading its full, real body) creates only an isolated
        ctxMgr.create() context — ends with windowId: null, no real
        browser window opens. send() lazily navigates on first use via
        this.driver.exec({action:'navigate', ...}) — a real, legitimate
        lazy-open design, not broken by itself. BUT clear-glass/src/
        driver/index.js's real _navigate() (confirmed by reading it
        directly) is a genuinely generic primitive — waits for
        did-finish-load, resolves url/title, ZERO userscript injection
        anywhere in it. Compare to ProviderHost's own real, confirmed
        spawn path (this session's own earlier boot-log evidence:
        'ProviderHost] claude — loaded https://claude.ai/login,
        injecting userscript…') — a DIFFERENT, separate, specialized
        flow that DOES inject the real userscript, which is what
        actually enables a real guardian NCP connection
        ('guardian] NCP connected: provider=claude').

        The real, serious conclusion: agent-mesh.js's own spawn+send
        path can open and navigate a real browser window, but has NO
        real path to injecting the userscript that makes guardian NCP
        connectivity possible. This means TWO SEPARATE, NON-OVERLAPPING
        sets of real browser windows likely exist today — the real,
        working, NCP-connected ones ProviderHost opens at boot
        (autopilot/orchestrator calling it directly), and whatever
        windows agent-mesh.js's own spawn()/send() might open
        independently, which would be real, navigated, but functionally
        disconnected from guardian and therefore from the whole NCP job-
        dispatch system. This is more severe than 'three sources
        disagree about the same agents' — it may be 'two genuinely
        different sets of agents exist, one of which does not actually
        work for real dispatch.'

        Also confirmed same session: guardian's real /providers list and
        TX16's own real listener registry (options/store.js) have ZERO
        real connection to agent-mesh.js either — checked directly, no
        references either direction. And clear_glass_command_index
        (this session's own real co-pilot tool, built to give 'full
        compatibility' with every ClearGlass CLI command) has ZERO real
        callers anywhere in copilot's own code — registered, tested,
        callable, but never actually invoked by any real co-pilot logic,
        the exact 'built but dormant' pattern found repeatedly across
        this whole session's audits."
      depends_on: []
      does: >
        Real reconciliation, in the correct order given the severity
        just found: FIRST confirm (not assume) whether agent-mesh.js's
        spawn()/send() path is ever actually used for real dispatch
        today, or whether ProviderHost's boot-time spawn is the only
        real path currently exercised — this determines whether the fix
        is 'make agent-mesh inject userscripts too' (real, larger work)
        or 'route agent-mesh's own dispatch through ProviderHost's
        already-proven windows instead of opening new, disconnected
        ones' (smaller, reuses what's already proven). THEN: agent-
        mesh.js's state reconciled against guardian's real /providers
        list; co-pilot's switchAgent() confirms a live spawn before
        treating a switch as real; something real actually calls
        clear_glass_command_index so 'full compatibility' is exercised,
        not just possible.

        §CORRECTED 2026-08-30, James directly, resolving the open
        question above: 'The agent mesh needs to be the hub for all
        the agents. It doesn't need to use a window. ClearGlass is cli
        first. Runs tabs in the background.' Confirmed the real
        mechanism this actually points at already exists: bgtab.open/
        bgtab.close (clear-glass/src/main/index.js, real, this
        session's own earlier CLI-command work — GET/POST/DELETE
        /cli/bgtab) already runs real background tabs, no visible
        window required. ui/agents/chatgpt/index.html (James's own
        named example) already does exactly the right pattern: polls
        guardian's real /providers, checks prov.channels[PROVIDER] for
        real tab-live status — never opens its own window, just reads
        real state and acts through guardian. The real fix is now
        concrete, not open-ended: rewire agent-mesh.js's spawn()/send()
        to route through the real bgtab + guardian NCP system (open a
        real background tab via bgtab.open, dispatch via guardian's
        real job system, same as every other real, working agent
        interaction), instead of driver.exec/_navigate's own separate,
        userscript-less window path. Smaller than first feared — not
        'teach agent-mesh to inject userscripts from scratch,' but
        'redirect it to the real, already-proven background-tab +
        guardian mechanism.' A real CLI surface for the mesh itself
        (James: 'maybe a cli command for the agent mesh?') falls out of
        this naturally once agent-mesh's own real actions route through
        the same real dispatch pattern everything else in this session's
        CLI work already uses.

    IC12_universal_gap_and_symmetry_detection:
      status: "OPEN — James: 'Basically a universal gap detection or
        symmetry detection?... inferred variables, expressed variables,
        omitted variables, weight of omitted variables... combined
        metrics to make a multidimensional field.' Real, honest answer
        checked directly, not assumed either way: this does NOT already
        exist as one coherent thing — confirmed by DOD8's own earlier
        finding (docs/2026-08-28-definition-of-complete-phasemap.spec):
        real drift/anomaly detection is genuinely scattered across
        multiple independent real mechanisms — file-integrity.js's
        sigma, orchestrator's sigma-writer/BDAKernel (behavioral
        regime), gap-finder.js (anomaly.detected + sigma.event.* ->
        cortex.gap.found, confirmed real and bus-wired at boot), and
        spec-parser's own narrow testContract comparison. James's real,
        coherent proposal is a genuine SYNTHESIS framework unifying
        these — not a new detector, a new LENS on the ones that exist:
        expressed variables (what a contract/event explicitly states),
        inferred variables (what the system computes/assumes from
        context), omitted variables (what's neither stated nor
        inferrable — the real gap), and a real weight on omission
        (how much a given omission actually matters, not treating every
        gap as equally severe). This is real, coherent, and honestly
        substantial new conceptual work, not a small wire — sequenced
        deliberately after IC5's stage-tracking and IC9's stall
        detection exist, since 'omitted variable' needs real, structured
        contract data (RR4's schema) to have anything concrete to check
        for omission against."
      depends_on: [RR4_governed_handshake_on_handoff, IC5_full_input_queue_output_qc_lifecycle]
      does: >
        A real, unifying framework over gap-finder/sigma/BDA's already-
        real, already-scattered detectors — not a replacement for any
        of them, a genuine synthesis lens (expressed/inferred/omitted,
        weighted) that could let 'is this contract complete/coherent'
        be answered as one real, multidimensional check instead of
        several independent, uncoordinated ones.

    IC13_agent_mesh_chat_index:
      status: "OPEN — James's own real, coherent, complete spec, given
        verbatim: per-agent index of tab id + chat-log/ledger UUID + URL
        + full timestamps + contract id + artifact references (by name
        or UUID) + the full text log itself, real, queryable, in cortex,
        shaped like a directory (agent/url-of-the-chat/chatlog-or-ledger
        +artifacts). Checked directly, not assumed: query_recall (lib/
        agent-tools/tools/query/query-recall.js) and move-data.js's real
        'recall' action already exist as the retrieval mechanism this
        index would feed; real artifact references already exist in
        guardian's own download-capture path ('armed for claude ->
        guardian :7820/api/intake'). Nothing new needs inventing for
        RETRIEVAL — this phase is about the real STORAGE SHAPE existing
        on the write side, which does not exist yet: nothing today
        writes a real, structured per-chat record combining tab id +
        URL + timestamps + contract id + artifact UUIDs + full text into
        one real, cortex-persisted unit.

        Direct cross-reference, not duplicated scope: 'cortex needs
        major structuring, data folder for each system' is
        SBP5_cortex_data_organization_scoping (docs/2026-08-28-self-
        building-pipeline-phasemap.spec), already real, already tracked,
        deliberately left as a scoping-only phase because 'organized' is
        too broad to build blind. This phase (IC13) is the natural first
        CONCRETE proof case for SBP5's own open questions — building
        the real, per-agent chat index correctly (one system's real,
        well-organized data shape) answers SBP5's abstract 'how should
        data be organized' question through actual practice, rather
        than needing to resolve it in the abstract first.

        Real, honest downstream value, not oversold: once this real
        index exists, intelligence's own real pattern-scan (already
        confirmed live and crystallizing real patterns this session's
        own boot logs) has real, structured chat history to scan instead
        of only scattered event_log entries — genuinely enabling the
        'learns, optimizes, fixes, builds' loop James describes, but as
        a real DOWNSTREAM CONSEQUENCE of this phase existing, not
        something this phase itself needs to build."
      depends_on: [IC11_agent_truth_fragmentation]
      does: >
        A real, per-agent, per-chat structured record in cortex —
        tab id, chat/ledger UUID, URL, full timestamps, contract id,
        artifact UUIDs, full text — the actual missing storage shape
        underneath query_recall's already-real retrieval and
        intelligence's already-real pattern-scanning. Depends on IC11
        because a chat index keyed on 'which tab/agent' only means
        something once agent-mesh's own real, current tab-tracking is
        trustworthy (per IC11's own real finding).

    IC6_multi_source_code_request_intake:
      status: "OPEN — James: 'the system automating code requests from
        co-pilot, idearium or from an uploaded spec.' Real cross-
        reference, not new from zero: co-pilot's real /build command
        (this session's own earlier work) and idearium's real contract-
        source wiring (also this session) already cover two of the
        three named sources. 'An uploaded spec' triggering a real
        contract is the one genuinely new source — a real file-upload
        (or a real spec already on disk) becoming a real, submitted
        contract automatically, not requiring a human to manually call
        submitContract() for it."
      depends_on: [IC5_full_input_queue_output_qc_lifecycle]
      does: >
        The third real intake source, completing the set already
        two-thirds built.

    IC7_drift_and_comparison_tracking_in_the_pipeline:
      status: "OPEN — direct cross-reference to DOD8_contract_
        conditions_comparison_and_drift_engines (docs/2026-08-28-
        definition-of-complete-phasemap.spec), NOT new scope invented
        here. James: 'Tracks drift with the bda engine, and comparison
        engine.' Confirmed real, not aspirational: cortex/core/raid/
        index.js already instantiates a real BDAKernel (behavioral-
        regime tracking) as part of its own decision logic — exactly
        the real 'bda engine' James is naming, already wired into RAID,
        just not yet wired into THIS specific contract lifecycle's own
        completion/QC step. The 'comparison engine' is DOD8's own
        already-named partial piece (spec-parser's real testContract,
        not yet general-purpose). This phase is: route IC5's real
        completion/QC step through both existing real mechanisms,
        rather than build either fresh."
      depends_on: [IC5_full_input_queue_output_qc_lifecycle]
      does: >
        Makes IC5's real QC step genuinely check for drift (BDA,
        already real) and genuinely compare contract-vs-output (the
        comparison engine, already partially real), not just check the
        SEAM VERDICT string in isolation.

    IC8_callto_event_driven_cli_injection:
      status: "OPEN — James: 'commands being event driven with a
        callto() for contract files to be injected into the clis.' Real,
        concrete, and genuinely buildable on top of what already exists:
        the real calltos system (options.registerCallto/
        findCalltosForUrl, this session's own real CLI routes for it —
        GET /cli/calltos/for-url, DELETE /cli/calltos/:id) already does
        real event-matched routing. This phase: a contract file's real
        arrival (IC5's input-folder step) becomes a real trigger a
        pre-registered callto() binding can match against, firing a
        real CLI command automatically — reusing the real, existing
        calltos matching mechanism, not inventing a second one."
      depends_on: [IC5_full_input_queue_output_qc_lifecycle]
      does: >
        Lets a contract's real arrival at a system automatically fire a
        real, pre-registered CLI command via the existing callto()
        mechanism, instead of needing something to explicitly poll or
        hand-wire a call for every new contract type.

  cross_referenced_already_tracked:
    note: >
      RR4_governed_handshake_on_handoff (docs/raid-routing-fidelity-
      phasemap.spec) — expanded with the real schema/input-folder-
      lifecycle detail in the same commit as this file, not duplicated
      here. DOD7_tested_using_cos (docs/2026-08-28-definition-of-
      complete-phasemap.spec) — cross-referenced by IC2, not duplicated.
      The uploaded audit's #21 (Associative Lattice) and #23 (adaptive-
      fulfillment, copilot's real introspect/iterate loop) — both
      confirmed real and already built; #23 specifically is NOT
      re-opened here, only its existing under-wiring (1 provider,
      not N) remains the audit's own separately-tracked gap.
