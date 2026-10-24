'use strict';
/**
 * contracts/nodes/deltas.node.js — extracted from contracts/SYSTEM-CONTRACTS.js
 * Real node id: contracts.deltas.node
 * §EXTRACTED 2026-09-12 — cli/decompose.js --mode=registry, block DELTAS.
 * Verbatim body — this extraction moves the const, it does not re-derive it,
 * so nothing about the taxonomy itself changed, only where it lives.
 */
module.exports = Object.freeze({

  // Delta axes (computed per ledger entry)
  AXES: {
    TENSION:  'tension',   // 0..1 — absolute change in complexity/payload size
    FRICTION: 'friction',  // 0..1 — latency proxy (gap between events)
    SLOPE:    'slope',     // -1..1 — direction of change (positive = growing)
  },

  // Named delta transition types
  TRANSITIONS: {
    OK_TO_ERROR:    'ok_to_error',      // tension spike — normal → failure
    ERROR_TO_OK:    'error_to_ok',      // recovery — medium tension
    RETRY_CHAIN:    'retry_chain',      // consecutive retries — high tension
    JOB_FLOW:       'job_flow',         // queued → dispatched → complete — expected low tension
    GAP_CYCLE:      'gap_cycle',        // gap found → resolved — expected low tension
    SEAM_DELIVERY:  'seam_delivery',    // chunk injected → stable → verified — expected low tension
    SILENCE_BREAK:  'silence_break',    // long gap then event — mild temporal signal
  },

  // Thresholds
  THRESHOLDS: {
    TENSION_HIGH:  0.6,   // above this = high tension event
    FRICTION_HIGH: 0.6,   // above this = high friction event
    SLOPE_GROWING: 0.1,   // positive slope above this = system expanding
    SLOPE_SHRINKING: -0.1,// negative slope below this = system contracting
  },
});
