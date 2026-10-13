phasemap:
  name: gates-that-learn-and-priorities
  version: 1.0.0
  date: 2026-10-13
  origin: >-
    James (2026-10-13): "can you delete this architecture afrom idearium? dynamic routing to profiles in clearglass, which
    can hook into hats. each tab can beb a compartment or different profile. that way we can use multiaccount routing.
    each gate can route, diagnose, and retry also, failure modes and fault taxonomy to help nexus learn, and the agents
    learn. look at all the phases for idearium and everythign else that should be built as a priority. loop deep and
    recursive tests for all coding languages, quality checks, quality assurance checks, debugging, problem solving, gap
    detection, liminal space/shadow space, negative space, reasoning, gaps, ambiguity,, linguistics, traversal, systems
    thinking, coding, all domains that are relevant, including relationships, and finding underlying primitives across
    domains. gather all of those into a list for nexus. what do you think? chatgpt?" He pasted ChatGPT's answer on
    layered intent routing (classify intent → analyse the task → choose a strategy → select an agent → gate and learn).

  grounding: >-
    Most of this was already mapped, much of it in his own earlier words. This map adds no parallel plan. It indexes the
    phases that already own each ask and says what is new.
    - Profiles ↔ hats ↔ tabs: ID1_identities, TB1_tab_is_a_view and HM0 in
      docs/2026-10-13-identities-tabs-and-automation-phasemap.spec. His words there: "profiles with identity for account
      routing … ability to link to hats".
    - Gate diagnose/retry and learning: request spine RQ2, RQ3, RQ4 and RQ24 (docs/2026-10-12-request-spine-phasemap.spec),
      on top of cortex/self-heal/fault-taxonomy.js and lib/phase-faults.js.
    - ChatGPT's layered routing: RQ6_one_intent_map, plus what 0.60.8–0.60.18 built (reasoning-route, the model door,
      contract-adapters).
    - The domain list: cos/spec/check-catalogue.spec, where it now lives as section 13.

  decisions:
    - id: architect_removed
      james: '"can you delete this architecture afrom idearium?" (with a screenshot of THE ARCHITECT page: LAY OUT A SPEC / YOUR ARCHITECTURES)'
      chosen: >-
        The Architect page left Idearium:
        - removed from Create ▾, Build ▾, the welcome pillars and the workshop's stations;
        - ui/architect.html archived to ui/_archive/architect-0.60.18.html (§0.3);
        - openArchitect() now says it was removed.
        Kept: each repo's Architect TAB (its component registry), because the phase planner reads it through
        idearium/repo/architecture.js, and js/arch-canvas.js, which that tab draws with.
      reading: "The coder read 'this architecture' as the page in the screenshot, not the repo's registry tab. To confirm."
      files: [idearium/ui/index.html, idearium/ui/js/app.js, idearium/ui/js/workshop.js, idearium/ui/_archive/architect-0.60.18.html]
      status: DONE (0.60.19)
    - id: chatgpt_routing
      james: '"what do you think? chatgpt?"'
      coder_view: >-
        ChatGPT's frame is sound, and Nexus already holds most of it under other names:
        - classifyIntent is lib/intent-classifier.js plus reasoning-route assess;
        - planExecution is the contract (fromPhasePlan, shouldSplit, depends_on);
        - selectExecutor is the model door plus Boundaries plus byTabs (a tab must be open);
        - "gate and learn" is check() writing Boundaries and the door's outcome().
        Two of its points are not built yet, and they are the valuable ones:
        - Hard requirements are eligibility, not score. Nothing today stops a fast agent with no browser from being
          chosen for browser work.
        - Classify the failure before learning from it. 0.60.18's CP-04 proved this the hard way: one provider error
          capped a learned budget.
        Not adopted: a separate router or a fixed intent taxonomy. Its own advice is to extend, and his rule is reuse
        before build.
      chosen: "the coder's recommendation, to confirm: RT1 and GT1 below, folded into RQ6 and RQ2–RQ4 rather than beside them"

  phases:
    GT1_gates_route_diagnose_retry:
      status: OPEN
      folds: [RQ2_the_generation_failure_vocabulary_and_index, RQ3_repair_with_the_checks_own_words, RQ4_escalate_on_the_checks_and_keep_the_lesson, RQ24_the_gate_transaction]
      builds_on: "cortex/core/raid/contract-gates.js schedule/check · contract-adapters agentExecutor · cortex/self-heal/fault-taxonomy.js (raiseFriction, recordSuccess, recordAttempt) · lib/phase-faults.js modeOf · lib/model-door.js outcome({ verdict })"
      does: >-
        Every gate failure is classed before anything learns from it. The classes are transient, capability, context,
        spec, tool and verification (fault-taxonomy's classes, mapped).
        By class:
        - transient: retry, same agent, nothing learned.
        - context: split or a smaller packet; Boundaries learns.
        - capability: escalate to the next agent; the door's learned order learns.
        - spec or verification: the gate's own conditions are suspect; a question or gap, not a retry.
        - tool: unsupported; reported blocked.
        The retry carries the check's own words (RQ3). Each outcome writes fault-taxonomy friction, so the next route
        reads it.
      proof: "a planted failure of each class takes its own path; only capability and context failures change routing or budgets (extends test-contract-adapters)"
    RT1_eligibility_then_preference:
      status: OPEN
      folds: [RQ6_one_intent_map]
      builds_on: "lib/model-door.js route · lib/pipeline-routing.js byTabs · lib/agent-capability-profile.js · contract-adapters doorRoute"
      does: >-
        The route becomes two steps.
        1. Eligible: capability, tool access, context fit and availability are hard requirements. A failed one removes
           the agent, and the reason is said.
        2. Preference: among the eligible agents, the learned order.
        Every route records: reason, alternatives, confidence, fallback and verification. Low-confidence intent is split
        or asked about (CK-236).
      proof: "an agent without the browser tool is never routed browser work, whatever its score; the route record lists the alternatives it rejected and why"
    PF1_profiles_hats_tabs:
      status: OPEN
      is: [ID1_identities, TB1_tab_is_a_view, HM0_the_hat_keeps_a_model_of_the_repo]
      james_now: '"dynamic routing to profiles in clearglass, which can hook into hats. each tab can beb a compartment or different profile. that way we can use multiaccount routing."'
      adds: >-
        A tab names its profile, or its compartment. Routing a job resolves hat → profile → account → tab, and opens the
        tab in that profile's partition when none is open (the session-hub, 0.60.13, gives one session per provider
        today). CK-241 checks that the three agree.
      proof: "two hats on one provider answer from two accounts in two tabs at once; a job for hat A never lands in hat B's tab"
    QA1_the_catalogue_runs:
      status: OPEN
      folds: [CK1_the_catalogue_runs, RQ1_the_verifier_library, RQ18_test_and_attack_intents]
      does: >-
        lib/check-catalogue.js serves cos/spec/check-catalogue.spec: 119 checks; section 13 is his 2026-10-13 list of
        shadow, negative space, ambiguity, relationships, problem solving, recursion, all languages, reasoning,
        linguistics and primitives. Deterministic checks run first, at the gate stage they name. A contract gate can
        name a check by id ({ check: CK-nnn }); contract-gates runs CK-001, CK-002 and CK-060 today.
      proof: "a contract condition { check: CK-230 } passes on a settled shadow and fails on an open one"

  priority:
    note: >-
      This order is the coder's recommendation; his call. It runs from what makes every later phase cheaper to what
      depends on it.
    order:
      - "1. GT1: gates classify before they learn. 0.60.18 showed that learning from unclassified failures poisons routing. Every later build runs through gates."
      - "2. The live update-system run (CHANGELOG-0.60.18): the first real contract build on his machine, with Ollama. Nothing below should be built on an unproven pipeline."
      - "3. RT1: eligibility before preference. Cheap, since the door and byTabs exist, and it stops whole classes of wrong routes."
      - "4. PF1 (ID1, TB1): profiles ↔ hats ↔ tabs. His multi-account routing. It needs RT1's availability requirement."
      - "5. QA1: the catalogue runs. It makes section 13 executable, starting with CK-230 (shadow), CK-233 (negative space, guards regressions he fears) and CK-248 (all languages)."
      - "6. RD0–RD2: RAID owns its contract and Idearium routes through RAID (§5.2/§9.1)."
      - "7. RQ12, RQ15 and RQ21: the phase DAG, cells in parallel, the contract as the record. Partly done by CT0–EX0; reconcile, then close the remainder."
      - "Later: SD9 (Claude Code inside Idearium), SD11 (the desktop inside Idearium; the headless sandbox VM awaits his go), MC1 and MC2 (macros as events, hotkeys), PL1, PL5 and PL6."
    drift: >-
      The request spine (2026-10-12) mapped RQ9 (the chunked contract), RQ12 (the phase DAG), RQ15 (cells in parallel)
      and RQ21 (the contract file is its record). CT0–EX0 (0.60.15–0.60.18) built most of that under the contract
      phasemap. These are two maps of one thing. They are surfaced here, not collapsed: RQ9, RQ12, RQ15 and RQ21 get an
      addendum naming what CT0–EX0 delivered and what remains.

## ADDENDUM 2026-10-13 — retry button built (0.60.22); four asks mapped

# James: "maybe add a retry button. consolidate the intelligence and debug system. notes and ideas one fully built feature. phases and specs? it would be nice to use agents intentionally for what theyre best at. as little as possible. like spread agents out opimally for what theyre best at. less tokens from you, the better. … i have like 9 or 12 accounts, and i would love to be able to add them to clearglass and use routing each time tokens run out. like account routing and fallback chaining"

# - RB0 retry button: DONE 0.60.22. A failed or stalled phase task in the repo's task panel has ↻ retry, which calls the Build route. lib/repo-activity.js keeps map and phase on the task.
# - AC1 account fallback chaining (= ID1 identities + SD5 account fallback; the coder recommends it next): an ordered chain of accounts per provider. When a tab reports its limit, Guardian marks that account exhausted until its reset time and dispatches the job to the next account's tab (its own profile partition). Proof: the limit reached on account 1 moves the job to account 2 with no lost job.
# - AG1 agents for what they are best at, as little as possible (folds RT1): the door's learned order already ranks per kind. The default is cheap and local first; a reasoning agent only plans, reviews and repairs when a deterministic check failed. Calls per phase are counted, so "as little as possible" is measured.
# - UX1 consolidation: Intelligence + Debug become one tab, Notes + Ideas one feature (one list with kinds), and Phases shown beside their Spec sections. This is a reorganisation of existing screens. Nothing is lost: old views stay reachable until the new ones are proven.

## ADDENDUM 2026-10-13 — the agent rule written down; Versionium ↔ GitHub mapped

# James: "yes use you for the cheapest but most effective intention." He then quoted the coder's line back as his decision:
# "Agents used for what they're best at, as little as possible. … cheap and local by default, a reasoning agent only for
# planning, review only when the cheap check fails."
# - AG1 decision: that rule is now written down in docs/CLAUDE.md ("Agents for what they are best at"). Building it into
#   the door (counting calls and tokens per phase, review gated on a failed check) is still OPEN.
# - VG1 Versionium ↔ git ↔ GitHub. His words: "what if we have the git integration integrated into versioium. use github
#   api or app id or what ever to sync ideairum with github?"
#   - Exists: lib/repo-git.js (0.39.265) does status, commit, push and pull with an SSH key or HTTPS token, and clone; the
#     Sync & CI tab; history import from .git (0.60.7).
#   - Missing:
#     1. A Versionium snapshot and a git commit are linked both ways (each snapshot records its commit sha, each commit
#        carries the snapshot id).
#     2. Sync on a schedule or on Apply, per repo.
#     3. The GitHub API with a fine-grained token first (simplest), so PRs, issues and CI status show in Sync & CI. A
#        GitHub App id is the later, multi-repo form.
#   - Status: OPEN, ranked after the live run and AC1.

## ADDENDUM 2026-10-13 — AC1 account fallback chaining built (0.60.25)

# James: "not working. can you get it working. check the accounts, account routing, fallback routing."

# What his run showed (SB9): the ladder ran to rung 5, where claude sent back an empty reply, then rung 6, where deepseek
# failed "not connected — no deepseek tab open in guardian". Ladder exhausted.

# What was there:
# - Account rules by hat, intent or repo (guardian/lib/account-routing.js, 0.60.2).
# - Clear Glass switching a tab's account.
# - Every tab's heartbeat reporting `usage.limited`.

# What was missing:
# - Anything that acts on a limit.
# - Opening a missing tab.

# Built:
# - The chain is a provider's every-job rules, highest priority first.
# - A tab that reports its limit makes its account rest (5 h). The next account takes the job, and the run says why.
# - When every account is resting, the job fails as rate-limit and the ladder moves to the next agent.
# - A job whose provider has no tab asks Clear Glass to open it.
# - Where to set it:
#   - guardian GET/POST /api/accounts/chain and POST /api/accounts/rest;
#   - Idearium /api/accounts/* (passes through to Guardian);
#   - the command row accounts.chain;
#   - Idearium → Settings → Routing → Accounts (order them, save; wake a resting one).

# To confirm:
# - Claude's empty reply in that run has another cause. Possibly its tab was signed out or at its limit; the next run's
#   rows will say which.
# - The 5 h rest is a default. A reset time read from the banner would be better.


## ADDENDUM 2026-10-13 — his 0.60.23 log, fixed line by line (0.60.26)

# James: "next. fix anything you can." He pasted the whole PowerShell log of a 0.60.23 run with lean mode on.

# What the log showed, and what changed:
# - The gap-relay (orchestrator) reconnected to diagnostic :7825 every 30 s, and cortex warned "relay to
#   intelligence:3753 failing". Lean mode holds both on purpose.
#   - Now both read lib/lean-mode.js. A held target is said once and left alone, and they reconnect by themselves when
#     lean is off.
#   - A source that is really down still warns (§1.2), once a minute.
# - raid-officiator sent the same nine staged drops to Claude on every boot (in-memory dedup only); each came back "no real
#   agent response". Now each failure is persisted beside the intake dir (officiator-attempts.json, state, never
#   committed):
#   - backoff of 10 min, doubling;
#   - parked after 4 tries (said once);
#   - a tick stops at the first unanswered drop rather than sending the rest to the same silent agent;
#   - "no available agent" spends no attempt.
# - The copilot adversarial probe loaded qwen2.5-coder:7b for 60–85 s every ten minutes beside the build. It is held while
#   lean mode is on (the memory gate was already there).
# - A deepseek job with no tab went to Ollama as deepseek-coder-v2, which is not installed on his machine (HTTP 404). Then it
#   waited 120 s.
#   - Now the Ollama inventory is read first, and only an installed deepseek model is used.
#   - With none installed, the job takes the tab path, which opens the tab (AC1, 0.60.25).

# Checked, not changed:
# - The "nexus" spec made on each sync is the parent index (NEXUS.md) re-versioned when a system changes; the old version
#   is purged right after (nexus-self.js purgeSpecsOf). One spec, not a growing pile.
# - Eros is in-process (Erosmancer events), not a service lean mode can hold. Memory returned to ok by itself each time.
# - "Claude reply element not found" needs his ◎ pick in Clear Glass once. It cannot be fixed without seeing the page.

# Proof: test-lean-quiet 5/5, test-raid-officiator 15/15 (OFF-BACKOFF), test-dispatcher-deepseek-ncp 4/4 (DSK-003/004).
#
# Also fixed (the coder's own debt): three phasemaps had stopped parsing as YAML because the coder's addenda were
# written as bare prose (request-spine from line 805, nexus-memory-gates-and-contract from line 147, this one from line
# 125). They are now `# `-commented, as this repo's other phasemaps write addenda. No word changed, and loom reads the
# same phases (28, 12, 4). There were two quoting slips: `Idearium\'s` (YAML single quotes double the quote) and an
# unquoted `chunks[]` inside a flow list.

## ADDENDUM 2026-10-13 — AG1a mapped and built: agent calls and tokens counted per phase (0.60.27)

# James: "next. fix anything you can." then "conintue". The coder picked AG1's counting half as the next piece. It was
# OPEN since the agent rule was written down, and it is what makes "as little as possible" a number (docs/CLAUDE.md:
# "Count it.").
# - Reuse:
#   - every agent call of a phase build already writes an idearium_phase_runs row: 'planning' for the planner, an
#     attempt row with its rung for a coder, and 'reviewing' for a reviewer;
#   - lib/economy/tokens.js estimate() is the token estimate;
#   - lib/run-watch.js runsOf() groups the rows by run.
# - AG1a, built:
#   - the rows carry tokensIn/tokensOut (estimate-v1) and replyChars at the source;
#   - lib/phase-cost.js costOf(rows) gives:
#     - calls by role (plan/code/review) and by agent;
#     - local vs remote;
#     - tokens in and out;
#     - per run, and the phase total.
#   - Older rows without estimates use chars/4, and the result says so.
#   - Where it shows:
#     - route GET /api/repos/:uuid/phases/cost;
#     - command repo cost;
#     - the Plan panel: one line per phase, "agents: N calls (plan p · code c · review r) · L local · R remote ·
#       ~T tokens".
# - AG1b, still OPEN: review only after a cheap check failed. Today a draft review runs whenever reviewing is on.
# - Found by the count (0.60.27): CP-06 counted 7 calls where the stubbed agent saw 8. With no ladder (a fixed backend), a
#   failed coder call whose reply did not name its agent was written with no provider, so the record could not say who
#   failed. It now names the backend it was sent to. CP-06 asserts that the calls counted equal the dispatches.
# - Source changes: idearium/api/index.js (_tokEst, the three call rows, _phaseRows, the route);
#   idearium/repo/build-plan.js (rows, cost); idearium/api/build-surface.js (phaseRows); idearium/ui/js/plan-panel.js;
#   idearium/cli/route-commands.js (repo.cost); loom/maps/build-surface-map.js (phase-cost → run-watch; api, build-plan →
#   phase-cost; api → economy/tokens).

## ADDENDUM 2026-10-13 — why the pipeline doesn't work yet; PF1 ready before run, PF2 a plan without a model

# James: "can we work on inventing anything that will get this pipeline going. like why doesn't this work yet?"
#
# The coder's reading of every run he pasted this session:
# - The agents answer: in these logs ChatGPT finished 38 jobs and Gemini 16.
# - The pipeline gambles twice.
#   1. It starts a run without knowing its parts are ready.
#      - SB9: the ladder climbed to claude, whose page needed his ◎ pick (an empty reply), then to deepseek, which had
#        no tab and was behind a sign-in wall. Ladder exhausted.
#      - BL30: the planner was asked while memory was critical, and the request was dropped.
#   2. When the planner fails, the build falls back to its hardest mode, "built whole as before": one chat agent explores
#      the whole phase alone, one tool call every 15 s. BL30 ended there, as a placeholder in the wrong place,
#      `incomplete`.
# - Both invert his rule ("deterministic first"): the run asks an agent first and finds out afterwards.
#
# The coder proposed two inventions and recommended A first. He chose: "A then B (Recommended)" (2026-10-13).
#
# - PF1 ready before run.
#   - One check before the first agent call:
#     - Guardian answers;
#     - each rung's agent is not behind a sign-in wall, has no job waiting on his ◎ pick, and has an account left in
#       its chain;
#     - an Ollama rung's model is installed and memory is not critical;
#     - a disconnected tab is fine: it is opened on demand (0.60.25).
#   - Rungs that are not ready are dropped before the run, said on the Plan.
#   - The planner is the configured one if ready, else the first ready remote rung.
#   - No ready rung → the run does not start: state not-ready, with what to fix.
#   - Guardian owns its facts (GET /api/providers/ready, guardian/lib/provider-ready.js). The run's check is pure
#     (lib/run-ready.js).
#   - Delivery order: backend → route → command (providers.ready) → UI (the not-ready / ready row on the Plan).
# - PF2 a plan without a model.
#   - When no planner is ready, or the planner fails, Nexus writes the plan itself (lib/phase-plan.js derive), from:
#     - the files the phase names, else the paths and registry components its text names;
#     - the exports a file it edits already has;
#     - `does:` as its steps;
#     - `proof:` as its conditions.
#   - The build stays one file per request, through the same contract path, and is never handed whole to one agent.
#     The precedent one level up: idearium/repo/spec-plan.js derivePlan.

## ADDENDUM 2026-10-13 — PM: every phase mapped to its files and dependencies, Nexus and every project

# James: "All the phases need to be mapped to files and dependencies. With nexus and all projects."
#
# Measured first, on Nexus's own phasemaps (the loom parser, docs/*phasemap.spec): 1351 phases, 777 open.
# - Of the open ones: 370 name files:; 184 write file paths in their text but name none; 223 write no path at all;
#   195 have no depends_on.
# - The text is not the answer. On the phases that do name their files (ground truth), only 172 of the 644 paths in
#   their text are among their files (27%). Phrases that suggest a file is being built score 23%. A path in a phase's
#   prose is as often a reference ("checked against", "mirrors", "already in") as a target.
# - That also condemns 0.60.28's derivePlan, which took paths from the text when files: was missing. Fixed here
#   (PM0): it plans only the files a phase names.
#
# The design (the coder's; his rule decides the split, "deterministic first … a reasoning agent only plans"):
# - PM0: derivePlan uses files: only. A phase without it is not planned without a model.
# - PM1 candidates (code): the paths a phase writes, each marked as existing or new (its folder exists). Done phases are
#   skipped unless asked.
# - PM2 classify (model, through the learned door, Ollama first): a few phases per request. Each answer is JSON
#   {files:[{path,new}]}, checked by code: safe paths, existing or under an existing folder.
# - PM3 a gate that learns: before mapping, the same agent maps phases whose files are known, with their files hidden,
#   and is scored (precision, recall). Its answers are written only when the precision reaches the threshold
#   (phase_mapping.min_precision, 0.8). Otherwise they are kept as proposals and the report says why.
# - PM4 dependencies (code): within a map, a phase depends on the nearest earlier phase that changes the same file.
#   Existing depends_on is kept, and only what is missing is added.
# - PM5 apply: files: and depends_on are added to the phase block, never replacing what is there, with a comment saying
#   who mapped it and the measured precision. Through _phaseWrite (a nexus repo goes through the apply gate:
#   snapshotted, reversible). A map that parsed before and would not after is refused.
# - Order: backend (lib/phase-files.js, idearium/repo/phase-mapping.js) → route (POST/GET /api/repos/:uuid/phases/map)
#   → command (repo map-phases) → UI (Phases tab: "Map files & dependencies", progress, the report).
# - To confirm with him: the threshold, and whether done phases are mapped too (default: open phases only).
# - Built (0.60.29):
#   - PM0 derivePlan uses files: only (RR-10).
#   - PM1–PM5: lib/phase-files.js and idearium/repo/phase-mapping.js; POST/GET /api/repos/:uuid/phases/map;
#     `repo map-phases`; Phases tab "⇄ map files & dependencies" with its progress line.
#   - Settings: repos.map_min_precision, map_min_scored, map_batch and map_done.
# - Found while building:
#   - Hub files: idearium/api/index.js is named by 118 phases and app.js by 57, so sharing one says nothing about order.
#     A file named by at least max(8, 2% of the phases naming files) is not dependency evidence. A false depends_on
#     blocks a phase.
#   - A phase written on one line ({ … }) cannot take a key in place: 33 in Nexus. Not sent to the agent, and said.
# - Applied to Nexus now, by code alone: 13 depends_on lines on open phases in 4 maps, from the files they share, each
#   with its reason as a comment. Every map still parses and keeps its phase count.
# - Not applied here: files: for the 407 open phases that name none. That needs the agent and its score, and it runs on
#   his machine (Ollama first, through the door). The coder does not do this bulk mapping by hand (docs/CLAUDE.md, the
#   agent rule).
