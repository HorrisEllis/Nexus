'use strict';
/**
 * contracts/nodes/causal-physics.node.js — extracted from contracts/SYSTEM-CONTRACTS.js
 * Real node id: contracts.causal-physics.node
 * §EXTRACTED 2026-09-12 — cli/decompose.js --mode=registry, block CAUSAL_PHYSICS.
 * Verbatim body — this extraction moves the const, it does not re-derive it,
 * so nothing about the taxonomy itself changed, only where it lives.
 */
module.exports = Object.freeze({

  // The three causal stack layers
  LAYERS: {
    STRUCTURAL: {
      name:   'structural_causality',
      engine: 'lib/cfr/graph.js (CausalGraph)',
      provides: ['ancestry', 'lineage', 'dependency tree', 'job chains', 'session clusters'],
      desc:   'Who caused what. Static causal graph.',
    },
    RESIDUAL: {
      name:   'residual_causality',
      engine: 'lib/cfr/sigma.js + lib/event-ledger.js',
      provides: ['invariants', 'failure precursors', 'baseline deviation', 'co-occurrence patterns'],
      desc:   'How far events deviate from baseline. The learning layer.',
    },
    PROPAGATION: {
      name:   'propagation_dynamics',
      engine: 'lib/causal/compound.js (CompoundEngine)',
      provides: ['ripple/wave/tidal regimes', 'cross-graph amplification', 'systemic resonance', 'compounding factors'],
      desc:   'How energy moves through the graph. Emergent regime detection.',
    },
  },

  // CausalImpulse — the physics underlying every event
  // Computed once at analysis time. Never recomputed (ephemeral context).
  CAUSAL_IMPULSE_SCHEMA: {
    magnitude:       'energy injected into the graph (sigma × field entropy)',
    entropy:         'disorder introduced (CFR entropy snapshot)',
    branchingFactor: 'independent causal paths opened (error=2.5, violation=3.5, collapse=4.0)',
    resistance:      'current field state damping (coherence × 0.6 − entropy × 0.4)',
    decayRate:       'energy lost per hop (0.05..0.85, high coherence = fast decay)',
    energyAtHop1:    'predicted propagation energy at depth 1',
    energyAtHop3:    'predicted propagation energy at depth 3 (wave threshold)',
    energyAtHop6:    'predicted propagation energy at depth 6 (tidal threshold)',
    predictedRegime: 'ripple | wave | tidal — from physics alone, before graph confirms',
  },

  // Propagation function
  // E(N) = magnitude × branchingFactor^N × (1 - decayRate)^N × (1 / (1 + resistance))
  PROPAGATION_EQUATION: 'E(N) = magnitude × branchingFactor^N × (1 - decayRate)^N × R where R = 1/(1 + resistance)',

  // Regime thresholds (from energy function)
  REGIME_THRESHOLDS: {
    RIPPLE: 'E(3) < 0.2  — linear + low branching. Energy dampens.',
    WAVE:   'E(3) >= 0.2 — exponential + bounded spread. Energy persists.',
    TIDAL:  'E(6) >= 0.4 — superlinear + cross-system. Energy amplifies.',
  },

  // Gate rules — when compound analysis triggers
  GATE_RULES: [
    'sigma >= 0.70 on the triggering event',
    'event type does NOT start with compound.* (no recomputation storms)',
    'analysis runs via setImmediate — write path is never blocked',
    'JAA inserts from compound engine do NOT route through CFR ledger.record()',
  ],

  // What this system is (not metaphor — correct technical terms)
  CLASSIFICATION: 'A causal physics engine over software behaviour — a second-order causal field over a first-order causal graph.',
});
