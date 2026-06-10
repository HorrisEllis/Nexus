'use strict';
/**
 * lib/cfr/index.js — CFR-Ω module exports
 * UUID: nexus-cfr-index-v1-0000-4000-0000-000000000001
 *
 * Single entry point for all CFR-Ω subsystems.
 *
 * Quick integration guide:
 *
 *   // 1. Replace createEventLedger with createCFRLedger:
 *   const { createCFRLedger } = require('./lib/cfr');
 *   const ledger = createCFRLedger({ ledgerDir, systemId, onGap });
 *   ledger.open();
 *
 *   // 2. Mount CFR routes on your HTTP server:
 *   if (url.pathname.startsWith('/cfr')) {
 *     if (ledger.handleCFRRoute(req, res, url)) return;
 *   }
 *
 *   // 3. Every bus.emit goes through the ledger:
 *   bus.emit = (type, data) => {
 *     ledger.record(type, data, { causedBy: data?.jobId });
 *     return origEmit(type, data);
 *   };
 *
 *   // 4. Run the CLI debugger:
 *   node cli/cfr-debug.js replay <ledger.jsonl>
 *   node cli/cfr-debug.js live   http://127.0.0.1:7820
 */

module.exports = {
  createCFRLedger:           require('./ledger').createCFRLedger,
  createCFRField:            require('./field').createCFRField,
  computeRegime:             require('./field').computeRegime,
  EVENT_NUDGES:              require('./field').EVENT_NUDGES,
  computeSigma:              require('./sigma').computeSigma,
  computeDelta:              require('./delta').computeDelta,
  CausalGraph:               require('./graph').CausalGraph,
  createContractVerifier:    require('./contract-verifier').createContractVerifier,
  loadContracts:             require('./contract-verifier').loadContracts,
};
