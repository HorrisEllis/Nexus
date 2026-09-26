'use strict';
/**
 * loom/schema/wire.js — Wire: the connection between exactly two hooks.
 * §SPLIT 2026-09-03 — see component.js's header for the split rationale.
 * Content unchanged — a pure move.
 */
const WIRE_SCHEMA = Object.freeze({
  requiredKeys: ['id', 'from_hook_id', 'to_hook_id'],
  types: {
    id: 'string', from_hook_id: 'string', to_hook_id: 'string',
  },
  // uuid — see component.js's own note on the loom.uuid-present Axiom.
});

module.exports = { WIRE_SCHEMA };
