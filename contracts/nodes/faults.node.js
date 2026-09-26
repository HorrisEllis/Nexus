'use strict';
/**
 * contracts/nodes/faults.node.js — extracted from contracts/SYSTEM-CONTRACTS.js
 * Real node id: contracts.faults.node
 * §EXTRACTED 2026-09-12 — cli/decompose.js --mode=registry, block FAULTS.
 * Verbatim body — this extraction moves the const, it does not re-derive it,
 * so nothing about the taxonomy itself changed, only where it lives.
 */
module.exports = Object.freeze({

  // Fault classes — the category of failure
  CLASS: {
    SILENT_FAILURE:       'silent_failure',       // §1.2 — not surfaced
    PHANTOM_WRITE:        'phantom_write',         // write claimed but not proven
    DUAL_TRUTH:           'dual_truth',            // two systems disagree on state
    ROGUE_BYPASS:         'rogue_bypass',          // direct call bypassed Bridge
    REPLAY_DOUBLE:        'replay_double',         // same request replayed twice
    GHOST_CALL:           'ghost_call',            // function called but never defined
    STUB_IN_PRODUCTION:   'stub_in_production',    // §1.3 violation
    SCOPE_ESCAPE:         'scope_escape',          // variable referenced outside scope
    MISSING_PROVENANCE:   'missing_provenance',    // no bridgeUuid on request
    TOKEN_EXPIRY:         'token_expiry',          // Bridge token expired mid-session
    CIRCUIT_DEADLOCK:     'circuit_deadlock',      // all fallbacks circuit-open simultaneously
    HELD_STARVATION:      'held_starvation',       // held queue never drains
    CONTEXT_LOSS:         'context_loss',          // session UUID chain broken
    HASH_DRIFT:           'hash_drift',            // same content, different hash algorithms
    MONOLITH_GROWTH:      'monolith_growth',       // module absorbing unrelated concerns
    BOOT_ORDER_VIOLATION: 'boot_order_violation',  // system booted before its dependency
    VERSION_DRIFT:        'version_drift',         // §5.4 — versions diverged across files
    LEDGER_ORPHAN:        'ledger_orphan',         // ledger entry with no causal parent
    CONTRACT_DRIFT:       'contract_drift',        // runtime behaviour drifted from contract
    CFR_COLLAPSE:         'cfr_collapse',          // field entered chaotic regime and stayed
    INVARIANT_BREAK:      'invariant_break',       // co-occurrence pattern broken unexpectedly
  },

  // Specific named faults encountered in this system
  KNOWN: {
    UPLOAD_DIR_UNDEFINED:   { id: 'F001', desc: 'uploadDir not aliased from cfg.uploadDir in Guardian dropzone server', fixed: true },
    GET_LOCAL_IPS_MISSING:  { id: 'F002', desc: 'getLocalIPs() called but never defined in guardian/server.js', fixed: true },
    BOOT_SYSTEMS_NOT_CALLED:{ id: 'F003', desc: '_bootSystems required but never invoked in orchestrator.js', fixed: true },
    POST_BRIDGE_GHOST:      { id: 'F004', desc: 'nc.postBridge() called in 3 places but not defined in nexus-connect.js', fixed: true },
    REQUESTS_OPEN_WRITE:    { id: 'F005', desc: 'requests table in ALLOWED set for POST /api/table/insert — Bridge bypass possible', fixed: true },
    TAGS_ENDPOINT_STUB:     { id: 'F006', desc: 'POST /api/tags in cortex admin-server returned ok:true without writing anything', fixed: true },
    NAS_PHANTOM_REQUESTS:   { id: 'F007', desc: 'NAS router polling for file_resolve requests that nothing creates', fixed: true },
    CLI_REQUESTS_GHOST:     { id: 'F008', desc: 'cliRequests() and cliTag() called in orchestrator CLI but never defined', fixed: true },
    CFR_NODE_WIPE:          { id: 'F009', desc: 'syncCanvasNodes() wiped all attractors on empty /cfr/nodes response', fixed: true },
    SIMPLE_HASH_COLLISION:  { id: 'F010', desc: 'simpleHash() in userscript is not content-addressed — collision risk', fixed: false },
    USERSCRIPT_LOCALSTORAGE:{ id: 'F011', desc: 'Userscript uses localStorage for state — lost on tab close', fixed: false },
    CONTEXT_NOT_INJECTED:   { id: 'F012', desc: 'No pre-prompt context injection — agent starts cold every session', fixed: false },
    DUAL_ORCHESTRATOR:      { id: 'F013', desc: 'ui/orchestrator.js and root orchestrator.js diverged', fixed: true },
    BRIDGE_NEVER_BUILT:     { id: 'F014', desc: 'Bridge referenced everywhere but bridge/ directory did not exist', fixed: true },
    ENQUEUE_BYPASS:         { id: 'F015', desc: 'Three _physQueue.enqueue() calls bypassed Bridge entirely', fixed: true },
  },
});
