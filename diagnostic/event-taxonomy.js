'use strict';
// diagnostic/event-taxonomy.js — diagnostic's event vocabulary (genesis 1.5.0's event-taxonomy.js), in lib/event-taxonomy-pattern.js's
// ET1 shape. James, 2026-10-17: "the diagnostic needs to be a real system matching genasis."
//
// §CHECKED, NOT GUESSED (0.60.138) — every event below is a broadcast({ type }) in diagnostic/nexus-diagnostic.js (its SSE stream,
// GET /events), read in the file before it was written here. Two are families, said as such: the contract verifier's violations
// carry the verifier's own type string, and the node registry's events are diagnostic.node.* (lib/node-registry.js).
module.exports = Object.freeze({
  GAP_FOUND: { description: 'A gap was found while polling the systems (offline, unhealthy, a contract or wire broken, a pulse missed) and recorded in the gaps ledger.', payloadShape: ['gap'], severity: 'warning' },
  GAP_RESOLVED: { description: 'A gap recorded earlier no longer holds and was closed.', payloadShape: ['gap'], severity: 'notable' },
  CFR_UPDATE: { description: 'The CFR field reading changed (coherence, friction, entropy) for the systems diagnostic watches.', payloadShape: ['field'], severity: 'info' },
  SYSTEM_ADOPTED: { description: 'A system diagnostic was not watching answered and is now monitored.', payloadShape: ['system'], severity: 'notable' },
  PULSE_GAP: { description: 'A system stopped sending its pulse (lib pulse-watch): it is reached but silent.', payloadShape: ['system', 'since'], severity: 'warning' },
  PULSE_RECOVERED: { description: 'A system whose pulse had stopped is sending it again.', payloadShape: ['system'], severity: 'notable' },
  POLL_COMPLETE: { description: 'One polling round over every monitored system finished.', payloadShape: ['systems', 'ms'], severity: 'info' },
  LEDGER_UPDATED: { description: 'Diagnostic\'s own ledger was written (a gap, a trace, a summary).', payloadShape: ['ledger'], severity: 'info' },
  INTEGRITY_BASELINE_ACCEPTED: { description: 'A person accepted the current wire-integrity readings as the new baseline (POST /integrity/accept).', payloadShape: ['by', 'count'], severity: 'notable' },
  SERVICE_START: { description: 'Diagnostic\'s service started and is listening.', payloadShape: ['port', 'ts'], severity: 'info' },
  DIAGNOSTIC_REMEDIATION: { description: 'Diagnostic asked for a remediation of a gap (the heal path: a proposal or a RAID contract).', payloadShape: ['gap', 'contract'], severity: 'notable' },
  CONTRACT_VIOLATION: { description: 'A family: the contract verifier saw a system break its interaction contract; the event carries the verifier\'s own type string.', payloadShape: ['type', 'system', 'message', 'severity'], severity: 'warning' },
  DIAGNOSTIC_NODE: { description: 'A family: diagnostic.node.added / changed / removed / invalid from its node registry (lib/node-registry.js) over diagnostic/data/nodes.', payloadShape: ['system', 'type', 'id'], severity: 'info' },
});
