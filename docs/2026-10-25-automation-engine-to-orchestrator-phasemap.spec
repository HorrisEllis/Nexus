# Automation engine → the orchestrator: make it sovereign (relocation phasemap)
# The platform's automation engine lives in Clear Glass (a browser/front-end system); it is used by the whole platform over
# :7704, so all automation depends on Clear Glass being up. Each system is sovereign (his law) — the engine's home is a system
# whose job is orchestration. James chose the orchestrator (2026-10-25). This map moves the NEUTRAL engine core there, keeps
# the BROWSER steps as a Clear Glass driver port, and leaves the agent-step DECISION with RAID (already there).
# MAPPED 2026-10-25 before any code (docs/CLAUDE.md rule 1; his 2026-10-18 "each phase has to have a dependency graph before
# executing"). Grounded in the dependency graph: docs/2026-10-25-automation-engine-sovereignty-graph.md.
# REUSE, not rebuild (rule 2): the engine is ALREADY a dependency-injected neutral core (every outside action is an injected
# hook — browserFn, enqueueFn/askAgentFn, notifyFn, busEmit, meshViewFn, runMacroFn). So this is a MOVE-and-re-point-ports, not
# a rewrite. The refactor tool (lib/architecture-apply.js, RF2) does the move; the one piece of new code is the browser-driver
# port glue (AE2). Order of delivery (his): backend/move → ports → command/registry → UI.

origin:
  date: 2026-10-25
  james: >-
    "rememeber each system is sovereign. i feel like that should have been raid. or the orchastrator. the automation engine.
    supposed to be soveriegn." · "map the depency graph first," · (home chosen) "the orchastrator"
  context: >-
    Said after AU1 (0.60.249) unified the six automation sources behind one neutral registry (lib/automation-registry.js). The
    coder's AU_D1 finding named the truth: there is one real engine (clear-glass/src/mesh/automation-engine.js) and the rest are
    drivers/views of it. James saw the deeper problem the coder had banked instead of surfaced (a §1.2 miss, owned): the engine
    is a PLATFORM capability owned by a FRONT-END system, so sovereignty is broken — everyone reaches into Clear Glass to run
    anything. The dependency graph was mapped first (docs/2026-10-25-automation-engine-sovereignty-graph.md); then he chose the
    engine core's home: the orchestrator.
  grounding: >-
    docs/2026-10-25-automation-engine-sovereignty-graph.md. Facts it rests on, from loom + the files (§0.1): the engine is
    statically self-contained in Clear Glass + core (loom: used-by only clear-glass routes/ipc/tests); every other system is a
    :7704 port edge; dom.js is pure script-string building (no Electron, no require — it MOVES with the engine); the driver
    (clear-glass/src/driver) runs the strings in a page and STAYS; the orchestrator runs a server on :9000 and resolves other
    systems through lib/nexus-client.js (no hardcoded ports).

decisions:
  AE_D1_engine_home:
    status: DECIDED 2026-10-25 by James — "the orchastrator"
    asked: "the engine core's home: the orchestrator (it already runs the platform's long-lived tick), or a dedicated sovereign automation system folded under one of the 15?"
    chosen: >-
      The orchestrator owns the engine core. It already runs the platform's long-lived supervision/tick (lib/nexus/autopilot.js)
      and a server on :9000, and it is one of the 15 systems (no 16th is added, honoring his "There is only 15 systems"). RAID
      keeps the agent-step decision (§5.2/§9.1, already routed that way); Clear Glass keeps the browser steps as a driver port.
      RAID was ruled out for the CORE by its own role (a per-job decider, not a cron/trigger/long-run loop), said in the graph.
  AE_D3_the_home_is_cos:
    status: "DECIDED 2026-11-06 by James — supersedes AE_D1 (\"the orchastrator\", 2026-10-25), kept (§0.3)"
    his_words: "Cos I feel like. Have cos be the orchastrator complelelt."
    context: >-
      Asked after the coder found the gate code in three places, none COS's, and the engine in lib/ against his 2026-11-03 rule. Choices: COS
      or the old orchestrator/ process. It confirms PL_D13's reading (docs/2026-11-03-registry-per-system-phasemap.spec): AE1–AE4's host
      and door move to COS, the engine leaves lib/ for COS's folder, AE5 becomes COS's Automation page; and MG_D5 (2026-10-30, "COS is the
      orchestrator").
    chosen: >-
      COS is the orchestrator, completely. The engine core (lib/automation/*), the platform instance (orchestrator/automation/index.js) and its
      routes move into cos/automation/, served by COS's manager on its own registry; callers reach it by COS's route. Clear Glass keeps its
      browser driver (AE2) and is reached by its route. The old orchestrator/ is archived when nothing calls it (PL_D11 step 4).
    by_the_axioms: "§5.9/§5.15 (each thing in its owner's folder), his 2026-11-03 rule (lib/ is not for what a system uses), §5.16, §0.3"
  AE_D4_the_hub_structural:
    status: "DECIDED 2026-11-08 by James's axioms, on his word"
    his_words: "yes, pick the structural solution. just some context. i want idearium to be used to build capability towards an endstate if nexus cant do it, build it. like synthesizing into a compartment."
    context: >-
      Asked after his hub message ("a hub for the automation pipeline, workflows, tasks, including or using raid as the authentication and tracking
      system. queues, contracts, dag, it should all be there, waiting to be wired in.") with four readings side by side: (1a) slots now, each
      wired as its phase lands, or (1b) each slot working now; (2a) RAID through Cortex's routes, or (2b) RAID moved into COS; when the request
      spine (RQ7, RQ8, RQ14–RQ16) comes back: now, after the hub, or after Emerge; who answers a gap: his rule or his axioms. The coder recommended
      1a, 2a, after the hub, the axioms. His "yes" takes the recommendation; "the structural solution" is read as the one the axioms pick, to confirm.
    chosen: >-
      1a: COS's hub is a table of slots (cos/manager/hub.js, OC8a), each read live from its owner; a slot with no route names the phase that wires
      it. 2a: RAID stays Cortex's, reached by its route, so it can be swapped (§5.15). The request spine returns after the hub, as slots already
      waiting in it. A gap goes free sources first, then a model or another agent (lifeline), then the web (Clear Glass), and him last (CG_D3's
      order, his 2026-10-24 "ask user last"). The engine moves into COS as it is (AE6); its .eg port waits on CIE13/CIE10 (thread T10).
    his_context: >-
      Idearium is used to build capability toward an end state: what Nexus cannot do, it builds, synthesized into a compartment. Read with RQ15 (a
      compartment from a contract, the test and the DAG) and GM5's build row (what no source covers is returned as what a build would be asked).
    by_the_axioms: "§5.15 (reached by route, swappable), §1.1/§1.2 (a slot never pretends; a missing owner is said), §3.3 (slots mapped before wired), §8.6 (AU1, RD0, OC4a reused), §0.3"
  AE_D2_state_stays:
    status: DECIDED 2026-10-25 by James — "yes, state stays"
    asked: "the engine's saved workflows/runs/macros (NEXUS_DATA_ROOT/brainos/*) — move the data, or leave it where it is?"
    chosen: >-
      Leave the data where it is. Workflows, runs and macro nodes live under the shared data root (NEXUS_DATA_ROOT/brainos/
      workflows|automation-runs|automation-nodes), which is STATE, not owned by any system directory (docs/CLAUDE.md: never
      commit data/**; data is state). The move relocates CODE only; saved automations survive it untouched. The engine's
      DATA_ROOT fallback (today path.join(__dirname,'..','..','..','data')) is a ROOT-relative path that MUST be rewritten on
      the move so it still resolves the repo data dir (RF2's known failure mode, version.js 0.60.241) — handled in AE1.

phases:
  AE1_move_the_core:
    status: DONE (headless) 0.60.256 — engine is CORE (lib/automation/); each system runs its own instance (Clear Glass local for browser automation, orchestrator for platform); decoupled via the kernel (boundary 10/10, no crossing); namespaced stores. Live two-process + AE4/AE5 are his.
    layer: library
    depends_on: [AE_D1_engine_home, AE_D2_state_stays]
    files:
      - clear-glass/src/mesh/automation-engine.js
      - clear-glass/src/automation/cron.js
      - clear-glass/src/automation/template.js
      - clear-glass/src/automation/steps.js
      - clear-glass/src/automation/dom.js
      - clear-glass/src/automation/nodes.js
      - clear-glass/src/automation/from-macro.js
      - clear-glass/src/automation/templates.js
    # §0.60.250 — this phase RELOCATES code across a system boundary, so it declares each file's destination. DG2
    # (lib/phase-graph.js) reads `moves` and foresees the crossings the move CREATES (clear-glass consumers that will
    # point into the orchestrator), instead of the boundary ratchet catching them after the files are already moved.
    moves:
      clear-glass/src/mesh/automation-engine.js: lib/automation/engine.js
      clear-glass/src/automation/cron.js: lib/automation/cron.js
      clear-glass/src/automation/template.js: lib/automation/template.js
      clear-glass/src/automation/steps.js: lib/automation/steps.js
      clear-glass/src/automation/dom.js: lib/automation/dom.js
      clear-glass/src/automation/nodes.js: lib/automation/nodes.js
      clear-glass/src/automation/from-macro.js: lib/automation/from-macro.js
      clear-glass/src/automation/templates.js: lib/automation/templates.js
    spec: docs/2026-10-25-automation-engine-sovereignty-graph.md
    does: >-
      Move the neutral engine core and its neutral helpers into the orchestrator (orchestrator/automation/) with the refactor
      tool (lib/architecture-apply.js): it plans the move (every tracked file), rewrites only what it can prove points at them
      (relative requires — ../../../lib/test-sandbox.js → ../../lib/test-sandbox.js; the sibling ./cron, ./dom, ./steps, …; the
      ROOT-relative DATA_ROOT path, AE_D2), git mv (history follows), checks every file parses and resolves and adds no new
      crossing, and keeps it as ONE commit or rolls back (REVERSIBILITY). dom.js moves too (pure script strings). The DRIVER
      (clear-glass/src/driver) and the in-page DOM execution do NOT move — the engine already reaches them through the browserFn
      hook (AE2). After the move the engine's static deps are: its own siblings + lib/test-sandbox (core) — zero Clear Glass
      static edge.
      ONE crossing to design out (DG2, surfaced by THIS phase's graph, not by the engine alone): lib/agent-tools/tools/clear-glass/
      macro.js statically requires clear-glass/src/automation/nodes.js (a lib→clear-glass edge today). When nodes.js moves to the
      orchestrator the require must be rewritten to the new home (the refactor tool proves and rewrites it), or macro.js reaches
      node-building over the engine's door — decided in AE1 when the tool reports it, never left to break mid-build. Other
      consumers the graph names (clear-glass-internal, co-moved or re-pointed): automation/routes.js, ipc/bridge.js,
      mesh/agent-mesh.js, macros/live-recording.js.
    proof: >-
      the moved engine loads under orchestrator and parses; automation-engine.test / automation-nodes.test / automation-v2.test
      pass headless against the new path (browser steps already fail-soft without a driver); loom shows the engine under
      orchestrator with no clear-glass static dep; lib/system-boundary.js shows NO orchestrator→clear-glass static crossing

  AE2_browser_driver_port:
    status: BUILT 0.60.333
    layer: integration
    depends_on: [AE1_move_the_core]
    files:
      - clear-glass/src/automation/driver-port.js
      - clear-glass/src/main/index.js
      - tests/modules/test-automation-driver-port.test.js
    spec: docs/2026-10-25-automation-engine-sovereignty-graph.md
    does: >-
      The one piece of NEW code, not a move: wire the engine's browserFn (now in the orchestrator's process) to Clear Glass's
      driver over a port. Clear Glass exposes its driver act/eval/navigate over its :7704 wire (reusing its existing driver and
      _evalIn path), and the orchestrator sets the engine's browserFn to call it through lib/nexus-client.js. Fail-soft is
      preserved exactly: Clear Glass down → the engine throws "browser steps need Clear Glass running" and only the 4 browser
      step-types (browser, extract, wait_until, macro) pause; the other 10 + triggers + the store keep running — which is the
      whole point of the move.
    proof: >-
      a browser step dispatched from the orchestrator-hosted engine drives a REAL Clear Glass page (tested in Clear Glass via
      clear-glass/src/driver/glass.js, never Playwright — AXIOMS §4.1, CG-001b); with Clear Glass down the run names only the
      browser steps and the neutral steps still complete

  AE3_the_engine_door:
    status: DONE (headless) 0.60.317 — orchestrator/automation/index.js wires the agent-step hooks: RAID decides the provider (lib/raid-port.js, §5.2), Guardian runs it (:7820 /command), fail-soft; enqueue (fire-and-forget) + askAgent (awaited reply); busEmit streams through the orchestrator's SSE (setBus(broadcast) at boot); browser/macro keep their Clear Glass port. No new cross-system static require (RAID is core lib; Guardian is a runtime port) — test-system-boundary 10/10. Proof: test-orchestrator-automation 7/7 (injected Guardian/RAID). The /automation/* door already served (routes.js). AWAITED-reply completion-watch (poll Guardian's job to completion) and AE2 (Clear Glass serving :7704) / AE5 (the UI) remain his-machine.
    layer: integration
    depends_on: [AE1_move_the_core]
    files:
      - orchestrator/automation/routes.js
      - orchestrator/orchestrator.js
    spec: docs/2026-10-25-automation-engine-sovereignty-graph.md
    does: >-
      Serve the engine's /automation/* door from the orchestrator's :9000 server (the route logic ported from
      clear-glass/src/automation/routes.js). Agent-step dispatch (enqueueFn/askAgentFn) routes through the mesh → RAID via
      lib/nexus-client.js / lib/raid-port.js — RAID keeps the decision (§5.2, already the pattern); the engine never re-decides.
      The scheduler/triggers (cron/interval/event/webhook) tick from the orchestrator, which already runs the platform's
      long-lived loop.
    proof: >-
      GET /automation/workflows on :9000 lists; POST …/run runs; an agent step routes through RAID (raid-port path, not a second
      decider); a cron/webhook trigger fires from the orchestrator's tick

  AE4_repoint_the_registry:
    status: BUILT 0.60.333
    layer: library
    depends_on: [AE2_browser_driver_port, AE3_the_engine_door]
    files:
      - lib/automation-registry.js
      - tests/modules/test-automation-registry.test.js
    spec: docs/brainos-in-idearium.spec
    does: >-
      Re-point AU1's registry: the ENGINE source is now the orchestrator (list/run workflows + macros via the :9000 door), and
      Clear Glass becomes the browser-driver source (and the UI), no longer "the engine". Only the adapter's transport target
      changes (:7704 → the orchestrator via lib/nexus-client.js) — the registry's shape, its public door (sources/list/run/
      describe), /api/automation and the `automation` command are all unchanged. describe()'s honest self-model is updated:
      clear-glass is now a driver, the orchestrator is the engine.
    proof: >-
      test-automation-registry.test.js green with the engine at the orchestrator (the fake-engine transport re-pointed); a run
      records under its source; the orchestrator down is named, not thrown; clear-glass down names only browser steps

  AE6_the_engine_moves_into_cos:
    status: BUILT   # 2026-11-08: slice a 0.60.449 (COS runs the engine), slice b 0.60.450 (it starts with COS); the files stay the shared kernel (his: Clear Glass keeps its own)
    expanded_2026_11_08: >-
      James, 2026-11-08: "basically i want it to be the main subrate for all automation like a hub for the automation pipeline, workflows, tasks, including or using raid as the authentication and tracking system. queues, contracts, dag, it should all be there, waiting to be wired in." · "look at existing phases and ideas. cos is meant to be nexus entirely," (asked after OC4a, with "i wanted to have an editor for pipelines, like every pipeline in nexus is editable, managable, uses cos for gates, like in clearglass, gated steps, macros, etc") Expanded, not rewritten (his SL_D11): this phase is where his hub lives — every pipeline, workflow and task in COS, editable and gated
      in one place, with RAID, queues, contracts and the DAG as its slots. Readings to settle with him before code (do not guess): (1) "waiting to be
      wired in" = named slots in COS's contract that answer "not wired yet" until connected, or each one working now; (2) RAID used through
      Cortex's routes, or RAID moved into COS (CS11, shelved 2026-11-07 as "top of my head ideas").
    layer: library
    depends_on: [AE_D3_the_home_is_cos, AE4_repoint_the_registry, PIL2_contracts]   # PIL2 added 2026-11-06 (b)
    files: [cos/automation/engine.eg, cos/automation/pipeline.eg, cos/automation/steps.eg, cos/automation/cron.eg, cos/automation/routes.eg,
            cos/automation/test/automation.test.eg, lib/automation/, orchestrator/automation/index.js, cos/manager/server.js, cos/manager/contract.json,
            lib/automation-registry.js, tests/modules/test-cos-automation.test.js]
    requires: [node]
    prerequisites: ["each caller of lib/automation/* listed first (grep), so none breaks: it is repointed to COS's route or, for scripts and tests, to cos/automation/"]
    does: >-
      His "Have cos be the orchastrator complelelt": the engine core and the platform instance move into cos/automation/; COS's manager serves
      /api/cos/automation/* (workflows, runs, pipelines, macros, triggers) on its own registry; agent steps still go RAID → Guardian, browser
      steps to Clear Glass's driver, each by route. lib/automation/ is archived with a pointer (§0.3); the orchestrator stops running the engine.
    proof: "a workflow and a pipeline run through COS's route (test-cos-automation); the existing automation and pipeline tests pass against cos/automation/; the boundary census shows no new crossing"
  # ── ADDENDUM 2026-11-08 — AE6's two readings settled (his) ──
  # James, 2026-11-08, asked (1) whether RAID, queues, contracts and the DAG are named slots first or all working at once, and (2) where RAID lives:
  #   (1) "Named slots first" (the coder's recommendation, chosen): COS's contract names each slot; a slot answers "not wired yet" until it is
  #       connected, then they are wired one by one.
  #   (2) "The routes and event ledgers. This will replace BrainOS, and do what idearium can do. RAID should probably move to cos. Since it has
  #       signal to noise, load balancing etc. I feel like. What do you think)". The coder's answer, by the axioms: yes, RAID's decision engine
  #       and its ledgers move into COS (§9.1 and §10.1, one write authority for requests, beside the queue it feeds; §9.2, the ledger written
  #       before dispatch in one place); Cortex keeps memory and cognition (§5.7, COS must not become a blob). The RAID slot is first wired to
  #       Cortex's routes, then re-pointed when RAID moves: §5.14 proven, nothing breaks between. The move is its own phase (CS11 un-shelved by
  #       these words, to confirm). "This will replace BrainOS, and do what idearium can do" is recorded as his direction; what it covers is his
  #       to say before any phase is written for it.
  # Found mapping AE6's callers (34, grep): Clear Glass runs its own engine instance (clear-glass/src/main/index.js, mesh/agent-mesh.js), on the
  # shared lib/automation/. Under his 2026-11-03 rule ("lib/ is not a directory for anything that a system uses") and AE_D3, COS owns the engine
  # and Clear Glass is its browser driver (AE2, built): Clear Glass stops running an engine and calls COS's route, with AE5.
  # ── ADDENDUM 2026-11-08 (0.60.449) — AE6 slice a built: COS runs the automation engine ──
  # James, 2026-11-08: "Automation needs done, orchastrator as the engine, which need to be cos now." · 2026-11-06: "Have cos be the orchastrator complelelt."
  # The three ways, side by side, before code: (1) move lib/automation/ into cos/ now, which makes Clear Glass reach into COS's folder (§5.9 broken);
  # (2) port it to .eg now, which is blocked (no timers, processes or files natively, CIE13; no sockets, CIE10); (3) COS runs the engine and serves
  # its door, and the orchestrator stops. (3) was taken, bottom-up:
  #   - orchestrator/automation/index.js moved (git mv) to cos/manager/automation-door.js;
  #   - COS's manager serves /api/cos/automation/* and streams the engine's run events on /api/cos/events;
  #   - the orchestrator's /automation/* forwards to COS by route (no dead route; COS down is said, 503);
  #   - the hub's new slot 'engine' is COS's own;
  #   - the route is in cos/manager/contract.json.
  # The store keeps the namespace 'orchestrator-automation', so no workflow is lost (§0.3).
  # The engine still starts on its first request, as it did in the orchestrator. Starting it with COS, so schedules fire without a first call, is
  # slice b's.
  # Proof: test-cos-hub HB-05 (COS's real manager answers workflows and catalogue; an unknown route is 404; the engine slot is wired; the forwarder
  # reaches COS, and says so when COS is down), 5/5; test-orchestrator-automation 7/7 and test-automation-driver-port 3/3 against the moved door;
  # system-boundary 10/10, sovereign-systems 10/10, boundary-code-only 5/5.
  # Slice b: the engine starts with COS; Clear Glass stops running its own copy and calls COS's route (with AE5); lib/automation/ moves into
  # cos/automation/; the .eg port waits on CIE10 and CIE13. Then RAID into COS (its own phase).
  # Pre-existing, not this slice: test-registry-sovereign RS-01 fails on two Loom maps grown on main (cos-testenv-map, economy-map; in the canvas
  # handoff). The root CLAUDE.md lost RS-01's required law sentence when it was distilled; this release restores it.
  # ── ADDENDUM 2026-11-08 (0.60.450) — AE6 slice b, first part: the engine starts with COS ──
  # James, 2026-11-08: "Continue to get the automation done." The engine starts at COS's boot (cos/manager/server.js), so a scheduled or triggered
  # workflow fires without a first request; --no-automation leaves it off; the start, or its failure, is a ledger line. Proven on a real boot in the
  # sandbox: the manager up, the ledger line "the automation engine started with COS: 0 workflow(s)", /api/cos/automation/active answered, no
  # process left behind. Found for the next part: Clear Glass's own instance holds his workflows in its own store (namespace 'brainos': the
  # Fiverr pipelines, macros). Turning it off is a migration first (§0.3), and AE_D2 (Clear Glass keeps its own instance, to run with nothing
  # else up) stands against AE_D3 until he chooses: asked 2026-11-08.
  # ── ADDENDUM 2026-11-08 — Clear Glass keeps its own engine (his); AE6 closed ──
  # Asked: migrate his workflows into COS and switch Clear Glass's engine off (the coder's recommendation: one engine, lighter on his PC), or keep
  # both (AE_D2). James, 2026-11-08: "No clearglass keeps its". AE_D2 stands beside AE_D3: COS runs the platform's engine and is the hub; Clear
  # Glass runs its own instance for its browser workflows, in its own store ('brainos'), which runs with nothing else up. The engine's code is
  # used by both, so it stays the shared kernel in lib/automation/: moving it into cos/ would make Clear Glass reach into COS's folder (§5.9).
  # ── ADDENDUM 2026-11-08 (0.60.458) — AE7 written and built: ERAVOS's way into COS's engine ──
  AE7_eravos_reaches_the_engine:
    status: BUILT   # 0.60.458
    depends_on: [AE6_the_engine_moves_into_cos, AE_D3_the_home_is_cos]
    files: [cos/manager/cli.js, cos/manager/contract.json, idearium/cli/route-commands.js, tests/modules/test-cos-hub.test.js]
    requires: [node]
    prerequisites: ["COS runs the engine (AE6)"]
    does: >-
      James, 2026-11-08: "I want cos to have the automation engine. With a ui for this." · "Then an api that eravos can use for the step. So needs
      full cli commands, events, nodes." ERAVOS, or any system, uses COS's engine as a step by route only (§5.10). COS's contract spells out the
      engine's routes (14), its events (automation.*, 8, streamed on /api/cos/events), its nodes, and a for_eravos section: box kinds from
      /catalogue, one step via POST /step, a workflow run, the watch and the node routes. COS's command line gets `automation` (workflows, run,
      step, active, log, catalogue, nodes, export, import), through the same door as the routes, so the two cannot drift. Agents get the row
      cos.automation: reading is any agent's; run, step and import act, so they are the person's, or an agent proposes.
    proof: "test-cos-hub HB-06: the command line answers workflows and catalogue (the procedure step a box kind); one step runs by route; a workflow made by route and run by command puts automation.run.start and automation.run.complete on COS's stream; the contract carries for_eravos and the events. 6/6"
  expanded_2026_11_08_api_step: >-
    James, 2026-11-08, asked what "Then step can add the api" means: "API for anything. Agnostic remeber. Nexus systems, APIs from web services.
    Etc. http sockets etc". Built in 0.60.459, the engine's step 'api' (lib/automation/steps.js, engine.js _apiStep), chosen by the address:
    http(s):// (a web service, through the http step's own code), ws(s):// (a socket: send, then collect replies to a count or a time limit),
    tcp://host:port (a raw socket), and nexus://<system>/<path>. The last one's address is given by the host (COS's declarations, setResolver),
    never by the engine's fixed SYSTEM_PORTS, which stays only as a fallback. Every failure is named. Proof: test-orchestrator-automation OA-09,
    against a real http, ws and tcp server (9/9). The engine's suites are green.
  # His answers to the preview's questions, the same day:
  #   "They need to work completely independent of each other. Like add support to drag .pipeline nodes into Eravos. I want them to stay separate
  #   projects. But they fit so well." COS's Workflows page is whole on its own: Edit is in COS, not a jump to ERAVOS's canvas. The two meet
  #   through files: the node format (.pipeline, .workflow), which COS writes and ERAVOS reads. Dragging a .pipeline into ERAVOS is ERAVOS's own
  #   feature, built in its repository, not here.
  #   On importing Nexus through Idearium: "What? They’re already in idearium". Nothing to build: the coder's question had misread his words.
  # The UI (AE5, COS's Workflows page) waits on his critique of the preview shown 2026-11-08 (edit here or on ERAVOS's canvas; the page's name;
  # whether the Pipelines page merges into it).
  # ── ADDENDUM 2026-11-08 — the architecture of COS's automation, his ──
  AE_D7_one_engine_in_cos_brainos_stripped:
    status: "DECIDED 2026-11-09 by James; one reading to confirm (below)"
    his_words: >-
      James, 2026-11-08/09: "BrainOS looks horrible. It was supposed to be the canvas remember? With only the automation tools for steps. What happened to that. Each system needs to have what it needs to function. So no, don’t move it." · "Merge automation engine and BrainOS backend into the orchastrator then into cos using the canvas." · "Into cos backend. One agnostic automation engine. Like stripping the features from BrainOS, its ui is bad. Also hooking in idearium. The pipeline in idearium is meant to be shown on the canvas. Gates are inbetween steps. So compartment, gate, compartment, gate."
    context: >-
      Asked, side by side: (a) the engine stays shared in lib/automation (AE_D2, his "No clearglass keeps its"), (b) COS and Clear Glass each their
      own copy, (c) Clear Glass uses COS's engine by route; and BrainOS (lib/ui/brainos) migrated: its editor to COS's tab, its canvas to ERAVOS.
    chosen: >-
      One agnostic automation engine in COS's backend (the supervisor, AE_D6); ERAVOS's canvas is where its steps show (BrainOS was meant to be that
      canvas, with only the automation tools for steps). BrainOS's features are stripped into the engine and its UI dropped. Idearium's pipeline is
      shown on the canvas, a gate between steps: compartment, gate, compartment, gate.
    reading_to_confirm: >-
      "Each system needs to have what it needs to function. So no, don't move it." read as: Clear Glass keeps its own engine for its browser work (his
      11-08 AE_D2 stands), so lib/automation is not moved out from under it. The other reading — move nothing of BrainOS — is not taken, since he then
      says to strip it.
    found_2026_11_09: >-
      BrainOS (lib/ui/brainos, 6 files, 2,685 lines) never had a backend of its own: its own header says "NO NEW BACKEND — every capability below is
      a thin client over clear-glass/src/mesh/automation-engine.js". Its step set (agent, command, condition, delay, http, notify, trigger) is all in
      the engine COS runs (24 kinds). Its other half, the agent mesh (/agent-mesh/routes), is Clear Glass's own system, reached by its routes. So
      nothing is stripped into the engine; BrainOS's UI is archived (§0.3) when its last reader moves (idearium/lib/flow-sources.js, BX).
    by_the_axioms: "§5.9/§5.15 (each system has what it needs; reached by routes), §8.6 (nothing rebuilt that the engine has), §0.3 (archived, not deleted)"
  AE_D6_the_supervisor_is_the_orchestrator:
    status: "DECIDED 2026-11-08 by James — supersedes AE_D5's \"Cos ui is the orchestrator. Is nexus.\" (kept below, §0.3)"
    his_words: >-
      James, 2026-11-08: "no, the cos backend, or the supervisor is the orchastrator. ui is only ever supposed to use the cli and api routes while floating on the interaction contract. like always backend first, with commands, events, and updated maps."
    context: >-
      Said while COS's Automation tab (AE5 slice a, 0.60.461) was being built: its page called itself "the orchestrator", and its pipeline routes
      had no command and their events were not declared.
    chosen: >-
      The orchestrator is COS's backend, its supervisor. COS's UI is a projection: it only ever uses COS's command line and API routes, floating on
      the interaction contract (cos/manager/contract.json). Every capability lands backend first: the route, the command (cos/manager/cli.js and its
      row), the events declared in the contract, the maps updated; the UI last. 0.60.462: the pipeline commands (pipelines, pipeline, pipeline-run,
      runs, stop, pipeline-export, import of .pipeline) and the four automation.pipeline.* events declared; the page's words no longer claim to be
      the orchestrator.
    by_the_axioms: "§5.15 (reached by its routes only), §5.16 (the contract is COS's registry), his order of delivery (2026-10-07: backend, route, command, UI)"
  AE_D5_cos_is_the_engine_the_canvas_a_projection:
    status: "DECIDED 2026-11-08 by James"
    his_words: >-
      "Cos is the automation engine. The canvas a projection. Each step is a cos contiainer. Which can use the actual cos superviser to route through
      raid to each system using contracts for interacting with each system. Then make sure the tools have the dag for the canvas to understand what
      it needs. Like then the idearium pipeline should show in the automation tab in cos ui. Cos ui is the orchestrator. Is nexus. Eravos is only the
      visual ui. All backend is nexus b" · earlier the same day: "No. Eravos is the ui, for the cos automation engine. For the cos ui, automation tab."
    context: >-
      Shown a preview: COS's cockpit Automation tab framing ERAVOS from its own server, unchanged. ERAVOS already has an "Automation and Cybernetics"
      domain waiting for tools.
    chosen: >-
      COS is the engine and COS's UI is the orchestrator: it is Nexus, and all the backend is Nexus. ERAVOS is only the visual UI, a projection of COS's
      engine (Pillar's Lens: read-only by construction, it holds no state of its own). Each step is a COS container: it runs through COS's supervisor
      and is routed through RAID to the system that does it, by that system's contract (interaction-contract.json; §5.10). Each tool carries its DAG:
      what it needs and what it gives, so the canvas can see what a step is waiting on. Idearium's pipeline shows in COS's Automation tab, projected
      on the same canvas.
    readings_to_confirm:
      - "'each step is a cos container' read as: a step runs in its own COS compartment (the hub's 'experiments' slot: RAID makes a compartment from a
        contract, the test and the DAG). The other reading: a step is run by a system COS supervises, without a compartment of its own."
      - "'the idearium pipeline' read as Idearium's build pipeline (idea, spec, phases, build), projected as boxes with its phase DAG. The other
        reading: Idearium's .pipeline nodes (PN2)."
    by_the_axioms: "§5.9 and §5.15 (ERAVOS reached by its address, never its files; it holds no backend), §5.10 (contracts only), §5.2 and §9.1 (routing through RAID), §5.12 (the UI is disposable: a projection), §3.1 (the engine first, then the projection)"
    phases: "AE8 (each step a COS compartment, routed through RAID by contract), AE9 (each tool's DAG), AE10 (the Automation tab: ERAVOS as the projection, Idearium's pipeline on it); to be written with their graphs once the two readings are confirmed"
    answered_2026_11_08: >-
      James, 2026-11-08, to the two readings: "Yes." (the step container) and "First one. Like pipelines. Which can use the .frameworks for
      procedures. Look for the phases for this" (the pipeline). The second reading is settled: Idearium's build pipeline (PC_D6 (a)). The first
      stays open: "Yes." answers a question that offered two readings, so which one is his is asked again, side by side, before AE8 is written
      (his rule: ambiguity is reconciled by him). AE10 is not written: EO5 and PC4 already cover it and are expanded (SL_D11). AE9 is written below:
      nothing covered it.
  AE9_each_tool_carries_its_dag:
    status: OPEN
    origin: >-
      James, 2026-11-08 (AE_D5): "Then make sure the tools have the dag for the canvas to understand what it needs."
    layer: library
    depends_on: [AE_D5_cos_is_the_engine_the_canvas_a_projection, AE7_eravos_reaches_the_engine, PC1_one_box_shape]
    files: [lib/automation/steps.js, cos/manager/contract.json, cos/manager/automation-door.js, tests/modules/test-orchestrator-automation.test.js]
    requires: [node]
    does: >-
      Every step kind in the catalogue (GET /api/cos/automation/catalogue) declares its DAG: takes (the inputs it needs, each named with its kind),
      gives (what it hands the next box), needs (the systems it reaches, by name, resolved by COS) and requires (a service up, a setting on). A
      workflow's DAG is the composition: for each step, which earlier step gives each thing it takes, and what is unmet. Served at
      GET /api/cos/automation/workflows/:id/dag, so the canvas (ERAVOS, a projection) shows what a box is waiting on without knowing the engine.
      A step kind without a DAG is reported, never guessed.
    proof: "OA-10: every catalogue kind has takes/gives/needs; a workflow whose step takes what no earlier step gives shows it unmet, by name; the route answers through COS's door"
  AE5_ui_and_cleanup:
    status: "OPEN — slice a BUILT 0.60.461 (COS's Automation tab is the engine's; test-cos-hub HB-07). Open: Triggers, Macros, Webhooks tabs; Idearium's pipeline as a bundled .pipeline (OC9); BrainOS migrated and archived; Clear Glass's Settings › Automation pointed at COS"
    expanded_2026_11_08_b: >-
      James, 2026-11-08: "idearium pipeline. also has to be real .pipeline files. it must be exportable and importable." · "what about brainos, like
      migrating that over.?" · "i need this building already. like i want to eventually migrate the automation from the lib folder and brainos."
      Slice a, built: cos/ui/automation/index.html (tabs), engine.js, engine.css — Pipelines (list; a pipeline's steps in its own words; Run, live to
      done by its run record; Stop; Export: GET …/pipelines/:id/node, the real .pipeline node file, what it runs bundled (PN2); Import: POST
      …/import with the file's text; Open on canvas: the .erv from GET /api/cos/boxes?as=erv), Workflows (Run), Runs, Log. The supervisor's rules
      and Start at boot are the Supervision tab, unchanged. COS's contract (its registry) gains POST …/pipelines/:id/run, GET …/pipelines/:id/node,
      GET …/pipeline-runs, GET …/pipeline-runs/:id, POST …/pipeline-runs/:id/cancel (AE7 had listed 14 routes, none of the pipeline runs).
      Next slices: Idearium's build pipeline as a bundled .pipeline (OC9, his "First one"); BrainOS (lib/ui/brainos, 6 files, 1,932 lines) read,
      what it does mapped to this tab, then archived (§0.3); lib/automation moved into cos/automation (AE6 slice b).
    expanded_2026_11_08: >-
      James, 2026-11-08: "just need the automation engine fully built and in the automation tab" · "cos is the orchastrator". AE5 is COS's
      Automation tab (PL_D13): today it holds only the supervisor's rules and start-at-boot, and says "Macros and rules … not built"; the engine
      (AE6 slice a) already answers /api/cos/automation/* (workflows, runs, log, scripts, catalogue, templates, pipelines, macros, triggers,
      webhooks). The tab becomes the engine's: Workflows · Pipelines · Runs (live, from /api/cos/events) · Triggers · Macros · Webhooks · Steps
      (the engine's catalogue) · Log · Supervision (today's page, kept as a section). A pipeline opens on ERAVOS's canvas as Steps (cos erv). His
      rule first: the preview, cos/ui/automation/preview/ (preview.png), shown 2026-11-08 before any of it is built.
    layer: ui
    depends_on: [AE4_repoint_the_registry, AE6_the_engine_moves_into_cos]   # AE6 added 2026-11-06: AE5 is COS's Automation page (PL_D13)
    files:
      - clear-glass/src/automation/routes.js
      - clear-glass/renderer/settings/sections/automation.js
      - lib/ui/brainos/brainos-automation.js
    spec: docs/2026-10-25-automation-engine-sovereignty-graph.md
    does: >-
      Point the automation UI at the orchestrator's door: Settings › Automation (clear-glass renderer) and the BrainOS automation
      panel call the orchestrator, not clear-glass's own engine. Clear Glass's old /automation/* routes either proxy to the
      orchestrator (back-compat for saved pages) or are retired and archived (§0.3, never deleted); its driver act/eval endpoint
      (AE2) stays. No dead route.
    proof: >-
      the automation UI driven in Clear Glass (glass.js, not Playwright) lists and runs a workflow through the orchestrator's
      door; CG-001b passes (no Playwright); no route 404s

order: >-
  AE_D1 and AE_D2 first (home + state). AE1 moves the neutral core to the orchestrator with the refactor tool (one reversible
  commit). Then the two ports in parallel: AE2 the browser-driver port (Clear Glass as driver), AE3 the engine door + the RAID
  decide. AE4 re-points AU1's registry (its only change is the transport target). AE5 points the UI at the orchestrator and
  cleans up Clear Glass's old routes. DAG: {AE_D1, AE_D2} → AE1 → {AE2, AE3} → AE4 → AE5. Each phase is specced again as its
  .phase + .graph (node lib/emerge/compiler/phase-specs.js) before its code, per his 2026-10-20 order. This is a relocation of
  already-specced, already-proven code, so the governing spec is this map plus the sovereignty graph, not a new emerge module
  spec (a technical call by his axioms-decide-technical-choices rule, to confirm).

# ── ADDENDUM 2026-10-25 (0.60.250) — building AE1 through the pipeline hardened the pipeline ──────────────────
# James: "i wanted you to simulate idearium, the entire process so you can find gaps, and debugg while building."
# Running AE1 through Idearium's real DG2 gate (lib/phase-graph.js) surfaced a gap: it computed crossings from each file's
# CURRENT system, so for this MOVE phase it reported 0–1 crossings and was blind to the ones the move CREATES. Fixed in
# 0.60.250: the phase now declares `moves:` (above), and graphFor foresees the created crossings. AE1's graph now carries 4
# `created: true` crossings (clear-glass → orchestrator: agent-mesh, routes, bridge, live-recording) + the lib macro.js edge.
# This is the pipeline PROVING, before any code moves, what the earlier hand dry-run argued: AE1 is one atomic move-plus-port
# cutover — the engine must RUN in the orchestrator and every clear-glass consumer must reach it by a route/port, designed out
# BEFORE the move. The build/verify split stands: the deterministic move + ports are built and gate-proven here; the live
# two-process run (Clear Glass ↔ orchestrator, the sync→async surface) is verified on his machine.

# ── ADDENDUM 2026-10-25 (0.60.256) — AE_D1 superseded: the engine is CORE, each system runs its own (his sovereignty) ──
# James: "clearglass still needs the automation for browser automation." · "sovereignty. like each system needs to be able to run on its own."
# AE_D1 set the home to the orchestrator (0.60.255). That broke Clear Glass's OWN browser automation: it would round-trip to the
# orchestrator and could not run with the orchestrator down. Superseded (the orchestrator decision is kept, §0.3): by his placement
# axiom (used by ≥2 systems → the kernel) the engine CODE is CORE (lib/automation/), and EACH system runs its own instance — Clear
# Glass local for browser automation (sovereign, standalone), the orchestrator its own for platform orchestration. Both require the
# kernel: no crossing. Per-process store namespace (NEXUS_AUTOMATION_NS) so neither ticks the other's workflows. The orchestrator
# still orchestrates (its instance); the engine is simply the kernel's because more than one system needs it. The move destinations
# above are lib/automation/ (not orchestrator/automation/, which keeps only the orchestrator's host index.js).

# ── ADDENDUM 2026-10-31 — AE2 and AE4 built (0.60.333) ──────────────────────────────────────────────────────────────────────────────
# James, 2026-10-31: "merge and finish automation and cos backend". AE2: clear-glass/src/automation/driver-port.js serves POST
# /automation/driver and /automation/macro-run on the wire server (:7704) with what Clear Glass had (_automationBrowser, its macro tool);
# the orchestrator's browserFn/runMacroFn reach it; Clear Glass down → only browser steps named (test-automation-driver-port 3/3, a real page
# through glass.js). AE4: lib/automation-registry.js sends every engine call to the orchestrator (:9000 /automation/*); clear-glass is a
# driver; describe() names the engine (test-automation-registry 11/11). AE5 (UI and cleanup) stays open.

# ── ADDENDUM 2026-11-06 — the home is COS (AE_D3), AE6 added, AE5 follows it ──
# James, 2026-11-06, asked whether the rest of lib/automation/ (the engine, pipelines, the scheduler) goes to COS or to the Orchestrator: "Cos I feel like. Have cos be the orchastrator complelelt."
# AE_D1 is superseded and kept. AE6 moves the engine and its host into cos/automation/. AE5 depends on it and becomes COS's Automation page.
# The orchestration console (docs/2026-11-01-orchestration-console-phasemap.spec) builds in cos/automation/ from here: its lib/automation/ paths
# are read as cos/automation/ once AE6 lands.

# ── ADDENDUM 2026-11-06 (b) — AE6 expanded: the engine is rewritten in Emerge on Pillar's primitives, not moved as JavaScript ──
# James, 2026-11-06, after the coder said COS's manager must stay JavaScript for HTTP, processes and timers until Emerge has them: "okay but no js then right?" · "im saying to code primitives to replace javascript. using pillar"
# AE6 now: cos/automation/*.eg (the engine, pipelines, steps, triggers, cron), standing on Pillar's contracts (Event, Gate, Clock, Process,
# Port), built and run by emerge.exe. The JS in lib/automation/ is archived when the .eg engine passes its tests (§0.3). Until CIE10 and CIE13
# land, the .eg engine runs under Emerge's interpreter behind COS's route; no new JavaScript is written for it.
# AE6's depends_on grows by PIL2_contracts; CIE10 and CIE13 are what make it run without Node.

# ── ADDENDUM 2026-11-09 (0.60.465) — one tab (his) ─────────────────────────────────────────────────────────────────────────────────────────────
# James, 2026-11-09: "Okay now automation and pipelines have 2 tabs for some reason… Deployments? Hub? What is this noise? There's supposed to be one
# fucking tab. Why are you adding three tabs to do the same thing?" · "Yeah. It should all exist in one tab."
# AE5 expanded: Automation is COS's one tab for automation. Done now: Pipelines (PC1), Hub (OC8a), Deployments (OC4a) off the rail, kept by route.
# To build after his go on cos/ui/automation/preview/one-tab.png: the hub's slots as one status line; deployments as Runs with where each ran
# (take / refuse / recall there); Run here · Run on a system on a pipeline; Start at boot only in Settings (removed from Supervision).
