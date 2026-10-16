# docs/2026-10-16-agent-work-funnel-phasemap.spec
# Everything an agent does passes four steps, in order, before it writes: its dependencies, its spec, its phase, then its chunks.
# MAPPED 2026-10-16, before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec.
# Touches: docs/2026-10-15-gate-held-work-phasemap.spec (GW26 everything declares what it needs; GW27 every chunk a node; (k) the
# unit is the chunk type), docs/2026-10-15-warp-builds-and-spec-framework-phasemap.spec (MP1/MP2 phase mapping, SF1-SF4 the spec
# framework, IS1), docs/2026-10-16-intent-hat-agent-chain-phasemap.spec (IH: which hat and agent serve an intent),
# docs/2026-10-15-pipeline-focus-phasemap.spec (his order: the pipeline is intent, routing, chunking, gating).

origin:
  date: 2026-10-16
  james: '"Every thing the agents do. Needs to determine dependancies, spec, phase, then chunk."'
  context: >-
    Said right after deciding that the unit of work is the `chunk` node type ("Yes chunk type. When I said brick I was using a
    metaphor"), with GW27 (every input, output, response, contract, chunk and dependency set a node) mapped and the refactor
    tool's decision still open.
  decided: >-
    His, as stated: the order is fixed. Dependencies first, then the spec, then the phase, then the chunks, for everything an
    agent does.
  reading: >-
    The coder's reading (to confirm). "Everything the agents do" = every request that will change something (intents change,
    build, debug, spec; not explain), from any door: the Agent tab, copilot, a RAID contract, a phase build. Each step is
    answered deterministically first (§ agents: deterministic first, local by default, a model only where a check found nothing),
    and each answer is a node, so the next step and the next agent read it instead of finding it again:
      1 dependencies: what the request touches (files, components, specs named or implied) and what those require and are used by
      2 spec: the spec(s) that own those files; none → the spec framework (SF) drafts one first
      3 phase: the phase whose files or specs match; none → a new phase is mapped into the repo's phasemap (map before build)
      4 chunks: the phase's plan as chunks (the contract), then the pipeline as built (WARP, gates, the run per chunk, the trace)
    A request that is only a question (explain) is answered without the funnel.

found:
  # read in code, 2026-10-16
  dependencies: "lib/phase-map-auto.js mapPhase/forMaps: files with evidence, requires, consumers, specs, dependsOnInferred — per phase, automatic (MP1/MP2, 0.60.65). loom impact (nexus_loom_impact). Never run on a request."
  spec: "phases carry specs (PT1 0.60.51); AM.specsOfNexus(root) gives the specs that own a Nexus file; lib/spec-collect.js and the spec intent (SF1-SF4). A request is never asked which spec owns it."
  phase: "idearium/repo/phases.js managerView; phase builds (_phaseBuild). An Agent-tab request (repo.agent.prompt) or a copilot task has no phase."
  chunks: "lib/phase-plan.js planPrompt/derivePlan → cortex/core/raid/contract-adapters.js fromPhasePlan (one gate per planned file) → RAID runContract. Only phase builds reach it."
  doors_that_skip_it: "repo.agent.prompt (lib/build-paths.js classifies it 'not a build: the Agent tab chat'), copilot tasks (copilot/server.js), the officiator's synthesized contracts (cortex/core/raid/officiator.js)."
  intents: "lib/context-prereqs.js intentOf: explain · change · debug · build · spec — the funnel's entry test."

phases:
  FN0_the_funnel_as_data:
    status: "BUILT 0.60.94 — lib/work-funnel.js, POST /api/repos/:uuid/funnel, `repo funnel`; test-work-funnel 8/8. The screen is FN4."
    systems: [core, idearium]
    files: [lib/work-funnel.js (new), lib/node-schemas/schema.funnel (new), tests/modules/test-work-funnel.test.js (new)]
    depends_on: []
    specs: [docs/2026-10-15-gate-held-work-phasemap.spec]
    does: >-
      funnel({ repo, request, intent }) → { dependencies, spec, phase, chunks, missing } — the four answers in order, each with
      where it came from (evidence | mapped | none), no model. dependencies: names in the request resolved against the repo
      tree (phase-map-auto namesIn/wordsIn + envFromTree), with their requires and consumers. spec: the owning specs of those
      files (specsOfNexus for Nexus; the repo's specs by file for others). phase: the open phase whose mapped files or specs
      overlap most. chunks: that phase's plan (derivePlan) or its existing contract's chunks. A step with no answer stops the
      funnel there and says which (missing), never guesses the later ones.
    proof: "a request naming a Nexus file resolves its deps, its owning spec and the phase that maps it, with each source; a request naming nothing is stopped at dependencies, said; explain never enters"

  FN1_every_door_goes_through_it:
    status: OPEN
    systems: [core, idearium, copilot, cortex]
    files: [lib/repo-agent.js, idearium/api/index.js, copilot/server.js, cortex/core/raid/officiator.js, lib/build-paths.js]
    depends_on: [FN0_the_funnel_as_data]
    does: >-
      The doors run the funnel before an agent writes: the Agent tab (a change/build/debug/spec request), copilot tasks, the
      officiator's contracts, and phase builds (which already have a phase: the funnel checks its deps and spec first). The
      answer rides to the agent as one block (the 'build-phase-map' style, budgeted as GW24) and is stored on the run.
      lib/build-paths.js gains the check: an agent write path that skips the funnel is named (a CK beside CK-255).
    proof: "an Agent-tab 'change X' request reaches the agent with its deps, spec, phase and chunk; a door that skips the funnel fails the check"

  FN2_what_is_missing_is_made_first:
    status: OPEN
    systems: [idearium, core]
    files: [lib/work-funnel.js, lib/spec-collect.js, idearium/repo/phases.js, lib/phase-plan.js]
    depends_on: [FN1_every_door_goes_through_it]
    does: >-
      No spec: the request goes first to the spec intent (SF framework, genesis by default) and the collected spec is the
      answer. No phase: a phase is drafted into the repo's phasemap from the request and its deps (files:, depends_on:, specs:),
      proposed, never applied without the person's yes. No chunks: the phase is planned (planner, else derivePlan). Each made
      thing is said on the run, and the funnel continues from the step it filled.
    proof: "a request for something with no spec and no phase ends with a collected spec, a proposed phase and its chunks, then waits for yes"

  FN3_every_answer_a_node:
    status: OPEN
    systems: [core]
    files: [lib/work-funnel.js, lib/node-export.js, lib/nexstore/]
    depends_on: [FN0_the_funnel_as_data]
    does: >-
      The four answers are nodes in the taxonomy (GW27): a dep set (edges), the spec ref, the phase ref, the chunk nodes (kind
      build | spec_section, his decision (k)), each causedBy the request and tagged repo, phase and chunk. The next agent and the
      trace read them.
    proof: "a funnelled request leaves its four nodes linked by causedBy; the trace lists them"

  FN4_the_screen:
    status: OPEN
    systems: [idearium]
    files: [idearium/ui/js/app.js, idearium/ui/js/plan-panel.js]
    depends_on: [FN1_every_door_goes_through_it]
    does: "The Agent tab shows the four steps for a request before it runs (deps · spec · phase · chunks, each with its source), and what was missing and made; the same in the Plan's run row."
    proof: "driven in Clear Glass: a request shows its four steps, and a missing spec shows as made"

build_order: [FN0_the_funnel_as_data, FN3_every_answer_a_node, FN1_every_door_goes_through_it, FN2_what_is_missing_is_made_first, FN4_the_screen]
open_decisions:
  - "decision_refactor_tool (docs/2026-10-13-projects-raid-and-gates-phasemap.spec): [A] proposal engine (coder recommends) · [B] one-pass rewriter · [C] report only — the refactor tool will run this funnel too"
  - "the reading above: which requests enter (change, build, debug, spec; explain answered directly)"

# ## ADDENDUM 2026-10-16 — the hat that does the work is a file too
# James: "What about .hats for the repo agents model. All physical." The funnel's agent is resolved through intent → hat → agent
# (docs/2026-10-16-intent-hat-agent-chain-phasemap.spec); its hat and repo-agent model become node files there (IH6). FN3's answers
# and IH6's hats are the same rule: nothing only in memory or the page.

# ## ADDENDUM 2026-10-16 (b) — FN0 built (0.60.94); the pick was delegated
# James (2026-10-16): "pickest the highest leverage, structural change. axioms in the docs are law"
# The coder's pick under that delegation: FN0. It makes §3.3 (map before build) what every agent does by construction, and the
# rest reads from it (FN1-FN4, GW27 nodes, IH6, the refactor tool). The refactor tool's decision was made the same way: [A]
# (recorded in docs/2026-10-13-projects-raid-and-gates-phasemap.spec decision_refactor_tool).
# Measured on Nexus itself (2026-10-16, 1 s for the whole tree and every phasemap):
#   "change lib/run-state.js ..." → deps (its requires and 6 consumers) → specs → GW2 (open) → 5 chunks
#   "fix the officiator ..." → cortex/core/raid/officiator.js (by its plain name) → cortex.spec first → RQ27 (open) → its chunks
#   "build ... idearium/lib/projects.cjs" → stops at phase: no open phase maps it (COSA10 my_projects lives in a comment)
#   "change the warp-rung ..." → stops at phase: only finished phases map it (WB1, WB2). A new phase comes first (FN2).
# Found: a request is short, so a plain word that names one or two files counts ("the officiator"); MP1 skips those in long phase
# bodies, where they were noise. Kept to requests only, behind a stop list.

