# docs/2026-11-08-pipeline-canvas-phasemap.spec — pipelines as a node canvas: boxes, wires, gates; procedures and frameworks as steps; a step that
# is a build request. Spec: cos/spec/pipeline-canvas.spec. The ask and the direction are James's; the inventory, the cut and the order are the coder's,
# by his axioms (§3.3 map before build, §8.6 reuse before build). Only what nothing covers is written here; the rest EXPANDS the phases that own it
# (his 2026-11-03 rule, SL_D11), listed under `expands:`.

origin: >-
  James, 2026-11-08: "spec whats needed. phase steps towards the endstate. like we need editable proceedures/frameworks to use as a step by step
  proceedure. like a macro but i want those to be able to be a step, recursive automation pipelines." · "like i want a beautiful visual, steps as
  boxes, with wires as the flow into the hooks of gates as compartments. boxes can  be gates, systems, agents, macros, pipelines, tools, like a node
  based canvas for pipelines, which are compartments from cos or the ability to have them built from the pipeline like a step can also be a build
  request, like a gap, or error or bottleneck, holy shit that is huge. build pipeline, automation pipeline, debug pipeline, coding pipeline, agnostic
  pipelines, using dag, contracts, gaps, stepwise, automations, compartments. etc." Said after OC8a (0.60.447, COS the hub) and his context the
  same day: "i want idearium to be used to build capability towards an endstate if nexus cant do it, build it. like synthesizing into a compartment."

end_state: >-
  Any pipeline in Nexus (build, automation, debug, coding, or any other) is drawn and run on one canvas. Each step is a box: a gate, a system, an
  agent, a macro, a pipeline, a procedure (or framework), a tool, or a build request. Wires carry the flow into a box's hooks. A box that is a
  pipeline or a procedure opens into its own canvas, which makes the pipelines recursive. A step Nexus cannot do becomes a build request: a gap, an
  error or a bottleneck turned into a box that gets the capability built (his "synthesizing into a compartment") and then lets the run go on. Each
  pipeline is a DAG, each box has a contract, and each run lives in a COS compartment.

found_while_mapping:
  # read in source 2026-11-08; none of it was run for this map
  - "Recursive pipelines already run: lib/automation/steps.js has the step 'pipeline' (⛓ Run a pipeline). engine.js refuses a loop in the chain and stops at MAX_DEPTH 5 (lines 1232–1249). Workflows nest the same way. What is missing is a chain that spans kinds (pipeline → procedure → pipeline)."
  - "Procedures exist (PD1, 0.60.354): lib/repo-procedures.js, the library idearium/procedures/, served at GET /api/procedures and POST /api/procedures/:id/run. A procedure is not yet a step in a pipeline."
  - "The canvas is decided (OC_D2, his, 2026-11-01): the ERAVOS canvas (cos/archetype/eravos-canvas), each step a tool, each dependency a wire, run through COS. Its tools are EO0–EO5 (docs/2026-11-01-eravos-orchestration-tools-phasemap.spec), all OPEN."
  - "Gates: the gate after every step (PA4, MB1, BUILT); one gate shape for macros and pipelines is MB3, OPEN."
  - "The step catalogue is the engine's: browser, extract, wait_until, script, autofill, pipeline, macro, workflow, agent, command, … (lib/automation/steps.js). The canvas's box kinds are a superset: a system and a build request are not engine steps."
  - "A build request has a home already: GM5's 'build' row (lib/context-sources.js) returns what no source covers as what a build would be asked. RAID's contract queue (RD0) holds contracts. The hub slot 'experiments' (OC8a) waits on RQ15, a compartment made from a contract, the test and the DAG. Nothing turns a failed step into a build request yet."

decisions:
  # PC_D1–PC_D3 are his to reconcile (CLAUDE.md, 2026-11-03: "Ambiguity must be reconciled by me"). Side by side; the coder's recommendation is named as the coder's.
  PC_D1_gates_as_compartments:
    status: >-
      DECIDED 2026-11-08 by James, superseding both readings below (kept, §0.3): "Gates need to be programmable. Maybe compartment types like that
      cos has. Cos and agents can make more types by using schemas or building them from the chunking tool, work surface, etc." A gate is an instance
      of a gate TYPE, as a compartment is an instance of an archetype (cos/archetype: built-ins plus custom, checked by its schema). PC5 builds it.
    his_words: "with wires as the flow into the hooks of gates as compartments"
    readings:
      a: "Each gate is the door of a compartment. Wires go into a box through its gate, and the hooks are the gate's inputs and outputs. This fits his words on the registry: 'The drawbridge is the the component registry, which is also the event bus, and interaction contract and bridge into the compartment.'"
      b: "Each gate box runs as a COS compartment of its own, sandboxed. Its check runs in there, and its hooks are that compartment's ports."
    coders_recommendation: "(a). It is the drawbridge he already named, and it adds no process per gate. (b) is possible later for a gate that runs code (a script check)."
  PC_D2_frameworks_as_procedures:
    status: "DECIDED 2026-11-08 by James — \"yes .framework\": reading (a), his .framework files run as procedures, each section a checked step"
    his_words: "editable proceedures/frameworks to use as a step by step proceedure"
    readings:
      a: "A .framework file of his (docs/innovation-toolkit.framework) can be run as a procedure. Its sections become steps, each with a check of what that section must produce. So 'use my framework' becomes a step a pipeline can hold."
      b: "'Framework' is another word for procedure, and nothing beyond .procedure is needed."
    coders_recommendation: "(a). It turns thread T10's by-hand framework pass into a step that can be run and checked again."
  PC_D3_when_a_step_becomes_a_build_request:
    status: "DECIDED 2026-11-08 by James — \"Using the gates to determine gaps after each step.\" The gate after every box finds the gap (reading b);
      the offer is held for his take by his axioms (OC-002, USER_AUTONOMY), and a build box can always be placed by hand (a)."
    his_words: "a step can also be a build request, like a gap, or error or bottleneck"
    readings:
      a: "Only when he (or an agent) places a build box."
      b: "Also by itself: a step that fails, a gap the context search could not fill, or a box over its time budget offers a build box in its place. The offer is held as a COS proposal until he takes it."
    coders_recommendation: "(b), offered and never applied by itself (OC-002, USER_AUTONOMY), with (a) always available."

  PC_D5_emerge_writes_the_code:
    status: "DECIDED 2026-11-08 by James"
    his_words: "Eravos for the visual canvas, emerge for the code generation, idearium has a pipeline, all programmable and manageable. Agnostic. Eravos is perfect for this."
    chosen: >-
      The canvas is ERAVOS (his again; OC_D2). The code a build request needs is generated by Emerge, reached by its own route (§5.15), so PC3 is the
      first consumer of Emerge's code generation and the focus (Emerge first) and this map meet there. Pipelines are agnostic: the box shape names no
      domain; build, automation, debug and coding are templates (OC9).
  PC_D6_idearium_has_a_pipeline:
    answered_2026_11_08_b: >-
      James, 2026-11-08, asked between "Idearium's build pipeline (idea, spec, phases, build)" and "Idearium's .pipeline nodes (PN2)": "First one.
      Like pipelines. Which can use the .frameworks for procedures. Look for the phases for this". Reading (a) is now his: Idearium's own build
      pipeline is the first real pipeline drawn and run on the canvas, and its steps can be procedures, a .framework among them (PC_D2, PC2). The
      phases that carry it, found by reading (the ledger's covers found none by intent): PC2 (procedures and .frameworks as steps, slice b below),
      OC9_templates (the build pipeline as the first template, expanded there), PC4 and EO5 (it shows on the canvas in COS's Automation tab).
    status: >-
      ANSWERED 2026-11-08 by James: "idearium is for project management." The coder's reading, to confirm: Idearium holds the project, its end state
      and its phases (what is managed); a pipeline is a project's artifact, kept with the project in Idearium, and COS runs it (closest to b). His
      self-building loop as the first pipeline on the canvas (a) is not ruled out by it; not assumed either.
    his_words: "idearium has a pipeline"
    readings:
      a: "Idearium's own pipeline (spec → phases → each phase specced → build, the self-building loop) is one of the pipelines drawn and run on the canvas, its first real one."
      b: "Idearium is where pipeline definitions live and are managed (the library), and COS runs them."
      c: "both."
    coders_recommendation: "(c): his self-building loop as the first pipeline on the canvas, and Idearium holding the library as it holds the procedures (PD_D0 placement)."
  PC_D7_portable_pipelines:
    status: "DECIDED 2026-11-08 by his axioms; to confirm"
    chosen: >-
      A .pipeline is a portable artifact: a node file in the shared envelope, its boxes and wires checked against the Box schema, runnable by any runtime
      that honours it. COS is one runtime, and Emerge's port is another (PC_D4). Asked of him by an assistant he quoted; answered here by his NC0 rule
      ("the components in the component registry can be any language") and §5.15 (swappable).
    by_the_axioms: "NC0 (neutral core, a schema for everything reusable), §5.15, §10.3"
  PC_D8_options_not_neat_boxes:
    status: "DECIDED 2026-11-08 by James"
    his_words: >-
      "Like run tests, notify failure, run diagnostics or log failures or faults, retry logic gate to prevent from continueing or have options. Like
      options are better than neat boxes. Programmable. Hard corded has to earn its place and a node or api call is better than static." · "nexus is
      meant to be agnostic and non linear."
    context: >-
      Said after PC_D1's two readings (a gate as a compartment's door, or a gate in its own sandbox). Found when mapping: today a gate's outcome is one
      of three hard-coded words (lib/automation/steps.js AFTER_CLOSED = stop | skip | retry, PA4).
    chosen: >-
      A gate's check and everything it does on each outcome are programmable: each is a node or a route call, not code in the engine. Outcomes are
      open, closed and gap (PC_D3). Each outcome holds a list of actions (run tests, notify, run diagnostics, log a fault, retry with a policy, hold the
      run, branch to another box), and a gate can offer the person a set of options to choose from instead of one fixed path (his "options are
      better than neat boxes"). stop, skip and retry stay as the first shipped actions, now data (§0.3). The flow is non-linear: an action can wire to
      any box, not only the next.
    by_the_axioms: "his 'hardcoded has to earn its place' (idearium/spec-engine/templates/architecture-spec.template.yaml); §5.15 (an action is a route call); NC0 (a schema for everything reusable); USER_AUTONOMY (options are his to pick)"
  PC_D9_meta_autonomous_agnostic_nonlinear:
    status: "DECIDED 2026-11-08 by James"
    his_words: >-
      "yes then the intelligence system can find anomolies, bottlenecks, gaps, etc. meta, autonmous, agsnotic, and nonlinear, is the goal, using
      emerge as the language. build anything it doesn't have, iterate until it reaches the end state. cos for tests, emerge should build stable code,
      agents. like this is huge." · "gate types, can also use the snapshot engine, versionium and cos. its all connected. agents and copilot and all
      the agent tools." · "also show me the preview for the ui before building it but bottom up, first."
    chosen: >-
      The roles: Intelligence watches every run and finds anomalies, bottlenecks and gaps (PC6); Emerge is the language and writes the code a build
      needs (PC_D5); COS runs the tests and holds the compartments; Idearium manages the project and its end state (PC_D6); agents, copilot and every
      agent tool are boxes and gate actions. The loop iterates until the end-state contract passes (PC7). Gate types can act through the snapshot
      engine, Versionium and COS (PC5). The order is bottom up (PC1 first); the canvas UI is shown to him as a preview before it is built (PC4's
      prerequisite) — the coder's reading of "show me the preview for the ui before building it but bottom up, first", to confirm.
  PC_D10_the_canvas_is_the_surface_tools_are_made:
    status: "DECIDED 2026-11-08 by James"
    his_words: >-
      "It's all connecting. No, okay. Well, don't. I don't need a copy. It's going to be the same. I don't need a copy. Right, the canvas is what the visual surface is, and then the tools are what to make for it. So that way, if it needs a tool, it can be made. If it's missing something, it can be built."
    context: >-
      Asked which ERAVOS PC4 builds on, after HorrisEllis/Eravos-Canvas was cloned (3.48.3: dataflow, agents and coding domains): (a) the repo,
      (b) Nexus's copy (cos/archetype/eravos-canvas), (c) the repo as the source.
    chosen: >-
      One canvas, ERAVOS, in its own repository; no copy in Nexus (ERV_D1, ERV_D2). The canvas is the visual surface; every box kind is an ERAVOS
      tool, made for it (an orchestration domain beside dataflow, agents and coding). A tool the canvas lacks is not worked around: it is a build
      request (PC3) whose output is an ERAVOS tool from ERAVOS's own tool template, tested, then registered in ERAVOS's registry (ERV2).
  PC_D12_cos_is_the_meta_system:
    status: "DECIDED 2026-11-10 (his)"
    james: '"cos is going to be the entire meta system for nexus."'
    context: "Said with: COS replaces polling with each system's heartbeat (PR6), the pipeline builds Nexus, and every step measured. COS as the orchestrator of compartments was specced the same day (cos/spec/pipeline-canvas.spec)."
    chosen: "COS is Nexus's meta system: it runs, watches, measures and rebuilds the systems; the pipeline is its piping"
  PC_D13_the_pipeline_works_first_then_cos_optimised:
    status: "DECIDED 2026-11-10 (his)"
    james: '"okay but the pipeline in the automation engine in cos needs to be able to execute, or manage the pipeline. thats what its for. seeing, changing, managing, diagnosing, exporting, testing, agnostic. the pipeline is going to be huge. like we can use it to record each step in raids decision, dynamically building each step, as it goes. it all needs to be visable. creating copilot tools, frameworks, macros, agnostic in every way. all of nexus programmable and visable and then completed contracts can become replayable pipeline nodes." · "so pipeline working needs to happen. then cos optimized"'
    context: >-
      Said after the coder laid out what Nexus needs to build itself on his machine (a Lenovo all-in-one: i3-1215U, 7.7 GB, memory at 91%, disk
      at 99%): on-demand systems, heap caps, the heartbeat with its deltas (PR6, PR4), load balancing (CP6f) and the PC7 loop. He put the
      pipeline first.
    chosen: >-
      First, the pipeline in COS's automation engine works and is operable: execute, see, change, manage, diagnose, export and test, for any
      kind of step (copilot tools, frameworks, macros). RAID's decisions are recorded as steps as they are made, everything is visible, and a
      completed contract becomes a replayable pipeline node (PC7). Then COS is optimised (PR6, PR4, CP6, on-demand and heap caps).
  PC_D14_a_desktop_driver_for_agents:
    status: "DECIDED 2026-11-11 (his)"
    james: '"would you be able to the Remote Desktop that you have. Can you replicate that as an option so you can utilize that in COS UI?" · "Do it. Are you able to build or add an option for remote" · asked who it is for: "I’m saying for you. Like look at clearglass. Nexus nerve, cleardriver injecting coordinates into the dom." · asked its default: "Na"'
    context: >-
      Asked: is the remote option for him from his phone, for Nexus's agents, or for the coder through COS. The coder said that Anthropic's own
      Remote Control already lets a cloud session see and drive his PC. He answered: for the coder, the way Clear Glass's driver (the nerve,
      ClearDriver) injects coordinates into a page.
    chosen: >-
      A desktop driver: the whole screen driven the way ClearDriver drives a page, through COS (screen, click at x,y, type, key, scroll),
      used by the coder through his Remote Control link (the coder runs COS's commands on his own PC, so nothing is exposed to the internet)
      and by Nexus's agents as a pipeline step.
    reading_to_confirm: >-
      "Na" to the default was read as no preference. The coder's default, by the axioms (REVERSIBILITY, USER_AUTONOMY, §1.2): off until he
      arms it from COS for a set time. Armed, it acts; a kill switch disarms it; every act is logged with who and why.
  PC_D0_reuse_first:
    status: "DECIDED 2026-11-08 by his axioms"
    chosen: >-
      The canvas is ERAVOS (OC_D2). Boxes are EO tools (EO1–EO3). The run is the engine's (lib/automation, moving into COS by AE6, AE_D3). Gates are
      the PA4/MB1 gate in one shape (MB3). Procedures are his .procedure (PD_D0_addendum). This map adds four things: one box shape over every kind
      (PC1), procedure and framework steps with one chain across kinds (PC2), the build-request step (PC3), and the box kinds on the canvas (PC4).
      The pipeline kinds he named (build, automation, debug, coding, agnostic) are templates over the one shape, which expands OC9; they are not
      separate engines.
    by_the_axioms: "§8.6 reuse before build; §10.3 one truth per type (one box shape, one gate shape); §5.15 each box reaches its owner by route; §3.3; his 2026-11-03 rule (phases expand)"
  PC_D4_language:
    status: >-
      SUPERSEDED 2026-11-08 by James (the text below kept, §0.3): "using emerge as the language" · "emerge should build stable code". PC1–PC7 are
      written in Emerge (.eg), each a component with hooks in Emerge's own registry (CIE-EG §5, as pillar/). What Emerge lacks is built into Emerge,
      not worked around (§17.13): found 2026-11-08, Emerge has read_file and parse_json but no YAML reader and no folder listing, and the .pipeline
      and .procedure nodes are YAML; so the box tests feed JSON, and a test harness in JS converts the tree's YAML for the round-trip, named as
      temporary until CIE14 (parse_yaml) and CIE13 (sys_file listing) land. Route serving and processes in .eg wait on CIE10 and CIE13; until then
      COS's manager (JS by its contract) calls the .eg components by eg build output, said on each phase.
    chosen: >-
      COS's manager code is JavaScript by its contract (cos/spec/cos-manager.spec language_stack), and the engine moves into COS as it is (AE_D4). So
      PC1–PC3 land as JavaScript in cos/automation/, and their .eg port follows the engine's (CIE13, CIE10, thread T10). The box shape is written as a
      schema first (cos/spec/pipeline-canvas.spec), so the port is a re-implementation against the same contract (§17.13 names the contract).
    by_the_axioms: "§17.13 (another language only where a contract names it), NC0 schema rule"

phases:
  PC1_one_box_shape:
    status: "BUILT 0.60.448 — in Emerge: cos/automation/box.eg, cli.eg, test/box.test.eg 8/8; test-pipeline-box 4/4 (fiverr-gig.pipeline and update-nexus.procedure round-trip unchanged). Built: the shape, both conversions, problems(). Left for PC2–PC5: refs checked against live owners (known is passed in; unchecked kinds are said)."
    expanded_2026_11_08: "his 'Using the gates to determine gaps after each step': the gate after every box answers open, closed or gap; each box carries budget, recovery and deterministic; a nested run gets its own context (only wired hooks cross)"
    layer: library
    depends_on: [PC_D0_reuse_first, PC_D4_language, PL1_pipeline_core, PD1_procedure_nodes_and_commands, OC4_deploy_to_any_system]
    spec: cos/spec/pipeline-canvas.spec
    blocks: [MOD-PC-BOX]
    files: [cos/automation/box.eg, cos/automation/cli.eg, cos/automation/test/box.test.eg, cos/spec/pipeline-canvas.spec, tests/modules/test-pipeline-box.test.js, tests/modules/run-all.js]
    requires: [node]
    prerequisites: ["the engine's step catalogue read from lib/automation/steps.js (STEP_TYPES), not copied"]
    does: >-
      One Box shape for every step on the canvas: { id, kind: gate|system|agent|macro|pipeline|procedure|tool|build, ref, hooks: { in[], out[] },
      contract: { requires, gives }, gate? }, and a Wire: { from: box.hook, to: box.hook }. toBox() and fromBox() convert both ways with an engine
      pipeline task (PL1), a procedure step (PD1), a deploy task (OC4a) and a COS compartment, so a pipeline drawn on the canvas is the same file the
      engine runs (PN2's .pipeline) and nothing is kept twice. validate() checks the DAG (no cycle, every wire's hooks exist, every box's ref names
      something that exists, said when it does not).
    proof: "every existing .pipeline and .procedure in the tree round-trips through toBox/fromBox unchanged; a cycle, a dangling hook and an unknown ref are each refused and named"

  PC2_procedures_and_frameworks_as_steps:
    status: "OPEN — slice a BUILT 0.60.45x (the engine's 'procedure' step, AE7, OA-08); slice b, the .framework as a procedure, open"
    expanded_2026_11_08_c: >-
      James, 2026-11-08: "First one. Like pipelines. Which can use the .frameworks for procedures." Slice b: a .framework runs as a procedure inside
      Idearium's build pipeline. Read first, found: docs/innovation-toolkit.framework is today a document (Parts 1 to 8 and Section 0 as prose); it
      declares no inputs, outputs or checks. By his own PC2 rule ("A .framework shouldn't just be a document describing what to do") it is refused
      as a step until it declares them, and the refusal names what is missing (§1.2). So slice b is: (1) the .framework's executable form, its
      sections each a step with takes, gives and the check of what that section must produce, written beside the prose and never replacing it
      (§0.3; the prose is his); (2) Idearium reads it as a procedure through its own route (POST /api/procedures/:id/run, kind framework); (3) the
      engine's 'procedure' step runs it unchanged. Which sections become steps, and what each must produce, are his to say (his method, his words):
      the coder drafts from the Parts' own headings and he corrects.
    expanded_2026_11_08_b: >-
      James, 2026-11-08: "I'd pay particular attention to PC2. A .framework shouldn't just be a document describing what to do. It should be an
      executable, composable procedure with defined inputs, outputs, contracts and execution behavior. That creates a common foundation for macros,
      pipelines, procedures and nested workflows." · "Like the macros is clearglass. They should be executable. Also all of this can be exported or
      imported using a node. Like clearglass." So PC2 is the common executable foundation: a .framework, a .procedure, a Clear Glass macro and a
      .pipeline each declare inputs, outputs, a contract and execution behaviour (retry, recovery, budget, deterministic: PC1's Box fields), each runs
      as a step of any other (nested, the shared chain and MAX_DEPTH), and each exports and imports as a node in the shared envelope
      (lib/node-export.js), as Clear Glass macros and pipelines already do (PN2, clear-glass/automation/nodes/). A .framework that only describes is
      refused as a step, said. Read first: docs/innovation-toolkit.framework (his), lib/node-schemas/schema.framework, Clear Glass's macro runner
      (lib/agent-tools/tools/clear-glass/macro.js) and node import (/automation/nodes/:id/import).
    layer: library
    depends_on: [PC1_one_box_shape, PC_D2_frameworks_as_procedures, PD4_the_procedure_library]
    spec: cos/spec/pipeline-canvas.spec
    blocks: [MOD-PC-PROCEDURE-STEP]
    files: [lib/automation/steps.js, lib/automation/engine.js, idearium/api/index.js, idearium/procedures/, tests/modules/test-pipeline-box.test.js]
    requires: [node, "Idearium answering /api/procedures (its route; never its folder)"]
    does: >-
      A procedure is a step: the engine's new step 'procedure' runs one through Idearium's POST /api/procedures/:id/run and returns its run as the
      step's output. A procedure's confirm step (his yes) holds the pipeline at that box until he answers. A procedure step can run a pipeline (the
      command row), so the chain is shared across kinds: engine.js's chain carries every pipeline, workflow and procedure it passes through, a loop
      is refused, and MAX_DEPTH (5) counts them all. If PC_D2 is (a): a .framework is read as a procedure, its sections as steps with checks.
    proof: "a pipeline with a procedure step runs it and waits on its confirm; pipeline → procedure → the same pipeline is refused as a loop, said; depth 6 across kinds is refused"

  PC3_the_build_request_step:
    expanded_2026_11_17_lifecycle: >-
      James, 2026-11-17, giving the request lifecycle whole ("input into nexus goes to raid … raid decides what to do with each request … WE need a huge document for all of this, a map keep it all logged and referencable."): "if it doesn't have the capability is can use idearium to build the capability."
      Owns L6 of docs/2026-11-17-raid-request-lifecycle-phasemap.spec: a capability no registry offers (the component store checked first, RL_D3) becomes a build request to Idearium, a DAG node the contract waits on.
    status: OPEN
    layer: integration
    depends_on: [PC1_one_box_shape, PC_D3_when_a_step_becomes_a_build_request, PC_D5_emerge_writes_the_code, PC_D10_the_canvas_is_the_surface_tools_are_made, AE_D4_the_hub_structural, OC8_the_console]
    spec: cos/spec/pipeline-canvas.spec
    blocks: [MOD-PC-BUILD-STEP]
    files: [cos/pipeline/build-request.eg, cos/manager/server.js, cos/manager/contract.json, cos/manager/hub.js, idearium/cli/route-commands.js, tests/modules/test-pipeline-build-step.test.js, tests/modules/run-all.js]
    requires: [node, "Cortex answering RAID's contract routes (2a)"]
    does: >-
      His "a step can also be a build request, like a gap, or error or bottleneck". A build box carries a BuildRequest: { from: gap|error|bottleneck,
      what (the capability missing), evidence (the failed step's error, the gap's question, the time over budget), end (what done looks like: the test),
      dag (the box's place: what waits on it) }. Taking it (a COS proposal; his own taken at once, an agent's held) files it as a RAID contract by
      Cortex's route and opens a compartment for the build (the hub's "experiments" slot). The pipeline waits at the box. When the contract is
      fulfilled and its test passes, the box opens and the run goes on; when refused, the box fails with RAID's reason. If PC_D3 is (b): a failed
      step, an unfilled gap or a box over its budget offers a build box in its place, held for him. GET/POST /api/cos/builds, row `cos build`.
    proof: "a failing step offers a build box (held); taken, a RAID contract is filed on a stand-in Cortex; its fulfilment opens the box and the run finishes; a refusal fails the box with the reason"

  PC4_the_box_kinds_on_the_canvas:
    status: OPEN
    layer: ui
    depends_on: [PC1_one_box_shape, PC_D1_gates_as_compartments, PC5_programmable_gate_types, PC_D10_the_canvas_is_the_surface_tools_are_made, EO3_work_tools, EO5_opened_from_cos, MB3_one_shape_with_pipelines]
    spec: cos/spec/pipeline-canvas.spec
    blocks: [MOD-PC-CANVAS]
    prerequisites: ["a preview of the canvas shown to him and his go, before the UI is built (his 2026-11-08: 'show me the preview for the ui before building it')"]
    files: [Eravos-Canvas:tools/orchestration/work, Eravos-Canvas:tools/orchestration/flow, cos/ui/orchestration, tests/modules/test-pipeline-canvas.test.js]
    interface: [html]
    expanded_2026_11_14: >-
      James, 2026-11-14 (asked whether the pipeline builder comes first, since the pipeline could do the rest): "need the pipeline builder first? the pipeline could do all of this in theory" · then: "each step can be dynamically decomposed into smaller steps."
      The preview prerequisite is met: his "okay. thats more like it" to cos/ui/pipeline-editor/preview-11 (the quiet canvas, right tabs that
      slide out) and preview-9 (the Workshop on one gate). The canvas opens from COS's "Edit pipeline" (cos/spec/pipeline.spec addenda c–e).
      Built first, before RD9 slice c and the RAID compartment, so those are run by the pipeline rather than coded by hand. First slice: the
      canvas wired to real runs (run window, compartments and gates, Run / Pause / Retry from a step), a plain properties editor on double-click;
      the full Workshop later (MOD-PL-WORKSHOP).
    does: >-
      His "a beautiful visual, steps as boxes, with wires as the flow into the hooks of gates". Each kind is an ERAVOS tool with its own face (gate,
      system, agent, macro, pipeline, procedure, tool, build). Wires go from a box's out-hook into the next box's gate (PC_D1). A pipeline or procedure
      box opens into its own canvas and back (recursive). While a run goes, each box shows its state, a wire lights as the flow passes, and a closed
      gate says what it saw. Saved, it is the .pipeline file (PC1). It is never a picture of a run that did not happen: state comes from the engine's
      run.
    proof: "in Clear Glass (glass.js): a pipeline drawn with a gate, a procedure and a nested pipeline is saved, reopened the same, run, and each box shows its real state; the nested box opens its own canvas"
    # ── EXPANDED 2026-11-10 — James, 2026-11-10: "each step can be used as a progress status, with an indicator or bar."
    # Adds: a running pipeline shows each step's state, and a bar whose expected length is the step's baseline delta (PC6).

  PC5_programmable_gate_types:
    status: OPEN
    expanded_2026_11_08: "his 'gate types, can also use the snapshot engine, versionium and cos. its all connected. agents and copilot and all the agent tools.': shipped actions gain snapshot (Idearium's /api/snapshots, before a risky box) and rollback to it, record (Versionium, by lib/versionium-record.js's contract), cos-test (COS runs a test in a compartment), agent-tool (any agent tool through copilot's one door), and watch (PC6)"
    layer: library
    depends_on: [PC1_one_box_shape, PC_D1_gates_as_compartments, PC_D8_options_not_neat_boxes, MB3_one_shape_with_pipelines, PA4_a_gate_after_every_step]
    spec: cos/spec/pipeline-canvas.spec
    blocks: [MOD-PC-GATE-TYPES]
    files: [cos/gate/types.js, cos/gate/types/, cos/manager/server.js, cos/manager/contract.json, idearium/cli/route-commands.js, lib/automation/steps.js, lib/automation/engine.js, tests/modules/test-gate-types.test.js, tests/modules/run-all.js]
    requires: [node]
    prerequisites: ["the .gate extension defined in COS's own registry (EQ5: what it is, its schema, owner, writers, readers, kind) before the first type file is written"]
    does: >-
      Gate types, as COS has compartment types (cos/archetype). A GateType is a node file in COS's folder (cos/gate/types/<id>.gate): its check
      (a condition, a test run, a route call or a node), and for each outcome (open, closed, gap) a list of GateActions or a set of options for
      the person. A GateAction is a route call "<METHOD> <path>" on its owner (Diagnostic's diagnostics, the failure-mode index, a notify, a test
      runner), a node (a procedure, a pipeline) or one of the shipped actions (stop, skip, retry with a policy, hold, branch to a box). The starter
      types ship as files, not code: check, test, diagnose, fault-log, notify, retry, hold, options, gap. COS and agents make more: a new type is
      checked against the GateType schema and held as a COS proposal (an agent's waits for him); a type can be drafted from Idearium's tools (the
      chunker, the work surface) by their routes. The engine's gate after every step (PA4) reads its type instead of AFTER_CLOSED. GET/POST
      /api/cos/gate-types, row `cos gate-types`.
    proof: "a step whose gate type runs a stand-in test route closes, logs a fault through a route and offers his options; picking one branches the run; an agent's new type is held until taken; a type that fails the schema is refused, named; the three old onClosed words still run unchanged"

  PC6_intelligence_watches_the_runs:
    status: OPEN
    expanded_2026_11_08_measure: >-
      James, 2026-11-08: "deltas and sigmas to measure the gaps between have, and need. for the dag. can also potential use them to measure the time it takes pipeliness" Each box's run time gets a sigma against its own history (CFR, intelligence/cfr/sigma.js: 0 expected, 1 extreme; stored at write time, never recomputed), so a slow pipeline or box is a measured anomaly, not a feeling; the pipeline's whole time likewise. Time is his "potential" use: the coder reads it as wanted, to confirm.
    layer: integration
    depends_on: [PC1_one_box_shape, PC5_programmable_gate_types, PC_D9_meta_autonomous_agnostic_nonlinear]
    spec: cos/spec/pipeline-canvas.spec
    blocks: [MOD-PC-WATCH]
    files: [intelligence/pipeline-watch.eg, intelligence/routes.js, intelligence/registry-components.js, cos/gate/types/, tests/modules/test-pipeline-watch.test.js]
    requires: [node, "Intelligence answering its route", "COS's ledger and the engine's runs readable by COS's route"]
    does: >-
      His "the intelligence system can find anomolies, bottlenecks, gaps". Intelligence reads every pipeline run (by COS's route, never its files) and
      finds: anomalies (a box whose time, output size or failure rate leaves its own history: CFR's sigma, intelligence/cfr/sigma.js), bottlenecks (a
      box over its budget, or the box the most time waits on: RFR2's friction), and gaps (a gate that answered gap; a box whose ref names nothing).
      Each finding is a record with its evidence and offers a build box (PC3) in its place, held for him. A gate type "watch" (PC5) asks Intelligence
      at any box. Its own route: GET /api/intelligence/pipelines/findings.
    proof: "on stand-in runs: a box 5× slower than its history is an anomaly; the box most waited on is the bottleneck; a gap answer is a gap; each offers a build box, held"
    # ── EXPANDED 2026-11-10 — James, 2026-11-10: "the pipeline could handle this also, make it explicit, each event a step. each step measured by a delta, which
    # could be used for the timing in between each step agnostically, to establish a baseline. then we could add support for the supervisers load
    # balancer to establish base runtime behavior and sigmas to optimize. sigmas and deltas are domain agnostic." · "then be optimized overtime."
    # Adds: every event is a step; each step records its delta (the time since the previous); a baseline per step and its sigma, learned over runs;
    # the supervisor's load balancer (CP6f) reads the baseline as base runtime behaviour; a step past its sigma is a finding, and the run is
    # optimised over time from them.
  PC7_iterate_to_the_end_state:
    status: OPEN
    expanded_2026_11_08_measure: >-
      James, 2026-11-08: "deltas and sigmas to measure the gaps between have, and need. for the dag. can also potential use them to measure the time it takes pipeliness" The gap between have and need is a delta (RFR2, intelligence/rfr2/delta) over the DAG: for each box, what its contract needs against what exists and passed; the sum over the DAG is the distance to the end state. Each iteration must shrink it; a delta that does not shrink twice stops the loop, said (replaces "two iterations that change nothing" with the measured form).
    layer: integration
    depends_on: [PC3_the_build_request_step, PC6_intelligence_watches_the_runs, RQ15_cells_in_parallel, PC_D9_meta_autonomous_agnostic_nonlinear]
    spec: cos/spec/pipeline-canvas.spec
    blocks: [MOD-PC-LOOP]
    files: [cos/pipeline/loop.eg, cos/manager/server.js, cos/manager/contract.json, idearium/cli/route-commands.js, tests/modules/test-pipeline-loop.test.js]
    requires: [node, "Idearium answering the project's end state by route", "Emerge answering its build route"]
    does: >-
      His "build anything it doesn't have, iterate until it reaches the end state." A loop pipeline: read the project's end state from Idearium (its
      contract and its test), run the pipeline, let the gates and Intelligence name what is missing, build each missing piece (PC3, Emerge writing the
      code, COS running its tests in a compartment, a snapshot before and Versionium recording after), and run again. It stops when the end-state test
      passes, when a budget (iterations, time, tokens) is spent, or when two iterations in a row change nothing (said, with what is still missing).
      Every iteration is a record; nothing is claimed done without the end-state test's pass.
    proof: "a stand-in project whose end state needs two missing pieces: the loop finds both, builds each (stand-in Emerge), passes on iteration 3; a project it cannot reach stops on its budget, said, with what is missing"

expands:
  # the phases that own the rest of the ask, each expanded in its own map with his words (2026-11-08), not rewritten here
  - "EO3_work_tools (docs/2026-11-01-eravos-orchestration-tools-phasemap.spec): the procedure, tool, system and build boxes beside macro, pipeline, workflow and agent"
  - "OC10_pipelines_on_the_canvas (docs/2026-11-01-orchestration-console-phasemap.spec): the canvas is PC4's; boxes open recursively; runs shown on the boxes"
  - "OC9_templates (same map): build, automation, debug, coding and agnostic pipelines as templates over the one box shape"
  - "MB3_one_shape_with_pipelines (docs/2026-11-01-macro-blocks-phasemap.spec): the gate box is the one gate shape, and that shape is an instance of a gate type (PC5)"
  - "PD4_the_procedure_library (docs/2026-11-01-procedures-phasemap.spec): procedures editable on the canvas; frameworks as procedures if PC_D2 (a)"

order: >-
  His readings first (PC_D1, PC_D2, PC_D3). Then PC1, the shape every other piece stands on. Then PC2 and PC3 side by side (different files). EO0 →
  EO2 → EO3 and MB3 run beside them. PC4 comes last, because the canvas draws what PC1–PC3 and the EO tools already run. The coder's estimate,
  checked against the work and not promised (PC6 and PC7 added the same day, about one session each, after PC3 and PC5): PC1 one session, PC2 one, PC3 one to two, PC4 two to three with EO0–EO3 (EO is about 2 more). PC5 one to two, beside PC2 and PC3; PC4 draws the gate types PC5 makes.

handoff_2026_11_08: >-
  Session handed off at his 98% usage. State on claude/mg-17-startup-xpplxj (pushed, tree clean): 0.60.447 OC8a the hub (test-cos-hub 4/4);
  0.60.448 PC1 the box shape in Emerge (cos/automation/box.eg, eg test 8/8, test-pipeline-box 4/4). Decided today, his: PC_D1 gates are
  programmable types, PC_D2 .framework executable, PC_D3 gates find gaps, PC_D5 Emerge writes the code, PC_D8 options and nodes over static,
  PC_D9 meta/autonomous/agnostic/nonlinear with Emerge the language, PC_D10 one canvas (ERAVOS's repo), ERV_D1/ERV_D2. Open, his: PC_D6's
  reading ("idearium is for project management"), PC_D7 (portable .pipeline, by his axioms, to confirm). Next, bottom up, his order: PC2 (his
  emphasis above), PC3, PC5; then the canvas PREVIEW shown to him before any UI (PC4's prerequisite); building ERAVOS tools needs the repo attached
  with push (add_repo access push). Emerge gaps: no parse_yaml, no folder listing (CIE14); keywords as names (state). No PR opened for
  0.60.447/0.60.448 yet: ask him. Pre-existing, not fixed: two maps fail YAML parse (automation-engine 2026-10-25 line 133, cie-eg-build line 44),
  test-registry-sovereign RS-01 (Loom maps grew on main), CL-07 needs Guardian.

# ── ADDENDUM 2026-11-08 (0.60.451) — PC2 slice a built: a procedure is a step ──
# James, 2026-11-08: "A .framework shouldn't just be a document describing what to do. It should be an executable, composable procedure with defined
# inputs, outputs, contracts and execution behavior." · "Continue to get the automation done."
# - The engine's new step 'procedure' (lib/automation/steps.js, engine.js) runs one of Idearium's procedures through the host's port: COS's door
#   calls POST /api/procedures/:id/run (cos/manager/automation-door.js, its route, never its folder). The procedure's run is the step's output.
# - A confirm step waits for his yes. The run stops there and says what waits ("waits for your yes at: …"); the step's checkbox passes it.
# - The chain is the pipelines' chain, shared across kinds: a procedure already in it is refused as a loop; every kind counts toward MAX_DEPTH 5.
#   An engine with no procedure port says so.
# - Proof: test-orchestrator-automation OA-08 (a stand-in Idearium: the run, the held confirm, the loop, depth 6, no port), 8/8. Engine suites
#   green: automation-engine 16, automation-v2 18, test-pipelines 6, gates 7, nodes 5, steps 5, cos-hub 5.
# - The step is JavaScript inside the engine, which stays JavaScript until Emerge has timers and processes (CIE13): said, not hidden.
# Slice b, still open:
#   - Idearium carries the chain on when its procedure runs a pipeline, so procedure → pipeline → the same procedure is refused across systems;
#   - a .framework read as a procedure (PC_D2);
#   - each kind exported and imported as a node (lib/node-export.js).

# ── ADDENDUM 2026-11-08 (0.60.452) — PC3 slice a built: RAID takes a build request by route ──
# James, 2026-11-08: "a step can also be a build request, like a gap, or error or bottleneck" · "Continue to get the automation done."
# Found mapping PC3: RAID's contract queue could be read (GET /api/raid/queue) but nothing outside Cortex could write to it; submitContract was
# internal. Laid side by side: COS keeps build requests itself until RAID moves (it bypasses RAID, §9.1), or Cortex serves a submit route now. The
# route was taken: RAID is the only write authority for requests (§9.1), and the route moves with RAID when RAID moves into COS.
#   POST /api/raid/contracts { contract: { content, testContract?, title? }, source, intention, dependsOn?, onFail? } → { queueId, status }
#   GET  /api/raid/contracts/:id → the contract's row (status, stage, ...), or 404
# Proven on a real Cortex in the sandbox (port by NEXUS_PORT): a build request filed and queued; read back; a contract without content refused with
# the reason; an unknown id 404. No new test file (his rule: no new JS unless it replaces JS); the check is recorded here and in the changelog.
# Slice b: COS's builds (a build box offered as a held proposal after a failed step, his PC_D3; taken, filed by this route), and the engine's
# build step, which waits until the contract passes, then opens.

# ── ADDENDUM 2026-11-08 (0.60.454) — PC1 reachable: route, commands (agents and copilot), the COS page ──
# James, 2026-11-08: "cli commands, agent tools, copilot commands, inject nodes to agents. keep going. i want this built and added to cos ui."
# - Backend: cos/manager/boxes.js (JavaScript by COS's manager contract; no logic of the shape) runs Emerge's cos/automation/cli.eg boxes on a
#   pipeline read from COS's engine (its automation door) or a procedure read from Idearium's GET /api/procedures/:id (by route).
# - Routes: GET /api/cos/boxes?pipeline=|?procedure= and GET /api/cos/procedures, in COS's contract (its registry).
# - Commands: cos boxes, cos pipelines, cos procedures in idearium/cli/route-commands.js. One table: agents and copilot reach them through
#   nexus.command (copilot's DEFAULT_CHAT_TOOLS carries nexus.command.tool); none is personOnly. No second tool list (§10.3).
# - UI: the cockpit's Pipelines page (cos/ui/pipelines/): pipelines and procedures listed; the chosen one drawn as boxes (kind colour, ref, id,
#   gated), curved wires from its DAG, a box's whole shape on click, faults named. Read-only; ERAVOS is the editing canvas (PC4, PC_D10).
# - Found and fixed: cos/ui/serve.js matched a contract route's method exactly, so AE6's "GET|POST|PATCH|DELETE /api/cos/automation/*" was
#   refused for every page; it now reads a | list (and test-cos-ui CU-02 reads the contract through serve.js's own allowlist()).
# - Open, his: "inject nodes to agents" read two ways (see the version's question).

# ── ADDENDUM 2026-11-08 (after 0.60.454) — the UI is ERAVOS's, made of tools ──
# James, 2026-11-08, shown the cockpit's Pipelines page (0.60.454): "okay the ui is for eravos. using the tools."
# So the pipeline UI is not a COS page: it is ERAVOS's canvas, and each box kind is an ERAVOS tool (PC_D10, PC4, EO0–EO5). The cockpit's
# Pipelines page (cos/ui/pipelines/) is superseded as the UI; it is kept (§0.3) until the ERAVOS tools draw the same pipelines, then archived and
# reported. What 0.60.454 built beneath it stays and is what the tools call: GET /api/cos/boxes, GET /api/cos/procedures, the cos boxes / cos
# pipelines / cos procedures rows, Emerge's box.eg. HorrisEllis/Eravos-Canvas is attached to the session with push (2026-11-08), so the tools are
# built in its repository by its own rules (its CLAUDE.md, axioms, specs/).

# ── ADDENDUM 2026-11-08 (0.60.455) — nothing hard-coded on the page ──
# James, 2026-11-08: "yes. I need this done today. nothing is hardcoded. or integrate the canvas into the cos ui for now. but dont change anything,
# unless the tool needs more from the ui." · "i like that though. except for listing the kinds under it. show me a new preview"
# The kinds list is gone; GET /api/cos/boxes carries kinds (Emerge's box.KINDS); colours are computed from a kind's place in that list. Preview sent.

# ── ADDENDUM 2026-11-08 (0.60.456) — PC4 slice a: the box on ERAVOS's own canvas, by .erv ──
# James, 2026-11-08: "no i meant the entire canvas. i want nothing about the canvas changed. i want the tools compatable with eravos independantly. eravos is the build surface for nexus. that way if something needs to be built, we can make a tool for eravos. not rebuild it." · "nothing is hardcoded"
# - ERAVOS gains a domain of tools, not a rebuilt canvas: eravos.orchestration.box (HorrisEllis/Eravos-Canvas, branch claude/orchestration-domain).
#   It knows no kind, system or address: kind, ref, state and the whole step are data it is given; a kind's colour is its place in the kinds it
#   was given.
# - Nexus writes a pipeline or procedure as an .erv (Emerge, cos/automation/box.eg to_erv: one Box layer per step, laid out by the DAG; wires as
#   dataflow wires; JSON, which is YAML). Route: GET /api/cos/boxes?as=erv; row `cos erv`.
# - Proof: eg test 9/9; test-pipeline-box 5/5 (PB-05 reads the .erv through COS); in ERAVOS, the real canvas opens Nexus's fiverr-gig.erv with
#   Erv.open: 3 boxes, 2 wires, no faults (docs/previews/orchestration.png there); Box tool contract 4/4, its tests 3/3; boundary 10/10.
# - Next slice: run state on the boxes (COS's run events), and the cockpit page retired once he has seen the canvas.

# ── ADDENDUM 2026-11-08 — other domains' tools as steps; the Workshop; the name (asked) ──
# James, 2026-11-08: "why not call them compartments or steps? we could also support tools from other domains in the pipeline like making music.
# merge the other brach. also look at the workshop"
# - Merged: HorrisEllis/Eravos-Canvas PR #138 (the Orchestration domain and its Box tool) into ERAVOS's main, merge 3f0ea33.
# - Other domains' tools in a pipeline (PC4 slice b, the coder's reading, to confirm): a step whose ref names an ERAVOS tool (any domain: a
#   music tool, an image tool, AI Step, Code Cell) is that tool itself on the canvas, wired to the steps around it by the ports it has (dataflow
#   where it has them; a step box beside it where it has none), so a pipeline can make music as one of its steps. The .erv carries the real tool
#   layer instead of a box.
# - The Workshop (ERAVOS specs/eravos.workshop.spec, agnostic, his: "Agnostic." 2026-11-06; W1 built 3.150): ONE object on a work surface edited
#   completely; layers (curve, value, events, raster, adjust, and since 2026-11-07 constraint and emergent); a zoom path up and down levels; a
#   domain plugs in by Workshop.addKind, the workshop unchanged. A step and a pipeline fit it as kinds: a gate is a constraint layer (admits or
#   refuses), a run's output is the emergent layer, the zoom path is step ↔ pipeline ↔ project (his recursion, PC2), the contract a value layer.
#   That is the edit surface for one step (PC4 slice c, to map with him), the canvas stays the surface for the whole pipeline.
# - The name: asked side by side (his): Step (the unit of a pipeline; the category is already "Steps") or Compartment (COS's isolated unit
#   where a step runs, or a build happens: RQ15, PC3). The coder's recommendation: the tool is "Step", and a step that runs isolated runs "in a
#   compartment". Renaming changes the tool id (eravos.orchestration.box → .step); the only .erv using it is the preview, regenerated.

# ── ADDENDUM 2026-11-08 — the canvas holds the tools; the Workshop edits one (PC4 slice c, built in ERAVOS) ──
# James, 2026-11-08: "like we can use it for nodes, each compartment. like eravos needs to stay agnostic. maybe it edits steps, like it does a
# note, or pattern." · "always show me the ui preview first so i can give feedback" · shown the preview, then: "okay the workshop it to edit. the
# canvas are for the tools."
# - Built in ERAVOS (PR #139, merge 518e8dd): the Workshop kind orchestration.step, added by the Box's window (Workshop.addKind), the Workshop
#   unchanged. Its layers come from the step: gate (constraint, one field per gate key), step (kind from the kinds given), settings (every leaf,
#   typed), contract, last value (emergent). Every edit, undo and redo reaches the tool live. P153 2/2; boundary 10/10.
# - His rule, kept for every UI from here: a preview first, his feedback, then build (ERAVOS HIS-WORDS-MAP N7).
# - Still his: the name (Step or Compartment).

# ── ADDENDUM 2026-11-08 (0.60.457) — the Box in AI Automation; the Workshop reshapes to the step; no kinds shown ──
# James, 2026-11-08: "also no need to show kinds in the ui. stop doing that. adding noise to the ui" · "also pricing?" · "Also isn’t ai automation a
# domain already." · "The ui is meant to dynamically change in relation to the kind. Show me the ui for the workshop" · "I liked the uploaded
# screenshot. 3d. Is it like that? So why not use that domain? Yes. Follow the spec."
# - ERAVOS PR #140 (merge d9c2798): the Box is eravos.agents.box in AI Automation (category Steps); the Orchestration domain removed; the step's
#   Workshop kind is agents.step and reshapes to the step (IN PLAY / NOT IN PLAY from its data, as ERAVOS's UI field); no kind shown anywhere.
# - Nexus: box.eg writes eravos.agents.box; each box carries the step's own label (his pipelines label every task, e.g. "Scope & Pricing: each
#   package"); COS's Pipelines page shows no kind word.
# - The 3D studio layout he liked is the Workshop spec's later phases (ERAVOS specs/eravos.workshop.spec); the flat W1 is what is built.
# - Still his: the name (Step or Compartment; he said "eravos already uses compartments … thats find actually").

# ── ADDENDUM 2026-11-09 (0.60.463) — gates stand between steps on the canvas ──
# James: "Gates are inbetween steps. So compartment, gate, compartment, gate." box.eg with_gates: a step's gate becomes its own box after it; the
# step's wires out leave from its gate. Idearium's build pipeline opens as 16 tools (8 steps, 8 gates) and 15 wires, no faults
# (cos/ui/automation/preview/idearium-on-canvas.png). eg test 9/9, test-pipeline-box 6/6 (PB-06).

# ── ADDENDUM 2026-11-09 (0.60.464) — "steps are compartments from cos", gates as compartments, wires that track the request (his) ────────────────
# James, 2026-11-08, after Idearium's pipeline opened on ERAVOS's canvas with gate boxes between the steps: "Okay. So steps are compartments from
# cos. That way is can use the cos ui. Also need to show the programmable gates in between as a compartment themselves. I want the wires to track
# the actual request running through the pipeline. Check the phases. It’s agnostic. This can map anything. Can use the gates to build one step at
# a time, discover gaps. Like look at idearium. Like the code tab. Like I want it all programmable, manageable, explicit, automatic when it comes
# to requests. Use it to build macros, frameworks, pipelines, stepwise procedures or repeatable systems. I like the settings."
# Checked against the phases (his "Check the phases"; phase-ledger covers): nothing new is written; each part expands the phase that owns it.
expanded_2026_11_09:
  PC_D1_gates_as_compartments: >-
    Widened by his "steps are compartments from cos. That way is can use the cos ui": a step is a COS compartment too, not only a gate, so each box
    has COS's page for a compartment (its state, its log, its config, its resources) rather than a page of its own. Reading TO CONFIRM (his, §5.9):
    (a) each step IS a compartment COS declares (a long-lived entry in the system registry, with the cockpit page), or (b) each step RUNS in a
    compartment COS makes for the run (RQ15's cell, gone when the run ends), shown with COS's cockpit while it lives. Not built until he says.
  PC5_programmable_gate_types: >-
    His "need to show the programmable gates in between as a compartment themselves" · "programmable, manageable, explicit, automatic when it comes
    to requests": a gate is drawn and managed as its own compartment (box.eg with_gates, built 0.60.463, puts one between steps on the canvas); its
    type is the programmable part (cos/gate/types/<id>.gate), editable from the gate's box. Unchanged order: PC5 is built before PC4.
  PC4_the_box_kinds_on_the_canvas: >-
    His "I want the wires to track the actual request running through the pipeline": a wire shows the request itself as it passes (what left the
    step, what the gate saw and decided, how long), from the engine's run (automation.pipeline.task, AE5 0.60.462) by COS's route, never a picture.
    Backend first: the run record carries each task's output summary and each gate's verdict, then the event, then the canvas.
  PC7_iterate_to_the_end_state: >-
    His "Can use the gates to build one step at a time, discover gaps. Like look at idearium. Like the code tab" · "Use it to build macros,
    frameworks, pipelines, stepwise procedures or repeatable systems": the loop runs one step, its gate names the gap, the gap becomes a build
    request (PC3), and the next step is built only when the gate opens — as Idearium builds a project phase by phase. Agnostic (PC_D9): the same
    loop over a macro, a .framework (PC2 slice b), a pipeline, a procedure (OC9 templates).

# ── ADDENDUM 2026-11-09 (0.60.466) — PC5 slice a built ───────────────────────────────────────────────────────────────────────────────────────
# James, 2026-11-09: "Gates can hold context, test, verify, gates would do a lot. But not the same everytime." · "Okay. So build this."
built_2026_11_09:
  PC5_programmable_gate_types:
    status: "slice a BUILT 0.60.466 — eg test cos/gate/test/gate.test.eg 7/7; test-gate-types 6/6. Open: PC5b (his option resumes a held run; branch; notify)"
    files_built: [cos/gate/gate.eg (new), cos/gate/cli.eg (new), cos/gate/test/gate.test.eg (new), cos/gate/types/check.gate (new), cos/gate/types/test.gate (new), cos/gate/types/verify.gate (new), cos/gate/types/context.gate (new), cos/gate/types/emerge.gate (new), cos/gate/types/options.gate (new), cos/manager/gates.js (new), cos/manager/server.js, cos/manager/automation-door.js, cos/manager/contract.json (config), lib/automation/engine.js, lib/automation/pipeline.js, idearium/cli/route-commands.js, tests/modules/test-gate-types.test.js (new), tests/modules/run-all.js]
    prerequisite_met: "the .gate extension defined (cos/spec/pipeline-canvas.spec ADDENDUM 2026-11-09), in COS's spec until EQ5's registry exists"
    decided_by_his_axioms: >-
      Where the deciding lives: Emerge (§17.13, his "using emerge as the language"); COS's door only calls and keeps (§5.15: each owner by its route).
      Clear Glass's engine keeps its own instance and refuses a typed gate, said, rather than reaching into COS (AE_D2, §5.9).

# ── ADDENDUM 2026-11-09 (0.60.466) — PC5 expanded: one module in Emerge; a request kept as files until met (his) ──────────────────────────────
# James, 2026-11-09: "The gates are temporary unless it didn't finish." · "No. Terrible folder structure. This needs to be a module." · "Needs to use
# actual physical files in the backend, the steps. Like the dag and contract, and the relevant nodes. Like each step needs to be persistent until the
# contract and conditions for the request from the dag have been met." · "follow claude.md i thought we chose to move on and use .eg, emerge for code?"
expanded_2026_11_09_module:
  PC5_programmable_gate_types:
    status: "slice a BUILT 0.60.466 as the module cos/pipeline/ — eg tests box 10/10, gate 7/7, runs 4/4; test-cos-pipeline 8/8; test-pipeline-box 6/6"
    files_now: [cos/pipeline/box.eg, cos/pipeline/gate.eg, cos/pipeline/runs.eg (new), cos/pipeline/cli.eg, cos/pipeline/index.js (the one door), cos/pipeline/registry.json (config), cos/pipeline/types/*.gatetype, cos/pipeline/test/box.test.eg, cos/pipeline/test/gate.test.eg, cos/pipeline/test/runs.test.eg (new), emerge/emerge/lang/runtime.js, emerge/emerge/lang/MAP.md, emerge/emerge/lang/native/check_env_text.eg, emerge/emerge/lang/native/bin/emerge, lib/automation/pipeline.js, cos/manager/server.js, cos/manager/contract.json (config), idearium/cli/route-commands.js, tests/modules/test-cos-pipeline.test.js (new), tests/modules/test-pipeline-box.test.js]
    superseded_files: "cos/automation/{box.eg,cli.eg,test}, cos/gate/*, cos/manager/boxes.js, cos/manager/gates.js and a JavaScript runs.js written the same day: moved into the module or rewritten in Emerge (§17.13, his reminder)"
    decided_by_his_axioms: >-
      The logic of a request's files is Emerge (§17.13); where Emerge lacked folders, Emerge was grown (CIE14), not worked around. The door keeps only
      what Emerge cannot do yet: start a process, open a socket (CIE13, CIE10). The engine stays shared (AE_D2): a request's files are COS's, tied to
      an engine run by the start event's meta.

# ── ADDENDUM 2026-11-09 (0.60.468) — PC5 and PC4 expanded: the wires carry nodes (his) ────────────────────────────────────────────────────────
# James, 2026-11-09: "i meant the data that runs through the pipeline like idearium pipeline does, emerge, .contracts with .dag, .chunk, .context or
# any of the nodes." · "look at the idearium pipeline, don't limit to just my request for the node types".
expanded_2026_11_09_nodes:
  PC5_programmable_gate_types: "the node check and node.gatetype: a step's data is a node of its type, checked against lib/node-schemas; an undefined type is a gap"
  PC4_the_box_kinds_on_the_canvas: "what the wires carry is now data: each wire of a request's dag.dag names its node types, each step names the node files it took and gave (nodes/<step>/out.<type>); the canvas draws these"
  files_2026_11_09: [cos/pipeline/runs.eg, cos/pipeline/gate.eg, cos/pipeline/cli.eg, cos/pipeline/index.js, cos/pipeline/types/node.gatetype (new), cos/pipeline/registry.json (config), cos/pipeline/test/gate.test.eg, cos/pipeline/test/runs.test.eg, lib/automation/pipeline.js, lib/node-schemas/schema.context (new), lib/node-schemas/schema.dag (new), lib/node-export.js, cos/manager/server.js, tests/modules/test-cos-pipeline.test.js]
  proof: "eg gate 8/8, runs 5/5; test-cos-pipeline 9/9 (CP-08: .context → .contract → .chunk through COS's real engine; a .chunk missing its fields closes its gate, named)"
  open: "the steps that make these nodes from Idearium's own tools (RQ7 context, RQ9 the chunked contract, RQ12 the phase DAG) as pipeline steps by route: the next slice, after his go"

# ── ADDENDUM 2026-11-09 (0.60.470) — PC2 slice b built: frameworks as steps; requests recursive (his) ─────────────────────────────────────────
# James, 2026-11-09: "you did the .frameworks right? .macros? .pipeline? like for steps? its meant to be recursive and meta."
# Checked first, said to him: .macro, .pipeline, .procedure and workflows were steps already; .framework was not (PC2 slice b open); a pipeline step
# started a child run, but the child's request did not know its parent and the parent step did not name its child.
built_2026_11_09_pc2b:
  PC2_procedures_and_frameworks_as_steps:
    status: "slice b BUILT 0.60.470 — eg framework 4/4; test-cos-pipeline 12/12 (CP-11)"
    built: >-
      Meta: a .framework that declares its steps (a ```json framework-steps block beside its prose, never replacing it) compiles to a .pipeline
      (cos/pipeline/framework.eg): each step a task with takes, gives, a node gate of its type, a condition, what it waits on, and — when it names no
      run — an agent step (agentKey, await) asked to do its section with what it takes. That pipeline runs as a step of any other. A framework that
      only describes is refused, named (409): "it only describes: it declares no steps". GET /api/cos/frameworks, POST /api/cos/frameworks/:file/
      pipeline; rows cos frameworks, cos framework-compile.
      Recursive: a step that runs a pipeline passes itself as the child's parent (the engine's __parent, meta.parent); the child request names its
      parent request and step, the step names its children, at any depth.
      His framework: docs/innovation-toolkit.framework gains a DRAFT executable block (the coder's, from Sections 2–10's own words; Section 0 is the
      gate before it, Section 1 the loop around it (PC7), Section 11 somatic and his); "agent": "claude" is the coder's draft too. It compiles to a
      9-step DAG ending in hostile verification. Which Sections are steps, what each gives and who does them: his to correct.
    files: [cos/pipeline/framework.eg (new), cos/pipeline/test/framework.test.eg (new), cos/pipeline/cli.eg, cos/pipeline/index.js, cos/pipeline/runs.eg, cos/pipeline/registry.json (config), cos/manager/server.js, cos/manager/contract.json (config), lib/automation/engine.js, lib/automation/pipeline.js, idearium/cli/route-commands.js, docs/innovation-toolkit.framework, tests/modules/test-cos-pipeline.test.js]

# ── ADDENDUM 2026-11-09 (0.60.471) — PC2 expanded: a framework as a step, recursive; schemas for executable processes (his) ───────────────────────
# James, 2026-11-09: "Frameworks as steps. Or a framework as a step. Recursive. Fully programmable. Executable processes. Schemas for them."
expanded_2026_11_09_recursive:
  PC2_procedures_and_frameworks_as_steps:
    built: "schema.process, schema.process_step; the engine's framework step (frameworkFn); compile_tree (children first, loops refused named); execution defaults; the default node gate only where an agent does the step"
    files: [lib/node-schemas/schema.process (new), lib/node-schemas/schema.process_step (new), lib/node-schemas/schema.framework, lib/node-export.js, lib/automation/steps.js, lib/automation/engine.js, cos/manager/automation-door.js, cos/manager/server.js, cos/pipeline/framework.eg, cos/pipeline/cli.eg, cos/pipeline/index.js, cos/pipeline/registry.json (config), cos/pipeline/test/framework.test.eg, tests/modules/test-cos-pipeline.test.js]
    proof: "eg framework 7/7; test-cos-pipeline 13/13 (CP-12: pipeline → outer → mid → inner, each request linked; a loop of frameworks refused when compiled and when run)"

# ── ADDENDUM 2026-11-09 (0.60.474) — one contract, RAID's; every thing Nexus does, one step and gate at a time (his) ───────────────────────────────
# James, 2026-11-09: "All of it. Not just this systems. Litterally from input to an end state. Frameworks for copilot step by step. Coding one
# chunking at a time, one primitive at a time. This is meant to completely reduce the amount of code drastically. Look at idearium" · then, read
# with two readings side by side ((a) one contract, RAID's executable .contract v2 by Cortex's route, the pipeline as orchestrator — the coder's
# recommendation; (b) one contract, COS's): "Yes. This makes nexus programmable. Every point of failure can be mapped. Bottle neck made explicit.
# Every. Thing nexus does, end state first, step by step, each gate checks, if it fails becomes a gap to fix to get the pipeline moving again.
# Basically copilot is meant to take an input. This is all written down. Nexus builds from what I ask. Litterally anything nexus does could be run
# in the pipeline. One step and gate at a time." Read as (a), said to him.
    # ── EXPANDED 2026-11-10 — James, 2026-11-10: "i also want my framework to be able to be read and used in pipeline."
    # Adds: his Innovation Toolkit (docs/innovation-toolkit.framework) readable as a framework step, its sections as procedures, the way PC2 runs
    # a .framework today. Which sections become steps is his to say (to confirm).
decisions_2026_11_09:
  PC_D11_one_contract_raids:
    status: "DECIDED 2026-11-09 by James (his yes; read as (a), the coder's recommendation, said)"
    chosen: "a request's contract is RAID's executable .contract v2 (cortex/core/raid/contract-gates.js), booked with Cortex by route; COS's pipeline orchestrates and keeps the request's files; the contract.contract written that morning is gone"
    axioms: ["§5.15 each system reached by its routes", "§9.1 / §5.2 RAID the one write authority for contracts", "§8.6 reuse before build: RAID's packet, split, budget, staleness already exist", "his 2026-11-09 'Cortex is the book keeper'"]
built_2026_11_09_raid:
  - "cortex/core/raid/contract-v2-door.js (new) and cortex/boot.js: POST /api/raid/contracts/v2, GET /:id, POST /:id/evidence (moves the contract as far as its evidence; a gate is checked only once its evidence is recorded), POST /:id/gates/:gate/check | split, GET /:id/gates/:gate/packet. Files in Cortex's own data folder (cortex/data/contracts/v2/, not committed: .gitignore)."
  - "cos/pipeline: each request's contract drafted in Emerge (runs.eg contract_of: one task gate per step, passing on step:<id>) and booked by the door; a step met is its evidence; met is RAID's answer, COS's own steps when Cortex is not reached (said: verdict.by), the booking's answer in run.run contract.booked / why."
  - "Proof: test-raid-contract-door 3/3; test-cos-pipeline 15/15 (CP-14: booked per request, evidence per step, RAID's verdict; Cortex down breaks nothing, said); eg runs 6/6; test-contract-gates 20/20 unchanged."
next_in_order:
  - "a step's agent is handed RAID's packet for its gate (the smallest context); a gate too big for its agent is split by RAID (split, budget): one chunk, one primitive at a time — reuse first (a verified primitive: crystal, Pillar)"
  - "the input-to-end-state framework for copilot: input → intent → context.find → the contract drafted → split → each gate's writer (the free web agents through Guardian) → eg check / eg test gates → evidence → RAID's status → the loop (PC7) until the end state holds; a failure becomes a gap (PC3)"

# ── ADDENDUM 2026-11-09 (0.60.475) — PC7 slice a: a request planned into its own .pipeline, end state first; the pipeline building Nexus (his) ──────
# James, 2026-11-09: "Like we need this pipeline able to build nexus." · "It's end state first reasoning. My framework at every level" · "Okay just
# needs to use the pipeline automation engine we built. Using a .pipeline. They build upon request, dynamically".
built_2026_11_09_plan:
  PC7_iterate_to_the_end_state:
    status: "slice a BUILT 0.60.475 — test-cos-pipeline 16/16 (CP-15). Open: the loop over build-next until nothing is ready; counting it (SL6); the live run on his machine"
    built: >-
      Idearium serves one Nexus phase whole (GET /api/phases/one?key=<map>::<id>: does, files, depends_on, proof, its block; row phases one).
      cos/pipeline/plan.eg (Emerge) plans the phase into its own .pipeline, end state first: its proof is the pipeline's endState, which is the
      RAID contract's outcome, booked before any step runs; then context (Idearium's context finder: a .context), his framework when asked (a
      framework step), the DAG, the build (one step per planned file with chunks: one chunk at a time), closed on evidence, the ledger — each an
      Idearium route with a gate. COS: POST /api/cos/pipeline/plan (plan, and run with run) and POST /api/cos/pipeline/build-next (the next phase
      Nexus can build, planned and run); rows cos plan, cos build-next (running is his; an agent proposes). The engine keeps a pipeline's endState.
    files: [cos/pipeline/plan.eg (new), cos/pipeline/cli.eg, cos/pipeline/index.js, cos/pipeline/runs.eg, cos/manager/server.js, cos/manager/contract.json (config), idearium/api/index.js, idearium/cli/route-commands.js, lib/automation/pipeline.js, tests/modules/test-cos-pipeline.test.js]

# ── ADDENDUM 2026-11-10 (0.60.478) — PC4 slice a: the way back — a pipeline drawn on the canvas becomes a .pipeline ──
# James, 2026-11-10: "Also needs to be able to create pipelines. That's what the canvas is for." · "I want to program it myself using the pipeline
# instead of needing you." The canvas could open a pipeline (box.eg to_erv) but nothing came back. Built: box.eg from_erv (Emerge): Step tools →
# tasks (one from a pipeline gives its task back; one drawn new is made from its kind and what it names: macro, pipeline, procedure, agent, system,
# build → a framework, tool → an engine step type or a step as JSON); a gate tool after a step is its gate (JSON, or text the output must contain);
# wires are dependencies; a tool that is not a step is left out, named; ERAVOS's re-saved labels ("Step") are no rename. COS: POST
# /api/cos/pipeline/from-erv, row cos pipeline-from-erv, the Automation tab's Import takes .erv; the node file is written first and imported (a
# name used again updates the same pipeline). Proof: eg box 14/14; test-cos-pipeline CP-17 (drawn → imported → in the engine, gated, wired;
# updated; 422 names what is missing; an agent's 403). Still PC4 (OPEN, preview first): the Step tool's face for choosing kind and what it names,
# saving straight to COS from ERAVOS, and each box's live state while it runs.

# ── ADDENDUM 2026-11-10 (0.60.479) — the stuck build pipeline; RAID writes the first step; heartbeats, not polling (his) ─────────────────────────
# James, 2026-11-10 (his screenshot): "it is stuck. The phase is mapped … GET http://127.0.0.1:4800/api/repos//phases/map → HTTP 404" · "need to get
# the pipeline building nexus. also where are the pipeline files? needs to be a way to create the pipelines. its meant to be a visual way to run it
# also. to see it running. i feel like raid should create the beginning step. raid can then use the agents to think for it? like above raid then
# raid the contract hub to route." · "cos ui needs to use the heartbeat system from each system for the resource managenent. not polling. that way
# polling doesn't need presence. cos can listen for them and add new ones. like in the genesis spec in idearim."
# Fixed (0.60.479): Idearium's build pipeline ran with no repo, so its addresses read "repos//phases". (1) Idearium reads "nexus" (or "self") as
# Nexus's own repo (its Nexus-self parent) in every /api/repos/:uuid route; the pipeline's repo is "nexus", and a planned phase defaults to it.
# (2) The engine refuses to start a pipeline while a value a step's address needs is empty, naming it (needs); the Automation tab's Run asks for
# it and runs. Proof: test-cos-pipeline CP-18.
# Direction recorded, not built: (a) RAID writes the beginning step — a request reaches RAID, RAID's agents think it into the contract and the
# first step (end state first), and RAID as the contract hub routes it (AE_D8); (b) COS listens for each system's heartbeat (genesis Domain 10:
# <system>.heartbeat, a pulse with a health snapshot) for resources and presence, and adds a system that starts beating — no polling. As built,
# COS's UI polls /api/cos/systems and /api/cos/usage every 5 s (cos/ui/shell/page.js, overview); lib/heartbeat.js polls /health; few systems
# emit a heartbeat. Both are phases to write (map first), then the pipeline can build them.
    # ── EXPANDED 2026-11-10 — James, 2026-11-10: "i've been trying to get the pipeline to build nexus now. like how idearium is meant to build in the pipeline,
    # should be added mostly. just map this." · "each contract when fullfilled could become a replayable macro to rebuild or reconstruct."
    # Adds: Idearium's build runs as pipeline steps end to end (0.60.475 planned each phase into its own .pipeline; this makes the building itself
    # the pipeline's, not Idearium's loop beside it); a contract met becomes a .macro of its steps, replayable to rebuild or reconstruct what it
    # built (the snapshots of "every step snapshotted, any run replayed", cos/spec/pipeline-canvas.spec).
  PC8_operate_a_pipeline:
    expanded_2026_11_17_stuck: >-
      James, 2026-11-17: "like ollama needs to use the contract as a map. like each step can  be broken down into smaller steps, like the bricks in
      idearium. each word, building from the last in emerge. like ollama needs to figure it out when it gets stuck, not just get stuck". After
      "when a step is ambiguous or uncertain, run my framework on it" was named as not wired. The stuck ladder, one gate strategy, in order;
      each rung is something Nexus already has, wired into the gate (decided by his words and §8.6):
        1. the contract is the map: the agent is handed its DAG node, its pass_when and what the steps before it gave, never the whole task;
        2. retry with the gate's own words (RQ3's repair: the check's message back to the agent; routing.retries_per_rung);
        3. decompose: a step that fails becomes smaller steps under it, as Idearium's bricks and chunker do (spec-compiler/chunk, chunk-dispatch);
           in Emerge, word by word, each word building on the last (CIE-EG), each checked as it lands;
        4. ambiguity or uncertainty: run his framework on the step (a .framework step, PC2; docs/innovation-toolkit.framework; IP11's one
           primitive for risk, ambiguity and uncertainty) and take its answer as the step's new context;
        5. diagnose: the diagnostic and the intelligence system read the failure (its report in the system's failures/, FMR2) and name the cause;
        6. escalate: the next rung of routing.escalation (a bigger model, then an agent), by RAID;
        7. ask him: only what Nexus could not find or build (RQ8), as a question in the run, the run held, never dropped.
      Every rung is a line in the run's ledger (PC8 slice c), so Nexus learns which rung unsticks which kind of step (the learned order, RAID).
      Not "stuck": a step ends passed, decomposed, answered, escalated or asked.
    expanded_2026_11_21_the_run_console: >-
      James, 2026-11-21: "ideariums work surface, where it shows the code being generated live. i would love a console for that or something in the
      pipeline. like a console for the pipeline, and the ui have all the side tabs idearium does, plus anything else additive?" Slice d, "seeing":
      a run console in COS's pipeline screen. Reuse found (the coder's census, 2026-11-21): the live text is already kept on each Ollama job while it
      runs (ollama/lib/dispatch.js job.partial, LS1 0.39.356; GET /api/jobs, GET /api/jobs/:id), with its model, meta.source and timing; Idearium's
      work surface (idearium/ui/js/work-surface.js, GET /api/repos/:uuid/worksurface) shows the files changed; COS's console (SC11,
      cos/ui/console) already merges every system's lines. The run console joins them per run: each model call a block (step, gap, model,
      rung) streaming as it is written, the code fenced, then its test and gate result. The side rail carries Idearium's repo tabs (Home, Idea,
      Spec, Phases, Code, Architect, Debug, Finish, Git, Intelligence, Notes, Versionium, Settings) as COS tabs, each moved by its own phase
      through the drawbridge (DB1–DB7), never stripped; additive tabs the coder proposes, for him to choose: Gaps (the contract's .gap files),
      the ladder (which rung each gap climbed), the tape (replay a call), the flight record, the ledger. Preview first (his rule), on live data:
      cos/ui/run-console-preview/. The coder's reading, to confirm with him.
    expanded_2026_11_24_the_console_is_the_automation_tab: >-
      James, 2026-11-24: "the console preview is supposed to replace the lab tab" · then "cos/ui/run-console-preview should be the automation
      tba". Read as: the run console preview (cos/ui/run-console-preview, shaped with him 2026-11-21 to 2026-11-24) becomes COS's Automation tab,
      in place of cos/ui/automation; the Lab (cos/ui/lab, EMB4, read-only lists of requests, builds and pieces) is to be replaced by it (the
      console's Build tab shows the same, live). DECIDED (his, 2026-11-24): "the lab be migrated into the new automation tab. like i want to use the pipeline for almost anythiogn":
      the Lab's views (requests, builds, pieces) move into the Automation tab as its own tabs, then the Lab tab is removed; the pipeline is the
      one surface for almost anything (with the one-surface map, docs/2026-11-21-one-surface-phasemap.spec).
      Never stripped (§8.6): what the Automation page does today moves into the console first, then the page is replaced. Census, the coder's,
      2026-11-24: the Automation page runs, pauses, continues and retries a run; saves and exports a pipeline; reads COS's events, policy,
      boxes, pipeline sync/ready/runs/from-erv/baseline and the desktop driver's state, log, arm and disarm. The preview has none of the run
      controls yet and reads its data through its own preview server (cos/ui/run-console-preview/server.js: the bridge's jobs, COS's runs,
      systems, usage, console, CLI, catalogue, Idearium's lineage and phases, components, frameworks, templates, baseline), which becomes a COS
      route door (each answer from its owner's route, §5.16; the Ollama /api/ps read becomes the model server's), so the page asks COS only.
      Order: the door; the run controls and the rest of the census in the console; the console served as cos/ui/automation; the Lab's tab per
      his answer. Tested in Clear Glass (his rule), said where its driver cannot open a window on this PC.
    status: OPEN   # slice a BUILT 0.60.481 (a delta and a baseline per step; RAID's decisions as steps; the bar); slice b BUILT 0.60.484 (pause, continue, retry from a step)
    james: '"seeing, changing, managing, diagnosing, exporting, testing, agnostic." · "record each step in raids decision, dynamically building each step, as it goes. it all needs to be visable."'
    depends_on: [PC_D13_the_pipeline_works_first_then_cos_optimised, PC5_programmable_gate_types]
    files: [lib/automation/pipeline.js, lib/automation/routes.js, lib/automation/engine.js, cos/manager/automation-door.js, cos/pipeline/runs.eg, cos/pipeline/cli.eg, cos/ui/automation/engine.js, cos/ui/automation/page.js, idearium/cli/route-commands.js, cos/pipeline/index.js, cos/manager/server.js, tests/modules/test-cos-pipeline.test.js, idearium/api/index.js, idearium/pipelines/idearium-build.pipeline, lib/nexus-client.js, lib/repo-agent.js, guardian/lib/ncp-handler.js, guardian/server.js, tests/modules/test-ncp-handler-sr3.js, tests/modules/test-pipelines.test.js, cos/automation/pipeline.js, cos/automation/engine.js, cos/automation/routes.js, guardian/lib/jobs.js, cos/pipeline/runs.eg, cos/pipeline/cli.eg, cos/pipeline/test/runs.test.eg]
    requires: [node]
    prerequisites: ["the census of 2026-11-10 (below)"]
    census_2026_11_10: >-
      The engine (lib/automation/routes.js) already: lists, creates, validates, gets, updates, archives, runs, starts and cancels pipelines and
      workflows; keeps runs and their history; runs one step; imports; saves .pipeline node files. COS's Emerge module (cos/pipeline/*.eg)
      gives the box shape, gates, runs kept as files, planning, and frameworks as steps. Missing: pause, resume and retry of a step; a test
      (dry) run; a diagnosis per failed step; the run's live state on the boxes (PC4's next slice); a delta per step (PC6); RAID's decisions shown
      as steps of the run (each request is booked with RAID gate by gate since 0.60.474, but the decisions are not steps); a met contract
      replayed as a node (PC7).
    expanded_2026_11_14: >-
      James, 2026-11-14 (asked whether the pipeline builder comes first, since the pipeline could do the rest): "need the pipeline builder first? the pipeline could do all of this in theory" · then: "each step can be dynamically decomposed into smaller steps."
      A step decomposes, while the run is live, into smaller steps: a sub-pipeline under it, recursive (its framework: bricks, chunks, gaps).
      When: a gate fails in a way a smaller step would pass; the work does not fit the model that would run it (PC17); or RAID's contract
      names more than one outcome. RAID decides and records the decomposition as its decision (his "record each step in raids decision,
      dynamically building each step, as it goes"); each new step is shown on the canvas under its parent and opens like any step. It stops
      at a step one model can do and one gate can check, or names a gap. Prediction registered before any run (FRAMEWORK-THREADS): multi-file
      moves pass on local Ollama once decomposed to one file per step, with a reasoning agent only for the plan.
    expanded_2026_11_14_b: >-
      James, 2026-11-14: "intelligence system to help with complex tasks, agent tools also, gates hold persistence and decomposing reduces load. look at ideariums chunking. thats what i mean about idearium. i feel a lot of idearium is misplaced"
      The decomposition is not new code: Idearium already has it. idearium/spec-engine/spec-compiler/chunk/index.js builds a CHUNK, the least a
      small model needs to do one node (subject, signature, constraints, deps, events, errors, gates, gaps, the contract it is tested against,
      what Cortex already knows, a token budget), in tiers (0 and 1 deterministic, 2 for a small model, 3 for a better one); chunk-dispatch.js
      runs each chunk with a retry ladder and a check of the answer (lib/seam/queue.js QueueCompartment). PC8's dynamic decomposition reuses
      both: a step too big for its model becomes chunks, each a step. Around it: Intelligence helps where a task is complex (it plans and finds
      the pattern, PC6); agents use their tools (the agent tools, through RAID); each gate holds persistence (what passed is kept at the gate,
      so a run resumes from its last passed gate and nothing passed is redone); decomposing reduces load (each step fits its model, PC17).
      Where the chunker and dispatcher live is SW8's question (Idearium's census).
    expanded_2026_11_14_c: >-
      James, 2026-11-14, after each step became a node file (0.60.538): "then we can track each file moving through the backend. tagging each step,
      and gate". Each step node and each gate's verdict carries tags: the run, the pipeline, the step, the gate's outcome, and every file the step
      read or wrote (file:<path>, taken from what the step gives: its output's files, a build's changed list, Versionium's record of the change).
      A file's trail is then a query over the step nodes on disk: which runs and steps touched it, in order, through which gates, with what
      outcome. Slice a: the tags written; GET /api/cos/automation/trail?file=<path> and `cos file-trail <path>`; then the canvas shows a file's
      trail from OUTPUTS. Reading to confirm: "moving through the backend" read as across every system the step calls (each through RAID), not
      only COS's engine.
    expanded_2026_11_17: >-
      James, 2026-11-17: "The pipeline needs a ledger also. Each step, job and response that came back. The ui is for me. Backend first always,
      commands and api routes." Slice c, the pipeline ledger. Grounded the same day: each step is already a .process_step node with its own
      event ledger (0.60.538), but an agent step keeps only the reply's text: cos/manager/automation-door.js _dispatchAgent gets Guardian's jobId
      back from POST /command and askAgentFn drops it (it returns { text, decision }); the fire-and-forget enqueueFn drops it too. Nothing joins a
      step to the Guardian .job it made or the .response that came back.
      Backend (COS's, cos/automation/, the engine COS runs; lib/automation/ is its older copy, not touched):
        - the run's ledger, one append-only file per run beside its step nodes (runs/<run>/run.ledger, one JSON line per event, written as it
          happens, never only in memory — his 2026-11-14 rule): step (each state change, from the steps' own event ledgers), job (an agent step
          dispatched: jobId, provider, RAID's decision), response (it came back: jobId, chars, contentHash, the .response node's reference, how
          long it took), and the run's start and end. Two lines in one order, never rewritten.
        - the step node names its jobs (jobs: [jobId]); the answer's text is NOT copied into the ledger: the .response node is the one source of
          truth (GD_D3), the ledger names it.
        - Guardian's job names where it came from: POST /command takes origin { system: 'cos', run, step }, kept on the .job (guardian/lib/jobs.js),
          so the reference is both ways. Ids only: COS and Guardian stay decoupled (§5.9, §5.10), each reading the other by route.
        - a job sent and never answered is a ledger line too (unanswered, with Guardian's queue state read by route), never a silent gap (§1.2).
      API route (COS's manager): GET /api/cos/automation/pipeline-ledger?run=<id> | ?pipelineId=<id>&limit=n, each line with, for a job, its
      state from Guardian's GET /jobs/ledger (by route, Guardian down said).
      Command row: cos pipeline-ledger <run id | --pipeline <id>> (idearium/cli/route-commands.js), so every agent has it.
      UI last, his: the Automation tab, each step with its job and the response that came back, opening the .response.
      Axioms: §2.1/§2.2 persistence, §2.3 state observable, §3.4 raw → library → API → CLI → UI (his order), §5.9/§5.10 decoupled by route and
      ids, §9.2 ledger before dispatch (the job line is written before the dispatch returns), §10.2 the ledger names the .response, never copies
      it, §1.2. Relation: GD5a (docs/2026-10-24-guardian-into-cos-phasemap.spec) is where the .response is written; this slice only reads it
      and does not wait on GD5a (GET /response/:jobId already answers).
    proof_slice_c: "a run with an agent step leaves runs/<run>/run.ledger with its step, job and response lines in order; the step node names the jobId and Guardian's .job names the run and step; GET /api/cos/automation/pipeline-ledger and `cos pipeline-ledger` print the same lines; a job with Guardian stopped is a line marked unanswered; COS restarted mid-run, the ledger continues in the same file; tested in tests/modules (sandboxed), UI in Clear Glass, never Playwright"
    corrected_2026_11_17: >-
      James, 2026-11-17: "Sit besides. Maybe bundle in the compartment? Look at the pipeline in cos." · asked which compartment bundles them, his choice: "Guardian's, referenced".
      Slice c as first written (above, kept §0.3) put the ledger in the Automation engine's runs folder, in JavaScript. COS's pipeline already
      keeps the bundle for this: one folder per request (cos/pipeline/runs.eg: run.run, dag.dag, steps/<t>.step, nodes/<t>/out.<type>, gates/),
      the engine's run attached to it and its events written in order. Decided by the axioms (§8.6 reuse, §17.13 Emerge for new code):
        - the ledger is <request>/run.ledger, appended by runs.eg's on_event (Emerge), beside run.run and dag.dag; it moves to done/ with the
          request and is kept (§0.3). The Automation engine's .process_step nodes are unchanged.
        - the step file (steps/<t>.step) names its jobs: jobId, provider, RAID's decision, and Guardian's reference to the job's folder.
        - his choice: the .job and its .response sit side by side in GUARDIAN's compartment (one folder per job, GD5a); COS's bundle holds
          the reference, never a copy, and reads the content by Guardian's route (GET /response/:jobId, GET /jobs/ledger). One source of truth.
        - the only JavaScript touched is the doors: cos/manager/automation-door.js stops dropping Guardian's jobId and passes it on with the
          answer; cos/automation/engine.js carries it on the agent step's result; cos/pipeline/index.js hands it to runs.eg. Guardian's
          POST /command keeps origin { system: 'cos', request, step } on the .job.
      Route: GET /api/cos/pipeline/ledger?request=<id> (cos/manager/server.js, beside the request routes). Command: cos request-ledger
      <request id> (beside cos request-show). UI last, his.
    proof_slice_c_corrected: "a request with an agent step leaves <request>/run.ledger (step, job, response lines, in order) written by runs.eg; its step file names the jobId and Guardian's job folder; GET /api/cos/pipeline/ledger and `cos request-ledger` print the same lines; the request moved to done/ keeps its ledger; tests in cos/pipeline/test/runs.test.eg and tests/modules (sandboxed)"
    corrected_2026_11_17_b: >-
      James, 2026-11-17: "All systems keep their own data. look at Claude.md" (docs/CLAUDE.md, his 2026-11-09: "Data is stored in the relevant systems data folder. Cortex is the book keeper.")
      Where each piece lives, by his rule: the request bundle and its run.ledger are COS's, in COS's own data folder (cos/data/manager/pipeline/
      runs/, as runs.eg already writes); the .job and .response are Guardian's, in guardian/data/jobs/<id>/ (not a COS compartment: the word
      "compartment" above was the coder's and is withdrawn). The ledger names Guardian's job by id; neither system writes the other's folder.
      Cortex keeps the books: the request is already booked with Cortex as RAID's contract (runs.eg booked); whether each ledger line is also
      booked with Cortex is to confirm.
    decided_2026_11_17_d: >-
      James, 2026-11-17, asked whether each ledger line (step, job, response) is also booked with Cortex: "yes. we need to have this logged somewhere. look at the changelogs in versionium."
      Every run.ledger line is also booked with Cortex by its route after it is written in cos/data/manager (Cortex down: kept in COS's outbox,
      booked on replay, said). Released as 0.60.548.
    does: >-
      A pipeline is operable from COS, the way a person and an agent would want it: run, pause, resume and retry a step; test it dry, the steps
      planned and their gates checked with nothing changed; see each step's state live; diagnose a failed step (its gate, its input, its output,
      its error, and the step before it); export a run as files; and every RAID decision taken during a run added to the run as a step, as it
      happens. Backend, then route, then command row, then UI (the Automation tab), in the same phase.
    proof: "a pipeline paused mid-run, resumed and finished; a failed step retried after a fix; a dry run that changes nothing; a failed step diagnosed in one view; a run exported and re-imported; a run whose RAID decisions appear as steps; each shown in the Automation tab through Clear Glass"
    # ── 2026-11-10, slice a BUILT 0.60.481 — his "do it. build it." ──
    # - Each step's delta: the engine (lib/automation/pipeline.js) keeps a step's startedAt, finishedAt and waitMs (the delta after the steps it
    #   waits on), beside its ms.
    # - The baseline in Emerge: cos/pipeline/baseline.eg gives a step's mean, its sigma from three runs (his "Three = an invariant"), its latest
    #   delta and its z, and the wait's own baseline. It is served at GET /api/cos/pipeline/baseline (the manager's contract), with the command
    #   row `cos pipeline-baseline`.
    # - RAID's decisions as steps: _dispatchAgent hands RAID's choice back with the answer (asked, chose, command, why, at; RAID down said). The
    #   agent step and runStep pass it on; the run keeps it as run.decisions and on its task, and streams automation.pipeline.decision as it
    #   happens.
    # - The Automation tab: each step has a bar against its baseline, the baseline and wait in words, "slower/faster than usual" past 2 sigma, and
    #   RAID's decisions under the step they were taken in.
    # - Two execFile calls in cos/pipeline/index.js got windowsHide (SC16).
    # Next slices: pause, resume and retry; the dry run; the diagnosis view; export of a run.
    slice_a_built: "0.60.481"
  PC9_the_desktop_driver:
    status: OPEN   # slice a BUILT 0.60.483 (the driver, its routes and command, the Desktop tab); the Windows backend proved on his PC next
    james: '"I’m saying for you. Like look at clearglass. Nexus nerve, cleardriver injecting coordinates into the dom."'
    depends_on: [PC_D14_a_desktop_driver_for_agents]
    files: [cos/remote-desktop/desktop-driver.js, cos/remote-desktop/input-injector.js, cos/manager/server.js, cos/manager/contract.json, idearium/cli/route-commands.js, cos/ui/automation/engine.js, tests/modules/test-cos-desktop-driver.test.js]
    requires: [node, "Windows: PowerShell (always there); Linux: xdotool and ImageMagick's import, when present"]
    prerequisites: ["his arm in COS, each time, for a set time"]
    reuse: >-
      cos/remote-desktop/input-injector.js (one interface, a rate limiter, a view-only lock; its native backend was an optional nut-js, never
      installed) and ClearDriver's verbs (clear-glass/src/driver/index.js: screenshot, click at x,y, type, pressKey, scroll).
    does: >-
      COS drives the desktop the way ClearDriver drives a page: screen (a PNG of the whole screen and its size), move, click at x,y, type, key,
      scroll. Backends: on Windows, PowerShell with user32 and System.Drawing, nothing to install, started hidden; on Linux, xdotool and import
      when present; otherwise it refuses, naming what is missing. It is off until he arms it in COS for a set time (view-only allows the screen
      only). One kill switch. Every act is logged (who, what, where, why) and streamed. Served on localhost only: POST /api/cos/desktop/<verb>,
      and `cos desktop <verb>` for the coder (through his Remote Control link) and for agents. Backend, then route, then command, then UI.
    proof: "a stand-in backend: every verb refused unarmed, the screen alone under view-only, every verb under armed, the arm expiring by itself, the kill switch; every act in the log; the commands; the Arm control in COS through Clear Glass. The real PowerShell backend is proved on his PC, through his link."

  PC10_our_own_remote_control:
    status: OPEN   # mapped and specced 2026-11-11; built after the pipeline works and COS is optimised (his PC_D13: "Can't get distracted")
    james: '"Can you spec our own remote-control. From nexus nerve, interaction field, cleardriver and injecting code into the dom to see it. Like look at clearglass" · "Just map it. Maybe spec it. Then back to the high leverage."'
    spec: cos/spec/remote-control.spec
    depends_on: [PC9_the_desktop_driver]
    files: [cos/remote-desktop/desktop-field.js, cos/remote-desktop/overlay.ps1, cos/remote-desktop/remote-control.js, lib/nerve/index.js, cos/manager/server.js, cos/manager/contract.json, idearium/cli/route-commands.js, cos/ui/automation/engine.js, tests/modules/test-cos-remote-control.test.js]
    reuse: >-
      clear-glass/src/page/field.js (the field: numbered targets with x, y, z; at; spotlight; describe), ClearDriver's pointer, page/state-diff.js,
      Nerve (lib/nerve), cos/remote-desktop's WebRTC host and viewer, PC9's driver and its arming.
    does: >-
      Nexus's own remote control. See: the desktop as an interaction field (Windows UI Automation read through PowerShell, the desktop's DOM),
      the same target shape as a Clear Glass page. Show: badges, grid and a spotlight drawn over the screen in a click-through window, as Clear
      Glass injects them into a page. Act: by number, routed to Clear Glass (a page) or PC9's driver (the desktop), then verified by reading
      again; a click that changed nothing is said. Nerve: his focus and what changed, streamed, so an agent reads less. Watch: the Desktop tab
      and his phone through the remote-desktop viewer, with Disarm. Slices: (a) the desktop field and describe; (b) act by number with verify;
      (c) the overlay; (d) Nerve's focus; (e) the viewer.
    proof: "a stand-in UI Automation tree gives page/field.js's shape; unarmed refused; a stale number refused; a no-op click said; the tab through Clear Glass; the Windows path on his PC."
    decided: 'RC_R1, his, 2026-11-11: "Yes. Stand in until we build a full application from looking glass. To replace electron." The UI Automation tree and the overlay window are a stand-in until a Looking Glass application (clear-glass/spec/sources/glass-engine-working-spec-v0.1-draft.md) replaces Electron.'

  PC11_nothing_sent_teaches_nothing:
    status: OPEN
    depends_on: []
    james: '"yes. then the highest leverage. ollama can can now run the pipeline" (2026-11-13) · found 2026-11-11 (0.60.493): "an attempt where nothing was sent should not count against the agent. Its own phase, to map."'
    files: [lib/pipeline-routing.js, tests/modules/test-pipeline-routing.test.js, tests/modules/test-contract-adapters.test.js]
    does: >-
      A build attempt that never reached its agent (nothing was sent, the tab signed out, the provider down, Copilot's door unreachable)
      is a transient failure: it does not put the agent on the brick's skip list (.exclude), does not lower the agent in the door's
      learned order, and does not teach a size lesson. Today lib/pipeline-routing.js classify() does not know "nothing was sent",
      "no-answer", "provider-down" (with its hyphen) or Copilot's door unreachable as the agent being away: they read "unknown", which contract-gates.js classifyFailure turns
      into capability, so one night with the browser agents asleep left a contract saying "failed it before, skipped: gemini, chatgpt,
      claude" and every later build of that phase gave up in about 35 s (run phrun-mwbvr9la, 2026-11-11). An agent that answered and
      fell short (any other error text) stays capability, as GT-02 holds.
    proof: "PR-05b: each of those texts classifies as provider-down, not unknown (a signed-out tab is left as it is: login never falls through, his rule); GT-01b: an attempt failing 'nothing was sent to gemini' is retried, nothing excluded, nothing learned; GT-02 unchanged"
    axioms: "§1.2 (a failure is said as what it is), do not guess (a guess filed as capability taught the route a falsehood), §8.6 (the transient class and its rules exist; the classifier learns four phrases)"

  PC12_every_pipeline_in_cos:
    status: OPEN
    depends_on: [PC8_operate_a_pipeline]
    james: '"both. each step of any pipeline. thats the point. i want all pipelines managable, orchastratred, and programmable in cos. all of them." (2026-11-13) · "clearglass pipelines, raid pipelines, idearium, all of them in cos."'
    files: [cortex/core/raid/contract-v2-door.js, cos/pipeline/contract.eg, cos/pipeline/test/contract.test.eg, cos/pipeline/cli.eg, cos/pipeline/index.js, cos/pipeline/registry.json, tests/modules/test-cos-pipeline.test.js]
    does: >-
      Every sequence of steps Nexus runs is a pipeline in COS's Automation tab: each step seen with its state, run or re-run from COS, and
      changed there (through its owner's route: the owner keeps the truth, §5.15). The census (read 2026-11-13), and where each stands:
      in COS already — Idearium's pipelines (by route, 0.60.517), Clear Glass's pipelines, workflows and macros (by route; Fiverr's among
      them), COS's own (the framework trial, 0.60.521), procedures and frameworks as steps (PC2). Not in COS — RAID's contracts v2 (each a
      gated sequence of bricks, Cortex's), RAID's execution sequence (lib/execution-pipeline.js: isolate, verify, compare, commit), the build
      loop (lib/build-pipeline.js), chains (lib/chains.js), the intent flow (lib/intent-flow.js), the chunk build's agent switching
      (lib/chunk-build-orchestrator.js), a repo's replayable procedures (lib/repo-procedures.js), the phase build's ladder (Idearium).
      Slices, one owner at a time:
        a. RAID's contracts as pipelines: Cortex lists them (GET /api/raid/contracts/v2) and its view carries each gate's depends_on, kind and
           file; COS turns a contract into a .pipeline (cos/pipeline/contract.eg, Emerge), each gate a step that checks that gate on Cortex's
           route; the sync imports them. Running it in COS checks each gate in order; a failed gate's reasons are the step's.
        b. RAID's execution sequence as a pipeline: each stage served by its owner's route first (what exists read before), then one .pipeline.
        c. the rest of the census, each: a .pipeline its owner serves, or retired into one that exists (said which).
        d. programmable both ways: a pipeline changed in COS is written back through its owner's route and validated there; the owner refuses
           what breaks it, and COS shows why.
    proof: "per slice: the census shows it in COS; its steps run from COS and their states read back from the owner; for (a) a fixture contract's gates become steps in order, a passed gate's step is met, a failed one carries RAID's reasons"
    axioms: "§5.15 (the owner keeps the truth, COS reaches it by route), §8.6 (the sync, the box shape and RAID's check route are used), §1.2 (a step's failure is the owner's words), USER_AUTONOMY (his: all of them, step by step)"
  PC13_his_request_built_by_the_pipeline:
    status: OPEN
    depends_on: [PC8_operate_a_pipeline, PC11_nothing_sent_teaches_nothing]
    james: '"put a pin in the can be moved anywhere. need the pipeline building all of my requests." (2026-11-13) · "like the pipeline can build all of this if we get ollama working with emerge and the pipeline"'
    files: [idearium/pipelines/his-request.pipeline, docs/2026-11-13-his-requests-phasemap.spec, cos/manager/cli.js, tests/modules/test-cos-pipeline.test.js]
    does: >-
      One pipeline from his words to the work built, every step a route that exists: (1) the intent (Idearium's POST /api/repos/:uuid/intent,
      lib/intent-flow.js: the context needed, the DAG, what was found, the gaps); a gap holds the run and is asked of him, his answer goes
      in and the run goes on; (2) a phase written from his words into his requests' map (POST …/phases/add, docs/2026-11-13-his-requests-
      phasemap.spec, ids HR<n>), his words kept verbatim as its origin; (3) the phase built by Idearium's own build pipeline, run as a step
      (idearium-build: covered, mapped, DAG, graph, build on the Ollama ladder first, landed, evidence holding for his yes). Typed where he is:
      `request <his words>` in COS's console, or run from the Automation tab with vars.words.
      Said: mapping a phase's files from words is the build's own agent step (SL8, the first rung, Ollama), so what Ollama can write decides
      how far a request gets alone (EMB2's benchmarks measure it); a request it cannot finish holds with the step's own reason.
    proof: "a stand-in Idearium answering intent, add and the build pipeline's routes: words in, a phase HR1 written, the build pipeline run with phase HR1; a gap holds the run with the gap's words"
    axioms: "§8.6 (every step is a route that exists), his order (the pipeline builds his requests), USER_AUTONOMY (gaps and the final yes are his)"
    expanded_2026_11_24_nexus_builds_itself: >-
      His words (2026-11-24): "okay expand the pipeline to get nexus building itself" · "the pipeline is the end state" · "get the system
      repairing itself. less it needs you the better." · "why a watcher? why not events per gate with the ledger per pipeline? ... state
      detection emits a heartbeat pulse, using negative reasoning can detect its absence." Where it stands (measured 2026-11-24): COS pipeline
      "Build a phase (self-repairing)" builds one phase on the 3b alone, round by round from its gap files, 46 of 57 pieces of EMB3 passing; no
      module has passed end to end; his words do not yet reach it (steps 1 and 2 above are open). The slices, in order, each its own proof:
      SB1 the proof: EMB3 passes end to end on the 3b (EMB9: a passed piece is re-checked, never re-coded; what a piece is built from is read
        by Nexus from the code; a bigger model only at a wall, each wall a row). Proof: the module's test passes in scratch, then landed on his yes.
      SB2 events per gate into the pipeline's ledger, and a pulse: every gate emits asked / answered / passed / refused / broken-down / climbed
        into the run's ledger (one per pipeline); every running thing (an Ollama job, a build, a step) emits a heartbeat while it works; a
        missing pulse is the event (negative reasoning: what should be there and is not), and the pipeline repairs or holds on it. No poller,
        no watcher (PR6, heartbeat not polling). Depends on SB1's rows.
      SB3 the canvas grows gap by gap: each gate event of SB2 draws a box (a gap, a helper broken down, a climb, a branch for each choice,
        deviation, iteration, version) on the pipeline's canvas in COS's own UI, live; the console preview becomes that screen, its CLI
        Co-pilot's, its Run real. Depends on SB2.
      SB4 parallel 3bs: the pieces that do not depend on each other are asked at once (OLLAMA_MAX_CONCURRENT, 3 set by him 2026-11-24).
        Depends on SB1.
      SB5 Nexus before the model: before a piece is asked, Pillar and the node index are asked for one that exists (reuse, §8.6), and RAID
        gives the gate its context by id (RL_D10, context_by_id): the 3b's memory and reasoning held by Nexus. Depends on SB1.
      SB6 his words in: step 1 and 2 of this phase (intent, a phase HR<n> written from his words, his yes on its examples), then SB1's build;
        RAID drafts the DAG of a request (L2), each node a phase this pipeline builds. Depends on SB1, SB5.
      SB7 beyond Emerge files: a request that touches COS's UI (JS, CSS, HTML) is checked the same way (a test written first, each piece gated),
        or the UI moves to Emerge (his "no new JS unless it replaces JS"); his to choose. Depends on SB6.
      Found 2026-11-24 (for SB2): a running Ollama job cannot be stopped (the bridge's DELETE /api/jobs/:id takes only queued jobs); an
        orphaned build's 16b job held 11 GB of 16 and the next run's 3b job waited behind it. SB2's pulse needs a stop: a job whose run is gone
        is stopped, and its model freed.
      SB8 the walls, fixed by the pipeline: each wall (a climb, a held piece, a missing capability) becomes a request of SB6, so Nexus builds
        what stopped it. Depends on SB6. — PC9 slice a: the desktop driver for agents (his PC_D14) ──────────────────────────────────────────────
# James, 2026-11-11: "I’m saying for you. Like look at clearglass. Nexus nerve, cleardriver injecting coordinates into the dom."
# Built: cos/remote-desktop/desktop-driver.js (screen, move, click, type, key, scroll; backends: Windows PowerShell user32/System.Drawing,
# Linux xdotool/import, else refused, named). Off until he arms it (1–60 min; view-only = the screen only; only a person arms; Disarm the kill
# switch; expiry by itself). Every act logged (desktop/log.jsonl) and streamed (cos.desktop.act); typed text as its length only. Localhost
# only: /api/cos/desktop/<verb> (declared in cos/manager/contract.json), `cos desktop <verb>`, the Automation › Desktop tab (heard on the
# event stream, not polled). Proof: test-cos-desktop-driver 9/9 (stand-in backend; DD-09 in Clear Glass). Open: the Windows backend run on
# his PC through his Remote Control link. The coder's: a move bypasses the injector (it applies moves later, unconfirmed).

# ── ADDENDUM 2026-11-11 (0.60.484) — PC8 slice b: a run managed — pause, continue, retry ─────────────────────────────────────────────────
# James, 2026-11-10: "execute, or manage the pipeline. thats what its for." · 2026-11-11: "But yes the high leverage. Need that done"
# Built: Pause (the running step finishes, nothing new starts), Continue, Retry of a failed run from its request's files (met steps not run
# again; from a step, it and every step after it: cos/pipeline/runs.eg retry_of). Routes, events (automation.pipeline.paused|continued),
# commands (cos automation pause|continue, cos pipeline-retry), buttons. Fixed: a waited failed run answered "Invalid status code: failed".
# Proof: OA-12, CP-20, HB-08, runs.test.eg 7/7. Next slices: a dry run; the diagnosis view; export of a run.

# ── ADDENDUM 2026-11-12 (0.60.485) — PC8: the run form (his "the pipeline says no phase selected") ──────────────────────────────────────
# James, 2026-11-12: "it says phase not selected in the piplelube vital. its the next walll" · "i need you to release this time also"
# Found: the tab asked for what a run needs (Idearium's build pipeline: its phase) with a browser prompt, which COS's app window never shows.
# Fixed: asked in the page; a phase chosen from those that can be built now (GET /api/cos/pipeline/ready). Proof: HB-09, CP-20.

# ── ADDENDUM 2026-11-10 (0.60.489) — PC8: the run form had no phases because COS read a cut answer as an empty one ──
# James, 2026-11-10: "your supposed to be getting the pipeline working" · 2026-11-12: "it says phase not selected in the piplelube vital. its the next walll"
# Found on his running COS: GET /api/cos/pipeline/ready answered { ok: true, phases: [] } while Idearium's GET /api/phases/next answered a queue.
# Cause: cos/manager/server.js _systemCall kept 4,096 characters of any answer (right for a gate, wrong for a list); the queue is about 38,000;
# cos/pipeline/index.js ideariumRoute swallowed the parse failure and went on with {}. HB-09 and CP-20 passed because the stand-in's answer was
# 60 characters. Fixed: the caller says how much it takes (Idearium's routes: whole); a cut answer is marked; an answer that cannot be read is
# said (§1.2, §0.0). The stand-in in test-cos-pipeline now answers at real size, so the old code fails that test.
# Second cause, in Idearium (SL0, docs/2026-10-23-self-building-loop-phasemap.spec addendum of the same date): the census, 7 to 13 s per call.
# Proof: test-cos-pipeline 20/21 (CP-13 expects Clear Glass down; it was running). Live: the pipeline's five reading steps (ready, covered, map,
# dag, graph) each answered 200 through POST /api/cos/automation/step for IN0_baseline; ready in 876 ms after the fix (7,327 ms before).
# Not done: COS's manager not restarted (his), so the chooser on his screen is still empty until then; build, evidence and ledger steps not run.

# ── ADDENDUM 2026-11-11 (0.60.490) — PC8: the build pipeline run whole, four times; the wall is Idearium's heap in the build step ──
# James, 2026-11-10: "your supposed to be getting the pipeline working" · 2026-11-11, asked whether to run the whole build pipeline on IN0_baseline: "Yes, run it"
# Runs, through COS, phase IN0_baseline (docs/2026-10-19-infrastructure-spine-phasemap.spec), run ids c1162190, 259f2faa, 29c5bf85, 7f4d4ea9:
#   1. ready · covered · map · dag · graph met (10 s). build: HTTP 409 "nexus/core has no repo yet — sync the nexus repo first".
#      Cause: no system repo existed. The background sync has waited since boot: lib/prevention.js holds heavy work for 30% free memory after a
#      critical reading, and his machine (7.7 GB) sat at 10 to 12%. Core was synced alone (POST /api/nexus-self/sync { only: [core] }): 156 s,
#      5,365 files, Idearium's /health slowest 6.6 s (the yielding snapshot of 0.60.487 in use: 4.1 s of the 156), lowest free memory 10.5%.
#   2–4. the same five steps met; build: the connection dropped after 22 to 28 s. Idearium had ended, exit 134, "Reached heap limit", at the
#      512 MB of 0.60.482. Reproduced on a fresh process twice.
# Made visible (§2.3, §16.2): _heapNote in idearium/api/index.js says the heap at each stage of a build. Run 4: asked 195 MB · before the
# snapshot 210 · after the snapshot and the repair 402 · before the agent starts 407 · out of heap 4 s later (limit 512 old space).
# Not traced further: which reads inside the snapshot keep 190 MB, and what the agent's start loads (the repo's indexes are cards.json 31 MB,
# search.json 28 MB, glyphs 11, chunks 11, graph 10).
# His to decide (a cost on his machine): (a) a larger heap for Idearium (idearium/compartment.json maxOldSpaceMB, 512 since 0.60.482; 1,024
# before): quickest way to the next wall, up to 512 MB more on a machine at 11% free; (b) the build made to fit in 512 MB: its own phase,
# size unknown until the two stages are traced. The coder's recommendation: (a) now, to reach the next wall, then (b) mapped.
# Also found: the pipeline has no step that makes sure the owning system's repo is synced before build; a phase in any unsynced system stops
# at the same 409. Cost of this session, said: Idearium was ended by the heap limit three times and restarted by COS each time.

# ── ADDENDUM 2026-11-11 (0.60.491) — PC8: Idearium's heap back to 1,024 MB (his); the build step met; three walls after it ──
# James, 2026-11-11, told Idearium ran out of its 512 MB heap in the build step: "Yeah what is up with that. It wasn’t like that before. It was in idearium. Can’t you raise it"
# "It was in idearium" is read by the coder as: the build ran from Idearium before, and worked there. To confirm. The routes are the same
# ones; what changed is the heap: 0.60.482 set 512 MB from idle use, and a build in core peaks at 538 MB.
# Done: idearium/compartment.json maxOldSpaceMB 1024; COS's setting for Idearium 1,024 (from: his), read back. (docs/2026-10-24-cos-manager-
# phasemap.spec's 0.60.482 expansion is corrected by this: a limit is set from the heaviest thing a system does, not its idle, §17.11.)
# Run 5 (855786f3): six steps met, build included (20 s; heap 196 · 210 · 538 · 398 MB of 1,216). Lowest free memory 7.6%.
# Walls found, in order, not fixed:
#   1. evidence timed out (30 s). Idearium's POST /api/repos/:uuid/phases/evidence takes { map, limit, apply }, not the { phase } the step
#      sends: it runs the tests of up to 10 open phases, whichever they are.
#   2. the build step is met when the build has only started ("state":"building"); the pipeline goes on to evidence while it runs. Nothing
#      waits for the run to end.
#   3. the build itself ended contract-incomplete after 44 s: "gate b1.tree-census.js.1 is FAILED; gate b1.tree-census.js.2 is FAILED". Its
#      ladder said: no Ollama ("ollama bridge unreachable … ECONNREFUSED 127.0.0.1:3749": the bridge is on demand and was asleep), so the
#      chain's agents (gemini, chatgpt, claude, deepseek) through Clear Glass, which COS read as degraded. Why each gate failed: not traced.

# ── ADDENDUM 2026-11-11 (0.60.492) — PC8: a build wakes the systems it needs; handoff ──
# James, 2026-11-11: "Just get it working"
# Wall 3 of 0.60.491 traced: the build's coder call goes through Copilot (:3750) and its ladder asks the Ollama bridge (:3749); both on demand
# since 0.60.482, neither woken (lib/repo-agent.js raw HTTP; nexus-client touching 'ollama' where COS's name is 'ollama-bridge'). Fixed in
# lib/repo-agent.js (_post) and lib/nexus-client.js (_waker, wake). Not proved by a build.
# handoff_2026_11_11 (the session ended at his usage limit). Next, in order:
#   1. run the pipeline again (POST /api/cos/automation/pipelines/<id>/run, vars repo nexus, phase IN0_baseline) and read the build's row
#      (GET nexus://idearium/api/repos/nexus/phases/runs): does a coder answer now. Clear Glass read as degraded; the agents go through it.
#   2. the client's wake waits 6 s; COS holds a start 15 s under its 10% memory floor: lengthen the wait (lib/nexus-client.js call).
#   3. a step that waits for the build to end: designed, not written: a long-poll route in Idearium (the latest run of the phase, ended and
#      landed by lib/flight-data.js flight), under 5 min per request (fetch's header limit), a task with retries in idearium-build.pipeline.
#   4. evidence: Idearium's route takes the phase (filter in case 'repo.phases.evidence'), and says no when that phase did not close. It judges
#      files in the live tree, and a Nexus build lands in the system's repo first: the pipeline needs his approval step between.
#   5. COS's manager restarted (0.60.489's chooser); the other 16 system repos unsynced; a sync step before build.

# ── ADDENDUM 2026-11-11 (0.60.493) — PC8: the first build lands through the pipeline; the wait step; evidence for one phase ──
# James, 2026-11-11: "Just get it working" · "continue. get  it working"
# Runs after 0.60.492, each read from Idearium's own record (GET /api/repos/nexus/flight/<run>):
#   phrun-mwbvr9la, phrun-mwbvtg3v: 0 agent calls, contract-incomplete in about 35 s. Cause: the phase's contract file, kept from the first
#     failed run, carried "failed it before, skipped: gemini, chatgpt, claude" (cortex/core/raid/contract-adapters.js, the .exclude evidence)
#     though that failure was Copilot asleep. Archived beside itself, not deleted (§0.3). NOT fixed in code: an attempt where nothing was sent
#     ("no-answer … nothing was sent to") should not count against the agent. Its own phase, to map (RAID's contract engine, Cortex's).
#   phrun-mwbvx7hu: LANDED, 17 min. gemini provider-down · chatgpt "reply appears: no reply element found after 180s" (selector drift, Clear
#     Glass's) · claude wrote scripts/tree-census.js. Copilot had been stopped idle again and was not up within the wait: the Emerge rung fell
#     back to the JavaScript ladder.
# Built (JavaScript changed in place; no new file):
#   - Idearium: GET /api/repos/:uuid/phases/landed?phase=&waitMs= (held up to 270 s; ended and landed decided by lib/flight-data.js); command
#     row `repo landed <repo> <phase>` (agents and copilot through nexus.command).
#   - Idearium: POST …/phases/evidence { phase } judges that phase alone; 409 with the reason when it does not close.
#   - idearium/pipelines/idearium-build.pipeline: task `landed` (retries 5) between build and evidence; evidence applies for its phase.
#   - lib/nexus-client.js: a woken system is waited for 30 s (was 6).
# Proof, live: run 5047dbb3 of the nine-step pipeline: ready · covered · map · dag · graph · build · landed met in 54 s (the build resumed its
# kept contract, landed clean, 0 calls); evidence 409 "IN0_baseline is not closed on evidence: 1 of its files do not exist:
# scripts/tree-census.js". The file is inject 35cf0043 in nexus/core, status proposed: a Nexus system's change waits for his approval (his,
# 2026-10-24: "yes do it." to B, Nexus stays review). The coder did not approve it.
# No test file added (his rule; the routes were proved on his running system, said here). test suites not re-run after this change.
# Open: (1) his approval of the proposal, then the run retried from evidence; (2) a step in the pipeline that says "waits for your yes"
# instead of evidence refusing; (3) the stale-contract cause; (4) COS restarted: the pipeline is in COS twice until then ("(imported)", id
# 9dbc9c8f, the nine-step one; the eight-step original updates at COS's next sync); (5) 16 system repos unsynced; (6) chatgpt's reply
# selector and gemini's sign-in, Clear Glass's.

# ── ADDENDUM 2026-11-11 (0.60.494) — PC8: the DOM mutator on the tab's own "no reply element"; his approval applied; evidence needs a test ──
# James, 2026-11-11, asked to approve scripts/tree-census.js and told ChatGPT's reply was not found on its page: "Yeah. Why is it not hooked to the dom mutator"
# His question, answered from the code: the DOM mutator's stream was a fallback on two roads (guardian/lib/dispatcher.js, his 2026-10-21
# "use those as fallback routes. node anchor, dom mutator." · "look in clearglass download manager"): the completion watch running out, and
# before a re-send. The tab's own GUARDIAN_ERROR (gate watch: "no reply element found after 180s … selector drift, not a missing answer")
# went through guardian/lib/ncp-handler.js to the retry (answerFirst: the job, its .response, a settled transcript) and never to the ledger.
# Hooked: that road reads ledgerReplyFor first (guardian/server.js passes answerFromLedger and completeWith to the handler). Guardian's code;
# recorded here because the build pipeline found it. Its own map (the 0.60.191/0.60.192 phase) is to be addended when found: not searched.
# Not proved on a live job. Why ChatGPT's selectors drifted, and gemini's "provider down", are untouched.
# His approval ("Yeah."): POST …/injects/35cf0043…/apply, approvedBy him. scripts/tree-census.js is in the live tree.
# Run 78d4cc5a: build timed out at the api step's default 30 s (Idearium was still snapshotting). The pipeline file gives build 240 s.
# Run aaa327d9 (pipeline 33f6dc5e): seven steps met in 36 s; evidence 409 "IN0_baseline is not closed on evidence: no test can check it (its
# files are shared by more than 3 open phases, or no test reaches them)". The phase names no test; test-first was skipped (no planner ready:
# "no Ollama model on the ladder to code the plan"; qwen2.5:0.5b is under the ladder's 3b floor).
# His, by GV_D2 (2026-10-26, "the gate doesn't wait for me to accept it or not before it fails"): accept or reject a phase nothing can check.
# Open: the pipeline's evidence step should hold for his verdict when there is no test, not fail; COS now holds three copies of this pipeline
# (the 8-step original; two "(imported)", 9dbc9c8f without the build limit and 33f6dc5e with it): the coder's imports, to tidy with him.

# ── ADDENDUM 2026-11-11 (after 0.60.494) — IN0_baseline accepted by him; what the live stream held; two things said ──
# James, 2026-11-11: "Yes, accept it" · "also the .response. dom mutator is supposed to stream live."
# Accepted: the verdict route refused (the run was not held for a verdict: it had landed on file checks), the close route said "proven on
# file checks only: nothing ran", so his acceptance went through the status writer (POST …/phases/status, complete, his words as the reason;
# apply apply-mwbxsmbd-353cc2). The map reads DONE 2026-11-11. The pipeline's own evidence and ledger steps did not do it: a phase with no
# test has no road through them yet.
# Said: IN0_baseline had been shelved by him on 2026-11-07 ("Those are all top of my head ideas"). Idearium's ready queue listed it first, the
# coder ran it without reading its status, and the build moved it to IN PROGRESS. The queue offering a shelved phase is a fault to map.
# His second sentence, checked against Clear Glass's chat ledger (lib/chat-ledger-client.js), not answered from memory:
#   - gemini: 1 chat, updated 09:10:57, the user turn "Your task (step 1, attempt 13): Write ONE file: scripts/tree-…" and an assistant turn of
#     8,473 characters. The DOM mutator did stream Gemini's reply live. The run's record says gemini was "provider-down" and credits claude,
#     whose tab was on its sign-in page with no account. Which agent's text became the file is NOT settled: to trace before it is claimed.
#   - chatgpt: 0 chats in the ledger. The stream held nothing for it, so 0.60.494's hook would not have saved that job.
#   - by design (0.39.278, his "guardian is polling, but it shouldn't be, live streams the dom mutation live to the download manager") the
#     ledger is the live layer and a .response is written per settled version. A job's own completion still comes from the userscript's
#     watch (findResponseEl, 180 s), with the stream as a fallback. Making the stream the job's first source is not built: its own phase,
#     Guardian's and Clear Glass's, to map with him.

# ── ADDENDUM 2026-11-11 (0.60.495) — the live stream is the first source of a job's answer (his) ──
# James, 2026-11-11: "also the .response. dom mutator is supposed to stream live." · asked whether to make the live stream the first source of a job's reply: "Yes, build it"
# Side by side: (a) Guardian listens to Clear Glass's ledger for each job (a new listener between two systems, and the ledger has no event
# stream today: it would be a poll); (b) the stream the page's observer already sends Guardian per job (GUARDIAN_CHUNK, source transcript,
# generating) completes the job. (b) taken, by his axioms: §8.6 what exists is used, §16.4, §5.10 no new crossing; and it is not a poll.
# Built in guardian/lib/ncp-handler.js: settle 8 s (GUARDIAN_STREAM_SETTLE_MS); the job keeps streamFull, streamGenerating; the tab's "no
# reply element" completes from the stream first, then the ledger (0.60.494), then fails as before. Proof: NCP-020, NCP-021, NCP-022; 10/10.
# Guardian's code, recorded here because the build pipeline found it; its own map (0.39.278's phase) to be addended when found.
# Not proved on a live job. Open, from his screenshots: ChatGPT's tab signed out though labelled "as ChatGPT 1" (31 cookies restored); its
# reply was a tool call ({"name":"idearium.code_map.tool",…}) that nothing read; Google's "Couldn't sign you in — This browser or app may
# not be secure" inside Clear Glass: his sign-ins are his, and the coder does not work around a provider's sign-in check.
# Also open: Clear Glass re-injects Claude's userscript every minute while its tab is on the sign-in page (15 times in 15 minutes, seen).

# ── ADDENDUM 2026-11-11 (0.60.496) — PC8 expanded: a step that holds for him, instead of failing (mapped before code) ──
# James, 2026-11-11, asked what now and shown the order (commit; the pipeline holds for his verdict; the proof on Gemini; COS restarted; the stale contract): "Do it"
# The gap, from runs aaa327d9 and 5047dbb3: seven steps met, then `evidence` failed the whole run on a phase nothing can check. His rule of
# 2026-10-26 (GV_D2): "the gate doesn't wait for me to accept it or not before it fails."
# What exists, read first (§8.6): the engine's pause and continue (PC8 slice b, 0.60.484: POST …/pipeline-runs/:id/pause|continue, `cos pipeline
# continue`, the tab's Continue button); a task's onFail (stop | continue); Idearium's verdict route (GV2) for a run RAID held.
# Side by side: (a) a new step type or route that waits on Idearium for his verdict (a long request held for hours, or a poll); (b) the
# task's own onFail gains `hold`: a step that cannot pass pauses the run with its reason, stays waiting, and is asked again when he
# continues. (b) taken, by his axioms: §8.6 (pause and continue are used, nothing new beside them), §5.10 (no new crossing: COS's engine
# learns nothing of Idearium), §1.2 (the reason is said on the run), USER_AUTONOMY (the verdict stays his; the engine only waits).
# To build, JavaScript changed in place (the engine stays JavaScript until CIE13):
#   - lib/automation/pipeline.js: onFail `hold`; the run is paused by the pipeline, naming the step and why; continue asks the step again.
#   - idearium/api/index.js: POST …/phases/evidence { phase } answers ok for a phase already done (his acceptance closed it), saying so.
#   - idearium/pipelines/idearium-build.pipeline: `evidence` holds.
#   - cos/ui/automation/engine.js: a held run shows which step waits and why, beside Continue.
# Limit, said: a held run lives in COS's process; COS restarted, the hold is gone and the run is retried from its step (slice b's retry).
# Built 0.60.496 as mapped above. Proof: tests/modules/test-pipelines.test.js PL-03b; 6 of 7 (PL-06 "Clear Glass host exited", not looked into).
# NOT proved live: the running COS holds the old engine (its restart is his); Idearium, restarted by the coder for the evidence answer, was
# held by COS at waiting-memory (6 to 9% free, floor 10%) and was down when this was written. No pipeline run was made on 0.60.496.
# Open: his acceptance is still two acts (accept the phase in Idearium, then Continue): one act that carries his words to the verdict is his
# to ask for. A held run does not outlive a COS restart.
# After, the same day: James, "Firefox Closed." Free memory 11.3%, COS started Idearium by itself. The evidence answer is proved live
# (IN0_baseline: already true, done, nothing left to judge). The hold is still not live: COS is not restarted.
# ── ADDENDUM 2026-11-13 — his: the pipeline systematizes; make it visual, editable, debuggable, optimizable (PC4 and PC8 expanded; preview first) ──
# James, 2026-11-13: "pipeline is meant to systematize things. make a visual aspect for pipelines. debugging, workflow optimization and automation,
# coding chunk by chunk, like making it all visual, editable, debuggable, optimizable" · earlier the same day: "can't you use the pipeline recursively?
# like each step to break down ideariums processes? like litterally the pipeline can be used for way too much i feel like? would that optimize
# performance?" · "then we should use .chunks as steps" (a step is a .chunk: docs/2026-10-20-substrate-...-phasemap.spec addendum 2026-11-13).
# Read the same day: COS's Pipelines page (cos/ui/pipelines, PC1 0.60.454) draws a pipeline's boxes by its DAG, read-only. PC4 (the canvas) is
# OPEN; the canvas is ERAVOS's (PC_D10, his), not a copy in Nexus; his 2026-11-08 order: the canvas PREVIEW shown to him before any UI.
# The four views he names, as the coder reads them onto the phases that own them (to confirm with the preview):
#   - visual + editable: the canvas (PC4) — boxes, wires into hooks, a box opens into its own canvas (recursion, PC2); editing writes the
#     .pipeline node first (cos/pipeline from_erv), the canvas never holds the truth.
#   - debuggable: each box shows its last run — status, its error as written, its input and output, the gate's verdict and the gap it found
#     (PC_D3); a failed box can be retried from there (PC8 slice b, built).
#   - optimizable: each box's delta against its baseline (PC8 slice a, built: a delta and a baseline per step), the slowest box marked; a box
#     reused by hash shown as reused (the chunk-as-step reading: exact reuse, crystals by count).
#   - coding chunk by chunk: a build box opens into its chunks (the .chunk nodes of the phase it builds), each chunk a box with its rung
#     (derive, template, model: CIE-EG deterministic_first) and its tests.
# First real run to show: SW7a's build request (2026-11-13): context met, dag met after Idearium's snapshot was refreshed, build failed twice
# (Idearium out of its 1 GB heap at 09:15; then the request timed out while the build was started anyway and went stuck at 10:22).

# ── ADDENDUM 2026-11-13 (0.60.517) — PC8: every pipeline in Nexus reaches the Automation tab ──
# James, 2026-11-13: "also all pipelines in nexus need to be here." His tab showed 0 after an import that said "imported".
# Found on a real COS and Idearium (sandbox): COS's call cut a system's answer at 4,096 bytes, Idearium's pipeline is 5,704, its JSON broke
# and the sync skipped it silently; the sync ran once, before the systems answered; the tab read its list once. Built: read whole (4 MB),
# a skipped pipeline named; the sync also on a source system's spawn, resume or beat in COS's ledger (PR6: heard, not polled) and on his ask;
# the tab's Sync, what the last sync read, the list re-read from the stream; `pipeline-sync` in COS's console. Proof: test-cos-hub HB-10 in
# Clear Glass; the sandbox run (the sync followed Idearium's first beat, 9 steps imported). Clear Glass's pipelines not proved live.
# By the axioms: §8.6 (the sync and the sources existed; nothing new beside them), §1.2 (a skip is said), PR6 (no polling).

# ── ADDENDUM 2026-11-13 (0.60.520) — PC11 built: an attempt that never reached its agent teaches nothing ──
# James, 2026-11-13: "yes. then the highest leverage. ollama can can now run the pipeline". The 11-11 open item (3), the stale contract's cause:
# lib/pipeline-routing.js classify() now reads "nothing was sent", "no-answer", "provider-down" and Copilot's door unreachable as provider-down
# (transient), not unknown (which contract-gates.js filed as capability). Proof: PR-05b, GT-01b; the suites around it green. Contracts already
# carrying such a skip list keep it (the 11-11 one was archived by hand).

# ── ADDENDUM 2026-11-13 (0.60.521) — PC8: the framework trial as a COS pipeline, on Ollama, with a benchmark ──
# James, 2026-11-13: "we have ollama now. lets leverage that. test, benchmark, run the trial in the docs folder. clearglass pipelines, raid
# pipelines, idearium, all of them in cos." cos/pipeline/pipelines/framework-trial.pipeline (shipped; imported by the sync): api steps on the
# trial screen's routes, one problem per step through Ollama, a hold for his blind scores (onFail hold, 0.60.496), score, benchmark. trial.js
# fixed in place (Windows-safe answer names; blind read Ollama answers), --problem and bench.jsonl added. Proof: run whole in COS against a
# stand-in Ollama; test-framework-trial-deploy 5/5 (A6). Clear Glass's pipeline routes checked against the sync's shape. "raid pipelines":
# RAID has no .pipeline files or pipeline route; its readings asked (his).

# ── ADDENDUM 2026-11-13 (0.60.522) — PC12 mapped; slice a built: RAID's contracts are pipelines in COS ──
# James, 2026-11-13: "both. each step of any pipeline. thats the point. i want all pipelines managable, orchastratred, and programmable in cos.
# all of them." · "i want raid to be the hub that all systems run througj". Built: Cortex's list route and each gate's depends_on in its view;
# cos/pipeline/contract.eg (a contract → a pipeline, each gate a step asking RAID to check it); the sync's convert; a gate's reasonAt. Proof:
# a stand-in Cortex with Cortex's real door, run from COS, held with RAID's own reason, done after evidence and Continue.
# Open: slices b-d; his "raid to be the hub": readings asked (RAID decides every system's work · every call between systems passes
# through RAID · RAID moves into COS).

# ── ADDENDUM 2026-11-13 (0.60.526) — PC13 built: his request, built by the pipeline ──
# James, 2026-11-13: "need the pipeline building all of my requests." his-request.pipeline (intent → a phase HR<n> → idearium-build as a step →
# told); `request <words>` and `request answer <run> <gap> <answer>` in COS's console; Continue carries values; a gate names the open gaps.
# Proof: real Idearium to the intent step; a stand-in for the whole chain; PL-03c. Not proved: a real Ollama build (his machine).
# (Merged 2026-11-14 from claude/exciting-noether-lo55tr: its phases PC11–PC14 renumbered PC15–PC18, because main had built different PC11, PC12 and PC13 meanwhile.)
# ── ADDENDUM 2026-11-13 (map, after 0.60.514) — RAID the hub of every interaction (AE_D8 confirmed); every intervention a COS proposal; Ollama first (his) ──
# James, 2026-11-13: "And then we need to focus on the pipeline." · "Also, the proposals should run through the COS UI proposal system, like
# anything that needs intervention, not just in the supervisor, but in Iderium or RAID. And also, let's hook in RAID finally as the hub for all
# the interactions. Everything routes through RAID." · "let's find a Olama model, preferably abolished or obliterated [abliterated] ... And then
# we'll let's start using Olama instead. And then use Guardian if we have to."
# Census, read by the coder the same day (what waits for a person today, and where; none reaches COS's proposals, cos/manager/proposals.js):
#   - RAID, contract gates: a gate with awaitsPerson waits as `awaiting` (cortex/core/raid/contract-gates.js 625-697), answered nowhere in COS.
#   - RAID, officiator: a drop is parked after MAX_ATTEMPTS, tried once a day (cortex/core/raid/officiator.js parked()), read by hand.
#   - Idearium: a phase run held `awaiting-verdict` (idearium/api/index.js 2112; POST /api/repos/:uuid/phases/verdict), seen only in Idearium.
#   - Guardian: a job classified `needs-you` (login, captcha, rate limit, refusal; guardian/lib/job-retry.js 65), said in its own toast.
#   - The pipeline: a step `blocked` by a failed dependency (lib/automation/pipeline.js 284) and a held run (PC8 slice b: pause, continue, retry).
#   - COS itself: the supervisor's and the rules' held acts — the only kind that is a proposal now (MG18, SC4, 0.60.497 restart COS).
# RAID as the hub: AE_D8 (2026-11-09, "TO CONFIRM") and its 2026-11-10 words ("Raid the supervisor, load balancer, compartment router, agent router,
# the contract hub") are confirmed by "Everything routes through RAID." Built toward it: each COS request books one RAID contract (0.60.474);
# not built (named in AE_D8's addendum): a contract per compartment, RAID as the agent router (lib/agent-router is its own), the ladder's
# Ollama-first order chosen by RAID.
# The model: the abliterated catalog (ollama/abliterated-catalog.js) lists nothing past 9B because it sizes dense models; a mixture-of-experts
# model (DeepSeek-Coder-V2-Lite: 16B, 2.4B active) runs from RAM at a small model's speed, so the catalog's rule leaves out the best fit for his
# machine. Ollama's library has deepseek-coder-v2:16b (Q4_0, ~8.9 GB); no huihui_ai abliterated build of it was found on 2026-11-13; one on
# Hugging Face (gated, not huihui_ai) reports refusals 94/100 → 12/100, unverified. Which model is his, on his machine.

decisions_2026_11_13:
  PC_D15_raid_the_hub_of_every_interaction:
    status: "DECIDED 2026-11-13 by James (confirms AE_D8)"
    james: '"let''s hook in RAID finally as the hub for all the interactions. Everything routes through RAID."'
    chosen: >-
      Every interaction (a request, an agent's call, a held act, a verdict) is booked with RAID by its route (Cortex's, §5.15) before it runs, and
      RAID routes it: which agent (Ollama first), which compartment, whether it waits for a person. COS stays the front door and the glue (his,
      2026-11-10); RAID decides what and whether, COS does how and where.
    axioms: ["§5.2 everything routes through RAID", "§5.15 each system reached by its routes, swappable", "§9.1 RAID the one write authority for contracts"]
    still_his: "whether 'all the interactions' includes his own clicks in the UIs (booked as a person's act) or only agents' and systems' (the coder reads: all, a person's booked as by: person; to confirm)"
  PC_D16_ollama_first_guardian_if_needed:
    status: "DECIDED 2026-11-13 by James"
    james: '"let''s start using Olama instead. And then use Guardian if we have to." · "preferably abolished or obliterated" (abliterated)'
    chosen: "the ladder starts on a local Ollama model on his machine; Guardian's browser agents only when Ollama cannot (refused, too small, down); the model is his pick, abliterated preferred"
    axioms: ["§1.2 a fallback says why", "local and free first (his, 2026-10-19: \"ollama first\")"]

expanded_2026_11_13_hub:
  PC15_every_intervention_a_cos_proposal:
    status: OPEN
    layer: integration
    james: '"the proposals should run through the COS UI proposal system, like anything that needs intervention, not just in the supervisor, but in Iderium or RAID."'
    depends_on: [PC_D15_raid_the_hub_of_every_interaction]
    files: [cos/manager/proposals.js, cos/manager/server.js, cortex/core/raid/contract-gates.js, cortex/core/raid/officiator.js, idearium/api/index.js, guardian/lib/job-retry.js, lib/automation/pipeline.js, cos/ui/proposals/page.js, idearium/cli/route-commands.js]
    reuse: "cos/manager/proposals.js kinds (register verb with check and run, SC4); POST /api/cos/proposals; the census above"
    does: >-
      Each place that waits for a person holds a COS proposal by COS's route (by: system:<name>), with a kind COS registers whose run answers the
      owner by its own route: RAID's awaiting gate (verdict), RAID's parked drop (try now or drop), Idearium's awaiting-verdict (accept or
      refuse, his words carried), Guardian's needs-you (opened in its tab), a blocked pipeline step (retry or skip). The owner keeps its state;
      the proposal is the one place he answers. Slices: (a) RAID's two, (b) Idearium's verdict, (c) Guardian and the pipeline.
    proof: "a stand-in of each owner: its wait becomes one open proposal; take runs the owner's route and closes it; drop says why; the owner down is said, the proposal kept"
  PC16_raid_routes_every_interaction:
    expanded_2026_11_17_per_compartment: >-
      James, 2026-11-17, with his screenshot of Idearium's settings console listing every repo/compartment with its agent chips (nexus, ollama):
      "all of those settings should be in each compartments settings not in the global settings". A compartment's own agent and routing
      settings (who answers, its Ollama model, its route overrides, today Idearium's per-repo Agent tab and the console's repo list) belong on
      that compartment's own page in COS (the system's Configuration tab, cos/manager/system-config.js, beside Start at boot, Start on demand,
      Boot phase), each written to RAID per compartment; the global screen keeps only what is truly global (RAID's default policy). Slice b
      moves them there whole (migrate, not link: NX_D5).
    slice_a_built_2026_11_17: >-
      James, 2026-11-17: "i need ideariums settings to work better. this is meant to be in raid. all of the routing. so much of idearium is meant to be in the automation engine and raid." · "yes build it, then merge and push. then what gets this all moving. i need this working today." BUILT 0.60.555, slice a, RAID owns routing.*: cortex/core/raid/routing.js (the policy in Cortex's own data, cortex/data/raid/routing.json,
      every change a line in routing.ledger.jsonl); Cortex GET/POST /api/raid/routing and POST /api/raid/routing/import; Idearium's config
      (idearium/lib/config.js) lays RAID's copy (its mirror, idearium/data/raid/routing.mirror.json) over its three layers for routing.* as a
      fourth, 'raid', and sends every routing write to RAID through the outbox; Idearium hands RAID its current values once when RAID has none,
      then reads RAID's every minute. Idearium's Settings → Routing & fallback screen works as before, now on RAID's values. Cortex down: the
      mirror stands. Proof: test-raid-routing RR-01..04; test-pipeline-routing 20/20, test-settings-console 5/5, idearium-agent-routing 10/10,
      test-mcof-config-gate 14/14 (test-model-door MD-04 and test-config-governance 7 fail before and after, said). Not in slice a, said: the
      learned outcomes still kept by copilot's door; copilot's door still reads the policy its caller hands it (now RAID's); the 0.60.552
      officiator options not yet folded into routing.*; the screen not yet in COS (slice b).
    expanded_2026_11_17_copilot_is_a_hat: >-
      James, 2026-11-17, asked whether RAID should be in charge of routing and intent routing, after copilot (idle-stopped) took the route to
      Ollama down with it: "copilot is meant to be a hat that any agent casn wear". Corrects the coder's "copilot goes back to being an agent"
      (said the same turn, kept §0.3). Today copilot is a whole system (copilot/server.js :3750): it routes (lib/model-door.js /api/route),
      delivers (its Ollama backend, /api/prompt), runs the tool loop and holds the chat. His model splits it by owner:
        - the persona: a .hat in the hat forge (lib/hat-forge.js; lib/hat-seed.js seeds six today, no copilot), worn by whichever agent RAID
          picks (a local Ollama model or a browser agent), like the_officiator;
        - intent and route: RAID's (PC_D15, RL_D1), the model door's policy, breakers and learned order moved into it, not rebuilt;
        - delivery: RAID's one door (the Ollama bridge through lib/ollama-port.js, guardian's NCP for browser agents);
        - the chat surfaces (the TV shell's copilot button, the floating menu): an input to RAID with the copilot hat asked for.
      So no single system's outage takes the route down (§5.15.3), and "copilot" works with any agent. Where the tool loop (the agent runtime
      a hatted agent runs in) lives is his to say: the coder's reading is RAID's delivery, run in the request's compartment (to confirm).
    expanded_2026_11_17_ui: >-
      James, 2026-11-17: "no. i dont do cli. im not trying to remember all that. idearium already has the ui for this, which needs to migrate to cos automation pipeline and workflow canvas." Who answers (ollama, copilot, a guardian agent, claude-code) and the Ollama model are set today per repo in
      Idearium's Agent tab (idearium/ui/js/agent-options.js, POST /api/repos/:uuid/agent/settings, lib/repo-agent.js). With RAID the bridge,
      they become RAID's preferences per intent (its tunables) and their screen moves to COS's Automation tab, beside the pipeline and on the
      workflow canvas (cos/ui/automation/): set where the work runs, for every pipeline's agent steps. Idearium's Agent tab reads the same
      settings by RAID's route until it is retired (§0.3, archived not deleted).
    expanded_2026_11_17_routing: >-
      James, 2026-11-17: "look at idearium, it has all of this. also in clearglass the element engine." Read: Idearium already has the full
      routing and fallback options in one screen, Settings → Routing & fallback (idearium/ui/settings.html renderRouting, GET /api/routing,
      POST /api/config routing.*): which agent plans and which codes each chunk, the fallback chain, the breakers, the accounts per provider
      in order, the Ollama models, the learned ladder, Emerge first. That screen and its routing.* keys are what PC16 moves to RAID and COS
      Automation, whole (reuse, §8.6); RAID's officiator tunables of 0.60.552 (officiatorAgents, officiatorFallback) fold into the same keys
      rather than standing beside them (§10.3, one truth). The per-repo Agent tab stays the override for one repo.
    files_2026_11_17_ui: [cos/ui/automation/page.js, cos/ui/automation/engine.js, cos/ui/automation/canvas.js, idearium/ui/js/agent-options.js, lib/repo-agent.js]
    expanded_2026_11_17_lifecycle: >-
      James, 2026-11-17, giving the request lifecycle whole ("input into nexus goes to raid … raid decides what to do with each request … WE need a huge document for all of this, a map keep it all logged and referencable.").
      And before it: "wouldn't raid be the bridge?" · "yes but look at the nodes." (RL_D1 of docs/2026-11-17-raid-request-lifecycle-phasemap.spec). RAID decides AND delivers: one door knows each
      agent's kind (lib/agent-reach.js KIND: the local bridge for ollama/mistral, guardian's NCP for browser agents); his preferences and the fallback per intent
      are RAID's tunables; callers stop choosing. The officiator's 0.60.552 switch and officiatorAgents move into RAID (replaced, not duplicated); copilot/lifeline.js
      _tryOllama/_tryGuardian become RAID's delivery, not a caller's. First in the lifecycle's build order (L9).
    status: OPEN
    layer: integration
    james: '"Everything routes through RAID."'
    depends_on: [PC_D15_raid_the_hub_of_every_interaction, PC_D16_ollama_first_guardian_if_needed]
    files: [cortex/core/raid/contract-v2-door.js, cortex/core/raid/index.js, lib/agent-router.js, lib/pipeline-routing.js, cos/pipeline/index.js, cos/manager/server.js, idearium/api/index.js]
    reuse: "AE_D8's built half (one RAID contract per COS request, 0.60.474); lib/pipeline-routing.js ladder (Ollama smallest first, then the chain); RAID's packet, split and budget"
    does: >-
      RAID answers 'who does this' for every agent call: the ladder (Ollama first, PC_D16) moves behind RAID's route, so Idearium, COS's pipeline
      and copilot ask RAID instead of choosing; each call is booked on its contract, with the agent RAID picked and why. A census of every
      agent call that bypasses RAID comes first (slice a), then each caller moves (one slice per system).
    proof: "the census as a test (a call outside RAID fails it); a stand-in Ollama refused moves to Guardian, said, on the contract"
  PC17_the_model_fits_by_what_it_runs:
    status: OPEN
    layer: backend
    james: '"If we can squeeze enough, I could do a DeepSeek V2 16B quantisized ... 4K context, since Nexus is holding most of the context" · "the quanticized one is what I''m talking about."'
    depends_on: [PC_D16_ollama_first_guardian_if_needed]
    files: [lib/resource-monitor.js, ollama/abliterated-catalog.js, tests/modules/test-model-fit-ladder.test.js]
    does: >-
      fitsModel counts what the GPU holds (the card's free memory) and not only free RAM; the catalog sizes a mixture-of-experts model by its
      file (memory) and its active parameters (speed), so a 16B with 2.4B active is listed for his machine.
    proof: "MF tests: an 8.9 GB model on 4 GB VRAM and 9 GB free RAM fits; the same with 5 GB free RAM does not, saying both numbers"

# ── ADDENDUM 2026-11-13 (map) — Ollama baked into COS: COS runs the server, Ollama's own app retired (his) ──
# James, 2026-11-13: "Can we just replace the fucking Olama default application and just bake fucking Olama into cos? I'm fucking sick of the
# Olama. Have it use any that's on my pc. Fallback to any other?"
# Read first: Nexus's ollama system is a bridge only (ollama/server.js, :3749, compartment.json runtime.process "ollama-bridge"); the server it
# talks to (:11434) is started by Ollama's own Windows app (its tray and its Startup entry), outside COS. COS's supervisor already runs a second
# process per system (runtime.processes, MG15a) and picks a binary from cmdCandidates, but appends .cmd on Windows (made for electron), so
# ollama.exe needs its own lookup. Nothing in COS starts, adopts or stops `ollama serve` today.
expanded_2026_11_13_ollama:
  PC18_cos_runs_the_model_server:
    status: OPEN
    layer: backend
    james: '"replace the fucking Olama default application and just bake fucking Olama into cos" · "Have it use any that''s on my pc. Fallback to any other?"'
    depends_on: [PC_D16_ollama_first_guardian_if_needed]
    files: [ollama/compartment.json, lib/cli/compartments.js, cos/manager/supervisor.js, ollama/lib/model-inventory.js, cos/manager/proposals.js, idearium/cli/route-commands.js, tests/modules/test-cos-model-server.test.js]
    reuse: "runtime.processes (a system's second process, MG15a); the supervisor's start, restart and circuit; MG35b's adopt-what-already-answers; COS proposals for acts on his machine (PC15)"
    slice_a_2026_11_14: >-
      James, 2026-11-14: "We need the highest leverage, that gets me closer to cutting depende on you and using it the pipeline to build nexus.
      Vital. The pipeline. Focus on that." His own words for this slice, 2026-11-13: "Have it use any that's on my pc. Fallback to any other?"
      Found: the build's ladder leaves an Ollama rung off when its model is not installed (lib/pipeline-routing.js present, §HP3), and the
      bridge calls the default qwen2.5-coder:7b, which his PC's log of 2026-11-14 shows missing. So the pipeline's Ollama rung never runs on his
      PC and the build climbs to the paid agents. Slice a: (1) present() puts the best installed model in place of a missing one (a coder
      model first, then the order Ollama lists), said on the run as swapped, and skips only when nothing is installed; (2) the bridge's one
      door (ollama/lib/ollama-client.js callOllamaRaw) does the same for every caller (copilot, the chunk builds), said in its log. Changes
      existing JS, no new file (§17.13).
      files: [lib/pipeline-routing.js, idearium/api/index.js, ollama/lib/ollama-client.js, tests/modules/test-ollama-uses-what-is-installed.test.js]
      proof: "a ladder naming a missing model runs on an installed one and says which; with nothing installed it is skipped as before; the bridge's call for a missing model goes to an installed one"
    does: >-
      The ollama system declares a second process, the model server: `ollama serve`, the binary found on his PC (PATH, %LOCALAPPDATA%\Programs\
      Ollama, Program Files; the first that exists, named), with his models where they already are (OLLAMA_MODELS unset = his ~/.ollama). COS
      starts it with the ollama system, restarts it on a crash, and stops it with COS. A server already answering on :11434 is adopted, never a
      second one started. Retiring Ollama's own app (its tray process and its Startup entry) is a proposal he takes, never done silently.
      Fallback, as read (to confirm): no Ollama binary → another local server that answers (LM Studio :1234, llama.cpp :8080, both
      OpenAI-shaped) → Guardian's browser agents, each fallback said.
    proof: "a stand-in binary: found and started; an answering :11434 adopted, nothing started; a crash restarted; no binary refused and the fallback named; the app's retirement only as a proposal"

# Answered the same day (his, to three questions):
#   - the fallback: "Other local, then Guardian" — no Ollama → another local server that answers (LM Studio, llama.cpp) → Guardian, each said.
#   - the language: "Emerge only" — the lookup and the start are written in Emerge, not JavaScript (his 2026-11-07 rule, applied).
#   - Ollama's own app: "No. Let’s build our own with emerge. Completely ours." — two readings, his to choose (PC_D17).
    expanded_2026_11_24_scaling_by_the_queue: >-
      His words (2026-11-24): "its dumb you cant set that per model, but we could right? like if we need the 16b, change the setting back to 1
      or 2 depending on the queue then back when its the 3b, like dynamically scaling?" · "lets do it. you think raid?" · "integrating and
      creating out own backend for ollama out of emerge would be nice if it ran smoother, and we had more control over it like with the rewind
      engine or flight recorder like idearium". Found that day: the 16b (11 GB of 16) and the 3b loaded together froze his PC; a running job
      could not be stopped. Ollama reads OLLAMA_NUM_PARALLEL and OLLAMA_MAX_LOADED_MODELS only at its start.
      Owners (§5.9-§5.16): the Ollama system reports its queue (by model) and what is loaded, through its own routes; RAID decides the mode
      (routing is RAID's, PC16); COS applies it, restarting the model server with that mode's settings (COS supervises processes; an act on his
      machine is a proposal until he allows it, PC15).
      Modes are settings, additive (his rule 2026-11-24: settings for the dynamic and additive): "3b swarm" (NUM_PARALLEL 3, MAX_LOADED 1),
      "16b solo" (NUM_PARALLEL 1, MAX_LOADED 1), more as he adds them, each with the free memory it needs. Slices: a) the bridge: a big model is
      asked with keep_alive 0 and free memory is checked before it loads (no restart); b) the queue by model and the jobs grouped, so the walls
      of one model run together (his "batch and inject a bunch in one go"); c) RAID's choice of mode from the queue and the memory; d) COS
      restarts the model server in that mode, after the running jobs finish; e) the backend in Emerge (PC_D17) with its flight recorder and
      rewind for every model call (ollama/lib/tape.js replays calls today).
      His words: "we could dynamically scale that up also couldn't we? hooked into the resource manager? not polling unless its to scale?" The
      trigger is COS's resource manager (Resources, /api/cos/usage): memory pressure and the queue changing are events, and the mode changes on
      them; nothing polls while it runs; only a switch checks, to confirm the memory is back before the next model loads. Slice a, built
      2026-11-24: the bridge reads each model's size from Ollama (details.parameter_size), not only its tag, so a big model with no size in its
      tag is unloaded when it answers (the 16b's tag had none: kept 30 min, his PC froze).
      Proof: with the 16b needed by a wall, the PC does not freeze (free memory stays above the mode's floor), the 16b group runs, and the 3b
      swarm comes back by itself.
decisions_2026_11_13_model_server:
  PC_D17_our_own_model_server_in_emerge:
    status: "DECIDED 2026-11-13 by James: reading a, widened to an inference supervisor in Emerge, Ollama its first backend (see the addendum after)"
    james: '"No. Let’s build our own with emerge. Completely ours." · "Emerge only" · "Other local, then Guardian"'
    readings:
      a_the_manager: >-
        Ours replaces Ollama's APP: finding models on his PC, starting, adopting and stopping the server, loading and unloading, serving
        Nexus's ladder, in Emerge, in COS. The inference itself stays a binary that is already on his PC (ollama or llama.cpp), run as a
        process. Weeks, not months; lands on PC18 as written.
      b_the_engine: >-
        Ours replaces Ollama ENTIRELY: an inference engine written in Emerge that reads a GGUF file and runs the model (quantized matrix
        multiply, attention, mixture-of-experts routing, the tokenizer). Emerge compiles to x86 by syscalls with no libc and has no GPU access,
        so it runs on the 3700X alone: a 2.4B-active model is feasible on CPU only with SIMD kernels Emerge does not have yet. Months; a project
        of its own (its own map), and the GTX 1650 unused until Emerge reaches the GPU.
    coder_recommends: "a first (it is what makes Ollama's app unnecessary now); b mapped as its own project after, if he wants it"

# ── ADDENDUM 2026-11-13 (map) — PC_D17 decided: an inference supervisor defined in Emerge, Ollama its first backend (his) ──
# James, 2026-11-13, choosing between "our own manager" and "our own engine": "YES. You’re talking about building the supervisor itself in Emerge,
# not JavaScript. That is a substantially different proposition. And potentially a better fit for Nexus. ... you define the supervisor in Emerge as
# a system of processes, conditions, constraints, routes and executable operations. ... * Detect whether Ollama is running. * Inspect available
# models. * Receive inference requests. * Evaluate resource availability. * Queue or dispatch requests. * Monitor execution. * Recover from
# failures. Each operation becomes an Emerge-defined process. ... Ollama becomes just one backend implementation. You could eventually build the
# same supervisor around llama.cpp, another local inference runtime or even a remote inference service. Emerge defines the management logic. The
# backend performs inference. One important caveat: Emerge still needs mechanisms to interact with the operating system, HTTP interfaces and
# native executables. ... I would investigate building this as a complete Emerge-defined inference supervisor, with Ollama as its first backend,
# rather than making an Ollama-specific controller. That would test Emerge’s ability to build an actual reusable infrastructure system."
# PC_D17: DECIDED, reading a (the manager, not the engine), widened by him to a backend-agnostic inference supervisor. Inference stays a backend's.
# What Emerge has for it, read the same day (emerge/emerge/lang/runtime.js, native/rt.eg): proc_start, proc_wait, proc_wait_ms, proc_signal,
# proc_run; read_file, write_file, path_exists, is_dir, list_dir, make_dir, move_path, remove_path. Not there: an HTTP client or server, sockets,
# environment variables, the platform's name. Native emerge.exe is Linux (syscalls); on his Windows machine Emerge runs interpreted (eg.js on
# node), and a Windows PE is a milestone only (native/milestone.eg). So, his caveat in the tree: the OS, HTTP and native executables.
# The other angle, before calling HTTP a blocker (his rule, 2026-11-07): Ollama's own CLI answers detect, inventory and load without HTTP
# (`ollama ps`, `ollama list`, `ollama run --keepalive`), all by proc_run; HTTP is needed only to serve requests and to stream a reply. Slices
# a-c use the CLI; d needs the door; the gaps go to CIE14 (gaps found while coding).
    decided_2026_11_24_its_home_and_engine: >-
      DECIDED 2026-11-24 by James. Asked: its home (a system of its own / inside the Orchestrator / inside COS) and its engine (llama.cpp's
      llama-server directly / Ollama underneath). His words: "lets get ollama replaced? into the orchastrator? like i want it to be ours." · "yes
      yes yes/ like i want as much control over ollama as possible, hook into the rewind engine." · "its making me want to say no so we can be
      soverein but the per model control is making me want to say fuck yes." Read as: a system of its own (supervised by COS, RAID routes to
      it, the Orchestrator and Co-pilot call its routes), driving llama-server directly. Sovereignty kept by the axioms: an external dependency
      is a plugin (the core emits a gate, one plugin speaks to the outside engine). Ours, in Emerge: the supervisor (models, modes, memory, the
      queue, stopping a running job), its routes, its ledger, and the flight recorder and rewind of every call (Idearium's rewind engine and
      flight recorder, hooked in). Backends as plugins: llama-server first (one server per model: its own parallel slots, context and memory,
      the model files already on his PC), Ollama second, an engine of our own later. Ollama's app is no longer needed once the first plugin runs.
      After SB1 (the proof), his order. His word the same day: "do it."
    settings_2026_11_24: >-
      His words (2026-11-24): "I want cos to have full extensive settings for all of this. Then we can hook it into the gates. Way too much we can
      do with this." · his rule the same day: "hardcoded earns its place. settings are for the dynamic and additive ... anything that i would
      have to manually change in code that should be mapped to a setting, or option." Owner: the inference system's own settings (its data, its
      routes, §5.9), shown in COS under Systems > inference (SC29: each system's own settings, read from its contract). A gate reads them by
      reference, never copies them. Preview first (his rule), then built. The settings, by group:
      Engines: the backend plugins in order (llama-server, Ollama, more as added), each engine's path candidates, the model stores to read.
      Models (one card per model found): on or off; port; slots (requests at once); context; GPU layers; threads; stays loaded or freed after
      answering; the memory it may take; the intents it serves (generating/coding, speccing/mapping, complex reasoning, debugger/adversarial,
      copilot/orchestrator: his intent map, a drop-down of every installed model).
      Modes (additive): a name, the models and their slots, when it is chosen (the queue, a wall, his pick), the free memory it needs.
      Memory: the floor never crossed, what to do near it (hold the job, free a model, switch the mode), events from COS's resource manager.
      Queue: timeouts (first token, whole answer), retries, a job whose run is gone is stopped, batch size (pieces sent in one call).
      Ladder and walls: per intent, the models smallest first; what counts as a wall (the breakdown exhausted); temperature per try.
      Recorder and rewind: every call recorded (prompt, tokens as they come, timing, the model's settings); how long kept; the engine's slot
      save for rewind; replay without a model.
      Gates: per gate kind, its intent, mode, limits and brief size, so a gate is set from COS, not from code.
      Corrected 2026-11-24 (his: "Remeber no coupling", with ChatGPT's read of cos/manager/resources.js, checked in the code): COS already
      has the resource manager (per compartment, three layers: defaults, the system's declaration, his overrides; heap at spawn; priority
      lowered and restored under pressure, RAID-approved through lib/raid-port.js, fail-closed; a learned memory baseline; RSS watched, CPU
      share not enforced, both said). So the Memory group is NOT a second manager: inference/ declares its needs in its compartment.json and
      COS's resource manager accounts for it like every compartment, extended with what it lacks: VRAM (none today), a model's memory budget,
      admission (a job waits when its model would not fit), per-inference telemetry. The manager samples on a timer (sampleMs); by his rule
      pressure becomes an event (SB2's pulse), the timer the fallback. No coupling: inference/ never requires COS; COS supervises it by its
      declaration; RAID approves through its port; gates reach it by its routes; the engine is a plugin. Before Ollama is retired (g), ours is
      benchmarked against the Ollama path on the same pieces (time, passes, memory), and passes.
    slices_2026_11_24: >-
      The system is inference/ (a name of the coder's: his to rename). a) BUILT 2026-11-24: inference/models.eg reads the models on his PC from
      Ollama's store (manifests to GGUF blobs: name, file, bytes) and finds the engine (llama-server, the first candidate that exists);
      inference/test/models.test.eg 4/4 on a fixture store; on his PC it found the 3b (1.9 GB), the 16b (10.4 GB), the 30b (18.6 GB) and
      Ollama's llama-server.exe (llama.cpp's options: -m, --port, -np slots, -c context, -ngl GPU layers, --slot-save-path). b) start and stop one
      llama-server per model, its slots, context and GPU layers as settings per model, free memory checked before it starts; c) its routes (the
      OpenAI-shaped chat and completion the bridge speaks, models, load, unload, stop a request), a compartment.json so COS supervises it; d) every
      call in its ledger and flight recorder (prompt, tokens as they come, timing, the model's settings) and rewind (replay from the record;
      the engine's own slot save and restore); e) RAID routes to it, the bridge's ladder asks it first, Ollama the second backend plugin; f) the
      modes (3b swarm, 16b solo) on the resource manager's events (PC18's scaling); g) Ollama's app retired, a COS proposal.
expanded_2026_11_13_inference_supervisor:
  PC18_cos_runs_the_model_server:
    status: OPEN
    expanded: "2026-11-13, PC_D17 (his): an inference supervisor defined in Emerge, Ollama its first backend; replaces Ollama's app"
    files_added: [cos/inference/supervisor.eg, cos/inference/backend.eg, cos/inference/backends/ollama.eg, cos/inference/backends/llamacpp.eg, cos/inference/test/supervisor.test.eg, cos/manager/inference-door.js]
    slices:
      a_the_backend_contract: "backend.eg: what a backend is — detect, models, load, unload, infer, health, stop — as Emerge records and processes; a stand-in backend passes it"
      b_ollama_detected_and_started: "backends/ollama.eg: the binary found (candidates by path_exists), a running server adopted (`ollama ps` answers), else `ollama serve` started by proc_start, kept by pid; needs env and platform (CIE14 gap, said)"
      c_models_and_fit: "inventory by `ollama list`; fit by memory (PC17's rule in Emerge: RAM, the card, active parameters)"
      d_requests: "receive, queue and dispatch inference requests with constraints (one model loaded at a time on a 4 GB card; a request over budget waits or falls back); served through COS's door (the JS host as cos/pipeline already is, until Emerge has sockets)"
      e_monitor_and_recover: "a crash restarted with backoff; a hung request timed out and said; a server that stops answering adopted again or restarted"
      f_fallback_backends: "llama.cpp's server and any OpenAI-shaped local server, then Guardian (remote), each fallback said (his: Other local, then Guardian)"
      g_ollamas_app_retired: "a COS proposal (PC15) to stop Ollama's tray app and remove its Startup entry, once b runs on his machine"
    proof_added: "supervisor.test.eg on a stand-in backend: detect, adopt, start, crash and restart, over budget waits, fallback said; then his machine, Ollama's app closed, Nexus's ladder answered by COS"

# ── PINNED 2026-11-13 (his idea; not mapped, not built) — a model of our own: a base model trained on Emerge and his framework, as Nexus's copilot ──
# James, 2026-11-13: "Also huge idea to put a pin in. What if we load a base model for emerge and the framework to train completely for nexus as
# the copilot"
# Context, the coder's, for when it is unpinned: the inference supervisor (PC18) would serve it as one more backend. What there is to train on:
# Emerge's own sources, examples and tests (lang/, cie/), every .phase and map, his framework (docs/innovation-toolkit*.md, FRAMEWORK-THREADS),
# his words (docs/his-words). Small for training a model from nothing; a fit for adapting a small base model (LoRA). On his machine a 4 GB GTX 1650
# can adapt a model up to about 3B, slowly; a rented GPU for hours is the other way. Open, his: "base model" as a pretrained small model adapted
# (the coder's reading) or a model trained from nothing; and what "completely for nexus" excludes. A prediction goes in FRAMEWORK-THREADS before any run.
pinned_2026_11_13:
  - "a base model trained on Emerge and his framework, completely for Nexus, as the copilot (his, 2026-11-13); after PC18, unmapped"

# ── ADDENDUM 2026-11-13 (map only, merged 2026-11-14) — his: the remote control as a COS module, and an assistant that navigates with him ──
# James, 2026-11-13: "like can we decompose the claude application for windows and make a remote control module for cos? also cos needs a
# completely ai assistant that can navigate with the user, look at the remote control spec that comes from the nexus nerve, interaction field,
# tv ui, etc."
# Read the same day: cos/spec/remote-control.spec (PC10, specced 2026-11-11 from his Nerve, interaction field, ClearDriver) is that module's
# spec; of its five modules only PC9's desktop-driver.js exists (desktop-field.js, overlay.ps1, remote-control.js are not written). PC10 is held
# behind his PC_D13 ("so pipeline working needs to happen. then cos optimized." · 2026-11-11: "Just map it. Maybe spec it. Then back to the high
# leverage. Can't get distracted"). Whether today's ask moves PC10 ahead of that order is his (RCA1_R2).
# "decompose the claude application": not done by the coder. Claude for Windows is Anthropic's program, not his or the coder's to unpack and
# copy; what it does that he wants (a session on one device seen and steered from another, acts approved by the person) is taken as behaviour
# to match, from what it shows on screen and its public documentation, and built from his own parts (PC10's spec). Said, not hidden (§1.2).
phases_addendum_2026_11_13_rca:
  RCA1_cos_assistant_navigates_with_him:
    status: "OPEN — mapped 2026-11-13; his readings first (do not guess)"
    origin: 'James, 2026-11-13: "also cos needs a completely ai assistant that can navigate with the user, look at the remote control spec that comes from the nexus nerve, interaction field, tv ui, etc."'
    depends_on: [PC10_our_own_remote_control]
    spec: cos/spec/remote-control.spec
    files: [cos/spec/remote-control.spec]
    requires: ["PC10's see, show, act, verify (the field and the overlay)", "a local model through Ollama (his 2026-11-13: \"now we can use ollama for the pipeline\"); measured on his PC the same day: huihui_ai/qwen2.5-coder-abliterate:3b, 61.66 tokens/s generating on one short run (44 tokens), 100% GPU"]
    does: >-
      An assistant inside COS that works on the screen with him: it reads the interaction field (numbered targets, not pixels), knows from Nerve
      where he is looking and what just changed, shows what it means on the overlay (the spotlight and its label), and speaks in COS's Console.
      It reaches every system's commands through each system's own door (SC10), never their files (§5.15). Nothing acts until he arms it (PC9).
    readings_to_confirm:
      - id: RCA1_R1
        question: '"navigate with the user"'
        reading_a: "it guides: it spotlights where to go and says why, and he clicks"
        reading_b: "it drives: it acts by number itself while he watches and can stop it"
        reading_c: "both, a switch per session: guide by default, drive when he arms it"
      - id: RCA1_R2
        question: "does this move PC10 ahead of PC_D13's order (the pipeline operable, then COS optimised)?"
        reading_a: "no: mapped now, built after PC8 and the canvas (his 2026-11-11 order stands)"
        reading_b: "yes: PC10 and this assistant are built next"

# ── ADDENDUM 2026-11-15 — PC4 expanded: the canvas imported into Nexus, blank (his); PC_D10 superseded in part ──
# James, 2026-11-14: "i want you to pull the canvas from the eravos canvas repo and remove the tools. make just the tools for nexus and the build
# pipeline" · asked where it lives, the three places side by side: "importing eravos' canvas. isolated from the repo and start blank and make the
# tools for nexus." This supersedes PC_D10's "I don't need a copy" (2026-11-08) for the canvas itself: Nexus now holds its own copy, by his word.
# Done (not released): cos/ui/canvas/ — ERAVOS's canvas/ at 0ace521 (3.48.3) unchanged, its tool-free core and dataflow folders, its schemas;
# tools/index.js loads core, dataflow, nexus; served by COS's cockpit server at /canvas/canvas/. Boots blank, no errors (Clear Glass's driver).
# Open: Nexus's tools (tools/nexus/): the Step box (ERAVOS's eravos.agents.step, the id COS's box.eg already writes into a .erv) and a Pipeline
# tool (COS's pipelines listed, one opened as boxes, run, each step's state live), shown to him first (PC4's prerequisite, his 2026-11-08).
# The older template copy, cos/archetype/eravos-canvas, is left as it is.

# ── ADDENDUM 2026-11-17 (0.60.559) — PC8: a busy Idearium no longer leaves Ollama off the ladder ──
# James, 2026-11-15: "need the pipeline working. like this is priority." (his standing priority; the RQ0 build of 2026-11-17 failed and was diagnosed on his machine)
# First error of build phrun-mwl8cat2-u6vu (21:55:35 UTC): the ladder left Ollama off, "ollama bridge unreachable: … GET /api/models timed out
# after 4000ms". Ollama's server.log answered /api/tags in 8 ms at that second; Idearium had missed its pulses (no beat for 20 s from 21:54:45):
# its own thread was busy and the expired 4 s timer ran before the reply. Everything after came from it: no plan, no test writer, a stall at
# verify-first (10 min, no agent calls), the watchdog's retry stalled the same way, contract-incomplete, retries used up, landed misreading the
# auto-retry note (fixed 2026-11-15 in his tree, not in main).
# Built: idearium/api/index.js _ollamaModels asks a timed-out probe once more (15 s); a refusal is unreachable at once. Proof: test-log-fixes
# LF-07 (fails on the old code). By the axioms: §1.2 (a skip says its true cause: a slow caller is not an absent Ollama), §8.6 (the probe kept,
# asked again), deterministic first (the local coder is not dropped on a timing artefact).

# ── ADDENDUM 2026-11-17 (0.60.560) — PC8: the 2026-11-15 fixes, kept (they were lost once) ──
# James, 2026-11-17: "finish it. need nexus building itself"
# The record of 2026-11-15 (runs 16982fd6, 4a2f6d25, 26d77925, 87c80e17, a23053bf, 41297178, a14609e8 of the Idearium build pipeline, phase
# CS12), written that day as addenda in his tree and lost with them when the branch moved, restated: Versionium hung on a partial clone's
# lazy blob fetch (git log -p in execFileSync, three times); the snapshot failed on a woken Versionium's timeout; landed 404'd (system repo)
# and later read Idearium's auto-retry note as the build; the agents' code was lost to Nexus's own "which file?" follow-up, whose one-line
# answer replaced the reply; the test writer stopped at the first agent that did not answer; ChatGPT's token was dead at OpenAI (his
# sign-in), DeepSeek signed out, Gemini's page unresponsive, Claude at its usage limit once.
# Built in 0.60.560 (the code of that day, carried from his tree, the index.js parts re-made on main): lib/flight-data.js latestBuild and the
# landed route (FD-10); versionium nexus-releases/release-notes GIT_NO_LAZY_FETCH, the worker may fetch (RB-03); idearium/repo/snapshot.js
# retries "timed out" (SO-01b); lib/repo-inject.js expectAsking with every one-file dispatch and the test writer (LF-05b); lib/phase-plan.js
# brief inline; guardian/userscript-claude.js reply from the conversation; the test writer's hand-over, Ollama last (not independent).
# Lesson, said: a fix on his machine is not kept until it is committed; these were lost once and cost his RQ0 run.

# ── ADDENDUM 2026-11-17 (0.60.561) — PC8: the phase chosen carries its phasemap ──
# James, 2026-11-17: "finish it. need nexus building itself"
# His N1 run (11ac8139): dag timed out at 30 s on a cold Idearium; warm, "no phase N1 in this repo's DAG": N1 is in two phasemaps and the
# run form (0.60.558) sent the bare id. Every route already took a map; nothing passed one. Built: the form's options carry their map and
# Run sends vars.map (no box to type it); the build pipeline passes map to dag, graph, build, landed, evidence; landed's latestBuild filters
# on it; ready, map, dag, graph wait 120 s. Proof: test-cos-console CC-12, test-flight-data FD-10. By the axioms: §1.2 (an ambiguous id is
# said, never guessed: the route refused, and now it is told which), §8.6 (the routes' own map parameter used, nothing new beside it).

# ── 2026-11-17 — his: the pipeline stays agnostic; outputs live on the work surface; Idearium's compartments loaded per tab (asked, recorded) ──
# James, 2026-11-17, with a screenshot of COS's canvas (Idearium build pipeline: "The build landed" running 12 min, Outputs "null", Ledger
# attempts 1–4): "the pipeline staying agnostic right? the work surface needs to be used for the outputs, like how idearium streams the dom
# mutator. also should we seperate the compartments in idearium, like all of the systems compartements into their own seperate ones, that way
# we only need to load what we need? each tab loads what it needs?" · "remember i need you feedback. also record to the proof of compenency doc
# when applicable."
# - Agnostic (checked against the engine, the coder's answer): COS's engine knows step types (api at a nexus:// address, pipeline, notify,
#   procedure) and gates; the build is Idearium's, reached only by its routes. Nothing of Idearium is in lib/automation/pipeline.js.
# - Outputs: today a step's Outputs pane shows its result only when the step ends ("null" for 12 min while the build runs); the build's own
#   rows (planning, test-first, each rung) exist in Idearium's flight record. His ask, as the coder reads it (to confirm): a running step streams
#   what it is doing into the canvas's Outputs (the work surface), live, as Idearium's work surface streams the DOM mutator. PC8's "debuggable"
#   view (2026-11-13 addendum) is where it belongs. Not built.
# - Compartments per tab: recorded as his question; the coder's view given in the session (0.60.54x already loads Idearium's repos only when
#   opened; memory is the binding limit). Not decided, not built.

# ── 2026-11-18 — run 74f98418 (N1) recorded as what it proved: orchestration, not implementation ──
# He pasted a review by ChatGPT (no words of his own): "Don't let a successful pipeline run accidentally become a successful implementation
# claim. Those are different gates." Acted on as the review asked; the coder agreed and had said the same (0.60.562's changelog).
#   - pipeline route: DEMONSTRATED (ready → … → landed clean in 2 agent calls, 12 min; held at evidence for his verdict, by GV_D2).
#   - agent orchestration: DEMONSTRATED (route ollama:…3b > gemini > claude; Gemini planned; Claude wrote the test only after Gemini's page
#     was blocked; Ollama's brick passed its gate).
#   - new implementation: NOT demonstrated (Ollama's lib/semantic-variant.js equals the file built 2026-11-04: 0 lines differ).
#   - test integrity: REVIEWED — tests/n1.test.js's 30 tests map to N1's own description (protect/restore 9, validate 8, jsVariant 3,
#     similarity 3, the per-agent novelty store of 50 7); 30/30 against today's tree; caveat: never seen failing first (the code existed),
#     so it proves less than PE6 asks. Proposal 53eb1cbc still open.
#   - the two rewrites of tests/modules/test-guardian-retry-novelty-installs.js (307 → 246 / 244 lines, dropping its header with his
#     0.39.265 words): REJECTED pending review (cb3df74b, e526dd33; kept, re-appliable).
#   - Emerge-first for existing JS: UNRESOLVED (his to decide; kept apart from this run's scope).
# N1 itself stays paused at evidence: accepting the phase is his.

## ADDENDUM 2026-11-18 — PC8 expanded: a run that stopped is noticed (mapped before code)
# James, 2026-11-18 (NM1's dag step timed out while Idearium re-indexed after a restart; the request stayed active and nothing moved until he asked
# "what is going one"): "okay, needs to detect when it's not running"
# PC8 slice stall: when the engine says a run ended (automation.pipeline.done) and its request is not met, COS reads the request and Emerge decides
# (cos/pipeline/stall.eg): a step failed for a transient reason (timed out, ECONNREFUSED, ECONNRESET, 503, not answering) and resumed fewer than 3
# times → resume after a wait (30 s, then 60, then 120), said; anything else → stalled, held for him, said. Each decision a console line and an event
# (pipeline.request.retried | pipeline.request.stalled). Event-driven: no poll. A run that hangs without ending is not covered here (IF3 slice e).
# files: [cos/pipeline/stall.eg, cos/pipeline/cli.eg, cos/pipeline/index.js, cos/pipeline/test/stall.test.eg]. depends_on: [PC8]. Built next.

## ADDENDUM 2026-11-18 (later) — the pipeline tab becomes a flight map on the canvas; COS or Idearium (his, with the coder's recommendation)
# James, 2026-11-18: "need this working. okay, system states saved as a node file, crash reverts them back to the most recent one. good? need to
# upgrade the pipeline ui in cos ui, and the canvas. can you keep making sure the canvas for the pipeline are tools compatable with eravos. can you
# continue pipeline ui and canvas, i hate the pipline tab. like it shouldn't be a list, it should be visual in the canvas with each system in the
# canvas also showing from where to where, like a flight map. like each pipeline, in realtime, to what system, where, and recent ones fade over a
# span over a couple of days. can edit, change, manipulate and diagnose. then could use the flight recorder for each pipeline. migrate ideariums
# pipeline tools into cos, or integrate cos and idearium. having a hard time deciding."
# (a) "system states saved as a node file, crash reverts them back to the most recent one": MG15 slice a's running table is a .node file per state
#     change (the most recent kept as current, the last ones kept), and a crash of COS's manager comes back to the most recent one (adopted, or started).
# (b) PC_flight (to write as a phase, after MG15): the Pipelines tab replaced by the canvas: each system a node placed on it, each pipeline run an arc
#     from the system it starts in to the systems its steps call (nexus://<system>), live as the steps run, fading over two days; a run opens its
#     flight recorder (the engine's saved runs, step by step: input, output, gate, time); edit, change, re-run and diagnose from the arc. Its tools
#     stay ERAVOS-compatible (the .pipeline and .erv shapes, PC's ERAVOS round-trip).
# (c) COS or Idearium, the coder's recommendation, his to decide: COS owns pipelines (the engine, the runs, the canvas, the flight recorder; it
#     already is the engine, PC and IF2 say so); Idearium becomes a client that asks COS to run its builds, and its pipeline tools move into COS one
#     at a time while each keeps working (the strangler pattern IF2 names). Integrating both as peers would keep two places that run pipelines.

## ADDENDUM 2026-11-18 (later) — the cockpit: three canvases on Nexus's own sources; Loom on its way out (his)
# James, 2026-11-18: "i like it so far. but temporal playback. pause, rewind and replay the map, a timeline to move backwards and forewards, see wires
# break, tension increase, system increase regime, trace the cause to the effect. i cant zoom in. systems need way more info. also interconnected. three
# entirely different layers. all a canvas like eravos. ... the pipeline ui needs immense unpgrades. needs to use the component registry per system, have
# quick tools, to control the system, open it, diagnose it," · "Also the lineage map. The map shows compartments with a pulse. That way it works with
# genesis. ... You're bad at interconnecting." · "Log in a ledger so far." · "Nope. Look needs to be on its way out. Each component Registry for each
# system is its own structural authority, that or architect in idearium. Or merge architect and loom. Loom was a mistake. So was architect system."
# Decided (his, and §5.16): each system's own component registry is the structural authority for that system; Loom is not, and is on its way out;
# Architect too. Open (his): merge Loom and Architect, or Architect into Idearium.
# Principles (the coder's, from his corrections): the map consumes Nexus, it is not a second Nexus — nothing hardcoded; every connection carries its
# provenance (declared in a manifest, observed at runtime, inferred) and when it was last seen; a measurement not read is said, never 0 (§1.2);
# replay is event replay + state reconstruction (Versionium) + causal trace; one id per system, component, run and agent call, shared by the canvases
# so a selection in one lights the same id in the others; the lineage map: genesis seed (the logged idea) → RAID request → contract → spec → components
# → hooks → code → tests → versions, with each compartment pulsing on its heartbeat.
# Canvases: wiring harness (per-system registries, wires, CFR/RFR2), pipelines (runs, files, gates, editable), agents (models, calls, resources);
# plus the lineage view and a shared timeline. COS's controls (start, stop, restart, pause, diagnose, logs) are buttons, through COS's own routes.
# Order: real data first (COS systems and pulses, each system's registry, declared wires), then provenance, controls, Versionium replay, RAID
# decision playback, lineage.

## ADDENDUM 2026-11-18 (later) — the canvases are separate, never one clump; and an idea logged: the associative lattice (his)
# His words, 2026-11-18, on the first live-data preview (three planes stacked in one picture): "Where are the other layers? I said distinct.
# Seperate. No monoliths. No clumping things." · "Never build without a preview."
# Decision (his): each canvas is its own canvas, with its own layout fit to what it shows, its own pan and zoom; they connect only by the shared id
# (a selection in one lights the same id in the others). No canvas draws another's content. A build follows only a preview he has approved.
# Idea logged (his, not yet mapped to a phase): "Like a constellation of interconnected nodes in a 3d axis. That I can navigate around. Associative
# lattice. Like neurons running synapsid through them as data or live events, passes through."
# Coder's reading, for him to correct: a fourth, navigable 3D view — nodes are the same ids (systems, components, runs, agent calls), edges their
# associations, and live events travel the edges as pulses. Open questions for him: what places a node in 3D (lineage depth, system, time, or
# learned association), and whether it replaces the lineage view or sits beside it.

## ADDENDUM 2026-11-18 (later) — the cockpit previews PINNED (his); his verdict and direction kept for when they resume
# His words on the three-canvas preview: "oh my god, fuck no. cluttered. overhwelming. hell no. going backwards. where is the flight map? this is
# way worst by far." · "also enterprise grade. worlds leading expert level. no noise, redundancy, side panels, excessive buttons over drop down
# menus. also utilize context menu for options. increments of zoom. what about each system is a world in a world map, of interconnected
# systems(nodes) in a non linear map of synapsis lighting up pathways between nodes? give me a bunch of previews." Then: "pin in this actually.
# get the pipeline built and upgraded. log all of the progress and notes."
# State when pinned: cos/ui/cockpit-preview/ (server.js on :47124, live data: COS systems/usage/engine, each registry, compartment dependsOn,
# COS ledger, Ollama metrics) holds the three-canvas version he rejected. The flight map (v3, cos/ui/flight-map-previews.html) is the one he liked.
# To resume: several previews, flight map first; no side panels; options in a context menu (right-click) and drop-downs, not button rows; zoom in
# fixed increments; systems as worlds on a non-linear map, synapses lighting the paths events take; the associative lattice (3D) as one option.
# Coder's lesson: each step after the flight map added surface instead of taking it away. Start from the flight map and subtract.

## ADDENDUM 2026-11-18 (later) — the UI is disposable, per system (his)
# His words, 2026-11-18, while the previews are pinned: "this is why the ui is meant to be disposable for each system. so we can make many,
# combine them interchange them custom make them etc."
# Coder's reading, for him to correct: a view owns no data and no logic; it reads only what the systems' own routes and registries serve
# (§5.9–5.16), so any number of views can be made, combined, swapped or made to measure without touching a system. The cockpit is therefore
# not one UI to get right but a set of disposable views over the same sources — the flight map, the worlds, the lattice, the lanes are each
# one; a rejected one is thrown away at no cost to Nexus. Consequence for the build: the data layer (cos/ui/cockpit-preview/server.js /data,
# read-only, from each system's routes) is the part kept; views are plugged on top and chosen by him.

## ADDENDUM 2026-11-18 (0.60.589) — built: gates open for a run (the whole pipeline debugged at once); Open UI in a Clear Glass compartment
# James, 2026-11-18: "Okay build it." (the Open button) · "Wouldn't it be better if we can set gates to open instead of pass, so we can have the whole pipeline debugged at once?" · "I need to be able to open idearium. I can't without opening Firefox"
# Open UI, and gates open: (1) a system that declares its UI (runtime.process.ui { kind: html, path }) is opened in its own Clear Glass compartment (window.open, agentId compartment:<name>): route POST /api/cos/systems/:name/open-ui, command `open <system>`, then the Open UI button on its card in COS Overview; Idearium declares its UI first. When Clear Glass does not answer, that is said with what to do. (2) A run with gates open (`pipeline-run <id> open`, `pipeline-resume <run> [redo] open`, body { gates: "open" }) records each failing step as the verdict it would have been ("gate open — would stop here: …") and runs the steps after it; it ends "debugged", never ok; a resume keeps its gates; the steps see {{vars.gates}}. Idearium's build takes { gates: "open" }: its test-first gate records that it would have stopped and goes on to the coders. test-pipeline-waits-for-a-system 8/8 (PW-08 new); test-plan-code-run-attention 48/48; test-cos-console 11/12 and test-cos-console-tab 3/4: CC-09 and CT1-04 (driven in Clear Glass) fail the same with the committed code (checked), the machine's, not this change's.

## ADDENDUM 2026-11-18 (0.60.590) — built: edit a gate's conditions; a debug setting per gate, decided in Emerge
# James, 2026-11-18: "Just add the ability to edit gates conditions. Not whole runs. Maybe even a debug gate type or setting? Emerge. Please stop using js. Unless it's cheaper"
# a gate's conditions edited in place, and a debug setting per gate: (1) `pipeline-gate <pipeline> <task> debug | enforce | key=value | -key` in COS's console, PATCH /api/cos/automation/pipelines/:id/tasks/:task/gate { set, unset, gate }; a typed gate's conditions go into its with; saved through the pipeline's own validation. (2) debug: true on a gate: a typed gate is decided in Emerge as always (cos/pipeline/gate.eg), its verdict kept (context, history, streak), and it answers open with would = what it decided and why "debug: would be closed — …"; a keys gate, or a step that fails outright, under a debug gate is recorded the same way and the steps after it run. Any run with such a record ends "debugged", never ok. The decision is Emerge's; the JS added is the edit route and command (HTTP plumbing) and one condition on the engine's failure path, cheaper than a call to Emerge per failure. gate.test.eg 11/11 (the debug test new), stall 2/2, runs 7/7, box 14/14, profile 2/2; test-pipeline-waits-for-a-system 9/9 (PW-09 new); test-cos-pipeline 19/21 (CP-00, CP-01 failed before).

## ADDENDUM 2026-11-19 (0.60.594) — built: a step whose gate passed is not run again (the step node stands)
# James, 2026-11-19: "Wait pipeline. Yaml file. Each block a step in the pipeline? Then any gate that has passed. Doesn't need to be run again. Reuses the same step. Like each step is a node in an associative lattice, or linear. Like the node for the step holds all the context, like a block in the yaml file or a compartment. Keep getting the pipeline built."
# a step whose gate passed is not run again: the pipeline was already a YAML node (.pipeline, each task block a step) and every step run already its own .process_step node with its whole output; now each step's inputs are a fingerprint (its step, its gate, the run's vars, what it takes from the steps before), and a step whose gate passed with the same fingerprint in an earlier run is reused: that node stands, its output read back, the step marked reused (from which run). Only a gated step is reused (a step with no gate, as NM1's build, always runs); new inputs, a failed or debug pass, reuse: false on the step, or redo run it again. The decision is Emerge's (cos/automation/reuse.eg, compiled to eg-build/reuse.js, run in the engine); the index of passed steps sits beside the runs (reuse-index.json). reuse.test.eg 2/2; test-pipeline-waits-for-a-system 10/10 (PW-10 new); test-cos-pipeline 19/21 with CP-16 intermittent (failed once, passed once, as before this change).

## ADDENDUM 2026-11-19 (later) — back to the gates; views as styles; the radial web from one origin (his; preview first)
# James, 2026-11-19, on the flight map that the Pipelines tab opened: "The fuck is this. This needs to go back to the gates. Have different
# styles. I liked the branching gates because they are agnostic. One starting point. or even the center is where it begins, and propogates
# outward like an associative web of interconnected nodes, like the lattice. like meaning making. the relationship between things. like
# components in anything. the structure of nexus, meaning making webs. also the data structure of my own mind." · "continue with the pipeline
# and emerge. i need this done asap. i figure build the smallest representable unit and expand outward."
# Done (0.60.599 in the ui): the Pipelines tab opens the gates again; the map is one click away, never the default.
# Mapped, a preview first (his "Never build without a preview"): the gate canvas has styles, chosen per view, over the same step nodes:
#  (1) branching gates (as now, agnostic, the default); (2) radial: one origin at the centre (the request, RAID's lineage root) and each
#  step and gate one ring further out by its depth, branches spreading as a web, live events travelling the edges (the lattice of
#  2026-11-18, the associative web his mind keeps). One structure, many styles: the views are disposable, the step nodes are the data.
# And the same principle for the build: the smallest representable unit first, expanded outward (NM1a, lib/file-identity.js, before NM1).

# ── ADDENDUM 2026-11-20 (0.60.614) — PC2 expanded: a method per step and per gate (built) ──
# James, 2026-11-20: "Like you can set the method or framework per gate or step. Remember the pipeline and gates are agnostic." · "framework per
# step. or pipeline. like i want it to use my framework." PC2 made a .framework a step; this lets any step and any gate carry a method without
# being one: a task's `method:` (a framework, its named steps, a text, or one per gate of the step) is resolved by COS in Emerge
# (cos/automation/method.eg) from its frameworks folder; the step reads {{vars.method}}, a typed gate with.method. Decided by his axioms: §5.8
# (composability over configuration: a field on any task, not a mode of one engine), §5.14 (the step's runner uses the text; nothing is bound
# to one framework or one system), §1.2 (a method naming what does not exist fails the task, said). First user: Idearium's build pipeline
# names his framework for the Emerge rung's gates (diagnose: Sections 3 and 4; test: Section 10), the coder's reading, to confirm with him.

# ── IDEA 2026-11-20 (his, recorded; not mapped yet) — context and intent shape the gate's function ──
# James, 2026-11-20: "Random thought. What if context and intent shaped the gates functions?" Said the same hour as "Make snapshots optional for
# gates, and maybe disable them for developer or debug gates." (built as 0.60.628, a gate's snapshot setting). The coder's reading, to confirm:
# a gate's checks are chosen by the request's intent and the context it carries, the pipeline staying the same — a debug intent gets loose gates
# (no snapshot), a release intent strict ones; it extends PC5 (a gate holds context across runs) and 0.60.614 (a step carries its method).
# Then, 2026-11-21: "Like gates are constraint fields". The coder's reading, to confirm: his Section 3's constraint field ("probabilistic
# probability, built on top of deterministic probability ... deterministic variables, invariants, principles, or primitives as a boundary") as
# the gate: its boundary the invariants (the compiler, the contract, no contradiction: hard, always); inside it a space that context and intent
# widen or narrow (debug: no snapshot; release: snapshot and every test); an output inside the field passes, and how far outside is a measured
# tension (sigma, delta: CF1). Joins WARP 2 and the constraint relational field (his order, item 3; EM2, RF1, CF1). 0.60.628's snapshot setting
# and 0.60.614's method per gate are its first, crude form.

## ADDENDUM 0.60.630 (2026-11-21) — PC8: a pipeline opens at once
# James, 2026-11-21: "Slow to open. A pipeline's details wait about 10 seconds on the step-timing data before anything draws. Optional data is holding up the main screen, which is a bug."
# cos/ui/automation/engine.js open(): the steps draw first (124 ms), the baseline (~10 s) is fetched after and fills the bars. The route's own
# speed is still open (cos/pipeline/index.js baseline()).

## ADDENDUM 2026-11-21 — PC_D15 a pipeline has a type (his); any box is anything (his); the preview of both
# James, 2026-11-21: "i need to be able to change the type of pipeline, like from state dependant linear stepwise, to stateless associative
# lattice and node based gates" · asked what each type does when it runs: "One the constraint relation field map. Another one that starts from
# the center and propagates outward. Then we have the normal branching one that can be used for a million things like we have logged to phase."
# · on box kinds: "Anything. All of them. Node files. Programmable steps. Instructions. Look at all the phases" · on variables: "I don't know
# what they even are" (so they are shown as the pipeline's Inputs, said in plain words, inside the Pipeline panel).
# Decided (his): three types, kept on the pipeline as `kind`: branching (stepwise; what COS's engine runs today), radial (from the origin
# outward, ring by ring), field (the constraint relational field: gates are the nodes, each relating the step it reads to the steps it admits).
# Previewed in cos/ui/run-console-preview (drawn and edited; saved with the pipeline). OPEN, the coder's reading to confirm with him: the run order
# of radial (a ring runs when the ring inside it passed) and of the field (a step runs when every gate around it holds) in the engine
# (cos/automation/pipeline.js); a box can be a catalogue step, a system, another pipeline (opens in place: PC4's recursion), a phase (built by
# the build pipeline for that phase) or a component (from its system's own registry).

# ── ADDENDUM 2026-11-24 (map; nothing built by it) — PC18 expanded: the model server downloads, wears hats, routes, shows a bar per request ──
# James, 2026-11-24, after uninstalling Ollama's app: "though we just replace ollama with our own. i uninstalled ollama aplpicatino" · "It's the
# server in cos. Model server" · "i want the timeline working, with the steps and gates hooked into the new model server. rewind engine,
# snapshots, flight recorder" · "a timeline for each timeline, contract." · "Need to have a download manager for that. The engines. And models.
# Now that we aren't using ollama. We need to have the model server integrated with hats; agent tools, etc. What ever we can have the 3b do. We
# can have progress bars for each request. With green chunks for compiled. Grey for gaps, and red for error, bug or missing. That way we can
# have non linear pipeline generation. What ever model can handle the request handles the request." · asked where each lives: "model server.
# lib folder and cos automation engine and pipelin" (read as: downloads → the model server; hats → lib/; the bars → COS's automation engine and
# pipeline canvas; to confirm, PC_D18).
# Found, the coder's (checked 2026-11-24 on his PC): the model server is inference/ (Emerge: models.eg, settings.eg, server.eg, inference.eg),
# one llama-server per model on 9931 + i, reached by COS's /api/cos/systems/inference/hook/<hook>. Removing Ollama's app took its engine
# (AppData/Local/Programs/Ollama/lib/ollama/llama-server.exe, gone) and the model files (~/.ollama/models is 40 KB: the manifests, no blobs);
# no llama-server and no .gguf anywhere on D: or his user folder (6 deep). COS says "no system \"inference\" is declared (its compartment.json
# has no runtime.process)". settings.eg already names the recorder (record, keep_days 30, slot_save, replay, hook: "Idearium rewind engine and
# flight recorder"); nothing reads it yet. So nothing local answers today, and the order below starts with getting an engine and a model back.
# Said: PC18's correction asked that ours be benchmarked against the Ollama path before Ollama's app was retired. The app is gone, so that
# benchmark cannot run as written; the comparison left is against the runs already recorded on the Ollama path (EMB8's logged runs).
# Drift, said: PC18's files_added named cos/inference/*; what was built is inference/ at the root, its own system (§5.9). Kept as built.
# Axioms: §3.3 (map before build), §8.6 (reuse: everything below names what it stands on), §5.9–§5.16 (each system's own data and hooks; the
# model server reached only through its drawbridge), §17.13 (Emerge, no new JS but where JS is replaced), §1.2 (each gap and fallback said).
phases_addendum_2026_11_24_model_server:
  PC19_the_model_server_downloads_its_engines_and_models:
    status: OPEN
    layer: backend
    james: '"Need to have a download manager for that. The engines. And models. Now that we aren''t using ollama." · "model server."'
    depends_on: [PC18_cos_runs_the_model_server]
    files: [inference/catalog.eg, inference/downloads.eg, inference/inference.eg, inference/models.eg, inference/test/downloads.test.eg]
    reuse: "clear-glass/src/downloads/store.js's shape (a list of downloads, each with state), read not imported (§5.9); models.eg's GGUF reading; lib/versionium-record.js for each file landed"
    does: >-
      The model server owns its downloads. A catalog (catalog.eg: engines, llama.cpp's server for this PC's card — CUDA on the GTX 1650, else CPU;
      models, GGUF files by name, size and checksum, smallest first: a 3b coder before a 7b before deepseek-coder-v2:16b) and a downloader
      (downloads.eg): each download is a node file (inference/data/downloads/<id>.download: source, bytes done, bytes total, checksum, state) so a
      download in flight resumes from disk after a restart (his 2026-11-14 persistence law), resumes by byte range, is checked by sha256 before
      use, and lands in the model server's own store. New in hooks: catalog, download, progress, cancel. models.eg finds the store and the
      engine there first, Ollama's old folders last.
    gap: "Emerge needs a fetch to a file with a byte range and a sha256 (a runtime capability, built into Emerge per §17.13, said if missing)"
    proof: "downloads.test.eg on a stand-in server: a download stopped halfway resumes from its .download file; a wrong checksum refuses the file; then his PC: the engine and one 3b model downloaded, models() lists it"
  PC20_cos_runs_the_inference_system:
    status: OPEN
    layer: backend
    depends_on: [PC19_the_model_server_downloads_its_engines_and_models]
    files: [inference/compartment.json, inference/server.eg, inference/test/server.test.eg]
    reuse: "the supervisor's start, restart and circuit (PC18); runtime.process, as every system declares it"
    does: "inference/compartment.json declares its process, so COS starts the model server, starts each model that is on (settings: on, port, slots), restarts one that crashes, and stops them with COS"
    proof: "COS's /api/cos/systems/inference answers; the 3b's llama-server answers /health on its port; a killed one is restarted"
  PC21_hats_and_agent_tools_on_the_model_server:
    status: OPEN
    layer: backend
    james: '"We need to have the model server integrated with hats; agent tools, etc. What ever we can have the 3b do." · "lib folder"'
    depends_on: [PC20_cos_runs_the_inference_system]
    files: [inference/inference.eg, lib/hat-forge.js, lib/agent-tools/tool-catalog.js, lib/agent-tool-call.js, inference/test/infer.test.eg]
    reuse: "lib/hat-forge.js (a hat: base agent + scoped tools + persona); lib/agent-tools' catalog; lib/agent-tool-call.js's parser; ollama/lib/dispatch.js's job lifecycle, moved to the model server where it is the model server's"
    does: >-
      A new in hook, infer { hat, request, tools }: the hat composed by the hat forge, its scoped tools offered to the local model, a tool call in
      its reply parsed and run through the tool's own door, the answer leaving by the one out hook. Any hat on any local model.
    proof: "a hat with one tool, on the 3b: it asks for the tool, the tool runs, the answer comes back with the tool's result in it"
  PC22_each_request_to_the_smallest_model_that_can:
    status: OPEN
    layer: backend
    james: '"What ever model can handle the request handles the request."'
    depends_on: [PC21_hats_and_agent_tools_on_the_model_server]
    files: [lib/model-door.js, lib/agent-capability-profile.js, cos/automation/ladder.eg]
    reuse: "lib/model-door.js (the one door for which model); lib/agent-capability-profile.js (what each model has really done, measured); cos/automation/ladder.eg (the rungs); PC17's fit by memory; COS's resource manager (cos/manager/resources.js) extended with VRAM and admission, as PC18's correction of 2026-11-24 decided, never a second manager"
    does: "a request goes to the smallest local model whose measured record says it can do that kind of request, then up the ladder (a bigger local model, Guardian, Claude last), each climb said with why"
    proof: "a request the 3b has passed before stays on the 3b; one it has failed goes up one rung, said"
  PC23_a_request_a_bar_of_chunks:
    status: "OPEN — preview first (his rule: never build UI without a live-data preview and his yes)"
    layer: ui
    james: '"progress bars for each request. With green chunks for compiled. Grey for gaps, and red for error, bug or missing. That way we can have non linear pipeline generation." · "cos automation engine and pipelin"'
    depends_on: [PC22_each_request_to_the_smallest_model_that_can]
    files: [cos/ui/request-bars-preview/index.html, cos/pipeline/box.eg, cos/pipeline/gate.eg, cos/ui/automation/engine.js]
    reuse: "the request files and RAID's contract per request (0.60.464–476); a gate's PASS/FAILED; the canvas's bars (0.60.630); PC_D15's field and radial kinds; the run canvas preview (cos/ui/run-canvas-preview, branch cg-profiles, 98a6348ee: each gate a node, the timeline, his 'it needs to be the visual canvas. not a eye sore of a list') and the flight map (3f3e6b5aa); RL_D10 (a red chunk, a gap or bug, becomes an end state of its own, decomposed the same way)"
    does: >-
      Each request is a bar of chunks: green compiled (its gate passed), grey a gap (not done), red an error, a bug or something missing. A free
      model takes any grey chunk it fits (PC22), in any order; a red chunk goes back as a gap with its why. The bar fills wherever work lands:
      non-linear generation. Shown in COS's automation engine and on the pipeline canvas.
    proof: "the preview on a real request's chunks, shown to him; then the bars live on a run where two models fill different chunks"
  PC24_every_request_a_timeline:
    status: "OPEN — which timeline is his (PC_D18 b)"
    layer: backend
    james: '"i want the timeline working, with the steps and gates hooked into the new model server. rewind engine, snapshots, flight recorder" · "a timeline for each timeline, contract."'
    depends_on: [PC23_a_request_a_bar_of_chunks, PC20_cos_runs_the_inference_system]
    files: [inference/recorder.eg, cos/pipeline/contract.eg, cos/foundation/snapshot.js, ollama/lib/tape.js]
    decided_by: "PC18's decided_2026_11_24_its_home_and_engine (his): the flight recorder and rewind of every call are ours, Idearium's hooked in"
    reuse: "settings.eg's recorder block; ollama/lib/tape.js (every model call a frame, a run replayed without the model), moved to the model server; llama-server's --slot-save-path (the model's own state, the rewind hook); cos/foundation/snapshot.js SnapshotEngine; GS1's checkpoint at each gate PASS; clear-glass/src/rewind/engine.js; Versionium; the flight recorder (/api/repos/<uuid>/flight/<run>)"
    does: >-
      Every chunk that changes colour is an event on its timeline, kept as files (no second store): the model call's frame, the gate's verdict, a
      snapshot at each PASS (a gate's snapshot setting, 0.60.628, still holds), the model's slot saved. Rewind goes back to any gate's last good
      state; replay runs a recorded request again without the model. Timelines are kept by day.
    proof: "a request run, rewound to its second gate, replayed from the tape to the same bar"
  PC25_the_bridge_moves_into_the_model_server:
    status: OPEN
    layer: backend
    james: '"migrate the bridge into the model server/" (2026-11-24, after "Yes move to the model" for hats, and with the coder''s split asked of him)'
    depends_on: [PC19_the_model_server_downloads_its_engines_and_models]
    files: [inference/compartment.json, inference/bridge/server.js, inference/bridge/config.js, inference/bridge/lib/ollama-client.js, inference/bridge/ollama-runtime.js, inference/bridge/lib/model-inventory.js, inference/bridge/routes/ollama-compat.js, cos/build/emerge-build.js, clear-glass/src/copilot/bridge.js, guardian/lib/dispatcher.js, idearium/agent-suite/index.js, lib/cli/nexus-repl.js, lib/cli/nexus.js, lib/hat-seed-ollama-personalities.js, lib/vector-memory.js, orchestrator/lib/autonomous-loop.js]
    reuse: "the whole Ollama bridge (3,756 lines: jobs, dispatch, the one line of turns, the tape, idle unload, streaming, the Ollama-shaped routes), moved not rewritten; inference/server.eg start/stop for each model's llama-server; models.eg's list"
    why: >-
      Found 2026-11-24: Nexus's build step (cos/build/build-phase.js → emerge-build.js) reaches every model through the bridge (:3749 /api/jobs),
      and the bridge speaks Ollama's API to :11434. With Ollama's app gone nothing answers, so the pipeline cannot ask any model anything.
      149 files name the bridge; the move is staged so every caller keeps working at each step.
    slices:
      a_the_move: >-
        ollama/ moves to inference/bridge/ (git mv, its history kept); inference/compartment.json declares its process (the bridge's server.js,
        port 3749, health, heartbeat), ollama/compartment.json retired with it. Callers that reach the bridge by route are unchanged (same port,
        same routes). The 12 non-test files and the tests that require its files by path are pointed at the new path (a path change, nothing
        else); each one is a sovereignty breach named for slice c.
      b_the_engine_swap: >-
        The bridge's one door to a model (lib/ollama-client.js: generate, chat with tools, tags, ps) speaks llama-server: /completion and
        /v1/chat/completions on the model's own port from the model server's settings, the model started by server.eg when it is asked for and
        not running, /api/tags answered from models.eg. Ollama stays as a second backend plugin (PC_D17) when its server answers. The /ollama
        compatibility route keeps Ollama's shape for clients pointed at it.
      c_callers_on_routes: >-
        Each system that requires the bridge's files (Clear Glass's copilot bridge, Guardian's dispatcher, Idearium's agent suite, the CLI,
        lib/vector-memory, the Orchestrator's loop) reaches it through its routes instead, one system at a time (§5.9–§5.16); "ollama-bridge"
        renamed where it names the model server's process.
    proof: "a: the bridge's own tests pass from inference/bridge/, COS starts it from inference/compartment.json, :3749/health answers; b: a job on the 3b through :3749/api/jobs answers from llama-server, and one build round of build-phase.js runs on it; c: per system, its tests pass with no require of inference/bridge/"
  PC26_lineage_is_the_canvas:
    status: OPEN
    layer: ui
    james: '"looking better so far. it is supposed to show choices as branches, like lineage is meant to be a part of the canvas like branching into new steps, new paths, parrell processes" (2026-11-25, on the EMB10 run with three adversaries)'
    depends_on: [PC8_operate_a_pipeline]
    files: [cos/ui/run-console-preview/server.js, cos/ui/automation/index.html]
    reuse: "the build record (cos/data/build/cbuild-*.jsonl: each piece, its tries, the model of each, its helpers, its verdicts), the gap tree the canvas already draws (served_by → contains_key_in_obj → contains_key), the Lineage panel's routes (/api/cos/view/lineage); no new store"
    does: >-
      Lineage drawn on the canvas itself, not in a side panel: from each step, its choices branch. A try refused is a branch that ends (its
      verdict on it, red); the next try grows beside it, its model named; a piece split into helpers is a new path down; the adversary's three
      readers and parallel steps are side by side, joined where they merge; the path that passed is the trunk, lit. The panel keeps the
      ledger history and repo lineage as text.
    order: "backend first (the record's tries and helpers as a tree from /api/cos/view), then a live-data preview shown to him, built only on his yes (preview before build)"
    proof: "the EMB10 run e1968c61 drawn: served_by's 60 tries as branches by model, its helpers as paths, contains_key's adversary readers in parallel; each branch opens its try (prompt, body, verdict)"
    expanded_2026_11_25: >-
      James, the same day: "like this will show the entire process for the llms, direction of each pipeline, learning process, to name some, i
      want this to be agnostic still. think of that this could do. entire thought processes, reasoning behind desicion, frameworks, problems
      solving processes, problem docomposition, iteration, cross domain synthesis using parrallel pipelinelines, to match identicle primitives,
      principles, patterns, or invariants. the overlap. like my mind, my framework., look at it". His framework already names it (innovation
      toolkit addendum, "The direction of thought"): "Vectors are the yarn of cognition, linking ideas, systems, subsystems, domains, and
      experiences" · "Yarn Mapping: Visualize vectors as threads connecting nodes of meaning across systems". So the canvas draws his yarn,
      agnostic of what made it: one record of nodes (a thought, a step, a try, a decision, a primitive) and vectors between them, each vector one
      of his kinds. Divergence = exploration (choices, tries, branches). Convergence = synthesis (merges; a helper joining its parent). Oscillation
      = flow (iteration, create and critique, his "Iterate & Integrate" feeding back to the root). Colliding = tension (the adversary's readers
      disagreeing, his Part 4 "Tension as Fuel"). Parallel = amplification (parallel processes). Perpendicular = contrast (another domain).
      Each node carries why it was chosen (the reasoning behind the decision). Sources plug in, none special: the build record (the LLMs), a
      pipeline run, RAID's decisions, Idearium's ideas, a framework trial, his notebook. The overlap: parallel pipelines, one per domain (his
      meta domains), each decompose the same problem; nodes whose primitive, principle, pattern or invariant is identical across them are
      drawn joined, and counted by his own rule (Part 3): one an anomaly, two a coincidence, three an invariant; the deviation between them in
      sigmas, the gap in deltas (T4).
    slices:
      a_the_yarn_record: "the agnostic record (nodes, vectors with his six kinds, why) as an Emerge contract; the build record read into it first (tries diverge, helpers converge, the adversary collides); /api/cos/view/yarn"
      b_drawn_on_the_canvas: "the yarn drawn on the canvas, each kind its own line; the trunk (the path that passed) lit; a node opens its content and its why. Preview first, on e1968c61"
      c_more_sources: "pipeline runs, RAID's decisions, Idearium's ideas, a framework trial: each a plugin writing the same record"
      not_eravos_2026_11_25: >-
        His, the same day, shown a live-data preview of the canvas (the EMB10 run as boxes and threads, with lenses and add-a-step) after the
        coder suggested ERAVOS's canvas as its home: "Not eravos". The canvas is COS's own, in its Automation tab (PC8); ERAVOS stays apart.
      grows_from_the_gates_2026_11_25: >-
        His, after the coder drew a separate preview: "No. We have the canvas. What is hard to understand. Anything starts as the first step.
        Then everything branches from that one, one by one from the gates." So no new view: COS's canvas (PC8) is the lineage. A run starts as
        one step; each gate's decision adds the next step(s) to the running run as branches (a refusal adds a retry beside it, a split adds
        its helpers below, the adversary adds its readers in parallel, a pass joins back), and the canvas draws them as it draws any step.
        Found the same day: today a pipeline's steps are all declared before it runs, and a gate only takes or skips a branch already there
        ("when", "onFail"); the build hides its branching (18 pieces, 110 tries, the helpers, the adversary) inside one script step, so the
        canvas shows one box. The slices this makes: (1) a gate may add steps to its own running run (pipeline.js, saved to the run's file,
        each with depends_on its parent: persistence); (2) the build reports each piece, try and helper as such a step instead of hiding them;
        (3) the canvas draws added steps live. Backend first; nothing new to build in the UI if the canvas already draws any step.
        Then, his: "Like a tree of branches. Like each event, step, decision, action, like nothing in nexus wouldn't be explicit". So the rule:
        every event, step, decision and action in Nexus is a node with its parent, on one tree from the first step (a model call, a gate's
        verdict, RAID's yes or no, the supervisor's act, a failure mode); nothing happens that is not on it. PC28's cause and effect is this
        tree's edges; PG5's RAID decisions and reports are its decision nodes.
        Then, his: "Everything is. Macros. Frameworks. All of it. Look at all the phases." The coder's census of all 261 maps (1,379 phases),
        2026-11-25: 95 phases name a macro, framework, event, ledger, lineage, tree, trace, timeline, snapshot or record; 93 are not built. He
        has said this before: L15 (2026-11-17) "Using the pipeline as a dicision tree. Like dynamic, like a lineage. A visual canvas ... like
        the pipeline is everything", and L16's contract ledger "from the moment the compartment gets created". The open phases are pieces of
        this one tree, by family:
          the tree itself: L15, L16, KT1 (one semantic tree, observations at any node), FR7 (the causal record: phase → run → attempt →
            change → test → version), PC24 (every request a timeline), TL3 (one timeline per work, a projection, never a second record)
          events as nodes: SW3 (an event per call in each system's own ledger), VC1 (a change per event; shelved), CE5, MR2, MR9, OL9
          macros and frameworks as steps: CM1 (the pipeline absorbs macros and automation), PC2 (procedures and frameworks as steps), Q2,
            SF2, KB4, PL8, MR6, MG7, UM1, SN1, CM3, BM1
          rewind, snapshot and branch: CP5a, CP5c, CP5d (rewind and branch a compartment), GW7, GW11, TL4, CV3, DBG5, IF4, OL8, L12, DK7, F2
          decisions and provenance: PV1, EW1, RA1 (root cause through provenance), APV0, APV4, GW3, SE2, FI8, PS1
          ledgers: PF0, JL1, MK1, MK2, GC6, SL11, IN2, CIE3, EQ2, EQ5, PIC2, OL10, FR1, FR6, CN11, VE1, VE4, VE6, GD5c, FX1, PD2, MT1, MT6, AC9
        The rule that joins them, his and TL3's: one tree, every node a file with its parent (persistence), each system writing its own
        nodes (sovereignty, AXIOMS §5.16), the canvas and every timeline a view of it, never a second record. Each family's phases are
        expanded into this tree, not written again (phase-ledger covers).
      d_the_overlap: "parallel pipelines per domain on one problem; identical primitives, principles, patterns or invariants matched and joined; counted anomaly, coincidence, invariant; sigma and delta shown. Its proof is registered in FRAMEWORK-THREADS before it runs"
  PC27_each_output_measured_by_his_equations:
    status: OPEN
    layer: backend
    james: '"I was thinking, we need metrics for each output. so then we could mathmatically quantify each output. thats simple to understand if its incorrect, as long as we have the math, and the variables for the equations correct in relation to the metrics. look at the intelligence system and my framework. some expiremental equations, i have worked on a bit" (2026-11-25)'
    depends_on: [PC26_lineage_is_the_canvas]
    files: [intelligence/equations.eg, intelligence/test/equations.test.eg, cos/ui/run-console-preview/server.js]
    reuse: "his equations (innovation toolkit addendum Parts 2, 3, 5, 6 and Section 6); the intelligence system's measures (rfr2 delta and sigma, baseline.js, the crystallizer's three-and-lift, snr.js fidelity, adversarial.js, friction.js); the build record and the adversary gate's verdicts as the data; no new store"
    does: >-
      Every output (a node of the yarn, PC26) carries its metrics, each variable of his equations defined as one measurement, so a wrong output
      and a wrong equation can both be seen. For a piece the pipeline builds: Fidelity = the share of its contract's examples and the adversary's
      agreed cases it passes; Alignment = its parent passes with it (it serves the sentence it was written for); Expansion = the new cases it
      added to its contract, and the pieces that reuse it; Signal = Alignment + Fidelity + Expansion (his Part 5). Tension = the readers'
      disagreement, tensions over cases (his Part 4). Slope = the change in Fidelity from one try to the next (the learning gradient). Flow =
      Expansion × Contraction × Balance (Part 2): distinct bodies tried, refusals acted on, and how even the two are. Weighting = Urgency ×
      Importance × Fidelity × Slope and Leverage = Tension × Weight × f(Slope) (Part 6, Section 6) rank which gap is worked next. Cost beside
      them: tokens, seconds, the model's size (his "the smallest model to complete the task"). The equations live in Emerge, one function each.
    rule: >-
      An equation is a claim: it is tested, not trusted. Each is registered in FRAMEWORK-THREADS with a prediction before it is used to decide
      anything (for example: pieces with higher Signal are refused less by the adversary afterwards), measured on real runs, and marked held or
      failed. A failed one is kept and its variables re-examined (his: "as long as we have the math, and the variables for the equations correct").
      Known mismatch to settle first: friction.js's slope only amplifies, his f(Slope) inverts past a threshold (toolkit × intelligence, row 34).
    proof: "EMB10 run e1968c61's pieces each with Fidelity, Alignment, Expansion, Signal, Tension, Slope and cost; the prediction registered before, and its result on the next run"
    decided_2026_11_25: >-
      Asked which reading of Priority (÷ Urgency, or Weighting's × Urgency, or a typo) and of Signal (sum as written, Fidelity as a gate, or a
      product) he meant, he answered: "we can test these. nexus is my mind externalized. the entire project is a projection" · "we are figuring
      these out. i can give you the original framework". So no reading is chosen: each is a competing form, all computed side by side on the same
      outputs, and the data decides which predicts best (which ranks the gaps that pass first; which scores the outputs the adversary later
      refuses lowest). Every form and its prediction is registered in FRAMEWORK-THREADS before the run. His original framework, when he gives it,
      is the source the forms are checked against.
    his_original_2026_11_25: >-
      He gave it the same day, with: "None of this is an undeniable fact that can't be scrutinized, in fact, I welcome the opportunity to adjust
      my models" · "These are consistent patterns, invariants, and methods that I have tested" · "truth and epistemology are what expand
      humanity". The repo copy (docs/innovation-toolkit-addendum.md) matched it but for two lines, added there. Only the framework went into
      the repo; what he shared of his life stays his.
    equations: >-
      Each of his, its variables as measurements on a pipeline output, and the claim that tests it (registered before use; the coder's reading
      of each variable is marked as the coder's and is itself under test).
      (1) Signal = Alignment + Fidelity + Expansion (Part 5): Alignment = its parent passes with it; Fidelity = examples and agreed adversary
      cases passed / all; Expansion = cases it added + pieces reusing it. Claim: higher Signal, fewer later refusals. Forms: sum, Fidelity × (A+E), product.
      (2) Flow = Expansion × Contraction × Balance (Part 2): distinct bodies tried; refusals acted on (the next try changes what was refused);
      1 − |E − C| / (E + C). Claim: higher Flow, fewer tries to pass.
      (3) Gap counting (Part 3): a failure mode seen once an anomaly, twice a coincidence, three times an invariant, its deviation in sigmas, the
      gap in deltas. Claim: an invariant failure mode, once fixed, removes more later failures than an anomaly fixed. Already code: the crystallizer.
      (4) Idea Vector = Direction × Magnitude = Tension × Emergence: per try, Direction = toward or away from passing (Fidelity's sign of change),
      Magnitude = its size; Tension = readers' disagreement; Emergence = new cases. Leverage of a Node = Σ(vector contributions × f(slope) × weight):
      a piece's leverage over the tries and pieces that touch it. Claim: high-leverage nodes are the ones whose fix unblocks most.
      (5) Priority = (Efficiency + Effectiveness) / Urgency and Weighting = Urgency × Importance × Fidelity × Slope (Part 6): Efficiency = pieces
      unblocked per token; Effectiveness = pieces downstream of it; Urgency = its depth on the critical path; Importance = what depends on it;
      Slope = Fidelity's change per try. Claim: ordering gaps by it finishes a phase in fewer tries than the order today. Both forms, side by side.
      (6) Leverage = Tension × Weight × f(Slope), f rising then inverting past a threshold (Section 6); Novel Leverage = that − tolerance; slope
      tolerance = certainty + structure. Claim: the threshold is findable: tries past it stop gaining. friction.js is checked against it.
      (7) Data leverage gradient = Discomfort + epistemic questioning (Section 10): the adversary's refusals and tensions per output. Claim:
      outputs that drew more of them and then passed break less later.
      (8) Creativity space = slopes + gaps/free space (Part 1) and Meaning = T × effort = E1 × G × E2 × C2 (Section 6): not measured until he
      says what E1, G, E2 and C2 are.
  PC28_the_pipeline_observes_itself:
    status: OPEN
    layer: backend
    james: '"just getting the pipeline built. we can have everhing in the pipleline. the resource monitor. events in the event ledger, failure mode reports. cause and effect from the event." (2026-11-25) · before it: "not duel boot. also we can use qumu in cos for the development."'
    depends_on: [PC8_operate_a_pipeline]
    files: [cos/automation/pipeline.js, cos/manager/resources.js, cortex/boot.js]
    reuse: "each step's own event ledger (runs/<run>/<step>.process_step, 0.60.538, his 'need an event ledger per step'); resources.js's per-compartment samples with baseline and sigma; Cortex's failure-mode intake (POST /api/failure-modes); the automation.pipeline.task events already emitted"
    does: >-
      Everything a run does is in its own record. Each step's ledger also carries the resources while it ran (RAM, VRAM, CPU, each model
      engine's, from resources.js) and every model call (model, tokens, seconds, verdict). A failed step files its failure mode with Cortex,
      with the step's ledger as its evidence, and Cortex's count (anomaly, coincidence, invariant) comes back onto the step. Cause and effect:
      each event names the event that caused it (a refusal names the try, the next try names the refusal it answers, a slow call names the
      memory pressure it ran under), so any outcome can be walked back to its causes; the canvas draws these as PC26's threads.
    later: >-
      His: a QEMU virtual machine as a COS compartment, a small Linux to develop COS-as-OS in (cgroups, freeze and thaw, its own swap), no dual
      boot. Recorded, not started: after the pipeline builds itself.
    proof: "an EMB10 run whose steps each hold their resource samples and model calls; a refused piece walked back through its causes to the event that started it; one failure mode filed by the run itself and counted by Cortex"
  PC29_copilot_orchestrates_nexus:
    status: OPEN
    layer: backend
    james: '"Need copilot to orchastrate nexus." (2026-11-25); asked which, he chose "Nexus''s Copilot" (the service on :3750, his, the pane in Clear Glass). Before it: "everything goes to the pipeline. each request." · "This is meant to be autonoius"'
    depends_on: [PC26_lineage_is_the_canvas]
    files: [copilot/tool-runtime.js, copilot/server.js, copilot/intents.js]
    reuse: "COS's pipeline door (/api/cos/automation/pipelines, /pipeline-runs, run, continue, cancel), its event stream (/api/cos/events), RAID (every act with proof), the growing run (PC26 slices 1, 1b), Copilot's own intents and tool runtime; Copilot reaches COS only by route (§5.9-§5.16)"
    does: >-
      Copilot orchestrates Nexus through the pipeline. a) Its tools: list pipelines, run one (with its input), read a run as its tree (each
      step, its parent, why, verdict), continue, cancel: COS's own routes, each act Copilot's, said as "agent:copilot". b) A request is a run:
      what he asks Copilot (build a phase, fix a failure, "build EMB10") starts the matching pipeline in COS, the request its first step.
      c) It watches: on COS's events, a run that failed and was not recovered is Copilot's to look at; it reads the tree, decides the next
      branch (a different model, a diagnosis, a smaller piece) and asks RAID with the run's evidence before starting it; what it cannot
      decide goes to him, with the readings.
    proof: "a: from Copilot, list pipelines and read EMB10's last run as its tree; b: asking Copilot \"build EMB10\" starts the EMB10 pipeline in COS; c: an unrecovered failure seen and a next branch proposed through RAID, with its evidence"
    expanded_2026_11_26: >-
      His, after slice b: "No \"build emb10.\" I'm not remebering that. Copilot needs to be able to search nexus. When I ask about a phase,
      performance, debugging. Like needs to be able to figure out what I need from nexus and build what nexus cant do currently. Like I do
      with you." Measured the same night: asked "where is EMB10 at? is it built yet and what is it stuck on?", Copilot answered from its
      general context ("No specific details are provided about what EMB10 is stuck on", recent events, "Ollama: Not running") while the
      answer was on disk (EMB10's ledger and map, its build record: 13 of 18 pieces, served_by held at 110 tries; its run; its failure modes).
      d) Copilot looks before it answers: a question naming a phase, a run, a system, performance or a failure gathers Nexus's own records
         first, deterministically (the phase's map entry and ledger, its last build record and pipeline run as a tree, its failure modes, the
         benchmarks, the resources), and the model answers from them, naming where each fact came from; commands are never his to remember.
      e) What Nexus cannot do goes to Idearium's His request pipeline (his words → intent → phase → build), the gap named, and Copilot says
         what was started; the coder's interventions are its first inputs (UD9).
  PC_D18_what_he_meant_2026_11_24:
    status: "OPEN — his"
    readings:
      a_where_hats_live: "(a) lib/ as he said, where hat-forge.js is today; (b) the model server's own folder. §5.9 says lib/ is not a home for what a system uses; his word and the axiom differ, so it is his"
      b_which_timeline: "(a) one per pipeline and one per contract; (b) one per contract only, written to fulfilled; (c) timelines inside timelines: a Nexus-wide one by day holding each pipeline's and contract's own"
      c_what_a_chunk_is: "(a) a step; (b) a file the request writes; (c) a gate check"
      d_the_engine_download: "llama.cpp's own release (GitHub, the CUDA build for the GTX 1650), confirmed by him before the first download"
    decided_2026_11_24:
      a_where_hats_live: 'DECIDED (his): the model server''s own folder. "Yes move to the model." (§5.9: lib/ is not a home for what one system uses)'
      d_the_engine_download: >-
        DECIDED (his): llama.cpp b12716, CUDA 12.4 (llama-b12716-bin-win-cuda-12.4-x64.zip 358.6 MB and cudart-llama-bin-win-cuda-12.4-x64.zip
        391.4 MB), sha256 checked against the release; unpacked first into inference/data/engines/llama.cpp/b12716-cuda-12.4/, then moved by his word into the old Ollama folder,
        C:/Users/horri/AppData/Local/Programs/Ollama/lib/ollama/ ("It should be in the old ollama folder"), where models.eg already looks; the
        model server's models hook, through COS, names it there. The zips stay in the first folder. His words: "Download CUDA 12.4.
        Not Vulkan. And don't download both yet." · "I'd keep the backend swappable: CUDA 12.4 = primary NVIDIA backend. Vulkan = fallback and
        benchmark candidate. CPU = fallback when GPU execution isn't viable. Then COS can measure actual throughput, latency, GPU utilization and
        memory pressure rather than assuming CUDA wins." · "Your GTX 1650 has only 4 GB VRAM ... You'll likely need partial GPU offloading."
        (gpu_layers per model, settings.eg). The coder's error, said: the engine was first put at "about 30 MB"; the CUDA build is 750 MB.
    recommended_2026_11_24_not_yet_his: >-
      The coder's split, asked of him and not yet answered: Ollama's system (model list, dispatch, idle unload, the tape) moves into the model
      server, Ollama itself an engine plugin; Copilot stays its own system (a client of the model server, its hat kept there); Idearium's
      pipeline tools move to COS (his 2026-11-17 rule); agent tools go to the systems they act on, each a hook in that system's component
      registry, the model server keeping only which hooks each hat may use (§5.16).

# ── ADDENDUM 0.60.648 (2026-11-24) — PC25 b built: the bridge's model calls go to our own model server ──
# James, 2026-11-24: "migrate the bridge into the model server/" · "i just want to get back to the pipeline". ollama/lib/ollama-client.js (changed, no
# new file, §17.13): a model the model server holds (its models hook, through COS's drawbridge, §5.16) runs on that model's llama-server, started
# detached from the launch hook's plan (inference.eg launch: engine, server.eg args_for from the model's own settings, port) when it does not
# answer; Ollama is the second backend (PC_D17). models.eg names "ollama.com/…" by the ladder's short name. Proof: the 3b answered through the
# bridge's door on the GTX 1650 (61 tokens/s warm; the first request ~100 s while the engine warms); inference tests 10/10; the bridge's two failing
# tests (reply continuation, OA-003) fail the same on main. Open: chat with tools still goes to Ollama's /api/chat; the slot split (-np divides -c:
# the 3b's 4096 over 3 slots is 1,365 tokens a request) to set with him in COS › Settings › Model server; a full build round on the 3b.

# ── ADDENDUM 0.60.649 (2026-11-24) — PC25 b: a model keeps its port; the bridge checks who answers ──
# James, 2026-11-24: "if its repairing itself. why is it stopping?" Found on the first end-to-end run on the model server: ports by place in the
# list moved the 3b when DeepSeek arrived, and DeepSeek's port kept answering with the 3b, so every wall climbed back to the 3b and the repair
# loop retried the same model until a round gained nothing. settings.eg port_of: a port from the model's name (sha256, 9931 + n mod 1000, the next
# free on a clash); the bridge uses an answering engine only when its /v1/models names that model's file. Proof: settings test (a model keeps its
# port when another is added); 11/11 inference tests; bridge tests pass.

# ── ADDENDUM 0.60.650 (2026-11-24) — PC20 built: COS's supervisor owns the model engines ──
# James, 2026-11-24: "can you hook that into cos superviser?" (after two leftover 3b engines held 3.8 GB and only COS's account could end them).
# inference.eg declare(): one process per model that is on (cmd the engine, args server.eg args_for, healthUrl its port, onDemand) written to
# inference/inference.cos (this PC's paths, gitignored), on each launch; supervisor.js rescan() + POST /api/cos/systems/rescan declare a new
# process live (never a running one, nothing started); the bridge rescans and touches the engine's process instead of spawning it. Reuse: the
# supervisor's declare (SC4), touch and idle reaper (on demand), restart and circuit. Proof: SV-09 (rescan adds live, starts nothing), SV-08 counts
# the engines apart; SV-04 flaky before this (1 in 3). Open: COS's restart (his act) to run it; files_added named cos/inference/*, built as inference/.

# ── ADDENDUM 0.60.651 (2026-11-24) — PC8 slice d built: the run console is COS's Automation tab ──
# James, 2026-11-24: "build the tab. i need to be able to use the pipeline alos" · "now the preview can strip it, no ui should have what the backend
# doesn't. ui should float on top". cos/ui/automation/console.html, made from the preview: every read and act a COS route (automation pipelines,
# pipeline-runs, run/pause/continue/cancel, systems, usage, lab, console, cli, catalogue); what COS has no route for is stripped (model calls, lineage,
# baseline, retry, model change, the phase/component/command/framework/template pickers). The Automation page opens on it (Console tab); the Lab
# is its last tab and off the rail (contract.json nav none). Decided by his words and §5.16 (the UI reaches only COS's door). Not checked in Clear
# Glass: its driver cannot open a window on this PC (said); checked in the built-in browser instead.

# ── ADDENDUM 0.60.652 (2026-11-24) — PC8 slice d: the Automation tab is the console itself ──
# James, 2026-11-24: "Nope the whole tab." · "Fuck iframes. Build the automation tab better." cos/ui/automation/index.html is the console (a COS page:
# core.js, COS.page); the old engine page is engine.html, from More, until workflows, the desktop driver and supervision are console panels (next).
# Under the canvas, the build as a bar of its pieces (green passed, grey waiting, red held or failed) from /api/cos/lab: the first form of PC23's
# bars, on data COS already has. The Lab is a console panel.

# ── ADDENDUM 2026-11-25 — PC8 slice d, what he wants, so it is not lost (his words; the coder's mistake said) ──
# James, 2026-11-25, after 0.60.651-652: "okay but i didn't ask you to strip it. it was critisized thoroughly. it was almost exactly how i want it" ·
# "im saying the preview from the console preview was the exact one i wanted. not a version but identicle as possibel" · "i want the automation build
# the same. not stripped. but built" · "like dont let it get lossed."
# DECIDED (his): COS's Automation tab IS cos/ui/run-console-preview, identical as possible: every part it shows works, nothing removed or greyed
# out. 0.60.651-652 got this wrong: the coder read "no ui should have what the backend doesn't" as strip, and removed model calls, lineage, the
# baseline, retry, model change and the phase/component/command/framework/template pickers; that read is withdrawn. The rule stands the other way:
# the BACKEND gets what the preview shows. What each part needs (the coder's census, 2026-11-25): COS has pipelines, runs, systems, the terminal and
# run/pause/continue/cancel; COS's engine has save, new, duplicate, retry (resume with redo), ERAVOS (from-erv) and the baseline, unlisted in its
# contract; the bridge has model calls (/api/jobs); Idearium has phases, lineage and the build's gate tree; each system has its components and
# commands; frameworks and templates have no owner route yet. So the work is COS reaching each owner's own routes (the drawbridge, §5.16).
# OPEN, his: the language of that COS piece (COS is JavaScript today; his "Stop using ... Js" of 2026-11-24; Looking Glass and Emerge the lasting
# form, his 2026-11-25). Until he answers, the live tab is 0.60.652's (stripped) and nothing more is changed.

# ── ADDENDUM 2026-11-25 — what stops the pipeline fixing itself, found on the end-to-end runs (his order: "the pipeline is the end-game") ──
# James, 2026-11-25: "like it should get to a point where it can build itself, and fix itself when it cant, the pipeline is the end-game" ·
# "keep working on the pipeline, so it can fix itself. build nexus, contineu". Found, the coder's, each with its evidence:
# - F1 a hung round has no limit and says nothing: EMB10 runs cd9b8b7a and 22c0efc7 stopped writing rows after their pieces passed (09:15:53,
#   09:34:56) and sat; the same build in a worktree finished in seconds (examples-failed). Likely a wait with no time limit on another system
#   (COS froze at the same time). Needs a per-round quiet limit: no new row for N minutes ends the round, said, and the pipeline retries.
#   Interim, data only: the EMB10 step stops after 45 min and retries twice (was 6 h, no retry); the pieces are on disk, so a retry resumes.
# - F2 Cancel does not stop a running script step: POST pipeline-runs/:id/cancel answered ok, the run stayed running (22c0efc7).
# - F3 COS freezes while an Emerge hook runs: COS runs <system>/cli.eg with a blocking call, the bridge asks the model server's hooks about
#   once a minute, and COS did not answer its own health for over 15 s (09:45).
# - F4 a piece passes alone and the module fails: all 5 EMB10 pieces compiled, the module failed its 14 examples; each piece's brief carries
#   the whole phase's does-text, not its own example lines (EMB8's per-function contract did not reach these pieces).
# Order, the coder's reading, his to change: F1 and F2 first (a pipeline that cannot stop a hung step cannot heal), then F4, then F3. Each fix
# in Emerge or data where it can be (his "no js"); where only JavaScript can carry it, asked first.

# ── ADDENDUM 0.60.653 (2026-11-25) — PC8 slice d: the Automation tab is the preview, the same, built ──
# James, 2026-11-25: "okay fix the automation tab. then continue the pipeline. the pipeline and emerge are vital". cos/ui/automation/index.html is
# cos/ui/run-console-preview/index.html with 49 lines changed: its reads to /api/cos/view/* (the preview's own server.js, its handler exported and
# mounted in COS's manager: moved, not rewritten), and its later actions joined to COS's routes (run, pause, continue, cancel, retry from a step,
# save, duplicate, export). Change model and Open on ERAVOS stay later (no backend). The JavaScript, said: the moved server is the preview's own; the
# manager gained one line to mount it; the page gained one helper for its acts. Needs COS's restart.

# ── ADDENDUM 0.60.654 (2026-11-25) — F1's cause found and fixed: the sandbox copied every data folder ──
# James, 2026-11-25: "okay pipeline". The hung rounds (F1) were not waiting: profiled, the build spent 98%% of its time in fs.cpSync under
# lib/proposal-evidence.js shadow(), copying every folder named data in Nexus for the expectation test, onto C: (872 MB left). A shadow now copies a
# data folder only when it is under 2 MB; a bigger one is an empty folder (a test still cannot write into real data). 0.7 s and 1.1 MB in COS's
# folder. F5, found the same hour: COS resumed every interrupted run at each restart, so two copies of one build ran on the same pieces.

# ── ADDENDUM 2026-11-25 — the build is a reusable procedure of maps, phases and specs (his words) ──
# James, 2026-11-25, looking at the EMB10 step ("Run your script: build-phase.js"): ".phases, specs. like we have maps for this, why a js file?" ·
# "also like i want the idearium build pipeline to be a reasuable procedure. like if i have an idea that i give copilt, then it uses the build
# pipeline in idearium. like the entire pipeline in the canvas, editable, programmable, accessable." · "also a .spec file would be something it needs
# to build like idearium does."
# DECIDED (his): (a) a pipeline's steps are Nexus's own nodes (a map, a .phase, a .spec), not a script file: the step names what to build and the
# pipeline knows how; (b) Idearium's build pipeline is one reusable procedure, every stage a step on the canvas (edit, program, open any stage);
# (c) an idea he gives Copilot becomes a request that runs that procedure; (d) a .spec is an input it builds from, as Idearium builds from a spec.
# Reuse, the coder's census: PC_D15 (a box can be a phase, built by the build pipeline for that phase), DB1-DB5 (the build's stages moved into
# COS through the drawbridge, the Code tab first), PC13 (his request built by the pipeline), RAID's request lifecycle (an idea as a request).
# Open, his: the order against F2-F5 (the pipeline healing itself).

# ── ADDENDUM 0.60.655 (2026-11-25) — F2 and the orphans: COS stops what it starts ──
# James, 2026-11-25: "you need to fix it so cos can shut it down. like that needs to be solved." · "this is meant to be autonomous." Found: after COS's
# restarts the model engines ran with no process held by COS (state declared, pid null: DeepSeek on 10809, the 3b on 9942, an old 3b on 9931), so
# only Task Manager could end them, and DeepSeek's memory starved the PC (0.1 GB free); cancel only flagged a run. Built: supervisor _claim (a
# declared process answering on its port is adopted, on touch and each minute), _sweepStrays (a declared program running unheld is ended, ledger
# stray-ended), scripts.js stop(owner) and _endTree (taskkill /T) on cancel and on the time limit. Proof owed: the supervisor tests read the PC's
# real free memory and failed alike on old and new code at 0.4 GB free; rerun when memory is free.

# ── ADDENDUM 2026-11-25 — the proof is Nexus running on what the pipeline built: a feedback loop (his) ──
# James, 2026-11-25: "Your having it build something real right? Useless examples build useful files. Capability proves competency, not tests
# passing." · on the answer (land the 3b's EMB10, the bridge's engine decisions run on it, the JavaScript it replaces deleted): "you know why I love
# this idea? Because it's a feedback loop." DECIDED (his): a piece the pipeline builds is proven only when Nexus runs on it. The loop: the model
# writes code, Nexus runs on it, a break in real use becomes a gap with its lesson (RL_D10), the pipeline rebuilds it, Nexus runs on the better one.
# Tests and capability become one; each failure leaves a lesson, a hint or a sharper spec, so the next build starts better (his "intelligent gates
# that compound"); piece by piece (the engine decisions, then Idearium's Code tab tools, then the rest) Nexus is written by its own smallest model
# and kept running by its own pipeline: the end-game he named (PC13), reached by repetition. Proof log entries need this: his words, the piece, the
# code it replaced, and a run anyone can repeat.

# ADDENDUM 2026-11-25 — the pipeline is the mind (his)
# James, 2026-11-25: "everything goes to the pipeline. each request. the pipeline will be everything for thinking, reasoning, memory, choices,
# the pipeline will be the mind. think of that." Before it, the same day: "everything should be routing through raid" · "the pipeline is the
# end-goal". Read with his framework: a request is a node; its steps are the thought (PC26's yarn: diverge, converge, oscillate, collide);
# RAID's yes with proof is the choice (PG5, the build's wake); the run's own record is the memory (PC28: every event, its cause); the
# equations measure each output (PC27); the failures feed back to the root (his "Iterate & Integrate"). The direction for every door that
# takes a request (the bridge's jobs, Copilot, Idearium's Code tab, RAID's queue): it becomes a pipeline run, so nothing is thought outside it.
# Not built: today only builds run as pipelines; the other doors are named for their own phases. Cost, said: the pipeline becomes the one
# path, so its speed and its uptime become everything's (a request that waited a second waits a run's start).

  PC30_the_library_of_pipelines_renamable_not_a_drop_do:
    status: pending
    depends_on: [PC8]
    does: >
      His 2026-11-26: "the pipelines need to be renamable. a library not a drop down." The Automation tab opens on its Library (built, hidden today): every pipeline as a card with its name (renamed in place), its origin, its end state, its last run and its schedule; the drop-down goes. Preview first (his rule).

  PC31_origin_first_end_state_last_on_every_pipeline:
    status: pending
    depends_on: [PC26, PC30]
    does: >
      His 2026-11-26: "the raid compartment created with the request, needs to be the beginning of each pipeline. where it originates from, and the end state need to be shown on each. like it needs to all be explicit." Every pipeline's first node is the RAID request it came from (its .input, its compartment, who asked and why) and its last node is the contract (the end state and its conditions, RAID's verdict); the canvas draws both, and a run's tree hangs between them.

  PC32_axioms_conditions_triggers_schedule_and_retries_:
    status: pending
    depends_on: [PC30]
    does: >
      His 2026-11-26: "we need axioms per node, pipeline, conditions, triggers, and a ability to schedule. edit retry logic." Each node and each pipeline carries its axioms (constraints checked before it runs: WARP 2's link through the field's constraints), its conditions (when), its triggers and schedule (the engine's own, the Schedule page made visible), and its retry logic (how many, how long between, what changes on each try: a bigger model, a smaller piece), all editable on the canvas and saved in the pipeline's node file.

  PC33_the_pipeline_moves_idearium_s_pipeline_features_:
    status: pending
    depends_on: [PC30]
    does: >
      His 2026-11-26: "can we have it work on moving the idearium pipeline features and agent components and stuff to automation engine and the pipeline" (DB1; UD13: Idearium hands its tools to COS and calls COS). A pipeline whose nodes are the migration: a census node lists each Idearium pipeline feature and agent component; each becomes a node that moves one, proven by its own tests before the old one is retired. Said plainly: the pipeline cannot yet move JavaScript or UI by itself (it builds Emerge pieces); the nodes it cannot do are filed as needed-the-coder, each the next capability to give.

  PC34_every_agent_s_work_is_a_pipeline_shown_on_the_te:
    status: pending
    depends_on: [PC26]
    does: >
      His 2026-11-26: "can you have the agents build me a ui preview. i need to be able to test all of this myself." · "everything that the agents are doing should be in that bench. like everything should be using the pipleine". Each agent session (a coder agent, a Guardian agent, a local model working a phase) is a request kept as node files under cos/data/agents/<id>/ (session.json: who, the ask it started from, state; steps/<n>.step: each tool or model call, its input in short, its outcome); its end state is its report. COS records it through POST /api/cos/agents/activity (record only: it starts no workflow, so an agent may send it) and reads it through GET /api/cos/agents/sessions[/<id>]. The coder's sessions reach it through one plugin (a Claude Code hook, per the external-dependency-is-a-plugin rule), never by coupling. The test bench preview (cos/ui/test-bench-preview/) opens on an Agents tab: origin, then each step, then the end state. Slice b: each step goes through RAID before it runs, not only recorded after (UD25).

  PC35_mental_simulations_a_tab_in_the_pipeline_canvas_:
    status: pending
    depends_on: [PC26, PC34]
    does: >
      His 2026-11-26: "i said playground. like i want to play with the agents, have worlds/compartments for anything i want to do with agents. look at the templates. labs. torture chambers. like for doing what i want with the models." · "call it mental simulations. have it a tab in the pipeline canvas. everything needs to run through the canvas. i want to give it a problem and have it solve it, and iterate it over and over." · "nexus is domain agnostic, system agnostic, agent agnostic." A tab beside Canvas and Runs in COS's Automation (the pipeline canvas). He types a problem; it becomes the origin node, its end state is asked for or proposed (cos/pipeline/backward.eg plans the DAG from it), and the run is drawn on the canvas as the tree it grows. Each simulation is a world: a compartment from cos/playgrounds (isolated, mirrored, synthetic), started from a template (Lab: cos/playground/llm-lab.js hypothesis, conditions, head-to-head, feedback loops; Torture chamber: cos/spec/torture-chamber.spec stations in parallel branches; Head to head; Blank), with any agents and models in it (the model server first, Guardian last). Iterate: each pass is measured (gaps from the intelligence system's liminal detectors, sigma and delta from emerge/field/causal.eg) and the next pass is a branch from the last one (cos/playground/branch.js, compare.js), until the end state is met or he stops it; fork, compare, keep or discard (his miniworlds, CP_D2). No domain, system or agent is assumed. Every step through RAID, every part a node file. Preview inside COS first (his rule).

  PC36_the_pipeline_writes_specs_never_md_any_plan_read:
    status: pending
    depends_on: [PC26]
    does: >
      His 2026-11-26: "so have it build looking glass. i want to be able to have the pipeline build specs. no .md i told you that." A pipeline step turns a plan held as .md (a PHASEMAP.md, a ROADMAP.md, a phased SPEC.md) into a .spec phasemap through Idearium's roadmap import (idearium/repo/roadmap-import.js), for Nexus's own docs as well as an imported project's, so the queue can see its phases. First use: docs/looking-glass/PHASEMAP.md (his Looking Glass, phases 0-12) into docs/looking-glass/looking-glass-phasemap.spec. The import's gaps found on it: it refused Nexus's own repo, and it read only `## Phase N` headings (Looking Glass uses `### Phase N`).
