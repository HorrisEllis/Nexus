spec:
  meta:
    name:        nexus-analysis-module-foundation
    version:     1.0.0
    extends:     nexus-system-foundation@1.0.0
    author:      james-brooks
    status:      proposed
    uuid:        nexus-analysis-module-foundation-v1-0000-2026-0627-jamesbrooks-001
    purpose: >
      A specialization of the base foundation for modules whose job is
      analyzing a time series of events for shape — growth curves,
      saturation points, regime changes, divergence from baseline.
      copilot/module-builder.js's generateSpec() should reach for THIS
      template, not the bare foundation template, whenever the mapped
      plan's purpose contains words like: trend, curve, growth, saturation,
      trajectory, divergence, forecast, regime, baseline.

  # Same L0-L5 build order as the base foundation. This only adds to L0
  # (required imports) and L3 (required routes). L1/L2/L4/L5 unchanged.

  layer_0_immutable_core_additions:
    required_imports:
      - from: lib/cfr/sigma.js
        name: computeSigma
        why: >
          Every analysis module needs a divergence score per data point
          before it can say anything about shape. Don't reimplement this —
          every analysis module in NEXUS should produce sigma values that
          mean the same thing CFR's sigma already means elsewhere.
      - from: lib/cfr/delta.js
        name: computeDelta
        why: >
          Transition physics (tension, friction, slope) between consecutive
          points in the series. An S-curve is a delta pattern: small slope →
          accelerating slope → decelerating slope → near-zero slope. This
          module's job is naming that pattern, not computing the deltas —
          delta.js already does that correctly.
      - from: lib/cfr/graph.js
        name: CausalGraph
        why: >
          If the series has a cause (a job, a contract, a chunk run),
          the analysis should attach to the existing causal chain via
          ancestors()/descendants(), not create a parallel untethered graph.

    required_exports:
      - name: analyze
        signature: "(series: {ts, value}[], opts?) → { regime, sigma[], delta[], breakpoints[], confidence }"
        description: >
          regime is module-specific (e.g. for an S-curve module: 'lag' |
          'acceleration' | 'inflection' | 'saturation'). sigma/delta arrays
          are computed via the required imports above, not reimplemented.
          breakpoints are indices where regime changes — these become CFR
          graph nodes via the CausalGraph import, not a separate ledger.
      - name: classify
        signature: "(point: {ts, value}, history: {ts,value}[]) → regime"
        description: >
          Single-point classification against rolling history. This is
          what gets called incrementally as new events arrive, vs. analyze()
          which runs over a full series retrospectively.

  layer_3_api_additions:
    required_routes:
      - method: GET
        path: /api/analysis/:seriesId
        description: "Full analyze() result for a named series"
      - method: GET
        path: /api/analysis/:seriesId/regime
        description: "Current regime only — cheap poll for dashboards/copilot"

  # AX-008 (addendum v1.1.0) applies here same as any module: at least one
  # hooks.out must reach copilot.* — an analysis module that detects a
  # regime change and doesn't tell copilot about it is the exact failure
  # mode AX-008 exists to catch.

  worked_example:
    name: s-curve-detector
    purpose: "Classify adoption/growth series into S-curve phase"
    series_example: "guardian job-completion rate over a deploy window"
    regimes: [lag, acceleration, inflection, saturation, decline]
    breakpoint_rule: >
      inflection = the index where delta.slope changes sign from
      increasing to decreasing (second-derivative zero-crossing on the
      already-computed delta stream — no new math, just reading delta.js's
      output differently than the default tension/friction interpretation).
