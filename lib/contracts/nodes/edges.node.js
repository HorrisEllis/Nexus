'use strict';
/**
 * contracts/nodes/edges.node.js — extracted from contracts/SYSTEM-CONTRACTS.js
 * Real node id: contracts.edges.node
 * §EXTRACTED 2026-09-12 — cli/decompose.js --mode=registry, block EDGES.
 * Verbatim body — this extraction moves the const, it does not re-derive it,
 * so nothing about the taxonomy itself changed, only where it lives.
 */
module.exports = Object.freeze({

  // Named edges — every connection between systems
  USERSCRIPT_GUARDIAN:   { from: 'userscript',   to: 'guardian',     protocol: 'NCP/SSE+fetch', port: 7820, auth: 'none',         bidirectional: true },
  GUARDIAN_CORTEX:       { from: 'guardian',     to: 'cortex',       protocol: 'HTTP',          port: 3748, auth: 'none',         bidirectional: false },
  GUARDIAN_ORCHESTRATOR: { from: 'guardian',     to: 'orchestrator', protocol: 'HTTP',          port: 9000, auth: 'none',         bidirectional: false },
  ORCHESTRATOR_CORTEX:   { from: 'orchestrator', to: 'cortex',       protocol: 'HTTP',          port: 3748, auth: 'none',         bidirectional: false },
  ORCHESTRATOR_GUARDIAN: { from: 'orchestrator', to: 'guardian',     protocol: 'HTTP',          port: 7820, auth: 'none',         bidirectional: false },
  ORCHESTRATOR_IDEARIUM: { from: 'orchestrator', to: 'idearium',     protocol: 'HTTP',          port: 4800, auth: 'none',         bidirectional: false },
  IDEARIUM_GUARDIAN:     { from: 'idearium',     to: 'guardian',     protocol: 'HTTP',          port: 7820, auth: 'none',         bidirectional: false },
  EMERGE_OLLAMA:         { from: 'emerge',       to: 'ollama',       protocol: 'HTTP',          port: 11434,auth: 'none',         bidirectional: false },
  GUARDIAN_OLLAMA:       { from: 'guardian',     to: 'ollama',       protocol: 'HTTP',          port: 11434,auth: 'none',         bidirectional: false },
  UDP_PULSE:             { from: '*',            to: 'orchestrator', protocol: 'UDP',           port: 7777, auth: 'signed_pulse',  bidirectional: false, note: 'all systems broadcast pulse — orchestrator receives, not bridge (retired)' },

  // Edge failure modes
  FAILURE_MODES: {
    CONNECTION_REFUSED: 'connection_refused',  // target not running
    TIMEOUT:            'timeout',             // target running but slow
    AUTH_REJECTED:      'auth_rejected',       // bad or expired token
    CIRCUIT_OPEN:       'circuit_open',        // circuit breaker tripped
    SSE_DROPPED:        'sse_dropped',         // SSE connection dropped mid-stream
    NCP_STALE_TAB:      'ncp_stale_tab',       // NCP tab heartbeat missed > 15s
    CORS_BLOCKED:       'cors_blocked',        // browser blocked cross-origin
    TLS_MISMATCH:       'tls_mismatch',        // WSS TLS cert not accepted
  },
});
