  BX0b_retire_brainos_page:
    status: DECIDED
    question: >-
      When the Code tab reaches every BrainOS feature (the census, BX1), is ui/brainos archived and Clear Glass's "⬡ BrainOS" row pointed at
      the Code tab's Flow view — or do both stay?
    chosen: >-
      His, 2026-10-21, asked with the two options (archive it — the coder's recommendation — or keep both): "Archive it". Archived, not
      deleted, once the census shows every feature reached; the menu row opens Code → Flow.

  BX0c_float:
    status: DECIDED
    question: >-
      The BrainOS float (a Clear Glass overlay, 10 tabs, its own blue look): rebuild it in Idearium's style on the same data, or retire it?
    chosen: >-
      His, 2026-10-21, offered "rebuild it" or "retire it (the coder's lean)": "What if we rebuilt it into a small widget for clearglass
      provider pages, dynamic to provider? Either that or retire it." His idea: a small widget on Clear Glass's provider pages (claude.ai,
      chatgpt.com, gemini, perplexity, deepseek …) whose contents follow the provider it sits on. The coder's reading, to confirm, of "dynamic
      to provider": that provider's agent node and health, its queue and current job, the account the tab runs as, its userscript, and the
      route it belongs to — the float's AGENTS/JOBS/USERSCRIPTS tabs narrowed to one provider; the rest of the float retires into the Code tab
      and Clear Glass's panels. BX10 builds the widget; the old float is archived with ui/brainos.

  BX0d_order_against_the_pipeline:
    status: DECIDED
    question: Order against the open pipeline work.
    chosen: >-
      His, 2026-10-21, offered three orders: "Fixes, then graph (Recommended)". The root causes first (RC5 where "Gemini said" enters file
      paths; RC6 the unowned Ollama job every ~90 s), then BX1–BX3 (the pipeline as a graph), then BX5 (PC1's controls) and BX7 (AB1's
      auto-advance) as the graph's controls, then the rest.

# BrainOS rebuilt in Idearium's style and brought into the Code tab: the pipeline as a live graph, the mesh, the editor, automation (2026-10-21)

origin: >-
  James, 2026-10-21: "Now back to the pipeline workflow and automation in idearium. Look at the phases for idearium and the pipeline. Then we
  should be looking into and plan a migration into BrainOS, into coding tab and rebuilding the current BrainOS to fit the style of idearium and
  migrating and integrating it into ideariums current coding tab and integrate the features into it."

Build contract: docs/brainos-in-idearium.spec (emerge module format, specDepth 1.0). Status: PLANNED — nothing built.

## Ground truth (2026-10-21, read from the code and the maps)

Pipeline (docs/pipeline.spec is the as-built record): ▶ build = POST /api/repos/:uuid/phases/build → _phaseBuild (idearium/api/index.js:785):
refusal gates DG1 (open deps), DG3 (DAG), DG2 (no graph) → Versionium snapshot → rung ladder (lib/pipeline-routing.js; learned order, memory
fit, Gemini first among browser coders) → plan (lib/phase-plan.js) → test first → verify first (COS sandbox) → build (runContract through
RAID, or runPlanned file by file) → landing only through lib/repo-inject.js → proof and a row per step in idearium_phase_runs. Last pipeline
work: 0.60.170–172. Open in it: RC5 (where "Gemini said" enters paths), RC6 (an unowned Ollama job every ~90 s), VF2–VF4, VF5's reviewer gate,
AQ1–AQ3 (plan/test conflicts ask him; lib/plan-conflict.js not built), DG4/DG5 (fix Nexus's own maps; show the DAG in the brief and the UI),
AB1's auto-advance (no lib/autobuild.js / nextReady), AB2, SET1/SET2, DC1, PC1 (pause / retry from a step / pin an agent), CE11, CV5, TB7a–d
(edges recorded, every step kept, run graph with zoom, node controls), CT0/CT1 (census, fewer wider tabs). Automation that exists: the build
queue timer, the run watchdog (stall retry, rejection retry, economy resume, daily cap), RAID's back-off, Clear Glass automation workflows with
cron (clear-glass/src/automation/cron.js) — no workflow can start a phase build yet.

BrainOS (ui/brainos, 11 files, ~196 KB; served by the orchestrator's /ui/ on :9000; Clear Glass menu "⬡ BrainOS"): CANVAS (heartbeat-gated
mesh nodes), node right-click menu (spawn, dispatch, open, health, settings), drag-to-connect routes, DEPLOY, BAYES (CFR field), PIPELINE chain
builder (step popup, JSON import/export, SUGGEST via RAID decide), AUTOMATION workflow editor, right panel (NODE, CHAT LOGS, PIPELINE/RAID
queue, TOOL CALLS, ACTIVITY), and ui/brainos-float (10 tabs). Every call is a browser fetch to hardcoded 127.0.0.1 ports (7704, 7701, 7820,
3748, 7825, 4800). Eravos fire theme with embers and scanlines (against its own spec's no-decorative-motion). Stale: the interaction contract,
4 of its 10 tests (known gaps) and loom's entries point at the removed brainos.js. Its phases: P1, P2 done; P3, P4 open; P5 blocked (its WebGL
engine was removed with ERAVOS); the agent-suite map (AS1…RD1) parked.

Idearium's Code tab (idearium/ui, :4800): views files · changes · plans · runs · COS (placeholder); CX_PANELS (15 sub-panels) and a dock
(Outputs, Changes, Tasks, Context, Tools); one SSE stream fanned out in app.js. No pipeline graph in the Code tab (the DAG is only in Phases).
CE9 asked for "pipeline (the run as a graph … drawn with the mesh's route-graph) … One component, mounted in the Code tab and in the Clear
Glass mesh panel (BrainOS stays coupled …)" — shipped without the graph. Style: css/nexus-theme.css tokens (--nx-*, --ac-*), theme.js
palettes/accents/motion, .cs-* panes and chips; tests run in Clear Glass.

## Readings (to confirm)

- "a migration into BrainOS, into coding tab": BrainOS's features move into the Code tab (his 2026-10-15 "i want brainos built for these kinds
  of pipeline workflow or automation"; the same sentence ends "integrating it into ideariums current coding tab").
- "rebuilding the current BrainOS to fit the style of idearium": rebuilt on Idearium's tokens and components; the fire theme, embers and
  scanlines go.
- "no decouple from brain os" (2026-10-15) kept as one data set and one graph component with two mounts (Code tab, Clear Glass).

## Decisions

decisions:
  BX0a_where_it_lands:
    status: DECIDED
    question: Where in Idearium do BrainOS's features land, and how does the page reach their data?
    chosen: >-
      Decided by his axioms and his 2026-10-19 words ("consolidate redundancy in the code tab to more expanded tabs instead of so many tabs"):
      one new Code-tab view, Flow (the graph with its layers and edit mode, automation as its side panel), plus dock panels for BrainOS's
      right panel — not a new top-level tab. Data through Idearium's own server (routes and its one /sse), never browser calls to other ports
      (BX-001). Controls are command rows first (order of delivery). He can overturn this by an addendum.

  BX0b_retire_brainos_page:
    status: OPEN
    question: >-
      When the Code tab reaches every BrainOS feature (the census, BX1), is ui/brainos archived and Clear Glass's "⬡ BrainOS" row pointed at
      the Code tab's Flow view — or do both stay?
    options: ["archive it (the coder's recommendation: one place, nothing lost by the census)", "keep both"]

  BX0c_float:
    status: OPEN
    question: >-
      The BrainOS float (a Clear Glass overlay, 10 tabs, its own blue look): rebuild it in Idearium's style on the same data, or retire it into
      the Code tab and Clear Glass's own panels (agents hub, 🧩, ⬇)?
    options: ["rebuild it (keeps a compact overlay over any page)", "retire it (the coder's lean: most of its tabs now have homes in Clear Glass's shell)"]

  BX0d_order_against_the_pipeline:
    status: OPEN
    question: >-
      Order against the open pipeline work. The coder's recommendation: the root causes first (RC5, RC6 — they make runs wrong or noisy), then
      BX1–BX3 (seeing the pipeline as a graph is DG5's UI and makes the rest checkable), then BX5 (PC1's controls) and BX7 (AB1's auto-advance)
      as the graph's controls, then the rest.

phases:

  BX1_census:
    layer: foundation
    status: PLANNED
    depends_on: [BX0a_where_it_lands]
    files: [docs/brainos-feature-census.md]
    spec: docs/brainos-in-idearium.spec
    blocks: [MOD-BX-CENSUS]
    does: "CT0's census of the Code tab, extended to every BrainOS feature, each with its proposed home; his merge choice recorded (CT0's decision)."
    proof: a test reads ui/brainos's tabs and actions and finds each in the census

  BX2_flow_sources:
    layer: library
    status: PLANNED
    depends_on: [BX1_census]
    files: [idearium/lib/flow-sources.js, idearium/api/index.js, idearium/cli/route-commands.js]
    spec: docs/brainos-in-idearium.spec
    blocks: [MOD-BX-SOURCES]
    does: "The FlowGraph from the server: phases and DAG, runs, mesh agents and routes, RAID queue; Clear Glass's events relayed onto /sse; `flow` rows."
    proof: phases and runs returned with Clear Glass down; each source's failure named

  BX3_flow_canvas:
    layer: surface
    status: PLANNED
    depends_on: [BX2_flow_sources]
    files: [idearium/ui/js/flow-canvas.js, idearium/ui/css/flow.css, idearium/ui/js/code-surface.js, idearium/ui/index.html]
    spec: docs/brainos-in-idearium.spec
    blocks: [MOD-BX-CANVAS]
    does: "The Code tab's Flow view: phases by DAG layer with state, the running phase's steps and gates, zoom; Idearium's tokens; one mountable component."
    proof: Clear Glass — the view draws a repo's phases and a run's steps; theme switch recolours it

  BX4_agents_layer:
    layer: surface
    status: PLANNED
    depends_on: [BX3_flow_canvas]   # TB7a (edges recorded, docs/2026-10-16-code-tab-rebuild-phasemap.spec) is built inside this phase: the map nests it where the DAG reader does not see it
    files: [idearium/ui/js/flow-agents.js]
    spec: docs/brainos-in-idearium.spec
    blocks: [MOD-BX-AGENTS]
    does: "BrainOS's CANVAS as a layer: heartbeat-gated agents, routes, the step each serves, edges lit by recorded calls; the node menu as `flow` rows."
    proof: Clear Glass — pulsing agents drawn, a node action calls its row

  BX5_node_controls:
    layer: integration
    status: PLANNED
    depends_on: [BX3_flow_canvas]
    files: [idearium/lib/phase-controls.js, idearium/api/index.js, idearium/cli/route-commands.js, idearium/ui/js/flow-canvas.js]
    spec: docs/brainos-in-idearium.spec
    blocks: [MOD-BX-CONTROLS]
    does: "PC1 on the graph: pause, resume, stop, retry from step n, pin an agent — honoured between steps; rows first."
    proof: a paused run does not start its next step; retry from 3 keeps 1–2

  BX6_pipeline_edit:
    layer: surface
    status: PLANNED
    depends_on: [BX4_agents_layer]
    files: [idearium/ui/js/flow-edit.js]
    spec: docs/brainos-in-idearium.spec
    blocks: [MOD-BX-EDIT]
    does: "BrainOS's PIPELINE builder as Flow's edit mode: connect, step popup, import/export, SUGGEST; phase depends_on edits DAG-checked."
    proof: connecting two agents writes a route; a cyclic depends_on is refused naming the cycle

  BX7_automation:
    layer: integration
    status: PLANNED
    depends_on: [BX5_node_controls]
    files: [idearium/ui/js/code-automation.js, idearium/lib/autobuild.js, idearium/api/index.js, idearium/cli/route-commands.js]
    spec: docs/brainos-in-idearium.spec
    blocks: [MOD-BX-AUTOMATION]
    does: "BrainOS's AUTOMATION editor beside Flow, with pipeline steps (build phase, build next ready = AB1, run tests, wait for gate), cron, autobuild settings (SET1/SET2)."
    proof: a workflow builds the first ready phase and stops at a refusal

  BX8_dock_panels:
    layer: surface
    status: PLANNED
    depends_on: [BX4_agents_layer]
    files: [idearium/ui/js/code-dock.js]
    spec: docs/brainos-in-idearium.spec
    blocks: [MOD-BX-DOCK]
    does: "BrainOS's right panel as dock panels: Node, RAID, Tool calls, Chat logs; DEPLOY under Tools; BAYES to Intelligence."
    proof: Clear Glass — a selected node fills Node; RAID lists the queue

  BX9_retire:
    layer: surface
    status: PLANNED
    depends_on: [BX0b_retire_brainos_page, BX6_pipeline_edit, BX7_automation, BX8_dock_panels]
    files: [ui/brainos/index.html, clear-glass/src/main/index.js, tests/known-gaps.yaml, loom/maps/run-state-map.js]
    spec: docs/brainos-in-idearium.spec
    blocks: [MOD-BX-RETIRE]
    does: "Per his BX0b: ui/brainos archived, the menu row opens Code → Flow, stale tests and contract replaced, loom wired."
    proof: every census row reached; the menu row opens :4800 Code → Flow

  BX10_float:
    layer: surface
    status: PLANNED
    depends_on: [BX0c_float, BX2_flow_sources]
    files: [clear-glass/src/providers/provider-widget.js, clear-glass/renderer/provider-widget.html, ui/brainos-float/brainos-float.js]
    spec: docs/brainos-in-idearium.spec
    blocks: [MOD-BX-FLOAT]
    does: "His BX0c: a small widget on Clear Glass's provider pages, its contents following the provider (agent node and health, queue and job, account, userscript, route); the old float archived."
    proof: on a claude.ai tab the widget shows claude's node, job and account; on a non-provider page it is absent
