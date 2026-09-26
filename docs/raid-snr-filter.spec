spec:
  meta:
    name:        raid-snr-filter
    version:     1.1.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-raid-snr-filter-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      SNR filter on RAID dispatch. Invariants first. Patterns second. AI last.
      Tokens ∝ unresolved meaning. Every tier carries causal context —
      fidelity is how much context resolves the task, not whether context
      is attached at all. Runs before every RAID dispatch as a pre-gate.

  resolution_order:
    1: "Known invariant (forge_patches, successRate>0.7) → deterministic fix, tokens:0"
    2: "Crystallised pattern with pre-staged fix → pattern fix, tokens:0"
    3: "Open loop (elevated friction or liminal items) → dispatch with context flag"
    4: "Genuine unknown → dispatch to AI provider, WITH context (v1.1 fix — see below)"

  snr_values:
    invariant:  1.0
    pattern:    "pattern.confidence"
    open_loop:  0.5
    unknown:    0.0

  v1_1_fix:
    bug: >
      Tier 3 (open_loop) set injectContext:true. Tier 4 (genuine unknown)
      did not — dispatched blind. This was the actual mechanism behind
      "novel failures get treated as trial-and-error": the system
      correctly identified "I don't know this" and then discarded the
      causal context it already had available before dispatching.
    fix: >
      Every tier now forwards the causedBy/sessionId/jobId chain CFR
      already tracks (docs/cfr.spec) — no new fields invented, same
      rejection of inventing new trace fields already established
      elsewhere in this system. "Genuine unknown" means no known fix, not
      no known context.

  generic_capability:
    status: specified_not_built
    note: >
      The tier cascade above (known-fact → pattern → partial-context →
      unresolved, each with a 0.0-1.0 score) is RAID-agnostic. Per Phase
      40's one-descriptor-many-projections model, generalizes into a
      capability descriptor with this cascade as its fixed contract and
      per-consumer pluggable tier-check implementations — decision
      engine, load balancer, priority engine, gating system, security
      system each register their own checkInvariant/checkPatterns/
      checkOpenLoops equivalents against one shared primitive. First
      real non-RAID, non-CLI consumer of the descriptor system. First
      concrete proof-of-concept: docs/spec-drift.spec's metadata cache.

  wired_into: "cortex/core/raid/index.js _dispatch() — first gate before any provider call"

  tests:
    count:  10
    status: "10/10 PASSING — tier-4 context fix not yet covered, needs a new test before this ships"
