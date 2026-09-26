'use strict';
/**
 * loom/schema/hook.js — Hook: a named, typed wire endpoint on one
 * component. Directly the Architect spec's own primitive: "a named,
 * typed wire between two system surfaces." A hook is one end of that; a
 * wire (wire.js) is the pairing of two hooks.
 * §SPLIT 2026-09-03 — see component.js's header for the split rationale.
 * Content unchanged — a pure move. KNOWN_HOOK_TYPES moved here rather
 * than left floating in definitions.js's thin loader — it's a hook's own
 * `type` field's seed list, its most direct real association, not a
 * cross-cutting constant that belongs nowhere in particular.
 *
 * Wire "type" is intentionally an open string, not a closed enum — per
 * the Architect spec's own authorial intent: "type (api, event bus,
 * callto, direct and any invention you can think of, like webserver.)"
 * KNOWN_HOOK_TYPES below is a *seed list*, not a ceiling. New types are
 * added by registering them, not by editing an enum.
 */

const KNOWN_HOOK_TYPES = Object.freeze([
  'api',        // REST/HTTP surface
  'event_bus',  // pub/sub, SSE fanout
  'callto',     // direct function/method invocation across a boundary
  'direct',     // in-process direct reference, no boundary crossing
  'webserver',  // a hook that itself serves, not just calls
  'cli',        // command-line surface
]);

const HOOK_SCHEMA = Object.freeze({
  requiredKeys: ['id', 'component_id', 'name', 'type', 'direction'],
  types: {
    id: 'string', component_id: 'string', name: 'string',
    type: 'string', direction: 'string',
  },
  // direction: 'in' | 'out' | 'bidirectional'. uuid — see note above.
});

module.exports = { HOOK_SCHEMA, KNOWN_HOOK_TYPES };
