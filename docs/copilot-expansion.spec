spec:
  meta:
    name:     copilot-expansion
    version:  1.2.0
    uuid:     nexus-copilot-expansion-v1-0000-2026-0627-jamesbrooks-001
    status:   active
    purpose: >
      Everything NEXUS can do, co-pilot can access.
      Co-pilot learns and expands itself — user describes a capability,
      co-pilot maps it, specs it, builds the module bottom-up, runs QC,
      gets it merged. Ollama is the primary model, Guardian is the fallback.
      Axioms are manageable via CLI and co-pilot. Everything is contractual.

  addendum:
    - version: 1.2.0
      date:    2026-07-11
      changes: >
        The gap named in the 1.1.0 addendum below — a dispatched contract
        with no Emerge-side consumer — is closed. emerge/consumer.js is
        new: polls lib/contract-queue.js's pending('emerge') (the same
        file-drop queue module-builder.js already wrote to — no new
        queue mechanism), writes the contract's spec to disk, and runs it
        through emerge/compiler/pipeline.js's compile() — a real,
        complete code generator that existed with zero callers until now.
        Reports accept/complete/fail two ways: into the contract's own
        file (durable, no network needed) and as a POST to a new
        copilot/server.js endpoint, POST /api/event → streamIngest() —
        the missing push counterpart to copilot's previously pull-only
        SSE-subscription pattern, since Emerge has no SSE server of its
        own to be subscribed to (it's a library, not a service).

        Added to autopilot.js's supervised kernel list (optional: true,
        same as copilot/loom) — without this the consumer doesn't run at
        all, contracts sit in emerge/input/ forever regardless of how
        correct the consumer code is.

        Verified live, the actual full loop, not simulated: dispatched a
        real contract via lib/contract-queue.js exactly the way
        module-builder.js does, ran the consumer, and it produced real
        compiled output — TypeScript type definitions, package.json,
        tsconfig.json — in data/emerge/builds/<uuid>/. First attempt
        failed honestly (missing js-yaml dependency, now declared for
        real in package.json, not just installed ad hoc) — the consumer's
        own error handling caught it, called cq.fail(), and reported the
        failure correctly rather than crashing. Second attempt, same
        contract (auto-requeued by contract-queue's own retry logic),
        succeeded end to end. The compiler was real and complete the
        whole time; it had simply never been fed anything.
    - version: 1.1.0
      date:    2026-07-11
      changes: >
        Phase 4 (copilot/module-builder.js) was still marked "pending"
        below despite being a real, substantial implementation —
        map → generateSpec → QC loop (self-correcting, up to 3
        iterations) → contract creation, all real, all working. Updated
        its phase entry to reflect that.

        Real gap found and left honestly documented, not silently
        patched over: contract dispatch (Step 4 below) writes a real
        file to emerge/input/<uuid>.json via lib/contract-queue.js's
        dispatch() — a file-drop queue, not pub/sub — and nothing
        anywhere under emerge/ has ever consumed it. Confirmed by
        grepping every file in that directory for any reference to the
        contract queue at all: zero. orchestrator/lib/contract-poller.js
        only notices a contract sat too long and opens a gap about it;
        it does not build anything either. The pipeline runs correctly
        all the way to "here is a build contract" and then the contract
        is never picked up.

        THE EXPECTATIONS ADDENDUM (what should happen, made testable):
        added expectation 'module-build-dispatched-then-accepted' to
        copilot/lib/expectation-watcher.js's DEFAULT_EXPECTATIONS —
        trigger emerge.contract.dispatched, expect emerge.contract.
        accepted|complete|failed within 6 minutes, linked by contractUuid.
        copilot/server.js's POST /api/build now emits the real trigger
        event the moment cq.dispatch() actually fires (result.passed &&
        result.contract), not a simulated one. This makes the gap above
        a permanent, automatic, observable test instead of a silent dead
        end — every real build request checks itself. Verified live,
        both directions: fires the violation correctly when nothing
        follows up (today's actual state — this SHOULD fire on every
        build right now, that's correct, not a bug in the expectation),
        and stays silent when a real follow-up arrives in time (the
        state once Emerge gets a real consumer). Considered whether
        bridge/causal/expectation.js's ExpectationEngine was a better
        fit — it isn't; that engine is scoped specifically to Bridge's
        SEAM queue state machine (expectedPath sequences over
        SEAM_STATES), not a generic cross-system trigger→followup timing
        check the way copilot's expectation-watcher already is.

        NOT built this pass, and it's the actual next piece: an Emerge-
        side consumer that watches emerge/input/, calls cq.accept() then
        cq.complete()/cq.fail(), and does something real with the
        module_build payload (spec, plan, architecture selection).
        Until that exists, "request a build" reliably produces a real,
        inspectable, well-formed contract — and reliably goes no further.

  axioms_enforced:
    - §AX-1   Map first, always
    - §AX-3   Gaps asked, never assumed
    - §AX-7   Spec first, build second
    - §AX-8   Build in phases, bottom-up
    - §AX-10  Changelog every session
    - §LAW-II Disk before behavior

  audit:
    EXISTS_AND_WORKS:
      - constitutional-ai.js          # axiom checking — has check(), but no add/remove
      - lib/constitutional-ai.js      # IDENTITY_KERNEL with typed axioms
      - lib/contract-queue.js         # contract schema + disk write ✓
      - lib/contract-poller.js        # stuck contract detection ✓
      - cortex/intelligence/intuition.js   # fast faculty ✓
      - cortex/intelligence/mastermind.js  # strategic faculty ✓
      - cortex/intelligence/adversarial.js # probe + ping-pong ✓
      - ollama/server.js              # sovereign ollama bridge :3749 ✓
      - copilot/server.js             # sovereign co-pilot :3750 ✓
      - cortex/core/raid/snr-filter.js     # quality gate (invariant/pattern/AI)

    EXISTS_BUT_WRONG_PLACE:
      - guardian/agents/co-pilot/index.js  # 996 lines — move to copilot/
      - guardian/agents/ollama.js          # move to ollama/agent.js
      - guardian/agents/index.js           # orchestration logic — move to copilot/

    NEEDS_BUILDING:
      - copilot/axiom-manager.js           # add/remove/list axioms via CLI + co-pilot
      - copilot/lifeline.js                # Ollama primary, Guardian fallback
      - copilot/module-builder.js          # co-pilot builds its own modules
      - copilot/qc-pipeline.js             # RAID/SNR/Adversarial quality gate
      - lib/capability-registry.js         # every NEXUS capability registered
      - cli/axiom.js                       # CLI: axiom add/remove/list/freeze

  systems_map:

    CO-PILOT :3750:
      role:     "Mind — user intent, context assembly, tool routing"
      owns:
        - Continuous stream (500 events, live from Cortex + Guardian SSE)
        - INTUITION faculty (reads Cortex patterns, crystals, sigma)
        - ANALYSIS faculty (7-layer context + Ollama via LIFELINE)
        - ADVERSARIAL faculty (probes + ping-pong every 60s)
        - Module builder (spec → build → QC → merge)
        - Axiom manager (add/remove/list via CLI and conversation)
        - Capability registry reader (knows everything NEXUS can do)
      does_NOT_own:
        - Model inference (that's LIFELINE → Ollama → Guardian)
        - Memory (that's Cortex)
        - Job dispatch (that's Guardian)
        - File execution (that's Emerge + autonomous-loop)

    LIFELINE (copilot/lifeline.js):
      role:     "Model router — Ollama primary, Guardian fallback"
      priority:
        1: Ollama Bridge :3749  — local, zero cost, sovereign
        2: Guardian :7820       — NCP providers (claude, chatgpt, mistral, gemini)
        3: Error with context   — never silent
      lifeline_protocol:
        - Send to Ollama
        - If confidence_score < threshold (0.75): escalate to Guardian NCP
        - Guardian NCP uses best available provider (RAID decides)
        - Result tagged with: provider_used, confidence, escalated:bool
        - All results written to Cortex chat_log via cortex-write
      note: >
        Ollama can ask Guardian if it needs help — that's the lifeline.
        When Ollama's own confidence is low, it doesn't fail silently.
        It escalates to the NCP layer where a better model can answer.

    AXIOM MANAGER (copilot/axiom-manager.js):
      role:     "Add, remove, list, freeze axioms via CLI + co-pilot"
      storage:
        primary:   JAA table 'law_violations' (existing) + new 'axioms' table
        file:      docs/AXIOMS-runtime.json  (append-only, never edit AXIOMS-v1.0.md)
      tiers:
        IMMUTABLE: §1.x, §2.x, §3.x, §4.x, §5.x  (from AXIOMS-v1.0.md, frozen)
        RUNTIME:   User-added axioms, can be removed via CLI with confirmation
        PATTERN:   Auto-promoted from crystallised patterns above 0.9 confidence
      CLI:
        nexus axiom list             → all axioms with tier + status
        nexus axiom add "§X.Y text"  → add runtime axiom, write to JAA + file
        nexus axiom remove §X.Y      → remove runtime axiom (immutable: reject)
        nexus axiom freeze §X.Y      → promote runtime → immutable
        nexus axiom check "prompt"   → run constitutional check on arbitrary text
      co-pilot:
        "add axiom: X"          → calls axiom-manager.add()
        "list axioms"           → calls axiom-manager.list()
        "remove axiom §X.Y"     → calls axiom-manager.remove() with confirmation
        "is X allowed?"         → calls constitutional-ai.check()

    MODULE BUILDER (copilot/module-builder.js):
      role:     "Co-pilot builds its own modules from user description"
      flow:
        1. User: "I want co-pilot to be able to do X"
        2. Module-builder: map the capability → check capability-registry (already exists?)
        3. If missing: generate spec using nexus-system-foundation template
        4. Spec → RAID/SNR quality gate (does it follow axioms + architecture?)
        5. If fail → back to co-pilot with specific failure reason
        6. If pass → write contract to relevant system's input/ folder
        7. Contract-poller picks it up → dispatches to Emerge for build
        8. Emerge builds bottom-up (L0 → L1 → L2 → L3 → L4 → L5)
        9. Output written to system output/ folder
        10. QC pipeline runs adversarial review
        11. Pass → tagged READY_FOR_BUILD, merged to codebase
        12. Fail → back to co-pilot with failure detail + diff
      contract_shape:  # extends contract-queue.js CONTRACT shape
        type:          'module_build'
        spec:          string    # the generated spec
        capability:    string    # what it enables
        targetSystem:  string    # which system it extends
        qcStatus:      enum      # pending|in_review|passed|failed
        qcFailReason:  string
        iterations:    number    # how many QC cycles

    QC PIPELINE (copilot/qc-pipeline.js):
      role:     "RAID/SNR + Adversarial quality gate for module contracts"
      stages:
        1. SNR filter:     does the spec follow invariants? (zero tokens)
        2. Axiom check:    does it violate any law? (constitutional-ai)
        3. Architecture:   does it follow nexus-system-foundation layers?
        4. RAID approval:  _approveTool() on the proposed build action
        5. Adversarial:    send to adversarial.pingBoth() with the spec as prompt
        6. Contradiction:  if INTUITION and MASTERMIND disagree on quality → fail
      result:
        { passed, stage_failed, reason, suggestions, confidence }
      on_fail:
        - Tag contract with qcStatus: 'failed' + qcFailReason
        - Write to contract's output/ folder
        - Co-pilot reads failure, synthesises fix with user if needed
        - Re-submit → new iteration

    CONTRACT QUEUE + FOLDER SYSTEM:
      # Already built. Enhancement: add progress tracking + fulfillment check
      progress_states:
        RECEIVED:     written to input/ folder
        ACCEPTED:     system acknowledged
        IN_PROGRESS:  system is working on it
        QC_REVIEW:    in quality check
        PASSED:       QC passed, ready to build
        BUILT:        Emerge built it
        VERIFIED:     tests pass
        COMPLETE:     merged, moved to Cortex archive
        FAILED:       failed QC, back to co-pilot
        STUCK:        >45s with no progress, re-queued
      fulfillment_check:
        - On recovery: read contract + check JAA for evidence of completion
        - If component exists in component-registry: mark COMPLETE
        - If still building: restore to IN_PROGRESS
        - If no trace: re-run from last known state
      last_interaction_map:
        fromSystem:     who last touched it
        fromComponent:  which component
        toSystem:       where it's going
        toComponent:    which component
        why:            human-readable reason
        ts:             timestamp
        progress:       current state enum

  migration_plan:
    from_guardian_to_copilot:
      - guardian/agents/co-pilot/index.js → deprecated (copilot/server.js is canonical)
      - guardian still proxies /api/guardian/copilot/prompt → copilot:3750
      - No breaking change. Proxy stays forever.

    from_guardian_to_ollama:
      - guardian/agents/ollama.js → ollama/agent.js (wrap existing logic)
      - guardian still boots ollama via SOFT phase (unchanged)
      - ollama/server.js is the new primary surface
      - guardian uses ollama/server.js via HTTP, not internal import

    capability_registry:
      - Read from: component-registry (all registered components)
      - Augment with: what each component DOES (description, examples, when to use)
      - Co-pilot reads this to know what tools it has
      - User asks "can you X?" → co-pilot checks registry → routes or says what's missing

  phases:
    - id: 1
      name: copilot/axiom-manager.js + cli/axiom.js
      status: next
      builds: [add/remove/list axioms, CLI surface, co-pilot verbs]

    - id: 2
      name: copilot/lifeline.js
      status: pending
      builds: [Ollama primary, Guardian fallback, confidence-gated escalation]
      deps: [ollama/server.js ✓, guardian :7820 ✓]

    - id: 3
      name: lib/capability-registry.js
      status: pending
      builds: [every NEXUS capability indexed, co-pilot reads it]
      deps: [component-registry.js ✓]

    - id: 4
      name: copilot/module-builder.js
      status: complete   # map/generateSpec/QC/contract real & verified; emerge/consumer.js closes the loop — verified live end to end
      builds: [spec generation, contract creation, bottom-up build flow]
      deps: [phases 1-3, contract-queue ✓, emerge :4242 — dispatch ✓, consume/build ✓ (emerge/consumer.js)]

    - id: 5
      name: copilot/qc-pipeline.js
      status: pending
      builds: [RAID/SNR/Adversarial quality gate, iteration loop]
      deps: [phase 4, constitutional-ai ✓, adversarial ✓]

    - id: 6
      name: contract progress tracking
      status: pending
      builds: [fulfillment check, last-interaction map, folder watch + re-queue]
      deps: [contract-queue.js ✓, contract-poller.js ✓]
