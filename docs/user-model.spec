spec:
  meta:
    name:        user-model
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-user-model-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Persistent model of how the user works, thinks, and communicates.
      Built from BDA signals, RAID outcomes, friction patterns, liminal
      gaps, and crystallised intelligence patterns across all sessions.
      Sovereign — stays local, never transmitted, user-controlled.

  jaa_table:    "user_model (long-tier — permanent)"
  schema:
    uuid:               string
    hypotheses:         >
      NOT a user profile. Hypotheses with confidence and evidence.
      BAD:  James likes X
      GOOD: { hypothesis: 'prefers X', confidence: 0.67, evidence: 14, lastUpdated: ts }
      Model evolves. Can be wrong and know it's wrong. Never fossilises.
    bdaBaseline:        "{ valence, certainty, openness, tension, selfref } — rolling average, not fixed"
    flowSignature:      "{ timeOfDay[], sessionLengthAvg, velocityRange } — hypothesis, not fact"
    preferredClusters:  "{ cluster: { provider: { successRate, confidence, evidence } } }"
    frictionProfile:    "{ faultClass: { score, confidence, evidence } }"
    liminalProfile:     "{ gapType: { frequency, confidence } }"
    regimeHistory:      "{ regime, ts, context }[] — last 50"
    contradictions:     "{ decision, conflictsWith, ts }[]"
    crystallisedPatterns: "string[] — pattern ids involving user behaviour"
    lastUpdated:        number

  update_triggers:
    - "session.end → BDA baseline updated (rolling average)"
    - "pattern.crystallised → added if user-behaviour-related"
    - "raid.job.complete → preferredClusters outcome weight updated"
    - "escalation.friction.increased → frictionProfile updated"
    - "behavioral.drift.signal → regimeHistory entry added"
    - "liminal.gap.found → liminalProfile frequency incremented"

  guardian_uses:
    provider_weighting:   "RAID reads preferredClusters, shifts weights"
    context_injection:    "surface past exchanges from similar regime states"
    gap_anticipation:     "pre-run likely gap detectors based on liminalProfile"
    velocity_awareness:   "elevated velocity → conservative healing"
    contradiction_surface:"flag when request conflicts with past decision"
