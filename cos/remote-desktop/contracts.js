'use strict';
/**
 * contracts.js — interaction contracts for this project.
 *
 * Started as just the remote-desktop/bridge-os-core boundary; now covers
 * every internal module boundary the same way, matching how core's own
 * bridge-contracts hosts multiple unrelated module-pair contracts in one
 * file rather than one file per pair. Core stays isolated regardless —
 * the 'core-*' contracts below are still the only things this project
 * assumes about core's shape.
 *
 * Mirrors bridge-os-core's own bridge-contracts pattern (assert shape at
 * the boundary, throw on violation, never silently coerce) rather than
 * inventing a different validation style at this seam.
 */

const CONTRACTS = {
  // what bridge-identity's loadOrInit() is required to hand back
  'core-identity': ['uuid', 'publicKey'],

  // what this project hands back to itself as an issued token
  'session-token': ['token', 'sessionId', 'issuedTo', 'expiresAt'],

  // shape of every event this project's own modules emit — kept so the
  // event bus stays inspectable/testable without reading source
  'token-event': ['type', 'sessionId', 'ts'],

  // what a viewer's raw input action looks like before it's signed —
  // kind is checked against a fixed set by input-injector.js itself
  // (contracts.js checks shape, not the specific allowed values)
  'input-event': ['kind', 'ts'],

  // what goes over the datachannel — the raw input-event plus the
  // per-message auth envelope input-auth.js adds
  'signed-input-frame': ['kind', 'ts', 'nonce', 'sig'],
};

function validate(name, subject) {
  const contract = CONTRACTS[name];
  if (!contract) throw new Error(`contracts.js: no contract registered for "${name}"`);
  if (!subject || typeof subject !== 'object') {
    throw new Error(`contracts.js: contract "${name}" violated — subject is not an object`);
  }
  const missing = contract.filter((key) => !(key in subject));
  if (missing.length) {
    throw new Error(`contracts.js: contract "${name}" violated — missing: ${missing.join(', ')}`);
  }
  return true;
}

module.exports = { validate, CONTRACTS };
