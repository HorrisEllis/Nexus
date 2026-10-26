# Agent drones: route a bounded agent-with-a-task to a target, safely and reversibly — one core, two human doors
# A "drone" is a bounded unit of agent work: a goal, a budget, a boundary it may not cross, an exit condition — routed to a
# target (a system, a COS compartment, a website, an automation), run under the confidence gate, and reversible (snapshot →
# run → stop/roll back). The CONTRACT is technical; the HUMAN never writes it — the UI takes a plain task and fills it, and
# the gate asks the human (last) only when it must. Copilot is the second entry point: it reaches drones through the one
# command table, the same door a person uses through the UI.
# MAPPED 2026-10-25 before code (docs/CLAUDE.md rule 1). REUSE, not a new agent system (rule 2): a drone is a COMPOSITION of
# primitives that already exist — nexus_autonomous_run (goal/budget/boundary/exit, RAID-gated, rewinds on drift), lib/raid-port
# (the route decision, §5.2), lib/agent-confidence-gate (pre-flight), lib/automation (the task's steps), Guardian (browser
# targets), and a COS compartment (the isolated, reversible airspace — when real). Order of delivery (his): backend → route →
# command → UI → copilot.

origin:
  date: 2026-10-25
  james: >-
    "with cos we can use that to route agents also. like agents need to be able to be like drones with tasks." · "but the ui
    is human. all easy to understand tasks." · "copilot is another entry point to navigate the system."
  context: >-
    After AE1 made the automation engine sovereign (0.60.256; core, each system its own instance). The drone router is the
    orchestration spine we agreed on: the thing that can run repair/heal/diagnose/migrate as bounded, routed, reversible agent
    work. COS is its airspace (a compartment bounds and can undo a drone's blast radius); the router works against existing
    targets now (a system via the mesh, a website via Guardian, an automation workflow) and gains the COS-compartment target
    when compartments are real — so it is NOT blocked on COS.
  reuse_2026_10_25: >-
    nexus_autonomous_run (lib — the drone contract shape + the rewind-on-sigma loop), lib/raid-port.js (route), lib/agent-
    confidence-gate.js (pre-flight, ask-human-last), lib/automation/engine.js (the task), guardian (browser deploy door),
    lib/run-state.js (live status), Versionium (snapshot for reversibility until COS compartments land).

decisions:
  DR_D1_contract:
    status: DECIDED 2026-10-25 by James (the shape) — "agents need to be able to be like drones with tasks"
    chosen: >-
      A drone is { target, task, goal, budget{maxSteps,maxMs,maxTokens}, boundary, exit } — the nexus_autonomous_run fields
      plus `target` (where it runs) and `task` (the plain human intent, kept verbatim). The contract is a core schema
      (lib/node-schemas/schema.drone); the human never authors it directly (DR4 fills it from a plain task).
  DR_D2_home:
    status: DECIDED by his axioms (§5.2 orchestration; sovereignty) — to confirm
    chosen: >-
      The router is the ORCHESTRATOR's (the control tower: dispatch, track budget/exit, reap). The contract schema + the
      drone library are CORE (lib/), because the UI, copilot and the orchestrator all use them (used by ≥2 → the kernel). RAID
      keeps the route decision; a drone runs in a COS compartment when one is real, else against an existing target with the
      reversibility that exists (autonomous_run rewind + a Versionium snapshot).

  DR_D3_the_gates_are_the_step_surface:
    status: DECIDED 2026-10-26 by James (his realization) — "maybe a step by step guide using the gates. holy shit this is
      why the gates. each gate can be a step, like a question, then holds the data, so that way agents can follow a order
      like stepwise, use the gates as the surface."
    context: >-
      Said while the drone contract (DR_D1) and the human/copilot doors (DR5/DR6) were open. He saw what the gates are FOR: a
      drone (or a person, or copilot) does not need a separate task format — it walks the GATES, in order, each gate a step.
      This is not a new idea bolted on; it names a line that already runs from his own earlier words to shipped code (REUSE,
      rule 2): (a) lib/step-gate.js + schema.step_gate — HIS 2026-09-29 "Why not gate each step with events": every build step
      passes a gate that emits step.passed / step.blocked WITH the causal id of the step before, so the steps already link in
      order and a block is a traceable event, not a silent empty; (b) schema.gate + the gate-memory record (GM1, 0.60.162) —
      a durable record per gate transition {status, context (references, never copies), response, hashes}, so a gate already
      HOLDS its data as persistent memory; (c) the contract gates — an ordered DAG with depends_on, evidence and resume. The
      gates are therefore already a stepwise, linked, data-holding surface; today's decision is to USE them as the one surface
      every actor advances, rather than inventing a second task/wizard format beside them.
    chosen: >-
      One surface: the ordered gate chain IS the step-by-step guide. A gate is a step; it may carry a QUESTION (a step that
      needs input — the gate-memory record holds the answer when given) or a CHECK (step.passed/step.blocked); its held data
      is the record (references, not copies); depends_on / the prior step's causal id is the order. A drone walks it stepwise
      (one gate at a time, with the full prior context the chain already carries), the human UI (DR5) shows the same gates as
      plain cards, and copilot (DR6) reads/advances the same chain — so person, drone and copilot share one memory and one
      order. Built on what exists (step-gate, gate-memory GM1, the contract DAG); nothing new invented beside them.
    reading_to_confirm: >-
      The coder reads "like a question, then holds the data" as: a gate step can be INPUT-gathering (it poses one question and
      the gate-memory record holds the answer), alongside today's check-gates — i.e. the gate surface spans both asking and
      checking, and a drone/person/copilot advances the same chain. If he means instead a distinct guided WIZARD that merely
      reuses gate styling, or that EVERY step must become a question, that is a different build — marked to confirm, not
      assumed. What is his and acted on now: the gates are the surface (not a second format). The exact UI is DR5's to confirm
      when built.
    rationale_2026_10_26:
      james: >-
        "Yeah but it cuts down tokens drastically. Makes it more agnostic. Can handle more complex tasks by offloading into
        the gates."
      context: >-
        The load-bearing WHY, and the coder had underweighted it (he had called the gate surface "a brick with nothing on it"
        until a walker consumed it; corrected here, §0.0 truth over coherence — the economics are the capability, not a later
        bonus). The gate chain is EXTERNAL memory: because each step's state is held in the gate record by reference, not copy
        (schema.gate — packetHash + context "references, not copies", GM1 0.60.162), an agent running step N is handed ONLY
        that step's packet (its spec + the specific prior outputs its depends_on names), never the whole transcript. Three
        consequences, in his order:
          1. "cuts down tokens drastically" — multi-step work stops growing the model's context O(N); each step carries one
             bounded, budgeted packet. The cut already exists: lib/phase-plan.js (GW24) ranks the dependencies' code and cuts
             it to the agent's budget, and names the cut; lib/context-builder.js assembles the packet. The gate chain is what
             makes the prior-step outputs addressable BY REFERENCE so there is something bounded to hand over.
          2. "makes it more agnostic" — the surface is DATA (step_gate nodes, gate records), not a model's context or a
             language. Any walker — a cheap local Ollama step, a deterministic checker, Claude for the hard step — reads and
             advances the same chain (ties to NC0 neutral core, 2026-10-19). The task does not belong to whoever started it.
          3. "offloading into the gates" — a task too big for one context window becomes a sequence of bounded steps whose
             complexity lives in the CHAIN (the structure), not in any one agent's head. This is why cheap models can do work
             they otherwise could not: the gates carry the state between small, bounded, resumable steps.
        The soundness condition (coder's, by the axioms, §0.1): the token offload is only as real as the steps are separable —
        a step must need only its declared inputs. That is exactly what his depends_on DAG discipline (DG1/DG2/DG3) already
        enforces, so the dependency-graph rules and the gate token-offload are the SAME mechanism seen twice. Where a step's
        true inputs exceed its declared ones, the packet is wrong and the saving is false; the walker must surface that (a
        step that reaches outside its packet is a gap, §1.2), never hide it.

phases:
  DR1_the_drone_contract_and_router:
    status: OPEN
    layer: library
    depends_on: []
    files: [lib/drone.js, lib/node-schemas/schema.drone]
    does: >-
      lib/drone.js: define(contract) validates a drone against schema.drone; deploy(contract, deps) composes the primitives —
      RAID routes (raid-port), the confidence gate runs pre-flight (agent-confidence-gate; a drone under 75% gathers context
      and its question is recorded for the human, never guessed), a snapshot is taken (reversibility), the task runs
      (autonomous_run for an open task, or lib/automation for a workflow task), and the run is tracked (run-state) with budget
      and exit enforced. stop(id) kills and rolls back. Dependency-injected (the repo-agent pattern) so it runs in a test with
      no live backend; a target that is not reachable is NAMED, not thrown (§1.2).
    proof: "test-drone.test.js: a contract validates; deploy runs the gate then the task and records a drone; budget/exit stop it; stop() rolls back; an unreachable target is named — all with injected deps, no backend"

  DR2_route:
    status: OPEN
    layer: integration
    depends_on: [DR1_the_drone_contract_and_router]
    files: [orchestrator/drones/index.js, orchestrator/orchestrator.js]
    does: >-
      The orchestrator serves the drone door on :9000: POST /api/drones (deploy a contract), GET /api/drones (list + live
      status), GET /api/drones/:id (one, with its steps and budget used), POST /api/drones/:id/stop (kill + roll back). The
      control tower — it holds the fleet, tracks each drone's budget and exit, and reaps finished/over-budget ones.
    proof: "a deploy over the door runs a drone (injected task) and lists it; stop halts and rolls back; the door is on the orchestrator, no crossing"

  DR3_command:
    status: OPEN
    layer: integration
    depends_on: [DR2_route]
    files: [idearium/cli/route-commands.js]
    does: >-
      The command rows, so every agent AND copilot get drones through the one table: `drone deploy <target> \"<task>\"`,
      `drone list`, `drone stop <id>`. These are the second entry point's reach (DR6): copilot navigates the system and deploys
      drones with the same rows a person's UI calls.
    proof: "the rows load well-formed; `drone list` prints the fleet; `drone deploy` posts a contract; in test-cli-route-commands"

  DR4_plain_task_to_contract:
    status: OPEN
    layer: library
    depends_on: [DR1_the_drone_contract_and_router]
    files: [lib/drone-intent.js]
    does: >-
      The human-to-contract translator (his "all easy to understand tasks"): a plain task + a target → a filled contract with
      sensible default budget/boundary/exit, the task kept verbatim as intent. What it cannot infer it does NOT invent — it
      leaves the gate to gather context and, below 75%, to ask the human last (reusing agent-confidence-gate, not a second
      asker). So the human gives intent; the contract is filled; the human is asked a plain question only when it matters.
    proof: "a plain task → a valid contract with defaults; an ambiguous task leaves the gate to ask, never guesses a boundary; pure, injected"

  DR5_the_human_ui:
    status: OPEN
    layer: ui
    depends_on: [DR3_command, DR4_plain_task_to_contract]
    files: [idearium/ui/js/drones-panel.js]
    does: >-
      The human door (his "the ui is human. all easy to understand tasks."): a drone is a plain card — \"<agent> is <task> on
      <target>\", with a live status (running / asking you / done / stopped), the budget used, and a Stop button. Deploy by
      picking a target and typing a plain task (DR4 fills the rest); when the gate is under 75% the card shows its one plain
      question. No budgets/boundaries/JSON on screen — those are the contract's, under the hood. Home: the BrainOS Flow canvas
      / the Code tab. Tested in Clear Glass (glass.js), never Playwright (AXIOMS §4.1, CG-001b).
    proof: "the panel driven in Clear Glass: deploy a plain task → a drone card appears, shows status, Stop halts it; the gate's question shows in plain words; no Playwright"

  DR6_copilot_entry:
    status: OPEN
    layer: integration
    depends_on: [DR3_command]
    files: [copilot/tool-runtime.js]
    does: >-
      The second entry point (his "copilot is another entry point to navigate the system"): copilot can deploy and watch
      drones conversationally — its tool scope includes the DR3 rows through the one command table, and a plain \"deploy an
      agent to <target> to <task>\" maps to DR4 + a deploy. Agents get exactly what a person gets, through the one door.
    proof: "copilot's tool scope lists the drone rows; a plain conversational deploy reaches DR4 + POST /api/drones; in the copilot tool tests"

order: >-
  DR1 (the contract + router core, DI) first, then DR2 (the orchestrator door), DR3 (the command rows — the reach copilot and
  agents share), DR4 (plain task → contract), DR5 (the human UI, plain cards, in Clear Glass), DR6 (copilot as the second
  entry). The router works against existing targets (a system via the mesh, a website via Guardian, an automation workflow)
  from DR1; the COS-compartment target (the isolated, reversible airspace) is added when compartments are real — it is the
  safest target, not a prerequisite. Each phase is specced again as .phase + .graph before its code (his 2026-10-20 order);
  nothing is built before this map. DG2 (0.60.250) foresees any crossing a phase would add.
