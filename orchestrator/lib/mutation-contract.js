'use strict';
/**
 * lib/mutation-contract.js — NEXUS Mutation Contract
 * UUID: nexus-mutation-contract-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * Implements seam-component-registry-spec.md §9.5 — the governance layer
 * for how a human (CLI, eventually API) may change live component state.
 * This is NOT the comp_type/role-revalidation engine from spec §2/§6 — that
 * remains unbuilt because 5 of the spec's 7 "unresolved decisions" (§9)
 * block it (drift thresholds, violation reaction mode, multi-role
 * components, etc). This module only covers what the spec itself marks as
 * unblocked: the mutation contract is "the foundational piece" (§9.5),
 * independent of those open questions.
 *
 * §SCHEMA MAPPING — read this before changing FORBIDDEN/ALLOWED below:
 * The spec's wire vocabulary (comp_id, comp_type, comp_lineage, comp_intent,
 * comp_properties) does NOT match the live component-registry.js schema
 * (id, namespace, comp_types[] — an array of {type,files,intent}, no
 * lineage field exists at all yet). Renaming the live schema to match the
 * spec would break every existing caller (orchestrator, grammar-engine,
 * the CLI, request-handler) — not something to do silently per §5.3.
 * Instead: the EXTERNAL contract (ledger event shape, forbidden/allowed
 * target names) matches the spec's literal vocabulary, character for
 * character, because that's the part meant to be stable/queryable per
 * spec §8. The mapping to live field names is explicit below, in one place.
 *
 *   spec field      | live registry field           | mutable here?
 *   ----------------|--------------------------------|---------------
 *   comp_id         | id                             | NO (identity)
 *   comp_type       | comp_types[].type              | NO (identity)
 *   comp_intent     | comp_types[].intent            | NO (identity)
 *   comp_lineage    | (does not exist yet)            | NO (reserved)
 *   comp_properties | properties (new field, added    | YES — this is
 *                   |   by this module via _coerce)   |   the only door
 *
 * The one explicitly-deferred spec decision this module had to default
 * (§9 item 6 — "whether requires_audit/emits_event are hardcoded true or
 * configurable per comp_properties domain"): hardcoded true, matching the
 * spec's own mutation_contract YAML example (`requires_audit: true,
 * emits_event: true`) literally. Flagged here, not silently assumed.
 */

const crypto = require('crypto');
const compReg = require('../../lib/component-registry');

const MODULE_ID = 'mutation-contract';
const VERSION   = '1.0.0';

// This module owns its own JAA/bus refs — same pattern every other module
// here uses (component-registry.js's own _jaa/_bus are private by design;
// reaching into them would be the coupling §5.7 forbids). Must be init'd
// before mutateProperty() can persist an event; boot wiring added below.
let _jaa = null;
let _bus = null;
function init(jaaDB, bus) {
  _jaa = jaaDB;
  _bus = bus;
  return { ok: true };
}

// Spec §9.5 forbidden_targets, mapped to the live schema's identity surface.
// FORBIDDEN_TOP is the registry's actual field names — checked against
// what register()/update() would touch. ALLOWED_PREFIX is the one open
// door, in the spec's own vocabulary.
const FORBIDDEN_TOP   = new Set(['id', 'uuid', 'namespace', 'comp_types', 'registeredAt']);
const ALLOWED_PREFIX  = 'comp_properties.'; // spec's literal wire name

function _getByPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function _setByPath(obj, path, value) {
  const parts = path.split('.');
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

/**
 * Validate a mutation target against the contract, without applying it.
 * @param {string} field - dot path, e.g. "comp_properties.style.color"
 */
function checkTarget(field) {
  if (typeof field !== 'string' || !field) {
    return { ok: false, error: 'field is required' };
  }
  const topLevel = field.split('.')[0];
  if (field.startsWith('comp_properties')) {
    // comp_properties or comp_properties.<anything> — the open door
    return { ok: true };
  }
  if (FORBIDDEN_TOP.has(topLevel)) {
    return { ok: false, error: `"${topLevel}" is a forbidden mutation target (identity field, spec §9.5) — established at registration, never edited by hand` };
  }
  return { ok: false, error: `"${field}" is not under comp_properties — only comp_properties.* is mutable via this contract` };
}

/**
 * Mutate a component's comp_properties field, emitting the spec-literal
 * ledger event. This is the only write path comp_properties should go
 * through — register()/update() in component-registry.js remain the path
 * for identity/registration, untouched by this module.
 *
 * @param {string} compId - live registry id (maps to spec's comp_id)
 * @param {string} field - e.g. "comp_properties.style.color"
 * @param {*} newValue
 * @param {object} opts
 * @param {string} [opts.issuedVia] - 'cli' | 'api' | 'migration' (spec §9.5 source enum)
 */
function mutateProperty(compId, field, newValue, opts = {}) {
  const issuedVia = opts.issuedVia || 'api';
  if (!['cli', 'api', 'migration'].includes(issuedVia)) {
    return { ok: false, error: `issuedVia must be one of: cli, api, migration — got "${issuedVia}"` };
  }

  const check = checkTarget(field);
  if (!check.ok) return check;

  const component = compReg.get(compId);
  if (!component) return { ok: false, error: `component not found: ${compId}` };

  // Map spec's "comp_properties.x.y" wire path onto the live record's
  // "comp_properties" field directly — same name, since this is the one
  // field this module owns end-to-end rather than translating.
  const oldValue = _getByPath(component, field);
  const patched = { ...component };
  _setByPath(patched, field, newValue);

  // §9.5 ledger event — field names match the spec's JSON example literally.
  const event = {
    uuid: crypto.randomUUID(),
    comp_id: compId,
    event_type: 'property_mutated',
    field,
    old_value: oldValue === undefined ? null : oldValue,
    new_value: newValue,
    issued_via: issuedVia,
    timestamp: new Date().toISOString(),
  };

  // requires_audit:true / emits_event:true — hardcoded per the spec's own
  // YAML example, since §9 item 6 left this configurable-or-not unresolved.
  // §1.2: write the audit record BEFORE the property change commits, not
  // after — an earlier version of this function committed first and only
  // discovered the missing init() afterward, which meant a real rollback
  // would have required a second write rather than just not writing at
  // all. Audit-first means a failed/un-initialized audit path means
  // nothing was ever half-applied.
  if (!_jaa) {
    return {
      ok: false,
      error: `mutation-contract.init(jaaDB, bus) was never called — the §9.5-required audit event cannot be persisted, so the property write was not attempted. This must be wired into boot before this module is used.`,
    };
  }
  try {
    _jaa.insert('event_log', {
      uuid: event.uuid, type: 'component.property_mutated',
      payload: event, source: MODULE_ID, causedBy: null, ts: Date.now(),
    });
  } catch (e) {
    return { ok: false, error: `audit ledger write failed: ${e.message} — property NOT mutated (audit-first ordering)` };
  }

  const result = compReg.update(compId, { comp_properties: patched.comp_properties });
  if (!result.ok) {
    // Audit event for a mutation that then failed to apply — log it as
    // such rather than leaving an orphaned "success" event in the ledger.
    try {
      _jaa.insert('event_log', {
        uuid: crypto.randomUUID(), type: 'component.property_mutation_failed',
        payload: { ...event, applyError: result.errors || result.error },
        source: MODULE_ID, causedBy: event.uuid, ts: Date.now(),
      });
    } catch (_) { /* best-effort follow-up record; the failure itself is still returned below */ }
    return { ok: false, error: 'property write failed after audit event was recorded', detail: result.errors || result.error, auditEventUuid: event.uuid };
  }

  try { _bus?.emit?.('component.property_mutated', { ...event, source: MODULE_ID, ts: Date.now() }); }
  catch (e) { console.warn(`[${MODULE_ID}] bus emit failed: ${e.message}`); }

  return { ok: true, component: result.component, event };
}

module.exports = {
  init, checkTarget, mutateProperty,
  FORBIDDEN_TOP: [...FORBIDDEN_TOP], ALLOWED_PREFIX,
  MODULE_ID, VERSION,
};
