spec:
  meta:
    name:        idearium
    version:     4.7.0   # §0.39.257 (MINOR, new routes) — Agent tab: every tool (enforced), /tools /scope /debug /graph /run /test /diagnose, plain-language /help with aliases and closest-match; GET/POST /api/repos/:uuid/agent/tools|debug|graph. Previous 4.6.1: §0.39.256 (PATCH) — Agent tab live feed: streamed chunks build the reply live (reset replaces it), guardian.job.gate rows + the gate in the header. Previous 4.6.0: §0.39.253 (MINOR, new route) — three-way agent backend switch (ollama/copilot/guardian, no checkbox), per-compartment Ollama model, GET /api/ollama/models. Previous 4.5.0: §0.39.248 (MINOR, new route) — sync only: 0.39.245 (spec-engine manifest, 4.4.0) and 0.39.246 (responses to the downloads manager, repo-import graphs, 4.5.0) bumped idearium/package.json alone; this, index.js and lib/version.js stayed at 4.3.1.
                         # (DOM mutations, the reply's node anchor, stages, streaming text) via
                         # guardian-stream onFeed → os.broadcast (SSE only); late-reply lookup
                         # takes the guardian jobId. Previous — 4.3.0 §0.39.241 (MINOR, two new routes) — GET/POST /api/repos/:uuid/agent/late:
                         # the Agent tab picks up a reply guardian filed into Clear Glass's
                         # Responses index after copilot stopped waiting (lib/repo-agent.js
                         # findLate = read-only, adoptLate = learn/inject/log once per reply).
                         # Previous — 4.2.1 §2026-09-25 (PATCH, no API change) — every idearium
                         # data path goes through idearium/lib/data-dir.cjs, and a
                         # test process gets a throwaway root (lib/test-sandbox.js);
                         # repo-node.js and chunk-nodes.js stopped ignoring
                         # IDEARIUM_DATA_DIR; the event ledger follows
                         # NEXUS_DATA_ROOT. See lib/version.js 0.39.236.
                         # 4.2.0: §5.4 drift fix 2026-09-13 — was 3.2.0, out of sync with
                         # idearium/package.json's 4.1.0 since at least the
                         # 2026-09-03 "idearium 3.3.0" session. package.json is
                         # the one actually bumped per-release; this field had
                         # simply stopped being updated alongside it.
                         # §2026-09-22 — real bump, not drift correction this time:
                         # eravos mods (28 real ones, read live from eravos/ui/mods/)
                         # joined COS archetypes/blueprints as a third selectable
                         # category in the New Spec modal's "architecture & features"
                         # picker (lib/file-tree-plan.js's listEravosMods/fromEravosMod),
                         # and Brainstorm gained real AI assistance through the
                         # previously-uncalled copilot-adapter gate (POST /api/copilot/
                         # suggest) — an "assist" button on the capture row, a "refine"
                         # button on every unpromoted card, brainstorm.promote gained an
                         # optional text override. Full detail in lib/version.js's own
                         # 0.39.208/0.39.209 changelog entries.
    foundation:  nexus-system-foundation@1.0.0
    port:        4800
    uuid:        nexus-idearium-v3-0000-2026-0615-jamesbrooks-001
    purpose: >
      The idea manager and project repository. Every build starts here
      as a seed idea and progresses through phases.
      The Spatial lattice builds a resonance-weighted graph connecting
      ideas to specs to gaps. High-weight edges = strong association.

  core:
    schemas:
      - Idea:    "{ uuid, text, phase, tags, specRef, gapScore, weight, ts }"
      - Project: "{ uuid, name, phase, specFile, artifacts[], gaps[], ts }"
    phases: [seed, expanding, tensioned, specced, building, complete]
    axioms: [AX-001, AX-002, AX-003, AX-007, AX-008]
    constants:
      LATTICE_THRESHOLD:  0.65   # minimum edge weight to cluster
      PHASE_TRANSITIONS:  "seed→expanding→tensioned→specced→building→complete"

  # ── AX-008 (foundation addendum v1.1.0) ────────────────────────────────────
  # ✅ CLOSED 2026-06-29 — idearium/index.js's _broadcast() pushes every
  # os.emit() to all SSE clients on GET /sse. copilot/server.js had an
  # IDR_URL constant declared since at least v3 but never connected to it —
  # scoped, never wired. Added _connectIdeariumStream() (same pattern as
  # _connectCortexStream/_connectGuardianStream), wired into copilot's boot
  # sequence, and added hooks/idearium.hooks.js's 4th entry
  # (idearium-to-copilot, seam:idearium-copilot-bridge) so the wire is
  # registry-visible, not just code. idea/project/lattice activity now
  # reaches copilot live.

  events:
    emits:
      - "idearium.booted"
      - "idearium.idea.created"
      - "idearium.idea.phase_changed"
      - "idearium.project.created"
      - "idearium.project.spec_dropped"
      - "idearium.project.build_started"
      - "idearium.lattice.connected"
      - "idearium.lattice.crystallised"
    handles:
      - "guardian.job.complete → artifact.store"
      - "cortex.gap.found     → project.gap_attach"
      - "spec.compile.complete → project.build_start"

  modules:
    - id: idea-store
      description: "CRUD for ideas. Phase management. JAA-backed."

    - id: project-repo
      description: >
        Project manager. Accepts dropped zips via file-push router.
        Watches for .spec files and queues them for build.
        Links projects to ideas, specs, artifacts, gaps.

    - id: lattice
      description: >
        Spatial engine integration. Builds resonance-weighted graph.
        Nodes: ideas, specs, gaps, artifacts.
        Edges: reinforced on every association (view, link, co-occurrence).
        Connected-components clustering above weight threshold.
        High-weight edges crystallise into long-term cortex memory.

    - id: queue-listener
      description: >
        Watches for .spec files. On detect: validates, queues,
        dispatches to spec-compiler via Guardian.

  command_index:
    status: DONE       # verified 2026-09-03 -- GET /api/contract/live, 72 real endpoints, 72=72 against fresh grep
    spec: "docs/command-index-per-system.spec"
    note: "idearium's existing routes array (72 entries) maps directly -- cheapest phase, exposure not extraction."

  routes:
    external:
      - "GET  /health"
      - "GET  /contract"
      - "GET  /api/projects"
      - "POST /api/projects"
      - "GET  /api/projects/:id"
      - "POST /api/projects/:id/spec"
      - "GET  /api/ideas"
      - "POST /api/ideas"
      - "PUT  /api/ideas/:id/phase"
      - "GET  /api/lattice"
      - "POST /api/lattice/connect"

  handshake:
    components:
      - id: "idearium.projects.list"
        grammar: ["idearium projects", "projects", "proj"]
        route: { method: GET, path: "/api/idearium/projects" }
        description: "List all projects by phase"

      - id: "idearium.ideas.list"
        grammar: ["idearium ideas", "ideas"]
        route: { method: GET, path: "/api/idearium/ideas" }
        description: "List all ideas with phase and weight"

      - id: "idearium.ideas.create"
        grammar: ["idearium new idea", "new idea", "idea"]
        route: { method: POST, path: "/api/idearium/ideas" }
        description: "Create a new seed idea"
        params: [{ name: text, type: string, required: true }]

      - id: "idearium.lattice.view"
        grammar: ["idearium lattice", "lattice"]
        route: { method: GET, path: "/api/idearium/lattice" }
        description: "View the current idea-spec-gap lattice"

  ui:
    type: "panel in nexus-shell"
    hotswap: true
    panels:
      - "PROJECTS — phase board (seed→complete), spec drop zone"
      - "IDEAS — idea list with weight and lattice connections"
      - "LATTICE — resonance graph visualisation"

  built_2026_09_19_compiler_t0_and_bottom_up_build:
    what: >-
      idearium/spec-engine/compiler-t0.js — docs/spec-compiler.spec's T0 tier (directory tree + placeholder
      emission, zero LLM tokens), reusing addChunk()'s existing real chunk-creation path rather than a new
      one. addChunk() gained real dependsOn support (validated against the manifest's real sectionIds,
      fails loudly on a bad reference). New _topoOrder() — real Kahn's-algorithm bottom-up sort over
      build_order's own per-file dependsOn edges; throws on a genuine cycle rather than emitting an
      unbuildable graph in file-list order. isPrimitive derived directly from the real dependency graph
      (no dependencies of its own, but something else depends on it), not a separate, driftable flag.
    two_real_bugs_fixed: >-
      ingestFilesAsSpec() used to mark an empty/uncaptured file COMPLETE with a fabricated markdown-comment
      placeholder instead of failing — now calls failChunk() instead. RepoLayer.materialize() (repo/
      index.js) returned ok:true even when every chunk failed and zero real files were written — now
      ok:false when a non-empty manifest produces zero real output with nothing legitimately deferred to a
      real source file.
    also: >-
      lib/extract-code.js (real fenced-code-block extraction from an agent's raw chat reply, fails loudly
      on zero/unclosed/empty/ambiguous-multiple blocks) wired opt-in into warp-build-dispatch.js's
      generate() via chunk.realPath's extension (record.expectCode) — none of the 10 real blocks.yaml
      section types (all realPath:null) are affected; only a real target-file chunk with a real code
      extension opts in.
    proven: >-
      parseBuildOrder's dependency validation, _topoOrder against a chain/diamond/real-cycle (cycle fails
      loudly naming the exact stuck files), extractCode against 10 real cases including every failure path.
    honest_gap: >-
      No real caller in this system's own dispatch orchestration (index.js/api/index.js) yet builds a
      build_order chunk or calls emitStructure() as part of a real spec's own lifecycle — proven standalone,
      not yet wired end-to-end without a human calling it directly.

  built_2026_09_22_eravos_mods_and_brainstorm_ai:
    what: >-
      James: "add eravos organisms to architecture & features — select any combination" and "brainstorm
      should have full ai assistance." (1) lib/file-tree-plan.js gained listEravosMods()/fromEravosMod(),
      reading live from eravos/ui/mods/<name>/ (28 real, complete mods — a schema/schema.json +
      <name>.engine.js pair each; nexus-shared correctly excluded, no schema.json) exactly the way
      listCosTemplates() already reads live from cos/ — a third selectable category in the New Spec
      modal's "architecture & features" picker, alongside COS archetypes and blueprints. speceng.create's
      COS-only file-tree check widened to isFileTreeTemplate (either catalog). (2) brainstorm.promote
      gained an optional body.text override; the Brainstorm capture row and every unpromoted card gained
      an "assist"/"refine" action routing through the REAL, already-existing copilot-adapter gate (POST
      /api/copilot/suggest) — which had zero UI callers anywhere before this despite its own comment
      claiming "the wizard's 'ask copilot' button hits this."
    why_no_new_routes: >-
      Neither change added a route. Eravos mods ride the existing speceng.templates/speceng.create actions
      (already in this spec's routes:); brainstorm's AI assist calls copilot.suggest, a real route that
      already existed and is unrelated to idearium's own routes: list. Nothing here needed a
      registry-components.js entry for the same reason — see clear-glass.spec's own 2026-09-22 entry for
      where that class of gap DID need real registry work, on the clear-glass side of this same session.
    honest_gap: >-
      This spec's modules: list (idea-store/project-repo/lattice/queue-listener) and routes: list (11
      entries) both predate essentially everything idearium has become since — spec-engine, repos,
      compartment agents, the New Spec picker, Brainstorm, none of it is named there. Backfilling that is
      a real, separate, much larger pass than this one; this entry documents only what changed this
      session, not a reconciliation of the whole file against current reality.
    tests: >-
      tests/modules/test-file-tree-plan.js 63/63 (30 new eravos-mod checks), tests/modules/idearium-
      brainstorm-assist.test.js 17/17. Full detail in lib/version.js's 0.39.208/0.39.209 entries.
  built_2026_09_25_three_way_switch:
    shipped: "0.39.253"
    asked_by: >-
      James: "i want the cli in idearium to be like the 3 way cli in the floating menu cli in the tv ui. that way it doesn't use check box. also have ollamas models to choose from in a drop down menu for the agent tab."
    change: >-
      Agent tab CLI + Settings → Agents: segmented switch ollama · copilot · guardian (ui/tv-shell #cp-backend-toggle's
      shape), replacing the guardian on/off checkbox, which could not express copilot (stored provider 'auto'). Dropdown
      only where there is a choice: guardian agents, or Ollama's installed models (+ "default (<bridge default>)"; a
      stored model no longer installed is shown as such). lib/repo-agent.js: backendOf, settingsView.backend,
      per-compartment ollamaModel (setOllamaModel refuses a model not in the installed list, or when the list cannot be
      read), sent as payload.model on ollama dispatches only. GET /api/ollama/models (nexus-client → ollama :3749
      /api/models). CLI /model [name|default]. copilot 3.5.2 passes body.model to Ollama.
    open: Chromium click-through of the switch not run; copilot.spec is still not valid YAML (pre-existing).
    tests: tests/modules/test-repo-agent-provider.js 60/60 (18 new or rewritten).
    versionium: vtm-8b55aba2

  built_2026_09_26_live_feed_gates:
    shipped: "0.39.256"
    versionium: "vtm-d2b95239"
    asked_by: >-
      James: "supposed to stream it live as it happens." / "can we make the error specific to the gate? not just a generic error?"
    change: >-
      The Agent tab's live feed (_agentFeedIn / _agentFeedHtml): a chunk with reset replaces the live reply instead of
      appending (the 500 ms transcript streamer re-sends a re-rendered reply whole); streamed chunks (source transcript)
      update the live text without a log row each; guardian.job.gate frames (guardian/lib/gate-trail.js) are rows —
      "gate <label> · <state> <detail> → <fix>", failed in red — and the header shows the gate the job is at. No route or
      contract change: the frames arrive through the existing idearium.repo.agent.feed relay.
    tests: >-
      tests/modules/test-live-stream-and-gates.test.js GS-10 runs the feed functions extracted from ui/js/app.js;
      test-agent-feed AF-09 updated for the chunk's added fields.

  built_2026_09_26_agent_tools_help_graph:
    shipped: "0.39.257"
    versionium: "vtm-fc71e0ef"
    asked_by: >-
      James: "the toolscope for the agents tab. need the full capabilities, with the /help and tool awareness to help. need
      the commands as user friendly as possible. including debugging, using the intelligence system … also context on by
      default and wire in the graph". Asked which tools: "i want everything, at least for now."
    found: >-
      The repo agent's dispatch (lib/repo-agent.js) sent copilot a plain prompt — no tool loop — so the agent had no tools
      at all; its hat's 21-tool scope was listed but never used or enforced (the Agent tab said so). Context was already
      on by default (retrieval each prompt), but a question naming no code ("hello") got nothing, and graph.json — built
      by the import pipeline — was never read.
    change: >-
      lib/repo-agent.js: per-compartment toolScope 'all' (default) | 'project' (the hat's own list); every ollama or
      browser-agent dispatch sends body.tools { scope, identity (the hat), repoDir, maxIterations 6 } so copilot runs the
      real tool loop with the scope enforced; 'auto' (copilot's own cascade) is said to be unenforced. The reply carries
      toolCalls (shown under the answer). listTools (copilot's catalog, scope-marked), debugReport (syntax via node
      --check, unresolved imports from graph.json, this agent's failed exchanges with their gate sentence, and the
      intelligence system: intelligence_query failures, fault_log for this agent, diagnose gaps — each section names its
      source). lib/repo-context.js: matched chunks get "how these files connect"; nothing matched → the project map from
      the graph (size, top folders, entry points, most depended-on). Routes GET agent/tools, POST agent/debug, GET
      agent/graph; POST agent/settings toolScope. The Agent tab: /help regrouped in plain words (ask & investigate · run &
      check · the agent · code it writes) with aliases (/? /h /st /t /dbg /hist) and a closest-match suggestion for a
      typo; /tools [words], /scope all|project, /debug, /debug <question> (the agent investigates using the intelligence
      system), /graph [file], /run /test /diagnose; tool calls under each answer; the context line says when the graph
      was used.
    tests: >-
      tests/modules/test-agent-tools-and-graph.test.js 13/13 (C/D parts: a real repo through the repo layer and a stub
      copilot on :3750; the CLI helpers run from app.js); test-repo-agent, test-repo-agent-provider, test-repo-context
      updated for the intended changes. 13 mutations, each caught.
  built_2026_09_26_compartment_recursive_tabs:
    shipped: "0.39.262"
    versionium: null
    asked_by: >-
      James: "in idearium can you make the tabs much more recursive, deep and expanded fully? interconnected. i want
      ideas once promoted to move to the compartment idea section for brainstorming, problem solving, expanding, and
      improving".
    found: >-
      Promote turned a brainstorm into an idea and stopped: the idea landed in the flat Ideas list with nowhere to work
      it. Tabs were two one-level dropdowns (Create, Build); nothing nested and nothing linked across views.
    change: >-
      idearium.workbench (lib/idea-workbench.js, pure): members (ideas in the Compartment, parentIdea makes ideas
      recursive) and entries (lane brainstorm|problem|expand|improve — closed set, unknown lane is a hard error;
      parentUuid nests to any depth; links[] cross-reference any entry or idea, walked both ways). Tables
      idearium_workbench_members / idearium_workbench_entries (JAA). Routes GET /api/workbench, GET|POST
      /api/ideas/:uuid/workbench, POST .../workbench/admit, PATCH|DELETE /api/workbench/:uuid, POST .../spawn (entry →
      child idea, causal link, seeded lane), POST .../assist (copilot per lane, preview-first). brainstorm.promote admits
      the new idea and seeds its Brainstorm lane; SSE workbench.changed. UI (ui/js/compartment.js,
      idearium.ui.compartment): Compartment view (recursive idea tree, lane columns, link mode, fold, resolve, move lane,
      spin out, links view); Compartment tab dropdown recurses idea → child idea → lanes as flyouts; "Expand all"
      swaps the tab bar for a full navigator tree (views, ideas, compartment ideas + lanes, repos + every subtab).
    tests: >-
      idearium/test/idea-workbench.test.js 10/10; idearium/test/compartment-ui.smoke.cjs (jsdom); live API run on an
      isolated data dir: promote → add → nested add → bad lane refused → spawn → link → index → cascade delete.

  # ## ADDENDUM 2026-09-26 (0.39.264)
  # 1. Create, Build and the ideas/specs counters show only inside a repo (James: "this in idearium
  #    needs to only show in nested compartments/repos"): .nest-only + body.in-repo (_syncNestScope in
  #    ui/js/app.js); the navigator nests them under the open repo. Top level: Welcome + Repos.
  # 2. The nexus repo's Home atlas is written out (docs/atlases/nexus-atlas.md) with a contents list and,
  #    under each system, links into its nested atlas and its repo; new atlases for orchestrator,
  #    architect, eravos, core. nexus-self.js resolveWith()/indexOf() exported (the page's rules, testable);
  #    a glob reference opens its directory; code spans are no longer mangled by emphasis.
  # 3. GET /api/cos/testenv + POST /api/cos/testenv/setup (cos/testenv/setup-job.js); the Run menu offers
  #    "Set up the test VM" and its VM option runs the repo's plan; tests found by every convention.
  # 4. A new Eravos organism arrives from the Eravos frame (postMessage, frame-checked) as an idea, or
  #    the New Spec dialog filled in and linked to it.
  # Proven: tests/probe/nexus-atlas-home.js 17/17 in a real browser; test-nexus-atlas-refs 45/45.

  # ## ADDENDUM 2026-09-27 (0.39.267–269) — the hat on any backend, memory in builds, no Eravos in New Spec
  # docs/2026-09-27-agent-hat-memory-download-manager-phasemap.spec (H2, H3, G5, M5).
  # 1. Providers are lib/agent-providers.js (copilot, ollama, every guardian userscript on disk) — GET /api/agent-providers;
  #    the per-chunk select reads it, gains "default" (the repo's Agent-tab switch and hat), a hand pick is pinned
  #    (chunk.agentPinned), "" un-pins, unknown names refused.
  # 2. speceng.build and the codebase planners go through _buildIdentity(specUuid): a repo's spec wears the repo hat and
  #    builds on the repo's switch and Ollama model; a spec with no repo wears the_builder. buildChunkWithAgent resolves
  #    'copilot' first and records the provider that answered. Builds default to DEFAULT_MODEL (not the 7b).
  # 3. Memory: before a chunk goes out, lib/agent-memory.js recall() — the agent's own exchanges from the download
  #    manager and the files already finished in this spec (exports/requires) — sits between the hat and the prompt,
  #    beside WARP's cache key, not in it. Guardian is sent agentId (repo-<uuid>), hatInPrompt and fileName; Ollama
  #    answers are recorded. The build response names agentId and the memory used.
  # 4. New Spec lists no Eravos mods (GET /api/spec-engine/templates?include=eravos still does).

  # ## ADDENDUM 2026-09-27 (0.39.270) — the Idearium atlas, rewritten from the code
  # docs/2026-09-27-idearium-atlas-phasemap.spec (mapped before building). docs/atlases/idearium-atlas.md now describes
  # the system as it is: the process and its stores, the 7 views and 13 repo tabs, the Agent tab end to end (the hat,
  # one message's path, the backend switch, the 14 prompt blocks, context, both kinds of memory, the 109 tools and 3
  # scopes, every command, injects, the live feed, late replies, Settings → Agents, where its state lives, its 37
  # routes), ideas → specs → one chunk's build, repos (import, tiers L0–L8, snapshots, run, git/CI), NEXUS inside
  # Idearium, the 217 routes by group and the event names. Every reference resolves; test-nexus-atlas-refs now holds it
  # to 0 dead references. The earlier atlas is archived (docs/atlases/_archive/idearium-atlas.pre-0.39.270.md).

# ── ADDENDUM 2026-09-27 (0.39.271) — docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec ──
# Idearium is one app: the top bar is always Welcome + Repos; Create and Build are the last two entries of the
# open repo's own tab row, and their views carry a bar back to the repo ("two ideariums" — James).
# Phasemap + Roadmap are one Phases tab (idearium/repo/phases.js, docs/phases-manager.spec): every phasemap form,
# board/layers/table/maps, status, add, and build (Versionium snapshot first, then the repo's agent). Phasemap's
# verification tiers + graphs moved to the Intelligence tab. The Spec tab shows the living spec first
# (idearium/repo/living-spec.js); the spec-engine chunk builder is under "build manifest". Routes added:
# repo.phases.{get,runs,status,add,build}, repo.living-spec, nexus-self.{versions,snapshot}. Repo snapshot lists
# read the repo's own versionium branch, newest first (they read the first 200 commits of every repo). The run
# route takes `from` (continue a test.all) and keeps each failure's debug report.

# ── ADDENDUM 2026-09-27 (0.39.273) — docs/2026-09-27-idearium-codebase-toolkit-phasemap.spec, docs/code-intel.spec ──
# James: "I want idearium solid for building codebases. Fully built, enterprise grade. Agent tools completely solid,
# all context is easy to search and understand for each chunk."
# 1. Chunks are structural (lib/code-intel/chunker.js 2.0.0): never cut mid-body, a declaration's doc opens its chunk,
#    ≤150 lines (split at members / cases / sub-headings), every line once, ids from kind + qualified name. Measured
#    on 0.39.272: 1054 of 3584 chunks began at a nested function and 984 ended in the next symbol's doc.
# 2. Every chunk has a card (indexes/cards.json): kind, qualified name, signature, doc, one-line summary, neighbours,
#    what it uses and what uses it — each with its basis (import | same-file | name) — and its tests. A BM25 index
#    (indexes/search.json) makes the code itself searchable, not only symbol names and paths.
# 3. Routes: GET/POST /api/repos/:uuid/code/:op (idearium/repo/code-api.js) — overview, tree, search, grep, chunk,
#    outline, read, definition, changes; edit, write, delete, move, batch, check. Every write is an .inject (review mode
#    stacks a later edit onto the pending proposal; auto mode applies all-or-nothing); a syntax-breaking write is
#    refused unless force. /api/repos/:uuid/search and /chunks are unchanged.
# 4. The repo page has a Code tab (search by meaning or exact text; any chunk's card and code; links follow uses).
# 5. Agents: eleven idearium.code_*.tool tools; the harness scope lists code_map/search/chunk/read/edit/write/check +
#    loom.find (loom.read/write stay allowed, no longer listed); the persona and the card block name them.
# 6. RepoLayer.readTextFile/deleteTextFile: an imported file is read and deleted as its real bytes, not its chunk (a
#    chunk of a file over max_chunk_bytes is a truncated reading — proposing an edit against it wrote the truncation).
