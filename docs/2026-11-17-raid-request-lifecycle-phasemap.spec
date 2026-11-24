# docs/2026-11-17-raid-request-lifecycle-phasemap.spec
# The request lifecycle: every input to Nexus, from the words he types to the met contract, stage by stage, with what exists for each
# stage, the phase that owns it, and the gap. One map to keep it all logged and referenceable (his ask). MAPPED 2026-11-17, before any code.
# It indexes; it does not re-map. Each stage names the phase that already owns it (expanded the same day with a pointer here) or says NEW.
# Registered in docs/SPEC-REGISTRY.spec. Logged in docs/atlases/cortex-atlas.md and docs/architecture-spec/architecture-spec.spec.

origin:
  date: 2026-11-17
  james_before: >-
    Asked whether RAID or each caller should reach the agents (the coder had put a local-or-tab switch in the officiator, 0.60.552):
    "wouldn't raid be the bridge?" · then, asked whether to do it now: "yes but look at the nodes."
  james: >-
    "input into nexus goes to raid.
    creates a input node for the whats been reqeuested.
    then creates a dependancy graph of whats needed to fullfill the request creating a contract as setting is as the end state of the
    compartment. the dag is conditions needed in order to complete the request.
    basically no or i dont know isn't a anwser.
    if it doesn't have the capability is can use idearium to build the capability.
    if it doens't know, can query cortex, the vector memory, associative lattice which is the end state for cortex, each node, database,
    component in the component store, each system, everything we can query to give copilot or the agents access for context, chat logs,
    everything but the architecture isn't  complete, i have been focusing on whats needed to get nexus coding from emerge, so i can stop
    using you for coding. use the intelligence system and agent tools for complex reasoning to reduce the complexity an agent or llm needs
    which means they can be drastically, emerge is built to code from structure, which is cie-eg, the architecture for the langauge i
    invented, it works the same bottom up,. same archicture as each system, reducing the friction since its compatable from the bottom up
    which means, its more optimized and stable since its built to work together, this is also to cut dependancy on you, and if im being
    honest, nexus is built to replace you.
    gates hold context, and persistence, nodes to maintain data after restarts, cortex is the bookkeeper for all data architiving to query.
    versionium to version and snapshot each system, rewind engine to rewind to snapshot system states.
     and use the gates
    then creates a contract of what is needed from what system/agent or the user with follow up questions, creating a index for each
    needed dependancy and what was used to fill the request both context, system or user, and the timestamp. also failure modes and
    faults/gaps.
    dag for what is needed whether its context to understand the request from cortex, other systems, anywhere in nexus.
    cortex will be the book keeper for all this at some point. query nexus first, check the component store before building anything,
    basically check from in nexus first, then outward.
    basically give request, creates node file from the input.
    then sends to raid, creates a open loop and a compartment with the input node, uses that as a work area and work surface for copying
    data, context, contracts, and anything else the contract needs to fullfill the request.
    the request becomes
    raid decides what to do with each request. look at the architecture and genesis spec. the system atlas'
    the phases. log what you can to the atlas and the architecture doc. WE need a huge document for all of this, a map keep it all logged
    and referencable."
  context: >-
    After 0.60.552 (the officiator asks local Ollama first, RAID's tunables get a door, intelligence's failure reports land in its folder) and
    his question whether RAID should be the bridge. He gave the lifecycle whole. It is the same lifecycle he gave on 2026-11-08 in the
    request spine (docs/2026-10-12-request-spine-phasemap.spec RQ7/RQ8/RQ13/RQ14, "raid creates compartments using a contract and the test
    and the dag for the stopping conditions"), shelved with the rest of the spine on 2026-11-07 ("Those are all top of my head ideas"), and
    partly picked up by RD9 (2026-11-12 and 2026-11-14). This map revives those phases by his word today and joins them into one line.
  purpose_his: >-
    Nexus coding from Emerge, so that a paid model is not needed for coding: "nexus is built to replace you." Every stage below is judged by
    that: what lets a small local model do the work because the structure (the DAG, the contract, the gates, the context already found)
    carries the complexity.

# ── The lifecycle, stage by stage ───────────────────────────────────────────────────────────────────────────────────────────────────────
# status words: BUILT (code and a test exist), PARTLY (some of it), SHELVED (mapped, set aside 2026-11-07, revived here), GAP (nothing yet)
stages:
  L0_the_input_becomes_a_node:
    his: '"input into nexus goes to raid. creates a input node for the whats been reqeuested." · "basically give request, creates node file from the input."'
    status: BUILT (slice a, 0.60.486)
    exists: "cortex/core/raid/input.js take(): the .input node is written before RAID decides; POST /api/raid/input; `raid input <words>`"
    owner_phase: RD9_every_input_through_raid (docs/2026-10-13-projects-raid-and-gates-phasemap.spec)
    gap: "only the Nexus CLI and the route reach it; cos.exe's command line and the other surfaces do not yet (RD9 slice c)"
  L1_the_open_loop_and_the_compartment:
    his: '"then sends to raid, creates a open loop and a compartment with the input node, uses that as a work area and work surface for copying data, context, contracts, and anything else the contract needs"'
    status: PARTLY
    exists: >-
      COS keeps one folder per pipeline request (cos/pipeline/runs.eg: run.run, dag.dag, steps/, nodes/, gates/; active/ until met, done/
      after) in cos/data/manager. An open loop is a word RAID already uses (snr-filter: friction above a threshold). No compartment is made
      per input, and the .input node is not placed in one.
    owner_phase: RQ13_the_work_surface_and_provenance (docs/2026-10-12-request-spine-phasemap.spec), SHELVED, revived here
    gap: "an input that becomes a request gets its compartment (the work surface) with the .input node in it, and an open-loop record that stays open until the contract is met or the DAG is complete (his 2026-11-14 persistence rule)"
  L2_the_dag_of_what_is_needed:
    his: '"creates a dependancy graph of whats needed to fullfill the request" · "the dag is conditions needed in order to complete the request" · "dag for what is needed whether its context to understand the request from cortex, other systems, anywhere in nexus."'
    status: PARTLY
    exists: >-
      contract-template.js takes dag nodes ({ id, needs, type: task|verification|context|phase, pass_when }) and makes each a gate; COS's
      request bundle writes dag.dag with the node types each wire carries. Nothing builds the DAG from the input yet: it is handed in.
    owner_phase: RQ7_the_context_obligations (request spine), SHELVED, revived here; RD9 slice b (the dag field)
    gap: "RAID drafts the DAG itself from the input: what context is needed to understand it, what capability does it, what each step needs first"
  L3_the_contract_is_the_end_state:
    his: '"creating a contract as setting is as the end state of the compartment"'
    status: BUILT (slice b, 0.60.529)
    exists: "cortex/core/raid/contract-template.js fill()/draft(): contract v2 (outcome, done_when = every DAG gate passed, gates, invariants, gaps); booked with Cortex (contract-v2-door.js); a required field nobody can fill is a gap, never guessed"
    owner_phase: RD9 slice b; RQ21_the_contract_file_is_its_record (the .contract file rewritten at every transition), SHELVED, revived here
    gap: "the contract is not yet set as its compartment's end state (the compartment does not exist, L1)"
  L4_nexus_first_then_outward:
    his: '"if it doens''t know, can query cortex, the vector memory, associative lattice which is the end state for cortex, each node, database, component in the component store, each system, everything we can query" · "query nexus first, check the component store before building anything, basically check from in nexus first, then outward."'
    status: PARTLY
    exists: >-
      Sources that answer today, each by its own door: lib/context-sources.js (one list of context sources), lib/component-store.js
      (`components`), lib/vector-memory.js (Cortex, TF-IDF fallback until nomic-embed-text is pulled), the associative lattice
      (lib/emergence/components/associative-lattice/, intelligence/lattice/), each system's node registry (GET /api/system/nodes/:system),
      each system's component registry and routes (its own, §5.16), lib/context-atlas.js (specs, notes, nodes), chat logs (guardian's chat
      transcripts, clear-glass chat-ledger), the atlases (docs/atlases/), Idearium's code intelligence (lib/code-intel/).
    owner_phase: RQ7_the_context_obligations (each obligation answered from Nexus's sources, evidence by reference), SHELVED, revived here
    gap: "one query order RAID walks for each DAG context node: Nexus's own stores first (component store before anything is built), then the systems, then outward (an agent, the web), then him; each answer kept as a reference with its source and hash"
  L5_no_or_i_dont_know_is_not_an_answer:
    his: '"basically no or i dont know isn''t a anwser."'
    status: PARTLY
    exists: "contract-template: a required field that cannot be filled is a gap put to him, never guessed; RQ8 (the gap is a question) mapped"
    owner_phase: RQ8_the_gap_is_a_question (request spine), SHELVED, revived here
    rule: "every node of the DAG ends in one of: answered (with its source), built (L6), or a follow-up question to him (L7). 'No' and 'I don't know' are not end states."
  L6_a_missing_capability_is_built:
    his: '"if it doesn''t have the capability is can use idearium to build the capability."'
    status: PARTLY
    exists: "idearium/pipelines/idearium-build.pipeline (what is ready, the phase covered, mapped, DAG, graph, build, closed, logged); PC3_the_build_request_step (a step becomes a build request)"
    owner_phase: PC3_the_build_request_step (docs/2026-11-08-pipeline-canvas-phasemap.spec)
    gap: "RAID turns a capability no system's registry offers (checked against the component store first, L4) into a build request to Idearium, and the contract waits on it as a DAG node"
  L7_follow_up_questions_and_the_fill_index:
    his: '"then creates a contract of what is needed from what system/agent or the user with follow up questions, creating a index for each needed dependancy and what was used to fill the request both context, system or user, and the timestamp."'
    status: GAP
    exists: "contract data items carry their source and hash (context, file, zip); RQ13 maps provenance as a read-only join"
    owner_phase: RQ13_the_work_surface_and_provenance (provenance), RQ8 (the question)
    gap: "the fill index: one row per needed dependency: what it was, what filled it (context | system | agent | user), the reference (source, hash), when, and the follow-up question if he was asked; kept in the compartment and booked with Cortex"
  L8_failure_modes_faults_and_gaps:
    his: '"also failure modes and faults/gaps."'
    status: PARTLY
    exists: "cortex/self-heal/failure-intake.js (one writer, POST /api/failure-modes), failure-report.js; contract v2's gaps field; diagnostic's gaps; intelligence's failure-mode reports in intelligence/data/failures (0.60.552)"
    owner_phase: FMR2_every_failure_reaches_the_record (docs/2026-10-17-failure-mode-report-phasemap.spec), FM4_the_report
    gap: "each failure, fault and gap of a request is written on its contract (by reference to Cortex's record), so the request's own file says what went wrong where"
  L9_raid_decides_and_delivers:
    his: '"raid decides what to do with each request." · "wouldn''t raid be the bridge?"'
    status: PARTLY
    exists: "RAID decides (index.js decideForContract, router.js route, PC16); delivery is each caller's: copilot/lifeline.js _tryOllama/_tryGuardian, lib/agent-reach.js KIND, and the officiator's local-or-tab switch (0.60.552)"
    owner_phase: PC16_raid_routes_every_interaction (docs/2026-11-08-pipeline-canvas-phasemap.spec)
    gap: "RAID is the bridge: it decides and delivers through the one door that knows each agent's kind (agent-reach KIND), with his preferences and fallback per intent as RAID's tunables; callers stop choosing (decided, RL_D1)"
  L10_gates_hold_context_and_persistence:
    his: '"gates hold context, and persistence" · "and use the gates"'
    status: BUILT in part
    exists: "contract-gates.js (GT1/GS1: commit at a pass, rewind on a fail), cos/pipeline/gate.eg (a gate decides; its types), PC_D1 gates as compartments, PC8 (what passed is kept at the gate; a run resumes from its last passed gate)"
    owner_phase: PC8_operate_a_pipeline, PC5_programmable_gate_types
  L11_nodes_keep_the_data_through_restarts:
    his: '"nodes to maintain data after restarts"'
    status: BUILT in part (the rule, 2026-11-14)
    exists: ".pipeline, .dag, .contract, .process_step and .input are node files (lib/node-export.js); his 2026-11-14 rule: no state in memory only until the contract is met or the DAG is complete"
  L12_versionium_and_the_rewind_engine:
    his: '"versionium to version and snapshot each system, rewind engine to rewind to snapshot system states."'
    status: BUILT in part
    exists: "Versionium (snapshots, lib/versionium-record.js record(), every change and version, §17.12); the rewind engine (clear-glass/src/rewind/engine.js; COS snapshots cos/foundation/snapshot.js, cortex cos state-provider)"
    gap: "a request's compartment snapshotted at its start and at each passed gate, so a failed request rewinds to its last good state"
  L13_cortex_keeps_the_books:
    his: '"cortex is the bookkeeper for all data architiving to query." · "cortex will be the book keeper for all this at some point."'
    status: PARTLY
    exists: "every ledger line also booked with Cortex through an outbox (his 'yes', 0.60.548, D35); the contract booked with Cortex (contract-v2-door.js); Cortex's failure-mode records"
    gap: "the .input, the DAG, the contract's transitions and the fill index all booked, and queryable from Cortex"
  L14_structure_carries_the_complexity:
    his: '"use the intelligence system and agent tools for complex reasoning to reduce the complexity an agent or llm needs" · "emerge is built to code from structure, which is cie-eg … same archicture as each system, reducing the friction since its compatable from the bottom up"'
    status: the direction
    exists: "intelligence (patterns, failures, reuse, CFR); the agent tools (lib/agent-tools/); Idearium's chunker (a step too big for its model becomes chunks, PC8 2026-11-14); Emerge and CIE-EG (emerge/emerge/spec/cie-eg.spec)"
    rule: "each stage hands the next only what it needs (the DAG node, its context by reference, its gate), so the model doing the work can be small and local"

  # ── ADDENDUM 2026-11-24 — his flow, each part placed against what exists (read in the files the same day) ─────────────────────────────
  # James, 2026-11-24: "Every input needs to route into raid, raid needs to route use copilot to complete tasks. Like copilot floats above,"
  # · "Input to raids signal to noise, then signal get through to raid, then the gap field, to determine complexity of request, than raid then
  # queries nexus, through cortex. Using the intelligence system, then uses copilot for any non-deterministic requests or anything that nexus
  # can't reason or outsource the complexity. Creates a contract using the dag, dag from decomposing the request into primitives, principles,
  # or variable using a Multidimential field to strip the noise. Then map to nexus using the graphs, semantic search, and any other query
  # tool, and agent tool." · "Synthesize the overlap or redundancy to preserve context window and tokens. Then anything left that's required
  # to understand the request, prompt the user." · "The dag, prereq and the test file creates the expected outputs. Filenames. Intent.
  # Context. Conditions for the request to be completed." · "Think dialectical and non linear. Agnostic. Tool router."
  L0a_signal_before_raid_commits:
    his: '"Input to raids signal to noise, then signal get through to raid" · "a Multidimential field to strip the noise"'
    status: PARTLY
    exists: >-
      Two different SNR mechanisms, not one. cortex/core/raid/snr-filter.js (raid-snr-filter.spec 1.1.0) is a known-solution pre-gate: a
      verified invariant or fix 1.0, a crystallized pattern its confidence, an open fault loop 0.5, unknown 0.0; RAID's provider selector runs it
      only when a faultClass is given, and an unknown is still dispatched. intelligence/topo-kernel/snr.js runs eight gates (entropy, variance,
      consistency, fidelity, causality, pattern, implicit memory, Bayesian trust) over numeric signals with a field and value, not over words.
    gap: >-
      One agnostic assessment of any input, kept whole as a profile rather than one score (the coder's reading of "a multidimensional field",
      to confirm): signal, noise, fidelity, coverage, uncertainty, complexity, dependency, resource demand, risk, novelty (reuse). Both
      mechanisms feed it as assessors. Low signal never discards: it sends the input to more analysis, decomposition or a question.
    owner_phase: NEW (reuses snr-filter.js and topo-kernel/snr.js; nothing rewritten)
  L1a_complexity_from_the_gap_field:
    his: '"then the gap field, to determine complexity of request"'
    status: PARTLY
    exists: "lib/gap-field.js (the one agnostic gap-reporting entry, his 2026-08: 'Needs to stay agnostic. Gap field ... Reducing ambiguity'); intelligence/gap (hunter.js, predicate.js, ledger.js): structural gaps found and escalated"
    gap: "the field measures a request before its DAG: how many gaps, how deep, which depend on which; that measure sets how far RAID decomposes and whether a small model, Copilot or he is needed"
    owner_phase: NEW (reuses lib/gap-field.js and intelligence/gap)
  L2a_the_dag_from_primitives:
    his: '"dag from decomposing the request into primitives, principles, or variable" · "The dag, prereq and the test file creates the expected outputs. Filenames. Intent. Context. Conditions for the request to be completed." · "the primitives are the boundaries for the structure. Anything that can''t be changed without changing the shape of the structure." (2026-11-23)'
    status: PARTLY
    exists: >-
      contract-template.js makes each DAG node a gate (L2); contract-gates.js splits a gate after two failures and never into the same pieces;
      intelligence/synthesis/engine.js normalizes, resolves dependencies, clusters, corroborates, ranks by centrality and leverage, and plans;
      EMB8 (docs/2026-10-17-pieces-not-order-phasemap.spec, 0.60.645+) gives every level the same contract block: signature, examples,
      constraints (invariant, boundary, rule, resource).
    gap: >-
      RAID decomposes the input itself: each node a primitive (an invariant, the shape that cannot change), a principle (the rule over it) or a
      variable (what changes), with its prerequisite (what must be known before it starts) and its contract. The expected outputs of each node
      come from the DAG, its prerequisites and the request's test file: file names, intent, context, conditions for done. Recording from
      existing code (EMB6) is only for code that already exists.
    owner_phase: RQ7 (L2) expanded; EMB8 for the contract block
  L4a_synthesize_the_overlap:
    his: '"Synthesize the overlap or redundancy to preserve context window and tokens. Then anything left that''s required to understand the request, prompt the user."'
    status: PARTLY
    exists: "cortex/core/raid/context-synthesis.js unions five query tools (recall, movement, meta-query, nexus-map, agent chat search) and loom-scan into one candidate stream; it says itself that it does not rank or dedupe. intelligence/synthesis/engine.js clusters and corroborates gaps."
    gap: "the candidates ranked and merged per DAG node, each merged record keeping every source's claim and reference (a merge that drops a source is information lost); what is still missing after Nexus first, then outward (L4), is the only thing asked of him (L5, L7)"
    owner_phase: RQ7 (L4) expanded
  L9a_copilot_above_for_what_nexus_cannot_reason:
    his: '"raid needs to route use copilot to complete tasks. Like copilot floats above" · "uses copilot for any non-deterministic requests or anything that nexus can''t reason or outsource the complexity"'
    status: PARTLY
    exists: "RL_D1b (his 2026-11-17): Copilot is a hat any agent RAID picks can wear. RAID decides (index.js, router.js); copilot/ assist-loop, adaptive-fulfillment."
    reading: "the coder's, to confirm: 'floats above' and 'a hat' agree. RAID routes each DAG node to the deterministic capability first; only a node Nexus cannot settle gets an agent wearing the Copilot hat, which coordinates and may delegate deterministic work back through RAID. Copilot never changes the contract it fulfils without RAID: a change is versioned and checked against the acceptance conditions."
    gap: "the node-level choice (deterministic, Copilot, him) made by RAID from L0a and L1a, and kept on the contract with why"
    owner_phase: PC16 (L9) expanded
  L15_the_pipeline_is_the_decision_tree:
    his: '"Using the pipeline as a dicision tree. Like dynamic, like a lineage. A visual canvas. Mapping and exploring the terrain. Then we have a map we can use for debugging, visual history, etc. like the pipeline is everything." · "Maybe each step can use a command or agent tool with an intent, agent, and system. Like I can program it, add steps, basically a visual surface for adding steps to use nexus like Tasker, like BrainOS, which needs to mirgage its features to the pipeline and automation engine."'
    status: PARTLY
    exists: "RL_D6, RL_D8 (the pipeline programs it; programmable, observable, diagnosable); COS's pipeline runs (cos/pipeline/runs.eg: run, dag, steps, nodes, gates); the pipeline canvas map (docs/2026-11-08-pipeline-canvas-phasemap.spec PC4 the box kinds, PC8 operate); BrainOS's map (docs/2026-10-21-brainos-into-idearium-phasemap.spec): BX1 census and BX2 flow sources DONE, BX3 flow canvas, BX4 agents, BX5 node controls, BX6 pipeline edit, BX7 automation PLANNED"
    gap: "each step a box naming its intent, its agent and its system, running one command or agent tool through RAID; he adds and wires steps on the canvas; each run kept as its lineage (which branch was taken and why), so the canvas is also the debugger and the history"
    owner_phase: PC4, PC8 (pipeline canvas); BX3, BX6, BX7 move to COS (RL_D9)
decisions:
  RL_D1_raid_is_the_bridge:
    status: "DECIDED 2026-11-17 by James — 'wouldn't raid be the bridge?' · 'yes but look at the nodes.'"
    chosen: >-
      RAID decides and delivers. One door knows each agent's kind (the local bridge for ollama and mistral, guardian's NCP for the browser
      agents) from lib/agent-reach.js KIND; his preferences and the fallback live in RAID's tunables per intent, not in each caller. The
      officiator's 0.60.552 switch and its officiatorAgents move into RAID (replaced, not duplicated). Axioms: §5.2 everything routes through
      RAID, §9.1 RAID the only write authority for requests, §10.3 competing truth layers (four copies of 'how to reach an agent').
    same_as: >-
      His own decisions of 2026-11-13 (docs/2026-11-08-pipeline-canvas-phasemap.spec): PC_D15 "let's hook in RAID finally as the hub for all
      the interactions. Everything routes through RAID." and PC_D16 "let's start using Olama instead. And then use Guardian if we have to."
      RL_D1 restates them; it adds no new decision. 0.60.552 built the Ollama-first order in the officiator alone, not in RAID: that is the gap.
    phase: PC16_raid_routes_every_interaction (expanded today)
    found: "the DAG checker reads PC16's depends_on (PC_D15, PC_D16) as dangling: they sit under a 'decisions_2026_11_13:' key it does not parse. Said, not changed here."
  RL_D1b_copilot_is_a_hat:
    status: "DECIDED 2026-11-17 by James — 'copilot is meant to be a hat that any agent casn wear'"
    chosen: "copilot is a persona (.hat) any agent RAID picks can wear, not a system that routes or delivers; its routing and delivery are RAID's (PC16 expanded_2026_11_17_copilot_is_a_hat)"
  RL_D2_no_is_not_an_answer:
    status: "DECIDED 2026-11-17 by James — 'basically no or i dont know isn't a anwser.'"
    chosen: "every DAG node ends answered (with its source), built (Idearium), or asked (a follow-up question to him); never 'no', never 'unknown'"
  RL_D3_nexus_first_then_outward:
    status: "DECIDED 2026-11-17 by James — 'query nexus first, check the component store before building anything, basically check from in nexus first, then outward.'"
    chosen: "the query order for any context or capability: Nexus's own stores (component store first), then each system by its door, then outward (an agent, the web), then him"
  RL_D4_cortex_keeps_the_books:
    status: "DECIDED (his 2026-11-09, restated 2026-11-17) — 'cortex is the bookkeeper for all data architiving to query.'"
    chosen: "each system keeps its own data (his 2026-11-17 'All systems keep their own data'); Cortex books every record of the lifecycle by its route, for query"

  # ── ADDENDUM 2026-11-17 (b) — map before executing; the pipeline is how it runs (his) ─────────────────────────────────────────────────────
  # James, 2026-11-17: "each requests need a dag. the system needs to map before executing. that way it doesn't drift. it knows what it building towards. it has stopping conditions for the end state. a test flle to shape expectations. like i want this all editable and programmable in nexus using the pipeline. like .frameworks or .pipelines. as executable instructions for each step. to make it more deterministic and repeatable. make it persistent, reduce the amount of effort it takes from the llms and agents, makes nexus aware if its processes. idearium does a lot of this already and its meant to be in cos instead."
  # · then: "yes and the pipeline makes this programmable, observable, diagnosable, debuggable, and bottlenecks. emerge can use the pipeline per word, primative, to make an size llm capable. visual coding and debugging. like please write this somewhere."
  RL_D5_every_request_has_its_dag_before_it_runs:
    status: "DECIDED 2026-11-17 by James"
    chosen: >-
      No request runs before it is mapped. Every request gets its DAG first (L2), and with it three things written as files before any step
      runs: what it builds towards (the contract's end state, L3), its stopping conditions (the DAG's gates, each with pass_when: the run
      stops when they all pass, or a gate holds it), and a test file that shapes what is expected (the acceptance the end state is checked
      against; it cannot be moved once the run starts: RQ23_acceptance_conditions_that_cannot_be_moved). So a run cannot drift: every
      step answers to a node it was mapped for. Axioms: §3.3 map before build (now for every request, not only for code), §2.1 persistence.
  RL_D6_the_pipeline_programs_it:
    status: "DECIDED 2026-11-17 by James"
    chosen: >-
      All of it is editable and programmable in Nexus through the pipeline: a request's steps are executable instructions, kept as node
      files (.pipeline, .framework, each step a .process_step; the .dag and .contract beside them), edited on the canvas or as text, run by
      COS. Deterministic and repeatable (the same file runs the same way), persistent (his 2026-11-14 rule), and Nexus aware of its own
      processes (every run, step and gate is a file it can read). The agents and LLMs do less: the structure carries what they would
      otherwise have to hold. The formal pipeline is cos/spec/pipeline.spec (lifecycle 1–9, PL-001..PL-011; PL-012 added today); frameworks
      as steps are PC2_procedures_and_frameworks_as_steps.
  RL_D7_idearium_s_mapping_belongs_to_cos:
    status: "DECIDED 2026-11-17 by James (the same as IF_D1, 2026-11-15)"
    chosen: >-
      "idearium does a lot of this already and its meant to be in cos instead." Idearium's map-before-build machinery (phases, the DAG and
      its graph, the census, the build loop, the chunker) runs through COS's pipeline, as IF_D1 decided (docs/2026-11-15-the-factory-phasemap.spec:
      "the pipeline is the factory, and the factory builds Nexus, itself included"). This lifecycle's L2 (the DAG drafted) reuses it, moved,
      not rebuilt.
  RL_D8_programmable_observable_diagnosable:
    status: "DECIDED 2026-11-17 by James"
    chosen: >-
      Because each request is a pipeline, it is programmable (its file), observable (every step and gate live on the canvas), diagnosable and
      debuggable (each step's input, output, gate verdict and error kept: PC8), and its bottlenecks measured (each step's delta against its
      baseline: PC8 slice a, cos/pipeline/baseline.eg). Emerge uses the pipeline per word, per primitive: a step small enough that a model of
      any size can do it (the chunker, PC8 2026-11-14; PC17), with visual coding and debugging on the canvas (PC4).

  RL_D9_brainos_moves_to_the_pipeline:
    status: "DECIDED 2026-11-24 by James — 'like BrainOS, which needs to mirgage its features to the pipeline and automation engine.'"
    chosen: "BrainOS's planned features (BX3 flow canvas, BX4 agents layer, BX5 node controls, BX6 pipeline edit, BX7 automation) land in COS's pipeline and automation engine, not in Idearium. The same direction as RL_D7 (Idearium's mapping belongs to COS). BX0a's landing in Idearium (2026-10-21) is kept as history and superseded."
open_his:
  - "the request becomes …: the sentence ends there. What does the request become (a pipeline run, a contract, a project in Idearium)?"
  - "'and use the gates' stands alone in his message: which gates, where (the reading in L10 is the coder's: the contract's DAG gates and COS's gate types)."
  - "'which means they can be drastically …': the sentence ends there (the coder's reading: drastically smaller models)."

order: >-
  Bottom up, each phase backend → route → command → UI (his order):
  1. RL_D1 (PC16 expanded): RAID delivers. Small, and it ends the paid-agent leak at its root.
  2. L1 (RQ13): the compartment and the open loop per request, the .input node inside.
  3. L7 (RQ13, RQ8): the fill index and the follow-up question.
  4. L4 (RQ7): the Nexus-first query order for each context node.
  5. L2 (RQ7): RAID drafts the DAG from the input.
  6. L6 (PC3): a missing capability becomes an Idearium build request.
  7. L12, L13: the compartment snapshotted per gate; every record booked with Cortex.
  The pipeline can carry 2-7 once 1 is in: each is a phase Nexus builds through idearium-build, with Claude only on a failure's root cause.

# ADDENDUM 2026-11-24 — his flow placed stage by stage (L0a, L1a, L2a, L4a, L9a, L15; RL_D9). Found the same day: the map did not load as
# YAML (three \' escapes inside single-quoted words; YAML writes ''), so every tool reading it failed; fixed. Checked in the files, not assumed:
# the two SNR mechanisms (different inputs, both kept), context-synthesis (no ranking, said in its own header), lib/gap-field.js, BrainOS's map.
# Nothing built by this addendum.
