'use strict';
/**
 * contracts/SYSTEM-CONTRACTS.js — NEXUS System-Wide Contract Registry
 * UUID: nexus-contracts-registry-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Single source of truth for every named entity in the system:
 *   - Interaction contracts (per system)
 *   - Verification contracts (what each system must prove)
 *   - Event taxonomy (every named event type)
 *   - Gap taxonomy (every named gap type and severity)
 *   - Failure modes (every named fault and fault class)
 *   - Edge types (every named system boundary)
 *   - Delta types (transition physics)
 *   - Divergent types (CFR regimes and anomaly classes)
 *   - Bottleneck signals (ledger flow indicators)
 *   - Ledger taxonomy (every named ledger and its authority)
 *
 * §5.1  Everything has a UUID — every contract entry has a UUID.
 * §5.2  Everything routes through RAID — all systems listed here.
 * §6.1  Documentation generated from proof — this file is the proof layer.
 * §7.0  Event ontology separation — observational vs authoritative events named.
 * §1.2  Nothing silently fails — every failure mode named and classified.
 *
 * Usage:
 *   const C = require('./contracts/SYSTEM-CONTRACTS');
 *   C.EVENTS.GUARDIAN.JOB_COMPLETE  → 'guardian.job.complete'
 *   C.GAPS.TYPES.WIRING_MISSING     → 'wiring_missing'
 *   C.FAULTS.CLASS.SILENT_FAILURE   → 'silent_failure'
 */

const { randomUUID } = require('crypto');

// ── System version — single source of truth ────────────────────────────────
const NEXUS_VERSION = '0.4.0-pre'; // 0.x = pre-release. 1.0.0 = system builds on itself.

// ══════════════════════════════════════════════════════════════════════════════
// §1 — AXIOM REGISTRY
// Every axiom referenced in this system, machine-readable.
// ══════════════════════════════════════════════════════════════════════════════

const AXIOMS = require('./nodes/axioms.node');

// ══════════════════════════════════════════════════════════════════════════════
// §2 — SYSTEM REGISTRY
// Every system, its port, UUID, role, and health path.
// ══════════════════════════════════════════════════════════════════════════════

const SYSTEMS = require('./nodes/systems.node');

// ══════════════════════════════════════════════════════════════════════════════
// §3 — EVENT TAXONOMY
// Every named event type in the system, classified and documented.
// ══════════════════════════════════════════════════════════════════════════════

const EVENTS = require('./nodes/events.node');

// ══════════════════════════════════════════════════════════════════════════════
// §4 — GAP TAXONOMY
// Every named gap type, severity, and status.
// ══════════════════════════════════════════════════════════════════════════════

const GAPS = require('./nodes/gaps.node');

// ══════════════════════════════════════════════════════════════════════════════
// §5 — FAILURE MODE TAXONOMY
// Every named fault class, fault, and failure pattern.
// ══════════════════════════════════════════════════════════════════════════════

const FAULTS = require('./nodes/faults.node');

// ══════════════════════════════════════════════════════════════════════════════
// §6 — EDGE TAXONOMY
// Every named system boundary (edge) in the architecture.
// ══════════════════════════════════════════════════════════════════════════════

const EDGES = require('./nodes/edges.node');

// ══════════════════════════════════════════════════════════════════════════════
// §7 — DELTA TAXONOMY
// Transition physics — named delta types and their axes.
// ══════════════════════════════════════════════════════════════════════════════

const DELTAS = require('./nodes/deltas.node');

// ══════════════════════════════════════════════════════════════════════════════
// §8 — DIVERGENT TYPE TAXONOMY
// CFR field regimes and anomaly classifications.
// ══════════════════════════════════════════════════════════════════════════════

const DIVERGENT = require('./nodes/divergent.node');

// ══════════════════════════════════════════════════════════════════════════════
// §9 — BOTTLENECK TAXONOMY
// Named bottleneck signals from ledger flow analysis.
// ══════════════════════════════════════════════════════════════════════════════

const BOTTLENECKS = require('./nodes/bottlenecks.node');

// ══════════════════════════════════════════════════════════════════════════════
// §10 — LEDGER TAXONOMY
// Every named ledger, its authority, and write rules.
// ══════════════════════════════════════════════════════════════════════════════

const LEDGERS = require('./nodes/ledgers.node');

// ══════════════════════════════════════════════════════════════════════════════
// §11 — INTERACTION CONTRACTS
// Declared contracts for every system boundary.
// ══════════════════════════════════════════════════════════════════════════════

const INTERACTION_CONTRACTS = require('./nodes/interaction-contracts.node');

// ══════════════════════════════════════════════════════════════════════════════
// §12 — VERIFICATION CONTRACTS
// What each system must prove to be considered functional.
// ══════════════════════════════════════════════════════════════════════════════

const VERIFICATION_CONTRACTS = require('./nodes/verification-contracts.node');

// ══════════════════════════════════════════════════════════════════════════════
// §12b — CAUSAL PHYSICS MODEL
// The three-layer causal stack and the physics of propagation.
// ══════════════════════════════════════════════════════════════════════════════

const CAUSAL_PHYSICS = require('./nodes/causal-physics.node');

// ══════════════════════════════════════════════════════════════════════════════
// §13 — SELF-AWARENESS CONTRACT
// Every backend system must be aware of its own state and the system state.
// ══════════════════════════════════════════════════════════════════════════════

const SELF_AWARENESS = require('./nodes/self-awareness.node');

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════════════════════

module.exports = {
  NEXUS_VERSION,
  AXIOMS,
  SYSTEMS,
  EVENTS,
  GAPS,
  FAULTS,
  EDGES,
  DELTAS,
  DIVERGENT,
  BOTTLENECKS,
  LEDGERS,
  INTERACTION_CONTRACTS,
  VERIFICATION_CONTRACTS,
  SELF_AWARENESS,

  // Convenience: get contract for a system by id
  CAUSAL_PHYSICS,

  getContract(systemId) {
    return INTERACTION_CONTRACTS[systemId.toUpperCase()] || null;
  },

  // Convenience: get verification checks for a system
  getVerification(systemId) {
    return VERIFICATION_CONTRACTS[systemId.toUpperCase()] || VERIFICATION_CONTRACTS.UNIVERSAL;
  },

  // Convenience: get all event types as a flat array
  allEventTypes() {
    const types = [];
    for (const group of Object.values(EVENTS)) {
      for (const val of Object.values(group)) {
        if (typeof val === 'string') types.push(val);
      }
    }
    return [...new Set(types)].sort();
  },
};
