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
