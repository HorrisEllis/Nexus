'use strict';
/**
 * .architecture/schema/wire.js — Wire node schema + validator.
 * Restates loom/schema/wire.js WIRE_SCHEMA unchanged. A wire is the
 * pairing of exactly two hooks; intent (the WHY) is optional but
 * strongly preferred — a wire with no intent is topology only.
 */
const WIRE_SCHEMA = Object.freeze({
  requiredKeys: ['id', 'from_hook_id', 'to_hook_id'],
  types: { id: 'string', from_hook_id: 'string', to_hook_id: 'string' },
});

function checkWire(payload) {
  const p = payload || {};
  const missing = WIRE_SCHEMA.requiredKeys.filter(k => !(k in p));
  const wrongType = WIRE_SCHEMA.requiredKeys.filter(
    k => (k in p) && typeof p[k] !== WIRE_SCHEMA.types[k]
  );
  return { ok: missing.length === 0 && wrongType.length === 0, missing, wrongType };
}

module.exports = { WIRE_SCHEMA, checkWire };
