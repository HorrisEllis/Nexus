spec:
  meta:
    name:     one-model-engine
    version:  1.0.0
    date:     2026-10-09
    release:  0.52.0 (base)
    uuid:     nexus-one-model-engine-phasemap-v1-0000-2026-1009-jamesbrooks-001
    owner:    lib/pipeline-routing (the engine and its policy) · copilot (the door) · cortex/core/raid (health, record, verify) · idearium (the callers)
    status:   "MAPPED 2026-10-09, before building; supersedes the separate retry loops (phase ladder, page fallback, chunk hops); goes ahead of RS1"
    voice: >
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim. `does:` is the coder's
      reading, his to correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    axioms:   docs/AXIOMS-v3.1.md — §1.1 nothing pretends, §1.2 nothing silently fails, §8.6 reuse before build, §10.3 one routing brain, §3.3 map before build
    origin: >
      James, 2026-10-09: "Wait. I meant idearium needs escalating retry logic, and fallback routing. I wasn't talking the
      phasemap. Your aren't fragmenting everything are you?" — the CT6 ask ("needs escalating retry logic and fallback
      routing. like if the 3b fails, switch to the 7b, then the 16b deepseek, then the agents. have all of this
      configurable.") was for every model call Idearium makes; it was built for phase builds only. Then, on a ChatGPT
      review of the plan ("Unify the retry mechanism, not the definition of failure"): "Perfect. Add to map. What about
      hooking in raid?"
  found:
    - "phase builds (idearium/api _phaseBuild) climb the ladder: PRt.climb, routing.escalation · escalate_on · retries_per_rung · max_tool_errors"
    - "the pages — workshop, architect, void, deliver (idearium/api _agentAsk) — take copilot's route and fall to the next hop only on fallback_on classes; no retry, no climb on a bad answer"
    - "spec-engine chunk builds (idearium/spec-engine/chunk-dispatch.js, speceng.build) walk their own hops: max_hops · attempts_per_hop; their default provider comes from RAID decideForContract"
    - "the Code tab agent chat (repo.agent.prompt) is one dispatch, one try; the reviewer (_reviewDraft) one provider; proof retries (_provePhase) the same agent each time"
    - "three settings groups overlap and mean different things: retries_per_rung counts tries before climbing, attempts_per_hop counts verified attempts on a provider, max_hops caps providers"
    - "the loops nest and multiply: proof attempts × chunks × rungs × retries_per_rung — each bounded, the product unbounded by any one budget"
    - "three things choose a model: copilot's door (lib/model-door → pipeline-routing plan, learning persisted in the economy ledger), RAID _decide / decideForContract (cortex/core/raid, its own weight table in memory, lost on restart), lib/agent-router.js (CA5 intent → agent, CA6 routing_config rows)"
    - "RAID's spec and its code disagree: raid.spec LAW_I says Ollama always first, LAW_III Claude always last; _decide since 2026-09-02 puts ChatGPT first, Gemini its fallback (§DEFAULT-AGENT-CHANGE)"
    - "RAID already has what the engine lacks: a health poll per agent (_pollHealth), a decision ledger persisted to cortex (raid_decisions), the verification spine (raid.verify: constitution gate → isolation → drift → contract compare), the tool approval gate"
    - "guardian/lib/dispatch-ladder.js is a TRANSPORT ladder (mesh → repair selectors → userscript NCP → the person) for one browser agent — a layer below choosing the model"
    - "RAID's drainer (cortex/core/raid/worker.js) ticks every 15 s: contract-intake processNext() takes the next queued contract whose dependsOn have passed, runs it, and on failure applies onFail — retry (default maxRetries 2, James 2026-09-03: \"we need all files in raids drainer with a retry logic if it fails\"), fallbackAgent (re-queue to another agent), or halt; persisted in JAA, so it survives a restart"
    - "idearium has its own drainer (_startBuildQueuePoller, every 15 s, James 2026-09-06: \"it needs to start the queue each boot\"): it re-posts spec builds, which run chunk-dispatch's own verification retry ladder"
    - "so retries nest a level further: drainer retries × chunk-dispatch's ladder × hops; and onFail fallbackAgent is a second, one-step model ladder beside the engine's"
    - "attempts are recorded three ways: idearium_phase_runs rows, the economy ledger, _agentAsk's route list — no one shape"
  pushback:
    - >-
      Unify the mechanism, not the meaning of failure (ChatGPT's line, agreed). One engine; each caller says what an
      acceptable output is and which failures it may retry or climb on.
    - >-
      One brain, not a new one. The engine is the existing climb() in lib/pipeline-routing, run behind copilot's door
      (CT1: "it should use copilot regardless, have copilot figure it, and learn from it"). An Idearium-side engine that
      also picks models would be a fourth router.
    - >-
      RAID: hook in what it is good at, not its queue. Its health, its decision record and its verify spine join the
      engine; its contract queue (contract-intake, "doesn't run instantly") is for queued work, never for a page or a
      chat waiting on an answer. Its model choice (_decide) and the door's (plan) become one — see ME5's decide.
    - >-
      Guardian's dispatch ladder stays: it delivers a prompt to one browser agent. Its outcomes come back classified
      (transport: login, captcha, mesh down) so the engine climbs on them; it is not merged into the model ladder.
    - >-
      Legacy settings are translated with a stated precedence and an end date — keeping three behaviours forever under
      one name would keep the fragmentation.
    - >-
      Chat never quietly switches model on a weak answer: a hard failure falls back and the reply names who answered;
      climbing on quality is opt-in per caller.
    - >-
      The drainer is the time axis, the engine the model axis. A did-not-run failure (provider down, rate-limited,
      login) is often better retried LATER than climbed NOW: the drainer's re-queue is that. Invalid output climbs now.
      So queued work runs each drain tick through the engine, and the drainer re-queues only what the engine marks
      "retry later" — never a second model ladder (fallbackAgent becomes a climb), never outside the job's budget.
    - >-
      RS1's recorder stays in RS1: this map gives it one attempt record to read, nothing more.
  phases:
    ME0_every_model_call_found:
      layer: library
      status: OPEN
      james: '"Your aren''t fragmenting everything are you?"'
      depends_on: []
      files: [docs/2026-10-09-one-model-engine-phasemap.spec]
      does: >-
        The inventory, in this map, of every place that asks a model — direct and indirect: idearium (_phaseBuild,
        _provePhase, _reviewDraft, _agentAsk and its pages, repo.agent.prompt, speceng.build / chunk-dispatch, warp
        cascade), copilot (its own /api/prompt fallback, adaptive-fulfillment, assist-loop, repair-on-prompt,
        autonomous-repair), guardian (dispatcher, dispatch-ladder), cortex (RAID decideForContract, officiator). Each
        with: who chooses the model, what retries, what is recorded.
      proof: "the list matches a scan for /api/prompt, RA.dispatch, raid decide calls and provider SDK calls; nothing found by the scan is missing from the list"
    ME1_one_failure_list:
      layer: library
      status: OPEN
      james: '"Thoughts? ChatGPT." — "Perfect. Add to map."'
      depends_on: [ME0]
      files: [lib/pipeline-routing.js]
      does: >-
        One list of failure classes in four kinds — did not run (provider-down, timeout, login, rate-limit, empty,
        truncated, tool-errors), invalid output (the caller's check failed: no file changed, unparseable, a missing
        planned file, blocked at its gate), weak but valid (opt-in only), verdict (test-failed, dismissed, constraint,
        a contract breach from raid.verify). classify(), VERDICTS and escalate_on read from it; every class names its kind.
      proof: "every class the code emits today maps to exactly one kind; an unknown class is 'unknown', said, never dropped"
    ME2_caller_policy:
      layer: library
      status: OPEN
      james: '"Perfect. Add to map."'
      depends_on: [ME1]
      files: [lib/pipeline-routing.js]
      does: >-
        A caller policy: { kind (job type), accept(output) → ok | invalid with why, climbOn: classes, retryOn: classes,
        stopOn, quality: off | on, budget }. Defaults per caller: a page accepts non-empty text; a build accepts a
        changed file; chat accepts any answer and climbs only on did-not-run; the reviewer accepts a verdict.
      proof: "the same failing model, under the chat policy and the build policy, falls back in one and climbs in the other, as each policy says"
    ME3_one_engine_one_budget:
      layer: library
      status: OPEN
      james: '"needs escalating retry logic and fallback routing … have all of this configurable."'
      depends_on: [ME2]
      files: [lib/pipeline-routing.js, lib/model-door.js, copilot/server.js]
      does: >-
        climb() is the engine: the rungs from copilot's route (the ladder, filtered by present()), the caller's policy
        deciding retry, climb or stop. A job carries one total attempt budget through every nested call (proof attempts,
        chunks, rungs); a nested climb spends from it and stops when it is gone, saying so.
      proof: "a phase with proof retries, two chunks and a three-rung ladder never makes more attempts than its budget; exhaustion is a row naming the budget"
    ME4_one_attempt_record:
      layer: library
      status: OPEN
      james: '"Perfect. Add to map."'
      depends_on: [ME3]
      files: [lib/pipeline-routing.js, lib/economy/ledger.js]
      does: >-
        Every attempt, from any caller, is one record shape: job and caller, the request's hash, the model, why it was
        chosen (route reason), attempt and rung, the class and its kind, the check's verdict, ms, the final outcome.
        Written by the engine (callers stop writing their own), into the economy ledger; idearium_phase_runs keeps its
        rows and carries the record. RS1 reads it.
      proof: "a page call, a chunk build and a phase build each leave records of the same shape; a did-not-run, an invalid output, a rejected valid output and an exhausted budget are told apart from the records alone"
    ME5_raid_hooked_in:
      layer: library
      status: OPEN
      james: '"What about hooking in raid?"'
      depends_on: [ME3, ME4]
      files: [cortex/core/raid/index.js, lib/pipeline-routing.js, lib/model-door.js, idearium/spec-engine/chunk-dispatch.js]
      does: >-
        (a) RAID's health poll is an availability source for present(): an agent RAID sees down is left off, said.
        (b) Every engine attempt is a RAID decision (recordDecision → raid_decisions), so RAID sees every model call.
        (c) raid.verify is a check a caller's policy can name for a consequential output (a build applied to files):
        its contract breach is a verdict class; chat and pages never pay for isolation.
        (d) One learner: RAID's in-memory weight table and the economy ledger become one — RAID reads the ledger's
        scores (persisted, weighted per HP4); recordOutcome writes the ledger.
        (e) One chooser: RAID decideForContract and the door's plan give the same answer for the same job (chunk-dispatch
        stops asking RAID separately).
      decide: >-
        Which is the brain — the door's plan (pipeline-routing: configured, persisted, tested) with RAID's _decide
        delegating to it, or RAID's _decide with the door asking it? The coder recommends the first: James's CT1 call put
        model choice behind copilot's door, and RAID's own spec calls it "the switchboard" for which SYSTEM fulfils a
        request — that stays RAID's (router.js), untouched. And LAW_I: Ollama first (raid.spec) or ChatGPT first (_decide
        since 2026-09-02)? The ladder today is Ollama smallest first, then the chain — his call which law stands.
      proof: "a model RAID's health marks down is skipped and said; every attempt appears in raid_decisions; RAID and the door name the same model for the same job; a build whose isolated verify breaches its contract climbs"
    ME10_the_drainers_run_the_engine:
      layer: library
      status: OPEN
      james: '"Doesn''t it have a drainer."'
      depends_on: [ME3, ME5]
      files: [cortex/core/raid/contract-intake.js, cortex/core/raid/worker.js, idearium/api/index.js, idearium/spec-engine/chunk-dispatch.js]
      does: >-
        RAID's drainer and idearium's build-queue drainer stay the way queued work runs (and survives a restart), and
        each drained attempt goes through the engine. The engine says per outcome: done, climb now, or retry later
        (did-not-run classes, with the time the provider says or a backoff); the drainer re-queues only "retry later".
        onFail fallbackAgent becomes the engine's climb; onFail maxRetries spends from the job's one budget. A phase
        build may be queued (run in the background, survives restart — HP2's interrupted runs become resumable) or
        awaited, the same engine either way.
      proof: "a contract whose provider is down is re-queued, not climbed, and runs on a later tick; one whose output is invalid climbs in the same tick; total attempts across drain ticks never exceed the budget; a restart mid-climb resumes from the queue"
    ME6_old_settings_translated:
      layer: library
      status: OPEN
      james: '"have all of this configurable."'
      depends_on: [ME3]
      files: [lib/pipeline-routing.js, idearium/lib/config-core.cjs, idearium/ui/settings.html]
      does: >-
        One settings group in Settings → Routing. fallback_on, max_hops and attempts_per_hop are read into the new
        policy with a written precedence (a new key set wins; else the old key, translated by its old meaning); Settings
        says which old key a value came from; the old keys carry an end date, after which they are only read, never shown. Backend, then GET/POST /api/routing, then the command row (idearium/cli/route-commands.js, so copilot and every agent have it), then the screen.
      proof: "each existing config gives the same attempts and fallbacks per caller before and after; a new key overrides an old one; Settings names the source"
    ME7_callers_moved:
      layer: api
      status: OPEN
      james: '"Wait. I meant idearium needs escalating retry logic, and fallback routing."'
      depends_on: [ME2, ME3, ME4, ME6]
      files: [idearium/api/index.js, idearium/spec-engine/chunk-dispatch.js, lib/repo-agent.js, copilot/server.js]
      does: >-
        One caller at a time, each keeping its tests green: the pages (_agentAsk), spec-engine chunk builds, the Code tab
        chat (repo.agent.prompt — hard failure falls back, the reply names who answered), the reviewer, proof retries
        (a fresh rung after the budget on one model), then phase builds onto the shared policy. Copilot's own fallback
        for /api/prompt becomes the engine's. Guardian's transport ladder reports its outcome classified.
      proof: "each caller's old tests pass; each now climbs per its policy; the Plan, the Code tab and the pages show climbs the same way"
    ME8_no_bypass:
      layer: library
      status: OPEN
      james: '"Your aren''t fragmenting everything are you?"'
      depends_on: [ME7]
      files: [tests/modules/test-one-model-engine.test.js]
      does: >-
        A test that fails when code outside the engine posts to copilot's /api/prompt, calls the repo agent's dispatch,
        or calls RAID's decide — except the engine itself and a named, reasoned allow-list in this map.
      proof: "adding a direct /api/prompt call anywhere fails the test, naming the file and line"
    ME9_across_callers:
      layer: library
      status: OPEN
      james: '"Perfect. Add to map."'
      depends_on: [ME7]
      files: [tests/modules/test-one-model-engine.test.js]
      does: >-
        One suite drives every caller through the same faults: a model not installed, a timeout, an empty answer, an
        invalid output, a valid output rejected by a verdict, an exhausted budget. Each caller does what its policy says
        and leaves the same record shape.
      proof: "six faults × every caller, each outcome as its policy says, each recorded"
