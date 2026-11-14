spec:

  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # cos/spec/pipeline.spec — THE PIPELINE: what it is, in one place. Written so it no longer has to be said again.
  # James, 2026-11-14: "can we make a spec or some formal document for the pipeline, im sick of trying to put it into words."
  # This is the definition and the contract. The modules already built are specified in cos/spec/pipeline-canvas.spec (the box, the gate
  # types, the runs, the loop, the canvas) and are named here, not repeated. Maps: docs/2026-11-08-pipeline-canvas-phasemap.spec,
  # docs/2026-10-21-brainos-into-idearium-phasemap.spec (the editor), docs/2026-10-13-projects-raid-and-gates-phasemap.spec RD9 (input → RAID).
  # Format: emerge's module spec, compiled by idearium/spec-engine/spec-compiler at specDepth 1.0.
  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        pipeline
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-11-14T00:00:00Z
    status:      specced
    uuid:        cos-pipeline-spec-v1-0000-2026-1114-jamesbrooks-001
    origin: >-
      His words, in the order he said them (each is part of this spec):
      2026-11-08 "steps as boxes, with wires as the flow into the hooks of gates as compartments … a step can also be a build request" ·
      2026-11-08 "raid creates compartments using a contract and the test and the dag for the stopping conditions" ·
      2026-11-09 "Gates are inbetween steps. So compartment, gate, compartment, gate." · "It's end state first reasoning. My framework at every level" ·
      2026-11-09 "its meant to be recursive and meta." · "Needs to use actual physical files in the backend, the steps." ·
      2026-11-10 "each event a step. each step measured by a delta … sigmas and deltas are domain agnostic … each contract when fullfilled could
      become a replayable macro to rebuild or reconstruct." · "seeing, changing, managing, diagnosing, exporting, testing, agnostic" ·
      "record each step in raids decision, dynamically building each step, as it goes. it all needs to be visable." ·
      2026-11-13 "i want all pipelines managable, orchastratred, and programmable in cos. all of them." ·
      2026-11-14 "input -> raid uses agent and contract tool … contract as the end state" · "raid is meant to route every request, from a
      contract or request." · "everything runs in the pipeline. litterally like the pipes of the system." · "the pipeline needs to be fully
      built, using ollama primarily." · "the steps are compartments in cos. the gates need to be explicit. no redundancy." · "workshop to edit
      each gate and step, extremely featured, full pipeline automation and orchastration." · "emerge coding word by word, visual debugging,
      running frameworks or pipelines, recursive and meta, like any process, system, etc can be systematized, stepwise, broken down, chunked,
      or bricks, or gaps, step, analysis or decomposition, its my framework".
      The ideas, the direction and every call here are his. The coder wrote them down, in his words where possible, and named the files.
    purpose: >-
      The pipeline is how anything gets done in Nexus. Any process (a build, a request, a framework, an application's events, Emerge code being
      written, a debug run) is broken down, end state first, into steps and the gates between them, run step by step, measured, and kept. It is
      his framework made executable: decomposition into bricks, chunks and gaps; a contract as the end state; a DAG as the conditions; RAID
      deciding; COS running; every step visible and every decision recorded.
    target_runtime: [node, browser, emerge]
    language_stack: [emerge, javascript, html, css]
    paradigm: [end-state-first, decomposition, dag, explicit-gates, recursive, agnostic, evidence-first, measured]
    axioms: ["§3.3 map before build", "§8.6 reuse before build: the engine, the box, the gate types, the runs and RAID's contract v2 exist",
      "§5.9/§5.15 sovereignty: a step reaches a system only by its route", "§1.1/§1.2 a step shows only what really ran; a refusal is said",
      "USER_AUTONOMY: what changes his work waits for his gate", "§10.3 one shape for every step and every gate; no second format",
      "§17.13 the logic in Emerge where Emerge can do it"]
    deps:
      - { name: cos, version: ">=0.9.0", required: true, purpose: "runs every step as a compartment and keeps every run" }
      - { name: raid, version: ">=0.60.530", required: true, purpose: "routes every request; books every contract" }
      - { name: ollama, version: "local", required: false, purpose: "the first agent; Guardian is the fallback" }
      - { name: eravos-canvas, version: ">=3.176", required: false, purpose: "the surface: the canvas and the Field" }

  # ── WHAT EACH WORD MEANS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  glossary:
    pipeline: "a DAG of steps and gates from an input to an end state; a .pipeline node file; runnable, exportable, importable, nestable"
    input: "anything asked of Nexus (his words, a command, an event); kept first as a .input node, then given to RAID"
    raid: "the router: every input and every agent call goes through RAID, which decides who does it, why, and books the contract"
    contract: "the end state and the conditions it is judged by; RAID's v2 contract (outcome, gates, invariants, gaps); done is derived, never declared"
    end_state: "what must be true when it is done; the contract's outcome; the pipeline's last node"
    dag: "what must happen before what; its edges are the conditions; a step runs only when every step it waits on has passed its gate"
    step: "one unit of work; it IS a COS compartment: a process COS runs, with its system, its command or route, its memory, its data, its ledger"
    gate: "its own node between two steps: a type (check, tests, dag, evidence, person, custom), its checks one by one, its verdict (open, closed,
      held, gap), what it does on a fail, what it learned; nothing passes a gate without evidence"
    relation: "a wire: what flows from one step through a gate to the next, and what node type it carries"
    brick: "a step broken down: the smallest piece an agent can do in one go; a step's bricks are its own pipeline (recursive)"
    chunk: "a piece of data or work sized to what the machine can hold now"
    gap: "what is missing to decide or to do; never guessed; it holds its gate and is put to him (or to RAID's agents) as a question"
    run: "one pass through a pipeline: every step's start, finish, wait, delta and output, every gate's verdict, every decision, kept as files"
    event: "anything that happens in a run (a step started, a gate decided, RAID chose); each is on the system's own ledger and streamed"
    baseline: "a step's usual time: mean, and a sigma from three runs; a run's delta against it; a z past 2 is said"
    kind: "a shape any process takes to be opened on the Field (a pipeline, an app's events, Emerge text, a debug run, a framework)"
    macro: "a fulfilled contract's steps, replayable, to rebuild or reconstruct what it built"

  # ── THE LIFECYCLE ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  lifecycle:
    - "1 INPUT: kept as a .input node before anything is decided (RD9, built 0.60.486)"
    - "2 RAID: decides the agent and why; fills the contract template (system, agent, hat, capability or command, data, tags, DAG, outcome);
         Emerge's say reads the words when the work is Emerge code; what it cannot fill is a gap (built 0.60.529, 0.60.530)"
    - "3 CONTRACT: booked as RAID's v2 contract; the DAG's nodes are its gates; the outcome is the end state"
    - "4 PLAN: end state first: the pipeline is drawn backward from the end state to what can be done now (cos/pipeline/plan.eg, built)"
    - "5 RUN: COS starts each ready step as a compartment, Ollama first; every step and decision is an event and a file (built in part)"
    - "6 GATE: after every step its gate decides on evidence; on a fail it retries, goes back, holds for him, or opens a gap (built 0.60.466)"
    - "7 MEASURE: each step's delta against its baseline (built 0.60.481); a slow or failing step is said, with its z"
    - "8 MANAGE: pause, continue, retry from any step (built 0.60.484); a held step waits for his verdict (built 0.60.496)"
    - "9 END STATE: RAID judges the contract met from the gates alone; the run is kept; the steps become a replayable macro"

  # ── RULES (each checkable) ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  constraints:
    - id: PL-001
      description: "Every step is a COS compartment: it has a system, a command or route, a process, a memory cap and a data folder; a step that names none is refused."
    - id: PL-002
      description: "There is a gate between every two steps; a wire that joins two steps directly is refused."
    - id: PL-003
      description: "A gate opens only on evidence (a check, a test, a hash, his word); a free sentence is unverifiable and never opens it."
    - id: PL-004
      description: "Every input and every agent call goes through RAID; a step that calls an agent directly is refused."
    - id: PL-005
      description: "The contract's end state is written before the first step runs; a pipeline without one is refused."
    - id: PL-006
      description: "A gap is never guessed: it holds its gate and is asked."
    - id: PL-007
      description: "Ollama is the first agent; Guardian is asked only when Ollama cannot (said on the step)."
    - id: PL-008
      description: "Heavy steps wait while free memory is under the line (25%); work is chunked to what the machine can hold."
    - id: PL-009
      description: "Each fact is shown once: the machine in one place, the run in one place, the work on the canvas, the rest in the tools."
    - id: PL-010
      description: "A step can be a pipeline, and a pipeline a step, to any depth with no loop (recursive and meta)."

  schemas:

    - id: Kind
      name: Kind
      description: "Any process shaped to be opened, edited and run on the Field: its layers, its picture, its status. The ERAVOS Field's kind (tools/core/field/field.js)."
      fields:
        id:      "string — lowercase name, e.g. nexus.pipeline, nexus.events, nexus.emerge-text, nexus.debug-run, nexus.framework"
        label:   "string"
        layers:  "fn(doc) → [{ id, label, group, type: constraint|curve|value|events|emergent, sub, fields }]"
        get:     "fn(doc, key) → value"
        set:     "fn(doc, key, value) → doc (one undo step)"
        draw:    "fn(g, W, H, doc, { selected }) → the picture"
        outline: "fn(doc) → [[depth, text, layerId]] — the decomposition as a tree"
        status:  "fn(doc) → [[label, value]]"
        addable: "fn(doc) → what can be added: compartment, gate, relation, brick, gap, a pipeline as a step"
      behavioral_contracts:
        - "a kind names no domain the Field must know: the same surface opens a pipeline, an app's events, Emerge text, a debug run"
      error_paths:
        - "a kind missing layers, get, set or draw → refused, each missing part named (the Field's own check)"

    - id: StepEdit
      name: StepEdit
      description: "What the workshop can change on a step: everything the step is."
      fields:
        compartment: "system, command or route, its arguments, its memory cap, its data, its hat"
        agent:       "who does it (RAID's pick, or pinned), the model, the context window"
        bricks:      "how it is broken down; each brick its own step, recursively"
        takes_gives: "the node types it takes and gives (the wires)"
        when:        "its condition; its retries; its timeout; its baseline"
      behavioral_contracts: ["every edit is one undo step and is written to the .pipeline file"]
      error_paths: ["an edit that breaks PL-001..PL-010 is refused, named"]

    - id: GateEdit
      name: GateEdit
      description: "What the workshop can change on a gate: everything the gate is."
      fields:
        type:     "check · tests · dag · evidence · person · a gate type he made (.gatetype)"
        checks:   "each check, one by one, each machine-checkable"
        on_fail:  "retry N · back to a step · hold for him · open a gap"
        learned:  "what it saw across runs (read, never edited by hand)"
      behavioral_contracts: ["a gate is tried on a sample output before it is kept (dry run)"]
      error_paths: ["a check that cannot be verified is shown as unverifiable, never as passing"]

  interfaces:

    - id: IF-PIPELINE-CANVAS
      name: pipeline-canvas
      path: cos/spec/pipeline-canvas.spec
      description: "The modules already built: the box (MOD-PC-BOX), gate types (MOD-PC-GATE-TYPES), runs as files (MOD-PC-RUNS), the loop, the canvas."
      exports: ["Box", "GateType", "Wire", "BuildRequest"]
      behavioral_contracts: ["a box is a COS compartment; a gate is explicit and typed; a run is a file under cos/pipeline/runs"]
      error_paths: ["an unknown gate type is refused, never guessed"]

    - id: IF-RAID-INPUT
      name: raid-input
      path: cortex/core/raid/input.js
      description: "RD9: the .input node, RAID's decision, the contract template (contract-template.js), Emerge's say for Emerge work."
      exports: ["POST /api/raid/input", "GET /api/raid/contract-template"]
      behavioral_contracts: ["every input becomes a .input node; RAID routes it by the contract, the end state"]
      error_paths: ["an input with no kind is held and asked, never routed by guess"]

    - id: IF-FIELD
      name: eravos-field
      path: Eravos-Canvas:tools/core/field/field.js
      description: "The Field: a Photoshop-like surface (layers, outliner, properties, history, stations, status) for any kind."
      exports: ["Workshop.addKind(kind)", "Workshop.open(kindId, doc, { onChange, onApply, onClose })"]
      behavioral_contracts: ["a kind is {id, label, layers, get, set, draw, outline, status, addable, actions, stations}; the Field edits it, the pipeline owns it"]
      error_paths: ["a kind missing get or set is not registered"]

  modules:

    - id: MOD-PL-WORKSHOP
      name: pipeline-workshop
      uuid: cos-pipeline-workshop-v1-0000-2026-1114-001
      path: Eravos-Canvas:tools/orchestration/pipeline-kind
      description: >-
        His "workshop to edit each gate and step, extremely featured": the pipeline as a kind on ERAVOS's Field. Every step and every gate is a
        layer; selecting one shows all of it in PROPERTIES (StepEdit, GateEdit); the outliner is the decomposition (input → RAID → steps and
        gates → end state, each step's bricks under it); the view draws the DAG; HISTORY undoes any edit. Add makes a compartment, a gate, a
        relation, a brick, a gap, or a pipeline as a step. Dry-run a gate on a sample; open any brick as its own pipeline (recursive).
      exports: ["the kind nexus.pipeline", "edit(step|gate, key, value)", "add(kind)", "openBrickAsPipeline(id)", "dryRunGate(id, sample)"]
      gate_pipeline: ["GATE-PL-W1: the kind passes the Field's check", "GATE-PL-W2: every edit round-trips the .pipeline file"]
      behavioral_contracts: ["the workshop changes the .pipeline file only through COS's routes", "an edit while a run is live applies to the next run, said"]
      error_paths: ["a rule broken (PL-001..PL-010) → the edit refused, the rule named"]

    - id: MOD-PL-ORCHESTRATE
      name: pipeline-orchestration
      uuid: cos-pipeline-orchestrate-v1-0000-2026-1114-001
      path: cos/pipeline/orchestrate.eg
      description: >-
        "full pipeline automation and orchastration": every pipeline in Nexus runs in COS; an input becomes a run through RAID with no hand in
        between; triggers (an event, a schedule, a held request answered) start runs; ready phases are taken from Idearium's queue and built one
        request at a time, Ollama first, sized to the machine (PL-007, PL-008); a run that fails goes back or holds per its gates.
      exports: ["start(input) → run", "triggers()", "next() → the next ready request", "budget() → what the machine allows now"]
      gate_pipeline: ["GATE-PL-O1: a run starts only with a booked contract", "GATE-PL-O2: no two heavy steps at once under the memory line"]
      behavioral_contracts: ["every start, gate and decision is an event on COS's ledger", "a machine under pressure slows the runs, it does not drop them"]
      error_paths: ["Ollama down → Guardian, said; both down → the run holds with a gap"]

    - id: MOD-PL-LENSES
      name: process-lenses
      uuid: cos-pipeline-lenses-v1-0000-2026-1114-001
      path: cos/ui/automation/lenses.js
      description: >-
        "any process, system, etc can be systematized, stepwise, broken down": the same Field opens other kinds, each a lens on a process —
        an application's events as steps; Emerge code word by word (Emerge's say: each word, what it means, the gaps); a debug run (the ledger,
        scrubbed step by step, each entry's hash); a framework running (its steps from its .framework file). They are chosen in COS's
        Automation tab (cos/ui/automation), his 2026-11-14 "the rest of those tabs can be in the cos ui automation tab", not on the canvas.
      exports: ["the kinds nexus.events, nexus.emerge-text, nexus.debug-run, nexus.framework"]
      gate_pipeline: ["GATE-PL-L1: each lens reads only its owner's routes"]
      behavioral_contracts: ["a lens shows what happened; changing a process goes back through its pipeline"]
      error_paths: ["an owner not answering → the lens says so and shows the last kept state"]

    - id: MOD-PL-SURFACE
      name: pipeline-surface
      uuid: cos-pipeline-surface-v1-0000-2026-1114-001
      path: Eravos-Canvas:canvas
      description: >-
        The surface (his previews 4 and 6): ERAVOS's blank canvas; its top bar holds ＋ Add only; Idearium's side tabs on the RIGHT edge only
        (the tools: plan, outputs, changes, tasks, context, tools, control, all/none); every part a tool window wired port to port; the Field
        in the dock on the selected step. No tabs on the left (his, 2026-11-14: "right tabs yes, left tabs, absolutely not. the rest of those
        tabs can be in the cos ui automation tab."): the lenses live in COS's Automation tab (MOD-PL-LENSES).
      exports: ["the canvas", "the right side tabs", "the dock"]
      gate_pipeline: ["GATE-PL-S1: PL-009, each fact shown once", "GATE-PL-S2: tested in Clear Glass"]
      behavioral_contracts: ["the surface reads and acts only through COS's and RAID's routes and events"]
      error_paths: ["COS not answering → the canvas says so; nothing is drawn as running that is not"]

# ADDENDUM 2026-11-14 (b) — the Field is the editor; BrainOS's backend migrates, its UI is scrapped.
# James, 2026-11-14, of preview 7: "no the field/workshop would be an extensive editor for gates and steps. all of the pipeline and workflow
# automation, systems, commands, all of it, everything, migrating brainos backed not the ui its bad the ui and scrapping it"
# - MOD-PL-WORKSHOP expands: the Field is the whole editor, not a dock under the canvas. It edits every step and gate in full: conditions
#   (all/any groups, the 15 operators), on pass / on fail / on timeout (each explicit, each an event), triggers, the step's system, command,
#   agent and hat, chunking, heartbeat, dry-run on a sample, history, the run's ledger as a debugger. Preview: cos/ui/pipeline-editor/preview-8.
# - BrainOS's backend migrates into COS (sovereign, through COS's routes; Emerge where it replaces JS, §17.13): lib/automation/{engine, steps,
#   pipeline, cron, templates, template, task-node, dom, routes}.js, lib/automation-nodes.js (.workflow, .macro), lib/automation-registry.js,
#   clear-glass/src/mesh/route-graph.js. Its 8 step types, 28 browser actions and condition operators become the Field's palette.
# - BrainOS's UI is scrapped, not migrated: lib/ui/brainos/, lib/ui/brainos-float/. Removed once the Field covers what they reach (his call
#   stands; the removal is a phase, so nothing he still opens disappears first).

# ADDENDUM 2026-11-14 (c) — the pipeline runs on the canvas; the Workshop edits ONE gate or step. Corrects (b)'s "the Field is the whole editor".
# James, 2026-11-14, of preview 8: "okay but the pipeline runs in the canvas. the workshop only edits one gate or step at a time"
# - The canvas (preview 7) holds and runs the whole pipeline: compartments, gates, wires, outputs, right side tabs.
# - MOD-PL-WORKSHOP opens over the canvas on one gate or one step (double-click / Edit) and edits only that one, in full: its layers, its
#   inputs and outputs on the canvas, its conditions or its bricks, outcomes, properties, dry-run samples, its own history in the ledger.
#   Apply writes it back to the canvas through COS's routes. Preview: cos/ui/pipeline-editor/preview-9 (a gate). BrainOS's backend is the
#   palette of what can be added to that one gate or step; BrainOS's UI stays scrapped.

# ADDENDUM 2026-11-14 (d) — the canvas, quiet; right tabs slide out. James, 2026-11-14: "okay now show the canvas. thats the workshop. okay now
# remove any noise. less overwhelm but same amount of power and leverage." · "better but the tabs slide out from the side like ideariums ui."
# - MOD-PL-SURFACE: the canvas shows one run window, compartments (name, system, status), gates as diamonds on the wires; the detail is in the
#   Workshop (preview 9). Each right tab slides out as a drawer over the canvas and slides back; Outputs lives in its tab, not a window.
#   Previews: cos/ui/pipeline-editor/preview-10 (quiet), preview-11 (OUTPUTS slid out).
