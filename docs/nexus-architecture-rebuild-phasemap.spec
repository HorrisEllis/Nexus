spec:
  meta:
    name:        nexus-architecture-rebuild
    roadmap: 'later — later (declutter 2026-10-09, James: "okay")'
    version:     0.1.0-phasemap
    status: >-
      DRAFT 2026-08-13 — written per §8.5 (map before build), bottom-up per direct
      instruction: >-
      fix the data/supervision layer before any UI touches it.
      P1/P2 done same session, live-traced from real Windows boot logs, not
      assumed from reading code alone.
    uuid:        nexus-architecture-rebuild-v0-0000-2026-0813-001

  goal: >
    Bottom-up architecture rebuild, in the order given: fix architect (the dangling-hook
    flood + autopilot's crash-recovery gaps) using real evidence from live Windows boot
    logs, THEN rebuild forge-shell with loom's theme and per-system phasemap progress
    bars, THEN consolidate cockpit into a real copilot control surface, THEN a toast
    system for copilot, THEN schema-based persistence system-wide — explicit schemas for
    anything deterministic, cortex's flexible JAA store for anything probabilistic/dynamic.

  # ── PHASES — bottom-up, each shippable, each gated on real evidence ──
  phases:

    P1_dangling_hook_flood:   # ← DONE 2026-08-13
      why_first: "The data layer under everything else — a rebuilt architect UI on top of hundreds of false-positive GAPs per boot just inherits the noise."
      does: >
        loom/scanners/source-map.js's mapSource() declared an .export hook for
        EVERY scanned file unconditionally (986 files), not just files something
        actually requires. A file nothing imports (test files, CLI scripts,
        standalone entry points) got a hook with zero possible wires — exactly
        service/nexus-diagnostic.js's isOrphanOut dangling-hook condition.
        mapObservability/mapWarp/mapCopilotCapability already guarded this
        correctly with a requiredBy Set; mapSource — the one function scanning
        the WHOLE tree — never had it. Mirrored the same guard.
      axioms: "§16.5 (reuse the pattern already correct elsewhere in the same directory, don't reinvent), §1.1 (verified against the real 986-file tree, not assumed)"
      gate: "measured against the live tree: 484 of 986 files (49%) would no longer get a bogus .export hook. Confirmed with a synthetic unit test first (real dependency still gets its hook, genuine leaf does not), then the real scan."
      evidence: "user-pasted real Windows boot log — hundreds of 'GAP nexus.X: dangling-hook' lines per boot; cortex's own intelligence system had crystallized it as a pattern: 'dangling-hook gaps keep recurring (98x open) — likely a systemic bottleneck.'"

    P2_autopilot_spawn_crash:   # ← DONE 2026-08-13
      why: "Same bottom-up principle — a supervisor that can die from one bad spawn() call undermines every phase built on top of it, including the phasemap UI itself (which would need to read live status from something that just crashed)."
      does: >
        autopilot.js's _spawnKernel() called spawn() unwrapped. A synchronous
        spawn() throw on Windows ("Error: spawn UNKNOWN", errno -4094, confirmed
        live) propagated straight out of the setTimeout callback that calls
        _spawnKernel, crashing the ENTIRE autopilot process — not just the one
        kernel. The pasted log ends exactly there: raw stack trace, bare shell
        prompt, every kernel now unsupervised. The existing 2026-07-10 memory
        gate (spawnSafe()) already prevents the common OOM-driven case but had
        no catch-all for any OTHER synchronous throw. Wrapped the spawn() call
        in try/catch; on catch, routes through the EXACT SAME crash-accounting,
        circuit-breaker, and backoff the real proc.on('exit',...) handler
        already uses a few lines below — not a second, untested recovery path.
      axioms: "§1.2 (loud, never silent — logs the real error/code, not a swallow), §16.5 (reuse the proven exit-handler's crash logic, don't duplicate a new one)"
      gate: "syntax-verified; every symbol used in the new catch block (CIRCUIT_MAX_CRASHES, _prune, _writeCircuitGap, BACKOFF_MAX_MS, etc.) confirmed as the SAME already-proven module-level bindings the adjacent real exit-handler uses, not new/untested ones."
      honest_limit: "the Windows-specific synchronous spawn() throw itself cannot be reproduced in this (Linux) environment — same class of limit as every Electron/clear-glass fix earlier this session. Traced and fixed from the real pasted stack trace, not guessed; needs a real Windows boot to confirm the crash no longer takes down the whole supervisor."
      evidence: "user-pasted real Windows crash: orchestrator + copilot both exited with STATUS_STACK_BUFFER_OVERRUN near-simultaneously (likely a shared corrupted resource right after 'BREAKING STALE FLUSH LOCK (event_log)'), then autopilot's own respawn attempt threw synchronously and killed the whole supervisor."

    P3_remaining_dangling_hooks:
      why: "P1 closed ~half the flood by fixing the mechanism; the other ~500 files ARE real dependencies of something, so any of those still flagged dangling would be genuine wiring gaps, not false positives."
      does: >
        Reboot on the real machine, get the real post-P1 dangling-hook count,
        and triage what's left — real missing wires (fix them) vs. remaining
        false positives (find the next mechanism, same discipline as P1).
      axioms: "§1.1 (nothing assumed fixed until measured against a real boot)"
      gate: "a real post-fix boot log, dangling-hook count compared directly against the pre-fix log already on record in this conversation."

    P4_forge_shell_rebuild:   # ← DONE 2026-08-13
      why: "Highest leverage per direct instruction — the data for this already exists (loom_scan's phasemap action, every phasemap file, phasemap-map.js's own done/pending/in-progress parsing, already proven working all session). Rendering problem, not a data problem."
      does: >
        Rebuild forge-shell themed like loom (not Eravos this time — this is
        loom's own surface, distinct from the copilot conversations channel
        already built). Per-map phasemap progress bars: every phase from
        every phasemap file in docs/, grouped by map, live status
        (done/pending/in-progress) pulled from the same loom_scan mechanism
        used throughout this session, not a new data path.
      axioms: "§16.5 (reuse loom_scan/phasemap-map.js, don't build a second phasemap reader)"
      gate: "the rebuilt shell shows every phase from every real phasemap file, live, matching loom_scan's own output exactly — no phase invented, none silently dropped."
      shipped_as: >
        Two commits (9b9d3ed, 1b58e98) built the LOOM tab and its rendering,
        but 1b58e98 itself introduced a second `GET /api/phasemap` handler
        in loom/server.js that matched the exact same route as the real
        §LP3 handler ~90 lines below it — being first in the if/return
        chain, it silently shadowed the richer one on every single request
        from the moment it shipped. Two real consequences, both live-caught
        rather than assumed: (1) the wire only ever carried {id,status} —
        title/dependsOn/systems were computed by loadAll() but never
        reached forge-shell, which is what actually blocked the phase-
        detail hydration attempted this session; (2) §LP3's own
        persistHistory() call (R0, phasemap_history) lived inside the
        shadowed block too, so real transition history silently stopped
        recording the moment P4 shipped — an honest regression P4 itself
        caused, not a pre-existing gap.
      fix: >
        Deleted the duplicate handler (kept the real §LP3 one, which
        already returned the full loadAll() shape). Rewrote forge-shell's
        renderLoomPhasemap() to group the flat, real phases[] array by map
        client-side instead of depending on a server-side pre-shaped
        (and now-thinner) systems[] — one real data path end to end,
        nothing server-side re-summarizing loadAll() a second time.
      gate_proven_live: >
        Booted loom for real (:3752). GET /api/phasemap now resolves to
        the §LP3 handler: 131/131 phases, 19/19 maps — direct
        phasemap-map.loadAll() vs the live endpoint compared by
        (map,id) key, 0 invented, 0 dropped. title/dependsOn confirmed
        present on the wire (both were absent before the fix). Hit
        GET /api/phasemap/history/agent-intelligence-loop-phasemap/
        AP1_pull_toolbox and got back a real recorded transition
        (commitHash, recordedAt) — persistHistory() confirmed reachable
        again, not just code-read as fixed. loom/test/phasemap-map.test.js:
        12/12 passing, including the two persistHistory tests. forge-shell's
        edited inline script re-extracted and node --check'd clean.
      honest_limit: "Verified against real repo state and a real local boot of loom, not the actual production supervisor — same class of limit as P2's Windows-only reproduction: confirm the LOOM tab renders correctly in forge-shell itself on the next real session, since this environment can't load forge-shell's own HTML/JS in a browser."

    P5_cockpit_to_copilot_control_surface:
      why: "James's own read: 'cockpit isn't needed, or should be rebuilt into a control surface for co-pilot.' Scope first — needs a real inventory of what cockpit currently does that ISN'T already covered by the 36 tools + nexus_help before deciding what carries over."
      does: >
        Inventory cockpit's real current surface first (§8.4 — scan before
        assuming). Keep only what's genuinely not already reachable through
        copilot's tool loop; rebuild the rest as a real control surface FOR
        copilot (not a separate, parallel UI) using the same tool/phasemap
        data already live.
      axioms: "§8.4 (scan before assuming what's dead weight), §10.3 (one control surface, not two competing ones)"
      gate: "deferred — starts with the real inventory, not assumed from memory of what cockpit 'probably' does."

    P6_copilot_toasts:
      why: "Small, real gap — copilot has no ambient way to surface a scheduled task firing, a chain halting, or RAID denying something. Right now those are silent unless someone's watching logs."
      does: >
        A real toast/notification surface for copilot-originated events —
        schedule_task firing, run_chain halting on a denied step, RAID
        denials, nerve-ollama-bridge-push pushing real context. Wired to
        events already real and already emitted this session (bus.emit
        calls already exist for all of these); this is a listener + a
        render surface, not new event plumbing.
      axioms: "§16.5 (subscribe to events that already fire, don't invent new ones)"
      gate: "a real scheduled task firing produces a real, visible toast, live — proven against schedule_task's actual bus.emit, not a mock."

    P7_schema_based_persistence_system_wide:
      why: "James's own framing, worth carrying forward explicitly rather than left implicit: schemas for anything deterministic, cortex's flexible JAA store for anything probabilistic/dynamic. Mostly already the shape of this codebase (cortex/contract/index.js is schema-shaped and deterministic; RAID/intelligence crystallization is genuinely probabilistic) — this phase names the principle and finds where it's violated, rather than redesigning something that's already mostly right."
      does: >
        Audit for violations of the split: deterministic data currently
        living loosely in JAA without a real schema (drift-prone), or
        genuinely probabilistic/evolving data forced into a rigid schema
        (friction-prone). Fix only the real violations found, not a generic
        redesign nobody asked for by name.
      axioms: "§5.4 (drift is a bug, not an oversight — applies to schema-vs-flexible-store boundary too), §1.1 (find real violations first, don't assume the split is broken everywhere)"
      gate: "deferred — starts with a real audit naming specific violations, same discipline as every other phase here."

    P8_hat_forge_command:   # ← DONE 2026-08-13, extended same session: allowedAgents + real responsibilities
      why: "Direct instruction — 'a command to make new hats.' The fixed VALID_AGENTS enum (ollama/claude/chatgpt/gemini/mistral/perplexity/auto) covers WHICH base model; it has no room for a named, reusable bundle of base agent + scoped tools + persona. Real substrate already exists for exactly this composition philosophy: lib/tool-forge.js — a forged tool is DATA, verified against real existing things at creation time, never new code. Reused directly, not reinvented."
      does: >
        Built lib/hat-forge.js (forge/get/list/revoke, mirroring tool-forge.js's
        exact validate-then-persist discipline) + lib/agent-tools/tools/
        hat-forge.js (the real command). A hat is DATA: { name, baseAgent,
        allowedAgents?, toolScope?, personaPrompt?, responsibilities? }.
        Forging refuses at creation time if baseAgent isn't real, any
        allowedAgents entry isn't real, or any toolScope entry isn't a
        registered tool. setCurrentAgent extended to accept a forged hat's
        NAME, not just a raw base agent.
        §EXTENDED SAME SESSION (James: "add tasks, jobs, and responsibilities
        to it and set the allowed agents... perplexity can be the adversarial
        agent") — allowedAgents (plural, for rotation/fallback, must include
        baseAgent) and responsibilities: [{description, everyMs>=5000, prompt}]
        — each becomes a REAL lib/scheduler.js task at forge time, dispatching
        through runViaAgent using the hat's agent, findings written to
        lib/gap-field.js (the same real path copilot/adversarial.js already
        uses — one gap list, not a second siloed one).
        §CAUGHT DURING VERIFICATION, not after shipping: narrowing which
        tools are OFFERED in the prompt does not stop a model from NAMING
        an out-of-scope tool anyway. Added a generic allowedTools param to
        lib/agent-tools/index.js's runToolLoop itself (sovereign — any
        caller can use it, not hat-specific) so an out-of-scope call is
        actually REJECTED before execution, not just discouraged.
        Also exported copilot/lifeline.js's private _tryGuardian as
        dispatchToNcpAgent — the real public surface a hat's responsibility
        needs to dispatch to a named NCP agent, replacing a placeholder
        reference to a function that didn't exist, caught before shipping.
      axioms: "§16.5 (reuse tool-forge.js's verified-composition philosophy, don't build a parallel one), §1.1 (nothing forged until every real reference it names is verified to exist; scope is enforced, not just suggested)"
      gate: "live-verified end to end with the actual real example: forged 'adversarial_prober' — baseAgent:perplexity, allowedAgents:[perplexity,chatgpt], a real responsibility ('attack the weakest recent NEXUS decision', every 60s) — confirmed a REAL scheduled task ('hat-responsibility.adversarial_prober.0') was armed in lib/scheduler.js with the correct everyMs and status:'scheduled'. Also: forge with a fake tool name refused naming exactly which entry; a mock tool-loop run with an out-of-scope tool call confirmed the real tool never executes. Test hat and task cleaned up after verification, no leftover state."

    P9_multi_agent_parallel_dispatch:   # ← DONE 2026-08-13, all three real questions answered concretely
      why: "Direct question, worth taking seriously rather than building blind: 'why only have one?' Real substrate checked first: lib/chains.js's own docblock states it plainly — 'run steps sequentially.' Genuine concurrent dispatch (different jobs to different agents AT THE SAME TIME, not one after another) did not exist anywhere in this tree."
      does: >
        lib/parallel-dispatch.js: dispatchAll(jobs, opts) — DIFFERENT jobs
        to DIFFERENT agents at the same time. The three real questions
        this phase was deliberately left open on are now each concretely
        answered, not just discussed: (1) concurrent RAID gating — every
        job gets its OWN independent governAction() check, called
        concurrently, one denial never affects another job's own check;
        (2) rate limits/cost — a REAL concurrency cap (maxConcurrent,
        default 3) via a semaphore-style worker pool, not unlimited
        fan-out; (3) reconciliation — dispatchAll() returns EVERY real
        result as an array, never synthesizes one fabricated "final
        answer" — same honest discipline as agent-council's summarize().
      axioms: "§10.3 (every branch individually governed, concurrency doesn't waive it), §1.2 (a failed/denied job is a real recorded result, never dropped)"
      gate: "live-verified: a real timing-based proof that maxConcurrent:2 was NEVER exceeded (tracked live concurrent counter across 5 jobs), and a real mix of 4 successes + 1 genuine failure, all correctly recorded per-job, nothing fabricated into a single answer."

    P10_safe_apply_verify_before_merge:   # ← DONE 2026-08-13
      why: "James: 'cos to isolate or branch a copy? a snapshot before the compartment just in case. a test env.' Direct answer to the gap flagged at the end of the P8/P9 turn — nexus-healer's merge/archive handlers are still real stubs ('replace with real logic', confirmed by reading the code, not assumed). This is that real logic, built on COS's real primitives instead of nexus-healer's placeholder."
      does: >
        lib/safe-apply.js: mirrorCompartment (one real copy of a target
        directory into a fresh isolated COS compartment — the 'snapshot'),
        proposeChange (forks a REAL branch via cos/playground/branch.js's
        BranchEngine, applies changes to that branch only, optionally runs
        a real check via cos/playground/sandbox.js's SandboxRunner — the
        real target is never touched here), mergeBack (the ONLY function
        that touches the real target, RAID-gated via governAction, refuses
        by default if the branch was never checked or failed its check).
        lib/agent-tools/tools/safe-apply.js wraps it as a real command.
      axioms: "§16.5 (COS's real branch/sandbox primitives, not a new isolation mechanism), §1.2 (every proposal recorded whether it passes or fails, never silent), §RAID (merge is governed the same way every other consequential action here is)"
      gate: >
        LIVE-VERIFIED, never against the real repo — a throwaway test
        directory only. §REAL BUG CAUGHT MID-BUILD: first draft
        misunderstood SandboxRunner's real contract (passed command:'node'
        as if it were a shell binary; it's actually the entry FILE to run
        with the runtime) — caught by the test itself failing with a real,
        diagnosable MODULE_NOT_FOUND, not assumed correct from the
        docstring. Fixed, re-verified: a syntactically broken file
        correctly fails its real check (exit code 1) and mergeBack
        correctly refuses it; a real fix correctly passes (exit code 0)
        and mergeBack correctly writes it into the real target directory,
        confirmed by reading the target file's real content afterward.
        Test compartments cleaned up after verification, no leftover state.

    P11_agent_council:   # ← DONE 2026-08-13 (verdict collection); decision-weighing deferred to real governAction use, not invented here
      why: "James: 'what if we use each agent, in tandem with the raid engine as a council or court to make large decisions?' A real, well-scoped piece of P9's larger question — independent multi-agent deliberation on ONE decision, not full parallel job execution."
      does: >
        lib/agent-council.js: convene(question, members, opts) asks every
        member the SAME question independently (Promise.all — no member
        sees another's answer first, same as any real deliberation body),
        via copilot/tool-runtime.js's real runViaAgent — not a new dispatch
        mechanism. Every verdict is real: a real answer, or a real recorded
        failure (a member that can't answer is a data point, never
        silently dropped). summarize() is deliberately mechanical — no
        fabricated consensus, no invented majority; picking a winner is
        governance's job, not this module's. §RAID IS THE COURT, NOT
        ANOTHER VOTE — convene() only collects; the actual decision still
        goes through governAction, the same real gate every other
        consequential action here already uses. A council that could
        out-vote RAID would defeat the reason RAID exists.
      axioms: "§16.5 (reuses runViaAgent, not a new dispatch path), §1.2 (a failed member is recorded, not dropped), §10.3 (RAID stays the single real decision point, a council of votes doesn't create a second one)"
      gate: "live-verified with real independent mocked verdicts: 3 members, genuinely DIVERGENT real answers (claude: proceed: perplexity: do not proceed, real disagreement, not an echo), 1 real recorded failure (gemini not connected) — correctly counted (respondedCount:2, failedCount:1), correctly present in the summary, never dropped."

    P12_fault_logging_first_class:   # ← DONE 2026-08-13
      why: "James: 'logging faults and failure modes each time they are made... first class data to learn and reduce redundant mistakes... extensive tagging... before each action, needs to check for relevant failure mode from fault taxonomy.'"
      does: >
        §CHECKED REAL SUBSTRATE FIRST — cortex/self-heal/fault-taxonomy.js
        already exists, is real, and is the declared sole write authority
        for the fault_taxonomy table (§10.1). Unlike guardian_chat_log, it
        DOES have real callers (cortex/self-heal/escalation.js, lib/
        config-governance.js) — not orphaned, just narrowly scoped to
        self-heal escalation and config anomalies. Nothing logged a fault
        from a failed tool call, a failed hat responsibility, or a denied
        merge.
        lib/fault-log.js: logFault() writes a richly-tagged record to a
        NEW table (fault_log) — system/agent/component/faultClass/status/
        intent/causedBy — AND calls fault-taxonomy.js's own real
        raiseFriction() where the faultClass genuinely fits (§10.1 respected
        — never a second writer to fault_taxonomy itself). "Conditions" is
        CFR's real getState() snapshot (nexus-cfr-influence.js) at the
        moment of failure, not invented. checkFaultHistory() is the
        pre-action check — real past faults for a component, most recent
        first, ADVISORY (a fault having happened before is real
        information, not proof it will happen again — RAID/governAction
        decides what to do with it, this module only surfaces it).
        Wired into BOTH universal chokepoints already proven this session:
        lib/agent-tools/index.js's executeTool (every one of 42 tools,
        zero per-tool changes — checks history before running, logs a
        real fault automatically on any error, attaches _faultHistory to
        every result) and copilot/lib/self-model.js's governAction (every
        switchAgent/hat-wear/scheduled-task/trigger/chain-step already
        goes through this).
        §HONEST_LIMIT — "causal graph" as asked means a real traversable
        graph of what-caused-what; this gives each fault a real causedBy
        POINTER (one real id), not a graph. Building an actual graph means
        walking bus events/component_ledger/event_log to link faults to
        real upstream causes — a genuinely separate, larger piece, scoped
        out on purpose rather than faked with a shallow one-hop link
        dressed up as a graph.
      axioms: "§10.1 (fault-taxonomy.js stays the sole writer for its own table), §1.2 (every fault is a real record, never silent), §16.5 (extends the real existing module, doesn't replace it)"
      gate: "live-verified end to end: a real tool call failure gets logged automatically (checkFaultHistory('hat_forge') sampleSize 0 → call fails → sampleSize 1, confirmed by a SECOND call seeing real precedent via _faultHistory attached to its own result, not asserted). governAction confirmed to attach real faultHistory to its own output."

    P13_roundtable_shared_council_chat:   # ← DONE 2026-08-13
      why: "James: 'what about a shared chat where the council can all talk to each other, me included?' Deliberately the OPPOSITE of P11's agent_council, which is independent by design (so a real disagreement is provably real, not an echo) — this is the other real need: everyone sees everything, in order, and can respond to what was actually said. Both stay; this isn't a replacement."
      does: >
        lib/roundtable.js: open(topic, members) — the user is added
        automatically, first-class, not a bolted-on special case. post()
        — any member (including 'user') adds a real message to the one
        shared thread. speak(roundtableId, member) — invites ONE member
        to respond, given the FULL real shared thread as context (not an
        isolated exchange), their real answer posted back into the same
        thread. §TURN-BASED ON PURPOSE — nothing auto-chains agents
        replying to each other forever; that's a real, considered
        decision (unbounded auto-reply is a genuine cost/runaway risk
        nobody asked for), not an oversight. The caller decides who
        speaks next, every time.
      axioms: "§16.5 (reuses runViaAgent for real dispatch, same as agent-council), §0.4 (the user stays in control — can post at any point, chooses who speaks next)"
      gate: "live-verified: user posts a real question, claude responds (sees only the user's message so far), perplexity responds NEXT and its dispatch call is confirmed to include claude's actual prior turn in the transcript — proving real shared visibility, not independent isolation. Final thread confirmed in correct chronological order, all 4 real turns present."

    P14_emergence_axioms_endstate:   # ← DONE 2026-08-13
      why: "James: 'using cos for creating conditions for emergence. minimal conditions for an acceptable artifact. say you set axioms, end-state, and have the system try to solve the problem, or bridge the gap. if it can't innovate the problem, innovate the method.'"
      does: >
        lib/emergence.js: attempt(compartment, spec, opts) — a real loop,
        built entirely on what already exists (§16.5): safe-apply.js's
        real propose/verify (a real isolated COS branch per candidate,
        never touching the real target), runViaAgent (this session's own
        tool loop) proposing each candidate, fault-log.js's real
        precedent recording every failure. The actual distinction
        requested — "innovate the problem" (try a different candidate
        within the same method) vs "innovate the method" (change
        approach) — is made REAL, not vague: after pivotAfter (default 3)
        consecutive failures of the SAME method (the label the agent
        itself gave its own approach, not guessed), the next prompt
        EXPLICITLY changes shape — "do not refine it further, propose a
        genuinely DIFFERENT approach" — a structural difference in what's
        asked, not an instruction to "be creative."
      axioms: "§16.5 (built on safe-apply/runViaAgent/fault-log, no new isolation or dispatch mechanism invented), §1.1 (every candidate is really tested in a real isolated branch, nothing assumed to pass)"
      gate: >
        LIVE-VERIFIED the exact mechanism, not just designed: mocked an
        agent that keeps trying "bruteforce" variations (all correctly
        fail the real check) for 3 consecutive attempts, confirmed the
        4th prompt's instruction text genuinely changed to demand a
        different approach, confirmed the agent's own next response used
        a different method label ("elegant"), and confirmed that
        candidate genuinely passed the real check. Full instruction
        sequence printed and inspected — not asserted from the return
        value alone, the actual text sent to the agent at each step was
        checked.

    # ── UI CONSOLIDATION — added 2026-08-13 on James's direct instruction ──
    # Framing, in his words: the P4 approach was "completely backwards."
    # forge-shell was treated as the thing being fixed and loom's phasemap
    # system as a data source it fetched from. It is the other way round:
    # loom OWNS the architecture model (components/hooks/wires/seams AND the
    # phasemap parser), and the UIs are views onto it. Every phase below moves
    # a surface INTO loom rather than teaching another surface to call it.
    #
    # §PRESERVE, DO NOT DELETE. P4 deleted forge-shell's hand-written 45-phase
    # array outright. That array held real historical description prose
    # (dependencies, unlock chains, per-phase intent) that exists NOWHERE in
    # docs/*.spec — deleting it destroyed history to make a count correct.
    # Every phase below MERGES old content into the new model. §16.5's "delete
    # before add" governs dead code, not the only surviving copy of something.

    P15_forge_shell_into_loom:
      why: "James: 'completely break down and rebuild forge-shell in loom and use the existing phasemap system in loom to populate what's missing, merge forge shell and loom's phasemap system into loom, with the forge UI.' Today forge-shell lives at ui/forge-shell/ and reaches across to loom :3752 for phase data while ALSO carrying its own frozen array. Two sources, one of which drifted by 86 phases. loom already owns the parser; it should own the surface."
      does: >
        Move the forge UI into loom as loom's own surface, served by
        loom/server.js, reading loom/scanners/phasemap-map.js directly
        rather than over HTTP from another origin. MERGE the historical
        45-phase array into the phasemap model rather than deleting it:
        its descriptions, dependency chains and unlock edges are real
        history and must survive the move, carried as archived phase
        records clearly marked with their 2026-07-19 origin so they are
        never confused with live status.
      axioms: "§16.5 (loom's parser already exists — move the view to it, don't duplicate the data), §5.4 (one phasemap, one truth, no second array), §1.1 (nothing that exists only in the old array may be lost in the move)"
      gate: >
        The forge UI is served BY loom, shows every live phase from every
        real phasemap file, AND every one of the 45 historical phases is
        still retrievable with its original description text — proven by
        diffing the pre-move array against the post-move store, count and
        content, not by asserting the migration ran.

    P16_architect_node_canvas_in_loom:
      why: "James: 'architect ← loom's node based architecture canvas.' loom already holds every component, hook, wire and seam — the complete node graph — and architect currently renders its own separate view of a model it does not own."
      does: >
        Build the node-based architecture canvas as loom's own surface,
        rendering loom's real component/hook/wire/seam registry. Architect
        becomes a consumer of that canvas rather than a parallel renderer.
        Blocked-by-honesty gate: the registry must first be clean enough
        to render truthfully — see P3.
      axioms: "§16.5, §1.1 (a canvas over a registry with 238 dangling hooks draws a graph that is not the real one)"
      gate: "deferred — the canvas renders loom's real registry, and every node/edge drawn resolves to a real registry row. Explicitly gated on P3's remaining route/import classes being resolved or visibly marked, not silently drawn as healthy."

    P17_blueprint_builder_onto_canvas:
      why: "James: 'blueprint builder ← loom's node based architecture canvas.' Same data, same canvas — a blueprint is a proposed subgraph, not a different kind of thing."
      does: >
        Migrate ui/blueprint-builder onto P16's canvas, so building a
        blueprint is composing real registry nodes rather than drawing
        shapes that later have to be reconciled with reality.
      axioms: "§16.5 (one canvas, two modes — not two canvases)"
      gate: "deferred — depends_on: P16"
      depends_on: [P16]

    P18_tv_ui_triage:
      why: "James's own read, verbatim: 'Useless in the current state. Either scrap or rebuild completely: guardian ui, cortex, bridge, diagnostic, orchestrator, emerge.' Six surfaces named. The decision per-surface is scrap-or-rebuild, and that decision needs evidence, not a vibe."
      does: >
        Per surface, in this order — inventory what it actually renders
        today and where that data comes from; decide scrap vs rebuild on
        that evidence; record the decision and its reason in this phasemap
        so the choice is auditable later. Rebuilds land on loom's real
        model (P16's canvas or the phasemap surface), not on new
        per-surface data paths. Scrapped surfaces are ARCHIVED, not
        deleted — same rule as P15's array.
      axioms: "§8.4 (scan each surface before judging it), §16.5 (rebuild onto the shared model), §1.1 (record the real reason per surface)"
      gate: "deferred — each of the six has a written scrap-or-rebuild decision with the evidence behind it. No surface is deleted without its content archived first."

    P19_tablet_continue:
      why: "James: 'continue tablet.' T1–T4 (disk-backed ledger explorer, container shell, config governance, brain view) are already built; the arc was paused, not finished."
      does: >
        Resume the tablet arc from its real current state — inventory what
        T1–T4 actually left working first (§8.4), then continue rather
        than restart.
      axioms: "§8.4, §3.1 (bottom-up from what's really there)"
      gate: "deferred — starts with a real inventory of T1–T4's shipped state, not from memory of what was planned."

    P20_intelligence_reads_present_not_oldest:
      why: >
        Not previously in this phasemap and it should have been. cortex/intelligence's
        _scanPatterns reads jaaDB.query('event_log', ...), and query() iterates from
        index 0 and breaks at the limit — it returns the OLDEST 500 events, forever.
        tail() (the correct function) is defined 19 lines below in the same file and
        is called zero times by the engine. Combined with _patternScanCursor being set
        to now after the first pass, nothing new is ever counted again in that process.
        Live evidence: "dangling-hook fires in bursts (116403x observed)" and
        "gaps keep recurring (100x open)" printed byte-identical across three
        consecutive boots spanning a change that removed ~450 GAPs per boot. The
        system has been reciting a fixed old window while reporting it as observation.
      does: >
        Replace the event_log reads with tail(), including a
        predicate-aware tail for the two filtered reads. Stratify the
        sample per event type so one loud type cannot crowd out every
        other signal. Reconcile the 508 stale open `gaps` rows feeding the
        "100x open" claim — closed by evidence, not deleted wholesale.
      axioms: "§0.1 (evidence over confidence — an engine reporting confidence from a stale window is the exact failure this axiom names), §1.2 (a stale reading must not present as a live one)"
      gate: >
        The crystallised counts CHANGE between two boots with genuinely
        different activity. Today they are byte-identical across three —
        that identity is the bug, and its disappearance is the proof.

    P21_loom_boundary_import_hooks:
      why: "Third instance of the same missing-guard bug P1 fixed. The hand maps declare wires into .import hooks they never create — observability.wire.1 targets nexus.copilot.diagnostics.import; the component exists, the hook never does. ~11 wires, measured on a real from-scratch regen."
      does: >
        Mirror mapSource's requiredBy guard in the hand maps' import pass,
        so a wire is only declared when both endpoints will really exist.
      axioms: "§1.1, §16.5 (the guard already exists in mapSource — apply it, don't invent a second one)"
      gate: "measured drop in dangling `import` hooks from the current 13, on a real from-scratch regeneration."

    P22_scanner_hand_map_id_drift:
      why: >
        Three files are excluded from the source scan as "hand-mapped" but no map
        declares them under the scanner's id, so they exist nowhere the wires can
        reach. lib/agent-tools/index.js and copilot/server.js are in
        copilot-capability-map's FILES yet neither component is in the registry —
        only their .tools.* children — which is why all 6 remaining dangling exports
        are agent-tools/tools/* wiring to a component that isn't there.
        clear-glass/src/diagnostic/error-capture.js is excluded under
        nexus.clear-glass.src.diagnostic.error-capture and declared as
        nexus.clear-glass.error-capture.
      does: >
        Reconcile the ids, and add a real assertion to loom/bootstrap.js:
        every path listed as hand-mapped must resolve to a component that
        actually exists after bootstrap, loudly, not silently.
      axioms: "§5.4 (id drift is a bug), §1.2 (assert loudly rather than let a file vanish between two maps)"
      gate: "bootstrap fails loudly if any hand-mapped path has no component; the 6 agent-tools dangling exports resolve."


  ordering_rationale: >
    P1→P2 are the actual bottom: the loom registry (what everything else reads) and
    the process supervisor (what keeps everything else running) both had real,
    live-evidenced bugs, found from real Windows logs, not assumed from reading code.
    P3 closes the loop on P1 with real post-fix measurement. P4 builds on a data layer
    that's now real and stable. P5→P7 are the higher-level consolidation work, each
    explicitly gated on a real inventory/audit first rather than assumed scope, per
    this whole session's own established discipline.

  honest_risks:
    - "P2's fix cannot be live-verified in this environment (no Windows) — the exact failure mode it targets only reproduces on the real machine. Confirm on next real boot."
    - "P3 assumes the remaining ~500 hook-bearing files are correctly wired; some may reveal genuine gaps once the noise is gone — that's the point of P3, not a flaw in P1."
    - "P5 risks scope creep if 'control surface for co-pilot' isn't bounded by a real inventory first — explicitly gated on that in the phase itself."
