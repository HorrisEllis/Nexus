'use strict';
/**
 * contracts/nodes/self-awareness.node.js — extracted from contracts/SYSTEM-CONTRACTS.js
 * Real node id: contracts.self-awareness.node
 * §EXTRACTED 2026-09-12 — cli/decompose.js --mode=registry, block SELF_AWARENESS.
 * Verbatim body — this extraction moves the const, it does not re-derive it,
 * so nothing about the taxonomy itself changed, only where it lives.
 */
module.exports = Object.freeze({

  // What every system must know about itself
  SELF: [
    'Own systemId, UUID, version, port',
    'Own health status (uptime, error count, last error)',
    'Own ledger path and write count',
    'Own Bridge token (from handshake) and expiry',
    'Own boot phase completion status',
    'Own SISO bus event count and last event type',
    'Own CFR field snapshot (coherence, friction, resonance, entropy, regime)',
  ],

  // What every system must know about the system
  SYSTEM: [
    'All other systems online/offline status (from orchestrator registry)',
    'Bridge request queue depth (held + pending)',
    'Own open gaps (from Cortex GET /api/gaps?source=<systemId>)',
    'Own recent failures (from Cortex failures table)',
    'Current CFR regime (from Cortex GET /cfr/health)',
    'Session UUID chain for context continuity',
  ],

  // How self-awareness is expressed in code
  IMPLEMENTATION: {
    health_endpoint:  'GET /health — returns own state snapshot',
    contract_endpoint:'GET /contract — returns own interaction contract',
    bus_endpoint:     'GET /bus — returns own SISO bus log',
    sse_endpoint:     'GET /sse or /events — live state stream',
    diagnose_check:   'node cli/diagnose.js <systemId> — external self-test',
    session_render:   'node cli/session.js — system-wide state snapshot',
  },
});
