'use strict';
/**
 * contracts/nodes/gaps.node.js — extracted from contracts/SYSTEM-CONTRACTS.js
 * Real node id: contracts.gaps.node
 * §EXTRACTED 2026-09-12 — cli/decompose.js --mode=registry, block GAPS.
 * Verbatim body — this extraction moves the const, it does not re-derive it,
 * so nothing about the taxonomy itself changed, only where it lives.
 */
module.exports = Object.freeze({

  // Gap types — what kind of structural problem
  TYPES: {
    UNRESOLVED:       'unresolved',        // active, still being worked
    CONTRADICTION:    'contradiction',     // two parts of the system disagree
    MISSING_LINK:     'missing_link',      // connection between systems not wired
    BOUNDARY_GAP:     'boundary_gap',      // edge between systems undefined
    FILE_FRICTION:    'file_friction',     // file missing or inaccessible
    SPEC_INCOMPLETE:  'spec_incomplete',   // spec references undefined variables
    CI_FAIL:          'ci_fail',           // test or integration failure
    SCHEMA_VIOLATION: 'schema_violation',  // data doesn't match expected shape
    WIRING_MISSING:   'wiring_missing',    // module not connected to event bus
    BASELINE_DRIFT:   'baseline_drift',    // system behaviour deviated from baseline
    LEDGER_DIVERGENCE:'ledger_divergence', // two truth sources disagree
    PHANTOM_REQUEST:  'phantom_request',   // request exists in one ledger but not another
    HASH_COLLISION:   'hash_collision',    // two artifacts share a hash (simpleHash weakness)
    REPLAY_ORPHAN:    'replay_orphan',     // queue item has no corresponding ledger entry
    CONTRACT_MISMATCH:'contract_mismatch', // runtime behaviour differs from declared contract
    SILENT_FAILURE:   'silent_failure',    // §1.2 violation — failure not surfaced
    TRUST_VIOLATION:  'trust_violation',   // system called another without Bridge token
    ROGUE_WRITE:      'rogue_write',       // direct write to protected table bypassed Bridge
    HELD_OVERFLOW:    'held_overflow',     // held queue exceeds expected capacity
  },

  // Gap severities
  SEVERITIES: {
    FATAL:  'fatal',   // system cannot function — halt and diagnose
    HIGH:   'high',    // significant degradation — fix before next build
    MEDIUM: 'medium',  // non-blocking but tracked
    LOW:    'low',     // informational — review in next session
  },

  // Compounding effect classes (from lib/causal/compound.js)
  COMPOUND_CLASSES: {
    RIPPLE: { id: 'ripple', desc: '1 downstream event — expected normal flow. Not documented.' },
    WAVE:   { id: 'wave',   desc: '2-5 downstream events, spreading. Written to event_log.' },
    TIDAL:  { id: 'tidal',  desc: '6+ downstream events, compounding cascade. Opens a gap, written to event_log.' },
  },

  // Named compounding factors — what causes an event to amplify rather than dampen
  COMPOUNDING_FACTORS: {
    SIGMA_AMPLIFICATION:        'sigma_amplification',        // each hop has higher sigma — divergence growing
    RETRY_CASCADE:              'retry_cascade',              // retries amplify resonance and friction
    CROSS_SYSTEM_PROPAGATION:   'cross_system_propagation',   // effect crossed system boundary — isolation failed
    UNRESOLVED_GAP_CHAIN:       'unresolved_gap_chain',       // gaps opened faster than resolved
    CONTRACT_VIOLATION_AMPLIFIER:'contract_violation_amplifier',// contract violations inject +0.15 entropy each
    TENSION_ESCALATION:         'tension_escalation',         // delta tension growing across hops
    BACKPRESSURE_RELEASE:       'backpressure_release',       // held queue draining or backpressure releasing
  },

  // Gap statuses
  STATUSES: {
    OPEN:      'open',      // gap exists, not addressed
    RESOLVED:  'resolved',  // gap closed with proof
    IGNORED:   'ignored',   // gap acknowledged, explicitly deferred
    REJECTED:  'rejected',  // not a gap — classified as expected behaviour
  },

  // Idea failure classifications (§7.5)
  IDEA_FAILURE: {
    UNRESOLVED:  'unresolved',   // active, still being worked
    REJECTED:    'rejected',     // validated and failed — proof exists
    ABANDONED:   'abandoned',    // set aside without validation
  },
});
