'use strict';
/**
 * contracts/nodes/divergent.node.js — extracted from contracts/SYSTEM-CONTRACTS.js
 * Real node id: contracts.divergent.node
 * §EXTRACTED 2026-09-12 — cli/decompose.js --mode=registry, block DIVERGENT.
 * Verbatim body — this extraction moves the const, it does not re-derive it,
 * so nothing about the taxonomy itself changed, only where it lives.
 */
module.exports = Object.freeze({

  // CFR field dimensions
  DIMENSIONS: {
    COHERENCE:  'coherence',   // 0..1 — how ordered/structured the system is
    FRICTION:   'friction',    // 0..1 — energy lost to resistance / retries / lag
    RESONANCE:  'resonance',   // 0..1 — cyclic reinforcement (retries, loops, polls)
    ENTROPY:    'entropy',     // 0..1 — disorder / randomness / unpredictability
  },

  // Named regimes (computed from field state)
  REGIMES: {
    STABLE:    { id: 'stable',    desc: 'coherence > 0.6, entropy < 0.3 — healthy flow' },
    RESONANT:  { id: 'resonant',  desc: 'coherence > 0.4, entropy < 0.3 — cyclic signal' },
    TURBULENT: { id: 'turbulent', desc: 'friction > 0.65 OR resonance > 0.7 — loop / deadlock' },
    CHAOTIC:   { id: 'chaotic',   desc: 'entropy > 0.7 OR coherence < 0.25 — SW block / error' },
  },

  // Sigma anomaly types (scored 0..1 per event)
  SIGMA: {
    AXES: {
      STRUCTURAL:  'structural',   // payload shape, type pattern, required fields
      TEMPORAL:    'temporal',     // interval since last event vs baseline
      CONTEXTUAL:  'contextual',   // current CFR field state amplification
    },
    PATTERNS: {
      ERROR_EVENT:    { name: 'error_event',    structural_weight: 0.35 },
      RETRY_PATTERN:  { name: 'retry_pattern',  structural_weight: 0.20 },
      TIMEOUT:        { name: 'timeout',        structural_weight: 0.25 },
      EMPTY_PAYLOAD:  { name: 'empty_payload',  structural_weight: 0.10 },
      CORRUPT_DATA:   { name: 'corrupt_data',   structural_weight: 0.40 },
      TEMPORAL_DRIFT: { name: 'temporal_drift', temporal_threshold_sigma: 3 },
      HIGH_ENTROPY:   { name: 'high_entropy',   contextual_threshold: 0.70 },
      LOW_COHERENCE:  { name: 'low_coherence',  contextual_threshold: 0.30 },
      HIGH_FRICTION:  { name: 'high_friction',  contextual_threshold: 0.70 },
    },
  },
});
