'use strict';

/**
 * lib/compartment-dom-ledger.js
 *
 * §MCO10 2026-09-13 — James: "stream the DOM to the compartment ledger per
 * contract using the compartment uuid."
 *
 * Extracted out of cortex/boot.js's bus listener specifically so this real
 * logic is unit-testable without booting boot.js's real HTTP server (that
 * file's own module.exports triggers server.listen() as a require-time
 * side effect — not something a unit test should trigger just to check an
 * insert decision). boot.js's bus.on('compartment.dom.event', ...) calls
 * recordDomEvent(jaaDB, payload) directly; this file has no bus/HTTP
 * dependency of its own.
 */

/**
 * recordDomEvent(jaa, payload) — inserts a real row into
 * compartment_dom_ledger, keyed by the real compartment uuid, or drops
 * the event with an honest reason when there's nothing real to key it by.
 *
 * @param {object} jaa     - a jaaDB-shaped store (insert(table, row))
 * @param {object} payload - { compartmentUuid, queueId, type, agentId, dom, ts }
 * @param {Function} [uidFn] - id generator; defaults to crypto.randomUUID
 * @returns {{ok: boolean, reason?: string, row?: object}}
 */
function recordDomEvent(jaa, payload, uidFn) {
  const uid = uidFn || (() => require('crypto').randomUUID());

  if (!payload || !payload.compartmentUuid) {
    // §1.2 — a DOM event with no real compartment association isn't a
    // ledger entry for anything queryable; dropped and reported, not
    // fabricated with a null key.
    return { ok: false, reason: 'no compartmentUuid — dropped, not fabricated' };
  }

  const row = {
    uuid:            uid(),
    compartmentUuid: payload.compartmentUuid,
    queueId:         payload.queueId || null,
    domEventType:    payload.type || 'unknown',
    agentId:         payload.agentId || null,
    payload:         JSON.stringify(payload.dom || payload),
    ts:              payload.ts || Date.now(),
  };

  try {
    jaa.insert('compartment_dom_ledger', row);
    return { ok: true, row };
  } catch (e) {
    return { ok: false, reason: `insert failed: ${e.message}` };
  }
}

module.exports = { recordDomEvent };
