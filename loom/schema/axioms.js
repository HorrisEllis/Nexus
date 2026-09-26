'use strict';
/**
 * loom/schema/axioms.js — Warp Axioms enforcing LOOM's referential
 * integrity. These are what a bare Gate can't do: a Gate only sees the
 * one event in front of it, an Axiom's check(event, gate, streamState)
 * can close over the LoomRegistry and ask "does this collide with, or
 * dangle from, something already on disk."
 *
 * All five below are HARD per AXIOMS-v3.0 §1.2/1.3 — a structurally
 * dangling wire or a duplicate id is exactly the kind of thing that
 * "pretends to work" if allowed through as a soft warning.
 *
 * makeLoomAxioms(registry) is a factory, not a static export, because
 * the check functions need a live LoomRegistry instance to query —
 * Warp's Axiom primitive doesn't mandate purity here (only Gate does),
 * this is precisely what Axiom exists for.
 */
const { Axiom } = require('../../warp/core');

function makeLoomAxioms(registry) {
  return [
    new Axiom('loom.unique-id', {
      severity: 'hard',
      check(event) {
        const kindMatch = /^loom\.(component|seam|hook|wire)\.declare$/.exec(event.type);
        if (!kindMatch) return true; // not our concern, pass through
        const kind = kindMatch[1];
        const id = event.data && event.data.id;
        if (!id) return true; // schema validation (Gate) catches missing id
        return !registry.has(kind, id);
      },
    }),

    new Axiom('loom.seam-component-exists', {
      severity: 'hard',
      check(event) {
        if (event.type !== 'loom.seam.declare') return true;
        const cid = event.data && event.data.component_id;
        if (!cid) return true; // Gate schema check catches missing component_id
        return registry.has('component', cid);
      },
    }),

    new Axiom('loom.hook-component-exists', {
      severity: 'hard',
      check(event) {
        if (event.type !== 'loom.hook.declare') return true;
        const cid = event.data && event.data.component_id;
        if (!cid) return true;
        return registry.has('component', cid);
      },
    }),

    new Axiom('loom.wire-endpoints-exist', {
      severity: 'hard',
      check(event) {
        if (event.type !== 'loom.wire.declare') return true;
        const { from_hook_id, to_hook_id } = event.data || {};
        if (!from_hook_id || !to_hook_id) return true;
        return registry.has('hook', from_hook_id) && registry.has('hook', to_hook_id);
      },
    }),

    new Axiom('loom.uuid-present', {
      severity: 'hard',
      check(event) {
        if (!/^loom\.(component|seam|hook|wire)\.declare$/.test(event.type)) return true;
        return typeof (event.data && event.data.uuid) === 'string' && event.data.uuid.length > 0;
      },
    }),
  ];
}

module.exports = { makeLoomAxioms };
