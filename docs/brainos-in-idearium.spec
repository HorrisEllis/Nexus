spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # docs/brainos-in-idearium.spec — BrainOS rebuilt in Idearium's style and brought into Idearium's Code tab: the pipeline as a
  # live graph (phases, steps, gates, agents), the agent mesh, the route/pipeline editor and the automation workflows, beside the
  # code they act on. Format: emerge module spec (specDepth 1.0, no BLACK, invariants valid).
  # Phases: docs/2026-10-21-brainos-into-idearium-phasemap.spec. Status: SPECCED — nothing built; readings and his calls marked.
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        brainos-in-idearium
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-21T00:00:00Z
    status:      specced
    uuid:        nexus-brainos-in-idearium-spec-v1-0000-2026-1021-jamesbrooks-001
    origin: >-
      James, 2026-10-21: "Now back to the pipeline workflow and automation in idearium. Look at the phases for idearium and the pipeline.
      Then we should be looking into and plan a migration into BrainOS, into coding tab and rebuilding the current BrainOS to fit the style
      of idearium and migrating and integrating it into ideariums current coding tab and integrate the features into it."
      Earlier, his and kept: 2026-09-11 "brainos needs to be the entire ui for agent orchestration — clear-glass, agent mesh, ncp, jobs,
      userscripts, agent router, RAID. deploying nodes on the canvas spawn agents. right-click nodes, context menu, feedback loop, route data,
      pipelines, nodes auto-detected from heartbeat/pulse." · 2026-10-15, of the Code tab: "look at brainos, like i want brainos built for
      these kinds of pipeline workflow or automation" · "no decouple from brain os, unless you think its a good idea. the gates are supposed
      to be checks, can alos be compertments." · 2026-10-19: "consolidate redundancy in the code tab to more expanded tabs instead of so many
      tabs". The direction is his. The coder's part: the census, the readings (marked), the design.
    readings: >-
      To confirm. "a migration into BrainOS, into coding tab" — BrainOS's features move INTO Idearium's Code tab (not the Code tab into
      BrainOS): his 2026-10-15 words ask for BrainOS "built for these kinds of pipeline workflow" inside the Code tab, and the rest of this
      sentence says "migrating and integrating it into ideariums current coding tab". "rebuilding the current BrainOS to fit the style of
      idearium" — Idearium's tokens (css/nexus-theme.css, theme.js palettes and accents, data-motion), its panes, chips and rows; not the
      Eravos fire theme, embers or scanlines. "no decouple" (2026-10-15) is kept as: one set of data (Clear Glass's mesh and route graph,
      Idearium's runs) drawn by one component, so the Code tab and Clear Glass show the same thing.
    purpose: >-
      One place to watch and steer a build: the plan's phases and their DAG, the run moving through steps and gates, which agent does each
      step, the automation that starts runs — next to the code and diffs they produce.
    target_runtime: [node, browser]
    language_stack: [javascript, html, css]
    paradigm: [same-origin-data, one-component-two-mounts, command-row-first, nothing-moves-unless-the-system-does]
    axioms: ["§8.6 reuse (route-graph.js, agent-mesh view, automation routes, phase-dag.js, run-state.js, the Code tab's panel and dock patterns)",
      "§0.3 nothing lost (every BrainOS feature mapped to a home before ui/brainos is archived)", "USER_AUTONOMY (retiring BrainOS and the float are his calls)",
      "order of delivery: backend → route → command row → UI", "AXIOMS §4.1 UI tested in Clear Glass"]
    deps:
      - { name: idearium-api, version: "idearium/api/index.js", required: true, purpose: "routes and SSE (/sse) the Code tab already uses" }
      - { name: clear-glass-mesh, version: ":7704 agent-mesh, route-graph, automation", required: true, purpose: "agents, routes and workflows BrainOS draws today" }

    constraints:
      - id: BX-001
        description: "The UI calls only Idearium's own origin (/api/…, /sse); Clear Glass, Guardian and cortex are reached by Idearium's server, so no browser call is cross-port."
        type: hard
        enforced_by: [GATE-BX-ORIGIN]
      - id: BX-002
        description: "Every control on the graph (spawn, dispatch, connect, pause, retry from a step, pin an agent, run a workflow) is a command row first; the UI calls the same route."
        type: hard
        enforced_by: [GATE-BX-ROW]
      - id: BX-003
        description: "Nothing on the graph moves unless the system did: nodes appear from heartbeats and run rows, edges glow from recorded calls; no decorative motion (data-motion respected)."
        type: hard
        enforced_by: [GATE-BX-REAL]
      - id: BX-004
        description: "Every BrainOS feature has a named home (census) and is reachable there before ui/brainos is archived."
        type: hard
        enforced_by: [GATE-BX-PARITY]
      - id: BX-005
        description: "Idearium's style only: its tokens and components; the Code tab gains one view (Flow) and dock panels, not a new top-level tab."
        type: hard
        enforced_by: [GATE-BX-STYLE]

  schemas:

    - id: FlowGraph
      name: FlowGraph
      description: "What the Flow view draws for one repo."
      fields:
        phases:  "{ id, map, status, layer, depends_on[] }[] — from lib/phase-dag.js"
        runs:    "{ runId, phase, step, state, agent, rung, startedAt, gates[] }[] — newest per phase, from run-state / idearium_phase_runs"
        agents:  "{ id, kind, system, alive, lastPulse }[] — Clear Glass mesh view (heartbeat-gated)"
        routes:  "{ id, from, to, kind }[] — route-graph edges"
        edges:   "{ from, to, kind: depends|calls|routes, live }[] — the union, with live set from recorded calls"
      behavioral_contracts: ["a source that does not answer leaves its part empty and is named in sources[]; the rest still draws"]
      error_paths: ["no repo → 404; all sources down → empty graph with every source's error"]

    - id: FeatureHome
      name: FeatureHome
      description: "One row of the census: a BrainOS feature and where it lives in Idearium."
      fields:
        feature:  "string — e.g. CANVAS, node menu, drag-to-connect, DEPLOY, BAYES, PIPELINE, AUTOMATION, right panel tabs, float tabs"
        files:    "string[] — its BrainOS files"
        home:     "string — Code tab view / dock panel / Intelligence tab / Clear Glass / retired"
        phase:    "string — the BX phase that moves it"
        reached:  "boolean — set when the test reaches it in its new home"
      behavioral_contracts: ["no row may be home 'retired' without his word"]
      error_paths: ["a feature with no row → GATE-BX-PARITY fails"]

  interfaces:

    - id: IF-PHASE-DAG
      name: phase-dag
      path: lib/phase-dag.js
      description: "Every phase of every map in one DAG: cycles, dangling, layers, critical path."
      exports: ["build(maps, { mapped })", "slice(dag, id)", "problems(dag, id)", "lines(dag)"]
      behavioral_contracts: ["decisions are nodes, not phases"]
      error_paths: ["no maps → empty dag"]

    - id: IF-RUN-STATE
      name: run-state
      path: lib/run-state.js
      description: "A run's steps, notes and next step, per session."
      exports: ["begin", "step", "setNext", "note", "finish", "load", "list"]
      behavioral_contracts: ["one file per run"]
      error_paths: ["unknown run → null"]

    - id: IF-ROUTE-GRAPH
      name: route-graph
      path: clear-glass/src/mesh/route-graph.js
      description: "BrainOS's pipeline edges between mesh nodes, kept under data/brainos/routes."
      exports: ["RouteGraph", "ROUTES_DIR"]
      behavioral_contracts: ["served at :7704 /agent-mesh/routes"]
      error_paths: ["bad edge → refused"]

    - id: IF-AGENT-MESH
      name: agent-mesh
      path: clear-glass/src/mesh/agent-mesh.js
      description: "Live agents by heartbeat; spawn, route; served at :7704 /agent-mesh/view."
      exports: ["AgentMesh"]
      behavioral_contracts: ["a node exists only while it pulses"]
      error_paths: ["Clear Glass down → no agents"]

    - id: IF-AUTOMATION
      name: automation-routes
      path: clear-glass/src/automation/routes.js
      description: "Workflows (CRUD, run, stop), steps, cron, from-macro; served at :7704 /automation/*."
      exports: ["handle", "listView", "LOCAL_ORIGIN"]
      behavioral_contracts: ["a workflow run is recorded under data/brainos/automation-runs"]
      error_paths: ["unknown workflow → 404"]

    - id: IF-CODE-TAB
      name: code-tab
      path: idearium/ui/js/code-surface.js
      description: "The Code tab: views (files, changes, plans, runs, COS), CX_PANELS, the dock; SSE fan-out in app.js."
      exports: ["csPaint", "CS_VIEWS_IDS", "CX_PANELS", "DOCK_PANELS", "codeSurfaceOnEvent"]
      behavioral_contracts: ["panels hold no logic: every value from a route"]
      error_paths: ["a route that fails → the panel says so"]

  modules:

    - id: MOD-BX-CENSUS
      name: feature-census
      uuid: nexus-bx-census-v1-0000-2026-1021-001
      path: docs/brainos-feature-census.md
      phase: BX1_census
      map: docs/2026-10-21-brainos-into-idearium-phasemap.spec
      description: >-
        CT0's census of the Code tab, extended to BrainOS: every Code-tab view/panel/dock tab and every BrainOS feature (CANVAS, node menu,
        drag-to-connect, DEPLOY, BAYES, PIPELINE builder, AUTOMATION editor, right panel NODE / CHAT LOGS / PIPELINE / TOOL CALLS / ACTIVITY,
        the float's 10 tabs), each with files, routes, overlap and a proposed home (FeatureHome). His choice of merge is recorded as CT0's
        decision; BrainOS rows marked 'retired' only with his word.
      deps: [{ name: code-tab }]
      schema_refs: [FeatureHome]
      exports: ["the census table", "the proposed homes"]
      gate_pipeline: ["GATE-BX-PARITY: every feature a row"]
      behavioral_contracts: ["written from the code, each row citing file:line"]
      error_paths: ["a feature found later → a row added, not dropped"]
      acceptance: ["a test lists BrainOS's tabs/actions from ui/brainos/*.js and finds each in the census"]

    - id: MOD-BX-SOURCES
      name: flow-sources
      uuid: nexus-bx-sources-v1-0000-2026-1021-001
      path: idearium/lib/flow-sources.js
      phase: BX2_flow_sources
      map: docs/2026-10-21-brainos-into-idearium-phasemap.spec
      description: >-
        Idearium's server gathers the FlowGraph: the repo's phases and DAG (lib/phase-dag.js), its runs (run-state, idearium_phase_runs), the
        mesh's agents and routes (Clear Glass :7704, fetched server-side with a short timeout), the RAID queue (cortex :3748). Routes:
        GET /api/repos/:uuid/flow, GET /api/flow/mesh, and pass-throughs for the mesh and automation actions (POST /api/flow/mesh/spawn | route
        | routes, /api/flow/automation/*). Live: Idearium's /sse carries mesh.* and automation.* (relayed from Clear Glass's stream) so the
        browser keeps one stream. Command rows: `flow <repo>`, `flow mesh`, `flow spawn|route|connect`, `flow automation …`.
      deps: [{ name: phase-dag }, { name: run-state }, { name: route-graph }, { name: agent-mesh }, { name: automation-routes }]
      schema_refs: [FlowGraph]
      exports: ["flowFor(repo) → FlowGraph", "mesh() → { agents, routes }", "relay(sse) — Clear Glass events onto /sse", "routes + command rows"]
      gate_pipeline: ["GATE-BX-ORIGIN: server-side only", "GATE-BX-ROW: a row per action"]
      behavioral_contracts: ["each source's failure is named, never thrown", "no secret crosses (no cookie, no token)"]
      error_paths: ["Clear Glass down → agents [] with 'Clear Glass :7704 not answering'"]
      acceptance: ["flowFor on a repo with 3 phases and a run returns them with the run's step; with Clear Glass down the phases still come"]

    - id: MOD-BX-CANVAS
      name: flow-canvas
      uuid: nexus-bx-canvas-v1-0000-2026-1021-001
      path: idearium/ui/js/flow-canvas.js
      phase: BX3_flow_canvas
      map: docs/2026-10-21-brainos-into-idearium-phasemap.spec
      description: >-
        The Code tab's new view, Flow: an SVG graph in Idearium's style (tokens, .cs-* panes and chips) of the repo's phases by DAG layer,
        each with its state; the running phase opens into its steps and gates (TB7c's zoom: repo → phase → step → call), the agent on each
        step, the rung taken. Rebuilt from brainos-canvas.js's layout and heartbeat rule, not copied (its fire theme and embers go). One
        component with a mount(el, { repo, source }) API, so Clear Glass's mesh panel can mount it too ("no decouple").
      deps: [{ name: flow-sources }, { name: code-tab }]
      schema_refs: [FlowGraph]
      exports: ["FlowCanvas.mount(el, opts) → { update(graph), destroy() }", "the 'flow' view in CS_VIEWS_IDS"]
      gate_pipeline: ["GATE-BX-STYLE: tokens only", "GATE-BX-REAL: draws only what the graph says"]
      behavioral_contracts: ["data-motion=reduced → no transitions", "a click opens the phase in Phases / the run in Plan"]
      error_paths: ["empty graph → the sources' errors listed"]
      acceptance: ["Clear Glass: the Flow view shows the phases by layer and the running one's steps; theme switch changes its colours"]

    - id: MOD-BX-AGENTS
      name: flow-agents
      uuid: nexus-bx-agents-v1-0000-2026-1021-001
      path: idearium/ui/js/flow-agents.js
      phase: BX4_agents_layer
      map: docs/2026-10-21-brainos-into-idearium-phasemap.spec
      description: >-
        BrainOS's CANVAS as a layer of the Flow view: the mesh's agents and systems (heartbeat-gated), the routes between them, which step
        each serves; right-click a node for BrainOS's menu (spawn, dispatch, open, health probe, settings), each item a `flow` command row.
      deps: [{ name: flow-canvas }]
      exports: ["agents layer on/off", "node menu → rows"]
      gate_pipeline: ["GATE-BX-ROW", "GATE-BX-REAL"]
      behavioral_contracts: ["a node without a pulse is drawn as gone, not removed silently"]
      error_paths: ["spawn refused → the reason on the node"]
      acceptance: ["Clear Glass: two pulsing agents drawn; 'health' on one calls flow probe"]

    - id: MOD-BX-CONTROLS
      name: flow-controls
      uuid: nexus-bx-controls-v1-0000-2026-1021-001
      path: idearium/lib/phase-controls.js
      phase: BX5_node_controls
      map: docs/2026-10-21-brainos-into-idearium-phasemap.spec
      description: >-
        idearium-control's PC1 delivered on the graph: pause, resume, stop, retry from step n, pin an agent for a phase, send to another rung —
        backend first (the build loop honours them between steps), then routes, rows (`phase pause|resume|retry <repo> <phase> [--from n]`,
        `phase pin`), then the node menu.
      deps: [{ name: flow-canvas }, { name: run-state }]
      exports: ["pause(run)", "resume(run)", "retryFrom(run, n)", "pin(phase, agent)"]
      gate_pipeline: ["GATE-BX-ROW"]
      behavioral_contracts: ["a control takes effect between steps, never mid-write", "each is a row in the run's record"]
      error_paths: ["a finished run → refused, said"]
      acceptance: ["a paused run does not start its next step; retry from 3 keeps steps 1-2"]

    - id: MOD-BX-EDIT
      name: flow-edit
      uuid: nexus-bx-edit-v1-0000-2026-1021-001
      path: idearium/ui/js/flow-edit.js
      phase: BX6_pipeline_edit
      map: docs/2026-10-21-brainos-into-idearium-phasemap.spec
      description: >-
        BrainOS's PIPELINE builder in the Flow view's edit mode: drag from node to node to connect (route-graph), a step popup, JSON import /
        export, SUGGEST (RAID decide) — and, new, phase dependencies (a phase's depends_on, written as a phasemap addendum through the
        existing phase routes, DAG-checked before saving).
      deps: [{ name: flow-agents }]
      exports: ["edit mode", "connect(from, to)", "import/export", "suggest()"]
      gate_pipeline: ["GATE-BX-ROW", "DAG check before a depends_on is saved"]
      behavioral_contracts: ["an edge that makes a cycle is refused with the cycle named"]
      error_paths: ["route-graph refuses → the reason shown"]
      acceptance: ["connect two agents → POST /api/flow/mesh/routes; a cyclic depends_on refused"]

    - id: MOD-BX-AUTOMATION
      name: code-automation
      uuid: nexus-bx-automation-v1-0000-2026-1021-001
      path: idearium/ui/js/code-automation.js
      phase: BX7_automation
      map: docs/2026-10-21-brainos-into-idearium-phasemap.spec
      description: >-
        BrainOS's AUTOMATION editor in the Code tab (a Flow side panel): workflows with their steps, run / stop, import / export, cron
        (clear-glass/src/automation/cron.js) — plus steps that drive the pipeline: build phase, build next ready (the rest of AB1:
        lib/autobuild.js nextReady), run tests, wait for gate. Autobuild settings (SET1/SET2) live here with their command rows.
      deps: [{ name: flow-controls }, { name: automation-routes }]
      exports: ["workflow list / editor", "pipeline step kinds", "autobuild settings"]
      gate_pipeline: ["GATE-BX-ROW", "the build's own gates (DG1-DG3) still refuse"]
      behavioral_contracts: ["an automation build is the same POST …/phases/build a person makes, recorded with who started it"]
      error_paths: ["a refused build stops the workflow with the refusal shown"]
      acceptance: ["a workflow 'build next ready' builds the first ready phase and stops at a refusal"]

    - id: MOD-BX-DOCK
      name: flow-dock
      uuid: nexus-bx-dock-v1-0000-2026-1021-001
      path: idearium/ui/js/code-dock.js
      phase: BX8_dock_panels
      map: docs/2026-10-21-brainos-into-idearium-phasemap.spec
      description: >-
        BrainOS's right panel as Code-dock panels: Node (the selected node's details), RAID (queue, route chosen, fallback, cost), Tool calls,
        Chat logs — ACTIVITY is already the runs panel. DEPLOY (redeploy a provider userscript) goes to the dock's Tools; BAYES (CFR field) to
        the Intelligence tab. All through flow-sources routes.
      deps: [{ name: flow-agents }]
      exports: ["DOCK_PANELS rows: node, raid, tools-calls, chats"]
      gate_pipeline: ["GATE-BX-ORIGIN"]
      behavioral_contracts: ["panels hold no logic"]
      error_paths: ["cortex down → said in the panel"]
      acceptance: ["Clear Glass: selecting a node fills the Node panel; RAID lists the queue"]

    - id: MOD-BX-RETIRE
      name: brainos-retire
      uuid: nexus-bx-retire-v1-0000-2026-1021-001
      path: ui/brainos/index.html
      phase: BX9_retire
      map: docs/2026-10-21-brainos-into-idearium-phasemap.spec
      description: >-
        Once the census shows every feature reached in its new home and he says so: ui/brainos archived (§0.3), Clear Glass's "⬡ BrainOS" menu
        row opens Idearium's Code tab at Flow, the stale tests (the four known gaps testing the removed brainos.js) archived with the page, the
        interaction contract rewritten for the Flow view, loom's stale brainos.js entries replaced by real wires.
      deps: [{ name: feature-census }]
      exports: ["archive", "the menu row", "contract", "loom wires"]
      gate_pipeline: ["GATE-BX-PARITY"]
      behavioral_contracts: ["nothing deleted: moved under _archive with a note"]
      error_paths: ["a census row not reached → not retired, named"]
      acceptance: ["census all reached; the menu row opens :4800 Code → Flow"]

    - id: MOD-BX-FLOAT
      name: brainos-float
      uuid: nexus-bx-float-v1-0000-2026-1021-001
      path: ui/brainos-float/brainos-float.js
      phase: BX10_float
      map: docs/2026-10-21-brainos-into-idearium-phasemap.spec
      description: >-
        The float (Clear Glass overlay: AGENTS, PIPELINE, JOBS, USERSCRIPTS, AUTOMATION, NODES, MESH JOBS, MACROS, AUTOFILL, SITES) — his call
        (BX0c): rebuilt on Idearium's tokens and fed by flow-sources, or retired into the Code tab and Clear Glass's own panels.
      deps: [{ name: flow-sources }]
      exports: ["either the restyled float or its archive"]
      gate_pipeline: ["GATE-BX-STYLE", "GATE-BX-PARITY"]
      behavioral_contracts: ["its tabs' functions reachable either way"]
      error_paths: ["none beyond the census"]
      acceptance: ["per his choice"]

  events:
    flow:
      - "flow.mesh.* (relayed mesh.*)"
      - "flow.automation.* (relayed automation.*)"

  enforcement:
    gates:
      - { id: GATE-BX-ORIGIN, name: same-origin, severity: fatal, check: "no 127.0.0.1:<port> literal in idearium/ui/js/flow-*.js or code-automation.js", on_failure: "build failure" }
      - { id: GATE-BX-ROW, name: row-first, severity: high, check: "every control's route has a route-commands row", on_failure: "build failure" }
      - { id: GATE-BX-REAL, name: nothing-moves-unless, severity: high, check: "no animation without a data change; data-motion honoured", on_failure: "build failure" }
      - { id: GATE-BX-PARITY, name: nothing-lost, severity: fatal, check: "every census row reached before ui/brainos is archived", on_failure: "not retired" }
      - { id: GATE-BX-STYLE, name: idearium-style, severity: high, check: "flow css uses --nx-*/--ac-* tokens only; no Eravos palette", on_failure: "build failure" }
