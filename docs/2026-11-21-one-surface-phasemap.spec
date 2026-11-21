# docs/2026-11-21-one-surface-phasemap.spec — everything Nexus runs, on one pipeline surface, driven from the console and from Copilot, through RAID
# author: james-brooks (the direction and the calls are his; the map is the coder's, to his words)
origin: >-
  James, 2026-11-21, after the pipeline screen's preview (cos/ui/run-console-preview, PC8 slice d, PC_D15): "then each pipeline from all of nexus
  needs to be in here. queue from raid, and tasks, background tasks, jobs, everything running throught the pipeline. my framework. like being able
  to set the method, agent tool, or command, like needs to be as powerful as the automation engine, conditions, schedule, triggers, etc. like raid
  is what creates the center node. i want to be able to expirament with it. build each step, program it, like this can be i cant even discribe how
  valuable this can be. like i need to be able to use nexus from the console. all of it. like run through raid. like i need as much power and
  control, without making it overwhelming as possible. like running the trials, or testing my frameworks, like i want copilot to be able to make
  macros or frameworks from me talking to it." · "like it needs to be able to orchastrate all of nexus from the cli for me." · "like i talk to it
  and it understands nexus enough to find what im asking and fix something if its broken, or if i have a request, or if i need something
  changed. like the way i am talking to you, i need from copilot." · "query nexus data, components, files, nodes, ledgers, etc." · "also using
  copilot, updating models per file, website, system, everything, as nodes per, and each interconnected to each other?"
census_2026_11_21: >-
  What exists (the coder's census; reuse before build, §8.6): RAID is in Cortex, reached by every other system through lib/raid-port.js
  (approveTool, decide, outcome, listQueue). The request lifecycle is mapped (docs/2026-11-17-raid-request-lifecycle-phasemap.spec L0–L14: the
  input a node, the DAG, the contract, Nexus first, a missing capability built, RAID decides and delivers; several PARTLY). COS's command line
  (POST /api/cos/cli) has 26 commands, all about systems. The automation engine's catalogue has 25 step kinds and triggers (manual, every,
  daily, cron, event, webhook) for workflows, not pipelines (cos/automation/steps.js TRIGGER). cos/automation/method.eg resolves his framework
  per step. Copilot: docs/2026-10-10-copilot-talk-to-nexus-phasemap.spec and docs/2026-10-24-copilot-any-agent-phasemap.spec (CL1–CL4 OPEN).
  The pipeline screen's preview already reads Ollama's jobs, COS's runs, 961 phases from the maps and 595 components from the systems' own
  registries, and runs COS's CLI in its Terminal panel.
covers: >-
  Expands, does not rewrite: PC8 (operate a pipeline) and PC_D15 (the three types), PC2 (procedures and frameworks as steps), L0–L9 (the RAID
  request lifecycle), CL1–CL4 (Copilot as any agent), DB5 (the build moves to COS). Blocked in practice by Idearium going down under a build
  (runs 13 and 14, 2026-11-21): OS1's tasks and OS2's centre node need DB5 or that fault found first.

decisions:
  OS_D1_what_a_model_per_file_is:
    status: "OPEN — his to say (asked 2026-11-21)"
    james: '"also using copilot, updating models per file, website, system, everything, as nodes per, and each interconnected to each other?"'
    readings: >-
      (a) a model as an understanding: each file, website and system has a node that says what it is, what it does and what it relates to,
      kept current by Copilot and linked to the others (a graph of Nexus: Loom's, or Cortex's index); (b) a model as the AI that works on it:
      which Ollama model handles each file, site or system, set per node; (c) a model as a data shape: each one's schema, as a node.
  OS_D2_copilot_translates_through_his_framework_into_a_contract:
    status: "DECIDED 2026-11-21 (his)"
    james: >-
      "what if we use copilot as a translation layer between the me and what i put into the cli and emerge. the interpreter would use my
      framework for my inputs. then create a contract to send to raid then raid to emerge" · "yes, exactly."
    chosen: >-
      One chain, each link a record: his words → Copilot (the translation layer) → his framework, run on the input by the interpreter
      (method.eg) → a contract (L0 the input a node, L2 its DAG, L3 its end state) → RAID → Emerge. Deterministic first, the small model last:
      Emerge's own `eg say` turns the words it knows into Emerge with no model (each word shown with his quote); only the words it does not
      know become gaps, and only those go to a model.
    found: >-
      The coder's census, 2026-11-21: `eg say` / `eg teach` / `eg words` exist in Emerge; method.eg resolves his framework per pipeline step;
      L0 and L3 are built in part, L2 partly; there is no RAID → Emerge hop (RAID hands work to agents).
    axioms: "§5.2 (routing through RAID), §5.13 (Emerge is behaviour), §8.6 (reuse before build), Nexus is for small models (his)"
  OS_D3_raid_decides_with_his_framework_and_it_is_tested:
    status: "DECIDED 2026-11-21 (his)"
    james: '"that could also prove my framework. my framework is agnostic, wait, raid uses it for its decisions?" · "yes, exactly."'
    found: >-
      It does not, today. RAID decides by its router, resolve.eg, its tunables, its signal-to-noise filter and its recorded outcomes; none read
      his framework. The slot exists: a request's compartment is spawned with a constraint frame whose `injected_frameworks` RAID passes empty
      (cortex/core/raid/contract-intake.js:834, `injectedFrameworks: []`; lib/compartment-engine.js _assembleConstraintFrame).
    chosen: >-
      RAID fills `injected_frameworks` with his framework (agnostic: any .framework he names) and its decisions read it. It is proved, not
      assumed: the same requests run with and without it (OS8's arms), what is measured is named before any run (decisions that held, gaps
      closed, retries saved, time), the predictions are registered first (docs/FRAMEWORK-THREADS.md), and a result judged by the hands that
      predicted it is named post-hoc.

  OS_D4_copilot_administers_nexus:
    status: "DECIDED 2026-11-21 (his)"
    james: '"like copilot should be the system orchastrator and administrator." (2026-11-21)'
    chosen: "Copilot orchestrates and administers Nexus: it runs the queue of gaps and the self-healing loop (OS12), through RAID (§5.2, §9.1)."
  OS_D5_what_a_fix_may_do_alone:
    status: "OPEN — his to say (asked 2026-11-21)"
    readings: >-
      (a) every fix applies on its own once its gates pass (tests, snapshot, rewind ready), and he is told after; (b) every fix waits as a
      proposal for his yes; (c) by kind: a mechanical fix (autocorrect, a config value, a restart) applies on its own, a code or design change
      waits for his yes.
  OS_D6_copilot_has_the_whole_system_through_raid_and_the_pipeline:
    status: "DECIDED 2026-11-21 (his)"
    james: >-
      "copilot needs to be able to have full access to the entire system, like nexus-cli, cos, all of each system, run through raid and the
      pipeline." (2026-11-21)
    chosen: >-
      Copilot can reach every system's every command (nexus-cli, COS's CLI, each system's routes: OS5), never around RAID: each act goes through
      RAID (approveTool, §5.2, §9.1) and runs as a pipeline, so each is approved, recorded and visible on the one surface.
  OS_D7_raid_decides_by_branches_confidence_slope_and_compounding:
    status: "DECIDED 2026-11-21 (his)"
    james: >-
      "raid runs through the pipeline also using the intellicgence system and my framework, can generate branches before making a decision
      using the hypothosis generator and the confidenc escoring, adversarial runs if it is needed, then makes a decision based on slope,
      confidence and compounding." (2026-11-21)
    found: >-
      The coder's census, 2026-11-21: the Intelligence system already has the pieces, none of them in RAID's decisions: patterns held as
      hypotheses with a confidence, promoted ("crystallised") when they beat the base rate (intelligence/index.js); the adversarial faculty
      ("probes both; contradiction between the two = gap", intelligence/adversarial.js); delta, the rate of change between ledger entries
      (the slope; intelligence/cfr/delta.js); sigma, the deviation from baseline (cfr/sigma.js); the compounding effects engine
      (intelligence/causal/compound.js). RAID writes to the CFR ledger (contract-intake.js) but decides by its router, resolve.eg and tunables.
      No hypothesis generator makes branches before a decision today.
    chosen: >-
      RAID's decision is itself a pipeline: his framework frames the question (OS_D3); the branches are generated as hypotheses (Intelligence);
      each is scored for confidence; an adversarial run is made when the branches disagree or the confidence is low; the decision is taken on
      slope (delta), confidence and compounding (the compound engine), and recorded with all three, so it can be checked against what happened.

phases:
  OS1_every_run_on_one_surface:
    status: OPEN
    depends_on: []
    files: [cos/ui/run-console-preview/server.js, cos/manager/automation-door.js, lib/raid-port.js]
    does: >-
      The pipeline screen's Activity reads every kind of running work, each by its owner's route: RAID's queue (listQueue), COS's pipeline and
      workflow runs, Idearium's repo tasks and background tasks, Ollama's jobs. Each shown as a run with its steps, and each openable on the
      canvas. Nothing is copied: a view over the owners' routes (§5.9).
    proof: "a RAID request, a COS pipeline run, an Idearium task and an Ollama job, all listed at once with their state, each opened on the canvas"
  OS2_raid_makes_the_centre_node:
    status: OPEN
    depends_on: [OS1_every_run_on_one_surface]
    files: [cortex/raid, cos/automation/pipeline.js, cos/ui/run-console-preview/index.html]
    does: >-
      A request to RAID (L0: the input becomes a node) is the origin of a radial pipeline (PC_D15): its DAG (L2) the rings outward, its
      contract (L3) the end state. Shown and edited on the canvas like any pipeline; run by RAID.
    proof: "a request typed in the console appears as a centre node with its DAG around it, and runs"
  OS3_each_step_its_method_agent_tool_or_command:
    status: OPEN
    depends_on: []
    files: [cos/automation/method.eg, cos/automation/steps.js, cos/ui/run-console-preview/index.html]
    does: >-
      Every step can be given a method (a section of his framework, resolved by method.eg), the agent that answers (RAID's decide, or picked),
      a tool, or a command, from menus on the step. Expands PC2.
    proof: "one step set to a framework section and an agent from menus; its run uses both, shown on the step"
  OS4_pipelines_get_triggers_schedules_conditions:
    status: OPEN
    depends_on: []
    files: [cos/automation/pipeline.js, cos/automation/cron.js, cos/automation/steps.js]
    does: >-
      The automation engine's triggers (manual, every, daily, cron, event, webhook) and conditions, for pipelines too, set from the screen.
    proof: "a pipeline on a schedule and one on an event each run by themselves; both shown in Activity"
  OS5_all_of_nexus_from_the_console:
    status: OPEN
    depends_on: [OS1_every_run_on_one_surface]
    files: [cos/manager/cli.js, idearium/cli/route-commands.js, lib/raid-port.js]
    does: >-
      One command line for all of Nexus: every system's routes as commands (DB6: a capability is a route), each one approved by RAID
      (approveTool), with completion so nothing has to be remembered. The Terminal panel is its window.
    proof: "a command for each system run from the Terminal panel, each approved by RAID and logged"
  OS6_query_everything:
    status: OPEN
    depends_on: [OS5_all_of_nexus_from_the_console]
    files: [loom, cortex, orchestrator/lib/mcp-server.js]
    does: >-
      Query Nexus's data from the console and from Copilot: nodes, components, files, ledgers, runs, phases. Each through its owner (Cortex the
      bookkeeper, §L13; Loom's graph; the ledger), one query shape.
    proof: "five questions (a node, a component, a file, a ledger row, a phase) answered from the console with where each came from"
  OS7_copilot_runs_nexus_from_talk:
    status: OPEN
    depends_on: [OS5_all_of_nexus_from_the_console, OS6_query_everything]
    files: [copilot/assist-loop.js, copilot/intents.js, docs/2026-11-17-raid-request-lifecycle-phasemap.spec]
    does: >-
      He talks; Copilot finds what he means in Nexus (OS6), and either answers, fixes what is broken, files the request, or changes what he asks,
      each through RAID's lifecycle (L4 Nexus first, L5 no "I don't know", L6 a missing capability built). It can make a macro, a pipeline or a
      framework from what he said, shown to him before it is kept. Expands CL3 and the talk-to-Nexus map.
    proof: "three things said in plain words (a fault, a request, a change) each carried out through RAID, and one framework made from talk"
  OS8_experiments_and_trials:
    status: OPEN
    depends_on: [OS3_each_step_its_method_agent_tool_or_command]
    files: [cos/automation/pipeline.js, docs/framework-trial]
    does: >-
      Trials and tests of his frameworks as pipelines (the Framework trial pipeline exists): the same steps with arms (method A against method B,
      one model against another), runs compared side by side, predictions registered before results (FRAMEWORK-THREADS rules).
    proof: "one trial run with two arms; the comparison shown; its prediction registered before it ran"
  OS9_a_model_per_node_interconnected:
    status: OPEN
    depends_on: [OS6_query_everything, OS7_copilot_runs_nexus_from_talk]
    files: []
    does: "Waits on OS_D1 (what a model per file, website and system is)."
    proof: "set when OS_D1 is answered"
  OS12_nexus_heals_and_improves_itself:
    status: OPEN
    depends_on: [OS6_query_everything, OS7_copilot_runs_nexus_from_talk]
    files: [copilot/assist-loop.js, ollama/routes/stream.js, diagnostic/nexus-diagnostic.js, cortex/self-heal/failure-intake.js, lib/open-loop-taxonomy.js]
    james: >-
      "like copilot should be the system orchastrator and administrator. like we could have gaps feed into ollamas continous event stream and a
      ledger for a queue to have it automatically diagnose and fix the system, pipeline, nexus, like it should be using nexus to understand
      nexus when it needs to, building understanding and learning, and fixing and optimizing nexus using emerge and the pipeline." (2026-11-21)
    found: >-
      The coder's census, 2026-11-21: Ollama's standing channels (ollama/routes/stream.js, /api/stream/:id: one open conversation that keeps
      its context, streamed live); the Diagnostic system already escalates its gaps to Ollama as background 'diagnose' work that gives way to
      his (nexus-diagnostic.js; ollama/lib/dispatch.js BACKGROUND_INTENTS); Cortex's self-heal (failure intake, forensics, fault taxonomy,
      escalation, reports); the open-loop taxonomy; RAID's L8 (failure modes, faults and gaps). Missing: the one queue, and the loop over it.
    does: >-
      Copilot is the system's orchestrator and administrator. Every gap, fault and failure mode from every system lands as a row in one queue
      ledger (Cortex keeps the books, §L13). Copilot works the queue through Ollama's standing channel, in the background, giving way to his
      work: it uses Nexus to understand Nexus (OS6: the nodes, components, ledgers and failure records), names the cause, and makes the fix
      as a pipeline (code through the Emerge rung); the fix passes its gates (its tests, a Versionium snapshot before, the rewind if it
      breaks) and lands per OS_D5. What it learned is kept as nodes (the failure mode, its cause, the fix that held), so the next one is
      faster: optimising is the same loop on slow or wasteful paths.
    proof: "a gap planted on purpose is queued, diagnosed from Nexus's own records, fixed through the pipeline, tested, landed per OS_D5, and its lesson found again by the next one"
  OS13_raid_decides_as_a_pipeline:
    status: OPEN
    depends_on: [OS3_each_step_its_method_agent_tool_or_command, OS11_raid_reads_his_framework_tested]
    files: [cortex/core/raid/router.js, cortex/core/raid/resolve.eg, intelligence/index.js, intelligence/adversarial.js, intelligence/cfr/delta.js, intelligence/causal/compound.js]
    does: >-
      OS_D7 built: a RAID decision runs as a pipeline on the one surface: frame (his framework) → branches (hypotheses) → confidence per branch →
      adversarial run when needed → decide on slope, confidence and compounding → record all three. Each step a box he can see, change and rerun.
    proof: "ten real RAID decisions made this way, each with its branches, scores and why on the canvas; checked later against what happened"
  OS10_the_translation_chain:
    status: OPEN
    depends_on: [OS5_all_of_nexus_from_the_console, OS2_raid_makes_the_centre_node]
    files: [copilot/assist-loop.js, cos/automation/method.eg, cortex/core/raid/contract-intake.js, emerge/emerge/lang/say]
    does: >-
      OS_D2 built: a sentence of his, typed in the console or said to Copilot, goes through `eg say` first (the words it knows, no model),
      the unknown words as gaps to a small model, his framework run on the input (method.eg), and comes out a contract RAID takes; RAID's
      result is Emerge, checked by its compiler. Each link a row, so he sees what each word became and why.
    proof: "three requests of his, in his words, each shown word by word to Emerge through a contract RAID ran; the words no model touched counted"
  OS11_raid_reads_his_framework_tested:
    status: OPEN
    depends_on: [OS8_experiments_and_trials]
    files: [cortex/core/raid/contract-intake.js, lib/compartment-engine.js, docs/FRAMEWORK-THREADS.md]
    does: >-
      OS_D3 built: RAID fills a request's injected_frameworks with his framework and its decisions read it; a trial runs the same requests
      with and without it, measures named and predictions registered before the runs.
    proof: "one trial of real requests, two arms, the predictions registered before; the difference and its doubts written in FRAMEWORK-THREADS"
build_order: [OS1, OS3, OS4, OS5, OS6, OS2, OS10, OS7, OS12, OS8, OS11, OS13, OS9]
first_slice: "OS1: Activity reads RAID's queue, COS's runs, Idearium's tasks and Ollama's jobs, one list on the pipeline screen."
