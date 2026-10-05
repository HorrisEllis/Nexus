spec:
  meta:
    name:     cli-data-code
    version:  1.0.0
    date:     2026-10-05
    release:  0.39.310 (base) → 0.39.311
    uuid:     nexus-cli-data-code-phasemap-v1-0000-2026-1005-jamesbrooks-001
    owner:    idearium.ui · idearium.api · cli · cortex · every system's own store
    status:   "MAPPED 2026-10-05; nothing built here yet. 0.39.311 also moved the Settings test off Playwright onto Clear Glass's driver (VP7's proof)."
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
      status: OPEN
      depends_on: []
      files: [lib/command-registry.js, guardian/commands, idearium/cli/index.js, cos/cli/index.js, copilot/cli.js, cli/nexus.js]
      does: >-
        Each system declares its CLI verbs as `.command` nodes it owns (lib/node-export.js envelope: name, system, args
        with types, route, writes, confirm, help). lib/command-registry.js reads the union; cli/nexus.js dispatches from
        it, so a verb exists once. A verb with no route is a gap, said.
      proof: "every verb cli/nexus.js and the Agent tab list comes from a .command node; one with no route is reported"
    CL2_the_agent_tab_is_the_endpoint:
      layer: ui
      status: OPEN
      depends_on: [CL1_commands_declared_by_their_system]
      files: [idearium/ui/js/app.js, idearium/api/index.js]
      does: >-
        `/<system> <verb> args` in the Agent tab: /help lists every system's verbs from the registry (not the hard-coded
        31, which become idearium's own declarations); the call goes to the owner's route through RAID, args as data, no
        shell; a verb that writes asks first; every call is ledgered with its result.
      proof: "a verb from each system runs from the Agent tab; a writing verb asks; nothing spawns a shell; each call is in the ledger"
    DS1_cortex_the_catalog:
      layer: foundation
      status: OPEN
      depends_on: []
      files: [cortex/memory/jaa-db.js, lib/context-atlas.js, intelligence/lattice/associative-lattice.js]
      does: >-
        Extends sovereign-node P5. Cortex keeps a CATALOG: every table/store, its owning system (§10.1), its location,
        count, hash, lineage — and the associative lattice over it. context-atlas finds data through the catalog, then
        reads from the owner. Built before any move, so a move is a catalog edit plus a contract, never a lost table.
      proof: "the catalog names an owner for every table in the shared store; an unowned table is a gap"
    DS2_one_system_moves_home:
      layer: foundation
      status: OPEN
      depends_on: [DS1_cortex_the_catalog]
      files: [cortex/memory/jaa-db.js, "<system>/data/"]
      does: >-
        One system at a time (the one with the fewest foreign readers first): its tables move into <system>/data/, a
        read shim on the old path warns on every read (§1.2) and names the reader, foreign readers move to the owner's
        contract, then the shim goes. Nothing lost (§0.3): the old rows are archived, the catalog records the move.
      proof: "after a move, no module reads the old path (the shim's warnings are zero over a full test run), the catalog points at the new home"
    CT1_one_pending_change_path:
      layer: service
      status: OPEN
      depends_on: []
      files: [lib/repo-inject.js, lib/code-edit.js, idearium/repo/work-surface.js, lib/repo-git.js]
      does: >-
        One lifecycle for code not yet in the repo: proposed (inject) → staged → applied (working tree) → committed, each
        state owned by exactly one store, each move one call. The work surface projection reads all of them and labels
        each change with where it lives.
      proof: "a change cannot be shown pending in one view and applied in another; each move is recorded"
    CT2_the_code_tab:
      layer: ui
      status: OPEN
      depends_on: [CT1_one_pending_change_path]
      files: [idearium/ui/js/code-tab.js, idearium/ui/js/work-surface.js]
      does: >-
        The Code tab is new code in the repo, in categories: Changes (every pending change, diffed, with
        apply / reject / revert / stage / commit, from CT1), Generation (what each agent is writing now, the build context
        it was sent, attempts, verdict), Search (today's tab). Provenance on every file. Verified in Clear Glass.
      proof: "in Clear Glass: a proposed change appears under Changes, applying it moves it to applied, the Generation pane shows the running build"

  open_questions:
    - "Q1: amend docs/AXIOMS-v3.1.md §4.1 from 'UI is tested via Playwright' to 'UI is tested in Clear Glass (clear-glass/src/driver/glass.js)'? A law changes only on your word."
    - "Q2 (CL2): may a writing verb run from the Agent tab after one confirmation, or only read verbs there and writing verbs from the terminal?"
    - "Q3 (DS2): which system moves home first? Proposed: the one with the fewest foreign readers, measured by DS1 — not the largest."
    - "Q4 (CT2): does the Agent tab's /injects stay, or does it point at the Code tab's Changes?"
