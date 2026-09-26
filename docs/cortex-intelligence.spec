spec:
  meta:
    name:        cortex-intelligence
    version:     1.0.0
    status:      proposed
    uuid:        nexus-cortex-intelligence-v1-0000-2026-0629-jamesbrooks-001
    purpose: >
      Phase 84/85 bill this as "INTUITION faculty — BEP + sigma + fault
      taxonomy" and "MASTERMIND faculty — causal, prediction,
      counterfactual." Checked directly, session 6: neither is a separate
      file (cortex/intelligence/{intuition,mastermind}.js don't exist).
      Both are local functions inside cortex/boot.js —
      _intuitionAnswer(prompt) and _mastermindAnalysis(prompt, context) —
      called by /api/intelligence/intuition and /mastermind (both real,
      both queried live by copilot, confirmed session 4). This spec states
      what's actually there and what closing the gap to the Phase 84/85
      billing would require — not a correction for its own sake, a map of
      real remaining work.

  current_state:
    _intuitionAnswer:
      what_it_does: "keyword-rule matching over live CFR field state + JAA gap counts"
      what_its_billing_implies: "BEP (367 seeded patterns) + sigma + fault taxonomy, combined"
      gap: >
        Doesn't touch lib/causal/compound.js's BEP patterns at all, doesn't
        run through lib/open-loop-taxonomy.js's classify(). "Sigma" here
        means reading the live field score, not the fuller sigma-history
        reasoning the billing implies.
    _mastermindAnalysis:
      what_it_does: "composes a few lines of field-state + open-gap summary text"
      what_its_billing_implies: "causal reasoning, prediction, counterfactual analysis"
      gap: >
        No causal graph traversal (lib/cfr/graph.js's ancestors/descendants
        not called here). No prediction model. No counterfactual branching
        — that's Phase 109 (EBR), a different, much bigger piece, not
        something MASTERMIND quietly already does.

  closing_the_gap:
    intuition_v2:
      adds: "lib/open-loop-taxonomy.js's classify() call on the active gap set, BEP pattern lookup via lib/causal/compound.js before falling back to keyword rules"
      effort: small — both dependencies already exist, this is wiring, not building
    mastermind_v2:
      adds: "lib/cfr/graph.js's ancestors()/descendants() walked for the prompt's subject before composing the summary — turns 'list of open gaps' into 'this gap's actual causal neighborhood'"
      effort: small — same shape as intuition_v2, real dependency, just unwired
    counterfactual_half:
      adds: "nothing short — this is Phase 109 (EBR) in full, not a MASTERMIND patch. Don't conflate closing intuition/mastermind's gap with building EBR; they're different sizes."

  recommendation: >
    Two honest options, not a forced choice: (1) build intuition_v2/
    mastermind_v2 as scoped above — cheap, real, closes most of the gap
    between billing and reality without touching Phase 109; or (2) rewrite
    Phase 84/85's description to match what's actually there (simpler,
    accurate) and treat "real causal reasoning" as Phase 109's job alone,
    never MASTERMIND's. Either is honest. Leaving the billing as-is while
    building nothing is the only wrong answer — that's the gap this spec
    exists to close.
