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
    language_stack: [emerge, javascript, html, css]
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
        budget:    "object? — { ms, tokens }: over it, the box is a bottleneck (PC3)"
        recovery:  "string? — retry | rollback | escalate | stop (default stop, said)"
        deterministic: "boolean — true for a parser, a check, a route call; false for a model; a gap found by a non-deterministic box is marked so"
      behavioral_contracts: ["toBox(fromBox(b)) equals b", "a ref that names nothing is refused and named, never guessed",
        "the gate after every box answers open, closed or gap (what is missing); a gap goes to PC3 (PC_D3, his 2026-11-08)",
        "a nested pipeline or procedure runs in its own run context: the parent passes only the wired hooks in, and gets only the out-hooks back"]
      error_paths: ["unknown kind → refused with the kinds"]

    - id: GateType
      name: GateType
      description: "A kind of gate, as an archetype is a kind of compartment (PC5). Programmable: its check and its actions are nodes or route calls."
      fields:
        id:       "string — check | test | diagnose | fault-log | notify | retry | hold | options | gap | any made later"
        check:    "object — { kind: condition | route | node | test, ref, holds? }: what decides open, closed or gap"
        on:       "object — { open: GateAction[], closed: GateAction[], gap: GateAction[] }"
        options:  "object[]? — [{ label, actions: GateAction[] }]: offered to the person to choose, instead of one path"
        madeBy:   "string — shipped | person | agent:<name> (an agent's held until taken)"
        from:     "string? — what drafted it: a schema, the chunker, the work surface (by their routes)"
      behavioral_contracts: ["valid against this schema or refused, named", "no type is code in the engine; shipped types are files"]
      error_paths: ["an action naming a route its owner does not serve → refused when made, said when run"]

    - id: GateAction
      name: GateAction
      description: "One thing a gate does on an outcome."
      fields:
        do:     "string — route | node | stop | skip | retry | hold | branch | notify"
        ref:    "string? — '<METHOD> <path>' on its owner, a node id, or a box id to branch to (any box, not only the next: non-linear)"
        owner:  "string? — the system serving the route"
        policy: "object? — retry: { times, backoffMs }"
      behavioral_contracts: ["a route action reaches its owner by route only (§5.15)"]
      error_paths: ["the owner does not answer → the action fails, said; the gate's next action still runs"]

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
      path: Eravos-Canvas:canvas/runtime/organism-sdk.js
      description: "The ERAVOS canvas's tool SDK: a tool is eravos.tool/1 with its spec, ui and test; ctx.cos reaches COS's door only (EO0)."
      exports: ["OrganismSDK.extend(domain, { tools })", "ctx.cos.call(method, path, body)"]
      behavioral_contracts: ["a call outside /api/cos/* is refused (EO0)"]
      error_paths: ["a tool without a test is not loaded"]

  modules:

    - id: MOD-PC-BOX
      name: box
      uuid: cos-pipeline-canvas-box-v1-0000-2026-1108-001
      path: cos/pipeline/box.eg   # 2026-11-09: moved into the module (was cos/automation/box.eg)
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
      path: cos/pipeline/build-request.eg   # 2026-11-09: in the module, in Emerge (was planned as cos/automation/build-request.js)
      phase: PC3_the_build_request_step
      description: >-
        A build box: a BuildRequest held as a COS proposal (IF-COS-DOOR-PC, verb build); taken, filed as a RAID contract by Cortex's route
        (IF-RAID-ROUTES) and given a compartment (the hub's experiments slot). The pipeline waits at the box; fulfilled and its end test passed,
        the box opens; refused, the box fails with RAID's reason. With PC_D3 (b), a failed step, an unfilled gap or a box over budget offers one.
      deps: [{ name: box }, { name: cos-door-pc }, { name: raid-routes }]
      schema_refs: [BuildRequest, Box]
      exports: ["offer({ from, what, evidence, end, dag, by }) → BuildRequest (held)", "builds({ state }) → BuildRequest[]", "GET /api/cos/builds", "POST /api/cos/builds", "row `cos build`"]
      gate_pipeline: ["GATE-PC3-001: held until a take", "GATE-PC3-002: filed only by Cortex's route", "GATE-PC3-003: the box opens only on a passed end test"]
      behavioral_contracts: ["every state change is a line on COS's ledger", "never filed without a take",
        "the code a build needs is generated by Emerge, through Emerge's own route (PC_D5, his 2026-11-08: \"emerge for the code generation\")",
        "a build request grants itself nothing: what it may change is its contract's, decided by RAID"]
      error_paths: ["Cortex down → held, said", "the end test fails → the box stays waiting, said", "Emerge down → the build waits, said"]
      acceptance: ["a failing step offers a build box; taken, a contract is filed on a stand-in Cortex; fulfilled, the run finishes; refused, the box fails with the reason"]

    - id: MOD-PC-GATE-TYPES
      name: gate-types
      uuid: cos-pipeline-canvas-gate-types-v1-0000-2026-1108-001
      path: cos/pipeline/gate.eg   # 2026-11-09: the module, in Emerge; its types cos/pipeline/types/*.gatetype (planned as cos/gate/types.js)
      phase: PC5_programmable_gate_types
      description: >-
        Gate types as COS has compartment types: list, get, propose (an agent's held), validate against GateType; the starter types are files in
        cos/gate/types/. run(type, output, ctx) evaluates the check and runs the outcome's GateActions in order, or returns the options for the person.
        The engine's gate after every step reads its type (stop, skip and retry kept as shipped actions). James, 2026-11-08: "Gates need to be
        programmable." · "options are better than neat boxes."
      deps: [{ name: box }, { name: cos-door-pc }, { name: engine }]
      schema_refs: [GateType, GateAction]
      exports: ["list() · get(id) · propose(type, { by }) · validate(type) · run(type, output, ctx) → { outcome, actions[], options? }", "GET /api/cos/gate-types", "POST /api/cos/gate-types", "row `cos gate-types`"]
      gate_pipeline: ["GATE-PC5-001: a type valid against GateType", "GATE-PC5-002: an agent's type held until taken", "GATE-PC5-003: every route action by route"]
      behavioral_contracts: ["the old onClosed words still run unchanged", "options are shown, never picked for him"]
      error_paths: ["an invalid type → refused, named", "an action's owner down → said, the next action runs"]
      acceptance: ["a gate type runs a stand-in test route, logs a fault by route, offers options; a pick branches the run; an agent's type held; the old words unchanged"]

    - id: MOD-PC-RUNS
      name: pipeline-runs
      uuid: cos-pipeline-canvas-runs-v1-0000-2026-1109-001
      path: cos/pipeline/runs.eg
      phase: PC5_programmable_gate_types
      description: >-
        A request through a pipeline kept as files until its contract is met (James, 2026-11-09: "Like each step needs to be persistent until the
        contract and conditions for the request from the dag have been met." · "The gates are temporary unless it didn't finish."). <COS data>/pipeline/
        runs/active/<id>/: run.run (the request and its contract), dag.dag, steps/<t>.step, gates/<t>.gate; met → gates removed, moved to done/.
      deps: [{ name: box }, { name: gate-types }, { name: engine }]
      schema_refs: [GateType]
      exports: ["request(base, pipeline, vars, by, at, engineRun) → id", "on_event(base, kind, data, pipeline, at)", "gate_context · gate_verdict · record_actions", "list_requests · read_request · resume_of", "routes POST|GET /api/cos/pipeline/requests, GET /api/cos/pipeline/requests/:id, POST /api/cos/pipeline/requests/:id/resume"]
      gate_pipeline: ["GATE-PC5-004: the files are written before the engine runs", "GATE-PC5-005: a request leaves active/ only when every step is met"]
      behavioral_contracts: ["what is met is not run again on a resume", "a gate's learning reaches the next request through the step files", "every file is a node envelope in JSON"]
      error_paths: ["an engine run no request holds → said, no file", "a request started by the engine's own route has no vars → it cannot be resumed as it was, said"]
      acceptance: ["eg test cos/pipeline/test/runs.test.eg 4/4", "test-cos-pipeline CP-02, CP-03, CP-04"]

    - id: MOD-PC-WATCH
      name: pipeline-watch
      uuid: cos-pipeline-canvas-watch-v1-0000-2026-1108-001
      path: intelligence/pipeline-watch.eg
      phase: PC6_intelligence_watches_the_runs
      description: >-
        Intelligence's watch over pipeline runs (James, 2026-11-08: "the intelligence system can find anomolies, bottlenecks, gaps"): anomalies against a
        box's own history, bottlenecks against its budget and the wait it causes, gaps from the gates. Each finding has its evidence and offers a build
        box (MOD-PC-BUILD-STEP), held. Reads runs by COS's route (IF-COS-DOOR-PC); written in Emerge.
      deps: [{ name: box }, { name: build-step }, { name: cos-door-pc }]
      schema_refs: [Box, BuildRequest]
      exports: ["findings(runs) → [{ kind: anomaly|bottleneck|gap, box, evidence, offer }]", "GET /api/intelligence/pipelines/findings"]
      gate_pipeline: ["GATE-PC6-001: every finding names its evidence", "GATE-PC6-002: an offer is held, never filed by itself"]
      behavioral_contracts: ["no finding without a reading behind it; no history is said as none, never zero"]
      error_paths: ["COS not answering → no findings, said"]
      acceptance: ["stand-in runs: the slow box an anomaly, the most-waited box the bottleneck, a gap answer a gap; each offers a held build box"]

    - id: MOD-PC-LOOP
      name: end-state-loop
      uuid: cos-pipeline-canvas-loop-v1-0000-2026-1108-001
      path: cos/pipeline/loop.eg   # 2026-11-09: in the module (was planned as cos/automation/loop.eg)
      phase: PC7_iterate_to_the_end_state
      description: >-
        The loop toward a project's end state (James, 2026-11-08: "build anything it doesn't have, iterate until it reaches the end state"): run, find
        what is missing (gates, MOD-PC-WATCH), build it (MOD-PC-BUILD-STEP, Emerge writing the code, COS testing it), run again; stop on the end-state
        test's pass, a spent budget, or two iterations that change nothing, each said. Written in Emerge.
      deps: [{ name: build-step }, { name: pipeline-watch }, { name: box }]
      schema_refs: [BuildRequest, Box]
      exports: ["iterate({ project, pipeline, budget }) → { reached, iterations[], missing[] }", "POST /api/cos/loops", "row `cos loop`"]
      gate_pipeline: ["GATE-PC7-001: done only on the end-state test's pass", "GATE-PC7-002: a budget always bounds it", "GATE-PC7-003: a snapshot before each build, a Versionium record after"]
      behavioral_contracts: ["every iteration is a record", "it never claims the end state without the test"]
      error_paths: ["budget spent → stops, said, with what is missing", "no change twice → stops, said"]
      acceptance: ["a stand-in project needing two pieces passes on iteration 3; an unreachable one stops on its budget with what is missing"]

    - id: MOD-PC-CANVAS
      name: canvas-boxes
      uuid: cos-pipeline-canvas-canvas-v1-0000-2026-1108-001
      path: Eravos-Canvas:tools/orchestration/work
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

# ── ADDENDUM 2026-11-08 — the gates find the gaps; Emerge writes the code ──
# James, 2026-11-08, sending a node-canvas screenshot (night-flow.com: boxes in a library sidebar, typed ports, wires, a minimap) as the look:
# "Using the gates to determine gaps after each step. Eravos for the visual canvas, emerge for the code generation, idearium has a pipeline, all
# programmable and manageable. Agnostic. Eravos is perfect for this." Box gains budget, recovery and deterministic; the gate after every box answers
# open, closed or gap; a nested run has its own context; the build step's code comes from Emerge, by its route. Map: PC_D3 decided, PC_D5, PC_D6.

# ── ADDENDUM 2026-11-08 — gates are programmable types ──
# James, 2026-11-08: "Gates need to be programmable. Maybe compartment types like that cos has. Cos and agents can make more types by using schemas
# or building them from the chunking tool, work surface, etc." · "options are better than neat boxes. Programmable. Hard corded has to earn its place
# and a node or api call is better than static." Schemas GateType and GateAction, module MOD-PC-GATE-TYPES (PC5). PC_D1 and PC_D8 decided.

# ── ADDENDUM 2026-11-08 — Emerge the language; Intelligence watches; iterate to the end state ──
# James, 2026-11-08: "meta, autonmous, agsnotic, and nonlinear, is the goal, using emerge as the language. build anything it doesn't have, iterate
# until it reaches the end state. cos for tests, emerge should build stable code" · "yes .framework. idearium is for project management." Modules are
# written in Emerge (PC_D4 superseded); JavaScript stays only for the UI and for COS's manager until CIE10/CIE13, said per phase. MOD-PC-WATCH (PC6)
# and MOD-PC-LOOP (PC7) added. Gaps in Emerge found: no YAML reader, no folder listing (CIE14, CIE13).

# ── ADDENDUM 2026-11-08 — the canvas is ERAVOS's repository; no copy ──
# James, 2026-11-08: "I don't need a copy. It's going to be the same." · "the canvas is what the visual surface is, and then the tools are what to
# make for it. So that way, if it needs a tool, it can be made. If it's missing something, it can be built." IF-ERAVOS-SDK and MOD-PC-CANVAS now
# name ERAVOS's own repository (Eravos-Canvas:<path>). A missing tool is a build request (MOD-PC-BUILD-STEP) whose output is an ERAVOS tool.

# ── ADDENDUM 2026-11-09 (0.60.466) — THE IDEA, kept whole so it is not buried: the visual canvas makes all of Nexus programmable ────────────
# James, 2026-11-09, asked where the visual canvas for the pipeline is: "Rules and macros. Okay so where is the visual canvas for the pipeline.
# This is a major feature of nexus. Like huge. This can make debugging, contracts being built. The process that the system uses, copilot uses for
# its tools, this makes all of nexus programmable. Also visual debugging, emerges coding per gate. Gates can hold context, test, verify, gates would
# do a lot. But not the same everytime." · "Look at the cos ui phases. Also log this somewhere. So it doesn't get burried. I feel like most of my
# big ideas get lost. Spec it." · "Okay. So build this."
# What it is, in his words and the phases that carry it:
#   - one canvas (ERAVOS, PC4) where every process Nexus runs is drawn as compartments and gates: the system's own processes, copilot's tools, macros,
#     rules, pipelines, procedures, frameworks. Drawing it is programming Nexus.
#   - visual debugging: the wires carry the actual request (PC4); a stopped run shows the gate it stopped at and why.
#   - contracts being built: a gate's verify is a contract's test; a gap is a build request (PC3), a RAID contract.
#   - Emerge coding per gate: a gate that finds a gap hands Emerge the gap to write the code for (the emerge type, built 0.60.466).
#   - gates hold context, test, verify, and are not the same every time: a gate keeps what it saw across runs and decides from it (built 0.60.466).
# Built in 0.60.466 (MOD-PC-GATE-TYPES, PC5 slice a):
#   - cos/gate/gate.eg: GateRunner (Emerge): plan (the asks, filled), decide (open | closed | gap, from checks, answers and its context), validate.
#     Checks: holds (notEmpty, contains, lacks, equals, startsWith, longerThan), answer (an owner's route answered, and holds), changed (not what
#     it gave last time), a check marked gap. A reason that closes it gapAfter times running becomes a gap. {{with.x}}, {{output}}, {{why}},
#     {{pipeline}}, {{task}} filled; a setting left unset is no check.
#   - cos/gate/types/*.gate: check, test, verify, context, emerge, options (his own in COS's data, made by POST /api/cos/gate-types).
#   - cos/manager/gates.js: the door: reads the types, makes the planned calls on each owner by route, keeps each gate's context, does the
#     actions (note, retry, stop, skip, hold, route; branch and notify said as PC5b).
#   - the engine: a task's gate { type, with } is the host's to decide (gateFn); an engine with none refuses it, said. The verdict rides on the
#     task and on automation.pipeline.task with what passed (the wires' data, PC4).
#   - routes GET /api/cos/gate-types[/:id], POST /api/cos/gate-types, POST /api/cos/gate-types/:id/try, GET /api/cos/gates/:pipeline/:task;
#     rows cos gate-types, cos gate-try, cos gate-context.
# The .gate extension (EQ5's definition, its registry not built yet: written here until it is): what a file of it is: one GateType; schema:
#   GateType (above); owner: cos; written by: shipped with COS (cos/gate/types) and by him (POST /api/cos/gate-types → COS's data); read by:
#   cos/manager/gates.js and Emerge's cos/gate/gate.eg; kind: node (data, JSON).
# Gaps in Emerge found: starts_with and matches are handler keywords, not callable; no regex function (CIE14). Typed gates have no "matches".
# Open, in order: PC5b (options chosen by him resume a held run; branch; notify), PC4 live (the run's events on ERAVOS's canvas: needs COS to let
# ERAVOS's address in, his decision), the canvas preview to him before PC4's UI. "Rules and macros": what he means asked of him (rules and
# macros in the one Automation tab, or on the canvas).


# ── ADDENDUM 2026-11-09 (0.60.466, the same release) — one module, in Emerge; every request kept as files ─────────────────────────────────────
# James, 2026-11-09: "The gates are temporary unless it didn't finish." · "No. Terrible folder structure. This needs to be a module." · "Needs to use
# actual physical files in the backend, the steps. Like the dag and contract, and the relevant nodes. Like each step needs to be persistent until the
# contract and conditions for the request from the dag have been met." · "follow claude.md i thought we chose to move on and use .eg, emerge for code?"
# Superseding the paths above (kept, §0.3): cos/automation/, cos/gate/, cos/manager/boxes.js and the gates door are now ONE module, cos/pipeline/:
#   box.eg (the box shape; gains the dag hook) · gate.eg (decide, plan, validate; flags; the type files) · runs.eg (MOD-PC-RUNS, below) ·
#   cli.eg (the module's one command line) · types/*.gatetype · test/{box,gate,runs}.test.eg · registry.json (its own registry, §5.16) ·
#   index.js (the one door: starts Emerge, makes a gate's HTTP calls, takes the engine's events in order; no logic).
# MOD-PC-RUNS (cos/pipeline/runs.eg): a request is files before it runs and until its contract is met:
#   <COS data>/pipeline/runs/active/<id>/run.run (the request and its contract: every step's conditions from the DAG), dag.dag (box.eg's
#   with_gates), steps/<t>.step (one node per step: conditions, status, output, verdicts, what its gate learned), gates/<t>.gate (this request's
#   gate: type, settings, what it holds, its verdicts and what its calls got back). Met → gates removed, the folder moved to runs/done/<id>/.
#   Not met (failed, held, a gap, cancelled) → stays in active/ with its gates, and resumes from its step files (what is met is not run again:
#   the engine's run(id, { done, meta })). A gate's learning carries to the next request through the step files, so gates stay temporary.
# Routes: POST|GET /api/cos/pipeline/requests, GET /api/cos/pipeline/requests/:id, POST /api/cos/pipeline/requests/:id/resume (his; an agent's
# refused). Rows: cos request, cos requests, cos request-show, cos request-resume (personOnly where it acts).
# The extensions .gatetype, .run, .dag, .step, .gate are defined in cos/pipeline/registry.json (EQ5's definition, in the owner's registry).
# Emerge grew for it (CIE14): list_dir, path_exists, make_dir, move_path, remove_path (each write on the ledger); natively they wait for CIE13.

# ── ADDENDUM 2026-11-09 (0.60.468) — the data a request carries is nodes (his) ────────────────────────────────────────────────────────────────
# James, 2026-11-09: "i meant the data that runs through the pipeline like idearium pipeline does, emerge, .contracts with .dag, .chunk, .context or
# any of the nodes." · "look at the idearium pipeline, don't limit to just my request for the node types".
# Read first: Idearium's pipelines pass nodes, not text: the request spine (docs/2026-10-12-request-spine-phasemap.spec: intent → context
# obligations → gaps → the chunked .contract → the phase DAG → gated steps → cells), the spec engine's .chunk nodes (idearium/lib/chunk-nodes.js),
# RAID's .contract (cortex/core/raid/contract-intake.js), the import pipeline (MAPPING → CHUNKING → VERIFYING → INDEXING → GRAPHING). The node types
# are lib/node-schemas (75), every one an envelope (lib/node-export.js). Two he named were missing: .context (RQ7's answer, never kept as a node)
# and .dag; both added (schema.context, schema.dag; KNOWN_TYPES).
# Built (cos/pipeline/runs.eg, gate.eg; lib/automation/pipeline.js):
#   - a task says what it takes and gives: takes / gives, node types from lib/node-schemas (any of them, not a fixed list);
#   - a step's whole output becomes a node file of its type, nodes/<step>/out.<type>: the node itself when it gave one, else wrapped as what it
#     gives, else an .output; each step file names the node files it took (from the steps it waits on, of the types it takes) and gave;
#   - dag.dag (now a .dag node: for, boxes, wires) says what each wire carries;
#   - the request's contract is a real .contract node (schema.contract: uuid, forAgent, intention, endState), contract.contract; run.run points at it;
#   - a gate check `node` (and the shipped type node.gatetype): the step gave a node of the type named, with every field its schema requires; a
#     type Nexus does not define is a gap. Emerge has no YAML reader (CIE14), so COS's door gives it each type's required fields.
#   - the engine's task event carries the whole value for the host's files (value); COS strips it from the live stream (the preview stays).

# ── ADDENDUM 2026-11-09 (0.60.471) — a framework as a step, recursive; executable processes have schemas (his) ─────────────────────────────────
# James, 2026-11-09: "Frameworks as steps. Or a framework as a step. Recursive. Fully programmable. Executable processes. Schemas for them."
# - schema.process (one shape for every executable process: id, name, kind, status, agent, takes, gives, contract, execution, steps) and
#   schema.process_step (id, section, does, takes, gives, after, run | framework | pipeline, agent, check, when, retries, onFail); KNOWN_TYPES.
#   schema.framework stays Intelligence's generated .js skeleton (same word, a different thing), with a note pointing here.
# - The engine has a framework step (lib/automation/steps.js 'framework'; engine.js frameworkFn, a host hook): the host compiles the framework
#   and every framework its steps run, at any depth, children first (cos/pipeline/framework.eg compile_tree), keeps them as pipelines, and the
#   step runs as a pipeline step (the same chain, MAX_DEPTH, a child request linked to its parent).
# - A framework's step runs exactly one thing: run (any engine step), framework (recursive), pipeline, or an agent. A framework that runs itself,
#   directly or through others, is refused with the loop named, when compiled and when run.
# - Programmable execution: the framework's execution { retries, onFail } is its steps' default; a step's own wins. The default gate (a node of
#   the type it gives) applies where an agent does the step; a step that runs something else is checked by what it runs, or by its own check.

# ── ADDENDUM 2026-11-09 (0.60.472) — .pipeline and .macro: every kind of process, by name, as a step (his) ───────────────────────────────────────
# James, 2026-11-09: "Also .pipelines and .macros. Is it done?" Checked, said: pipelines ran as steps and nested (pipeline ↔ framework); macros ran as
# steps through Clear Glass; but a framework's step could reach a macro, a procedure or a workflow only through a generic run, and schema.pipeline
# and schema.macro did not say where they sit. Built: a framework step names any kind — framework, pipeline, macro (with params), procedure,
# workflow, or run (any engine step) — and runs exactly one; schema.process_step has each; schema.pipeline's tasks carry today's fields (framework
# and procedure steps, typed gates, takes / gives, when) and say a pipeline is a process; schema.macro says a macro is a process and a leaf (Clear
# Glass's page actions: it runs as a step of anything, and composes upward). Proof: eg framework 8/8; test-cos-pipeline 14/14 (CP-13).

# ── ADDENDUM 2026-11-10 — pipelines are all the piping in Nexus (his direction; nothing built by this addendum) ─────────────────────────────────
# James, 2026-11-10: "I’m not asking for it. I’m saying that’s what pipelines are going to be. All of the piping in nexus. Like data moving through
# wires from hook to hook." · "The infrastructure needs work and it needs decoupled still but this pipeline can get nexus doing all this itself."
# Before it, the same day: "The pipeline can make every process and event, visible in nexus. Cause and effect. Emergence. Every step of coding, or
# debugging, or a macro. Any scale for any system for, or any ai" · 2026-11-09: "The pipeline we build could be runtime processes. Ai contracts.
# Event driven pipelines for fault and failure node detection." · "The flight recorder and Virginium. Like snapshotting each gate for reversibility."
#
# Direction, recorded so it is not buried: the pipeline is not a feature beside Nexus's wiring, it IS the wiring. Every movement of data between
# systems is a wire carrying a typed node from one hook to another (a gate's hooks, PC_D1; the wire's `carries`, 0.60.468), on the one engine, with
# a gate on it. That is how every process and event becomes visible (cause → effect), checkable (gate), and reversible (checkpoint at each pass).
#
# What already stands on it (coder's reading, checked 2026-11-10):
# - the engine, typed wires and gates, requests as files, RAID's contract per request, frameworks/pipelines/macros as steps (0.60.464–0.60.476);
# - GS1 (contract-gates.js schedule): a checkpoint at each gate PASS, rewind to that gate's last-known-good on a writing FAILED, scoped to the gate's
#   file — built, but only inside Idearium's phase build (in-process versioning hooks), so only a pipeline's build step has it;
# - Diagnostic (senses, traces), Intelligence (causal graph, patterns), the flight recorder (reads Idearium runs only), Versionium (whole-commit
#   restore by route; file-scoped restore only in-process, lib/repo-history.js restoreFile).
# What the direction needs, and is the infrastructure he names (not built, not ordered):
# - decoupling: each system's hooks reached only through its own routes and component registry (§5.9–§5.16), so a wire can join any two hooks —
#   GS1's versioning and the file-scoped restore are in-process today and need routes before COS can wire them;
# - every system's events onto wires (Diagnostic's events have no listener today), so faults become event-driven pipelines;
# - a checkpoint per gate for every step, not only builds (GS1 reused, request-scoped, never whole-commit), and the flight record per request
#   composed from the request files, RAID evidence, Versionium and Diagnostic — no second store;
# - then Nexus plans and runs that work through its own pipelines (plan.eg, build-next), one step and gate at a time.
# Open, his: healing ownership (Diagnostic, or Cortex's self-heal kept with its scope stated); "Virginium" read as Versionium; the order.
# James, 2026-11-10, after it: "Like cos is the orchastrator for compartments in cos. That’s what make it standout. Similar to VMware but more meta,
# interconnected, ai automation, versioning. Possibility is endless" — COS's identity as he states it: the orchestrator of compartments, as a
# hypervisor manages machines, with what a hypervisor lacks: compartments wired to each other (the pipeline), automated by AI under contracts
# (RAID), and every state versioned (Versionium). Coder's note: the comparison holds for orchestration and snapshots; isolation as strong as a
# hypervisor's (memory, CPU, a crash kept inside) is not claimed — a compartment today is a process and a folder, kept apart by sovereignty.
