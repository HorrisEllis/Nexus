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
    status: "ASKED 2026-11-08 — his"
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
    status: "ASKED 2026-11-08 — his"
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
    status: "DECIDED 2026-11-08 by his axioms; to confirm"
    chosen: >-
      COS's manager code is JavaScript by its contract (cos/spec/cos-manager.spec language_stack), and the engine moves into COS as it is (AE_D4). So
      PC1–PC3 land as JavaScript in cos/automation/, and their .eg port follows the engine's (CIE13, CIE10, thread T10). The box shape is written as a
      schema first (cos/spec/pipeline-canvas.spec), so the port is a re-implementation against the same contract (§17.13 names the contract).
    by_the_axioms: "§17.13 (another language only where a contract names it), NC0 schema rule"

phases:
  PC1_one_box_shape:
    status: OPEN
    expanded_2026_11_08: "his 'Using the gates to determine gaps after each step': the gate after every box answers open, closed or gap; each box carries budget, recovery and deterministic; a nested run gets its own context (only wired hooks cross)"
    layer: library
    depends_on: [PC_D0_reuse_first, PC_D4_language, PL1_pipeline_core, PD1_procedure_nodes_and_commands, OC4_deploy_to_any_system]
    spec: cos/spec/pipeline-canvas.spec
    blocks: [MOD-PC-BOX]
    files: [cos/automation/box.js, cos/spec/pipeline-canvas.spec, tests/modules/test-pipeline-box.test.js, tests/modules/run-all.js]
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
    status: OPEN
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
    status: OPEN
    layer: integration
    depends_on: [PC1_one_box_shape, PC_D3_when_a_step_becomes_a_build_request, PC_D5_emerge_writes_the_code, AE_D4_the_hub_structural, OC8_the_console]
    spec: cos/spec/pipeline-canvas.spec
    blocks: [MOD-PC-BUILD-STEP]
    files: [cos/automation/build-request.js, cos/manager/server.js, cos/manager/contract.json, cos/manager/hub.js, idearium/cli/route-commands.js, tests/modules/test-pipeline-build-step.test.js, tests/modules/run-all.js]
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
    depends_on: [PC1_one_box_shape, PC_D1_gates_as_compartments, PC5_programmable_gate_types, EO3_work_tools, EO5_opened_from_cos, MB3_one_shape_with_pipelines]
    spec: cos/spec/pipeline-canvas.spec
    blocks: [MOD-PC-CANVAS]
    files: [cos/archetype/eravos-canvas/tools/orchestration/work, cos/archetype/eravos-canvas/tools/orchestration/flow, cos/ui/orchestration, tests/modules/test-pipeline-canvas.test.js]
    interface: [html]
    does: >-
      His "a beautiful visual, steps as boxes, with wires as the flow into the hooks of gates". Each kind is an ERAVOS tool with its own face (gate,
      system, agent, macro, pipeline, procedure, tool, build). Wires go from a box's out-hook into the next box's gate (PC_D1). A pipeline or procedure
      box opens into its own canvas and back (recursive). While a run goes, each box shows its state, a wire lights as the flow passes, and a closed
      gate says what it saw. Saved, it is the .pipeline file (PC1). It is never a picture of a run that did not happen: state comes from the engine's
      run.
    proof: "in Clear Glass (glass.js): a pipeline drawn with a gate, a procedure and a nested pipeline is saved, reopened the same, run, and each box shows its real state; the nested box opens its own canvas"

  PC5_programmable_gate_types:
    status: OPEN
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
  checked against the work and not promised: PC1 one session, PC2 one, PC3 one to two, PC4 two to three with EO0–EO3 (EO is about 2 more). PC5 one to two, beside PC2 and PC3; PC4 draws the gate types PC5 makes.
