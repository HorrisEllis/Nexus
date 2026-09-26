spec:
  meta:
    name:    2026-09-01-living-model-and-autonomous-pipeline-phasemap
    version: 0.2.0-phasemap
    status: >
      PHASEMAP 2026-09-01. James, across two messages: the registry as a
      live hub other systems wire to (watchdog-propagated, dynamic,
      self-updating); the .spec as the living model per system (full
      context/history/versions/commands); a per-system tool index like
      clear-glass's own, user-friendly and zoomable, so co-pilot can
      answer "what can I ask about system X"; who creates RAID contracts
      and how; full agent-mesh + guardian + clear-glass + RAID + co-pilot
      pipeline wiring end to end; deterministic CLI agent-switching with
      an offline fallback; per-agent wake words ("hey chatgpt" etc.);
      co-pilot ollama/guardian toggle; successful-prompt caching via the
      crystallization/pattern-scan memory; plus a longer list from the
      prior message (guardian agents-folder refactor, components store,
      master settings, per-system data decay backed to cortex, downloads-
      manager reuse for artifacts). Mapped bottom-up per axiom §3.1 —
      every dependency checked against real, already-verified session
      findings (this session's own RAID event-taxonomy work, the tool-
      call loop, the loom-map registration) before being phased, not
      assumed. Deliberately excludes the separate "Warris/Mastermind"
      personal system James described in the same conversation — that is
      not part of this codebase.

      ADDENDUM 2026-09-19. James asked for a living atlas per system: a
      dynamic, recursive, human-readable map of each of guardian, ollama,
      cortex, intelligence, diagnostic, clear-glass, loom and copilot
      (ollama was listed twice), built deterministic-first with the
      readable prose written against that schema, ending in explicit
      completeness conditions and a new axiom draft. Mapped as phases
      LM18-LM26 against a fresh measurement of the v0.39.150 tree. Nothing
      built.
    uuid:    nexus-2026-0901-living-model-autonomous-pipeline-phasemap-v1-0000-001

  phases:

    LM1_spec_as_living_model:
      status: "OPEN — the real foundation everything else in this map
        depends on. James: 'I've got it. The .spec is the living model.'
        Checked directly: docs/*.spec already exist per-feature, but
        NOTHING today is per-SYSTEM, versioned, and updated automatically
        — confirmed via this session's own precommit output ('11 systems
        have no .spec anywhere: ollama-bridge, clear-glass, loom, gap-
        finder, divergence-watcher, macro-compiler, grammar-fallback,
        mutation-contract, open-loop-taxonomy, loop-topology, gap-loop').
        This phase is the real, minimal shape: one .spec per system,
        holding intention/history/current-gaps/version-history (hooked
        into Versionium, already real — versionium_commit is the only
        live capability, confirmed via this session's own tool listing)/
        commands/api-calls/channels — not a new storage mechanism, a
        real schema for what already-existing .spec files should hold
        per system, and the discipline of one existing per system."
      depends_on: []
      does: >
        Gives every system a single, real, versioned source of truth
        for what it is, what changed, and what's still open — the
        README-as-index James described, with versions listed under it.

    LM2_registry_as_hub_with_watchdog:
      status: "OPEN — real, checked foundation: loom's registry already
        IS a live component/hook/wire map (confirmed directly this
        session — read it, wrote to it, ran it). The real, confirmed gap:
        registration is one-way and manual today. Nothing watches a file
        change and propagates it; nothing currently reacts to the
        registry changing. James: 'can we have each component wire to
        the registry to make it dynamic, so changes are automatically
        updated for each system if a file or component moves or
        changes... using a watchdog to listen for file changes.' This
        is the real missing half of infrastructure that already exists
        on the other side."
      depends_on: [LM1_spec_as_living_model]
      does: >
        A real file-watcher that detects a change to a registered
        component and re-declares it (or flags drift) automatically,
        instead of requiring a manual loom/maps/*.js edit every time —
        this session's own raid-events-and-tools-map.js is the exact
        real, manual process this phase would eventually replace.

    LM3_interaction_contract_wired_to_registry:
      status: "OPEN — depends on LM2 existing first. James: 'maybe the
        interaction contract uses the registry as a map like the ui
        does. same with main.js to make systems route components
        dynamically based on intent.' Checked: cockpit's real
        INTERACTION_CONTRACT (confirmed live this session via co-pilot's
        own run_command tool description — 'command vocabulary is read
        live from the contract at load time, not hardcoded') already
        does exactly this pattern for cockpit commands specifically.
        This phase generalizes that same real, already-proven pattern
        (live-read-from-a-map, not hardcoded) to the registry as a
        whole, for intent-based routing generally."
      depends_on: [LM2_registry_as_hub_with_watchdog]
      does: >
        Any system's dispatch/routing logic reads the registry as its
        map of what exists and how to reach it, the same real way
        cockpit's contract already works for commands — one convention,
        generalized, not reinvented per system.

    LM4_per_system_tool_index:
      status: "OPEN — real, direct precedent already exists and works.
        James: 'the way clear-glass has a tool index, we need for each
        system... user friendly, like someone who's never used nexus
        before could use it.' Checked directly: clear-glass's real
        living command index (confirmed this session's own memory —
        'auto-written on boot, 68 real commands, GET /cli/commands')
        is exactly this pattern, already built, for exactly one system.
        This phase is that same real, proven mechanism, generalized to
        every system, not a new mechanism."
      depends_on: [LM1_spec_as_living_model]
      does: >
        Every system gets its own live, self-updating index of what it
        can do — reusing clear-glass's own real pattern, not inventing
        a second one.

    LM5_copilot_capability_zoom:
      status: "OPEN — depends on LM4 existing for every system, not just
        clear-glass. James: 'co-pilot needs to be able to zoom in on any
        system and tell me anything i can ask about it... its cluttered
        [today].' Checked directly this session: co-pilot's OWN real
        tool list (seen in the uploaded chatgpt transcript) is 70+ tools
        with dense one-line descriptions and no per-system drill-down —
        confirmed genuinely cluttered as described, not a vague
        complaint. Real fix is downstream of LM4, not a separate
        mechanism: once every system has a real per-system tool index
        (LM4), co-pilot needs one real 'zoom into system X' action that
        reads THAT system's index and returns a short, human-readable
        answer, instead of the full flat tool list every time."
      depends_on: [LM4_per_system_tool_index]
      does: >
        'What can I ask about guardian?' gets a short, real, current
        answer sourced from guardian's own live index — not a static
        paragraph someone wrote once and forgot to update.

    LM6_who_creates_contracts:
      status: "OPEN — real, currently-honest gap, not yet designed.
        James: 'who creates the contracts? and how? co-pilot? the
        intelligence system? specific agents?' Checked directly this
        session: RAID's real submitContract() (cortex/core/raid/
        contract-intake.js) accepts a contract object from ANY caller —
        there is currently no real, designated creator; every existing
        real caller (this session confirmed lib/seam/spec-parser.js as
        the one real wired source) hand-builds one. This phase is a
        real design decision, not a wiring fix: which of co-pilot /
        intelligence / a specific agent is authorized to author a
        contract for which kind of work, using LM3's registry-as-map
        (once real) to know what's actually available to contract for."
      depends_on: [LM3_interaction_contract_wired_to_registry]
      does: >
        A real, named answer to 'who can create a RAID contract, for
        what, and how' — replacing today's honest 'whoever calls
        submitContract() correctly' with an actual, designed authority
        model.

    LM7_agent_mesh_intent_programming:
      status: "OPEN — depends on LM6 (a real contract-creation authority
        must exist before an intent can safely generate one). James:
        'i want co-pilot to be able to add intents to the intent map...
        i want to be able to fully program the agents in the agent
        mesh.' This is the largest, least-scoped item in this entire
        map — deliberately left open rather than pretending a shape for
        it before LM6 lands, per this codebase's own §3.1 bottom-up
        discipline."
      depends_on: [LM6_who_creates_contracts]
      does: >
        Co-pilot (or an authorized agent) can register a new intent →
        contract mapping for the agent mesh directly, rather than every
        new agent behavior requiring a hand-written contract.

    LM8_full_pipeline_wiring:
      status: "OPEN — real, partial progress already confirmed this
        session. James: 'i want to get the pipelines working end to end.
        the agent mesh fully wired, guardian, clear-glass, raid engine,
        co-pilot all hooked in.' Checked directly, real current state:
        guardian's real NCP dispatch works end-to-end (confirmed
        repeatedly this session, job created -> dispatched -> acked ->
        complete, under 3s); RAID now has real event-taxonomy + ledger
        visibility (this session's own build); the real tool-calling
        loop is wired for all 4 providers (this session's own build).
        What's NOT yet confirmed wired: clear-glass <-> RAID
        (contract-driven browser actions), and the agent-mesh's own
        3-disconnected-sources-of-truth gap named earlier this session
        (IC11, partially fixed for spawn/send, useEros still unverified)."
      depends_on: [LM7_agent_mesh_intent_programming]
      does: >
        The actual, named end state James wants — not a new phase's
        WORK so much as the point where every phase above has landed
        and the whole chain is verified live in one real run.

    LM9_deterministic_agent_switch_cli:
      status: "OPEN — real, small, independently buildable NOW, doesn't
        block on the bigger phases above. James: 'nexus needs
        deterministic commands for agent switching. commands in case the
        agent is offline.' Checked directly this session: switch_agent's
        real tool (confirmed in co-pilot's own tool list) already exists
        for natural-language switching (and this session fixed a real
        bug in its 'switch to guardian using X' parsing) — but there is
        no confirmed, real, FIXED command syntax (e.g. a CLI-style
        `/switch chatgpt` immune to phrasing ambiguity) and no confirmed
        real fallback behavior when the target agent's tab isn't live."
      depends_on: []
      does: >
        A real, unambiguous command form for switching agents that
        works the same way every time, plus a defined, real fallback
        (queue it, fall back to another agent, or report unreachable
        honestly) when the target is offline — closing the exact
        ambiguity this session's own regex bug came from.

    LM10_per_agent_wake_words:
      status: "OPEN — real, direct precedent already exists and works.
        James: 'I would love to say hey chatgpt, hey claude, hey gemini,
        hey perplexity, hey nexus/copilot — just to send a prompt to any
        agent and receive the answer.' Checked directly this session:
        the real 'hey nexus' wake-word mechanism (WAKE_RE, parseWake,
        nexus_wake_events — all confirmed real in this session's own
        tool listing and lib/agent-chat.js) already exists for exactly
        one address. This phase generalizes that SAME real, proven
        pattern to each of the 4 named agents, dispatching a single
        real turn immediately rather than persistently switching state
        the way LM9's switch command does."
      depends_on: [LM9_deterministic_agent_switch_cli]
      does: >
        Saying 'hey chatgpt, <anything>' in any connected tab dispatches
        that one prompt to chatgpt specifically and returns its real
        answer, without changing which agent subsequent messages go to
        — a real, one-off address, distinct from a persistent switch.

    LM11_copilot_ollama_guardian_toggle:
      status: "OPEN — real, small, independently buildable. James:
        'toggle co-pilot to ollama and toggle the system for the
        co-pilot.' Checked directly: copilot_identity's real
        getAgent/setAgent action (confirmed in co-pilot's own tool list)
        already persists a default dispatch provider including ollama
        and 'auto' — the real gap is a CONFIRMED, single, deterministic
        toggle command (not a natural-language request) for exactly
        this, matching LM9's own deterministic-command goal."
      depends_on: [LM9_deterministic_agent_switch_cli]
      does: >
        One real, fixed command flips co-pilot between dispatching
        through ollama directly and dispatching through guardian's NCP
        agent mesh — no ambiguity about which mode is active.

    LM12_successful_prompt_caching:
      status: "OPEN — real, concrete mechanism identified, not yet
        built. James: 'successful prompts cached... using the
        crystallization memory to solidify in the index.' Checked
        directly this session: intelligence's real pattern-crystallising
        engine (the 'pattern crystallised' lines seen constantly in
        every boot log this session) already tracks recurring event
        sequences with confidence scores — but it tracks EVENT
        PATTERNS, not prompt/response pairs. This phase is a real,
        adjacent extension: when a dispatched job completes
        successfully (real, already-emitted guardian.job.complete),
        record the prompt shape + outcome into the same real
        crystallization store, so a repeated, similar prompt can be
        answered from a cached, verified-successful precedent instead
        of re-dispatching — not a rebuild of the crystallization engine,
        a new real input into it."
      depends_on: []
      does: >
        A prompt whose shape closely matches a past, successfully-
        completed one can be served from the crystallized cache first,
        cutting real dispatch time/cost for repeated requests.

    LM13_guardian_agents_folder_refactor:
      status: "OPEN — real, large, deliberately deferred. James: a real
        directory layout per agent (model.db, input.js, output.js,
        toolbox/, index.html moved from ui/agents/<name>/index.html).
        Directionally sound and consistent with LM1's per-system living-
        model idea, but this is an invasive restructure of guardian's
        4 currently-working userscripts (verified working, this
        session's own tool-call loop build touched all 4 directly) —
        needs its own phased, separately-verified pass per this
        codebase's own axioms, not folded into this map's other phases."
      depends_on: [LM1_spec_as_living_model]
      does: >
        Guardian's per-agent code organized the same real way LM1 wants
        every system organized — the largest single refactor in this
        map, intentionally sequenced last among the concrete items.

    LM14_components_store:
      status: "OPEN — real, not yet scoped in detail. James: 'a
        components store with components being made constantly, reused.'
        Real precedent partially exists: lib/agent-tools/index.js's own
        TOOLS map + the loom registry are both real, existing 'stores'
        of reusable pieces, but neither is exposed as a browsable,
        reusable catalog a builder would consult before making something
        new. Left open pending LM2/LM4 landing, since a real components
        store is naturally the union of 'what LM4's tool indexes already
        list' + 'what LM2's registry already tracks' rather than a
        third, separate mechanism."
      depends_on: [LM2_registry_as_hub_with_watchdog, LM4_per_system_tool_index]
      does: >
        A real, single place to check 'does something like this already
        exist' before building new — sourced from real, already-tracked
        data, not a new manually-maintained catalog.

    LM15_master_settings:
      status: "OPEN — real, not yet scoped. James: 'nexus to have a
        master settings for everything.' No real, existing candidate
        found this session to build on directly — each system currently
        has its own real settings table (confirmed via this session's
        own boot logs showing '[jaa] Loaded 70 rows — settings' per
        system). Left open pending a real design pass on whether this
        means one UNIFIED settings store (a migration) or one unified
        VIEW over each system's existing real settings (additive,
        safer) — the latter fits this codebase's own 'per-system data,
        backed up to cortex' principle better, not assumed here without
        that real design conversation."
      depends_on: []
      does: >
        One real place to see and change settings across every system,
        shape still to be decided (unified store vs. unified view).

    LM16_per_system_data_decay:
      status: "OPEN — real, not yet scoped. James: 'data in the systems
        folder decays based on timestamps... every system has its own
        data, but also backed up to cortex.' Cortex-backup already
        real and confirmed (this session's own event-log/ledger work
        writes to cortex-adjacent real tables). The DECAY half — data
        aging out of a system's own local store on a real timestamp
        policy — has no confirmed existing mechanism found this
        session. Left open pending a real policy decision (what decays,
        how fast, per system or uniform) before any code is written."
      depends_on: []
      does: >
        Local, per-system data ages out on a real policy once it's
        safely backed up to cortex, keeping each system's own store
        lean without losing history.

    LM17_downloads_manager_for_artifacts:
      status: "OPEN — real, plausible reuse identified, not yet
        verified. James: 'the artifacts for each agent uses the
        downloads manager in clearglass?' Checked directly this
        session: clear-glass's real per-provider download-capture
        mechanism (confirmed in every boot log — 'download-capture
        armed for claude/chatgpt/gemini/perplexity -> guardian
        :7820/api/intake') already exists and is real. Whether agent
        ARTIFACTS (structured outputs, not just downloaded files) fit
        the same real pipeline is the open question — plausible, not
        yet confirmed by reading how artifacts are currently captured
        vs. how downloads are."
      depends_on: []
      does: >
        If the fit is real (still to be verified): agent artifacts
        reuse the exact same real capture pipeline downloads already
        use, instead of a second, separate mechanism.

    LM18_atlas_map_each_system_first:
      status: "OPEN — the mapping pass that has to precede every other
        atlas phase (AX-014 draft, 'Map Before You Touch', applied to the
        atlas itself). James: 'We need a dynamic and system specific atlas
        per system. This isn't deterministic, map each system before
        making it and expand if needed.' Systems named: guardian, ollama,
        cortex, intelligence, diagnostic, clear-glass, loom, copilot
        (ollama was listed twice, so 8 unique); every other system is
        explicitly out of scope for now. Checked directly on the v0.39.150
        tree, 2026-09-19: the eight are not the same shape, which is
        exactly why one flat template will not do. guardian.spec has
        sections no other spec has (ncp_providers, raid_routing,
        seam_pipeline, command_index, ui); cortex.spec has organs;
        intelligence.spec has current_locations, storage, queue and
        rollout; copilot.spec has what_leaves_guardian. And 'diagnostic'
        is not one folder: diagnostic/ holds 3 files (nexus-diagnostic.js,
        nexus-heal-loop.js, interaction-contract.json), but its real
        footprint also spans clear-glass/src/diagnostic/,
        copilot/diagnostics.js and diagnostic-sweep.js, and
        data/diagnostic/ — while DOD2 in
        docs/2026-08-28-definition-of-complete-phasemap.spec cites
        service/nexus-diagnostic.js, which does not exist (service/ holds
        only the cortex, guardian and idearium service files). A system's
        boundary has to be established before it can be mapped."
      depends_on: []
      does: >
        A real survey ledger, one entry per system: its true boundary
        (every path that genuinely belongs to it, including data
        directories and files that live in other systems' folders), the
        shape of its existing spec, what already exists to build from,
        what is missing, and what the atlas will need to add or expand for
        that system. Nothing in LM19-LM26 is built for a system until its
        LM18 entry exists. When the atlas later finds a system deeper than
        the survey said, the survey entry is amended — 'expand if needed'
        — not ignored.

    LM19_atlas_spec_coverage_prerequisite:
      status: "OPEN — real, measured, and small relative to what depends
        on it. Checked directly (2026-09-19, loom's own spec-map.js run
        against this tree): 229 .spec files are tracked, and loom's
        listSpecs() sees 182 of them (177 in docs/, plus warp, cortex,
        idearium and copilot) because SPEC_DIRS is a hardcoded allowlist
        of six directories — docs, warp/spec, cortex/spec, idearium/spec,
        copilot/spec and bridge/spec, the last of which does not exist in
        this repo. Of the eight atlas systems only cortex and copilot are
        visible to loom; guardian, ollama, intelligence, clear-glass and
        loom's own spec are invisible (gap SM2, open since 2026-09-01),
        and diagnostic has no spec at all. phasemap-map.js's own SYSTEMS
        list is a second hardcoded list with the same kind of hole: it
        names seven of the eight atlas systems and has no ollama, so no
        phase can ever be filed under it. Separately, only ollama,
        clear-glass and loom carry AX-013's history, gaps and
        version_history sections; guardian, cortex, intelligence and
        copilot do not (intelligence has rollout, still_open and
        not_yet_done lists that say the same kind of thing in a different
        shape). An atlas that reads specs cannot be trusted while loom
        cannot see them."
      depends_on: [LM1_spec_as_living_model, LM18_atlas_map_each_system_first]
      does: >
        Every spec becomes discoverable without a hand-kept list (walk for
        */spec/*.spec plus docs/, so a new system is visible the moment it
        has a spec). Diagnostic gets its real spec once LM18 has fixed its
        boundary, and the stale service/nexus-diagnostic.js reference in
        DOD2 is corrected. AX-013 says its three sections are a SHOULD to
        be migrated opportunistically; for the eight atlas systems the
        atlas raises that to required, so guardian, cortex, intelligence
        and copilot gain history, gaps and version_history (intelligence's
        existing ad-hoc lists are migrated into them, not duplicated).
        Ollama is added to phasemap-map.js's SYSTEMS list, and both
        hardcoded lists are derived from the registry rather than kept by
        hand.

    LM20_atlas_schema_and_deterministic_seed:
      status: "OPEN — the schema every atlas is built from, defined by
        first building one atlas deterministically. James: 'Start with
        deterministic and use that as a schema, then the rest
        probabilistic using the schemas to build from.' Read as two layers
        with one hard rule between them (interpretation — James to
        confirm). FACTS layer: everything a script can read off the repo
        with no judgement — file tree, hashes, routes, commands, tools,
        events, node types, wires, dates. Regenerable, byte-stable, every
        entry carrying its source path and hash. PROSE layer: everything
        that needs understanding — summaries, purposes, edge cases, goals,
        how-to-use. Written by an agent (LM24), always grounded in and
        citing FACTS entries, never the other way round. The schema is
        derived from a real FACTS layer, not designed in the abstract, so
        its first instance must be a system whose facts can already be
        extracted reliably. Proposed seed: loom — it is the mapper, its
        own scanners (capability-map, event-taxonomy-map, phasemap-map,
        source-map, spec-map, wiring-gaps, dangling-report) already emit
        most FACTS categories, and its spec is one of the three that
        already carry AX-013 sections. Proposal only."
      depends_on: [LM18_atlas_map_each_system_first]
      does: >
        The atlas schema, plus one real seed atlas (FACTS layer) built
        against it. The schema is then stress-tested by expressing a
        second, very different system in it (proposed: guardian, the one
        with the most system-specific sections). Where it does not fit,
        the schema grows a new child section — it never gets a
        special-case exception and never gets flattened to make the fit
        easy.
      atlas_shape:
        prose_layer:   # probabilistic, written against the schema (LM24)
          - "Name of the system; a summary of what it does; what it is for"
          - "Intended purpose versus current purpose, and the edge cases
            between them"
          - "Each module: a summary, what it is for, what it currently
            does, what its goals are"
          - "How to use the system, capability by capability — plain
            language, readable by anyone, no jargon"
          - "Where it is at: phases and what is open, at systems-thinker
            level of detail"
        facts_layer:   # deterministic, regenerable, hash-anchored (LM21, LM22)
          - "File tree; data directories; contracts; schemas"
          - "Axioms; primitives; phases"
          - "API routes; CLI commands; agent tools; capabilities; events;
            node types"
          - "System components, then module ids, then each component of
            each module with id, directory, dates, hooks and wires"
          - "Each node, command and file: name, directory, date created,
            last modified, hash, node type, seams, and the full range of
            tags"
        history_layer:   # LM23
          - "History, versions, snapshots, revision history, and a
            calendar"
        release_layer:   # LM26
          - "Conditions for the atlas to be considered fully mapped, or at
            least acceptable for release, and the axiom that nothing the
            system can map is missing"
      recursion: >
        Same shape at every level (§5.6, structural self-similarity):
        system, module, component, node, tag. Each level carries its own
        id, path, facts, prose, history and children, and each parent's
        hash rolls up from its children's hashes. Nothing is a flat list
        where a child level exists, and nothing is static: a level can
        grow new child sections when the survey (LM18) finds a system is
        deeper than the schema said. 'Expand if needed' is a schema rule,
        not an exception.

    LM21_atlas_fact_extractors:
      status: "OPEN — mostly reuse, not invention. Checked directly: loom
        already ships the scanners this layer needs — capability-map.js
        (capabilities), event-taxonomy-map.js (events), phasemap-map.js
        (phases, with system tagging and status), source-map.js (source
        files), spec-map.js (specs), wiring-gaps.js and dangling-report.js
        (broken wires) — plus loom/schema/{component,hook,wire,seam}.js
        and its registry, and lib/agent-tools/ holds the agent tool
        folders. What does not exist is per-fact provenance: across the
        repo's node stores there are 791 node files and none carries a
        hash, a created or a modified field (only exported_at), and every
        one has an empty top-level tags list. Eight node-file kinds are
        stored on disk (command, capability, injection, component,
        command-seam, capability-seam, system, failure_mode) against the
        32 shared node types NODE-TAXONOMY.md defines; how those two lists
        relate must be reconciled in the atlas, not assumed. No loom
        scanner covers CLI commands as a per-system list, or data
        directories with their contracts. Dates need a rule: file mtime is
        useless here (3,857 of 3,859 files share one extraction timestamp)
        and git holds 11 commits from two baselines, so a git 'created'
        date only means 'first appeared in the baseline'."
      depends_on: [LM19_atlas_spec_coverage_prerequisite, LM20_atlas_schema_and_deterministic_seed]
      does: >
        Extractors, one per FACTS category, emitting content-hashed files
        into each system's atlas data directory. Running them twice on an
        unchanged tree gives byte-identical output (the determinism test).
        Every date carries its source and a confidence (git-first-add,
        spec-history, ledger, changelog, or unknown) and unknown is
        written as unknown, never guessed (§1.2). Each category also gets
        an independent second scan, used only to measure coverage for
        LM26.

    LM22_atlas_structure_ledger:
      status: "OPEN — the deepest, most recursive layer, and the one
        loom's registry already half-holds. James: system components, then
        module ids, then each component of each module with id, directory,
        dates, hooks and wires; then every node and command with file
        name, directory, date created, last modified, hash, node type,
        seams, and the full range of tags. Checked directly: loom's
        registry (loom/registry-components.js,
        loom/schema/{component,hook,wire,seam}.js,
        loom/data/registry.json) already models component, hook, wire and
        seam — a seam being a named boundary a component exposes or
        crosses, a hook being how you cross it. Module ids already exist
        in the modules section of every atlas system's spec except
        guardian's, which has none. 'Seam' means two different things here
        and the atlas must keep them apart: loom's seam (a crossing point)
        and SEAM the intent-compression and chunk pipeline (lib/seam/,
        guardian.spec's seam_pipeline, and the 39 command-seam and 39
        capability-seam node files). Tags: every node's top-level tag list
        is empty today, so 'the full range of tags' has to be defined
        (payload tags, system, module, node type, seam, status, phase)
        before it can be recorded."
      depends_on: [LM21_atlas_fact_extractors]
      does: >
        One ledger per system in the same recursive shape: system, then
        modules (ids from the spec, reconciled with the loom registry and
        with what is actually on disk), then components (id, directory,
        created, last modified, hash, hooks, wires), then nodes, commands
        and files (name, directory, node type, dates with source, hash,
        seams, tags). Every parent's hash is derived from its children's
        hashes, so a change anywhere shows all the way to the top — that
        is what makes 'updated with any changes' checkable instead of
        asserted.

    LM23_atlas_history_versions_calendar:
      status: "OPEN — the sources exist but are scattered and shallow, and
        nothing joins them. James: history, versions, snapshots, revision
        history, with a calendar. Checked directly: git holds 11 commits
        over two dates (2026-09-17 and 2026-09-19) from two baselines
        (v0.39.146 and v0.39.147), so everything earlier is not in this
        repo's git; data/ledger holds 295 tracked daily files, all dated
        2026-09-16; per-version 'what shipped' lives in lib/version.js's
        inline comments, loom/lib/changelog.js (append-only, GET/POST
        /api/changelog), data/changelog-snapshot.json, docs/CHANGELOG.md
        and docs/SESSION-CHANGELOG.md; per-component movement lives in
        loom's /api/history; ingest revisions with sha256 identity and
        parent-diff lineage live in loom's /api/revisions; three of the
        eight specs carry their own AX-013 history; and version snapshots
        arrive as zip archives (nexus-v0_39_149, nexus-v0_39_150) whose
        git lineages were only joined into one graph on 2026-09-19 (merge
        6a8faac)."
      depends_on: [LM21_atlas_fact_extractors, LM22_atlas_structure_ledger]
      does: >
        One per-system history that merges all of those sources into a
        single dated, append-only timeline, and a calendar index keyed by
        date: what changed (per system, module and component), which
        version it shipped in, and which snapshot holds it. Snapshots are
        first-class entries (identity hash, parent, date, source archive)
        using loom's ingest lineage rather than a second mechanism (§5.4,
        versions persist across the entire project). Gaps in the record
        are written as explicit 'no record before X' rows — a calendar
        that silently begins on 2026-09-17 would imply nothing happened
        earlier.

    LM24_atlas_prose_layer:
      status: "OPEN — the probabilistic half, and the half James wants
        anyone to be able to read. James: name, what it does, what it is
        for, intended purpose versus current purpose and edge cases; each
        module's summary, purpose, what it does now, and goals; how to use
        every capability; 'not jargon, something anyone can read', at
        systems-thinker level of detail. Checked directly: guardian.spec's
        own purpose line says guardian is the only system that touches AI
        providers and everything else requests work through it — so this
        layer is written by dispatching through guardian's existing
        agent-dispatch and agent-mesh path, not by a new AI-calling
        mechanism, and LM4/LM5 (per-system tool index, co-pilot zoom)
        point at the same sources. Intended versus current purpose is not
        a matter of taste: intended comes from the spec's purpose and
        history, current comes from the FACTS layer, and the difference
        between them is the edge-case and gap list (which feeds AX-013
        gaps)."
      depends_on: [LM20_atlas_schema_and_deterministic_seed, LM21_atlas_fact_extractors, LM22_atlas_structure_ledger]
      does: >
        Every prose statement is written against the schema, cites the
        FACTS entry ids it rests on, and carries provenance (agent, date,
        hash of the facts it read) and a status of inferred or verified. A
        statement whose cited facts change hash is flagged stale, never
        silently rewritten. 'Not jargon' becomes testable: a glossary for
        the system terms (seam, hook, wire, compartment, NCP, RAID and so
        on) and one worked how-to example per capability, run against the
        live system wherever that is safe (§1.1, nothing exists until
        proven).

    LM25_atlas_living_update:
      status: "OPEN — this is what makes the atlas a living spec instead
        of a document. James: 'This atlas is the repository's map, updates
        with any changes, a living spec of the system.' Checked directly:
        this depends on LM2 (registry as a hub with a file-watching
        watchdog), which is itself still open — loom's 7 hand-edited files
        in loom/maps/ are exactly the manual process LM2 says it would
        replace. The atlas does not get a second watcher: it subscribes to
        whatever LM2 lands, and until then runs on demand and in the
        precommit path (scripts/precommit-check.js already blocks commits
        that add a component with no registry wire or a spec that is never
        registered — the natural gate for 'atlas out of date')."
      depends_on: [LM2_registry_as_hub_with_watchdog, LM21_atlas_fact_extractors, LM23_atlas_history_versions_calendar, LM24_atlas_prose_layer]
      does: >
        A change to any file under a mapped system re-runs that system's
        extractors, updates the FACTS layer and its hashes up the tree,
        flags dependent prose as stale, appends a dated entry to that
        system's history and calendar (append-only, as
        loom/lib/changelog.js already is), and records the atlas's own
        revision. Nothing is regenerated silently over a human edit: prose
        has an owner and a diff.

    LM26_atlas_completeness_and_release_gate:
      status: "OPEN — the finish line, written as measurable conditions
        instead of a feeling, in the spirit of
        docs/2026-08-28-definition-of-complete-phasemap.spec. James:
        'Conditions for it to be considered complete or at least
        acceptable for release', plus the axiom 'Nothing missing that the
        system can map.' Two tiers, because James asked for both:
        release-acceptable (the first list) and fully mapped (the first
        list plus the second). The axiom is drafted below as AX-015,
        beside the still-unapplied AX-014."
      depends_on: [LM19_atlas_spec_coverage_prerequisite, LM20_atlas_schema_and_deterministic_seed, LM21_atlas_fact_extractors, LM22_atlas_structure_ledger, LM23_atlas_history_versions_calendar, LM24_atlas_prose_layer, LM25_atlas_living_update]
      does: >
        'Is the atlas done' gets a real answer computed by a check, not a
        review: one command reports each condition pass or fail with its
        evidence. The same check gates a release and is what LM25 re-runs
        after every change.
      candidate_axiom: >
        AX-015 (draft) — Nothing Missing That the System Can Map. Every
        system's atlas accounts for everything that system's own scanners
        can find. An item is either in the atlas, or it is listed in that
        atlas's unmapped section with the reason it could not be mapped
        and the date it was last tried. An atlas may never be silent about
        something that exists: a gap that is written down is a finding, a
        gap that is not written down is a false statement about the system
        (§1.2). The atlas is the repository's map and every change that
        touches what it maps updates it; a change that lands without the
        atlas reflecting it is an incomplete change. AX-014 says read the
        map before touching; AX-015 is its other half — the map has to be
        worth reading. Drafted only, not applied to any axiom set; like
        AX-014 it needs a real yes/no from James.
      release_acceptable:
        - "All 8 systems have an atlas that validates against the LM20
          schema: every required section present, or marked not-applicable
          with a reason. None blank."
        - "FACTS coverage: for each category (file tree, axioms,
          primitives, API routes, CLI commands, agent tools, capabilities,
          events, node types, schemas, data directories, contracts) the
          mapped count equals what the independent second scan finds.
          Anything not mappable is in the unmapped section with a reason."
        - "Determinism: the extractors run twice on an unchanged tree
          produce byte-identical FACTS."
        - "Every prose claim cites at least one FACTS entry. No orphan
          claims, and zero stale claims at release time."
        - "Loom's spec discovery sees all 8 system specs: SM2 is closed
          and diagnostic has a spec."
        - "History has no silent beginning: the calendar opens with
          explicit 'no record before' rows, and every version snapshot
          present in the repo appears in it."
        - "The atlas names the commit and version it describes (HEAD hash
          and package version) and lands as a real commit — no atlas
          change skips the commit or the .git."
      fully_mapped_additionally:
        - "Recursion is real: system, module, component, node and tag
          levels are present for every system, with no flat list where a
          child level exists."
        - "Living update proven end to end: a deliberate change to a
          mapped file updates FACTS, rolls hashes up to the root, flags
          the stale prose and adds a calendar entry, with no manual step."
        - "Root hash verifies: recomputing the root from the tree matches
          the recorded one."
        - "Cold-reader test: someone who has never used NEXUS reads one
          system's atlas and correctly answers a fixed set of questions
          (what it is for, how to do a given task, what is broken) — the
          same bar LM4 sets for the tool index."
        - "Executable how-to: every documented capability's example was
          run against the live system, or is marked unrunnable with the
          reason."
        - "The atlas maps itself: loom's atlas includes the atlas
          machinery (schema, extractors, watcher) as components — the
          mapmaker is on the map."

  recommended_start: >
    LM1 (spec-as-living-model) first — every other phase either directly
    depends on it or is naturally easier once it exists (LM4's tool index
    and LM14's components store both want a real per-system source of
    truth to read from). LM9 (deterministic switch CLI) and LM10 (per-
    agent wake words) are independently buildable RIGHT NOW with zero
    dependencies and real, already-proven mechanisms to extend — the
    fastest concrete wins if James wants working features before the
    foundational LM1/LM2 work lands. LM12 (prompt caching) is also
    independent and immediately buildable. LM7/LM8 (agent-mesh intent
    programming, full pipeline wiring) are the real "system codes
    itself" end state this map is building toward, but both correctly
    depend on LM6 (who creates contracts) landing first — authorizing
    autonomous contract creation before deciding who's allowed to do it
    would invert the real safety ordering this codebase's own RAID
    governance already enforces everywhere else.

    ATLAS PHASES (LM18-LM26, added 2026-09-19 — mapped only, nothing
    built): LM18 (map each system first) and LM19 (make every spec visible
    to loom, give diagnostic a spec) are buildable now and gate everything
    else. LM20 fixes the schema by building one deterministic atlas first
    (proposed seed: loom, James to confirm); LM21-LM23 build the FACTS and
    history layers from it; LM24 writes the readable PROSE layer against
    that schema through guardian; LM25 makes it live and depends on LM2's
    watchdog; LM26 is the release gate and carries the AX-015 draft.
    AX-014 and AX-015 are both still drafts awaiting a yes/no from James.
