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

James: "maybe add a retry button. consolidate the intelligence and debug system. notes and ideas one fully built feature. phases and specs? it would be nice to use agents intentionally for what theyre best at. as little as possible. like spread agents out opimally for what theyre best at. less tokens from you, the better. … i have like 9 or 12 accounts, and i would love to be able to add them to clearglass and use routing each time tokens run out. like account routing and fallback chaining"

- RB0 retry button: DONE 0.60.22. A failed or stalled phase task in the repo's task panel has ↻ retry, which calls the Build route. lib/repo-activity.js keeps map and phase on the task.
- AC1 account fallback chaining (= ID1 identities + SD5 account fallback; the coder recommends it next): an ordered chain of accounts per provider. When a tab reports its limit, Guardian marks that account exhausted until its reset time and dispatches the job to the next account's tab (its own profile partition). Proof: the limit reached on account 1 moves the job to account 2 with no lost job.
- AG1 agents for what they are best at, as little as possible (folds RT1): the door's learned order already ranks per kind. The default is cheap and local first; a reasoning agent only plans, reviews and repairs when a deterministic check failed. Calls per phase are counted, so "as little as possible" is measured.
- UX1 consolidation: Intelligence + Debug become one tab, Notes + Ideas one feature (one list with kinds), and Phases shown beside their Spec sections. This is a reorganisation of existing screens. Nothing is lost: old views stay reachable until the new ones are proven.

