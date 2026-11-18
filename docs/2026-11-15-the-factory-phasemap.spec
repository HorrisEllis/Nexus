# docs/2026-11-15-the-factory-phasemap.spec — the factory: what Idearium built that runs moves into COS's pipeline, and the pipeline builds Nexus
# (itself included). The ideas and the calls are James's; the census, the reading and the cut into phases are the coder's, said where they are.

origin:
  date: 2026-11-15
  james: >-
    "like continue the pipleline. i want idearium to use the pipeline for the agents. i feel a lot of idearium got what cos should have, both the
    compartment aspects rewind engines, gates, everything cos, and the pipeline should. also the substrate specs. like this has so much more than
    it does, like the pipeline should be a full factory at this point. like building itself."
  stands_on: >-
    His architecture of 2026-11-14 (docs/architecture-spec/architecture-spec.spec ADDENDUM 2026-11-14 §6, his words): "the compartments in idearium
    need to be synced with the cos ui compartments, should be the same compartment with a different lens" · "gates between each layer. the
    drawbridge … then pipeline can be each layers components also" · "what about reusing the gate? gate.eg if its identicle?" · "I want that to be
    the way idearium builds." Layers named there: runtime (COS), build (Idearium), data. And his 2026-11-13 "then we should use .chunks as steps"
    (the substrate map's addendum), PC13 (his request built by the pipeline, 0.60.526), PC12 (every pipeline in COS), CS11 (RAID moves into COS).

status: MAPPED 2026-11-15. Nothing built by this map yet.

census_2026_11_15: >-
  Read from the code (the coder's). idearium/api/index.js is 12,106 lines with 113 helper functions. What in it RUNS work, and so is the
  factory's: _phaseBuild (one function, 1,082 lines: snapshot, file mapping by an agent (SL8), plan, test written first, chunks, the Emerge rung,
  the agent ladder per chunk, landing, proof), _provePhase 76, _phaseVerdict 43, _landByRule 18, _agentAsk 43, _routingPolicy and _ollamaModels
  16, _ensureCompartment 41; and its timers: _loopTick 19, _autoRetry 23, _watchRuns 30, _startBuildQueuePoller 136. Beside it:
  idearium/repo/snapshot.js 500 and snapshot-restore.js 150 (the rewind), proof-run.js 410, build-plan.js 223, idearium/lib/emerge-rung.cjs 120,
  autobuild.js 104, spec-engine/chunk-dispatch.js 354 (agents for spec chunks). What COS's pipeline already has: the engine (steps, gates, holds,
  pause and continue, retry from a step, runs as files), gate.eg with programmable gate types (PC5), box.eg, contract.eg (RAID's contracts as
  pipelines), the agent step (RAID decides, Guardian runs), requests (his-request.pipeline), the sync of every system's pipelines. What Idearium
  should keep (the coder's reading, IF_R1): the documents — specs, maps, ideas, the idea hub — and its views of code and phases.

decisions:
  IF_D1_the_factory_is_cos:
    status: DECIDED 2026-11-15 (his)
    chosen: >-
      What Idearium built that runs work (its compartments, its rewind, its gates, its build loop and the agents it calls) is COS's; the pipeline
      is the factory, and the factory builds Nexus, itself included. Idearium uses the pipeline for its agents.
    by: "his, 2026-11-15 (origin above); his architecture of 2026-11-14 §6"

readings_to_confirm:
  IF_R1_what_idearium_keeps: >-
    (a) the coder's: Idearium keeps the documents (specs, phasemaps, ideas, the idea hub, the spec workshop) and its views of code, phases and
    runs; every run, gate, rewind and agent call is COS's pipeline, which Idearium asks by route. (b) Idearium becomes a page of COS only, its
    documents moving too. (c) another split he names.

phases:
  IF0_the_census:
    status: DONE 2026-11-15
    depends_on: []
    files: [docs/2026-11-15-the-factory-phasemap.spec]
    does: "what in Idearium runs work and what COS's pipeline already has (census_2026_11_15)"
    proof: "the counts in census_2026_11_15, each read from the tree"
  IF1_idearium_asks_agents_through_the_pipeline:
    status: OPEN
    depends_on: [IF0_the_census, PC16_raid_routes_every_interaction]   # PC16 added 2026-11-17 (docs/2026-11-17-nexus-codes-itself-phasemap.spec T5): the agents are asked through RAID, which delivers
    files: [idearium/api/index.js, idearium/spec-engine/chunk-dispatch.js, idearium/lib/page-agents.js, cos/manager/automation-door.js, cos/pipeline/pipelines]
    does: >-
      His first words: "i want idearium to use the pipeline for the agents". Every agent call Idearium makes (_agentAsk, the ladder's dispatch in
      _phaseBuild, chunk-dispatch, page agents) becomes a run of one small pipeline in COS ("ask an agent": RAID decides who, the Ollama ladder
      first, Guardian or ollama-bridge runs it, the reply is the step's output), asked by Idearium through COS's route. Every agent call is then a
      run in COS's Automation tab, with its decision, time and failure class (PC11) — seen, retried, measured.
    proof: "a stand-in agent: a phase build's chunk answered through the pipeline; the run shows in COS with RAID's decision; Idearium holds no dispatch code path of its own"
  IF2_the_build_as_a_pipeline:
    status: OPEN
    depends_on: [IF1_idearium_asks_agents_through_the_pipeline]
    files: [idearium/api/index.js, idearium/repo/build-plan.js, idearium/repo/proof-run.js, idearium/lib/emerge-rung.cjs, cos/pipeline/pipelines/phase-build.pipeline]
    does: >-
      _phaseBuild's stages, read from its 1,082 lines, each a step of cos/pipeline/pipelines/phase-build.pipeline on a route: snapshot, map the
      files, plan, test first, chunks, the Emerge rung, the ladder per chunk, land, prove, verdict, ledger. A stage is first served by Idearium's
      route where its code is today, then moved home one at a time (the strangler pattern), so nothing stops building between. Each stage a
      .chunk (his "use .chunks as steps"); a failed stage holds with its own reason and is retried from there.
    proof: "a fixture phase built by phase-build.pipeline end to end; each stage's output on the run; _phaseBuild reduced to calling the pipeline, then gone"
  IF3_one_gate:
    status: OPEN
    depends_on: [IF2_the_build_as_a_pipeline]
    files: [cos/pipeline/gate.eg, cos/pipeline/types, idearium/api/index.js]
    does: >-
      His "what about reusing the gate? gate.eg if its identicle?": Idearium's checks (DG1 dependencies, DG2 graph, DG3 DAG, the proof, the
      landing rule, the verdict's hold, RAID's gate before a build) become gate types in gate.eg's registry (PC5), its strength set by config per
      layer, never `if level == X`.
    proof: "each of Idearium's checks run as a gate type in a pipeline; the same refusal, the same words"
  IF4_rewind_in_the_compartment:
    status: OPEN
    depends_on: [IF2_the_build_as_a_pipeline]
    files: [idearium/repo/snapshot.js, idearium/repo/snapshot-restore.js, cos/manager, docs/2026-11-01-the-compartment-phasemap.spec]
    does: "the snapshot before a build and the rewind after a failed step are the compartment's (CP5 states, rewind, versions), steps the pipeline calls; Idearium's 650 lines move home"
    proof: "a failed step rewound by the compartment; the same files back as before"
  IF5_one_compartment:
    status: OPEN
    depends_on: [IF0_the_census]
    files: [idearium/api/index.js, cos/manager/supervisor.js]
    does: "his §6: one identity per system (compartment.json's root id); Idearium's _ensureCompartment asks COS instead of keeping its own; runtime, build and data are lenses on it"
    proof: "every layer names the same root id, measured on all 14 systems"
  IF6_the_loop_is_cos:
    status: OPEN
    depends_on: [IF2_the_build_as_a_pipeline]
    files: [idearium/api/index.js]
    does: "_loopTick, _autoRetry, _watchRuns and _startBuildQueuePoller (about 200 lines of timers) become the pipeline engine's own: triggers, holds, retry from a step, the next ready phase; no polling (PR6)"
    proof: "with Idearium's timers off, the next ready phase is built, a failure retried and a run watched, by COS"
  IF7_the_factory_builds_itself:
    status: OPEN
    depends_on: [IF1_idearium_asks_agents_through_the_pipeline, IF2_the_build_as_a_pipeline]
    files: [cos/pipeline/pipelines, idearium/pipelines/his-request.pipeline]
    does: >-
      His "like building itself": the slices of this map (and every OPEN phase that is ready) are requests the factory takes one at a time, built
      on Ollama first; a run that holds is a gap, said where it stopped, never guessed past. The coder fixes what blocks the factory, not the work
      the factory can do.
    proof: "a slice of this map built by the factory on his machine; its run, its proof"
  IF8_the_substrate_under_it:
    status: OPEN
    depends_on: [IF2_the_build_as_a_pipeline]
    files: [docs/substrate.spec, pillar/graph/graph.eg]
    does: "the factory's runs, stages, gates and chunks as the substrate's one graph (GR1's blocks and edges; his §3: process kinds), so the intelligence system reads its friction and gaps (his §7)"
    proof: "a run's stages and gates as blocks and edges, with evidence"

  IF9_everything_raid_does_through_the_pipeline:
    status: OPEN
    depends_on: [IF1_idearium_asks_agents_through_the_pipeline]
    james: '"then anything we can use the pipeline for, like tool forge, copilot automation tasks and jobs, everything that raid does at least." (2026-11-15)'
    files: [lib/tool-forge.js, lib/hat-forge.js, copilot, cortex/core/raid, cos/pipeline/pipelines]
    does: >-
      After the pipeline runs fully, every kind of work Nexus does runs as a pipeline, each its own tool for its own job: the tool forge (a tool
      made, tested, registered), copilot's automation tasks and jobs, and at least everything RAID does (contracts, routing, gates, intake, the
      worker and officiator's work). One census first: each kind of work, where it runs today, and its pipeline.
    proof: "per kind: a run of its pipeline in COS doing the work it did before, the same result"
  IF10_the_map_of_nexus_on_the_canvas:
    status: OPEN
    depends_on: [IF2_the_build_as_a_pipeline, PC4_the_box_kinds_on_the_canvas]
    james: '"i want a visual map with each system on it using the compartment, each with the wires to each system visually, all the pipelines step by step, and visual animation of actual data moving from system to system like a flight recorder. the canvas, look at the canvas." (2026-11-15)'
    files: [cos/ui/canvas, cos/manager/server.js, lib/flight-data.js]
    does: >-
      On Nexus's canvas (cos/ui/canvas, imported 2026-11-15): each system a compartment box; the wires between systems as they really are (their
      routes, from each system's own map, SW1); every pipeline step by step; and the actual data moving along the wires, animated from what was
      recorded (each call between systems, COS's stream and the runs' files), replayable like a flight recorder (lib/flight-data.js, FR6). Nothing
      drawn that did not happen. Shown to him as a preview first (PC4's prerequisite).
    proof: "a recorded run replayed on the canvas: each call drawn on its wire in order, with what it carried and how long it took"
  IF11_agents_deployed_per_system_by_hat:
    status: OPEN
    depends_on: [IF1_idearium_asks_agents_through_the_pipeline, IF10_the_map_of_nexus_on_the_canvas]
    james: '"having agents deployable per system using the hat, like a pin or location marker on a map showing where each agent is by hat?" (2026-11-15)'
    files: [lib/hat-forge.js, lib/intent-hat-router.js, cos/manager, cos/ui/canvas]
    does: >-
      An agent is deployed to a system by its hat (hat-forge's hats; OC4a's deployments in COS), and on the canvas map it is a pin on that
      system's compartment, named by its hat, moving as it moves, showing what it is doing now (its current pipeline step).
    proof: "two agents deployed by hat to two systems: two pins in the right places; one moved: its pin moves"
  IF12_nexus_builds_itself_autonomously:
    status: OPEN
    depends_on: [IF7_the_factory_builds_itself, IF9_everything_raid_does_through_the_pipeline, IF11_agents_deployed_per_system_by_hat]
    james: '"we need the pipeline building nexus, for all of this, different tools for different jobs, to build step by step, so we can get this building autonomously" (2026-11-15)'
    files: [cos/pipeline/pipelines]
    does: "the factory takes the open phases of every map, the ready ones first, each with the tool for its job, deployed agents by hat doing the work, step by step, on its own; what holds is a gap said where it stopped"
    proof: "a day of the factory on his machine: phases built, each with its run and proof, the holds listed"
  # ── EXPANDED 2026-11-18 (his) — Ollama writes the code; Nexus does the planning and the review, deterministically ──
  # James, 2026-11-18: "this needs to use deepseek before guardian. this needs to use ollama. could have it use the console to run tests? like
  # if it executes. the pipeline could have a visual debugger." · "pipeline and emerge, once nexus can use the pipeline to code, js is fine if it
  # cant use emerge. but ollama should be enforced. all of nexus is made to improve small llm capability, and outsource complexity and memory to
  # nexus. its cybernetics, for me and for the agents. its like a second brain with me the mind or copilot the mind." · asked (a local DeepSeek
  # in Ollama before Guardian; Ollama writes all code, agents only plan and review; Ollama enforcement before Clear Glass's accounts): "yes.
  # though nexus should be able to do a lot of the heavy lifting for planning review. the intelligence system, cos test envirement, all the agent
  # tools, emerge to make nexus code with a language it can understand and makes it architecturally consistent, using cie-eg, idearium has so much
  # of this. outside of idearium. schemas, specs, templates, nodes, contracts, component store, and everything else, to make coding more
  # deterministic. like all of this needs to be mapped. nexus makes systems using deterministic code and resuable primitives. its how i've
  # learned to navigate the world."
  # census_2026_11_18 (read from the tree, what each phase below stands on; §8.6):
  #   plan     lib/phase-plan.js (493: the plan's files, exports, signatures, steps; parsePlan checks it) · idearium/spec-engine/phase-specs.cjs
  #            and its 18 templates (.phase, .graph per phase) · lib/component-store.js (347: decomposed components, deps resolved) ·
  #            lib/code-intel (cards, decls, search) · lib/context-atlas.js (specs, notes, nodes) · lib/phase-graph.js, phase-dag.js,
  #            phase-map-auto.js (the files a phase changes, who uses them) · 206 schema files in 11 systems' schemas/ · emerge's
  #            cie-eg.spec (1,735 lines) and lang/cie (10)
  #   code     the ladder (lib/pipeline-routing.js: ollama 3b > ollama deepseek-coder-v2:16b > agents, Claude last) · Emerge-first for a new
  #            file (routing.emerge_first, EMB1) · lib/extract-code.js · lib/semantic-variant.js
  #   review   lib/verify-first.js (an existing file checked before it is rewritten) · lib/test-first.js (a test before the code) ·
  #            checkChunk (exports per plan) · node --check · emerge/emerge/lang/checker.js (575) · lib/phase-close.js + lib/test-map.js (done by
  #            evidence) · cortex/core/raid/contract-gates.js + contract-adapters.js (bricks, gates, retries) · intelligence's sigma/delta/cfr
  #            (deviation and gaps) · lib/agent-record.js (what each agent has done, per kind of file)
  #   run      cos/testenv (detect, environment, run-target: what a repo needs to be tested, any repo) · cos/playground · COS's console
  #   tools    lib/agent-tools (122 files: every agent's tools) · idearium/cli/route-commands.js (2,092: the one command table)
  #   memory   lib/node-export.js (605, the node envelope), lib/node-registry.js, Versionium, Cortex's ledgers
  # Already existing phases these stand on (phase-ledger covers, 2026-11-18): GW24 (the gate holds, the agent gets a projection), PC1-PC3 of
  # the pieces map, SL2 (done by evidence), DBG4, IN7, AD2, HL10. Each phase below expands them in the build's own path; none rewrites them.
  IF13_ollama_writes_the_code:
    status: OPEN
    depends_on: [IH3_routers_read_the_chain]
    james: '"ollama should be enforced" · "this needs to use deepseek before guardian" (2026-11-18), and "yes" to: only Ollama writes files'
    files: [lib/pipeline-routing.js, idearium/api/index.js, idearium/pipelines/idearium-build.pipeline]
    does: >-
      Only the Ollama rungs (3b, then deepseek-coder-v2:16b) write a file. Browser agents (through Guardian) are planners and reviewers, never
      coders: they may propose a plan, a test or a review, not a file. A step Ollama cannot pass is decomposed (smaller step, one file, one
      export: T11), then retried on Ollama; still failing, the run holds for him with the gap said. A routing setting, his to turn off.
    proof: "a phase built end to end where every written file's provider is ollama:*; a failing step shows decomposition, then a hold — never a browser agent's file"
  IF14_nexus_plans_deterministically:
    status: OPEN
    depends_on: [IF13_ollama_writes_the_code, IN7_every_phase_and_spec_on_the_spine]
    james: '"nexus should be able to do a lot of the heavy lifting for planning" (2026-11-18)'
    files: [lib/phase-plan.js, idearium/spec-engine/phase-specs.cjs, lib/component-store.js, lib/code-intel/index.js, lib/context-atlas.js, lib/phase-map-auto.js]
    does: >-
      The plan is drawn by Nexus first, from what it already holds: the phase's spec module (exports, signatures, behavioural contracts), its
      .phase and .graph, the component store, code-intel's cards, the schemas and templates. A model is asked only for what that cannot fill,
      and its answer is checked by parsePlan. Each brief to Ollama is one file, its exact exports and imports, and the existing code it touches.
    proof: "for a phase with a spec module, the plan comes back with no model call; for one without, the model's share is counted (calls and tokens per phase, AG1)"
  IF15_nexus_reviews_deterministically:
    status: OPEN
    depends_on: [IF13_ollama_writes_the_code, SL2_done_by_evidence, GW24_the_gate_holds_the_agent_gets_a_projection]
    james: '"nexus should be able to do a lot of the heavy lifting for planning review" (2026-11-18); his rule of 2026-10-13: "A reasoning agent only plans, and reviews or repairs only after a cheap check has failed."'
    files: [lib/verify-first.js, lib/test-first.js, lib/phase-close.js, lib/test-map.js, cortex/core/raid/contract-gates.js, emerge/emerge/lang/checker.js]
    does: >-
      Every file Ollama writes passes Nexus's checks in order, cheapest first: syntax (node --check, Emerge's checker for .eg), the plan's
      exports (checkChunk), verify-first against the existing file, the phase's own test (test-first, test-map linked), the contract's gate,
      the intelligence system's deviation (sigma) and gap (delta) readings. A browser agent reviews only when a check failed and the failure
      is not mechanical; its review is a note, never a file.
    proof: "a run's rows show each check per file with its verdict; agent reviews counted and each tied to a failed check"
  IF16_tests_run_in_the_test_environment:
    status: OPEN
    depends_on: [IF15_nexus_reviews_deterministically]
    james: '"could have it use the console to run tests? like if it executes." (2026-11-18)'
    files: [cos/testenv/run-target.js, cos/testenv/detect.js, cos/automation/steps.js, idearium/pipelines/idearium-build.pipeline]
    does: >-
      A pipeline step runs the phase's tests where COS runs things (cos/testenv: detect what the repo needs, run the target), the output
      streamed to the step and kept; the step's gate is the tests passing. It is the evidence step's source, not a second opinion beside it.
    proof: "a build run with a test step whose output is the test file's own lines, passing and failing as the code does"
  IF17_emerge_first_js_when_it_cannot:
    status: OPEN
    depends_on: [IF13_ollama_writes_the_code]
    james: '"js is fine if it cant use emerge" (2026-11-18); "emerge to make nexus code with a language it can understand and makes it architecturally consistent, using cie-eg"'
    files: [lib/pipeline-routing.js, idearium/api/index.js, emerge/emerge/lang/checker.js]
    does: >-
      A new file is tried in Emerge first (CIE-EG, compiler-checked: EMB1), by Ollama; when Emerge cannot express it (a gap said, a phase for
      the gap), the same step writes JavaScript. An existing JavaScript file stays JavaScript unless a phase moves it. Every run says which.
    proof: "a run's rows name the language of each file and, for each JS file of a new phase, the Emerge gap that sent it to JS"
  IF18_the_visual_debugger:
    status: OPEN
    depends_on: [IF16_tests_run_in_the_test_environment, IF10_the_map_of_nexus_on_the_canvas, PC8_operate_a_pipeline]
    james: '"the pipeline could have a visual debugger." (2026-11-18) · "the work surface needs to be used for the outputs, like how idearium streams the dom mutator" (2026-11-17)'
    files: [cos/ui/automation/engine.js, cos/ui/canvas]
    does: >-
      On the canvas, a running step shows what it is doing live (its output streamed into Outputs, the work surface), each check of IF15 with
      its verdict, the tests' output of IF16, and its attempts as branches (the pinned development tree, after Emerge). A step can be
      paused, stepped and retried from there.
    proof: "a live run watched on the canvas: each step's output appears while it runs; a failed check opens on its own line"
  # ── WRITTEN 2026-11-18 (his readings confirmed) — rate every primitive; skip and hold as gaps; fill them like a torrent ──
  # James, 2026-11-18, to the readings (step = one primitive; stubs held as gaps with tension; load × (1 − confidence) first; confidence as the
  # weakest link and as the product, both): "Yeah. We need a structural metric for rating primitives. Yes but we can skip steps and mark them as
  # gaps rated with tension. And have system focus on them after like pieces of a torrent, filling piece by piece." · asked weakest link,
  # product, or both: both, shown apart (the coder's recommendation, his yes).
  IF19_a_structural_rating_for_every_primitive:
    status: OPEN
    depends_on: [IF15_nexus_reviews_deterministically]
    james: '"We need a structural metric for rating primitives." (2026-11-18)'
    files: [pillar/contracts/contracts.eg, pillar/spec/pillar.spec, lib/component-store.js, lib/phase-graph.js, lib/agent-record.js]
    does: >-
      Every primitive (one function with its contract) carries a rating Nexus computes, never a model: load (how many primitives and
      components rest on it: fan-in from the component store and the phase graphs), verification (none · compiles · its own test passes ·
      tests reaching it pass · attacked and held), confidence two ways shown apart — the weakest link (no higher than its least-verified
      load-bearing dependency) and the compounded product along its chain — and tension = load × (1 − confidence). Kept on the primitive's
      contract in Pillar (Emerge), read by the build, the canvas and the intelligence system. The metrics per system and per agent come from
      the same records (agent-record's outcomes, the run rows).
    proof: "a fixture graph of primitives gives each its load, verification, both confidences and tension, by hand-checkable numbers; the heaviest least-verified one ranks first"
  IF20_gaps_filled_like_a_torrent:
    status: OPEN
    depends_on: [IF19_a_structural_rating_for_every_primitive, IF13_ollama_writes_the_code]
    james: '"we can skip steps and mark them as gaps rated with tension. And have system focus on them after like pieces of a torrent, filling piece by piece." (2026-11-18)'
    files: [idearium/api/index.js, cortex/core/raid/contract-gates.js, idearium/pipelines/idearium-build.pipeline]
    does: >-
      A step that cannot pass now (Ollama failed after its decomposition, no test yet, a dependency missing) is not forced and not faked: it
      is skipped and recorded as a gap — Emerge's gap with its pressure = the primitive's tension (IF19) — and the run goes on with the
      steps that can pass. A stub may stand in for it, marked as the gap, never counted as landed (GQ1's placeholder, 2026-11-18). Afterwards
      Nexus fills the open gaps piece by piece, highest tension first (the torrent's rarest piece first), each its own small run; a phase is
      done when its last gap closes. The open gaps and their tension are what the canvas and the intelligence system show as open loops.
    proof: "a phase with one primitive Ollama cannot pass: the run ends with the rest landed and one gap at its tension; a later fill run closes it; the phase closes only then"
  IF21_attack_the_most_load_bearing_first:
    status: OPEN
    depends_on: [IF19_a_structural_rating_for_every_primitive]
    james: '"Like attacking the most load bearing pillar first." · "We can use bidirectional causal chaining and cross domain verification as ways to test also." (2026-11-18)'
    files: [copilot/adversarial.js, lib/meta/adversary-suite.js, intelligence/cfr/graph.js]
    does: >-
      The adversarial system attacks code, not only Copilot's reasoning: its attacks go to the primitive with the highest tension first
      (IF19). Attacks: known-bad inputs for the contract, bidirectional causal chaining (the code from the spec and the spec from the code
      must agree: his IF-05), cross-domain verification (the same contract met in another domain's terms). A primitive that holds rises in
      verification; one that breaks opens a gap (IF20). The intelligence system reads the results as sigma (deviation) and delta (gap).
    proof: "the heaviest primitive is attacked first; a planted contract break is caught and opens a gap with its tension"
order_2026_11_18_his: >-
  His, 2026-11-18: Ollama enforcement first (before Clear Glass's one cookie jar, AC2). So: IF13 → IF15 → IF14 → IF16 → IF17 → IF18.
  Then the same night: IF19 (the rating) before IF20 (the torrent) and IF21 (the attack), both standing on it.
order_2026_11_15_his: >-
  His order of 2026-11-15: "pipeline needs to run fully. then anything we can use the pipeline for … like i want a visual map …" So: first the
  pipeline runs fully, end to end (idearium-build and his-request, the real routes, agents on the Ollama ladder); then IF1 and IF9 (everything
  through the pipeline); IF10 and IF11 (the map, the flight recorder, the pins) shown to him first; IF12 last, standing on all of them.

order: >-
  IF0 → IF1 (agents through the pipeline: his first words, the smallest seam, and every later stage reuses it) → IF2 (the build, stage by
  stage) → IF3 and IF4 beside each other → IF6 → IF5 → IF7 from the first stage that can be built by the factory; IF8 with GR1.
# ── 2026-11-18 — first Ollama-only run (IF13 slice a, a setting): what it proved, and the two gaps it found for IF15 ──
# routing.escalation set to [ollama 3b, ollama deepseek-coder-v2:16b] (his "what ever gets nexus coding … without guardian preferably").
# Run 40b9a698, GQ1_quality_stream: ready → graph met; build "landed clean", 0 agent calls, 131 s. The contract: "written in Emerge, checked
# by its compiler and passed its expectation on try 1", agent emerge:ollama:…3b, "landed 13 file(s)" (components/nexus-core.lib.quality-stream:
# quality-stream.eg 8 lines, its JS wrapper 4). No Guardian, no browser agent: Ollama wrote Emerge, Emerge's compiler checked it.
# But the code is a PLACEHOLDER ("// Placeholder for quality check logic" · "return true; // Example: always true"), nothing of GQ1's
# does (one gate per check kind onto a SISO stream, check.result with provenance). Why it passed: with no planner (no browser agent on the
# ladder) test-first never ran, so GQ1's proof test (tests/gq1-quality-stream.test.js) was never written, and a generic expectation passed
# a stub. Evidence then timed out (Idearium busy) and the run held: GQ1 is NOT closed. Gaps, both IF15's (Nexus reviews):
#   (1) test-first runs without a planner: Ollama (deepseek 16b) writes the phase's proof test before the code;
#   (2) placeholder refusal: a brick whose code says placeholder / TODO / "always true" / an empty body is refused, cheapest check first.
# Recorded as orchestration and route proved for Ollama + Emerge with no Guardian; implementation NOT proved (his review of 2026-11-18).
# ── 2026-11-18 — his: the smallest irreducible step; stubs as open loops with tension; the most load-bearing primitive attacked first ──
# James, 2026-11-18 (after GQ1 landed a placeholder): "Should we migrate the component store to pillar? I want each step decomposed. Each file
# is its own step maybe? Or each primitive? The smallest irreducible size per step. Maybe stubs at first, which remain gaps/open loops causing
# tension. We have the adversarial system, confidence score. I feel we need metrics and statistics for performance, for the each of the
# systems, each agent, etc. make the most load bearing pillar create more tension? Like attacking the most load bearing pillar first. Using
# the most load bearing primitives from the dependencies as the highest level of confidence by the least verified load bearing primitive like
# a slope and look at the intelligence system and compounding. We can use bidirectional causal chaining and cross domain verification as ways
# to test also."
# Read the same night: pillar/pillar.eg is "the one kernel of primitives: each primitive's contract, defined once" (his EAS_D8: "it's supposed
# to be the component registry"); lib/component-store.js resolves components' dependencies but records no confidence; copilot/adversarial.js
# attacks Copilot's reasoning, not code; nothing ranks a component by how much rests on it. Emerge already has `gap … pressure …`.
# The coder's readings, to confirm before any phase is written (§0.0 do not guess):
#   - step = one primitive (one function and its contract and test), the irreducible unit; a file is a composition step over primitives.
#   - a stub is allowed but never "landed": it is a gap (Emerge's gap, pressure = how much rests on it) that stays open and raises tension
#     until its test passes — today's GQ1 placeholder, counted as done, is exactly what this forbids.
#   - load = fan-in from the dependency graph (component store + phase-graph's "who uses it"); work and adversarial attack go to
#     load × (1 − confidence), the heaviest, least-proven primitive first.
#   - confidence of a composite ≤ its least-verified load-bearing dependency (the slope); compounding = the product along a chain (the
#     intelligence system's sigma/delta and CFR coherence as inputs). Which of min and product is his to choose (or both, said).
#   - tests also from bidirectional causal chaining (spec → code and code → spec agree; his IF-05) and cross-domain verification.
#   - the component store's primitives move into Pillar's contracts (his "one kernel"); system components stay in each system's own
#     registry (§5.16). Pillar is Emerge: after Emerge is done (his order), or as the first Emerge-native piece.

# ── ADDENDUM 2026-11-18 — his next asks, mapped onto the phases that own them (mapped only; nothing built) ──
# James, 2026-11-18 (1): "The tree can be shown in the pipeline canvas. Dependancies, and branching to each components, like the Provence. Like a
# family tree for each contract? Imagine that. Show the end state at the end. Then the beginning, what if each gate was the raid compartment for
# the contract, then each disicion is a branch, like showing the entire lineage or tree. Like I want projects to be able to have progress. Like
# chunks are the progress bar for each and it persists. Also needs to check for files already created in the pipeline. Can use liminal space
# reader. I feel like the intelligence system needs commands per module and we need emerge, the pipeline, and oLlama working. Then we can
# autonomously build nexus. Like hook the autonomous mode that copilot has into the build loops and modes. No matter what I say. Pipeline,
# emerge, and ollama. Gates just need to be much smarter."
# James, 2026-11-18 (2): "can you make that an option in cos ui. with the raid options and model settings. anything that can help get nexus
# coding. once emerge, ollama and the pipeline can build. each gate only holds the relevant context, for the next step, plus maybe the previous
# chunk/brick/piece/step then the agent can query and find context, sythnesize using the primitives as a boundary or constraint field, and then
# each block a chunk, dynamically decomposed if needed, like even each word in relation to the next, or each line feeding into the next gate and
# injected into the agent using a .inject node. also the option to load clearglass ui on boot. would that save memory? have a open button in the
# near the start button for the compartment. then can you see if the system can identify any bottlenecks or memory leaks, polling that can be
# switched for heartbeat emission, decoupling the systems so they don't need to run with the rest. what about changing the heap or priority
# based on the request or contract. like using the metrics to determine how much resources, tokens, memory, CPU utilization or time it will
# take. then dynamically load balance resources based on the metrics, and past runs. like establishing a baseline overtime, and the complexity
# of requests. a ledger. We need emerge and the pipeline, and with ollama. prioritize gemini since it isn;t against the terms to use browser
# automation, and we can inject way more context just need to inject intent, the test, and conditions into the chat for each step. like
# dynamic gating and decomposition per gate, and agent, like have that retry logic escalation"
#
# His order, binding over everything below: the pipeline, Emerge and Ollama building; gates much smarter. The rest waits on that unless he says.
#
# Where each ask lands (the coder's reading; phases expand, none written again where one covers it):
#   A. Smarter gates (his "gates just need to be much smarter"): each gate holds only the context for its next step plus the previous chunk;
#      the agent queries for more; the primitives are the constraint field; a block that is too big decomposes further (down to a line feeding
#      the next gate); what goes to the agent is a .inject node; per gate: intent, its test, its conditions, retry and escalation per agent.
#      -> IF3_one_gate (expanded) and IF13_ollama_writes_the_code (the injected context is what makes a small model able to write it).
#   B. Gemini first among the browser agents (his reading of the providers' terms, his call): RAID's routing chain and escalation.
#      -> PC16_raid_routes_every_interaction (a routing value, set in RAID; no code).
#   C. COS UI: the RAID routing options and the model settings on one page, with anything that helps Nexus code.
#      -> PC16 (its screen; RAID already serves GET/POST /api/raid/routing) and PC17/PC18 (the model fits, COS runs the model server).
#   D. Clear Glass on boot as an option, and an Open button beside Start for a compartment. Whether it saves memory is to be measured, not
#      claimed. -> no phase covers it: proposed CN-BOOT in the COS console map (to write after his order allows).
#   E. Bottlenecks and memory leaks found by the system; polling replaced by heartbeat; systems decoupled so each runs alone.
#      -> PR6_cos_listens_never_polls (announce-pulse-repair map; slice a built 2026-11-13) and PR4_deviation_raises_the_bpm; CP6 for the leaks.
#   F. Heap and priority per request or contract, from metrics (tokens, memory, CPU, time) and past runs; load balancing on a baseline that
#      grows; a ledger. -> CP6a_caps_priority_accounting and CP6f_raid_balances_load (the compartment map).
#   G. The canvas: each contract's lineage as a family tree (end state, then the beginning), each gate a RAID compartment, each decision a
#      branch, provenance down to each component; chunks as a project's progress bar that persists. -> IF10_the_map_of_nexus_on_the_canvas and
#      IF18_the_visual_debugger.
#   H. The pipeline checks for files already created (the liminal space reader). -> IF14_nexus_plans_deterministically (verify-first exists:
#      lib/verify-first.js; the reader to be found before it is named).
#   I. Intelligence: commands per module. -> no phase covers it: proposed in Intelligence's own map (its registry, §5.16).
#   J. Copilot's autonomous mode hooked into the build loops and modes. -> IF12_nexus_builds_itself_autonomously.
#
# To confirm with him (do not guess):
#   1. "Show the end state at the end. Then the beginning": the tree read from the finished contract back to its start (the goal first), or
#      both ends pinned with the work filling between?
#   2. "each gate was the raid compartment for the contract": one compartment per gate, or one per contract with its gates inside?
#
# Facts that bear on it, from 2026-11-17/18 on his machine: N1 went through the whole pipeline (Gemini planned, Ollama's 3b coded, closed on
# its test); GQ1 landed and waits for his verdict; deepseek-coder-v2:16b loads (9.6 GB, ~20 tokens/s) but leaves 3-5% RAM free, under COS's
# floor, so COS refused to start ollama-bridge; C: was full (0 GB) and the builds after it were cut by COS restarts.

# ── ADDENDUM 2026-11-18 (later) — his answer to reading 1; his question on what comes first ──
# James, 2026-11-18: "i mean the the request to raid or the contract is the beginning of the tree, or the .spec file and how it expands overtime,
# each disccion and direction branching and versioned, idearium can also use it for versioning and branching versions. like the pipeline is
# unbelievably high leverage." · "what ever gets us coding faster. smarter gates probably, that should help reduce load to the llm.
# intelligence, failure mode and fault detection, diagnostic system, and copilot or agent tools. what do you think?"
# Decided (his): the tree's root is the request to RAID, the contract or the .spec; it grows over time; each decision and direction is a
# versioned branch; Idearium can use the same tree for its versions and branches (IF10, IF18; Framework thread T13). Reading 2 (one RAID
# compartment per gate, or one per contract with its gates inside) is still open.
# First to build (his "smarter gates probably"; the coder's recommendation, said as the coder's): IF3 smarter gates, fed by what Nexus already
# knows, before any new system work: the failure-mode record (Cortex), the diagnostic and intelligence systems, read by the gate, so the
# model is asked less. Copilot's and the agents' tools after.

# ── ADDENDUM 2026-11-18 — IF3 expanded: smarter gates, slice a (mapped before code) ──
# James, 2026-11-18, asked what comes first: "Yes, gates first" (after "smarter gates probably, that should help reduce load to the llm").
# IF3_one_gate expanded_2026_11_18:
#   slice_a_the_gate_asks_before_the_model:
#     does: >-
#       A step that would ask a model is preceded by a gate that asks Nexus first, so no build starts into a machine that cannot carry it.
#       (1) COS's usage reading gains the disk: free space of the system drive (where the temp folder is) and of the Nexus folder's drive
#       (cos/manager/usage.js, host.disk; node's statfs, no process). (2) gate.eg gains a check kind, number: a value read by its path from an
#       ask's answer or the step's output, held to atLeast / atMost; a value that is not there is said. (3) a shipped gate type, ready
#       (cos/pipeline/types/ready.gatetype): asks COS for its usage and holds the run with the reason when free memory or free disk is under
#       the step's minimum (with: minFreeMemPct, minDiskMB); the same reason twice is a gap. (4) idearium-build.pipeline: a step "room" before
#       build, gated by ready.
#     why: >-
#       Read from his runs of 2026-11-17/18, not guessed: C: at 0 GB stopped every command and COS restarted under it; DeepSeek loaded left
#       3-5% RAM and COS refused ollama-bridge; RQ0 ran with no local coder; each of these spent agent calls before failing. A gate that asks
#       first holds the run with the reason instead.
#     files: [cos/manager/usage.js, cos/pipeline/gate.eg, cos/pipeline/types/ready.gatetype, cos/pipeline/test/gate.test.eg,
#             idearium/pipelines/idearium-build.pipeline]
#     depends_on: [PC5_programmable_gate_types]
#     proof: "gate.test.eg: number holds and fails by path, on an answer and on the output, and says a missing value; the ready type holds on low disk and opens with room; a build run on his machine shows the room step's verdict"
#     axioms: §8.6 (gate.eg's asks and checks reused; one check kind added, not a new system), §1.2 (a hold says its reason), §5.10 (COS's
#       own route, no new crossing), §17.13 (the decision in Emerge; the disk reading is COS's existing JavaScript, changed in place).
#   slice_b_the_gate_injects_only_the_slice: OPEN (mapped 2026-11-18 above: intent, test, conditions, the previous chunk, one .inject)
#   slice_c_decompose_before_climbing: OPEN (T11; PC8 expanded_2026_11_14)
#   slice_d_the_gate_reads_the_failure_record: OPEN (Cortex /api/failure-modes for the step's class before it is asked again)

# ── ADDENDUM 2026-11-18 (later) — the seed of the lineage tree (his) ──
# James, 2026-11-18: "also ven the idea being logged becomes a seed for the entire lineage tree. like in idearium or from an input"
# Decided (his): the tree begins earlier than the contract. The idea as it is logged (an Idearium idea, or any input: his words in the Console,
# a request, a note) is the seed; the request to RAID, the contract and the .spec grow from it; every decision and direction after is a
# versioned branch (IF10, IF18; thread T13). Reading 2 (one RAID compartment per gate, or per contract) is still open.
# ── 2026-11-18 — his, recorded (not yet phases): the contract's family tree on the canvas; progress that persists; Nexus building itself ──
# James, 2026-11-18: "The tree can be shown in the pipeline canvas. Dependancies, and branching to each components, like the Provence. Like a
# family tree for each contract? Imagine that. Show the end state at the end. Then the beginning, what if each gate was the raid compartment for
# the contract, then each disicion is a branch, like showing the entire lineage or tree. Like I want projects to be able to have progress. Like
# chunks are the progress bar for each and it persists. Also needs to check for files already created in the pipeline. Can use liminal space
# reader. I feel like the intelligence system needs commands per module and we need emerge, the pipeline, and oLlama working. Then we can
# autonomously build nexus. Like hook the autonomous mode that copilot has into the build loops and modes." · "No matter what I say. Pipeline,
# emerge, and ollama. Gates just need to be much smarter."
# Where each lands (the coder's reading, to confirm when it is reached; his order stands: pipeline, Emerge, Ollama; gates smarter first):
#   - the contract's family tree (end state at the end, the beginning at the start, each gate a RAID compartment, each decision a branch,
#     the whole lineage, provenance): IF18 (the visual debugger) with the pinned development tree (CIE map, after Emerge) and IF10.
#   - progress that persists: a project's chunks are its progress bar (done / gap / open, IF20's gaps with their tension), kept on disk.
#   - the pipeline checks for files already created: verify-first runs per brick (lib/verify-first.js); a pipeline-level step before the
#     build (IF15/IF16), with the liminal space reader (intelligence/liminal-space) as one of its sources.
#   - the intelligence system's commands per module: rows in its own command table (intelligence/commands), each module reachable.
#   - Copilot's autonomous mode (copilot/lib/autonomy-router.js) hooked into the build loops and modes: IF12, once the pipeline, Emerge and
#     Ollama work.
# ── 2026-11-18 — his: RAID is the interface; every gate a RAID compartment with rewind; Copilot thinks (recorded, not built) ──
# James, 2026-11-18: "we also need to use raid for all decisions, each gate uses raid? raid has the rewind engine per gate like idearium, like
# snapshot each gate, work surface which would be what the agents are generating or writing, or from the dom mutator in clearglass, idearium
# already does this. and work area is the compartment that raid created from the request initially, for all of the context, files, and anything
# else needed for the contract/end-state to be fulfilled. reflection engine, raid has so much to it. we need raid to be the interface. uses
# copilot to think, which copilot is a agent agnostic hat." · "i don't want any js created." · "that needs to be .eg using cie-eg."
# Lands on IF3 (one gate), IF4 (rewind in the compartment), IF9 (everything RAID does through the pipeline); readings to confirm when reached.
# Done the same turn, as data only (no JS, his rule): lib/step-gates/code.write.step_gate gained "placeholder for ", "placeholder logic",
# "example: always true", "stub until" — the existing no_placeholder check now refuses GQ1's stub ("a placeholder, not the work — line 3").
# Tried and reverted (his "i don't want any js created"): a JS placeholderIn(), an Ollama-only planMode branch, a test-writer start line.

handoff_2026_11_18: >-
  For the next session. His rules now: pipeline, Emerge and Ollama, nothing else ("No matter what I say"); no JS created (new logic in .eg via
  CIE-EG, or in gate/node data); deterministic first, then Ollama, Claude last ("use ollama for anything that can save you tokens"); short.
  State (main 0.60.566): Claude replies end from their settled .response; Claude is last on every ladder; Gemini's backdrop cleared; N1 closed on
  its own test (route proved, no new code); GQ1 is OPEN — Ollama wrote an Emerge placeholder that landed; the code.write gate now refuses it.
  Live settings on his PC (not in git): Idearium routing.escalation = [ollama 3b, ollama deepseek-coder-v2:16b] (Ollama only, no Guardian);
  Guardian's Claude account chain (Account 2, then Default); Ollama has the 3b and deepseek-coder-v2:16b (8.3 GB). 16 GB RAM, GTX 1650 4 GB,
  C: SSD ~85 GB free.
  Next, in order: (1) GQ1's gap — with no reasoning agent on the ladder, planMode says "built as before", so test-first never runs: make Nexus
  plan it (derivePlan exists) and Ollama write the test, written in .eg or as data, not JS (his rule; the JS version was reverted). (2) Ollama
  tuned for this machine (flash attention, q8_0 KV cache, one model loaded, num_ctx per job, mmap from the SSD; a MoE coder that fits) —
  researched, applied, measured on a rerun of GQ1. (3) IF13 → IF15 → IF14 … per order_2026_11_18_his; IF19–21 after.

# ── ADDENDUM 2026-11-18 — his method, end state first; a framework node for each step's method (his; supersedes the coder's toolbox reading) ──
# James, 2026-11-18: "frame it or reframe it. its for stategy, problem solving, alchemy, its end state first reasoning and condition mapping using
# bidirectional reasoning or causal chaining or manipulation, or emergence you could say. end state is the goal is the scope, conditions are what it
# takes to get their and whats a stopping point for good enough, so you dont iterate endlessly, if you can't innovate the solution, innovate the
# method, create new methods to decompose. gap or problem or request or input becomes the end-state. decompose the problem using the canvas and
# branching into chunks/bricks. then any chunks that get broken down again, each represented on the canvas, like a skill tree or fibinachi sequence.
# combine the overlap for the highest leverage synthesis, or synthesize gaps for high leverage gaps, when chunks are skipped, synthesize the novel or
# valuable pieces and discard what's not load bearing, create a dag from each piece thats left, first principles or a constraint field, down to the
# primitive or structure, anything that changes the shape of the structure is load bearing, that establishes the core or foundation, the
# deterministic foundation, or the pillars. adversarial agent and failure modes. like i want to be able to program all of this myself each step like
# instrcutions, or something similar. so maybe each step can have a framework or pipeline node for the method? it is immensely good for gaps or
# ambiguity. finding leverage in the weaknesses, like perfectionism can be good for quality control and constructive feedback. for instance.
# reframing. like for bugs. like i want to be able to create frameworks using the pipeline. program copilot,"
# His method, as the steps it names (the coder's cut; his words above are the source):
#   1 end state: the gap, problem, request or input becomes the end state (the goal and the scope)
#   2 conditions: what it takes to get there (bidirectional / causal chaining), and the stopping point for good enough
#   3 decompose on the canvas: branch into chunks/bricks; a chunk broken down again is drawn under it (a skill tree)
#   4 synthesize: combine the overlap; synthesize gaps; keep the novel or valuable from skipped chunks; discard what is not load bearing
#   5 a DAG of what is left, down to the primitives (a constraint field); what changes the structure's shape is load bearing: the pillars
#   6 adversarial agent and failure modes (weaknesses as leverage: perfectionism as quality control)
#   7 if the solution cannot be innovated, innovate the method: a new way to decompose
# Built already: a pipeline step can be a framework (cos/pipeline/framework.eg; PC slice b, 0.60.470) or a sub-pipeline (step type pipeline).
# Open: (a) his method written as the first .framework, each step a node he can edit; (b) any step of any pipeline may name a method (a framework
# or pipeline node); (c) frameworks made and edited on the canvas by him, and Copilot programmed the same way.

# ── ADDENDUM 2026-11-18 (later) — every failure and every decision through RAID; each gate (his) ──
# James, 2026-11-18: "anytime something fails or needs a decision, should use raid. each gate?"
# What is there (read): COS books each pipeline request as a RAID contract and RAID's verdict says met or not (cos/pipeline/index.js book);
# Idearium's build gates are RAID contract gates (cortex/core/raid/contract-gates.js); RAID decides a local model's fit (0.60.574, OL4a).
# What is not: a gate's own outcome (closed or gap → retry, escalate, split, hold) is decided by its gate type alone (gate.eg's on:), RAID never asked.
# The coder's reading, to build next as IF3 slice e: a gate that closes or finds a gap asks RAID what now (POST /api/raid/route/next with the gate's
# why, its history and the run), RAID answers from its policy (retry on the same rung, escalate, split, hold for him) and says the decision aloud;
# the gate type's own on: stays the answer when RAID does not answer, said.
