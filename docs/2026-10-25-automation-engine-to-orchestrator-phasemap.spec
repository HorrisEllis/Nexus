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
    status: OPEN
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
    status: OPEN
    layer: integration
    depends_on: [AE1_move_the_core]
    files:
      - clear-glass/src/automation/driver-port.js
      - clear-glass/src/main/index.js
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
    status: OPEN
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
    status: OPEN
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

  AE5_ui_and_cleanup:
    status: OPEN
    layer: ui
    depends_on: [AE4_repoint_the_registry]
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
