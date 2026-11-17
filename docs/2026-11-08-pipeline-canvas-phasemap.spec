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
# ── ADDENDUM 2026-11-11 (0.60.483) — PC9 slice a: the desktop driver for agents (his PC_D14) ──────────────────────────────────────────────
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
