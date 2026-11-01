spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # outperform.spec — the arena: can Nexus (Idearium's pipeline, local models for the bulk, frontier models through Guardian only where a
  # check failed, his "innovate the method", many cheap tries) build better than one frontier model working alone? Measured, never asserted.
  # Format: emerge's module spec (lib/emerge/SPEC_COMPILER.spec), compiled by lib/emerge/compiler/kg-builder.js; every module and schema at
  # specDepth 1.0, invariants valid, no BLACK node (tests/modules/test-substrate-spec.test.js). If the code is lost, it is rebuilt from here.
  # Phases: docs/2026-11-01-outperform-phasemap.spec (`blocks:` name these modules).
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        outperform
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-11-01T00:00:00Z
    status:      specced
    uuid:        nexus-outperform-spec-v1-0000-2026-1101-jamesbrooks-001
    origin: >-
      James, 2026-11-01: "what if we use you to build emerge from the bottom up. could be better than you. say we only use enterprise grade
      code. only the most effective methods and strategies. cant innovate the problem, innovate the method." · "why can't it beat you? what
      would it take" · "look at idearium. all of that is in there" · "can we plan that out. could it outperform you? use guardian also. can you
      spec this? make a dependancy graph." His principle, 2026-08-13 (lib/emergence.js): "if it can't innovate the problem, innovate the
      method." The idea, the bar and the use of Guardian are his; the coder wrote the contracts and the measure.
    purpose: >-
      A fair, repeatable contest between two ways of building the same thing from the same spec. Arm A is one frontier model working alone,
      through Guardian, as a person would use it. Arm B is Nexus: Idearium's pipeline, local models first, his method pivot, several
      candidates chosen by tests, and a frontier model through Guardian only as planner, repairer after a failed check, or judge. Each is
      scored on hidden tests, on what it cost and on what it wasted, read from the flight recorder. "Better" is a verdict the numbers give.
    target_runtime: [node]
    language_stack: [javascript]
    paradigm: [SISO, evidence-first, measured, explainable]
    axioms: ["§0.1 evidence over memory", "§1.1 nothing real until proven", "§1.2 nothing fails silently", "§0.0 truth is supreme",
      "§8.6 reuse before build", "§5.9 sovereignty: every system through its route", "USER_AUTONOMY: the verdict's meaning is his"]
    deps:
      - { name: js-yaml, version: ">=4.1.0", required: true, purpose: "spec and node files" }

    constraints:
      - id: OP-001
        description: "Both arms get the same spec, the same visible tests, the same time limit and the same tools; hidden tests are seen by neither until scoring."
        type: hard
        enforced_by: [GATE-OP-SAME-START]
      - id: OP-002
        description: "Every number comes from records the build already writes (the flight recorder, phase costs, Guardian's jobs); nothing is estimated where a record exists, and an estimate is labelled."
        type: hard
        enforced_by: [GATE-OP-FROM-RECORDS]
      - id: OP-003
        description: "A frontier call in arm B happens only as plan, repair after a failed check, or judge of disagreeing candidates, and each one names which and why."
        type: hard
        enforced_by: [GATE-OP-FRONTIER-WHY]
      - id: OP-004
        description: "A loss is reported as a loss; a task neither arm finishes is said; no task is dropped after the run."
        type: hard
        enforced_by: [GATE-OP-NO-CHERRY]
      - id: OP-005
        description: "Models are reached only through their systems' routes: local models through Ollama's door, frontier models through Guardian's POST /command."
        type: hard
        enforced_by: [GATE-OP-DOORS]

  schemas:

    - id: ArenaTask
      name: ArenaTask
      description: "One thing to build, taken from an Idearium repo's phase that has a spec and tests."
      fields:
        id:          "string — <repo>:<phase>"
        repo:        "string — the Idearium repo uuid (nexus/emerge first)"
        phase:       "string — the phase key in the repo's map"
        spec:        "string — the spec module ids the phase blocks"
        files:       "string[] — the files it may change (its .phase graph)"
        visibleTests: "string[] — tests both arms may run"
        hiddenTests: "string[] — tests held back until scoring"
        timeLimitMs: "number — the same for both arms"
      behavioral_contracts: ["a task without a spec, a graph or a hidden test is refused from the suite, said"]
      error_paths: ["phase not found → refused with the map's phases"]

    - id: Arm
      name: Arm
      description: "One way of building."
      fields:
        id:       "string — frontier-alone | system | local-alone"
        provider: "string|null — the frontier provider (frontier-alone), through Guardian"
        policy:   "object — the routing policy (system): mode local-first, pivotAfter, candidates, frontierRoles"
        tools:    "string[] — the same tool set for every arm"
      behavioral_contracts: ["the arm's whole configuration is recorded with each run"]
      error_paths: ["an unknown arm id → refused"]

    - id: ArenaRun
      name: ArenaRun
      description: "One arm on one task, read from the records it wrote."
      fields:
        id:        "string"
        task:      "string — ArenaTask.id"
        arm:       "string — Arm.id"
        runId:     "string — the phase run id the flight recorder reads"
        landed:    "boolean — its change passed the visible tests and was applied in its branch"
        hiddenPass: "number — hidden tests passed / total"
        localCalls: "number"
        frontierCalls: "object[] — { role: plan|repair|judge|alone, why, provider, jobId }"
        tokens:    "object — { local, frontier, estimated: boolean }"
        wallMs:    "number"
        wasted:    "object — { calls, tokens } on attempts that never landed (flight-data)"
        pivots:    "number — method pivots taken"
        candidates: "number — candidates written"
      behavioral_contracts: ["every field is read from a record and names it"]
      error_paths: ["a run with no flight data → scored as not finished, said"]

    - id: ArenaScore
      name: ArenaScore
      description: "The verdict over a suite, per arm and between arms."
      fields:
        suite:     "string — the suite id and its task list"
        perArm:    "object — { arm: Metrics } (schema Metrics)"
        verdict:   "string — system-better | frontier-better | even | not-enough-tasks"
        why:       "string — the numbers the verdict rests on"
        lossesSaid: "string[] — each task the system lost, by name"
      behavioral_contracts: ["system-better needs hiddenPassRate ≥ frontier's and fewer frontier calls, over at least 10 tasks; else even or not-enough-tasks"]
      error_paths: ["fewer than 10 finished tasks → not-enough-tasks"]

    - id: Metrics
      name: Metrics
      description: "What the arena measures for one arm over a suite. James, 2026-11-01: \"could beat you in what metrics. like tokens, problem solving? quaility? which metrics?\""
      fields:
        finished:        "number — tasks it finished within the limit"
        hiddenPassRate:  "number — quality: hidden tests passed / total, over finished tasks (problem solving as a number)"
        firstTryRate:    "number — tasks landed on the first attempt"
        regressions:     "number — existing tests a landed change broke (the suite's own tests run after each change)"
        boundaryBreaks:  "number — new crossings the drawbridge census found in landed changes (sovereignty)"
        frontierCalls:   "number — calls to frontier models (the expensive resource)"
        frontierTokens:  "number"
        localCalls:      "number"
        localTokens:     "number"
        costUnits:       "number — frontier tokens × the frontier weight + local tokens × the local weight (lib/economy weights, said)"
        wallMs:          "number — time to the last landed change"
        wasted:          "object — { calls, tokens } on attempts that never landed"
        variance:        "number — spread of hiddenPassRate over repeated runs of the same suite (consistency)"
        explained:       "number — share of landed changes whose why, spec and provenance are recorded"
      behavioral_contracts: ["every field is computed from records; a field that cannot be is null with why, never 0"]
      error_paths: ["no landed change → quality fields null, said"]

    - id: LearningPoint
      name: LearningPoint
      description: "What one run taught: which method, provider, pattern or reused component led to a change that held. James, 2026-11-01: \"not only that but the system learns better code to optimize itself, which gives better code.\""
      fields:
        task:      "string — ArenaTask.id"
        jobType:   "string — the routing's job type"
        method:    "string — the approach that landed (the ask after a pivot, or the first)"
        provider:  "string"
        reused:    "string[] — components the change reused (component store)"
        held:      "boolean — its hidden tests passed and nothing regressed"
        lesson:    "string — one line: what to do next time"
        at:        "number"
      behavioral_contracts: ["a lesson counts only when held is true; a lesson that later fails is weakened, never deleted"]
      error_paths: ["a run with no landed change teaches only its failure classes"]

    - id: PivotDecision
      name: PivotDecision
      description: "His 'innovate the method': when the same failure keeps coming, the next attempt is asked for a different approach."
      fields:
        phase:     "string"
        failures:  "object[] — { class, provider, at } in order"
        sameClass: "number — consecutive failures of one class"
        pivot:     "boolean — sameClass ≥ pivotAfter"
        ask:       "string — the changed ask (lib/emergence.js's pivot prompt) when pivot"
        why:       "string"
      behavioral_contracts: ["a pivot changes the ASK, not only the provider; it is a row in the flight data"]
      error_paths: ["no failure classes recorded → no pivot, said"]

    - id: Candidate
      name: Candidate
      description: "One of several attempts written at once, each in its own branch."
      fields:
        id:        "string"
        phase:     "string"
        branch:    "string — the snapshot it started from (COS SnapshotEngine), and its working copy when copies are allowed"
        provider:  "string"
        visiblePass: "number — visible tests passed / total"
        chosen:    "boolean"
        cost:      "object — { calls, tokens }"
      behavioral_contracts: ["the chosen one passes most visible tests; ties go to the fewest changed lines; the rest are counted as spent"]
      error_paths: ["none passes → the phase fails as one attempt, with every candidate's failures"]

  interfaces:

    - id: IF-ROUTING
      name: pipeline-routing
      path: lib/pipeline-routing.js
      description: "Idearium's routing policy: modes learned, fixed, chain, local-first, economy; classify(result); shouldFallback; breakers."
      exports: ["policyFrom(config, overrides)", "plan({ preferAgent, block, policy, records, now })", "classify(result)", "shouldFallback(cls, policy)"]
      behavioral_contracts: ["a failure class moves to the next provider; verdicts teach the learned order"]
      error_paths: ["login never falls back (needs a person)"]

    - id: IF-FLIGHT
      name: flight-data
      path: lib/flight-data.js
      description: "FR6: one run read whole — calls, tokens, attempts, what was wasted, friction and tension — from its idearium_phase_runs rows."
      exports: ["flight(rows, { now, stuckAfter, delta }) → { verdict, calls, wasted, ladder, friction, tension }", "summary(rows, opts)", "lines(f)"]
      behavioral_contracts: ["a projection over idearium_phase_runs, never a second store"]
      error_paths: ["no rows for a run → said"]

    - id: IF-PHASE-COST
      name: phase-cost
      path: lib/phase-cost.js
      description: "Agent calls and tokens of a run (estimate-v1 at the source, else chars/4, said)."
      exports: ["costOf(rows) → { total, byRun }"]
      behavioral_contracts: ["an estimate is labelled"]
      error_paths: ["rows without token counts → chars/4, said"]

    - id: IF-GUARDIAN
      name: guardian-command
      path: guardian/lib/dispatcher.js
      description: "Guardian, the only system that touches frontier providers (browser tabs, no API keys): POST /command dispatches a job, GET /status/:jobId and /response/:jobId read it; the dispatch ladder escalates mesh → repair → NCP → person."
      exports: ["POST /command { prompt, provider } → { jobId }", "GET /response/:jobId → { text, provider, durationMs }"]
      behavioral_contracts: ["reached through its route (lib/nexus-client.js), never its files"]
      error_paths: ["no tab for the provider → the ladder says user intervention needed"]

    - id: IF-EMERGENCE
      name: emergence
      path: lib/emergence.js
      description: "His loop: axioms and an end state; after pivotAfter same-method failures the ask changes shape."
      exports: ["attempt(spec, opts) → { outcome, history }", "sessions({ limit })"]
      behavioral_contracts: ["the pivot prompt says the method failed repeatedly and asks for a genuinely different approach"]
      error_paths: ["proposeCandidate or checkFn missing → throws"]

    - id: IF-PHASE-BUILD
      name: phase-build
      path: idearium/api/index.js
      description: "Idearium's phase build (▶ build): refuses without a graph (DG2, NO_GRAPH 409), runs the routing's route, writes each attempt to idearium_phase_runs (idearium/repo/phases.js RUN_TABLE)."
      exports: ["_phaseBuild(repo, dir, { map, phase, backend, agent, provider, note, replan, anyway, rebuild, startedBy }) → { ok, runId } | { ok: false, status, error }"]
      behavioral_contracts: ["each attempt is a row; a refusal is said with its code"]
      error_paths: ["NO_GRAPH, DAG_INVALID → refused"]

    - id: IF-COS-BRANCH
      name: cos-branch
      path: cos/foundation/snapshot.js
      description: "COS's SnapshotEngine(host, compartment): a compartment's state taken, restored or deleted; how an attempt is undone."
      exports: ["take(triggerEvent, opts) → snapshot", "restore(snapId)", "delete(snapId)", "list()"]
      behavioral_contracts: ["a restore puts the compartment back exactly as taken"]
      error_paths: ["no compartment → refused"]

    - id: IF-ECONOMY
      name: economy-router
      path: lib/economy/router.js
      description: "The learning router: per (jobType, provider) a Beta(1+ok, 1+bad) success posterior, latency and cost weight, from records."
      exports: ["scores(records, policy)", "choose(jobType, candidates, { policy, records, rand, allowed })"]
      behavioral_contracts: ["learns from records only; explores providers with few records"]
      error_paths: ["no records → the policy's default order"]

    - id: IF-INTELLIGENCE-SELF
      name: intelligence-self
      path: intelligence/routes.js
      description: "Intelligence's self-improvement routes: POST /api/intelligence/rfr2/forge/patch (a minimal targeted patch for a module, routed through RAID), GET /api/intelligence/synthesis/fill (gaps by leverage per unit of work), POST /api/intelligence/mastermind/patterns (recurring causal shapes), GET /api/intelligence/failures, POST /api/intelligence/adversarial (the inner critic)."
      exports: ["POST /api/intelligence/rfr2/forge/patch { src, instruction, moduleName }", "GET /api/intelligence/synthesis/fill", "POST /api/intelligence/mastermind/patterns", "GET /api/intelligence/failures", "POST /api/intelligence/adversarial"]
      behavioral_contracts: ["reached through Intelligence's routes; RAID decides (§9.1)"]
      error_paths: ["Intelligence down → said; nothing self-applies without it"]

  modules:

    - id: MOD-OP-PIVOT
      name: method-pivot
      uuid: nexus-outperform-pivot-v1-0000-2026-1101-001
      path: lib/pipeline-routing.js
      phase: OP1_innovate_the_method
      description: >-
        pivot(records, policy) → PivotDecision. Reads the phase's attempt rows in order; when the same failure class repeats pivotAfter
        times (default 3, a setting), the next attempt carries a changed ask — lib/emergence.js's pivot prompt with the failures named —
        instead of only the next provider. The phase build calls it before each retry.
      deps: [{ name: pipeline-routing }, { name: emergence }, { name: phase-build }]
      schema_refs: [PivotDecision]
      exports: ["pivot(records, policy) → PivotDecision"]
      gate_pipeline: ["GATE-OP1-001: records → consecutive same-class count", "GATE-OP1-002: ≥ pivotAfter → ask from the pivot prompt, failures named", "GATE-OP1-003: the decision is a flight-data row"]
      behavioral_contracts: ["a pivot changes what is asked; a provider change alone is not a pivot", "pivotAfter is a setting, never hidden"]
      error_paths: ["no classes on the rows → { pivot: false, why: 'no failure classes recorded' }"]
      acceptance: ["a fixture phase whose first method always fails its test: three same-class failures, then a pivot attempt with the changed ask, and its flight row"]

    - id: MOD-OP-FRONTIER
      name: frontier-roles
      uuid: nexus-outperform-frontier-v1-0000-2026-1101-001
      path: lib/pipeline-routing.js
      phase: OP2_guardian_as_the_frontier
      description: >-
        frontierFor(stage, records, policy) → { use, role, why }. In the system arm a frontier model (Claude, ChatGPT, Gemini through
        Guardian's POST /command) is used only as: plan (once per phase, before local models write), repair (after a cheap check failed and
        a pivot did not land), or judge (when candidates pass equally and disagree). Every call names its role and why; the count is the
        arm's frontier cost.
      deps: [{ name: pipeline-routing }, { name: guardian-command }, { name: flight-data }]
      schema_refs: [ArenaRun]
      exports: ["frontierFor(stage, records, policy) → { use, role, why }"]
      gate_pipeline: ["GATE-OP2-001: stage → allowed role or none", "GATE-OP2-002: repair only after a failed check and a failed pivot", "GATE-OP2-003: call through Guardian's route; record role, why, jobId"]
      behavioral_contracts: ["no frontier call without a role and a why (OP-003)", "Guardian is reached through its route (OP-005)"]
      error_paths: ["Guardian has no tab for the provider → the stage falls back to local, said, and counted as a frontier miss"]
      acceptance: ["a phase whose local attempts fail their check: one plan call, then one repair call naming the failed check, both in the flight data"]

    - id: MOD-OP-CANDIDATES
      name: candidates
      uuid: nexus-outperform-candidates-v1-0000-2026-1101-001
      path: idearium/repo/candidates.js
      phase: OP3_many_cheap_tries
      description: >-
        write(phase, n, opts) → Candidate[]. N local-model attempts from the same start: a COS snapshot is taken first; each candidate is
        written in its own working copy when the compartment allows copies (in parallel), else in turn with a restore between (said which).
        Each runs the visible tests; the one that passes most lands (ties: fewest changed lines); the rest are discarded and counted as spent.
        N is a setting (default 3).
      deps: [{ name: phase-build }, { name: cos-branch }, { name: flight-data }]
      schema_refs: [Candidate]
      exports: ["write(phase, n, opts) → { chosen: Candidate|null, all: Candidate[] }"]
      gate_pipeline: ["GATE-OP3-001: snapshot the start; n working copies (or n turns with a restore between)", "GATE-OP3-002: each candidate → visible tests in its branch", "GATE-OP3-003: choose; discard the rest; record all n"]
      behavioral_contracts: ["the real tree is touched only by the chosen candidate's promotion", "every candidate's cost is counted"]
      error_paths: ["none passes → one failed attempt carrying every candidate's failures"]
      acceptance: ["N=5 on a fixture phase with exactly one passing candidate: that one lands, four counted as spent"]

    - id: MOD-OP-SUITE
      name: arena-suite
      uuid: nexus-outperform-suite-v1-0000-2026-1101-001
      path: idearium/arena/suite.js
      phase: OP4_the_suite
      description: >-
        suite(repo, opts) → ArenaTask[]. The tasks are an Idearium repo's own phases that have a spec, a graph and tests (nexus/emerge first:
        its modules, its bench tasks). Hidden tests are a held-back share of each task's tests (default one in three), sealed by hash.
      deps: [{ name: phase-build }]
      schema_refs: [ArenaTask]
      exports: ["suite(repo, { hiddenShare, limit }) → ArenaTask[]", "seal(task) → hash"]
      gate_pipeline: ["GATE-OP4-001: phases with spec + graph + tests", "GATE-OP4-002: split tests, seal hidden by hash", "GATE-OP4-003: refuse what lacks any, said"]
      behavioral_contracts: ["the same suite (by seal) for every arm (OP-001)"]
      error_paths: ["a repo with fewer than 10 eligible phases → the suite says so"]
      acceptance: ["nexus/emerge yields ≥ 10 sealed tasks; a task without tests is listed as refused"]

    - id: MOD-OP-RUN
      name: arena-run
      uuid: nexus-outperform-run-v1-0000-2026-1101-001
      path: idearium/arena/run.js
      phase: OP5_the_arms
      description: >-
        run(task, arm) → ArenaRun. frontier-alone: one frontier provider through Guardian, prompted with the spec and visible tests, its
        reply applied from a snapshot, retried as a person would (up to the time limit). system: Idearium's phase build with local-first, the
        pivot (MOD-OP-PIVOT), candidates (MOD-OP-CANDIDATES) and frontier roles (MOD-OP-FRONTIER). Both read back through the flight recorder.
      deps: [{ name: phase-build }, { name: guardian-command }, { name: flight-data }, { name: phase-cost }, { name: cos-branch }]
      schema_refs: [ArenaRun, Arm, ArenaTask]
      exports: ["run(task, arm, opts) → ArenaRun"]
      gate_pipeline: ["GATE-OP5-001: same start (spec, visible tests, limit, tools)", "GATE-OP5-002: build from a snapshot; restore after", "GATE-OP5-003: read the run from records only"]
      behavioral_contracts: ["no arm sees hidden tests", "a run that does not finish is recorded as not finished"]
      error_paths: ["Guardian down → frontier-alone run recorded as not started, said; the suite does not drop the task"]
      acceptance: ["one task through both arms on a fixture: two ArenaRuns, every number pointing at its record"]

    - id: MOD-OP-SCORE
      name: arena-score
      uuid: nexus-outperform-score-v1-0000-2026-1101-001
      path: idearium/arena/score.js
      phase: OP6_the_verdict
      description: >-
        score(runs) → ArenaScore. Hidden tests run on each landed change; per arm: finished, hidden pass rate, frontier calls, local calls,
        tokens, wall time, waste. Verdict: system-better only with hidden pass rate ≥ frontier's and fewer frontier calls over ≥ 10 tasks;
        every task the system lost named.
      deps: [{ name: flight-data }, { name: phase-cost }]
      schema_refs: [ArenaScore, ArenaRun]
      exports: ["score(runs) → ArenaScore"]
      gate_pipeline: ["GATE-OP6-001: hidden tests per landed change", "GATE-OP6-002: per-arm totals from records", "GATE-OP6-003: verdict by the rule; losses listed"]
      behavioral_contracts: ["the rule is fixed before the run (OP-004)", "a loss is never dropped"]
      error_paths: ["< 10 finished → not-enough-tasks"]
      acceptance: ["a fixture of runs where the system wins on pass rate but spends more frontier calls → even, said why"]

    - id: MOD-OP-DOOR
      name: arena-door
      uuid: nexus-outperform-door-v1-0000-2026-1101-001
      path: idearium/api/arena.js
      phase: OP7_the_screen
      description: >-
        Idearium's routes GET /api/arena/suites, POST /api/arena/run, GET /api/arena/score/:suite; the command rows arena suite | run |
        score; a screen in Idearium (and a panel in COS's Emergence page) with the two columns side by side and each loss named.
      deps: [{ name: phase-build }]
      schema_refs: [ArenaScore]
      exports: ["GET /api/arena/suites", "POST /api/arena/run { repo, arms }", "GET /api/arena/score/:suite"]
      gate_pipeline: ["GATE-OP7-001: route → module", "GATE-OP7-002: command rows build the same calls", "GATE-OP7-003: the screen reads only the routes"]
      behavioral_contracts: ["agents get the same rows (nexus.command)", "the screen says not-enough-tasks plainly"]
      error_paths: ["a run already going → 409 with its id"]
      acceptance: ["driven in Clear Glass: a suite run, the score shown, a loss named"]

    - id: MOD-OP-LEARN
      name: arena-learn
      uuid: nexus-outperform-learn-v1-0000-2026-1101-001
      path: idearium/arena/learn.js
      phase: OP9_it_learns
      description: >-
        learn(run) → LearningPoint[]. After every scored run, what held is written back where the system already learns: the economy
        router's records (which provider lands which job type), a crystal per method that held (Intelligence's crystals), the component
        store's reuse counts, and the pivot asks that worked (so the next pivot starts from them). What failed weakens what it rested on.
      deps: [{ name: economy-router }, { name: intelligence-self }, { name: flight-data }]
      schema_refs: [LearningPoint, ArenaRun]
      exports: ["learn(run) → LearningPoint[]", "lessonsFor(jobType) → LearningPoint[]"]
      gate_pipeline: ["GATE-OP9-001: only held changes teach a method", "GATE-OP9-002: write to the existing learners (records, crystals, reuse), never a new store", "GATE-OP9-003: a later failure weakens, never deletes"]
      behavioral_contracts: ["learning is counting what held, not training a model; every lesson names its run"]
      error_paths: ["a learner down → the lesson waits in the run's record, said"]
      acceptance: ["two runs of the same job type: the second chooses the provider and method that held in the first, and its flight data shows fewer wasted calls"]

    - id: MOD-OP-SELF
      name: arena-self-improve
      uuid: nexus-outperform-self-v1-0000-2026-1101-001
      path: idearium/arena/self.js
      phase: OP10_it_improves_itself
      description: >-
        improve() → proposals. The arena's own losses and the system's waste become work on the system itself: Intelligence's synthesis
        ranks the gaps behind them by leverage; the top one becomes a phase of Nexus's own map (phased only, his rule); it is built by the
        same pipeline (local first, pivots, candidates, frontier only on a failed check), proposed through RAID, applied only through
        nexus-self apply with Versionium's record. The suite is then re-run: an improvement counts only if the frozen suite's metrics improve.
      deps: [{ name: intelligence-self }, { name: phase-build }, { name: flight-data }]
      schema_refs: [ArenaScore]
      exports: ["improve({ maxPhases }) → { proposed: [{ phase, gap, why }], applied: [], measured: { before, after } }"]
      gate_pipeline: ["GATE-OP10-001: gaps from losses and waste, ranked by synthesis", "GATE-OP10-002: each becomes a phase with spec and graph before code", "GATE-OP10-003: RAID decides; applied through nexus-self apply; recorded in Versionium", "GATE-OP10-004: the frozen suite re-run; no improvement → rolled back, said"]
      behavioral_contracts: ["it never edits itself outside a phase, RAID and Versionium", "an improvement is a measured one on the frozen suite, never the suite it was tuned on"]
      error_paths: ["RAID refuses → the proposal stays, with its why", "the re-run is worse → rewind, the attempt kept as a lesson"]
      acceptance: ["a fixture loss whose cause is a missing reuse entry: the gap is ranked, a phase written, built, applied, and the frozen suite's cost drops"]

    - id: MOD-OP-CURVE
      name: arena-curve
      uuid: nexus-outperform-curve-v1-0000-2026-1101-001
      path: idearium/arena/curve.js
      phase: OP11_the_curve
      description: >-
        curve(suite) → points. The same frozen suite re-run on a schedule; each run's Metrics kept; the slope of each metric over time is the
        answer to "does it get better": quality up, cost per task down, waste down. Shown beside the frontier arm's flat line (a model
        alone does not learn between sessions). Guarded against fooling itself: hidden tests rotate from a sealed pool, the adversary
        (POST /api/intelligence/adversarial) checks each landed change, and a metric gained by breaking another is said as a trade.
      deps: [{ name: flight-data }, { name: intelligence-self }]
      schema_refs: [Metrics, ArenaScore]
      exports: ["curve(suite, { runs }) → { points: Metrics[], slopes, trades }"]
      gate_pipeline: ["GATE-OP11-001: frozen suite, rotated hidden tests from a sealed pool", "GATE-OP11-002: per-metric slope with its spread", "GATE-OP11-003: a gain in one metric with a loss in another said as a trade"]
      behavioral_contracts: ["a slope from fewer than 3 runs is not said as a trend"]
      error_paths: ["the pool runs dry → said; no reuse of seen tests as hidden"]
      acceptance: ["five scheduled runs of a fixture suite: slopes per metric, the trade named where one metric bought another"]

  events:
    arena:
      - "arena.pivot { phase, sameClass, ask }"
      - "arena.frontier { phase, role, why, provider, jobId }"
      - "arena.candidate { phase, id, visiblePass, chosen }"
      - "arena.run { task, arm, landed, hiddenPass }"
      - "arena.verdict { suite, verdict, why }"
      - "arena.lesson { task, method, provider, held }"
      - "arena.improve { phase, gap, applied, before, after }"

  enforcement:
    gates:
      - { id: GATE-OP-SAME-START, name: same-start, severity: fatal, check: "both arms' runs record the same spec hash, visible tests, limit and tools", on_failure: "run refused" }
      - { id: GATE-OP-FROM-RECORDS, name: from-records, severity: fatal, check: "every ArenaRun number names its record; estimates labelled", on_failure: "score refused" }
      - { id: GATE-OP-FRONTIER-WHY, name: frontier-why, severity: fatal, check: "every frontier call in the system arm has role and why", on_failure: "suite red" }
      - { id: GATE-OP-NO-CHERRY, name: no-cherry, severity: fatal, check: "the suite's seal at start equals the scored task list", on_failure: "score refused" }
      - { id: GATE-OP-NOT-ITS-OWN-JUDGE, name: not-its-own-judge, severity: fatal, check: "self-improvement is measured on a frozen suite with rotated hidden tests it never trained on", on_failure: "improvement not counted" }
      - { id: GATE-OP-DOORS, name: doors, severity: fatal, check: "no module requires guardian/ or ollama/ files; routes only", on_failure: "build failure" }

  tests:
    - "tests/modules/test-substrate-spec.test.js — this spec compiles at specDepth 1.0, no BLACK node, invariants valid"
    - "per module: its acceptance lines, each a named test in the phase that builds it"
