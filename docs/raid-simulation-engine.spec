spec:
  meta:
    name:        raid-simulation-engine
    version:     0.1.0
    status:      proposed
    uuid:        nexus-raid-sim-v1-0000-2026-0701-jamesbrooks-001
    axioms:      [§2.1, §2.3, §AX-002, LAW_I, LAW_III, §P97, §M4, §A2]
    depends_on:
      - cortex/core/raid/index.js       # _decide(), _fitness(), recordOutcome()
      - lib/cfr/sigma.js                # computeSigma() — scores the simulated event
      - lib/cfr/field.js                # live field state at simulation time
      - lib/event-ledger.js             # baseline for sigma comparison
      - unintegrated/rfr2-nexus/delta   # computeEventDelta() — S-field + C-field
      - unintegrated/rfr2-nexus/enforcement # BoundaryIndex — 25 invariant monitors
      - cos/kernel.js                   # Compartment SANDBOX state — isolation layer
    naming_note: >
      This is NOT "RAID" extended. RAID (v6.2.0) is a provider-routing engine
      with load-bearing consumers (LAW_I/III, §P97, 21 tests). Adding simulation
      to RAID directly would make a 313-line pure function impure and break the
      test isolation that makes it trustworthy. This is a new module —
      cortex/core/raid/simulation.js — that wraps _decide() and adds a
      pre-commit simulation layer. RAID's own behavior is unchanged.
    purpose: >
      Between RAID deciding which agent to route to and that dispatch actually
      happening, there is currently nothing. The decision commits immediately.
      This spec defines what happens in that gap: a simulation that runs the
      proposed dispatch through a COS sandbox compartment, scores the predicted
      outcome with delta + sigma, checks the enforcement invariants, and either
      commits the dispatch (clean simulation) or escalates with a fault
      classification (failed simulation). The live system is only affected if
      the simulation passes.

  the_gap_in_current_raid:
    current: |
      _decide() → { agent, cluster, reason }
                → dispatched immediately
    proposed: |
      _decide() → { agent, cluster, reason }
                → simulate(decision, context)
                    ├─ COS sandbox run
                    ├─ delta scoring (S + C fields)
                    ├─ sigma scoring against baseline
                    ├─ enforcement invariant check (25 invariants)
                    └─ { prediction, sigma, faults, recommendation }
                → if clean: commit dispatch
                → if faulted: escalate with fault classification + sigma

  simulation_module:
    file:    cortex/core/raid/simulation.js
    exports: [simulate, classifyFault, scoreOutcome]

    simulate:
      signature: |
        async simulate(decision, context, options = {})
          → SimulationResult
      inputs:
        decision:  the object _decide() returns — { agent, cluster, reason }
        context:   live context at decision time — CFR field, sigma floor, call shape
        options:
          dry_run: bool — if true, never commit even if clean (used by what-if engine)
          timeout: ms — how long the simulation gets before it's declared inconclusive
      outputs:
        SimulationResult:
          prediction:    what the simulation expects will happen
          sigma:         { score, axes: { structural, temporal, contextual } }
          delta:         { sField, cField, throughputChange }
          faults:        Fault[] — empty if clean
          enforced:      boolean — true if all 25 BoundaryIndex invariants passed
          recommendation: 'commit' | 'escalate' | 'fallback' | 'inconclusive'
          confidence:    [0,1] — how much weight to give this prediction
          simulationMs:  how long the simulation took

    how_it_works:
      step_1_sandbox: >
        Create a COS compartment in SANDBOX state for this simulation.
        Axioms: the proposed dispatch's constitutional constraints (LAW_I, LAW_III,
        §P97 sigma floor). The compartment is ephemeral — born for this simulation,
        recycled when it ends. It never reaches INTEGRATED state (no bus connections
        earned). Its isolation guarantees the simulation cannot affect live state.

      step_2_synthetic_event: >
        Construct a synthetic event representing the proposed dispatch:
          type:     `raid.dispatch.predicted.${decision.agent}`
          payload:  { agent, cluster, reason, sigmaFloor: context.cfrSigmaFloor }
          source:   'raid-simulation'
          causedBy: the real call's event ID (causal chain preserved even for
                    simulated events — they're real observations of a prediction,
                    even if the prediction doesn't commit)

      step_3_delta_score: >
        Run computeEventDelta() from rfr2-nexus/delta on the synthetic event.
        This produces:
          S-field: latency z-score — how unusual is the timing of this dispatch
                   compared to the agent's historical dispatch interval?
          C-field: structural deviation z-score — how unusual is the causal depth
                   of this call compared to baseline call shapes for this cluster?
        Neither number is a judgment. Both are pure measurements. The judgment
        comes next.

      step_4_sigma_score: >
        Run computeSigma() from lib/cfr/sigma.js on the synthetic event.
        Uses the live CFR field state (lib/cfr/field.js snapshot) as the
        contextual axis. Uses the event-ledger's baseline for this event type
        as the comparison.
        Output: { score: [0,1], axes: { structural, temporal, contextual } }
        Interpretation:
          score < 0.3: routine dispatch, low risk
          score 0.3-0.6: elevated — worth noting but not blocking
          score 0.6-0.7: stressed — consider fallback
          score > 0.7: §P97 threshold — autonomous loop would halt here.
                       In simulation: strong recommendation to fallback or escalate.

      step_5_enforcement: >
        Run the BoundaryIndex from rfr2-nexus/enforcement against the
        compartment's state after the simulated dispatch.
        Checks all 25 invariants — identity, causality, time, architecture,
        hostile-input, context-isolation, execution-model.
        An invariant failure here means the proposed dispatch would violate a
        system boundary. This is a hard fault — recommendation becomes 'fallback'
        or 'escalate' regardless of sigma score.

      step_6_fault_classification: >
        If sigma > 0.6 OR any invariant fails: classifyFault().
        Maps the fault to the open-loop-taxonomy fault classes:
          CONSTITUTIONAL: invariant violations (enforcement failures)
          KNOWLEDGE:      agent doesn't have the information to handle this cluster
          CAPABILITY:     agent has consecutiveFails > threshold for this cluster
          INTEGRITY:      sigma > 0.7 — dispatch would happen in a structurally
                          stressed field, high risk of cascading
        Each fault class has a specific recommendation:
          CONSTITUTIONAL → hard reject, escalate to human
          KNOWLEDGE      → fallback to a higher-knowledge agent (RAID's chain)
          CAPABILITY     → skip this agent, try next in chain
          INTEGRITY      → delay and re-evaluate after field recovers

      step_7_recommendation: >
        Synthesize:
          no faults, sigma < 0.3: 'commit' — proceed with dispatch
          no faults, sigma 0.3-0.6: 'commit' with warning logged
          faults (KNOWLEDGE/CAPABILITY): 'fallback' — RAID re-runs _decide()
                                          excluding the failed agent
          faults (CONSTITUTIONAL): 'escalate' — human decision required
          faults (INTEGRITY): 'escalate' if sigma > 0.7, else 'fallback'
          timeout or simulation error: 'inconclusive' — commit with warning
                                       (never block on inconclusive simulation)

  fault_classification:
    module: cortex/core/raid/simulation.js → classifyFault()
    input:  SimulationResult (post-enforcement)
    output: Fault[]
    Fault:
      class:       CONSTITUTIONAL | KNOWLEDGE | CAPABILITY | INTEGRITY
      source:      which step produced it (delta | sigma | enforcement | timeout)
      invariant:   which of the 25 invariants failed (if CONSTITUTIONAL)
      sigma:       the score at time of fault
      delta:       the S + C field values at time of fault
      agent:       the proposed agent
      recommendation: hard string — 'reject' | 'fallback' | 'escalate' | 'warn'

  layer_2_fitness_completion:
    context: >
      RAID Layer 2 has three named stubs returning 1.0:
        role_confidence, topological_proximity, snrTierGate
      The simulation engine provides real values for all three.
    role_confidence: >
      Now computable from the conditioning_log in Cortex memory:
      what fraction of previous dispatches to this agent for this cluster
      succeeded? That IS role confidence — not a separate data source,
      the outcome record that recordOutcome() has been writing all along.
      role_confidence = conditioning_log success rate per (agent, cluster) pair.
    topological_proximity: >
      Now computable from the CFR field's coherence score between the
      current system context and the agent's historical operating range.
      An agent that has only ever handled analysis clusters has low
      topological proximity to a code cluster — the CFR field's coherence
      between those two task shapes is measurable.
    snr_tier_gate: >
      Now computable from the sigma score output of step_4 above.
      A sigma > 0.6 on this agent for this cluster means low SNR — the
      signal (useful output) is being drowned by noise (errors, retries,
      field distortion). snrTierGate = 1 - clamp(sigma, 0, 1).
      This feeds back into _fitness() to produce a real Layer 2 score,
      not a neutral 1.0.

  cos_integration:
    sandbox_lifecycle: >
      Every simulation creates and destroys a COS compartment. The compartment
      never persists — it exists for one simulation and is recycled.
      This is COS being used exactly as designed: sandbox-first, earn integration
      by passing gates. In this case, "integration" is the dispatch committing.
      A failed simulation is a compartment that gets recycled, not integrated.
    axiom_as_constraints: >
      The compartment's axioms ARE the dispatch's constitutional constraints:
        axiom[0]: "LAW_I must hold — local-first ordering preserved"
        axiom[1]: "LAW_III must hold — unconditional last resort preserved"
        axiom[2]: "§P97 sigma floor: ${cfrSigmaFloor} — tightened=${tightened}"
      If the simulation violates any of these, the compartment hits AXIOM_FAULT
      state. That maps directly to CONSTITUTIONAL in the fault classifier.
    vault_use: >
      Simulation state is written to the Vault (cos/vault) under
      scope='compartment', not logged to the live event_log. This keeps
      simulation history separate from real dispatch history — the event_log
      should only contain things that actually happened, not predictions.
      Simulations are queryable through cos/vaultd for post-hoc analysis.

  what_this_enables:
    before_every_dispatch: >
      RAID knows before it commits whether the proposed dispatch is likely to
      succeed, what the risk is (sigma score), whether any invariants would
      be violated, and which fault class the failure would be. It routes around
      problems before they happen instead of learning from them after.

    role_confidence_that_grows: >
      As conditioning_log accumulates real outcomes per (agent, cluster) pair,
      role_confidence stops being 1.0 for everything and becomes a real,
      differentiated score. Ollama becomes known as high-confidence for code
      clusters, low-confidence for spec clusters (or vice versa, depending on
      actual outcomes). The simulation gets more accurate over time without
      any retraining — §M3.

    fault_mode_visibility: >
      Every simulation that produces a non-commit recommendation writes a
      structured fault record: class, source, sigma, delta, which invariant.
      Over time this builds a fault map of the system — which agents fail
      for which clusters under which CFR field conditions. The optimization
      service reads this map for its morning briefing. The query surface
      exposes it when asked "what are guardian's failure modes?"

    what_if_integration: >
      The nexus-project-flow.spec's what-if engine calls simulate() with
      dry_run: true. It can safely ask "what would happen if I routed this
      cluster to chatgpt instead of ollama" without any possibility of
      that routing actually happening. The simulation returns a prediction
      with sigma, delta, and fault classification — the what-if answer
      is grounded in the same math as live dispatch decisions.

  constraints:
    never_block_on_inconclusive: >
      If the simulation times out or errors, the recommendation is
      'inconclusive' and the dispatch proceeds with a warning logged.
      The simulation is a pre-flight check, not a gate. §AX-002 applies:
      nothing fails silently, but a simulation failure is not a dispatch
      failure. A dispatch that was going to succeed still succeeds.
    never_modify_live_state: >
      The COS sandbox compartment has no bus connections (SANDBOX state).
      The synthetic event is written to the Vault, not the event_log.
      The simulation has zero side effects on live NEXUS state — guaranteed
      by COS's own isolation invariants (CI-1 through CI-6 in enforcement).
    simulation_is_advisory_not_constitutional: >
      LAW_I and LAW_III are constitutional. The simulation cannot override
      them. If the simulation recommends 'fallback' but LAW_III says claude
      is the unconditional last resort, the dispatch goes to claude.
      Simulation advises within the constitutional space — it never replaces it.

  build_order:
    - "1. cortex/core/raid/simulation.js — simulate(), classifyFault(), scoreOutcome()"
    - "2. Wire computeEventDelta() from rfr2/delta — needs the ESM→CJS adapter
         (same integration needed for all rfr2 modules, do it once here)"
    - "3. computeSigma() is already CJS — call it directly with the synthetic event"
    - "4. BoundaryIndex from rfr2/enforcement — same ESM→CJS adapter as step 2"
    - "5. COS sandbox compartment lifecycle — ephemeral create/recycle per simulation"
    - "6. Layer 2 fitness completion — role_confidence from conditioning_log,
         snrTierGate from simulation sigma"
    - "7. Vault writes for simulation history — separate from event_log"
    - "8. Wire into RAID's dispatch path — between _decide() and actual dispatch"
    - "9. Tests — same rigor as the 21-test suite that already covers _decide().
         Simulation must be deterministic given the same inputs — testable without
         a live stack."
