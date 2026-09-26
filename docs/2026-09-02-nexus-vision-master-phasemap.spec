spec:
  meta:
    name:        2026-09-02-nexus-vision-master-phasemap
    version:     1.0.0
    foundation:  nexus-system-foundation@1.1.0
    status:      mapped-not-built
    uuid:        nexus-phasemap-v1-0000-2026-0902-jamesbrooks-003
    purpose: >
      James: "some ideas to map to phasemaps. do not build." A large,
      sustained vision dump covering tool/event awareness, build
      contracts, the full idearium spec pipeline, agent-mesh UI,
      clear-glass macros/CLI, versionium's deeper tracking role, a
      living-model framework for every system, guardian's agent-folder
      refactor, and Nexus's own end-state as a system that can build
      itself using any agent. Every real item below is extracted from
      that dump, checked against the current codebase where a check was
      possible (§8.4), and organized into tracks with real dependencies.
      NOTHING in this file is built — every phase is status: OPEN unless
      explicitly marked done_previously with a real commit reference.

  two_direct_questions_answered_first:
    loom_map_confusion: >
      James: "there isn't 41 systems... loom was mapped to over 1500
      components. had a map, im confused." Checked directly, live,
      against loom's own real graph — confirmed real, not a guess: the
      41-"systems" count comes from lib/loom-map.js's resolveSystem(),
      which derives a system name from a component id's FIRST dot-
      segment with zero validation against the real system list
      (orchestrator.config.json's ports, autopilot.js's supervised
      list, lib/version.js's tracked services). Running it live: the
      top "systems" by component count are tests (257), lib (234), spec
      (152), cos (85), cg (81) — folder/category prefixes and
      abbreviations, not real systems. cos and cg are the SAME real
      systems as their fuller names, double-counted under a second
      label. Real system count is ~15-17 (cortex, guardian,
      orchestrator, bridge, idearium, architect, eravos, intelligence,
      ollama-bridge, copilot, emerge, loom, clear-glass, diagnostic,
      autopilot, versionium), not 41. James's instinct was correct;
      mapped as VM1 below, not fixed here.
    duplicate_boot_log_lines: >
      The "loom map synced" line appearing twice in James's pasted boot
      log, once as [cortex:cortex/boot.js] and once as [intelligence:
      intelligence/server.js], is a REAL, ALREADY-FIXED bug (§BUGFIX
      2026-08-27, intelligence/index.js's own header) — checked directly:
      cortex/boot.js's real call site already passes
      scans:['failures','reuse'], correctly excluding loomMap from its
      own process. The pasted log is from a run that predates this fix
      reaching that machine, not a live regression.

  phases:

    T1_tool_listing_command:
      status: OPEN
      does: >
        "Needs to have a tool/command to list tools for the agent...
        awareness maps to the living model for each system." A real
        command/tool an agent can call to enumerate what's available to
        IT specifically (not the full 63-tool registry) — ties directly
        to AM1's already-real per-hat toolScope (lib/hat-forge.js) and
        this session's ACK-injection fix, which already narrows an
        agent's tools to its hat's scope. The missing piece: a callable
        "list my tools" command/keyword the agent itself can invoke
        mid-conversation, not just a header pre-computed at dispatch
        time.
      depends_on: []

    T2_event_taxonomy_per_system:
      status: OPEN — real, partial precedent exists
      does: >
        "Can we do the event taxonomy real quick for each system." Real
        precedent already exists and is real, not proposed: guardian/
        event-taxonomy.js, orchestrator/event-taxonomy.js, versionium/
        event-taxonomy.js (built this session, VS1), all conforming to
        lib/event-taxonomy-pattern.js's ET1 shape. Genuinely missing,
        confirmed by directory check: ollama/, copilot/, cli.js, clear-
        glass/, and cortex/ itself have no event-taxonomy.js of their
        own yet. This phase is "one per remaining real system,"
        following ET1 exactly, cataloguing REAL emitted events (grepped
        from each system's own bus.emit/jaaDB.insert('event_log',...)
        calls), not invented ones.
      depends_on: []

    T3_tool_to_event_mapping:
      status: OPEN
      does: >
        "Then we can map each tool or command to an event also." Once
        T1 and T2 exist, each of the 63 real tools in lib/agent-tools'
        registry gets a real, documented event pair (invoked/completed/
        failed) — a genuinely new cross-reference layer, not built by
        either T1 or T2 alone.
      depends_on: [T1_tool_listing_command, T2_event_taxonomy_per_system]

    T4_userscript_event_types:
      status: OPEN
      does: >
        "I want more event types for the userscripts... chat_input for
        my messages, then chat_response for you. also chat_download and
        chat_artifact... chat_wake, chat_block_type, chat_block_id...
        maybe the same for co-pilot: co_pilot_input, co_pilot_response...
        so we can see all of this in the autopilot console." Real,
        concrete event names named directly by James — this phase adds
        them to guardian's own real event-taxonomy.js and wires the
        actual bus.emit() calls into the four provider userscripts (all
        four already share the exact same handleJob shape per this
        session's ACK-injection fix — same file, same fix pattern
        applies here too) and copilot/lifeline.js's route().
      depends_on: [T2_event_taxonomy_per_system]

    T5_raid_full_cli:
      status: OPEN
      does: >
        "Raid a full cli." cortex/core/raid/ has real submitContract/
        acknowledge/listQueue/processNext (contract-intake.js) but no
        CLI surface of its own — a real gap, not a stretch goal, given
        how much of the agent-mesh vision routes through RAID contracts.

    B1_full_build_contract_schema:
      status: BUILT 2026-09-03 (commit cc88eeb) — schema + synthesizeContract(), verified
      built_2026_09_03: >
        cortex/core/raid/contract-intake.js's BUILD_CONTRACT_SCHEMA +
        synthesizeContract() — every field from James's real_field_schema
        below is now real and validated: uuid (assigned), forAgent
        (required), intent (validated against intent-classifier.js's
        real VALID_VERBS — a new, small, additive export added for
        this), system, endState (required), conditions (structured
        {pre,post}), context, warpPrimitives (validated against
        warp/core's real, exact 5 exports), axioms (validated live
        against docs/AXIOMS-v3.1.md's real §N.N section headers — 100
        real refs), tools (defaults from forAgent's real hat-forge
        toolScope when omitted), compartmentUuid, fileDirectory,
        fileName. submitBuildPhaseContract() (AM1) not replaced —
        synthesizeContract() composes with the same real submitContract()
        both call. 13 real tests (tests/modules/test-b1-
        synthesize-contract.js), including every real verb accepted, a
        fake verb/warpPrimitive/axiom correctly refused, and full
        end-to-end persistence verified by reading the real queue row
        back. §REAL NAMING NOTE — the persisted field is `intention`
        (RAID's own pre-existing convention), not `intent`; the
        caller-facing API param stays `intent` (matches this ask's own
        language), mapped internally — found by a real test failure,
        fixed to match reality rather than inventing a second field.
      does: >
        "Need build contracts primitives for each agent, intent, hat...
        the contract has the uuid for the contract, intended agent,
        intent, system, conditions, the compartment uuid for the
        repository and raid engine, and the tools that can give
        context." AM1 (already real, this session) built
        submitBuildPhaseContract({name, does, forAgent, depends_on}) —
        real but narrower than this ask. Missing real fields: intent
        (distinct from forAgent — AM1's own intent-contract gate already
        checks {agent, intent} pairs, but submitBuildPhaseContract
        hardcodes intention:'build', never taking a real intent param),
        conditions (real, structured pre/post conditions — not present
        anywhere in contract-intake.js today), and an explicit
        compartmentUuid field (compartment.id exists at RUNTIME inside
        processNext(), but isn't accepted as a real INPUT the way this
        ask implies — "the compartment uuid FOR the repository," i.e.
        targeting a specific, pre-existing compartment, not always
        spawning a fresh one).
      real_field_schema_2026_09_02: >
        James, follow-up, gave the complete real field list: "end-state,
        conditions, intent, context, warp primitives, axioms, relevant
        agent tools for the request, compartment uuid, file directory,
        file name. need to synthesize contracts for each request."
        Checked against real precedent rather than inventing new
        vocabulary: "warp primitives" and "axioms" are NOT metaphorical
        here — warp/spec/warp.spec already defines exactly 5 real
        primitives (Event, Gate, Stream, StreamLog, Axiom) that
        orchestrator's own real warp-spine (confirmed live in every boot
        log — "[warp-spine] attached to orchestrator bus — 4 axioms,
        StreamLog mapping active") already runs. A real build contract
        under this schema would carry:
          uuid, forAgent, intent (a real verb from intent-classifier's
          VERB_PATTERNS, checked by AM1's own gate), system,
          endState (the real target condition, not just a task
          description), conditions (structured pre/post, genuinely
          missing today), context (real, not the old force-fed blob
          this session's ACK-injection fix removed — pulled via the
          contract's own toolScope, on demand), warpPrimitives (which
          of the 5 real WARP primitives this contract's work is
          expected to touch or produce — Event/Gate/Stream/StreamLog/
          Axiom), axioms (which of docs/AXIOMS-v3.1.md's real numbered
          axioms constrain this specific contract — not all of them
          blindly, the relevant subset), tools (the real, hat-scoped
          toolScope AM1 already computes), compartmentUuid (a real,
          specific target, not always freshly spawned), and
          fileDirectory/fileName (the real, specific target location
          the contract's work lands in). "Synthesize" (James's own
          word) implies an automated builder for this schema, not just
          the schema itself — a real, second piece of scope on top of
          the schema definition.
      intent_taxonomy_2026_09_02: >
        James, further follow-up: real, named intent taxonomy —
        "intention: repair, attack, diagnose, build, co-pilot, anything
        more. these are also hats." Checked against intent-classifier's
        real VERB_PATTERNS list (analyze, build, delete, diagnose,
        dispatch, explain, forge, heal, overwrite, query, recall,
        rollback, snapshot, validate, write): build and diagnose already
        exist as real verbs. repair maps most naturally onto the
        existing heal verb (self-heal's own real domain) rather than a
        new one — a real naming decision, not assumed here. attack is
        genuinely new — no existing verb covers adversarial/red-team
        intent (copilot's own real adversarial-probing module exists,
        confirmed live in boot logs — "[copilot/adversarial] started —
        probing every 60s" — but has no corresponding intent-classifier
        verb yet). co-pilot as an intent (not an agent) is a real
        category shift worth flagging: every other item in this list is
        an ACTION a request wants done; "co-pilot" reads as a REQUEST TO
        USE a specific agent, which is what forAgent already covers —
        real, open question whether this means "the intent is to consult
        co-pilot specifically" (a genuine 16th verb) or is shorthand for
        something else. "These are also hats" restates AM1's already-
        real design (a hat's allowedIntents field IS the same list) —
        confirms the schema, doesn't add new scope by itself.
      agent_synthesized_contracts_2026_09_02: >
        James: "we can have one of the agents synthesize a contract,
        feed it the primitives for the contract and inject the context.
        gemini, chatgpt, or ollama." Real, substantial design shift from
        "synthesize contracts programmatically" (the real_field_schema
        note above) to "delegate synthesis TO an agent" — the agent
        receives the real primitive list (end-state/conditions/intent/
        context/warp-primitives/axioms/tools/compartment-uuid/file-
        location) as its OWN prompt, and produces the actual contract
        content itself, rather than a fixed function assembling it.
        Real, direct precedent found in automation_1.zip (2026-09-02
        upload): intent-router.js's own real pipeline — "raw input ->
        IntentParser.parse() -> IntentScorer.score() -> IntentRouter.
        route() -> AgentFactory.execute()" — is structurally the same
        idea (a request becomes a structured intent object BEFORE being
        handed to an agent), though that pipeline computes the structure
        itself rather than having an agent synthesize it. This ask is a
        genuine escalation beyond that precedent: the AGENT does the
        synthesis step, not just the execution step.
      depends_on: []

    B2_chunk_contract_chaining:
      status: OPEN — real design decision
      does: >
        "Maybe each chunk contract generates the next, like event gates,
        once tested and verified, generates the next chunk contract for
        the compartment end-state/spec." Real precedent: idearium's
        already-real chunk system (submitIdeariumChunk, spec-engine's
        buildChunkPrompt) processes ONE chunk at a time but doesn't
        auto-generate the NEXT chunk's contract on a real PASS verdict —
        that handoff is currently a separate, manual step. This phase
        is real event-gate wiring: RAID's own real event taxonomy
        (RAID_CONTRACT_PASSED) triggering the next chunk's submission
        automatically.
      depends_on: [B1_full_build_contract_schema]

    C1_copilot_spec_wizard:
      status: OPEN
      does: >
        "Co-pilot needs to be able to walk me through the pipeline. idea,
        choosing and creating a .spec, step by step... listing templates
        and helping me understand any questions." Real, substantial
        conversational-flow build — co-pilot asking idearium's own real
        template list (architecture/module/schema templates — see C2)
        one question at a time, synthesizing what each question means
        before asking it (James's own explicit ask: "a synthesis of what
        each question means").
      depends_on: []

    C2_templates_folder_structure:
      status: OPEN
      does: >
        "Templates folder for: Modules, Architecture, Schemas." Real
        precedent: idearium already has SOME real templates (module-
        builder.js's real, deterministic architecture-template matching,
        confirmed in an earlier session's lib/version.js changelog entry
        — api-service/event-system/plugin-runtime/ai-agent-system/
        minimal-kernel). This phase is formalizing that into a real,
        browsable, co-pilot-editable folder structure, not building
        template-matching from scratch.
      depends_on: []

    C3_component_import_decomposition:
      status: OPEN
      does: >
        "Would love a way to import projects and have them decomposed
        into components to add the component store." A real, and
        genuinely new, capability — no existing "import an external
        project and decompose it into components" pipeline found this
        pass. Large, standalone build.
      depends_on: []

    C4_build_wizard_two_modes:
      status: OPEN
      does: >
        "A build wizard would have two options: Co-pilot assisted...
        Manual builder, would have checkboxes." Real technical-spec
        field list given directly: project name, end-state/vision/
        philosophy, problem solved, language, target OS, interface type,
        architecture template. A real, concrete form schema to build
        against once C1 exists.
      depends_on: [C1_copilot_spec_wizard]

    D1_bridgeos_readme_template:
      status: OPEN — real reference material now attached, template extracted
      does: >
        "Only look at bridge os demo. I want that readme as a template."
        James attached the real Bridge-OS-full-project-5.zip this
        session — its README.md (2318 lines, 31 modules) was read
        directly, not guessed at. Real, extracted per-module template
        (every one of Bridge OS's real 29+ module sections follows this
        exact shape, confirmed by reading multiple full sections, not
        assumed from the first one):
          - "What it does" — real purpose, in plain language
          - "How it works internally" — real mechanism, including
            named sub-components and their real interaction
          - an optional "<topic> addendum" — real, dated history/gap
            notes (Bridge-OS's own "Security review addendum (2026)"
            is the real precedent — matches this codebase's own
            AX-013 history: field almost exactly)
          - numbered "invariants enforced in source" — a real, counted
            list of hard constraints (bridge-IME's real section has
            exactly 12), each one a single testable sentence
          - "How to use it" — a real, runnable code example
          - "What it connects to" — real upstream/downstream
            dependencies, named specifically (matches this codebase's
            own registry-components.js dependency edges)
          - "Bus events emitted" — a real, per-event list with real
            payload shapes (matches T2/T4's own event-taxonomy work
            almost exactly — same real shape, different name)
        Top-level document structure (also real, extracted directly):
        title + one-line tagline (module count, real capability
        summary), "What It Is" (2-3 real sentences, no marketing
        filler), "Quick Start" (a real, copy-pasteable boot sequence
        with real sample output), "Philosophy" (real, named author
        voice — "Why This Exists" / "What We Will Never Do" — this
        codebase's own AXIOMS-v3.1.md is the closest real analog), a
        per-module section for every real module, a real "Modules Not
        Yet Built" table (status/depends-on/description columns — this
        codebase's own phasemap OPEN/depends_on shape is already
        extremely close), and a real "Module Conflict Registry" section
        with an actual JSON schema example (conflicts/requires/vital/
        regime fields) enforced at boot — a real, directly-portable
        precedent for this codebase's own component-registration
        discipline, not just documentation.
      depends_on: []

    D2_idearium_compartment_structure:
      status: OPEN — real naming decision needed
      does: >
        "Maybe we call it an idearium compartment... or miniworld." A
        real compartment-per-idea structure: idea -> architecture-
        template-slotted compartment -> promoted to a real idearium repo
        (spec as live metadata) -> chunked and populated by chunk
        contracts (B2) as it's built. README (D1) is that compartment's
        real index.
      depends_on: [D1_bridgeos_readme_template]

    D3_loom_compartment_readme:
      status: OPEN — unblocked, D1's real template now available
      does: >
        Same D1 structure, applied to loom's own real per-NEXUS-system
        compartments (not idearium's user-project compartments) — "each
        compartment in loom for each nexus system/repository needs a
        bridge os style readme."
      depends_on: [D1_bridgeos_readme_template]

    D4_spec_bulk_import:
      status: OPEN
      does: >
        "I have about 50 specs i want to be able to import/dump into
        idearium and have built using the pipeline." Real, bounded batch
        operation — genuinely blocked on C1/B2 existing first (the
        "pipeline" those 50 specs would run through).
      depends_on: [C1_copilot_spec_wizard, B2_chunk_contract_chaining]

    AM7_agent_suite_welcome_ui:
      status: OPEN
      does: >
        "Opening the agent mesh has a screen that says welcome to the
        agent suite... list of agents in blocks. add, edit, remove,
        manage... app-password style login." Real L5 UI work — every
        living-model phasemap this codebase writes explicitly sequences
        UI last (see versionium.spec's own "ui is hot swappable and is
        built last, all js is first" and VS1's own real precedent) — the
        real backend this UI would sit on (hat-forge, account-registry,
        agent-router — all real, confirmed in the agent-mesh phasemap)
        already exists.
      depends_on: []

    AM8_element_picker_agent_wiring:
      status: OPEN
      does: >
        "The guardian plugin maps to adding a new agent to the mesh...
        selecting a new element has the option in the listener settings
        to add to new agent, then asks if this is an input or an output
        element, then asks you to select the opposite to create a
        system." A real, novel UI interaction pattern for wiring a new
        agent via clear-glass's element picker — genuinely new, no
        existing precedent found.
      depends_on: []

    AM9_per_account_sub_agents:
      status: OPEN — real design decision
      does: >
        "Each account for the agent can also be another agent, since it
        can run in another tab." Real tension with account-registry's
        current shape (CA7, real multi-account-per-provider registry) —
        this asks for each ACCOUNT to be independently addressable as
        its own agent (own intent map, own hat eligibility), not just a
        credential slot under one provider-level agent. Needs a real
        design call on whether that's a new layer under hat-forge or a
        new dimension on account-registry itself.
      depends_on: []

    AM10_ollama_models_in_mesh:
      status: OPEN — real partial precedent
      does: >
        "Ollama needs to be in the agent mesh, each model in ollama."
        Real, partial precedent: lib/hat-seed-ollama-personalities.js
        already has 16 real personality hats on baseAgent:'ollama' with
        per-hat model tags (confirmed in the agent-mesh phasemap). What's
        missing: ollama's own real model catalog (ollama/abliterated-
        catalog.js, confirmed to exist) isn't wired to auto-generate a
        hat per available model — today's 16 hats were hand-authored.
      depends_on: []

    AM11_per_agent_tasks_automation:
      status: OPEN — major real precedent found (2026-09-02 uploads)
      does: >
        "Maybe each agent has intent map, jobs and scheduled tasks, an
        index for each agent with a tasks and automation manager, which
        has the options for background tabs." Real precedent: hat-
        forge.js's own `responsibilities` field (real, scheduled,
        dispatches through copilot/tool-runtime.js's runViaAgent —
        confirmed in the agent-mesh phasemap) already covers "scheduled
        tasks per hat." Missing: a real per-agent INDEX/UI surface for
        managing these, and explicit background-tab options.
      real_archive_precedent: >
        James uploaded 7 zips this session containing a real, dated
        (2026-04/05) earlier "BrainOS" iteration — checked directly, not
        assumed from filenames. automation_1.zip's routing-engine.js
        (v5.0.0, real, documented) is a substantially complete real
        answer to WF1/WF2 below — genuine trigger types (manual/timer/
        cron/datetime/heartbeat/health_score/data/intent), real step
        types (agent/http/condition/transform/delay/notification/
        branch/framework_inject/log/bridge), template variables
        ({{input}}/{{prev}}/{{runId}}/{{ts}}/{{wf}}), per-step and
        per-workflow onFail policy (abort/skip/retry), and a real
        conversation-capture JSONL log per run. agent-registry.js's own
        real axiom — "no agent is called directly — always through
        registry -> factory -> bus" — is the same real discipline this
        codebase's own AX-010 (sovereign transport) already enforces,
        independently arrived at. §8.6 reuse-before-build: this is
        real, substantial prior work to adapt, not something to build
        from a blank file.
      depends_on: [AM7_agent_suite_welcome_ui]

    WF1_workflow_automation_engine:
      status: OPEN — real, substantial precedent found, not greenfield
      does: >
        "I want these mapped to a .config file or database that updates
        with co-pilot's tool, similar to tasks scheduler on windows or
        like tasker or automate." Directly answered by automation_1.zip's
        real routing-engine.js (see AM11's real_archive_precedent above)
        — a real, working workflow/trigger/step engine already exists in
        an earlier iteration of this project. This phase is porting and
        adapting that real engine into the current sovereign-system
        architecture (its own folder, own config, own data dir — same
        VS1 pattern), not designing one from scratch.
      depends_on: [AM11_per_agent_tasks_automation]

    WF2_canvas_visual_pipeline:
      status: OPEN — real, substantial precedent found
      does: >
        "Beautiful canvas based visual pipeline workflow and
        automation." James's Nexus-Cobalt_54b637.zip upload has a real
        canvas/ directory — checked directly: spec-a/ contains
        cfr-physics.js, cfr-render.js, cfr-rewind.js, rewind-scrubber.js,
        node-inspector.js, image-analyzer.js, renderer.js; spec-b/
        contains a real bus-to-cfr.js bridge. This is a CFR-based (causal
        field renderer) node-graph visualization with real rewind/scrub
        controls and a node inspector — this is the SAME real capability
        named in docs/2026-09-02-versionium-sovereign-and-cleanup-
        phasemap.spec's CLEANUP6 ("a live map with nodes that represent
        packets or files moving through and from each system, like a
        brain") — not a separate ask, the same one, with real prior
        work now found for it. Two real specs (spec-a, spec-b) exist —
        a real design decision on which (or a merge of both) is the
        right starting point, not decided here.
      depends_on: []

    WF3_cockpit_ui_shell:
      status: OPEN — real, complete UI prototype found
      does: >
        James's Nexus-Cockpit_1.zip is a real, single-file, 314KB HTML
        UI shell — "NEXUS · Cognitive Cockpit v10," a complete dark-
        themed dashboard with named operational modes (deep/fast/audit/
        creative/emergency/silent — real CSS custom properties, not
        placeholder text) already styled. Real, substantial candidate
        for AM7's own "welcome to the agent suite" screen and/or a
        broader master-settings shell — worth reviewing as a real
        starting point before designing a new one from scratch (§8.6).
      depends_on: [AM7_agent_suite_welcome_ui]

    ARCHIVE1_cortex_cobalt_history_backfill:
      status: OPEN — ties to CLEANUP8
      does: >
        Nexus-Cortex_1.zip and Nexus-Cobalt_54b637.zip are real, dated
        (2026-05) earlier snapshots of this project's own cortex/
        (agents/, automation/, core/raid/, gate/, healer/, memory/,
        nas/, orion/, versionium/ — real, matching today's live
        directory names almost exactly) and a later, more expansive
        Cobalt iteration (adds admin/, canvas/, crystalball/,
        extension/, guardian/, plugins/, schemas/, tauri/). Real,
        direct match to docs/2026-09-02-versionium-sovereign-and-
        cleanup-phasemap.spec's CLEANUP8 ("have the original archives of
        nexus if you can add them to the living model to update
        history") — this IS that real archive material, now in hand.
      depends_on: [VS1_sovereign_folder_and_foundation]

    G1_guardian_agents_folder:
      status: OPEN — real, concrete structure given
      does: >
        "Guardian refactor: Agents folder: ChatGPT / model.db / input.js
        / output.js / toolbox/ / index.html (moved from ui/agents/
        chatgpt/) / tool index." A real, concrete target structure named
        directly — this is a genuine per-provider decomposition of
        guardian/userscript-chatgpt.js and friends, directly related to
        AM4 in the agent-mesh phasemap (confirmed real duplication
        across all four userscripts — 3 of 4 handleJob functions are
        byte-for-byte identical). G1 and AM4 should likely be the SAME
        real refactor, not two separate ones — flagged as a real overlap
        to resolve when scoping, not decided here.
      depends_on: []

    CG4_macros_plugin_autofill:
      status: OPEN
      does: >
        "Macros plugin for creating and managing plugins with autofill...
        full resume, application, account autofill, custom." Real,
        substantial new capability — no existing autofill-manager found
        this pass.

    CG5_copilot_guided_spotlight_macro:
      status: OPEN
      does: >
        "Co-pilot can guide me through macros using spotlight — like
        injecting the spotlight css into each page to select an element
        using clearglass... highlights an element asking about my name,
        I tell it James, next element asks last name... auto regex, i
        want the data working on any application on any website." A
        genuinely novel, real interaction pattern — element-highlight-
        and-ask, chained into a reusable, cross-site macro via regex
        generalization. No existing precedent.
      depends_on: [CG4_macros_plugin_autofill]

    CG6_element_picker_to_listener_queue:
      status: OPEN — real, repeated across the whole dump
      does: >
        "I can pick an element and tell co-pilot what to do to create a
        macro... select listener, option to give co-pilot a task...
        select an element, send it to a system or compartment with a
        ledger for the listener... then tell co-pilot to monitor the
        compartment... listen for the word apple." Repeated multiple
        times across the vision dump — clearly a high-priority, central
        idea: element picker -> real listener -> routed to any system's
        real queue/SSE (including copilot's own continuous stream) ->
        co-pilot monitors that compartment's ledger for a real condition
        and acts. Fully programmable framework/task/job creation as the
        end state.
      depends_on: []

    CG7_cli_first_architecture:
      status: OPEN — large, architecture-level
      does: >
        "Can we make the entire thing cli based. like every aspect of
        the browser... full command line to configure settings, config
        file, then the ui is event driven and disposable." A real
        architectural inversion — CLI as the primary surface, UI as an
        optional, event-driven, disposable layer on top, with captcha/
        human-intervention as the one real case that forces the UI open.
        Large, cross-cutting; touches every clear-glass feature.

    CG8_devtools_screenshot_dom_archaeology:
      status: OPEN
      does: >
        "A command for dev-tool errors, screenshots, archeology dom
        reader and map tool to map the entire dom to ids and calltos."
        Real, concrete command list — three distinct real capabilities
        (devtools-error capture, screenshot, DOM->id/callto mapping).

    CG9_history_via_rewind_engine:
      status: OPEN
      does: >
        "A browser history that uses the rewind engine, like as states,
        and what about bookmarks with the cookies linked to it?" Real
        precedent: clear-glass's Rewind engine already exists (confirmed
        live in every boot log — "[Rewind] Engine ready") and history
        write/search were just fixed this session (the clear-glass
        patch). This asks for history entries to become real Rewind
        STATES (restorable), and bookmarks to carry the real cookie/
        session state they were made under, not just a URL.
      depends_on: []

    CG10_zoom_and_hotkeys_bug:
      status: OPEN — real, confirmed-unfixed bug
      does: >
        "Need per page zoom options. also all the hotkeys/keyboard
        shortcuts don't work. nor control and scroll wheel to zoom in
        and out. control plus and minus." Distinct from the per-site
        zoom READOUT already fixed in this session's clear-glass patch
        (that was a display fix, not the underlying zoom/hotkey
        mechanism) — a real, still-open, separate bug report.

    CG11_ublock_adblocker_native_features:
      status: OPEN — already mapped once
      does: >
        Restates CG3 (uBlock-compatible filter engine + element picker)
        and CG2 (passwords/permissions/zoom as native Electron features,
        not plugins) from docs/2026-09-02-versionium-sovereign-and-
        cleanup-phasemap.spec — not re-mapped as new phases here, just
        cross-referenced so this document doesn't silently duplicate
        that one's own real scope.
      depends_on: []

    V8_full_change_tracking_hashing:
      status: OPEN — real partial precedent (VS1)
      does: >
        "Versionium needs to track system changes, files, data, anything.
        need hashing. one backup of each file, then of each file change.
        snapshots each sigma detection." VS1 (real, this session) built
        the sovereign commit/restore/calendar/state system, but it
        tracks jaaDB TABLE rows, not individual real files on disk — "one
        backup of each file, then of each file change" is a genuinely
        different, file-level tracking granularity, closer to cortex/
        snapshot/index.js's own real hash-chained .nex format (also
        touched this session — the half-life pruning work) than to
        versionium's table-level commits. Real design call: should
        versionium absorb cortex/snapshot's file-hashing role, or do the
        two stay separate (table-level history in versionium, file-level
        in cortex/snapshot)?
      depends_on: []

    V9_precommit_gate_for_raid_contracts:
      status: OPEN — real, well-specified
      does: >
        "I feel like we need a precommit for versionium for when raid
        creates a compartment for a contract that changes or updates a
        file in nexus. needs to force versioning, and updating the map
        with a precommit until its passed raids qc, axioms, test env,
        and conditions." A real, well-specified gate: RAID's real
        contract-intake (processNext/compartmentEngine.execute) would
        call into versionium (a real commit, forced, not optional) AND
        loom's real map (component/hook/wire updated) BEFORE a
        contract's real PASS verdict is honored — not after. Ties
        directly to B2's chunk-contract-chaining and to VM1 below (which
        system should even own "the map" being updated here).
      depends_on: [B1_full_build_contract_schema]

    VM1_versionium_owns_loom_map_sync:
      status: OPEN — real, James's own conclusion
      does: >
        "Intelligence:intelligence/server.js nor cortex:cortex/boot.js
        should be tracking this. it should be loom or even versionium...
        maybe versionium should track this, considering it can use the
        intelligence system also. probably should." James's own real
        conclusion, landed on directly in the dump — versionium (not
        intelligence, not cortex) becomes the real owner of loom-map
        sync tracking, since it's already the system tracking "what
        changed and when" for everything else. Real, concrete follow-on:
        this move would ALSO need to fix the real resolveSystem() bug
        (see loom_map_confusion above) as part of the same work, since
        moving broken counting logic to a new owner doesn't fix the
        counting.
      depends_on: []

    V10_dynamic_registry_self_wiring:
      status: OPEN — large, architecture-level
      does: >
        "Can we have each component wire to the registry to make it
        dynamic. so changes are automatically updated for each system if
        a file or component moves or changes... watchdog to listen for
        file changes. give co-pilot the ability to move files." A real,
        large capability — components self-registering/re-registering on
        file move, a real filesystem watchdog, and co-pilot given real
        file-move authority (a genuine new permission surface, not
        something to grant lightly — real design call on gating this).
      depends_on: [VM1_versionium_owns_loom_map_sync]

    LM2_per_system_living_model_completion:
      status: OPEN — real partial precedent (LM1, AX-013)
      does: >
        "Nexus needs a living model of each system: file structure,
        components, hooks, wires with intention, history, current gaps,
        version history hooked into versionium, commands, api calls,
        channels — which co-pilot uses as a map." LM1 (real, prior
        session) already built the AX-013 schema (history/gaps/
        version_history on system specs) and closed 8 real missing
        specs. What's still genuinely open: "commands, api calls,
        channels" as LIVE, queryable fields (not hand-written prose) —
        this is LM1's own gap V1, restated here — and co-pilot actually
        CONSUMING these specs as its real working map (co-pilot today
        doesn't read any system's .spec file at runtime, confirmed by
        grep).
      depends_on: []

    LM3_component_registry_hooks_spec:
      status: OPEN
      does: >
        "Component registry needs to hook into the spec also. a full map
        of each system." Ties LM2's living-model spec fields directly to
        each system's real registry-components.js (already real for
        ollama/loom/clear-glass/versionium) — today these are two
        separate real artifacts (a spec file, a registry file) that
        happen to describe overlapping things, never cross-linked.
      depends_on: [LM2_per_system_living_model_completion]

    LM4_hotswap_ui_contracts:
      status: OPEN — already mapped once
      does: >
        Restates CLEANUP7 from docs/2026-09-02-versionium-sovereign-and-
        cleanup-phasemap.spec ("using the living models for the
        interaction contracts for the hotswappable uis") — cross-
        referenced, not re-mapped.
      depends_on: []

    LM5_data_decay_per_system:
      status: OPEN
      does: >
        "Data in the systems folder decays based on time stamps." Real
        precedent: cortex/memory/decay.js already exists (confirmed —
        cortex/boot.js's own startDecayTicker call, running today). This
        phase asks for the SAME real decay concept applied to each
        system's OWN local data/ folder (versionium's own data/
        versionium/, ollama's data/ollama/, etc.), not just cortex's
        shared tables.
      depends_on: []

    LM6_model_template:
      status: OPEN
      does: >
        "Model Template: Model Name, Directory... each model should be a
        living map. Full context, history, versions, commands, updates."
        A real, smaller-scoped sibling of LM2 — specifically for
        describing an AGENT/MODEL (ollama tags, hat-forge records), not
        a whole SYSTEM.
      depends_on: [LM2_per_system_living_model_completion]

    CP1_less_rigid_copilot:
      status: OPEN — real, qualitative, needs concrete follow-up
      does: >
        "Co-pilot needs to be less rigid. Less stiff." Real, but not yet
        actionable as written — no concrete mechanism named. Real next
        step before this becomes buildable: identify SPECIFIC rigid
        behaviors (a particular canned response pattern, an overly
        strict tool-gate, a fixed persona) rather than treating
        "rigidity" as one global switch.

    CP2_copilot_learning_memory:
      status: OPEN — real partial precedent
      does: >
        "I want co-pilot to learn... to be able to talk to it and have
        it learn, but also think for itself... learns how to do things
        and logs it into its memory." Real precedent: copilot's own
        stream-digest (confirmed live — "activity persists to Cortex
        every 60s") and query_recall/agent_chat_search (real, confirmed
        in the agent-mesh phasemap) already give co-pilot durable memory
        of past exchanges. What's genuinely missing: a real mechanism
        for co-pilot to derive and persist a general LESSON from an
        exchange (not just the raw exchange itself) — closer to hat-
        forge's real personality-model concept than to plain chat
        logging.
      depends_on: []

    CP3_dynamic_model_selection:
      status: OPEN — real, concrete, small
      does: >
        "What if we dynamically use mistral:7b-instruct-q4_K_M for
        co-pilot, qwen2.5-coder:1.5b when it's low on resources?" Real,
        small, well-specified — ollama/config.js already has
        DEFAULT_MODEL/FALLBACK_MODEL fields (confirmed real this
        session while building VS1's own config.js pattern) but no
        resource-pressure-triggered switch between them. orchestrator's
        own real resource-monitor (confirmed live — "sampling every
        10s — GET /api/perf") is the real signal source this would
        listen to.
      depends_on: []

    CP4_copilot_cli_deterministic_toggle:
      status: OPEN
      does: >
        "Need deterministic options for cli.js: toggling co-pilot between
        ollama and guardian." Real, partial precedent: copilot/
        lifeline.js's route() already has a real priority cascade
        (`priority: ['ollama', 'guardian']`, confirmed this session) —
        this asks for a real CLI switch to pin one or the other
        explicitly, not just let the cascade decide.
      depends_on: []

    # ══════════════════════════════════════════════════════════════════
    # §ADDENDUM 2026-09-02b — James: "what can we do to get nexus to
    # build like you? phase all of this." A second, distinct dump —
    # Nexus's own end-state as an autonomous, self-improving builder
    # (ChatGPT/Gemini/DeepSeek/Claude fallback chain, self-heal, self-
    # optimize, adversarial self-critique) and the concrete surfaces
    # that would make that real: wake words, clarifying questions,
    # chunked large-file analysis, a per-output build surface/IDE.
    # Checked against the master phasemap above first — genuinely new
    # ground: zero keyword overlap on wake_word/introspect/fitness/
    # build_surface/autocomplete/working_memory/self-build/token
    # reduction (grepped directly). Cross-referenced against B1/C1/C3/
    # C4/AM11/WF1/CP1-4 above where they DO overlap, rather than
    # duplicating those tracks.
    # ══════════════════════════════════════════════════════════════════

    SR1_per_agent_wake_words:
      status: OPEN — real precedent exists, this extends it
      does: >
        "Maybe the wake words" — per-agent wake words (e.g. "hey
        chatgpt"), already named on James's own horizon list. Real
        precedent: guardian/userscript-nexus-wake.js's "hey nexus" is
        ONE global wake word, deliberately kept separate from the
        model-facing agent hint (see that file's own header — "two
        features, deliberately separate"). This is the same pattern,
        per-provider: "hey chatgpt" in Claude's tab should route to
        guardian's chatgpt dispatch instead of Claude answering it —
        cross-agent delegation FROM inside a tab, not just human-to-
        nexus. Real new surface: the listener needs to know which
        providers are live (ncp.isConnected — real, already exists)
        before claiming a wake word is routable.
      depends_on: []

    SR2_copilot_clarifying_questions:
      status: OPEN — genuinely new, no existing mechanism found
      does: >
        "I want co-pilot to ask questions when it doesn't know, like
        you do." Checked directly: guardian/ask.js is a synchronous
        FACADE over dispatch (waits for a job to finish), not a
        clarification flow — no existing "the intent is ambiguous, ask
        one question before proceeding" mechanism anywhere in copilot/
        or guardian/. Real, buildable shape: reuse intent-hat-router's
        real confidence score (already computed per _suggestJobHat,
        guardian/lib/jobs.js) as the trigger — low confidence + no
        forced hat match asks ONE targeted question via the existing
        chat surface instead of guessing; high confidence proceeds with
        a stated assumption, same asymmetry this session's own
        assistant behavior uses. Real precedent for the "ask sparingly,
        prefer stated assumptions" discipline: none yet in this
        codebase — this would be the first.
      depends_on: []

    SR3_artifact_extraction_introspect_bridge:
      status: BUILT 2026-09-03 (commit 395fef9) — real hook, fire-and-forget, verified
      does: >
        "Artifact extraction also can connect to the introspect tool."
        Both sides are real and unconnected today: guardian/server.js's
        extractCodeBlocks/autoUploadBlocks (still inline — see the
        guardian decomposition's own "not yet traced" list) writes code
        blocks to disk on GUARDIAN_COMPLETE; lib/introspect.js
        (examine()) reads real ground-truth signals — reflection score,
        lifeline-contract shape match, gap-field, component-ledger, and
        the user's own correction, which "outranks everything" per that
        file's header — but is only wired to co-pilot's retry path
        today, never to a freshly-extracted artifact. Real, concrete
        next step: after extractCodeBlocks writes files, run
        introspect.examine() against the job before marking it fully
        "complete" rather than "complete, unexamined" — this is the
        real mechanism behind James's "doubt and attack its outputs."
        Natural companion piece to the guardian decomposition's still-
        open artifact-extraction extraction (MANIFEST.md), since
        extracting that inline code is what makes it easy to insert
        this hook at the one real call site instead of guessing where
        artifacts get created.
      depends_on: []

    SR4_fitness_driven_contract_adjustment:
      status: OPEN — real fitness engine exists, feedback loop does not
      does: >
        "I want the system to reflect fitness scores, adjust contracts
        to agents." Checked directly: cortex/core/raid/index.js's real
        Layer 2 (_fitness(), ranked survivors, a live health snapshot
        fed back from real outcomes — confirmed real, not a stub, per
        that file's own header) already ranks agents and updates health
        after the fact. What's missing: B1's contract schema (above)
        doesn't yet read _fitness's live ranking when SYNTHESIZING a
        contract, and there's no real path for a contract whose target
        agent's fitness drops mid-flight to be re-routed to the next-
        ranked agent instead of failing outright. Depends on B1 landing
        first — this is B1 plus a live read from RAID's existing health
        snapshot at synthesis and retry time, not a new scoring engine.
      depends_on: [B1_full_build_contract_schema]

    SR5_large_file_chunk_working_memory:
      status: OPEN — real SEAM-chunking precedent exists in the opposite direction
      does: >
        "Analysis can decompose and parse files if they're too big, can
        be requeried, each chunk as a uuid temporary for working
        memory." Real, existing precedent runs the OTHER way: SEAM
        chunking (guardian's _buildSeamQueue/seam-watchdog, referenced
        throughout guardian/lib/ncp-handler.js's own §74.2/§70.2
        comments) splits OUTGOING generation requests into chunks sent
        TO an agent. This is the inverse — splitting a large file being
        READ/analyzed FOR context — and doesn't exist yet under any
        name found this pass. Real shape: an ingest-time chunker that
        assigns each chunk a session-scoped UUID (not a persistent
        component id — "temporary for working memory" is explicit),
        stores chunk→byte-range + a summary, and exposes a real re-
        query-by-uuid call so an agent that only saw a summary can pull
        one specific chunk back in full without re-reading the whole
        file. lib/vector-memory.js's real embedding pipeline is the
        closest existing infrastructure to adapt rather than duplicate.
      depends_on: []

    SR6_per_output_build_surface:
      status: OPEN — genuinely new, real building blocks exist separately
      does: >
        "A build surface for each output that can automatically save to
        file, had a line count for LLMs to parse and replace chunks,
        also an IDE with autocomplete." Real, separate building blocks
        found, not yet composed: guardian's dropzone/artifact-upload.js
        already does real auto-save-to-file on artifact arrival; this
        session's own str_replace-style workflow (exact old_str match,
        line-numbered view) is the real discipline James is asking
        Nexus to grow, not a metaphor — a real line-counted view +
        targeted-chunk-replace tool, scoped per generated file, is the
        concrete deliverable. Autocomplete is the genuinely hardest,
        least-precedented piece here — no existing inline-completion
        surface found anywhere in clear-glass/cockpit/idearium's UI
        code this pass; likely the last sub-phase, not the first.
      depends_on: [C3_component_import_decomposition]

    SR7_token_reduction_toolkit:
      status: OPEN — real infra exists scattered, not catalogued as one toolkit
      does: >
        "Any tools you have that help reduce tokens, help you code
        better." Real, already-built pieces, confirmed by direct check,
        that already do this but aren't presented to agents as one
        coherent toolkit: lib/vector-memory.js (retrieve-relevant-chunk
        instead of whole-document context), lib/chat-logger.js
        (session-scoped recall instead of re-sending history),
        AM1/ACK-injection's real per-hat toolScope narrowing (hat-
        forge.js — an agent gets ITS tools, not all 63), and SEAM
        chunking's chunk-sized dispatch. This phase is a real catalog +
        gap-check (are all four actually reachable by every agent type,
        or only some?) rather than new invention — §8.6 reuse-before-
        build applies directly here.
      depends_on: []

    SR8_deterministic_claude_replication:
      status: OPEN — REFRAMED 2026-09-03, procedure not persona, model-agnostic
      does: >
        §REFRAMED — James, 2026-09-03: "I meant we give nexus the tools
        to code like you. Decoupled from you, unless ncp." The original
        wording of this track ("replicate you... deterministically")
        risked being read as "make Nexus depend on Claude specifically."
        That is explicitly NOT the ask. Corrected framing: what's
        replicable isn't a persona or a dependency on any one model —
        it's a PROCEDURE, and the procedure must run on whichever agent
        Guardian dispatches to (ollama/mistral/deepseek locally, or
        chatgpt/gemini/claude over the real NCP browser-agent bridge —
        Claude appearing there on equal footing with the other three,
        never as a required backend). The procedure itself: read the
        real file before editing it; verify by booting/testing, not
        syntax-checking; diff-scope edits with exact old_str matches
        instead of rewriting whole files; run a git-stash baseline
        before claiming a test failure is pre-existing; state
        assumptions inline instead of guessing silently. Every one of
        those is already this repo's own stated discipline (AXIOMS-
        v3.1.md, CLAUDE.md rule 3) — the gap isn't that Nexus lacks the
        RULES, it's that no single agent-facing surface enforces the
        SEQUENCE as one procedure ANY dispatched agent is walked
        through automatically, regardless of which provider is behind
        it. Real next step: a real checklist/gate co-pilot or guardian
        attaches to a build-intent job (view real file → edit scoped
        diff → verify by execution → compare against a stash baseline →
        report honestly) — implemented as a real guardian-side gate
        that wraps whichever agent is dispatched, not a prompt asking
        one specific agent to "be careful."
      depends_on: [SR3_artifact_extraction_introspect_bridge, B1_full_build_contract_schema]

    SR9_autonomous_self_build_end_state:
      status: PARTIAL 2026-09-03 (commit — see lib/self-build-loop.js) — narrow, dependency-free real slice built; full end-state still OPEN
      does: >
        "The system can build nexus autonomously. Update its maps,
        update and track versions and file changes, snapshot and
        backup, debug and heal, optimize and remember. Doubt and attack
        its outputs... can code any project/spec, using ChatGPT, Gemini,
        deepseek, and Claude if all else fails." §REFRAMED 2026-09-03
        alongside SR8, same correction: "Claude if all else fails" means
        Claude reachable the SAME way as chatgpt/gemini/deepseek — over
        the real NCP browser-agent bridge, one more entry in guardian's
        real provider-routing table (cortex/core/raid/index.js's
        _fitness ranking already treats agents interchangeably by real
        health score, not by hardcoded preference) — not a special
        fallback path that makes the rest of the loop depend on Claude
        specifically to function. This is the composite end-state, not
        a single buildable phase — real precedent exists per-piece
        (loom's map, lib/version.js's registry, cortex/snapshot's
        tombstone-pruned snapshots, cortex/self-heal/, intelligence/
        baseline's optimize signal, cortex/memory's real recall,
        SR11's now-real import pipeline), but nothing wires them into
        one closed loop where Nexus initiates its own build/verify/heal
        cycle without a human prompt per step. Every track above
        (B1/SR3/SR4/SR7/SR8/SR10/SR11) is a real prerequisite piece of
        this loop, not a side quest — this entry exists so the
        dependency is explicit rather than Nexus appearing "almost
        done" once a few flashy pieces land.
      built_2026_09_03_partial: >
        James: "sr9" — checked dependencies first rather than building
        the whole ask: SR4/SR7/SR8/SR10 are still OPEN, so the full
        composite end-state genuinely isn't buildable yet. Built exactly
        the two real pieces SR9 names that need none of those open
        tracks: lib/self-build-loop.js subscribes to nexus-bus.js's real,
        already-shared singleton for lib/execution-pipeline.js's real
        `pipeline.promoted` event (fires only after sandbox-verify +
        compare-to-golden both pass — the pipeline self-gates this) and
        on every real promote: (1) creates a real cortex snapshot
        (cortex/snapshot/index.js's create(), unchanged, not
        reimplemented) — real "snapshot and backup"; (2) runs loom's real
        scanTree() and reports (not auto-applies — every real loom
        registration this session was a deliberate, reviewed act, and
        this doesn't get to silently break that) drift against loom/data/
        registry.json — real "update its maps" awareness. A live smoke
        test against the real repo found 125 genuinely undeclared files
        (mostly clear-glass/, which loom's maps don't cover — expected,
        not a bug). "Debug and heal," "optimize," "doubt and attack its
        outputs" genuinely need SR4/SR7/SR8/SR10 and are NOT claimed
        here. 5 real tests (tests/modules/test-self-build-loop.js).
      depends_on: [B1_full_build_contract_schema, SR3_artifact_extraction_introspect_bridge,
                   SR4_fitness_driven_contract_adjustment, SR7_token_reduction_toolkit,
                   SR8_deterministic_claude_replication, SR10_iterative_prompt_optimization_loop,
                   SR11_spec_project_import_to_compartment]

    # ══════════════════════════════════════════════════════════════════
    # §ADDENDUM 2026-09-02c — James, immediately after SR1-9 landed:
    # "how do we get there... what can nexus do right now, that's of
    # any use?" Narrows the ask to one explicit end-state — co-pilot or
    # idearium building code autonomously, the way this session does —
    # and four concrete new pieces (prompt-optimization loop, importing
    # the 40 specs into working compartments, a parse/query surface,
    # a real co-pilot chat UI). Checked against real code first, same
    # discipline as SR1-9: two of these four (SR12, partially SR11) turn
    # out to already exist far more than the ask assumed.
    #
    # §UPDATE 2026-09-03 — SR11 moved from OPEN to SUBSTANTIALLY BUILT
    # in the time between this addendum being written and this line
    # being added (commits a0bebe4, eda64f0) — see that entry below for
    # what's real now. Also: James, same day — "I meant we give nexus
    # the tools to code like you. Decoupled from you, unless ncp." This
    # is a real correction to how SR8/SR9 were framed below and has
    # been applied to both entries in place, not left as the original
    # misreading — see the §REFRAMED notes on each.
    # ══════════════════════════════════════════════════════════════════

    SR10_iterative_prompt_optimization_loop:
      status: OPEN — genuinely new, real hook to attach it to already exists
      does: >
        "Iterative loops to agents, with the prompt — how could that
        have been more optimized. I want the system learning from the
        agents and me." Checked directly: lib/reflection.js's
        scoreDecision() (real, deterministic, no hidden LLM judge per
        its own header) grades a DECISION's outcome — {score, reason}
        against `chosen`/`outcome`/`output` — it does not look at the
        PROMPT TEXT that produced that decision at all. Genuine gap.
        Real, buildable shape: after a job completes or fails
        introspect.examine() (SR3), a cheap local pass (ollama-bridge,
        already real) asks "given this prompt and this outcome, what
        wording would likely have scored higher" and logs the
        before/after prompt pair to jaa keyed by (intent, agent) — B1's
        contract synthesis (once real) reads this log before writing
        the next prompt to that same agent for that same intent, so the
        wording actually improves run over run instead of resetting
        each time. "Learning from me" is the same mechanism with a real
        existing trigger already ranked highest: introspect.js's own
        header says a user correction "outranks everything" — a
        correction just needs to feed this same prompt-pair log instead
        of only updating the immediate answer.
      depends_on: [SR3_artifact_extraction_introspect_bridge, B1_full_build_contract_schema]

    SR11_spec_project_import_to_compartment:
      status: SUBSTANTIALLY BUILT 2026-09-03 (commits a0bebe4, eda64f0) — verified, not test-covered
      does: >
        "I have like 40 specs I want to build... importing specs,
        important projects/zips to compartment to work on them." What
        was OPEN when this track was first written is now real: lib/
        intake.js's expandArchive() (real .zip expansion via the system
        unzip binary, argv-array execFileSync, no shell-injection
        surface), lib/project-compartment.js (staged/expanded intake ->
        a real, bounded workingMemorySeed), lib/dynamic-project-parser.js
        (any project shape, text-vs-binary decided by sniffing real
        bytes, not a hand-maintained extension list — tested directly
        against 4 real uploaded zips per its own header), lib/spec-
        from-markdown.js (fixes a confirmed real meta-extraction bug for
        non-canonical .md), idearium/api/index.js's real POST /api/
        repos/import endpoint, and ui/import-project/ as the human-
        facing screen. lib/autonomous-loop.js's run() — previously
        real but callerless, confirmed by grep before this session's
        prior addendum — now has its first real caller (guardian/
        routes/autonomous-loop.js) with a projectSeed param composing
        an imported project into a compartment's working memory
        alongside case-library's existing pattern-memory seed.
        §HONEST GAP — none of this has dedicated entries in tests/
        modules/run-all.js yet; verified so far by direct manual runs
        documented in each file's own header, not by an automated
        regression suite (see eda64f0's commit message). Closing that
        gap is real remaining work, not a formality.
      test_coverage_closed_2026_09_03: >
        commit c692d5d — tests/modules/test-sr11-import-pipeline.js,
        17 real tests across project-compartment.js, intake.js's
        expandArchive(), dynamic-project-parser.js, and spec-from-
        markdown.js. Found and fixed a real, unrelated blocker first:
        adm-zip was declared in package.json but never actually
        installed in this checkout (113 packages missing total) — every
        prior "verified" claim for parseProjectZip() was necessarily
        made somewhere the install had actually run. All 17 tests
        passed on the first real run against the now-really-installed
        adm-zip and the real system unzip binary.
      depends_on: []

    SR12_system_parse_query_surface:
      status: MOSTLY ALREADY REAL — connect, don't rebuild
      does: >
        "A parse tool to map the system, query tool to build upon or
        edit — basically how you do right now." Checked directly before
        assuming this needs building: it is already substantially real.
        lib/agent-tools/tools/query/nexus-map.js's own header states the
        exact reasoning James is asking for here was already applied —
        "re-walking the file tree and parsing each file from scratch
        would rebuild, at real token cost, something loom has already
        computed" — so nexus_map is a chunked reader OVER loom's real
        live graph (driver.graph()), already paginated per calling
        agent's real token ceiling (lib/agent-system/contracts.js's
        getContract(agentId)). read-file.js, search-files.js, and
        file-tree.js (same query/ folder) cover the "how you do right
        now" read side; execution/safe-apply.js and execution/
        run-command.js cover the edit side. The real gap is narrower
        than the ask implies: these tools exist but are not yet the
        DEFAULT path a dispatched coding job (idearium/warp-build-
        dispatch) reaches for before writing new code — confirm that
        wiring, close it if missing, before building anything new here.
      depends_on: []

    SR13_copilot_chat_ui:
      status: OPEN — real pattern exists in a sibling surface, not yet copilot's own
      does: >
        "A chat like ui/agents/chatgpt/index.html but for co-pilot
        specifically. A toggle for guardian or ollama. A list of
        commands." Real, direct precedent: ui/agents/chatgpt/index.html
        already hits a real endpoint (`${ORCH}/api/guardian/copilot/
        prompt`) and has a working `/cli/exec` command console — this
        is a genuine near-clone, not a from-scratch UI. New pieces:
        (1) a real guardian-vs-ollama toggle wired to copilot/
        lifeline.js's already-real `priority: ['ollama','guardian']`
        cascade (same real mechanism CP4 above asks a CLI switch for —
        this is that same switch, in the chat UI instead of cli.js),
        and (2) a real command list surfaced from wherever the actual
        command set lives (checked: guardian's /cli/exec path — trace
        its real command registry before hardcoding a list in the UI).
      depends_on: []

    AX_candidate_map_first_discipline:
      status: PROPOSED — drafted here, NOT applied to AXIOMS-v3.1.md
      does: >
        James, twice in this dump: "remember, read maps, files and
        registry first before changing, map to specs, loom history for
        each system and component, tool index, phasemaps, before making
        changes, full history and context... never don't map." This
        phasemap drafts real candidate axiom language below for James
        to review; per "do not build," it is NOT written into
        AXIOMS-v3.1.md in this pass.
      candidate_text: >
        AX-014 (draft) — Map Before You Touch. Before any change to a
        system's real code, its own living model (spec, registry-
        components.js, loom's real component/hook/wire graph, its most
        recent phasemap) is read first — not assumed, not skipped
        because the change looks small. A change made without reading
        the map it's about to affect cannot honestly claim to respect
        that system's real history or its real current gaps, and cannot
        be safely undone by someone who wasn't there when it landed.
        "Never don't map" — mapping first is not a step that gets
        skipped under time pressure; time pressure is the reason it
        exists.

  build_order_recommendation: >
    T2 (per-system event taxonomies) and VM1 (versionium owns loom-map
    sync, including the real resolveSystem() fix) are the two cheapest,
    most load-bearing starting points — T2 because several other tracks
    (T3, T4) depend on it, VM1 because it's a small, well-specified fix
    to a bug James already found and diagnosed correctly. B1 (full build
    contract schema) is the next real gate, since B2, V9, and D4 all
    depend on it existing first — its real field schema, intent
    taxonomy, and agent-synthesis design are all now fully specified
    (2026-09-02 follow-ups), so B1 is buildable as soon as picked up.
    D1 (Bridge-OS README template) is UNBLOCKED — real reference
    material attached and its template extracted directly — so D3 (loom
    compartment READMEs) is buildable now too. WF1/WF2/WF3 (workflow
    engine, canvas visualization, cockpit UI shell) all have REAL,
    SUBSTANTIAL prior-work precedent found in this session's 7 archive
    uploads — porting/adapting real code, not designing from a blank
    file, per §8.6. AX candidate needs a real yes/no from James before
    it's real law, not drafted law. Given how much real precedent just
    surfaced across WF1-3 and ARCHIVE1, a real triage pass over all 7
    uploaded zips (which files are genuinely reusable vs. superseded by
    what's live today) is itself worth doing before committing to a
    specific build order for that whole cluster.

    §ADDENDUM 2026-09-02b (SR1-SR9): SR2 (copilot clarifying questions)
    and SR7 (token-reduction toolkit catalog) are the two cheapest SR
    entry points — SR2 has zero dependencies and reuses intent-hat-
    router's existing confidence score outright; SR7 is a catalog-and-
    gap-check pass over infrastructure that already exists, not new
    build. SR1 (per-agent wake words) is similarly small and dependency-
    free, extending userscript-nexus-wake.js's existing pattern rather
    than inventing one. SR3 (artifact-extraction → introspect) should
    land alongside the guardian decomposition's still-open artifact-
    extraction work (see MANIFEST.md) — extracting extractCodeBlocks/
    autoUploadBlocks out of server.js is the natural moment to also wire
    introspect.examine() at that one real call site. SR4 (fitness-driven
    contract routing) and SR9 (the actual self-build end-state) both
    hard-depend on B1 landing first, same as B2/V9/D4 already did — B1
    remains the single highest-leverage unblock in this entire file, now
    gating even more downstream work than it did before this addendum.
    SR8 (deterministic Claude-replication procedure) is honestly the
    least mechanical of the nine — it depends on SR3 and B1 both
    existing as real hooks before there's anywhere to attach a real
    verify-before-promote checklist, so it should not be started first
    even though it reads as the "headline" ask.

    §CRITICAL PATH (2026-09-02c, updated 2026-09-03) — James: "I want
    nothing else until I can use co-pilot or idearium to build code
    like you are now" — later corrected to "give nexus the tools to
    code like you, decoupled from you, unless ncp." One named end-state
    narrows all of the above to a real, minimal sequence:
      1. B1_full_build_contract_schema — DONE (commit cc88eeb) — schema
         + synthesizeContract(), 13 real tests, verified end-to-end.
         Was everything downstream's real blocker; no longer is.
      2. SR12_system_parse_query_surface — mostly already real
         (nexus_map/read-file/search-files/safe-apply); confirm this is
         actually idearium's build-dispatch DEFAULT path, don't rebuild.
      3. artifact-namer.js — DONE (commits 483a9d5 on the prior working
         copy, reapplied as eda64f0 on this checkout after the 2026-09-03
         upload branched from before the fix existed) — was a hard
         crash on every artifact-bearing agent response through the
         callto/IPC path; the single most concrete blocker James named
         ("artifacts are the main issue").
      4. SR11_spec_project_import_to_compartment — DONE as of this
         update (commits a0bebe4, eda64f0) — real zip/project import to
         a compartment, end to end. Remaining real work: dedicated
         tests/modules/run-all.js coverage (currently manual-verified
         only, per each new file's own header — see that entry).
      5. SR3_artifact_extraction_introspect_bridge — the real
         doubt-and-attack step; needs the guardian decomposition's
         still-open artifact-extraction extraction to land first so
         there's one real call site to hook, not two inline copies.
         Now unblocked (B1 done) — the next real, un-DONE step on this
         list.
      6. SR4_fitness_driven_contract_adjustment + SR10_iterative_
         prompt_optimization_loop — both depended on B1 (now real) +
         SR3 (still open) — what makes repeated builds actually get
         BETTER instead of re-running the same routing/prompt every
         time.
      7. SR13_copilot_chat_ui — the human-facing surface for all of the
         above; deliberately last because it is a thin client over
         whichever of steps 1-6 are real by the time it's built.
    Per the 2026-09-03 correction: every step above is a real guardian-
    side capability any dispatched agent (ollama/deepseek locally,
    chatgpt/gemini/claude over the real NCP bridge) can use — none of
    it should end up requiring Claude specifically to run. SR9 (the
    full autonomous end-state) and SR8 (the now-reframed procedure
    track) remain the outer boundary, not on this narrower critical
    path. With B1 done, SR3 is now the single highest-leverage next
    step — it's the only remaining item on this list with no other
    open dependency in front of it.
