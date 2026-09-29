spec:
  meta:
    name:     one-idearium-phases-living-spec-nodes
    version:  1.0.0
    date:     2026-09-27
    release:  0.39.271
    uuid:     nexus-one-idearium-phases-nodes-phasemap-v1-0000-2026-0927-jamesbrooks-001
    owner:    orchestrator · versionium · idearium.ui · idearium.repo.phases · idearium.repo.living-spec ·
              lib.cos-run · cos.testenv · copilot.registry · lib.system-nodes · guardian.node-registry · loom
    status:   built (0.39.271) — every phase; drift found while building is in build_drift
    origin: >-
      James, 2026-09-27, with four screenshots (:9000 "route not found: GET /idearium/", the Idearium welcome
      with only Welcome + Repos, the nexus repo with Welcome/Create/Build/Repos on top, the Run menu of
      nexus/core): "can you fix this? also get versionium working. its like there are two ideariums or
      something. like it only has those options, and then when i clikc on the repos it shows all 4 tabs at the
      top. i want the roadmap and phases combined into a fully enterprise grade manager. the spec tab is for the
      .spec in the spec folder, the living model. i want cos to be able to run test envirements that can test
      any codebase, with the debugging and testing tools. can you check copilots tools, and capabilies. i
      wanted a command index for each system and exactly like gaurdian where all data, commands, etc are
      physical node types. guardian isnt finished, .hats, .agents. all data are nodes, then each, you know what
      look at the architecture doc"

  # ── Mapped before building (docs/CLAUDE.md rule 1) ─────────────────────────
  drift: >-
    None at the start: this map was written after reading, before any source below was touched. Grounding was
    read from the tree and from a live run (cortex + versionium + idearium started from this tree, nexus-self
    synced, repo snapshots taken and listed, the Versionium tab rendered in Chromium).

  exists:
    - >-
      orchestrator/orchestrator.js serves ui/tv-shell/index.html at "/". The shell's links are relative
      ('../idearium/', '../guardian', …). From "/", '../idearium/' resolves to /idearium/, and the static
      fallback (only FILES under ui/ or ui/tv-shell/) ends in 404 "route not found: GET /idearium/".
    - >-
      versionium :3754 runs; idearium's repo Versionium tab lists and takes snapshots (checked live, 2 versions
      of nexus/orchestrator, verify passed). The nexus PARENT repo's tab shows one version of one file
      (NEXUS.md, the index) — correct by design (the files live in each system's versions and the immutable base)
      but it reads as "versionium backs up nothing".
    - >-
      orchestrator /api/cortex/versionium/log and /commit still proxy to cortex, which answers "versionium moved
      to its own sovereign system"; versionium has no /log (its list is /api/versionium/history);
      cortex/registry-components.js still declares versionium.log.
    - >-
      idearium/ui/index.html — Create and Build are .nest-only (0.39.264, James: "this in idearium needs to only
      show in nested compartments/repos"): hidden on the welcome, then they appear in the GLOBAL bar when a repo
      opens. The bar changes under the user — "two ideariums".
    - >-
      Repo "Phasemap" tab (app.js renderRepoPhasemap) shows verification tiers + graphs, not phases, except on
      nexus systems (renderNexusPhasemap, read-only, loom's docs/ phases). "Roadmap" tab (idearium/repo/roadmap.js)
      shows the repo's *phasemap*.spec phases with a status select. Two vocabularies (done/in-progress/pending vs
      complete/active/planned), two parsers' outputs, nothing can be built from either.
    - >-
      loom/scanners/phasemap-map.js parsePhasemapText reads only "  X1_slug:" phases. Every phasemap written in
      the "- id: X1" list form (0.39.260+, including 0.39.267–270's own) is invisible to both tabs; closes:
      is never read.
    - >-
      Repo "Spec" tab — nexus systems: a read-only list of the system's .spec files; every other repo: the
      spec-engine chunk builder. No route lists or reads a repo's own spec/*.spec (the living model).
    - >-
      lib/cos-run.js — process runs execute each test FILE as its own node process (exit 0 = pass), capped at 40
      (MAX_TESTS); never the repo's own suite (npm test / jest / pytest) — only the VM does; test.all does not
      apply the runnable filter; no debugging aid beyond stderr tails. cos/testenv/detect.js already knows every
      stack's install + suite commands.
    - >-
      copilot — 46 served routes; registry-components.js declares 5 routes nothing serves (introspect ×3,
      agents/capability, agents/calibrate) and omits 12 it serves; interaction-contract.json says port 4850
      (it runs on 3750); 109 tools, /api/prompt/stream offers 17.
    - >-
      Nodes — capability/command/system node files in 10 systems come from ONE uncommitted export run
      (2026-09-12) and have drifted (guardian 36 declared / 33 files, versionium 13/6, intelligence 53/18).
      orchestrator, diagnostic: no nodes; cortex, idearium: no capability/command/system nodes. No generator in the
      tree. guardian/lib/node-registry.js (per-type watcher + ledger + JAA index) is never booted; it has no 'hat'
      type; no writer targets guardian/data/nodes/{hat,agent} (hats/agents export only on demand to data/exports).
      No live GET /nodes route. docs/command-index-per-system.spec says ollama/guardian SPECCED (both built).
  missing:
    - M1 the :9000 shell cannot open Idearium (or any directory UI) from its root.
    - M2 Versionium looks broken: dead orchestrator proxies; the nexus repo's tab shows no files.
    - M3 one Idearium: the global bar must not change when a repo opens.
    - >-
      M4 one phases manager: every phasemap form, one vocabulary, dependencies, closes, board/layers/table,
      edit, add, and build a phase (Versionium backup first, then the agent).
    - M5 the Spec tab is the living .spec of the repo's spec folder.
    - M6 COS runs any codebase's own tests, all of them, with a debug report of each failure.
    - M7 copilot's declared contract matches what it serves.
    - >-
      M8 every system's commands and capabilities are physical nodes, regenerated from the code; Guardian holds
      .hat and .agent nodes; nodes are readable over HTTP.

  invariants:
    I1: >-
      every node file is regenerated from a source in the tree (registry-components, interaction-contract, a live
      route table, jaaDB hats, repo agents) — never hand-kept; data/** stays out of the zip (§ delivery).
    I2: >-
      a phase build never writes before a Versionium snapshot of the repo exists for it (James: "needs to use
      versionium to backup the files, if it doesnt already then apply it live").
    I3: >-
      COS never starts a shell: suite commands run as argv (§ cos-run). Network stays off for tests (§4.3).
    I4: >-
      nothing removed: the Phasemap tab's verification/graphs move to the Intelligence tab; the chunk builder
      stays in the Spec tab under "build manifest"; unserved copilot routes are marked, not deleted (§0.3).
    I5: every unavailable option names what is missing and the fix (§1.2).

  # ── Found while building (§12.5) ──────────────────────────────────────────
  build_drift:
    - >-
      V1 was bigger than a dead proxy: versionium's history answered the FIRST 200 commits in store order, and
      every repo's Versionium list, the import baseline check, the agent tools and cortex's CLI read it that way.
      Past 200 repo snapshots in total (15 nexus systems per sync alone) a repo's new snapshots never appeared.
      history now takes ?n= (newest n) and ?branch=; every repo list reads its own branch.
    - >-
      P1 found list-form phases are also used inside other lists (an `entries:` drift log): the list form is read
      only inside a `phases:` block. A test edit made through the apply gate on that false phase was rolled back
      through the same gate (proving rollback).
    - >-
      C1 found the five "declared, not served" copilot routes had real, tested modules behind them
      (lib/introspect.js, lib/agent-capability.js): four are now served; calibrate stays declared, marked not
      served (it needs a live probe that would spend quota).
    - >-
      X1 found four registry-components.js shapes in the tree ({components}, a bare array, {COMPONENTS} via ESM
      interop) and shared ids (idearium /health, orchestrator's any-method routes) — both handled.
    - >-
      X2 found guardian/lib/node-registry.js's _idFromFilename cut every dotted id at its first dot (a removal
      dropped the wrong node) — fixed.
  phases:
    R1_ui_dir_redirect:
      name: orchestrator — a top-level directory ref (/idearium/, /guardian, …) redirects to /ui/<path>
      status: "DONE 2026-09-27 — built in 0.39.271."
      closes: [M1]
      files: [orchestrator/orchestrator.js]
    V1_versionium_proxies:
      name: orchestrator /api/cortex/versionium/{log,commit} call versionium; cortex's versionium.log marked moved
      status: "DONE 2026-09-27 — built in 0.39.271."
      closes: [M2]
      files: [orchestrator/orchestrator.js, cortex/registry-components.js]
    V2_nexus_versionium_view:
      name: >-
        the nexus repo's Versionium tab shows all of NEXUS — every system's versions, the immutable base
        history, and "snapshot every system"
      status: "DONE 2026-09-27 — built in 0.39.271."
      closes: [M2]
      files: [idearium/api/index.js, idearium/ui/js/app.js]
    N1_one_idearium:
      name: Create and Build move into the open repo's own tab row; the global bar is always Welcome + Repos
      status: "DONE 2026-09-27 — built in 0.39.271."
      closes: [M3]
      files: [idearium/ui/index.html, idearium/ui/js/app.js]
    P1_phasemap_list_form:
      name: loom parsePhasemapText also reads "- id:" phases (name, status, depends_on, closes, files)
      status: "DONE 2026-09-27 — built in 0.39.271."
      closes: [M4]
      files: [loom/scanners/phasemap-map.js]
    P2_phases_model:
      name: >-
        idearium/repo/phases.js — one model over the repo's phasemaps (and, for nexus systems, docs/ phases):
        one status vocabulary, layers, blocked/ready, closes/missing, add, edit status, build
      status: "DONE 2026-09-27 — built in 0.39.271."
      depends_on: [P1]
      closes: [M4]
      files: [idearium/repo/phases.js, idearium/repo/roadmap.js, idearium/api/index.js]
    P3_phase_build:
      name: >-
        build a phase — Versionium snapshot first, then the repo's agent gets the phase (its map, depends, closes,
        files, invariants) as its task; the phase goes active and records the snapshot + agent run
      status: "DONE 2026-09-27 — built in 0.39.271."
      depends_on: [P2]
      closes: [M4]
      files: [idearium/repo/phases.js, idearium/api/index.js]
    P4_phases_ui:
      name: >-
        one "Phases" tab (replaces Phasemap + Roadmap) — summary, filters, Board / Layers / Table, a detail pane,
        status, add, build; verification + graphs move to the Intelligence tab
      status: "DONE 2026-09-27 — built in 0.39.271."
      depends_on: [P2, P3]
      closes: [M4]
      files: [idearium/ui/index.html, idearium/ui/js/app.js]
    S1_living_spec:
      name: >-
        GET /api/repos/:uuid/living-spec — the repo's spec/*.spec files (any depth) and root *.spec, each parsed
        into sections (meta, gaps, version_history, addenda); ?path= reads one
      status: "DONE 2026-09-27 — built in 0.39.271."
      closes: [M5]
      files: [idearium/repo/living-spec.js, idearium/api/index.js]
    S2_spec_tab:
      name: the Spec tab shows the living spec first; the spec-engine chunk builder sits under "build manifest"
      status: "DONE 2026-09-27 — built in 0.39.271."
      depends_on: [S1]
      closes: [M5]
      files: [idearium/ui/js/app.js, idearium/ui/index.html]
    T1_suite_process:
      name: >-
        "Run the test suite" on the process backend — detect.plan's suite commands as argv, no shell, network
        off; install stays VM/online-only and is named when missing
      status: "DONE 2026-09-27 — built in 0.39.271."
      closes: [M6]
      files: [lib/cos-run.js]
    T2_all_tests:
      name: test.all runs every runnable test (no 40 cap, 4 at a time); the runnable filter applies to runs
      status: "DONE 2026-09-27 — built in 0.39.271."
      closes: [M6]
      files: [lib/cos-run.js]
    T3_debug_report:
      name: >-
        every failed run carries a debug report — the failing frames mapped to repo files with source excerpts
        and the assertion; the Debug tab shows the last run's failures; "hand to agent" carries the report
      status: "DONE 2026-09-27 — built in 0.39.271."
      depends_on: [T1, T2]
      closes: [M6]
      files: [lib/cos-debug-report.js, lib/cos-run.js, idearium/api/index.js, idearium/ui/js/app.js]
    C1_copilot_contract:
      name: >-
        copilot registry-components declares what it serves (12 added) and marks the 5 it does not
        (served:false, reason); interaction-contract port 3750
      status: "DONE 2026-09-27 — built in 0.39.271."
      closes: [M7]
      files: [copilot/registry-components.js, copilot/interaction-contract.json]
    X1_system_nodes:
      name: >-
        lib/system-nodes.js — per system, capability + command + system nodes regenerated from
        registry-components (else interaction-contract routes); idempotent by fingerprint; runs at orchestrator
        boot and from cli/nodes.js
      status: "DONE 2026-09-27 — built in 0.39.271."
      depends_on: [C1]
      closes: [M8]
      files: [lib/system-nodes.js, cli/nodes.js, orchestrator/orchestrator.js]
    X2_guardian_hat_agent:
      name: >-
        Guardian hosts .hat and .agent — every forged hat and every repo agent written to
        guardian/data/nodes/{hat,agent}; 'hat' joins GUARDIAN_NODE_TYPES; guardian boots its node registry
      status: "DONE 2026-09-27 — built in 0.39.271."
      closes: [M8]
      files: [lib/system-nodes.js, guardian/lib/node-registry.js, guardian/server.js]
    X3_nodes_route:
      name: GET /api/nodes · /api/nodes/:type · /api/nodes/:type/:id on the orchestrator, over every system
      status: "DONE 2026-09-27 — built in 0.39.271."
      depends_on: [X1, X2]
      closes: [M8]
      files: [orchestrator/orchestrator.js, lib/system-nodes.js]
    X4_command_index_spec:
      name: docs/command-index-per-system.spec — statuses corrected, node-file addendum
      status: "DONE 2026-09-27 — built in 0.39.271."
      depends_on: [X1]
      files: [docs/command-index-per-system.spec]
    X5_core_scripts:
      name: nexus/core offers Nexus's root package.json scripts; systems with no process say so instead of "no entry"
      status: "DONE 2026-09-27 — built in 0.39.271."
      files: [lib/cos-run.js]
    Z1_release:
      name: >-
        loom map with wires, addenda, SPEC-REGISTRY, lib/version.js 0.39.271, tests in run-all, CHANGELOG,
        one nexus.zip without data/**
      status: "DONE 2026-09-27 — built in 0.39.271."
      depends_on: [R1, V1, V2, N1, P4, S2, T3, C1, X3, X4]
