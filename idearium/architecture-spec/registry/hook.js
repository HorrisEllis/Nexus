'use strict';
/**
 * .architecture/schema/hook.js — Hook node schema + validator.
 * Restates loom/schema/hook.js HOOK_SCHEMA unchanged. type is an open
 * seed list, not a closed enum — a hook is not software/API-only, it is
 * any point of interaction, interface, or wire connection: network,
 * data structure, or architecture level, same as genesis.spec's
 * four lattice levels (data, network, software, application).
 */
const KNOWN_HOOK_TYPES = Object.freeze([
  'api', 'event_bus', 'callto', 'direct', 'webserver', 'cli',
  // seed list only — register a new type, never edit this to "add" one
]);

const HOOK_SCHEMA = Object.freeze({
  requiredKeys: ['id', 'component_id', 'name', 'type', 'direction'],
  types: {
    id: 'string', component_id: 'string', name: 'string',
    type: 'string', direction: 'string',
  },
});

const HOOK_DIRECTIONS = Object.freeze(['in', 'out', 'bidirectional']);

function checkHook(payload) {
  const p = payload || {};
  const missing = HOOK_SCHEMA.requiredKeys.filter(k => !(k in p));
  const wrongType = HOOK_SCHEMA.requiredKeys.filter(
    k => (k in p) && typeof p[k] !== HOOK_SCHEMA.types[k]
  );
  const badDirection = ('direction' in p) && !HOOK_DIRECTIONS.includes(p.direction);
  return { ok: missing.length === 0 && wrongType.length === 0 && !badDirection, missing, wrongType, badDirection };
}

module.exports = { HOOK_SCHEMA, KNOWN_HOOK_TYPES, HOOK_DIRECTIONS, checkHook };
