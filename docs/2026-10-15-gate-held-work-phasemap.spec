# docs/2026-10-15-gate-held-work-phasemap.spec
# Nexus holds the complexity; each gate is a reproducible step any agent or chat can take. A contract is traced end to end,
# a failure is a macro, a run can be rewound and replicated, and copilot works through the same gates.
# MAPPED 2026-10-15, before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec.
# Follows docs/2026-10-15-code-tab-run-state-phasemap.spec (CE1-CE5, CE10 built, 0.60.50),
# docs/2026-10-15-automatic-tracking-phasemap.spec (GT2, GA1 built), docs/2026-10-13-nexus-memory-gates-and-contract-phasemap.spec
# (CT0-CT1b, SC0, EX0 built; GT0, MEM0, CX0 open) and docs/2026-10-05-failure-reproduction-phasemap.spec (FM1-FM4 open).
# This map adds no parallel plan. It indexes the phases that already own each ask, says what is built, and names what is new.

origin:
  date: 2026-10-15
  james: >-
    "make sure to read the .spec, atlas, loom component map, repos for each system for context. the axioms are to be
    consulted for each decision. thats vital. any phases that get it working, more stable, and improve it. the gates i
    want to make nexus hold as much of the complexity, make each agent able to not need the same chat, like the gates,
    and nexus hold the persistent data, so we could use a different chat or agent each gate. expand any agent tools you
    can, and update the listener. like the agents are supposed to be able to be copilot also. i want copilot to use these
    gates also. the intelligence system."
  second_message: >-
    "each contract tracked through the system using the event ledger, tagging and each gate, the intelligence system,
    physical file running through the back end. creating a failure mode macro using each gate as a reproducable step,
    rewind engine to replicate agents, like a completetly reproducable macro, causal graph, failure mode field."
  reading: >-
    The coder's reading (his to correct). The gate is the unit of work; a contract is a chain of gates. Today a gate is
    run by one agent in one chat, and that chat's memory carries it. The ask is the reverse: a gate is a sealed packet
    (what to do, the smallest context, the evidence upstream), its result is evidence written to Nexus, and the next
    gate can go to any provider or a fresh chat because nothing it needs lives in a chat. Every move of every gate is
    tagged with the contract, the gate, the files it touched and the commit it ended on, so one query returns the
    whole story of a contract. Because each gate's inputs and outputs are recorded, a run is a macro: it can be
    replayed, rewound to any gate, and re-run with a different agent to compare. Failures are read over the causal graph
    of those records and mapped across the conditions they happened in (the failure mode field).

axioms_consulted:
  # docs/AXIOMS-v3.1.md, read 2026-10-15. Each phase below names the ones that decide it.
  - "§2.1/§2.2 persistence is the source of truth: a gate's state in a chat is not state. -> GW1, GW2"
  - "§2.3 all state observable: if the dashboard cannot see it, it does not exist. -> GW3, GW9"
  - "§5.9/§5.10 sovereign systems, interaction only through declared contracts: a packet and its evidence are the contract between gates. -> GW1"
  - "§7.6 the code is a projection of the ledger: contract tracing reads the ledger, it does not keep a second record. -> GW3"
  - "§11.1 a cause is as important as the field it happened in: the failure mode field. -> GW8"
  - "§11.3 compound analysis is async and never blocks the write path. -> GW7, GW8"
  - "§12.2 a test must be able to fail. -> every phase's proof names the failing case"
  - "§15.1-§15.3 co-pilot iterates to fulfillment, every iteration an event, learning is cumulative. -> GW4, GW6"
  - "§16.1 close the nearest gap first: tracking (GW3) before replay (GW7). -> build_order"
  - "§16.4/§16.7 simple things stay simple; an abstraction must remove more complexity than it adds: no new gate type, no new runner. -> the whole map"
  - "§9.1 RAID is the only write authority for the system's own decisions: routing a gate to an agent goes through the model door and RAID. -> GW2, GW5"

found:
  # §8.6 - read from source on 2026-10-15
  - "gates are bricks of a v2 .contract: cortex/core/raid/contract-gates.js (states BLOCKED READY RUNNING PASSED FAILED STALE; packet <gate> = the smallest context; split; evaluate; schedule({executors, versioning}))"
  - "executors: cortex/core/raid/contract-adapters.js (agent via lib/model-door.js, phase, tool); checkpoints; Boundaries learn the size each agent handles"
  - "per gate move (GT2, 0.60.42): a bus event, a repo activity-log row, a replay-engine decision, and on PASSED a Versionium tag gate/<contract>/<gate> on the commit"
  - "step gates: lib/step-gate.js + lib/step-gates/*.step_gate (reply and file checks at one step; on_block reprompt|retry|fallback). Different from contract gates: a step gate checks one reply, a contract gate is a unit of work."
  - "run state (0.60.50): lib/run-state.js - a .run node per repo + session: goal, steps, files read/changed, attempt, off-task events. Keyed to the CHAT SESSION, not to a gate."
  - "ledgers: lib/component-ledger.js write() takes causedBy, contractUuid, session, tags and mirrors to JAA and ledger-fanin. Contract-gates does NOT pass contractUuid (grep: no match in contract-gates.js or ledger-fanin)."
  - "causal index: intelligence/rfr2 (kernel ingest typed edges; causality; clip snapshotRange/restoreClip) via lib/rfr2-bridge.js - built, nearly unconsumed (FM1 says so)"
  - "replay: lib/replay-engine.js (snapshot, logDecision, replay in sandbox only, detectDivergence). lib/shadow-space.js; cos/testenv (the compartment a macro would run in)."
  - "intelligence: copilot/adaptive-fulfillment.js (reflection + fault taxonomy + RAID weights, §15); cortex/self-heal/fault-taxonomy.js; lib/phase-faults.js; gap system enrichGap (spec drift gaps); meta/cfr (sigma, friction, regime; 24 consumers: highest-risk file to touch)"
  - "tools: lib/agent-tools/tools/* (159 files, 27 groups). nexus.command runs every idearium/cli/route-commands.js row (contract.new, contract.gates, contract.packet, contract.check, contract.audit are rows); copilot/server.js uses toolRuntime.runViaAgent with the same tool registry."
  - "listener: lib/listener-commands.js runs `nexus> ...` lines, ```nexus fences and `idearium ...` lines a Guardian listener hears. It does not read a spec or know what a stage expects."
  - "NOT built: lib/failure-macro.js (FM2), any contract-level trace query, any gate-bound run state, copilot dispatch through contract gates."

open_decisions:
  GW0_what_is_a_gate:
    asked: "the gates are supposed to be checks, can also be compartments (his, earlier today). There are three things called a gate."
    options:
      a: "The unit of work is the CONTRACT GATE (a brick). Step gates are checks run inside a brick's step (they stay as they are). The run state moves from 'one per chat session' to 'one per brick attempt', and the session is only a pointer."
      b: "Keep the run keyed to the session and add a contract link."
    coder_recommends: "a. It is what makes 'a different chat each gate' true: the state follows the brick, not the chat. b leaves the chat as the owner, which is the thing he wants removed (§2.2). To confirm with James."
    status: OPEN
  GW0b_fresh_chat_policy:
    asked: "'make each agent able to not need the same chat' - when should a gate use a new chat?"
    options:
      a: "Per gate kind, in Settings (his): continue | new chat | any provider. Default: new chat for build/verify bricks, continue for a brick's own retries."
      b: "Always a new chat per gate."
    coder_recommends: "a. A new chat per gate re-pays the persona prompt each time; a retry inside one brick is cheaper in the same chat. His setting, not mine (Settings -> Agents, editable like the task header). To confirm."
    status: OPEN
  GW0c_replay_mode:
    asked: "'a completely reproducible macro' - what is replayed?"
    options:
      a: "Both, by flag. recorded: every model reply is played back from the record, so the run is exactly reproducible without a model. live: the same packets are sent to an agent again, to compare agents."
      b: "recorded only."
    coder_recommends: "a. Recorded is the reproducible one (and the regression test). Live is 'rewind engine to replicate agents'. Same recording, two modes. To confirm."
    status: OPEN
  GW0d_listener_question:
    asked: "carried from 0.60.50: the listener 'cant detect any specs'. Needs James's failing log, and whether 'full inject' means per-stage framework text or Clear Glass injecting once (CG1)."
    status: OPEN - unanswered

phases:
  # order: bottom-up (§3.1). Each phase: backend -> API -> command (a route-commands row, so every agent has it) -> UI.

  GW1_the_baton:
    status: OPEN
    systems: [cortex, core, idearium]
    files: [cortex/core/raid/contract-gates.js, lib/run-state.js, cortex/core/raid/contract-adapters.js, lib/repo-prompt-blocks.js]
    depends_on: []
    axioms: ["§2.1", "§5.10", "§16.4"]
    james: '"make each agent able to not need the same chat, like the gates, and nexus hold the persistent data, so we could use a different chat or agent each gate"'
    does: >-
      The packet is the whole handoff. contract packet <gate> already gives the smallest context; the baton adds what
      the run state knows for that brick (steps made, files read/changed, last result, attempt) and the task header
      (CE2) built from the brick instead of from the chat. An agent that has never seen the contract can do the gate
      from the baton alone. No conversation is replayed. Built by composing packet + run-state fill; no new format.
    proof: "a 3-gate contract where gate 1 runs on agent A and gate 2 on agent B with no shared history completes; the same with gate 2's agent given a different persona fails the check, proving the baton is what carried it"

  GW2_the_run_follows_the_gate:
    status: OPEN
    systems: [core, cortex, copilot, guardian]
    files: [lib/run-state.js, cortex/core/raid/contract-gates.js, cortex/core/raid/contract-adapters.js, lib/repo-agent.js, copilot/server.js]
    depends_on: [GW1_the_baton, GW0_what_is_a_gate]
    axioms: ["§2.2", "§9.1", "§15.2"]
    does: >-
      lib/run-state.js gets a second key: runIdFor({ contract, gate }). The agent executor opens the run for the brick it
      dispatches; a fallback or a new chat resumes the SAME run (attempt + 1, steps kept) because the key is the brick,
      not the session. GW0b's policy decides continue | new chat | any provider per gate kind. The model door picks the
      agent; RAID stays the write authority. CE10's lost-job fallback already moves between providers; this makes the
      move carry the baton.
    proof: "kill the provider mid-brick: the next provider's first call is the next unread step; a fresh-chat policy still resumes the brick's steps; two bricks never share a run"

  GW3_a_contract_is_traced:
    status: OPEN
    systems: [core, cortex, idearium, versionium, intelligence]
    files: [lib/component-ledger.js, cortex/core/raid/contract-gates.js, lib/run-state.js, guardian/lib/response-sink.js, lib/repo-versions.js, lib/ledger-fanin/]
    depends_on: [GW2_the_run_follows_the_gate]
    axioms: ["§2.3", "§5.1 causedBy on every row", "§7.6", "§16.2"]
    james: '"each contract tracked through the system using the event ledger, tagging and each gate, the intelligence system, physical file running through the back end"'
    does: >-
      One identity runs through every record: contract:<id> and gate:<id> on the ledger row (contractUuid is already a
      column; contract-gates does not pass it), the bus event, the .run node, the .response node, the Versionium commit
      and tag, and each file write (path, before hash, after hash, the commit). causedBy chains gate -> job -> response ->
      tool call -> file write. Query: contract trace <id> returns the ordered story with the physical files each gate
      read and wrote. The intelligence system receives each move through ledger-fanin (it already consumes it).
    proof: "run a 3-gate contract that edits 2 files: trace lists 3 gates, 2 files with hashes before and after, the commit per gate and every response; remove contractUuid from one writer and the trace names the hole (observational, never invented)"

  GW4_copilot_on_the_gates:
    status: OPEN
    systems: [copilot, cortex, guardian, intelligence]
    files: [copilot/server.js, copilot/adaptive-fulfillment.js, copilot/tool-runtime.js, cortex/core/raid/contract-intake.js]
    depends_on: [GW1_the_baton, GW2_the_run_follows_the_gate]
    axioms: ["§15.1", "§15.2", "§15.3", "§9.1"]
    james: '"the agents are supposed to be able to be copilot also. i want copilot to use these gates also. the intelligence system."'
    does: >-
      A copilot request that is a task (copilot/server.js already detects 'create/build ... pipeline|tool|system') is
      submitted as a contract (synthesizeContract / submitContract exist) and run through the scheduler, not as one long
      chat. Adaptive fulfillment's iteration budget becomes the gate's retry budget; each attempt is an event (§15.2);
      the fault class and the RAID weights it learns are the gate's (§15.3). Copilot passes the same tool-runtime run
      state, so its tool loop also resumes. The intelligence system reads the outcomes (GW6).
    proof: "a copilot task becomes a contract with gates; killing copilot mid-run and asking again resumes at the next gate; each attempt is an event with its fault class"

  GW5_agents_are_copilot:
    status: OPEN
    systems: [core, copilot, idearium, guardian]
    files: [lib/agent-tools/tools/, idearium/cli/route-commands.js, copilot/lib/capabilities.js, lib/repo-agent.js]
    depends_on: [GW1_the_baton]
    axioms: ["§5.8 composability", "§16.4", "§9.1"]
    james: '"expand any agent tools you can ... the agents are supposed to be able to be copilot also"'
    does: >-
      Parity first, then additions. Step 1 (deterministic, no model): diff copilot's capability list
      (copilot/lib/capabilities.js) against the tool scope the repo agent gets; every copilot capability an agent lacks is
      added to the one registry, and the reverse. Step 2: the gate tools every agent needs, as route-commands rows
      (so nexus.command has them, per the order-of-delivery rule): run.status, run.resume, gate.packet, gate.check,
      contract.trace (GW3), ledger.trace, macro.record/replay (GW7), rewind (GW7). No new tool without a row that already
      runs.
    proof: "a test lists copilot capabilities and the repo agent's tool scope and fails on any that one has and the other lacks; each new row runs through nexus.command"

  GW6_the_intelligence_system_on_every_gate:
    status: OPEN
    systems: [intelligence, cortex, core]
    files: [copilot/adaptive-fulfillment.js, cortex/self-heal/fault-taxonomy.js, lib/phase-faults.js, lib/fault-log.js, meta/cfr/]
    depends_on: [GW3_a_contract_is_traced]
    axioms: ["§7.7", "§11.3", "§15.3"]
    does: >-
      Every FAILED, STALE or SPLIT gate is classified through the fault taxonomy and recorded (fault-log), opens a gap
      through enrichGap (the same door spec drift uses), and updates RAID's weight for that agent and that kind. Gate
      latency and retry counts feed the sigma engine (async, never on the write path, §11.3). Result: the door
      learns which agent is good at which gate kind from real outcomes.
    proof: "a gate that fails twice on agent A and passes on B changes the door's next pick for that kind; a fault class and a gap exist for the first failure"

  GW7_failure_macro_and_rewind:
    status: OPEN (owns FM1-FM4 of docs/2026-10-05-failure-reproduction-phasemap.spec; this phase adds the gate as the replay unit)
    systems: [core, intelligence, cos, versionium, idearium]
    files: [lib/failure-macro.js (new, FM2), lib/rfr2-bridge.js, intelligence/rfr2/clip/index.js, lib/replay-engine.js, lib/shadow-space.js, cos/testenv/index.js, cortex/core/raid/contract-gates.js]
    depends_on: [GW3_a_contract_is_traced, GW0c_replay_mode]
    axioms: ["§2.2", "§7.6", "§12.2", "§12.5", "§16.2"]
    james: '"creating a failure mode macro using each gate as a reproducable step, rewind engine to replicate agents, like a completetly reproducable macro"'
    does: >-
      A macro is the ordered gates of one run, each with its packet, the agent's recorded reply, the tool calls and
      results, the file hashes and the commit it ended on (all already written by GW3), cut with rfr2 clip, secrets masked.
      Replay runs the gates in a COS compartment at the first gate's commit: recorded mode plays the replies back (exact);
      live mode sends the same packets to an agent again. Rewind(gate N) restores the commit gate N-1 ended on (the
      GS1 commit, in Versionium) and re-runs from N, optionally with a different agent. Divergence is the diff of the two
      runs' evidence per gate (replay-engine detectDivergence). FM1-FM4 are built in this phase's order: ledgers into
      rfr2, a failure is a clip, run it in COS, the report.
    proof: "a recorded 3-gate run replays to byte-identical evidence with no model; a rewind to gate 2 with a different agent produces a per-gate divergence report; a fix passes the macro; a secret is masked; a missing causedBy is a named hole"

  GW8_causal_graph_and_failure_mode_field:
    status: OPEN
    systems: [intelligence, core, idearium]
    files: [intelligence/rfr2/causality/index.js, meta/cfr/, lib/diagnostic-causal.js, lib/fault-log.js, idearium/ui/js/app.js]
    depends_on: [GW3_a_contract_is_traced, GW6_the_intelligence_system_on_every_gate]
    axioms: ["§11.1", "§11.2", "§11.3", "§11.4", "§16.2"]
    james: '"causal graph, failure mode field"'
    does: >-
      Causal graph: the typed edges rfr2 already holds (explicit via causedBy, rule via the contract, observational), per
      contract, walked from a failure to its root. Failure mode field: with every gate move, record the conditions it ran
      under (provider, context size, attempt, packet size, time, the CFR regime and sigma at that moment); the field is the
      failure modes counted across those conditions, so 'this gate kind fails on this provider above this context size'
      is a read, not a guess. Computed async from the ledger (§11.3); the graph is a projection, the ledger is the record.
    proof: "a fixture ledger with a known root cause is walked back to it; a fixture with conditions shows the failure rate above a context size and below it; an observational edge is never in the root path"

  GW9_the_contract_panel:
    status: OPEN (is automatic-tracking CP1 + code-tab CE9/CE11; the surface for GW1-GW8)
    systems: [idearium, clear-glass]
    files: [idearium/ui/js/code-surface.js, idearium/ui/js/repo-tasks.js, idearium/ui/js/phases-manager.js]
    depends_on: [GW3_a_contract_is_traced, GW7_failure_macro_and_rewind]
    axioms: ["§2.3", "§5.12 the UI is disposable"]
    does: >-
      In the Code tab: the contract as a graph of gates with state, the baton per gate, the trace (files, commits,
      responses), per-gate agent and policy, Rewind here, Replay (recorded | live), the failure mode report and field. The
      UI only reads the routes GW3-GW8 add; remove it and nothing else changes (§5.12). Tested in Clear Glass.
    proof: "driven in Clear Glass: pick a gate, see its baton and trace, rewind it, replay it"

  GW10_the_listener_knows_what_to_hear:
    status: OPEN - blocked on GW0d
    systems: [guardian, idearium, clear-glass, core]
    files: [lib/listener-commands.js, lib/step-gate.js, lib/spec-reply.js (new)]
    depends_on: [GW0d_listener_question]
    axioms: ["§1.2 nothing fails silently", "§5.10"]
    james: '"each stage of the pipeline need to upload a framework or what ever to tell the agents what to output and the listener needs to know what to listen for. right now it ccant detect any specs" (2026-10-15)'
    does: >-
      Each gate declares what it expects back (the output schema: a spec's primitives and file extension, code blocks with
      paths, a tool call). That expectation is part of the baton (GW1) so the agent is told it, and the listener reads the
      same declaration to know what to detect (lib/spec-reply.js extracts a spec from a reply). A reply that matches none
      is a gate result 'unrecognised', said with the expectation it missed - never silently dropped.
    proof: "pending James's failing log: that reply must be detected, and a reply matching none says what was expected"

build_order: [GW3, GW1, GW2, GW5, GW4, GW6, GW7, GW8, GW9, GW10]
build_order_reason: >-
  §16.1, the nearest gap first. GW3 (tracing) is smallest, touches no behaviour, and every later phase reads it - and
  it makes the next ones testable. GW1 -> GW2 is the state follow the gate. GW5 is deterministic parity work. GW4 puts
  copilot on it. GW6 closes the learning loop. GW7/GW8 need the recordings GW3 makes. GW9 is the surface. GW10 waits for his log.

not_verified:
  - "That the repo agent's tool scope and copilot's capabilities differ (GW5 is built from a diff nobody has run yet; 159 tool files and a capabilities list were not compared)."
  - "That ledger-fanin delivers gate rows to the intelligence system (the atlas says it consumes ledger-fanin; not traced for contract rows)."
  - "That rfr2 can ingest a gate row as a typed edge (FM1 is OPEN; the bridge exists, the ingestion does not)."
  - "That a COS compartment can run a Nexus system's replay route (FM3 pushback: each system needs one; none verified)."
  - "meta/cfr has 24 consumers; GW6/GW8 read it, they do not change it. Any change there needs its own impact check (loom impact)."
