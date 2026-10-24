'use strict';
/**
 * .architecture/schema/bundle.js — NodeBundle schema + validator.
 * A reference-only grouping of related node ids (a component with its
 * intent, command, config, and event nodes) so they can be addressed,
 * moved, and tracked as one set. Members stay independent files — this
 * is an index entry, never a container. Preserves SMALLEST_UNIT.
 */
const BUNDLE_SCHEMA = Object.freeze({
  requiredKeys: ['bundle_id', 'members'],
  types: { bundle_id: 'string', members: 'object' }, // members: array, checked separately
});

function checkBundle(payload) {
  const p = payload || {};
  const missing = BUNDLE_SCHEMA.requiredKeys.filter(k => !(k in p));
  const membersIsArray = Array.isArray(p.members);
  return { ok: missing.length === 0 && membersIsArray, missing, membersIsArray };
}

module.exports = { BUNDLE_SCHEMA, checkBundle };
