spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # cos/spec/pipeline-canvas.spec — pipelines as a node canvas: one box shape over every kind of step, procedures and frameworks as steps, a step that
  # is a build request, the boxes on the ERAVOS canvas. Map: docs/2026-11-08-pipeline-canvas-phasemap.spec (PC1–PC4). Format: emerge's module spec,
  # compiled by lib/emerge/compiler/kg-builder.js at specDepth 1.0, no BLACK node (tests/modules/test-substrate-spec.test.js).
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        pipeline-canvas
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-11-08T00:00:00Z
    status:      specced
    uuid:        cos-pipeline-canvas-spec-v1-0000-2026-1108-jamesbrooks-001
    origin: >-
      James, 2026-11-08: "spec whats needed. phase steps towards the endstate. like we need editable proceedures/frameworks to use as a step by step
      proceedure. like a macro but i want those to be able to be a step, recursive automation pipelines." · "like i want a beautiful visual, steps
      as boxes, with wires as the flow into the hooks of gates as compartments. boxes can  be gates, systems, agents, macros, pipelines, tools, like a
      node based canvas for pipelines, which are compartments from cos or the ability to have them built from the pipeline like a step can also be a
      build request, like a gap, or error or bottleneck, holy shit that is huge." The direction and the calls are his; the shape and the cut are the
      coder's, by his axioms (PC_D0), with three readings his to settle (PC_D1–PC_D3).
    purpose: >-
      Every pipeline in Nexus (build, automation, debug, coding, agnostic) is one DAG of boxes joined by wires, drawn and run on one canvas. A box is
      a gate, a system, an agent, a macro, a pipeline, a procedure, a tool or a build request. A pipeline or procedure box nests its own canvas. A
      step Nexus cannot do becomes a build request that gets the capability built, then lets the run go on.
    target_runtime: [node, browser]
    language_stack: [javascript, html, css]
    paradigm: [one-shape, dag, owner-serves-by-route, held-acts, recursive-composition]
    axioms: ["§8.6: the engine, the .pipeline node, the .procedure, the gate and the ERAVOS canvas reused, not rebuilt",
      "§10.3: one box shape and one gate shape; the canvas file is the file the engine runs",
      "§5.15: a box reaches its owner by route (Idearium's procedures, Cortex's RAID, Clear Glass's pipelines)",
      "USER_AUTONOMY / OC-002: a build request and a confirm step wait for his take", "§1.1/§1.2: a box shows only a real run's state; a refusal is said",
      "§17.13: JavaScript where COS's contract names it (cos-manager.spec); the box schema first, so the .eg port is against the same contract"]
    deps:
      - { name: node, version: ">=18", required: true, purpose: "COS's manager and the engine" }

    constraints:
      - id: PCS-001
        description: "A pipeline is a DAG: no cycle among its wires; a nested chain across kinds (pipeline, workflow, procedure) has no loop and is at most MAX_DEPTH (5) deep."
        type: hard
        enforced_by: [GATE-PCS-DAG]
      - id: PCS-002
        description: "The canvas saves the .pipeline file the engine runs; there is no second store of a pipeline."
        type: hard
        enforced_by: [GATE-PCS-ONE-FILE]
      - id: PCS-003
        description: "A build request is a held act: filed as a RAID contract only after a take; an agent's waits for him."
        type: hard
        enforced_by: [GATE-PCS-HELD]

  schemas:

    - id: Box
      name: Box
      description: "One step on the canvas, of any kind."
      fields:
        id:        "string — unique in its pipeline"
        kind:      "string — gate | system | agent | macro | pipeline | procedure | tool | build"
        ref:       "string — what it names: a system name, a hat, a macro id, a pipeline id, a procedure id, a tool name; for build, the BuildRequest's id"
        hooks:     "object — { in: string[], out: string[] }; a gate's hooks are the compartment door's inputs and outputs (PC_D1 reading a)"
        contract:  "object — { requires: string[], gives: string[] }: what must hold before it runs, what it gives after"
        gate:      "object? — the gate after it (the one gate shape, MB3): condition, delay, retries"
        args:      "object? — the step's own settings (the engine's step fields)"
      behavioral_contracts: ["toBox(fromBox(b)) equals b", "a ref that names nothing is refused and named, never guessed"]
      error_paths: ["unknown kind → refused with the kinds"]

    - id: Wire
      name: Wire
      description: "The flow from one box's out-hook into another box's in-hook (into its gate)."
      fields:
        from: "string — '<box id>.<out hook>'"
        to:   "string — '<box id>.<in hook>'"
      behavioral_contracts: ["both hooks exist", "the wires of a pipeline form a DAG"]
      error_paths: ["a hook that does not exist → refused, named"]

    - id: BuildRequest
      name: BuildRequest
      description: "A step Nexus cannot do yet, turned into a request to build it (his 'a gap, or error or bottleneck')."
      fields:
        id:        "string"
        from:      "string — gap | error | bottleneck | asked"
        what:      "string — the capability missing, in words"
        evidence:  "object — the failed step and its error, the gap's question, or the time over budget"
        end:       "string — what done looks like: the test that must pass"
        dag:       "object — { pipeline, box, waiting: box ids that wait on it }"
        state:     "string — offered | held | filed | building | fulfilled | refused"
        contract:  "string? — the RAID contract's id once filed"
        by:        "string — person | agent:<name> | rule:<id>"
      behavioral_contracts: ["filed only after a take (PCS-003)", "fulfilled only when its end test passed"]
      error_paths: ["Cortex not answering → stays held, said; never filed silently later without a record"]

  interfaces:

    - id: IF-PIPELINE-CORE
      name: pipeline-core
      path: lib/automation/pipeline.js
      description: "Pipelines: tasks in a DAG, each one engine step, gated; validate, layers, run (PL1)."
      exports: ["validate(pipeline, { stepTypes }) → { ok, problems }", "layers(pipeline) → [[ids]]", "gateOpen(gate, output) → { open, why }"]
      behavioral_contracts: ["a cycle is a problem, named"]
      error_paths: ["an unknown step type → a problem"]

    - id: IF-ENGINE
      name: engine
      path: lib/automation/engine.js
      description: "The automation engine: runStep, the chain of nested pipelines and workflows (MAX_DEPTH 5, a loop refused)."
      exports: ["runStep(step, R) → Promise<output>", "MAX_DEPTH = 5"]
      behavioral_contracts: ["pipelines can run each other at most MAX_DEPTH deep; a loop is refused"]
      error_paths: ["a step that throws → the task fails with its error"]

    - id: IF-STEP-TYPES
      name: step-types
      path: lib/automation/steps.js
      description: "The engine's step catalogue: browser, extract, wait_until, script, autofill, pipeline, macro, workflow, agent, command, …"
      exports: ["STEP_TYPES: [{ type, group, label, fields }]"]
      behavioral_contracts: ["each type has its fields with their rules"]
      error_paths: ["none: a table"]

    - id: IF-PROCEDURES
      name: procedures
      path: lib/repo-procedures.js
      description: "His .procedure (DK1, PD1): steps { tool, args } | { confirm } | { check }; the library served by Idearium."
      exports: ["runSteps(p, { runTool, yes, by }) → { ok, waiting?, run }", "library({ dir })", "GET /api/procedures · POST /api/procedures/:id/run (Idearium)"]
      behavioral_contracts: ["a confirm step without his yes stops the run, waiting"]
      error_paths: ["the first failing step stops the run, named"]

    - id: IF-COS-DOOR-PC
      name: cos-door-pc
      path: cos/manager/server.js
      description: "COS's door: proposals (hold, take, drop), deployments (OC4a), the hub (OC8a)."
      exports: ["POST /api/cos/proposals", "POST /api/cos/proposals/:id/take|drop { by }", "GET /api/cos/hub"]
      behavioral_contracts: ["an act says who acts"]
      error_paths: ["no by → 400"]

    - id: IF-RAID-ROUTES
      name: raid-routes
      path: cortex/boot.js
      description: "RAID, Cortex's, by route (AE_D4 2a): its health, its contract queue."
      exports: ["GET /api/raid/health", "GET /api/raid/queue", "POST /api/raid/decide"]
      behavioral_contracts: ["reached only by route; swappable (§5.15)"]
      error_paths: ["Cortex down → no answer, said by the caller"]

    - id: IF-ERAVOS-SDK
      name: eravos-sdk
      path: cos/archetype/eravos-canvas/canvas/runtime/organism-sdk.js
      description: "The ERAVOS canvas's tool SDK: a tool is eravos.tool/1 with its spec, ui and test; ctx.cos reaches COS's door only (EO0)."
      exports: ["OrganismSDK.extend(domain, { tools })", "ctx.cos.call(method, path, body)"]
      behavioral_contracts: ["a call outside /api/cos/* is refused (EO0)"]
      error_paths: ["a tool without a test is not loaded"]

  modules:

    - id: MOD-PC-BOX
      name: box
      uuid: cos-pipeline-canvas-box-v1-0000-2026-1108-001
      path: cos/automation/box.js
      phase: PC1_one_box_shape
      description: >-
        One Box and Wire shape over every kind. toBox/fromBox convert an engine pipeline task (IF-PIPELINE-CORE, IF-STEP-TYPES), a procedure step
        (IF-PROCEDURES), a deploy task and a COS compartment, so the canvas and the engine share the .pipeline file. validate() checks the DAG,
        the hooks and every ref.
      deps: [{ name: pipeline-core }, { name: step-types }, { name: procedures }]
      schema_refs: [Box, Wire]
      exports: ["toBox(step, { kind }) → Box", "fromBox(box) → engine task | procedure step", "validate({ boxes, wires }) → { ok, problems }", "KINDS"]
      gate_pipeline: ["GATE-PC1-001: every kind round-trips", "GATE-PC1-002: a cycle, a dangling hook, an unknown ref refused and named"]
      behavioral_contracts: ["no second store: the file saved is the engine's .pipeline", "a kind with no engine step (system, build) is carried as a box the engine runs through its own route"]
      error_paths: ["unknown kind → refused with KINDS", "a ref that names nothing → a problem, named"]
      acceptance: ["every .pipeline and .procedure in the tree round-trips unchanged; the three refusals each named"]

    - id: MOD-PC-PROCEDURE-STEP
      name: procedure-step
      uuid: cos-pipeline-canvas-procedure-step-v1-0000-2026-1108-001
      path: lib/automation/steps.js
      phase: PC2_procedures_and_frameworks_as_steps
      description: >-
        The engine's step 'procedure': runs one through Idearium's POST /api/procedures/:id/run (IF-PROCEDURES, by route), its run the step's output;
        a confirm step holds the pipeline at the box. The chain (IF-ENGINE) carries pipelines, workflows and procedures alike: a loop across kinds is
        refused, and MAX_DEPTH counts them all. With PC_D2 (a), a .framework is read as a procedure, its sections as steps with checks.
      deps: [{ name: engine }, { name: procedures }, { name: box }]
      schema_refs: [Box]
      exports: ["STEP_TYPES += { type: 'procedure', fields: [procedure, yes?] }", "the chain across kinds"]
      gate_pipeline: ["GATE-PC2-001: the procedure runs by Idearium's route", "GATE-PC2-002: its confirm holds the box", "GATE-PC2-003: a loop across kinds refused"]
      behavioral_contracts: ["Idearium's procedures folder is never read by the engine (§5.15)"]
      error_paths: ["Idearium down → the step fails, said", "a loop or depth 6 → refused with the chain"]
      acceptance: ["a pipeline with a procedure step runs it and waits on its confirm; pipeline → procedure → the same pipeline refused"]

    - id: MOD-PC-BUILD-STEP
      name: build-step
      uuid: cos-pipeline-canvas-build-step-v1-0000-2026-1108-001
      path: cos/automation/build-request.js
      phase: PC3_the_build_request_step
      description: >-
        A build box: a BuildRequest held as a COS proposal (IF-COS-DOOR-PC, verb build); taken, filed as a RAID contract by Cortex's route
        (IF-RAID-ROUTES) and given a compartment (the hub's experiments slot). The pipeline waits at the box; fulfilled and its end test passed,
        the box opens; refused, the box fails with RAID's reason. With PC_D3 (b), a failed step, an unfilled gap or a box over budget offers one.
      deps: [{ name: box }, { name: cos-door-pc }, { name: raid-routes }]
      schema_refs: [BuildRequest, Box]
      exports: ["offer({ from, what, evidence, end, dag, by }) → BuildRequest (held)", "builds({ state }) → BuildRequest[]", "GET /api/cos/builds", "POST /api/cos/builds", "row `cos build`"]
      gate_pipeline: ["GATE-PC3-001: held until a take", "GATE-PC3-002: filed only by Cortex's route", "GATE-PC3-003: the box opens only on a passed end test"]
      behavioral_contracts: ["every state change is a line on COS's ledger", "never filed without a take"]
      error_paths: ["Cortex down → held, said", "the end test fails → the box stays waiting, said"]
      acceptance: ["a failing step offers a build box; taken, a contract is filed on a stand-in Cortex; fulfilled, the run finishes; refused, the box fails with the reason"]

    - id: MOD-PC-CANVAS
      name: canvas-boxes
      uuid: cos-pipeline-canvas-canvas-v1-0000-2026-1108-001
      path: cos/archetype/eravos-canvas/tools/orchestration/work
      phase: PC4_the_box_kinds_on_the_canvas
      description: >-
        Each kind an ERAVOS tool (IF-ERAVOS-SDK) with its own face; wires from out-hooks into the next box's gate; a pipeline or procedure box opens
        its own canvas and back; during a run each box shows its real state, the wire lights, a closed gate says what it saw. Saved as the .pipeline
        (MOD-PC-BOX).
      deps: [{ name: eravos-sdk }, { name: box }]
      schema_refs: [Box, Wire]
      exports: ["the tools: gate, system, agent, macro, pipeline, procedure, tool, build"]
      gate_pipeline: ["GATE-PC4-001: every box state comes from the engine's run", "GATE-PC4-002: save and reopen give the same pipeline"]
      behavioral_contracts: ["reaches only COS's door (EO0)", "no state shown that a run did not give"]
      error_paths: ["COS down → said on the canvas", "a box whose owner does not answer → shown down, said"]
      acceptance: ["in Clear Glass: a pipeline with a gate, a procedure and a nested pipeline drawn, saved, reopened the same, run with real states; the nested box opens"]

  events:
    pipeline:
      - "pipeline.box.state { pipeline, box, state }"
      - "pipeline.build.offered { id, from, box }"
      - "pipeline.build.filed { id, contract }"
      - "pipeline.build.fulfilled { id }"

  enforcement:
    gates:
      - { id: GATE-PCS-DAG, name: dag, severity: fatal, check: "no cycle among wires; the nested chain across kinds has no loop and is at most MAX_DEPTH deep", on_failure: "refused, named" }
      - { id: GATE-PCS-ONE-FILE, name: one-file, severity: fatal, check: "the canvas saves the engine's .pipeline; no second store", on_failure: "suite red" }
      - { id: GATE-PCS-HELD, name: held, severity: fatal, check: "a build request is filed only after a take", on_failure: "suite red" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node, invariants valid"
    - "tests/modules/test-pipeline-box.test.js — PC1, PC2"
    - "tests/modules/test-pipeline-build-step.test.js — PC3"
    - "tests/modules/test-pipeline-canvas.test.js — PC4, in Clear Glass"
