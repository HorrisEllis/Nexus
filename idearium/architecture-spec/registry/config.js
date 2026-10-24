'use strict';
/**
 * .architecture/schema/config.js — Config node schema + validator.
 * Deliberately minimal — a config node's whole point is that its value
 * changes freely at runtime (HARDLINE_AS_LITTLE_AS_POSSIBLE). The
 * schema only guarantees a config node is addressable and carries a
 * value; it says nothing about what that value should be, on purpose.
 */
const CONFIG_SCHEMA = Object.freeze({
  requiredKeys: ['id', 'value'],
  types: { id: 'string' }, // value is intentionally untyped — a config value can be any JSON type
});

function checkConfig(payload) {
  const p = payload || {};
  const missing = CONFIG_SCHEMA.requiredKeys.filter(k => !(k in p));
  return { ok: missing.length === 0, missing };
}

module.exports = { CONFIG_SCHEMA, checkConfig };
