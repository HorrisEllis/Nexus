spec:
  meta:
    name:     cli-data-code
    version:  1.6.0   # 1.6.0: LS1–LS4 the agent's writing live in the Code tab and the work surface (0.39.356) · 1.5.0: PB1–PB5 a clicked phase actually builds (0.39.355) · 1.4.0: SY2 cos is its own system (0.39.341) · was 1.3.0
    date:     2026-10-05
    release:  0.39.310 (base) → 0.39.311
    uuid:     nexus-cli-data-code-phasemap-v1-0000-2026-1005-jamesbrooks-001
    owner:    idearium.ui · idearium.api · cli · cortex · every system's own store
    status:   "MAPPED 2026-10-05; nothing built here yet. 0.39.311 moved the Settings test onto Clear Glass's driver. 1.1.0 (0.39.312): HG1–HG7 (defects found on the way), the session inventory, systems: and value: on every phase. 1.2.0 (0.39.313): HG7 and HG8 done. 1.3.0 (0.39.314): SY1 the 15 systems, HG9; every declared system is one of the 15"
    axioms:   docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §5.9 every system is sovereign,
              §10.1 one write authority per data type, §10.2 projections are derived, §10.3 competing truths are a
              failure, §9.1 RAID is the write authority for cross-system requests, §4.3 security, §0.3 nothing lost.
    origin: >
      James, 2026-10-05: "Don't just agree. Give input. No playwright. ClearGlass only. I want the agent cli tab to be
      the end point for all cli commands. Each system needs to be in charge of its own data. Not the data folder in the
      root or cortex. Cortex is the book keeper, with the associative lattice. Like the code tab in idearium should
      probably be for new code in the repo. Like a full enterprise grade section for the agents code generation, and
      uncommited change, the work surface."
      The ideas, the direction and the calls are James's. The input below is the coder's, said so it can be argued with.

  found:
    cli: >-
      The Agent tab's CLI (idearium/ui/js/app.js AGENT_CLI_HELP / AGENT_CLI_COMMANDS) is 31 commands hard-coded in the
      page. cli/nexus.js is already a unified CLI — `nexus <command>` and `nexus /<system> <args>` passing through to
      guardian/cli.js, cockpit/cli.js, cortex, idearium/cli/index.js, copilot/cli.js, ollama — but cos/cli/index.js,
      nexus-healer/cli/index.js and the 27 cli/*.js tools are not behind it. guardian/commands/*.command (49 nodes) and
      clear-glass's GET /cli/commands (live route introspection) describe routes, not CLI verbs.
    data: >-
      cortex/memory/jaa-db.js is ONE store at data/cortex/memory that modules in every system write (~70 tables, ~40
      writers — lib/context-atlas.js's own count). lib/ledger-store.js already mirrors each system's ledger into <system>/data/ledger. idearium
      (idearium/lib/data-dir.cjs), guardian, versionium, loom keep part of their state in their own folder; the rest sits
      in the root data/<system>/ or in cortex. docs/2026-09-11-sovereign-node-architecture-phasemap.spec P5
      "data_folder_completion" (OPEN) already says it: "cortex becomes the real bookkeeper it's meant to be rather than
      the primary store … the largest, highest-risk phase … per system, not attempted in one sweep."
      docs/META-SYSTEM-AND-SUBSYSTEM-SPECS.md maps each system's memory needs.
    code_tab: >-
      Today: the Code tab is search and chunk cards (0.39.273). The work surface (idearium/ui/js/work-surface.js,
      GET /api/repos/:uuid/worksurface — a projection, 0.39.284) sits under the plan panel; the agent's pending code
      (.inject nodes: review/auto, apply/reject/revert) is in Settings → Agent and the Agent tab's /injects; git's
      uncommitted changes are in Sync & CI; staging (docs/2026-09-28-staging-self-heal-phasemap.spec: code-edit
      stage/promote) is a third place a change can wait. Four places, three stores, for "code not yet in the repo".
    law: >-
      docs/AXIOMS-v3.1.md §4.1 says "UI is tested via Playwright". James: "No playwright. ClearGlass only." and
      clear-glass/src/driver/glass.js (0.39.263): "Replaces Playwright." The law text is behind the system; only James
      changes a law — proposed, not edited (Q1).

  input:
    cli: >-
      Yes to one endpoint — no to the browser running shell commands. The Agent tab should dispatch a DECLARED verb,
      never a command line: each system declares its CLI verbs as `.command` nodes it owns (name, args with types,
      route, side effects, whether it writes), the Agent tab reads the union, and `/<system> <verb> …` goes to that
      system's own route through RAID (§9.1) — args as data, no shell, no spawn from a page, every call ledgered.
      cli/nexus.js reads the same declarations, so terminal and Agent tab cannot drift. A verb that writes or deletes
      asks first. This is more work than piping text to cli/nexus.js and it is the only version that is safe (§4.3).
    data: >-
      Agree with the direction, push on two points. (1) "Bookkeeper" must mean a CATALOG, not a copy: cortex records
      what exists, who owns it, its hash, count and lineage, plus the associative lattice over it — never a second
      copy of a system's rows (§10.2/§10.3; a copy is a competing truth). (2) Cross-system reads are the real cost: ~40
      modules WRITE the shared store (lib/context-atlas.js's count); how many read another system's tables is not
      counted yet — DS1's catalog measures it before anything moves. After the move they go through the
      owner's contract (a route or a declared read API) or through cortex's catalog to find the owner — so every
      move is a contract change, one system at a time, behind a read shim that warns on every old-path read (§1.2),
      then the shim removed. Not one sweep. Start with the system with the fewest foreign readers, not the biggest.
    code_tab: >-
      Yes — and the hard part is not the UI, it is one source of truth for "pending code". Four views over three stores
      (injects, git working tree, staging) is §10.3 waiting to happen: the same change shown pending in one and applied
      in another. The Code tab should be the ONE review surface, reading all three, each change labelled with where it
      lives, and an action that moves it along ONE path: proposed (inject) → staged → applied (working tree) → committed.
      Generation runs (what each agent is writing now, with the build context it was sent — 0.39.309) and provenance per
      file belong there. Search stays, as one category. Categories, like Settings: Changes · Generation · Search.

  phases:
    CL1_commands_declared_by_their_system:
      layer: foundation
      systems: [core, guardian, idearium, copilot, cortex, ollama-bridge]
      value: { score: 4, cost: M, for: [foundation, daily-use], why: "a verb exists once, owned by its system; terminal and Agent tab cannot drift" }
      status: OPEN
      path: 'step 3 — each system''s verbs, owned by it (declutter 2026-10-09)'
      depends_on: []
      files: [lib/command-registry.js, guardian/commands, idearium/cli/index.js, cos/cli/index.js, copilot/cli.js, cli/nexus.js]
      does: >-
        Each system declares its CLI verbs as `.command` nodes it owns (lib/node-export.js envelope: name, system, args
        with types, route, writes, confirm, help). lib/command-registry.js reads the union; cli/nexus.js dispatches from
        it, so a verb exists once. A verb with no route is a gap, said.
      proof: "every verb cli/nexus.js and the Agent tab list comes from a .command node; one with no route is reported"
    CL2_the_agent_tab_is_the_endpoint:
      layer: ui
      systems: [idearium, cortex]
      value: { score: 4, cost: M, for: [daily-use, safety], why: "every command from one place, through RAID, never a shell" }
      status: OPEN
      path: 'step 3 — every system''s CLI from one place in Idearium (declutter 2026-10-09)'
      depends_on: [CL1_commands_declared_by_their_system]
      files: [idearium/ui/js/app.js, idearium/api/index.js]
      does: >-
        `/<system> <verb> args` in the Agent tab: /help lists every system's verbs from the registry (not the hard-coded
        31, which become idearium's own declarations); the call goes to the owner's route through RAID, args as data, no
        shell; a verb that writes asks first; every call is ledgered with its result.
      proof: "a verb from each system runs from the Agent tab; a writing verb asks; nothing spawns a shell; each call is in the ledger"
    DS1_cortex_the_catalog:
      layer: foundation
      systems: [cortex, intelligence, core]
      value: { score: 5, cost: M, for: [foundation, safety], why: "nothing can move home safely until every table has a named owner" }
      status: 'LATER — off the path — data moves home, bootstrap and test hygiene come after the loop (declutter 2026-10-09)'
      status_before: OPEN
      depends_on: []
      files: [cortex/memory/jaa-db.js, lib/context-atlas.js, intelligence/lattice/associative-lattice.js]
      does: >-
        Extends sovereign-node P5. Cortex keeps a CATALOG: every table/store, its owning system (§10.1), its location,
        count, hash, lineage — and the associative lattice over it. context-atlas finds data through the catalog, then
        reads from the owner. Built before any move, so a move is a catalog edit plus a contract, never a lost table.
      proof: "the catalog names an owner for every table in the shared store; an unowned table is a gap"
    DS2_one_system_moves_home:
      layer: foundation
      systems: [cortex]
      value: { score: 4, cost: XL, for: [foundation, ownership], why: "each system owns its data; repeated once per system" }
      status: 'LATER — off the path — data moves home, bootstrap and test hygiene come after the loop (declutter 2026-10-09)'
      status_before: OPEN
      depends_on: [DS1_cortex_the_catalog]
      files: [cortex/memory/jaa-db.js, "<system>/data/"]
      does: >-
        One system at a time (the one with the fewest foreign readers first): its tables move into <system>/data/, a
        read shim on the old path warns on every read (§1.2) and names the reader, foreign readers move to the owner's
        contract, then the shim goes. Nothing lost (§0.3): the old rows are archived, the catalog records the move.
      proof: "after a move, no module reads the old path (the shim's warnings are zero over a full test run), the catalog points at the new home"
    CT1_one_pending_change_path:
      layer: service
      systems: [idearium, core]
      value: { score: 5, cost: M, for: [quality, safety], why: "one truth for code not yet in the repo; no change shown pending and applied at once" }
      status: OPEN
      path: 'step 2 — proposed → staged → applied → committed, one lifecycle (declutter 2026-10-09)'
      depends_on: []
      files: [lib/repo-inject.js, lib/code-edit.js, idearium/repo/work-surface.js, lib/repo-git.js]
      does: >-
        One lifecycle for code not yet in the repo: proposed (inject) → staged → applied (working tree) → committed, each
        state owned by exactly one store, each move one call. The work surface projection reads all of them and labels
        each change with where it lives.
      proof: "a change cannot be shown pending in one view and applied in another; each move is recorded"
    CT2_the_code_tab:
      layer: ui
      systems: [idearium, clear-glass]
      value: { score: 4, cost: M, for: [daily-use], why: "one place to review, apply and follow the agents' code" }
      status: OPEN
      path: 'step 2 — check first: CT3/CT5 (0.39.349–351) made the Code tab the work surface (declutter 2026-10-09)'
      depends_on: [CT1_one_pending_change_path]
      files: [idearium/ui/js/code-tab.js, idearium/ui/js/work-surface.js]
      does: >-
        The Code tab is new code in the repo, in categories: Changes (every pending change, diffed, with
        apply / reject / revert / stage / commit, from CT1), Generation (what each agent is writing now, the build context
        it was sent, attempts, verdict), Search (today's tab). Provenance on every file. Verified in Clear Glass.
      proof: "in Clear Glass: a proposed change appears under Changes, applying it moves it to applied, the Generation pane shows the running build"


    # ── Found during this session, pre-existing, not caused by it — mapped so none is lost (§1.2, §4.2) ─────────
    HG1_components_store_map_parses:
      layer: foundation
      systems: [idearium, loom, core]
      value: { score: 2, cost: S, for: [quality], why: "a phasemap that does not parse is invisible to every tool that reads maps" }
      status: 'LATER — off the path — data moves home, bootstrap and test hygiene come after the loop (declutter 2026-10-09)'
      status_before: OPEN
      depends_on: []
      files: [docs/2026-09-27-components-store-and-atlases-phasemap.spec]
      does: "It fails YAML at line 24 (\"expected ':' after a mapping key\"), unchanged since before 0.39.308. Fix the line; the content stays."
      proof: "the file parses as YAML"
      conditions:
        - { says: "the file parses as YAML", check: { kind: command, run: "node -e \"require('js-yaml').load(require('fs').readFileSync('docs/2026-09-27-components-store-and-atlases-phasemap.spec','utf8'))\"" } }
    HG2_loom_bootstrap_rejections:
      layer: foundation
      systems: [loom]
      value: { score: 3, cost: L, for: [quality, foundation], why: "460 rejected declarations are 460 places the self-model is wrong" }
      status: 'LATER — off the path — data moves home, bootstrap and test hygiene come after the loop (declutter 2026-10-09)'
      status_before: OPEN
      depends_on: []
      files: [loom/bootstrap.js, loom/maps/]
      does: >-
        A from-scratch bootstrap exits 1 with 460 rejections on 0.39.309's base (mostly loom.wire-endpoints-exist:
        page scripts and hand-mapped files with no hooks). 0.39.309–310 fixed the ones their maps touched (spec-engine
        and app.js / agent-blocks.js boundary hooks). The rest are classified by cause and fixed per map.
      proof: "a from-scratch bootstrap reports 0 rejections"
    HG3_bv09_the_detector_and_files:
      layer: library
      systems: [core, idearium]
      value: { score: 3, cost: S, for: [quality], why: "a failing test that everyone learns to ignore hides the next real failure" }
      status: 'LATER — off the path — data moves home, bootstrap and test hygiene come after the loop (declutter 2026-10-09)'
      status_before: OPEN
      depends_on: []
      files: [tests/modules/test-build-verify.test.js, lib/seam/detector.js]
      does: "test-build-verify BV-09 (\"the detector judges a file chunk as a file\") fails on 0.39.307's base and since. Root-cause it: the test or the detector, said which."
      proof: "test-build-verify passes 11/11"
      conditions:
        - { says: "test-build-verify passes", check: { kind: tests, run: "node tests/modules/test-build-verify.test.js" } }
    HG4_scripts_inside_the_sandbox:
      layer: foundation
      systems: [cortex, idearium, core]
      value: { score: 3, cost: S, for: [safety], why: "a benchmark or probe script wrote a spec into data/cortex twice this session" }
      status: 'LATER — off the path — data moves home, bootstrap and test hygiene come after the loop (declutter 2026-10-09)'
      status_before: OPEN
      depends_on: []
      files: [lib/test-sandbox.js, scripts/]
      does: >-
        lib/test-sandbox.js arms only for test processes (tests/, *.test.js, a marker). A script under scripts/ that
        loads a store writes the real tree unless it sets NEXUS_TEST_SANDBOX itself (scripts/bench-file-prompt.js does,
        since 0.39.311). Decide per script — benchmarks and probes sandboxed by default, maintenance scripts not — and
        make the default structural, not remembered.
      proof: "running every scripts/bench-* and probe-* leaves data/ and idearium/data unchanged"
    HG5_bootstrap_keeps_registration_times:
      layer: foundation
      systems: [loom]
      value: { score: 2, cost: S, for: [quality], why: "a registry diff should show what changed, not 8,700 timestamps" }
      status: 'LATER — off the path — data moves home, bootstrap and test hygiene come after the loop (declutter 2026-10-09)'
      status_before: OPEN
      depends_on: []
      files: [loom/bootstrap.js, loom/schema/index.js]
      does: >-
        Every bootstrap rewrites registeredAt on every entry, and the scanner numbers wires (source.wire.N) so a new file
        renumbers the rest. 0.39.309–310 kept unchanged entries' registeredAt by hand. Make it the bootstrap's own rule:
        an entry identical but for its timestamp keeps the old one; wire ids from their endpoints, not a counter.
      proof: "bootstrapping twice with no code change leaves registry.json byte-identical"
    HG6_scanner_status_vocabulary:
      layer: foundation
      systems: [loom]
      value: { score: 2, cost: S, for: [quality], why: "a phase marked BUILT read as pending — finished work looks unstarted" }
      status: 'DONE — built 0.53.0 — one-roadmap OR1 (_answerOf, PS-013) (declutter 2026-10-09)'
      status_before: OPEN
      depends_on: []
      files: [loom/scanners/phasemap-map.js]
      does: >-
        The scanner counts a phase done only when its status starts with DONE (or ✓ / ← DONE / COMPLETE). BC1, BC2, VP7
        said "BUILT (…)" and read as pending until 0.39.312 rewrote them. Either BUILT joins the vocabulary (counted
        across every map first, as the scanner's own header did for DONE) or the maps' convention is written down.
      proof: "every phase whose status says it is built reads done"
    HG7_the_law_and_clear_glass:
      layer: foundation
      systems: [clear-glass, core]
      value: { score: 3, cost: S, for: [ownership], why: "the law says Playwright; James and the code say Clear Glass" }
      status: 'DONE (0.39.313) — James: "Yes. No playwright. That''s literally what clearglass was born from."'
      depends_on: []
      files: [docs/AXIOMS-v3.1.md]
      does: "AXIOMS §4.1 \"UI is tested via Playwright\" → \"UI is tested in Clear Glass (clear-glass/src/driver/glass.js)\". A law changes only on his word; proposed, not edited."
      proof: "§4.1 names Clear Glass, with a dated addendum quoting him"


    HG8_raid_phases_belong_to_cortex:
      layer: foundation
      systems: [cortex, loom]
      value: { score: 2, cost: S, for: [quality], why: "a RAID phase showed on the intelligence repo's tabs while RAID's code is cortex's" }
      status: 'DONE (0.39.313) — James: "Yes."'
      depends_on: []
      files: [lib/nexus-self/systems.js]
      does: >-
        lib/nexus-self/systems.js mapped loom's `raid` tag to the intelligence repo, but RAID's code is
        cortex/core/raid/ (§5.2: "Every system connects to RAID (cortex/core/raid/router.js)"), so a RAID phase (CL2,
        VP2) showed on intelligence's Phasemap and Phases tabs. The tag moves to cortex.
      proof: "systemForLoomTag('raid') is cortex; CL2 shows on the cortex repo's Phasemap tab"

    HG9_persist_history_diff:
      layer: foundation
      systems: [loom]
      value: { score: 2, cost: S, for: [quality], why: "loom's phase history must catch a real status change, or the roadmap's past is wrong" }
      status: 'LATER — off the path — data moves home, bootstrap and test hygiene come after the loop (declutter 2026-10-09)'
      status_before: OPEN
      depends_on: []
      files: [loom/scanners/phasemap-map.js, loom/test/phasemap-map.test.js]
      does: >-
        loom/test/phasemap-map.test.js "persistHistory() correctly diffs against a seeded prior state" fails on 0.39.313
        (HEAD, before SY1) and on older bases — pre-existing, found while running every phasemap consumer for SY1.
        Root-cause: the test's seeding or persistHistory's diff, said which.
      proof: "loom/test/phasemap-map.test.js passes 13/13"

    SY1_fifteen_systems:
      layer: foundation
      systems: [loom, idearium, core]
      value: { score: 4, cost: S, for: [quality, foundation], why: "one list of systems; a phase belongs to a system Idearium has, never to a tag" }
      status: 'DONE (0.39.314) — James: "There is only 15 systems. Not 27. Any system that''s in idearium is a system, nothing more."'
      depends_on: []
      files: [lib/nexus-self/systems.js, loom/scanners/phasemap-map.js, tests/modules/test-loom-phasemap.js]
      does: >-
        lib/nexus-self/systems.js is the one list: orchestrator, cortex, guardian, idearium, architect, diagnostic, eravos,
        intelligence, ollama-bridge, versionium, copilot, loom, clear-glass, components, core. loom's phasemap scanner
        kept its own 27-entry SYSTEMS list (agent, chunk, raid, gemini, tablet, bridge, cos, warp, emergence, economy,
        nexstore, …). Now every tag — declared or guessed — resolves to one of the 15 through systems.js: a system's
        name is itself; a known alias goes to its owner (raid, chunk, replay, snapshot → cortex; agent → guardian; gemini
        → copilot); any other tag goes to the system that owns that directory (lib, cos, warp, emerge, docs, scripts,
        cli → core). The tag as written is kept on the phase (`tags`) for provenance. forSystem() accepts a tag and
        answers for its system; bySystem has at most 15 keys. Supersedes the emerge map's EV0 (4) list growth
        (addendum there).
      proof: "every phase's systems are among the 15; bySystem has no other key; forSystem('raid') answers for cortex"
      conditions:
        - { says: "every phase's systems are among the 15", check: { kind: tests, run: "node tests/modules/test-loom-phasemap.js" } }
    SY2_cos_its_own_system:
      layer: foundation
      systems: [cos, core, loom, idearium]
      value: { score: 4, cost: S, for: [foundation], why: "COS gets its own nested compartment, repo and Phases tab — the COS machines map lands on COS, not core" }
      status: "DONE (0.39.341) — mapped before code. systems.js: cos (dirs [cos], loom [cos], no process); T-006/T-007 updated on his answer; cos-atlas.md made from core-atlas's cos/ section (moved, core keeps a pointer); nexus-atlas: a cos section, 16 systems. test-loom-phasemap 7/7, test-nexus-atlas-refs 53/53."
      james: '"cos needs to be a nested compartment" · asked where (its own system, or inside core): "Its own system (16th)"'
      depends_on: [SY1_fifteen_systems]
      files: [lib/nexus-self/systems.js, tests/modules/test-loom-phasemap.js, docs/2026-10-05-cos-machines-phasemap.spec]
      does: >-
        cos joins lib/nexus-self/systems.js as the 16th system, the way components did in 0.39.266: dirs [cos], loom tags
        [cos], no process (entry and port null). ownerOf(cos/…) is cos, so core no longer holds cos/; the next nexus-self
        sync makes nexus/cos with its nested compartment nexus-self-cos under the nexus parent, and core's repo re-syncs
        without cos/. Phases tagged cos — the COS machines map (VM1–EL1), EV0's cos part — are COS's. SY1's "only the 15"
        is now "only the systems in systems.js" (16), on James's answer.
      proof: "ownerOf('cos/…') is cos; forSystem('cos') answers COS's phases (the COS machines map); core holds no cos/ file; a sync makes the nexus/cos repo nested under nexus"
      conditions:
        - { says: "cos is its own system", check: { kind: tests, run: "node tests/modules/test-loom-phasemap.js" } }

  # ── Session inventory, 2026-10-05 — every request, where it is mapped (James: "make sure this is all mapped.") ──
    # ── 2026-10-05: James — "okay. i clicked on a phase in the phases tab in nexus core to have it built. it needs to
    #    actually build it". Read from his log and screenshot, not assumed: BL8 went to huihui_ai/qwen3-abliterated:0.6b
    #    (the derived ladder's lowest rung), the Plan's round 1 failed on 71 imports that were broken before anything was
    #    built, and the repair sent those unrelated files to the 3b model to rewrite (33k chars, 220 s each).
    PB1_no_build_below_a_floor:
      layer: library
      systems: [core]
      value: { score: 5, cost: S, for: [daily-use], why: "a 0.6b model cannot build a phase; it was the first rung" }
      status: "DONE (0.39.355) — routing.min_build_b (default 3) in config-core and Settings → Routing; the ladder says what it left off. test-phase-actually-builds PB-01."
      depends_on: []
      files: [lib/pipeline-routing.js, idearium/lib/config.js]
      does: >-
        The derived ladder drops Ollama models smaller than routing.min_build_b (default 3, his words: "if the 3b fails,
        switch to the 7b, then the 16b deepseek, then the agents"). Unsized models stay. A written routing.escalation is
        taken exactly as written.
      proof: "installed 0.6b, 3b, 7b, 16b → the ladder starts at 3b; min_build_b 0 keeps 0.6b; a written escalation is untouched"
    PB2_a_reply_that_changed_nothing_is_incomplete:
      layer: api
      systems: [idearium]
      value: { score: 5, cost: S, for: [daily-use], why: "a build that wrote no file read as 'replied' and the climb stopped" }
      status: "DONE (0.39.355) — PRt.changedAnything: an inject or a write tool that succeeded; otherwise incomplete, and the ladder climbs. PB-02, PB-06."
      depends_on: []
      files: [idearium/api/index.js]
      does: >-
        A phase attempt whose reply brought back no file (nothing written, staged or proposed) is 'incomplete' with
        "the reply changed no file" — so the ladder climbs instead of ending on the smallest model's prose.
      proof: "an attempt with zero injects is recorded incomplete and the next rung is tried"
    PB3_verify_counts_what_this_run_broke:
      layer: library
      systems: [core, idearium]
      value: { score: 5, cost: M, for: [daily-use], why: "every round failed on debt older than the run, and unrelated files were sent to be rewritten" }
      status: "DONE (0.39.355) — BV.baselineOf / against; the Nexus repos take a baseline (run.debt), any repo by { debt: baseline }; the Plan shows known debt per round. PB-03, PB-06."
      depends_on: []
      files: [lib/build-verify.js, idearium/api/index.js]
      does: >-
        The prove loop verifies once before it builds; what already failed is the baseline. Each round fails only on
        failures not in the baseline; the older ones are reported as known debt (counted, listed) and never sent back
        to an agent. lib/build-verify.js against(v, baseline).
      proof: "a repo with an old broken import and a new one: the round fails on the new one only, sends back only its file, and lists the old as known"
    PB4_imports_inside_text_are_not_imports:
      layer: library
      systems: [cos]
      value: { score: 3, cost: S, for: [quality], why: "67 of 71 'broken imports' were code inside a test's strings" }
      status: "DONE (0.39.355) — cos/runtime/run.js _stripTextStrings; _archive/ paths not checked. 71 broken imports in the Nexus tree → 17. PB-04."
      depends_on: []
      files: [cos/runtime/run.js]
      does: >-
        resolveDeps reads only the string that is require()'s / import's own argument; a require written inside another
        string (a test's fixture project) is text.
      proof: "the Nexus tree's broken relative imports fall from 71 to the real ones; a fixture string with require('./x') is not counted"
    PB5_the_real_broken_imports:
      layer: foundation
      systems: [core, clear-glass]
      value: { score: 2, cost: S, for: [quality], why: "a handful of real stale paths and tests of files that are gone" }
      status: "DONE (0.39.355) — cli/run-supervised.js → orchestrator/orchestrator.js; erosmancer-os/tests/run.js archived (superseded by tests/suite.ts). 13 left, all tests of modules that are gone — listed below, his call. PB-05."
      depends_on: [PB4_imports_inside_text_are_not_imports]
      files: [cli/run-supervised.js, erosmancer/erosmancer-os/tests/run.js, tests/_archive/]
      does: >-
        Fix the paths that moved (cli/run-supervised.js → orchestrator/orchestrator.js); erosmancer-os's old runner is
        archived (§0.3) — tests/suite.ts replaced it and its paths moved to src/registry, src/behavior, src/dispatcher.
        Left as they are, his call (archive, or rebuild what they tested): 13 imports in 8 test suites whose subjects are
        gone, each already crashing in run-all — admin-server-routes (cortex/foundation/admin-server), brainos-panel and
        brainos-panel-canvas-integration (nexus/ui/brainos), copilot.test (guardian/agents/co-pilot), flush-redundancy
        (cortex/flush-redundancy), test-intelligence-bridge (cortex/core/raid/intelligence-bridge), tests/pipeline.test.js
        (cortex/heartbeat, gate/gap-finder, healer, replay, agent-tools), tests/hooks-side-effect-parser.test.js
        (/tmp/real_strings.json). With PB3 they are known debt in a round, not sent to an agent.
      proof: "resolveDeps over the Nexus tree: run-supervised resolves, nothing in erosmancer, only those test suites left"
      not_in_this_phase: "BL8 itself — it names no files, and moving every spec out of docs/ breaks the tests that read them by path; it needs its file list (his call) before any agent can build it"


    # ── 2026-10-05: James — "you're building the capability, not the spec right? need to be able to build phases. i need
    #    to be able to add features, capabilites, expand, etc, by mapping to specs." · "also the dom mutator/node anchor,
    #    or ollama or cpilot stream live into the worksurface panel and code tab."
    #    Read before mapping: the guardian feed (0.39.244 — DOM mutations, the reply's node anchor, the reply text) already
    #    reaches idearium as idearium.repo.agent.feed, and only the Agent tab draws it. Ollama's tokens already arrive
    #    streamed inside the bridge (ollama-client _generateOnce, 0.39.289) and are held until the reply is done; copilot
    #    polls the bridge job each second and reads job.result, which is empty until then. So a phase built by Ollama shows
    #    nothing until it is finished, and a guardian one shows only on the Agent tab.
    LS1_the_bridge_job_holds_what_is_written_so_far:
      layer: library
      systems: [ollama]
      value: { score: 4, cost: S, for: [daily-use], why: "the tokens are already streamed in; they are thrown away until the end" }
      status: "DONE (0.39.356) — callOllamaRaw onDelta (every round); dispatch _grow keeps job.partial / partialThinking (200k cap, partialDropped counted). test-agent-live LS-01."
      depends_on: []
      files: [ollama/lib/ollama-client.js, ollama/lib/dispatch.js]
      does: >-
        callOllamaRaw takes onDelta; each streamed token (answer or thinking, every round: the think:false retry and each
        continuation) goes to it. A bridge job keeps job.partial and job.partialThinking as they grow (capped), so
        GET /api/jobs/:id answers what is written so far while the job runs.
      proof: "a stub Ollama streaming three tokens: the job's partial grows token by token before it completes"
    LS2_copilot_sends_the_text_as_it_comes:
      layer: library
      systems: [copilot]
      value: { score: 4, cost: S, for: [daily-use], why: "the caller sees the model write, not a wait" }
      status: "DONE (0.39.356) — _pollOllamaJobHeadless onPartial (every 500 ms while it writes); _streamingPoll → tool-runtime streamSink (loopback only); repo-agent sends streamUrl. LS-02."
      depends_on: [LS1_the_bridge_job_holds_what_is_written_so_far]
      files: [copilot/server.js, copilot/tool-runtime.js, lib/repo-agent.js]
      does: >-
        The tool loop's poll passes each new part of job.partial (and the start and end of each model turn) to the caller's
        stream sink — tools.streamUrl, loopback only, fire and forget, the CT8 sink's rules. The repo agent sends
        streamUrl beside progressUrl.
      proof: "a poll over a job whose partial grows sends the deltas in order, then the end; a non-loopback url is refused"
    LS3_one_feed_for_every_agent:
      layer: api
      systems: [idearium]
      value: { score: 4, cost: S, for: [daily-use], why: "Ollama, copilot and guardian arrive on the one feed the Agent tab already draws" }
      status: "DONE (0.39.356) — POST /api/repos/:uuid/agent/stream → idearium.repo.agent.feed, source ollama, SSE only; in the contract and registry-components. LS-03."
      depends_on: [LS2_copilot_sends_the_text_as_it_comes]
      files: [idearium/api/index.js]
      does: >-
        POST /api/repos/:uuid/agent/stream broadcasts idearium.repo.agent.feed (SSE only, like the guardian feed) with the
        guardian feed's shape — event dispatched | chunk | complete, jobId, provider ollama:<model>, text, fullLen,
        generating — so every consumer of the feed reads one shape whatever the model.
      proof: "a posted delta is broadcast as idearium.repo.agent.feed with the guardian shape; nothing is ledgered"
    LS4_live_in_the_code_tab_and_the_work_surface:
      layer: ui
      systems: [idearium]
      value: { score: 5, cost: M, for: [daily-use], why: "his words: stream live into the worksurface panel and code tab" }
      status: "DONE (0.39.356) — app.js agentLiveHtml / agentLivePaint over the Agent tab's feed state; slots in the Code tab (above activity) and the Plan (above the work surface). Clear Glass LS-04."
      depends_on: [LS3_one_feed_for_every_agent]
      files: [idearium/ui/js/app.js, idearium/ui/js/code-surface.js, idearium/ui/js/plan-panel.js]
      does: >-
        The Agent tab's feed state (app.js AGENT_FEED, _agentFeedIn) is the one state; each frame also paints a live
        strip in the Code tab (above the agent's changes) and in the Plan panel's work surface: generating or idle, the
        provider and model, the job, for a browser agent the node anchor and the mutation count, and the text as it is
        written (the tail, following the newest line). Painted in place, never a re-render of the tab.
      proof: "Clear Glass: feed frames (an Ollama chunk, a guardian dom pulse with its anchor) show in both places as they arrive"
      not_in_this_phase: "BL8 and the other backlog phases themselves — this is the capability that builds them; each still needs its own files"

  session_inventory:
    - { said: "Tell me about nexus. Tell me about idearium. How it chunks, reduces tokens.", where: "answered, no build asked — docs/atlases/idearium-atlas.md" }
    - { said: "What about the graphs? Agents. Memory.", where: "answered; the open graph/memory work is docs/2026-10-02-emerge-field-memory-build-phasemap.spec MR1–MR11, RF1" }
    - { said: "traversal of chunks, primitives, … the relationship between words … The boundaries. Learning to code from that", where: "docs/2026-10-02-fractal-graph-any-size-agent-phasemap.spec FG1–FG6 (containment tree, token budgets, summaries, contextFor, recursive build, calls/emits/tested_by); emerge map MR7 recipes, MR8 crystallization; BC1 (built)" }
    - { said: "We need the agents to use it.", where: "build-from-the-spec BC1 (0.39.308), BC2 (0.39.309) — built" }
    - { said: "Also what about the .node types.", where: "build-from-the-spec BC3 — open, his call" }
    - { said: "combining primitives or invariants to build higher leverage code for less tokens", where: "BC1 (built: interfaces, invariants, primitives); VP4 the primitive field; emerge CX0/CL1/MR8" }
    - { said: "Parse rhe axioms in the docs folder. Do not deviate They are law", where: "BC1's drift (the 0.39.308 audit), closed in BC2; HG7 the §4.1 text" }
    - { said: "They need context. All of it. From the hat/repo", where: "BC2 — built" }
    - { said: "Clearglass can be used to verify, lifeline can ask other agents. Adversarial agents. Use the confidence score.", where: "verified-primitives VP1, VP2" }
    - { said: "Can reuse any component in nexus, from loom or the component registery.", where: "VP4" }
    - { said: "each repo has a model of the user … gaps in communication, ledger for past context", where: "VP3" }
    - { said: "each passing test, verified component, gets fed into the primitive field", where: "VP4 (the gate into CX0/CL1/MR8)" }
    - { said: "add this to the idearium atlas. Like I want provinance.", where: "VP0 (built), VP5" }
    - { said: "Integrating the debug and intelligence system with the desktop envirement … debian for each test envirement", where: "VP6" }
    - { said: "the settings tab needs to be cleaned up … catagories of options like github … In tabs.", where: "VP7 — built" }
    - { said: "Don't just agree. Give input", where: "this map's input: section, and each map's found: section" }
    - { said: "No playwright. ClearGlass only.", where: "VP7's test on clear-glass/src/driver/glass.js (0.39.311); HG7 the law's text" }
    - { said: "I want the agent cli tab to be the end point for all cli commands.", where: "CL1, CL2" }
    - { said: "Each system needs to be in charge of its own data. … Cortex is the book keeper, with the associative lattice.", where: "DS1, DS2 (children of sovereign-node P5)" }
    - { said: "the code tab in idearium should probably be for new code in the repo … code generation, and uncommited change, the work surface", where: "CT1, CT2" }
    - { said: "make sure this is all mapped.", where: "this inventory; HG1–HG6 (defects found on the way); every phase declares systems: and value:" }
    - { said: "Im saying im the phasemaps in the nexus repo.", where: "checked: every phase is on the Nexus repo's Phasemap tab (loom, live) and its Phases tab (the head snapshot) — no change needed; found HG8" }
    - { said: "Yes. No playwright. That's literally what clearglass was born from.", where: "HG7 (AXIOMS §4.1 amended), HG8 (raid → cortex) — done" }
    - { said: "I feel like we don't need loom for phasemaps … what if we hook the node anchor into clear driver … Guardian just works beautifully now.", where: "answered; three phases offered (ClearDriver reads a Guardian anchor, the parser moves to Idearium, the five _nexusAnchor copies) — not mapped until he says" }
    - { said: "There is only 15 systems. Not 27. Any system that's in idearium is a system, nothing more.", where: "SY1 — done" }
    - { said: "Can you have like a small enterprise grade tutorial built for fiverr … walk me through it.", where: "docs/2026-10-05-fiverr-guide-phasemap.spec FR1, FR2 — paused" }
    - { said: "I want idearoum to be able to fulfill fiverr orders.", where: "emerge map FV1_client_jobs (already mapped); its first slice FV0_fulfil_a_taken_order" }
    - { said: "No automatically but from taking orders.", where: "FV0 — the trigger is his taking an order; nothing watches Fiverr or starts on its own" }
    - { said: "Yes like the end state for the repo. Maybe I ask customers the conditions for an acceptable output.", where: "FV0 input (A)" }
    - { said: "I feel like copilot needs to be the agents for the repos … lifeline to figure out how to fulfill the contract. Runs it in the cos envirenment.", where: "FV0 input (B)" }
    - { said: "Okay I'm just saying it figures it out through the context and agent tools.", where: "FV0 input_b — copilot decides how; the goal and the stop are fixed; deliver_check becomes a tool" }

    - { said: "okay. i clicked on a phase in the phases tab in nexus core to have it built. it needs to actually build it", where: "PB1–PB5 (0.39.355)" }
    - { said: "you're building the capability, not the spec right? need to be able to build phases. i need to be able to add features, capabilites, expand, etc, by mapping to specs.", where: "answered — PB1–PB5 are the capability; the backlog's phases are built by it, each with its files" }
    - { said: "also the dom mutator/node anchor, or ollama or cpilot stream live into the worksurface panel and code tab.", where: "LS1–LS4 (0.39.356)" }
    - { said: "Should the workshop's start page become the RS5 \"photoshop style\" template picker? yes with a custom or manual.", where: "docs/2026-10-05-spec-workshop-rebuild-phasemap.spec RS5 — built (0.39.357)" }
  open_questions:
    - "Q1: amend docs/AXIOMS-v3.1.md §4.1 from 'UI is tested via Playwright' to 'UI is tested in Clear Glass (clear-glass/src/driver/glass.js)'? A law changes only on your word."
    - "Q2 (CL2): may a writing verb run from the Agent tab after one confirmation, or only read verbs there and writing verbs from the terminal?"
    - "Q3 (DS2): which system moves home first? Proposed: the one with the fewest foreign readers, measured by DS1 — not the largest."
    - "Q4 (CT2): does the Agent tab's /injects stay, or does it point at the Code tab's Changes?"
