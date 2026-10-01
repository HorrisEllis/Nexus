spec:
  meta:
    name:     idearium-agent-ready-master
    version:  1.5.0
    date:     2026-10-01
    release:  0.39.287 (base) → 0.39.288 (PF1–PF5 built) → each later phase its own patch
    uuid:     nexus-idearium-agent-ready-master-phasemap-v1-0000-2026-1001-jamesbrooks-001
    owner:    idearium · lib · cortex.self-heal · guardian · loom · docs
    status:   "MAPPED 2026-10-01 — PF1–PF5 built (0.39.288); CT1 built (0.39.289); 1.1.0 adds James's later messages of the day; 1.2.0 records his answers to the open decisions + UI10; everything else open"
    axioms:   docs/AXIOMS-v3.1.md — §3.1 bottom-up, §3.3 map before build, §8.6 reuse before build, §0.3 nothing lost,
              §1.2 nothing silently fails, §17.5 every output has provenance, §10.1 one write authority per data type.
    origin: >
      James, 2026-10-01: "include, everything else from today and map it all, phase it all, make sure to keep it all
      sovereign, and use node types and databases for data. update all the maps, atlas', .specs, and loom component
      registry. maybe also performance optimization. running really bad. also the settings in idearium. it takes
      forever to load the repos on boot … maybe move some of the agent settings to the agents tab, not sure but it needs
      to be rethemed to fit the rest of page. and needs collapse. map it all, dont miss anything you've need to get done
      still from earlier. so close to being able to use you, as an agent inside idearium."
      Earlier the same day: History + Save into the Manage menu; desktop environment options into the button of that
      name, the desktop borderless; failure modes and the fault taxonomy wired into idearium through routes, tied to the
      failure-mode field; Iterate in the Files Manage menu as compounding layers (a verified chunk only edited when
      meaningful or additive); the compartment's hat agent wired to the COS build surface; the component registry able
      to move components and the code follow, added to the architecture doc.

    origin_1_1_0: >
      James, later 2026-10-01 (verbatim): "adding a idea or phase, creates a phasemap, but doesn't create the code. when
      its blocked, i need to be able to do something about that. what about combining idea with phase tab. love the
      phase tab. hate the phasemap being in the files, like need to be able to sort it or change the file structure,
      the component registry, but also, need to have the component registry a chunk in the chunking, number 11 …
      please get the agents building more stable. ollama has been known to cut off blocks, unless you fixed that. one
      more thing, can you make the code tab more about the code? maybe migrate the search to the files tab, or
      something? just getting cramped, and overwhelming to try to use, i also want the panel and the work surface panel
      to be their own panels, have the pan always open when its doing something, and have a little tab in the side of
      the screen to click on to expand the it again. if it gets cut off, what about injecting the cut off part into the
      agent, and having it finish it. like the compounding. also i feel the chunking is immensly powerful for data
      injestion, or my intuition is ringing the leverage bell … the agents need to be able to find any context, with as
      little injected as possible. i also want you to give the agents, access to clearglass, but more fluid. like
      anything that it doesn't know, will query the project first, all the memory, and then clearglass to search the
      web." — and: "last to map, just to map so it's not lost. please … clearglass is supposed to support multiple
      accounts of the same website, maybe add private windows also. we also need to have agent tools for the files,
      like merging zips, running patches, etc. like if i have a patch or some loose files from you, and then i can drag
      and drop into the project and have it safely merged, like github. like I need this to build full projects. maybe
      rebuild the promote to spec menu. like use the systems architecture, the components registry and node
      architecture for the default, then need like, web application stack, android app, desktop application, literally
      everything i could need for fiverr and automating projects, upwork, or any way to get money … then i want the run
      button to let me run the code base in a isolated ssh or, cli. likke the codebase copies, or maybe uses the push or
      pull commands to copy it into the desktop envirement. also want way more options for envirements." — and: "also can
      you add a wrapper around clearglass so i can drag it around and also have the url search bar dynamically change
      size with the window size."

  rules_for_every_phase:
    sovereign: >-
      Local first. Nothing a phase builds needs a network service to work: providers are routes on the one guardian
      dispatch, ollama is the floor, every store is on this machine (jaa tables under data/, node files in Guardian's
      layout). A phase that would need an outside service names it and keeps working without it.
    data: >-
      Every record a phase persists is a node type (lib/node-schemas schema.<type>, the lib/node-export.js envelope,
      Guardian's nodes/<type>/<id>.<type> layout) or a row in a jaa table with one write authority (§10.1). No new
      free-form JSON file (N24). A JSON file kept for an outside format says why.
    surface: "API first, then the CLI (idearium/cli), then the UI — the UI only reads what the API serves."
    registry: "every new module lands in loom/maps with its real require/consumer wires; atlas + SPEC-REGISTRY updated."
    gates: >-
      James, 2026-10-01: "i really ylike gates every step, with verification when needed, negative and shadow space
      reasoning." Every step a phase adds passes a step gate (lib/step-gate.js — rule nodes, a refusal or an empty
      output is blocked, never 'done'), is verified where it can be (a test, a parse, a probe), and declares what it
      expects so the absence is a gap (lib/shadow.js — negative and shadow space: what a step did NOT produce is
      recorded and becomes a liminal item). No phase writes around a gate.

  found:
    - >-
      Boot (James's log, 0.39.286): idearium is ready at +5 s; at +20 s the nexus-self sync starts and, for ONE changed
      core file, re-ingests all of nexus/core — ~2,000 chunk .md files and ~2,000 .chunk nodes written, the old ~2,000
      of each deleted, a 20 MB manifest re-serialised — 45 s of "systems" on his disk (61 s total at 16:13). Measured
      here on the real tree: the spec step held the loop 3–4 s by itself; the first repo list after a boot then parsed
      every manifest whole (core's ~20 MB) to throw the content away. The repo list and the settings console waited
      behind both.
    - "vitals (0.39.286): tests/spec-engine-yaml-import.test.js still asserted 10 blocks — the registry block made 11."
    - >-
      Failure-mode substrate exists, unjoined: cortex/self-heal/fault-taxonomy.js (sole writer of fault_taxonomy),
      lib/fault-log.js (fault_log, richly tagged, causedBy), cortex/self-heal/index.js (failure_modes, read by cortex
      GET /api/failure-modes), cortex/self-heal/failure-mode-forensics.js (causal context onto the row), schemas
      lib/node-schemas/schema.failure_mode + schema.fault; and on the idearium side chunk.failureMode (free text) and
      lib/pipeline-routing.js classify() (empty · truncated · refused · timeout · provider-down · rate-limit · login ·
      unknown). Nothing carries a chunk's failure into fault_log, and nothing reads the taxonomy before a build.
    - >-
      Iterate/baseline substrate exists: BS2/BS3 file states + baseline deviation (0.39.280), the Manage workbench
      (idearium/ui/js/file-manage.js, N25), file versions through versionium (idearium/ui/js/file-versions.js — its
      "history" is injected as an extra editor tab by a MutationObserver, apart from save and manage ▾).
    - >-
      Registry substrate: idearium/repo/architecture.js (components/hooks/wires/routes/cli/events, toNodes → the repo's
      nodes/<type>/<id>.<type>), loom/scanners/source-map.js (idFor), loom/scanners/dangling-report.js (orphans).
    - >-
      The repo Settings tab is the settings console in an iframe (idearium/ui/js/repo-environment.js
      repoSettingsConsoleEmbed → settings.html?embed=1): its own chrome, no collapse, the agent's "who answers" and
      "tools" cards beside compartment/desktop settings (N16 maps the iframe's removal).

  phases:
    M0_map:
      layer: foundation
      status: DONE
      files: [docs/2026-10-01-idearium-agent-ready-master-phasemap.spec, docs/SPEC-REGISTRY.spec]
      does: "This map, registered; every open item from today and before named here or pointed at its own map."

    # ── layer 0 — performance (boot, sync, reads) ─────────────────────────────────────────────────────────────────
    PF1_sync_names_its_slow_step:
      layer: foundation
      status: DONE (0.39.288)
      files: [idearium/repo/nexus-self.js]
      does: "syncSystem times read · spec · sources · materialize · pipeline · annotate per system; the sync log carries them."
      proof: tests/modules/test-nexus-self-incremental.test.js NI-002 (steps on the result)
    PF2_yielding_ingest:
      layer: library
      status: DONE (0.39.288)
      files: [idearium/spec-engine/index.js]
      does: >-
        ingestFilesAsSpecAsync — the same ingest split into begin · per-file · finish, yielding every 50 files; the sync
        one is the same three steps without the yields (one code path). On the default export the API uses.
      proof: NI-001 (same chunks as the sync ingest; on the default export)
    PF3_snapshot_names_changed_files:
      layer: library
      status: DONE (0.39.288)
      files: [lib/nexus-self/store.js, idearium/api/index.js]
      does: >-
        snapshot stats carry changed (content moved, not just mtime) and removed paths; the sync log prints them, so the
        file that churns on every boot of James's machine is named by the next boot.
      proof: NI-004
    PF4_manifest_meta_sidecar:
      layer: library
      status: DONE (0.39.288)
      files: [idearium/spec-engine/index.js]
      does: >-
        saveSpec writes manifest.meta.json (chunk content stripped, stamped with manifest.json's size+mtime);
        loadSpecMeta and listSpecs take it on a cold read while the stamp matches, the full parse otherwise.
      proof: NI-005 (taken while it matches; a manifest written some other way is parsed whole)
    PF5_in_place_spec_update:
      layer: library
      status: DONE (0.39.288)
      files: [idearium/spec-engine/index.js, idearium/repo/index.js, idearium/repo/nexus-self.js]
      does: >-
        updateIngestedSpecAsync: same file set → only the chunks whose content moved are rewritten (same chunk, file and
        node id), one save, nodes written for those chunks only; RepoLayer.specUpdatedInPlace follows the root hash. A
        different file set → the whole re-ingest (yielding) and the D2 purge, as before. Measured on the real core:
        spec step 4.3 s → 0.21 s, longest loop stall 3.0 s → 0.27 s.
      proof: NI-002, NI-003; test-nexus-specs-and-ideas-cleanup SC-002 (the change now adds a file)
    PF6_boot_sync_yields_to_the_person:
      layer: library
      status: OPEN
      depends_on: [PF5]
      files: [idearium/api/index.js (the nexus-self scheduler), lib/resource-state (existing pressure reading)]
      does: >-
        The first sync waits until the UI's first repo list has been served (or 60 s), and any sync skips its cycle
        while the machine is under memory pressure — shown as "deferred" with the reason (merges J7 of
        docs/2026-10-01-work-visibility-job-reuse-phasemap.spec).
      proof: "a stub pressure reading defers the cycle with a reason; the first list is served before the sync starts"
    PF7_pipeline_scoped_to_changes:
      layer: library
      status: OPEN
      depends_on: [PF5]
      files: [idearium/repo/import-pipeline.js]
      does: >-
        The import pipeline is already incremental for chunks (§35); intel:build and parse re-run over every file
        (2.8 s of 5 s for one changed core file). Scope them to the changed files and merge into the previous indexes.
      proof: "one changed file of a 2,000-file repo: intel rebuild touches that file only; same indexes as a full run"
    PF8_settings_console_one_cheap_read:
      layer: api
      status: OPEN
      files: [idearium/api/index.js settings.console, idearium/ui/settings.html]
      does: >-
        settings.console reads guardian's provider list once per request (not 2× per repo), returns timing in `blind`,
        and the page renders the nav from the repo rows before the detail read finishes.
      proof: "17 repos: one provider read; the nav paints before the detail"
    PF9_boot_memory_census:
      layer: foundation
      status: OPEN
      files: [cortex/memory/jaa-db.js callers, lib/decay-*]
      does: >-
        cortex loads cfr_tension_history (12k rows) and event_log (27k rows) whole at boot, in three processes. Census
        what each reader needs; tail-load or decay the rest (nothing deleted — compacted, §0.3). Versionium's boot stall
        (orchestrator /cfr/field timing out at 3 s) measured in the same pass.
      proof: "boot RSS per process before/after; the readers' tests unchanged"
    PF10_clear_glass_err_aborted_9000:
      layer: interface
      status: OPEN
      files: [clear-glass/src/]
      does: "Clear Glass loads :9000 before orchestrator answers → ERR_ABORTED; wait on /health with a stated retry."
      proof: "a late orchestrator: the window loads after it answers, the wait is logged"

    # ── layer 1 — data: node types and databases ──────────────────────────────────────────────────────────────────
    DT1_persistence_census:
      layer: foundation
      status: OPEN
      depends_on: [M0_map]
      files: [lib/node-schemas/, tests/modules/ (a census test)]
      does: >-
        Task #21 + N24 as one census: every thing a system persists — each jaa table, each JSON file written — gets its
        node type or its stated outside reason; a new JSON writer fails the census test. Starts with guardian (jobs,
        sessions, economy) and idearium (repos, specs' manifest — manifest.meta.json included, named as a cache view).
      proof: "the census lists every writer; each has a type or a reason; a planted new writer fails it"
    DT2_failure_mode_field:
      layer: library
      status: OPEN
      depends_on: [DT1_persistence_census]
      files: [lib/fault-log.js, lib/pipeline-routing.js, idearium/spec-engine/index.js, idearium/spec-engine/chunk-dispatch.js]
      does: >-
        Task #22 + N14. A chunk that fails gets a structured failureMode beside the free text: { class (classify()),
        provider, model, jobType, hop, attempt, causedBy (the hop/job id) } and one lib/fault-log.js record (system
        idearium, component = the chunk's comp_id, causedBy the job) — fault-taxonomy.js's raiseFriction stays the one
        writer of fault_taxonomy (§10.1). The trajectory (what led to it) is the routing hops already on the chunk plus
        failure-mode-forensics' causal context.
      proof: "a stub provider failing with a refusal: chunk.failureMode.class 'refused', one fault_log row tagged with it"
    DT3_failure_modes_routes_and_preflight:
      layer: api
      status: OPEN
      depends_on: [DT2_failure_mode_field]
      files: [idearium/api/index.js, idearium/cli/index.js, lib/fault-log.js]
      does: >-
        GET /api/faults?repo=&chunk=&jobType=&class= (fault_log), GET /api/failure-modes (cortex's, proxied — not a
        copy), GET /api/fault-taxonomy; `idearium faults [list|show|taxonomy]`. Pre-flight ("before each action, check
        for relevant failure modes"): a chunk build reads the known faults for its jobType and provider — the prompt
        names them (bounded, deduped), and learned routing (RG5) already lowers a provider that keeps failing.
      proof: "routes over seeded fault_log rows; a build prompt for a jobType with a known refusal names it"
    DT4_registry_block_to_nodes:
      layer: library
      status: OPEN
      depends_on: [DT1_persistence_census]
      files: [idearium/spec-engine/index.js, idearium/repo/architecture.js]
      does: >-
        The registry block's built text (block 11) is parsed into the same node envelopes toNodes() writes, so a spec's
        own registry and the code's projection compare node for node (drift = the difference).
      proof: "a registry chunk with 3 components → 3 .component nodes; a drift report against the code projection"
    DT5_pipeline_routing_spec:
      layer: foundation
      status: OPEN
      files: [lib/pipeline-routing.spec]
      does: "spec-drift lists 'pipeline-routing: no spec' — the module's own spec (modes, classes, breaker, learned)."
      proof: "spec-drift no longer lists it"
    DT6_node_store:
      layer: foundation
      status: OPEN
      does: "N0–N18 of docs/2026-09-29-nex-node-store-phasemap.spec — the NEX node store; referenced, not duplicated."

    # ── layer 2 — library: how work compounds ─────────────────────────────────────────────────────────────────────
    CI1_compounding_iterate:
      layer: library
      status: OPEN
      depends_on: [DT2_failure_mode_field]
      files: [lib/file-states.js (BS2/BS3), lib/step-gate.js, idearium/api/index.js, lib/node-schemas/]
      does: >-
        A verified chunk/file becomes a locked baseline (.baseline node: hash, tests that proved it, who). Iterate builds
        the next layer on it: an additive change passes the gate; a deletion or rewrite of baseline lines needs a stated
        reason + a passing test or a reviewer, else it is held as a draft (.change_proposal node), never applied
        silently. Each layer records what it built on (causedBy the baseline).
      proof: "additive diff passes; a rewrite with no reason is held as a draft; with reason + green test it applies"
    RM1_registry_driven_moves:
      layer: library
      status: OPEN (PLANNED in docs/architecture-spec/architecture-spec.spec until built)
      depends_on: [DT4_registry_block_to_nodes]
      files: [lib/registry-move.js (new), idearium/repo/architecture.js, loom/scanners/source-map.js]
      does: >-
        Move a component in the registry → plan(): the file move plus every import rewritten, computed from the wires
        (deterministic, no model); dry-run first; apply as one staged change; re-project the architecture; run the
        repo's tests. The agent is called only for refs the wires cannot see (dynamic requires, string paths) — named
        in the plan. Code stays the truth; the registry is the lever.
      proof: "a fixture repo: move lib/a.js → core/a.js, both consumers rewritten, tests green, nodes re-projected"
    HC1_hat_agent_to_cos_build:
      layer: library
      status: OPEN
      files: [lib/repo-hat.js, lib/cos-bridge.js, idearium/api/index.js]
      does: >-
        The compartment's hat agent can run a build on the COS surface: its changes land in the compartment's VM
        workspace (the branch repo of 0.39.27x), the build/test runs there, the result comes back as a job with
        provenance — the same guardian job as any other dispatch.
      proof: "a stub COS: a hat job writes into the VM workspace and returns the run's exit + output"
    J_work_visibility_and_reuse:
      layer: library
      status: OPEN
      does: "J0–J7 of docs/2026-10-01-work-visibility-job-reuse-phasemap.spec (J7 folded into PF6)."

    # ── layer 3 — agent: using an outside coding agent inside idearium ─────────────────────────────────────────────
    AG1_coding_agent_provider:
      layer: library
      status: OPEN — decision for James (which account the CLI runs on)
      depends_on: [DT2_failure_mode_field, CI1_compounding_iterate]
      files: [lib/agent-providers.js, guardian/lib/jobs.js, idearium/spec-engine/chunk-dispatch.js]
      does: >-
        "so close to being able to use you as an agent inside idearium." A provider that runs a coding-agent CLI the
        person has installed (e.g. Claude Code, `claude -p`, in the repo's workspace) as a guardian job: the job's
        prompt is the chunk/phase, its output is diffs through the CI1 gate, its failures go through DT2. A local
        process on the person's own install and account — openly an automated agent, never presented as a person.
        Routing treats it as one more provider (fallback chain, breaker, learned scores).
      proof: "a stub CLI: a phase job runs in the workspace, its diff goes through the gate, the hop is on the chunk"

    # ── layer 4 — interface ────────────────────────────────────────────────────────────────────────────────────────
    UI1_history_and_save_in_manage:
      layer: interface
      status: OPEN
      files: [idearium/ui/js/app.js (the editor tabs), idearium/ui/js/file-versions.js, idearium/ui/js/file-manage.js]
      does: >-
        "history" leaves the editor tab row (no more MutationObserver injection): Version history is an item of the
        manage ▾ menu, and save sits right next to manage ▾, one button style (ide-tab-btn).
      proof: "static check: no injected history tab; the manage menu lists Version history; save precedes manage"
    UI2_desktop_environment_menu:
      layer: interface
      status: OPEN
      files: [idearium/ui/js/repo-environment.js, idearium/ui/js/app.js, idearium/ui/css/]
      does: "The desktop environment options live in the 'Desktop environment' button's menu; the desktop window is borderless."
      proof: "static check + chromium probe: one menu, no frame"
    UI3_settings_tab_retheme_collapse:
      layer: interface
      status: OPEN
      depends_on: [PF8_settings_console_one_cheap_read]
      files: [idearium/ui/settings.html, idearium/ui/js/repo-environment.js, idearium/ui/js/app.js]
      does: >-
        The repo Settings tab in the page's own theme (the idearium tokens, not the console's chrome), each card
        collapsible (state kept per viewer), and the agent's cards — who answers, tools, hat, prompt blocks — moved to
        the Agents tab, which is where the agent is used. Starts the iframe's removal (N16).
      proof: "chromium probe: cards collapse; agent cards render under Agents; every write reaches its route"
    UI4_w7_open_items:
      layer: interface
      status: OPEN
      does: >-
        W7 items 1, 3, 4 of docs/2026-09-30-idearium-coding-flow-phasemap.spec: architect spec builder on
        css/nexus-theme.css; the Plan header names the map and groups by layer; Clear Glass Providers page with a
        guardian widget per provider.
    UI5_work_surface_from_contracts:
      layer: interface
      status: OPEN
      does: "N26 of the node-store map — the work surface / TV UI rendered from interaction contracts."

    # ── release, and what waits on James ───────────────────────────────────────────────────────────────────────────
    R1_release_per_phase:
      layer: foundation
      status: "OPEN — 0.39.288 released with PF1–PF5"
      does: "each phase: version bump, CHANGELOG, atlas, loom wires, SPEC-REGISTRY, tests registered, the full run."

    # ── 1.1.0 — James's later messages, 2026-10-01 ────────────────────────────────────────────────────────────────
    CT1_cut_replies_are_finished:
      layer: library
      status: DONE (0.39.289)
      files: [lib/reply-continuation.js, ollama/lib/ollama-client.js, ollama/config.js, idearium/spec-engine/chunk-dispatch.js, copilot/server.js, lib/repo-agent.js]
      does: >-
        "if it gets cut off, what about injecting the cut off part into the agent, and having it finish it." The cut
        part is kept, its tail shown back, the same agent continues, the parts stitched (overlap and a re-opened fence
        removed), up to N rounds; still cut is said. Root causes found in the Ollama path: a 45 s TOTAL timeout on a
        non-streaming call (James's "ollama · 46s · blocked: empty"), a thinking model's answer read as '' (now retried
        with think:false), done_reason 'length' dropped, num_predict 2048. Now streamed with an IDLE timeout under a
        10-minute cap; copilot's and the repo agent's waits follow it.
      proof: tests/modules/test-reply-continuation.test.js 7/7; test-ollama-activity 5/5
    BK1_blocked_is_actionable:
      layer: interface
      status: OPEN
      depends_on: [CT1_cut_replies_are_finished, DT2_failure_mode_field]
      files: [idearium/ui/js/app.js (phases board), idearium/api/index.js (repo.phases.build)]
      does: >-
        "when its blocked, i need to be able to do something about that." A blocked phase build shows its failure class
        (DT2) and the actions that fit it: continue (CT1, when cut), retry with another agent or model (the route),
        edit the ask and retry, open it in the Agent tab, mark it done by hand. Each action is a route + CLI first.
      proof: "a blocked build (stub): each action reaches its route and the phase leaves blocked"
    BK2_phase_build_writes_code:
      layer: library
      status: OPEN
      depends_on: [BK1_blocked_is_actionable, CI1_compounding_iterate]
      files: [idearium/api/index.js, idearium/repo/phases.js, lib/repo-inject.js]
      does: >-
        "adding a idea or phase, creates a phasemap, but doesn't create the code." A phase build's reply is parsed for
        files (the plan's extraction, W2) and lands as staged .inject proposals on the work surface — code, not only the
        phasemap status line. Nothing written outside the gate (CI1).
      proof: "a stub agent reply with two files → two staged proposals tied to the phase"
    UI6_idea_and_phases_one_tab:
      layer: interface
      status: OPEN
      files: [idearium/ui/js/app.js]
      does: >-
        "what about combining idea with phase tab. love the phase tab." One tab: the idea and its four lanes on top,
        the phases board under it; adding to a lane or the board feeds the same phasemap.
      proof: "chromium probe: one tab, both surfaces, a new lane entry can become a phase"
    UI7_phasemaps_out_of_files_and_tree_ops:
      layer: interface
      status: OPEN
      depends_on: [RM1_registry_driven_moves]
      files: [idearium/ui/js/app.js (Files), idearium/repo/phases.js]
      does: >-
        "hate the phasemap being in the files, like need to be able to sort it or change the file structure, the
        component registry." The repo's phasemap is shown in Phases, not as a loose file in the Files tree (it stays a
        real file — §0.3 — under a docs path the tree folds away). The tree sorts (name, layer, state, size, recent) and
        restructures through the registry: drag a file or folder → RM1's plan → staged move with imports rewritten.
      proof: "the tree hides the phasemap and sorts; a drag produces RM1's dry-run plan"
    DT4b_registry_chunk_in_repo_chunking:
      layer: library
      status: OPEN
      depends_on: [DT4_registry_block_to_nodes]
      files: [idearium/repo/import-pipeline.js, idearium/repo/architecture.js, idearium/spec-engine/index.js]
      does: >-
        "need to have the component registry a chunk in the chunking, number 11." Spec templates have it since
        0.39.286 (block 11). An imported repo's chunking gains it too: after its files are chunked, one registry chunk
        (architecture.js's projection, written as nodes) — so every repo, built or imported, carries its own registry.
      proof: "an imported fixture repo has a registry chunk whose nodes match the projection"
    UI8_code_tab_is_code:
      layer: interface
      status: OPEN
      files: [idearium/ui/js/app.js, idearium/ui/js/file-manage.js]
      does: >-
        "can you make the code tab more about the code? maybe migrate the search to the files tab … just getting
        cramped, and overwhelming." Code shows the code (editor, symbols, used-from); search by meaning moves to Files
        with the tree; tools fold into one menu.
      proof: "static check: search lives in Files; the Code tab renders editor + symbols only"
    UI9_plan_and_work_surface_panels:
      layer: interface
      status: OPEN
      files: [idearium/ui/js/plan-panel.js, idearium/ui/js/work-surface.js, idearium/ui/css/]
      does: >-
        "i also want the panel and the work surface panel to be their own panels, have the pan always open when its
        doing something, and have a little tab in the side of the screen to click on to expand the it again." Two
        docked panels; each opens itself while work runs (a work.* event, J0) and collapses to an edge tab.
      proof: "chromium probe: a running build opens the panel; collapse leaves an edge tab that reopens it"
    CX1_context_cascade:
      layer: library
      status: OPEN
      depends_on: [DT3_failure_modes_routes_and_preflight]
      files: [lib/repo-context.js, lib/code-intel/, lib/agent-memory.js, lib/agent-tools/tools/clear-glass/search-engine.js, lib/agent-tools/tools/query/]
      does: >-
        "the agents need to be able to find any context, with as little injected as possible … anything that it doesn't
        know, will query the project first, all the memory, and then clearglass to search the web." Answer to "the
        agents have access to this also right?": partly — the repo agent gets keyword retrieval over the repo's chunks
        (lib/repo-context.js) and the tools its scope lists; the code-intel index (files, chunks, symbols, used-from) is
        not yet a tool it can ask. Build: one `find_context` tool, asked by the agent (not pre-injected): 1 the
        project's code-intel index (symbol, used-from, chunk), 2 memory (agent memory, chat ledger, fault log, notes),
        3 Clear Glass web search — each step only when the previous found nothing, every hit with its source.
        Injection shrinks to the task + a one-line pointer to the tool.
      proof: "a stub agent asks for a symbol → code-intel hit; an unknown term → memory, then a web search (stubbed)"
    DI1_chunking_for_data_ingestion:
      layer: library
      status: OPEN
      depends_on: [DT1_persistence_census]
      files: [idearium/repo/import-pipeline.js, lib/zip-ingest.js, lib/node-schemas/]
      does: >-
        "i feel the chunking is immensly powerful for data injestion." The chunker generalised past code: documents,
        CSV/JSON datasets, chat exports, mail, PDFs — each chunk a node with its source, glyph and links, searchable by
        CX1. Every ingest is a node of what came in and when (provenance).
      proof: "a CSV and a chat export ingest into chunk nodes; CX1 finds a row by meaning"
    CG1_clear_glass_accounts_and_private:
      layer: interface
      status: OPEN
      files: [clear-glass/src/]
      does: >-
        "clearglass is supposed to support multiple accounts of the same website, maybe add private windows also." One
        session partition per account per site (named, switchable per tab), and private windows (in-memory partition,
        nothing written). Guardian providers can bind a job to an account.
      proof: "two tabs of one site in two partitions keep separate cookies; a private window leaves nothing on disk"
    CG2_clear_glass_drag_wrapper_and_fluid_url_bar:
      layer: interface
      status: OPEN
      files: [clear-glass/src/ (the frameless window's chrome and its toolbar)]
      does: >-
        James (verbatim): "can you add a wrapper around clearglass so i can drag it around and also have the url search
        bar dynamically change size with the window size." The frameless window gets a drag region (the tab strip and
        the toolbar's empty space, -webkit-app-region: drag; buttons and the URL field no-drag), and the URL bar flexes
        with the window (flex: 1 1 auto, a min and max width) instead of a fixed width.
      proof: "chromium probe at 3 window widths: the URL field's width follows; the drag region is present and buttons stay clickable"
    UI10_debug_and_intelligence_one_tab:
      layer: interface
      status: OPEN
      files: [idearium/ui/js/app.js]
      does: >-
        James (verbatim): "also what about consolidating the debug and intelligence tabs?" One tab: what the repo IS
        (intelligence — the code-intel index, symbols, used-from, graphs) and what is WRONG with it (debug — failures,
        the fault log from DT2/DT3, diagnose runs) side by side, one search over both; the tab bar loses one entry.
      proof: "chromium probe: one tab renders both; every former action still reaches its route"
    GL1_gate_verify_fix_loop:
      layer: library
      status: OPEN
      depends_on: [DT2_failure_mode_field, CI1_compounding_iterate]
      files: [lib/step-gate.js, lib/shadow.js, lib/seam/queue.js, idearium/spec-engine/chunk-dispatch.js, lib/reply-continuation.js]
      does: >-
        James (verbatim): "gate, verify, check, if failed, send back and fix it, then back through." One loop for every
        agent step: gate (step-gate rules) → verify (test / parse / probe, where one exists) → check (the shadow: what
        was expected and is missing) → on a failure, the SAME agent gets its output back with the exact failure (the
        failing check's message, the missing item, the gate rule) and fixes it → back through the gate. Bounded rounds;
        each round recorded with its failure class (DT2); after the bound, the route's next provider (or a person —
        BK1). Pieces exist: the seam retry ladder already re-prompts on a failed detection, step gates block, the shadow
        names absences, continuation finishes cuts; this joins them into one loop with the failure fed back verbatim.
      proof: "a stub agent whose first output fails a parse check: it receives the parse error, its second output passes, both rounds recorded"
    UM1_nexus_understands_james:
      layer: library
      status: OPEN
      depends_on: [DT1_persistence_census, CX1_context_cascade]
      files: [lib/agent-memory.js, clear-glass/src/downloads/chat-ledger.js, lib/node-schemas/]
      does: >-
        James (verbatim): "I at some point want nexus to understand me the way chatgpt. like my patterns, observations,
        everything thats useful, and then agents can querythat data also." A person model, his own: observations about
        how James works and what he wants (preferences, recurring asks, rules he has set, words he uses, decisions he
        made and why), each a node with its source quote and date, learned from his messages, chats (the chat ledger)
        and decisions — never guessed without a source. Agents query it through CX1 (memory step); James can read,
        correct and delete any of it. Local only — it never leaves the machine.
      proof: "three of his messages → observation nodes, each citing its quote; an agent query returns the matching one"
    IL1_spec_library_as_ideas:
      layer: library
      status: DONE (0.39.290)
      depends_on: [FT1_file_tools_merge_patch_drop, DI1_chunking_for_data_ingestion]
      files: [idearium/api/index.js, lib/zip-ingest.js, idearium/spec-engine/index.js]
      does: >-
        James (verbatim), sending his spec library (171 files, 23 duplicate groups): "my goal is to build these,
        eventually. im, the idea guy." Drop a zip of specs → each unique document (by content hash, duplicates folded
        with every path kept) becomes an Idearium idea with its spec attached (.md/.spec as text, .docx/.pdf extracted,
        diagrams kept as attachments), tagged by family (NEXUS lineage · product · personal · diagram) and linked to the
        repo systems it already overlaps. Stored on this machine only (data/, never committed): a personal or IP
        document is never pushed anywhere. An executable inside the zip is listed, never imported.
      proof: "the zip → N ideas with no duplicates; a .docx's text is searchable; the .exe is listed and skipped"
      built: >-
        0.39.290 — lib/spec-library.js (scan: duplicates folded with every path, zips in zips, programs refused, a
        project folder one unit, family by the document's own name; convert: Markdown ##/# headings, BLOCK banners,
        plain); idearium/lib/spec-library-import.js (ideas + specs, the zip and originals kept, the
        idearium_spec_library table, idempotent); PUT /api/spec-library/import, GET /api/spec-library; `idearium
        spec-library import <zip>`; ui/spec-library.html (Welcome → Import specs). importSpec now completes in memory
        and saves once (the library: >110 s for 87 documents → 8.6 s for all 150); the chunker keeps two sections with
        the same heading. James's real zip: 468 files read, 150 unique, 186 duplicates folded, 0 fidelity failures.
        tests/modules/test-spec-library.test.js 8/8.
    SW1_spec_workshop:
      layer: interface
      status: OPEN
      depends_on: [IL1_spec_library_as_ideas, CX1_context_cascade, UM1_nexus_understands_james]
      files: [architect/src/ui/spec-builder.html, idearium/lib/idea-workbench.js, idearium/ui/js/app.js, lib/spec-library.js]
      does: >-
        James (verbatim): "Maybe we have a spec workshop, for building and editing, specs. using the spec builder. ai
        assited or manual, The spacial void. adjustable, levels of ambitoiun higher is more outside the box. the user
        is the idea generator, you can help improve creatitive with open loops, outside the box questions, what ifs,
        d20 cross domain dice for ideation. A random invention to reverse causal chain like for example: a workbench
        that automatically clears off, and sets up the placement for your tools. like shit like that, or inspiration
        from nexus, like inspire myself using what ive built." One workshop over the spec library: open any spec (or a
        blank one) in the spec builder (architect's, rethemed — W7 item 1), edit by hand or with an agent section by
        section (the GL1 loop), on the spatial canvas ("the spacial void" — RHEON VOID v2 in his library is the design
        source). An AMBITION dial (1 grounded … 5 outside the box) sets how far the agent's suggestions reach. James
        stays the idea generator; the agent only feeds him: open loops (what this spec leaves unanswered), outside-the-
        box questions, what-ifs, a d20 cross-domain roll (pick a random domain — biology, music, logistics, games … —
        and map one of its mechanisms onto the spec), a reverse causal chain (start from an invented end-state — "a
        workbench that clears itself and lays out your tools" — and walk back to what would have to exist), and
        inspiration from his own work (a random spec, idea or Nexus component from the library and the repo, CX1).
        Each prompt lands as a lane entry on the idea (the workbench lanes: brainstorm · problem · expand · improve),
        never written into the spec without him taking it.
      proof: "a spec opens in the workshop; ambition 1 vs 5 changes the prompt sent; a d20 roll names a domain and maps one mechanism; a taken suggestion lands as a lane entry"
    FT1_file_tools_merge_patch_drop:
      layer: library
      status: OPEN
      depends_on: [CI1_compounding_iterate]
      files: [lib/agent-tools/tools/, lib/zip-ingest.js, idearium/api/index.js, idearium/ui/js/app.js]
      does: >-
        "agent tools for the files, like merging zips, running patches, etc. like if i have a patch or some loose files
        from you, and then i can drag and drop into the project and have it safely merged, like github." Drop a zip, a
        .patch/.diff, or loose files onto a repo → a merge proposal: per-file diff against the current tree, new / changed
        / conflicting / identical, a three-way merge where a base is known (versionium), conflicts shown, nothing
        applied until accepted; applied as one versionium commit with the drop as its provenance. The same as agent
        tools (merge_zip, apply_patch, stage_files) and CLI.
      proof: "a patch applies cleanly; a zip with one conflicting file is held with the conflict shown; undo restores"
    TP1_promote_to_spec_templates:
      layer: library
      status: OPEN
      files: [idearium/spec-engine/templates.js, idearium/spec-engine/templates/, idearium/ui/js/app.js]
      does: >-
        "rebuild the promote to spec menu. like use the systems architecture, the components registry and node
        architecture for the default, then need like, web application stack, android app, desktop application,
        literally everything i could need for fiverr and automating projects, upwork." The promote menu as a catalogue:
        the default is genesis (systems architecture + registry + nodes); then project templates — web app (front,
        API, DB, auth, deploy), landing site, REST/GraphQL API, Android app, desktop app (Electron/Tauri), CLI tool,
        browser extension, scraper/automation bot, data pipeline, Discord/Telegram bot, Chrome-free static site —
        each a genesis extension with its own blocks, file tree and tests, so a client job starts from a real skeleton.
      proof: "each template seeds a spec whose build_order tree passes the template's own test"
    EN1_run_isolated_and_environments:
      layer: library
      status: OPEN
      depends_on: [HC1_hat_agent_to_cos_build]
      files: [lib/cos-bridge.js, lib/cos-run.js, versionium/, idearium/repo/]
      does: >-
        "i want the run button to let me run the code base in a isolated ssh or, cli. likke the codebase copies, or
        maybe uses the push or pull commands to copy it into the desktop envirement. also want way more options for
        envirements." Run copies the repo into an isolated environment by versionium pull (no shared folder), opens a
        shell (in-page terminal / SSH) there, and runs. Environment choices: the COS VM, a container, a plain sandbox
        dir, a remote host over SSH; per-language images (Node, Python, Android SDK, .NET …); push the result back as a
        proposal (FT1). Where it lives (James, 2026-10-01): "id say in the cli and git tab, if thats the same though i
        feel the sync and ci tab would be good, especially to test." — the Sync & CI tab: run, shell and the
        environment picker beside the CI runs, so a run is also a test; SSH host keys in the Clear Glass vault.
      proof: "Run on a fixture: the copy is pulled into a sandbox, the command's output streams, the tree is untouched"

  decisions_answered_by_james_2026_10_01:
    - >-
      AG1 + CI1 — James: "yeah, never bypass." The coding-agent provider never writes past the CI1 gate; every write is
      a proposal through the step gates.
    - >-
      RAID — James: "raid is going to be the final middle line, but not until both end points are done." The dead RAID
      default in chunk-dispatch stays off (documented, not turned on); RAID joins the route as the middle line once both
      ends — the dispatch side (routing, gates, continuation) and the result side (verification, the work surface,
      CI1) — are built. Mapped here as a later phase, not before.
    - >-
      CG1 — James: "it can pick its own, especially for fallback rounting, but preferebly the same account per hat, or
      even url. chatgpt can stretch infinitly if you branch a chat to another chat, I just want consistence, but nexus
      is for that." A job may pick an account itself (fallback routing especially), but sticks to one account per hat,
      or per URL: the hat's bound account first, the same account for the same conversation URL every time; another
      account only when that one is down or limited — and the switch is recorded on the job.
    - >-
      EN1 — James: "id say in the cli and git tab, if thats the same though i feel the sync and ci tab would be good,
      especially to test." Run, shell and environments live in the Sync & CI tab; SSH keys in the Clear Glass vault.
  decisions_waiting_on_james:
    - "PF6 — the first-sync delay (proposed: after the first repo list, or 60 s, whichever comes first)."

## ADDENDUM 2026-10-01 — PF1–PF5 built (0.39.288)
# Measured on the real tree (sandbox store): core update with an unchanged file set — spec 4.3 s → 0.21 s, longest
# event-loop stall 3.0 s → 0.27 s, total 10.4 s → 6.3 s (the rest is the pipeline: PF7). A cold repo list reads the
# meta sidecar instead of the 20 MB manifest. The vitals check's 10-block assertion moved to 11 (registry last).
# tests/modules/test-nexus-self-incremental.test.js 5/5; test-nexus-specs-and-ideas-cleanup 8/8.

## ADDENDUM 2026-10-01 — 1.1.0, James's later messages mapped; CT1 built (0.39.289)
# CT1: Ollama streamed with an idle timeout (10-minute cap), thinking-only replies retried with think:false, a cut reply
# finished by the same agent (lib/reply-continuation.js) in the bridge and in chunk dispatch. Mapped, not built: BK1,
# BK2, UI6–UI9, DT4b, CX1, DI1, CG1, CG2, FT1, TP1, EN1. The rule to quote James is in docs/CLAUDE.md.

## ADDENDUM 2026-10-01 — 1.2.0, James's answers
# AG1/CI1 never bypass the gate · RAID the final middle line once both ends are built · CG1 an account may be picked by
# the job, especially for fallback routing · EN1 in the Sync & CI tab · a rule for every phase: gates every step,
# verification when needed, negative and shadow space (lib/step-gate.js, lib/shadow.js) · UI10 Debug + Intelligence
# in one tab.

## ADDENDUM 2026-10-01 — 1.3.0
# CG1 answered: an account per hat, or per URL — consistency first, another only on fallback, recorded. GL1 the
# gate → verify → check → fix → back-through loop. UM1 Nexus understands James (observations with their source quotes,
# queryable by agents, his to correct).

## ADDENDUM 2026-10-01 — 1.4.0
# IL1: James's spec library becomes ideas in Idearium (local, deduplicated, by family). Catalogue written for him; the
# nearest product to done is ModuleForge (cli/decompose.js + the component registry already do its core).

## ADDENDUM 2026-10-01 — 1.5.0
# IL1 built (0.39.290): James's spec library imports — 150 unique documents from his real zip, as ideas with specs.
# SW1 the spec workshop mapped in his words (spec builder, ambition dial, open loops, what-ifs, d20 cross-domain dice,
# reverse causal chain, inspiration from his own work). Found: tests/modules/spec-import.test.mjs fails on the base
# too (expects the pre-2026-09 intent→purpose renaming); it is in neither run-all nor known-gaps — left as found.
