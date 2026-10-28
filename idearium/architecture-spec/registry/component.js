'use strict';
/**
 * .architecture/schema/component.js — Component node schema + validator.
 * Restates loom/schema/component.js COMPONENT_SCHEMA unchanged; scoped
 * for reuse by any project, not owned by loom alone.
 */
const COMPONENT_SCHEMA = Object.freeze({
  requiredKeys: ['id', 'namespace', 'name', 'version'],
  types: { id: 'string', namespace: 'string', name: 'string', version: 'string' },
});

function checkComponent(payload) {
  const missing = COMPONENT_SCHEMA.requiredKeys.filter(k => !(k in (payload || {})));
  const wrongType = COMPONENT_SCHEMA.requiredKeys.filter(
    k => (k in (payload || {})) && typeof payload[k] !== COMPONENT_SCHEMA.types[k]
  );
  return { ok: missing.length === 0 && wrongType.length === 0, missing, wrongType };
}

module.exports = { COMPONENT_SCHEMA, checkComponent };
