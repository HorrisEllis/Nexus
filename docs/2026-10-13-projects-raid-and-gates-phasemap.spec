spec:
  meta:
    name:     projects-raid-and-gates
    version:  1.0.0
    date:     2026-10-13
    release:  "0.60.6 (base)"
    uuid:     nexus-projects-raid-and-gates-phasemap-v1-0000-2026-1013-jamesbrooks-001
    owner:    "idearium (projects as repos: import, history, roadmap, notes) · cortex (RAID: its contract, routes, commands, events, gates) · cos (the check catalogue's stations, the test env) · loom (stable wires) · clear-glass (workflows through the driver)"
    status:   "MAPPED 2026-10-13. Done in 0.60.6: NT0 (notes), PL0 (five of his projects imported for real), CK0 (the catalogue written). Everything else OPEN. `exists` read in source this session, and PL0 run, not recalled."
    voice: >-
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim. `does:` is the coder's
      reading, his to correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    axioms:   docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §5.2 everything routes through RAID, §9.1 RAID is the only write authority for requests, §5.10 interaction through contracts only, §0.3 nothing lost, §17.3 every decision recorded
    companions: "docs/2026-10-12-request-spine-phasemap.spec (RQ0–RQ27: the contract, the gates, the verifiers, the failure index) · docs/2026-10-12-browser-providers-and-work-phasemap.spec (TB, PV, JB, MX, RN, CS) · cos/spec/check-catalogue.spec (the checks)"
    origin: >-
      James, 2026-10-13: "here is two huge ones. i have more. this is what i mean by i need to be able to log these somewhere,
      its too much. like can we have a notes or something section for the repos so i can note all of this down? im out of
      ideas" · "remember that i want nexus to be able to parse, import, map, and i want you to build anything nexus needs to
      completely manage a project. past, present and future." · "what if a contract uses each chunk as a one block of the
      contract, like a contract file that fullfilled, is each chunk as a block and synthesized into one contract file. raid
      needs routes and cli commands, events, connects to the interaction contract. idearium doesn't use raid. make sure
      idearium is all wired together, using the component registry as the event bus? interaction contract? like that needs
      to happen at somepoint. raid needs commands to add, remove, and edit axioms, gates, test." · "gates for everything to
      reduce workload from agents, checkpoints, and fault and fialure mode mapping, and diagnosing when there is a failure,
      tagging and updating the system each gate, gated, and tracked through the system. what do you think? also adding a
      bunch of workflows using cleardriver and the provers, brainos, idearium, like internal and external." · later the
      same day: "you're mapping all of this right. here is some more. remember not just the components. importing them as
      repositories, so i can continue, expand, fix, manage, and test them. like expand idearium, or any part of nexus that
      gives full capability to do this. invent, expand, innovate, wire, build, use from already existing code first, then
      expand outward."

  exists:
    projects:
      - "Import a project as a repo: Bring in → Import project → POST /api/project-import/start then /:uuid/finalize (lib/project-container.js, lib/zip-ingest.js with the importer's bounds) — a COS compartment, the files on disk, chunked later (deferChunking), a baseline snapshot. repo.import-archive does the same in one call."
      - "lib/history-import-job.js + cli/import-history.js (N30): a series of archive zips of NEXUS → a git history, one commit per archive, dry run first. Built for Nexus's own archives."
      - "lib/project-decompose.js (0.60.5): a project → components; bundles. lib/repo-notes.js (0.60.6): notes per repo."
      - "idearium spec-plan / build-surface (specPlan derive, replan), roadmap.addPhase, the Phases tab — a repo's future is its phasemap."
    raid:
      - "Routes (cortex/boot.js): GET /api/raid/queue, /api/raid/decide (reads ?intent only; declared POST in cortex's contract), POST /api/raid/feedback, /api/raid/status, /api/raid/health. POST /api/officiator/synthesize (orchestrator). No contract or gate or axiom route."
      - "Commands: orchestrator `raid` (status only). No idearium/cli/route-commands.js row, so nexus.command and every agent have no RAID door."
      - "Events: cortex.raid.decided, raid.route.request|decided|no_route|fulfilled|failed (declared in cortex/event-taxonomy.js); nothing in production subscribes to raid.route.decided/fulfilled. The contract lifecycle (raid.contract.submitted|rejected|acknowledged|stage.*|pass|fail|reconciled.*) goes to RAID's own CFR ledger, not the bus; cortex/core/raid/event-taxonomy.js declares four other names and is imported nowhere. HEAL_REQUESTED is undeclared."
      - "Axioms are code constants (lib/constitutional-ai.js AXIOMS, contracts/nodes/axioms.node.js, cos/foundation/axioms.js COS-1..17); gates are code (idearium/index.js _registerGates); the test list is tests/modules/run-all.js. Nothing adds, removes or edits any of them at run time."
      - "Idearium already touches RAID in three places: chunk-dispatch decideForContract, spec.build and build submitting contracts (submitContract + reportExternalOutcome). The repo agent, the code tab and the phase build do not."
    registry_and_bus:
      - "lib/component-registry.js is the component registry (JAA; systems register their registry-components.js through POST /api/register). It validates hooks but never runs them; wires_to is read only by static analysers. RAID's router resolves intent → capability namespace through it — the one runtime use."
      - "Every system has an interaction-contract.json except RAID (its routes live in cortex's). intelligence/cfr/contract-verifier.js checks observed behaviour against them."
    gates_and_checks:
      - "cos/spec/check-catalogue.spec (0.60.6): 96 checks, 12 primitives, 86 deterministic; cos/spec/qa-catalog.spec (81 methods, prose); torture-chamber stations (unbuilt); proof-run's four check kinds; diagnostic-engines (12 engines, 3 invariants); intelligence/gap/predicate.js (7 gap predicates)."

  proof_run:   # PL0 — run 2026-10-13 in a sandboxed Idearium through the real routes (POST /api/project-import/start → /finalize)
    - "update-system: 10 files, all chunked — 0.2 s"
    - "ERAVOS 3.31-alpha: 544 entries, 465 chunked, 79 binary kept as files not chunked — 1.1 s. Decomposed: 169 components, 0 require edges — its scripts share through window globals (CK-126)."
    - "Bridge-OS: 657 entries, 171 chunked, 470 omitted — every one of them .git (its history)"
    - "nexus 4.23 relay-origin-fix: 1838 entries, 430 chunked, 1118 omitted — every one of them nexus/sites/eravos/.git (a nested repo's history)"
    - "MASTERMIND v0.1.50: 1376 entries, 1355 chunked — 5.4 s. Decomposed: 1026 components; 143 imports point at files that are not in the project (most under unintegrated/); three copies of spatial-v2 (v2_0_0, v2_1_0, v2_2_0_1). Two store bugs found and fixed: a URL import named as the npm package 'https:', a required ./package.json reported missing."
    - "All five became repos. What did not come in is history — the .git folders — and that is the 'past' of 'past, present and future'."
    - "Found by the run itself: an import under the test sandbox still wrote its files into the real idearium/repo/repos/ (lib/project-import.config.js REPO_STORAGE is not one of lib/test-sandbox.js's STORES), and other suites then scanned them. The five were removed; the store is named in PL1's proof so a test import stays in its sandbox."
    - "0.60.7, the same sandbox, the routes of VM0: Bridge-OS's .git became 33 versions on repo-<uuid>@history (2026-07-24 'Initial import: Bridge OS pre-review snapshot' to 2026-08-11 'fix(forensic-sweep)…', author James Brooks) in 3.6 s, its zipped files skipped as equal to the last commit; first → last commit: 10 added, 5 removed, 31 changed. clearglass-gig-import's two zips: two versions in order; the same zip again: nothing stored."
    - "0.60.7 import checks on the four: ERAVOS 22 duplicate files (the zip ships the source and a packaged windows-x64 build of it), 1 undeclared package; Bridge-OS 2 undeclared packages, 2 duplicates; clearglass-gig-import 24 requires that resolve to nothing (it is a patch over the clear-glass tree, not a whole project); update-system clean. Each a note on its repo."
    - "0.60.7 the eyes (Electron, the engine Clear Glass runs on, over the sandboxed Idearium; DOM read beside each screenshot): every imported repo's Files tab said 'manifest only — file content isn't stored yet' with 544 files on disk (app.js read repo.localPath, which nothing writes); the library headed each project with its compartment uuid; the title bar said 'Repository' with no name. All three fixed and seen fixed on the next pass."

  folds:
    - "'what if a contract uses each chunk as a one block of the contract … a contract file that fullfilled, is each chunk as a block and synthesized into one contract file' → request spine decision_contract_format / decision_contract_files [A] (recorded 1.2.0) and RQ21. RD4 below records his sentence as the confirmation: the contract file is one; each chunk is a block of it; when the contract is fulfilled the blocks — each with its result and evidence — are synthesized into that one file."
    - "'gates for everything … checkpoints, and fault and fialure mode mapping, and diagnosing when there is a failure, tagging and updating the system each gate' → request spine RQ1 (verifiers), RQ2 (failure vocabulary and index), RQ24 (the gate transaction: checkpoint, revert, report), RQ25 (progress as evidence), RQ16/RQ17 (diagnose by hypothesis, observe by request); the checks themselves are cos/spec/check-catalogue.spec."
    - "'i want nexus to learn' → check-catalogue CK-220–CK-223 (every failure tagged; recurring failure becomes a guard; repeated procedure becomes a tool; a check earns its place) and request spine RQ2, RQ4, RQ19."

  pushback:
    - >-
      Editing the system's axioms at run time is a change to the constitution. Adding and editing a repo's or a contract's
      axioms (a charter, a contract's boundary) is ordinary work and gets commands for him and the agents; the SYSTEM axioms
      (AXIOMS-v3.1, constitutional-ai, COS-1..17) get commands that only he can run (personOnly, the way access keys are),
      and every change is a dated, quoted decision (docs/CLAUDE.md).
    - >-
      "The component registry as the event bus" is a large change to how every system talks. The registry already knows
      every hook; making it route events means a hook declared in the registry is subscribed for real and a wire is a
      live subscription. Done for one path first — RAID's raid.route.decided reaching the system it names (RD3) — measured,
      then widened. Never as a big switch.
    - >-
      Routing Idearium through RAID is the axiom (§5.2, §9.1) and the stable direction, but only after RQ0 proves the spine
      and decision_raid_home is made: RAID was answering 'claude' for everything until 0.60.3. RD2 starts with the build
      path that already submits contracts and makes it the only path, before the chat.
    - >-
      .git history is the most valuable thing an import throws away, and also the largest and the one that can carry secrets
      (old commits). PL2 keeps it, with the secrets check (CK-060) run over it before it is stored.

  decisions:
    decision_axiom_edit_authority:
      choices:
        - "[A] a repo's and a contract's axioms: him and agents (through the gate); system axioms: him only (personOnly), each change a quoted decision  ← recommended"
        - "[B] everything editable by agents through RAID with his approval per change"
        - "[C] system axioms stay code; only repo/contract axioms are editable"
      chosen: open
    decision_history_on_import:
      choices:
        - "[A] a zip's .git becomes the repo's git history (Versionium imports the commits); nested .git dirs become linked repos  ← recommended"
        - "[B] keep .git as plain files beside the repo (cheap; history unread)"
        - "[C] skip as now"
      chosen: >-
        A, 2026-10-13. James: "can you add history import tool to the repos. like maybe with versionium. i want real
        versions with the versionium tab." Built 0.60.7 as a tool he drops zips on (and the import keeps the latest files as
        before), not automatic at import: the coder's reading, because a history import stores every commit and can carry
        credentials, so it runs with a dry run and a secrets stop. To confirm: run it automatically on every import of a
        zip that carries .git. Nested .git dirs becoming linked repos (nexus 4.23's eravos) is still open.
    decision_refactor_tool:
      asked: '"can you have a refactor tool, or a option to fix or migrate archecture, like decompose components, and use the component registry for the spine, decompose nodes, organize file structure… like the way guardian is using nodes, and the way the architecture spec and genesis are, the taxnomy, the phases, like what do you think of that?"'
      choices:
        - "[A] a proposal engine: read the architecture, propose a migration as phases, apply each as staged injects with a snapshot before and tests after; nothing moves without his yes  ← recommended"
        - "[B] an automatic rewriter that reorganizes a repo in one pass"
        - "[C] report only (what is wrong with the architecture), no changes"
      chosen: "A — the proposal engine (2026-10-16). James delegated the pick: \"pickest the highest leverage, structural change. axioms in the docs are law\". The coder chose under the axioms: §0.3 (B overwrites; A stages each move with a snapshot), §3.3 (A is a map before it moves anything), §0.4 (each A phase is undoable, so options grow), USER_AUTONOMY (nothing moves without his yes); C fails his own ask (\"fix or migrate\"). The refactor tool runs through the agent work funnel (docs/2026-10-16-agent-work-funnel-phasemap.spec)."

  phases:
    NT0_notes:
      layer: ui
      systems: [idearium]
      component: lib.repo-notes
      status: "DONE — 0.60.6"
      james: '"can we have a notes or something section for the repos so i can note all of this down? im out of ideas"'
      files: [lib/repo-notes.js, idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/repo-notes.js, idearium/ui/index.html, lib/context-atlas.js]
      does: >-
        A Notes tab on every repo: one box (Enter saves), kinds note · idea · decision · todo · question · quote, tags, pin,
        done, archive (never delete), search, this repo or every repo; notes on no repo. Routes, commands (repo notes, repo
        note, notes, note, note done) so every agent reads and writes them, and the context atlas searches them.
      proof: "tests/modules/test-repo-notes.test.js RN-01–RN-08, WR-01–WR-03"

    PL0_his_projects_imported_for_real:
      layer: library
      systems: [idearium, cos]
      component: lib.project-container
      status: "DONE — run 2026-10-13 (proof_run above)"
      james: '"importing them as repositories, so i can continue, expand, fix, manage, and test them"'
      files: [lib/project-container.js, lib/zip-ingest.js, lib/project-decompose.js, lib/component-store.js]
      does: "Five of his projects imported through the real Import routes in a sandboxed Idearium, and decomposed; what came in, what did not and why is in proof_run. On his machine: Bring in → Import project, one zip at a time (PL1 makes it many)."
      proof: "proof_run"
    PL1_many_projects_at_once:
      layer: ui
      systems: [idearium]
      component: idearium.ui.import
      status: "OPEN"
      james: '"here is two huge ones. i have more."'
      depends_on: [PL0_his_projects_imported_for_real]
      files: [idearium/ui/js/app.js, idearium/ui/index.html, lib/project-container.js, lib/project-decompose.js]
      does: >-
        Import project takes several zips: each becomes its own repo (name from the zip, the goal asked once for all or per
        repo), decomposed into the component store, and the import checks run (PL4). One line per project says what came in;
        the repos list shows them as they land. A command (repo import <zip…>) does the same for agents.
      proof: "five zips dropped at once become five repos, each with its components and its import report; under the test sandbox the repos land in the sandbox (REPO_STORAGE redirected), never in idearium/repo/repos/"
    PL2_history_kept:
      layer: library
      systems: [idearium, versionium]
      component: lib.repo-history
      status: "DONE — 0.60.7 (as a tool: Versionium tab → import history, repo history-import, POST /api/repos/:uuid/history/import). Nested .git as linked repos: OPEN"
      james: '"completely manage a project. past, present and future."'
      depends_on: [PL0_his_projects_imported_for_real]
      files: [lib/zip-ingest.js, lib/project-container.js, versionium/lib/engine.js, lib/history-import-job.js]
      does: >-
        Per decision_history_on_import: a zip's .git is no longer thrown away — its commits become the repo's history
        (browsable in Versionium, blame per line), after the secrets check over the history; a nested .git (nexus 4.23's
        sites/eravos) becomes its own repo, linked to the parent.
      proof: "Bridge-OS imported with its 447 git objects: its commit log is the repo's history; nexus 4.23's eravos is a linked repo"
    PL3_versions_become_history:
      layer: library
      systems: [idearium, versionium]
      component: lib.repo-history
      status: "DONE — 0.60.7 (cli/import-history.js scanZip/orderScans reused; clearglass-gig-import's two zips became two versions in order)"
      james: '"past, present and future"'
      files: [lib/history-import-job.js, cli/import-history.js]
      does: >-
        The N30 archive importer (built for Nexus's own archives) for any project: several zips of one project (MASTERMIND
        v0.1.x, nexus 4.x) are ordered by their version and become one repo's history, one commit per zip, dry run first.
      proof: "three versions of one project dropped together become one repo with three commits in order"
    PL4_import_reports_what_is_broken:
      layer: library
      systems: [idearium, cos]
      component: lib.import-checks
      status: "DONE — 0.60.7 for the deterministic six (CK-001, CK-002, CK-006, CK-008 whole-file, CK-060, IMP-01); the rest of the catalogue's import stage waits on CK1"
      james: '"i want nexus to be able to parse, import, map"'
      depends_on: [CK1_the_catalogue_runs]
      files: [lib/project-decompose.js, cos/spec/check-catalogue.spec, lib/repo-notes.js]
      does: >-
        On import, the catalogue's import-stage checks run (parses, imports resolve, cycles, npm declared, dead code,
        duplicates, complexity, secrets, licences, terminology, spec vs code, reachability, dynamic and global links). Each
        finding is a note (kind question or todo, source 'import') on the repo, grouped, so the repo arrives with what is
        already broken written down — MASTERMIND's 143 broken imports and its three spatial-v2 copies would be the first.
      proof: "MASTERMIND imported: its Notes list the broken imports by package and the duplicate copies"
    VM0_versionium_managed_per_repo:
      layer: ui
      systems: [idearium, versionium]
      component: lib.repo-history
      status: "DONE — 0.60.7"
      james: '"i want real versions with the versionium tab. like a full index of versions, versions, revisions from the work surface, diffs, backups/snapshots, etc. like full management system for versionium backend, then with the api, expand the idearium ui repo tab."'
      files: [lib/repo-history.js, lib/import-checks.js, idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/repo-versions.js, idearium/ui/js/app.js, idearium/ui/index.html]
      does: >-
        Nothing stored beside versionium. One index per repo: snapshots (repo-<uuid>), backups (the pre-restore snapshot a
        restore takes), staging (@staging), imported history (@history, ordered by the original dates), work-surface revisions
        (injects). A diff between any two versions or one against the files on disk, with patches. One file put back (the
        write is itself versioned). Routes GET versions / versions/diff / versions/tree, POST versions/restore-file /
        history/import; commands repo versions (now the whole index), repo diff, repo restore-file, repo history-import, repo
        integrity. The tab: kind filters, A/B compare, open a version, diff now, put back, drop zips to import history.
      not_yet: [".nex backups (versionium/lib/snapshot.js backup_records) are system-wide, not per repo: not in the index", "restore a whole staging commit or branch from the tab", "blame per line"]
      proof: "tests/modules/test-repo-history.test.js RH-01–RH-12, IC-01–IC-05, WR-01–WR-03 (20/20, against versionium's real engine and file layer); the eyes run in proof_run"

    RF0_architecture_read:
      layer: library
      systems: [idearium, loom, core]
      component: lib.architecture-migrate
      status: "MAPPED"
      james: '"can you have a refactor tool, or a option to fix or migrate archecture, like decompose components, and use the component registry for the spine, decompose nodes, organize file structure… like the way guardian is using nodes, and the way the architecture spec and genesis are, the taxnomy, the phases"'
      depends_on: [VM0_versionium_managed_per_repo, PL4_import_reports_what_is_broken, PL6_global_links_seen]
      files: [lib/project-decompose.js, lib/component-store.js, lib/import-checks.js, idearium/repo/architecture.js]
      does: >-
        What the repo's architecture is now, from what already exists: its components and real edges (component store,
        decompose), cycles and coupling (CK-004, CK-104), duplicates (CK-008), files that sit outside any layer, and how far
        its layout is from the target taxonomy (architecture-spec and genesis: system / layer / component, Guardian's node
        files). Read only.
      proof: "MASTERMIND read: its three spatial-v2 copies, its cycles, and its layout against the taxonomy, as one report"
    RF1_migration_proposed_as_phases:
      layer: library
      systems: [idearium]
      component: lib.architecture-migrate
      status: "MAPPED"
      depends_on: [RF0_architecture_read]
      files: [lib/architecture-migrate.js, idearium/repo/roadmap.js]
      does: >-
        The migration as a phasemap in the repo: each phase one kind of move (split a component, merge duplicates, move files
        into the taxonomy's folders, rewrite the requires that point at them, emit a node file per component), bottom-up
        (leaves first), each with its proof (the import checks and the repo's tests still pass).
      proof: "the proposal for MASTERMIND is a phasemap its Phases tab shows; nothing changed on disk"
    RF2_applied_one_phase_at_a_time:
      layer: library
      systems: [idearium, versionium]
      component: lib.code-edit
      status: "MAPPED"
      depends_on: [RF1_migration_proposed_as_phases]
      files: [lib/code-edit.js, lib/repo-inject.js, lib/repo-history.js]
      does: >-
        A phase's moves are staged as injects on repo-<uuid>@staging (lib/code-edit.js stage), the snapshot taken first,
        promoted all-or-nothing, the checks and tests run after; a failure rolls back (promote already does) and is written
        as a note. Every step is a version in the index, so any migration can be compared and undone.
      proof: "one MASTERMIND phase applied: the diff in the Versionium tab, the tests green, and its undo"

    PL5_specs_become_the_roadmap:
      depends_on: [RF1_migration_proposed_as_phases]   # mapped from the files they share: RF1_migration_proposed_as_phases (idearium/repo/roadmap.js)
      layer: library
      systems: [idearium, loom]
      component: idearium.repo.spec-plan
      status: "OPEN"
      james: '"completely manage a project. past, present and future."'
      files: [idearium/api/build-surface.js, idearium/repo/roadmap.js, loom/scanners/phasemap-map.js]
      does: >-
        A project's own specs (ERAVOS ships 129 .spec files) are read as its spec registry and its future: phasemaps loom can
        parse become the repo's Phases; plain specs become proposed phases (spec-plan derive) for him to accept (MX1).
      proof: "ERAVOS's specs appear in its Spec and Phases tabs; one accepted becomes a buildable phase"
    PL6_global_links_seen:
      depends_on: []   # 2026-10-23 SL3: was [RF0_architecture_read], written by MP4 (0.60.29) from a shared file (lib/project-decompose.js); RF0's own authored depends_on names PL6, so the two closed a cycle. An inferred edge never overrides an authored one (§0.1); kept here, not lost (§0.3).
      layer: library
      systems: [core]
      component: lib.component-store
      status: "OPEN"
      james: '"parse, import, map"'
      files: [lib/component-store.js, lib/project-decompose.js]
      does: "Check CK-126: a browser app that shares through window globals and script order (ERAVOS: 169 components, 0 edges) has its links read from script tags and window.X assignments/reads, so its components connect."
      proof: "ERAVOS decomposed shows its real links"

    RD0_raid_has_its_own_contract:
      layer: library
      systems: [cortex]
      component: cortex.raid
      status: "PARTLY BUILT 0.60.157 (the gating census) — /api/raid/status, /api/raid/officiator and /api/raid/officiator/unpark declared in cortex/interaction-contract.json; HEAL_REQUESTED declared in cortex/event-taxonomy.js. Open: decide reading its POST body; the contract lifecycle on the bus; cortex/core/raid/event-taxonomy.js and cortex/event-taxonomy.js are two vocabularies (surfaced, not collapsed). Was: OPEN"
      james: '"raid needs routes and cli commands, events, connects to the interaction contract."'
      files: [cortex/interaction-contract.json, cortex/registry-components.js, cortex/event-taxonomy.js, cortex/core/raid/contract-intake.js, cortex/boot.js]
      does: >-
        RAID's routes, events and components declared where the contract checker reads them: /api/raid/status and the new
        routes in cortex's interaction contract; /api/raid/decide reads its POST body (declared POST, reads only ?intent);
        the contract lifecycle (submitted, rejected, acknowledged, stage.*, pass, fail, reconciled.*) emitted on the bus as
        well as RAID's ledger, and declared in cortex/event-taxonomy.js; the dead raid/event-taxonomy.js retired into it;
        HEAL_REQUESTED declared.
      proof: "test-event-contracts finds every RAID event declared; a submitted contract's stages reach the bus"
    RD1_raid_commands:
      layer: library
      systems: [cortex, idearium]
      component: cortex.raid
      status: "OPEN"
      james: '"raid needs commands to add, remove, and edit axioms, gates, test."'
      depends_on: [RD0_raid_has_its_own_contract]
      files: [idearium/cli/route-commands.js, cortex/boot.js, cortex/core/raid/contract-intake.js]
      does: >-
        RAID through nexus.command for him and every agent: raid status, raid queue, raid decide <intent>, contract show
        <id>, contract submit, contract gates <id>; and, per decision_axiom_edit_authority: axioms list / add / edit / retire,
        gates list / add / edit / retire, checks list / add / run (from the catalogue, CK1). Axioms and gates become node files
        (.axiom, .gate) with schemas so they can be added without editing code; the code constants are their seed.
      proof: "an agent lists RAID's queue and a contract's gates through nexus.command; a repo axiom added by command is enforced at the next gate"
    RD2_idearium_routes_through_raid:
      layer: library
      systems: [idearium, cortex]
      component: idearium.api
      status: "OPEN"
      james: '"idearium doesn''t use raid. make sure idearium is all wired together"'
      depends_on: [RD0_raid_has_its_own_contract]
      files: [idearium/api/index.js, lib/repo-agent.js, cortex/core/raid/contract-intake.js]
      does: >-
        After request spine RQ0 and decision_raid_home: the phase build (which already submits contracts in spec.build and
        build) goes only through RAID — one path, the contract as its record; then the code tab's requests (MX1's front door)
        become contracts too. The door (pipeline-routing) stays RAID's policy for who answers, not a second router.
      proof: "a phase build's every chunk is a RAID contract block with its gate results; no build dispatch bypasses RAID"
    RD3_the_registry_carries_events:
      layer: library
      systems: [core, cortex]
      component: lib.component-registry
      status: "OPEN"
      james: '"using the component registry as the event bus? interaction contract? like that needs to happen at somepoint."'
      depends_on: [RD0_raid_has_its_own_contract]
      files: [lib/component-registry.js, cortex/core/raid/router.js, lib/capability-registry.js]
      does: >-
        The registry's hooks become live: a component that declares it consumes an event is subscribed to it by the
        registry, and a wire is a subscription the contract checker can see working. First path only: raid.route.decided
        reaching the system it names (nothing subscribes today). Measured, then widened system by system.
      proof: "raid.route.decided for idearium arrives at idearium's declared hook; the registry shows the wire live"
    RD4_the_fulfilled_contract_is_one_file:
      depends_on: [RD2_idearium_routes_through_raid]   # mapped from the files they share: RD2_idearium_routes_through_raid (cortex/core/raid/contract-intake.js)
      layer: library
      systems: [cortex]
      component: cortex.raid.contract-intake
      status: "OPEN — folds into request spine RQ21"
      james: '"what if a contract uses each chunk as a one block of the contract, like a contract file that fullfilled, is each chunk as a block and synthesized into one contract file."'
      files: [cortex/core/raid/contract-intake.js, lib/node-export.js]
      does: "His confirmation of decision_contract_files [A]: the .contract is one file; each chunk is one block; as blocks pass their gates their results and evidence are written into the block; the fulfilled contract is the one file with every block synthesized — the record of what was asked, done and proven."
      proof: "a three-chunk contract fulfilled: one .contract file, three blocks, each with its gates, result and evidence"

    CK0_the_catalogue_written:
      layer: library
      systems: [cos]
      component: cos.spec.check-catalogue
      status: "DONE — 0.60.6"
      james: '"look in all relevant domains … to find, invent, and discover extensive tests … make a huge list"'
      files: [cos/spec/check-catalogue.spec]
      does: "96 checks across structure, chunking, behaviour, runtime, security, interface, communication and language, systems, traversal, data, agents, process QA/QC, Da Vinci's principles and learning — from 12 primitives compared across domains; 86 deterministic."
      proof: "the file loads (js-yaml) with 96 entries, every field present, no duplicate id"
    CK1_the_catalogue_runs:
      layer: library
      systems: [cos, cortex, idearium, diagnostic]
      component: lib.check-catalogue
      status: "OPEN"
      james: '"for the test env, for the gates, the debugging system in repos, the diagnostic system and the intelligence system"'
      depends_on: [CK0_the_catalogue_written]
      files: [lib/check-catalogue.js, cos/templates/torture-chamber/stations, idearium/cli/route-commands.js]
      does: >-
        lib/check-catalogue.js serves the entries by stage; the deterministic ones with code already named in `exists` are
        wired first (each a station or an RQ1 verifier, never both); checks list / run through nexus.command; each run's
        result tagged with RQ2's classes. The rest are built in the order the request spine's measures say they pay.
      proof: "checks run --stage import on a repo returns each check's verdict with evidence; a failure carries its class"

    WF0_workflows:
      layer: library
      systems: [clear-glass, idearium, cos, intelligence]
      component: clear-glass.automation
      status: "OPEN"
      james: '"also adding a bunch of workflows using cleardriver and the provers, brainos, idearium, like internal and external."'
      files: [clear-glass/src/automation/nodes.js, clear-glass/src/automation/steps.js, clear-glass/src/driver/glass.js, idearium/repo/proof-run.js]
      does: >-
        Workflows as .workflow nodes (they already exist, with cron, event and webhook triggers), each step a command, a
        driver action or a proof: internal — import project → checks → notes; nightly: each repo's tests in COS → a report in
        its Notes; a provider's drift check; a phase built → proven → its gate results posted. External — a gig written →
        reviewed → filled; an application → the follow-up prompt; a site's element endpoint watched → an event. BrainOS shows
        them running.
      proof: "the nightly workflow runs a repo's tests in COS and leaves a report note; one external workflow runs end to end in Clear Glass"

    LM0_loom_wires_have_stable_ids:
      layer: library
      systems: [loom]
      component: loom.scanners.source-map
      status: "BUILT 0.60.157 (the gating census, layer 1) — a wire's id is its endpoints (source.wire.<from>--<to>, uuid from their hash); the numbered scan wires are pruned as superseded; a re-declaration identical to the stored record is UNCHANGED, one that differs REPLACES it, so a bootstrap over its own registry no longer reports every existing record as a failure (6,333 on 2026-10-18). Was: OPEN"
      james: '"what aboiut 34000 lines? can you check that for me?"'
      files: [loom/scanners/source-map.js, loom/bootstrap.js]
      does: >-
        Found 2026-10-13: a wire's id carries its position in the scan (source.wire.<n>.<from>--<to>), so one new file
        renumbers every wire after it. A bootstrap over the existing registry then adds ~2300 duplicate wires under new ids
        (the 34k-line diff), and a from-scratch bootstrap loses ~125 real edges (115 unresolved export hooks, 10 of them
        clear-glass/src/main's requires) — while the true change was +31 components, +31 hooks, +40 wires, 0 removed. Fix:
        a wire's id is its endpoints (source.wire.<from>--<to>), so ids are stable; then one regeneration, checked
        endpoint by endpoint against today's registry, and the 115 unresolved export hooks fixed at their cause.
      proof: "two bootstraps in a row change nothing; adding one file adds only its own wires; no endpoint lost against today's registry"

# ## ADDENDUM 2026-10-16 (0.60.112): the refactor tool's first input is a carve
# James: "look at rfr2. versionium. event ledgers. causal graph. cos test env. its a product?" · "can you branch it into a idearium repo?"
# The coder's reading (to confirm): those pieces are a product (an undo button and flight recorder for AI coding agents), and RF2
# (applied one phase at a time, every step a version) is its demo. Built: docs/2026-10-16-repo-carve-phasemap.spec CV1, which copies
# a part of Nexus into its own Idearium repo with everything it requires. The flight_recorder preset needs 217 files across 15
# systems (loom, warp, guardian and emerge come along through requires): that report is RF0's first real input (CV2).

# ## ADDENDUM 2026-10-24 (0.60.234): RF0 + RF1 built — the refactor tool reads and proposes; first input: the 15 systems
# James, 2026-10-24: "need to make the refactor tool from the phgases. so we can make each system sovereignfor the cos migratoin" ·
# "15 systems. the rest of the folders need to migrate." (his 2026-10-05: "There is only 15 systems. Not 27. Any system that's in idearium
# is a system, nothing more.") Decision A (proposal engine, 2026-10-16) is what was built: lib/architecture-migrate.js
#   read() RF0 — the 15 systems (lib/nexus-self/systems.js) and every top-level folder the boundary census counts outside them, with who
#     uses it and what it uses (lib/system-boundary.js scan, the same crossings the ratchet counts)
#   propose() RF1 — a home per folder by his axioms (code belongs to the system it serves; shared code is kernel): R1 one system uses it →
#     that system; R2 lib/ or two systems → core (lib/<dir>/); R3 nothing uses it and it uses one place (not lib/) → there; R4 no evidence →
#     unplaced, to confirm, never guessed. bottom-up dependsOn.
#   phasemap() — the proposal as docs/2026-10-24-fifteen-systems-migration-phasemap.spec (22 folders, DAG-clean; 13 placed, 9 to confirm)
# Doors: `node lib/architecture-migrate.js [--write f] [--json]`, row `system migrate`. Read only — nothing moved. Test
# tests/modules/test-architecture-migrate.test.js 3/3. Narrowed from RF0's original scope (a repo's whole component architecture) to the
# question he asked today (top-level folders → the 15 systems); the component-level read stays open in RF0. RF2 (apply, one phase at a
# time, staged and undoable) is next, after the 9 homes are confirmed.
