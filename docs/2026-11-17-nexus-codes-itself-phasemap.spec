# docs/2026-11-17-nexus-codes-itself-phasemap.spec
# The dependency graph from today to the end state: Nexus coding itself through the pipeline, toward a dynamic end state. MAPPED 2026-11-17.
# It joins what is already mapped (the factory IF0–IF12, the request lifecycle L0–L14, Guardian's job store GD5, the pipeline PC8/PC16/PC17,
# Emerge EQ4 and CIE) into one DAG. The nodes are the existing phases; the two phases written here (NX1, NX_END) carry the edges that were
# missing between them. lib/phase-dag.js checks it with every other map. The whole system, in his words: docs/atlases/nexus-atlas.md (top).

origin:
  date: 2026-11-17
  james: >-
    "okay but in the atlas or nexus spec. somewhere the entire system is explained. im tired of having to repeat myself. architecture doc or
    genesis. i need nexus coding asap. like basically dynamic end state. the pipeline is everything. can you make a dependancy graph for
    getting nexus to build towards the end state using the pipeline. like i had a dream of using ai to speed up innovation and human
    advancement. nexus is that system. my framework is a piece. me and nexus are meant to improve each other. improving my cognition improves
    nexus and vise versa. thats the dream."
  context: >-
    The same day he gave the request lifecycle whole (docs/2026-11-17-raid-request-lifecycle-phasemap.spec) and the rule that every request
    is mapped before it runs (RL_D5–RL_D8, PL-012). Money is short; the point of this graph is the shortest line to Nexus building with its
    own pipeline and local models, so a paid model is needed only for a failure's root cause.

decisions:
  NX_D1_the_pipeline_is_everything:
    status: "DECIDED 2026-11-17 by James — 'the pipeline is everything.'"
    chosen: >-
      Every request, build, agent call and repair runs as a pipeline in COS: mapped first (its DAG, its contract, its stopping conditions, its
      test file), each step an executable node file, observable and resumable. Nothing that does work runs outside one.
  NX_D2_a_dynamic_end_state:
    status: "DECIDED 2026-11-17 by James — 'like basically dynamic end state.' (the coder's reading, to confirm)"
    chosen: >-
      The end state is not fixed once: it is the contract's end state, and it moves only by a recorded decision (his, or RAID's within what he
      allows), each move kept with its prior value. The coder's reading of "dynamic": a request can refine its own end state as context is
      found (L4) and capabilities are built (L6), but never silently (the test file is fixed once a run starts, RQ23; a new end state is a new
      run of the same request). To confirm with him.
  NX_D3_he_and_nexus_improve_each_other:
    status: "DECIDED 2026-11-17 by James — 'me and nexus are meant to improve each other. improving my cognition improves nexus and vise versa.'"
    chosen: >-
      The loop is part of the system, not a slogan: what Nexus learns (patterns, failures, crystals, benchmarks) is shown to him, and what he
      decides (his words, his calls) is recorded where the work lives and feeds the next run. Both directions are measured where they can be
      (docs/FRAMEWORK-THREADS.md, docs/BENCHMARKS.md, docs/PROOF-OF-COMPETENCY.md), with failures kept.

# ── The graph, bottom up (each tier needs the one below it) ─────────────────────────────────────────────────────────────────────────────
# T0  the floor — DONE today
#       PF2_yielding_ingest (0.60.549) · RC2_linear_node_scan (0.60.550, 0.60.551): Idearium stays up while it indexes
# T1  every reply and every step is on disk, one source of truth
#       GD5a_one_write_the_job_and_its_response (Guardian: .job beside .response) · PC8_operate_a_pipeline slice c (the pipeline ledger)
# T2  RAID is the bridge (decides and delivers; Ollama first, Guardian if needed — his PC_D15/PC_D16, RL_D1)
#       PC16_raid_routes_every_interaction
# T3  every request is mapped before it runs (the request lifecycle)
#       RD9_every_input_through_raid (built a, b) → RQ13_the_work_surface_and_provenance (the compartment, the open loop, the fill index)
#       → RQ7_the_context_obligations (the DAG drafted, Nexus first then outward) → RQ23_acceptance_conditions_that_cannot_be_moved (the test file)
#       → RQ8_the_gap_is_a_question (no is not an answer) → NX1_no_request_runs_without_its_map (PL-012 enforced)
# T4  a step fits a small model
#       PC17_the_model_fits_by_what_it_runs · EQ4_the_emerge_guide_for_any_llm · PC8's chunking (Idearium's chunker, per word, per primitive)
# T5  the factory: Idearium's build runs through COS's pipeline
#       IF1_idearium_asks_agents_through_the_pipeline (needs PC16) → IF2_the_build_as_a_pipeline → IF3_one_gate, IF6_the_loop_is_cos
#       → IF7_the_factory_builds_itself · PC3_the_build_request_step (a missing capability becomes a build)
# T6  Nexus on the canvas, agents per system, everything RAID does through the pipeline
#       IF9_everything_raid_does_through_the_pipeline · IF10_the_map_of_nexus_on_the_canvas · IF11_agents_deployed_per_system_by_hat
#       → IF12_nexus_builds_itself_autonomously
# T7  NX2_nexus_codes_itself_toward_a_dynamic_end_state
# Not on the critical line (they continue beside it): GD5b–d (the rest of the reply store), CIE (Emerge's own JavaScript removed), WARP 2.

phases:
  NX1_no_request_runs_without_its_map:
    layer: integration
    status: OPEN
    james: '"each requests need a dag. the system needs to map before executing. that way it doesn''t drift." (2026-11-17)'
    depends_on: [RD9_every_input_through_raid, RQ13_the_work_surface_and_provenance, RQ7_the_context_obligations, RQ23_acceptance_conditions_that_cannot_be_moved, PC16_raid_routes_every_interaction]
    files: [cos/pipeline/runs.eg, cos/pipeline/index.js, cortex/core/raid/input.js, cortex/core/raid/contract-template.js, cos/spec/pipeline.spec]
    does: >-
      PL-012 enforced: COS refuses to start a request whose map is not on disk (its DAG with every gate's pass_when, its contract end state,
      its test file), and refuses a step that answers to no DAG node (drift). The refusal names what is missing, and RAID turns it into the
      work to map it (L2) rather than a dead end. Backend (runs.eg, Emerge) → route (COS) → command → UI.
    proof: "a request with no DAG is refused with what is missing; with its map it runs; a step outside the DAG is refused; the test file cannot be changed once the run started"
  NX2_nexus_codes_itself_toward_a_dynamic_end_state:
    layer: integration
    status: OPEN
    james: '"i need nexus coding asap. like basically dynamic end state. the pipeline is everything." (2026-11-17)'
    depends_on: [IF12_nexus_builds_itself_autonomously, NX1_no_request_runs_without_its_map, GD5a_one_write_the_job_and_its_response, PC8_operate_a_pipeline, PC17_the_model_fits_by_what_it_runs, EQ4_the_emerge_guide_for_any_llm, RQ8_the_gap_is_a_question, PC3_the_build_request_step]
    files: [docs/2026-11-17-nexus-codes-itself-phasemap.spec]
    does: >-
      The end state of this graph, measured, not declared: he types a request; RAID keeps it as a .input node, maps it (DAG, contract, stopping
      conditions, test file), runs it as a pipeline in COS where each step is small enough for a local model (Emerge per word and primitive),
      asks him only what Nexus cannot find, builds what it lacks through Idearium, and closes it on evidence, with every reply and step on disk
      and booked with Cortex. A paid model is called only for a root cause a local one could not find.
    proof: "a phase of Nexus's own map built end to end by the pipeline on his machine with a local model, its contract met on evidence, no paid agent in its ledger; the count of such phases goes up release over release (docs/BENCHMARKS.md)"
