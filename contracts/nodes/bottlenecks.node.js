'use strict';
/**
 * contracts/nodes/bottlenecks.node.js — extracted from contracts/SYSTEM-CONTRACTS.js
 * Real node id: contracts.bottlenecks.node
 * §EXTRACTED 2026-09-12 — cli/decompose.js --mode=registry, block BOTTLENECKS.
 * Verbatim body — this extraction moves the const, it does not re-derive it,
 * so nothing about the taxonomy itself changed, only where it lives.
 */
module.exports = Object.freeze({

  // Named bottleneck signal types (§7.7)
  SIGNALS: {
    IDEA_CONVERSION_LOW:   'idea_conversion_low',    // low idea-to-upgrade conversion rate
    GATE_LATENCY_HIGH:     'gate_latency_high',      // boot gates taking too long
    BRANCH_ENTROPY_HIGH:   'branch_entropy_high',    // too many unresolved idea branches
    IDEA_DENSITY_HIGH:     'idea_density_high',      // too many ideas per component
    HELD_QUEUE_GROWING:    'held_queue_growing',     // held requests accumulating
    RETRY_RATE_HIGH:       'retry_rate_high',        // excessive retries per job
    SIGMA_SUSTAINED:       'sigma_sustained',        // high sigma for > N consecutive events
    LEDGER_DIVERGENCE:     'ledger_divergence',      // two ledgers disagree on same entity
    CIRCUIT_OPEN_CLUSTER:  'circuit_open_cluster',   // multiple circuits open simultaneously
    SEAM_FAIL_RATE_HIGH:   'seam_fail_rate_high',    // SEAM chunk failure rate above threshold
    CONTEXT_LOSS_RATE:     'context_loss_rate',      // session UUID chain breaks per session
    TOKEN_EXPIRY_RATE:     'token_expiry_rate',      // Bridge tokens expiring before use
  },

  // Thresholds that trigger each signal
  THRESHOLDS: {
    HELD_QUEUE_MAX:      50,    // requests
    RETRY_RATE_MAX:      0.25,  // 25% of jobs retry
    SIGMA_SUSTAINED_N:   5,     // consecutive high-sigma events
    SEAM_FAIL_MAX:       0.30,  // 30% chunk fail rate
    CIRCUIT_OPEN_MAX:    2,     // more than 2 circuits open = cluster
    IDEA_DENSITY_MAX:    10,    // ideas per component
  },
});
