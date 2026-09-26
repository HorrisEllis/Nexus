spec:
  SUPERSEDED_NOTICE: >
    §10.3 RESOLVED 2026-08-08. This map is the EARLIER DESIGN of the RAID
    verification spine (v0.1.0, 2026-07-30). It was FULFILLED and superseded by
    docs/raid-warp-verification-phasemap.spec (v0.2.0), whose status is "ALL 11
    PHASES COMPLETE" and whose P1-P7 are the SAME spine, actually built in
    cortex/core/raid/index.js (verify(), verifyInIsolation(), isolate→drift→
    compare→rewind). The phases below are DONE via that map. Kept for history
    (§0.3 nothing lost), not an open roadmap. Do not treat P1-P7 here as pending.

  meta:
    name:        raid-verification-spine
    version:     0.1.0-phasemap
    status:      PHASEMAP — 2026-07-30. RAID becomes the verification spine every
                 contract/tool decision flows through. Bottom-up, each phase wires
                 ONE already-built system into the RAID-governed path. §8.5 map
                 before build; §8.4 every system below was read, not assumed.
    uuid:        nexus-raid-verification-spine-v0-0000-2026-0730-001

  the_finding: >
    Every verification system James named EXISTS and is tested. The gap is that
    RAID does not drive them. _approveTool (cortex/core/raid/index.js) is
    synchronous and contract-ONLY: denied/allowed actions, proof, rate-limit. It
    never calls constitution, COS isolation, sigma, or drift. And the real
    verification chain (lib/execution-pipeline.js: BUILD → COS branch → sandbox
    → CompareEngine vs golden → promote-on-pass) runs INDEPENDENTLY of RAID.
    Two built halves that don't touch. This phasemap connects them.

  substrate_verified_2026_07_30:
    raid_gate:      "cortex/core/raid/index.js _approveTool(source, command, opts) — sync, contract-only. The seam to extend."
    constitution:   "lib/constitutional-ai.js check(req, ctx) — typed axiom checks, callable."
    isolation_cos:  "cos/playground/ {BranchEngine, SandboxRunner, CompareEngine} + lib/compartment-engine.js — isolated per-action sandbox, commit only on PASS."
    rewind:         "lib/replay-engine.js — snapshot before every decision, replay/compare."
    sigma:          "the sigma system (orchestrator/lib/sigma-writer.js + meta/cfr/sigma.js) — drift/halt-risk scoring."
    drift_bda:      "meta/bda/ — Behavioral Drift Analyzer: 5-signal extractor, pendulum regime (STABLE→…→COLLAPSING), gap patterns, hash-linked ledger."
    compare:        "cos/playground/compare.js CompareEngine — contract-vs-output diff, regression detection."
    chain_exists:   "lib/execution-pipeline.js ALREADY chains build→branch→sandbox→compare→promote. Runs independently of RAID today."

  design_decision_RECONCILED:
    tension: "James: 'RAID governs every decision' AND 'remove the training wheels' — these pull opposite ways."
    resolution: >
      RAID is the decision LEDGER and verification DRIVER, not a blocker-by-default.
      Every tool/contract decision is SENT to RAID (recorded, traceable — 'track
      each request through the system'), RAID drives the verification chain
      (constitution → isolate → verify → sigma/drift → compare), and RAID BLOCKS
      only when a real check fails. Co-pilot runs free (wheels off) AND every
      decision is governed + visible (RAID sees all). Both asks satisfied.

  phases:

    P1_raid_records_every_tool_decision:   # ← DONE (via raid-warp-verification, §10.3 superseded)
      why_first: "Traceability is the floor. Before RAID can VERIFY, it must SEE. 'Track each request through the system.'"
      does: >
        agent-tools executeTool() sends every tool call to RAID as a decision
        record (source, tool, args-digest, outcome) via a recordDecision path.
        No blocking yet — pure ledger. Every tool decision becomes traceable.
      axioms: "§1.2 observable never silent, §0.3 nothing lost"
      gate: "a tool call appears as a RAID decision record with its outcome, queryable."

    P2_constitution_on_the_approve_path:   # ← DONE (via raid-warp-verification, §10.3 superseded)
      why: "The cheapest, most fundamental check first — axioms before execution."
      does: >
        _approveTool calls constitutional-ai.check() for consequential actions.
        A constitution violation → not approved, with the axiom named. This is
        the first REAL gate, and it's fast (no sandbox needed).
      axioms: "§ the axioms themselves; §1.2 fail loud with the reason"
      gate: "an action that violates an axiom is denied by RAID, naming the axiom."

    P3_isolate_and_verify_via_cos:   # ← DONE (via raid-warp-verification, §10.3 superseded)
      why: "'Isolate each contract and test.' Consequential actions run in a COS compartment before they touch anything real."
      does: >
        For actions RAID flags as consequential, route through
        execution-pipeline's COS path (BranchEngine.fork → SandboxRunner.run) so
        the action is verified in isolation; commit only on PASS (§2.1 the real
        target is never touched on failure).
      axioms: "§1.1 nothing real until proven, §2.1 no mutation before pass"
      gate: "a failing action is caught in the sandbox; the real target is untouched."

    P4_sigma_and_drift_scoring:   # ← DONE (via raid-warp-verification, §10.3 superseded)
      why: "'Verify using the sigma system and behavioral drift engine.' Score the isolated run."
      does: >
        The sandboxed run is scored: sigma (halt-risk/drift floor) + meta/bda
        (behavioral regime). A run that spikes sigma or drifts into an unstable
        regime is flagged to RAID as a soft-fail signal.
      axioms: "§1.2 the score is observable, §13.4 the map matches the run"
      gate: "a drifting/sigma-spiking run is flagged with its regime + score."

    P5_compare_contract_vs_output:   # ← DONE (via raid-warp-verification, §10.3 superseded)
      why: "'Comparison engine between contract and outputs.' Did the output match what the contract promised?"
      does: >
        CompareEngine diffs the run's output against the contract/golden. A
        regression or contract-mismatch is a fail. This is the last gate before
        RAID approves a promote.
      axioms: "§5.14 output must honour the contract, §13.4 map matches territory"
      gate: "an output that regresses against its contract is caught by compare."

    P6_rewind_on_fail:   # ← DONE (via raid-warp-verification, §10.3 superseded)
      why: "'Using rewind engine to isolate.' A failed verification snapshots for replay/inspection."
      does: >
        On any verification fail (P2–P5), replay-engine snapshots the decision
        point so it's replayable and inspectable — the failure becomes training
        data, not a lost event.
      axioms: "§0.3 nothing lost, §0.1 evidence over memory"
      gate: "a failed decision is recoverable + replayable from a snapshot."

    P7_one_raid_verify_entrypoint:   # ← DONE (via raid-warp-verification, §10.3 superseded)
      why: "Unify P1–P6 into ONE call every surface uses, so the whole system works through one spine."
      does: >
        A single raid.verify(decision) that runs the chain: record → constitution
        → isolate → sigma/drift → compare → (snapshot on fail) → approve/deny.
        agent-tools, execution-pipeline, and the autonomous loop all call it.
        One spine, every system.
      axioms: "§10.3 one path not N, §5.14 same contract for all callers"
      gate: "agent-tools, the pipeline, and the autonomous loop all verify through the same raid.verify()."

  ordering_rationale: >
    P1 (see) precedes P2 (cheap check) precedes P3 (isolate) precedes P4/P5
    (score+compare the isolated run) precedes P6 (catch failures) precedes P7
    (unify). Each phase connects one built system; none reimplements an engine.
    Cheapest checks first so most denials never need a sandbox.

  honest_risks:
    - "P3: making _approveTool async (to await a sandbox) changes its contract — every caller must handle a Promise. Verify callers first (§8.4)."
    - "P4: sigma/BDA scoring on every consequential action adds latency — 'consequential' must be a tight filter, not every tool call."
    - "the sandbox cannot run live here — gates are James-verified on the real boot, as all session."
    - "fault_taxonomy is still 0 rows — the drift/compare data will be thin until real runs populate it; honest, not a blocker."
