spec:
  meta:
    name:     code-tab-and-one-router
    version:  1.0.0
    date:     2026-10-05
    release:  0.39.345 (base)
    uuid:     nexus-code-tab-and-one-router-phasemap-v1-0000-2026-1005-jamesbrooks-001
    owner:    idearium (the Code tab, every model call) · copilot (who answers) · lib/pipeline-routing (the policy, the breakers) · ollama
    status:   "MAPPED 2026-10-05; CT1 done (0.39.347); CT2 done (0.39.348); CT3 done (0.39.349); CT4 done (0.39.350) — all four phases built"
    voice: >
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim. `does:` is the coder's
      reading, his to correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    axioms:   docs/AXIOMS-v3.1.md — §3.3 map before build, §8.6 reuse before build, §10.3 one source of truth, §1.2 nothing
              silently fails, §4.1 UI tested in Clear Glass.
    origin: >
      James, 2026-10-05: "okay. begin. wait can we do the code tab first? make sure ollama is all wired into idearium." ·
      "yes, all work needs to be mapped to a spec file, then into phases, then added to the plan." · "i feel like it should
      use copilot regardless, have copilot figure it, and learn from it. failure modes, dynamically switch models, if its
      not equipped for the task, which i feel like raid is wired to do, agent switching and routing?"
      Earlier, on the same surface: "the code tab the agent tab, work surface, like full activity, enterprise grade?" ·
      "its just the code tab is meaningless. what about uncommited changes?"

  found:
    - >-
      Three routers already: copilot (its default provider, GET /api/prompt/resolve, its autonomy router and intent
      learning); cortex/core/raid/router.js — which SYSTEM fulfils a request (raid.route.request → decided → fulfilled),
      not which model; lib/pipeline-routing.js — the build's model policy: fixed · chain · local-first · economy, failure
      classes (empty, truncated, refused, timeout, provider-down, rate-limit, login), shouldFallback, a breaker per
      provider, and learned routing (routing.learned).
    - >-
      Ollama in idearium: the Agent tab — yes, a model per repo; the spec engine's sections — yes (per block, ollama
      fallback, routes may name ollama:<model>); code generation (warp-build-dispatch) — yes. The workshop, the architect,
      the void and deliver ask through one helper (idearium/api _agentAsk): it follows the global default provider and
      never passes a model, so those pages get the bridge's default model or no Ollama at all.
    - >-
      The Code tab is search and chunk cards (renderRepoCode). The work surface — every file the agent changed, its diff,
      Apply / Reject / Revert / Promote (idearium/ui/js/work-surface.js, W3) — lives under the Plan panel, not in the Code
      tab. Uncommitted changes in the compartment (the shadow space, SB29) are not shown greyed anywhere.
    - >-
      The Plan panel reads every phasemap (docs/*-phasemap.spec) — a map written is a map in the plan.

  pushback:
    - >-
      Not a fourth router. Copilot becomes the one door for "which model"; lib/pipeline-routing.js is the policy behind it
      (classes, breakers, chain, learned); RAID keeps routing between systems. One place decides; every caller asks it.
    - >-
      "Not equipped for the task" is the hard part: the failure classes catch empty, cut, refused, slow, down — not a
      wrong answer. The signals that say a model was not up to it are the verifiers: a constraint broken, a test failed,
      the seam detector, his dismissal. Those feed the learning, or it learns only from crashes.
    - >-
      Copilot's plain /api/prompt adds copilot's own context (user model, history, recall). Since 0.39.258 a repo agent
      asks copilot WHO answers and sends its own composed prompt there. The coder keeps that split — copilot decides who,
      the caller decides what is sent — unless he wants copilot's context in every prompt too.
    - >-
      Ollama cannot run in the coder's container: wiring is proven here against a stand-in bridge; his real models are
      checked on his machine by a route that asks each one a one-line question.

  phases:
    CT1_one_door_for_models:
      layer: library
      status: "DONE (0.39.346–0.39.347) — lib/model-door.js serves lib/pipeline-routing's learned policy at copilot (POST /api/route, /api/route/outcome). Every caller goes through it: the pages (_agentAsk), the repo agent (the copilot position takes provider and model from the door; Ollama with no repo model gets the door's; a copilot-routed answer that fails in a fallback class moves to the next hop, switchedFrom), and the spec build (the route from the door, the local plan only when copilot cannot be reached — routeVia says which; each hop reported to the door, no second breaker). test-model-door 6/6, test-pipeline-routing 19/19 (PR-24 updated to the door)."
      james: '"i feel like it should use copilot regardless, have copilot figure it"'
      depends_on: []
      files: [copilot/server.js, lib/pipeline-routing.js, lib/repo-agent.js, idearium/api/index.js]
      does: >-
        Every model call idearium makes asks copilot which model answers, with the task: its kind (chat, a spec block, a
        code chunk, a review, the void), its size, whether it needs tools. Copilot answers from pipeline-routing's policy,
        the breakers, and what has worked for that kind — a provider AND a model (an Ollama model by name). _agentAsk
        (workshop, architect, void, deliver), the repo agent, the spec engine and the build all go through it; the pages
        get an Ollama model, not the bridge's default.
      proof: "each of the six callers asks copilot and sends to the provider and model it names; with a stand-in bridge every one reaches Ollama with the model copilot chose"

    CT2_it_learns_and_switches:
      layer: library
      status: "DONE (0.39.348) — the switch on a cut/empty/timeout answer came with CT1 (switchedFrom, every hop sent back). CT2 adds the verifiers' word: lib/pipeline-routing VERDICTS (test-failed · dismissed · constraint) are recorded for that kind of job and never open a breaker; model-door outcome({verdict:true}) skips the breaker; idearium sends them — the prove loop's failing file → test-failed for the model that built it (the last ok hop of the chunk's route), a proven build → ok for each, a workshop draft dismissed → dismissed, accepted → ok. NOT YET: constraint verdicts (no station checks Emerge constraints until RS4); the seam detector's word. test-model-door 8/8 (MD-07, MD-08)."
      james: '"and learn from it. failure modes, dynamically switch models, if its not equipped for the task"'
      depends_on: [CT1_one_door_for_models]
      files: [lib/pipeline-routing.js, lib/economy/router.js, copilot/server.js]
      does: >-
        Every answer's outcome goes back to copilot: ok, its failure class, and the verifiers' word (a constraint broken,
        a test failed, the seam detector, accepted or dismissed by him). A class that means the model was not up to it
        moves the same task to the next model at once, recorded; over time the kind of task goes first to what has done
        it well. Every switch is said.
      proof: "a stand-in model that returns a cut answer is switched for the next and the answer completes; after N such outcomes that kind of task goes to the better model first; the record names each switch"

    CT3_the_code_tab_is_the_work_surface:
      layer: ui
      status: "DONE (0.39.349) — idearium/ui/js/code-surface.js, built from what existed: the files with file-manage's states (modified · new marked, pending greyed, a waiting diff dotted, 'changed only'); the open file with each chunk (code-api outline) marked where it starts, a chunk's card (code-api chunk) on the right; work-surface's diff cards with Apply / Reject for the open file, or all of them with none open; the agent docked — the model copilot's door would choose (new GET /api/repos/:uuid/agent/route; a provider set in Settings is said as pinned, the door not asked), any other hop picked is sent with its backend and model (agent/prompt now passes model), the open file and picked lines as context, the reply naming who answered; activity (tool calls, changes) folds along the bottom. test-code-tab 8/8, six of them driven in Clear Glass. Not here: editing the text by hand stays in the Files tab; the docked agent keeps no history of its own (the Agent tab's history is the record)."
      pushback_built: >-
        He said "the code tab the agent tab". The Agent tab stays: its history, late replies, approvals and settings are a
        whole surface, and folding it in would make the Code tab the clutter he did not want. The Code tab docks a lean
        agent that asks the same agent through the same route; the Agent tab keeps the record.
      james: '"the code tab the agent tab, work surface, like full activity, enterprise grade?" · "its just the code tab is meaningless. what about uncommited changes?"'
      depends_on: [CT2_it_learns_and_switches]
      files: [idearium/ui/js/app.js, idearium/ui/js/work-surface.js, idearium/repo/work-surface.js]
      does: >-
        The Code tab becomes where the work is: the files on the left (uncommitted ones greyed, as in the Files tab); the
        file in the middle with each chunk's card beside it (what it uses, what uses it, its tests); the agent's changes
        as diffs with Apply / Reject; the agent docked, answering through copilot, the model it chose shown and
        changeable. Search stays. Activity is one strip you can fold.
      proof: "driven in Clear Glass: an agent change shows greyed in the tree and as a diff; Apply writes it; the docked agent names the model copilot chose"

    CT4_ollama_checked_on_his_machine:
      layer: ui
      status: "DONE (0.39.350) — Settings → Models (idearium/ui/js/ollama-check.js over lib/ollama-check.js; GET /api/ollama/check, POST /api/ollama/check/ask). The bridge and copilot's door: reached or not, and why. Every installed model asked 'Reply with the single word: ready' through copilot's /api/prompt (backend ollama, the model named), one at a time, each answer with its time or its failure. Every caller (void, workshop, architect, deliver, the repo agent in the copilot position and on Ollama with no model, a spec section, a code file) with the route the door gives it: who answers first, its Ollama hops, a model not installed, Ollama not in the route, no route at all. A probe does not teach the door. Found on the way: the bridge's GET /api/models answered ok with [defaultModel] when Ollama's list could not be parsed — fixed to say so. test-ollama-check 8/8 (three in Clear Glass). On his machine, his real models are the proof: open Settings → Models, ask every model."
      james: '"make sure ollama is all wired into idearium."'
      depends_on: [CT1_one_door_for_models]
      files: [idearium/api/index.js, idearium/ui/js/repo-settings.js]
      does: >-
        A check in Settings: every installed Ollama model asked a one-line question through copilot, each caller's route
        shown (which model it would use, whether it answered). What is not wired says so.
      proof: "with a stand-in bridge: every model listed and answered; a missing bridge is said, not a blank"
