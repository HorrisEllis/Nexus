spec:
  meta:
    name:     code-tab-and-one-router
    version:  1.2.0
    date:     2026-10-05
    release:  0.39.345 (base)
    uuid:     nexus-code-tab-and-one-router-phasemap-v1-0000-2026-1005-jamesbrooks-001
    owner:    idearium (the Code tab, every model call) · copilot (who answers) · lib/pipeline-routing (the policy, the breakers) · ollama
    status:   "MAPPED 2026-10-05; CT1 done (0.39.347); CT2 done (0.39.348); CT3 done (0.39.349); CT4 done (0.39.350); CT5 done (0.39.351); CT6–CT8 done (0.39.352) — all eight phases built"
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
      "its just the code tab is meaningless. what about uncommited changes?" · 1.1.0, on the built Code tab: "i like it but,
      can we have this hooked into the plan and work surface panel" · 1.2.0, after building a phase from the backlog map:
      "the plan needs to only show current work. needs escalating retry logic and fallback routing. like if the 3b fails,
      switch to the 7b, then the 16b deepseek, then the agents. have all of this configurable." · "completely either need
      to clear or need a clear complete button. like i want to see the agents activity in the code tab, in real time. like
      maybe have a little dot blinking next to it"

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

    CT5_hooked_into_the_plan:
      layer: ui
      status: "DONE (0.39.351) — code-surface.js: csLoadPlan (the plan and runs as the Plan panel reads them), the plan strip (current step, its gates by plan-panel's _gateBar, the runs on the open file — each opens openPlanPanel({focus})), csChange (POST …/manage action edit: file, picked lines, his words, the card's chunk as related, the picked hop's backend/agent/model — build-surface.js manage now passes them to dispatch), codeSurfaceOnEvent (app.js calls it beside planPanelOnEvent). work-surface.js: 'open in Code' on every card (wsOpenInCode). plan-panel.js: a run's ledger files open in the Code tab. test-code-tab 13/13 (CT-03 the router, CT-20…23 in Clear Glass); the coding-flow probe's W3 counts the new button."
      james: '"i like it but, can we have this hooked into the plan and work surface panel"'
      depends_on: [CT3_the_code_tab_is_the_work_surface]
      files: [idearium/ui/js/code-surface.js, idearium/ui/js/plan-panel.js, idearium/ui/js/work-surface.js, idearium/ui/js/app.js, idearium/api/build-surface.js]
      found:
        - "the docked agent's send is a chat (POST …/agent/prompt): no snapshot, no run, nothing on the Plan; a change it writes appears only as a proposal"
        - "the Code tab does not follow the live events the Plan panel does (app.js → planPanelOnEvent only): a phase that lands a change leaves it stale"
        - "a work-surface card in the Plan panel cannot open its file in the Code tab; the Code tab shows nothing of the plan"
        - "Manage (POST …/manage) is already a run on the Plan: a Versionium snapshot first, the shadow expecting the file back, the run's ledger, the change as a work-surface card — it takes provider, not a picked model"
      pushback:
        - >-
          Not a second copy of the Plan inside the Code tab — two of the same panel drift. The Plan panel stays the one
          plan; the Code tab follows it (the current step and the runs on the open file, each opening the panel on itself)
          and both repaint from the same events and the same work-surface state.
        - >-
          Not every ask a run: a question about the code needs no snapshot. The docked agent keeps "ask" (an answer) and
          gains "change it" (a Manage edit of the open file, the picked lines — a run on the Plan).
      does: >-
        "change it" in the docked agent is a Manage edit (the open file, the picked lines, his words, the picked model):
        a snapshot, a run on the Plan, the Plan panel opened on that run, its change a diff card in both places. The Code
        tab repaints on the Plan's events (runs, manages, injects). Above the activity strip: the plan's current step
        with its gates, and the runs on the open file — each opens the Plan panel focused on it. A work-surface card, in
        the Plan panel or the Code tab, opens its file in the Code tab.
      proof: "driven in Clear Glass: change it → POST …/manage action edit with the lines and model, the Plan panel opens focused on the run; an event repaints the Code tab; a card's 'open in Code' switches tab with that file open"

    CT6_the_escalation_ladder:
      layer: library
      status: "DONE (0.39.352) — lib/pipeline-routing: sizeOf, ladder (written or derived), shouldEscalate, climb({ rungs, policy, attempt, onOutcome }), the tool-errors class (never a breaker), routing.escalate · escalation · escalate_on · retries_per_rung · max_tool_errors (config-core, Settings → Routing → Escalation ladder, GET /api/routing gives the ladder as it reads). lib/agent-tools runToolLoop: maxToolErrors stops an attempt (toolErrors); copilot and the repo agent carry the cap and hand toolErrors back. idearium _phaseBuild climbs through climb() when the call names no agent: each attempt its own fresh chat and row (rung, attempt, provider), each climb a row from → to with why, the last says every rung was tried. code_check reads path as paths; code_edit names the key it does not read. test-escalation-ladder 9/9. Not yet: 'unproven' (the proof's own retries) does not climb; an incomplete or failed attempt's partial proposals stay on the work surface for him to reject."
      james: '"needs escalating retry logic and fallback routing. like if the 3b fails, switch to the 7b, then the 16b deepseek, then the agents. have all of this configurable."'
      depends_on: [CT2_it_learns_and_switches]
      files: [lib/pipeline-routing.js, lib/agent-tools/index.js, copilot/tool-runtime.js, copilot/server.js, lib/repo-agent.js, idearium/api/index.js, idearium/lib/config-core.cjs]
      found:
        - "a phase build dispatches once: the repo's provider (or the door's first hop), no ladder; the proof retries the SAME agent on unmet conditions; an Ollama draft is reviewed by a guardian agent — none of it climbs to a stronger model"
        - "his run of BL30: the small model called code_edit eleven times with an invented argument shape (changes:[[716,761],…] for edits:[{old,new}]) and code_check with path for paths — every call failed and the loop kept going to its iteration cap"
        - "routing.* (config-core) already holds the chain, the Ollama models, fallback_on, attempts and breakers — the ladder belongs beside them"
      pushback:
        - >-
          "Bigger is better" is a default, not a law: the ladder is derived from routing.ollama_models ordered by the size
          in each model's name (3b < 7b < 16b), then the chain's agents — and routing.escalation, if he writes one, is the
          ladder exactly as written.
        - >-
          Escalating needs a sign the model is not up to it, not only a crash: failed, blocked, incomplete (the file never
          came back) — and tool-errors: N failed tool calls in a row end the attempt (routing.max_tool_errors, default 3),
          so a model looping on a tool it cannot drive stops at 3, not 11. A tool-errors end never opens a breaker.
        - >-
          code_check given `path` where it takes `paths` is unambiguous and is accepted; code_edit given `changes` in an
          invented shape is not guessed at — that is what the ladder is for.
      does: >-
        A phase build climbs a ladder: routing.escalation (or derived: the Ollama models smallest first, then the chain's
        agents). Each rung gets routing.retries_per_rung attempts; an outcome in routing.escalate_on (default failed,
        blocked, incomplete, tool-errors) moves to the next rung in a fresh chat, the row on the Plan saying from what, to
        what, and why. Every rung's outcome teaches the door. routing.escalate turns it off. All in Settings → routing.
      proof: "a stand-in 3b that fails its tools three times is stopped and the phase moves to the 7b, then to an agent when the 7b fails; the Plan's ledger names each climb; with routing.escalation written, that order is used"

    CT7_the_plan_shows_current_work:
      layer: ui
      status: "DONE (0.39.352) — plan-panel.js: tasks show what is not complete; complete steps and complete sections fold into '✓ N … complete — show' (hidden, never deleted; remembered in this browser); the ledger names each rung and a stop on tool errors. test-code-tab CT-30; the build-surface probe's BS9→BS11 counts the fold."
      james: '"the plan needs to only show current work." · "completely either need to clear or need a clear complete button."'
      depends_on: [CT5_hooked_into_the_plan]
      files: [idearium/ui/js/plan-panel.js]
      pushback:
        - "Hidden, not deleted (§0.3): complete steps and sections fold into one line with a count; one click shows them again."
      does: >-
        The Plan panel shows what is building, next, stopped or waiting; complete steps and complete sections fold into
        "N complete — show"; a code build whose every section is complete is one line. The choice is remembered.
      proof: "driven in Clear Glass: a plan with 30 complete and 2 open steps shows the 2 and '30 complete'; show / hide toggles them"

    CT8_live_agent_activity:
      layer: ui
      status: "DONE (0.39.352) — runToolLoop onToolCall (running, then ok / failed); copilot tool-runtime toolEventSink posts each to the caller's progressUrl, loopback only; the repo agent sends idearium's (setToolEventSink at listen); idearium POST /api/repos/:uuid/agent/tool-event broadcasts idearium.repo.agent.tool and keeps the last 80 per repo (GET …/tool-events). The Code tab: the call running in the activity header with a blinking dot, the file it names blinking in the tree, live calls ✓ / ✗ in activity — only the tree and the strip repaint. test-escalation-ladder EL-03…06, test-code-tab CT-31."
      james: '"i want to see the agents activity in the code tab, in real time. like maybe have a little dot blinking next to it"'
      depends_on: [CT5_hooked_into_the_plan]
      files: [lib/agent-tools/index.js, copilot/server.js, lib/repo-agent.js, idearium/api/index.js, idearium/ui/js/code-surface.js]
      found:
        - "the tool calls reach idearium only when the whole run returns (toolCallLog on the reply, kept on the run row) — nothing while it works"
      does: >-
        Each tool call is reported as it starts and as it ends: the loop calls onToolCall, copilot posts it to the
        caller's sink (loopback only), idearium emits idearium.repo.agent.tool and keeps the last calls per repo. The
        Code tab's activity shows them live: a blinking dot on the call running, ✓ or ✗ when it ends, and a blinking dot
        beside the file it is reading or editing in the tree.
      proof: "with a stand-in loop: a call shows blinking while it runs and ✓ / ✗ after, without a reload; the file it names blinks in the tree"
