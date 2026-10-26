# The gate chain as the programmable agent surface: a walker that runs steps, each routed to its own agent, composable
# His realization (2026-10-26), across three messages: "holy shit this is why the gates. each gate can be a step, like a
# question, then holds the data, so that way agents can follow a order like stepwise, use the gates as the surface." · "it
# cuts down tokens drastically. Makes it more agnostic. Can handle more complex tasks by offloading into the gates." · "Yes
# and dynamic decomposing/chunking using the tool. Breaking down primitives. Makes it programmable. Each gate can be a
# different agent. It can be a new tal[cut off — tool/task, to confirm]."
#
# MAPPED 2026-10-26 before code (rule 1). REUSE, not new (rule 2): the gate chain is already a stepwise, linked, data-holding
# surface — lib/step-gate.js (HIS 2026-09-29 "gate each step with events": steps emit passed/blocked with the prior step's
# causal id), schema.gate + gate-memory (GM1, 0.60.162: a durable record per transition, references NOT copies, packetHash),
# the contract gates (ordered DAG, depends_on, evidence, resume). The token offload reuses lib/phase-plan.js (GW24: rank the
# deps and CUT to the agent's budget) + lib/context-builder.js (assemble the packet). Per-gate routing reuses lib/raid-port.js
# (decide/via) + lib/route-eligibility.js (needsOf/check — who can run this). Decomposition reuses lib/work-funnel.js (FN0:
# task → spec → phase → chunks) + lib/code-intel/chunker.js + the component store. Gate-as-tool reuses idearium/cli/route-
# commands.js (the one table). The ONE new thing is the WALKER: the loop that advances a chain step-by-step, hands each step
# only its budgeted packet, routes it to its own agent, writes the result back as the next gate record, and lets the chain
# GROW as it runs (dynamic decomposition). Everything else it composes.

origin:
  date: 2026-10-26
  james: >-
    "Yes and dynamic decomposing/chunking using the tool. Breaking down primitives. Makes it programmable. Each gate can be a
    different agent. It can be a new tal[cut off]."  (greenlighting the gate-walker unit, and widening it)
  context: >-
    After DR_D3 (the gates are the step surface) and its rationale (the gate chain is external memory → tokens, agnostic,
    offload). He said yes to the walker + ask-kind unit, then widened it: the chain is decomposed DYNAMICALLY (a task is
    chunked down to primitives using the one tool), the surface is PROGRAMMABLE (gates compose), and EACH GATE CAN BE A
    DIFFERENT AGENT (a step is routed to the cheapest-capable agent, his "agents for what theyre best at, as little as
    possible" rule, 2026-10-13). This map is the gate surface's own home now; DR_D3 in the drones map points here.
  reading_to_confirm: >-
    "It can be a new tal…" is cut off. The coder reads it as "a new TOOL" — a composed, validated gate chain saved as a row in
    the one command table (route-commands), so a chain is itself invocable by any agent/copilot (GWK4). If he meant "a new
    TASK" (a chain spawns a sub-task) that is already GWK2's dynamic decomposition; if "a new TALENT/skill" that is close to
    GWK4 too. Marked to confirm; GWK1 (the walker) does not depend on which.
  his_order_of_delivery: >-
    Backend JS → API route → command → UI, in that order (2026-10-07). GWK1 is the backend walker. The route + command is
    GWK5, the human UI GWK6. The surface has no screen until GWK6 — said plainly here, not hidden (a phase with deferred UI
    is named, CLAUDE.md).

decisions:
  GWK_D1_the_walker_is_core_and_DI:
    status: DECIDED 2026-10-26 by his axioms (used by ≥2 systems → the kernel; NC0 neutral core) — to confirm
    chosen: >-
      lib/gate-walker.js is CORE: the drone router (orchestrator), copilot, the CLI and the UI all walk chains, so the walker
      is the kernel's, reached without a crossing. It is a dependency-injected neutral core (NC0, 2026-10-19): it RECEIVES its
      hooks — assemblePacket(step), routeStep(step), runStep(step, packet, agent), writeRecord(record), ask(step) — and never
      reaches into a system. So it is unit-tested with injected hooks, no backend, no model, no Electron; the real bindings
      (phase-plan/context-builder for the packet, raid-port/route-eligibility for the route, gate-memory for the record) are
      the integration phases. The walker owns only: which step is ready (depends_on satisfied), the one-step-at-a-time loop,
      the append-mid-walk seam (dynamic decomposition), resume from the last record, and the §1.2 gap when a step reaches
      outside its packet.
  GWK_D2_step_kinds:
    status: DECIDED 2026-10-26 by the coder's reading of his words (ask/act/check) — to confirm
    chosen: >-
      A step has a kind: `ask` (gather input — poses one question, the record holds the answer; his "like a question, then
      holds the data"), `act` (an agent does work — routed to its own agent, his "each gate can be a different agent"), or
      `check` (a verdict on an output — REUSES lib/step-gate.js's existing check kinds: non_empty, not_refusal, not_asking_back,
      parses). This keeps step-gate's role intact (it gates outputs) and puts `ask`/`act` in the walker, not forced into the
      verdict pipeline. A step also declares `needs` (its inputs, by reference) and `depends_on` (its order) — the two that
      make the packet bounded and the token offload real.

phases:
  GWK1_the_walker_and_chain_schema:
    status: OPEN
    layer: library
    depends_on: []
    files: [lib/gate-walker.js, lib/node-schemas/schema.step_chain]
    does: >-
      The one new thing. schema.step_chain: an ordered set of steps, each { id, kind (ask|act|check), needs (declared inputs
      by reference), depends_on, params }. lib/gate-walker.js (DI): walk(chain, hooks) resolves the next ready step (its
      depends_on satisfied by records already written), calls assemblePacket(step) for ONLY that step's budgeted slice, then
      by kind — ask → ask(step) and hold the answer in the record; act → routeStep(step) to an agent then runStep(step,
      packet, agent); check → run the step-gate verdict — and writeRecord(record) with the result BY REFERENCE (never the
      whole transcript). It supports append(step[]) mid-walk so a step can decompose into sub-steps (the dynamic-decomposition
      seam), re-checking the DAG on each append (no cycle, every depends_on resolves — reuse lib/phase-dag.js rules). Resume
      re-walks from the last record. A step whose run reads outside its packet is a gap (§1.2), surfaced, never hidden. Pure,
      injected — no backend, no model.
    proof: "test-gate-walker.test.js (headless, injected hooks): a 3-step chain runs in depends_on order, each step's hook sees ONLY its own packet (not the prior steps' transcripts); an ask step holds its answer; an act step is handed the agent routeStep named; a check step blocks the walk on a failing verdict; append() adds a sub-step and it runs in order; a step reaching outside its packet is reported as a gap; resume continues from the last record"

  GWK2_dynamic_decomposition:
    status: OPEN
    layer: integration
    depends_on: [GWK1_the_walker_and_chain_schema]
    files: [lib/gate-decompose.js]
    does: >-
      His "dynamic decomposing/chunking using the tool. Breaking down primitives.": a task → a step_chain, decomposed to
      primitives. REUSE: lib/work-funnel.js (FN0 task → spec → phase → chunks), lib/code-intel/chunker.js (structural chunks),
      and the component store (resolved primitives). A step that is too big decomposes into sub-steps appended to the chain
      (GWK1's append seam) as the walk runs — the chain grows to fit the task, it is not authored whole up front. Each
      decomposition is itself a gate (traceable), so "why these steps" is on the chain.
    proof: "a coarse task decomposes into a valid step_chain (DAG checks pass); an oversized step decomposes into sub-steps appended mid-walk; the primitives come from the chunker/component store, not invented — injected, no backend"

  GWK3_each_gate_its_own_agent:
    status: OPEN
    layer: integration
    depends_on: [GWK1_the_walker_and_chain_schema]
    files: [lib/gate-walker-route.js]
    does: >-
      His "Each gate can be a different agent.": the routeStep hook, bound for real. Each act step declares its `needs`
      (route-eligibility.needsOf); the router (raid-port.decide, route-eligibility.check) picks the CHEAPEST-CAPABLE agent for
      THAT step — deterministic/parser first, then local Ollama, then a reasoning agent only where the step needs it (his
      "agents for what theyre best at, as little as possible", 2026-10-13). So one chain runs across many agents, each step on
      the right one, and the choice + cost is recorded on the step's gate record (count it, not a feeling — phase AG1).
    proof: "a chain of three act steps routes each to a different agent by its needs (a parse step → deterministic, a bulk-write step → Ollama, a root-cause step → reasoning); the route decision + cost is on each record; an unroutable step is named, not silently dropped — injected RAID"

  GWK4_programmable_gate_as_tool:
    status: OPEN
    layer: integration
    depends_on: [GWK2_dynamic_decomposition, GWK3_each_gate_its_own_agent]
    files: [idearium/cli/route-commands.js]
    does: >-
      His "Makes it programmable … a new tal[tool, to confirm]": a composed, validated chain is saved as a row in the one
      command table (route-commands SPEC), so a gate chain is itself a tool every agent and copilot can invoke through
      nexus.command — the chain becomes a reusable primitive (compose, then name). Only a chain that validates (DAG clean,
      every step routable, every need resolvable) can be saved, so a saved tool is sound by construction.
    proof: "a validated chain saved as a command row runs by its key through the one table (as every agent sees it); an invalid chain is refused with the reason; in the route-commands + cli tests"

  GWK5_route_and_command:
    status: OPEN
    layer: integration
    depends_on: [GWK1_the_walker_and_chain_schema]
    files: [idearium/api/index.js, idearium/cli/route-commands.js]
    does: >-
      His order of delivery (backend → route → command): GET /api/gate-chain/:scope (the chain + its records), POST
      /api/gate-chain/:scope/walk (advance it), POST /api/gate-chain/:scope/answer (an ask step's answer). Command
      `chain <scope> [--walk] [--answer <step> <value>]`. So a person, copilot and an agent all drive the same chain.
    proof: "the route walks a chain and returns its records; an answer lands on the ask step; the command drives it; route contracts + cli tests pass"

  GWK6_the_human_surface:
    status: OPEN
    layer: ui
    depends_on: [GWK5_route_and_command]
    files: [idearium/ui/js/gate-chain-surface.js]
    does: >-
      His "the ui is human. all easy to understand tasks." (DR5): the chain as plain stepwise cards — each step in order, what
      it is (ask/act/check), who ran it (which agent), its held data, pass/block; an ask step shows its one plain question and
      takes the answer; a blocked step shows why. The programmable surface, visible and walkable by a person. Tested in Clear
      Glass (glass.js), never Playwright (AXIOMS §4.1, CG-001b). UNTIL GWK6 the surface has no screen — said plainly.
    proof: "driven in Clear Glass: a chain shows as ordered cards with each step's kind, agent and data; an ask step takes an answer and the walk advances; a blocked step shows its reason; no Playwright"

order: >-
  GWK1 first — the walker + the step_chain schema, dependency-injected, the ONE new thing; it is fully provable headless (a
  chain runs in order, each step sees only its packet, append grows the chain, a packet-escape is a gap). It builds the seams
  his whole vision needs — per-gate routing (routeStep), dynamic decomposition (append), ask (the kind), token offload
  (packet-per-step by reference) — as hooks, so GWK2 (decompose to primitives, reuse work-funnel + chunker), GWK3 (route each
  gate to its own agent, reuse raid-port + route-eligibility) and GWK4 (save a validated chain as a tool in the one table)
  each fill a seam without reshaping the walker. GWK5 is the route + command, GWK6 the human surface (the first screen — the
  surface is backend-only until then, said plainly). Each phase specced again as .phase + .graph (his 2026-10-20); DG2/DG3
  check the DAG. Nothing built before this map. REUSE over build throughout: the walker composes step-gate, gate-memory,
  phase-plan, context-builder, raid-port, route-eligibility, work-funnel, code-intel and the command table — all already in
  the kernel.
