# docs/2026-11-25-break-anything-down-phasemap.spec — the pipeline breaks anything down to its smallest unit, and builds it back up
# author: james-brooks (the idea, the direction and the framework are his; the coder wrote this origin; each phase below was added through
# Idearium's own route, POST /api/repos/:repo/phases/add, his "look at idearium for the mapping")
origin: >-
  James, 2026-11-25: "im saying the pipeline could break down anything into components, or pieces, or the smallest unit of anything. expand the
  capability of nexus to its max potential. anything. use my framework to find all the things it could do." · "but no, i meant look at idearium
  for the mapping." · Before, the same day: "everytime you need to step in, you need to give capability, not do it yourself." · "everything
  goes to the pipeline. each request." · "Like a tree of branches." His framework, which this map runs as a machine:
    Section 7 Deconstruct: "Zoom in recursively and fractal until you hit bedrock ... Now throw away everything that isn't an invariant."
    Part 3 Synthesis: "the convergence of primitives" · "One gap is an anomaly, Two gaps a coincidence, Three gaps = A invariant, not fact."
    Section 3 Finding the gaps: "Map the invariance, primitives, principles, in the overlap. Now you have the boundary for the constraint field."
    Section 14 Cross-domain: "Any output can be fed into any system, any tool can be an input for a different output" (his meta domains:
      strategy, innovation, economics, relationships, cognitive, physical, temporal, structural, experiential).
    Section 10 Hostile verification · Section 17 Failure mode detection · Section 16 Iterate & integrate · Part 5 Signal to noise.
found: >-
  The coder's census, 2026-11-25, of what Nexus already has for this (his "always use what nexus has"): the pipeline grows a run from its
  steps (PC26 slices 1, 1b), Idearium's His request and build pipelines (words → intent → phase → build; never run), the emerge rung (a
  piece small enough for the 3b: EMB2-EMB12), the gaps and the crystallizer (three = an invariant), Pillar (the reusable component store),
  COS compartments, RAID, Cortex's failure modes (each coder intervention now filed as needed-the-coder). What is missing is the general
  step: decompose anything, not only a code phase.
decided: >-
  The unit, from the build's own evidence (EMB3, EMB10): a piece is small enough when one gate can check it and the smallest model can fill
  it; above that it is broken down again. Every piece is a node with its parent, its contract (end state), its gate and its builder (PC26:
  one tree, nothing implicit).
axioms: "Part IV; §5.9-§5.16 (each system its own pieces, reached by route), §8.6 (reuse: the grow, the rung, the crystallizer, Pillar, Idearium's mapping)"

phases:

  UD1_the_unit_a_piece_with_its_parent_contract_gate_a:
    status: pending
    depends_on: []
    does: >
      A piece of anything is a node: its parent, its contract (the end state it must reach), its gate (what checks it) and its builder (who or what fills it). It is the smallest unit when one gate can check it and the smallest model can fill it; above that it is broken down again. Agnostic: a code phase, a document, a plan, a song, a conversation, a framework.
      Expanded 2026-11-26, his: "Okay but it's running a phasemap. Like each node is one unit of something, which can break down into its. Like an idea can be created into a spec, then in phases, then in phase nodes, dag per gate for a check list of what's needed. Like each node can be an end state and broken down." · "like each node is a chunk, its own piece in the progress bar". The same unit at every level: an idea becomes a spec, the spec its phases, a phase its phase nodes (.phase node files under it, each persisted), and any node breaks down again the same way. Every node is an end state; its gate holds a DAG, the checklist of what that node needs, and the node is met when its checklist is. Each node is one chunk of its parent's progress (the pipeline list's increments, 2026-11-26), and opens into its own layer on the canvas.

  UD2_is_it_even_a_framework_problem_the_gate_before_b:
    status: pending
    depends_on: [UD1]
    does: >
      His Section 0: 'Before anything enters the loop, ask: is the loop the right tool here? Some problems need a system. Some need presence, rest, grief, or breadth.' Before an input is broken down, a gate says whether it should be: a person's feelings, a relationship, grief are not decomposed by default; it is said, and his to override.

  UD3_the_decompose_step_one_branch_per_piece_down_to_:
    status: pending
    depends_on: [UD1, UD2]
    does: >
      His Section 7 Deconstruct ('Zoom in recursively and fractal until you hit bedrock'): a pipeline step kind that breaks its input into pieces and grows one branch per piece in its own run (PC26 grow), each piece broken again until it is the unit; each piece's builder chosen by its kind (Emerge, a model, a tool, a pipeline, him).

  UD4_anything_in_every_input_read_into_the_same_tree_:
    status: pending
    depends_on: [UD3]
    does: >
      His Section 14 ('Any output can be fed into any system'): his words, a .spec, a phasemap, a file or a folder, a page, a framework section, a run's record each enter through one reader into the same piece tree, so the decompose step never knows what it was given.

  UD5_invariants_across_pieces_become_components:
    status: pending
    depends_on: [UD3]
    does: >
      His Part 3 ('One gap is an anomaly, Two gaps a coincidence, Three gaps = A invariant') and Section 3 ('Map the invariance, primitives, principles, in the overlap'): pieces with the same contract in different trees are counted by the crystallizer; one seen three times becomes a reusable component in Pillar, so the next tree reuses it instead of building it.

  UD6_build_back_up_synthesis_toward_the_end_state:
    status: pending
    depends_on: [UD3, UD5]
    does: >
      His Part 3 ('Synthesis: the convergence of primitives') and Section 6 Rebuild: passed pieces join back up the tree to their parent's contract, reusing components, until the root's end state holds; a join that fails is a gap, broken down again.

  UD7_cross_domain_the_same_problem_broken_down_throug:
    status: pending
    depends_on: [UD4, UD6]
    does: >
      His Sections 5 and 14 (horizontal contamination; meta domains: strategy, innovation, economics, relationships, cognitive, physical, temporal, structural, experiential): parallel pipelines break one problem down through different domains; pieces identical across them are joined and counted (PC26 the overlap).

  UD8_every_piece_attacked_and_measured:
    status: pending
    depends_on: [UD3]
    does: >
      His Section 10 (hostile verification) and Part 5 (signal to noise): each piece's gate includes the adversary (three readers) and his equations (PC27: Fidelity, Alignment, Expansion, Tension, Slope), so a piece that passes is also scored.

  UD9_every_coder_intervention_broken_down_into_a_capa:
    status: pending
    depends_on: [UD3]
    does: >
      His rule, 2026-11-25: 'everytime you need to step in, you need to give capability, not do it yourself.' Each needed-the-coder failure filed with Cortex is input to the decompose step: broken down into the capability that was missing, mapped, and built by the pipeline; counted per phase toward zero (T18).

  UD10_failure_modes_broken_down_to_their_mechanics:
    status: pending
    depends_on: [UD3]
    does: >
      His Section 17 ('Isolate the mechanics of the failure, not the specifics ... update the detection system'): a failure is broken down to the mechanism that made it; that mechanism becomes a detection rule (a gate or a gaps.eg rule) applied to every later run.

  UD11_nexus_broken_down_into_itself:
    status: pending
    depends_on: [UD5]
    does: >
      Nexus's own systems broken down to their components by the same step (Pillar, genesis, the system registry), so Nexus holds a map of itself that it can rebuild from; his Section 17 'Periodically run Phase 0 on the framework itself'.

  UD12_his_framework_as_step_kinds:
    status: pending
    depends_on: [UD3]
    does: >
      Each section of his Innovation Toolkit a pipeline step kind (Deconstruct, Find the gaps, Map the leverage, Horizontal contamination check, Rebuild, Hostile verification, Iterate and integrate, Failure mode detection), so any pipeline can run his framework on any input; PC2 procedures and frameworks as steps.

  UD13_idearium_decomposition_moves_into_the_pipeline:
    status: pending
    depends_on: [UD3]
    does: >
      His 2026-11-26: "i feel like idearium has way too much that the pipeline should". Idearium splits a spec into chunks (spec-engine blocks.yaml and templates, compiler-t0, speceng.build) and dispatches each through chunk-dispatch (a retry ladder and a verifier from lib/seam/queue.js). Each of these becomes a pipeline step kind in COS, reached by route, so any pipeline decomposes and dispatches anything, not only Idearium builds. Corrected the same night, his: "no. idearium should be migrating all of its pipeline tools. then idearium uses cos not the other way around." So the tools move: COS owns them, Idearium calls COS for them, and nothing in COS reaches into Idearium. And his: "each step a node. instead of a step. that way it can be anything ... each pipeline would be a series of nodes. each gate knows whats needed for its node" · "first box should be the request. the last one the contract. each step either builds from the last or from the mulitidential dag for whats needed for each layer as a check list for each node" · "the intention is always the end-state ... working and planning backwards, building forward but nonlinear". Found already in Nexus (his "look at the phases before anything"): COS keeps each request as node files (cos/pipeline/runs.eg: run.run the request, the .contract booked with RAID, dag.dag, steps/*.step one node per step with its conditions, nodes/*, gates/*), and the associative lattice is the intelligence system's (intelligence/lattice/).

  UD14_algebraic_gates_laws_checked_on_every_piece:
    status: pending
    depends_on: [UD3]
    does: >
      His 2026-11-26: "what about using algebra to test and verify outputs ... the most vital piece is quality assurance". Each piece gets laws as well as examples: identity, idempotence, monotonicity, inverse and round-trip, composition (served_by: the empty list serves any file; adding text to the list never unserves a file). Emerge checks them on generated inputs with no model and no known answers; a piece that breaks a law is refused with the law and the input that broke it. Laws come from the sentence (read by the three readers) and from crystallized invariants.

  UD15_the_graph_substrate_every_piece_a_node_of_the_kn:
    status: pending
    depends_on: [UD3]
    does: >
      Emerge compiles a spec into a knowledge graph whose unfilled nodes (BLACK) are gaps (kg-builder, specDepth). The pipeline tree and that graph become one structure: a step is a node, its contract the node, its gaps the BLACK nodes, so a build is the graph filling in.

  UD16_crystallization_in_the_loop_solved_pieces_reused:
    status: pending
    depends_on: [UD5]
    does: >
      WARP crystals and the intelligence crystallizer (three sightings is an invariant): a piece whose contract was solved before is served from its crystal before any model is asked; a pattern seen three times across runs is promoted to a component or a law.

  UD17_raid_routes_bricks_chunk_size_chosen_by_measured:
    status: pending
    depends_on: [UD3]
    does: >
      Each step is a brick RAID routes (which model, which tool) with its proof; the chunk size is dynamic: a piece is split until its size is one the chosen model has passed before (its measured pass rate per size), so the smallest model gets pieces it can do.

  UD18_every_model_call_a_node:
    status: pending
    depends_on: [UD3]
    does: >
      His 2026-11-26: "any model call should be a step. it is still doing things without adding another step" · "one node is the smallest unit of each node. like each event, step, gap, chunk, brick". Each try of a piece (its prompt, its model, its answer, its verdict) is a node of the request (cos/pipeline/runs.eg steps), grown from the piece it tries; the canvas shows every call, nothing happens inside a step unseen.

  UD19_the_phases_built_bottom_up_node_by_node:
    status: pending
    depends_on: [UD3, UD18]
    does: >
      His 2026-11-26: "what if we build per node. then we could have all of the phase nodes build one by one. bottom up?". One request whose first node is his request and whose last is the contract: the phase nodes (the .phase files under */phases/) in their DAG order from the bottom (depends_on), each phase a node that grows its pieces, each piece its tries; a phase is met when its proof holds, and the next above it starts.

  UD20_every_nexus_system_hooked_into_the_pipeline_thro:
    status: pending
    depends_on: [UD3]
    does: >
      His 2026-11-26: "nexus systems need to be hooked into the pipeline. the pipeline is everything nexus can do, step by step" · "raid needs to connect to each drawbridge" (built: every drawbridge call RAID decides). An audit per system from its atlas and its registry: the hooks it offers (GET /api/cos/systems/<sys>/hooks), each a node kind the pipeline can run, through RAID; a system with no drawbridge yet is named as the gap, with what it does that the pipeline cannot reach.

  UD21_each_piece_built_through_warp_2_behind_its_own_s:
    status: pending
    depends_on: [UD3, UD18]
    does: >
      His 2026-11-26: "look at rfr2, cfr and warp 2 specs. that was meant to make the coding more capable" · "Warp should be replaced by warp 2.0. Replace siso" · "Also no coupling remember that". WARP 2 (emerge/emerge/field/warp.eg, built 2026-11-26: the link, nothing without its cause; expectations declared first, broken ones gaps; every link through the field's constraints and the causal layer) is the path a piece takes, and each system runs its own field behind its drawbridge: a cause that crosses systems is the drawbridge call that carried it, recorded on both sides by its id; Cortex and the intelligence lattice read the whole tree, a view, never a centre. WARP 1's ideas that are his stay (the exact cache, the scored population of variants as the alternatives, the cascade cheapest first with its cost said, the axiom gate as the algebraic gates); SISO's shape (Event, Gate, Stream, a shared bus) is replaced, file by file, each proven by its own tests before the SISO call is removed.

  UD22_constraints_acknowledged_before_every_decision:
    status: pending
    depends_on: [UD3]
    does: >
      His 2026-11-26: "cheap first, as long as thats noted, or break it down more, quality shouldn't come at the cost of what nexus can work around" · "maybe constraints need to be acknowledges before decisions. work with you have in the moment, or wait for the system to clear memory?". Before a decision node (a model, a fan-out, a retry), a constraints node reads what is true now (free RAM and VRAM, engines up, the queue: PG1) and writes the choice and why: go now with what fits, break the piece down more, or wait for room (RAID by signal to noise, PG2). Cheap first is always noted as cheap; quality is never lowered to fit: a piece that cannot pass on what fits waits or is broken down, never passed weaker.

  UD23_examples_without_him_recorded_facts_first_then_t:
    status: pending
    depends_on: [UD3, UD8]
    does: >
      Found on the first scheduled run (71eefa48, 2026-11-26): 0 of 50 ready phases had examples, so the builder refused all of them. Asked how the pipeline may get examples overnight given his rule that proposed examples wait for his yes, he answered: "I don't know. It needs to never need you at somepoint. Follows the axioms. Inside nexus first." Decided by the axioms (§1.1 nothing exists until proven; TRUTH_OVER_COHERENCE; verify first) and his "inside nexus first": (1) where a phase's files exist, examples are recorded by running the existing code (EMB6's end state: facts, proven by construction, used at once); (2) for new code, a model proposes examples from the phase's sentence and the three different 3b readers read them blind; only those all three agree on are used to build, each marked agreed-not-confirmed and written to the ledger; a disagreement is a gap kept for him; (3) his yes stays available and is never required: a confirmed example loses its mark; an agreed example later shown wrong is a failure mode filed with Cortex, its lesson fed back. The queue grows an examples step before the build for every ready phase that has none.

  UD24_the_dag_from_the_end_state_backwards:
    status: pending
    depends_on: [UD1, UD2]
    does: >
      His 2026-11-26: "It needs to be able to break things down. Thays the point. Build a dag From rhe end state." His framework, Section 2: "Set the end-state → determine invariants → replicate conditions → test, iterate & loop"; Section 7: "What is the desired outcome, and what conditions must exist for it to happen?". Found in Nexus: RAID's contract template (cortex/core/raid/contract-template.js) holds the result (the outcome is the end state; the DAG is the conditions, each node a gate with needs and pass_when; met when every gate passed) but takes the DAG as given: nothing produces it. This step does, in Emerge (cos/pipeline/backward.eg) on WARP 2's causal layer: from the end state, each node is asked what must be true before it (a model proposes, inside Nexus first: an existing phase, component or passed piece with the same contract is reused, never asked); each proposed condition becomes a node with its gate, checked (no cycle, no diamond: causal.eg), and is broken down again until it is the unit (one gate checks it and the smallest model can fill it, UD1); the finished DAG is the contract's conditions, built forward from the leaves, non-linearly (any node whose needs are met runs). Each round is a pair of nodes on the canvas (ask, check), so planning backwards is itself on the tree.

  UD25_the_loop_that_replaces_the_coder_a_strong_model_:
    status: pending
    depends_on: [UD9]
    does: >
      His 2026-11-26: "how long until we can remove you from the dependancies?" · "why can't we add that? like look at nexus. 500k lines. all of this is for that" · "yes the drawbridge. decoupling would make nexus more stable and since we could have per component isolation with means we only use what is needed". Found in Nexus, built: Guardian's browser agents (Claude, ChatGPT, Gemini, Perplexity, Grok: his signed-in accounts, a provider tab opened on demand by Clear Glass's provider host), RAID's routing to them (lib/agent-reach.js KIND ncp), the agents' code proposals through the code-write gate (lib/repo-agent.js), proposal evidence (lib/proposal-evidence.js: the linked tests run before and after in a shadow copy; a regression blocks it), COS's sandbox and compartments, the ledgers and Cortex's failure modes. The loop joins them: a needed-the-coder record, or a piece the local models cannot do, becomes a request to RAID; RAID routes it to a browser agent with Nexus's own records as its context (Copilot's lookup, PC29 d); the agent's proposal runs through proposal evidence in the sandbox; RAID approves on that evidence; it is applied and recorded, and the pipeline goes on. Every hop is a drawbridge call, so each part loads only when it is used and one failing does not take the others down. Measured by the needed-the-coder count falling (T18).

  UD26_the_intelligence_system_as_the_agents_tools_anyt:
    status: pending
    depends_on: [UD4]
    does: >
      His 2026-11-26: "what about making the intelligence system all tools for the agents. models to learn sites, files, anything using the associative lattice. agnostic." · "assiacative lattice, for grammer traversal ... synthesis. all of these tools have a millilion uses. all of the memory, the graphs, all of the agent memory". Each faculty of the intelligence system (mastermind: what follows; intuition: what it resembles; liminal: what is missing or assumed; synthesis: gaps ranked by leverage; sigma and the baselines: what deviates; the associative and node lattices) is an agent tool, reached only through the intelligence system's drawbridge and RAID, loaded only when used. One way in for anything (a site read by Clear Glass, a file, a folder, a repository, a conversation, a Mastermind vault): read into nodes of the associative lattice, linked by time, cause and meaning; an agent reasons by walking it (resembles, follows, missing), so a model learns a site or a codebase with no training: Nexus remembers it for the model. Deterministic first; the model fills the last hole.

  UD27_mastermind_brought_in_decomposed_converted_to_em:
    status: pending
    depends_on: [UD26]
    does: >
      His 2026-11-26, pointing at D:\Projects\2-Products\Mastermind\MASTERMIND-v0_1_50-username-required.zip. Mastermind (his): the Voice Lattice (107 functions), ALM (cognitive functions, 8 human models, experiments, heuristics, frameworks, feedback loops), horizon planning with its epistemic register, the synthesis lab, the brain map, the insight vault, the Notion/Obsidian/text import, the playground; unintegrated: spatial v2 (resonance engine, signal topology, invariant baseline), Pendulum Swing, CrystalBall, Rheon Voice. Its own phasemap/COMPONENTS.md already decomposed the old 11,125-line file. Imported through Idearium, each component converted to Emerge by recorded behaviour (the existing JavaScript run, its outputs recorded as examples, the Emerge version held to them), its SISO and WARP 1 replaced by WARP 2, each faculty a tool behind its drawbridge.

  UD28_the_builder_learns_what_ol6_load_score_needed:
    status: pending
    depends_on: []
    does: >
      Found by the pipeline, 2026-11-26 loop (his: "fix itself each time and return to the original request, and retry, until it either does it or figures out how"). OL6_load_score (docs/2026-11-18-ollama-local-agent-phasemap.spec) was not built after 4 attempts (strong-readers, fresh-plan, top-model). The last reason: no progress at the top of the ladder (DeepSeek-Coder-V2-Lite-Instruct-abliterated-i1-GGUF:Q4_K_M): refused the phase’s words gave no file with signatures, and no Emerge file with a spec module or functions: {"ok":true,"plan":{"system":"idearium","read":["the files the phase names","the component registry","the files it edits, as they are"],"intent":"A score for each primitive, dependency and chunk of how. The builder gains what this names; then OL6_load_score is built again from its request.
