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

  NX_D4_the_first_run_is_a_setting_not_code:
    status: "DECIDED 2026-11-17 by his axioms (§8.6 reuse; his PC_D16 Ollama first) — after his 'need nexus building itself using ollama preferably. it needs to align with the architecture so it doesn't induce friction. pipeline is everything. i need nexus building itself.'"
    chosen: >-
      Nexus can build itself through its pipeline today: idearium/pipelines/idearium-build.pipeline runs a phase end to end, and the build's
      agent ladder (lib/repo-agent.js) already has an Ollama backend with a per-repo model. The nexus repo's agent defaults to ChatGPT
      (defaultProvider()); set it to Ollama (`repo agent nexus --provider ollama --model <model>`), then `cos request idearium-build`. No new
      code is needed for the first run; its failures are the next phases (root causes only, from the run's own files).
    friction_found: >-
      Two routing doors: the build asks copilot's model door (lib/model-door.js via POST /api/route), and RAID decides elsewhere
      (decideForContract). His PC_D15 ("Everything routes through RAID") makes one of them the friction: PC16 (T2) makes RAID the bridge and
      the model door its delivery, not a second decider. Until then the first run goes through the ladder as it is.
    corrected_2026_11_17: >-
      James, 2026-11-17: "no. i dont do cli. im not trying to remember all that. idearium already has the ui for this, which needs to migrate to cos automation pipeline and workflow canvas." The first run is done in the UI, not the CLI (the commands above are kept for agents, §0.3): Idearium, the nexus
      repo, Agent tab, agent options: "who answers" = ollama and "ollama model"; then COS, Automation, the Idearium build pipeline, ▶ Run (it
      asks for the phase in the page: "▶ Run with these"). The agent options move to COS's Automation (pipeline and workflow canvas): PC16
      expanded the same day.
    model_his: "the model is his (PC_D16): his log shows huihui_ai/qwen2.5-coder-abliterate:3b in use; a 3B model is likely too small to write a phase; the factory map's note names deepseek-coder-v2:16b (a mixture of experts, 2.4B active, ~8.9 GB) as the best fit for his RAM."

  NX_D5_his_list_2026_11_17_evening:
    status: "HIS, 2026-11-17 — recorded in his order; each to be built as a phase when its turn comes (most already have one)"
    james: >-
      "like a lot needs to migrate not link. i hate that. the pipeline ui needs more, but its fine. i have like no control. i should be able to
      have copilot fix it. like i dont want to keep using you on firefox to fix nexus. like everything should route through raid. like in cos
      ui i want all the raid settings. I need more control and less dependancy on you or the agents. like if i can change it i want to be able
      to in the settings. thats what emerge is for, coding in my own language. lets get the pipeline working enough to starting doing this work
      in nexus then work on emerge. like i was thinking raid could be a hat also that binds copilots responsablilties to raid. so it can think
      for it. nexus  is meant to learn. lets get idearium building using emerge. the pipeline api to manage the pipeline. what do you think?
      do anything you can to get this working so i can have it building itself today. fix, change or edit later. gates should have retry logic,
      run diagnostic, and intelligence system and escalate stategies i feel like."
    list:
      - "migrate, not link: what moves from Idearium to COS and RAID moves whole (its code, its data, its screen), never a pointer left behind (IF_D1, PC16)"
      - "every RAID setting in COS's UI, changeable by him there (PC16 slice b: the Routing & fallback screen, the officiator options, the tunables)"
      - "copilot can fix Nexus: copilot is a hat (RL_D1b) worn by a local agent with the agent tools, through the pipeline, so a fix is a request, not a Claude session"
      - "RAID as a hat too, binding copilot's responsibilities to RAID, so RAID thinks for it and Nexus learns (his idea; the reading of 'binds' to confirm)"
      - "gates: retry, run the diagnostic, ask the intelligence system, escalate by strategy (routing.retries_per_rung, escalation, escalate_on exist; the diagnostic and intelligence steps are not yet a gate's)"
      - "the pipeline API manages the pipeline (PC8: run, pause, continue, retry, the ledger)"
      - "Idearium building with Emerge, then Emerge finished by the pipeline (his order: pipeline working enough first, then Emerge)"
    coder_view: "agreed in order; the first is a pipeline that finishes one phase on his machine with deepseek-coder-v2:16b; each item above then becomes a phase the pipeline builds"

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
