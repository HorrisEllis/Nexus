# docs/2026-10-15-gate-held-work-phasemap.spec
# Nexus holds the complexity; each gate is a reproducible step any agent or chat can take. A contract is traced end to end,
# a failure is a macro, a run can be rewound and replicated, and copilot works through the same gates.
# MAPPED 2026-10-15, before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec.
# Follows docs/2026-10-15-code-tab-run-state-phasemap.spec (CE1-CE5, CE10 built, 0.60.50),
# docs/2026-10-15-automatic-tracking-phasemap.spec (GT2, GA1 built), docs/2026-10-13-nexus-memory-gates-and-contract-phasemap.spec
# (CT0-CT1b, SC0, EX0 built; GT0, MEM0, CX0 open) and docs/2026-10-05-failure-reproduction-phasemap.spec (FM1-FM4 open).
# 2026-10-15 second pass: GW11-GW18 (the agents' test environment: snapshots, optional desktop, the SSH door, copy-in, every file tested,
# parallel branches, friction, debug by bisect). This map adds no parallel plan. It indexes the phases that already own each ask, says what is built, and names what is new.

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
    status: "DECIDED 2026-10-16 — a (the brick is the unit). James: \"Yes. It’s analysis. The bricks.\""
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
  GW0e_sandbox_egress:
    asked: "the agents' test environment has full access - should it reach the network?"
    options:
      a: "Default deny; an allowlist per compartment (package registries, the repo's own hosts). Open egress is a per-run switch he sets."
      b: "Open by default."
    coder_recommends: "a. A sandbox the agents own completely should still not be able to reach his accounts or leak a secret (§5.9). Deny is one switch to flip; a leak is not undoable (§0.3). To confirm."
    status: OPEN
  GW0f_mutation_testing:
    asked: "'each file needs meticulous testing' - how far?"
    options:
      a: "Per file: its tests run, its exports each exercised, hostile inputs (§12.1), and mutation checks (flip a line; a test must fail - §12.2) as an opt-in tier because it multiplies run time."
      b: "Tests run and exports exercised only."
    coder_recommends: "a, mutation opt-in per run and on by default only for files a gate just changed. To confirm."
    status: OPEN
  GW0g_parallel_limit:
    asked: "'parallel branching for benchmarking and comparing' - how many at once?"
    coder_recommends: "A cap read from the resource monitor (free memory and cores) at dispatch, never a fixed number; his Settings value is the ceiling. To confirm."
    status: OPEN

  GW0h_minimal_default:
    asked: "minimal environment - what is the default for a repo with no detected need?"
    coder_recommends: "base + the one runtime plan() finds; display none; no desktop account, no extras. The wizard's extras default becomes empty (reversing DK1's default); the repo desktop stays one tick away. To confirm."
    status: OPEN
  GW0i_find_order:
    asked: "search as the index for intents - in what order does an agent look?"
    coder_recommends: "own component store and the code index first (they are free and already trusted), then package registries and code hosts through APIs, then image/UI sites, then the open web. Stop at the first adequate hit. To confirm."
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

  GW11_a_snapshot_per_gate:
    status: OPEN
    systems: [cos, versionium, cortex]
    files: [cos/compartment/qemu-runtime.js, cos/workspace/vm-control.js, cortex/core/raid/contract-gates.js, versionium/lib/releases.js]
    depends_on: [GW3_a_contract_is_traced, GW14_copy_in_diff_out]
    axioms: ["§2.1", "§0.3 nothing lost", "§16.4"]
    james: '"snapshot per gate."'
    does: >-
      Two layers. Code: the gate's Versionium commit and gate/<contract>/<gate> tag (GS1/GT2, built) - every gate. Environment: a
      COS checkpoint (qcow2 internal snapshot, qemu-runtime) taken when the gate changed the machine (install, build, migrate,
      service start); the checkpoint id is recorded on the gate beside the commit. Rewind restores both. vm-control refuses a live
      checkpoint while the repo is shared over 9p/vvfat, so this depends on GW14 (copy in, not share).
    proof: "a gate that installs a package is rewound: the package is gone and the code is at the previous commit; a code-only gate takes no environment snapshot; a live checkpoint with a shared repo is refused with the reason"

  GW12_desktop_is_optional:
    status: OPEN
    systems: [cos, core]
    files: [cos/testenv/detect.js, cos/testenv/environment.js, cos/testenv/provision.js]
    depends_on: []
    axioms: ["§5.12 the UI is disposable", "§8.6 reuse"]
    james: '"the desktop envirement needs to work as a test envirement, doesn''t need a desktop unless its detected as a dependancy from the repo. like make it optional."'
    does: >-
      detect.js plan() gains a display need read from the repo's files: none | virtual (xvfb: headed browser tests, Playwright-style,
      headless Electron) | desktop (a GUI toolkit it must see: Tk, Qt, GTK, a desktop Electron app). environment.js 'desktop' stays a
      bool the person can force; the default follows the detection. Default tier is none.
    proof: "a plain Node repo plans display none and installs no xfce; a repo with a headed-browser test plans virtual; one with a Tk import plans desktop; the person's setting overrides"
    amended_2026-10-15: >-
      James: "currently it uses a desktop envirement. needs to use a minimal envirement. just what the project needs."
      Found: the setup wizard defaults extras to ['desktop'] (idearium/ui/js/app.js _vmWiz, 0.39.293 DK1: "the repo desktop needs
      it: on by default"). That was his earlier call; this one supersedes it (the earlier stays, §0.3). The image becomes layered:
      a small base built once (OS minimum + sshd + the runtime the repo needs), plus a per-repo overlay (qcow2 backing file over
      the base: cheap to make, and each overlay is what GW11 snapshots). What goes in the overlay is computed from detect.js plan()
      - its stacks and runtimes, the display tier - so a Node repo gets Node and nothing else; go/ruby/php/rust/desktop are added
      only when the repo's files say so, or when he ticks them. System packages a manifest cannot reveal are a named gap, not a guess.
      Whether a container or microVM would be lighter than QEMU on his hosts is NOT verified; the layering is in QEMU itself.

  GW13_the_sandbox_door:
    status: OPEN
    systems: [cos, core, guardian]
    files: [cos/testenv/provision.js, cos/workspace/vm-control.js, lib/agent-tools/tools/sandbox/ (new), idearium/cli/route-commands.js]
    depends_on: [GW3_a_contract_is_traced, GW0e_sandbox_egress]
    axioms: ["§5.9", "§5.10", "§9.1", "§1.2", "§16.4 one door"]
    james: '"we need to be able to completely use it from a ssh, same with the agents to use to test the project, same with sftp or ftp, or a bus or something so the agents can manage files, copy, test, use cos as a complete sandbox for them to have full access to."'
    does: >-
      SSH is the one door: exec, SFTP and port forwarding over one key-authenticated channel, forwarded on localhost only, one key
      per compartment. He can ssh in himself. Agents get sandbox.exec / put / get / ls / snapshot / restore as tools (rows in
      route-commands, so nexus.command has them): each call goes through the tool registry, is a ledger row tagged with the
      contract and gate (GW3), and is under RAID's write authority. Plain FTP is not built (cleartext, SFTP does the same job). The
      bus carries events about the sandbox (started, exec finished, test result), not file bytes.
    proof: "an agent puts a file, execs a command, gets the output and a file back; every call is a traced ledger row; ssh from outside works with the compartment key and fails without it; egress is denied unless allowed"

  GW14_copy_in_diff_out:
    status: OPEN
    systems: [cos, idearium, versionium]
    files: [cos/testenv/tar.js, lib/repo-inject.js, lib/repo-versions.js, cos/testenv/provision.js]
    depends_on: [GW13_the_sandbox_door]
    axioms: ["§5.9", "§0.3", "§7.6"]
    james: '"no versions per file using versionium, only the diff." (2026-10-15; the coder reads it as: what returns from a run is a diff)'
    does: >-
      The repo is copied into the compartment (tar.js exists), not shared. The agent works on the copy. What returns is a diff
      against the commit it started from, proposed to the work surface (repo-inject) for the person to apply - never written into
      the host repo by the VM. This is also what lets GW11 snapshot a running machine.
    proof: "a change made in the compartment returns as a diff, the host tree is untouched until applied, and applying it makes one Versionium commit"

  GW15_every_file_tested:
    status: OPEN
    systems: [cos, idearium, intelligence]
    files: [cos/testenv/detect.js, lib/code-intel/, lib/gap-field.js, idearium/api/index.js]
    depends_on: [GW13_the_sandbox_door, GW0f_mutation_testing]
    axioms: ["§12.1", "§12.2", "§12.3", "§12.5"]
    james: '"each file needs maticalulas testing"'
    does: >-
      A test plan per file, computed (no model): the tests that use it (the code card's 'tests'), its exports each exercised, hostile
      inputs by the file's kind (empty, null, huge, unicode, concurrent writes, corrupt state), and - by GW0f - mutation checks (a line
      flipped must make a test fail; a test that cannot fail proves nothing). The plan runs per file in the sandbox (detect.js already
      knows which runtimes run per file). Every file gets a verdict recorded as evidence (expected, actual, the gap). A file with no
      test that touches it, or whose tests survive a mutation, is a gap in the gap system, not a silent pass.
    proof: "a fixture repo: an untested file is a gap; a file whose test survives a flipped line is flagged; a file whose test fails on the flip passes; the verdicts are evidence on the gate"

  GW16_parallel_branches_benchmark:
    status: OPEN
    systems: [cos, cortex, intelligence, idearium]
    files: [lib/shadow-space.js, cos/workspace/, cortex/core/raid/contract-adapters.js, lib/model-door.js]
    depends_on: [GW14_copy_in_diff_out, GW15_every_file_tested, GW0g_parallel_limit]
    axioms: ["§0.3", "§12.2", "§15.2", "§16.2"]
    james: '"parralel branching for benchmarking and comparing"'
    does: >-
      A gate can fan out to N branches (shadow-space worktrees already branch the repo and merge fast-forward only): the same packet to
      different agents, or different approaches, each in its own compartment, same checks. Each branch is measured: tests passed,
      time, memory, diff size, tokens, retries (agent calls and tokens per phase are already a number, AG1). A comparison table
      names the winner by the gate's own pass_when and the measured rest; the winner merges fast-forward only, the losers are kept as
      branches (archived, not deleted). The comparison is evidence and feeds GW6 (which agent is good at which gate kind).
    proof: "a gate run on 3 branches yields a table; the winner merges; the losers still exist and can be replayed; the door's next pick for that kind moves toward the better agent"

  GW17_friction_and_tension_per_file:
    status: OPEN
    systems: [intelligence, core, cos]
    files: [diagnostic/nexus-diagnostic.js, intelligence/cfr/sigma.js, intelligence/cfr/field.js, lib/fault-log.js]
    depends_on: [GW3_a_contract_is_traced]
    axioms: ["§2.3", "§11.1", "§11.3", "§7.7"]
    james: '"finding friction or tension"'
    does: >-
      Friction and tension exist today as live, in-memory readings in the diagnostic (loom proxies /api/friction and /api/tension),
      so they vanish on restart (§2.2). This persists a sample per file and per gate into the ledger and reads them back: where
      the retries, reverted edits, re-prompts, flaky tests and slow runs gather. The definitions are the diagnostic's, not new ones.
      Computed async (§11.3). It marks the hot files the next gate should treat more carefully.
    proof: "after a run, the ledger holds a friction sample per touched file; a restart does not lose them; a file that took 3 retries ranks above one that took none"

  GW18_debug_by_bisect:
    status: OPEN
    systems: [cos, versionium, intelligence, idearium]
    files: [lib/failure-macro.js, lib/replay-engine.js, versionium/lib/engine.js, cos/testenv/index.js]
    depends_on: [GW7_failure_macro_and_rewind, GW11_a_snapshot_per_gate]
    axioms: ["§12.5", "§16.2", "§2.1"]
    james: '"debugging, anything it needs."'
    does: >-
      A failing test is bisected across the contract's gate commits automatically (each gate is a commit, GS1): the first gate whose
      commit fails the test is the culprit, found by rewinding in the sandbox, not by an agent guessing. The result is a failure
      macro (GW7) naming the gate, the file, the diff and the causal path (GW8), with the sandbox's logs and exec output attached.
    proof: "a fixture contract where gate 3 breaks a test: bisect names gate 3 in log2(n) runs and the macro reproduces it"

  GW22_find_before_generate:
    status: OPEN
    systems: [clear-glass, core, idearium, intelligence]
    files: [lib/agent-tools/tools/clear-glass/search-engine.js, lib/component-store.js, lib/agent-tools/tools/query/, idearium/cli/route-commands.js, lib/agent-memory.js]
    depends_on: [GW5_agents_are_copilot, GW13_the_sandbox_door]
    axioms: ["§16.5 delete before you add", "§8.6 reuse", "§5.10", "§16.2 provenance", "§9.1"]
    james: '"at one point i want clearglass hooked into a search engine feature to use search queries as a command that the agents to use as a index for different intents, like github for components, image sites for ui elements, etc. anything that can cut down on code generation. finding components. like agentic"'
    found: >-
      clearglass.search_engine.tool exists (lib/agent-tools/tools/clear-glass/search-engine.js): register / register_from_pick /
      search / list / delete / export_node (an engine becomes a .command or .tool). It stores templates in a jaa table and fetches
      by api or resolves a URL to navigate. Its own header says v1: one {query} slot, no ranking, no pagination, no de-duplication,
      no credentials. James's original words had "with an intent"; there is no intent field in the file (grep). So the engine
      exists, the intent index does not.
    does: >-
      An engine gets an intent (component | snippet | package | ui-element | image | doc | ...) and a result kind. One command row,
      find <intent> <query>, which nexus.command gives every agent, routes by intent to the engines registered for it and returns
      candidates with provenance: source URL, license, version, a content hash. Lookup order is GW0i (own store first). Choosing a
      candidate is adopt: it enters the component store with its dependencies pinned (component-store put, builtBy = the source),
      arrives in the repo as a diff on the work surface, and runs through the sandbox tests (GW15) before it counts - fetched code
      is untrusted. Search runs from Nexus/Clear Glass, not from the sandbox, so the sandbox's egress stays denied (GW0e). Image
      and UI-element results are kept as references (URL, hash, license), not copied blindly. Which engine and intent produce
      adopted components feeds the door (GW6), and tokens saved are a number: adopted-from-search against generated, per phase (AG1).
    cautions: >-
      A license is recorded with every candidate, and a copyleft licence in a permissive project is flagged before adopt. A site's
      terms and rate limits are respected: prefer its API to scraping through his logged-in tabs, and never put his sessions in a
      recording (GW7 masks secrets). Ranking is a first guess until adopt rates exist.
    proof: "a registered engine with intent 'component' returns candidates with licence and hash; adopt writes the component store entry and a diff, and the sandbox test must pass first; an agent that asks for a thing the store already has gets the store's, not a web hit; tokens saved is reported"

  GW23_wire_what_exists:
    status: OPEN
    systems: [loom, core, idearium, intelligence]
    files: [loom/registry, loom/scanners/, loom/maps/, lib/rfr2-bridge.js]
    depends_on: []
    axioms: ["§8.6", "§1.1 nothing pretends", "§16.1 close the nearest gap", "§16.5"]
    james: '"nexus can do a fuck ton, not all wired."'
    does: >-
      A deterministic census from loom's own registry (no model): every component that is declared but has no consumer wires, every
      route declared but not served, every event declared and never emitted or emitted and never heard - ranked by what this map's
      phases would use (rfr2 has 13 built modules and no consumers, FM1 says; the replay engine is sandbox-only). The output is the
      list of already-built capabilities worth wiring first, so the next phase reuses before it builds. It reports; it wires nothing.
    proof: "the census names rfr2's unconsumed modules and the replay engine's live-replay refusal; a component wired since no longer appears"

build_order: [GW23, GW3, GW1, GW2, GW5, GW13, GW14, GW11, GW15, GW16, GW17, GW4, GW6, GW12, GW7, GW18, GW22, GW8, GW9, GW10]
build_order_reason: >-
  §16.1, the nearest gap first. GW3 (tracing) is smallest, touches no behaviour, and every later phase reads it - and
  it makes the next ones testable. GW1 -> GW2 is the state following the gate. GW5 is deterministic parity work. GW13/GW14 are
  the sandbox door and copy-in: the agents' test environment, which GW11 (snapshots), GW15 (every file tested) and GW16
  (parallel branches) all run in. GW17 reads what those produce. GW4 puts copilot on it, GW6 closes the learning loop, GW12 is
  independent and small. GW7/GW18/GW8 need the recordings GW3 makes. GW9 is the surface. GW10 waits for his log. GW23 goes first: it is read-only and tells every later phase what to reuse. GW22 (find before generate) comes once agents have the sandbox door and the tool parity it needs.

not_verified:
  - "That the repo agent's tool scope and copilot's capabilities differ (GW5 is built from a diff nobody has run yet; 159 tool files and a capabilities list were not compared)."
  - "That ledger-fanin delivers gate rows to the intelligence system (the atlas says it consumes ledger-fanin; not traced for contract rows)."
  - "That rfr2 can ingest a gate row as a typed edge (FM1 is OPEN; the bridge exists, the ingestion does not)."
  - "That a COS compartment can run a Nexus system's replay route (FM3 pushback: each system needs one; none verified)."
  - "meta/cfr has 24 consumers; GW6/GW8 read it, they do not change it. Any change there needs its own impact check (loom impact)."
  - "That a QEMU user-net hostfwd + sshd works on his Windows host (setup-vm.bat exists; his setup was stuck earlier) - GW13 verifies before relying on it."
  - "Whether detect.js already sees any display need (read: it plans stacks and runtimes only; not the whole file)."
  - "What the diagnostic's friction and tension measure, exactly (GW17 reuses their definitions; read loom/server.js proxy comments only)."
  - "Resource headroom for N parallel compartments on his machine (GW0g reads it live; no number is assumed)."
  - "How many engines are registered in the search_engines jaa table today (the table was not read), and whether any has an intent-like tag."
  - "That a content hash and licence can be obtained from every source GW22 would use (GitHub's API gives a licence; image sites vary)."

## ADDENDUM 2026-10-15 - the phase census (docs/PHASE-CENSUS-2026-10-15.md): what this map duplicates

# James: "check all phases in nexus, over 1200, for any useful phases."
# The census read all 1472 phases (595 done, 872 pending). Several GW phases restate phases he already specced, in his words. They are
# NOT dropped (the GW text stays, §0.3); building them means building the older phase, and this map defers to it:
# - GW8 (failure mode field) is N14_failure_mode_field + FR1_failure_reports. GW3 (contract trace) is N15_contract_history + RQ21.
# - GW7 replay and GW16 branching are RS2_replay_rewind_branch (replay byte-identical, no model; rewind to a step; branch from a step).
# - GW11 (snapshot per gate) is RW1_rewind_engine_vm_snapshots, which says QMP savevm of the live machine. vm-control refuses that while the
#   repo is shared over 9p/vvfat (read in source), so GW14 (copy in) is what RW1 needs on Linux hosts - an addition to RW1, not a replacement.
# - GW1/GW2 build on RQ24_the_gate_transaction and RQ3 (a retry carries only the failing check's output).
# - CE10 overlaps R1 (guardian job-retry), not built. R1 retries the same tab; CE10 moves provider only when nothing was typed.
# - CE10 picks the next provider from the pipeline-routing chain (how the existing 'rest' fallback already works). ME5 makes RAID's _decide the
#   one chooser (§9.1); CE10 must move onto it when ME5 lands.
# New with no earlier phase found: GW4 (copilot dispatched through contract gates), GW5 (tool parity), GW12 (minimal layered environment), GW13/GW14
# (SSH door, copy-in), GW15 (every file tested, mutation), GW17 (friction per file), GW18 (bisect), GW19-GW21 (sandbox results, file actions,
# autonomy), GW22 (find before generate), GW23 (wire what exists). "New" means no phase with that name was found; it was not read phase by phase.


## ADDENDUM 2026-10-16 — every system at the gate, and context that does not make the agent dumb (mapped, no code)

# James (2026-10-16): "the pipeline. the gating. rewind engine, compartments, cos improvements for test envirements." ·
# "more than that. look at the intelligence system, phases, diagnostic system, versionium, snapshots, raid, look at all of
# them. reflection engine. hypothosis. adversarial agent, confidence, all of it. look at all of what would be important for
# the gating. each gate holds the context, which can make tghe agents dumb."
#
# The coder's reading (to confirm): a gate is the one place that may hold EVERYTHING (the store); an agent is handed only
# the projection one step needs (the baton, GW1), sized to that agent. Context the gate holds is not context the agent is
# given. Read this way, his sentence is GW1's rule made explicit, and it extends GW6 from "on failure" to every moment.

found_2026_10_16:
  # read in the code, not remembered
  uses_today: "cortex/core/raid/contract-gates.js (the brick scheduler) requires: pipeline-routing, phase-plan, model-door, import-checks, check-catalogue, agent-tools, fault-taxonomy, jaa-db. Idearium hands it versioning (GT2 tags), assessing (GA1) and the dispatch."
  not_consulted_by_gates: "lib/reflection.js (decision scoring, low-satisfaction streaks open loops) · meta/confidence.js (weakest-link: one unevidenced item caps the whole) · intelligence/adversarial.js (two reasonings compared; a contradiction is a gap) · lib/diagnostic-report.js (a gap's report: CFR state, rfr2 traceToRoot = cause conditions, descendants = effects) · lib/replay-engine.js (snapshot before a decision, replay, compare) · cos/testenv (process or ephemeral-VM test runs for any repo) · the hypothesis node type (lib/node-schemas/schema.hypothesis; no tracker module found). meta/adversary-suite.js (6 attack classes on a compartment's result) is used only by the older contract-intake path, not by bricks."
  where_context_piles_up:
    planned_brick: "lean already: lib/phase-plan.js chunkBrief is budgeted (LIMITS.brief, trims purpose/steps/intent to fit) and dispatched bare (noContext). Keep."
    whole_phase_brick: "BR1 (no file named) sends the whole phase message through the repo agent WITH its context blocks — the heaviest prompt in the pipeline, and the one a small model fails on."
    ga1_context_note: "GA1 appends up to 120 lines of EVERY dependency's code with no total cap: a brick with 6 dependencies can grow by ~700 lines. Needs a budget and a ranking (the names it needs first)."
    the_packet: "contract-gates packet() is small and structured, but it is not what the agent is sent (the brief is). Two shapes of the same handoff: GW1 must make the packet the one handoff."

the_gate_moments:
  # which system answers at which moment; each answer is stored on the gate (the store) and only its verdict, or the
  # lines it names, reach the agent (the projection)
  before_dispatch:
    - "hypothesis: the gate states what it expects to be true when it passes (its pass_when as a hypothesis node) — scored later (reflection)"
    - "mental simulation (emerge map MS1): the planned step against mined failure modes — 'likely to hit X' becomes one line in the brief, not the mode's history"
    - "confidence: weakest-link over the gate's inputs (refs hashed, deps PASSED with evidence, assumptions); below a floor the gate asks for context (NEEDS_CONTEXT) instead of dispatching"
    - "snapshot: Versionium tag before the attempt (GT2 does this) — the rewind point"
  the_handoff:
    - "the baton (GW1): packet + run state, budgeted per agent (CT1 Boundaries learn the size an agent passes); GA1's dependency code ranked by the names needed and cut to the budget"
  after_reply:
    - "verification: checks the gate owns (exports, imports, CK catalogue), then cos/testenv runs the file's tests (process; VM when present) in the gate's compartment"
    - "adversarial: meta/adversary-suite on the result (edge-case, state, replay) for task gates; intelligence/adversarial compare when two agents answered the same gate (GW16)"
    - "confidence of the PASS: weakest link over its evidence (a pass with an unevidenced condition is capped, said)"
  on_failure:
    - "classify (exists: classifyFailure) → fault-log + enrichGap (GW6)"
    - "diagnostic report (lib/diagnostic-report.js) for a gate failed twice — cause conditions and effects, one paragraph to the next attempt, the full report on the gate"
    - "replay/rewind: replay-engine / GW7 failure macro from the gate's snapshot"
  after_settle:
    - "reflection: the gate's outcome scores its hypothesis and the agent's decision (reflection streaks open a KNOWLEDGE/CAPABILITY loop) — the door learns (GW6)"

proposed_phases:
  GW24_the_gate_holds_the_agent_gets_a_projection:
    status: OPEN
    depends_on: [GW1_the_baton]
    files: [cortex/core/raid/contract-gates.js, idearium/api/index.js, lib/phase-plan.js]
    does: "One budget per dispatch, from the agent's learned size (CT1): the brief, GA1's dependency code (ranked: the needed names' definitions first, then signatures, never whole files past the budget) and any intelligence verdicts share it. Whole-phase bricks go bare with the phase text cut to the budget, the repo context only when the agent asks for it (a tool, not a preload). Everything the gate gathered stays on the gate (inspectable in the contract panel)."
    proof: "a brick with 6 dependencies sends ≤ its budget; the dropped lines are listed on the gate; a fixture small model passes a brick it failed with the unbudgeted note"
  GW25_the_systems_at_the_gate_moments:
    status: OPEN
    depends_on: [GW24_the_gate_holds_the_agent_gets_a_projection, GW6_the_intelligence_system_on_every_gate]
    does: "the_gate_moments above, each system behind one optional hook in schedule() (before / after / on failure / settle), each answer stored on the gate, its verdict ≤ one line into the baton; every hook can be off per run (cost), each said when skipped"
    proof: "one contract run with every hook on: each gate shows its hypothesis, confidence, verification, adversarial findings and (on failure) diagnosis; the agent's prompts stay within budget"

order_note: "pipeline-focus's critical path still holds: GW1 (baton) first — GW24 is GW1's budget, GW25 follows GW6. Nothing here before GW0's decision (a brick is the unit)."

## ADDENDUM 2026-10-16 (b) — everything declares what it needs; drift against the contract retries or rewinds (mapped)

# James (2026-10-16): "each spec, phase, chunk/gate needs to have dependancies, then the contract and the dependencies cna
# be used to check for drift, if it fails, retry or rewind snapshot. so like everything has to create a dependancy, and the
# dependencies per chunk, every gate needs to know what it needs. always map before anything."
# His decision, recorded as his: dependencies are mandatory at every level (spec, phase, chunk, gate), and drift is checked
# against the contract and its dependencies; on failure: retry, or rewind to the snapshot. The coder's part below is what
# exists and what is missing.

exists_2026_10_16:
  - "a gate's `requires` are hashed when it passes; evaluate() makes it STALE when one changes or an upstream gate is no longer PASSED (cortex/core/raid/contract-gates.js) — the drift check, at gate level"
  - "a FAILED gate rewinds to its pre-attempt snapshot after its retries (QA2, 0.60.43); a gate's exports recorded and re-checked on its dependents (GA1, 0.60.44: missing → the dependency reopens STALE)"
  - "phases carry files and dependencies, automatically, in every repo (lib/phase-map-auto.js, MP1/MP2 0.60.65); specs are tagged per phase (PT1, 0.60.51)"
missing:
  - "a brick requires only the phasemap and the file it edits (contract-adapters fromPhasePlan): the files it imports or reads outside the plan (phase-map-auto requires) and the phase's owning spec(s) are not refs, so their drift is invisible"
  - "a split brick's pieces inherit nothing beyond the parent's shared refs"
  - "a spec declares no dependencies of its own (what other specs / components it builds on); spec drift (orchestrator/lib/spec-drift.js) compares versions and surfaces, not what a spec depends on"
  - "STALE re-runs; there is no policy that chooses retry vs rewind by why the drift happened (a dependency changed → re-run; the gate's own output regressed → rewind)"

proposed_phase:
  GW26_everything_declares_what_it_needs:
    status: OPEN
    depends_on: [GW1_the_baton]
    files: [cortex/core/raid/contract-adapters.js, lib/phase-map-auto.js, lib/capability-spec.js, orchestrator/lib/spec-drift.js, cortex/core/raid/contract-gates.js]
    does: >-
      (1) every brick's requires = phasemap + its file + the files it imports/reads (phase-map-auto one hop) + the owning
      spec(s) of its phase; a split piece inherits its parent's requires plus its own. (2) a spec states `depends_on`
      (specs, components) — drafted from what its files require (capability-spec measure), never invented — and spec
      drift checks it. (3) a gate with no requires is refused at contract load (said), never run blind. (4) on drift:
      a required ref changed → STALE → re-run with the change named in the baton; the gate's own verification regressed →
      rewind to its snapshot, then retry; both recorded on the gate (GT2).
    proof: "a fixture contract: changing an imported file STALEs exactly the bricks that import it; changing the phase's spec STALEs the phase; a gate with no requires is refused; a regression rewinds to the snapshot and the retry passes"

order_note_b: "GW26 sits beside GW24: GW24 decides what an agent is given, GW26 decides what a gate watches. Both after GW1."

## ADDENDUM 2026-10-16 (c) — what the whole loop does for the pipeline (mapped, no code; no new phase)

# James (2026-10-16): "all prerequisits/dependancies, need to be understood for each chunk, gates hold the context, snapshot
# each gate, using contract and the dependancies as a checklist, reflection engine, logging failure mode each failure, using
# the failiure mode field, like the the phases, rewind engine each step, each output, the rewind enegine creates macros for
# reproducting or rconstructing from events, snapshots, and causal graph. what would that  do for the pipeline?
# intelligrance system. raid learns overitime."
#
# Context: asked right after merging main (0.60.72), with WB1/WB2 (WARP on the 5 bypassing build paths) waiting on his
# option 1 or 2. He asked what it would do; he did not ask to build it. Every clause already has a phase. Read in source
# 2026-10-16, each clause → its owner (no parallel plan, §8.6):
#   prerequisites/dependencies per chunk ...... GW26 (brick requires = phasemap + file + phase-map-auto one hop + owning spec)
#   gates hold the context .................... GW1 (baton) + GW24 (the gate holds, the agent gets a budgeted projection)
#   snapshot each gate ........................ GW11 = RW1 (code: GT2 tag, BUILT 0.60.42; environment: COS checkpoint, OPEN)
#   contract + dependencies as a checklist .... GW26 (requires hashed, STALE on drift) + GW25 confidence (weakest link: an
#                                               unevidenced item caps the pass). The checklist is the gate's pass_when +
#                                               requires, each ticked with evidence; no new format.
#   reflection engine ......................... GW25 after_settle: lib/reflection.js scores the gate's hypothesis; today no
#                                               gate calls it (found_2026_10_16)
#   failure mode logged on each failure ....... GW6 (classifyFailure BUILT 0.60.30 → fault-log + enrichGap, OPEN) and
#                                               GW8 = N14_failure_mode_field (conditions counted across runs, OPEN).
#                                               Coder's reading of "like the phases", to confirm: the failure_mode record
#                                               carries the same fields a phase does (systems, files, depends_on, specs) so
#                                               a failure is mapped exactly like a phase. Another reading: the phase's own
#                                               failure_modes list. To confirm.
#   rewind engine each step, each output ...... GW7 = RS2 (rewind to a step). AMENDS GW7: the replay unit is the gate, the
#                                               rewind point is any recorded step inside it (run-state steps: each tool
#                                               call and each reply), not only the gate boundary.
#   macros from events, snapshots, causal graph GW7 + FM1-FM4 (cortex/self-heal/failure-mode-forensics.js already writes a
#                                               .debug_macro from the causal chain; its schema says not yet playable)
#   RAID learns over time ..................... GT1 BUILT (learns route only from capability failures, budget from
#                                               capability + context; transient learns nothing) + GW6 (the door's next
#                                               pick changes from real gate outcomes, OPEN)
#
# What it would do for the pipeline (the coder's answer, given to him): today a failed build is retried blind and the
# lesson dies with the chat. With the loop, every failure becomes (1) a classified record with its conditions, (2) a
# macro that reproduces it with no model, (3) a rewind point one step before it, and (4) a weight change in RAID for that
# agent and gate kind. The second time the same failure shape appears, the pipeline avoids it before dispatch instead of
# discovering it after. That is the measurable claim: repeat failures of one signature per 100 gates should fall over
# time; if they do not, the loop is not learning, and the number says so (§0.1).
#
# Order unchanged: GW23 → GW3 → GW1 → GW2 ... (build_order above). Blocking decisions still his: GW0 (a brick is the unit,
# coder recommends a) and GW0c (replay recorded + live, coder recommends a).

# ## ADDENDUM 2026-10-16 (d) — GW0 decided: the brick is the unit
# James (2026-10-16), answering "is a gate's work unit the brick? I recommend yes. It's what makes 'a different agent each gate'
# true": "Yes. It’s analysis. The bricks."
# Decided (his): option a. The unit of work is the contract gate, the brick. Step gates stay checks inside a brick's step. The run
# state moves from one per chat session to one per brick attempt (GW2); the session is only a pointer.
# To confirm: "It’s analysis." The coder reads it as agreeing that the analysis behind the recommendation holds. Another reading:
# that a brick is (or includes) an analysis step, i.e. a brick analyses before it builds. Not acted on until he says which.
# Unblocks: GW1 (the baton), GW2 (the run follows the gate), and GW3 (a contract traced) on the brick as the unit.

