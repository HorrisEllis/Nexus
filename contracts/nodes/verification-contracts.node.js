'use strict';
/**
 * contracts/nodes/verification-contracts.node.js — extracted from contracts/SYSTEM-CONTRACTS.js
 * Real node id: contracts.verification-contracts.node
 * §EXTRACTED 2026-09-12 — cli/decompose.js --mode=registry, block VERIFICATION_CONTRACTS.
 * Verbatim body — this extraction moves the const, it does not re-derive it,
 * so nothing about the taxonomy itself changed, only where it lives.
 */
module.exports = Object.freeze({

  // Every system must pass all of these
  UNIVERSAL: [
    { id: 'V-UNI-01', check: 'GET /health returns { ok: true } within 3000ms' },
    { id: 'V-UNI-02', check: 'System registers with orchestrator on boot' },
    { id: 'V-UNI-03', check: 'System handshakes with Bridge on boot and receives token' },
    { id: 'V-UNI-04', check: 'Boot record written to event_log on successful start' },
    { id: 'V-UNI-05', check: 'UDP pulse emitted on :7777 within 15s of boot' },
    { id: 'V-UNI-06', check: 'System survives restart without data loss (§2.1)' },
    { id: 'V-UNI-07', check: 'All errors surface explicitly — no silent failures (§1.2)' },
    { id: 'V-UNI-08', check: 'interaction-contract.json present and valid JSON' },
    { id: 'V-UNI-09', check: 'System listed in SYSTEM-CONTRACTS.js SYSTEMS registry' },
    { id: 'V-UNI-10', check: 'Version number matches MANIFEST.json version field' },
  ],

  // §RETIRED 2026-09-06 — bridge verification contract removed.
  CORTEX: [
    { id: 'V-CTX-01', check: 'GET /health returns { status: ok, jaa: { counts } }' },
    { id: 'V-CTX-02', check: 'POST /api/event writes to event_log JAA table' },
    { id: 'V-CTX-03', check: 'GET /api/events returns array of events' },
    { id: 'V-CTX-04', check: 'GET /api/gaps returns open gaps array' },
    { id: 'V-CTX-05', check: 'POST /api/tags writes event to event_log and returns { ok:true, entityId, tags }' },
    { id: 'V-CTX-06', check: 'GET /api/requests returns Bridge ledger projection (not direct writes)' },
    { id: 'V-CTX-07', check: 'POST /api/table/insert rejects table=requests with 400' },
    { id: 'V-CTX-08', check: 'NAS router quarantines requests lacking bridgeUuid' },
    { id: 'V-CTX-09', check: '28 JAA tables initialised on boot' },
    { id: 'V-CTX-10', check: 'CFR ledger writes sigma + delta + cfr snapshot per event' },
    { id: 'V-CTX-11', check: 'GET /cfr/health returns CFR field dimensions' },
    { id: 'V-CTX-12', check: 'GET /cfr/nodes returns high-sigma nodes (may be empty)' },
    { id: 'V-CTX-13', check: 'Data survives cortex restart (§2.1)' },
  ],

  GUARDIAN: [
    { id: 'V-GRD-01', check: 'GET /health returns { ok, uptime, jobs, providers }' },
    { id: 'V-GRD-02', check: 'POST /command dispatches job and returns { ok, jobId }' },
    { id: 'V-GRD-03', check: 'GET /jobs returns job array' },
    { id: 'V-GRD-04', check: 'GET /providers returns provider connection status' },
    { id: 'V-GRD-05', check: 'Artifact capture: artifact written to JAA on response' },
    { id: 'V-GRD-06', check: 'SEAM queue: chunk injected → stable → verified lifecycle' },
    { id: 'V-GRD-07', check: 'Physical queue survives Guardian restart (§LAW II)' },
    { id: 'V-GRD-08', check: 'GET /bus returns SISO bus log' },
    { id: 'V-GRD-09', check: 'POST /bus/emit injects event to bus' },
    { id: 'V-GRD-10', check: 'NCP channel: GET /channel returns SSE stream' },
    { id: 'V-GRD-11', check: 'Enqueue calls notify Bridge before filesystem write' },
    { id: 'V-GRD-12', check: 'getLocalIPs() defined and returns array of { address, name }' },
    { id: 'V-GRD-13', check: 'uploadDir aliased from cfg.uploadDir before first use' },
  ],

  ORCHESTRATOR: [
    { id: 'V-ORC-01', check: 'GET /health returns all system health in parallel' },
    { id: 'V-ORC-02', check: 'POST /api/register accepts system registrations' },
    { id: 'V-ORC-03', check: 'GET /api/recall returns ledger history' },
    { id: 'V-ORC-04', check: 'GET /api/registry returns live heartbeat map' },
    { id: 'V-ORC-05', check: 'GET /sse returns unified SSE stream' },
    { id: 'V-ORC-06', check: 'Watchdog detects system offline within 15s' },
    { id: 'V-ORC-08', check: '_bootSystems invoked after server listen' },
    { id: 'V-ORC-09', check: 'Bridge added as first in boot sequence' },
    { id: 'V-ORC-10', check: 'cliRequests() and cliTag() defined and callable' },
    { id: 'V-ORC-11', check: 'Ledger persisted to data/ledger/orchestrator.jsonl' },
    { id: 'V-ORC-12', check: 'ui/orchestrator.js and root orchestrator.js are identical' },
  ],

  IDEARIUM: [
    { id: 'V-IDR-01', check: 'GET /health returns { ok, version, snr, uptime }' },
    { id: 'V-IDR-02', check: 'POST /api/ideas creates idea and returns uuid' },
    { id: 'V-IDR-03', check: 'POST /api/ideas/:uuid/spec creates spec from idea' },
    { id: 'V-IDR-04', check: 'POST /api/gaps opens gap linked to idea' },
    { id: 'V-IDR-05', check: 'GET /api/snr returns current SNR value 0..1' },
    { id: 'V-IDR-06', check: 'POST /api/snapshots creates versionium commit' },
    { id: 'V-IDR-07', check: 'GET /sse returns SSE stream with idearium events' },
    { id: 'V-IDR-08', check: 'startAPI() called at EOF of idearium/api/index.js' },
    { id: 'V-IDR-09', check: 'ESM chain: package.json type:module at every level' },
  ],

  EMERGE: [
    { id: 'V-EMG-01', check: 'GET /status returns { streams, schema: { keywords: 595 } }' },
    { id: 'V-EMG-02', check: 'POST /compile returns compile result' },
    { id: 'V-EMG-03', check: 'POST /check returns SNR gate result' },
    { id: 'V-EMG-04', check: 'emerge.spec loaded with 595 keywords' },
    { id: 'V-EMG-05', check: 'emerge-kernel.js loads without error' },
  ],
});
