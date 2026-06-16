spec:
  meta:
    name:     meta-layer
    version:  1.2.0
    foundation: nexus-system-foundation@1.0.0
    uuid:     nexus-meta-layer-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Six intelligence modules. All lazy-loaded. No ports.
      Used internally by cortex, guardian, diagnostic, and userscripts.
      Not a service — a library. Imported, not registered.

  modules:
    - id: topo-kernel
      version: "1.0.0"
      path: "lib/meta/topo-kernel/index.js"
      description: >
        8-gate SNR pipeline. Entropy → Variance → Consistency → Fidelity
        → Causality → Pattern → IME → Bayesian. The primitive everything
        else mounts on.
      exports: ["computeSNR(signals) → SNRResult"]

    - id: telemetry-codec
      version: "1.0.0"
      path: "lib/meta/telemetry-codec/index.js"
      description: >
        Four compression engines for telemetry streams.
      engines:
        SlopeEngine:        "OLS regression — direction, momentum, regime change"
        StabilityEngine:    "CV, entropy, convergence state"
        OscillationEngine:  "zero-crossings, period, amplitude"
        ConfidencePropagator: "cross-channel corroboration"
        ServiceDriftEngine: "7 sub-threshold precursor signals"

    - id: liminal
      version: "1.0.0"
      path: "lib/meta/liminal/index.js"
      description: "12 gap detectors across code, text, and relational domains."
      detectors:
        - code:         "silent failure, SQL injection, dynamic eval, stubs"
        - assumption:   "universalisation, absolute pairs"
        - contrastive:  "contradiction clusters, fine inversions"
        - structural:   "presupposition loading, hierarchy markers"
        - shadow:       "pronoun displacement, hedge density, over-apology"
        - negative_space: "gravity wells — unexpressed anger, avoided accountability"
        - relational:   "8 gaslighting/coercion patterns"
        - oscillatory:  "pendulum math, intermittent reinforcement"
        - existential:  "identity fixation, meaning SPOF"
        - field:        "oscillation, plateau, hard edges"
        - music:        "phoneme/rhyme scheme, structural gaps, cliché density"
        - reversal:     "negation clusters, rhetorical accusation"

    - id: alk-perception
      version: "1.0.0"
      path: "lib/meta/alk-perception/index.js"
      description: >
        Composite behavioral state classifier.
        Maps NEXUS telemetry to named states.
      states: [COGNITIVE_LOAD, GENUINE_FLOW, CONCEALMENT, STRESS_ACUTE,
               SOCIAL_MASK, GENUINE_ENGAGEMENT]

    - id: spatial
      version: "1.0.0"
      path: "lib/meta/spatial/index.js"
      description: "Sigma (entropy/regime) + Lattice (resonance-weighted graph)"
      sigma_regimes: [STABLE, ACTIVATING, UNGROUNDED, DYSREGULATED,
                      OSCILLATORY, COLLAPSING, OFFLINE]

    - id: bda
      version: "1.0.0"
      path: "lib/meta/bda/index.js"
      description: "Behavioral Drift Analyzer. 5-signal extraction per message."
      signals: [valence, certainty, openness, tension, selfref]
      components: [signals, pendulum, gaps, hash-linked ledger, session kernel]
