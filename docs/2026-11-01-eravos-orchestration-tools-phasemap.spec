# docs/2026-11-01-eravos-orchestration-tools-phasemap.spec — ERAVOS tools for orchestration: the parts of Nexus's orchestration as tools on his
# ERAVOS canvas, wired to each other like any ERAVOS tool, each reaching Nexus only through COS's door. The idea is James's; the tool list,
# the one door and the cut are the coder's reading, said where they are.

origin: >-
  James, 2026-11-01, after the macro blocks and the gates between them: "then we should build tools for eravos for the orchastration."
  Earlier the same day: "I want cfr and rfr2 as a visual diagnostic map of the system, the tension and friction, showing real data moving
  through the system. using the eravos canvas." (CP_D4) · "miniworld is the meta layer for compartments … the miniworld would be the same as the
  cos compartments. basically cos is the orchatrator."

already_there_2026_11_01: >-
  - The canvas: cos/archetype/eravos-canvas. It has a kernel and runtime (organism-sdk.js, wire-system.js, canvas-wm.js), its tools/ by
    domain and category, and build/ (new-tool, index-tools, validate).
  - A tool: cos/archetype/eravos-tool (eravos.tool/1). The engine's define() holds params (config) and ports (hooks). "It runs with no window
    and talks to the world only through its ports."
  - A domain extends the SDK with OrganismSDK.extend({ id, std, uiHooks, ctx }). That is the sanctioned place to give a domain's tools a
    capability.
  - COS's door (cos/manager/server.js, :7799):
      GET /api/cos/health, /systems, /systems/:name, /ledger, /usage, /policy, /proposals, /contract, /events (SSE);
      POST /api/cos/systems/:name/start|stop|restart|touch|reset-circuit {by}, /boot {by}, /proposals, /proposals/:id/take|drop;
      PATCH /policy {by}; and /contract-map/:system (a system's own interaction contract, read through COS).
  - The pieces of orchestration a tool would stand for:
      macros and their gates (0.60.343, MB1);
      pipelines and workflows (Clear Glass's automation engine; the orchestrator's automation, AE2);
      agents (copilot's hats, the round table);
      CFR / RFR2 (intelligence/cfr, intelligence/rfr2).

readings_to_confirm:
  - "\"tools for eravos for the orchastration\": read as a new ERAVOS domain, orchestration, whose tools are Nexus's orchestration parts. They are wired on the canvas as an orchestration graph you can see run, with COS as the orchestrator underneath (his \"cos is the orchatrator\"). To confirm."
  - "The canvas is where an orchestration is composed and watched. COS still runs it, so a canvas closed or crashed stops nothing that COS started (§5.9). To confirm."

decisions:
  EO_D0_one_door:
    status: "PROPOSED 2026-11-01 (the coder's, by the axioms; the reading above to confirm)"
    chosen: >-
      The orchestration domain gives its tools one capability, ctx.cos, through OrganismSDK.extend: call(method, path, body) and on(event),
      limited to COS's door (/api/cos/*, /contract-map/*) and never another system's port. Every act carries by: 'canvas:<tool-id>' (MG-006
      says who acts). Systems are reached as COS reaches them, through their contracts.
    by_the_axioms: "§5.9 / §5.15 (one door, no reach into a system's files or ports), §8.6 (the SDK's own extend, COS's own routes), §9.1 (RAID stays the write authority for the system's own decisions: a tool proposes through /api/cos/proposals, never decides for RAID)"

  EO_D1_the_tools:
    status: "PROPOSED 2026-11-01 (the coder's list from what exists; to confirm)"
    chosen: >-
      flow (pure, no door):
        delay   pass the event on after a fixed, ranged or human pause (MB1's kinds);
        gate    pass it only when its condition holds;
        merge, split, schedule.
      cos:
        compartment  one system: its state, start/stop/restart, and its ports from its contract;
        events       COS's event stream as an out port;
        ledger       what COS did, and who;
        proposal     hold a change for him: take or drop.
      work (through the systems' contracts, via COS):
        macro, pipeline, workflow, agent (send a task to a hat).
      measure:
        tension (CFR) and friction (RFR2) on a compartment or a wire. These are CP_D4's diagnostic map, drawn with the same tools.

phases:
  EO0_the_domain_and_its_door:
    status: OPEN
    depends_on: [EO_D0_one_door]
    files: [cos/archetype/eravos-canvas/tools/orchestration, cos/archetype/eravos-canvas/canvas/runtime/organism-sdk.js]
    interface: [html]
    does: "the orchestration domain: OrganismSDK.extend gives ctx.cos (call and on, COS's door only, by: canvas:<tool>); a call outside /api/cos/* or /contract-map/* is refused and said"
    proof: "a tool calls GET /api/cos/systems and gets the list; a call to another port is refused; validate.mjs passes"
  EO1_flow_tools:
    status: OPEN
    depends_on: [EO0_the_domain_and_its_door]
    files: [cos/archetype/eravos-canvas/tools/orchestration/flow]
    interface: [html]
    does: "delay (fixed, range, human: gate-eval's delayMs), gate, merge, split and schedule, each an eravos.tool/1 with its spec, ui and test"
    proof: "each tool's own test; a chain delay → gate on the canvas passes an event after the pause and only when the gate holds"
  EO2_cos_tools:
    status: OPEN
    depends_on: [EO0_the_domain_and_its_door]
    files: [cos/archetype/eravos-canvas/tools/orchestration/cos]
    interface: [html]
    does: "compartment (state, start/stop/restart with by, its contract's ports), events (COS's SSE), ledger, proposal (take/drop)"
    proof: "against a real COS manager in a test: a compartment tool starts and stops a fixture system and the ledger tool shows it, by canvas:<tool>"
  EO3_work_tools:
    status: OPEN
    depends_on: [EO2_cos_tools, MB1_the_gate_between]
    files: [cos/archetype/eravos-canvas/tools/orchestration/work]
    interface: [html]
    does: "macro, pipeline, workflow and agent, each calling its system's route as COS's contract map names it; a route a system does not serve is said, never faked"
    proof: "a macro run from the canvas through its system's route, its result on the out port"
  EO4_measure_tools:
    status: OPEN
    depends_on: [EO2_cos_tools, CP11_the_diagnostic_map]
    files: [cos/archetype/eravos-canvas/tools/orchestration/measure]
    interface: [html]
    does: "tension (CFR) and friction (RFR2) on a compartment or a wire, from real readings; no reading is said as none, never zero"
    proof: "readings from a running intelligence; with intelligence down, the tool says so"
  EO5_opened_from_cos:
    status: OPEN
    depends_on: [EO1_flow_tools, EO2_cos_tools]
    files: [cos/ui, cos/archetype/eravos-canvas/serve.js]
    interface: [html]
    does: "the canvas opened from COS's UI as a compartment window, with the orchestration tools in its add menu"
    proof: "driven in Clear Glass: a compartment tool and a delay wired, started, seen running"

build_order: "EO0 → EO1 and EO2 → EO3, EO4 → EO5."
