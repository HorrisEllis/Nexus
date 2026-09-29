spec:
  meta:
    name:     graph-build-context-settings-memory
    version:  1.1.0
    date:     2026-09-28
    release:  0.39.277 (map revised on 0.39.276 + staging C0/C1) · nothing in THIS map is built yet
    uuid:     nexus-graph-build-context-settings-memory-phasemap-v1-0000-2026-0928-jamesbrooks-001
    owner:    idearium.repo.graph · idearium.spec-engine · idearium.spec-engine.warp-build-dispatch ·
              idearium.api.speceng.codegen · lib.file-tree-plan · lib.repo-agent · lib.repo-prompt-blocks ·
              lib.context-atlas · lib.agent-memory · lib.repo-hat · lib.code-edit · versionium.lib.engine ·
              cortex.core.raid.contract-intake · copilot.lifeline · guardian.ask · cortex.memory.jaa-db ·
              cortex.memory.table-compactor · guardian.jaa-store · ollama.server · loom.maps
    status:   mapped, not built — every phase below is open
    depends_on_spec: docs/2026-09-28-staging-self-heal-phasemap.spec (S0 fork point, S1 stage/promote)
    origin: >-
      James, 2026-09-28: "We need a dependancy graph per project." → "i really want like a uncommited instead of a
      whole nother repo. also like in that spec the building/coding needs to also use the agent/hat. need to make
      phases using chunks and dependancy graph, bottom up. then need to optimize memory as much as possible." →
      "The Eravos zips were to give you context." → "Make sure you follow the axioms. Using the atlas' as a map.
      Loom component registry. Have context be on at all times. Have full enterprise grade settings for each repo."
      → "just know every system should be sovereign self contained." → "here current versions." (0.39.276, C0, C1)
    scope: >-
      NEXUS's build pipeline for ANY imported repo. The ERAVOS 3.24 import and the 16:38–20:12 boot log are the
      observed test case (what the pipeline does to a real repo today). Nothing here targets ERAVOS.

  # ── FORGE-SKILL, the five questions (answered from evidence, §0.1) ─────────
  forge:
    current_phase: >-
      3 — Spec. This file is the spec; phase 4 (Build) starts only with the first phase below.
    last_known_good: >-
      0.39.274 boots and passes the post-boot vitals check ("ALL 9 REAL FIXES VERIFIED INTACT"). It does not stay
      up: by 20:12 cortex and orchestrator are at 5/6 crashes, free memory 8.9%.
    open_bugs: >-
      F-1 … F-12 below.
    session_intent: >-
      graph per repo; builds in place, uncommitted, hat-worn, context-on; graph-ordered chunk phases;
      full per-repo settings; memory down.
    warp_jaa_present: >-
      yes — WARP chunk dispatch active ("WARP chunk dispatch active — exact cache in the build path"); Jaa stores
      open in every process (that is itself F-7).

  # ── Drift, stated (§12.5) ──────────────────────────────────────────────────
  drift: >-
    An earlier draft of this map (same day) treated the ERAVOS import as the build target (cancel its state.js job,
    choose its kernel). Wrong reading; James: the zips were context. Those parts are removed; ERAVOS remains only
    as evidence and as the global-script fixture for G0.
    1.1.0 (2026-09-29): re-grounded on 0.39.276. Since 1.0.0 two things landed outside this map: (a) 0.39.276
    links the Code button's repo to the original repo (lib/repo-hat.js linkCoder, table repo_agent_links): one
    hat and one settings row, but still a SECOND repo — which contradicts B0/I3 here (see D2); (b) staging C0
    and C1 (cfr.collapse anchor, compound failure mode) built and merged in 0.39.277. And James set a law this
    map did not follow: every system sovereign and self-contained. 1.0.0 proposed things that break it — a
    cortex-owned writer for everyone's tables (M3), identity moved into lib/ so cortex could import it (C0),
    per-repo settings kept in cortex's shared store (R0). Those are rewritten below (I12, SV0–SV3).

  # ── The map this uses (docs/CLAUDE.md rule 1, §8.7) ─────────────────────────
  # For every file a phase touches: the atlas that explains it and the loom map that wires it, checked by grep on
  # 0.39.274 against the full path. NONE = a gap this map closes in A1 (atlas) or L1 (loom), not a guess.
  atlas_and_loom:
    - { file: idearium/repo/graph.js,                    atlas: [idearium-atlas, nexus-atlas],  loom: [observability-map, session-2026-08-14-map] }
    - { file: idearium/repo/import-pipeline.js,          atlas: [idearium-atlas, nexus-atlas],  loom: [idearium-codebase-map] }
    - { file: idearium/api/index.js,                     atlas: [idearium-atlas, components-atlas, nexus-atlas], loom: [idearium-codebase-map, agent-memory-map, one-idearium-map, cos-testenv-map] }
    - { file: idearium/spec-engine/index.js,             atlas: [idearium-atlas],               loom: [agent-memory-map, copilot-capability-map] }
    - { file: idearium/spec-engine/warp-build-dispatch.js, atlas: [idearium-atlas],             loom: NONE }
    - { file: lib/file-tree-plan.js,                     atlas: [idearium-atlas, core-atlas, loom-atlas], loom: NONE }
    - { file: lib/repo-agent.js,                         atlas: [idearium-atlas, core-atlas, nexus-atlas], loom: [idearium-codebase-map] }
    - { file: lib/repo-prompt-blocks.js,                 atlas: [idearium-atlas, core-atlas, nexus-atlas], loom: NONE }
    - { file: lib/context-atlas.js,                      atlas: NONE,                           loom: NONE }
    - { file: lib/repo-hat.js,                           atlas: [idearium-atlas, guardian-atlas, core-atlas], loom: [idearium-codebase-map] }
    - { file: lib/code-edit.js,                          atlas: NONE,                           loom: [idearium-codebase-map] }
    - { file: versionium/lib/engine.js,                  atlas: [versionium-atlas, core-atlas, nexus-atlas], loom: [observability-map, raid-events-and-tools-map] }
    - { file: cortex/core/raid/contract-intake.js,       atlas: [nexus-atlas],                  loom: [raid-events-and-tools-map] }
    - { file: copilot/lifeline.js,                       atlas: [nexus-atlas, clear-glass-atlas], loom: [agent-memory-map, observability-map] }
    - { file: guardian/ask.js,                           atlas: [guardian-atlas, clear-glass-atlas], loom: [copilot-capability-map] }
    - { file: cortex/memory/jaa-db.js,                   atlas: [nexus-atlas],                  loom: [session-2026-08-14-map] }
    - { file: cortex/memory/table-compactor.js,          atlas: [nexus-atlas],                  loom: NONE }
    - { file: guardian/jaa-store.js,                     atlas: [nexus-atlas],                  loom: [session-2026-08-14-map] }
    - { file: ollama/server.js,                          atlas: [nexus-atlas],                  loom: [session-2026-08-14-map] }
  atlas_note: >-
    idearium-atlas already documents the Agent tab end to end: compose = persona + this repo's prompt blocks, in
    order, "Nothing is added that cannot be seen and edited in Settings → Agents"; the backend switch; the
    repo_agent_settings table (backend, Ollama model, tool scope, inject mode, prompt blocks). This map extends that
    page; it does not start a second settings story (§10.3).

  # ── What exists (read, not recalled — §8.6) ───────────────────────────────
  exists:
    - >-
      idearium/repo/graph.js (MCO1) — per-repo graph; relations contains, belongs_to, imports, exports, depends_on,
      depended_on_by; traverse(), dependencyCone(), affected(), writeGraph()/readGraph(); unresolved edges kept.
      Extraction = require()/import regex only; `calls` declared absent.
    - >-
      idearium/api/index.js speceng.codegen — plans from the doc spec's prose (spec-digest + file-tree-plan), then
      getRepoLayer().ingest() a NEW repo and _ensureCompartment() a NEW compartment for the code spec.
    - >-
      idearium/spec-engine/index.js _buildFilePrompt — fixed layers kernel/engine/runtime/test; context = up to 12
      completed chunks of the new plan, 24000-char budget; the target repo's real files are not included.
    - >-
      idearium/spec-engine/warp-build-dispatch.js — carries record.hat and model to every provider in the cascade;
      hat not in the cache key. It does NOT compose memory, atlas, card or directory: chunk builds wear the hat but
      carry no context.
    - >-
      lib/repo-agent.js dispatch() — the full compose: hat persona + prompt blocks + contextFor() (card or code) +
      agent-memory recall + atlasFor() ({atlas}, {directory}). Honours noContext. ALWAYS_IN_SCOPE keeps
      nexus.context.tool available. Tool scope default 'harness' (all tools allowed, five listed) — James: "thats
      way too much to inject when we have tools they can use to get context".
    - >-
      lib/repo-prompt-blocks.js — defaults: context-card on, context-atlas on, context-directory on (tools),
      context-code OFF, context-map OFF.
    - >-
      repo_agent_settings (cortex JAA) — one row per repo: provider, ollamaModel, toolScope, inject mode, blocks.
      That is the whole per-repo settings surface today.
    - >-
      _buildIdentity(specUuid) in idearium/api/index.js — repo hat else the_builder; provider/model from the Agent
      tab; agentId; compartmentId.
    - >-
      cortex/core/raid/contract-intake.js _realAgentExecutor — dispatchToNcpAgent(content, { provider }): no hat,
      no context, no repo.
    - >-
      cortex/memory/jaa-db.js — one JaaStore over data/cortex/memory per process; skipTables only the two idearium
      spec tables (measured 2026-07-24: nine processes × the whole store).
    - >-
      cortex/memory/table-compactor.js — age cut (tier 'short', 24h) on event_log, component_ledger,
      cfr_tension_history, constitution_decisions, chat_log, schema_drift; count caps (startCaps) used only for
      sigma_records.

  # ── Found (evidence: ERAVOS import + 16:38–20:12 log) ──────────────────────
  found:
    - >-
      F-1 the planner invents paths — planned src/kernel/state.js for a repo whose root is source/; wrote it 0 bytes
      into a NEW repo. Planning never reads the target tree.
    - >-
      F-2 contracts are derivable from consumers — on the ERAVOS import, every consumer reaches kernel state through
      K.registry / K.wires / K.bus / K.assets / K.domains / K.ledger / K.fault (counted per file).
    - >-
      F-3 graph.js is silent on global-script repos — ERAVOS publishes globals loaded by a declared list
      (scripts.js); zero require/import edges; nothing marked unresolved (§1.2).
    - >-
      F-4 the real graph there has a cycle (canvas-wm ↔ organism-factory) and an upward edge (kernel/intake.js:184 →
      global.Workspace) — the fixed layer vocabulary cannot order either.
    - >-
      F-5 no kill switch — one impossible file write re-dispatched from code spec 8efc38d3 and RAID contracts
      43faae44 / 3e351e90 / 5e728176, each retry ingesting a new "raid-contract-…" spec.
    - >-
      F-6 bare builds — "Write the complete file …" jobs go to chatgpt /ask with no hat (dc615f16, 065fc400, 4194cc0f,
      c7e8d372, 73f35f39, 526eca74) while a separate "[hat: the_builder]: build" job carries only the word "build"
      (e75bca85, 5d3492d5, ae3e726e, cc2bb79b). Source of the one-word job not traced yet.
    - >-
      F-7 crash-loop on memory — 20:09–20:12 cortex 5/6, orchestrator 5/6 (V8 OOM at 135MB), copilot OOM twice at boot,
      intelligence OOM, 0xC0000409 on diagnostic/guardian/versionium; free memory 8.9%.
    - >-
      F-8 why — ~13 processes each load the shared store: event_log 30,494 → 65,584 rows in 3.5h (~10k/h);
      cfr_tension_history 15,216 → 30,473; copilot component_ledger 26,445 → 57,619. A 24h age cut on 10k/h settles
      near 240k rows per process. "ledger: copilot event" = 90,525 in intelligence's scan.
    - >-
      F-9 write contention — repeated "BREAKING STALE FLUSH LOCK (event_log) >10000ms", EPERM on tmp rename, ENOSPC at
      19:51.
    - >-
      F-10 GPU — qwen2.5-coder 3B at num_ctx 6144–7168 → cudaMalloc OOM; Electron GPU process exit 34; adversarial probe
      keeps firing every 600s.
    - >-
      F-11 builds carry no context — warp-build-dispatch sends hat + prompt; memory, atlas, card and directory reach
      only Agent-tab chats. The same repo's agent knows more in chat than when it builds.
    - >-
      F-13 SOVEREIGNTY CENSUS (0.39.276, static require/import from one system folder into another; lib/ excluded):
      263 edges. Largest: orchestrator → cortex 29 (cortex/memory/jaa-db 17), copilot → cortex 22 (jaa-db 19),
      idearium → cos 17, guardian → cortex 13 (cortex/core/raid 6), architect → cortex 11 (raid/contract-intake 10),
      intelligence → cortex 10, guardian → intelligence 9, orchestrator → nexus 8, idearium → cortex 8,
      diagnostic → intelligence 8. Systems reach into each other's internals instead of calling a contract.
    - >-
      F-14 THE SHARED LAYER IS BOUND TO ONE SYSTEM'S DATABASE. 582 imports from systems into lib/, and 78 files IN
      lib/ require cortex/memory/jaa-db (lib/repo-agent.js keeps repo_agent_settings in cortex's store). Any system
      that uses lib/ therefore opens cortex's whole memory store. That is the mechanism behind F-7/F-8:
      sovereignty and memory are the same fix.
    - >-
      F-12 per-repo settings are four fields — no write policy, no protected paths, no gates, no quotas, no audit of
      setting changes, no export/import.

  missing:
    - >-
      G-1 global-symbol + declared-load-order pass in graph.js.
    - >-
      G-2 consumer-usage (uses_member) edges.
    - >-
      G-3 graph generated and stored per repo on import/sync; SCCs.
    - >-
      G-4 codegen binds to a new repo instead of the source repo; plans from prose.
    - >-
      G-5 no planned-path gate against the real tree; no re-check on retry.
    - >-
      G-6 RAID executor and warp dispatch do not go through one identity + compose path.
    - >-
      G-7 chunk order from a fixed layer list, not edges.
    - >-
      G-8 chunk context = other new chunks, not the file's real cone and consumers.
    - >-
      G-9 acceptance = "non-empty response".
    - >-
      G-10 no rate bound on firehose tables; no per-process table declaration; many writers per table.
    - >-
      G-11 context switchable off on build paths; builds bypass compose entirely.
    - >-
      G-12 no enterprise-grade per-repo settings model, UI, audit or export.
    - >-
      G-14 no sovereignty contract: nothing declares what a system exposes or consumes; nothing stops a require()
      into another system's folder or a system opening another's store; the graph cannot report crossings.
    - >-
      G-13 atlas/loom gaps: lib/context-atlas.js (no atlas, no loom), lib/code-edit.js (no atlas), lib/file-tree-plan.js,
      lib/repo-prompt-blocks.js, cortex/memory/table-compactor.js,
      idearium/spec-engine/warp-build-dispatch.js (no loom).

  # ── Axioms applied (AXIOMS-v3.1 → this map) ────────────────────────────────
  invariants:
    I1 (§10.3, §8.6): >-
      one authority per concern, OWNED BY ONE SYSTEM and reached by its contract: the graph, identity, compose and
      per-repo settings (idearium); a system's memory (that system). No parallel copies, and no other system
      reaching the authority's internals to avoid the contract.
    I12 (sovereignty — James 2026-09-29): >-
      every system is sovereign and self-contained. It owns its code, its data store, its settings, its lifecycle and
      its spec/atlas page. It crosses to another system ONLY through a declared contract: an HTTP route in its
      interaction contract, a bus event, or the host SDK. No require()/import into another system's folder; no
      system opens another system's store. A system can be stopped, moved or replaced without editing another
      system's code. The graph reports every crossing (relation crosses_system); a new crossing is a defect.
    I2 (§1.1, §1.2): >-
      every inferred edge carries resolution:'inferred' and the pass that made it; unknown stays unknown. Every
      refusal, hold, skip or budget cut names its reason.
    I3 (§2.1, §0.3): >-
      builds land UNCOMMITTED in the source repo's working tree, a Versionium snapshot before every chunk write
      (causedBy = chunk uuid). Commit = promote. No new repo, no new compartment for an existing repo. Retention cuts
      write their compaction_log summary first.
    I4 (§8.7, rule 3): >-
      every build dispatch wears the repo identity AND the repo's full compose. A build-intent job without a hat is
      refused loudly by the dispatcher.
    I5 (context on at all times): >-
      no build or agent path may run with noContext. The context blocks card, atlas, memory and directory are
      LOCKED ON for build dispatches: their text stays editable in Settings → Agents (James's rule: nothing sent
      that he cannot see and edit), but they cannot be switched off, and the preview shows them. What varies is
      budget, never presence. nexus.context.tool stays always in scope (ALWAYS_IN_SCOPE, existing).
    I6 (§16.1): >-
      order = the graph's topological layers; an SCC is one chunk group; a declared load order that contradicts an
      observed edge is reported, never silently obeyed.
    I7 (§1.1): >-
      a chunk is done when it parses AND every consumer's used members still resolve (contract diff) AND the repo's
      configured gates pass. "Non-empty response" is not acceptance.
    I8 (§12.5, rule 4): >-
      every phase adds dated ADDENDA to the specs that own what it touched and EXPANDS the atlas page for each
      touched file (prose + structure); test-nexus-atlas-refs holds every reference real.
    I9 (rule 3, §1.1): >-
      every new component, hook and wire is registered in loom WITH its real require()/consumer edges, only after the
      code lands (declared is not served).
    I10 (§7, measured): >-
      memory phases close on before/after numbers per process (RSS, heap, rows loaded per table), never on a claim.
    I11 (settings): >-
      a setting that changes build behaviour is versioned, audited (who, when, old, new) in the repo's ledger, and
      exportable as the repo's own node file. Defaults are safe (review/uncommitted, gates on, quotas finite).

  # ── Pushback recorded (conflicts resolved in this map, not silently) ───────
  tensions:
    T1: >-
      "Context on at all times" vs James 0.39.266 ("way too much to inject when we have tools") and the local model's
      ctx ceiling (F-10). Resolved as I5: context is always PRESENT (card, atlas, memory, directory, tool), never
      forced to be LARGE. context-code / context-map stay budgeted by the repo's context settings per backend; a
      3B Ollama model gets a smaller budget than a browser agent. Presence locked, size configured.
    T2: >-
      "Uncommitted" vs staging-self-heal I2 ("working tree untouched until promote"). Proposed: I3 governs builds
      you direct into imported repos (git diff is the review surface); staging I2 keeps governing the autonomous heal
      loop on nexus-self. The repo setting build.writeMode carries both (uncommitted | staging), default per repo
      kind. OPEN — needs James (D1).

  # ── Phases (bottom-up; each chunk = one file unless named as a group) ──────
  phases:
    # Tier 0 — keep the machine up (§16.1: nothing is provable while it crash-loops)
    - id: M0
      name: baseline — RSS/heap and rows loaded per table, per process, at boot and +60 min
      files: [nexus/autopilot.js (resource-monitor), guardian/jaa-store.js (existing "Loaded N rows" lines)]
      closes: [I10 precondition]
      note: collect from what already reports; no new monitor.
    - id: M1
      name: bound the firehoses by rate
      files: [copilot/server.js (ledger writer), cortex/memory/table-compactor.js, cortex/memory/tiers.js]
      closes: [F-8, G-10 part]
      depends_on: [M0]
      note: >-
        (a) at the source: why copilot writes ~90k ledger events — sample or aggregate at the writer; (b) in the
        store: startCaps() for event_log, cfr_tension_history, component_ledger, including the per-system ledger
        stores (*/data/ledger) the cortex compactor never opens. Caps sized from M0.
    - id: M4
      name: disk — what filled the drive
      files: [guardian/jaa-store.js (tmp+rename)]
      closes: [F-9 part]
      note: suspect orphan *.tmp from failed EPERM renames; count them before changing anything.

    # Tier 1 — the graph
    - id: G0
      name: global-symbol + declared-load-order pass
      files: [idearium/repo/graph.js, idearium/spec/idearium.repo-graph.spec, tests/modules/test-repo-graph.js]
      closes: [G-1, F-3]
      note: >-
        defines_global, reads_global (inferred), load_order (from a detected loader list). Comments stripped first
        (the import pass's discipline). A global that collides with a platform global (History …) must resolve to a
        definer in the repo, else unresolved. Fixture: the ERAVOS import — must reproduce the cycle and the upward
        edge.
    - id: G1
      name: uses_member edges
      files: [idearium/repo/graph.js]
      depends_on: [G0]
      closes: [G-2, F-2]
    - id: G2
      name: graph per repo on import and sync; SCCs; staleness
      files: [idearium/repo/import-pipeline.js, idearium/repo/graph.js]
      depends_on: [G1]
      closes: [G-3, F-4]
      note: GRAPHING step, graph.json beside atlas.json, atlasHash already recorded; Tarjan SCC output.
    - id: G3
      name: process → jaa table edges for nexus-self
      files: [idearium/repo/graph.js (reads_table / writes_table)]
      depends_on: [G2]
      note: the input M2 needs; replaces the hand-built HEAVY_SINGLE_CONSUMER_TABLES list with a derived one.

    # Tier 2 — per-repo settings (the policy every later phase reads)
    - id: R0
      name: repo settings model — repo_agent_settings grows into the full per-repo policy
      files: [idearium repo-settings module (the one reader/writer, in idearium; lib/repo-agent.js getters read idearium's store, not cortex's),
              cortex/memory/tiers.js (table tier), docs/repo-settings.spec (new)]
      closes: [G-12, F-12]
      note: >-
        Extend the existing row (§8.6), do not add a second table — and move it (I12): repo_agent_settings and
        repo_agent_links live in cortex's shared store today (F-14); they belong in idearium's own store, migrated
        with every row kept (§0.3). Groups and defaults:
        identity   — hat (repo hat, else the_builder), provider, fallbackChain [ordered], ollamaModel, toolScope
                     (harness | all | project), planner hat (default = build hat).
        context    — locked-on blocks (card, atlas, memory, directory); budgets per backend {ollama, guardian,
                     copilot} for code/map/atlas chars; memory recall depth; atlas budget (today 2400).
        build      — writeMode (uncommitted | staging), snapshotPerChunk (locked true), allowedRoots (derived from the
                     tree, editable), protectedPaths (never written), pathHats (glob → hat, codeowners-style),
                     maxConcurrentChunks, retry {max, backoff}, haltOnUnreachableTarget (locked true).
        gates      — syntax (required), contractDiff (required), cos/ci suite (required | optional | off),
                     wire-integrity (required), per-gate timeout.
        promote    — who/what may commit; autoPromoteClasses (default: none for imported repos; ripple only for
                     nexus-self per staging I4); approval required for wave/tidal.
        quotas     — provider calls/hour, prompt chars/day, local-model concurrency, per repo.
        memory     — graph regeneration trigger (import | sync | on-change), repo data retention.
        security   — secrets never enter a prompt (redaction list), env allow-list for build sandboxes, tool deny-list,
                     network egress for COS runs.
        audit      — settingsVersion; every change → the repo's component ledger row {who, when, key, old, new, why}.
        Every value has a stated default and a reason; nothing is implicit.
    - id: R1
      name: settings export/import as the repo's node file + audit trail
      files: [lib/repo-settings.js, idearium/repo/living-spec.js (repo spec folder already parsed)]
      depends_on: [R0]
      note: >-
        .repo-settings node in the repo's spec folder: diffable, versioned by Versionium like any file, importable
        onto another repo. "Each system owns writing/storing its own data."
    - id: R2
      name: Settings tab — full panel, grouped, locked items shown as locked with the reason
      files: [idearium/ui/js/agent-blocks.js, idearium/ui (Settings tab), idearium/api/index.js (repo.settings.* routes)]
      depends_on: [R0]
      note: >-
        Extends Settings → Agents (idearium-atlas §Settings → Agents); one panel per group; preview shows the exact
        build prompt, context included. Lead Designer lens: a locked setting says why it is locked.

    # Tier 2b — sovereignty (I12). The graph measures it; fixes run largest-crossing-first.
    - id: SV0
      name: crosses_system in the graph + the census as a standing number
      files: [idearium/repo/graph.js (relation crosses_system on nexus-self), loom/scanners (read-only consumer)]
      depends_on: [G2]
      closes: [F-13 as a live number]
      note: >-
        System = a top-level folder with its own entry in autopilot's supervise list. Every import from one system
        folder into another is a crosses_system edge with both ends named. A phase may not raise the count.
    - id: SV1
      name: sovereignty contract per system — exposes / consumes
      files: [each system's interaction contract (guardian/interaction-contract.json is the existing shape), loom
              registry (hooks/wires are the contract), docs/sovereignty.spec (new)]
      depends_on: [SV0]
      closes: [G-14]
      note: >-
        Each system declares what it exposes (routes, events) and consumes. Loom's wires ARE these declarations (rule
        3); a crosses_system edge with no matching declared wire is the defect list.
    - id: SV2
      name: data sovereignty — lib/ and the systems stop opening cortex's store
      files: [cortex/memory/jaa-db.js (cortex only), the 78 lib/ files that require it, per-system importers
              (copilot 12, intelligence 8, versionium 6, loom 6, guardian 5, orchestrator 4, idearium 4, …)]
      depends_on: [SV1, M1]
      closes: [F-14; absorbs M2]
      note: >-
        A lib/ helper that needs storage takes the CALLER's store (injected), never cortex's. Each system opens only
        its own store. Largest importer first, measured against M0 after each. M2's goal by the right road: a process
        loads only its own tables because it only has its own store.
    - id: SV3
      name: code sovereignty — internal reaches become contract calls
      files: [architect → cortex/core/raid/contract-intake.js (10), guardian → cortex/core/raid (6), guardian →
              intelligence (9), diagnostic → intelligence (8), idearium → cos (17), cortex → copilot/lifeline.js (2), …]
      depends_on: [SV1]
      note: >-
        Largest crossing first. Each becomes a call to the owner's declared route or event; a pure stateless helper
        may move to lib/ (D3). Proof per step: SV0's number drops.

    # Tier 3 — one identity, one compose, context always on
    - id: C0
      name: one identity resolver
      files: [idearium/api/index.js (_buildIdentity stays; exposed as GET /api/repos/:uuid/identity), idearium interaction contract]
      depends_on: [R0]
      closes: [G-6 part]
      note: >-
        1.1.0 (I12): NOT moved into lib/. Identity belongs to idearium, which owns repos and hats; other systems ask its
        route. 0.39.276 already resolves the original repo's hat through the coder link — reused, not rebuilt.
    - id: C1
      name: builds compose through lib/repo-agent.js — hat + blocks + card + atlas + memory + directory
      files: [idearium/spec-engine/warp-build-dispatch.js, lib/repo-agent.js (export compose for builds)]
      depends_on: [C0]
      closes: [F-11, G-11]
      note: >-
        The chunk prompt becomes the message; compose wraps it exactly as the Agent tab does; budgets from the repo's
        context settings per backend. Cache key stays the chunk contract (hat already excluded); context excluded
        from the key the same way, recorded on the record.
    - id: C2
      name: RAID executor wears the identity and the compose; bare build jobs refused
      files: [cortex/core/raid/contract-intake.js (_realAgentExecutor), copilot/lifeline.js (dispatchToNcpAgent opts), guardian/ask.js]
      depends_on: [C1]
      closes: [F-6, G-6]
      note: >-
        Trace the one-word "[hat: the_builder]: build" job first (source unknown). RAID asks idearium's identity route
        and hands the build to idearium's compose, instead of composing itself (I12: cortex stops importing
        copilot/lifeline.js). Guardian: intention 'build' with no hat → refused, reason named.
    - id: C3
      name: noContext cannot reach a build path
      files: [lib/repo-agent.js (dispatch, adoptLate), lib/repo-prompt-blocks.js]
      depends_on: [C1]
      closes: [I5]
      note: >-
        grep shows no production caller passing noContext:true on 0.39.274; make it impossible on build intents
        (refused with reason) and mark card/atlas/memory/directory locked in the block model.

    # Tier 4 — build in place, graph-ordered
    - id: B0
      name: codegen binds to the source repo; plan from the graph; path gate
      files: [idearium/api/index.js (speceng.codegen), lib/file-tree-plan.js]
      depends_on: [G2, R0]
      closes: [G-4, G-5, F-1, F-5]
      note: >-
        Doc spec that belongs to a repo → code spec binds to THAT repo and compartment; no ingest(). Planner gets the
        graph (files, layers, SCCs, uses_member). Planned path outside settings.build.allowedRoots or inside
        protectedPaths → rejected with reason. A retrying chunk re-runs the gate and halts instead of re-dispatching.
    - id: B1
      name: uncommitted writes + snapshot per chunk
      files: [lib/code-edit.js, versionium/lib/engine.js]
      depends_on: [B0, staging S0]
      note: blocked on D1 for writeMode 'staging'; 'uncommitted' can land first.
    - id: B3
      name: phases = graph layers; chunk = file or SCC group; prompt = the real cone
      files: [idearium/spec-engine/index.js (_buildFilePrompt, createFileTreeSpec, dependsOn)]
      depends_on: [B0, C1, G1]
      closes: [G-7, G-8]
      note: >-
        dependsOn from edges; topological layers; SCC dispatched as one group; prompt carries the file's current
        content, the members it uses from each dependency, and how its consumers use it, within the repo budget.
        pathHats decide which hat builds which file.
    - id: B4
      name: per-chunk acceptance — parse + contract diff + configured gates
      files: [cos/runtime/syntax-check.cjs (reuse), idearium/repo/graph.js (affected()), cos/ci (reuse)]
      depends_on: [B3]
      closes: [G-9, I7]
      note: failure holds the chunk with the missing members named; B1's snapshot is the rewind.

    # Tier 5 — memory, once the graph can say who needs what
    - id: M2
      name: per-process declared tables
      files: [cortex/memory/jaa-db.js, guardian/jaa-store.js]
      depends_on: [G3, M1]
      note: allow-list per entry point from G3; everything else lazy-loads (path exists and logs). Measured vs M0.
    - id: M3
      name: one writer per high-volume table
      files: [cortex/memory/jaa-db.js, guardian/jaa-store.js, cortex/boot.js]
      depends_on: [M2]
      closes: [F-9]
      note: >-
        1.1.0 (I12): not "cortex owns everyone's writes" — each system owns its high-volume tables in its own store
        (copilot's ledger in copilot, diagnostic's in diagnostic); cortex keeps what cortex produces. Readers use the
        owner's route or bus. Append-only journal vs JSON rewrite decided per store from M0.
    - id: M5
      name: GPU / local model
      files: [ollama/server.js, copilot/server.js (adversarial probe)]
      depends_on: [M0, R0]
      closes: [F-10]
      note: serialize local calls, num_ctx from the repo's ollama budget (R0), skip the probe under pressure.
    - id: M6
      name: intelligence noise at the source
      files: [intelligence (crystallisation), interstitial_spaces writer]
      depends_on: [M1]
      note: >-
        meta-scan already names "intelligence: command invoked" as noise; suppress before write (55 → 254 rows today).

    # Every phase, not a phase at the end
    - id: L1
      name: loom registration with real wires (rule 3)
      files: [loom/maps/idearium-codebase-map.js (build path: file-tree-plan, repo-settings, build-identity,
              repo-prompt-blocks), loom/maps/agent-memory-map.js (context-atlas), loom/maps/observability-map.js
              (table-compactor, graph relations), loom/maps/raid-events-and-tools-map.js (executor identity)]
      depends_on: [each phase's code landing]
      closes: [G-13 loom part, I9]
      note: >-
        Mirror loom/maps/warp-map.js. Wires from real require() and consumer edges; source-scanned files get
        boundary hooks only where the scanner cannot see them. No declaration ahead of code.
    - id: A1
      name: atlases and specs expanded with each phase
      files: [docs/atlases/idearium-atlas.md (build path, Settings → Agents → full repo settings, context-on),
              docs/atlases/core-atlas.md (lib/context-atlas.js, lib/code-edit.js), each system's own atlas page for
              its store and contract (I12), docs/atlases/nexus-atlas.md (memory model), idearium/spec/idearium.repo-graph.spec,
              docs/code-intel.spec, docs/SPEC-REGISTRY.spec, tests/modules/test-nexus-atlas-refs.test.js (holds refs real)]
      depends_on: [each phase]
      closes: [G-13 atlas part, I8]
      note: dated ADDENDA, never silent edits; an atlas never names a file that has not landed.
    - id: X1
      name: axioms pass + Six Lenses before each phase closes
      note: >-
        Per phase: §1.1 proof by a real run, §1.2 every failure named, §10.3 no second truth layer, §0.3 nothing lost,
        version bump in lib/version.js (first build phase → 0.39.275). Lenses: Cybersecurity (secrets out of prompts,
        protectedPaths, egress), Designer (locked settings explain themselves), Senior Dev (SCC/cycle boundaries),
        QA (planted wrong path must be rejected; planted consumer break must hold the chunk), Critical User (one panel,
        safe defaults), Adversary (a prompt that asks the agent to write outside allowedRoots).

  decisions_needed:
    D2: >-
      0.39.276 keeps the Code button's second repo and links it to the original (one hat, settings in the original).
      This map's B0/I3 builds IN the original, uncommitted — no second repo. Sovereignty (I12) favours one repo: a
      linked coder repo is a standing cross-repo dependency. Keep the link as the transition and make B0 the default,
      or keep the link as the model?
    D3: >-
      lib/. Self-contained can mean (a) lib/ is the platform SDK — a versioned package each system declares, owning NO
      state after SV2 — or (b) each system vendors its own copy (13 copies of the same code, §10.3). Proposed: (a).
    D1: >-
      T2 — uncommitted working tree for directed builds into imported repos, staging branch for the autonomous heal
      loop? (proposed). Or one mode everywhere.

  order: >-
    M0 → M1 → M4 → G0 → G1 → G2 → SV0 → SV1 → R0 → C0 → C1 → C2 → C3 → B0 → B1 → B3 → B4; R1/R2 after R0; SV2 (absorbs M2) and SV3 after SV1, largest crossing first; G3 → M3 alongside
    Tier 4; M5 after R0; M6 after M1. L1, A1, X1 inside every phase.
