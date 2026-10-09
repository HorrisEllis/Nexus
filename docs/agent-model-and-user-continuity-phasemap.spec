spec:
  meta:
    name:        agent-model-and-user-continuity
    roadmap: 'later — later (declutter 2026-10-09, James: "okay")'
    version:     0.1.0-phasemap
    status:      PHASEMAP 2026-08-13. Mapped, not built. §3.3 — map before build.
    uuid:        nexus-agent-model-continuity-v0-0000-2026-0813-001
    author:      (mapped this session, per the human's direction)
    intent: >
      Two threads, both real, both dependent on today's already-built substrate:
      (1) each of the six AgentMesh provider agents (lib/agent-system/contracts.js,
      built today) grows its OWN model over time — not hand-tuned, LEARNED from
      real RAID quality-check outcomes, the same way AP3/AP4 of
      agent-intelligence-loop-phasemap.spec already mapped for Gemini's internal
      sub-agents, generalized one layer up. Incidents feed this loop directly:
      when something crosses into FAILURE_MODE (R7's real friction bands),
      co-pilot questions the responsible agent to understand what happened, not
      just logs that it happened.
      (2) co-pilot itself stays genuinely open-ended in conversation — this is
      not a mode switch the person has to declare — while specific signals
      (build/repair/spec-shaped language, or a real open incident) route the
      SAME conversation into the formal contract system without breaking the
      conversational thread. Ambiguity anywhere in that loop triggers a real
      pull — cortex recall, loom's map, the agent model, chat history, and (new)
      a live web search via ClearGlass — instead of guessing or stalling.

  today_summary:   # §0.3 nothing lost — what actually shipped this session,
                    # verified live, not just described, before this phasemap
                    # was written on top of it
    - "lib/loom-map.js — cached, decoupled bridge from loom's real registry (46 systems / 1372 components / 1712 hooks, confirmed live) to any consumer needing 'what component is this'. resolveComponent()/resolveSystem() honest about unmapped ids, never fabricate."
    - "cortex/intelligence/index.js — meta-pattern layer (lift-adjusted scoring, structural-noise-source detection, closes the loop into liminal-space so a noisy detector's confidence is actually discounted downstream, not just logged) + component-level failure indexing via component-ledger.errorsByComponent() cross-referenced against loom-map."
    - "lib/gap-field.js — added `component` as a first-class optional field (same additive pattern as R1's own repair_contract_schema fields), resolved from loom-map at report time."
    - "service/nexus-diagnostic.js — fixed a real native-crash-class bug (unbounded push(...recursiveWalk) → STATUS_STACK_BUFFER_OVERRUN), and fixed openGaps never hydrating from persisted state on boot (the actual root cause of the ~470-gap-per-restart flood traced back to loom's registry earlier this session)."
    - "lib/agent-system/contracts.js + submit.js — the top-level equivalent of gemini-toolbox's agent-contracts.js, one layer up: a real contract (personality/model/constraints/scoped-toolkit/output-folder) per AgentMesh provider (claude/chatgpt/gemini/perplexity/mistral/grok — mistral/grok never had constraints anywhere before today), and a real output→file→RAID(verifyInIsolation)→verdict pipeline. Tested end-to-end, including scope refusal and RAID's real fast-path/consequential distinction."
    - "MAJOR FINDING + FIX: docs/repair-contract-and-loom-hub-phasemap.spec's R3 (lib/autonomous-repair.js — 'loom notices and fixes itself') was fully built and tested 2026-08-12 but wireAutonomousRepair() had ZERO production callers anywhere — confirmed by grepping every real caller of registerTrigger() in the whole tree. Wired into copilot/server.js's boot sequence, same place scheduler/triggers already start. A SECOND live bug found while wiring it: the trigger registration never set once:false, so registerTrigger's own default (once:true → maxFires:1) meant the self-healing loop would have fired for the first detected gap ever, then permanently disarmed. Fixed. Verified: maxFires now Infinity. All 7 pre-existing tests still pass (they never exercised a second fire, which is why this wasn't caught before)."
    - "Verified (not just trusted): R1 (repair contract schema), R4 (component-ledger), R7 (fault-taxonomy's scoreTension, correctly wired to cortex/self-heal not the old broken cortex/healer path), and loom/contracts/index.js (LoomContracts compartment lifecycle — genuinely wired into loom/server.js's real /api/contracts routes, NOT dormant like R3 was) are all real and live."
    - "Confirmed gaps between the repair_contract_schema as built and the fuller field list wanted: no link from a gap/fault to bep_patterns (cortex/intelligence pattern crystallisation), no first-class computed sigma DIVERGENCE value (only a sigmaUuid reference), no impactOf()-sourced forward-effects field (lib/relational-context.js's impactOf() exists from R10 but isn't wired into the contract), no related-fault/incident cross-linking."

  substrate_already_built:   # §8.6 — extend these; do not rebuild
    - "lib/agent-system/contracts.js + submit.js — TODAY. The per-agent contract + output/RAID pipeline this whole phasemap's agent-model work reads and writes through."
    - "docs/agent-intelligence-loop-phasemap.spec AP1-AP5 — AP1 (pull toolbox) DONE. AP2-AP5 (agent events→intelligence, strategy as a dynamic cortex DB, intelligence optimizes it, autonomous loop) MAPPED, NOT BUILT — this phasemap's AM1 is AP3+AP4 generalized to the six top-level providers via today's contracts.js, not a competing design. Extend that phasemap's phases when building AM1, don't fork a second strategy-DB shape (§10.3)."
    - "cortex/self-heal/fault-taxonomy.js — real FAILURE_MODE friction band (R7), the exact fault-vs-failure-mode escalation AM2 hooks into."
    - "lib/relational-context.js — real impactOf() (R10), the forward-effects mechanism a full incident report needs and doesn't have yet."
    - "cortex/push-recall.js — real, tiered (crystal/spec/session/recent/failure/index), intent-laned (debug_failure/gap_fill/session_resume/causal_trace/pattern_lookup/crystal_query/general) recall system, TOKEN_BUDGET_CHARS-bounded. This is the substrate 'fully remember me' extends — checked directly: no tier is scoped to a persistent user identity/preference profile across all time; every tier is content-shaped, not person-shaped. That's the real, specific gap, not 'memory doesn't exist.'"
    - "cortex/personas.js — PersonaStore shape ({name, systemPrompt, allowedTools, defaultIntent}), reused as the personality shape in lib/agent-system/contracts.js already. Distinct concern from AM4 (personas are co-pilot's own behavior mode; AM4 is what co-pilot knows ABOUT the person it's talking to)."
    - "lib/agent-tools/tools/browser-action.js — REAL_ACTIONS include navigate (driver.exec) + dom_query, ClearGlass-driven, live-wired (confirmed: url.listen/url.listen.remove gates registered, not orphaned). The actual substrate AM5's web-search leaf composes, not a new browser integration."
    - "lib/agent-router.js — existing intent-classification pattern (routeAgent, DEFAULT_ROUTES) AM3's conversational-vs-formal routing reuses rather than inventing a second classifier."
    - "loom/contracts/index.js (LoomContracts) — real compartment lifecycle (openContract/recordHandoff/closeContract), genuinely wired into loom/server.js's /api/contracts. Verified live this session, not assumed. Available for AM1/AM2 to open a compartment per agent-model update or per incident debrief, composing rather than building a second lifecycle tracker."
    - "cortex/intelligence/adversarial.js — real generic reasoning-comparison engine (normalizedResult shape {source,domain,intent,confidence,claims,comparable}, compare() = contradiction is a gap). Explicitly NOT meta/adversary-suite.js (compartment stress-testing, different thing, same word — the file's own header already documents this distinction). AM6's epistemic half."
    - "cos/ (Compartment OS) — real, CLI-first, HTTP-less by design. cos-compartment.js gives create/start/stop/destroy/list against real isolated compartments; cos-simulate.js gives LabManager/LabSession real scenario execution (single/h2h/loop-feedback/chain/stress) against a real provider."
    - "lib/emergence.js — real, built same session as this addendum (2026-08-13). axioms+endState iterative verify loop, built ON lib/safe-apply.js's real isolated-COS-branch verify (not a new isolation mechanism) + lib/fault-log.js's real failure history for the 'innovate the method, not just retry' pivot. AM6's actual empirical mechanism — a better fit than a bare COS call, found by re-checking substrate before building rather than assuming the earlier draft's shape was still current."

  governing_axioms:
    - "§3.3 map first, this file. §8.6 reuse — every phase below composes real, verified substrate; nothing here is a new brain."
    - "§10.3 one source of truth — AM1 extends agent-intelligence-loop's AP3 strategy-DB shape, doesn't fork it. AM4 extends push-recall's tier system, doesn't fork it."
    - "§RAID governs every agent-model update and every incident-triggered repair — the same governance today's submit.js already runs output through."
    - "§0.3 nothing lost — an incident debrief, once asked, is itself a repair-contract-shaped record, not a side conversation that evaporates."
    - "§1.1 declared ≠ real — every phase's gate is a live, verifiable check, per the two real bugs (R3 dormant wiring + once:true) found by insisting on this today rather than trusting a prior 'DONE' label."

  phases:

    AM1_per_agent_learned_model:
      priority: FOUNDATION — AM2 needs somewhere real to write a debrief's findings; AM5's agent-model pull source doesn't exist without this.
      depends_on: []
      does: >
        Generalizes agent-intelligence-loop-phasemap.spec's AP3 (strategy as a
        dynamic cortex table, not hardcoded) + AP4 (intelligence optimizes it)
        from Gemini's four internal sub-agents to the six top-level AgentMesh
        providers, reading from today's lib/agent-system contracts+submit. A
        cortex table (agent_model, one row per agentId, jaaDB.insert — dynamic,
        not a schema migration) accumulating: RAID verdict history (pass/fail
        rate per action type, from submit.js's raid field), which of the
        contract's scoped tools actually got used successfully vs never used
        (tool-index.js's real living inventory, already built AP1), and a
        confidence/fitness score per agent per action type. Read at contract-
        assembly time (getContract()) to bias which agent gets a task, the same
        role AP4 already specced for the strategy DB — a repeated failure
        condition should measurably change future routing, governed by RAID
        (no silent self-modification).
      reuse: "agent-intelligence-loop-phasemap.spec's AP3/AP4 design verbatim, generalized. lib/agent-system/submit.js's real RAID verdicts as the input signal. lib/tool-index.js's real usage tracking."
      gate: "after N real submitOutput() calls for an agent with mixed pass/fail verdicts, agent_model has a real, queryable row whose fitness score reflects the actual pass rate — not a static number — and getContract() surfaces it."
      drift: "cold-start — a brand-new agent has no history yet; needs an honest default (unbounded-untrusted, not unbounded-safe, same phrasing contracts.js already uses for missing constraints) rather than a fabricated confidence."
      axioms: ["§10.3", "§RAID", "§8.6"]

    AM2_incident_debrief:
      depends_on: [AM1]
      does: >
        When a fault crosses into R7's real FAILURE_MODE friction band, OR an
        agent's RAID verification fails (submit.js's raid.verified === false),
        co-pilot submits a structured debrief request to the responsible agent
        via lib/agent-system/submit.js (a new action type, e.g. 'debrief') —
        the agent explains what it was trying to do and what it believes went
        wrong. The answer becomes: (a) a labeled example folded into AM1's
        agent_model (a real, agent-reported failure account, not just a pass/
        fail bit), and (b) supplementary content for the repair contract's
        `why` field alongside RFR2's causal trace — cross-checked against it,
        not a replacement for it (RFR2 traces conditions from evidence; the
        debrief is the agent's own account — both kept, neither silently wins).
      reuse: "R7's real bandFor()/FRICTION_THRESHOLDS.FAILURE_MODE. lib/gap-field.js's existing `why` field (R1). lib/agent-system/submit.js's real pipeline, one new action type."
      gate: "a real fault crossing into FAILURE_MODE produces a real debrief submission to the correct agent (resolved via the fault's system/component, loom-map), and the response is queryable both from the gap's `why` and from agent_model's examples."
      drift: "an agent that can't explain itself (context lost, or genuinely doesn't know) needs an honest 'unknown' answer path, not a fabricated explanation — same honesty discipline as everywhere else in this codebase."
      axioms: ["§0.3", "§1.1", "§8.6"]

    AM3_open_ended_grounded_conversation:
      depends_on: []
      does: >
        Co-pilot's conversational surface (the real, live chat already wired in
        every /ui/agents UI) stays open-ended by default — no explicit mode
        switch. A lightweight classifier (reusing agent-router's existing
        intent-classification pattern, not a new one) reads each turn for
        build/repair/spec-shaped signals or a reference to a real open
        incident/gap, and on a match, routes that turn into the formal system
        (lib/agent-system, gap-field, RAID) transparently — the reply still
        reads as conversation, but the underlying action is a real, tracked,
        RAID-governed one, not an unrecorded chat reply. Ambiguous turns (the
        classifier isn't confident) are the trigger surface AM5 answers, rather
        than the classifier guessing.
      reuse: "lib/agent-router.js's routeAgent()/intent pattern, generalized from 'which agent' to 'conversation vs formal-system' classification. cortex/personas.js's defaultIntent field as a per-conversation-mode hint."
      gate: "a build/repair-shaped request typed in plain conversation produces a real gap-field/RAID-tracked record, indistinguishable in tone from a normal reply to the person, but real and auditable on the backend — verified by checking the record exists, not by the reply's wording alone."
      drift: "false-positive routing (casual conversation misclassified as formal) needs a cheap, visible correction path, not a silent formal record for something that was actually small talk."
      axioms: ["§8.6", "§1.1"]

    AM4_full_user_continuity:
      depends_on: []
      does: >
        Extends cortex/push-recall.js's real tiered system with the one tier
        it's confirmed NOT to have: a person-scoped tier (not content-scoped
        like the existing six) holding durable facts about the specific human
        co-pilot is talking to — preferences, standing context, prior
        decisions — persisted across sessions the same way crystal/spec tiers
        already persist across time, pulled via the SAME recall() mechanism
        (new intent lane, e.g. 'user_context', added to INTENT_LANES) rather
        than a second, parallel memory system. Bounded by the same
        TOKEN_BUDGET_CHARS discipline already governing every other tier —
        'fully remember' means durably available when relevant, not
        unconditionally injected into every context packet.
      reuse: "cortex/push-recall.js's CortexPushRecall class, VALID_TIERS/TIER_PULL_WEIGHT/INTENT_LANES/TOKEN_BUDGET_CHARS entirely — this is one new tier + one new lane in an existing, real, tested system, not a new module."
      gate: "a fact pushed into the new tier in one session is retrievable via recall() with intent:'user_context' in a later session, ranked and budget-capped exactly like every other tier, not held in a separate unbounded store."
      drift: "staleness — a durable fact can become wrong (the person's situation changed). Needs the same 'drift is data, not silently overwritten' discipline (§13.4) other parts of this codebase already apply, not a naive last-write-wins."
      axioms: ["§10.3", "§8.6", "§13.4"]

    AM5_ambiguity_triggered_pull:
      depends_on: []   # composes with AM1/AM4 once they exist, but AP1's real pull toolbox + browser_action's real navigate/dom_query are enough to build the mechanism now
      does: >
        Extends agent-intelligence-loop's real AP1 pull toolbox (get_schema/
        get_chunk/query_capability/get_contract/get_seam, already live) with
        the explicit ambiguity-response behavior: when co-pilot (or AM3's
        classifier) can't resolve something from what's already in context, it
        pulls, in order, from what's cheapest/most-authoritative first — cortex
        recall (push-recall, now including AM4's user tier), loom-map (today's
        bridge — 'what component/system is this'), AM1's agent_model (has an
        agent already been asked this / failed at this before), chat history —
        and only then, as external leaves: PERPLEXITY FIRST (its real contract
        already says 'search-grounded' — the right tool for this, not a raw
        browser action), and raw browser_action navigate/dom_query only if
        perplexity itself is unavailable or its answer is still insufficient.
        A perplexity result that's meant to become a durable fact (not just
        answer this one turn) is exactly AM6's confidence-building loop, not
        crystallized directly from a single search. Each pull attempt and its
        outcome (found/not-found) is itself logged (§0.3), so a pattern of 'we
        always end up asking perplexity about X' becomes visible data, not a
        repeated blind spot.
      reuse: "lib/agent-pull.js (AP1, real) as the internal-pull dispatcher. lib/agent-system/contracts.js's real perplexity contract as the primary external leaf. lib/agent-tools/tools/browser-action.js's real navigate/dom_query as the fallback beneath it."
      gate: "a real ambiguous query exhausts internal pulls (cortex/loom/agent-model/history, honestly reporting not-found at each step) before ever reaching perplexity, and perplexity's own failure to resolve it is reported honestly before falling further to raw browser search."
      drift: "search-first temptation — the ordering (cheap/internal before external, perplexity before raw browsing) is the actual point; a version of this that reaches for the web before checking cortex/loom defeats the reason this codebase built those systems in the first place."
      axioms: ["§8.6", "§0.3", "§1.1"]

    AM6_perplexity_confidence_loop:
      depends_on: [AM1, AM5]
      does: >
        When AM1's agent_model confidence for a claim is low, or AM5's
        internal pulls come back insufficient, the escalation is specifically
        PERPLEXITY via its real contract (lib/agent-system/contracts.js) and
        submit.js pipeline (a 'research' action), not generic browsing.
        Perplexity's finding is normalized into cortex/intelligence/
        adversarial.js's real ReasoningResult shape and run through its real
        compare() against the existing low-confidence claim — CONTRADICTION IS
        A GAP (gap-field, not silently overwritten), agreement raises
        epistemic confidence. Epistemic agreement alone isn't sufficient to
        crystallize: an EMPIRICAL check runs the claim through lib/emergence.js
        (real, built 2026-08-13, same day this phasemap's substrate landed —
        checked before writing this addendum, not assumed) rather than a raw
        COS call: axioms = the epistemic finding itself (what perplexity +
        adversarial agreed holds), endState = 'holds against real system
        behavior', spec.files = whatever the claim is actually about.
        emergence.attempt() already composes lib/safe-apply.js's real isolated
        verify loop UNDER COS — so this isn't instead of COS, it's COS driven
        through the one module built specifically for 'does this actually
        hold up, and if not, is it the method or the claim that's wrong,'
        which is a better fit than a bare cos-simulate.js/cos-compartment.js
        call would have been (found while re-checking substrate before
        building, per this session's own map-first discipline). A claim that
        can't be verified as specified gets emergence's own real 'innovate
        the method, not just retry' pivot (after pivotAfter consecutive
        same-method failures, tracked via lib/fault-log.js's real history) —
        if THAT still can't produce a passing candidate, the claim genuinely
        fails empirically, not just unluckily. Only once BOTH the epistemic
        (perplexity + adversarial, no unresolved contradiction) and empirical
        (emergence.attempt() passed) checks pass does the claim get
        pushRecall.push()'d into push-recall's real 'crystal' tier — the
        highest-priority tier (TIER_PULL_WEIGHT 1.30, already real), the exact
        mechanism AM4 extends. A claim failing either check stays at its
        current, uncrystallized confidence, visibly — queryable WHY it didn't
        promote (including which stage: epistemic contradiction, or empirical
        fail after a method pivot), never silently promoted and never
        silently dropped.
      reuse: "lib/agent-system/contracts.js's real perplexity entry. cortex/intelligence/adversarial.js's real compare()/ReasoningResult — specifically NOT meta/adversary-suite.js (a different thing, same word, already documented as distinct in that file's own header — checked before reusing either). lib/emergence.js's real attempt()/axioms/endState/pivotAfter loop for the empirical half — itself already built on lib/safe-apply.js + COS + lib/fault-log.js, so this phase composes one real module instead of three separate ones. cortex/push-recall.js's real push(content, tags, 'crystal') — no new crystallization function, a normal call with that tier."
      gate: "a real low-confidence claim goes perplexity-research -> adversarial.compare() -> emergence.attempt() (COS-backed, with a real method-pivot path, not just retries) -> crystal-tier push, in that order; a claim failing at ANY stage is visibly NOT crystallized, with the specific stage AND (if empirical) whether it failed before or after a method pivot, queryable, not silently promoted or silently dropped."
      drift: "epistemic/empirical mismatch — perplexity+adversarial agree but emergence.attempt() can't verify it even after a method pivot (or vice versa) is itself a real, informative disagreement worth surfacing as a gap, not resolved by arbitrarily picking one side."
      axioms: ["§0.1", "§RAID", "§8.6", "§0.3"]

    AM7_agent_switch_continuity_and_chat_recall:
      priority: NEW — checked live before mapping, not assumed. Answers a direct "did you map it all" — no, this wasn't, here's precisely what was missing.
      depends_on: []
      does: >
        Five real, confirmed gaps, found by checking rather than assuming:
        (a) setCurrentAgent('claude') (self-model.js, real, RAID-governed,
        VALID_AGENTS includes claude) changes which provider answers future
        messages but touches NOTHING about chat identity — lib/chat-logger.js's
        sessionId does not get carried, renamed, or cross-referenced across a
        switch. Fix: switching agent writes a chat_log entry of its own
        (role:'system', a real record, not a side effect) linking the OLD and
        NEW sessionId, so a conversation stays one traceable thread across a
        switch instead of fragmenting silently.
        (b) THREE separate, disconnected chat-search paths currently exist —
        checked, not assumed: push-recall (lane-scored, AM4 just added 'user'
        tier, has ZERO connection to chat_log), lib/chat-logger.js +
        vector-memory (semantic embedding search + last-N fallback, what
        buildInjectionContext actually uses), and lib/agent-tools/tools/
        agent-chat-search.js (a THIRD, simpler substring-search tool). A real
        §10.3 violation — "queryable chats using recall" doesn't have one
        home right now, it has three partial ones. Fix: push-recall's
        recall() gains a real path to query chat_log rows (tier could be
        'session' for these, or reuse 'user' where a chat row is itself a
        durable fact) instead of a fourth parallel mechanism — one source of
        truth via extension, not a new module.
        (c) "past couple of days" time-windowed context: checked
        buildInjectionContext directly — it filters by semantic similarity
        threshold OR falls back to last-N-count, NEVER by a date range. No
        existing function does this. Real, small, additive gap: a
        since/until option on the same real query path.
        (d) lifeline.js's escalation (confirmed: Ollama -> Guardian -> honest
        error) is AI-to-AI only — there is no "ask the actual person" rung
        on that ladder at all. "If co-pilot is unsure, ask me" needs a real
        NEW escalation target, not assumed to already exist because
        lifeline.js sounds like it should cover it.
        (e) "tell me what it needs and why it can't" — §1.2 (never silent)
        is the general ethos everywhere in this codebase, but there's no
        ONE structured shape for it (checked: every module's honest-failure
        message is hand-written per call site, not a shared format). Real,
        small, worth a shared { needs, why, whatWouldUnblock } shape reused
        everywhere lifeline/AM5/AM6 currently just log.warn a string.
        Also confirmed: guardian tracks a live tabId per provider connection
        (real, in server.js) but it never gets threaded into chat_log
        records — "chat name and url consistent... referenced each new
        conversation" needs that thread added, not assumed already present.
      reuse: "self-model.js's real setCurrentAgent/getCurrentAgent. lib/chat-logger.js's real sessionId/chat_log/vector-memory path — extended, not forked. push-recall's real recall()/tier system from AM4 — the query surface this unifies chat search onto. copilot/lifeline.js's real escalation chain — (d) adds one more rung, doesn't replace the existing ones."
      gate: "switching agent mid-conversation (a) leaves ONE walkable chat_log thread, not two disconnected sessionIds; (b) a single recall() call actually returns chat history, not three different calls to three different modules; (c) a real 'last 2 days' query returns only rows in that window, verified against rows both inside and outside it; (d) a real low-confidence case reaches a genuine 'ask the person' state, distinguishable from an AI-escalation in the log; (e) a real can't-do case produces the shared {needs, why, whatWouldUnblock} shape, not a one-off string."
      drift: "unifying three chat-search paths into one risks losing whichever one had a real caller depending on its specific current behavior — audit real callers of all three before consolidating, same discipline as every other 'multiple systems doing the same thing' finding this session."
      axioms: ["§10.3", "§1.2", "§8.6", "§0.3"]

    AM8_lifeline_as_general_channel_and_reasoning_upgrade:
      priority: NEW — every claim below has an exact file:line citation, checked live this pass, per explicit instruction not to generalize.
      depends_on: [AM1, AM7]
      does: >
        (a) LIFELINE REFRAME — copilot/lifeline.js's route() (line 349) is
        currently framed as "Ollama-first, escalate on low confidence"
        (CONFIDENCE_THRESHOLD, line 31). It already has the primitive for
        general agent-to-agent talk (opts.provider short-circuits the
        cascade, line 359; extractExplicitAgent(), line 344, parses an
        explicit target out of a prompt) — this phase makes that the FRONT
        DOOR, not a side-channel: any code wanting "co-pilot talk to agent
        X" calls route(prompt, {provider: X}) directly, confidence-based
        escalation becomes one caller of the same function, not the only
        entry point. No new dispatch mechanism — reframing what's already
        there as primary.
        (b) STALE COMMENT, VERIFIED — lifeline.js line 204-205's comment
        ("the endpoint it's handed to /api/copilot/prompt still doesn't
        exist, confirmed directly") is FALSE as of right now: guardian/
        server.js line 2926 has a real, working /api/copilot/prompt route
        (calls askSync from guardian/ask.js, real RAID routing via cortex's
        POST /api/raid/decide, LAW_III fallback to 'claude' on cortex
        unreachable) — added 2026-07-07 per guardian/server.js's own
        "§GAP CLOSED 2026-07-07" comment, AFTER lifeline.js's comment was
        written and never updated. Small, real fix: update the comment.
        (c) GENUINE LIVE DEAD END, VERIFIED SEPARATELY — lifeline.js's
        OTHER claim, the /chatgpt-mode/query fallback (guardian/server.js
        line 2963), is still real and current: it does
        require('./agents/chatgpt-mode') in a try/catch (line 2960ish) and
        that file, guardian/agents/chatgpt-mode.js, confirmed absent from
        disk right now. guardian/ask.js's own header (line 11) already
        documents this exact 503. Not urgent (co-pilot/prompt at (b) covers
        the real path) but worth either building the file or removing the
        dead route, not leaving a documented-but-unfixed 503.
        (d) STREAMING GAP, PRECISE — "continuous data stream like ollama
        module has injected" is real and specific: ollama/server.js has a
        genuinely named "P7 standing streams" channel (line 71,
        _channels Map) and real SSE (line 379-413, stream:true against
        ollama's own API). Guardian's NCP-routed agents (claude/chatgpt/
        gemini/perplexity/mistral, via createJob/dispatchJob) are
        request-then-poll, not streaming — checked, not assumed: no
        matching SSE/stream:true pattern found in guardian's NCP job path.
        This is a real, agent-specific capability gap, not a general one —
        Ollama has it, the five NCP-routed agents don't.
        (e) INJECTION TOOL EXISTS, GEMINI-ONLY — "synthesis respecting
        agent constraints/token limits" already exists at
        lib/gemini-toolbox/injection.js, but scoped to Gemini's internal
        sub-agents only (same layer distinction lib/agent-system/
        contracts.js's own header already documents vs gemini-toolbox's
        agent-contracts.js). This phase generalizes injection.js the exact
        same way contracts.js generalized agent-contracts.js this session —
        reading constraints from lib/agent-system/contracts.js's real
        getContract(agentId).constraints (already built, already has real
        numbers for all 6 top-level agents) instead of gemini-toolbox's
        AGENT_CONSTRAINTS copy.
        (f) RETRY LOGIC — checked cortex/core/raid/index.js directly: the
        only "retry" concept found is rate-limit retryAfterMs (line 613),
        a completely different thing (backoff on hitting a rate limit, not
        retrying a failed build). RAID itself has NO native retry-a-failed-
        contract mechanism. The real retry-with-method-pivot mechanism is
        lib/emergence.js (already mapped into AM6's empirical check) —
        this phase's retry logic for build contracts REUSES emergence.js's
        pivotAfter, not a second retry system built inside RAID.
        (g) COOKIE VAULT / MULTI-ACCOUNT REROUTE — three real, currently
        disconnected pieces: lib/account-registry.js (real: addAccount/
        listAccounts/getAccountForRoute/setAccountStatus, JAA-backed),
        lib/agent-tools/tools/browser-action.js's real cookies_save/
        cookies_restore actions (REAL_ACTIONS, confirmed earlier this
        session), and clear-glass's real driver those actions call through.
        None of the three currently call each other — account-registry
        tracks WHICH accounts exist, browser-action can save/restore
        session cookies, but nothing wires "this account failed, check
        registry for another, cookie-restore into it, log the switch to
        cortex" as one flow. This phase is that wiring, not new primitives.
        (h) CHAT-URL TROUBLESHOOT NAVIGATION — extends AM7(a)'s URL-thread
        fix: once a contract's chat URL is captured, browser-action's real
        navigate action (confirmed earlier this session) can return to that
        exact conversation for troubleshooting. Per-agent troubleshooting
        protocol = the same per-agent contract shape (lib/agent-system/
        contracts.js) gains a troubleshootSteps field, not a new concept.
        (i) UNIFIED QUEUE, VERIFIED FRAGMENTED — checked directly: THREE
        separate queue-shaped modules exist (lib/queue.js, lib/seam/
        queue.js, lib/contract-queue.js) PLUS three more autonomy modules
        that are also queue-shaped (lib/scheduler.js, lib/triggers.js,
        lib/chains.js — all real, CA1-CA3, copilot-autonomous-phasemap.spec,
        ALL DONE 2026-08-08). Six real mechanisms, not one queue. This
        phase's "complete queue" is a READ-side unification (one real query
        surface listing all six's pending items tagged by source-module and
        the repair-contract schema's fields), not a rebuild of any of the
        six — consolidating six working systems behind one view is very
        different from replacing them, and replacing them is explicitly
        OUT of this phase's scope given how much real, tested behavior each
        of the six already has independently.
        (j) "THINK, NOT JUST FOLLOW A SCRIPT" — checked copilot/server.js
        directly: this is LARGELY ALREADY REAL. Lines 311, 319-367 — "P110
        Dual cognition full wire" — copilot queries cortex's real
        /api/intelligence/intuition AND /api/intelligence/mastermind BEFORE
        Ollama dispatch, with adversarial.js reconciliation between them
        (cortex.intuition+adversarial / cortex.intuition+mastermind.reconciled,
        line 358-364) when they disagree. This is genuine reasoning, not
        keyword routing, and it predates this session. What's NOT yet
        confirmed: whether AM3's routing decision and AM5/AM7's escalation
        decisions ALSO go through this dual-cognition wire, or whether it's
        scoped to the primary ask-path only — needs checking (not assuming
        either way) before AM3/AM5 are built, not before this map ships.
      reuse: "copilot/lifeline.js's real route()/extractExplicitAgent (a). guardian/server.js's real /api/copilot/prompt (b). lib/gemini-toolbox/injection.js's real chunking logic, re-pointed at lib/agent-system/contracts.js's real constraints (e). lib/emergence.js's real pivotAfter (f) — not a new retry system. lib/account-registry.js + browser-action.js's real cookies_save/cookies_restore (g) — wiring, not new primitives. lib/queue.js/seam/queue.js/contract-queue.js/scheduler.js/triggers.js/chains.js — all six kept exactly as they are, read-unified only (i). copilot/server.js's real intuition+mastermind+adversarial wire (j) — already built, this phase only needs to confirm its actual scope, not build it."
      gate: "(a) a direct 'talk to claude' call and a confidence-escalation both produce the same shape of result from the same route() call, distinguishably tagged by which path triggered them. (d) a real streamed response from Ollama and a real polled response from an NCP agent are both observable, with the difference explicit in the result shape, not hidden. (f) a real failing build contract retries via emergence.js's pivot, not a second retry loop. (g) a real simulated account failure triggers a real cookie-restore-and-reroute, logged to cortex with both the old and new account identity queryable afterward. (i) one real query surface returns real pending items from all six queue-shaped modules, tagged by source, without any of the six being modified."
      drift: "(e) and (i) both touch multiple independently-real, independently-tested systems — same consolidation risk AM7(b) already flags for chat-search; same discipline required: audit real callers before changing shared behavior, don't just extend the read surface and call it done if a write path also needs touching."
      axioms: ["§8.6", "§10.3", "§1.1", "§0.3", "§RAID"]

    AM9_get_to_know_you_and_idea_capture:
      priority: MOSTLY ALREADY REAL — two genuine real pipelines found this pass, verified not assumed.
      depends_on: [AM4]
      does: >
        (a) "Log all my ideas to idearium" — ALREADY REAL: lib/agent-tools/
        tools/propose-idea.js + lib/idea-provenance.js. Checked TAG_NS
        directly (idea-provenance.js line 47-53): origin includes 'user' (not
        just 'agent'), about includes 'user'. James's own ideas already have
        a real, valid path in with zero new code — `propose_idea({origin:
        'user', about:'user', text: ..., system: ...})`. The one real
        governance rule already there: an agent can propose+reject its own,
        never accept — only a user can accept (enforced in code, not
        convention, per the file's own header). This phase is wiring co-pilot's
        conversational surface to CALL this on a real "log this idea" signal,
        not building idearium intake — that part exists.
        (b) "Let's get to know each other" — a real, structured onboarding
        flow that pushes what it learns into AM4's real 'user' tier
        (push-recall) via intelligence's real faculties (cortex/intelligence/
        index.js's failure/pattern scanning) rather than a scripted
        questionnaire. Genuinely new: no existing flow initiates a structured
        "get to know the person" conversation — checked, not assumed (grepped
        copilot/server.js and cortex/personas.js for anything onboarding-
        shaped; found none). What DOES exist to build it FROM: AM4's real
        'user' tier + 'user_context' intent (done today), intelligence's real
        pattern/failure scanning (extend to also read push-recall — see (c)),
        and lib/agent-system/contracts.js's per-agent personality shape as
        the pattern for a per-PERSON profile shape (not built yet, same shape
        idea, new subject).
        (c) "Intelligence needs to use relevant memory systems" — CONFIRMED
        GAP, checked directly: grepped cortex/intelligence/*.js for any
        reference to push-recall or CortexPushRecall — zero hits. Intelligence's
        real failure/pattern scanning (cortex/intelligence/index.js) currently
        reads ONLY jaaDB tables (gaps/failures/event_log/component_ledger),
        with no connection to push-recall's tiered memory at all — including
        the 'user' tier AM4 built today. Real, specific, small fix: intelligence's
        _scanFailures reads push-recall's real crystal+user tiers as
        additional context when scoring a fault, not a new memory system.
      reuse: "lib/agent-tools/tools/propose-idea.js + lib/idea-provenance.js — real, complete, unmodified for (a). cortex/push-recall.js's real 'user' tier (AM4, done today) as (b)'s storage target. lib/agent-system/contracts.js's real personality shape as (b)'s pattern, applied to a person instead of an agent. cortex/intelligence/index.js's real _scanFailures — extended to read push-recall, not forked."
      gate: "(a) a real idea, said in plain conversation, produces a real propose_idea call with origin:'user', queryable in idearium afterward — not just described as possible. (b) a real 'get to know me' conversation produces real push()'d rows in push-recall's 'user' tier, retrievable via AM4's own recall(intent:'user_context') in a later session — the same gate AM4-006 already proved, applied to onboarding-sourced content instead of test content. (c) a real fault scored by intelligence shows evidence of having consulted push-recall (a crystal or user-tier row influencing its confidence/context), not just JAA tables."
      drift: "(b) risks turning 'get to know you' into a form with extra steps — the real signal is a flow that reads as conversation and produces AM4-shaped rows as a side effect, same discipline AM3 already names for build/repair-shaped turns in ordinary conversation."
      axioms: ["§8.6", "§10.3", "§0.3"]

    AM10_thinking_partner_rename_and_ui_builder:
      priority: NEW — (b) rename is verified ALREADY REAL on the backend, unwired on the trigger side; (a) and (c) are genuinely new.
      depends_on: [AM3, AM7]
      does: >
        (a) THINKING PARTNER MODE — "keep mental note," feedback on a
        contract/reflection, "let's do a brainstorming session," "let's
        continue from last time." Composes real pieces rather than
        inventing a mode: "keep mental note" is a real push() into
        push-recall (AM4, done today), tier chosen by content (crystal for
        a durable insight, user for a fact about the person, session for
        something scoped to right now). "Feedback on a contract" writes
        into the real satisfaction slot lib/reflection.js's own header
        already documents (decision_log rows carry a null satisfaction
        slot "filled in later via feedback" — this phase is a real feedback
        call-site, reflection.js's queue/scoring already exists and is
        unmodified). "Let's continue from last time" is AM7(a)'s real
        sessionId-continuity fix, called from a conversational trigger
        instead of only an agent-switch. "Brainstorm" and "teach co-pilot
        about X" are AM3's real formal-system-routing classifier (done
        this session's map) applied to two new intents rather than two new
        mechanisms.
        (b) RENAME COMMAND — ALREADY REAL ON THE BACKEND, verified
        directly: copilot/lib/self-model.js's getIdentityName()/
        setIdentityName(name) (lines 97, 111), writing to the real
        copilot_identity table. Checked copilot/server.js directly for any
        caller — ZERO hits. The backend exists; nothing parses "call
        yourself X" out of a message and calls it, unlike setCurrentAgent
        which IS wired via the directed-intent handler (confirmed earlier
        this session). This phase is that one missing trigger, not new
        identity-storage code.
        (c) UI BUILDER FROM SHARED SPEC — generates a new UI for any system
        from one shared UI spec + design philosophy (the person's own
        framing: "since they're interchangeable"). Extends SB2's universal
        structured file-parse (nexus-self-build-pipeline-phasemap.spec) to
        read the shared spec/design-philosophy source, and SB3's real
        pipeline (plan->spec->contract->RAID->...) to build the output —
        this phase's actual new content is the UI-spec-to-real-markup
        template/generator step specifically, not a second build pipeline.
      reuse: "cortex/push-recall.js's real push()/tiers (AM4) for (a)'s 'keep mental note.' lib/reflection.js's real decision_log satisfaction slot for (a)'s contract feedback. AM7(a)'s real sessionId-continuity fix for (a)'s 'continue from last time.' AM3's real classifier, two new intents not two new mechanisms, for (a)'s brainstorm/teach. self-model.js's real setIdentityName() for (b) — one new trigger, zero new storage. nexus-self-build-pipeline-phasemap.spec's SB2 (parse) + SB3 (build pipeline) for (c)."
      gate: "(a) each of the four thinking-partner phrases ('keep mental note,' contract feedback, 'continue from last time,' 'let's brainstorm') produces a real, distinct, queryable effect (a push-recall row, a decision_log satisfaction write, a resumed sessionId, a classified-brainstorm turn) — not four names for the same generic reply. (b) a real 'call yourself X' message results in getIdentityName() returning X afterward, end to end from conversation to storage. (c) a real UI-spec-driven build for a system that doesn't have a UI yet produces real markup following the shared design philosophy, verified against an existing UI's actual output for visual/structural consistency, not just 'it rendered something.'"
      drift: "(a)'s biggest risk is exactly what its own drift note elsewhere in this file already names for AM3 — four real mechanisms dressed up as one 'thinking partner' feature can quietly become four separate half-finished ones if built as a single UI surface before each piece's own gate is independently proven."
      axioms: ["§8.6", "§10.3", "§0.3"]

  ordering_rationale: >
    AM4 (user continuity, DONE 2026-08-13) and AM5 (ambiguity pull) were the
    cheapest and most independent — both extend real, already-tested systems
    with one new leaf each. AM1 (agent model) is the real foundation for AM2
    (debrief needs somewhere to write) and AM6 (needs a confidence score to
    know when it's low), and strengthens AM5's agent-model pull source once
    it exists, but AM1 itself only needs today's already-built agent-system
    substrate. AM3 (conversational routing) is independent of all four but is
    most VALUABLE once AM1/AM2 exist to route into. AM6 depends on both AM1
    (confidence signal) and AM5 (the pull ordering it slots into as the
    escalation path). AM7 is independent of all of them — it fixes real,
    separately-discovered gaps in agent-switch continuity and chat recall —
    but (d) (human-escalation) is a natural extension of AM5's ordering, and
    (b) (unifying chat search onto push-recall) directly strengthens AM4.
    Suggested build order: AM7 next (small, independent, closes real gaps
    found live) → AM5 → AM1 → AM2, AM6 (parallel) → AM3.

  honest_risks:
    - "6 phases (AM1-AM6) plus AM7 now — an ARC per this codebase's own convention (see gemini-multiagent-coding, agent-intelligence-loop), not a single turn. Each should ship whole + tested + committed, the way every phase in repair-contract-and-loom-hub did, and the way AM4 just did."
    - "AM1/AM2 let agent behavior and routing change based on observed outcomes — the same live/risky category agent-intelligence-loop's own AP4 already flagged. RAID governs every change; no silent self-modification."
    - "AM3's classifier is a new decision point with real false-positive/false-negative cost either direction — undersized scope (starting narrow, matching how R3's own REPAIRABLE_GAP_TYPES started narrow rather than 'every gap') is probably right here too."
    - "AM4 touches what co-pilot durably remembers about a specific person — the tier-and-budget discipline already in push-recall is the safeguard against this becoming unbounded or silently stale; that discipline must carry over, not just the storage shape. DONE — carried over, verified by AM4-007's own test."
    - "AM5's live web search is a new external-network capability via ClearGlass — ordering (internal-first, perplexity-before-raw-browsing) is a governance decision worth keeping explicit in the build, not just in this map."
    - "AM6 is the highest-ceremony phase here — two independent validation systems (adversarial + emergence.js) gating a write to the most durable memory tier that exists. Worth resisting the temptation to skip straight to 'perplexity agreed, crystallize it' — the whole point named in this refinement is that epistemic agreement alone isn't empirical proof."
    - "AM7(b)'s consolidation is real surgery on three live, separately-used systems — the highest-risk single item in this phase, explicitly flagged in its own drift note, not just here."

  first_build: "AM4 — DONE 2026-08-13, tested (8/8), including a real test-assumption bug found and fixed mid-build (recency lane is query-independent by pre-existing design). AM7 next: small, independent, closes gaps found by direct verification this session rather than left mapped-and-assumed."
