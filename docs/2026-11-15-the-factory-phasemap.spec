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
order_2026_11_15_his: >-
  His order of 2026-11-15: "pipeline needs to run fully. then anything we can use the pipeline for … like i want a visual map …" So: first the
  pipeline runs fully, end to end (idearium-build and his-request, the real routes, agents on the Ollama ladder); then IF1 and IF9 (everything
  through the pipeline); IF10 and IF11 (the map, the flight recorder, the pins) shown to him first; IF12 last, standing on all of them.

order: >-
  IF0 → IF1 (agents through the pipeline: his first words, the smallest seam, and every later stage reuses it) → IF2 (the build, stage by
  stage) → IF3 and IF4 beside each other → IF6 → IF5 → IF7 from the first stage that can be built by the factory; IF8 with GR1.
